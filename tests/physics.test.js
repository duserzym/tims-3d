import { describe, it, expect } from 'vitest';
import {
  johnsonCurrentNoise, johnsonVoltageNoise, shotCurrentNoise, crossoverVoltage, crossoverCurrent,
  totalCurrentNoise, simulateTrace, AMPLIFIERS, ampById, stdev,
} from '../src/physics/noise.js';
import { E_CHARGE, K_B } from '../src/physics/constants.js';
import { alphaPositive, positiveEfficiency, negativeEfficiency } from '../src/physics/saha.js';
import { makeSector, symmetricDistance, massDispersion, imageDistance, sectorForDispersion, traceRay } from '../src/physics/sector.js';
import { simulateRun, rayleighInstantaneous } from '../src/physics/evaporation.js';
import { observedRate, deadTimeCorrect, pulseHeightDistribution, DALY_DEFAULTS, SEM_DEFAULTS } from '../src/physics/detectors.js';
import { LaplaceGrid } from '../src/physics/laplace.js';
import { SourceLens, defaultTune } from '../src/physics/sourceLens.js';
import { RNG } from '../src/physics/rng.js';

const rel = (a, b) => Math.abs(a / b - 1);

describe('Johnson–Nyquist & shot noise', () => {
  it('10¹¹ Ω, 300 K, 1 s ≈ 2.88e-16 A', () => {
    expect(johnsonCurrentNoise(1e11, 300, 1)).toBeCloseTo(2.878e-16, 18);
    expect(rel(johnsonVoltageNoise(1e11, 300, 1), 2.878e-5)).toBeLessThan(1e-3);
  });
  it('current noise scales as 1/√R and 1/√t, voltage noise as √R', () => {
    expect(rel(johnsonCurrentNoise(1e11, 300, 1) / johnsonCurrentNoise(1e13, 300, 1), 10)).toBeLessThan(1e-12);
    expect(rel(johnsonCurrentNoise(1e11, 300, 1) / johnsonCurrentNoise(1e11, 300, 100), 10)).toBeLessThan(1e-12);
    expect(rel(johnsonVoltageNoise(1e13, 300, 1) / johnsonVoltageNoise(1e11, 300, 1), 10)).toBeLessThan(1e-12);
  });
  it('Johnson = shot at V* = 2kT/e ≈ 51.7 mV, independent of R', () => {
    expect(crossoverVoltage(300)).toBeCloseTo(0.0517, 4);
    for (const R of [1e10, 1e11, 1e12, 1e13]) {
      const I = crossoverCurrent(R, 300);
      expect(rel(I * R, crossoverVoltage(300))).toBeLessThan(1e-12);
      expect(rel(johnsonCurrentNoise(R, 300, 2), shotCurrentNoise(I, 2))).toBeLessThan(1e-12);
    }
  });
  it('shot noise equals e·√N / t', () => {
    const I = 1e-12, t = 4;
    const N = (I * t) / E_CHARGE;
    expect(rel(shotCurrentNoise(I, t), (E_CHARGE * Math.sqrt(N)) / t)).toBeLessThan(1e-12);
    expect(totalCurrentNoise(1e11, 300, t, I)).toBeGreaterThan(shotCurrentNoise(I, t));
  });
  it('simulated trace has the predicted white-noise σ at zero beam', () => {
    const amp = ampById('R11');
    const tr = simulateTrace({ amp, current: () => 0, T: 300, dt: 1, n: 4000, rng: new RNG(1) });
    expect(rel(stdev(tr.measI), johnsonCurrentNoise(1e11, 300, 1))).toBeLessThan(0.05);
    expect(AMPLIFIERS.length).toBeGreaterThanOrEqual(6);
    expect(K_B).toBe(1.380649e-23);
  });
});

describe('Saha–Langmuir surface ionization', () => {
  it('IE < W → efficiency > 0.5; IE > W → < 0.5', () => {
    expect(positiveEfficiency({ IE: 3.894, W: 4.96, T: 1200 })).toBeGreaterThan(0.5); // Cs on Re
    expect(positiveEfficiency({ IE: 7.4167, W: 4.96, T: 1500 })).toBeLessThan(0.5); // Pb on Re
  });
  it('for IE > W efficiency rises monotonically with T', () => {
    let prev = 0;
    for (let T = 1000; T <= 2600; T += 100) {
      const e = positiveEfficiency({ IE: 5.525, W: 4.96, T });
      expect(e).toBeGreaterThan(prev);
      prev = e;
    }
  });
  it('α scales with g-ratio; negative ions favour low W', () => {
    expect(alphaPositive({ IE: 6, W: 5, T: 2000, gRatio: 2 }) / alphaPositive({ IE: 6, W: 5, T: 2000 })).toBeCloseTo(2, 12);
    expect(negativeEfficiency({ EA: 4, W: 3, T: 1000 })).toBeGreaterThan(negativeEfficiency({ EA: 4, W: 5, T: 1000 }));
  });
});

