// Relic effects and synergies, driven by combat events.
//
// Processing rules (prevent double / infinite triggering):
//  * Each battle event is dispatched through battle.emitRelic(), which tracks nesting depth;
//    events nested deeper than MAX_DEPTH are dropped.
//  * Damage dealt BY relics uses kind 'relic' / 'explosion' / 'reflect', which never raise
//    basicHit or skillHit again.
//  * Kills caused by an explosion never explode again. Reflect kills explode only with the
//    'rose_inferno' synergy.
//  * Skill echoes (거울 프리즘) re-apply the skill effect but never raise skillCast again.
//  * Once-per-battle effects (불사조의 깃털) keep a flag on the battle object.
//  * Order inside one event = order of run.relics (acquisition order), then synergies.
(function () {
  const MG = (window.MG = window.MG || {});
  const C = () => MG.CombatSystem;
  const MAX_DEPTH = 3;
  const E = (id) => MG.RELICS[id].effect;

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
    tagName(tag) {
      return MG.TAG_NAMES[tag] || tag;
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
          parts.push({ label: `${this.tagName(req.tagCount.tag)} 유물 ${c}/${req.tagCount.count}`, ok });
        }
        return { syn, active: have === need, have, need, parts };
      });
    },

    // ---------- passive hooks ----------
    statPct(u, stat, battle) {
      if (!battle) return 0;
      const run = battle.run;
      let pct = 0;
      const key = battle.party.keyOf(u.id);
      if (stat === 'atk') {
        pct += E('flame_chrism').pct * this.count(run, 'flame_chrism');
        for (const g of battle.globalBuffs) if (g.stat === 'atk' && g.until > battle.time) pct += g.pct;
        if (this.has(run, 'twilight_crown')) pct += E('twilight_crown').atk;
        if (this.has(run, 'blood_oath')) pct += E('blood_oath').atk;
        if (this.has(run, 'glass_crown')) pct += E('glass_crown').atk;
      }
      if (stat === 'atkSpeed' && this.has(run, 'resonance_sigil')) {
        const per = this.hasSyn(run, 'blazing_resonance') ? 0.1 : E('resonance_sigil').pct;
        pct += per * this.countTag(run, 'fire');
      }
      if (stat === 'def') {
        if (this.has(run, 'chain_seal')) {
          const eff = E('chain_seal');
          const n = battle.party.fieldUnits().filter((f) => eff.roles.includes(f.def.role)).length;
          pct += eff.pct * n;
        }
        if (this.hasSyn(run, 'iron_chain') && u.b && u.b.shield > 0) pct += 0.2;
        if (this.has(run, 'fortress_crest') && key && key.endsWith('front')) pct += E('fortress_crest').pct;
        if (this.hasSyn(run, 'guardian_oath')) pct += 0.15;
      }
      if ((stat === 'atk' || stat === 'def') && this.has(run, 'lone_wolf_fang') && key) {
        const lane = +key[0];
        if (battle.party.laneUnits(lane).length === 1) pct += E('lone_wolf_fang').pct;
      }
      return pct;
    },
    swapCooldownMult(run) {
      let m = 1;
      if (this.has(run, 'moon_hourglass')) m *= 1 - E('moon_hourglass').cdPct;
      if (this.has(run, 'cracked_bell')) m *= 1 - E('cracked_bell').cdPct;
      return m;
    },
    laneMoveMult(run) {
      return this.has(run, 'traveler_boots') ? E('traveler_boots').mult : 1;
    },
    /** Total skill cooldown recovery bonus for a unit (relics + meta). */
    skillHaste(battle, u) {
      const run = battle.run;
      let h = (run.meta && run.meta.haste) || 0;
      if (battle.hasteUnitId === u.id) h += E('echo_crystal').pct;
      if (this.has(run, 'twilight_crown')) h += E('twilight_crown').haste;
      if (this.has(run, 'hungry_grail')) h += E('hungry_grail').haste;
      return h;
    },
    healMult(run) {
      return this.has(run, 'healer_ring') ? 1 + E('healer_ring').pct : 1;
    },
    damageTakenMult(run) {
      return this.has(run, 'glass_crown') ? 1 + E('glass_crown').taken : 1;
    },
    /** Extra multiplier on damage dealt to an enemy. */
    damageMult(battle, e) {
      if (this.has(battle.run, 'executioner_coin')) {
        const eff = E('executioner_coin');
        if (e.hp <= e.maxHp * eff.threshold) return 1 + eff.pct;
      }
      return 1;
    },
    shardMult(run) {
      return this.has(run, 'hungry_grail') ? 1 - E('hungry_grail').shards : 1;
    },
    skillPowerMult(battle) {
      let m = 1;
      if (this.has(battle.run, 'star_grail')) {
        this.proc(battle, 'star_grail', null);
        m += E('star_grail').pct;
      }
      if (this.hasSyn(battle.run, 'arcane_oath')) m += 0.15;
      return m;
    },
    /** Starting skill cooldown (fraction of cooldown remaining) for a new battle. */
    openingRemain(run) {
      let remain = 0.75;
      if (this.has(run, 'mana_spring')) remain = E('mana_spring').remain;
      remain -= (run.meta && run.meta.opening) || 0;
      return Math.max(0, remain);
    },

    onOverflow(battle, u, over) {
      if (!this.has(battle.run, 'overflow_blessing')) return;
      const syn = this.hasSyn(battle.run, 'cycle_of_life');
      const amount = over * (syn ? 1.5 : E('overflow_blessing').pct);
      const dur = syn ? 8 : E('overflow_blessing').dur;
      C().addShield(u, Math.min(u.maxHp, (u.b.shieldUntil > battle.time ? u.b.shield : 0) + amount), dur, battle, true);
      this.proc(battle, 'overflow_blessing', { x: u.b.x, y: u.b.y - 150 }, '넘치는 축복');
      if (syn) this.proc(battle, 'cycle_of_life', null);
    },

    /** 불사조의 깃털: once per battle. Returns true if the unit was saved. */
    tryPhoenix(battle, u) {
      if (!this.has(battle.run, 'phoenix_feather') || battle.phoenixUsed) return false;
      battle.phoenixUsed = true;
      const eff = E('phoenix_feather');
      u.hp = Math.max(1, Math.round(u.maxHp * eff.heal));
      const key = battle.party.keyOf(u.id);
      if (key) {
        const atk = C().stat(u, 'atk', battle);
        for (const e of C().laneEnemies(battle, +key[0])) C().dealToEnemy(battle, u, e, atk * eff.mult, { kind: 'relic', element: 'fire' });
      }
      battle.vfx.push({ type: 'ring', x: u.b.x, y: u.b.y - 40, t: 0, dur: 0.8, color: '#ff8a3d', r: 220 });
      this.proc(battle, 'phoenix_feather', { x: u.b.x, y: u.b.y - 160 }, '불사조 부활!');
      return true;
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
      const active = e.markUntil > battle.time ? e.markAmp : 0;
      e.markUntil = battle.time + dur;
      e.markAmp = Math.max(active, amp);
    },

    // ---------- event handlers ----------
    attach(battle) {
      const run = battle.run;
      const bus = battle.bus;

      bus.on('battleStart', () => {
        if (this.has(run, 'echo_crystal')) {
          const pool = battle.party.fieldUnits();
          if (pool.length) {
            const u = run.rng.pick(pool);
            battle.hasteUnitId = u.id;
            this.proc(battle, 'echo_crystal', { x: u.b.x, y: u.b.y - 150 }, `잔향: ${u.def.name}`);
          }
        }
        if (this.has(run, 'lifeline_charm') && run.life < run.maxLife) {
          run.life = Math.min(run.maxLife, run.life + E('lifeline_charm').n);
          this.proc(battle, 'lifeline_charm', { x: 160, y: 200 }, '생명 +1');
        }
        if (this.has(run, 'blood_oath')) {
          for (const u of battle.party.all()) if (u.hp > 0) u.hp = Math.max(1, Math.round(u.hp - u.maxHp * E('blood_oath').cost));
          this.proc(battle, 'blood_oath', { x: 360, y: 200 }, '피의 서약: 체력 대가');
        }
      });

      bus.on('waveStart', () => {
        if (this.has(run, 'pursuer_medal')) {
          const e = E('pursuer_medal');
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
          for (const u of battle.party.fieldUnits()) C().heal(u, u.maxHp * E('bell_charm').pct, battle);
          this.proc(battle, 'bell_charm', { x: 360, y: 170 });
        }
      });

      bus.on('basicHit', ({ attacker, enemy }) => {
        if (!attacker || !this.has(run, 'ember_core')) return;
        const e = E('ember_core');
        if (!run.rng.chance(e.chance)) return;
        this.proc(battle, 'ember_core', { x: enemy.x, y: enemy.y - enemy.h - 22 });
        if (this.hasSyn(run, 'spreading_flame')) {
          this.mark(battle, enemy, E('hunters_mark').amp, E('hunters_mark').dur);
          this.proc(battle, 'spreading_flame', { x: enemy.x, y: enemy.y - enemy.h - 40 }, '번지는 불꽃: 표식');
        }
        C().dealToEnemy(battle, attacker, enemy, C().stat(attacker, 'atk', battle) * e.mult, { kind: 'relic', element: 'fire' });
      });

      bus.on('skillHit', ({ enemy }) => {
        if (!this.has(run, 'hunters_mark')) return;
        const e = E('hunters_mark');
        this.mark(battle, enemy, e.amp, e.dur);
        this.proc(battle, 'hunters_mark', { x: enemy.x, y: enemy.y - enemy.h - 22 }, '표식');
      });

      bus.on('skillCast', ({ unit, skill, lane }) => {
        if (this.has(run, 'swift_quill')) {
          const syn = this.hasSyn(run, 'skill_storm');
          C().addBuff(unit, { id: 'swift_quill', stat: 'atkSpeed', pct: syn ? 0.5 : E('swift_quill').pct, dur: syn ? 7 : E('swift_quill').dur }, battle);
          this.proc(battle, 'swift_quill', { x: unit.b.x, y: unit.b.y - 165 }, '신속');
          if (syn) this.proc(battle, 'skill_storm', null);
        }
        if (this.has(run, 'echo_bell') && run.rng.chance(E('echo_bell').chance)) {
          const mates = battle.party.laneUnits(lane).filter((m) => m.id !== unit.id && (m.skillCd || 0) > 0);
          if (mates.length) {
            const m = mates[0];
            m.skillCd = Math.max(0, m.skillCd - E('echo_bell').cut);
            this.proc(battle, 'echo_bell', { x: m.b.x, y: m.b.y - 165 }, '메아리: 대기 -3초');
          }
        }
        if (this.has(run, 'mirror_prism') && run.rng.chance(E('mirror_prism').chance)) {
          this.proc(battle, 'mirror_prism', { x: unit.b.x, y: unit.b.y - 185 }, '거울 프리즘: 재발동');
          battle.schedule(0.55, () => MG.SkillSystem.apply(battle, unit, skill, lane, E('mirror_prism').mult));
        }
      });

      bus.on('kill', ({ killer, enemy, kind }) => {
        if (this.hasSyn(run, 'spreading_flame') && enemy.markUntil > battle.time) {
          const near = battle.enemies.filter((o) => !o.dead && o.lane === enemy.lane && Math.abs(o.x - enemy.x) < 240);
          for (const o of near) this.mark(battle, o, enemy.markAmp, E('hunters_mark').dur);
          if (near.length) this.proc(battle, 'spreading_flame', { x: enemy.x, y: enemy.y - 60 }, '번지는 불꽃: 전파');
        }
        if (this.has(run, 'crimson_ribbon') && kind !== 'explosion') {
          if (kind === 'reflect' && !this.hasSyn(run, 'rose_inferno')) return;
          const e = E('crimson_ribbon');
          const mult = this.hasSyn(run, 'blood_flame') ? 0.6 : e.mult;
          const atk = killer && killer.def && killer.def.stats ? C().stat(killer, 'atk', battle) : 30;
          const near = battle.enemies.filter((o) => !o.dead && o !== enemy && o.lane === enemy.lane && Math.abs(o.x - enemy.x) < e.radius);
          battle.vfx.push({ type: 'ring', x: enemy.x, y: enemy.y - 20, t: 0, dur: 0.4, color: '#ff8a3d', r: e.radius });
          this.proc(battle, 'crimson_ribbon', { x: enemy.x, y: enemy.y - 40 }, '홍련 폭발');
          if (kind === 'reflect') this.proc(battle, 'rose_inferno', { x: enemy.x, y: enemy.y - 70 });
          if (mult > e.mult) this.proc(battle, 'blood_flame', null);
          for (const o of near) C().dealToEnemy(battle, killer, o, atk * mult, { kind: 'explosion', element: 'fire' });
        }
      });

      bus.on('allyDamaged', ({ unit, attacker, dmg }) => {
        if (!this.has(run, 'thorn_rosary') || !attacker || attacker.dead || dmg <= 0) return;
        const key = battle.party.keyOf(unit.id);
        if (!key || !key.endsWith('front')) return;
        const syn = this.hasSyn(run, 'rose_inferno');
        let pct = syn ? 0.25 : E('thorn_rosary').pct;
        if (this.hasSyn(run, 'steel_rampart')) pct += 0.1;
        this.proc(battle, 'thorn_rosary', { x: attacker.x, y: attacker.y - attacker.h - 10 }, '가시 반사');
        C().dealToEnemy(battle, unit, attacker, dmg * pct * (1 + attacker.armor / 100), { kind: 'reflect', element: syn ? 'fire' : null });
      });

      bus.on('swapIn', ({ unit, lane }) => {
        if (this.has(run, 'guardian_shard')) {
          const e = E('guardian_shard');
          const mult = this.hasSyn(run, 'iron_chain') ? 1.5 : 1;
          C().addShield(unit, unit.maxHp * e.pct * mult, e.dur, battle);
          this.proc(battle, 'guardian_shard', { x: unit.b.x, y: unit.b.y - 160 });
          if (mult > 1) this.proc(battle, 'iron_chain', { x: unit.b.x, y: unit.b.y - 180 });
        }
        if (this.has(run, 'moon_hourglass')) {
          unit.skillCd = Math.max(0, (unit.skillCd || 0) - E('moon_hourglass').skillCdCut);
          this.proc(battle, 'moon_hourglass', null);
        }
        if (this.hasSyn(run, 'hourglass_guard')) {
          C().heal(unit, unit.maxHp * 0.15, battle);
          this.proc(battle, 'hourglass_guard', { x: unit.b.x, y: unit.b.y - 200 });
        }
        if (this.has(run, 'swap_blade') && battle.phase === 'combat') {
          const syn = this.hasSyn(run, 'blade_dance');
          const mult = syn ? 1.2 : E('swap_blade').mult;
          const atk = C().stat(unit, 'atk', battle);
          const targets = C().laneEnemies(battle, lane);
          if (targets.length) {
            this.proc(battle, 'swap_blade', { x: unit.b.x + 60, y: unit.b.y - 140 }, '교대의 칼날');
            if (syn) this.proc(battle, 'blade_dance', null);
            for (const e of targets) C().dealToEnemy(battle, unit, e, atk * mult, { kind: 'relic' });
          }
        }
        if (this.has(run, 'cracked_bell')) {
          unit.hp = Math.max(1, Math.round(unit.hp - unit.maxHp * E('cracked_bell').cost));
          this.proc(battle, 'cracked_bell', { x: unit.b.x, y: unit.b.y - 220 }, '금 간 종: 체력 대가');
        }
      });

      bus.on('laneMoveEnd', ({ unit }) => {
        if (this.has(run, 'lane_banner')) {
          C().addBuff(unit, { id: 'lane_banner', stat: 'atk', pct: E('lane_banner').pct, dur: E('lane_banner').dur }, battle);
          this.proc(battle, 'lane_banner', { x: unit.b.x, y: unit.b.y - 150 }, '진격로의 깃발');
        }
        if (this.hasSyn(run, 'leap_momentum')) {
          unit.skillCd = Math.max(0, (unit.skillCd || 0) - 4);
          this.proc(battle, 'leap_momentum', { x: unit.b.x, y: unit.b.y - 175 }, '도약의 기세');
        }
      });

      bus.on('leak', () => {
        if (!this.has(run, 'last_bastion')) return;
        const e = E('last_bastion');
        battle.globalBuffs = battle.globalBuffs.filter((g) => g.id !== 'bastion');
        battle.globalBuffs.push({ id: 'bastion', stat: 'atk', pct: e.pct, until: battle.time + e.dur });
        for (const u of battle.party.fieldUnits()) C().heal(u, u.maxHp * e.heal, battle);
        this.proc(battle, 'last_bastion', { x: 360, y: 190 }, '최후의 보루!');
      });
    },
  };

  MG.RelicSystem = RelicSystem;
})();
