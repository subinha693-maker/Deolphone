// =============================================================
//  전투 화면 그리기 (canvas)
// =============================================================
const Render = (() => {
  const W = 1600, H = 900;
  const MAP_TOP = 66, MAP_H = 590, MAP_W = 1520;

  function layout(b) {
    const tile = Math.floor(Math.min(92, MAP_W / b.cols, MAP_H / b.rows));
    b.tile = tile;
    b.ox = Math.round((W - tile * b.cols) / 2);
    b.oy = MAP_TOP + Math.round((MAP_H - tile * b.rows) / 2);
    b.mapCache = null;
  }
  const sx = (b, x) => b.ox + (x + 0.5) * b.tile;
  const sy = (b, y) => b.oy + (y + 0.5) * b.tile;

  function hash(c, r, k) { const v = Math.sin(c * 127.1 + r * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- 맵 (한 번 그려서 저장) ----------
  function buildMapCache(b, k) {
    const cv = document.createElement('canvas');
    cv.width = W * k; cv.height = H * k;
    const ctx = cv.getContext('2d');
    ctx.scale(k, k);
    const t = b.tile;
    // 배경
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#141826'); g.addColorStop(1, '#0b0d14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 은은한 안개 무늬
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 1, 2) * W, y = hash(i, 3, 4) * H, r = 80 + hash(i, 5, 6) * 220;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(90,100,150,0.06)'); rg.addColorStop(1, 'rgba(90,100,150,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 맵 테두리
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(ctx, b.ox - 10, b.oy - 10, t * b.cols + 20, t * b.rows + 20, 14); ctx.fill();

    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
      const x = b.ox + c * t, y = b.oy + r * t, ch = b.grid[r][c];
      drawTile(ctx, ch, x, y, t, c, r);
    }
    // 진격로 화살표
    ctx.save();
    for (const p of b.paths) {
      const n = p.nodes;
      for (let i = 1; i < n.length - 1; i++) {
        const a = n[i], nx = n[i + 1];
        const ang = Math.atan2(nx.y - a.y, nx.x - a.x);
        ctx.save();
        ctx.translate(sx(b, a.x), sy(b, a.y)); ctx.rotate(ang);
        ctx.strokeStyle = 'rgba(255,210,160,0.16)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(4, 0); ctx.lineTo(-6, 8); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    return cv;
  }

  function drawTile(ctx, ch, x, y, t, c, r) {
    const pad = 1.5;
    if (ch === 'X') {
      ctx.fillStyle = '#12151d'; ctx.fillRect(x, y, t, t);
      ctx.fillStyle = '#1d212c';
      for (let i = 0; i < 3; i++) {
        const w = t * (0.2 + hash(c, r, i) * 0.25), h = w * 0.7;
        rr(ctx, x + hash(c, r, i + 3) * (t - w), y + hash(c, r, i + 6) * (t - h), w, h, 5); ctx.fill();
      }
      return;
    }
    if (ch === 'H') {
      ctx.fillStyle = '#2b3140'; rr(ctx, x + pad, y + pad + 6, t - pad * 2, t - pad * 2 - 4, 8); ctx.fill();
      const g = ctx.createLinearGradient(x, y, x, y + t);
      g.addColorStop(0, '#6c7893'); g.addColorStop(1, '#4f5970');
      ctx.fillStyle = g; rr(ctx, x + pad, y + pad, t - pad * 2, t - pad * 2 - 8, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 10, y + pad + 3); ctx.lineTo(x + t - 10, y + pad + 3); ctx.stroke();
      // 작은 무늬
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + t * 0.3, y + t * 0.35, t * 0.4, 3);
      return;
    }
    // 길 계열 (R G S B)
    ctx.fillStyle = '#2e3341'; ctx.fillRect(x, y, t, t);
    ctx.fillStyle = '#383e4e';
    for (let i = 0; i < 4; i++) {
      const w = t * 0.42, h = t * 0.42;
      rr(ctx, x + (i % 2) * t * 0.5 + 3, y + Math.floor(i / 2) * t * 0.5 + 3, w, h, 4); ctx.fill();
    }
    if (ch === 'G') {
      ctx.strokeStyle = 'rgba(150,185,235,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      rr(ctx, x + 5, y + 5, t - 10, t - 10, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150,185,235,0.08)'; rr(ctx, x + 5, y + 5, t - 10, t - 10, 7); ctx.fill();
    }
    if (ch === 'S') {
      const cx = x + t / 2, cy = y + t / 2;
      const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, t * 0.48);
      rg.addColorStop(0, 'rgba(255,170,120,0.65)'); rg.addColorStop(1, 'rgba(255,120,90,0)');
      ctx.fillStyle = rg; ctx.fillRect(x, y, t, t);
      ctx.strokeStyle = 'rgba(255,200,160,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, t * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe1c9'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('출현', cx, cy);
    }
    if (ch === 'B') {
      const cx = x + t / 2, cy = y + t / 2;
      const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, t * 0.5);
      rg.addColorStop(0, 'rgba(120,190,255,0.7)'); rg.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(x, y, t, t);
      ctx.fillStyle = '#9fd0ff';
      ctx.beginPath(); ctx.moveTo(cx, cy - t * 0.3); ctx.lineTo(cx + t * 0.2, cy); ctx.lineTo(cx, cy + t * 0.3); ctx.lineTo(cx - t * 0.2, cy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('기지', cx, y + t - 10);
    }
  }

  // ---------- 아군 ----------
  function currentFrame(u) {
    const sp = Assets.sprites[u.id] || {};
    const anims = (ANIMATIONS.characters[u.id] || {}).actions || {};
    if (u.state === 'fallen' && u.fallSprite && sp.fallen) {
      const d = anims.fallen;
      return sp.fallen[Math.min(sp.fallen.length - 1, Math.floor(u.fallT * d.fps))];
    }
    const a = u.anim;
    if (a && a.busy && a.act !== 'idle' && sp[a.act]) {
      const fr = sp[a.act];
      const d = anims[a.act] || { fps: a.fps };
      return fr[Math.min(fr.length - 1, Math.floor(a.t * a.rate * (d.fps || a.fps)))];
    }
    if (sp.idle) {
      const d = anims.idle || { fps: 6 };
      return sp.idle[Math.floor(u.idleT * (d.fps || 6)) % sp.idle.length];
    }
    return null;
  }

  function drawUnit(ctx, b, u, st) {
    const t = b.tile;
    const x = sx(b, u.x), y = sy(b, u.y);
    const animCfg = ANIMATIONS.characters[u.id] || { height: 1.5, offsetY: 0 };
    const cls = GAME_CONFIG.classes[u.ch.cls];
    let alpha = 1, scale = 1;
    if (u.deployT > 0) { const p = 1 - u.deployT / 0.45; scale = 0.6 + 0.4 * p; alpha = Math.min(1, p * 1.6); }
    if (u.state === 'fallen') {
      const fadeStart = u.fallSprite ? u.fallDur - 0.6 : 0;
      alpha = u.fallT < fadeStart ? 1 : 1 - (u.fallT - fadeStart) / (u.fallDur - fadeStart);
    }
    alpha = Math.max(0, alpha);
    ctx.save();
    ctx.globalAlpha = alpha;

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + t * 0.3, t * 0.3, t * 0.1, 0, 0, Math.PI * 2); ctx.fill();

    // 스킬 지속 중 오라
    if (u.skillActive > 0 || u.multi) {
      const pulse = 0.5 + 0.5 * Math.sin(b.time * 6);
      ctx.strokeStyle = u.ch.color; ctx.globalAlpha = alpha * (0.4 + 0.4 * pulse); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y + t * 0.3, t * 0.42, t * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    const img = currentFrame(u);
    const capsule = st && st.capsule;
    const flash = u.hitFlash > 0 || (u.anim && u.anim.flash && u.anim.t < u.anim.dur * 0.6);
    let topY;
    if (img) {
      const h = animCfg.height * t * scale;
      const w = h * img.naturalWidth / img.naturalHeight;
      const by = y + t * 0.36 + (animCfg.offsetY || 0) * t;
      ctx.save();
      ctx.translate(x, by);
      if (u.facing < 0) ctx.scale(-1, 1);
      if (u.state === 'fallen' && !u.fallSprite) ctx.rotate(Math.min(1, u.fallT * 2) * 0.5);
      if (capsule) { ctx.shadowColor = 'rgba(176,110,255,0.95)'; ctx.shadowBlur = 14; }
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.shadowBlur = 0;
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.35; ctx.drawImage(img, -w / 2, -h, w, h); }
      ctx.restore();
      topY = by - h * 0.92;
    } else {
      const r = t * 0.33 * scale;
      const cy = y - t * 0.08;
      ctx.save();
      if (u.state === 'fallen') { ctx.translate(x, cy); ctx.rotate(Math.min(1, u.fallT * 2) * 0.6); ctx.translate(-x, -cy); }
      if (capsule) { ctx.shadowColor = 'rgba(176,110,255,0.95)'; ctx.shadowBlur = 16; }
      ctx.fillStyle = cls.color;
      ctx.beginPath(); ctx.arc(x, cy, r + 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      const face = faceCache(u.id);
      ctx.save();
      ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.clip();
      if (face) {
        if (u.facing < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
        ctx.drawImage(face, x - r, cy - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = '#1d2233'; ctx.fillRect(x - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(u.ch.name.slice(0, 1), x, cy + 1);
      }
      if (flash) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - r, cy - r, r * 2, r * 2); }
      ctx.restore();
      ctx.restore();
      // 이름
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(u.ch.name, x, y + t * 0.36);
      ctx.fillStyle = '#fff'; ctx.fillText(u.ch.name, x, y + t * 0.36);
      topY = cy - r - 6;
    }
    ctx.restore();

    if (u.state !== 'alive') return;
    // 체력 / 스킬 바
    const bw = t * 0.74, bx = x - bw / 2;
    const barY = Math.max(b.oy - 30, topY - 14);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, barY - 1, bw + 2, 12);
    ctx.fillStyle = '#e8484a'; ctx.fillRect(bx, barY, bw * Math.max(0, u.hp / u.maxHp), 6);
    const sk = u.ch.skill;
    let spRatio = u.skillActive > 0 ? u.skillActive / sk.duration : u.sp / sk.sp;
    ctx.fillStyle = u.skillActive > 0 ? '#ffd166' : '#4aa3ff';
    ctx.fillRect(bx, barY + 7, bw * Math.min(1, spRatio), 3);
    // 스킬 준비 아이콘
    if (u.spReady && u.skillActive <= 0 && !u.multi) {
      const pulse = 0.5 + 0.5 * Math.sin(b.time * 7);
      const iy = barY - 16;
      ctx.save();
      ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 10 + pulse * 10;
      ctx.fillStyle = '#bfe6ff';
      ctx.beginPath(); ctx.moveTo(x, iy - 10); ctx.lineTo(x + 8, iy); ctx.lineTo(x, iy + 10); ctx.lineTo(x - 8, iy); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#2a6fd6';
      ctx.beginPath(); ctx.moveTo(x, iy - 5); ctx.lineTo(x + 4, iy); ctx.lineTo(x, iy + 5); ctx.lineTo(x - 4, iy); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 저지 수 표시 (작은 점)
    if (u.ch.tile === 'ground' && st) {
      for (let i = 0; i < st.block; i++) {
        ctx.fillStyle = i < u.blocking.length ? '#ffb25a' : 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(bx + bw + 7, barY + 2 + i * 6, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  const faceCaches = {};
  function faceCache(id) {
    if (!(id in faceCaches)) faceCaches[id] = Assets.faceCanvas(id, 96, 96);
    return faceCaches[id];
  }

  // ---------- 적 ----------
  function drawEnemy(ctx, b, e) {
    const t = b.tile, d = e.d;
    const grade = ENEMY_GRADES[d.grade] || { color: '#aaa', dark: '#666' };
    let x = sx(b, e.x + e.jx), y = sy(b, e.y + e.jy);
    const lunge = e.lunge > 0 ? Math.sin((e.lunge / 0.18) * Math.PI) * t * 0.1 * e.facing : 0;
    x += lunge;
    const r = d.size * t;
    let alpha = 1, sc = 1;
    if (e.dying) { alpha = 1 - e.dieT / 0.45; sc = 1 - e.dieT * 0.8; }
    const lift = d.flying ? t * 0.35 + Math.sin(e.bob) * 4 : Math.abs(Math.sin(e.bob)) * (e.blockedBy || e.stun > 0 ? 0 : 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + t * 0.28, r * (d.flying ? 0.7 : 1), r * 0.3, 0, 0, Math.PI * 2); ctx.fill();

    const img = Assets.enemies[d.id];
    const cy = y + t * 0.28 - r * 0.95 - lift;
    if (img) {
      const h = r * 2.6 * sc, w = h * img.naturalWidth / img.naturalHeight;
      ctx.save(); ctx.translate(x, y + t * 0.3 - lift);
      if (e.facing > 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -h, w, h);
      if (e.hitFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(img, -w / 2, -h, w, h); }
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(x, cy); ctx.scale(sc, sc);
      drawCreature(ctx, d, r, grade, e, b.time);
      if (e.hitFlash > 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // 기절 별
    if (e.stun > 0 && !e.dying) {
      for (let i = 0; i < 3; i++) {
        const a = b.time * 4 + i * 2.1;
        ctx.fillStyle = '#ffe680';
        star(ctx, x + Math.cos(a) * r * 0.8, cy - r - 6 + Math.sin(a) * 4, 4);
      }
    }
    ctx.restore();
    if (e.dying) return;
    // 체력바
    const bw = Math.max(t * 0.6, r * 1.8), bx = x - bw / 2, by = Math.max(d.boss ? 84 : 66, cy - r - (d.boss ? 30 : 14));
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = d.boss ? '#ffb347' : '#f2c14e';
    ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 5);
    if (d.boss) {
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe4a8';
      ctx.fillText(d.name, x, by - 8);
    }
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath(); ctx.fill();
  }

  // 무섭지 않은 둥근 이상체 임시 그래픽
  function drawCreature(ctx, d, r, grade, e, time) {
    const f = e.facing;
    const look = d.look;
    ctx.lineWidth = 2.5; ctx.strokeStyle = grade.dark;
    if (look === 'moth') {
      const flap = 0.55 + 0.45 * Math.abs(Math.sin(time * 9 + e.uid));
      ctx.fillStyle = '#f3ead2'; ctx.strokeStyle = '#b8a77c';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * r * 1.9 * flap, -r * 1.3, s * r * 1.7 * flap, r * 0.1);
        ctx.quadraticCurveTo(s * r * 1.2 * flap, r * 0.9, 0, r * 0.2);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,140,100,0.6)';
        ctx.beginPath(); ctx.moveTo(s * r * 0.3, -r * 0.1); ctx.lineTo(s * r * 1.2 * flap, -r * 0.5); ctx.stroke();
        ctx.strokeStyle = '#b8a77c';
      }
      ctx.strokeStyle = grade.dark;
    }
    if (look === 'toad') {
      // 왕관 두꺼비: 넓적한 몸
      ctx.fillStyle = grade.color;
      ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 1.15, r * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.7, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      // 눈 혹
      for (const s of [-1, 1]) {
        ctx.fillStyle = grade.color;
        ctx.beginPath(); ctx.arc(s * r * 0.48, -r * 0.55, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        eye(ctx, s * r * 0.48 + f * 2, -r * 0.55, r * 0.17, e);
      }
      // 왕관
      ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#a77d10';
      ctx.beginPath();
      const cy0 = -r * 0.82, w = r * 0.55;
      ctx.moveTo(-w, cy0); ctx.lineTo(-w, cy0 - r * 0.3); ctx.lineTo(-w * 0.5, cy0 - r * 0.15); ctx.lineTo(0, cy0 - r * 0.42);
      ctx.lineTo(w * 0.5, cy0 - r * 0.15); ctx.lineTo(w, cy0 - r * 0.3); ctx.lineTo(w, cy0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.arc(0, cy0 - r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fill();
      // 볼 & 입
      ctx.fillStyle = 'rgba(255,140,140,0.5)';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.7, r * 0.05, r * 0.14, r * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = grade.dark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.45, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      return;
    }
    // 기본 둥근 몸
    const bodyR = look === 'moth' ? r * 0.55 : r;
    ctx.fillStyle = grade.color;
    if (look === 'fuzz') {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * bodyR * 0.85, Math.sin(a) * bodyR * 0.8, bodyR * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.ellipse(0, 0, bodyR, bodyR * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    if (look !== 'fuzz') ctx.stroke();
    // 하이라이트
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(-bodyR * 0.35, -bodyR * 0.45, bodyR * 0.3, bodyR * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();

    if (look === 'shell') {
      ctx.fillStyle = grade.dark;
      ctx.beginPath(); ctx.ellipse(0, -bodyR * 0.2, bodyR * 0.95, bodyR * 0.7, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      for (const s of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(s * bodyR, -bodyR * 0.85); ctx.lineTo(s * bodyR * 1.2, -bodyR * 0.2); ctx.stroke(); }
    }
    if (look === 'horn') {
      ctx.fillStyle = '#fff1d6'; ctx.strokeStyle = grade.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f * bodyR * 0.5, -bodyR * 0.75); ctx.lineTo(f * bodyR * 1.15, -bodyR * 1.05); ctx.lineTo(f * bodyR * 0.85, -bodyR * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (look === 'spike') {
      ctx.fillStyle = grade.dark;
      for (const s of [-0.5, 0, 0.5]) {
        ctx.beginPath(); ctx.moveTo(s * bodyR - 6, -bodyR * 0.8); ctx.lineTo(s * bodyR, -bodyR * 1.25); ctx.lineTo(s * bodyR + 6, -bodyR * 0.8); ctx.closePath(); ctx.fill();
      }
    }
    // 눈
    const ex = f * bodyR * 0.18;
    if (look === 'mask') {
      ctx.fillStyle = '#3a2f55';
      rr(ctx, -bodyR * 0.8 + ex, -bodyR * 0.42, bodyR * 1.6, bodyR * 0.42, bodyR * 0.2); ctx.fill();
    }
    const er = bodyR * (look === 'moth' ? 0.26 : 0.2);
    eye(ctx, ex - bodyR * 0.32, -bodyR * 0.2, er, e);
    eye(ctx, ex + bodyR * 0.32, -bodyR * 0.2, er, e);
    // 볼
    ctx.fillStyle = 'rgba(255,150,160,0.45)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(ex + s * bodyR * 0.55, bodyR * 0.15, bodyR * 0.13, bodyR * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
    // 입
    ctx.strokeStyle = grade.dark; ctx.lineWidth = 2;
    ctx.beginPath();
    if (e.blockedBy) { ctx.moveTo(ex - bodyR * 0.12, bodyR * 0.25); ctx.lineTo(ex + bodyR * 0.12, bodyR * 0.25); }
    else ctx.arc(ex, bodyR * 0.12, bodyR * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // 발
    if (look !== 'moth') {
      ctx.fillStyle = grade.dark;
      const step = Math.sin(e.bob * 2) * 3;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * bodyR * 0.45, bodyR * 0.9 + (s > 0 ? step : -step) * 0.3, bodyR * 0.22, bodyR * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function eye(ctx, x, y, r, e) {
    if (e.stun > 0) {
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b3a';
    ctx.beginPath(); ctx.arc(x + e.facing * r * 0.25, y + r * 0.1, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + e.facing * r * 0.25 - r * 0.2, y - r * 0.2, r * 0.2, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- 투사체 / 효과 ----------
  function drawProjectile(ctx, b, p) {
    const x = sx(b, p.x), y = sy(b, p.y);
    if (p.img) {
      const h = b.tile * (p.big ? 0.6 : 0.4), w = h * p.img.naturalWidth / p.img.naturalHeight;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle || 0);
      ctx.drawImage(p.img, -w / 2, -h / 2, w, h); ctx.restore();
      return;
    }
    const r = p.big ? 12 : (p.fromEnemy ? 5 : 7);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    if (p.angle != null && !p.fromEnemy) {
      ctx.strokeStyle = p.color; ctx.globalAlpha = 0.5; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(p.angle) * r * 3, y - Math.sin(p.angle) * r * 3); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEffect(ctx, b, f) {
    const p = f.t / f.dur, t = b.tile;
    const x = sx(b, f.unit ? f.unit.x : f.x), y = sy(b, f.unit ? f.unit.y : f.y);
    ctx.save();
    switch (f.type) {
      case 'deploy': {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = f.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(x, y + t * 0.3, t * (0.2 + p * 0.5), t * (0.07 + p * 0.17), 0, 0, Math.PI * 2); ctx.stroke();
        const g = ctx.createLinearGradient(x, y - t, x, y + t * 0.3);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, f.color);
        ctx.globalAlpha = (1 - p) * 0.5; ctx.fillStyle = g; ctx.fillRect(x - t * 0.25, y - t, t * 0.5, t * 1.3);
        break;
      }
      case 'ring': case 'shock': {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = f.color; ctx.lineWidth = f.type === 'shock' ? 8 : 4;
        ctx.beginPath(); ctx.arc(x, y, f.r * t * (0.3 + 0.7 * p), 0, Math.PI * 2); ctx.stroke();
        if (f.fill) { ctx.globalAlpha = (1 - p) * 0.18; ctx.fillStyle = f.color; ctx.fill(); }
        break;
      }
      case 'glow': {
        const g = ctx.createRadialGradient(x, y - t * 0.3, 0, x, y - t * 0.3, t * 0.9);
        g.addColorStop(0, f.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.sin(p * Math.PI) * 0.7;
        ctx.fillStyle = g; ctx.fillRect(x - t, y - t * 1.3, t * 2, t * 2);
        break;
      }
      case 'burst': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - p) * 0.6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, f.r * t);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, f.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, f.r * t * (0.5 + p * 0.5), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'spark': case 'thump': {
        ctx.globalAlpha = 1 - p; ctx.fillStyle = f.color;
        star(ctx, x, y - t * 0.15, 8 + p * 10);
        break;
      }
      case 'slash': {
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x - f.dir * t * 0.2, y - t * 0.15, t * 0.35, -0.9 + p, 0.4 + p); ctx.stroke();
        break;
      }
      case 'spin': {
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
        const a = p * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x, y, f.r * t, a, a + Math.PI * 1.2); ctx.stroke();
        break;
      }
      case 'poof': {
        ctx.globalAlpha = (1 - p) * 0.8; ctx.fillStyle = '#e9ecf5';
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * p * t * 0.4, y - t * 0.15 + Math.sin(a) * p * t * 0.3, t * 0.12 * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'crystal': {
        ctx.globalAlpha = 1 - p; ctx.fillStyle = f.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        const h = t * 0.7 * Math.min(1, p * 3), w = t * 0.14;
        ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y - h * 0.3); ctx.lineTo(x, y + 4); ctx.lineTo(x - w, y - h * 0.3); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  // ---------- 전체 ----------
  function draw(ctx, b, ui, k) {
    if (!b.mapCache || b.mapCacheK !== k) { b.mapCache = buildMapCache(b, k); b.mapCacheK = k; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(b.mapCache, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (b.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * b.shake, (Math.random() - 0.5) * 8 * b.shake);
    const t = b.tile;

    // 배치 가능 칸 표시
    if (ui.validTiles && ui.validTiles.length) {
      const pulse = 0.55 + 0.25 * Math.sin(b.time * 5 + performance.now() / 300);
      for (const v of ui.validTiles) {
        const x = b.ox + v.c * t, y = b.oy + v.r * t;
        ctx.fillStyle = `rgba(255,236,170,${0.22 * pulse + 0.1})`;
        rr(ctx, x + 4, y + 4, t - 8, t - 8, 8); ctx.fill();
        ctx.strokeStyle = `rgba(255,236,170,${0.8 * pulse})`; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
    if (ui.hoverTile) {
      const v = ui.hoverTile;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      rr(ctx, b.ox + v.c * t + 2, b.oy + v.r * t + 2, t - 4, t - 4, 8); ctx.fill();
    }
    // 사거리 원
    if (ui.rangeAt) {
      const { x, y, r, color } = ui.rangeAt;
      ctx.save();
      ctx.fillStyle = color || 'rgba(255,200,120,0.12)';
      ctx.strokeStyle = 'rgba(255,220,150,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(sx(b, x), sy(b, y), r * t, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // 대상 강조
    if (ui.unitTargets) {
      for (const u of ui.unitTargets) {
        ctx.strokeStyle = 'rgba(200,150,255,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx(b, u.x), sy(b, u.y), t * 0.48, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // 보스 예고
    for (const e of b.enemies) {
      if (!e.telegraph) continue;
      const tp = e.telegraph, p = 1 - tp.t / tp.max;
      const x = sx(b, tp.x), y = sy(b, tp.y);
      ctx.save();
      ctx.fillStyle = `rgba(255,70,60,${0.12 + 0.25 * p})`;
      ctx.strokeStyle = `rgba(255,110,90,${0.6 + 0.4 * Math.sin(b.time * 20)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, tp.r * t, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,70,0.35)';
      ctx.beginPath(); ctx.arc(x, y, tp.r * t * p, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 캐릭터·적 (아래쪽이 앞)
    const list = [];
    for (const u of b.units) list.push({ y: u.y + 0.01, u });
    for (const e of b.enemies) list.push({ y: e.y + (e.d.flying ? 0.3 : 0), e });
    list.sort((a, c) => a.y - c.y);
    for (const it of list) {
      if (it.u) drawUnit(ctx, b, it.u, it.u.state === 'alive' ? Battle.stats(b, it.u) : null);
      else drawEnemy(ctx, b, it.e);
    }
    for (const p of b.projectiles) drawProjectile(ctx, b, p);
    for (const f of b.effects) drawEffect(ctx, b, f);
    for (const tx of b.texts) {
      const p = tx.t / tx.dur;
      ctx.globalAlpha = 1 - p * p;
      ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const yy = sy(b, tx.y) - p * 26;
      ctx.strokeText(tx.text, sx(b, tx.x), yy);
      ctx.fillStyle = tx.color; ctx.fillText(tx.text, sx(b, tx.x), yy);
      ctx.globalAlpha = 1;
    }
  }

  function tileFromPoint(b, gx, gy) {
    const c = Math.floor((gx - b.ox) / b.tile), r = Math.floor((gy - b.oy) / b.tile);
    if (c < 0 || r < 0 || c >= b.cols || r >= b.rows) return null;
    return { c, r };
  }

  return { W, H, layout, draw, tileFromPoint, sx, sy, faceCache };
})();
