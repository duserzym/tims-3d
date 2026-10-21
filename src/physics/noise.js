// Faraday-cup amplifier noise model.
//
// A Faraday cup collects the ion current I. A transimpedance amplifier converts it to a
// voltage V = I·R across a high-ohmic feedback resistor R. The resistor contributes
// Johnson–Nyquist (thermal) noise:
//     voltage noise  v_J = sqrt(4 k T R Δf)
//     current noise  i_J = sqrt(4 k T Δf / R)          (referred to the input)
// For a signal averaged over an integration time t the equivalent noise bandwidth is
// Δf = 1/(2t), giving i_J = sqrt(2 k T / (R t)).
//
// The ion beam itself carries shot (counting) noise: i_S = sqrt(e I / t)  (= e·sqrt(N)/t).
//
// Because the signal grows as R but Johnson voltage noise only as sqrt(R), the
// signal-to-Johnson-noise ratio improves as sqrt(R): a 10^13 Ω resistor is 10× quieter
// (current-equivalent) than a 10^11 Ω resistor.
//
// A useful invariant: Johnson noise equals shot noise when I·R = 2kT/e ≈ 52 mV at 300 K,
// independent of R. Above ~52 mV of output signal the measurement is counting-statistics
// limited; below, it is amplifier limited.

import { K_B, E_CHARGE } from './constants.js';

/**
 * Amplifier catalogue. Values marked `illustrative` are representative, not vendor specs.
 *  - R: feedback resistance (Ω) or Johnson-equivalent resistance for resistor-less designs.
 *  - vMax: maximum output (V) → maximum current = vMax / R (resistor amps).
 *  - tau: response time constant (s), dominated by R × stray feedback capacitance.
 */
export const AMPLIFIERS = [
  {
    id: 'R10', label: '10¹⁰ Ω resistor', R: 1e10, kind: 'resistor', vMax: 50, tau: 0.02,
    note: 'Extends dynamic range for very large beams (optional on Triton XT).',
  },
  {
    id: 'R11', label: '10¹¹ Ω resistor', R: 1e11, kind: 'resistor', vMax: 50, tau: 0.1,
    note: 'Workhorse amplifier. Triton XT: 50 V range; baseline noise limits use below ≈500 fA (Thermo brochure BR30537).',
  },
  {
    id: 'R12', label: '10¹² Ω resistor', R: 1e12, kind: 'resistor', vMax: 50, tau: 0.3,
    note: 'Intermediate gain (e.g. Isotopx "Xact" 10¹² Ω boards).',
  },
  {
    id: 'R13', label: '10¹³ Ω resistor', R: 1e13, kind: 'resistor', vMax: 50, tau: 1.0,
    note: 'Small beams (~30 kcps–3 Mcps per Thermo). Long τ requires tau-correction after magnet jumps; gain needs calibration.',
  },
  {
    id: 'ATONA', label: 'ATONA (capacitive TIA)', R: 4e12, kind: 'capacitive', vMax: Infinity, tau: 0.05,
    iMax: 1e-8,
    note: 'Isotopx resistor-less capacitive transimpedance amplifier; no range switching from ~1e-17 A to nA. ' +
      'Johnson-equivalent R here is derived from Isotopx: Zeptona ≈ 1e14 Ω-equivalent at >10 s and ≈5× quieter than ATONA ⇒ ATONA ≈ 1e14/5² ≈ 4×10¹² Ω (illustrative).',
  },
  {
    id: 'ZEPTONA', label: 'Zeptona (ATONA, single cup)', R: 1e14, kind: 'capacitive', vMax: Infinity, tau: 0.05,
    iMax: 1e-8,
    note: 'Isotopx: noise comparable to a theoretical 1e14 Ω resistor for integrations >10 s; <3.2e-19 A at 1000 s.',
  },
];

export const ampById = (id) => AMPLIFIERS.find((a) => a.id === id);

/** Johnson current noise (A, 1σ) for resistance R (Ω), temperature T (K), integration time t (s). */
export function johnsonCurrentNoise(R, T, t) {
  return Math.sqrt((2 * K_B * T) / (R * t));
}

