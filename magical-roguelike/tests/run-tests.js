// Headless tests for the game logic (no DOM). Run: node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LOGIC_FILES = [
  'js/core/util.js',
  'js/core/StateMachine.js',
  'js/core/SaveManager.js',
  'js/data/config.js',
  'js/data/characters.js',
  'js/data/enemies.js',
  'js/data/relics.js',
  'js/data/nodes.js',
  'js/data/events.js',
  'js/data/meta.js',
  'js/systems/FormationSystem.js',
  'js/systems/PartyManager.js',
  'js/systems/CombatSystem.js',
  'js/systems/LaneManager.js',
  'js/systems/SkillSystem.js',
  'js/systems/RelicSystem.js',
  'js/systems/WaveManager.js',
  'js/systems/MapManager.js',
  'js/systems/ExplorationManager.js',
  'js/systems/RewardSystem.js',
  'js/systems/NodeManager.js',
  'js/systems/ShopSystem.js',
  'js/systems/MetaProgress.js',
  'js/core/GameManager.js',
];

function load() {
  const warnings = [];
  const ctx = { console: { log() {}, warn: (m) => warnings.push(m), error: console.error }, Math, Date, Set, Map, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of LOGIC_FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.MG.warnings = warnings;
  ctx.MG.DEFAULT_UNLOCKED = ctx.MG.CHAR_ORDER.slice(); // tests may use every character
  ctx.MG.TEST_FULL_PARTY = true;
  ctx.MG.Save.load();
  return ctx.MG;
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    '));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error('assertion failed: ' + msg);
}

const DT = 1 / 60;

/** Put the game into a battle on the given node type (rewrites the first start node). */
function startBattle(MG, gm, opts) {
  const o = opts || {};
  MG.RUN_CONFIG.startPartySize = 6;
  gm.newRun(o.seed || 123, { party: ['rozel', 'luna', 'bella', 'amore', 'sylphy', 'cheongryeon'] });
  MG.RUN_CONFIG.startPartySize = 4;
  const run = gm.run;
  // fixed layout used by the assertions below
  run.party.slots = { '0-front': 'rozel', '0-back': 'luna', '1-front': 'bella', '1-back': null };
  run.party.bench = ['amore', 'sylphy', 'cheongryeon'];
  const node = run.map.nodes[run.map.startIds[0]];
  node.type = o.type || 'battle';
  node.defense = !!o.defense;
  node.difficulty = o.difficulty || 1;
  if (o.relics) run.relics.push(...o.relics);
  gm.selectNode(node.id);
  return gm.battle;
}

function simulate(gm, maxSeconds, onTick) {
  let t = 0;
  while (t < maxSeconds && gm.state === 'BATTLE') {
    gm.update(DT);
    t += DT;
    if (onTick) onTick(gm.battle, t);
  }
  return t;
}

/** Simple autopilot: cast every ready skill, replace fallen units from the bench. */
function autopilot(MG, gm) {
  const b = gm.battle;
  if (!b) return;
  for (const u of b.party.fieldUnits()) if (MG.SkillSystem.canCast(b, u).ok) MG.SkillSystem.cast(b, u);
  for (const key of MG.FormationSystem.allKeys()) {
    const id = b.party.slots[key];
    if (!id || b.party.get(id).hp <= 0) {
      const benchAlive = b.party.bench.find((x) => b.party.isAlive(x));
      if (benchAlive && b.swapCd <= 0) b.party.swap(benchAlive, key, b);
    }
  }
}

console.log('Map');
test('generated maps are connected, branch, and only use implemented node types', () => {
  const MG = load();
  for (let s = 1; s <= 60; s++) {
    const map = MG.MapManager.generate(MG.RNG(s));
    const v = MG.MapManager.validate(map);
    assert(v.allReachable, 'reachable seed ' + s);
    assert(v.allLeadToEnd, 'leads to end seed ' + s);
    assert(v.noUnimplemented, 'no shop nodes seed ' + s);
    assert(map.nodes[map.finalId].type === 'final', 'final node');
    const branching = Object.values(map.nodes).some((n) => n.next.length > 1);
    const merging = Object.values(map.nodes).some((n) => n.prev.length > 1);
    assert(branching && merging, 'has forks and merges seed ' + s);
  }
});

test('only connected nodes are selectable', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(5);
  const run = gm.run;
  const notStart = Object.values(run.map.nodes).find((n) => n.col === 2);
  assert(!gm.selectNode(notStart.id), 'cannot jump ahead');
  assert(gm.state === 'MAP', 'still on map');
});

