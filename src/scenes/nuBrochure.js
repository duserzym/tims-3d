// Nu TIMS brochure scene: the instrument built from the brochure's stated features, with
// numbered hotspots and a quantitative Zoom Optics multi-dynamic demonstration.
import * as THREE from 'three';
import { INSTRUMENTS, SOURCES } from '../instruments/specs.js';
import { buildInstrument } from '../instruments/build.js';
import { ISOTOPE_SETS } from '../physics/elements.js';
import { analyseCycles, peakScan } from '../physics/multidynamic.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, segmented, toggle, slider, readouts, note, para, table, sources, h, buttons } from '../core/ui.js';

const FEATURES = [
  { key: 'source', title: 'Single-piece stainless source', text: 'The source is machined from a single piece of stainless steel; the source slit is user-replaceable.', scene: 'source' },
  { key: 'turret', title: '20-sample turret, enclosed filaments', text: '20 single or double filaments, each assembly fully enclosed against cross-contamination; turret position sensed with visible light; exchange and pump-down under software control; optional degas bench.', scene: 'filaments' },
  { key: 'turbo', title: '400 L/s turbo + dry scroll', text: 'Source pumped by a 400 L/s turbomolecular pump backed by an oil-free scroll pump.' },
  { key: 'coldTrap', title: 'LN₂ cold trap, 24 h per fill', text: 'A liquid-nitrogen cold trap is standard; one fill lasts 24 hours.' },
  { key: 'magnet', title: '70° · 30 cm laminated magnet', text: 'Single-focusing 70° sector, 30 cm radius, laminated for fast field switching; unity magnification ion optics.', scene: 'instrument' },
  { key: 'zoom', title: 'Zoom Optics (variable dispersion)', text: 'Patented variable-dispersion lens — first use on a TIMS. Places all masses at the centre of a fixed static array with instantaneous switching, so multi-dynamic routines keep peak coincidence in every cycle.' },
  { key: 'collector', title: '12 fixed Faradays + 2 ion counters', text: 'Standard: 12 Faradays and 2 ion-counting positions (Daly + multiplier, two multipliers or two Dalys). Option: 16 Faradays + 5 ion counters. Electrostatic and magnetic electron suppression.', scene: 'faraday' },
  { key: 'daly', title: 'Daly detector', text: 'Highest-performance ion counting over the largest dynamic range; little or no noise in positive-ion mode; photomultiplier outside the vacuum.', scene: 'daly' },
  { key: 'sem', title: 'Discrete-dynode multiplier', text: 'Full-size, off-axis multiplier for good stability and linearity; ion counters protected from large beams without switching off.', scene: 'ionCounter' },
  { key: 'filter', title: 'Energy filter', text: 'Energy filters on ion counters improve abundance sensitivity by up to two orders of magnitude (as low as 2 ppm at 1 u relative to ²³⁸U).' },
  { key: 'ionPump0', title: '2 × 75 L/s ion pumps', text: 'Analyser pumped by two 75 L/s ion pumps; gauges are read by the software.' },
  { key: 'amps', title: 'Faraday amplifiers', text: 'Large dynamic range; optional software-switchable resistor amplifiers.', scene: 'faraday' },
  { key: null, title: 'Total evaporation with IC tuning', text: 'For total evaporation a small beam is tuned on an ion counter before measuring on Faradays, minimising pre-analysis sample loss.', scene: 'totalEvap' },
  { key: null, title: 'Software: NICE, batch runs', text: 'Full control, tuning and diagnostics; Nu Instruments Calculation Editor (NICE) for user-defined data reduction; unattended batch runs with automatic shutdown.' },
];

