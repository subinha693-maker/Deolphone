// Headless tests for the game logic (no DOM). Run: node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LOGIC_FILES = [
  'js/core/util.js',
  'js/core/StateMachine.js',
  'js/data/config.js',
  'js/data/characters.js',
  'js/data/enemies.js',
  'js/data/relics.js',
  'js/data/nodes.js',
  'js/data/events.js',
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
  'js/core/GameManager.js',
];

function load() {
  const warnings = [];
  const ctx = { console: { log() {}, warn: (m) => warnings.push(m), error: console.error }, Math, Date, Set, Map, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of LOGIC_FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.MG.warnings = warnings;
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
  gm.newRun(o.seed || 123);
  const run = gm.run;
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
          gm.pickRelic(gm.ctx.choices[0]);
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
