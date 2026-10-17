// غرفة المحاكاة ثلاثية الأبعاد: معرض يمكن التجول فيه، محاكاة مركزية، ستة معروضات، وشاشة تفتيش
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMaterials, panelTexture, wrapText, latexPlain, pbr, FONT } from './kit.js';
import { WalkControls } from './controls.js';
import { Orbits, Satellite, Disk, Torque, Seesaw, Impulse, Collision } from './sims_a.js';
import { Work, Lever, Forms, Ramp, Thermal, Phase } from './sims_b.js';
import { solve, texMap, fill, rich, tex, evalExpr, paramPlain, plainNum } from '../fmt.js';

const SIMS = { orbits: Orbits, satellite: Satellite, disk: Disk, torque: Torque, seesaw: Seesaw, impulse: Impulse, collision: Collision, work: Work, lever: Lever, forms: Forms, ramp: Ramp, thermal: Thermal, phase: Phase };
const STAGE = new THREE.Vector3(0, 0.3, -1.2);
const KIND = { problem: 'مسألة محلولة', explorer: 'مستكشف تفاعلي', history: 'لوحة تاريخية' };

export class Room {
  constructor(el, L, { onExit, onHome, onInspect }) {
    this.el = el; this.L = L; this.code = L.code; this.onExit = onExit; this.onHome = onHome; this.onInspectCb = onInspect;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.quality = { high: !this.isTouch && (navigator.deviceMemory ?? 8) >= 4 };
    this.color = L.chapter.color;
    this.ready = this.init();
  }

  /* ─── الواجهة ─── */
  buildDOM() {
    const L = this.L;
    this.el.style.setProperty('--c', this.color);
    this.el.innerHTML = `
      <canvas class="room-cv" aria-label="غرفة محاكاة ${L.title}"></canvas>
      <header class="hud-top">
        <button class="hud-btn" data-act="exit" aria-label="العودة إلى البطاقة"><span>→</span><em>البطاقة</em></button>
        <div class="hud-title"><b>${L.code}</b><div><strong>${L.title}</strong><small>${L.sim.title}</small></div></div>
        <button class="hud-btn" data-act="home" aria-label="الخط الزمني"><span>✦</span><em>الخط الزمني</em></button>
      </header>
      <aside class="readout" aria-live="off"><div class="ro-head">قراءات المحاكاة <i class="live"></i></div><dl></dl><ul class="legend"></ul></aside>
      <div class="prompt" hidden></div>
      <nav class="ex-dock" aria-label="المعروضات">
        <button class="dock-toggle" aria-expanded="false">المعروضات <b>${L.exhibits.length + 1}</b></button>
        <div class="dock-list" hidden></div>
      </nav>
      <p class="help">${this.isTouch
        ? 'العصا للحركة · اسحب للنظر · اقرص للتقريب · المس معروضاً للتفتيش'
        : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> للحركة · اسحب بالماوس للنظر · انقر معروضاً أو اضغط <kbd>E</kbd> للتفتيش'}</p>
      <aside class="inspect" hidden role="dialog" aria-modal="false" aria-label="شاشة التفتيش"></aside>`;
    this.cv = this.el.querySelector('.room-cv');
    this.el.querySelector('[data-act="exit"]').onclick = () => this.onExit();
    this.el.querySelector('[data-act="home"]').onclick = () => this.onHome();
    const dock = this.el.querySelector('.dock-list'), tog = this.el.querySelector('.dock-toggle');
    const items = [{ id: 'stage', title: L.sim.title, kind: 'sim' }, ...L.exhibits];
    dock.innerHTML = items.map((e, i) => `<button data-id="${e.id}"><i>${i === 0 ? '◎' : i}</i><span>${e.title}</span><small>${e.kind === 'sim' ? 'المحاكاة الرئيسية' : KIND[e.kind]}</small></button>`).join('');
    tog.onclick = () => { const open = dock.hidden; dock.hidden = !open; tog.setAttribute('aria-expanded', String(open)); };
    dock.querySelectorAll('button').forEach((b) => (b.onclick = () => { dock.hidden = true; tog.setAttribute('aria-expanded', 'false'); this.inspect(b.dataset.id); }));
    this.panel = this.el.querySelector('.inspect'); this.promptEl = this.el.querySelector('.prompt');
    this.readoutEl = this.el.querySelector('.readout dl');
  }

