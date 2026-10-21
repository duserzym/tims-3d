// Total evaporation (TE, "total ionization") vs conventional measurement windows:
// Rayleigh fractionation on the filament and why integrating every ion recovers the
// true isotope ratio.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { M } from '../core/materials.js';
import { mesh, roundedBox, plateWithSlit } from '../core/geom.js';
import { section, slider, segmented, toggle, buttons, readouts, note, para, sources, table, h, debounce } from '../core/ui.js';
import { Chart } from '../core/chart.js';
import { IonBeam } from '../core/beam.js';
import { buildFilamentAssembly } from '../components/filament.js';
import { buildLensStack } from '../components/lens.js';
import { registerParts } from '../components/parts.js';
import { simulateRun } from '../physics/evaporation.js';
import { E_CHARGE } from '../physics/constants.js';

const mm = 1e-3;
const NA = 6.02214076e23;
const C2K = (c) => c + 273.15;

const PRESETS = {
  U: { label: 'U 235/238', light: { name: '²³⁵U', m: 235.0439, ab: 0.0072 }, heavy: { name: '²³⁸U', m: 238.0508, ab: 0.9928 }, M: 238.03, ionT: C2K(1850), note: 'Natural U. No invariant ratio exists, so TE (ASTM C1672) or a double spike is required.' },
  Pu: { label: 'Pu 239/240', light: { name: '²³⁹Pu', m: 239.0522, ab: 0.80 }, heavy: { name: '²⁴⁰Pu', m: 240.0538, ab: 0.20 }, M: 239.3, ionT: C2K(1800), note: 'Illustrative reactor-grade-like composition (240/239 ≈ 0.25).' },
  Sr: { label: 'Sr 86/88', light: { name: '⁸⁶Sr', m: 85.9093, ab: 0.0986 }, heavy: { name: '⁸⁸Sr', m: 87.9056, ab: 0.8258 }, M: 87.62, ionT: C2K(1550), note: 'Natural Sr. In practice ⁸⁶Sr/⁸⁸Sr = 0.1194 is used for internal normalisation, which corrects fractionation in conventional runs.' },
  Nd: { label: 'Nd 144/146', light: { name: '¹⁴⁴Nd', m: 143.9101, ab: 0.238 }, heavy: { name: '¹⁴⁶Nd', m: 145.9131, ab: 0.1719 }, M: 144.24, ionT: C2K(1800), note: 'Natural Nd; ¹⁴⁶Nd/¹⁴⁴Nd = 0.7219 is the usual normalising ratio.' },
};

