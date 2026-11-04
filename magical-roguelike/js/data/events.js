// Event (사건) nodes and rest node options. Outcomes are lists of ops run by NodeManager.applyOps.
// ops: healAll{pct} | damageAll{pct} | damageRandom{pct} | shards{n} | potions{n} | relic{rarity}
//      scout{pct}  (next battle enemies have -pct HP) | life{n} | gamble{chance, win[], lose[]}
(function () {
  const MG = (window.MG = window.MG || {});

  MG.EVENTS = [
    {
      id: 'chapel',
      title: '버려진 예배당',
      speaker: '내레이션',
      art: 'chapel',
      text: '무너진 스테인드글라스 사이로 희미한 달빛이 쏟아진다. 제단 위에는 먼지 쌓인 성물함이 놓여 있다.',
      choices: [
        { label: '제단 앞에서 기도한다', result: '따뜻한 빛이 일행을 감싼다. (배치·대기 아군 체력 20% 회복)', ops: [{ op: 'healAll', pct: 0.2 }] },
        { label: '성물함을 연다 (별조각 10)', require: { shards: 10 }, result: '봉인이 풀리며 유물이 모습을 드러낸다.', ops: [{ op: 'shards', n: -10 }, { op: 'relic', rarity: 'any' }] },
        { label: '조용히 지나간다', result: '일행은 발소리를 죽이고 예배당을 빠져나왔다.', ops: [] },
      ],
    },
    {
      id: 'rose_garden',
      title: '피 흘리는 장미 정원',
      speaker: '로젤',
      art: 'roses',
      text: '검붉은 장미가 끝없이 피어 있다. 가시마다 마력이 맺혀 있어… 꺾으면 무언가 얻을 수 있을 것 같아.',
      choices: [
        { label: '가시를 무릅쓰고 장미를 꺾는다', result: '가시에 찔렸지만 희귀한 유물을 손에 넣었다. (무작위 아군 체력 -30%)', ops: [{ op: 'damageRandom', pct: 0.3 }, { op: 'relic', rarity: 'rare' }] },
        { label: '향기만 맡고 쉬어 간다', result: '마음이 차분해진다. (전체 체력 10% 회복, 별조각 +5)', ops: [{ op: 'healAll', pct: 0.1 }, { op: 'shards', n: 5 }] },
        { label: '정원을 떠난다', result: '장미들이 아쉬운 듯 흔들렸다.', ops: [] },
      ],
    },
    {
      id: 'doll_peddler',
      title: '떠도는 인형 행상',
      speaker: '인형 행상',
      art: 'peddler',
      text: '"후후… 마법소녀님들, 물약 필요하지 않으신가요? 아니면 이 앞길 이야기라도…"',
      choices: [
        { label: '물약 2개를 산다 (별조각 12)', require: { shards: 12 }, result: '수상하지만 효과는 확실한 물약이다. (물약 +2)', ops: [{ op: 'shards', n: -12 }, { op: 'potions', n: 2 }] },
        { label: '앞길 이야기를 듣는다', result: '다음 전투에 등장할 적의 약점을 알아냈다. (다음 전투 적 체력 -15%)', ops: [{ op: 'scout', pct: 0.15 }] },
        { label: '무시하고 지나간다', result: '"다음에 또 봬요~"', ops: [] },
      ],
    },
    {
      id: 'mirror_hall',
      title: '거울의 회랑',
      speaker: '실피',
      art: 'mirror',
      text: '거울 속의 우리가… 웃고 있어. 손을 뻗으면 무언가 건넬 것 같지만, 반대로 무언가 빼앗길지도 몰라.',
      choices: [
        { label: '거울에 손을 뻗는다 (50%)', result: '', ops: [{ op: 'gamble', chance: 0.5, win: [{ op: 'relic', rarity: 'rare' }], lose: [{ op: 'damageAll', pct: 0.15 }], winText: '거울이 유물을 건넸다!', loseText: '거울이 깨지며 파편이 쏟아졌다. (전체 체력 -15%)' }] },
        { label: '거울을 깨뜨린다', result: '파편 속에서 별조각을 주웠다. (별조각 +12)', ops: [{ op: 'shards', n: 12 }] },
      ],
    },
    {
      id: 'lost_candle',
      title: '꺼지지 않는 촛불',
      speaker: '벨라',
      art: 'candle',
      text: '누군가 남겨 둔 촛불이 아직도 타고 있어요. 이 불씨를 우리 결계에 옮겨 담으면, 마을을 지키는 힘이 될지도 몰라요.',
      choices: [
        { label: '불씨를 결계에 담는다', result: '공유 생명이 2 회복되었다.', ops: [{ op: 'life', n: 2 }] },
        { label: '불씨를 마력으로 바꾼다', result: '불꽃이 유물로 굳어졌다.', ops: [{ op: 'relic', rarity: 'common', tag: 'fire' }] },
      ],
    },
  ];

  MG.REST_OPTIONS = [
    { id: 'rest', label: '모닥불 곁에서 쉰다', desc: '쓰러지지 않은 모든 아군 체력 35% 회복' },
    { id: 'revive', label: '쓰러진 동료를 간호한다', desc: '쓰러진 아군 1명을 체력 50%로 일으킵니다 (없으면 가장 다친 아군 완전 회복)' },
    { id: 'sharpen', label: '마력을 가다듬는다', desc: '물약 1개 획득, 별조각 +6' },
  ];
})();
