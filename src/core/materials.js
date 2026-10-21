// Physically based materials for instrument parts. Metals rely on the scene environment
// map (RoomEnvironment PMREM) for realistic reflections.
import * as THREE from 'three';

const cache = new Map();
function mk(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export const M = {
  steel: () => mk('steel', () => new THREE.MeshPhysicalMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.32, name: 'stainless steel' })),
  steelBrushed: () => mk('steelBrushed', () => new THREE.MeshPhysicalMaterial({ color: 0xb9bfc8, metalness: 1, roughness: 0.45, name: 'brushed stainless' })),
  steelPolished: () => mk('steelPolished', () => new THREE.MeshPhysicalMaterial({ color: 0xe3e6ea, metalness: 1, roughness: 0.12, name: 'polished stainless' })),
  aluminium: () => mk('aluminium', () => new THREE.MeshPhysicalMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.22, name: 'aluminium' })),
  aluminiumMirror: () => mk('aluminiumMirror', () => new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, metalness: 1, roughness: 0.04, name: 'polished aluminium' })),
  rhenium: () => mk('rhenium', () => new THREE.MeshPhysicalMaterial({ color: 0xbfc3ca, metalness: 1, roughness: 0.28, name: 'rhenium' })),
  tantalum: () => mk('tantalum', () => new THREE.MeshPhysicalMaterial({ color: 0xa3abb6, metalness: 1, roughness: 0.3, name: 'tantalum' })),
  tungsten: () => mk('tungsten', () => new THREE.MeshPhysicalMaterial({ color: 0xaeb2b8, metalness: 1, roughness: 0.3, name: 'tungsten' })),
  platinum: () => mk('platinum', () => new THREE.MeshPhysicalMaterial({ color: 0xe0dccf, metalness: 1, roughness: 0.2, name: 'platinum' })),
  copper: () => mk('copper', () => new THREE.MeshPhysicalMaterial({ color: 0xd4875a, metalness: 1, roughness: 0.3, name: 'OFHC copper' })),
  coil: () => mk('coil', () => new THREE.MeshPhysicalMaterial({ color: 0xb46a3c, metalness: 0.9, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3, name: 'enamelled copper coil' })),
  gold: () => mk('gold', () => new THREE.MeshPhysicalMaterial({ color: 0xf0c25a, metalness: 1, roughness: 0.22, name: 'gold plating' })),
  graphite: () => mk('graphite', () => new THREE.MeshPhysicalMaterial({ color: 0x2b2d31, metalness: 0.15, roughness: 0.85, name: 'graphite' })),
  iron: () => mk('iron', () => new THREE.MeshPhysicalMaterial({ color: 0x3c4250, metalness: 0.4, roughness: 0.55, clearcoat: 0.4, name: 'laminated iron yoke (painted)' })),
  pole: () => mk('pole', () => new THREE.MeshPhysicalMaterial({ color: 0x9aa1aa, metalness: 1, roughness: 0.38, name: 'soft-iron pole piece' })),
  alumina: () => mk('alumina', () => new THREE.MeshPhysicalMaterial({ color: 0xf3efe6, metalness: 0, roughness: 0.55, sheen: 0.3, name: 'alumina ceramic' })),
  macor: () => mk('macor', () => new THREE.MeshPhysicalMaterial({ color: 0xfaf8f2, metalness: 0, roughness: 0.7, name: 'machinable glass ceramic' })),
  peek: () => mk('peek', () => new THREE.MeshPhysicalMaterial({ color: 0xc9a77a, metalness: 0, roughness: 0.6, name: 'PEEK' })),
  glass: () => mk('glass', () => new THREE.MeshPhysicalMaterial({ color: 0xdfefff, metalness: 0, roughness: 0.02, transmission: 0.92, thickness: 0.004, ior: 1.47, transparent: true, opacity: 0.55, name: 'borosilicate glass' })),
  quartz: () => mk('quartz', () => new THREE.MeshPhysicalMaterial({ color: 0xf2fbff, metalness: 0, roughness: 0.02, transmission: 0.95, thickness: 0.003, ior: 1.46, transparent: true, opacity: 0.45, name: 'fused silica window' })),
  scintillator: () => mk('scintillator', () => new THREE.MeshPhysicalMaterial({ color: 0x9fe6ff, emissive: 0x2a86b8, emissiveIntensity: 0.35, metalness: 0, roughness: 0.15, transmission: 0.5, thickness: 0.002, transparent: true, opacity: 0.85, name: 'plastic scintillator (aluminised face)' })),
  photocathode: () => mk('photocathode', () => new THREE.MeshPhysicalMaterial({ color: 0x8a5a2b, metalness: 0.6, roughness: 0.25, name: 'bialkali photocathode' })),
  dynode: () => mk('dynode', () => new THREE.MeshPhysicalMaterial({ color: 0xcfd3d9, metalness: 1, roughness: 0.25, name: 'Cu-Be / Al₂O₃ dynode' })),
  pcb: () => mk('pcb', () => new THREE.MeshPhysicalMaterial({ color: 0x1f6b45, metalness: 0.1, roughness: 0.6, name: 'circuit board' })),
  resistorBody: () => mk('resistorBody', () => new THREE.MeshPhysicalMaterial({ color: 0x2f3b6b, metalness: 0.05, roughness: 0.35, clearcoat: 0.7, name: 'high-ohmic resistor (glass-sealed)' })),
  panel: (hex = 0xe9ecef) => mk('panel' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.1, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, name: 'painted cover' })),
  rubber: () => mk('rubber', () => new THREE.MeshPhysicalMaterial({ color: 0x15171a, metalness: 0, roughness: 0.9, name: 'Viton/rubber' })),
  black: () => mk('black', () => new THREE.MeshPhysicalMaterial({ color: 0x23262b, metalness: 0.3, roughness: 0.55, name: 'anodised black' })),
  magnetNdFe: () => mk('magnetNdFe', () => new THREE.MeshPhysicalMaterial({ color: 0x8b929c, metalness: 1, roughness: 0.25, name: 'permanent magnet (Ni-plated)' })),
  ln2: () => mk('ln2', () => new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, metalness: 0.6, roughness: 0.15, name: 'LN₂ dewar' })),
};

/** Glowing filament material (per instance; colour/intensity updated from temperature). */
export function filamentMaterial(base = 0xbfc3ca) {
  return new THREE.MeshPhysicalMaterial({ color: base, metalness: 1, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1, name: 'filament ribbon' });
}

/** Additive glowing beam material. */
export function beamMaterial(color, opacity = 0.55) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

/** Ghosted (x-ray) clone of a material. */
export function ghostOf(mat) {
  const g = mat.clone();
  g.transparent = true;
  g.opacity = 0.14;
  g.depthWrite = false;
  if ('transmission' in g) g.transmission = 0;
  return g;
}

/** Distinct, colour-blind-aware isotope colours. */
export const ISOTOPE_COLORS = [0x5ab0ff, 0xffb24a, 0x4fd6a1, 0xff6f91, 0xc59bff, 0xf5e663, 0x7fe0ff, 0xff9966];
