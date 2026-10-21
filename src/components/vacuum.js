// Vacuum hardware. Convention: every builder puts its connection flange at the local
// origin with the flange normal along +Y; the body hangs towards −Y. Rotate the returned
// group to mount it elsewhere. Sizes scale with pumping speed but stay in realistic ranges.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, cfFlange, tubeShell, roundedBox, rod, mergeGeometries } from '../core/geom.js';
import { part } from './parts.js';

const mm = 1e-3;

/** CF flange lying in XZ (normal +Y). */
function flangeY(od, t, bore, n) {
  const f = cfFlange(od, t, bore, n, M.steel(), M.steelPolished());
  f.rotation.x = -Math.PI / 2;
  return f;
}

/** Turbomolecular pump. Returns {group, parts, rotor, update(dt)}. */
export function buildTurboPump({ speed = 400 } = {}) {
  const k = Math.cbrt(speed / 400);
  const R = 0.085 * k, Hb = 0.2 * k, od = speed >= 250 ? 0.203 : 0.152;
  const group = new THREE.Group();
  group.name = `turbomolecular pump ${speed} L/s`;
  const parts = [];

  const inlet = flangeY(od, 0.022, R * 2 * 0.92, 16);
  inlet.position.y = -0.011;
  group.add(inlet);

  const housing = new THREE.Group();
  const hs = mesh(tubeShell(R, R - 0.004, Hb), M.steelBrushed(), { name: 'pump housing' });
  hs.position.y = -0.022 - Hb / 2;
  housing.add(hs);
  group.add(housing);
  parts.push(part(housing, [R * 2.6, 0, 0], 'Turbo pump housing',
    'Stainless housing. Pumping relies on blade tip speeds comparable to the thermal velocity of gas molecules (rotors spin at several hundred to ~1500 Hz).', { order: 0.05, shell: true }));

  // rotor: alternating bladed disks merged into one mesh
  const rotor = new THREE.Group();
  const rg = [], sg = [];
  const stages = 9;
  const hub = new THREE.CylinderGeometry(R * 0.38, R * 0.42, Hb * 0.86, 32);
  hub.translate(0, -0.022 - Hb * 0.45, 0);
  rg.push(hub);
  for (let s = 0; s < stages; s++) {
    const y = -0.03 - (s * Hb * 0.8) / stages;
    const nb = 16;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2;
      const blade = new THREE.BoxGeometry(R * 0.54, 0.0012, R * 0.2);
      blade.rotateX(0.55);
      blade.translate(R * 0.66, 0, 0);
      blade.rotateY(a);
      blade.translate(0, y, 0);
      rg.push(blade);
      if (s < stages - 1) {
        const st = new THREE.BoxGeometry(R * 0.5, 0.001, R * 0.18);
        st.rotateX(-0.55);
        st.translate(R * 0.7, 0, 0);
        st.rotateY(a + Math.PI / nb);
        st.translate(0, y - (Hb * 0.4) / stages, 0);
        sg.push(st);
      }
    }
  }
  const rotorMesh = mesh(mergeGeometries(rg), M.aluminium(), { name: 'rotor' });
  rotor.add(rotorMesh);
  const statorMesh = mesh(mergeGeometries(sg), M.steelBrushed(), { name: 'stator' });
  group.add(rotor, statorMesh);
  parts.push(part(rotor, [0, 0.12 * k, 0], 'Rotor (bladed disks)',
    'Inclined blades give molecules a momentum component towards the exhaust; compression ratio rises steeply with molecular mass, so heavy organics are pumped very effectively while H₂ dominates the residual gas.', { order: 0.4 }));
  parts.push(part(statorMesh, [0, 0.05 * k, 0], 'Stator disks', 'Stationary blade rows with opposite pitch, interleaved with the rotor.', { order: 0.3 }));

  // motor/bearing section + fore-vacuum port + drive electronics
  const base = new THREE.Group();
  const mot = mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.9, 0.07 * k, 40), M.steel(), { name: 'motor section' });
  mot.position.y = -0.022 - Hb - 0.035 * k;
  base.add(mot);
  const fore = rod(new THREE.Vector3(R * 0.6, mot.position.y + 0.01, 0), new THREE.Vector3(R * 1.45, mot.position.y + 0.01, 0), 0.012, M.steelPolished());
  base.add(fore);
  const kf = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 24), M.aluminium(), { name: 'KF fore-vacuum flange' });
  kf.rotation.z = Math.PI / 2;
  kf.position.set(R * 1.45, mot.position.y + 0.01, 0);
  base.add(kf);
  const edu = mesh(roundedBox(0.09 * k, 0.05 * k, 0.12 * k, 0.006), M.panel(0x3a3f47), { name: 'drive electronics' });
  edu.position.set(-R * 0.4, mot.position.y - 0.045 * k, R * 0.2);
  base.add(edu);
  group.add(base);
  parts.push(part(base, [0, -0.1 * k, 0], 'Motor, bearings & drive electronics',
    'Magnetically levitated or hybrid ceramic-bearing motor; the fore-vacuum port connects to an oil-free scroll pump.', { order: 0.2 }));

  let spin = 0;
  return {
    group, parts, rotor,
    update(dt, on = true) { if (on) { spin += dt * 40; rotor.rotation.y = spin; } },
  };
}

