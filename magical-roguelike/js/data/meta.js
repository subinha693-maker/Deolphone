// Permanent progression: 별빛 성소 upgrade tree, ascension levels, 월광 (moonlight) income.
// effect(level) returns the contribution to run.meta. Costs are per level.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.META_BRANCHES = { explore: '탐사', combat: '전투', reward: '보상', unlock: '해금' };

  const U = (id, branch, name, desc, max, costs, effect, extra) => Object.assign({ id, branch, name, desc, max, costs, effect }, extra || {});

  MG.META_TREE = [
    U('m_shards', 'explore', '별조각 주머니', '시작 별조각 +4/Lv', 3, [12, 24, 40], (l) => ({ startShards: 4 * l })),
    U('m_potion', 'explore', '비상 물약', '시작 물약 +1/Lv', 2, [15, 35], (l) => ({ startPotions: l })),
    U('m_life', 'explore', '강화 결계', '공유 생명 +1/Lv', 3, [20, 40, 70], (l) => ({ life: l })),
    U('m_rest', 'explore', '편안한 야영', '휴식 회복량 +5%p/Lv', 3, [15, 30, 50], (l) => ({ restBonus: 0.05 * l })),
    U('m_potion_pow', 'explore', '농축 물약', '물약 회복량 +5%p/Lv', 2, [18, 36], (l) => ({ potionBonus: 0.05 * l })),
    U('m_scout', 'explore', '정찰 숙련', '맵의 전투 노드 구성 상시 공개 (Lv1 적 종류, Lv2 진격로별)', 2, [30, 70], (l) => ({ scoutLevel: l })),
    U('m_atk', 'combat', '마력 단련', '전체 공격력 +2%/Lv', 5, [10, 15, 20, 30, 40], (l) => ({ atk: 0.02 * l })),
    U('m_def', 'combat', '결계 단련', '전체 방어력 +2%/Lv', 5, [10, 15, 20, 30, 40], (l) => ({ def: 0.02 * l })),
    U('m_hp', 'combat', '체력 단련', '최대 체력 +3%/Lv', 5, [10, 15, 20, 30, 40], (l) => ({ hp: 0.03 * l })),
    U('m_haste', 'combat', '영창 단축', '스킬 재사용 속도 +3%/Lv', 3, [25, 40, 60], (l) => ({ haste: 0.03 * l }), { requires: 'm_atk' }),
    U('m_swap', 'combat', '빠른 교대', '교대 대기 -0.5초/Lv', 2, [25, 45], (l) => ({ swapCdCut: 0.5 * l })),
    U('m_opening', 'combat', '선제 영창', '전투 시작 스킬 대기 진행 +10%p/Lv', 2, [20, 40], (l) => ({ opening: 0.1 * l }), { requires: 'm_haste' }),
    U('m_choice', 'reward', '넓은 안목', '유물 보상 선택지 +1', 1, [60], (l) => ({ choice: l })),
    U('m_reroll', 'reward', '운명 재조정', '보상 화면 새로고침 +1회/Lv (런당)', 2, [30, 60], (l) => ({ rerolls: l })),
    U('m_rare', 'reward', '행운의 별', '희귀 이상 등장 확률 +5%p/Lv', 3, [25, 40, 60], (l) => ({ rareBonus: 0.05 * l })),
    U('m_discount', 'reward', '단골 손님', '상점 가격 -8%/Lv', 3, [20, 35, 55], (l) => ({ discount: 0.08 * l })),
    U('m_start_relic', 'reward', '출발의 선물', '시작 시 일반 유물 3택1 (Lv2: 희귀 포함)', 2, [50, 100], (l) => ({ startRelic: l })),
    U('m_curse_ward', 'reward', '정화의 부적', '저주 유물 등장 확률 절반', 1, [40], (l) => ({ curseWard: l })),
    U('u_sylphy', 'unlock', '실피 해금', '은빛 나비의 마법소녀 실피가 파티 선택·영입 후보에 등장', 1, [30], () => ({}), { unlockChar: 'sylphy' }),
    U('u_cheongryeon', 'unlock', '청련 해금', '푸른 연꽃의 무도 마법소녀 청련이 파티 선택·영입 후보에 등장', 1, [45], () => ({}), { unlockChar: 'cheongryeon' }),
    U('u_epic', 'unlock', '전설 유물', '전설 등급 유물이 보상·상점에 등장', 1, [40], () => ({})),
    U('u_events', 'unlock', '깊은 이야기', '후반 연쇄·고위험 사건 해금', 1, [35], () => ({})),
    U('u_recruit', 'unlock', '넓은 인연', '영입 후보 +1 (2 → 3명)', 1, [50], () => ({ recruitCandidates: 1 })),
  ];
  MG.META_INDEX = {};
  for (const u of MG.META_TREE) MG.META_INDEX[u.id] = u;

  // Caps so permanent stats never outweigh relic builds
  MG.META_CAPS = { atk: 0.1, def: 0.1, hp: 0.15, haste: 0.09 };

  // Ascension (난이도 단계): effects are cumulative. Implemented in LaneManager / WaveManager / ShopSystem / GameManager.
  MG.ASCENSION = [
    { level: 0, name: '기본', desc: '표준 난이도' },
    { level: 1, name: '단계 1', desc: '적 체력 +10%' },
    { level: 2, name: '단계 2', desc: '강적 웨이브의 강적 +1' },
    { level: 3, name: '단계 3', desc: '시작 공유 생명 -2' },
    { level: 4, name: '단계 4', desc: '상점 가격 +20%' },
    { level: 5, name: '단계 5', desc: '보스 체력 +25%, 소환 주기 단축' },
  ];

  // Moonlight income at the end of a run (paid in full even on failure)
  MG.MOON_RULES = { perNode: 3, perBattle: 1, perElite: 5, clearBonus: 40, shardsDiv: 5, perCodex: 2, ascMult: 0.2 };
})();
