// Reward generation and granting (relics, skill mods, support cards).
(function () {
  const MG = (window.MG = window.MG || {});

  const RewardSystem = {
    /** Relics the run may still receive: unlocked, not owned (unless stackable). */
    relicPool(run) {
      const unlocked = run.unlocks || [];
      return Object.values(MG.RELICS).filter((r) => (r.stackable || !run.relics.includes(r.id)) && (!r.unlock || unlocked.includes(r.unlock)));
    },

    /** Apply meta modifiers (rare bonus, curse ward) to a rarity weight table. */
    adjustRarity(run, weights) {
      const w = Object.assign({}, weights);
      const meta = run.meta || {};
      if (meta.rareBonus) {
        // move weight from common into rare/epic
        const shift = Math.min(w.common || 0, 100 * meta.rareBonus);
        w.common -= shift;
        w.rare = (w.rare || 0) + shift * 0.75;
        w.epic = (w.epic || 0) + shift * 0.25;
      }
      if (meta.curseWard && w.curse) w.curse /= 2;
      if (!(run.unlocks || []).includes('u_epic')) delete w.epic;
      return w;
    },

    /**
     * Pick n distinct relics.
     * opts.rarity: force a rarity ('any' = no epic/curse), opts.tag: tag filter, opts.exclude: rarities to skip.
     */
    relicChoices(run, rarityWeights, n, opts) {
      const o = opts || {};
      let pool = this.relicPool(run);
      if (o.tag) pool = pool.filter((r) => r.tags.includes(o.tag));
      if (o.rarity === 'any') pool = pool.filter((r) => r.rarity === 'common' || r.rarity === 'rare');
      else if (o.rarity) {
        const only = pool.filter((r) => r.rarity === o.rarity);
        if (only.length) pool = only;
      }
      if (o.exclude) pool = pool.filter((r) => !o.exclude.includes(r.rarity));
      const weights = rarityWeights && !o.rarity ? this.adjustRarity(run, rarityWeights) : null;
      const out = [];
      while (out.length < n && pool.length) {
        let pick;
        if (weights) {
          const entries = Object.entries(weights).filter(([v, w]) => w > 0 && pool.some((r) => r.rarity === v)).map(([v, w]) => ({ v, w }));
          const rar = entries.length ? run.rng.weighted(entries) : null;
          const sub = rar ? pool.filter((r) => r.rarity === rar) : pool;
          pick = run.rng.pick(sub.length ? sub : pool);
        } else pick = run.rng.pick(pool);
        out.push(pick.id);
        pool = pool.filter((r) => r.id !== pick.id);
      }
      return out;
    },

    /** Skill mods still obtainable: [{charId, modId}] for current party members. */
    modPool(run) {
      const out = [];
      for (const u of run.party.all()) for (const m of MG.SKILL_MODS[u.id] || []) if (!u.mods.includes(m.id)) out.push({ charId: u.id, modId: m.id });
      return out;
    },
    /** n mods, different characters first. */
    modChoices(run, n, exclude) {
      let pool = this.modPool(run).filter((m) => !(exclude || []).includes(m.modId));
      const out = [];
      while (out.length < n && pool.length) {
        const usedChars = out.map((m) => m.charId);
        const fresh = pool.filter((m) => !usedChars.includes(m.charId));
        const pick = run.rng.pick(fresh.length ? fresh : pool);
        out.push(pick);
        pool = pool.filter((m) => m.modId !== pick.modId);
      }
      return out;
    },

    altCard(run) {
      return run.rng.pick([
        { kind: 'heal', pct: 0.25, label: '치유의 성수', desc: '쓰러지지 않은 모든 아군 체력 25% 회복' },
        { kind: 'scout', pct: 0.15, label: '정찰 보고서', desc: '다음 전투 적 체력 -15% · 별조각 +6 · 다음에 갈 수 있는 전투 노드의 진격로별 구성 공개', shards: 6 },
      ]);
    },

    battleRewards(run, node) {
      const cfg = MG.NODE_REWARDS[node.type];
      if (!cfg || !cfg.relicChoices) return null;
      const shards = Math.round(run.rng.int(cfg.shards[0], cfg.shards[1]) * MG.RelicSystem.shardMult(run));
      return { shards, options: this.rollOptions(run, node) };
    },

    rollOptions(run, node) {
      const cfg = MG.NODE_REWARDS[node.type];
      const nRelics = cfg.relicChoices + ((run.meta && run.meta.choice) || 0);
      const options = this.relicChoices(run, cfg.rarity, nRelics).map((id) => ({ kind: 'relic', relicId: id }));
      const mods = this.modChoices(run, cfg.mods || 0);
      for (const m of mods) options.push({ kind: 'mod', charId: m.charId, modId: m.modId });
      const missingMods = (cfg.mods || 0) - mods.length;
      const nAlt = (cfg.alt || 0) + Math.max(0, missingMods);
      for (let i = 0; i < nAlt; i++) options.push(this.altCard(run));
      return options;
    },

    grant(run, option) {
      switch (option.kind) {
        case 'relic':
          run.relics.push(option.relicId);
          MG.Meta && MG.Meta.discover(run, 'relics', option.relicId);
          return `${MG.RELICS[option.relicId].name} 획득`;
        case 'mod': {
          const u = run.party.get(option.charId);
          if (u && !u.mods.includes(option.modId)) u.mods.push(option.modId);
          return `${MG.CHARACTERS[option.charId].name} 스킬 개조: ${MG.SKILL_MOD_INDEX[option.modId].name}`;
        }
        case 'heal':
          for (const u of run.party.all()) run.party.heal(u.id, option.pct);
          return '아군 체력 회복';
        case 'scout':
          run.scout = option.pct;
          run.shards += option.shards || 0;
          MG.ExplorationManager.scoutNext(run, 2);
          return '다음 전투 정찰 완료';
        default:
          return '';
      }
    },
  };

  MG.RewardSystem = RewardSystem;
})();
