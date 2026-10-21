// Faraday cup collectors and their high-ohmic amplifiers.
//
// Geometry follows a narrow-pitch multicollector cup (real cups are a few mm wide so that
// adjacent isotopes ~1 amu apart can be collected simultaneously): a defining entrance
// slit, an electron-suppression electrode held a few tens of volts negative, a small
// permanent-magnet pair (magnetic suppression of secondary electrons, cf. Nu TIMS brochure
// "electrostatic and magnetic suppression"), and a deep graphite-lined bucket whose inclined
// floor sends secondary electrons/sputtered ions into the walls rather than back out.
// Ions arrive along local +Z; the entrance slit is at z ≈ 0.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, plateWithSlit, rod, cfFlange, roundedBox, wire } from '../core/geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part } from './parts.js';

const mm = 1e-3;

/** Rectangular tube (walls only) extruded along +Z from z=0 to z=depth. */
function rectTube(wOut, hOut, wall, depth) {
  const s = new THREE.Shape();
  s.moveTo(-wOut / 2, -hOut / 2); s.lineTo(wOut / 2, -hOut / 2); s.lineTo(wOut / 2, hOut / 2); s.lineTo(-wOut / 2, hOut / 2); s.closePath();
  const wi = wOut - 2 * wall, hi = hOut - 2 * wall;
  const hole = new THREE.Path();
  hole.moveTo(-wi / 2, -hi / 2); hole.lineTo(-wi / 2, hi / 2); hole.lineTo(wi / 2, hi / 2); hole.lineTo(wi / 2, -hi / 2); hole.closePath();
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

const RESISTOR_LOOK = {
  R10: { len: 9 * mm, r: 1.6 * mm, color: 0x5a6b8c, label: '10¹⁰ Ω' },
  R11: { len: 12 * mm, r: 2.0 * mm, color: 0x2f3b6b, label: '10¹¹ Ω' },
  R12: { len: 15 * mm, r: 2.4 * mm, color: 0x3b2f6b, label: '10¹² Ω' },
  R13: { len: 19 * mm, r: 2.8 * mm, color: 0x5b2a55, label: '10¹³ Ω' },
  ATONA: { len: 0, r: 0, color: 0x222222, label: 'ATONA (no feedback resistor)' },
  ZEPTONA: { len: 0, r: 0, color: 0x222222, label: 'Zeptona (ATONA)' },
};

/**
 * Full Faraday cup (+ amplifier when detail === 'full').
 * @returns {{group, parts, anchors:{entry, cupFloor, feedthrough, resistor}, width, length, bucket, setResistor}}
 */
export function buildFaradayCup({ detail = 'full', resistorId = 'R11' } = {}) {
  const group = new THREE.Group();
  group.name = 'Faraday cup';
  const parts = [];
  const W = 6 * mm, H = 22 * mm; // bucket outer section
  const depth = 34 * mm;
  const z0 = 7 * mm; // bucket mouth

  // 1. entrance (defining) slit
  const slit = new THREE.Group();
  slit.add(mesh(plateWithSlit(14 * mm, 28 * mm, 0.5 * mm, 1.2 * mm, 13 * mm), M.steelPolished(), { name: 'entrance slit' }));
  group.add(slit);
  parts.push(part(slit, [0, 0, -24 * mm], 'Entrance (defining) slit',
    'Grounded slit that defines the collected beam width. Its width relative to the beam image sets the <b>flat-topped peak</b> needed for precise ratio measurements; slit edges are a source of scattered ions.', { order: 0.55 }));

  // 2. suppressor electrode
  const sup = new THREE.Group();
  const supPlate = mesh(plateWithSlit(12 * mm, 26 * mm, 0.4 * mm, 2.4 * mm, 16 * mm), M.steel(), { name: 'suppressor' });
  supPlate.position.z = 3 * mm;
  sup.add(supPlate);
  for (const s of [-1, 1]) {
    const ins = mesh(new THREE.CylinderGeometry(0.9 * mm, 0.9 * mm, 2.4 * mm, 16), M.alumina());
    ins.rotation.x = Math.PI / 2;
    ins.position.set(4.6 * mm, s * 11 * mm, 1.6 * mm);
    sup.add(ins);
  }
  group.add(sup);
  parts.push(part(sup, [0, 0, -15 * mm], 'Electron suppressor',
    'Electrode a few tens of volts negative of the cup. Secondary electrons released at the cup floor (yield of order 1 per ion at keV energies) are reflected back into the bucket; an escaping electron would make the positive-ion current read <b>high</b>.', { order: 0.45 }));

  // 3. magnetic suppression pair
  const mag = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = mesh(roundedBox(1.6 * mm, 9 * mm, 5 * mm, 0.3 * mm), M.magnetNdFe(), { name: 'suppression magnet' });
    m.position.set(s * 4.8 * mm, 0, 5.2 * mm);
    mag.add(m);
  }
  group.add(mag);
  parts.push(part(mag, [0, 14 * mm, -6 * mm], 'Magnetic suppression magnets',
    'Small permanent-magnet pair across the cup mouth. Low-energy electrons spiral in the transverse field and cannot leave; 10 keV ions are barely deflected. Nu Instruments describe combined electrostatic and magnetic suppression.', { order: 0.4 }));

  // 4. bucket: outer metal body + graphite liner + inclined graphite floor
  const bucket = new THREE.Group();
  const body = mesh(rectTube(W, H, 0.6 * mm, depth), M.steel(), { name: 'cup body' });
  body.position.z = z0;
  const back = mesh(new THREE.BoxGeometry(W, H, 0.8 * mm), M.steel());
  back.position.z = z0 + depth + 0.4 * mm;
  const liner = mesh(rectTube(W - 1.2 * mm, H - 1.2 * mm, 0.5 * mm, depth - 1 * mm), M.graphite(), { name: 'graphite liner' });
  liner.position.z = z0 + 0.6 * mm;
  // inclined floor: wedge filling the back so normals face sideways (trap secondaries)
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(0, 0); wedgeShape.lineTo(9 * mm, 0); wedgeShape.lineTo(9 * mm, W - 2.2 * mm); wedgeShape.closePath();
  const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, { depth: H - 2.2 * mm, bevelEnabled: false });
  wedgeGeo.translate(0, -(W - 2.2 * mm) / 2, -(H - 2.2 * mm) / 2);
  // shape plane: x→z(depth along beam), y→x(width); extrude→y(height)
  wedgeGeo.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  const wedge = mesh(wedgeGeo, M.graphite(), { name: 'inclined floor' });
  wedge.position.z = z0 + depth - 9 * mm;
  bucket.add(body, back, liner, wedge);
  group.add(bucket);
  parts.push(part(bucket, [0, 0, 0], 'Faraday bucket (graphite-lined)',
    'Deep, narrow bucket (aspect ratio ≫ 1) with graphite lining and an <b>inclined floor</b>: secondary electrons and sputtered/back-scattered particles are emitted towards the side walls instead of out of the mouth. Graphite has low secondary-electron and sputter yields and a low memory. Collection efficiency ≈ 1 regardless of mass — the reason Faradays have no mass bias, unlike ion counters.', { order: 0.2 }));

  // 5. housing shell
  const housing = new THREE.Group();
  const hs = mesh(rectTube(W + 5 * mm, H + 5 * mm, 0.5 * mm, depth + 4 * mm), M.steelBrushed(), { name: 'housing' });
  hs.position.z = z0 - 1 * mm;
  housing.add(hs);
  group.add(housing);
  parts.push(part(housing, [0, 26 * mm, 0], 'Cup shield / housing',
    'Grounded shield around each cup to suppress cross-talk between neighbouring cups and to define the electrostatic environment. Cups in an array sit at a pitch of only a few mm.', { order: 0.05, shell: true }));

  // 6. insulators + mounting rail
  const mount = new THREE.Group();
  for (const zz of [z0 + 6 * mm, z0 + depth - 6 * mm]) for (const s of [-1, 1]) {
    const ins = mesh(new THREE.CylinderGeometry(1.2 * mm, 1.2 * mm, 3.2 * mm, 16), M.alumina(), { name: 'alumina insulator' });
    ins.position.set(0, s * (H / 2 + 1.6 * mm), zz);
    mount.add(ins);
  }
  const rail = mesh(roundedBox(10 * mm, 3 * mm, depth + 18 * mm, 0.4 * mm), M.aluminium(), { name: 'mounting rail' });
  rail.position.set(0, -H / 2 - 4.7 * mm, z0 + depth / 2);
  mount.add(rail);
  group.add(mount);
  parts.push(part(mount, [0, -18 * mm, 0], 'Alumina insulators & rail',
    'The cup floats on high-purity alumina standoffs: leakage resistance must be ≫ the feedback resistor (≥10¹⁵ Ω) or it shunts the signal. On moveable arrays (Triton, Phoenix) the rail rides on a motor-driven carriage positioned to ≈ µm.', { order: 0.15 }));

  // 7. signal pin + feedthrough
  const zFT = z0 + depth + 14 * mm;
  const ft = new THREE.Group();
  ft.add(rod(new THREE.Vector3(0, 0, z0 + depth + 0.8 * mm), new THREE.Vector3(0, 0, zFT), 0.35 * mm, M.gold()));
  const flange = cfFlange(18 * mm, 3 * mm, 4 * mm, 6, M.steel(), M.steelPolished());
  flange.position.z = zFT;
  ft.add(flange);
  const cer = mesh(new THREE.CylinderGeometry(2.4 * mm, 2.4 * mm, 5 * mm, 20), M.alumina(), { name: 'feedthrough ceramic' });
  cer.rotation.x = Math.PI / 2;
  cer.position.z = zFT + 1 * mm;
  ft.add(cer);
  group.add(ft);
  parts.push(part(ft, [0, 0, 14 * mm], 'Signal pin & vacuum feedthrough',
    'Gold-plated pin carrying the femto- to nano-ampere ion current through a ceramic UHV feedthrough to the amplifier. Every surface on the input node must be clean and dry: picoamp leakage would swamp a 10¹³ Ω signal.', { order: 0.6 }));

  const anchors = {
    entry: new THREE.Vector3(0, 0, 0),
    cupFloor: new THREE.Vector3(0, 0, z0 + depth - 5 * mm),
    feedthrough: new THREE.Vector3(0, 0, zFT),
    resistor: new THREE.Vector3(0, 0, zFT + 40 * mm),
  };

  let setResistor = () => {};
  let length = zFT + 5 * mm;
  if (detail === 'full') {
    const zA = zFT + 12 * mm; // amplifier housing start
    const LA = 60 * mm;
    // coax
    const coax = new THREE.Group();
    coax.add(wire([new THREE.Vector3(0, 0, zFT + 2 * mm), new THREE.Vector3(0, -2 * mm, zFT + 6 * mm), new THREE.Vector3(0, -6 * mm, zA + 6 * mm), new THREE.Vector3(0, -6 * mm, zA + 14 * mm)], 1.1 * mm, M.black()));
    group.add(coax);
    parts.push(part(coax, [0, -8 * mm, 22 * mm], 'Shielded coax (triaxial) input lead',
      'Kept as short as possible: cable capacitance adds to the input node and microphonics/triboelectric charge appear as noise.', { order: 0.7 }));

    // amplifier housing (evacuated, thermostatted)
    const amp = new THREE.Group();
    const box = mesh(roundedBox(30 * mm, 26 * mm, LA, 2 * mm), M.panel(0xaab2bc), { name: 'amplifier housing' });
    box.position.set(0, -4 * mm, zA + LA / 2);
    amp.add(box);
    // cooling fins on top
    const finGeo = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.BoxGeometry(30 * mm, 3 * mm, 0.8 * mm);
      g.translate(0, 9 * mm + 1.5 * mm, zA + 6 * mm + i * 6 * mm);
      finGeo.push(g);
    }
    amp.add(mesh(mergeGeometries(finGeo), M.aluminium(), { name: 'thermostat fins' }));
    group.add(amp);
    parts.push(part(amp, [0, 46 * mm, 30 * mm], 'Evacuated, thermostatted amplifier housing',
      'Amplifiers live in a sealed, evacuated and temperature-stabilised housing (Thermo: ±0.01 °C/h). The feedback resistor’s value has a temperature coefficient, and the Johnson noise ∝ √T — vacuum also removes humidity-driven leakage.', { order: 0.0, shell: true }));

    // PCB + electronics
    const board = new THREE.Group();
    const pcb = mesh(new THREE.BoxGeometry(24 * mm, 1.4 * mm, LA - 8 * mm), M.pcb(), { name: 'PCB' });
    pcb.position.set(0, -10 * mm, zA + LA / 2);
    board.add(pcb);
    const op = mesh(roundedBox(7 * mm, 2.2 * mm, 9 * mm, 0.4 * mm), M.black(), { name: 'electrometer op-amp' });
    op.position.set(-5 * mm, -8.2 * mm, zA + 34 * mm);
    board.add(op);
    for (let i = 0; i < 8; i++) {
      const pin = mesh(new THREE.BoxGeometry(0.5 * mm, 0.9 * mm, 0.4 * mm), M.steelPolished());
      pin.position.set(-5 * mm + (i < 4 ? -3.9 : 3.9) * mm, -8.8 * mm, zA + 34 * mm + ((i % 4) - 1.5) * 2.2 * mm);
      board.add(pin);
    }
    const cap = mesh(roundedBox(3 * mm, 2 * mm, 4 * mm, 0.3 * mm), M.peek(), { name: 'feedback capacitor' });
    cap.position.set(6 * mm, -8.3 * mm, zA + 44 * mm);
    board.add(cap);
    // ADC / digitiser chip
    const adc = mesh(roundedBox(6 * mm, 1.6 * mm, 6 * mm, 0.3 * mm), M.black(), { name: 'ADC' });
    adc.position.set(4 * mm, -8.5 * mm, zA + 52 * mm);
    board.add(adc);
    group.add(board);
    parts.push(part(board, [0, -26 * mm, 30 * mm], 'Electrometer board',
      'Inverting transimpedance amplifier: an ultra-low-bias-current (≪ fA) electrometer op-amp drives V<sub>out</sub> = −I·R through the feedback network, followed by a voltage-to-frequency converter or ADC (Thermo quotes ~22-bit equivalent resolution).', { order: 0.75 }));

    // feedback resistor
    const res = new THREE.Group();
    const resGlass = mesh(new THREE.CylinderGeometry(1, 1, 1, 24), M.glass(), { name: 'resistor glass envelope' });
    const resCore = mesh(new THREE.CylinderGeometry(1, 1, 1, 24), M.resistorBody().clone(), { name: 'resistive film' });
    const leads = new THREE.Group();
    res.add(resGlass, resCore, leads);
    res.rotation.z = Math.PI / 2;
    res.position.set(6 * mm, -5.5 * mm, zA + 30 * mm);
    group.add(res);
    parts.push(part(res, [18 * mm, 20 * mm, 30 * mm], 'High-ohmic feedback resistor',
      'Glass-encapsulated thick-film resistor (10¹⁰–10¹³ Ω). Its Johnson–Nyquist noise sets the floor: current noise = √(4kTΔf/R), so the signal-to-noise ratio improves as √R. Larger R → slower response (τ = R·C<sub>stray</sub>) and gain that must be calibrated against a reference current.', { order: 0.85 }));
    anchors.resistor = res.position.clone();

    setResistor = (id) => {
      const L = RESISTOR_LOOK[id] ?? RESISTOR_LOOK.R11;
      const show = L.len > 0;
      res.visible = show;
      if (!show) return;
      resGlass.scale.set(L.r * 1.25, L.len, L.r * 1.25);
      resCore.scale.set(L.r, L.len * 0.82, L.r);
      resCore.material.color.setHex(L.color);
      leads.clear();
      for (const s of [-1, 1]) {
        const ld = mesh(new THREE.CylinderGeometry(0.3 * mm, 0.3 * mm, 6 * mm, 8), M.copper());
        ld.position.y = s * (L.len / 2 + 3 * mm);
        leads.add(ld);
      }
      res.userData.part = { name: `Feedback resistor ${L.label}`, info: res.userData.part?.info ?? '' };
    };
    setResistor(resistorId);
    length = zA + LA;
  }

  return { group, parts, anchors, width: W + 5 * mm, length, bucket, setResistor };
}

