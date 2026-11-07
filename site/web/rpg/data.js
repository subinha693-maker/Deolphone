/*
 * RPG 데이터 — 흰 공간 다음 이야기 (필드 · 전투 · 성장 · 아이템 · 날짜)
 * ------------------------------------------------------------
 * 흰 공간 프롤로그의 데이터(WS.BALANCE · WS.JOBS · WS.ITEMS)를 그대로 이어서 쓴다.
 *  - 능력치 키: hp 체력 / mp 마나 / atk 공격 / mag 마력 / def 방어 / spd 속도 (WS.STAT_LABELS)
 *  - 직업 초기 능력치: WS.BALANCE.STATS (= 변신 상태의 Lv1 수치)
 *  - 능력: WS.BALANCE.ABILITIES 형식 그대로 확장 (아래 RPG_ABILITIES 를 합친다)
 *  - 아이템: WS.ITEMS 에 합쳐서 run.inventory 하나로 관리 (손수건도 그대로 소지품에 남는다)
 * 아이콘 번호 = Raven Fantasy Icons 32x32 시트의 (행*16 + 열)
 */
window.WS = window.WS || {};
WS.RPG = WS.RPG || {};
(function () {
const R = WS.RPG;

R.ASSET_BASE = 'rpg/assets/';

// ---------- 오토타일 (Fan-tasy Tileset 47타일 레이아웃) ----------
// 비트: N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128 → 레이아웃 셀 번호(col + row*6)
R.BLOB = {"16":0,"28":1,"124":2,"112":3,"92":4,"113":5,"17":6,"31":7,"255":8,"241":9,"23":10,"197":11,"1":12,"7":13,"199":14,"193":15,"29":16,"116":17,"0":18,"4":19,"68":20,"64":21,"71":22,"209":23,"247":24,"223":25,"20":26,"80":27,"125":28,"245":29,"253":30,"127":31,"5":32,"65":33,"95":34,"215":35,"93":36,"117":37,"69":38,"21":39,"119":40,"221":41,"87":42,"213":43,"81":44,"84":45,"85":46};

// ---------- 성장 ----------
R.MAX_LEVEL = 60;
R.POINTS_PER_LEVEL = 3;
R.expToNext = lv => Math.round(18 * Math.pow(lv, 1.65) + 6 * lv);
// 레벨당 직업 기본 능력치에 곱해지는 성장률
R.GROWTH = { hp: 0.14, mp: 0.10, atk: 0.16, mag: 0.16, def: 0.15, spd: 0.11 };   // spd 0.06 → 0.11 (능력치 상향 1부: Lv60 에서 기본 속도의 약 7.5배)
// 능력치 포인트 1점의 효과
// 능력치 상향(1부): 옛 값 hp 8 · mp 5 · atk/mag/def 2 · spd 1
R.POINT_VALUE = { hp: 36, mp: 22, atk: 16, mag: 16, def: 12, spd: 1 };   // ※ 임시 (공격 · 마력은 제안 12 → 시뮬레이션으로 16)
// 능력치 단위 — 1부에서 체력 · 마나 ×4.5, 공격 · 마력 ×8, 방어 ×6 으로 올렸다. (제안은 공격 계열 ×6 이었으나 시뮬레이션으로 조정 — 보고서 참고)
// 고정 수치(회복량 · 아이템 피해 · 보석)를 새로 정할 때 이 배율을 쓴다.
R.STAT_SCALE = { hp: 4.5, mp: 4.5, atk: 8, mag: 8, def: 6, spd: 1 };   // ※ 임시
// 레벨당 보정 (core.js R.stats): 옛 값 공격 · 마력 +0.8 (×8), 방어 +0.6 (×6)
R.LEVEL_BONUS = { atk: 6.4, mag: 6.4, def: 3.6 };
// 직업 기본 능력치 (흰 공간 원본 WS.BALANCE.STATS 를 여기서 덮어쓴다) — 옛 값 × (체력 · 마나 4.5 / 공격 · 마력 8 / 방어 6), 속도는 그대로
//   morganite  hp 110 mp 70 atk 6 mag 12 def 10 spd 8   aquamarine hp 120 mp 60 atk 7 mag 10 def 14 spd 7
//   amethyst   hp 80  mp 95 atk 4 mag 18 def 6  spd 9   ruby       hp 100 mp 40 atk 17 mag 6 def 8  spd 12
//   heliodor   hp 95  mp 75 atk 8 mag 11 def 9  spd 14
R.BASE_STATS = {
  morganite:  { hp: 495, mp: 315, atk: 48,  mag: 96,   def: 60, spd: 8 },
  aquamarine: { hp: 540, mp: 270, atk: 56,  mag: 80,   def: 84, spd: 7 },
  amethyst:   { hp: 360, mp: 428, atk: 32,  mag: 144, def: 36, spd: 9 },
  ruby:       { hp: 450, mp: 180, atk: 136, mag: 48,  def: 48, spd: 12 },
  heliodor:   { hp: 428, mp: 338, atk: 64,  mag: 88,   def: 54, spd: 14 },
};
R.STAT_DESC = {
  hp: '최대 체력', mp: '최대 마나', atk: '물리 공격 (일반 공격 · 물리 능력)',
  mag: '마법 공격 (마법 능력 · 회복량)', def: '받는 피해 감소', spd: '행동 순서 · 회피',
};

// ---------- 변신 게이지 ----------
// 전투 = 변신. 게이지가 0 이면 변신하지 못한다: 능력 봉인, 능력치가 극도로 약해져 마물의 공격 한 번에 쓰러진다.
// 0 이 된 게이지는 잠을 자서 하루를 넘겨야만 다시 찬다. 하루는 오직 이때만 지나간다.
R.GAUGE = {
  max: 100,
  battleCost: 5,      // 일반 전투 1회 (변신해서 싸울 때)
  bossCost: 10,       // 보스 전투
  defeatCost: 25,     // 마물에게 패배하면 추가로 소모
  releaseCost: 12,    // 변신 기술 [해방]
  humanMul: 0.1,      // 변신하지 못했을 때 공격 · 마력 · 방어 · 속도 배율 (+ 전투에서 한 번만 맞아도 쓰러짐)
};

// ---------- 날짜 ----------
// 시계는 없다. 하루는 변신 게이지가 바닥나 잠들 때만 지나간다.
R.TIME = {
  dayStart: 6 * 60,   // (표시용 기상 시각)
  lastDay: 30,        // 30일째에 잠들면 세계 멸망
};

// ---------- 직업별 능력 (WS.BALANCE.ABILITIES 형식) ----------
// dmg: 'phys' 공격 기준 / 'mag' 마력 기준 (없으면 직업 성향으로 판단)
// el: 속성 (fire · ice · thunder) — 마물 약점이면 1.5배
// 추가 효과(effects.kind): shield · slow · freeze · multiHit · drain · haste · atkUp · delayEnemy · defUp · cleanse · healPct
R.ABILITIES = {
  // 핑크 모르가나이트 (회복 · 수호)
  pink_arrow:    { name: '핑크 애로', desc: '분홍빛 화살로 적 하나를 꿰뚫는다.', type: 'attack', dmg: 'mag', target: 'enemy', cost: 27, power: 1.35, cooldown: 0, effects: [] },
  rose_barrier:  { name: '로즈 배리어', desc: '장미 결계로 3턴 동안 방어력을 크게 올린다.', type: 'buff', target: 'self', cost: 45, power: 0, cooldown: 3, effects: [{ kind: 'defUp', amount: 0.5, turns: 3 }] },
  blossom_storm: { name: '블라썸 스톰', desc: '꽃잎 폭풍으로 적 전체를 공격한다.', type: 'attack', dmg: 'mag', target: 'allEnemies', cost: 72, power: 1.15, cooldown: 1, effects: [] },
  mercy_light:   { name: '머시 라이트', desc: '체력을 크게 회복하고 상태 이상을 씻어 낸다.', type: 'heal', target: 'self', cost: 99, power: 2.4, cooldown: 2, effects: [{ kind: 'cleanse' }, { kind: 'shield', amount: 0.2, turns: 2 }] },
  eternal_bloom: { name: '이터널 블룸', desc: '영원히 지지 않는 꽃. 적 전체를 공격하고 체력을 회복한다.', type: 'attack', dmg: 'mag', target: 'allEnemies', cost: 180, power: 2.0, cooldown: 2, effects: [{ kind: 'healPct', amount: 0.25 }] },
  // 아쿠아 마린 (제어 · 방어)
  aqua_lance:    { name: '아쿠아 랜스', desc: '물의 창. 적 하나에게 냉기 피해.', type: 'attack', dmg: 'mag', el: 'ice', target: 'enemy', cost: 27, power: 1.4, cooldown: 0, effects: [] },
  bubble_guard:  { name: '버블 가드', desc: '물방울 보호막을 두른다.', type: 'buff', target: 'self', cost: 45, power: 0, cooldown: 3, effects: [{ kind: 'shield', amount: 0.3, turns: 3 }] },
  frost_bind:    { name: '프로스트 바인드', desc: '적 하나를 높은 확률로 얼린다.', type: 'control', dmg: 'mag', el: 'ice', target: 'enemy', cost: 63, power: 1.2, cooldown: 2, effects: [{ kind: 'freeze', chance: 0.65, turns: 1 }] },
  tidal_wave:    { name: '타이달 웨이브', desc: '해일로 적 전체를 공격하고 둔화시킨다.', type: 'attack', dmg: 'mag', el: 'ice', target: 'allEnemies', cost: 108, power: 1.6, cooldown: 1, effects: [{ kind: 'slow', amount: 0.3, turns: 2 }] },
  abyss_prison:  { name: '어비스 프리즌', desc: '심연의 감옥. 적 전체에 큰 피해와 빙결.', type: 'attack', dmg: 'mag', el: 'ice', target: 'allEnemies', cost: 189, power: 2.1, cooldown: 2, effects: [{ kind: 'freeze', chance: 0.35, turns: 1 }] },
  // 퍼플 애머시스트 (광역 마법)
  star_shot:     { name: '스타 샷', desc: '별빛 탄환. 적 하나에게 마법 피해.', type: 'attack', dmg: 'mag', el: 'thunder', target: 'enemy', cost: 27, power: 1.5, cooldown: 0, effects: [] },
  mana_flow:     { name: '마나 플로우', desc: '3턴 동안 공격 · 마력이 오른다.', type: 'buff', target: 'self', cost: 45, power: 0, cooldown: 3, effects: [{ kind: 'atkUp', amount: 0.35, turns: 3 }] },
  meteor:        { name: '미티어', desc: '별똥별을 떨어뜨려 적 하나에게 큰 피해.', type: 'attack', dmg: 'mag', target: 'enemy', cost: 90, power: 2.5, cooldown: 1, effects: [] },
  moon_gate:     { name: '문 게이트', desc: '달의 문을 열어 적 전체를 공격한다.', type: 'attack', dmg: 'mag', el: 'thunder', target: 'allEnemies', cost: 162, power: 2.1, cooldown: 1, effects: [] },
  galaxy_end:    { name: '갤럭시 엔드', desc: '은하의 끝. 적 전체에 궁극의 마법 피해.', type: 'attack', dmg: 'mag', target: 'allEnemies', cost: 261, power: 3.0, cooldown: 3, effects: [] },
  // 로즈 루비 (근접 연속 공격)
  rose_slash:    { name: '로즈 슬래시', desc: '장미 칼날로 적 하나를 벤다.', type: 'attack', dmg: 'phys', el: 'fire', target: 'enemy', cost: 22, power: 1.6, cooldown: 0, effects: [] },
  blood_rose:    { name: '블러드 로즈', desc: '3턴 동안 공격력이 크게 오른다.', type: 'buff', target: 'self', cost: 45, power: 0, cooldown: 3, effects: [{ kind: 'atkUp', amount: 0.45, turns: 3 }] },
  petal_dance:   { name: '페탈 댄스', desc: '꽃잎처럼 춤추며 적 전체를 벤다.', type: 'attack', dmg: 'phys', target: 'allEnemies', cost: 63, power: 1.1, cooldown: 1, effects: [] },
  crimson_drive: { name: '크림슨 드라이브', desc: '적 하나를 네 번 베고 피해 일부를 흡수한다.', type: 'attack', dmg: 'phys', el: 'fire', target: 'enemy', cost: 90, power: 0.75, cooldown: 1, effects: [{ kind: 'multiHit', hits: 4 }, { kind: 'drain', ratio: 0.3 }] },
  scarlet_finale:{ name: '스칼렛 피날레', desc: '모든 것을 건 일격. 적 하나에게 막대한 피해.', type: 'attack', dmg: 'phys', el: 'fire', target: 'enemy', cost: 153, power: 3.4, cooldown: 2, effects: [] },
  // 옐로 헬리오도르 (강화 · 교란)
  sun_ray:       { name: '선 레이', desc: '햇살 광선. 적 하나에게 번개 피해.', type: 'attack', dmg: 'mag', el: 'thunder', target: 'enemy', cost: 27, power: 1.4, cooldown: 0, effects: [] },
  bell_toll:     { name: '벨 톨', desc: '종소리로 적 전체를 때리고 행동을 늦춘다.', type: 'attack', dmg: 'mag', target: 'allEnemies', cost: 63, power: 1.0, cooldown: 2, effects: [{ kind: 'delayEnemy', amount: 1 }] },
  golden_heal:   { name: '골든 힐', desc: '체력을 회복하고 속도를 올린다.', type: 'heal', target: 'self', cost: 63, power: 1.8, cooldown: 2, effects: [{ kind: 'haste', amount: 0.3, turns: 3 }] },
  solar_flare:   { name: '솔라 플레어', desc: '태양 폭발. 적 전체에 큰 번개 피해.', type: 'attack', dmg: 'mag', el: 'thunder', target: 'allEnemies', cost: 135, power: 1.9, cooldown: 1, effects: [] },
  time_stop:     { name: '타임 스톱', desc: '시간을 멈춘다. 적 전체가 2턴 동안 행동하지 못하고 공격력이 오른다.', type: 'buff', target: 'self', cost: 202, power: 0, cooldown: 4, effects: [{ kind: 'delayEnemy', amount: 2 }, { kind: 'atkUp', amount: 0.3, turns: 3 }] },
};
// 레벨에 따라 배우는 능력 (Lv1 은 흰 공간에서 각성할 때 받은 능력)
R.LEARN = {
  morganite:  [[4, 'pink_arrow'], [8, 'rose_barrier'], [12, 'blossom_storm'], [17, 'mercy_light'], [23, 'eternal_bloom']],
  aquamarine: [[4, 'aqua_lance'], [8, 'bubble_guard'], [12, 'frost_bind'], [17, 'tidal_wave'], [23, 'abyss_prison']],
  amethyst:   [[4, 'star_shot'], [8, 'mana_flow'], [12, 'meteor'], [17, 'moon_gate'], [23, 'galaxy_end']],
  ruby:       [[4, 'rose_slash'], [8, 'blood_rose'], [12, 'petal_dance'], [17, 'crimson_drive'], [23, 'scarlet_finale']],
  heliodor:   [[4, 'sun_ray'], [8, 'bell_toll'], [12, 'golden_heal'], [17, 'solar_flare'], [23, 'time_stop']],
};
// 흰 공간에서 받은 첫 능력의 피해 기준 · 속성 (기존 데이터는 그대로 두고 전투용 값만 보탠다)
R.BASE_ABILITY_PATCH = {
  heart_bloom: {}, tide_veil: { dmg: 'mag', el: 'ice' }, crescent_fall: { dmg: 'mag' },
  thorn_waltz: { dmg: 'phys', el: 'fire' }, golden_chime: {},
};
// 변신 기술 [해방] — 직업별 이름
R.RELEASE = {
  morganite: '하트 오브 핑크', aquamarine: '마린 블루 엔드', amethyst: '퍼플 이클립스',
  ruby: '로즈 블러드 레퀴엠', heliodor: '선라이즈 차임',
};

// ---------- 아이템 ----------
// kind: use(소모품) / wand(마법봉) / acc(악세사리, 최대 5개) / relic(유물, 1개) / mat(재료)
R.ITEMS = {
  // 소모품
  potion_s: { n: '작은 회복약', kind: 'use', cat: 'heal', icon: 275, price: 20, hp: 225, d: '체력 225 회복' },
  potion_m: { n: '회복약', kind: 'use', cat: 'heal', icon: 279, price: 60, hp: 675, d: '체력 675 회복' },
  potion_l: { n: '고급 회복약', kind: 'use', cat: 'heal', icon: 284, price: 180, hp: 1890, d: '체력 1890 회복' },
  ether:    { n: '마나 물약', kind: 'use', cat: 'heal', icon: 122, price: 50, mp: 135, d: '마나 135 회복' },
  ether_l:  { n: '고급 마나 물약', kind: 'use', cat: 'heal', icon: 121, price: 160, mp: 450, d: '마나 450 회복' },
  antidote: { n: '해독초', kind: 'use', cat: 'heal', icon: 240, price: 15, cure: true, d: '독을 치료한다' },
  bread:    { n: '들바람 빵', kind: 'use', cat: 'heal', icon: 512, price: 12, hp: 135, mp: 36, d: '체력 135, 마나 36 회복' },
  meat:     { n: '부두 꼬치구이', kind: 'use', cat: 'heal', icon: 485, price: 40, hp: 450, d: '체력 450 회복' },
  elixir:   { n: '엘릭서', kind: 'use', cat: 'heal', icon: 271, price: 1500, hp: 99999, mp: 99999, cure: true, d: '체력 · 마나 완전 회복' },
  moon:     { n: '달빛 정수', kind: 'use', cat: 'heal', icon: 668, price: 0, gauge: 20, d: '변신 게이지 20 회복. 게이지가 0이면 쓸 수 없다 (잠을 자야 한다)' },
  bomb:     { n: '화염 폭탄', kind: 'use', cat: 'battle', icon: 777, price: 80, battleOnly: true, dmg: 640, el: 'fire', d: '[전투] 적 하나에게 화염 피해 640' },
  bomb2:    { n: '빙결 폭탄', kind: 'use', cat: 'battle', icon: 783, price: 220, battleOnly: true, dmg: 1840, el: 'ice', d: '[전투] 적 하나에게 냉기 피해 1840' },
  smoke:    { n: '연막탄', kind: 'use', cat: 'battle', icon: 1064, price: 40, battleOnly: true, escape: true, d: '[전투] 반드시 도망친다 (보스 제외)' },
  // ===== 2부: 새 소비 아이템 26종 (effects 로 효과를 적는다 — core.js R.ITEM_FX) =====
  // 고정 수치(회복량 · 고정 피해 · 보석 증가량)는 1부의 새 능력치 단위. 퍼센트 · 가격은 그대로.
  //   cat: heal(회복 · 정화) / battle(전투용) / gem(영혼의 보석) / field(탐험)
  honey_potion: { n: '벌꿀약', kind: 'use', cat: 'heal', icon: 66, price: 50, effects: [{ type: 'cure', pick: 'random' }], d: '달콤한 약. 몸을 괴롭히는 것 하나를 골라 없앤다.' },
  herb_tea:     { n: '정화의 허브차', kind: 'use', cat: 'heal', icon: 497, price: 150, effects: [{ type: 'cure', pick: 'all' }], d: '향긋한 차. 몸을 괴롭히는 것을 모두 씻어 낸다.' },
  wake_bell:    { n: '각성의 방울', kind: 'use', cat: 'heal', icon: 69, price: 30, effects: [{ type: 'cure', list: ['sleep'] }], d: '맑은 방울 소리가 잠을 깨운다.' },
  cool_salve:   { n: '냉각 연고', kind: 'use', cat: 'heal', icon: 120, price: 40, effects: [{ type: 'cure', list: ['burn'], optional: true }, { type: 'heal', hp: 180 }], d: '시원한 연고. 열기를 식히고 상처를 달랜다.' },
  warm_soup:    { n: '따뜻한 수프', kind: 'use', cat: 'heal', icon: 562, price: 70, effects: [{ type: 'heal', hp: 540 }, { type: 'buff', buff: 'defUp', amount: 0.2, turns: 3, battle: true }], d: '속을 든든하게 하는 수프.' },
  fight_tea:    { n: '투지의 홍차', kind: 'use', cat: 'battle', icon: 498, price: 90, battleOnly: true, effects: [{ type: 'buff', buff: 'atkUp', amount: 0.2, turns: 3 }], d: '마시면 싸울 마음이 솟는다.' },
  iron_biscuit: { n: '강철 비스킷', kind: 'use', cat: 'battle', icon: 517, price: 90, battleOnly: true, effects: [{ type: 'buff', buff: 'defUp', amount: 0.25, turns: 3 }], d: '이가 아플 만큼 단단한 비스킷.' },
  swift_tea:    { n: '민첩의 허브차', kind: 'use', cat: 'battle', icon: 496, price: 90, battleOnly: true, effects: [{ type: 'buff', buff: 'haste', amount: 0.3, turns: 3 }], d: '몸이 가벼워지는 차.' },
  guard_bubble: { n: '수호의 거품병', kind: 'use', cat: 'battle', icon: 266, price: 120, battleOnly: true, effects: [{ type: 'buff', buff: 'shield', amount: 0.2, turns: 3 }], d: '터뜨리면 거품이 몸을 감싼다.' },
  fire_candy:   { n: '불꽃 사탕', kind: 'use', cat: 'battle', icon: 384, price: 110, battleOnly: true, effects: [{ type: 'weaponEl', el: 'fire' }], d: '입안에서 불꽃이 톡톡 튄다.' },
  ice_candy:    { n: '얼음 사탕', kind: 'use', cat: 'battle', icon: 398, price: 110, battleOnly: true, effects: [{ type: 'weaponEl', el: 'ice' }], d: '차가운 기운이 오래 남는다.' },
  spark_candy:  { n: '번개 사탕', kind: 'use', cat: 'battle', icon: 168, price: 110, battleOnly: true, effects: [{ type: 'weaponEl', el: 'thunder' }], d: '혀끝이 찌릿하다.' },
  bomb_thunder: { n: '번개 폭탄', kind: 'use', cat: 'battle', icon: 1024, price: 160, battleOnly: true, target: 'enemy', effects: [{ type: 'damage', dmg: 1200, el: 'thunder' }], d: '터지면 번개가 내리친다.' },
  bomb_sleep:   { n: '수면제 폭탄', kind: 'use', cat: 'battle', icon: 1101, price: 180, battleOnly: true, target: 'enemy', effects: [{ type: 'inflict', status: 'sleep', chance: 0.85 }], d: '터지면 졸음이 쏟아지는 가루가 퍼진다.' },
  bomb_sticky:  { n: '끈끈이 폭탄', kind: 'use', cat: 'battle', icon: 807, price: 200, battleOnly: true, effects: [{ type: 'inflict', status: 'slow', chance: 1, turns: 3, all: true }], d: '끈적한 것이 발밑에 달라붙는다.' },
  bomb_ember:   { n: '불씨 폭탄', kind: 'use', cat: 'battle', icon: 992, price: 130, battleOnly: true, target: 'enemy', effects: [{ type: 'damage', dmg: 480, el: 'fire' }, { type: 'inflict', status: 'burn', chance: 0.8 }], d: '작은 불씨가 오래 타오른다.' },
  bomb_hush:    { n: '소음 폭탄', kind: 'use', cat: 'battle', icon: 945, price: 170, battleOnly: true, target: 'enemy', effects: [{ type: 'inflict', status: 'silence', chance: 0.85, turns: 3 }], d: '귀를 먹먹하게 하는 큰 소리가 난다.' },
  powder_weak:  { n: '약화 가루', kind: 'use', cat: 'battle', icon: 880, price: 150, battleOnly: true, target: 'enemy', effects: [{ type: 'inflict', status: 'weak', chance: 0.85, turns: 3 }], d: '힘이 빠지는 가루.' },
  gem_valor:    { n: '용맹한 영혼의 보석', kind: 'use', cat: 'gem', icon: 162, price: 2000, effects: [{ type: 'permStat', stat: 'atk', amount: 48 }], d: '사용하면 공격력이 오른다.' },
  gem_wisdom:   { n: '지혜로운 영혼의 보석', kind: 'use', cat: 'gem', icon: 165, price: 2000, effects: [{ type: 'permStat', stat: 'mag', amount: 48 }], d: '사용하면 마력이 오른다.' },
  gem_resolve:  { n: '굳건한 영혼의 보석', kind: 'use', cat: 'gem', icon: 167, price: 2000, effects: [{ type: 'permStat', stat: 'def', amount: 36 }], d: '사용하면 방어력이 오른다.' },
  gem_endure:   { n: '인내한 영혼의 보석', kind: 'use', cat: 'gem', icon: 163, price: 2000, effects: [{ type: 'permStat', stat: 'hp', amount: 108 }], d: '사용하면 체력이 오른다.' },
  gem_clear:    { n: '맑은 영혼의 보석', kind: 'use', cat: 'gem', icon: 164, price: 2000, effects: [{ type: 'permStat', stat: 'mp', amount: 66 }], d: '사용하면 마나가 오른다.' },
  gem_swift:    { n: '날랜 영혼의 보석', kind: 'use', cat: 'gem', icon: 161, price: 2000, effects: [{ type: 'permStat', stat: 'spd', amount: 3 }], d: '사용하면 속도가 오른다.' },
  repel_incense:{ n: '마물 쫓는 향', kind: 'use', cat: 'field', icon: 1087, price: 60, fieldOnly: true, effects: [{ type: 'repel', steps: 200 }], d: '향이 피어오르는 동안 마물이 꺼린다.' },
  lucky_coin:   { n: '행운의 동전', kind: 'use', cat: 'battle', icon: 128, price: 100, battleOnly: true, effects: [{ type: 'goldBoost', mul: 2 }], d: '던지면 행운이 따른다.' },
  scroll:   { n: '귀환 주문서', kind: 'use', cat: 'field', icon: 296, price: 100, fieldOnly: true, warp: true, d: '[필드] 마지막으로 잠든 곳으로 돌아간다 (30분 소요)' },

  // 마법봉 (1개)
  wand_0: { n: '견습 마법봉', kind: 'wand', icon: 1488, price: 0, atk: 24, mag: 32, d: '처음부터 손에 쥐고 있던 작은 마법봉.' },
  wand_1: { n: '참나무 마법봉', kind: 'wand', icon: 1568, price: 70, atk: 48, mag: 64, d: '단단한 참나무로 깎은 마법봉.' },
  wand_2: { n: '은빛 마법봉', kind: 'wand', icon: 1648, price: 320, atk: 88, mag: 128, d: '은을 입혀 마력이 잘 흐른다.' },
  wand_3: { n: '기사단 전투봉', kind: 'wand', icon: 1705, price: 700, atk: 208, mag: 80, d: '기사들이 쓰는 묵직한 전투봉. 물리 특화.' },
  wand_4: { n: '장미 가시 마법봉', kind: 'wand', icon: 1807, price: 1100, atk: 144, mag: 208, d: '장미 덩굴이 감긴 마법봉.' },
  wand_5: { n: '대마법사의 마법봉', kind: 'wand', icon: 1775, price: 2400, atk: 128, mag: 336, d: '마법사 마을 장인의 걸작.' },
  wand_6: { n: '업화의 마법봉', kind: 'wand', icon: 1806, price: 3600, atk: 240, mag: 368, el: 'fire', d: '일반 공격에 화염 속성이 붙는다.' },
  wand_7: { n: '해골 사령봉', kind: 'wand', icon: 1696, price: 0, atk: 272, mag: 352, drain: 0.12, d: '일반 공격 피해의 12%를 흡수한다.' },
  wand_8: { n: '종말을 거스르는 봉', kind: 'wand', icon: 1708, price: 0, atk: 384, mag: 560, d: '끝없는 탑 깊은 곳에 잠든 전설의 마법봉.' },

  // 악세사리 (최대 5개, 같은 것을 여러 개 낄 수 있다)
  acc_atk:    { n: '힘의 반지', kind: 'acc', icon: 1844, price: 280, atk: 40, d: '공격 +40' },
  acc_mag:    { n: '지혜의 반지', kind: 'acc', icon: 1845, price: 280, mag: 40, d: '마력 +40' },
  acc_def:    { n: '수호의 부적', kind: 'acc', icon: 663, price: 260, def: 36, d: '방어 +36' },
  acc_spd:    { n: '질풍의 깃털', kind: 'acc', icon: 252, price: 320, spd: 4, d: '속도 +4' },
  acc_luck:   { n: '네잎클로버', kind: 'acc', icon: 667, price: 250, crit: 6, drop: 0.3, d: '치명타율 +6%, 드롭률 +30%' },
  acc_hp:     { n: '생명의 목걸이', kind: 'acc', icon: 1848, price: 350, hp: 270, d: '최대 체력 +270' },
  acc_mp:     { n: '마력의 목걸이', kind: 'acc', icon: 1849, price: 350, mp: 112, d: '최대 마나 +112' },
  acc_steel:  { n: '강철 반지', kind: 'acc', icon: 1842, price: 300, def: 24, hp: 135, d: '방어 +24, 체력 +135' },
  acc_knight: { n: '기사단 문장', kind: 'acc', icon: 852, price: 900, def: 84, hp: 135, d: '방어 +84, 체력 +135' },
  acc_rose:   { n: '장미 브로치', kind: 'acc', icon: 1847, price: 800, regen: 0.04, d: '전투 중 매 턴 최대 체력의 4% 회복' },
  acc_pearl:  { n: '진주 목걸이', kind: 'acc', icon: 2176, price: 1200, def: 48, mp: 135, mag: 32, d: '방어 +48, 마나 +135, 마력 +32' },
  acc_gold:   { n: '황금 반지', kind: 'acc', icon: 1843, price: 1500, crit: 4, gold: 0.25, d: '치명타율 +4%, 획득 골드 +25%' },
  acc_sage:   { n: '현자의 귀걸이', kind: 'acc', icon: 2182, price: 2600, mag: 96, mp: 180, d: '마력 +96, 마나 +180' },
  acc_dragon: { n: '용비늘 부적', kind: 'acc', icon: 664, price: 0, def: 120, hp: 450, d: '방어 +120, 최대 체력 +450' },
  acc_forest: { n: '숲지기의 깃털', kind: 'acc', icon: 1846, price: 0, spd: 6, poisonImmune: true, d: '속도 +6, 독 면역' },

  // 유물 (1개)
  relic_moon:  { n: '월광의 성배', kind: 'relic', icon: 141, price: 2800, gaugeCost: -2, d: '전투 1회당 변신 게이지 소모 -2' },
  relic_clock: { n: '태엽 심장', kind: 'relic', icon: 2136, price: 0, spd: 14, firstStrike: true, d: '속도 +14, 전투 시작 시 항상 먼저 행동' },
  relic_opal:  { n: '오팔의 깃털관', kind: 'relic', icon: 2139, price: 0, mpRegen: 18, mag: 64, d: '마력 +64, 매 턴 마나 18 회복' },
  relic_moss:  { n: '이끼 거인의 심장', kind: 'relic', icon: 2142, price: 0, hp: 720, def: 48, d: '최대 체력 +720, 방어 +48' },
  relic_core:  { n: '다이너모 핵', kind: 'relic', icon: 2128, price: 0, atk: 176, d: '공격 +176' },
  relic_levi:  { n: '레비아탄의 역린', kind: 'relic', icon: 2130, price: 0, def: 180, hp: 540, d: '방어 +180, 최대 체력 +540' },
  relic_shard: { n: '종말의 파편', kind: 'relic', icon: 2140, price: 0, allPct: 0.15, gaugeCost: 3, d: '모든 능력치 +15%. 대신 변신 게이지 소모 +3' },
  relic_rose:  { n: '영원의 장미', kind: 'relic', icon: 2129, price: 4200, regen: 0.06, def: 48, d: '매 턴 체력 6% 회복, 방어 +48' },
  relic_eye:   { n: '감시자의 눈', kind: 'relic', icon: 718, price: 0, crit: 15, drop: 0.5, d: '치명타율 +15%, 드롭률 +50%' },

  // 재료 (팔아서 돈으로)
  m_jelly:   { n: '그림자 젤리', kind: 'mat', icon: 166, price: 8, d: '슬라임의 잔해.' },
  m_ear:     { n: '고블린의 귀', kind: 'mat', icon: 236, price: 12, d: '고블린의 뾰족한 귀.' },
  m_feather: { n: '검은 깃털', kind: 'mat', icon: 252, price: 10, d: '새 마물의 깃털.' },
  m_fang:    { n: '마물 송곳니', kind: 'mat', icon: 229, price: 12, d: '날카로운 송곳니.' },
  m_horn:    { n: '마물의 뿔', kind: 'mat', icon: 3, price: 25, d: '단단한 뿔.' },
  m_shroom:  { n: '버섯 갓', kind: 'mat', icon: 32, price: 18, d: '독버섯의 갓.' },
  m_petal:   { n: '마력 꽃잎', kind: 'mat', icon: 660, price: 30, d: '마력을 머금은 꽃잎.' },
  m_scale:   { n: '물고기 비늘', kind: 'mat', icon: 360, price: 32, d: '반짝이는 비늘.' },
  m_ore:     { n: '마광석', kind: 'mat', icon: 172, price: 45, d: '마력을 띤 광석.' },
  m_gold:    { n: '금덩이', kind: 'mat', icon: 149, price: 300, d: '순금. 비싸게 팔린다.' },
  m_shell:   { n: '바다 별', kind: 'mat', icon: 374, price: 50, d: '불가사리 모양의 조개.' },
  m_ink:     { n: '심해 먹물', kind: 'mat', icon: 165, price: 70, d: '문어의 먹물.' },
  m_gear:    { n: '고대 톱니', kind: 'mat', icon: 2133, price: 110, d: '유적 기계의 부품.' },
  m_soul:    { n: '어둠의 혼', kind: 'mat', icon: 224, price: 90, d: '마물이 남긴 혼.' },
};
R.KIND_LABEL = { use: '소모품', wand: '마법봉', acc: '악세사리', relic: '유물', mat: '재료', story: '소지품' };
R.ACC_SLOTS = 5;

// ---------- 상점 ----------
R.SHOPS = {
  ww_general: { n: '들바람 잡화점', items: ['potion_s', 'potion_m', 'ether', 'antidote', 'bread', 'scroll', 'honey_potion', 'wake_bell', 'repel_incense'] },
  ww_wand:    { n: '들바람 공방', items: ['wand_1', 'wand_2', 'acc_steel', 'acc_def', 'acc_luck'] },
  kn_arms:    { n: '기사단 무구점', items: ['wand_3', 'acc_atk', 'acc_def', 'acc_knight', 'acc_hp'] },
  kn_general: { n: '기사단 보급소', items: ['potion_s', 'potion_m', 'ether', 'antidote', 'smoke', 'honey_potion', 'cool_salve', 'warm_soup', 'repel_incense'] },
  pl_general: { n: '광장 시장', items: ['potion_m', 'potion_l', 'ether', 'antidote', 'bomb', 'smoke', 'scroll', 'fight_tea', 'iron_biscuit', 'swift_tea', 'herb_tea', 'bomb_sticky'] },
  pl_acc:     { n: '장신구 노점', items: ['acc_atk', 'acc_mag', 'acc_spd', 'acc_luck', 'acc_hp', 'acc_mp'] },
  ct_arms:    { n: '빅토리아 왕실 공방', items: ['wand_2', 'wand_4', 'wand_5', 'acc_gold', 'acc_pearl', 'relic_moon'] },
  ct_general: { n: '빅토리아 상회', items: ['potion_m', 'potion_l', 'ether', 'ether_l', 'bomb', 'bomb2', 'scroll', 'herb_tea', 'fire_candy', 'ice_candy', 'spark_candy', 'guard_bubble', 'lucky_coin'] },
  rose_shop:  { n: '장미 꽃집', items: ['potion_s', 'potion_m', 'antidote', 'acc_rose', 'relic_rose', 'wand_4', 'honey_potion', 'wake_bell', 'warm_soup'] },
  dock_shop:  { n: '부두 시장', items: ['meat', 'potion_m', 'potion_l', 'ether', 'antidote', 'bomb', 'acc_pearl', 'cool_salve', 'bomb_ember', 'bomb_sleep', 'guard_bubble'] },
  resort_shop:{ n: '휴양지 기념품점', items: ['potion_l', 'ether_l', 'elixir', 'acc_luck', 'acc_gold', 'bomb2', 'lucky_coin', 'herb_tea', 'swift_tea'] },
  wiz_shop:   { n: '마법봉 장인', items: ['wand_5', 'wand_6', 'acc_mag', 'acc_sage', 'acc_mp', 'relic_moon'] },
  wiz_general:{ n: '물약 연구소', items: ['potion_m', 'potion_l', 'ether', 'ether_l', 'elixir', 'bomb2', 'bomb_thunder', 'bomb_hush', 'powder_weak', 'fire_candy', 'ice_candy', 'spark_candy'] },
  // 루시앙의 필드 노점 — 버섯 숲용 임시 품목 ※ 임시 (지역마다 다른 품목은 미정)
  // 달빛 호수의 루시앙 노점 — 영혼의 보석 (이번 회차 구매 상한 R.GEM_BUY_LIMIT)
  lucien_lake: { n: '길 위의 가게 — 루시앙의 잡화점', items: ['gem_valor', 'gem_wisdom', 'gem_resolve', 'gem_endure', 'gem_clear', 'gem_swift', 'herb_tea', 'potion_l'], gemLimit: true },
  lucien:     { n: '길 위의 가게 — 루시앙의 잡화점', items: ['potion_s', 'potion_m', 'antidote', 'ether', 'bomb', 'smoke'] },
  tower_shop: { n: '탑 앞 노점', items: ['potion_m', 'potion_l', 'ether', 'ether_l', 'smoke', 'scroll'] },
};

// ---------- 마물 ----------
// s: [시트, 행]  — Aekashics 3프레임 정면 시트. 각 행이 서로 다른 마물이다.
// m: 능력 배율 {hp,atk,def,mag,spd}   weak: 약점 속성   sk: 쓰는 기술   drop: [[아이템, 확률]]
R.MON = {
  // 동쪽 침묵 숲 (Lv1~4)
  slime:   { n: '그림자 슬라임', s: ['BigMonster5', 3], lv: 1, m: { hp: .9, atk: .85, def: .8 }, weak: ['fire'], drop: [['m_jelly', .5], ['potion_s', .12]] },
  goblin:  { n: '고블린 졸병', s: ['Grunt', 0], lv: 2, m: {}, drop: [['m_ear', .45], ['bread', .1]] },
  crow:    { n: '침묵의 까마귀', s: ['BigMonster9', 2], lv: 3, m: { hp: .8, spd: 1.5 }, weak: ['thunder'], drop: [['m_feather', .5]] },
  bat:     { n: '핏빛 박쥐', s: ['Big_Monster15', 1], lv: 3, m: { hp: .8, spd: 1.4 }, sk: ['drain'], drop: [['m_fang', .45]] },
  imp:     { n: '임프 창병', s: ['BigMonster12', 1], lv: 4, m: { hp: 1.1, atk: 1.15 }, sk: ['heavy'], drop: [['m_horn', .3], ['potion_s', .15]] },
  forestlord:{ n: '타락한 숲지기', s: ['BigMonster13', 2], lv: 8, boss: true, m: { hp: 1, atk: 1.05 }, sk: ['heavy', 'roar', 'poison'], weak: ['fire'], drop: [['acc_forest', 1], ['moon', 1]] },

  // 이상한 버섯 숲 (Lv5~9)
  shroom:  { n: '독버섯 꼬마', s: ['BigMonster10', 0], lv: 5, m: { hp: 1.1 }, sk: ['poison'], weak: ['fire'], drop: [['m_shroom', .5], ['antidote', .2]] },
  wslime:  { n: '마녀모자 슬라임', s: ['BigMonster13', 3], lv: 6, m: { mag: 1.3 }, sk: ['mfire'], drop: [['m_jelly', .5], ['ether', .12]] },
  fairy:   { n: '장난꾸러기 요정', s: ['BigMonster11', 2], lv: 6, m: { hp: .8, spd: 1.6 }, sk: ['sleep', 'mice'], weak: ['fire'], drop: [['m_petal', .3], ['ether', .1]] },
  sporeghost:{ n: '포자 유령', s: ['BigMonster9', 3], lv: 7, m: { hp: 1.1, mag: 1.2 }, sk: ['poison', 'sleep'], weak: ['fire'], drop: [['m_shroom', .45]] },
  witch:   { n: '빗자루 마녀', s: ['BigMonster7', 3], lv: 8, m: { mag: 1.4, hp: .9 }, sk: ['mfire', 'mice'], drop: [['ether', .2], ['m_petal', .3]] },
  alraune: { n: '알라우네', s: ['Big_Monster16', 1], lv: 8, m: { hp: 1.3, mag: 1.2 }, sk: ['heal', 'sleep'], weak: ['fire'], drop: [['m_petal', .6], ['potion_m', .1]] },
  fox:     { n: '백색 구미호', s: ['Big_Monster20', 0], lv: 10, rare: true, m: { hp: 1.4, mag: 1.5, spd: 1.4 }, sk: ['mfire', 'all_fire'], exp: 3, drop: [['moon', .5], ['acc_luck', .3]] },
  mossgiant:{ n: '이끼 거인', s: ['Big_Monster19', 3], lv: 16, boss: true, m: { hp: 1.1, atk: 1.15, def: 1.2 }, sk: ['heavy', 'roar', 'heal'], weak: ['fire'], drop: [['relic_moss', 1], ['moon', 1]] },

  // 버려진 광산 (Lv6~10)
  orc:     { n: '광산 오크', s: ['BigMonster13', 1], lv: 6, m: { hp: 1.3, atk: 1.2, spd: .8 }, sk: ['heavy'], drop: [['m_horn', .3], ['m_ore', .2]] },
  ogolem:  { n: '광석 골렘', s: ['BigMonster5', 2], lv: 7, m: { hp: 1.4, def: 1.8, spd: .6 }, weak: ['thunder'], sk: ['heavy'], drop: [['m_ore', .5]] },
  ghoul:   { n: '갱도의 그림자', s: ['Big_Monster17', 2], lv: 8, m: { hp: 1.1, atk: 1.1 }, sk: ['drain'], weak: ['fire'], drop: [['m_soul', .2], ['m_ore', .2]] },
  troll:   { n: '동굴 트롤', s: ['Big_Monster17', 3], lv: 9, m: { hp: 1.5, atk: 1.25, spd: .7 }, sk: ['heavy', 'roar'], drop: [['m_ore', .4], ['potion_m', .15]] },
  mimic:   { n: '황금 미믹', s: ['Big_Monster20', 1], lv: 8, rare: true, m: { hp: .8, def: 2.5 }, sk: ['flee'], gold: 12, exp: 2, drop: [['m_gold', .8], ['acc_gold', .1]] },
  dynamo:  { n: '동력골렘 다이너모', s: ['Dynamo', 0], lv: 18, boss: true, m: { hp: 1.2, atk: 1.2, def: 1.4 }, sk: ['heavy', 'all_thunder', 'roar'], weak: ['ice'], drop: [['relic_core', 1], ['moon', 1]] },

  // 오팔 강변 (Lv10~14)
  fishman: { n: '어인 창병', s: ['BigMonster10', 1], lv: 10, m: { hp: 1.1, atk: 1.1 }, sk: ['heavy'], weak: ['thunder'], drop: [['m_scale', .45]] },
  redfish: { n: '붉은 강꼬치', s: ['BigMonster6', 2], lv: 10, m: { hp: .9, atk: 1.2, spd: 1.3 }, weak: ['thunder'], sk: ['drain'], drop: [['m_scale', .5]] },
  peacock: { n: '오팔 공작', s: ['BigMonster4', 2], lv: 11, m: { mag: 1.3 }, sk: ['mice', 'sleep'], drop: [['bomb_sleep', 0.06], ['acc_spd', .05], ['m_feather', .4]] },
  ram:     { n: '강변 뿔산양', s: ['BigMonster9', 0], lv: 11, m: { hp: 1.3, atk: 1.2 }, sk: ['heavy'], drop: [['m_horn', .5]] },
  tiger:   { n: '강변 호랑이', s: ['BigMonster7', 2], lv: 12, m: { hp: 1.2, atk: 1.3, spd: 1.2 }, sk: ['multi'], weak: ['ice'], drop: [['m_fang', .5], ['potion_m', .15]] },
  icebird: { n: '서리 물총새', s: ['BigMonster4', 0], lv: 12, m: { mag: 1.3, spd: 1.3 }, sk: ['mice', 'all_ice'], weak: ['fire'], drop: [['ice_candy', 0.05], ['m_feather', .4], ['ether', .15]] },
  wyvern:  { n: '황토 와이번', s: ['Big_Monster14', 3], lv: 14, rare: true, m: { hp: 1.6, atk: 1.3 }, sk: ['all_fire', 'heavy'], weak: ['ice'], exp: 2.5, drop: [['fire_candy', 0.08], ['acc_dragon', .25], ['moon', .3]] },
  urmica:  { n: '오팔의 수호조 우르미카', s: ['UrmicaR', 0], lv: 24, boss: true, m: { hp: 1.1, mag: 1.3, spd: 1.3 }, sk: ['all_ice', 'mice', 'heal'], weak: ['thunder'], drop: [['relic_opal', 1], ['moon', 1]] },

  // 바다 (Lv13~17)
  crab:    { n: '거대 집게 게', s: ['ZodiacCancer', 0], lv: 13, m: { hp: 1.3, def: 1.6, atk: 1.1 }, sk: ['heavy'], weak: ['thunder'], drop: [['m_shell', .45]] },
  crystal: { n: '수정 갑각수', s: ['Big_Monster21', 1], lv: 14, m: { hp: 1.2, def: 1.5 }, sk: ['all_ice'], weak: ['thunder'], drop: [['bomb_sticky', 0.05], ['m_shell', .3], ['m_ore', .3]] },
  seabird: { n: '무지개 바다새', s: ['Big_Monster22', 0], lv: 14, m: { spd: 1.5, mag: 1.2 }, sk: ['all_thunder'], drop: [['spark_candy', 0.06], ['m_feather', .5], ['ether', .15]] },
  seaghost:{ n: '해무 유령', s: ['Big_Monster21', 2], lv: 15, m: { hp: .9, mag: 1.4 }, sk: ['sleep', 'drain'], weak: ['fire'], drop: [['m_soul', .3]] },
  seawyv:  { n: '바다 비룡', s: ['BigMonster8', 3], lv: 16, m: { hp: 1.3, atk: 1.2 }, sk: ['all_ice', 'heavy'], weak: ['thunder'], drop: [['m_scale', .5], ['potion_l', .1]] },
  demeres: { n: '빙해의 여제 데메레스', s: ['Demeres', 0], lv: 28, boss: true, m: { hp: 1.1, mag: 1.4 }, sk: ['all_ice', 'mice', 'heal', 'sleep'], weak: ['fire'], drop: [['acc_sage', 1], ['moon', 1]] },

  // 해식 동굴 (Lv17~21)
  serpent: { n: '동굴 바다뱀', s: ['Big_Monster20', 3], lv: 17, m: { hp: 1.2, atk: 1.2 }, sk: ['poison', 'multi', 'sap'], drop: [['m_scale', .5]] },
  seahound:{ n: '심해 사냥개', s: ['Big_Monster18', 1], lv: 18, m: { hp: 1.3, atk: 1.2 }, sk: ['multi', 'sleep'], weak: ['thunder'], drop: [['bomb_sleep', 0.06], ['m_ink', .5]] },
  dgolem:  { n: '심해 골렘', s: ['BigMonster9', 1], lv: 19, m: { hp: 1.6, def: 1.7, spd: .6 }, sk: ['heavy', 'roar'], weak: ['thunder'], drop: [['m_ore', .5], ['potion_l', .12]] },
  leviathan:{ n: '심해의 왕 레비아탄', s: ['Leviathan', 0], lv: 36, boss: true, m: { hp: 1.2, atk: 1.3, mag: 1.3 }, sk: ['all_ice', 'heavy', 'roar'], weak: ['thunder'], drop: [['relic_levi', 1], ['moon', 1]] },

  // 고대 유적 (Lv20~26)
  priest:  { n: '고대의 사제', s: ['Ancient_Priestess', 0], lv: 20, m: { mag: 1.4 }, sk: ['heal', 'all_thunder'], drop: [['herb_tea', 0.06], ['m_gear', .3], ['ether_l', .1]] },
  firemage:{ n: '불꽃 술사', s: ['BigMonster8', 0], lv: 20, m: { mag: 1.5, hp: .9 }, sk: ['scorch', 'inferno'], weak: ['ice'], drop: [['bomb_ember', 0.08], ['ether_l', .15]] },
  clock:   { n: '시계장치 구체', s: ['BigMonster7', 1], lv: 21, m: { def: 1.6, hp: 1.2 }, sk: ['all_thunder', 'sleep'], weak: ['thunder'], drop: [['bomb_thunder', 0.06], ['m_gear', .6]] },
  sorc:    { n: '유적의 마녀', s: ['BigMonster4', 3], lv: 22, m: { mag: 1.5 }, sk: ['mice', 'all_ice', 'drain', 'hush'], drop: [['bomb_hush', 0.06], ['m_soul', .3], ['ether_l', .12]] },
  cskull:  { n: '시간을 먹는 해골', s: ['BigMonster11', 0], lv: 23, m: { hp: 1.5, mag: 1.3 }, sk: ['inferno', 'drain'], drop: [['m_gear', .4], ['m_soul', .3]] },
  eye:     { n: '감시의 눈', s: ['Big_Monster17', 1], lv: 23, m: { hp: 1.2, mag: 1.4, spd: 1.2 }, sk: ['all_thunder', 'sleep', 'hush'], drop: [['powder_weak', 0.06], ['relic_eye', .04], ['m_gear', .4]] },
  mech:    { n: '황금 수호병기', s: ['BigMonster3', 0], lv: 24, m: { hp: 1.7, def: 1.8, atk: 1.3, spd: .7 }, sk: ['heavy', 'roar'], weak: ['thunder'], drop: [['m_gold', .3], ['m_gear', .5]] },
  clockking:{ n: '태엽의 왕', s: ['KingsA', 1], lv: 46, boss: true, m: { hp: 1.2, atk: 1.3, spd: 1.4 }, sk: ['multi', 'all_thunder', 'roar'], drop: [['relic_clock', 1], ['moon', 1]] },
  yogg:    { n: '종말의 사도 샤카드요그', s: ['ShaccadYogg', 0], lv: 60, boss: true, m: { hp: 1.6, atk: 1.4, mag: 1.5, def: 1.3 }, sk: ['all_fire', 'all_ice', 'all_thunder', 'drain', 'roar'], drop: [['relic_shard', 1], ['elixir', 1]] },

  // ----- 새 지역의 마수 (Phase 3) — 지역에서 가장 센 우두머리. 기원 · 정체는 담지 않는다 -----
  gravekeeper: { n: '잠들지 않는 묘지기', s: ['Big_Monster21', 3], lv: 20, boss: true, m: { hp: 1.0, atk: 1.0, def: 1.1 }, sk: ['drain', 'sleep', 'heavy'], weak: ['fire'], drop: [['acc_hp', 1], ['moon', 1]] },
  frostgiant:  { n: '호수의 빙결 거인', s: ['BigMonster10', 2], lv: 22, boss: true, m: { hp: 1.1, mag: 1.3, spd: 0.8 }, sk: ['all_ice', 'mice', 'roar'], weak: ['thunder'], drop: [['acc_mp', 1], ['moon', 1]] },
  cliffknight: { n: '절벽의 바람기사', s: ['BigMonster5', 0], lv: 30, boss: true, m: { hp: 0.95, atk: 1.2, spd: 1.6 }, sk: ['multi', 'heavy', 'all_thunder'], weak: ['ice'], drop: [['acc_spd', 1], ['moon', 1]] },
  ironmarshal: { n: '옛 전장의 흑철 장군', s: ['Big_Monster15', 0], lv: 34, boss: true, m: { hp: 1.2, atk: 1.25, def: 1.6, spd: 0.8 }, sk: ['heavy', 'roar', 'multi'], drop: [['acc_knight', 1], ['moon', 1]] },
  hornbeast:   { n: '해안의 뿔 거수', s: ['BigMonster6', 1], lv: 38, boss: true, m: { hp: 1.5, atk: 1.1, def: 1.2, spd: 0.7 }, sk: ['heal', 'heavy', 'poison'], weak: ['fire'], drop: [['acc_pearl', 1], ['moon', 1]] },
  crimsonmane: { n: '협곡의 진홍 갈기', s: ['Big_Monster14', 2], lv: 42, boss: true, m: { hp: 1.1, mag: 1.4, atk: 1.1 }, sk: ['inferno', 'scorch', 'roar'], weak: ['ice'], drop: [['wand_6', 1], ['moon', 1]] },
  starqueen:   { n: '별지기 여왕', s: ['BigMonster11', 1], lv: 44, boss: true, m: { hp: 1.0, mag: 1.35, spd: 1.2 }, sk: ['sleep', 'all_thunder', 'heal', 'hush'], weak: ['thunder'], drop: [['acc_sage', 1], ['moon', 1]] },
  sandgiant:   { n: '모래 폐도시의 거인', s: ['BigMonster4', 1], lv: 52, boss: true, m: { hp: 1.6, atk: 1.3, spd: 0.7 }, sk: ['heavy', 'roar', 'drain', 'sap'], weak: ['ice'], drop: [['relic_rose', 1], ['moon', 1]] },
  silverguard: { n: '요새의 백은 수호기', s: ['Big_Monster20', 2], lv: 56, boss: true, m: { hp: 1.2, def: 1.5, mag: 1.2 }, sk: ['heal', 'multi', 'all_thunder'], drop: [['acc_dragon', 1], ['moon', 1]] },
  oldchief:    { n: '잊혀진 마을의 우두머리', s: ['KingsA', 0], lv: 60, boss: true, m: { hp: 1.3, atk: 1.3, mag: 1.3, def: 1.2 }, sk: ['all_fire', 'all_ice', 'all_thunder', 'drain', 'roar'], drop: [['elixir', 1], ['moon', 1]] },

  // 끝없는 탑 (층수로 레벨이 정해짐)
  t_monk:  { n: '그림자 수도사', s: ['BigMonster12', 2], lv: 1, m: { hp: .9, mag: 1.2 }, sk: ['mice'], drop: [['m_soul', .2]] },
  t_wraith:{ n: '망령', s: ['BigMonster12', 3], lv: 1, m: { mag: 1.2 }, sk: ['drain'], weak: ['fire'], drop: [['m_soul', .3]] },
  t_skull: { n: '해골 망령', s: ['BigMonster8', 1], lv: 1, m: { hp: 1.1, mag: 1.3 }, sk: ['all_ice'], weak: ['fire'], drop: [['m_soul', .3]] },
  t_witch: { n: '칠흑의 마녀', s: ['BigMonster12', 0], lv: 1, m: { mag: 1.4 }, sk: ['scorch', 'sleep'], drop: [['ether', .2]] },
  t_skoll: { n: '그림자 사냥꾼 스콜', s: ['Skoll', 0], lv: 1, m: { atk: 1.3, spd: 1.4 }, sk: ['multi'], drop: [['m_fang', .4]] },
  t_knight:{ n: '타락한 흑기사', s: ['LKnightMichael', 0], lv: 1, m: { hp: 1.3, atk: 1.3, def: 1.3 }, sk: ['heavy'], drop: [['potion_m', .2]] },
  t_blade: { n: '검귀', s: ['MknightGoldnharl', 0], lv: 1, m: { atk: 1.4, spd: 1.3 }, sk: ['multi', 'sap'], drop: [['m_soul', .3]] },
  t_garg:  { n: '공허의 가고일', s: ['VoidGargoyleIo', 0], lv: 1, m: { hp: 1.3, mag: 1.3 }, sk: ['inferno'], weak: ['ice'], drop: [['m_horn', .4]] },
  t_beast: { n: '흑마수', s: ['Big_Monster14', 1], lv: 1, m: { hp: 1.5, atk: 1.3 }, sk: ['heavy', 'roar'], drop: [['m_fang', .5]] },
  t_demon: { n: '홍련 마인', s: ['Big_Monster15', 2], lv: 1, m: { atk: 1.3, mag: 1.2 }, sk: ['scorch'], weak: ['ice'], drop: [['m_soul', .3]] },
  t_flame: { n: '업화의 마인', s: ['Big_Monster15', 3], lv: 1, m: { hp: 1.3, mag: 1.4 }, sk: ['inferno'], weak: ['ice'], drop: [['fire_candy', 0.05], ['m_soul', .4]] },
  t_jelly: { n: '공허 해파리', s: ['Big_Monster19', 0], lv: 1, m: { mag: 1.3 }, sk: ['all_thunder', 'sleep', 'hush'], drop: [['spark_candy', 0.05], ['ether', .2]] },
  t_fallen:{ n: '추락한 천사', s: ['BigMonster13', 0], lv: 1, m: { def: 1.4, mag: 1.2 }, sk: ['heal', 'mice'], drop: [['m_ore', .3]] },
  t_angel: { n: '타락한 성기사', s: ['BigMonster5', 1], lv: 1, m: { hp: 1.4, atk: 1.2, def: 1.3 }, sk: ['heal', 'heavy'], drop: [['potion_l', .1]] },
  t_rift:  { n: '차원의 균열', s: ['Big_Monster14', 0], lv: 1, m: { hp: 1.2, mag: 1.5 }, sk: ['all_thunder', 'all_fire'], drop: [['moon', .05]] },
  tb_xoer: { n: '해골기사 조어', s: ['SkullKnightXoer', 0], lv: 1, boss: true, m: { atk: 1.2 }, sk: ['heavy', 'drain'], drop: [['wand_7', 1]] },
  tb_goken:{ n: '흑익의 고켄', s: ['Goken', 0], lv: 1, boss: true, m: { spd: 1.4 }, sk: ['multi', 'roar'], drop: [['acc_dragon', 1]] },
  tb_skor: { n: '설원의 군주 스코르', s: ['Skor', 0], lv: 1, boss: true, m: { hp: 1.2 }, sk: ['all_ice', 'heavy'], weak: ['fire'], drop: [['elixir', 1]] },
  tb_king: { n: '망국의 왕', s: ['KingsA', 2], lv: 1, boss: true, m: { mag: 1.3 }, sk: ['all_fire', 'heal'], drop: [['relic_eye', 1]] },
  tb_remm: { n: '전설의 기사 렘멘트', s: ['LegendaryKnightRemmentPR', 0], lv: 1, boss: true, m: { atk: 1.4, def: 1.3 }, sk: ['heavy', 'multi', 'roar'], drop: [['wand_8', 1]] },
  tb_queen:{ n: '어둠의 여왕 샤카드', s: ['DarkQueenShaccad', 0], lv: 1, boss: true, m: { mag: 1.5 }, sk: ['all_fire', 'all_ice', 'drain'], drop: [['elixir', 1]] },
  tb_huang:{ n: '황룡', s: ['HuangLong', 0], lv: 1, boss: true, m: { hp: 1.5, atk: 1.4, mag: 1.4 }, sk: ['all_thunder', 'all_fire', 'roar'], drop: [['elixir', 1]] },
};
R.TOWER_POOL = ['t_monk', 't_wraith', 't_skull', 't_witch', 't_skoll', 't_knight', 't_blade', 't_garg', 't_beast', 't_demon', 't_flame', 't_jelly', 't_fallen', 't_angel', 't_rift'];
R.TOWER_BOSSES = ['tb_xoer', 'tb_goken', 'tb_skor', 'tb_king', 'tb_remm', 'tb_queen', 'tb_huang'];
R.towerLevel = floor => 5 + Math.round(floor * 1.1);   // 1층 6 · 10층 16 · 30층 38 · 50층 60

// 마물 기술
R.MSK = {
  heavy:       { n: '강타', type: 'phys', pow: 1.6 },
  multi:       { n: '연속 공격', type: 'phys', pow: 0.75, hits: 2 },
  drain:       { n: '흡혈', type: 'phys', pow: 1.0, drain: 0.5 },
  poison:      { n: '독 공격', type: 'phys', pow: 0.9, poison: 0.7 },
  web:         { n: '휘감기', type: 'status', slow: true },
  mfire:       { n: '파이어', type: 'mag', pow: 1.4, el: 'fire' },
  mice:        { n: '아이스', type: 'mag', pow: 1.4, el: 'ice' },
  all_fire:    { n: '화염 폭풍', type: 'mag', pow: 1.5, el: 'fire' },
  all_ice:     { n: '눈보라', type: 'mag', pow: 1.5, el: 'ice' },
  all_thunder: { n: '낙뢰', type: 'mag', pow: 1.5, el: 'thunder' },
  sleep:       { n: '수면 가루', type: 'status', sleep: 0.45 },
  heal:        { n: '회복', type: 'heal', pow: 0.22 },
  roar:        { n: '포효', type: 'buff' },
  flee:        { n: '도주', type: 'flee' },
  // 2부: 새 상태이상을 거는 기술 (기존 mfire · all_fire 는 1회차 지역 마물도 써서 그대로 두고, 화상이 붙은 변형을 따로 만들었다)
  scorch:      { n: '작열탄', type: 'mag', pow: 1.4, el: 'fire', burn: 0.4 },        // ※ 임시 (확률)
  inferno:     { n: '업화 폭풍', type: 'mag', pow: 1.5, el: 'fire', burn: 0.3 },     // ※ 임시
  hush:        { n: '침묵의 비명', type: 'status', silence: 0.55 },                  // ※ 임시
  sap:         { n: '기력 흡수', type: 'phys', pow: 0.9, weak: 0.5 },                 // ※ 임시
};

// ---------- 지역 ----------
// g: 월드맵 좌표 (손그림 지도 기준)  type: 지형 생성 방식
// buildings.door: 문 앞 칸 (건물은 그 위에 선다)   npcs.c: Super Retro World 캐릭터 번호(1~32)
R.MAPS = {
  wildwind: { n: '들바람 마을', g: [2, 2], type: 'town', exits: { n: 'v_city', w: 'knights', e: 'silent', s: 'rose' },
    buildings: [
      { img: 'House_Hay_1', door: [9, 14], role: 'home', label: '클레어의 집' },
      { img: 'House_Hay_2', door: [40, 14], role: 'shop', shop: 'ww_general', label: '잡화점', clue: 'merchant' },   // 주인: 교차 단서 한 줄 (아래 R.SHOP_TALK) ※ 임시
      { img: 'House_Hay_4_Purple', door: [9, 37], role: 'shop', shop: 'ww_wand', label: '마법봉 공방' },
      { img: 'House_Hay_3', door: [40, 37], role: 'inn', price: 20, label: '여관' },
    ],
    props: [['Well_Hay_1', 22, 30], ['BulletinBoard_1', 22, 18], ['HayStack_2', 6, 28], ['Barrel_Small_Empty', 38, 18]],
    npcs: [
      { c: 4, x: 26, y: 27, say: ['어서 오렴. 하늘이 이상하게 붉어 보이는 건 내 눈 탓일까…', '요즘 마물 때문에 다들 바깥에 잘 안 나간단다.'] },
      { c: 12, x: 33, y: 20, wander: true, say: ['동쪽 침묵 숲에 마물이 늘었대!', '숲 깊은 곳엔 타락한 숲지기가 산다던데…'] },
      { c: 6, x: 24, y: 34, wander: true, say: ['그 옷 뭐야? 엄청 화려하다!', '…혹시 마물이랑 싸우러 가는 거야?'] },
      { c: 16, x: 40, y: 30, wander: true, say: ['북쪽으로 가면 빅토리아 시가지야. 물건이 아주 많지!'] },
      { key: 'hunter', c: 7, x: 52, y: 24, dir: 'left' },        // 지역 키 NPC: 숲 사냥꾼 ※ 임시 (동쪽 출구 근처)
    ] },
  v_city: { n: '빅토리아 시가지', g: [2, 1], type: 'city', exits: { s: 'wildwind', n: 'v_castle', w: 'v_plaza' },
    buildings: [
      { img: 'House_Hay_3', door: [9, 14], role: 'shop', shop: 'ct_arms', label: '왕실 공방' },
      { img: 'House_Hay_2', door: [40, 14], role: 'shop', shop: 'ct_general', label: '빅토리아 상회' },
      { img: 'House_Hay_1', door: [9, 37], role: 'inn', price: 50, label: '시가지 여관' },
      { img: 'House_Hay_4_Purple', door: [40, 37], role: 'talk', label: '점술의 집', say: ['…보인다. 별이 서른 번 지고 나면 하늘이 갈라지는구나.', '서쪽 끝없는 탑은 오를수록 강해진다. 그 꼭대기는 아무도 본 적 없지.'] },
    ],
    props: [['LampPost_3', 24, 20], ['LampPost_3', 36, 20], ['LampPost_3', 24, 30], ['LampPost_3', 36, 30], ['Banner_Stick_1_Purple', 27, 8], ['Banner_Stick_1_Purple', 33, 8]],
    npcs: [
      { c: 8, x: 28, y: 4, say: ['이 앞은 빅토리아 성이다. 무례한 짓은 하지 말도록.'] },
      { c: 13, x: 21, y: 26, wander: true, say: ['요즘 성에서 기사들을 모으고 있대.'] },
      { c: 3, x: 39, y: 27, wander: true, say: ['광장 노점에서 장신구를 팔아. 악세사리는 다섯 개까지 낄 수 있다구!'] },
      { c: 22, x: 33, y: 34, wander: true, say: ['세상이 어떻게 되든 장사는 해야지, 하하.'] },
      { key: 'scribe', c: 18, x: 31, y: 10, dir: 'down' },       // 지역 키 NPC: 왕실 서기관 ※ 임시 (성으로 가는 길목)
    ] },
  v_castle: { n: '빅토리아 성', g: [2, 0], type: 'castle', exits: { s: 'v_city' },
    npcs: [
      { c: 20, x: 24, y: 6, say: ['…그대가 들바람 마을의 마법소녀인가.', '마물이 날로 늘고 있다. 부디 힘을 길러 다오.', '(이야기는 추후 업데이트 예정)'] },
      { c: 8, x: 19, y: 12, say: ['폐하 앞이다. 예를 갖춰라.'] },
      { c: 8, x: 29, y: 12, say: ['보물고는 비상시라 개방되어 있다. 필요한 걸 가져가도 좋다고 하셨다.'] },
      { c: 9, x: 14, y: 22, wander: true, say: ['기사들의 마을 남쪽 광산에서 이상한 기계 소리가 난대.'] },
    ],
    chests: [[7, 6, 'potion_l', 2], [40, 6, 'acc_hp', 1], [7, 10, 'ether', 3]] },
  v_plaza: { n: '빅토리아 광장', g: [1, 1], type: 'city', exits: { e: 'v_city', s: 'knights', w: 'cliff' },
    buildings: [
      { img: 'House_Hay_2', door: [9, 14], role: 'shop', shop: 'pl_general', label: '광장 시장' },
      { img: 'House_Hay_4_Purple', door: [40, 14], role: 'shop', shop: 'pl_acc', label: '장신구 노점' },
    ],
    props: [['Well_Hay_1', 34, 27], ['Bench_1', 22, 27], ['Bench_1', 40, 27], ['LampPost_3', 21, 20], ['LampPost_3', 39, 20], ['Table_Medium_1', 15, 33], ['Crate_Large_Empty', 45, 33], ['Fireplace_1', 34, 36]],
    npcs: [
      { c: 2, x: 27, y: 32, wander: true, say: ['이 우물에 소원을 빌면 이뤄진대. …세상이 안 끝나게 해 달라고 빌어 볼까.'] },
      { c: 10, x: 36, y: 33, wander: true, say: ['남쪽은 기사들의 마을이야. 무구점이 꽤 좋아.'] },
      { c: 19, x: 18, y: 28, wander: true, say: ['연막탄은 보스 앞에서는 소용없어. 명심해.'] },
    ] },
  knights: { n: '기사들의 마을', g: [1, 2], type: 'town', exits: { n: 'v_plaza', e: 'wildwind', w: 'tower', s: 'mine' },
    buildings: [
      { img: 'House_Hay_3', door: [9, 14], role: 'shop', shop: 'kn_arms', label: '기사단 무구점' },
      { img: 'House_Hay_2', door: [40, 14], role: 'inn', price: 30, label: '기사단 숙소' },
      { img: 'House_Hay_1', door: [9, 37], role: 'shop', shop: 'kn_general', label: '보급소' },
    ],
    props: [['Banner_Stick_1_Purple', 26, 18], ['Banner_Stick_1_Purple', 34, 18], ['Crate_Large_Empty', 40, 34], ['Barrel_Small_Empty', 42, 34], ['Chopped_Tree_1', 50, 30], ['Fireplace_1', 45, 30]],
    npcs: [
      { c: 9, x: 26, y: 27, say: ['서쪽은 끝없는 탑이다. 위로 올라갈수록 마물이 강해지지.', '5층마다 강력한 수호자가 버티고 있다고 한다.'] },
      { c: 13, x: 38, y: 28, wander: true, say: ['남쪽 버려진 광산엔 황금 미믹이 숨어 있대. 잡으면 대박이지!'] },
      { c: 8, x: 21, y: 32, wander: true, say: ['방어가 약하다면 악세사리로 보완해. 기사단 문장은 튼튼하지.'] },
      { key: 'knight', c: 9, x: 31, y: 40, dir: 'up' },          // 지역 키 NPC: 기사단 하급 기사 ※ 임시 (광산으로 가는 남쪽 길목)
    ] },
  tower: { n: '끝없는 탑', g: [0, 2], type: 'towerlobby', exits: { e: 'knights' },
    npcs: [
      { c: 4, x: 20, y: 8, role: 'towerkeeper', say: ['나는 탑지기. 이 탑은 끝이 없지.', '도달했던 5의 배수 층으로 보내 줄 수 있네.'] },
      { c: 27, x: 26, y: 15, role: 'shop', shop: 'tower_shop', say: ['탑에 오르기 전에 준비는 단단히!'] },
    ] },
  silent: { n: '동쪽 침묵 숲', g: [3, 2], type: 'forest', exits: { w: 'wildwind', e: 'mushroom' },
    enc: { pool: ['slime', 'goblin', 'crow', 'bat', 'imp'], n: 9, lv: [1, 8] }, boss: { id: 'forestlord', at: [30, 6] },
    chests: [[9, 9, 'potion_s', 3], [50, 34, 'acc_luck', 1]],
    quests: [{ id: 'hunter', x: 44, y: 12, fn: 'quiver', label: '떨어진 화살통' }] },   // 숲 사냥꾼의 의뢰 물건 ※ 임시
  mushroom: { n: '이상한 버섯 숲', g: [4, 2], type: 'mush', exits: { w: 'silent', n: 'opal', e: 'wizards', s: 'canyon' },
    enc: { pool: ['shroom', 'wslime', 'fairy', 'sporeghost', 'witch', 'alraune'], rare: 'fox', n: 10, lv: [10, 16] }, boss: { id: 'mossgiant', at: [30, 39] },
    npcs: [{ c: 16, x: 12, y: 14, name: '숲의 정령', say: ['…버섯 숲 남쪽 끝엔 이끼 거인이 잠들어 있어.', '불에 약하니까 불꽃 기술이 있으면 써 봐.'] },
      // 우주적 존재: 루시앙 (서쪽 입구에서 이어지는 길가의 노점. 그림자 없음) — 필드 스프라이트 c:3 ※ 임시
      { being: 'lucien', c: 3, x: 6, y: 25, dir: 'right', noShadow: true, props: [['bag', -1, 0, { block: true }], ['pot', -1, 1, { block: true }]] }],
    quests: [{ id: 'apprentice', x: 46, y: 16, fn: 'spore', label: '빛나는 포자' }],   // 견습 마법사의 의뢰 물건 ※ 임시
    chests: [[51, 8, 'ether', 2], [8, 36, 'acc_mp', 1]] },
  opal: { n: '오팔 강변', g: [4, 1], type: 'river', exits: { s: 'mushroom', n: 'observatory' },
    enc: { pool: ['fishman', 'redfish', 'peacock', 'ram', 'tiger', 'icebird'], rare: 'wyvern', n: 10, lv: [18, 24] }, boss: { id: 'urmica', at: [30, 6] },
    chests: [[6, 8, 'potion_m', 3], [52, 32, 'moon', 1]] },
  wizards: { n: '마법사들의 마을', g: [5, 2], type: 'town', exits: { w: 'mushroom', n: 'ruins', s: 'desert', e: 'fortress' },
    exitLock: { s: 'secondLoop', e: 'secondLoop' },
    buildings: [
      { img: 'House_Hay_4_Purple', door: [9, 14], role: 'shop', shop: 'wiz_shop', label: '마법봉 장인' },
      { img: 'House_Hay_4_Purple', door: [40, 14], role: 'shop', shop: 'wiz_general', label: '물약 연구소' },
      { img: 'House_Hay_3', door: [9, 37], role: 'inn', price: 60, label: '별빛 여관' },
      { img: 'House_Hay_1', door: [40, 37], role: 'talk', label: '대마법사의 집', say: ['변신은 달의 힘을 빌리는 것.', '하룻밤을 넘겨 잠들어야만 힘이 다시 차오르지. 그 원리는 아무도 바꿀 수 없어.', '월광의 성배를 지니면 변신의 부담이 조금 줄어들 게다.'] },
    ],
    props: [['Banner_Stick_1_Purple', 27, 18], ['Banner_Stick_1_Purple', 33, 18], ['Fireplace_1', 34, 30], ['Plant_2', 22, 26], ['Plant_2', 38, 26]],
    npcs: [
      { c: 26, x: 26, y: 32, wander: true, say: ['북쪽 고대 유적은 정말 위험해. 레벨 20은 넘고 가!'] },
      { c: 28, x: 36, y: 27, wander: true, say: ['마법 능력은 마력이 높을수록 강해져.'] },
      { c: 31, x: 20, y: 24, wander: true, say: ['유적 가장 깊은 곳에서 불길한 기운이 흘러나오고 있어…'] },
      { key: 'apprentice', c: 32, x: 8, y: 24, dir: 'right' },   // 지역 키 NPC: 견습 마법사 ※ 임시 (버섯 숲에서 들어오는 서쪽 길목)
    ] },
  ruins: { n: '고대 유적', g: [5, 1], type: 'ruins', exits: { s: 'wizards', e: 'oldvillage' },
    exitLock: { e: 'oldVillageUnlock' },
    enc: { pool: ['priest', 'firemage', 'clock', 'sorc', 'cskull', 'eye', 'mech'], n: 11, lv: [40, 46], mul: 0.78 }, boss: { id: 'clockking', at: [12, 8] }, boss2: { id: 'yogg', at: [30, 4] },
    chests: [[51, 9, 'elixir', 1], [6, 33, 'potion_l', 3]] },
  rose: { n: '장미 마을', g: [2, 3], type: 'town', flowers: true, exits: { n: 'wildwind', s: 'southdock' },
    buildings: [
      { img: 'House_Hay_1', door: [9, 14], role: 'shop', shop: 'rose_shop', label: '장미 꽃집' },
      { img: 'House_Hay_2', door: [40, 14], role: 'inn', price: 25, label: '장미 여관' },
      { img: 'House_Hay_4_Purple', door: [40, 37], role: 'talk', label: '정원사의 집', say: ['장미는 끝까지 피어 있을 거야. 무슨 일이 있어도.'] },
    ],
    props: [['Bench_1', 21, 27], ['Bench_1', 39, 27], ['Well_Hay_1', 15, 33]],
    npcs: [
      { c: 26, x: 27, y: 28, wander: true, say: ['장미 브로치를 달면 싸우면서도 상처가 아물어.'] },
      { c: 12, x: 34, y: 33, wander: true, say: ['남쪽으로 가면 바다 냄새가 나는 부두 마을이야.'] },
    ] },
  southdock: { n: '남부두 마을', g: [2, 4], type: 'beachtown', exits: { n: 'rose', s: 'sea', w: 'graveyard', e: 'lake' },
    buildings: [
      { img: 'House_Hay_2', door: [9, 14], role: 'shop', shop: 'dock_shop', label: '부두 시장' },
      { img: 'House_Hay_1', door: [40, 14], role: 'inn', price: 35, label: '선원 여관' },
    ],
    props: [['Crate_Large_Empty', 21, 27], ['Crate_Medium_Closed', 22, 27], ['Barrel_Small_Empty', 39, 27], ['Crate_Water_1', 40, 22], ['Sack_3', 20, 22]],
    npcs: [
      { c: 25, x: 33, y: 26, wander: true, say: ['바다 아래 동굴엔 레비아탄이 산다는 전설이 있지.'] },
      { c: 7, x: 26, y: 28, wander: true, say: ['바다 위 잔교를 따라가면 동쪽 해안 휴양지가 나와.'] },
      { key: 'sailor', c: 19, x: 8, y: 24, dir: 'right' },       // 지역 키 NPC: 부두 선원 ※ 임시 (묘지로 가는 서쪽 길목)
    ] },
  sea: { n: '바다', g: [2, 5], type: 'sea', exits: { n: 'southdock', e: 'resort', s: 'seacave' },
    enc: { pool: ['crab', 'crystal', 'seabird', 'seaghost', 'seawyv'], n: 10, lv: [22, 28], mul: 0.95 }, boss: { id: 'demeres', at: [12, 32] },
    chests: [[50, 9, 'potion_l', 2]] },
  resort: { n: '해안 휴양지', g: [3, 5], type: 'beachtown', exits: { w: 'sea', n: 'lake', s: 'coast' },
    buildings: [
      { img: 'House_Hay_3', door: [9, 14], role: 'inn', price: 120, luxury: true, label: '고급 리조트' },
      { img: 'House_Hay_4_Purple', door: [40, 14], role: 'shop', shop: 'resort_shop', label: '기념품점' },
    ],
    props: [['Table_Medium_1', 24, 26], ['Table_Medium_1', 38, 26], ['Bench_3', 22, 28], ['Bench_3', 39, 28], ['Fireplace_1', 34, 32]],
    npcs: [
      { c: 18, x: 28, y: 24, wander: true, say: ['고급 리조트에서 자면 달빛 정수를 하나 준대!'] },
      { c: 24, x: 42, y: 28, wander: true, say: ['종말 직전의 휴가라니, 낭만적이지 않아?'] },
    ] },
  seacave: { n: '해식 동굴', g: [2, 6], type: 'cave', exits: { n: 'sea', e: 'coast' },
    enc: { pool: ['serpent', 'seahound', 'dgolem', 'seaghost'], n: 10, lv: [30, 36], mul: 0.88 }, boss: { id: 'leviathan', at: [30, 39] },
    chests: [[8, 8, 'elixir', 1], [51, 36, 'potion_l', 2]] },
  mine: { n: '버려진 광산', g: [1, 3], type: 'mine', exits: { n: 'knights', w: 'battlefield', s: 'graveyard' },
    enc: { pool: ['bat', 'orc', 'ogolem', 'ghoul', 'troll'], rare: 'mimic', n: 10, lv: [12, 18] }, boss: { id: 'dynamo', at: [30, 39] },
    chests: [[8, 8, 'potion_m', 2], [51, 36, 'acc_atk', 1]],
    // 우주적 존재: 발레리 (북쪽 입구 — 기사들의 마을에서 내려오는 길. 그림자 없음) — 필드 스프라이트 c:12 (초상화와 같은 연보라 머리) ※ 임시
    npcs: [{ being: 'valerie', c: 12, x: 27, y: 3, dir: 'down', noShadow: true, props: [['rope', -2, 1, { w: 32, h: 22, block: true }]] }],
    // 발레리 2회차 대사의 경고와 맞춘 시각 소품 (함정 효과 없음)
    //   지름길(입구에서 곧장 남쪽 마수 쪽으로) 끝 — 천장이 약한 곳 / 우회로(서쪽 갱도) 중간 — 낡은 승강기
    marks: [{ fn: 'weakceil', x: 30, y: 33, w: 48, h: 40 }, { fn: 'elevator', x: 12, y: 24, w: 32, h: 44, block: [[0, 0], [1, 0]] }],
    quests: [{ id: 'knight', x: 44, y: 16, fn: 'supply', label: '기사단 보급품 상자' }] },   // 하급 기사의 의뢰 물건 ※ 임시

  // ===== 새 지역 (필드 · 던전형) =====
  cliff: { n: '바람 절벽', g: [0, 1], type: 'cliff', exits: { e: 'v_plaza' }, boss: { id: 'cliffknight', at: [10, 10] },
    enc: { pool: ['crow', 'seabird', 'icebird', 'peacock'], n: 12, lv: [24, 30] } },
  battlefield: { n: '옛 전장', g: [0, 3], type: 'battlefield', exits: { e: 'mine' }, boss: { id: 'ironmarshal', at: [12, 32] },
    enc: { pool: ['t_knight', 't_blade', 't_skoll', 'orc'], n: 12, lv: [28, 34], mul: 0.86 } },
  graveyard: { n: '잊힌 묘지', g: [1, 4], type: 'graveyard', exits: { n: 'mine', e: 'southdock' }, boss: { id: 'gravekeeper', at: [12, 32] },
    enc: { pool: ['t_wraith', 't_skull', 'seaghost', 't_monk'], n: 11, lv: [14, 20] },
    // 우주적 존재: 테오필 (북쪽 입구 근처, 오래된 묘비 앞. 그림자 없음) — 필드 스프라이트 c:22 (초상화와 같은 초록 머리) ※ 임시
    npcs: [{ being: 'theophile', c: 22, x: 25, y: 9, dir: 'up', noShadow: true, props: [['grave', 0, -1, { block: true, v: 1 }], ['bag', -1, 0, { block: true }]] }],
    quests: [{ id: 'sailor', x: 46, y: 22, fn: 'parcel', label: '흩어진 짐 꾸러미' }] },   // 부두 선원의 의뢰 물건 ※ 임시
  lake: { n: '달빛 호수', g: [3, 4], type: 'lake', exits: { w: 'southdock', s: 'resort' }, boss: { id: 'frostgiant', at: [46, 8] },
    enc: { pool: ['fishman', 'icebird', 'fairy', 'alraune'], n: 11, lv: [16, 22] },
    // 루시앙의 노점 (영혼의 보석). 서쪽 입구 길가 — 대본은 그대로, 노점 화면만 연결한다. 그림자 없음
    npcs: [{ being: 'lucien', shop: 'lucien_lake', c: 3, x: 6, y: 24, dir: 'right', noShadow: true, props: [['bag', -1, 0, { block: true }], ['pot', -1, 1, { block: true }]] }] },
  canyon: { n: '붉은 협곡', g: [4, 3], type: 'canyon', exits: { n: 'mushroom', e: 'desert' }, boss: { id: 'crimsonmane', at: [14, 34] },
    exitLock: { e: 'secondLoop' },
    enc: { pool: ['t_demon', 't_flame', 'tiger', 'troll'], n: 12, lv: [36, 42], mul: 0.8 } },
  desert: { n: '모래 폐도시', g: [5, 3], type: 'desert', exits: { n: 'wizards', w: 'canyon' }, boss: { id: 'sandgiant', at: [46, 34] },
    enc: { pool: ['mech', 'clock', 'priest', 't_garg'], n: 12, lv: [46, 52], mul: 0.68 } },
  coast: { n: '난파선 해안', g: [3, 6], type: 'coast', exits: { w: 'seacave', n: 'resort' }, boss: { id: 'hornbeast', at: [24, 38] },
    enc: { pool: ['crab', 'crystal', 'serpent', 'seabird'], n: 11, lv: [32, 38], mul: 0.82 } },
  observatory: { n: '별 관측소', g: [4, 0], type: 'observatory', exits: { s: 'opal' }, boss: { id: 'starqueen', at: [40, 8] },
    enc: { pool: ['eye', 't_jelly', 'sorc', 't_rift'], n: 10, lv: [38, 44], mul: 0.82 } },
  fortress: { n: '국경 요새', g: [6, 2], type: 'fortress', exits: { w: 'wizards', n: 'oldvillage' }, boss: { id: 'silverguard', at: [44, 34] },
    exitLock: { n: 'oldVillageUnlock' },
    enc: { pool: ['t_knight', 't_angel', 't_fallen', 't_beast'], n: 12, lv: [50, 56], mul: 0.68 } },
  oldvillage: { n: '잊혀진 옛 마을', g: [6, 1], type: 'oldvillage', exits: { s: 'fortress', w: 'ruins' }, boss: { id: 'oldchief', at: [44, 8] },
    enc: { pool: ['t_wraith', 't_monk', 'cskull', 't_skull'], n: 10, lv: [56, 60], mul: 0.68 } },
};
R.START_MAP = 'wildwind';
// enc.lv  : 지역 마물 레벨 구간 [최소, 최대] (마수 레벨 = 구간 끝)
// enc.mul : 지역 배율 — 플레이어(레벨당 선형)와 마물(레벨 제곱) 격차를 지역별로만 보정한다 (Phase 3 비교표 기준)

// ---------- 회차 해금 (WS.Progression.check 형식) ----------
// exitLock: { 방향: 조건 } — 조건을 만족하지 않으면 그 출구로 나갈 수 없다 ("아직 길이 열리지 않았다.")
WS.CONDITIONS.oldVillageUnlock = { type: 'endingSeen', value: 'ending_unlock_oldvillage' };
// 잊혀진 옛 마을을 여는 엔딩 — 어떤 엔딩인지는 미정. ID 만 예약한다. (엔딩 자체는 구현하지 않음)
WS.ENDINGS.ending_unlock_oldvillage = { name: '(미정)' };

// ---------- 숨겨진 아이템 (Phase 3) ----------
// 지도 곳곳의 수풀 · 상자 · 항아리 · 나무 밑동 · 남겨진 가방 · 부서진 수레 · 쓰러진 갑옷 · 통에서 얻는다.
// 반짝임으로 보이고, 한 번 얻으면 사라진다. 얻은 기록은 이번 회차 상태(run.rpg.found)에 남는다 (새 회차에서 다시 생긴다).
//   R.HIDDEN[지역] = [[아이템, 개수], ...]  → 위치는 지도 생성 때 고정 시드로 빈터에 정해진다 (매번 같은 자리)
//   R.MAPS[지역].hidden = [[x, y, '종류', 아이템, 개수], ...]  → 위치를 직접 지정할 때 (기존 chests 처럼)
// 강한 지역일수록 좋은 아이템. 1회차에 가기 어려운 지역(오팔 강변 이후)은 그 지역 레벨에서 의미 있는 것.
// 2부: 레벨 14 이상 지역(1회차 지역 제외)의 목록 끝에 영혼의 보석을 덧붙였다 (강한 지역일수록 많이) ※ 임시
R.HIDDEN = {
  // 마을 (가벼운 것)
  wildwind:  [['bread', 2], ['potion_s', 1], ['antidote', 1]],
  knights:   [['potion_s', 2], ['bread', 1], ['ether', 1]],
  v_city:    [['potion_m', 1], ['ether', 1], ['bread', 2]],
  v_plaza:   [['potion_s', 2], ['antidote', 1], ['smoke', 1]],
  rose:      [['potion_s', 1], ['antidote', 2], ['ether', 1]],
  southdock: [['meat', 2], ['potion_m', 1], ['antidote', 1]],
  resort:    [['potion_m', 2], ['ether', 1]],
  wizards:   [['ether', 2], ['potion_m', 1]],
  v_castle:  [['potion_m', 1], ['ether', 1]],
  // Lv1~8
  silent:    [['potion_s', 2], ['bread', 2], ['antidote', 1], ['potion_s', 1], ['ether', 1], ['bread', 1], ['potion_s', 2], ['m_feather', 2], ['acc_luck', 1], ['potion_m', 1]],
  // Lv10~20
  mushroom:  [['potion_m', 1], ['antidote', 2], ['ether', 1], ['potion_m', 2], ['bomb', 1], ['m_shroom', 3], ['acc_steel', 1], ['potion_s', 3], ['ether', 1], ['moon', 1], ['potion_m', 1]],
  mine:      [['potion_m', 2], ['bomb', 2], ['moon', 1], ['m_ore', 2], ['acc_def', 1], ['m_gold', 1], ['ether', 2], ['potion_m', 2]],   // 통로가 좁아 8곳
  graveyard: [['potion_m', 2], ['ether', 2], ['antidote', 2], ['bomb', 1], ['acc_hp', 1], ['potion_m', 1], ['m_soul', 2], ['ether', 1], ['moon', 1], ['potion_l', 1]],
  // Lv16~28
  lake:      [['potion_m', 2], ['ether', 2], ['potion_l', 1], ['bomb2', 1], ['acc_mp', 1], ['m_scale', 2], ['ether', 1], ['moon', 1], ['potion_m', 2], ['potion_l', 1], ['gem_valor', 1]],
  opal:      [['potion_l', 1], ['ether', 2], ['bomb2', 1], ['acc_spd', 1], ['potion_m', 3], ['m_scale', 3], ['ether_l', 1], ['moon', 1], ['potion_l', 1], ['acc_atk', 1], ['gem_endure', 1]],
  sea:       [['potion_l', 2], ['ether_l', 1], ['bomb2', 2], ['m_shell', 3], ['acc_pearl', 1], ['potion_m', 2], ['moon', 1], ['ether', 2], ['gem_resolve', 1]],
  // Lv24~38
  cliff:     [['potion_l', 2], ['ether_l', 1], ['bomb2', 2], ['acc_spd', 1], ['potion_l', 1], ['m_feather', 3], ['moon', 1], ['ether_l', 1], ['acc_knight', 1], ['potion_l', 2], ['gem_wisdom', 1]],
  battlefield: [['potion_l', 2], ['acc_knight', 1], ['bomb2', 2], ['ether_l', 1], ['m_horn', 3], ['potion_l', 2], ['moon', 1], ['acc_atk', 1], ['elixir', 1], ['ether_l', 1], ['potion_l', 1], ['gem_endure', 1], ['gem_valor', 1]],
  seacave:   [['potion_l', 2], ['ether_l', 2], ['bomb2', 2], ['m_ink', 2], ['acc_pearl', 1], ['moon', 1], ['elixir', 1], ['potion_l', 2], ['gem_clear', 1], ['gem_swift', 1]],
  coast:     [['potion_l', 3], ['ether_l', 1], ['bomb2', 2], ['m_shell', 3], ['acc_hp', 1], ['moon', 1], ['elixir', 1], ['ether_l', 1], ['potion_l', 2], ['acc_mag', 1], ['gem_resolve', 1], ['gem_wisdom', 1]],
  // Lv36~46
  canyon:    [['potion_l', 3], ['ether_l', 2], ['bomb2', 3], ['elixir', 1], ['acc_sage', 1], ['moon', 1], ['m_horn', 3], ['potion_l', 2], ['ether_l', 1], ['acc_gold', 1], ['gem_clear', 1], ['gem_swift', 1]],
  observatory: [['ether_l', 3], ['potion_l', 2], ['elixir', 1], ['acc_sage', 1], ['moon', 2], ['bomb2', 2], ['potion_l', 2], ['m_gear', 2], ['ether_l', 1], ['gem_endure', 1], ['gem_valor', 1]],
  ruins:     [['potion_l', 3], ['ether_l', 2], ['elixir', 1], ['m_gear', 3], ['moon', 1], ['bomb2', 3], ['acc_gold', 1], ['potion_l', 2], ['ether_l', 1], ['elixir', 1], ['gem_resolve', 1], ['gem_wisdom', 1], ['gem_clear', 1]],
  // Lv46~60 (2회차 이후)
  desert:    [['elixir', 1], ['potion_l', 3], ['ether_l', 2], ['m_gold', 2], ['bomb2', 3], ['moon', 2], ['acc_dragon', 1], ['potion_l', 3], ['elixir', 1], ['ether_l', 2], ['gem_swift', 1], ['gem_endure', 1], ['gem_valor', 1]],
  fortress:  [['elixir', 2], ['potion_l', 3], ['ether_l', 3], ['acc_knight', 2], ['bomb2', 3], ['moon', 2], ['acc_dragon', 1], ['potion_l', 3], ['elixir', 1], ['gem_resolve', 1], ['gem_wisdom', 1], ['gem_clear', 1]],
  oldvillage:[['elixir', 2], ['potion_l', 4], ['ether_l', 3], ['moon', 2], ['bomb2', 3], ['relic_moon', 1], ['potion_l', 3], ['elixir', 1], ['ether_l', 2], ['gem_swift', 1], ['gem_endure', 1], ['gem_valor', 1]],
};
// 지역 종류별로 어떤 것에 숨겨져 있는지 (잔인한 표현 없이)
R.HIDDEN_KINDS = {
  town: ['barrel', 'pot', 'crate'], city: ['barrel', 'pot', 'crate'], beachtown: ['barrel', 'crate', 'pot'], castle: ['pot', 'crate'],
  forest: ['bush', 'stump', 'bag'], mush: ['bush', 'stump', 'bag'], river: ['bush', 'stump', 'bag'], lake: ['bush', 'bag', 'stump'],
  mine: ['crate', 'cart', 'bag', 'pot'], cave: ['crate', 'bag', 'pot'], sea: ['crate', 'barrel', 'bag'], coast: ['crate', 'barrel', 'bag'],
  graveyard: ['pot', 'bag', 'bush'], battlefield: ['armor', 'cart', 'bag'], cliff: ['bag', 'stump', 'bush'], canyon: ['pot', 'bag', 'cart'],
  desert: ['pot', 'bag', 'cart'], observatory: ['pot', 'bag', 'crate'], ruins: ['pot', 'bag', 'bush'], fortress: ['crate', 'armor', 'barrel'],
  oldvillage: ['cart', 'pot', 'bag', 'barrel'],
};
R.HIDDEN_LABEL = {
  bush: '수풀 속', stump: '나무 밑동 아래', bag: '남겨진 가방 안', crate: '상자 안', barrel: '통 안', pot: '항아리 안',
  cart: '부서진 수레', armor: '쓰러진 갑옷 곁',
};

// 건물 그림의 문 위치 (그림 너비에 대한 비율)
R.DOOR_FRAC = { House_Hay_1: 0.48, House_Hay_2: 0.70, House_Hay_3: 0.73, House_Hay_4_Purple: 0.73 };

// Super Retro World 캐릭터 번호(1~32) → 시트 · 위치 (시트 하나에 8명: 4열 x 2줄, 한 명 = 3프레임 x 4방향, 16x20)
R.npcSheet = c => { const i = c - 1; return { sheet: 'npc' + (Math.floor(i / 8) + 1), col: i % 4, row: Math.floor((i % 8) / 4) }; };

// ---------- 지역 키 NPC 5명 (Phase 4-C) ----------
// ※ 임시: 대사 · 의뢰 · 보상은 모두 임시로 쓴 것. 이름은 정하지 않고 직함으로만 부른다. 회차와 상관없이 같은 대사.
// 의뢰 흐름: 대화 → 수락(플래그 req_<id>_accepted) → 조건 달성(req_<id>_cond) → 보상 1개(req_<id>_done)
//   조건: 지정한 지역의 의뢰 물건(R.MAPS[..].quests)을 조사하면 달성. 서기관만 「하급 기사에게 서한 전달」.
// 섹션: offer(처음) · reoffer(거절한 뒤 다시) · waiting(진행 중) · reward(보고 — 보상은 코드가 준다) · after(완료 후)
// 교차 단서(우주적 존재의 위장 신분과 어긋나는 한 줄)는 서기관 · 견습 마법사 · 잡화점 주인에게 한 줄씩만 있다.
R.REQUESTS = {
  hunter: {
    title: '숲 사냥꾼', boss: 'forestlord', reward: ['potion_m', 3], find: '떨어진 화살통을 찾았다. 숲 사냥꾼에게 알려 주자.',
    look: '오래된 화살통이 떨어져 있다.',
    script: `=== offer
// ※ 임시
[숲 사냥꾼]
“……숲으로 가나.”
“동료 하나가 침묵 숲에 들어간 뒤로 돌아오지 않았다. 흔적이라도 보이면 알려 다오.”
@choice req_hunter
- 찾아볼게요 -> yes
- 지금은 어려워요 -> no
@endchoice
@label yes
@set req_hunter_accepted
[숲 사냥꾼]
“……고맙다. 숲 동쪽 깊은 곳까지 갔을 거다. 숲지기가 있는 쪽은 조심해라.”
@goto end
@label no
[숲 사냥꾼]
“……그래. 무리할 것 없다.”
@label end
@set req_hunter_offered

=== reoffer
// ※ 임시
[숲 사냥꾼]
“……마음이 바뀌었나.”
@choice req_hunter
- 찾아볼게요 -> yes
- 아직이요 -> no
@endchoice
@label yes
@set req_hunter_accepted
[숲 사냥꾼]
“……숲 동쪽 깊은 곳이다. 부탁한다.”
@label no

=== waiting
// ※ 임시
[숲 사냥꾼]
“……서두르지 마라. 숲은 급한 사람부터 삼킨다.”

=== reward
// ※ 임시
[숲 사냥꾼]
“……그 녀석 화살통이군.”
“살아 있다면 언젠가 돌아오겠지. ……이건 받아 둬라.”

=== after
// ※ 임시
[숲 사냥꾼]
“……숲지기를 쓰러뜨리면 숲도 조금은 조용해질 거다.”
`,
  },
  knight: {
    title: '하급 기사', boss: 'dynamo', reward: ['ether', 2], find: '기사단 보급품 상자를 찾았다. 하급 기사에게 알려 주자.',
    look: '기사단 문장이 찍힌 상자가 있다.',
    script: `=== offer
// ※ 임시
[하급 기사]
“앗, 혹시 광산 쪽으로 가십니까? 저는 기사단의 하급 기사입니다!”
“광산에 들어간 선배님들이 아직 돌아오지 않으셨습니다. 보급품이라도 남아 있다면 선배님들이 버티실 수 있을 텐데……”
“안쪽에 기사단 보급품 상자가 남아 있는지 봐 주실 수 있겠습니까?”
@choice req_knight
- 찾아볼게요 -> yes
- 지금은 어려워요 -> no
@endchoice
@label yes
@set req_knight_accepted
[하급 기사]
“감사합니다! 광산 깊은 곳에는 다이너모라는 마수가 있다고 하니, 부디 조심하십시오!”
@goto end
@label no
[하급 기사]
“아, 아닙니다! 무리한 부탁이었습니다!”
@label end
@set req_knight_offered

=== reoffer
// ※ 임시
[하급 기사]
“혹시…… 광산의 보급품 상자, 찾아봐 주실 수 있겠습니까?”
@choice req_knight
- 찾아볼게요 -> yes
- 아직이요 -> no
@endchoice
@label yes
@set req_knight_accepted
[하급 기사]
“감사합니다! 저도 언젠가는 직접……!”
@label no

=== waiting
// ※ 임시
[하급 기사]
“저도 훈련만 끝나면 바로 광산으로 달려갈 겁니다!”

=== reward
// ※ 임시
[하급 기사]
“보급품 상자가 무사했군요! 선배님들이 버티실 수 있겠습니다!”
“이건 제 몫으로 받은 보급품입니다. 받아 주십시오!”

=== after
// ※ 임시
[하급 기사]
“언젠가 저도 다이너모 같은 마수와 맞설 수 있을 만큼 강해지겠습니다!”

=== deliver
// ※ 임시: 왕실 서기관의 서한 전달
[하급 기사]
“와, 왕실 서한입니까?! 화, 확인했습니다! 수령 확인은 제가 하겠습니다!”
`,
  },
  sailor: {
    title: '부두 선원', boss: 'gravekeeper', reward: ['bomb', 2], find: '흩어진 짐 꾸러미를 찾았다. 부두 선원에게 알려 주자.',
    look: '끈이 풀린 짐 꾸러미가 흩어져 있다.',
    script: `=== offer
// ※ 임시
[부두 선원]
“어이, 거기! 그래, 그 화려한 옷 입은 아가씨!”
“묘지 쪽 길로 보낸 짐이 자꾸 없어진단 말이지. 마물 짓인지 뭔지, 한번 봐 줄 수 있겠어?”
@choice req_sailor
- 알아볼게요 -> yes
- 지금은 어려워요 -> no
@endchoice
@label yes
@set req_sailor_accepted
[부두 선원]
“하하, 시원시원하네! 묘지 동쪽 길목 어딘가에 떨어져 있을 거야.”
@goto end
@label no
[부두 선원]
“하하, 그렇지! 묘지는 누구라도 꺼림칙하지!”
@label end
@set req_sailor_offered

=== reoffer
// ※ 임시
[부두 선원]
“어이, 묘지 쪽 짐 말이야. 생각 좀 해 봤어?”
@choice req_sailor
- 알아볼게요 -> yes
- 아직이요 -> no
@endchoice
@label yes
@set req_sailor_accepted
[부두 선원]
“좋아! 묘지 동쪽 길목이야!”
@label no

=== waiting
// ※ 임시
[부두 선원]
“묘지 동쪽 길목이야! 바닷바람보다 으스스한 데지, 하하!”

=== reward
// ※ 임시
[부두 선원]
“오, 이거야 이거! 흩어지긴 했어도 반은 건졌네!”
“고마워! 이건 우리 배에서 쓰던 건데, 받아 둬!”

=== after
// ※ 임시
[부두 선원]
“묘지 안쪽엔 무덤을 지키는 큰 놈이 있다더라. 조심하라고!”
`,
  },
  apprentice: {
    title: '견습 마법사', boss: 'mossgiant', reward: ['ether', 2], find: '빛나는 포자를 조금 담았다. 견습 마법사에게 가져다주자.',
    look: '버섯 사이에서 희미하게 빛나는 포자가 떠다닌다.',
    script: `=== offer
// ※ 임시
[견습 마법사]
“저, 저기요……! 버섯 숲에서 오셨어요?”
“버섯 숲에 이상한 일이 생긴다는 소문이 있어서 모으고 있거든요. 밤도 아닌데 포자가 빛난대요.”
“그러고 보니, 묘비를 기록하러 다니는 학자가 있다던데…… 학회에서는 그런 분을 본 적이 없어요.”
“아, 아무튼! 혹시 빛나는 포자를 보시면 조금만 가져다주실래요……?”
@choice req_apprentice
- 가져다줄게요 -> yes
- 지금은 어려워요 -> no
@endchoice
@label yes
@set req_apprentice_accepted
[견습 마법사]
“정말요?! 이끼 거인이 있는 남쪽은 위험하니까, 동쪽 언저리만 봐 주세요!”
@goto end
@label no
[견습 마법사]
“그, 그렇죠……. 죄송해요, 갑자기.”
@label end
@set req_apprentice_offered

=== reoffer
// ※ 임시
[견습 마법사]
“저, 빛나는 포자 얘기…… 혹시 생각해 보셨어요?”
@choice req_apprentice
- 가져다줄게요 -> yes
- 아직이요 -> no
@endchoice
@label yes
@set req_apprentice_accepted
[견습 마법사]
“고, 고맙습니다! 버섯 숲 동쪽 언저리예요!”
@label no

=== waiting
// ※ 임시
[견습 마법사]
“포자는 버섯 숲 동쪽 언저리에서 봤다는 얘기가 많았어요.”

=== reward
// ※ 임시
[견습 마법사]
“와아……! 정말 빛나요! 소문이 진짜였네요!”
“이, 이거 받으세요! 제가 연습으로 만든 거지만 효과는 확실해요!”

=== after
// ※ 임시
[견습 마법사]
“포자는 제가 잘 조사해 볼게요. 무, 무섭지만요.”
`,
  },
  scribe: {
    title: '왕실 서기관', boss: null, reward: ['potion_m', 2], find: null, look: null,
    script: `=== offer
// ※ 임시
[왕실 서기관]
“왕실 서기관입니다. 지침에 따라 민간 협조를 요청드립니다.”
“이 서한을 기사들의 마을 기사단에 전달해 주십시오. 수령 확인은 하급 기사에게 받으시면 됩니다.”
“덧붙여, 광산 관련 보고는 아직 접수 중입니다. 최근 광산에 조사관을 보냈다는 기록은 없습니다.”
@choice req_scribe
- 전달할게요 -> yes
- 지금은 어려워요 -> no
@endchoice
@label yes
@set req_scribe_accepted
[왕실 서기관]
“접수되었습니다. 전달이 확인되면 규정에 따라 사례하겠습니다.”
@goto end
@label no
[왕실 서기관]
“알겠습니다. 거절 의사도 기록해 두겠습니다.”
@label end
@set req_scribe_offered

=== reoffer
// ※ 임시
[왕실 서기관]
“서한 전달 건, 다시 검토하시겠습니까?”
@choice req_scribe
- 전달할게요 -> yes
- 아직이요 -> no
@endchoice
@label yes
@set req_scribe_accepted
[왕실 서기관]
“접수되었습니다. 기사들의 마을의 하급 기사에게 전달해 주십시오.”
@label no

=== waiting
// ※ 임시
[왕실 서기관]
“서한은 기사들의 마을의 하급 기사에게 전달해 주십시오. 지침입니다.”

=== reward
// ※ 임시
[왕실 서기관]
“수령 확인되었습니다. 규정에 따른 사례입니다.”

=== after
// ※ 임시
[왕실 서기관]
“왕국은 정해진 절차대로 움직이고 있습니다. 협조에 감사드립니다.”
`,
  },
};

// 상점 주인의 인사 (교차 단서) — 처음 들를 때 한 번 ※ 임시
R.SHOP_TALK = {
  merchant: `// ※ 임시
[잡화점 주인]
“어서 오세요. 요즘은 손님이 줄어서 큰일이에요.”
“길에서 장사한다는 행상인이 있다던데, 어느 상단에도 속해 있지 않다더군요. 그런 장사가 될까 몰라요.”`,
};

// ---------- 2부: 상태이상 · 저항 ----------
// 화상 · 약화 · 침묵은 주인공과 마물 모두, 수면(적)은 마물에게. 전투가 끝나면 모두 사라진다 (독은 기존대로 필드에도 남는다).
R.STATUS = {
  burn:    { n: '화상', turns: 3, pct: 0.05, bossPct: 0.02 },   // 턴 끝마다 최대 체력의 5% (마수 2%)   ※ 임시
  weak:    { n: '약화', turns: 3, amount: 0.25 },                // 공격 · 마력 -25%   ※ 임시
  silence: { n: '침묵', turns: 3 },                              // 능력(스킬) 사용 불가. 일반 공격 · 아이템 · 해방은 가능
  sleep:   { n: '수면', turns: 2 },                              // (적) 행동 불가. 피해를 받으면 바로 깨어난다
  slow:    { n: '둔화', turns: 3 },
};
// 상태 부여 성공률에 곱하는 배율 — 새 상태이상과 기존 빙결 · 둔화 모두. 약점 속성이면 +10%p
R.RESIST = { normal: 1, boss: 0.4, bossSleepSilence: 0.3, weakBonus: 0.1 };   // ※ 임시
// 영혼의 보석: 이번 회차에 루시앙 노점에서 살 수 있는 개수 (필드에서 얻은 보석은 세지 않는다)
R.GEM_BUY_LIMIT = 6;   // ※ 임시
R.GEMS = ['gem_valor', 'gem_wisdom', 'gem_resolve', 'gem_endure', 'gem_clear', 'gem_swift'];

// ---------- 흰 공간 데이터와 합치기 ----------
(function merge() {
  // 능력치 상향(1부): 직업 기본 능력치 · 흰 공간에서 받은 첫 능력의 마나 소모 (원본 HTML 은 그대로 두고 여기서 덮어쓴다)
  for (const id in R.BASE_STATS) if (WS.BALANCE.STATS[id]) Object.assign(WS.BALANCE.STATS[id], R.BASE_STATS[id]);
  for (const id in WS.BALANCE.ABILITIES) {
    const ab = WS.BALANCE.ABILITIES[id];
    if (!R.ABILITIES[id] && typeof ab.cost === 'number' && !ab._scaled) { ab.cost = Math.round(ab.cost * R.STAT_SCALE.mp); ab._scaled = true; }
  }
  // 능력
  for (const id in R.ABILITIES) WS.BALANCE.ABILITIES[id] = R.ABILITIES[id];
  for (const id in R.BASE_ABILITY_PATCH) if (WS.BALANCE.ABILITIES[id]) Object.assign(WS.BALANCE.ABILITIES[id], R.BASE_ABILITY_PATCH[id]);
  // 아이템: WS.ITEMS 형식(name · desc · unique)으로 등록 → 상태창 소지품 목록에도 그대로 보인다
  for (const id in R.ITEMS) {
    const it = R.ITEMS[id];
    WS.ITEMS[id] = Object.assign({ name: it.n, desc: it.d, unique: false }, it);
  }
})();
})();
