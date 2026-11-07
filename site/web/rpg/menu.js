/*
 * RPG 화면 — 상단 정보(HUD), 메뉴(상태 · 아이템 · 장비 · 능력 · 지도 · 저장), 상점, 날짜 카드
 * 흰 공간의 핑크 고딕 UI(.p-frame · .plate · .g-btn · .overlay)를 그대로 쓴다.
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const UI = R.UI = {};

  function mount() {
    if ($('#rpg-hud')) return;
    const game = $('#game');
    const hud = document.createElement('div');
    hud.id = 'rpg-hud';
    hud.innerHTML = `
      <div class="rh-day p-frame"><b class="rh-d"></b><span class="rh-left"></span><span class="rh-time"></span><span class="rh-place"></span></div>
      <div class="rh-bars p-frame">
        <div class="rb-bar hp"><span>체력</span><i><em></em></i><b></b></div>
        <div class="rb-bar mp"><span>마나</span><i><em></em></i><b></b></div>
        <div class="rb-bar gauge"><span>변신</span><i><em></em></i><b></b></div>
        <div class="rh-gold"></div>
      </div>`;
    hud.addEventListener('click', e => { e.stopPropagation(); UI.openMenu('status'); });
    game.appendChild(hud);

    const menu = document.createElement('div');
    menu.id = 'rpg-menu'; menu.className = 'overlay';
    menu.innerHTML = `
      <div class="rm-panel p-frame">
        <nav class="rm-tabs"></nav>
        <div class="rm-body"></div>
        <button type="button" class="g-btn rm-close">닫기</button>
      </div>`;
    menu.addEventListener('click', e => e.stopPropagation());
    menu.querySelector('.rm-close').addEventListener('click', () => UI.closeMenu());
    game.appendChild(menu);

    const shop = document.createElement('div');
    shop.id = 'rpg-shop'; shop.className = 'overlay';
    shop.innerHTML = `<div class="rm-panel p-frame"><h2 class="plate rs-title"></h2><nav class="rm-tabs"></nav><div class="rs-gold"></div><div class="rm-body"></div><button type="button" class="g-btn rm-close">나가기</button></div>`;
    shop.addEventListener('click', e => e.stopPropagation());
    game.appendChild(shop);

    const card = document.createElement('div');
    card.id = 'rpg-daycard';
    card.innerHTML = '<div class="dc-day"></div><div class="dc-left"></div><div class="dc-note"></div>';
    game.appendChild(card);

    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'btn-rpg-menu'; btn.className = 'hud-btn'; btn.title = '메뉴 (M)';
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" stroke-width="1.5"/></svg><span>메뉴</span>';
    btn.hidden = true;
    btn.addEventListener('click', e => { e.stopPropagation(); if (!WS.game.ui.modalOpen) UI.openMenu('status'); });
    $('#hud').insertBefore(btn, $('#hud').firstChild);
  }
  UI.mount = mount;

  // ---------------- HUD ----------------
  UI.showHud = function (on) {
    mount();
    $('#rpg-hud').classList.toggle('show', on);
    $('#btn-rpg-menu').hidden = !on;
  };
  const bar = (root, cls, v, max, label) => {
    const el = root.querySelector('.rb-bar.' + cls);
    el.querySelector('em').style.width = (100 * Math.max(0, Math.min(1, v / max))) + '%';
    el.querySelector('b').textContent = label || `${v}/${max}`;
  };
  UI.refreshHud = function (place) {
    const run = WS.game.state, rp = run.rpg;
    if (!rp) return;
    mount();
    const h = $('#rpg-hud'), st = R.stats(run), job = R.job(run);
    h.style.setProperty('--job', job.color);
    const left = R.daysLeft(rp);
    h.querySelector('.rh-d').textContent = `${rp.day}일째`;
    h.querySelector('.rh-left').textContent = `멸망까지 ${left}일`;
    h.querySelector('.rh-left').classList.toggle('urgent', left <= 5);
    h.querySelector('.rh-time').textContent = rp.gauge <= 0 ? '변신 해제 — 잠들어야 한다' : '';
    h.querySelector('.rh-time').classList.toggle('late', rp.gauge <= 0);
    if (place) h.querySelector('.rh-place').textContent = place;
    bar(h, 'hp', rp.hp, st.hp);
    bar(h, 'mp', rp.mp, st.mp);
    bar(h, 'gauge', rp.gauge, R.GAUGE.max);
    h.querySelector('.rb-bar.gauge').classList.toggle('empty', rp.gauge <= 0);
    h.querySelector('.rh-gold').innerHTML = `${R.icon(159, 18)} ${rp.gold.toLocaleString()} G${rp.points ? ` <span class="rh-pts">포인트 ${rp.points}</span>` : ''}${rp.poison ? ' <span class="tag poison">독</span>' : ''}`;
  };

  // ---------------- 날짜 카드 ----------------
  UI.dayCard = async function (note) {
    mount();
    const rp = WS.game.state.rpg, el = $('#rpg-daycard');
    el.querySelector('.dc-day').textContent = `${rp.day}일째`;
    const left = R.daysLeft(rp);
    el.querySelector('.dc-left').textContent = left === 1 ? '오늘이 마지막 날입니다' : `세계 멸망까지 — ${left}일`;
    el.querySelector('.dc-note').textContent = note || '';
    el.classList.toggle('urgent', left <= 5);
    el.classList.add('show');
    await WS.sleep(2300);
    el.classList.remove('show');
    await WS.sleep(500);
  };

  // ---------------- 메뉴 ----------------
  const TABS = [['status', '상태'], ['items', '아이템'], ['equip', '장비'], ['skills', '능력'], ['map', '지도'], ['save', '저장']];
  let menuTab = 'status', equipSlot = null, menuOpen = false;

  UI.openMenu = function (tab) {
    const run = WS.game.state;
    if (!run.rpg) return;
    mount();
    if (!menuOpen) { WS.game.ui.pushModal(); menuOpen = true; }
    menuTab = tab || menuTab;
    equipSlot = null;
    $('#rpg-menu').classList.add('show');
    renderMenu();
  };
  UI.closeMenu = function () {
    if (!menuOpen) return;
    menuOpen = false;
    $('#rpg-menu').classList.remove('show');
    WS.game.ui.popModal();
    UI.refreshHud();
    const v = WS.game.stage.view;
    if (v && v.player && R.fieldSprite) v.player.sprite = R.fieldSprite(WS.game.state);
  };
  UI.menuOpen = () => menuOpen;

  function renderMenu() {
    const el = $('#rpg-menu'), run = WS.game.state, job = R.job(run);
    el.style.setProperty('--job', job.color);
    const tabs = el.querySelector('.rm-tabs');
    tabs.innerHTML = TABS.map(([k, n]) => `<button type="button" class="rm-tab${k === menuTab ? ' active' : ''}" data-tab="${k}">${n}${k === 'status' && run.rpg.points ? ' <i class="dot"></i>' : ''}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => { menuTab = b.dataset.tab; equipSlot = null; renderMenu(); });
    const body = el.querySelector('.rm-body');
    body.innerHTML = ({ status: tabStatus, items: tabItems, equip: tabEquip, skills: tabSkills, map: tabMap, save: tabSave }[menuTab])(run);
    bindBody(body, run);
  }

  function statRow(k, st, human, run) {
    const rp = run.rpg;
    const gem = (rp.gems || {})[k] || 0;
    return `<div class="rm-stat"><span>${WS.STAT_LABELS[k]}</span><b>${st[k]}</b><small>${human ? `평상복 ${human[k]}` : ''}${gem ? `${human ? ' · ' : ''}<em class="rm-gem">영혼의 보석 +${gem}</em>` : ''}</small>
      ${rp.points ? `<button type="button" class="rm-plus" data-alloc="${k}" title="${R.STAT_DESC[k]} +${R.POINT_VALUE[k]}">+${R.POINT_VALUE[k]}</button>` : ''}</div>`;
  }

  function tabStatus(run) {
    const rp = run.rpg, st = R.stats(run, 'job'), hu = R.stats(run, 'human'), job = R.job(run);
    const need = R.expToNext(rp.lv);
    const portrait = rp.gauge > 0 ? job.portrait : WS.CHARACTERS.hero.portrait;
    return `
      <div class="rm-status">
        <div class="rm-portrait"><img src="${portrait}" alt=""></div>
        <div class="rm-info">
          <h3>${esc(R.HERO_NAME)} <small>Lv.${rp.lv}</small></h3>
          <p class="rm-job">${job.name} <small>${job.role}</small></p>
          <div class="rb-bar exp"><span>경험</span><i><em style="width:${100 * rp.exp / need}%"></em></i><b>${rp.exp}/${need}</b></div>
          <div class="rb-bar hp"><span>체력</span><i><em style="width:${100 * rp.hp / st.hp}%"></em></i><b>${rp.hp}/${st.hp}</b></div>
          <div class="rb-bar mp"><span>마나</span><i><em style="width:${100 * rp.mp / st.mp}%"></em></i><b>${rp.mp}/${st.mp}</b></div>
          <div class="rb-bar gauge${rp.gauge <= 0 ? ' empty' : ''}"><span>변신</span><i><em style="width:${rp.gauge}%"></em></i><b>${rp.gauge}/${R.GAUGE.max}</b></div>
          <p class="rm-note">${rp.gauge > 0
            ? `전투에 들어가면 변신합니다. 1회 소모 ${R.gaugeCost(run, false)} (보스 ${R.gaugeCost(run, true)}) · 패배 시 -${R.GAUGE.defeatCost}`
            : '<b class="warn">변신 게이지가 바닥났습니다.</b> 지금은 마물의 공격 한 번에 쓰러집니다. 집이나 여관에서 잠들어 하루를 넘기면 다시 찹니다.'}</p>
          <h4>능력치 ${rp.points ? `<span class="rm-pts">남은 포인트 ${rp.points}</span>` : ''}</h4>
          <div class="rm-stats">${['hp', 'mp', 'atk', 'mag', 'def', 'spd'].map(k => statRow(k, st, ['atk', 'mag', 'def', 'spd'].includes(k) ? hu : null, run)).join('')}</div>
          <p class="rm-note">치명타율 ${st.crit}%${st.regen ? ` · 턴마다 체력 ${Math.round(st.regen * 100)}% 회복` : ''}${st.mpRegen ? ` · 턴마다 마나 ${st.mpRegen} 회복` : ''}${st.flags.poisonImmune ? ' · 독 면역' : ''}${st.flags.firstStrike ? ' · 항상 선공' : ''}</p>
          <p class="rm-note muted">${rp.day}일째 · 쓰러뜨린 마물 ${rp.kills} · 전투 ${rp.battles}회 · 패배 ${rp.defeats}회</p>
        </div>
      </div>`;
  }

  function itemRow(run, id, extra = '') {
    const it = R.ITEMS[id] || WS.ITEMS[id];
    const n = run.inventory[id];
    const name = it.n || it.name, desc = it.d || it.desc;
    return `<div class="rm-item" data-item="${id}">${it.icon !== undefined ? R.icon(it.icon, 32) : '<i class="rpg-icon none"></i>'}<div><b>${esc(name)}</b> <small>×${n}</small><p>${esc(desc)}</p></div>${extra}</div>`;
  }

  // 아이템 분류 (2부: 소비 아이템이 많아져 나눠 보여 준다)
  const ITEM_TABS = [['all', '전체'], ['heal', '회복 · 정화'], ['battle', '전투용'], ['gem', '영혼의 보석'], ['field', '탐험'], ['gear', '장비'], ['mat', '재료']];
  const CAT_ORDER = { heal: 0, battle: 1, gem: 2, field: 3 };
  let itemTab = 'all';
  function itemCat(id) {
    const it = R.ITEMS[id];
    if (!it) return 'story';
    if (it.kind === 'use') return it.cat || 'heal';
    if (it.kind === 'mat') return 'mat';
    return 'gear';
  }
  function tabItems(run) {
    const ids = Object.keys(run.inventory).filter(id => run.inventory[id] > 0);
    const has = new Set(ids.map(itemCat));
    const chips = `<div class="rm-chips">${ITEM_TABS.filter(([k]) => k === 'all' || has.has(k)).map(([k, n]) => `<button type="button" class="rm-chip${itemTab === k ? ' active' : ''}" data-itab="${k}">${n}</button>`).join('')}</div>`;
    const sel = ids.filter(id => itemTab === 'all' || itemCat(id) === itemTab)
      .sort((a, b) => (CAT_ORDER[itemCat(a)] ?? 9) - (CAT_ORDER[itemCat(b)] ?? 9) || (R.ITEMS[a] ? R.ITEMS[a].price : 0) - (R.ITEMS[b] ? R.ITEMS[b].price : 0));
    const row = id => {
      const it = R.ITEMS[id], c = itemCat(id);
      if (c === 'story') return itemRow(run, id);
      if (it.kind === 'use') return itemRow(run, id, it.battleOnly ? '<small class="muted">전투 중</small>' : `<button type="button" class="g-btn rm-mini" data-use="${id}">사용</button>`);
      if (c === 'mat') return itemRow(run, id, `<small class="muted">${it.price}G</small>`);
      return itemRow(run, id, `<small class="muted">${R.KIND_LABEL[it.kind]}${R.equippedCount(run, id) ? ' · 장착 중' : ''}</small>`);
    };
    if (!ids.length) return '<p class="muted">가진 것이 없습니다.</p>';
    return chips + (sel.length ? `<div class="rm-list">${sel.map(row).join('')}</div>` : '<p class="muted">이 분류의 아이템이 없습니다.</p>');
  }

  function bonusText(it) {
    const parts = [];
    for (const k of ['hp', 'mp', 'atk', 'mag', 'def', 'spd']) if (it[k]) parts.push(`${WS.STAT_LABELS[k]} +${it[k]}`);
    return parts.join(' · ') || it.d;
  }

  function tabEquip(run) {
    const e = run.rpg.equip;
    const slot = (key, label, id) => {
      const it = id && R.ITEMS[id];
      return `<button type="button" class="rm-slot${equipSlot === key ? ' active' : ''}" data-slot="${key}">
        <span class="rm-slot-label">${label}</span>${it ? R.icon(it.icon, 32) : '<i class="rpg-icon none"></i>'}
        <span class="rm-slot-name">${it ? esc(it.n) : '비어 있음'}<small>${it ? esc(bonusText(it)) : ''}</small></span></button>`;
    };
    let html = `<div class="rm-equip"><div class="rm-slots">
      ${slot('wand', '마법봉', e.wand)}
      ${e.acc.map((a, i) => slot('acc' + i, '악세사리 ' + (i + 1), a)).join('')}
      ${slot('relic', '유물', e.relic)}</div><div class="rm-pick">`;
    if (!equipSlot) html += '<p class="muted">바꿀 칸을 고르세요.<br>마법봉 1개 · 악세사리 최대 5개 · 유물 1개를 장착할 수 있습니다.</p>';
    else {
      const kind = equipSlot === 'wand' ? 'wand' : equipSlot === 'relic' ? 'relic' : 'acc';
      const ids = Object.keys(run.inventory).filter(id => R.ITEMS[id] && R.ITEMS[id].kind === kind && R.spare(run, id) > 0);
      const cur = R.stats(run);
      html += `<h4>${{ wand: '마법봉', relic: '유물', acc: '악세사리' }[kind]} 고르기</h4>`;
      if (kind !== 'wand') html += `<button type="button" class="g-btn rm-mini" data-equip="">빼기</button>`;
      if (!ids.length) html += '<p class="muted">장착할 수 있는 것이 없습니다.</p>';
      for (const id of ids) {
        // 바꿨을 때의 능력치 미리보기
        const saved = JSON.stringify(run.rpg.equip);
        R.equip(run, equipSlot, id);
        const next = R.stats(run);
        run.rpg.equip = JSON.parse(saved); R.sync(run);
        const diff = ['hp', 'mp', 'atk', 'mag', 'def', 'spd'].map(k => next[k] - cur[k]).map((d, i) => d ? `<span class="${d > 0 ? 'up' : 'down'}">${WS.STAT_LABELS[['hp', 'mp', 'atk', 'mag', 'def', 'spd'][i]]} ${d > 0 ? '+' : ''}${d}</span>` : '').join(' ');
        html += `<div class="rm-item">${R.icon(R.ITEMS[id].icon, 32)}<div><b>${esc(R.ITEMS[id].n)}</b> <small>×${R.spare(run, id)}</small><p>${esc(R.ITEMS[id].d)}</p><p class="rm-diff">${diff}</p></div><button type="button" class="g-btn rm-mini" data-equip="${id}">장착</button></div>`;
      }
    }
    return html + '</div></div>';
  }

  function tabSkills(run) {
    const job = R.job(run), rp = run.rpg;
    const learned = run.player.abilities;
    const future = (R.LEARN[run.player.jobId] || []).filter(([lv, id]) => !learned.some(a => a.id === id));
    const row = (a, lock) => `<div class="st-ability${lock ? ' locked' : ''}"><b>「${a.name}」</b> ${lock ? `<small>Lv.${lock}에 습득</small>` : ''}<p>${a.desc}</p><small>마나 ${a.cost} · 대기 ${a.cooldown || 0}턴</small></div>`;
    return `<h4>${job.name}의 능력</h4>${learned.map(a => row(a)).join('')}
      <h4>변신 기술</h4><div class="st-ability"><b>「해방 — ${R.RELEASE[job.id]}」</b><p>변신 게이지를 ${R.GAUGE.releaseCost} 태워 방어를 무시하는 큰 일격을 날린다. 변신 중에만 쓸 수 있다.</p></div>
      ${future.length ? `<h4>앞으로 깨달을 능력</h4>${future.map(([lv, id]) => row(WS.BALANCE.ABILITIES[id], lv)).join('')}` : ''}`;
  }

  function tabMap(run) {
    const rp = run.rpg;
    const cells = [];
    const maxX = 6, maxY = 6;
    const byPos = {};
    for (const id in R.MAPS) { const g = R.MAPS[id].g; byPos[g[0] + ',' + g[1]] = id; }
    const cur = rp.map === 'tower_f' ? 'tower' : rp.map.startsWith('in:') ? rp.map.split(':')[1] : rp.map;
    let lines = '';
    const cx = x => (x + 0.5) / (maxX + 1) * 100, cy = y => (y + 0.5) / (maxY + 1) * 100;
    const done = new Set();
    for (const id in R.MAPS) {
      const m = R.MAPS[id];
      for (const d in m.exits) {
        const to = R.MAPS[m.exits[d]], key = [id, m.exits[d]].sort().join('-');
        if (done.has(key)) continue; done.add(key);
        const known = rp.visited[id] || rp.visited[m.exits[d]];
        lines += `<line x1="${cx(m.g[0])}%" y1="${cy(m.g[1])}%" x2="${cx(to.g[0])}%" y2="${cy(to.g[1])}%" class="${known ? '' : 'unknown'}"/>`;
      }
    }
    for (let y = 0; y <= maxY; y++) for (let x = 0; x <= maxX; x++) {
      const id = byPos[x + ',' + y];
      if (!id) { cells.push('<div></div>'); continue; }
      const m = R.MAPS[id], seen = rp.visited[id];
      const near = Object.values(m.exits).some(n => rp.visited[n]);
      const boss = m.boss && rp.bosses[id] ? ' ✦' : '';
      cells.push(`<div class="wm-node${id === cur ? ' here' : ''}${seen ? '' : ' unseen'}" title="${seen ? m.n : '???'}">${seen || near ? (seen ? m.n : '???') : ''}${seen ? boss : ''}</div>`);
    }
    return `<div class="wm"><svg class="wm-lines" preserveAspectRatio="none">${lines}</svg><div class="wm-grid">${cells.join('')}</div></div>
      <p class="rm-note muted">✦ 보스를 쓰러뜨린 지역 · 끝없는 탑 최고 도달 ${rp.tower.max}층</p>`;
  }

  function tabSave(run) {
    const block = R.Save.blockReason(WS.game);
    const btns = (slot, st) => {
      const out = [];
      if (slot !== 'auto') out.push(`<button type="button" class="g-btn rm-mini" data-sv-save="${slot}" ${block ? 'disabled' : ''}>저장</button>`);
      if (st === 'ok') out.push(`<button type="button" class="g-btn rm-mini" data-sv-load="${slot}">불러오기</button>`);
      if (st === 'ok' || st === 'broken') out.push(`<button type="button" class="g-btn rm-mini" data-sv-del="${slot}">삭제</button>`);
      if (st === 'ok') out.push(`<button type="button" class="g-btn rm-mini" data-sv-export="${slot}">내보내기</button>`);
      if (slot !== 'auto') out.push(`<button type="button" class="g-btn rm-mini" data-sv-import="${slot}">가져오기</button>`);
      return out.join('');
    };
    const A = R.Audio;
    const sound = A ? `<div class="rm-sound"><b>소리</b>
      <button type="button" class="g-btn rm-mini" data-snd-toggle>${A.isOn() ? '켜짐' : '꺼짐'}</button>
      <label>음악 <input type="range" min="0" max="100" value="${Math.round(A.volume('bgm') * 100)}" data-snd-vol="bgm"></label>
      <label>효과음 <input type="range" min="0" max="100" value="${Math.round(A.volume('se') * 100)}" data-snd-vol="se"></label>
      <small class="muted">${(st => !st.on ? '소리가 꺼져 있습니다.' : st.error ? '재생 오류: ' + esc(st.error) : st.playing ? '재생 중: ' + esc(st.bgm || '') : '화면을 한 번 누르면 재생됩니다.')(A.status())}</small></div>` : '';
    return `<div class="rm-save">${sound}
      ${block ? `<p class="sv-block warn">${block}</p>` : ''}
      ${R.Save.cardsHTML(btns)}
      <p class="rm-note muted">자동 저장: 잠들어 하루가 지났을 때 · 마수를 쓰러뜨린 직후 · 지역을 옮겼을 때.<br>회차 기록(몇 회차인지, 본 엔딩)은 슬롯과 따로 보관되어 불러오기 · 삭제로 바뀌지 않습니다.<br>내보내기 / 가져오기: 저장 기록을 글자로 옮겨 적어 두었다가 다시 붙여 넣을 수 있습니다. (브라우저 데이터가 지워질 때를 대비)</p></div>`;
  }

  function bindBody(body, run) {
    body.querySelectorAll('[data-itab]').forEach(b => b.onclick = () => { itemTab = b.dataset.itab; renderMenu(); });
    body.querySelectorAll('[data-snd-toggle]').forEach(b => b.onclick = () => { R.Audio.setOn(!R.Audio.isOn()); renderMenu(); });
    body.querySelectorAll('[data-snd-vol]').forEach(b => b.oninput = () => { R.Audio.setVolume(b.dataset.sndVol, b.value / 100); if (b.dataset.sndVol === 'se') R.Audio.se('hit'); });
    body.querySelectorAll('[data-alloc]').forEach(b => b.onclick = () => { R.allocPoint(run, b.dataset.alloc); renderMenu(); UI.refreshHud(); });
    body.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
      const id = b.dataset.use, it = R.ITEMS[id];
      if (it.warp) {
        if (WS.game.scenes.current !== 'world') { WS.game.ui.toast('여기서는 쓸 수 없다.', true); return; }
        UI.closeMenu(); R.scene && R.scene.warpHome(); R.take(run, id); return;
      }
      const res = R.useItem(run, id, 'field');
      WS.game.ui.toast(res.error || res.text, !!res.error);
      renderMenu(); UI.refreshHud();
    });
    body.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { equipSlot = b.dataset.slot; renderMenu(); });
    body.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
      R.equip(run, equipSlot, b.dataset.equip || null);
      renderMenu(); UI.refreshHud();
    });
    const game = WS.game, ui = game.ui;
    body.querySelectorAll('[data-sv-save]').forEach(b => b.onclick = async () => {
      const slot = b.dataset.svSave, why = R.Save.blockReason(game);
      if (why) { ui.toast(why, true); return; }
      if (R.Save.read(slot).status !== 'empty') {
        const ok = await ui.confirm({ title: R.Save.label(slot), body: '이 슬롯의 기록을 지금 진행으로 덮어씁니다.', yes: '덮어쓰기', no: '취소' });
        if (!ok) return;
      }
      const res = R.Save.write(slot, game);
      ui.toast(res.ok ? `${R.Save.label(slot)}에 저장했습니다.` : res.error, !res.ok);
      renderMenu();
    });
    body.querySelectorAll('[data-sv-load]').forEach(b => b.onclick = async () => {
      const slot = b.dataset.svLoad;
      if (R.Save.read(slot).status !== 'ok') { ui.toast('불러올 수 없는 기록입니다.', true); renderMenu(); return; }
      const ok = await ui.confirm({ title: `${R.Save.label(slot)} 불러오기`, body: '지금 진행 중인 내용 중 저장하지 않은 것은 사라집니다.', yes: '불러오기', no: '취소' });
      if (!ok) return;
      const res = R.Save.load(slot);
      if (!res.ok) ui.toast(res.error, true);
    });
    body.querySelectorAll('[data-sv-del]').forEach(b => b.onclick = async () => {
      const slot = b.dataset.svDel;
      const ok = await ui.confirm({ title: `${R.Save.label(slot)} 삭제`, body: '이 슬롯의 기록을 지웁니다. 되돌릴 수 없습니다.', yes: '삭제', no: '취소' });
      if (!ok) return;
      const res = R.Save.remove(slot);
      if (!res.ok) ui.toast(res.error, true);
      renderMenu();
    });
    body.querySelectorAll('[data-sv-export]').forEach(b => b.onclick = async () => {
      const text = R.Save.exportText(b.dataset.svExport);
      if (!text) { ui.toast('불러올 수 없는 기록입니다.', true); return; }
      const copy = await ui.confirm({ title: '저장 기록 내보내기', body: `<textarea id="rpg-export" class="sv-text" readonly>${text}</textarea><small>이 글자를 메모장 등에 붙여 넣어 보관하세요.</small>`, yes: '복사하기', no: '닫기' });
      if (!copy) return;
      try { await navigator.clipboard.writeText(text); ui.toast('복사했습니다.'); }
      catch (e) { ui.toast('복사하지 못했습니다. 글자를 직접 선택해 복사해 주세요.', true); }
    });
    body.querySelectorAll('[data-sv-import]').forEach(b => b.onclick = async () => {
      const slot = b.dataset.svImport;
      const ok = await ui.confirm({ title: `${R.Save.label(slot)}에 가져오기`, body: `<textarea id="rpg-import" class="sv-text" placeholder="WS30SAVE: 로 시작하는 글자를 붙여 넣으세요"></textarea><small>${R.Save.read(slot).status === 'empty' ? '' : '이 슬롯의 기록은 덮어씌워집니다.'}</small>`, yes: '가져오기', no: '취소' });
      if (!ok) return;
      const res = R.Save.importText(slot, document.getElementById('rpg-import').value);
      ui.toast(res.ok ? '가져왔습니다.' : res.error, !res.ok);
      renderMenu();
    });
    const svg = body.querySelector('.wm-lines');
    if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
  }

  // ---------------- 상점 ----------------
  UI.openShop = function (shopId) {
    mount();
    const def = R.SHOPS[shopId], run = WS.game.state;
    const el = $('#rpg-shop');
    let tab = 'buy';
    WS.game.ui.pushModal();
    el.classList.add('show');
    el.style.setProperty('--job', R.job(run).color);
    return new Promise(resolve => {
      const render = () => {
        const rp = run.rpg;
        el.querySelector('.rs-title').textContent = def.n;
        el.querySelector('.rs-gold').innerHTML = `${R.icon(159, 20)} 가진 돈 <b>${rp.gold.toLocaleString()} G</b>`;
        el.querySelector('.rm-tabs').innerHTML = `<button type="button" class="rm-tab${tab === 'buy' ? ' active' : ''}" data-t="buy">사기</button><button type="button" class="rm-tab${tab === 'sell' ? ' active' : ''}" data-t="sell">팔기</button>`;
        el.querySelectorAll('.rm-tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
        const body = el.querySelector('.rm-body');
        if (tab === 'buy') {
          body.innerHTML = '<div class="rm-list">' + def.items.map(id => {
            const it = R.ITEMS[id];
            const capped = def.gemLimit && it.cat === 'gem' && (rp.gemBought || 0) >= R.GEM_BUY_LIMIT;
            return `<div class="rm-item">${R.icon(it.icon, 32)}<div><b>${esc(it.n)}</b> <small>${R.KIND_LABEL[it.kind]} · 가진 수 ${R.count(run, id)}</small><p>${esc(it.d)}</p></div><button type="button" class="g-btn rm-mini" data-buy="${id}" ${rp.gold < it.price || capped ? 'disabled' : ''}>${capped ? '품절' : it.price + 'G'}</button></div>`;
          }).join('') + '</div>'
            + (def.gemLimit ? `<p class="rm-note muted">영혼의 보석은 이번 회차에 ${R.GEM_BUY_LIMIT}개까지 살 수 있습니다. (남은 수 ${Math.max(0, R.GEM_BUY_LIMIT - (rp.gemBought || 0))}개 · 필드에서 얻은 보석은 세지 않습니다)</p>` : '');
        } else {
          const ids = Object.keys(run.inventory).filter(id => R.ITEMS[id] && R.ITEMS[id].price > 0 && R.spare(run, id) > 0);
          body.innerHTML = ids.length ? '<div class="rm-list">' + ids.map(id => {
            const it = R.ITEMS[id], price = Math.max(1, Math.floor(it.price / 2));
            return `<div class="rm-item">${R.icon(it.icon, 32)}<div><b>${esc(it.n)}</b> <small>×${R.spare(run, id)}</small><p>${esc(it.d)}</p></div><button type="button" class="g-btn rm-mini" data-sell="${id}">${price}G</button></div>`;
          }).join('') + '</div>' : '<p class="muted">팔 수 있는 것이 없습니다. (장착 중인 장비는 팔 수 없습니다)</p>';
        }
        body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
          const it = R.ITEMS[b.dataset.buy];
          if (rp.gold < it.price) return;
          if (def.gemLimit && it.cat === 'gem') { if ((rp.gemBought || 0) >= R.GEM_BUY_LIMIT) return; rp.gemBought = (rp.gemBought || 0) + 1; }
          rp.gold -= it.price; R.give(run, b.dataset.buy);
          WS.game.ui.toast(`「${it.n}」을(를) 샀다`);
          render(); UI.refreshHud();
        });
        body.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
          const id = b.dataset.sell, it = R.ITEMS[id];
          if (R.spare(run, id) <= 0) return;
          R.take(run, id); rp.gold += Math.max(1, Math.floor(it.price / 2));
          render(); UI.refreshHud();
        });
      };
      el.querySelector('.rm-close').onclick = e => {
        e.stopPropagation();
        el.classList.remove('show');
        WS.game.ui.popModal();
        UI.refreshHud();
        resolve();
      };
      render();
    });
  };

  // ---------------- 목록 고르기 (탑지기 등) ----------------
  UI.pick = function (title, options) {
    mount();
    const el = $('#rpg-shop');
    WS.game.ui.pushModal();
    el.classList.add('show');
    el.querySelector('.rs-title').textContent = title;
    el.querySelector('.rm-tabs').innerHTML = '';
    el.querySelector('.rs-gold').innerHTML = '';
    const body = el.querySelector('.rm-body');
    body.innerHTML = '<div class="rm-list">' + options.map((o, i) => `<button type="button" class="g-btn rm-pickbtn" data-i="${i}">${esc(o)}</button>`).join('') + '</div>';
    return new Promise(resolve => {
      const close = v => { el.classList.remove('show'); WS.game.ui.popModal(); resolve(v); };
      body.querySelectorAll('[data-i]').forEach(b => b.onclick = e => { e.stopPropagation(); close(+b.dataset.i); });
      el.querySelector('.rm-close').onclick = e => { e.stopPropagation(); close(-1); };
    });
  };

  // 키보드: M 메뉴
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.key === 'm' || e.key === 'M' || e.key === 'x' || e.key === 'X') && WS.game && WS.game.state.rpg && (WS.game.stage.view instanceof R.WorldView || (WS.game.scenes.current === 'heroRoom' && WS.game.stage.view instanceof WS.MapView))) {
      if (menuOpen) UI.closeMenu();
      else if (!WS.game.ui.modalOpen && WS.game.ui.dialogue.mode === 'idle') UI.openMenu();
    }
    if (e.key === 'Escape' && menuOpen) UI.closeMenu();
  });
})();
