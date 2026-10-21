// Application shell: renderer, camera/controls, environment, labels, picking, x-ray,
// bloom, explode slider, and scene lifecycle.
//
// Scene module contract (src/scenes/*.js):
//   export default {
//     id, title, group, icon, blurb,
//     async create(ctx) {
//       return {
//         root: THREE.Object3D,           // added to the scene
//         exploder?: Exploder,            // driven by the global Explode slider
//         camera?: {position, target, fov?},
//         scale?: number,                 // characteristic size (m): grid, shadows, near/far
//         panel?: HTMLElement[],          // cards for the right-hand panel
//         update?(dt, t), onExplode?(t), dispose?()
//       };
//     }
//   }
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ghostOf } from './materials.js';
import { h } from './ui.js';

export class App {
  constructor({ viewport, panel, onSceneTitle }) {
    this.viewport = viewport;
    this.panelEl = panel;
    this.onSceneTitle = onSceneTitle;
    this.clock = new THREE.Clock();
    this.state = { labels: true, xray: false, beams: true, bloom: true, explode: 0, animate: false };

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    viewport.prepend(r.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    viewport.append(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    // vignette background (the bloom composer renders opaque, so use a scene background)
    {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 512;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, '#2b3646'); grd.addColorStop(0.55, '#171e28'); grd.addColorStop(1, '#0c1016');
      g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = tex;
    }

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    // lights
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x2a2f38, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0x9fc3ff, 0.45);
    this.scene.add(this.fill);

    // floor
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.28 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid = null;

    // post
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // picking
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoverBox = new THREE.BoxHelper(undefined, 0xffd166);
    this.hoverBox.visible = false;
    this.hoverBox.material.depthTest = false;
    this.hoverBox.renderOrder = 50;
    this.selBox = new THREE.BoxHelper(undefined, 0x6aa2ff);
    this.selBox.visible = false;
    this.selBox.material.depthTest = false;
    this.selBox.renderOrder = 51;
    this.scene.add(this.hoverBox, this.selBox);
    this.tooltip = viewport.querySelector('#tooltip');
    this._bindPointer();

    this.ghostCache = new WeakMap();
    this.current = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(viewport);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.viewport.clientWidth, hgt = this.viewport.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt);
    this.labelRenderer.setSize(w, hgt);
    this.composer.setSize(w, hgt);
    this.bloom.setSize(w, hgt);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  setLoading(text) {
    const el = this.viewport.querySelector('#loading');
    if (!el) return;
    el.classList.toggle('hidden', !text);
    if (text) el.querySelector('#loadingText').textContent = text;
  }

