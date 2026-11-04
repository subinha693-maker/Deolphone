// Run-level configuration.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.RUN_CONFIG = {
    startingShards: 10,
    startingPotions: 2,
    potionHealPct: 0.4,
    regionName: '황혼의 대성당 구역',
    startPartySize: 4, // field 3 + bench 1
  };

  // What survives a failed run *inside the run state*. Everything run-local resets.
  // Permanent progression (월광, 성소 업그레이드, 해금, 도감) is kept separately by MG.Meta / MG.Save,
  // so it is intentionally not listed here.
  MG.FAILURE_POLICY = {
    relics: 'reset',
    party: 'reset',
    shards: 'reset',
    map: 'reset',
  };
})();
