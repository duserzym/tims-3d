// 3-D TIMS ion-source lens stack built from the same LENS_LAYOUT that the 2-D Laplace
// solver uses, so the meshes and the computed field are geometrically identical.
//
// Mapping: 2-D lens x (beam axis) → local +Z; 2-D y (transverse, dispersive plane) → local +X;
// local +Y is up (slits are long in Y, narrow in X — the dispersive direction).
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, plateWithSlit, rod, wire } from '../core/geom.js';
import { LENS_LAYOUT } from '../physics/sourceLens.js';
import { part } from './parts.js';

const mm = 1e-3;

export const ELECTRODE_INFO = {
  can: ['Filament can (acceleration)', 'Held at the full acceleration potential together with the filament. Shapes the near-filament field so ions are drawn from the ribbon face and not the edges.'],
  extraction: ['Extraction (draw-out) plate', 'A few hundred volts to a few kV below the filament: pulls ions off the hot surface and forms the first, strongly converging immersion lens.'],
  focusUp: ['Focus half-plate (+y)', 'One half of the split focus electrode. The mean focus potential sets the crossover position; the half-plate difference ("Y-/X-symmetry") steers the beam in the dispersive plane.'],
  focusDown: ['Focus half-plate (−y)', 'Second half of the split focus electrode — see Y-symmetry steering.'],
  ground: ['Ground plate', 'End of the acceleration gap: ions now have their full energy qV (≈10 keV) and drift field-free.'],
  deflUp: ['Deflection plate (+y)', 'Electrostatic steering plates (± half the deflection voltage) for fine alignment onto the source slit.'],
  deflDown: ['Deflection plate (−y)', 'Electrostatic steering plates (± half the deflection voltage) for fine alignment onto the source slit.'],
  sourceSlit: ['Source (object) slit', 'Defining slit at ground: the object imaged by the magnet onto the collector slits. Its width sets peak width and hence resolving power.'],
  selector: ['Selector (α) slit', 'Angular aperture: removes ions with large divergence. Narrower ⇒ flatter-topped, cleaner peaks and better abundance sensitivity, at the cost of transmission.'],
};

/**
 * @param {object} o
 * @returns {{group:THREE.Group, parts:object[], electrodes:Object<string,THREE.Object3D>, toWorld2D:(p:number[],h?:number)=>THREE.Vector3, length:number, height:number}}
 */
