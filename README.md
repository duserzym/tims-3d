# TIMS 3D

Interactive, explodable three.js models of **thermal ionization mass spectrometers (TIMS)**.
The ion optics and detector behaviour come from small physics modules, so the beams, cup positions, noise figures and efficiencies are computed rather than drawn by hand.

| Scene | What it shows |
|---|---|
| **TIMS instruments** | Isotopx **Phoenix**, **Nu TIMS** and Thermo **Triton XT**, each with a source turret, lens stack, sector magnet, flight tubes, a multicollector, an ion counter with its abundance filter, pumps and a cabinet. Isotope beams are traced through the magnet and each cup sits at the traced focal point of its mass. You can switch the element, send the axial beam to the ion counter, and show the focusing fan. |
| **Nu TIMS brochure** | A model built from the brochure's feature list, with numbered hotspots. It includes a quantitative **Zoom Optics** demo: peak coincidence on a fixed array during a 5-cycle Sr multi-dynamic routine, with and without the zoom lens. |
| **Source potentials & selector tuning** | A 2-D Laplace solution (SOR with superposed basis fields) of a generic Nier-type lens stack, with RK4 ion trajectories and an equipotential map. Controls cover extraction, focus, Y-symmetry, deflection, the source slit and the angular selector slit. Auto-tune runs a coordinate search, and there are focus-scan and phase-space charts. |
| **Filaments: 1, 2, 3 & element usage** | Single, double, triple and N-TIMS assemblies that glow by temperature. An element "usage system" maps each element to its configuration, loading and ion species, and a Saha–Langmuir calculator covers Re, Ta, W, Pt and Ni. |
| **Faraday cup & Johnson noise** | An explodable cup (suppression electrode, magnets and graphite bucket) with its amplifier and feedback resistor. Johnson–Nyquist and shot-noise budgets cover 10¹⁰–10¹³ Ω, ATONA and Zeptona, plus the R-independent 2kT/e ≈ 52 mV crossover. A live trace shows the τ lag after a peak jump. |
| **Daly detector** | The ion → knob → electrons → scintillator → window → PMT chain, with an animated cascade. Monte-Carlo pulse-height distribution, plateau curve and dead time. |
| **Ion counter (SEM)** | A discrete-dynode and a conversion-dynode multiplier, an avalanche animation, a Pólya PHD, mass bias, and ageing with extracted charge. |
| **Daly vs ion counter** | The same beam on both detectors: comparison table, overlaid PHDs, efficiency vs mass, and 24 h yield drift. |
| **Total evaporation** | Rayleigh fractionation of a filament reservoir, comparing total evaporation (TE) with a conventional window. Includes Nu-style tuning on an ion counter and the pre-analysis loss it avoids. |

Global controls: **Explode** slider (<kbd>E</kbd>), **X-ray** housings (<kbd>X</kbd>), labels (<kbd>L</kbd>), beams (<kbd>B</kbd>), glow, and PNG export. Click any part for a short physical explanation. Deep links work, for example `#scene=instrument&vendor=nu&element=U&explode=0.6`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics unit tests (vitest)
npm run build      # static site in dist/ (relative paths, any static host)
npm run screenshots  # headless smoke test + PNGs of every scene (Playwright)
```

## Layout

```
src/
  core/         renderer/app shell, explode controller, materials, geometry, charts, UI, beams
  physics/      constants, noise (Johnson/shot), saha (surface ionization), sector (ion optics),
                laplace + sourceLens (electrostatics), detectors (Daly/SEM MC), evaporation (TE),
                multidynamic (Zoom Optics), elements (usage system), rng
  components/   filament, turret, lens, magnet, faraday, daly, sem, vacuum  → { group, parts, … }
  instruments/  specs.js (with provenance flags), build.js (assembles an instrument from optics)
  scenes/       one module per scene (see src/core/app.js for the scene contract)
tests/          vitest physics tests
tools/          headless screenshot / smoke test
```

## Scientific notes and honesty

- **Ion optics**: the magnetic sectors are uniform-field regions with optional pole-face rotation. There are no fringe fields. Ray tracing is analytic (line → arc → line). The tests check that the model reproduces Barber's rule (L = R·cot(φ/2)) and D = R₀ for symmetric normal entry, and that ε = tan⁻¹½ doubles D (classic extended geometry).
- **Vendor numbers**: every row in `src/instruments/specs.js` carries a *source* or *assumed* flag that the UI shows. Vendors do not publish magnet radii or pole-face angles, so those are **model assumptions**. For the Phoenix, the pole-face angle is solved so that the traced optics give the published 54 cm dispersion.
- **Detector constants** (secondary-electron yields, PMT photoelectrons per electron, ageing constants) are illustrative. The UI labels them that way. They reproduce the documented qualitative behaviour, but they are not calibrations.
- **Lens field**: a planar 2-D Laplace solution of a generic lens stack with no space charge. Trajectories in electrostatic lenses are mass-independent, so one set of rays serves every isotope.

## Sources

- Nu Instruments, *TIMS brochure* (BRO4.91) — <https://www.nu-ins.com/-/media/ameteknuinstruments/files/products/brochures/tims_2019.pdf>
- Nu Instruments, *Introduction to TIMS* — <https://www.nu-ins.com/Products/TIMS/Introduction-to-TIMS>
- Isotopx, *Phoenix* — <https://www.isotopx.com/products/phoenix>; *Zeptona* and *multi-ion-counting* application notes
- Boise State IGL instrument descriptions (Phoenix X62, Isoprobe-T) — <https://www.boisestate.edu/earth-isotope/igl-infrastructure/thermal-ionization-mass-spectrometry-lab-erb-5116b/>
- Thermo Fisher, *Triton XT TIMS* brochure (BR30537) — <https://documents.thermofisher.com/TFS-Assets/CMD/brochures/br-30537-triton-xt-tims-br30537-en.pdf>
- Johnson (1928) *Phys. Rev.* 32, 97; Nyquist (1928) *Phys. Rev.* 32, 110; Daly (1960) *Rev. Sci. Instrum.* 31, 264; ASTM C1672 (total evaporation of U/Pu)

Vendor and product names are used only to identify the instruments being modelled. This project is not affiliated with Isotopx, Nu Instruments (AMETEK) or Thermo Fisher Scientific.
