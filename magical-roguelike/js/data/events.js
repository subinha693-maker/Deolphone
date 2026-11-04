// Event (사건) nodes and rest node options. Outcomes are lists of ops run by NodeManager.applyOps.
//
// ops: healAll{pct} | damageAll{pct} | damageRandom{pct} | shards{n} | potions{n} | life{n}
//      relic{rarity, tag} | relicChoice{n, rarity}  (opens a pick screen after the event)
//      scout{pct, reveal}  | ambush{pct} (next battle enemies +pct HP) | gamble{chance, win[], lose[], winText, loseText}
//      mod{unit:'random'|charId} | removeCurse{fallback[]} | sacrificeRelic{} | runBonus{stat, pct}
//      nextBattles{n, stat, pct} | flag{set} | discount{pct} | recruit{} | reviveOne{pct, fallback[]}
//      wish{amount} (wishing well tiers) | allShards{mult} (bet every shard)
// choice.require: {shards, relics, flag, notFlag, party, potions}
// event.when: {minCol, maxCol, flag, notFlag, party, minRelics, unlock, weight}
// speaker: a party member's name → weight x2 when present; replaced by another member when absent.
(function () {
  const MG = (window.MG = window.MG || {});

  MG.EVENTS = [
    {
      id: 'chapel', title: '버려진 예배당', speaker: '내레이션', art: 'chapel',
      text: '무너진 스테인드글라스 사이로 희미한 달빛이 쏟아진다. 제단 위에는 먼지 쌓인 성물함이 놓여 있다.',
      choices: [
        { label: '제단 앞에서 기도한다', result: '따뜻한 빛이 일행을 감싼다. (모든 아군 체력 20% 회복)', ops: [{ op: 'healAll', pct: 0.2 }] },
        { label: '성물함을 연다 (별조각 10)', require: { shards: 10 }, result: '봉인이 풀리며 유물이 모습을 드러낸다.', ops: [{ op: 'shards', n: -10 }, { op: 'relic', rarity: 'any' }] },
        { label: '조용히 지나간다', result: '일행은 발소리를 죽이고 예배당을 빠져나왔다.', ops: [] },
      ],
    },
    {
      id: 'rose_garden', title: '피 흘리는 장미 정원', speaker: '로젤', art: 'roses',
      text: '검붉은 장미가 끝없이 피어 있다. 가시마다 마력이 맺혀 있어… 꺾으면 무언가 얻을 수 있을 것 같아.',
      choices: [
        { label: '가시를 무릅쓰고 장미를 꺾는다', result: '가시에 찔렸지만 희귀한 유물을 손에 넣었다.', ops: [{ op: 'damageRandom', pct: 0.3 }, { op: 'relic', rarity: 'rare' }] },
        { label: '향기만 맡고 쉬어 간다', result: '마음이 차분해진다. (전체 체력 10% 회복, 별조각 +5)', ops: [{ op: 'healAll', pct: 0.1 }, { op: 'shards', n: 5 }] },
        { label: '정원을 떠난다', result: '장미들이 아쉬운 듯 흔들렸다.', ops: [] },
      ],
    },
    {
      id: 'doll_peddler', title: '떠도는 인형 행상', speaker: '인형 행상', art: 'peddler',
      text: '"후후… 마법소녀님들, 물약 필요하지 않으신가요? 아니면 이 앞길 이야기라도…"',
      choices: [
        { label: '물약 2개를 산다 (별조각 12)', require: { shards: 12 }, result: '수상하지만 효과는 확실한 물약이다. (물약 +2)', ops: [{ op: 'shards', n: -12 }, { op: 'potions', n: 2 }, { op: 'flag', set: 'peddler_met' }] },
        { label: '앞길 이야기를 듣는다', result: '다음 전투에 등장할 적의 약점과 배치를 알아냈다. (다음 전투 적 체력 -15%, 다음 전투 노드 구성 공개)', ops: [{ op: 'scout', pct: 0.15, reveal: 2 }, { op: 'flag', set: 'peddler_met' }] },
        { label: '무시하고 지나간다', result: '"다음에 또 봬요~"', ops: [] },
      ],
    },
    {
      id: 'mirror_hall', title: '거울의 회랑', speaker: '실피', art: 'mirror',
      text: '거울 속의 우리가… 웃고 있어. 손을 뻗으면 무언가 건넬 것 같지만, 반대로 무언가 빼앗길지도 몰라.',
      choices: [
        { label: '거울에 손을 뻗는다 (50%)', result: '', ops: [{ op: 'gamble', chance: 0.5, win: [{ op: 'relic', rarity: 'rare' }], lose: [{ op: 'damageAll', pct: 0.15 }], winText: '거울이 유물을 건넸다!', loseText: '거울이 깨지며 파편이 쏟아졌다. (전체 체력 -15%)' }] },
        { label: '거울을 깨뜨린다', result: '파편 속에서 별조각을 주웠다. (별조각 +12) 깨진 거울 너머로 무언가가 이쪽을 보고 있었다…', ops: [{ op: 'shards', n: 12 }, { op: 'flag', set: 'mirror_broken' }] },
      ],
    },
    {
      id: 'lost_candle', title: '꺼지지 않는 촛불', speaker: '벨라', art: 'candle',
      text: '누군가 남겨 둔 촛불이 아직도 타고 있어요. 이 불씨를 우리 결계에 옮겨 담으면, 마을을 지키는 힘이 될지도 몰라요.',
      choices: [
        { label: '불씨를 결계에 담는다', result: '결계가 단단해졌다.', ops: [{ op: 'life', n: 2 }] },
        { label: '불씨를 마력으로 바꾼다', result: '불꽃이 유물로 굳어졌다.', ops: [{ op: 'relic', rarity: 'common', tag: 'fire' }] },
      ],
    },
    // ---- 확장 사건
    {
      id: 'confessional', title: '고해실', speaker: '아모레', art: 'chapel',
      text: '삐걱이는 고해실 안에서 누군가 속삭여. "짊어진 무거운 것을 내려놓고 가렴…" 우리 저주받은 물건도 받아 줄까?',
      choices: [
        { label: '고백한다', result: '마음이 한결 가벼워졌다.', ops: [{ op: 'removeCurse', fallback: [{ op: 'healAll', pct: 0.15 }] }] },
        { label: '헌금한다 (별조각 8)', require: { shards: 8 }, result: '창살 틈으로 무언가가 건네졌다.', ops: [{ op: 'shards', n: -8 }, { op: 'relic', rarity: 'rare' }] },
        { label: '지나간다', result: '속삭임이 등 뒤에서 멀어졌다.', ops: [] },
      ],
    },
    {
      id: 'clocktower', title: '멈춘 시계탑', speaker: '루나', art: 'clocktower',
      text: '자정에 멈춘 시계탑이야. 태엽 장치가 아직 살아 있어. 고쳐 주면 별들의 흐름이 우리 편이 될지도 몰라.',
      choices: [
        { label: '시계를 고친다 (별조각 8)', require: { shards: 8 }, result: '시계가 다시 째깍이기 시작했다. (다음 3번의 전투 동안 공격력 +10%)', ops: [{ op: 'shards', n: -8 }, { op: 'nextBattles', n: 3, stat: 'atk', pct: 0.1 }] },
        { label: '태엽을 뽑아 간다', result: '반짝이는 태엽은 꽤 값이 나갈 것 같다. (별조각 +10)', ops: [{ op: 'shards', n: 10 }] },
      ],
    },
    {
      id: 'shadow_hound', title: '굶주린 그림자 개', speaker: '로젤', art: 'hound',
      text: '그림자로 된 개가 으르렁거리며 길을 막고 있어. 배가 고픈 모양인데… 어떻게 할까?',
      choices: [
        { label: '먹이를 준다 (물약 1)', require: { potions: 1 }, result: '개가 꼬리를 흔들며 앞장선다. (다음 전투 공격력 +20%)', ops: [{ op: 'potions', n: -1 }, { op: 'nextBattles', n: 1, stat: 'atk', pct: 0.2 }] },
        { label: '쫓아낸다', result: '개는 어둠 속으로 사라졌다.', ops: [] },
        { label: '맞서 싸운다 (50%)', result: '', ops: [{ op: 'gamble', chance: 0.5, win: [{ op: 'shards', n: 14 }], lose: [{ op: 'damageAll', pct: 0.1 }], winText: '개를 쓰러뜨리고 목걸이의 별조각을 얻었다. (별조각 +14)', loseText: '물리긴 했지만 겨우 쫓아냈다. (전체 체력 -10%)' }] },
      ],
    },
    {
      id: 'wishing_well', title: '속삭이는 우물', speaker: '실피', art: 'well',
      text: '우물 바닥에서 별빛이 반짝여. 별조각을 던지면 소원을 들어준대. 많이 던질수록… 더 좋은 소원이 이루어질까?',
      choices: [
        { label: '별조각 5개를 던진다', require: { shards: 5 }, result: '', ops: [{ op: 'wish', amount: 5 }] },
        { label: '별조각 12개를 던진다', require: { shards: 12 }, result: '', ops: [{ op: 'wish', amount: 12 }] },
        { label: '별조각 20개를 던진다', require: { shards: 20 }, result: '', ops: [{ op: 'wish', amount: 20 }] },
        { label: '그냥 지나간다', result: '우물이 조용히 반짝였다.', ops: [] },
      ],
    },
    {
      id: 'ruined_library', title: '무너진 서고', speaker: '실피', art: 'library',
      text: '무너진 서가 사이에 마법서가 흩어져 있어. 우리 마법을 다듬는 방법이 적혀 있을지도.',
      choices: [
        { label: '책을 읽는다', result: '새로운 영창법을 익혔다.', ops: [{ op: 'mod', unit: 'random' }] },
        { label: '책을 불태운다', result: '불꽃 속에서 무언가가 반짝였다. (별조각 +8)', ops: [{ op: 'shards', n: 8 }, { op: 'gamble', chance: 0.4, win: [{ op: 'relic', rarity: 'common', tag: 'fire' }], lose: [], winText: '불씨가 유물로 굳었다!', loseText: '' }] },
        { label: '지나간다', result: '먼지 냄새만 남았다.', ops: [] },
      ],
    },
    {
      id: 'thorn_path', title: '가시 덩굴 길', speaker: '로젤', art: 'roses',
      text: '앞길이 온통 가시 덩굴이야. 억지로 뚫고 갈 수도 있고… 내 장미 마법이라면 길을 열 수도 있겠지.',
      choices: [
        { label: '덩굴을 돌파한다', result: '상처투성이지만 덩굴 속 보물을 찾았다. (전체 체력 -12%, 별조각 +14)', ops: [{ op: 'damageAll', pct: 0.12 }, { op: 'shards', n: 14 }] },
        { label: '로젤의 마법으로 길을 연다', require: { party: 'rozel' }, result: '장미가 길을 비켜 주었다. 덩굴 사이에서 유물을 발견했다.', ops: [{ op: 'relic', rarity: 'any' }] },
        { label: '우회한다', result: '시간은 걸렸지만 무사히 지나왔다.', ops: [] },
      ],
    },
    {
      id: 'peddler_return', title: '인형 행상의 귀환', speaker: '인형 행상', art: 'peddler', when: { flag: 'peddler_met', minCol: 2, weight: 4 },
      text: '"어머, 단골 마법소녀님들! 또 만났네요~ 이번엔 특별히 좋은 조건으로 모실게요."',
      choices: [
        { label: '단골 할인을 받는다', result: '"다음 상점에서 이 쪽지를 보여 주세요~" (다음 상점 가격 -25%)', ops: [{ op: 'discount', pct: 0.25 }] },
        { label: '새 거래를 한다 (별조각 12)', require: { shards: 12 }, result: '물약 2개를 받았다.', ops: [{ op: 'shards', n: -12 }, { op: 'potions', n: 2 }] },
      ],
    },
    {
      id: 'mirror_us', title: '거울 속의 우리', speaker: '실피', art: 'mirror', when: { flag: 'mirror_broken', minCol: 3, weight: 4 },
      text: '깨뜨린 거울의 파편이 우리를 따라왔어. 파편 하나하나에 거울 속의 우리가 비쳐… 강한 힘이 느껴지지만, 불길해.',
      choices: [
        { label: '파편을 줍는다', result: '파편이 차갑게 손에 달라붙었다.', ops: [{ op: 'relic', rarity: 'curse' }] },
        { label: '파편을 묻는다', result: '파편을 묻자 별조각이 솟아났다. (별조각 +10)', ops: [{ op: 'shards', n: 10 }] },
      ],
    },
    {
      id: 'bell_nun', title: '종탑의 수녀', speaker: '벨라', art: 'clocktower',
      text: '종탑 꼭대기에 늙은 수녀님이 계셔요. 우리를 위해 기도해 주시겠대요.',
      choices: [
        { label: '축복을 받는다', result: '몸 깊은 곳에서 힘이 솟는다. (이번 탐사 동안 최대 체력 +8%)', ops: [{ op: 'runBonus', stat: 'hp', pct: 0.08 }] },
        { label: '헌금한다 (별조각 10)', require: { shards: 10 }, result: '종소리가 결계를 감쌌다. (공유 생명 +2)', ops: [{ op: 'shards', n: -10 }, { op: 'life', n: 2 }] },
      ],
    },
    {
      id: 'old_forge', title: '낡은 대장간', speaker: '로젤', art: 'forge',
      text: '불씨가 남은 대장간이야. 무기를 연마할지, 갑옷을 손질할지… 둘 다 할 여유는 없겠네.',
      choices: [
        { label: '무기를 연마한다 (별조각 10)', require: { shards: 10 }, result: '날이 한층 예리해졌다. (이번 탐사 동안 공격력 +5%)', ops: [{ op: 'shards', n: -10 }, { op: 'runBonus', stat: 'atk', pct: 0.05 }] },
        { label: '갑옷을 손질한다 (별조각 10)', require: { shards: 10 }, result: '이음매가 단단해졌다. (이번 탐사 동안 방어력 +6%)', ops: [{ op: 'shards', n: -10 }, { op: 'runBonus', stat: 'def', pct: 0.06 }] },
        { label: '지나간다', result: '대장간의 불이 천천히 꺼져 갔다.', ops: [] },
      ],
    },
    {
      id: 'gambler_ghost', title: '도박꾼 유령', speaker: '인형 행상', art: 'peddler', when: { minCol: 2, unlock: 'u_events' },
      text: '"헤헤, 한 판 어때? 카드 한 장이면 운명이 바뀐다고~ 아니면… 전부 걸어 보든가."',
      choices: [
        { label: '카드 한 장 (별조각 6, 40%)', require: { shards: 6 }, result: '', ops: [{ op: 'shards', n: -6 }, { op: 'gamble', chance: 0.4, win: [{ op: 'relic', rarity: 'rare' }], lose: [], winText: '이겼다! 유령이 유물을 내놓았다.', loseText: '졌다. 유령이 낄낄 웃는다.' }] },
        { label: '올인 (별조각 전부, 최소 15, 50%)', require: { shards: 15 }, result: '', ops: [{ op: 'allShards', mult: 2.5, chance: 0.5 }] },
        { label: '도박은 사양한다', result: '"쳇, 재미없긴~"', ops: [] },
      ],
    },
    {
      id: 'atonement_altar', title: '속죄의 제단', speaker: '벨라', art: 'altar', when: { minCol: 3, minRelics: 3, unlock: 'u_events' },
      text: '제단에 유물을 바치면 더 큰 힘을 내려 준대요. 하지만 무엇을 가져갈지는 제단이 정한대요…',
      choices: [
        { label: '유물을 바친다 (보유 유물 3개 이상)', require: { relics: 3 }, result: '', ops: [{ op: 'sacrificeRelic' }, { op: 'relic', rarity: 'epic' }] },
        { label: '돌아선다', result: '제단의 불빛이 희미해졌다.', ops: [] },
      ],
    },
    {
      id: 'moon_feast', title: '달빛 연회', speaker: '아모레', art: 'feast',
      text: '숲속 요정들이 달빛 연회를 열었어! 같이 즐기자고 초대하는데… 참가비가 있대.',
      choices: [
        { label: '연회를 즐긴다 (별조각 6)', require: { shards: 6 }, result: '맛있는 음식과 노래로 기운을 차렸다. (전체 체력 20% 회복, 다음 전투 방어력 +10%)', ops: [{ op: 'shards', n: -6 }, { op: 'healAll', pct: 0.2 }, { op: 'nextBattles', n: 1, stat: 'def', pct: 0.1 }] },
        { label: '구석에서 혼자 쉰다', result: '조용히 쉬었다. (전체 체력 10% 회복)', ops: [{ op: 'healAll', pct: 0.1 }] },
      ],
    },
    {
      id: 'old_letter', title: '오래된 편지', speaker: '내레이션', art: 'library', when: { maxCol: 4, notFlag: 'letter' },
      text: '길가에 봉인된 편지가 떨어져 있다. 봉인에는 낯선 마법소녀의 문장이 찍혀 있다.',
      choices: [
        { label: '편지를 읽는다', result: '"이 길 끝에서 기다리고 있을게." 누군가의 약속이 적혀 있다.', ops: [{ op: 'flag', set: 'letter' }] },
        { label: '편지를 태운다', result: '봉인 속 별조각만 남았다. (별조각 +8)', ops: [{ op: 'shards', n: 8 }] },
      ],
    },
    {
      id: 'letter_owner', title: '편지의 주인', speaker: '내레이션', art: 'shrine', when: { flag: 'letter', minCol: 4, weight: 6 },
      text: '편지에 적힌 장소에 오래된 성소가 있다. 편지의 주인은 이미 떠났지만, 약속의 선물이 남아 있다.',
      choices: [
        { label: '선물함을 연다', result: '세 개의 유물이 빛나고 있다.', ops: [{ op: 'relicChoice', n: 3, rarity: 'rare' }] },
        { label: '성소에서 수련한다', result: '새로운 영창법을 깨닫고 상처도 아물었다.', ops: [{ op: 'mod', unit: 'random' }, { op: 'healAll', pct: 0.15 }] },
      ],
    },
    {
      id: 'broken_sword', title: '부러진 성검', speaker: '벨라', art: 'altar', when: { minCol: 2, unlock: 'u_events' },
      text: '바위에 부러진 성검이 꽂혀 있어요. 무시무시한 힘이 느껴지지만… 축복이라기보단 저주에 가까워요.',
      choices: [
        { label: '검을 뽑아 간다', result: '검이 손에 착 감겼다. 대가가 따르겠지만.', ops: [{ op: 'relic', rarity: 'curse' }] },
        { label: '그대로 둔다', result: '검 주변에서 별조각을 주웠다. (별조각 +5)', ops: [{ op: 'shards', n: 5 }] },
      ],
    },
    {
      id: 'dew_spring', title: '이슬 맺힌 샘', speaker: '아모레', art: 'well',
      text: '이슬처럼 맑은 샘물이야. 쓰러진 동료도 일으킬 수 있을 것 같은 따뜻한 마력이 느껴져.',
      choices: [
        { label: '샘물을 마신다', result: '', ops: [{ op: 'reviveOne', pct: 0.5, fallback: [{ op: 'healAll', pct: 0.1 }] }] },
        { label: '병에 담아 간다', result: '물약 하나를 만들었다. (물약 +1)', ops: [{ op: 'potions', n: 1 }] },
      ],
    },
    {
      id: 'raider_cart', title: '약탈자의 짐수레', speaker: '로젤', art: 'cart',
      text: '약탈자들이 두고 간 짐수레야. 안에 별조각이 잔뜩 있네. 훔쳐 가면… 녀석들이 가만있지 않겠지.',
      choices: [
        { label: '훔친다', result: '두둑하게 챙겼다. (별조각 +18, 다음 전투 적 체력 +15%)', ops: [{ op: 'shards', n: 18 }, { op: 'ambush', pct: 0.15 }] },
        { label: '마을에 신고한다', result: '마을 사람들이 사례를 했다. (별조각 +6)', ops: [{ op: 'shards', n: 6 }] },
      ],
    },
    {
      id: 'shooting_star', title: '별똥별', speaker: '루나', art: 'stars',
      text: '봐, 별똥별이야! 빨리 소원을 빌자. 딱 하나만이야!',
      choices: [
        { label: '물약을 빈다', result: '하늘에서 물약 두 병이 떨어졌다. (물약 +2)', ops: [{ op: 'potions', n: 2 }] },
        { label: '별조각을 빈다', result: '별의 파편이 쏟아졌다. (별조각 +12)', ops: [{ op: 'shards', n: 12 }] },
        { label: '힘을 빈다 (별조각 8)', require: { shards: 8 }, result: '별빛이 유물로 굳었다.', ops: [{ op: 'shards', n: -8 }, { op: 'relic', rarity: 'rare' }] },
      ],
    },
  ];

  // Recruit lines (영입 사건 전용 대사). {name} = candidate name.
  MG.RECRUIT_LINES = {
    amore: '길을 잃었는데… 다들 다친 것 같네? 내가 같이 가면서 치료해 줄게!',
    luna: '별들이 말해 줬어. 오늘 밤 여기서 동료를 만난다고.',
    sylphy: '나비들이 너희를 따라가래. …나도 그러고 싶어.',
    rozel: '흥, 혼자서도 충분하지만… 너희가 너무 약해 보여서 말이야.',
    bella: '종소리가 이끄는 곳으로 왔더니 여러분이 계셨어요. 함께해도 될까요?',
    cheongryeon: '수련 상대를 찾고 있었어. 너희와 함께라면 지루하지 않겠네.',
    serin: '…얼어붙은 길을 혼자 걷는 건 이제 질렸어. 데려가.',
    noa: '공허가 시끄러워. 너희 옆이라면 조금 조용해질 것 같아.',
    elysia: '하늘에서 내려다보니 위태로워 보였어요. 날개를 빌려드릴게요.',
    cecilia: '주님께서 당신들을 지키라 하셨습니다. …주먹으로요.',
    nero: '냐, 맛있는 냄새가 나서 따라왔어. 같이 가도 되지?',
  };

  MG.REST_OPTIONS = [
    { id: 'rest', label: '모닥불 곁에서 쉰다', desc: '쓰러지지 않은 모든 아군 체력 {rest}% 회복' },
    { id: 'revive', label: '쓰러진 동료를 간호한다', desc: '쓰러진 아군 1명을 체력 50%로 일으킵니다 (없으면 가장 다친 아군 완전 회복)' },
    { id: 'sharpen', label: '마력을 가다듬는다', desc: '물약 1개 획득, 별조각 +6' },
  ];
})();
