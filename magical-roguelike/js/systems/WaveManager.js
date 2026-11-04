// Wave construction and the battle-node flow:
//   advance (run) -> combat (spawn + auto battle) -> waveClear -> advance ... -> nodeClear
//   any of advance/combat -> defeat
// Phases are a StateMachine, so a wave cannot be cleared twice or a reward shown mid-fight.
(function () {
  const MG = (window.MG = window.MG || {});

  const ADVANCE_TIME = 2.2;
  const WAVE_CLEAR_TIME = 1.6;
  const NODE_CLEAR_TIME = 1.8;
  const DEFEAT_TIME = 2.0;
  const SCROLL_SPEED = 260;

  const PHASES = {
    advance: ['combat', 'defeat'],
    combat: ['waveClear', 'defeat'],
    waveClear: ['advance', 'nodeClear', 'defeat'],
    nodeClear: ['done'],
    defeat: ['done'],
    done: [],
  };

  /** Runtime context of one battle node. */
  class Battle {
    constructor(run, node, waves) {
      this.run = run;
      this.party = run.party;
      this.node = node;
      this.waves = waves;
      this.waveIndex = 0;
      this.defense = !!node.defense;
      this.scout = run.scout || 0;
      this.bus = new MG.EventBus();
      this.sm = new MG.StateMachine('battle', 'advance', PHASES);
      this.phaseT = 0;
      this.time = 0;
      this.waveTime = 0;
      this.spawnIdx = 0;
      this.enemies = [];
      this.projectiles = [];
      this.vfx = [];
      this.floats = [];
      this.timers = [];
      this.swapCd = 0;
      this.formCd = [0, 0];
      this.tagWindow = [];
      this.globalBuffs = [];
      this.hasteUnitId = null;
      this.procs = {};
      this.procFloatT = {};
      this.depth = 0;
      this.scroll = 0;
      this.banner = null;
      this.result = null;
      this.stats = { kills: 0, leaks: 0, damage: 0, skills: 0 };
    }
    get phase() {
      return this.sm.state;
    }
    get wave() {
      return this.waves[this.waveIndex];
    }
    canAct() {
      return this.phase === 'advance' || this.phase === 'combat' || this.phase === 'waveClear';
    }
    float(x, y, text, color, size) {
      this.floats.push({ x, y, text, color: color || '#fff', size: size || 1, t: 0, dur: 0.9 });
    }
    schedule(delay, fn) {
      this.timers.push({ at: this.time + delay, fn });
    }
    /** Relic-facing event dispatch with re-entrancy depth guard. */
    emitRelic(evt, payload) {
      if (this.depth >= MG.RelicSystem.MAX_DEPTH) return;
      this.depth++;
      try {
        this.bus.emit(evt, payload);
      } finally {
        this.depth--;
      }
    }
    pendingSpawns(lane) {
      if (!this.wave) return 0;
      return this.wave.spawns.slice(this.spawnIdx).filter((s) => s.lane === lane).length;
    }
    setPhase(p) {
      if (this.sm.go(p)) {
        this.phaseT = 0;
        this.bus.emit('phase', { phase: p });
        return true;
      }
      return false;
    }
  }

  const WaveManager = {
    Battle,
    ADVANCE_TIME,

    /** Expand wave templates into concrete, time-ordered spawn lists. */
    buildWaves(node, rng) {
      let templates;
      if (node.type === 'final') templates = MG.FINAL_WAVES.slice();
      else {
        const [lo, hi] = MG.WAVE_COUNT[node.type] || [2, 3];
        const n = rng.int(lo, hi);
        const maxTier = Math.min(3, Math.ceil(node.difficulty / 2));
        const pool = MG.WAVE_TEMPLATES.filter((t) => t.tier <= maxTier);
        templates = [];
        for (let i = 0; i < n; i++) {
          // later waves prefer higher tiers
          const tierPool = pool.filter((t) => t.tier >= Math.min(maxTier, 1 + Math.floor(i / 2)));
          templates.push(rng.pick(tierPool.length ? tierPool : pool));
        }
        if (node.type === 'elite') templates[templates.length - 1] = rng.pick(MG.ELITE_WAVES);
      }
      return templates.map((tpl, index) => {
        const spawns = [];
        for (const en of tpl.entries) {
          for (let i = 0; i < en.count; i++) {
            let lane = en.lane;
            if (lane === 'both') lane = i % 2;
            else if (lane === 'rand') lane = rng.int(0, 1);
            spawns.push({ t: (en.delay || 0) + i * en.interval, enemy: en.enemy, lane });
          }
        }
        spawns.sort((a, b) => a.t - b.t);
        return {
          index,
          templateId: tpl.id,
          spawns,
          startCondition: { type: 'afterAdvance', delay: 0.4 },
          lanes: [...new Set(spawns.map((s) => s.lane))],
        };
      });
    },

    createBattle(run, node) {
      const waves = this.buildWaves(node, run.rng);
      const battle = new Battle(run, node, waves);
      for (const u of run.party.all()) {
        u.skillCd = u.def.skill.cooldown * 0.4;
        u.b = null;
      }
      for (const u of run.party.all()) MG.CombatSystem.resetUnitBattleState(u, battle, false);
      MG.RelicSystem.attach(battle);
      battle.bus.on('swapIn', ({ unit, lane }) => MG.SkillSystem.onSwapIn(battle, unit, lane));
      run.scout = 0; // scouting bonus is consumed by this battle
      battle.banner = { text: `WAVE 1 / ${waves.length}`, sub: '전진!', t: 0 };
      battle.emitRelic('battleStart', {});
      return battle;
    },

    beginWave(battle) {
      if (!battle.setPhase('combat')) return;
      battle.waveTime = 0;
      battle.spawnIdx = 0;
      battle.banner = { text: `WAVE ${battle.waveIndex + 1} / ${battle.waves.length}`, sub: '적 출현!', t: 0 };
      battle.emitRelic('waveStart', { wave: battle.wave });
    },

    update(battle, dt) {
      battle.time += dt;
      battle.phaseT += dt;
      battle.swapCd = Math.max(0, battle.swapCd - dt);
      battle.formCd = battle.formCd.map((c) => Math.max(0, c - dt));
      if (battle.banner) battle.banner.t += dt;

      // scheduled skill effects
      const due = battle.timers.filter((t) => t.at <= battle.time);
      battle.timers = battle.timers.filter((t) => t.at > battle.time);
      for (const t of due) t.fn();

      battle.party.updateMoving(dt, battle);

      switch (battle.phase) {
        case 'advance':
          battle.scroll += SCROLL_SPEED * dt;
          if (battle.phaseT >= ADVANCE_TIME) this.beginWave(battle);
          break;
        case 'combat': {
          battle.waveTime += dt;
          const wave = battle.wave;
          const t = battle.waveTime - wave.startCondition.delay;
          while (battle.spawnIdx < wave.spawns.length && wave.spawns[battle.spawnIdx].t <= t) {
            const s = wave.spawns[battle.spawnIdx++];
            MG.LaneManager.spawnEnemy(battle, s.enemy, s.lane);
          }
          const allSpawned = battle.spawnIdx >= wave.spawns.length;
          const alive = battle.enemies.some((e) => !e.dead);
          if (allSpawned && !alive) {
            battle.setPhase('waveClear');
            battle.banner = { text: 'WAVE CLEAR', sub: battle.waveIndex < battle.waves.length - 1 ? '다시 전진합니다' : '', t: 0 };
            battle.emitRelic('waveEnd', { wave });
          }
          break;
        }
        case 'waveClear':
          if (battle.phaseT >= WAVE_CLEAR_TIME) {
            if (battle.waveIndex < battle.waves.length - 1) {
              battle.waveIndex++;
              battle.setPhase('advance');
              battle.banner = { text: `WAVE ${battle.waveIndex + 1} / ${battle.waves.length}`, sub: '전진!', t: 0 };
            } else {
              battle.setPhase('nodeClear');
              battle.banner = { text: 'NODE CLEAR', sub: '모든 웨이브 격파', t: 0 };
              battle.projectiles = battle.projectiles.filter((p) => p.from === 'ally');
            }
          }
          break;
        case 'nodeClear':
          if (battle.phaseT >= NODE_CLEAR_TIME && battle.setPhase('done')) battle.result = 'victory';
          break;
        case 'defeat':
          if (battle.phaseT >= DEFEAT_TIME && battle.setPhase('done')) battle.result = 'defeat';
          break;
        default:
          break;
      }

      MG.CombatSystem.updateAllies(battle, dt);
      MG.CombatSystem.tickSkillCooldowns(battle, dt);
      MG.LaneManager.updateEnemies(battle, dt);
      MG.CombatSystem.updateProjectiles(battle, dt);
      MG.CombatSystem.updateEnemyDeaths(battle, dt);

      // defeat check — never after the node has been cleared
      if ((battle.phase === 'advance' || battle.phase === 'combat' || battle.phase === 'waveClear') && (battle.run.life <= 0 || battle.party.allDown())) {
        battle.setPhase('defeat');
        battle.banner = { text: 'DEFEAT', sub: battle.run.life <= 0 ? '공유 생명이 모두 소진되었습니다' : '모든 아군이 쓰러졌습니다', t: 0 };
      }

      // visual bookkeeping
      for (const f of battle.floats) {
        f.t += dt;
        f.y -= 38 * dt;
      }
      battle.floats = battle.floats.filter((f) => f.t < f.dur);
      for (const v of battle.vfx) v.t += dt;
      battle.vfx = battle.vfx.filter((v) => v.t < v.dur);
    },
  };

  MG.WaveManager = WaveManager;
})();
