// الخط الزمني الكوني (الاتجاه أ): قماش لا نهائي، الفصول كواكب على مسار حلزوني، والدروس أقمار تظهر عند التقريب.
const TAU = Math.PI * 2;
const PLANET_R = 64;          // نصف قطر الكوكب في إحداثيات العالم
const MOON_ORBIT = 150;
const MOON_R = 17;
const Z_MIN = 0.04, Z_MAX = 7;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (i, j, l) => { const s = Math.sin(i * 127.1 + j * 311.7 + l * 74.7) * 43758.5453; return s - Math.floor(s); };

function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
function shade(hex, f) { const [r, g, b] = hexRgb(hex).map((v) => clamp(Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)), 0, 255)); return `rgb(${r},${g},${b})`; }

/** يرسم كوكباً مضاءً من جهة النجم المركزي داخل لوحة خارج الشاشة */
function planetSprite(color, light, style, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const r = size / 2 - 2; const cx = size / 2, cy = size / 2;
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
  const base = g.createRadialGradient(cx + light[0] * r * 0.45, cy + light[1] * r * 0.45, r * 0.05, cx, cy, r * 1.05);
  base.addColorStop(0, shade(color, 0.55)); base.addColorStop(0.45, color); base.addColorStop(1, shade(color, -0.55));
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // تفاصيل السطح
  g.globalCompositeOperation = 'soft-light';
  if (style === 'bands') {
    for (let i = 0; i < 9; i++) {
      const y = cy - r + (i + 0.5) * (2 * r / 9);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.28)';
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= size; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
      g.lineTo(size, y + r / 6); g.lineTo(0, y + r / 6); g.fill();
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const a = hash(i, 3, style.length) * TAU, d = Math.sqrt(hash(i, 7, 2)) * r;
      const rr = r * (0.08 + hash(i, 1, 9) * 0.22);
      g.fillStyle = i % 3 ? 'rgba(0,0,0,.30)' : 'rgba(255,255,255,.35)';
      g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, rr * 0.7, a, 0, TAU); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // خط الفصل بين الليل والنهار
  const night = g.createRadialGradient(cx + light[0] * r * 0.9, cy + light[1] * r * 0.9, r * 0.6, cx - light[0] * r * 0.4, cy - light[1] * r * 0.4, r * 1.6);
  night.addColorStop(0, 'rgba(3,5,14,0)'); night.addColorStop(0.6, 'rgba(3,5,14,.18)'); night.addColorStop(1, 'rgba(3,5,14,.62)');
  g.fillStyle = night; g.fillRect(0, 0, size, size);
  // حافة الغلاف الجوي
  const rim = g.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
  rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, rgba(color, 0.55));
  g.fillStyle = rim; g.fillRect(0, 0, size, size);
  g.restore();
  return c;
}

