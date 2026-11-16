// =============================================================
//  전투 화면 UI (하단 카드, 코스트, 버튼, 드래그·터치 입력)
// =============================================================
const BattleUI = (() => {
  let b = null, root = null, canvas = null, ctx = null, k = 1;
  let raf = 0, last = 0, paused = false, speed = 1, page = 1, ended = false;
  let drag = null, selected = null, menuUnit = null, canvasDown = null;
  let tut = null;
  const el = {};
  let shopKey = '';

  const $ = (sel, r) => (r || root).querySelector(sel);
  const CFG = () => GAME_CONFIG;

  function h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

  // ---------- 시작 / 종료 ----------
  function start(stageId) {
    stop();
    const st = STAGES.find(s => s.id === stageId);
    const party = CHARACTERS.map(c => c.id);
    b = Battle.create(stageId, party);
    Render.layout(b);
    paused = false; ended = false; page = 1; drag = null; selected = null; menuUnit = null;
    speed = (Save.data.settings && Save.data.settings.speed) || 1;
    shopKey = '';

    root = h(`<div class="screen battle">
      <canvas class="battle-canvas"></canvas>
      <div class="hud-tl">
        <button class="hbtn pause" title="일시정지">❚❚</button>
        <button class="hbtn speed">▶ ×1</button>
        <div class="cmd-wrap"></div>
      </div>
      <div class="hud-tc"><div class="st-name"></div><div class="wave-no"></div><div class="wave-timer"></div></div>
      <div class="hud-tr">
        <div class="stat base"><span class="ico">◆</span><span class="lbl">기지</span><b class="v"></b></div>
        <div class="stat foes"><span class="ico">✦</span><span class="lbl">남은 적</span><b class="v"></b></div>
      </div>
      <div class="banner"></div>
      <div class="boss-talk"></div>
      <div class="tutorial hidden"><div class="tut-text"></div><button class="tut-ok">확인</button></div>
      <div class="toast"></div>
      <div class="hint"></div>
      <div class="bottom">
        <div class="tabs">
          <button class="tab t1 on"><small>page 1</small>캐릭터</button>
          <button class="tab t2"><small>page 2</small>강화</button>
        </div>
        <div class="cards chars"></div>
        <div class="cards shop hidden"></div>
        <div class="costbox">
          <svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="50"/><circle class="fg" cx="60" cy="60" r="50"/></svg>
          <div class="cost-num"></div><div class="cost-lbl">코스트</div>
        </div>
      </div>
      <div class="unit-menu hidden"></div>
      <div class="ghost hidden"></div>
      <div class="overlay pause-ov hidden">
        <div class="panel">
          <h2>일시정지</h2>
          <button class="btn resume">계속하기</button>
          <button class="btn restart">처음부터 다시</button>
          <button class="btn quit">포기하고 나가기</button>
        </div>
      </div>
    </div>`);
    App.mount(root);
    canvas = $('.battle-canvas');
    ctx = canvas.getContext('2d');
    resize();

    $('.st-name').textContent = `${st.code}  ${st.name}`;
    buildCharCards();
    buildCommander();
    bindInput();
    el.costFg = $('.costbox .fg');
    el.costNum = $('.cost-num');
    el.base = $('.hud-tr .base .v');
    el.foes = $('.hud-tr .foes .v');
    el.waveNo = $('.wave-no');
    el.waveTimer = $('.wave-timer');
    updateSpeedBtn();

    // 튜토리얼
    tut = null;
    if (st.tutorial && !Save.stageCleared(st.id)) {
      tut = { shown: new Set() };
      triggerTutorial('start');
    }

    last = performance.now();
    raf = requestAnimationFrame(frame);
    window.__battle = b;
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    b = null;
    unbindInput();
  }

  function resize() {
    if (!canvas) return;
    k = Math.max(1, Math.min(2.5, App.scale * (window.devicePixelRatio || 1)));
    canvas.width = Math.round(Render.W * k);
    canvas.height = Math.round(Render.H * k);
  }

  // ---------- 카드 ----------
  function faceEl(id, w, hgt) {
    const cv = Assets.faceCanvas(id, w, hgt);
    const ch = Battle.charDef(id);
    const color = CFG().classes[ch.cls].color;
    if (cv) { cv.className = 'face-cv'; return cv; }
    return h(`<div class="face-fallback" style="background:radial-gradient(circle at 50% 40%, ${color}, #1b2030)">${ch.name.slice(0, 1)}</div>`);
  }

  function buildCharCards() {
    const wrap = $('.cards.chars');
    wrap.innerHTML = '';
    el.cards = {};
    for (const c of b.cards) {
      const ch = Battle.charDef(c.id);
      const cls = CFG().classes[ch.cls];
      const card = h(`<div class="ccard" data-id="${c.id}" style="--cls:${cls.color}">
        <div class="face"></div>
        <div class="cost">${ch.cost}</div>
        <div class="info"><span class="cls">${cls.name}</span><span class="nm">${ch.name}</span></div>
        <div class="redeploy">재배치 ${ch.redeploy}초</div>
        <div class="cd hidden"><span></span></div>
        <div class="dep hidden">배치 중</div>
      </div>`);
      card.querySelector('.face').appendChild(faceEl(c.id, 150, 120));
      card.addEventListener('pointerdown', ev => startDrag(ev, { kind: 'char', id: c.id }, card));
      wrap.appendChild(card);
      el.cards[c.id] = { card, cd: card.querySelector('.cd'), cdTxt: card.querySelector('.cd span'), dep: card.querySelector('.dep'), state: '' };
    }
  }

  function buildShop() {
    const wrap = $('.cards.shop');
    wrap.innerHTML = '';
    el.shop = [];
    b.shop.forEach((id, slot) => {
      const card = UPGRADE_CARDS.find(c => c.id === id);
      if (!card) { wrap.appendChild(h('<div class="ucard empty">-</div>')); el.shop.push(null); return; }
      const kind = CARD_KINDS[card.kind];
      const scope = { all: '전체', single: '개별', base: '기지' }[card.scope];
      const node = h(`<div class="ucard ${card.kind}" style="--kind:${kind.color}">
        <div class="u-kind">${kind.name}</div>
        <div class="u-name">${card.name}</div>
        <div class="u-scope">${scope}${card.scope === 'single' ? ' · 캐릭터에게 끌어놓기' : ''}</div>
        <div class="u-desc">${card.desc}</div>
        <div class="u-cost">${card.cost}</div>
      </div>`);
      node.addEventListener('pointerdown', ev => startDrag(ev, { kind: 'upg', slot, card }, node));
      wrap.appendChild(node);
      el.shop.push(node);
    });
    const rr = h(`<button class="reroll"><div>카드 뽑기</div><div class="rc"></div><small>3장을 새로 바꿈</small></button>`);
    rr.addEventListener('click', () => {
      const r = Battle.reroll(b);
      if (r === 'cost') toast('코스트가 부족합니다');
    });
    wrap.appendChild(rr);
    el.reroll = rr;
  }

  function buildCommander() {
    const wrap = $('.cmd-wrap');
    el.cmd = {};
    for (const sk of CFG().commanderSkills) {
      const btn = h(`<button class="hbtn cmd" title="${sk.desc}"><b>${sk.name}</b><small>${sk.desc}</small></button>`);
      btn.addEventListener('click', () => {
        if (Battle.useCommander(b, sk.id) === 'ok') toast(`지휘관 스킬 「${sk.name}」!`);
      });
      wrap.appendChild(btn);
      el.cmd[sk.id] = btn;
    }
  }

  function setPage(p) {
    page = p;
    $('.tab.t1').classList.toggle('on', p === 1);
    $('.tab.t2').classList.toggle('on', p === 2);
    $('.cards.chars').classList.toggle('hidden', p !== 1);
    $('.cards.shop').classList.toggle('hidden', p !== 2);
    selected = null;
  }

  // ---------- 입력 ----------
  function gamePoint(ev) {
    const r = App.gameEl.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / App.scale, y: (ev.clientY - r.top) / App.scale };
  }

  function startDrag(ev, info, node) {
    if (!b || paused || ended) return;
    ev.preventDefault();
    closeMenu();
    const p = gamePoint(ev);
    drag = Object.assign({ x0: p.x, y0: p.y, moved: false, node }, info);
  }

  function onMove(ev) {
    if (!b) return;
    const p = gamePoint(ev);
    if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) > 12) {
        drag.moved = true;
        selected = null;
        showGhost(drag);
      }
      if (drag.moved) {
        const g = $('.ghost');
        g.style.left = p.x + 'px'; g.style.top = p.y + 'px';
        drag.tile = Render.tileFromPoint(b, p.x, p.y);
      }
    }
  }

  function onUp(ev) {
    if (!b) return;
    const p = gamePoint(ev);
    if (drag) {
      const d = drag; drag = null;
      $('.ghost').classList.add('hidden');
      if (d.moved) {
        const tile = Render.tileFromPoint(b, p.x, p.y);
        if (d.kind === 'char') tryDeploy(d.id, tile);
        else if (d.kind === 'upg') {
          if (d.card.scope === 'single') tryBuySingle(d.slot, tile);
          else if (p.y < 660) tryBuy(d.slot);
        }
      } else {
        // 탭: 선택 모드
        if (d.kind === 'char') {
          const st = Battle.cardState(b, d.id);
          if (!st.ready) toast(st.card.deployed ? '이미 배치되어 있습니다' : '재배치 대기 중입니다');
          else if (selected && selected.kind === 'char' && selected.id === d.id) selected = null;
          else { selected = { kind: 'char', id: d.id }; hint(`${st.ch.name}: 배치할 칸을 누르세요`); }
        } else if (d.kind === 'upg') {
          if (d.card.scope === 'single') {
            const chk = Battle.cardUsable(b, d.card);
            if (!chk.ok) toast(chk.why);
            else { selected = { kind: 'upg', slot: d.slot, card: d.card }; hint(`「${d.card.name}」: 적용할 캐릭터를 누르세요`); }
          } else tryBuy(d.slot);
        }
      }
      return;
    }
    if (canvasDown && ev.target === canvas) {
      if (Math.hypot(p.x - canvasDown.x, p.y - canvasDown.y) < 20) onCanvasTap(p);
    }
    canvasDown = null;
  }

  function onCanvasDown(ev) {
    if (!b || paused) return;
    ev.preventDefault();
    canvasDown = gamePoint(ev);
  }

  function onCanvasTap(p) {
    const tile = Render.tileFromPoint(b, p.x, p.y);
    if (selected && selected.kind === 'char') { tryDeploy(selected.id, tile); selected = null; hint(''); return; }
    if (selected && selected.kind === 'upg') { tryBuySingle(selected.slot, tile); selected = null; hint(''); return; }
    const u = tile && Battle.unitAt(b, tile.c, tile.r);
    if (u && u.state === 'alive') openMenu(u); else closeMenu();
  }

  function tryDeploy(id, tile) {
    if (!tile) return;
    const r = Battle.deploy(b, id, tile.c, tile.r);
    if (r === 'cost') toast('코스트가 부족합니다');
    else if (r === 'tile') {
      const ch = Battle.charDef(id);
      toast(ch.tile === 'ground' ? '지상 직군은 진격로 위 지상 칸(점선)에만 놓을 수 있어요' : '원거리 직군은 언덕 칸에만 놓을 수 있어요');
    } else if (r === 'cooldown') toast('재배치 대기 중입니다');
  }

  function tryBuy(slot) {
    const r = Battle.buyCard(b, slot, null);
    if (r !== 'ok') toast(r);
  }

  function tryBuySingle(slot, tile) {
    const u = tile && Battle.unitAt(b, tile.c, tile.r);
    if (!u || u.state !== 'alive') { toast('맵 위 캐릭터에게 끌어다 놓으세요'); return; }
    const r = Battle.buyCard(b, slot, u);
    if (r !== 'ok') toast(r); else toast(`${u.ch.name}에게 적용!`);
  }

  function showGhost(d) {
    const g = $('.ghost');
    g.innerHTML = '';
    if (d.kind === 'char') {
      const ch = Battle.charDef(d.id);
      g.appendChild(faceEl(d.id, 80, 80));
      g.appendChild(h(`<span>${ch.name}</span>`));
    } else {
      g.appendChild(h(`<span class="g-upg" style="--kind:${CARD_KINDS[d.card.kind].color}">${d.card.name}</span>`));
    }
    g.classList.remove('hidden');
  }

  // 캐릭터 메뉴
  function openMenu(u) {
    menuUnit = u;
    const m = $('.unit-menu');
    m.innerHTML = `<div class="um-title"></div>
      <button class="um-skill"><b>스킬</b><small></small></button>
      <button class="um-retreat"><b>퇴각</b><small>코스트 +${Math.floor(u.ch.cost * CFG().retreatRefund)}</small></button>`;
    m.querySelector('.um-skill').addEventListener('click', ev => {
      ev.stopPropagation();
      const r = Battle.useSkill(b, u);
      if (!r.ok) { if (r.why) toast(r.why); } else closeMenu();
    });
    m.querySelector('.um-retreat').addEventListener('click', ev => {
      ev.stopPropagation(); Battle.retreat(b, u); closeMenu();
    });
    m.classList.remove('hidden');
    updateMenu();
  }
  function closeMenu() { menuUnit = null; if (root) $('.unit-menu').classList.add('hidden'); }
  function updateMenu() {
    if (!menuUnit) return;
    const u = menuUnit;
    if (u.state !== 'alive' || !b.units.includes(u)) { closeMenu(); return; }
    const m = $('.unit-menu');
    const x = Render.sx(b, u.x), y = Render.sy(b, u.y);
    m.style.left = Math.min(1600 - 230, Math.max(10, x + b.tile * 0.55)) + 'px';
    m.style.top = Math.min(640, Math.max(70, y - 80)) + 'px';
    const sk = u.ch.skill;
    const s = Battle.stats(b, u);
    m.querySelector('.um-title').innerHTML = `<b>${u.ch.name}</b> Lv.${u.level} <span>HP ${Math.ceil(u.hp)}/${u.maxHp}</span>`;
    const chk = Battle.skillUsable(b, u);
    const sb = m.querySelector('.um-skill');
    sb.disabled = !chk.ok;
    sb.classList.toggle('ready', chk.ok);
    sb.querySelector('b').textContent = sk.name;
    sb.querySelector('small').textContent = u.skillActive > 0 ? `발동 중 ${u.skillActive.toFixed(1)}초`
      : u.sp >= sk.sp ? (chk.ok ? '사용 가능!' : chk.why) : `게이지 ${Math.floor(u.sp)} / ${sk.sp}`;
    void s;
  }

  function onKey(ev) {
    if (!b) return;
    if (ev.key === 'Escape') togglePause();
    if (ev.key === ' ') { ev.preventDefault(); toggleSpeed(); }
  }

  let bound = false;
  function bindInput() {
    canvas.addEventListener('pointerdown', onCanvasDown);
    $('.pause').addEventListener('click', togglePause);
    $('.speed').addEventListener('click', toggleSpeed);
    $('.tab.t1').addEventListener('click', () => setPage(1));
    $('.tab.t2').addEventListener('click', () => setPage(2));
    $('.resume').addEventListener('click', togglePause);
    $('.restart').addEventListener('click', () => start(b.st.id));
    $('.quit').addEventListener('click', () => { const id = b.st.id; stop(); App.goto('stages', { focus: id }); });
    $('.tut-ok').addEventListener('click', () => $('.tutorial').classList.add('hidden'));
    if (!bound) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKey);
      bound = true;
    }
  }
  function unbindInput() { /* 창 이벤트는 b 가 없으면 무시되므로 유지 */ }

  function togglePause() {
    if (ended) return;
    paused = !paused;
    $('.pause-ov').classList.toggle('hidden', !paused);
    drag = null; $('.ghost').classList.add('hidden');
  }
  function toggleSpeed() {
    speed = speed === 1 ? 2 : 1;
    Save.data.settings.speed = speed; Save.save();
    updateSpeedBtn();
  }
  function updateSpeedBtn() { const s = $('.speed'); s.textContent = speed === 2 ? '▶▶ ×2' : '▶ ×1'; s.classList.toggle('on', speed === 2); }

  // ---------- 알림 ----------
  let toastT = 0, bannerT = 0, bossT = 0;
  function toast(text) { const t = $('.toast'); t.textContent = text; t.classList.add('show'); toastT = 2; }
  function hint(text) { const t = $('.hint'); t.textContent = text; t.classList.toggle('show', !!text); }
  function banner(html, dur) { const t = $('.banner'); t.innerHTML = html; t.classList.add('show'); bannerT = dur || 4; }

  function triggerTutorial(trigger) {
    if (!tut || tut.shown.has(trigger)) return;
    const step = TUTORIAL_STEPS.find(s => s.trigger === trigger);
    if (!step) return;
    tut.shown.add(trigger);
    const box = $('.tutorial');
    box.querySelector('.tut-text').innerHTML = step.text.replace(/\n/g, '<br>');
    box.classList.remove('hidden');
    if (step.holdWave) b.hold = true;
  }

  function processEvents() {
    const evs = b.events; b.events = [];
    for (const e of evs) {
      switch (e.type) {
        case 'wavePreview':
          banner(`<small>다음 웨이브 ${e.index + 1} / ${b.st.waves.length}</small><div>${e.text}</div>`, 4.5);
          break;
        case 'waveStart':
          banner(`<div class="big">WAVE ${e.index + 1}</div>`, 1.6);
          if (e.index === 1) triggerTutorial('wave2');
          break;
        case 'deploy':
          triggerTutorial('deploy');
          break;
        case 'block': triggerTutorial('block'); break;
        case 'skillReady': triggerTutorial('skillReady'); break;
        case 'bossTalk': {
          const t = $('.boss-talk');
          t.innerHTML = `<b>${e.name}</b><span>${e.text}</span>`; t.classList.add('show'); bossT = 4.5;
          break;
        }
        case 'leak': toast(`기지 피해 −${e.damage}`); break;
        case 'fallen': toast(`${Battle.charDef(e.id).name} 쓰러짐… 재배치 대기`); break;
        case 'toast': toast(e.text); break;
        case 'end': onEnd(); break;
      }
    }
  }

  function onEnd() {
    if (ended) return;
    ended = true;
    closeMenu();
    const res = b.result, st = b.st, party = b.party.slice();
    banner(res.win ? '<div class="big">작전 성공</div>' : '<div class="big lose">작전 실패</div>', 3);
    setTimeout(() => {
      if (!root || !root.isConnected) return;
      let reward = null;
      if (res.win) reward = Save.applyVictory(st, res.stars, party);
      stop();
      App.goto('result', { stageId: st.id, win: res.win, stars: res.stars || 0, lost: res.lost, reward });
    }, 1800);
  }

  // ---------- HUD 갱신 ----------
  function updateHUD(dt) {
    const max = CFG().cost.max;
    const C = 2 * Math.PI * 50;
    const frac = b.cost >= max ? 1 : b.cost - Math.floor(b.cost);
    el.costFg.style.strokeDasharray = C;
    el.costFg.style.strokeDashoffset = C * (1 - frac);
    el.costNum.textContent = Math.floor(b.cost);
    el.base.textContent = b.baseHp;
    el.base.parentNode.classList.toggle('danger', b.baseHp <= 3);
    el.foes.textContent = `${Battle.remainingEnemies(b)} / ${b.totalEnemies}`;
    const w = b.wave;
    const shownWave = Math.max(1, Math.min(b.st.waves.length, w.index + 1));
    el.waveNo.textContent = `WAVE ${w.index < 0 ? 0 : shownWave} / ${b.st.waves.length}`;
    el.waveTimer.textContent = (w.state === 'prep' || w.state === 'rest')
      ? (b.hold ? '첫 캐릭터를 배치하면 시작' : `다음 웨이브까지 ${Math.ceil(w.timer)}초`) : '';

    // 캐릭터 카드
    for (const c of b.cards) {
      const r = el.cards[c.id];
      const ch = Battle.charDef(c.id);
      const afford = b.cost >= ch.cost;
      const state = c.deployed ? 'dep' : c.cooldown > 0 ? 'cd' : afford ? 'ok' : 'poor';
      const sel = selected && selected.kind === 'char' && selected.id === c.id;
      if (r.state !== state + sel) {
        r.state = state + sel;
        r.card.classList.toggle('disabled', state !== 'ok');
        r.card.classList.toggle('poor', state === 'poor');
        r.card.classList.toggle('selected', !!sel);
        r.dep.classList.toggle('hidden', state !== 'dep');
        r.cd.classList.toggle('hidden', state !== 'cd');
      }
      if (state === 'cd') {
        r.cdTxt.textContent = Math.ceil(c.cooldown) + '초';
        r.cd.style.setProperty('--p', (c.cooldown / c.cooldownMax).toFixed(3));
      }
    }
    // 상점
    const key = b.shop.join('|');
    if (key !== shopKey) { shopKey = key; buildShop(); }
    b.shop.forEach((id, i) => {
      const node = el.shop[i]; if (!node) return;
      const card = UPGRADE_CARDS.find(c => c.id === id);
      const ok = Battle.cardUsable(b, card).ok;
      node.classList.toggle('disabled', !ok);
      node.classList.toggle('selected', !!(selected && selected.kind === 'upg' && selected.slot === i));
    });
    if (el.reroll) {
      el.reroll.querySelector('.rc').textContent = `코스트 ${b.rerollCost}`;
      el.reroll.classList.toggle('disabled', b.cost < b.rerollCost);
    }
    for (const id in el.cmd) el.cmd[id].classList.toggle('used', !!b.cmdUsed[id]);

    updateMenu();
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('.toast').classList.remove('show'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('.banner').classList.remove('show'); }
    if (bossT > 0) { bossT -= dt; if (bossT <= 0) $('.boss-talk').classList.remove('show'); }
    if (selected === null) { const ht = $('.hint'); if (ht.classList.contains('show')) hint(''); }
  }

  function uiState() {
    const ui = {};
    let charId = null, upg = null;
    if (drag && drag.moved) { if (drag.kind === 'char') charId = drag.id; else upg = drag.card; }
    else if (selected) { if (selected.kind === 'char') charId = selected.id; else upg = selected.card; }
    if (charId) {
      ui.validTiles = [];
      for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (Battle.canPlace(b, charId, c, r)) ui.validTiles.push({ c, r });
      const t = drag && drag.moved ? drag.tile : null;
      if (t && Battle.canPlace(b, charId, t.c, t.r)) {
        ui.hoverTile = t;
        const ch = Battle.charDef(charId);
        ui.rangeAt = { x: t.c, y: t.r, r: ch.range + Battle.RANGE_PAD };
      }
    }
    if (upg && upg.scope === 'single') ui.unitTargets = b.units.filter(u => u.state === 'alive');
    if (menuUnit) {
      const s = Battle.stats(b, menuUnit);
      ui.rangeAt = { x: menuUnit.x, y: menuUnit.y, r: s.range + Battle.RANGE_PAD };
    }
    return ui;
  }

  // ---------- 루프 ----------
  function frame(now) {
    if (!b) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      let sim = dt * speed;
      while (sim > 0 && b) { const s = Math.min(sim, 1 / 30); Battle.update(b, s); sim -= s; }
    }
    if (!b) return;
    processEvents();
    if (!b) return;
    updateHUD(dt);
    Render.draw(ctx, b, uiState(), k);
    raf = requestAnimationFrame(frame);
  }

  return { start, stop, resize, get battle() { return b; } };
})();
