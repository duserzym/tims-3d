// Small, seedable random number generators so simulations are reproducible.

/** mulberry32 PRNG -> function returning uniform [0,1). */
export function mulberry32(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 12345) {
    this.u = mulberry32(seed);
    this._spare = null;
  }
  uniform(a = 0, b = 1) {
    return a + (b - a) * this.u();
  }
  /** Standard normal via Box–Muller (cached pair). */
  normal(mu = 0, sigma = 1) {
    if (this._spare !== null) {
      const s = this._spare;
      this._spare = null;
      return mu + sigma * s;
    }
    let u = 0, v = 0;
    while (u === 0) u = this.u();
    v = this.u();
    const r = Math.sqrt(-2 * Math.log(u));
    this._spare = r * Math.sin(2 * Math.PI * v);
    return mu + sigma * r * Math.cos(2 * Math.PI * v);
  }
  /** Poisson deviate. Knuth for small means, normal approximation (continuity-corrected) for large. */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= this.u(); } while (p > L);
      return k - 1;
    }
    return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
  }
  /** Exponential deviate with given mean. */
  exponential(mean = 1) {
    return -mean * Math.log(1 - this.u());
  }
  /** Gamma(shape k, scale θ) via Marsaglia–Tsang (k >= 1) with boost for k < 1. */
  gamma(k, theta = 1) {
    if (k < 1) {
      const g = this.gamma(k + 1, 1);
      return theta * g * Math.pow(this.u(), 1 / k);
    }
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = this.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = this.u();
      if (u < 1 - 0.0331 * x ** 4) return theta * d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return theta * d * v;
    }
  }
}
