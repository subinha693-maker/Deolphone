// Entry point: load assets, wire managers, run the main loop.
(function () {
  const MG = window.MG;

  // Landscape play: on a portrait screen the 1280x720 stage is rotated 90° so it fills
  // the phone when held sideways (works even with the OS orientation locked).
  function fit() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rotate = h > w;
    const s = rotate ? Math.min(h / 1280, w / 720) : Math.min(w / 1280, h / 720);
    MG.view = { rotate, scale: s };
    document.getElementById('stage').style.transform = rotate ? `translate(-50%, -50%) rotate(90deg) scale(${s})` : `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 150));
  fit();

  /** Best effort: fullscreen + landscape lock where the browser allows it (phones). */
  MG.requestLandscape = function () {
    try {
      const el = document.documentElement;
      const fs = el.requestFullscreen ? el.requestFullscreen() : null;
      const lock = () => {
        try {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        } catch (e) {
          /* not supported */
        }
      };
      if (fs && fs.then) fs.then(lock).catch(() => {});
      else lock();
    } catch (e) {
      /* fullscreen refused: the rotated layout still works */
    }
  };

  MG.Assets.load().then(() => {
    document.getElementById('loading').remove();
    const gm = new MG.GameManager();
    const renderer = new MG.BattleRenderer(document.getElementById('battleCanvas'));
    const ui = new MG.UIManager(gm, renderer);
    MG.game = { gm, ui, renderer }; // handy for debugging from the console
    ui.onState('TITLE');

    let last = performance.now();
    let titleT = 0;
    function frame(now) {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // first rAF stamp can precede `last`
      last = now;
      gm.update(dt);
      if (gm.battle && (gm.state === 'BATTLE' || gm.state === 'REWARD')) renderer.draw(gm.battle);
      if (gm.state === 'BATTLE') ui.updateBattleHud();
      if (gm.state === 'TITLE') {
        titleT += dt;
        MG.SceneArt.drawTitle(document.getElementById('titleCanvas'), renderer, titleT);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
})();
