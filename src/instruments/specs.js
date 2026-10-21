// Instrument specifications used to build the three TIMS models.
//
// Every spec row carries a provenance flag:
//   v: true  → stated in the cited vendor/facility document
//   v: false → modelling assumption (clearly marked in the UI)
// Ion-optical parameters that vendors do not publish (magnet radius, pole-face angles)
// are chosen so that the traced optics reproduce the published dispersion where one is
// available. Nothing here is a vendor drawing.

const deg = Math.PI / 180;

export const SOURCES = {
  nuBrochure: { label: 'Nu TIMS brochure (BRO4.91)', url: 'https://www.nu-ins.com/-/media/ameteknuinstruments/files/products/brochures/tims_2019.pdf' },
  nuIntro: { label: 'Nu: Introduction to TIMS', url: 'https://www.nu-ins.com/Products/TIMS/Introduction-to-TIMS' },
  isotopxPhoenix: { label: 'Isotopx Phoenix product page', url: 'https://www.isotopx.com/products/phoenix' },
  isotopxMIC: { label: 'Isotopx multi-ion-counting note', url: 'https://www.isotopx.com/resources/ultra-low-noise-multiple-isotopx-ion-counting-iic-and-faraday-detectors-on-phoenix-tims' },
  isotopxZeptona: { label: 'Isotopx Zeptona note', url: 'https://www.isotopx.com/resources/ultra-low-noise-and-baseline-drift-zeptona-faraday-detector' },
  boise: { label: 'Boise State IGL (Phoenix X62, Isoprobe-T)', url: 'https://www.boisestate.edu/earth-isotope/igl-infrastructure/thermal-ionization-mass-spectrometry-lab-erb-5116b/' },
  ucm: { label: 'UCM CAI facility (Phoenix)', url: 'https://cai.ucm.es/en/earth-sciences-archeometry/facilities/thermal-ionization-mass-spectrometer-tims-phoenix-isotopx/44/' },
  tritonXT: { label: 'Thermo Triton XT brochure (BR30537)', url: 'https://documents.thermofisher.com/TFS-Assets/CMD/brochures/br-30537-triton-xt-tims-br30537-en.pdf' },
  tritonPage: { label: 'Thermo Triton series product page', url: 'https://www.thermofisher.com/order/catalog/product/IQLAAEGAASFAFYMAMV' },
};

