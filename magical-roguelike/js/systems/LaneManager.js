// Two independent advance lanes: enemy movement/attacks per lane, home-point leaks, threat info.
(function () {
  const MG = (window.MG = window.MG || {});
  const G = () => MG.FormationSystem.G;

  const LaneManager = {
    LANE_NAMES: ['상단 진격로', '하단 진격로'],

    /** Enemy HP after difficulty, ascension and scouting (shared with wave previews). */
    scaledHp(d, difficulty, run, scout) {
      const sc = MG.DIFFICULTY_SCALING;
      const asc = (run && run.asc) || 0;
      let hp = d.hp * (1 + sc.hpPerLevel * (difficulty - 1)) * (1 - (scout || 0));
      if (asc >= 1) hp *= 1.1;
      if (asc >= 5 && d.boss) hp *= 1.25;
      return Math.round(hp);
    },

    spawnEnemy(battle, enemyId, lane) {
      const d = MG.ENEMIES[enemyId];
      const lvl = battle.node.difficulty - 1;
      const sc = MG.DIFFICULTY_SCALING;
      const hp = this.scaledHp(d, battle.node.difficulty, battle.run, battle.scout);
      const art = MG.ENEMY_ART[enemyId];
      const e = {
        uid: MG.uid('e'),
        id: enemyId,
        data: d,
        name: d.name,
        lane,
        x: G().SPAWN_X + Math.random() * 30,
        y: G().LANE_Y[lane] - (d.flying ? 30 : 0),
        hp,
        maxHp: hp,
        atk: d.atk * (1 + sc.atkPerLevel * lvl),
        armor: d.def,
        armorPierce: d.armorPierce || 0,
        speed: d.speed,
        range: d.range,
        atkTimer: 0,
        stagger: Math.random() * 36,
        w: art.frames[0][0].length * art.scale,
        h: art.frames[0].length * art.scale,
        dead: false,
        deathT: 0,
        hitFlash: 0,
        lunge: 0,
        stunUntil: 0,
        slowUntil: 0,
        slowPct: 0,
        markUntil: 0,
        markAmp: 0,
        summonT: 0,
        summonEvery: d.summon ? d.summon.every * ((battle.run.asc || 0) >= 5 ? 0.75 : 1) : 0,
        summonWarned: false,
        wave: battle.waveIndex,
        state: 'walk',
      };
      battle.enemies.push(e);
      if (MG.Meta) MG.Meta.discover(battle.run, 'enemies', enemyId);
      return e;
    },

    /** Ally an enemy in this lane should fight, or null if the lane is empty. */
    laneTarget(battle, lane) {
      return battle.party.laneFront(lane);
    },

    updateEnemies(battle, dt) {
      if (battle.phase !== 'combat') return;
      for (const e of battle.enemies) {
        if (e.dead) continue;
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.lunge = Math.max(0, e.lunge - dt);
        if (e.stunUntil > battle.time) {
          e.state = 'stun';
          continue;
        }
        e.frozen = false;
        const slow = e.slowUntil > battle.time ? 1 - e.slowPct : 1;
        const target = this.laneTarget(battle, e.lane);
        let stopX;
        if (target) stopX = target.b.x + e.range + e.stagger;
        else stopX = battle.defense ? G().HOME_X - 20 : G().WAIT_X + e.stagger;

        if (e.x > stopX + 1) {
          e.x = Math.max(stopX, e.x - e.speed * slow * dt);
          e.state = 'walk';
        } else if (target) {
          e.state = 'attack';
          e.atkTimer += dt;
          if (e.atkTimer >= e.data.atkInterval) {
            e.atkTimer = 0;
            e.lunge = 0.18;
            if (e.data.ranged) {
              battle.projectiles.push({
                from: 'enemy', owner: e, x: e.x - e.w / 2, y: e.y - e.h * 0.6, target, speed: 520,
                raw: e.atk, color: e.data.projColor || '#c7a0d9',
              });
            } else {
              MG.CombatSystem.dealToAlly(battle, e, target, e.atk);
            }
          }
        } else {
          e.state = 'wait';
        }

        // home point reached (defense nodes only)
        if (battle.defense && !target && e.x <= G().HOME_X) {
          this.leak(battle, e);
        }

        // boss summons
        if (e.data.summon) {
          e.summonT += dt;
          if (!e.summonWarned && e.summonT >= e.summonEvery - 1) {
            e.summonWarned = true;
            for (const l of [0, 1]) battle.warnings.push({ lane: l, until: battle.time + 1, text: '권속 소환 임박' });
            battle.bus.emit('spawnWarning', { lane: e.lane, enemy: e.data.summon.enemy, summon: true });
          }
          if (e.summonT >= e.summonEvery) {
            e.summonT = 0;
            e.summonWarned = false;
            for (let i = 0; i < e.data.summon.count; i++) this.spawnEnemy(battle, e.data.summon.enemy, i % 2);
            battle.float(e.x, e.y - e.h - 20, '권속 소환!', '#e0384f', 1.2);
          }
        }
      }
    },

    leak(battle, e) {
      e.dead = true;
      e.leaked = true;
      e.deathT = 0;
      battle.run.life = Math.max(0, battle.run.life - e.data.lifeDamage);
      battle.stats.leaks++;
      battle.float(G().HOME_X + 30, e.y - 60, `생명 -${e.data.lifeDamage}`, '#ff4f6a', 1.4);
      battle.bus.emit('leak', { enemy: e });
    },

    /** Lane status for the UI: enemy count, closest distance, danger level. */
    threat(battle, lane) {
      const enemies = battle.enemies.filter((e) => !e.dead && e.lane === lane);
      const allies = battle.party.laneUnits(lane);
      const front = battle.party.laneFront(lane);
      const lineX = front ? front.b.x : battle.defense ? G().HOME_X : G().WAIT_X;
      const nearest = enemies.length ? Math.min(...enemies.map((e) => e.x)) - lineX : Infinity;
      const pending = battle.pendingSpawns(lane);
      const enemyHp = enemies.reduce((a, e) => a + e.hp, 0);
      const allyHp = allies.reduce((a, u) => a + u.hp, 0);
      let level = 'safe';
      if (enemies.length || pending) level = 'warn';
      if (enemies.length && (!allies.length || enemyHp > allyHp * 1.2 || (front && front.hp < front.maxHp * 0.3))) level = 'danger';
      if (!allies.length && battle.defense && enemies.length) level = 'danger';
      return { lane, count: enemies.length, pending, nearest, level, empty: !allies.length };
    },
  };

  MG.LaneManager = LaneManager;
})();
