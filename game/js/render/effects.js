/*
 * 시각 효과: 화면 흔들림, 섬광, 빛 고리, 파티클
 * 모든 좌표는 내부 픽셀 해상도 기준.
 */
window.WS = window.WS || {};

WS.Effects = class {
  constructor() { this.reset(); }

  reset() {
    this.shakes = [];
    this.flashes = [];
    this.rings = [];
    this.particles = [];
  }

  get reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  shake(power, dur) {
    if (this.reducedMotion) power = Math.min(power, 1);
    this.shakes.push({ power, dur, t: 0 });
  }

  /** 섬광: 0 → peak → 0 (attack 비율만큼 올라갔다가 내려감) */
  flash(color, dur, peak = 0.9, attack = 0.25) {
    this.flashes.push({ color, dur, peak, attack, t: 0 });
  }

  ring(x, y, color, maxR, dur, width = 1) {
    this.rings.push({ x, y, color, maxR, dur, width, t: 0 });
  }

  burst(x, y, opts) {
    const n = opts.count || 24;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 40) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift || 10),
        g: opts.gravity ?? 8,
        drag: opts.drag ?? 0.92,
        shape: opts.shapes[i % opts.shapes.length],
        color: opts.colors[i % opts.colors.length],
        life: (opts.life || 1.6) * (0.6 + Math.random() * 0.6), t: 0,
        twinkle: Math.random() < 0.4,
      });
    }
  }

  /** 바깥에서 중심으로 모여드는 빛 */
  gather(x, y, opts) {
    const n = opts.count || 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 30;
      const life = opts.life || 0.55;
      this.particles.push({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.cos(a) * r / life, vy: -Math.sin(a) * r / life,
        g: 0, drag: 1, shape: 'sparkle',
        color: opts.colors[i % opts.colors.length], life, t: 0, twinkle: false,
      });
    }
  }

  get busy() { return this.flashes.length + this.rings.length + this.particles.length > 0; }

  update(dt) {
    const step = (arr) => { for (const e of arr) e.t += dt; return arr.filter(e => e.t < (e.dur ?? e.life)); };
    this.shakes = step(this.shakes);
    this.flashes = step(this.flashes);
    this.rings = step(this.rings);
    for (const p of this.particles) {
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.particles = step(this.particles);
  }

  shakeOffset() {
    let p = 0;
    for (const s of this.shakes) p = Math.max(p, s.power * (1 - s.t / s.dur));
    if (p < 0.5) return [0, 0];
    return [Math.round((Math.random() * 2 - 1) * p), Math.round((Math.random() * 2 - 1) * p)];
  }

  drawWorld(ctx) {
    for (const r of this.rings) {
      const k = r.t / r.dur;
      const rad = Math.round(r.maxR * (1 - Math.pow(1 - k, 3)));
      ctx.globalAlpha = 1 - k;
      WS.pixelCircle(ctx, Math.round(r.x), Math.round(r.y), rad, r.color, r.width);
    }
    for (const p of this.particles) {
      const k = p.t / p.life;
      let a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      if (p.twinkle && Math.floor(p.t * 12) % 2) a *= 0.5;
      ctx.globalAlpha = Math.max(0, a);
      const img = WS.SpriteCache.particle(p.shape, p.color);
      ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height / 2));
    }
    ctx.globalAlpha = 1;
  }

  drawScreen(ctx, w, h) {
    for (const f of this.flashes) {
      const k = f.t / f.dur;
      const a = k < f.attack ? (k / f.attack) * f.peak : f.peak * (1 - (k - f.attack) / (1 - f.attack));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }
};

/** 픽셀 단위 원 (브레젠햄) */
WS.pixelCircle = function (ctx, cx, cy, r, color, width = 1) {
  ctx.fillStyle = color;
  for (let wv = 0; wv < width; wv++) {
    const rr = r - wv;
    if (rr <= 0) break;
    let x = rr, y = 0, err = 1 - rr;
    while (x >= y) {
      const pts = [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]];
      for (const [dx, dy] of pts) ctx.fillRect(cx + dx, cy + dy, 1, 1);
      y++;
      if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
    }
  }
};
