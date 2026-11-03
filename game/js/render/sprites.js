/*
 * 작은 픽셀 모양 (파티클, 깃털)
 * 캐릭터 도트는 tools/dots.py 가 생성하는 js/render/dots.js 에 있다.
 */
window.WS = window.WS || {};

WS.SPRITES = {
  // 파티클 모양 (각성 연출, 배경 깃털)
  particles: {
    heart:     ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    butterfly: ['XX.XX', 'XXXXX', '.XXX.', 'XX.XX', 'X...X'],
    star:      ['..X..', '.XXX.', 'XXXXX', '.XXX.', '.X.X.'],
    petal:     ['.XX', 'XXX', 'XX.'],
    bell:      ['..X..', '.XXX.', '.XXX.', 'XXXXX', '..X..'],
    sparkle:   ['.X.', 'XXX', '.X.'],
    feather:   ['.....XXX', '...XXXXX', '.XXXXXX.', 'XXXX....', 'X.......'],
  },
};

/** 파티클 · 도트 캔버스 캐시 */
WS.SpriteCache = {
  cache: new Map(),

  /** 단색 파티클 */
  particle(shape, color) {
    const key = 'p:' + shape + color;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = WS.SPRITES.particles[shape];
    const c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') ctx.fillRect(x, y, 1, 1); }));
    this.cache.set(key, c);
    return c;
  },
};

/** 캐릭터 도트(js/render/dots.js) → 캔버스 (flip: 좌우 반전, 오른쪽 방향용) */
WS.getDot = function (id, frame, flip) {
  const key = 'dot:' + id + ':' + frame + (flip ? ':f' : '');
  const cache = WS.SpriteCache.cache;
  if (cache.has(key)) return cache.get(key);
  const d = WS.DOTS[id];
  if (!d) throw new Error('도트 데이터가 없습니다: ' + id);
  const rows = d.frames[frame] || d.frames.idle;
  const codes = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~';
  const c = document.createElement('canvas');
  c.width = d.w; c.height = d.h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = d.palette[codes.indexOf(ch)];
      g.fillRect(flip ? d.w - 1 - x : x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
};
