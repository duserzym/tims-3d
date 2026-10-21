// Secondary electron multiplier ("ion counter") scene: explodable discrete-dynode SEM or
// conversion-dynode counter, animated electron avalanche, PHD, mass bias, ageing, dead time.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { IonBeam } from '../core/beam.js';
import { Chart } from '../core/chart.js';
import { section, slider, segmented, readouts, note, para, sources, debounce, h } from '../core/ui.js';
import { buildSEM } from '../components/sem.js';
import { registerParts } from '../components/parts.js';
import {
  SEM_DEFAULTS, semImpactKeV, ionElectronYield, pulseHeightDistribution, plateauCurve,
  observedRate, deadTimeCorrect, massBiasCurve, yieldDrift,
} from '../physics/detectors.js';
import { makeFx, removeLabels, MASS_PRESETS, SRC, fmtRate } from './daly.js';

const N_DYN = 21;
const BIAS_MASSES = [6, 10, 20, 40, 60, 88, 120, 146, 180, 208, 238];

export default {
  id: 'ionCounter',
  title: 'Ion counter (SEM)',
  group: 'Detectors',
  icon: '⋰',
  blurb: 'Discrete-dynode electron multiplier: avalanche, PHD, mass bias, ageing',
  async create(ctx) {
    const root = new THREE.Group();
    root.name = 'SEM scene';
    const ex = new Exploder();
    const mm = 1e-3;
    const st = { variant: 'discrete', mass: 238, rate: 2e5, hours: 48 };
    const p = { ...SEM_DEFAULTS, stageGain: 2.3 };

    let S = null, beam = null, convMarker = null;
    const fx = makeFx(root, { scale: 0.7 });
    const startMarker = new THREE.Object3D();
    startMarker.position.set(0, 0, -0.07);
    root.add(startMarker);

    function build() {
      if (S) { removeLabels(S.group); root.remove(S.group); }
      if (beam) { root.remove(beam); beam.dispose(); }
      fx.clear();
      ex.clear();
      S = buildSEM({ detail: 'full', variant: st.variant });
      root.add(S.group);
      registerParts(ex, S.parts);
      const conv = st.variant === 'conversion';
      const target = conv ? S.anchors.conversion : S.anchors.dynodes[0];
      beam = new IonBeam([new THREE.Vector3(0, 0, -0.11), new THREE.Vector3(0, 0, 0), new THREE.Vector3(target.x * 0.5, 0, target.z - 0.8 * mm)],
        { color: 0xffb24a, radius: 0.0007, particles: 18, speed: 0.04, size: 0.0026 });
      root.add(beam);
      convMarker = null;
      if (conv) {
        const cd = S.parts.find((pp) => pp.name.startsWith('Conversion')).obj;
        convMarker = new THREE.Object3D();
        convMarker.position.copy(S.anchors.conversion);
        cd.add(convMarker);
        ctx.label(cd, 'Conversion dynode', { sub: 'ions → electrons', offset: [-0.004, 0.012, 0.016] });
      }
      const can = S.parts.find((pp) => pp.name === 'Shield can').obj;
      const d1 = S.parts.find((pp) => pp.name.startsWith('Dynode 1'))?.obj;
      const res = S.parts.find((pp) => pp.name.startsWith('Resistor')).obj;
      const an = S.parts.find((pp) => pp.name === 'Anode').obj;
      const ent = S.parts.find((pp) => pp.name.startsWith('Entrance')).obj;
      ctx.label(ent, 'Ion entrance', { sub: 'ions travel +z', offset: [0, 0.014, 0] });
      if (d1 && !conv) ctx.label(d1, 'Dynode 1', { sub: 'direct ion impact', offset: [0, -0.009, 0.008] });
      ctx.label(res, 'Divider chain', { offset: conv ? [0, 0.009, 0.035] : [0.004, 0.009, 0.04] });
      ctx.label(an, 'Anode → counter', { offset: [0, -0.007, 0] });
      ctx.label(can, 'Shield can', { offset: [0, 0.01, 0] });
      ctx.app.applyXray?.();
      ctx.app.applyBeams?.();
      ex.set(ctx.app.state.explode ?? 0);
      beam.setIntensity(Math.max(0, 1 - 2.5 * (ctx.app.state.explode ?? 0)));
    }
    build();

    // ── panel ──
    let counts = 0;
    const counter = h('div', {}, '');
    ctx.overlay(h('div', {},
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#ffb24a' }), 'ion'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#7fe0ff' }), 'electron avalanche (display capped)'),
      counter));

    const intro = section('Secondary electron multiplier', { icon: '⋰' });
    intro.body.append(para('In a <b>discrete-dynode SEM</b> the ion strikes the <b>first dynode directly</b>; each electron then hits the next dynode and releases δ≈2–3 more. After ~21 stages one ion becomes a ~10⁷–10⁸-electron pulse at the anode. A <b>conversion-dynode</b> variant (Isotopx MIC-style) puts an off-axis converter at several kV in front of a multiplier mounted at 90°.'));
    const ro = readouts([
      { id: 'E', label: 'Ion impact energy' }, { id: 'g', label: 'Ion→e⁻ yield γ' },
      { id: 'p0', label: 'P(no electron) = e^−γ' }, { id: 'eff', label: 'Counting efficiency' },
      { id: 'G', label: `Gain δ^${N_DYN}` }, { id: 'Q', label: 'Anode charge / hour' },
      { id: 'age', label: 'Gain after ageing' }, { id: 'dt', label: 'Dead-time loss @ rate' },
    ]);
    intro.body.append(ro.el);

    const ctl = section('Controls', { icon: '⚙' });
    const varSeg = segmented({
      options: [{ value: 'discrete', label: 'Discrete dynode (direct)' }, { value: 'conversion', label: 'Conversion dynode + 90°' }],
      value: st.variant,
      onChange: (v) => { st.variant = v; p.firstDynodeKV = v === 'conversion' ? 8 : 2; v1Sl.set(p.firstDynodeKV); build(); recompute(); },
    });
    const massSeg = segmented({ options: MASS_PRESETS, value: 238, onChange: (v) => { massSl.set(v); st.mass = v; recompute(); } });
    const massSl = slider({ label: 'Ion mass', min: 6, max: 250, step: 1, value: 238, unit: 'u', onInput: (v) => { st.mass = v; massSeg.set(null); recompute(); } });
    const v1Sl = slider({ label: 'First-dynode / converter voltage', min: 1, max: 12, step: 0.1, value: p.firstDynodeKV, fmt: (v) => `−${v.toFixed(1)} kV`, onInput: (v) => { p.firstDynodeKV = v; recompute(); } });
    const dSl = slider({ label: 'Secondary yield per stage δ (set by HV)', min: 1.8, max: 3.2, step: 0.01, value: p.stageGain, fmt: (v) => `${v.toFixed(2)}`, onInput: (v) => { p.stageGain = v; recompute(); } });
    const thrSl = slider({ label: 'Discriminator threshold', min: 0.02, max: 1.5, step: 0.01, value: p.threshold, fmt: (v) => `${v.toFixed(2)} × single-e⁻ pulse`, onInput: (v) => { p.threshold = v; recompute(); } });
    const rateSl = slider({ label: 'Count rate', min: 1, max: 1e7, log: true, value: st.rate, fmt: fmtRate, onInput: (v) => { st.rate = v; recompute(); } });
    const hSl = slider({ label: 'Running time for ageing', min: 1, max: 500, step: 1, value: st.hours, fmt: (v) => `${v.toFixed(0)} h`, onInput: (v) => { st.hours = v; recompute(); } });
    const dtSl = slider({ label: 'Dead time τ', min: 5, max: 60, step: 1, value: p.deadTime * 1e9, fmt: (v) => `${v.toFixed(0)} ns`, onInput: (v) => { p.deadTime = v * 1e-9; recompute(); } });
    ctl.body.append(varSeg.el, massSeg.el, massSl.el, v1Sl.el, dSl.el, thrSl.el, rateSl.el, hSl.el, dtSl.el);

    const phdCard = section('Pulse-height distribution', { icon: '▤' });
    phdCard.body.append(para('Few first-generation electrons + Pólya cascade statistics ⇒ a broad, near-exponential PHD with many small pulses close to the discriminator. Heavier ions (lower velocity) shift it further down.'));
    const phdChart = new Chart(phdCard.body, { height: 190, xLabel: 'pulse height (× mean single-electron pulse)', yLabel: 'ions / bin' });
    const platChart = new Chart(phdCard.body, { height: 140, xLabel: 'threshold', yLabel: 'efficiency', yMin: 0, yMax: 1.02, legend: false });
    const biasCard = section('Mass bias (efficiency vs mass)', { icon: '⚖' });
    const biasChart = new Chart(biasCard.body, { height: 180, xLabel: 'ion mass (u)', yLabel: 'efficiency', yMin: 0.5, yMax: 1.02 });
    biasCard.body.append(para('Kinetic electron emission scales with ion velocity ∝ √(E/m): at a fixed impact energy U⁺ produces fewer electrons than Li⁺, so the SEM under-counts heavy ions. This mass bias must be calibrated with standards (or the beam crossed over to a Faraday).'));
    const ageCard = section('Ageing & yield drift', { icon: '⏳' });
    const ageChart = new Chart(ageCard.body, { height: 180, xLabel: 'hours at selected rate', yLabel: 'relative', yMin: 0.4, yMax: 1.05, legendPos: 'bl' });
    ageCard.body.append(para('Dynode surfaces degrade with extracted charge Q (illustrative model G = G₀·e^(−Q/Q₀), Q₀ ≈ 1 C). Gain loss pushes small pulses below threshold → the <b>yield</b> drifts, so HV must be raised and the SEM/Faraday gain re-measured frequently. Keep SEM rates ≲10⁵–10⁶ cps.'));
    const dtCard = section('Dead time', { icon: '⏱', open: false });
    const dtChart = new Chart(dtCard.body, { height: 170, xLabel: 'true rate (cps)', yLabel: 'observed / true', xLog: true, yMin: 0.5, yMax: 1.01 });
    const info = section('Notes & sources', { icon: 'ℹ', open: false });
    info.body.append(
      h('ul', {},
        h('li', { html: 'Thermo Triton XT: up to 8 discrete-dynode SEMs (or CDD counters) for multi-ion counting; central cup switchable Faraday ↔ SEM; optional RPQ filter for abundance sensitivity &lt;2×10⁻⁸.' }),
        h('li', { html: 'Isotopx multiple ion counting: conversion-dynode counters with a 90° multiplier, dark noise &lt;0.5 cpm, ~20 ns dead time, linearity &lt;0.3 % to 3×10⁵ cps.' }),
        h('li', { html: 'Unlike a Daly, an SEM also counts <b>negative ions</b> (N-TIMS: OsO₃⁻, ReO₄⁻, BO₂⁻) by biasing the first dynode positive.' })),
      note('Yield coefficient, first-dynode voltage, Q₀ and dark rate are <b>illustrative</b> constants that reproduce documented qualitative behaviour.', 'warn'),
      sources([SRC.mic, SRC.triton, SRC.nu]));

    const recompute = debounce(() => {
      const E = semImpactKeV(p);
      const g = ionElectronYield(st.mass, E, p.yieldC);
      ro.E.set(`${E.toFixed(1)} keV`);
      ro.g.set(`${g.toFixed(2)} e⁻/ion`);
      ro.p0.set(`${(Math.exp(-g) * 100).toFixed(1)} %`, Math.exp(-g) > 0.1 ? 'warn' : '');
      const gain = Math.pow(p.stageGain, N_DYN);
      p.gain0 = gain;
      ro.G.set(gain.toExponential(1));
      const qh = st.rate * 3600 * gain * 1.602e-19;
      ro.Q.set(`${qh.toExponential(2)} C/h`);
      const agedG = Math.exp(-(qh * st.hours) / p.Q0);
      ro.age.set(`${(agedG * 100).toFixed(0)} % of new`, agedG < 0.7 ? 'bad' : agedG < 0.9 ? 'warn' : 'good');
      const loss = 1 - observedRate(st.rate, p.deadTime) / st.rate;
      ro.dt.set(`${(loss * 100).toPrecision(2)} %`, loss > 0.02 ? 'warn' : 'good');

      const top = Math.max(5, Math.ceil(g * 4));
      const phd = pulseHeightDistribution('sem', st.mass, p, { n: 20000, bins: 60, maxAmp: top });
      const x = phd.hist.map((_, i) => i * phd.binWidth);
      phd.hist[phd.hist.length - 1] = NaN; // last bin holds the clamped overflow — hide it
      phdChart.setOptions({ xMin: 0, xMax: top });
      phdChart.setMarks([{ x: p.threshold, color: '#ef4444', label: 'threshold', dash: [5, 4] }]);
      phdChart.setSeries([{ name: `m = ${st.mass} u (${(phd.missedNoElectron * 100).toFixed(1)} % give no e⁻)`, type: 'bar', x, y: phd.hist, color: '#8b5cf6', barWidth: phd.binWidth }]);
      ro.eff.set(`${(phd.efficiency * 100).toFixed(1)} %`, phd.efficiency > 0.95 ? 'good' : phd.efficiency > 0.85 ? '' : 'warn');
      const th = Array.from({ length: 41 }, (_, i) => (i / 40) * 1.5);
      platChart.setMarks([{ x: p.threshold, color: '#ef4444', dash: [5, 4] }]);
      platChart.setSeries([{ x: th, y: plateauCurve(phd.amps, th), color: '#8b5cf6', width: 2 }]);

      const mb = massBiasCurve('sem', p, BIAS_MASSES, 88, 8000);
      biasChart.setMarks([{ x: st.mass, color: '#ef4444', dash: [4, 4] }]);
      biasChart.setSeries([{ name: 'SEM efficiency', x: mb.map((r) => r.m), y: mb.map((r) => r.eff), color: '#8b5cf6', width: 2 }, { name: '', type: 'scatter', x: mb.map((r) => r.m), y: mb.map((r) => r.eff), color: '#8b5cf6', r: 2.5 }]);

      const dr = yieldDrift('sem', st.mass, p, { rate: st.rate, hours: st.hours, steps: 20 });
      ageChart.setSeries([
        { name: 'relative gain', x: dr.h, y: dr.gainRel, color: '#f59e0b', width: 2 },
        { name: 'relative yield (counts)', x: dr.h, y: dr.yieldRel, color: '#8b5cf6', width: 2 },
      ]);
      const Nn = Array.from({ length: 61 }, (_, i) => Math.pow(10, 1 + (i / 60) * 7));
      dtChart.setMarks([{ x: st.rate, color: '#ef4444', dash: [4, 4] }]);
      dtChart.setSeries([
        { name: 'observed / true', x: Nn, y: Nn.map((n) => observedRate(n, p.deadTime) / n), color: '#f59e0b', width: 2 },
        { name: 'after τ correction', x: Nn, y: Nn.map((n) => deadTimeCorrect(observedRate(n, p.deadTime), p.deadTime) / n), color: '#10b981', width: 2, dash: [3, 3] },
      ]);
    }, 80);
    recompute();

    // ── animation ──
    let tNext = 0.2;
    function event() {
      const conv = st.variant === 'conversion';
      const tgt = conv ? convMarker : S.markers.dynodes[0];
      fx.fly(fx.ions, startMarker, tgt, 0.8, {
        onArrive: () => {
          const g = ionElectronYield(st.mass, semImpactKeV(p), p.yieldC);
          const n1 = Math.min(5, fx.rng.poisson(g));
          if (!n1) return; // ion lost: no first-generation electron
          const dyn = conv ? S.markers.dynodes : S.markers.dynodes.slice(1);
          const start = conv ? convMarker : S.markers.dynodes[0];
          fx.cascade([...dyn, S.markers.anode], start, n1, Math.min(2, p.stageGain * 0.75), 26, 0.1, () => {
            counts++; counter.innerHTML = `<b>${counts}</b> ions counted`;
          }, 0.0006);
        },
      });
    }

    return {
      root, exploder: ex, scale: 0.14,
      camera: { position: [0.13, 0.1, -0.11], target: [0.004, 0, 0.035] },
      panel: [intro.el, ctl.el, phdCard.el, biasCard.el, ageCard.el, dtCard.el, info.el],
      onExplode(t) { beam?.setIntensity(Math.max(0, 1 - 2.5 * t)); },
      update(dt) {
        tNext -= dt;
        if (tNext <= 0) { event(); tNext = 1.1 + fx.rng.uniform(0, 0.5); }
        fx.update(dt);
      },
      dispose() { [phdChart, platChart, biasChart, ageChart, dtChart].forEach((c) => c.dispose()); },
    };
  },
};