  async init() {
    this.buildDOM();
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: true, powerPreference: 'high-performance' });
    this.maxPR = Math.min(devicePixelRatio || 1, this.quality.high ? 2 : 1.5); this.pr = this.maxPR;
    r.setPixelRatio(this.pr);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0f15'); scene.fog = new THREE.Fog('#0d0f15', 14, 30);
    const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60); this.camera.position.set(0, 1.65, 5.6);
    this.mats = makeMaterials(this.quality);
    this.buildRoom(); this.buildLights();
    const Sim = SIMS[this.L.sim.type];
    this.sim = new Sim({ mats: this.mats, quality: this.quality, scene }, this.L.sim.params);
    this.sim.root.position.add(STAGE); scene.add(this.sim.root);
    this.buildExhibits();
    this.renderLegend();
    this.controls = new WalkControls(this.camera, this.cv, { onTap: (x, y) => this.tap(x, y), isTouch: this.isTouch });
    this.controls.colliders = [{ x: STAGE.x, z: STAGE.z, r: 3.55 }, ...this.exhibitObjs.map((o) => ({ x: o.group.position.x, z: o.group.position.z, r: 0.85 }))];
    this.controls.lookAt(new THREE.Vector3(0, 1.3, STAGE.z));
    if (this.isPortrait()) { this.controls.fov = this.camera.fov = 80; this.camera.position.z = 6.4; }
    this.el.querySelector('.ro-head').onclick = () => this.el.querySelector('.readout').classList.toggle('open');
    this._key = (e) => {
      if (e.code === 'KeyE' && !this.inspecting && this.nearest) this.inspect(this.nearest.id);
      if (e.code === 'Escape' && this.inspecting) this.closeInspect();
    };
    addEventListener('keydown', this._key);
    this._resize = () => this.resize(); addEventListener('resize', this._resize); this.resize();
    this.cv.addEventListener('pointermove', (e) => { this.mouse = [e.clientX, e.clientY]; });
    this.last = performance.now(); this.elapsed = 0; this.running = true; this.ftimes = []; this.roT = 0;
    const loop = () => { if (!this.running) return; this.raf = requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  /* ─── المعمار ─── */
  buildRoom() {
    const { scene, mats } = this; const W = 12, D = 18, H = 5;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mats.floor); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mats.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    const wall = (w, x, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mats.wall); pl.position.y = H / 2; pl.receiveShadow = true;
      const wain = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, 0.05), mats.wood); wain.position.set(0, 0.55, 0.025); wain.receiveShadow = true;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.08), mats.brass); rail.position.set(0, 1.12, 0.04);
      const led = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: '#ffe2b3' })); led.position.set(0, H - 0.12, 0.08);
      g.add(pl, wain, rail, led); scene.add(g); return g;
    };
    wall(W, 0, -D / 2, 0); wall(W, 0, D / 2, Math.PI); wall(D, -W / 2, 0, Math.PI / 2); wall(D, W / 2, 0, -Math.PI / 2);
    // ألواح إضاءة السقف
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 4; j++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(i === 0 ? 2.2 : 1.2, 0.04, 0.5), mats.lightPanel); p.position.set(i * 3.6, H - 0.03, -7 + j * 4.4); scene.add(p);
    }
    // المنصة المركزية
    const dais = new THREE.Group(); dais.position.set(STAGE.x, 0, STAGE.z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.3, 96), pbr('#1a1d26', 0.5, 0.3)); top.position.y = 0.15; top.receiveShadow = true; top.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.035, 12, 128), mats.brass); rim.rotation.x = Math.PI / 2; rim.position.y = 0.3;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(3.32, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: this.color })); glow.rotation.x = Math.PI / 2; glow.position.y = 0.02;
    dais.add(top, rim, glow); scene.add(dais); this.daisTop = top; top.userData.pick = 'stage';
    // جدار العنوان: الدرس ومعادلته
    const tTex = panelTexture(2048, 900, (g, w, h) => {
      g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, w, h);
      g.fillStyle = this.color; g.fillRect(0, 0, w, 14);
      g.textAlign = 'center'; g.fillStyle = '#6b7088'; g.font = `500 54px ${FONT}`; g.fillText(`الفصل ${this.L.chapter.id} · ${this.L.chapter.title}`, w / 2, 70);
      g.fillStyle = '#141a2e'; g.font = `700 120px Amiri, ${FONT}`; g.fillText(`${this.L.title}`, w / 2, 150);
      g.direction = 'ltr'; g.font = 'italic 500 150px "Times New Roman", serif'; g.fillStyle = '#0e1430';
      g.fillText(latexPlain(this.L.main.latex), w / 2, 430, w - 160);
      g.direction = 'rtl'; g.font = `500 52px ${FONT}`; g.fillStyle = '#4a5170'; g.fillText(this.L.main.label, w / 2, 660);
      g.fillStyle = this.color; g.font = `700 64px ${FONT}`; g.fillText(this.L.code, w / 2, 770);
    });
    const title = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.8), new THREE.MeshStandardMaterial({ map: tTex, roughness: 0.7, emissive: '#ffffff', emissiveMap: tTex, emissiveIntensity: 0.45 }));
    title.position.set(0, 3.05, -D / 2 + 0.06); scene.add(title);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 3.0, 0.06), mats.brass); frame.position.set(0, 3.05, -D / 2 + 0.02); scene.add(frame);
    // لوحات جدارية للمعادلات المرتبطة
    this.L.related.forEach((e, i) => {
      const side = i % 2 === 0 ? 1 : -1, z = [-3.05, -3.05, 1.25, 1.25][i] ?? 1.25;
      const pt = panelTexture(1024, 420, (g, w, h) => {
        g.fillStyle = '#10131c'; g.fillRect(0, 0, w, h); g.fillStyle = this.color; g.fillRect(0, 0, 10, h);
        g.textAlign = 'center'; g.fillStyle = '#a6aecb'; g.font = `500 40px ${FONT}`; g.fillText(e.label, w / 2, 40);
        g.direction = 'ltr'; g.fillStyle = '#f4efe2'; g.font = 'italic 500 84px "Times New Roman", serif'; g.fillText(latexPlain(e.latex), w / 2, 170, w - 80);
      });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshStandardMaterial({ map: pt, emissive: '#ffffff', emissiveMap: pt, emissiveIntensity: 0.5, roughness: 0.4 }));
      pl.position.set(side * (W / 2 - 0.05), 2.75, z); pl.rotation.y = -side * Math.PI / 2; scene.add(pl);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 2.3), mats.brass); fr.position.set(side * (W / 2 - 0.02), 2.75, z); scene.add(fr);
    });
    // باب المدخل
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.1), pbr('#0b0d12', 0.6)); door.position.set(0, 1.5, D / 2 - 0.04); scene.add(door);
    const doorF = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.2, 0.06), mats.brass); doorF.position.set(0, 1.55, D / 2 - 0.02); scene.add(doorF);
  }

  buildLights() {
    const { scene, quality } = this;
    scene.add(new THREE.HemisphereLight('#e6edff', '#2a221b', 0.55));
    const key = new THREE.DirectionalLight('#fff3e2', 1.7); key.position.set(4.5, 9, 4); key.target.position.copy(STAGE);
    key.castShadow = true; const s = key.shadow; s.mapSize.set(quality.high ? 2048 : 1024, quality.high ? 2048 : 1024);
    Object.assign(s.camera, { left: -7, right: 7, top: 9.5, bottom: -9.5, near: 1, far: 25 }); s.bias = -0.0004; s.normalBias = 0.03; s.radius = 4;
    scene.add(key, key.target);
    const spot = new THREE.SpotLight('#fff8ee', 34, 12, 0.7, 0.8, 2); spot.position.set(STAGE.x, 4.9, STAGE.z + 0.6); spot.target.position.copy(STAGE);
    spot.castShadow = quality.high; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.02; spot.shadow.radius = 5;
    scene.add(spot, spot.target);
    const rim = new THREE.PointLight(this.color, 4, 9, 2); rim.position.set(0, 3.5, -7); scene.add(rim);
  }

  /* ─── المعروضات ─── */
  exhibitPanel(ex, i) {
    const vals = ex.params?.length ? Object.fromEntries(ex.params.map((p) => [p.key, p.value])) : {};
    let text = ex.kind === 'history' ? ex.body : '';
    if (ex.kind !== 'history') {
      const map = {}; for (const p of ex.params) map[p.key] = paramPlain(p, vals[p.key]);
      text = ex.statement.replace(/\[\[(\w+)\]\]/g, (_, k) => map[k] ?? '…').replace(/\$([^$]+)\$/g, (_, m) => latexPlain(m));
    }
    return panelTexture(1024, 720, (g, w, h) => {
      g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ebe7dc'; g.lineWidth = 2; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = this.color; g.fillRect(0, 0, w, 12);
      g.textAlign = 'right'; g.fillStyle = '#6b7088'; g.font = `600 34px ${FONT}`; g.fillText(`معروض ${i + 1} · ${KIND[ex.kind]}`, w - 48, 44);
      g.fillStyle = '#141a2e'; g.font = `700 70px Amiri, ${FONT}`;
      const tl = wrapText(g, ex.title, w - 96); tl.slice(0, 2).forEach((ln, k) => g.fillText(ln, w - 48, 100 + k * 78));
      const y0 = 100 + Math.min(2, tl.length) * 78 + 20;
      g.fillStyle = '#2a3048'; g.font = `400 34px ${FONT}`;
      wrapText(g, text, w - 96).slice(0, 6).forEach((ln, k) => g.fillText(ln, w - 48, y0 + k * 52));
      g.fillStyle = this.color; g.beginPath(); g.roundRect(48, h - 96, 330, 60, 30); g.fill();
      g.fillStyle = '#0e1430'; g.font = `700 32px ${FONT}`; g.textAlign = 'center'; g.fillText(this.isTouch ? 'المس للتفتيش' : 'انقر للتفتيش', 213, h - 82);
    });
  }

  buildExhibits() {
    const xs = 4.55, zs = [-5.2, -0.9, 3.4];
    const slots = [[xs, zs[0]], [-xs, zs[0]], [xs, zs[1]], [-xs, zs[1]], [xs, zs[2]], [-xs, zs[2]]];
    this.exhibitObjs = this.L.exhibits.map((ex, i) => {
      const [x, z] = slots[i % 6];
      const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 0.6), this.mats.marble); base.position.y = 0.475;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.7), this.mats.brass); plinth.position.y = 0.03;
      const head = new THREE.Group(); head.position.set(0, 1.0, 0); head.rotation.x = -0.62;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.76, 0.05), this.mats.darkSteel);
      const tex = this.exhibitPanel(ex, i);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.703), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22 }));
      face.position.z = 0.027; head.add(board, face); head.position.z = 0.05;
      // شارة عائمة: شكلها حسب نوع المعروض
      const gem = new THREE.Mesh(ex.kind === 'history' ? new THREE.CylinderGeometry(0.07, 0.07, 0.22, 24) : ex.kind === 'explorer' ? new THREE.OctahedronGeometry(0.11) : new THREE.IcosahedronGeometry(0.1, 0),
        new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 }));
      gem.position.set(0, 1.75, -0.05);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 64), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.25 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065;
      grp.add(base, plinth, head, gem, ring);
      grp.traverse((o) => { if (o.isMesh && o !== ring) { o.castShadow = true; o.receiveShadow = true; } o.userData.pick = ex.id; });
      this.scene.add(grp);
      return { id: ex.id, ex, group: grp, gem, ring };
    });
    this.pickables = [this.daisTop, ...this.exhibitObjs.map((o) => o.group)];
  }

  renderLegend() {
    this.el.querySelector('.legend').innerHTML = this.sim.legend.map(([c, l]) => `<li><i style="--k:${c}"></i>${l}</li>`).join('');
  }

  /* ─── الالتقاط ─── */
  raycast(x, y) {
    const rc = new THREE.Raycaster(); const r = this.cv.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const hit = rc.intersectObjects(this.pickables, true)[0];
    return hit && hit.distance < 14 ? hit.object.userData.pick : null;
  }

  tap(x, y) {
    if (this.inspecting) return;
    const id = this.raycast(x, y);
    if (id) this.inspect(id);
  }

  /* ─── التفتيش ─── */
  inspect(id) {
    const ex = id === 'stage' ? null : this.L.exhibits.find((e) => e.id === id);
    if (id !== 'stage' && !ex) return;
    if (!this.inspecting) this.savedPose = { pos: this.camera.position.clone(), yaw: this.controls.yaw, pitch: this.controls.pitch, fov: this.controls.fov };
    this.inspecting = id; this.controls.enabled = false; this.controls.keys.clear();
    this.el.classList.add('inspecting');
    this.sim.reset();
    if (ex) this.renderExhibit(ex); else this.renderStage();
    this.panel.hidden = false; this.panel.scrollTop = 0;
    requestAnimationFrame(() => this.panel.classList.add('open'));
    // الكاميرا تنتقل لتؤطّر المحاكاة بينما تبقى اللوحة ظاهرة
    const pt = this.isPortrait();
    const pose = { pos: new THREE.Vector3(STAGE.x, pt ? 2.9 : 2.45, STAGE.z + (pt ? 6.4 : 4.3)), look: new THREE.Vector3(STAGE.x, 1.3, STAGE.z - 0.2) };
    this.tweenCam(pose.pos, pose.look, pt ? 78 : 62);
    this.updateOffset();
    this.onInspectCb?.(id);
  }

  closeInspect() {
    if (!this.inspecting) return;
    this.inspecting = null; this.panel.classList.remove('open'); this.el.classList.remove('inspecting');
    setTimeout(() => { if (!this.inspecting) { this.panel.hidden = true; this.panel.innerHTML = ''; } }, 320);
    const s = this.savedPose;
    if (s) { const look = new THREE.Vector3(s.pos.x - Math.sin(s.yaw) * Math.cos(s.pitch), s.pos.y + Math.sin(s.pitch), s.pos.z - Math.cos(s.yaw) * Math.cos(s.pitch)); this.tweenCam(s.pos, look, s.fov, () => (this.controls.enabled = true)); }
    else this.controls.enabled = true;
    this.updateOffset(); this.onInspectCb?.(null);
  }

  tweenCam(pos, look, fov, done) {
    const c = this.controls; const from = { pos: this.camera.position.clone(), yaw: c.yaw, pitch: c.pitch, fov: c.fov };
    const d = pos.clone().sub(look); const yaw = Math.atan2(d.x, d.z); const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = yaw - from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.tween = { t: 0, dur: 0.9, from, to: { pos: pos.clone(), yaw: from.yaw + dy, pitch, fov }, done };
  }

  isPortrait() { return this.el.clientHeight > this.el.clientWidth; }

  navItems() { return ['stage', ...this.L.exhibits.map((e) => e.id)]; }

  panelHead(tag, title, kindLabel) {
    const items = this.navItems(); const i = items.indexOf(this.inspecting);
    return `<div class="ip-head">
      <div class="ip-meta"><span class="ip-tag">${tag}</span><span class="ip-kind">${kindLabel}</span></div>
      <div class="ip-nav">
        <button data-nav="${items[i - 1] || ''}" ${i > 0 ? '' : 'disabled'} aria-label="السابق">→</button>
        <button data-nav="${items[i + 1] || ''}" ${i < items.length - 1 ? '' : 'disabled'} aria-label="التالي">←</button>
        <button data-close aria-label="إغلاق">✕</button>
      </div></div><h2 class="ip-title">${title}</h2>`;
  }

  wirePanel() {
    this.panel.querySelector('[data-close]').onclick = () => this.closeInspect();
    this.panel.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => b.dataset.nav && this.inspect(b.dataset.nav)));
    this.panel.querySelector('.ip-grip')?.addEventListener('click', () => this.panel.classList.toggle('collapsed'));
  }

  renderStage() {
    const sim = this.L.sim; const defs = sim.params;
    this.panel.innerHTML = `<div class="ip-grip" aria-hidden="true"></div>${this.panelHead('المحاكاة الرئيسية', sim.title, 'تحكّم مباشر')}
      <p class="ip-statement">${sim.desc}</p>
      <section class="ip-sec"><h3>معايير المحاكاة</h3><div class="sliders">${Object.entries(defs).map(([k, d]) => {
        const step = (d.max - d.min) <= 1.01 ? 0.01 : (d.max - d.min) <= 20 ? 0.05 : 1;
        return `<label class="sl"><span class="sl-top"><span>${d.label}</span><output data-o="${k}">${plainNum(d.value)} ${d.unit}</output></span>
          <input type="range" min="${d.min}" max="${d.max}" step="${step}" value="${d.value}" data-k="${k}"></label>`; }).join('')}</div></section>
      <section class="ip-sec"><h3>دليل المتجهات</h3><ul class="legend big">${this.sim.legend.map(([c, l]) => `<li><i style="--k:${c}"></i>${l}</li>`).join('')}</ul></section>`;
    this.wirePanel();
    this.panel.querySelectorAll('input[type=range]').forEach((inp) => (inp.oninput = () => {
      const k = inp.dataset.k, d = defs[k];
      this.panel.querySelector(`[data-o="${k}"]`).textContent = `${plainNum(+inp.value)} ${d.unit}`;
      this.sim.set({ [k]: +inp.value });
    }));
  }

  renderExhibit(ex) {
    if (ex.kind === 'history') {
      this.panel.innerHTML = `<div class="ip-grip" aria-hidden="true"></div>${this.panelHead(ex.tag, ex.title, KIND.history)}
        <p class="ip-statement">${ex.body}</p>
        <section class="ip-sec"><h3>محطات زمنية</h3><ol class="events">${ex.events.map(([y, t]) => `<li><b>${y}</b><span>${t}</span></li>`).join('')}</ol></section>
        <p class="ip-source">المصدر: ويكيبيديا — للسياق التاريخي فقط</p>`;
      this.wirePanel(); return;
    }
    const raw = Object.fromEntries(ex.params.map((p) => [p.key, p.value]));
    this.panel.innerHTML = `<div class="ip-grip" aria-hidden="true"></div>${this.panelHead(ex.tag, ex.title, KIND[ex.kind])}
      <p class="ip-statement" data-stmt></p>
      <section class="ip-sec"><h3>غيّر المتغيرات <button class="reset" data-reset>إعادة الضبط</button></h3>
        <div class="sliders">${ex.params.map((p) => `<label class="sl"><span class="sl-top"><span>${p.label} <span class="m">${tex(p.sym)}</span></span><output data-o="${p.key}"></output></span>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-k="${p.key}" aria-label="${p.label}"></label>`).join('')}</div></section>
      <div class="answer"><span>الناتج</span><div class="ans-val" data-ans dir="ltr"></div></div>
      <section class="ip-sec"><h3>الحل خطوة بخطوة</h3><ol class="steps" data-steps></ol></section>
      <p class="insight">💡 ${ex.insight || ''}</p>
      <p class="live-note"><i class="live"></i> المحاكاة في المنتصف تتغير لحظياً مع كل تحريك</p>`;
    this.wirePanel();
    const update = () => {
      const vals = solve(ex, raw); const map = texMap(ex, raw, vals);
      this.panel.querySelector('[data-stmt]').innerHTML = rich(fill(ex.statement, map));
      ex.params.forEach((p) => (this.panel.querySelector(`[data-o="${p.key}"]`).textContent = `${paramPlain(p, raw[p.key])} ${p.unit}`));
      const a = ex.answer; const ar = /[\u0600-\u06FF]/.test(a.unit || '');
      this.panel.querySelector('[data-ans]').innerHTML = tex(`${a.sym} = ${map[a.key]}${a.unit && !ar ? `\\;\\text{${a.unit.replace('%', '\\%')}}` : ''}`, true) + (ar ? `<span class="ans-unit">${a.unit}</span>` : '');
      this.panel.querySelector('[data-steps]').innerHTML = ex.steps.map((s, i) => `<li style="--i:${i}"><span class="st-n">${i + 1}</span><div><p>${s.t}</p><div class="st-eq" dir="ltr">${tex(fill(s.l, map), true)}</div></div></li>`).join('');
      const bind = {}; for (const [k, expr] of Object.entries(ex.bind || {})) { try { bind[k] = evalExpr(expr, vals); } catch {} }
      this.sim.set(bind);
    };
    let pending = false;
    this.panel.querySelectorAll('input[type=range]').forEach((inp) => (inp.oninput = () => {
      raw[inp.dataset.k] = +inp.value;
      if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; update(); }); }
    }));
    this.panel.querySelector('[data-reset]').onclick = (e) => {
      e.preventDefault(); ex.params.forEach((p) => { raw[p.key] = p.value; this.panel.querySelector(`[data-k="${p.key}"]`).value = p.value; }); update();
    };
    update();
  }

  /* ─── الحلقة ─── */
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.updateOffset();
  }

  updateOffset() {
    const w = this.el.clientWidth, h = this.el.clientHeight; const c = this.camera;
    if (!this.inspecting) { c.clearViewOffset(); return; }
    if (w > 820) { const pw = Math.min(460, w * 0.42); c.setViewOffset(w, h, pw / 2, 0, w, h); }        // اللوحة على اليمين ⇒ نزيح المشهد لليسار
    else { const ph = h * 0.56; c.setViewOffset(w, h, 0, ph / 2 - 30, w, h); }                       // ورقة سفلية ⇒ نرفع المشهد
  }

  frame() {
    const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.elapsed += dt;
    if (this.tween) {
      const tw = this.tween; tw.t0 ??= now; tw.t = (now - tw.t0) / 1000 / tw.dur; const k = tw.t >= 1 ? 1 : 1 - Math.pow(1 - tw.t, 3);
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, k);
      this.controls.yaw = tw.from.yaw + (tw.to.yaw - tw.from.yaw) * k; this.controls.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * k;
      this.controls.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * k;
      if (tw.t >= 1) { this.tween = null; tw.done?.(); }
      this.camera.rotation.set(this.controls.pitch, this.controls.yaw, 0, 'YXZ'); this.camera.fov = this.controls.fov; this.camera.updateProjectionMatrix();
    } else this.controls.update(dt);
    this.sim.tick(dt);
    const t = this.elapsed;
    // أقرب معروض + تمييز
    let best = null, bd = 2.6; const cp = this.camera.position;
    for (const o of this.exhibitObjs) {
      o.gem.rotation.y += dt * 0.8; o.gem.position.y = 1.75 + Math.sin(t * 1.5 + o.group.position.z) * 0.04;
      const d = Math.hypot(cp.x - o.group.position.x, cp.z - o.group.position.z);
      if (d < bd) { bd = d; best = o; }
    }
    let hoverId = null; if (!this.isTouch && this.mouse && !this.inspecting && !this.controls.pointers.size) { this.hoverT = (this.hoverT || 0) + dt; if (this.hoverT > 0.1) { this.hoverT = 0; this.hoverId = this.raycast(...this.mouse); } hoverId = this.hoverId; }
    this.cv.style.cursor = hoverId ? 'pointer' : 'grab';
    for (const o of this.exhibitObjs) { const on = o === best || o.id === hoverId; o.ring.material.opacity = damp01(o.ring.material.opacity, on ? 0.9 : 0.22, dt); }
    if (best !== this.nearest) {
      this.nearest = best;
      if (best && !this.inspecting) { this.promptEl.hidden = false; this.promptEl.innerHTML = `<b>${best.ex.title}</b><span>${this.isTouch ? 'المس المعروض للتفتيش' : 'اضغط <kbd>E</kbd> أو انقر للتفتيش'}</span>`; }
      else this.promptEl.hidden = true;
    }
    if (this.inspecting) this.promptEl.hidden = true;
    this.roT += dt;
    if (this.roT > 0.2) { this.roT = 0; this.readoutEl.innerHTML = this.sim.readout().map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''); }
    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  /** خفض دقة العرض تلقائياً إذا انخفض معدل الإطارات (لضمان السلاسة على الجوال) */
  adapt(dt) {
    this.ftimes.push(dt); if (this.ftimes.length < 90) return;
    const avg = this.ftimes.reduce((a, b) => a + b, 0) / this.ftimes.length; this.ftimes = [];
    if (avg > 1 / 40 && this.pr > 0.75) { this.pr = Math.max(0.75, this.pr - 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); }
    else if (avg < 1 / 58 && this.pr < this.maxPR) { this.pr = Math.min(this.maxPR, this.pr + 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); }
    this.fps = 1 / avg;
  }

  dispose() {
    this.running = false; cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this._key); removeEventListener('resize', this._resize);
    this.controls?.dispose();
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => { mm.map?.dispose?.(); mm.dispose?.(); }); });
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
  }
}

function damp01(a, b, dt) { return a + (b - a) * (1 - Math.exp(-dt * 8)); }
