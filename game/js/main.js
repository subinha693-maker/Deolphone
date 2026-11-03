/*
 * 게임 진입점: 상태 · 무대 · UI · 스크립트 실행기 · 장면 관리자 연결, 입력 처리
 *
 * 시작 장면
 *   기본: 흰 공간(whiteSpace) 부터
 *   단독 테스트: index.html#room  또는  index.html?scene=heroRoom&job=ruby
 *               (시작 화면 아래의 "장면 단독 테스트" 에서도 고를 수 있음)
 */
window.WS = window.WS || {};

/** 단독 테스트로 시작할 수 있는 장면 (해시 이름 → 장면 ID) */
WS.TEST_ENTRIES = {
  room: { scene: 'heroRoom', label: '주인공의 방' },
};

WS.Game = class {
  constructor() {
    this.meta = WS.Progression.loadMeta();
    this.state = WS.State.createRun(this.meta);
    this.stage = new WS.Stage(document.getElementById('stage'));
    this.ui = new WS.UI(this);
    this.runner = new WS.ScriptRunner(this);
    this.scenes = new WS.SceneManager(this);
    this.entry = { scene: 'whiteSpace' };
    this.bindInput();
  }

  /**
   * 새 플레이: 이번 회차의 임시 값은 전부 새로 만든다 (회차 메타 데이터만 유지)
   * entry: { scene, test, job } — 생략하면 마지막으로 시작한 방식 그대로 (처음부터 버튼)
   */
  newGame(entry) {
    if (entry) this.entry = entry;
    const { scene, test, job } = this.entry;
    this.runner.stop();
    const prev = this.scenes.currentScene;
    if (prev && prev.exit) prev.exit(this);
    this.meta = WS.Progression.loadMeta();
    this.state = WS.State.createRun(this.meta);
    this.ui.resetAll();
    this.stage.reset();
    this.scenes.current = null;
    this.scenes.busy = false;
    this.scenes.start(scene || 'whiteSpace', test ? { test: true, job } : {});
  }

  /** 프롤로그 완료 기록 (회차 시스템 확장 지점) */
  recordPrologueClear() {
    this.meta.prologueClears = (this.meta.prologueClears || 0) + 1;
    WS.Progression.saveMeta(this.meta);
  }

  bindInput() {
    const advance = () => {
      if (this.ui.modalOpen) return;
      this.ui.dialogue.advance();
    };
    // 화면 아무 곳이나 탭/클릭 → 대사 진행. 버튼들은 각자 stopPropagation 한다.
    document.getElementById('game').addEventListener('click', advance);
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;   // 이름 입력 중
      const mapView = this.stage.view instanceof WS.MapView ? this.stage.view : null;
      const confirmKey = e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'Z';
      // 맵 장면에서는 방향키가 이동이므로 → 키로 대사를 넘기지 않는다
      if (confirmKey || (!mapView && e.key === 'ArrowRight')) {
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
        e.preventDefault();
        if (this.ui.modalOpen) return;
        if (this.ui.dialogue.waitingForInput) advance();
        else if (mapView) mapView.onActionKey();
      } else if (e.key === 'Escape') {
        this.ui.closeStatus();
      }
    });
  }
};

/** 주소에서 단독 테스트 진입 정보 읽기 (#room 또는 ?scene=heroRoom&job=ruby) */
WS.readEntryFromUrl = function () {
  const hash = location.hash.replace('#', '');
  const q = new URLSearchParams(location.search);
  const job = q.get('job') || undefined;
  if (WS.TEST_ENTRIES[hash]) return { scene: WS.TEST_ENTRIES[hash].scene, test: true, job };
  const scene = q.get('scene');
  if (scene && WS.SCENES[scene]) return { scene, test: scene !== 'whiteSpace', job };
  return null;
};

window.addEventListener('DOMContentLoaded', () => {
  const game = new WS.Game();
  WS.game = game; // 디버그 · 테스트용

  const gate = document.getElementById('start-gate');
  const urlEntry = WS.readEntryFromUrl();

  // 시작 화면의 장면 단독 테스트 선택
  const jobSel = document.getElementById('gate-job');
  const sceneSel = document.getElementById('gate-scene');
  WS.JOBS.forEach(j => { const o = document.createElement('option'); o.value = j.id; o.textContent = j.name; jobSel.appendChild(o); });
  for (const key in WS.TEST_ENTRIES) {
    const o = document.createElement('option'); o.value = key; o.textContent = WS.TEST_ENTRIES[key].label; sceneSel.appendChild(o);
  }
  if (urlEntry && urlEntry.job) jobSel.value = urlEntry.job;
  if (urlEntry) gate.querySelector('p').textContent = '화면을 눌러 시작 (장면 테스트)';

  const begin = entry => {
    gate.classList.add('hide');
    setTimeout(() => gate.remove(), 600);
    if (window.matchMedia('(pointer: coarse)').matches) WS.toggleFullscreen(true);
    game.newGame(entry);
  };
  gate.addEventListener('click', e => {
    if (e.target.closest('.gate-dev')) return;
    e.stopPropagation();
    begin(urlEntry || { scene: 'whiteSpace' });
  }, { once: false });
  document.getElementById('gate-go').addEventListener('click', e => {
    e.stopPropagation();
    begin({ scene: WS.TEST_ENTRIES[sceneSel.value].scene, test: true, job: jobSel.value });
  });
});
