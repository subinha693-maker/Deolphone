/*
 * 장면 등록 · 전환
 * ------------------------------------------------------------
 * 장면은 js/scenes/ 아래에 파일 하나씩 따로 만들고, index.html 에 <script> 한 줄만 추가하면 붙는다.
 * 게임 상태(game.state: 직업, 능력, 선택 기록, 플래그)는 장면이 바뀌어도 그대로 이어진다.
 *
 * 1) 대화 위주 장면 (대부분 이쪽)
 *      WS.SCRIPTS.cafe = `...대사 스크립트...`;
 *      WS.defineScriptScene('cafe', { script: 'cafe', next: 'chapter2' });
 *    옵션: backdrop(ctx, W, H, stage)  배경을 직접 그림 (없으면 흰 공간)
 *          props: false                흰 공간의 테이블 · 의자 · 등장인물을 그리지 않음
 *          setup(game, payload)        시작할 때 추가 처리
 *          teardown(game)              나갈 때 추가 처리
 *
 * 2) 완전히 직접 만드는 장면 (전투, 지도 등)
 *      WS.registerScene('battle', { enter(game, payload) {...}, exit(game) {...} });
 *
 * 장면 이동:  스크립트에서  @end 버튼문구 -> 장면ID   또는   @goscene 장면ID
 *             코드에서     game.scenes.goTo('장면ID', { 넘길 값 })
 * 이전 장면 정보는 enter 의 payload.from 으로 받는다.
 */
window.WS = window.WS || {};

WS.SCENES = WS.SCENES || {};

WS.registerScene = function (id, def) {
  if (WS.SCENES[id]) console.warn('[scene] 같은 ID 의 장면을 덮어씁니다:', id);
  WS.SCENES[id] = Object.assign({ id }, def);
  return WS.SCENES[id];
};

/** 대사 스크립트로 진행하는 장면을 간단히 등록 */
WS.defineScriptScene = function (id, opts) {
  const scriptKey = opts.script || id;
  return WS.registerScene(id, {
    next: opts.next || null,
    enter(game, payload) {
      const src = WS.SCRIPTS[scriptKey];
      if (!src) throw new Error(`스크립트가 없습니다: WS.SCRIPTS.${scriptKey}`);
      game.state.sceneId = id;
      game.stage.reset({ fromScene: payload && payload.from });
      game.stage.backdrop = opts.backdrop || null;
      game.stage.props = opts.props !== false;
      if (opts.setup) opts.setup(game, payload);
      return game.runner.run(src);
    },
    exit(game) {
      if (opts.teardown) opts.teardown(game);
      game.runner.stop();
      game.ui.dialogue.hide();
      game.stage.backdrop = null;
      game.stage.props = true;
    },
  });
};

/** 아직 구현되지 않은 장면 ID 로 이동할 때 쓰는 임시 장면 */
WS.placeholderScene = function (id) {
  return {
    id, placeholder: true,
    enter(game, payload) {
      game.state.sceneId = id;
      game.ui.showPlaceholderScene(game.state, Object.assign({ missing: id }, payload));
    },
    exit(game) { game.ui.hidePlaceholderScene(); },
  };
};

WS.SceneManager = class {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.busy = false;
  }

  get currentScene() {
    if (!this.current) return null;
    return WS.SCENES[this.current] || (this._ph && this._ph.id === this.current ? this._ph : null);
  }

  /** 이 장면이 끝나면 갈 다음 장면 ID (장면 정의의 next) */
  get nextId() { const s = this.currentScene; return s ? s.next : null; }

  /** 전환 효과 없이 바로 장면 시작 (게임 시작 시) */
  start(id, payload) {
    const scene = WS.SCENES[id];
    if (!scene) throw new Error('없는 장면: ' + id);
    const prev = this.currentScene;
    if (prev && prev.exit) prev.exit(this.game);
    this.current = id;
    return scene.enter(this.game, payload || {});
  }

  /** 흰빛 전환 후 장면 이동 */
  async goTo(id, payload) {
    if (this.busy) return;
    // 아직 만들지 않은 장면 → 임시 연결 지점 화면 (게임 상태를 보여 주고 되돌아갈 수 있음)
    const scene = WS.SCENES[id] || WS.placeholderScene(id);
    this.busy = true;
    try {
      const from = this.current;
      await this.game.ui.veil(true, 900);
      const prev = this.currentScene;
      if (prev && prev.exit) prev.exit(this.game);
      this.current = id;
      this._ph = scene.placeholder ? scene : null;
      scene.enter(this.game, Object.assign({ from }, payload || {}));
      await this.game.ui.veil(false, 700);
    } finally {
      this.busy = false;
    }
  }
};
