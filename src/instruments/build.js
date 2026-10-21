// Assemble a complete TIMS from components + traced ion optics.
//
// World frame: sector 2-D (x, y) → world (x, Hb, −y) (geom.toWorld). The source object
// slit sits at 2-D (−L1, 0); the lens stack, turret and housing are positioned so the
// ionization filament faces the slit along +x. Every isotope beam is a traced trajectory
// (src/physics/sector.js) and every Faraday cup is placed at the traced focal point of its
// mass, so the hardware and the physics can never disagree.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, roundedBox, toWorld, yawFromDir2D, cfFlange, rod, tubeShell, wire, plateWithHole } from '../core/geom.js';
import { Exploder } from '../core/explode.js';
import { IonBeam } from '../core/beam.js';
import { ISOTOPE_COLORS } from '../core/materials.js';
import { makeSector, sectorForDispersion, symmetricDistance, findFocus, traceRay, massDispersion, imageDistance, vec2 } from '../physics/sector.js';
import { ISOTOPE_SETS } from '../physics/elements.js';
import { AMU, E_CHARGE } from '../physics/constants.js';
import { LENS_LAYOUT } from '../physics/sourceLens.js';
import { buildLensStack } from '../components/lens.js';
import { buildTurret } from '../components/turret.js';
import { buildSectorMagnet } from '../components/magnet.js';
import { buildFaradayLite, buildIonCounterLite } from '../components/faraday.js';
import { buildDaly } from '../components/daly.js';
import { buildSEM } from '../components/sem.js';
import { buildTurboPump, buildIonPump, buildColdTrap, buildScrollPump, buildGauge, buildGateValve } from '../components/vacuum.js';
import { registerParts } from '../components/parts.js';

const mm = 1e-3;
const { add, sub, mul, dot, len, norm } = vec2;

const opticsCache = new Map();
/** Solve (and cache) the sector optics for an instrument spec. */
export function opticsFor(spec) {
  if (opticsCache.has(spec.id)) return opticsCache.get(spec.id);
  const m = spec.magnet;
  let s;
  if (m.targetD) s = sectorForDispersion({ R0: m.R0, phi: m.phi, targetD: m.targetD });
  if (!s) {
    s = makeSector({ R0: m.R0, phi: m.phi, eps1: m.eps ?? 0, eps2: m.eps ?? 0 });
    s.L1 = symmetricDistance(s);
  }
  const L2 = imageDistance(s);
  const D = massDispersion(s);
  const o = { sector: s, L1: s.L1, L2, D };
  opticsCache.set(spec.id, o);
  return o;
}

/** Magnetic field (T) to put mass m (u, singly charged) on the nominal radius at V (volts). */
export function fieldFor(mU, R0, V = 10000) {
  return Math.sqrt(2 * mU * AMU * V / E_CHARGE) / R0;
}

const CUP_NAMES = {
  thermo: (k) => (k === 0 ? 'C' : k < 0 ? 'L' + -k : 'H' + k),
  phoenix: (k) => (k === 0 ? 'Ax' : k < 0 ? 'L' + -k : 'H' + k),
  nu: (k) => (k === 0 ? 'Ax' : k < 0 ? 'L' + -k : 'H' + k),
};

/**
 * @param {object} spec from INSTRUMENTS
 * @param {object} o {element, label(obj,text,opts), Hb, fan, measureOn:'faraday'|'ic', zoom}
 */
