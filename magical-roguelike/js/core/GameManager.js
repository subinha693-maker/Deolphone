// Top-level game state. All screen changes go through the state machine below.
(function () {
  const MG = (window.MG = window.MG || {});

  const STATES = {
    TITLE: ['PARTY_SELECT', 'MAP', 'SANCTUARY', 'CODEX'],
    SANCTUARY: ['TITLE'],
    CODEX: ['TITLE'],
    PARTY_SELECT: ['MAP', 'RELIC', 'TITLE'],
    MAP: ['NODE_ENTER', 'TITLE', 'PARTY_SELECT'],
    NODE_ENTER: ['BATTLE', 'EVENT', 'REST', 'RELIC', 'SHOP', 'RECRUIT', 'MAP'],
    BATTLE: ['REWARD', 'NODE_COMPLETE', 'RUN_FAILED'],
    REWARD: ['NODE_COMPLETE'],
    EVENT: ['NODE_COMPLETE', 'RELIC', 'RECRUIT'],
    REST: ['NODE_COMPLETE'],
    RELIC: ['NODE_COMPLETE', 'MAP'],
    SHOP: ['NODE_COMPLETE'],
    RECRUIT: ['NODE_COMPLETE'],
    NODE_COMPLETE: ['MAP', 'RUN_CLEARED', 'RUN_FAILED'],
    RUN_FAILED: ['TITLE', 'MAP', 'PARTY_SELECT', 'SANCTUARY'],
    RUN_CLEARED: ['TITLE', 'MAP', 'PARTY_SELECT', 'SANCTUARY'],
  };

  class GameManager {
    constructor() {
      this.sm = new MG.StateMachine('game', 'TITLE', STATES);
      this.bus = new MG.EventBus();
      this.run = null;
      this.battle = null;
      this.ctx = null; // current node content (event / rest / relic choices / rewards / shop)
      this.speed = 1;
      this.paused = false;
      this.sm.onChange((s, prev) => {
        if (s === 'RUN_FAILED' || s === 'RUN_CLEARED') this.settleRun(s === 'RUN_CLEARED');
        if (MG.Save) MG.Save.flush();
        this.bus.emit('state', { state: s, prev });
      });
    }
    get state() {
      return this.sm.state;
    }

    goto(state) {
      return this.sm.go(state);
    }

    /** Open the party selection screen. */
    openPartySelect() {
      return this.sm.go('PARTY_SELECT');
    }

    /**
     * Start a run. opts.party: chosen char ids (first 3 on the field), opts.asc: ascension level.
     */
    newRun(seed, opts) {
      const o = opts || {};
      const s = seed == null ? (Date.now() ^ (Math.random() * 1e9)) >>> 0 : seed;
      const rng = MG.RNG(s);
      const run = {
        seed: s,
        rng,
        map: null,
        currentId: null,
        completed: new Set(),
        path: [],
        party: null,
        relics: [],
        shards: MG.RUN_CONFIG.startingShards,
        potions: MG.RUN_CONFIG.startingPotions,
        life: MG.MAP_CONFIG.startingLife,
        maxLife: MG.MAP_CONFIG.startingLife,
        scout: 0,
        scouted: {},
        seenEvents: [],
        flags: {},
        bonus: {},
        nextBattles: [],
        shopDiscount: 0,
        meta: {},
        unlocks: [],
        unlockedChars: MG.DEFAULT_UNLOCKED.slice(),
        asc: 0,
        codexNew: 0,
        rerollsLeft: 0,
        stats: { nodes: 0, battles: 0, battlesWon: 0, kills: 0, elites: 0 },
      };
      if (MG.Meta) MG.Meta.applyToRun(run, o.asc || 0);
      run.rerollsLeft = run.meta.rerolls || 0;
      const allowed = run.unlockedChars;
      let party = (o.party || MG.STARTING_PARTY).filter((c) => allowed.includes(c));
      if (!party.length) party = MG.STARTING_PARTY.filter((c) => allowed.includes(c));
      run.party = new MG.PartyManager();
      run.party.init(party.slice(0, MG.RUN_CONFIG.startPartySize), run);
      run.map = MG.MapManager.generate(rng, { recruit: MG.NodeManager.canRecruit(run) });
      this.run = run;
      this.battle = null;
      this.ctx = null;
      if (MG.Meta) for (const u of run.party.all()) MG.Meta.discover(run, 'characters', u.id);
      if (MG.Save) MG.Save.update((d) => (d.lastParty = party.slice(0, MG.RUN_CONFIG.startPartySize)));
      // 출발의 선물: pick a starting relic before the map
      if (run.meta.startRelic) {
        const rar = run.meta.startRelic >= 2 ? { common: 60, rare: 40 } : { common: 100 };
        const choices = MG.RewardSystem.relicChoices(run, rar, 3, { exclude: ['curse', 'epic'] });
        this.ctx = { kind: 'relic', choices, start: true };
        if (this.state !== 'RELIC' && this.sm.go('RELIC')) {
          this.bus.emit('run', run);
          return run;
        }
      }
      if (this.state !== 'MAP') this.sm.go('MAP');
      this.bus.emit('run', run);
      return run;
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
        case 'shop':
          this.sm.go('SHOP');
          break;
        case 'recruit':
          this.sm.go('RECRUIT');
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
          this.run.stats.elites += b.stats.elites;
          this.run.party.settleMoving();
          if (b.result === 'defeat') {
            this.sm.go('RUN_FAILED');
          } else {
            this.run.stats.battlesWon++;
            if (b.node.type === 'final') this.completeNode();
            else {
              const rewards = MG.RewardSystem.battleRewards(this.run, b.node);
              this.run.shards += rewards.shards;
              this.ctx = { kind: 'reward', rewards, node: b.node };
              this.sm.go('REWARD');
            }
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

    rerollReward() {
      if (!this.sm.is('REWARD') || this.run.rerollsLeft <= 0) return false;
      this.run.rerollsLeft--;
      this.ctx.rewards.options = MG.RewardSystem.rollOptions(this.run, this.ctx.node);
      this.bus.emit('run', this.run);
      return true;
    }

    chooseEvent(index) {
      if (!this.sm.is('EVENT') || this.ctx.resolved) return null;
      const ch = this.ctx.event.choices[index];
      if (!ch || !MG.NodeManager.requirementMet(this.run, ch)) return null;
      const opsCtx = {};
      const lines = MG.NodeManager.applyOps(this.run, ch.ops, opsCtx);
      this.ctx.followUp = opsCtx.followUp || null;
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
      if (MG.Meta) MG.Meta.discover(this.run, 'relics', relicId);
      if (this.ctx.start) {
        this.ctx = null;
        this.sm.go('MAP');
        this.bus.emit('run', this.run);
        return true;
      }
      this.completeNode();
      return true;
    }
    skipRelic() {
      if (!this.sm.is('RELIC')) return false;
      if (this.ctx.start) {
        this.ctx = null;
        return this.sm.go('MAP');
      }
      this.completeNode();
      return true;
    }

    /** Recruit node / event: take one candidate, or decline for shards. */
    recruit(charId) {
      if (!this.sm.is('RECRUIT')) return null;
      const run = this.run;
      let msg;
      if (charId && this.ctx.candidates.includes(charId)) {
        run.party.addUnit(charId, true);
        if (MG.Meta) MG.Meta.discover(run, 'characters', charId);
        msg = `${MG.CHARACTERS[charId].name}이(가) 동료가 되었다!`;
      } else {
        run.shards += 10;
        msg = '영입을 거절하고 별조각 +10';
      }
      this.completeNode();
      return msg;
    }

    shopBuy(index) {
      if (!this.sm.is('SHOP')) return { ok: false, reason: '상점이 아닙니다' };
      const r = MG.ShopSystem.buy(this.run, this.ctx.node, index);
      this.bus.emit('run', this.run);
      return r;
    }
    shopReroll() {
      if (!this.sm.is('SHOP')) return { ok: false };
      const r = MG.ShopSystem.reroll(this.run, this.ctx.node);
      this.bus.emit('run', this.run);
      return r;
    }
    leaveShop() {
      if (!this.sm.is('SHOP')) return false;
      this.run.shopDiscountActive = 0;
      this.completeNode();
      return true;
    }

    /** Leave an event/rest node after its result was shown (or open its follow-up screen). */
    finishNode() {
      if (!this.sm.is('EVENT', 'REST') || !this.ctx.resolved) return;
      const fu = this.ctx.followUp;
      if (this.sm.is('EVENT') && fu) {
        if (fu.kind === 'relic' && fu.choices.length) {
          this.ctx = { kind: 'relic', choices: fu.choices };
          this.sm.go('RELIC');
          return;
        }
        if (fu.kind === 'recruit') {
          this.ctx = { kind: 'recruit', candidates: fu.candidates };
          this.sm.go('RECRUIT');
          return;
        }
      }
      this.completeNode();
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

    settleRun(cleared) {
      if (!this.run || !MG.Meta) return;
      MG.Meta.settle(this.run, cleared);
    }

    usePotion(unitId) {
      const run = this.run;
      if (!run || run.potions <= 0) return { ok: false, reason: '물약이 없습니다' };
      if (!this.sm.is('MAP', 'REST', 'EVENT', 'RELIC', 'SHOP')) return { ok: false, reason: '탐사 맵에서만 사용 가능' };
      const u = run.party.get(unitId);
      if (u.hp <= 0) return { ok: false, reason: '쓰러진 아군에게는 사용할 수 없습니다 (휴식 노드에서 간호)' };
      if (u.hp >= u.maxHp) return { ok: false, reason: '이미 체력이 가득합니다' };
      run.party.heal(unitId, MG.RUN_CONFIG.potionHealPct + ((run.meta && run.meta.potionBonus) || 0));
      run.potions--;
      this.bus.emit('run', run);
      return { ok: true };
    }

    toTitle() {
      if (this.sm.is('RUN_FAILED', 'RUN_CLEARED', 'MAP', 'SANCTUARY', 'CODEX', 'PARTY_SELECT')) this.sm.go('TITLE');
    }
  }

  MG.GameManager = GameManager;
})();