/** Sputter-ion pump with ferrite magnets. */
export function buildIonPump({ speed = 75 } = {}) {
  const k = Math.cbrt(speed / 75);
  const W = 0.26 * k, D = 0.11 * k, H = 0.22 * k;
  const group = new THREE.Group();
  group.name = `ion pump ${speed} L/s`;
  const parts = [];
  const neckL = 0.06;
  group.add(flangeY(0.114, 0.018, 0.064, 8));
  const neck = mesh(tubeShell(0.035, 0.032, neckL), M.steelPolished(), { name: 'pump neck' });
  neck.position.y = -neckL / 2;
  group.add(neck);

  const body = new THREE.Group();
  const bx = mesh(roundedBox(W, H, D, 0.01), M.steelBrushed(), { name: 'pump body' });
  bx.position.y = -neckL - H / 2;
  body.add(bx);
  group.add(body);
  parts.push(part(body, [0, 0, -0.12 * k], 'Pump body (diode elements)', 'Welded stainless body containing the Penning-cell elements.', { order: 0.05, shell: true }));

  // anode cell array (merged)
  const cells = [];
  const nx = 7, ny = 6;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const c = new THREE.CylinderGeometry(0.0095 * k, 0.0095 * k, D * 0.55, 14, 1, true);
    c.rotateX(Math.PI / 2);
    c.translate((i - (nx - 1) / 2) * 0.021 * k * 1.55, -neckL - H / 2 + (j - (ny - 1) / 2) * 0.03 * k, 0);
    cells.push(c);
  }
  const cellMesh = mesh(mergeGeometries(cells), M.steelPolished(), { name: 'anode cells' });
  const cath = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(W * 0.9, H * 0.88, 0.002), M.titanium?.() ?? M.tantalum(), { name: 'Ti cathode plate' });
    p.position.set(0, -neckL - H / 2, s * D * 0.33);
    cath.add(p);
  }
  group.add(cellMesh, cath);
  parts.push(part(cellMesh, [0, 0.0, 0.0], 'Penning anode cells',
    'Stainless cylinders at +3–7 kV between titanium cathodes. Electrons trapped by the magnetic field ionize gas; ions sputter Ti, which buries and chemically getters gas molecules. No moving parts and no vibration — ideal for the analyser.', { order: 0.5 }));
  parts.push(part(cath, [0, 0, 0.06 * k], 'Titanium cathodes', 'Sputtered titanium forms the gettering film.', { order: 0.45 }));

  // ferrite magnets + yoke
  const mag = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = mesh(roundedBox(W * 0.86, H * 0.86, 0.03 * k, 0.004), M.black(), { name: 'ferrite magnet' });
    m.position.set(0, -neckL - H / 2, s * (D / 2 + 0.015 * k));
    mag.add(m);
  }
  const yoke = mesh(roundedBox(0.012, H * 0.9, D + 0.075 * k, 0.003), M.iron(), { name: 'magnet yoke' });
  yoke.position.set(W / 2 + 0.008, -neckL - H / 2, 0);
  mag.add(yoke);
  group.add(mag);
  parts.push(part(mag, [0, 0, 0.16 * k], 'Ferrite magnets & yoke', '~0.1–0.2 T field confines the discharge electrons. Stray field must be kept away from the ion beam.', { order: 0.15 }));

  const hv = new THREE.Group();
  const ft = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 20), M.alumina(), { name: 'HV feedthrough' });
  ft.rotation.z = Math.PI / 2;
  ft.position.set(-W / 2 - 0.025, -neckL - H * 0.3, 0);
  hv.add(ft);
  hv.add(rod(new THREE.Vector3(-W / 2 - 0.05, -neckL - H * 0.3, 0), new THREE.Vector3(-W / 2 - 0.12, -neckL - H * 0.9, 0.05), 0.006, M.black()));
  group.add(hv);
  parts.push(part(hv, [-0.06 * k, 0, 0], 'HV feedthrough & cable', 'Pump current doubles as a pressure gauge (~10⁻¹¹–10⁻⁵ mbar).', { order: 0.6 }));
  return { group, parts };
}

