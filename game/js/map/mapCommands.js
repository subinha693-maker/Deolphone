/*
 * 맵 장면용 스크립트 명령 (공통)
 *   @face 대상 방향            player / NPC ID, 방향 up · down · left · right
 *   @walk 대상 방향 칸수       걸어서 이동 (막히면 멈춤)
 *   @wake                      누워 있던 주인공이 일어남 (맵 데이터의 wakeTile 로)
 *   @reveal 대상 밀리초        흐릿하던 인물이 또렷해짐
 *   @camera 대상 [밀리초]       카메라가 대상을 비춤 (player 로 되돌림)
 *   @emote 대상 기호           머리 위 말풍선 (! ? …)
 *   @explore                   자유 조사 시작
 */
window.WS = window.WS || {};

(function () {
  const C = WS.SCRIPT_COMMANDS = WS.SCRIPT_COMMANDS || {};
  const view = g => {
    const v = g.stage.view;
    if (!v || !(v instanceof WS.MapView)) throw new Error('맵 장면이 아닌 곳에서 맵 명령을 썼습니다.');
    return v;
  };
  const actor = (v, who) => (who === 'player' || !who ? v.player : v.npcs[who]);

  C.face = async (g, [who, dir]) => {
    const a = actor(view(g), who);
    if (a && WS.DIRS[dir]) a.dir = dir;
    return null;
  };

  C.walk = async (g, [who, dir, n]) => {
    const v = view(g);
    await v.walk(actor(v, who), dir, parseInt(n, 10) || 1);
    return null;
  };

  C.wake = async (g) => {
    const v = view(g);
    const p = v.player, w = v.def.wakeTile;
    p.pose = 'stand';
    if (w) { p.x = w.x; p.y = w.y; p.dir = w.dir || 'down'; p.px = p.x * v.T; p.py = p.y * v.T; }
    v.savePosition();
    await WS.sleep(250);
    return null;
  };

  C.reveal = async (g, [who, ms]) => {
    const v = view(g);
    const a = actor(v, who);
    a.visible = true;
    await g.stage.tween(a, 'alpha', 1, parseInt(ms, 10) || 1000);
    return null;
  };

  C.camera = async (g, [who, ms]) => {
    const v = view(g);
    v.camFocus = who || 'player';
    await WS.sleep(parseInt(ms, 10) || 600);
    return null;
  };

  C.emote = async (g, [who, sym]) => {
    const v = view(g);
    v.emote(actor(v, who), sym || '!');
    await WS.sleep(500);
    return null;
  };

  C.explore = async (g) => {
    view(g).explore();
    return null;
  };
})();