export function buildLensStack({ layout = LENS_LAYOUT, height = 0.02, detail = 'full', sourceSlitW = 0.4 * mm, selectorW = 2.0 * mm } = {}) {
  const L = layout;
  const full = detail === 'full';
  const group = new THREE.Group();
  group.name = 'Source lens stack';
  const parts = [];
  const electrodes = {};
  const W = L.yMax - L.yMin - 2 * mm; // plate width across X
  const H = height;
  const slitH = H * 0.62;
  const toWorld2D = ([x, y], h = 0) => new THREE.Vector3(y, h, x);
  const zMid = (L.can.x0 + L.selector.x1) / 2;
  const steel = M.steel();

  const addPart = (key, g, offset, order) => {
    const [name, info] = ELECTRODE_INFO[key];
    g.name = name;
    electrodes[key] = g;
    group.add(g);
    parts.push(part(g, offset, name, info, { order }));
  };
  const zOff = (z, k = 0.55) => [0, 0, (z - zMid) * k];

  function slitPlate(key, x0, x1, slit, order, lift = 0) {
    const t = x1 - x0;
    const g = new THREE.Group();
    g.add(mesh(plateWithSlit(W, H, t, slit, slitH), steel, { name: ELECTRODE_INFO[key][0] }));
    if (full) {
      const tab = mesh(new THREE.BoxGeometry(2.5 * mm, 3.5 * mm, t), steel);
      tab.position.set(W / 2 - 2.5 * mm, H / 2 + 1.6 * mm, 0);
      g.add(tab);
    }
    g.position.z = (x0 + x1) / 2;
    const off = zOff(g.position.z);
    off[1] = lift;
    addPart(key, g, off, order);
    return g;
  }

  slitPlate('can', L.can.x0, L.can.x1, L.can.slit, 0.55, 4 * mm);
  slitPlate('extraction', L.extraction.x0, L.extraction.x1, L.extraction.slit, 0.5, 8 * mm);

  // split focus plates (two halves separated in X)
  for (const [key, s] of [['focusUp', 1], ['focusDown', -1]]) {
    const t = L.focus.x1 - L.focus.x0;
    const g = new THREE.Group();
    const wHalf = W / 2 - L.focus.slit / 2;
    const m = mesh(new THREE.BoxGeometry(wHalf, H, t), steel, { name: ELECTRODE_INFO[key][0] });
    m.position.x = s * (L.focus.slit / 2 + wHalf / 2);
    g.add(m);
    if (full) {
      const tab = mesh(new THREE.BoxGeometry(2.5 * mm, 3.5 * mm, t), steel);
      tab.position.set(s * (W / 2 - 2.5 * mm), H / 2 + 1.6 * mm, 0);
      g.add(tab);
    }
    g.position.z = (L.focus.x0 + L.focus.x1) / 2;
    const off = zOff(g.position.z);
    off[0] = s * 9 * mm;
    off[1] = 12 * mm;
    addPart(key, g, off, 0.45);
  }

  slitPlate('ground', L.ground.x0, L.ground.x1, L.ground.slit, 0.4, 4 * mm);

  for (const [key, s] of [['deflUp', 1], ['deflDown', -1]]) {
    const g = new THREE.Group();
    const len = L.deflect.x1 - L.deflect.x0;
    const m = mesh(new THREE.BoxGeometry(L.deflect.t, H * 0.72, len), steel, { name: ELECTRODE_INFO[key][0] });
    g.add(m);
    g.position.set(s * (L.deflect.gap + L.deflect.t / 2), 0, (L.deflect.x0 + L.deflect.x1) / 2);
    addPart(key, g, [s * 12 * mm, 6 * mm, (g.position.z - zMid) * 0.55], 0.35);
  }

  slitPlate('sourceSlit', L.sourceSlit.x0, L.sourceSlit.x1, sourceSlitW, 0.3, 6 * mm);
  slitPlate('selector', L.selector.x0, L.selector.x1, selectorW, 0.25, 4 * mm);

  if (full) {
    // precision jaws on the source slit (polished, gold-tinted wear surface)
    const jawG = new THREE.Group();
    for (const s of [-1, 1]) {
      const j = mesh(new THREE.BoxGeometry(2.4 * mm, slitH + 2 * mm, 0.3 * mm), M.steelPolished());
      j.position.set(s * (sourceSlitW / 2 + 1.2 * mm), 0, -0.4 * mm);
      jawG.add(j);
    }
    jawG.position.z = (L.sourceSlit.x0 + L.sourceSlit.x1) / 2;
    group.add(jawG);
    parts.push(part(jawG, [0, 10 * mm, (jawG.position.z - zMid) * 0.55 - 4 * mm], 'Source-slit jaws', 'Polished precision jaws define the object slit width (typically 0.1–0.5 mm on TIMS). Some instruments allow the slit to be exchanged or adjusted.', { order: 0.28 }));

    // ceramic support rods (pass through all plates)
    const rods = new THREE.Group();
    const z0 = L.can.x0 - 1.5 * mm, z1 = L.selector.x1 + 1.5 * mm;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      rods.add(rod(new THREE.Vector3(sx * (W / 2 - 1.6 * mm), sy * (H / 2 - 1.6 * mm), z0), new THREE.Vector3(sx * (W / 2 - 1.6 * mm), sy * (H / 2 - 1.6 * mm), z1), 0.8 * mm, M.alumina(), 16));
    }
    // insulating spacers between electrodes (instanced)
    const gaps = [
      [L.can.x1, L.extraction.x0], [L.extraction.x1, L.focus.x0], [L.focus.x1, L.ground.x0],
      [L.ground.x1, L.deflect.x0], [L.deflect.x1, L.sourceSlit.x0], [L.sourceSlit.x1, L.selector.x0],
    ];
    const spGeo = new THREE.CylinderGeometry(1.4 * mm, 1.4 * mm, 1, 18);
    spGeo.rotateX(Math.PI / 2);
    const sp = new THREE.InstancedMesh(spGeo, M.alumina(), gaps.length * 4);
    let k = 0;
    const m4 = new THREE.Matrix4();
    for (const [a, b] of gaps) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const len = Math.min(b - a, 4 * mm);
      m4.compose(new THREE.Vector3(sx * (W / 2 - 1.6 * mm), sy * (H / 2 - 1.6 * mm), a + len / 2), new THREE.Quaternion(), new THREE.Vector3(1, 1, len));
      sp.setMatrixAt(k++, m4);
    }
    sp.castShadow = true;
    rods.add(sp);
    group.add(rods);
    parts.push(part(rods, [0, -18 * mm, 0], 'Alumina support rods & spacers', 'High-purity alumina rods and spacers insulate electrodes held at up to ~10 kV from each other and fix their spacing to ~0.01 mm.', { order: 0.65 }));

    // mounting rails
    const rails = new THREE.Group();
    for (const sx of [-1, 1]) {
      const r = mesh(new THREE.BoxGeometry(3 * mm, 2.5 * mm, z1 - z0 + 6 * mm), M.steelBrushed());
      r.position.set(sx * (W / 2 - 3 * mm), -H / 2 - 1.25 * mm, (z0 + z1) / 2);
      rails.add(r);
    }
    group.add(rails);
    parts.push(part(rails, [0, -28 * mm, 0], 'Mounting rails', 'Stainless rails that register the lens stack to the source housing so the optical axis is aligned to the magnet entrance.', { order: 0.7, shell: true }));

    // HV leads from each tab to a feedthrough block above
    const wires = new THREE.Group();
    const ft = mesh(new THREE.BoxGeometry(W * 0.8, 3 * mm, 6 * mm), M.alumina());
    ft.position.set(0, H / 2 + 14 * mm, zMid - 6 * mm);
    wires.add(ft);
    const tabs = [L.can, L.extraction, L.focus, L.ground, L.sourceSlit];
    tabs.forEach((e, i) => {
      const zc = (e.x0 + e.x1) / 2;
      const a = new THREE.Vector3(W / 2 - 2.5 * mm, H / 2 + 3.4 * mm, zc);
      const c = new THREE.Vector3(-W * 0.3 + i * W * 0.15, H / 2 + 12.5 * mm, zMid - 6 * mm);
      const b = new THREE.Vector3(a.x * 0.7, H / 2 + 9 * mm, (zc + c.z) / 2);
      wires.add(wire([a, b, c], 0.18 * mm, M.copper(), { seg: 24 }));
    });
    group.add(wires);
    parts.push(part(wires, [0, 22 * mm, 0], 'HV leads & feedthrough', 'Kapton-insulated copper leads to a ceramic multi-pin high-voltage feedthrough; each electrode is driven by its own precision supply.', { order: 0.75 }));
  }

  return { group, parts, electrodes, toWorld2D, length: L.xStop, height: H };
}