export const INSTRUMENTS = {
  phoenix: {
    id: 'phoenix',
    vendor: 'Isotopx',
    name: 'Phoenix',
    tagline: 'Extended-geometry multicollector TIMS with motorised Faraday cups, Daly ion counting, WARP filter and ATONA amplifiers.',
    cabinet: { color: 0xe7ebf0, trim: 0x4b5563 },
    magnet: { R0: 0.27, phi: 90 * deg, targetD: 0.54, note: 'R₀ = 27 cm assumed; pole-face angle solved so the traced optics give the published 54 cm dispersion (classic extended geometry doubles D = R₀ when tan ε ≈ ½).' },
    turret: { n: 20, config: 'single', enclosed: false },
    collector: { faradays: 9, movable: true, naming: 'phoenix', ionCounter: 'daly', filter: 'warp', amps: 'ATONA', rearFaraday: true },
    vacuum: { sourceTurbo: 520, ionPumps: [40, 70], coldTrap: false },
    specs: [
      ['Dispersion', '54 cm at unity magnification (Isoprobe-T/Phoenix); 62 cm on Phoenix X62', true, 'boise'],
      ['Faraday collectors', '9 motorised, individually adjustable cups around an adjustable axial', true, 'boise'],
      ['Ion counting', 'Positive-ion Daly (conversion dynode + scintillator + PMT); optional up to 10–12 conversion-dynode counters (MIC)', true, 'isotopxPhoenix'],
      ['Abundance filter', 'WARP wide-angle retarding potential filter', true, 'boise'],
      ['Amplifiers', 'ATONA capacitive (resistor-less) Faraday amplifiers; Zeptona rear Faraday', true, 'isotopxPhoenix'],
      ['Source pumping', '520 L/s turbomolecular + scroll (Boise X62)', true, 'boise'],
      ['Analyser pumping', 'Ion pumps 40 L/s and 70 L/s (Boise X62)', true, 'boise'],
      ['Sample turret', '20 positions (modelled; check local configuration)', false, null],
      ['Magnet radius / ε', 'R₀ = 27 cm, ε solved from D (model assumption)', false, null],
    ],
    sources: ['isotopxPhoenix', 'boise', 'ucm', 'isotopxMIC', 'isotopxZeptona'],
  },
  nu: {
    id: 'nu',
    vendor: 'Nu Instruments',
    name: 'Nu TIMS',
    tagline: 'Single-focusing 70°, 30 cm laminated magnet with Zoom Optics onto a fixed 12-Faraday array plus Daly and multiplier ion counting.',
    cabinet: { color: 0xf1f1ee, trim: 0x4b5563 },
    magnet: { R0: 0.30, phi: 70 * deg, eps: 0, note: '70° sector, 30 cm radius, unity magnification (brochure). Normal entry/exit assumed (not stated).' },
    turret: { n: 20, config: 'double', enclosed: true },
    collector: { faradays: 12, movable: false, naming: 'nu', ionCounter: 'daly+sem', filter: 'energy', amps: 'resistor', zoom: true },
    vacuum: { sourceTurbo: 400, ionPumps: [75, 75], coldTrap: true },
    specs: [
      ['Magnet', 'Single-focusing 70° sector, 30 cm radius, laminated', true, 'nuBrochure'],
      ['Optics', 'Unity magnification; quad + Zoom Optics for variable dispersion onto a fixed array', true, 'nuBrochure'],
      ['Collector (standard)', '12 fixed Faradays + 2 ion-counting positions (Daly + multiplier, 2 multipliers or 2 Dalys)', true, 'nuBrochure'],
      ['Collector (option)', '16 Faradays + 5 ion-counting positions', true, 'nuBrochure'],
      ['Faraday suppression', 'Electrostatic and magnetic electron suppression; switchable resistor amplifiers optional', true, 'nuBrochure'],
      ['Energy filter', 'On ion counters; improves abundance sensitivity by up to 2 orders of magnitude', true, 'nuBrochure'],
      ['Abundance sensitivity', 'As low as 2 ppm at 1 amu relative to ²³⁸U', true, 'nuBrochure'],
      ['Sample turret', '20 filaments, single or double, each fully enclosed; visible-light position sensing', true, 'nuBrochure'],
      ['Source', 'Machined from a single piece of stainless steel; user-replaceable source slit', true, 'nuBrochure'],
      ['Source pumping', '400 L/s turbo + oil-free scroll; LN₂ cold trap (24 h per fill)', true, 'nuBrochure'],
      ['Analyser pumping', '2 × 75 L/s ion pumps', true, 'nuBrochure'],
      ['Total evaporation', 'Small beam tuned on an ion counter before Faraday measurement to minimise pre-analysis loss', true, 'nuBrochure'],
    ],
    sources: ['nuBrochure', 'nuIntro'],
  },
  triton: {
    id: 'triton',
    vendor: 'Thermo Fisher Scientific',
    name: 'Triton XT',
    tagline: 'Moveable 9-Faraday array with a central dual-mode Faraday/SEM, RPQ filter and 10¹¹/10¹³ Ω amplifiers with virtual-amplifier rotation.',
    cabinet: { color: 0xe3e7ec, trim: 0x4b5563 },
    magnet: { R0: 0.23, phi: 90 * deg, eps: Math.atan(0.5), note: '90° sector with inclined pole faces ("extended geometry", inclined focal plane per brochure). R₀ = 23 cm and ε = tan⁻¹½ are modelling assumptions.' },
    turret: { n: 21, config: 'double', enclosed: false },
    collector: { faradays: 9, movable: true, naming: 'thermo', ionCounter: 'sem', filter: 'rpq', amps: 'resistor' },
    vacuum: { sourceTurbo: 400, ionPumps: [75, 75], coldTrap: false },
    specs: [
      ['Collectors', '9 Faraday cups (8 moveable + 1 central dual-mode Faraday/SEM); positioning resolution < 5 µm', true, 'tritonXT'],
      ['Amplifiers', '10 current amplifiers; 10¹¹ Ω standard (50 V); 10¹³ Ω with gain calibration; optional 10¹⁰ Ω', true, 'tritonXT'],
      ['Virtual amplifier', 'Relay matrix rotates amplifiers across cups to cancel gain-factor uncertainty', true, 'tritonXT'],
      ['Ion counting', 'Up to 8 discrete-dynode SEMs (MIC) or CDDs', true, 'tritonXT'],
      ['RPQ', 'Up to 2 retarding potential quadrupole lenses', true, 'tritonXT'],
      ['Abundance sensitivity', '2 × 10⁻⁶ standard; < 2 × 10⁻⁸ with RPQ (±1 u from ²³⁸U)', true, 'tritonXT'],
      ['Sample magazine', '21 single or double filaments; exchangeable without tools', true, 'tritonXT'],
      ['Source', '10 kV acceleration (±); ≈0.5 eV kinetic energy spread; optional pyrometer & gas bleed', true, 'tritonXT'],
      ['Mass range', 'Li to UO₂ (static ⁶Li/⁷Li, extendable to ⁴⁰Ca–⁴⁸Ca)', true, 'tritonXT'],
      ['Magnet radius / ε', 'R₀ = 23 cm, ε = tan⁻¹½ (model assumption)', false, null],
    ],
    sources: ['tritonXT', 'tritonPage'],
  },
};

export const VENDOR_ORDER = ['phoenix', 'nu', 'triton'];
