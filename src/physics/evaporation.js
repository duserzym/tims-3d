// Filament evaporation, Rayleigh mass fractionation and the Total Evaporation method.
//
// Light isotopes evaporate preferentially. In the kinetic (Langmuir/Knudsen) limit the
// evaporation flux of isotope i is ∝ Nᵢ·mᵢ^(−β) with β ≈ ½. The reservoir therefore
// becomes progressively heavier (Rayleigh distillation):
//     R_res(f) = R₀ · f^(α−1),  α = (m_b/m_a)^β,  f = fraction of the heavy isotope left
// and the measured ion beam ratio drifts from "too light" to "too heavy" over a run.
//
// Total Evaporation (TE; called "total ionization" or Total Flash Evaporation in some
// literature) integrates *every* ion until the sample is exhausted. Mass is conserved,
// so the summed ratio returns R₀ regardless of the fractionation path (to the extent that
// ionization efficiency is mass-independent). TE is standardised for U and Pu in
// ASTM C1672 and is the reference technique for nuclear safeguards; Nu Instruments tunes
// the small initial beam on an ion counter before switching to Faradays to minimise
// pre-analysis sample loss (Nu TIMS brochure).

import { K_B_EV } from './constants.js';

/**
 * @param {object} o
 * @param {{name:string,m:number,N0:number}[]} o.isotopes initial atom inventory
 * @param {'total'|'conventional'} o.mode
 * @param {number} o.beta  fractionation exponent (0.5 = kinetic)
 * @param {number} o.eff   ionization efficiency (ions/atom evaporated)
 * @param {number} o.targetIons target total ion beam (ions/s)
 * @param {number} o.A, o.Ea Arrhenius pre-factor (1/s) and activation energy (eV)
 * @param {number} o.Tmax max filament temperature (K); o.ramp max dT/dt (K/s); o.T0 start (K)
 * @param {number} o.dt time step (s); o.tMax max run time (s)
 * @param {number} o.warmup pre-analysis heating/tuning time at the tuning beam (s)
 * @param {number} o.tuneIons beam used while tuning (ions/s)
 * @param {number[]} o.window conventional mode: [fStart, fEnd] fraction consumed to collect data
 */
export function simulateRun(o) {
  const {
    isotopes, mode = 'total', beta = 0.5, eff = 0.01, targetIons = 6e8,
    A = 1e7, Ea = 3.0, Tmax = 2300, ramp = 4, T0 = 1200, dt = 1, tMax = 4000,
    warmup = 300, tuneIons = 3e4, window = [0.1, 0.45],
  } = o;
  const n = isotopes.length;
  const N = isotopes.map((i) => i.N0);
  const w = isotopes.map((i) => Math.pow(i.m, -beta));
  const Ntot0 = N.reduce((a, b) => a + b, 0);
  let T = T0;
  const out = { t: [], T: [], beam: [], ions: isotopes.map(() => []), instRatio: [], cumRatio: [], consumed: [], phase: [] };
  const cum = new Array(n).fill(0);
  const cumAll = new Array(n).fill(0);
  let t = 0;
  let collecting = false, done = false;
  let tuneLoss = 0, measureStart = null, measureEnd = null;
  const k = (TT) => A * Math.exp(-Ea / (K_B_EV * TT));
  const Tfor = (kk) => Ea / (K_B_EV * Math.log(A / kk));
  while (t < tMax && !done) {
    const Ntot = N.reduce((a, b) => a + b, 0);
    const consumed = 1 - Ntot / Ntot0;
    let phase;
    let target;
    if (t < warmup) { phase = 'tune'; target = tuneIons; }
    else if (mode === 'total') { phase = 'measure'; target = targetIons; }
    else {
      phase = consumed < window[0] ? 'heat' : consumed <= window[1] ? 'measure' : 'done';
      target = targetIons;
      if (phase === 'done') done = true;
    }
    // temperature controller: temperature needed for target, rate-limited
    const kNeed = target / (eff * Math.max(Ntot, 1e-30));
    const Tneed = kNeed < A ? Tfor(kNeed) : Tmax;
    const dT = Math.max(-ramp * 4 * dt, Math.min(ramp * dt, Tneed - T));
    T = Math.min(Tmax, T + dT);
    const kk = k(T);
    const W = N.reduce((a, Ni, i) => a + Ni * w[i], 0);
    const evapTot = Math.min(Ntot, kk * Ntot * dt);
    const ions = new Array(n);
    for (let i = 0; i < n; i++) {
      const ev = W > 0 ? (evapTot * N[i] * w[i]) / W : 0;
      N[i] = Math.max(0, N[i] - ev);
      ions[i] = eff * ev;
      cumAll[i] += ions[i];
    }
    collecting = phase === 'measure';
    if (phase === 'tune') tuneLoss = consumed;
    if (collecting && measureStart === null) measureStart = t;
    if (collecting) measureEnd = t;
    if (collecting) for (let i = 0; i < n; i++) cum[i] += ions[i];
    const beam = ions.reduce((a, b) => a + b, 0) / dt;
    out.t.push(t); out.T.push(T); out.beam.push(beam); out.consumed.push(consumed); out.phase.push(phase);
    for (let i = 0; i < n; i++) out.ions[i].push(ions[i] / dt);
    out.instRatio.push(ions[1] > 0 ? ions[0] / ions[1] : NaN);
    out.cumRatio.push(cum[1] > 0 ? cum[0] / cum[1] : NaN);
    t += dt;
    // TE stop criterion: beam < 1 % of target after reaching Tmax (sample exhausted)
    if (mode === 'total' && t > warmup + 10 && T >= Tmax - 1e-6 && beam < 0.01 * targetIons) done = true;
  }
  const R0 = isotopes[0].N0 / isotopes[1].N0;
  const measured = cum[0] / cum[1];
  return {
    ...out, R0, measured,
    biasPermil: (measured / R0 - 1) * 1000,
    collectedFraction: cum.reduce((a, b) => a + b, 0) / (eff * Ntot0),
    tuneLossFraction: tuneLoss,
    measureStart, measureEnd,
    remaining: N.reduce((a, b) => a + b, 0) / Ntot0,
  };
}

/** Analytical Rayleigh instantaneous evaporating ratio (light/heavy) vs fraction remaining of heavy isotope. */
export function rayleighInstantaneous(R0, ma, mb, f, beta = 0.5) {
  const alpha = Math.pow(mb / ma, beta);
  return R0 * alpha * Math.pow(f, alpha - 1);
}

/**
 * Exponential-law mass-bias correction (Russell et al., 1978) using a reference ratio:
 *  R_true = R_meas · (m_i/m_j)^(−p), with p from the reference pair.
 */
export function exponentialLawCorrect(Rmeas, mi, mj, refMeas, refTrue, mr1, mr2) {
  const p = Math.log(refMeas / refTrue) / Math.log(mr1 / mr2);
  return Rmeas * Math.pow(mi / mj, -p);
}
