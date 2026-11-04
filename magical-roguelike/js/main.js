// Entry point: load assets, wire managers, run the main loop.
(function () {
  const MG = window.MG;

  function fit() {
    const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    document.getElementById('stage').style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();

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
      const dt = Math.min(0.05, (now - last) / 1000);
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
