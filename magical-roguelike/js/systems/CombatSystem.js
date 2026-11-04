// Automatic attacks, damage calculation, buffs, shields, projectiles and deaths.
// Damage is applied at an animation's hit time, never just because an animation finished.
(function () {
  const MG = (window.MG = window.MG || {});

  // Animation timing (seconds). hit = when damage / projectile release happens.
  const ANIM = {
    idle: { frames: [0], fps: 1, loop: true },
    walk: { frames: [0, 1, 2, 1], fps: 8, loop: true },
    melee: { frames: [0, 1, 2, 3], fps: 9, hit: 0.24, dur: 0.44 },
    proj: { frames: [0, 1, 1], fps: 8, hit: 0.2, dur: 0.36 },
    spin: { frames: [0, 1, 2, 3], fps: 9, dur: 0.44 },
    hurt: { frames: [0, 1], fps: 8, dur: 0.25 },
    ko: { frames: [0, 1, 2], fps: 6, dur: 99, hold: true },
  };

  const MELEE_RANGE = 200;
  const RANGED_RANGE = 950;
  const BACK_MELEE_PENALTY = 0.6;
  const KO_RETIRE_TIME = 1.2;

  const CombatSystem = {
    ANIM,

    resetUnitBattleState(u, battle, benched) {
      const keep = u.b || {};
      u.b = {
        atkTimer: Math.random() * 0.5,
        anim: { name: 'idle', t: 0 },
        pending: null,
        shield: 0,
        shieldUntil: 0,
        buffs: [],
        hurtFlash: 0,
        koT: 0,
        x: keep.x != null && !benched ? keep.x : MG.FormationSystem.G.BACK_X - 120,
        y: keep.y != null ? keep.y : 300,
      };
      const key = battle.party.keyOf(u.id);
      if (key) {
        const { lane, slot } = MG.FormationSystem.parseKey(key);
        const p = MG.FormationSystem.position(lane, slot);
        if (!benched) {
          u.b.x = p.x - 90; // slide in from behind
          u.b.y = p.y;
        }
      }
    },

    stat(u, stat, battle) {
      const base = u.def.stats;
      let pct = 0;
      for (const b of u.b ? u.b.buffs : []) if (b.stat === stat) pct += b.pct;
      pct += MG.RelicSystem.statPct(u, stat, battle);
      if (stat === 'atk') return base.atk * (1 + pct);
      if (stat === 'def') return base.def * (1 + pct);
      if (stat === 'atkSpeed') return 1 + pct;
      return 0;
    },

    addBuff(u, buff, battle) {
      u.b.buffs = u.b.buffs.filter((b) => b.id !== buff.id); // refresh, no stacking of same id
      u.b.buffs.push({ id: buff.id, stat: buff.stat, pct: buff.pct, until: battle.time + buff.dur });
    },

    addShield(u, amount, dur, battle) {
      u.b.shield = Math.max(u.b.shield, amount);
      u.b.shieldUntil = Math.max(u.b.shieldUntil, battle.time + dur);
      battle.float(u.b.x, u.b.y - 115, `보호막 ${Math.round(amount)}`, '#9fd8ff');
    },

    heal(u, amount, battle) {
      if (u.hp <= 0) return 0;
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + amount);
      const got = u.hp - before;
      if (got > 0.5 && u.b) battle.float(u.b.x, u.b.y - 100, '+' + Math.round(got), '#8ff0a0');
      return got;
    },

    /** Living enemies of a lane, nearest first. */
    laneEnemies(battle, lane) {
      return battle.enemies.filter((e) => !e.dead && e.lane === lane && e.x < MG.FormationSystem.G.SPAWN_X - 10).sort((a, b) => a.x - b.x);
    },

    targetFor(u, lane, battle) {
      const enemies = this.laneEnemies(battle, lane);
      if (!enemies.length) return null;
      const range = u.def.attackType === 'melee' ? MELEE_RANGE : RANGED_RANGE;
      const e = enemies[0];
      return e.x - u.b.x <= range ? e : null;
    },

    dealToEnemy(battle, src, e, raw, opts) {
      if (e.dead) return 0;
      const o = opts || {};
      const amp = e.markUntil > battle.time ? 1 + e.markAmp : 1;
      const dmg = Math.max(1, (raw * amp * 100) / (100 + e.armor));
      e.hp -= dmg;
      e.hitFlash = 0.12;
      const col = o.element === 'fire' ? '#ffa04f' : o.kind === 'skill' ? '#ffe27a' : '#ffffff';
      battle.float(e.x + (Math.random() * 20 - 10), e.y - e.h - 6, Math.round(dmg) + '', col, o.kind === 'skill' ? 1.25 : 1);
      battle.stats.damage += dmg;
      if (o.kind === 'basic') battle.emitRelic('basicHit', { attacker: src, enemy: e, dmg });
      if (o.kind === 'skill') battle.emitRelic('skillHit', { attacker: src, enemy: e, dmg });
      if (e.hp <= 0 && !e.dead) this.killEnemy(battle, e, src, o.kind);
      return dmg;
    },

    killEnemy(battle, e, killer, kind) {
      e.dead = true;
      e.hp = 0;
      e.deathT = 0;
      battle.stats.kills++;
      battle.emitRelic('kill', { killer, enemy: e, kind });
    },

    dealToAlly(battle, attacker, u, raw) {
      if (u.hp <= 0) return 0;
      const def = this.stat(u, 'def', battle) * (1 - (attacker && attacker.armorPierce ? attacker.armorPierce : 0));
      let dmg = Math.max(1, (raw * 100) / (100 + def));
      if (u.b.shield > 0) {
        const absorbed = Math.min(u.b.shield, dmg);
        u.b.shield -= absorbed;
        dmg -= absorbed;
      }
      u.hp -= dmg;
      u.b.hurtFlash = 0.15;
      if (dmg > 0) battle.float(u.b.x, u.b.y - 95, '-' + Math.round(dmg), '#ff6b8a');
      if (dmg > u.maxHp * 0.08 && !u.b.pending && u.hp > 0) u.b.anim = { name: 'hurt', t: 0 };
      battle.emitRelic('allyDamaged', { unit: u, attacker, dmg });
      if (u.hp <= 0) {
        u.hp = 0;
        u.b.anim = { name: 'ko', t: 0 };
        u.b.pending = null;
        u.b.koT = 0;
        battle.bus.emit('allyDown', { unit: u });
        battle.float(u.b.x, u.b.y - 130, '전투 불능', '#ff6b8a');
      }
      return dmg;
    },

    /** Called every frame while enemies may act. */
    updateAllies(battle, dt) {
      const party = battle.party;
      const fighting = battle.phase === 'combat';
      for (const key of MG.FormationSystem.allKeys()) {
        const id = party.slots[key];
        if (!id) continue;
        const u = party.get(id);
        const { lane, slot } = MG.FormationSystem.parseKey(key);
        const p = MG.FormationSystem.position(lane, slot);
        // glide to slot position (formation swaps, entry)
        u.b.x += (p.x - u.b.x) * Math.min(1, dt * 8);
        u.b.y += (p.y - u.b.y) * Math.min(1, dt * 8);
        u.b.hurtFlash = Math.max(0, u.b.hurtFlash - dt);
        u.b.anim.t += dt;
        if (u.hp <= 0) {
          u.b.koT += dt;
          if (u.b.koT > KO_RETIRE_TIME) party.retireFallen(id);
          continue;
        }
        // expire buffs / shields
        u.b.buffs = u.b.buffs.filter((b) => b.until > battle.time);
        if (u.b.shieldUntil <= battle.time) u.b.shield = 0;

        if (battle.phase === 'advance') {
          if (u.b.anim.name !== 'walk') u.b.anim = { name: 'walk', t: 0 };
          continue;
        }
        if (u.b.anim.name === 'walk') u.b.anim = { name: 'idle', t: 0 };

        // attack in progress
        if (u.b.pending) {
          const a = ANIM[u.b.pending.anim];
          if (!u.b.pending.fired && u.b.anim.t >= a.hit) {
            u.b.pending.fired = true;
            this.releaseAttack(battle, u, lane, slot, u.b.pending.target);
          }
          if (u.b.anim.t >= a.dur) {
            u.b.pending = null;
            u.b.anim = { name: 'idle', t: 0 };
          }
          continue;
        }
        const animDef = ANIM[u.b.anim.name];
        if (animDef && animDef.dur && u.b.anim.t >= animDef.dur) u.b.anim = { name: 'idle', t: 0 };

        if (!fighting) continue;
        u.b.atkTimer += dt * this.stat(u, 'atkSpeed', battle);
        if (u.b.atkTimer >= u.def.stats.atkInterval) {
          const target = this.targetFor(u, lane, battle);
          if (target) {
            u.b.atkTimer = 0;
            const anim = u.def.attackType === 'melee' ? 'melee' : 'proj';
            u.b.anim = { name: anim, t: 0 };
            u.b.pending = { anim, target, fired: false };
          } else {
            u.b.atkTimer = u.def.stats.atkInterval; // ready, waiting for a target
          }
        }
      }
    },

    releaseAttack(battle, u, lane, slot, target) {
      let t = target;
      if (!t || t.dead) t = this.targetFor(u, lane, battle);
      if (!t) return;
      let raw = this.stat(u, 'atk', battle);
      if (u.def.attackType === 'melee') {
        if (slot === 'back' && battle.party.slots[lane + '-front']) raw *= BACK_MELEE_PENALTY;
        this.dealToEnemy(battle, u, t, raw, { kind: 'basic' });
        battle.vfx.push({ type: 'slash', x: t.x, y: t.y - t.h / 2, t: 0, dur: 0.2, color: u.def.color });
      } else {
        battle.projectiles.push({
          from: 'ally', owner: u, lane, x: u.b.x + 40, y: u.b.y - 55, target: t, speed: 900,
          raw, charId: u.def.id, color: u.def.color,
        });
      }
    },

    updateProjectiles(battle, dt) {
      for (const p of battle.projectiles) {
        let t = p.target;
        if (p.from === 'ally' && (!t || t.dead)) {
          t = p.target = this.laneEnemies(battle, p.lane)[0] || null;
        }
        if (!t || (p.from === 'enemy' && t.hp <= 0)) {
          p.done = true;
          continue;
        }
        const tx = p.from === 'ally' ? t.x : t.b.x;
        const ty = p.from === 'ally' ? t.y - t.h / 2 : t.b.y - 50;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d <= step + 4) {
          p.done = true;
          if (p.from === 'ally') {
            this.dealToEnemy(battle, p.owner, t, p.raw, { kind: 'basic' });
            battle.vfx.push({ type: 'impact', charId: p.charId, x: tx, y: ty + 30, t: 0, dur: 0.3 });
          } else {
            this.dealToAlly(battle, p.owner, t, p.raw);
            battle.vfx.push({ type: 'burst', x: tx, y: ty, t: 0, dur: 0.25, color: p.color });
          }
        } else {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
        }
      }
      battle.projectiles = battle.projectiles.filter((p) => !p.done);
    },

    tickSkillCooldowns(battle, dt) {
      if (battle.phase !== 'combat') return;
      for (const u of battle.party.all()) {
        if (u.hp <= 0) continue;
        const haste = battle.hasteUnitId === u.id ? MG.RelicSystem.hastePct(battle.run) : 0;
        u.skillCd = Math.max(0, (u.skillCd || 0) - dt * (1 + haste));
      }
    },

    updateEnemyDeaths(battle, dt) {
      for (const e of battle.enemies) if (e.dead) e.deathT += dt;
      battle.enemies = battle.enemies.filter((e) => !e.dead || e.deathT < 0.5);
    },
  };

  MG.CombatSystem = CombatSystem;
})();
