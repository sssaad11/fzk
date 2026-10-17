// المحاكيات (2): الشغل، الآلات، الطاقة، الحرارة
import * as THREE from 'three';
import { Arrow, COLORS, vlen, damp, dashedLine, textSprite, pbr, heatColor } from './kit.js';
import { Sim } from './sims_a.js';
import { plainNum } from '../fmt.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const g = 9.8;

/** أعمدة طاقة ثلاثية الأبعاد على لوحة */
class EnergyBars extends THREE.Group {
  constructor(items, { height = 1.6, width = 0.26, gap = 0.12 } = {}) {
    super(); this.H = height; this.bars = [];
    const n = items.length, total = n * width + (n - 1) * gap;
    const back = new THREE.Mesh(new THREE.BoxGeometry(total + 0.3, height + 0.45, 0.04), pbr('#10131c', 0.6, 0.2));
    back.position.set(0, height / 2 + 0.1, -0.06); this.add(back);
    items.forEach(([color, label], i) => {
      const x = -total / 2 + width / 2 + i * (width + gap);
      const m = new THREE.Mesh(new THREE.BoxGeometry(width, 1, 0.08), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.3 }));
      m.geometry.translate(0, 0.5, 0); m.position.set(x, 0.05, 0); m.castShadow = true; this.add(m);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, 0.08)), new THREE.LineBasicMaterial({ color: '#3a4256' }));
      frame.position.set(x, 0.05 + height / 2, 0); this.add(frame);
      const s = textSprite(label, { color, size: 0.13, italic: false }); s.position.set(x, -0.08, 0.08); this.add(s);
      this.bars.push(m);
    });
  }
  set(values, max) { this.bars.forEach((b, i) => { b.scale.y = Math.max(0.001, (values[i] / Math.max(max, 1e-6)) * this.H); }); }
}

/* ════════ 4-1 الشغل: سحب صندوق ════════ */
export class Work extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [[COLORS.force, 'قوة السحب F ومركبتاها'], [COLORS.weight, 'الاحتكاك f'], [COLORS.displacement, 'الإزاحة d']];
    const mat = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.03, 1.2), pbr('#2a2f3a', 0.8)); mat.position.y = 0.015;
    for (let k = 0; k <= 10; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.25), pbr('#ffd23f', 0.5)); t.position.set(-2.6 + k * 0.5, 0.032, 0.45); this.root.add(t); }
    this.crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), pbr('#b9864f', 0.7));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.06, 0.57), this.ctx.mats.darkSteel); this.crate.add(band);
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), pbr('#e7d8b0', 0.8)); this.rope.geometry.translate(0, 0.5, 0);
    this.handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 20), this.ctx.mats.brass);
    this.root.add(this.shadow(mat), this.shadow(this.crate), this.shadow(this.rope), this.handle);
    this.FA = new Arrow(COLORS.force, { label: 'F', radius: 0.032 });
    this.Fx = new Arrow(COLORS.force, { label: 'F cosθ', dashed: true, labelSize: 0.15 });
    this.Fy = new Arrow(COLORS.force, { label: 'F sinθ', dashed: true, labelSize: 0.15 });
    this.fA = new Arrow(COLORS.weight, { label: 'f' }); this.dA = new Arrow(COLORS.displacement, { label: 'd' });
    [this.FA, this.Fx, this.Fy, this.fA, this.dA].forEach((a) => this.root.add(a));
    this.u = 0; this.hold = 0;
  }
  onParam() { this.u = 0; this.hold = 0; }
  update(dt) {
    const th = THREE.MathUtils.degToRad(this.p.theta), dvis = Math.min(this.p.d * 0.42, 4.2);
    if (this.u < 1) this.u = Math.min(1, this.u + dt / 3.2); else if ((this.hold += dt) > 1.2) { this.u = 0; this.hold = 0; }
    const x0 = -2.4, x = x0 + dvis * this.u;
    this.crate.position.set(x, 0.305, 0);
    const att = V(x + 0.28, 0.42, 0); const rl = 1.25; const rd = V(Math.cos(th), Math.sin(th), 0);
    this.rope.position.copy(att); this.rope.quaternion.setFromUnitVectors(V(0, 1, 0), rd); this.rope.scale.y = rl;
    this.handle.position.copy(att.clone().add(rd.clone().multiplyScalar(rl))); this.handle.rotation.y = Math.PI / 2;
    const L = (F) => Math.abs(vlen(F, 200, 0.9));
    const front = V(x, 0.31, 0.35);
    this.FA.set(front, rd.clone().multiplyScalar(L(this.p.F)));
    this.Fx.set(front, V(L(this.p.F) * Math.cos(th), 0, 0));
    this.Fy.set(front.clone().add(V(L(this.p.F) * Math.cos(th), 0, 0)), V(0, L(this.p.F) * Math.sin(th), 0));
    this.fA.set(V(x - 0.28, 0.08, 0.35), V(-L(this.p.f), 0, 0));
    this.dA.set(V(x0, 0.06, 0.6), V(dvis * this.u, 0, 0));
    const s = this.p.d * this.u;
    this.state = { WF: this.p.F * Math.cos(th) * s, Wf: -this.p.f * s, Fx: this.p.F * Math.cos(th), s };
  }
  readout() {
    const s = this.state || {};
    return [['الإزاحة المقطوعة d', plainNum(s.s) + ' m'], ['F cosθ', plainNum(s.Fx) + ' N'], ['شغل قوة السحب', plainNum(s.WF) + ' J'], ['شغل الاحتكاك', plainNum(s.Wf) + ' J']];
  }
}

