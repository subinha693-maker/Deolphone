// Permanent progression: 별빛 성소 upgrades, 월광 income, ascension, codex.
// Combat code only reads run.meta (aggregated numbers) — never the save directly.
(function () {
  const MG = (window.MG = window.MG || {});

  const Meta = {
    level(id) {
      return MG.Save.get().upgrades[id] || 0;
    },
    nextCost(id) {
      const u = MG.META_INDEX[id];
      const l = this.level(id);
      return l >= u.max ? null : u.costs[l];
    },
    canBuy(id) {
      const u = MG.META_INDEX[id];
      if (!u) return { ok: false, reason: '없는 항목' };
      const cost = this.nextCost(id);
      if (cost == null) return { ok: false, reason: '최대 레벨' };
      if (u.requires && this.level(u.requires) < 1) return { ok: false, reason: `「${MG.META_INDEX[u.requires].name}」 필요` };
      if (MG.Save.get().moon < cost) return { ok: false, reason: '월광 부족' };
      return { ok: true, cost };
    },
    buy(id) {
      const chk = this.canBuy(id);
      if (!chk.ok) return chk;
      MG.Save.update((d) => {
        d.moon -= chk.cost;
        d.upgrades[id] = (d.upgrades[id] || 0) + 1;
        const u = MG.META_INDEX[id];
        if (u.unlockChar && !d.unlocks.characters.includes(u.unlockChar)) d.unlocks.characters.push(u.unlockChar);
      });
      MG.Save.flush();
      return { ok: true };
    },

    unlockedChars() {
      const d = MG.Save.get();
      const set = new Set(MG.DEFAULT_UNLOCKED.concat(d.unlocks.characters || []));
      for (const u of MG.META_TREE) if (u.unlockChar && this.level(u.id) > 0) set.add(u.unlockChar);
      return MG.CHAR_ORDER.filter((c) => set.has(c));
    },
    unlockFlags() {
      return MG.META_TREE.filter((u) => u.branch === 'unlock' && this.level(u.id) > 0).map((u) => u.id);
    },

    /** Aggregate run.meta from purchased upgrades (with caps). */
    computeRunMeta() {
      const meta = {};
      for (const u of MG.META_TREE) {
        const l = this.level(u.id);
        if (!l) continue;
        const eff = u.effect(l);
        for (const [k, v] of Object.entries(eff)) meta[k] = (meta[k] || 0) + v;
      }
      for (const [k, cap] of Object.entries(MG.META_CAPS)) if (meta[k] > cap) meta[k] = cap;
      return meta;
    },

    applyToRun(run, asc) {
      run.meta = this.computeRunMeta();
      run.unlocks = this.unlockFlags();
      run.unlockedChars = this.unlockedChars();
      run.asc = asc || 0;
      run.shards += run.meta.startShards || 0;
      run.potions += run.meta.startPotions || 0;
      run.maxLife = MG.MAP_CONFIG.startingLife + (run.meta.life || 0) - (run.asc >= 3 ? 2 : 0);
      run.life = run.maxLife;
    },

    /** Codex: first sighting of something. Counts new entries for the moonlight bonus. */
    discover(run, cat, id) {
      const d = MG.Save.get();
      const book = d.codex[cat];
      if (!book) return;
      if (!book[id]) {
        if (run) run.codexNew = (run.codexNew || 0) + 1;
        book[id] = 0;
      }
      book[id]++;
      MG.Save.scheduleFlush();
    },
    codexProgress() {
      const d = MG.Save.get().codex;
      const total = { relics: Object.keys(MG.RELICS).length, enemies: Object.keys(MG.ENEMIES).length, events: MG.EVENTS.length, characters: MG.CHAR_ORDER.length };
      const out = {};
      for (const k of Object.keys(total)) out[k] = { found: Object.keys(d[k]).filter((x) => total[k] && (MG.RELICS[x] || MG.ENEMIES[x] || MG.CHARACTERS[x] || MG.EVENTS.some((e) => e.id === x))).length, total: total[k] };
      return out;
    },

    /** Moonlight earned by a finished run, itemised. */
    moonBreakdown(run, cleared) {
      const R = MG.MOON_RULES;
      const items = [
        { label: `완료한 노드 ${run.stats.nodes} × ${R.perNode}`, v: run.stats.nodes * R.perNode },
        { label: `승리한 전투 ${run.stats.battlesWon} × ${R.perBattle}`, v: run.stats.battlesWon * R.perBattle },
        { label: `처치한 강적 ${run.stats.elites} × ${R.perElite}`, v: run.stats.elites * R.perElite },
        { label: `돌파한 심도 ${run.stats.depthsCleared || 0} × ${R.perDepth}`, v: (run.stats.depthsCleared || 0) * R.perDepth },
        { label: `남은 별조각 ${run.shards} ÷ ${R.shardsDiv}`, v: Math.floor(run.shards / R.shardsDiv) },
        { label: `도감 신규 ${run.codexNew || 0} × ${R.perCodex}`, v: (run.codexNew || 0) * R.perCodex },
      ];
      if (cleared) items.push({ label: '클리어 보너스', v: R.clearBonus });
      const base = items.reduce((a, b) => a + b.v, 0);
      const mult = 1 + R.ascMult * (run.asc || 0);
      return { items, base, mult, total: Math.floor(base * mult) };
    },

    /** Called once when a run ends. Saves moonlight, stats, ascension unlocks. */
    settle(run, cleared) {
      if (run.settled) return run.settled;
      const before = MG.META_TREE.filter((u) => this.canBuy(u.id).ok).map((u) => u.id);
      const bd = this.moonBreakdown(run, cleared);
      let ascUnlocked = null;
      MG.Save.update((d) => {
        d.moon += bd.total;
        d.stats.runs++;
        if (cleared) d.stats.clears++;
        d.stats.kills += run.stats.kills;
        d.stats.elites += run.stats.elites;
        d.stats.bestNode = Math.max(d.stats.bestNode, run.stats.nodes);
        if (cleared && run.asc >= d.ascension.unlocked && d.ascension.unlocked < MG.ASCENSION.length - 1) {
          d.ascension.unlocked = run.asc + 1;
          ascUnlocked = d.ascension.unlocked;
        }
      });
      MG.Save.flush();
      const after = MG.META_TREE.filter((u) => this.canBuy(u.id).ok).map((u) => u.id);
      const newlyAffordable = after.filter((id) => !before.includes(id));
      run.settled = Object.assign(bd, { moonNow: MG.Save.get().moon, ascUnlocked, newlyAffordable });
      return run.settled;
    },
  };

  MG.Meta = Meta;
})();
