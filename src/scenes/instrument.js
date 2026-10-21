// Full-instrument scene: Isotopx Phoenix, Nu TIMS, Thermo Triton XT.
import * as THREE from 'three';
import { INSTRUMENTS, VENDOR_ORDER, SOURCES } from '../instruments/specs.js';
import { buildInstrument, opticsFor, fieldFor } from '../instruments/build.js';
import { ISOTOPE_SETS } from '../physics/elements.js';
import { section, segmented, toggle, slider, readouts, note, para, table, sources, h, buttons } from '../core/ui.js';

const hashParam = (k) => new URLSearchParams(location.hash.slice(1)).get(k);

export default {
  id: 'instrument',
  title: 'TIMS instruments',
  group: 'Instruments',
  icon: '⌬',
  blurb: 'Isotopx Phoenix · Nu TIMS · Thermo Triton XT — explodable, with traced ion optics',
  async create(ctx) {
    const { app } = ctx;
    const root = new THREE.Group();
    let vendor = VENDOR_ORDER.includes(hashParam('vendor')) ? hashParam('vendor') : 'phoenix';
    let element = ISOTOPE_SETS[hashParam('element')] ? hashParam('element') : 'Sr';
    let inst = null;
    const exploder = { t: 0, set(t) { this.t = t; inst?.exploder.set(t); } };

    // ---- panel ----
    const intro = section('Instrument', { icon: '⌬' });
    const vendorSeg = segmented({
      options: VENDOR_ORDER.map((v) => ({ value: v, label: INSTRUMENTS[v].name, title: INSTRUMENTS[v].vendor })),
      value: vendor,
      onChange: (v) => { vendor = v; rebuild(true); },
    });
    const tagline = para('');
    intro.body.append(vendorSeg.el, tagline);

    const ctl = section('Beam & detectors', { icon: '⚙' });
    const elemSeg = segmented({
      options: Object.keys(ISOTOPE_SETS).filter((k) => !ISOTOPE_SETS[k].hidden).map((k) => ({ value: k, label: k })),
      value: element,
      onChange: (v) => { element = v; inst.setElement(v); refresh(); },
    });
    const modeSeg = segmented({
      options: [{ value: 'faraday', label: 'Faraday cups' }, { value: 'ic', label: 'Axial → ion counter' }],
      value: 'faraday',
      onChange: (v) => { inst.setMeasureOn(v); refresh(); },
    });
    const fanT = toggle({ label: 'Show focusing fan (±4 mrad rays)', value: false, onChange: (v) => { inst.setFan(v); } });
    const zoomS = slider({ label: 'Zoom Optics dispersion factor', min: 0.97, max: 1.03, step: 0.0005, value: 1, fmt: (v) => `${((v - 1) * 100).toFixed(2)} %`, onInput: (v) => { inst.setZoom(v); refresh(); } });
    const zoomWrap = h('div', {}, zoomS.el, note('Fixed arrays cannot move cups. Changing the dispersion by a fraction of a percent shifts outer beams off their cups — this is what Zoom Optics correct between multi-dynamic cycles.'));
    ctl.body.append(h('div', { class: 'ctl' }, h('label', {}, 'Element (isotope set)')), elemSeg.el,
      h('div', { class: 'ctl' }, h('label', {}, 'Axial beam measured on')), modeSeg.el, fanT.el, zoomWrap);

    const opt = section('Ion optics (traced)', { icon: '∿' });
    const ro = readouts([
      { id: 'geom', label: 'Sector', wide: true },
      { id: 'L1', label: 'Object distance L′' }, { id: 'L2', label: 'Image distance L″' },
      { id: 'D', label: 'Mass dispersion D' }, { id: 'pitch', label: '1 u at axial mass' },
      { id: 'B', label: 'B for axial mass @10 kV' }, { id: 'cup', label: 'Cup width (model)' },
    ]);
    const optNote = note('', 'warn');
    opt.body.append(ro.el, para('Trajectories are traced through a uniform-field sector (no fringe fields); cups are placed at the traced focal point of each mass. For a symmetric normal-entry sector this reproduces Barber’s rule and D = R₀; rotated pole faces (“extended geometry”) push the image out and enlarge D.'), optNote);

    const specCard = section('Specifications & provenance', { icon: '☰', open: true });
    const tour = section('Guided tour', { icon: '➜', open: false });
    const panel = [intro.el, ctl.el, opt.el, specCard.el, tour.el];

    const tourStops = [
      ['Source & turret', 'source', [-0.15, 0.35, 0.55]],
      ['Lens stack', 'lens', [0.05, 0.12, 0.25]],
      ['Magnet', 'magnet', [0.3, 0.7, 1.0]],
      ['Collector', 'collector', [0.2, 0.25, 0.45]],
      ['Ion counter', 'daly', [0.12, 0.12, 0.3]],
    ];
    tour.body.append(buttons(tourStops.map(([lbl, key, off]) => ({
      label: lbl,
      onClick: () => {
        const obj = inst.features[key] || inst.features.sem;
        if (!obj) return;
        const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
        app.flyTo([c.x + off[0], c.y + off[1], c.z + off[2]], c.toArray());
      },
    }))).el, para('Tip: press <span class="kbd">E</span> to explode/assemble, <span class="kbd">X</span> for X-ray, click any part for its physics.'));

    function refresh() {
      const spec = INSTRUMENTS[vendor];
      const o = inst.optics;
      const r = inst.readout();
      const s = o.sector;
      ro.geom.set(`${(s.phi * 180 / Math.PI).toFixed(0)}° · R₀ ${(s.R0 * 100).toFixed(1)} cm · ε ${(s.eps1 * 180 / Math.PI).toFixed(1)}°`);
      ro.L1.set(`${(o.L1 * 100).toFixed(1)} cm`);
      ro.L2.set(`${(o.L2 * 100).toFixed(1)} cm`);
      ro.D.set(`${(o.D * 100).toFixed(1)} cm`);
      ro.pitch.set(`${(r.pitch * 1000).toFixed(2)} mm`);
      ro.B.set(`${r.B.toFixed(3)} T`);
      ro.cup.set(`${(r.cupW * 1000).toFixed(1)} mm`);
      optNote.innerHTML = spec.magnet.note;
      zoomWrap.style.display = spec.collector.zoom ? '' : 'none';
    }

    function fillSpecs() {
      const spec = INSTRUMENTS[vendor];
      tagline.innerHTML = `<b>${spec.vendor} ${spec.name}.</b> ${spec.tagline}`;
      specCard.body.replaceChildren(
        table(['Item', 'Value', ''], spec.specs.map(([k, v, ok, src]) => [k, v, ok ? `<a class="tag v" href="${SOURCES[src].url}" target="_blank" rel="noopener">source</a>` : '<span class="tag a">assumed</span>'])),
        sources(spec.sources.map((k) => SOURCES[k])),
      );
    }

    function rebuild(fly = false) {
      if (inst) {
        root.remove(inst.root);
        inst.root.traverse((q) => { if (q.isCSS2DObject) q.element.remove(); q.geometry?.dispose?.(); });
      }
      inst = buildInstrument(INSTRUMENTS[vendor], { element, label: ctx.label, measureOn: modeSeg.get(), zoom: 1, fan: fanT.get() });
      zoomS.set(1);
      root.add(inst.root);
      inst.exploder.set(exploder.t);
      app.applyXray?.();
      app.applyBeams?.();
      fillSpecs();
      refresh();
      if (fly) app.resetView();
    }

    rebuild();
    // camera
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    const camera = { position: [c.x + 0.25, c.y + 2.35, c.z + 1.75], target: [c.x + 0.05, c.y + 0.25, c.z - 0.12] };

    return {
      root, exploder, panel, camera, scale: 2.4, defaults: { xray: true },
      update(dt) { inst?.update(dt); },
      dispose() {},
    };
  },
};
