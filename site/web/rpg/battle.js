/*
 * 전투 — 턴제 (속도 순서), 변신, 직업 능력, 해방 기술, 상태 이상
 * ------------------------------------------------------------
 *   R.Battle.run(game, encounter) → Promise<'win' | 'lose' | 'flee'>
 *   encounter = { mons: [{ id, lv }], boss: bool, place: 지역 종류 }
 *
 * 변신 게이지
 *   - 전투에 들어갈 때 게이지가 남아 있으면 변신해서 싸운다 (게이지 소모: 일반 5 / 보스 10, 유물로 증감)
 *   - 게이지가 0 이면 변신하지 못한다: 평상복, 공격 · 마력 · 방어 · 속도 ×0.55, 능력과 해방 기술 봉인
 *   - 마물에게 지면 게이지가 25 더 깎인다
 *   - 0 이 된 게이지는 잠을 자서 하루를 넘겨야만 다시 찬다 (core.js R.sleep)
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EL_LABEL = { fire: '화염', ice: '냉기', thunder: '번개' };

  // ---------------- 마물 능력치 ----------------
  /**
   * regionMul: 지역 배율 (R.MAPS.<지역>.enc.mul) — 레벨 곡선 격차를 지역별로만 보정한다. 체력 · 공격 · 방어 · 마력에 곱한다.
   */
  const MON_HP = { a: 500, b: 88, c: 3 };      // 체력 = 500 + 88L + 3L² (제안 그대로)
  const MON_ATK_SCALE = 3.5;                    // 공격 · 마력 = 옛 공식 × 3.5   ※ 임시 (제안 ×6 → 시뮬레이션으로 조정)
  const MON_DEF_SCALE = 6;                      // 방어 = 옛 공식 × 6
  const MON_SPD_PER_LV = 1.0;                   // 속도 = 5 + 1.0L (옛 1.2)
  R.monStats = function (id, lv, regionMul = 1) {
    const m = R.MON[id], mul = Object.assign({ hp: 1, atk: 1, def: 1, mag: 1, spd: 1 }, m.m || {});
    for (const k of ['hp', 'atk', 'def', 'mag']) mul[k] *= regionMul;
    const boss = !!m.boss;
    const L = lv;
    const s = {
      // 능력치 상향(1부). 옛 공식: 체력 16+12L+0.45L² · 공격 6+3.4L+0.05L² · 방어 2+2.2L · 마력 6+3.3L+0.05L² · 속도 5+1.2L
      hp: (MON_HP.a + L * MON_HP.b + L * L * MON_HP.c) * mul.hp * (boss ? 5 : 1),
      atk: (6 + L * 3.4 + L * L * 0.05) * MON_ATK_SCALE * mul.atk * (boss ? 1.15 : 1),
      def: (2 + L * 2.2) * MON_DEF_SCALE * mul.def,
      mag: (6 + L * 3.3 + L * L * 0.05) * MON_ATK_SCALE * mul.mag * (boss ? 1.15 : 1),
      spd: (5 + L * MON_SPD_PER_LV) * mul.spd,
    };
    for (const k in s) s[k] = Math.max(1, Math.round(s[k]));
    s.exp = Math.round((6 + L * L + L * 4) * 0.8 * (m.exp || 1) * (boss ? 6 : 1));
    s.gold = Math.round((4 + L * 5) * (m.gold || 1) * (boss ? 5 : 1));
    return s;
  };

  /** 날짜에 따른 마물 레벨 보정: 멸망이 다가올수록 강해진다 */
  R.levelBonus = function (rp) {
    return Math.floor((rp.day - 1) / 6);
  };

  // ---------------- 화면 (캔버스) ----------------
  class BattleView {
    constructor(battle) {
      this.b = battle;
      this.time = 0;
      this.pops = [];
    }
    scaleFor(vw, vh) { return Math.max(1, Math.round(vh / 420)); }
    update(dt) {
      this.time += dt;
      this.pops = this.pops.filter(p => (p.t += dt) < p.life);
      for (const e of this.b.enemies) { e.shake = Math.max(0, (e.shake || 0) - dt); e.lunge = Math.max(0, (e.lunge || 0) - dt); }
      const p = this.b.player; p.shake = Math.max(0, (p.shake || 0) - dt); p.lunge = Math.max(0, (p.lunge || 0) - dt);
    }
    /**
     * 1인칭 구도: 주인공은 화면 밖(카메라 자리)에 있고, 마물이 정면에서 이쪽을 바라본다.
     * 주인공은 아래 상태창의 초상화로만 보인다.
     */
    layout(W, H) {
      const n = this.b.enemies.length;
      const floor = Math.round(H * 0.7);
      const x0 = W * 0.1, x1 = W * 0.9;
      return {
        floor, horizon: Math.round(H * 0.44),
        hero: { x: Math.round(W / 2), y: Math.round(H * 0.8) },    // 카메라(주인공) 자리 — 피해 숫자 · 효과 위치
        enemyX: i => Math.round(n === 1 ? W / 2 : x0 + (x1 - x0) * (i + 0.5) / n),
      };
    }
    enemyAt(px, py) {
      for (let i = 0; i < this.b.enemies.length; i++) {
        const e = this.b.enemies[i];
        if (e.hp <= 0 || !e.rect) continue;
        const r = e.rect;
        if (px >= r.x - 10 && px <= r.x + r.w + 10 && py >= r.y - 10 && py <= r.y + r.h + 10) return i;
      }
      return -1;
    }
    slash(i, color) { this.slashes = this.slashes || []; this.slashes.push({ i, color, t: 0 }); }
    draw(ctx, W, H) {
      const b = this.b, t = this.time, L = this.layout(W, H);
      ctx.imageSmoothingEnabled = false;
      // ----- 배경: 지평선과 원근 바닥 -----
      const pal = {
        forest: ['#24382c', '#4e6e46', '#2e4a32'], mush: ['#2e2042', '#5e4a70', '#3a2a50'], river: ['#3a6a8a', '#6e9a6a', '#46705a'],
        mine: ['#1e1712', '#4e4032', '#2e241c'], cave: ['#101e2c', '#34485a', '#1a2c3a'], sea: ['#3a78b0', '#cdb880', '#2e5e8e'],
        ruins: ['#2e2440', '#7a7262', '#3e3650'], towerfloor: ['#160e1e', '#40344e', '#22182e'],
        cliff: ['#6a8aaa', '#8a7a66', '#5a6e7e'], battlefield: ['#5a5a4e', '#7a7458', '#4a4a3e'], graveyard: ['#1e2236', '#3e4a40', '#2a3040'],
        lake: ['#2a3a6a', '#5a7a6a', '#3a4e7a'], canyon: ['#a85a3a', '#c9774a', '#8a3e24'], desert: ['#d8b070', '#e0c088', '#b8905a'],
        coast: ['#5a9ac8', '#d8c48a', '#3a7ab0'], observatory: ['#141a3a', '#4a5a4a', '#202a50'], fortress: ['#2e2a36', '#6e6680', '#3e384a'],
        oldvillage: ['#5a5a5e', '#6e7466', '#4a4a4e'], interior: ['#4a2e22', '#b07c4c', '#5a3a2a'],
      }[b.place] || ['#4a6a8a', '#6e8e5e', '#4e6e4e'];
      const sky = ctx.createLinearGradient(0, 0, 0, L.horizon);
      sky.addColorStop(0, pal[0]); sky.addColorStop(1, pal[2]);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, L.horizon);
      const gnd = ctx.createLinearGradient(0, L.horizon, 0, H);
      gnd.addColorStop(0, pal[2]); gnd.addColorStop(1, pal[1]);
      ctx.fillStyle = gnd; ctx.fillRect(0, L.horizon, W, H - L.horizon);
      // 원근선 (시선이 마물 쪽으로 모이도록)
      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 2;
      for (let k = -6; k <= 6; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * 30, L.horizon); ctx.lineTo(W / 2 + k * W * 0.22, H); ctx.stroke(); }
      for (let k = 1; k < 6; k++) { const y = L.horizon + (H - L.horizon) * Math.pow(k / 6, 1.8); ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, Math.round(y), W, 2); }
      const doom = (b.rp.day - 1) / (R.TIME.lastDay - 1);
      if (doom > 0) { ctx.fillStyle = `rgba(180,30,40,${(doom * 0.22).toFixed(3)})`; ctx.fillRect(0, 0, W, L.horizon); }

      const [sx, sy] = WS.game.stage.fx.shakeOffset();
      ctx.save(); ctx.translate(sx, sy);
      // ----- 마물 (정면 2D 전투 스프라이트, 크게) -----
      const n = b.enemies.length;
      const order = b.enemies.map((e, i) => i).sort((a, c) => (b.enemies[a].boss ? 1 : 0) - (b.enemies[c].boss ? 1 : 0));
      for (const i of order) {
        const e = b.enemies[i];
        let cx = L.enemyX(i) + (e.shake ? Math.sin(t * 60) * 5 : 0);
        const by = L.floor + 10;
        if (e.hp <= 0) {
          if (e.fade === undefined) continue;
          e.fade = Math.max(0, e.fade - 0.03);
          if (e.fade <= 0) continue;
        }
        const alpha = e.hp > 0 ? 1 : e.fade;
        // 덤벼들 때 화면 쪽으로 커진다
        const lunge = e.lunge ? Math.sin(e.lunge * Math.PI / 0.3) : 0;
        const breathe = 1 + Math.sin(t * 2.2 + i) * 0.012;
        const baseH = e.boss ? Math.min(H * 0.56, 340) : Math.min(H * (n >= 3 ? 0.36 : 0.42), 230);
        const h = baseH * breathe * (1 + lunge * 0.18);
        const maxW = e.boss ? W * 0.6 : (W * 0.82) / n;
        ctx.globalAlpha = 0.32 * alpha; ctx.fillStyle = '#0c060c';
        ctx.beginPath(); ctx.ellipse(cx, by - 2, Math.min(maxW * 0.45, e.boss ? 150 : 80), e.boss ? 18 : 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha;
        const blink = e.shake > 0 && Math.floor(t * 30) % 2 === 0;
        if (!blink) {
          const rect = R.drawMon(ctx, e.id, cx, by + lunge * 14, h, t + i * 0.37, { maxScale: e.boss ? 3.6 : 3, maxW });
          if (rect) e.rect = rect;
        }
        if (e.frozen > 0 && e.hp > 0 && e.rect) { ctx.fillStyle = 'rgba(160,210,255,0.35)'; ctx.fillRect(e.rect.x, e.rect.y, e.rect.w, e.rect.h); }
        ctx.globalAlpha = 1;
        if (e.hp > 0 && e.rect) {
          const bw = Math.min(120, Math.max(70, e.rect.w * 0.6)), bx = Math.round(cx - bw / 2), byy = Math.max(64, Math.round(e.rect.y - 12));
          ctx.fillStyle = '#3e2a3b'; ctx.fillRect(bx - 1, byy - 1, bw + 2, 7);
          ctx.fillStyle = '#5c2a3a'; ctx.fillRect(bx, byy, bw, 5);
          ctx.fillStyle = e.boss ? '#e0384a' : '#f07a8a'; ctx.fillRect(bx, byy, Math.round(bw * e.hp / e.maxhp), 5);
          ctx.font = '700 13px "Nanum Myeongjo", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(30,16,28,0.8)'; ctx.fillText(`Lv${e.lv} ${e.name}`, cx + 1, byy - 2);
          ctx.fillStyle = '#fbe3f0'; ctx.fillText(`Lv${e.lv} ${e.name}`, cx, byy - 3);
          const et = [e.sleep > 0 && '수면', e.frozen > 0 && '빙결', e.slow > 0 && '둔화', e.burn > 0 && '화상', e.weak > 0 && '약화', e.silence > 0 && '침묵'].filter(Boolean);
          if (et.length) {
            ctx.font = '700 11px "Nanum Gothic", sans-serif'; ctx.textBaseline = 'top';
            const tw = ctx.measureText(et.join(' · ')).width + 10;
            ctx.fillStyle = 'rgba(40,20,36,0.82)'; ctx.fillRect(Math.round(cx - tw / 2), byy + 8, Math.round(tw), 15);
            ctx.fillStyle = '#ffd9a8'; ctx.fillText(et.join(' · '), cx, byy + 9);
          }
          if (b.targeting && b.targetCandidates.includes(i)) {
            const yy = byy - 30 + Math.round(Math.sin(t * 6) * 3);
            ctx.fillStyle = '#ffe9a8';
            ctx.beginPath(); ctx.moveTo(cx - 10, yy); ctx.lineTo(cx + 10, yy); ctx.lineTo(cx, yy + 12); ctx.closePath(); ctx.fill();
          }
        }
      }
      // ----- 주인공의 공격: 마물 위로 베기 · 마법 궤적 -----
      this.slashes = (this.slashes || []).filter(sl => (sl.t += 1 / 60) < 0.28);
      for (const sl of this.slashes) {
        const e = b.enemies[sl.i]; if (!e || !e.rect) continue;
        const k = sl.t / 0.28, r = e.rect;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = sl.color || '#fff6fb'; ctx.lineWidth = 6 * (1 - k) + 2;
        ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.15, r.y + r.h * 0.2); ctx.lineTo(r.x + r.w * (0.15 + 0.7 * Math.min(1, k * 3)), r.y + r.h * (0.2 + 0.6 * Math.min(1, k * 3))); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.85, r.y + r.h * 0.25); ctx.lineTo(r.x + r.w * (0.85 - 0.6 * Math.min(1, k * 3)), r.y + r.h * (0.25 + 0.55 * Math.min(1, k * 3))); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      WS.game.stage.fx.drawWorld(ctx);
      // ----- 피해 숫자 -----
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const pp of this.pops) {
        const k = pp.t / pp.life;
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.font = `800 ${pp.big ? 32 : 24}px "Nanum Myeongjo", serif`;
        const y = pp.y - 28 * Math.min(1, k * 3);
        ctx.fillStyle = '#2a1420'; ctx.fillText(pp.text, pp.x + 2, y + 2);
        ctx.fillStyle = pp.color; ctx.fillText(pp.text, pp.x, y);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // ----- 1인칭 피격: 화면 가장자리가 붉게 -----
      const p = b.player;
      if (p.shake > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(200,20,40,0)'); g.addColorStop(1, `rgba(200,20,40,${(p.shake / 0.3 * 0.55).toFixed(3)})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (p.asleep > 0) { ctx.fillStyle = 'rgba(40,20,70,0.35)'; ctx.fillRect(0, 0, W, H); }
      if (b.form === 'job') {
        // 변신 중: 시야 가장자리에 직업 색 빛
        const job = R.job(b.run);
        const g = ctx.createLinearGradient(0, H, 0, H * 0.6);
        g.addColorStop(0, job.color + '55'); g.addColorStop(1, job.color + '00');
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 3);
        ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);
        ctx.globalAlpha = 1;
      }
    }
    pop(x, y, text, color = '#fff6fb', big) { this.pops.push({ x, y, text: String(text), color, t: 0, life: 1.1, big }); }
  }

  // ---------------- 화면 (DOM) ----------------
  function ensureDom() {
    let el = document.getElementById('rpg-battle');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'rpg-battle';
    el.innerHTML = `
      <div class="rb-log p-frame"><span class="rb-log-text"></span></div>
      <div class="rb-order" aria-label="이번 턴 행동 순서"></div>
      <div class="rb-panel">
        <div class="rb-hero p-frame">
          <div class="rb-portrait"><img alt=""></div>
          <div class="rb-hero-info">
            <div class="rb-name"></div>
            <div class="rb-bar hp"><span>체력</span><i><em></em></i><b></b></div>
            <div class="rb-bar mp"><span>마나</span><i><em></em></i><b></b></div>
            <div class="rb-bar gauge"><span>변신</span><i><em></em></i><b></b></div>
            <div class="rb-status"></div>
          </div>
        </div>
        <div class="rb-cmd p-frame"><div class="rb-cmd-list"></div></div>
      </div>
      <div class="rb-result overlay"><div class="rb-result-panel p-frame"><h2 class="plate"></h2><div class="rb-result-body"></div><button type="button" class="g-btn rb-result-ok">계속</button></div></div>`;
    document.getElementById('game').appendChild(el);
    el.addEventListener('click', e => e.stopPropagation());
    return el;
  }

  // ---------------- 전투 ----------------
  class Battle {
    constructor(game, enc) {
      this.game = game;
      this.run = game.state;
      this.rp = game.state.rpg;
      this.enc = enc;
      this.place = enc.place;
      this.boss = !!enc.boss;
      this.turn = 0;
      this.enemies = enc.mons.map((m, i) => {
        const st = R.monStats(m.id, m.lv, enc.mul || 1), def = R.MON[m.id];
        // 마물 데이터는 e.mon (능력치의 def(방어)와 이름이 겹쳐 덮이지 않게 — 예전에는 e.def 가 방어 숫자로 덮여 기술 · 약점 · 드롭이 동작하지 않았다)
        return Object.assign({ idx: i, id: m.id, lv: m.lv, name: def.n, boss: !!def.boss, rare: !!def.rare, mon: def, maxhp: st.hp, frozen: 0, delay: 0, slow: 0, buff: 0, sleep: 0, burn: 0, weak: 0, silence: 0 }, st);
      });
      // 같은 이름 구분
      const seen = {};
      for (const e of this.enemies) { seen[e.name] = (seen[e.name] || 0) + 1; }
      const cnt = {};
      for (const e of this.enemies) if (seen[e.name] > 1) { cnt[e.name] = (cnt[e.name] || 0) + 1; e.name += ' ' + 'ABCD'[cnt[e.name] - 1]; }
      this.player = { hp: this.rp.hp, mp: this.rp.mp, shield: 0, buffs: {}, asleep: 0, slow: 0, guard: false, burn: 0, weak: 0, silence: 0 };
      this.cool = {};
      this.weaponEl = null;     // 속성 사탕: 이번 전투 동안 일반 공격 속성 (마법봉 속성보다 우선)
      this.goldMul = 1;         // 행운의 동전
      this.itemUses = {};       // 아이템별 이번 전투 사용 횟수 (perBattle 제한용)
      this.view = new BattleView(this);
      this.dom = ensureDom();
      this.logEl = this.dom.querySelector('.rb-log-text');
      this.cmdEl = this.dom.querySelector('.rb-cmd-list');
    }

    get stats() { return R.stats(this.run, this.form); }

    // ---------- 진행 ----------
    async start() {
      const g = this.game, rp = this.rp;
      // 변신 판정
      const cost = R.gaugeCost(this.run, this.boss);
      this.form = rp.gauge > 0 ? 'job' : 'human';
      if (this.form === 'job') rp.gauge = Math.max(0, rp.gauge - cost);
      this.gaugeSpent = this.form === 'job' ? cost : 0;
      rp.battles++;
      this.prevView = g.stage.view;
      g.stage.setView(this.view);
      this.dom.classList.add('show');
      R.UI.showHud(false);
      g.ui.dialogue.hide();
      this.dom.querySelector('.rb-result').classList.remove('show');
      g.ui.pushModal();
      this.refresh();
      this.clearCmd();
      const names = [...new Set(this.enemies.map(e => e.mon.n))].join(', ');
      await this.say(this.boss ? `강대한 기운… ${names}${WS.josa(names, '이/가').slice(names.length)} 앞을 가로막았다!` : `${names}${WS.josa(names, '이/가').slice(names.length)} 나타났다!`, 900);
      if (this.form === 'job') {
        await this.transform();
        await this.say(`변신! 「${R.job(this.run).name}」 (변신 게이지 -${cost})`, 800);
      } else {
        await this.say('변신 게이지가 바닥나 변신할 수 없다… 이 몸으로는 한 번만 맞아도 끝이다! 도망쳐야 한다.', 1500);
      }
      let result = null;
      let first = true;
      while (!result) {
        this.turn++;
        result = await this.round(first);
        first = false;
      }
      return this.finish(result);
    }

    async transform() {
      const job = R.job(this.run), st = this.game.stage, fx = st.fx;
      const L = this.view.layout(st.W, st.H);
      const c = { x: L.hero.x, y: L.hero.y };
      const aw = job.awakening;
      this.form = 'human';
      fx.gather(c.x, c.y, { colors: aw.colors, count: 12, life: 0.45 });
      fx.ring(c.x, c.y, job.colorLight, 10, 0.35);
      await WS.sleep(420);
      fx.flash(job.colorLight, 0.6, 0.8, 0.2);
      fx.ring(c.x, c.y, job.color, 160, 0.7, 2);
      this.form = 'job';
      fx.burst(c.x, c.y, { shapes: [aw.particle, 'sparkle'], colors: aw.colors, count: 24, speed: 60, lift: 10, gravity: 14, life: 1.3 });
      this.refresh();
      await WS.sleep(450);
    }

    alive() { return this.enemies.filter(e => e.hp > 0); }

    async round(first) {
      const p = this.player, st = this.stats;
      // 턴 시작 효과
      if (st.regen && p.hp > 0) { const v = Math.round(st.hp * st.regen); if (p.hp < st.hp) { p.hp = Math.min(st.hp, p.hp + v); this.popHero('+' + v, '#9be8a8'); } }
      if (st.mpRegen) p.mp = Math.min(st.mp, p.mp + st.mpRegen);
      for (const k in this.cool) if (this.cool[k] > 0) this.cool[k]--;
      p.guard = false;
      this.refresh();

      // 주인공 행동 선택
      // 아이템은 턴을 쓰지 않는다: 효과만 적용하고 다시 명령 선택으로 돌아온다 (몇 개든 연달아 사용 가능).
      // 재사용 대기 · 버프 턴 · 독 같은 턴 효과는 위(턴 시작)와 아래(턴 끝)에서만 줄어들므로 아이템 사용과 무관하다.
      let action = null;
      this.showOrder(first, null);
      if (p.asleep > 0) { action = { kind: 'sleep' }; }
      else {
        action = await this.choose();
        while (action.kind === 'item') {
          await this.playerAct(action);
          this.refresh();
          if (!this.alive().length) return 'win';        // 공격 아이템으로 마지막 적을 쓰러뜨리면 바로 승리
          if (this.fled) return 'flee';                   // 연막탄
          this.showOrder(first, null);
          action = await this.choose();
        }
      }
      if (action.kind === 'flee') {
        const ok = await this.tryFlee(action.sure);
        if (ok) return 'flee';
        action = { kind: 'none' };
      }
      // 순서: 속도가 높은 쪽이 항상 먼저 (같으면 주인공 먼저)
      const order = this.turnOrder(first, action);
      this.showOrder(first, action, order);

      for (const o of order) {
        this.markOrder(o);
        if (o.who === 'player') {
          if (p.hp <= 0) continue;
          await this.playerAct(o.action);
        } else {
          const e = o.who;
          if (e.hp <= 0 || p.hp <= 0) continue;
          await this.enemyAct(e);
        }
        this.refresh();
        if (!this.alive().length) return 'win';
        if (p.hp <= 0) return 'lose';
        if (this.fled) return 'flee';
      }
      // 턴 끝: 독 · 지속 효과
      if (p.poison > 0 && p.hp > 0) {
        const v = Math.max(1, Math.round(this.stats.hp * 0.05));
        p.hp = Math.max(0, p.hp - v); p.poison--;
        this.popHero(v, '#b98ad8');
        await this.say(`독이 몸을 갉아먹는다… (${v})`, 650);
        if (p.hp <= 0) return 'lose';
      }
      // 화상 (주인공): 최대 체력의 5%
      if (p.burn > 0 && p.hp > 0) {
        const v = Math.max(1, Math.round(this.stats.hp * R.STATUS.burn.pct));
        p.hp = Math.max(0, p.hp - v); p.burn--;
        this.popHero(v, '#ff9a5a');
        await this.say(`화상이 몸을 태운다… (${v})`, 600);
        if (p.hp <= 0) return 'lose';
      }
      // 화상 (마물): 최대 체력의 5%, 마수 2%
      for (const e of this.alive()) {
        if (!(e.burn > 0)) continue;
        const v = Math.max(1, Math.round(e.maxhp * (e.boss ? R.STATUS.burn.bossPct : R.STATUS.burn.pct)));
        e.hp = Math.max(0, e.hp - v); e.burn--;
        const L = this.view.layout(this.game.stage.W, this.game.stage.H);
        this.view.pop(L.enemyX(e.idx), L.floor - 70, v, '#ff9a5a');
        if (e.hp <= 0) { e.fade = 1; this.rp.kills++; }
        await this.say(`${e.name}은(는) 불타고 있다. (${v})${e.hp <= 0 ? ` ${e.name}을(를) 쓰러뜨렸다!` : ''}`, 550);
      }
      this.refresh();
      if (!this.alive().length) return 'win';
      for (const k in p.buffs) if (--p.buffs[k].turns <= 0) delete p.buffs[k];
      if (p.shield > 0 && --p.shieldTurns <= 0) p.shield = 0;
      if (p.slow > 0) p.slow--;
      if (p.weak > 0) p.weak--;
      if (p.silence > 0) p.silence--;
      for (const e of this.enemies) { if (e.slow > 0) e.slow--; if (e.weak > 0) e.weak--; if (e.silence > 0) e.silence--; }
      return null;
    }

    // ---------- 행동 순서 ----------
    /**
     * 이번 턴 행동 순서. 무작위 값 없이 속도(spd)로만 정한다.
     *  - 둔화(주인공 ×0.7, 마물 ×0.65) · 가속(haste) 반영
     *  - 방어를 고르면 주인공이 맨 먼저, 태엽 심장(firstStrike)은 첫 턴에 맨 먼저
     *  - 속도가 같으면 주인공이 먼저 (주인공을 목록 맨 앞에 두고 안정 정렬)
     */
    turnOrder(first, action) {
      const p = this.player;
      const order = [{ who: 'player', spd: this.stats.spd * (1 + (p.buffs.haste ? p.buffs.haste.amount : 0)) * (p.slow > 0 ? 0.7 : 1), action }];
      for (const e of this.alive()) order.push({ who: e, spd: e.spd * (e.slow > 0 ? 0.65 : 1) });
      if (action && action.kind === 'guard') order[0].spd += 1e6;   // 방어는 먼저
      if (first && this.stats.flags.firstStrike) order[0].spd += 1e7;
      return order.sort((a, b) => b.spd - a.spd);
    }

    /** 화면 위 행동 순서 표시. action 이 정해지기 전에는 예상 순서 */
    showOrder(first, action, order) {
      order = order || this.turnOrder(first, action);
      this.curOrder = order;
      const el = this.dom.querySelector('.rb-order');
      el.innerHTML = '<span class="ro-label">행동 순서</span>' + order.map((o, i) =>
        `<span class="ro-chip ${o.who === 'player' ? 'me' : 'foe'}" data-i="${i}">${o.who === 'player' ? this.name : o.who.name}</span>`).join('<i class="ro-arrow">›</i>');
    }

    markOrder(o) {
      const i = (this.curOrder || []).indexOf(o);
      this.dom.querySelectorAll('.ro-chip').forEach(c => {
        const k = +c.dataset.i;
        c.classList.toggle('now', k === i);
        c.classList.toggle('done', k < i);
      });
    }

    // ---------- 명령 선택 ----------
    clearCmd() { this.cmdEl.innerHTML = ''; }

    btn(label, fn, opts = {}) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-btn rb-btn' + (opts.cls ? ' ' + opts.cls : '');
      b.innerHTML = label;
      b.disabled = !!opts.disabled;
      if (opts.title) b.title = opts.title;
      b.addEventListener('click', e => { e.stopPropagation(); if (!b.disabled) fn(); });
      this.cmdEl.appendChild(b);
      return b;
    }

    choose() {
      return new Promise(resolve => {
        const done = a => { this.clearCmd(); this.targeting = false; resolve(a); };
        const main = () => {
          this.clearCmd();
          this.say('어떻게 할까?', 0);
          const human = this.form !== 'job';
          this.btn('공격', () => target('enemy', i => done({ kind: 'attack', target: i }), main));
          const silenced = this.player.silence > 0;
          this.btn('능력', abilities, { disabled: human || silenced, title: human ? '변신하지 못해 능력을 쓸 수 없다' : silenced ? '침묵 — 능력을 쓸 수 없다' : '' });
          const rc = R.GAUGE.releaseCost;
          this.btn(`해방 <small>게이지 ${rc}</small>`, () => target('enemy', i => done({ kind: 'release', target: i }), main), { disabled: human || this.rp.gauge < rc, cls: 'rb-release' });
          this.btn('아이템', items);
          this.btn('방어', () => done({ kind: 'guard' }));
          this.btn('도망', () => done({ kind: 'flee' }), { disabled: this.boss });
        };
        const target = (kind, cb, back) => {
          const alive = this.alive();
          if (alive.length === 1 || kind !== 'enemy') { cb(alive[0].idx); return; }
          this.clearCmd();
          this.say('대상을 고르세요 (마물을 직접 눌러도 됩니다)', 0);
          this.targeting = true;
          this.targetCandidates = alive.map(e => e.idx);
          this.onCanvasPick = i => { this.onCanvasPick = null; this.targeting = false; cb(i); };
          for (const e of alive) this.btn(`${e.name} <small>${e.hp}/${e.maxhp}</small>`, () => { this.onCanvasPick = null; this.targeting = false; cb(e.idx); });
          this.btn('뒤로', () => { this.onCanvasPick = null; this.targeting = false; back(); }, { cls: 'rb-back' });
        };
        const abilities = () => {
          this.clearCmd();
          this.say('능력을 고르세요', 0);
          for (const a of this.run.player.abilities) {
            const cd = this.cool[a.id] || 0;
            const can = this.player.mp >= a.cost && cd <= 0;
            this.btn(`${a.name} <small>마나 ${a.cost}${cd ? ` · 대기 ${cd}` : ''}</small>`, () => {
              if (a.target === 'enemy') target('enemy', i => done({ kind: 'ability', ab: a, target: i }), abilities);
              else done({ kind: 'ability', ab: a });
            }, { disabled: !can, title: a.desc });
          }
          this.btn('뒤로', main, { cls: 'rb-back' });
        };
        const items = () => {
          this.clearCmd();
          this.say('아이템을 고르세요', 0);
          // 전투에서 쓸 수 있는 것만 (필드 전용 · 영혼의 보석 제외), 분류 순서: 회복 · 정화 → 전투용
          const CAT = { heal: 0, battle: 1 };
          const list = Object.keys(this.run.inventory).filter(id => { const it = R.ITEMS[id]; return it && it.kind === 'use' && !it.fieldOnly && it.cat !== 'gem' && it.cat !== 'field'; })
            .sort((a, b) => (CAT[R.ITEMS[a].cat] ?? 9) - (CAT[R.ITEMS[b].cat] ?? 9));
          if (!list.length) this.say('쓸 수 있는 아이템이 없다', 0);
          for (const id of list) {
            const it = R.ITEMS[id];
            const blocked = (it.escape && this.boss) || (it.gauge && this.rp.gauge <= 0) || (it.perBattle && (this.itemUses[id] || 0) >= it.perBattle);
            this.btn(`${R.icon(it.icon, 20)} ${it.n} <small>×${this.run.inventory[id]}</small>`, () => {
              if (R.itemNeedsTarget(it)) target('enemy', i => done({ kind: 'item', id, target: i }), items);
              else done({ kind: 'item', id });
            }, { disabled: blocked, title: it.d });
          }
          this.btn('뒤로', main, { cls: 'rb-back' });
        };
        main();
      });
    }

    // ---------- 계산 ----------
    dmgFormula(a, d) { return Math.max(1, Math.round(a * a / (a + d) * rand(0.9, 1.1))); }
    atkPower(kind) {
      const st = this.stats, b = this.player.buffs;
      const up = b.atkUp ? 1 + b.atkUp.amount : 1;
      const weak = this.player.weak > 0 ? 1 - R.STATUS.weak.amount : 1;    // 약화
      return (kind === 'mag' ? st.mag : st.atk) * up * weak;
    }
    /** 상태 부여 성공률 (마수 저항 · 약점 속성 보너스) */
    chanceFor(e, base, status, el) {
      const RS = R.RESIST;
      let mul = RS.normal;
      if (e.boss) mul = (status === 'sleep' || status === 'silence') ? RS.bossSleepSilence : RS.boss;
      const bonus = el && this.weakMul(e, el) > 1 ? RS.weakBonus : 0;
      return Math.max(0, Math.min(1, base * mul + bonus));
    }
    /** 적에게 상태이상 걸기 → 결과 문장 ('' 이면 실패) */
    inflict(e, status, chance, turns, el) {
      if (!e || e.hp <= 0) return '';
      if (Math.random() >= this.chanceFor(e, chance, status, el)) return `${e.name}은(는) 버텨 냈다.`;
      const T = turns || (R.STATUS[status] || {}).turns || 2;
      if (status === 'sleep') { e.sleep = T; return `${e.name}은(는) 잠들었다!`; }
      if (status === 'slow') { e.slow = Math.max(e.slow, T); return `${e.name}은(는) 둔해졌다.`; }
      if (status === 'burn') { e.burn = T; return `${e.name}에게 화상!`; }
      if (status === 'weak') { e.weak = T; return `${e.name}은(는) 약해졌다.`; }
      if (status === 'silence') { e.silence = T; return `${e.name}은(는) 기술을 쓸 수 없게 되었다!`; }
      if (status === 'freeze') { e.frozen = T; return `${e.name}은(는) 얼어붙었다!`; }
      return '';
    }
    /** 주인공에게 걸린 상태이상 목록 */
    playerStatuses() {
      const p = this.player;
      return ['poison', 'sleep', 'slow', 'burn', 'weak', 'silence'].filter(k => (k === 'sleep' ? p.asleep : p[k]) > 0);
    }
    clearStatus(k) { if (k === 'sleep') this.player.asleep = 0; else this.player[k] = 0; }
    weakMul(e, el) { return el && e.mon.weak && e.mon.weak.includes(el) ? 1.5 : 1; }

    async hitEnemy(e, raw, opts = {}) {
      const st = this.stats;
      let dmg = raw;
      const weak = this.weakMul(e, opts.el);
      dmg = Math.round(dmg * weak);
      let crit = false;
      if (!opts.noCrit && Math.random() * 100 < st.crit) { crit = true; dmg = Math.round(dmg * 1.6); }
      dmg = Math.max(1, dmg);
      e.hp = Math.max(0, e.hp - dmg);
      e.shake = 0.3;
      if (!opts.silent) R.Audio && R.Audio.hitFor(opts.el, opts.kind, opts.all);
      this.view.slash(e.idx, opts.color || R.job(this.run).colorLight);
      const L = this.view.layout(this.game.stage.W, this.game.stage.H);
      const x = L.enemyX(e.idx), y = e.rect ? e.rect.y + e.rect.h * 0.4 : L.floor - 60;
      this.view.pop(x, y, dmg, crit ? '#ffe9a8' : weak > 1 ? '#ffb48a' : '#fff6fb', crit || weak > 1);
      if (crit) this.game.stage.fx.shake(2, 0.25);
      const notes = [];
      if (weak > 1) notes.push('약점!');
      if (crit) notes.push('치명타!');
      if (e.hp <= 0) { e.fade = 1; this.rp.kills++; }
      else if (e.sleep > 0) { e.sleep = 0; notes.push(`${e.name}은(는) 잠에서 깼다.`); }   // 수면: 피해를 받으면 바로 깨어난다
      return { dmg, notes };
    }

    popHero(text, color) {
      const L = this.view.layout(this.game.stage.W, this.game.stage.H);
      this.view.pop(L.hero.x + (Math.random() * 80 - 40), L.hero.y - 40, text, color);
    }

    healPlayer(v) {
      const st = this.stats, p = this.player;
      const real = Math.min(st.hp - p.hp, Math.max(0, Math.round(v)));
      p.hp += real;
      if (real > 0) this.popHero('+' + real, '#9be8a8');
      return real;
    }

    // ---------- 주인공 행동 ----------
    async playerAct(a) {
      const p = this.player, st = this.stats;
      const pick = i => { const e = this.enemies[i]; return e && e.hp > 0 ? e : this.alive()[0]; };
      switch (a.kind) {
        case 'sleep': {
          p.asleep--;
          await this.say(p.asleep > 0 ? '깊이 잠들어 있다…' : '…눈을 떴다!', 700);
          return;
        }
        case 'none': return;
        case 'guard': {
          p.guard = true;
          await this.say('몸을 웅크려 방어한다.', 500);
          return;
        }
        case 'attack': {
          const e = pick(a.target);
          p.lunge = 0.3;
          const kind = st.mag * 0.75 > st.atk ? 'mag' : 'phys';
          const pow = kind === 'mag' ? this.atkPower('mag') * 0.75 : this.atkPower('phys');
          const raw = this.dmgFormula(pow, e.def * (kind === 'mag' ? 0.6 : 1));
          R.Audio && R.Audio.se('swing');
          const r = await this.hitEnemy(e, raw, { el: this.weaponEl || st.flags.el, kind });
          if (st.drain) this.healPlayer(r.dmg * st.drain);
          await this.say(`${this.name}의 공격! ${e.name}에게 ${r.dmg}의 피해. ${r.notes.join(' ')}${e.hp <= 0 ? ` ${e.name}을(를) 쓰러뜨렸다!` : ''}`, 750);
          return;
        }
        case 'release': {
          const rc = R.GAUGE.releaseCost;
          if (this.rp.gauge < rc) { await this.say('변신 게이지가 모자라다…', 600); return; }
          this.rp.gauge -= rc;
          const e = pick(a.target), job = R.job(this.run);
          const fx = this.game.stage.fx, L = this.view.layout(this.game.stage.W, this.game.stage.H);
          fx.flash(job.colorLight, 0.7, 0.85, 0.25);
          fx.shake(4, 0.5);
          fx.burst(L.enemyX(e.idx), L.floor - 50, { shapes: [job.awakening.particle, 'sparkle'], colors: job.awakening.colors, count: 30, speed: 90, lift: 10, gravity: 10, life: 1.2 });
          p.lunge = 0.3;
          const raw = Math.round(Math.max(st.atk, st.mag) * 3.0 * rand(0.95, 1.05) * (p.weak > 0 ? 1 - R.STATUS.weak.amount : 1));
          const r = await this.hitEnemy(e, raw, { noCrit: true });
          await this.say(`해방 — 「${R.RELEASE[job.id] || '해방의 일격'}」! ${e.name}에게 ${r.dmg}의 피해! (변신 게이지 -${rc})${e.hp <= 0 ? ` ${e.name}을(를) 쓰러뜨렸다!` : ''}`, 1100);
          return;
        }
        case 'item': return this.useItemBattle(a.id, a.target);
        case 'ability': return this.useAbility(a.ab, a.target);
      }
    }

    // ---------- 아이템 (2부: effects 로 일반화) ----------
    /** 지금 써서 효과가 있는가 (없으면 소모하지 않고 막는다) */
    itemUseful(it) {
      const p = this.player, st = this.stats, fx = R.itemEffects(it), has = this.playerStatuses();
      return fx.some(e =>
        (e.type === 'heal' && ((e.hp && p.hp < st.hp) || (e.mp && p.mp < st.mp))) ||
        (e.type === 'cure' && (e.list ? e.list.some(k => has.includes(k)) : has.length > 0)) ||
        (e.type === 'gauge' && this.rp.gauge > 0 && this.rp.gauge < R.GAUGE.max) ||
        ['buff', 'weaponEl', 'inflict', 'damage', 'permStat', 'goldBoost', 'escape'].includes(e.type));
    }
    async useItemBattle(id, targetIdx) {
      const it = R.ITEMS[id], p = this.player, st = this.stats, fx = R.itemEffects(it);
      if (!it || R.count(this.run, id) <= 0) return;
      if (it.perBattle && (this.itemUses[id] || 0) >= it.perBattle) { await this.say(`이 전투에서는 더 쓸 수 없다. (전투당 ${it.perBattle}회)`, 650); return; }
      if (fx.some(e => e.type === 'gauge') && this.rp.gauge <= 0) { await this.say('변신 게이지가 바닥나 쓸 수 없다. (잠을 자야 한다)', 700); return; }
      if (!this.itemUseful(it)) { await this.say('지금은 쓸 필요가 없습니다.', 600); return; }
      const pick = i => { const e = this.enemies[i]; return e && e.hp > 0 ? e : this.alive()[0]; };
      R.take(this.run, id);
      this.itemUses[id] = (this.itemUses[id] || 0) + 1;
      const lines = [`${it.n}!`];
      for (const e of fx) {
        if (e.type === 'heal') {
          if (e.hp) { const v = this.healPlayer(e.hp); if (v) lines.push(`체력 ${v} 회복.`); }
          if (e.mp) { const v = Math.min(e.mp, st.mp - p.mp); p.mp += v; if (v) lines.push(`마나 ${v} 회복.`); }
          R.Audio && R.Audio.se('buff', { vol: 0.6 });
        } else if (e.type === 'cure') {
          const has = this.playerStatuses();
          let targets = e.list ? e.list.filter(k => has.includes(k)) : e.pick === 'random' ? (has.length ? [has[Math.floor(Math.random() * has.length)]] : []) : has;
          targets.forEach(k => this.clearStatus(k));
          if (targets.length) lines.push(`${targets.map(k => R.STATUS_LABEL[k]).join(' · ')}이(가) 풀렸다.`);
        } else if (e.type === 'buff') {
          if (e.buff === 'shield') {
            p.shield = Math.max(p.shield, Math.round(st.hp * e.amount)); p.shieldTurns = e.turns;
            lines.push(`보호막 ${p.shield}.`);
          } else {
            // 같은 버프는 겹치지 않고 남은 턴만 새로 (더 센 쪽 수치 유지)
            const cur = p.buffs[e.buff];
            p.buffs[e.buff] = { amount: Math.max(cur ? cur.amount : 0, e.amount), turns: e.turns + 1 };
            lines.push({ atkUp: '공격 · 마력 상승!', defUp: '방어 상승!', haste: '속도 상승!' }[e.buff] || '');
          }
          R.Audio && R.Audio.se('buff', { vol: 0.7 });
        } else if (e.type === 'weaponEl') {
          this.weaponEl = e.el;
          lines.push(`이번 전투 동안 일반 공격에 ${EL_LABEL[e.el] || e.el} 속성이 붙는다.`);
          R.Audio && R.Audio.hitFor(e.el, 'mag');
        } else if (e.type === 'damage') {
          const t = pick(targetIdx);
          if (!t) continue;
          const r = await this.hitEnemy(t, Math.round(e.dmg * rand(0.95, 1.05)), { el: e.el, noCrit: true });
          lines.push(`${t.name}에게 ${r.dmg}의 ${EL_LABEL[e.el] || ''} 피해. ${r.notes.join(' ')}${t.hp <= 0 ? ` ${t.name}을(를) 쓰러뜨렸다!` : ''}`);
        } else if (e.type === 'inflict') {
          const targets = e.all ? this.alive() : [pick(targetIdx)].filter(Boolean);
          for (const t of targets) { const m = this.inflict(t, e.status, e.chance, e.turns, null); if (m) lines.push(m); }
          R.Audio && R.Audio.se('magic', { vol: 0.7 });
        } else if (e.type === 'goldBoost') {
          this.goldMul = Math.max(this.goldMul, e.mul);
          lines.push(`이번 전투에서 얻는 골드가 ${e.mul}배가 된다.`);
        } else if (e.type === 'permStat') {
          this.rp.hp = p.hp; this.rp.mp = p.mp;
          R.addGem(this.run, e.stat, e.amount);
          p.hp = this.rp.hp; p.mp = this.rp.mp;
          lines.push(`${WS.STAT_LABELS[e.stat]} +${e.amount} (영구)`);
        } else if (e.type === 'gauge') {
          const v = Math.min(e.amount, R.GAUGE.max - this.rp.gauge); this.rp.gauge += v; lines.push(`변신 게이지 ${v} 회복.`);
        } else if (e.type === 'escape') {
          lines.push('연막탄을 터뜨렸다! 연기 속으로 몸을 숨긴다…');
          this.fled = true;
        }
      }
      this.refresh();
      await this.say(lines.filter(Boolean).join(' '), 650 + lines.length * 120);
    }

    async useAbility(ab, targetIdx) {
      const p = this.player, st = this.stats;
      if (p.silence > 0) { await this.say('침묵 상태라 능력을 쓸 수 없다…', 600); return; }
      if (p.mp < ab.cost) { await this.say('마나가 모자라다…', 600); return; }
      p.mp -= ab.cost;
      this.cool[ab.id] = ab.cooldown || 0;
      const job = R.job(this.run), fx = this.game.stage.fx, L = this.view.layout(this.game.stage.W, this.game.stage.H);
      const effects = ab.effects || [];
      const eff = k => effects.find(x => x.kind === k);
      const lines = [`「${ab.name}」!`];
      fx.burst(L.hero.x, L.hero.y - 50, { shapes: [job.awakening.particle, 'sparkle'], colors: job.awakening.colors, count: 14, speed: 50, lift: 8, gravity: 10, life: 0.9 });
      const kind = ab.dmg || (st.atk > st.mag ? 'phys' : 'mag');

      if (ab.type === 'attack' || ab.type === 'control') {
        const targets = ab.target === 'enemy' ? [this.enemies[targetIdx] && this.enemies[targetIdx].hp > 0 ? this.enemies[targetIdx] : this.alive()[0]] : this.alive();
        const hits = eff('multiHit') ? eff('multiHit').hits : 1;
        p.lunge = 0.3;
        let total = 0;
        for (const e of targets) {
          if (!e || e.hp <= 0) continue;
          fx.ring(L.enemyX(e.idx), L.floor - 40, job.colorLight, 50, 0.4);
          let sum = 0, notes = new Set();
          for (let h = 0; h < hits && e.hp > 0; h++) {
            const raw = this.dmgFormula(this.atkPower(kind) * (ab.power || 1), e.def * (kind === 'mag' ? 0.6 : 1));
            const r = await this.hitEnemy(e, raw, { el: ab.el, kind, all: ab.target !== 'enemy' });
            sum += r.dmg; r.notes.forEach(n => notes.add(n));
            if (hits > 1) await WS.sleep(160);
          }
          total += sum;
          let extra = '';
          // 상태 부여: 마수 저항 · 약점 보너스 (2부 R.RESIST)
          const fz = eff('freeze');
          if (fz && e.hp > 0 && Math.random() < this.chanceFor(e, fz.chance, 'freeze', ab.el)) { e.frozen = fz.turns || 1; extra += ' 얼어붙었다!'; }
          const sl = eff('slow');
          if (sl && e.hp > 0 && Math.random() < this.chanceFor(e, 1, 'slow', ab.el)) { e.slow = sl.turns || 2; extra += ' 둔해졌다.'; }
          const dl = eff('delayEnemy');
          if (dl && e.hp > 0) { e.delay = Math.max(e.delay, dl.amount || 1); extra += ' 행동이 늦춰졌다.'; }
          lines.push(`${e.name}에게 ${sum}의 피해.${[...notes].join(' ') ? ' ' + [...notes].join(' ') : ''}${extra}${e.hp <= 0 ? ` ${e.name}을(를) 쓰러뜨렸다!` : ''}`);
        }
        const dr = eff('drain');
        if (dr && total > 0) { const v = this.healPlayer(total * dr.ratio); lines.push(`체력 ${v} 흡수.`); }
        const hp = eff('healPct');
        if (hp) { const v = this.healPlayer(st.hp * hp.amount); lines.push(`체력 ${v} 회복.`); }
      }
      if (ab.type === 'heal' || ab.type === 'buff') R.Audio && R.Audio.se('buff');
      if (ab.type === 'heal') {
        const v = this.healPlayer(st.mag * (ab.power || 1) * 1.125 + 68 + st.hp * 0.06);   // 마력 계수 2 → 1.125 (마력 ×8 · 체력 ×4.5 이라 회복 비율을 옛날과 맞춤), 고정 15 → 68 (×4.5)
        lines.push(`체력 ${v} 회복.`);
        fx.ring(L.hero.x, L.hero.y - 40, job.colorLight, 60, 0.6);
      }
      // 강화 · 보호 효과 (공격 · 회복 능력에 붙은 것 포함)
      for (const ef of effects) {
        if (ef.kind === 'shield') { p.shield = Math.round(st.hp * ef.amount); p.shieldTurns = ef.turns || 2; lines.push(`보호막 ${p.shield}.`); }
        if (ef.kind === 'atkUp') { p.buffs.atkUp = { amount: ef.amount, turns: ef.turns + 1 }; lines.push('공격 · 마력 상승!'); }
        if (ef.kind === 'defUp') { p.buffs.defUp = { amount: ef.amount, turns: ef.turns + 1 }; lines.push('방어 상승!'); }
        if (ef.kind === 'haste') { p.buffs.haste = { amount: ef.amount, turns: ef.turns + 1 }; lines.push('속도 상승!'); }
        if (ef.kind === 'cleanse') { p.poison = 0; p.slow = 0; p.asleep = 0; p.burn = 0; p.weak = 0; p.silence = 0; lines.push('상태 이상이 씻겨 나갔다.'); }
        if (ef.kind === 'delayEnemy' && ab.type === 'buff') { for (const e of this.alive()) e.delay = Math.max(e.delay, ef.amount || 1); lines.push('마물들의 시간이 멈췄다!'); }
      }
      this.refresh();
      await this.say(lines.join(' '), 1000 + lines.length * 120);
    }

    // ---------- 마물 행동 ----------
    async enemyAct(e) {
      const p = this.player, st = this.stats;
      if (e.frozen > 0) { e.frozen--; await this.say(`${e.name}은(는) 얼어붙어 움직이지 못한다.`, 550); return; }
      if (e.delay > 0) { e.delay--; await this.say(`${e.name}은(는) 박자를 놓쳤다.`, 500); return; }
      if (e.sleep > 0) { e.sleep--; await this.say(e.sleep > 0 ? `${e.name}은(는) 깊이 잠들어 있다.` : `${e.name}은(는) 잠에서 깼다.`, 550); return; }
      const sks = e.silence > 0 ? [] : (e.mon.sk || []);      // 침묵: 기술 없이 일반 공격만
      let sk = null;
      if (sks.length && Math.random() < (e.boss ? 0.5 : 0.35)) {
        sk = R.MSK[sks[Math.floor(Math.random() * sks.length)]];
        if (sk.type === 'heal' && e.hp > e.maxhp * 0.6) sk = null;
        if (sk && sk.type === 'buff' && e.buff >= 2) sk = null;
      }
      e.lunge = 0.3;
      if (!sk) return this.enemyHit(e, { type: 'phys', pow: 1 }, `${e.name}의 공격!`);
      switch (sk.type) {
        case 'phys': case 'mag': return this.enemyHit(e, sk, `${e.name}의 「${sk.n}」!`);
        case 'heal': {
          const v = Math.round(e.maxhp * sk.pow);
          e.hp = Math.min(e.maxhp, e.hp + v);
          const L = this.view.layout(this.game.stage.W, this.game.stage.H);
          this.view.pop(L.enemyX(e.idx), L.floor - 80, '+' + v, '#9be8a8');
          await this.say(`${e.name}은(는) 「${sk.n}」으로 체력을 ${v} 회복했다.`, 750); return;
        }
        case 'buff': {
          e.buff++; e.atk = Math.round(e.atk * 1.2); e.mag = Math.round(e.mag * 1.2);
          await this.say(`${e.name}의 「${sk.n}」! 공격력이 올랐다.`, 750); return;
        }
        case 'flee': {
          if (Math.random() < 0.5) { e.hp = 0; e.fade = 1; e.fled = true; await this.say(`${e.name}은(는) 도망쳤다!`, 750); return; }
          return this.enemyHit(e, { type: 'phys', pow: 0.6 }, `${e.name}이(가) 몸을 부딪쳐 왔다!`);
        }
        case 'status': {
          if (sk.sleep) {
            if (Math.random() < sk.sleep && !p.asleep) { p.asleep = 2; await this.say(`${e.name}의 「${sk.n}」! 잠이 쏟아진다…`, 850); }
            else await this.say(`${e.name}의 「${sk.n}」! 하지만 버텨 냈다.`, 700);
            return;
          }
          if (sk.slow) { p.slow = 3; await this.say(`${e.name}의 「${sk.n}」! 움직임이 둔해졌다.`, 750); return; }
          if (sk.silence) {
            if (Math.random() < sk.silence && !(p.silence > 0)) { p.silence = R.STATUS.silence.turns; await this.say(`${e.name}의 「${sk.n}」! 목소리가 나오지 않는다… (침묵)`, 850); }
            else await this.say(`${e.name}의 「${sk.n}」! 하지만 버텨 냈다.`, 700);
            return;
          }
        }
      }
    }

    async enemyHit(e, sk, prefix) {
      const p = this.player, st = this.stats;
      const hits = sk.hits || 1;
      let total = 0;
      for (let h = 0; h < hits; h++) {
        // 회피 (속도 차이). 변신이 풀린 몸으로는 피할 수 없다
        const evade = this.form === 'job' ? clamp((st.spd - e.spd) * 0.6 + 3, 2, 20) : 0;
        if (sk.type === 'phys' && Math.random() * 100 < evade) { R.Audio && R.Audio.se('swing', { vol: 0.6 }); this.popHero('MISS', '#d8c8d8'); continue; }
        const a = (sk.type === 'mag' ? e.mag : e.atk) * (sk.pow || 1) * (e.weak > 0 ? 1 - R.STATUS.weak.amount : 1);   // 약화
        let d = st.def * (sk.type === 'mag' ? 0.75 : 1) * (p.buffs.defUp ? 1 + p.buffs.defUp.amount : 1);
        let dmg = this.dmgFormula(a, d);
        if (p.guard) dmg = Math.round(dmg * 0.5);
        // 변신이 풀린 몸: 마물의 공격 한 번이면 쓰러진다
        if (this.form !== 'job') dmg = Math.max(dmg, p.hp + p.shield);
        if (p.shield > 0) { const ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; }
        p.hp = Math.max(0, p.hp - dmg);
        total += dmg;
        if (R.Audio) { if (p.guard) R.Audio.se('block'); else if (sk.el) R.Audio.hitFor(sk.el, sk.type); else R.Audio.se('hit', { rate: 0.85 }); }
        p.shake = 0.3;
        this.game.stage.fx.shake(dmg > st.hp * 0.15 ? 3 : 1.5, 0.22);
        this.popHero(dmg, '#ff8a96');
        if (p.asleep > 0 && Math.random() < 0.5) p.asleep = 0;
        if (hits > 1) await WS.sleep(160);
      }
      let tail = '';
      if (sk.drain && total) { const v = Math.round(total * sk.drain); e.hp = Math.min(e.maxhp, e.hp + v); tail += ` ${e.name}은(는) 체력을 빨아들였다.`; }
      if (sk.poison && total && Math.random() < sk.poison && !st.flags.poisonImmune) { p.poison = 4; tail += ' 독에 걸렸다!'; }
      if (sk.burn && total && p.hp > 0 && Math.random() < sk.burn) { p.burn = R.STATUS.burn.turns; tail += ' 화상을 입었다!'; }
      if (sk.weak && total && p.hp > 0 && Math.random() < sk.weak) { p.weak = R.STATUS.weak.turns; tail += ' 힘이 빠진다… (약화)'; }
      if (total > st.hp * 0.2) this.game.stage.fx.shake(2, 0.25);
      await this.say(`${prefix} ${total ? `${this.name}에게 ${total}의 피해.` : '하지만 빗나갔다!'}${sk.el ? ` (${EL_LABEL[sk.el]})` : ''}${tail}`, 800);
    }

    async tryFlee(sure) {
      if (this.boss) { await this.say('보스에게서는 도망칠 수 없다!', 700); return false; }
      const st = this.stats;
      const avg = this.alive().reduce((s, e) => s + e.spd, 0) / Math.max(1, this.alive().length);
      const chance = sure ? 1 : clamp(0.5 + (st.spd - avg) * 0.025, 0.25, 0.9);
      if (Math.random() < chance) { await this.say('무사히 도망쳤다!', 700); return true; }
      await this.say('도망치지 못했다!', 600);
      return false;
    }

    get name() { return R.HERO_NAME || '클레어'; }

    // ---------- 표시 ----------
    say(text, ms = 700) {
      this.logEl.textContent = text;
      if (!ms) return Promise.resolve();
      return new Promise(res => {
        let done = false;
        const fin = () => { if (done) return; done = true; document.removeEventListener('pointerdown', skip, true); res(); };
        const skip = e => { if (e.target.closest && e.target.closest('.rb-cmd, #hud')) return; fin(); };
        setTimeout(() => { if (!done) document.addEventListener('pointerdown', skip, true); }, 120);
        setTimeout(fin, ms * (R.battleSpeed || 1));
      });
    }

    refresh() {
      const d = this.dom, p = this.player, st = this.stats, run = this.run, job = R.job(run);
      d.style.setProperty('--job', job.color);
      d.querySelector('.rb-name').innerHTML = `${this.name} <small>Lv.${this.rp.lv} · ${this.form === 'job' ? job.name : '평상복 (변신 불가)'}</small>`;
      const img = d.querySelector('.rb-portrait img');
      const src = this.form === 'job' ? job.portrait : WS.CHARACTERS.hero.portrait;
      if (img.getAttribute('src') !== src) img.src = src;
      const bar = (cls, v, max, label) => {
        const el = d.querySelector('.rb-bar.' + cls);
        el.querySelector('em').style.width = (100 * clamp(v / max, 0, 1)) + '%';
        el.querySelector('b').textContent = label || `${v}/${max}`;
      };
      bar('hp', p.hp, st.hp, `${p.hp}/${st.hp}${p.shield ? ` (+${p.shield})` : ''}`);
      bar('mp', p.mp, st.mp);
      bar('gauge', this.rp.gauge, R.GAUGE.max);
      const tags = [];
      if (p.poison) tags.push('<span class="tag poison">독</span>');
      if (p.asleep) tags.push('<span class="tag">수면</span>');
      if (p.slow) tags.push('<span class="tag">둔화</span>');
      if (p.burn) tags.push('<span class="tag burn">화상</span>');
      if (p.weak) tags.push('<span class="tag weak">약화</span>');
      if (p.silence) tags.push('<span class="tag silence">침묵</span>');
      if (this.weaponEl) tags.push(`<span class="tag el-${this.weaponEl}">${EL_LABEL[this.weaponEl] || this.weaponEl} 속성</span>`);
      if (this.goldMul > 1) tags.push(`<span class="tag buff">골드 ×${this.goldMul}</span>`);
      if (p.guard) tags.push('<span class="tag">방어</span>');
      for (const k in p.buffs) tags.push(`<span class="tag buff">${{ atkUp: '공격↑', defUp: '방어↑', haste: '속도↑' }[k] || k}</span>`);
      if (this.form !== 'job') tags.push('<span class="tag human">변신 해제 · 위험</span>');
      d.querySelector('.rb-status').innerHTML = tags.join('');
    }

    // ---------- 끝 ----------
    async finish(result) {
      const rp = this.rp, run = this.run, p = this.player;
      this.clearCmd();
      rp.hp = Math.max(result === 'lose' ? 0 : 1, p.hp);
      rp.mp = p.mp;
      rp.poison = p.poison || 0;
      const lines = [];
      let title = '';
      if (result === 'win') {
        title = '승리';
        R.Audio && R.Audio.jingle('me_victory');
        const st = this.stats;
        let exp = 0, gold = 0;
        const drops = {};
        for (const e of this.enemies) {
          if (e.fled) continue;
          exp += e.exp; gold += e.gold;
          for (const [id, ch] of e.mon.drop || []) if (Math.random() < ch * (1 + st.drop)) drops[id] = (drops[id] || 0) + 1;
        }
        gold = Math.round(gold * (1 + st.gold) * (this.goldMul || 1));   // 행운의 동전
        rp.gold += gold;
        for (const id in drops) R.give(run, id, drops[id]);
        lines.push(`<p>경험치 <b>+${exp}</b> · 골드 <b>+${gold}</b></p>`);
        if (Object.keys(drops).length) lines.push(`<p class="rb-drops">${Object.keys(drops).map(id => `${R.icon(R.ITEMS[id].icon, 24)} ${R.ITEMS[id].n} ×${drops[id]}`).join('<br>')}</p>`);
        const ups = R.gainExp(run, exp);
        for (const u of ups) {
          lines.push(`<p class="rb-lvup">레벨 업! <b>Lv.${u.lv}</b> — 능력치 포인트 +${R.POINTS_PER_LEVEL}</p>`);
          for (const n of u.learned) lines.push(`<p class="rb-learn">새 능력 「${n}」을(를) 깨달았다!</p>`);
        }
        if (ups.length) { rp.hp = R.stats(run).hp; rp.mp = R.stats(run).mp; lines.push('<p class="muted">레벨 업으로 체력 · 마나가 모두 회복되었다.</p>'); }
        await this.say('전투에서 승리했다!', 600);
      } else if (result === 'flee') {
        title = '도주';
        lines.push('<p>무사히 빠져나왔다.</p>');
      } else {
        title = '패배';
        const lost = Math.min(rp.gauge, R.GAUGE.defeatCost);
        rp.gauge = Math.max(0, rp.gauge - R.GAUGE.defeatCost);
        rp.defeats++;
        const goldLost = Math.floor(rp.gold * 0.1);
        rp.gold -= goldLost;
        lines.push(`<p>눈앞이 하얘졌다…</p><p>${lost ? `변신 게이지 <b>-${lost}</b> · ` : ''}골드 <b>-${goldLost}</b></p>`);
        if (rp.gauge <= 0) lines.push('<p class="rb-warn">변신 게이지가 바닥났다. 정신을 잃은 채 잠자리로 옮겨져 하루가 지나간다.</p>');
        else lines.push('<p class="muted">마지막으로 잠든 곳에서 정신을 차린다.</p>');
        await this.say('쓰러지고 말았다…', 900);
      }
      R.sync(run);
      // 결과 창
      const res = this.dom.querySelector('.rb-result');
      res.querySelector('h2').textContent = title;
      res.querySelector('.rb-result-body').innerHTML = lines.join('');
      res.classList.add('show');
      await new Promise(r => {
        const ok = res.querySelector('.rb-result-ok');
        ok.disabled = true; setTimeout(() => (ok.disabled = false), 350);
        ok.onclick = e => { e.stopPropagation(); ok.onclick = null; r(); };
      });
      res.classList.remove('show');
      this.dom.classList.remove('show');
      R.UI.showHud(true);
      this.game.ui.popModal();
      this.game.stage.setView(this.prevView);
      return result;
    }
  }

  // 캔버스를 눌러 대상 고르기
  document.addEventListener('pointerdown', e => {
    const b = R.Battle.current;
    if (!b || !b.onCanvasPick || e.target.id !== 'stage') return;
    const st = WS.game.stage, rect = st.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / st.scale, y = (e.clientY - rect.top) / st.scale;
    const i = b.view.enemyAt(x, y);
    if (i >= 0) b.onCanvasPick(i);
  }, true);

  R.Battle = {
    current: null,
    async run(game, enc) {
      const b = new Battle(game, enc);
      R.Battle.current = b;
      R.Audio && R.Audio.battle(!!(enc && enc.boss));
      try { return await b.start(); }
      finally {
        R.Battle.current = null;
        // 전투가 끝나면 지역 음악으로 (패배 · 멸망 연출은 각 장면이 정한다)
        if (R.Audio && game.scenes.current === 'world' && game.state.rpg) R.Audio.forMap(game.state.rpg.map);
      }
    },
  };
})();
