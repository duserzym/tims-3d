// Filament configurations (single / double / triple / N-TIMS) and the element "usage
// system": which configuration is used for which element, with a live Saha–Langmuir
// surface-ionization calculator.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { M, ghostOf } from '../core/materials.js';
import { mesh } from '../core/geom.js';
import { section, slider, segmented, readouts, note, para, sources, legendInline, table, h, buttons } from '../core/ui.js';
import { Chart } from '../core/chart.js';
import { Sparks } from '../core/beam.js';
import { buildFilamentAssembly } from '../components/filament.js';
import { registerParts } from '../components/parts.js';
import { ELEMENTS, CONFIGS, elementBySym } from '../physics/elements.js';
import { alphaPositive, alphaNegative, efficiencyFromAlpha, FILAMENT_METALS } from '../physics/saha.js';
import { K_B_EV } from '../physics/constants.js';

const mm = 1e-3;
const ORDER = ['single', 'double', 'triple', 'ntims'];
const XPOS = { single: -39 * mm, double: -13 * mm, triple: 13 * mm, ntims: 39 * mm };
const C2K = (c) => c + 273.15;

const CONFIG_TEXT = {
  single: '<b>Single filament.</b> One ribbon carries the sample and is heated until the sample both evaporates and ionizes. Simple and efficient for low-IE elements and when an activator controls emission (TaCl₅/TaF₅ for Sr; silica gel + H₃PO₄ for Pb and UO₂⁺). Evaporation and ionization temperature cannot be set independently.',
  double: '<b>Double filament.</b> The sample sits on an evaporation filament facing a blank ionization filament. The ionization ribbon runs very hot (high Saha–Langmuir efficiency for refractory, high-IE elements such as Nd, Sm, U, Pu) while the sample ribbon runs cooler to control evaporation — decoupling the two.',
  triple: '<b>Triple filament.</b> Two side (evaporation) filaments flank a central ionization filament: more sample capacity, symmetric emission and very stable beams; standard for Th, U, Pu, Nd and Li⁺ work.',
  ntims: '<b>N-TIMS.</b> Negative thermal ionization on a single Pt or Ni ribbon coated with a Ba salt (Ba(OH)₂/Ba(NO₃)₂). The activator lowers the effective work function so molecular anions (OsO₃⁻, ReO₄⁻, BO₂⁻) form efficiently: α⁻ ∝ exp[(EA − W)/kT]. All potentials are reversed.',
};