/* ════════ 4-2 الرافعة ════════ */
export class Lever extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [[COLORS.force, 'القوة المسلّطة Fe'], [COLORS.weight, 'قوة المقاومة Fr'], [COLORS.displacement, 'الإزاحتان de و dr']];
    this.fulcrum = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 3), this.ctx.mats.darkSteel); this.fulcrum.rotation.y = Math.PI / 6;
    this.bar = new THREE.Group(); this.plank = new THREE.Mesh(new THREE.BoxGeometry(1, 0.09, 0.32), pbr('#c9cfd9', 0.25, 1)); this.bar.add(this.plank);
    this.load = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), pbr('#7d7a73', 0.9)); this.bar.add(this.load);
    this.grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 16), this.ctx.mats.rubber); this.grip.rotation.x = Math.PI / 2; this.bar.add(this.grip);
    this.root.add(this.shadow(this.fulcrum), this.shadow(this.bar));
    this.Fe = new Arrow(COLORS.force, { label: 'F', sub: 'e', radius: 0.032 }); this.Fr = new Arrow(COLORS.weight, { label: 'F', sub: 'r', radius: 0.032 });
    this.de = new Arrow(COLORS.displacement, { label: 'd', sub: 'e', radius: 0.018 }); this.dr = new Arrow(COLORS.displacement, { label: 'd', sub: 'r', radius: 0.018 });
    [this.Fe, this.Fr, this.de, this.dr].forEach((a) => this.root.add(a));
  }
  update(dt) {
    const { le, lr, load, eff } = this.p; const k = 4.6 / (le + lr);
    const L1 = lr * k, L2 = le * k, cx = (L1 - L2) / 2; // نقطة الارتكاز تُزاح لتوسيط الرافعة
    this.fulcrum.position.set(cx, 0.4, 0); this.bar.position.set(cx, 0.85, 0);
    this.plank.scale.x = L1 + L2; this.plank.position.x = (L2 - L1) / 2;
    const s = 0.12 + 0.1 * Math.cbrt(load / 20); this.load.scale.setScalar(s); this.load.position.set(-L1 + s, 0.045 + s * 0.8, 0);
    this.grip.position.set(L2 - 0.1, 0.07, 0);
    const A = 0.16; const ang = -A * (0.5 - 0.5 * Math.cos(this.t * 1.3)); this.bar.rotation.z = ang;
    const toRoot = (v) => this.bar.localToWorld(v.clone()).sub(this.root.getWorldPosition(V()));
    const IMA = le / lr, MA = (eff / 100) * IMA, Fr = load * g, Fe = Fr / MA;
    const FL = (F) => Math.abs(vlen(F, 600, 0.9));
    this.Fe.set(toRoot(V(L2 - 0.1, 0.14, 0)).add(V(0, FL(Fe) + 0.05, 0.2)), V(0, -FL(Fe), 0));
    this.Fr.set(toRoot(V(-L1 + s, 0.045, 0)).add(V(0, 0, 0.3)), V(0, -FL(Fr), 0));
    this.de.set(V(cx + L2 + 0.2, 0.85, 0), V(0, -L2 * Math.sin(A), 0));
    this.dr.set(V(cx - L1 - 0.2, 0.85, 0), V(0, L1 * Math.sin(A), 0));
    this.state = { IMA, MA, Fe, Fr };
  }
  readout() {
    const s = this.state || {};
    return [['IMA = de/dr', plainNum(s.IMA)], ['MA = Fr/Fe', plainNum(s.MA)], ['قوة المقاومة Fr', plainNum(s.Fr) + ' N'], ['القوة المسلّطة Fe', plainNum(s.Fe) + ' N']];
  }
}

