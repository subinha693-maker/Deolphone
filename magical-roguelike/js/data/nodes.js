// Node types, map generation parameters and wave templates.
(function () {
  const MG = (window.MG = window.MG || {});

  // implemented:false types exist in data so the structure is ready, but the map
  // generator never places them and the UI never presents them as playable.
  MG.NODE_TYPES = {
    battle: { id: 'battle', name: '일반 전투', icon: '⚔', implemented: true, color: '#c46a8e', battle: true },
    elite: { id: 'elite', name: '강적 전투', icon: '☠', implemented: true, color: '#e0384f', battle: true },
    relic: { id: 'relic', name: '유물', icon: '✦', implemented: true, color: '#f2c14e' },
    event: { id: 'event', name: '사건', icon: '?', implemented: true, color: '#8fc8ff' },
    rest: { id: 'rest', name: '휴식', icon: '☾', implemented: true, color: '#9fe0a4' },
    shop: { id: 'shop', name: '상점', icon: '◈', implemented: false, color: '#888' },
    final: { id: 'final', name: '최종 전투', icon: '♛', implemented: true, color: '#ff4f7a', battle: true },
  };

  MG.MAP_CONFIG = {
    columns: 8, // last column is the final battle
    minPerColumn: 2,
    maxPerColumn: 3,
    // weights for middle columns (only implemented types)
    weights: [
      { v: 'battle', w: 40 },
      { v: 'elite', w: 12, minCol: 2 },
      { v: 'relic', w: 14, minCol: 1 },
      { v: 'event', w: 20 },
      { v: 'rest', w: 14, minCol: 2 },
    ],
    defenseChance: 0.35, // share of normal battles that use home-point defense rules
    startingLife: 10,
  };

  // Rewards per node type. relicPool: rarity weights for relic choices.
  MG.NODE_REWARDS = {
    battle: { shards: [8, 14], relicChoices: 3, rarity: { common: 80, rare: 20 } },
    elite: { shards: [18, 26], relicChoices: 3, rarity: { common: 25, rare: 75 } },
    final: { shards: [0, 0], relicChoices: 0 },
    relic: { relicChoices: 3, rarity: { common: 55, rare: 45 } },
  };

  // Wave templates. lane: 0 = upper, 1 = lower, 'both' = one of each per count, 'rand'
  // startCondition: after the advance (run) phase ends, optionally wait `delay` seconds.
  MG.WAVE_TEMPLATES = [
    { id: 'bats_top', tier: 1, entries: [{ enemy: 'bat', count: 4, lane: 0, interval: 0.7 }] },
    { id: 'bats_split', tier: 1, entries: [{ enemy: 'bat', count: 3, lane: 'both', interval: 0.8 }] },
    { id: 'skel_bottom', tier: 1, entries: [{ enemy: 'skeleton', count: 2, lane: 1, interval: 1.4 }, { enemy: 'bat', count: 2, lane: 0, interval: 0.9, delay: 1.5 }] },
    { id: 'skel_pair', tier: 2, entries: [{ enemy: 'skeleton', count: 2, lane: 'both', interval: 1.2 }, { enemy: 'doll', count: 1, lane: 'rand', interval: 1, delay: 2 }] },
    { id: 'dolls', tier: 2, entries: [{ enemy: 'skeleton', count: 2, lane: 0, interval: 1.3 }, { enemy: 'doll', count: 2, lane: 0, interval: 1.4, delay: 1 }, { enemy: 'bat', count: 3, lane: 1, interval: 0.7 }] },
    { id: 'wraiths', tier: 2, entries: [{ enemy: 'wraith', count: 3, lane: 'rand', interval: 1.1 }, { enemy: 'bat', count: 3, lane: 'both', interval: 0.6, delay: 2 }] },
    { id: 'mixed_push', tier: 3, entries: [{ enemy: 'skeleton', count: 3, lane: 'both', interval: 1.1 }, { enemy: 'wraith', count: 2, lane: 'rand', interval: 1.2, delay: 1.5 }, { enemy: 'doll', count: 2, lane: 'both', interval: 1.5, delay: 3 }] },
    { id: 'swarm', tier: 3, entries: [{ enemy: 'bat', count: 8, lane: 'both', interval: 0.45 }, { enemy: 'wraith', count: 2, lane: 'both', interval: 1, delay: 2.5 }] },
  ];

  MG.ELITE_WAVES = [
    { id: 'elite_knight', tier: 3, entries: [{ enemy: 'dark_knight', count: 1, lane: 'rand', interval: 1 }, { enemy: 'skeleton', count: 3, lane: 'both', interval: 1.2, delay: 2 }, { enemy: 'doll', count: 2, lane: 'both', interval: 1.4, delay: 4 }] },
  ];

  MG.FINAL_WAVES = [
    { id: 'final_guard', tier: 3, entries: [{ enemy: 'skeleton', count: 4, lane: 'both', interval: 1 }, { enemy: 'wraith', count: 2, lane: 'both', interval: 1, delay: 2 }] },
    { id: 'final_knights', tier: 3, entries: [{ enemy: 'dark_knight', count: 2, lane: 'both', interval: 2 }, { enemy: 'doll', count: 2, lane: 'both', interval: 1.5, delay: 2 }] },
    { id: 'final_boss', tier: 3, entries: [{ enemy: 'thorn_bishop', count: 1, lane: 0, interval: 1 }, { enemy: 'skeleton', count: 2, lane: 1, interval: 1.5, delay: 1 }] },
  ];

  // How many waves a node has, by type
  MG.WAVE_COUNT = { battle: [2, 3], elite: [2, 2], final: [3, 3] };

  // Enemy stat scaling by node difficulty (1..6)
  MG.DIFFICULTY_SCALING = { hpPerLevel: 0.2, atkPerLevel: 0.12 };
})();