console.log('State machine');
test('illegal transitions are rejected', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(1);
  assert(!gm.sm.go('REWARD'), 'MAP -> REWARD rejected');
  assert(gm.state === 'MAP', 'state unchanged');
  assert(gm.chooseReward(0) === null, 'reward cannot be chosen outside REWARD');
});

console.log('Battle flow');
test('advance -> combat -> waveClear -> advance ... -> nodeClear -> REWARD, each wave cleared once', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 7 });
  const phases = [b.phase];
  let waveEnds = 0;
  b.bus.on('phase', ({ phase }) => phases.push(phase));
  b.bus.on('waveEnd', () => waveEnds++);
  let stateDuringCombat = new Set();
  simulate(gm, 400, (bb) => {
    autopilot(MG, gm);
    if (bb.phase === 'combat') stateDuringCombat.add(gm.state);
  });
  assert(gm.state === 'REWARD', 'ended in REWARD, got ' + gm.state + ' phases ' + phases.join(','));
  assert(waveEnds === b.waves.length, `waveEnd fired once per wave (${waveEnds}/${b.waves.length})`);
  assert(phases[0] === 'advance' && phases.includes('combat'), 'starts by advancing');
  const advances = phases.filter((p) => p === 'advance').length;
  assert(advances === b.waves.length, 'advance before every wave');
  assert(phases[phases.length - 2] === 'nodeClear', 'nodeClear at end');
  assert([...stateDuringCombat].every((s) => s === 'BATTLE'), 'no reward while fighting');
});

test('allies attack automatically without input', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 3 });
  simulate(gm, 25);
  assert(b.stats.kills > 0, 'kills without input: ' + b.stats.kills);
  assert(b.stats.skills === 0, 'no skill used');
});

test('enemy waves are not spawned twice', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 11 });
  const spawned = {};
  const orig = MG.LaneManager.spawnEnemy.bind(MG.LaneManager);
  MG.LaneManager.spawnEnemy = (battle, id, lane) => {
    spawned[battle.waveIndex] = (spawned[battle.waveIndex] || 0) + 1;
    return orig(battle, id, lane);
  };
  simulate(gm, 400, () => autopilot(MG, gm));
  b.waves.forEach((w, i) => assert(spawned[i] === w.spawns.length, `wave ${i} spawned ${spawned[i]} of ${w.spawns.length}`));
});

console.log('Party / formation / skills');
test('swap: bench unit enters, HP kept on retreat, cooldown applies, dead cannot enter', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 2 });
  const P = b.party;
  P.get('rozel').hp = 100;
  const r1 = P.swap('amore', '0-front', b);
  assert(r1.ok, 'swap ok');
  assert(P.slots['0-front'] === 'amore' && P.bench.includes('rozel'), 'positions changed');
  assert(P.get('rozel').hp === 100, 'hp kept');
  const r2 = P.swap('sylphy', '1-back', b);
  assert(!r2.ok, 'cooldown blocks second swap');
  P.get('sylphy').hp = 0;
  b.swapCd = 0;
  assert(!P.swap('sylphy', '1-back', b).ok, 'dead unit cannot be swapped in');
});

test('formation swap exchanges front and back', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 2 });
  const P = b.party;
  const f = P.slots['0-front'];
  const k = P.slots['0-back'];
  assert(MG.FormationSystem.swapRows(P, 0, b).ok, 'swap ok');
  assert(P.slots['0-front'] === k && P.slots['0-back'] === f, 'rows swapped');
});

test('lane move takes time, unit leaves combat then arrives in the other lane', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 2 });
  const P = b.party;
  assert(P.moveLane('luna', b).ok, 'move started');
  assert(!P.keyOf('luna'), 'not in a slot while moving');
  assert(P.isReserved('1-back'), 'target slot reserved');
  simulate(gm, 1.0);
  assert(!P.keyOf('luna'), 'still travelling after 1s');
  simulate(gm, 1.2);
  assert(P.keyOf('luna') === '1-back', 'arrived: ' + P.keyOf('luna'));
});

test('skills change combat state (damage, heal, shield, stun)', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 4 });
  simulate(gm, 3.5); // into combat
  while (!b.enemies.some((e) => !e.dead && e.lane === 0 && e.x < 1200)) simulate(gm, 0.1);
  const rozel = b.party.get('rozel');
  rozel.skillCd = 0;
  const hpBefore = b.enemies.filter((e) => e.lane === 0 && !e.dead).reduce((a, e) => a + e.hp, 0);
  assert(MG.SkillSystem.cast(b, rozel).ok, 'cast ok');
  simulate(gm, 0.3);
  const hpAfter = b.enemies.filter((e) => e.lane === 0 && !e.dead).reduce((a, e) => a + e.hp, 0);
  assert(hpAfter < hpBefore - 50 || b.stats.kills > 0, 'single target skill dealt damage');
  assert(!MG.SkillSystem.cast(b, rozel).ok, 'cooldown blocks recast');

  const bella = b.party.get('bella');
  bella.skillCd = 0;
  assert(MG.SkillSystem.cast(b, bella).ok, 'bella cast');
  simulate(gm, 0.3);
  assert(bella.b.shield > 0, 'bella shield');
  b.party.swap('amore', '0-back', b);
  const amore = b.party.get('amore');
  bella.hp = 100;
  amore.skillCd = 0;
  simulate(gm, 0.1);
  assert(MG.SkillSystem.cast(b, amore).ok, 'amore cast');
  simulate(gm, 0.3);
  assert(bella.hp > 100, 'heal applied');
});

