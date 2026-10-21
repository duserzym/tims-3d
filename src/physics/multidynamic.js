// Multi-dynamic peak coincidence on a fixed collector array, with and without
// variable-dispersion ("Zoom") optics — the effect shown in the Nu TIMS brochure for a
// five-cycle Sr routine.
//
// In cycle c the magnet puts mass m_c on the axis. An isotope of mass m then lands at the
// traced lateral position x(m; m_c) ≈ D·(m − m_c)/(2·m_c)·2 … (exactly: traced). A fixed
// array has its cups at the positions x_k laid out for one design cycle; in every other
// cycle the beams in the outer cups are off-centre by δ = x(m; m_c) − x_k because the
// dispersion per mass unit scales as 1/m_c. A zoom lens rescales all lateral offsets by a
// factor z, so δ' = z·x(m; m_c) − x_k; the best z (least squares) restores coincidence.
//
// The measured signal fraction is the overlap of a Gaussian beam image (FWHM w_b) with a
// cup entrance slit of width w_c: f(δ) = Φ((w_c/2 − δ)/σ) − Φ((−w_c/2 − δ)/σ).

import { findFocus, vec2 } from './sector.js';

const { sub, dot } = vec2;

function erf(x) {
  // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

export function slitOverlap(delta, wb, wc) {
  const sigma = wb / 2.3548;
  return Phi((wc / 2 - delta) / sigma) - Phi((-wc / 2 - delta) / sigma);
}

/** Lateral image position (m, + = high-mass side) of mass m when m_axial is on axis. */
export function lateral(sector, m, mAxial) {
  const f0 = findFocus(sector, 1);
  const f = findFocus(sector, Math.sqrt(m / mAxial));
  const out = [f0.dir[1], -f0.dir[0]];
  return dot(sub(f.point, f0.point), out);
}

export function optimalZoom(xs, xc) {
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += xs[i] * xc[i]; den += xs[i] * xs[i]; }
  return den > 0 ? num / den : 1;
}

/**
 * @param {object} o
 * @param o.sector       traced sector
 * @param o.isotopes     [{name, m}]
 * @param o.cycles       axial masses (u, exact isotope masses) put on axis in each cycle
 * @param o.designAxial  axial mass for which the fixed cups were positioned
 * @param o.ks           cup offsets available, e.g. [-5..6]
 * @param o.wb, o.wc     beam FWHM and cup slit width (m)
 */
/** Mass laid out at cup offset k: the isotope that sits there in the design cycle, else integer spacing. */
export function cupMass(isotopes, designAxial, k) {
  const I = isotopes.find((i) => Math.round(i.m - designAxial) === k);
  return I ? I.m : designAxial + k;
}

export function analyseCycles({ sector, isotopes, cycles, designAxial, ks, wb = 0.3e-3, wc = 1.0e-3 }) {
  const cupX = new Map(ks.map((k) => [k, lateral(sector, cupMass(isotopes, designAxial, k), designAxial)]));
  return cycles.map((mc) => {
    const rows = [];
    for (const I of isotopes) {
      const k = Math.round(I.m - mc);
      if (!cupX.has(k)) continue;
      rows.push({ iso: I, k, x: lateral(sector, I.m, mc), xc: cupX.get(k) });
    }
    const off = rows.filter((r) => r.k !== 0);
    const z = optimalZoom(off.map((r) => r.x), off.map((r) => r.xc));
    for (const r of rows) {
      r.delta = r.x - r.xc;
      r.deltaZoom = z * r.x - r.xc;
      r.f = slitOverlap(r.delta, wb, wc);
      r.fZoom = slitOverlap(r.deltaZoom, wb, wc);
    }
    return { axial: mc, zoom: z, rows };
  });
}

/** Peak-scan curves: signal vs magnet offset (expressed as axial displacement in m). */
export function peakScan(rows, { zoom = 1, wb, wc, span = 1.2e-3, n = 121 }) {
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(-span + (2 * span * i) / (n - 1));
  // a small field change moves every beam by ≈ the same lateral amount s·(x/x_axialunit)… for
  // small scans we treat it as a rigid shift s (first order).
  return rows.map((r) => ({
    iso: r.iso, k: r.k,
    x: xs,
    y: xs.map((s) => slitOverlap(zoom * r.x + s - r.xc, wb, wc)),
  }));
}
