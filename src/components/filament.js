// TIMS filament assemblies: single, double and triple ribbon configurations.
//
// Real dimensions: Re/Ta/W ribbon ≈ 0.76 mm wide × 0.025–0.05 mm thick, ~10 mm long,
// spot-welded to two posts that pass through a ceramic/glass header. Ions leave the
// ionization ribbon along +Z (towards the extraction lens); +Y is up.
// Multi-filament geometry is schematic (vendors differ) but preserves the physics: the
// evaporation ribbon(s) face the ionization ribbon at ≈1–2 mm so neutrals evaporated from
// the cooler sample filament strike the hotter ionization filament.
import * as THREE from 'three';
import { M, filamentMaterial } from '../core/materials.js';
import { mesh, rod } from '../core/geom.js';
import { blackbodyRGB, FILAMENT_METALS } from '../physics/saha.js';
import { part } from './parts.js';

const mm = 1e-3;

function ribbon({ metal = 'Re', width = 0.76 * mm, thick = 0.04 * mm, span = 3.6 * mm, height = 9 * mm, sample = false }) {
  // a flat-topped "U" bridge: two legs welded to posts + a horizontal top where the sample sits
  const grp = new THREE.Group();
  const mat = filamentMaterial(FILAMENT_METALS[metal]?.color ?? 0xbfc3ca);
  const top = mesh(new THREE.BoxGeometry(span, width, thick), mat, { name: 'ribbon top' });
  top.position.set(0, height, 0);
  grp.add(top);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(thick, height * 0.42, width), mat);
    // legs are bent so the ribbon plane rotates 90°; keep geometric hint of the weld
    leg.rotation.y = Math.PI / 2;
    leg.position.set((s * span) / 2, height * 0.79, 0);
    grp.add(leg);
  }
  let spot = null;
  if (sample) {
    spot = mesh(new THREE.SphereGeometry(0.42 * mm, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.95, name: 'sample + activator' }));
    spot.scale.set(1.5, 0.22, 0.75);
    spot.rotation.x = Math.PI / 2;
    spot.position.set(0, height, thick / 2);
    grp.add(spot);
  }
  return { grp, mat, spot, top };
}

/**
 * @param {object} o
 * @param {'single'|'double'|'triple'|'ntims'} o.config
 * @param {{ion:string, evap:string}} [o.metals]
 * @param {boolean} [o.sample=true]
 * @returns {{group, parts, ribbons:{role:string, mat, obj, T:number}[], setTemperature:(i:number, T:number)=>void, emitPoint:THREE.Vector3}}
 */
