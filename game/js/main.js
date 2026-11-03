/*
 * 게임 진입점: 상태 · 무대 · UI · 스크립트 실행기 · 장면 관리자 연결, 입력 처리
 */
window.WS = window.WS || {};

WS.Game = class {
  constructor() {
    this.meta = WS.Progression.loadMeta();
    this.state = WS.State.createRun(this.meta);
    this.stage = new WS.Stage(document.getElementById('stage'));
    this.ui = new WS.UI(this);
    this.runner = new WS.ScriptRunner(this);
    this.scenes = new WS.SceneManager(this);
    this.bindInput();
  }

  /** 새 플레이: 이번 회차의 임시 값은 전부 새로 만든다 (회차 메타 데이터만 유지) */
  newGame() {
    this.runner.stop();
    this.meta = WS.Progression.loadMeta();
    this.state = WS.State.createRun(this.meta);
    this.ui.resetAll();
    this.stage.reset();
    this.scenes.current = null;
    this.scenes.busy = false;
    this.scenes.start('whiteSpace');
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
    // 화면 아무 곳이나 탭/클릭 → 진행. 버튼들은 각자 stopPropagation 한다.
    document.getElementById('game').addEventListener('click', advance);
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        // 버튼에 포커스가 있으면 그 버튼의 기본 동작을 따른다
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
        e.preventDefault();
        advance();
      } else if (e.key === 'Escape') {
        this.ui.closeStatus();
      }
    });
  }
};

window.addEventListener('DOMContentLoaded', () => {
  const game = new WS.Game();
  WS.game = game; // 디버그 · 테스트용

  const gate = document.getElementById('start-gate');
  const begin = e => {
    e.stopPropagation();
    gate.removeEventListener('click', begin);
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (touch) WS.toggleFullscreen(true);
    gate.classList.add('hide');
    setTimeout(() => gate.remove(), 600);
    game.newGame();
  };
  gate.addEventListener('click', begin);
});
