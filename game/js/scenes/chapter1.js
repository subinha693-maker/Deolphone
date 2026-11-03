/*
 * 다음 장면 자리 표시 (아직 만들지 않은 장면)
 * 실제 장면을 만들면 이 파일을 지우고 새 장면 파일(예: js/scenes/chapter1.js)로 교체한다.
 */
WS.registerScene('chapter1', {
  enter(game, payload) {
    game.state.sceneId = 'chapter1';
    game.recordPrologueClear();
    game.ui.showPlaceholderScene(game.state, payload);
  },
  exit(game) {
    game.ui.hidePlaceholderScene();
  },
});
