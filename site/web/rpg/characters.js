/*
 * 새 화자 등록 — 우주적 존재 3명 (Phase 4-B)
 * ------------------------------------------------------------
 * 흰 공간 원본의 WS.CHARACTERS 형식을 그대로 따른다.
 *   names        대본의 [이름] 에 쓰는 이름
 *   displayName  이름표에 뜨는 이름
 *   portrait     기본 초상화
 *   expressions  대본이 쓰는 표정만 등록 (없는 표정은 "[dialogue] 없는 표정" 경고가 뜬다)
 *
 * 초상화는 rpg/assets/portraits/ 의 그림 (CAZ MV Portraits). 표정별 그림이 생기면 expressions 값만 바꾸면 된다.
 */
window.WS = window.WS || {};
(function () {
  // 초상화: CAZ MV Portraits (사용자가 준 초상화 묶음)에서 인물 소개에 가까운 것을 골랐다. 표정은 한 장뿐이라 모든 표정이 같은 그림.
  const PORT = id => 'rpg/assets/portraits/' + id + '.png';
  const P = {
    lucien: PORT('lucien'),          // Actor2-2 — 웃는 눈매, 와인빛 코트
    valerie: PORT('valerie'),        // Actor2-8 — 제복풍 옷차림
    theophile: PORT('theophile'),    // Actor2-7 — 안경, 학자풍 옷깃
  };

  // 대본(meetings_1st_loop.txt)이 쓰는 표정만 등록한다.
  const expr = (id, list) => Object.fromEntries(list.map(e => [e, P[id]]));

  WS.CHARACTERS.lucien = {
    names: ['루시앙'],
    displayName: '루시앙',
    portrait: P.lucien,
    expressions: expr('lucien', ['웃음', '미소']),       // 표정 그림이 한 장이라 모두 같은 그림
  };
  WS.CHARACTERS.valerie = {
    names: ['발레리'],
    displayName: '발레리',
    portrait: P.valerie,
    expressions: expr('valerie', ['진지', '기본', '미소', '웃음']),
  };
  WS.CHARACTERS.theophile = {
    names: ['테오필'],
    displayName: '테오필',
    portrait: P.theophile,
    expressions: expr('theophile', ['놀람', '미소', '기본', '곤란', '진지']),
  };

  // 중요 NPC (이름 없이 직함) — 대사의 [직함] 화자에 초상화가 붙는다
  const NPC = [
    ['hunter', '숲 사냥꾼'], ['knight', '하급 기사'], ['sailor', '부두 선원'], ['apprentice', '견습 마법사'], ['scribe', '왕실 서기관'],
    ['merchant', '잡화점 주인'], ['king', '국왕'], ['towerkeeper', '탑지기'], ['soldier', '기사'], ['spirit', '숲의 정령'],
  ];
  for (const [id, name] of NPC) WS.CHARACTERS['npc_' + id] = { names: [name], displayName: name, portrait: PORT(id) };
})();