/* ════════ 5-1 أشكال الطاقة: كرة ساقطة ودولاب ════════ */
export class Forms extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [['#4c8dff', 'طاقة الوضع PE'], [COLORS.velocity, 'الطاقة الحركية KE'], [COLORS.torque, 'الحركية الدورانية'], [COLORS.velocity, 'متجه السرعة']];
    const m = this.ctx.mats; this.S = 0.55;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), m.darkSteel); col.position.set(-2.1, 1.25, -0.2);
    for (let k = 0; k <= 4; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.03), m.brass); t.position.set(-2.0, k * this.S + 0.02, -0.15); this.root.add(t); const lab = textSprite(`${k} m`, { size: 0.11, italic: false }); lab.position.set(-2.45, k * this.S + 0.03, -0.15); this.root.add(lab); }
    this.platform = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), m.brass);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), pbr('#e8513a', 0.3, 0.1));
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 32), m.rubber); pad.position.set(-1.6, 0.02, 0);
    this.root.add(this.shadow(col), this.shadow(this.platform), this.shadow(this.ball), this.shadow(pad));
    this.bars = new EnergyBars([['#4c8dff', 'PE'], [COLORS.velocity, 'KE'], ['#ffffff', 'E'], [COLORS.torque, 'KEᵣₒₜ']]); this.bars.position.set(0.25, 0.05, -0.7); this.root.add(this.bars);
    // الدولاب
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.4), m.darkSteel); stand.position.set(2.15, 0.55, 0);
    this.fly = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 64), m.steel); disc.rotation.z = Math.PI / 2;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.4, 0.06), pbr('#c77dff', 0.4, 0.2, { emissive: '#c77dff', emissiveIntensity: 0.4 })); mark.position.y = 0.22;
    this.fly.add(disc, mark); this.fly.position.set(2.0, 1.1, 0); this.root.add(this.shadow(stand), this.shadow(this.fly));
    this.vA = new Arrow(COLORS.velocity, { label: 'v' }); this.root.add(this.vA);
    this.phase = 0; this.tt = 0; this.ang = 0;
  }
  onParam() { this.phase = 0; this.tt = 0; }
  update(dt) {
    const { m, h, I, omega } = this.p; const r = 0.08 + 0.05 * Math.cbrt(m);
    this.tt += dt; let y = h, v = 0;
    const tf = Math.sqrt(2 * h / g) * 1.6; // زمن السقوط (مبطّأ للعرض)
    if (this.phase === 0) { if (this.tt > 0.9) { this.phase = 1; this.tt = 0; } }
    else if (this.phase === 1) { const t = this.tt / 1.6; y = Math.max(0, h - 0.5 * g * t * t); v = g * t; if (this.tt >= tf) { this.phase = 2; this.tt = 0; } }
    else { y = 0; v = 0; if (this.tt > 0.8) { this.phase = 0; this.tt = 0; } }
    if (this.phase === 1) v = Math.sqrt(Math.max(0, 2 * g * (h - y)));
    this.platform.position.set(-1.6, h * this.S - 0.02, 0); this.platform.visible = this.phase === 0;
    this.ball.scale.setScalar(r); this.ball.position.set(-1.6, y * this.S + r + 0.04, 0);
    this.vA.set(V(-1.6 + r + 0.05, y * this.S + r, 0.1), V(0, -Math.abs(vlen(v, 6, 0.8)), 0));
    this.ang += Math.min(omega, 25) * dt; this.fly.rotation.x = -this.ang;
    const PE = m * g * y, KE = this.phase === 1 ? m * g * (h - y) : this.phase === 2 ? 0 : 0, KR = 0.5 * I * omega * omega;
    const E = this.phase === 2 ? 0 : m * g * h;
    this.bars.set([PE, KE, E, KR], Math.max(m * g * h, KR) * 1.05);
    this.state = { PE, KE, KR, v };
  }
  readout() {
    const s = this.state || {};
    return [['طاقة الوضع mgh', plainNum(s.PE) + ' J'], ['الطاقة الحركية ½mv²', plainNum(s.KE) + ' J'], ['السرعة v', plainNum(s.v) + ' m/s'], ['الدورانية ½Iω²', plainNum(s.KR) + ' J']];
  }
}

