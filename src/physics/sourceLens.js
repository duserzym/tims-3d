// Generic Nier-type TIMS ion-source lens stack (cross-section in the dispersive plane).
//
// The geometry is representative, not a vendor drawing. Electrode names follow common
// TIMS tuning parameters: Acceleration (filament + can), Extraction (draw-out), Focus
// (split plates → "Y-symmetry" steering), Ground, Deflection (beam steering), Source slit
// (object slit of the magnet) and the angular Selector slit (α-aperture).
//
// Laplace is linear, so each driven electrode's unit solution is pre-computed once and
// any tuning state is an exact superposition φ = Σ Vᵢ·φᵢ — tuning is instantaneous and
// the auto-tune can evaluate hundreds of states.

import { LaplaceGrid, traceIon } from './laplace.js';
import { RNG } from './rng.js';
import { K_B_EV } from './constants.js';

const mm = 1e-3;

export const LENS_LAYOUT = {
  xMin: 0, xMax: 70 * mm, yMin: -12 * mm, yMax: 12 * mm, h: 0.25 * mm,
  filament: { x0: 2.0 * mm, x1: 2.75 * mm, half: 0.9 * mm },
  can: { x0: 3.6 * mm, x1: 4.35 * mm, slit: 4.0 * mm },
  extraction: { x0: 6.5 * mm, x1: 7.25 * mm, slit: 3.0 * mm },
  focus: { x0: 11.5 * mm, x1: 12.25 * mm, slit: 3.0 * mm },
  ground: { x0: 17 * mm, x1: 17.75 * mm, slit: 2.0 * mm },
  deflect: { x0: 23 * mm, x1: 33 * mm, gap: 3.5 * mm, t: 0.75 * mm },
  sourceSlit: { x0: 39 * mm, x1: 39.5 * mm },
  selector: { x0: 62 * mm, x1: 62.5 * mm },
  xStop: 67 * mm,
};

// Driven electrode groups (basis solutions)
export const DRIVEN = ['accel', 'extraction', 'focusUp', 'focusDown', 'deflUp', 'deflDown'];

function plateWithSlit(grid, L, x0, x1, slit, V, name) {
  grid.addRect(x0, slit / 2, x1, L.yMax - 1 * mm, V, name);
  grid.addRect(x0, L.yMin + 1 * mm, x1, -slit / 2, V, name);
}

/** Build the geometry with the given potential assignment. */
function buildGeometry(grid, L, V, { sourceSlitW, selectorW }) {
  grid.clearElectrodes();
  const ids = {};
  // accel group: filament ribbon (edge-on) + filament can
  ids.accel = [
    grid.addRect(L.filament.x0, -L.filament.half, L.filament.x1, L.filament.half, V.accel, 'filament'),
  ];
  plateWithSlit(grid, L, L.can.x0, L.can.x1, L.can.slit, V.accel, 'can');
  ids.accel.push(grid.electrodes.length - 2, grid.electrodes.length - 1);
  plateWithSlit(grid, L, L.extraction.x0, L.extraction.x1, L.extraction.slit, V.extraction, 'extraction');
  ids.extraction = [grid.electrodes.length - 2, grid.electrodes.length - 1];
  grid.addRect(L.focus.x0, L.focus.slit / 2, L.focus.x1, L.yMax - 1 * mm, V.focusUp, 'focusUp');
  ids.focusUp = [grid.electrodes.length - 1];
  grid.addRect(L.focus.x0, L.yMin + 1 * mm, L.focus.x1, -L.focus.slit / 2, V.focusDown, 'focusDown');
  ids.focusDown = [grid.electrodes.length - 1];
  plateWithSlit(grid, L, L.ground.x0, L.ground.x1, L.ground.slit, 0, 'ground');
  grid.addRect(L.deflect.x0, L.deflect.gap, L.deflect.x1, L.deflect.gap + L.deflect.t, V.deflUp, 'deflUp');
  ids.deflUp = [grid.electrodes.length - 1];
  grid.addRect(L.deflect.x0, -L.deflect.gap - L.deflect.t, L.deflect.x1, -L.deflect.gap, V.deflDown, 'deflDown');
  ids.deflDown = [grid.electrodes.length - 1];
  plateWithSlit(grid, L, L.sourceSlit.x0, L.sourceSlit.x1, sourceSlitW, 0, 'sourceSlit');
  plateWithSlit(grid, L, L.selector.x0, L.selector.x1, selectorW, 0, 'selector');
  return ids;
}

