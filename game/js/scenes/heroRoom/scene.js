/*
 * 주인공의 방 — 장면 등록 (진입 · 종료 · 상호작용 연결)
 * ------------------------------------------------------------
 * 진입점:  game.scenes.goTo('heroRoom')  (흰 공간 등 다른 장면에서)
 *          index.html#room  또는  index.html?scene=heroRoom&job=ruby  (단독 테스트)
 * 종료점:  메이어의 이야기(mayer_brief) 끝의 "@end 다음으로" → 아래 next 장면
 *          next 장면은 아직 미정이라 임시 연결 지점(자리 표시) 화면으로 이동한다.
 *
 * 진행 상태는 game.state.scenes.heroRoom 에 저장된다 (세이브 대상):
 *   events.opening   시작 이벤트를 봤는지
 *   events.briefing  메이어의 다음 이야기를 들었는지
 *   inspected.<ID>   오브젝트를 조사한 횟수
 * 위치는 game.state.position.
 */
window.WS = window.WS || {};

(function () {
  const ID = 'heroRoom';
  let sections = null;
  const script = name => {
    sections = sections || WS.splitSections(WS.SCRIPTS.heroRoom);
    return sections[name] || null;
  };

  /** 조사 대상 → 실행할 스크립트 섹션 이름 */
  function sectionFor(game, target) {
    const sd = WS.State.sceneData(game.state, ID);
    if (target.kind === 'npc' && target.id === 'mayer') {
      return sd.events.briefing ? 'mayer_again' : 'mayer_first';
    }
    const o = target.ref;
    const n = sd.inspected[o.id] || 0;
    return (n > 0 && script(o.interact + '_again')) ? o.interact + '_again' : o.interact;
  }

  WS.registerScene(ID, {
    // 다음 장면 (미정) — 정해지면 장면 ID 로 바꾼다. 등록되지 않은 ID 는 임시 연결 지점 화면으로 간다.
    next: 'heroRoom_next',

    enter(game, payload) {
      if (payload && payload.test) {
        // 단독 테스트: 직업 선택 · 각성까지 끝난 새 게임 상태로 시작
        game.state = WS.State.createTestRun(game.meta, payload.job);
        game.ui.hud.refresh();
      }
      const run = game.state;
      run.sceneId = ID;
      const sd = WS.State.sceneData(run, ID);
      const st = game.stage;
      st.reset({ fromScene: payload && payload.from });
      st.fadeColor = '#140c12';
      game.ui.dialogue.resetExpressions();

      const def = WS.MAPS.heroRoom;
      const job = WS.getJob(run.player.jobId);
      const view = new WS.MapView(game, Object.assign({}, def, {
        playerSprite: run.player.awakened && job ? job.id : 'hero',  // 흰 공간에서 입은 의상 그대로
      }), {
        interact: async target => {
          const name = sectionFor(game, target);
          if (target.kind === 'object') {
            sd.inspected[target.id] = (sd.inspected[target.id] || 0) + 1;
          }
          const res = await game.runner.run(script(name));
          if (res === 'done' && name === 'mayer_first' && run.choices.mayer_ready === 0 && !view.detached) {
            await game.runner.run(script('mayer_brief'));
          }
          if (!view.detached) game.ui.dialogue.hide();   // 조사가 끝나면 대화창을 내린다
        },
        markerState: o => (sd.inspected[o.id] ? 'seen' : 'new'),
      });
      this.view = view;
      st.setView(view);

      if (!sd.events.opening) {
        // 처음 방문: 시작 이벤트
        st.whiteout = 1;
        view.cutscene();
        return game.runner.run(script('opening')).then(res => {
          if (res !== 'done' || view.detached) return;
          sd.events.opening = true;
          game.ui.dialogue.hide();
          view.npcs.mayer.alpha = 1;
          view.savePosition();
          view.explore();
        });
      }
      // 다시 들어옴 (다른 장면에서 돌아옴 · 불러오기): 저장된 위치에서 바로 탐색
      const pos = run.position && run.position.sceneId === ID ? run.position : def.wakeTile;
      const p = view.player;
      Object.assign(p, { x: pos.x, y: pos.y, dir: pos.dir || 'down', pose: 'stand' });
      p.px = p.x * view.T; p.py = p.y * view.T;
      view.npcs.mayer.alpha = 1;
      st.whiteout = payload && payload.from ? 0 : 1;
      if (st.whiteout) st.fadeIn(900);
      view.explore();
      return Promise.resolve();
    },

    exit(game) {
      game.runner.stop();
      game.ui.dialogue.hide();
      game.ui.closeup(null);
      if (this.view) { this.view.detach(); this.view = null; }
      game.stage.setView(null);
      game.stage.fadeColor = '#fbfbfa';
    },
  });
})();