/** Light-weight cup for arrays (< 8 meshes). Ions arrive along +Z at the slit (z = 0). */
export function buildFaradayLite({ width = 5 * mm, height = 20 * mm, depth = 30 * mm } = {}) {
  const group = new THREE.Group();
  group.name = 'Faraday cup';
  const slit = mesh(plateWithSlit(width + 1.5 * mm, height + 4 * mm, 0.4 * mm, Math.min(1.2 * mm, width * 0.4), height * 0.55), M.steelPolished(), { name: 'cup slit' });
  const body = mesh(rectTube(width, height, 0.5 * mm, depth), M.steelBrushed(), { name: 'cup body' });
  body.position.z = 2 * mm;
  const liner = mesh(new THREE.BoxGeometry(width - 1 * mm, height - 1 * mm, 0.6 * mm), M.graphite(), { name: 'graphite floor' });
  liner.position.z = 2 * mm + depth - 1 * mm;
  liner.rotation.y = 0.5;
  const back = mesh(new THREE.BoxGeometry(width, height, 0.6 * mm), M.steel());
  back.position.z = 2 * mm + depth + 0.3 * mm;
  const ins = mesh(new THREE.BoxGeometry(width * 0.8, 2.4 * mm, depth * 0.7), M.alumina(), { name: 'insulator' });
  ins.position.set(0, -height / 2 - 1.2 * mm, 2 * mm + depth / 2);
  const pin = rod(new THREE.Vector3(0, 0, 2 * mm + depth + 0.6 * mm), new THREE.Vector3(0, 0, 2 * mm + depth + 9 * mm), 0.3 * mm, M.gold());
  group.add(slit, body, liner, back, ins, pin);
  const parts = [part(group, [0, 0, 0], 'Faraday cup', 'Graphite-lined Faraday bucket with defining slit. Collects every ion (no mass bias); current is measured with a high-ohmic or capacitive amplifier.')];
  return { group, parts, anchors: { entry: new THREE.Vector3(0, 0, 0), floor: new THREE.Vector3(0, 0, depth) }, length: depth + 11 * mm };
}

