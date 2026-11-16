// =============================================================
//  캐릭터 데이터 (Lv1 기준)
//  - cls: guardian / knight / ranger / mystic / medic  (config.js 의 classes 참고)
//  - tile: 'ground'(지상 G칸) 또는 'high'(언덕 H칸)
//  - interval: 공격 간격(초), range: 반경 N칸, block: 저지 수(언덕 직군은 0)
//  - dmgType: 'physical'(물리) / 'magic'(마법) / 'heal'(회복)
//  - projectile: true 이면 투사체를 날림 (원거리)
//  - color: 투사체·스킬 빛 색
//  - face: 카드 초상화에서 얼굴 위치 (x, y 는 그림 폭/높이 대비 0~1, zoom 은 확대 배율)
//  - skill.type 종류
//      buff      : duration 동안 효과 (atkPct, targets, dmgTakenMult, blockAdd, regenPctPerSec)
//      multiHit  : radius 안 모든 적에게 mult 배 피해를 hits 번 (hitInterval 초 간격)
//      snipe     : 범위 안 체력이 가장 높은 적에게 mult 배, 주변 splashRadius 칸에 splashMult 배
//      nova      : radius 안 모든 적에게 mult 배 피해 + stun 초 기절
//      massHeal  : radius 안 모든 아군 최대 체력의 healPctMaxHp 만큼 회복
// =============================================================
window.CHARACTERS = [
  {
    id: 'ara', name: '아라', cls: 'guardian', tile: 'ground',
    hp: 1800, atk: 200, def: 400, res: 0, interval: 1.2, range: 1, block: 3,
    cost: 18, redeploy: 70, dmgType: 'physical', projectile: false,
    color: '#dfe6f2',
    face: { x: 0.43, y: 0.14, zoom: 3.2 },
    profile: '흰 옷의 방패잡이. 말수는 적지만 동료 앞을 결코 비우지 않는다.',
    skill: {
      name: '경당의 방벽', sp: 30, type: 'buff', duration: 10,
      dmgTakenMult: 0.5, blockAdd: 1, regenPctPerSec: 0.02,
      desc: '10초간 받는 피해 −50%, 저지 수 +1, 매초 최대 체력 2% 회복'
    }
  },
  {
    id: 'vivian', name: '비비안', cls: 'knight', tile: 'ground',
    hp: 1300, atk: 420, def: 220, res: 0, interval: 1.3, range: 2, block: 2,
    cost: 14, redeploy: 70, dmgType: 'physical', projectile: false,
    color: '#ff5a4f',
    face: { x: 0.535, y: 0.155, zoom: 3.2 },
    profile: '붉은 창을 든 여우 엽사. 냉정하고 정확하게 급소를 찌른다.',
    skill: {
      name: '붉은 관통창', sp: 25, type: 'buff', duration: 8,
      atkPct: 0.6, targets: 3,
      desc: '8초간 공격력 +60%, 공격이 범위 안 적 최대 3명을 동시에 찌름'
    }
  },
  {
    id: 'riri', name: '리리', cls: 'knight', tile: 'ground',
    hp: 900, atk: 260, def: 150, res: 0, interval: 0.6, range: 1, block: 1,
    cost: 10, redeploy: 50, dmgType: 'physical', projectile: false,
    color: '#9fe07a',
    face: { x: 0.46, y: 0.13, zoom: 3.2 },
    profile: '쌍검을 쓰는 다람쥐 소녀. 작지만 누구보다 빠르다.',
    skill: {
      name: '회전 쌍검', sp: 20, type: 'multiHit',
      radius: 1, mult: 1.2, hits: 5, hitInterval: 0.2,
      desc: '즉시 반경 1칸 안 모든 적에게 공격력 120% 피해를 5번 연속'
    }
  },
  {
    id: 'amelie', name: '아멜리', cls: 'ranger', tile: 'high',
    hp: 700, atk: 380, def: 80, res: 0, interval: 1.0, range: 4, block: 0,
    cost: 12, redeploy: 70, dmgType: 'physical', projectile: true, flyingPriority: true,
    color: '#2fe0c0',
    face: { x: 0.50, y: 0.115, zoom: 3.2 },
    profile: '깃털 장식의 사수. 결정으로 만든 탄환을 쓰는 이상구 소총을 다룬다.',
    skill: {
      name: '결정 탄환', sp: 30, type: 'snipe',
      mult: 5, splashRadius: 1, splashMult: 1.5,
      desc: '즉시 범위 안 가장 체력이 높은 적에게 공격력 500% 물리 피해, 맞은 곳 주변 1칸에 150% 피해'
    }
  },
  {
    id: 'sheba', name: '셰바', cls: 'mystic', tile: 'high',
    hp: 700, atk: 500, def: 60, res: 15, interval: 1.8, range: 3, block: 0,
    cost: 18, redeploy: 70, dmgType: 'magic', projectile: true, splash: 1,
    color: '#b07bff',
    face: { x: 0.47, y: 0.115, zoom: 3.2 },
    profile: '뿔 달린 미스틱. 아노마리 캡슐로 보랏빛 결정을 다룬다.',
    skill: {
      name: '보랏빛 결정창', sp: 35, type: 'nova',
      radius: 3, mult: 3, stun: 2, dmgType: 'magic',
      desc: '즉시 반경 3칸 안 모든 적에게 공격력 300% 마법 피해 + 2초 기절'
    }
  },
  {
    id: 'hana', name: '하나', cls: 'medic', tile: 'high',
    hp: 750, atk: 300, def: 70, res: 10, interval: 2.0, range: 3, block: 0,
    cost: 15, redeploy: 70, dmgType: 'heal', projectile: true,
    color: '#7dffa0',
    face: { x: 0.57, y: 0.175, zoom: 3.2 },
    profile: '토끼 귀의 수녀 메딕. 지팡이의 녹색 빛으로 동료를 치료한다.',
    skill: {
      name: '어버이의 은총', sp: 30, type: 'massHeal',
      radius: 3, healPctMaxHp: 0.3,
      desc: '즉시 반경 3칸 안 모든 아군 체력을 최대 체력의 30% 회복'
    }
  }
];
