// Magnetic-sector ion optics by direct numerical ray tracing in the bending plane.
//
// Model: a uniform field B inside a sector bounded by an entrance and an exit pole face
// (each optionally rotated by an edge angle ε, TRANSPORT sign convention: ε > 0 weakens
// horizontal focusing) and a radial pole width. No fringe fields, no space charge. An ion
// of mass m and charge q accelerated through V has radius
//     r = p / (qB) = sqrt(2 m q V) / (qB)  ⇒  r/R0 = sqrt((m/m0)·(V/V0))
// so the whole problem scales with the momentum ratio p/p0 ("rho" below = r/R0·R0).
//
// Geometry (2-D, metres): nominal ray enters at P1 = (0,0) travelling +x and is bent
// counter-clockwise about C = (0, R0); it exits at P2 after turning φ.
//
// Focusing is found the way an optician would: trace a narrow angular fan from the object
// (source slit), follow the straight trajectories after the exit face and intersect them.
// For a symmetric, normal-entry sector this reproduces Barber's rule
// (object, centre of curvature, image collinear) and L = R·cot(φ/2).

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => mul(a, 1 / len(a));

export function makeSector({ R0, phi, eps1 = 0, eps2 = 0, poleHalfWidth = null, L1 = null }) {
  const C = [0, R0];
  const P1 = [0, 0];
  const P2 = [R0 * Math.sin(phi), R0 - R0 * Math.cos(phi)];
  const d1 = [1, 0];
  const d2 = [Math.cos(phi), Math.sin(phi)];
  const u2 = [Math.sin(phi), -Math.cos(phi)];
  const n1 = [Math.cos(eps1), Math.sin(eps1)];
  const n2 = add(mul(d2, Math.cos(eps2)), mul(u2, Math.sin(eps2)));
  const w = poleHalfWidth ?? 0.25 * R0;
  const s = {
    R0, phi, eps1, eps2, C, P1, P2, d1, d2, u2, n1, n2, w,
    L1: L1 ?? R0 / Math.tan(phi / 2),
  };
  s.inField = (p) => {
    if (dot(sub(p, P1), n1) < 0) return false;
    if (dot(sub(p, P2), n2) > 0) return false;
    const r = len(sub(p, C));
    return r > R0 - w && r < R0 + w;
  };
  return s;
}

/**
 * Trace one ray analytically: straight line → circular arc inside the field → straight line.
 * @param sector from makeSector
 * @param {object} ray {alpha: launch angle (rad) from +x at the object, y0: object offset (m), pRatio: p/p0}
 * @param {object} opt {after: distance to follow the ray beyond the exit face (m), L1: object distance, arcPts}
 * @returns {{pts:number[][], entryPoint, exitPoint, exitDir, end:number[], dir:number[], lost:boolean}}
 */
