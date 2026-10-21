// Reusable parametric geometry for vacuum and ion-optical hardware.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const mesh = (geo, mat, { name = '', cast = true, receive = true } = {}) => {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
};

export function roundedBox(w, h, d, r = 0.004, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-5));
}

/** Hollow cylinder (tube) along +Y, centred. */
export function tubeShell(rOuter, rInner, length, seg = 48) {
  const pts = [
    new THREE.Vector2(rInner, -length / 2), new THREE.Vector2(rOuter, -length / 2),
    new THREE.Vector2(rOuter, length / 2), new THREE.Vector2(rInner, length / 2),
    new THREE.Vector2(rInner, -length / 2),
  ];
  return new THREE.LatheGeometry(pts, seg);
}

/** Flat plate (in XY, thickness along Z) with a rectangular slit. */
export function plateWithSlit(w, h, t, slitW, slitH, { bevel = 0.0004 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
  if (slitW > 0 && slitH > 0) {
    const hole = new THREE.Path();
    hole.moveTo(-slitW / 2, -slitH / 2); hole.lineTo(-slitW / 2, slitH / 2); hole.lineTo(slitW / 2, slitH / 2); hole.lineTo(slitW / 2, -slitH / 2); hole.closePath();
    s.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -t / 2);
  return g;
}

/** Plate with circular hole. */
export function plateWithHole(w, h, t, r, { round = false } = {}) {
  const s = new THREE.Shape();
  if (round) s.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
  else { s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath(); }
  if (r > 0) { const hole = new THREE.Path(); hole.absarc(0, 0, r, 0, Math.PI * 2, true); s.holes.push(hole); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 40 });
  g.translate(0, 0, -t / 2);
  return g;
}

/** ConFlat (CF) flange: disk with bolt circle, along Z. */
export function cfFlange(od, t, bore, nBolts, mat, boltMat) {
  const grp = new THREE.Group();
  grp.add(mesh(plateWithHole(od, od, t, bore / 2, { round: true }), mat, { name: 'CF flange' }));
  const boltR = od * 0.42;
  const bg = new THREE.CylinderGeometry(od * 0.028, od * 0.028, t * 1.9, 6);
  bg.rotateX(Math.PI / 2);
  for (let i = 0; i < nBolts; i++) {
    const a = (i / nBolts) * Math.PI * 2;
    const b = mesh(bg, boltMat);
    b.position.set(Math.cos(a) * boltR, Math.sin(a) * boltR, 0);
    grp.add(b);
  }
  return grp;
}

/** Cylinder between two points. */
export function rod(a, b, r, mat, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg);
  const m = mesh(g, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Smooth tube through points. */
export function wire(points, r, mat, { closed = false, tension = 0.5, seg = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  const g = new THREE.TubeGeometry(curve, seg ?? Math.max(16, points.length * 8), r, 8, closed);
  return mesh(g, mat);
}

/** Extrude a 2-D outline (array of [x,y]) to a slab of thickness t along Y (world up). */
export function slabFromOutline(outline, t, { holes = [] } = {}) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: Math.min(0.002, t * 0.1), bevelThickness: Math.min(0.002, t * 0.1), bevelSegments: 2, curveSegments: 24 });
  // shape is in XY; rotate so 2-D y maps to world −Z and extrusion goes +Y
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Offset a closed polygon outward by d (simple miter, adequate for convex-ish outlines). */
export function offsetPolygon(pts, d) {
  const n = pts.length;
  // signed area to determine orientation
  let A = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; A += x1 * y2 - x2 * y1; }
  const sgn = A > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [sgn * e1[1] / l1, -sgn * e1[0] / l1], n2 = [sgn * e2[1] / l2, -sgn * e2[0] / l2];
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const ln = Math.hypot(nx, ny) || 1;
    nx /= ln; ny /= ln;
    const cos = nx * n1[0] + ny * n1[1];
    const s = d / Math.max(0.35, cos);
    return [p[0] + nx * s, p[1] + ny * s];
  });
}

/** Faraday cup body (deep bucket) via lathe, axis along +Z (open end at z=0 facing −Z). */
export function cupBucket(rOuter, rInner, depth, floor = 0.0015, seg = 40) {
  const pts = [
    new THREE.Vector2(rInner * 0.98, 0),
    new THREE.Vector2(rOuter, 0),
    new THREE.Vector2(rOuter, depth),
    new THREE.Vector2(0.0001, depth),
    new THREE.Vector2(0.0001, depth - floor),
    new THREE.Vector2(rInner, depth - floor),
    new THREE.Vector2(rInner, 0.0005),
  ];
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Hex nut/bolt head ring for decoration. */
export function boltRing(r, n, size, mat, axis = 'z') {
  const grp = new THREE.Group();
  const g = new THREE.CylinderGeometry(size, size, size * 0.8, 6);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = mesh(g, mat);
    if (axis === 'z') b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    else b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    grp.add(b);
  }
  return grp;
}

export { mergeGeometries };

/** 2-D sector coordinates (x, y) → world (x, h, −y). */
export const toWorld = (p, h = 0) => new THREE.Vector3(p[0], h, -p[1]);
/** Yaw (rotation about +Y) that points local +Z along 2-D direction d. */
export const yawFromDir2D = (d) => Math.atan2(d[0], -d[1]);
