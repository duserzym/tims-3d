// Daly detector scene: explodable model + ion → electron → photon → photoelectron cascade,
// pulse-height distribution, discriminator plateau and dead-time behaviour.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { IonBeam, Sparks } from '../core/beam.js';
import { Chart } from '../core/chart.js';
import { section, slider, segmented, readouts, note, para, sources, debounce, h } from '../core/ui.js';
import { buildDaly } from '../components/daly.js';
import { registerParts } from '../components/parts.js';
import {
  DALY_DEFAULTS, dalyImpactKeV, ionElectronYield, pulseHeightDistribution, plateauCurve,
  observedRate, deadTimeCorrect,
} from '../physics/detectors.js';
import { RNG } from '../physics/rng.js';

export const MASS_PRESETS = [
  { value: 7, label: '⁷Li' }, { value: 88, label: '⁸⁸Sr' }, { value: 146, label: '¹⁴⁶Nd' },
  { value: 208, label: '²⁰⁸Pb' }, { value: 238, label: '²³⁸U' },
];

export const SRC = {
  nu: { label: 'Nu TIMS brochure (BRO4.91)', url: 'https://www.nu-ins.com/-/media/ameteknuinstruments/files/products/brochures/tims_2019.pdf' },
  phoenix: { label: 'Isotopx Phoenix', url: 'https://www.isotopx.com/products/phoenix' },
  daly: { label: 'Daly (1960) Rev. Sci. Instrum. 31, 264', url: 'https://doi.org/10.1063/1.1716953' },
  mic: { label: 'Isotopx multiple ion counting note', url: 'https://www.isotopx.com/resources/ultra-low-noise-multiple-isotopx-ion-counting-iic-and-faraday-detectors-on-phoenix-tims' },
  triton: { label: 'Thermo Triton XT brochure', url: 'https://documents.thermofisher.com/TFS-Assets/CMD/brochures/br-30537-triton-xt-tims-br30537-en.pdf' },
};

/**
 * Particle effects helper shared by the detector scenes. Particles follow quadratic
 * Bézier paths between *live* anchor objects, so the cascade keeps working while the
 * assembly is exploded.
 */
export function makeFx(root, { scale = 1 } = {}) {
  const ions = new Sparks({ color: 0xffb24a, size: 0.0042 * scale, max: 120 });
  const elec = new Sparks({ color: 0x7fe0ff, size: 0.0026 * scale, max: 700 });
  const phot = new Sparks({ color: 0xfff1a6, size: 0.0032 * scale, max: 300 });
  root.add(ions, elec, phot);
  const wp = (o) => (o.isVector3 ? o.clone() : o.getWorldPosition(new THREE.Vector3()));
  const rng = new RNG(99);
  function fly(sys, from, to, dur, { bulge = null, jitterTo = 0, onArrive = null } = {}) {
    const a = wp(from);
    const jit = new THREE.Vector3(rng.normal(0, jitterTo), rng.normal(0, jitterTo), rng.normal(0, jitterTo));
    const bul = bulge ? bulge.clone() : new THREE.Vector3();
    sys.spawn(a, new THREE.Vector3(), dur, (p, v, age) => {
      const b = wp(to).add(jit);
      const u = Math.min(1, age / dur);
      const c = a.clone().lerp(b, 0.5).add(bul);
      // quadratic Bézier
      p.set(0, 0, 0).addScaledVector(a, (1 - u) * (1 - u)).addScaledVector(c, 2 * u * (1 - u)).addScaledVector(b, u * u);
    }, onArrive ? () => onArrive() : null);
  }
  /** Electron hop down a dynode chain, multiplying (capped) at each stage. */
  function cascade(markers, startFrom, count, mult, cap, hopDur, onDone, jitter = 0.0008) {
    const hop = (k, n, from) => {
      if (k >= markers.length) { onDone && onDone(); return; }
      let fired = false;
      for (let i = 0; i < n; i++) {
        fly(elec, from, markers[k], hopDur, {
          jitterTo: jitter,
          onArrive: () => { if (!fired) { fired = true; hop(k + 1, Math.min(cap, Math.max(1, Math.round(n * mult))), markers[k]); } },
        });
      }
    };
    hop(0, count, startFrom);
  }
  return {
    ions, elec, phot, fly, cascade, rng,
    update(dt) { ions.update(dt); elec.update(dt); phot.update(dt); },
    clear() { ions.clear(); elec.clear(); phot.clear(); },
  };
}

/** Remove CSS2D label elements under an object (labels are not auto-removed for nested children). */
export function removeLabels(obj) {
  obj.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
}