export function buildFilamentAssembly({ config = 'single', metals = { ion: 'Re', evap: 'Re' }, sample = true, compact = false } = {}) {
  const group = new THREE.Group();
  group.name = `${config} filament assembly`;
  const parts = [];
  const H = 9 * mm;

  // header: ceramic disc + metal can flange
  const header = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(5.5 * mm, 5.5 * mm, 2.2 * mm, 40), M.alumina(), { name: 'ceramic header' });
  base.position.y = 1.1 * mm;
  const rim = mesh(new THREE.CylinderGeometry(6.2 * mm, 6.2 * mm, 0.8 * mm, 40), M.steel(), { name: 'header rim' });
  rim.position.y = 0.4 * mm;
  header.add(base, rim);
  group.add(header);
  parts.push(part(header, [0, -7 * mm, 0], 'Filament header', 'Ceramic insulating header with metal rim. Posts are brazed through it; the whole assembly floats at the acceleration potential (≈10 kV).', { order: 0.1 }));

  const nPairs = config === 'triple' ? 3 : config === 'double' ? 2 : 1;
  const ribbons = [];
  const layout = config === 'triple'
    ? [{ x: 0, z: 0, yaw: 0, role: 'ionization' }, { x: -2.6 * mm, z: -1.2 * mm, yaw: 0.95, role: 'evaporation' }, { x: 2.6 * mm, z: -1.2 * mm, yaw: -0.95, role: 'evaporation' }]
    : config === 'double'
      ? [{ x: 0, z: 0, yaw: 0, role: 'ionization' }, { x: -2.4 * mm, z: -1.4 * mm, yaw: 0.9, role: 'evaporation' }]
      : [{ x: 0, z: 0, yaw: 0, role: config === 'ntims' ? 'ntims' : 'single' }];

  layout.forEach((L, i) => {
    const sub = new THREE.Group();
    sub.position.set(L.x, 0, L.z);
    sub.rotation.y = L.yaw;
    const metal = L.role === 'evaporation' ? metals.evap : metals.ion;
    const hasSample = sample && (L.role !== 'ionization');
    const rb = ribbon({ metal, sample: hasSample, height: H });
    sub.add(rb.grp);
    // posts
    for (const s of [-1, 1]) {
      const p = rod(new THREE.Vector3((s * 3.6 * mm) / 2, 0, 0), new THREE.Vector3((s * 3.6 * mm) / 2, H * 0.6, 0), 0.38 * mm, M.steelPolished());
      sub.add(p);
    }
    group.add(sub);
    const roleTxt = {
      ionization: 'Ionization filament (blank, hottest). Neutral atoms evaporated from the side filament(s) land here and leave as ions with probability given by the Saha–Langmuir equation.',
      evaporation: 'Evaporation (sample) filament. Run cooler to control the evaporation rate, decoupled from the ionization temperature.',
      single: 'Single filament: the same ribbon carries the sample, evaporates it and ionizes it. An activator (e.g. TaCl₅ for Sr, silica gel for Pb/U) controls emission.',
      ntims: 'N-TIMS filament (Pt/Ni) coated with a Ba activator to lower the effective work function so negative molecular ions (OsO₃⁻, ReO₄⁻, BO₂⁻) form.',
    }[L.role];
    const metalName = FILAMENT_METALS[metal]?.name ?? metal;
    const dir = config === 'single' || config === 'ntims' ? [0, 6 * mm, 0] : [Math.sign(L.x || 0) * 6 * mm, (i ? 3 : 7) * mm, i ? -2 * mm : 0];
    parts.push(part(sub, dir, `${L.role[0].toUpperCase() + L.role.slice(1)} filament (${metalName})`, roleTxt, { order: 0.3 + i * 0.1 }));
    ribbons.push({ role: L.role, mat: rb.mat, obj: sub, top: rb.top, spot: rb.spot, T: 300 });
  });

  // filament shield / can with slot (front)
  if (!compact) {
    const shield = new THREE.Group();
    const w = 13 * mm, hgt = 12 * mm;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, hgt); shape.lineTo(-w / 2, hgt); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-2.4 * mm, H - 1.2 * mm); hole.lineTo(-2.4 * mm, H + 1.2 * mm); hole.lineTo(2.4 * mm, H + 1.2 * mm); hole.lineTo(2.4 * mm, H - 1.2 * mm); hole.closePath();
    shape.holes.push(hole);
    const plate = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.4 * mm, bevelEnabled: false }), M.steel(), { name: 'filament shield' });
    plate.position.z = 3.2 * mm;
    shield.add(plate);
    group.add(shield);
    parts.push(part(shield, [0, 0, 9 * mm], 'Filament shield', 'Shield/can at acceleration potential with a slot facing the extraction lens; shapes the near-filament field and limits cross-contamination between turret positions.', { order: 0, shell: true }));
  }

  const setTemperature = (i, T) => {
    const r = ribbons[i];
    if (!r) return;
    r.T = T;
    const bb = blackbodyRGB(T);
    r.mat.emissive.setRGB(bb.r, bb.g * 0.92, bb.b * 0.85);
    r.mat.emissiveIntensity = 3.2 * bb.intensity;
  };
  const emitPoint = new THREE.Vector3(0, H, 0.05 * mm);
  return { group, parts, ribbons, setTemperature, emitPoint, height: H };
}