export default {
  id: 'nuBrochure',
  title: 'Nu TIMS brochure',
  group: 'Instruments',
  icon: '❶',
  blurb: 'Brochure features as hotspots + Zoom Optics 5-cycle Sr multi-dynamic demo',
  async create(ctx) {
    const { app } = ctx;
    const spec = INSTRUMENTS.nu;
    const set = ISOTOPE_SETS.SrMD;
    const design = set.isotopes.find((i) => i.name === set.axial).m;
    const cycles = set.isotopes.map((i) => i.m); // put each mass on axis in turn (84, 85, 86, 87, 88)
    const ks = [];
    for (let k = -5; k <= 6; k++) ks.push(k);
    const st = { cycle: 0, zoomOn: true, wb: 0.3e-3, wc: 1.0e-3 };
    const featureEls = [];

    const inst = buildInstrument(spec, { element: 'SrMD', label: ctx.label });
    const root = new THREE.Group();
    root.add(inst.root);
    const sector = inst.optics.sector;

    // ---- panel ----
    const intro = section('Nu TIMS — from the brochure', { icon: '❶' });
    intro.body.append(
      para('This model is assembled from the features stated in the Nu Instruments TIMS brochure (BRO4.91). Numbered hotspots in the view match the list below; click one to fly there.'),
      sources([SOURCES.nuBrochure, SOURCES.nuIntro]),
    );

    const zoomCard = section('Zoom Optics: 5-cycle Sr multi-dynamic', { icon: '⇔' });
    const cycleSeg = segmented({
      options: cycles.map((m, i) => ({ value: i, label: `C${i + 1} · ${set.isotopes[i].name}` })),
      value: 0,
      onChange: (v) => { st.cycle = v; update3D(); updatePanel(); },
    });
    const zoomT = toggle({ label: 'Zoom Optics on (auto dispersion per cycle)', value: true, onChange: (v) => { st.zoomOn = v; update3D(); updatePanel(); } });
    const wbS = slider({ label: 'Beam image width (FWHM)', min: 0.1, max: 0.8, step: 0.01, value: 0.3, unit: 'mm', onInput: (v) => { st.wb = v * 1e-3; updatePanel(); } });
    const wcS = slider({ label: 'Cup entrance slit', min: 0.4, max: 2.0, step: 0.05, value: 1.0, unit: 'mm', onInput: (v) => { st.wc = v * 1e-3; updatePanel(); } });
    const ro = readouts([
      { id: 'axial', label: 'Mass on axis' }, { id: 'zoom', label: 'Zoom factor z' },
      { id: 'dmax', label: 'Worst misalignment' }, { id: 'fmin', label: 'Worst signal (flat-top loss)' },
    ]);
    zoomCard.body.append(
      para('Cups are fixed where the isotopes fall in cycle 3 (⁸⁶Sr on axis). When the magnet puts another mass on axis, the dispersion per mass unit scales as 1/m, so outer beams drift off their cups. Zoom Optics rescale the lateral dispersion by a factor z each cycle (fitted here by least squares to the traced positions).'),
      cycleSeg.el, zoomT.el, wbS.el, wcS.el, ro.el,
    );
    const scanChart = new Chart(zoomCard.body, { height: 190, title: 'Peak scan in this cycle (all collected beams)', xLabel: 'magnet scan, lateral shift (mm)', yLabel: 'signal / max', yMin: 0, yMax: 1.05, legendPos: 'br' });
    const cycChart = new Chart(zoomCard.body, { height: 160, title: 'Worst signal at peak centre vs cycle', xLabel: 'cycle', yLabel: 'fraction', xMin: 0.5, xMax: 5.5 });
    const tblBox = h('div');
    zoomCard.body.append(tblBox, note('Model: Gaussian beam image convolved with the cup slit; first-order rigid shift for the magnet scan; zoom modelled as a pure lateral rescaling about the axial beam. It reproduces the brochure’s qualitative result, not its exact numbers.', 'warn'));

    const featCard = section('Brochure features', { icon: '☰' });
    const list = h('div');
    FEATURES.forEach((f, i) => {
      const row = h('div', { class: 'ro wide', style: 'margin:6px 0; padding:8px 10px' },
        h('div', { class: 'k', style: 'font-size:12.5px; color: var(--fg); font-weight:650' }, `${i + 1}. ${f.title}`),
        h('div', { style: 'font-size:12px; color: var(--fg-muted); margin:3px 0 4px' }, f.text),
        h('div', { class: 'btn-row', style: 'margin:2px 0 0' },
          f.key && inst.features[f.key] ? h('button', { class: 'btn', onclick: () => show(i) }, 'Show in 3-D') : null,
          f.scene ? h('a', { class: 'btn', href: `#scene=${f.scene}`, style: 'text-decoration:none' }, 'Open related scene →') : null));
      featureEls.push(row);
      list.append(row);
    });
    featCard.body.append(list);

    const specCard = section('Specifications & provenance', { icon: '✓', open: false });
    specCard.body.append(
      table(['Item', 'Value', ''], spec.specs.map(([k, v, ok, src]) => [k, v, ok ? `<a class="tag v" href="${SOURCES[src].url}" target="_blank" rel="noopener">brochure</a>` : '<span class="tag a">assumed</span>'])),
      note(spec.magnet.note, 'warn'),
    );

    function show(i) {
      const f = FEATURES[i];
      const obj = f.key && inst.features[f.key];
      if (obj) {
        const box = new THREE.Box3().setFromObject(obj);
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(0.25, box.getSize(new THREE.Vector3()).length() * 1.6);
        app.flyTo([c.x + r * 0.45, c.y + r * 0.75, c.z + r * 0.9], c.toArray());
      }
      featureEls.forEach((e, j) => { e.style.outline = j === i ? '2px solid var(--accent)' : ''; });
      featCard.el.open = true;
      featureEls[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    let analysis = null;
    function analyse() {
      analysis = analyseCycles({ sector, isotopes: set.isotopes, cycles, designAxial: design, ks, wb: st.wb, wc: st.wc });
    }
    analyse();

    function update3D() {
      const a = analysis[st.cycle];
      inst.setCycle({ designAxial: design, axialMass: cycles[st.cycle], zoom: st.zoomOn ? a.zoom : 1 });
      app.applyXray();
      app.applyBeams();
    }

    function updatePanel() {
      analyse();
      const a = analysis[st.cycle];
      const z = st.zoomOn ? a.zoom : 1;
      const dmax = Math.max(...a.rows.map((r) => Math.abs(st.zoomOn ? r.deltaZoom : r.delta)));
      const fmin = Math.min(...a.rows.map((r) => (st.zoomOn ? r.fZoom : r.f)));
      ro.axial.set(set.isotopes[st.cycle].name + ` (${cycles[st.cycle].toFixed(3)} u)`);
      ro.zoom.set(st.zoomOn ? `${z.toFixed(4)} (${((z - 1) * 100).toFixed(2)} %)` : '1 (off)');
      ro.dmax.set(`${(dmax * 1e6).toFixed(0)} µm`, dmax > (st.wc - st.wb) / 2 ? 'warn' : 'good');
      ro.fmin.set(`${(fmin * 100).toFixed(1)} %`, fmin < 0.995 ? 'warn' : 'good');
      const scans = peakScan(a.rows, { zoom: z, wb: st.wb, wc: st.wc, span: Math.max(1.2e-3, st.wc) });
      scanChart.setSeries(scans.map((s, i) => ({ name: `${s.iso.name} (k=${s.k})`, color: PALETTE[i % PALETTE.length], x: s.x.map((v) => v * 1e3), y: s.y })));
      const xs = analysis.map((_, i) => i + 1);
      cycChart.setSeries([
        { name: 'no zoom', color: '#ef4444', x: xs, y: analysis.map((c) => Math.min(...c.rows.map((r) => r.f))), type: 'line', width: 2 },
        { name: 'with Zoom Optics', color: '#10b981', x: xs, y: analysis.map((c) => Math.min(...c.rows.map((r) => r.fZoom))), type: 'line', width: 2 },
        { name: '', color: '#94a3b8', x: [st.cycle + 1], y: [st.zoomOn ? Math.min(...a.rows.map((r) => r.fZoom)) : Math.min(...a.rows.map((r) => r.f))], type: 'scatter', r: 5 },
      ]);
      cycChart.setOptions({ yMin: Math.min(0.8, ...analysis.map((c) => Math.min(...c.rows.map((r) => r.f)))) - 0.02, yMax: 1.01 });
      tblBox.replaceChildren(table(['Cup', 'Isotope', 'δ no zoom', 'δ zoom', 'signal'],
        a.rows.map((r) => [r.k === 0 ? 'Ax' : r.k < 0 ? 'L' + -r.k : 'H' + r.k, r.iso.name, `${(r.delta * 1e6).toFixed(0)} µm`, `${(r.deltaZoom * 1e6).toFixed(1)} µm`, `${((st.zoomOn ? r.fZoom : r.f) * 100).toFixed(1)} %`]), { numCols: [2, 3, 4] }));
    }

    update3D();
    updatePanel();
    // ---- numbered hotspots ----
    FEATURES.forEach((f, i) => {
      const obj = f.key ? inst.features[f.key] : null;
      if (!obj) return;
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      const anchor = new THREE.Object3D();
      const dynamic = ['daly', 'sem', 'filter'].includes(f.key);
      const host = dynamic ? root : obj;
      root.updateMatrixWorld(true);
      host.worldToLocal(anchor.position.copy(c).add(new THREE.Vector3(0, (box.max.y - box.min.y) / 2 + 0.07, 0)));
      host.add(anchor);
      ctx.label(anchor, `${i + 1}`, { className: 'callout', onClick: () => show(i) });
    });


    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    return {
      root,
      exploder: { set: (t) => inst.exploder.set(t) },
      panel: [intro.el, zoomCard.el, featCard.el, specCard.el],
      camera: { position: [c.x + 0.25, c.y + 2.35, c.z + 1.75], target: [c.x + 0.05, c.y + 0.25, c.z - 0.12] },
      scale: 2.4,
      defaults: { xray: true },
      update(dt) { inst.update(dt); },
      dispose() { scanChart.dispose(); cycChart.dispose(); },
    };
  },
};
