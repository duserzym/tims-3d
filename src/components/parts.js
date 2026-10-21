// Component contract used by every builder in src/components:
//   build*(opts) → { group: THREE.Group, parts: Part[], ...extras }
//   Part = { obj: THREE.Object3D, offset: [x,y,z] (metres, in group space), name, info, order?, shell? }
// The caller decides whether/how to explode a component by registering its parts with an
// Exploder (optionally scaled/re-ordered) via registerParts().
import * as THREE from 'three';

export function part(obj, offset, name, info = '', o = {}) {
  obj.name = obj.name || name;
  return { obj, offset, name, info, ...o };
}

/**
 * Register component parts with an exploder.
 * @param {import('../core/explode.js').Exploder} ex
 * @param {object[]} parts
 * @param {object} o {scale=1, order=null (override), orderOffset=0, orderScale=1, frame: THREE.Object3D (converts offsets to that parent's space)}
 */
export function registerParts(ex, parts, { scale = 1, order = null, orderOffset = 0, orderScale = 1, extra = null } = {}) {
  for (const p of parts) {
    const off = new THREE.Vector3(...p.offset).multiplyScalar(scale);
    if (extra) off.add(new THREE.Vector3(...extra));
    ex.add(p.obj, off, {
      name: p.name, info: p.info, shell: p.shell,
      order: order ?? Math.min(0.95, orderOffset + (p.order ?? 0) * orderScale),
      rotate: p.rotate,
    });
  }
}

/** Tag parts as pickable without exploding them. */
export function tagParts(parts) {
  for (const p of parts) {
    p.obj.userData.part = { name: p.name, info: p.info };
    if (p.shell) p.obj.userData.shell = true;
  }
}
