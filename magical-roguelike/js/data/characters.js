// Ally (magical girl) data. Numbers are prototype values — tune freely.
// role: assault(돌격형) | healer(회복형) | caster(사격형) | support(지원형) | guardian(수호형)
// attackType: melee uses the "melee" combo frames, ranged uses "proj" frames + a projectile.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.ROLE_NAMES = {
    assault: '돌격형',
    healer: '회복형',
    caster: '사격형',
    support: '지원형',
    guardian: '수호형',
  };

  MG.CHARACTERS = {
    amore: {
      id: 'amore',
      name: '아모레',
      title: '사랑의 하트 마법소녀',
      role: 'healer',
      color: '#ff7fbf',
      attackType: 'ranged',
      stats: { hp: 360, atk: 26, def: 10, atkInterval: 1.25 },
      projFrame: 2, // index of a standalone projectile frame in the "proj" row
      impactFrame: 3,
      skill: {
        id: 'heart_serenade',
        name: '하트 세레나데',
        type: 'heal',
        desc: '배치된 모든 아군의 체력을 최대 체력의 22% 회복합니다.',
        cooldown: 14,
        healPct: 0.22,
        anim: 'spin',
      },
    },
    luna: {
      id: 'luna',
      name: '루나',
      title: '별과 달의 마법소녀',
      role: 'caster',
      color: '#b48cff',
      attackType: 'ranged',
      stats: { hp: 300, atk: 38, def: 6, atkInterval: 1.4 },
      projFrame: 2,
      impactFrame: 3,
      skill: {
        id: 'meteor_shower',
        name: '유성우',
        type: 'aoe',
        desc: '자신의 진격로 모든 적에게 공격력 180%, 다른 진격로 적에게 90% 피해.',
        cooldown: 12,
        mult: 1.8,
        otherLaneMult: 0.9,
        anim: 'proj',
      },
    },
    sylphy: {
      id: 'sylphy',
      name: '실피',
      title: '은빛 나비의 마법소녀',
      role: 'support',
      color: '#8fc8ff',
      attackType: 'ranged',
      stats: { hp: 330, atk: 28, def: 12, atkInterval: 1.3 },
      projFrame: 2,
      impactFrame: 3,
      skill: {
        id: 'butterfly_barrier',
        name: '나비 결계',
        type: 'shield',
        desc: '같은 진격로 아군에게 최대 체력 25% 보호막(6초), 그 진격로 적 이동속도 40% 감소(3초).',
        cooldown: 13,
        shieldPct: 0.25,
        shieldDur: 6,
        slowPct: 0.4,
        slowDur: 3,
        anim: 'spin',
      },
    },
    rozel: {
      id: 'rozel',
      name: '로젤',
      title: '흑장미의 마법소녀',
      role: 'assault',
      color: '#e0384f',
      attackType: 'melee',
      stats: { hp: 420, atk: 40, def: 14, atkInterval: 1.0 },
      projFrame: null,
      impactFrame: 3,
      skill: {
        id: 'black_rose_execution',
        name: '흑장미 처형',
        type: 'single',
        desc: '진격로에서 체력이 가장 높은 적 하나에게 공격력 450% 피해.',
        cooldown: 10,
        mult: 4.5,
        anim: 'proj',
      },
    },
    bella: {
      id: 'bella',
      name: '벨라',
      title: '황금 성종의 마법소녀',
      role: 'guardian',
      color: '#f2c14e',
      attackType: 'melee',
      stats: { hp: 560, atk: 24, def: 26, atkInterval: 1.3 },
      projFrame: null,
      impactFrame: 3,
      skill: {
        id: 'holy_bell',
        name: '성종 울림',
        type: 'defense',
        desc: '진격로의 적을 1.5초 기절시키고, 자신에게 최대 체력 35% 보호막과 방어력 +50%(6초).',
        cooldown: 15,
        stunDur: 1.5,
        shieldPct: 0.35,
        defPct: 0.5,
        buffDur: 6,
        anim: 'spin',
      },
    },
    cheongryeon: {
      id: 'cheongryeon',
      name: '청련',
      title: '푸른 연꽃의 무도 마법소녀',
      role: 'assault',
      color: '#4f86d9',
      attackType: 'melee',
      stats: { hp: 400, atk: 34, def: 12, atkInterval: 0.85 },
      projFrame: null,
      impactFrame: 3,
      // passive: when she is swapped in, she spins into the lane
      entry: { name: '선풍 진입', desc: '교대 투입 시 진격로의 모든 적에게 공격력 120% 피해.', mult: 1.2 },
      skill: {
        id: 'lotus_relay',
        name: '연환 교대',
        type: 'tag',
        desc: '진격로의 모든 적에게 공격력 150% 피해. 8초 안에 이 진격로로 교대 투입되는 아군은 교대 대기시간을 무시하고 공격력 +50%(8초).',
        cooldown: 11,
        mult: 1.5,
        window: 8,
        tagAtkPct: 0.5,
        tagDur: 8,
        anim: 'spin',
      },
    },
  };

  // Starting party: 3 on the field, 3 on the bench.
  MG.STARTING_PARTY = {
    active: [
      { charId: 'rozel', lane: 0, slot: 'front' },
      { charId: 'luna', lane: 0, slot: 'back' },
      { charId: 'bella', lane: 1, slot: 'front' },
    ],
    bench: ['amore', 'sylphy', 'cheongryeon'],
  };
})();