export function traceRay(sector, { alpha = 0, y0 = 0, pRatio = 1 }, { after = null, L1 = null, arcPts = 48 } = {}) {
  const l1 = L1 ?? sector.L1;
  const p0 = [-l1, y0];
  const d0 = [Math.cos(alpha), Math.sin(alpha)];
  const rho = sector.R0 * pRatio;
  const afterLen = after ?? 3 * sector.R0;
  // 1) straight to the entrance face: dot(p0 + t d0 - P1, n1) = 0
  const den1 = dot(d0, sector.n1);
  const t1 = dot(sub(sector.P1, p0), sector.n1) / den1;
  const pin = add(p0, mul(d0, t1));
  const rin = len(sub(pin, sector.C));
  const pts = [p0, pin];
  if (!(t1 > 0) || Math.abs(rin - sector.R0) > sector.w) {
    const end = add(p0, mul(d0, l1 + afterLen));
    return { pts: [p0, end], entryPoint: null, exitPoint: null, exitDir: null, end, dir: d0, lost: true };
  }
  // 2) circular arc, counter-clockwise, centre to the left of the velocity
  const Cc = add(pin, mul([-d0[1], d0[0]], rho));
  const r0 = sub(pin, Cc);
  const at = (th) => {
    const c = Math.cos(th), s = Math.sin(th);
    return add(Cc, [r0[0] * c - r0[1] * s, r0[0] * s + r0[1] * c]);
  };
  // exit-face crossing: f(θ) = dot(at(θ) − P2, n2) = A cosθ + B sinθ + K = 0, smallest θ > 0
  const n2 = sector.n2;
  const A = r0[0] * n2[0] + r0[1] * n2[1];
  const B = -r0[1] * n2[0] + r0[0] * n2[1];
  const K = dot(sub(Cc, sector.P2), n2);
  const Rm = Math.hypot(A, B);
  let thExit = null;
  if (Math.abs(K) <= Rm) {
    const base = Math.atan2(B, A);
    const ac = Math.acos(-K / Rm);
    const cands = [base + ac, base - ac].map((t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    const pos = cands.filter((t) => t > 1e-9).sort((a, b) => a - b);
    thExit = pos[0];
  }
  let lost = thExit == null;
  const thEnd = thExit ?? Math.PI;
  const nArc = Math.max(4, Math.round(arcPts * thEnd / sector.phi));
  for (let i = 1; i <= nArc; i++) {
    const q = at((thEnd * i) / nArc);
    if (Math.abs(len(sub(q, sector.C)) - sector.R0) > sector.w) { lost = true; }
    pts.push(q);
  }
  const pout = at(thEnd);
  const dout = [d0[0] * Math.cos(thEnd) - d0[1] * Math.sin(thEnd), d0[0] * Math.sin(thEnd) + d0[1] * Math.cos(thEnd)];
  const end = add(pout, mul(dout, afterLen));
  pts.push(end);
  return { pts, entryPoint: pin, exitPoint: pout, exitDir: dout, end, dir: dout, lost };
}

function intersectLines(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-14) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return add(p1, mul(d1, t));
}

/** Image (focus) point and beam direction for a given momentum ratio. */
export function findFocus(sector, pRatio = 1, { alpha = 2e-3, L1 = null } = {}) {
  const a = traceRay(sector, { alpha: +alpha, pRatio }, { L1 });
  const b = traceRay(sector, { alpha: -alpha, pRatio }, { L1 });
  const c = traceRay(sector, { alpha: 0, pRatio }, { L1 });
  const f = intersectLines(a.end, a.dir, b.end, b.dir);
  return { point: f, dir: norm(c.dir), central: c };
}

/** Image distance from the exit face, measured along the nominal exit direction. */
export function imageDistance(sector, L1 = null) {
  const f = findFocus(sector, 1, { L1 });
  return dot(sub(f.point, sector.P2), sector.d2);
}

/**
 * Mass dispersion D (m per unit Δm/m): lateral separation of the images of m0 and
 * m0(1+δ), divided by δ, measured perpendicular to the beam.
 */
export function massDispersion(sector, L1 = null, delta = 0.005) {
  const f0 = findFocus(sector, 1, { L1 });
  const f1 = findFocus(sector, Math.sqrt(1 + delta), { L1 });
  const perp = [-f0.dir[1], f0.dir[0]];
  return Math.abs(dot(sub(f1.point, f0.point), perp)) / delta;
}

/** Find the symmetric object distance L (= image distance) for given edge angles. */
export function symmetricDistance(sector, { lo = 0.05, hi = 10 } = {}) {
  const g = (L) => imageDistance(sector, L) - L;
  // scan from far to near; the real symmetric solution is where g changes sign from − to +
  // while the image is still real (positive image distance).
  const N = 120;
  let prevL = hi * sector.R0, prevG = g(prevL);
  for (let i = 1; i <= N; i++) {
    const L = sector.R0 * hi * Math.pow(lo / hi, i / N);
    const gl = g(L);
    if (prevG < 0 && gl >= 0 && imageDistance(sector, L) > 0) {
      let a = L, b = prevL, ga = gl;
      for (let k = 0; k < 60; k++) {
        const m = 0.5 * (a + b);
        const gm = g(m);
        if (ga * gm <= 0) { b = m; } else { a = m; ga = gm; }
      }
      return 0.5 * (a + b);
    }
    prevL = L; prevG = gl;
  }
  return null;
}

/**
 * Build a symmetric (unity magnification) sector whose mass dispersion matches a target,
 * by solving for the symmetric edge angle ε. Returns null if not reachable.
 */
export function sectorForDispersion({ R0, phi, targetD, epsMax = 0.6 }) {
  const D = (eps) => {
    const s = makeSector({ R0, phi, eps1: eps, eps2: eps });
    const L = symmetricDistance(s);
    if (!L) return { d: NaN };
    s.L1 = L;
    return { d: massDispersion(s, L), s };
  };
  let a = 0, b = epsMax;
  let da = D(a).d - targetD, db = D(b).d - targetD;
  if (!(da * db < 0)) return null;
  for (let i = 0; i < 40; i++) {
    const m = 0.5 * (a + b);
    const dm = D(m).d - targetD;
    if (da * dm <= 0) { b = m; db = dm; } else { a = m; da = dm; }
  }
  const out = D(0.5 * (a + b));
  return out.s;
}

/**
 * Compute collector positions for a list of masses: the focal points, beam directions,
 * and the separation from the axial mass, using the traced optics.
 */
export function focalPlane(sector, masses, mAxial) {
  return masses.map((m) => {
    const pr = Math.sqrt(m / mAxial);
    const f = findFocus(sector, pr);
    return { m, pRatio: pr, point: f.point, dir: f.dir, central: f.central };
  });
}

/** Pole-face boundary segments (for drawing the magnet pole outline). */
export function polePolygon(sector, n = 48) {
  const { C, R0, w, phi, P1, P2, n1, n2 } = sector;
  // sample the annulus edges between the two (rotated) boundary lines
  const pts = [];
  const lineAt = (P, nrm, r) => {
    // solve |P + t·t̂ − C| = r with t̂ the boundary tangent
    const t = [-nrm[1], nrm[0]];
    const pc = sub(P, C);
    const B = 2 * dot(pc, t);
    const Cc = dot(pc, pc) - r * r;
    const disc = B * B - 4 * Cc;
    const t1 = (-B + Math.sqrt(disc)) / 2, t2 = (-B - Math.sqrt(disc)) / 2;
    const q1 = add(P, mul(t, t1)), q2 = add(P, mul(t, t2));
    return dot(sub(q1, P), sub(q1, P)) < dot(sub(q2, P), sub(q2, P)) ? q1 : q2;
  };
  const angleOf = (q) => Math.atan2(q[0] - C[0], -(q[1] - C[1]));
  const ring = (r) => {
    const a = lineAt(P1, n1, r), b = lineAt(P2, n2, r);
    const th0 = angleOf(a), th1 = angleOf(b);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const th = th0 + (th1 - th0) * (i / n);
      out.push([C[0] + r * Math.sin(th), C[1] - r * Math.cos(th)]);
    }
    return out;
  };
  const outer = ring(R0 + w), inner = ring(R0 - w).reverse();
  return [...outer, ...inner];
}

export const vec2 = { add, sub, mul, dot, len, norm };