/* ════════ 5-2 مسار الأفعوانية ════════ */
export class Ramp extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [['#4c8dff', 'PE'], [COLORS.velocity, 'KE ومتجه السرعة'], [COLORS.weight, 'طاقة مفقودة (حرارة)']];
    this.prof = [[0, 1], [0.08, 0.95], [0.22, 0.32], [0.34, 0.03], [0.46, 0.28], [0.58, 0.6], [0.7, 0.3], [0.82, 0.06], [0.93, 0.45], [1, 0.92]];
    this.trackGroup = new THREE.Group(); this.root.add(this.trackGroup);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), pbr('#e8513a', 0.25, 0.2)); this.root.add(this.shadow(this.ball));
    this.vA = new Arrow(COLORS.velocity, { label: 'v' }); this.root.add(this.vA);
    this.bars = new EnergyBars([['#4c8dff', 'PE'], [COLORS.velocity, 'KE'], [COLORS.weight, 'Q'], ['#ffffff', 'E']], { height: 1.1, width: 0.2 });
    this.bars.position.set(0, 2.25, -0.75); this.root.add(this.bars);
    this.built = -1; this.s = 0; this.dir = 1; this.H = null; this.rest = 0;
  }
  build(hv) {
    this.trackGroup.clear();
    const pts = this.prof.map(([u, f]) => V(-2.8 + 5.6 * u, 0.3 + f * hv, 0));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const railMat = this.ctx.mats.steel;
    for (const z of [-0.09, 0.09]) {
      const c = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setZ(z)), false, 'centripetal');
      const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 200, 0.022, 10), railMat); this.trackGroup.add(this.shadow(tube));
    }
    for (let i = 0; i <= 14; i++) {
      const p = this.curve.getPointAt(i / 14); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, p.y, 8), this.ctx.mats.darkSteel);
      post.position.set(p.x, p.y / 2, -0.12); this.trackGroup.add(this.shadow(post));
    }
    this.N = 400; this.len = this.curve.getLength(); this.samples = this.curve.getSpacedPoints(this.N);
    this.minY = Math.min(...this.samples.map((p) => p.y));
  }
  onParam(k) { if (k === 'h' || k === 'mu') { this.s = 0; this.dir = 1; this.H = null; } }
  update(dt) {
    const hv = this.p.h * 0.42;
    if (Math.abs(hv - this.built) > 0.02) { this.build(hv); this.built = hv; this.s = 0; this.H = null; }
    const k = 0.42; // متر مرئي لكل متر حقيقي
    const yReal = (vis) => (vis - 0.3) / k;
    if (this.H === null) { this.H = this.p.h; this.lost = 0; this.dir = 1; this.s = 0; }
    const i = Math.round(this.s * this.N); const p = this.samples[Math.max(0, Math.min(this.N, i))];
    const y = yReal(p.y); let v = Math.sqrt(Math.max(0, 2 * g * (this.H - y)));
    const ds = (v * k * dt) / this.len;
    let ns = this.s + this.dir * Math.max(ds, 0.0004);
    const ny = yReal(this.samples[Math.max(0, Math.min(this.N, Math.round(ns * this.N)))].y);
    if (ny > this.H || ns <= 0 || ns >= 1) { this.dir *= -1; ns = Math.max(0, Math.min(1, this.s)); }
    if (this.p.mu > 0) { const dl = Math.abs(ns - this.s) * this.len / k; this.H -= this.p.mu * 0.25 * dl; this.lost = this.p.h - this.H; }
    this.s = ns;
    if (v < 0.05 && this.H - yReal(this.minY) < 0.03) { this.rest += dt; if (this.rest > 1.5) { this.H = null; this.rest = 0; } } else this.rest = 0;
    const pos = this.curve.getPointAt(this.s); const tan = this.curve.getTangentAt(this.s);
    this.ball.position.copy(pos).add(V(0, 0.13, 0)); this.ball.rotation.z -= this.dir * v * k * dt / 0.11;
    this.vA.set(pos.clone().add(V(0, 0.13, 0.15)), tan.clone().multiplyScalar(this.dir * Math.abs(vlen(v, 8, 0.8))));
    const m = this.p.m, E0 = m * g * this.p.h;
    const PE = m * g * yReal(pos.y), KE = Math.max(0, m * g * (this.H ?? this.p.h) - PE), Q = m * g * (this.lost || 0);
    this.bars.set([PE, KE, Q, PE + KE + Q], E0 * 1.02);
    this.state = { PE, KE, Q, v };
  }
  readout() {
    const s = this.state || {};
    return [['طاقة الوضع PE', plainNum(s.PE) + ' J'], ['الطاقة الحركية KE', plainNum(s.KE) + ' J'], ['المجموع PE + KE + Q', plainNum(s.PE + s.KE + s.Q) + ' J'], ['السرعة v', plainNum(s.v) + ' m/s']];
  }
}