console.log('Lanes');
test('lanes are independent; defense leaks reduce shared life', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 9, defense: true });
  // empty the lower lane
  b.party.slots['1-front'] = null;
  b.party.bench.push('bella');
  // force a wave with enemies on both lanes
  b.waves = [{ index: 0, spawns: [{ t: 0, enemy: 'bat', lane: 0 }, { t: 0, enemy: 'bat', lane: 1 }], startCondition: { delay: 0 }, lanes: [0, 1] }];
  const life = gm.run.life;
  let leaked = 0;
  b.bus.on('leak', () => leaked++);
  simulate(gm, 30);
  assert(leaked === 1, 'one enemy leaked from the empty lane: ' + leaked);
  assert(gm.run.life === life - 1, 'shared life reduced');
  assert(b.stats.kills >= 1, 'upper lane still fought');
});

test('non-defense: enemies in an empty lane wait instead of leaking', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 9, defense: false });
  b.party.slots['1-front'] = null;
  b.party.bench.push('bella');
  b.waves = [{ index: 0, spawns: [{ t: 0, enemy: 'bat', lane: 1 }], startCondition: { delay: 0 }, lanes: [1] }];
  const life = gm.run.life;
  simulate(gm, 25);
  assert(gm.run.life === life, 'no life loss');
  const e = b.enemies.find((x) => x.lane === 1);
  assert(e && !e.dead && e.state === 'wait', 'enemy waiting');
  assert(b.phase === 'combat', 'wave not cleared while enemy alive');
});

test('defeat when shared life reaches 0', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 9, defense: true });
  gm.run.life = 0;
  simulate(gm, 5);
  assert(gm.state === 'RUN_FAILED', 'run failed: ' + gm.state);
});

console.log('Relics & synergies');
test('ember core procs extra fire damage on basic hits', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 21, relics: ['ember_core'] });
  simulate(gm, 30);
  assert((b.procs.ember_core || 0) > 0, 'procs ' + b.procs.ember_core);
});

test('resonance sigil scales attack speed with fire relics; synergy doubles it', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 21, relics: ['resonance_sigil', 'ember_core'] });
  const u = b.party.get('rozel');
  const s1 = MG.CombatSystem.stat(u, 'atkSpeed', b);
  assert(Math.abs(s1 - 1.1) < 1e-9, 'two fire relics = +10%: ' + s1);
  gm.run.relics.push('crimson_ribbon');
  const s2 = MG.CombatSystem.stat(u, 'atkSpeed', b);
  assert(MG.RelicSystem.hasSyn(gm.run, 'blazing_resonance'), 'synergy active');
  assert(Math.abs(s2 - 1.3) < 1e-9, 'three fire relics with synergy = +30%: ' + s2);
});

test('chain seal: def per healer/assault on field', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 21, relics: ['chain_seal'] });
  const u = b.party.get('bella');
  // field: rozel (assault), luna, bella -> 1 qualifying
  const d = MG.CombatSystem.stat(u, 'def', b);
  assert(Math.abs(d - u.def.stats.def * 1.05) < 1e-9, 'def +5%: ' + d);
});

test('spreading flame synergy marks and spreads', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 22, relics: ['ember_core', 'hunters_mark'] });
  MG.RELICS.ember_core.effect.chance = 1; // deterministic for the test
  simulate(gm, 40, () => autopilot(MG, gm));
  MG.RELICS.ember_core.effect.chance = 0.2;
  assert((b.procs.spreading_flame || 0) > 0, 'synergy procs ' + b.procs.spreading_flame);
});

test('guardian shard + chain seal: shield on swap-in boosted by synergy', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 23, relics: ['guardian_shard', 'chain_seal'] });
  b.party.swap('amore', '1-back', b);
  const u = b.party.get('amore');
  assert(Math.abs(u.b.shield - u.maxHp * 0.45) < 1e-6, 'shield 30% * 1.5: ' + u.b.shield);
  assert(b.procs.iron_chain === 1, 'synergy proc recorded');
});

