// Discrete-dynode secondary electron multiplier (SEM, "ion counter").
//
// Local frame: ions arrive travelling along +Z through the entrance aperture at the origin.
// variant 'discrete': ions strike the first dynode directly (ETP-style, ~21 curved
//   dynodes in a staggered "venetian" zig-zag between ceramic side rails, resistor
//   divider, anode with SMA output).
// variant 'conversion': ions strike an off-axis conversion dynode held at several kV;
//   the secondary electrons are drawn into a compact multiplier mounted at 90° (+X),
//   as in the Isotopx MIC / Sjuts-type counters. This keeps the multiplier out of the
//   direct ion path and raises the ion impact energy (better yield, smaller mass bias).
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, roundedBox, plateWithSlit, rod, mergeGeometries } from '../core/geom.js';
import { part } from './parts.js';

const mm = 1e-3;

/** Dynode chain along local +Z, first dynode at z0. Returns group + dynode positions. */
function buildChain({ n = 21, z0 = 8 * mm, pitch = 3 * mm, full = true, first = true }) {
  const g = new THREE.Group();
  const positions = [];
  const geoms = [];
  const r = 2.6 * mm, hgt = 10 * mm;
  const dynodeMeshes = [];
  for (let i = 0; i < n; i++) {
    const side = i === 0 && first ? 0 : (i % 2 ? 1 : -1);
    const x = side * 2.8 * mm;
    const z = z0 + i * pitch;
    const thc = side >= 0 ? (135 * Math.PI) / 180 : (225 * Math.PI) / 180;
    const len = (110 * Math.PI) / 180;
    const geo = new THREE.CylinderGeometry(i === 0 && first ? r * 1.4 : r, i === 0 && first ? r * 1.4 : r, hgt, 14, 1, true, thc - len / 2, len);
    const rr = i === 0 && first ? r * 1.4 : r;
    const cx = x - rr * Math.sin(thc), cz = z - rr * Math.cos(thc);
    geo.translate(cx, 0, cz);
    positions.push(new THREE.Vector3(x - 0.6 * mm * Math.sin(thc), 0, z - 0.6 * mm * Math.cos(thc)));
    if (full) {
      const m = mesh(geo, M.dynode(), { name: `dynode ${i + 1}` });
      g.add(m);
      dynodeMeshes.push(m);
    } else geoms.push(geo);
  }
  if (!full) g.add(mesh(mergeGeometries(geoms), M.dynode(), { name: 'dynode stack' }));
  const zEnd = z0 + (n - 1) * pitch;
  return { g, positions, zEnd, dynodeMeshes };
}

