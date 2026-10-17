// التحكم: WASD + سحب الماوس على الكمبيوتر، وعصا تحكم افتراضية + سحب + قرص على اللمس
import * as THREE from 'three';

export class WalkControls {
  constructor(camera, dom, { onTap, isTouch }) {
    this.cam = camera; this.dom = dom; this.onTap = onTap; this.isTouch = isTouch;
    this.yaw = 0; this.pitch = -0.08; this.keys = new Set(); this.move = new THREE.Vector2();
    this.vel = new THREE.Vector3(); this.enabled = true; this.fov = camera.fov;
    this.pointers = new Map(); this.joy = null;
    this.colliders = []; this.bounds = { x0: -5.5, x1: 5.5, z0: -8.4, z1: 8.4 };
    this._kd = (e) => { if (!this.enabled || e.target.closest?.('input,textarea')) return; this.keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); };
    this._ku = (e) => this.keys.delete(e.code);
    this._blur = () => this.keys.clear();
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('blur', this._blur);
    this.bindPointers();
    if (isTouch) this.buildJoystick();
  }

  buildJoystick() {
    const j = document.createElement('div'); j.className = 'joystick'; j.innerHTML = '<div class="joy-knob"></div>';
    j.setAttribute('aria-label', 'عصا الحركة');
    this.dom.parentElement.appendChild(j); this.joyEl = j; this.knob = j.firstChild;
    const R = 46;
    const set = (e) => {
      const r = j.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const L = Math.hypot(dx, dy); if (L > R) { dx *= R / L; dy *= R / L; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`; this.move.set(dx / R, -dy / R);
    };
    j.addEventListener('pointerdown', (e) => { e.stopPropagation(); j.setPointerCapture(e.pointerId); this.joy = e.pointerId; j.classList.add('active'); set(e); });
    j.addEventListener('pointermove', (e) => { if (e.pointerId === this.joy) set(e); });
    const end = (e) => { if (e.pointerId !== this.joy) return; this.joy = null; this.move.set(0, 0); this.knob.style.transform = ''; j.classList.remove('active'); };
    j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  }

  bindPointers() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      d.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    d.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) { this.hoverX = e.clientX; this.hoverY = e.clientY; return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]; const dd = Math.hypot(a.x - b.x, a.y - b.y);
        this.fov = THREE.MathUtils.clamp(this.fov * (this.pinchD / dd), 35, 85); this.pinchD = dd; return;
      }
      if (!this.enabled) return;
      const k = this.isTouch ? 0.0055 : 0.0042;
      this.yaw += dx * k; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.0);
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId);
      if (p && e.type === 'pointerup' && p.moved < 8 && performance.now() - p.t < 450 && this.pointers.size === 0) this.onTap?.(e.clientX, e.clientY);
    };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
    d.addEventListener('wheel', (e) => { e.preventDefault(); this.fov = THREE.MathUtils.clamp(this.fov * Math.exp(e.deltaY * 0.001), 35, 85); }, { passive: false });
  }

  lookAt(target) {
    const p = this.cam.position; const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
    this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  update(dt) {
    const k = this.keys;
    let f = this.move.y, s = this.move.x;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
      if (k.has('KeyQ')) this.yaw += dt * 1.6;
    } else { f = 0; s = 0; }
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 4.2 : 2.4);
    const L = Math.hypot(f, s); if (L > 1) { f /= L; s /= L; }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const tx = (fx * f + rx * s) * speed, tz = (fz * f + rz * s) * speed;
    const a = 1 - Math.exp(-dt * 10);
    this.vel.x += (tx - this.vel.x) * a; this.vel.z += (tz - this.vel.z) * a;
    const p = this.cam.position;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt;
    // التصادم مع الجدران والمنصة والقواعد
    p.x = THREE.MathUtils.clamp(p.x, this.bounds.x0, this.bounds.x1);
    p.z = THREE.MathUtils.clamp(p.z, this.bounds.z0, this.bounds.z1);
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.r && d > 1e-4) { p.x = c.x + (dx / d) * c.r; p.z = c.z + (dz / d) * c.r; }
    }
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.cam.fov += (this.fov - this.cam.fov) * a;
    this.cam.updateProjectionMatrix();
  }

  dispose() {
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('blur', this._blur);
    this.joyEl?.remove();
  }
}
