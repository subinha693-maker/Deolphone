// Per-node entry, resolution (events, rest, relic pick, shop, recruit) and outcome ops.
(function () {
  const MG = (window.MG = window.MG || {});
  const NAME_TO_CHAR = () => {
    const m = {};
    for (const c of Object.values(MG.CHARACTERS)) m[c.name] = c.id;
    return m;
  };

  const NodeManager = {
    /** Characters that can still join this run (unlocked, not in party). */
    recruitPool(run) {
      return MG.CHAR_ORDER.filter((id) => (run.unlockedChars || MG.DEFAULT_UNLOCKED).includes(id) && !run.party.has(id));
    },
    canRecruit(run) {
      return run.party.size() < MG.PartyManager.MAX_PARTY && this.recruitPool(run).length > 0;
    },

    /** Prepare the content of a node. Returns a descriptor consumed by GameManager. */
    enter(run, node) {
      const type = MG.NODE_TYPES[node.type];
      if (!type || !type.implemented) return { kind: 'unsupported' };
      if (type.battle) return { kind: 'battle', battle: MG.WaveManager.createBattle(run, node) };
      if (node.type === 'recruit') {
        if (!this.canRecruit(run)) return this.enterEvent(run, node);
        return { kind: 'recruit', candidates: this.recruitCandidates(run) };
      }
      if (node.type === 'event') return this.enterEvent(run, node);
      if (node.type === 'rest') return { kind: 'rest', options: MG.REST_OPTIONS };
      if (node.type === 'relic') {
        const cfg = MG.NODE_REWARDS.relic;
        return { kind: 'relic', choices: MG.RewardSystem.relicChoices(run, cfg.rarity, cfg.relicChoices + ((run.meta && run.meta.choice) || 0)) };
      }
      if (node.type === 'shop') return { kind: 'shop', node, shop: MG.ShopSystem.open(run, node) };
      return { kind: 'unsupported' };
    },

    recruitCandidates(run) {
      const n = 2 + ((run.meta && run.meta.recruitCandidates) || 0);
      return run.rng.shuffle(this.recruitPool(run)).slice(0, n);
    },

    eventAllowed(run, ev, col) {
      const w = ev.when || {};
      if (w.minCol != null && col < w.minCol) return false;
      if (w.maxCol != null && col > w.maxCol) return false;
      if (w.flag && !run.flags[w.flag]) return false;
      if (w.notFlag && run.flags[w.notFlag]) return false;
      if (w.party && !run.party.has(w.party)) return false;
      if (w.minRelics && run.relics.length < w.minRelics) return false;
      if (w.unlock && !(run.unlocks || []).includes(w.unlock)) return false;
      return true;
    },

    pickEvent(run, col) {
      const names = NAME_TO_CHAR();
      let pool = MG.EVENTS.filter((e) => this.eventAllowed(run, e, col));
      const unseen = pool.filter((e) => !run.seenEvents.includes(e.id));
      if (unseen.length) pool = unseen;
      if (!pool.length) pool = MG.EVENTS.filter((e) => !e.when);
      const entries = pool.map((e) => {
        let w = (e.when && e.when.weight) || 1;
        const sp = names[e.speaker];
        if (sp && run.party.has(sp)) w *= 2;
        return { v: e, w };
      });
      return run.rng.weighted(entries);
    },

    enterEvent(run, node) {
      const ev = this.pickEvent(run, node.col);
      run.seenEvents.push(ev.id);
      MG.Meta && MG.Meta.discover(run, 'events', ev.id);
      // speaker substitution: an absent party member is voiced by someone present
      const names = NAME_TO_CHAR();
      let speaker = ev.speaker;
      const sp = names[speaker];
      if (sp && !run.party.has(sp)) {
        const sub = run.party.fieldUnits()[0] || run.party.all()[0];
        speaker = sub.def.name;
      }
      return { kind: 'event', event: ev, speaker };
    },

    requirementMet(run, choice) {
      const r = choice.require;
      if (!r) return true;
      if (r.shards && run.shards < r.shards) return false;
      if (r.relics && run.relics.length < r.relics) return false;
      if (r.potions && run.potions < r.potions) return false;
      if (r.flag && !run.flags[r.flag]) return false;
      if (r.notFlag && run.flags[r.notFlag]) return false;
      if (r.party && !run.party.has(r.party)) return false;
      return true;
    },
    requirementText(choice) {
      const r = choice.require || {};
      if (r.shards) return '별조각 부족';
      if (r.relics) return `유물 ${r.relics}개 이상 필요`;
      if (r.potions) return '물약 부족';
      if (r.party) return `${MG.CHARACTERS[r.party].name} 필요`;
      return '조건 미충족';
    },

    /**
     * Apply outcome ops. Returns human-readable result lines. Never kills an ally.
     * ctx.followUp may be set (relic pick / recruit screen after the event).
     */
    applyOps(run, ops, ctx) {
      const lines = [];
      const P = run.party;
      const c = ctx || {};
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
              lines.push(`${u.def.name} 체력 -${Math.round(op.pct * 100)}%`);
            }
            break;
          }
          case 'shards':
            run.shards = Math.max(0, run.shards + op.n);
            break;
          case 'potions':
            run.potions = Math.max(0, run.potions + op.n);
            break;
          case 'life':
            run.life = Math.min(run.maxLife, run.life + op.n);
            lines.push(`공유 생명 +${op.n}`);
            break;
          case 'scout':
            run.scout = op.pct;
            if (op.reveal) MG.ExplorationManager.scoutNext(run, op.reveal);
            break;
          case 'ambush':
            run.scout = (run.scout || 0) - op.pct;
            break;
          case 'relic': {
            const [id] = MG.RewardSystem.relicChoices(run, null, 1, { rarity: op.rarity, tag: op.tag });
            if (id) {
              run.relics.push(id);
              MG.Meta && MG.Meta.discover(run, 'relics', id);
              lines.push(`유물 「${MG.RELICS[id].name}」 획득!`);
            } else {
              run.shards += 10;
              lines.push('더 얻을 유물이 없어 별조각 +10');
            }
            break;
          }
          case 'relicChoice':
            c.followUp = { kind: 'relic', choices: MG.RewardSystem.relicChoices(run, null, op.n, { rarity: op.rarity }) };
            lines.push('유물을 하나 고를 수 있다.');
            break;
          case 'gamble': {
            const win = run.rng.chance(op.chance);
            const t = win ? op.winText : op.loseText;
            if (t) lines.push(t);
            lines.push(...this.applyOps(run, win ? op.win : op.lose, c));
            break;
          }
          case 'mod': {
            let pool = MG.RewardSystem.modPool(run);
            if (op.unit && op.unit !== 'random') pool = pool.filter((m) => m.charId === op.unit);
            if (pool.length) {
              const m = run.rng.pick(pool);
              lines.push(MG.RewardSystem.grant(run, { kind: 'mod', charId: m.charId, modId: m.modId }));
            } else {
              run.shards += 10;
              lines.push('더 익힐 개조가 없어 별조각 +10');
            }
            break;
          }
          case 'removeCurse': {
            const curses = run.relics.filter((r) => MG.RELICS[r].rarity === 'curse');
            if (curses.length) {
              const id = run.rng.pick(curses);
              run.relics.splice(run.relics.indexOf(id), 1);
              lines.push(`저주 유물 「${MG.RELICS[id].name}」이(가) 정화되었다.`);
            } else lines.push(...this.applyOps(run, op.fallback || [], c), '정화할 저주가 없어 대신 몸을 추슬렀다.');
            break;
          }
          case 'sacrificeRelic': {
            if (run.relics.length) {
              const i = run.rng.int(0, run.relics.length - 1);
              const id = run.relics.splice(i, 1)[0];
              lines.push(`유물 「${MG.RELICS[id].name}」을(를) 바쳤다.`);
            }
            break;
          }
          case 'runBonus':
            run.bonus[op.stat] = (run.bonus[op.stat] || 0) + op.pct;
            if (op.stat === 'hp') P.recalcAll();
            break;
          case 'nextBattles':
            run.nextBattles.push({ n: op.n, stat: op.stat, pct: op.pct });
            break;
          case 'flag':
            run.flags[op.set] = true;
            break;
          case 'discount':
            run.shopDiscount = Math.max(run.shopDiscount || 0, op.pct);
            break;
          case 'recruit':
            if (this.canRecruit(run)) c.followUp = { kind: 'recruit', candidates: this.recruitCandidates(run) };
            break;
          case 'reviveOne': {
            const fallen = P.all().filter((u) => u.hp <= 0);
            if (fallen.length) {
              const u = fallen[0];
              P.revive(u.id, op.pct);
              lines.push(`${u.def.name}이(가) 다시 일어섰다. (체력 ${Math.round(op.pct * 100)}%)`);
            } else lines.push(...this.applyOps(run, op.fallback || [], c), '쓰러진 동료가 없어 모두가 기운을 차렸다. (전체 체력 회복)');
            break;
          }
          case 'wish': {
            run.shards = Math.max(0, run.shards - op.amount);
            // better outcomes with bigger offerings
            const tiers = { 5: [0.5, 0.35, 0.15, 0], 12: [0.2, 0.4, 0.3, 0.1], 20: [0.05, 0.25, 0.4, 0.3] }[op.amount] || [1, 0, 0, 0];
            const r = run.rng.weighted(tiers.map((w, i) => ({ v: i, w })));
            if (r === 0) {
              lines.push('우물이 별조각 일부를 돌려주었다.');
              run.shards += Math.round(op.amount * 0.6);
            } else if (r === 1) {
              lines.push('우물이 별조각을 두 배로 돌려주었다!');
              run.shards += op.amount * 2;
            } else if (r === 2) lines.push(...this.applyOps(run, [{ op: 'relic', rarity: 'any' }], c));
            else lines.push(...this.applyOps(run, [{ op: 'mod', unit: 'random' }], c));
            break;
          }
          case 'allShards': {
            const bet = run.shards;
            if (run.rng.chance(op.chance)) {
              run.shards = Math.floor(bet * op.mult);
              lines.push(`대박! 별조각 ${bet} → ${run.shards}`);
            } else {
              run.shards = 0;
              lines.push('전부 잃었다…');
            }
            break;
          }
          default:
            break;
        }
      }
      return lines;
    },

    restHealPct(run) {
      return 0.35 + ((run.meta && run.meta.restBonus) || 0);
    },

    rest(run, optionId, targetId) {
      const P = run.party;
      if (optionId === 'rest') {
        const pct = this.restHealPct(run);
        for (const u of P.all()) P.heal(u.id, pct);
        return `모든 아군이 휴식을 취했다. (체력 ${Math.round(pct * 100)}% 회복)`;
      }
      if (optionId === 'revive') {
        const fallen = P.all().filter((u) => u.hp <= 0);
        if (fallen.length) {
          const u = (targetId && P.get(targetId) && P.get(targetId).hp <= 0 && P.get(targetId)) || fallen[0];
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
