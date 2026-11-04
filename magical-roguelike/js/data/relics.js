// Relics and synergies. Behaviour is selected by `effect.type`, implemented in RelicSystem.
// Change numbers/names here without touching code.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.RARITY = {
    common: { name: '일반', color: '#c9b6d6' },
    rare: { name: '희귀', color: '#f2c14e' },
  };

  MG.RELICS = {
    ember_core: {
      id: 'ember_core', name: '잔불의 핵', icon: '🜂', rarity: 'common', tags: ['fire'], stackable: false,
      desc: '기본 공격 적중 시 20% 확률로 공격력 60%의 화염 추가 피해.',
      trigger: '기본 공격 적중',
      effect: { type: 'chanceExtraDamage', chance: 0.2, mult: 0.6, element: 'fire' },
    },
    resonance_sigil: {
      id: 'resonance_sigil', name: '공명의 문양', icon: '❂', rarity: 'common', tags: ['fire'], stackable: false,
      desc: '보유한 불속성 유물 1개마다 모든 아군 공격속도 +5%.',
      trigger: '상시',
      effect: { type: 'atkSpeedPerTag', tag: 'fire', pct: 0.05 },
    },
    chain_seal: {
      id: 'chain_seal', name: '연쇄의 인장', icon: '⛓', rarity: 'common', tags: ['guard'], stackable: false,
      desc: '전장에 배치된 회복형·돌격형 아군 1명마다 모든 아군 방어력 +5%.',
      trigger: '상시',
      effect: { type: 'defPerRoleOnField', roles: ['healer', 'assault'], pct: 0.05 },
    },
    guardian_shard: {
      id: 'guardian_shard', name: '수호자의 파편', icon: '◆', rarity: 'common', tags: ['guard', 'swap'], stackable: false,
      desc: '교대 투입된 아군에게 5초간 최대 체력 30%의 보호막.',
      trigger: '교대 완료',
      effect: { type: 'shieldOnSwapIn', pct: 0.3, dur: 5 },
    },
    pursuer_medal: {
      id: 'pursuer_medal', name: '추격자의 메달', icon: '✪', rarity: 'rare', tags: [], stackable: false,
      desc: '웨이브 시작 시 30초 동안 모든 아군 공격력 +50%.',
      trigger: '웨이브 시작',
      effect: { type: 'waveStartAtkBuff', pct: 0.5, dur: 30 },
    },
    echo_crystal: {
      id: 'echo_crystal', name: '잔향의 수정', icon: '❖', rarity: 'common', tags: ['skill'], stackable: false,
      desc: '전투마다 무작위 아군 1명의 스킬 재사용 회복 속도 +70%.',
      trigger: '전투 시작',
      effect: { type: 'battleRandomSkillHaste', pct: 0.7 },
    },
    hunters_mark: {
      id: 'hunters_mark', name: '사냥꾼의 표식', icon: '⌖', rarity: 'common', tags: ['skill'], stackable: false,
      desc: '스킬에 적중한 적에게 표식(6초): 받는 피해 +15%.',
      trigger: '스킬 적중',
      effect: { type: 'markOnSkillHit', amp: 0.15, dur: 6 },
    },
    crimson_ribbon: {
      id: 'crimson_ribbon', name: '홍련의 리본', icon: '🎀', rarity: 'common', tags: ['fire'], stackable: false,
      desc: '적 처치 시 폭발하여 주변 적에게 처치한 아군 공격력 40% 화염 피해.',
      trigger: '적 처치',
      effect: { type: 'explodeOnKill', mult: 0.4, radius: 170, element: 'fire' },
    },
    flame_chrism: {
      id: 'flame_chrism', name: '화염의 성유', icon: '♨', rarity: 'common', tags: ['fire'], stackable: true,
      desc: '모든 아군 공격력 +8%. (중첩 가능)',
      trigger: '상시',
      effect: { type: 'statBonus', stat: 'atk', pct: 0.08 },
    },
    moon_hourglass: {
      id: 'moon_hourglass', name: '달의 모래시계', icon: '⧗', rarity: 'rare', tags: ['swap'], stackable: false,
      desc: '교대 대기시간 -40%. 교대 투입된 아군의 스킬 대기시간 -3초.',
      trigger: '교대 완료',
      effect: { type: 'swapHaste', cdPct: 0.4, skillCdCut: 3 },
    },
    thorn_rosary: {
      id: 'thorn_rosary', name: '가시 묵주', icon: '✠', rarity: 'common', tags: ['guard'], stackable: false,
      desc: '전열 아군이 받은 피해의 15%를 공격자에게 반사.',
      trigger: '피격',
      effect: { type: 'reflectFront', pct: 0.15 },
    },
    bell_charm: {
      id: 'bell_charm', name: '성종 부적', icon: '🔔', rarity: 'common', tags: [], stackable: false,
      desc: '웨이브 종료 시 배치된 아군 체력 8% 회복.',
      trigger: '웨이브 종료',
      effect: { type: 'waveEndHeal', pct: 0.08 },
    },
    star_grail: {
      id: 'star_grail', name: '별의 성배', icon: '🏆', rarity: 'rare', tags: ['skill'], stackable: false,
      desc: '스킬 피해와 회복량 +30%.',
      trigger: '스킬 발동',
      effect: { type: 'skillPower', pct: 0.3 },
    },
  };

  // Synergies: relics remain useful alone; owning the combination upgrades/links them.
  // requires.relics: all must be owned. requires.tagCount: count of owned relics with tag (excluding listed relics if excludeListed).
  MG.SYNERGIES = {
    spreading_flame: {
      id: 'spreading_flame', name: '번지는 불꽃',
      requires: { relics: ['ember_core', 'hunters_mark'] },
      desc: '잔불의 핵 추가 피해가 표식을 남깁니다. 표식이 있는 적이 쓰러지면 주변 적에게 표식이 번집니다.',
    },
    blazing_resonance: {
      id: 'blazing_resonance', name: '타오르는 공명',
      requires: { relics: ['resonance_sigil'], tagCount: { tag: 'fire', count: 3 } },
      desc: '불속성 유물 3개 이상: 공명의 문양 공격속도 보너스가 유물당 +10%로 증가.',
    },
    iron_chain: {
      id: 'iron_chain', name: '불굴의 사슬',
      requires: { relics: ['chain_seal', 'guardian_shard'] },
      desc: '교대 보호막 +50%. 보호막을 가진 아군 방어력 +20%.',
    },
    echo_pursuit: {
      id: 'echo_pursuit', name: '추격의 메아리',
      requires: { relics: ['pursuer_medal', 'echo_crystal'] },
      desc: '웨이브 시작 시 잔향의 수정이 선택한 아군의 스킬이 즉시 준비됩니다.',
    },
    hourglass_guard: {
      id: 'hourglass_guard', name: '시간의 수호',
      requires: { relics: ['moon_hourglass', 'guardian_shard'] },
      desc: '교대 투입된 아군이 최대 체력 15%를 회복합니다.',
    },
    rose_inferno: {
      id: 'rose_inferno', name: '장미 지옥',
      requires: { relics: ['thorn_rosary', 'crimson_ribbon'] },
      desc: '반사 피해가 25%로 증가하고, 반사로 처치한 적도 폭발합니다.',
    },
  };
})();