describe('Magnetic sector optics', () => {
  it('symmetric 90° normal entry: L = R (Barber), D = R', () => {
    const s = makeSector({ R0: 0.27, phi: Math.PI / 2 });
    const L = symmetricDistance(s);
    expect(rel(L, 0.27)).toBeLessThan(1e-3);
    expect(rel(massDispersion(s, L), 0.27)).toBeLessThan(5e-3);
    expect(rel(imageDistance(s, 0.27), 0.27)).toBeLessThan(1e-3);
  });
  it('70° normal entry: L = R·cot 35°', () => {
    const s = makeSector({ R0: 0.3, phi: (70 * Math.PI) / 180 });
    expect(rel(symmetricDistance(s), 0.3 / Math.tan((35 * Math.PI) / 180))).toBeLessThan(1e-3);
  });
  it('Newton lens equation l1·l2 = R² for a 90° sector', () => {
    const s = makeSector({ R0: 0.3, phi: Math.PI / 2 });
    for (const l1 of [0.2, 0.5, 1]) expect(rel(imageDistance(s, l1) * l1, 0.09)).toBeLessThan(2e-3);
  });
  it('extended geometry: ε ≈ tan⁻¹(½) doubles dispersion', () => {
    const s = sectorForDispersion({ R0: 0.27, phi: Math.PI / 2, targetD: 0.54 });
    expect(s).not.toBeNull();
    expect(Math.abs((s.eps1 * 180) / Math.PI - (Math.atan(0.5) * 180) / Math.PI)).toBeLessThan(1);
    expect(rel(massDispersion(s), 0.54)).toBeLessThan(5e-3);
  });
  it('heavier ions bend on a larger radius (land on the outer side)', () => {
    const s = makeSector({ R0: 0.27, phi: Math.PI / 2 });
    s.L1 = 0.27;
    const a = traceRay(s, { pRatio: 1 }), b = traceRay(s, { pRatio: Math.sqrt(1.01) });
    expect(b.exitPoint[0]).toBeGreaterThan(a.exitPoint[0]);
  });
});

describe('Evaporation & total evaporation', () => {
  const iso = [{ name: '235U', m: 235.0439, N0: 0.0072e12 }, { name: '238U', m: 238.0508, N0: 0.9928e12 }];
  it('total evaporation recovers R0 within 0.05 ‰', () => {
    const r = simulateRun({ isotopes: iso, mode: 'total', eff: 0.01, targetIons: 6e7 });
    expect(Math.abs(r.biasPermil)).toBeLessThan(0.05);
  });
  it('conventional early window is biased light by > 1 ‰', () => {
    const r = simulateRun({ isotopes: iso, mode: 'conventional', eff: 0.01, targetIons: 6e7 });
    expect(r.biasPermil).toBeGreaterThan(1);
  });
  it('Rayleigh: instantaneous light/heavy ratio starts at R0·α and falls', () => {
    const R0 = iso[0].N0 / iso[1].N0;
    const a = Math.sqrt(238.0508 / 235.0439);
    expect(rayleighInstantaneous(R0, 235.0439, 238.0508, 1)).toBeCloseTo(R0 * a, 12);
    expect(rayleighInstantaneous(R0, 235.0439, 238.0508, 0.2)).toBeLessThan(rayleighInstantaneous(R0, 235.0439, 238.0508, 0.8));
    const sim = simulateRun({ isotopes: iso, mode: 'total', eff: 0.01, targetIons: 6e7 });
    const first = sim.instRatio.find((x) => isFinite(x));
    expect(rel(first, R0 * a)).toBeLessThan(2e-3);
    const valid = sim.instRatio.filter((x, i) => isFinite(x) && sim.beam[i] > 1e5);
    expect(valid[valid.length - 1]).toBeLessThan(first);
  });
});

