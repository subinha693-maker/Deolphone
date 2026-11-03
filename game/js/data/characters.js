/*
 * 등장인물 데이터
 *  - names: 스크립트의 [화자] 표기 중 이 캐릭터로 인식할 이름들
 *  - portrait: 대화창 초상화 (픽셀 아트)
 *  - kind: 'system' 이면 초상화 없이 가운데 정렬된 안내 문구로 표시
 */
window.WS = window.WS || {};

WS.CHARACTERS = {
  hero: {
    names: ['주인공'],
    displayName: '주인공',
    portrait: 'assets/portraits/hero.jpg',
    // 각성 후에는 선택한 직업의 초상화(jobs.js 의 portrait)로 바뀐다
    usesJobPortrait: true,
  },
  mireille: {
    names: ['미레유', '안내자'],
    displayName: '미레유',
    portrait: 'assets/portraits/mireille.jpg',
  },
  system: {
    names: ['시스템'],
    displayName: '',
    kind: 'system',
  },
};

/** [화자] 표기 → 캐릭터 ID */
WS.findCharacterId = function (speakerName) {
  for (const id in WS.CHARACTERS) {
    if (WS.CHARACTERS[id].names.includes(speakerName)) return id;
  }
  return null;
};
