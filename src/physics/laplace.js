// 2-D finite-difference electrostatics for the TIMS ion-source lens stack.
//
// Solves ∇²φ = 0 on a uniform grid (planar symmetry: electrodes are infinitely long
// slits, the usual first approximation for rectangular source slits) by successive
// over-relaxation with Dirichlet conditions on electrodes and a grounded vacuum housing.
// Ions are then traced through E = −∇φ with RK4. Because the equation of motion
// m·a = qE contains only q/m, *all isotopes follow identical trajectories* in a purely
// electrostatic lens — trajectories are computed with q/m = 1 and scaled time.
// Space charge is neglected (valid for TIMS beams ≲ 10⁻⁹ A).

export class LaplaceGrid {
  /**
   * @param {number} xMin, xMax, yMin, yMax  domain (m)
   * @param {number} h grid spacing (m)
   */
  constructor({ xMin, xMax, yMin, yMax, h }) {
    this.xMin = xMin; this.yMin = yMin; this.h = h;
    this.nx = Math.round((xMax - xMin) / h) + 1;
    this.ny = Math.round((yMax - yMin) / h) + 1;
    this.xMax = xMin + (this.nx - 1) * h;
    this.yMax = yMin + (this.ny - 1) * h;
    const N = this.nx * this.ny;
    this.phi = new Float64Array(N);
    this.fixed = new Uint8Array(N); // 0 free, else electrode id+1
    this.electrodes = [];
  }
  idx(i, j) { return j * this.nx + i; }
  clearElectrodes() {
    this.fixed.fill(0);
    this.electrodes = [];
  }
  /** Add rectangular electrode (m). Returns electrode id. */
  addRect(x0, y0, x1, y1, V, name = '') {
    const id = this.electrodes.length;
    this.electrodes.push({ x0, y0, x1, y1, V, name });
    const { nx, ny, h, xMin, yMin } = this;
    const i0 = Math.max(0, Math.round((Math.min(x0, x1) - xMin) / h));
    const i1 = Math.min(nx - 1, Math.round((Math.max(x0, x1) - xMin) / h));
    const j0 = Math.max(0, Math.round((Math.min(y0, y1) - yMin) / h));
    const j1 = Math.min(ny - 1, Math.round((Math.max(y0, y1) - yMin) / h));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = this.idx(i, j);
      this.fixed[k] = id + 1;
      this.phi[k] = V;
    }
    return id;
  }
  /** Update electrode potentials without rebuilding geometry. */
  setPotentials(values) {
    values.forEach((V, id) => { if (this.electrodes[id]) this.electrodes[id].V = V; });
    for (let k = 0; k < this.fixed.length; k++) {
      const f = this.fixed[k];
      if (f) this.phi[k] = this.electrodes[f - 1].V;
    }
  }
  /**
   * SOR relaxation. Outer boundary: grounded box (φ = 0) — the source housing.
   * Returns final max residual.
   */
  solve(iterations = 400, omega = 1.92) {
    const { nx, ny, phi, fixed } = this;
    let maxRes = 0;
    for (let it = 0; it < iterations; it++) {
      maxRes = 0;
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const k = row + i;
          if (fixed[k]) continue;
          const avg = 0.25 * (phi[k - 1] + phi[k + 1] + phi[k - nx] + phi[k + nx]);
          const r = avg - phi[k];
          phi[k] += omega * r;
          const ar = r < 0 ? -r : r;
          if (ar > maxRes) maxRes = ar;
        }
      }
    }
    return maxRes;
  }
  /** Bilinear potential at (x, y). */
  potential(x, y) {
    const { xMin, yMin, h, nx, ny, phi } = this;
    const fx = (x - xMin) / h, fy = (y - yMin) / h;
    const i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
    const tx = fx - i, ty = fy - j;
    const k = j * nx + i;
    return (
      phi[k] * (1 - tx) * (1 - ty) + phi[k + 1] * tx * (1 - ty) +
      phi[k + nx] * (1 - tx) * ty + phi[k + nx + 1] * tx * ty
    );
  }
  /** Electric field E = −∇φ at (x, y) via central differences of the bilinear field. */
  field(x, y) {
    const d = this.h * 0.5;
    const ex = -(this.potential(x + d, y) - this.potential(x - d, y)) / (2 * d);
    const ey = -(this.potential(x, y + d) - this.potential(x, y - d)) / (2 * d);
    return [ex, ey];
  }
  /** Is (x,y) inside an electrode or outside the domain? */
  solidAt(x, y) {
    const i = Math.round((x - this.xMin) / this.h), j = Math.round((y - this.yMin) / this.h);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return -2;
    const f = this.fixed[this.idx(i, j)];
    return f ? f - 1 : -1;
  }
}

/**
 * Trace a positive ion (charge +1) starting at (x, y) with kinetic energy E0 (eV)
 * in direction angle `theta` (rad). Energy conservation: KE = E0 + V_start − φ.
 * Units: q/m := 1 ⇒ v = sqrt(2·KE) in √V, a = E (V/m). Path-identical for every mass.
 * @returns {{pts:number[][], fate:'transmitted'|'hit'|'reflected', hitId:number, xEnd:number, yEnd:number, angle:number}}
 */
export function traceIon(grid, { x, y, theta = 0, E0 = 0.2 }, { xStop = null, maxSteps = 6000 } = {}) {
  const V0 = grid.potential(x, y);
  let px = x, py = y;
  let v = Math.sqrt(2 * Math.max(E0, 1e-6));
  let vx = v * Math.cos(theta), vy = v * Math.sin(theta);
  const pts = [[px, py]];
  const stopX = xStop ?? grid.xMax - grid.h;
  const acc = (X, Y) => grid.field(X, Y);
  for (let s = 0; s < maxSteps; s++) {
    const speed = Math.hypot(vx, vy);
    const dt = (0.35 * grid.h) / Math.max(speed, 1e-3);
    // RK4
    const a1 = acc(px, py);
    const k1x = vx, k1y = vy;
    const a2 = acc(px + 0.5 * dt * k1x, py + 0.5 * dt * k1y);
    const k2x = vx + 0.5 * dt * a1[0], k2y = vy + 0.5 * dt * a1[1];
    const a3 = acc(px + 0.5 * dt * k2x, py + 0.5 * dt * k2y);
    const k3x = vx + 0.5 * dt * a2[0], k3y = vy + 0.5 * dt * a2[1];
    const a4 = acc(px + dt * k3x, py + dt * k3y);
    const k4x = vx + dt * a3[0], k4y = vy + dt * a3[1];
    px += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    py += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    vx += (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
    vy += (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
    if (s % 2 === 0) pts.push([px, py]);
    if (px >= stopX) {
      pts.push([px, py]);
      return { pts, fate: 'transmitted', hitId: -1, xEnd: px, yEnd: py, angle: Math.atan2(vy, vx), KE: 0.5 * (vx * vx + vy * vy), V0 };
    }
    const solid = grid.solidAt(px, py);
    if (solid !== -1) {
      pts.push([px, py]);
      return { pts, fate: solid === -2 ? 'lost' : 'hit', hitId: solid, xEnd: px, yEnd: py, angle: Math.atan2(vy, vx), V0 };
    }
    if (vx < 0 && px < x - grid.h) {
      pts.push([px, py]);
      return { pts, fate: 'reflected', hitId: -1, xEnd: px, yEnd: py, angle: Math.atan2(vy, vx), V0 };
    }
  }
  return { pts, fate: 'lost', hitId: -1, xEnd: px, yEnd: py, angle: 0, V0 };
}
