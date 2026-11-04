// DOM screens and HUD (core: routing, tooltips, map, battle HUD, relic drawer).
// The other screens live in UIScreens.js as a prototype mixin.
(function () {
  const MG = (window.MG = window.MG || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SLOT_LABEL = { front: '전열', back: '후열' };
  const LANE_LABEL = ['상단', '하단'];
  const SKILL_KEYS = { '0-front': 'Q', '0-back': 'W', '1-front': 'E', '1-back': 'R' };
  const stars = (d) => '★'.repeat(Math.min(5, Math.ceil(d / 1.2)));

  const SCREEN_OF = {
    TITLE: 'screen-title', PARTY_SELECT: 'screen-party', MAP: 'screen-map', BATTLE: 'screen-battle', REWARD: 'screen-reward',
    RELIC: 'screen-reward', RECRUIT: 'screen-reward', EVENT: 'screen-event', REST: 'screen-event', SHOP: 'screen-shop',
    SANCTUARY: 'screen-sanctuary', CODEX: 'screen-codex', RUN_FAILED: 'screen-result', RUN_CLEARED: 'screen-result',
  };

  class UIManager {
    constructor(gm, renderer) {
      this.gm = gm;
      this.renderer = renderer;
      this.sel = null; // {type:'bench', id} | {type:'slot', key}
      this.pickedNode = null;
      this.hudBuiltFor = null;
      this.lastHud = 0;
      gm.bus.on('state', ({ state }) => this.onState(state));
      gm.bus.on('run', () => this.refreshRunViews());
      this.bindStatic();
      this.bindScreens();
    }

    // ---------------------------------------------------------------- helpers
    esc(s) {
      return esc(s);
    }
    portrait(id) {
      return MG.Assets.portraits[id];
    }

    show(id) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
      $('battleCanvas').style.display = id === 'screen-battle' || (id === 'screen-reward' && this.gm.state === 'REWARD') ? 'block' : 'none';
    }

    onState(state) {
      this.sel = null;
      this.hideTip();
      $('battleHud').style.visibility = '';
      if (MG.Audio) {
        MG.Audio.setDuck(false);
        const track = MG.Audio.bgmForState(state, this.gm);
        if (track) MG.Audio.playBgm(track);
      }
      if (SCREEN_OF[state]) this.show(SCREEN_OF[state]);
      switch (state) {
        case 'TITLE':
          this.renderTitle();
          break;
        case 'PARTY_SELECT':
          this.renderPartySelect();
          break;
        case 'MAP':
          this.pickedNode = null;
          this.renderMap();
          break;
        case 'BATTLE':
          this.buildBattleHud();
          break;
        case 'REWARD':
          this.renderReward();
          break;
        case 'RELIC':
          this.renderRelicPick();
          break;
        case 'RECRUIT':
          this.renderRecruit();
          break;
        case 'EVENT':
          this.renderEvent();
          break;
        case 'REST':
          this.renderRest();
          break;
        case 'SHOP':
          this.renderShop();
          break;
        case 'SANCTUARY':
          this.renderSanctuary();
          break;
        case 'CODEX':
          this.renderCodex();
          break;
        case 'RUN_FAILED':
        case 'RUN_CLEARED':
          this.renderResult(state === 'RUN_CLEARED');
          break;
        default:
          break;
      }
    }

    refreshRunViews() {
      if (this.gm.state === 'MAP') this.renderMap();
      if (this.gm.state === 'SHOP') this.renderShop();
      if (!$('relicDrawer').classList.contains('hidden')) this.renderDrawer();
    }

    bindStatic() {
      $('btnCloseDrawer').onclick = () => $('relicDrawer').classList.add('hidden');
      document.addEventListener('mousemove', (e) => this.moveTip(e));
      document.addEventListener('keydown', (e) => this.onKey(e));
      document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('[data-tip]');
        if (el) this.showTip(el.getAttribute('data-tip'), e);
        else this.hideTip();
      });
      // UI sounds + audio unlock on the first gesture
      document.addEventListener('pointerdown', (e) => {
        if (MG.Audio) MG.Audio.unlock();
        if (e.target.closest('button, .rcard, .node.selectable, .pcard, .ucard, .shop-card, .char-card')) MG.Audio && MG.Audio.play('ui_click');
      });
    }

    onKey(e) {
      const gm = this.gm;
      if (e.key === 'Escape') {
        this.sel = null;
        $('relicDrawer').classList.add('hidden');
        $('settingsModal').classList.add('hidden');
        return;
      }
      if (gm.state !== 'BATTLE') return;
      if (e.code === 'Space') {
        e.preventDefault();
        gm.paused = !gm.paused;
        MG.Audio && MG.Audio.setDuck(gm.paused);
        return;
      }
      const key = Object.keys(SKILL_KEYS).find((k) => SKILL_KEYS[k] === e.key.toUpperCase());
      if (key) {
        const id = gm.battle.party.slots[key];
        if (id) this.castSkill(id);
      }
    }

    toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.remove('hidden');
      MG.Audio && MG.Audio.play('toast');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.add('hidden'), 1800);
    }

    // tooltips (stage may be rotated 90° on portrait screens)
    showTip(html, e) {
      const t = $('tooltip');
      t.innerHTML = html;
      t.classList.remove('hidden');
      this.moveTip(e);
    }
    moveTip(e) {
      const t = $('tooltip');
      if (t.classList.contains('hidden')) return;
      const r = $('stage').getBoundingClientRect();
      const v = MG.view || { rotate: false };
      let x;
      let y;
      if (v.rotate) {
        const s = r.height / 1280;
        x = (e.clientY - r.top) / s + 16;
        y = (r.right - e.clientX) / s + 16;
      } else {
        const s = r.width / 1280;
        x = (e.clientX - r.left) / s + 16;
        y = (e.clientY - r.top) / s + 16;
      }
      if (x + 310 > 1280) x -= 330;
      if (y + t.offsetHeight > 710) y = 710 - t.offsetHeight;
      t.style.left = x + 'px';
      t.style.top = y + 'px';
    }
    hideTip() {
      $('tooltip').classList.add('hidden');
    }

    tagsText(tags) {
      return (tags || []).map((t) => MG.TAG_NAMES[t] || t).join(' · ');
    }
    relicTip(id) {
      const r = MG.RELICS[id];
      const rar = MG.RARITY[r.rarity];
      const syns = Object.values(MG.SYNERGIES).filter((s) => (s.requires.relics || []).includes(id) || (s.requires.tagCount && r.tags.includes(s.requires.tagCount.tag)));
      return `<h4>${r.icon} ${esc(r.name)}</h4><div class="muted">${rar.name}${r.tags.length ? ' · ' + this.tagsText(r.tags) : ''}${r.stackable ? ' · 중첩 가능' : ''} · 발동: ${esc(r.trigger)}</div>${esc(r.desc).replace(/\n/g, '<br>')}${
        syns.length ? `<div class="muted" style="margin-top:4px">시너지: ${syns.map((s) => esc(s.name)).join(', ')}</div>` : ''
      }`;
    }
    modsHtml(u) {
      if (!u.mods || !u.mods.length) return '';
      return `<div class="muted" style="margin-top:4px">개조 ${u.mods.length}/3: ${u.mods.map((m) => esc(MG.SKILL_MOD_INDEX[m].name)).join(', ')}</div>`;
    }
    unitTip(u) {
      const s = u.def.stats;
      const sk = MG.SkillSystem.effective(u);
      return `<h4>${esc(u.def.name)} <span class="muted" style="font-size:12px">${esc(u.def.title)}</span></h4>
        <div class="muted">${MG.ROLE_NAMES[u.def.role]} · ${u.def.attackType === 'melee' ? '근접' : '원거리'} · 체력 ${Math.ceil(u.hp)}/${u.maxHp} · 공격 ${s.atk} · 방어 ${s.def}</div>
        <b>${esc(sk.name)}</b> <span class="muted">[${MG.SKILL_TYPE_NAMES[sk.type]} · ${sk.cooldown}초]</span><br>${esc(MG.SkillSystem.describe(u))}${
        u.def.entry ? `<br><b>${esc(u.def.entry.name)}</b> <span class="muted">[패시브]</span><br>${esc(MG.SkillSystem.describeEntry(u))}` : ''
      }${this.modsHtml(u)}`;
    }

    // ---------------------------------------------------------------- top bars
    resourcesHtml() {
      const run = this.gm.run;
      return `<div class="res life" data-tip="<h4>공유 생명</h4>방어전에서 적이 홈 포인트에 도달하면 감소합니다. 0이 되면 탐사 실패."><span class="ic">♥</span><b>${run.life}</b><small>/${run.maxLife}</small></div>
        <div class="res shard" data-tip="<h4>별조각</h4>탐사 자원. 사건과 상점에서 사용합니다."><span class="ic">✦</span><b>${run.shards}</b></div>
        <div class="res" data-tip="<h4>물약</h4>탐사 맵의 파티 카드에서 아군 체력 ${Math.round((MG.RUN_CONFIG.potionHealPct + (run.meta.potionBonus || 0)) * 100)}% 회복."><span class="ic">⚱</span><b>${run.potions}</b></div>
        <button class="tb-btn" id="btnRelics">유물 ${run.relics.length} · 시너지 ${MG.RelicSystem.synergyStatus(run).filter((s) => s.active).length}</button>`;
    }
    bindRelicButton() {
      const b = $('btnRelics');
      if (b) b.onclick = () => this.toggleDrawer();
    }
    toggleDrawer() {
      const d = $('relicDrawer');
      d.classList.toggle('hidden');
      if (!d.classList.contains('hidden')) this.renderDrawer();
    }

    renderDrawer() {
      const run = this.gm.run;
      if (!run) return;
      const procs = this.gm.battle ? this.gm.battle.procs : {};
      const owned = MG.RelicSystem.uniqueOwned(run);
      let html = `<h4>보유 유물 (${run.relics.length})</h4>`;
      if (!owned.length) html += '<div style="color:var(--pink-300)">아직 유물이 없습니다. 전투 보상 · 유물 노드 · 사건 · 상점에서 얻을 수 있습니다.</div>';
      for (const id of owned) {
        const r = MG.RELICS[id];
        const n = MG.RelicSystem.count(run, id);
        html += `<div class="d-relic ${r.rarity}"><div class="ic">${r.icon}</div><div><div class="nm">${esc(r.name)}${n > 1 ? ` ×${n}` : ''}</div>
          <div class="meta">${MG.RARITY[r.rarity].name}${r.tags.length ? ' · ' + this.tagsText(r.tags) : ''} · 발동: ${esc(r.trigger)}${procs[id] ? ` · 이번 전투 ${procs[id]}회 발동` : ''}</div>
          <div>${esc(r.desc).replace(/\n/g, '<br>')}</div></div></div>`;
      }
      html += '<h4>스킬 개조</h4>';
      const modded = run.party.all().filter((u) => u.mods.length);
      if (!modded.length) html += '<div style="color:var(--pink-300)">아직 개조가 없습니다. 전투 보상 · 상점 · 사건에서 얻을 수 있습니다.</div>';
      for (const u of modded) {
        html += `<div class="d-relic"><div class="ic"><img src="${this.portrait(u.id)}" style="width:30px;height:30px"></div><div><div class="nm">${esc(u.def.name)} — ${esc(u.def.skill.name)} <span class="meta">개조 ${u.mods.length}/3</span></div>
          ${u.mods.map((m) => `<div>· <b>${esc(MG.SKILL_MOD_INDEX[m].name)}</b>: ${esc(MG.SKILL_MOD_INDEX[m].desc)}</div>`).join('')}</div></div>`;
      }
      html += '<h4>시너지</h4>';
      const status = MG.RelicSystem.synergyStatus(run).sort((a, b) => b.active - a.active || b.have / b.need - a.have / a.need);
      for (const s of status) {
        html += `<div class="d-syn ${s.active ? 'active' : ''}"><span class="st">${s.active ? '활성' + (procs[s.syn.id] ? ` · ${procs[s.syn.id]}회 발동` : '') : `${s.have}/${s.need}`}</span>
          <div class="nm">${esc(s.syn.name)}</div><div>${esc(s.syn.desc)}</div>
          <div class="req">조건: ${s.parts.map((p) => `<span class="${p.ok ? 'ok' : ''}">${p.ok ? '✔' : '✗'} ${esc(p.label)}</span>`).join('')}</div></div>`;
      }
      if (Object.keys(run.bonus).length || run.nextBattles.length) {
        html += '<h4>탐사 보너스</h4>';
        const names = { atk: '공격력', def: '방어력', hp: '최대 체력' };
        for (const [k, v] of Object.entries(run.bonus)) html += `<div>· 이번 탐사 ${names[k]} +${Math.round(v * 100)}%</div>`;
        for (const nb of run.nextBattles) html += `<div>· 다음 ${nb.n}번의 전투 ${names[nb.stat]} +${Math.round(nb.pct * 100)}%</div>`;
      }
      $('drawerBody').innerHTML = html;
    }

    // ---------------------------------------------------------------- map
    renderMap() {
      const gm = this.gm;
      const run = gm.run;
      if (!run) return;
      const EM = MG.ExplorationManager;
      $('mapTopbar').innerHTML = `<span class="title">${esc(MG.RUN_CONFIG.regionName)}</span><span class="tag">탐사 ${run.completed.size}/${run.map.columns.length} 구역</span>
        ${run.asc ? `<span class="tag def">${MG.ASCENSION[run.asc].name}</span>` : ''}
        <span class="spacer"></span>${this.resourcesHtml()}<button class="tb-btn" id="btnAbandon">탐사 포기</button>`;
      this.bindRelicButton();
      $('btnAbandon').onclick = (ev) => {
        const b = ev.currentTarget;
        if (b.dataset.armed) {
          gm.sm.go('PARTY_SELECT');
          return;
        }
        b.dataset.armed = '1';
        b.textContent = '한 번 더 눌러 포기';
        b.classList.add('on');
        setTimeout(() => {
          if (!b.isConnected) return;
          delete b.dataset.armed;
          b.textContent = '탐사 포기';
          b.classList.remove('on');
        }, 3000);
      };

      const X0 = 90;
      const DX = (1280 - 180) / (run.map.columns.length - 1);
      const Y0 = 50;
      const HH = 420;
      const pos = (n) => ({ x: X0 + n.col * DX, y: Y0 + n.y * HH });
      const nodesEl = $('mapNodes');
      let html = '';
      run.map.columns.forEach((col, c) => {
        html += `<div class="col-label" style="left:${X0 + c * DX}px">${c === run.map.columns.length - 1 ? 'FINAL' : 'STAGE ' + (c + 1)}</div>`;
      });
      for (const n of Object.values(run.map.nodes)) {
        const p = pos(n);
        const t = MG.NODE_TYPES[n.type];
        const st = EM.nodeState(run, n.id);
        const label = n.type === 'battle' && n.defense ? '방어전' : t.name;
        const scouted = t.battle && EM.scoutLevel(run, n.id) > 0 ? '<span class="n-scout" title="정찰됨">◉</span>' : '';
        html += `<div class="node ${st} ${this.pickedNode === n.id ? 'picked' : ''}" data-id="${n.id}" style="left:${p.x}px;top:${p.y}px;color:${t.color}">
          <div class="n-icon"><span>${t.icon}</span></div><div class="n-name">${label}<small>${stars(n.difficulty)}</small></div>${scouted}
          <div class="n-stripe"></div>${st === 'completed' || st === 'current' ? '<div class="n-check">✔</div>' : ''}${st === 'current' ? '<div class="n-here">▼ 현재 위치</div>' : ''}</div>`;
      }
      nodesEl.innerHTML = html;
      let svg = '';
      for (const n of Object.values(run.map.nodes)) {
        for (const nid of n.next) {
          const m = run.map.nodes[nid];
          const a = pos(n);
          const b = pos(m);
          const sa = EM.nodeState(run, n.id);
          const sb = EM.nodeState(run, nid);
          const traveled = run.path.includes(n.id) && run.path.includes(nid);
          const open = (sa === 'current' || sa === 'completed') && sb === 'selectable';
          const col = traveled ? '#f2c14e' : open ? '#f3d4e6' : 'rgba(233,179,210,0.22)';
          const dash = traveled || open ? '' : 'stroke-dasharray="6 6"';
          const x1 = a.x + 64;
          const x2 = b.x - 64;
          const mx = (x1 + x2) / 2;
          svg += `<path d="M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}" stroke="${col}" stroke-width="${open || traveled ? 2.5 : 1.5}" fill="none" ${dash}/>`;
        }
      }
      $('mapLinks').innerHTML = svg;
      nodesEl.querySelectorAll('.node').forEach((el) => {
        el.onclick = () => {
          this.pickedNode = el.dataset.id;
          this.renderMap();
        };
        el.onmouseenter = () => {
          MG.Audio && MG.Audio.play('ui_hover');
          this.renderNodeDetail(el.dataset.id, true);
        };
        el.onmouseleave = () => this.renderNodeDetail(this.pickedNode);
      });
      if (!this.pickedNode) {
        const sel = EM.selectable(run);
        if (sel.length === 1) this.pickedNode = sel[0];
      }
      this.renderNodeDetail(this.pickedNode);
      this.renderMapParty();
    }

    /** Wave plan summary for the map (by information level). */
    scoutHtml(node) {
      const run = this.gm.run;
      const lvl = MG.ExplorationManager.scoutLevel(run, node.id);
      const plan = MG.WaveManager.planFor(run, node);
      if (lvl <= 0) return `웨이브 ${plan.length}개`;
      const all = {};
      const lanes = [{}, {}];
      for (const w of plan) for (const s of w.spawns) {
        all[s.enemy] = (all[s.enemy] || 0) + 1;
        lanes[s.lane][s.enemy] = (lanes[s.lane][s.enemy] || 0) + 1;
      }
      const fmt = (m) => Object.entries(m).map(([e, c]) => `${MG.ENEMIES[e].name} ${c}`).join(', ') || '없음';
      if (lvl === 1) return `웨이브 ${plan.length}개 · 정찰: ${fmt(all)}`;
      return `웨이브 ${plan.length}개 · 상단: ${fmt(lanes[0])}<br>하단: ${fmt(lanes[1])}`;
    }

    renderNodeDetail(id, hover) {
      const run = this.gm.run;
      const el = $('nodeDetail');
      if (!id) {
        el.innerHTML = `<h3>경로 선택</h3>빛나는 노드 중 하나를 선택해 다음 목적지를 정하세요.<br>안전한 길은 회복과 사건이, 위험한 길은 강적과 희귀 유물이 기다립니다.`;
        return;
      }
      const n = run.map.nodes[id];
      const t = MG.NODE_TYPES[n.type];
      const st = MG.ExplorationManager.nodeState(run, id);
      const risk = { low: '낮음', mid: '보통', high: '높음' }[n.risk];
      const desc = {
        battle: n.defense ? '홈 포인트 방어전. 빈 진격로를 지나 홈 포인트에 닿은 적만큼 공유 생명이 줄어듭니다.' : '적 웨이브를 모두 격파하세요.',
        elite: '강력한 적이 이끄는 웨이브. 희귀 유물·스킬 개조 보상.',
        relic: '유물 중 하나를 선택합니다.',
        event: '무슨 일이 일어날지 모릅니다.',
        rest: '휴식, 간호, 정비 중 하나를 선택합니다.',
        shop: '별조각으로 유물 · 스킬 개조 · 물약을 삽니다.',
        recruit: run.party.size() >= MG.PartyManager.MAX_PARTY ? '파티가 가득 차 있어 사건으로 바뀝니다.' : `동료 후보 ${2 + (run.meta.recruitCandidates || 0)}명 중 1명을 영입합니다. (후보는 진입해야 알 수 있습니다)`,
        final: '구역의 주인 「가시관의 주교」와의 최종 방어전.',
      }[n.type];
      const next = n.next.map((x) => MG.NODE_TYPES[run.map.nodes[x].type].name).join(', ') || '없음';
      el.innerHTML = `<h3 style="color:${t.color}">${t.icon} ${t.name}${n.defense ? ' · 방어전' : ''}</h3>
        난이도 <span class="stars">${stars(n.difficulty)}</span> · 위험도 ${risk} · 보상: ${MG.MapManager.rewardHint(n)}<br>
        <span style="color:var(--pink-300)">${desc}</span>${t.battle ? `<br><span style="font-size:12px;color:var(--pink-200)">${this.scoutHtml(n)}</span>` : ''}
        <br><span style="font-size:12px;color:var(--pink-300)">다음 연결: ${next}</span>
        ${st === 'selectable' && !hover ? '<button class="choice-btn enter" id="btnEnter"><span>진입</span></button>' : ''}`;
      const b = $('btnEnter');
      if (b) b.onclick = () => this.gm.selectNode(id);
    }

    unitCardHtml(u, extra) {
      const pct = (u.hp / u.maxHp) * 100;
      return `<img src="${this.portrait(u.id)}" alt=""><div style="flex:1;min-width:0"><div class="nm">${esc(u.def.name)}${u.mods.length ? ` <small class="modmark">+${u.mods.length}</small>` : ''}</div>
        <div class="rl">${MG.ROLE_NAMES[u.def.role]} · ${u.hp <= 0 ? '전투 불능' : `${Math.ceil(u.hp)}/${u.maxHp}`}</div>
        <div class="hpbar"><i class="${pct < 35 ? 'low' : ''}" style="width:${pct}%"></i></div></div>${extra || ''}`;
    }

    /** Map party panel: free re-arrangement + potions. */
    renderMapParty() {
      const run = this.gm.run;
      const P = run.party;
      const el = $('mapParty');
      let html = '<div class="party-cols"><div class="party-field">';
      for (const lane of [0, 1]) {
        html += `<div class="party-row"><div class="lbl">${LANE_LABEL[lane]}</div>`;
        for (const slot of ['back', 'front']) {
          const key = lane + '-' + slot;
          const id = P.slots[key];
          const sel = this.sel && this.sel.type === 'slot' && this.sel.key === key ? 'sel' : '';
          if (id) {
            const u = P.get(id);
            html += `<div class="pcard ${sel} ${u.hp <= 0 ? 'down' : ''}" data-slot="${key}" data-tip="${esc(this.unitTip(u))}">${this.unitCardHtml(u, this.potionBtn(u))}</div>`;
          } else html += `<div class="pcard empty ${sel}" data-slot="${key}">${SLOT_LABEL[slot]} 비어 있음</div>`;
        }
        html += '</div>';
      }
      html += `</div><div class="party-bench"><div class="lbl2">대기열 · 카드 두 장을 차례로 눌러 위치 교환 (맵에서는 대기시간 없음)</div><div class="bench-wrap">`;
      P.bench.forEach((id, i) => {
        const u = P.get(id);
        const sel = this.sel && this.sel.type === 'bench' && this.sel.index === i ? 'sel' : '';
        html += `<div class="pcard small ${sel} ${u.hp <= 0 ? 'down' : ''}" data-bench="${i}" data-tip="${esc(this.unitTip(u))}">${this.unitCardHtml(u, this.potionBtn(u))}</div>`;
      });
      if (!P.bench.length) html += `<div class="pcard small empty" data-bench="0">대기 없음</div>`;
      html += '</div></div></div>';
      el.innerHTML = html;
      el.querySelectorAll('.pcard').forEach((c) => {
        c.onclick = (ev) => {
          if (ev.target.classList.contains('potion')) return;
          const ref = c.dataset.slot ? { type: 'slot', key: c.dataset.slot } : { type: 'bench', index: +c.dataset.bench };
          if (!this.sel) this.sel = ref;
          else {
            P.swapFree(this.sel, ref);
            this.sel = null;
          }
          this.renderMapParty();
        };
      });
      el.querySelectorAll('.potion').forEach((b) => {
        b.onclick = () => {
          const r = this.gm.usePotion(b.dataset.id);
          if (!r.ok) this.toast(r.reason);
          else MG.Audio && MG.Audio.play('potion');
        };
      });
    }
    potionBtn(u) {
      if (u.hp <= 0 || u.hp >= u.maxHp || this.gm.run.potions <= 0) return '';
      return `<button class="potion" data-id="${u.id}" data-tip="물약 사용">⚱</button>`;
    }

    // ---------------------------------------------------------------- battle HUD
    buildBattleHud() {
      const b = this.gm.battle;
      const n = b.node;
      const t = MG.NODE_TYPES[n.type];
      $('battleTopbar').innerHTML = `<span class="title">${t.icon} ${t.name}</span>${n.defense ? '<span class="tag def">홈 포인트 방어전</span>' : ''}
        <span class="tag">난이도 ${stars(n.difficulty)}</span>
        <div class="wave-pips" id="wavePips"></div><span class="phase-label" id="phaseLabel"></span>
        <span class="spacer"></span><div id="battleRes" style="display:flex;gap:14px;align-items:center"></div>
        <button class="tb-btn" id="btnPause">일시정지</button><button class="tb-btn" id="btnSpeed">속도 ×1</button>`;
      $('btnPause').onclick = () => {
        this.gm.paused = !this.gm.paused;
        MG.Audio && MG.Audio.setDuck(this.gm.paused);
      };
      $('btnSpeed').onclick = () => {
        this.gm.speed = this.gm.speed === 1 ? 2 : 1;
      };
      $('laneInfo').innerHTML = [0, 1].map((l) => `<div class="lane-tag" id="laneTag${l}" style="top:${MG.FormationSystem.G.LANE_Y[l] - 150}px"></div>`).join('');
      this.hudBuiltFor = b;
      this.relicSig = '';
      this.fieldSig = '';
      this.benchSig = '';
      this.nextSig = '';
      b.bus.on('relicProc', ({ id }) => {
        const el = document.querySelector(`[data-relic="${id}"]`);
        if (el) {
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
        }
      });
      if (MG.Audio) MG.Audio.attachBattle(b);
      this.updateBattleHud(true);
    }

    updateBattleHud(force) {
      const gm = this.gm;
      const b = gm.battle;
      if (!b || gm.state !== 'BATTLE') return;
      if (this.hudBuiltFor !== b) this.buildBattleHud();
      const now = performance.now();
      if (!force && now - this.lastHud < 90) return;
      this.lastHud = now;
      const run = gm.run;

      $('wavePips').innerHTML =
        'WAVE ' + b.waves.map((w, i) => `<i class="${i < b.waveIndex || (i === b.waveIndex && ['waveClear', 'nodeClear', 'done'].includes(b.phase)) ? 'done' : i === b.waveIndex ? 'now' : ''}"></i>`).join('');
      $('phaseLabel').textContent = { advance: '▶ 전진 중', combat: '⚔ 전투 중', waveClear: '✔ 웨이브 클리어', nodeClear: '✦ 노드 완료', defeat: '✗ 패배', done: '' }[b.phase];
      $('battleRes').innerHTML = this.resourcesHtml();
      this.bindRelicButton();
      $('btnPause').classList.toggle('on', gm.paused);
      $('btnSpeed').textContent = `속도 ×${gm.speed}`;
      $('pauseOverlay').classList.toggle('hidden', !gm.paused);

      const sig = run.relics.join(',');
      if (sig !== this.relicSig) {
        this.relicSig = sig;
        const owned = MG.RelicSystem.uniqueOwned(run);
        const active = MG.RelicSystem.synergyStatus(run).filter((s) => s.active);
        $('relicStrip').innerHTML =
          owned
            .map((id) => {
              const r = MG.RELICS[id];
              const n = MG.RelicSystem.count(run, id);
              return `<div class="relic-ic ${r.rarity}" data-relic="${id}" data-tip="${esc(this.relicTip(id))}"><span>${r.icon}</span>${n > 1 ? `<span class="cnt">${n}</span>` : ''}</div>`;
            })
            .join('') +
          `<div class="syn-strip" style="top:${owned.length > 14 ? 92 : 46}px">${active
            .map((s) => `<div class="syn-chip" data-relic="${s.syn.id}" data-tip="${esc(`<h4>${s.syn.name}</h4>${s.syn.desc}`)}">✧ ${esc(s.syn.name)}</div>`)
            .join('')}</div>`;
      }

      for (const l of [0, 1]) {
        const th = MG.LaneManager.threat(b, l);
        const el = $('laneTag' + l);
        el.className = 'lane-tag ' + th.level;
        const lvTxt = { safe: '안정', warn: '교전', danger: '위험' }[th.level];
        const near = th.nearest === Infinity ? '-' : Math.max(0, Math.round(th.nearest));
        const meter = th.nearest === Infinity ? 0 : Math.max(0, Math.min(100, 100 - th.nearest / 9));
        el.innerHTML = `<span class="lv">${lvTxt}</span>${MG.LaneManager.LANE_NAMES[l]}<br>
          적 ${th.count}${th.pending ? ` <span style="color:var(--warn)">(+${th.pending} 접근 중)</span>` : ''} · 거리 ${near}${th.empty ? ` · <span style="color:var(--danger)">${b.defense ? '무방비!' : '비어 있음'}</span>` : ''}
          <div class="lane-meter"><i style="width:${meter}%"></i></div>`;
      }

      this.renderNextPanel(b);
      this.renderField(b);
      this.renderBench(b);
    }

    /** NEXT panel: the upcoming wave per lane (during advance: the wave about to start). */
    renderNextPanel(b) {
      let offset = b.phase === 'advance' ? 0 : 1;
      const last = b.waveIndex + offset >= b.waves.length;
      const sig = b.waveIndex + ':' + offset + ':' + b.phase;
      if (sig === this.nextSig) return;
      this.nextSig = sig;
      const el = $('nextPanel');
      if (last) {
        el.className = b.phase === 'waveClear' ? 'hot' : '';
        el.innerHTML = `<div class="np-head">NEXT</div><div class="np-last">${b.phase === 'nodeClear' || b.phase === 'done' ? '모든 웨이브 완료' : '마지막 웨이브'}</div>`;
        return;
      }
      const sum = MG.WaveManager.preview(b, offset);
      const lanes = [0, 1].map((l) => sum.filter((x) => x.lane === l));
      const icon = (x) => {
        const src = MG.Assets.enemyIcon(x.enemyId);
        const flags = `${x.flags.boss ? '<b class="f-boss">보스</b>' : x.flags.elite ? '<b class="f-elite">강적</b>' : ''}${x.flags.flying ? '<i title="비행">✈</i>' : ''}${x.flags.ranged ? '<i title="원거리">➶</i>' : ''}`;
        return `<span class="np-e" data-tip="${esc(`<h4>${MG.ENEMIES[x.enemyId].name}</h4>${x.count}마리 · 총 체력 약 ${x.totalHp}`)}"><img src="${src}">×${x.count}${flags}</span>`;
      };
      el.className = b.phase === 'waveClear' ? 'hot' : '';
      el.innerHTML = `<div class="np-head">NEXT · WAVE ${b.waveIndex + offset + 1}</div>${lanes
        .map((ls, i) => `<div class="np-lane"><span class="np-l">${LANE_LABEL[i]}</span>${ls.length ? ls.map(icon).join('') : '<span class="np-none">없음</span>'}</div>`)
        .join('')}`;
    }

    renderField(b) {
      const P = b.party;
      const sig = MG.FormationSystem.allKeys().map((k) => P.slots[k] + ':' + (P.slots[k] && P.get(P.slots[k]).hp <= 0)).join('|') + '|' + Object.keys(P.moving).join(',') + '|' + JSON.stringify(this.sel);
      if (sig !== this.fieldSig) {
        this.fieldSig = sig;
        let html = '';
        for (const lane of [0, 1]) {
          html += `<div class="lane-row"><div class="lane-lbl">${LANE_LABEL[lane]}</div>`;
          for (const slot of ['back', 'front']) {
            const key = lane + '-' + slot;
            const id = P.slots[key];
            const target = this.sel && this.sel.type === 'bench' ? 'target' : '';
            const selC = this.sel && this.sel.type === 'slot' && this.sel.key === key ? 'sel' : '';
            if (!id) {
              const mover = Object.entries(P.moving).find(([, m]) => m.toKey === key);
              html += `<div class="ucard empty ${target}" data-slot="${key}"><span class="slotname">${SLOT_LABEL[slot]}</span>${mover ? `${esc(P.get(mover[0]).def.name)} 이동 중…` : '비어 있음 — 대기 아군 투입 가능'}</div>`;
              continue;
            }
            const u = P.get(id);
            const sk = MG.SkillSystem.effective(u);
            html += `<div class="ucard ${target} ${selC} ${u.hp <= 0 ? 'down' : ''}" data-slot="${key}" data-tip="${esc(this.unitTip(u))}">
              <span class="slotname">${SLOT_LABEL[slot]}</span>
              <img class="pt" src="${this.portrait(u.id)}" alt="">
              <div class="info"><div class="nm">${esc(u.def.name)}<small>${MG.ROLE_NAMES[u.def.role]}</small></div>
                <div class="hpbar"><i data-hp="${u.id}"></i><i class="sh" data-sh="${u.id}"></i></div><div class="hptxt" data-hpt="${u.id}"></div></div>
              <button class="mini-btn" data-move="${u.id}" data-tip="진격로 이동 (${(MG.FormationSystem.G.LANE_MOVE_TIME * MG.RelicSystem.laneMoveMult(b.run)).toFixed(1)}초 동안 전투 이탈)">↕</button>
              <button class="skill-btn" data-skill="${u.id}" data-tip="${esc(`<h4>${sk.name}</h4><span class="muted">${MG.SKILL_TYPE_NAMES[sk.type]} · 재사용 ${sk.cooldown}초</span><br>${MG.SkillSystem.describe(u)}`)}">
                <span class="key">${SKILL_KEYS[key]}</span><span class="lbl">${esc(sk.name)}</span><div class="cd" data-cd="${u.id}"></div></button>
            </div>`;
          }
          html += `<button class="form-btn" data-form="${lane}" data-tip="전열 ⇄ 후열 교체">⇄<br>진형</button></div>`;
        }
        $('fieldPanel').innerHTML = html;
        this.bindField(b);
      }
      for (const u of P.all()) {
        const hp = document.querySelector(`[data-hp="${u.id}"]`);
        if (!hp) continue;
        const pct = (u.hp / u.maxHp) * 100;
        hp.style.width = pct + '%';
        hp.className = pct < 35 ? 'low' : '';
        document.querySelector(`[data-sh="${u.id}"]`).style.width = Math.min(100, ((u.b ? u.b.shield : 0) / u.maxHp) * 100) + '%';
        document.querySelector(`[data-hpt="${u.id}"]`).textContent = `${Math.ceil(u.hp)} / ${u.maxHp}${u.b && u.b.shield > 0 ? `  (+${Math.round(u.b.shield)})` : ''}`;
        const cd = document.querySelector(`[data-cd="${u.id}"]`);
        const btn = document.querySelector(`[data-skill="${u.id}"]`);
        const frac = (u.skillCd || 0) / MG.SkillSystem.effective(u).cooldown;
        cd.style.height = Math.min(1, frac) * 100 + '%';
        btn.classList.toggle('ready', MG.SkillSystem.canCast(b, u).ok);
      }
      document.querySelectorAll('[data-form]').forEach((f) => (f.disabled = b.formCd[+f.dataset.form] > 0));
    }

    bindField(b) {
      const P = b.party;
      $('fieldPanel').querySelectorAll('.ucard').forEach((c) => {
        c.onclick = (ev) => {
          if (ev.target.closest('button')) return;
          const key = c.dataset.slot;
          if (this.sel && this.sel.type === 'bench') {
            const r = P.swap(this.sel.id, key, b);
            if (!r.ok) this.toast(r.reason);
            this.sel = null;
          } else if (this.sel && this.sel.type === 'slot' && this.sel.key === key) this.sel = null;
          else this.sel = { type: 'slot', key };
          this.updateBattleHud(true);
        };
      });
      $('fieldPanel').querySelectorAll('[data-skill]').forEach((btn) => (btn.onclick = () => this.castSkill(btn.dataset.skill)));
      $('fieldPanel').querySelectorAll('[data-move]').forEach(
        (btn) =>
          (btn.onclick = () => {
            const r = P.moveLane(btn.dataset.move, b);
            if (!r.ok) this.toast(r.reason);
            this.updateBattleHud(true);
          })
      );
      $('fieldPanel').querySelectorAll('[data-form]').forEach(
        (btn) =>
          (btn.onclick = () => {
            const r = MG.FormationSystem.swapRows(P, +btn.dataset.form, b);
            if (!r.ok) this.toast(r.reason);
            this.updateBattleHud(true);
          })
      );
    }

    castSkill(id) {
      const b = this.gm.battle;
      const u = b.party.get(id);
      const r = MG.SkillSystem.cast(b, u);
      if (!r.ok) this.toast(`${u.def.skill.name}: ${r.reason}`);
    }

    renderBench(b) {
      const P = b.party;
      const sig = P.bench.join(',') + '|' + P.bench.map((id) => P.get(id).hp > 0).join(',') + '|' + JSON.stringify(this.sel);
      const tag = b.tagWindow.find((t) => t.until > b.time);
      const cdTxt = b.swapCd > 0 ? `교대 대기 ${b.swapCd.toFixed(1)}초` : '교대 가능';
      if (sig !== this.benchSig) {
        this.benchSig = sig;
        let html = `<div class="bench-head"><span>대기열</span><span id="swapCd"></span></div><div class="bench-list">`;
        P.bench.forEach((id) => {
          const u = P.get(id);
          const sel = this.sel && this.sel.type === 'bench' && this.sel.id === id ? 'sel' : '';
          html += `<div class="pcard small ${sel} ${u.hp <= 0 ? 'down' : ''}" data-bench="${id}" data-tip="${esc(this.unitTip(u))}">${this.unitCardHtml(u)}</div>`;
        });
        if (!P.bench.length) html += '<div class="hint">대기 아군 없음 — 동료 노드에서 영입할 수 있습니다.</div>';
        html += `</div><div class="hint">대기 아군 → 배치 칸 순서로 눌러 교대. 퇴각해도 체력은 유지되고 대기 중에도 스킬 대기시간이 회복됩니다.</div>`;
        $('benchPanel').innerHTML = html;
        $('benchPanel').querySelectorAll('.pcard[data-bench]').forEach((c) => {
          c.onclick = () => {
            const id = c.dataset.bench;
            if (!P.isAlive(id)) {
              this.toast('쓰러진 아군은 투입할 수 없습니다');
              return;
            }
            if (this.sel && this.sel.type === 'slot') {
              const r = P.swap(id, this.sel.key, b);
              if (!r.ok) this.toast(r.reason);
              this.sel = null;
            } else this.sel = this.sel && this.sel.id === id ? null : { type: 'bench', id };
            this.updateBattleHud(true);
          };
        });
      }
      P.bench.forEach((id) => {
        const c = $('benchPanel').querySelector(`[data-bench="${id}"] .hpbar i`);
        const u = P.get(id);
        if (c) c.style.width = (u.hp / u.maxHp) * 100 + '%';
      });
      $('swapCd').innerHTML = tag ? `<span style="color:#7fd8ff">연계 교대 가능 (${LANE_LABEL[tag.lane]})</span>` : cdTxt;
    }
  }

  UIManager.SLOT_LABEL = SLOT_LABEL;
  UIManager.LANE_LABEL = LANE_LABEL;
  MG.UIManager = UIManager;
})();