  /** Attach a CSS label to an object. */
  label(obj, text, { sub = '', offset = [0, 0, 0], className = '', onClick = null } = {}) {
    const div = h('div', { class: 'lbl ' + className, html: text + (sub ? `<small>${sub}</small>` : '') });
    const lbl = new CSS2DObject(div);
    lbl.position.set(...offset);
    lbl.center.set(0.5, 1);
    obj.add(lbl);
    div.addEventListener('pointerdown', (e) => e.stopPropagation());
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onClick) onClick();
      else this.select(this._partOf(obj));
    });
    return lbl;
  }

  overlay(el) {
    this.viewport.querySelectorAll('.overlay-legend').forEach((e) => e.remove());
    if (el) { el.classList.add('overlay-legend'); this.viewport.append(el); }
  }

  async loadScene(def, { explode = 0 } = {}) {
    this.setLoading('Building ' + def.title + '…');
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    this.unloadScene();
    const ctx = { app: this, THREE, label: (...a) => this.label(...a), setLoading: (t) => this.setLoading(t), overlay: (el) => this.overlay(el) };
    let inst;
    try {
      inst = await def.create(ctx);
    } catch (err) {
      console.error(err);
      this.setLoading(null);
      this.panelEl.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'card-b' }, h('p', {}, 'Failed to build scene: ' + err.message))));
      return;
    }
    this.current = { def, ...inst };
    this.scene.add(inst.root);
    this.onSceneTitle && this.onSceneTitle(def);
    this.panelEl.replaceChildren(...(inst.panel || []));
    this._selCard = null;
    this._configureStage(inst);
    // per-scene defaults; X-ray resets to off unless the scene asks for it
    const d = { xray: false, ...(inst.defaults || {}) };
    for (const k of ['xray', 'labels', 'beams', 'bloom']) if (k in d) this.state[k] = d[k];
    this.setLabels(this.state.labels);
    this.onStateSync && this.onStateSync();
    this.setExplode(explode);
    this.applyXray();
    this.applyBeams();
    this.setLoading(null);
  }

  unloadScene() {
    if (!this.current) return;
    this.current.dispose && this.current.dispose();
    this.scene.remove(this.current.root);
    this.current.root.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      if (o.geometry) o.geometry.dispose();
    });
    this.overlay(null);
    this.hoverBox.visible = this.selBox.visible = false;
    this.selected = null;
    this.current = null;
  }

  _configureStage(inst) {
    const box = new THREE.Box3().setFromObject(inst.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = inst.scale ?? Math.max(size.x, size.y, size.z, 0.01);
    this.stageScale = s;
    this.camera.near = s / 400;
    this.camera.far = s * 60;
    this.camera.fov = inst.camera?.fov ?? 40;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = s * 0.05;
    this.controls.maxDistance = s * 12;
    // floor & grid
    const fy = isFinite(box.min.y) ? box.min.y - s * 0.002 : 0;
    this.floor.position.set(center.x, fy, center.z);
    this.floor.scale.set(s * 8, s * 8, 1);
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); }
    this.grid = new THREE.GridHelper(s * 6, 30, 0x5d6b80, 0x354152);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.22;
    this.grid.position.set(center.x, fy + s * 0.0005, center.z);
    this.scene.add(this.grid);
    // shadows
    this.sun.position.set(center.x + s * 1.2, center.y + s * 2.2, center.z + s * 1.4);
    this.sun.target.position.copy(center);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -s * 1.6; sc.right = sc.top = s * 1.6; sc.near = s * 0.1; sc.far = s * 8;
    sc.updateProjectionMatrix();
    this.fill.position.set(center.x - s * 2, center.y + s, center.z - s);
    this.home = inst.camera
      ? { pos: new THREE.Vector3(...inst.camera.position), target: new THREE.Vector3(...inst.camera.target) }
      : { pos: center.clone().add(new THREE.Vector3(s * 0.9, s * 0.7, s * 1.2)), target: center.clone() };
    this.resetView();
  }

  resetView() {
    if (!this.home) return;
    this.camera.position.copy(this.home.pos);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  /** Smoothly fly the camera. */
  flyTo(pos, target, ms = 900) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
    const start = performance.now();
    this._fly = (now) => {
      const u = Math.min(1, (now - start) / ms);
      const e = u * u * (3 - 2 * u);
      this.camera.position.lerpVectors(p0, p1, e);
      this.controls.target.lerpVectors(t0, t1, e);
      if (u >= 1) this._fly = null;
    };
  }

  setExplode(t) {
    this.state.explode = t;
    this.current?.exploder?.set(t);
    this.current?.onExplode?.(t);
    if (this.selected) this.selBox.setFromObject(this.selected);
    this.onExplodeChange && this.onExplodeChange(t);
  }

  setLabels(on) { this.state.labels = on; this.viewport.classList.toggle('hide-labels', !on); }
  setXray(on) { this.state.xray = on; this.applyXray(); }
  setBeams(on) { this.state.beams = on; this.applyBeams(); }
  setBloom(on) { this.state.bloom = on; }

  applyBeams() {
    this.current?.root.traverse((o) => { if (o.userData.beam) o.visible = this.state.beams; });
  }

  applyXray() {
    if (!this.current) return;
    const on = this.state.xray;
    this.current.root.traverse((o) => {
      if (!o.isMesh) return;
      let shell = false;
      for (let p = o; p; p = p.parent) if (p.userData.shell) { shell = true; break; }
      if (!shell) return;
      if (on) {
        if (!o.userData._mat) o.userData._mat = o.material;
        let g = this.ghostCache.get(o.userData._mat);
        if (!g) { g = ghostOf(o.userData._mat); this.ghostCache.set(o.userData._mat, g); }
        o.material = g;
        o.castShadow = false;
      } else if (o.userData._mat) {
        o.material = o.userData._mat;
        o.castShadow = true;
      }
    });
  }

  _partOf(obj) {
    for (let p = obj; p; p = p.parent) if (p.userData.part) return p;
    return null;
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    let downAt = null;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._pointerPx = [e.clientX - r.left, e.clientY - r.top];
      this._needsPick = true;
    });
    el.addEventListener('pointerleave', () => { this.hoverBox.visible = false; this.tooltip.classList.add('hidden'); this.hovered = null; });
    el.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved < 5) this.select(this.hovered);
    });
  }

  _pick() {
    if (!this.current) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.current.root, true);
    let part = null;
    for (const hit of hits) {
      if (!hit.object.visible || hit.object.userData.beam || hit.object.isPoints || hit.object.isLine) continue;
      if (this.state.xray) {
        let shell = false;
        for (let p = hit.object; p; p = p.parent) if (p.userData.shell) { shell = true; break; }
        if (shell) continue;
      }
      part = this._partOf(hit.object);
      if (part) break;
    }
    this.hovered = part;
    if (part) {
      this.hoverBox.setFromObject(part);
      this.hoverBox.visible = true;
      const { name, info } = part.userData.part;
      this.tooltip.innerHTML = `<b>${name}</b>${info ? '<br>' + info : ''}`;
      this.tooltip.classList.remove('hidden');
      const [x, y] = this._pointerPx;
      const W = this.viewport.clientWidth;
      this.tooltip.style.left = Math.min(x + 14, W - 310) + 'px';
      this.tooltip.style.top = y + 14 + 'px';
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.hoverBox.visible = false;
      this.tooltip.classList.add('hidden');
      this.renderer.domElement.style.cursor = '';
    }
  }

  select(part) {
    this.selected = part;
    if (!part) { this.selBox.visible = false; if (this._selCard) this._selCard.remove(); this._selCard = null; return; }
    this.selBox.setFromObject(part);
    this.selBox.visible = true;
    const { name, info } = part.userData.part;
    if (this._selCard) this._selCard.remove();
    this._selCard = h('div', { class: 'card' },
      h('div', { class: 'card-h' }, '◎ ', name, h('button', { class: 'btn', style: 'margin-left:auto', onclick: () => this.select(null) }, '×')),
      h('div', { class: 'card-b' }, h('p', { html: info || '—' }),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => this.focusOn(part) }, 'Focus camera'))));
    this.panelEl.prepend(this._selCard);
    this.current?.onSelect?.(part);
  }

  focusOn(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length(), this.stageScale * 0.05);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const p = c.clone().addScaledVector(dir, r * 1.8);
    this.flyTo(p.toArray(), c.toArray());
  }

  screenshot() {
    this.render();
    const url = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `tims3d-${this.current?.def.id ?? 'scene'}.png`;
    a.click();
  }

  render() {
    if (this.state.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this._fly) this._fly(performance.now());
    if (this.state.animate) {
      const u = (Math.sin(t * 0.6) + 1) / 2;
      this.setExplode(u);
    }
    this.controls.update();
    if (this.current) {
      this.current.update && this.current.update(dt, t);
      if (this.state.beams) this.current.root.traverse((o) => { if (o.userData.beam && o.update) o.update(dt); });
    }
    if (this._needsPick) { this._needsPick = false; this._pick(); }
    if (this.hoverBox.visible && this.hovered) this.hoverBox.setFromObject(this.hovered);
    if (this.selBox.visible && this.selected) this.selBox.setFromObject(this.selected);
    this.render();
  }
}
