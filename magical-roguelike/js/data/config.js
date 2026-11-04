// Run-level configuration.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.RUN_CONFIG = {
    startingShards: 10,
    startingPotions: 2,
    potionHealPct: 0.4,
    regionName: '황혼의 대성당 구역',
  };

  // What survives a failed run. The prototype has no meta progression, so everything resets.
  // Flip an entry to 'keep' once a persistent system exists for it (handled in GameManager.newRun).
  MG.FAILURE_POLICY = {
    relics: 'reset',
    party: 'reset',
    shards: 'reset',
    map: 'reset',
  };
})();