/* ════════ جسيمات (للحرارة) ════════ */
class Particles {
  constructor(n, radius, box) {
    this.n = n; this.box = box;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = []; this.v = []; this.m4 = new THREE.Matrix4(); this.c = new THREE.Color();
    for (let i = 0; i < n; i++) { this.p.push(V((Math.random() - 0.5) * box.x, (Math.random() - 0.5) * box.y, (Math.random() - 0.5) * box.z)); this.v.push(V().randomDirection()); this.mesh.setColorAt(i, this.c.set('#fff')); }
  }
  step(dt, speed, color, bounds = this.box) {
    const hx = bounds.x / 2, hy = bounds.y / 2, hz = bounds.z / 2;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], v = this.v[i];
      p.addScaledVector(v, speed * dt);
      if (p.x > hx || p.x < -hx) { v.x *= -1; p.x = THREE.MathUtils.clamp(p.x, -hx, hx); }
      if (p.y > hy || p.y < -hy) { v.y *= -1; p.y = THREE.MathUtils.clamp(p.y, -hy, hy); }
      if (p.z > hz || p.z < -hz) { v.z *= -1; p.z = THREE.MathUtils.clamp(p.z, -hz, hz); }
      this.m4.makeTranslation(p.x, p.y, p.z); this.mesh.setMatrixAt(i, this.m4);
      if (color) this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ════════ 6-1 جسمان في تماس حراري ════════ */
export class Thermal extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [['#ff4d5e', 'جسيمات ساخنة (أسرع)'], ['#4c8dff', 'جسيمات باردة (أبطأ)'], [COLORS.force, 'اتجاه انتقال الحرارة']];
    const n = ctx.quality.high ? 46 : 28; const box = V(0.9, 0.9, 0.9);
    this.boxes = [-0.85, 0.85].map((x, i) => {
      const grp = new THREE.Group(); grp.position.set(x * 1.15, 1.05, 0);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ctx.mats.glass);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#c9a05a' }));
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), this.ctx.mats.marble); base.position.y = -0.8; this.shadow(base);
      const parts = new Particles(n, 0.035, box); grp.add(glass, edges, base, parts.mesh); this.root.add(grp);
      const thermo = new THREE.Group(); const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 16), this.ctx.mats.glass);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 12), new THREE.MeshStandardMaterial({ color: '#ff4d5e', emissive: '#ff4d5e', emissiveIntensity: 0.6 })); fill.geometry.translate(0, 0.5, 0); fill.position.y = -0.5;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), fill.material); bulb.position.y = -0.54;
      thermo.add(tube, fill, bulb); thermo.position.set(x * 1.15 + (i ? 0.62 : -0.62), 1.05, 0.3); this.root.add(thermo);
      const lab = textSprite(i ? 'B' : 'A', { size: 0.18, italic: false }); lab.position.set(x * 1.15, 1.75, 0); this.root.add(lab);
      return { parts, fill };
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), pbr('#d4824a', 0.25, 1)); bar.position.set(0, 1.05, 0); this.root.add(this.shadow(bar));
    this.flow = new Arrow(COLORS.force, { label: 'Q' }); this.root.add(this.flow);
    this.restart();
  }
  onParam() { this.restart(); }
  restart() { this.TA = this.target.TA; this.TB = this.target.TB; this.eq = 0; }
  update(dt) {
    const CA = this.p.mA * this.p.CA, CB = this.p.mB * this.p.CB;
    const k = 0.45 * (CA * CB) / (CA + CB);
    const q = k * (this.TA - this.TB) * dt; this.TA -= q / CA; this.TB += q / CB;
    if (Math.abs(this.TA - this.TB) < 0.3) { if ((this.eq += dt) > 2.5) this.restart(); }
    const Tf = (CA * this.target.TA + CB * this.target.TB) / (CA + CB);
    [this.TA, this.TB].forEach((T, i) => {
      const b = this.boxes[i]; const speed = 0.55 * Math.sqrt((T + 273) / 300);
      b.parts.step(dt, speed, heatColor((T + 10) / 260));
      b.fill.scale.y = THREE.MathUtils.clamp((T + 20) / 320, 0.02, 1);
    });
    const d = this.TA - this.TB;
    this.flow.set(V(-Math.sign(d) * 0.3, 1.32, 0), V(Math.sign(d) * Math.max(0.05, Math.abs(vlen(d, 40, 0.5))), 0, 0));
    this.state = { TA: this.TA, TB: this.TB, Tf };
  }
  readout() {
    const s = this.state || {};
    return [['حرارة A', plainNum(s.TA) + ' °C'], ['حرارة B', plainNum(s.TB) + ' °C'], ['حرارة الاتزان المتوقعة', plainNum(s.Tf) + ' °C'], ['بالكلفن (A)', plainNum(s.TA + 273) + ' K']];
  }
}