/** Liquid-nitrogen cold trap (dewar on a CF flange). */
export function buildColdTrap() {
  const group = new THREE.Group();
  group.name = 'LN₂ cold trap';
  const parts = [];
  group.add(flangeY(0.152, 0.02, 0.1, 16));
  const dewar = new THREE.Group();
  const shell = mesh(tubeShell(0.075, 0.072, 0.26), M.ln2(), { name: 'dewar' });
  shell.position.y = -0.02 - 0.13;
  const cap = mesh(new THREE.SphereGeometry(0.075, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.ln2());
  cap.position.y = -0.28;
  dewar.add(shell, cap);
  group.add(dewar);
  parts.push(part(dewar, [0.2, 0, 0], 'Dewar vessel', 'Vacuum-insulated LN₂ reservoir (Nu TIMS: ~24 h hold time per fill).', { order: 0.05, shell: true }));

  const cold = new THREE.Group();
  const res = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 32), M.copper(), { name: 'LN₂ reservoir' });
  res.position.y = -0.16;
  cold.add(res);
  const fins = [];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.CylinderGeometry(0.066, 0.066, 0.003, 32);
    f.translate(0, -0.07 - i * 0.032, 0);
    fins.push(f);
  }
  cold.add(mesh(mergeGeometries(fins), M.copper(), { name: 'cryo-baffles' }));
  const liquid = mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.14, 32), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transmission: 0.7, roughness: 0.05, transparent: true, opacity: 0.6, name: 'liquid nitrogen' }));
  liquid.position.y = -0.19;
  cold.add(liquid);
  group.add(cold);
  parts.push(part(cold, [0, 0, 0], 'Cold surfaces (77 K)', 'Condenses water and hydrocarbons in the source after a turret change, lowering source pressure quickly and reducing hydride/organic interferences.', { order: 0.4 }));

  const fill = new THREE.Group();
  fill.add(rod(new THREE.Vector3(0.03, -0.02, 0), new THREE.Vector3(0.03, 0.12, 0), 0.008, M.steelPolished()));
  const funnel = mesh(new THREE.CylinderGeometry(0.025, 0.008, 0.04, 20, 1, true), M.steelPolished(), { name: 'fill funnel' });
  funnel.position.set(0.03, 0.14, 0);
  fill.add(funnel);
  fill.add(rod(new THREE.Vector3(-0.03, -0.02, 0), new THREE.Vector3(-0.03, 0.06, 0), 0.005, M.steelPolished()));
  group.add(fill);
  parts.push(part(fill, [0, 0.08, 0], 'Fill & vent ports', 'LN₂ fill tube and boil-off vent.', { order: 0.6 }));
  return { group, parts };
}

