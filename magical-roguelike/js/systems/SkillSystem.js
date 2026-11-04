// Player-activated skills. Each skill changes real combat state (damage, heal, shields, stuns...).
// Skill values always come from SkillSystem.effective(unit) = base skill + owned skill mods.
(function () {
  const MG = (window.MG = window.MG || {});
  const C = () => MG.CombatSystem;
  const SKILL_DELAY = 0.22; // effect lands mid-animation
  const PCT_KEY = /(Pct|pct|mult|Mult)$/;

  const SkillSystem = {
    /** Base skill patched with the unit's mods (cached per mod list). */
    effective(u) {
      const key = (u.mods || []).join(',');
      if (u._effKey === key && u._eff) return u._eff;
      const sk = Object.assign({}, u.def.skill);
      if (u.def.entry) sk.entryMult = u.def.entry.mult;
      for (const id of u.mods || []) {
        const m = MG.SKILL_MOD_INDEX[id];
        if (m) Object.assign(sk, m.patch);
      }
      u._effKey = key;
      u._eff = sk;
      return sk;
    },

    /** Fill {placeholders} in a description with (effective) values; ratios shown as %. */
    format(desc, values) {
      return desc.replace(/\{(\w+)\}/g, (_, k) => {
        const v = values[k];
        if (v == null) return '?';
        return PCT_KEY.test(k) ? Math.round(v * 100) : v;
      });
    },
    describe(u) {
      const sk = this.effective(u);
      return this.format(sk.desc, sk);
    },
    describeEntry(u) {
      if (!u.def.entry) return '';
      return this.format(u.def.entry.desc, { mult: this.effective(u).entryMult });
    },

    /** Returns {ok, reason}. */
    canCast(battle, u) {
      if (!battle || battle.phase !== 'combat') return { ok: false, reason: '전투 중에만 사용 가능' };
      if (u.hp <= 0) return { ok: false, reason: '전투 불능' };
      const key = battle.party.keyOf(u.id);
      if (!key) return { ok: false, reason: '배치되지 않은 아군' };
      if ((u.skillCd || 0) > 0) return { ok: false, reason: `대기 ${u.skillCd.toFixed(1)}초` };
      const sk = this.effective(u);
      const lane = MG.FormationSystem.parseKey(key).lane;
      const anyEnemy = battle.enemies.some((e) => !e.dead);
      const laneEnemy = C().laneEnemies(battle, lane).length > 0;
      if (['aoe', 'multi'].includes(sk.type) && !anyEnemy) return { ok: false, reason: '대상 없음' };
      if (['single', 'tag', 'freeze', 'void'].includes(sk.type) && !laneEnemy) return { ok: false, reason: '대상 없음' };
      return { ok: true, lane };
    },

    cast(battle, u) {
      const chk = this.canCast(battle, u);
      if (!chk.ok) return chk;
      const sk = this.effective(u);
      const lane = chk.lane;
      u.skillCd = sk.cooldown;
      u.b.pending = null;
      u.b.anim = { name: sk.anim, t: 0 };
      battle.float(u.b.x, u.b.y - 140, sk.name, u.def.color, 1.3);
      battle.stats.skills++;
      battle.schedule(SKILL_DELAY, () => this.apply(battle, u, sk, lane, 1));
      if (sk.repeat) battle.schedule(SKILL_DELAY + sk.repeat.delay, () => this.apply(battle, u, sk, lane, sk.repeat.mult));
      battle.emitRelic('skillCast', { unit: u, skill: sk, lane });
      return { ok: true };
    },

    /** power: 1 for the normal cast, <1 for echoes (쌍성, 거울 프리즘). */
    apply(battle, u, sk, lane, power) {
      const pw = (power || 1) * MG.RelicSystem.skillPowerMult(battle);
      const atk = C().stat(u, 'atk', battle);
      const P = battle.party;
      const hit = (e, m) => C().dealToEnemy(battle, u, e, atk * m * pw, { kind: 'skill' });
      const laneE = () => C().laneEnemies(battle, lane);
      const healShield = () => {
        if (!sk.healShieldPct) return;
        for (const a of P.fieldUnits()) C().addShield(a, a.maxHp * sk.healShieldPct * pw, sk.healShieldDur, battle, true);
      };
      switch (sk.type) {
        case 'heal':
          for (const a of P.fieldUnits()) C().heal(a, a.maxHp * sk.healPct * pw, battle);
          healShield();
          battle.vfx.push({ type: 'ring', x: u.b.x, y: u.b.y - 40, t: 0, dur: 0.6, color: '#8ff0a0', r: 160 });
          break;
        case 'aoe':
          for (const e of battle.enemies.filter((x) => !x.dead)) {
            hit(e, e.lane === lane ? sk.mult : sk.otherLaneMult);
            battle.vfx.push({ type: 'star', x: e.x, y: e.y - e.h / 2, t: 0, dur: 0.5, color: u.def.color });
          }
          break;
        case 'shield': {
          const lanes = sk.bothLanes ? [0, 1] : [lane];
          for (const l of lanes) {
            for (const a of P.laneUnits(l)) C().addShield(a, a.maxHp * sk.shieldPct * pw, sk.shieldDur, battle);
            for (const e of C().laneEnemies(battle, l)) {
              e.slowUntil = battle.time + sk.slowDur;
              e.slowPct = sk.slowPct;
            }
          }
          battle.vfx.push({ type: 'ring', x: u.b.x + 60, y: u.b.y - 40, t: 0, dur: 0.6, color: '#9fd8ff', r: 220 });
          break;
        }
        case 'single': {
          const list = laneE();
          if (!list.length) break;
          const t = list.reduce((a, b) => (b.hp > a.hp ? b : a));
          hit(t, sk.mult);
          battle.vfx.push({ type: 'impact', charId: u.def.id, x: t.x, y: t.y + 20, t: 0, dur: 0.35, scale: 1.4 });
          break;
        }
        case 'defense':
          for (const e of laneE()) e.stunUntil = battle.time + sk.stunDur;
          if (sk.bonusLaneMult) for (const e of laneE()) hit(e, sk.bonusLaneMult);
          C().addShield(u, u.maxHp * sk.shieldPct * pw, sk.buffDur, battle);
          C().addBuff(u, { id: 'holy_bell', stat: 'def', pct: sk.defPct, dur: sk.buffDur }, battle);
          battle.vfx.push({ type: 'ring', x: u.b.x + 80, y: u.b.y - 40, t: 0, dur: 0.7, color: '#f2c14e', r: 260 });
          break;
        case 'tag':
          for (const e of laneE()) hit(e, sk.mult);
          if (power === 1 || power == null) {
            battle.tagWindow = battle.tagWindow.filter((t) => t.lane !== lane);
            battle.tagWindow.push({ lane, until: battle.time + sk.window, atkPct: sk.tagAtkPct, dur: sk.tagDur });
            battle.float(u.b.x, u.b.y - 160, '연계 교대 준비!', '#7fd8ff');
          }
          battle.vfx.push({ type: 'ring', x: u.b.x + 60, y: u.b.y - 40, t: 0, dur: 0.5, color: '#4f86d9', r: 200 });
          break;
        case 'freeze':
          for (const e of laneE()) {
            hit(e, sk.mult);
            e.stunUntil = Math.max(e.stunUntil, battle.time + sk.freezeDur);
            e.frozen = true;
          }
          battle.vfx.push({ type: 'ring', x: u.b.x + 100, y: u.b.y - 40, t: 0, dur: 0.6, color: '#bfeaff', r: 300 });
          break;
        case 'void':
          for (const e of laneE()) hit(e, sk.mult);
          for (const e of laneE()) {
            if (!e.data.boss && e.hp > 0 && e.hp <= e.maxHp * sk.executePct) {
              battle.float(e.x, e.y - e.h - 20, '소멸', '#c58cff', 1.2);
              C().killEnemy(battle, e, u, 'skill');
            }
          }
          battle.vfx.push({ type: 'ring', x: 800, y: MG.FormationSystem.G.LANE_Y[lane] - 40, t: 0, dur: 0.7, color: '#a368ff', r: 340 });
          break;
        case 'regen':
          for (const a of P.fieldUnits()) a.b.regen = { pct: sk.regenPct * pw, until: battle.time + sk.regenDur, acc: 0 };
          healShield();
          battle.vfx.push({ type: 'ring', x: u.b.x, y: u.b.y - 40, t: 0, dur: 0.7, color: '#bff6ff', r: 200 });
          break;
        case 'sanctuary': {
          const lanes = sk.bothLanes ? [0, 1] : [lane];
          for (const l of lanes) {
            for (const a of P.laneUnits(l)) C().addBuff(a, { id: 'sanctuary', stat: 'taken', pct: sk.reducePct, dur: sk.sancDur }, battle);
            for (const e of C().laneEnemies(battle, l)) hit(e, sk.mult);
          }
          battle.vfx.push({ type: 'ring', x: u.b.x + 40, y: u.b.y - 40, t: 0, dur: 0.7, color: '#ffe08a', r: 240 });
          break;
        }
        case 'multi': {
          const pool = battle.enemies.filter((e) => !e.dead && e.x < MG.FormationSystem.G.SPAWN_X - 10);
          if (!pool.length) break;
          for (let i = 0; i < sk.hits; i++) {
            const t = pool[Math.floor(Math.random() * pool.length)];
            battle.projectiles.push({
              from: 'ally', owner: u, lane: t.lane, x: u.b.x + 30, y: u.b.y - 60 - i * 6, target: t, speed: 700 + i * 60,
              raw: atk * sk.mult * pw, charId: u.def.id, color: u.def.color, kind: 'skill',
            });
          }
          break;
        }
        default:
          break;
      }
    },

    /** Passive entry effects (e.g. 청련's 선풍 진입). */
    onSwapIn(battle, u, lane) {
      const entry = u.def.entry;
      if (!entry || battle.phase !== 'combat') return;
      const mult = this.effective(u).entryMult;
      const atk = C().stat(u, 'atk', battle);
      battle.schedule(SKILL_DELAY, () => {
        for (const e of C().laneEnemies(battle, lane)) C().dealToEnemy(battle, u, e, atk * mult, { kind: 'skill' });
        battle.float(u.b.x, u.b.y - 150, entry.name, u.def.color, 1.2);
      });
    },
  };

  MG.SkillSystem = SkillSystem;
})();
