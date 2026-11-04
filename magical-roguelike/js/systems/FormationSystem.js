// Front/back row layout and battlefield geometry.
(function () {
  const MG = (window.MG = window.MG || {});

  const G = {
    LANE_Y: [296, 506], // feet baseline of each lane (0 = upper, 1 = lower)
    FRONT_X: 430,
    BACK_X: 300,
    HOME_X: 70, // home point (defense nodes)
    WAIT_X: 250, // where enemies wait in an empty lane in non-defense nodes
    SPAWN_X: 1330,
    MOVE_X: 170, // x where allies travel between lanes
    LANE_MOVE_TIME: 2.0,
    FORMATION_CD: 1.0,
    SLOTS: ['front', 'back'],
  };

  const FormationSystem = {
    G,
    slotKey: (lane, slot) => lane + '-' + slot,
    parseKey(key) {
      const [l, s] = key.split('-');
      return { lane: +l, slot: s };
    },
    allKeys: () => ['0-front', '0-back', '1-front', '1-back'],
    position(lane, slot) {
      return { x: slot === 'front' ? G.FRONT_X : G.BACK_X, y: G.LANE_Y[lane] };
    },
    /** Swap the front and back occupants of a lane. */
    swapRows(party, lane, battle) {
      if (battle) {
        if (battle.formCd[lane] > 0) return { ok: false, reason: '진형 변경 대기 중' };
      }
      const fk = lane + '-front';
      const bk = lane + '-back';
      if (!party.slots[fk] && !party.slots[bk]) return { ok: false, reason: '진격로에 아군이 없습니다' };
      if (party.isReserved(fk) || party.isReserved(bk)) return { ok: false, reason: '이동 중인 아군이 도착할 자리입니다' };
      const tmp = party.slots[fk];
      party.slots[fk] = party.slots[bk];
      party.slots[bk] = tmp;
      if (battle) {
        battle.formCd[lane] = G.FORMATION_CD;
        battle.bus.emit('formationChange', { lane });
      }
      return { ok: true };
    },
  };

  MG.FormationSystem = FormationSystem;
})();
