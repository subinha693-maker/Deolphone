/*
 * 직업 수치 데이터 — ※ 임시 값 (전투 시스템 확정 전)
 * ------------------------------------------------------------
 * 전투 시스템이 정해지면 여기 숫자만 고치면 된다.
 *
 * STATS:      직업별 초기 능력치 (선택 즉시 플레이어에 복사됨)
 *   hp 체력 / mp 마나 / atk 물리 공격 / mag 마법 공격 / def 방어 / spd 속도
 * ABILITIES:  능력 정의 (각성 시 직업의 initialAbilities 가 플레이어에 등록됨)
 *   type: heal | attack | control | buff
 *   target: self | ally | allAllies | enemy | allEnemies
 *   cost: 마나 소모 / power: 위력 계수 / cooldown: 재사용 대기(턴)
 *   effects: 부가 효과 목록 (형식은 전투 시스템에서 확정)
 */
window.WS = window.WS || {};

WS.BALANCE = {
  STATS: {
    morganite:  { hp: 110, mp: 70,  atk: 6,  mag: 12, def: 10, spd: 8 },
    aquamarine: { hp: 120, mp: 60,  atk: 7,  mag: 10, def: 14, spd: 7 },
    amethyst:   { hp: 80,  mp: 95,  atk: 4,  mag: 18, def: 6,  spd: 9 },
    ruby:       { hp: 100, mp: 40,  atk: 17, mag: 6,  def: 8,  spd: 12 },
    heliodor:   { hp: 95,  mp: 75,  atk: 8,  mag: 11, def: 9,  spd: 14 },
  },

  ABILITIES: {
    heart_bloom: {
      name: '하트 블룸',
      desc: '분홍빛 꽃잎을 피워 아군 전체의 체력을 회복하고 짧은 보호막을 씌운다.',
      type: 'heal', target: 'allAllies', cost: 18, power: 1.2, cooldown: 2,
      effects: [{ kind: 'shield', amount: 0.15, turns: 2 }],
    },
    tide_veil: {
      name: '타이드 베일',
      desc: '나비 떼가 물결처럼 퍼져 적 전체를 둔화시키고, 일정 확률로 얼린다.',
      type: 'control', target: 'allEnemies', cost: 16, power: 0.6, cooldown: 2,
      effects: [{ kind: 'slow', amount: 0.3, turns: 2 }, { kind: 'freeze', chance: 0.25, turns: 1 }],
    },
    crescent_fall: {
      name: '크레센트 폴',
      desc: '초승달 모양의 빛을 떨어뜨려 적 전체에 큰 마법 피해를 준다.',
      type: 'attack', target: 'allEnemies', cost: 28, power: 1.6, cooldown: 1,
      effects: [],
    },
    thorn_waltz: {
      name: '쏜 왈츠',
      desc: '가시 장미의 춤. 적 하나를 세 번 연속으로 베고, 준 피해의 일부를 흡수한다.',
      type: 'attack', target: 'enemy', cost: 12, power: 0.75, cooldown: 1,
      effects: [{ kind: 'multiHit', hits: 3 }, { kind: 'drain', ratio: 0.2 }],
    },
    golden_chime: {
      name: '골든 차임',
      desc: '황금 종을 울려 아군의 속도와 공격력을 올리고, 적의 다음 행동을 늦춘다.',
      type: 'buff', target: 'allAllies', cost: 15, power: 0, cooldown: 3,
      effects: [{ kind: 'haste', amount: 0.25, turns: 2 }, { kind: 'atkUp', amount: 0.15, turns: 2 }, { kind: 'delayEnemy', amount: 1 }],
    },
  },
};

/** 능력치 이름 (UI 표시용) */
WS.STAT_LABELS = { hp: '체력', mp: '마나', atk: '공격', mag: '마력', def: '방어', spd: '속도' };
WS.STAT_MAX = 20; // 막대 그래프 기준 (hp/mp 는 /6 해서 표시)
