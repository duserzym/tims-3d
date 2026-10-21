// Laminated sector electromagnet built from the traced sector optics (src/physics/sector.js).
// Sector 2-D (x, y) → world (x, beamY, −y). Pole outlines come straight from the optical
// model (including pole-face rotation / "extended geometry" edge angles), so the hardware
// and the traced beams are always consistent.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, slabFromOutline, offsetPolygon, toWorld, yawFromDir2D, cfFlange, rod, mergeGeometries } from '../core/geom.js';
import { polePolygon, vec2 } from '../physics/sector.js';
import { part } from './parts.js';

const { add, mul } = vec2;

/** Centre-line points: straight entry stub → arc → straight exit stub. Returns [{p, n}] with n = left normal. */
function centreLine(sector, ext, nArc = 64) {
  const out = [];
  const { R0, phi, C } = sector;
  out.push({ p: [-ext, 0], n: [0, 1] });
  for (let i = 0; i <= nArc; i++) {
    const th = (phi * i) / nArc;
    const p = [C[0] + R0 * Math.sin(th), C[1] - R0 * Math.cos(th)];
    const d = [Math.cos(th), Math.sin(th)];
    out.push({ p, n: [-d[1], d[0]] });
  }
  const d2 = sector.d2;
  out.push({ p: add(sector.P2, mul(d2, ext)), n: [-d2[1], d2[0]] });
  return out;
}

function bandOutline(cl, hw0, hw1) {
  // band between offsets hw0..hw1 along the left normal (hw may be negative)
  const a = cl.map(({ p, n }) => add(p, mul(n, hw1)));
  const b = cl.map(({ p, n }) => add(p, mul(n, hw0))).reverse();
  return [...a, ...b];
}

function ringOutline(C, r0, r1, th0, th1, n = 48) {
  const pt = (r, th) => [C[0] + r * Math.sin(th), C[1] - r * Math.cos(th)];
  const a = [], b = [];
  for (let i = 0; i <= n; i++) { const th = th0 + ((th1 - th0) * i) / n; a.push(pt(r1, th)); b.push(pt(r0, th)); }
  return [...a, ...b.reverse()];
}

/**
 * @param sector from makeSector
 * @returns {{group, parts, length, coils:THREE.Mesh[]}}
 */
