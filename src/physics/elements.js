// Element "usage system" for TIMS filament configurations.
//
// IE: first ionization energy (eV), NIST Atomic Spectra Database.
// gRatio: g⁺/g⁰ from ground-state J values (2J+1) only — partition functions at
//   filament temperature are ignored, so treat it as a first-order factor.
// config: the most common filament configuration in the literature; alt lists other
//   widely used setups. Typical run temperatures (Trun, °C, pyrometer) are approximate,
//   instrument- and loading-dependent, and only used to seed the interactive plots.
//
// Configurations:
//   single  – one ribbon both evaporates and ionizes the sample (activator often needed)
//   double  – evaporation filament (sample) + ionization filament (blank, hot)
//   triple  – two evaporation side filaments + central ionization filament
//   ntims   – negative-ion TIMS on a single low-W coated filament

export const CONFIGS = {
  single: { label: 'Single filament', short: '1', color: '#4f8cff' },
  double: { label: 'Double filament', short: '2', color: '#18b37e' },
  triple: { label: 'Triple filament', short: '3', color: '#e8a33d' },
  ntims: { label: 'N-TIMS (negative ions)', short: '−', color: '#c260d6' },
};

export const ELEMENTS = [
  {
    sym: 'Li', Z: 3, name: 'Lithium', IE: 5.3917, gRatio: 0.5, group: 1, period: 2,
    config: 'single', alt: ['triple'], filament: 'Re', ion: 'Li₂BO₂⁺ (m/z 56/57)',
    loading: 'Li borate on single Re (Li₂BO₂⁺ method); or Li⁺ on triple Re.',
    Trun: 1300, why: 'Light isotopes fractionate strongly; the heavy molecular ion Li₂BO₂⁺ reduces mass fractionation.',
  },
  {
    sym: 'B', Z: 5, name: 'Boron', IE: 8.298, gRatio: 0.5, group: 13, period: 2,
    config: 'single', alt: ['ntims'], filament: 'Ta', ion: 'Cs₂BO₂⁺ (m/z 308/309) or BO₂⁻ (42/43)',
    loading: 'Cs borate + graphite on single Ta (P-TIMS); or B with Ba/Ca on Re for BO₂⁻ (N-TIMS).',
    Trun: 1100, why: 'B⁺ ionizes very poorly (IE 8.3 eV); molecular ions solve both efficiency and fractionation.',
  },
  {
    sym: 'Ca', Z: 20, name: 'Calcium', IE: 6.1132, gRatio: 2, group: 2, period: 4,
    config: 'double', alt: ['single', 'triple'], filament: 'Re', ion: 'Ca⁺',
    loading: 'Ca nitrate/chloride on evaporation Re; or single Ta with H₃PO₄.',
    Trun: 1600, why: 'Large relative mass range (40–48) → double-spike methods; double filaments stabilize emission.',
  },
  {
    sym: 'Rb', Z: 37, name: 'Rubidium', IE: 4.1771, gRatio: 0.5, group: 1, period: 5,
    config: 'double', alt: ['single'], filament: 'Re', ion: 'Rb⁺',
    loading: 'Rb chloride; runs at low temperature, ionizes efficiently (IE < W).',
    Trun: 900, why: 'IE well below W(Re): nearly complete ionization; the challenge is controlling fast evaporation.',
  },
  {
    sym: 'Sr', Z: 38, name: 'Strontium', IE: 5.6949, gRatio: 2, group: 2, period: 5,
    config: 'single', alt: ['double'], filament: 'Re', ion: 'Sr⁺',
    loading: 'Sr with TaCl₅/TaF₅ activator on single Re or W (Birck-type), or on single Ta.',
    Trun: 1450, why: 'Ta activator raises emission and stability; ⁸⁶Sr/⁸⁸Sr internal normalization corrects fractionation.',
  },
  {
    sym: 'Cs', Z: 55, name: 'Caesium', IE: 3.8939, gRatio: 0.5, group: 1, period: 6,
    config: 'single', alt: ['double'], filament: 'Re', ion: 'Cs⁺',
    loading: 'Lowest IE of all stable elements; ionizes at modest temperature.',
    Trun: 900, why: 'IE ≪ W: ionization efficiency approaches 100 %.',
  },
  {
    sym: 'Ba', Z: 56, name: 'Barium', IE: 5.2117, gRatio: 2, group: 2, period: 6,
    config: 'single', alt: ['double'], filament: 'Re', ion: 'Ba⁺',
    loading: 'Ba with silica gel / H₃PO₄ on single Re, or double Re.',
    Trun: 1300, why: 'Low IE; single filament usually sufficient.',
  },
  {
    sym: 'Nd', Z: 60, name: 'Neodymium', IE: 5.525, gRatio: 0.89, group: 'Ln', period: 6,
    config: 'double', alt: ['triple', 'single'], filament: 'Re', ion: 'Nd⁺ (or NdO⁺ single)',
    loading: 'Nd⁺ from double/triple Re; NdO⁺ on single Re with silica gel/oxygen (small samples).',
    Trun: 1800, why: 'Refractory REE: hot ionization filament (>1700 °C) separated from the evaporation filament.',
  },
  {
    sym: 'Sm', Z: 62, name: 'Samarium', IE: 5.6437, gRatio: 2, group: 'Ln', period: 6,
    config: 'double', alt: ['triple'], filament: 'Re', ion: 'Sm⁺',
    loading: 'Sm on evaporation Re, blank Re ionization filament.',
    Trun: 1750, why: 'As Nd; Sm–Nd geochronology uses mixed spikes.',
  },
  {
    sym: 'Re', Z: 75, name: 'Rhenium', IE: 7.8335, gRatio: 1.17, group: 7, period: 6,
    config: 'ntims', alt: [], filament: 'Ni', ion: 'ReO₄⁻',
    loading: 'Ba(NO₃)₂ activator on Ni or Pt filament, oxygen bleed.',
    Trun: 800, why: 'High IE makes Re⁺ inefficient; perrhenate anion has a large electron affinity.',
  },
  {
    sym: 'Os', Z: 76, name: 'Osmium', IE: 8.4382, gRatio: 1.11, group: 8, period: 6,
    config: 'ntims', alt: [], filament: 'Pt', ion: 'OsO₃⁻',
    loading: 'Ba(OH)₂ / NaOH activator on Pt, oxygen bleed (Creaser et al., 1991; Völkening et al., 1991).',
    Trun: 800, why: 'Os⁺ practically does not form by surface ionization; OsO₃⁻ ionizes efficiently at low W.',
  },
  {
    sym: 'Pb', Z: 82, name: 'Lead', IE: 7.4167, gRatio: 2, group: 14, period: 6,
    config: 'single', alt: [], filament: 'Re', ion: 'Pb⁺',
    loading: 'Silica gel + H₃PO₄ emitter on single Re (Gerstenberger & Haase, 1997 silicic-acid gel).',
    Trun: 1250, why: 'Silica-gel emitter raises the effective work function and releases Pb⁺ at moderate T.',
  },
  {
    sym: 'Th', Z: 90, name: 'Thorium', IE: 6.3067, gRatio: 0.8, group: 'An', period: 7,
    config: 'triple', alt: ['double', 'single'], filament: 'Re', ion: 'Th⁺',
    loading: 'Th on side filaments with hot centre Re; or single Re with graphite (U-series).',
    Trun: 2000, why: 'Very refractory; needs the hottest ionization filament.',
  },
  {
    sym: 'U', Z: 92, name: 'Uranium', IE: 6.1941, gRatio: 0.77, group: 'An', period: 7,
    config: 'double', alt: ['triple', 'single'], filament: 'Re', ion: 'U⁺ (or UO₂⁺ on single)',
    loading: 'U⁺: double/triple Re (nuclear safeguards, total evaporation). UO₂⁺: single Re + silica gel (U–Pb ID-TIMS).',
    Trun: 1900, why: 'No invariant ratio for internal normalization → total evaporation or double spike.',
  },
  {
    sym: 'Pu', Z: 94, name: 'Plutonium', IE: 6.0258, gRatio: 2, group: 'An', period: 7,
    config: 'double', alt: ['triple'], filament: 'Re', ion: 'Pu⁺',
    loading: 'Pu on evaporation Re, blank Re ionization filament; total evaporation common.',
    Trun: 1850, why: 'Like U; isotope ratios measured by total evaporation (ASTM C1672).',
  },
];

