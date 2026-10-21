// Lightweight canvas chart (line / step / scatter / bar), linear or log axes, theme-aware.

const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');

function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const t = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) t.push(+v.toPrecision(12));
  return t;
}
function fmtTick(v) {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) { const e = Math.floor(Math.log10(a)); const m = v / 10 ** e; return (Math.abs(m - 1) < 1e-9 ? '' : +m.toFixed(1) + '×') + '10' + sup(e); }
  return String(+v.toPrecision(4));
}

export class Chart {
  /**
   * @param {HTMLElement} container
   * @param {object} o {height, xLabel, yLabel, xLog, yLog, xMin, xMax, yMin, yMax, legend, title}
   */
  constructor(container, o = {}) {
    this.o = { height: 180, legend: true, ...o };
    this.canvas = document.createElement('canvas');
    this.canvas.style.height = this.o.height + 'px';
    this.wrap = document.createElement('div');
    this.wrap.className = 'chart-box';
    this.wrap.append(this.canvas);
    container.append(this.wrap);
    this.series = [];
    this.marks = [];
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.wrap);
    this.mq = window.matchMedia('(prefers-color-scheme: dark)');
    this._onTheme = () => this.draw();
    this.mq.addEventListener?.('change', this._onTheme);
  }
  get el() { return this.wrap; }
  setOptions(o) { Object.assign(this.o, o); this.draw(); }
  /** series: [{name,color,x,y,type:'line'|'step'|'scatter'|'bar',width,dash,fill,alpha}] */
  setSeries(series) { this.series = series; this.draw(); }
  /** marks: [{x?|y?, color, label, dash}] vertical/horizontal reference lines; {x0,x1,color} bands */
  setMarks(marks) { this.marks = marks; this.draw(); }
  dispose() { this.ro.disconnect(); this.mq.removeEventListener?.('change', this._onTheme); this.wrap.remove(); }

  _range(key, log) {
    let lo = Infinity, hi = -Infinity;
    for (const s of this.series) for (const v of s[key]) {
      if (!isFinite(v) || (log && v <= 0)) continue;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (!isFinite(lo)) { lo = log ? 1 : 0; hi = log ? 10 : 1; }
    if (lo === hi) { if (log) { lo /= 2; hi *= 2; } else { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; } }
    return [lo, hi];
  }

  draw() {
    const { canvas, o } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = this.wrap.clientWidth || 300, H = o.height;
    if (!W) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const grid = css('--chart-grid', '#e6e9ee'), axis = css('--chart-axis', '#8a94a3'), fg = css('--fg-muted', '#5b6676');
    const font = '11px ' + css('--font', 'sans-serif');
    ctx.font = font;

    let [x0, x1] = this._range('x', o.xLog);
    let [y0, y1] = this._range('y', o.yLog);
    if (o.xMin != null) x0 = o.xMin; if (o.xMax != null) x1 = o.xMax;
    if (o.yMin != null) y0 = o.yMin; if (o.yMax != null) y1 = o.yMax;
    if (!o.yLog && o.yMin == null && o.yMax == null) { const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad; }
    const L = 54, R = 10, T = o.title ? 20 : 8, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const tx = o.xLog ? (v) => L + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * pw : (v) => L + ((v - x0) / (x1 - x0)) * pw;
    const ty = o.yLog ? (v) => T + ph - ((Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * ph : (v) => T + ph - ((v - y0) / (y1 - y0)) * ph;
    this.tx = tx; this.ty = ty;

    if (o.title) { ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.fillText(o.title, L, 13); }
    // grid + ticks
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = axis;
    const xt = o.xLog ? decadeTicks(x0, x1) : niceTicks(x0, x1, Math.max(3, Math.floor(pw / 70)));
    const yt = o.yLog ? decadeTicks(y0, y1) : niceTicks(y0, y1, Math.max(3, Math.floor(ph / 32)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xt) { const X = tx(v); if (X < L - 1 || X > L + pw + 1) continue; ctx.beginPath(); ctx.moveTo(X + 0.5, T); ctx.lineTo(X + 0.5, T + ph); ctx.stroke(); ctx.fillText((o.xFmt || fmtTick)(v), X, T + ph + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) { const Y = ty(v); if (Y < T - 1 || Y > T + ph + 1) continue; ctx.beginPath(); ctx.moveTo(L, Y + 0.5); ctx.lineTo(L + pw, Y + 0.5); ctx.stroke(); ctx.fillText((o.yFmt || fmtTick)(v), L - 6, Y); }
    ctx.strokeStyle = axis; ctx.beginPath(); ctx.moveTo(L + 0.5, T); ctx.lineTo(L + 0.5, T + ph + 0.5); ctx.lineTo(L + pw, T + ph + 0.5); ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (o.xLabel) ctx.fillText(o.xLabel, L + pw / 2, H - 2);
    if (o.yLabel) { ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(o.yLabel, 0, 0); ctx.restore(); }

    ctx.save();
    ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    // bands & marks
    for (const m of this.marks) {
      ctx.strokeStyle = m.color || axis; ctx.fillStyle = m.color || axis; ctx.setLineDash(m.dash || [4, 4]); ctx.lineWidth = 1;
      if (m.x0 != null) { ctx.globalAlpha = m.alpha ?? 0.12; ctx.fillRect(tx(m.x0), T, tx(m.x1) - tx(m.x0), ph); ctx.globalAlpha = 1; continue; }
      ctx.beginPath();
      if (m.x != null) { const X = tx(m.x); ctx.moveTo(X, T); ctx.lineTo(X, T + ph); }
      if (m.y != null) { const Y = ty(m.y); ctx.moveTo(L, Y); ctx.lineTo(L + pw, Y); }
      ctx.stroke(); ctx.setLineDash([]);
      if (m.label) { ctx.font = font; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; const X = m.x != null ? tx(m.x) + 4 : L + 4; const Y = m.y != null ? ty(m.y) + 2 : T + 2; ctx.fillText(m.label, X, Y); }
    }
    // series
    for (const s of this.series) {
      const col = s.color || '#2f6fe4';
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s.width ?? 1.6; ctx.setLineDash(s.dash || []);
      ctx.globalAlpha = s.alpha ?? 1;
      const n = Math.min(s.x.length, s.y.length);
      if (s.type === 'bar') {
        const bw = s.barWidth ? Math.abs(tx(s.x[0] + s.barWidth) - tx(s.x[0])) : pw / n;
        for (let i = 0; i < n; i++) {
          if (!isFinite(s.y[i])) continue;
          const X = tx(s.x[i]); const Y = ty(Math.max(s.y[i], o.yLog ? y0 : -Infinity));
          const base = o.yLog ? T + ph : ty(Math.max(y0, 0));
          ctx.fillRect(X, Math.min(Y, base), Math.max(1, bw - 1), Math.abs(base - Y));
        }
      } else if (s.type === 'scatter') {
        const r = s.r ?? 2;
        for (let i = 0; i < n; i++) { if (!isFinite(s.y[i]) || (o.yLog && s.y[i] <= 0)) continue; ctx.beginPath(); ctx.arc(tx(s.x[i]), ty(s.y[i]), r, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.beginPath();
        let pen = false, prevY = null;
        for (let i = 0; i < n; i++) {
          const v = s.y[i];
          if (!isFinite(v) || (o.yLog && v <= 0) || (o.xLog && s.x[i] <= 0)) { pen = false; continue; }
          const X = tx(s.x[i]), Y = ty(v);
          if (!pen) { ctx.moveTo(X, Y); pen = true; }
          else if (s.type === 'step') { ctx.lineTo(X, prevY); ctx.lineTo(X, Y); }
          else ctx.lineTo(X, Y);
          prevY = Y;
        }
        ctx.stroke();
        if (s.fill) { ctx.lineTo(tx(s.x[n - 1]), T + ph); ctx.lineTo(tx(s.x[0]), T + ph); ctx.globalAlpha = 0.12; ctx.fill(); }
      }
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }
    ctx.restore();
    // legend
    if (o.legend) {
      const items = this.series.filter((s) => s.name);
      ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let X = L + 8, Y = T + 9;
      const lw = items.reduce((a, s) => Math.max(a, ctx.measureText(s.name).width), 0) + 22;
      if (items.length) {
        const pos = o.legendPos || 'tl';
        if (pos === 'tr') X = L + pw - lw - 4;
        if (pos === 'br' || pos === 'bl') Y = T + ph - items.length * 14 - 2;
        if (pos === 'br') X = L + pw - lw - 4;
        ctx.fillStyle = css('--bg-elev', '#fff'); ctx.globalAlpha = 0.82;
        ctx.fillRect(X - 4, Y - 8, lw + 4, items.length * 14 + 3);
        ctx.globalAlpha = 1;
      }
      for (const s of items) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.setLineDash(s.dash || []);
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + 14, Y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = fg; ctx.fillText(s.name, X + 18, Y);
        Y += 14;
      }
    }
  }
}

function decadeTicks(lo, hi) {
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  const step = Math.max(1, Math.ceil((b - a) / 7));
  const t = [];
  for (let e = a; e <= b; e += step) t.push(Math.pow(10, e));
  return t;
}

/** Shared chart colour palette (works on light and dark). */
export const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
