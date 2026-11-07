/*
 * 장면 「world」 — 흰 공간 → 주인공의 방 → (문 밖) → 필드
 * ------------------------------------------------------------
 * 연결
 *   - 주인공의 방(heroRoom)의 다음 장면을 'world' 로 바꾼다 (메이어의 "밖으로 나간다" 버튼)
 *   - 방문(door)을 조사해도 메이어의 이야기를 들은 뒤라면 밖으로 나갈 수 있다
 *   - 들바람 마을의 「클레어의 집」에서 방으로 다시 들어갈 수 있다 (집에서는 공짜로 잠을 잘 수 있다)
 *   - 30일째 밤이 지나면 장면 'doomEnd' (세계 멸망) → 회차가 늘고 흰 공간부터 다시
 *   - 시작 화면: 저장 기록이 있으면 "이어하기", 장면 단독 테스트에 "필드 · 전투" 추가
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const T = 48;
  const gridCache = {}, gridOrder = [];

  // ---------------- 흰 공간 장면과 잇기 ----------------
  if (WS.SCENES.heroRoom) WS.SCENES.heroRoom.next = 'world';
  if (WS.SCRIPTS.heroRoom && !WS.SCRIPTS.heroRoom.includes('@rpgdoor')) {
    WS.SCRIPTS.heroRoom = WS.SCRIPTS.heroRoom.replace('=== door\n', '=== door\n@rpgdoor\n');
  }
  WS.SCRIPT_COMMANDS.rpgdoor = async (g) => {
    const sd = WS.State.sceneData(g.state, 'heroRoom');
    if (!sd.events.briefing) return null;          // 메이어의 이야기 전: 원래 대사
    g.ui.dialogue.hide();
    g.runner.stop();
    g.scenes.goTo('world', {});
    return null;
  };
  WS.TEST_ENTRIES.world = { scene: 'world', label: '필드 · 전투 (RPG)' };

  /**
   * 지역 마물 레벨: 지역 구간(enc.lv) 안에서 고르고, 날짜 보정(멸망이 다가올수록 +)을 더하되 구간 끝을 넘지 않는다.
   */
  R.regionLevel = function (enc, bonus) {
    const [a, b] = enc.lv || [1, 1];
    return Math.min(b, a + Math.floor(Math.random() * (b - a + 1)) + (bonus || 0));
  };

  // ---------------- 장면 ----------------
  const S = R.scene = {
    game: null, view: null, busy: false,

    async enter(game, payload) {
      this.game = game;
      if (R.pendingLoad) { game.state = R.pendingLoad; R.pendingLoad = null; game.ui.hud.refresh(); }
      else if (payload && payload.test) { game.state = WS.State.createTestRun(game.meta, payload.job); game.ui.hud.refresh(); }
      const run = game.state;
      if (!run.player.jobId) { setTimeout(() => game.newGame({ scene: 'whiteSpace' }), 0); return; }
      run.sceneId = 'world';
      const st = game.stage;
      st.reset({ fromScene: payload && payload.from });
      st.fadeColor = '#140c12';
      game.ui.dialogue.resetExpressions();
      R.UI.mount();
      await R.loadAssets();
      const first = !run.rpg;
      const rp = R.ensure(run);
      R.UI.showHud(true);
      if (payload && payload.from === 'heroRoom') {
        const d = R.MAPS.wildwind.buildings[0].door;
        Object.assign(rp, { map: 'wildwind', x: d[0], y: d[1], dir: 'down' });
      }
      this.goMap(rp.map, { x: rp.x, y: rp.y, dir: rp.dir || 'down' }, { floor: rp.towerFloor });
      if (st.whiteout) st.fadeIn(800);
      if (first) {
        this.view.cutscene();
        await WS.sleep(500);
        await R.UI.dayCard('들바람 마을');
        await game.runner.run(R.SCRIPT_INTRO);
        game.ui.dialogue.hide();
        if (this.view) this.view.explore();
      }
      R.Save.autosave(game, 'start');
    },

    exit(game) {
      game.runner.stop();
      game.ui.dialogue.hide();
      R.Audio && R.Audio.stopAll();          // 방 · 흰 공간 · 결말 장면은 음악 없이 (원래 연출)
      if (R.UI.menuOpen()) R.UI.closeMenu();
      if (this.view) { this.view.detach(); this.view = null; }
      game.stage.setView(null);
      game.stage.fadeColor = '#fbfbfa';
      R.UI.showHud(false);
    },

    /** 지역 열기 */
    goMap(id, pos, opts = {}) {
      const game = this.game, run = game.state, rp = run.rpg;
      if (this.view) { this.view.detach(); this.view = null; }
      let grid;
      if (id === 'tower_f') grid = R.buildMap('tower_f', { floor: opts.floor });
      else {
        // 최근 지역 4곳만 기억한다 (지도 한 장 = 물결 그림 4장이라 메모리를 많이 쓴다)
        grid = gridCache[id] || (gridCache[id] = R.buildMap(id));
        gridOrder.splice(gridOrder.indexOf(id) >>> 0, gridOrder.includes(id) ? 1 : 0);
        gridOrder.push(id);
        while (gridOrder.length > 4) delete gridCache[gridOrder.shift()];
      }
      rp.map = id;
      R.Audio && R.Audio.forMap(id);
      if (id === 'tower_f') { rp.towerFloor = opts.floor; rp.tower.max = Math.max(rp.tower.max, opts.floor); }
      else rp.towerFloor = null;
      const def0 = R.mapDef(id, opts);
      rp.visited[id === 'tower_f' ? 'tower' : def0.type === 'interior' ? def0.parent : id] = true;
      if (id === 'tower_f' && !pos) pos = { x: grid.start[0], y: grid.start[1], dir: 'down' };
      // 보스 (쓰러뜨리지 않았으면 그 칸을 막고 조사하면 싸운다)
      const bosses = this.bossesFor(grid, id, opts.floor);
      const layout = grid.layout.slice();
      const objects = grid.objects.slice();
      for (const b of bosses) {
        layout[b.y] = layout[b.y].slice(0, b.x) + '#' + layout[b.y].slice(b.x + 1);
        objects.push({ id: 'boss:' + b.key, name: R.MON[b.mon].n, tiles: [[b.x, b.y]], interact: 'boss', data: b, markerDy: -90 });
      }
      const g2 = Object.assign(Object.create(Object.getPrototypeOf(grid)), grid, { layout, objects });
      // 서 있을 수 없는 곳이면 근처 빈칸으로
      pos = this.safePos(g2, pos || { x: grid.cx, y: grid.cy, dir: 'down' });
      const view = new R.WorldView(game, g2, this, pos);
      this.view = view;
      view.player.sprite = R.fieldSprite(run);
      const syms = this.spawnFor(g2, id, opts.floor, pos);
      view.spawnSymbols(syms.concat(bosses.map(b => ({ x: b.x, y: b.y, mon: b.mon, lv: b.lv, boss: true, key: b.key }))));
      game.stage.setView(view);
      view.explore();
      view.savePosition();
      R.UI.refreshHud(g2.def.n);
      Object.assign(rp, { x: pos.x, y: pos.y, dir: pos.dir });
    },

    safePos(grid, pos) {
      const ok = (x, y) => grid.layout[y] && grid.layout[y][x] === '.' && !grid.npcs.some(n => n.x === x && n.y === y);
      if (ok(pos.x, pos.y)) return pos;
      for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ok(pos.x + dx, pos.y + dy)) return { x: pos.x + dx, y: pos.y + dy, dir: pos.dir };
      return pos;
    },

    bossesFor(grid, id, floor) {
      const rp = this.game.state.rpg, out = [];
      const bonus = R.levelBonus(rp);
      if (id === 'tower_f') {
        if (floor % 5 === 0 && !rp.bosses['tower' + floor]) {
          const mon = R.TOWER_BOSSES[(floor / 5 - 1) % R.TOWER_BOSSES.length];
          out.push({ x: grid.bossAt[0], y: grid.bossAt[1], mon, lv: R.towerLevel(floor) + 2, key: 'tower' + floor });
        }
        return out;
      }
      const def = R.mapDef(id) || {};
      for (const k of ['boss', 'boss2']) {
        const b = def[k]; if (!b) continue;
        const key = id + ':' + b.id;
        if (rp.bosses[key]) continue;
        out.push({ x: b.at[0], y: b.at[1], mon: b.id, lv: R.MON[b.id].lv, key });   // 마수 레벨 = 지역 구간 끝 (날짜 보정 없음)
      }
      return out;
    },

    spawnFor(grid, id, floor, pos) {
      const rp = this.game.state.rpg;
      const enc = id === 'tower_f' ? { pool: R.TOWER_POOL, n: 7 + Math.min(5, Math.floor(floor / 4)) } : (R.mapDef(id) || {}).enc;
      if (!enc) return [];
      const free = [];
      for (let y = 2; y < grid.h - 2; y++) for (let x = 2; x < grid.w - 2; x++) {
        if (grid.layout[y][x] !== '.') continue;
        if (Math.abs(x - pos.x) + Math.abs(y - pos.y) < 8) continue;
        if (grid.npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 3)) continue;
        free.push([x, y]);
      }
      const out = [];
      const bonus = R.levelBonus(rp);
      // 넓어진 지도만큼 마물 수도 늘린다 (40×30 기준 enc.n)
      const count = Math.round(enc.n * Math.max(1, (grid.w * grid.h) / 1200 * 0.7));
      for (let k = 0; k < count && free.length; k++) {
        const [x, y] = free.splice(Math.floor(Math.random() * free.length), 1)[0];
        let mon = enc.pool[Math.floor(Math.random() * enc.pool.length)];
        if (enc.rare && Math.random() < 0.12) mon = enc.rare;
        const lv = id === 'tower_f' ? R.towerLevel(floor) + Math.floor(Math.random() * 2) : R.regionLevel(enc, bonus);
        out.push({ x, y, mon, lv });
        // 너무 붙어 있지 않게
        for (let i = free.length - 1; i >= 0; i--) if (Math.abs(free[i][0] - x) + Math.abs(free[i][1] - y) < 4) free.splice(i, 1);
      }
      return out;
    },

    // ---------------- 이동 · 시간 ----------------
    async leave(view, side) {
      if (this.busy) return;
      this.busy = true;
      const game = this.game, rp = game.state.rpg, def = view.grid.def;
      // 회차 조건으로 잠긴 출구 — 이유는 말하지 않는다
      const lock = (def.exitLock || {})[side];
      if (lock && !WS.Progression.check(lock, WS.Progression.loadMeta(), game.state)) {
        this.busy = false;
        game.ui.toast('아직 길이 열리지 않았다.');
        return;
      }
      view.cutscene();
      await game.ui.veil(true, 320);
      let target;
      if (def.type === 'interior') {
        // 건물 밖으로: 원래 건물 문 앞
        target = def.parent;
        const d = def.building.door;
        this.goMap(target, { x: d[0], y: d[1], dir: 'down' });
      } else {
        target = (def.exits || {})[side];
        const a = R.arriveAt(target, R.OPP[side]);
        this.goMap(target, { x: a[0], y: a[1], dir: a[2] });
      }
      await game.ui.veil(false, 380);
      this.busy = false;
      R.Save.autosave(game, 'move');
      if (R.MAPS[target] && !rp.visited['_toast_' + target]) { rp.visited['_toast_' + target] = true; game.ui.toast(R.MAPS[target].n); }
    },

    async onStep(view) {
      const run = this.game.state, rp = run.rpg, p = view.player;
      Object.assign(rp, { x: p.x, y: p.y, dir: p.dir });
      view.stepCount++;
      if (rp.poison && view.stepCount % 4 === 0 && rp.hp > 1) rp.hp = Math.max(1, rp.hp - 5);   // 필드 독: 4걸음마다 5 (옛 1 × 4.5)
      if (rp.repel > 0 && view.grid.def.type !== 'interior') { rp.repel--; if (!rp.repel) this.game.ui.toast('마물 쫓는 향이 다 타 버렸다.'); }
      R.UI.refreshHud();
    },

    /**
     * 변신 게이지가 바닥났을 때: 이 상태로는 마물의 공격 한 번에 쓰러진다.
     * 하루는 오직 이렇게 게이지가 바닥나 잠들 때만 지나간다.
     */
    async gaugeEmpty() {
      const run = this.game.state, rp = run.rpg;
      if (rp.gauge > 0 || this.busy || rp.emptyWarned) return;
      rp.emptyWarned = true;
      this.busy = true;
      const v = this.view; v && v.cutscene();
      await this.game.runner.run(`[나레이션]\n몸을 감싸던 빛이 꺼졌다. 변신이 풀렸다.\n이 몸으로는 마물의 공격 한 번도 버틸 수 없다.\n[시스템]\n변신 게이지가 바닥났습니다. 잠들어 하루를 넘겨야만 다시 변신할 수 있습니다.`);
      const i = await this.game.ui.dialogue.choose(['마지막 잠자리로 돌아가 잠든다', '걸어서 돌아간다 (마물에 닿으면 위험)']);
      this.game.ui.dialogue.hide();
      if (i === 0) {
        if (rp.day >= R.TIME.lastDay) {
          const ok = await this.game.ui.confirm({ title: '마지막 밤', body: '오늘은 30일째입니다.<br>잠들면 세계의 마지막 밤이 지나갑니다.', yes: '잠든다', no: '아직이다' });
          if (!ok) { this.busy = false; if (this.view) this.view.explore(); return; }
        }
        await this.sleepAndWake({ note: '변신 게이지가 가득 찼다.' });
      } else if (this.view) this.view.explore();
      this.busy = false;
    },

    /** 잠 → 다음 날. 30일째 밤이면 멸망 */
    async sleepAndWake(opts = {}) {
      const game = this.game, run = game.state, rp = run.rpg;
      await game.ui.veil(true, 600);
      const res = R.sleep(run, opts);
      rp.emptyWarned = false;
      if (res === 'doom') { await game.ui.veil(false, 10); return this.doom(); }
      if (opts.bed) rp.bed = opts.bed;
      if (rp.bed.scene === 'heroRoom') {
        // 집 = 주인공의 방에서 깨어난다
        R.Save.autosave(game, 'sleep');
        R.wakeInRoom(game, opts.note || '변신 게이지가 가득 찼다.');
        return;
      }
      const b = rp.bed;
      this.goMap(b.map, { x: b.x, y: b.y, dir: 'down' });
      this.view.cutscene();
      R.Save.autosave(game, 'sleep');
      await WS.sleep(300);
      await game.ui.veil(false, 500);
      R.Audio && R.Audio.jingle('me_night');
      await R.UI.dayCard(opts.note || '변신 게이지가 가득 찼다.');
      if (this.view) this.view.explore();
    },

    /** 마지막 잠자리로 옮긴다 (패배 후) */
    goBed() {
      const rp = this.game.state.rpg, b = rp.bed;
      if (b.scene === 'heroRoom') { R.wakeInRoom(this.game, null); return false; }
      this.goMap(b.map, { x: b.x, y: b.y, dir: 'down' });
      return true;
    },

    /** 건물 안으로 */
    async enterBuilding(view, b) {
      R.Audio && R.Audio.se('door');
      const game = this.game, rp = game.state.rpg;
      if (b.role === 'home') {
        rp.x = b.door[0]; rp.y = b.door[1];
        game.scenes.goTo('heroRoom', {});
        return;
      }
      if (!R.INTERIOR_ROLES.includes(b.role)) return;
      const id = `in:${rp.map}:${b.idx}`;
      this.busy = true;
      view.cutscene();
      await game.ui.veil(true, 260);
      const a = R.arriveAt(id, 's');
      this.goMap(id, { x: a[0], y: a[1], dir: 'up' });
      await game.ui.veil(false, 300);
      this.busy = false;
      R.Save.autosave(game, 'move');
    },

    doom() {
      const run = this.game.state, rp = run.rpg;
      WS.SCRIPTS.doomEnd = R.doomScript(run);
      this.game.scenes.goTo('doomEnd', {});
    },

    warpHome() {
      const game = this.game, rp = game.state.rpg;
      (async () => {
        this.view && this.view.cutscene();
        await game.ui.veil(true, 400);
        if (!this.goBed()) return;
        await game.ui.veil(false, 400);
        game.ui.toast('귀환 주문서의 빛에 휩싸였다');
      })();
    },

    // ---------------- 전투 ----------------
    async encounter(view, sym, forced) {
      if (this.busy || view.mode !== 'explore') return;
      this.busy = true;
      const game = this.game, run = game.state, rp = run.rpg;
      view.cutscene();
      view.flashT = 0.35;
      game.stage.fx.shake(2, 0.3);
      await WS.sleep(380);
      const mons = [{ id: sym.mon, lv: sym.lv }];
      if (!sym.boss && !R.MON[sym.mon].rare) {
        const enc = rp.map === 'tower_f' ? { pool: R.TOWER_POOL } : R.mapDef(rp.map).enc;
        const extra = (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.22 && sym.lv >= 6 ? 1 : 0);
        for (let i = 0; i < extra; i++) {
          const id = enc.pool[Math.floor(Math.random() * enc.pool.length)];
          const lvMin = enc.lv ? enc.lv[0] : 1;
          mons.push({ id, lv: Math.max(lvMin, sym.lv - (Math.random() < 0.5 ? 1 : 0)) });
        }
      }
      const regionEnc = rp.map === 'tower_f' ? null : (R.mapDef(rp.map) || {}).enc;
      const result = await R.Battle.run(game, { mons, boss: !!sym.boss, place: view.grid.def.type, mul: (regionEnc && regionEnc.mul) || 1 });
      view.player.sprite = R.fieldSprite(run);
      if (result === 'win') {
        sym.dead = true;
        if (sym.boss) {
          rp.bosses[sym.key] = true;
          const o = view.objects.findIndex(o => o.id === 'boss:' + sym.key);
          if (o >= 0) {
            const [bx, by] = view.objects[o].tiles[0];
            view.objects.splice(o, 1);
            view.def.layout[by] = view.def.layout[by].slice(0, bx) + '.' + view.def.layout[by].slice(bx + 1);
          }
          if (sym.mon === 'yogg') { run.flags.yogg_defeated = true; await game.runner.run(`[나레이션]\n종말의 사도가 무너져 내렸다.\n하늘을 덮고 있던 붉은 기운이 아주 조금 옅어진 것 같다…\n(이 승리의 의미는 이야기 업데이트에서 이어집니다)`); game.ui.dialogue.hide(); }
          R.Save.autosave(game, 'boss');
        }
      } else if (result === 'flee') {
        sym.cool = 3;
      } else {
        // 패배: 마지막으로 잠든 곳에서 깨어난다
        if (rp.gauge <= 0) {
          // 게이지까지 바닥났다 → 정신을 잃은 채 잠자리로 옮겨져 그대로 하루가 지난다
          rp.emptyWarned = true;
          if (rp.day >= R.TIME.lastDay) { R.UI.refreshHud(); this.busy = false; return this.doom(); }
          await this.sleepAndWake({ note: '정신을 잃은 채 잠자리로 옮겨졌다. 변신 게이지가 가득 찼다.' });
          R.UI.refreshHud();
          this.busy = false;
          return;
        }
        await game.ui.veil(true, 500);
        const st = R.stats(run);
        rp.hp = Math.round(st.hp * 0.5); rp.mp = Math.max(rp.mp, Math.round(st.mp * 0.3)); rp.poison = 0;
        if (!this.goBed()) { R.UI.refreshHud(); this.busy = false; return; }
        await game.ui.veil(false, 500);
        game.ui.toast('정신을 차려 보니 잠자리였다…');
      }
      R.UI.refreshHud();
      this.busy = false;
      if (this.view) this.view.explore();
      await this.gaugeEmpty();
    },

    // ---------------- 조사 ----------------
    chestOpened(o) { return !!this.game.state.rpg.chests[o.data.key]; },
    markerState(view, o) {
      if (o.interact === 'chest') return this.chestOpened(o) ? 'none' : 'new';
      if (o.interact === 'cache') return (this.game.state.rpg.found || {})[o.data.key] ? 'none' : 'new';
      if (o.interact === 'building') return 'seen';
      if (o.interact === 'quest') { const f = this.game.state.flags, id = o.data.id; return f[`req_${id}_accepted`] && !f[`req_${id}_cond`] ? 'new' : 'none'; }
      return 'new';
    },

    async talk(name, lines) {
      const src = `[${name}]\n` + lines.join('\n');
      await this.game.runner.run(src);
      this.game.ui.dialogue.hide();
    },

    async interact(view, target) {
      const game = this.game, run = game.state, rp = run.rpg, ui = game.ui;
      if (target.kind === 'npc') {
        const n = view.npcs[target.id].data;
        if (n.building) return this.building(view, n.building);      // 건물 안 주인
        if (n.being) return this.being(view, n);                      // 우주적 존재 3명
        if (n.key) return this.keyNpc(view, n);                       // 지역 키 NPC 5명
        const name = n.name || (n.role === 'towerkeeper' ? '탑지기' : n.role === 'shop' ? '상인' : n.c === 20 ? '국왕' : [8, 9].includes(n.c) ? '기사' : '마을 사람');
        await this.talk(name, n.say || ['…']);
        if (n.role === 'shop') await R.UI.openShop(n.shop);
        if (n.role === 'towerkeeper') await this.towerKeeper();
        return;
      }
      const o = target.ref;
      switch (o.interact) {
        case 'cache': {
          // 숨겨진 아이템: 한 번 얻으면 사라진다 (이번 회차 기록)
          rp.found = rp.found || {};
          if (rp.found[o.data.key]) return;
          rp.found[o.data.key] = true;
          R.Audio && R.Audio.se('chest');
          R.give(run, o.data.item, o.data.n);
          ui.toast(`${R.HIDDEN_LABEL[o.data.kind] || ''}에서 「${R.ITEMS[o.data.item].n}」${o.data.n > 1 ? ' ×' + o.data.n : ''}을(를) 찾았다!`);
          return;
        }
        case 'chest': {
          if (this.chestOpened(o)) return;
          rp.chests[o.data.key] = true;
          R.Audio && R.Audio.se('chest');
          R.give(run, o.data.item, o.data.n);
          ui.toast(`보물상자에서 「${R.ITEMS[o.data.item].n}」 ×${o.data.n}을(를) 얻었다!`);
          return;
        }
        case 'boss': {
          const b = o.data;
          const ok = await ui.confirm({ title: R.MON[b.mon].n, body: `강대한 기운이 느껴진다… (Lv.${b.lv})<br><small>보스 전투는 변신 게이지를 ${R.gaugeCost(run, true)} 소모하고, 도망칠 수 없습니다.</small>`, yes: '싸운다', no: '물러선다', color: R.job(run).color });
          if (!ok) return;
          const sym = view.symbols.find(s => s.boss && s.key === b.key);
          view.mode = 'explore';
          if (sym) await this.encounter(view, sym);
          return;
        }
        case 'building': return this.enterBuilding(view, o.data);
        case 'quest': {
          // 지역 키 NPC 의뢰 물건: 의뢰를 받은 뒤 조사하면 조건 달성 ※ 임시
          const id = o.data.id, Q = R.REQUESTS[id], f = run.flags;
          if (f[`req_${id}_accepted`] && !f[`req_${id}_cond`]) { f[`req_${id}_cond`] = true; ui.toast(Q.find); return; }
          return this.talk('나레이션', [Q.look]);
        }
        case 'keeper': return this.building(view, view.grid.def.building);
        case 'stairsUp': {
          if (rp.map === 'tower_f' && rp.towerFloor % 5 === 0 && !rp.bosses['tower' + rp.towerFloor]) { ui.toast('수호자가 계단을 지키고 있다!', true); return; }
          const next = rp.map === 'tower_f' ? rp.towerFloor + 1 : 1;
          const ok = await ui.confirm({ title: `${next}층으로`, body: next === 1 ? '끝없는 탑에 오릅니다.<br><small>오를수록 마물이 강해지고, 5층마다 수호자가 있습니다.</small>' : `${next}층으로 올라갑니다.`, yes: '오른다', no: '그만둔다' });
          if (!ok) return;
          await this.towerGo(next);
          return;
        }
        case 'stairsDown': {
          const f = rp.towerFloor;
          await this.towerGo(f - 1);
          return;
        }
      }
    },

    // ---------------- 우주적 존재 3명 (Phase 4-B) ----------------
    // 이번 회차에 처음 말을 걸면: 1회차 → <id>_first, 2회차 이상 → <id>_loop2. 그 뒤로는 <id>_again.
    // 처음 만났는지는 대본 끝의 "@event <id>_met" 기록(world 장면의 이벤트)으로 구분한다.
    meeting(name) {
      this._meet = this._meet || WS.splitSections(WS.SCRIPTS.meetings || '');
      return this._meet[name] || null;
    },
    async being(view, n) {
      const game = this.game, run = game.state, ui = game.ui, id = n.being;
      const sd = WS.State.sceneData(run, 'world');
      const loop = (game.meta && game.meta.loop) || 1;
      const first = !sd.events[id + '_met'];
      const name = first ? (loop >= 2 ? id + '_loop2' : id + '_first') : id + '_again';
      if (id === 'lucien' && !first) await this.lucienTurnIn();
      const res = await game.runner.run(this.meeting(name));
      if (res !== 'done' || !this.view) return ui.dialogue.hide();
      if (id === 'lucien') {
        // 2회차 대사는 의뢰 부탁에서 끝난다 → lucien_first 의 수락 / 거절 선택지로 잇는다 (대사는 lucien_first 그대로)
        if (name === 'lucien_loop2') await game.runner.run(this.lucienChoice());
        // 이미 만난 뒤 의뢰를 거절해 두었다면 다시 물어본다 ※ 임시
        if (name === 'lucien_again' && !run.flags.lucien_request_accepted && !run.flags.lucien_request_done) {
          await game.runner.run('// ※ 임시\n[루시앙:미소]\n“그 버섯 갓 부탁, 아직 유효합니다.”\n' + this.lucienChoice());
        }
        ui.dialogue.hide();
        await R.UI.openShop(n.shop || 'lucien');   // 필드 노점 (버섯 숲 R.SHOPS.lucien ※ 임시 / 달빛 호수 R.SHOPS.lucien_lake — 영혼의 보석)
        return;
      }
      ui.dialogue.hide();
      // 선택 기록: run 플래그(대본의 @set)는 그대로 두고, 다음 회차용으로 meta 에 마지막 값만 복사한다. (대사 연결은 아직 없음)
      const KEEP = { valerie: ['valerie_route', ['mine_route_short', 'mine_route_safe']], theophile: ['theophile_question', ['theophile_answer_a', 'theophile_answer_b', 'theophile_answer_c']] };
      const k = KEEP[id];
      if (k && first) {
        const v = k[1][run.choices[k[0]]];      // 방금 고른 선택지 (선택지 순서 = 플래그 순서)
        if (v) {
          const meta = game.meta;
          meta.lastChoices = Object.assign({}, meta.lastChoices, { [k[0]]: v });
          WS.Progression.saveMeta(meta);
        }
      }
    },
    /** lucien_first 의 의뢰 선택지 부분 (@choice lucien_request ~ @label after) */
    lucienChoice() {
      const src = this.meeting('lucien_first') || '';
      const a = src.indexOf('@choice lucien_request'), b = src.indexOf('@label after', a);
      return a >= 0 && b > a ? src.slice(a, b + '@label after'.length) : '';
    },
    /** 루시앙의 의뢰: 버섯 갓 3개를 가지고 말을 걸면 소량의 골드 ※ 임시 */
    async lucienTurnIn() {
      const game = this.game, run = game.state, f = run.flags;
      const NEED = 3, GOLD = 150;                // ※ 임시 (수량 · 보상 미정)
      if (!f.lucien_request_accepted || f.lucien_request_done || R.count(run, 'm_shroom') < NEED) return;
      await game.runner.run('// ※ 임시: 의뢰 보고\n[루시앙:웃음]\n“오, 버섯 갓이군요! 약속대로 후하게 쳐 드리지요.”');
      R.take(run, 'm_shroom', NEED);
      run.rpg.gold += GOLD;
      f.lucien_request_done = true;
      game.ui.toast(`버섯 갓 ×${NEED}을(를) 건네고 ${GOLD} G를 받았다.`);
      R.UI.refreshHud && R.UI.refreshHud();
    },

    // ---------------- 지역 키 NPC 5명 (Phase 4-C) ----------------
    // 대화 → 수락(req_<id>_accepted) → 조건 달성(req_<id>_cond) → 보상 1개(req_<id>_done). 모두 run.flags (세이브 대상).
    async keyNpc(view, n) {
      const game = this.game, run = game.state, f = run.flags, ui = game.ui, k = n.key, Q = R.REQUESTS[k];
      this._req = this._req || {};
      const sec = this._req[k] || (this._req[k] = WS.splitSections(Q.script));
      // 왕실 서기관의 서한: 하급 기사에게 말을 걸면 전달된다
      if (k === 'knight' && f.req_scribe_accepted && !f.req_scribe_cond) {
        await game.runner.run(sec.deliver);
        f.req_scribe_cond = true;
        ui.dialogue.hide();
        ui.toast('왕실 서한을 전달했다. 왕실 서기관에게 알리자.');
      }
      const name = f[`req_${k}_done`] ? 'after'
        : f[`req_${k}_accepted`] ? (f[`req_${k}_cond`] ? 'reward' : 'waiting')
        : f[`req_${k}_offered`] ? 'reoffer' : 'offer';
      const res = await game.runner.run(sec[name]);
      ui.dialogue.hide();
      if (name === 'reward' && res === 'done') {
        const [item, cnt] = Q.reward;                // ※ 임시 보상
        R.give(run, item, cnt);
        f[`req_${k}_done`] = true;
        ui.toast(`「${R.ITEMS[item].n}」 ×${cnt}을(를) 받았다.`);
      }
    },

    async towerGo(floor) {
      const game = this.game;
      this.view.cutscene();
      await game.ui.veil(true, 350);
      if (floor <= 0) this.goMap('tower', { x: 20, y: 5, dir: 'down' });
      else this.goMap('tower_f', null, { floor });
      await game.ui.veil(false, 350);
      if (floor > 0) game.ui.toast(`끝없는 탑 ${floor}층${floor % 5 === 0 ? ' — 수호자의 층' : ''}`);
      R.Save.autosave(game, 'move');
    },

    async towerKeeper() {
      const rp = this.game.state.rpg;
      const floors = [1];
      for (let f = 5; f <= rp.tower.max; f += 5) floors.push(f);
      const pick = await R.UI.pick('탑지기 — 어느 층으로 갈까?', floors.map(f => `${f}층${f > 1 ? ' (수호자의 층)' : ''}`));
      if (pick < 0) return;
      await this.towerGo(floors[pick]);
    },

    async building(view, b) {
      const game = this.game, run = game.state, rp = run.rpg, ui = game.ui;
      const p = view.player;
      const bed = view.grid.def.type === 'interior' ? { map: rp.map, x: p.x, y: p.y } : { map: rp.map, x: b.door[0], y: b.door[1] };
      if (b.role === 'shop') {
        // 교차 단서가 있는 상점 주인: 이번 회차에 처음 들를 때 한 번 인사 ※ 임시
        if (b.clue && R.SHOP_TALK[b.clue] && !run.flags['shop_talk_' + b.clue]) {
          await game.runner.run(R.SHOP_TALK[b.clue]);
          ui.dialogue.hide();
          run.flags['shop_talk_' + b.clue] = true;
        }
        return R.UI.openShop(b.shop);
      }
      if (b.role === 'talk') return this.talk(b.label, b.say);
      if (b.role === 'home' || b.role === 'inn') {
        const home = b.role === 'home';
        const price = home ? 0 : b.price;
        const canSleep = rp.gauge <= 0;              // 하루는 변신 게이지가 바닥났을 때만 지나간다
        const pay = price ? ` (${price}G)` : '';
        const choices = canSleep
          ? [`잠을 잔다${pay} — 하루가 지나간다`]
          : [`쉬어 간다${pay} — 체력 · 마나 회복`];
        if (home) choices.push('방으로 들어간다');
        choices.push('그만둔다');
        await game.runner.run(home
          ? `[나레이션]\n${b.label}이다. 익숙한 문이 보인다.${canSleep ? '' : '\n아직 몸 안에 변신의 힘이 남아 있어 잠이 오지 않는다.'}`
          : `[여관 주인]\n어서 오세요! ${canSleep ? `하룻밤에 ${price}골드랍니다.${b.luxury ? ' 오늘 밤엔 달빛 정수도 하나 드려요.' : ''}` : `잠깐 쉬어 가는 데 ${price}골드랍니다.`}`);
        const i = await ui.dialogue.choose(choices);
        ui.dialogue.hide();
        const pickLabel = choices[i];
        if (pickLabel === '그만둔다') return;
        if (pickLabel === '방으로 들어간다') {
          rp.x = b.door[0]; rp.y = b.door[1];
          game.scenes.goTo('heroRoom', {});
          return;
        }
        if (price && rp.gold < price) { ui.toast('돈이 모자라다…', true); return; }
        if (!canSleep) {
          rp.gold -= price;
          const st = R.stats(run);
          rp.hp = st.hp; rp.mp = st.mp; rp.poison = 0;
          rp.bed = bed;
          R.UI.refreshHud();
          ui.toast('푹 쉬었다. 체력 · 마나가 회복되었다. (날짜는 그대로)');
          return;
        }
        if (rp.day >= R.TIME.lastDay) {
          const ok = await ui.confirm({ title: '마지막 밤', body: '오늘은 30일째입니다.<br>잠들면 세계의 마지막 밤이 지나갑니다.', yes: '잠든다', no: '아직이다' });
          if (!ok) return;
        }
        rp.gold -= price;
        if (b.luxury) R.give(run, 'moon', 1);
        this.busy = true;
        await this.sleepAndWake({ bed, note: b.luxury ? '푹 잤다! 달빛 정수를 받았다.' : '변신 게이지가 가득 찼다.' });
        this.busy = false;
      }
    },
  };

  // 장면 등록
  WS.registerScene('world', {
    enter(game, payload) { return S.enter(game, payload); },
    exit(game) { S.exit(game); },
  });

  // ---------------- 처음 밖으로 나왔을 때 ----------------
  R.SCRIPT_INTRO = String.raw`
[나레이션]
문을 열자, 익숙한 들바람 마을의 아침이 펼쳐졌다.
평소와 다를 바 없는 풍경. 하지만 어딘가, 하늘빛이 아주 조금 붉었다.
[클레어:기본]
“……30일.”
“일단은, 할 수 있는 것부터 해 보자.”
[시스템]
마을 밖에는 마물이 돌아다닙니다. 마물에 닿으면 전투가 시작됩니다.
전투에 들어가면 변신하며, 변신할 때마다 변신 게이지가 줄어듭니다. 마물에게 지면 더 크게 줄어듭니다.
변신 게이지가 바닥나면 변신이 풀리고, 마물의 공격 한 번에 쓰러집니다. 집이나 여관에서 잠들어야만 다시 찹니다.
하루는 변신 게이지가 바닥나 잠들 때만 지나갑니다. 게이지가 남아 있을 때는 집과 여관에서 쉬기만 할 수 있습니다. (메뉴: 오른쪽 위 버튼 또는 M 키)
`;

  // ---------------- 세계 멸망 ----------------
  R.doomScript = function (run) {
    const rp = run.rpg;
    return String.raw`
@fadein 2400
[나레이션]
서른 번째 밤이 끝나 가고 있었다.
하늘이 갈라지는 소리가 들렸다. 붉은 빛이 지평선을 따라 번져 나갔다.
아무도 막지 못했다. 아무도.
[클레어:시무룩]
“……여기까지, 인가요.”
[???|메이어:눈감음]
“…….”
[나레이션]
모든 것이 하얗게 물들어 갔다.
그 하얀빛 속에서, 어디선가 들어 본 목소리가 아주 작게 웃었다.
[시스템]
세계가 멸망했습니다. — Lv.${rp.lv} · 쓰러뜨린 마물 ${rp.kills} · 끝없는 탑 ${rp.tower.max}층
(이야기는 추후 업데이트 예정)
@end 처음부터 -> loopRestart
`;
  };
  WS.SCRIPTS.doomEnd = '';
  WS.defineScriptScene('doomEnd', {
    script: 'doomEnd', props: false,
    backdrop(ctx, W, H, stage) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a0a12'); g.addColorStop(0.6, '#7a1a22'); g.addColorStop(1, '#f2c8b8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,230,220,0.6)';
      for (let i = 0; i < 40; i++) { const x = (i * 73 + stage.time * 20) % W, y = H - ((i * 41 + stage.time * (12 + i % 5)) % H); ctx.fillRect(Math.round(x), Math.round(y), 1, 2); }
    },
  });
  // 회차 증가 후 흰 공간부터
  WS.registerScene('loopRestart', {
    enter(game) {
      const meta = WS.Progression.loadMeta();
      // 다회차 이월: 지금 회차의 스펙(레벨 · 스탯 · 장비 · 소지품 · 골드 · 영혼의 보석)을 회차 메타에 맡겨 둔다 → 다음 회차 R.ensure 에서 받는다
      if (game.state && game.state.rpg && !game.state.flags.test_mode) meta.carry = R.makeCarry(game.state);
      meta.loop = (meta.loop || 1) + 1;
      meta.endingsSeen = Array.from(new Set([...(meta.endingsSeen || []), 'doom']));
      WS.Progression.saveMeta(meta);
      // 수동 슬롯은 건드리지 않는다. 자동 저장 슬롯은 새 회차에서 처음 저장될 때 새 기록으로 바뀐다.
      setTimeout(() => game.newGame({ scene: 'whiteSpace' }), 50);
    },
    exit() {},
  });


  // ---------------- 집 = 주인공의 방 ----------------
  R.homeBed = () => { const d = R.MAPS.wildwind.buildings[0].door; return { map: 'wildwind', x: d[0], y: d[1], scene: 'heroRoom' }; };

  /** 주인공의 방에서 깨어난다 (잠 · 패배 · 귀환 주문서). note 가 있으면 날짜 카드를 띄운다 */
  R.wakeInRoom = function (game, note) {
    const w = WS.MAPS.heroRoom.wakeTile;
    game.state.position = { sceneId: 'heroRoom', x: w.x, y: w.y, dir: 'down' };
    game.scenes.goTo('heroRoom', {}).then(() => { if (note) R.UI.dayCard(note); });
  };

  // 방의 침대: 메이어의 이야기를 들은 뒤에는 쉬거나 잠들 수 있다 (집이 잠자리 · 무료)
  if (WS.SCRIPTS.heroRoom && !WS.SCRIPTS.heroRoom.includes('@rpgbed')) {
    WS.SCRIPTS.heroRoom = WS.SCRIPTS.heroRoom
      .replace(/\n=== bed_again\n/, '\n@rpgbed\n\n=== bed_again\n')
      .replace(/\n=== desk\n/, '\n@rpgbed\n\n=== desk\n');
  }
  WS.SCRIPT_COMMANDS.rpgbed = async (g) => {
    const sd = WS.State.sceneData(g.state, 'heroRoom'), run = g.state, rp = run.rpg;
    if (!sd.events.briefing || !rp) return null;
    const canSleep = rp.gauge <= 0;
    const choices = canSleep ? ['잠을 잔다 — 하루가 지나간다', '그만둔다'] : ['쉬어 간다 — 체력 · 마나 회복', '그만둔다'];
    const i = await g.ui.dialogue.choose(choices);
    g.ui.dialogue.hide();
    if (i !== 0) return null;
    rp.bed = R.homeBed();
    if (!canSleep) {
      const st = R.stats(run);
      rp.hp = st.hp; rp.mp = st.mp; rp.poison = 0;
      g.ui.toast('푹 쉬었다. 체력 · 마나가 회복되었다. (날짜는 그대로)');
      return null;
    }
    if (rp.day >= R.TIME.lastDay) {
      const ok = await g.ui.confirm({ title: '마지막 밤', body: '오늘은 30일째입니다.<br>잠들면 세계의 마지막 밤이 지나갑니다.', yes: '잠든다', no: '아직이다' });
      if (!ok) return null;
    }
    await g.ui.veil(true, 600);
    const res = R.sleep(run);
    rp.emptyWarned = false;
    if (res === 'doom') { await g.ui.veil(false, 10); R.scene.game = g; R.scene.doom(); return null; }
    R.Save.autosave(g, 'sleep');
    const v = g.stage.view, w = WS.MAPS.heroRoom.wakeTile;
    if (v && v.player) { Object.assign(v.player, { x: w.x, y: w.y, dir: 'down' }); v.player.px = w.x * v.T; v.player.py = w.y * v.T; v.savePosition(); }
    await g.ui.veil(false, 500);
    R.Audio && R.Audio.jingle('me_night');
    await R.UI.dayCard('변신 게이지가 가득 찼다.');
    return null;
  };

  // ---------------- 주인공의 방: 메뉴 · 저장 ----------------
  // 방 장면(heroRoom)은 흰 공간 쪽 원래 장면이다. RPG 상태(run.rpg)가 생긴 뒤(처음 문을 나선 뒤)부터
  // 방에서도 상단 정보 · 메뉴 버튼이 보이고 저장할 수 있다. 방에서 저장한 기록은 방에서 이어진다.
  (function wrapHeroRoom() {
    const scene = WS.SCENES.heroRoom;
    if (!scene || scene._rpgWrapped) return;
    const enter = scene.enter, exit = scene.exit;
    scene.enter = function (game, payload) {
      if (R.pendingLoad) { game.state = R.pendingLoad; R.pendingLoad = null; game.ui.hud.refresh(); }
      const res = enter.call(this, game, payload);
      const v = game.stage.view;
      // 방에서도 자동 저장: 흰 공간을 마친 뒤 방에 들어왔을 때(시작 이벤트가 끝난 뒤) · 방에서 무언가를 조사한 뒤
      //   → 방까지만 진행하고 꺼도 타이틀의 「이어하기」로 방에서 다시 시작한다 (흰 공간을 다시 보지 않는다)
      const roomSave = () => { if (game.scenes.current === 'heroRoom' && !game.state.flags.test_mode) R.Save.autosave(game, 'room'); };
      Promise.resolve(res).then(() => setTimeout(roomSave, 50));
      if (v instanceof WS.MapView && v.hooks && v.hooks.interact) {
        const hi = v.hooks.interact;
        v.hooks.interact = async t => { await hi(t); if (game.stage.view === v && !v.detached) roomSave(); };
      }
      if (v instanceof WS.MapView && game.state.position && game.state.position.sceneId !== 'heroRoom' && v.mode === 'explore') v.savePosition();   // 방 위치를 바로 기록 (바로 저장해도 방에서 이어지게)
      if (game.state.rpg) {
        R.loadAssets();
        R.UI.mount();
        R.UI.showHud(true);
        R.UI.refreshHud('클레어의 방');
      }
      return res;
    };
    scene.exit = function (game) {
      if (R.UI.menuOpen && R.UI.menuOpen()) R.UI.closeMenu();
      R.UI.showHud(false);
      return exit.call(this, game);
    };
    scene._rpgWrapped = true;
  })();

  // ---------------- 테스트용 콘솔 함수 ----------------
  // 회차 해금 확인용: WSDebug.unlockOldVillage() / lockOldVillage() / setLoop(2) — 회차 메타 데이터를 바꾼다
  window.WSDebug = {
    meta() { return WS.Progression.loadMeta(); },
    setLoop(n) { const m = WS.Progression.loadMeta(); m.loop = n; WS.Progression.saveMeta(m); if (WS.game) WS.game.meta = m; return m; },
    unlockOldVillage() { const m = WS.Progression.loadMeta(); m.endingsSeen = Array.from(new Set([...(m.endingsSeen || []), 'ending_unlock_oldvillage'])); WS.Progression.saveMeta(m); if (WS.game) WS.game.meta = m; return m; },
    lockOldVillage() { const m = WS.Progression.loadMeta(); m.endingsSeen = (m.endingsSeen || []).filter(e => e !== 'ending_unlock_oldvillage'); WS.Progression.saveMeta(m); if (WS.game) WS.game.meta = m; return m; },
    go(id, x, y) { R.scene.goMap(id, x != null ? { x, y, dir: 'down' } : null); },
  };

  // ---------------- 시작 화면: 이어하기 (슬롯 고르기) ----------------
  window.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('start-gate');
    if (!gate) return;
    // 저장 기록이 없어도 「불러오기」 버튼은 항상 보인다 (기록이 있으면 「이어하기」 + 최근 기록)
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g-btn rpg-continue';
    const label = () => {
      const latest = R.Save.any() ? R.Save.latest() : null;
      const s = latest ? R.Save.summary(R.Save.read(latest).data.state) : null;
      const wait = R.Store.cloud === 'connecting' && !latest ? '<small>저장 기록을 불러오는 중…</small>' : '';
      b.innerHTML = `${latest ? '이어하기' : '불러오기'} ${s ? `<small>최근: ${R.Save.label(latest)} — ${s.day}일째 · Lv.${s.lv}</small>` : wait}`;
    };
    label();
    b.addEventListener('click', e => { e.stopPropagation(); R.Save.openStartPicker(gate); });
    gate.appendChild(b);
    // 서버에서 기록을 받아 오면 버튼 · 회차 정보를 새로 (아직 시작하지 않았을 때만 회차 정보를 바꾼다)
    const refresh = () => {
      label();
      if (document.body.contains(gate) && WS.game) WS.game.meta = WS.Progression.loadMeta();
      const picker = document.getElementById('rpg-slots');
      if (picker && picker.classList.contains('show')) R.Save.openStartPicker(gate);
    };
    R.Store.onChange(refresh);
    R.Store.ready.then(refresh);
  });
})();
