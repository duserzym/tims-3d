// Physical constants (CODATA 2018 exact / recommended values), SI units.
export const K_B = 1.380649e-23; // J/K
export const K_B_EV = 8.617333262e-5; // eV/K
export const E_CHARGE = 1.602176634e-19; // C
export const AMU = 1.66053906660e-27; // kg
export const M_E = 9.1093837015e-31; // kg
export const C_LIGHT = 299792458; // m/s

/** Ion current (A) -> count rate (ions/s) for singly charged ions. */
export const ampsToCps = (I, z = 1) => I / (z * E_CHARGE);
/** Count rate (ions/s) -> current (A). */
export const cpsToAmps = (cps, z = 1) => cps * z * E_CHARGE;

export const celsiusToKelvin = (c) => c + 273.15;
export const kelvinToCelsius = (k) => k - 273.15;

/** Pretty SI formatting, e.g. fmtSI(2.9e-16,'A') -> "290 aA". */
export function fmtSI(x, unit = '', digits = 3) {
  if (!isFinite(x)) return `— ${unit}`;
  if (x === 0) return `0 ${unit}`;
  const prefixes = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'], [1e-18, 'a'], [1e-21, 'z'],
  ];
  const a = Math.abs(x);
  for (const [f, p] of prefixes) {
    if (a >= f * 0.9995) return `${(x / f).toPrecision(digits)} ${p}${unit}`;
  }
  return `${x.toExponential(digits - 1)} ${unit}`;
}

/** Scientific notation as HTML with superscript exponent. */
export function fmtExp(x, digits = 2) {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${m.toFixed(digits - 1)}×10<sup>${e}</sup>`;
}
