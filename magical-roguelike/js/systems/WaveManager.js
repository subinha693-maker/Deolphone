// Wave construction and the battle-node flow:
//   advance (run) -> combat (spawn + auto battle) -> waveClear -> advance ... -> nodeClear
//   any of advance/combat -> defeat
// Phases are a StateMachine, so a wave cannot be cleared twice or a reward shown mid-fight.
// Wave plans are generated per node from a sub-RNG (seed ^ hash(node id)), so previewing a
// node on the map never consumes run.rng and the preview always matches the real battle.
(function () {
  const MG = (window.MG = window.MG || {});

  const ADVANCE_TIME = 2.2;
  const WAVE_CLEAR_TIME = 1.6;
  const NODE_CLEAR_TIME = 1.8;
  const DEFEAT_TIME = 2.0;
  const SCROLL_SPEED = 260;
  const WARN_LEAD = 2.0; // seconds of warning before an elite/boss spawns

  const PHASES = {
    advance: ['combat', 'defeat'],
    combat: ['waveClear', 'defeat'],
    waveClear: ['advance', 'nodeClear', 'defeat'],
    nodeClear: ['done'],
    defeat: ['done'],
    done: [],
  };

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

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
      this.warnings = [];
      this.swapCd = 0;
      this.formCd = [0, 0];
      this.tagWindow = [];
      this.globalBuffs = [];
      this.tempBonus = {};
      this.hasteUnitId = null;
      this.phoenixUsed = false;
      this.procs = {};
      this.procFloatT = {};
      this.depth = 0;
      this.scroll = 0;
      this.banner = null;
      this.result = null;
      this.stats = { kills: 0, elites: 0, leaks: 0, damage: 0, skills: 0 };
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
      if (!this.wave || this.phase !== 'combat') return this.wave && this.phase === 'advance' ? this.wave.spawns.filter((s) => s.lane === lane).length : 0;
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
    hashStr,

    /** Expand wave templates into concrete, time-ordered spawn lists. */
    buildWaves(node, rng, run) {
      const asc = (run && run.asc) || 0;
      let templates;
      if (node.type === 'final') templates = MG.FINAL_WAVES.slice();
      else {
        const [lo, hi] = MG.WAVE_COUNT[node.type] || [2, 3];
        const n = rng.int(lo, hi);
        const maxTier = Math.min(3, Math.ceil(node.difficulty / 2));
        const pool = MG.WAVE_TEMPLATES.filter((t) => t.tier <= maxTier);
        templates = [];
        for (let i = 0; i < n; i++) {
          const tierPool = pool.filter((t) => t.tier >= Math.min(maxTier, 1 + Math.floor(i / 2)));
          templates.push(rng.pick(tierPool.length ? tierPool : pool));
        }
        if (node.type === 'elite') templates[templates.length - 1] = rng.pick(MG.ELITE_WAVES);
      }
      return templates.map((tpl, index) => {
        const spawns = [];
        for (const en of tpl.entries) {
          const isEliteEntry = MG.ENEMIES[en.enemy].elite && node.type === 'elite';
          const count = en.count + (asc >= 2 && isEliteEntry ? 1 : 0);
          for (let i = 0; i < count; i++) {
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

    /** Deterministic plan for a node (cached). Never touches run.rng. */
    planFor(run, node) {
      if (!node.plan) node.plan = this.buildWaves(node, MG.RNG((run.seed ^ hashStr(node.id)) >>> 0), run);
      return node.plan;
    },

    /** Summary of one wave: [{lane, enemyId, count, totalHp, flags}] (pure). */
    summarize(wave, difficulty, run) {
      if (!wave) return [];
      const map = {};
      for (const s of wave.spawns) {
        const k = s.lane + ':' + s.enemy;
        const d = MG.ENEMIES[s.enemy];
        if (!map[k]) map[k] = { lane: s.lane, enemyId: s.enemy, count: 0, totalHp: 0, flags: { flying: !!d.flying, ranged: !!d.ranged, elite: !!d.elite, boss: !!d.boss } };
        map[k].count++;
        map[k].totalHp += MG.LaneManager.scaledHp(d, difficulty, run, 0);
      }
      return Object.values(map).sort((a, b) => a.lane - b.lane || b.totalHp - a.totalHp);
    },

    /** offset 0 = current wave, 1 = next wave. */
    preview(battle, offset) {
      return this.summarize(battle.waves[battle.waveIndex + (offset || 0)], battle.node.difficulty, battle.run);
    },

    createBattle(run, node) {
      const waves = this.planFor(run, node).map((w) => Object.assign({}, w, { spawns: w.spawns.map((s) => Object.assign({}, s)) }));
      const battle = new Battle(run, node, waves);
      // "next n battles" bonuses from events
      for (const nb of run.nextBattles || []) battle.tempBonus[nb.stat] = (battle.tempBonus[nb.stat] || 0) + nb.pct;
      run.nextBattles = (run.nextBattles || []).map((nb) => Object.assign({}, nb, { n: nb.n - 1 })).filter((nb) => nb.n > 0);
      const remain = MG.RelicSystem.openingRemain(run);
      for (const u of run.party.all()) {
        u.skillCd = MG.SkillSystem.effective(u).cooldown * remain;
        u.b = null;
      }
      for (const u of run.party.all()) MG.CombatSystem.resetUnitBattleState(u, battle, false);
      MG.RelicSystem.attach(battle);
      battle.bus.on('swapIn', ({ unit, lane }) => MG.SkillSystem.onSwapIn(battle, unit, lane));
      run.scout = 0; // scouting / ambush modifier is consumed by this battle
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
          // elite / boss spawn warnings
          for (let i = battle.spawnIdx; i < wave.spawns.length; i++) {
            const s = wave.spawns[i];
            if (s.warned || s.t - t > WARN_LEAD) continue;
            const d = MG.ENEMIES[s.enemy];
            if (d.elite || d.boss) {
              s.warned = true;
              battle.warnings.push({ lane: s.lane, until: battle.time + Math.max(0.6, s.t - t), text: d.boss ? '보스 출현' : '강적 출현' });
              battle.bus.emit('spawnWarning', { lane: s.lane, enemy: s.enemy });
            }
          }
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

      if ((battle.phase === 'advance' || battle.phase === 'combat' || battle.phase === 'waveClear') && (battle.run.life <= 0 || battle.party.allDown())) {
        battle.setPhase('defeat');
        battle.banner = { text: 'DEFEAT', sub: battle.run.life <= 0 ? '공유 생명이 모두 소진되었습니다' : '모든 아군이 쓰러졌습니다', t: 0 };
      }

      for (const f of battle.floats) {
        f.t += dt;
        f.y -= 38 * dt;
      }
      battle.floats = battle.floats.filter((f) => f.t < f.dur);
      for (const v of battle.vfx) v.t += dt;
      battle.vfx = battle.vfx.filter((v) => v.t < v.dur);
      battle.warnings = battle.warnings.filter((w) => w.until > battle.time);
    },
  };

  MG.WaveManager = WaveManager;
})();
