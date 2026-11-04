// Shop node: stock generation (seeded), prices, purchases, rerolls.
(function () {
  const MG = (window.MG = window.MG || {});

  const ShopSystem = {
    priceMult(run) {
      let m = 1;
      if (run.meta && run.meta.discount) m *= 1 - run.meta.discount;
      if ((run.asc || 0) >= 4) m *= 1.2;
      if (run.shopDiscountActive) m *= 1 - run.shopDiscountActive;
      return m;
    },
    price(run, base) {
      return Math.max(1, Math.round(base * this.priceMult(run)));
    },

    /** Build (or rebuild) the stock of a shop node. Stored on the node so it persists. */
    stock(run, node, reroll) {
      const cfg = MG.SHOP_CONFIG;
      const items = [];
      const P = (range) => run.rng.int(range[0], range[1]);
      for (const id of MG.RewardSystem.relicChoices(run, cfg.rarity, cfg.relics)) {
        items.push({ kind: 'relic', relicId: id, base: P(cfg.price[MG.RELICS[id].rarity]) });
      }
      for (const m of MG.RewardSystem.modChoices(run, cfg.mods)) items.push({ kind: 'mod', charId: m.charId, modId: m.modId, base: P(cfg.price.mod) });
      if (!reroll || !node.shop) {
        items.push({ kind: 'potion', base: cfg.price.potion });
        items.push({ kind: 'elixir', base: cfg.price.elixir, pct: cfg.elixirPct });
      } else {
        // keep the fixed goods (and whether they were bought) across rerolls
        for (const it of node.shop.items) if (it.kind === 'potion' || it.kind === 'elixir') items.push(it);
      }
      const rerolls = node.shop ? node.shop.rerolls + (reroll ? 1 : 0) : 0;
      node.shop = { items, rerolls };
      return node.shop;
    },

    open(run, node) {
      // a pending event discount applies to this visit and is consumed
      run.shopDiscountActive = run.shopDiscount || 0;
      run.shopDiscount = 0;
      return node.shop || this.stock(run, node, false);
    },

    rerollCost(run, node) {
      return this.price(run, MG.SHOP_CONFIG.rerollBase + MG.SHOP_CONFIG.rerollStep * (node.shop ? node.shop.rerolls : 0));
    },
    reroll(run, node) {
      const cost = this.rerollCost(run, node);
      if (run.shards < cost) return { ok: false, reason: '별조각이 부족합니다' };
      run.shards -= cost;
      this.stock(run, node, true);
      return { ok: true };
    },

    itemPrice(run, it) {
      return this.price(run, it.base);
    },
    canBuy(run, it) {
      if (it.sold) return { ok: false, reason: '판매 완료' };
      if (run.shards < this.itemPrice(run, it)) return { ok: false, reason: '별조각 부족' };
      if (it.kind === 'mod' && !run.party.has(it.charId)) return { ok: false, reason: '파티에 없는 동료' };
      return { ok: true };
    },
    buy(run, node, index) {
      const it = node.shop && node.shop.items[index];
      if (!it) return { ok: false, reason: '없는 상품' };
      const chk = this.canBuy(run, it);
      if (!chk.ok) return chk;
      run.shards -= this.itemPrice(run, it);
      it.sold = true;
      let msg = '';
      if (it.kind === 'relic' || it.kind === 'mod') msg = MG.RewardSystem.grant(run, it);
      else if (it.kind === 'potion') {
        run.potions++;
        msg = '물약 +1';
      } else if (it.kind === 'elixir') {
        for (const u of run.party.all()) run.party.heal(u.id, it.pct);
        msg = '모든 아군 체력 25% 회복';
      }
      return { ok: true, msg };
    },
  };

  MG.ShopSystem = ShopSystem;
})();
