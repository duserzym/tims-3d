import './style.css';
import { App } from './core/app.js';
import { SCENES } from './scenes/index.js';
import { h } from './core/ui.js';

const $ = (s) => document.querySelector(s);
const app = new App({
  viewport: $('#viewport'),
  panel: $('#panel'),
  onSceneTitle: (def) => {
    $('#sceneTitle').textContent = def.title;
    document.title = `${def.title} · TIMS 3D`;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.id === def.id));
  },
});
window.__tims = app; // handy for debugging & screenshot tooling

// navigation
const nav = $('#nav');
let lastGroup = null;
for (const s of SCENES) {
  if (s.group !== lastGroup) { nav.append(h('div', { class: 'nav-group' }, s.group)); lastGroup = s.group; }
  const b = h('button', { class: 'nav-item', 'data-id': s.id },
    h('span', { class: 'ico' }, s.icon || '•'),
    h('span', {}, h('div', { class: 't' }, s.title), h('div', { class: 'd' }, s.blurb || '')));
  b.addEventListener('click', () => { go(s.id); $('#app').classList.remove('nav-open'); });
  nav.append(b);
}
nav.append(h('div', { class: 'nav-legal' },
  h('div', { html: '<b>About &amp; legal</b>' }),
  h('div', { html: 'Independent educational models. Not affiliated with or endorsed by Isotopx, Nu Instruments (AMETEK) or Thermo Fisher Scientific; product names are trademarks of their owners and are used only to identify the instruments modelled. Geometry is schematic, not vendor drawings; assumed values are flagged in each scene.' }),
  h('div', { html: 'Code: <a href="https://opensource.org/license/mit" target="_blank" rel="noopener">MIT</a> · Built with three.js (MIT) — <a href="THIRD_PARTY_LICENSES.txt" target="_blank">third-party licenses</a>' })));
$('#navToggle').addEventListener('click', () => $('#app').classList.toggle('nav-open'));

function parseHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { scene: p.get('scene'), explode: p.has('explode') ? parseFloat(p.get('explode')) : null, vendor: p.get('vendor') };
}
function go(id, explode = 0) {
  const p = new URLSearchParams(location.hash.slice(1));
  p.set('scene', id);
  if (explode) p.set('explode', explode); else p.delete('explode');
  history.replaceState(null, '', '#' + p.toString());
  load();
}
async function load() {
  const { scene, explode } = parseHash();
  const def = SCENES.find((s) => s.id === scene) || SCENES[0];
  const e = explode ?? 0;
  await app.loadScene(def, { explode: e });
  explodeIn.value = e;
  explodeOut.textContent = Math.round(e * 100) + '%';
  window.__timsReady = def.id;
}
window.addEventListener('hashchange', () => load());

// toolbar
const explodeIn = $('#explode'), explodeOut = $('#explodeVal');
explodeIn.addEventListener('input', () => {
  app.state.animate = false; btn('#btnAnimate', false);
  app.setExplode(+explodeIn.value);
});
app.onExplodeChange = (t) => { explodeIn.value = t; explodeOut.textContent = Math.round(t * 100) + '%'; };
function btn(sel, on) { $(sel).classList.toggle('on', on); }
app.onStateSync = () => {
  btn('#btnLabels', app.state.labels); btn('#btnXray', app.state.xray);
  btn('#btnBeam', app.state.beams); btn('#btnBloom', app.state.bloom); btn('#btnAnimate', app.state.animate);
};
$('#btnAnimate').addEventListener('click', () => { app.state.animate = !app.state.animate; btn('#btnAnimate', app.state.animate); });
$('#btnLabels').addEventListener('click', () => { app.setLabels(!app.state.labels); btn('#btnLabels', app.state.labels); });
$('#btnXray').addEventListener('click', () => { app.setXray(!app.state.xray); btn('#btnXray', app.state.xray); });
$('#btnBeam').addEventListener('click', () => { app.setBeams(!app.state.beams); btn('#btnBeam', app.state.beams); });
$('#btnBloom').addEventListener('click', () => { app.setBloom(!app.state.bloom); btn('#btnBloom', app.state.bloom); });
$('#btnReset').addEventListener('click', () => app.resetView());
$('#btnShot').addEventListener('click', () => app.screenshot());

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'e') {
    const target = e.shiftKey ? 0 : app.state.explode < 0.5 ? 1 : 0;
    const from = app.state.explode, t0 = performance.now();
    const step = (now) => { const u = Math.min(1, (now - t0) / 900); app.setExplode(from + (target - from) * u * u * (3 - 2 * u)); if (u < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  } else if (k === 'l') $('#btnLabels').click();
  else if (k === 'x') $('#btnXray').click();
  else if (k === 'b') $('#btnBeam').click();
  else if (k === 'r') app.resetView();
});

load();
