// =============================================================
//  스테이지 데이터
//  맵 기호 (칸 사이는 띄어쓰기)
//    S: 적 출현 지점   B: 기지   R: 진격로(배치 불가)
//    G: 지상 칸(근접 배치)   H: 언덕 칸(원거리 배치)   X: 장애물
//  적은 S 에서 R/G 칸을 따라 가장 짧은 길로 B 까지 이동합니다.
//  S 가 여러 개면 위쪽→아래쪽, 왼쪽→오른쪽 순서로 0번, 1번… 입니다.
//
//  waves: 웨이브 목록. 각 웨이브는 groups 의 적을 순서대로 내보냅니다.
//    { enemy: 적 id, count: 마리 수, spawn: 출현 지점 번호(0,1…) 또는 'alt'(번갈아) }
//  firstWaveDelay / waveRest / spawnInterval 을 넣으면 config.js 값 대신 사용
// =============================================================
window.STAGES = [
  {
    id: 'st1',
    code: '1-1',
    name: '에레비아 남부 뒷골목',
    desc: '혼수상태에서 깨어난 옛 리더의 첫 지휘. 뒷골목에 나타난 이상체를 정리하자.',
    tutorial: true,
    reward: { exp: 150, yen: 300 },
    firstWaveDelay: 10,
    map: [
      'B R R G R R G R R G R R X',
      'X H H H X H H H X H X R X',
      'X H X H H H X H H H H R X',
      'X R G R R G R R G R R R X',
      'X R H H X H H H X H H X X',
      'X G H X H H X H H H X H X',
      'X R R G R R G R R G R R S'
    ],
    waves: [
      { groups: [ { enemy: 'fuzz', count: 6 } ] },
      { groups: [ { enemy: 'fuzz', count: 6 }, { enemy: 'rusher', count: 3 } ] },
      { groups: [ { enemy: 'mask', count: 3 }, { enemy: 'spitter', count: 2 }, { enemy: 'papermoth', count: 3 } ] },
      { groups: [ { enemy: 'ironbug', count: 1 }, { enemy: 'mask', count: 4 }, { enemy: 'fuzz', count: 6 } ] }
    ]
  },
  {
    id: 'st2',
    code: '1-2',
    name: '폐공장 지대',
    desc: '두 갈래 길에서 몰려오는 이상체. 길이 합쳐지는 곳을 지켜라. 마지막에는 거대한 무언가가 온다.',
    unlockAfter: 'st1',
    reward: { exp: 250, yen: 500 },
    map: [
      'X H H X H H H H R G R R S',
      'X H H H X H H H R H H H X',
      'X H X H H H X H G H X H X',
      'B R G R R G R R G H H X X',
      'X H H H X H H H R H H H X',
      'X H X H H X H H G H X H X',
      'X H H X H H H H R G R R S'
    ],
    waves: [
      { groups: [ { enemy: 'fuzz', count: 6, spawn: 'alt' }, { enemy: 'rusher', count: 2, spawn: 1 } ] },
      { groups: [ { enemy: 'mask', count: 2, spawn: 0 }, { enemy: 'spitter', count: 2, spawn: 1 }, { enemy: 'fuzz', count: 4, spawn: 'alt' } ] },
      { groups: [ { enemy: 'papermoth', count: 4, spawn: 'alt' }, { enemy: 'rusher', count: 4, spawn: 1 }, { enemy: 'mask', count: 2, spawn: 0 } ] },
      { groups: [ { enemy: 'ironbug', count: 2, spawn: 'alt' }, { enemy: 'spitter', count: 2, spawn: 'alt' }, { enemy: 'fuzz', count: 6, spawn: 'alt' } ] },
      { groups: [ { enemy: 'toadking', count: 1, spawn: 0 }, { enemy: 'mask', count: 3, spawn: 1 }, { enemy: 'fuzz', count: 6, spawn: 'alt' } ] }
    ]
  }
];

// 튜토리얼 안내 문구 (tutorial: true 인 스테이지에서, 처음 클리어하기 전까지 표시)
window.TUTORIAL_STEPS = [
  { trigger: 'start',      holdWave: true,
    text: '아래 캐릭터 카드를 맵의 밝게 빛나는 칸으로 끌어다 놓으세요.\n근접(가디언·나이트)은 진격로 위 지상 칸, 원거리(레인저·미스틱·메딕)는 언덕 칸에 놓을 수 있어요.\n(터치: 카드를 탭한 뒤 칸을 탭)' },
  { trigger: 'deploy',
    text: '좋아요! 첫 배치가 끝나면 이상체가 오기 시작합니다.\n코스트는 1초에 1씩 차요. 아라를 진격로 위에, 아멜리·셰바를 근처 언덕에 놓아 보세요.' },
  { trigger: 'block',
    text: '저지! 지상 캐릭터는 저지 수만큼 적을 자기 칸에 멈춰 세웁니다.\n저지 수를 넘는 적은 그냥 지나가니 주의하세요. 비행 적은 막을 수 없어요.' },
  { trigger: 'skillReady',
    text: '머리 위 아이콘이 빛나면 스킬 준비 완료!\n캐릭터를 눌러 [스킬]을 쓰세요. [퇴각]하면 코스트 절반을 돌려받아요.' },
  { trigger: 'wave2',
    text: '왼쪽 아래 [page 2: 강화] 탭에서 코스트로 강화 카드를 살 수 있어요.\n보급품은 안전하지만 비싸고, 캡슐은 싸고 강하지만 최대 체력이 깎입니다.' }
];
