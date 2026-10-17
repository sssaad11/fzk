// المحاكيات (1): الجاذبية، الحركة الدورانية، الزخم
import * as THREE from 'three';
import { Arrow, COLORS, vlen, damp, dashedLine, textSprite, pbr, canvasTex } from './kit.js';
import { plainNum } from '../fmt.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const G = 6.67e-11;

/** الأساس المشترك: معاملات ناعمة الانتقال، قراءات، ودليل ألوان */
export class Sim {
  constructor(ctx, defs, discrete = []) {
    this.ctx = ctx; this.root = new THREE.Group(); this.discrete = new Set(discrete);
    this.p = {}; this.target = {}; this.defs = defs;
    for (const [k, d] of Object.entries(defs)) this.p[k] = this.target[k] = d.value;
    this.t = 0; this.legend = [];
  }
  set(params) {
    for (const [k, v] of Object.entries(params)) {
      if (!(k in this.defs) || !isFinite(v)) continue;
      const d = this.defs[k]; const c = Math.max(d.min, Math.min(d.max, v));
      this.target[k] = c; if (this.discrete.has(k)) this.p[k] = c;
      this.onParam?.(k);
    }
  }
  reset() { this.set(Object.fromEntries(Object.entries(this.defs).map(([k, d]) => [k, d.value]))); }
  tick(dt) { for (const k in this.p) if (!this.discrete.has(k)) this.p[k] = damp(this.p[k], this.target[k], 5, dt); this.t += dt; this.update(dt); }
  readout() { return []; }
  shadow(obj) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }
}

function glowSprite(color, size) {
  const tex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, color); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.set(size, size, 1); return s;
}

/* ════════ 1-1 نظام شمسي: قوانين كبلر ونيوتن ════════ */
export class Orbits extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [[COLORS.force, 'قوة الجذب F'], [COLORS.velocity, 'السرعة v'], ['#ffd27a', 'مساحات متساوية في أزمنة متساوية']];
    this.tilt = new THREE.Group(); this.tilt.position.set(0, 1.45, 0); this.tilt.rotation.x = 0.55; this.root.add(this.tilt);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.3, 48, 32), new THREE.MeshStandardMaterial({ color: '#ffcf6b', emissive: '#ffb340', emissiveIntensity: 2.2 }));
    this.tilt.add(this.sun, glowSprite('rgba(255,190,90,.9)', 1.3));
    this.light = new THREE.PointLight('#ffd9a0', 6, 7, 1.6); this.tilt.add(this.light);
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), pbr('#4f9de0', 0.45, 0.05));
    this.shadow(this.planet); this.tilt.add(this.planet);
    this.orbitGeo = new THREE.BufferGeometry(); this.orbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(129 * 3), 3));
    this.orbit = new THREE.Line(this.orbitGeo, new THREE.LineBasicMaterial({ color: '#cfe1ff', transparent: true, opacity: 0.55 })); this.tilt.add(this.orbit);
    // قطاعات المساحة
    this.sectors = [0, 1].map((i) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 9), 3)); geo.setDrawRange(0, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i ? '#ffd27a' : '#7fc4ff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      this.tilt.add(m); return { m, pts: [], color: i };
    });
    this.cur = 0; this.secT = 0; this.M = 0;
    this.fArrow = new Arrow(COLORS.force, { label: 'F' }); this.vArrow = new Arrow(COLORS.velocity, { label: 'v' });
    this.tilt.add(this.fArrow, this.vArrow);
  }
  geom() {
    const a = this.p.a * 0.36, e = this.p.e, b = a * Math.sqrt(1 - e * e);
    return { a, e, b };
  }
  update(dt) {
    const { a, e, b } = this.geom();
    const pos = this.orbitGeo.attributes.position.array;
    for (let i = 0; i <= 128; i++) { const E = (i / 128) * Math.PI * 2; pos[i * 3] = a * (Math.cos(E) - e); pos[i * 3 + 1] = 0; pos[i * 3 + 2] = b * Math.sin(E); }
    this.orbitGeo.attributes.position.needsUpdate = true;
    const n = (Math.PI * 2 / 11) * Math.pow(4.5 / this.p.a, 1.5) * Math.sqrt(this.p.ms);
    this.M += n * dt;
    let E = this.M; for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - this.M) / (1 - e * Math.cos(E));
    const x = a * (Math.cos(E) - e), z = b * Math.sin(E);
    const dE = n / (1 - e * Math.cos(E));
    const vel = V(-a * Math.sin(E) * dE, 0, b * Math.cos(E) * dE);
    const ppos = V(x, 0, z); this.planet.position.copy(ppos);
    this.planet.scale.setScalar(0.1 + 0.06 * Math.cbrt(this.p.mp));
    this.planet.rotation.y += dt;
    const r = ppos.length();
    const F = this.p.ms * this.p.mp / (r * r);
    this.fArrow.set(ppos, ppos.clone().negate().normalize().multiplyScalar(Math.abs(vlen(F, 0.9, 0.7))));
    this.vArrow.set(ppos, vel.clone().normalize().multiplyScalar(Math.abs(vlen(vel.length(), 1.2, 0.8))));
    this.sun.scale.setScalar(0.8 + 0.2 * Math.cbrt(this.p.ms));
    // مساحات كبلر: قطاع جديد كل 1.4 ثانية
    this.secT += dt;
    const S = this.sectors[this.cur]; S.pts.push(ppos.clone());
    if (this.secT > 1.4) { this.secT = 0; this.cur = 1 - this.cur; const nS = this.sectors[this.cur]; nS.pts = [ppos.clone()]; }
    for (const s of this.sectors) {
      const arr = s.m.geometry.attributes.position.array; const pts = s.pts.slice(-199);
      for (let i = 0; i < pts.length - 1; i++) { arr.set([0, 0, 0, pts[i].x, 0, pts[i].z, pts[i + 1].x, 0, pts[i + 1].z], i * 9); }
      s.m.geometry.setDrawRange(0, Math.max(0, pts.length - 1) * 3); s.m.geometry.attributes.position.needsUpdate = true;
      s.m.material.opacity = s === S ? 0.32 : 0.16;
    }
    this.state = { r, v: vel.length(), F, T: (2 * Math.PI) / n };
  }
  readout() {
    const s = this.state || {};
    return [['البعد عن النجم', plainNum(s.r / 0.36) + ' وحدة'], ['قوة الجذب (نسبية)', plainNum(s.F * 100)], ['السرعة (نسبية)', plainNum(s.v)], ['الزمن الدوري للعرض', plainNum(s.T) + ' s']];
  }
}

