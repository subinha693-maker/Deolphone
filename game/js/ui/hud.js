/*
 * 화면 공통 UI: 상단 버튼(상태 · 처음부터 · 전체화면), 상태창, 확인 창, 알림, 장면 전환 베일,
 * 다음 장면 자리 표시 화면, 시작 화면
 */
window.WS = window.WS || {};

WS.UI = class {
  constructor(game) {
    this.game = game;
    this.modals = 0;
    const $ = s => document.querySelector(s);
    this.$ = $;
    this.dialogue = new WS.Dialogue($('#dialogue-layer'), game);
    this.jobSelect = new WS.JobSelect($('#job-select'), this);
    this.hud = new WS.Hud(this);

    this.toastEl = $('#toast');
    this.veilEl = $('#veil');
    this.confirmEl = $('#confirm');
    this.statusEl = $('#status');
    this.placeholderEl = $('#next-scene');

    this.statusEl.querySelector('.st-close').addEventListener('click', e => { e.stopPropagation(); this.closeStatus(); });
    this.placeholderEl.querySelector('.ns-restart').addEventListener('click', e => { e.stopPropagation(); game.newGame(); });
  }

  get modalOpen() { return this.modals > 0; }
  pushModal() { this.modals++; }
  popModal() { this.modals = Math.max(0, this.modals - 1); }

  resetAll() {
    this.modals = 0;
    this.dialogue.reset();
    this.jobSelect.close();
    this.jobSelect.root.classList.remove('show');
    this.confirmEl.classList.remove('show');
    if (this.confirmResolve) { const r = this.confirmResolve; this.confirmResolve = null; r(false); }
    this.statusEl.classList.remove('show');
    this.hidePlaceholderScene();
    this.toastEl.classList.remove('show');
    this.veilEl.classList.remove('show');
    this.modals = 0;
    this.hud.refresh();
  }

  toast(msg, isError) {
    const el = this.toastEl;
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /** 확인 창 → true / false */
  confirm({ title, body, yes = '확인', no = '취소', color }) {
    const el = this.confirmEl;
    el.querySelector('.cf-title').textContent = title;
    el.querySelector('.cf-body').innerHTML = body;
    const yesBtn = el.querySelector('.cf-yes');
    const noBtn = el.querySelector('.cf-no');
    yesBtn.textContent = yes;
    noBtn.textContent = no;
    if (color) el.style.setProperty('--job', color); else el.style.removeProperty('--job');
    el.classList.add('show');
    this.pushModal();
    yesBtn.disabled = noBtn.disabled = true;
    setTimeout(() => { yesBtn.disabled = noBtn.disabled = false; }, 250);
    return new Promise(resolve => {
      this.confirmResolve = resolve;
      const done = v => e => {
        e.stopPropagation();
        if (this.confirmResolve !== resolve) return;
        this.confirmResolve = null;
        yesBtn.onclick = noBtn.onclick = null;
        el.classList.remove('show');
        this.popModal();
        resolve(v);
      };
      yesBtn.onclick = done(true);
      noBtn.onclick = done(false);
    });
  }

  openStatus() {
    const run = this.game.state;
    const job = WS.getJob(run.player.jobId);
    if (!job) return;
    const body = this.statusEl.querySelector('.st-body');
    const s = run.player.stats;
    body.style.setProperty('--job', job.color);
    body.innerHTML = `
      <div class="st-portrait"><img src="${run.player.awakened ? job.portrait : WS.CHARACTERS.hero.portrait}" alt=""></div>
      <div class="st-info">
        <h3>${run.player.name}</h3>
        <p class="st-job">${job.name} <small>${job.role}</small></p>
        <p class="st-state">${run.player.awakened ? '각성 완료' : '각성 전'}</p>
        <div class="st-stats">${Object.keys(WS.STAT_LABELS).map(k => `<span>${WS.STAT_LABELS[k]} <b>${s[k]}</b></span>`).join('')}</div>
        <h4>능력</h4>
        ${run.player.abilities.length
          ? run.player.abilities.map(a => `<div class="st-ability"><b>「${a.name}」</b> Lv.${a.level}<p>${a.desc}</p><small>마나 ${a.cost} · 대기 ${a.cooldown}턴</small></div>`).join('')
          : '<p class="muted">아직 깨어난 능력이 없습니다.</p>'}
      </div>`;
    this.statusEl.classList.add('show');
    this.pushModal();
  }

  closeStatus() {
    if (!this.statusEl.classList.contains('show')) return;
    this.statusEl.classList.remove('show');
    this.popModal();
  }

  /** 장면 전환용 흰 베일 */
  veil(on, ms) {
    const el = this.veilEl;
    el.style.transitionDuration = ms + 'ms';
    el.classList.toggle('show', on);
    return WS.sleep(ms);
  }

  showPlaceholderScene(run, payload) {
    const job = WS.getJob(run.player.jobId);
    const el = this.placeholderEl;
    el.querySelector('.ns-summary').innerHTML = `
      <li>직업: <b>${job ? job.name : '없음'}</b></li>
      <li>능력: <b>${run.player.abilities.map(a => a.name).join(', ') || '없음'}</b></li>
      <li>회차: <b>${run.loop}</b> · 플래그: <b>${Object.keys(run.flags).join(', ') || '없음'}</b></li>
      <li>이전 장면: <b>${payload.from || '-'}</b></li>`;
    el.classList.add('show');
    this.pushModal();
  }

  hidePlaceholderScene() {
    if (!this.placeholderEl.classList.contains('show')) return;
    this.placeholderEl.classList.remove('show');
    this.popModal();
  }
};

WS.Hud = class {
  constructor(ui) {
    this.ui = ui;
    const $ = ui.$;
    this.statusBtn = $('#btn-status');
    this.restartBtn = $('#btn-restart');
    this.fsBtn = $('#btn-fullscreen');
    this.statusBtn.addEventListener('click', e => { e.stopPropagation(); if (!ui.modalOpen) ui.openStatus(); });
    this.restartBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (ui.confirmResolve) return; // 이미 확인 창이 열려 있음
      const ok = await ui.confirm({ title: '처음부터', body: '흰 공간의 처음으로 돌아갑니다.<br><small>이번 플레이의 선택은 모두 사라집니다.</small>', yes: '처음부터', no: '취소' });
      if (ok) ui.game.newGame();
    });
    const canFs = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    this.fsBtn.hidden = !canFs;
    this.fsBtn.addEventListener('click', e => { e.stopPropagation(); WS.toggleFullscreen(); });
  }

  refresh() {
    const p = this.ui.game.state && this.ui.game.state.player;
    const has = !!(p && p.jobId);
    this.statusBtn.disabled = !has;
    this.statusBtn.classList.toggle('glow', !!(p && p.awakened));
  }
};

WS.toggleFullscreen = async function (forceOn) {
  const d = document, el = d.documentElement;
  const isFs = d.fullscreenElement || d.webkitFullscreenElement;
  try {
    if (isFs && !forceOn) {
      await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else if (!isFs) {
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) { /* 지원하지 않는 환경 */ }
};
