/*
 * RPG 핵심 — 그림 불러오기, 게임 상태(run.rpg), 능력치 계산, 소지품 · 장비, 시간, 저장
 * ------------------------------------------------------------
 * 흰 공간의 game.state(run) 에 run.rpg 를 붙여서 쓴다. 장면이 바뀌어도 그대로 이어진다.
 *   run.player.stats   — 지금 능력치(장비 · 레벨 포함)로 늘 갱신 → 기존 상태창에도 맞는 숫자가 보인다
 *   run.player.abilities — 각성 때 받은 능력 + 레벨업으로 배운 능력
 *   run.inventory      — 손수건 같은 이야기 아이템 + RPG 아이템을 함께 담는다
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;

  // ---------------- 그림 ----------------
  R.img = {};
  const MON_FILES = [...new Set(Object.values(R.MON).map(m => m.s[0]))];
  R.ASSETS = {
    ground: 'tiles/ground.png', road: 'tiles/road.png', water: 'tiles/water.png',
    npc1: 'chars/npc1.png', npc2: 'chars/npc2.png', npc3: 'chars/npc3.png', npc4: 'chars/npc4.png',
    chests: 'obj/chests.png', icons32: 'ui/icons32.png', flowers: 'obj/Flowers_Red.png',
    flowersW: 'obj/Flowers_White.png', campfire: 'obj/Animation_Campfire.png',
  };
  ['Tree_Emerald_1', 'Tree_Emerald_2', 'Tree_Emerald_3', 'Tree_Emerald_4', 'Bush_Emerald_1', 'Bush_Emerald_2', 'Bush_Emerald_3', 'Bush_Emerald_4',
    'Bush_Emerald_5', 'Bush_Emerald_6', 'House_Hay_1', 'House_Hay_2', 'House_Hay_3', 'House_Hay_4_Purple', 'Well_Hay_1', 'CityWall_Gate_1',
    'Banner_Stick_1_Purple', 'Barrel_Small_Empty', 'Basket_Empty', 'Bench_1', 'Bench_3', 'BulletinBoard_1', 'Chopped_Tree_1', 'Crate_Large_Empty',
    'Crate_Medium_Closed', 'Crate_Water_1', 'Fireplace_1', 'HayStack_2', 'LampPost_3', 'Plant_2', 'Sack_3', 'Sign_1', 'Sign_2', 'Table_Medium_1',
    'Rock_Brown_1', 'Rock_Brown_2', 'Rock_Brown_4', 'Rock_Brown_6', 'Rock_Brown_9'].forEach(n => { R.ASSETS[n] = 'obj/' + n + '.png'; });
  MON_FILES.forEach(n => { R.ASSETS['mon:' + n] = 'mon/' + n + '.png'; });

  R.loadAssets = function () {
    if (R._loading) return R._loading;
    const jobs = Object.entries(R.ASSETS).map(([k, path]) => new Promise(res => {
      const im = new Image();
      im.onload = () => { R.img[k] = im; res(); };
      im.onerror = () => { console.warn('[rpg] 그림을 불러오지 못했습니다:', path); res(); };
      im.src = R.ASSET_BASE + path;
    }));
    R._loading = Promise.all(jobs);
    return R._loading;
  };

  /** DOM 아이콘 (32x32 시트) */
  R.icon = function (id, size = 32, extra = '') {
    const col = id % 16, row = Math.floor(id / 16), k = size / 32;
    return `<i class="rpg-icon ${extra}" style="width:${size}px;height:${size}px;background-size:${512 * k}px auto;background-position:-${col * size}px -${row * size}px"></i>`;
  };

  // ---------------- 상태 ----------------
  R.newState = function (run) {
    const home = R.MAPS.wildwind.buildings[0].door;
    return {
      v: 1, lv: 1, exp: 0, points: 0,
      alloc: { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0 },
      hp: 0, mp: 0, gauge: R.GAUGE.max, poison: 0,
      day: 1, min: R.TIME.dayStart, gold: 120,
      equip: { wand: 'wand_0', acc: Array(R.ACC_SLOTS).fill(null), relic: null },
      map: 'wildwind', x: home[0], y: home[1] + 1, dir: 'down',
      bed: { map: 'wildwind', x: home[0], y: home[1], scene: 'heroRoom' },   // 집 = 주인공의 방
      bosses: {}, chests: {}, found: {}, visited: { wildwind: true },   // found: 숨겨진 아이템 획득 기록 (이번 회차)
      kills: 0, battles: 0, defeats: 0, tower: { max: 0 },
      gems: { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0 },   // 영혼의 보석으로 오른 능력치 (다음 회차로 이월된다)
      gemBought: 0,     // 이번 회차에 노점에서 산 보석 수 (회차마다 새로)
      repel: 0,         // 마물 쫓는 향 — 남은 걸음 수
    };
  };

  /** run.rpg 가 없으면 만든다 (흰 공간 → 방 → 바깥으로 처음 나올 때) */
  R.ensure = function (run) {
    if (run.rpg) {
      run.rpg.found = run.rpg.found || {};
      // 예전 기록에는 없는 필드 (2부)
      run.rpg.gems = Object.assign({ hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0 }, run.rpg.gems || {});
      run.rpg.gemBought = run.rpg.gemBought || 0;
      run.rpg.repel = run.rpg.repel || 0;
      R.refreshAbilities(run);
      R.sync(run); return run.rpg;
    }
    run.rpg = R.newState(run);
    const add = (id, n) => { run.inventory[id] = (run.inventory[id] || 0) + n; };
    const carry = R.carryFor(run);
    if (carry) R.applyCarry(run, carry);          // 2회차 이후: 이전 회차 스펙 그대로
    else { add('potion_s', 3); add('bread', 2); add('wand_0', 1); }
    R.learnUpTo(run, false);
    const st = R.stats(run, 'job');
    run.rpg.hp = st.hp; run.rpg.mp = st.mp;
    R.sync(run);
    return run.rpg;
  };

  R.job = run => WS.getJob(run.player.jobId) || WS.JOBS[0];

  // ---------------- 다회차 이월 ----------------
  // 새 회차가 시작되면 이전 회차의 레벨 · 경험치 · 스탯 포인트(분배 포함) · 영혼의 보석 · 장비 · 소지품(RPG 아이템) · 골드를 그대로 넘긴다.
  // 새로 시작하는 것: 날짜 · 변신 게이지 · 마수 처치 · 상자 · 숨겨진 아이템 · 방문 지역 · 끝없는 탑 기록 · 보석 구매 횟수 · 이야기 진행.
  // 능력은 직업 기준이라 넘기지 않고, 고른 직업으로 지금 레벨까지 다시 배운다. (같은 직업이면 똑같이 돌아온다)
  // 맡겨 두는 곳: 회차 메타(whitespace.meta.v1).carry — 슬롯과 따로 있어 불러오기 · 삭제로 바뀌지 않는다.
  R.makeCarry = function (run) {
    const rp = run.rpg, inv = {};
    for (const id in run.inventory) if (R.ITEMS[id] && run.inventory[id] > 0) inv[id] = run.inventory[id];
    return {
      fromLoop: run.loop || 1, jobId: run.player.jobId,
      lv: rp.lv, exp: rp.exp, points: rp.points, alloc: Object.assign({}, rp.alloc),
      gems: Object.assign({}, rp.gems || {}), gold: rp.gold,
      equip: JSON.parse(JSON.stringify(rp.equip)), inventory: inv,
    };
  };
  /** 이 회차가 받을 이월 기록 (없으면 null). 장면 테스트용 회차에는 적용하지 않는다 */
  R.carryFor = function (run) {
    if (!run || run.flags.test_mode) return null;
    const meta = (WS.game && WS.game.meta) || WS.Progression.loadMeta();
    const c = meta && meta.carry;
    return c && (run.loop || 1) > (c.fromLoop || 0) ? c : null;
  };
  R.applyCarry = function (run, c) {
    const rp = run.rpg;
    Object.assign(rp, {
      lv: Math.min(R.MAX_LEVEL, c.lv || 1), exp: c.exp || 0, points: c.points || 0, gold: c.gold || 0,
      alloc: Object.assign({ hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0 }, c.alloc || {}),
      gems: Object.assign({ hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0 }, c.gems || {}),
    });
    for (const id in c.inventory || {}) if (R.ITEMS[id]) run.inventory[id] = c.inventory[id];
    if (!Object.keys(run.inventory).some(id => R.ITEMS[id] && R.ITEMS[id].kind === 'wand')) run.inventory.wand_0 = 1;
    // 장비는 가진 것만 다시 낀다
    const e = c.equip || {}, has = id => id && R.ITEMS[id] && (run.inventory[id] || 0) > 0;
    rp.equip.wand = has(e.wand) ? e.wand : Object.keys(run.inventory).find(id => R.ITEMS[id] && R.ITEMS[id].kind === 'wand');
    rp.equip.acc = Array(R.ACC_SLOTS).fill(null);
    const used = {};
    (e.acc || []).forEach((id, i) => { if (i < R.ACC_SLOTS && has(id) && (used[id] || 0) < run.inventory[id]) { rp.equip.acc[i] = id; used[id] = (used[id] || 0) + 1; } });
    rp.equip.relic = has(e.relic) ? e.relic : null;
    rp.carried = c.fromLoop;     // 몇 회차에서 넘어왔는지 (확인용)
  };

  /** 배운 능력은 사본으로 저장된다 → 불러올 때 지금 정의(마나 소모 · 위력 등)로 다시 맞춘다 (능력치 상향 전 기록 대응) */
  R.refreshAbilities = function (run) {
    const list = run.player && run.player.abilities;
    if (!Array.isArray(list)) return;
    list.forEach((a, i) => {
      const def = a && WS.BALANCE.ABILITIES[a.id];
      if (def) list[i] = Object.assign(JSON.parse(JSON.stringify(def)), { id: a.id, level: a.level || 1 });
    });
  };

  /** 장비 효과 합계 */
  R.equipBonus = function (run) {
    const e = run.rpg.equip, out = { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0, crit: 0, regen: 0, mpRegen: 0, gold: 0, drop: 0, gaugeCost: 0, allPct: 0, drain: 0 };
    const flags = {};
    const add = id => {
      const it = id && R.ITEMS[id]; if (!it) return;
      for (const k in out) if (typeof it[k] === 'number') out[k] += it[k];
      for (const k of ['poisonImmune', 'firstStrike', 'el']) if (it[k]) flags[k] = it[k];
    };
    add(e.wand); e.acc.forEach(add); add(e.relic);
    return { sum: out, flags };
  };

  /**
   * 능력치 계산
   *  form: 'job' = 변신 상태, 'human' = 변신하지 못한 평상복 상태
   */
  R.stats = function (run, form = 'job') {
    const rp = run.rpg, base = WS.BALANCE.STATS[run.player.jobId] || WS.BALANCE.STATS.morganite;
    const lv = rp.lv - 1, out = {};
    for (const k of ['hp', 'mp', 'atk', 'mag', 'def', 'spd']) {
      out[k] = base[k] * (1 + R.GROWTH[k] * lv) + (rp.alloc[k] || 0) * R.POINT_VALUE[k] + ((rp.gems || {})[k] || 0);   // + 영혼의 보석
    }
    // 레벨이 낮은 쪽 능력치도 조금씩은 자란다 (공격 6 같은 낮은 값이 영영 쓸모없지 않도록)
    out.atk += lv * R.LEVEL_BONUS.atk; out.mag += lv * R.LEVEL_BONUS.mag; out.def += lv * R.LEVEL_BONUS.def;   // 옛 0.8 · 0.8 · 0.6 (×6)
    const { sum, flags } = R.equipBonus(run);
    for (const k of ['hp', 'mp', 'atk', 'mag', 'def', 'spd']) out[k] += sum[k];
    if (sum.allPct) for (const k of ['hp', 'mp', 'atk', 'mag', 'def', 'spd']) out[k] *= 1 + sum.allPct;
    if (form === 'human') for (const k of ['atk', 'mag', 'def', 'spd']) out[k] *= R.GAUGE.humanMul;
    for (const k in out) out[k] = Math.max(1, Math.round(out[k]));
    out.crit = 5 + sum.crit;
    out.regen = sum.regen; out.mpRegen = sum.mpRegen; out.gold = sum.gold; out.drop = sum.drop; out.drain = sum.drain;
    out.gaugeCost = sum.gaugeCost; out.flags = flags;
    return out;
  };

  /** 기존 흰 공간 상태창 · 다른 장면이 보는 run.player.stats 를 지금 수치로 맞춘다 */
  R.sync = function (run) {
    const st = R.stats(run, 'job');
    run.player.stats = { hp: st.hp, mp: st.mp, atk: st.atk, mag: st.mag, def: st.def, spd: st.spd };
    run.rpg.hp = Math.min(run.rpg.hp, st.hp);
    run.rpg.mp = Math.min(run.rpg.mp, st.mp);
  };

  R.gaugeCost = function (run, boss) {
    const st = R.stats(run);
    return Math.max(1, (boss ? R.GAUGE.bossCost : R.GAUGE.battleCost) + st.gaugeCost);
  };

  // ---------------- 성장 ----------------
  /** 지금 레벨까지 배울 수 있는 능력을 등록. 새로 배운 능력 이름 목록을 돌려준다 */
  R.learnUpTo = function (run, announce = true) {
    const list = R.LEARN[run.player.jobId] || [];
    const got = [];
    for (const [lv, id] of list) {
      if (run.rpg.lv < lv || run.player.abilities.some(a => a.id === id)) continue;
      const def = WS.BALANCE.ABILITIES[id];
      run.player.abilities.push(Object.assign({ id, level: 1 }, JSON.parse(JSON.stringify(def))));
      got.push(def.name);
    }
    return got;
  };

  /** 경험치 획득 → 레벨업 결과 목록 */
  R.gainExp = function (run, n) {
    const rp = run.rpg, ups = [];
    rp.exp += n;
    while (rp.lv < R.MAX_LEVEL && rp.exp >= R.expToNext(rp.lv)) {
      rp.exp -= R.expToNext(rp.lv);
      const before = R.stats(run);
      rp.lv++;
      rp.points += R.POINTS_PER_LEVEL;
      const after = R.stats(run);
      rp.hp += after.hp - before.hp; rp.mp += after.mp - before.mp;
      const learned = R.learnUpTo(run);
      ups.push({ lv: rp.lv, learned });
    }
    R.sync(run);
    return ups;
  };

  R.allocPoint = function (run, key) {
    const rp = run.rpg;
    if (rp.points <= 0 || !(key in rp.alloc)) return false;
    rp.points--; rp.alloc[key]++;
    if (key === 'hp') rp.hp += R.POINT_VALUE.hp;
    if (key === 'mp') rp.mp += R.POINT_VALUE.mp;
    R.sync(run);
    return true;
  };

  // ---------------- 소지품 · 장비 ----------------
  R.count = (run, id) => run.inventory[id] || 0;
  R.give = function (run, id, n = 1) { run.inventory[id] = (run.inventory[id] || 0) + n; };
  R.take = function (run, id, n = 1) {
    const have = run.inventory[id] || 0;
    if (have < n) return false;
    if (have - n <= 0) delete run.inventory[id]; else run.inventory[id] = have - n;
    return true;
  };
  /** 장착 중인 개수 */
  R.equippedCount = function (run, id) {
    const e = run.rpg.equip;
    return (e.wand === id ? 1 : 0) + (e.relic === id ? 1 : 0) + e.acc.filter(a => a === id).length;
  };
  /** 장착하지 않은 여분 */
  R.spare = (run, id) => R.count(run, id) - R.equippedCount(run, id);

  R.equip = function (run, slot, id) {
    const e = run.rpg.equip;
    if (id && R.spare(run, id) <= 0) return false;
    if (slot === 'wand') { if (!id) return false; e.wand = id; }
    else if (slot === 'relic') e.relic = id || null;
    else if (slot.startsWith('acc')) e.acc[+slot.slice(3)] = id || null;
    R.sync(run);
    return true;
  };

  /** 아이템 사용 (필드/전투 공용 회복 처리). 결과 문장 또는 오류 { error } */
  // ---------------- 아이템 효과 (2부) ----------------
  /**
   * 아이템 → 효과 목록. 새 아이템은 effects 를 그대로 쓰고, 예전 아이템(hp · mp · cure · gauge · dmg · escape · warp)은
   * 같은 효과로 바꿔 읽는다 (동작 · 수치는 예전과 같다).
   *   heal {hp, mp}  cure {list | pick:'random' | pick:'all', optional}  buff {buff, amount, turns, battle}
   *   weaponEl {el}  inflict {status, chance, turns, all}  damage {dmg, el}  permStat {stat, amount}
   *   repel {steps}  goldBoost {mul}  gauge {amount}  escape  warp
   */
  R.itemEffects = function (it) {
    if (!it) return [];
    if (it.effects) return it.effects;
    if (it._fx) return it._fx;
    const fx = [];
    if (it.hp || it.mp) fx.push({ type: 'heal', hp: it.hp || 0, mp: it.mp || 0 });
    if (it.cure) fx.push({ type: 'cure', list: ['poison'], optional: !!(it.hp || it.mp) });
    if (it.gauge) fx.push({ type: 'gauge', amount: it.gauge });
    if (it.dmg) fx.push({ type: 'damage', dmg: it.dmg, el: it.el });
    if (it.escape) fx.push({ type: 'escape' });
    if (it.warp) fx.push({ type: 'warp' });
    Object.defineProperty(it, '_fx', { value: fx, enumerable: false });
    return fx;
  };
  /** 적을 골라야 하는 아이템인지 */
  R.itemNeedsTarget = it => !!(it && (it.target === 'enemy' || R.itemEffects(it).some(e => e.type === 'damage' && !e.all)));
  R.STATUS_LABEL = { poison: '독', sleep: '수면', slow: '둔화', burn: '화상', weak: '약화', silence: '침묵' };

  /** 영혼의 보석: 영구 능력치 증가 (이번 회차) */
  R.addGem = function (run, stat, amount) {
    const rp = run.rpg;
    rp.gems = Object.assign({ hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spd: 0 }, rp.gems || {});
    rp.gems[stat] += amount;
    if (stat === 'hp') rp.hp += amount;
    if (stat === 'mp') rp.mp += amount;
    R.sync(run);
  };

  /** 필드(메뉴)에서 아이템 쓰기. 전투 중 사용은 battle.js 가 맡는다 */
  R.useItem = function (run, id, ctx = 'field') {
    const it = R.ITEMS[id], rp = run.rpg;
    if (!it || it.kind !== 'use' || R.count(run, id) <= 0) return { error: '쓸 수 없습니다.' };
    if (it.battleOnly && ctx !== 'battle') return { error: '전투 중에만 쓸 수 있습니다.' };
    if (it.fieldOnly && ctx !== 'field') return { error: '필드에서만 쓸 수 있습니다.' };
    const fx = R.itemEffects(it);
    const g = fx.find(e => e.type === 'gauge');
    if (g) {
      if (rp.gauge <= 0) return { error: '변신 게이지가 바닥났습니다. 잠을 자서 하루를 넘겨야만 다시 찹니다.' };
      if (rp.gauge >= R.GAUGE.max) return { error: '변신 게이지가 이미 가득합니다.' };
    }
    const st = R.stats(run);
    // 필드에서 남는 상태이상은 독뿐이다
    const fieldStatus = () => (rp.poison ? ['poison'] : []);
    const useful = fx.some(e =>
      (e.type === 'heal' && ((e.hp && rp.hp < st.hp) || (e.mp && rp.mp < st.mp))) ||
      (e.type === 'cure' && !e.optional && (e.list ? e.list.some(k => fieldStatus().includes(k)) : fieldStatus().length)) ||
      (e.type === 'cure' && e.optional && e.list && e.list.some(k => fieldStatus().includes(k))) ||
      ['gauge', 'permStat', 'repel', 'warp', 'damage', 'escape'].includes(e.type));
    if (!useful) return { error: '지금은 쓸 필요가 없습니다.' };
    const msgs = [];
    for (const e of fx) {
      if (e.type === 'heal') {
        if (e.hp) { const v = Math.min(e.hp, st.hp - rp.hp); rp.hp += v; if (v) msgs.push(`체력 ${v} 회복`); }
        if (e.mp) { const v = Math.min(e.mp, st.mp - rp.mp); rp.mp += v; if (v) msgs.push(`마나 ${v} 회복`); }
      } else if (e.type === 'cure') {
        const can = e.list ? e.list : ['poison'];
        if (rp.poison && can.includes('poison')) { rp.poison = 0; msgs.push('독이 나았다'); }
      } else if (e.type === 'gauge') {
        const v = Math.min(e.amount, R.GAUGE.max - rp.gauge); rp.gauge += v; msgs.push(`변신 게이지 ${v} 회복`);
      } else if (e.type === 'permStat') {
        R.addGem(run, e.stat, e.amount);
        msgs.push(`${WS.STAT_LABELS[e.stat]} +${e.amount} (영구)`);
      } else if (e.type === 'repel') {
        rp.repel = e.steps;
        msgs.push(`${e.steps}걸음 동안 마물이 다가오지 않는다`);
      }
    }
    R.take(run, id);
    return { ok: true, text: `${it.n}: ${msgs.join(', ')}` };
  };

  // ---------------- 시간 ----------------
  R.clock = m => { const h = Math.floor(m / 60), mm = m % 60; return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
  R.daysLeft = rp => R.TIME.lastDay - rp.day + 1;
  /** 시간대: dawn morning day evening night late */
  R.phase = m => (m < 7 * 60 ? 'dawn' : m < 11 * 60 ? 'morning' : m < 17 * 60 ? 'day' : m < 19 * 60 ? 'evening' : m < 22 * 60 ? 'night' : 'late');
  R.PHASE_LABEL = { dawn: '새벽', morning: '아침', day: '낮', evening: '저녁', night: '밤', late: '한밤' };
  /** 시간 경과. 24:00 을 넘기면 true (쓰러짐 처리는 필드에서) */
  R.addMinutes = function () { return false; };   // 시계는 쓰지 않는다 (하루는 잠으로만 넘어간다)
  /**
   * 하루를 넘긴다 (잠). 변신 게이지는 오직 여기서만 다시 가득 찬다.
   * 반환: 'doom' — 30일째 밤이 지나 세계가 멸망 / 'ok'
   */
  R.sleep = function (run, opts = {}) {
    const rp = run.rpg;
    if (rp.day >= R.TIME.lastDay) return 'doom';
    rp.day++;
    rp.min = R.TIME.dayStart;
    rp.gauge = R.GAUGE.max;
    const st = R.stats(run);
    rp.hp = opts.half ? Math.max(rp.hp, Math.round(st.hp * 0.5)) : st.hp;
    rp.mp = opts.half ? Math.max(rp.mp, Math.round(st.mp * 0.5)) : st.mp;
    rp.poison = 0;
    return 'ok';
  };

  // ---------------- 저장 ----------------
  R.SAVE_KEY = 'whitespace.save.v1';
  R.save = function (game) {
    try {
      localStorage.setItem(R.SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: game.state }));
      return true;
    } catch (e) { return false; }
  };
  R.loadSave = function () {
    try {
      const raw = localStorage.getItem(R.SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.state && data.state.rpg ? data : null;
    } catch (e) { return null; }
  };

  // ---------------- 난수 (맵 생성용 고정 시드) ----------------
  R.rng = function (seed) {
    let s = 0;
    for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) | 0;
    s = s >>> 0 || 1;
    const f = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    return f;
  };
})();
