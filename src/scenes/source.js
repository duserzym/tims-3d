// Ion-source potentials & selector tuning: a real 2-D Laplace solution of a generic
// Nier-type TIMS lens stack, ion trajectories traced through it, and an interactive tune.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { M } from '../core/materials.js';
import { mesh, rod } from '../core/geom.js';
import { section, slider, buttons, readouts, note, para, sources, legendInline, toggle, h, rafThrottle, debounce } from '../core/ui.js';
import { Chart } from '../core/chart.js';
import { PolylineCurve, glowSprite } from '../core/beam.js';
import { SourceLens, LENS_LAYOUT } from '../physics/sourceLens.js';
import { buildLensStack } from '../components/lens.js';
import { registerParts } from '../components/parts.js';
import { blackbodyRGB } from '../physics/saha.js';

const mm = 1e-3;
const L = LENS_LAYOUT;

// magma-like perceptual colour map
const CMAP = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
function cmap(t) {
  t = Math.min(1, Math.max(0, t)) * (CMAP.length - 1);
  const i = Math.min(CMAP.length - 2, Math.floor(t)), f = t - i;
  const a = CMAP[i], b = CMAP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Crossing of a traced polyline with plane x = X: returns {y, angle} or null. */
function crossAt(pts, X) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a[0] <= X && b[0] > X) {
      const f = (X - a[0]) / (b[0] - a[0]);
      return { y: a[1] + f * (b[1] - a[1]), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
  }
  return null;
}

