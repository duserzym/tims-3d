// Ion-beam visualisation: a translucent additive tube along a traced trajectory plus
// particles that flow along it (speed is visual only).
import * as THREE from 'three';
import { beamMaterial } from './materials.js';

let _sprite = null;
export function glowSprite() {
  if (_sprite) return _sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _sprite = new THREE.CanvasTexture(c);
  _sprite.colorSpace = THREE.SRGBColorSpace;
  return _sprite;
}

/** Polyline curve (exact through points, arc-length parameterised). */
export class PolylineCurve extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points;
    this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + points[i].distanceTo(points[i - 1]));
    this.total = this.cum[this.cum.length - 1] || 1;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const d = Math.min(1, Math.max(0, t)) * this.total;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] < d) lo = m; else hi = m; }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    return target.copy(this.points[lo]).lerp(this.points[hi], (d - this.cum[lo]) / seg);
  }
  getLength() { return this.total; }
}

export class IonBeam extends THREE.Group {
  /**
   * @param {THREE.Vector3[]} points
   * @param {object} o {color, radius, particles, speed, opacity, size}
   */
  constructor(points, { color = 0x66b3ff, radius = 0.0015, particles = 30, speed = 0.25, opacity = 0.45, size = 0.006, tubularSegments = null } = {}) {
    super();
    this.name = 'ion beam';
    this.curve = new PolylineCurve(points);
    const segs = tubularSegments ?? Math.min(600, Math.max(32, points.length * 2));
    this.tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, radius, 8, false), beamMaterial(color, opacity));
    this.tube.renderOrder = 10;
    this.add(this.tube);
    this.core = new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, radius * 0.35, 6, false), beamMaterial(0xffffff, 0.35));
    this.core.renderOrder = 11;
    this.add(this.core);
    this.n = particles;
    this.speed = speed;
    this.phase = Array.from({ length: particles }, (_, i) => i / particles + Math.random() * 0.02);
    const pos = new Float32Array(particles * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      color, size, map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false,
    }));
    this.points.renderOrder = 12;
    this.points.frustumCulled = false;
    this.add(this.points);
    this.userData.beam = true;
    this._tmp = new THREE.Vector3();
    this.update(0);
  }
  setIntensity(f) {
    this.tube.material.opacity = 0.08 + 0.5 * f;
    this.points.material.opacity = 0.2 + 0.8 * f;
  }
  update(dt) {
    const arr = this.points.geometry.attributes.position.array;
    const L = this.curve.total;
    const du = (this.speed * dt) / Math.max(L, 1e-6) * 1.0;
    for (let i = 0; i < this.n; i++) {
      this.phase[i] = (this.phase[i] + du) % 1;
      this.curve.getPoint(this.phase[i], this._tmp);
      arr[i * 3] = this._tmp.x; arr[i * 3 + 1] = this._tmp.y; arr[i * 3 + 2] = this._tmp.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  dispose() {
    this.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }
}

/** Simple particle burst system (secondary electrons, photons, evaporating atoms…). */
export class Sparks extends THREE.Group {
  constructor({ color = 0xffffff, max = 400, size = 0.004 } = {}) {
    super();
    this.max = max;
    this.items = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setDrawRange(0, 0);
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 13;
    this.add(this.pts);
  }
  /** spawn particle with position, velocity (m/s), lifetime (s), optional per-step accel fn(p, v, age) */
  spawn(p, v, life = 1, accel = null, onDie = null) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: p.clone(), v: v.clone(), age: 0, life, accel, onDie });
  }
  update(dt) {
    const arr = this.pts.geometry.attributes.position.array;
    const keep = [];
    for (const it of [...this.items]) {
      it.age += dt;
      if (it.age > it.life) { it.onDie && it.onDie(it); continue; }
      if (it.accel) it.accel(it.p, it.v, it.age, dt);
      it.p.addScaledVector(it.v, dt);
      keep.push(it);
    }
    this.items = keep;
    keep.forEach((it, i) => { arr[i * 3] = it.p.x; arr[i * 3 + 1] = it.p.y; arr[i * 3 + 2] = it.p.z; });
    this.pts.geometry.setDrawRange(0, keep.length);
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
  clear() { this.items = []; this.pts.geometry.setDrawRange(0, 0); }
}
