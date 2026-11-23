// Viberich 3D scene: a ```scene3d block (JSON) becomes a three.js scene with animated steps, per-part explanations,
// comments pinned to a part (they join the document's normal threads) and an editor that saves a new block version.
// JSON coordinates are mm with Z up (CAD convention); glTF is metres with Y up: mm(x,y,z) -> (x, z, -y)/1000.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const API = window.V3DAPI; const SLUG = API.slug;
const CACHE = new Map();            // url -> Promise<gltf>
const VIEWS = new Map();            // block -> viewer
const loader = new GLTFLoader();
const mmV = (p) => new THREE.Vector3(p[0], p[2], -p[1]).multiplyScalar(0.001);
const mmD = (p) => new THREE.Vector3(p[0], p[2], -p[1]).multiplyScalar(0.001);
const toMm = (v) => [Math.round(v.x * 1000), Math.round(-v.z * 1000), Math.round(v.y * 1000)];
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mark = (n) => String(n || '').split(/[_ :(]/)[0];
const matches = (name, k) => name === k || name.startsWith(k + '_') || name.startsWith(k + ':') || name.startsWith(k + ' ');
const modelUrl = (m) => (/^(https?:)?\//.test(m) ? m : `/m/${SLUG}/${encodeURIComponent(m)}`);
function loadModel(url) {
  if (!CACHE.has(url)) CACHE.set(url, new Promise((ok, error) => loader.load(url, (g) => {
    const nodes = g.parser.json.nodes || [];
    g.scene.traverse((o) => { const a = g.parser.associations.get(o); o.userData.name = a && a.nodes != null && nodes[a.nodes] ? nodes[a.nodes].name || o.name : o.name; });
    ok(g); }, undefined, error)));
  return CACHE.get(url);
}

class Scene {
  constructor(block, cfg, mdBlock) {
    this.block = block; this.cfg = cfg; this.md = mdBlock; this.step = 0; this.editing = false; this.sel = null; this.tour = false;
    this.root = document.createElement('div'); this.root.className = 'v3d'; this.root.contentEditable = 'false';
    this.root.innerHTML = `
      <div class="v3d-top"><b class="v3d-tit"></b><span class="v3d-spacer"></span>
        <button data-a="tour" title="Plays the steps by itself">▶ Tour</button>
        <button data-a="prev" title="Previous step">‹</button><span class="v3d-n"></span><button data-a="next" title="Next step">›</button>
        <label title="Pulls the assemblies apart to see inside">Explode <input type="range" min="0" max="100" value="0" data-a="exp"></label>
        <button data-a="ed" title="Edit the scene: views, steps, notes and explanations. Saves a new version of the block">Edit</button>
        <button data-a="full" title="Full screen">⛶</button></div>
      <div class="v3d-body"><div class="v3d-view"><canvas></canvas><div class="v3d-labels"></div><div class="v3d-loading">loading the 3D model...</div></div>
        <aside class="v3d-side"><div class="v3d-step"></div><div class="v3d-part"></div><div class="v3d-edit"></div></aside></div>
      <div class="v3d-points"></div>`;
    this.$ = (s) => this.root.querySelector(s);
    ['keydown', 'keyup', 'dblclick', 'mouseup'].forEach((ev) => this.root.addEventListener(ev, (e) => e.stopPropagation()));
    this.root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && b.tagName === 'BUTTON') this.action(b.dataset.a, b); });
    this.$('[data-a=exp]').addEventListener('input', (e) => { this.targetExp = e.target.value / 100; });
    this.init();
  }
  async init() {
    const cv = this.$('canvas');
    this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(this.cfg.background || '#eef1f4');
    this.cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    this.ctl = new OrbitControls(this.cam, cv); this.ctl.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(3, 6, 4); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.8); dl2.position.set(-4, 3, -3); this.scene.add(dl2);
    new ResizeObserver(() => this.resize()).observe(this.$('.v3d-view'));
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }).observe(this.root);
    cv.addEventListener('pointerdown', (e) => { this.p0 = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', (e) => { if (this.p0 && Math.hypot(e.clientX - this.p0[0], e.clientY - this.p0[1]) < 5) this.pick(e); });
    try {
      const g = await loadModel(modelUrl(this.cfg.model));
      this.model = g.scene.clone(true); this.scene.add(this.model);
    } catch (e) { this.$('.v3d-loading').textContent = 'could not open the model ' + (this.cfg.model || '(no "model")'); return; }
    this.$('.v3d-loading').remove();
    this.meshes = []; this.model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.userData.color0 = o.material.color.clone(); o.userData.op0 = o.material.opacity; this.meshes.push(o); } o.userData.p0 = o.position.clone(); o.userData.mov = new THREE.Vector3(); o.userData.movTarget = new THREE.Vector3(); });
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model); this.center = box.getCenter(new THREE.Vector3()); this.radius = box.getSize(new THREE.Vector3()).length() / 2;
    const asm = this.model.children.length === 1 ? this.model.children[0].children : this.model.children;
    this.assemblies = asm.map((n) => { const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()); return { n, dir: c.clone().sub(this.center) }; });
    this.exp = 0; this.targetExp = 0; this.clock = new THREE.Clock();
    this.goToStep(Number(sessionStorage.getItem('v3d-' + this.block)) || 0, true);
    this.resize(); this.loop();
  }
  resize() { const v = this.$('.v3d-view'); if (!this.r || !v.clientWidth) return; this.r.setSize(v.clientWidth, v.clientHeight, false); this.cam.aspect = v.clientWidth / v.clientHeight; this.cam.updateProjectionMatrix(); }
  find(k) {
    const out = []; this.model.traverse((o) => { if (o === this.model || !matches(o.userData.name || o.name, k)) return; let p = o.parent; while (p) { if (out.includes(p)) return; p = p.parent; } out.push(o); });
    return out;
  }
  meshesOf(k) { const s = new Set(); this.find(k).forEach((n) => n.traverse((o) => o.isMesh && s.add(o))); return s; }
  get steps() { return this.cfg.steps && this.cfg.steps.length ? this.cfg.steps : [{ title: this.cfg.title || 'Overview', text: this.cfg.text || '' }]; }
  goToStep(k, ja) {
    const P = this.steps; this.step = Math.max(0, Math.min(P.length - 1, k)); sessionStorage.setItem('v3d-' + this.block, this.step);
    const p = P[this.step]; this.dur = (p.dur ?? 1.6);
    const cam = p.camera || this.cfg.camera; let pos, target;
    if (cam) { pos = mmV(cam.pos); target = mmV(cam.target); } else { target = this.center.clone(); pos = this.center.clone().add(new THREE.Vector3(1.1, 0.75, 1.3).normalize().multiplyScalar(this.radius * 2.6)); }
    this.tw = { t0: performance.now(), d: ja ? 0 : this.dur * 1000, c0: this.cam.position.clone(), a0: this.ctl.target.clone(), c1: pos, a1: target };
    const hl = new Set(); (p.highlight || []).forEach((k2) => this.meshesOf(k2).forEach((m) => hl.add(m)));
    const hidden = new Set(); [...(this.cfg.hide || []), ...(p.hide || [])].forEach((k2) => this.meshesOf(k2).forEach((m) => hidden.add(m)));
    const colors = {}; Object.entries(p.color || {}).forEach(([k2, c]) => this.meshesOf(k2).forEach((m) => (colors[m.uuid] = c)));
    this.meshes.forEach((m) => {
      m.visible = !hidden.has(m); const ghosted = hl.size && !hl.has(m);
      const tr = ghosted || m.userData.op0 < 1; if (m.material.transparent !== tr) { m.material.transparent = tr; m.material.needsUpdate = true; } m.material.opacity = ghosted ? (p.ghost ?? 0.1) : m.userData.op0; m.material.depthWrite = !ghosted;
      m.material.color.copy(colors[m.uuid] ? new THREE.Color(colors[m.uuid]) : m.userData.color0);
      m.material.emissive && m.material.emissive.setHex(hl.has(m) && p.glow !== false ? 0x2a1a00 : 0x000000);
    });
    this.model.traverse((o) => o.userData.movTarget && o.userData.movTarget.set(0, 0, 0));
    Object.entries(p.move || {}).forEach(([k2, d]) => this.find(k2).forEach((n) => n.userData.movTarget.copy(mmD(d))));
    this.osc = Object.entries(p.vibrate || {}).flatMap(([k2, o]) => this.find(k2).map((n) => ({ n, dir: mmD(o.axis || [0, 0, 1]).normalize(), amp: (o.amp ?? 2) / 1000, hz: o.hz ?? 3 })));
    this.targetExp = p.explode ?? 0; this.$('[data-a=exp]').value = Math.round(this.targetExp * 100);
    this.panel(); this.points();
  }
  panel() {
    const P = this.steps, p = P[this.step];
    this.$('.v3d-tit').textContent = this.cfg.title || '';
    this.$('.v3d-n').textContent = `${this.step + 1} / ${P.length}`;
    this.$('[data-a=tour]').textContent = this.tour ? '❚❚ Pause' : '▶ Tour';
    this.$('[data-a=ed]').classList.toggle('on', this.editing);
    const ed = this.editing ? ' contenteditable="true"' : '';
    this.$('.v3d-step').innerHTML = `<div class="v3d-pt"${ed} data-f="title">${esc(p.title || '')}</div><div class="v3d-px"${ed} data-f="text">${this.editing ? esc(p.text || '') : md(p.text || '')}</div>`;
    if (this.editing) this.$('.v3d-step').querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { p[el.dataset.f] = el.innerText; this.dirty = true; this.editBar(); }));
    this.$('.v3d-points').innerHTML = P.map((x, i) => `<button class="${i === this.step ? 'on' : ''}" data-i="${i}" title="${esc(x.title || '')}">${i + 1}</button>`).join('');
    this.$('.v3d-points').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.stopTour(); this.goToStep(+b.dataset.i); }));
    this.editBar(); this.showPart();
  }
  editBar() {
    const e = this.$('.v3d-edit'); if (!this.editing) { e.innerHTML = ''; return; }
    e.innerHTML = `<div class="v3d-eh">Scene editor</div>
      <button data-a="view">Save this view to the step</button><button data-a="comment">New step from here</button>
      <button data-a="hl">Highlight the picked part</button><button data-a="clear">Clear step highlights</button>
      <button data-a="note">Note on next click</button><button data-a="del">Delete this step</button>
      <div class="v3d-hint">Click a part to explain or highlight it. Edit the step title and text right in the panel.</div>
      <button data-a="save" class="pri"${this.dirty ? '' : ' disabled'}>Save version</button>`;
  }
  showPart() {
    const el = this.$('.v3d-part'); const s = this.sel; if (!s) { el.innerHTML = ''; return; }
    const info = (this.cfg.parts || {})[s.mark] || (this.cfg.parts || {})[s.name] || {};
    el.innerHTML = `<div class="v3d-pn">${esc(info.label || s.name)}</div><div class="v3d-pm">${esc(s.name)}${s.asm ? ' · ' + esc(s.asm) : ''}</div>
      ${this.editing ? `<textarea placeholder="Explain this part (applies to every part with mark ${esc(s.mark)})">${esc(info.text || '')}</textarea>` : `<div class="v3d-px">${md(info.text || 'No explanation yet. Ask Claude.')}</div>`}
      <div class="v3d-actions"><button data-a="ask" class="pri">Comment / ask</button><button data-a="isolate">Isolate</button><button data-a="hidepart">Hide</button><button data-a="showall">Show all</button></div>`;
    const ta = el.querySelector('textarea'); if (ta) ta.addEventListener('input', () => { this.cfg.parts = this.cfg.parts || {}; this.cfg.parts[s.mark] = { ...(this.cfg.parts[s.mark] || {}), text: ta.value }; this.dirty = true; this.editBar(); });
  }
  pick(e) {
    if (!this.meshes) return;
    const v = this.$('canvas').getBoundingClientRect(); const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - v.left) / v.width) * 2 - 1, -((e.clientY - v.top) / v.height) * 2 + 1), this.cam);
    const hit = ray.intersectObjects(this.meshes.filter((m) => m.visible && m.material.opacity > 0.3), false)[0];
    if (this.awaitNote && hit) {
      const t = prompt('Note text at this point:'); this.awaitNote = false;
      if (t) { this.cfg.notes = this.cfg.notes || []; this.cfg.notes.push({ id: 'n' + Date.now().toString(36), point: toMm(hit.point), text: t, step: this.step }); this.dirty = true; this.points(); this.editBar(); }
      return;
    }
    if (this.sel && this.sel.m) this.sel.m.material.emissive && this.sel.m.material.emissive.setHex(0);
    if (!hit) { this.sel = null; this.showPart(); return; }
    let asm = ''; let p = hit.object.parent; while (p && p !== this.model) { if (/:\d+$/.test(p.userData.name || '')) { asm = p.userData.name; break; } p = p.parent; }
    const name = (hit.object.userData.name || hit.object.name).replace(/ \(.*\)$/, '');
    this.sel = { m: hit.object, name, mark: mark(name), asm, point: toMm(hit.point) };
    hit.object.material.emissive && hit.object.material.emissive.setHex(0x7a3a00);
    this.showPart();
  }
  action(a, b) {
    const P = this.steps, p = P[this.step];
    const camMm = () => ({ pos: toMm(this.cam.position), target: toMm(this.ctl.target) });
    if (a === 'next') { this.stopTour(); this.goToStep(this.step + 1); }
    else if (a === 'prev') { this.stopTour(); this.goToStep(this.step - 1); }
    else if (a === 'tour') { this.tour = !this.tour; if (this.tour) { if (this.step >= P.length - 1) this.goToStep(0); this.nextTour = performance.now() + ((p.hold ?? 5) + this.dur) * 1000; } this.panel(); }
    else if (a === 'full') { document.fullscreenElement ? document.exitFullscreen() : this.root.requestFullscreen(); }
    else if (a === 'ed') { this.editing = !this.editing; if (this.editing && !(this.cfg.steps && this.cfg.steps.length)) this.cfg.steps = [{ title: this.cfg.title || 'Overview', text: '' }]; this.panel(); }
    else if (a === 'ask') {
      const s = this.sel; const info = (this.cfg.parts || {})[s.mark] || {};
      const excerpt = `[3D] ${info.label || s.name} · step ${this.step + 1}: ${p.title || ''}`;
      API.comment(this.block, excerpt, [{ block: this.block, text: '', scene: { part: s.name, mark: s.mark, assembly: s.asm, point: s.point, step: this.step + 1, stepTitle: p.title || '', camera: camMm() } }]);
    }
    else if (a === 'isolate') { this.meshes.forEach((m) => (m.visible = m === this.sel.m || this.sel.asm && (() => { let q = m.parent; while (q) { if (q.userData.name === this.sel.asm) return true; q = q.parent; } return false; })())); }
    else if (a === 'hidepart') { this.sel.m.visible = false; this.sel = null; this.showPart(); }
    else if (a === 'showall') { this.goToStep(this.step, true); }
    else if (a === 'view') { p.camera = camMm(); this.dirty = true; this.editBar(); }
    else if (a === 'comment') { const n = { title: 'New step', text: '', camera: camMm(), highlight: [...(p.highlight || [])] }; P.splice(this.step + 1, 0, n); this.cfg.steps = P; this.dirty = true; this.goToStep(this.step + 1, true); }
    else if (a === 'hl') { if (!this.sel) return; p.highlight = [...new Set([...(p.highlight || []), this.sel.mark])]; this.dirty = true; this.goToStep(this.step, true); }
    else if (a === 'clear') { delete p.highlight; this.dirty = true; this.goToStep(this.step, true); }
    else if (a === 'note') { this.awaitNote = true; b.textContent = 'Click the model...'; }
    else if (a === 'del') { if (P.length > 1) { P.splice(this.step, 1); this.cfg.steps = P; this.dirty = true; this.goToStep(this.step, true); } }
    else if (a === 'save') this.save();
  }
  async save() {
    const text = '```scene3d\n' + JSON.stringify(this.cfg, null, 1) + '\n```';
    await API.save(this.block, text, '3D editor');
    this.dirty = false; this.md = text; this.editBar(); API.reload();
  }
  stopTour() { if (this.tour) { this.tour = false; this.panel(); } }
  points() {
    const C = API.threads().filter((c) => c.block === this.block && c.segments.some((s) => s.scene && s.scene.point));
    this.pins = [
      ...(this.cfg.notes || []).filter((n) => n.step == null || n.step === this.step).map((n, i) => ({ p: mmV(n.point), html: `<span class="nt">${i + 1}</span><span class="tx">${esc(n.text)}</span>`, cls: 'note' })),
      ...C.map((c) => { const s = c.segments.find((x) => x.scene).scene; return { p: mmV(s.point), html: `<span class="nt">?</span><span class="tx">${esc(c.first).slice(0, 90)}</span>`, cls: 'comment' + (c.answered ? ' resp' : ''), thread: c.id }; }),
    ];
    const box = this.$('.v3d-labels'); box.innerHTML = this.pins.map((r, i) => `<div class="v3d-r ${r.cls}" data-i="${i}">${r.html}</div>`).join('');
    box.querySelectorAll('.v3d-r').forEach((el) => (el.onclick = () => { const r = this.pins[+el.dataset.i]; if (r.thread) API.openThread(r.thread); else el.classList.toggle('open'); }));
  }
  focusComment(thread) {
    const c = API.threads().find((x) => x.id === thread); const s = c && (c.segments || []).find((x) => x.scene); if (!s) return;
    if (s.scene.step) this.goToStep(s.scene.step - 1);
    if (s.scene.camera) this.tw = { t0: performance.now(), d: 1200, c0: this.cam.position.clone(), a0: this.ctl.target.clone(), c1: mmV(s.scene.camera.pos), a1: mmV(s.scene.camera.target) };
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.visible && !document.fullscreenElement) return;
    const now = performance.now(), dt = Math.min(this.clock.getDelta(), 0.05), t = this.clock.elapsedTime;
    if (this.tw) { const k = this.tw.d ? Math.min(1, (now - this.tw.t0) / this.tw.d) : 1, e = ease(k); this.cam.position.lerpVectors(this.tw.c0, this.tw.c1, e); this.ctl.target.lerpVectors(this.tw.a0, this.tw.a1, e); if (k >= 1) this.tw = null; }
    if (this.tour && now > this.nextTour) { if (this.step >= this.steps.length - 1) this.stopTour(); else { this.goToStep(this.step + 1); this.nextTour = now + ((this.steps[this.step].hold ?? 5) + this.dur) * 1000; } }
    this.exp += (this.targetExp - this.exp) * Math.min(1, dt * 5);
    const rate = Math.min(1, dt * (3 / Math.max(this.dur, 0.3)));
    const off = new Map();
    this.assemblies.forEach(({ n, dir }) => off.set(n, dir.clone().multiplyScalar(this.exp * 0.9)));
    this.model.traverse((o) => { if (!o.userData.mov) return; o.userData.mov.lerp(o.userData.movTarget, rate); if (o.userData.mov.lengthSq() > 1e-12) off.set(o, (off.get(o) || new THREE.Vector3()).add(o.userData.mov)); });
    (this.osc || []).forEach(({ n, dir, amp, hz }) => off.set(n, (off.get(n) || new THREE.Vector3()).add(dir.clone().multiplyScalar(amp * Math.sin(t * hz * Math.PI * 2)))));
    this.model.traverse((o) => { if (!o.userData.p0 || o === this.model) return; const d = off.get(o); if (!d) { if (!o.position.equals(o.userData.p0)) o.position.copy(o.userData.p0); return; }
      const par = o.parent; par.updateMatrixWorld(); const inv = new THREE.Matrix3().setFromMatrix4(par.matrixWorld).invert(); o.position.copy(o.userData.p0).add(d.clone().applyMatrix3(inv)); });
    this.ctl.update(); this.r.render(this.scene, this.cam);
    const v = this.$('.v3d-view'); const W = v.clientWidth, H = v.clientHeight;
    (this.pins || []).forEach((r, i) => { const el = this.$(`.v3d-r[data-i="${i}"]`); if (!el) return; const q = r.p.clone().project(this.cam); el.style.display = q.z < 1 ? '' : 'none'; el.style.transform = `translate(${(q.x * 0.5 + 0.5) * W}px,${(-q.y * 0.5 + 0.5) * H}px)`; });
  }
  update(cfg, mdBlock) { const mod = cfg.model !== this.cfg.model; this.cfg = cfg; this.md = mdBlock; this.dirty = false; if (mod) return false; this.goToStep(this.step, true); return true; }
}

window.scenes3d = function () {
  document.querySelectorAll('.blk .scene3d').forEach((ph) => {
    const block = ph.closest('.blk').dataset.b; const mdBlock = ph.dataset.scene; let cfg;
    try { cfg = JSON.parse(mdBlock); } catch (e) { ph.innerHTML = '<div class="v3d-error">Scene JSON error: ' + esc(e.message) + '</div>'; return; }
    let v = VIEWS.get(block);
    if (v && v.md !== mdBlock && !v.dirty && !v.update(cfg, mdBlock)) v = null;
    if (!v) { v = new Scene(block, cfg, mdBlock); VIEWS.set(block, v); }
    ph.replaceWith(v.root); v.points();
  });
};
window.goToScene = function (thread) { const c = API.threads().find((x) => x.id === thread); const v = c && VIEWS.get(c.block); if (v) v.focusComment(thread); };
window.scenes3d();
