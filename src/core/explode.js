// Exploded-view controller.
//
// Each registered part stores its assembled position and an explode offset (in parent
// space). explode(t) moves parts along their offsets with a staggered, eased motion so
// assemblies come apart in a readable order (outer covers first, inner optics last).
import * as THREE from 'three';

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class Exploder {
  constructor() {
    this.parts = [];
    this.t = 0;
  }
  /**
   * @param {THREE.Object3D} obj
   * @param {THREE.Vector3|number[]} offset displacement at full explode (parent space, m)
   * @param {object} [o]
   * @param {number} [o.order=0] 0..1, later parts start moving later
   * @param {string} [o.name] part name for UI / picking
   * @param {string} [o.info] HTML description
   * @param {boolean} [o.shell] treat as housing (ghosted in X-ray mode)
   * @param {THREE.Euler|number[]} [o.rotate] extra rotation at full explode
   */
  add(obj, offset, o = {}) {
    const off = Array.isArray(offset) ? new THREE.Vector3(...offset) : offset.clone();
    const rot = o.rotate ? (Array.isArray(o.rotate) ? new THREE.Euler(...o.rotate) : o.rotate) : null;
    const part = { obj, base: obj.position.clone(), baseQuat: obj.quaternion.clone(), offset: off, order: o.order ?? 0, rot };
    if (o.name || o.info) {
      obj.userData.part = { name: o.name ?? obj.name, info: o.info ?? '' };
    }
    if (o.shell) obj.userData.shell = true;
    this.parts.push(part);
    return obj;
  }
  /** Re-capture base pose (call after programmatic layout changes at t = 0). */
  rebase() {
    for (const p of this.parts) { p.base.copy(p.obj.position); p.baseQuat.copy(p.obj.quaternion); }
  }
  set(t) {
    this.t = t;
    const q = new THREE.Quaternion();
    for (const p of this.parts) {
      const span = 0.55;
      const local = ease((t - p.order * (1 - span)) / span);
      p.obj.position.copy(p.base).addScaledVector(p.offset, local);
      if (p.rot) {
        q.setFromEuler(new THREE.Euler(p.rot.x * local, p.rot.y * local, p.rot.z * local));
        p.obj.quaternion.copy(p.baseQuat).multiply(q);
      }
    }
  }
  /** Remove parts whose object is obj or a descendant of root (used when rebuilding sub-assemblies). */
  removeUnder(root) {
    const inside = (o) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
    this.parts = this.parts.filter((p) => !inside(p.obj));
  }
  clear() { this.parts = []; this.t = 0; }
}

/** Tag an object (and children) as pickable part without exploding it. */
export function tagPart(obj, name, info = '', { shell = false } = {}) {
  obj.userData.part = { name, info };
  if (shell) obj.userData.shell = true;
  return obj;
}