describe('Detectors', () => {
  it('dead-time correction inverts the non-paralysable model', () => {
    for (const N of [1e3, 1e5, 2e6]) expect(rel(deadTimeCorrect(observedRate(N, 20e-9), 20e-9), N)).toBeLessThan(1e-12);
  });
  it('Daly efficiency exceeds SEM efficiency for heavy ions', () => {
    const d = pulseHeightDistribution('daly', 238, DALY_DEFAULTS, { n: 6000 }).efficiency;
    const s = pulseHeightDistribution('sem', 238, SEM_DEFAULTS, { n: 6000 }).efficiency;
    expect(d).toBeGreaterThan(s);
  });
});

describe('Electrostatics', () => {
  it('parallel plates give a linear potential (uniform field)', () => {
    const h = 0.25e-3;
    const g = new LaplaceGrid({ xMin: 0, xMax: 0.02, yMin: -0.05, yMax: 0.05, h });
    g.addRect(0.004, -0.05, 0.005, 0.05, 100);
    g.addRect(0.015, -0.05, 0.016, 0.05, 0);
    g.solve(3000, 1.9);
    // between the plates (5 mm → 15 mm) φ falls linearly from 100 V to 0 V
    expect(g.potential(0.010, 0)).toBeCloseTo(50, 0);
    expect(g.potential(0.0075, 0)).toBeCloseTo(75, 0);
    const [ex] = g.field(0.01, 0);
    expect(rel(ex, 100 / 0.010)).toBeLessThan(0.02);
  });
  it('source lens transmits a fraction in (0, 1]', () => {
    const L = new SourceLens({ iterations: 300 });
    L.apply(defaultTune());
    const r = L.trace({ n: 40 });
    expect(r.transmission).toBeGreaterThan(0);
    expect(r.transmission).toBeLessThanOrEqual(1);
  }, 30000);
});

import { analyseCycles, slitOverlap, lateral } from '../src/physics/multidynamic.js';
import { ISOTOPE_SETS } from '../src/physics/elements.js';
import { fieldFor } from '../src/instruments/build.js';

describe('Multi-dynamic peak coincidence & Zoom Optics', () => {
  const s = makeSector({ R0: 0.3, phi: (70 * Math.PI) / 180 });
  s.L1 = symmetricDistance(s);
  const set = ISOTOPE_SETS.SrMD;
  const ks = Array.from({ length: 12 }, (_, i) => i - 5);
  const design = set.isotopes.find((i) => i.name === set.axial).m;
  const res = analyseCycles({ sector: s, isotopes: set.isotopes, cycles: set.isotopes.map((i) => i.m), designAxial: design, ks });
  it('design cycle is perfectly aligned', () => {
    const c3 = res[2];
    for (const r of c3.rows) expect(Math.abs(r.delta)).toBeLessThan(1e-9);
    expect(c3.zoom).toBeCloseTo(1, 6);
  });
  it('outer cycles misalign by ~0.1–0.4 mm and zoom of a few % restores < 20 µm', () => {
    for (const c of [res[0], res[4]]) {
      const worst = Math.max(...c.rows.map((r) => Math.abs(r.delta)));
      const worstZ = Math.max(...c.rows.map((r) => Math.abs(r.deltaZoom)));
      expect(worst).toBeGreaterThan(1e-4);
      expect(worstZ).toBeLessThan(2e-5);
      expect(Math.abs(c.zoom - 1)).toBeGreaterThan(0.01);
      expect(Math.abs(c.zoom - 1)).toBeLessThan(0.04);
    }
  });
  it('lateral dispersion ≈ D·Δm/m for small Δm', () => {
    const D = massDispersion(s);
    expect(lateral(s, 88 * 1.001, 88) / 0.001).toBeCloseTo(D, 2);
  });
  it('slit overlap: flat top when beam narrower than slit', () => {
    expect(slitOverlap(0, 0.3e-3, 1e-3)).toBeGreaterThan(0.999);
    expect(slitOverlap(0.5e-3, 0.3e-3, 1e-3)).toBeCloseTo(0.5, 2);
  });
});

describe('Magnet field', () => {
  it('B = sqrt(2mV/q)/R: ⁸⁸Sr at 10 kV on R = 0.3 m ≈ 0.45 T', () => {
    expect(fieldFor(87.9056, 0.3, 10000)).toBeCloseTo(0.4503, 3);
  });
});