export default {
  id: 'totalEvap',
  title: 'Total evaporation (total ionization)',
  group: 'Methods',
  icon: '∑',
  blurb: 'Rayleigh fractionation, TE vs conventional, Nu IC tuning',

  async create(ctx) {
    const { app } = ctx;
    const root = new THREE.Group();
    const exploder = new Exploder();
    const charts = [];

    const st = {
      preset: 'U', mode: 'total', ng: 1.0, beta: 0.5, eff: 0.005, target: 2e7, tuneOnIC: true,
      w0: 0.1, w1: 0.45, speed: 120, playing: true, tp: 0,
    };

    // ---------------- 3-D ----------------
    const BY = 9 * mm; // beam height (ribbon top)
    const asm = buildFilamentAssembly({ config: 'double', metals: { ion: 'Re', evap: 'Re' }, sample: true, compact: true });
    root.add(asm.group);
    registerParts(exploder, asm.parts, { scale: 1.3, orderScale: 0.5 });
    app.label(asm.group, 'Double filament', { sub: 'sample on evaporation ribbon', offset: [-0.006, 0.03, 0] });
    const spot = asm.ribbons[1].spot;
    const spotBase = spot.scale.clone();

    const lens = buildLensStack({ detail: 'lite', height: 0.012, sourceSlitW: 0.4 * mm, selectorW: 2 * mm });
    lens.group.position.set(0, BY, -2.75 * mm);
    root.add(lens.group);
    registerParts(exploder, lens.parts, { scale: 0.6, orderOffset: 0.1, orderScale: 0.5 });
    app.label(lens.electrodes.ground, 'Source lens', { offset: [0, 0.009, 0] });

    // schematic magnet
    const Z0 = 0.085, Z1 = 0.125, ZM = (Z0 + Z1) / 2;
    const magnet = new THREE.Group();
    for (const s of [1, -1]) {
      const pole = mesh(roundedBox(0.034, 0.01, Z1 - Z0, 0.002), M.pole());
      pole.position.set(0, BY + s * (0.004 + 0.005), ZM);
      magnet.add(pole);
      const coil = mesh(roundedBox(0.04, 0.006, Z1 - Z0 + 0.006, 0.002), M.coil());
      coil.position.set(0, BY + s * (0.004 + 0.01 + 0.003), ZM);
      magnet.add(coil);
    }
    const yoke = mesh(roundedBox(0.008, 0.042, Z1 - Z0 + 0.008, 0.002), M.iron());
    yoke.position.set(0.024, BY, ZM);
    magnet.add(yoke);
    root.add(magnet);
    exploder.add(magnet, [0, 0.03, 0], { name: 'Magnet (schematic)', info: 'Sector magnet drawn schematically and not to scale — see the Instruments scene for traced sector optics. It separates the isotope beams by momentum (r ∝ √m).', order: 0.3 });
    app.label(magnet, 'Magnet (schematic)', { offset: [0, 0.03, ZM] });

    // collectors
    const ZC = 0.215;
    const coll = new THREE.Group();
    const cupX = { L: -0.014, A: 0, H: 0.014 }, icX = 0.034;
    const cupLabels = {};
    function cup(x, name, info) {
      const g = new THREE.Group();
      const body = mesh(roundedBox(0.008, 0.02, 0.03, 0.0008), M.steel());
      body.position.z = 0.017;
      const inner = mesh(new THREE.BoxGeometry(0.0055, 0.016, 0.028), M.graphite());
      inner.position.z = 0.0172;
      const slitP = mesh(plateWithSlit(0.011, 0.024, 0.0008, 0.0016, 0.014), M.steelPolished());
      g.add(body, inner, slitP);
      g.position.set(x, BY, ZC);
      coll.add(g);
      exploder.add(g, [x * 1.5, 0, 0.012 + Math.abs(x) * 0.4], { name, info, order: 0.4 });
      return g;
    }
    const fL = cup(cupX.L, 'Faraday cup L', 'Collects the light isotope beam; current read on a 10¹¹ Ω amplifier.');
    const fA = cup(cupX.A, 'Faraday cup (axial)', 'Axial Faraday (e.g. ²³⁶U or spike isotope in a real cup configuration).');
    const fH = cup(cupX.H, 'Faraday cup H', 'Collects the heavy isotope beam.');
    const ic = new THREE.Group();
    const icBody = mesh(roundedBox(0.012, 0.022, 0.034, 0.002), M.black());
    icBody.position.z = 0.019;
    const icSlit = mesh(plateWithSlit(0.014, 0.026, 0.0008, 0.0012, 0.012), M.steelPolished());
    const icMat = new THREE.MeshPhysicalMaterial({ color: 0x113322, emissive: 0x22ff88, emissiveIntensity: 0, roughness: 0.4 });
    const icLed = mesh(new THREE.SphereGeometry(0.0012, 12, 8), icMat);
    icLed.position.set(0, 0.012, 0.03);
    ic.add(icBody, icSlit, icLed);
    ic.position.set(icX, BY, ZC);
    coll.add(ic);
    exploder.add(ic, [0.025, 0, 0.02], { name: 'Ion counter (tuning detector)', info: 'Ion-counting detector (Daly or SEM) used, as in the Nu TIMS approach, to tune on a tiny beam (~10⁴ cps) so almost no sample is consumed before Faraday data collection starts.', order: 0.45 });
    root.add(coll);
    cupLabels.L = app.label(fL, 'Faraday L', { offset: [0, 0.016, 0] });
    cupLabels.H = app.label(fH, 'Faraday H', { offset: [0, 0.016, 0] });
    app.label(ic, 'Ion counter', { offset: [0, 0.017, 0] });

    // beams
    const v = (x, z) => new THREE.Vector3(x, BY, z);
    const mkBeam = (pts, color, r = 0.0007) => {
      const b = new IonBeam(pts, { color, radius: r, particles: 26, speed: 0.12, size: 0.0028 });
      root.add(b);
      return b;
    };
    const exitP = v(0, ZM + 0.012);
    const beams = {
      main: mkBeam([v(0, 0.0002), v(0, Z0), v(0, ZM), exitP], 0xa8d4ff, 0.0009),
      L: mkBeam([exitP, v(cupX.L, ZC + 0.002)], 0x5ab0ff),
      H: mkBeam([exitP, v(cupX.H, ZC + 0.002)], 0xffb24a),
      IC: mkBeam([exitP, v(icX, ZC + 0.002)], 0x4fd6a1),
    };
    function setBeam(b, f) {
      const on = f > 0.002;
      b.tube.visible = b.core.visible = b.points.visible = on;
      if (on) b.setIntensity(Math.min(1, f));
    }

    // ---------------- simulation ----------------
    let runs = null;
    function simulate() {
      const P = PRESETS[st.preset];
      const atoms = (st.ng * 1e-9) / P.M * NA;
      const isotopes = [
        { name: P.light.name, m: P.light.m, N0: atoms * P.light.ab },
        { name: P.heavy.name, m: P.heavy.m, N0: atoms * P.heavy.ab },
      ];
      const ionsTotal = st.eff * (isotopes[0].N0 + isotopes[1].N0);
      const tRun = ionsTotal / st.target;
      const tMax = Math.min(80000, 300 + 8 * tRun + 1500);
      const dt = Math.max(0.5, tMax / 9000);
      const base = { isotopes, beta: st.beta, eff: st.eff, targetIons: st.target, warmup: 300, dt, tMax, window: [st.w0, st.w1] };
      const ic = 3e4;
      runs = {
        total: simulateRun({ ...base, mode: 'total', tuneIons: st.tuneOnIC ? ic : st.target }),
        conventional: simulateRun({ ...base, mode: 'conventional', tuneIons: st.tuneOnIC ? ic : st.target }),
        totalIC: simulateRun({ ...base, mode: 'total', tuneIons: ic }),
        totalFC: simulateRun({ ...base, mode: 'total', tuneIons: st.target }),
        convIC: simulateRun({ ...base, mode: 'conventional', tuneIons: ic }),
        convFC: simulateRun({ ...base, mode: 'conventional', tuneIons: st.target }),
        dt,
      };
      st.tp = 0;
      st.playing = true;
      playBtn.textContent = '❚❚ Pause';
      updateSummary();
      drawCharts(true);
    }
    const run = () => runs[st.mode];

    // ---------------- panel ----------------
    const cards = [];
    const intro = section('Total evaporation', { icon: '∑' });
    intro.body.append(
      para('Light isotopes evaporate faster (flux ∝ m<sup>−β</sup>), so the sample on the filament becomes progressively heavier: <b>Rayleigh fractionation</b>. A conventional measurement samples only part of the run and sees a drifting, biased ratio. <b>Total evaporation (TE)</b> integrates every ion until the filament is exhausted — atoms are conserved, so the summed ratio equals the loaded ratio.'),
    );
    const modeSeg = segmented({ options: [{ value: 'total', label: 'Total evaporation' }, { value: 'conventional', label: 'Conventional window' }], value: st.mode, onChange: (m) => { st.mode = m; st.tp = 0; st.playing = true; playBtn.textContent = '❚❚ Pause'; drawCharts(true); } });
    const presetSeg = segmented({ options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label })), value: st.preset, onChange: (k) => { st.preset = k; presetNote.innerHTML = PRESETS[k].note; relabel(); simulateSoon(); } });
    const presetNote = para(PRESETS[st.preset].note);
    presetNote.style.fontSize = '12px';
    const ctrlBtns = buttons([
      { label: '❚❚ Pause', primary: true, onClick: () => { st.playing = !st.playing; playBtn.textContent = st.playing ? '❚❚ Pause' : '▶ Play'; if (st.playing && st.tp >= tEnd()) st.tp = 0; } },
      { label: '↺ Restart', onClick: () => { st.tp = 0; st.playing = true; playBtn.textContent = '❚❚ Pause'; } },
      { label: '⏭ End', onClick: () => { st.tp = tEnd(); } },
      { label: '🔍 Filament', title: 'Fly to the filament', onClick: () => app.flyTo([-0.03, 0.035, -0.02], [0, 0.007, 0.004]) },
    ]);
    const playBtn = ctrlBtns.els[0];
    const sSpeed = slider({ label: 'Playback speed', min: 10, max: 1000, value: st.speed, log: true, fmt: (x) => `${x.toFixed(0)}× real time`, onInput: (x) => { st.speed = x; } });
    intro.body.append(modeSeg.el, presetSeg.el, presetNote, ctrlBtns.el, sSpeed.el);
    cards.push(intro.el);

    const ro = readouts([
      { id: 'phase', label: 'Phase' }, { id: 'time', label: 'Run time' },
      { id: 'cons', label: 'Sample consumed' }, { id: 'beam', label: 'Total beam' },
      { id: 'T', label: 'Evaporation filament' }, { id: 'inst', label: 'Instantaneous ratio vs true' },
      { id: 'cum', label: 'Integrated ratio vs true' }, { id: 'tl', label: 'Consumed while tuning' },
    ]);
    const live = section('Live read-outs', { icon: '⏱' });
    live.body.append(ro.el);
    live.body.append(h('h4', {}, 'Ion beam & filament temperature'));
    const beamChart = new Chart(live.body, { height: 150, xLabel: 'time (s)', yLabel: 'beam (cps)', yLog: true, legendPos: 'tr' });
    const TChart = new Chart(live.body, { height: 110, xLabel: 'time (s)', yLabel: 'T (°C)', legend: false });
    live.body.append(h('h4', {}, 'Ratio deviation from loaded value'));
    const ratioChart = new Chart(live.body, { height: 180, xLabel: 'time (s)', yLabel: 'δ (‰)', legendPos: 'tr' });
    charts.push(beamChart, TChart, ratioChart);
    cards.push(live.el);

    const summaryCard = section('Bias summary (end of run)', { icon: '⚖' });
    const summaryBox = h('div');
    summaryCard.body.append(summaryBox, para('Bias = (measured/true − 1) in ‰. Tuning on an ion counter needs only ~10⁴ cps, so the uncollected, isotopically light start of the run is negligible; tuning on Faradays at full beam burns sample whose light-enriched ions are never counted — a bias TE cannot recover.'));
    cards.push(summaryCard.el);

    const params = section('Sample & run parameters', { icon: '🎛' });
    const sNg = slider({ label: 'Sample load', min: 0.05, max: 20, value: st.ng, log: true, fmt: (x) => `${x.toPrecision(2)} ng`, onInput: (x) => { st.ng = x; simulateSoon(); } });
    const sEff = slider({ label: 'Ionization efficiency (ions/atom)', min: 1e-4, max: 0.05, value: st.eff, log: true, fmt: (x) => `${(x * 100).toPrecision(2)} %`, onInput: (x) => { st.eff = x; simulateSoon(); } });
    const sTarget = slider({ label: 'Target total beam', min: 1e6, max: 1e9, value: st.target, log: true, fmt: (x) => `${x.toExponential(1)} cps · ${(x * E_CHARGE * 1e11 * 1000).toPrecision(2)} mV on 10¹¹ Ω`, onInput: (x) => { st.target = x; simulateSoon(); } });
    const sBeta = slider({ label: 'Fractionation exponent β (flux ∝ m^−β)', min: 0.2, max: 0.7, step: 0.01, value: st.beta, fmt: (x) => x.toFixed(2) + (Math.abs(x - 0.5) < 0.005 ? ' (kinetic)' : ''), onInput: (x) => { st.beta = x; simulateSoon(); } });
    const tIC = toggle({ label: 'Nu-style: tune on ion counter (~3×10⁴ cps) before Faraday collection', value: st.tuneOnIC, onChange: (x) => { st.tuneOnIC = x; simulateSoon(); } });
    const sW0 = slider({ label: 'Conventional window start (consumed)', min: 0, max: 0.9, step: 0.01, value: st.w0, fmt: (x) => `${(x * 100).toFixed(0)} %`, onInput: (x) => { st.w0 = Math.min(x, st.w1 - 0.02); simulateSoon(); } });
    const sW1 = slider({ label: 'Conventional window end (consumed)', min: 0.05, max: 0.98, step: 0.01, value: st.w1, fmt: (x) => `${(x * 100).toFixed(0)} %`, onInput: (x) => { st.w1 = Math.max(x, st.w0 + 0.02); simulateSoon(); } });
    params.body.append(sNg.el, sEff.el, sTarget.el, sBeta.el, tIC.el, sW0.el, sW1.el);
    cards.push(params.el);

    const phys = section('Method notes & sources', { icon: '📘', open: false });
    phys.body.append(
      para('<b>Rayleigh law.</b> With α = (m<sub>h</sub>/m<sub>l</sub>)<sup>β</sup>, the reservoir ratio evolves as R(f) = R₀·f<sup>α−1</sup> (f = fraction of the heavy isotope remaining), and the instantaneous evaporating ratio is α·R(f): too light early, too heavy late. Real filaments deviate (sample "reservoirs" mixing, mass-dependent ionization), which is why exponential-law internal normalisation is used when an invariant ratio exists (Sr, Nd).'),
      para('<b>TE.</b> The filament current is ramped to keep the summed beam near a target until the sample is exhausted; all isotopes are measured simultaneously on Faradays and integrated. Standardised for U and Pu in <b>ASTM C1672</b>; the reference method for nuclear safeguards. <b>Modified total evaporation (MTE)</b> (Richter et al., IRMM/NBL) interrupts TE periodically for baseline, peak-centring and SEM/Faraday cross-calibration so that minor isotopes (²³⁴U, ²³⁶U) are measured better while keeping TE accuracy for major ratios.'),
      para('<b>Vendors.</b> The Nu TIMS brochure describes tuning a small beam on an ion counter before Faraday measurement to minimise pre-analysis sample loss; Isotopx lists <b>Total Flash Evaporation</b> in the Phoenix software. Some literature calls TE "total ionization".'),
      note('Model: two isotopes, Arrhenius evaporation (A = 10⁷ s⁻¹, Eₐ = 3 eV), ideal Rayleigh mixing, mass-independent ionization efficiency, no detector biases. Absolute times/temperatures are illustrative; the ratio behaviour is the point.', 'warn'),
      sources([
        { label: 'Nu TIMS brochure', url: 'https://www.nu-ins.com/-/media/ameteknuinstruments/files/products/brochures/tims_2019.pdf' },
        { label: 'ASTM C1672', url: 'https://www.astm.org/c1672-17.html' },
        { label: 'Isotopx Phoenix', url: 'https://www.isotopx.com/products/phoenix' },
      ]),
    );
    cards.push(phys.el);

    // ---------------- logic ----------------
    const tEnd = () => { const r = run(); return r ? r.t[r.t.length - 1] : 0; };
    const fmtPm = (x) => (isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(Math.abs(x) < 0.1 ? 3 : 2)} ‰` : '—');
    const R0 = () => { const P = PRESETS[st.preset]; return P.light.ab / P.heavy.ab; };

    function relabel() {
      const P = PRESETS[st.preset];
      cupLabels.L.element.innerHTML = `Faraday L<small>${P.light.name}</small>`;
      cupLabels.H.element.innerHTML = `Faraday H<small>${P.heavy.name}</small>`;
    }
    function updateSummary() {
      const row = (label, r) => [label, fmtPm(r.biasPermil), `${(r.tuneLossFraction * 100).toFixed(r.tuneLossFraction < 0.01 ? 3 : 1)} %`, `${(r.collectedFraction * 100).toFixed(1)} %`];
      summaryBox.replaceChildren(table(['Method · tuning', 'Bias', 'Lost tuning', 'Ions collected'], [
        row('TE · ion counter', runs.totalIC), row('TE · Faraday', runs.totalFC),
        row('Conventional · ion counter', runs.convIC), row('Conventional · Faraday', runs.convFC),
      ], { numCols: [1, 2, 3] }));
    }

    function decimate(r, upto) {
      const n = Math.max(1, upto);
      const step = Math.max(1, Math.floor(n / 500));
      const idx = [];
      for (let i = 0; i < n; i += step) idx.push(i);
      if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      return idx;
    }
    let lastChart = 0;
    function drawCharts(full = false) {
      const r = run();
      if (!r) return;
      const i = Math.min(r.t.length, Math.floor(st.tp / runs.dt) + 1);
      const idx = decimate(r, full && !st.playing ? r.t.length : i);
      const t = idx.map((k) => r.t[k]);
      const tMaxX = r.t[r.t.length - 1];
      const bands = [];
      if (r.measureStart != null) bands.push({ x0: r.measureStart, x1: r.measureEnd, color: '#10b981', alpha: 0.1 });
      bands.push({ x0: 0, x1: 300, color: '#8b5cf6', alpha: 0.08 });
      const cursor = { x: Math.min(st.tp, tMaxX), color: '#ef4444' };
      beamChart.setOptions({ xMin: 0, xMax: tMaxX, yMin: 1e3, yMax: Math.max(st.target * 3, 1e5) });
      beamChart.setMarks([...bands, cursor, { y: st.target, color: '#8a94a3', label: 'target' }]);
      beamChart.setSeries([
        { name: 'total beam', color: '#3b82f6', x: t, y: idx.map((k) => r.beam[k]), width: 1.8 },
        { name: PRESETS[st.preset].light.name, color: '#06b6d4', x: t, y: idx.map((k) => r.ions[0][k]), width: 1 },
      ]);
      TChart.setOptions({ xMin: 0, xMax: tMaxX });
      TChart.setMarks([cursor]);
      TChart.setSeries([{ color: '#f59e0b', x: t, y: idx.map((k) => r.T[k] - 273.15), width: 1.6 }]);
      const r0 = R0();
      const other = st.mode === 'total' ? runs.conventional : runs.total;
      ratioChart.setOptions({ xMin: 0, xMax: tMaxX });
      ratioChart.setMarks([...bands, cursor, { y: 0, color: '#8a94a3' }]);
      ratioChart.setSeries([
        { name: 'instantaneous', color: '#f59e0b', x: t, y: idx.map((k) => (r.phase[k] === 'tune' ? NaN : (r.instRatio[k] / r0 - 1) * 1000)), width: 1.2 },
        { name: `integrated (${st.mode === 'total' ? 'TE' : 'window'})`, color: '#10b981', x: t, y: idx.map((k) => (r.cumRatio[k] / r0 - 1) * 1000), width: 2.4 },
        { name: `final ${st.mode === 'total' ? 'conventional' : 'TE'}`, color: '#8b5cf6', dash: [5, 4], x: [0, tMaxX], y: [other.biasPermil, other.biasPermil], width: 1.4 },
      ]);
    }

    function applyFrame() {
      const r = run();
      if (!r) return;
      const k = Math.min(r.t.length - 1, Math.floor(st.tp / runs.dt));
      const phase = r.phase[k];
      const P = PRESETS[st.preset];
      asm.setTemperature(1, r.T[k]);
      const tIon = Math.min(P.ionT, 1300 + r.t[k] * 3);
      asm.setTemperature(0, tIon);
      const remaining = Math.max(0, 1 - r.consumed[k]);
      const sc = Math.max(0.03, Math.cbrt(remaining));
      spot.scale.set(spotBase.x * sc, spotBase.y * Math.max(0.15, sc), spotBase.z * sc);
      spot.visible = remaining > 0.002;
      const f = r.beam[k] / st.target;
      const tuning = phase === 'tune';
      const collecting = phase === 'measure';
      setBeam(beams.main, Math.min(1, Math.sqrt(Math.max(0, f))) * (tuning && st.tuneOnIC ? 0.35 : 1));
      if (tuning && st.tuneOnIC) {
        setBeam(beams.IC, 0.6); setBeam(beams.L, 0); setBeam(beams.H, 0);
        icMat.emissiveIntensity = 2;
      } else {
        setBeam(beams.IC, 0);
        icMat.emissiveIntensity = 0;
        const gate = collecting || tuning || phase === 'heat' ? 1 : 0.2;
        setBeam(beams.L, Math.sqrt(r.ions[0][k] / st.target) * gate);
        setBeam(beams.H, Math.sqrt(r.ions[1][k] / st.target) * gate);
      }
      const phaseName = { tune: st.tuneOnIC ? 'Tuning on ion counter' : 'Tuning on Faradays', heat: 'Heating to window', measure: st.mode === 'total' ? 'TE: integrating all ions' : 'Measuring (window)', done: 'Finished' }[phase] || phase;
      const end = k >= r.t.length - 1;
      ro.phase.set(end ? 'Run complete' : phaseName, collecting ? 'good' : '');
      ro.time.set(`${r.t[k].toFixed(0)} s`);
      ro.cons.set(`${(r.consumed[k] * 100).toFixed(1)} %`);
      ro.beam.set(`${r.beam[k].toExponential(2)} cps`);
      ro.T.set(`${(r.T[k] - 273.15).toFixed(0)} °C`);
      const r0 = R0();
      ro.inst.set(tuning ? '—' : fmtPm((r.instRatio[k] / r0 - 1) * 1000));
      const cum = (r.cumRatio[k] / r0 - 1) * 1000;
      ro.cum.set(fmtPm(cum), Math.abs(cum) < 0.2 ? 'good' : Math.abs(cum) < 2 ? 'warn' : 'bad');
      ro.tl.set(`${(r.tuneLossFraction * 100).toFixed(r.tuneLossFraction < 0.01 ? 3 : 1)} %`, r.tuneLossFraction < 0.01 ? 'good' : 'warn');
    }

    const simulateSoon = debounce(simulate, 150);
    relabel();
    simulate();
    applyFrame();

    return {
      root,
      exploder,
      scale: 0.3,
      camera: { position: [-0.32, 0.2, 0.11], target: [0.004, 0.004, 0.11] },
      panel: cards,
      update(dt, t) {
        if (!runs) return;
        if (st.playing) {
          st.tp += dt * st.speed;
          if (st.tp >= tEnd()) { st.tp = tEnd(); st.playing = false; playBtn.textContent = '▶ Play'; drawCharts(true); }
        }
        applyFrame();
        if (st.playing && t - lastChart > 0.12) { lastChart = t; drawCharts(); }
      },
      dispose() { charts.forEach((c) => c.dispose()); },
    };
  },
};
