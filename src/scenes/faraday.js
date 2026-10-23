// Faraday cup & amplifier: explodable hardware + Johnson–Nyquist / shot-noise laboratory.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { IonBeam, Sparks } from '../core/beam.js';
import { Chart, PALETTE } from '../core/chart.js';
import { section, slider, select, toggle, readouts, note, para, table, sources, buttons, h, rafThrottle } from '../core/ui.js';
import { buildFaradayCup } from '../components/faraday.js';
import { registerParts } from '../components/parts.js';
import {
  AMPLIFIERS, ampById, johnsonCurrentNoise, johnsonVoltageNoise, shotCurrentNoise, totalCurrentNoise,
  crossoverCurrent, crossoverVoltage, relativePrecision, ratioPrecision, maxCurrent, simulateTrace,
} from '../physics/noise.js';
import { ampsToCps, fmtSI, E_CHARGE } from '../physics/constants.js';
import { RNG } from '../physics/rng.js';

const mm = 1e-3;
const AMP_COLORS = { R10: PALETTE[5], R11: PALETTE[0], R12: PALETTE[2], R13: PALETTE[1], ATONA: PALETTE[4], ZEPTONA: PALETTE[3] };
const logspace = (a, b, n) => Array.from({ length: n }, (_, i) => Math.pow(10, Math.log10(a) + ((Math.log10(b) - Math.log10(a)) * i) / (n - 1)));
const ppm = (x) => (x * 1e6 >= 1000 ? `${(x * 1e3).toPrecision(3)} ‰` : `${(x * 1e6).toPrecision(3)} ppm`);

