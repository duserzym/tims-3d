// Saha–Langmuir surface ionization.
//
// For an atom of ionization energy IE desorbing from a hot surface of work function W at
// temperature T, the ratio of positive ions to neutrals leaving the surface is
//     α⁺ = n⁺/n⁰ = (g⁺/g⁰) · exp[(W − IE) / kT]
// and the ionization efficiency is β⁺ = α⁺ / (1 + α⁺).
//
// For negative ions (N-TIMS) with electron affinity EA:
//     α⁻ = n⁻/n⁰ = (g⁻/g⁰) · exp[(EA − W) / kT]
// which is why N-TIMS uses low-work-function surfaces (Pt or Ni ribbons coated with Ba
// salts, e.g. Ba(OH)₂/Ba(NO₃)₂).
//
// Consequences reproduced by this module:
//  • Elements with IE < W (alkalis on Re) ionize almost completely.
//  • Elements with IE > W ionize poorly, but efficiency *rises* with temperature, which is
//    why double/triple filament assemblies decouple evaporation (cool side filament) from
//    ionization (very hot centre filament).

import { K_B_EV } from './constants.js';

export function alphaPositive({ IE, W, T, gRatio = 1 }) {
  return gRatio * Math.exp((W - IE) / (K_B_EV * T));
}

export function alphaNegative({ EA, W, T, gRatio = 1 }) {
  return gRatio * Math.exp((EA - W) / (K_B_EV * T));
}

export const efficiencyFromAlpha = (a) => a / (1 + a);

export function positiveEfficiency(p) {
  return efficiencyFromAlpha(alphaPositive(p));
}
export function negativeEfficiency(p) {
  return efficiencyFromAlpha(alphaNegative(p));
}

/** Polycrystalline work functions (eV). Effective TIMS values depend on oxidation/activators. */
export const FILAMENT_METALS = {
  Re: { name: 'Rhenium', W: 4.96, Wrange: [4.7, 5.3], melt: 3186, color: 0xb8bcc4,
    note: 'High work function and melting point: the default ionization filament.' },
  Ta: { name: 'Tantalum', W: 4.25, Wrange: [4.0, 4.4], melt: 3017, color: 0x9aa2ad,
    note: 'Lower W; used as single filament for easily ionized elements (e.g. Sr with Ta activator, Cs₂BO₂⁺).' },
  W: { name: 'Tungsten', W: 4.55, Wrange: [4.3, 4.6], melt: 3422, color: 0xa7abb3,
    note: 'Used for Sr with TaF₅ activator and some high-temperature applications.' },
  Pt: { name: 'Platinum', W: 5.65, Wrange: [5.1, 5.9], melt: 1768, color: 0xd9d4c8,
    note: 'N-TIMS substrate (OsO₃⁻) once coated with a Ba activator that lowers the effective W.' },
  Ni: { name: 'Nickel', W: 5.15, Wrange: [5.0, 5.35], melt: 1455, color: 0xc0b9a8,
    note: 'Occasionally used for N-TIMS (ReO₄⁻).' },
};

/**
 * Approximate blackbody colour (sRGB, 0..1) for temperature in K, after Tanner Helland's
 * fit, plus a radiance factor so cool filaments do not glow.
 */
export function blackbodyRGB(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) r = 255;
  else r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661;
  else g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (x) => Math.min(255, Math.max(0, x)) / 255;
  // Stefan–Boltzmann-ish visibility ramp: invisible below ~800 K, bright above ~2000 K.
  const vis = Math.min(1, Math.max(0, (T - 780) / 1400)) ** 1.6;
  return { r: c(r), g: c(g), b: c(b), intensity: vis };
}
