// Canvas renderer for the side-scrolling battle. Pure view: reads battle state, never changes it.
(function () {
  const MG = (window.MG = window.MG || {});
  const W = 1280;
  const H = 720;
  const PX = 4; // background pixel size
  const CHAR_SCALE = 1.4;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /** Low-res gothic background layers (drawn once, scaled up with nearest-neighbour). */
  function buildLayers() {
    const lw = 640 / 2; // 320 px wide tile = 1280 screen px
    const lh = H / PX;
    const sky = makeCanvas(lw, lh);
    let g = sky.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, lh);
    grad.addColorStop(0, '#120a1f');
    grad.addColorStop(0.45, '#2a1638');
    grad.addColorStop(1, '#3a1d3f');
    g.fillStyle = grad;
    g.fillRect(0, 0, lw, lh);
    // stars
    const rnd = MG.RNG(77);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = rnd.chance(0.3) ? '#f6d7ff' : '#9c7fb8';
      g.fillRect(rnd.int(0, lw), rnd.int(0, 60), 1, 1);
    }
    // moon
    g.fillStyle = '#f3e3f7';
    g.beginPath();
    g.arc(250, 22, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1638';
    g.beginPath();
    g.arc(255, 19, 10, 0, Math.PI * 2);
    g.fill();

    // far cathedral silhouettes (tileable)
    const far = makeCanvas(lw, lh);
    g = far.getContext('2d');
    g.fillStyle = '#1d1029';
    const spires = [
      [10, 40, 18], [40, 30, 12], [70, 46, 22], [110, 26, 14], [150, 38, 20], [190, 22, 10], [215, 44, 24], [260, 34, 16], [295, 42, 18],
    ];
    for (const [x, top, w] of spires) {
      g.fillRect(x, top + 8, w, 140);
      g.beginPath();
      g.moveTo(x - 1, top + 8);
      g.lineTo(x + w / 2, top - 10);
      g.lineTo(x + w + 1, top + 8);
      g.fill();
      g.fillStyle = '#3d2246';
      for (let wy = top + 14; wy < 70; wy += 9) g.fillRect(x + w / 2 - 1, wy, 2, 4);
      g.fillStyle = '#1d1029';
    }

    // near layer: gothic wall between lanes + pillars
    const near = makeCanvas(lw, lh);
    g = near.getContext('2d');
    const laneTop = (y) => Math.round((y - 62) / PX);
    // upper lane road
    const roads = MG.FormationSystem.G.LANE_Y.map((y) => ({ top: laneTop(y), bottom: Math.round((y + 22) / PX) }));
    // wall band between the lanes
    g.fillStyle = '#26142f';
    g.fillRect(0, roads[0].bottom, lw, roads[1].top - roads[0].bottom);
    g.fillStyle = '#331c3d';
    for (let x = 0; x < lw; x += 8) for (let y = roads[0].bottom + 2; y < roads[1].top - 2; y += 5) g.fillRect(x + ((y / 5) % 2) * 4, y, 7, 4);
    // arches on the wall
    g.fillStyle = '#1a0d22';
    for (let x = 12; x < lw; x += 64) {
      g.fillRect(x, roads[0].bottom + 8, 22, roads[1].top - roads[0].bottom - 8);
      g.beginPath();
      g.arc(x + 11, roads[0].bottom + 8, 11, Math.PI, 0);
      g.fill();
    }
    // roads (cobblestone)
    for (const r of roads) {
      g.fillStyle = '#4a2c4f';
      g.fillRect(0, r.top, lw, r.bottom - r.top);
      g.fillStyle = '#5b3760';
      for (let x = 0; x < lw; x += 6) for (let y = r.top + 1; y < r.bottom; y += 3) g.fillRect(x + ((y - r.top) % 2) * 3, y, 4, 2);
      g.fillStyle = '#7a4d78';
      g.fillRect(0, r.top, lw, 1);
      g.fillStyle = '#20112a';
      g.fillRect(0, r.bottom, lw, 2);
    }
    // iron fence silhouettes on top of the upper road
    g.fillStyle = '#160b1d';
    for (let x = 0; x < lw; x += 6) {
      g.fillRect(x, roads[0].top - 10, 1, 10);
      g.fillRect(x - 1, roads[0].top - 11, 3, 1);
    }
    g.fillRect(0, roads[0].top - 6, lw, 1);
    // bottom (under HUD)
    g.fillStyle = '#140a19';
    g.fillRect(0, roads[1].bottom + 2, lw, lh);
    return { sky, far, near };
  }

  class BattleRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.layers = buildLayers();
      this.dust = [];
    }

    drawLayer(img, offset) {
      const g = this.g;
      const w = img.width * PX;
      const o = -((offset % w) + w) % w;
      g.drawImage(img, 0, 0, img.width, img.height, o, 0, w, img.height * PX);
      g.drawImage(img, 0, 0, img.width, img.height, o + w, 0, w, img.height * PX);
    }

    draw(battle) {
      const g = this.g;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, W, H);
      this.drawLayer(this.layers.sky, battle.scroll * 0.05);
      this.drawLayer(this.layers.far, battle.scroll * 0.25);
      this.drawLayer(this.layers.near, battle.scroll);

      if (battle.defense) this.drawHome(battle);
      this.drawLaneHints(battle);

      // entities sorted per lane (lower lane in front)
      for (const lane of [0, 1]) {
        for (const e of battle.enemies) if (e.lane === lane) this.drawEnemy(battle, e);
        this.drawAlliesOfLane(battle, lane);
      }
      this.drawMovers(battle);
      this.drawWarnings(battle);
      this.drawProjectiles(battle);
      this.drawVfx(battle);
      this.drawFloats(battle);
      this.drawDust(battle);
      this.drawBanner(battle);
    }

    drawWarnings(battle) {
      const g = this.g;
      for (const w of battle.warnings) {
        const y = MG.FormationSystem.G.LANE_Y[w.lane];
        const a = 0.55 + 0.45 * Math.sin(battle.time * 14);
        g.fillStyle = `rgba(255,60,90,${0.25 * a})`;
        g.fillRect(1120, y - 120, 160, 140);
        g.fillStyle = `rgba(255,120,140,${a})`;
        g.font = 'bold 18px "Gowun Batang", serif';
        g.textAlign = 'center';
        g.fillText('⚠ ' + w.text, 1190, y - 40);
      }
    }

    drawHome(battle) {
      const g = this.g;
      const G = MG.FormationSystem.G;
      for (const y of G.LANE_Y) {
        const t = battle.time;
        g.save();
        g.translate(G.HOME_X, y - 40);
        g.strokeStyle = `rgba(255,120,190,${0.55 + 0.25 * Math.sin(t * 3)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(0, 0, 26, 52, 0, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(255,120,190,0.15)';
        g.fill();
        g.fillStyle = '#ffb3d9';
        g.font = 'bold 14px "Gowun Batang", serif';
        g.textAlign = 'center';
        g.fillText('✠', 0, 6);
        g.restore();
      }
    }

    drawLaneHints(battle) {
      const g = this.g;
      const G = MG.FormationSystem.G;
      for (const lane of [0, 1]) {
        if (battle.party.laneUnits(lane).length) continue;
        const reserved = battle.party.isReserved(lane + '-front') || battle.party.isReserved(lane + '-back');
        g.fillStyle = reserved ? 'rgba(127,216,255,0.6)' : 'rgba(255,107,138,0.75)';
        g.font = '16px "Gowun Batang", serif';
        g.textAlign = 'center';
        g.fillText(reserved ? '아군 이동 중…' : '배치된 아군 없음', G.BACK_X + 60, G.LANE_Y[lane] - 30);
      }
    }

    animFrame(anim) {
      const def = MG.CombatSystem.ANIM[anim.name] || MG.CombatSystem.ANIM.idle;
      let i = Math.floor(anim.t * def.fps);
      if (def.loop) i %= def.frames.length;
      else i = Math.min(i, def.frames.length - 1);
      return def.frames[i];
    }

    spriteAnimName(anim) {
      if (anim.name === 'ko') return 'hurt';
      return anim.name;
    }

    drawAlliesOfLane(battle, lane) {
      const P = battle.party;
      for (const slot of ['back', 'front']) {
        const id = P.slots[lane + '-' + slot];
        if (!id) continue;
        this.drawAlly(battle, P.get(id), 1);
      }
    }

    drawAlly(battle, u, alpha) {
      const g = this.g;
      const b = u.b;
      const frame = this.animFrame(b.anim);
      const name = this.spriteAnimName(b.anim);
      // idle breathing bob
      const bob = b.anim.name === 'idle' ? Math.sin(battle.time * 3 + u.def.stats.hp) * 1.5 : 0;
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(b.x, b.y + 2, 30, 7, 0, 0, Math.PI * 2);
      g.fill();
      if (b.hurtFlash > 0) g.filter = 'brightness(1.8) saturate(0.4)';
      MG.Assets.drawFrame(g, u.def.id, name, frame, b.x, b.y + bob, CHAR_SCALE, alpha);
      g.filter = 'none';
      if (u.hp <= 0) return;
      // shield bubble
      if (b.shield > 0) {
        g.strokeStyle = 'rgba(150,215,255,0.8)';
        g.fillStyle = 'rgba(150,215,255,0.12)';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(b.x, b.y - 52, 46, 62, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      // hp bar
      const w = 54;
      const x = b.x - w / 2;
      const y = b.y - 128;
      g.fillStyle = '#1a0f1f';
      g.fillRect(x - 1, y - 1, w + 2, 7);
      g.fillStyle = '#5b2a3c';
      g.fillRect(x, y, w, 5);
      g.fillStyle = u.hp / u.maxHp > 0.35 ? '#ff7fbf' : '#ff4f6a';
      g.fillRect(x, y, (w * u.hp) / u.maxHp, 5);
      if (b.shield > 0) {
        g.fillStyle = '#9fd8ff';
        g.fillRect(x, y - 3, Math.min(w, (w * b.shield) / u.maxHp), 2);
      }
      // skill ready sparkle
      if ((u.skillCd || 0) <= 0 && battle.phase === 'combat') {
        g.fillStyle = `rgba(255,236,140,${0.6 + 0.4 * Math.sin(battle.time * 6)})`;
        g.font = '14px serif';
        g.textAlign = 'center';
        g.fillText('✦', x + w + 8, y + 6);
      }
      if (b.regen) {
        g.fillStyle = '#9ff0c0';
        g.font = '12px serif';
        g.fillText('✚', x - 9, y - 6);
      }
      if (b.buffs.some((bf) => bf.stat === 'taken')) {
        g.fillStyle = '#ffe08a';
        g.font = '12px serif';
        g.fillText('✝', x + w + 8, y - 6);
      }
      if (battle.hasteUnitId === u.id) {
        g.fillStyle = '#c7a0ff';
        g.font = '12px serif';
        g.fillText('❖', x - 9, y + 6);
      }
    }

    drawMovers(battle) {
      const G = MG.FormationSystem.G;
      for (const [id, m] of Object.entries(battle.party.moving)) {
        const u = battle.party.get(id);
        const g = this.g;
        MG.Assets.drawFrame(g, u.def.id, 'walk', this.animFrame({ name: 'walk', t: battle.time }), u.b.x, u.b.y, CHAR_SCALE * 0.9, 0.75);
        g.fillStyle = '#7fd8ff';
        g.font = '13px "Gowun Batang", serif';
        g.textAlign = 'center';
        g.fillText(`이동 중 ${(m.total - m.t).toFixed(1)}s`, u.b.x, u.b.y - 112);
      }
    }

    drawEnemy(battle, e) {
      const g = this.g;
      const frames = MG.Assets.enemyFrames[e.id];
      if (!frames) return;
      const walkFrame = Math.floor(battle.time * 4 + e.stagger) % frames.length;
      const fr = frames[e.state === 'walk' || e.data.flying ? walkFrame : 0];
      const img = e.hitFlash > 0 ? fr.flash : fr.normal;
      const lunge = e.lunge > 0 ? -10 * Math.sin((e.lunge / 0.18) * Math.PI) : 0;
      const hover = e.data.flying ? Math.sin(battle.time * 5 + e.stagger) * 4 : 0;
      const x = Math.round(e.x - e.w / 2 + lunge);
      const y = Math.round(e.y - e.h + hover);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(e.x, MG.FormationSystem.G.LANE_Y[e.lane] + 2, e.w * 0.35, 6, 0, 0, Math.PI * 2);
      g.fill();
      if (e.dead) {
        g.globalAlpha = Math.max(0, 1 - e.deathT / 0.5);
        g.drawImage(img, x, y + e.deathT * 30);
        g.globalAlpha = 1;
        return;
      }
      if (e.stunUntil > battle.time) g.filter = e.frozen ? 'saturate(0.3) brightness(1.3) hue-rotate(160deg)' : 'grayscale(0.6)';
      g.drawImage(img, x, y);
      g.filter = 'none';
      // hp bar
      const w = Math.max(36, e.w * 0.8);
      const bx = e.x - w / 2;
      const by = y - 10;
      g.fillStyle = '#1a0f1f';
      g.fillRect(bx - 1, by - 1, w + 2, 6);
      g.fillStyle = e.data.boss || e.data.elite ? '#ffb347' : '#e0384f';
      g.fillRect(bx, by, (w * e.hp) / e.maxHp, 4);
      // status icons
      let ix = bx;
      g.font = '13px serif';
      g.textAlign = 'left';
      if (e.markUntil > battle.time) {
        g.fillStyle = '#ff9f43';
        g.fillText('⌖', ix, by - 4);
        ix += 13;
      }
      if (e.stunUntil > battle.time) {
        g.fillStyle = '#f2c14e';
        g.fillText('✶', ix, by - 4);
        ix += 13;
      }
      if (e.slowUntil > battle.time) {
        g.fillStyle = '#9fd8ff';
        g.fillText('❄', ix, by - 4);
      }
      if (e.state === 'wait') {
        g.fillStyle = '#ff9fb8';
        g.font = '12px "Gowun Batang", serif';
        g.textAlign = 'center';
        g.fillText('대기 중', e.x, by - 16);
      }
    }

    drawProjectiles(battle) {
      const g = this.g;
      for (const p of battle.projectiles) {
        if (p.from === 'ally') {
          const def = MG.CHARACTERS[p.charId];
          if (def.projFrame != null && MG.Assets.drawFrameCentered(g, p.charId, 'proj', def.projFrame, p.x, p.y, 0.55)) continue;
        }
        g.fillStyle = p.color;
        g.shadowColor = p.color;
        g.shadowBlur = 12;
        g.beginPath();
        g.arc(p.x, p.y, p.from === 'ally' ? 9 : 7, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(p.x, p.y, 3, 0, Math.PI * 2);
        g.fill();
      }
    }

    drawVfx(battle) {
      const g = this.g;
      for (const v of battle.vfx) {
        const k = v.t / v.dur;
        if (v.type === 'impact') {
          const def = MG.CHARACTERS[v.charId];
          MG.Assets.drawFrameCentered(g, v.charId, 'proj', def.impactFrame, v.x, v.y - 30, (v.scale || 0.8) * (0.7 + k * 0.5), 1 - k);
        } else if (v.type === 'slash') {
          g.strokeStyle = v.color;
          g.globalAlpha = 1 - k;
          g.lineWidth = 5;
          g.beginPath();
          g.arc(v.x - 20, v.y, 34 + k * 10, -1.1, 0.9);
          g.stroke();
          g.globalAlpha = 1;
        } else if (v.type === 'ring') {
          g.strokeStyle = v.color;
          g.globalAlpha = 1 - k;
          g.lineWidth = 4;
          g.beginPath();
          g.ellipse(v.x, v.y, v.r * k, v.r * k * 0.45, 0, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        } else if (v.type === 'star' || v.type === 'burst') {
          g.fillStyle = v.color;
          g.globalAlpha = 1 - k;
          const r = (v.type === 'star' ? 26 : 14) * (0.5 + k);
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const rr = i % 2 ? r * 0.4 : r;
            g.lineTo(v.x + Math.cos(a) * rr, v.y + Math.sin(a) * rr);
          }
          g.fill();
          g.globalAlpha = 1;
        }
      }
    }

    drawFloats(battle) {
      const g = this.g;
      g.textAlign = 'center';
      for (const f of battle.floats) {
        const a = 1 - Math.max(0, (f.t - f.dur * 0.6) / (f.dur * 0.4));
        g.globalAlpha = a;
        g.font = `bold ${Math.round(16 * f.size)}px "Gowun Batang", serif`;
        g.lineWidth = 4;
        g.strokeStyle = '#1a0f1f';
        g.strokeText(f.text, f.x, f.y);
        g.fillStyle = f.color;
        g.fillText(f.text, f.x, f.y);
      }
      g.globalAlpha = 1;
    }

    drawDust(battle) {
      const g = this.g;
      if (battle.phase === 'advance' && Math.random() < 0.5) {
        const lane = Math.random() < 0.5 ? 0 : 1;
        this.dust.push({ x: 300 + Math.random() * 160, y: MG.FormationSystem.G.LANE_Y[lane], t: 0 });
      }
      for (const d of this.dust) {
        d.t += 1 / 60;
        d.x -= 4;
        d.y -= 0.3;
      }
      this.dust = this.dust.filter((d) => d.t < 0.6);
      g.fillStyle = 'rgba(200,170,210,0.35)';
      for (const d of this.dust) g.fillRect(d.x, d.y - 4, 4 * (1 - d.t), 4 * (1 - d.t));
    }

    drawBanner(battle) {
      const bn = battle.banner;
      if (!bn || bn.t > 1.8) return;
      const g = this.g;
      const a = bn.t < 0.2 ? bn.t / 0.2 : bn.t > 1.4 ? 1 - (bn.t - 1.4) / 0.4 : 1;
      g.globalAlpha = Math.max(0, a);
      const y = 140;
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(26,15,31,0)');
      grad.addColorStop(0.3, 'rgba(60,25,60,0.85)');
      grad.addColorStop(0.7, 'rgba(60,25,60,0.85)');
      grad.addColorStop(1, 'rgba(26,15,31,0)');
      g.fillStyle = grad;
      g.fillRect(0, y - 42, W, 74);
      g.fillStyle = '#f4c6e0';
      g.fillRect(W * 0.25, y - 42, W * 0.5, 1);
      g.fillRect(W * 0.25, y + 31, W * 0.5, 1);
      g.textAlign = 'center';
      g.font = 'bold 36px "Gowun Batang", serif';
      g.fillStyle = bn.text === 'DEFEAT' ? '#ff6b8a' : '#ffe9f5';
      g.fillText(bn.text, W / 2, y + 2);
      if (bn.sub) {
        g.font = '16px "Gowun Batang", serif';
        g.fillStyle = '#e8b6d6';
        g.fillText(bn.sub, W / 2, y + 24);
      }
      g.globalAlpha = 1;
    }
  }

  MG.BattleRenderer = BattleRenderer;
})();
