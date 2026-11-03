/*
 * 등장인물 데이터
 *  - names: 스크립트의 [화자] 표기 중 이 캐릭터로 인식할 이름들
 *  - portrait: 기본 초상화
 *  - expressions: 표정 이름 → 초상화. 스크립트에서 [클레어:놀람] 처럼 쓴다.
 *      한 번 지정한 표정은 다음 대사에도 유지된다 (장면이 바뀌면 초기화)
 *  - closeup: @closeup 연출에 쓰는 큰 그림
 *  - kind: 'system' 가운데 정렬 안내 문구 / 'narration' 이름표 없는 서술
 *
 * 화자 표기 문법
 *   [클레어]            이름
 *   [클레어:놀람]        이름 + 표정
 *   [???|메이어:기본]    화면에는 ??? 로 보이고, 초상화는 메이어
 */
window.WS = window.WS || {};


WS.CHARACTERS = {
  hero: {
    names: ['주인공', '클레어'],
    displayName: '클레어',
    portrait: 'assets/portraits/hero.jpg',
    // 표정을 지정하지 않으면: 각성 후에는 선택한 직업의 초상화(jobs.js 의 portrait)
    usesJobPortrait: true,
    expressions: {
      기본: 'assets/portraits/claire_normal.jpg',
      놀람: 'assets/portraits/claire_surprised.jpg',
      당황: 'assets/portraits/claire_confused.jpg',
      부끄: 'assets/portraits/claire_embarrassed.jpg',
      흥분: 'assets/portraits/claire_happy.jpg',
      한숨: 'assets/portraits/claire_closed.jpg',
      못마땅: 'assets/portraits/claire_annoyed.jpg',
      시무룩: 'assets/portraits/claire_sulky.jpg',
    },
  },
  mireille: {
    names: ['미레유', '안내자'],
    displayName: '미레유',
    portrait: 'assets/portraits/mireille.jpg',
  },
  mayer: {
    names: ['메이어'],
    displayName: '메이어',
    portrait: 'assets/portraits/mayer_normal.jpg',
    closeup: 'assets/portraits/mayer_closeup.jpg',
    expressions: {
      기본: 'assets/portraits/mayer_normal.jpg',
      진지: 'assets/portraits/mayer_serious.jpg',
      미소: 'assets/portraits/mayer_smile.jpg',
      온화: 'assets/portraits/mayer_gentle.jpg',
      웃음: 'assets/portraits/mayer_happy.jpg',
      설명: 'assets/portraits/mayer_talk.jpg',
      놀람: 'assets/portraits/mayer_surprised.jpg',
      곤란: 'assets/portraits/mayer_troubled.jpg',
      눈감음: 'assets/portraits/mayer_closed.jpg',
    },
  },
  narration: {
    names: ['나레이션'],
    displayName: '',
    kind: 'narration',
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

/** "???|메이어:기본" → { display: '???', id: 'mayer', expr: '기본' } */
WS.parseSpeaker = function (tag) {
  if (!tag) return { display: '', id: null, expr: null };
  let [who, expr] = tag.split(':');
  let display = who, ref = who;
  if (who.includes('|')) [display, ref] = who.split('|');
  display = display.trim(); ref = ref.trim();
  return { display, id: WS.findCharacterId(ref), expr: expr ? expr.trim() : null };
};