export function buildInstrument(spec, o = {}) {
  const { label = () => {}, Hb = 1.05 } = o;
  const optics = opticsFor(spec);
  const { sector, L1 } = optics;
  const R0 = sector.R0;
  const root = new THREE.Group();
  root.name = `${spec.vendor} ${spec.name}`;
  const ex = new Exploder();
  const features = {};
  const state = { element: o.element || 'Sr', measureOn: o.measureOn || 'faraday', zoom: o.zoom ?? 1, fan: !!o.fan, designAxial: null, axialMass: null };

  // ---------- key coordinates (2-D sector frame, metres) ----------
  const xS = -L1; // object (source) slit
  const lensSlitX = (LENS_LAYOUT.sourceSlit.x0 + LENS_LAYOUT.sourceSlit.x1) / 2;
  const xLens0 = xS - lensSlitX; // lens 2-D origin
  const xEmit = xLens0 + LENS_LAYOUT.filament.x1; // ribbon face
  const cw = Math.max(0.018, R0 * 0.09);
  const ext = Math.max(0.12, cw + 0.12); // magnet flight-tube stubs (see magnet.js)
  const P2 = sector.P2, d2 = sector.d2;
  const fAx = findFocus(sector, 1);
  const focusAx = fAx.point, dirAx = fAx.dir;
  const outward = [dirAx[1], -dirAx[0]]; // right-hand normal = larger radius = high mass side

  // ---------- source region ----------
  const src = new THREE.Group();
  src.name = 'Ion source';
  root.add(src);
  const lens = buildLensStack({ detail: 'lite', height: 0.02 });
  lens.group.rotation.y = Math.PI / 2;
  lens.group.position.copy(toWorld([xLens0, 0], Hb));
  src.add(lens.group);
  registerParts(ex, lens.parts, { orderOffset: 0.45, orderScale: 0.4, scale: 1.6 });
  ex.add(lens.group, [0, 0.12, 0.32], { name: 'Ion-source lens stack', info: 'Extraction, focus (split for Y-symmetry steering), ground, deflection, source (object) slit and angular selector. All potentials float from the 10 kV acceleration voltage. See the “Source potentials” scene for the solved field.', order: 0.35 });
  features.lens = lens.group;

  const turret = buildTurret({ n: spec.turret.n, config: spec.turret.config, enclosed: spec.turret.enclosed });
  turret.group.rotation.y = Math.PI / 2;
  const ap = turret.activePoint.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  turret.group.position.copy(toWorld([xEmit, 0], Hb)).sub(ap);
  turret.setActive(0);
  src.add(turret.group);
  registerParts(ex, turret.parts, { orderOffset: 0.5, orderScale: 0.4 });
  ex.add(turret.group, [-0.05, 0.05, 0.42], { name: `Sample turret (${spec.turret.n} × ${spec.turret.config} filament)`, info: `${spec.turret.n}-position magazine${spec.turret.enclosed ? ' with fully enclosed filament assemblies (Nu brochure)' : ''}. The active position (glowing) faces the extraction lens; the whole turret floats at the acceleration potential.`, order: 0.3 });
  features.turret = turret.group;
  // light up the active filament
  const act = turret.assemblies[0];
  if (act?.setTemperature) act.ribbons.forEach((r, i) => act.setTemperature(i, r.role === 'evaporation' ? 1450 : 2050));

  // source housing (vacuum chamber)
  const hx0 = xEmit - turret.radius - 0.13, hx1 = xEmit + 0.105;
  const hw = hx1 - hx0, hh = 0.3, hd = 0.34;
  const housing = new THREE.Group();
  const hc = toWorld([(hx0 + hx1) / 2, 0], Hb - 0.02);
  housing.position.copy(hc);
  const shellMesh = mesh(roundedBox(hw, hh, hd, 0.02), M.steelBrushed(), { name: 'source housing' });
  housing.add(shellMesh);
  // front door with viewport
  const door = new THREE.Group();
  door.add(cfFlange(0.2, 0.02, 0.0, 16, M.steel(), M.steelPolished()));
  const vp = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.004, 40), M.quartz(), { name: 'viewport' });
  vp.rotation.x = Math.PI / 2; vp.position.z = 0.012;
  door.add(vp);
  door.position.set(-0.02, 0.0, hd / 2 + 0.01);
  housing.add(door);
  // side flanges
  for (const sx of [-1, 1]) {
    const f = cfFlange(0.11, 0.016, 0.0, 8, M.steel(), M.steelPolished());
    f.rotation.y = Math.PI / 2;
    f.position.set((sx * hw) / 2 + sx * 0.008, 0.06, -0.05);
    if (sx > 0) f.position.y = 0.02;
    housing.add(f);
  }
  src.add(housing);
  ex.add(housing, [0, 0.42, -0.06], { name: 'Source housing (vacuum chamber)', info: spec.id === 'nu' ? 'Nu TIMS: source machined from a single piece of stainless steel; user-replaceable source slit; turret exchanged and pumped under software control.' : 'Stainless-steel UHV source chamber. Opened (vented) to exchange the sample turret, then pumped back to ~10⁻⁷–10⁻⁸ mbar before analysis.', shell: true, order: 0.12 });
  label(housing, 'Ion source', { sub: `${spec.turret.n}-sample turret · lens stack`, offset: [0, hh / 2 + 0.02, 0] });
  features.source = housing;

  // turbo under the source
  const turbo = buildTurboPump({ speed: spec.vacuum.sourceTurbo });
  turbo.group.position.copy(toWorld([(hx0 + hx1) / 2, 0], Hb - 0.02 - hh / 2));
  src.add(turbo.group);
  registerParts(ex, turbo.parts, { orderOffset: 0.4, orderScale: 0.4 });
  ex.add(turbo.group, [0, -0.32, 0.08], { name: `Turbomolecular pump (${spec.vacuum.sourceTurbo} L/s)`, info: `Pumps the source chamber${spec.id === 'nu' ? ' (400 L/s turbo backed by an oil-free scroll pump; Nu brochure)' : ''}. Fast pump-down after a turret exchange is what sets sample throughput.`, order: 0.15 });
  label(turbo.group, `Turbo ${spec.vacuum.sourceTurbo} L/s`, { offset: [0.12, -0.15, 0] });
  features.turbo = turbo.group;

  const scroll = buildScrollPump();
  scroll.group.position.set((hx0 + hx1) / 2 - 0.05, 0.12, 0.16);
  root.add(scroll.group);
  registerParts(ex, scroll.parts, { orderOffset: 0.5, orderScale: 0.3 });
  ex.add(scroll.group, [0, 0, 0.25], { name: 'Dry scroll backing pump', info: 'Oil-free backing pump for the turbo: avoids hydrocarbon back-streaming into the source.', order: 0.2 });
  // backing line
  {
    const a = toWorld([(hx0 + hx1) / 2, 0], Hb - 0.02 - hh / 2 - 0.26);
    const pts = [a, a.clone().add(new THREE.Vector3(0, -0.15, 0.1)), new THREE.Vector3((hx0 + hx1) / 2 - 0.05, 0.3, 0.14)];
    const hose = wire(pts, 0.012, M.steelBrushed());
    hose.name = 'backing line';
    src.add(hose);
  }

  if (spec.vacuum.coldTrap) {
    const ct = buildColdTrap();
    ct.group.rotation.x = Math.PI;
    ct.group.position.copy(toWorld([(hx0 + hx1) / 2 - 0.04, 0.05], Hb - 0.02 + hh / 2));
    src.add(ct.group);
    registerParts(ex, ct.parts, { orderOffset: 0.4, orderScale: 0.3 });
    ex.add(ct.group, [0, 0.75, 0], { name: 'LN₂ cold trap', info: 'Liquid-nitrogen cold finger in the source: cryopumps water and condensable species; capacity for 24 h per fill (Nu brochure).', order: 0.18 });
    label(ct.group, 'LN₂ cold trap', { sub: '24 h per fill', offset: [0, -0.3, 0] });
    features.coldTrap = ct.group;
  }
  const gauge = buildGauge();
  gauge.group.rotation.z = Math.PI / 2;
  gauge.group.position.copy(toWorld([hx0, -0.06], Hb + 0.05));
  src.add(gauge.group);
  registerParts(ex, gauge.parts);
  ex.add(gauge.group, [-0.2, 0, 0], { name: 'Ion gauge', info: 'Source-pressure gauge, read by the software for vacuum interlocks.', order: 0.2 });

  // ---------- entry flight tube + isolation valve ----------
  const tubeR = 0.019;
  const mkTube = (a2, b2, name) => {
    const a = toWorld(a2, Hb), b = toWorld(b2, Hb);
    const L = a.distanceTo(b);
    const g = tubeShell(tubeR, tubeR - 0.0015, L, 32);
    const m = mesh(g, M.steelBrushed(), { name });
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };
  const entryTube = mkTube([hx1, 0], [-ext, 0], 'entry flight tube');
  entryTube.userData.shell = true;
  entryTube.userData.part = { name: 'Flight tube (source → magnet)', info: `Field-free drift from the source (object) slit to the magnet entrance; object distance L′ = ${(L1 * 100).toFixed(1)} cm.` };
  root.add(entryTube);
  const valve = buildGateValve({ bore: 0.04 });
  valve.group.rotation.z = -Math.PI / 2;
  valve.group.position.copy(toWorld([hx1 + 0.06, 0], Hb));
  root.add(valve.group);
  registerParts(ex, valve.parts);
  ex.add(valve.group, [0, 0.18, 0], { name: 'Source isolation valve', info: 'Closes the analyser while the source is vented for turret exchange, so the magnet and collector stay at UHV.', order: 0.25 });

  // ---------- magnet ----------
  const magnet = buildSectorMagnet(sector, { beamY: Hb, gap: 0.012, poleThickness: 0.045 });
  root.add(magnet.group);
  registerParts(ex, magnet.parts, { orderOffset: 0.15, orderScale: 0.5 });
  for (const p of magnet.parts) if (/Flight tube/.test(p.name)) p.obj.userData.shell = true;
  features.magnet = magnet.group;
  {
    const mid = [sector.C[0] + R0 * Math.sin(sector.phi / 2), sector.C[1] - R0 * Math.cos(sector.phi / 2)];
    const anchor = new THREE.Object3D();
    anchor.position.copy(toWorld(mid, Hb + 0.11));
    magnet.halves.top.add(anchor);
    const epsTxt = Math.abs(sector.eps1) > 1e-3 ? `, ε = ${(sector.eps1 * 180 / Math.PI).toFixed(1)}°` : '';
    label(anchor, `Magnet ${(sector.phi * 180 / Math.PI).toFixed(0)}°, R₀ ${(R0 * 100).toFixed(0)} cm${epsTxt}`, { sub: `D = ${(optics.D * 100).toFixed(1)} cm` });
  }
  // ---------- exit tube, zoom optics, analyser pumps ----------
  const exitStart = add(P2, mul(d2, ext));
  const collStart = add(focusAx, mul(dirAx, -0.075));
  const exitTube = mkTube(exitStart, collStart, 'exit flight tube');
  exitTube.userData.shell = true;
  exitTube.userData.part = { name: 'Flight tube (magnet → collector)', info: `Drift to the focal plane; image distance L″ = ${(optics.L2 * 100).toFixed(1)} cm. Isotope beams separate laterally by D·Δm/m.` };
  root.add(exitTube);
  const zoomPos2 = add(exitStart, mul(sub(collStart, exitStart), 0.5));
  if (spec.collector.zoom) {
    const z = new THREE.Group();
    const body = mesh(tubeShell(0.032, 0.03, 0.1, 40), M.steel(), { name: 'zoom optics housing' });
    z.add(body);
    for (let i = 0; i < 4; i++) {
      for (const dz of [-0.025, 0.025]) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.035, 16), M.steelPolished(), { name: 'quadrupole rod' });
        r.position.set(Math.cos(a) * 0.016, dz, Math.sin(a) * 0.016);
        z.add(r);
      }
    }
    z.position.copy(toWorld(zoomPos2, Hb));
    z.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toWorld(d2, 0).normalize());
    root.add(z);
    ex.add(z, [0, 0.22, 0], { name: 'Zoom Optics (quadrupole doublet)', info: 'Patented Nu variable-dispersion lens, first used on a TIMS: rescales the mass dispersion instantly so every cycle of a multi-dynamic routine stays centred on the fixed collector array (Nu brochure). See the “Nu TIMS brochure” scene.', order: 0.45 });
    label(z, 'Zoom Optics', { sub: 'variable dispersion', offset: [0, 0.05, 0] });
    features.zoom = z;
  }
  spec.vacuum.ionPumps.forEach((sp, i) => {
    const ip = buildIonPump({ speed: sp });
    const pos2 = i === 0 ? add(exitStart, mul(sub(collStart, exitStart), 0.22)) : add(focusAx, mul(dirAx, 0.06));
    ip.group.position.copy(toWorld(pos2, Hb - (i === 0 ? tubeR : 0.1)));
    root.add(ip.group);
    registerParts(ex, ip.parts, { orderOffset: 0.4, orderScale: 0.3 });
    ex.add(ip.group, [0, -0.3, 0], { name: `Ion pump (${sp} L/s)`, info: 'Sputter-ion pump: vibration-free UHV pumping of the analyser and collector (~10⁻⁹ mbar). Low pressure reduces scattering → better abundance sensitivity.', order: 0.2 });
    if (i === 0) label(ip.group, `Ion pump ${sp} L/s`, { offset: [0, -0.18, 0] });
    features['ionPump' + i] = ip.group;
  });
  // ---------- collector housing ----------
  const coll = new THREE.Group();
  coll.name = 'collector';
  root.add(coll);
  const cHousing = new THREE.Group();
  const nF = spec.collector.faradays;
  const span = Math.max(0.11, nF * 0.009 + 0.06);
  const cLen = 0.3;
  const cbox = mesh(roundedBox(span + 0.06, 0.2, cLen, 0.015), M.steelBrushed(), { name: 'collector housing' });
  cHousing.add(cbox);
  const cflange = cfFlange(0.15, 0.018, 0, 12, M.steel(), M.steelPolished());
  cflange.position.set(0, 0.11, 0);
  cflange.rotation.x = Math.PI / 2;
  cHousing.add(cflange);
  const cc = add(focusAx, mul(dirAx, cLen / 2 - 0.075));
  cHousing.position.copy(toWorld(cc, Hb - 0.01));
  cHousing.rotation.y = yawFromDir2D(dirAx);
  coll.add(cHousing);
  ex.add(cHousing, [0, 0.4, 0], { name: 'Collector housing', info: `Multicollector vacuum chamber at the focal plane. ${spec.collector.movable ? 'Cups are motorised and moved to the focal points of the isotopes of interest.' : 'Fixed array: Zoom Optics adjust the dispersion instead of moving detectors.'}`, shell: true, order: 0.12 });
  label(cHousing, `Collector: ${nF} Faraday`, { sub: spec.collector.ionCounter === 'daly' ? '+ Daly (WARP)' : spec.collector.ionCounter === 'sem' ? '+ SEM (RPQ)' : '+ Daly & multiplier', offset: [0, 0.13, 0] });
  features.collector = cHousing;

  // amplifier housing on the outward side
  const amp = new THREE.Group();
  const ampBox = mesh(roundedBox(0.16, 0.22, 0.34, 0.012), M.panel(0x6c7684), { name: 'amplifier housing' });
  amp.add(ampBox);
  for (let i = 0; i < 9; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.004, 0.02, 0.3), M.aluminium());
    fin.position.set(-0.06 + i * 0.015, 0.12, 0);
    amp.add(fin);
  }
  const ampPos = add(cc, mul(outward, span / 2 + 0.17));
  amp.position.copy(toWorld(ampPos, Hb - 0.01));
  amp.rotation.y = yawFromDir2D(dirAx);
  coll.add(amp);
  const ampTxt = spec.collector.amps === 'ATONA'
    ? 'ATONA capacitive transimpedance amplifiers (Isotopx): no feedback resistor, no range switching, ~1e-17 A to nA.'
    : spec.id === 'triton'
      ? 'Evacuated, doubly shielded housing held to 0.01 °C/h with 10 amplifiers (10¹¹ Ω standard, 10¹³ Ω and 10¹⁰ Ω options) and a relay matrix for the virtual amplifier (Thermo).'
      : 'Faraday amplifier housing; software-switchable resistor amplifiers optional (Nu brochure).';
  ex.add(amp, [mul(outward, 0.3)[0], 0.05, -mul(outward, 0.3)[1]], { name: 'Faraday amplifier housing', info: ampTxt + ' See the “Faraday cup & Johnson noise” scene.', order: 0.2 });
  label(amp, spec.collector.amps === 'ATONA' ? 'ATONA amplifiers' : 'Amplifier housing', { sub: spec.collector.amps === 'ATONA' ? 'resistor-less' : '10¹¹–10¹³ Ω', offset: [0, 0.13, 0] });
  features.amps = amp;
  {
    const a = toWorld(add(cc, mul(outward, span / 2 + 0.03)), Hb + 0.02);
    const b = toWorld(add(cc, mul(outward, span / 2 + 0.09)), Hb + 0.02);
    const bundle = wire([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.05, 0)), b], 0.008, M.black());
    bundle.name = 'signal coax bundle';
    coll.add(bundle);
  }

  // ---------- dynamic part: cups, ion counters, beams ----------
  const dyn = new THREE.Group();
  dyn.name = 'detectors & beams';
  root.add(dyn);
  let beams = [];
  const readout = {};

  function pointFor(m, ma) {
    return findFocus(sector, Math.sqrt(m / ma));
  }

  function rebuildDynamic() {
    ex.removeUnder(dyn);
    for (const c of [...dyn.children]) {
      dyn.remove(c);
      c.traverse((q) => { if (q.isCSS2DObject) q.element.remove(); q.geometry?.dispose?.(); if (q.userData.beam && q.dispose) q.dispose(); });
    }
    beams = [];
    const set = ISOTOPE_SETS[state.element];
    const iso = set.isotopes;
    const axialIso = iso.find((i) => i.name === set.axial) ?? iso[0];
    // ma: mass on the optical axis (magnet setting); mc: mass for which the cups were laid out
    const ma = state.axialMass ?? axialIso.m;
    const mc = state.designAxial ?? ma;
    // integer offsets of isotopes from axial
    const offs = iso.map((i) => Math.round(i.m - ma));
    const nLow = Math.floor((nF - 1) / 2), nHigh = nF - 1 - nLow;
    const ks = [];
    for (let k = -nLow; k <= nHigh; k++) ks.push(k);
    const pitch1 = Math.abs(dot(sub(pointFor(mc + 1, mc).point, focusAx), outward));
    const cupW = Math.min(6 * mm, Math.max(1.4 * mm, pitch1 * 0.82));
    readout.pitch = pitch1;
    readout.B = fieldFor(ma, R0);
    readout.ma = ma;
    readout.cupW = cupW;
    const zoom = state.zoom;
    const lateralOf = (p) => dot(sub(p, focusAx), outward);
    // cups
    const cups = [];
    for (const k of ks) {
      const designIso = iso.find((i) => Math.round(i.m - mc) === k);
      const m = designIso ? designIso.m : mc + k;
      const f = pointFor(m, mc);
      // fixed arrays: zoom maps beams; cups stay at designed positions
      const p = f.point;
      const cup = buildFaradayLite({ width: cupW, height: 0.02, depth: 0.03 });
      cup.group.position.copy(toWorld(p, Hb));
      cup.group.rotation.y = yawFromDir2D(f.dir);
      const isoHere = iso.find((i) => Math.round(i.m - ma) === k);
      const name = CUP_NAMES[spec.collector.naming](k);
      let moved = false;
      if (k === 0 && state.measureOn === 'ic') {
        // axial Faraday moves out of the way so the beam reaches the ion counter
        cup.group.position.add(new THREE.Vector3(0, 0.03, 0));
        moved = true;
      }
      dyn.add(cup.group);
      const lat = lateralOf(p);
      ex.add(cup.group, [toWorld(mul(outward, lat * 2.2), 0).x, 0.06 + Math.abs(k) * 0.004, toWorld(mul(outward, lat * 2.2), 0).z], {
        name: `Faraday ${name}${isoHere ? ' — ' + isoHere.name : ''}`,
        info: `${isoHere ? `Collects ${isoHere.name} (${isoHere.ab}% natural abundance). ` : 'Parked/unused for this element. '}Focal point traced for m = ${m.toFixed(0)} u: lateral offset ${(lat * 1000).toFixed(2)} mm from axial (1 u ≈ ${(pitch1 * 1000).toFixed(2)} mm here).${moved ? ' Raised out of the beam: ion-counter mode.' : ''}`,
        order: 0.55,
      });
      cups.push({ k, name, p, dir: f.dir, iso: isoHere, group: cup.group });
    }
    // ion counter path behind the axial position
    const icBase = add(focusAx, mul(dirAx, 0.07));
    const icGroup = new THREE.Group();
    dyn.add(icGroup);
    const filterKind = spec.collector.filter;
    const filt = new THREE.Group();
    if (filterKind === 'warp' || filterKind === 'energy') {
      for (let i = 0; i < (filterKind === 'warp' ? 4 : 3); i++) {
        const ring = mesh(plateWithHole(0.026, 0.026, 0.0015, 0.004 + (filterKind === 'warp' ? i * 0.0008 : 0), { round: true }), i % 2 ? M.steelPolished() : M.steel(), { name: 'filter electrode' });
        ring.position.z = i * 0.007;
        filt.add(ring);
      }
    } else if (filterKind === 'rpq') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.03, 16), M.steelPolished(), { name: 'RPQ rod' });
        r.rotation.x = Math.PI / 2;
        r.position.set(Math.cos(a) * 0.008, Math.sin(a) * 0.008, 0.015);
        filt.add(r);
      }
      for (const z of [0, 0.034]) {
        const pl = mesh(plateWithHole(0.026, 0.026, 0.0015, 0.003), M.steel(), { name: 'retarding plate' });
        pl.position.z = z;
        filt.add(pl);
      }
    }
    filt.position.copy(toWorld(icBase, Hb));
    filt.rotation.y = yawFromDir2D(dirAx);
    icGroup.add(filt);
    const fName = { warp: 'WARP filter (wide-angle retarding potential)', rpq: 'RPQ (retarding potential quadrupole)', energy: 'Energy filter' }[filterKind];
    const fInfo = {
      warp: 'Retarding-potential filter in front of the Daly: only ions with (nearly) the full acceleration energy pass, removing scattered ions that tail under neighbouring masses → high abundance sensitivity (Isotopx).',
      rpq: 'Retarding Potential Quadrupole: a decelerating lens that rejects ions which lost energy or direction by scattering. Abundance sensitivity < 2×10⁻⁸ at ±1 u from ²³⁸U (Thermo).',
      energy: 'Energy filter on the ion counters: improves abundance sensitivity by up to two orders of magnitude (Nu brochure).',
    }[filterKind];
    ex.add(filt, [0, 0.12, 0], { name: fName, info: fInfo, order: 0.6 });
    features.filter = filt;
    let icEntry = add(icBase, mul(dirAx, 0.05));
    if (spec.collector.ionCounter.includes('daly')) {
      const d = buildDaly({ detail: 'lite' });
      d.group.position.copy(toWorld(icEntry, Hb));
      d.group.rotation.y = yawFromDir2D(dirAx);
      icGroup.add(d.group);
      registerParts(ex, d.parts, { orderOffset: 0.6, orderScale: 0.35, scale: 0.6 });
      ex.add(d.group, [0, 0.2, 0], { name: 'Daly detector', info: 'Ion → Al knob (−20…−35 kV) → secondary electrons → scintillator → photons through a window → PMT outside vacuum. High, nearly mass-independent efficiency and very stable gain. See the “Daly detector” scene.', order: 0.5 });
      label(d.group, 'Daly detector', { offset: [0.05, 0.06, 0.04] });
      features.daly = d.group;
      readout.icKnob = toWorld(add(icEntry, mul(dirAx, d.anchors.knob.z)), Hb);
    }
    if (spec.collector.ionCounter.includes('sem')) {
      const s = buildSEM({ detail: 'lite', variant: spec.id === 'phoenix' ? 'conversion' : 'discrete' });
      let pos2 = icEntry;
      if (spec.collector.ionCounter === 'daly+sem') {
        // Nu: second ion-counting position beyond the low-mass end of the array
        const low = cups[0];
        pos2 = add(add(low.p, mul(dirAx, 0.07)), mul(outward, -0.012));
      }
      s.group.position.copy(toWorld(pos2, Hb));
      s.group.rotation.y = yawFromDir2D(dirAx);
      icGroup.add(s.group);
      registerParts(ex, s.parts, { orderOffset: 0.6, orderScale: 0.35, scale: 0.6 });
      ex.add(s.group, [0, 0.16, spec.collector.ionCounter === 'daly+sem' ? 0.12 : 0], { name: spec.id === 'triton' ? 'Central SEM (dual-mode C position)' : 'Discrete-dynode multiplier', info: spec.id === 'triton' ? 'Behind the central cup: the C position switches between Faraday and SEM mode; up to 8 SEMs/CDDs can be fitted for multi-ion counting (Thermo).' : 'Full-size, off-axis discrete-dynode multiplier (Nu brochure). See the “Ion counter” scene.', order: 0.5 });
      label(s.group, spec.id === 'triton' ? 'SEM (C position)' : 'Multiplier', { offset: [0, 0.05, 0.02] });
      features.sem = s.group;
      if (!readout.icKnob) readout.icKnob = toWorld(add(pos2, mul(dirAx, 0.012)), Hb);
    }

    // beams --------------------------------------------------
    const emitW = toWorld([xEmit, 0], Hb), sW = toWorld([xS, 0], Hb);
    const trunk = new IonBeam([emitW, sW, toWorld([xS + 0.02, 0], Hb)], { color: 0xffffff, radius: 0.0016, particles: 12, speed: 0.2, opacity: 0.45, size: 0.006 });
    dyn.add(trunk); beams.push(trunk);
    const total = iso.reduce((a, b) => a + b.ab, 0);
    iso.forEach((I, idx) => {
      const k = Math.round(I.m - ma);
      const pr = Math.sqrt(I.m / ma);
      const f = findFocus(sector, pr);
      const r0 = traceRay(sector, { alpha: 0, pRatio: pr });
      const toAx = (s) => add(r0.exitPoint, mul(r0.exitDir, s));
      const distToFocus = dot(sub(f.point, r0.exitPoint), r0.exitDir);
      const toIC = state.measureOn === 'ic' && k === 0 && readout.icKnob;
      const after = toIC ? distToFocus + 0.14 : distToFocus + 0.026;
      const tr = traceRay(sector, { alpha: 0, pRatio: pr }, { after, arcPts: 64 });
      // zoom optics: lateral rescaling of the beam position after the zoom lens
      const zStart = dot(sub(zoomPos2, r0.exitPoint), r0.exitDir);
      const pts2 = tr.pts.map((p) => {
        if (!spec.collector.zoom || zoom === 1) return p;
        const s = dot(sub(p, r0.exitPoint), r0.exitDir);
        if (s <= zStart) return p;
        const ramp = Math.min(1, (s - zStart) / Math.max(1e-6, distToFocus - zStart));
        const lat = dot(sub(p, focusAx), outward);
        const target = lat * (1 + (zoom - 1) * ramp);
        return add(p, mul(outward, target - lat));
      });
      const pts3 = pts2.map((p) => toWorld(p, Hb));
      const ab = I.ab / total;
      const inRange = k >= ks[0] && k <= ks[ks.length - 1];
      const col = ISOTOPE_COLORS[idx % ISOTOPE_COLORS.length];
      const b = new IonBeam(pts3, { color: col, radius: 0.0007 + 0.0014 * Math.cbrt(ab), particles: Math.max(6, Math.round(26 * Math.cbrt(ab))), speed: 0.35, opacity: 0.25 + 0.5 * Math.cbrt(ab), size: 0.005 });
      b.userData.iso = I;
      dyn.add(b); beams.push(b);
      if (!inRange) b.setIntensity(0.1);
      // focusing fan (±4 mrad) drawn as faint lines
      if (state.fan) {
        for (const a of [-0.004, 0.004]) {
          const fr = traceRay(sector, { alpha: a, pRatio: pr }, { after: distToFocus + 0.03, arcPts: 48 });
          const g = new THREE.BufferGeometry().setFromPoints(fr.pts.map((p) => toWorld(p, Hb)));
          const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55, toneMapped: false }));
          line.userData.beam = true;
          dyn.add(line);
        }
      }
      if (inRange) {
        const cup = cups.find((c) => c.k === k);
        const tip = new THREE.Object3D();
        tip.position.copy(toWorld(f.point, Hb + 0.018 + idx * 0.016));
        dyn.add(tip);
        label(tip, I.name, { sub: cup ? cup.name : '', className: 'callout' });
      }
    });
    readout.cups = cups;
    root.userData.readout = readout;
    // keep current explode state consistent for new parts
    ex.set(ex.t);
  }
  rebuildDynamic();

  // ---------- cabinet (the analyser sits on top; pumps hang inside) ----------
  const bb = new THREE.Box3().setFromObject(root);
  const tableTop = Hb - 0.3;
  const m = 0.08;
  const fx0 = bb.min.x - m, fx1 = bb.max.x + m, fz0 = bb.min.z - m, fz1 = bb.max.z + m;
  const cxm = (fx0 + fx1) / 2, czm = (fz0 + fz1) / 2, W = fx1 - fx0, Dp = fz1 - fz0;
  const cab = new THREE.Group();
  cab.name = 'cabinet';
  root.add(cab);
  const panelMat = M.panel(spec.cabinet.color), trimMat = M.panel(spec.cabinet.trim);
  const t = 0.018;
  const panels = [
    { w: W, d: t, pos: [cxm, tableTop / 2, fz1], off: [0, 0, 0.8], name: 'Front panel' },
    { w: W, d: t, pos: [cxm, tableTop / 2, fz0], off: [0, 0, -0.8], name: 'Rear panel' },
    { w: t, d: Dp, pos: [fx0, tableTop / 2, czm], off: [-0.8, 0, 0], name: 'Left side panel' },
    { w: t, d: Dp, pos: [fx1, tableTop / 2, czm], off: [0.8, 0, 0], name: 'Right side panel' },
  ];
  for (const P of panels) {
    const g = new THREE.Group();
    const pm = mesh(roundedBox(P.w, tableTop - 0.02, P.d, 0.006), panelMat, { name: P.name });
    const tr = mesh(new THREE.BoxGeometry(P.w + 0.002, 0.035, P.d + 0.002), trimMat, { name: 'trim' });
    tr.position.y = tableTop / 2 - 0.09;
    g.add(pm, tr);
    g.position.set(...P.pos);
    cab.add(g);
    ex.add(g, P.off, { name: `Cabinet ${P.name.toLowerCase()}`, info: 'Removable covers of the instrument cabinet. Inside: backing pumps, the turbo and ion pumps hanging below the analyser, HV supplies (acceleration, lens, Daly/SEM), the magnet supply, filament supplies and vacuum controllers.', shell: true, order: 0 });
  }
  // work surface: perimeter frame (open centre so the pumps pass through)
  {
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, -Dp / 2); sh.lineTo(W / 2, -Dp / 2); sh.lineTo(W / 2, Dp / 2); sh.lineTo(-W / 2, Dp / 2); sh.closePath();
    const hole = new THREE.Path();
    const bw = 0.07;
    hole.moveTo(-W / 2 + bw, -Dp / 2 + bw); hole.lineTo(-W / 2 + bw, Dp / 2 - bw); hole.lineTo(W / 2 - bw, Dp / 2 - bw); hole.lineTo(W / 2 - bw, -Dp / 2 + bw); hole.closePath();
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const rim = mesh(g, M.panel(0x8d96a2), { name: 'table frame' });
    rim.position.set(cxm, tableTop - 0.025, czm);
    cab.add(rim);
    rim.userData.part = { name: 'Instrument table frame', info: 'Stiff frame carrying the source, magnet and collector so their relative alignment is preserved to micrometres.' };
  }
  // magnet pedestal (inside the cabinet)
  {
    const mid = [sector.C[0] + R0 * Math.sin(sector.phi / 2), sector.C[1] - R0 * Math.cos(sector.phi / 2)];
    const hgt = Hb - 0.1;
    const ped = mesh(roundedBox(R0 * 0.55, hgt, R0 * 0.55, 0.01), M.panel(0x4a525e), { name: 'magnet pedestal' });
    ped.position.copy(toWorld(mid, hgt / 2));
    root.add(ped);
    ped.userData.part = { name: 'Magnet pedestal', info: 'Rigid support for the magnet (hundreds of kg): it must not move relative to the source and collector.' };
    ped.userData.shell = true;
  }

  // ---------- public API ----------
  const turboUpdate = turbo.update;
  return {
    root, exploder: ex, optics, features, spec, state,
    readout: () => readout,
    setElement(sym) { state.element = sym; rebuildDynamic(); },
    setMeasureOn(m) { state.measureOn = m; rebuildDynamic(); },
    setZoom(z) { state.zoom = z; rebuildDynamic(); },
    setFan(f) { state.fan = f; rebuildDynamic(); },
    /** Multi-dynamic cycle: cups laid out for designAxial, magnet puts axialMass on axis. */
    setCycle({ designAxial = null, axialMass = null, zoom = 1 } = {}) { state.designAxial = designAxial; state.axialMass = axialMass; state.zoom = zoom; rebuildDynamic(); },
    update(dt) { turboUpdate(dt, true); },
    geometry: { xS, xEmit, focusAx, dirAx, outward, Hb, zoomPos2, exitStart, collStart, hx0, hx1 },
  };
}
