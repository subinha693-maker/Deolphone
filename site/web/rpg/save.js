/*
 * 세이브 / 로드 — 수동 슬롯 3개 + 자동 저장 슬롯 1개
 * ------------------------------------------------------------
 * 저장 위치 (localStorage)
 *   whitespace.slot.1 / .2 / .3   수동 슬롯
 *   whitespace.slot.auto          자동 저장 (잠든 뒤 · 마수 처치 직후 · 지역 이동)
 *   whitespace.meta.v1            회차 메타 데이터 — 슬롯과 따로 있다. 불러오기 · 삭제로 되돌아가지 않는다.
 *   whitespace.save.v1            (예전 단일 저장) 있으면 처음 실행할 때 빈 수동 슬롯으로 옮긴다.
 *
 * 슬롯 데이터: { format, savedAt, summary, state }
 *   state = game.state(run) 전체. 위치 · 레벨 · 장비 · 소지품 · 날짜 · 게이지 · 잠자리 · 마수 처치 ·
 *           상자 · 방문 · 이벤트 · 플래그 등 run 에 들어 있는 것은 모두 그대로 저장된다.
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const S = R.Save = {};
  S.FORMAT = 3;   // 3: 능력치 상향(체력 · 마나 ×4.5) 이후. 2 이하의 기록은 불러올 때 현재 체력 · 마나를 같은 비율로 환산한다
  S.SLOTS = ['1', '2', '3', 'auto'];
  S.KEY = slot => 'whitespace.slot.' + slot;
  S.LEGACY_KEY = 'whitespace.save.v1';
  S.AUTO_INTERVAL = 10000;      // 자동 저장 최소 간격 (ms) — 지역 이동 때만 적용
  S.label = slot => (slot === 'auto' ? '자동 저장' : `슬롯 ${slot}`);

  // ---------------- 검사 ----------------
  /** 불러와도 되는 상태인지 (필드 누락 · 잘못된 값이면 false) */
  S.valid = function (state) {
    try {
      if (!state || typeof state !== 'object') return false;
      const p = state.player, rp = state.rpg;
      if (!p || !p.jobId || !WS.BALANCE.STATS[p.jobId] || !Array.isArray(p.abilities)) return false;
      // 흰 공간을 마치고 주인공의 방에 있는 상태 (아직 RPG 상태가 없다 — 처음 문을 나서기 전)
      if (!rp) return state.sceneId === 'heroRoom' && !!p.awakened && !!state.flags && !!state.scenes && !!state.inventory;
      if (typeof rp !== 'object') return false;
      for (const k of ['lv', 'exp', 'day', 'gauge', 'gold', 'hp', 'mp', 'x', 'y']) if (typeof rp[k] !== 'number' || !isFinite(rp[k])) return false;
      if (!(rp.map === 'tower_f' || R.mapDef(rp.map))) return false;
      if (rp.map === 'tower_f' && !(rp.towerFloor >= 1)) return false;
      if (!rp.equip || !Array.isArray(rp.equip.acc) || !rp.alloc || !rp.bed || !R.mapDef(rp.bed.map)) return false;
      if (!state.inventory || typeof state.inventory !== 'object') return false;
      if (!state.flags || typeof state.flags !== 'object' || !state.scenes || typeof state.scenes !== 'object') return false;
      return true;
    } catch (e) { return false; }
  };

  S.summary = function (state) {
    const rp = state.rpg || { day: 1, lv: 1 }, job = WS.getJob(state.player.jobId);
    const place = state.sceneId === 'heroRoom' ? '클레어의 방' : rp.map === 'tower_f' ? `끝없는 탑 ${rp.towerFloor}층` : (R.mapDef(rp.map) || {}).n;
    return { day: rp.day, lv: rp.lv, job: job ? job.name : '', place: place || '', loop: state.loop || 1 };
  };

  /** 슬롯 읽기 → { status: 'empty' } | { status: 'ok', data } | { status: 'broken' } | { status: 'nostorage' } */
  S.read = function (slot) {
    let raw;
    try { raw = R.Store.get(S.KEY(slot)); } catch (e) { return { status: 'nostorage' }; }
    if (raw == null) return { status: 'empty' };
    try {
      const data = JSON.parse(raw);
      if (!data || data.format > S.FORMAT || !S.valid(data.state)) return { status: 'broken' };
      return { status: 'ok', data };
    } catch (e) { return { status: 'broken' }; }
  };

  function writeRaw(key, obj) {
    try {
      R.Store.set(key, JSON.stringify(obj));     // 메모리 + 브라우저 + 아티팩트 서버 (rpg/store.js)
      return { ok: true };
    } catch (e) {
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      return { ok: false, error: quota ? '저장 공간이 가득 차서 저장하지 못했습니다.' : '이 브라우저에서는 저장할 수 없습니다. (저장소가 꺼져 있거나 막혀 있습니다)' };
    }
  }

  S.write = function (slot, game) {
    const state = game.state;
    if (!S.valid(state)) return { ok: false, error: '지금 상태는 저장할 수 없습니다.' };
    return writeRaw(S.KEY(slot), { format: S.FORMAT, savedAt: Date.now(), summary: S.summary(state), state });
  };

  S.remove = function (slot) {
    try { R.Store.remove(S.KEY(slot)); return { ok: true }; } catch (e) { return { ok: false, error: '이 브라우저에서는 기록을 지울 수 없습니다.' }; }
  };

  /** 가장 최근에 저장한 슬롯 */
  S.latest = function () {
    let best = null, t = -1;
    for (const slot of S.SLOTS) {
      const r = S.read(slot);
      if (r.status === 'ok' && r.data.savedAt > t) { t = r.data.savedAt; best = slot; }
    }
    return best;
  };

  S.any = () => S.SLOTS.some(s => ['ok', 'broken'].includes(S.read(s).status));

  // ---------------- 예전 단일 저장 → 수동 슬롯으로 옮기기 ----------------
  S.migrate = function () {
    let raw;
    try { raw = R.Store.get(S.LEGACY_KEY); } catch (e) { return; }
    if (raw == null) return;
    let data;
    try { data = JSON.parse(raw); } catch (e) { console.warn('[save] 예전 저장 기록을 읽을 수 없어 그대로 둡니다.'); return; }
    if (!data || !S.valid(data.state)) { console.warn('[save] 예전 저장 기록이 손상되어 그대로 둡니다.'); return; }
    const target = ['1', '2', '3'].find(s => S.read(s).status === 'empty');
    if (!target) { console.warn('[save] 빈 수동 슬롯이 없어 예전 저장 기록을 옮기지 못했습니다.'); return; }
    const res = writeRaw(S.KEY(target), { format: 1, savedAt: data.savedAt || Date.now(), summary: S.summary(data.state), state: data.state, migrated: true });
    if (res.ok) { try { R.Store.remove(S.LEGACY_KEY); } catch (e) { /* 옮긴 뒤 지우지 못해도 기록은 남아 있다 */ } }
  };
  // 지역 정의(maps.js)가 모두 읽힌 뒤에 옮긴다. 시작 화면의 '이어하기'보다 먼저 실행된다 (이 파일이 먼저 등록하므로).
  window.addEventListener('DOMContentLoaded', () => S.migrate());
  R.Store.onChange(() => S.migrate());          // 서버에서 예전 단일 저장을 받아 왔을 때

  // ---------------- 저장 가능 여부 ----------------
  /** 저장할 수 없으면 이유(한 줄), 가능하면 null */
  S.blockReason = function (game) {
    const scene = R.scene;
    if (!game || !game.state) return '아직 저장할 수 없습니다.';
    if (!game.state.rpg && game.scenes.current !== 'heroRoom') return '아직 저장할 수 없습니다.';
    if (R.Battle && R.Battle.current) return '전투 중에는 저장할 수 없습니다.';
    if (game.scenes.busy || (scene && scene.busy)) return '장면이 바뀌는 중에는 저장할 수 없습니다.';
    if (game.ui.dialogue.mode !== 'idle') return '대화 중에는 저장할 수 없습니다.';
    const v = game.stage.view;
    const inRoom = game.scenes.current === 'heroRoom' && v instanceof WS.MapView;   // 주인공의 방에서도 저장 가능
    if (!(v instanceof R.WorldView || inRoom) || v.mode !== 'explore') return '이벤트 중에는 저장할 수 없습니다.';
    return null;
  };

  // ---------------- 자동 저장 ----------------
  let lastAuto = 0, lastFailToast = 0;
  /**
   * reason: 'sleep' | 'boss' | 'move' | 'start'
   * 지역 이동(move)만 최소 간격을 지킨다. 잠 · 마수 처치는 항상 저장한다.
   */
  S.autosave = function (game, reason) {
    const now = Date.now();
    if (reason === 'move' && now - lastAuto < S.AUTO_INTERVAL) return { ok: false, skipped: true };
    const res = S.write('auto', game);
    if (res.ok) lastAuto = now;
    else if (now - lastFailToast > 15000) { lastFailToast = now; game.ui.toast('자동 저장 실패: ' + res.error, true); }
    return res;
  };
  // 예전 호출(R.save)은 자동 저장으로
  R.save = game => S.autosave(game, 'sleep').ok;
  R.loadSave = () => { const s = S.latest(); return s ? S.read(s).data : null; };

  // ---------------- 불러오기 ----------------
  /** 슬롯의 상태로 게임을 다시 시작한다 (world 장면에서 저장했던 위치 그대로) */
  S.load = function (slot) {
    const r = S.read(slot);
    if (r.status !== 'ok') return { ok: false, error: '불러올 수 없는 기록입니다.' };
    const game = WS.game;
    if (R.UI && R.UI.menuOpen && R.UI.menuOpen()) R.UI.closeMenu();
    game.runner.stop();
    R.pendingLoad = S.upgrade(JSON.parse(JSON.stringify(r.data.state)), r.data.format || 1);
    // 방에서 저장한 기록은 방에서, 나머지는 필드에서 시작한다
    game.newGame({ scene: R.pendingLoad.sceneId === 'heroRoom' ? 'heroRoom' : 'world' });
    game.entry = { scene: 'whiteSpace' };   // '처음부터' 는 흰 공간부터
    return { ok: true };
  };

  /** 예전 형식의 기록을 지금 형식으로 (불러올 때) */
  S.upgrade = function (state, format) {
    const rp = state.rpg;
    if (rp && format < 3) {
      // 체력 · 마나의 최대치가 ×4.5 가 되었으므로 남은 양도 ×4.5 → 최대치에 대한 비율이 그대로 유지된다
      rp.hp = Math.round(rp.hp * R.STAT_SCALE.hp);
      rp.mp = Math.round(rp.mp * R.STAT_SCALE.mp);
    }
    if (rp) R.ensure(state);          // 빠진 필드 채우기 · 최대치로 맞추기
    return state;
  };

  // ---------------- 텍스트로 내보내기 · 가져오기 ----------------
  const PREFIX = 'WS30SAVE:';
  S.exportText = function (slot) {
    const r = S.read(slot);
    if (r.status !== 'ok') return null;
    return PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(r.data))));
  };
  S.importText = function (slot, text) {
    try {
      const t = String(text || '').trim();
      if (!t.startsWith(PREFIX)) return { ok: false, error: '저장 기록 텍스트가 아닙니다.' };
      const data = JSON.parse(decodeURIComponent(escape(atob(t.slice(PREFIX.length)))));
      if (!data || !S.valid(data.state)) return { ok: false, error: '불러올 수 없는 기록입니다.' };
      return writeRaw(S.KEY(slot), { format: data.format || 2, savedAt: data.savedAt || Date.now(), summary: S.summary(data.state), state: data.state });
    } catch (e) { return { ok: false, error: '불러올 수 없는 기록입니다.' }; }
  };

  // ---------------- 슬롯 카드 ----------------
  const fmtTime = t => { try { return new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  /** 슬롯 카드 HTML. buttons: (slot, status) => 버튼 HTML */
  S.cardsHTML = function (buttons) {
    const latest = S.latest();
    return '<div class="sv-list">' + S.SLOTS.map(slot => {
      const r = S.read(slot);
      let body;
      if (r.status === 'ok') {
        const s = S.summary(r.data.state);
        body = `<b class="sv-main">${s.day}일째 · Lv.${s.lv} · ${s.job}</b><span class="sv-sub">${s.place} · ${s.loop}회차</span><span class="sv-time">${fmtTime(r.data.savedAt)} 저장</span>`;
      } else if (r.status === 'broken') body = '<b class="sv-main warn">불러올 수 없는 기록입니다</b>';
      else if (r.status === 'nostorage') body = '<b class="sv-main warn">저장소를 쓸 수 없습니다</b>';
      else body = '<b class="sv-main muted">비어 있음</b>';
      return `<div class="sv-card${slot === latest ? ' latest' : ''}${r.status !== 'ok' ? ' ' + r.status : ''}" data-slot="${slot}">
        <div class="sv-head">${S.label(slot)}${slot === latest ? ' <span class="sv-badge">최근</span>' : ''}</div>
        <div class="sv-body">${body}</div>
        <div class="sv-btns">${buttons(slot, r.status)}</div></div>`;
    }).join('') + '</div>';
  };

  // ---------------- 시작 화면 "이어하기" ----------------
  S.openStartPicker = function (gate) {
    let el = document.getElementById('rpg-slots');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rpg-slots';
      el.className = 'overlay';
      el.innerHTML = '<div class="rm-panel p-frame sv-panel"><h2 class="plate">이어하기</h2><p class="sv-msg" role="alert"></p><div class="rm-body"></div><div class="sv-start-btns"><button type="button" class="g-btn rm-mini sv-import">기록 텍스트 붙여 넣기</button><button type="button" class="g-btn rm-close">닫기</button></div></div>';
      el.addEventListener('click', e => e.stopPropagation());
      document.getElementById('game').appendChild(el);
      el.querySelector('.rm-close').onclick = () => el.classList.remove('show');
    }
    const body = el.querySelector('.rm-body'), msg = el.querySelector('.sv-msg');
    msg.textContent = '';
    body.innerHTML = S.cardsHTML((slot, st) => st === 'ok' ? `<button type="button" class="g-btn rm-mini" data-load="${slot}">불러오기</button>` : '');
    body.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      const r = S.read(b.dataset.load);
      if (r.status !== 'ok') { msg.textContent = '불러올 수 없는 기록입니다.'; return; }
      el.classList.remove('show');
      gate.classList.add('hide');
      setTimeout(() => gate.remove(), 600);
      if (window.matchMedia('(pointer: coarse)').matches) WS.toggleFullscreen(true);
      S.load(b.dataset.load);
    });
    el.querySelector('.sv-import').onclick = () => {
      const text = window.prompt('내보내기로 복사해 둔 기록 텍스트(WS30SAVE:…)를 붙여 넣어 주세요.');
      if (!text) return;
      const slot = ['1', '2', '3'].find(sl => S.read(sl).status === 'empty') || '3';
      const res = S.importText(slot, text);
      if (!res.ok) { msg.textContent = res.error; return; }
      S.openStartPicker(gate);
      el.querySelector('.sv-msg').textContent = `${S.label(slot)}에 기록을 넣었습니다.`;
    };
    el.classList.add('show');
  };
})();