export default {
  id: 'faraday',
  title: 'Faraday cup & Johnson noise',
  group: 'Detectors',
  icon: '⊔',
  blurb: 'Cup, suppression & amplifier; 10¹⁰–10¹³ Ω, ATONA noise lab',
  async create(ctx) {
    const root = new THREE.Group();
    const ex = new Exploder();
    const S = { ampId: 'R11', T: 300, tInt: 4.194, I: 1e-13, I2: 1e-11, suppression: true, tauCorrect: false };

    // ---- hardware
    const cup = buildFaradayCup({ detail: 'full', resistorId: S.ampId });
    root.add(cup.group);
    registerParts(ex, cup.parts);
    const L = (obj, t, sub, off) => ctx.label(obj, t, { sub, offset: off });
    const byName = (n) => cup.parts.find((p) => p.name.startsWith(n))?.obj;
    L(byName('Entrance'), 'Defining slit', '', [0, 16 * mm, 0]);
    L(byName('Electron suppressor'), 'Suppressor', '−V', [0, -15 * mm, 3 * mm]);
    L(byName('Magnetic'), 'Suppression magnets', '', [6 * mm, 5 * mm, 5 * mm]);
    L(byName('Faraday bucket'), 'Graphite-lined bucket', 'inclined floor', [0, 12 * mm, 24 * mm]);
    L(byName('Signal pin'), 'UHV feedthrough', '', [0, 11 * mm, cup.anchors.feedthrough.z]);
    L(byName('High-ohmic'), 'Feedback resistor', '', [0, 0, 0]);
    L(byName('Electrometer'), 'Electrometer op-amp', '', [-5 * mm, -7 * mm, cup.anchors.feedthrough.z + 46 * mm]);
    L(byName('Evacuated'), 'Amplifier housing', 'evacuated · thermostatted', [0, 12 * mm, 100 * mm]);
    const resLabel = byName('High-ohmic').children.find((c) => c.isCSS2DObject);

    // ---- beam into the cup
    const beam = new IonBeam([new THREE.Vector3(0, 0, -0.07), new THREE.Vector3(0, 0, cup.anchors.cupFloor.z)], { color: 0x5ab0ff, radius: 0.45 * mm, particles: 26, speed: 0.06, size: 1.6 * mm });
    root.add(beam);
    const electrons = new Sparks({ color: 0xffe066, max: 260, size: 1.1 * mm });
    root.add(electrons);
    let escaped = 0, emitted = 0;
    const rngE = new RNG(42);

    // ---- panel
    const panel = [];
    const intro = section('Faraday cup & amplifier', { icon: '⊔' });
    intro.body.append(
      para('A Faraday cup counts <b>charge</b>, not ions: every ion that enters is collected regardless of mass or energy, so the detector has <b>no mass bias</b> and essentially unlimited lifetime. The current (fA–nA) is converted to a voltage by a transimpedance amplifier with a high-ohmic feedback resistor: V = I·R (10¹¹ Ω: 1 V ≙ 10 pA ≙ 6.24×10⁷ ions/s).'),
      para('Explode the model to see the defining slit, the electron suppressor, magnetic suppression, the graphite-lined bucket with inclined floor, the insulators, feedthrough, and the evacuated amplifier housing with its glass-encapsulated feedback resistor.'),
    );
    intro.body.append(buttons([{ label: 'Inside resistor amplifiers →', onClick: () => { location.hash = 'scene=amplifier&mode=resistor'; } }, { label: 'Inside capacitor amplifiers →', onClick: () => { location.hash = 'scene=amplifier&mode=capacitor'; } }, { label: 'Zoom amplifier housing', onClick: () => ctx.app.focusOn(byName('Electrometer')) }]).el);
    panel.push(intro.el);

    const ctl = section('Amplifier & beam', { icon: '⚙' });
    const ampSel = select({ label: 'Amplifier', value: S.ampId, options: AMPLIFIERS.map((a) => ({ value: a.id, label: a.label })), onChange: (v) => { S.ampId = v; cup.setResistor(v); resLabel.visible = !['ATONA', 'ZEPTONA'].includes(v); regen(); refresh(); } });
    const sT = slider({ label: 'Resistor temperature', min: 77, max: 350, step: 1, value: S.T, fmt: (v) => `${v.toFixed(0)} K (${(v - 273.15).toFixed(0)} °C)`, onInput: (v) => { S.T = v; refreshT(); } });
    const sInt = slider({ label: 'Integration time', min: 0.1, max: 1000, value: S.tInt, log: true, fmt: (v) => `${v.toPrecision(3)} s`, onInput: (v) => { S.tInt = v; refreshT(); } });
    const fmtBeam = (v) => `${fmtSI(v, 'A')} · ${(v * 1e11 * 1e3).toPrecision(3)} mV@10¹¹ · ${ampsToCps(v).toExponential(2)} cps`;
    const sI = slider({ label: 'Ion beam (this cup)', min: 1e-18, max: 1e-8, value: S.I, log: true, fmt: fmtBeam, onInput: (v) => { S.I = v; refreshT(); regenT(); } });
    const sI2 = slider({ label: 'Partner beam (ratio denominator)', min: 1e-16, max: 1e-8, value: S.I2, log: true, fmt: fmtBeam, onInput: (v) => { S.I2 = v; refreshT(); } });
    const tSup = toggle({ label: 'Electron suppression on', value: true, onChange: (v) => { S.suppression = v; escaped = emitted = 0; refresh(); } });
    ctl.body.append(ampSel.el, sT.el, sInt.el, sI.el, sI2.el, tSup.el);
    panel.push(ctl.el);

    const res = section('Noise budget', { icon: '∿' });
    const ro = readouts([
      { id: 'jI', label: 'Johnson noise (current)' }, { id: 'jV', label: 'Johnson noise (output V)' },
      { id: 'shot', label: 'Shot noise' }, { id: 'tot', label: 'Total noise (1σ)' },
      { id: 'rel', label: 'Relative precision' }, { id: 'snr', label: 'Signal / noise' },
      { id: 'ratio', label: 'Ratio precision (both cups, same amp)' }, { id: 'regime', label: 'Limited by' },
      { id: 'xI', label: 'Crossover current I* = 2kT/(eR)' }, { id: 'xV', label: 'Crossover V* = 2kT/e (any R)' },
      { id: 'imax', label: 'Max current (saturation)' }, { id: 'tau', label: 'Response τ (illustrative)' },
      { id: 'sup', label: 'Apparent current error from escaping e⁻ (illustrative)', wide: true },
    ]);
    res.body.append(ro.el);
    panel.push(res.el);

    const cA = section('Noise vs integration time', { icon: '📉' });
    const chA = new Chart(cA.body, { height: 200, xLog: true, yLog: true, xLabel: 'integration time (s)', yLabel: '1σ current noise (A)', legendPos: 'bl' });
    cA.body.append(para('Johnson current noise √(2kT/(R·t)) for each amplifier (ATONA/Zeptona as Johnson-equivalent resistance) against the shot noise √(eI/t) of the chosen beam (dashed). Where the dashed line lies above a curve, counting statistics — not the amplifier — limit precision.'));
    panel.push(cA.el);

    const cB = section('Precision vs beam size', { icon: '🎯' });
    const chB = new Chart(cB.body, { height: 210, xLog: true, yLog: true, xLabel: 'ion beam (A)', yLabel: 'relative 1σ precision', legendPos: 'bl' });
    cB.body.append(para('Relative precision at the chosen integration time. Curves end where each amplifier saturates (50 V output for resistor amps). Below ~5×10⁻¹³ A (50 mV on 10¹¹ Ω) the 10¹³ Ω amplifier wins by up to 10× — the regime of U–Pb ID-TIMS on single zircons, minor isotopes such as ²³⁴U, or Nd/Sr from ng-sized samples.'));
    panel.push(cB.el);

    const cC = section('Live amplifier trace (peak jump)', { icon: '⏱' });
    const tTau = toggle({ label: 'Apply tau correction (first-order deconvolution)', value: false, onChange: (v) => { S.tauCorrect = v; regen(); } });
    const chC = new Chart(cC.body, { height: 190, xLabel: 'time (s)', yLabel: 'signal / on-peak', legendPos: 'tr' });
    cC.body.append(tTau.el, para('The magnet alternates every 6 s between the peak and a baseline position. The amplifier output relaxes with τ ≈ R·C<sub>stray</sub>; with 10¹³ Ω the decay takes seconds, so data must be discarded after each jump (idle time) or corrected. Sample period 0.1 s.'));
    panel.push(cC.el);

    const cD = section('Amplifier comparison (current settings)', { icon: '☰' });
    const tblHost = h('div');
    cD.body.append(tblHost);
    panel.push(cD.el);

    const phys = section('Physics & instrument notes', { icon: '📘', open: false });
    phys.body.append(
      para('<b>Johnson–Nyquist noise.</b> Thermal agitation of charge carriers in any resistor produces an open-circuit voltage noise of power spectral density 4kTR (Johnson 1928; Nyquist 1928). Referred to the amplifier input it is a current noise √(4kTΔf/R). For an average over time t the equivalent noise bandwidth is Δf = 1/(2t).'),
      para('<b>√R scaling.</b> The signal scales with R, the noise voltage with √R, so S/N ∝ √R: 10¹³ Ω is 10× quieter (current-equivalent) than 10¹¹ Ω at the same temperature. Cooling helps only as √T.'),
      para('<b>Shot-noise crossover.</b> Johnson and counting noise are equal when I·R = 2kT/e ≈ 52 mV at 300 K — the same output voltage for every resistor. Above that, a bigger resistor buys nothing except a smaller dynamic range (10¹³ Ω saturates at 5 pA for a 50 V output).'),
      para('<b>Gain calibration & virtual amplifier.</b> Each amplifier’s gain is calibrated against a precise reference current (Thermo: 3.3 pA calibration board). The Triton’s relay matrix can connect any amplifier to any cup; rotating amplifiers between cups (“virtual amplifier”) cancels residual gain-factor errors.'),
      para('<b>ATONA.</b> Isotopx’s ATONA replaces the feedback resistor by a capacitive integrator (charge = ∫I dt), using charge integration and active charge management rather than a high-ohmic measuring resistor; Isotopx reports a single detector covering ~10⁻¹⁸–10⁻⁸ A. The Johnson-equivalent resistance used here is an illustrative derivation from Isotopx’s Zeptona note (Zeptona ≈ 10¹⁴ Ω-equivalent and ~5× quieter than ATONA).'),
      note('Model limits: excess (1/f) noise, digitiser quantisation, baseline drift, cup cross-talk and amplifier input-voltage noise are not included. τ values are illustrative.', 'warn'),
      sources([
        { label: 'Thermo Triton XT brochure', url: 'https://documents.thermofisher.com/TFS-Assets/CMD/brochures/br-30537-triton-xt-tims-br30537-en.pdf' },
        { label: 'Isotopx Zeptona note', url: 'https://www.isotopx.com/resources/ultra-low-noise-and-baseline-drift-zeptona-faraday-detector' },
        { label: 'Nu TIMS brochure', url: 'https://www.nu-ins.com/-/media/ameteknuinstruments/files/products/brochures/tims_2019.pdf' },
        { label: 'Johnson 1928, Phys. Rev. 32:97', url: 'https://doi.org/10.1103/PhysRev.32.97' },
        { label: 'Nyquist 1928, Phys. Rev. 32:110', url: 'https://doi.org/10.1103/PhysRev.32.110' },
        { label: 'Koornneef et al. 2014, Anal. Chim. Acta 819:49', url: 'https://doi.org/10.1016/j.aca.2014.02.007' },
      ]),
    );
    panel.push(phys.el);

    // ---- computations
    function refresh() {
      const a = ampById(S.ampId);
      const { R } = a, T = S.T, t = S.tInt, I = S.I;
      const jI = johnsonCurrentNoise(R, T, t), sh = shotCurrentNoise(I, t), tot = totalCurrentNoise(R, T, t, I);
      ro.jI.set(`${fmtSI(jI, 'A')} <small>(${(jI / E_CHARGE).toPrecision(3)} cps)</small>`);
      ro.jV.set(a.kind === 'resistor' ? fmtSI(johnsonVoltageNoise(R, T, t), 'V') : `${fmtSI(jI * 1e11, 'V')} <small>@10¹¹-eq.</small>`);
      ro.shot.set(fmtSI(sh, 'A'));
      ro.tot.set(fmtSI(tot, 'A'));
      const sat = I > maxCurrent(a);
      const rel = relativePrecision(R, T, t, I);
      ro.rel.set(sat ? 'saturated' : ppm(rel), sat ? 'bad' : rel < 1e-4 ? 'good' : rel > 1e-2 ? 'warn' : '');
      ro.snr.set(sat ? '—' : (I / tot).toPrecision(3));
      const rp = ratioPrecision(a, a, T, t, S.I, S.I2);
      ro.ratio.set(S.I2 > maxCurrent(a) || sat ? 'saturated' : ppm(rp));
      ro.regime.set(jI > sh ? 'amplifier (Johnson)' : 'counting statistics', jI > sh ? 'warn' : 'good');
      ro.xI.set(fmtSI(crossoverCurrent(R, T), 'A'));
      ro.xV.set(fmtSI(crossoverVoltage(T), 'V'));
      ro.imax.set(isFinite(maxCurrent(a)) ? fmtSI(maxCurrent(a), 'A') : '∞');
      ro.tau.set(`${a.tau} s`);
      const escFrac = S.suppression ? 2e-6 : 0.012;
      ro.sup.set(S.suppression ? `≈ +${ppm(escFrac)} (suppressed)` : `≈ +${(escFrac * 100).toFixed(1)} % (secondary electrons leave → cup reads high)`, S.suppression ? 'good' : 'bad');

      // chart A
      const ts = logspace(0.1, 1000, 60);
      chA.setSeries([
        ...AMPLIFIERS.map((am) => ({ name: am.label.replace(' resistor', ''), color: AMP_COLORS[am.id], x: ts, y: ts.map((tt) => johnsonCurrentNoise(am.R, T, tt)), width: am.id === S.ampId ? 3 : 1.4 })),
        { name: 'shot noise (beam)', color: '#9aa4b2', dash: [6, 4], x: ts, y: ts.map((tt) => shotCurrentNoise(I, tt)), width: 2 },
      ]);
      chA.setMarks([{ x: t, color: '#9aa4b2', label: `${t.toPrecision(3)} s` }]);
      // chart B
      const Is = logspace(1e-18, 1e-8, 90);
      chB.setSeries([
        ...AMPLIFIERS.map((am) => ({ name: am.label.replace(' resistor', ''), color: AMP_COLORS[am.id], x: Is, y: Is.map((ii) => (ii > maxCurrent(am) ? NaN : relativePrecision(am.R, T, t, ii))), width: am.id === S.ampId ? 3 : 1.4 })),
        { name: 'counting limit', color: '#9aa4b2', dash: [6, 4], x: Is, y: Is.map((ii) => shotCurrentNoise(ii, t) / ii), width: 2 },
      ]);
      chB.setOptions({ yMin: 1e-7, yMax: 10 });
      chB.setMarks([{ x: I, color: '#9aa4b2', label: 'this beam' }]);
      // table
      tblHost.replaceChildren(table(['Amplifier', 'σ<sub>J</sub> (A)', 'σ<sub>J</sub> (cps)', 'rel. 1σ', 'max I'],
        AMPLIFIERS.map((am) => {
          const s = I > maxCurrent(am);
          const jj = johnsonCurrentNoise(am.R, T, t);
          return [(am.id === S.ampId ? '<b>' : '') + am.label + (am.id === S.ampId ? '</b>' : ''), jj.toExponential(2), (jj / E_CHARGE).toPrecision(3), s ? '<span style="color:var(--bad)">sat.</span>' : ppm(relativePrecision(am.R, T, t, I)), isFinite(maxCurrent(am)) ? maxCurrent(am).toExponential(0) : '∞'];
        }), { numCols: [1, 2, 3, 4] }));
      cup.parts.find((p) => p.name.startsWith('High-ohmic')).obj.userData.part.info = `${a.label}. ${a.note}`;
      // beam brightness ~ log current
      beam.setIntensity(Math.min(1, Math.max(0.05, (Math.log10(I) + 17) / 9)));
    }
    const refreshT = rafThrottle(refresh);

    // live trace
    let trace = null, cursor = 0, simClock = 0;
    const dtS = 0.1, N = 3000, win = 300;
    function regen() {
      const a = ampById(S.ampId);
      const I = S.I;
      const cur = (tt) => (Math.floor(tt / 6) % 2 === 0 ? I : I * 0.002);
      trace = simulateTrace({ amp: a, current: cur, T: S.T, dt: dtS, n: N, rng: new RNG(9), tauCorrect: S.tauCorrect });
      cursor = 0;
      drawTrace();
    }
    const regenT = rafThrottle(regen);
    function drawTrace() {
      if (!trace) return;
      const i0 = cursor, i1 = Math.min(N, cursor + win);
      const x = trace.t.slice(i0, i1), y = trace.measI.slice(i0, i1).map((v) => v / S.I), yt = trace.trueI.slice(i0, i1).map((v) => v / S.I);
      chC.setSeries([
        { name: 'true beam', color: '#9aa4b2', x, y: yt, type: 'step', dash: [5, 4], width: 1.5 },
        { name: 'amplifier output', color: AMP_COLORS[S.ampId], x, y, width: 1.3 },
      ]);
    }

    refresh();
    regen();

    // ---- animation
    const floor = cup.anchors.cupFloor;
    const bucketObj = cup.bucket;
    const bucketBase = bucketObj.position.clone();
    function update(dt) {
      simClock += dt;
      if (simClock > dtS * 3) { simClock = 0; cursor = (cursor + 3) % (N - win); drawTrace(); }
      const t = ex.t;
      beam.visible = ctx.app.state.beams && t < 0.08;
      electrons.visible = t < 0.08;
      if (t < 0.08 && Math.random() < 0.9) {
        const off = bucketObj.position.clone().sub(bucketBase);
        const p = floor.clone().add(off).add(new THREE.Vector3(rngE.normal(0, 0.5 * mm), rngE.normal(0, 2 * mm), 0));
        const v = new THREE.Vector3(rngE.normal(0, 0.012), rngE.normal(0, 0.012), -Math.abs(rngE.normal(0.03, 0.012)));
        emitted++;
        const sup = S.suppression;
        electrons.spawn(p, v, sup ? 1.6 : 3.2, (pp, vv) => {
          // suppressor field near the mouth (z < 9 mm) pushes e⁻ back; with suppression off they drift out
          if (sup && pp.z < 9 * mm) vv.z += 0.18 * dt * 10;
          if (sup) { vv.x *= 0.985; vv.y *= 0.985; }
          // walls: absorb
          if (Math.abs(pp.x) > 2.4 * mm || Math.abs(pp.y) > 10 * mm) vv.multiplyScalar(0);
        }, (it) => { if (it.p.z < -1 * mm) escaped++; });
      }
      electrons.update(dt);
    }

    return {
      root, exploder: ex, scale: 0.18, panel,
      camera: { position: [0.13, 0.075, -0.045], target: [0, -0.003, 0.05] },
      update,
      dispose() { chA.dispose(); chB.dispose(); chC.dispose(); beam.dispose(); },
    };
  },
};
