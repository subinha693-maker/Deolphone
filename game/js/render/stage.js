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
    this.feathers = Array.from({ length: 9 }, () => this.newFeather(true));
    this.steam = [];
    this.steamTimer = 0;
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.scale = Math.max(1, Math.floor(Math.min(vw / 230, vh / 124)));
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
    const floorY = Math.round(this.H * 0.55);
    return {
      cx, floorY,
      tableX: cx + 14, tableTop: floorY - 13,
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
    return { x: L.heroX, y: L.floorY - 17 };
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
    const x0 = L.tableX - 13, w = 26;
    const top = L.tableTop - 28, bottom = L.tableTop + 2;
    const R = '#a8202a', r = '#7a141c', Y = '#c9a24a', y = '#8a6a2a';
    const px = (x, yy, c) => { ctx.fillStyle = c; ctx.fillRect(x, yy, 1, 1); };
    for (let yy = top; yy < bottom; yy++) {
      const k = yy - top;
      const inset = k === 0 ? 7 : k === 1 ? 4 : k === 2 ? 2 : k === 3 ? 1 : 0;
      ctx.fillStyle = y; ctx.fillRect(x0 + inset - 1, yy, w - inset * 2 + 2, 1);
      ctx.fillStyle = Y; ctx.fillRect(x0 + inset, yy, w - inset * 2, 1);
      if (k > 0) { ctx.fillStyle = R; ctx.fillRect(x0 + inset + 2, yy, w - inset * 2 - 4, 1); }
    }
    // 단추 장식 (터프팅)
    for (let yy = top + 6; yy < bottom - 2; yy += 6) {
      for (let xx = x0 + 6; xx < x0 + w - 4; xx += 7) px(xx + ((yy - top) % 12 ? 3 : 0), yy, r);
    }
    px(x0 + 12, top - 1, Y); px(x0 + 13, top - 1, Y); px(x0 + 12, top - 2, y); px(x0 + 13, top - 2, y);
  }

  drawMireille(ctx, L) {
    const img = WS.SpriteCache.build('mireille', WS.SPRITES.mireille);
    ctx.globalAlpha = this.mireilleAlpha;
    // 손이 테이블 위에 올라오도록 배치. 미레유는 숨을 쉬지 않는다 (미동 없음)
    ctx.drawImage(img, L.tableX - Math.floor(img.width / 2), L.tableTop - img.height + 2);
    ctx.globalAlpha = 1;
  }

  drawTable(ctx, L) {
    const x0 = L.tableX - 22, w = 44, top = L.tableTop;
    const O = '#3a3440', D = '#26222b', d = '#4a4352', G = '#b89b5e', g = '#8a7040';
    // 상판
    ctx.fillStyle = O; ctx.fillRect(x0, top - 1, w, 1);
    ctx.fillStyle = d; ctx.fillRect(x0, top, w, 2);
    ctx.fillStyle = G; ctx.fillRect(x0, top + 2, w, 1);
    ctx.fillStyle = D; ctx.fillRect(x0 + 1, top + 3, w - 2, 1);
    ctx.fillStyle = g; ctx.fillRect(x0 + 3, top + 4, w - 6, 1);
    // 기둥 + 받침
    const lx = L.tableX - 2;
    ctx.fillStyle = D; ctx.fillRect(lx, top + 5, 4, L.floorY - top - 7);
    ctx.fillStyle = d; ctx.fillRect(lx + 1, top + 5, 1, L.floorY - top - 7);
    ctx.fillStyle = G; ctx.fillRect(lx - 1, top + 8, 6, 1);
    ctx.fillStyle = D; ctx.fillRect(lx - 6, L.floorY - 2, 16, 2);
    ctx.fillStyle = G; ctx.fillRect(lx - 7, L.floorY - 1, 18, 1);
    // 테이블에는 그림자가 없다

    // 찻잔
    const cx = L.tableX + 12, cy = top - 1;
    ctx.fillStyle = '#6a6676'; ctx.fillRect(cx - 4, cy - 1, 9, 1);           // 받침 외곽
    ctx.fillStyle = '#f4f3f8'; ctx.fillRect(cx - 3, cy - 1, 7, 1);           // 받침
    ctx.fillStyle = '#6a6676'; ctx.fillRect(cx - 3, cy - 5, 6, 4);           // 잔 외곽
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 2, cy - 4, 4, 3);
    ctx.fillStyle = G; ctx.fillRect(cx - 2, cy - 4, 4, 1);                   // 금테
    ctx.fillStyle = '#6a6676'; ctx.fillRect(cx + 3, cy - 4, 1, 2);           // 손잡이
    // 아래로 흐르는 김
    for (const s of this.steam) {
      const k = s.t / s.life;
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.fillStyle = '#c9c8d4';
      const yy = Math.round(cy - 5 + k * 9);
      const xx = cx - 4 - s.ox - Math.round(k * 3 + Math.sin(s.t * 3) * 0.8);
      ctx.fillRect(xx, yy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  drawHero(ctx, L) {
    const job = this.heroJob;
    const img = job
      ? WS.SpriteCache.build('heroMagical', WS.SPRITES.heroMagical, job.sprite)
      : WS.SpriteCache.build('heroBase', WS.SPRITES.heroBase);
    // 주인공에게만 그림자가 있다
    ctx.fillStyle = 'rgba(120,118,135,0.28)';
    ctx.fillRect(L.heroX - 7, L.floorY, 14, 1);
    ctx.fillRect(L.heroX - 5, L.floorY + 1, 10, 1);
    // 숨쉬기: 상반신만 1px 내려앉았다 돌아온다 (발은 바닥에 고정)
    const breathe = this.frozen ? 0 : (Math.sin(this.time * 2.2) > 0.6 ? 1 : 0);
    const x = L.heroX - Math.floor(img.width / 2), y = L.floorY - img.height + 1, split = 19;
    ctx.drawImage(img, 0, split, img.width, img.height - split, x, y + split, img.width, img.height - split);
    ctx.drawImage(img, 0, 0, img.width, split, x, y + breathe, img.width, split);
  }
};
