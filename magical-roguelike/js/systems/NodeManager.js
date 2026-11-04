// Per-node entry, resolution (events, rest, relic pick) and outcome ops.
(function () {
  const MG = (window.MG = window.MG || {});

  const NodeManager = {
    /** Prepare the content of a node. Returns a descriptor consumed by GameManager. */
    enter(run, node) {
      const type = MG.NODE_TYPES[node.type];
      if (!type || !type.implemented) return { kind: 'unsupported' };
      if (type.battle) return { kind: 'battle', battle: MG.WaveManager.createBattle(run, node) };
      if (node.type === 'event') {
        // avoid repeating events within a run while possible
        const unseen = MG.EVENTS.filter((e) => !run.seenEvents.includes(e.id));
        const ev = run.rng.pick(unseen.length ? unseen : MG.EVENTS);
        run.seenEvents.push(ev.id);
        return { kind: 'event', event: ev };
      }
      if (node.type === 'rest') return { kind: 'rest', options: MG.REST_OPTIONS };
      if (node.type === 'relic') {
        const cfg = MG.NODE_REWARDS.relic;
        return { kind: 'relic', choices: MG.RewardSystem.relicChoices(run, cfg.rarity, cfg.relicChoices) };
      }
      return { kind: 'unsupported' };
    },

    requirementMet(run, choice) {
      if (!choice.require) return true;
      if (choice.require.shards && run.shards < choice.require.shards) return false;
      return true;
    },

    /** Apply outcome ops. Returns list of human-readable result lines. Never kills an ally. */
    applyOps(run, ops) {
      const lines = [];
      const P = run.party;
      for (const op of ops) {
        switch (op.op) {
          case 'healAll':
            for (const u of P.all()) P.heal(u.id, op.pct);
            break;
          case 'damageAll':
            for (const u of P.all()) if (u.hp > 0) u.hp = Math.max(1, Math.round(u.hp - u.maxHp * op.pct));
            break;
          case 'damageRandom': {
            const alive = P.all().filter((u) => u.hp > 0);
            if (alive.length) {
              const u = run.rng.pick(alive);
              u.hp = Math.max(1, Math.round(u.hp - u.maxHp * op.pct));
              lines.push(`${u.def.name} 체력 감소`);
            }
            break;
          }
          case 'shards':
            run.shards = Math.max(0, run.shards + op.n);
            break;
          case 'potions':
            run.potions += op.n;
            break;
          case 'life':
            run.life = Math.min(MG.MAP_CONFIG.startingLife, run.life + op.n);
            break;
          case 'scout':
            run.scout = op.pct;
            break;
          case 'relic': {
            const [id] = MG.RewardSystem.relicChoices(run, null, 1, { rarity: op.rarity, tag: op.tag });
            if (id) {
              run.relics.push(id);
              lines.push(`유물 「${MG.RELICS[id].name}」 획득!`);
            } else {
              run.shards += 10;
              lines.push('더 얻을 유물이 없어 별조각 +10');
            }
            break;
          }
          case 'gamble': {
            const win = run.rng.chance(op.chance);
            lines.push(win ? op.winText : op.loseText);
            lines.push(...this.applyOps(run, win ? op.win : op.lose));
            break;
          }
          default:
            break;
        }
      }
      return lines;
    },

    rest(run, optionId, targetId) {
      const P = run.party;
      if (optionId === 'rest') {
        for (const u of P.all()) P.heal(u.id, 0.35);
        return '모든 아군이 휴식을 취했다. (체력 35% 회복)';
      }
      if (optionId === 'revive') {
        const fallen = P.all().filter((u) => u.hp <= 0);
        if (fallen.length) {
          const u = (targetId && P.get(targetId).hp <= 0 && P.get(targetId)) || fallen[0];
          P.revive(u.id, 0.5);
          return `${u.def.name}이(가) 다시 일어섰다. (체력 50%)`;
        }
        const hurt = P.all().filter((u) => u.hp > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        hurt.hp = hurt.maxHp;
        return `${hurt.def.name}의 상처를 완전히 치료했다.`;
      }
      if (optionId === 'sharpen') {
        run.potions += 1;
        run.shards += 6;
        return '물약 1개와 별조각 6개를 얻었다.';
      }
      return '';
    },
  };

  MG.NodeManager = NodeManager;
})();