export class Cosmos {
  constructor(canvas, chapters, { onLesson, onChapter } = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.chapters = chapters; this.onLesson = onLesson; this.onChapter = onChapter;
    this.cam = { x: 0, y: 0, z: 0.3 }; this.anim = null;
    this.focus = { chapter: null, lesson: null };
    this.hover = null; this.t = 0; this.running = false; this.pointers = new Map();
    this.planets = chapters.map((c, i) => ({
      i, id: c.id, color: c.color, title: c.title, en: c.title_en, x: 0, y: 0, alpha: 1, glow: 0,
      style: ['bands', 'craters', 'bands', 'craters', 'bands', 'craters'][i], ring: i === 1 || i === 4,
      moons: c.lessons.map((l, j) => ({ code: l.code, title: l.title, j, n: c.lessons.length, a: (j / c.lessons.length) * TAU - Math.PI / 2, x: 0, y: 0, alpha: 1, glow: 0 })),
    }));
    this.resize(); this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /* ─── التخطيط ─── */
  layout() {
    const portrait = this.h > this.w * 1.1;
    this.planets.forEach((p, i) => {
      if (portrait) {          // ثعبان رأسي على الجوال: النجم في الأعلى والفصول تنزل بالتناوب
        p.x = (i % 2 === 0 ? 1 : -1) * 230;
        p.y = 420 + i * 430;
      } else {                 // حلزون على الشاشات العريضة
        const R = 330 + i * 230, th = 0.25 - i * 1.02;
        p.x = Math.cos(th) * R * 1.15; p.y = Math.sin(th) * R * 0.85;
      }
      const L = Math.hypot(p.x, p.y);
      p.light = [-p.x / L, -p.y / L];
      p.sprite = planetSprite(p.color, p.light, p.style);
      p.moonSprite = planetSprite(shade(p.color, 0.35), p.light, 'craters', 96);
    });
    // مسار الخط الزمني: من النجم عبر الكواكب الستة
    const pts = [{ x: 0, y: 0 }, ...this.planets.map((p) => ({ x: p.x, y: p.y }))];
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    pts.push({ x: last.x + (last.x - prev.x) * 0.45, y: last.y + (last.y - prev.y) * 0.45 });
    this.path = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < 40; s++) {
        const t = s / 40, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        this.path.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), seg: i });
      }
    }
    const core = pts.slice(0, -1);
    const xs = core.map((p) => p.x), ys = core.map((p) => p.y);
    this.bounds = { x0: Math.min(...xs) - 260, x1: Math.max(...xs) + 260, y0: Math.min(...ys) - 260, y1: Math.max(...ys) + 300 };
  }

  homeView() {
    const b = this.bounds; const top = this.headH + 10;
    const z = Math.min(this.w / (b.x1 - b.x0), (this.h - top - 40) / (b.y1 - b.y0));
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 - (top / 2) / z, z };
  }

  chapterView(p) {
    const top = this.headH;
    const z = clamp(Math.min(this.w, this.h - top) * 0.36 / (MOON_ORBIT + 40), 0.6, 3);
    return { x: p.x, y: p.y - (top / 2) / z + 20 / z, z };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!this.cv.clientWidth || !this.cv.clientHeight) return; // مخفي (أثناء الغرفة)
    this.w = this.cv.clientWidth; this.h = this.cv.clientHeight; this.dpr = dpr;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    const head = document.querySelector('.tl-head'); this.headH = head ? head.offsetHeight : 120;
    const firstLayout = !this.path; const wasPortrait = this.portrait; this.portrait = this.h > this.w * 1.1;
    if (firstLayout || wasPortrait !== this.portrait) { this.layout(); Object.assign(this.cam, this.homeView()); }
    this.mobile = Math.min(this.w, this.h) < 600;
  }

  /* ─── الكاميرا ─── */
  toScreen(x, y) { return [(x - this.cam.x) * this.cam.z + this.w / 2, (y - this.cam.y) * this.cam.z + this.h / 2]; }
  toWorld(sx, sy) { return [(sx - this.w / 2) / this.cam.z + this.cam.x, (sy - this.h / 2) / this.cam.z + this.cam.y]; }

  flyTo(v, dur = 1100, done) {
    const from = { ...this.cam };
    const dist = Math.hypot(v.x - from.x, v.y - from.y);
    // تبعيد خفيف في منتصف الرحلة الطويلة (حركة سينمائية)
    const span = Math.max(this.w, this.h) / Math.min(from.z, v.z);
    const dip = dist > span * 0.6 ? Math.log(Math.min(from.z, v.z) * 0.75) : null;
    this.anim = { from, to: v, t0: performance.now(), dur, dip, done };
  }

  zoomAt(sx, sy, factor) {
    this.anim = null;
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.z = clamp(this.cam.z * factor, Z_MIN, Z_MAX);
    const [nx, ny] = this.toWorld(sx, sy);
    this.cam.x += wx - nx; this.cam.y += wy - ny;
  }

  home() { this.setFocus(null, null); this.flyTo(this.homeView()); }

  /* ─── الفلترة ─── */
  setFocus(chapterId, lesson) {
    this.focus = { chapter: chapterId, lesson };
  }

  focusChapter(id, { fly = true } = {}) {
    const p = this.planets.find((q) => q.id === id);
    this.setFocus(id, null);
    if (p && fly) this.flyTo(this.chapterView(p));
  }

  focusLesson(code, done) {
    for (const p of this.planets) for (const m of p.moons) if (m.code === code) {
      this.setFocus(p.id, code);
      const v = this.chapterView(p);
      v.z *= 1.25; v.x = lerp(p.x, m.x, 0.55); v.y = lerp(p.y, m.y, 0.55) - (this.headH / 2) / v.z;
      this.flyTo(v, 1000, done);
    }
  }

  /* ─── المدخلات ─── */
  bind() {
    const cv = this.cv;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0016;
      this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * k));
    }, { passive: false });

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pointers.size === 1) this.drag = { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, t: performance.now(), moved: 0 };
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; this.drag = null; }
    });
    cv.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) { this.hover = this.pick(e.offsetX, e.offsetY); cv.classList.toggle('hovering', !!this.hover); return; }
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinch.d);
        this.pinch.d = d;
      } else if (this.drag) {
        const dx = e.offsetX - this.drag.x, dy = e.offsetY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.drag.moved > 6) { this.anim = null; cv.classList.add('dragging'); this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; }
        this.drag.x = e.offsetX; this.drag.y = e.offsetY;
      }
    });
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      cv.classList.remove('dragging');
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && this.drag.moved <= 6 && e.type === 'pointerup') this.tap(e.offsetX, e.offsetY);
      this.drag = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', (e) => { if (!this.pick(e.offsetX, e.offsetY)) this.flyTo({ ...this.cam, ...(() => { const [x, y] = this.toWorld(e.offsetX, e.offsetY); return { x, y }; })(), z: clamp(this.cam.z * 2, Z_MIN, Z_MAX) }, 500); });
  }

  lessonsVisible(p) { return clamp((PLANET_R * this.cam.z - 34) / 24, 0, 1); }

  pick(sx, sy) {
    const touchPad = this.mobile ? 14 : 6;
    for (const p of this.planets) {
      if (this.lessonsVisible(p) > 0.4) for (const m of p.moons) {
        const [x, y] = this.toScreen(m.x, m.y);
        if (Math.hypot(sx - x, sy - y) < Math.max(MOON_R * this.cam.z, 10) + touchPad + 4) return { type: 'lesson', p, m };
      }
    }
    for (const p of this.planets) {
      const [x, y] = this.toScreen(p.x, p.y);
      if (Math.hypot(sx - x, sy - y) < this.planetScreenR() + touchPad) return { type: 'chapter', p };
    }
    return null;
  }

  tap(sx, sy) {
    const hit = this.pick(sx, sy);
    if (!hit) return;
    if (hit.type === 'chapter') { this.focusChapter(hit.p.id); this.onChapter?.(hit.p.id); }
    else { this.focus = { chapter: hit.p.id, lesson: hit.m.code }; this.onChapter?.(hit.p.id, hit.m.code); this.onLesson?.(hit.m.code); }
  }

  planetScreenR() { return Math.max(PLANET_R * this.cam.z, this.mobile ? 22 : 28); }

  /* ─── الحلقة ─── */
  start() { if (this.running) return; this.running = true; this.last = performance.now(); const loop = (now) => { if (!this.running) return; this.frame(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.running = false; }

  frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now; this.t += dt;
    if (this.anim) {
      const a = this.anim; const k = clamp((now - a.t0) / a.dur, 0, 1); const e = ease(k);
      this.cam.x = lerp(a.from.x, a.to.x, e); this.cam.y = lerp(a.from.y, a.to.y, e);
      let lz = lerp(Math.log(a.from.z), Math.log(a.to.z), e);
      if (a.dip !== null) lz = Math.min(lz, lerp(lz, a.dip, Math.sin(Math.PI * e)));
      this.cam.z = Math.exp(lz);
      if (k >= 1) { const d = a.done; this.anim = null; d?.(); }
    }
    // تحديث مواقع الأقمار والشفافية (فلترة متحركة)
    const zoomedIn = this.cam.z * PLANET_R > 70;
    for (const p of this.planets) {
      const dim = this.focus.chapter && this.focus.chapter !== p.id;
      p.alpha = lerp(p.alpha, dim ? 0.16 : 1, 1 - Math.exp(-dt * 6));
      p.glow = lerp(p.glow, this.focus.chapter === p.id || this.hover?.p === p ? 1 : 0, 1 - Math.exp(-dt * 6));
      for (const m of p.moons) {
        if (!zoomedIn) m.a += dt * 0.12;
        m.x = p.x + Math.cos(m.a) * MOON_ORBIT; m.y = p.y + Math.sin(m.a) * MOON_ORBIT * 0.92;
        const dimM = this.focus.lesson && this.focus.lesson !== m.code;
        m.alpha = lerp(m.alpha, dim || dimM ? 0.22 : 1, 1 - Math.exp(-dt * 6));
        m.glow = lerp(m.glow, this.focus.lesson === m.code || this.hover?.m === m ? 1 : 0, 1 - Math.exp(-dt * 7));
      }
    }
    this.draw();
  }

  /* ─── الرسم ─── */
  draw() {
    const { ctx, w, h, dpr, cam } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h);
    this.drawNebula(); this.drawStars();

    // مسار الخط الزمني
    ctx.save(); ctx.lineCap = 'round';
    const segs = this.planets.length + 1;
    for (let s = 0; s < segs; s++) {
      const pts = this.path.filter((q) => q.seg === s);
      if (!pts.length) continue;
      const a = s === 0 ? '#ffd98f' : this.planets[s - 1].color;
      const b = this.planets[s]?.color || this.planets[segs - 2].color;
      const [x0, y0] = this.toScreen(pts[0].x, pts[0].y); const [x1, y1] = this.toScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      const fade = s === segs - 1 ? 0 : 0.55;
      grad.addColorStop(0, rgba(a.startsWith('#') ? a : '#ffffff', 0.55)); grad.addColorStop(1, rgba(b, fade));
      ctx.strokeStyle = grad; ctx.lineWidth = clamp(2.2 * cam.z, 1.2, 4); ctx.setLineDash(s === segs - 1 ? [2, 8] : []);
      ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = this.toScreen(q.x, q.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      if (s < segs - 1) { const [x, y] = this.toScreen(this.path[(s + 1) * 40]?.x ?? 0, this.path[(s + 1) * 40]?.y ?? 0); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // جسيمات ضوئية تسري على المسار (سهم الزمن)
    const n = this.path.length;
    for (let i = 0; i < 26; i++) {
      const u = ((this.t * 0.035 + i / 26) % 1) * (n - 41);
      const q = this.path[Math.floor(u)]; if (!q) continue;
      const [x, y] = this.toScreen(q.x, q.y);
      const col = q.seg === 0 ? '#ffd98f' : this.planets[Math.min(q.seg, 5)].color;
      ctx.fillStyle = rgba(col, 0.9); ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, clamp(1.6 * cam.z + 0.6, 1, 3), 0, TAU); ctx.fill();
    }
    ctx.restore();

    this.drawStar();
    for (const p of this.planets) this.drawPlanet(p);
    for (const p of this.planets) this.drawLabels(p);
  }

  drawNebula() {
    const { ctx, w, h } = this;
    const blobs = [[-600, -500, 900, '#3b2a78'], [700, 300, 1000, '#16416e'], [-300, 900, 800, '#5a1f4f'], [200, -900, 700, '#123a52']];
    for (const [x, y, r, c] of blobs) {
      const px = (x - this.cam.x * 0.3) * Math.sqrt(this.cam.z) * 0.6 + w / 2;
      const py = (y - this.cam.y * 0.3) * Math.sqrt(this.cam.z) * 0.6 + h / 2;
      const rr = r * Math.sqrt(this.cam.z) * 0.9 + 200;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, rgba(c, 0.32)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(Math.max(0, px - rr), Math.max(0, py - rr), Math.min(w, rr * 2), Math.min(h, rr * 2));
    }
  }

  drawStars() {
    const { ctx, w, h } = this;
    const layers = [[0.08, 90, 0.6], [0.2, 140, 1.0], [0.45, 220, 1.5]];
    layers.forEach(([par, cell, size], l) => {
      const zf = 1 + (Math.log(this.cam.z) + 1.5) * par * 0.4;
      const ox = this.cam.x * par * 0.35 * zf, oy = this.cam.y * par * 0.35 * zf;
      const c0 = Math.floor((ox - w / 2) / cell), c1 = Math.ceil((ox + w / 2) / cell);
      const r0 = Math.floor((oy - h / 2) / cell), r1 = Math.ceil((oy + h / 2) / cell);
      for (let i = c0; i <= c1; i++) for (let j = r0; j <= r1; j++) {
        for (let k = 0; k < 3; k++) {
          const hx = hash(i, j, l * 3 + k);
          if (hx < 0.35) continue;
          const sx = i * cell + hash(i, j, 10 + k + l) * cell - ox + w / 2;
          const sy = j * cell + hash(j, i, 20 + k + l) * cell - oy + h / 2;
          const tw = 0.55 + 0.45 * Math.sin(this.t * (0.6 + hx) + hx * 40);
          ctx.globalAlpha = (0.25 + hx * 0.6) * tw;
          ctx.fillStyle = hx > 0.93 ? '#ffe2b0' : hx > 0.86 ? '#bcd6ff' : '#ffffff';
          ctx.fillRect(sx, sy, size * (0.6 + hx * 0.8), size * (0.6 + hx * 0.8));
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  drawStar() {
    const { ctx } = this; const [x, y] = this.toScreen(0, 0);
    const r = clamp(90 * this.cam.z, 26, 300);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, 'rgba(255,246,220,1)'); g.addColorStop(0.12, 'rgba(255,214,140,.95)'); g.addColorStop(0.3, 'rgba(242,160,70,.35)'); g.addColorStop(1, 'rgba(242,140,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill();
    // أشعة
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.t * 0.03); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); const sg = ctx.createLinearGradient(-r * 2.4, 0, r * 2.4, 0); sg.addColorStop(0, 'rgba(255,220,150,0)'); sg.addColorStop(0.5, 'rgba(255,230,180,.22)'); sg.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = sg; ctx.fillRect(-r * 2.4, -1, r * 4.8, 2); }
    ctx.restore();
    ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, TAU); ctx.fill();
    this.text('فيزياء 2', x, y + r * 0.32 + 26, { size: clamp(15 * Math.sqrt(this.cam.z * 2), 14, 22), weight: 700, color: '#ffe7b8', font: 'Amiri' });
  }

  drawPlanet(p) {
    const { ctx } = this; const [x, y] = this.toScreen(p.x, p.y); const r = this.planetScreenR();
    if (x < -r * 6 || x > this.w + r * 6 || y < -r * 6 || y > this.h + r * 6) return;
    const lv = this.lessonsVisible(p);
    ctx.save(); ctx.globalAlpha = p.alpha;
    // مدار الأقمار
    if (lv > 0) {
      ctx.strokeStyle = rgba(p.color, 0.28 * lv); ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.ellipse(x, y, MOON_ORBIT * this.cam.z, MOON_ORBIT * 0.92 * this.cam.z, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // توهج
    const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * (1.9 + p.glow * 0.8));
    glow.addColorStop(0, rgba(p.color, 0.35 + p.glow * 0.25)); glow.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * (1.9 + p.glow * 0.8), 0, TAU); ctx.fill();
    if (p.ring) this.ring(x, y, r, p.color, true);
    ctx.drawImage(p.sprite, x - r, y - r, r * 2, r * 2);
    if (p.ring) this.ring(x, y, r, p.color, false);
    if (p.glow > 0.02) {
      ctx.strokeStyle = rgba(p.color, p.glow * 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 8 + Math.sin(this.t * 3) * 2, 0, TAU); ctx.stroke();
    }
    // رقم الفصل
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.font = `700 ${clamp(r * 0.5, 12, 54)}px "Plex Arabic", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
    ctx.fillText(String(p.i + 1), x, y + 1); ctx.shadowBlur = 0;
    // الأقمار (الدروس)
    if (lv > 0) for (const m of p.moons) {
      const [mx, my] = this.toScreen(m.x, m.y); const mr = Math.max(MOON_R * this.cam.z, 9);
      ctx.globalAlpha = p.alpha * m.alpha * lv;
      if (m.glow > 0.02) {
        const g = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 2.6);
        g.addColorStop(0, rgba(p.color, 0.55 * m.glow)); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, mr * 2.6, 0, TAU); ctx.fill();
      }
      ctx.drawImage(p.moonSprite, mx - mr, my - mr, mr * 2, mr * 2);
      ctx.strokeStyle = rgba('#ffffff', 0.35 + m.glow * 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, my, mr + 3, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  ring(x, y, r, color, back) {
    const { ctx } = this; ctx.save();
    ctx.beginPath(); if (back) ctx.rect(x - r * 3, y - r * 3, r * 6, r * 3); else ctx.rect(x - r * 3, y, r * 6, r * 3); ctx.clip();
    ctx.translate(x, y); ctx.rotate(-0.35);
    for (let k = 0; k < 3; k++) { ctx.strokeStyle = rgba(color, back ? 0.25 : 0.55 - k * 0.12); ctx.lineWidth = Math.max(1, r * (0.07 - k * 0.015)); ctx.beginPath(); ctx.ellipse(0, 0, r * (1.55 + k * 0.17), r * (0.38 + k * 0.04), 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  text(str, x, y, { size = 14, weight = 500, color = '#fff', align = 'center', font = 'Plex Arabic', alpha = 1 } = {}) {
    const { ctx } = this; ctx.save(); ctx.globalAlpha *= alpha;
    ctx.font = `${weight} ${size}px "${font}", "Plex Arabic", sans-serif`; ctx.direction = 'rtl'; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 10; ctx.fillStyle = color; ctx.fillText(str, x, y); ctx.restore();
  }

  wrap(str, max) {
    const words = str.split(' '); const lines = []; let cur = '';
    for (const wd of words) { if ((cur + ' ' + wd).trim().length > max && cur) { lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); }
    if (cur) lines.push(cur); return lines;
  }

  drawLabels(p) {
    const [x, y] = this.toScreen(p.x, p.y); const r = this.planetScreenR();
    if (x < -300 || x > this.w + 300 || y < -300 || y > this.h + 300) return;
    const lv = this.lessonsVisible(p);
    const s = this.mobile ? 0.86 : 1;
    this.ctx.save(); this.ctx.globalAlpha = p.alpha;
    const ly = y + r + (p.ring ? r * 0.3 : 0) + 18 * s;
    this.text(`الفصل ${p.i + 1}`, x, ly, { size: 12 * s, weight: 600, color: p.color });
    const lines = this.wrap(p.title, this.mobile && lv < 0.5 ? 14 : 24);
    lines.forEach((ln, i) => this.text(ln, x, ly + (17 + i * 18) * s, { size: (lv > 0.5 ? 17 : 15) * s, weight: 600 }));
    if (lv > 0.05) for (const m of p.moons) {
      const [mx, my] = this.toScreen(m.x, m.y); const mr = Math.max(MOON_R * this.cam.z, 9);
      const dx = m.x - p.x, dy = m.y - p.y; const L = Math.hypot(dx, dy);
      const ox = (dx / L), oy = (dy / L);
      const side = Math.abs(ox) > 0.35;
      const tx = mx + (side ? ox * (mr + 12) : 0), ty = my + (side ? 0 : oy * (mr + 22)) + (side ? -6 : 0);
      const align = side ? (ox > 0 ? 'left' : 'right') : 'center';
      const a = lv * m.alpha;
      this.text(m.code, tx, ty, { size: 12.5 * s, weight: 700, color: p.color, align, alpha: a });
      const tl = this.wrap(m.title, this.mobile ? 16 : 22);
      tl.forEach((ln, i) => this.text(ln, tx, ty + (16 + i * 16) * s, { size: 13.5 * s, weight: 500, color: '#e9edf9', align, alpha: a }));
    }
    this.ctx.restore();
  }
}
