/*
 * 저장소 — 세이브 슬롯 · 회차 메타 데이터를 오래 보관한다
 * ------------------------------------------------------------
 * 아티팩트 안에서는 브라우저 저장소(localStorage)가 열 때마다 비어 있거나 막혀 있을 수 있다.
 * 그래서 세 겹으로 보관한다.
 *   1) 메모리      — 이번 실행 동안 항상 쓰는 사본 (읽기는 여기서)
 *   2) localStorage — 쓸 수 있으면 함께 쓴다 (예전 기록이 남아 있으면 처음에 읽어 온다)
 *   3) 아티팩트 db  — 이 사람만 읽고 쓰는 칸(data/users/<내 id>/)에 오래 보관. 다른 기기 · 다른 창에서도 같은 기록.
 * 시작할 때 db 와 localStorage 를 비교해 더 최근 것을 쓰고, db 에 없던 기록(예전 버전에서 브라우저에만 저장된 것)은 db 로 올린다.
 * 대상 키: whitespace.slot.1/2/3/auto · whitespace.meta.v1 · whitespace.save.v1(예전 단일 저장)
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG = WS.RPG || {};
  const KEYS = ['whitespace.slot.1', 'whitespace.slot.2', 'whitespace.slot.3', 'whitespace.slot.auto', 'whitespace.meta.v1', 'whitespace.save.v1'];
  const DOC = k => k.replace(/^whitespace\./, '').replace(/\./g, '_');     // whitespace.slot.1 → slot_1
  const mem = {};
  const S = R.Store = { cloud: 'connecting', ready: null, listeners: [] };

  // 1) 처음: localStorage 에 남은 것을 메모리로
  let local = true;
  try { localStorage.getItem('__ws_probe'); } catch (e) { local = false; }
  for (const k of KEYS) { try { const v = localStorage.getItem(k); if (v != null) mem[k] = v; } catch (e) { local = false; } }

  const savedAtOf = raw => {
    try { const o = JSON.parse(raw); return o.savedAt || o.updatedAt || 0; } catch (e) { return 0; }
  };

  S.get = k => (k in mem ? mem[k] : null);
  S.set = function (k, v) {
    mem[k] = v;
    let ok = true;
    try { localStorage.setItem(k, v); } catch (e) { ok = false; }
    push(k);
    // 메모리 · db 중 하나라도 되면 저장된 것으로 본다 (db 가 없고 localStorage 도 막혔으면 실패)
    if (!ok && S.cloud !== 'on') throw Object.assign(new Error('storage unavailable'), { name: 'StorageUnavailable' });
  };
  S.remove = function (k) {
    delete mem[k];
    try { localStorage.removeItem(k); } catch (e) { /* 메모리 · db 에서는 지운다 */ }
    if (S.cloud === 'on' && dbRef) queue(k, () => dbRef(k).delete());
  };
  S.onChange = fn => S.listeners.push(fn);

  // 3) 아티팩트 db
  let db = null, uid = null;
  const dbRef = k => db.collection('data/users/' + uid).doc(DOC(k));
  const chains = {};
  function queue(k, job) {
    // 같은 문서는 한 번에 하나씩 쓴다
    chains[k] = (chains[k] || Promise.resolve()).then(job).catch(e => {
      console.warn('[store] 서버 저장 실패:', k, e && e.code);
      if (e && e.code === 'unavailable') return new Promise(r => setTimeout(r, 800 + Math.random() * 800)).then(job).catch(() => {});
    });
    return chains[k];
  }
  function push(k) {
    if (S.cloud !== 'on' || !(k in mem)) return;
    const raw = mem[k];
    queue(k, () => dbRef(k).set({ raw, at: savedAtOf(raw) || Date.now() }));
  }

  S.ready = (async () => {
    try {
      if (!window.claude || !window.claude.use) { S.cloud = 'off'; return; }
      const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!d || !u) { S.cloud = 'off'; return; }
      const id = await u.id();
      if (!id) { S.cloud = 'off'; return; }
      db = d; uid = id; S.cloud = 'on';
      // 비교: 더 최근 것을 쓴다. 서버에 없거나 더 오래된 것은 올린다.
      let changed = false;
      for (const k of KEYS) {
        let snap = null;
        try { snap = await dbRef(k).get(); } catch (e) { console.warn('[store] 서버 읽기 실패:', k, e && e.code); continue; }
        const remote = snap && snap.exists ? (snap.data() || {}).raw : null;
        const here = mem[k];
        if (remote != null && (here == null || savedAtOf(remote) > savedAtOf(here) || (k === 'whitespace.meta.v1' && here !== remote && metaNewer(remote, here)))) {
          mem[k] = remote; changed = true;
          try { localStorage.setItem(k, remote); } catch (e) { /* 메모리로 충분 */ }
        } else if (here != null && remote !== here) push(k);
      }
      if (changed) S.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    } catch (e) {
      console.warn('[store] 서버 저장소를 쓸 수 없습니다:', e);
      S.cloud = 'off';
    }
  })();
  // 회차 메타는 savedAt 이 없다: 회차가 더 크거나, 같으면 이월 기록이 있는 쪽을 최신으로
  function metaNewer(a, b) {
    try {
      const A = JSON.parse(a), B = JSON.parse(b);
      if ((A.loop || 1) !== (B.loop || 1)) return (A.loop || 1) > (B.loop || 1);
      return (A.updatedAt || 0) > (B.updatedAt || 0);
    } catch (e) { return false; }
  }

  // 원본의 회차 메타 데이터 읽기 · 쓰기도 이 저장소를 쓰게 한다
  if (WS.Progression) {
    WS.Progression.loadMeta = function () {
      try {
        const raw = S.get(this.STORAGE_KEY);
        return raw ? Object.assign(this.defaultMeta(), JSON.parse(raw)) : this.defaultMeta();
      } catch (e) { return this.defaultMeta(); }
    };
    WS.Progression.saveMeta = function (meta) {
      meta.updatedAt = Date.now();
      try { S.set(this.STORAGE_KEY, JSON.stringify(meta)); } catch (e) { /* 저장 불가 환경 */ }
    };
  }
  S.localAvailable = () => local;
})();