export default {
  id: 'filaments',
  title: 'Filaments: 1, 2, 3 & element usage',
  group: 'Ion source',
  icon: '♨',
  blurb: 'Single/double/triple/N-TIMS, Saha–Langmuir, element map',

  async create(ctx) {
    const { app } = ctx;
    const root = new THREE.Group();
    const exploder = new Exploder();
    const charts = [];

    // ---------------- state ----------------
    const st = {
      el: elementBySym('Nd'),
      active: 'double',
      metal: 'Re',
      W: FILAMENT_METALS.Re.W,
      EA: 4.0, Wneg: 3.0,
      temps: { single: [C2K(1450)], double: [C2K(1800), C2K(1250)], triple: [C2K(1900), C2K(1300), C2K(1300)], ntims: [C2K(800)] },
      metals: { single: { ion: 'Re', evap: 'Re' }, double: { ion: 'Re', evap: 'Re' }, triple: { ion: 'Re', evap: 'Re' }, ntims: { ion: 'Pt', evap: 'Pt' } },
    };

    // ---------------- 3-D ----------------
    // stage plate
    const stage = mesh(new THREE.BoxGeometry(104 * mm, 3 * mm, 30 * mm), M.black(), { name: 'stage' });
    stage.position.set(0, -8.5 * mm, -2 * mm);
    root.add(stage);

    const slots = {};
    const ghostMats = new Map();
    function build(cfg) {
      const old = slots[cfg];
      if (old) {
        root.remove(old.wrap);
        old.wrap.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); o.geometry?.dispose(); });
        const objs = new Set(old.asm.parts.map((p) => p.obj));
        exploder.parts = exploder.parts.filter((p) => !objs.has(p.obj));
      }
      const asm = buildFilamentAssembly({ config: cfg, metals: st.metals[cfg], sample: true });
      const wrap = new THREE.Group();
      wrap.position.set(XPOS[cfg], -7 * mm, 0);
      wrap.add(asm.group);
      root.add(wrap);
      // keep the front shield translucent so the ribbons stay visible
      asm.group.traverse((o) => {
        if (!o.isMesh) return;
        let shell = false;
        for (let p = o; p && p !== asm.group; p = p.parent) if (p.userData.shell || /shield/.test(p.name)) shell = true;
        if (o.name === 'filament shield' || shell) {
          if (!ghostMats.has(o.material)) { const g = ghostOf(o.material); g.opacity = 0.22; ghostMats.set(o.material, g); }
          o.material = ghostMats.get(o.material);
          o.castShadow = false;
        }
      });
      registerParts(exploder, asm.parts, { scale: 1.2 });
      const lbl = app.label(wrap, CONFIGS[cfg].label, { offset: [0, 21 * mm, 0], sub: '', onClick: () => activate(cfg, true) });
      slots[cfg] = { asm, wrap, lbl };
      st.temps[cfg].forEach((T, i) => asm.setTemperature(i, T));
      return slots[cfg];
    }
    ORDER.forEach(build);

    const neutrals = new Sparks({ color: 0xd8dde6, max: 500, size: 0.0016 });
    const ions = new Sparks({ color: 0x5ab0ff, max: 500, size: 0.0024 });
    const anions = new Sparks({ color: 0xd07bff, max: 300, size: 0.0024 });
    for (const s of [neutrals, ions, anions]) { s.userData.beam = true; root.add(s); }

    // ---------------- physics helpers ----------------
    const ionT = (cfg = st.active) => st.temps[cfg][0];
    const evapT = (cfg = st.active) => st.temps[cfg][cfg === 'single' || cfg === 'ntims' ? 0 : 1];
    function beta(cfg = st.active) {
      const T = ionT(cfg);
      if (cfg === 'ntims') return efficiencyFromAlpha(alphaNegative({ EA: st.EA, W: st.Wneg, T }));
      return efficiencyFromAlpha(alphaPositive({ IE: st.el.IE, W: st.W, T, gRatio: st.el.gRatio }));
    }

    // ---------------- panel ----------------
    const cards = [];
    const cfgCard = section('Filament configuration', { icon: '♨' });
    const cfgText = para('');
    const seg = segmented({
      options: ORDER.map((c) => ({ value: c, label: CONFIGS[c].label.replace(' filament', '').replace(' (negative ions)', '') })),
      value: st.active,
      onChange: (v) => activate(v, true),
    });
    const tempBox = h('div');
    const ro = readouts([
      { id: 'beta', label: 'Ionization efficiency β' },
      { id: 'alpha', label: 'α = n±/n⁰' },
      { id: 'dw', label: 'W − IE (or EA − W)' },
      { id: 'kT', label: 'kT at ionization ribbon' },
    ]);
    const seeP = para('');
    seeP.style.fontSize = '12px';
    cfgCard.body.append(seg.el, cfgText, tempBox, ro.el, seeP);
    cards.push(cfgCard.el);

    // element usage system
    const elCard = section('Element usage system', { icon: '⚛' });
    const ptab = h('div', { class: 'ptable' });
    const elBtns = {};
    for (const e of ELEMENTS) {
      const c = CONFIGS[e.config];
      const b = h('button', { title: `${e.name}: ${c.label}` },
        h('span', { class: 'z' }, String(e.Z)), h('div', { class: 's' }, e.sym),
        h('span', { class: 'c', style: `color:${c.color};font-weight:700` }, c.short + (e.alt.length ? ' · ' + e.alt.map((a) => CONFIGS[a].short).join(' ') : '')));
      b.style.borderBottom = `3px solid ${c.color}`;
      b.addEventListener('click', () => selectElement(e.sym, true));
      elBtns[e.sym] = b;
      ptab.append(b);
    }
    const elInfo = h('div');
    elCard.body.append(
      para('Click an element to load its most common filament setup. Bottom bar = primary configuration; small digits = primary · alternatives (1 single, 2 double, 3 triple, − N-TIMS).'),
      legendInline(Object.values(CONFIGS).map((c) => ({ label: c.label, color: c.color }))),
      ptab, elInfo,
    );
    cards.push(elCard.el);

    // Saha–Langmuir
    const sahaCard = section('Saha–Langmuir calculator', { icon: '∿' });
    const metalSeg = segmented({
      options: Object.keys(FILAMENT_METALS).map((k) => ({ value: k, label: k, title: FILAMENT_METALS[k].name })),
      value: st.metal,
      onChange: (k) => { st.metal = k; st.W = FILAMENT_METALS[k].W; sW.set(st.W); refresh(); },
    });
    const sW = slider({ label: 'Effective work function W', min: 3.8, max: 6.0, step: 0.01, value: st.W, fmt: (v) => `${v.toFixed(2)} eV`, onInput: (v) => { st.W = v; refresh(); } });
    const negBox = h('div');
    const sEA = slider({ label: 'Anion electron affinity EA (illustrative)', min: 2.0, max: 6.0, step: 0.05, value: st.EA, fmt: (v) => `${v.toFixed(2)} eV`, onInput: (v) => { st.EA = v; refresh(); } });
    const sWn = slider({ label: 'Effective W of Ba-coated Pt (illustrative)', min: 2.0, max: 5.7, step: 0.05, value: st.Wneg, fmt: (v) => `${v.toFixed(2)} eV`, onInput: (v) => { st.Wneg = v; refresh(); } });
    negBox.append(sEA.el, sWn.el);
    sahaCard.body.append(
      para('α⁺ = (g⁺/g⁰)·exp[(W − IE)/kT], β = α/(1+α). Curves: the selected element on clean metals (thin) and on your chosen effective W (bold); the marker is the current ionization-ribbon temperature.'),
      metalSeg.el, sW.el, negBox,
    );
    const sahaChart = new Chart(sahaCard.body, { height: 200, xLabel: 'Ionization filament temperature (°C)', yLabel: 'efficiency β', yLog: true, yMin: 1e-8, yMax: 1.2, legendPos: 'br' });
    charts.push(sahaChart);
    cards.push(sahaCard.el);

    // table
    const tabCard = section('All elements', { icon: '☰', open: false });
    tabCard.body.append(table(['El', 'IE (eV)', 'Primary', 'Ion species', 'Filament'],
      ELEMENTS.map((e) => [`<b>${e.sym}</b>`, e.IE.toFixed(3), `<span style="color:${CONFIGS[e.config].color};font-weight:600">${CONFIGS[e.config].label.replace(' filament', '').replace(' (negative ions)', '')}</span>${e.alt.length ? ' <span class="src">(' + e.alt.map((a) => CONFIGS[a].short).join(', ') + ')</span>' : ''}`, e.ion, e.filament]), { numCols: [1] }));
    cards.push(tabCard.el);

    const phys = section('Physics, caveats & sources', { icon: '📘', open: false });
    phys.body.append(
      para('<b>Why more filaments?</b> In a single filament the temperature that evaporates the sample also sets the ionization efficiency — refractory, high-IE elements (REE, actinides) would evaporate long before the ribbon is hot enough to ionize them efficiently. Double/triple assemblies let the ionization ribbon run at ≈1800–2100 °C while the sample ribbon is kept just warm enough to sustain a stable beam.'),
      para('<b>Activators & molecular ions.</b> Silica gel/H₃PO₄ (Pb, U as UO₂⁺), TaCl₅/TaF₅ (Sr), graphite (Cs₂BO₂⁺, Th) and Ba salts (N-TIMS) change the effective surface work function and/or the evaporating species; real efficiencies for Pb and Sr therefore greatly exceed the clean-metal prediction plotted here.'),
      note('g⁺/g⁰ uses ground-state J only (partition functions ignored); W is an effective, surface-condition-dependent value; typical temperatures are approximate pyrometer readings. EA/W values for N-TIMS are illustrative sliders, not measured constants.', 'warn'),
      sources([
        { label: 'NIST ASD ionization energies', url: 'https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html' },
        { label: 'Nu: Introduction to TIMS', url: 'https://www.nu-ins.com/Products/TIMS/Introduction-to-TIMS' },
        { label: 'ASTM C1672 (total evaporation)', url: 'https://www.astm.org/c1672-17.html' },
        { label: 'Creaser et al. 1991, GCA 55:397 (N-TIMS Os)', url: 'https://doi.org/10.1016/0016-7037(91)90427-7' },
      ]),
    );
    cards.push(phys.el);

    // ---------------- logic ----------------
    const tempSliders = [];
    function buildTempSliders() {
      tempBox.replaceChildren();
      tempSliders.length = 0;
      const cfg = st.active;
      const t = st.temps[cfg];
      const fmt = (v) => `${(v - 273.15).toFixed(0)} °C · ${v.toFixed(0)} K`;
      const mk = (label, idxs, min, max) => {
        const s = slider({ label, min, max, step: 5, value: t[idxs[0]], fmt, onInput: (v) => { idxs.forEach((i) => { t[i] = v; slots[cfg].asm.setTemperature(i, v); }); refresh(); } });
        tempSliders.push(s);
        tempBox.append(s.el);
      };
      if (cfg === 'single') mk('Filament temperature', [0], C2K(600), C2K(2300));
      else if (cfg === 'ntims') mk('Filament temperature (N-TIMS)', [0], C2K(500), C2K(1300));
      else {
        mk('Ionization filament (centre)', [0], C2K(1000), C2K(2400));
        mk(cfg === 'triple' ? 'Evaporation filaments (both sides)' : 'Evaporation (sample) filament', cfg === 'triple' ? [1, 2] : [1], C2K(600), C2K(2000));
      }
    }

    function activate(cfg, fly = false) {
      st.active = cfg;
      seg.set(cfg);
      cfgText.innerHTML = CONFIG_TEXT[cfg];
      buildTempSliders();
      negBox.style.display = cfg === 'ntims' ? '' : 'none';
      for (const c of ORDER) slots[c].lbl.element.classList.toggle('callout', c === cfg);
      neutrals.clear(); ions.clear(); anions.clear();
      if (fly) {
        const x = XPOS[cfg];
        app.flyTo([x + 0.012, 0.038, 0.06], [x, 0.0035, 0]);
      }
      refresh();
    }

    function selectElement(sym, apply = false) {
      const e = elementBySym(sym);
      st.el = e;
      for (const [k, b] of Object.entries(elBtns)) b.classList.toggle('on', k === sym);
      const alt = e.alt.map((a) => CONFIGS[a].label).join(', ') || '—';
      elInfo.replaceChildren(
        h('h4', {}, `${e.name} (${e.sym}, Z = ${e.Z}) · IE ${e.IE.toFixed(3)} eV`),
        table(['', ''], [
          ['Primary', `<b style="color:${CONFIGS[e.config].color}">${CONFIGS[e.config].label}</b>`],
          ['Alternatives', alt],
          ['Ion species', e.ion],
          ['Filament', `${FILAMENT_METALS[e.filament]?.name ?? e.filament}`],
          ['Loading / activator', e.loading],
          ['Why', e.why],
          ['Typical run T', `≈${e.Trun} °C (approximate)`],
        ]),
      );
      if (apply) {
        const cfg = e.config;
        st.metals[cfg] = cfg === 'ntims' ? { ion: e.filament, evap: e.filament } : { ion: e.filament, evap: cfg === 'single' ? e.filament : 'Re' };
        st.metal = cfg === 'ntims' ? (e.filament === 'Ni' ? 'Ni' : 'Pt') : e.filament;
        st.W = FILAMENT_METALS[st.metal].W;
        metalSeg.set(st.metal); sW.set(st.W);
        const T = C2K(e.Trun);
        if (cfg === 'single' || cfg === 'ntims') st.temps[cfg] = [T];
        else if (cfg === 'double') st.temps[cfg] = [T, Math.max(C2K(700), T - 550)];
        else st.temps[cfg] = [T, Math.max(C2K(700), T - 600), Math.max(C2K(700), T - 600)];
        build(cfg);
        app.setExplode(app.state.explode);
        activate(cfg, true);
      } else refresh();
    }

    function refresh() {
      const cfg = st.active;
      const T = ionT(cfg);
      const b = beta(cfg);
      const a = b / (1 - b + 1e-300);
      const kT = K_B_EV * T;
      const fmtE = (x) => (x >= 0.01 ? `${(x * 100).toFixed(x > 0.1 ? 1 : 2)} %` : x.toExponential(2));
      ro.beta.set(fmtE(b), b > 0.01 ? 'good' : b > 1e-4 ? 'warn' : 'bad');
      ro.alpha.set(a > 1e4 ? a.toExponential(2) : a < 1e-3 ? a.toExponential(2) : a.toPrecision(3));
      ro.dw.set(cfg === 'ntims' ? `${(st.EA - st.Wneg).toFixed(2)} eV` : `${(st.W - st.el.IE).toFixed(2)} eV`);
      ro.kT.set(`${kT.toFixed(3)} eV`);
      seeP.innerHTML = '<b>What you see:</b> ' + (cfg === 'ntims'
        ? 'Purple = negative ions; grey = neutrals (ion fraction drawn ∝ β^0.35).'
        : `<span style="color:#5ab0ff">●</span> ${st.el.sym}⁺ ions accelerated toward the lens (+Z), <span style="color:#aab">●</span> neutrals. ${cfg === 'single' ? 'Atoms leave the sample spot directly.' : 'Neutrals fly from the sample ribbon to the hot centre ribbon.'} Ion fraction drawn ∝ β^0.35 (log-compressed).`);
      for (const c of ORDER) {
        const t = st.temps[c];
        slots[c].lbl.element.innerHTML = `${CONFIGS[c].label}<small>${c === st.active ? st.el.sym + ' · ' : ''}${t.map((x, i) => (t.length > 1 ? (i ? 'evap ' : 'ion ') : '') + Math.round(x - 273.15) + ' °C').filter((_, i) => i < 2).join(' · ')}</small>`;
      }
      drawSaha();
    }

    function drawSaha() {
      const xs = [];
      for (let c = 600; c <= 2500; c += 20) xs.push(c);
      const series = [];
      const cols = { Re: '#3b82f6', Ta: '#10b981', W: '#f59e0b', Pt: '#8b5cf6', Ni: '#ec4899' };
      if (st.active === 'ntims') {
        series.push({ name: `anion, EA ${st.EA.toFixed(2)} / W ${st.Wneg.toFixed(2)} eV`, color: '#c260d6', width: 2.4, x: xs, y: xs.map((c) => efficiencyFromAlpha(alphaNegative({ EA: st.EA, W: st.Wneg, T: C2K(c) }))) });
      } else {
        for (const [k, m] of Object.entries(FILAMENT_METALS)) {
          series.push({ name: `${st.el.sym} on ${k} (${m.W} eV)`, color: cols[k], width: 1, dash: [4, 3], alpha: 0.85, x: xs, y: xs.map((c) => efficiencyFromAlpha(alphaPositive({ IE: st.el.IE, W: m.W, T: C2K(c), gRatio: st.el.gRatio }))) });
        }
        series.push({ name: `${st.el.sym}, W = ${st.W.toFixed(2)} eV`, color: '#ef4444', width: 2.6, x: xs, y: xs.map((c) => efficiencyFromAlpha(alphaPositive({ IE: st.el.IE, W: st.W, T: C2K(c), gRatio: st.el.gRatio }))) });
      }
      sahaChart.setMarks([{ x: ionT() - 273.15, color: '#ef4444', label: 'now' }]);
      sahaChart.setSeries(series);
    }

    // ---------------- particles ----------------
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), q = new THREE.Quaternion();
    let acc = 0;
    function ribbonFrame(r) {
      r.top.getWorldPosition(tmpA);
      r.obj.getWorldQuaternion(q);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      return { p: tmpA.clone(), n };
    }
    const ionAccel = (p, v, age, dt) => { v.z += 0.09 * dt; };
    function spawnIon(p, neg) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.002, 0.006);
      (neg ? anions : ions).spawn(p.clone().add(new THREE.Vector3(0, 0, 0.1 * mm)), v, 1.3, ionAccel);
    }
    function emit() {
      const cfg = st.active;
      const slot = slots[cfg];
      root.updateMatrixWorld();
      // visual ion fraction is log-compressed (β^0.35) so rare ions remain visible; read-outs give the true β
      const b = Math.pow(beta(cfg), 0.35);
      if (cfg === 'single' || cfg === 'ntims') {
        const { p, n } = ribbonFrame(slot.asm.ribbons[0]);
        p.addScaledVector(n, 0.15 * mm);
        p.x += (Math.random() - 0.5) * 0.9 * mm;
        if (Math.random() < b) spawnIon(p, cfg === 'ntims');
        else {
          const d = new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0).add(n).normalize().multiplyScalar(0.012);
          neutrals.spawn(p, d, 0.45);
        }
        return;
      }
      const ribs = slot.asm.ribbons;
      const evapIdx = cfg === 'triple' ? (Math.random() < 0.5 ? 1 : 2) : 1;
      const src = ribbonFrame(ribs[evapIdx]);
      const dst = ribbonFrame(ribs[0]);
      const start = src.p.clone().addScaledVector(src.n, 0.15 * mm);
      start.y += (Math.random() - 0.5) * 0.5 * mm;
      const target = dst.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4 * mm, (Math.random() - 0.5) * 0.6 * mm, 0.05 * mm));
      const dist = target.distanceTo(start);
      const life = 0.35;
      const v = target.clone().sub(start).multiplyScalar(1 / life);
      neutrals.spawn(start, v, life, null, (it) => {
        if (Math.random() < b) spawnIon(it.p, false);
        else neutrals.spawn(it.p, new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.3) * 0.01, 0.006), 0.4);
      });
      void dist;
    }

    // initial selections
    selectElement('Nd', false);
    activate('double', false);

    return {
      root,
      exploder,
      scale: 0.12,
      camera: { position: [0.01, 0.075, 0.15], target: [0, 0.001, 0] },
      panel: cards,
      onExplode(t) { stage.visible = t < 0.05; },
      update(dt) {
        // evaporation rate rises steeply with sample-filament temperature (visual Arrhenius)
        const Te = evapT();
        const rate = Math.min(260, 70 * Math.exp((Te - C2K(st.active === 'ntims' ? 800 : 1250)) / 140));
        acc += rate * dt;
        while (acc > 1) { emit(); acc -= 1; }
        // Sparks are flagged userData.beam, so the app advances them each frame.
      },
      dispose() {
        charts.forEach((c) => c.dispose());
        ghostMats.forEach((m) => m.dispose());
      },
    };
  },
};