test('pursuer medal buffs attack at wave start; echo pursuit readies skill', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 24, relics: ['pursuer_medal', 'echo_crystal'] });
  assert(b.hasteUnitId, 'echo target chosen');
  const u = b.party.get('rozel');
  const before = MG.CombatSystem.stat(u, 'atk', b);
  simulate(gm, 2.5); // wave starts
  const after = MG.CombatSystem.stat(u, 'atk', b);
  assert(Math.abs(after / before - 1.5) < 1e-9, 'atk +50%');
  assert(b.party.get(b.hasteUnitId).skillCd === 0 || b.procs.echo_pursuit, 'skill ready');
});

test('relic chains cannot recurse infinitely (explosion kills do not explode)', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 25, relics: ['crimson_ribbon', 'ember_core', 'hunters_mark', 'thorn_rosary'] });
  MG.RELICS.ember_core.effect.chance = 1;
  simulate(gm, 60, () => autopilot(MG, gm));
  MG.RELICS.ember_core.effect.chance = 0.2;
  assert(b.depth === 0, 'depth unwound');
});

console.log('Full runs');
test('autoplayed runs finish (clear or fail) without errors across seeds', () => {
  let cleared = 0;
  let failedRuns = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const MG = load();
    const gm = new MG.GameManager();
    gm.newRun(seed);
    let guard = 0;
    while (!['RUN_CLEARED', 'RUN_FAILED'].includes(gm.state) && guard++ < 200) {
      switch (gm.state) {
        case 'MAP': {
          const sel = MG.ExplorationManager.selectable(gm.run);
          // prefer battles to exercise combat; heal with potions when low
          for (const u of gm.run.party.all()) if (u.hp > 0 && u.hp < u.maxHp * 0.5) gm.usePotion(u.id);
          gm.selectNode(sel[0]);
          break;
        }
        case 'BATTLE':
          simulate(gm, 900, () => autopilot(MG, gm));
          break;
        case 'REWARD':
          gm.chooseReward(0);
          break;
        case 'EVENT': {
          const idx = gm.ctx.event.choices.findIndex((c) => MG.NodeManager.requirementMet(gm.run, c));
          gm.chooseEvent(idx);
          gm.finishNode();
          break;
        }
        case 'REST':
          gm.chooseRest('rest');
          gm.finishNode();
          break;
        case 'RELIC':
          if (gm.ctx.choices.length) gm.pickRelic(gm.ctx.choices[0]);
          else gm.skipRelic();
          break;
        case 'SHOP':
          for (let i = 0; i < gm.ctx.node.shop.items.length; i++) gm.shopBuy(i);
          gm.leaveShop();
          break;
        case 'RECRUIT':
          gm.recruit(gm.ctx.candidates[0]);
          break;
        default:
          throw new Error('stuck in ' + gm.state);
      }
    }
    assert(['RUN_CLEARED', 'RUN_FAILED'].includes(gm.state), `seed ${seed} ended in ${gm.state}`);
    if (gm.state === 'RUN_CLEARED') cleared++;
    else failedRuns++;
    assert(MG.warnings.length === 0, 'no illegal transitions: ' + MG.warnings.join('; '));
    // restart works
    gm.newRun(seed + 100);
    assert(gm.state === 'MAP' && gm.run.relics.length === 0, 'restart gives fresh run');
  }
  console.log(`    (autopilot: ${cleared} cleared, ${failedRuns} failed)`);
});


console.log('Expansion: map / determinism');
test('200 seeds: shop exists, recruit in columns 1~3, all reachable', () => {
  const MG = load();
  for (let seed = 1; seed <= 200; seed++) {
    const gm = new MG.GameManager();
    gm.newRun(seed);
    const map = gm.run.map;
    const v = MG.MapManager.validate(map);
    assert(v.allReachable && v.allLeadToEnd && v.noUnimplemented, 'valid map ' + seed);
    const nodes = Object.values(map.nodes);
    assert(nodes.some((n) => n.type === 'shop'), 'shop seed ' + seed);
    assert(nodes.some((n) => n.type === 'recruit' && n.col <= 2), 'recruit in cols 1~3 seed ' + seed);
  }
});

