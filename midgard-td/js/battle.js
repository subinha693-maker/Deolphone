// =============================================================
//  전투 규칙 (화면 그리기와 분리된 순수 게임 로직)
// =============================================================
const Battle = (() => {
  const RANGE_PAD = 0.5;   // 반경 N칸 → 칸 중심에서 N+0.5 거리까지 (그 칸에 걸친 적 포함)
  let uidSeq = 1;

  const CFG = () => window.GAME_CONFIG;
  const charDef = id => CHARACTERS.find(c => c.id === id);
  const enemyDef = id => ENEMIES.find(e => e.id === id);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isWalk = t => t === 'R' || t === 'G' || t === 'S' || t === 'B';

  // ---------- 맵 ----------
  function parseMap(lines) {
    return lines.map(l => l.trim().split(/\s+/).map(s => s.toUpperCase()));
  }

  function findPath(grid, from, to) {
    const rows = grid.length, cols = grid[0].length;
    const prev = {};
    const key = (c, r) => c + ',' + r;
    const q = [from];
    const seen = new Set([key(from.c, from.r)]);
    while (q.length) {
      const p = q.shift();
      if (p.c === to.c && p.r === to.r) break;
      for (const [dc, dr] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
        const c = p.c + dc, r = p.r + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        if (!isWalk(grid[r][c]) || seen.has(key(c, r))) continue;
        seen.add(key(c, r));
        prev[key(c, r)] = p;
        q.push({ c, r });
      }
    }
    if (!seen.has(key(to.c, to.r))) {
      console.warn('진격로를 찾을 수 없습니다', from, to);
      return [{ x: from.c, y: from.r }, { x: to.c, y: to.r }];
    }
    const path = [];
    let cur = to;
    while (cur) { path.unshift({ x: cur.c, y: cur.r }); cur = prev[key(cur.c, cur.r)]; }
    return path;
  }

  // ---------- 생성 ----------
  function create(stageId, partyIds) {
    const st = STAGES.find(s => s.id === stageId);
    const grid = parseMap(st.map);
    const rows = grid.length, cols = grid[0].length;
    const spawns = [];
    let base = { c: 0, r: 0 };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 'S') spawns.push({ c, r });
      if (grid[r][c] === 'B') base = { c, r };
    }
    const paths = spawns.map(s => {
      const p = findPath(grid, s, base);
      let total = 0;
      for (let i = 1; i < p.length; i++) total += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      return { nodes: p, length: total };
    });

    const cfg = CFG();
    const totalEnemies = st.waves.reduce((a, w) => a + w.groups.reduce((b2, g) => b2 + g.count, 0), 0);
    const b = {
      st, grid, rows, cols, spawns, base, paths,
      time: 0,
      cost: cfg.cost.start,
      baseHp: cfg.baseHp, baseHpMax: cfg.baseHp, baseHpStart: cfg.baseHp,
      units: [], enemies: [], projectiles: [], effects: [], texts: [],
      party: partyIds.slice(),
      cards: partyIds.map(id => ({ id, cooldown: 0, cooldownMax: 0, deployed: false })),
      mods: { atkSpeed: 0, atkPct: 0, hpPct: 0, spCharge: 0, healPct: 0, guardianBlock: 0, costRegen: 0, capsule: false },
      ind: {},  // 캐릭터별 개별 강화
      shop: [], rerollCost: cfg.rerollBaseCost,
      cmdUsed: {},
      totalEnemies, killed: 0, leaked: 0,
      wave: { index: -1, state: 'prep', timer: st.firstWaveDelay != null ? st.firstWaveDelay : cfg.firstWaveDelay, queue: [], spawnTimer: 0 },
      hold: false,
      events: [],
      result: null,
      shake: 0
    };
    for (const id of partyIds) b.ind[id] = { atkSpeed: 0, atkPct: 0, hpPct: 0, spCharge: 0, capsule: false };
    refillShop(b, true);
    b.events.push({ type: 'wavePreview', index: 0, text: wavePreviewText(b, 0) });
    return b;
  }

  // ---------- 웨이브 ----------
  function wavePreviewText(b, i) {
    const w = b.st.waves[i];
    if (!w) return '';
    const cnt = {};
    for (const g of w.groups) cnt[g.enemy] = (cnt[g.enemy] || 0) + g.count;
    return Object.entries(cnt).map(([id, n]) => `${(enemyDef(id) || { name: id }).name} ×${n}`).join(', ');
  }

  function startWave(b, i) {
    const w = b.st.waves[i];
    b.wave.index = i;
    b.wave.state = 'spawning';
    b.wave.queue = [];
    for (const g of w.groups) {
      for (let k = 0; k < g.count; k++) {
        let sp = g.spawn;
        if (sp === 'alt') sp = k % Math.max(1, b.spawns.length);
        sp = Math.min(Math.max(0, sp | 0), b.spawns.length - 1);
        b.wave.queue.push({ enemy: g.enemy, spawn: sp });
      }
    }
    b.wave.spawnTimer = 0;
    b.events.push({ type: 'waveStart', index: i });
  }

  function updateWaves(b, dt) {
    const w = b.wave, cfg = CFG(), st = b.st;
    const rest = st.waveRest != null ? st.waveRest : cfg.waveRest;
    const interval = st.spawnInterval != null ? st.spawnInterval : cfg.spawnInterval;
    if (w.state === 'prep' || w.state === 'rest') {
      if (b.hold) return;
      w.timer -= dt;
      if (w.timer <= 0) startWave(b, w.index + 1);
    } else if (w.state === 'spawning') {
      w.spawnTimer -= dt;
      while (w.spawnTimer <= 0 && w.queue.length) {
        const q = w.queue.shift();
        spawnEnemy(b, q.enemy, q.spawn);
        w.spawnTimer += interval;
      }
      if (!w.queue.length) w.state = 'clearing';
    } else if (w.state === 'clearing') {
      if (!b.enemies.some(e => !e.dying)) {
        if (w.index >= st.waves.length - 1) { w.state = 'done'; }
        else {
          w.state = 'rest'; w.timer = rest;
          b.events.push({ type: 'wavePreview', index: w.index + 1, text: wavePreviewText(b, w.index + 1) });
        }
      }
    }
  }

  function spawnEnemy(b, id, spawnIdx) {
    const d = enemyDef(id);
    if (!d) { console.warn('없는 적 id', id); b.totalEnemies--; return; }
    const path = b.paths[spawnIdx] || b.paths[0];
    const e = {
      uid: uidSeq++, d, id, hp: d.hp, maxHp: d.hp,
      path, seg: 1, x: path.nodes[0].x, y: path.nodes[0].y, progress: 0,
      blockedBy: null, atkTimer: d.interval || 1, stun: 0, hitFlash: 0, facing: -1,
      dying: false, dieT: 0, bob: Math.random() * 6,
      slamTimer: d.slam ? d.slam.every : 0, telegraph: null,
      jx: ((uidSeq * 37) % 7 - 3) * 0.035, jy: ((uidSeq * 53) % 7 - 3) * 0.03
    };
    b.enemies.push(e);
    if (d.boss && d.entryLine) b.events.push({ type: 'bossTalk', name: d.name, text: d.entryLine });
  }

  // ---------- 능력치 ----------
  function stats(b, u) {
    const ch = u.ch, m = b.mods, ind = b.ind[u.id];
    const base = charStats(ch, u.level);
    const sk = u.skillActive > 0 ? ch.skill : null;
    const minR = CFG().capsuleMinHpRatio;
    const hpMult = Math.max(minR, 1 + m.hpPct + ind.hpPct);
    let block = ch.tile === 'ground' ? ch.block : 0;
    if (ch.cls === 'guardian') block += m.guardianBlock;
    if (sk && sk.blockAdd) block += sk.blockAdd;
    return {
      maxHp: Math.round(base.hp * hpMult),
      atk: base.atk * (1 + m.atkPct + ind.atkPct + (sk && sk.atkPct ? sk.atkPct : 0)),
      def: base.def, res: base.res,
      interval: ch.interval / Math.max(0.1, 1 + m.atkSpeed + ind.atkSpeed),
      range: ch.range,
      block,
      targets: sk && sk.targets ? sk.targets : 1,
      dmgTaken: sk && sk.dmgTakenMult != null ? sk.dmgTakenMult : 1,
      spMult: 1 + m.spCharge + ind.spCharge,
      healMult: 1 + m.healPct,
      capsule: m.capsule || ind.capsule
    };
  }

  function refreshMaxHp(b, u) {
    const s = stats(b, u);
    if (s.maxHp > u.maxHp) u.hp += s.maxHp - u.maxHp;
    u.maxHp = s.maxHp;
    u.hp = Math.min(u.hp, u.maxHp);
    if (u.hp <= 0) u.hp = 1;
  }

  // ---------- 애니메이션 ----------
  function animDef(id, act) {
    const a = (ANIMATIONS.characters || {})[id];
    return (a && a.actions && a.actions[act]) || null;
  }

  // want: attack / skill / heal  →  실제 재생할 동작을 고르고 대체 규칙 적용
  function startAction(b, u, want, interval, onHit) {
    let act = want, glow = false, flash = false;
    const has = a => Assets.hasAction(u.id, a);
    if (want === 'skill') {
      glow = true;
      if (!has('skill')) { act = 'attack'; if (!has('attack')) { act = 'idle'; flash = true; } }
    } else if (want === 'heal') {
      if (!has('heal')) { act = 'attack'; if (!has('attack')) { act = 'idle'; flash = true; } }
    } else if (want === 'attack') {
      if (!has('attack')) { act = 'idle'; flash = true; }
    }
    const def = (act !== 'idle' && animDef(u.id, act)) || animDef(u.id, want) || ANIMATIONS.defaultAction;
    const frames = def.frames || 4, fps = def.fps || 8;
    const hitFrame = Math.min(frames, def.hitFrame || Math.ceil(frames / 2));
    const natural = frames / fps;
    const rate = interval ? Math.max(1, natural / (interval * 0.9)) : 1;
    u.anim = {
      want, act, t: 0, frames, fps, rate,
      dur: natural / rate, hitT: ((hitFrame - 1) / fps) / rate,
      hitDone: false, onHit, busy: true, flash, glow
    };
    if (glow) b.effects.push({ type: 'glow', unit: u, t: 0, dur: 0.9, color: u.ch.color });
  }

  function updateAnim(b, u, dt) {
    u.idleT += dt;
    const a = u.anim;
    if (!a || !a.busy) return;
    a.t += dt;
    if (!a.hitDone && a.t >= a.hitT) { a.hitDone = true; if (a.onHit) a.onHit(); }
    if (a.t >= a.dur) { a.busy = false; u.anim = null; }
  }

  // ---------- 배치 / 퇴각 ----------
  function tileAt(b, c, r) { return (b.grid[r] && b.grid[r][c]) || 'X'; }
  function unitAt(b, c, r) { return b.units.find(u => u.c === c && u.r === r && u.state !== 'fallen'); }

  function canPlace(b, id, c, r) {
    const ch = charDef(id);
    const t = tileAt(b, c, r);
    if (unitAt(b, c, r)) return false;
    return ch.tile === 'ground' ? t === 'G' : t === 'H';
  }

  function cardState(b, id) {
    const card = b.cards.find(k => k.id === id);
    const ch = charDef(id);
    return { card, ch, ready: !card.deployed && card.cooldown <= 0, affordable: b.cost >= ch.cost };
  }

  function deploy(b, id, c, r) {
    const { card, ch, ready, affordable } = cardState(b, id);
    if (!ready) return 'cooldown';
    if (!affordable) return 'cost';
    if (!canPlace(b, id, c, r)) return 'tile';
    b.cost -= ch.cost;
    card.deployed = true;
    const level = Save.char(id).level;
    const u = {
      uid: uidSeq++, id, ch, level, c, r, x: c, y: r,
      hp: 1, maxHp: 1, sp: 0, skillActive: 0, atkTimer: 0.3,
      blocking: [], anim: null, idleT: Math.random() * 2, facing: 1,
      state: 'alive', deployT: 0.45, fallT: 0, fallDur: 1, hitFlash: 0, multi: null, spReady: false
    };
    u.maxHp = stats(b, u).maxHp; u.hp = u.maxHp;
    b.units.push(u);
    b.effects.push({ type: 'deploy', x: c, y: r, t: 0, dur: 0.5, color: CFG().classes[ch.cls].color });
    // 메딕 강화는 배치된 메딕 수 기준이므로 그대로 유지
    b.hold = false;  // 튜토리얼: 첫 배치하면 웨이브 시작
    b.events.push({ type: 'deploy', id });
    return 'ok';
  }

  function releaseBlocked(u) {
    for (const e of u.blocking) if (e.blockedBy === u) e.blockedBy = null;
    u.blocking = [];
  }

  function retreat(b, u) {
    if (u.state !== 'alive') return;
    const card = b.cards.find(k => k.id === u.id);
    b.cost = Math.min(CFG().cost.max, b.cost + Math.floor(u.ch.cost * CFG().retreatRefund));
    releaseBlocked(u);
    card.deployed = false;
    card.cooldown = card.cooldownMax = u.ch.redeploy;
    u.state = 'retreated';
    u.remove = true;
    b.effects.push({ type: 'deploy', x: u.x, y: u.y, t: 0, dur: 0.4, color: '#ffffff' });
  }

  function fall(b, u) {
    if (u.state !== 'alive') return;
    u.state = 'fallen';
    releaseBlocked(u);
    u.skillActive = 0; u.multi = null;
    const def = Assets.hasAction(u.id, 'fallen') ? animDef(u.id, 'fallen') : null;
    u.fallSprite = !!def;
    u.fallDur = def ? def.frames / def.fps + 0.6 : 1.0;
    u.fallT = 0;
    u.anim = null;
    const card = b.cards.find(k => k.id === u.id);
    card.deployed = false;
    card.cooldown = card.cooldownMax = u.ch.redeploy;
    b.events.push({ type: 'fallen', id: u.id });
  }

  // ---------- 피해 / 회복 ----------
  function calcDamage(atk, type, def, res) {
    if (type === 'magic') return atk * (1 - (res || 0) / 100);
    return Math.max(atk - (def || 0), atk * 0.05);
  }

  function damageEnemy(b, e, atk, type, showNum) {
    if (e.dying) return;
    const dmg = calcDamage(atk, type, e.d.def, e.d.res);
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (showNum) b.texts.push({ x: e.x, y: e.y - 0.4, text: Math.round(dmg), color: type === 'magic' ? '#d6b8ff' : '#ffffff', t: 0, dur: 0.9 });
    if (e.hp <= 0) killEnemy(b, e);
  }

  function killEnemy(b, e) {
    e.dying = true; e.dieT = 0; e.hp = 0;
    if (e.blockedBy) { const u = e.blockedBy; u.blocking = u.blocking.filter(x => x !== e); e.blockedBy = null; }
    b.killed++;
    b.effects.push({ type: 'poof', x: e.x, y: e.y, t: 0, dur: 0.5, color: (ENEMY_GRADES[e.d.grade] || {}).color || '#ccc' });
  }

  function damageUnit(b, u, atk, type) {
    if (u.state !== 'alive') return;
    const s = stats(b, u);
    const dmg = calcDamage(atk, type, s.def, s.res) * s.dmgTaken;
    u.hp -= dmg;
    u.hitFlash = 0.12;
    if (u.hp <= 0) { u.hp = 0; fall(b, u); }
  }

  function healUnit(b, u, amount) {
    if (u.state !== 'alive') return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    const got = Math.round(u.hp - before);
    if (got > 0) b.texts.push({ x: u.x, y: u.y - 0.7, text: '+' + got, color: '#7dffa0', t: 0, dur: 0.9 });
  }

  // ---------- 아군 행동 ----------
  function enemiesInRange(b, pos, radius) {
    return b.enemies.filter(e => !e.dying && dist(pos, e) <= radius);
  }

  function pickTargets(b, u, s, n) {
    let list = enemiesInRange(b, u, s.range + RANGE_PAD);
    if (!list.length) return [];
    const flyFirst = !!u.ch.flyingPriority;
    list.sort((a, c) => {
      const ba = a.blockedBy === u ? 1 : 0, bc = c.blockedBy === u ? 1 : 0;
      if (ba !== bc) return bc - ba;
      if (flyFirst) { const fa = a.d.flying ? 1 : 0, fc = c.d.flying ? 1 : 0; if (fa !== fc) return fc - fa; }
      return (c.progress / c.path.length) - (a.progress / a.path.length) || c.progress - a.progress;
    });
    return list.slice(0, n);
  }

  function pickHealTarget(b, u, s) {
    let best = null, bestR = 1;
    for (const o of b.units) {
      if (o.state !== 'alive' || o.hp >= o.maxHp) continue;
      if (dist(u, o) > s.range + RANGE_PAD) continue;
      const r = o.hp / o.maxHp;
      if (r < bestR) { bestR = r; best = o; }
    }
    return best;
  }

  function fireProjectile(b, from, target, opts) {
    b.projectiles.push(Object.assign({
      x: from.x + (opts.ox || 0), y: from.y - 0.35, tx: target.x, ty: target.y, target,
      speed: 11, color: '#fff', img: null, onHit: null, t: 0
    }, opts));
  }

  function unitAttack(b, u) {
    const s = stats(b, u);
    const ch = u.ch;
    if (ch.dmgType === 'heal') {
      const t = pickHealTarget(b, u, s);
      if (!t) return false;
      u.facing = t.x < u.x ? -1 : 1;
      startAction(b, u, 'heal', s.interval, () => {
        const s2 = stats(b, u);
        const target = t.state === 'alive' ? t : pickHealTarget(b, u, s2);
        if (!target) return;
        fireProjectile(b, u, target, {
          color: ch.color, img: Assets.bullets[u.id] || null, speed: 9, kind: 'heal',
          onHit: () => healUnit(b, target, s2.atk * s2.healMult)
        });
      });
      return true;
    }
    const targets = pickTargets(b, u, s, s.targets);
    if (!targets.length) return false;
    u.facing = targets[0].x < u.x - 0.05 ? -1 : 1;
    startAction(b, u, 'attack', s.interval, () => {
      const s2 = stats(b, u);
      let tg = targets.filter(e => !e.dying);
      if (!tg.length) tg = pickTargets(b, u, s2, s2.targets);
      for (const e of tg) {
        if (ch.projectile) {
          fireProjectile(b, u, e, {
            color: ch.color, img: Assets.bullets[u.id] || null, kind: 'enemy',
            ox: 0.25 * u.facing,
            onHit: (pos) => {
              if (ch.splash) {
                for (const o of enemiesInRange(b, pos, ch.splash)) damageEnemy(b, o, s2.atk, ch.dmgType, false);
                b.effects.push({ type: 'burst', x: pos.x, y: pos.y, t: 0, dur: 0.35, color: ch.color, r: ch.splash });
              } else if (!e.dying) {
                damageEnemy(b, e, s2.atk, ch.dmgType, false);
                b.effects.push({ type: 'spark', x: pos.x, y: pos.y, t: 0, dur: 0.2, color: ch.color });
              }
            }
          });
        } else {
          damageEnemy(b, e, s2.atk, ch.dmgType, false);
          b.effects.push({ type: 'slash', x: e.x, y: e.y, t: 0, dur: 0.2, color: ch.color, dir: u.facing });
        }
      }
    });
    return true;
  }

  // ---------- 스킬 ----------
  function skillUsable(b, u) {
    if (u.state !== 'alive' || u.deployT > 0) return { ok: false, why: '' };
    const sk = u.ch.skill;
    if (u.skillActive > 0 || u.multi) return { ok: false, why: '스킬 사용 중' };
    if (u.sp < sk.sp) return { ok: false, why: '게이지 부족' };
    const s = stats(b, u);
    if (sk.type === 'snipe' && !enemiesInRange(b, u, s.range + RANGE_PAD).length) return { ok: false, why: '범위 안에 적이 없음' };
    if ((sk.type === 'multiHit' || sk.type === 'nova') && !enemiesInRange(b, u, sk.radius + RANGE_PAD).length) return { ok: false, why: '범위 안에 적이 없음' };
    return { ok: true };
  }

  function useSkill(b, u) {
    const chk = skillUsable(b, u);
    if (!chk.ok) return chk;
    const sk = u.ch.skill;
    u.sp = 0; u.spReady = false;
    const color = u.ch.color;
    b.effects.push({ type: 'ring', x: u.x, y: u.y, t: 0, dur: 0.7, color, r: sk.radius || 1.5 });
    b.events.push({ type: 'skillUsed', id: u.id });
    if (sk.type === 'buff') {
      u.skillActive = sk.duration;
      if (sk.blockAdd) refreshMaxHp(b, u);
      startAction(b, u, 'skill', 0, null);
    } else if (sk.type === 'multiHit') {
      startAction(b, u, 'skill', 0, () => {
        u.multi = { left: sk.hits, timer: 0 };
      });
    } else if (sk.type === 'snipe') {
      const s = stats(b, u);
      const list = enemiesInRange(b, u, s.range + RANGE_PAD).sort((a, c) => c.hp - a.hp);
      const t = list[0];
      u.facing = t.x < u.x ? -1 : 1;
      startAction(b, u, 'skill', 0, () => {
        const s2 = stats(b, u);
        fireProjectile(b, u, t, {
          color, img: Assets.bullets[u.id] || null, speed: 18, big: true, kind: 'enemy', ox: 0.25 * u.facing,
          onHit: (pos) => {
            if (!t.dying) damageEnemy(b, t, s2.atk * sk.mult, 'physical', true);
            for (const o of enemiesInRange(b, pos, sk.splashRadius)) if (o !== t) damageEnemy(b, o, s2.atk * sk.splashMult, 'physical', true);
            b.effects.push({ type: 'burst', x: pos.x, y: pos.y, t: 0, dur: 0.5, color, r: sk.splashRadius });
            b.shake = 0.15;
          }
        });
      });
    } else if (sk.type === 'nova') {
      startAction(b, u, 'skill', 0, () => {
        const s2 = stats(b, u);
        for (const e of enemiesInRange(b, u, sk.radius + RANGE_PAD)) {
          damageEnemy(b, e, s2.atk * sk.mult, sk.dmgType || 'magic', true);
          if (!e.dying) e.stun = Math.max(e.stun, sk.stun);
          b.effects.push({ type: 'crystal', x: e.x, y: e.y, t: 0, dur: 0.7, color });
        }
        b.effects.push({ type: 'ring', x: u.x, y: u.y, t: 0, dur: 0.6, color, r: sk.radius + RANGE_PAD });
      });
    } else if (sk.type === 'massHeal') {
      startAction(b, u, 'skill', 0, () => {
        for (const o of b.units) {
          if (o.state === 'alive' && dist(u, o) <= sk.radius + RANGE_PAD) healUnit(b, o, o.maxHp * sk.healPctMaxHp);
        }
        b.effects.push({ type: 'ring', x: u.x, y: u.y, t: 0, dur: 0.8, color, r: sk.radius + RANGE_PAD, fill: true });
      });
    }
    return { ok: true };
  }

  function updateUnit(b, u, dt) {
    if (u.state === 'fallen') { u.fallT += dt; if (u.fallT >= u.fallDur) u.remove = true; return; }
    if (u.state !== 'alive') return;
    u.hitFlash = Math.max(0, u.hitFlash - dt);
    updateAnim(b, u, dt);
    if (u.deployT > 0) { u.deployT -= dt; return; }
    const sk = u.ch.skill;
    let s = stats(b, u);

    // 스킬 지속 / 게이지
    if (u.skillActive > 0) {
      u.skillActive -= dt;
      if (sk.regenPctPerSec) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * sk.regenPctPerSec * dt);
      if (u.skillActive <= 0) {
        u.skillActive = 0;
        s = stats(b, u);
        while (u.blocking.length > s.block) { const e = u.blocking.pop(); if (e.blockedBy === u) e.blockedBy = null; }
      }
    } else if (!u.multi && u.sp < sk.sp) {
      u.sp = Math.min(sk.sp, u.sp + dt * CFG().skillChargePerSecond * s.spMult);
    }
    if (u.sp >= sk.sp && !u.spReady) { u.spReady = true; b.events.push({ type: 'skillReady', id: u.id }); }

    // 리리 연속 회전
    if (u.multi) {
      u.multi.timer -= dt;
      if (u.multi.timer <= 0) {
        for (const e of enemiesInRange(b, u, sk.radius + RANGE_PAD)) damageEnemy(b, e, s.atk * sk.mult, u.ch.dmgType, true);
        b.effects.push({ type: 'spin', x: u.x, y: u.y, t: 0, dur: 0.25, color: u.ch.color, r: sk.radius + 0.3 });
        u.multi.left--;
        u.multi.timer = sk.hitInterval;
        if (u.multi.left <= 0) u.multi = null;
      }
      return;
    }

    u.atkTimer -= dt;
    if (u.anim && u.anim.busy) return;
    if (u.atkTimer <= 0) {
      if (unitAttack(b, u)) u.atkTimer = s.interval;
      else u.atkTimer = 0;
    }
  }

  // ---------- 적 행동 ----------
  function blockerAt(b, e) {
    const c = Math.round(e.x), r = Math.round(e.y);
    if (Math.abs(e.x - c) > 0.45 || Math.abs(e.y - r) > 0.45) return null;
    const u = unitAt(b, c, r);
    if (!u || u.state !== 'alive' || u.ch.tile !== 'ground' || u.deployT > 0.2) return null;
    if (u.blocking.length >= stats(b, u).block) return null;
    return u;
  }

  function enemyAttack(b, e, u) {
    e.facing = u.x < e.x ? -1 : 1;
    e.lunge = 0.18;
    if (e.d.range > 0) {
      fireProjectile(b, e, u, {
        color: '#ffb36b', speed: 7, kind: 'unit', fromEnemy: true,
        onHit: () => damageUnit(b, u, e.d.atk, 'physical')
      });
    } else {
      damageUnit(b, u, e.d.atk, 'physical');
      b.effects.push({ type: 'thump', x: u.x, y: u.y, t: 0, dur: 0.2, color: '#ffd9a0' });
    }
  }

  function updateEnemy(b, e, dt) {
    if (e.dying) { e.dieT += dt; if (e.dieT > 0.45) e.remove = true; return; }
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.lunge = Math.max(0, (e.lunge || 0) - dt);
    e.bob += dt * (e.d.flying ? 6 : 4);
    if (e.stun > 0) { e.stun -= dt; return; }
    const d = e.d;

    // 보스 범위 공격
    if (d.slam) {
      if (e.telegraph) {
        e.telegraph.t -= dt;
        if (e.telegraph.t <= 0) {
          const tp = e.telegraph;
          for (const u of b.units) {
            if (u.state === 'alive' && dist(u, tp) <= d.slam.radius + RANGE_PAD) damageUnit(b, u, d.atk * d.slam.mult, 'physical');
          }
          b.effects.push({ type: 'shock', x: tp.x, y: tp.y, t: 0, dur: 0.6, color: '#ffcf6b', r: d.slam.radius + RANGE_PAD });
          b.shake = 0.35;
          e.telegraph = null;
          e.slamTimer = d.slam.every;
        }
      } else {
        e.slamTimer -= dt;
        if (e.slamTimer <= 0) e.telegraph = { x: e.x, y: e.y, t: d.slam.warn, max: d.slam.warn, r: d.slam.radius + RANGE_PAD };
      }
    }

    if (e.blockedBy && e.blockedBy.state !== 'alive') e.blockedBy = null;
    if (e.blockedBy) {
      const u = e.blockedBy;
      e.facing = u.x < e.x ? -1 : 1;
      if (d.atk > 0) {
        e.atkTimer -= dt;
        if (e.atkTimer <= 0) { enemyAttack(b, e, u); e.atkTimer = d.interval; }
      }
      return;
    }

    // 이동
    let move = d.speed * dt;
    const nodes = e.path.nodes;
    while (move > 0 && e.seg < nodes.length) {
      const n = nodes[e.seg];
      const dx = n.x - e.x, dy = n.y - e.y;
      const L = Math.hypot(dx, dy);
      if (L <= move) { e.x = n.x; e.y = n.y; move -= L; e.progress += L; e.seg++; }
      else { e.x += dx / L * move; e.y += dy / L * move; e.progress += move; move = 0; }
      if (Math.abs(dx) > 0.01) e.facing = dx < 0 ? -1 : 1;
    }
    if (e.seg >= nodes.length) {
      // 기지 도달
      e.remove = true;
      b.leaked++;
      b.baseHp = Math.max(0, b.baseHp - d.baseDamage);
      b.shake = 0.3;
      b.events.push({ type: 'leak', damage: d.baseDamage });
      return;
    }

    // 저지
    if (!d.flying) {
      const u = blockerAt(b, e);
      if (u) {
        e.blockedBy = u; u.blocking.push(e);
        e.atkTimer = Math.min(e.atkTimer, (d.interval || 1) * 0.5);
        b.events.push({ type: 'block' });
        return;
      }
    }

    // 원거리 적: 이동하면서 공격
    if (d.range > 0 && d.atk > 0) {
      e.atkTimer -= dt;
      if (e.atkTimer <= 0) {
        let best = null, bd = 1e9;
        for (const u of b.units) {
          if (u.state !== 'alive') continue;
          const dd = dist(u, e);
          if (dd <= d.range && dd < bd) { bd = dd; best = u; }
        }
        if (best) { enemyAttack(b, e, best); e.atkTimer = d.interval; }
        else e.atkTimer = 0;
      }
    }
  }

  // ---------- 투사체 / 효과 ----------
  function updateProjectiles(b, dt) {
    for (const p of b.projectiles) {
      p.t += dt;
      const tg = p.target;
      const alive = tg && (tg.state ? tg.state === 'alive' : !tg.dying);
      if (alive) { p.tx = tg.x; p.ty = tg.y - (p.kind === 'heal' ? 0.3 : 0); }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const L = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (L <= step || p.t > 3) {
        p.x = p.tx; p.y = p.ty; p.done = true;
        if (p.onHit && (alive || p.kind === 'enemy')) p.onHit({ x: p.tx, y: p.ty });
      } else {
        p.x += dx / L * step; p.y += dy / L * step;
        p.angle = Math.atan2(dy, dx);
      }
    }
    b.projectiles = b.projectiles.filter(p => !p.done);
  }

  // ---------- 강화 카드 ----------
  function refillShop(b, all) {
    const size = CFG().shopSize;
    if (all) b.shop = [];
    while (b.shop.length < size) b.shop.push(null);
    for (let i = 0; i < size; i++) {
      if (b.shop[i] && !all) continue;
      const used = new Set(b.shop.filter(Boolean));
      const pool = UPGRADE_CARDS.filter(c => !used.has(c.id));
      if (!pool.length) { b.shop[i] = null; continue; }
      const total = pool.reduce((a, c) => a + (c.weight || 1), 0);
      let r = Math.random() * total;
      let pick = pool[0];
      for (const c of pool) { r -= (c.weight || 1); if (r <= 0) { pick = c; break; } }
      b.shop[i] = pick.id;
    }
  }

  function reroll(b) {
    if (b.cost < b.rerollCost) return 'cost';
    b.cost -= b.rerollCost;
    b.rerollCost += CFG().rerollStep;
    refillShop(b, true);
    return 'ok';
  }

  function cardUsable(b, card) {
    if (b.cost < card.cost) return { ok: false, why: '코스트 부족' };
    if (card.scope === 'base' && b.baseHp >= b.baseHpMax) return { ok: false, why: '기지 체력이 가득함' };
    if (card.scope === 'single' && !b.units.some(u => u.state === 'alive')) return { ok: false, why: '배치된 캐릭터 없음' };
    return { ok: true };
  }

  function buyCard(b, slot, targetUnit) {
    const id = b.shop[slot];
    const card = UPGRADE_CARDS.find(c => c.id === id);
    if (!card) return 'none';
    const chk = cardUsable(b, card);
    if (!chk.ok) return chk.why;
    if (card.scope === 'single' && (!targetUnit || targetUnit.state !== 'alive')) return '대상 없음';
    b.cost -= card.cost;
    const ef = card.effects || {};
    if (card.scope === 'single') {
      const ind = b.ind[targetUnit.id];
      for (const k of ['atkSpeed', 'atkPct', 'hpPct', 'spCharge']) if (ef[k]) ind[k] += ef[k];
      if (card.kind === 'capsule') ind.capsule = true;
      refreshMaxHp(b, targetUnit);
      b.effects.push({ type: 'ring', x: targetUnit.x, y: targetUnit.y, t: 0, dur: 0.6, color: CARD_KINDS[card.kind].color, r: 0.7 });
    } else {
      const m = b.mods;
      for (const k of ['atkSpeed', 'atkPct', 'hpPct', 'spCharge', 'guardianBlock', 'costRegen']) if (ef[k]) m[k] += ef[k];
      if (ef.healPerMedic) {
        const medics = b.units.filter(u => u.state === 'alive' && u.ch.cls === 'medic').length;
        m.healPct += ef.healPerMedic * medics;
        if (!medics) b.events.push({ type: 'toast', text: '배치된 메딕이 없어 효과가 없었습니다' });
      }
      if (ef.baseHp) b.baseHp = Math.min(b.baseHpMax, b.baseHp + ef.baseHp);
      if (card.kind === 'capsule') m.capsule = true;
      for (const u of b.units) if (u.state === 'alive') {
        refreshMaxHp(b, u);
        b.effects.push({ type: 'ring', x: u.x, y: u.y, t: 0, dur: 0.6, color: CARD_KINDS[card.kind].color, r: 0.6 });
      }
    }
    b.shop[slot] = null;
    refillShop(b, false);
    b.events.push({ type: 'cardBought', id });
    return 'ok';
  }

  // ---------- 지휘관 스킬 ----------
  function useCommander(b, id) {
    if (b.cmdUsed[id]) return 'used';
    const sk = CFG().commanderSkills.find(s => s.id === id);
    if (!sk) return 'none';
    if (sk.type === 'cost') b.cost = Math.min(CFG().cost.max, b.cost + sk.value);
    if (sk.type === 'skillCharge') {
      for (const u of b.units) if (u.state === 'alive' && u.skillActive <= 0 && !u.multi) {
        u.sp = Math.min(u.ch.skill.sp, u.sp + u.ch.skill.sp * sk.value);
        b.effects.push({ type: 'ring', x: u.x, y: u.y, t: 0, dur: 0.6, color: '#7fb6ff', r: 0.6 });
      }
    }
    b.cmdUsed[id] = true;
    return 'ok';
  }

  // ---------- 메인 업데이트 ----------
  function update(b, dt) {
    if (b.result) return;
    b.time += dt;
    const cfg = CFG();
    b.cost = Math.min(cfg.cost.max, b.cost + cfg.cost.perSecond * (1 + b.mods.costRegen) * dt);
    for (const c of b.cards) if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt);
    b.shake = Math.max(0, b.shake - dt);

    updateWaves(b, dt);
    for (const u of b.units) updateUnit(b, u, dt);
    for (const e of b.enemies) updateEnemy(b, e, dt);
    updateProjectiles(b, dt);
    for (const f of b.effects) f.t += dt;
    for (const t of b.texts) t.t += dt;
    b.effects = b.effects.filter(f => f.t < f.dur);
    b.texts = b.texts.filter(t => t.t < t.dur);
    b.units = b.units.filter(u => !u.remove);
    b.enemies = b.enemies.filter(e => !e.remove);

    if (b.baseHp <= 0) {
      b.result = { win: false };
      b.events.push({ type: 'end' });
    } else if (b.wave.state === 'done' && !b.enemies.length) {
      const lost = b.baseHpStart - b.baseHp;
      let stars = 1;
      for (const rule of cfg.starRules) { if (lost <= rule.maxLoss) { stars = rule.stars; break; } }
      b.result = { win: true, stars, lost };
      b.events.push({ type: 'end' });
    }
  }

  function remainingEnemies(b) { return Math.max(0, b.totalEnemies - b.killed - b.leaked); }

  return {
    create, update, deploy, retreat, useSkill, skillUsable, canPlace, cardState, tileAt, unitAt,
    buyCard, cardUsable, reroll, useCommander, stats, remainingEnemies, wavePreviewText, charDef, enemyDef,
    RANGE_PAD
  };
})();
