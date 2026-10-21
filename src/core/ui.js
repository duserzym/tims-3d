// Minimal DOM helpers for scene control panels.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Collapsible card. Returns {el, body}. */
export function section(title, { open = true, icon = '' } = {}) {
  const body = h('div', { class: 'card-b' });
  const el = h('details', { class: 'card', open }, h('summary', {}, icon ? h('span', {}, icon) : null, title), body);
  return { el, body };
}

/**
 * Range slider. With `log: true` the slider moves in log10 space between min and max.
 */
export function slider({ label, min, max, step = 'any', value, unit = '', fmt = null, log = false, onInput }) {
  const out = h('output');
  const toSlider = (v) => (log ? Math.log10(v) : v);
  const fromSlider = (s) => (log ? Math.pow(10, s) : s);
  const input = h('input', {
    type: 'range',
    min: toSlider(min), max: toSlider(max),
    step: log ? 'any' : step,
    value: toSlider(value),
  });
  const show = (v) => { out.innerHTML = fmt ? fmt(v) : `${+v.toPrecision(4)} ${unit}`; };
  let cur = value;
  input.addEventListener('input', () => {
    cur = fromSlider(parseFloat(input.value));
    show(cur);
    onInput && onInput(cur);
  });
  show(value);
  const el = h('div', { class: 'ctl' }, h('label', {}, label), out, input);
  return {
    el, input,
    get: () => cur,
    set: (v, fire = false) => { cur = v; input.value = toSlider(v); show(v); if (fire && onInput) onInput(v); },
  };
}

export function select({ label, options, value, onChange }) {
  const sel = h('select', {}, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  sel.addEventListener('change', () => onChange && onChange(sel.value));
  const el = h('div', { class: 'ctl' }, h('label', {}, label), h('span'), sel);
  return { el, get: () => sel.value, set: (v) => { sel.value = v; } };
}

/** Segmented buttons. */
export function segmented({ options, value, onChange }) {
  let cur = value;
  const btns = options.map((o) => {
    const b = h('button', { class: o.value === value ? 'on' : '', title: o.title || '' }, o.label);
    b.addEventListener('click', () => { set(o.value); onChange && onChange(o.value); });
    return b;
  });
  const set = (v) => {
    cur = v;
    btns.forEach((b, i) => b.classList.toggle('on', options[i].value === v));
  };
  return { el: h('div', { class: 'seg' }, btns), get: () => cur, set };
}

export function toggle({ label, value = false, onChange }) {
  const input = h('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange && onChange(input.checked));
  return { el: h('label', { class: 'toggle' }, input, label), get: () => input.checked, set: (v) => { input.checked = v; } };
}

export function buttons(list) {
  const els = list.map((b) => {
    const e = h('button', { class: 'btn' + (b.primary ? ' primary' : ''), title: b.title || '' }, b.label);
    e.addEventListener('click', () => b.onClick(e));
    return e;
  });
  return { el: h('div', { class: 'btn-row' }, els), els };
}

/** Grid of read-outs: keys -> {set(html, state)} */
export function readouts(keys) {
  const map = {};
  const el = h('div', { class: 'readouts' });
  for (const k of keys) {
    const key = typeof k === 'string' ? { id: k, label: k } : k;
    const v = h('div', { class: 'v' }, '—');
    const box = h('div', { class: 'ro' + (key.wide ? ' wide' : '') }, h('div', { class: 'k' }, key.label), v);
    el.append(box);
    map[key.id] = {
      set(html, state = '') {
        v.innerHTML = html;
        box.className = 'ro' + (key.wide ? ' wide' : '') + (state ? ' ' + state : '');
      },
    };
  }
  return { el, ...map, map };
}

export function note(html, kind = '') {
  return h('div', { class: 'note' + (kind ? ' ' + kind : ''), html });
}

export function para(html) {
  return h('p', { html });
}

export function table(headers, rows, { numCols = [] } = {}) {
  return h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { html: x })))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: numCols.includes(i) ? 'num' : '', html: String(c) }))))));
}

export function sources(list) {
  return h('div', { class: 'src' }, h('b', {}, 'Sources: '),
    ...list.flatMap((s, i) => [i ? ' · ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label)]));
}

export function legendInline(items) {
  return h('div', { class: 'legend-inline' }, items.map((it) => h('span', { style: `--c:${it.color}` }, it.label)));
}

/** Debounce helper for heavy recomputation on slider input. */
export function debounce(fn, ms = 60) {
  let id = 0;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

/** rAF throttle. */
export function rafThrottle(fn) {
  let pending = false, args;
  return (...a) => {
    args = a;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(...args); });
  };
}

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