/* ════════ 1-2 قمر صناعي حول الأرض ════════ */
function earthTex(moon) {
  return canvasTex(1024, 512, (g, w, h) => {
    if (moon) {
      g.fillStyle = '#9a9a96'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, r = 3 + Math.random() ** 3 * 40; g.fillStyle = `rgba(${Math.random() > 0.5 ? 60 : 200},${Math.random() > 0.5 ? 60 : 200},${Math.random() > 0.5 ? 60 : 200},.18)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      return;
    }
    const oc = g.createLinearGradient(0, 0, 0, h); oc.addColorStop(0, '#1d4f8c'); oc.addColorStop(0.5, '#2367a8'); oc.addColorStop(1, '#1d4f8c');
    g.fillStyle = oc; g.fillRect(0, 0, w, h);
    const blob = (cx, cy, rx, ry, col) => { g.fillStyle = col; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(cx + (Math.random() - 0.5) * rx * 1.4, cy + (Math.random() - 0.5) * ry * 1.4, rx * (0.2 + Math.random() * 0.5), ry * (0.2 + Math.random() * 0.5), Math.random() * 3, 0, 7); g.fill(); } };
    [[220, 160, 90, 70], [300, 330, 60, 90], [540, 150, 110, 60], [560, 300, 70, 90], [760, 170, 130, 70], [840, 360, 60, 40]].forEach(([x, y, a, b]) => blob(x, y, a, b, Math.random() > 0.4 ? '#4f7d3a' : '#a08552'));
    g.fillStyle = '#eef3f7'; g.fillRect(0, 0, w, 26); g.fillRect(0, h - 30, w, 30);
  });
}

export class Satellite extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs, ['moon']);
    this.legend = [[COLORS.weight, 'قوة الجاذبية (نحو المركز)'], [COLORS.velocity, 'السرعة المدارية v']];
    this.root.position.set(0, 1.4, 0);
    this.tilt = new THREE.Group(); this.tilt.rotation.x = 0.5; this.tilt.rotation.z = -0.08; this.root.add(this.tilt);
    this.earthMat = new THREE.MeshStandardMaterial({ map: earthTex(false), roughness: 0.75, metalness: 0 });
    this.moonMat = new THREE.MeshStandardMaterial({ map: earthTex(true), roughness: 0.95 });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 64, 40), this.earthMat); this.shadow(this.body); this.root.add(this.body);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(0.64, 48, 32), new THREE.MeshBasicMaterial({ color: '#7fb8ff', transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.root.add(this.atmo);
    const sat = this.sat = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), this.ctx.mats.brass);
    const panelMat = pbr('#1d3d8f', 0.3, 0.6, { emissive: '#0a1640', emissiveIntensity: 0.4 });
    for (const s of [-1, 1]) { const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.26), panelMat); pnl.position.z = s * 0.2; pnl.rotation.x = 0; sat.add(pnl); }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8, 0, Math.PI * 2, 0, 1.1), this.ctx.mats.steel); dish.position.y = 0.07; sat.add(bus, dish);
    this.shadow(sat); this.tilt.add(sat);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 160), new THREE.MeshBasicMaterial({ color: '#cfe1ff', transparent: true, opacity: 0.5 }));
    this.ring.rotation.x = Math.PI / 2; this.tilt.add(this.ring);
    this.gArrow = new Arrow(COLORS.weight, { label: 'F', sub: 'g' }); this.vArrow = new Arrow(COLORS.velocity, { label: 'v' });
    this.tilt.add(this.gArrow, this.vArrow); this.ang = 0;
  }
  update(dt) {
    const moon = this.p.moon >= 0.5; const R = moon ? 0.42 : 0.6;
    this.body.material = moon ? this.moonMat : this.earthMat; this.atmo.visible = !moon;
    this.body.scale.setScalar(R / 0.6); this.body.rotation.y += dt * 0.15;
    const rs = R * (1 + (this.p.rr - 1) * 0.42);
    this.ring.scale.setScalar(rs);
    const w = Math.max(0.12, 1.3 * Math.sqrt(Math.max(this.p.mc, 0.05)) * Math.pow(this.p.rr, -1.5));
    this.ang += w * dt;
    const pos = V(Math.cos(this.ang) * rs, 0, -Math.sin(this.ang) * rs);
    this.sat.position.copy(pos); this.sat.rotation.y = this.ang;
    const g = this.p.mc / (this.p.rr * this.p.rr), v = Math.sqrt(this.p.mc / this.p.rr);
    this.gArrow.set(pos, pos.clone().negate().normalize().multiplyScalar(Math.abs(vlen(g, 0.6, 0.6))));
    this.vArrow.set(pos, V(-Math.sin(this.ang), 0, -Math.cos(this.ang)).multiplyScalar(Math.abs(vlen(v, 0.8, 0.7))));
    const M = this.p.mc * 5.97e24, Rr = this.p.rr * (moon ? 1.74e6 : 6.38e6);
    this.state = { r: Rr, v: Math.sqrt(G * M / Rr), T: 2 * Math.PI * Math.sqrt(Rr ** 3 / (G * M)), g: G * M / (Rr * Rr) };
  }
  readout() {
    const s = this.state || {};
    return [['نصف قطر المدار r', plainNum(s.r) + ' m'], ['السرعة المدارية v', plainNum(s.v) + ' m/s'], ['الزمن الدوري T', plainNum(s.T / 60) + ' min'], ['مجال الجاذبية g', plainNum(s.g) + ' N/kg']];
  }
}

/* ════════ 2-1 قرص دوّار ════════ */
export class Disk extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [[COLORS.velocity, 'السرعة الخطية v = rω'], [COLORS.torque, 'السرعة الزاوية ω'], [COLORS.displacement, 'الإزاحة الزاوية θ']];
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 40), this.ctx.mats.darkSteel); base.position.y = 0.25;
    const tex = canvasTex(1024, 1024, (g, w) => {
      const c = w / 2; g.fillStyle = '#1b1e26'; g.fillRect(0, 0, w, w);
      for (let r = 40; r < c; r += 6) { g.strokeStyle = `rgba(255,255,255,${0.02 + (r % 60 === 4 ? 0.05 : 0)})`; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; const r0 = k % 6 ? c - 40 : c - 90; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8)); g.stroke(); }
      g.fillStyle = '#f5f1e6'; g.fillRect(c, c - 5, c - 6, 10);
    });
    this.disk = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.08, 96), [this.ctx.mats.steel, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.2 }), this.ctx.mats.steel]);
    this.disk.position.y = 0.55; this.shadow(this.disk);
    this.root.add(this.shadow(base), this.disk);
    this.pucks = [0, 1].map((i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 32), pbr(i ? '#ffd23f' : '#ff7a59', 0.35, 0.1)); m.position.y = 0.08; this.shadow(m); this.disk.add(m); return m; });
    this.vA = [0, 1].map(() => new Arrow(COLORS.velocity, { label: 'v' })); this.vA.forEach((a) => this.root.add(a));
    this.wArrow = new Arrow(COLORS.torque, { label: 'ω' }); this.root.add(this.wArrow);
    this.arcMat = new THREE.MeshBasicMaterial({ color: COLORS.displacement, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.arc = new THREE.Mesh(new THREE.BufferGeometry(), this.arcMat); this.arc.rotation.x = -Math.PI / 2; this.arc.position.y = 0.6; this.root.add(this.arc);
    this.theta = 0; this.w = this.p.omega; this.tw = 0; this.arcT = 0;
  }
  onParam(k) { if (k === 'omega' || k === 'alpha') { this.tw = 0; } }
  update(dt) {
    this.tw += dt;
    if (Math.abs(this.p.alpha) > 0.01) { this.w += this.p.alpha * dt; if (this.w > 6 || this.w < 0 || this.tw > 7) { this.w = this.target.omega; this.tw = 0; this.theta = 0; } }
    else this.w = this.p.omega;
    this.theta += this.w * dt;
    this.disk.rotation.y = this.theta;
    const r = Math.min(this.p.r, 1.9);
    const rs = [r, r / 2];
    this.pucks.forEach((m, i) => m.position.set(rs[i], 0.08, 0));
    rs.forEach((rr, i) => {
      const a = this.theta; const pos = V(Math.cos(a) * rr, 0.68, -Math.sin(a) * rr);
      const tang = V(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(Math.abs(vlen(rr * this.w, 2.2, 0.9)));
      this.vA[i].set(pos, tang);
    });
    this.wArrow.set(V(0, 0.62, 0), V(0, Math.max(0.05, vlen(this.w, 2.5, 0.9)), 0));
    this.arcT += dt;
    if (this.arcT > 0.06) {
      this.arcT = 0; const th = this.theta % (Math.PI * 2);
      this.arc.geometry.dispose(); this.arc.geometry = new THREE.RingGeometry(0.25, Math.max(0.3, r * 0.45), 48, 1, 0, Math.max(0.01, th));
    }
    this.state = { w: this.w, th: this.theta % (Math.PI * 2), v1: r * this.w, v2: (r / 2) * this.w, r };
  }
  readout() {
    const s = this.state || {};
    return [['السرعة الزاوية ω', plainNum(s.w) + ' rad/s'], ['θ في الدورة الحالية', plainNum(s.th) + ' rad'], [`v عند r = ${plainNum(s.r)} m`, plainNum(s.v1) + ' m/s'], ['v عند r/2', plainNum(s.v2) + ' m/s']];
  }
}

/* ════════ 2-2 عجلة ومفتاح: العزم ════════ */
export class Torque extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [[COLORS.force, 'القوة F'], [COLORS.torque, 'متجه العزم τ'], [COLORS.displacement, 'ذراع القوة L = r sinθ']];
    this.root.position.set(0, 1.45, 0);
    const stand = new THREE.Group();
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.45, 0.12), this.ctx.mats.darkSteel); post.position.set(0, -0.72, s * 0.32); stand.add(post); }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 16), this.ctx.mats.steel); axle.rotation.x = Math.PI / 2; stand.add(axle);
    this.root.add(this.shadow(stand));
    const wheel = this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 16, 72), this.ctx.mats.steel);
    for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 8), this.ctx.mats.steel); sp.rotation.z = (k / 6) * Math.PI; wheel.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 24), this.ctx.mats.brass); hub.rotation.x = Math.PI / 2;
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.04), pbr('#c7ccd6', 0.25, 1)); this.arm.geometry.translate(0.5, 0, 0); this.arm.position.z = 0.1;
    wheel.add(rim, hub, this.arm); this.shadow(wheel); this.root.add(wheel);
    this.F = new Arrow(COLORS.force, { label: 'F' }); this.tau = new Arrow(COLORS.torque, { label: 'τ' });
    this.root.add(this.F, this.tau);
    this.leverLine = dashedLine([V(), V(1, 0, 0)], COLORS.displacement); this.leverLine.position.z = 0.12; this.root.add(this.leverLine);
    this.actLine = dashedLine([V(), V(1, 0, 0)], '#ffffff', { opacity: 0.35 }); this.actLine.position.z = 0.12; this.root.add(this.actLine);
    this.Llabel = textSprite('L', { color: COLORS.displacement, size: 0.16 }); this.root.add(this.Llabel);
    this.ang = 0.35; this.w = 0; this.tw = 0;
  }
  onParam() { this.tw = 0; this.w = 0; }
  update(dt) {
    const r = this.p.r * 1.9, th = THREE.MathUtils.degToRad(this.p.theta);
    const tau = this.p.F * this.p.r * Math.sin(th), alpha = tau / this.p.I;
    this.tw += dt; this.w += alpha * dt * 0.12; this.ang += this.w * dt;
    if (this.tw > 6 || Math.abs(this.w) > 4) { this.tw = 0; this.w = 0; this.ang = 0.35; }
    this.wheel.rotation.z = this.ang; this.arm.scale.x = r;
    const ax = V(Math.cos(this.ang), Math.sin(this.ang), 0);
    const tip = ax.clone().multiplyScalar(r).setZ(0.12);
    const fdir = ax.clone().applyAxisAngle(V(0, 0, 1), th);
    const fl = Math.abs(vlen(this.p.F, 80, 0.8));
    this.F.set(tip, fdir.clone().multiplyScalar(fl));
    this.tau.set(V(0, 0, 0.1), V(0, 0, Math.sign(tau) * Math.max(0.05, Math.abs(vlen(tau, 30, 0.8)))));
    // ذراع القوة: العمود من المحور على خط عمل القوة
    const foot = tip.clone().setZ(0).sub(fdir.clone().multiplyScalar(tip.clone().setZ(0).dot(fdir)));
    const set = (line, a, b) => { const p = line.geometry.attributes.position; p.setXYZ(0, a.x, a.y, 0); p.setXYZ(1, b.x, b.y, 0); p.needsUpdate = true; line.computeLineDistances(); };
    set(this.leverLine, V(), foot);
    set(this.actLine, tip.clone().sub(fdir.clone().multiplyScalar(1.6)), tip.clone().add(fdir.clone().multiplyScalar(1.6)));
    this.Llabel.position.copy(foot.clone().multiplyScalar(0.5)).setZ(0.2);
    this.state = { tau, L: this.p.r * Math.abs(Math.sin(th)), alpha };
  }
  readout() {
    const s = this.state || {};
    return [['العزم τ', plainNum(s.tau) + ' N·m'], ['ذراع القوة L', plainNum(s.L) + ' m'], ['عزم القصور I', plainNum(this.p.I) + ' kg·m²'], ['التسارع الزاوي α', plainNum(s.alpha) + ' rad/s²']];
  }
}

/* ════════ 2-3 عارضة الاتزان (ثلاثة أوضاع) ════════ */
export class Seesaw extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs, ['mode']);
    this.legend = [[COLORS.weight, 'الأوزان mg'], [COLORS.normal, 'قوى الدعم / الشد'], [COLORS.torque, 'محصلة العزم']];
    const m = this.ctx.mats;
    this.beam = new THREE.Group(); this.beam.position.y = 1.0;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 0.5), this.ctx.mats.wood); this.beam.add(plank);
    for (let k = -5; k <= 5; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.002, 0.5), pbr('#f2e6c8', 0.6)); t.position.set(k * 0.5, 0.051, 0); this.beam.add(t); }
    this.pivot = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 3), m.darkSteel); this.pivot.position.y = 0.5; this.pivot.rotation.y = Math.PI / 6;
    this.supports = [-2.4, 2.4].map((x) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.95, 0.5), m.marble); s.position.set(x, 0.47, 0); this.root.add(s); return s; });
    this.hinge = new THREE.Group(); const hp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.5), m.marble); hp.position.set(-2.62, 0.95, 0);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16), m.brass); pin.rotation.x = Math.PI / 2; pin.position.set(-2.45, 1.0, 0);
    this.hinge.add(hp, pin);
    this.gantry = new THREE.Group(); const gp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.9, 0.15), m.darkSteel); gp.position.set(2.9, 1.45, -0.4);
    const gb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.15), m.darkSteel); gb.position.set(2.5, 2.85, -0.4);
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), pbr('#d9c9a3', 0.8)); this.gantry.add(gp, gb, this.rope);
    this.blocks = [0, 1].map((i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pbr(i ? '#3f8fe0' : '#e0613f', 0.4, 0.1)); this.beam.add(b); return b; });
    this.hang = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), pbr('#999', 0.5, 1)); this.beam.add(this.hang);
    this.root.add(this.shadow(this.beam), this.shadow(this.pivot), this.shadow(this.hinge), this.shadow(this.gantry));
    this.supports.forEach((s) => this.shadow(s));
    this.W = [0, 1, 2].map((i) => new Arrow(COLORS.weight, { label: 'F', sub: ['g1', 'g2', 'g'][i] }));
    this.N = [0, 1].map((i) => new Arrow(COLORS.normal, { label: i ? 'F' : 'F', sub: i ? 'R' : 'L' }));
    this.tauA = new Arrow(COLORS.torque, { label: 'Στ' });
    [...this.W, ...this.N, this.tauA].forEach((a) => this.root.add(a));
    this.angle = 0; this.av = 0;
  }
  update(dt) {
    const g = 9.8, { m1, m2, mode } = this.p; let { x1, x2 } = this.p;
    const md = Math.round(mode);
    this.pivot.visible = md === 0; this.supports.forEach((s) => (s.visible = md === 1)); this.hinge.visible = md === 2; this.gantry.visible = md === 2;
    const side = (m) => 0.16 + 0.14 * Math.cbrt(m / 10);
    const s1 = side(m1), s2 = side(m2);
    let net = 0, pos1, pos2;
    const toWorld = (v) => this.beam.localToWorld(v.clone()).sub(this.root.getWorldPosition(V()));
    if (md === 0) {
      pos1 = -Math.min(x1, 2.4); pos2 = Math.min(x2, 2.4);
      net = m2 * g * pos2 + m1 * g * pos1; // موجب = مع عقارب الساعة (يميل يميناً)
      const target = -0.26 * Math.tanh(net / 120);
      this.av += ((target - this.angle) * 30 - this.av * 7) * dt; this.angle += this.av * dt;
      this.blocks[0].visible = true; this.hang.visible = false;
      this.blocks[0].scale.setScalar(s1); this.blocks[0].position.set(pos1, 0.05 + s1 / 2, 0);
      this.blocks[1].scale.setScalar(s2); this.blocks[1].position.set(pos2, 0.05 + s2 / 2, 0);
      this.beam.position.set(0, 1.0, 0);
    } else {
      this.angle = damp(this.angle, 0, 8, dt);
      this.beam.position.set(0, 1.0, 0);
      this.blocks[0].visible = false;
      if (md === 1) { pos2 = THREE.MathUtils.clamp(x2, -2.3, 2.3); this.blocks[1].scale.setScalar(s2); this.blocks[1].position.set(pos2, 0.05 + s2 / 2, 0); this.hang.visible = false; }
      else { pos2 = 2.4; this.blocks[1].scale.setScalar(s2); this.blocks[1].position.set(pos2, -0.55 - s2 / 2, 0); this.hang.visible = true; this.hang.position.set(2.4, -0.3, 0); this.hang.scale.y = 0.5; }
    }
    this.beam.rotation.z = this.angle;
    const wl = (m) => Math.abs(vlen(m * g, 500, 0.75));
    const hideAll = () => { this.W.forEach((a) => (a.visible = false)); this.N.forEach((a) => (a.visible = false)); };
    hideAll();
    if (md === 0) {
      this.W[0].set(toWorld(V(pos1, 0.05 + s1 / 2, 0.3)), V(0, -wl(m1), 0));
      this.W[1].set(toWorld(V(pos2, 0.05 + s2 / 2, 0.3)), V(0, -wl(m2), 0));
      this.N[0].set(V(0, 0.95, 0.32), V(0, wl(m1 + m2), 0));
      this.tauA.set(V(0, 1.0, 0.3), V(0, 0, -Math.sign(net) * Math.abs(vlen(net, 150, 0.7))));
      this.state = { t1: m1 * g * Math.abs(pos1), t2: m2 * g * pos2, net, FN: (m1 + m2) * g };
    } else if (md === 1) {
      const FR = (m1 * g * 2.4 + m2 * g * (pos2 + 2.4)) / 4.8, FL = (m1 + m2) * g - FR;
      this.W[2].set(V(0, 1.0, 0.3), V(0, -wl(m1), 0));
      this.W[1].set(V(pos2, 1.05 + s2 / 2, 0.3), V(0, -wl(m2), 0));
      this.N[0].set(V(-2.4, 0.3, 0.3), V(0, wl(FL / g), 0)); this.N[1].set(V(2.4, 0.3, 0.3), V(0, wl(FR / g), 0));
      this.tauA.visible = false; this.state = { FL, FR };
    } else {
      const T = m1 * g / 2 + m2 * g, FH = (m1 + m2) * g - T;
      this.rope.position.set(2.4, 1.0 + (2.85 - 1.0) / 2, 0.4); this.rope.scale.y = 1.85;
      this.W[2].set(V(0, 1.0, 0.3), V(0, -wl(m1), 0));
      this.W[1].set(V(2.4, 0.45 - s2 / 2, 0.35), V(0, -wl(m2), 0));
      this.N[1].set(V(2.4, 1.05, 0.35), V(0, wl(T / g), 0)); this.N[0].set(V(-2.4, 0.4, 0.35), V(0, wl(Math.max(FH, 0) / g), 0));
      this.tauA.visible = false; this.state = { T, FH };
    }
  }
  readout() {
    const s = this.state || {}; const md = Math.round(this.p.mode);
    if (md === 0) return [['عزم الكتلة اليسرى', plainNum(s.t1) + ' N·m'], ['عزم الكتلة اليمنى', plainNum(s.t2) + ' N·m'], ['محصلة العزم Στ', plainNum(s.net) + ' N·m'], ['الحالة', Math.abs(s.net) < 2 ? 'متزنة ✓' : 'تميل']];
    if (md === 1) return [['قوة الدعامة اليسرى', plainNum(s.FL) + ' N'], ['قوة الدعامة اليمنى', plainNum(s.FR) + ' N'], ['ΣF', '0 ✓'], ['Στ', '0 ✓']];
    return [['قوة الشد T', plainNum(s.T) + ' N'], ['قوة المفصّلة', plainNum(s.FH) + ' N'], ['ΣF', '0 ✓'], ['Στ', '0 ✓']];
  }
}

/* ════════ 3-1 الدفع: كرة تصطدم بحاجز ════════ */
export class Impulse extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [[COLORS.momentum, 'الزخم p'], [COLORS.force, 'متوسط القوة F أثناء التلامس']];
    const m = this.ctx.mats;
    const track = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.06, 0.7), m.darkSteel); track.position.set(0, 0.6, 0.3);
    const legs = [-2.4, 2.4].map((x) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.5), m.darkSteel); l.position.set(x, 0.3, 0.3); return l; });
    this.wall = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.7), pbr('#2f3542', 0.85)); pad.position.set(2.5, 1.03, 0.3);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.78), m.brass); frame.position.set(2.64, 1.03, 0.3);
    this.wall.add(pad, frame);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), pbr('#f4f1ea', 0.35, 0.05));
    this.root.add(this.shadow(track), ...legs.map((l) => this.shadow(l)), this.shadow(this.wall), this.shadow(this.ball));
    this.pA = new Arrow(COLORS.momentum, { label: 'p' }); this.FA = new Arrow(COLORS.force, { label: 'F', radius: 0.04 });
    this.root.add(this.pA, this.FA);
    // لوحة منحنى القوة-الزمن
    this.graphCanvas = document.createElement('canvas'); this.graphCanvas.width = 1024; this.graphCanvas.height = 560;
    this.graphTex = new THREE.CanvasTexture(this.graphCanvas); this.graphTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.31), new THREE.MeshStandardMaterial({ map: this.graphTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: this.graphTex, emissiveIntensity: 0.35 }));
    board.position.set(0, 2.15, -0.9); this.root.add(board);
    this.phase = 0; this.pt = 0; this.x = -2.2; this.dirty = true;
  }
  onParam() { this.dirty = true; }
  drawGraph() {
    const g = this.graphCanvas.getContext('2d'), W = 1024, H = 560;
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e4e1d6'; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const ox = 90, oy = H - 80, w = W - 150, h = H - 160;
    g.strokeStyle = '#141a2e'; g.lineWidth = 4; g.beginPath(); g.moveTo(ox, 40); g.lineTo(ox, oy); g.lineTo(ox + w, oy); g.stroke();
    const F = this.p.m * (this.p.vin + this.p.vout) / this.p.dt;
    const width = Math.min(0.85, 0.12 + this.p.dt * 2.6) * w, peak = Math.min(1, 0.15 + Math.log10(1 + F) / 4.2) * h;
    const x0 = ox + (w - width) / 2;
    g.beginPath(); g.moveTo(x0, oy); for (let i = 0; i <= 60; i++) { const u = i / 60; g.lineTo(x0 + u * width, oy - Math.sin(Math.PI * u) ** 2 * peak * 1.6); } g.closePath();
    g.fillStyle = 'rgba(255,77,94,.22)'; g.fill(); g.strokeStyle = '#ff4d5e'; g.lineWidth = 6; g.stroke();
    g.setLineDash([12, 10]); g.strokeStyle = '#141a2e'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, oy - peak * 0.8); g.lineTo(x0 + width, oy - peak * 0.8); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#141a2e'; g.font = 'italic 600 40px "Times New Roman", serif'; g.fillText('F', ox - 50, 70); g.fillText('t', ox + w + 10, oy + 10);
    g.font = '600 34px "Plex Arabic", sans-serif'; g.direction = 'rtl'; g.textAlign = 'center';
    g.fillText(`المساحة = الدفع FΔt = ${plainNum(this.p.m * (this.p.vin + this.p.vout))} N·s`, W / 2, 40);
    g.font = '500 28px "Plex Arabic", sans-serif'; g.fillStyle = '#4a5170';
    g.fillText(`F المتوسطة ≈ ${plainNum(F)} N   ·   Δt = ${plainNum(this.p.dt)} s`, W / 2, H - 28);
    this.graphTex.needsUpdate = true;
  }
  update(dt) {
    if (this.dirty) { this.dirty = false; this.drawGraph(); }
    const r = 0.1 + 0.07 * Math.cbrt(this.p.m); const y = 0.63 + r;
    const vin = THREE.MathUtils.clamp(this.p.vin * 0.22, 0.5, 3.2), vout = THREE.MathUtils.clamp(this.p.vout * 0.22, 0, 3.2);
    const contact = 0.25 + Math.min(this.p.dt, 0.3) * 2.5;
    this.pt += dt; let sq = 1; const xw = 2.4 - r;
    if (this.phase === 0) { this.x += vin * dt; if (this.x >= xw) { this.x = xw; this.phase = 1; this.pt = 0; } }
    else if (this.phase === 1) { sq = 1 - 0.28 * Math.sin(Math.PI * Math.min(this.pt / contact, 1)); if (this.pt > contact) { this.phase = 2; this.pt = 0; } }
    else if (this.phase === 2) { this.x -= vout * dt; if (this.x < -2.4 || this.pt > 3.5 || vout === 0 && this.pt > 1.2) { this.phase = 3; this.pt = 0; } }
    else if (this.pt > 0.6) { this.phase = 0; this.x = -2.2; }
    this.ball.scale.set(r * sq, r / Math.sqrt(sq), r / Math.sqrt(sq)); this.ball.position.set(this.x + (1 - sq) * r, y, 0.3);
    this.ball.rotation.z -= (this.phase === 0 ? vin : this.phase === 2 ? -vout : 0) * dt / r;
    const pl = (v) => Math.abs(vlen(this.p.m * v, 8, 0.9));
    const at = V(this.x, y + r + 0.15, 0.3);
    if (this.phase === 0) this.pA.set(at, V(pl(this.p.vin), 0, 0));
    else if (this.phase === 2) this.pA.set(at, V(-pl(this.p.vout), 0, 0));
    else this.pA.visible = false;
    const F = this.p.m * (this.p.vin + this.p.vout) / this.p.dt;
    if (this.phase === 1) this.FA.set(V(this.x + r, y, 0.3), V(-Math.abs(vlen(F, 400, 1.0)), 0, 0)); else this.FA.visible = false;
    this.state = { pi: this.p.m * this.p.vin, pf: -this.p.m * this.p.vout, F };
  }
  readout() {
    const s = this.state || {};
    return [['الزخم قبل pᵢ', plainNum(s.pi) + ' kg·m/s'], ['الزخم بعد p_f', plainNum(s.pf) + ' kg·m/s'], ['التغير Δp', plainNum(s.pf - s.pi) + ' kg·m/s'], ['متوسط القوة F', plainNum(-s.F) + ' N']];
  }
}

/* ════════ 3-2 حفظ الزخم: عربتان ════════ */
export class Collision extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs, ['stick']);
    this.legend = [[COLORS.momentum, 'زخم كل عربة'], ['#ffffff', 'الزخم الكلي (ثابت)']];
    const m = this.ctx.mats;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 0.3), m.steel); rail.position.set(0, 0.7, 0.2);
    for (const x of [-2.7, 2.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.3), m.darkSteel); l.position.set(x, 0.35, 0.2); this.root.add(this.shadow(l)); }
    for (const x of [-3.02, 3.02]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.4), m.brass); st.position.set(x, 0.85, 0.2); this.root.add(this.shadow(st)); }
    this.root.add(this.shadow(rail));
    this.carts = ['#3f8fe0', '#e0613f'].map((c, i) => {
      const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.18, 0.34), pbr(c, 0.35, 0.2));
      const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.3), m.darkSteel); top.position.y = 0.11;
      for (const s of [-0.35, 0.35]) for (const z of [-0.14, 0.14]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), m.rubber); wh.rotation.x = Math.PI / 2; wh.position.set(s, -0.1, z); g.add(wh); }
      g.add(body, top); g.userData.body = [body, top]; this.root.add(this.shadow(g));
      const lab = textSprite(i ? 'B' : 'A', { color: '#ffffff', size: 0.16, italic: false }); lab.position.y = 0.3; g.add(lab);
      return g;
    });
    this.pa = [new Arrow(COLORS.momentum, { label: 'p', sub: 'A' }), new Arrow(COLORS.momentum, { label: 'p', sub: 'B' })];
    this.pt = new Arrow('#ffffff', { label: 'p', sub: 'total', radius: 0.035 });
    [...this.pa, this.pt].forEach((a) => this.root.add(a));
    this.resetRun();
  }
  onParam() { this.resetRun(); }
  resetRun() { this.x = [-1.7, 0.9]; this.v = null; this.joined = false; this.time = 0; }
  update(dt) {
    const { mA, mB, stick } = this.p;
    if (!this.v) this.v = [this.target.vA * 0.35, this.target.vB * 0.35];
    const w = [0.3 + 0.1 * mA, 0.3 + 0.1 * mB];
    this.time += dt;
    this.x[0] += this.v[0] * dt; this.x[1] += this.v[1] * dt;
    if (!this.joined && this.x[0] + w[0] / 2 >= this.x[1] - w[1] / 2 && this.v[0] > this.v[1]) {
      if (stick >= 0.5) { const v = (mA * this.v[0] + mB * this.v[1]) / (mA + mB); this.v = [v, v]; this.joined = true; }
      else { const [u1, u2] = this.v; this.v = [((mA - mB) * u1 + 2 * mB * u2) / (mA + mB), ((mB - mA) * u2 + 2 * mA * u1) / (mA + mB)]; }
      const overlap = this.x[0] + w[0] / 2 - (this.x[1] - w[1] / 2); this.x[0] -= overlap / 2; this.x[1] += overlap / 2;
    }
    if (this.time > 6 || this.x[0] - w[0] / 2 < -3 || this.x[1] + w[1] / 2 > 3) this.resetRun();
    this.carts.forEach((c, i) => { c.position.set(this.x[i], 0.88, 0.2); c.userData.body.forEach((b) => (b.scale.x = w[i])); });
    const real = [this.v[0] / 0.35, this.v[1] / 0.35];
    const pl = (p) => vlen(p, 10, 1.0);
    this.pa[0].set(V(this.x[0], 1.25, 0.2), V(pl(mA * real[0]), 0, 0));
    this.pa[1].set(V(this.x[1], 1.55, 0.2), V(pl(mB * real[1]), 0, 0));
    const tot = mA * real[0] + mB * real[1];
    this.pt.set(V(0, 2.05, 0.2), V(pl(tot), 0, 0));
    this.state = { pA: mA * real[0], pB: mB * real[1], tot };
  }
  readout() {
    const s = this.state || {};
    return [['زخم A', plainNum(s.pA) + ' kg·m/s'], ['زخم B', plainNum(s.pB) + ' kg·m/s'], ['الزخم الكلي', plainNum(s.tot) + ' kg·m/s'], ['نوع التصادم', this.p.stick >= 0.5 ? 'التحام (غير مرن)' : 'مرن']];
  }
}