/** Johnson voltage noise (V, 1σ) at the amplifier output. */
export function johnsonVoltageNoise(R, T, t) {
  return Math.sqrt((2 * K_B * T * R) / t);
}

/** Shot (counting) noise of an ion current I (A) integrated for t (s). */
export function shotCurrentNoise(I, t, z = 1) {
  return Math.sqrt((z * E_CHARGE * Math.abs(I)) / t);
}

/** Total 1σ current noise (A): Johnson ⊕ shot ⊕ optional extra (e.g. electronics) term. */
export function totalCurrentNoise(R, T, t, I, extra = 0) {
  const j = johnsonCurrentNoise(R, T, t);
  const s = shotCurrentNoise(I, t);
  return Math.sqrt(j * j + s * s + extra * extra);
}

/** Current at which Johnson noise equals shot noise: I* = 2kT/(eR). */
export function crossoverCurrent(R, T) {
  return (2 * K_B * T) / (E_CHARGE * R);
}

/** Output voltage at the Johnson/shot crossover — independent of R (≈ 51.7 mV at 300 K). */
export function crossoverVoltage(T) {
  return (2 * K_B * T) / E_CHARGE;
}

/** Relative precision (1σ, fraction) of a single-cup intensity measurement. */
export function relativePrecision(R, T, t, I) {
  return totalCurrentNoise(R, T, t, I) / Math.abs(I);
}

/**
 * Precision of an isotope ratio I1/I2 measured simultaneously on two cups (independent noise).
 * σ(r)/r = sqrt((σ1/I1)² + (σ2/I2)²).
 */
export function ratioPrecision(amp1, amp2, T, t, I1, I2) {
  const a = relativePrecision(amp1.R, T, t, I1);
  const b = relativePrecision(amp2.R, T, t, I2);
  return Math.sqrt(a * a + b * b);
}

/** Maximum measurable current for an amplifier (A). */
export function maxCurrent(amp) {
  if (amp.iMax) return amp.iMax;
  return amp.vMax / amp.R;
}

/**
 * Simulate a sampled amplifier trace.
 * @param {object} o
 * @param {object} o.amp amplifier from AMPLIFIERS
 * @param {(t:number)=>number} o.current true ion current vs time (A)
 * @param {number} o.T resistor temperature (K)
 * @param {number} o.dt sample (integration) period (s)
 * @param {number} o.n number of samples
 * @param {import('./rng.js').RNG} o.rng
 * @param {boolean} [o.tauCorrect=false] apply ideal first-order deconvolution
 * @returns {{t:number[], trueI:number[], measI:number[], volts:number[], saturated:boolean[]}}
 */
export function simulateTrace({ amp, current, T, dt, n, rng, tauCorrect = false, t0 = 0 }) {
  const t = [], trueI = [], measI = [], volts = [], saturated = [];
  const a = 1 - Math.exp(-dt / amp.tau);
  let y = current(t0);
  let prevY = y;
  const iMax = maxCurrent(amp);
  for (let k = 0; k < n; k++) {
    const tk = t0 + k * dt;
    const I = current(tk);
    // shot noise belongs to the beam; it is filtered with the signal by the amplifier response
    const Ishot = I + rng.normal(0, shotCurrentNoise(I, dt));
    prevY = y;
    y = y + a * (Ishot - y);
    let out = y;
    if (tauCorrect) out = prevY + (y - prevY) / a; // exact inverse of the discrete first-order lag
    out += rng.normal(0, johnsonCurrentNoise(amp.R, T, dt));
    const sat = Math.abs(out) > iMax;
    if (sat) out = Math.sign(out) * iMax;
    t.push(tk); trueI.push(I); measI.push(out); volts.push(out * (isFinite(amp.R) ? amp.R : 1e11)); saturated.push(sat);
  }
  return { t, trueI, measI, volts, saturated };
}

/** Sample standard deviation. */
export function stdev(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  let m = 0;
  for (const v of arr) m += v;
  m /= n;
  let s = 0;
  for (const v of arr) s += (v - m) ** 2;
  return Math.sqrt(s / (n - 1));
}
export function mean(arr) {
  let m = 0;
  for (const v of arr) m += v;
  return m / arr.length;
}
