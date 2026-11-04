// DOM screens and HUD. Reads game state and calls GameManager / systems for player actions.
(function () {
  const MG = (window.MG = window.MG || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SLOT_LABEL = { front: '전열', back: '후열' };
  const LANE_LABEL = ['상단', '하단'];
  const SKILL_KEYS = { '0-front': 'Q', '0-back': 'W', '1-front': 'E', '1-back': 'R' };
  const SKILL_TYPE = { heal: '회복', aoe: '광역', shield: '보호막', single: '단일', defense: '방어', tag: '교대 연계' };

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
    }

    // ---------------------------------------------------------------- screens
    show(id) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
      $('battleCanvas').style.display = id === 'screen-battle' || id === 'screen-reward' ? 'block' : 'none';
    }

    onState(state) {
      this.sel = null;
      this.hideTip();
      switch (state) {
        case 'TITLE':
          this.show('screen-title');
          break;
        case 'MAP':
          this.pickedNode = null;
          this.show('screen-map');
          this.renderMap();
          break;
        case 'BATTLE':
          this.show('screen-battle');
          this.buildBattleHud();
          break;
        case 'REWARD':
          this.renderReward();
          break;
        case 'RELIC':
          this.renderRelicPick();
          break;
        case 'EVENT':
          this.renderEvent();
          break;
        case 'REST':
          this.renderRest();
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
      if (!$('relicDrawer').classList.contains('hidden')) this.renderDrawer();
    }

    bindStatic() {
      $('btnStart').onclick = () => this.gm.newRun();
      $('btnRestart').onclick = () => this.gm.newRun();
      $('btnTitle').onclick = () => this.gm.toTitle();
      $('btnCloseDrawer').onclick = () => $('relicDrawer').classList.add('hidden');
      document.addEventListener('mousemove', (e) => this.moveTip(e));
      document.addEventListener('keydown', (e) => this.onKey(e));
      document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('[data-tip]');
        if (el) this.showTip(el.getAttribute('data-tip'), e);
        else this.hideTip();
      });
    }

    onKey(e) {
      const gm = this.gm;
      if (e.key === 'Escape') {
        this.sel = null;
        $('relicDrawer').classList.add('hidden');
        return;
      }
      if (gm.state !== 'BATTLE') return;
      if (e.code === 'Space') {
        e.preventDefault();
        gm.paused = !gm.paused;
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
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.add('hidden'), 1600);
    }

    // tooltips
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
      const s = r.width / 1280;
      let x = (e.clientX - r.left) / s + 16;
      let y = (e.clientY - r.top) / s + 16;
      if (x + 310 > 1280) x -= 330;
      if (y + t.offsetHeight > 710) y = 710 - t.offsetHeight;
      t.style.left = x + 'px';
      t.style.top = y + 'px';
    }
    hideTip() {
      $('tooltip').classList.add('hidden');
    }

    relicTip(id) {
      const r = MG.RELICS[id];
      const rar = MG.RARITY[r.rarity];
      const syns = Object.values(MG.SYNERGIES).filter((s) => (s.requires.relics || []).includes(id));
      return `<h4>${r.icon} ${esc(r.name)}</h4><div class="muted">${rar.name}${r.tags.includes('fire') ? ' · 불속성' : ''}${r.stackable ? ' · 중첩 가능' : ''} · 발동: ${esc(r.trigger)}</div>${esc(r.desc)}${
        syns.length ? `<div class="muted" style="margin-top:4px">시너지: ${syns.map((s) => esc(s.name)).join(', ')}</div>` : ''
      }`;
    }

    // ---------------------------------------------------------------- top bars
    resourcesHtml() {
      const run = this.gm.run;
      return `<div class="res life" data-tip="<h4>공유 생명</h4>방어전에서 적이 홈 포인트에 도달하면 감소합니다. 0이 되면 탐사 실패."><span class="ic">♥</span><b>${run.life}</b></div>
        <div class="res shard" data-tip="<h4>별조각</h4>탐사 자원. 사건에서 사용합니다."><span class="ic">✦</span><b>${run.shards}</b></div>
        <div class="res" data-tip="<h4>물약</h4>탐사 맵의 파티 카드에서 아군 체력 40% 회복."><span class="ic">⚱</span><b>${run.potions}</b></div>
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
      if (!owned.length) html += '<div style="color:var(--pink-300)">아직 유물이 없습니다. 전투 보상 · 유물 노드 · 사건에서 얻을 수 있습니다.</div>';
      for (const id of owned) {
        const r = MG.RELICS[id];
        const n = MG.RelicSystem.count(run, id);
        html += `<div class="d-relic ${r.rarity}"><div class="ic">${r.icon}</div><div><div class="nm">${esc(r.name)}${n > 1 ? ` ×${n}` : ''}</div>
          <div class="meta">${MG.RARITY[r.rarity].name}${r.tags.includes('fire') ? ' · 불속성' : ''} · 발동: ${esc(r.trigger)}${procs[id] ? ` · 이번 전투 ${procs[id]}회 발동` : ''}</div>
          <div>${esc(r.desc)}</div></div></div>`;
      }
      html += '<h4>시너지</h4>';
      const status = MG.RelicSystem.synergyStatus(run).sort((a, b) => b.active - a.active || b.have / b.need - a.have / a.need);
      for (const s of status) {
        html += `<div class="d-syn ${s.active ? 'active' : ''}"><span class="st">${s.active ? '활성' + (procs[s.syn.id] ? ` · ${procs[s.syn.id]}회 발동` : '') : `${s.have}/${s.need}`}</span>
          <div class="nm">${esc(s.syn.name)}</div><div>${esc(s.syn.desc)}</div>
          <div class="req">조건: ${s.parts.map((p) => `<span class="${p.ok ? 'ok' : ''}">${p.ok ? '✔' : '✗'} ${esc(p.label)}</span>`).join('')}</div></div>`;
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
        <span class="spacer"></span>${this.resourcesHtml()}<button class="tb-btn" id="btnAbandon">탐사 포기</button>`;
      this.bindRelicButton();
      // two-step confirmation inside the page (native confirm() is unavailable in sandboxed viewers)
      $('btnAbandon').onclick = (ev) => {
        const b = ev.currentTarget;
        if (b.dataset.armed) {
          gm.newRun();
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
        html += `<div class="node ${st} ${this.pickedNode === n.id ? 'picked' : ''}" data-id="${n.id}" style="left:${p.x}px;top:${p.y}px;color:${t.color}">
          <div class="n-icon"><span>${t.icon}</span></div><div class="n-name">${label}<small>${'★'.repeat(Math.min(5, Math.ceil(n.difficulty / 1.2)))}</small></div>
          <div class="n-stripe"></div>${st === 'completed' || st === 'current' ? '<div class="n-check">✔</div>' : ''}${st === 'current' ? '<div class="n-here">▼ 현재 위치</div>' : ''}</div>`;
      }
      nodesEl.innerHTML = html;
      // links
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
          const startOpen = false;
          const col = traveled ? '#f2c14e' : open ? '#f3d4e6' : 'rgba(233,179,210,0.22)';
          const dash = traveled || open || startOpen ? '' : 'stroke-dasharray="6 6"';
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
        el.onmouseenter = () => this.renderNodeDetail(el.dataset.id, true);
        el.onmouseleave = () => this.renderNodeDetail(this.pickedNode);
      });
      if (!this.pickedNode) {
        const sel = EM.selectable(run);
        if (sel.length === 1) this.pickedNode = sel[0];
      }
      this.renderNodeDetail(this.pickedNode);
      this.renderMapParty();
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
        battle: n.defense ? '홈 포인트 방어전. 적이 비어 있는 진격로를 통과해 홈 포인트에 닿으면 공유 생명이 줄어듭니다.' : '적 웨이브를 모두 격파하세요.',
        elite: '강력한 적이 이끄는 웨이브. 희귀 유물 보상 확률이 높습니다.',
        relic: '유물 3개 중 하나를 선택합니다.',
        event: '무슨 일이 일어날지 모릅니다.',
        rest: '휴식, 간호, 정비 중 하나를 선택합니다.',
        final: '구역의 주인 「가시관의 주교」와의 최종 방어전.',
      }[n.type];
      const next = n.next.map((x) => MG.NODE_TYPES[run.map.nodes[x].type].name).join(', ') || '없음';
      el.innerHTML = `<h3 style="color:${t.color}">${t.icon} ${t.name}${n.defense ? ' · 방어전' : ''}</h3>
        난이도 <span class="stars">${'★'.repeat(Math.min(5, Math.ceil(n.difficulty / 1.2)))}</span> · 위험도 ${risk} · 보상: ${MG.MapManager.rewardHint(n)}<br>
        <span style="color:var(--pink-300)">${desc}</span><br><span style="font-size:12px;color:var(--pink-300)">다음 연결: ${next}</span>
        ${st === 'selectable' && !hover ? '<button class="choice-btn enter" id="btnEnter"><span>진입</span></button>' : ''}`;
      const b = $('btnEnter');
      if (b) b.onclick = () => this.gm.selectNode(id);
    }

    unitCardHtml(u, extra) {
      const pct = (u.hp / u.maxHp) * 100;
      return `<img src="${MG.Assets.portraits[u.id]}" alt=""><div style="flex:1;min-width:0"><div class="nm">${esc(u.def.name)}</div>
        <div class="rl">${MG.ROLE_NAMES[u.def.role]} · ${u.hp <= 0 ? '전투 불능' : `${Math.ceil(u.hp)}/${u.maxHp}`}</div>
        <div class="hpbar"><i class="${pct < 35 ? 'low' : ''}" style="width:${pct}%"></i></div></div>${extra || ''}`;
    }

    unitTip(u) {
      const s = u.def.stats;
      const sk = u.def.skill;
      return `<h4>${esc(u.def.name)} <span class="muted" style="font-size:12px">${esc(u.def.title)}</span></h4>
        <div class="muted">${MG.ROLE_NAMES[u.def.role]} · ${u.def.attackType === 'melee' ? '근접' : '원거리'} · 체력 ${Math.ceil(u.hp)}/${u.maxHp} · 공격 ${s.atk} · 방어 ${s.def}</div>
        <b>${esc(sk.name)}</b> <span class="muted">[${SKILL_TYPE[sk.type]} · ${sk.cooldown}초]</span><br>${esc(sk.desc)}${
        u.def.entry ? `<br><b>${esc(u.def.entry.name)}</b> <span class="muted">[패시브]</span><br>${esc(u.def.entry.desc)}` : ''
      }`;
    }

    /** Map party panel: free re-arrangement + potions. */
    renderMapParty() {
      const run = this.gm.run;
      const P = run.party;
      const el = $('mapParty');
      let html = '';
      for (const lane of [0, 1]) {
        html += `<div class="party-row"><div class="lbl">${LANE_LABEL[lane]}<br>진격로</div>`;
        for (const slot of ['back', 'front']) {
          const key = lane + '-' + slot;
          const id = P.slots[key];
          const sel = this.sel && this.sel.type === 'slot' && this.sel.key === key ? 'sel' : '';
          if (id) {
            const u = P.get(id);
            html += `<div class="pcard ${sel} ${u.hp <= 0 ? 'down' : ''}" data-slot="${key}" data-tip="${esc(this.unitTip(u))}">${this.unitCardHtml(u, this.potionBtn(u))}</div>`;
          } else html += `<div class="pcard empty ${sel}" data-slot="${key}">${SLOT_LABEL[slot]} 비어 있음</div>`;
        }
        if (lane === 0) {
          html += `<div class="lbl" style="width:auto;padding:0 8px">대기열</div>`;
          P.bench.forEach((id, i) => {
            const u = P.get(id);
            const sel = this.sel && this.sel.type === 'bench' && this.sel.index === i ? 'sel' : '';
            html += `<div class="pcard ${sel} ${u.hp <= 0 ? 'down' : ''}" data-bench="${i}" data-tip="${esc(this.unitTip(u))}">${this.unitCardHtml(u, this.potionBtn(u))}</div>`;
          });
        } else {
          html += `<div style="font-size:12px;color:var(--pink-300);padding-left:8px;line-height:1.5;align-self:center">카드 두 장을 차례로 눌러 위치를 바꿉니다.<br>탐사 맵에서는 대기시간 없이 자유롭게 편성할 수 있습니다.</div>`;
        }
        html += '</div>';
      }
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
        };
      });
    }
    potionBtn(u) {
      if (u.hp <= 0 || u.hp >= u.maxHp || this.gm.run.potions <= 0) return '';
      return `<button class="potion" data-id="${u.id}" data-tip="물약 사용: 체력 40% 회복">⚱</button>`;
    }

    // ---------------------------------------------------------------- battle HUD
    buildBattleHud() {
      const b = this.gm.battle;
      const n = b.node;
      const t = MG.NODE_TYPES[n.type];
      $('battleTopbar').innerHTML = `<span class="title">${t.icon} ${t.name}</span>${n.defense ? '<span class="tag def">홈 포인트 방어전</span>' : ''}
        <span class="tag">난이도 ${'★'.repeat(Math.min(5, Math.ceil(n.difficulty / 1.2)))}</span>
        <div class="wave-pips" id="wavePips"></div><span class="phase-label" id="phaseLabel"></span>
        <span class="spacer"></span><div id="battleRes" style="display:flex;gap:14px;align-items:center"></div>
        <button class="tb-btn" id="btnPause">일시정지</button><button class="tb-btn" id="btnSpeed">속도 ×1</button>`;
      $('btnPause').onclick = () => (this.gm.paused = !this.gm.paused);
      $('btnSpeed').onclick = () => {
        this.gm.speed = this.gm.speed === 1 ? 2 : 1;
      };
      $('laneInfo').innerHTML = [0, 1]
        .map((l) => `<div class="lane-tag" id="laneTag${l}" style="top:${MG.FormationSystem.G.LANE_Y[l] - 150}px"></div>`)
        .join('');
      this.hudBuiltFor = b;
      this.relicSig = '';
      this.fieldSig = '';
      if (!this._procBound || this._procBound !== b) {
        this._procBound = b;
        b.bus.on('relicProc', ({ id }) => {
          const el = document.querySelector(`[data-relic="${id}"]`);
          if (el) {
            el.classList.remove('flash');
            void el.offsetWidth;
            el.classList.add('flash');
          }
        });
      }
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

      // top bar
      $('wavePips').innerHTML =
        'WAVE ' + b.waves.map((w, i) => `<i class="${i < b.waveIndex || (i === b.waveIndex && ['waveClear', 'nodeClear', 'done'].includes(b.phase)) ? 'done' : i === b.waveIndex ? 'now' : ''}"></i>`).join('');
      $('phaseLabel').textContent = { advance: '▶ 전진 중', combat: '⚔ 전투 중', waveClear: '✔ 웨이브 클리어', nodeClear: '✦ 노드 완료', defeat: '✗ 패배', done: '' }[b.phase];
      $('battleRes').innerHTML = this.resourcesHtml();
      this.bindRelicButton();
      $('btnPause').classList.toggle('on', gm.paused);
      $('btnSpeed').textContent = `속도 ×${gm.speed}`;
      $('pauseOverlay').classList.toggle('hidden', !gm.paused);

      // relic strip (rebuild only when relics change)
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

      // lane threat
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

      this.renderField(b);
      this.renderBench(b);
    }

    renderField(b) {
      const P = b.party;
      // structure signature: rebuild DOM only when composition changes, else patch numbers
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
              html += `<div class="ucard empty ${target}" data-slot="${key}"><span class="slotname">${SLOT_LABEL[slot]}</span>${
                mover ? `${esc(P.get(mover[0]).def.name)} 이동 중…` : '비어 있음 — 대기 아군 투입 가능'
              }</div>`;
              continue;
            }
            const u = P.get(id);
            const sk = u.def.skill;
            html += `<div class="ucard ${target} ${selC} ${u.hp <= 0 ? 'down' : ''}" data-slot="${key}" data-tip="${esc(this.unitTip(u))}">
              <span class="slotname">${SLOT_LABEL[slot]}</span>
              <img class="pt" src="${MG.Assets.portraits[u.id]}" alt="">
              <div class="info"><div class="nm">${esc(u.def.name)}<small>${MG.ROLE_NAMES[u.def.role]}</small></div>
                <div class="hpbar"><i data-hp="${u.id}"></i><i class="sh" data-sh="${u.id}"></i></div><div class="hptxt" data-hpt="${u.id}"></div></div>
              <button class="mini-btn" data-move="${u.id}" data-tip="진격로 이동 (${MG.FormationSystem.G.LANE_MOVE_TIME}초 동안 전투 이탈)">↕</button>
              <button class="skill-btn" data-skill="${u.id}" data-tip="${esc(`<h4>${sk.name}</h4><span class="muted">${SKILL_TYPE[sk.type]} · 재사용 ${sk.cooldown}초</span><br>${sk.desc}`)}">
                <span class="key">${SKILL_KEYS[key]}</span><span class="lbl">${esc(sk.name)}</span><div class="cd" data-cd="${u.id}"></div></button>
            </div>`;
          }
          html += `<button class="form-btn" data-form="${lane}" data-tip="전열 ⇄ 후열 교체">⇄<br>진형</button></div>`;
        }
        $('fieldPanel').innerHTML = html;
        this.bindField(b);
      }
      // live numbers
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
        const frac = (u.skillCd || 0) / u.def.skill.cooldown;
        cd.style.height = frac * 100 + '%';
        const ok = MG.SkillSystem.canCast(b, u).ok;
        btn.classList.toggle('ready', ok);
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
          html += `<div class="pcard ${sel} ${u.hp <= 0 ? 'down' : ''}" data-bench="${id}" data-tip="${esc(this.unitTip(u))}">${this.unitCardHtml(u)}</div>`;
        });
        html += `</div><div class="hint">대기 아군을 누른 뒤 배치 칸을 눌러 교대합니다. 퇴각한 아군의 체력은 유지되며, 대기 중에도 스킬 대기시간은 회복됩니다.</div>`;
        $('benchPanel').innerHTML = html;
        $('benchPanel').querySelectorAll('.pcard').forEach((c) => {
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
      // live bench hp
      P.bench.forEach((id) => {
        const c = $('benchPanel').querySelector(`[data-bench="${id}"] .hpbar i`);
        const u = P.get(id);
        if (c) c.style.width = (u.hp / u.maxHp) * 100 + '%';
      });
      $('swapCd').innerHTML = tag ? `<span style="color:#7fd8ff">연계 교대 가능 (${LANE_LABEL[tag.lane]})</span>` : cdTxt;
    }

    // ---------------------------------------------------------------- reward / relic pick
    relicCardHtml(id, i) {
      const r = MG.RELICS[id];
      const run = this.gm.run;
      const syns = Object.values(MG.SYNERGIES).filter((s) => (s.requires.relics || []).includes(id) || (s.requires.tagCount && r.tags.includes(s.requires.tagCount.tag)));
      const synHtml = syns
        .map((s) => {
          const others = (s.requires.relics || []).filter((x) => x !== id);
          const ownedAll = others.every((x) => run.relics.includes(x));
          return `<div><b>✧ ${esc(s.name)}</b> ${others.length ? '— ' + others.map((x) => `<span class="${run.relics.includes(x) ? 'ok' : ''}">${esc(MG.RELICS[x].name)}</span>`).join(' + ') : ''}${
            ownedAll && others.length ? ' <span class="ok">(획득 시 활성!)</span>' : ''
          }</div>`;
        })
        .join('');
      return `<div class="rcard ${r.rarity}" data-i="${i}"><span class="rar">${MG.RARITY[r.rarity].name}${r.tags.includes('fire') ? ' · 불' : ''}</span>
        <div class="big">${r.icon}</div><h3>${esc(r.name)}</h3><div class="trig">발동: ${esc(r.trigger)}${r.stackable ? ' · 중첩 가능' : ''}</div><div class="desc">${esc(r.desc)}</div>
        ${synHtml ? `<div class="syns">${synHtml}</div>` : ''}</div>`;
    }

    renderReward() {
      const ctx = this.gm.ctx;
      this.show('screen-reward');
      $('screen-battle').classList.add('active'); // keep the battlefield visible under the overlay
      $('battleHud').style.visibility = 'hidden';
      $('rewardTitle').textContent = 'NODE CLEAR — 보상 선택';
      $('rewardSub').innerHTML = `별조각 <b style="color:var(--gold)">+${ctx.rewards.shards}</b> 획득 · 아래에서 보상 하나를 선택하세요`;
      $('rewardCards').innerHTML = ctx.rewards.options
        .map((o, i) =>
          o.kind === 'relic'
            ? this.relicCardHtml(o.relicId, i)
            : `<div class="rcard alt" data-i="${i}"><span class="rar">${o.kind === 'heal' ? '회복' : '탐사'}</span><div class="big">${o.kind === 'heal' ? '⚕' : '🗺'}</div><h3>${esc(o.label)}</h3><div class="desc">${esc(o.desc)}</div></div>`
        )
        .join('');
      $('rewardCards').querySelectorAll('.rcard').forEach((c) => {
        c.onclick = () => {
          $('battleHud').style.visibility = '';
          const msg = this.gm.chooseReward(+c.dataset.i);
          if (msg) this.toast(msg);
        };
      });
    }

    renderRelicPick() {
      const ctx = this.gm.ctx;
      this.show('screen-reward');
      $('rewardTitle').textContent = '봉인된 유물함';
      $('rewardSub').textContent = '세 개의 유물 중 하나를 가져갈 수 있습니다.';
      $('rewardCards').innerHTML = ctx.choices.map((id, i) => this.relicCardHtml(id, i)).join('');
      $('rewardCards').querySelectorAll('.rcard').forEach((c) => {
        c.onclick = () => {
          const id = ctx.choices[+c.dataset.i];
          if (this.gm.pickRelic(id)) this.toast(`${MG.RELICS[id].name} 획득`);
        };
      });
    }

    // ---------------------------------------------------------------- event / rest
    typeText(text) {
      const el = $('eventText');
      clearInterval(this._typeT);
      let i = 0;
      el.textContent = '';
      this._typeT = setInterval(() => {
        i += 2;
        el.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(this._typeT);
      }, 22);
    }

    renderEvent() {
      const ev = this.gm.ctx.event;
      this.show('screen-event');
      MG.SceneArt.drawEvent($('eventCanvas'), ev.art, ev.speaker, this.gm.run.party);
      $('eventKicker').textContent = 'EVENT · 사건';
      $('eventTitle').textContent = ev.title;
      $('eventSpeaker').textContent = ev.speaker;
      this.typeText(ev.text);
      $('eventChoices').innerHTML = ev.choices
        .map((c, i) => {
          const ok = MG.NodeManager.requirementMet(this.gm.run, c);
          return `<button class="choice-btn" data-i="${i}" ${ok ? '' : 'disabled'}><span>${esc(c.label)}${ok ? '' : '<small class="req">별조각 부족</small>'}</span></button>`;
        })
        .join('');
      $('eventChoices').querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const res = this.gm.chooseEvent(+b.dataset.i);
          if (res) this.showResolved(res.text);
        };
      });
    }

    renderRest() {
      this.show('screen-event');
      const P = this.gm.run.party;
      MG.SceneArt.drawEvent($('eventCanvas'), 'rest', '아모레', P);
      $('eventKicker').textContent = 'REST · 휴식';
      $('eventTitle').textContent = '달빛 아래의 야영지';
      $('eventSpeaker').textContent = '아모레';
      const fallen = P.all().filter((u) => u.hp <= 0);
      this.typeText(`잠깐 쉬어 가자. 다들 많이 지쳤지?${fallen.length ? `\n(쓰러진 동료: ${fallen.map((u) => u.def.name).join(', ')})` : ''}`);
      const opts = [];
      MG.REST_OPTIONS.forEach((o) => {
        if (o.id === 'revive' && fallen.length > 1) {
          for (const f of fallen) opts.push({ id: 'revive', target: f.id, label: `${f.def.name}을(를) 간호한다`, desc: '체력 50%로 부활' });
        } else opts.push({ id: o.id, label: o.label, desc: o.desc });
      });
      $('eventChoices').innerHTML = opts
        .map((o, i) => `<button class="choice-btn" data-i="${i}"><span>${esc(o.label)}<small>${esc(o.desc)}</small></span></button>`)
        .join('');
      $('eventChoices').querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const o = opts[+b.dataset.i];
          const res = this.gm.chooseRest(o.id, o.target);
          if (res) this.showResolved(res.text);
        };
      });
    }

    showResolved(text) {
      this.typeText(text);
      $('eventChoices').innerHTML = `<button class="choice-btn dark" id="btnContinue"><span>계속</span></button>`;
      $('btnContinue').onclick = () => this.gm.finishNode();
    }

    // ---------------------------------------------------------------- result
    renderResult(win) {
      this.show('screen-result');
      const run = this.gm.run;
      $('resultTitle').textContent = win ? '탐사 성공' : '탐사 실패';
      $('resultTitle').style.color = win ? '#ffe9f5' : '#ff6b8a';
      $('resultSub').textContent = win ? `「${MG.RUN_CONFIG.regionName}」를 정화했습니다.` : '마법소녀들은 후퇴했습니다… 다음 탐사에서 다시 도전하세요.';
      $('resultStats').innerHTML = `완료한 노드 ${run.stats.nodes} · 전투 ${run.stats.battles} · 처치한 적 ${run.stats.kills}<br>
        획득 유물 ${run.relics.length}개 · 활성 시너지 ${MG.RelicSystem.synergyStatus(run).filter((s) => s.active).length}개 · 남은 생명 ${run.life}<br>
        <span style="color:var(--pink-300);font-size:13px">영구 성장 요소는 아직 없습니다 — 새 탐사는 처음 상태에서 시작합니다. (시드 ${run.seed})</span>`;
    }
  }

  MG.UIManager = UIManager;
})();
