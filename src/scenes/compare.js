// Daly detector vs secondary electron multiplier, side by side with identical beams.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { IonBeam } from '../core/beam.js';
import { Chart } from '../core/chart.js';
import { section, slider, segmented, para, table, note, sources, debounce, h, readouts } from '../core/ui.js';
import { buildDaly } from '../components/daly.js';
import { buildSEM } from '../components/sem.js';
import { registerParts } from '../components/parts.js';
import {
  DALY_DEFAULTS, SEM_DEFAULTS, pulseHeightDistribution, massBiasCurve, yieldDrift,
  ionElectronYield, dalyImpactKeV, semImpactKeV, observedRate,
} from '../physics/detectors.js';
import { makeFx, MASS_PRESETS, SRC, fmtRate } from './daly.js';

const COL = { daly: '#06b6d4', sem: '#8b5cf6' };
const MASSES = [6, 10, 20, 40, 60, 88, 120, 146, 180, 208, 238];

export default {
  id: 'compare',
  title: 'Daly vs ion counter',
  group: 'Detectors',
  icon: '⇄',
  blurb: 'Same beam, two detectors: PHD, mass bias, ageing, noise',
  async create(ctx) {
    const root = new THREE.Group();
    root.name = 'Daly vs SEM';
    const ex = new Exploder();
    const mm = 1e-3;

    const D = buildDaly({ detail: 'full' });
    D.group.position.set(-0.17, 0, 0);
    root.add(D.group);
    registerParts(ex, D.parts);
    const S = buildSEM({ detail: 'full', variant: 'discrete' });
    S.group.position.set(-0.29, 0, 0);
    root.add(S.group);
    registerParts(ex, S.parts);

    // Beam: one trunk from the analyser, alternately steered into either detector
    const split = new THREE.Vector3(-0.23, 0, -0.17);
    const trunk = [new THREE.Vector3(-0.23, 0, -0.32), split];
    const bD = new IonBeam([...trunk, new THREE.Vector3(-0.17, 0, -0.06), new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(-0.17, 0, D.anchors.knob.z - 1.5 * mm)],
      { color: 0xffb24a, radius: 0.0012, particles: 26, speed: 0.07, size: 0.004 });
    const bS = new IonBeam([...trunk, new THREE.Vector3(-0.29, 0, -0.06), new THREE.Vector3(-0.29, 0, 0), new THREE.Vector3(-0.29, 0, S.anchors.dynodes[0].z - 0.8 * mm)],
      { color: 0xffb24a, radius: 0.0012, particles: 26, speed: 0.07, size: 0.004 });
    root.add(bD, bS);
    const splitObj = new THREE.Object3D();
    splitObj.position.copy(split);
    root.add(splitObj);
    ctx.label(splitObj, 'Identical ion beams', { sub: 'same species & rate to each detector', offset: [0, 0.012, 0] });
    ctx.label(D.group, 'Daly detector', { sub: 'multiplier outside vacuum', offset: [0.06, 0.05, 0.04], className: 'callout' });
    ctx.label(S.group, 'Discrete-dynode SEM', { sub: 'ions hit dynode 1', offset: [0, 0.03, 0.04], className: 'callout' });

    const fx = makeFx(root);
    const startD = new THREE.Object3D(); startD.position.set(-0.17, 0, -0.07); root.add(startD);
    const startS = new THREE.Object3D(); startS.position.set(-0.29, 0, -0.07); root.add(startS);

    const st = { mass: 238, rate: 3e5, hours: 24 };
    const pD = { ...DALY_DEFAULTS };
    const pS = { ...SEM_DEFAULTS, stageGain: 2.3 };
    pS.gain0 = Math.pow(pS.stageGain, 21);
    const cnt = { daly: 0, sem: 0, sent: 0 };
    const counter = h('div', {});
    ctx.overlay(h('div', {},
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#ffb24a' }), 'ions (same for both)'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#7fe0ff' }), 'electrons'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#fff1a6' }), 'photons (Daly)'),
      counter));

    // ── panel ──
    const intro = section('Daly vs ion counter', { icon: '⇄' });
    intro.body.append(para('Both detectors count single ions, but they multiply the signal in very different places. The Daly turns the ion into light at a −25 kV knob and multiplies <b>photoelectrons outside the vacuum</b>; the SEM multiplies <b>electrons released by the ion impact itself</b> on dynode 1.'));
    const ro = readouts([
      { id: 'eD', label: 'Daly efficiency' }, { id: 'eS', label: 'SEM efficiency' },
      { id: 'gD', label: 'Daly γ (e⁻/ion)' }, { id: 'gS', label: 'SEM γ (e⁻/ion)' },
      { id: 'dD', label: `Daly yield after ${st.hours} h` }, { id: 'dS', label: `SEM yield after ${st.hours} h` },
    ]);
    intro.body.append(ro.el);
    const ctl = section('Shared conditions', { icon: '⚙' });
    const massSeg = segmented({ options: MASS_PRESETS, value: 238, onChange: (v) => { massSl.set(v); st.mass = v; recompute(); } });
    const massSl = slider({ label: 'Ion mass', min: 6, max: 250, step: 1, value: 238, unit: 'u', onInput: (v) => { st.mass = v; massSeg.set(null); recompute(); } });
    const rateSl = slider({ label: 'Count rate (both)', min: 100, max: 3e6, log: true, value: st.rate, fmt: fmtRate, onInput: (v) => { st.rate = v; recompute(); } });
    const hSl = slider({ label: 'Running time', min: 1, max: 200, step: 1, value: st.hours, fmt: (v) => `${v.toFixed(0)} h`, onInput: (v) => { st.hours = v; recompute(); } });
    ctl.body.append(massSeg.el, massSl.el, rateSl.el, hSl.el);

    const tbl = section('Side-by-side', { icon: '☰' });
    tbl.body.append(table(['', '<span style="color:#06b6d4">Daly</span>', '<span style="color:#8b5cf6">SEM (ion counter)</span>'], [
      ['Where multiplication happens', 'PMT dynodes, <b>outside vacuum</b>, light-coupled through a window', 'Dynodes inside the analyser vacuum, in the ion path'],
      ['Ion impact', 'Al knob at −20…−35 kV → ≈30–45 keV', 'Dynode 1 at ≈−2 kV → ≈12 keV (higher with a conversion dynode)'],
      ['Do ions touch multiplying surfaces?', 'No (only the knob)', 'Yes — dynode 1 is bombarded'],
      ['Pulse-height distribution', 'Tall peak well above threshold (tens of photoelectrons)', 'Broad, near-exponential; many pulses near threshold'],
      ['Mass bias', 'Small (several e⁻/ion even for U)', 'Larger: yield ∝ ion velocity; heavy ions under-counted'],
      ['Gain stability & ageing', 'Very stable; PMT not ion-exposed', 'Gain falls with extracted charge; HV and yield need frequent re-calibration'],
      ['Dark noise', 'Negligible in positive-ion mode', 'Low (≲0.01–0.1 cps; MIC &lt;0.5 cpm)'],
      ['Dead time', '≈20–35 ns', '≈20 ns'],
      ['Practical max rate', '~10⁶ cps', '~10⁵–10⁶ cps (ageing)'],
      ['Polarity', 'Positive ions (usual configuration)', 'Positive or negative (N-TIMS)'],
      ['Typical use', 'Single-collector peak jumping of small/low-abundance beams (²³⁴U, ²³⁶U, ²⁰⁴Pb, Pb in ID-TIMS)', 'Multi-ion counting arrays; negative ions; static small-beam work'],
      ['Where on the instruments', 'Isotopx Phoenix (behind WARP), Nu TIMS (Daly + multiplier positions)', 'Thermo Triton XT (up to 8 SEMs/CDDs, central Faraday↔SEM), Nu & Isotopx MIC'],
    ]));
    const phdCard = section('Pulse-height distributions (normalised)', { icon: '▤' });
    phdCard.body.append(para('Amplitudes divided by each detector’s mean pulse so the shapes can be compared. Dashed lines: discriminator thresholds.'));
    const phdChart = new Chart(phdCard.body, { height: 190, xLabel: 'pulse height / mean pulse', yLabel: 'fraction per bin', xMin: 0, xMax: 3, legendPos: 'tr' });
    const biasCard = section('Mass bias', { icon: '⚖' });
    const biasChart = new Chart(biasCard.body, { height: 180, xLabel: 'ion mass (u)', yLabel: 'counting efficiency', yMin: 0.6, yMax: 1.02, legendPos: 'bl' });
    const driftCard = section('Yield drift at the chosen rate', { icon: '⏳' });
    const driftChart = new Chart(driftCard.body, { height: 180, xLabel: 'hours', yLabel: 'relative yield', yMin: 0.8, yMax: 1.02, legendPos: 'bl' });
    driftCard.body.append(note('Illustrative ageing model G = G₀·e^(−Q/Q₀) with Q₀ = 1 C (SEM) and 50 C (PMT). The qualitative contrast — a stable Daly versus a drifting SEM yield — is the documented behaviour; absolute numbers depend on detector, HV and threshold.', 'warn'));
    const src = section('Sources', { icon: '📄', open: false });
    src.body.append(sources([SRC.daly, SRC.nu, SRC.phoenix, SRC.mic, SRC.triton]));

    const recompute = debounce(() => {
      const gD = ionElectronYield(st.mass, dalyImpactKeV(pD), pD.yieldC) * pD.collectFrac;
      const gS = ionElectronYield(st.mass, semImpactKeV(pS), pS.yieldC);
      ro.gD.set(gD.toFixed(2)); ro.gS.set(gS.toFixed(2));
      const a = pulseHeightDistribution('daly', st.mass, pD, { n: 16000, bins: 60, maxAmp: 200 });
      const b = pulseHeightDistribution('sem', st.mass, pS, { n: 16000, bins: 60, maxAmp: 20 });
      ro.eD.set(`${(a.efficiency * 100).toFixed(1)} %`, 'good');
      ro.eS.set(`${(b.efficiency * 100).toFixed(1)} %`, b.efficiency < 0.9 ? 'warn' : '');
      const norm = (res) => {
        const pos = Array.from(res.amps).filter((v) => v > 0);
        const mean = pos.reduce((s, v) => s + v, 0) / pos.length;
        const bins = 40, top = 3, hist = new Array(bins).fill(0);
        for (const v of pos) { const k = Math.floor((v / mean / top) * bins); if (k < bins) hist[k]++; }
        return { x: hist.map((_, i) => ((i + 0.5) / bins) * top), y: hist.map((c) => c / res.amps.length), mean };
      };
      const nA = norm(a), nB = norm(b);
      phdChart.setMarks([
        { x: pD.threshold / nA.mean, color: COL.daly, dash: [5, 4] },
        { x: pS.threshold / nB.mean, color: COL.sem, dash: [5, 4] },
      ]);
      phdChart.setSeries([
        { name: 'Daly', x: nA.x, y: nA.y, color: COL.daly, width: 2.2, fill: true },
        { name: 'SEM', x: nB.x, y: nB.y, color: COL.sem, width: 2.2, fill: true },
      ]);
      const mD = massBiasCurve('daly', pD, MASSES, 88, 6000), mS = massBiasCurve('sem', pS, MASSES, 88, 6000);
      biasChart.setMarks([{ x: st.mass, color: '#ef4444', dash: [4, 4] }]);
      biasChart.setSeries([
        { name: 'Daly', x: MASSES, y: mD.map((r) => r.eff), color: COL.daly, width: 2.2 },
        { name: 'SEM', x: MASSES, y: mS.map((r) => r.eff), color: COL.sem, width: 2.2 },
      ]);
      const dD = yieldDrift('daly', st.mass, pD, { rate: st.rate, hours: st.hours, steps: 16 });
      const dS = yieldDrift('sem', st.mass, pS, { rate: st.rate, hours: st.hours, steps: 16 });
      driftChart.setSeries([
        { name: 'Daly', x: dD.h, y: dD.yieldRel, color: COL.daly, width: 2.2 },
        { name: 'SEM', x: dS.h, y: dS.yieldRel, color: COL.sem, width: 2.2 },
      ]);
      const fD = dD.yieldRel.at(-1), fS = dS.yieldRel.at(-1);
      ro.map.dD.set(`${(fD * 100).toFixed(2)} %`, 'good');
      ro.map.dS.set(`${(fS * 100).toFixed(2)} %`, fS < 0.98 ? 'warn' : '');
      intro.body.querySelectorAll('.ro .k')[4].textContent = `Daly yield after ${st.hours} h`;
      intro.body.querySelectorAll('.ro .k')[5].textContent = `SEM yield after ${st.hours} h`;
      const loss = 1 - observedRate(st.rate, 20e-9) / st.rate;
      counter.dataset.loss = loss;
    }, 80);
    recompute();

    // ── synchronized events: the same ion species goes to both ──
    function event() {
      const rng = fx.rng;
      cnt.sent++;
      // Daly
      fx.fly(fx.ions, startD, D.markers.knob, 0.8, {
        onArrive: () => {
          const g = ionElectronYield(st.mass, dalyImpactKeV(pD), pD.yieldC) * pD.collectFrac;
          const n = Math.min(8, rng.poisson(g));
          if (!n) { show(); return; }
          let first = true;
          for (let i = 0; i < n; i++) {
            fx.fly(fx.elec, D.markers.knob, D.markers.scint, 0.5, {
              bulge: new THREE.Vector3(-0.004, rng.normal(0, 0.004), -0.01), jitterTo: 0.004,
              onArrive: () => {
                for (let k = 0; k < 2; k++) fx.fly(fx.phot, D.markers.scint, D.markers.pmtCathode, 0.28, { jitterTo: 0.004 });
                if (first) { first = false; setTimeout(() => fx.cascade(D.markers.pmtDynodes, D.markers.pmtCathode, 2, 1.5, 18, 0.12, () => { cnt.daly++; show(); }), 280); }
              },
            });
          }
        },
      });
      // SEM
      fx.fly(fx.ions, startS, S.markers.dynodes[0], 0.8, {
        onArrive: () => {
          const g = ionElectronYield(st.mass, semImpactKeV(pS), pS.yieldC);
          const n1 = Math.min(4, rng.poisson(g));
          if (!n1) { show(); return; }
          fx.cascade([...S.markers.dynodes.slice(1), S.markers.anode], S.markers.dynodes[0], n1, 1.6, 22, 0.075, () => { cnt.sem++; show(); }, 0.0006);
        },
      });
    }
    function show() {
      counter.innerHTML = `ions sent: <b>${cnt.sent}</b><br>Daly counted: <b>${cnt.daly}</b> · SEM counted: <b>${cnt.sem}</b>`;
    }
    let tNext = 0.3;

    return {
      root, exploder: ex, scale: 0.4,
      camera: { position: [-0.24, 0.3, -0.47], target: [-0.135, -0.02, 0.04] },
      panel: [intro.el, ctl.el, tbl.el, phdCard.el, biasCard.el, driftCard.el, src.el],
      onExplode(t) { const f = Math.max(0, 1 - 2.5 * t); bD.setIntensity(f); bS.setIntensity(f); },
      update(dt) {
        tNext -= dt;
        if (tNext <= 0) { event(); tNext = 1.4 + fx.rng.uniform(0, 0.4); }
        fx.update(dt);
      },
      dispose() { [phdChart, biasChart, driftChart].forEach((c) => c.dispose()); },
    };
  },
};