export function buildSEM({ detail = 'full', variant = 'discrete' } = {}) {
  const full = detail === 'full';
  const conv = variant === 'conversion';
  const group = new THREE.Group();
  group.name = conv ? 'Conversion-dynode ion counter' : 'Discrete-dynode SEM';
  const parts = [];
  const N = 21;

  // ── entrance aperture ──
  const ent = mesh(plateWithSlit(24 * mm, 22 * mm, 0.8 * mm, 1.6 * mm, 8 * mm), M.steelPolished(), { name: 'entrance aperture' });
  ent.position.z = 0.4 * mm;
  group.add(ent);
  parts.push(part(ent, [0, 0, -28 * mm], 'Entrance aperture',
    'Grounded slit in front of the multiplier. In multicollector TIMS the ion counter sits behind the axial slit or in a movable “chimney” position of the array.', { order: 0.15 }));

  // ── multiplier body (chain + rails + resistors + anode) ──
  const mult = new THREE.Group();
  mult.name = 'multiplier';
  const chain = buildChain({ n: N, full, first: !conv, z0: conv ? 4 * mm : 8 * mm, pitch: conv ? 2.4 * mm : 3 * mm });
  mult.add(chain.g);
  const zEnd = chain.zEnd;
  const zMid = ((conv ? 4 * mm : 8 * mm) + zEnd) / 2;
  const railLen = zEnd - (conv ? 4 * mm : 8 * mm) + 12 * mm;
  const rails = new THREE.Group();
  for (const s of [-1, 1]) {
    const rail = mesh(roundedBox(14 * mm, 1.2 * mm, railLen, 0.4 * mm), M.alumina(), { name: 'ceramic side rail' });
    rail.position.set(0, s * 5.8 * mm, zMid);
    rails.add(rail);
  }
  mult.add(rails);
  const res = new THREE.Group();
  {
    const rg = [];
    for (let i = 0; i < N - 1; i++) {
      const p0 = chain.positions[i], p1 = chain.positions[i + 1];
      const geo = new THREE.CylinderGeometry(0.55 * mm, 0.55 * mm, 2.2 * mm, 8);
      geo.rotateX(Math.PI / 2);
      geo.translate(i % 2 ? 4.5 * mm : 2.5 * mm, 7.2 * mm, (p0.z + p1.z) / 2);
      rg.push(geo);
    }
    res.add(mesh(mergeGeometries(rg), M.resistorBody(), { name: 'divider resistors' }));
  }
  mult.add(res);
  const anode = mesh(roundedBox(6 * mm, 8 * mm, 0.8 * mm, 0.2 * mm), M.gold(), { name: 'anode' });
  anode.position.set(0, 0, zEnd + 3.5 * mm);
  mult.add(anode);

  // feedthroughs at the back of the chain
  const conns = new THREE.Group();
  {
    const sma = mesh(new THREE.CylinderGeometry(2.2 * mm, 2.2 * mm, 9 * mm, 20), M.gold(), { name: 'SMA signal connector' });
    sma.rotation.x = Math.PI / 2;
    sma.position.set(2.5 * mm, 0, zEnd + 12 * mm);
    const hv = mesh(new THREE.CylinderGeometry(2.6 * mm, 2.6 * mm, 9 * mm, 20), M.alumina(), { name: 'HV feedthrough' });
    hv.rotation.x = Math.PI / 2;
    hv.position.set(-3.5 * mm, 0, zEnd + 12 * mm);
    conns.add(sma, hv);
    if (full) conns.add(rod(new THREE.Vector3(2.5 * mm, 0, zEnd + 4 * mm), new THREE.Vector3(2.5 * mm, 0, zEnd + 8 * mm), 0.4 * mm, M.copper()));
  }
  mult.add(conns);

  // shield can
  const canLen = railLen + 14 * mm;
  const can = mesh(roundedBox(18 * mm, 17 * mm, canLen, 1.2 * mm), M.steelBrushed(), { name: 'shield can' });
  can.position.set(0, 0, zMid + 4 * mm);
  mult.add(can);

  let conversion = null;
  if (conv) {
    // rotate the multiplier 90° so its axis runs along +X, beside the ion path
    mult.rotation.y = Math.PI / 2;
    mult.position.set(7 * mm, 0, 16 * mm);
    const cd = new THREE.Group();
    const plate = mesh(roundedBox(1.5 * mm, 12 * mm, 10 * mm, 0.4 * mm), M.aluminiumMirror(), { name: 'conversion dynode' });
    plate.rotation.y = -Math.PI / 4;
    plate.position.set(-1 * mm, 0, 16 * mm);
    cd.add(plate);
    cd.add(rod(new THREE.Vector3(-3 * mm, -6 * mm, 18 * mm), new THREE.Vector3(-3 * mm, -14 * mm, 18 * mm), 1.6 * mm, M.alumina()));
    if (full) {
      const grid = mesh(roundedBox(0.3 * mm, 10 * mm, 8 * mm, 0.1 * mm), M.steelPolished(), { name: 'extraction grid' });
      grid.position.set(4 * mm, 0, 16 * mm);
      cd.add(grid);
    }
    group.add(cd);
    conversion = new THREE.Vector3(0, 0, 15.5 * mm);
    parts.push(part(cd, [-22 * mm, -10 * mm, 0], 'Conversion dynode (several kV)',
      'Off-axis electrode that converts each ion into secondary electrons at higher impact energy than a direct-impact first dynode; the electrons are pulled into the multiplier at 90°. Keeps the multiplier out of the ion path and reduces mass bias.', { order: 0.4 }));
  }
  group.add(mult);

  // explode: offsets of children of `mult` are in the multiplier's own frame (axis = +Z)
  mult.remove(can); group.add(can);
  mult.updateMatrix();
  can.position.applyMatrix4(mult.matrix);
  can.quaternion.premultiply(mult.quaternion);
  parts.push(part(can, [0, 42 * mm, 0], 'Shield can', 'Grounded stainless can that screens the multiplier from stray fields and confines the electron avalanche.', { order: 0, shell: true }));
  rails.children.forEach((rail, i) => {
    parts.push(part(rail, [0, (i ? 1 : -1) * 13 * mm, 0], 'Ceramic side rail', 'Alumina rails hold each dynode at its potential; ~2–3 kV in total across ~20 dynodes.', { order: 0.5 }));
  });
  const dynInfo = 'Curved Cu-Be / Al₂O₃-coated dynode. Each electron striking it releases δ≈2–3 secondaries; gain = δⁿ ≈ 10⁷–10⁸ for n≈20. The first dynode is hit by ions directly and ages with extracted charge.';
  if (full) {
    chain.dynodeMeshes.forEach((m, i) => {
      const side = i === 0 && !conv ? 0 : (i % 2 ? 1 : -1);
      parts.push(part(m, [side * 5 * mm, 0, (i - N / 2) * 0.9 * mm], `Dynode ${i + 1}`, dynInfo, { order: 0.6 + (i / N) * 0.2 }));
    });
  } else {
    parts.push(part(chain.g, [0, 0, 0], conv ? 'Multiplier dynode chain' : `Dynode chain (${N} discrete dynodes)`, dynInfo, { order: 0.6 }));
  }
  parts.push(part(res, [0, 26 * mm, 0], 'Resistor divider chain', 'On-board resistors set ~100–150 V between successive dynodes from one HV supply.', { order: 0.7 }));
  parts.push(part(anode, [0, 0, 14 * mm], 'Anode', 'Collects the ~10⁷–10⁸ electron avalanche: a ns-wide pulse sent to a fast discriminator/counter (dead time ≈ 20 ns).', { order: 0.75 }));
  parts.push(part(conns, [0, 0, 28 * mm], 'SMA signal + HV feedthroughs', 'Pulse output to the preamplifier–discriminator and HV input to the divider.', { order: 0.85 }));

  // anchors in group space
  mult.updateMatrix();
  const toG = (v) => v.clone().applyMatrix4(mult.matrix);
  const dynodes = chain.positions.map(toG);
  const anchors = {
    entry: new THREE.Vector3(0, 0, 0),
    conversion,
    dynodes,
    anode: toG(new THREE.Vector3(0, 0, zEnd + 3.2 * mm)),
  };
  // live markers that follow the exploded chain
  const markers = { dynodes: [], anode: null };
  chain.positions.forEach((p, i) => {
    const o = new THREE.Object3D(); o.position.copy(p);
    (full ? chain.dynodeMeshes[i] : chain.g).add(o);
    markers.dynodes.push(o);
  });
  { const o = new THREE.Object3D(); anode.add(o); markers.anode = o; }
  return { group, parts, anchors, markers, length: conv ? 7 * mm + zEnd + 20 * mm : zEnd + 20 * mm, dynodeMeshes: chain.dynodeMeshes };
}