test('same seed -> same map, wave plans and event order; preview does not consume run.rng', () => {
  const MG = load();
  const sig = () => {
    const gm = new MG.GameManager();
    gm.newRun(77);
    const run = gm.run;
    const before = run.rng.next();
    const gm2 = new MG.GameManager();
    gm2.newRun(77);
    for (const n of Object.values(gm2.run.map.nodes)) if (MG.NODE_TYPES[n.type].battle) MG.WaveManager.planFor(gm2.run, n);
    const after = gm2.run.rng.next();
    assert(before === after, 'planFor/preview left run.rng untouched');
    const plans = Object.values(gm2.run.map.nodes).filter((n) => n.plan).map((n) => JSON.stringify(n.plan)).join('|');
    return JSON.stringify(Object.values(gm.run.map.nodes).map((n) => [n.id, n.type, n.next])) + plans;
  };
  assert(sig() === sig(), 'deterministic');
  // battle uses exactly the previewed plan
  const gm = new MG.GameManager();
  gm.newRun(78);
  const node = gm.run.map.nodes[gm.run.map.startIds[0]];
  const plan = JSON.stringify(MG.WaveManager.planFor(gm.run, node).map((w) => w.spawns));
  gm.selectNode(node.id);
  assert(JSON.stringify(gm.battle.waves.map((w) => w.spawns.map(({ t, enemy, lane }) => ({ t, enemy, lane })))) === plan, 'battle waves == preview');
  const prev = MG.WaveManager.preview(gm.battle, 0);
  const total = prev.reduce((a, p) => a + p.count, 0);
  assert(total === gm.battle.waves[0].spawns.length, 'preview counts current wave');
});

console.log('Expansion: relics / mods / shop');
test('curse relics apply their costs in battle', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 31, relics: ['blood_oath', 'glass_crown'] });
  // blood oath already applied at battleStart (inside selectNode)
  const r = b.party.get('rozel');
  assert(r.hp === r.maxHp - Math.round(r.maxHp * 0.1), 'blood oath hp cost: ' + r.hp);
  const atk = MG.CombatSystem.stat(r, 'atk', b);
  assert(Math.abs(atk / r.def.stats.atk - 1.75) < 1e-9, 'atk +30% +45%');
  assert(Math.abs(MG.CombatSystem.damageTakenMult(b, r) - 1.3) < 1e-9, 'glass crown +30% taken');
  gm.run.relics.push('hungry_grail');
  assert(MG.RelicSystem.shardMult(gm.run) === 0.5, 'hungry grail halves shards');
});

test('phoenix feather saves once per battle and resets next battle', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 32, relics: ['phoenix_feather'] });
  const u = b.party.get('rozel');
  MG.CombatSystem.dealToAlly(b, null, u, 99999);
  assert(u.hp > 0 && b.phoenixUsed, 'first lethal hit saved');
  MG.CombatSystem.dealToAlly(b, null, u, 99999);
  assert(u.hp === 0, 'second lethal hit not saved');
  const b2 = MG.WaveManager.createBattle(gm.run, b.node);
  assert(!b2.phoenixUsed, 'flag resets for the next battle');
});

test('skill mods change effective values once (cooldown, tooltip, effect)', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 33 });
  const r = b.party.get('rozel');
  r.mods.push('rozel_thorn', 'rozel_thirst');
  const sk = MG.SkillSystem.effective(r);
  assert(sk.mult === 6 && sk.cooldown === 8, 'patched values');
  assert(MG.SkillSystem.describe(r).includes('600'), 'tooltip uses effective value');
  assert(MG.CHARACTERS.rozel.skill.mult === 4.5, 'base data untouched');
  simulate(gm, 3.5);
  while (!b.enemies.some((e) => !e.dead && e.lane === 0 && e.x < 1200)) simulate(gm, 0.1);
  r.skillCd = 0;
  MG.SkillSystem.cast(b, r);
  assert(r.skillCd === 8, 'cooldown from mod');
});

test('shop: prices, insufficient shards, sold flag, reroll keeps fixed goods', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(40);
  const run = gm.run;
  const node = Object.values(run.map.nodes).find((n) => n.type === 'shop');
  const shop = MG.ShopSystem.open(run, node);
  assert(shop.items.length === 7, '3 relics + 2 mods + potion + elixir');
  run.shards = 0;
  assert(!MG.ShopSystem.buy(run, node, 5).ok, 'cannot buy without shards');
  run.shards = 100;
  const potionIdx = shop.items.findIndex((i) => i.kind === 'potion');
  const pots = run.potions;
  assert(MG.ShopSystem.buy(run, node, potionIdx).ok && run.potions === pots + 1, 'bought potion');
  assert(!MG.ShopSystem.buy(run, node, potionIdx).ok, 'sold out');
  const before = run.shards;
  assert(MG.ShopSystem.reroll(run, node).ok && run.shards === before - 8, 'reroll costs 8');
  assert(node.shop.items.find((i) => i.kind === 'potion').sold, 'fixed goods kept after reroll');
  assert(MG.ShopSystem.rerollCost(run, node) === 12, 'next reroll +4');
});