export class SourceLens {
  constructor({ sourceSlitW = 0.4 * mm, selectorW = 2.0 * mm, iterations = 350 } = {}) {
    this.L = LENS_LAYOUT;
    this.sourceSlitW = sourceSlitW;
    this.selectorW = selectorW;
    this.iterations = iterations;
    this._buildBasis();
  }
  _buildBasis() {
    const L = this.L;
    this.basis = {};
    for (const name of DRIVEN) {
      const g = new LaplaceGrid(L);
      const V = Object.fromEntries(DRIVEN.map((n) => [n, n === name ? 1 : 0]));
      buildGeometry(g, L, V, this);
      // warm start: linear ramp improves SOR convergence
      g.solve(this.iterations, 1.953);
      this.basis[name] = g.phi;
    }
    // working grid (geometry identical, potentials combined)
    this.grid = new LaplaceGrid(L);
    buildGeometry(this.grid, L, Object.fromEntries(DRIVEN.map((n) => [n, 0])), this);
    this.solidMask = this.grid.fixed;
  }
  setSlits({ sourceSlitW, selectorW }) {
    let changed = false;
    if (sourceSlitW != null && sourceSlitW !== this.sourceSlitW) { this.sourceSlitW = sourceSlitW; changed = true; }
    if (selectorW != null && selectorW !== this.selectorW) { this.selectorW = selectorW; changed = true; }
    if (changed) this._buildBasis();
    return changed;
  }
  /**
   * Combine basis solutions for absolute electrode potentials (V).
   * @param {{accel:number, extraction:number, focus:number, steer:number, deflect:number}} s
   */
  apply(s) {
    const V = {
      accel: s.accel,
      extraction: s.extraction,
      focusUp: s.focus + s.steer / 2,
      focusDown: s.focus - s.steer / 2,
      deflUp: +s.deflect / 2,
      deflDown: -s.deflect / 2,
    };
    const phi = this.grid.phi;
    phi.fill(0);
    for (const n of DRIVEN) {
      const b = this.basis[n], v = V[n];
      if (!v) continue;
      for (let k = 0; k < phi.length; k++) phi[k] += v * b[k];
    }
    this.V = V;
    return V;
  }
  /**
   * Launch a thermal fan of ions from the filament face and trace them.
   * @returns {{rays, transmission, atSourceSlit, atSelector, spot}}
   */
  trace({ n = 120, filamentT = 1800, spot = 0.6 * mm, seed = 7, offset = 0 } = {}) {
    const rng = new RNG(seed);
    const L = this.L;
    const kT = K_B_EV * filamentT;
    const rays = [];
    let passSlit = 0, passSel = 0;
    for (let i = 0; i < n; i++) {
      const y = offset + (i / (n - 1) - 0.5) * spot + rng.normal(0, spot * 0.02);
      // cosine (Lambertian) emission, flux-weighted thermal energy ~ Gamma(2, kT)
      const theta = Math.asin(2 * rng.u() - 1) * 0.98;
      const E0 = rng.gamma(2, kT);
      const r = traceIon(this.grid, { x: L.filament.x1 + this.grid.h * 1.01, y, theta, E0 }, { xStop: L.xStop });
      // determine whether it crossed the source slit (x position check along path)
      const crossedSlit = r.pts.some((p) => p[0] > L.sourceSlit.x1);
      if (crossedSlit) passSlit++;
      if (r.fate === 'transmitted') passSel++;
      rays.push(r);
    }
    return { rays, transmission: passSel / n, slitTransmission: passSlit / n };
  }
}

/** Default tuning (absolute volts) for a 10 kV source. */
export function defaultTune(accel = 10000) {
  return { accel, extraction: 0.82 * accel, focus: 0.76 * accel, steer: 0, deflect: 0 };
}

/**
 * Coordinate-descent auto-tune, like the "autofocus" routine on commercial TIMS:
 * maximise transmitted ions through the selector slit.
 */
export function autoTune(lens, start, { filamentT = 1800, n = 80, passes = 3, onStep = null } = {}) {
  const params = [
    { k: 'extraction', lo: 0.5, hi: 0.99, scale: start.accel },
    { k: 'focus', lo: 0.1, hi: 0.95, scale: start.accel },
    { k: 'steer', lo: -0.06, hi: 0.06, scale: start.accel },
    { k: 'deflect', lo: -0.04, hi: 0.04, scale: start.accel },
  ];
  let best = { ...start };
  const score = (s) => { lens.apply(s); return lens.trace({ n, filamentT }).transmission; };
  let bestScore = score(best);
  for (let p = 0; p < passes; p++) {
    for (const prm of params) {
      const span = (prm.hi - prm.lo) * prm.scale / Math.pow(2.5, p);
      for (let i = -4; i <= 4; i++) {
        const trial = { ...best, [prm.k]: Math.min(prm.hi * prm.scale, Math.max(prm.lo * prm.scale, best[prm.k] + (i / 4) * span / 2)) };
        const sc = score(trial);
        if (sc > bestScore + 1e-9) { bestScore = sc; best = trial; }
      }
      onStep && onStep(best, bestScore);
    }
  }
  lens.apply(best);
  return { tune: best, transmission: bestScore };
}