export const elementBySym = (s) => ELEMENTS.find((e) => e.sym === s);

/** Isotope sets used for beam-path presets (masses in u, abundances in %). */
export const ISOTOPE_SETS = {
  Sr: { label: 'Sr (84–88)', isotopes: [
    { name: '⁸⁴Sr', m: 83.9134, ab: 0.56 }, { name: '⁸⁶Sr', m: 85.9093, ab: 9.86 },
    { name: '⁸⁷Sr', m: 86.9089, ab: 7.0 }, { name: '⁸⁸Sr', m: 87.9056, ab: 82.58 },
  ], axial: '⁸⁶Sr' },
  Nd: { label: 'Nd (142–150)', isotopes: [
    { name: '¹⁴²Nd', m: 141.9077, ab: 27.15 }, { name: '¹⁴³Nd', m: 142.9098, ab: 12.17 },
    { name: '¹⁴⁴Nd', m: 143.9101, ab: 23.8 }, { name: '¹⁴⁵Nd', m: 144.9126, ab: 8.29 },
    { name: '¹⁴⁶Nd', m: 145.9131, ab: 17.19 }, { name: '¹⁴⁸Nd', m: 147.9169, ab: 5.76 },
    { name: '¹⁵⁰Nd', m: 149.9209, ab: 5.64 },
  ], axial: '¹⁴⁶Nd' },
  Pb: { label: 'Pb (204–208)', isotopes: [
    { name: '²⁰⁴Pb', m: 203.973, ab: 1.4 }, { name: '²⁰⁶Pb', m: 205.9745, ab: 24.1 },
    { name: '²⁰⁷Pb', m: 206.9759, ab: 22.1 }, { name: '²⁰⁸Pb', m: 207.9767, ab: 52.4 },
  ], axial: '²⁰⁶Pb' },
  U: { label: 'U (234–238)', isotopes: [
    { name: '²³⁴U', m: 234.0410, ab: 0.0054 }, { name: '²³⁵U', m: 235.0439, ab: 0.7204 },
    { name: '²³⁶U', m: 236.0456, ab: 0.0001 }, { name: '²³⁸U', m: 238.0508, ab: 99.2742 },
  ], axial: '²³⁶U' },
  SrMD: { label: 'Sr + ⁸⁵Rb monitor (multi-dynamic demo)', hidden: true, isotopes: [
    { name: '⁸⁴Sr', m: 83.9134, ab: 0.56 }, { name: '⁸⁵Rb', m: 84.9118, ab: 0.05 }, { name: '⁸⁶Sr', m: 85.9093, ab: 9.86 },
    { name: '⁸⁷Sr', m: 86.9089, ab: 7.0 }, { name: '⁸⁸Sr', m: 87.9056, ab: 82.58 },
  ], axial: '⁸⁶Sr' },
  Ca: { label: 'Ca (40–48)', isotopes: [
    { name: '⁴⁰Ca', m: 39.9626, ab: 96.94 }, { name: '⁴²Ca', m: 41.9586, ab: 0.647 },
    { name: '⁴³Ca', m: 42.9588, ab: 0.135 }, { name: '⁴⁴Ca', m: 43.9555, ab: 2.086 },
    { name: '⁴⁸Ca', m: 47.9525, ab: 0.187 },
  ], axial: '⁴⁴Ca' },
};
