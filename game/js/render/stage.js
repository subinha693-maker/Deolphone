/*
 * 흰 공간 무대 렌더러 (캔버스)
 *  - 낮은 내부 해상도로 그린 뒤 정수 배율로 확대 → 픽셀 아트 유지
 *  - 인물·소품 배치, 앰비언트(깃털·찻잔 김), 분위기(mood), 각성 연출 담당
 */
window.WS = window.WS || {};

WS.Stage = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new WS.Effects();
    this.scale = 2;
    this.W = 320; this.H = 180;
    this.time = 0;
    this.ambientTime = 0;
    this.last = performance.now();
    this.reset();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    requestAnimationFrame(t => this.loop(t));
  }

  reset() {
    this.fx.reset();
    this.whiteout = 1;            // 1 이면 화면 전체가 흰색 (시작 상태)
    this.mireilleAlpha = 0;
    this.heroForm = null;         // null = 평상복, 직업 ID = 변신
    this.heroJob = null;
    this.mood = 'normal';
    this.moodTint = 0;
    this.tweens = [];
    this.auraTimer = 0;
    this.blinkTimer = 2.5;
    this.blinking = 0;
    this.feathers = Array.from({ length: 9 }, () => this.newFeather(true));
    this.steam = [];
    this.steamTimer = 0;
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.scale = Math.max(1, Math.floor(Math.min(vw / 240, vh / 150)));
    this.W = Math.ceil(vw / this.scale);
    this.H = Math.ceil(vh / this.scale);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = this.W * this.scale + 'px';
    this.canvas.style.height = this.H * this.scale + 'px';
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 배치 기준점: 인물이 대화창에 가리지 않도록 화면 위쪽 55% 지점을 바닥으로 */
  layout() {
    const cx = Math.round(this.W / 2);
    const floorY = Math.round(this.H * 0.6);
    return {
      cx, floorY,
      tableX: cx + 16, tableTop: floorY - 19,
      heroX: cx - 40,
    };
  }

  // ---------- 트윈 · 연출 API (스크립트 명령에서 호출) ----------

  tween(obj, key, to, ms) {
    return new Promise(resolve => {
      this.tweens = this.tweens.filter(t => !(t.obj === obj && t.key === key));
      this.tweens.push({ obj, key, from: obj[key], to, dur: Math.max(1, ms) / 1000, t: 0, resolve });
    });
  }

  fadeIn(ms) { return this.tween(this, 'whiteout', 0, ms); }

  show(target, ms) {
    if (target === 'mireille') return this.tween(this, 'mireilleAlpha', 1, ms);
    console.warn('[stage] 알 수 없는 대상:', target);
    return Promise.resolve();
  }

  hide(target, ms) {
    if (target === 'mireille') return this.tween(this, 'mireilleAlpha', 0, ms);
    return Promise.resolve();
  }

  /** normal | still(깃털과 김이 멈추고 공기가 살짝 식는다) | hush(정적) */
  setMood(m) {
    this.mood = m;
    this.tween(this, 'moodTint', m === 'still' ? 1 : 0, 900);
  }

  get frozen() { return this.mood === 'still' || this.mood === 'hush'; }

  heroCenter() {
    const L = this.layout();
    return { x: L.heroX, y: L.floorY - 22 };
  }

  /** 각성 연출 (약 1.7초). onPeak 은 섬광 정점에서 한 번 호출된다. */
  async playAwakening(job, onPeak) {
    const aw = job.awakening;
    const c = this.heroCenter();
    const shapes = [aw.particle, aw.particle, 'sparkle'];

    // 1) 예고 없는 이상 현상: 미세한 떨림 + 빛이 모여듦
    this.fx.shake(1, 0.6);
    this.fx.gather(c.x, c.y, { colors: aw.colors, count: 14, life: 0.55 });
    this.fx.ring(c.x, c.y, job.colorLight, 10, 0.4);
    await WS.sleep(560);

    // 2) 폭발: 섬광 + 강한 흔들림 + 빛 고리
    this.fx.shake(aw.shake + 1, 0.5);
    this.fx.flash(job.colorLight, 0.75, 0.92, 0.22);
    this.fx.ring(c.x, c.y, job.color, Math.max(this.W, this.H) * 0.6, 0.9, 2);
    this.fx.ring(c.x, c.y, job.colorLight, Math.max(this.W, this.H) * 0.4, 0.7, 1);
    await WS.sleep(170);

    // 3) 정점: 외형 변화 + 능력 등록
    this.heroForm = job.id;
    this.heroJob = job;
    if (onPeak) onPeak();
    this.fx.burst(c.x, c.y, { shapes, colors: aw.colors, count: 34, speed: 70, lift: 12, gravity: 14, life: 1.7 });
    await WS.sleep(950);
  }

  // ---------- 앰비언트 ----------

  newFeather(initial) {
    return {
      x: Math.random(),            // 화면 비율 좌표
      y: initial ? Math.random() : 1.08,
      phase: Math.random() * Math.PI * 2,
      speed: 0.012 + Math.random() * 0.012,   // 아래에서 위로 '떨어지는' 깃털
      flip: Math.random() < 0.5,
    };
  }

  update(dt) {
    this.time += dt;
    for (const t of this.tweens) {
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      t.obj[t.key] = t.from + (t.to - t.from) * e;
    }
    const done = this.tweens.filter(t => t.t >= t.dur);
    this.tweens = this.tweens.filter(t => t.t < t.dur);
    done.forEach(t => t.resolve());

    // 주인공 눈 깜빡임 (미레유는 깜빡이지 않는다)
    if (this.blinking > 0) this.blinking -= dt;
    else if ((this.blinkTimer -= dt) <= 0) { this.blinking = 0.13; this.blinkTimer = 2.4 + Math.random() * 2.6; }

    if (!this.frozen) {
      this.ambientTime += dt;
      for (const f of this.feathers) {
        f.y -= f.speed * dt;
        if (f.y < -0.08) Object.assign(f, this.newFeather(false));
      }
      // 찻잔의 김: 위가 아니라 아래로 흘러내린다
      this.steamTimer -= dt;
      if (this.steamTimer <= 0) {
        this.steamTimer = 0.35 + Math.random() * 0.3;
        this.steam.push({ ox: Math.random() < 0.5 ? 0 : 1, t: 0, life: 2.4 });
      }
      for (const s of this.steam) s.t += dt;
      this.steam = this.steam.filter(s => s.t < s.life);
    }

    // 각성 후: 주인공 주변에 직업 색 빛 알갱이가 조용히 피어오른다
    if (this.heroJob && !this.frozen) {
      this.auraTimer -= dt;
      if (this.auraTimer <= 0) {
        this.auraTimer = 0.45 + Math.random() * 0.4;
        const c = this.heroCenter();
        this.fx.particles.push({
          x: c.x + (Math.random() * 18 - 9), y: c.y + 6 + Math.random() * 8,
          vx: 0, vy: -7, g: 0, drag: 1, shape: 'sparkle',
          color: this.heroJob.awakening.colors[Math.floor(Math.random() * 2)],
          life: 1.6, t: 0, twinkle: true,
        });
      }
    }
    this.fx.update(dt);
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(t => this.loop(t));
  }

  // ---------- 그리기 ----------

  draw() {
    const { ctx, W, H } = this;
    const L = this.layout();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground(ctx, W, H);

    const [sx, sy] = this.fx.shakeOffset();
    ctx.setTransform(1, 0, 0, 1, sx, sy);

    this.drawFeathers(ctx, W, H);
    this.drawChair(ctx, L);
    if (this.mireilleAlpha > 0.01) this.drawMireille(ctx, L);
    this.drawTable(ctx, L);
    this.drawHero(ctx, L);
    this.fx.drawWorld(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.drawScreen(ctx, W, H);
    if (this.whiteout > 0.001) {
      ctx.globalAlpha = this.whiteout;
      ctx.fillStyle = '#fbfbfa';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  drawBackground(ctx, W, H) {
    // 바닥도 벽도 없는 흰 공간. 가장자리만 아주 옅게 어둡다 (원근 단서 최소화)
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    const t = this.moodTint;
    const mix = (a, b) => Math.round(a + (b - a) * t);
    g.addColorStop(0, `rgb(${mix(252, 247)},${mix(252, 248)},${mix(250, 252)})`);
    g.addColorStop(1, `rgb(${mix(236, 228)},${mix(236, 231)},${mix(233, 238)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawFeathers(ctx, W, H) {
    for (const f of this.feathers) {
      const sway = Math.sin(this.ambientTime * 0.8 + f.phase) * 6;
      const x = Math.round(f.x * W + sway);
      const y = Math.round(f.y * H);
      const img = WS.SpriteCache.particle('feather', '#d6d5de');
      ctx.save();
      if (f.flip) { ctx.translate(x * 2 + img.width, 0); ctx.scale(-1, 1); }
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, x, y);
      ctx.restore();
    }
  }

  drawChair(ctx, L) {
    // 붉은 벨벳 등받이 + 금색 틀 (미레유가 앉은 의자)
    const w = 30, x0 = L.tableX - 15;
    const top = L.tableTop - 40, bottom = L.tableTop + 1;
    const R = '#b3263a', r = '#86182a', h = '#d2475a', Y = '#d6b25e', y = '#8e6a2c';
    for (let yy = top; yy < bottom; yy++) {
      const k = yy - top;
      const inset = [9, 6, 4, 3, 2, 1, 1][k] ?? 0;
      ctx.fillStyle = y; ctx.fillRect(x0 + inset - 1, yy, w - inset * 2 + 2, 1);
      ctx.fillStyle = Y; ctx.fillRect(x0 + inset, yy, w - inset * 2, 1);
      if (k > 1) {
        ctx.fillStyle = R; ctx.fillRect(x0 + inset + 2, yy, w - inset * 2 - 4, 1);
        ctx.fillStyle = h; ctx.fillRect(x0 + inset + 3, yy, 1, 1);
      }
    }
    ctx.fillStyle = r;
    for (let yy = top + 7; yy < bottom - 3; yy += 7) {
      for (let xx = x0 + 7; xx < x0 + w - 5; xx += 8) ctx.fillRect(xx + (((yy - top) / 7) % 2 ? 4 : 0), yy, 1, 1);
    }
    // 꼭대기 장식
    ctx.fillStyle = Y; ctx.fillRect(x0 + 14, top - 3, 2, 3); ctx.fillRect(x0 + 13, top - 2, 4, 1);
    ctx.fillStyle = '#e0283c'; ctx.fillRect(x0 + 14, top - 2, 2, 1);
  }

  dotSprite(id, frame) {
    const key = 'dot:' + id + ':' + frame;
    const cache = WS.SpriteCache.cache;
    if (cache.has(key)) return cache.get(key);
    const d = WS.DOTS[id];
    const rows = d.frames[frame] || d.frames.idle;
    const codes = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~';
    const c = document.createElement('canvas');
    c.width = d.w; c.height = d.h;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = d.palette[codes.indexOf(ch)];
        g.fillRect(x, y, 1, 1);
      }
    });
    cache.set(key, c);
    return c;
  }

  drawMireille(ctx, L) {
    const img = this.dotSprite('mireille', 'idle');
    ctx.globalAlpha = this.mireilleAlpha;
    // 허리가 테이블 높이에 오도록 (아랫부분은 식탁보에 가려 앉아 있는 것처럼 보인다). 숨도 쉬지 않는다.
    ctx.drawImage(img, L.tableX - img.width / 2, L.tableTop - 30);
    ctx.globalAlpha = 1;
  }

  drawTable(ctx, L) {
    const w = 56, x0 = L.tableX - w / 2, top = L.tableTop;
    const O = '#2b1b2a', D = '#3e2a3c', d = '#56405a', lace = '#efe4ef', laceS = '#c9b6c8', G = '#c9a24a';
    // 상판
    ctx.fillStyle = O; ctx.fillRect(x0 + 1, top - 1, w - 2, 1);
    ctx.fillStyle = d; ctx.fillRect(x0, top, w, 2);
    ctx.fillStyle = G; ctx.fillRect(x0, top + 2, w, 1);
    // 바닥까지 내려오는 식탁보
    ctx.fillStyle = D; ctx.fillRect(x0 + 1, top + 3, w - 2, L.floorY - top - 4);
    ctx.fillStyle = O; ctx.fillRect(x0, top + 3, 1, L.floorY - top - 4); ctx.fillRect(x0 + w - 1, top + 3, 1, L.floorY - top - 4);
    ctx.fillStyle = d;
    for (let xx = x0 + 6; xx < x0 + w - 3; xx += 9) ctx.fillRect(xx, top + 4, 1, L.floorY - top - 8);
    // 레이스 밑단
    ctx.fillStyle = lace; ctx.fillRect(x0, L.floorY - 3, w, 2);
    ctx.fillStyle = laceS;
    for (let xx = x0; xx < x0 + w; xx += 2) ctx.fillRect(xx, L.floorY - 1, 1, 1);
    // 가운데 장미 장식
    const rx = L.tableX - 2, ry = top + 6;
    ctx.fillStyle = '#c4283a'; ctx.fillRect(rx, ry, 4, 3); ctx.fillRect(rx + 1, ry - 1, 2, 5);
    ctx.fillStyle = '#ff6a78'; ctx.fillRect(rx + 1, ry, 1, 1);
    ctx.fillStyle = '#4a7a4a'; ctx.fillRect(rx - 2, ry + 2, 2, 1); ctx.fillRect(rx + 4, ry + 2, 2, 1);
    // 테이블에는 그림자가 없다

    // 찻잔
    const cx = L.tableX + 15, cy = top - 1;
    ctx.fillStyle = '#6a5a6e'; ctx.fillRect(cx - 4, cy, 9, 1);
    ctx.fillStyle = '#f7f2f8'; ctx.fillRect(cx - 3, cy, 7, 1);
    ctx.fillStyle = '#6a5a6e'; ctx.fillRect(cx - 3, cy - 5, 6, 5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 2, cy - 4, 4, 4);
    ctx.fillStyle = '#f2b8cf'; ctx.fillRect(cx - 1, cy - 2, 2, 1);
    ctx.fillStyle = G; ctx.fillRect(cx - 2, cy - 4, 4, 1);
    ctx.fillStyle = '#6a5a6e'; ctx.fillRect(cx + 3, cy - 4, 1, 3);
    // 아래로 흐르는 김
    for (const s of this.steam) {
      const k = s.t / s.life;
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.fillStyle = '#c9c0d0';
      const yy = Math.round(cy - 6 + k * 9);
      const xx = cx - 4 - s.ox - Math.round(k * 3 + Math.sin(s.t * 3) * 0.8);
      ctx.fillRect(xx, yy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  drawHero(ctx, L) {
    const id = this.heroJob ? this.heroJob.id : 'hero';
    const img = this.dotSprite(id, this.blinking > 0 ? 'blink' : 'idle');
    // 주인공에게만 그림자가 있다
    ctx.fillStyle = 'rgba(120,96,120,0.25)';
    ctx.fillRect(L.heroX - 9, L.floorY, 18, 1);
    ctx.fillRect(L.heroX - 6, L.floorY + 1, 12, 1);
    // 숨쉬기: 상반신만 1px 내려앉았다 돌아온다 (발은 바닥에 고정)
    const breathe = this.frozen ? 0 : (Math.sin(this.time * 2.2) > 0.6 ? 1 : 0);
    const x = L.heroX - img.width / 2, y = L.floorY - img.height + 1, split = 24;
    ctx.drawImage(img, 0, split, img.width, img.height - split, x, y + split, img.width, img.height - split);
    ctx.drawImage(img, 0, 0, img.width, split, x, y + breathe, img.width, split);
  }
};
