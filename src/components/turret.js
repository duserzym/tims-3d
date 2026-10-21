// Sample turret (magazine wheel). Filament assemblies sit on the rim with their local +Z
// pointing radially outward; the active position faces the extraction lens along the
// turret's local +Z. Wheel axis = local +Y.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, plateWithSlit, roundedBox, mergeGeometries } from '../core/geom.js';
import { buildFilamentAssembly } from './filament.js';
import { part } from './parts.js';

const mm = 1e-3;

/**
 * @returns {{group, parts, activePoint:THREE.Vector3, activeDir:THREE.Vector3, setActive:(i:number)=>void, assemblies:object[], wheel:THREE.Group, radius:number}}
 */
export function buildTurret({ n = 20, config = 'single', radius = null, enclosed = false, metals } = {}) {
  const R = radius ?? Math.max(0.04, (n * 16 * mm) / (2 * Math.PI));
  const group = new THREE.Group();
  group.name = `${n}-position sample turret`;
  const parts = [];
  const wheel = new THREE.Group();
  wheel.name = 'turret wheel';
  group.add(wheel);

  // wheel plate with lightening holes
  const s = new THREE.Shape();
  s.absarc(0, 0, R + 4 * mm, 0, Math.PI * 2, false);
  const nh = Math.max(5, Math.round(n / 4));
  for (let i = 0; i < nh; i++) {
    const a = (i / nh) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.17, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const plateGeo = new THREE.ExtrudeGeometry(s, { depth: 3 * mm, bevelEnabled: true, bevelSize: 0.5 * mm, bevelThickness: 0.5 * mm, curveSegments: 48 });
  plateGeo.rotateX(Math.PI / 2);
  const plate = mesh(plateGeo, M.steelBrushed(), { name: 'turret plate' });
  plate.position.y = -6.2 * mm;
  wheel.add(plate);
  const hub = mesh(new THREE.CylinderGeometry(9 * mm, 9 * mm, 10 * mm, 32), M.steel(), { name: 'hub' });
  hub.position.y = -11 * mm;
  wheel.add(hub);

  const assemblies = [];
  const encGeos = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const fa = buildFilamentAssembly({ config, compact: true, sample: true, metals });
    fa.group.position.set(Math.sin(th) * R, -6.2 * mm, Math.cos(th) * R);
    fa.group.rotation.y = th;
    wheel.add(fa.group);
    assemblies.push({ ...fa, index: i, angle: th });
    if (enclosed) {
      // enclosure can: back + 2 sides + top, front plate with slot — merged for all positions
      const m4 = new THREE.Matrix4().makeRotationY(th).setPosition(Math.sin(th) * R, -6.2 * mm, Math.cos(th) * R);
      const pieces = [];
      const front = plateWithSlit(12 * mm, 15 * mm, 0.4 * mm, 4.5 * mm, 2.2 * mm, { bevel: 0 });
      front.translate(0, 9 * mm, 4.2 * mm);
      pieces.push(front);
      for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.4 * mm, 15 * mm, 8.4 * mm); g.translate(sx * 6 * mm, 7.5 * mm, 0); pieces.push(g); }
      const top = new THREE.BoxGeometry(12 * mm, 0.4 * mm, 8.4 * mm); top.translate(0, 15 * mm, 0); pieces.push(top);
      const back = new THREE.BoxGeometry(12 * mm, 15 * mm, 0.4 * mm); back.translate(0, 7.5 * mm, -4.2 * mm); pieces.push(back);
      for (const p of pieces) { p.applyMatrix4(m4); encGeos.push(p.index ? p.toNonIndexed() : p); }
    }
  }
  let enclosures = null;
  if (enclosed) {
    // ensure attribute compatibility (all non-indexed with position/normal/uv)
    const norm = encGeos.map((g) => { const ng = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k); return ng; });
    enclosures = mesh(mergeGeometries(norm), M.steel(), { name: 'filament enclosures' });
    wheel.add(enclosures);
  }

  // drive shaft + motor + optical position sensor
  const drive = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(4 * mm, 4 * mm, 60 * mm, 20), M.steelPolished(), { name: 'drive shaft' });
  shaft.position.y = -45 * mm;
  const fth = mesh(new THREE.CylinderGeometry(17 * mm, 17 * mm, 8 * mm, 32), M.steel(), { name: 'rotary feedthrough' });
  fth.position.y = -72 * mm;
  const motor = mesh(roundedBox(42 * mm, 48 * mm, 42 * mm, 3 * mm), M.black(), { name: 'stepper motor' });
  motor.position.y = -101 * mm;
  drive.add(shaft, fth, motor);
  group.add(drive);
  const sensor = new THREE.Group();
  const fork = mesh(roundedBox(10 * mm, 14 * mm, 8 * mm, 1 * mm), M.black(), { name: 'optical position sensor' });
  fork.position.set(0, -6 * mm, -(R + 9 * mm));
  const led = mesh(new THREE.SphereGeometry(1.2 * mm, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false }));
  led.position.set(0, -1 * mm, -(R + 5 * mm));
  sensor.add(fork, led);
  group.add(sensor);

  parts.push(part(wheel, [0, 0.06, 0], `Turret wheel (${n} positions)`,
    `Rotating sample magazine holding ${n} ${config}-filament assemblies. The selected position is indexed in front of the extraction lens; the rest wait under vacuum, so a full batch runs unattended.` +
    (enclosed ? ' Each assembly is fully enclosed to prevent cross-contamination (Nu TIMS brochure).' : ''), { order: 0.3 }));
  parts.push(part(drive, [0, -0.07, 0], 'Drive shaft, rotary feedthrough & stepper motor', 'Rotates the turret through a UHV rotary feedthrough under software control.', { order: 0.1 }));
  parts.push(part(sensor, [0, 0, -0.05], 'Optical position sensor', 'Visible-light sensing of the turret position (Nu TIMS brochure) for reproducible filament alignment.', { order: 0.2 }));

  const fh = assemblies[0]?.height ?? 9 * mm;
  const activePoint = new THREE.Vector3(0, -6.2 * mm + fh, R + 0.05 * mm);
  const activeDir = new THREE.Vector3(0, 0, 1);
  const setActive = (i) => { wheel.rotation.y = -assemblies[((i % n) + n) % n].angle; };
  return { group, parts, activePoint, activeDir, setActive, assemblies, wheel, radius: R, enclosures };
}
