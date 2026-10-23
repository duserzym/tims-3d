// Daly detector (Daly, 1960, Rev. Sci. Instrum. 31, 264).
//
// Local frame: ions arrive travelling along +Z and pass the entrance aperture at the
// origin. They strike a polished aluminium "knob" (conversion dynode, −20…−35 kV) at
// z ≈ 46 mm. Secondary electrons are accelerated sideways (+X) to a grounded, aluminised
// plastic scintillator mounted on a quartz vacuum window. The light crosses the window to
// a photomultiplier tube (PMT) that sits OUTSIDE the vacuum along +X — so ions never touch
// the multiplying surfaces. +Y is up; the knob's HV feed comes from below (−Y).
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, roundedBox, plateWithSlit, plateWithHole, rod, cfFlange, tubeShell, mergeGeometries } from '../core/geom.js';
import { part } from './parts.js';

const mm = 1e-3;

/** Simple flange without individual bolt meshes (for lite detail). */
function plainFlange(od, t, bore, mat) {
  return mesh(plateWithHole(od, od, t, bore / 2, { round: true }), mat, { name: 'CF flange' });
}

export function buildDaly({ detail = 'full' } = {}) {
  const full = detail === 'full';
  const group = new THREE.Group();
  group.name = 'Daly detector';
  const parts = [];
  const markers = {};
  const mark = (name, parent, pos) => {
    const o = new THREE.Object3D();
    o.name = 'anchor:' + name;
    o.position.copy(pos);
    parent.add(o);
    markers[name] = o;
    return o;
  };

  const KNOB_Z = 46 * mm;
  const SCINT_X = 36 * mm;

  // ── vacuum housing (box chamber with a side port to the window flange) ──
  const housing = new THREE.Group();
  housing.name = 'vacuum housing';
  {
    const W = 64 * mm, H = 64 * mm, D = 78 * mm, t = 2 * mm;
    const zc = 36 * mm;
    const mat = M.steelBrushed();
    // 5 walls (open on +X where the window port is, open front with aperture plate)
    const top = mesh(roundedBox(W, t, D, 1 * mm), mat); top.position.set(0, H / 2, zc);
    const bot = mesh(roundedBox(W, t, D, 1 * mm), mat); bot.position.set(0, -H / 2, zc);
    const left = mesh(roundedBox(t, H, D, 1 * mm), mat); left.position.set(-W / 2, 0, zc);
    const back = mesh(roundedBox(W, H, t, 1 * mm), mat); back.position.set(0, 0, zc + D / 2);
    // right wall with a round port
    const right = mesh(plateWithHole(D, H, t, 19 * mm), mat);
    right.rotation.y = Math.PI / 2; right.position.set(W / 2, 0, zc);
    housing.add(top, bot, left, back, right);
    if (full) {
      // front entrance flange (CF 2.75") on the chamber
      const fr = cfFlange(70 * mm, 6 * mm, 16 * mm, 6, M.steel(), M.steelPolished());
      fr.position.set(0, 0, zc - D / 2 - 3 * mm);
      housing.add(fr);
      // pumping port stub on top-left
      const stub = mesh(tubeShell(9 * mm, 8 * mm, 14 * mm), mat);
      stub.position.set(-14 * mm, H / 2 + 7 * mm, zc + 10 * mm);
      housing.add(stub);
    } else {
      const fr = plainFlange(70 * mm, 6 * mm, 16 * mm, M.steel());
      fr.position.set(0, 0, zc - D / 2 - 3 * mm);
      housing.add(fr);
    }
  }
  group.add(housing);
  parts.push(part(housing, [0, 105 * mm, 0], 'Detector vacuum chamber',
    'Grounded stainless-steel chamber behind the collector array, at analyser vacuum (~10⁻⁸–10⁻⁹ mbar). Only the knob and scintillator are inside the vacuum; the PMT is outside.', { order: 0, shell: true }));

  // ── entrance aperture ──
  const aperture = new THREE.Group();
  {
    const plate = mesh(plateWithSlit(40 * mm, 40 * mm, 1 * mm, 2.0 * mm, 12 * mm), M.steelPolished(), { name: 'entrance slit plate' });
    plate.position.z = 2 * mm;
    aperture.add(plate);
  }
  group.add(aperture);
  mark('entry', aperture, new THREE.Vector3(0, 0, 0));
  parts.push(part(aperture, [0, 0, -40 * mm], 'Entrance aperture (defining slit)',
    'Grounded slit (here 2 mm) that admits only the selected mass. In TIMS the Daly sits behind the multicollector, often behind a WARP/RPQ energy filter that improves abundance sensitivity.', { order: 0.15 }));

  // ── steering/deflector plates (full) ──
  if (full) {
    const defl = new THREE.Group();
    for (const s of [-1, 1]) {
      const p = mesh(roundedBox(1 * mm, 14 * mm, 12 * mm, 0.3 * mm), M.steelPolished(), { name: 'deflector plate' });
      p.position.set(s * 6 * mm, 0, 14 * mm);
      defl.add(p);
      const st = rod(new THREE.Vector3(s * 6 * mm, -7 * mm, 14 * mm), new THREE.Vector3(s * 6 * mm, -31 * mm, 14 * mm), 1.2 * mm, M.alumina());
      defl.add(st);
    }
    group.add(defl);
    parts.push(part(defl, [0, -10 * mm, -24 * mm], 'Beam deflector plates',
      'Small ±V plates steer the beam onto the knob and can deflect it away entirely to protect the detector during large-beam peak jumps.', { order: 0.25 }));
  }

  // ── knob (conversion dynode) on a ceramic standoff ──
  const knobAsm = new THREE.Group();
  {
    // knob: Al cylinder with a polished domed face angled ~45° (faces the beam and the scintillator)
    const knob = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(6 * mm, 6 * mm, 10 * mm, 48), M.aluminium(), { name: 'knob body' });
    const dome = mesh(new THREE.SphereGeometry(6 * mm, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.aluminiumMirror(), { name: 'knob face' });
    dome.scale.y = 0.45;
    dome.position.y = 5 * mm;
    knob.add(body, dome);
    // orient knob axis (+Y local) to point toward (−Z, +X): normal bisecting incoming beam and scintillator
    const axis = new THREE.Vector3(1, 0, -1).normalize();
    knob.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    knob.position.set(-2 * mm, 0, KNOB_Z + 4 * mm);
    knobAsm.add(knob);
    // stem + ceramic standoff + HV lead
    knobAsm.add(rod(new THREE.Vector3(-4 * mm, -3 * mm, KNOB_Z + 6 * mm), new THREE.Vector3(-4 * mm, -16 * mm, KNOB_Z + 6 * mm), 2 * mm, M.steelPolished()));
    const cer = mesh(new THREE.CylinderGeometry(4.5 * mm, 5.5 * mm, 13 * mm, 32), M.alumina(), { name: 'HV ceramic standoff' });
    cer.position.set(-4 * mm, -22 * mm, KNOB_Z + 6 * mm);
    knobAsm.add(cer);
    if (full) {
      for (let i = 0; i < 4; i++) {
        const sk = mesh(new THREE.TorusGeometry(5.2 * mm, 0.7 * mm, 8, 32), M.alumina());
        sk.rotation.x = Math.PI / 2;
        sk.position.set(-4 * mm, -26 * mm + i * 2.6 * mm, KNOB_Z + 6 * mm);
        knobAsm.add(sk);
      }
    }
    mark('knob', knobAsm, new THREE.Vector3(0, 0, KNOB_Z + 1 * mm));
  }
  group.add(knobAsm);
  parts.push(part(knobAsm, [-28 * mm, -18 * mm, 18 * mm], 'Daly knob (conversion dynode, −20…−35 kV)',
    'Polished aluminium electrode. Each positive ion arrives with ≈(acceleration + knob) keV and ejects several secondary electrons (kinetic emission, yield ∝ ion velocity). The same field that pulls ions in repels the electrons toward the grounded scintillator.', { order: 0.45 }));

  // ── HV feedthrough (bottom flange) ──
  const hv = new THREE.Group();
  {
    const fl = full ? cfFlange(54 * mm, 5 * mm, 8 * mm, 6, M.steel(), M.steelPolished()) : plainFlange(54 * mm, 5 * mm, 8 * mm, M.steel());
    fl.rotation.x = Math.PI / 2;
    fl.position.set(-4 * mm, -34.5 * mm, KNOB_Z + 6 * mm);
    hv.add(fl);
    const ins = mesh(new THREE.CylinderGeometry(4 * mm, 4 * mm, 22 * mm, 24), M.alumina(), { name: 'feedthrough insulator' });
    ins.position.set(-4 * mm, -46 * mm, KNOB_Z + 6 * mm);
    hv.add(ins);
    const cap = mesh(new THREE.CylinderGeometry(5 * mm, 5 * mm, 8 * mm, 24), M.black(), { name: 'SHV connector' });
    cap.position.set(-4 * mm, -60 * mm, KNOB_Z + 6 * mm);
    hv.add(cap);
  }
  group.add(hv);
  parts.push(part(hv, [-28 * mm, -55 * mm, 18 * mm], 'HV feedthrough (SHV)',
    'Ceramic-insulated vacuum feedthrough delivering −20 to −35 kV to the knob from an ultra-stable supply.', { order: 0.35 }));

  // ── scintillator on window flange ──
  const scintAsm = new THREE.Group();
  {
    const sc = mesh(new THREE.CylinderGeometry(12 * mm, 12 * mm, 2 * mm, 48), M.scintillator(), { name: 'plastic scintillator' });
    sc.rotation.z = Math.PI / 2;
    sc.position.set(SCINT_X, 0, KNOB_Z);
    const al = mesh(new THREE.CylinderGeometry(12 * mm, 12 * mm, 0.15 * mm, 48), M.aluminiumMirror(), { name: 'aluminium film' });
    al.rotation.z = Math.PI / 2;
    al.position.set(SCINT_X - 1.1 * mm, 0, KNOB_Z);
    scintAsm.add(sc, al);
    mark('scint', scintAsm, new THREE.Vector3(SCINT_X - 1.2 * mm, 0, KNOB_Z));
  }
  group.add(scintAsm);
  parts.push(part(scintAsm, [14 * mm, 22 * mm, 0], 'Aluminised plastic scintillator',
    'Fast plastic scintillator at ground. The thin Al film reflects light forward, drains charge and stops scattered ions/UV. A ~25–30 keV electron produces hundreds of photons, so every ion becomes a large light pulse.', { order: 0.55 }));

  const windowAsm = new THREE.Group();
  {
    const win = mesh(new THREE.CylinderGeometry(17 * mm, 17 * mm, 4 * mm, 48), M.quartz(), { name: 'quartz window' });
    win.rotation.z = Math.PI / 2;
    win.position.set(SCINT_X + 3 * mm, 0, KNOB_Z);
    windowAsm.add(win);
    const fl = full ? cfFlange(70 * mm, 6 * mm, 36 * mm, 6, M.steel(), M.steelPolished()) : plainFlange(70 * mm, 6 * mm, 36 * mm, M.steel());
    fl.rotation.y = Math.PI / 2;
    fl.position.set(SCINT_X + 4 * mm, 0, KNOB_Z);
    windowAsm.add(fl);
  }
  group.add(windowAsm);
  parts.push(part(windowAsm, [36 * mm, 0, 0], 'Vacuum window (CF flange)',
    'Fused-silica/glass viewport sealing the analyser vacuum. Photons cross it to the PMT, so the PMT can be serviced without venting and is never exposed to ions.', { order: 0.65 }));

  // ── photomultiplier tube (outside vacuum) ──
  const PMT_X0 = SCINT_X + 9 * mm, PMT_L = 78 * mm, PMT_R = 14 * mm;
  const pmt = new THREE.Group();
  pmt.name = 'PMT';
  {
    const glass = mesh(new THREE.CylinderGeometry(PMT_R, PMT_R, PMT_L, 48, 1, true), M.glass(), { name: 'PMT glass envelope', cast: false });
    glass.rotation.z = Math.PI / 2;
    glass.position.set(PMT_X0 + PMT_L / 2, 0, KNOB_Z);
    const face = mesh(new THREE.CylinderGeometry(PMT_R, PMT_R, 1.2 * mm, 48), M.glass(), { cast: false });
    face.rotation.z = Math.PI / 2;
    face.position.set(PMT_X0, 0, KNOB_Z);
    const cath = mesh(new THREE.CylinderGeometry(PMT_R * 0.86, PMT_R * 0.86, 0.3 * mm, 48), M.photocathode(), { name: 'photocathode' });
    cath.rotation.z = Math.PI / 2;
    cath.position.set(PMT_X0 + 1 * mm, 0, KNOB_Z);
    pmt.add(glass, face, cath);
    parts.push(part(glass, [0, 24 * mm, 0], 'PMT glass envelope', 'The evacuated envelope contains the photocathode, focusing optics, dynodes and anode.', { order: 0.35, shell: true }));
    parts.push(part(cath, [-8 * mm, 0, 0], 'PMT photocathode', 'Photons can release photoelectrons. This optical conversion has a finite quantum efficiency before multiplication begins.', { order: 0.7 }));
    mark('pmtCathode', cath, new THREE.Vector3(0, 0, 0));
    // focusing electrode
    const foc = mesh(tubeShell(9 * mm, 8.4 * mm, 8 * mm, 32), M.steelPolished(), { name: 'focusing electrode' });
    foc.rotation.z = Math.PI / 2;
    foc.position.set(PMT_X0 + 10 * mm, 0, KNOB_Z);
    pmt.add(foc);
    // dynode chain: 10 linear-focused dynodes, staggered
    const nD = full ? 10 : 6;
    markers.pmtDynodes = [];
    for (let i = 0; i < nD; i++) {
      const g = new THREE.CylinderGeometry(4 * mm, 4 * mm, 9 * mm, 12, 1, true, 0, Math.PI * 0.7);
      const m4 = new THREE.Matrix4();
      const sgn = i % 2 ? 1 : -1;
      const x = PMT_X0 + 18 * mm + i * (44 * mm / (nD - 1));
      const rot = new THREE.Matrix4().makeRotationY(sgn > 0 ? Math.PI * 0.15 : Math.PI * 1.15);
      m4.makeTranslation(x, 0, KNOB_Z + sgn * 2.5 * mm).multiply(rot);
      g.applyMatrix4(m4);
      const dynode = mesh(g, M.dynode(), { name: `PMT dynode ${i + 1}` });
      pmt.add(dynode);
      parts.push(part(dynode, [0, (i % 2 ? 1 : -1) * 8 * mm, (i - nD / 2) * 1.2 * mm], `PMT dynode ${i + 1}`, 'Each electron impact produces secondary electrons. The HV divider sets successive accelerating potentials; the stage yields multiply to produce the PMT gain.', { order: 0.82 }));
      const o = new THREE.Object3D();
      o.position.set(x, 0, KNOB_Z + sgn * 1.6 * mm);
      dynode.add(o);
      markers.pmtDynodes.push(o);
    }

    const anode = mesh(roundedBox(1 * mm, 8 * mm, 7 * mm, 0.3 * mm), M.steelPolished(), { name: 'anode' });
    anode.position.set(PMT_X0 + 68 * mm, 0, KNOB_Z);
    pmt.add(anode);
    mark('pmtAnode', pmt, new THREE.Vector3(PMT_X0 + 67 * mm, 0, KNOB_Z));
  }
  group.add(pmt);
  parts.push(part(pmt, [70 * mm, 0, 0], 'Photomultiplier tube (outside vacuum)',
    'Bialkali photocathode converts the light flash into tens of photoelectrons; ~10 dynodes multiply them ~10⁶×. Because only light enters the PMT, its gain is not degraded by ion bombardment — the main reason Daly detectors are so stable.', { order: 0.8 }));

  // ── mu-metal shield ──
  const shield = new THREE.Group();
  {
    const tube = mesh(tubeShell(17.5 * mm, 16.8 * mm, PMT_L + 4 * mm, 48), M.steel(), { name: 'mu-metal shield' });
    tube.rotation.z = Math.PI / 2;
    tube.position.set(PMT_X0 + PMT_L / 2, 0, KNOB_Z);
    shield.add(tube);
  }
  group.add(shield);
  parts.push(part(shield, [60 * mm, 50 * mm, 0], 'Mu-metal magnetic shield',
    'High-permeability tube shielding the PMT from the analyser magnet’s stray field, which would otherwise deflect photoelectrons and change gain with magnet setting.', { order: 0.7, shell: true }));

  // ── base / socket with divider ──
  const base = new THREE.Group();
  {
    const x0 = PMT_X0 + PMT_L + 2 * mm;
    const body = mesh(new THREE.CylinderGeometry(17 * mm, 17 * mm, 22 * mm, 40), M.black(), { name: 'PMT base' });
    body.rotation.z = Math.PI / 2;
    body.position.set(x0 + 11 * mm, 0, KNOB_Z);
    base.add(body);
    if (full) {
      const pcb = mesh(roundedBox(20 * mm, 1.2 * mm, 22 * mm, 0.4 * mm), M.pcb(), { name: 'divider board' });
      pcb.position.set(x0 + 12 * mm, 20 * mm, KNOB_Z);
      base.add(pcb);
      const rg = [];
      for (let i = 0; i < 10; i++) {
        const g = new THREE.CylinderGeometry(0.9 * mm, 0.9 * mm, 4 * mm, 10);
        g.rotateZ(Math.PI / 2);
        g.translate(x0 + 6 * mm + (i % 2) * 8 * mm, 21.5 * mm, KNOB_Z - 9 * mm + Math.floor(i / 2) * 4.4 * mm);
        rg.push(g);
      }
      base.add(mesh(mergeGeometries(rg), M.resistorBody(), { name: 'divider resistors' }));
      for (const [dz, c] of [[-6 * mm, M.gold()], [6 * mm, M.steelPolished()]]) {
        const bnc = mesh(new THREE.CylinderGeometry(3 * mm, 3 * mm, 10 * mm, 20), c, { name: 'connector' });
        bnc.rotation.z = Math.PI / 2;
        bnc.position.set(x0 + 27 * mm, 0, KNOB_Z + dz);
        base.add(bnc);
      }
    }
  }
  group.add(base);
  parts.push(part(base, [110 * mm, 0, 0], 'PMT base: voltage divider + pulse output',
    'Resistor chain sets the inter-dynode voltages (~1–1.5 kV total). The anode pulse goes to a fast preamplifier–discriminator and counter (dead time typically 20–35 ns).', { order: 0.9 }));

  const anchors = {
    entry: new THREE.Vector3(0, 0, 0),
    knob: new THREE.Vector3(0, 0, KNOB_Z + 1 * mm),
    scint: new THREE.Vector3(SCINT_X - 1.2 * mm, 0, KNOB_Z),
    pmtCathode: new THREE.Vector3(PMT_X0 + 1.4 * mm, 0, KNOB_Z),
    pmtAnode: new THREE.Vector3(PMT_X0 + 67 * mm, 0, KNOB_Z),
  };
  return { group, parts, anchors, markers, length: PMT_X0 + PMT_L + 30 * mm };
}