console.log('Expansion: events / recruit');
test('new event ops change state', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(50);
  const run = gm.run;
  const A = (ops) => MG.NodeManager.applyOps(run, ops, {});
  run.relics.push('glass_crown');
  A([{ op: 'removeCurse' }]);
  assert(!run.relics.includes('glass_crown'), 'curse removed');
  A([{ op: 'runBonus', stat: 'hp', pct: 0.1 }]);
  const u = run.party.get('rozel');
  assert(u.maxHp === Math.round(420 * 1.1), 'max hp bonus');
  A([{ op: 'nextBattles', n: 2, stat: 'atk', pct: 0.2 }]);
  A([{ op: 'flag', set: 'x' }, { op: 'discount', pct: 0.25 }, { op: 'ambush', pct: 0.15 }]);
  assert(run.flags.x && run.shopDiscount === 0.25 && run.scout === -0.15, 'flag / discount / ambush');
  A([{ op: 'mod', unit: 'rozel' }]);
  assert(u.mods.length === 1, 'mod granted');
  u.hp = 0;
  A([{ op: 'reviveOne', pct: 0.5 }]);
  assert(u.hp === Math.round(u.maxHp * 0.5), 'revived');
  run.relics.push('ember_core', 'bell_charm');
  const n = run.relics.length;
  A([{ op: 'sacrificeRelic' }]);
  assert(run.relics.length === n - 1, 'relic sacrificed');
  const ctx = {};
  MG.NodeManager.applyOps(run, [{ op: 'recruit' }], ctx);
  assert(ctx.followUp && ctx.followUp.kind === 'recruit', 'recruit follow-up');
  // next battles bonus is consumed
  const node = run.map.nodes[run.map.startIds[0]];
  node.type = 'battle';
  const b = MG.WaveManager.createBattle(run, node);
  assert(b.tempBonus.atk === 0.2 && run.nextBattles[0].n === 1, 'nextBattles consumed one');
  assert(MG.EVENTS.length >= 20, '20+ events');
});

test('chained events need their flag', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(51);
  const run = gm.run;
  for (let i = 0; i < 300; i++) {
    const ev = MG.NodeManager.pickEvent(run, 5);
    assert(!['peddler_return', 'mirror_us', 'letter_owner'].includes(ev.id), 'no follow-up without flag');
  }
  run.flags.letter = true;
  run.seenEvents = MG.EVENTS.filter((e) => e.id !== 'letter_owner').map((e) => e.id);
  assert(MG.NodeManager.pickEvent(run, 5).id === 'letter_owner', 'follow-up appears with flag');
  assert(!MG.NodeManager.eventAllowed(run, MG.EVENTS.find((e) => e.id === 'letter_owner'), 2), 'respects minCol');
});

test('recruit node adds a member; party never exceeds 6', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(52);
  const run = gm.run;
  const size = run.party.size();
  const node = Object.values(run.map.nodes).find((n) => n.type === 'recruit');
  const c = MG.NodeManager.enter(run, node);
  assert(c.kind === 'recruit' && c.candidates.length === 2, 'two candidates');
  assert(c.candidates.every((id) => !run.party.has(id)), 'candidates not in party');
  run.party.addUnit(c.candidates[0], true);
  assert(run.party.size() === size + 1, 'joined');
  for (const id of MG.CHAR_ORDER) run.party.addUnit(id, true);
  assert(run.party.size() === 6, 'max 6');
  assert(!MG.NodeManager.canRecruit(run), 'no recruits when full');
});

console.log('Expansion: save / meta');
test('save: normal, corrupt, blocked storage', () => {
  const MG = load();
  const store = {};
  MG.window = MG.window || {};
  const ctxWindow = (function () { return this; })();
  // normal: fake localStorage in the vm global
  const fake = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
  global.__fakeLS = fake;
  MG._setLS = true;
  const vmWin = MG.__win;
  // reuse SaveManager through a fresh context with localStorage
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, Date, Set, Map, JSON, localStorage: fake, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'), escape, unescape };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of LOGIC_FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const S = ctx.MG.Save;
  S.load();
  assert(S.persistent, 'persistent with storage');
  S.update((d) => (d.moon = 42));
  S.flush();
  S.load();
  assert(S.get().moon === 42, 'value survives reload');
  const exported = S.exportString();
  store.mg_save = '{broken json';
  S.load();
  assert(S.get().moon === 0 && store.mg_save_corrupt === '{broken json', 'corrupt save backed up and reset');
  assert(S.importString(exported).ok && S.get().moon === 42, 'import restores');
  S._forceFail = true;
  S.load();
  assert(!S.persistent && S.get().moon === 0, 'blocked storage falls back to memory');
  S.update((d) => (d.moon = 5));
  assert(S.get().moon === 5, 'memory fallback works');
});