export default {
  id: 'daly',
  title: 'Daly detector',
  group: 'Detectors',
  icon: '◉',
  blurb: 'Ion → knob → electrons → scintillator → PMT; PHD & dead time',
  async create(ctx) {
    const root = new THREE.Group();
    root.name = 'Daly scene';
    const ex = new Exploder();
    const D = buildDaly({ detail: 'full' });
    root.add(D.group);
    registerParts(ex, D.parts);
    const mm = 1e-3;

    // labels
    const byName = (s) => D.parts.find((p) => p.name.startsWith(s))?.obj;
    ctx.label(byName('Daly knob'), 'Knob', { sub: '−25 kV conversion dynode', offset: [0, -0.012, 0.05] });
    ctx.label(byName('Aluminised'), 'Scintillator', { sub: 'ground, in vacuum', offset: [0.036, 0.016, 0.046] });
    ctx.label(byName('Vacuum window'), 'Quartz window', { sub: 'vacuum | air', offset: [0.04, -0.022, 0.046] });
    ctx.label(byName('Photomultiplier'), 'Photomultiplier', { sub: 'outside vacuum', offset: [0.085, 0.018, 0.046] });
    ctx.label(byName('Entrance aperture'), 'Ion entrance', { sub: 'ions travel +z', offset: [0, 0.022, 0] });
    ctx.label(byName('PMT base'), 'Divider + output', { offset: [0.142, 0.022, 0.046] });

    // beam (to the knob face)
    const beam = new IonBeam([
      new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, D.anchors.knob.z - 1.5 * mm),
    ], { color: 0xffb24a, radius: 0.0011, particles: 24, speed: 0.06, size: 0.0035 });
    root.add(beam);

    const fx = makeFx(root);
    const startMarker = new THREE.Object3D();
    startMarker.position.set(0, 0, -0.12);
    root.add(startMarker);

    // ── state & panel ──
    const p = { ...DALY_DEFAULTS };
    const st = { mass: 238, rate: 1e5 };
    let counts = 0;
    const counter = h('div', {}, '');
    const overlay = h('div', {},
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#ffb24a' }), 'ion (positive)'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#7fe0ff' }), 'electrons'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#fff1a6' }), 'scintillation photons'),
      counter);
    ctx.overlay(overlay);

    const intro = section('Daly detector', { icon: '◉' });
    intro.body.append(para('A <b>Daly detector</b> converts each ion into a flash of light so the electron multiplier (a photomultiplier) can sit <b>outside the vacuum</b>. Ions hit a polished Al <b>knob</b> at −20…−35 kV; the ejected secondary electrons are accelerated to a grounded <b>scintillator</b>; photons cross a quartz <b>window</b> to the <b>PMT</b>.'));
    const ro = readouts([
      { id: 'E', label: 'Ion impact energy' }, { id: 'g', label: 'Mean SE yield γ' },
      { id: 'pe', label: 'Mean pulse (photoelectrons)' }, { id: 'eff', label: 'Counting efficiency' },
      { id: 'miss', label: 'Ions with no SE' }, { id: 'dark', label: 'Dark rate' },
      { id: 'dt', label: 'Dead-time loss @ rate' }, { id: 'pmt', label: 'PMT gain (typ.)' },
    ]);
    intro.body.append(ro.el);

    const ctl = section('Controls', { icon: '⚙' });
    const massSeg = segmented({ options: MASS_PRESETS, value: 238, onChange: (v) => { massSl.set(v); st.mass = v; recompute(); } });
    const massSl = slider({ label: 'Ion mass', min: 6, max: 250, step: 1, value: 238, unit: 'u', onInput: (v) => { st.mass = v; massSeg.set(null); recompute(); } });
    const knobSl = slider({ label: 'Knob voltage', min: 10, max: 35, step: 0.5, value: p.knobKV, fmt: (v) => `−${v.toFixed(1)} kV`, onInput: (v) => { p.knobKV = v; recompute(); } });
    const accSl = slider({ label: 'Acceleration voltage', min: 4, max: 10, step: 0.1, value: p.accelKV, fmt: (v) => `${v.toFixed(1)} kV`, onInput: (v) => { p.accelKV = v; recompute(); } });
    const thrSl = slider({ label: 'Discriminator threshold', min: 0.5, max: 40, step: 0.5, value: p.threshold, fmt: (v) => `${v.toFixed(1)} pe`, onInput: (v) => { p.threshold = v; recompute(); } });
    const rateSl = slider({ label: 'True count rate', min: 1, max: 1e7, log: true, value: st.rate, fmt: (v) => `${fmtRate(v)}`, onInput: (v) => { st.rate = v; recomputeDT(); } });
    const dtSl = slider({ label: 'Dead time τ', min: 5, max: 60, step: 1, value: p.deadTime * 1e9, fmt: (v) => `${v.toFixed(0)} ns`, onInput: (v) => { p.deadTime = v * 1e-9; recomputeDT(); } });
    ctl.body.append(massSeg.el, massSl.el, knobSl.el, accSl.el, thrSl.el, rateSl.el, dtSl.el);

    const phdCard = section('Pulse-height distribution', { icon: '▤' });
    phdCard.body.append(para('Monte-Carlo of 20 000 ions: Poisson SE emission → Poisson photoelectrons → PMT gain spread. The peak sits far above the discriminator, so the count rate is insensitive to small gain or threshold changes.'));
    const phdChart = new Chart(phdCard.body, { height: 190, xLabel: 'pulse height (photoelectrons)', yLabel: 'ions / bin', legend: true });
    const platCard = section('Discriminator plateau', { icon: '⌇' });
    const platChart = new Chart(platCard.body, { height: 170, xLabel: 'threshold (photoelectrons)', yLabel: 'efficiency', yMin: 0, yMax: 1.02, legend: false });
    platCard.body.append(para('A wide, flat plateau means the threshold can be set once and forgotten — the hallmark of a Daly detector.'));
    const dtCard = section('Dead time & linearity', { icon: '⏱' });
    const dtChart = new Chart(dtCard.body, { height: 180, xLabel: 'true rate (cps)', yLabel: 'rate (cps)', xLog: true, yLog: true, legendPos: 'tl' });
    dtCard.body.append(para('Non-paralysable model: n = N/(1+Nτ); correction N = n/(1−nτ). At 1 Mcps a 30 ns dead time already loses ≈3 %, so τ must be calibrated (e.g. with isotope standards at several intensities).'));

    const how = section('Why a Daly?', { icon: 'ℹ', open: false });
    how.body.append(
      h('ul', {},
        h('li', { html: '<b>Ions never touch the multiplier</b>: the PMT sees only light, so its gain does not age with ion dose (contrast: SEM first dynode).' }),
        h('li', { html: '<b>High impact energy</b> (acceleration + knob ≈ 30–45 keV) gives several electrons per ion even for U → efficiency ≈ 90–100 % and small mass bias.' }),
        h('li', { html: '<b>Negligible dark noise</b> in positive-ion mode (Nu: “little to no noise”); ideal for small samples and low-abundance isotopes (²³⁴U, ²³⁶U, ²⁰⁴Pb).' }),
        h('li', { html: '<b>Limitations</b>: positive ions only in the common configuration (negative ions are usually counted on an SEM); dead time and ultimate count rate limit use to ≲10⁶ cps; Faradays (or ATONA) take over for larger beams.' })),
      note('Constants (SE yield coefficient, photoelectrons per electron, PMT gain spread, dark rate) are <b>illustrative</b> and chosen to reproduce documented behaviour; calibrate against your instrument.', 'warn'));

    const src = section('Sources', { icon: '📄', open: false });
    src.body.append(sources([SRC.daly, SRC.nu, SRC.phoenix, SRC.mic]));

    let phd = null;
    function recompute() {
      const E = dalyImpactKeV(p);
      const g = ionElectronYield(st.mass, E, p.yieldC);
      ro.E.set(`${E.toFixed(1)} keV`);
      ro.g.set(`${(g * p.collectFrac).toFixed(2)} e⁻/ion`);
      ro.pmt.set('≈10⁶');
      ro.dark.set('≲0.01 cps', 'good');
      runMC();
    }
    const runMC = debounce(() => {
      const mean = ionElectronYield(st.mass, dalyImpactKeV(p), p.yieldC) * p.collectFrac * p.pePerElectron;
      const top = Math.max(40, Math.ceil(mean * 2.6 / 10) * 10);
      phd = pulseHeightDistribution('daly', st.mass, p, { n: 20000, bins: 60, maxAmp: top });
      const x = phd.hist.map((_, i) => (i + 0.5) * phd.binWidth);
      phdChart.setOptions({ xMin: 0, xMax: top });
      phdChart.setMarks([{ x: p.threshold, color: '#ef4444', label: 'threshold', dash: [5, 4] }]);
      phdChart.setSeries([{ name: `m = ${st.mass} u`, type: 'bar', x: x.map((v) => v - phd.binWidth / 2), y: phd.hist, color: '#06b6d4', barWidth: phd.binWidth }]);
      ro.pe.set(`${mean.toFixed(1)} pe`);
      ro.eff.set(`${(phd.efficiency * 100).toFixed(1)} %`, phd.efficiency > 0.95 ? 'good' : phd.efficiency > 0.85 ? '' : 'warn');
      ro.miss.set(`${(phd.missedNoElectron * 100).toFixed(2)} %`);
      const th = Array.from({ length: 41 }, (_, i) => (i / 40) * top * 0.75);
      const pl = plateauCurve(phd.amps, th);
      platChart.setMarks([{ x: p.threshold, color: '#ef4444', label: 'set', dash: [5, 4] }]);
      platChart.setSeries([{ x: th, y: pl, color: '#3b82f6', width: 2 }]);
      recomputeDT();
    }, 70);
    function recomputeDT() {
      const tau = p.deadTime;
      const N = Array.from({ length: 61 }, (_, i) => Math.pow(10, 1 + (i / 60) * 7));
      const obs = N.map((n) => observedRate(n, tau));
      dtChart.setMarks([{ x: st.rate, color: '#ef4444', dash: [4, 4] }]);
      dtChart.setSeries([
        { name: 'ideal (N)', x: N, y: N, color: '#94a3b8', dash: [5, 4], width: 1.2 },
        { name: 'observed n', x: N, y: obs, color: '#f59e0b', width: 2 },
        { name: 'corrected', x: N, y: obs.map((o) => deadTimeCorrect(o, tau)), color: '#10b981', dash: [2, 3], width: 2 },
      ]);
      const loss = 1 - observedRate(st.rate, tau) / st.rate;
      ro.dt.set(`${(loss * 100).toPrecision(2)} %`, loss > 0.02 ? 'warn' : 'good');
    }
    recompute();

    // ── animation: discrete ion events ──
    let tNext = 0.3;
    const scint = D.parts.find((pp) => pp.name.startsWith('Aluminised')).obj;
    const scintMeshes = [];
    scint.traverse((o) => { if (o.isMesh && o.material.name.includes('scintillator')) scintMeshes.push(o); });
    const scMat = scintMeshes[0]?.material.clone();
    if (scMat) scintMeshes.forEach((m) => { m.material = scMat; });
    let flash = 0;
    function event() {
      const rng = fx.rng;
      fx.fly(fx.ions, startMarker, D.markers.knob, 0.9, {
        onArrive: () => {
          const g = ionElectronYield(st.mass, dalyImpactKeV(p), p.yieldC) * p.collectFrac;
          const nSE = Math.min(9, rng.poisson(g));
          if (!nSE) return; // the ion is lost (no secondary electron)
          let first = true;
          for (let i = 0; i < nSE; i++) {
            fx.fly(fx.elec, D.markers.knob, D.markers.scint, 0.55 + rng.uniform(0, 0.15), {
              bulge: new THREE.Vector3(-0.004, rng.normal(0, 0.004), -0.01),
              jitterTo: 0.004,
              onArrive: () => {
                flash = Math.min(3, flash + 0.9);
                for (let k = 0; k < 3; k++) fx.fly(fx.phot, D.markers.scint, D.markers.pmtCathode, 0.3, { jitterTo: 0.004 });
                if (first) {
                  first = false;
                  setTimeout(() => {
                    fx.cascade(D.markers.pmtDynodes, D.markers.pmtCathode, 2, 1.5, 22, 0.13, () => { counts++; counter.innerHTML = `<b>${counts}</b> ions counted`; });
                  }, 300);
                }
              },
            });
          }
        },
      });
    }

    return {
      root, exploder: ex, scale: 0.26,
      camera: { position: [-0.05, 0.2, -0.26], target: [0.07, -0.01, 0.04] },
      panel: [intro.el, ctl.el, phdCard.el, platCard.el, dtCard.el, how.el, src.el],
      onExplode(t) { beam.setIntensity(Math.max(0, 1 - 2.5 * t)); },
      update(dt, t) {
        tNext -= dt;
        if (tNext <= 0) { event(); tNext = 0.9 + fx.rng.uniform(0, 0.5); }
        fx.update(dt);
        flash = Math.max(0, flash - dt * 4);
        if (scMat) scMat.emissiveIntensity = 0.35 + flash * 1.6;
      },
      dispose() { phdChart.dispose(); platChart.dispose(); dtChart.dispose(); scMat?.dispose(); },
    };
  },
};

export function fmtRate(v) {
  if (v >= 1e6) return `${(v / 1e6).toPrecision(3)} Mcps`;
  if (v >= 1e3) return `${(v / 1e3).toPrecision(3)} kcps`;
  return `${v.toPrecision(3)} cps`;
}
