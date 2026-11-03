/*
 * 맵 시스템 (공통) — 쯔꾸르식 타일 이동 장면
 * ------------------------------------------------------------
 * 장면은 맵 데이터(WS.MAPS.<id>)와 상호작용 처리(hooks)만 넘기면 된다.
 *
 *  - 타일 단위 4방향 이동 (키보드 방향키/WASD, 화면 탭 → 길찾기 이동)
 *  - 충돌: 맵의 solid 격자 + 오브젝트 · NPC 가 차지한 칸
 *  - 조사: 바라보는 칸의 오브젝트/NPC (Space · Enter · Z, 또는 대상을 탭)
 *  - 조사 가능 표시: 반짝이는 표식 (가까이 가면 또렷해지고, 조사한 뒤에는 옅어짐)
 *  - 카메라: 주인공(또는 지정 대상)을 따라가며, 대화창이 열리면 그 위쪽에 맞춘다
 *  - 위치는 game.state.position 에 기록 (세이브 대상)
 *
 * 맵 데이터 형식은 js/scenes/heroRoom/map.js 참고.
 * hooks: { interact(target) → Promise, canInteract(obj) → bool }
 */
window.WS = window.WS || {};
WS.MAPS = WS.MAPS || {};

WS.DIRS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

WS.MapView = class {
  constructor(game, def, hooks) {
    this.game = game;
    this.def = def;
    this.hooks = hooks || {};
    this.T = def.tile || 48;
    this.cols = def.layout[0].length;
    this.rows = def.layout.length;
    this.mode = 'cutscene';          // cutscene | explore | busy
    this.time = 0;
    this.keys = [];
    this.path = [];
    this.pending = null;             // 길찾기 후 조사할 대상
    this.tapMark = null;
    this.emotes = [];
    this.camFocus = 'player';
    this.cam = { x: 0, y: 0, ready: false };
    this.detached = false;
    this.player = this.makeActor('player', def.playerSprite || 'hero', def.start || { x: 1, y: 1, dir: 'down' });
    this.npcs = {};
    for (const n of def.npcs || []) this.npcs[n.id] = this.makeActor(n.id, n.sprite, n);
    this.objects = (def.objects || []).map(o => Object.assign({}, o));
    this.base = null;                // 바닥 · 벽 캐시
    this._onKeyDown = e => this.onKeyDown(e);
    this._onKeyUp = e => this.onKeyUp(e);
    this._onTap = e => this.onTap(e);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    game.stage.canvas.addEventListener('click', this._onTap);
  }

  /** 장면 종료 시 반드시 호출 (입력 리스너 정리) */
  detach() {
    this.detached = true;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.game.stage.canvas.removeEventListener('click', this._onTap);
  }

  makeActor(id, sprite, at) {
    return {
      id, sprite, x: at.x, y: at.y, dir: at.dir || 'down',
      px: at.x * this.T, py: at.y * this.T,
      move: null, walk: 0, alpha: at.alpha ?? 1, visible: at.visible !== false,
      pose: at.pose || 'stand', solid: at.solid !== false,
    };
  }

  /** 화면 배율: 세로로 약 7칸이 보이도록 */
  scaleFor(vw, vh) { return Math.max(1, Math.round(vh / 330)); }

  // ---------------- 상태 ----------------
  explore() { if (!this.detached) { this.mode = 'explore'; this.camFocus = 'player'; } }
  cutscene() { this.mode = 'cutscene'; this.keys = []; this.path = []; this.pending = null; this.tapMark = null; }

  get canControl() {
    const ui = this.game.ui;
    return this.mode === 'explore' && !ui.modalOpen && ui.dialogue.mode === 'idle' && !this.game.scenes.busy;
  }

  savePosition() {
    const p = this.player;
    this.game.state.position = { sceneId: this.game.state.sceneId, x: p.x, y: p.y, dir: p.dir };
  }

  // ---------------- 충돌 ----------------
  inside(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }

  objectAt(x, y) {
    return this.objects.find(o => o.tiles.some(([tx, ty]) => tx === x && ty === y)) || null;
  }

  npcAt(x, y) {
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.visible && n.x === x && n.y === y) return n;
    }
    return null;
  }

  passable(x, y, ignoreNpc) {
    if (!this.inside(x, y)) return false;
    if (this.def.layout[y][x] !== '.') return false;
    const o = this.objectAt(x, y);
    if (o && o.solid !== false) return false;
    if (!ignoreNpc) { const n = this.npcAt(x, y); if (n && n.solid) return false; }
    return true;
  }

  // ---------------- 이동 ----------------
  tryStep(actor, dir) {
    actor.dir = dir;
    const [dx, dy] = WS.DIRS[dir];
    const nx = actor.x + dx, ny = actor.y + dy;
    if (actor === this.player ? !this.passable(nx, ny) : !this.passable(nx, ny) || (this.player.x === nx && this.player.y === ny)) return false;
    actor.move = { fx: actor.x, fy: actor.y, tx: nx, ty: ny, t: 0 };
    actor.x = nx; actor.y = ny;
    return true;
  }

  /** 스크립트용: n칸 걷기 (막히면 멈춤) */
  async walk(actor, dir, n = 1) {
    for (let i = 0; i < n; i++) {
      if (!this.tryStep(actor, dir)) break;
      while (actor.move && !this.detached) await WS.sleep(16);
    }
    if (actor === this.player) this.savePosition();
  }

  /** 길찾기 (BFS). goals: [[x,y],...] 중 가장 가까운 곳 */
  findPath(goals) {
    const key = (x, y) => x + ',' + y;
    const goalSet = new Set(goals.map(([x, y]) => key(x, y)));
    const start = [this.player.x, this.player.y];
    if (goalSet.has(key(...start))) return [];
    const prev = new Map([[key(...start), null]]);
    const q = [start];
    while (q.length) {
      const [x, y] = q.shift();
      for (const d of ['up', 'down', 'left', 'right']) {
        const [dx, dy] = WS.DIRS[d];
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || !this.passable(nx, ny)) continue;
        prev.set(k, [x, y, d]);
        if (goalSet.has(k)) {
          const dirs = [];
          let cur = k;
          while (prev.get(cur)) { const [px, py, pd] = prev.get(cur); dirs.unshift(pd); cur = key(px, py); }
          return dirs;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }

  // ---------------- 조사 ----------------
  /** 대상(오브젝트/NPC)을 조사할 수 있는 위치 목록: [x, y, 바라볼 방향] */
  interactSpots(target) {
    const tiles = target.tiles || [[target.x, target.y]];
    const spots = [];
    for (const [tx, ty] of tiles) {
      for (const d of ['up', 'down', 'left', 'right']) {
        const [dx, dy] = WS.DIRS[d];
        const sx = tx - dx, sy = ty - dy;   // 이 칸에서 d 방향을 보면 대상
        if (target.from && !target.from.includes(d)) continue;
        if ((sx === this.player.x && sy === this.player.y) || this.passable(sx, sy)) spots.push([sx, sy, d]);
      }
    }
    return spots;
  }

  facingTarget() {
    const p = this.player;
    const [dx, dy] = WS.DIRS[p.dir];
    const x = p.x + dx, y = p.y + dy;
    const npc = this.npcAt(x, y);
    if (npc && this.def.npcs.find(n => n.id === npc.id).interact !== false) return { kind: 'npc', id: npc.id, ref: npc };
    const o = this.objectAt(x, y);
    if (o && o.interact && (!o.from || o.from.includes(p.dir))) return { kind: 'object', id: o.id, ref: o };
    return null;
  }

  async interact(target) {
    if (!target || this.mode !== 'explore') return;
    this.mode = 'busy';
    this.keys = [];
    if (target.kind === 'npc') {
      // 말을 걸면 NPC 가 주인공 쪽을 본다
      const n = target.ref, p = this.player;
      n.dir = p.x < n.x ? 'left' : p.x > n.x ? 'right' : p.y < n.y ? 'up' : 'down';
    }
    try {
      await this.hooks.interact(target);
    } catch (e) {
      console.error('[map] 상호작용 오류', e);
    }
    if (!this.detached && this.mode === 'busy') this.mode = 'explore';
  }

  // ---------------- 입력 ----------------
  onKeyDown(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
    const dir = map[e.key];
    if (dir) {
      if (!this.keys.includes(dir)) this.keys.push(dir);
      if (this.canControl) { e.preventDefault(); this.path = []; this.pending = null; this.tapMark = null; }
    }
  }

  onKeyUp(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
    const dir = map[e.key];
    if (dir) this.keys = this.keys.filter(k => k !== dir);
  }

  /** 조사 키 (main.js 에서 대화 중이 아닐 때 호출) */
  onActionKey() {
    if (!this.canControl || this.player.move) return false;
    const t = this.facingTarget();
    if (t) { this.interact(t); return true; }
    return false;
  }

  screenToTile(e) {
    const st = this.game.stage;
    const r = st.canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left) / st.scale + this.cam.x;
    const wy = (e.clientY - r.top) / st.scale + this.cam.y;
    return [Math.floor(wx / this.T), Math.floor(wy / this.T), wx, wy];
  }

  onTap(e) {
    if (!this.canControl) return;
    let [tx, ty, wx, wy] = this.screenToTile(e);
    // 캐릭터는 머리가 위 칸까지 올라오므로, 위 칸을 눌러도 그 캐릭터로 인식
    let npc = this.npcAt(tx, ty) || this.npcAt(tx, ty + 1);
    let obj = !npc && this.objectAt(tx, ty);
    let target = null;
    if (npc && this.def.npcs.find(n => n.id === npc.id).interact !== false) target = { kind: 'npc', id: npc.id, ref: npc };
    else if (obj && obj.interact) target = { kind: 'object', id: obj.id, ref: obj };
    if (target) {
      const spots = this.interactSpots(target.ref);
      const here = spots.find(([sx, sy]) => sx === this.player.x && sy === this.player.y);
      if (here) { this.player.dir = here[2]; this.interact(target); return; }
      const path = this.findPath(spots.map(([x, y]) => [x, y]));
      if (path === null) return;
      this.path = path;
      this.pending = { target, spots };
      this.tapMark = null;
      return;
    }
    if (!this.passable(tx, ty)) return;
    const path = this.findPath([[tx, ty]]);
    if (path === null) return;
    this.path = path;
    this.pending = null;
    this.tapMark = { x: tx, y: ty, t: 0 };
  }

  // ---------------- 갱신 ----------------
  update(dt) {
    this.time += dt;
    const STEP = 0.24;   // 한 칸 이동 시간(초)
    for (const a of [this.player, ...Object.values(this.npcs)]) {
      if (a.move) {
        a.move.t += dt / STEP;
        a.walk += dt;
        const k = Math.min(1, a.move.t);
        a.px = (a.move.fx + (a.move.tx - a.move.fx) * k) * this.T;
        a.py = (a.move.fy + (a.move.ty - a.move.fy) * k) * this.T;
        if (k >= 1) {
          a.move = null;
          if (a === this.player) this.savePosition();
        }
      } else {
        a.px = a.x * this.T; a.py = a.y * this.T;
      }
    }
    const p = this.player;
    if (!p.move && this.canControl) {
      if (this.keys.length) {
        this.tryStep(p, this.keys[this.keys.length - 1]);
      } else if (this.path.length) {
        const d = this.path.shift();
        if (!this.tryStep(p, d)) { this.path = []; this.pending = null; }
      } else if (this.pending) {
        const { target, spots } = this.pending;
        this.pending = null;
        const here = spots.find(([sx, sy]) => sx === p.x && sy === p.y);
        if (here) { p.dir = here[2]; this.interact(target); }
      } else {
        this.tapMark = null;
      }
    }
    if (!p.move && !this.keys.length) p.walk = 0;
    for (const n of Object.values(this.npcs)) if (!n.move) n.walk = 0;
    this.emotes = this.emotes.filter(em => (em.t += dt) < em.life);
    this.updateCamera(dt);
  }

  focusPoint() {
    const a = this.camFocus === 'player' ? this.player : (this.npcs[this.camFocus] || this.player);
    return [a.px + this.T / 2, a.py];
  }

  updateCamera(dt) {
    const st = this.game.stage;
    const W = st.W, H = st.H;
    const mapW = this.cols * this.T, mapH = this.rows * this.T;
    // 대화창이 열려 있으면 대화창 위쪽 영역에 인물이 오도록
    const box = this.game.ui.dialogue.el.box;
    const dlgH = box.classList.contains('show') ? (box.offsetHeight + 12) / st.scale : 0;
    const viewH = Math.max(H * 0.4, H - dlgH);
    const [fx, fy] = this.focusPoint();
    let tx = mapW <= W ? (mapW - W) / 2 : Math.min(Math.max(fx - W / 2, 0), mapW - W);
    let ty;
    if (mapH <= viewH) ty = (mapH - viewH) / 2;
    else ty = Math.min(Math.max(fy - viewH / 2, 0), mapH - viewH);
    if (!this.cam.ready) { this.cam.x = tx; this.cam.y = ty; this.cam.ready = true; }
    const k = 1 - Math.pow(0.0015, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  emote(actor, symbol, life = 1.4) {
    this.emotes.push({ actor, symbol, t: 0, life });
  }

  // ---------------- 그리기 ----------------
  buildBase() {
    const c = document.createElement('canvas');
    c.width = this.cols * this.T; c.height = this.rows * this.T;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    this.def.drawBase(g, this);
    this.base = c;
  }

  actorFrame(a) {
    const dir = a.dir === 'right' ? 'left' : a.dir;
    let f = 1;
    if (a.move || a.walk > 0) {
      const seq = [0, 1, 2, 1];
      f = seq[Math.floor(a.walk / 0.12) % 4];
    }
    const d = WS.DOTS[a.sprite];
    const key = d.frames[dir + f] ? dir + f : 'idle';
    return WS.getDot(a.sprite, key, a.dir === 'right');
  }

  drawActor(ctx, a) {
    if (!a.visible || a.pose === 'lying') return;
    const img = this.actorFrame(a);
    const x = Math.round(a.px + this.T / 2 - img.width / 2);
    const y = Math.round(a.py + this.T - img.height + 2);
    // 발밑 그림자
    ctx.globalAlpha = 0.22 * a.alpha;
    ctx.fillStyle = '#2a1420';
    ctx.fillRect(x + 15, y + img.height - 3, 18, 2);
    ctx.fillRect(x + 17, y + img.height - 2, 14, 1);
    ctx.globalAlpha = a.alpha;
    ctx.drawImage(img, x, y);
    ctx.globalAlpha = 1;
  }

  draw(ctx, W, H) {
    if (!this.base) this.buildBase();
    ctx.fillStyle = this.def.voidColor || '#1a1016';
    ctx.fillRect(0, 0, W, H);
    const ox = -Math.round(this.cam.x), oy = -Math.round(this.cam.y);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(this.base, 0, 0);
    if (this.tapMark) this.drawTapMark(ctx);

    // 오브젝트 · 캐릭터를 아래쪽 기준으로 정렬해서 그린다
    const items = [];
    for (const o of this.objects) if (this.def.drawObject) items.push({ y: o.sortY ?? Math.max(...o.tiles.map(t => t[1])), fn: () => this.def.drawObject(ctx, o, this) });
    for (const a of [this.player, ...Object.values(this.npcs)]) items.push({ y: a.py / this.T + 0.5, fn: () => this.drawActor(ctx, a) });
    items.sort((a, b) => a.y - b.y).forEach(it => it.fn());

    if (this.def.drawOverlay) this.def.drawOverlay(ctx, this);
    this.drawMarkers(ctx);
    this.drawEmotes(ctx);
    ctx.restore();
  }

  drawTapMark(ctx) {
    const m = this.tapMark;
    const a = 0.45 + 0.3 * Math.sin(this.time * 8);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#fff2f8';
    ctx.lineWidth = 2;
    ctx.strokeRect(m.x * this.T + 6, m.y * this.T + 6, this.T - 12, this.T - 12);
    ctx.globalAlpha = 1;
  }

  /** 조사 가능 표시: 해당 오브젝트/인물 위에 작은 반짝이 */
  markerTargets() {
    const out = [];
    for (const o of this.objects) {
      if (!o.interact) continue;
      const state = this.hooks.markerState ? this.hooks.markerState(o) : 'new';
      if (state === 'none') continue;
      const xs = o.tiles.map(t => t[0]), ys = o.tiles.map(t => t[1]);
      const mx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * this.T;
      const my = Math.min(...ys) * this.T + (o.markerDy ?? 6);
      out.push({ id: o.id, kind: 'object', x: mx, y: my, state, tiles: o.tiles });
    }
    for (const nd of this.def.npcs || []) {
      const n = this.npcs[nd.id];
      if (!n.visible || n.alpha < 0.9 || nd.interact === false) continue;
      out.push({ id: n.id, kind: 'npc', x: n.px + this.T / 2, y: n.py - 6, state: 'new', tiles: [[n.x, n.y]] });
    }
    return out;
  }

  drawMarkers(ctx) {
    if (this.mode === 'cutscene') return;
    const p = this.player;
    const facing = this.facingTarget();
    for (const m of this.markerTargets()) {
      const near = m.tiles.some(([tx, ty]) => Math.abs(tx - p.x) + Math.abs(ty - p.y) <= 1.5);
      const isFacing = facing && facing.id === m.id;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + m.x * 0.05);
      let alpha = m.state === 'seen' ? 0.28 + 0.12 * pulse : 0.45 + 0.3 * pulse;
      let size = 1;
      if (near) { alpha = Math.max(alpha, 0.8); size = 1.4; }
      if (isFacing) { alpha = 1; size = 1.7; }
      const bob = near ? Math.round(Math.sin(this.time * 5) * 2) : 0;
      this.drawSparkle(ctx, Math.round(m.x), Math.round(m.y + bob), size, alpha, m.state === 'seen');
    }
  }

  drawSparkle(ctx, x, y, size, alpha, faint) {
    const r = Math.round(3 * size);
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = faint ? '#d8c8d8' : '#ffe9a8';
    ctx.fillRect(x - r - 1, y - 1, (r + 1) * 2 + 1, 3);
    ctx.fillRect(x - 1, y - r - 1, 3, (r + 1) * 2 + 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = faint ? '#efe4ef' : '#fff8dc';
    ctx.fillRect(x - r, y, r * 2 + 1, 1);
    ctx.fillRect(x, y - r, 1, r * 2 + 1);
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 1);
    ctx.globalAlpha = 1;
  }

  drawEmotes(ctx) {
    for (const em of this.emotes) {
      const a = em.actor;
      const k = em.t / em.life;
      const pop = k < 0.15 ? k / 0.15 : 1;
      const x = Math.round(a.px + this.T / 2 + 6), y = Math.round(a.py - 18 - (1 - pop) * 4);
      ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      // 말풍선
      ctx.fillStyle = '#3e2a3b';
      ctx.fillRect(x - 8, y - 9, 17, 15);
      ctx.fillRect(x - 3, y + 6, 4, 2);
      ctx.fillStyle = '#fff6fb';
      ctx.fillRect(x - 7, y - 8, 15, 13);
      ctx.fillRect(x - 2, y + 5, 2, 1);
      ctx.fillStyle = em.symbol === '!' ? '#d6284c' : '#6e4a65';
      const glyph = {
        '!': ['.#.', '.#.', '.#.', '.#.', '...', '.#.'],
        '?': ['###', '..#', '.##', '.#.', '...', '.#.'],
        '…': ['.....', '.....', '.....', '.....', '.....', '#.#.#'],
      }[em.symbol] || ['###'];
      const gw = glyph[0].length;
      glyph.forEach((row, gy) => [...row].forEach((ch, gx) => {
        if (ch === '#') ctx.fillRect(x - Math.floor(gw / 2) + gx, y - 6 + gy, 1, 1);
      }));
      ctx.globalAlpha = 1;
    }
  }
};
