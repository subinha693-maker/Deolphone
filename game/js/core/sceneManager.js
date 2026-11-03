/*
 * 장면 전환
 *  - 장면은 WS.SCENES 에 { enter(game, payload), exit(game) } 형태로 등록한다.
 *  - goTo(id) 는 화면을 흰빛으로 덮은 뒤 이전 장면을 정리하고 다음 장면을 연다.
 *  - 다음 장면(chapter1)은 아직 구현 범위가 아니므로 자리 표시 장면을 둔다.
 */
window.WS = window.WS || {};

WS.SCENES = {
  whiteSpace: {
    enter(game) {
      game.state.sceneId = 'whiteSpace';
      game.stage.reset();
      return game.runner.run(WS.SCRIPTS.whiteSpace);
    },
    exit(game) {
      game.runner.stop();
      game.ui.dialogue.hide();
    },
  },

  // ▼ 다음 장면을 만들 때 이 항목을 실제 장면으로 교체한다.
  chapter1: {
    enter(game, payload) {
      game.state.sceneId = 'chapter1';
      game.recordPrologueClear();
      game.ui.showPlaceholderScene(game.state, payload);
    },
    exit(game) {
      game.ui.hidePlaceholderScene();
    },
  },
};

WS.SceneManager = class {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.busy = false;
  }

  /** 전환 효과 없이 바로 장면 시작 (게임 시작 시) */
  start(id, payload) {
    if (this.current && WS.SCENES[this.current].exit) WS.SCENES[this.current].exit(this.game);
    this.current = id;
    return WS.SCENES[id].enter(this.game, payload || {});
  }

  /** 흰빛 전환 후 장면 이동 */
  async goTo(id, payload) {
    if (this.busy) return;
    const scene = WS.SCENES[id];
    if (!scene) { console.error('없는 장면:', id); return; }
    this.busy = true;
    try {
      await this.game.ui.veil(true, 900);
      if (this.current && WS.SCENES[this.current].exit) WS.SCENES[this.current].exit(this.game);
      this.current = id;
      scene.enter(this.game, payload || {});
      await this.game.ui.veil(false, 700);
    } finally {
      this.busy = false;
    }
  }
};
