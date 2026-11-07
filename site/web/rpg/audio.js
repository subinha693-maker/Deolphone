/*
 * 소리 — 배경 음악(BGM) · 배경 소리(환경음) · 효과음(SE)
 * ------------------------------------------------------------
 * 파일: rpg/assets/audio/  (사용자가 준 음악 · 효과음을 mp3 로 옮긴 것)
 *   bgm_title    타이틀            (02 Title Theme)
 *   bgm_town     마을              (03 Definitely Our Town)
 *   bgm_forest   침묵 숲 · 버섯 숲  (04 Silent Forest)
 *   bgm_field    그 밖의 필드      (19 Where The Winds Roam)
 *   bgm_kingdom  빅토리아 시가지 · 광장 · 성 (11 The Mighty Kingdom)
 *   bgm_cave     광산 · 동굴 · 요새 (12 Frozen Abyss)
 *   bgm_shrine   유적 · 묘지 · 탑 · 옛 마을 · 관측소 (10 Lost Shrine)
 *   bgm_battle   일반 전투         (05 Battle 1)
 *   bgm_boss     마수 전투         (17 Decisive Battle 2)
 *   me_victory   전투 승리         (06 Victory)
 *   me_night     잠들어 하루가 지날 때 (15 Peaceful Night)
 *   amb_forest_day / amb_sea  숲 · 바다의 배경 소리 (음악 아래에 작게)
 *   se_*         효과음 (칼 · 막기 · 타격 · 불 · 얼음 · 마법 · 문 · 상자)
 * 지역 → 음악 연결은 아래 REGION_BGM / TYPE_BGM 에서 바꾼다.
 *
 * 브라우저는 사용자가 화면을 누르기 전에는 소리를 낼 수 없다 → 첫 터치 · 클릭 때 소리를 켠다.
 * 소리 켜기/끄기는 메뉴(설정)와 타이틀의 ♪ 버튼에서. 설정은 이 기기에만 저장된다.
 * 흰 공간 · 주인공의 방(원본 장면)에는 음악을 넣지 않았다. (원래 연출의 고요함을 유지)
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const BASE = 'rpg/assets/audio/';
  const PREF_KEY = 'whitespace.audio.v1';
  const A = R.Audio = {};

  const TYPE_BGM = {
    town: 'bgm_town', beachtown: 'bgm_town', interior: null,
    city: 'bgm_kingdom', castle: 'bgm_kingdom',
    mine: 'bgm_cave', cave: 'bgm_cave', fortress: 'bgm_cave',
    ruins: 'bgm_shrine', graveyard: 'bgm_shrine', oldvillage: 'bgm_shrine', observatory: 'bgm_shrine',
    towerlobby: 'bgm_shrine', towerfloor: 'bgm_shrine',
  };
  const REGION_BGM = { silent: 'bgm_forest', mushroom: 'bgm_forest', v_city: 'bgm_kingdom', v_plaza: 'bgm_kingdom', v_castle: 'bgm_kingdom' };
  const TYPE_AMB = { forest: 'amb_forest_day', mush: 'amb_forest_day', river: 'amb_forest_day', lake: 'amb_forest_day', cliff: 'amb_forest_day',
    sea: 'amb_sea', coast: 'amb_sea', beachtown: 'amb_sea' };
  const SE = {
    swing: ['se_sword_attack_1', 'se_sword_attack_2', 'se_sword_attack_3'],
    hit: ['se_sword_impact_hit_1', 'se_sword_impact_hit_2', 'se_sword_impact_hit_3'],
    block: ['se_sword_blocked_1', 'se_sword_blocked_2'],
    fire: ['se_fireball_1'], ice: ['se_ice_freeze_1'], iceAll: ['se_ice_barrage_1'],
    magic: ['se_spell_impact_1'], buff: ['se_firebuff_1'],
    door: ['se_door_open_1'], chest: ['se_chest_open_1'],
  };
  const VOL = { bgm: 0.5, amb: 0.35, se: 0.8 };

  let pref = { on: true, bgm: 1, se: 1 };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* 기본값 */ }
  const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) { /* 저장 못 해도 이번 실행에는 적용 */ } };

  // ---------------- 재생기 (HTML <audio> — 아티팩트 화면에서 가장 확실한 방식) ----------------
  // Web Audio(AudioContext · fetch 디코딩 · crossOrigin)는 아티팩트 화면에서 막히거나 소리가 0 으로 나올 수 있어 쓰지 않는다.
  // 파일을 바로 못 읽으면 내려받아 blob 주소로 한 번 더 시도한다.
  const blobs = {}, failed = {};
  let unlocked = false, lastError = '', warned = false;
  const srcOf = name => blobs[name] || (BASE + name + '.mp3');
  function viaBlob(name) {
    if (blobs[name] || failed[name] === 'blob') return Promise.resolve(blobs[name] || null);
    return fetch(BASE + name + '.mp3').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(b => (blobs[name] = URL.createObjectURL(b)))
      .catch(e => { failed[name] = 'blob'; lastError = name + ': ' + e.message; return null; });
  }
  function report(name, err) {
    lastError = name + ': ' + (err && (err.name || err.message) || err);
    console.warn('[audio]', lastError);
    if (!warned && err && err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
      warned = true;
      if (WS.game && WS.game.ui) WS.game.ui.toast('소리 파일을 재생하지 못했습니다. (메뉴 → 저장 탭에서 소리 상태 확인)', true);
    }
  }
  /** el 에 name 을 걸고 재생. 파일 오류면 blob 으로 한 번 더 */
  function playOn(el, name, opts = {}) {
    el.loop = !!opts.loop;
    if (el._name !== name) { el._name = name; el._retried = false; el.src = srcOf(name); }
    else if (opts.restart) { try { el.currentTime = 0; } catch (e) { /* 아직 못 읽음 */ } }
    // 직접 읽기가 막히면(파일 오류 이벤트 또는 play() 거절 NotSupportedError) 내려받은 사본(blob)으로 한 번 더
    const fallback = err => {
      if (el._name !== name) return;
      const onBlob = blobs[name] && el.src === blobs[name];
      if (onBlob && !el.error && err && /^MediaError/.test(err.name || '')) return;   // 사본으로 바꾸기 전 원래 주소의 늦은 오류
      if (el._retried || onBlob) return report(name, err);
      el._retried = true;
      viaBlob(name).then(u => {
        if (!u) return report(name, err);
        if (el._name !== name) return;
        el.src = u;
        const q = el.play();
        if (q && q.then) q.then(() => { if (lastError.startsWith(name + ':')) lastError = ''; }, e => { if (e.name !== 'AbortError') report(name, e); });
      });
    };
    el.onerror = () => fallback(el.error ? { name: 'MediaError ' + el.error.code } : { name: 'MediaError' });
    const p = el.play();
    if (p && p.then) p.then(() => { if (lastError.startsWith(name + ':')) lastError = ''; }, () => {});
    if (p && p.catch) p.catch(e => {
      if (e.name === 'NotAllowedError') { pendingStart = true; return report(name, e); }
      if (e.name === 'AbortError') return;             // 곡을 바꾸느라 끊긴 것
      fallback(e);
    });
  }
  let pendingStart = false;

  // 효과음: 이름마다 작은 재생기 묶음 (겹쳐 울릴 수 있게 3개)
  const pools = {};
  function seEl(name) {
    const pool = pools[name] || (pools[name] = []);
    let el = pool.find(a => a.paused || a.ended);
    if (!el && pool.length < 3) { el = new Audio(); el.preload = 'auto'; pool.push(el); }
    return el || pool[0];
  }
  A.preload = () => { for (const k in SE) SE[k].forEach(n => { const el = seEl(n); if (el._name !== n) { el._name = n; el.src = srcOf(n); el.load(); } }); };
  /** 효과음: kind = SE 의 키 (swing, hit, block, fire, ice, iceAll, magic, buff, door, chest) */
  A.se = function (kind, opts = {}) {
    if (!pref.on || !unlocked) return;
    const list = SE[kind]; if (!list) return;
    const name = list[Math.floor(Math.random() * list.length)];
    const el = seEl(name);
    el.volume = Math.max(0, Math.min(1, VOL.se * (opts.vol || 1) * pref.se));
    try { el.playbackRate = opts.rate || (0.95 + Math.random() * 0.1); } catch (e) { /* 일부 브라우저 */ }
    playOn(el, name, { restart: true });
  };
  /** 공격 속성 → 맞는 효과음 */
  A.hitFor = function (el, kind, all) {
    if (el === 'fire') return A.se('fire');
    if (el === 'ice') return A.se(all ? 'iceAll' : 'ice');
    if (el === 'thunder' || el === 'light' || el === 'dark' || kind === 'mag') return A.se('magic');
    return A.se('hit');
  };

  // ---------------- 음악 · 배경 소리 (재생기 하나씩, 계속 다시 쓴다 — 아이폰은 한 번 풀린 재생기만 자유롭게 재생) ----------------
  const ch = { bgm: new Audio(), amb: new Audio() };
  ch.bgm.preload = 'auto'; ch.amb.preload = 'auto';
  let wantBgm = null, wantAmb = null, resumeAfter = null;
  const target = slot => (slot === 'amb' ? VOL.amb : VOL.bgm) * pref.bgm * (pref.on ? 1 : 0);
  const fades = {};
  function fadeTo(slot, to, sec, done) {
    const el = ch[slot];
    clearInterval(fades[slot]);
    const from = el.volume, steps = Math.max(1, Math.round(sec * 20));
    let i = 0;
    fades[slot] = setInterval(() => {
      i++;
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * i / steps)); } catch (e) { /* 아이폰: 음량 고정 */ }
      if (i >= steps) { clearInterval(fades[slot]); if (done) done(); }
    }, 50);
  }
  function setTrack(slot, name, opts = {}) {
    const el = ch[slot];
    if (!name) { fadeTo(slot, 0, opts.fadeOut || 0.8, () => { el.pause(); }); el._want = null; return; }
    el._want = name;
    if (!pref.on || !unlocked) return;            // 화면을 누르면 시작한다
    const start = () => {
      if (el._want !== name) return;
      try { el.volume = 0; } catch (e) { /* 아이폰 */ }
      el._retried = false;
      playOn(el, name, { loop: opts.loop !== false, restart: true });
      fadeTo(slot, target(slot), opts.fadeIn || 1.0);
      if (opts.onEnd) el.onended = () => { el.onended = null; if (el._name === name) opts.onEnd(); }; else el.onended = null;
    };
    if (!el.paused && el._name && el._name !== name) fadeTo(slot, 0, opts.fadeOut || 0.6, start);
    else start();
  }
  /** 배경 음악 바꾸기 (같은 곡이면 그대로 둔다). name 이 null 이면 멈춘다 */
  A.bgm = function (name, opts = {}) {
    wantBgm = name;
    if (!opts.force && ch.bgm._want === name && name && !ch.bgm.paused) return;
    setTrack('bgm', name, opts);
  };
  A.amb = function (name, opts = {}) {
    wantAmb = name;
    if (!opts.force && ch.amb._want === name && name && !ch.amb.paused) return;
    setTrack('amb', name, opts);
  };
  /** 짧은 곡(승리 · 잠) — 끝나거나 resume() 하면 원래 곡으로 */
  A.jingle = function (name, opts = {}) {
    resumeAfter = resumeAfter || wantBgm;
    wantBgm = name;
    setTrack('bgm', name, { loop: false, fadeIn: 0.2, fadeOut: 0.3, onEnd: () => A.resume() });
    if (opts.muteAmb) A.amb(null);
  };
  A.resume = function () {
    const back = resumeAfter; resumeAfter = null;
    if (back) A.bgm(back, { force: true });
  };

  /** 첫 사용자 입력: 재생기를 풀고(아이폰), 기다리던 음악을 그 입력 안에서 바로 시작한다 */
  A.unlock = function () {
    if (!unlocked) {
      unlocked = true;
      for (const el of [ch.bgm, ch.amb]) {
        if (el._name) continue;
        try { el.muted = true; const p = el.play(); if (p && p.catch) p.catch(() => {}); el.pause(); el.muted = false; } catch (e) { /* 무시 */ }
      }
      A.preload();
    }
    if (!pref.on) return;
    if (wantBgm && (ch.bgm.paused || ch.bgm._name !== wantBgm || pendingStart)) setTrack('bgm', wantBgm, { force: true, loop: !resumeAfter });
    if (wantAmb && (ch.amb.paused || ch.amb._name !== wantAmb || pendingStart)) setTrack('amb', wantAmb, { force: true });
    pendingStart = false;
  };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, () => A.unlock(), { capture: true, passive: true }));

  /** 지역 → 음악 · 배경 소리 */
  A.forMap = function (id) {
    if (!id) return;
    const def = id === 'tower_f' ? { type: 'towerfloor' } : R.mapDef(id);
    if (!def) return;
    let type = def.type, key = id;
    if (type === 'interior') { key = def.parent; const pd = R.mapDef(def.parent); type = pd ? pd.type : 'town'; }
    const name = REGION_BGM[key] || TYPE_BGM[type] || 'bgm_field';
    resumeAfter = null;
    A.bgm(name);
    A.amb(def.type === 'interior' ? null : (TYPE_AMB[type] || null));
  };
  A.battle = function (boss) { resumeAfter = resumeAfter || wantBgm; A.amb(null); A.bgm(boss ? 'bgm_boss' : 'bgm_battle', { fadeOut: 0.3, fadeIn: 0.3 }); };
  A.stopAll = function () { resumeAfter = null; A.bgm(null); A.amb(null); };

  // ---------------- 설정 ----------------
  A.isOn = () => pref.on;
  A.setOn = function (on) {
    pref.on = !!on; savePref();
    if (!pref.on) { ch.bgm.pause(); ch.amb.pause(); return; }
    unlocked = true;                              // 이 호출은 버튼 누름 안에서 일어난다
    if (wantBgm) setTrack('bgm', wantBgm, { force: true });
    if (wantAmb) setTrack('amb', wantAmb, { force: true });
  };
  A.setVolume = function (kind, v) {
    pref[kind] = Math.max(0, Math.min(1, v)); savePref();
    if (kind === 'bgm') for (const slot of ['bgm', 'amb']) { try { ch[slot].volume = target(slot); } catch (e) { /* 아이폰 */ } }
  };
  A.volume = kind => pref[kind];
  /** 소리 상태 (메뉴 · 확인용) */
  A.status = () => ({ on: pref.on, unlocked, bgm: ch.bgm._name || null, playing: !ch.bgm.paused && ch.bgm.readyState >= 2 && !ch.bgm.error, viaBlob: !!(ch.bgm._name && blobs[ch.bgm._name] && ch.bgm.src === blobs[ch.bgm._name]), error: lastError || null });

  // ---------------- 타이틀 ----------------
  window.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('start-gate');
    if (!gate) return;
    wantBgm = 'bgm_title';                       // 화면을 누르면 타이틀 곡 (게임이 시작되면 멈춘다)
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g-btn rpg-sound-toggle';
    b.id = 'sound-toggle';
    const label = () => { b.textContent = pref.on ? '♪ 소리 켜짐 (누르면 끔)' : '♪ 소리 꺼짐 (누르면 켬)'; };
    label();
    b.addEventListener('click', e => { e.stopPropagation(); A.setOn(!pref.on); label(); });
    gate.appendChild(b);
    // 시작하면 타이틀 곡을 멈춘다 (흰 공간은 원래 연출대로 고요하게)
    gate.addEventListener('click', e => { if (!e.target.closest('button, select, .gate-dev')) setTimeout(() => A.bgm(null, { fadeOut: 1.5 }), 0); });
    const obs = new MutationObserver(() => { if (!document.body.contains(gate)) { obs.disconnect(); if (wantBgm === 'bgm_title') A.bgm(null, { fadeOut: 1.5 }); } });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();
