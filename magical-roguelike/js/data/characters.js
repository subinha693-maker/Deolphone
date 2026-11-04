// Ally (magical girl) data. Numbers are prototype values — tune freely.
// role: assault(돌격형) | healer(회복형) | caster(사격형) | support(지원형) | guardian(수호형)
// attackType: melee uses the "melee" combo frames, ranged uses "proj" frames + a projectile.
// projFrame: index of a standalone projectile frame in the "proj" row (null = glowing orb).
(function () {
  const MG = (window.MG = window.MG || {});

  MG.ROLE_NAMES = {
    assault: '돌격형',
    healer: '회복형',
    caster: '사격형',
    support: '지원형',
    guardian: '수호형',
  };

  MG.SKILL_TYPE_NAMES = {
    heal: '회복', aoe: '광역', shield: '보호막', single: '단일', defense: '방어', tag: '교대 연계',
    freeze: '빙결', void: '처형', regen: '지속 회복', sanctuary: '피해 감소', multi: '다중 타격',
  };

  MG.CHARACTERS = {
    amore: {
      id: 'amore', name: '아모레', title: '사랑의 하트 마법소녀', role: 'healer', color: '#ff7fbf', attackType: 'ranged',
      stats: { hp: 360, atk: 26, def: 10, atkInterval: 1.25 }, projFrame: 2, impactFrame: 3,
      skill: { id: 'heart_serenade', name: '하트 세레나데', type: 'heal', desc: '배치된 모든 아군의 체력을 최대 체력의 {healPct}% 회복합니다.', cooldown: 14, healPct: 0.22, anim: 'spin' },
    },
    luna: {
      id: 'luna', name: '루나', title: '별과 달의 마법소녀', role: 'caster', color: '#b48cff', attackType: 'ranged',
      stats: { hp: 300, atk: 38, def: 6, atkInterval: 1.4 }, projFrame: 2, impactFrame: 3,
      skill: { id: 'meteor_shower', name: '유성우', type: 'aoe', desc: '자신의 진격로 모든 적에게 공격력 {mult}%, 다른 진격로 적에게 {otherLaneMult}% 피해.', cooldown: 12, mult: 1.8, otherLaneMult: 0.9, anim: 'proj' },
    },
    sylphy: {
      id: 'sylphy', name: '실피', title: '은빛 나비의 마법소녀', role: 'support', color: '#8fc8ff', attackType: 'ranged',
      stats: { hp: 330, atk: 28, def: 12, atkInterval: 1.3 }, projFrame: 2, impactFrame: 3,
      skill: { id: 'butterfly_barrier', name: '나비 결계', type: 'shield', desc: '같은 진격로 아군에게 최대 체력 {shieldPct}% 보호막({shieldDur}초), 그 진격로 적 이동속도 {slowPct}% 감소({slowDur}초).', cooldown: 13, shieldPct: 0.25, shieldDur: 6, slowPct: 0.4, slowDur: 3, anim: 'spin' },
    },
    rozel: {
      id: 'rozel', name: '로젤', title: '흑장미의 마법소녀', role: 'assault', color: '#e0384f', attackType: 'melee',
      stats: { hp: 420, atk: 40, def: 14, atkInterval: 1.0 }, projFrame: null, impactFrame: 3,
      skill: { id: 'black_rose_execution', name: '흑장미 처형', type: 'single', desc: '진격로에서 체력이 가장 높은 적 하나에게 공격력 {mult}% 피해.', cooldown: 10, mult: 4.5, anim: 'proj' },
    },
    bella: {
      id: 'bella', name: '벨라', title: '황금 성종의 마법소녀', role: 'guardian', color: '#f2c14e', attackType: 'melee',
      stats: { hp: 560, atk: 24, def: 26, atkInterval: 1.3 }, projFrame: null, impactFrame: 3,
      skill: { id: 'holy_bell', name: '성종 울림', type: 'defense', desc: '진격로의 적을 {stunDur}초 기절시키고, 자신에게 최대 체력 {shieldPct}% 보호막과 방어력 +{defPct}%({buffDur}초).', cooldown: 15, stunDur: 1.5, shieldPct: 0.35, defPct: 0.5, buffDur: 6, anim: 'spin' },
    },
    cheongryeon: {
      id: 'cheongryeon', name: '청련', title: '푸른 연꽃의 무도 마법소녀', role: 'assault', color: '#4f86d9', attackType: 'melee',
      stats: { hp: 400, atk: 34, def: 12, atkInterval: 0.85 }, projFrame: null, impactFrame: 3,
      entry: { name: '선풍 진입', desc: '교대 투입 시 진격로의 모든 적에게 공격력 {mult}% 피해.', mult: 1.2 },
      skill: { id: 'lotus_relay', name: '연환 교대', type: 'tag', desc: '진격로의 모든 적에게 공격력 {mult}% 피해. {window}초 안에 이 진격로로 교대 투입되는 아군은 교대 대기시간을 무시하고 공격력 +{tagAtkPct}%({tagDur}초).', cooldown: 11, mult: 1.5, window: 8, tagAtkPct: 0.5, tagDur: 8, anim: 'spin' },
    },
    serin: {
      id: 'serin', name: '세린', title: '서리 검의 마법소녀', role: 'assault', color: '#7fd0ff', attackType: 'melee',
      stats: { hp: 390, atk: 36, def: 13, atkInterval: 1.05 }, projFrame: null, impactFrame: 3,
      skill: { id: 'frost_edge', name: '빙결 참격', type: 'freeze', desc: '진격로의 모든 적에게 공격력 {mult}% 피해를 주고 {freezeDur}초간 얼립니다(이동·공격 정지).', cooldown: 13, mult: 1.6, freezeDur: 2, anim: 'spin' },
    },
    noa: {
      id: 'noa', name: '노아', title: '공허를 부르는 마법소녀', role: 'caster', color: '#a368ff', attackType: 'ranged',
      stats: { hp: 290, atk: 40, def: 6, atkInterval: 1.45 }, projFrame: null, impactFrame: 3,
      skill: { id: 'void_collapse', name: '공허 붕괴', type: 'void', desc: '진격로의 모든 적에게 공격력 {mult}% 피해. 이후 체력 {executePct}% 이하가 된 적은 소멸합니다(보스 제외).', cooldown: 14, mult: 2.0, executePct: 0.2, anim: 'proj' },
    },
    elysia: {
      id: 'elysia', name: '엘리시아', title: '얼음 날개의 수호천사', role: 'support', color: '#9fe4ff', attackType: 'ranged',
      stats: { hp: 340, atk: 25, def: 11, atkInterval: 1.3 }, projFrame: null, impactFrame: 3,
      skill: { id: 'celestial_plume', name: '천상의 깃털', type: 'regen', desc: '배치된 모든 아군이 {regenDur}초 동안 매초 최대 체력 {regenPct}%를 회복합니다.', cooldown: 15, regenPct: 0.04, regenDur: 6, anim: 'spin' },
    },
    cecilia: {
      id: 'cecilia', name: '세실리아', title: '성흔의 수녀 마법소녀', role: 'guardian', color: '#ffd66b', attackType: 'melee',
      stats: { hp: 520, atk: 26, def: 22, atkInterval: 1.15 }, projFrame: null, impactFrame: 3,
      skill: { id: 'stigmata_prayer', name: '성흔의 기도', type: 'sanctuary', desc: '{sancDur}초 동안 같은 진격로 아군이 받는 피해 -{reducePct}%. 진격로의 적에게 공격력 {mult}% 신성 피해.', cooldown: 14, sancDur: 5, reducePct: 0.5, mult: 1.0, anim: 'spin' },
    },
    nero: {
      id: 'nero', name: '네로', title: '초승달 고양이 마법소녀', role: 'caster', color: '#c58cff', attackType: 'ranged',
      stats: { hp: 310, atk: 33, def: 8, atkInterval: 1.1 }, projFrame: null, impactFrame: 3,
      skill: { id: 'crescent_hunt', name: '초승달 사냥', type: 'multi', desc: '두 진격로의 무작위 적에게 초승달 {hits}개를 던져 각각 공격력 {mult}% 피해.', cooldown: 11, hits: 5, mult: 1.0, anim: 'proj' },
    },
  };

  // Display order (party select, codex)
  MG.CHAR_ORDER = ['rozel', 'luna', 'bella', 'amore', 'serin', 'noa', 'elysia', 'cecilia', 'nero', 'sylphy', 'cheongryeon'];
  // Unlocked without meta progression. 실피·청련 are unlocked in the 별빛 성소 (see js/data/meta.js).
  MG.DEFAULT_UNLOCKED = ['rozel', 'luna', 'bella', 'amore', 'serin', 'noa', 'elysia', 'cecilia', 'nero'];

  // Skill mods: patches over the base skill. Mods of one character never touch the same field.
  // Special patch keys: repeat {delay, mult} (cast again), killCdCut (cd refund on kill),
  // bothLanes (shield skill hits both lanes), healShieldPct/healShieldDur, bonusLaneMult (extra lane damage), entryMult.
  MG.SKILL_MODS = {
    amore: [
      { id: 'amore_bloom', name: '만개 세례', desc: '회복량 22% → 30%', patch: { healPct: 0.3 } },
      { id: 'amore_chorus', name: '연속 합창', desc: '재사용 14초 → 11초', patch: { cooldown: 11 } },
      { id: 'amore_guard', name: '수호의 하트', desc: '회복 시 전체에 최대 체력 12% 보호막(5초)', patch: { healShieldPct: 0.12, healShieldDur: 5 } },
    ],
    luna: [
      { id: 'luna_comet', name: '혜성 낙하', desc: '자기 진격로 피해 180% → 240%', patch: { mult: 2.4 } },
      { id: 'luna_cluster', name: '별무리', desc: '다른 진격로 피해 90% → 150%', patch: { otherLaneMult: 1.5 } },
      { id: 'luna_twin', name: '쌍성', desc: '0.7초 뒤 60% 위력으로 한 번 더', patch: { repeat: { delay: 0.7, mult: 0.6 } } },
    ],
    sylphy: [
      { id: 'sylphy_wing', name: '두꺼운 날개', desc: '보호막 25% → 40%', patch: { shieldPct: 0.4 } },
      { id: 'sylphy_frost', name: '서리 비늘가루', desc: '감속 40% → 60%, 3초 → 5초', patch: { slowPct: 0.6, slowDur: 5 } },
      { id: 'sylphy_pulse', name: '은빛 맥동', desc: '두 진격로 모두에 적용', patch: { bothLanes: true } },
    ],
    rozel: [
      { id: 'rozel_thorn', name: '가시 첨단', desc: '피해 450% → 600%', patch: { mult: 6 } },
      { id: 'rozel_chain', name: '연쇄 처형', desc: '처치 시 재사용 대기 -5초', patch: { killCdCut: 5 } },
      { id: 'rozel_thirst', name: '붉은 갈증', desc: '재사용 10초 → 8초', patch: { cooldown: 8 } },
    ],
    bella: [
      { id: 'bella_long', name: '긴 울림', desc: '기절 1.5초 → 2.5초', patch: { stunDur: 2.5 } },
      { id: 'bella_prayer', name: '철벽 기도', desc: '보호막 35% → 55%, 방어력 +50% → +80%', patch: { shieldPct: 0.55, defPct: 0.8 } },
      { id: 'bella_wave', name: '공명 파동', desc: '진격로 모든 적에게 공격력 300% 피해 추가', patch: { bonusLaneMult: 3 } },
    ],
    cheongryeon: [
      { id: 'cheong_storm', name: '연꽃 폭풍', desc: '스킬 150% → 210%, 선풍 진입 120% → 180%', patch: { mult: 2.1, entryMult: 1.8 } },
      { id: 'cheong_long', name: '긴 연계', desc: '연계 가능 8초 → 12초, 투입 아군 공격력 +50% → +80%', patch: { window: 12, tagAtkPct: 0.8 } },
      { id: 'cheong_step', name: '물결 걸음', desc: '재사용 11초 → 8초', patch: { cooldown: 8 } },
    ],
    serin: [
      { id: 'serin_deep', name: '심동', desc: '빙결 2초 → 3초', patch: { freezeDur: 3 } },
      { id: 'serin_shard', name: '빙편 난무', desc: '피해 160% → 230%', patch: { mult: 2.3 } },
      { id: 'serin_quick', name: '서리 발도', desc: '재사용 13초 → 10초', patch: { cooldown: 10 } },
    ],
    noa: [
      { id: 'noa_abyss', name: '심연', desc: '소멸 기준 체력 20% → 30%', patch: { executePct: 0.3 } },
      { id: 'noa_gravity', name: '중력 붕괴', desc: '피해 200% → 280%', patch: { mult: 2.8 } },
      { id: 'noa_echo', name: '공허의 메아리', desc: '처치 시 재사용 대기 -4초', patch: { killCdCut: 4 } },
    ],
    elysia: [
      { id: 'elysia_grace', name: '깊은 은총', desc: '초당 회복 4% → 6%', patch: { regenPct: 0.06 } },
      { id: 'elysia_long', name: '긴 축복', desc: '지속 6초 → 9초', patch: { regenDur: 9 } },
      { id: 'elysia_aegis', name: '깃털 방패', desc: '발동 시 전체에 최대 체력 15% 보호막(6초)', patch: { healShieldPct: 0.15, healShieldDur: 6 } },
    ],
    cecilia: [
      { id: 'cecilia_vigil', name: '철야 기도', desc: '지속 5초 → 8초', patch: { sancDur: 8 } },
      { id: 'cecilia_wrath', name: '신의 분노', desc: '신성 피해 100% → 260%', patch: { mult: 2.6 } },
      { id: 'cecilia_choir', name: '성가대', desc: '두 진격로 모두에 적용', patch: { bothLanes: true } },
    ],
    nero: [
      { id: 'nero_more', name: '보름달 사냥', desc: '초승달 5개 → 8개', patch: { hits: 8 } },
      { id: 'nero_sharp', name: '날 선 손톱', desc: '개당 피해 100% → 140%', patch: { mult: 1.4 } },
      { id: 'nero_nap', name: '고양이 낮잠', desc: '재사용 11초 → 8초', patch: { cooldown: 8 } },
    ],
  };
  MG.SKILL_MOD_INDEX = {};
  for (const [cid, list] of Object.entries(MG.SKILL_MODS)) for (const m of list) MG.SKILL_MOD_INDEX[m.id] = Object.assign({ charId: cid }, m);

  // Default party when none is chosen (tests, quick start): 3 on the field + 1 on the bench.
  MG.STARTING_PARTY = ['rozel', 'luna', 'bella', 'amore'];
})();
