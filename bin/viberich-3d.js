// Viberich 3D scene: a ```scene3d block (JSON) becomes a three.js scene with animated steps, per-part explanations,
// comments pinned to a part (they join the document's normal threads) and an editor that saves a new block version.
// JSON coordinates are mm with Z up (CAD convention); glTF is metres with Y up: mm(x,y,z) -> (x, z, -y)/1000.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const API = window.V3DAPI; const SLUG = API.slug;
const CACHE = new Map();
const VIEWS = new Map();
const loader = new GLTFLoader();
const mmV = (p) => new THREE.Vector3(p[0], p[2], -p[1]).multiplyScalar(0.001);
const mmD = (p) => new THREE.Vector3(p[0], p[2], -p[1]).multiplyScalar(0.001);
const toMm = (v) => [Math.round(v.x * 1000), Math.round(-v.z * 1000), Math.round(v.y * 1000)];
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mark = (n) => String(n || '').split(/[_ :(]/)[0];
const matches = (name, k) => name === k || name.startsWith(k + '_') || name.startsWith(k + ':') || name.startsWith(k + ' ');
const modelUrl = (m) => (/^(https?:)?\//.test(m) ? m : `/m/${SLUG}/${encodeURIComponent(m)}`);
const SHAPES = { pen: ['✎', 'Freehand'], circ: ['◯', 'Circle'], rect: ['▢', 'Rectangle'] };
const CORES = ['#e0262b', '#f08c00', '#1d63a6', '#2f9e44', '#222222'];
function loadModel(url) {
  if (!CACHE.has(url)) CACHE.set(url, new Promise((ok, error) => loader.load(url, (g) => {
    const nodes = g.parser.json.nodes || [];
    g.scene.traverse((o) => { const a = g.parser.associations.get(o); o.userData.name = a && a.nodes != null && nodes[a.nodes] ? nodes[a.nodes].name || o.name : o.name; });
    ok(g); }, undefined, error)));
  return CACHE.get(url);
}
function wrapLines(t, n = 26) {
  const out = []; String(t || '').split('\n').forEach((par) => { let l = ''; par.split(/\s+/).forEach((w) => { if ((l + ' ' + w).trim().length > n && l) { out.push(l); l = w; } else l = (l + ' ' + w).trim(); }); out.push(l); });
  return out.filter((x, i) => x || i < out.length - 1);
}
function bubble(it) { const L = wrapLines(it.text); const w = Math.max(60, Math.max(...L.map((l) => l.length)) * 12.2 + 26), h = L.length * 28 + 18; return { L, w, h, x: it.x2 - w / 2, y: it.y2 - h / 2 }; }
function arrowHead(x1, y1, x2, y2, s = 22) { const a = Math.atan2(y1 - y2, x1 - x2); return [[x1, y1], [x1 - s * Math.cos(a - 0.4), y1 - s * Math.sin(a - 0.4)], [x1 - s * Math.cos(a + 0.4), y1 - s * Math.sin(a + 0.4)]]; }

class Scene {
  constructor(block, cfg, mdBlock) {
    this.block = block; this.cfg = cfg; this.md = mdBlock; this.step = 0; this.editing = false; this.sel = null; this.tour = false;
    this.picks = []; this.pickMode = false; this.isolated = null; this.ses = null; this.section = null; this.measures = []; this.measureMode = false;
    this.root = document.createElement('div'); this.root.className = 'v3d'; this.root.contentEditable = 'false';
    this.root.innerHTML = `
      <div class="v3d-top"><b class="v3d-tit"></b><span class="v3d-spacer"></span>
        <button data-a="tour" title="Plays the steps by itself">▶ Tour</button>
        <button data-a="prev" title="Previous step">‹</button><span class="v3d-n"></span><button data-a="next" title="Next step">›</button>
        <label title="Pulls the assemblies apart to see inside">Explode <input type="range" min="0" max="100" value="0" data-a="exp"></label>
        <button data-a="picks" title="Pick mode: hover to see the exact name, click to pick one or more parts">⌖ Pick</button>
        <button data-a="section" title="Section cut: a plane in X, Y or Z to see inside">✂ Section</button>
        <button data-a="measure" title="Ruler: click two points on the model to measure the distance in mm">📏 Measure</button>
        <button data-a="annotate" title="Takes a snapshot of this pose and opens the 2D annotation (circle, arrow with bubble, text, pen)">✎ Annotate</button>
        <button data-a="ed" title="Edit the scene: views, steps, notes and explanations. Saves a new version of the block">Edit</button>
        <button data-a="full" title="Full screen">⛶</button></div>
      <div class="v3d-bar2"></div>
      <div class="v3d-body"><div class="v3d-view"><canvas></canvas><div class="v3d-labels"></div><div class="v3d-hover"></div><div class="v3d-anot"></div><div class="v3d-loading">loading the 3D model...</div></div>
        <aside class="v3d-side"><div class="v3d-ses"></div><div class="v3d-step"></div><div class="v3d-pin"></div><div class="v3d-part"></div><div class="v3d-edit"></div></aside></div>
      <div class="v3d-points"></div>`;
    this.$ = (s) => this.root.querySelector(s);
    ['keydown', 'keyup', 'dblclick'].forEach((ev) => this.root.addEventListener(ev, (e) => e.stopPropagation()));
    this.root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && b.tagName === 'BUTTON' && !b.closest('.v3d-anot')) this.action(b.dataset.a, b); });
    this.$('[data-a=exp]').addEventListener('input', (e) => { this.targetExp = e.target.value / 100; });
    this.init();
  }
  async init() {
    const cv = this.$('canvas');
    this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.localClippingEnabled = true; this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(this.cfg.background || '#eef1f4');
    this.cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    this.ctl = new OrbitControls(this.cam, cv); this.ctl.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(3, 6, 4); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.8); dl2.position.set(-4, 3, -3); this.scene.add(dl2);
    new ResizeObserver(() => this.resize()).observe(this.$('.v3d-view'));
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }).observe(this.root);
    cv.tabIndex = 0; cv.addEventListener('pointerdown', (e) => { this.p0 = [e.clientX, e.clientY]; cv.focus({ preventScroll: true }); });
    cv.addEventListener('keydown', (e) => { const k = e.key.toLowerCase();
      if (k === 'escape') { this.picks = []; this.sel = null; this.measureMode = false; this.measureP = null; this.panel(); this.paint(); }
      else if (k === 'i' && this.picks.length) this.action('isolatePicks');
      else if (k === 'f') this.frame(this.picks.length ? this.picks.map((x) => x.m) : this.meshes.filter((m) => m.visible));
      else if (k === 'h' && this.picks.length) { (this.hiddenSet = this.hiddenSet || new Set()); this.picks.forEach((x) => this.hiddenSet.add(x.m)); this.picks = []; this.sel = null; this.visib(); this.panel(); }
      else if (k === 'a' && !e.metaKey) this.action('showall');
      else return; e.preventDefault(); });
    cv.addEventListener('pointerup', (e) => { if (this.p0 && Math.hypot(e.clientX - this.p0[0], e.clientY - this.p0[1]) < 5) this.pick(e); });
    cv.addEventListener('pointermove', (e) => { if (!this.pickMode || e.buttons) return; const t = performance.now(); if (t - (this.tHover || 0) < 50) return; this.tHover = t; this.onHover(e); });
    cv.addEventListener('pointerleave', () => { this.hover = null; this.$('.v3d-hover').style.display = 'none'; this.paint(); });
    try {
      const g = await loadModel(modelUrl(this.cfg.model));
      this.model = g.scene.clone(true); this.scene.add(this.model);
    } catch (e) { this.$('.v3d-loading').textContent = 'could not open the model ' + (this.cfg.model || '(no "model")'); return; }
    this.$('.v3d-loading').remove();
    this.meshes = []; this.model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.userData.color0 = o.material.color.clone(); o.userData.op0 = o.material.opacity; this.meshes.push(o); } o.userData.p0 = o.position.clone(); o.userData.mov = new THREE.Vector3(); o.userData.movTarget = new THREE.Vector3(); });
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model); this.boxMm = { X: [box.min.x * 1000, box.max.x * 1000], Y: [-box.max.z * 1000, -box.min.z * 1000], Z: [box.min.y * 1000, box.max.y * 1000] }; this.center = box.getCenter(new THREE.Vector3()); this.radius = box.getSize(new THREE.Vector3()).length() / 2;
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
  ident(m, point) {
    let asm = ''; const cam = []; let p = m.parent; while (p && p !== this.model) { const n = p.userData.name || p.name; if (n) cam.unshift(n); if (!asm && /:\d+$/.test(n || '')) asm = n; p = p.parent; }
    const cadName = m.userData.name || m.name; const name = cadName.replace(/ \(.*\)$/, '');
    return { m, name, cadName, mark: mark(name), asm, path: [...cam, cadName].join(' > '), point };
  }
  raio_(e) {
    const v = this.$('canvas').getBoundingClientRect(); const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - v.left) / v.width) * 2 - 1, -((e.clientY - v.top) / v.height) * 2 + 1), this.cam);
    return ray.intersectObjects(this.meshes.filter((m) => m.visible && m.material.opacity > 0.3), false)[0];
  }
  get steps() { return this.cfg.steps && this.cfg.steps.length ? this.cfg.steps : [{ title: this.cfg.title || 'Overview', text: this.cfg.text || '' }]; }
  goToStep(k, ja) {
    const P = this.steps; this.step = Math.max(0, Math.min(P.length - 1, k)); sessionStorage.setItem('v3d-' + this.block, this.step);
    const p = P[this.step]; this.dur = (p.dur ?? 1.6);
    const cam = p.camera || this.cfg.camera; let pos, target;
    if (cam) { pos = mmV(cam.pos); target = mmV(cam.target); } else { target = this.center.clone(); pos = this.center.clone().add(new THREE.Vector3(1.1, 0.75, 1.3).normalize().multiplyScalar(this.radius * 2.6)); }
    if (!this.isolated) this.tw = { t0: performance.now(), d: ja ? 0 : this.dur * 1000, c0: this.cam.position.clone(), a0: this.ctl.target.clone(), c1: pos, a1: target };
    const hl = new Set(); (p.highlight || []).forEach((k2) => this.meshesOf(k2).forEach((m) => hl.add(m))); this.hl = hl;
    this.stepIsolate = p.isolate ? new Set(p.isolate.flatMap((k2) => [...this.meshesOf(k2)])) : null;
    this.hidden = new Set(); [...(this.cfg.hide || []), ...(p.hide || [])].forEach((k2) => this.meshesOf(k2).forEach((m) => this.hidden.add(m)));
    const colors = {}; Object.entries(p.color || {}).forEach(([k2, c]) => this.meshesOf(k2).forEach((m) => (colors[m.uuid] = c)));
    this.meshes.forEach((m) => {
      const ghosted = hl.size && !hl.has(m) && !this.isolated && !this.stepIsolate;
      const tr = ghosted || m.userData.op0 < 1; if (m.material.transparent !== tr) { m.material.transparent = tr; m.material.needsUpdate = true; } m.material.opacity = ghosted ? (p.ghost ?? 0.1) : m.userData.op0; m.material.depthWrite = !ghosted;
      m.material.color.copy(colors[m.uuid] ? new THREE.Color(colors[m.uuid]) : m.userData.color0);
    });
    this.visib();
    this.model.traverse((o) => o.userData.movTarget && o.userData.movTarget.set(0, 0, 0));
    Object.entries(p.move || {}).forEach(([k2, d]) => this.find(k2).forEach((n) => n.userData.movTarget.copy(mmD(d))));
    this.osc = Object.entries(p.vibrate || {}).flatMap(([k2, o]) => this.find(k2).map((n) => ({ n, dir: mmD(o.axis || [0, 0, 1]).normalize(), amp: (o.amp ?? 2) / 1000, hz: o.hz ?? 3 })));
    this.targetExp = p.explode ?? 0; this.$('[data-a=exp]').value = Math.round(this.targetExp * 100);
    if (p.section) { this.section = { inv: false, ...p.section }; this.stepSection = true; this.applySection(); } else if (this.stepSection) { this.section = null; this.stepSection = false; this.applySection(); }
    (this.stepMeasures || []).forEach((x) => this.scene.remove(x.obj)); this.stepMeasures = (p.measures || []).map((m) => ({ ...this.makeMeasure(mmV(m.from), mmV(m.to)), label: m.label }));
    this.panel(); this.points();
  }
  visib() { const isolate = this.stepIsolate && !this.isolated ? this.stepIsolate : this.isolated; this.meshes.forEach((m) => { m.visible = isolate ? isolate.has(m) : !this.hidden.has(m) && !(this.hiddenSet && this.hiddenSet.has(m)); }); this.paint(); }
  paint() {
    if (!this.meshes) return; const pin = new Set(this.picks.map((x) => x.m)); const p = this.steps[this.step];
    this.meshes.forEach((m) => { if (!m.material.emissive) return;
      m.material.emissive.setHex(m === this.hover ? 0x3d3d3d : this.sel && m === this.sel.m ? 0x7a3a00 : pin.has(m) ? 0x0a3f8a : this.hl && this.hl.has(m) && p.glow !== false && !this.isolated ? 0x2a1a00 : 0); });
  }
  panel() {
    const P = this.steps, p = P[this.step];
    this.$('.v3d-tit').textContent = this.cfg.title || '';
    this.$('.v3d-n').textContent = `${this.step + 1} / ${P.length}`;
    this.$('[data-a=tour]').textContent = this.tour ? '❚❚ Pause' : '▶ Tour';
    this.$('[data-a=ed]').classList.toggle('on', this.editing);
    this.$('[data-a=picks]').classList.toggle('on', this.pickMode); this.$('[data-a=measure]').classList.toggle('on', this.measureMode); this.$('[data-a=section]').classList.toggle('on', !!this.section); this.sectionBar();
    this.$('[data-a=annotate]').classList.toggle('on', !!this.ses);
    this.$('[data-a=annotate]').textContent = this.ses && !this.ses.open ? '📷 Snapshot this pose' : '✎ Annotate';
    const ed = this.editing ? ' contenteditable="true"' : '';
    this.$('.v3d-step').innerHTML = `<div class="v3d-pt"${ed} data-f="title">${esc(p.title || '')}</div><div class="v3d-px"${ed} data-f="text">${this.editing ? esc(p.text || '') : md(p.text || '')}</div>`;
    if (this.editing) this.$('.v3d-step').querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { p[el.dataset.f] = el.innerText; this.dirty = true; this.editBar(); }));
    this.$('.v3d-points').innerHTML = P.map((x, i) => `<button class="${i === this.step ? 'on' : ''}" data-i="${i}" title="${esc(x.title || '')}">${i + 1}</button>`).join('');
    this.$('.v3d-points').querySelectorAll('button').forEach((b) => (b.onclick = () => { this.stopTour(); this.goToStep(+b.dataset.i); }));
    this.editBar(); this.showPart(); this.showPicks(); this.showSession();
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
    el.innerHTML = `<div class="v3d-pn">${esc(info.label || s.name)}</div><div class="v3d-pm">${esc(s.cadName)}${s.asm ? ' · ' + esc(s.asm) : ''}</div>
      ${this.editing ? `<textarea placeholder="Explain this part (applies to every part with mark ${esc(s.mark)})">${esc(info.text || '')}</textarea>` : `<div class="v3d-px">${md(info.text || 'No explanation yet. Ask Claude.')}</div>`}
      <div class="v3d-actions"><button data-a="ask" class="pri">Comment / ask</button><button data-a="pickSel">⌖ Pick</button><button data-a="isolate">Isolate</button><button data-a="hidepart">Hide</button><button data-a="showall">Show all</button></div>`;
    const ta = el.querySelector('textarea'); if (ta) ta.addEventListener('input', () => { this.cfg.parts = this.cfg.parts || {}; this.cfg.parts[s.mark] = { ...(this.cfg.parts[s.mark] || {}), text: ta.value }; this.dirty = true; this.editBar(); });
  }
  showPicks() {
    const el = this.$('.v3d-pin'); if (!this.picks.length && !this.pickMode && !this.measures.length) { el.innerHTML = ''; return; }
    const med = this.measures.length ? `<div class="v3d-eh2">Measures (${this.measures.length})</div>${this.measures.map((x, i) => `<div class="v3d-pm">M${i + 1}: <b>${x.dist} mm</b> (dx ${x.d[0]}, dy ${x.d[1]}, dz ${x.d[2]})</div>`).join('')}<div class="v3d-actions"><button data-a="clearMeasures">Delete measures</button></div>` : '';
    if (!this.picks.length && !this.pickMode) { el.innerHTML = med; return; }
    el.innerHTML = `<div class="v3d-eh2">Picked parts (${this.picks.length})</div>
      <div class="v3d-hint">Click selects · <b>Shift</b>+click adds · <b>Alt</b>+click removes · keys <b>I</b> isolate · <b>F</b> frame · <b>H</b> hide · <b>A</b> show all · <b>Esc</b> clear</div>
      <div class="v3d-plist">${this.picks.map((x, i) => `<div class="v3d-pi"><span class="v3d-pdot"></span><div><b>${esc(x.name)}</b><small>${esc(x.path)}</small></div><button data-a="release" data-i="${i}" title="Release">×</button></div>`).join('')}</div>
      ${this.picks.length ? `<div class="v3d-actions"><button data-a="annotate" class="pri">✎ Annotate</button><button data-a="askPicks">Comment</button><button data-a="isolatePicks">${this.isolated ? 'Show all' : 'Isolate'}</button><button data-a="frameBtn">Frame</button><button data-a="clearPicks">Release all</button></div>` : ''}${med}`;
  }
  togglePick(id) { const k = this.picks.findIndex((x) => x.m === id.m); if (k >= 0) this.picks.splice(k, 1); else this.picks.push(id); this.paint(); this.showPicks(); }
  onHover(e) {
    const hit = this.raio_(e); const h = this.$('.v3d-hover'); const comment = hit ? hit.object : null;
    if (comment !== this.hover) { this.hover = comment; this.paint(); }
    if (!hit) { h.style.display = 'none'; return; }
    const v = this.$('.v3d-view').getBoundingClientRect(); const id = this.ident(hit.object);
    h.innerHTML = `<b>${esc(id.name)}</b>${id.asm ? '<small>' + esc(id.asm) + '</small>' : ''}`; h.style.display = 'block';
    h.style.transform = `translate(${e.clientX - v.left + 14}px,${e.clientY - v.top + 12}px)`;
  }
  pick(e) {
    if (!this.meshes) return;
    const hit = this.raio_(e);
    if (this.awaitNote && hit) {
      const t = prompt('Note text at this point:'); this.awaitNote = false;
      if (t) { this.cfg.notes = this.cfg.notes || []; this.cfg.notes.push({ id: 'n' + Date.now().toString(36), point: toMm(hit.point), text: t, step: this.step }); this.dirty = true; this.points(); this.editBar(); }
      return;
    }
    if (this.measureMode) { if (hit) this.addMeasure(hit.point.clone()); return; }
    const id = hit ? this.ident(hit.object, toMm(hit.point)) : null; const has = id && this.picks.findIndex((x) => x.m === id.m);
    if (e.altKey) { if (id && has >= 0) this.picks.splice(has, 1); if (this.sel && id && this.sel.m === id.m) this.sel = this.picks.at(-1) || null; }
    else if (e.shiftKey || e.metaKey || e.ctrlKey) { if (id && has < 0) this.picks.push(id); if (id) this.sel = id; }
    else if (this.pickMode) { if (id) { if (has >= 0) this.picks.splice(has, 1); else this.picks.push(id); } this.sel = id && has < 0 ? id : this.sel; }
    else { this.picks = id ? [id] : []; this.sel = id; }
    if (this.isolated) { this.isolated = this.picks.length ? new Set(this.picks.map((x) => x.m)) : null; this.visib(); }
    this.paint(); this.showPart(); this.showPicks();
  }
  camMm() { return { pos: toMm(this.cam.position), target: toMm(this.ctl.target) }; }
  frame(ms) {
    const b = new THREE.Box3(); ms.forEach((m) => b.expandByObject(m)); if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.05);
    const dir = this.cam.position.clone().sub(this.ctl.target).normalize(); const d = r / Math.sin((this.cam.fov * Math.PI) / 360) * 1.15;
    this.tw = { t0: performance.now(), d: 900, c0: this.cam.position.clone(), a0: this.ctl.target.clone(), c1: c.clone().add(dir.multiplyScalar(d)), a1: c };
  }
  action(a, b) {
    const P = this.steps, p = P[this.step];
    if (a === 'next') { this.stopTour(); this.goToStep(this.step + 1); }
    else if (a === 'prev') { this.stopTour(); this.goToStep(this.step - 1); }
    else if (a === 'tour') { this.tour = !this.tour; if (this.tour) { if (this.step >= P.length - 1) this.goToStep(0); this.nextTour = performance.now() + ((p.hold ?? 5) + this.dur) * 1000; } this.panel(); }
    else if (a === 'full') { document.fullscreenElement ? document.exitFullscreen() : this.root.requestFullscreen(); }
    else if (a === 'ed') { this.editing = !this.editing; if (this.editing && !(this.cfg.steps && this.cfg.steps.length)) this.cfg.steps = [{ title: this.cfg.title || 'Overview', text: '' }]; this.panel(); }
    else if (a === 'ask') {
      const s = this.sel; const info = (this.cfg.parts || {})[s.mark] || {};
      const excerpt = `[3D] ${info.label || s.name} · step ${this.step + 1}: ${p.title || ''}`;
      API.comment(this.block, excerpt, [{ block: this.block, text: '', where: '3D scene, part ' + s.cadName, scene: { part: s.name, cadName: s.cadName, path: s.path, mark: s.mark, assembly: s.asm, point: s.point, step: this.step + 1, stepTitle: p.title || '', camera: this.camMm() } }]);
    }
    else if (a === 'section') { this.section = this.section ? null : { axis: 'X', v: Math.round((this.boxMm.X[0] + this.boxMm.X[1]) / 2), inv: false }; this.applySection(); this.panel(); }
    else if (a === 'measure') { this.measureMode = !this.measureMode; if (this.measureMode) this.pickMode = false; this.measureP = null; this.panel(); }
    else if (a === 'clearMeasures') { this.measures.forEach((x) => this.scene.remove(x.obj)); this.measures = []; this.points(); this.showPicks(); }
    else if (a === 'picks') { this.pickMode = !this.pickMode; if (this.pickMode) this.measureMode = false; if (!this.pickMode) { this.hover = null; this.$('.v3d-hover').style.display = 'none'; this.paint(); } this.panel(); }
    else if (a === 'pickSel') { if (this.sel) { if (!this.picks.some((x) => x.m === this.sel.m)) this.picks.push(this.sel); this.sel = null; this.pickMode = true; this.panel(); this.paint(); } }
    else if (a === 'release') { this.picks.splice(+b.dataset.i, 1); if (this.isolated) this.isolated = this.picks.length ? new Set(this.picks.map((x) => x.m)) : null; this.visib(); this.showPicks(); }
    else if (a === 'clearPicks') { this.picks = []; this.isolated = null; this.visib(); this.showPicks(); }
    else if (a === 'isolatePicks') { this.isolated = this.isolated ? null : new Set(this.picks.map((x) => x.m)); this.goToStep(this.step, true); if (this.isolated) this.frame([...this.isolated]); }
    else if (a === 'frameBtn') { this.frame(this.picks.map((x) => x.m)); }
    else if (a === 'askPicks') {
      const names = this.picks.map((x) => x.name);
      API.comment(this.block, `[3D] ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' and ' + (names.length - 4) + ' more' : ''}`, [{ block: this.block, text: '', where: '3D scene, picked parts', scene: this.sceneData() }]);
    }
    else if (a === 'annotate') { if (!this.ses) this.ses = { shots: [], obs: '' }; this.snapshot(); }
    else if (a === 'isolate') { const c = this.sel.asm; this.isolated = new Set(this.meshes.filter((m) => m === this.sel.m || c && (() => { let q = m.parent; while (q) { if (q.userData.name === c) return true; q = q.parent; } return false; })())); this.goToStep(this.step, true); this.frame([...this.isolated]); }
    else if (a === 'hidepart') { (this.hiddenSet = this.hiddenSet || new Set()).add(this.sel.m); this.sel = null; this.visib(); this.showPart(); }
    else if (a === 'showall') { this.isolated = null; this.hiddenSet = null; this.goToStep(this.step, true); }
    else if (a === 'view') { p.camera = this.camMm(); this.dirty = true; this.editBar(); }
    else if (a === 'comment') { const n = { title: 'New step', text: '', camera: this.camMm(), highlight: [...(p.highlight || [])] }; P.splice(this.step + 1, 0, n); this.cfg.steps = P; this.dirty = true; this.goToStep(this.step + 1, true); }
    else if (a === 'hl') { if (!this.sel) return; p.highlight = [...new Set([...(p.highlight || []), this.sel.mark])]; this.dirty = true; this.goToStep(this.step, true); }
    else if (a === 'clear') { delete p.highlight; this.dirty = true; this.goToStep(this.step, true); }
    else if (a === 'note') { this.awaitNote = true; b.textContent = 'Click the model...'; }
    else if (a === 'del') { if (P.length > 1) { P.splice(this.step, 1); this.cfg.steps = P; this.dirty = true; this.goToStep(this.step, true); } }
    else if (a === 'save') this.save();
    else if (a === 'sesOpen') { this.ses.current = +b.dataset.i; this.openAnnotator(); }
    else if (a === 'sesDel') { this.ses.shots.splice(+b.dataset.i, 1); if (!this.ses.shots.length) this.closeAnnotator(); else { this.ses.current = Math.min(this.ses.current, this.ses.shots.length - 1); this.ses.open ? this.openAnnotator() : this.showSession(); } }
    else if (a === 'sesPose') { this.closeAnnotator(true); }
    else if (a === 'sesSend') this.sendAnnotation(b);
    else if (a === 'sesDiscard') { if (!this.ses.shots.some((f) => f.anot.length) || confirm('Discard this annotation?')) { this.ses = null; this.closeAnnotator(); } }
  }
  sectionBar() {
    const el = this.$('.v3d-bar2'); const C = this.section;
    if (!C && !this.measureMode) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = 'flex'; let h = '';
    if (C) { const [lo, hi] = this.boxMm[C.axis];
      h += `<b>Section</b>${['X', 'Y', 'Z'].map((e) => `<button data-e="${e}" class="${C.axis === e ? 'on' : ''}">${e}</button>`).join('')}<input type="range" min="${Math.floor(lo)}" max="${Math.ceil(hi)}" value="${C.v}"><span class="v3d-cv">${C.axis} = ${C.v} mm</span><button data-e="inv" title="Shows the other side of the cut">⇄ side</button>`; }
    if (this.measureMode) h += `<b>Ruler</b><span>${this.measureP ? 'now click the second point' : 'click the first point on the model'}</span>`;
    el.innerHTML = h;
    el.onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; if (b.dataset.e === 'inv') C.inv = !C.inv; else { C.axis = b.dataset.e; const [lo, hi] = this.boxMm[C.axis]; C.v = Math.round((lo + hi) / 2); } this.applySection(); this.sectionBar(); };
    const rg = el.querySelector('input[type=range]'); if (rg) rg.oninput = () => { C.v = +rg.value; el.querySelector('.v3d-cv').textContent = `${C.axis} = ${C.v} mm`; this.applySection(); };
  }
  applySection() {
    if (!this.meshes) return; const C = this.section; let pl = null;
    if (C) { const v = C.v / 1000; const n = C.axis === 'X' ? new THREE.Vector3(-1, 0, 0) : C.axis === 'Y' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, -1, 0); pl = new THREE.Plane(n, v); if (C.inv) pl.negate(); }
    this.meshes.forEach((m) => { const lig = !!pl; if ((m.material.side === THREE.DoubleSide) !== lig) { m.material.side = lig ? THREE.DoubleSide : THREE.FrontSide; m.material.needsUpdate = true; } m.material.clippingPlanes = pl ? [pl] : null; });
  }
  addMeasure(p) {
    if (!this.measureP) { this.measureP = p; this.sectionBar(); return; }
    const a = this.measureP; this.measureP = null; this.measures.push(this.makeMeasure(a, p));
    this.sectionBar(); this.points(); this.showPicks();
  }
  makeMeasure(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const obj = new THREE.Group();
    const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe0262b, depthTest: false })); ln.renderOrder = 999;
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe0262b, size: 9, sizeAttenuation: false, depthTest: false })); pts.renderOrder = 999;
    obj.add(ln, pts); this.scene.add(obj);
    const A = [a.x * 1000, -a.z * 1000, a.y * 1000].map((v) => Math.round(v * 10) / 10), B = [b.x * 1000, -b.z * 1000, b.y * 1000].map((v) => Math.round(v * 10) / 10);
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]].map((v) => Math.round(v * 10) / 10);
    return { obj, a: A, b: B, dist: Math.round(Math.hypot(...d) * 10) / 10, d };
  }
  sceneData() {
    const p = this.steps[this.step]; const pz = this.picks.length ? this.picks : this.sel ? [this.sel] : [];
    return { kind: 'picks', parts: pz.map((x) => ({ name: x.name, cadName: x.cadName, mark: x.mark, assembly: x.asm, path: x.path, point: x.point })),
      part: pz[0] && pz[0].name, point: pz[0] ? pz[0].point : toMm(this.ctl.target), step: this.step + 1, stepTitle: p.title || '', camera: this.camMm(), isolated: !!this.isolated,
      section: this.section ? { ...this.section } : null, measures: this.measures.map((x) => ({ a: x.a, b: x.b, dist: x.dist, d: x.d })) };
  }
  snapshot() {
    const pr = this.r.getPixelRatio(); this.r.setPixelRatio(Math.max(2, pr)); this.resize(); this.r.render(this.scene, this.cam);
    const cv = this.$('canvas'); const img = cv.toDataURL('image/jpeg', 0.92); this.r.setPixelRatio(pr); this.resize();
    const VH = Math.round(1000 * cv.height / cv.width), proj = (mm) => { const q = mmV(mm).project(this.cam); return [Math.round((q.x + 1) / 2 * 1000), Math.round((1 - q.y) / 2 * VH), q.z < 1]; };
    const auto = [...this.picks.filter((x) => x.point).map((x) => ({ p: proj(x.point), text: x.name + (x.asm ? ' (' + x.asm + ')' : '') })),
      ...this.measures.map((x, i) => ({ p: proj([(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2, (x.a[2] + x.b[2]) / 2]), text: `M${i + 1}: ${x.dist} mm` }))].filter((x) => x.p[2]);
    this.ses.shots.push({ img, w: cv.width, h: cv.height, camera: this.camMm(), step: this.step + 1, isolated: !!this.isolated, section: this.section ? { ...this.section } : null, parts: this.picks.map((x) => x.name), measures: this.measures.map((x) => x.dist), auto, anot: [] });
    this.ses.current = this.ses.shots.length - 1; this.openAnnotator();
  }
  openAnnotator() {
    const S = this.ses; S.open = true; const F = S.shots[S.current]; const VW = 1000, VH = Math.round(1000 * F.h / F.w);
    this.tool = this.tool || 'arrow'; this.color = this.color || CORES[0]; this.shape = SHAPES[this.shape] ? this.shape : 'pen';
    const el = this.$('.v3d-anot'); el.style.display = 'flex';
    el.innerHTML = `<div class="v3d-afer">
        <button data-f="arrow" class="ic ${this.tool === 'arrow' ? 'on' : ''}" title="Arrow with bubble: drag from the part to the bubble and type">↗</button><span class="v3d-fgrp"><button data-f="shape" class="ic ${SHAPES[this.shape] && this.tool === this.shape ? 'on' : ''}" title="${SHAPES[this.shape][1]} (hold or click ▾ to switch: freehand, circle, rectangle)">${SHAPES[this.shape][0]}<b class="v3d-fmore">▾</b></button><span class="v3d-fmenu">${Object.entries(SHAPES).map(([k, [ic, r]]) => `<button data-shape="${k}" class="ic ${this.shape === k ? 'on' : ''}" title="${r}">${ic}</button>`).join('')}</span></span><button data-f="text" class="ic ${this.tool === 'text' ? 'on' : ''}" title="Text">T</button><button data-f="erase" class="ic ${this.tool === 'erase' ? 'on' : ''}" title="Erase: click a mark">⌫</button>
        <span class="v3d-colors2">${CORES.map((c) => `<i data-c="${c}" style="background:${c}" class="${this.color === c ? 'on' : ''}"></i>`).join('')}</span>
        <button data-f="undo" class="ic" title="Undo the last one">↶</button>${F.auto && F.auto.length ? '<button data-f="auto" class="ic" title="Label: arrow and bubble with the exact name of every picked part and every measure">🏷</button>' : ''}<span class="v3d-spacer"></span>
        <span class="v3d-aid">pose ${S.current + 1} of ${S.shots.length}</span><button data-f="close" class="ic" title="New pose: back to 3D to turn and take another snapshot">↺</button></div>
      <div class="v3d-apalco"><div class="v3d-afig" style="aspect-ratio:${F.w}/${F.h}"><img src="${F.img}" draggable="false"><svg viewBox="0 0 ${VW} ${VH}"></svg></div></div>`;
    const fig = el.querySelector('.v3d-afig'), svg = el.querySelector('svg');
    this.anotVW = VW; this.anotVH = VH; this.svg = svg; this.fig = fig;
    const fit = () => { const pal = el.querySelector('.v3d-apalco'); const r = pal.getBoundingClientRect(); const k = Math.min(r.width / F.w, r.height / F.h); fig.style.width = F.w * k + 'px'; fig.style.height = F.h * k + 'px'; };
    fit(); (this.roAnot && this.roAnot.disconnect()); this.roAnot = new ResizeObserver(fit); this.roAnot.observe(el);
    const grp = el.querySelector('.v3d-fgrp'), bF = grp.querySelector('[data-f=shape]'); let tHold = null, heldOpen = false;
    const menu = (on) => grp.classList.toggle('open', on ?? !grp.classList.contains('open'));
    bF.onpointerdown = () => { heldOpen = false; tHold = setTimeout(() => { heldOpen = true; menu(true); }, 350); };
    bF.onpointerup = bF.onpointerleave = () => clearTimeout(tHold);
    bF.oncontextmenu = (e) => { e.preventDefault(); menu(true); };
    el.querySelector('.v3d-afer').onclick = (e) => {
      const fm = e.target.closest('[data-shape]'); if (fm) { this.shape = fm.dataset.shape; this.tool = this.shape; this.openAnnotator(); return; }
      if (e.target.closest('.v3d-fmore')) { menu(); return; }
      if (e.target.closest('[data-f=shape]')) { if (heldOpen) { heldOpen = false; return; } menu(false); }
      const c = e.target.closest('[data-c]'); if (c) { this.color = c.dataset.c; el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === c)); return; }
      const f = e.target.closest('[data-f]'); if (!f) return; const k = f.dataset.f; let k2;
      if (k === 'undo') { F.anot.pop(); this.drawAnnotations(); this.showSession(); }
      else if (k === 'auto') {
        const cx = 500, cy = VH / 2; F.auto.forEach((q, i) => { if (F.anot.some((x) => x.auto === i)) return; const [x, y] = q.p; let dx = x - cx, dy = y - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const x2 = Math.max(150, Math.min(850, x + dx * 170 + (i % 2 ? 30 : -30))), y2 = Math.max(50, Math.min(VH - 50, y + dy * 120 - 60 + (i % 3) * 30));
          F.anot.push({ t: 'arrow', x1: x, y1: y, x2, y2, text: q.text, color: this.color, auto: i }); });
        this.drawAnnotations(); this.showSession(); }
      else if (k === 'close') this.closeAnnotator(true);
      else { if (k === 'shape') k2 = this.shape; else k2 = k; this.tool = k2; el.querySelectorAll('.v3d-afer [data-f]').forEach((x) => x.classList.toggle('on', x.dataset.f === k || (x.dataset.f === 'shape' && SHAPES[k2]))); svg.style.cursor = k2 === 'erase' ? 'not-allowed' : 'crosshair'; }
    };
    const pt = (e) => { const r = svg.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * VW), Math.round((e.clientY - r.top) / r.height * VH)]; };
    svg.style.cursor = this.tool === 'erase' ? 'not-allowed' : 'crosshair';
    svg.onpointerdown = (e) => {
      if (this.textEditor) return; const [x, y] = pt(e);
      if (this.tool === 'erase') { const g = e.target.closest('[data-i]'); if (g) { F.anot.splice(+g.dataset.i, 1); this.drawAnnotations(); this.showSession(); } return; }
      const g = e.target.closest('[data-i]'); if (g && e.detail > 1) return;
      svg.setPointerCapture(e.pointerId); const color = this.color;
      if (this.tool === 'text') { const it = { t: 'text', x2: x, y2: y, text: '', color }; F.anot.push(it); this.editText(it, true); return; }
      const it = this.tool === 'circ' || this.tool === 'rect' ? { t: this.tool, x0: x, y0: y, x1: x, y1: y, color } : this.tool === 'pen' ? { t: 'pen', pts: [[x, y]], color } : { t: 'arrow', x1: x, y1: y, x2: x, y2: y, text: '', color };
      F.anot.push(it); this.drag = it; this.drawAnnotations();
    };
    svg.onpointermove = (e) => { const it = this.drag; if (!it) return; const [x, y] = pt(e);
      if (it.t === 'circ' || it.t === 'rect') { it.x1 = x; it.y1 = y; } else if (it.t === 'pen') it.pts.push([x, y]); else { it.x2 = x; it.y2 = y; } this.drawAnnotations(); };
    svg.onpointerup = () => { const it = this.drag; this.drag = null; if (!it) return;
      if ((it.t === 'circ' || it.t === 'rect') && Math.abs(it.x1 - it.x0) + Math.abs(it.y1 - it.y0) < 8) { F.anot.pop(); this.drawAnnotations(); return; }
      if (it.t === 'arrow') { if (Math.hypot(it.x2 - it.x1, it.y2 - it.y1) < 15) { it.x2 = it.x1 + 120; it.y2 = it.y1 - 90; } this.drawAnnotations(); this.editText(it, true); return; }
      this.showSession(); };
    svg.ondblclick = (e) => { const g = e.target.closest('[data-i]'); if (!g) return; const it = F.anot[+g.dataset.i]; if (it.t === 'arrow' || it.t === 'text') this.editText(it, false); };
    this.drawAnnotations(); this.panel();
  }
  drawAnnotations() {
    const F = this.ses.shots[this.ses.current]; let n = 0;
    this.svg.innerHTML = F.anot.map((it, i) => {
      const c = it.color; let s = '';
      if (it.t === 'rect') { const x0 = Math.min(it.x0, it.x1), y0 = Math.min(it.y0, it.y1), w = Math.abs(it.x1 - it.x0), h = Math.abs(it.y1 - it.y0);
        s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" fill="none" stroke="transparent" stroke-width="22"/><rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" fill="none" stroke="${c}" stroke-width="5"/>`; }
      else if (it.t === 'circ') { const cx = (it.x0 + it.x1) / 2, cy = (it.y0 + it.y1) / 2, rx = Math.abs(it.x1 - it.x0) / 2, ry = Math.abs(it.y1 - it.y0) / 2;
        s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="transparent" stroke-width="22"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="5"/>`; }
      else if (it.t === 'pen') { const pts = it.pts.map((q) => q.join(',')).join(' '); s = `<polyline points="${pts}" fill="none" stroke="transparent" stroke-width="22"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`; }
      else {
        if (it.t === 'arrow') { const h = arrowHead(it.x1, it.y1, it.x2, it.y2); s += `<line x1="${it.x2}" y1="${it.y2}" x2="${it.x1}" y2="${it.y1}" stroke="${c}" stroke-width="5"/><polygon points="${h.map((q) => q.join(',')).join(' ')}" fill="${c}"/>`; }
        if (it.text || it.t === 'text') { n++; const b = bubble(it);
          s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="#fff" stroke="${c}" stroke-width="4"/><circle cx="${b.x}" cy="${b.y}" r="15" fill="${c}"/><text x="${b.x}" y="${b.y + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${n}</text>`
            + b.L.map((l, k) => `<text x="${b.x + 13}" y="${b.y + 36 + k * 28}" font-size="22" fill="#1d232a" font-family="Inter,sans-serif">${esc(l)}</text>`).join(''); }
      }
      return `<g data-i="${i}">${s}</g>`;
    }).join('');
  }
  editText(it, comment) {
    const F = this.ses.shots[this.ses.current]; const r = this.svg.getBoundingClientRect(), fr = this.fig.getBoundingClientRect(); const k = r.width / this.anotVW;
    const ta = document.createElement('textarea'); ta.className = 'v3d-ated'; ta.value = it.text || ''; ta.placeholder = 'Write the note (Enter saves, Shift+Enter new line, Esc cancels)';
    ta.style.left = Math.max(0, Math.min(fr.width - 260, it.x2 * k - 130)) + 'px'; ta.style.top = Math.max(0, Math.min(fr.height - 90, it.y2 * k - 30)) + 'px';
    this.fig.appendChild(ta); this.textEditor = ta; setTimeout(() => ta.focus(), 0);
    const done = (keep) => { if (!this.textEditor) return; this.textEditor = null; ta.remove();
      if (keep) it.text = ta.value.trim(); if (!it.text && it.t === 'text') F.anot.splice(F.anot.indexOf(it), 1);
      this.drawAnnotations(); this.showSession(); };
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); } else if (e.key === 'Escape') { if (comment && it.t === 'text') it.text = ''; done(false); } });
    ta.addEventListener('blur', () => done(true));
  }
  closeAnnotator(keepSession) {
    const el = this.$('.v3d-anot'); el.style.display = 'none'; el.innerHTML = ''; if (this.roAnot) this.roAnot.disconnect();
    if (this.ses) this.ses.open = false; if (!keepSession) this.ses = this.ses && this.ses.shots.length ? this.ses : null;
    this.panel();
  }
  annotationTexts(F) { let n = 0; const out = []; F.anot.forEach((it) => { if (it.t === 'circ') out.push({ kind: 'circle' }); else if (it.t === 'rect') out.push({ kind: 'rectangle' }); else if (it.t === 'pen') out.push({ kind: 'stroke' }); else { if (it.text || it.t === 'text') n++; out.push({ kind: it.t === 'arrow' ? 'arrow' : 'text', n: it.text ? n : null, text: it.text || '' }); } }); return out; }
  showSession() {
    const el = this.$('.v3d-ses'); const S = this.ses; this.root.classList.toggle('v3d-annotating', !!S);
    if (!S) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="v3d-eh2">Annotation ${S.open ? '(drawing)' : '(changing pose)'}</div>
      <div class="v3d-hint">${S.open ? 'Arrow: drag from the part to where the bubble goes and type. Double-click edits a bubble. ↺ New pose goes back to 3D.' : 'Orbit, zoom, isolate or pick other parts, then click 📷 Snapshot this pose.'}</div>
      ${this.picks.length ? `<div class="v3d-pm">Parts: ${esc(this.picks.map((x) => x.name).join(', '))}</div>` : ''}
      <div class="v3d-shots">${S.shots.map((f, i) => `<div class="v3d-shot ${i === S.current && S.open ? 'on' : ''}"><img src="${f.img}" data-a="sesOpen" data-i="${i}"><button data-a="sesOpen" data-i="${i}" class="v3d-fn">pose ${i + 1} · ${f.anot.length} mark${f.anot.length === 1 ? '' : 's'}${f.section ? ' · section ' + f.section.axis + '=' + f.section.v : ''}</button><button data-a="sesDel" data-i="${i}" class="v3d-fx" title="Delete this snapshot">×</button></div>`).join('')}</div>
      <textarea class="v3d-obs" placeholder="General note (goes with the comment)">${esc(S.obs || '')}</textarea>
      <div class="v3d-actions"><button data-a="sesSend" class="pri">Send to comments</button>${S.open ? '<button data-a="sesPose">↺ New pose</button>' : '<button data-a="annotate">📷 Snapshot</button>'}<button data-a="sesDiscard">Discard</button></div>`;
    el.querySelectorAll('img[data-a]').forEach((im) => (im.onclick = () => this.action('sesOpen', im)));
    el.querySelector('.v3d-obs').addEventListener('input', (e) => { S.obs = e.target.value; });
  }
  async sendAnnotation(btn) {
    const S = this.ses; if (!S || !S.shots.length) return; btn.disabled = true; btn.textContent = 'Sending...';
    const attachments = [];
    for (const F of S.shots) {
      const im = new Image(); im.src = F.img; await im.decode();
      const cv = document.createElement('canvas'); cv.width = F.w; cv.height = F.h; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const k = F.w / 1000; g.scale(k, k); g.lineCap = 'round'; g.lineJoin = 'round'; let n = 0;
      for (const it of F.anot) {
        g.strokeStyle = g.fillStyle = it.color; g.lineWidth = 5;
        if (it.t === 'rect') { g.beginPath(); g.rect(Math.min(it.x0, it.x1), Math.min(it.y0, it.y1), Math.abs(it.x1 - it.x0), Math.abs(it.y1 - it.y0)); g.stroke(); }
        else if (it.t === 'circ') { g.beginPath(); g.ellipse((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, Math.abs(it.x1 - it.x0) / 2 || 1, Math.abs(it.y1 - it.y0) / 2 || 1, 0, 0, Math.PI * 2); g.stroke(); }
        else if (it.t === 'pen') { g.beginPath(); it.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
        else {
          if (it.t === 'arrow') { g.beginPath(); g.moveTo(it.x2, it.y2); g.lineTo(it.x1, it.y1); g.stroke(); const h = arrowHead(it.x1, it.y1, it.x2, it.y2); g.beginPath(); g.moveTo(...h[0]); g.lineTo(...h[1]); g.lineTo(...h[2]); g.closePath(); g.fill(); }
          if (it.text) { n++; const b = bubble(it); g.fillStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.fill(); g.stroke();
            g.fillStyle = it.color; g.beginPath(); g.arc(b.x, b.y, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = '700 18px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(String(n), b.x, b.y + 6);
            g.textAlign = 'left'; g.fillStyle = '#1d232a'; g.font = '22px Inter, sans-serif'; b.L.forEach((l, j) => g.fillText(l, b.x + 13, b.y + 36 + j * 28)); }
        }
      }
      const r = await API.attach(cv.toDataURL('image/jpeg', 0.9)); if (r && r.url) attachments.push(r);
    }
    const parts = this.picks.length ? this.picks : this.sel ? [this.sel] : [];
    const scene = { ...this.sceneData(), kind: 'annotation', poses: S.shots.map((F, i) => ({ pose: i + 1, step: F.step, camera: F.camera, isolated: F.isolated, section: F.section, parts: F.parts, measures: F.measures, annotations: this.annotationTexts(F), image: attachments[i] ? attachments[i].path : null })) };
    const notes = S.shots.flatMap((F, i) => this.annotationTexts(F).filter((x) => x.text).map((x) => `pose ${i + 1}, bubble ${x.n}: ${x.text}`));
    const text = [S.obs && S.obs.trim(), notes.length ? notes.join('\n') : ''].filter(Boolean).join('\n\n') || 'Annotation on the 3D model';
    const excerpt = `[3D annotation] ${parts.length ? parts.map((x) => x.name).slice(0, 4).join(', ') : 'view'} · ${S.shots.length} pose${S.shots.length > 1 ? 's' : ''}`;
    await API.sendComment({ block: this.block, excerpt, segments: [{ block: this.block, text: '', where: '3D scene, annotation on a snapshot', scene }], text, attachments });
    this.ses = null; this.closeAnnotator();
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
      ...(this.cfg.notes || []).filter((n) => n.step == null || n.step === this.step).map((n, i) => ({ p: mmV(n.point), html: `<span class="nt">${i + 1}</span><span class="tx">${esc(n.text)}</span>`, cls: 'note' + (n.pinned ? ' open' : '') })),
      ...this.measures.map((x, i) => ({ p: mmV([(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2, (x.a[2] + x.b[2]) / 2]), html: `<span class="tx mm">M${i + 1} · ${x.dist} mm</span>`, cls: 'med' })),
      ...(this.stepMeasures || []).map((x) => ({ p: mmV([(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2, (x.a[2] + x.b[2]) / 2]), html: `<span class="tx mm">${esc(x.label || x.dist + ' mm')}</span>`, cls: 'med' })),
      ...C.map((c) => { const s = c.segments.find((x) => x.scene && x.scene.point).scene; return { p: mmV(s.point), html: `<span class="nt">${s.kind === 'annotation' ? '✎' : '?'}</span><span class="tx">${esc(c.first).slice(0, 90)}</span>`, cls: 'comment' + (c.answered ? ' resp' : ''), thread: c.id }; }),
    ];
    const box = this.$('.v3d-labels'); box.innerHTML = this.pins.map((r, i) => `<div class="v3d-r ${r.cls}" data-i="${i}">${r.html}</div>`).join('');
    box.querySelectorAll('.v3d-r').forEach((el) => (el.onclick = () => { const r = this.pins[+el.dataset.i]; if (r.thread) { API.openThread(r.thread); this.focusComment(r.thread); } else el.classList.toggle('open'); }));
  }
  focusComment(thread) {
    const c = API.threads().find((x) => x.id === thread); const s = c && (c.segments || []).find((x) => x.scene); if (!s || !this.meshes) return;
    const z = s.scene; const pose = (z.poses && z.poses[0]) || z;
    if (z.parts && z.parts.length) { this.picks = []; z.parts.forEach((q) => { const m = this.meshes.find((mm) => (mm.userData.name || mm.name) === (q.cadName || q.name) && (!q.assembly || this.ident(mm).asm === q.assembly)); if (m) this.picks.push(this.ident(m, q.point)); }); }
    this.isolated = pose.isolated && this.picks.length ? new Set(this.picks.map((x) => x.m)) : null;
    this.section = pose.section || z.section || null; this.applySection();
    if (z.step) this.goToStep(z.step - 1); else this.visib();
    const cam = pose.camera || z.camera; if (cam) this.tw = { t0: performance.now(), d: 1200, c0: this.cam.position.clone(), a0: this.ctl.target.clone(), c1: mmV(cam.pos), a1: mmV(cam.target) };
    this.panel();
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
  whereOf(n) {
    const p = this.steps[this.step]; const base = { step: this.step + 1, stepTitle: p.title || '', camera: this.meshes ? this.camMm() : null };
    if (n.closest('[data-f=title]')) return { where: `3D scene, title of step ${this.step + 1}`, scene: base };
    if (n.closest('.v3d-step')) return { where: `3D scene, text of step ${this.step + 1} "${p.title || ''}"`, scene: base };
    if (n.closest('.v3d-part') && this.sel) return { where: `3D scene, explanation of part ${this.sel.cadName}`, scene: { ...base, part: this.sel.name, cadName: this.sel.cadName, assembly: this.sel.asm, path: this.sel.path, point: this.sel.point } };
    if (n.closest('.v3d-pin')) return { where: '3D scene, picked parts list', scene: this.sceneData() };
    if (n.closest('.v3d-r')) return { where: '3D scene, note or comment pinned to the model', scene: base };
    if (n.closest('.v3d-ses')) return { where: '3D scene, annotation panel', scene: base };
    return { where: '3D scene, panel', scene: base };
  }
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
window.whereV3D = function (n) { const r = n.closest && n.closest('.v3d'); if (!r) return null; const v = [...VIEWS.values()].find((x) => x.root === r); return v ? v.whereOf(n) : null; };
window.scenes3d();
window.__v3dViews = VIEWS;
