// Enemy data + tiny pixel-art definitions (drawn procedurally at runtime, facing left).
(function () {
  const MG = (window.MG = window.MG || {});

  // Palette keys shared by all pixel sprites
  MG.PIXEL_PALETTE = {
    K: '#1a0f1f', // outline
    P: '#4b2a5e', // shadow purple
    p: '#6e3f8a',
    R: '#e0384f', // red
    r: '#8f1d32',
    W: '#f4ecf7', // white / bone
    w: '#b9aec4',
    G: '#7b7f8c', // steel
    g: '#4a4d58',
    Y: '#f2c14e', // gold
    B: '#2f5a8f',
    b: '#7fb2e5',
    D: '#2b1b30',
    S: '#c7a0d9',
    L: '#9fe0a4',
  };

  const bat1 = [
    '................',
    '.K............K.',
    'KPK....KK....KPK',
    'KPPK..KRRK..KPPK',
    'KPPPKKPRRPKKPPPK',
    '.KPPPPPPPPPPPPK.',
    '..KKPPWPPWPPKK..',
    '....KKPPPPKK....',
    '......KPPK......',
    '.......KK.......',
  ];
  const bat2 = [
    '................',
    '................',
    '.......KK.......',
    '......KRRK......',
    '.KKKKKPRRPKKKKK.',
    'KPPPPPPPPPPPPPPK',
    'KPKKPPWPPWPPKKPK',
    'K...KKPPPPKK...K',
    '......KPPK......',
    '.......KK.......',
  ];

  const skel1 = [
    '....KKKKK.....',
    '...KWWWWWK....',
    '..KWKWWKWWK...',
    '..KWWWWWWWK...',
    '...KWKWKWK....',
    '....KWWWK.....',
    '..KKGGGGGKK...',
    '.KGgGGGGGgGK..',
    'KWKGgGRGgGKWK.',
    'KWKGgGRGgGKWKK',
    'KWKGgGGGgGKWKG',
    '.K.KGGGGGK.KGG',
    '...KgGGGgK..KG',
    '...KWK.KWK...K',
    '...KWK.KWK....',
    '...KWK.KWK....',
    '..KGGK.KGGK...',
    '..KKKK.KKKK...',
  ];

  const doll1 = [
    '...KKKKKK...',
    '..KSSSSSSK..',
    '.KSKKKKKKSK.',
    '.KKWWWWWWKK.',
    '.KWKWWWWKWK.',
    '.KWRWWWWRWK.',
    '..KWWrrWWK..',
    '...KKKKKK...',
    '..KpPPPPpK..',
    '.KpPRPPRPpK.',
    'KWKPPPPPPKWK',
    'KK.KpPPpK.KK',
    '..KpPPPPpK..',
    '.KpppppppK..',
    '..KWK..KWK..',
    '..KKK..KKK..',
  ];

  const wraith1 = [
    '.....KKKK.....',
    '....KDDDDK....',
    '...KDDDDDDK...',
    '..KDKbDDbKDK..',
    '..KDDbDDbDDK..',
    '..KDDDDDDDDK..',
    '.KDDDKKKKDDDK.',
    '.KDDDDDDDDDDK.',
    'KDpDDDDDDDDpDK',
    'KpKDDDDDDDDKpK',
    'K..KDDDDDDK..K',
    '...KDDpDDDK...',
    '...KDDDDpDK...',
    '....KDDDDK....',
    '....KDpDK.....',
    '.....KDK......',
    '......K.......',
  ];

  const knight1 = [
    '.....KKKKK......',
    '....KGGGGGK.....',
    '...KGgggggGK....',
    '...KGKRRRKGK....',
    '...KGGGGGGGK....',
    '....KGGGGGK.....',
    '..KKgGGGGGgKK...',
    '.KGgGGGYGGGgGK..',
    'KGKGGGYYYGGGKGK.',
    'KGKgGGGYGGGgKGKK',
    'KGKgGGGGGGGgKGGW',
    '.K.KgGGGGGgK.KWW',
    '...KgGGGGGgK..KW',
    '...KGGK.KGGK...K',
    '...KGGK.KGGK....',
    '...KgGK.KgGK....',
    '..KGGGK.KGGGK...',
    '..KKKKK.KKKKK...',
  ];

  const bishop1 = [
    '........KK..........',
    '.......KYYK.........',
    '......KYRRYK........',
    '.....KYYRRYYK.......',
    '.....KWWWWWWK.......',
    '....KWKWWWWKWK......',
    '....KWRWWWWRWK..K...',
    '.....KWWrrWWK..KYK..',
    '...KKKKWWWWKKKKKYK..',
    '..KrRRRRKKRRRRrKYK..',
    '.KrRRRRRRRRRRRRrKK..',
    'KrRKRRRRYRRRRKRRKY..',
    'KRK.KRRYYYRRK.KRKY..',
    'KWK.KRRRYRRRK.KWKY..',
    '.K..KrRRRRRrK..K.Y..',
    '...KrRRRRRRRrK...Y..',
    '...KrRRRRRRRRK...Y..',
    '..KrRRRRRRRRRrK..Y..',
    '..KrRRrRRRrRRrK..Y..',
    '.KrRRRRRRRRRRRrK.Y..',
    '.KKKKKKKKKKKKKKK.Y..',
  ];

  // helper: make a "bob" second frame by shifting the art down one pixel
  const bob = (art) => ['.'.repeat(art[0].length)].concat(art.slice(0, -1));

  MG.ENEMY_ART = {
    bat: { frames: [bat1, bat2], scale: 4 },
    skeleton: { frames: [skel1, bob(skel1)], scale: 4 },
    doll: { frames: [doll1, bob(doll1)], scale: 4 },
    wraith: { frames: [wraith1, bob(wraith1)], scale: 4 },
    dark_knight: { frames: [knight1, bob(knight1)], scale: 6 },
    thorn_bishop: { frames: [bishop1, bob(bishop1)], scale: 6 },
  };

  // range: distance from the ally line where the enemy stops to attack
  // lifeDamage: shared life lost when it reaches the home point in a defense node
  MG.ENEMIES = {
    bat: {
      id: 'bat', name: '그림자 박쥐', hp: 60, atk: 8, def: 0, speed: 115,
      atkInterval: 0.9, range: 60, ranged: false, lifeDamage: 1, flying: true,
    },
    skeleton: {
      id: 'skeleton', name: '해골 파수병', hp: 150, atk: 14, def: 10, speed: 55,
      atkInterval: 1.4, range: 70, ranged: false, lifeDamage: 1,
    },
    doll: {
      id: 'doll', name: '저주 인형', hp: 90, atk: 13, def: 2, speed: 62,
      atkInterval: 1.8, range: 330, ranged: true, lifeDamage: 1, projColor: '#c7a0d9',
    },
    wraith: {
      id: 'wraith', name: '망령', hp: 115, atk: 17, def: 4, speed: 80,
      atkInterval: 1.2, range: 65, ranged: false, lifeDamage: 2, armorPierce: 0.5, flying: true,
    },
    dark_knight: {
      id: 'dark_knight', name: '흑철 기사', hp: 650, atk: 30, def: 22, speed: 38,
      atkInterval: 1.6, range: 80, ranged: false, lifeDamage: 3, elite: true,
    },
    thorn_bishop: {
      id: 'thorn_bishop', name: '가시관의 주교', hp: 1900, atk: 34, def: 18, speed: 30,
      atkInterval: 2.0, range: 300, ranged: true, lifeDamage: 5, boss: true, projColor: '#e0384f',
      summon: { enemy: 'bat', every: 9, count: 2 },
    },
  };
})();
