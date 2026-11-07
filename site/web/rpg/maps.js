/*
 * 필드 — 지역 지도 생성 + 월드 뷰 (흰 공간의 WS.MapView 를 확장)
 * ------------------------------------------------------------
 * 지도는 R.MAPS 의 설정(종류 · 출구 · 건물 · NPC · 마물)으로부터 고정 시드로 매번 같은 모양으로 만들어진다.
 * 그림은 16px 타일(The Fan-tasy Tileset)을 3배로 키워 흰 공간 맵 시스템의 48px 격자에 맞춘다.
 *
 * 조작 · 충돌 · 조사 · 카메라 · 조이스틱은 WS.MapView 를 그대로 쓰고, 여기서는
 *   - 지역 경계 출구로 걸어 나가기
 *   - 걸음 기록 (독 상태일 때 4걸음마다 체력 1 감소). 걸음으로 시간이 흐르지는 않는다.
 *     하루는 변신 게이지가 바닥난 뒤 집이나 여관에서 잠들 때만 지나간다 (scene.js).
 *   - 멸망이 다가올수록 붉어지는 하늘
 *   - 필드에 보이는 마물(닿으면 전투), 보스, 보물상자, 돌아다니는 주민
 * 을 더한다.
 */
window.WS = window.WS || {};
(function () {
  const R = WS.RPG;
  const TS = 16, K = 3, T = TS * K;             // 원본 타일 16px → 화면 48px
  // 지면 종류
  const G = { grass: 0, road: 1, water: 2, floor: 3, wall: 4, plank: 5, cobble: 6, carpet: 7, cave: 8, cavewall: 9, tower: 10, towerwall: 11, ruin: 12, redsand: 13, cliff: 14, redrock: 15, wood: 16, woodwall: 17, sandrock: 18 };
  R.G = G;
  const WALLS = new Set([G.wall, G.cavewall, G.towerwall, G.cliff, G.redrock, G.woodwall, G.sandrock]);

  // ---------------- 절차 생성 타일 (석재 · 나무판 등 타일셋에 없는 바닥) ----------------
  const tileCache = {};
  function procTile(kind) {
    if (tileCache[kind]) return tileCache[kind];
    const c = document.createElement('canvas'); c.width = c.height = TS;
    const g = c.getContext('2d');
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const rnd = R.rng(kind);
    const noise = (cols, n) => { for (let i = 0; i < n; i++) P(rnd.int(0, 15), rnd.int(0, 15), 1, 1, rnd.pick(cols)); };
    switch (kind) {
      case 'floor': case 'tower': case 'ruin': {
        const pal = { floor: ['#b9b3c4', '#a59fb2', '#8e879c', '#cfc9d8'], tower: ['#5e4f6e', '#524462', '#433754', '#6c5c7e'], ruin: ['#a8a490', '#96927c', '#7f7b66', '#bdb9a2'] }[kind];
        P(0, 0, 16, 16, pal[0]);
        P(0, 7, 16, 1, pal[2]); P(0, 15, 16, 1, pal[2]); P(7, 0, 1, 7, pal[2]); P(3, 8, 1, 7, pal[2]); P(11, 8, 1, 7, pal[2]);
        P(0, 0, 7, 1, pal[3]); P(8, 0, 8, 1, pal[3]); P(0, 8, 3, 1, pal[3]); P(4, 8, 7, 1, pal[3]); P(12, 8, 4, 1, pal[3]);
        noise([pal[1], pal[1], pal[3]], 14);
        if (kind === 'ruin') noise(['#6f8f4a', '#86a85a'], 9);
        break;
      }
      case 'wall': case 'towerwall': {
        const pal = kind === 'wall' ? ['#6e6680', '#5a536a', '#847c96', '#3e384a'] : ['#3a2e48', '#2e243a', '#4a3c5a', '#1e1628'];
        P(0, 0, 16, 16, pal[0]);
        for (let y = 0; y < 16; y += 4) { P(0, y + 3, 16, 1, pal[3]); const o = (y / 4) % 2 ? 4 : 0; for (let x = o; x < 16; x += 8) P(x, y, 1, 3, pal[3]); P(0, y, 16, 1, pal[2]); }
        noise([pal[1]], 10);
        break;
      }
      case 'walltop': case 'towerwalltop': case 'cavewalltop': {
        const col = { walltop: ['#2c2836', '#383344'], towerwalltop: ['#1a1222', '#251a30'], cavewalltop: ['#2a2018', '#352a20'] }[kind];
        P(0, 0, 16, 16, col[0]); noise([col[1]], 26);
        break;
      }
      case 'cave': {
        P(0, 0, 16, 16, '#6e5c4a'); noise(['#5e4e3e', '#7e6a56', '#665444', '#8a765e'], 60);
        break;
      }
      case 'cavewall': {
        P(0, 0, 16, 16, '#4e3e30');
        for (let i = 0; i < 6; i++) { const x = rnd.int(0, 12), y = rnd.int(0, 12), s = rnd.int(3, 6); P(x, y, s, s - 1, '#5e4a3a'); P(x, y, s, 1, '#7a6450'); P(x, y + s - 1, s, 1, '#382c22'); }
        P(0, 14, 16, 2, '#2e241c');
        break;
      }
      case 'plank': {
        P(0, 0, 16, 16, '#a8743e');
        for (let y = 0; y < 16; y += 4) { P(0, y, 16, 1, '#c58e52'); P(0, y + 3, 16, 1, '#6e4624'); }
        P(rnd.int(2, 12), 1, 1, 2, '#6e4624'); P(rnd.int(2, 12), 9, 1, 2, '#6e4624'); P(5, 5, 1, 1, '#4a2e18'); P(11, 13, 1, 1, '#4a2e18');
        break;
      }
      case 'cobble': {
        P(0, 0, 16, 16, '#8f8a84');
        const stones = [[0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 4, 5], [5, 6, 6, 5], [12, 6, 4, 5], [0, 12, 8, 4], [9, 12, 7, 4]];
        for (const [x, y, w, h] of stones) { P(x, y, w - 1, h - 1, rnd.pick(['#b7b1a8', '#aaa49a', '#c2bcb2'])); P(x, y, w - 1, 1, '#d4cfc6'); }
        break;
      }
      case 'carpet': {
        P(0, 0, 16, 16, '#a8283c'); noise(['#b8344a', '#98203a'], 20); P(0, 0, 2, 16, '#d6b25e'); P(14, 0, 2, 16, '#d6b25e');
        break;
      }
      case 'redsand': {
        P(0, 0, 16, 16, '#c9774a'); noise(['#b8663c', '#d88a5a', '#a85a34', '#e09a68'], 46);
        break;
      }
      case 'cliff': case 'redrock': case 'sandrock': {
        const pal = { cliff: ['#8a7a66', '#6e604e', '#a8977e', '#4e4236'], redrock: ['#a2482c', '#86381f', '#c26442', '#5e2414'], sandrock: ['#c8a46a', '#a8864e', '#e0c088', '#7a5e34'] }[kind];
        P(0, 0, 16, 16, pal[0]);
        for (let i = 0; i < 5; i++) { const x = rnd.int(0, 11), y = rnd.int(0, 11), s = rnd.int(3, 6); P(x, y, s, s - 1, pal[1]); P(x, y, s, 1, pal[2]); }
        P(0, 13, 16, 3, pal[3]); P(0, 12, 16, 1, pal[1]);
        break;
      }
      case 'clifftop': case 'redrocktop': case 'sandrocktop': {
        // 바위 고지대: 갈라진 결 + 돌 무늬 (위에서 내려다본 바위)
        const pal = { clifftop: ['#7d7462', '#958a74', '#655c4c', '#5e7a42'], redrocktop: ['#8e3e24', '#a84e30', '#6e2c18', '#b8603a'], sandrocktop: ['#c09a5e', '#d4b072', '#a07c46', '#e2c48a'] }[kind];
        P(0, 0, 16, 16, pal[0]);
        for (let i = 0; i < 4; i++) { const x = rnd.int(0, 12), y = rnd.int(0, 12), s = rnd.int(2, 4); P(x, y, s + 1, s, pal[1]); P(x, y + s, s + 1, 1, pal[2]); }
        P(rnd.int(0, 14), rnd.int(0, 15), 3, 1, pal[2]); P(rnd.int(0, 14), rnd.int(0, 15), 2, 1, pal[2]);
        noise([pal[1], pal[2], pal[3]], 10);
        break;
      }
      case 'wood': {
        P(0, 0, 16, 16, '#b07c4c');
        for (let y = 0; y < 16; y += 4) { P(0, y, 16, 1, '#c99460'); P(0, y + 3, 16, 1, '#7c5230'); P(((y / 4) * 7) % 16, y + 1, 1, 2, '#7c5230'); }
        break;
      }
      case 'woodwall': {
        P(0, 0, 16, 16, '#d8c0a0'); for (let x = 0; x < 16; x += 4) P(x, 0, 1, 16, '#c4a882'); P(0, 12, 16, 4, '#8a5a38'); P(0, 12, 16, 1, '#a87048');
        break;
      }
      case 'woodwalltop': {
        P(0, 0, 16, 16, '#4a2e22'); noise(['#5a3a2a'], 20);
        break;
      }
      case 'stairsUp': case 'stairsDown': {
        P(0, 0, 16, 16, '#2a2234');
        for (let i = 0; i < 5; i++) { const y = kind === 'stairsUp' ? 2 + i * 3 : 2 + i * 3; const s = kind === 'stairsUp' ? i : 4 - i; P(2 + s, y, 12 - s * 2, 2, '#b0a4c4'); P(2 + s, y + 2, 12 - s * 2, 1, '#6c6080'); }
        break;
      }
    }
    return (tileCache[kind] = c);
  }

  // ---------------- 오토타일 ----------------
  function blobIndex(same, x, y) {
    const s = (dx, dy) => same(x + dx, y + dy);
    let m = 0;
    if (s(0, -1)) m |= 1; if (s(1, 0)) m |= 4; if (s(0, 1)) m |= 16; if (s(-1, 0)) m |= 64;
    if ((m & 1) && (m & 4) && s(1, -1)) m |= 2;
    if ((m & 4) && (m & 16) && s(1, 1)) m |= 8;
    if ((m & 16) && (m & 64) && s(-1, 1)) m |= 32;
    if ((m & 64) && (m & 1) && s(-1, -1)) m |= 128;
    const idx = R.BLOB[m];
    return idx === undefined ? 8 : idx;
  }

  // ---------------- 지도 크기 · 출구 ----------------
  // 지역 종류별 크기 (칸). 끝없는 탑 층과 탑 로비는 그대로 40×30.
  R.SIZE_BY_TYPE = {
    town: [60, 45], city: [60, 45], beachtown: [60, 45], castle: [48, 36], towerlobby: [40, 30], towerfloor: [40, 30],
    forest: [60, 45], mush: [60, 45], river: [60, 45], ruins: [60, 45], mine: [60, 45], cave: [60, 45], sea: [60, 45],
    cliff: [60, 45], battlefield: [60, 45], graveyard: [56, 42], lake: [60, 45], canyon: [60, 45], desert: [60, 45],
    coast: [60, 45], observatory: [54, 40], fortress: [56, 42], oldvillage: [56, 42], interior: [16, 12],
  };
  /** 지역 정의 (R.MAPS · 끝없는 탑 층 · 건물 내부 'in:지역:건물번호') */
  R.mapDef = function (id, opts = {}) {
    if (id === 'tower_f') return { id, n: `끝없는 탑 ${opts.floor}층`, type: 'towerfloor', exits: {} };
    if (typeof id === 'string' && id.startsWith('in:')) {
      const [, parent, idx] = id.split(':');
      const p = R.MAPS[parent], b = p && p.buildings && p.buildings[+idx];
      if (!b || !R.INTERIOR_ROLES.includes(b.role)) return null;
      return { id, n: `${p.n} · ${b.label}`, type: 'interior', role: b.role, building: b, buildingIdx: +idx, parent, exits: { s: '__out' }, size: b.role === 'inn' ? [20, 13] : [16, 12] };
    }
    return R.MAPS[id] ? Object.assign({ id }, R.MAPS[id]) : null;
  };
  R.INTERIOR_ROLES = ['shop', 'inn', 'talk'];          // 내부 맵이 있는 건물 (home 은 주인공의 방으로 이어진다)
  R.mapSize = function (id) {
    const d = R.mapDef(id, { floor: 1 });
    return (d && d.size) || R.SIZE_BY_TYPE[d ? d.type : 'forest'] || [40, 30];
  };
  /** 출구 칸 · 도착 위치. 건물 내부는 아래쪽 가운데 한 칸 */
  R.exitsFor = function (w, h, narrow) {
    const cx = w >> 1, cy = h >> 1;
    if (narrow) return { s: { cells: [[cx, h - 1]], arrive: [cx, h - 2, 'up'] } };
    return {
      n: { cells: [[cx - 1, 0], [cx, 0], [cx + 1, 0]], arrive: [cx, 1, 'down'] },
      s: { cells: [[cx - 1, h - 1], [cx, h - 1], [cx + 1, h - 1]], arrive: [cx, h - 2, 'up'] },
      w: { cells: [[0, cy - 1], [0, cy], [0, cy + 1]], arrive: [1, cy, 'right'] },
      e: { cells: [[w - 1, cy - 1], [w - 1, cy], [w - 1, cy + 1]], arrive: [w - 2, cy, 'left'] },
    };
  };
  R.arriveAt = function (id, side) {
    const [w, h] = R.mapSize(id);
    return R.exitsFor(w, h, id.startsWith('in:'))[side].arrive;
  };
  const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
  R.OPP = OPP;

  class Grid {
    constructor(id, def, w, h) {
      this.id = id; this.def = def; this.w = w; this.h = h;
      this.ground = new Uint8Array(w * h);
      this.solid = new Uint8Array(w * h);
      this.reserved = new Uint8Array(w * h);   // 장식을 놓지 않을 칸 (길 · 건물 · 출구 주변)
      this.decos = [];                          // 그릴 것 {img, x, y, sortY}
      this.objects = [];                        // 조사할 수 있는 것 (WS.MapView 형식)
      this.npcs = [];
      this.rand = R.rng('map:' + id);
      this.flowers = [];
      this.exits = R.exitsFor(w, h, def.type === 'interior');
    }
    get cx() { return this.w >> 1; }
    get cy() { return this.h >> 1; }
    i(x, y) { return y * this.w + x; }
    in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { return this.in(x, y) ? this.ground[this.i(x, y)] : -1; }
    set(x, y, g) { if (this.in(x, y)) this.ground[this.i(x, y)] = g; }
    block(x, y, v = 1) { if (this.in(x, y)) this.solid[this.i(x, y)] = v; }
    isSolid(x, y) { return !this.in(x, y) || this.solid[this.i(x, y)] === 1; }
    keep(x, y) { if (this.in(x, y)) this.reserved[this.i(x, y)] = 1; }
    free(x, y) { return this.in(x, y) && !this.solid[this.i(x, y)] && !this.reserved[this.i(x, y)]; }
    rect(x0, y0, x1, y1, fn) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.in(x, y)) fn(x, y); }
    /** (x, y) 근처에서 조건을 만족하는 칸 */
    near(x, y, ok, r = 8) {
      if (ok(x, y)) return [x, y];
      for (let d = 1; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        if (ok(x + dx, y + dy)) return [x + dx, y + dy];
      }
      return [x, y];
    }
    /** 두 점을 잇는 구불구불한 길 */
    carvePath(ax, ay, bx, by, width, g, wobble = 0.35) {
      let x = ax, y = ay, guard = 0;
      const r = Math.floor(width / 2), W = this.w, H = this.h;
      while ((x !== bx || y !== by) && guard++ < 1200) {
        this.rect(x - r, y - r, x - r + width - 1, y - r + width - 1, (cx, cy) => this.paint(cx, cy, g));
        const dx = Math.sign(bx - x), dy = Math.sign(by - y);
        if (this.rand() < wobble) {
          const side = this.rand() < 0.5;
          if (dx !== 0 && side) y += this.rand() < 0.5 ? 1 : -1;
          else if (dy !== 0) x += this.rand() < 0.5 ? 1 : -1;
          x = Math.max(2, Math.min(W - 3, x)); y = Math.max(2, Math.min(H - 3, y));
        } else if (dx !== 0 && (dy === 0 || this.rand() < 0.5)) x += dx; else y += dy;
      }
      this.rect(bx - r, by - r, bx - r + width - 1, by - r + width - 1, (cx, cy) => this.paint(cx, cy, g));
    }
    /** 길 한 칸 칠하기: 물 위를 지나면 나무 다리가 된다 */
    paint(cx, cy, g) {
      if (!this.in(cx, cy)) return;
      const cur = this.get(cx, cy);
      if (g === G.plank && cur === G.road) { /* 모래 위는 모래 그대로 */ }
      else if (g !== null) this.set(cx, cy, cur === G.water && g !== G.plank && g !== G.cave && g !== G.floor ? G.plank : g);
      else if (cur === G.water) this.set(cx, cy, G.plank);
      this.keep(cx, cy);
      if (this.open) this.open[this.i(cx, cy)] = 1;
    }
    lineRoad(x0, y0, x1, y1, g) { this.rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), (x, y) => { this.set(x, y, g); this.keep(x, y); }); }
    blob(cx, cy, rx, ry, fn) { this.rect(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1 + this.rand() * 0.25) fn(x, y); }); }

    addImage(name, cx, by, opt = {}) {
      // cx: 그림 가로 중심(타일), by: 그림 바닥이 닿는 타일 줄
      const im = R.img[name]; if (!im) return null;
      const d = { img: name, x: (cx * TS + TS / 2) - im.width / 2 + (opt.dx || 0), y: (by + 1) * TS - im.height + (opt.dy || 0), w: im.width, h: im.height, sortY: by + (opt.sortDy || 0), tint: opt.tint };
      this.decos.push(d);
      return d;
    }
    proc(fn, x, y, w, h, extra = {}) {
      this.decos.push(Object.assign({ fn, x: x * TS, y: (y + 1) * TS - h, w, h, sortY: y }, extra));
    }
    tree(x, y, opt = {}) {
      if (!this.in(x, y) || this.reserved[this.i(x, y)]) return false;
      const name = opt.name || this.rand.pick(['Tree_Emerald_1', 'Tree_Emerald_2', 'Tree_Emerald_3', 'Tree_Emerald_4', 'Tree_Emerald_2']);
      this.addImage(name, x, y, { dy: 3, tint: opt.tint });
      this.block(x, y); this.keep(x, y);
      return true;
    }
    bush(x, y, opt = {}) {
      if (!this.in(x, y) || this.reserved[this.i(x, y)]) return;
      const name = this.rand.pick(['Bush_Emerald_1', 'Bush_Emerald_3', 'Bush_Emerald_5', 'Bush_Emerald_6', 'Bush_Emerald_4']);
      this.addImage(name, x, y, { tint: opt.tint });
      if (name === 'Bush_Emerald_1' || name === 'Bush_Emerald_3') this.block(x, y);
      this.keep(x, y);
    }
    prop(name, x, y, opt = {}) {
      const im = R.img[name]; if (!im) return;
      const half = Math.max(0, Math.round(im.width / TS / 2 - 0.6));
      if (opt.findFree !== false) [x, y] = this.near(x, y, (xx, yy) => { for (let d = -half; d <= half; d++) if (!this.free(xx + d, yy)) return false; return true; });
      this.addImage(name, x, y, { tint: opt.tint });
      for (let dx = -half; dx <= half; dx++) { this.block(x + dx, y); this.keep(x + dx, y); }
      if (im.height > 40) for (let dx = -half; dx <= half; dx++) this.keep(x + dx, y - 1);
    }
    building(b, idx, opt = {}) {
      const im = R.img[b.img]; if (!im) return;
      const [dx, dy] = b.door;
      const left = dx * TS + TS / 2 - im.width * (R.DOOR_FRAC[b.img] || 0.5);
      const top = dy * TS - im.height;
      this.decos.push({ img: b.img, x: left, y: top, w: im.width, h: im.height, sortY: dy - 1, label: b.label, labelX: dx * TS + TS / 2, labelY: top - 2, tint: opt.tint });
      const x0 = Math.floor((left + 4) / TS), x1 = Math.floor((left + im.width - 4) / TS);
      const y0 = Math.floor((top + im.height * 0.42) / TS);
      for (let y = y0; y < dy; y++) for (let x = x0; x <= x1; x++) { this.block(x, y); this.keep(x, y); }
      for (let y = Math.floor(top / TS); y < y0; y++) for (let x = x0; x <= x1; x++) this.keep(x, y);
      this.keep(dx, dy); this.keep(dx, dy + 1);
      // 역할이 있는 건물만 문을 조사할 수 있다 (장식용 건물은 들어갈 수 없음)
      if (b.role) this.objects.push({ id: 'bld' + idx, name: b.label, tiles: [[dx, dy - 1]], interact: 'building', from: ['up'], data: Object.assign({ idx }, b), markerDy: -10 });
    }
    chest(x, y, item, n, key) {
      this.block(x, y); this.keep(x, y);
      this.objects.push({ id: 'chest:' + key, name: '보물상자', tiles: [[x, y]], interact: 'chest', data: { item, n, key }, markerDy: -4 });
    }
    borderTrees(tint) {
      const W = this.w, H = this.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
        if (!edge || this.reserved[this.i(x, y)]) continue;
        this.block(x, y);
        if ((x + y * 3) % 2 === 0 && this.rand() < 0.75) this.tree(x, y, { tint }); else if (this.rand() < 0.5) this.bush(x, y, { tint });
        this.block(x, y);
      }
    }
    reserveExits(exits, depth = 3) {
      for (const d in exits) {
        const e = this.exits[d]; if (!e) continue;
        for (const [x, y] of e.cells) for (let k = 0; k < depth; k++) {
          const xx = d === 'w' ? x + k : d === 'e' ? x - k : x, yy = d === 'n' ? y + k : d === 's' ? y - k : y;
          this.keep(xx, yy); this.block(xx, yy, 0);
          if (this.open) this.open[this.i(xx, yy)] = 1;
        }
      }
    }
    exitStart(d) { const a = this.exits[d].arrive; return [a[0], a[1]]; }
  }

  // ----- 마을 (town · city · beachtown) -----
  // 60×45 기준 배치: 큰길 가로(가운데 3줄) · 세로(가운데 3칸), 건물 자리 북쪽 4곳 · 남쪽 4곳.
  // 데이터의 역할 건물은 바깥쪽 자리(x 9 · 40), 나머지 자리에는 장식용 집을 세운다.
  const TOWN_SLOTS_X = [9, 21, 40, 52];
  function genTown(gr, def) {
    const W = gr.w, H = gr.h, cx = gr.cx, cy = gr.cy;
    const city = def.type === 'city', beach = def.type === 'beachtown';
    const roadG = city ? G.cobble : G.road;
    const northY = 14, southY = beach ? 33 : 37;
    gr.reserveExits(def.exits || {});
    if (beach) {
      gr.rect(0, 34, W - 1, 38, (x, y) => gr.set(x, y, G.road));                       // 모래사장
      gr.rect(0, 39, W - 1, H - 1, (x, y) => { gr.set(x, y, G.water); gr.block(x, y); gr.keep(x, y); });
    }
    gr.lineRoad(6, cy - 1, W - 7, cy + 1, roadG);
    gr.lineRoad(cx - 1, 5, cx + 1, beach ? 36 : H - 6, roadG);
    if (city) gr.lineRoad(cx - 9, cy - 5, cx + 9, cy + 5, G.cobble);
    for (const d in def.exits || {}) {
      if (d === 'n') gr.lineRoad(cx - 1, 0, cx + 1, 5, roadG);
      if (d === 's') {
        if (beach) { gr.lineRoad(cx - 1, 34, cx + 1, 38, G.road); gr.lineRoad(cx - 1, 39, cx + 1, H - 1, G.plank); gr.rect(cx - 1, 39, cx + 1, H - 1, (x, y) => gr.block(x, y, 0)); }
        else gr.lineRoad(cx - 1, H - 6, cx + 1, H - 1, roadG);
      }
      if (d === 'w') gr.lineRoad(0, cy - 1, 6, cy + 1, roadG);
      if (d === 'e') gr.lineRoad(W - 7, cy - 1, W - 1, cy + 1, roadG);
    }
    // 역할 건물 + 장식용 집
    const used = new Set();
    const list = (def.buildings || []).map((b, i) => { used.add(b.door.join(',')); return [b, i]; });
    let k = 100;
    for (const y of [northY, southY]) for (const x of TOWN_SLOTS_X) {
      if (used.has(x + ',' + y)) continue;
      list.push([{ img: gr.rand.pick(['House_Hay_1', 'House_Hay_2', 'House_Hay_1']), door: [x, y], deco: true }, k++]);
    }
    for (const [b, i] of list) {
      const [dx, dy] = b.door;
      gr.lineRoad(Math.min(dx, cx), dy, Math.max(dx, cx), dy + 1, roadG);
    }
    for (const [b, i] of list) gr.building(b, i);
    (def.props || []).forEach(([name, x, y]) => gr.prop(name, x, y));
    // 장미 마을: 꽃밭
    if (def.flowers) {
      for (let n = 0; n < 160; n++) {
        const x = gr.rand.int(3, W - 4), y = gr.rand.int(3, beach ? 32 : H - 4);
        if (gr.reserved[gr.i(x, y)] || gr.get(x, y) !== G.grass) continue;
        gr.flowers.push({ x, y, kind: gr.rand() < 0.75 ? 'flowers' : 'flowersW', ph: gr.rand.int(0, 23) });
        gr.keep(x, y);
      }
    }
    // 마을 소품 (울타리 대신 통 · 상자 · 짚더미 · 벤치)
    const smalls = beach ? ['Crate_Medium_Closed', 'Barrel_Small_Empty', 'Sack_3', 'Basket_Empty', 'Crate_Water_1'] : ['Barrel_Small_Empty', 'Sack_3', 'Basket_Empty', 'HayStack_2', 'Bench_3', 'Crate_Medium_Closed'];
    for (let n = 0; n < 14; n++) { const x = gr.rand.int(4, W - 5), y = gr.rand.int(4, beach ? 32 : H - 5); if (gr.free(x, y) && gr.get(x, y) === G.grass) gr.prop(gr.rand.pick(smalls), x, y, { findFree: false }); }
    gr.borderTrees();
    for (let n = 0; n < 130; n++) {
      const x = gr.rand.int(2, W - 3), y = gr.rand.int(2, beach ? 32 : H - 3);
      if (gr.reserved[gr.i(x, y)] || gr.get(x, y) !== G.grass) continue;
      const r = gr.rand();
      if (r < 0.25) gr.tree(x, y); else if (r < 0.7) gr.bush(x, y); else { gr.addImage(gr.rand.pick(['Rock_Brown_6', 'Rock_Brown_9', 'Plant_2']), x, y); gr.keep(x, y); }
    }
  }

  // ----- 야외 필드 공통 -----
  // 열린 곳(길 · 빈터)을 먼저 파고, 나머지를 지역 종류에 맞는 것(나무 · 바위 벽 · 마른 나무 …)으로 막는다.
  const WILD = {
    forest:      { block: 'tree' },
    mush:        { block: 'tree', tint: 'mush', deco: 'mushroom' },
    river:       { block: 'tree', water: 'river' },
    ruins:       { block: 'tree', path: 'ruin', deco: 'pillar', patches: 'ruin' },
    cliff:       { block: 'cliff', path: 'road', deco: 'rocks', trees: 0.05 },
    battlefield: { block: 'mixed', path: 'road', deco: 'battle', patches: 'ruin' },
    graveyard:   { block: 'deadtree', path: 'ruin', deco: 'grave', tint: 'grave' },
    lake:        { block: 'tree', water: 'lake' },
    canyon:      { block: 'redrock', ground: 'redsand', path: null, deco: 'rocks' },
    desert:      { block: 'sandrock', ground: 'sand', path: null, deco: 'desert', patches: 'ruin' },
    coast:       { block: 'tree', water: 'coast', deco: 'wreck' },
    observatory: { block: 'tree', path: 'ruin', deco: 'observatory', patches: 'ruin' },
    oldvillage:  { block: 'tree', path: 'road', deco: 'oldvillage', tint: 'gray' },
  };
  function genWild(gr, def) {
    const W = gr.w, H = gr.h, cx = gr.cx, cy = gr.cy;
    const th = WILD[def.type] || WILD.forest;
    gr.open = new Uint8Array(W * H);
    const pathG = th.path === 'ruin' ? G.ruin : th.path === null ? null : G.road;
    if (th.ground === 'redsand') gr.ground.fill(G.redsand);
    if (th.ground === 'sand') gr.ground.fill(G.road);
    gr.reserveExits(def.exits || {});
    // 물: 강(가로) · 호수(가운데) · 해안(오른쪽 아래)
    if (th.water === 'river') {
      let ry = cy - 4;
      for (let x = 0; x < W; x++) {
        if (gr.rand() < 0.3) ry += gr.rand() < 0.5 ? -1 : 1;
        ry = Math.max(cy - 7, Math.min(cy - 1, ry));
        for (let y = ry; y < ry + 4; y++) { gr.set(x, y, G.water); gr.block(x, y); gr.keep(x, y); }
      }
    }
    if (th.water === 'lake') {
      gr.blob(cx, cy, 13, 8, (x, y) => { gr.set(x, y, G.water); gr.block(x, y); gr.keep(x, y); });
      gr.blob(cx + 8, cy + 4, 6, 4, (x, y) => { gr.set(x, y, G.water); gr.block(x, y); gr.keep(x, y); });
    }
    if (th.water === 'coast') {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const shore = W - 16 + Math.round(Math.sin(y * 0.3) * 2) - Math.round(y * 0.15);
        if (x >= shore) { gr.set(x, y, G.water); gr.block(x, y); gr.keep(x, y); }
        else if (x >= shore - 6) { gr.set(x, y, G.road); if (y > 1 && y < H - 2) gr.open[gr.i(x, y)] = 1; }
      }
    }
    // 길: 출구 → 중심 (호수는 호숫가를 따라 돈다)
    const hub = th.water === 'lake' ? [cx - 16, cy + 10] : [cx, cy];
    for (const d in def.exits || {}) { const [sx, sy] = gr.exitStart(d); gr.carvePath(sx, sy, hub[0], hub[1], 3, pathG); }
    if (th.water === 'lake') { gr.carvePath(hub[0], hub[1], cx - 16, cy - 10, 3, pathG); gr.carvePath(cx - 16, cy - 10, cx + 16, cy - 10, 3, pathG); gr.carvePath(cx + 16, cy - 10, cx + 20, cy + 12, 3, pathG); gr.carvePath(cx + 20, cy + 12, hub[0], hub[1], 3, pathG); }
    const targets = [];
    if (def.boss) targets.push(def.boss.at);
    if (def.boss2) targets.push(def.boss2.at);
    (def.chests || []).forEach(c => targets.push([c[0], c[1] + 1]));
    (def.spots || []).forEach(s => targets.push(s));
    for (const [tx, ty] of targets) gr.carvePath(hub[0], hub[1], tx, ty, 2, pathG, 0.4);
    // 잊혀진 옛 마을: 폐가 자리를 먼저 비워 둔다
    if (def.type === 'oldvillage') {
      gr.houseSpots = [];
      for (let k = 0, guard = 0; k < 7 && guard < 80; guard++) {
        const x = gr.rand.int(9, W - 10), y = gr.rand.int(10, H - 5);
        if (gr.houseSpots.some(([a, b]) => Math.abs(a - x) < 14 && Math.abs(b - y) < 10)) continue;
        if (Math.abs(x - cx) < 4 || Math.abs(y - cy) < 3) continue;
        if (def.boss && Math.abs(def.boss.at[0] - x) < 12 && Math.abs(def.boss.at[1] - y) < 10) continue;
        let onPath = false; gr.rect(x - 7, y - 8, x + 7, y, (xx, yy) => { if (gr.reserved[gr.i(xx, yy)]) onPath = true; });
        if (onPath) continue;   // 이미 난 길(마수 · 출구로 가는 길)을 덮지 않는다
        gr.rect(x - 7, y - 8, x + 7, y + 2, (xx, yy) => { gr.open[gr.i(xx, yy)] = 1; });
        gr.carvePath(x, y + 2, hub[0], hub[1], 2, pathG, 0.3);
        gr.houseSpots.push([x, y]); k++;
      }
    }
    // 빈터 (넓어진 만큼 더 많이)
    const nClear = Math.round(W * H / 170);
    for (let k = 0; k < nClear; k++) {
      const bx = gr.rand.int(6, W - 7), by = gr.rand.int(5, H - 6);
      if (gr.get(bx, by) === G.water) continue;
      gr.blob(bx, by, gr.rand.int(3, 5), gr.rand.int(2, 4), (x, y) => { if (gr.get(x, y) !== G.water) gr.open[gr.i(x, y)] = 1; });
      gr.carvePath(bx, by, hub[0], hub[1], 2, null, 0.5);
    }
    if (def.boss) gr.blob(def.boss.at[0], def.boss.at[1], 5, 3, (x, y) => { if (gr.get(x, y) !== G.water) gr.open[gr.i(x, y)] = 1; });
    if (def.boss2) gr.blob(def.boss2.at[0], def.boss2.at[1], 5, 3, (x, y) => { gr.open[gr.i(x, y)] = 1; gr.set(x, y, G.ruin); });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (gr.open[gr.i(x, y)] && gr.get(x, y) !== G.water) gr.block(x, y, 0);
    if (th.patches === 'ruin') for (let k = 0; k < Math.round(W * H / 150); k++) gr.blob(gr.rand.int(5, W - 6), gr.rand.int(4, H - 5), gr.rand.int(2, 4), gr.rand.int(2, 3), (x, y) => { if (gr.open[gr.i(x, y)] && gr.get(x, y) !== G.water) gr.set(x, y, G.ruin); });
    (def.chests || []).forEach(([x, y, item, n], i) => { gr.open[gr.i(x, y)] = 1; gr.chest(x, y, item, n, def.id + ':' + i); });
    // 막힌 곳 채우기
    const tint = th.tint;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = gr.i(x, y);
      if (gr.open[i] || gr.reserved[i] || gr.get(x, y) === G.water) continue;
      gr.block(x, y);
      if (th.block === 'cliff' || th.block === 'redrock' || th.block === 'sandrock') { gr.set(x, y, { cliff: G.cliff, redrock: G.redrock, sandrock: G.sandrock }[th.block]); continue; }
      if (def.type === 'ruins' && gr.rand() < 0.12) { gr.proc('pillar', x, y, 16, 38); gr.keep(x, y); continue; }
      if (th.block === 'deadtree') { if ((x * 7 + y * 13) % 3 === 0 || gr.rand() < 0.2) gr.tree(x, y, { tint: 'dead' }); else if (gr.rand() < 0.3) gr.bush(x, y, { tint: 'dead' }); gr.block(x, y); continue; }
      if (th.block === 'mixed') { const r = gr.rand(); if (r < 0.3) gr.tree(x, y, { tint: 'dead' }); else if (r < 0.55) { gr.addImage(gr.rand.pick(['Rock_Brown_1', 'Rock_Brown_4', 'Rock_Brown_2']), x, y); gr.keep(x, y); } else if (r < 0.8) gr.bush(x, y); gr.block(x, y); continue; }
      if ((x * 7 + y * 13) % 3 === 0 || gr.rand() < 0.22) gr.tree(x, y, { tint }); else if (gr.rand() < 0.45) gr.bush(x, y, { tint });
      gr.block(x, y);
    }
    wildDecor(gr, def, th);
  }

  /** 야외 필드의 분위기 소품 (설정을 설명하지 않는 풍경 소품만) */
  function wildDecor(gr, def, th) {
    const W = gr.w, H = gr.h, cx = gr.cx, cy = gr.cy, rnd = gr.rand;
    const openFree = (x, y) => gr.in(x, y) && gr.open[gr.i(x, y)] && gr.free(x, y) && gr.get(x, y) !== G.water;
    const spots = n => { const out = []; for (let k = 0; k < n * 6 && out.length < n; k++) { const x = rnd.int(2, W - 3), y = rnd.int(2, H - 3); if (openFree(x, y)) out.push([x, y]); } return out; };
    const many = Math.round(W * H / 40);
    switch (th.deco) {
      case 'mushroom':
        for (const [x, y] of spots(many)) { gr.proc('mushroom', x, y, 16, 16, { v: rnd.int(0, 3) }); gr.keep(x, y); if (rnd() < 0.3) gr.block(x, y); }
        break;
      case 'rocks':
        if (def.type === 'cliff') for (const [x, y] of spots(Math.round(many * 0.5))) { gr.addImage(rnd.pick(['Bush_Emerald_5', 'Bush_Emerald_6', 'Plant_2', 'Bush_Emerald_2']), x, y); gr.keep(x, y); }
        for (const [x, y] of spots(Math.round(many * 0.6))) { const big = rnd() < 0.4; gr.addImage(big ? rnd.pick(['Rock_Brown_1', 'Rock_Brown_2', 'Rock_Brown_4']) : rnd.pick(['Rock_Brown_6', 'Rock_Brown_9']), x, y); if (big) gr.block(x, y); gr.keep(x, y); }
        break;
      case 'grave':
        for (const [x, y] of spots(Math.round(many * 0.7))) { gr.proc(rnd() < 0.7 ? 'grave' : 'cross', x, y, 16, 22, { v: rnd.int(0, 2) }); gr.block(x, y); gr.keep(x, y); }
        for (const [x, y] of spots(8)) { gr.proc('lantern', x, y, 16, 30); gr.block(x, y); gr.keep(x, y); }
        break;
      case 'battle':
        for (const [x, y] of spots(Math.round(many * 0.35))) { const r = rnd(); if (r < 0.4) { gr.proc('armor', x, y, 20, 16); gr.keep(x, y); } else if (r < 0.65) { gr.proc('sword', x, y, 12, 22); gr.keep(x, y); } else if (r < 0.85) { gr.proc('cart', x, y, 32, 22); gr.block(x, y); gr.keep(x, y); } else { gr.addImage('Banner_Stick_1_Purple', x, y, { tint: 'gray' }); gr.block(x, y); gr.keep(x, y); } }
        break;
      case 'desert':
        for (const [x, y] of spots(Math.round(many * 0.35))) { if (rnd() < 0.55) { gr.proc('pillar', x, y, 16, 38, { broken: rnd() < 0.5 }); gr.block(x, y); } else { gr.addImage(rnd.pick(['Rock_Brown_6', 'Rock_Brown_9', 'Rock_Brown_1']), x, y); } gr.keep(x, y); }
        for (const [x, y] of spots(4)) { gr.addImage('CityWall_Gate_1', x, y, { tint: 'sand' }); gr.block(x - 2, y); gr.block(x + 2, y); gr.keep(x, y); }
        break;
      case 'wreck':
        for (const [x, y] of spots(Math.round(many * 0.3))) { const r = rnd(); if (r < 0.35) { gr.proc('wreck', x, y, 40, 24); gr.block(x, y); gr.block(x + 1, y); } else if (r < 0.7) gr.addImage(rnd.pick(['Crate_Medium_Closed', 'Barrel_Small_Empty', 'Crate_Large_Empty', 'Sack_3']), x, y), gr.block(x, y); else gr.addImage(rnd.pick(['Rock_Brown_6', 'Rock_Brown_9']), x, y); gr.keep(x, y); }
        break;
      case 'observatory': {
        const [ox, oy] = gr.near(cx, cy - 6, openFree, 10);
        gr.blob(ox, oy + 2, 6, 4, (x, y) => { if (gr.open[gr.i(x, y)]) gr.set(x, y, G.ruin); });
        gr.proc('telescope', ox - 1, oy, 48, 56); gr.rect(ox - 1, oy - 1, ox + 1, oy, (x, y) => { gr.block(x, y); gr.keep(x, y); });
        for (const [x, y] of spots(Math.round(many * 0.25))) { gr.proc('pillar', x, y, 16, 38, { stone: true, broken: rnd() < 0.4 }); gr.block(x, y); gr.keep(x, y); }
        break;
      }
      case 'oldvillage':
        for (const [x, y] of gr.houseSpots || []) gr.building({ img: rnd.pick(['House_Hay_1', 'House_Hay_2', 'House_Hay_3']), door: [x, y + 1] }, 200 + x, { tint: 'gray' });
        for (const [x, y] of spots(Math.round(many * 0.25))) { gr.proc(rnd() < 0.5 ? 'fence' : 'cart', x, y, 32, 22); gr.block(x, y); gr.keep(x, y); }
        break;
      default:
        for (const [x, y] of spots(Math.round(many * 0.5))) {
          if (rnd() < 0.6) { gr.addImage(rnd.pick(['Bush_Emerald_5', 'Bush_Emerald_6', 'Plant_2', 'Rock_Brown_9']), x, y, { tint: th.tint }); gr.keep(x, y); }
          else { gr.addImage(rnd.pick(['Rock_Brown_1', 'Rock_Brown_4', 'Chopped_Tree_1']), x, y); gr.block(x, y); gr.keep(x, y); }
        }
    }
    if (def.type === 'ruins') { const [gx, gy] = gr.near(cx, cy - 8, openFree, 8); gr.addImage('CityWall_Gate_1', gx, gy); gr.block(gx - 2, gy); gr.block(gx + 2, gy); }
  }

  // ----- 동굴 · 광산 · 요새 -----
  function genCave(gr, def) {
    const W = gr.w, H = gr.h, cx = gr.cx, cy = gr.cy;
    const fort = def.type === 'fortress';
    const floorG = fort ? G.floor : G.cave, wallG = fort ? G.wall : G.cavewall;
    gr.open = new Uint8Array(W * H);
    gr.ground.fill(wallG); gr.solid.fill(1);
    gr.reserveExits(def.exits || {});
    for (const d in def.exits || {}) { const [sx, sy] = gr.exitStart(d); gr.carvePath(sx, sy, cx, cy, 3, floorG, fort ? 0.1 : 0.5); }
    const targets = [];
    if (def.boss) targets.push(def.boss.at);
    (def.chests || []).forEach(c => targets.push([c[0], c[1] + 1]));
    (def.spots || []).forEach(s => targets.push(s));
    const nRooms = Math.round(W * H / 200);
    for (let k = 0; k < nRooms; k++) targets.push([gr.rand.int(5, W - 6), gr.rand.int(5, H - 6)]);
    for (const [tx, ty] of targets) {
      gr.carvePath(cx, cy, tx, ty, gr.rand() < 0.5 ? 2 : 3, floorG, fort ? 0.08 : 0.45);
      if (fort) gr.rect(tx - 3, ty - 2, tx + 3, ty + 2, (x, y) => { if (x > 1 && y > 1 && x < W - 2 && y < H - 2) { gr.set(x, y, floorG); gr.open[gr.i(x, y)] = 1; } });
      else gr.blob(tx, ty, gr.rand.int(2, 4), gr.rand.int(2, 3), (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) { gr.set(x, y, floorG); gr.open[gr.i(x, y)] = 1; } });
    }
    if (def.boss) gr.blob(def.boss.at[0], def.boss.at[1], 6, 4, (x, y) => { gr.set(x, y, floorG); gr.open[gr.i(x, y)] = 1; });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (gr.get(x, y) === floorG) gr.block(x, y, 0);
    if (def.type === 'cave') {
      for (let k = 0; k < 10; k++) {
        const x0 = gr.rand.int(4, W - 5), y0 = gr.rand.int(4, H - 5);
        gr.blob(x0, y0, 2, 1, (x, y) => { if (gr.get(x, y) === G.cave && !gr.reserved[gr.i(x, y)]) { gr.set(x, y, G.water); gr.block(x, y); } });
      }
    }
    (def.chests || []).forEach(([x, y, item, n], i) => { gr.set(x, y, floorG); gr.chest(x, y, item, n, def.id + ':' + i); });
    const many = Math.round(W * H / 30);
    for (let k = 0; k < many; k++) {
      const x = gr.rand.int(2, W - 3), y = gr.rand.int(2, H - 3), i = gr.i(x, y);
      if (gr.get(x, y) !== floorG || gr.reserved[i]) continue;
      if (fort) {
        const r = gr.rand();
        if (r < 0.2 && WALLS.has(gr.get(x, y - 1))) { gr.addImage('Banner_Stick_1_Purple', x, y); gr.block(x, y); }
        else if (r < 0.45) { gr.prop(gr.rand.pick(['Crate_Large_Empty', 'Barrel_Small_Empty', 'Crate_Medium_Closed']), x, y, { findFree: false }); }
        else if (r < 0.55) { gr.proc('armor', x, y, 20, 16); }
        gr.keep(x, y);
        continue;
      }
      const big = gr.rand() < 0.4;
      gr.addImage(big ? gr.rand.pick(['Rock_Brown_1', 'Rock_Brown_2', 'Rock_Brown_4']) : gr.rand.pick(['Rock_Brown_6', 'Rock_Brown_9']), x, y);
      if (big) gr.block(x, y);
      gr.keep(x, y);
    }
    if (def.type === 'mine') {
      for (let k = 0; k < 16; k++) {
        const x = gr.rand.int(3, W - 4), y = gr.rand.int(3, H - 4);
        if (gr.get(x, y) !== G.cave || gr.reserved[gr.i(x, y)]) continue;
        gr.prop(gr.rand.pick(['Crate_Large_Empty', 'Barrel_Small_Empty', 'Sack_3', 'Crate_Medium_Closed']), x, y, { findFree: false });
      }
      // 레일 조각 · 버팀목
      for (let k = 0; k < 14; k++) { const x = gr.rand.int(3, W - 4), y = gr.rand.int(3, H - 4); if (gr.get(x, y) === G.cave && gr.free(x, y)) { gr.proc('rail', x, y, 16, 16); gr.keep(x, y); } }
      for (let k = 0; k < 18; k++) { const x = gr.rand.int(3, W - 4), y = gr.rand.int(3, H - 4); if (gr.get(x, y) === G.cave && gr.free(x, y) && WALLS.has(gr.get(x, y - 1))) { gr.proc('beam', x, y, 16, 32); gr.block(x, y); gr.keep(x, y); } }
    }
  }

  // ----- 바다 -----
  function genSea(gr, def) {
    const W = gr.w, H = gr.h, cx = gr.cx, cy = gr.cy;
    gr.open = new Uint8Array(W * H);
    gr.ground.fill(G.water); gr.solid.fill(1);
    gr.reserveExits(def.exits || {});
    for (const d in def.exits || {}) { const [sx, sy] = gr.exitStart(d); gr.carvePath(sx, sy, cx, cy, 2, G.plank, 0.15); }
    const isles = [[cx, cy, 6, 4]];
    if (def.boss) isles.push([def.boss.at[0], def.boss.at[1], 5, 4]);
    (def.chests || []).forEach(c => isles.push([c[0], c[1] + 1, 3, 2]));
    for (let k = 0; k < 7; k++) isles.push([gr.rand.int(6, W - 7), gr.rand.int(5, H - 6), gr.rand.int(2, 5), gr.rand.int(2, 3)]);
    for (const [ix, iy, rx, ry] of isles) {
      gr.blob(ix, iy, rx, ry, (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) { gr.set(x, y, G.road); gr.open[gr.i(x, y)] = 1; } });
      if (ix !== cx || iy !== cy) gr.carvePath(cx, cy, ix, iy, 2, G.plank, 0.1);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const g = gr.get(x, y); if (g === G.road || g === G.plank) gr.block(x, y, 0); }
    (def.chests || []).forEach(([x, y, item, n], i) => { gr.set(x, y, G.road); gr.chest(x, y, item, n, def.id + ':' + i); });
    for (let k = 0; k < 40; k++) {
      const x = gr.rand.int(2, W - 3), y = gr.rand.int(2, H - 3);
      if (gr.get(x, y) !== G.road || gr.reserved[gr.i(x, y)]) continue;
      gr.addImage(gr.rand.pick(['Rock_Brown_6', 'Rock_Brown_9', 'Bush_Emerald_6']), x, y); gr.keep(x, y);
    }
  }

  // ----- 성 · 탑 로비 -----
  function genHall(gr, def) {
    const W = gr.w, H = gr.h, cx = gr.cx, cy = gr.cy;
    const tower = def.type === 'towerlobby';
    const floorG = tower ? G.tower : G.floor, wallG = tower ? G.towerwall : G.wall;
    gr.ground.fill(wallG); gr.solid.fill(1);
    gr.rect(3, 3, W - 4, H - 3, (x, y) => { gr.set(x, y, floorG); gr.block(x, y, 0); });
    gr.reserveExits(def.exits || {});
    for (const d in def.exits || {}) {
      if (d === 's') gr.rect(cx - 1, H - 3, cx + 1, H - 1, (x, y) => { gr.set(x, y, floorG); gr.block(x, y, 0); });
      if (d === 'e') gr.rect(W - 4, cy - 1, W - 1, cy + 1, (x, y) => { gr.set(x, y, floorG); gr.block(x, y, 0); });
      if (d === 'w') gr.rect(0, cy - 1, 3, cy + 1, (x, y) => { gr.set(x, y, floorG); gr.block(x, y, 0); });
      if (d === 'n') gr.rect(cx - 1, 0, cx + 1, 3, (x, y) => { gr.set(x, y, floorG); gr.block(x, y, 0); });
    }
    if (!tower) {
      gr.rect(cx - 1, 4, cx + 1, H - 1, (x, y) => { if (gr.get(x, y) === G.floor) { gr.set(x, y, G.carpet); gr.keep(x, y); } });
      gr.rect(cx - 6, 3, cx + 6, 7, (x, y) => { gr.set(x, y, G.carpet); gr.keep(x, y); });
      for (let y = 10; y < H - 4; y += 4) for (const x of [cx - 6, cx + 6, cx - 13, cx + 13]) { gr.proc('pillar', x, y, 16, 38, { stone: true }); gr.block(x, y); gr.keep(x, y); }
      for (const x of [cx - 3, cx + 3]) gr.prop('Banner_Stick_1_Purple', x, 4, { findFree: false });
      for (const x of [6, 10, W - 11, W - 7]) gr.prop('Banner_Stick_1_Purple', x, 3, { findFree: false });
      gr.decos.push({ fn: 'throne', x: cx * TS - 4, y: 2 * TS, w: 24, h: 30, sortY: 3 });
      gr.block(cx, 3);
      // 옆방 느낌의 칸막이 · 탁자
      for (const [x, y] of [[7, 14], [W - 8, 14], [7, H - 9], [W - 8, H - 9]]) gr.prop('Table_Medium_1', x, y, { findFree: false });
    } else {
      gr.objects.push({ id: 'stairs', name: '위층 계단', tiles: [[cx, 4]], interact: 'stairsUp', markerDy: -6 });
      gr.stairs = [[cx, 4, 'stairsUp']];
      gr.block(cx, 4);
      for (const x of [cx - 4, cx + 4]) gr.prop('Banner_Stick_1_Purple', x, 4, { findFree: false });
      for (let y = 9; y < H - 4; y += 5) for (const x of [12, W - 12]) { gr.proc('pillar', x, y, 16, 38, { dark: true }); gr.block(x, y); }
      gr.decos.push({ fn: 'fire', x: (cx - 3) * TS, y: 4 * TS, w: 32, h: 32, sortY: 4 }); gr.block(cx - 3, 4);
      gr.decos.push({ fn: 'fire', x: (cx + 3) * TS - 16, y: 4 * TS, w: 32, h: 32, sortY: 4 }); gr.block(cx + 3, 4);
    }
    (def.chests || []).forEach(([x, y, item, n], i) => gr.chest(x, y, item, n, def.id + ':' + i));
  }

  // ----- 건물 내부 -----
  function genInterior(gr, def) {
    const W = gr.w, H = gr.h, cx = gr.cx, b = def.building, rnd = gr.rand;
    gr.ground.fill(G.woodwall); gr.solid.fill(1);
    gr.rect(1, 2, W - 2, H - 2, (x, y) => { gr.set(x, y, G.wood); gr.block(x, y, 0); });
    gr.set(cx, H - 1, G.wood); gr.block(cx, H - 1, 0); gr.keep(cx, H - 1); gr.keep(cx, H - 2); gr.keep(cx, H - 3);
    gr.proc('doormat', cx, H - 2, 16, 16);
    gr.proc('rug', cx - 2, H - 4, 80, 32);
    const NPC_C = { shop: 22, inn: 19, talk: 25 };
    const npc = (x, y, extra) => { gr.npcs.push({ id: 'keeper', sprite: 'npc:' + (b.c || NPC_C[def.role]), x, y, dir: 'down', data: Object.assign({ building: b }, extra) }); gr.block(x, y, 0); gr.keep(x, y); };
    // 벽 장식: 선반 · 창문
    for (let x = 2; x < W - 2; x += 3) { if (rnd() < 0.5) { gr.proc('shelf', x, 2, 16, 26); gr.block(x, 2); } else gr.proc('window', x, 1, 16, 16); gr.keep(x, 2); }
    if (def.role === 'shop') {
      // 계산대 너머의 주인 — 계산대를 조사하면 주인과 이야기한다
      const y = 5;
      for (let x = cx - 3; x <= cx + 3; x++) { gr.block(x, y); gr.keep(x, y); }
      gr.proc('counter', cx - 3, y, 7 * 16, 22);
      gr.objects.push({ id: 'counter', name: b.label, tiles: [[cx - 1, y], [cx, y], [cx + 1, y]], interact: 'keeper', from: ['up'], markerDy: -26 });
      npc(cx, 3, {});
      for (const [x, yy] of [[2, H - 3], [W - 3, H - 3], [2, 6], [W - 3, 6]]) gr.prop(rnd.pick(['Crate_Large_Empty', 'Barrel_Small_Empty', 'Crate_Medium_Closed', 'Sack_3', 'Basket_Empty']), x, yy, { findFree: false });
    } else if (def.role === 'inn') {
      const y = 5;
      for (let x = 2; x <= 6; x++) { gr.block(x, y); gr.keep(x, y); }
      gr.proc('counter', 2, y, 5 * 16, 22);
      gr.objects.push({ id: 'counter', name: b.label, tiles: [[3, y], [4, y], [5, y]], interact: 'keeper', from: ['up'], markerDy: -26 });
      npc(4, 3, {});
      for (const x of [W - 9, W - 6, W - 3]) { gr.proc('bed', x, 4, 16, 34); gr.block(x, 3); gr.block(x, 4); gr.keep(x, 3); gr.keep(x, 4); }
      for (const [x, yy] of [[W - 7, H - 4], [6, H - 4]]) gr.prop('Table_Medium_1', x, yy, { findFree: false });
      gr.prop('Crate_Large_Empty', W - 3, 8, { findFree: false }); gr.prop('Barrel_Small_Empty', W - 4, 8, { findFree: false });
    } else {
      npc(cx, 5, {});
      gr.prop('Table_Medium_1', cx - 4, 7, { findFree: false });
      gr.prop('Plant_2', 2, H - 3, { findFree: false });
      gr.prop('Basket_Empty', W - 3, 4, { findFree: false });
    }
  }

  // ----- 끝없는 탑 층 -----
  function genTowerFloor(gr, floor) {
    const W = gr.w, H = gr.h;
    gr.ground.fill(G.towerwall); gr.solid.fill(1);
    const rnd = gr.rand;
    const rooms = [];
    const boss = floor % 5 === 0;
    const n = boss ? 3 : rnd.int(5, 7);
    for (let k = 0, guard = 0; k < n && guard < 200; guard++) {
      const w = boss && k === n - 1 ? 14 : rnd.int(5, 9), h = boss && k === n - 1 ? 8 : rnd.int(4, 7);
      const x = rnd.int(2, W - w - 3), y = rnd.int(2, H - h - 3);
      if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) }); k++;
    }
    rooms.sort((a, b) => a.cx - b.cx);
    for (const r of rooms) gr.rect(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, (x, y) => { gr.set(x, y, G.tower); gr.block(x, y, 0); });
    for (let k = 1; k < rooms.length; k++) {
      const a = rooms[k - 1], b = rooms[k];
      gr.rect(Math.min(a.cx, b.cx), a.cy, Math.max(a.cx, b.cx), a.cy + 1, (x, y) => { gr.set(x, y, G.tower); gr.block(x, y, 0); });
      gr.rect(b.cx, Math.min(a.cy, b.cy), b.cx + 1, Math.max(a.cy, b.cy) + 1, (x, y) => { gr.set(x, y, G.tower); gr.block(x, y, 0); });
    }
    const first = rooms[0], last = rooms[rooms.length - 1];
    gr.start = [first.cx, first.cy + 1];
    const down = [first.cx, first.cy - 1], up = [last.cx, last.y + 1];
    gr.objects.push({ id: 'stairsDown', name: '아래층 계단', tiles: [down], interact: 'stairsDown', markerDy: -6 });
    gr.objects.push({ id: 'stairsUp', name: '위층 계단', tiles: [up], interact: 'stairsUp', markerDy: -6 });
    gr.block(down[0], down[1]); gr.block(up[0], up[1]);
    gr.stairs = [[down[0], down[1], 'stairsDown'], [up[0], up[1], 'stairsUp']];
    gr.keep(...gr.start); gr.keep(down[0], down[1] + 1); gr.keep(up[0], up[1] + 1);
    gr.rooms = rooms;
    gr.bossAt = boss ? [up[0], up[1] + 2] : null;
    for (const r of rooms) if (rnd() < 0.35) { const x = r.x + 1, y = r.y; gr.decos.push({ fn: 'fire', x: x * TS - 8, y: y * TS - 8, w: 32, h: 32, sortY: y }); gr.block(x, y); }
    if (rnd() < 0.5 && !boss) { const r = rooms[rnd.int(1, rooms.length - 1)]; const x = r.x + r.w - 2, y = r.y + 1; if (!gr.isSolid(x, y)) gr.chest(x, y, rnd.pick(['potion_m', 'ether', 'potion_l', 'moon']), 1, 'tower' + floor); }
    gr.open = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) gr.open[i] = gr.solid[i] ? 0 : 1;
  }

  /**
   * 숨겨진 아이템 놓기. 위치는 지역마다 고정 시드라 매번 같은 자리다.
   * 길을 막지 않도록 주변 8칸이 모두 비어 있는 빈터에만 둔다.
   */
  function placeHidden(gr, def) {
    if (!def.id || def.type === 'interior' || def.type === 'towerfloor') return;
    const list = R.HIDDEN[def.id] || [];
    const kinds = R.HIDDEN_KINDS[def.type] || ['bag'];
    const rnd = R.rng('hidden:' + def.id);
    const put = (x, y, kind, item, n, key) => {
      gr.block(x, y); gr.keep(x, y);
      const IMG = { bush: 'Bush_Emerald_3', stump: 'Chopped_Tree_1', crate: 'Crate_Medium_Closed', barrel: 'Barrel_Small_Empty' };
      if (IMG[kind]) gr.addImage(IMG[kind], x, y);
      else gr.proc(kind, x, y, kind === 'cart' ? 32 : 20, kind === 'cart' ? 22 : 18);
      gr.objects.push({ id: 'cache:' + key, name: R.HIDDEN_LABEL[kind] || '', tiles: [[x, y]], interact: 'cache', data: { kind, item, n, key }, markerDy: -6 });
    };
    (def.hidden || []).forEach(([x, y, kind, item, n], i) => put(x, y, kind, item, n, def.id + ':h' + i));
    const ok = (x, y, loose) => {
      if (x < 3 || y < 3 || x > gr.w - 4 || y > gr.h - 4) return false;
      if (gr.solid[gr.i(x, y)] || gr.reserved[gr.i(x, y)]) return false;
      const g = gr.get(x, y);
      if (g === G.water || WALLS.has(g)) return false;
      // 기본: 주변 8칸이 모두 빈칸. 좁은 지역에서는 상하좌우 4칸이 비고 대각선 막힘이 1칸 이하면 허용
      let diag = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (gr.solid[gr.i(x + dx, y + dy)]) { if (dx && dy) diag++; else return false; }
      if (diag > (loose ? 1 : 0)) return false;
      return !(def.npcs || []).some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 3);
    };
    const placed = [];
    list.forEach(([item, n], i) => {
      for (let tries = 0; tries < 900; tries++) {
        const x = rnd.int(3, gr.w - 4), y = rnd.int(3, gr.h - 4);
        const gap = tries < 400 ? 8 : 4;   // 자리가 모자라면 간격을 줄여 다시 찾는다
        if (!ok(x, y, tries >= 700) || placed.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < gap)) continue;
        placed.push([x, y]);
        put(x, y, kinds[i % kinds.length], item, n, def.id + ':c' + i);   // 보물상자 키(지역:번호)와 겹치지 않게
        return;
      }
    });
    gr.hiddenCount = placed.length + (def.hidden || []).length;
  }

  // ---------------- 이야기 인물 · 의뢰 물건 · 시각 소품 (Phase 4) ----------------
  // 길을 막지 않게: 놓으려는 칸(들)을 막아도, 원래 걸어서 갈 수 있던 칸이 모두 그대로 이어져 있어야 한다.
  function reachable(gr, extra) {
    const seen = new Uint8Array(gr.w * gr.h), q = [];
    const open = (x, y) => gr.in(x, y) && !gr.solid[gr.i(x, y)] && !(extra && extra.has(gr.i(x, y)));
    for (const sd in gr.exits) for (const [x, y] of gr.exits[sd].cells) if (open(x, y) && !seen[gr.i(x, y)]) { seen[gr.i(x, y)] = 1; q.push([x, y]); }
    if (!q.length) { const [x, y] = gr.near(gr.cx, gr.cy, open, 20); seen[gr.i(x, y)] = 1; q.push([x, y]); }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (open(nx, ny) && !seen[gr.i(nx, ny)]) { seen[gr.i(nx, ny)] = 1; q.push([nx, ny]); }
      }
    }
    return seen;
  }
  function staysConnected(gr, cells) {
    const before = gr._reach || (gr._reach = reachable(gr));
    const extra = new Set(cells.map(([x, y]) => gr.i(x, y)));
    const after = reachable(gr, extra);
    for (let i = 0; i < before.length; i++) if (before[i] && !extra.has(i) && !after[i]) return false;
    return true;
  }
  function takenCells(gr) {
    const t = new Set();
    for (const o of gr.objects) for (const [x, y] of o.tiles) t.add(gr.i(x, y));
    for (const n of gr.npcs) t.add(gr.i(n.x, n.y));
    for (const sd in gr.exits) for (const [x, y] of gr.exits[sd].cells) t.add(gr.i(x, y));
    for (const bb of [gr.def.boss, gr.def.boss2]) if (bb) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t.add(gr.i(bb.at[0] + dx, bb.at[1] + dy));
    return t;
  }
  /** 앞(아래쪽)에 있는 나무 · 덤불 그림이 이 칸을 덮는지 (인물이 나무 뒤에 숨지 않게) */
  function covered(gr, x, y) {
    const x0 = x * TS, x1 = (x + 1) * TS, y0 = (y + 1) * TS - 24, y1 = (y + 1) * TS;
    return gr.decos.some(d => d.img && d.sortY > y && d.x < x1 - 2 && d.x + d.w > x0 + 2 && d.y < y1 && d.y + d.h > y0);
  }
  /** cells 를 모두 막아도 되는 자리인지 (빈칸 · 다른 것과 겹치지 않음 · 가려지지 않음 · 길이 끊기지 않음) */
  function canOccupy(gr, cells) {
    const taken = takenCells(gr);
    for (const [x, y] of cells) if (!gr.in(x, y) || gr.solid[gr.i(x, y)] || taken.has(gr.i(x, y)) || covered(gr, x, y)) return false;
    return staysConnected(gr, cells);
  }
  function occupy(gr, cells) { for (const [x, y] of cells) { gr.block(x, y); gr.keep(x, y); } gr._reach = null; }

  /** 우주적 존재 · 지역 키 NPC: 곁의 소품과 함께, 길을 막지 않는 자리에 */
  function placeStoryNpc(gr, n, k) {
    const props = n.props || [];
    const cellsAt = (x, y) => [[x, y], ...props.filter(p => p[3] && p[3].block).flatMap(p => {
      const w = Math.max(1, Math.round(((p[3] && p[3].w) || 16) / TS));
      return Array.from({ length: w }, (_, i) => [x + p[1] + i, y + p[2]]);
    })];
    // 길 위(reserved)가 아니라 길가를 먼저 찾고, 없으면 길 위라도
    const offPath = cells => cells.every(([cx, cy]) => gr.in(cx, cy) && !gr.reserved[gr.i(cx, cy)]);
    let [x, y] = gr.near(n.x, n.y, (xx, yy) => offPath(cellsAt(xx, yy)) && canOccupy(gr, cellsAt(xx, yy)), 10);
    if (!canOccupy(gr, cellsAt(x, y))) [x, y] = gr.near(n.x, n.y, (xx, yy) => canOccupy(gr, cellsAt(xx, yy)), 10);
    if (!canOccupy(gr, cellsAt(x, y))) {
      // 소품까지 놓을 자리가 없으면 인물만
      console.warn('[map] 소품을 놓을 자리가 없어 인물만 둡니다:', gr.id, n.being || n.key);
      [x, y] = gr.near(n.x, n.y, (xx, yy) => canOccupy(gr, [[xx, yy]]), 10);
      occupy(gr, [[x, y]]);
    } else {
      occupy(gr, cellsAt(x, y));
      for (const [fn, dx, dy, o = {}] of props) gr.proc(fn, x + dx, y + dy, o.w || 16, o.h || 22, { v: o.v });
    }
    gr.npcs.push({ id: n.being || (n.key ? 'key_' + n.key : 'npc' + k), sprite: 'npc:' + n.c, x, y, dir: n.dir || 'down', data: n });
  }

  /** 시각 소품(marks)과 의뢰 물건(quests) */
  function placeStory(gr, def) {
    for (const m of def.marks || []) {
      const cells = (m.block || []).map(([dx, dy]) => [m.x + dx, m.y + dy]);
      if (cells.length && canOccupy(gr, cells)) occupy(gr, cells);
      else if (cells.length) console.warn('[map] 소품이 길을 막아 지나갈 수 있게 둡니다:', gr.id, m.fn);
      gr.proc(m.fn, m.x, m.y, m.w, m.h);
    }
    for (const q of def.quests || []) {
      let [x, y] = gr.near(q.x, q.y, (xx, yy) => !gr.reserved[gr.i(xx, yy)] && canOccupy(gr, [[xx, yy]]), 12);
      if (!canOccupy(gr, [[x, y]])) [x, y] = gr.near(q.x, q.y, (xx, yy) => canOccupy(gr, [[xx, yy]]), 12);
      occupy(gr, [[x, y]]);
      gr.proc(q.fn, x, y, 16, 18);
      gr.objects.push({ id: 'quest:' + q.id, name: q.label, tiles: [[x, y]], interact: 'quest', data: q, markerDy: -6 });
    }
  }

  /** 지역 지도 만들기 (그림을 불러온 뒤에 호출) */
  R.buildMap = function (id, opts = {}) {
    const def = R.mapDef(id, opts);
    if (!def) throw new Error('없는 지역: ' + id);
    const [w, h] = def.size || R.SIZE_BY_TYPE[def.type] || [40, 30];
    const gr = new Grid(id === 'tower_f' ? 'tower_f' + opts.floor : id, def, w, h);
    if (def.type === 'towerfloor') genTowerFloor(gr, opts.floor);
    else if (def.type === 'interior') genInterior(gr, def);
    else if (['town', 'city', 'beachtown'].includes(def.type)) genTown(gr, def);
    else if (['mine', 'cave', 'fortress'].includes(def.type)) genCave(gr, def);
    else if (def.type === 'sea') genSea(gr, def);
    else if (['castle', 'towerlobby'].includes(def.type)) genHall(gr, def);
    else genWild(gr, def);
    placeHidden(gr, def);
    placeStory(gr, def);
    // NPC (막힌 칸에 걸리면 근처 빈칸으로)
    (def.npcs || []).forEach((n, k) => {
      if (n.being || n.key || n.props) return placeStoryNpc(gr, n, k);
      const [x, y] = gr.near(n.x, n.y, (xx, yy) => gr.in(xx, yy) && !gr.solid[gr.i(xx, yy)]);
      gr.npcs.push({ id: 'npc' + k, sprite: 'npc:' + n.c, x, y, dir: 'down', data: n });
      gr.keep(x, y);
    });
    gr.layout = [];
    for (let y = 0; y < h; y++) { let row = ''; for (let x = 0; x < w; x++) row += gr.solid[gr.i(x, y)] ? '#' : '.'; gr.layout.push(row); }
    gr.base = renderBase(gr);
    return gr;
  };

  // ---------------- 바닥 그리기 (16px 원본 크기, 물 애니메이션 4장) ----------------
  function renderBase(gr) {
    const frames = [];
    const ground = R.img.ground, road = R.img.road, water = R.img.water;
    const sameAs = g => (x, y) => { const v = gr.get(x, y); return v === -1 ? true : g.includes(v); };
    const isRoad = sameAs([G.road]), isWater = sameAs([G.water]);
    const rnd = R.rng('base:' + gr.id);
    const W = gr.w, H = gr.h;
    const grassVar = Array.from({ length: W * H }, () => [rnd.int(0, 5), rnd.int(8, 9), rnd()]);
    for (let f = 0; f < 4; f++) {
      const c = document.createElement('canvas'); c.width = W * TS; c.height = H * TS;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = gr.get(x, y), px = x * TS, py = y * TS, gv = grassVar[gr.i(x, y)];
        const outdoorish = ![G.floor, G.wall, G.cave, G.cavewall, G.tower, G.towerwall, G.carpet, G.wood, G.woodwall, G.redsand, G.redrock].includes(v);
        if (outdoorish) {
          if (gr.def.type === 'sea' || gr.def.type === 'cave') g.drawImage(procTile(gr.def.type === 'cave' ? 'cave' : 'plank'), px, py), (gr.def.type === 'sea' && g.drawImage(ground, gv[0] * TS, gv[1] * TS, TS, TS, px, py, TS, TS));
          else g.drawImage(ground, gv[0] * TS, gv[1] * TS, TS, TS, px, py, TS, TS);
        }
        if (v === G.road) {
          const idx = blobIndex(isRoad, x, y);
          if (idx === 8) g.drawImage(road, (gv[2] < 0.5 ? 0 : 1 + Math.floor(gv[2] * 2) % 2) * TS, (gv[2] < 0.7 ? 8 : 9) * TS, TS, TS, px, py, TS, TS);
          else g.drawImage(road, (idx % 6) * TS, Math.floor(idx / 6) * TS, TS, TS, px, py, TS, TS);
        } else if (v === G.water) {
          const idx = blobIndex(isWater, x, y);
          const ox = f * 96;
          if (idx === 8) g.drawImage(water, ox + Math.floor(gv[2] * 3) * TS, 8 * TS, TS, TS, px, py, TS, TS);
          else g.drawImage(water, ox + (idx % 6) * TS, Math.floor(idx / 6) * TS, TS, TS, px, py, TS, TS);
        } else if (WALLS.has(v)) {
          const below = gr.get(x, y + 1);
          const front = below !== -1 && !WALLS.has(below);
          const name = { [G.wall]: 'wall', [G.cavewall]: 'cavewall', [G.towerwall]: 'towerwall', [G.cliff]: 'cliff', [G.redrock]: 'redrock', [G.woodwall]: 'woodwall', [G.sandrock]: 'sandrock' }[v];
          if (front) g.drawImage(procTile(name), px, py);
          else g.drawImage(procTile(name + 'top'), px, py);
        } else if (v === G.floor) g.drawImage(procTile('floor'), px, py);
        else if (v === G.tower) g.drawImage(procTile('tower'), px, py);
        else if (v === G.ruin) g.drawImage(procTile('ruin'), px, py);
        else if (v === G.cave) g.drawImage(procTile('cave'), px, py);
        else if (v === G.plank) {
          if (['sea', 'beachtown', 'river', 'lake', 'coast'].includes(gr.def.type)) {
            // 물 위의 잔교: 아래에 물을 깔고 나무판
            g.drawImage(water, f * 96 + Math.floor(gv[2] * 3) * TS, 8 * TS, TS, TS, px, py, TS, TS);
          }
          g.drawImage(procTile('plank'), px, py);
        }
        else if (v === G.cobble) g.drawImage(procTile('cobble'), px, py);
        else if (v === G.carpet) g.drawImage(procTile('carpet'), px, py);
        else if (v === G.redsand) g.drawImage(procTile('redsand'), px, py);
        else if (v === G.wood) g.drawImage(procTile('wood'), px, py);
      }
      for (const [sx, sy, kind] of gr.stairs || []) g.drawImage(procTile(kind), sx * TS, sy * TS);
      frames.push(c);
    }
    return frames;
  }

  // ---------------- 그리기 도우미 ----------------
  const tintCache = new Map();
  function tinted(name, tint) {
    const key = name + '|' + tint;
    if (tintCache.has(key)) return tintCache.get(key);
    const im = R.img[name];
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = { mush: 'rgba(150,60,190,0.35)', dead: 'rgba(90,80,70,0.55)', gray: 'rgba(120,115,110,0.5)', grave: 'rgba(70,80,110,0.35)', sand: 'rgba(220,180,110,0.35)' }[tint] || 'rgba(120,90,140,0.3)';
    g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
    return c;
  }

  /** 마물 시트의 한 행에서 실제 그림이 있는 범위 (프레임 1 기준) */
  const boxCache = new Map();
  R.monFrame = function (monId, frame) {
    const m = R.MON[monId], im = R.img['mon:' + m.s[0]];
    if (!im) return null;
    const fw = im.width / 3, fh = im.height / 4, row = m.s[1];
    const key = m.s.join(':');
    if (!boxCache.has(key)) {
      const c = document.createElement('canvas'); c.width = fw; c.height = fh;
      const g = c.getContext('2d'); g.drawImage(im, fw, row * fh, fw, fh, 0, 0, fw, fh);
      const d = g.getImageData(0, 0, fw, fh).data;
      let x0 = fw, y0 = fh, x1 = 0, y1 = 0;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (d[(y * fw + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 < x0) { x0 = 0; y0 = 0; x1 = fw - 1; y1 = fh - 1; }
      boxCache.set(key, { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    return { im, sx: (frame % 3) * fw, sy: row * fh, fw, fh, box: boxCache.get(key) };
  };

  /** 마물 그리기: 바닥 중심 (cx, by), 그림 높이 targetH */
  R.drawMon = function (ctx, monId, cx, by, targetH, t, opts = {}) {
    const seq = [0, 1, 2, 1];
    const fr = R.monFrame(monId, seq[Math.floor(t * 5) % 4]);
    if (!fr) return;
    const s = Math.min(opts.maxScale || 3, targetH / fr.box.h, opts.maxW ? opts.maxW / fr.box.w : 99);
    const dw = fr.fw * s, dh = fr.fh * s;
    const dx = cx - (fr.box.x0 + fr.box.w / 2) * s, dy = by - (fr.box.y1 + 1) * s;
    ctx.drawImage(fr.im, fr.sx, fr.sy, fr.fw, fr.fh, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    return { x: cx - fr.box.w * s / 2, y: by - fr.box.h * s, w: fr.box.w * s, h: fr.box.h * s };
  };

  function drawNpc(ctx, a, t) {
    const n = +a.sprite.slice(4), info = R.npcSheet(n), im = R.img[info.sheet];
    if (!im) return;
    const dirRow = { down: 0, left: 1, right: 2, up: 3 }[a.dir] || 0;
    let f = 1;
    if (a.move || a.walk > 0) f = [0, 1, 2, 1][Math.floor(a.walk / 0.14) % 4];
    const sx = info.col * 48 + f * 16, sy = info.row * 80 + dirRow * 20;
    const s = 2.5, w = 16 * s, h = 20 * s;
    const x = Math.round(a.px + T / 2 - w / 2), y = Math.round(a.py + T - h + 2);
    if (!(a.data && a.data.noShadow)) {          // 우주적 존재 3명은 그림자를 그리지 않는다 (단서 연출)
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#2a1420';
      ctx.fillRect(x + 10, y + h - 4, w - 20, 3);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(im, sx, sy, 16, 20, x, y, w, h);
  }

  function drawProcDeco(ctx, d, t) {
    const X = v => Math.round(d.x * K + v * K), Y = v => Math.round(d.y * K + v * K);
    const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w * K, h * K); };
    if (d.fn === 'pillar') {
      const c = d.dark ? ['#4a3c5a', '#3a2e48', '#5e4e70'] : d.stone ? ['#c8c2d2', '#a29cae', '#e2dcea'] : ['#b0ac96', '#8e8a76', '#cac6ae'];
      const top = d.broken ? 16 : 4;
      P(2, top, 12, 36 - top, c[0]); P(2, top, 3, 36 - top, c[2]); P(11, top, 3, 36 - top, c[1]); P(0, d.broken ? 14 : 0, 16, 5, c[2]); P(0, 34, 16, 4, c[1]);
      if (d.broken) { P(3, 12, 4, 3, c[2]); P(9, 13, 3, 2, c[1]); }
      if (!d.stone && !d.dark) { P(4, 22, 3, 2, '#6f8f4a'); P(9, 28, 4, 2, '#6f8f4a'); }
    } else if (d.fn === 'mushroom') {
      const cols = [['#d0405a', '#f6d8de'], ['#8a5ad8', '#e4d6ff'], ['#e08a2a', '#fff0c8'], ['#4a9ad0', '#d8f0ff']][d.v];
      P(6, 9, 4, 7, '#f0e6d8'); P(6, 9, 1, 7, '#c8baa8');
      P(2, 4, 12, 6, cols[0]); P(4, 2, 8, 2, cols[0]); P(4, 5, 2, 2, cols[1]); P(10, 4, 2, 2, cols[1]); P(7, 3, 1, 1, cols[1]);
    } else if (d.fn === 'throne') {
      P(0, 0, 24, 30, '#7a1a2a'); P(2, 2, 20, 18, '#b8283c'); P(0, 0, 24, 2, '#d6b25e'); P(0, 20, 24, 3, '#d6b25e'); P(2, 23, 20, 7, '#8a6a2a'); P(10, -4, 4, 4, '#d6b25e');
    } else if (d.fn === 'pot') {
      P(5, 4, 10, 12, '#a8643c'); P(4, 7, 12, 7, '#b8744a'); P(6, 2, 8, 3, '#8a4e2c'); P(7, 1, 6, 2, '#6e3e22'); P(6, 7, 2, 5, '#d09060'); P(4, 16, 12, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'rope') {
      // 광산 입구의 출입 통제 밧줄 (발레리 곁)
      P(2, 4, 3, 18, '#6e4628'); P(27, 4, 3, 18, '#6e4628'); P(2, 4, 1, 18, '#8a5a34'); P(27, 4, 1, 18, '#8a5a34');
      P(5, 7, 6, 2, '#c8a870'); P(11, 9, 10, 2, '#c8a870'); P(21, 7, 6, 2, '#c8a870'); P(14, 11, 4, 3, '#e8d8a8');
      P(1, 21, 30, 1, 'rgba(0,0,0,0.25)');
    } else if (d.fn === 'weakceil') {
      // 금이 간 갱목 (지름길 끝 — 천장이 약한 곳). 먼지가 조금씩 떨어진다. 시각 효과만.
      P(2, 4, 4, 36, '#6e4628'); P(42, 4, 4, 36, '#6e4628'); P(2, 4, 1, 36, '#8a5a34'); P(42, 4, 1, 36, '#8a5a34');
      P(0, 0, 48, 6, '#7a4e2c'); P(0, 0, 48, 2, '#9a6a40');
      P(14, 1, 2, 2, '#2a1a10'); P(16, 3, 2, 2, '#2a1a10'); P(18, 4, 3, 2, '#2a1a10'); P(26, 2, 2, 3, '#2a1a10'); P(28, 4, 3, 2, '#2a1a10');
      P(21, 6, 4, 3, '#5a4a3a'); P(30, 6, 3, 2, '#5a4a3a');
      for (let k = 0; k < 3; k++) { const ph = (t * 0.7 + k * 0.37) % 1; ctx.globalAlpha = 0.7 * (1 - ph); P(19 + k * 5, 8 + Math.floor(ph * 28), 1, 2, '#c8b89a'); }
      ctx.globalAlpha = 1;
      P(12, 37, 4, 3, '#6a5a4a'); P(17, 38, 3, 2, '#7a6a5a'); P(30, 37, 5, 3, '#6a5a4a'); P(36, 38, 2, 2, '#7a6a5a');
    } else if (d.fn === 'elevator') {
      // 낡은 승강기 (우회로 중간). 한 번 끊어졌던 줄이 매듭으로 이어져 있다. 시각 효과만.
      P(1, 0, 3, 44, '#5a3a20'); P(28, 0, 3, 44, '#5a3a20'); P(1, 0, 1, 44, '#7a4e2c');
      P(0, 0, 32, 4, '#7a4e2c'); P(0, 0, 32, 1, '#9a6a40');
      P(12, 4, 8, 7, '#8a8a96'); P(14, 6, 4, 3, '#5a5a66');
      P(15, 11, 2, 7, '#c8a870'); P(14, 18, 4, 3, '#a8884a'); P(15, 21, 2, 7, '#c8a870');
      P(4, 28, 24, 2, '#6e4628'); P(4, 28, 2, 14, '#6e4628'); P(26, 28, 2, 14, '#6e4628');
      for (let x = 9; x < 26; x += 5) P(x, 30, 1, 12, '#4a2e18');
      P(3, 41, 26, 3, '#4a2e18'); P(3, 41, 26, 1, '#6e4628');
    } else if (d.fn === 'spore') {
      // 빛나는 포자 (견습 마법사의 의뢰 물건)
      P(3, 10, 4, 6, '#f0e6d8'); P(1, 7, 8, 4, '#4a9ad0'); P(10, 12, 3, 4, '#f0e6d8'); P(8, 10, 7, 3, '#4a9ad0');
      for (let k = 0; k < 4; k++) { const ph = (t * 0.5 + k * 0.25) % 1; ctx.globalAlpha = 0.9 * (1 - ph); P(2 + k * 4, 6 - Math.floor(ph * 6), 1, 1, '#d8f0ff'); }
      ctx.globalAlpha = 1; P(0, 16, 16, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'quiver') {
      // 떨어진 화살통 (숲 사냥꾼의 의뢰 물건)
      P(2, 10, 12, 5, '#7a4e2c'); P(2, 10, 12, 1, '#9a6a40'); P(13, 9, 2, 7, '#5a3a20');
      P(0, 9, 3, 2, '#e8e0d0'); P(0, 12, 3, 2, '#c8483a'); P(1, 16, 14, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'supply') {
      // 기사단 보급품 상자 (하급 기사의 의뢰 물건)
      P(1, 5, 14, 11, '#8a5a34'); P(1, 5, 14, 2, '#a8744a'); P(1, 10, 14, 1, '#6e4628'); P(6, 7, 4, 5, '#3a4a8a'); P(7, 8, 2, 3, '#c8ccd8'); P(1, 16, 14, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'parcel') {
      // 흩어진 짐 꾸러미 (부두 선원의 의뢰 물건)
      P(2, 7, 9, 8, '#b8a070'); P(2, 7, 9, 1, '#d0b888'); P(6, 7, 1, 8, '#6e5034'); P(2, 11, 9, 1, '#6e5034');
      P(11, 11, 4, 4, '#8a6a46'); P(0, 13, 2, 2, '#8a6a46'); P(0, 15, 16, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'bag') {
      P(4, 6, 12, 10, '#8a6a46'); P(5, 5, 10, 2, '#a8845a'); P(8, 3, 4, 3, '#6e5034'); P(5, 8, 3, 5, '#a8845a'); P(2, 10, 3, 2, '#6e5034'); P(3, 16, 14, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'grave') {
      const c = ['#9a9aa6', '#7a7a88', '#b8b8c4'];
      P(3, 4, 10, 16, c[0]); P(4, 2, 8, 2, c[0]); P(3, 4, 2, 16, c[2]); P(11, 4, 2, 16, c[1]); P(5, 8, 6, 1, c[1]); P(5, 11, 6, 1, c[1]); P(1, 20, 14, 2, '#5a5a4a');
      if (d.v === 1) { P(3, 15, 3, 2, '#6f8f4a'); }
    } else if (d.fn === 'cross') {
      P(7, 2, 3, 18, '#8a8a96'); P(3, 6, 11, 3, '#8a8a96'); P(7, 2, 1, 18, '#b8b8c4'); P(5, 20, 7, 2, '#5a5a4a');
    } else if (d.fn === 'lantern') {
      P(7, 6, 2, 24, '#3a3440'); P(4, 2, 8, 7, '#3a3440'); P(5, 3, 6, 5, '#ffd88a'); P(6, 4, 2, 2, '#fff4cc');
    } else if (d.fn === 'armor') {
      P(2, 8, 16, 7, '#8a8e9a'); P(4, 6, 6, 4, '#a8acb8'); P(12, 9, 6, 5, '#6e727e'); P(3, 9, 3, 1, '#c8ccd6'); P(0, 14, 20, 2, 'rgba(0,0,0,0.25)');
    } else if (d.fn === 'sword') {
      P(5, 0, 2, 16, '#c8ccd6'); P(5, 0, 1, 16, '#eef0f6'); P(2, 15, 8, 2, '#8a6a2a'); P(5, 17, 2, 3, '#5a3a20'); P(1, 20, 10, 2, '#6e5a40');
    } else if (d.fn === 'cart') {
      P(2, 6, 26, 9, '#8a5a34'); P(2, 6, 26, 2, '#a8744a'); P(6, 15, 7, 7, '#5a3a20'); P(8, 17, 3, 3, '#8a5a34'); P(20, 13, 8, 4, '#6e4628'); P(0, 9, 4, 2, '#6e4628'); P(14, 4, 9, 3, '#7a4e2c');
    } else if (d.fn === 'fence') {
      for (let x = 0; x < 32; x += 8) P(x + 1, 8, 3, 14, '#8a6a4a'); P(0, 11, 30, 2, '#a8845a'); P(0, 17, 22, 2, '#a8845a');
    } else if (d.fn === 'wreck') {
      P(0, 10, 40, 12, '#6e4628'); P(2, 8, 30, 3, '#8a5a34'); for (let x = 3; x < 38; x += 6) P(x, 10, 1, 12, '#4a2e18'); P(30, 0, 3, 12, '#5a3a20'); P(24, 2, 10, 2, '#5a3a20'); P(0, 20, 40, 2, 'rgba(0,0,0,0.2)');
    } else if (d.fn === 'telescope') {
      P(8, 30, 32, 26, '#8e8a9e'); P(8, 30, 32, 3, '#b8b4c6'); P(4, 52, 40, 4, '#6e6a7e');
      P(14, 12, 20, 20, '#5a6a9a'); P(14, 12, 20, 3, '#7a8aba'); P(22, 2, 6, 16, '#3a4060'); P(18, 0, 14, 4, '#4a5070'); P(23, 3, 2, 10, '#8a9aca');
    } else if (d.fn === 'rail') {
      P(0, 4, 16, 2, '#7a7a86'); P(0, 10, 16, 2, '#7a7a86'); for (let x = 1; x < 16; x += 5) P(x, 3, 3, 10, '#6e4628');
    } else if (d.fn === 'beam') {
      P(1, 0, 4, 32, '#7a4e2c'); P(11, 0, 4, 32, '#7a4e2c'); P(0, 0, 16, 5, '#8a5a34'); P(1, 0, 1, 32, '#9a6a40');
    } else if (d.fn === 'doormat') {
      P(2, 4, 12, 9, '#8a3a4a'); P(3, 5, 10, 7, '#a84a5a');
    } else if (d.fn === 'rug') {
      P(0, 4, 80, 26, '#9a5a6a'); P(3, 7, 74, 20, '#c98a96'); P(8, 12, 64, 10, '#d9a4ac');
    } else if (d.fn === 'shelf') {
      P(0, 0, 16, 26, '#6e4628'); P(1, 2, 14, 22, '#4a2e1c');
      const books = ['#b5455a', '#4a6a9a', '#d9b45a', '#6a8a5a', '#8a5aa0'];
      for (const yy of [3, 11, 19]) { for (let x = 2; x < 14; x += 3) P(x, yy, 2, 6, books[(x + yy) % 5]); P(1, yy + 6, 14, 1, '#8a5a34'); }
    } else if (d.fn === 'window') {
      P(1, 2, 14, 12, '#5a3a28'); P(3, 4, 10, 8, '#cfe6f4'); P(7, 4, 2, 8, '#5a3a28'); P(3, 7, 10, 1, '#5a3a28');
    } else if (d.fn === 'counter') {
      P(0, 0, d.w, 6, '#c99460'); P(0, 0, d.w, 2, '#e0b07a'); P(0, 6, d.w, 16, '#8a5a34'); for (let x = 6; x < d.w; x += 16) P(x, 8, 10, 12, '#7a4e2c');
    } else if (d.fn === 'bed') {
      P(0, 0, 16, 34, '#6e4630'); P(1, 2, 14, 8, '#fffaf4'); P(1, 10, 14, 22, '#e7a4b8'); P(1, 10, 14, 3, '#f6c6d4'); for (let y = 16; y < 30; y += 6) P(2, y, 12, 1, '#d48aa2');
    } else if (d.fn === 'fire') {
      const im = R.img.campfire; if (!im) return;
      const f = Math.floor(t * 10) % 8;
      ctx.drawImage(im, f * 32, 0, 32, 32, Math.round(d.x * K), Math.round(d.y * K), 32 * K, 32 * K);
    }
  }

  // ---------------- 월드 뷰 ----------------
  /**
   * WS.MapView 확장. 한 지역 = 한 뷰. 지역을 옮기면 새 뷰를 만든다.
   * scene: 이 뷰를 만든 world 장면 (지역 이동 · 전투 시작을 맡긴다)
   */
  R.WorldView = class extends WS.MapView {
    constructor(game, grid, scene, start) {
      const def = {
        tile: T, layout: grid.layout, start, playerSprite: R.fieldSprite(game.state),
        npcs: grid.npcs.map(n => ({ id: n.id, sprite: n.sprite, x: n.x, y: n.y, dir: n.dir })),
        objects: grid.objects,
      };
      super(game, def, {});
      this.grid = grid;
      this.scene = scene;
      this.symbols = [];
      this.stepCount = 0;
      this.flashT = 0;
      this.hooks = { interact: t => scene.interact(this, t), markerState: o => scene.markerState(this, o) };
      for (const n of grid.npcs) {
        const a = this.npcs[n.id];
        a.home = [n.x, n.y]; a.wander = !!n.data.wander; a.timer = 1 + Math.random() * 3; a.data = n.data;
      }
    }

    scaleFor(vw, vh) { return Math.max(1, Math.floor(vh / 440)); }

    /** 출구로 걸어 나가기 */
    tryStep(actor, dir) {
      if (actor === this.player && this.canControl) {
        const [dx, dy] = WS.DIRS[dir];
        const nx = actor.x + dx, ny = actor.y + dy;
        if (!this.inside(nx, ny)) {
          actor.dir = dir;
          const side = nx < 0 ? 'w' : nx >= this.cols ? 'e' : ny < 0 ? 'n' : 's';
          const exits = this.grid.def.exits || {};
          if (exits[side] && this.grid.exits[side] && this.grid.exits[side].cells.some(([x, y]) => x === actor.x && y === actor.y)) {
            this.scene.leave(this, side);
            return false;
          }
        }
      }
      return super.tryStep(actor, dir);
    }

    update(dt) {
      const p = this.player;
      super.update(dt);
      if (this.detached) return;
      if (this.lastTile === undefined) this.lastTile = p.x + ',' + p.y;
      if (p.x + ',' + p.y !== this.lastTile) { this.lastTile = p.x + ',' + p.y; this.scene.onStep(this); }
      // 주민 산책
      for (const id in this.npcs) {
        const a = this.npcs[id];
        if (!a.wander || a.move || this.mode !== 'explore') continue;
        if ((a.timer -= dt) > 0) continue;
        a.timer = 1.6 + Math.random() * 3;
        const dirs = ['up', 'down', 'left', 'right'].filter(d => {
          const [dx, dy] = WS.DIRS[d];
          return Math.abs(a.x + dx - a.home[0]) <= 3 && Math.abs(a.y + dy - a.home[1]) <= 3;
        });
        if (dirs.length) super.tryStep(a, dirs[Math.floor(Math.random() * dirs.length)]);
      }
      // 마물
      this.updateSymbols(dt);
      this.flashT = Math.max(0, this.flashT - dt);
    }

    symbolPassable(x, y, self) {
      if (!this.passable(x, y, true)) return false;
      if (this.npcAt(x, y)) return false;
      return !this.symbols.some(s => s !== self && !s.dead && s.x === x && s.y === y);
    }

    updateSymbols(dt) {
      const p = this.player, STEP = 0.34;
      for (const s of this.symbols) {
        if (s.dead) continue;
        s.t += dt;
        if (s.move) {
          s.move.t += dt / STEP;
          const k = Math.min(1, s.move.t);
          s.px = (s.move.fx + (s.move.tx - s.move.fx) * k) * T; s.py = (s.move.fy + (s.move.ty - s.move.fy) * k) * T;
          if (k >= 1) s.move = null;
        } else if (!s.boss && this.mode === 'explore' && !this.game.ui.modalOpen) {
          s.cool = Math.max(0, s.cool - dt);
          if ((s.timer -= dt) <= 0) {
            const dist = Math.abs(s.x - p.x) + Math.abs(s.y - p.y);
            const repel = (this.game.state.rpg || {}).repel > 0;      // 마물 쫓는 향
            const chase = dist <= 5 && s.cool <= 0 && !repel;
            s.timer = chase ? 0.05 + Math.random() * 0.25 : 0.8 + Math.random() * 1.6;
            let dir;
            if (chase && Math.random() < 0.8) {
              const dx = p.x - s.x, dy = p.y - s.y;
              dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
              if (!this.symbolPassable(s.x + WS.DIRS[dir][0], s.y + WS.DIRS[dir][1], s)) dir = dy !== 0 && Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
            } else if (Math.random() < 0.7) {
              dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
              if (Math.abs(s.x + WS.DIRS[dir][0] - s.home[0]) > 5 || Math.abs(s.y + WS.DIRS[dir][1] - s.home[1]) > 5) dir = null;
            }
            if (dir) {
              const [dx, dy] = WS.DIRS[dir];
              s.flip = dx > 0;
              if (this.symbolPassable(s.x + dx, s.y + dy, s)) {
                s.move = { fx: s.x, fy: s.y, tx: s.x + dx, ty: s.y + dy, t: 0 };
                s.x += dx; s.y += dy;
              }
            }
          }
        }
        // 닿으면 전투
        if (this.canControl && s.cool <= 0 && !(s.boss ? false : (this.game.state.rpg || {}).repel > 0) && Math.abs(s.px - p.px) < T * 0.75 && Math.abs(s.py - p.py) < T * 0.75) {
          this.scene.encounter(this, s);
          break;
        }
      }
    }

    /** 이 지역의 마물 배치 (지역에 들어올 때마다 새로) */
    spawnSymbols(list) {
      this.symbols = list.map(s => Object.assign({ px: s.x * T, py: s.y * T, t: Math.random() * 3, timer: Math.random() * 2, cool: 1.2, move: null, home: [s.x, s.y] }, s));
    }

    // ---------- 그리기 ----------
    draw(ctx, Wc, Hc) {
      const gr = this.grid, time = this.time;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = gr.def.type === 'sea' ? '#3c78b0' : '#140c12';
      ctx.fillRect(0, 0, Wc, Hc);
      const ox = -Math.round(this.cam.x), oy = -Math.round(this.cam.y);
      ctx.save();
      ctx.translate(ox, oy);
      const frame = gr.base[Math.floor(time * 3) % 4];
      ctx.drawImage(frame, 0, 0, gr.w * TS, gr.h * TS, 0, 0, gr.w * T, gr.h * T);

      // 꽃 (바닥 장식, 애니메이션)
      for (const fl of gr.flowers) {
        const im = R.img[fl.kind]; if (!im) continue;
        const f = (Math.floor(time * 6) + fl.ph) % 24;
        ctx.drawImage(im, f * 32, 0, 32, 32, fl.x * T - 8 * K, fl.y * T - 8 * K, 32 * K, 32 * K);
      }

      const items = [];
      const view = { x: this.cam.x - 300, y: this.cam.y - 400, x2: this.cam.x + Wc + 300, y2: this.cam.y + Hc + 300 };
      for (const d of gr.decos) {
        const x = d.x * K, y = d.y * K;
        if (x > view.x2 || y > view.y2 || x + d.w * K < view.x || y + d.h * K < view.y) continue;
        items.push({ y: d.sortY + 0.6, fn: () => {
          if (d.fn) return drawProcDeco(ctx, d, time);
          const im = d.tint ? tinted(d.img, d.tint) : R.img[d.img];
          if (im) ctx.drawImage(im, Math.round(x), Math.round(y), d.w * K, d.h * K);
        } });
      }
      for (const o of this.objects) if (o.interact === 'chest') items.push({ y: o.tiles[0][1] + 0.5, fn: () => this.drawChest(ctx, o) });
      for (const a of [this.player, ...Object.values(this.npcs)]) {
        items.push({ y: a.py / T + 0.7, fn: () => (a.sprite.startsWith('npc:') ? drawNpc(ctx, a, time) : this.drawActor(ctx, a)) });
      }
      for (const s of this.symbols) {
        if (s.dead) continue;
        items.push({ y: s.py / T + 0.7, fn: () => this.drawSymbol(ctx, s) });
      }
      items.sort((a, b) => a.y - b.y).forEach(it => it.fn());

      // 건물 이름표 (가까이 가면)
      ctx.font = '700 13px "Nanum Myeongjo", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const d of gr.decos) {
        if (!d.label) continue;
        const lx = d.labelX * K, ly = (d.y + d.h * 0.42) * K;
        const near = Math.abs(lx - (this.player.px + T / 2)) < T * 5 && Math.abs(ly - this.player.py) < T * 5;
        if (!near) continue;
        const tw = ctx.measureText(d.label).width + 18;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#3e2a3b'; ctx.fillRect(Math.round(lx - tw / 2) - 2, Math.round(ly - 13) - 2, Math.round(tw) + 4, 26 + 4);
        ctx.fillStyle = '#5c4357'; ctx.fillRect(Math.round(lx - tw / 2), Math.round(ly - 13), Math.round(tw), 26);
        ctx.fillStyle = '#fbe3f0'; ctx.fillText(d.label, Math.round(lx), Math.round(ly));
        ctx.globalAlpha = 1;
      }

      this.drawMarkers(ctx);
      this.drawEmotes(ctx);
      ctx.restore();
      this.drawSky(ctx, Wc, Hc);
    }

    drawChest(ctx, o) {
      const im = R.img.chests; if (!im) return;
      const open = this.scene.chestOpened(o);
      const [x, y] = o.tiles[0];
      const col = o.data.item === 'elixir' || o.data.item.startsWith('acc') || o.data.item === 'moon' ? 6 : 0;
      ctx.drawImage(im, col * 18, open ? 96 : 0, 18, 32, x * T + T / 2 - 27, y * T + T - 96 + 6, 54, 96);
    }

    drawSymbol(ctx, s) {
      const m = R.MON[s.mon];
      const bob = s.boss ? 0 : Math.round(Math.sin(s.t * 4) * 2);
      const cx = s.px + T / 2, by = s.py + T - 2;
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#1a0a14';
      ctx.beginPath(); ctx.ellipse(cx, by - 2, s.boss ? 40 : 20, s.boss ? 10 : 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      if (s.flip) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); }
      const h = s.boss ? 104 : m.rare ? 58 : 50;
      R.drawMon(ctx, s.mon, cx, by + bob, h, s.t, { maxScale: 2, maxW: s.boss ? 150 : 72 });
      ctx.restore();
      if (s.boss) {
        // 보스 표시
        const y = by - h - 20 + Math.round(Math.sin(s.t * 3) * 3);
        ctx.fillStyle = '#3e2a3b'; ctx.fillRect(cx - 9, y - 9, 18, 18);
        ctx.fillStyle = '#d6284c'; ctx.fillRect(cx - 7, y - 7, 14, 14);
        ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, y - 5, 2, 6); ctx.fillRect(cx - 1, y + 3, 2, 2);
      }
      if (s.cool > 0 && !s.boss) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, by - h - 8, 4, 4); ctx.globalAlpha = 1; }
    }

    /** 하늘색: 멸망이 다가올수록 붉어지는 하늘 */
    drawSky(ctx, Wc, Hc) {
      const rp = this.game.state.rpg, type = this.grid.def.type;
      const indoor = ['castle', 'towerlobby', 'towerfloor', 'mine', 'cave', 'interior', 'fortress'].includes(type);
      const layers = [];
      if (type === 'forest') layers.push('rgba(10,40,24,0.20)');
      if (type === 'mush') layers.push('rgba(70,20,100,0.18)');
      if (type === 'ruins') layers.push('rgba(60,30,80,0.14)');
      if (type === 'mine' || type === 'cave') layers.push('rgba(10,6,4,0.25)');
      if (type === 'towerfloor') layers.push('rgba(20,6,30,0.25)');
      if (type === 'graveyard') layers.push('rgba(30,30,60,0.28)');
      if (type === 'oldvillage') layers.push('rgba(80,80,80,0.22)');
      if (type === 'canyon') layers.push('rgba(120,40,10,0.10)');
      if (type === 'desert') layers.push('rgba(220,170,80,0.10)');
      if (type === 'fortress') layers.push('rgba(20,20,30,0.15)');
      if (type === 'observatory') layers.push('rgba(30,40,90,0.18)');
      if (!indoor) {
        const doom = (rp.day - 1) / (R.TIME.lastDay - 1);
        if (doom > 0) layers.push(`rgba(190,30,40,${(doom * 0.2).toFixed(3)})`);
      }
      for (const c of layers) { ctx.fillStyle = c; ctx.fillRect(0, 0, Wc, Hc); }
      // 어두운 곳 · 밤: 가장자리 어둠
      if (indoor && !['castle', 'towerlobby', 'interior'].includes(type)) {
        const g = ctx.createRadialGradient(Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.25, Wc / 2, Hc / 2, Math.max(Wc, Hc) * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,4,10,0.55)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, Wc, Hc);
      }
      if (this.flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flashT * 2})`; ctx.fillRect(0, 0, Wc, Hc); }
    }
  };

  /** 필드에서의 주인공 모습: 변신 게이지가 남아 있으면 직업 의상, 바닥나면 평상복 */
  R.fieldSprite = function (run) {
    const rp = run.rpg;
    if (rp && rp.gauge <= 0) return 'hero';
    return run.player.awakened && run.player.jobId ? run.player.jobId : 'hero';
  };
})();
