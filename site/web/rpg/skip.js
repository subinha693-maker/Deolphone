/*
 * 컷씬 건너뛰기
 * ------------------------------------------------------------
 * 대사가 나오는 동안 대화창 위에 「건너뛰기 ▶▶」 버튼이 뜬다. 한 번 더 누르면(실수 방지) 건너뛴다.
 * 건너뛰기 = 대본을 빼먹는 것이 아니라 "빠르게 끝까지 돌리는 것":
 *   대사는 바로 넘기고, 대기 · 페이드 · 카메라 · 이모트 같은 연출 시간은 0 으로 만든다.
 *   그래서 플래그(@set) · 이벤트 기록(@event) · 아이템(@give) · 알림(@notify) · 장면 이동(@end)은 모두 그대로 처리된다.
 *   「다음으로」 같은 장면 끝 버튼은 자동으로 누른다.
 * 멈추는 곳: 이름 입력 · 직업 선택 · 일반 선택지 (고른 값이 진행에 남기 때문). 고르면 계속 건너뛴다.
 * 건너뛰기는 지금 돌고 있는 대본이 끝나면 꺼진다. (다음 장면의 대본에서는 버튼이 다시 뜬다)
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const K = R.Skip = { on: false, live: 0, runId: 0 };

  // ---------- 대본 실행 추적 ----------
  // 지금 돌고 있는 대본 = runner.runId. 장면이 바뀌어 끊긴 대본은 끝나지 않고 멈춰 있을 수 있으므로 번호로만 판단한다.
  const run = WS.ScriptRunner.prototype.run;
  WS.ScriptRunner.prototype.run = async function (source) {
    const id = this.runId + 1;          // 원본 run() 이 바로 ++runId 한다
    K.live = id;
    try { return await run.call(this, source); }
    finally {
      if (K.live === id) K.live = 0;
      if (K.on && K.runId === id) K.stop();
    }
  };
  const running = () => { const r = WS.game && WS.game.runner; return !!r && K.live === r.runId && K.live > 0; };
  Object.defineProperty(K, 'active', { get: () => (running() ? 1 : 0) });

  // ---------- 건너뛰는 동안: 대사 바로 넘기기 ----------
  const say = WS.Dialogue.prototype.say;
  WS.Dialogue.prototype.say = function (speakerName, text) {
    const p = say.call(this, speakerName, text);
    if (K.on) {
      this.finishTyping();
      setTimeout(() => {
        if (!K.on || this.mode !== 'waiting' || !this.pending) return;
        this.mode = 'idle';
        this.el.next.classList.remove('show');
        const r = this.pending; this.pending = null; r();
      }, 0);
    }
    return p;
  };
  // 장면 끝 버튼(「다음으로」 등 kind: 'end')은 자동으로 누른다. 일반 선택지는 그대로 기다린다.
  const choose = WS.Dialogue.prototype.choose;
  WS.Dialogue.prototype.choose = function (labels, opts = {}) {
    if (K.on && opts.kind === 'end' && labels.length === 1) return Promise.resolve(0);
    return choose.call(this, labels, opts);
  };

  // ---------- 건너뛰는 동안: 연출 시간 0 ----------
  const sleep = WS.sleep;
  WS.sleep = ms => sleep(K.on ? 0 : ms);
  const tween = WS.Stage.prototype.tween;
  WS.Stage.prototype.tween = function (obj, key, to, ms) { return tween.call(this, obj, key, to, K.on ? 1 : ms); };

  // ---------- 버튼 ----------
  let btn = null, armed = 0;
  function mount() {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'skip-btn';
    btn.className = 'g-btn';
    btn.textContent = '건너뛰기 ▶▶';
    btn.addEventListener('click', e => {
      e.stopPropagation();          // 화면 탭(대사 넘기기)으로 번지지 않게
      if (K.on) return;
      const now = Date.now();
      if (now - armed > 2500) {     // 첫 번째 누름: 확인
        armed = now;
        btn.textContent = '한 번 더 누르면 건너뜁니다';
        btn.classList.add('armed');
        setTimeout(() => { if (!K.on && Date.now() - armed >= 2400) { btn.textContent = '건너뛰기 ▶▶'; btn.classList.remove('armed'); } }, 2500);
        return;
      }
      K.start();
    });
    (document.getElementById('game') || document.body).appendChild(btn);
    return btn;
  }
  K.start = function () {
    if (!running()) return;
    K.on = true;
    K.runId = WS.game.runner.runId;
    const g = WS.game, d = g && g.ui.dialogue;
    if (btn) { btn.textContent = '건너뛰는 중…'; btn.classList.add('running'); btn.classList.remove('armed'); }
    // 지금 화면에 떠 있는 대사부터 바로 넘긴다
    if (d && (d.mode === 'typing' || d.mode === 'waiting')) {
      d.finishTyping();
      d.completedAt = -1e9;
      d.advance();
    }
  };
  K.stop = function () {
    K.on = false; armed = 0;
    if (btn) { btn.textContent = '건너뛰기 ▶▶'; btn.classList.remove('running', 'armed'); }
  };
  // 대사가 나오는 동안에만 보인다 (전투 · 메뉴 · 장면 테스트 화면 등에서는 숨김)
  setInterval(() => {
    const g = WS.game; if (!g) return;
    const b = mount();
    if (K.on && g.runner.runId !== K.runId) K.stop();    // 다른 대본이 시작됐거나 멈췄다 → 건너뛰기 끝
    const d = g.ui.dialogue;
    const show = K.active > 0 && (K.on || d.mode === 'typing' || d.mode === 'waiting') && !(R.Battle && R.Battle.current) && !g.ui.modalOpen;
    b.classList.toggle('show', show);
  }, 150);
})();