export function buildSectorMagnet(sector, { gap = 0.012, poleThickness = 0.04, yokeMargin = 0.05, beamY = 0, flightTube = true, coilWidth = null } = {}) {
  const group = new THREE.Group();
  group.name = 'sector magnet';
  const parts = [];
  const pole = polePolygon(sector, 56);
  const cw = coilWidth ?? Math.max(0.018, sector.R0 * 0.09);
  const coilIn = offsetPolygon(pole, 0.004);
  const coilOut = offsetPolygon(pole, 0.004 + cw);
  const yokeT = Math.max(0.03, poleThickness * 0.9);
  const yokeOutline = offsetPolygon(pole, Math.max(yokeMargin, cw + 0.05));
  const coilH = poleThickness * 0.92;
  const midTh = sector.phi / 2;
  const outward2D = [Math.sin(midTh), -Math.cos(midTh)];
  const outwardW = new THREE.Vector3(outward2D[0], 0, -outward2D[1]);
  const R = sector.R0;

  const poleGeo = slabFromOutline(pole, poleThickness);
  const coilGeo = slabFromOutline(coilOut, coilH, { holes: [coilIn.slice().reverse()] });
  const yokeGeo = slabFromOutline(yokeOutline, yokeT);

  const halves = {};
  for (const side of ['top', 'bottom']) {
    const s = side === 'top' ? 1 : -1;
    const g = new THREE.Group();
    g.name = `${side} pole assembly`;
    const pm = mesh(poleGeo, M.pole(), { name: `${side} pole piece` });
    pm.position.y = s > 0 ? beamY + gap / 2 : beamY - gap / 2 - poleThickness;
    const cm = mesh(coilGeo, M.coil(), { name: `${side} coil` });
    cm.position.y = s > 0 ? beamY + gap / 2 + 0.002 : beamY - gap / 2 - coilH - 0.002;
    const ym = mesh(yokeGeo, M.iron(), { name: `${side} yoke plate` });
    ym.position.y = s > 0 ? beamY + gap / 2 + poleThickness : beamY - gap / 2 - poleThickness - yokeT;
    g.add(pm, cm, ym);
    // bolt heads along the yoke perimeter (clamping the laminations)
    const ring = offsetPolygon(pole, Math.max(yokeMargin, cw + 0.05) - 0.014);
    const bolts = [];
    let acc = 0;
    for (let i = 0; i < ring.length; i++) {
      const a2 = ring[i], b2 = ring[(i + 1) % ring.length];
      acc += Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
      if (acc < 0.07) continue;
      acc = 0;
      const bg = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 6);
      bg.translate(a2[0], s > 0 ? yokeT + 0.003 : -0.003, -a2[1]);
      bolts.push(bg);
    }
    if (bolts.length) ym.add(mesh(mergeGeometries(bolts), M.steelPolished(), { name: 'yoke bolts' }));
    group.add(g);
    halves[side] = g;
    parts.push(part(ym, [0, s * R * 0.55, 0], `${side === 'top' ? 'Upper' : 'Lower'} yoke plate`,
      'Laminated low-carbon steel yoke carrying the return flux. Lamination suppresses eddy currents so the field can be switched quickly for peak jumping (multi-dynamic routines).', { order: 0.0, shell: true }));
    parts.push(part(cm, [0, s * R * 0.38, 0], `${side === 'top' ? 'Upper' : 'Lower'} excitation coil`,
      'Water- or air-cooled copper coil. The current is regulated by a high-stability supply under Hall-probe (or NMR) feedback; mass is selected by setting B since r = √(2mV/q)/B.', { order: 0.15, shell: side === 'top' }));
    parts.push(part(pm, [0, s * R * 0.22, 0], `${side === 'top' ? 'Upper' : 'Lower'} pole piece`,
      `Soft-iron pole whose outline is the optical model: ${(sector.phi * 180 / Math.PI).toFixed(0)}° sector, R₀ = ${(R * 100).toFixed(1)} cm` +
      (Math.abs(sector.eps1) > 1e-3 ? `, pole faces rotated ε = ${(sector.eps1 * 180 / Math.PI).toFixed(1)}° (extended geometry: weaker horizontal focusing, longer image distance, larger dispersion)` : ', normal entry/exit (Barber’s rule focusing)') +
      `. The field needed is B = √(2mV/q)/R₀ — from ≈0.15 T (Li⁺) to ≈0.9 T (UO₂⁺) at 10 kV with R₀ ≈ 25 cm — across a ~1 cm gap.`, { order: 0.3, shell: side === 'top' }));
  }

  // C-shaped return yoke on the outer (high-radius) side
  const rIn = R + sector.w + 0.004 + cw + 0.006;
  const rOut = rIn + Math.max(0.035, yokeT);
  const ext = 0.12;
  const back = new THREE.Group();
  const backH = gap + 2 * poleThickness;
  const ringGeo = slabFromOutline(ringOutline(sector.C, rIn, rOut, -ext, sector.phi + ext), backH);
  const bm = mesh(ringGeo, M.iron(), { name: 'return yoke' });
  bm.position.y = beamY - gap / 2 - poleThickness;
  back.add(bm);
  group.add(back);
  parts.push(part(back, [outwardW.x * R * 0.6, 0, outwardW.z * R * 0.6], 'Return yoke (C-frame)',
    'Closes the magnetic circuit on the outer side, leaving the inner (low-radius) side open for the flight tube, pumping and the zoom/dispersion lenses.', { order: 0.05, shell: true }));

  // flight tube: flattened stainless tube along the nominal trajectory
  if (flightTube) {
    const tg = new THREE.Group();
    const cl = centreLine(sector, Math.max(0.12, cw + 0.12));
    const tw = Math.min(sector.w * 0.85, 0.03); // half-width (radial)
    const th = gap * 0.82; // outer height
    const wall = 0.0012;
    const plateGeo = slabFromOutline(bandOutline(cl, -tw, tw), wall);
    const top = mesh(plateGeo, M.steelBrushed(), { name: 'flight tube top' });
    top.position.y = beamY + th / 2 - wall;
    const bot = mesh(plateGeo, M.steelBrushed(), { name: 'flight tube bottom' });
    bot.position.y = beamY - th / 2;
    const sideGeoA = slabFromOutline(bandOutline(cl, tw - wall, tw), th);
    const sideGeoB = slabFromOutline(bandOutline(cl, -tw, -tw + wall), th);
    const sA = mesh(sideGeoA, M.steelBrushed(), { name: 'flight tube wall' });
    const sB = mesh(sideGeoB, M.steelBrushed(), { name: 'flight tube wall' });
    sA.position.y = sB.position.y = beamY - th / 2;
    tg.add(top, bot, sA, sB);
    // flanges at both ends
    const ends = [{ p: cl[0].p, d: [1, 0] }, { p: cl[cl.length - 1].p, d: sector.d2 }];
    for (const e of ends) {
      const f = cfFlange(0.07, 0.008, 0.038, 12, M.steel(), M.steelPolished());
      f.position.copy(toWorld(e.p, beamY));
      f.rotation.y = yawFromDir2D(e.d);
      tg.add(f);
    }
    group.add(tg);
    parts.push(part(tg, [0, 0, 0], 'Flight tube (in pole gap)',
      'Flattened non-magnetic stainless-steel vacuum chamber that passes between the poles; the analyser side is held at ~10⁻⁹ mbar by ion pumps so scattering does not degrade abundance sensitivity.', { order: 0.5 }));
  }

  // Hall probe on the inner side, mid-sector
  const hp = new THREE.Group();
  const pIn = [sector.C[0] + (R - sector.w * 0.6) * Math.sin(midTh), sector.C[1] - (R - sector.w * 0.6) * Math.cos(midTh)];
  const pOut = [sector.C[0] + (R - sector.w - 0.12) * Math.sin(midTh), sector.C[1] - (R - sector.w - 0.12) * Math.cos(midTh)];
  const a = toWorld(pIn, beamY + gap * 0.3), b = toWorld(pOut, beamY + gap * 0.3);
  hp.add(rod(a, b, 0.0025, M.peek()));
  const head = mesh(new THREE.BoxGeometry(0.02, 0.014, 0.03), M.black(), { name: 'Hall probe head' });
  head.position.copy(b);
  head.rotation.y = yawFromDir2D([pOut[0] - pIn[0], pOut[1] - pIn[1]]);
  hp.add(head);
  group.add(hp);
  parts.push(part(hp, [-outwardW.x * R * 0.4, 0.02, -outwardW.z * R * 0.4], 'Hall probe',
    'Measures B in the gap for closed-loop field regulation and mass calibration. Field stability of ppm/hour is required for stable peak centres.', { order: 0.6 }));

  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  return { group, parts, length: Math.max(size.x, size.z), halves, outward: outwardW };
}
