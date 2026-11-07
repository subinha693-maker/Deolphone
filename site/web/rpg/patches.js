/*
 * 흰 공간 원본에 대한 수정 (원본 HTML 은 그대로 두고 여기서 덮어쓴다)
 * ------------------------------------------------------------
 * 이름 규칙
 *   - 주인공의 이름표 · 상태창 · 전투 화면에는 항상 「클레어」가 뜬다.
 *   - 플레이어가 입력한 이름은 메이어가 「(이름)님」 이라고 부를 때만 쓰인다.
 */
window.WS = window.WS || {};
(function () {
  const HERO = (WS.CHARACTERS.hero && WS.CHARACTERS.hero.displayName) || '클레어';
  WS.RPG = WS.RPG || {};
  WS.RPG.HERO_NAME = HERO;

  // 1) 대사창 이름표: 주인공은 언제나 「클레어」 (??? 로 가린 경우는 그대로)
  const say = WS.Dialogue.prototype.say;
  WS.Dialogue.prototype.say = function (speakerName, text) {
    const r = say.call(this, speakerName, text);
    const sp = WS.parseSpeaker(speakerName);
    if (sp.id === 'hero' && sp.display !== '???' && !this.el.name.classList.contains('empty')) this.el.name.textContent = HERO;
    return r;
  };

  // 2) 상태창 이름
  const openStatus = WS.UI.prototype.openStatus;
  WS.UI.prototype.openStatus = function () {
    openStatus.call(this);
    const h = this.statusEl.querySelector('.st-info h3');
    if (h) h.textContent = HERO;
  };

  // 3) 대사: 메이어가 부르는 「{player.name}님」 외에는 플레이어 이름을 쓰지 않는다
  const fix = (key, pairs) => {
    if (!WS.SCRIPTS[key]) return;
    for (const [a, b] of pairs) {
      if (WS.SCRIPTS[key].includes(a)) WS.SCRIPTS[key] = WS.SCRIPTS[key].replace(a, b);
      else console.warn('[patch] 대사를 찾지 못했습니다:', key, a);
    }
  };
  fix('whiteSpace', [
    ['……{player.name:이에요/예요}.', '…….'],
    ['{player.name}. 좋은 이름이네요.', '좋은 이름이네요.'],
  ]);
  fix('heroRoom', [
    ['{player.name:이/가} 가장 알고 싶어 하는 질문', `${HERO}가 가장 알고 싶어 하는 질문`],
  ]);
  // 4) Phase 4-A: 주인공의 방 브리핑 교체
  //    "=== mayer_brief" 안의 "// ---------- 1." 부터 "@end 밖으로 나간다" 까지를
  //    story/mayer_brief_continue.txt (맨 위 안내 주석 블록 제외) 로 바꾼다. 대사는 한 글자도 고치지 않는다.
  //    기존 원고의 [연출 추가] 명령은 같은 대사 앞뒤로 옮겨 넣는다.
  //    끝의 "@end 밖으로 나간다" → 방 장면의 next('world', scene.js) → 들바람 마을 거리(주인공의 집 문 앞).
  (function replaceBriefing() {
    const src = WS.SCRIPTS.heroRoom, story = WS.STORY && WS.STORY.mayerBrief;
    if (!src || !story) return console.warn('[patch] 브리핑 원고가 없습니다');
    const START = '// ---------- 1.', END = '@end 밖으로 나간다';
    const sec = src.indexOf('=== mayer_brief\n');
    const a = src.indexOf(START, sec), b = src.indexOf(END, a);
    const s0 = story.indexOf(START), s1 = story.indexOf(END, s0);
    if (sec < 0 || a < 0 || b < 0 || s0 < 0 || s1 < 0) return console.warn('[patch] 브리핑 교체 위치를 찾지 못했습니다');
    let body = story.slice(s0, s1 + END.length);

    // [연출 추가] — 기존 원고에 있던 위치 그대로 (anchor 줄 앞 / 뒤에 끼운다)
    const MOVES = [
      { line: '“예언에 따르면, 이 세계는 앞으로 30일 뒤에 멸망합니다.”',
        before: ['// [연출 추가] 멸망 고지 직전: 카메라가 메이어를 비추고 클로즈업', '@camera mayer 600', '@closeup 메이어'],
        after: ['// [연출 추가] 고지가 끝나면 클로즈업 해제, 카메라를 클레어에게', '@closeup off', '@camera player 400'] },
      { line: '“답답한 정도가 아니에요!”', before: ['// [연출 추가]', '@emote player !'] },
      { line: '[클레어:한숨]\n“……하, 하하.”', before: ['// [연출 추가]', '@emote player …'] },
      { line: '“미레유님께서 예언하신 내용입니다.”',
        before: ['// [연출 추가] 미레유의 이름 직전 한 박자 쉬고 메이어를 비춤', '@silence 1000', '@camera mayer 500'],
        after: ['// [연출 추가] 카메라를 클레어에게', '@camera player 400'] },
      { line: '@event briefing', before: ['// [연출 추가] 장면을 나가기 전 여운', '@wait 1200'] },
    ];
    for (const m of MOVES) {
      const i = body.indexOf(m.line);
      if (i < 0 || body.indexOf(m.line, i + 1) >= 0) { console.warn('[patch] 연출 위치를 찾지 못했습니다:', m.line); continue; }
      const pre = m.before ? m.before.join('\n') + '\n' : '', post = m.after ? '\n' + m.after.join('\n') : '';
      body = body.slice(0, i) + pre + m.line + post + body.slice(i + m.line.length);
    }
    let out = src.slice(0, a) + body + src.slice(b + END.length);

    // mayer_again: 브리핑(첫 임무)을 들은 뒤 방에 돌아와 말을 걸었을 때
    const ma = out.indexOf('=== mayer_again\n'), mb = out.indexOf('\n=== ', ma + 5);
    if (ma >= 0 && mb > ma) {
      out = out.slice(0, ma) + [
        '=== mayer_again',
        '// ※ 임시 대사: 브리핑(첫 임무)을 들은 뒤 방에서 다시 말을 걸었을 때',
        '[메이어:미소]',
        '“돌아오셨군요. 몸은 괜찮으신가요?”',
        '[메이어:설명]',
        '“첫 임무는 동쪽 침묵 숲의 마수입니다. 숲의 마물들과 싸우며 먼저 힘을 길러 주세요.”',
        '[메이어:온화]',
        '“지치셨다면 침대에서 쉬어 가셔도 괜찮습니다. 저는 여기 있겠습니다.”',
        '',
      ].join('\n') + out.slice(mb);
    } else console.warn('[patch] mayer_again 을 찾지 못했습니다');
    WS.SCRIPTS.heroRoom = out;
  })();

  // 5) Phase 4-B: 우주적 존재 3명의 대본 (story/meetings_1st_loop.txt 그대로)
  if (WS.STORY && WS.STORY.meetings) WS.SCRIPTS.meetings = WS.STORY.meetings;
})();
