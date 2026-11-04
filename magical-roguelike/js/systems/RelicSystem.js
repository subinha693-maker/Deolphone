// Relic effects and synergies, driven by combat events.
//
// Processing rules (prevent double / infinite triggering):
//  * Each battle event is dispatched through battle.emitRelic(), which tracks nesting depth;
//    events nested deeper than MAX_DEPTH are dropped.
//  * Damage dealt BY relics uses kind 'relic' / 'explosion' / 'reflect', which never raise
//    basicHit or skillHit again.
//  * Kills caused by an explosion never explode again. Reflect kills explode only with the
//    'rose_inferno' synergy.
//  * Order inside one event = order of run.relics (acquisition order), then synergies.
(function () {
  const MG = (window.MG = window.MG || {});
  const C = () => MG.CombatSystem;
  const MAX_DEPTH = 3;

  const RelicSystem = {
    MAX_DEPTH,

    count(run, id) {
      return run.relics.filter((r) => r === id).length;
    },
    has(run, id) {
      return run.relics.includes(id);
    },
    countTag(run, tag) {
      return run.relics.filter((r) => (MG.RELICS[r].tags || []).includes(tag)).length;
    },
    uniqueOwned(run) {
      return [...new Set(run.relics)];
    },

    synergyMet(run, syn) {
      const req = syn.requires;
      if (req.relics && !req.relics.every((r) => this.has(run, r))) return false;
      if (req.tagCount && this.countTag(run, req.tagCount.tag) < req.tagCount.count) return false;
      return true;
    },
    hasSyn(run, id) {
      return this.synergyMet(run, MG.SYNERGIES[id]);
    },
    /** UI helper: every synergy with progress information. */
    synergyStatus(run) {
      return Object.values(MG.SYNERGIES).map((syn) => {
        const req = syn.requires;
        const parts = [];
        let have = 0;
        let need = 0;
        for (const r of req.relics || []) {
          need++;
          const ok = this.has(run, r);
          if (ok) have++;
          parts.push({ label: MG.RELICS[r].name, ok });
        }
        if (req.tagCount) {
          need++;
          const c = this.countTag(run, req.tagCount.tag);
          const ok = c >= req.tagCount.count;
          if (ok) have++;
          parts.push({ label: `불속성 유물 ${c}/${req.tagCount.count}`, ok });
        }
        return { syn, active: have === need, have, need, parts };
      });
    },

    // ---------- passive stat hooks ----------
    statPct(u, stat, battle) {
      if (!battle) return 0;
      const run = battle.run;
      let pct = 0;
      if (stat === 'atk') {
        pct += MG.RELICS.flame_chrism.effect.pct * this.count(run, 'flame_chrism');
        for (const g of battle.globalBuffs) if (g.stat === 'atk' && g.until > battle.time) pct += g.pct;
      }
      if (stat === 'atkSpeed' && this.has(run, 'resonance_sigil')) {
        const per = this.hasSyn(run, 'blazing_resonance') ? 0.1 : MG.RELICS.resonance_sigil.effect.pct;
        pct += per * this.countTag(run, 'fire');
      }
      if (stat === 'def') {
        if (this.has(run, 'chain_seal')) {
          const eff = MG.RELICS.chain_seal.effect;
          const n = battle.party.fieldUnits().filter((f) => eff.roles.includes(f.def.role)).length;
          pct += eff.pct * n;
        }
        if (this.hasSyn(run, 'iron_chain') && u.b && u.b.shield > 0) pct += 0.2;
      }
      return pct;
    },
    swapCooldownMult(run) {
      return this.has(run, 'moon_hourglass') ? 1 - MG.RELICS.moon_hourglass.effect.cdPct : 1;
    },
    hastePct(run) {
      return MG.RELICS.echo_crystal.effect.pct;
    },
    skillPowerMult(battle) {
      if (!this.has(battle.run, 'star_grail')) return 1;
      this.proc(battle, 'star_grail', null);
      return 1 + MG.RELICS.star_grail.effect.pct;
    },

    // ---------- feedback ----------
    proc(battle, id, pos, label) {
      battle.procs[id] = (battle.procs[id] || 0) + 1;
      const isSyn = !!MG.SYNERGIES[id];
      const name = isSyn ? MG.SYNERGIES[id].name : MG.RELICS[id].name;
      const last = battle.procFloatT[id] || -9;
      if (pos && battle.time - last > 0.6) {
        battle.procFloatT[id] = battle.time;
        battle.float(pos.x, pos.y, (isSyn ? '시너지 ' : '') + (label || name), isSyn ? '#ff9ff3' : '#f2c14e', isSyn ? 1.2 : 0.9);
      }
      battle.bus.emit('relicProc', { id, synergy: isSyn });
    },

    mark(battle, e, amp, dur) {
      if (e.dead) return;
      e.markUntil = battle.time + dur;
      e.markAmp = Math.max(e.markAmp && e.markUntil > battle.time ? e.markAmp : 0, amp);
    },

    // ---------- event handlers ----------
    attach(battle) {
      const run = battle.run;
      const bus = battle.bus;
      const R = MG.RELICS;

      bus.on('battleStart', () => {
        if (this.has(run, 'echo_crystal')) {
          const pool = battle.party.fieldUnits();
          if (pool.length) {
            const u = run.rng.pick(pool);
            battle.hasteUnitId = u.id;
            this.proc(battle, 'echo_crystal', { x: u.b.x, y: u.b.y - 150 }, `잔향: ${u.def.name}`);
          }
        }
      });

      bus.on('waveStart', () => {
        if (this.has(run, 'pursuer_medal')) {
          const e = R.pursuer_medal.effect;
          battle.globalBuffs = battle.globalBuffs.filter((g) => g.id !== 'pursuer');
          battle.globalBuffs.push({ id: 'pursuer', stat: 'atk', pct: e.pct, until: battle.time + e.dur });
          this.proc(battle, 'pursuer_medal', { x: 360, y: 150 }, '추격 개시! 공격력 +50%');
        }
        if (this.hasSyn(run, 'echo_pursuit') && battle.hasteUnitId) {
          const u = battle.party.get(battle.hasteUnitId);
          if (u && u.hp > 0) {
            u.skillCd = 0;
            this.proc(battle, 'echo_pursuit', u.b ? { x: u.b.x, y: u.b.y - 170 } : null);
          }
        }
      });

      bus.on('waveEnd', () => {
        if (this.has(run, 'bell_charm')) {
          for (const u of battle.party.fieldUnits()) C().heal(u, u.maxHp * R.bell_charm.effect.pct, battle);
          this.proc(battle, 'bell_charm', { x: 360, y: 170 });
        }
      });

      bus.on('basicHit', ({ attacker, enemy }) => {
        if (!attacker || !this.has(run, 'ember_core')) return;
        const e = R.ember_core.effect;
        if (!run.rng.chance(e.chance)) return;
        this.proc(battle, 'ember_core', { x: enemy.x, y: enemy.y - enemy.h - 22 });
        if (this.hasSyn(run, 'spreading_flame')) {
          this.mark(battle, enemy, R.hunters_mark.effect.amp, R.hunters_mark.effect.dur);
          this.proc(battle, 'spreading_flame', { x: enemy.x, y: enemy.y - enemy.h - 40 }, '번지는 불꽃: 표식');
        }
        C().dealToEnemy(battle, attacker, enemy, C().stat(attacker, 'atk', battle) * e.mult, { kind: 'relic', element: 'fire' });
      });

      bus.on('skillHit', ({ enemy }) => {
        if (!this.has(run, 'hunters_mark')) return;
        const e = R.hunters_mark.effect;
        this.mark(battle, enemy, e.amp, e.dur);
        this.proc(battle, 'hunters_mark', { x: enemy.x, y: enemy.y - enemy.h - 22 }, '표식');
      });

      bus.on('kill', ({ killer, enemy, kind }) => {
        // spread marks (synergy) — only from marked enemies
        if (this.hasSyn(run, 'spreading_flame') && enemy.markUntil > battle.time) {
          const near = battle.enemies.filter((o) => !o.dead && o.lane === enemy.lane && Math.abs(o.x - enemy.x) < 240);
          for (const o of near) this.mark(battle, o, enemy.markAmp, R.hunters_mark.effect.dur);
          if (near.length) this.proc(battle, 'spreading_flame', { x: enemy.x, y: enemy.y - 60 }, '번지는 불꽃: 전파');
        }
        // explosion
        if (this.has(run, 'crimson_ribbon') && kind !== 'explosion') {
          if (kind === 'reflect' && !this.hasSyn(run, 'rose_inferno')) return;
          const e = R.crimson_ribbon.effect;
          const atk = killer && killer.def && killer.def.stats ? C().stat(killer, 'atk', battle) : 30;
          const near = battle.enemies.filter((o) => !o.dead && o !== enemy && o.lane === enemy.lane && Math.abs(o.x - enemy.x) < e.radius);
          battle.vfx.push({ type: 'ring', x: enemy.x, y: enemy.y - 20, t: 0, dur: 0.4, color: '#ff8a3d', r: e.radius });
          this.proc(battle, 'crimson_ribbon', { x: enemy.x, y: enemy.y - 40 }, '홍련 폭발');
          if (kind === 'reflect') this.proc(battle, 'rose_inferno', { x: enemy.x, y: enemy.y - 70 });
          for (const o of near) C().dealToEnemy(battle, killer, o, atk * e.mult, { kind: 'explosion', element: 'fire' });
        }
      });

      bus.on('allyDamaged', ({ unit, attacker, dmg }) => {
        if (!this.has(run, 'thorn_rosary') || !attacker || attacker.dead || dmg <= 0) return;
        const key = battle.party.keyOf(unit.id);
        if (!key || !key.endsWith('front')) return;
        const syn = this.hasSyn(run, 'rose_inferno');
        const pct = syn ? 0.25 : R.thorn_rosary.effect.pct;
        this.proc(battle, 'thorn_rosary', { x: attacker.x, y: attacker.y - attacker.h - 10 }, '가시 반사');
        // reflected damage ignores enemy defence partially by scaling raw
        C().dealToEnemy(battle, unit, attacker, dmg * pct * (1 + attacker.armor / 100), { kind: 'reflect', element: syn ? 'fire' : null });
      });

      bus.on('swapIn', ({ unit }) => {
        if (this.has(run, 'guardian_shard')) {
          const e = R.guardian_shard.effect;
          const mult = this.hasSyn(run, 'iron_chain') ? 1.5 : 1;
          C().addShield(unit, unit.maxHp * e.pct * mult, e.dur, battle);
          this.proc(battle, 'guardian_shard', { x: unit.b.x, y: unit.b.y - 160 });
          if (mult > 1) this.proc(battle, 'iron_chain', { x: unit.b.x, y: unit.b.y - 180 });
        }
        if (this.has(run, 'moon_hourglass')) {
          unit.skillCd = Math.max(0, (unit.skillCd || 0) - R.moon_hourglass.effect.skillCdCut);
          this.proc(battle, 'moon_hourglass', null);
        }
        if (this.hasSyn(run, 'hourglass_guard')) {
          C().heal(unit, unit.maxHp * 0.15, battle);
          this.proc(battle, 'hourglass_guard', { x: unit.b.x, y: unit.b.y - 200 });
        }
      });
    },
  };

  MG.RelicSystem = RelicSystem;
})();
