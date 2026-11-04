// Relics and synergies. Behaviour is selected by `effect.type`, implemented in RelicSystem.
// Change numbers/names here without touching code.
// unlock: optional meta-upgrade id required before the relic can appear (see js/data/meta.js).
(function () {
  const MG = (window.MG = window.MG || {});

  MG.RARITY = {
    common: { name: '일반', color: '#c9b6d6' },
    rare: { name: '희귀', color: '#f2c14e' },
    epic: { name: '전설', color: '#ff9fd6' },
    curse: { name: '저주', color: '#a46bff' },
  };

  MG.TAG_NAMES = {
    fire: '불속성', guard: '수호', swap: '교대', skill: '스킬', lane: '진격로', heal: '회복', burst: '폭딜',
  };

  const R = (id, name, icon, rarity, tags, trigger, desc, effect, extra) =>
    Object.assign({ id, name, icon, rarity, tags, trigger, desc, effect, stackable: false }, extra || {});

  const list = [
    // ---- original 13
    R('ember_core', '잔불의 핵', '✹', 'common', ['fire'], '기본 공격 적중', '기본 공격 적중 시 20% 확률로 공격력 60%의 화염 추가 피해.', { type: 'chanceExtraDamage', chance: 0.2, mult: 0.6, element: 'fire' }),
    R('resonance_sigil', '공명의 문양', '❂', 'common', ['fire'], '상시', '보유한 불속성 유물 1개마다 모든 아군 공격속도 +5%.', { type: 'atkSpeedPerTag', tag: 'fire', pct: 0.05 }),
    R('chain_seal', '연쇄의 인장', '⛓', 'common', ['guard'], '상시', '전장에 배치된 회복형·돌격형 아군 1명마다 모든 아군 방어력 +5%.', { type: 'defPerRoleOnField', roles: ['healer', 'assault'], pct: 0.05 }),
    R('guardian_shard', '수호자의 파편', '◆', 'common', ['guard', 'swap'], '교대 완료', '교대 투입된 아군에게 5초간 최대 체력 30%의 보호막.', { type: 'shieldOnSwapIn', pct: 0.3, dur: 5 }),
    R('pursuer_medal', '추격자의 메달', '✪', 'rare', [], '웨이브 시작', '웨이브 시작 시 30초 동안 모든 아군 공격력 +50%.', { type: 'waveStartAtkBuff', pct: 0.5, dur: 30 }),
    R('echo_crystal', '잔향의 수정', '❖', 'common', ['skill'], '전투 시작', '전투마다 무작위 아군 1명의 스킬 재사용 회복 속도 +70%.', { type: 'battleRandomSkillHaste', pct: 0.7 }),
    R('hunters_mark', '사냥꾼의 표식', '⌖', 'common', ['skill'], '스킬 적중', '스킬에 적중한 적에게 표식(6초): 받는 피해 +15%.', { type: 'markOnSkillHit', amp: 0.15, dur: 6 }),
    R('crimson_ribbon', '홍련의 리본', '🎀', 'common', ['fire'], '적 처치', '적 처치 시 폭발하여 주변 적에게 처치한 아군 공격력 40% 화염 피해.', { type: 'explodeOnKill', mult: 0.4, radius: 170, element: 'fire' }),
    R('flame_chrism', '화염의 성유', '♨', 'common', ['fire'], '상시', '모든 아군 공격력 +8%. (중첩 가능)', { type: 'statBonus', stat: 'atk', pct: 0.08 }, { stackable: true }),
    R('moon_hourglass', '달의 모래시계', '⧗', 'rare', ['swap'], '교대 완료', '교대 대기시간 -40%. 교대 투입된 아군의 스킬 대기시간 -3초.', { type: 'swapHaste', cdPct: 0.4, skillCdCut: 3 }),
    R('thorn_rosary', '가시 묵주', '✠', 'common', ['guard'], '피격', '전열 아군이 받은 피해의 15%를 공격자에게 반사.', { type: 'reflectFront', pct: 0.15 }),
    R('bell_charm', '성종 부적', '🔔', 'common', ['heal'], '웨이브 종료', '웨이브 종료 시 배치 아군 체력 8% 회복.', { type: 'waveEndHeal', pct: 0.08 }),
    R('star_grail', '별의 성배', '🏆', 'rare', ['skill'], '스킬 발동', '스킬 피해와 회복량 +30%.', { type: 'skillPower', pct: 0.3 }),
    // ---- lane
    R('lane_banner', '진격로의 깃발', '⚑', 'common', ['lane'], '진격로 이동 완료', '진격로 이동을 마친 아군 6초간 공격력 +40%.', { type: 'laneMoveAtk', pct: 0.4, dur: 6 }),
    R('traveler_boots', '나그네의 장화', '👢', 'common', ['lane'], '진격로 이동', '진격로 이동 시간 -50%.', { type: 'laneMoveTime', mult: 0.5 }),
    R('rear_dagger', '후열의 단검', '🗡', 'common', ['lane'], '상시', '후열 근접 아군의 피해 감소(60%)가 사라집니다.', { type: 'noBackPenalty' }),
    R('lone_wolf_fang', '외로운 늑대의 이빨', '🐺', 'common', ['lane'], '상시', '진격로에 홀로 선 아군 공격력·방어력 +25%.', { type: 'loneBonus', pct: 0.25 }),
    R('fortress_crest', '요새의 문장', '🛡', 'rare', ['guard', 'lane'], '상시', '전열 아군 방어력 +30%.', { type: 'frontDef', pct: 0.3 }),
    // ---- guard / heal
    R('last_bastion', '최후의 보루', '🏰', 'common', ['guard'], '생명 손실', '적이 홈 포인트에 닿아 생명을 잃으면 8초간 전체 공격력 +30%, 배치 아군 체력 10% 회복.', { type: 'leakRally', pct: 0.3, dur: 8, heal: 0.1 }),
    R('lifeline_charm', '생명줄 부적', '🧿', 'common', ['guard'], '전투 시작', '전투 시작 시 공유 생명 +1 (최대치까지).', { type: 'battleLife', n: 1 }),
    R('healer_ring', '치유사의 반지', '💍', 'common', ['heal'], '회복', '모든 회복량 +35%.', { type: 'healMult', pct: 0.35 }),
    R('overflow_blessing', '넘치는 축복', '⛲', 'common', ['heal', 'guard'], '회복', '초과 회복량이 5초짜리 보호막으로 전환됩니다.', { type: 'overflowShield', pct: 1, dur: 5 }),
    // ---- skill / burst
    R('swift_quill', '신속의 깃펜', '🪶', 'common', ['skill'], '스킬 발동', '스킬을 쓴 아군 5초간 공격속도 +30%.', { type: 'castAtkSpeed', pct: 0.3, dur: 5 }),
    R('mana_spring', '마력의 샘', '💧', 'common', ['skill'], '전투 시작', '전투 시작 시 모든 아군 스킬 대기시간이 절반 남은 상태로 시작합니다.', { type: 'openingCd', remain: 0.5 }),
    R('executioner_coin', '처형자의 동전', '🪙', 'common', ['burst'], '피해', '체력 30% 이하 적에게 주는 피해 +25%.', { type: 'lowHpDamage', threshold: 0.3, pct: 0.25 }),
    R('echo_bell', '메아리 종', '🎐', 'rare', ['skill'], '스킬 발동', '스킬 발동 시 25% 확률로 같은 진격로 다른 아군 스킬 대기 -3초.', { type: 'castEcho', chance: 0.25, cut: 3 }),
    R('swap_blade', '교대의 칼날', '⚔', 'rare', ['swap', 'burst'], '교대 완료', '교대 투입 시 진격로 모든 적에게 투입 아군 공격력 80% 피해.', { type: 'swapStrike', mult: 0.8 }),
    // ---- epic
    R('twilight_crown', '황혼의 왕관', '👑', 'epic', ['skill'], '상시', '전체 공격력 +15%, 스킬 재사용 속도 +20%.', { type: 'crown', atk: 0.15, haste: 0.2 }, { unlock: 'u_epic' }),
    R('phoenix_feather', '불사조의 깃털', '🔥', 'epic', ['fire', 'heal'], '전투 불능', '전투마다 1회, 쓰러질 아군이 체력 50%로 부활하고 진격로 적에게 공격력 100% 화염 피해.', { type: 'phoenix', heal: 0.5, mult: 1 }, { unlock: 'u_epic' }),
    R('mirror_prism', '거울 프리즘', '🔮', 'epic', ['skill'], '스킬 발동', '스킬 발동 시 30% 확률로 70% 위력으로 한 번 더 발동.', { type: 'skillEcho', chance: 0.3, mult: 0.7 }, { unlock: 'u_epic' }),
    // ---- curse
    R('blood_oath', '피의 서약', '🩸', 'curse', ['burst'], '전투 시작', '이득: 전체 공격력 +30%.\n대가: 전투 시작 시 모든 아군 최대 체력 10%만큼 체력 상실(최소 1).', { type: 'bloodOath', atk: 0.3, cost: 0.1 }),
    R('glass_crown', '유리 왕관', '💎', 'curse', ['burst'], '상시', '이득: 전체 공격력 +45%.\n대가: 아군이 받는 피해 +30%.', { type: 'glassCrown', atk: 0.45, taken: 0.3 }),
    R('hungry_grail', '굶주린 성배', '🍷', 'curse', ['skill'], '상시', '이득: 스킬 재사용 속도 +50%.\n대가: 전투 보상 별조각 -50%.', { type: 'hungryGrail', haste: 0.5, shards: 0.5 }),
    R('cracked_bell', '금 간 종', '🔕', 'curse', ['swap'], '교대 완료', '이득: 교대 대기시간 -60%.\n대가: 교대 투입된 아군 최대 체력 5%만큼 체력 상실.', { type: 'crackedBell', cdPct: 0.6, cost: 0.05 }),
  ];

  MG.RELICS = {};
  for (const r of list) MG.RELICS[r.id] = r;

  // Synergies: relics remain useful alone; owning the combination upgrades/links them.
  // requires.relics: all must be owned. requires.tagCount: number of owned relics with the tag.
  MG.SYNERGIES = {
    spreading_flame: { id: 'spreading_flame', name: '번지는 불꽃', requires: { relics: ['ember_core', 'hunters_mark'] }, desc: '잔불의 핵 추가 피해가 표식을 남깁니다. 표식이 있는 적이 쓰러지면 주변 적에게 표식이 번집니다.' },
    blazing_resonance: { id: 'blazing_resonance', name: '타오르는 공명', requires: { relics: ['resonance_sigil'], tagCount: { tag: 'fire', count: 3 } }, desc: '불속성 유물 3개 이상: 공명의 문양 공격속도 보너스가 유물당 +10%로 증가.' },
    iron_chain: { id: 'iron_chain', name: '불굴의 사슬', requires: { relics: ['chain_seal', 'guardian_shard'] }, desc: '교대 보호막 +50%. 보호막을 가진 아군 방어력 +20%.' },
    echo_pursuit: { id: 'echo_pursuit', name: '추격의 메아리', requires: { relics: ['pursuer_medal', 'echo_crystal'] }, desc: '웨이브 시작 시 잔향의 수정이 선택한 아군의 스킬이 즉시 준비됩니다.' },
    hourglass_guard: { id: 'hourglass_guard', name: '시간의 수호', requires: { relics: ['moon_hourglass', 'guardian_shard'] }, desc: '교대 투입된 아군이 최대 체력 15%를 회복합니다.' },
    rose_inferno: { id: 'rose_inferno', name: '장미 지옥', requires: { relics: ['thorn_rosary', 'crimson_ribbon'] }, desc: '반사 피해가 25%로 증가하고, 반사로 처치한 적도 폭발합니다.' },
    leap_momentum: { id: 'leap_momentum', name: '도약의 기세', requires: { relics: ['lane_banner', 'traveler_boots'] }, desc: '진격로 이동을 마친 아군의 스킬 대기 -4초.' },
    blade_dance: { id: 'blade_dance', name: '칼날의 춤', requires: { relics: ['swap_blade', 'moon_hourglass'] }, desc: '교대의 칼날 피해 80% → 120%.' },
    cycle_of_life: { id: 'cycle_of_life', name: '생명의 순환', requires: { relics: ['healer_ring', 'overflow_blessing'] }, desc: '초과 회복이 150% 보호막으로 전환되고 8초 유지됩니다.' },
    skill_storm: { id: 'skill_storm', name: '스킬 폭풍', requires: { relics: ['swift_quill', 'mana_spring'] }, desc: '신속의 깃펜 공격속도 +30% → +50%, 5초 → 7초.' },
    steel_rampart: { id: 'steel_rampart', name: '강철 성벽', requires: { relics: ['fortress_crest', 'thorn_rosary'] }, desc: '가시 묵주 반사율 +10%p.' },
    blood_flame: { id: 'blood_flame', name: '핏빛 화염', requires: { relics: ['blood_oath', 'crimson_ribbon'] }, desc: '홍련의 리본 폭발 피해 40% → 60%.' },
    guardian_oath: { id: 'guardian_oath', name: '수호의 맹세', requires: { tagCount: { tag: 'guard', count: 3 } }, desc: '수호 유물 3개 이상: 전체 방어력 +15%.' },
    arcane_oath: { id: 'arcane_oath', name: '비전의 맹세', requires: { tagCount: { tag: 'skill', count: 3 } }, desc: '스킬 유물 3개 이상: 스킬 피해·회복 +15%.' },
  };
})();