test('meta: buying upgrades changes new runs; locked characters excluded; moonlight settles', () => {
  const MG = load();
  MG.DEFAULT_UNLOCKED = ['rozel', 'luna', 'bella', 'amore'];
  MG.Save.reset();
  MG.Save.update((d) => (d.moon = 500));
  for (const id of ['m_shards', 'm_potion', 'm_life', 'm_atk', 'm_discount', 'u_sylphy']) assert(MG.Meta.buy(id).ok, 'buy ' + id);
  assert(!MG.Meta.buy('m_opening').ok, 'prerequisite enforced');
  const gm = new MG.GameManager();
  gm.newRun(60, { party: ['rozel', 'luna', 'bella', 'cheongryeon'] });
  const run = gm.run;
  assert(run.shards === 14 && run.potions === 3 && run.life === 11 && run.maxLife === 11, 'start resources');
  assert(!run.party.has('cheongryeon'), 'locked character filtered out');
  assert(MG.NodeManager.recruitPool(run).includes('sylphy') && !MG.NodeManager.recruitPool(run).includes('cheongryeon'), 'unlock respected by recruit pool');
  const node = run.map.nodes[run.map.startIds[0]];
  node.type = 'battle';
  gm.selectNode(node.id);
  const r = gm.battle.party.get('rozel');
  assert(Math.abs(MG.CombatSystem.stat(r, 'atk', gm.battle) / 40 - 1.02) < 1e-9, 'meta atk +2%');
  assert(Math.abs(MG.ShopSystem.priceMult(run) - 0.92) < 1e-9, 'shop discount');
  run.stats.nodes = 4;
  run.stats.battlesWon = 3;
  run.stats.elites = 1;
  run.shards = 23;
  const moonBefore = MG.Save.get().moon;
  const st = MG.Meta.settle(run, false);
  assert(st.total === 4 * 3 + 3 + 5 + 4 + (run.codexNew || 0) * 2, 'moonlight formula ' + st.total);
  assert(MG.Save.get().moon === moonBefore + st.total, 'saved');
  assert(MG.Meta.settle(run, false) === st, 'settled once');
});

test('ascension raises enemy hp and lowers life', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(70, { asc: 3 });
  assert(gm.run.maxLife === MG.MAP_CONFIG.startingLife - 2, 'asc 3: life -2');
  const hp0 = MG.LaneManager.scaledHp(MG.ENEMIES.bat, 1, { asc: 0 }, 0);
  const hp1 = MG.LaneManager.scaledHp(MG.ENEMIES.bat, 1, { asc: 1 }, 0);
  assert(hp1 === Math.round(hp0 * 1.1), 'asc 1: +10% hp');
});

test('every character skill casts without errors', () => {
  const MG = load();
  for (const id of MG.CHAR_ORDER) {
    const gm = new MG.GameManager();
    const b = startBattle(MG, gm, { seed: 90 });
    if (!b.party.units[id]) {
      const drop = b.party.bench.find((x) => x !== id);
      delete b.party.units[drop];
      b.party.bench = b.party.bench.filter((x) => x !== drop);
      b.party.addUnit(id, false);
    }
    b.party.slots['1-back'] = id;
    b.party.bench = b.party.bench.filter((x) => x !== id);
    MG.CombatSystem.resetUnitBattleState(b.party.get(id), b, false);
    simulate(gm, 3.5);
    let guard = 0;
    while (!b.enemies.some((e) => !e.dead && e.lane === 1 && e.x < 1200) && guard++ < 200) simulate(gm, 0.1);
    const u = b.party.get(id);
    u.skillCd = 0;
    const dmgBefore = b.stats.damage;
    const r = MG.SkillSystem.cast(b, u);
    simulate(gm, 1.5);
    assert(r.ok || r.reason === '대상 없음', id + ' cast: ' + r.reason);
    if (['aoe', 'single', 'freeze', 'void', 'multi', 'tag', 'sanctuary'].includes(u.def.skill.type) && r.ok) assert(b.stats.damage > dmgBefore, id + ' dealt damage');
  }
});


