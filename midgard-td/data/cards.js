// =============================================================
//  강화 카드 (전투 중 page 2 상점)
//  - kind : 'supply'(시청 보급품) / 'capsule'(아노마리 캡슐)
//  - scope: 'all'(아군 전원) / 'single'(맵 위 캐릭터 한 명에게 드래그) / 'base'(기지)
//  - effects 에 쓸 수 있는 값
//      atkSpeed      공격 속도 +비율      (0.1 = +10%)
//      atkPct        공격력 +비율
//      hpPct         최대 체력 +/-비율    (-0.15 = -15%)
//      spCharge      스킬 게이지 충전 속도 +비율
//      healPerMedic  배치된 메딕 1명당 회복량 +비율
//      guardianBlock 가디언 저지 수 +N
//      costRegen     코스트 충전 속도 +비율
//      baseHp        기지 체력 +N (최대치 넘지 않음)
//  - weight: 상점에 뜨는 확률 가중치
// =============================================================
window.UPGRADE_CARDS = [
  { id: 'sup_aspd',   name: '공속 보급', kind: 'supply',  scope: 'all',    cost: 20, weight: 1,
    effects: { atkSpeed: 0.10 },             desc: '아군 전원 공격 속도 +10%' },
  { id: 'sup_hp',     name: '체력 보급', kind: 'supply',  scope: 'all',    cost: 15, weight: 1,
    effects: { hpPct: 0.05 },                desc: '아군 전원 최대 체력 +5%' },
  { id: 'sup_med',    name: '의료 지원', kind: 'supply',  scope: 'all',    cost: 15, weight: 1,
    effects: { healPerMedic: 0.05 },         desc: '배치된 메딕 1명당 회복량 +5%' },
  { id: 'sup_wall',   name: '방벽 보강', kind: 'supply',  scope: 'all',    cost: 25, weight: 1,
    effects: { guardianBlock: 1 },           desc: '가디언 저지 수 +1' },
  { id: 'sup_eff',    name: '보급 효율', kind: 'supply',  scope: 'all',    cost: 25, weight: 1,
    effects: { costRegen: 0.10 },            desc: '코스트 충전 속도 +10%' },
  { id: 'sup_repair', name: '긴급 복구', kind: 'supply',  scope: 'base',   cost: 30, weight: 1,
    effects: { baseHp: 1 },                  desc: '기지 체력 +1 (최대 10)' },
  { id: 'cap_awake',  name: '각성 캡슐', kind: 'capsule', scope: 'all',    cost: 12, weight: 1,
    effects: { atkSpeed: 0.20, hpPct: -0.05 }, desc: '아군 전원 공격 속도 +20%, 최대 체력 −5%' },
  { id: 'cap_rage',   name: '광폭 캡슐', kind: 'capsule', scope: 'single', cost: 8,  weight: 1,
    effects: { atkPct: 0.40, hpPct: -0.15 },   desc: '한 명 공격력 +40%, 최대 체력 −15%' },
  { id: 'cap_accel',  name: '가속 캡슐', kind: 'capsule', scope: 'single', cost: 8,  weight: 1,
    effects: { spCharge: 0.50, hpPct: -0.15 }, desc: '한 명 스킬 게이지 충전 +50%, 최대 체력 −15%' }
];

window.CARD_KINDS = {
  supply:  { name: '시청 보급품', color: '#d9b45a' },
  capsule: { name: '아노마리 캡슐', color: '#a46bff' }
};
