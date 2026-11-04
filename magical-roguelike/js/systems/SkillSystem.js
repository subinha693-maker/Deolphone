// Player-activated skills. Each skill changes real combat state (damage, heal, shields, stuns...).
(function () {
  const MG = (window.MG = window.MG || {});
  const C = () => MG.CombatSystem;
  const SKILL_DELAY = 0.22; // effect lands mid-animation

  const SkillSystem = {
    /** Returns {ok, reason}. */
    canCast(battle, u) {
      if (!battle || battle.phase !== 'combat') return { ok: false, reason: '전투 중에만 사용 가능' };
      if (u.hp <= 0) return { ok: false, reason: '전투 불능' };
      const key = battle.party.keyOf(u.id);
      if (!key) return { ok: false, reason: '배치되지 않은 아군' };
      if ((u.skillCd || 0) > 0) return { ok: false, reason: `대기 ${u.skillCd.toFixed(1)}초` };
      const sk = u.def.skill;
      const lane = MG.FormationSystem.parseKey(key).lane;
      const needsTarget = ['aoe', 'single', 'tag'].includes(sk.type);
      if (needsTarget) {
        const any = sk.type === 'aoe' ? battle.enemies.some((e) => !e.dead) : C().laneEnemies(battle, lane).length > 0;
        if (!any) return { ok: false, reason: '대상 없음' };
      }
      return { ok: true, lane };
    },

    cast(battle, u) {
      const chk = this.canCast(battle, u);
      if (!chk.ok) return chk;
      const sk = u.def.skill;
      const lane = chk.lane;
      u.skillCd = sk.cooldown;
      u.b.pending = null;
      u.b.anim = { name: sk.anim, t: 0 };
      battle.float(u.b.x, u.b.y - 140, sk.name, u.def.color, 1.3);
      battle.stats.skills++;
      battle.schedule(SKILL_DELAY, () => this.apply(battle, u, sk, lane));
      battle.emitRelic('skillCast', { unit: u });
      return { ok: true };
    },

    apply(battle, u, sk, lane) {
      const power = MG.RelicSystem.skillPowerMult(battle);
      const atk = C().stat(u, 'atk', battle);
      const P = battle.party;
      switch (sk.type) {
        case 'heal':
          for (const a of P.fieldUnits()) C().heal(a, a.maxHp * sk.healPct * power, battle);
          battle.vfx.push({ type: 'ring', x: u.b.x, y: u.b.y - 40, t: 0, dur: 0.6, color: '#8ff0a0', r: 160 });
          break;
        case 'aoe':
          for (const e of battle.enemies.filter((x) => !x.dead)) {
            const m = e.lane === lane ? sk.mult : sk.otherLaneMult;
            C().dealToEnemy(battle, u, e, atk * m * power, { kind: 'skill' });
            battle.vfx.push({ type: 'star', x: e.x, y: e.y - e.h / 2, t: 0, dur: 0.5, color: u.def.color });
          }
          break;
        case 'shield':
          for (const a of P.laneUnits(lane)) C().addShield(a, a.maxHp * sk.shieldPct * power, sk.shieldDur, battle);
          for (const e of C().laneEnemies(battle, lane)) {
            e.slowUntil = battle.time + sk.slowDur;
            e.slowPct = sk.slowPct;
          }
          battle.vfx.push({ type: 'ring', x: u.b.x + 60, y: u.b.y - 40, t: 0, dur: 0.6, color: '#9fd8ff', r: 220 });
          break;
        case 'single': {
          const list = C().laneEnemies(battle, lane);
          if (!list.length) break;
          const t = list.reduce((a, b) => (b.hp > a.hp ? b : a));
          C().dealToEnemy(battle, u, t, atk * sk.mult * power, { kind: 'skill' });
          battle.vfx.push({ type: 'impact', charId: u.def.id, x: t.x, y: t.y + 20, t: 0, dur: 0.35, scale: 1.4 });
          break;
        }
        case 'defense':
          for (const e of C().laneEnemies(battle, lane)) e.stunUntil = battle.time + sk.stunDur;
          C().addShield(u, u.maxHp * sk.shieldPct * power, sk.buffDur, battle);
          C().addBuff(u, { id: 'holy_bell', stat: 'def', pct: sk.defPct, dur: sk.buffDur }, battle);
          battle.vfx.push({ type: 'ring', x: u.b.x + 80, y: u.b.y - 40, t: 0, dur: 0.7, color: '#f2c14e', r: 260 });
          break;
        case 'tag':
          for (const e of C().laneEnemies(battle, lane)) C().dealToEnemy(battle, u, e, atk * sk.mult * power, { kind: 'skill' });
          battle.tagWindow = battle.tagWindow.filter((t) => t.lane !== lane);
          battle.tagWindow.push({ lane, until: battle.time + sk.window, atkPct: sk.tagAtkPct, dur: sk.tagDur });
          battle.float(u.b.x, u.b.y - 160, '연계 교대 준비!', '#7fd8ff');
          battle.vfx.push({ type: 'ring', x: u.b.x + 60, y: u.b.y - 40, t: 0, dur: 0.5, color: '#4f86d9', r: 200 });
          break;
        default:
          break;
      }
    },

    /** Passive entry effects (e.g. 청련's 선풍 진입). */
    onSwapIn(battle, u, lane) {
      const entry = u.def.entry;
      if (!entry || battle.phase !== 'combat') return;
      const atk = C().stat(u, 'atk', battle);
      battle.schedule(SKILL_DELAY, () => {
        for (const e of C().laneEnemies(battle, lane)) C().dealToEnemy(battle, u, e, atk * entry.mult, { kind: 'skill' });
        battle.float(u.b.x, u.b.y - 150, entry.name, u.def.color, 1.2);
      });
    },
  };

  MG.SkillSystem = SkillSystem;
})();
