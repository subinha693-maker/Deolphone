// Party composition: 4 field slots (2 lanes x front/back), bench queue, swaps and lane moves.
// HP persists for the whole run; battle-only state lives in unit.b and is reset per battle.
(function () {
  const MG = (window.MG = window.MG || {});
  const F = () => MG.FormationSystem;

  const SWAP_COOLDOWN = 5;
  const FIELD_SIZE = 3;
  const MAX_PARTY = 6;
  const FRONT_ROLES = ['guardian', 'assault'];

  class PartyManager {
    constructor() {
      this.units = {};
      this.slots = { '0-front': null, '0-back': null, '1-front': null, '1-back': null };
      this.bench = [];
      this.moving = {}; // unitId -> {fromLane, toLane, toKey, t, total}
      this.run = null;
    }

    /** charIds: chosen members in order; the first FIELD_SIZE go to the field. */
    init(charIds, run) {
      this.run = run || null;
      const ids = (Array.isArray(charIds) ? charIds : charIds.active ? charIds.active.map((a) => a.charId).concat(charIds.bench) : []).slice(0, MAX_PARTY);
      ids.forEach((c, i) => this.addUnit(c, i < FIELD_SIZE));
    }

    makeUnit(charId) {
      const def = MG.CHARACTERS[charId];
      const u = { id: charId, charId, def, hp: def.stats.hp, maxHp: def.stats.hp, mods: [] };
      this.units[charId] = u;
      this.recalcUnit(u);
      u.hp = u.maxHp;
      return u;
    }

    /** Add a member: field if allowed and a slot is free (role-preferred row), else bench. */
    addUnit(charId, toField) {
      if (this.units[charId] || Object.keys(this.units).length >= MAX_PARTY) return null;
      const u = this.makeUnit(charId);
      const fieldCount = Object.values(this.slots).filter(Boolean).length;
      if (toField !== false && fieldCount < FIELD_SIZE) {
        const key = this.pickSlot(u.def.role);
        if (key) {
          this.slots[key] = charId;
          return u;
        }
      }
      this.bench.push(charId);
      return u;
    }

    pickSlot(role) {
      const pref = FRONT_ROLES.includes(role) ? 'front' : 'back';
      const other = pref === 'front' ? 'back' : 'front';
      const laneCount = (l) => ['front', 'back'].filter((s) => this.slots[l + '-' + s]).length;
      const lanes = [0, 1].sort((a, b) => laneCount(a) - laneCount(b) || a - b);
      for (const l of lanes) if (!this.slots[l + '-' + pref]) return l + '-' + pref;
      for (const l of lanes) if (!this.slots[l + '-' + other]) return l + '-' + other;
      return null;
    }

    /** Max HP = base x (1 + meta + run bonus). Current HP keeps its ratio. */
    recalcUnit(u) {
      const run = this.run;
      const pct = run ? ((run.meta && run.meta.hp) || 0) + ((run.bonus && run.bonus.hp) || 0) : 0;
      const newMax = Math.round(u.def.stats.hp * (1 + pct));
      if (u.maxHp && u.maxHp !== newMax && u.hp > 0) u.hp = Math.max(1, Math.round((u.hp * newMax) / u.maxHp));
      u.maxHp = newMax;
    }
    recalcAll() {
      for (const u of this.all()) this.recalcUnit(u);
    }

    get(id) {
      return this.units[id];
    }
    all() {
      return Object.values(this.units);
    }
    size() {
      return Object.keys(this.units).length;
    }
    has(charId) {
      return !!this.units[charId];
    }
    isAlive(id) {
      return this.units[id] && this.units[id].hp > 0;
    }
    keyOf(id) {
      for (const k in this.slots) if (this.slots[k] === id) return k;
      return null;
    }
    isReserved(key) {
      return Object.values(this.moving).some((m) => m.toKey === key);
    }
    /** Living units standing in a slot (excludes travellers). */
    fieldUnits() {
      return Object.entries(this.slots)
        .filter(([, id]) => id && this.isAlive(id))
        .map(([k, id]) => Object.assign(this.units[id], { _key: k }));
    }
    laneUnits(lane) {
      return this.fieldUnits().filter((u) => u._key.startsWith(lane + '-'));
    }
    /** Front-most living unit of a lane (front slot first, then back). */
    laneFront(lane) {
      const f = this.slots[lane + '-front'];
      if (f && this.isAlive(f)) return this.units[f];
      const b = this.slots[lane + '-back'];
      if (b && this.isAlive(b)) return this.units[b];
      return null;
    }
    allDown() {
      return this.all().every((u) => u.hp <= 0);
    }

    /**
     * Swap a bench unit into a field slot (occupied, empty or holding a fallen ally).
     * @param battle optional — when given, cooldowns and battle events apply.
     */
    swap(benchId, key, battle) {
      if (!this.bench.includes(benchId)) return { ok: false, reason: '대기열에 없는 아군입니다' };
      if (!this.isAlive(benchId)) return { ok: false, reason: '쓰러진 아군은 투입할 수 없습니다' };
      if (this.isReserved(key)) return { ok: false, reason: '이동 중인 아군이 도착할 자리입니다' };
      const { lane } = F().parseKey(key);
      let free = false;
      let tag = null;
      if (battle) {
        if (!battle.canAct()) return { ok: false, reason: '지금은 교대할 수 없습니다' };
        tag = battle.tagWindow.find((t) => t.lane === lane && t.until > battle.time);
        free = !!tag;
        if (battle.swapCd > 0 && !free) return { ok: false, reason: `교대 대기 ${battle.swapCd.toFixed(1)}초` };
      }
      const outgoing = this.slots[key];
      this.bench = this.bench.filter((b) => b !== benchId);
      if (outgoing) this.bench.push(outgoing);
      this.slots[key] = benchId;
      if (battle) {
        if (outgoing) MG.CombatSystem.resetUnitBattleState(this.units[outgoing], battle, true);
        const u = this.units[benchId];
        MG.CombatSystem.resetUnitBattleState(u, battle, false);
        u.b.anim = { name: 'spin', t: 0 };
        if (!free) battle.swapCd = Math.max(0.5, SWAP_COOLDOWN * MG.RelicSystem.swapCooldownMult(battle.run) - ((battle.run.meta && battle.run.meta.swapCdCut) || 0));
        if (free) {
          battle.tagWindow = battle.tagWindow.filter((t) => t !== tag);
          MG.CombatSystem.addBuff(u, { id: 'tag_relay', stat: 'atk', pct: tag.atkPct, dur: tag.dur }, battle);
          battle.float(u.b.x, u.b.y - 120, '연계 교대!', '#7fd8ff');
        }
        battle.bus.emit('swapIn', { unit: u, lane, outgoing: outgoing ? this.units[outgoing] : null });
      }
      return { ok: true };
    }

    /** Send a field unit back to the bench without a replacement (uses the swap cooldown in battle). */
    retreat(key, battle) {
      const id = this.slots[key];
      if (!id) return { ok: false, reason: '빈 칸입니다' };
      if (this.isReserved(key)) return { ok: false, reason: '이동 중인 아군이 도착할 자리입니다' };
      if (battle) {
        if (!battle.canAct()) return { ok: false, reason: '지금은 퇴각할 수 없습니다' };
        if (battle.swapCd > 0) return { ok: false, reason: `교대 대기 ${battle.swapCd.toFixed(1)}초` };
      }
      this.slots[key] = null;
      this.bench.push(id);
      if (battle) {
        MG.CombatSystem.resetUnitBattleState(this.units[id], battle, true);
        battle.swapCd = Math.max(0.5, SWAP_COOLDOWN * MG.RelicSystem.swapCooldownMult(battle.run) - ((battle.run.meta && battle.run.meta.swapCdCut) || 0));
        battle.bus.emit('retreat', { unit: this.units[id], key });
      }
      return { ok: true };
    }

    /** Free re-arrangement outside battle: swap any two slots/bench members. */
    swapFree(aRef, bRef) {
      const get = (r) => (r.type === 'slot' ? this.slots[r.key] : this.bench[r.index]);
      const set = (r, v) => {
        if (r.type === 'slot') this.slots[r.key] = v;
        else if (v) this.bench[r.index] = v;
        else this.bench.splice(r.index, 1);
      };
      const a = get(aRef);
      const b = get(bRef);
      if (aRef.type === 'bench' && bRef.type === 'bench') return { ok: true };
      if (bRef.type === 'bench' && b === undefined) {
        this.slots[aRef.key] = null;
        if (a) this.bench.push(a);
        return { ok: true };
      }
      set(aRef, b || null);
      set(bRef, a || null);
      this.bench = this.bench.filter(Boolean);
      return { ok: true };
    }

    /** Start moving a field unit to the other lane (takes time, leaves combat meanwhile). */
    moveLane(unitId, battle) {
      const key = this.keyOf(unitId);
      if (!key) return { ok: false, reason: '배치된 아군이 아닙니다' };
      if (!this.isAlive(unitId)) return { ok: false, reason: '쓰러진 아군입니다' };
      const { lane } = F().parseKey(key);
      const to = 1 - lane;
      const target = ['front', 'back'].map((s) => to + '-' + s).find((k) => !this.slots[k] && !this.isReserved(k));
      const fallen = ['front', 'back'].map((s) => to + '-' + s).find((k) => this.slots[k] && !this.isAlive(this.slots[k]) && !this.isReserved(k));
      const toKey = target || fallen;
      if (!toKey) return { ok: false, reason: '대상 진격로에 빈 자리가 없습니다' };
      if (battle && !battle.canAct()) return { ok: false, reason: '지금은 이동할 수 없습니다' };
      this.slots[key] = null;
      if (!battle) {
        if (this.slots[toKey]) this.bench.push(this.slots[toKey]);
        this.slots[toKey] = unitId;
        return { ok: true };
      }
      const u = this.units[unitId];
      const total = F().G.LANE_MOVE_TIME * MG.RelicSystem.laneMoveMult(battle.run);
      this.moving[unitId] = { fromLane: lane, toLane: to, toKey, t: 0, total };
      u.b.anim = { name: 'walk', t: 0 };
      u.b.pending = null;
      battle.bus.emit('laneMoveStart', { unit: u, from: lane, to });
      return { ok: true };
    }

    updateMoving(dt, battle) {
      for (const id of Object.keys(this.moving)) {
        const m = this.moving[id];
        const u = this.units[id];
        m.t += dt;
        u.b.x = F().G.MOVE_X;
        u.b.y = MG.lerp(F().G.LANE_Y[m.fromLane], F().G.LANE_Y[m.toLane], Math.min(1, m.t / m.total));
        if (u.hp <= 0) {
          delete this.moving[id];
          this.bench.push(id);
          continue;
        }
        if (m.t >= m.total) {
          delete this.moving[id];
          if (this.slots[m.toKey]) this.bench.push(this.slots[m.toKey]);
          this.slots[m.toKey] = id;
          const p = F().position(m.toLane, F().parseKey(m.toKey).slot);
          u.b.x = p.x;
          u.b.y = p.y;
          u.b.anim = { name: 'idle', t: 0 };
          battle.bus.emit('laneMoveEnd', { unit: u, lane: m.toLane });
        }
      }
    }

    /** Clears travellers at the end of a battle so nobody is lost between slots. */
    settleMoving() {
      for (const [id, m] of Object.entries(this.moving)) {
        delete this.moving[id];
        if (!this.slots[m.toKey]) this.slots[m.toKey] = id;
        else this.bench.push(id);
      }
    }

    retireFallen(id) {
      const k = this.keyOf(id);
      if (k) {
        this.slots[k] = null;
        this.bench.push(id);
      }
    }

    heal(id, pct) {
      const u = this.units[id];
      if (!u || u.hp <= 0) return 0;
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * pct);
      return u.hp - before;
    }
    revive(id, pct) {
      const u = this.units[id];
      if (!u || u.hp > 0) return false;
      u.hp = Math.max(1, Math.round(u.maxHp * pct));
      return true;
    }
  }

  PartyManager.SWAP_COOLDOWN = SWAP_COOLDOWN;
  PartyManager.MAX_PARTY = MAX_PARTY;
  PartyManager.FIELD_SIZE = FIELD_SIZE;
  MG.PartyManager = PartyManager;
})();
