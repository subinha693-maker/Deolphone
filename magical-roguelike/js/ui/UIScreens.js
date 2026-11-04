// Screens other than map/battle: title, party select, rewards, events, rest, shop, recruit,
// sanctuary (permanent upgrades), codex, settings, result. Mixed into UIManager.prototype.
(function () {
  const MG = (window.MG = window.MG || {});
  const $ = (id) => document.getElementById(id);

  const Screens = {
    bindScreens() {
      $('btnStart').onclick = () => this.gm.openPartySelect();
      $('btnSanctuary').onclick = () => this.gm.goto('SANCTUARY');
      $('btnCodex').onclick = () => this.gm.goto('CODEX');
      $('btnSettings').onclick = () => this.openSettings();
      $('btnCloseSettings').onclick = () => $('settingsModal').classList.add('hidden');
      $('btnRestart').onclick = () => this.gm.openPartySelect();
      $('btnToSanct').onclick = () => this.gm.goto('SANCTUARY');
      $('btnTitle').onclick = () => this.gm.toTitle();
      $('btnPartyBack').onclick = () => this.gm.toTitle();
      $('btnSanctBack').onclick = () => this.gm.toTitle();
      $('btnCodexBack').onclick = () => this.gm.toTitle();
      $('btnRecommend').onclick = () => {
        this.partyPick = this.recommendParty();
        this.renderPartySelect();
      };
      $('btnDepart').onclick = () => {
        if (!this.partyPick || !this.partyPick.length) return this.toast('최소 1명을 선택하세요');
        if (MG.requestLandscape && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) MG.requestLandscape();
        MG.Save.update((d) => (d.ascension.selected = this.ascPick || 0));
        this.gm.newRun(null, { party: this.partyPick.slice(), asc: this.ascPick || 0 });
      };
      $('btnShopLeave').onclick = () => this.gm.leaveShop();
      $('btnShopReroll').onclick = () => {
        const r = this.gm.shopReroll();
        if (r && !r.ok) this.toast(r.reason);
        else MG.Audio && MG.Audio.play('coin');
      };
    },

    // ---------------------------------------------------------------- title
    renderTitle() {
      const d = MG.Save.get();
      const warn = MG.Save.persistent ? '' : '<div class="warn">이 환경에서는 진행이 저장되지 않을 수 있어요 (설정 → 저장 내보내기로 백업하세요)</div>';
      $('titleInfo').innerHTML = `${warn}<div class="moon">월광 <b>${d.moon}</b> · 탐사 ${d.stats.runs}회 · 클리어 ${d.stats.clears}회${d.ascension.unlocked ? ` · 난이도 단계 ${d.ascension.unlocked}까지 해금` : ''}</div>`;
    },

    // ---------------------------------------------------------------- party select
    recommendParty() {
      const unlocked = MG.Meta.unlockedChars();
      const size = MG.RUN_CONFIG.startPartySize;
      const want = ['guardian', 'assault', 'caster', 'healer', 'support'];
      const out = [];
      for (const role of want) {
        const c = unlocked.find((id) => MG.CHARACTERS[id].role === role && !out.includes(id));
        if (c && out.length < size) out.push(c);
      }
      for (const id of unlocked) if (out.length < size && !out.includes(id)) out.push(id);
      return out;
    },
    renderPartySelect() {
      const d = MG.Save.get();
      const unlocked = MG.Meta.unlockedChars();
      const size = MG.RUN_CONFIG.startPartySize;
      if (!this.partyPick) {
        const last = (d.lastParty || []).filter((c) => unlocked.includes(c));
        this.partyPick = last.length ? last.slice(0, size) : this.recommendParty();
      }
      if (this.ascPick == null) this.ascPick = Math.min(d.ascension.selected || 0, d.ascension.unlocked);
      $('partyCount').textContent = `${this.partyPick.length}/${size}명 · 앞의 3명이 전장, 나머지는 대기`;
      // ascension picker
      if (d.ascension.unlocked > 0) {
        $('ascPicker').innerHTML = `난이도 <select id="ascSel">${MG.ASCENSION.slice(0, d.ascension.unlocked + 1)
          .map((a) => `<option value="${a.level}" ${a.level === this.ascPick ? 'selected' : ''}>${a.name}${a.level ? ' — ' + a.desc : ''}</option>`)
          .join('')}</select>`;
        $('ascSel').onchange = (e) => (this.ascPick = +e.target.value);
      } else $('ascPicker').innerHTML = '<span class="muted-s">첫 클리어 시 난이도 단계 해금</span>';
      const lockInfo = {};
      for (const u of MG.META_TREE) if (u.unlockChar) lockInfo[u.unlockChar] = u;
      $('partyGrid').innerHTML = MG.CHAR_ORDER.map((id) => {
        const c = MG.CHARACTERS[id];
        const locked = !unlocked.includes(id);
        const idx = this.partyPick.indexOf(id);
        if (locked) {
          const u = lockInfo[id];
          return `<div class="char-card locked"><img src="${this.portrait(id)}" class="sil"><div class="cc-name">???</div><div class="cc-sub">별빛 성소 「${this.esc(u ? u.name : '해금')}」 (월광 ${u ? u.costs[0] : '?'})</div></div>`;
        }
        const s = c.stats;
        return `<div class="char-card ${idx >= 0 ? 'picked' : ''}" data-id="${id}">${idx >= 0 ? `<span class="cc-order">${idx < 3 ? '전장 ' + (idx + 1) : '대기'}</span>` : ''}
          <img src="${this.portrait(id)}"><div class="cc-name" style="color:${c.color}">${this.esc(c.name)}</div><div class="cc-sub">${MG.ROLE_NAMES[c.role]} · ${c.attackType === 'melee' ? '근접' : '원거리'}</div>
          <div class="cc-stats">체력 ${s.hp} · 공격 ${s.atk} · 방어 ${s.def}</div>
          <div class="cc-skill"><b>${this.esc(c.skill.name)}</b> [${MG.SKILL_TYPE_NAMES[c.skill.type]} ${c.skill.cooldown}초]<br>${this.esc(MG.SkillSystem.format(c.skill.desc, c.skill))}</div></div>`;
      }).join('');
      $('partyGrid').querySelectorAll('.char-card[data-id]').forEach((el) => {
        el.onclick = () => {
          const id = el.dataset.id;
          const i = this.partyPick.indexOf(id);
          if (i >= 0) this.partyPick.splice(i, 1);
          else if (this.partyPick.length < size) this.partyPick.push(id);
          else return this.toast(`최대 ${size}명까지 선택할 수 있습니다`);
          this.renderPartySelect();
        };
      });
      $('partyPicked').innerHTML = this.partyPick.map((id, i) => `<span class="pp ${i < 3 ? 'field' : ''}"><img src="${this.portrait(id)}">${this.esc(MG.CHARACTERS[id].name)}</span>`).join('');
    },

    // ---------------------------------------------------------------- reward / relic / recruit
    relicCardHtml(id, i, extra) {
      const r = MG.RELICS[id];
      const run = this.gm.run;
      const syns = Object.values(MG.SYNERGIES).filter((s) => (s.requires.relics || []).includes(id) || (s.requires.tagCount && r.tags.includes(s.requires.tagCount.tag)));
      const synHtml = syns
        .map((s) => {
          const others = (s.requires.relics || []).filter((x) => x !== id);
          const tc = s.requires.tagCount;
          const tagPart = tc ? ` ${MG.TAG_NAMES[tc.tag]} ${MG.RelicSystem.countTag(run, tc.tag)}/${tc.count}` : '';
          const ownedAll = others.every((x) => run.relics.includes(x)) && (!tc || MG.RelicSystem.countTag(run, tc.tag) + (r.tags.includes(tc.tag) ? 1 : 0) >= tc.count);
          return `<div><b>✧ ${this.esc(s.name)}</b> ${others.length ? '— ' + others.map((x) => `<span class="${run.relics.includes(x) ? 'ok' : ''}">${this.esc(MG.RELICS[x].name)}</span>`).join(' + ') : '—'}${tagPart}${
            ownedAll && !MG.RelicSystem.hasSyn(run, s.id) ? ' <span class="ok">(획득 시 활성!)</span>' : ''
          }</div>`;
        })
        .join('');
      return `<div class="rcard ${r.rarity}" data-i="${i}"><span class="rar">${MG.RARITY[r.rarity].name}${r.rarity === 'curse' ? ' ⚠' : ''}${r.tags.length ? ' · ' + this.tagsText(r.tags) : ''}</span>
        <div class="big">${r.icon}</div><h3>${this.esc(r.name)}</h3><div class="trig">발동: ${this.esc(r.trigger)}${r.stackable ? ' · 중첩 가능' : ''}</div><div class="desc">${this.esc(r.desc).replace(/\n/g, '<br>')}</div>
        ${synHtml ? `<div class="syns">${synHtml}</div>` : ''}${extra || ''}</div>`;
    },
    modCardHtml(o, i, extra) {
      const m = MG.SKILL_MOD_INDEX[o.modId];
      const c = MG.CHARACTERS[o.charId];
      const u = this.gm.run.party.get(o.charId);
      const have = u ? u.mods.length : 0;
      return `<div class="rcard modc" data-i="${i}"><span class="rar">스킬 개조 · ${have + 1}/3</span>
        <img class="mod-pt" src="${this.portrait(o.charId)}"><h3>${this.esc(m.name)}</h3><div class="trig">${this.esc(c.name)} — ${this.esc(c.skill.name)}</div>
        <div class="desc">${this.esc(m.desc)}</div>${extra || ''}</div>`;
    },
    altCardHtml(o, i) {
      return `<div class="rcard alt" data-i="${i}"><span class="rar">${o.kind === 'heal' ? '회복' : '탐사'}</span><div class="big">${o.kind === 'heal' ? '⚕' : '🗺'}</div><h3>${this.esc(o.label)}</h3><div class="desc">${this.esc(o.desc)}</div></div>`;
    },
    optionCard(o, i) {
      if (o.kind === 'relic') return this.relicCardHtml(o.relicId, i);
      if (o.kind === 'mod') return this.modCardHtml(o, i);
      return this.altCardHtml(o, i);
    },

    renderReward() {
      const ctx = this.gm.ctx;
      const run = this.gm.run;
      $('screen-battle').classList.add('active'); // battlefield stays visible under the overlay
      $('battleHud').style.visibility = 'hidden';
      $('rewardTitle').textContent = 'NODE CLEAR — 보상 선택';
      $('rewardSub').innerHTML = `별조각 <b style="color:var(--gold)">+${ctx.rewards.shards}</b> 획득 · 보상 하나를 선택하세요${
        run.rerollsLeft > 0 ? ` <button class="tb-btn" id="btnReroll">새로고침 (${run.rerollsLeft}회 남음)</button>` : ''
      }`;
      $('rewardCards').innerHTML = ctx.rewards.options.map((o, i) => this.optionCard(o, i)).join('');
      $('rewardCards').classList.toggle('many', ctx.rewards.options.length > 5);
      $('rewardCards').querySelectorAll('.rcard').forEach((c) => {
        c.onclick = () => {
          MG.Audio && MG.Audio.play('reward_pick');
          const msg = this.gm.chooseReward(+c.dataset.i);
          if (msg) this.toast(msg);
        };
      });
      const rr = $('btnReroll');
      if (rr) rr.onclick = () => this.gm.rerollReward() && this.renderReward();
    },

    renderRelicPick() {
      const ctx = this.gm.ctx;
      $('rewardTitle').textContent = ctx.start ? '출발의 선물' : '봉인된 유물함';
      $('rewardSub').innerHTML = ctx.choices.length ? '유물 중 하나를 가져갈 수 있습니다.' : '가져갈 수 있는 유물이 없습니다. <button class="tb-btn" id="btnSkipRelic">계속</button>';
      $('rewardCards').classList.remove('many');
      $('rewardCards').innerHTML = ctx.choices.map((id, i) => this.relicCardHtml(id, i)).join('');
      $('rewardCards').querySelectorAll('.rcard').forEach((c) => {
        c.onclick = () => {
          const id = ctx.choices[+c.dataset.i];
          MG.Audio && MG.Audio.play('reward_pick');
          if (this.gm.pickRelic(id)) this.toast(`${MG.RELICS[id].name} 획득`);
        };
      });
      const sk = $('btnSkipRelic');
      if (sk) sk.onclick = () => this.gm.skipRelic();
    },

    renderRecruit() {
      const ctx = this.gm.ctx;
      $('rewardTitle').textContent = '길 잃은 마법소녀';
      $('rewardSub').innerHTML = `함께할 동료를 한 명 고르세요. (파티 ${this.gm.run.party.size()}/${MG.PartyManager.MAX_PARTY}) <button class="tb-btn" id="btnDecline">거절하고 별조각 +10</button>`;
      $('rewardCards').classList.remove('many');
      $('rewardCards').innerHTML = ctx.candidates
        .map((id, i) => {
          const c = MG.CHARACTERS[id];
          return `<div class="rcard recruit" data-i="${i}"><span class="rar">${MG.ROLE_NAMES[c.role]} · ${c.attackType === 'melee' ? '근접' : '원거리'}</span>
            <img class="mod-pt big-pt" src="${this.portrait(id)}"><h3 style="color:${c.color}">${this.esc(c.name)}</h3><div class="trig">${this.esc(c.title)}</div>
            <div class="quote">“${this.esc(MG.RECRUIT_LINES[id] || '')}”</div>
            <div class="desc"><b>${this.esc(c.skill.name)}</b>: ${this.esc(MG.SkillSystem.format(c.skill.desc, c.skill))}</div>
            <div class="trig">체력 ${c.stats.hp} · 공격 ${c.stats.atk} · 방어 ${c.stats.def}</div></div>`;
        })
        .join('');
      $('rewardCards').querySelectorAll('.rcard').forEach((c) => {
        c.onclick = () => {
          MG.Audio && MG.Audio.play('reward_pick');
          const msg = this.gm.recruit(ctx.candidates[+c.dataset.i]);
          if (msg) this.toast(msg);
        };
      });
      $('btnDecline').onclick = () => {
        const msg = this.gm.recruit(null);
        if (msg) this.toast(msg);
      };
    },

    // ---------------------------------------------------------------- event / rest
    typeText(text) {
      const el = $('eventText');
      clearInterval(this._typeT);
      let i = 0;
      el.textContent = '';
      this._typeT = setInterval(() => {
        i += 2;
        el.textContent = text.slice(0, i);
        if (i % 6 === 0) MG.Audio && MG.Audio.play('type_tick');
        if (i >= text.length) clearInterval(this._typeT);
      }, 22);
    },

    renderEvent() {
      const ctx = this.gm.ctx;
      const ev = ctx.event;
      MG.SceneArt.drawEvent($('eventCanvas'), ev.art, ctx.speaker, this.gm.run.party);
      $('eventKicker').textContent = 'EVENT · 사건';
      $('eventTitle').textContent = ev.title;
      $('eventSpeaker').textContent = ctx.speaker;
      this.typeText(ev.text);
      $('eventChoices').innerHTML = ev.choices
        .map((c, i) => {
          const ok = MG.NodeManager.requirementMet(this.gm.run, c);
          return `<button class="choice-btn" data-i="${i}" ${ok ? '' : 'disabled'}><span>${this.esc(c.label)}${ok ? '' : `<small class="req">${MG.NodeManager.requirementText(c)}</small>`}</span></button>`;
        })
        .join('');
      $('eventChoices').querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const res = this.gm.chooseEvent(+b.dataset.i);
          if (res) this.showResolved(res.text);
        };
      });
    },

    renderRest() {
      const P = this.gm.run.party;
      MG.SceneArt.drawEvent($('eventCanvas'), 'rest', '아모레', P);
      $('eventKicker').textContent = 'REST · 휴식';
      $('eventTitle').textContent = '달빛 아래의 야영지';
      $('eventSpeaker').textContent = P.has('amore') ? '아모레' : (P.fieldUnits()[0] || P.all()[0]).def.name;
      const fallen = P.all().filter((u) => u.hp <= 0);
      this.typeText(`잠깐 쉬어 가자. 다들 많이 지쳤지?${fallen.length ? `\n(쓰러진 동료: ${fallen.map((u) => u.def.name).join(', ')})` : ''}`);
      const restPct = Math.round(MG.NodeManager.restHealPct(this.gm.run) * 100);
      const opts = [];
      MG.REST_OPTIONS.forEach((o) => {
        if (o.id === 'revive' && fallen.length > 1) {
          for (const f of fallen) opts.push({ id: 'revive', target: f.id, label: `${f.def.name}을(를) 간호한다`, desc: '체력 50%로 부활' });
        } else opts.push({ id: o.id, label: o.label, desc: o.desc.replace('{rest}', restPct) });
      });
      $('eventChoices').innerHTML = opts.map((o, i) => `<button class="choice-btn" data-i="${i}"><span>${this.esc(o.label)}<small>${this.esc(o.desc)}</small></span></button>`).join('');
      $('eventChoices').querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const o = opts[+b.dataset.i];
          const res = this.gm.chooseRest(o.id, o.target);
          if (res) this.showResolved(res.text);
        };
      });
    },

    showResolved(text) {
      this.typeText(text);
      const fu = this.gm.ctx.followUp;
      const label = fu ? (fu.kind === 'relic' ? '유물 고르기' : '동료 만나기') : '계속';
      $('eventChoices').innerHTML = `<button class="choice-btn dark" id="btnContinue"><span>${label}</span></button>`;
      $('btnContinue').onclick = () => this.gm.finishNode();
    },

    // ---------------------------------------------------------------- shop
    renderShop() {
      const run = this.gm.run;
      const ctx = this.gm.ctx;
      if (!ctx || ctx.kind !== 'shop') return;
      const node = ctx.node;
      MG.SceneArt.drawShop($('shopCanvas'));
      $('shopRes').innerHTML = this.resourcesHtml();
      this.bindRelicButton();
      const mult = MG.ShopSystem.priceMult(run);
      $('shopNote').textContent = mult < 1 ? `할인 적용 중 (-${Math.round((1 - mult) * 100)}%)` : mult > 1 ? `가격 +${Math.round((mult - 1) * 100)}%` : '';
      $('shopNote').hidden = mult === 1;
      $('shopItems').innerHTML = node.shop.items
        .map((it, i) => {
          const price = MG.ShopSystem.itemPrice(run, it);
          const chk = MG.ShopSystem.canBuy(run, it);
          const tag = `<div class="price ${chk.ok ? '' : 'no'}">${it.sold ? 'SOLD' : `✦ ${price}`}</div>`;
          let card;
          if (it.kind === 'relic') card = this.relicCardHtml(it.relicId, i, tag);
          else if (it.kind === 'mod') card = this.modCardHtml(it, i, tag);
          else if (it.kind === 'potion') card = `<div class="rcard alt" data-i="${i}"><span class="rar">소모품</span><div class="big">⚱</div><h3>물약</h3><div class="desc">탐사 맵에서 아군 1명 체력 회복.</div>${tag}</div>`;
          else card = `<div class="rcard alt" data-i="${i}"><span class="rar">회복</span><div class="big">⚕</div><h3>치유의 성수</h3><div class="desc">모든 아군 체력 ${Math.round(it.pct * 100)}% 회복.</div>${tag}</div>`;
          return `<div class="shop-card ${it.sold ? 'sold' : ''} ${chk.ok ? '' : 'cant'}" data-i="${i}">${card}</div>`;
        })
        .join('');
      $('shopItems').querySelectorAll('.shop-card').forEach((c) => {
        c.onclick = () => {
          const r = this.gm.shopBuy(+c.dataset.i);
          if (!r.ok) this.toast(r.reason);
          else {
            MG.Audio && MG.Audio.play('coin');
            this.toast(r.msg);
          }
        };
      });
      $('btnShopReroll').textContent = `새로고침 ✦ ${MG.ShopSystem.rerollCost(run, node)}`;
    },

    // ---------------------------------------------------------------- sanctuary
    renderSanctuary() {
      const d = MG.Save.get();
      this.sanctTab = this.sanctTab || 'explore';
      $('moonTag').innerHTML = `월광 ${d.moon}`;
      $('sanctTabs').innerHTML = Object.entries(MG.META_BRANCHES)
        .map(([k, v]) => `<button class="tb-btn ${k === this.sanctTab ? 'on' : ''}" data-tab="${k}">${v}</button>`)
        .join('');
      $('sanctTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => ((this.sanctTab = b.dataset.tab), this.renderSanctuary())));
      $('sanctBody').innerHTML = MG.META_TREE.filter((u) => u.branch === this.sanctTab)
        .map((u) => {
          const l = MG.Meta.level(u.id);
          const cost = MG.Meta.nextCost(u.id);
          const chk = MG.Meta.canBuy(u.id);
          const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
          const req = u.requires ? `<div class="req-s ${MG.Meta.level(u.requires) ? 'ok' : ''}">선행: ${this.esc(MG.META_INDEX[u.requires].name)}</div>` : '';
          return `<div class="up-card ${l >= u.max ? 'max' : ''}"><div class="up-name">${this.esc(u.name)}</div><div class="up-pips">${pips}</div>
            <div class="up-desc">${this.esc(u.desc)}</div>${req}
            <button class="tb-btn up-buy" data-id="${u.id}" ${chk.ok ? '' : 'disabled'}>${cost == null ? '최대' : `월광 ${cost}${chk.ok ? '' : ' · ' + chk.reason}`}</button></div>`;
        })
        .join('');
      $('sanctBody').querySelectorAll('.up-buy').forEach((b) => {
        b.onclick = (ev) => {
          const btn = ev.currentTarget;
          if (!btn.dataset.armed) {
            btn.dataset.armed = '1';
            btn.textContent = '한 번 더 눌러 구매';
            setTimeout(() => btn.isConnected && this.renderSanctuary(), 2500);
            return;
          }
          const r = MG.Meta.buy(btn.dataset.id);
          if (r.ok) {
            MG.Audio && MG.Audio.play('coin');
            this.toast(`${MG.META_INDEX[btn.dataset.id].name} 강화 완료`);
          } else this.toast(r.reason);
          this.renderSanctuary();
        };
      });
    },

    // ---------------------------------------------------------------- codex
    renderCodex() {
      const book = MG.Save.get().codex;
      this.codexTab = this.codexTab || 'characters';
      const tabs = { characters: '마법소녀', relics: '유물', enemies: '적', events: '사건' };
      const prog = MG.Meta.codexProgress();
      const tot = Object.values(prog).reduce((a, p) => ({ f: a.f + p.found, t: a.t + p.total }), { f: 0, t: 0 });
      $('codexTag').textContent = `달성도 ${tot.f}/${tot.t} (${Math.round((tot.f / tot.t) * 100)}%)`;
      $('codexTabs').innerHTML = Object.entries(tabs)
        .map(([k, v]) => `<button class="tb-btn ${k === this.codexTab ? 'on' : ''}" data-tab="${k}">${v} ${prog[k].found}/${prog[k].total}</button>`)
        .join('');
      $('codexTabs').querySelectorAll('button').forEach((b) => (b.onclick = () => ((this.codexTab = b.dataset.tab), this.renderCodex())));
      let items = [];
      if (this.codexTab === 'characters')
        items = MG.CHAR_ORDER.map((id) => {
          const c = MG.CHARACTERS[id];
          return book.characters[id] != null
            ? `<div class="cx found"><img src="${this.portrait(id)}"><b style="color:${c.color}">${this.esc(c.name)}</b><span>${this.esc(c.title)}</span><small>${MG.ROLE_NAMES[c.role]} · 동행 ${book.characters[id]}회</small></div>`
            : `<div class="cx"><img class="sil" src="${this.portrait(id)}"><b>???</b></div>`;
        });
      if (this.codexTab === 'relics')
        items = Object.values(MG.RELICS).map((r) =>
          book.relics[r.id] != null
            ? `<div class="cx found ${r.rarity}" data-tip="${this.esc(this.relicTip(r.id))}"><div class="cx-ic">${r.icon}</div><b>${this.esc(r.name)}</b><small>${MG.RARITY[r.rarity].name} · 획득 ${book.relics[r.id]}회</small></div>`
            : `<div class="cx"><div class="cx-ic">?</div><b>???</b><small>${MG.RARITY[r.rarity].name}</small></div>`
        );
      if (this.codexTab === 'enemies')
        items = Object.values(MG.ENEMIES).map((e) =>
          book.enemies[e.id] != null
            ? `<div class="cx found"><img class="px" src="${MG.Assets.enemyIcon(e.id)}"><b>${this.esc(e.name)}</b><small>체력 ${e.hp} · 공격 ${e.atk}${e.boss ? ' · 보스' : e.elite ? ' · 강적' : ''} · 조우 ${book.enemies[e.id]}</small></div>`
            : `<div class="cx"><img class="px sil" src="${MG.Assets.enemyIcon(e.id)}"><b>???</b></div>`
        );
      if (this.codexTab === 'events')
        items = MG.EVENTS.map((ev) =>
          book.events[ev.id] != null
            ? `<div class="cx found wide"><b>${this.esc(ev.title)}</b><small>${this.esc(ev.text)}</small></div>`
            : `<div class="cx wide"><b>???</b><small>아직 만나지 못한 사건</small></div>`
        );
      $('codexBody').innerHTML = items.join('');
    },

    // ---------------------------------------------------------------- settings
    openSettings() {
      $('settingsModal').classList.remove('hidden');
      this.renderSettings();
    },
    renderSettings() {
      const s = MG.Save.get().settings;
      const slider = (k, label) => `<label class="set-row">${label}<input type="range" min="0" max="1" step="0.05" id="set_${k}" value="${s[k]}"><span>${Math.round(s[k] * 100)}</span></label>`;
      $('settingsBody').innerHTML = `${slider('master', '마스터')}${slider('sfx', '효과음')}${slider('bgm', '배경음')}
        <label class="set-row">음소거<input type="checkbox" id="set_muted" ${s.muted ? 'checked' : ''}></label>
        <h4>저장</h4><div class="muted-s">${MG.Save.persistent ? '이 브라우저에 자동 저장됩니다.' : '이 환경에서는 자동 저장이 되지 않을 수 있습니다. 아래 문자열을 복사해 두세요.'}</div>
        <textarea id="saveText" rows="3" placeholder="저장 문자열을 붙여넣고 불러오기"></textarea>
        <div class="set-btns"><button class="tb-btn" id="btnExport">내보내기</button><button class="tb-btn" id="btnImport">불러오기</button><button class="tb-btn" id="btnResetSave">저장 초기화</button></div>`;
      for (const k of ['master', 'sfx', 'bgm']) {
        $('set_' + k).oninput = (e) => {
          MG.Save.update((d) => (d.settings[k] = +e.target.value));
          e.target.nextElementSibling.textContent = Math.round(e.target.value * 100);
          MG.Audio && MG.Audio.applySettings();
        };
      }
      $('set_muted').onchange = (e) => {
        MG.Save.update((d) => (d.settings.muted = e.target.checked));
        MG.Audio && MG.Audio.applySettings();
      };
      $('btnExport').onclick = () => {
        const str = MG.Save.exportString();
        $('saveText').value = str;
        $('saveText').select();
        try {
          navigator.clipboard.writeText(str).then(() => this.toast('복사했습니다'), () => this.toast('문자열을 선택해 두었습니다. 직접 복사하세요'));
        } catch (e) {
          this.toast('문자열을 선택해 두었습니다. 직접 복사하세요');
        }
      };
      $('btnImport').onclick = () => {
        const r = MG.Save.importString($('saveText').value);
        this.toast(r.ok ? '불러왔습니다' : r.reason);
        if (r.ok) {
          this.renderSettings();
          this.renderTitle();
          MG.Audio && MG.Audio.applySettings();
        }
      };
      $('btnResetSave').onclick = (ev) => {
        const b = ev.currentTarget;
        if (!b.dataset.armed) {
          b.dataset.armed = '1';
          b.textContent = '한 번 더 눌러 초기화';
          b.classList.add('on');
          return;
        }
        MG.Save.reset();
        this.partyPick = null;
        this.toast('저장을 초기화했습니다');
        this.renderSettings();
        this.renderTitle();
      };
    },

    // ---------------------------------------------------------------- result
    renderResult(win) {
      const run = this.gm.run;
      const st = run.settled || MG.Meta.settle(run, win);
      $('resultTitle').textContent = win ? '탐사 성공' : '탐사 실패';
      $('resultTitle').style.color = win ? '#ffe9f5' : '#ff6b8a';
      $('resultSub').textContent = win ? `「${MG.RUN_CONFIG.regionName}」를 정화했습니다.` : '마법소녀들은 후퇴했습니다… 월광을 모아 별빛 성소에서 강해지세요.';
      $('resultStats').innerHTML = `완료한 노드 ${run.stats.nodes} · 전투 승리 ${run.stats.battlesWon} · 처치한 적 ${run.stats.kills} · 강적 ${run.stats.elites}<br>
        유물 ${run.relics.length}개 · 시너지 ${MG.RelicSystem.synergyStatus(run).filter((s) => s.active).length}개 · 동료 ${run.party.size()}명${run.asc ? ` · ${MG.ASCENSION[run.asc].name}` : ''} <span class="muted-s">(시드 ${run.seed})</span>`;
      $('resultMoon').innerHTML = `<div class="moon-box"><div class="mb-head">월광 획득 <b>+${st.total}</b>${st.mult > 1 ? ` <small>(난이도 ×${st.mult.toFixed(1)})</small>` : ''} · 보유 ${st.moonNow}</div>
        ${st.items.map((it) => `<div class="mb-row"><span>${this.esc(it.label)}</span><b>+${it.v}</b></div>`).join('')}
        ${st.ascUnlocked ? `<div class="mb-new">난이도 단계 ${st.ascUnlocked} 해금!</div>` : ''}
        ${st.newlyAffordable.length ? `<div class="mb-new">별빛 성소에서 새로 구매 가능: ${st.newlyAffordable.slice(0, 5).map((id) => this.esc(MG.META_INDEX[id].name)).join(', ')}${st.newlyAffordable.length > 5 ? ` 외 ${st.newlyAffordable.length - 5}개` : ''}</div>` : ''}</div>`;
    },
  };

  Object.assign(MG.UIManager.prototype, Screens);
})();
