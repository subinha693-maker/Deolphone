/*
 * 픽셀 스프라이트 데이터
 *  - 문자 1개 = 픽셀 1개. '.' 은 투명.
 *  - 팔레트 문자 → 색상. 변신 스프라이트는 jobs.js 의 sprite 팔레트로 색이 바뀐다.
 *  - build() 가 자동으로 1px 외곽선을 둘러 흰 배경에서도 형태가 보이게 한다.
 */
window.WS = window.WS || {};

WS.SPRITES = {
  mireille: {
    outline: '#5d5a6a',
    palette: {
      K: '#17151c', k: '#34303f', S: '#f4e4da', s: '#dcc4b8', M: '#f4f2f8', m: '#9c98aa',
      E: '#a07a3a', L: '#c98a86', W: '#ffffff', w: '#e1e0e8', g: '#b4b2c2', J: '#9fa6ba',
      F: '#ecebf2', G: '#fbfbfd',
    },
    rows: [
      '....F...............',
      '....FF..............',
      '.....FKKKKKKKK......',
      '....KKKKKKKKKKKK....',
      '...KKKkkKKKKKKKKK...',
      '...KKMMMMKKKKKKKK...',
      '...KKMmmMSSSSKKKK...',
      '...KKMMMMSSESSKKK...',
      '...KKMMMMSSSSSSKK...',
      '...KKSMMSSSSSSSKK...',
      '...KKSSSSSLLSSSKK...',
      '...KKKSSSSSSSSKKK...',
      '...KKKKWWSSWWKKKK...',
      '...KKKWWWJJWWWKKK...',
      '..KKKWWWWJJWWWWKKK..',
      '..KKWWwWWWWWWwWWKK..',
      '..KKWwWWWWWWWWwWKK..',
      '..KWWWwwwwwwwwWWWK..',
      '.KKWwWWwWWWWwWWwWKK.',
      '.KWWwWWWgggWWWwWWWK.',
      '.KWwWWWWgWgWWWWwWWK.',
      '.KWWWWWWgWgWWWWWWWK.',
      '.KGGGWWWWWWWWWWGGGK.',
    ],
  },

  heroBase: {
    outline: '#4b3a36',
    palette: {
      H: '#6b3f2e', h: '#93604a', d: '#4a2a20', S: '#f6e0d2', E: '#7a3f2c', L: '#c9827a',
      C: '#efe3c8', c: '#d2c19c', P: '#9a4a44', p: '#d0965e', B: '#5a3528', b: '#3d2219',
    },
    rows: [
      '......HHHH......',
      '....HHHHHHHH....',
      '...HHHhhHHHHH...',
      '..HHHhHHHHHHHH..',
      '.dHHHHHHHHHHHH..',
      '.dHHSHHHHSHHHH..',
      'dHHSSSSSSSSSHH..',
      'dHHSEESSSEESHH..',
      'dHHSEESSSEESHH..',
      'dHHSSSSSSSSSHH..',
      'dHHHSSSLSSSHHH..',
      'dHHHHSSSSSHHHH..',
      'dHHHCCCCCCCHHHH.',
      'dHHCCCCCCCCCHHH.',
      'dHCCCcCCCCcCCHH.',
      'dHCCcCCCCCCcCCH.',
      'dHCCcCCCCCCcCCH.',
      '.HCCcCCCCCCcCCH.',
      '.dSCcCCCCCCcCS..',
      '.d.SPPPPPPPPS...',
      '...PPpPPPpPPP...',
      '...PPpPPPpPPP...',
      '..PppppppppppP..',
      '..PPPpPPPpPPPP..',
      '.....SS..SS.....',
      '.....SS..SS.....',
      '.....SS..SS.....',
      '.....BB..BB.....',
      '.....BB..BB.....',
      '.....BB..BB.....',
      '....bBB..BBb....',
      '....bbb..bbb....',
    ],
  },

  // 변신 후 공통 형태. 색은 직업 팔레트(H h d E D e A T B)가 덮어쓴다.
  heroMagical: {
    outline: '#4b3a46',
    palette: { S: '#f8e6da', L: '#d0868a' },
    rows: [
      '......HHHH......',
      '...AAHHHHHHAA...',
      '..AAAHhhHHHAAA..',
      '..AAHHHHHHHHAA..',
      '.dHHHHHHHHHHHHd.',
      '.dHHSHHHHSHHHHd.',
      'dHHSSSSSSSSSHHd.',
      'dHHSEESSSEESHHd.',
      'dHHSEESSSEESHHd.',
      'dHHSSSSSSSSSHHd.',
      'dHHHSSSLSSSHHHd.',
      'dHHHHSSSSSHHHHd.',
      'dHHHTTAATTHHHHd.',
      'dHHSDDAADDSHHHd.',
      'dHSSDDDDDDSSHHd.',
      'dHTSeDDDDeSTHHd.',
      'dHTSeDTTDeSTHHd.',
      'dH.SDDDDDDS.Hd..',
      'd..TTDDDDDDTT.d.',
      '..eDDDDAADDDDe..',
      '.eDDDDDDDDDDDDe.',
      '.eDDeDDDDDDeDDe.',
      'eDDDeDDDDDDeDDDe',
      'TTTTTTTTTTTTTTTT',
      'T.TTTTTTTTTTTT.T',
      '.....SS..SS.....',
      '.....SS..SS.....',
      '.....TT..TT.....',
      '.....TT..TT.....',
      '.....BB..BB.....',
      '....ABB..BBA....',
      '....BBB..BBB....',
    ],
  },

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

/** 스프라이트 → 오프스크린 캔버스 (외곽선 포함, 캐시) */
WS.SpriteCache = {
  cache: new Map(),

  build(key, def, paletteOverride) {
    const cacheKey = key + (paletteOverride ? JSON.stringify(paletteOverride) : '');
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const pal = Object.assign({}, def.palette, paletteOverride || {});
    const h = def.rows.length;
    const w = def.rows[0].length;
    const c = document.createElement('canvas');
    c.width = w + 2; c.height = h + 2; // 외곽선 여백
    const ctx = c.getContext('2d');
    const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && def.rows[y][x] !== '.';
    if (def.outline) {
      ctx.fillStyle = def.outline;
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = def.rows[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch] || '#ff00ff';
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
    this.cache.set(cacheKey, c);
    return c;
  },

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
