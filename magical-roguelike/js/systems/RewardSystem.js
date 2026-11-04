// Reward generation and granting.
(function () {
  const MG = (window.MG = window.MG || {});

  const RewardSystem = {
    /** Pick n distinct relics the run can still take (non-stackable owned relics are excluded). */
    relicChoices(run, rarityWeights, n, opts) {
      const o = opts || {};
      let pool = Object.values(MG.RELICS).filter((r) => r.stackable || !run.relics.includes(r.id));
      if (o.tag) pool = pool.filter((r) => r.tags.includes(o.tag));
      if (o.rarity && o.rarity !== 'any') {
        const only = pool.filter((r) => r.rarity === o.rarity);
        if (only.length) pool = only;
      }
      const out = [];
      while (out.length < n && pool.length) {
        let pick;
        if (rarityWeights && !o.rarity) {
          const rar = run.rng.weighted(Object.entries(rarityWeights).map(([v, w]) => ({ v, w })));
          const sub = pool.filter((r) => r.rarity === rar);
          pick = run.rng.pick(sub.length ? sub : pool);
        } else pick = run.rng.pick(pool);
        out.push(pick.id);
        pool = pool.filter((r) => r.id !== pick.id);
      }
      return out;
    },

    battleRewards(run, node) {
      const cfg = MG.NODE_REWARDS[node.type];
      if (!cfg || !cfg.relicChoices) return null;
      const shards = run.rng.int(cfg.shards[0], cfg.shards[1]);
      const options = this.relicChoices(run, cfg.rarity, cfg.relicChoices).map((id) => ({ kind: 'relic', relicId: id }));
      options.push({ kind: 'heal', pct: 0.25, label: '치유의 성수', desc: '쓰러지지 않은 모든 아군 체력 25% 회복' });
      options.push({ kind: 'scout', pct: 0.15, label: '정찰 보고서', desc: '다음 전투 노드의 적 체력 -15% · 별조각 +6', shards: 6 });
      return { shards, options };
    },

    grant(run, option) {
      switch (option.kind) {
        case 'relic':
          run.relics.push(option.relicId);
          return `${MG.RELICS[option.relicId].name} 획득`;
        case 'heal':
          for (const u of run.party.all()) run.party.heal(u.id, option.pct);
          return '아군 체력 회복';
        case 'scout':
          run.scout = option.pct;
          run.shards += option.shards || 0;
          return '다음 전투 정찰 완료';
        default:
          return '';
      }
    },
  };

  MG.RewardSystem = RewardSystem;
})();
