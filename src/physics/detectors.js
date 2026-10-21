// Ion-counting detector physics: Daly detector vs discrete-dynode secondary electron
// multiplier (SEM, "ion counter").
//
// Daly detector (Daly 1960): ions strike a polished aluminium "knob" (conversion dynode)
// held at −20…−35 kV. The secondary electrons are accelerated back to an aluminised
// scintillator at ground; the light passes through a vacuum window to a photomultiplier
// tube (PMT) *outside* the analyser vacuum. Every ion therefore produces a burst of
// several tens of photoelectrons → a pulse-height distribution (PHD) far above the
// discriminator → high, mass-independent efficiency, negligible dark noise, and very
// slow ageing (ions never touch the multiplying surfaces).
//
// SEM: ions strike the first dynode directly (or a nearby conversion dynode) at only
// ≈ acceleration + 2–5 kV. Ion-to-electron conversion yield γ depends on ion velocity
// (kinetic emission ∝ v ∝ √(E/m)), so heavy ions produce fewer first-generation electrons,
// a broad, near-exponential PHD that straddles the discriminator, a mass-dependent
// efficiency ("mass bias") and gain that decays with extracted charge (dynode ageing).
//
// All numeric constants below are illustrative and chosen to reproduce the qualitative
// behaviour documented by the vendors; real detector constants must be calibrated.

import { RNG } from './rng.js';

/** Secondary-electron yield from kinetic emission: γ = c·√(E_keV / m_u). */
export function ionElectronYield(massU, impactKeV, c = 8.5) {
  return c * Math.sqrt(impactKeV / massU);
}

export const DALY_DEFAULTS = {
  accelKV: 10, knobKV: 25, yieldC: 11, pePerElectron: 20, collectFrac: 0.92, pmtShape: 4,
  deadTime: 30e-9, dark: 0.003, Q0: 50, gain0: 1e6, threshold: 8,
};
export const SEM_DEFAULTS = {
  accelKV: 10, firstDynodeKV: 2.0, yieldC: 8.5, stageGain: 3.0, nStages: 21, deadTime: 20e-9,
  dark: 0.03, Q0: 1.0, gain0: 5e7, threshold: 0.18,
};

/** Effective impact energy (keV) of a singly charged positive ion. */
export const dalyImpactKeV = (p) => p.accelKV + p.knobKV;
export const semImpactKeV = (p) => p.accelKV + p.firstDynodeKV;

/**
 * One Daly pulse, amplitude in photoelectrons (0 → missed ion).
 * gainRel scales the PMT gain (ageing / HV).
 */
export function dalyPulse(massU, p, rng, gainRel = 1) {
  const g = ionElectronYield(massU, dalyImpactKeV(p), p.yieldC);
  const nSE = rng.poisson(g * p.collectFrac);
  if (nSE === 0) return 0;
  const npe = rng.poisson(nSE * p.pePerElectron);
  if (npe === 0) return 0;
  return gainRel * rng.gamma(npe * p.pmtShape, 1 / p.pmtShape);
}

/**
 * One SEM pulse, amplitude normalised to the mean single-electron cascade (so a pulse
 * from n first-dynode electrons has mean n·gainRel). Pólya statistics: relative variance
 * of a single-electron cascade ≈ 1/(δ−1).
 */
export function semPulse(massU, p, rng, gainRel = 1) {
  const g = ionElectronYield(massU, semImpactKeV(p), p.yieldC);
  const n1 = rng.poisson(g);
  if (n1 === 0) return 0;
  const shape = n1 * (p.stageGain - 1);
  return gainRel * rng.gamma(shape, 1 / (p.stageGain - 1));
}

/** Monte-Carlo PHD histogram and detection efficiency for a given discriminator threshold. */
export function pulseHeightDistribution(kind, massU, p, { n = 20000, bins = 60, maxAmp = null, seed = 3, gainRel = 1 } = {}) {
  const rng = new RNG(seed);
  const amps = new Float64Array(n);
  const f = kind === 'daly' ? dalyPulse : semPulse;
  for (let i = 0; i < n; i++) amps[i] = f(massU, p, rng, gainRel);
  const top = maxAmp ?? (kind === 'daly' ? 120 : 8);
  const hist = new Array(bins).fill(0);
  for (const a of amps) {
    if (a <= 0) continue;
    const b = Math.min(bins - 1, Math.floor((a / top) * bins));
    hist[b]++;
  }
  const thr = p.threshold;
  let above = 0, zero = 0;
  for (const a of amps) { if (a > thr) above++; if (a === 0) zero++; }
  return {
    amps, hist, binWidth: top / bins, top,
    efficiency: above / n,
    missedNoElectron: zero / n,
  };
}

/** Efficiency vs discriminator threshold ("plateau curve"). */
export function plateauCurve(amps, thresholds) {
  const n = amps.length;
  return thresholds.map((t) => {
    let c = 0;
    for (const a of amps) if (a > t) c++;
    return c / n;
  });
}

/** Non-paralysable dead time: observed rate from true rate, and the correction. */
export const observedRate = (trueRate, tau) => trueRate / (1 + trueRate * tau);
export const deadTimeCorrect = (obsRate, tau) => obsRate / (1 - obsRate * tau);

/** Relative gain after extracting charge Q (C) from the multiplier: G = exp(−Q/Q0). */
export const agedGain = (Q, Q0) => Math.exp(-Q / Q0);

/**
 * Long-run simulation: count rate R (cps) for `hours`, returns relative yield vs time for
 * a fixed discriminator, showing why SEM "yield" drifts while Daly stays flat.
 */
export function yieldDrift(kind, massU, p, { rate = 5e5, hours = 24, steps = 24, seed = 5 } = {}) {
  const out = { h: [], yieldRel: [], gainRel: [] };
  const base = pulseHeightDistribution(kind, massU, p, { n: 8000, seed }).efficiency;
  const e = 1.602176634e-19;
  for (let s = 0; s <= steps; s++) {
    const h = (hours * s) / steps;
    const Q = rate * h * 3600 * p.gain0 * e; // extracted anode charge
    const gr = agedGain(Q, p.Q0);
    const eff = pulseHeightDistribution(kind, massU, p, { n: 8000, seed, gainRel: gr }).efficiency; // common random numbers
    out.h.push(h); out.yieldRel.push(eff / base); out.gainRel.push(gr);
  }
  return out;
}

/** Detection efficiency vs mass (mass bias), normalised to a reference mass. */
export function massBiasCurve(kind, p, masses, refMass, n = 12000) {
  const eff = (m) => pulseHeightDistribution(kind, m, p, { n, seed: 11 }).efficiency;
  const e0 = eff(refMass);
  return masses.map((m) => ({ m, eff: eff(m), rel: eff(m) / e0 }));
}