/** Compact ion-counter (SEM) can for array positions (≤ 6 meshes). Ions arrive along +Z. */
export function buildIonCounterLite({ width = 9 * mm, height = 22 * mm, depth = 46 * mm } = {}) {
  const group = new THREE.Group();
  group.name = 'Ion counter';
  const front = mesh(plateWithSlit(width + 2 * mm, height + 3 * mm, 0.5 * mm, 1.2 * mm, height * 0.45), M.steelPolished(), { name: 'counter aperture' });
  const can = mesh(roundedBox(width, height, depth, 1 * mm), M.steel(), { name: 'SEM can' });
  can.position.z = depth / 2 + 1 * mm;
  const conv = mesh(new THREE.BoxGeometry(width * 0.7, height * 0.5, 1 * mm), M.dynode(), { name: 'conversion dynode' });
  conv.position.set(0, 0, 3 * mm);
  conv.rotation.y = 0.6;
  const ins = mesh(new THREE.CylinderGeometry(2.5 * mm, 2.5 * mm, 6 * mm, 16), M.alumina(), { name: 'HV feedthrough' });
  ins.position.set(0, height / 2 + 3 * mm, depth * 0.6);
  const pre = mesh(roundedBox(width + 2 * mm, 8 * mm, 14 * mm, 1 * mm), M.black(), { name: 'pre-amp / discriminator' });
  pre.position.set(0, 0, depth + 8 * mm);
  group.add(front, can, conv, ins, pre);
  const parts = [part(group, [0, 0, 0], 'Ion counter (SEM)', 'Discrete-dynode secondary electron multiplier with pulse-counting electronics, for beams below ~10⁶ cps. Gain ~10⁷–10⁸; requires dead-time, yield and gain calibration.')];
  return { group, parts, anchors: { entry: new THREE.Vector3(0, 0, 0) }, length: depth + 15 * mm };
}