console.log('Depths');
test('final battle: bishop boss only from depth 3; depth raises difficulty', () => {
  const MG = load();
  for (let d = 1; d <= 5; d++) {
    const gm = new MG.GameManager();
    gm.newRun(100 + d);
    const run = gm.run;
    run.depth = d;
    run.map = MG.MapManager.generate(run.rng, { depth: d });
    const fin = run.map.nodes[run.map.finalId];
    assert(fin.id.startsWith('d' + d), 'depth-prefixed ids');
    assert(fin.difficulty === MG.DEPTHS[d - 1].finalDifficulty, 'final difficulty');
    const plan = MG.WaveManager.planFor(run, fin);
    const hasBishop = plan.some((w) => w.spawns.some((sp) => sp.enemy === 'thorn_bishop'));
    assert(hasBishop === d >= 3, `depth ${d} bishop=${hasBishop}`);
    const first = run.map.nodes[run.map.startIds[0]];
    assert(first.difficulty === 1 + MG.DEPTHS[d - 1].difficultyOffset, 'start difficulty offset');
  }
});

test('clearing a depth final gives rewards and opens the next depth; depth 5 final ends the run', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(120);
  const run = gm.run;
  run.relics.push('ember_core');
  // jump to the final node of depth 1
  run.currentId = run.map.startIds[0];
  run.completed.add(run.currentId);
  const fin = run.map.nodes[run.map.finalId];
  for (const n of Object.values(run.map.nodes)) if (n.col === fin.col - 1) n.next = [fin.id];
  run.currentId = Object.values(run.map.nodes).find((n) => n.col === fin.col - 1).id;
  run.completed.add(run.currentId);
  gm.selectNode(fin.id);
  assert(gm.state === 'BATTLE', 'final battle');
  gm.battle.result = 'victory';
  gm.update(1 / 60);
  assert(gm.state === 'REWARD', 'depth 1 final gives a reward: ' + gm.state);
  const hpBefore = run.party.get('rozel').hp;
  gm.chooseReward(0);
  assert(gm.state === 'MAP' && run.depth === 2, 'descended to depth 2');
  assert(run.map.depth === 2 && run.completed.size === 0 && run.currentId === null, 'fresh map');
  assert(run.relics.includes('ember_core') && run.relics.length >= 2, 'relics kept');
  assert(run.stats.depthsCleared === 1, 'depth counted');
  // depth 5 final ends the run
  run.depth = 5;
  run.map = MG.MapManager.generate(run.rng, { depth: 5 });
  const f5 = run.map.nodes[run.map.finalId];
  run.currentId = Object.values(run.map.nodes).find((n) => n.col === f5.col - 1).id;
  run.completed.add(run.currentId);
  run.map.nodes[run.currentId].next = [f5.id];
  gm.selectNode(f5.id);
  gm.battle.result = 'victory';
  gm.update(1 / 60);
  assert(gm.state === 'RUN_CLEARED', 'depth 5 clears the run: ' + gm.state);
});

console.log('Formation / retreat');
test('retreat to bench, front/back move with an empty slot, cooldown applies', () => {
  const MG = load();
  const gm = new MG.GameManager();
  const b = startBattle(MG, gm, { seed: 130 });
  const P = b.party;
  assert(P.retreat('0-back', b).ok, 'retreat ok');
  assert(P.slots['0-back'] === null && P.bench.includes('luna'), 'luna on bench');
  assert(!P.retreat('0-front', b).ok, 'cooldown blocks a second retreat');
  // front -> back in a lane with an empty back slot
  assert(MG.FormationSystem.swapRows(P, 0, b).ok, 'row swap ok');
  assert(P.slots['0-back'] === 'rozel' && P.slots['0-front'] === null, 'rozel moved to back');
  // map (no battle): retreat via swapFree to the end of the bench
  const gm2 = new MG.GameManager();
  gm2.newRun(131);
  const P2 = gm2.run.party;
  const id = P2.slots['0-front'];
  P2.swapFree({ type: 'slot', key: '0-front' }, { type: 'bench', index: P2.bench.length });
  assert(P2.slots['0-front'] === null && P2.bench.includes(id), 'map retreat');
});

test('relic events grant relics', () => {
  const MG = load();
  const gm = new MG.GameManager();
  gm.newRun(140);
  const run = gm.run;
  for (const id of ['forgotten_vault', 'pilgrim', 'three_altars', 'mimic_chest', 'frozen_relic']) assert(MG.EVENTS.some((e) => e.id === id), 'event ' + id);
  const ev = MG.EVENTS.find((e) => e.id === 'three_altars');
  const n = run.relics.length;
  MG.NodeManager.applyOps(run, ev.choices[0].ops, {});
  assert(run.relics.length === n + 1 && MG.RELICS[run.relics[n]].tags.includes('fire'), 'fire altar gives a fire relic');
  const ctx = {};
  MG.NodeManager.applyOps(run, MG.EVENTS.find((e) => e.id === 'forgotten_vault').choices[0].ops, ctx);
  assert(ctx.followUp && ctx.followUp.kind === 'relic' && ctx.followUp.choices.length === 3, 'vault offers 3 relics');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
