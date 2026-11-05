// Run-level configuration.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.RUN_CONFIG = {
    startingShards: 10,
    startingPotions: 2,
    potionHealPct: 0.4,
    regionName: '황혼의 대성당',
    startPartySize: 4, // field 3 + bench 1
    maxDepth: 5,
    depthHealPct: 0.3, // living allies heal this much when descending to the next depth
  };

  // 심도 (depth): each depth is a new exploration map. difficultyOffset is added to every node.
  MG.DEPTHS = [
    { depth: 1, name: '황혼의 대성당 외곽', difficultyOffset: 0, finalDifficulty: 4, finalName: '심연의 문지기' },
    { depth: 2, name: '무너진 회랑', difficultyOffset: 1, finalDifficulty: 5, finalName: '쌍둥이 문지기' },
    { depth: 3, name: '가시관의 예배당', difficultyOffset: 2, finalDifficulty: 6, finalName: '가시관의 주교' },
    { depth: 4, name: '잠든 지하 묘소', difficultyOffset: 3, finalDifficulty: 7, finalName: '부활한 주교' },
    { depth: 5, name: '심연의 제단', difficultyOffset: 4, finalDifficulty: 8, finalName: '두 주교의 심판' },
  ];

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
