// Top-level game state. All screen changes go through the state machine below.
(function () {
  const MG = (window.MG = window.MG || {});

  const STATES = {
    TITLE: ['MAP'],
    MAP: ['NODE_ENTER', 'TITLE'],
    NODE_ENTER: ['BATTLE', 'EVENT', 'REST', 'RELIC', 'MAP'],
    BATTLE: ['REWARD', 'NODE_COMPLETE', 'RUN_FAILED'],
    REWARD: ['NODE_COMPLETE'],
    EVENT: ['NODE_COMPLETE'],
    REST: ['NODE_COMPLETE'],
    RELIC: ['NODE_COMPLETE'],
    NODE_COMPLETE: ['MAP', 'RUN_CLEARED', 'RUN_FAILED'],
    RUN_FAILED: ['TITLE', 'MAP'],
    RUN_CLEARED: ['TITLE', 'MAP'],
  };

  class GameManager {
    constructor() {
      this.sm = new MG.StateMachine('game', 'TITLE', STATES);
      this.bus = new MG.EventBus();
      this.run = null;
      this.battle = null;
      this.ctx = null; // current node content (event / rest / relic choices / rewards)
      this.speed = 1;
      this.paused = false;
      this.sm.onChange((s, prev) => this.bus.emit('state', { state: s, prev }));
    }
    get state() {
      return this.sm.state;
    }

    newRun(seed) {
      const s = seed == null ? (Date.now() ^ (Math.random() * 1e9)) >>> 0 : seed;
      const rng = MG.RNG(s);
      const party = new MG.PartyManager();
      party.init(MG.STARTING_PARTY);
      const prev = this.run;
      const keep = (k) => prev && MG.FAILURE_POLICY[k] === 'keep';
      this.run = {
        seed: s,
        rng,
        map: MG.MapManager.generate(rng),
        currentId: null,
        completed: new Set(),
        path: [],
        party: keep('party') ? prev.party : party,
        relics: keep('relics') ? prev.relics.slice() : [],
        shards: keep('shards') ? prev.shards : MG.RUN_CONFIG.startingShards,
        potions: MG.RUN_CONFIG.startingPotions,
        life: MG.MAP_CONFIG.startingLife,
        scout: 0,
        seenEvents: [],
        stats: { nodes: 0, battles: 0, kills: 0 },
      };
      this.battle = null;
      this.ctx = null;
      if (this.state !== 'MAP') this.sm.go('MAP');
      this.bus.emit('run', this.run);
      return this.run;
    }

    selectNode(id) {
      if (!this.sm.is('MAP')) return false;
      const node = MG.ExplorationManager.travel(this.run, id);
      if (!node) return false;
      this.sm.go('NODE_ENTER', { node });
      const content = MG.NodeManager.enter(this.run, node);
      this.ctx = content;
      switch (content.kind) {
        case 'battle':
          this.battle = content.battle;
          this.run.stats.battles++;
          this.sm.go('BATTLE');
          break;
        case 'event':
          this.sm.go('EVENT');
          break;
        case 'rest':
          this.sm.go('REST');
          break;
        case 'relic':
          this.sm.go('RELIC');
          break;
        default:
          this.sm.go('MAP');
      }
      return true;
    }

    update(dt) {
      if (this.sm.is('BATTLE') && this.battle && !this.paused) {
        const steps = this.speed;
        for (let i = 0; i < steps; i++) MG.WaveManager.update(this.battle, dt);
        const b = this.battle;
        if (b.result && !b.handled) {
          b.handled = true; // battle result is consumed exactly once
          this.run.stats.kills += b.stats.kills;
          if (b.result === 'defeat') {
            this.sm.go('RUN_FAILED');
          } else if (b.node.type === 'final') {
            this.completeNode();
          } else {
            const rewards = MG.RewardSystem.battleRewards(this.run, b.node);
            this.run.shards += rewards.shards;
            this.ctx = { kind: 'reward', rewards, node: b.node };
            this.sm.go('REWARD');
          }
        }
      }
    }

    chooseReward(index) {
      if (!this.sm.is('REWARD')) return null;
      const opt = this.ctx.rewards.options[index];
      if (!opt) return null;
      const msg = MG.RewardSystem.grant(this.run, opt);
      this.completeNode();
      return msg;
    }

    chooseEvent(index) {
      if (!this.sm.is('EVENT') || this.ctx.resolved) return null;
      const ch = this.ctx.event.choices[index];
      if (!ch || !MG.NodeManager.requirementMet(this.run, ch)) return null;
      const lines = MG.NodeManager.applyOps(this.run, ch.ops);
      this.ctx.resolved = { text: [ch.result, ...lines].filter(Boolean).join('\n') };
      this.bus.emit('run', this.run);
      return this.ctx.resolved;
    }

    chooseRest(optionId, targetId) {
      if (!this.sm.is('REST') || this.ctx.resolved) return null;
      this.ctx.resolved = { text: MG.NodeManager.rest(this.run, optionId, targetId) };
      this.bus.emit('run', this.run);
      return this.ctx.resolved;
    }

    pickRelic(relicId) {
      if (!this.sm.is('RELIC') || !this.ctx.choices.includes(relicId)) return false;
      this.run.relics.push(relicId);
      this.completeNode();
      return true;
    }

    /** Leave an event/rest node after its result was shown. */
    finishNode() {
      if (this.sm.is('EVENT', 'REST') && this.ctx.resolved) this.completeNode();
    }

    completeNode() {
      if (!this.sm.go('NODE_COMPLETE')) return;
      this.run.stats.nodes++;
      const isFinal = MG.ExplorationManager.complete(this.run);
      this.battle = null;
      this.ctx = null;
      if (this.run.party.allDown()) this.sm.go('RUN_FAILED');
      else if (isFinal) this.sm.go('RUN_CLEARED');
      else this.sm.go('MAP');
      this.bus.emit('run', this.run);
    }

    usePotion(unitId) {
      const run = this.run;
      if (!run || run.potions <= 0) return { ok: false, reason: '물약이 없습니다' };
      if (!this.sm.is('MAP', 'REST', 'EVENT', 'RELIC')) return { ok: false, reason: '탐사 맵에서만 사용 가능' };
      const u = run.party.get(unitId);
      if (u.hp <= 0) return { ok: false, reason: '쓰러진 아군에게는 사용할 수 없습니다 (휴식 노드에서 간호)' };
      if (u.hp >= u.maxHp) return { ok: false, reason: '이미 체력이 가득합니다' };
      run.party.heal(unitId, MG.RUN_CONFIG.potionHealPct);
      run.potions--;
      this.bus.emit('run', run);
      return { ok: true };
    }

    toTitle() {
      if (this.sm.is('RUN_FAILED', 'RUN_CLEARED', 'MAP')) this.sm.go('TITLE');
    }
  }

  MG.GameManager = GameManager;
})();