export default {
  id: 'source',
  title: 'Source potentials & selector tuning',
  group: 'Ion source',
  icon: '⚡',
  blurb: 'Laplace field of the lens stack, traced ions, auto-tune',

  async create(ctx) {
    const { app } = ctx;
    const root = new THREE.Group();
    const exploder = new Exploder();
    const disposers = [];
    let disposed = false;
    // cut-away: clip electrodes above the dispersive mid-plane so the field map is visible
    const prevClip = app.renderer.localClippingEnabled;
    app.renderer.localClippingEnabled = true;
    disposers.push(() => { app.renderer.localClippingEnabled = prevClip; });
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const clipMats = new Map();
    let cutaway = true;
    function clipMaterial(m) {
      if (!clipMats.has(m)) {
        const c = m.clone();
        if (c.color) c.color.multiplyScalar(/stainless/.test(m.name || '') ? 0.74 : 0.5); // tame bloom on bright metals/ceramics
        c.clippingPlanes = [clipPlane];
        c.clipShadows = true;
        c.side = THREE.DoubleSide;
        clipMats.set(m, c);
      }
      return clipMats.get(m);
    }
    function applyClip(group) {
      group.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.userData._orig) o.userData._orig = o.material;
        o.material = cutaway ? clipMaterial(o.userData._orig) : o.userData._orig;
        if (o.userData._mat) o.userData._mat = o.material; // keep x-ray restore consistent
      });
    }
    disposers.push(() => clipMats.forEach((m) => m.dispose()));

    // ---------- tuning state (fractions of the acceleration voltage) ----------
    const DEF = { accel: 10000, ext: 0.82, foc: 0.76, steer: 0, defl: 0, slit: 0.4, sel: 2.0, T: 1800, spot: 0.6, offset: 0 };
    const st = { ...DEF };
    const tuneAbs = () => ({ accel: st.accel, extraction: st.ext * st.accel, focus: st.foc * st.accel, steer: st.steer * st.accel, deflect: st.defl * st.accel });

    // ---------- physics ----------
    ctx.setLoading('Solving Laplace basis fields (6 electrodes × 27 k nodes)…');
    await new Promise((r) => setTimeout(r, 30));
    const lens = new SourceLens({ sourceSlitW: st.slit * mm, selectorW: st.sel * mm });
    const grid = lens.grid;

    // ---------- 3-D: lens stack ----------
    let stack = null, stackParts = [];
    const lensRoot = new THREE.Group();
    root.add(lensRoot);
    const labels = {};
    function buildStack() {
      if (stack) {
        lensRoot.remove(stack.group);
        stack.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); o.geometry?.dispose(); });
        exploder.parts = exploder.parts.filter((p) => !stackParts.includes(p.obj));
      }
      stack = buildLensStack({ sourceSlitW: st.slit * mm, selectorW: st.sel * mm, detail: 'full' });
      lensRoot.add(stack.group);
      stackParts = stack.parts.map((p) => p.obj);
      registerParts(exploder, stack.parts);
      const e = stack.electrodes;
      const lab = (key, txt, off) => { labels[key] = app.label(e[key], txt, { offset: off }); };
      lab('can', 'Filament can', [-0.006, 0.0135, 0]);
      lab('extraction', 'Extraction', [0.002, 0.0175, 0]);
      lab('focusUp', 'Focus / Y-sym', [0.004, 0.0135, 0]);
      lab('ground', 'Ground', [0, 0.0135, 0]);
      lab('deflUp', 'Deflection', [0, 0.009, 0]);
      lab('sourceSlit', 'Source slit', [0, 0.0135, 0]);
      lab('selector', 'Selector (α) slit', [0, 0.0135, 0]);
      exploder.rebase();
      updateLabels();
      applyClip(stack.group);
      if (app.state.xray) app.applyXray();
    }

    // ---------- 3-D: filament on posts (ribbon long axis vertical, face → +Z) ----------
    const fil = new THREE.Group();
    const filMat = new THREE.MeshPhysicalMaterial({ color: 0xbfc3ca, metalness: 1, roughness: 0.3, emissive: 0x000000, name: 'Re ribbon' });
    const ribbonZ = L.filament.x1 - 0.02 * mm;
    const rib = mesh(new THREE.BoxGeometry(0.76 * mm, 7 * mm, 0.04 * mm), filMat);
    rib.position.set(0, 0, ribbonZ);
    fil.add(rib);
    const spot = mesh(new THREE.SphereGeometry(0.4 * mm, 16, 8), new THREE.MeshPhysicalMaterial({ color: 0xf1ede2, roughness: 0.85 }));
    spot.scale.set(0.8, 2.2, 0.25);
    spot.position.set(0, 0, ribbonZ + 0.03 * mm);
    fil.add(spot);
    for (const s of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(0.76 * mm, 0.04 * mm, 3 * mm), filMat);
      leg.position.set(0, s * 3.5 * mm, ribbonZ - 1.5 * mm);
      fil.add(leg);
      fil.add(rod(new THREE.Vector3(0, s * 3.5 * mm, ribbonZ - 3 * mm), new THREE.Vector3(0, s * 3.5 * mm, -9 * mm), 0.35 * mm, M.steelPolished()));
    }
    const hdr = mesh(new THREE.BoxGeometry(6 * mm, 11 * mm, 3 * mm), M.alumina());
    hdr.position.set(0, 0, -10.5 * mm);
    fil.add(hdr);
    root.add(fil);
    exploder.add(fil, [0, 0, -14 * mm], { name: 'Filament (Re ribbon on posts)', info: 'Sample-loaded Re ribbon (0.76 mm wide), long axis vertical so the narrow emitting width lies in the dispersive plane. It floats at the acceleration voltage; ions leave its face with ≈kT ≈ 0.15 eV thermal energy.', order: 0.6 });
    app.label(fil, 'Filament', { offset: [0, 0.006, 0] });

    // ---------- 3-D: equipotential map in the dispersive plane ----------
    const SS = 3; // supersampling
    const cw = (grid.ny - 1) * SS + 1, ch = (grid.nx - 1) * SS + 1;
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const c2d = canvas.getContext('2d');
    const img = c2d.createImageData(cw, ch);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const planeW = L.yMax - L.yMin, planeH = L.xMax - L.xMin;
    const planeGeo = new THREE.PlaneGeometry(planeW, planeH);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.set((L.yMin + L.yMax) / 2, 0.05 * mm, (L.xMin + L.xMax) / 2);
    plane.renderOrder = 2;
    root.add(plane);
    disposers.push(() => { tex.dispose(); planeMat.dispose(); });

    function drawField() {
      const d = img.data;
      const V0 = st.accel;
      const step = 500; // V between equipotentials
      for (let r = 0; r < ch; r++) {
        const x = L.xMin + (r / (ch - 1)) * planeH;
        for (let c = 0; c < cw; c++) {
          const y = L.yMin + (c / (cw - 1)) * planeW;
          const k = (r * cw + c) * 4;
          const s = grid.solidAt(x, y);
          if (s >= 0) { d[k] = 150; d[k + 1] = 160; d[k + 2] = 172; d[k + 3] = 255; continue; }
          const v = grid.potential(x, y);
          const [R, G, B] = cmap(0.1 + 0.9 * (v / V0));
          const q = v / step;
          const fr = q - Math.floor(q);
          const line = fr < 0.06 || fr > 0.94 ? 0.55 : 1;
          d[k] = R * 0.82 * line; d[k + 1] = G * 0.82 * line; d[k + 2] = B * 0.82 * line; d[k + 3] = 235;
        }
      }
      c2d.putImageData(img, 0, 0);
      tex.needsUpdate = true;
    }

    // ---------- 3-D: trajectories ----------
    const rayGroup = new THREE.Group();
    rayGroup.userData.beam = true;
    root.add(rayGroup);
    const rayMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    let rayLines = null;
    const flow = { curves: [], phase: [], pts: null };
    const flowGeo = new THREE.BufferGeometry();
    const NFLOW = 160;
    flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NFLOW * 3), 3));
    const flowPts = new THREE.Points(flowGeo, new THREE.PointsMaterial({ color: 0x9fe8ff, size: 0.0011, map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    flowPts.frustumCulled = false;
    rayGroup.add(flowPts);
    disposers.push(() => { rayMat.dispose(); flowGeo.dispose(); flowPts.material.dispose(); });

    const COL_T = new THREE.Color(0x4ff0c0), COL_SLIT = new THREE.Color(0xffc857), COL_LOST = new THREE.Color(0xff5d5d);
    let last = null;
    function drawRays(res) {
      if (rayLines) { rayGroup.remove(rayLines); rayLines.geometry.dispose(); }
      const pos = [], col = [];
      flow.curves = [];
      for (const r of res.rays) {
        const transmitted = r.fate === 'transmitted';
        const passedSlit = r.pts.some((p) => p[0] > L.sourceSlit.x1);
        const c = transmitted ? COL_T : passedSlit ? COL_SLIT : COL_LOST;
        const P = r.pts;
        for (let i = 1; i < P.length; i++) {
          pos.push(P[i - 1][1], 0.15 * mm, P[i - 1][0], P[i][1], 0.15 * mm, P[i][0]);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
        if (transmitted && flow.curves.length < 40) flow.curves.push(new PolylineCurve(P.filter((_, i) => i % 3 === 0 || i === P.length - 1).map((p) => new THREE.Vector3(p[1], 0.2 * mm, p[0]))));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      rayLines = new THREE.LineSegments(g, rayMat);
      rayLines.renderOrder = 5;
      rayGroup.add(rayLines);
      flow.phase = Array.from({ length: NFLOW }, () => Math.random());
    }

    // ---------- panel ----------
    const cards = [];
    const intro = section('Ion source tuning', { icon: '⚡' });
    intro.body.append(
      para('A TIMS source accelerates ions from a filament at <b>+V<sub>acc</sub></b> (≈10 kV) to ground through a stack of slit electrodes. The field shown is a <b>finite-difference Laplace solution</b> on this exact geometry (0.25 mm grid); ions are traced with RK4 from the ribbon face with thermal (≈kT) energies and a cosine angular distribution.'),
      legendInline([{ label: 'transmitted through selector', color: '#4ff0c0' }, { label: 'passed source slit, cut by selector', color: '#ffc857' }, { label: 'lost on electrodes', color: '#ff5d5d' }]),
      toggle({ label: 'Cut-away at the dispersive mid-plane', value: true, onChange: (v) => { cutaway = v; applyClip(stack.group); } }).el,
      para('Heat map: electrostatic potential (dark = ground, bright = V<sub>acc</sub>), equipotentials every 500 V; grey = electrode cross-sections.'),
    );
    cards.push(intro.el);

    const ctl = section('Potentials', { icon: '🎚' });
    const kv = (v) => `${(v / 1000).toFixed(2)} kV`;
    const sAcc = slider({ label: 'Acceleration (filament) V<sub>acc</sub>', min: 6000, max: 10000, step: 50, value: st.accel, fmt: kv, onInput: (v) => { st.accel = v; refreshFmt(); recompute(); scanSoon(); } });
    sAcc.el.querySelector('label').innerHTML = 'Acceleration (filament) V<sub>acc</sub>';
    const sExt = slider({ label: 'Extraction', min: 0.5, max: 0.99, step: 0.001, value: st.ext, fmt: (v) => `${(v * 100).toFixed(1)} % · ${kv(v * st.accel)}`, onInput: (v) => { st.ext = v; recompute(); scanSoon(); } });
    const sFoc = slider({ label: 'Focus (mean of split plates)', min: 0.1, max: 0.95, step: 0.001, value: st.foc, fmt: (v) => `${(v * 100).toFixed(1)} % · ${kv(v * st.accel)}`, onInput: (v) => { st.foc = v; recompute(); markScan(); } });
    const sSteer = slider({ label: 'Y-symmetry (split-focus ΔV)', min: -0.06, max: 0.06, step: 0.0005, value: st.steer, fmt: (v) => `${(v * st.accel).toFixed(0)} V`, onInput: (v) => { st.steer = v; recompute(); scanSoon(); } });
    const sDefl = slider({ label: 'Deflection (±½ on plates)', min: -0.04, max: 0.04, step: 0.0005, value: st.defl, fmt: (v) => `${(v * st.accel).toFixed(0)} V`, onInput: (v) => { st.defl = v; recompute(); scanSoon(); } });
    function refreshFmt() { sExt.set(st.ext); sFoc.set(st.foc); sSteer.set(st.steer); sDefl.set(st.defl); }
    ctl.body.append(sAcc.el, sExt.el, sFoc.el, sSteer.el, sDefl.el);

    const slits = section('Slits & emitter', { icon: '▯' });
    const sSlit = slider({ label: 'Source (object) slit width', min: 0.1, max: 1.0, step: 0.01, value: st.slit, unit: 'mm', fmt: (v) => `${v.toFixed(2)} mm`, onInput: (v) => { st.slit = v; slitsSoon(); } });
    const sSel = slider({ label: 'Selector (α) slit width', min: 0.3, max: 4.0, step: 0.05, value: st.sel, fmt: (v) => `${v.toFixed(2)} mm`, onInput: (v) => { st.sel = v; slitsSoon(); } });
    const sT = slider({ label: 'Filament temperature', min: 1200, max: 2500, step: 10, value: st.T, fmt: (v) => `${v.toFixed(0)} K · kT ${(8.617e-5 * v).toFixed(3)} eV`, onInput: (v) => { st.T = v; glow(); recompute(); } });
    const sSpot = slider({ label: 'Sample spot width (dispersive)', min: 0.1, max: 1.6, step: 0.02, value: st.spot, fmt: (v) => `${v.toFixed(2)} mm`, onInput: (v) => { st.spot = v; recompute(); scanSoon(); } });
    const sOff = slider({ label: 'Sample offset on ribbon', min: -0.8, max: 0.8, step: 0.01, value: st.offset, fmt: (v) => `${v.toFixed(2)} mm`, onInput: (v) => { st.offset = v; recompute(); scanSoon(); } });
    slits.body.append(sSlit.el, sSel.el, sT.el, sSpot.el, sOff.el,
      note('Changing a slit changes the electrode geometry, so the six basis fields are re-solved (≈1 s).', ''));

    const tuneCard = section('Auto-tune & read-outs', { icon: '🎯' });
    const ro = readouts([
      { id: 'tSlit', label: 'Transmission · source slit' },
      { id: 'tSel', label: 'Transmission · selector' },
      { id: 'ang', label: 'Mean angle at exit' },
      { id: 'angRms', label: 'RMS divergence at exit' },
      { id: 'pos', label: 'Mean position at exit' },
      { id: 'posRms', label: 'RMS width at exit' },
      { id: 'pot', label: 'Electrode potentials', wide: true },
    ]);
    let tuning = false;
    const btns = buttons([
      { label: 'Auto-tune', primary: true, onClick: (b) => runAutoTune(b) },
      { label: 'Reset', onClick: () => reset() },
      { label: 'Scan focus', onClick: () => scanFocus() },
    ]);
    tuneCard.body.append(btns.el, ro.el, para('Auto-tune is coordinate descent over Extraction, Focus, Y-symmetry and Deflection maximising ions through the selector slit — the same idea as the "focus" routine of commercial TIMS software, which maximises the measured beam on a Faraday cup.'));

    const chartCard = section('Charts', { icon: '📈' });
    chartCard.body.append(h('h4', {}, 'Transmission vs focus potential'));
    const scanChart = new Chart(chartCard.body, { height: 160, xLabel: 'Focus potential (% of V_acc)', yLabel: 'Transmission (%)', yMin: 0, yMax: 100, legendPos: 'tr' });
    chartCard.body.append(h('h4', {}, 'Phase space at the source slit (y vs angle)'));
    const psChart = new Chart(chartCard.body, { height: 190, xLabel: 'y at source slit (mm)', yLabel: 'angle (mrad)', legendPos: 'tr' });
    cards.push(ctl.el, slits.el, tuneCard.el, chartCard.el);

    const phys = section('Physics & vendor names', { icon: '📘', open: false });
    phys.body.append(
      para('<b>Mass independence.</b> In a purely electrostatic lens the equation of motion is <i>m</i>·<b>a</b> = <i>q</i><b>E</b>; with energy conservation ½<i>mv</i>² = <i>q</i>(V<sub>fil</sub> − φ) the trajectory shape depends only on the potential, not on <i>m</i>. All isotopes of all elements follow the same paths — so one tune serves the whole mass spectrum, and the magnet (∝ √m) does the separation.'),
      para('<b>Extraction</b> sets the field at the filament surface (draw-out strength, immersion-lens power). <b>Focus</b> moves the crossover along the axis so the beam waist lands in the source slit. The focus electrode is <b>split</b>: the half-plate difference (<b>Y-symmetry</b> / X-symmetry, vendor dependent) steers the beam in the dispersive plane; separate <b>deflection</b> plates do fine steering. Thermo Triton XT: 10 kV, ±polarity, ≈0.5 eV energy spread.'),
      para('<b>Selector (α) slit.</b> Ions with large divergence travel far off-axis in the magnet, see fringe-field aberrations and scatter on surfaces — they create peak tails that spoil <b>abundance sensitivity</b> and round the peak tops. Narrowing the selector removes them: flatter, cleaner peaks, but fewer ions. Vendors add energy/angle filters (RPQ, WARP, Nu energy filter) in front of ion counters for the same reason.'),
      note('Geometry is a generic Nier-type stack (planar 2-D, no space charge, no fringe-field 3-D effects); absolute electrode settings of real instruments differ. The physics — superposition, mass independence, focus/steer/selector trade-offs — is general.', 'warn'),
      sources([
        { label: 'Thermo Triton XT brochure', url: 'https://documents.thermofisher.com/TFS-Assets/CMD/brochures/br-30537-triton-xt-tims-br30537-en.pdf' },
        { label: 'Nu TIMS brochure', url: 'https://www.nu-ins.com/-/media/ameteknuinstruments/files/products/brochures/tims_2019.pdf' },
      ]),
    );
    cards.push(phys.el);

    // ---------- logic ----------
    let res = null;
    function updateLabels() {
      if (!labels.can) return;
      const a = tuneAbs();
      const set = (k, name, v) => { if (labels[k]) labels[k].element.innerHTML = `${name}<small>${v}</small>`; };
      set('can', 'Filament can', kv(a.accel));
      set('extraction', 'Extraction', kv(a.extraction));
      set('focusUp', 'Focus / Y-sym', `${kv(a.focus)} ± ${(a.steer / 2).toFixed(0)} V`);
      set('ground', 'Ground', '0 V');
      set('deflUp', 'Deflection', `±${Math.abs(a.deflect / 2).toFixed(0)} V`);
      set('sourceSlit', 'Source slit', `${st.slit.toFixed(2)} mm · 0 V`);
      set('selector', 'Selector (α) slit', `${st.sel.toFixed(2)} mm · 0 V`);
    }
    function glow() {
      const bb = blackbodyRGB(st.T);
      filMat.emissive.setRGB(bb.r, bb.g * 0.92, bb.b * 0.85);
      filMat.emissiveIntensity = 3.2 * bb.intensity;
    }
    function analyse(r) {
      const atSlit = [];
      const exitT = [];
      for (const ray of r.rays) {
        const c = crossAt(ray.pts, (L.sourceSlit.x0 + L.sourceSlit.x1) / 2);
        if (c) atSlit.push({ ...c, ok: ray.fate === 'transmitted' });
        if (ray.fate === 'transmitted') exitT.push({ y: ray.yEnd, a: ray.angle });
      }
      return { atSlit, exitT };
    }
    const doCompute = () => {
      lens.apply(tuneAbs());
      res = lens.trace({ n: 140, filamentT: st.T, spot: st.spot * mm, offset: st.offset * mm });
      last = analyse(res);
      drawField();
      drawRays(res);
      updateLabels();
      // read-outs
      const pct = (x) => `${(x * 100).toFixed(1)} %`;
      ro.tSlit.set(pct(res.slitTransmission), res.slitTransmission > 0.6 ? 'good' : res.slitTransmission > 0.25 ? 'warn' : 'bad');
      ro.tSel.set(pct(res.transmission), res.transmission > 0.5 ? 'good' : res.transmission > 0.2 ? 'warn' : 'bad');
      const e = last.exitT;
      if (e.length) {
        const ma = e.reduce((s, x) => s + x.a, 0) / e.length;
        const my = e.reduce((s, x) => s + x.y, 0) / e.length;
        const sa = Math.sqrt(e.reduce((s, x) => s + (x.a - ma) ** 2, 0) / e.length);
        const sy = Math.sqrt(e.reduce((s, x) => s + (x.y - my) ** 2, 0) / e.length);
        ro.ang.set(`${(ma * 1e3).toFixed(2)} mrad`);
        ro.angRms.set(`${(sa * 1e3).toFixed(2)} mrad`);
        ro.pos.set(`${(my / mm).toFixed(3)} mm`);
        ro.posRms.set(`${(sy / mm).toFixed(3)} mm`);
      } else { ['ang', 'angRms', 'pos', 'posRms'].forEach((k) => ro[k].set('—', 'bad')); }
      const a = tuneAbs();
      ro.pot.set(`Fil/can ${kv(a.accel)} · Ext ${kv(a.extraction)} · Foc ${kv(a.focus)} (Δ${a.steer.toFixed(0)} V) · Defl ±${Math.abs(a.deflect / 2).toFixed(0)} V`);
      // phase-space chart
      const ok = last.atSlit.filter((p) => p.ok), bad = last.atSlit.filter((p) => !p.ok);
      psChart.setOptions({ xMin: -st.slit * 1.6, xMax: st.slit * 1.6 });
      psChart.setMarks([{ x: -st.slit / 2, color: '#8a94a3', label: 'slit' }, { x: st.slit / 2, color: '#8a94a3' }]);
      psChart.setSeries([
        { name: 'transmitted', type: 'scatter', color: '#10b981', x: ok.map((p) => p.y / mm), y: ok.map((p) => p.angle * 1e3), r: 2.4 },
        { name: 'cut by selector', type: 'scatter', color: '#f59e0b', x: bad.map((p) => p.y / mm), y: bad.map((p) => p.angle * 1e3), r: 2.4 },
      ]);
    };
    const recompute = rafThrottle(doCompute);

    let scanData = null;
    function markScan() {
      if (!scanData) return;
      scanChart.setMarks([{ x: st.foc * 100, color: '#ef4444', label: 'current' }]);
    }
    let scanToken = 0;
    async function scanFocus() {
      const token = ++scanToken;
      const xs = [], ys = [], ys2 = [];
      const save = st.foc;
      for (let i = 0; i <= 34; i++) {
        if (token !== scanToken || disposed) return;
        const f = 0.12 + (0.83 * i) / 34;
        lens.apply({ ...tuneAbs(), focus: f * st.accel });
        const r = lens.trace({ n: 60, filamentT: st.T, spot: st.spot * mm, offset: st.offset * mm, seed: 3 });
        xs.push(f * 100); ys.push(r.transmission * 100); ys2.push(r.slitTransmission * 100);
        if (i % 4 === 3) {
          scanChart.setSeries([
            { name: 'source slit', color: '#f59e0b', x: [...xs], y: [...ys2] },
            { name: 'selector', color: '#10b981', x: [...xs], y: [...ys], width: 2.2 },
          ]);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      st.foc = save;
      lens.apply(tuneAbs());
      scanData = { xs, ys };
      scanChart.setSeries([
        { name: 'source slit', color: '#f59e0b', x: xs, y: ys2 },
        { name: 'selector', color: '#10b981', x: xs, y: ys, width: 2.2 },
      ]);
      markScan();
    }
    const scanSoon = debounce(() => scanFocus(), 700);

    const slitsSoon = debounce(async () => {
      ctx.setLoading('Re-solving fields for new slit geometry…');
      await new Promise((r) => setTimeout(r, 30));
      lens.setSlits({ sourceSlitW: st.slit * mm, selectorW: st.sel * mm });
      buildStack();
      app.setExplode(app.state.explode);
      ctx.setLoading(null);
      doCompute();
      scanFocus();
    }, 450);

    async function runAutoTune(b) {
      if (tuning) return;
      tuning = true;
      b.disabled = true;
      const params = [
        { k: 'ext', lo: 0.5, hi: 0.99, s: sExt },
        { k: 'foc', lo: 0.1, hi: 0.95, s: sFoc },
        { k: 'steer', lo: -0.06, hi: 0.06, s: sSteer },
        { k: 'defl', lo: -0.04, hi: 0.04, s: sDefl },
      ];
      const score = () => { lens.apply(tuneAbs()); return lens.trace({ n: 70, filamentT: st.T, spot: st.spot * mm, offset: st.offset * mm, seed: 5 }).transmission; };
      let best = score();
      const passes = 3;
      let stepN = 0;
      const total = passes * params.length * 9;
      for (let p = 0; p < passes; p++) {
        for (const prm of params) {
          const span = (prm.hi - prm.lo) / Math.pow(2.5, p);
          const center = st[prm.k];
          let bestV = center;
          for (let i = -4; i <= 4; i++) {
            if (disposed) return;
            const v = Math.min(prm.hi, Math.max(prm.lo, center + (i / 4) * span / 2));
            st[prm.k] = v;
            const sc = score();
            if (sc > best + 1e-9) { best = sc; bestV = v; }
            stepN++;
            b.textContent = `Tuning… ${Math.round((100 * stepN) / total)} %`;
            if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
          }
          st[prm.k] = bestV;
          prm.s.set(bestV);
          doCompute();
          await new Promise((r) => setTimeout(r, 16));
        }
      }
      b.textContent = 'Auto-tune';
      b.disabled = false;
      tuning = false;
      doCompute();
      scanFocus();
    }

    function reset() {
      const slitChanged = st.slit !== DEF.slit || st.sel !== DEF.sel;
      Object.assign(st, DEF);
      sAcc.set(st.accel); sSlit.set(st.slit); sSel.set(st.sel); sT.set(st.T); sSpot.set(st.spot); sOff.set(st.offset);
      refreshFmt();
      glow();
      if (slitChanged) slitsSoon(); else { doCompute(); scanFocus(); }
    }

    // ---------- init ----------
    buildStack();
    glow();
    doCompute();
    setTimeout(() => scanFocus(), 50);

    const tmp = new THREE.Vector3();
    return {
      root,
      exploder,
      scale: 0.09,
      camera: { position: [-0.052, 0.082, -0.004], target: [0, -0.004, 0.035] },
      panel: cards,
      onExplode(t) {
        // the cut-away only makes sense for the assembled stack
        clipPlane.constant = t > 0.02 ? 1 : 0;
        const f = Math.max(0, 1 - t * 2.2);
        planeMat.opacity = 0.92 * f;
        plane.visible = f > 0.01;
        rayMat.opacity = 0.85 * f;
        flowPts.material.opacity = f;
      },
      update(dt) {
        const n = flow.curves.length;
        const arr = flowGeo.attributes.position.array;
        if (!n) { flowGeo.setDrawRange(0, 0); return; }
        flowGeo.setDrawRange(0, NFLOW);
        for (let i = 0; i < NFLOW; i++) {
          const c = flow.curves[i % n];
          flow.phase[i] = (flow.phase[i] + dt * 0.35) % 1;
          // ions accelerate: position ∝ t² near the filament → use u² mapping for a hint of it
          const u = flow.phase[i];
          c.getPoint(u * u * 0.4 + u * 0.6, tmp);
          arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z;
        }
        flowGeo.attributes.position.needsUpdate = true;
      },
      dispose() {
        disposed = true;
        scanToken++;
        scanChart.dispose(); psChart.dispose();
        disposers.forEach((f) => f());
        rayLines?.geometry.dispose();
      },
    };
  },
};
