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