/* ════════ 6-2 تحولات الحالة + المكبس ════════ */
export class Phase extends Sim {
  constructor(ctx, defs) {
    super(ctx, defs);
    this.legend = [['#9fd4ff', 'جزيئات الماء'], [COLORS.force, 'الحرارة Q'], [COLORS.displacement, 'الشغل W']];
    const m = this.ctx.mats; const n = ctx.quality.high ? 64 : 40; this.n = n;
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.52, 1.3, 48, 1, true), m.glass); beaker.position.set(-0.9, 1.0, 0);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.03, 48), m.glass); bottom.position.set(-0.9, 0.36, 0);
    this.plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.3, 48), m.darkSteel); this.plate.position.set(-0.9, 0.15, 0);
    this.coil = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 48), new THREE.MeshStandardMaterial({ color: '#331', emissive: '#ff5a1f', emissiveIntensity: 0 }));
    this.coil.rotation.x = Math.PI / 2; this.coil.position.set(-0.9, 0.31, 0);
    this.root.add(beaker, bottom, this.shadow(this.plate), this.coil);
    this.parts = new Particles(n, 0.045, V(0.7, 1.1, 0.7)); this.parts.mesh.position.set(-0.9, 0.95, 0); this.root.add(this.parts.mesh);
    this.lattice = []; const side = Math.ceil(Math.cbrt(n));
    for (let i = 0; i < n; i++) { const a = i % side, b = Math.floor(i / side) % side, c = Math.floor(i / side / side); this.lattice.push(V((a - (side - 1) / 2) * 0.13, -0.47 + c * 0.13, (b - (side - 1) / 2) * 0.13)); }
    // المكبس
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.4, 40, 1, true), m.glass); cyl.position.set(1.25, 1.0, 0);
    this.piston = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 40), m.steel);
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12), m.steel);
    const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.3, 40), m.darkSteel); cbase.position.set(1.25, 0.15, 0);
    this.gas = new Particles(ctx.quality.high ? 30 : 18, 0.03, V(0.5, 0.5, 0.5)); this.root.add(this.gas.mesh);
    this.root.add(cyl, this.shadow(this.piston), this.shadow(this.rod), this.shadow(cbase));
    this.QA = new Arrow(COLORS.force, { label: 'Q' }); this.WA = new Arrow(COLORS.displacement, { label: 'W' }); this.root.add(this.QA, this.WA);
    // منحنى التسخين
    this.cv = document.createElement('canvas'); this.cv.width = 1024; this.cv.height = 520;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.17), new THREE.MeshStandardMaterial({ map: this.tex, emissive: '#fff', emissiveMap: this.tex, emissiveIntensity: 0.35, roughness: 0.6 }));
    board.position.set(0.1, 2.35, -0.95); this.root.add(board);
    this.c = new THREE.Color(); this.lastT = null;
  }
  curvePos(T) {
    // مقاطع منحنى التسخين بوحدات طاقة نسبية (لكل كيلوغرام، kJ)
    const segs = [[-40, 0, 82], [0, 0, 334], [0, 100, 418], [100, 100, 2260 * 0.35], [100, 140, 80]];
    const tot = segs.reduce((a, s) => a + s[2], 0); let acc = 0; const pts = [];
    for (const [a, b, q] of segs) { pts.push([acc / tot, a]); acc += q; pts.push([acc / tot, b]); }
    let x;
    if (T < 0) x = ((T + 40) / 40) * 82 / tot;
    else if (T === 0) x = (82 + 167) / tot;
    else if (T < 100) x = (82 + 334 + (T / 100) * 418) / tot;
    else if (T === 100) x = (82 + 334 + 418 + 395) / tot;
    else x = (tot - 80 + ((T - 100) / 40) * 80) / tot;
    return { pts, x };
  }
  drawCurve(T) {
    const g2 = this.cv.getContext('2d'), W = 1024, H = 520; const { pts, x } = this.curvePos(T);
    g2.fillStyle = '#fbfaf6'; g2.fillRect(0, 0, W, H);
    g2.strokeStyle = '#e4e1d6'; for (let i = 0; i < W; i += 40) { g2.beginPath(); g2.moveTo(i, 0); g2.lineTo(i, H); g2.stroke(); } for (let i = 0; i < H; i += 40) { g2.beginPath(); g2.moveTo(0, i); g2.lineTo(W, i); g2.stroke(); }
    const ox = 100, oy = H - 70, w = W - 150, h = H - 150; const ty = (t) => oy - ((t + 40) / 180) * h;
    g2.strokeStyle = '#141a2e'; g2.lineWidth = 4; g2.beginPath(); g2.moveTo(ox, 30); g2.lineTo(ox, oy); g2.lineTo(ox + w, oy); g2.stroke();
    g2.strokeStyle = '#3f8fe0'; g2.lineWidth = 7; g2.beginPath(); pts.forEach(([u, t], i) => (i ? g2.lineTo(ox + u * w, ty(t)) : g2.moveTo(ox + u * w, ty(t)))); g2.stroke();
    g2.fillStyle = '#ff4d5e'; g2.beginPath(); g2.arc(ox + x * w, ty(T), 16, 0, 7); g2.fill();
    g2.fillStyle = '#141a2e'; g2.font = '600 26px "Plex Arabic", sans-serif'; g2.textAlign = 'right';
    [[0, '0 °C'], [100, '100 °C']].forEach(([t, s]) => g2.fillText(s, ox - 10, ty(t) + 8));
    g2.direction = 'rtl'; g2.textAlign = 'center'; g2.font = '600 32px "Plex Arabic", sans-serif';
    g2.fillText('منحنى التسخين: درجة الحرارة مقابل الحرارة المضافة', W / 2, 36);
    g2.font = '500 26px "Plex Arabic", sans-serif'; g2.fillStyle = '#4a5170';
    g2.fillText('انصهار (Q = mHf)', ox + w * 0.2, ty(0) - 22); g2.fillText('غليان (Q = mHv)', ox + w * 0.68, ty(100) - 22);
    this.tex.needsUpdate = true;
  }
  update(dt) {
    const T = Math.round(this.target.T * 10) / 10; const Tp = this.p.T;
    if (T !== this.lastT) { this.drawCurve(T); this.lastT = T; }
    const st = Tp < -0.5 ? 'solid' : Tp < 0.5 ? 'melt' : Tp < 99.5 ? 'liquid' : Tp < 100.5 ? 'boil' : 'gas';
    this.coil.material.emissiveIntensity = THREE.MathUtils.clamp((Tp + 40) / 120, 0.1, 2.2);
    const P = this.parts; const speed = 0.25 * Math.sqrt((Tp + 273) / 273);
    for (let i = 0; i < this.n; i++) {
      const half = i % 2 === 0;
      let mode = st === 'solid' ? 's' : st === 'melt' ? (half ? 's' : 'l') : st === 'liquid' ? 'l' : st === 'boil' ? (half ? 'l' : 'g') : 'g';
      const p = P.p[i], v = P.v[i];
      if (mode === 's') { const L = this.lattice[i]; const a = 0.006 + 0.012 * (Tp + 40) / 40; p.set(L.x + (Math.random() - 0.5) * a, L.y + (Math.random() - 0.5) * a, L.z + (Math.random() - 0.5) * a); this.c.set('#cfeaff'); }
      else {
        const top = mode === 'l' ? -0.05 : 0.55, sp = mode === 'l' ? speed * 0.9 : speed * 3.2;
        v.x += (Math.random() - 0.5) * 0.6; v.y += (Math.random() - 0.5) * 0.6 + (mode === 'l' ? -0.05 : 0); v.z += (Math.random() - 0.5) * 0.6; v.normalize();
        p.addScaledVector(v, sp * dt);
        if (Math.hypot(p.x, p.z) > 0.45) { p.x *= 0.45 / Math.hypot(p.x, p.z); p.z *= 0.45 / Math.hypot(p.x, p.z); v.x *= -1; v.z *= -1; }
        if (p.y < -0.5) { p.y = -0.5; v.y = Math.abs(v.y); } if (p.y > top) { p.y = top; v.y = -Math.abs(v.y); }
        this.c.set(mode === 'l' ? '#3f8fe0' : '#eef4ff');
      }
      P.m4.makeTranslation(p.x, p.y, p.z); P.mesh.setMatrixAt(i, P.m4); P.mesh.setColorAt(i, this.c);
    }
    P.mesh.instanceMatrix.needsUpdate = true; P.mesh.instanceColor.needsUpdate = true;
    // المكبس: ΔU = Q − W
    const { Q, W } = this.p; const dU = Q - W; const hp = 0.55 + (W / 3000) * 0.65;
    this.piston.position.set(1.25, 0.3 + hp, 0); this.rod.position.set(1.25, 0.3 + hp + 0.4, 0);
    this.gas.mesh.position.set(1.25, 0.3 + hp / 2, 0);
    this.gas.step(dt, 0.25 + Math.max(0, dU) / 2500, heatColor(0.3 + dU / 6000), V(0.5, hp - 0.08, 0.5));
    this.QA.set(V(1.25, -0.05, 0.5), V(0, Math.max(0.05, Math.abs(vlen(Q, 2500, 0.45))), 0));
    this.WA.set(V(1.25, 0.3 + hp + 0.82, 0), V(0, Math.max(0.05, Math.abs(vlen(W, 1500, 0.55))), 0));
    this.state = { T: Tp, st, dU };
  }
  readout() {
    const s = this.state || {}; const names = { solid: 'صلب (جليد)', melt: 'انصهار — الحرارة ثابتة', liquid: 'سائل', boil: 'غليان — الحرارة ثابتة', gas: 'غاز (بخار)' };
    return [['درجة الحرارة', plainNum(s.T) + ' °C'], ['الحالة', names[s.st] || ''], ['المكبس: Q − W', plainNum(this.p.Q) + ' − ' + plainNum(this.p.W)], ['ΔU', plainNum(s.dU) + ' J']];
  }
}
