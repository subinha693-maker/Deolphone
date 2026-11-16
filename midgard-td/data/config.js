// =============================================================
//  게임 전체 규칙 설정 (숫자만 바꾸면 게임에 바로 반영됩니다)
// =============================================================
window.GAME_CONFIG = {
  title: '미드가르드 엽사단',
  subtitle: '몰락한 엽사 조직의 재건',

  // 코스트
  cost: {
    start: 10,       // 전투 시작 코스트
    perSecond: 1,    // 1초에 차는 양
    max: 99          // 최대치
  },

  baseHp: 10,                 // 기지 체력
  skillChargePerSecond: 1,    // 스킬 게이지 1초 충전량
  retreatRefund: 0.5,         // 퇴각 시 돌려받는 코스트 비율

  // 웨이브
  firstWaveDelay: 8,          // 전투 시작 후 첫 웨이브까지 (초)
  waveRest: 5,                // 웨이브 사이 휴식 (초)
  spawnInterval: 1.5,         // 같은 웨이브 안 적 출현 간격 (초)

  // 강화 카드 상점
  shopSize: 3,
  rerollBaseCost: 3,          // 카드 뽑기 첫 비용
  rerollStep: 1,              // 뽑을 때마다 늘어나는 비용
  capsuleMinHpRatio: 0.2,     // 캡슐로 깎여도 이 비율(기본 최대 체력의 20%) 아래로는 안 내려감

  // 별 평가: 기지 체력 손실이 maxLoss 이하이면 stars
  starRules: [
    { maxLoss: 0, stars: 3 },
    { maxLoss: 3, stars: 2 },
    { maxLoss: 9999, stars: 1 }
  ],
  rewardMult: { 1: 0.6, 2: 0.8, 3: 1.0 },

  // 성장
  expPerLevel: 100,    // 필요 경험치 = 현재 레벨 × 이 값
  statGrowth: 0.04,    // 레벨당 HP·공격·방어가 Lv1 수치의 4%씩 증가

  // 엽사 등급 (레벨 상한). 승급 심사는 다음 단계에서 사용
  ranks: [
    { id: 'ja',    name: '자', cap: 10 },
    { id: 'cheong',name: '청', cap: 20 },
    { id: 'nok',   name: '녹', cap: 30 },
    { id: 'hwang', name: '황', cap: 40 },
    { id: 'jeok',  name: '적', cap: 50 },
    { id: 'baek',  name: '백', cap: 60 },
    { id: 'heuk',  name: '흑', cap: 70 }
  ],

  // 지휘관 스킬 (판마다 각 1회)
  commanderSkills: [
    { id: 'muster', name: '긴급 소집',      desc: '즉시 코스트 +10',                  type: 'cost',        value: 10 },
    { id: 'roar',   name: '옛 리더의 호령', desc: '배치된 아군 전원 스킬 게이지 50% 충전', type: 'skillCharge', value: 0.5 }
  ],

  // 직군
  classes: {
    guardian: { name: '가디언', color: '#8fa6c9', tile: 'ground', desc: '적을 많이 막는 탱커' },
    knight:   { name: '나이트', color: '#d0584f', tile: 'ground', desc: '막으면서 싸우는 근접 딜러' },
    ranger:   { name: '레인저', color: '#2fbfa8', tile: 'high',   desc: '단일 원거리 딜러' },
    mystic:   { name: '미스틱', color: '#9b6bff', tile: 'high',   desc: '캡슐로 이상체 능력을 쓰는 범위 마법 딜러' },
    medic:    { name: '메딕',   color: '#5fcf73', tile: 'high',   desc: '회복' }
  }
};