/** Oil-free scroll backing pump. */
export function buildScrollPump() {
  const group = new THREE.Group();
  group.name = 'scroll pump';
  const parts = [];
  const port = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 24), M.aluminium(), { name: 'KF inlet' });
  port.position.y = -0.004;
  group.add(port);
  const body = new THREE.Group();
  const b = mesh(roundedBox(0.42, 0.26, 0.24, 0.03), M.panel(0xb3b8bf), { name: 'pump enclosure' });
  b.position.set(0, -0.15 - 0.13, 0);
  body.add(b);
  const grille = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 40), M.black(), { name: 'fan grille' });
  grille.rotation.z = Math.PI / 2;
  grille.position.set(-0.215, -0.28, 0);
  body.add(grille);
  group.add(body);
  const hose = new THREE.Group();
  hose.add(rod(new THREE.Vector3(0, -0.008, 0), new THREE.Vector3(0, -0.15, 0), 0.016, M.steelBrushed()));
  group.add(hose);
  const scroll = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 40), M.aluminium(), { name: 'orbiting scroll' });
  scroll.rotation.z = Math.PI / 2;
  scroll.position.set(0.12, -0.28, 0);
  group.add(scroll);
  parts.push(part(body, [0, -0.15, 0], 'Scroll pump', 'Oil-free fore-vacuum pump (no oil back-streaming into the TIMS source).', { order: 0.1, shell: true }));
  parts.push(part(scroll, [0.15, -0.1, 0], 'Orbiting scroll', 'Two interleaved spirals trap and compress gas pockets towards the exhaust.', { order: 0.4 }));
  parts.push(part(hose, [0, 0, 0], 'Fore-line', 'Bellows hose to the turbo fore-vacuum port.', { order: 0 }));
  return { group, parts };
}

/** Vacuum gauge (cold cathode / Pirani combination) on a DN40CF flange. */
export function buildGauge() {
  const group = new THREE.Group();
  group.name = 'vacuum gauge';
  const parts = [];
  group.add(flangeY(0.07, 0.013, 0.035, 6));
  const tube = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 24), M.steelPolished(), { name: 'gauge tube' });
  tube.position.y = -0.045;
  const head = mesh(roundedBox(0.06, 0.07, 0.06, 0.006), M.panel(0x2f343c), { name: 'gauge head' });
  head.position.y = -0.11;
  const lcd = mesh(new THREE.PlaneGeometry(0.04, 0.016), new THREE.MeshBasicMaterial({ color: 0x47ff9a, toneMapped: false }));
  lcd.position.set(0, -0.1, 0.0305);
  group.add(tube, head, lcd);
  parts.push(part(group, [0, 0, 0], 'Vacuum gauge', 'Cold-cathode/Pirani combination gauge; pressures are logged by the instrument software (Nu brochure).'));
  return { group, parts };
}

/** All-metal gate valve with pneumatic actuator; through-axis along Y. */
export function buildGateValve({ bore = 0.1 } = {}) {
  const group = new THREE.Group();
  group.name = 'gate valve';
  const parts = [];
  const od = bore * 1.55;
  const top = flangeY(od, 0.018, bore, 12);
  const body = mesh(roundedBox(od * 1.05, 0.07, od * 1.9, 0.006), M.steelBrushed(), { name: 'valve body' });
  body.position.set(0, -0.045, od * 0.4);
  const bot = flangeY(od, 0.018, bore, 12);
  bot.position.y = -0.09;
  const act = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 28), M.aluminium(), { name: 'pneumatic actuator' });
  act.rotation.x = Math.PI / 2;
  act.position.set(0, -0.045, od * 1.35 + 0.08);
  const gate = mesh(new THREE.CylinderGeometry(bore * 0.55, bore * 0.55, 0.01, 40), M.steelPolished(), { name: 'gate' });
  gate.position.set(0, -0.045, 0);
  group.add(top, body, bot, act, gate);
  parts.push(part(body, [0, 0, 0], 'Gate valve', 'Isolates the source from the analyser so the turret can be exchanged while the analyser stays at UHV.', { shell: true }));
  parts.push(part(act, [0, 0, 0.08], 'Pneumatic actuator', 'Software-controlled; closes automatically on a vacuum fault.', { order: 0.3 }));
  parts.push(part(gate, [0, 0.12, 0], 'Gate plate', 'Sealing plate with Viton or metal seal.', { order: 0.5 }));
  return { group, parts };
}
