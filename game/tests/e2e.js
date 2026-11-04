/*
 * 흰 공간 프롤로그 자동 테스트 (Playwright + Chromium)
 *   node tests/e2e.js            (game 폴더 또는 아무 곳에서)
 *   SHOTS=폴더 node tests/e2e.js   → 스크린샷 저장
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = process.env.SHOTS || '';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

async function openGame(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  // 표시된 대사를 순서대로 기록
  await page.evaluate(() => {
    window.__said = [];
    const d = WS.game.ui.dialogue;
    const orig = d.say.bind(d);
    d.say = (sp, text) => { window.__said.push(text); return orig(sp, text); };
  });
  await page.click('#start-gate');
  return { page, errors };
}

const tapStage = (page) => page.evaluate(() => document.getElementById('game').click());
const isShown = (page, sel) => page.evaluate(s => document.querySelector(s).classList.contains('show'), sel);

/** 페이지 안에서 대사를 빠르게 넘기며 cond 가 참이 될 때까지 진행 (선택지 · 입력 창에서는 멈춤) */
async function ff(page, cond, maxMs = 90000) {
  return page.evaluate(async ([src, maxMs]) => {
    const cond = new Function('return (' + src + ')()');
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      if (cond()) return true;
      const d = WS.game.ui.dialogue;
      if (WS.game.ui.modalOpen) { await new Promise(r => setTimeout(r, 40)); continue; }
      if (d.mode === 'typing') d.finishTyping();
      else if (d.mode === 'waiting' && performance.now() - d.completedAt > 95) d.advance();
      await new Promise(r => setTimeout(r, 20));
    }
    return cond();
  }, [cond.toString(), maxMs]);
}

/** 이름 입력 창에 이름을 쓰고 확정 */
async function fillName(page, name) {
  await page.waitForFunction(() => document.querySelector('#name-input').classList.contains('show'));
  await page.fill('#ni-field', name);
  await page.click('.ni-ok');
  await page.waitForTimeout(350);
  await page.click('.cf-yes');
  await page.waitForTimeout(250);
}

/** 조건이 될 때까지 화면을 탭해 대사 진행 (이름 입력이 나오면 '클레어' 입력) */
async function advanceUntil(page, cond, maxTaps = 200) {
  for (let i = 0; i < maxTaps; i++) {
    if (await page.evaluate(cond)) return true;
    if (await page.evaluate(() => document.querySelector('#name-input').classList.contains('show') && !document.querySelector('#confirm').classList.contains('show'))) {
      await fillName(page, '클레어');
      continue;
    }
    await tapStage(page);
    await page.waitForTimeout(60);
  }
  return page.evaluate(cond);
}

async function playthrough(browser, jobId, viewport, opts = {}) {
  const { page, errors } = await openGame(browser, viewport);
  const tag = `[${jobId} ${viewport.width}x${viewport.height}]`;

  await page.waitForTimeout(800);
  const startWhite = await page.evaluate(() => WS.game.stage.whiteout > 0.5);
  check(`${tag} 흰 화면에서 시작 + 페이드인`, startWhite);

  const reached = await advanceUntil(page, () => WS.game.ui.jobSelect.isOpen, 400);
  check(`${tag} 직업 선택 화면 도달`, reached);
  await shot(page, `${jobId}-1-jobselect-empty`);

  // 선택 없이 진행 불가
  const pcBefore = await page.evaluate(() => WS.game.runner.pc);
  for (let i = 0; i < 15; i++) { await tapStage(page); await page.keyboard.press('Space'); }
  const stillOpen = await page.evaluate(() => WS.game.ui.jobSelect.isOpen && WS.game.state.player.jobId === null);
  const pcAfter = await page.evaluate(() => WS.game.runner.pc);
  check(`${tag} 직업 선택 전 탭/키 입력으로 진행되지 않음`, stillOpen && pcBefore === pcAfter);
  const acceptDisabled = await page.evaluate(() => document.querySelector('.js-accept').disabled);
  check(`${tag} 직업을 고르기 전 확정 버튼 비활성`, acceptDisabled);

  await page.waitForTimeout(400);
  // 다른 직업 상세를 먼저 열어 본 뒤 목표 직업 선택 (상세 확인 기능)
  const other = jobId === 'morganite' ? 'aquamarine' : 'morganite';
  await page.click(`.job-item[data-job="${other}"]`);
  const otherShown = await page.evaluate(n => document.querySelector('.js-detail h3').textContent.includes(n), await page.evaluate(id => WS.getJob(id).name, other));
  check(`${tag} 직업 상세 정보 표시`, otherShown);
  await page.click(`.job-item[data-job="${jobId}"]`);
  await shot(page, `${jobId}-2-jobselect-detail`);

  // 확인 창 → 취소
  await page.click('.js-accept');
  await page.waitForTimeout(350);
  await shot(page, `${jobId}-3-confirm`);
  await page.click('.cf-no');
  await page.waitForTimeout(100);
  const afterCancel = await page.evaluate(() => WS.game.ui.jobSelect.isOpen && WS.game.state.player.jobId === null);
  check(`${tag} 확인 창에서 취소하면 선택이 확정되지 않음`, afterCancel);

  // 확정
  await page.click('.js-accept');
  await page.waitForTimeout(350);
  await page.click('.cf-yes');
  await page.waitForTimeout(200);
  const jobSet = await page.evaluate(() => WS.game.state.player.jobId);
  check(`${tag} 직업 확정이 게임 상태에 반영`, jobSet === jobId, jobSet);

  // 각성 연출 중 스크린샷
  await page.waitForTimeout(650);
  await shot(page, `${jobId}-4-awaken-flash`);
  await page.waitForTimeout(1300);
  const aw = await page.evaluate(() => ({
    abilities: WS.game.state.player.abilities.map(a => a.id),
    awakened: WS.game.state.player.awakened,
    form: WS.game.stage.heroForm,
    expected: WS.getJob(WS.game.state.player.jobId).initialAbilities,
  }));
  check(`${tag} 각성 후 직업 능력 등록`, aw.awakened && JSON.stringify(aw.abilities) === JSON.stringify(aw.expected), aw.abilities.join(','));
  check(`${tag} 직업에 맞는 각성 외형/연출`, aw.form === jobId);
  await shot(page, `${jobId}-5-after-awaken`);

  // 상태창에서 직업 확인
  await page.waitForTimeout(300);
  await page.click('#btn-status');
  const statusOk = await page.evaluate(id => document.querySelector('#status').classList.contains('show') &&
    document.querySelector('#status .st-job').textContent.includes(WS.getJob(id).name), jobId);
  check(`${tag} 각성 후 상태창에서 직업 확인 가능`, statusOk);
  await shot(page, `${jobId}-6-status`);
  await page.click('.st-close');

  // 끝까지 진행
  const endShown = await advanceUntil(page, () => !!document.querySelector('.choices.end.show button:not([disabled])'), 300);
  check(`${tag} 장면 종료 버튼 표시`, endShown);
  await shot(page, `${jobId}-7-end`);
  for (let i = 0; i < 10; i++) await tapStage(page);
  const notYet = await page.evaluate(() => WS.game.state.sceneId === 'whiteSpace');
  check(`${tag} 종료 버튼은 일반 탭으로 넘어가지 않음`, notYet);
  await page.click('.choices.end button');
  await page.waitForTimeout(1900);
  const next = await page.evaluate(() => ({ scene: WS.game.state.sceneId, cur: WS.game.scenes.current, map: WS.game.stage.view instanceof WS.MapView, job: WS.game.state.player.jobId, spr: WS.game.stage.view && WS.game.stage.view.player.sprite }));
  check(`${tag} 종료 버튼 → 주인공의 방으로 이어짐 (직업 · 의상 유지)`, next.scene === 'heroRoom' && next.cur === 'heroRoom' && next.map && next.job === jobId && next.spr === jobId, JSON.stringify(next));
  await shot(page, `${jobId}-8-next`);

  // 대사 순서
  const said = await page.evaluate(() => window.__said);
  const expected = await page.evaluate(() => WS.parseScript(WS.SCRIPTS.whiteSpace).nodes.filter(n => n.type === 'say').map(n => WS.game.runner.interpolate(n.text)));
  check(`${tag} 모든 대사가 올바른 순서로 출력 (${said.length}줄)`, JSON.stringify(said) === JSON.stringify(expected));

  check(`${tag} 콘솔 오류 없음`, errors.length === 0, errors.join(' | '));
  return page;
}

(async () => {
  const browser = await chromium.launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  // 1) 직업 5종 전체 플레이 (스마트폰 가로)
  const jobs = ['morganite', 'aquamarine', 'amethyst', 'ruby', 'heliodor'];
  let lastPage;
  for (const j of jobs) {
    if (lastPage) await lastPage.close();
    lastPage = await playthrough(browser, j, { width: 844, height: 390 });
  }

  // 2) 다시 시작 시 이전 선택값 초기화
  {
    const page = lastPage;
    await page.click('#btn-restart'); await page.waitForTimeout(350); await page.click('.cf-yes');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({
      job: WS.game.state.player.jobId, ab: WS.game.state.player.abilities.length, aw: WS.game.state.player.awakened,
      form: WS.game.stage.heroForm, heroJob: WS.game.stage.heroJob, mir: WS.game.stage.mireilleAlpha,
      modal: WS.game.ui.modals, scene: WS.game.state.sceneId, statusDisabled: document.querySelector('#btn-status').disabled,
    }));
    check('처음부터 다시: 직업/능력/외형/상태 초기화', s.job === null && s.ab === 0 && !s.aw && s.form === null && s.heroJob === null && s.mir === 0 && s.modal === 0 && s.scene === 'whiteSpace' && s.statusDisabled, JSON.stringify(s));
    const reached = await advanceUntil(page, () => WS.game.ui.jobSelect.isOpen, 400);
    check('처음부터 다시: 직업 선택까지 다시 진행 가능', reached);
    // 진행 도중 (선택 화면) 처음부터
    await page.click('#btn-restart');
    await page.waitForTimeout(300);
    await page.click('.cf-yes');
    await page.waitForTimeout(200);
    const s2 = await page.evaluate(() => ({ open: WS.game.ui.jobSelect.isOpen, modal: WS.game.ui.modals, job: WS.game.state.player.jobId }));
    check('직업 선택 도중 처음부터: 선택 화면 닫히고 초기화', !s2.open && s2.modal === 0 && s2.job === null, JSON.stringify(s2));
    await page.close();
  }

  // 2-b) 이름 입력: 안내자의 질문 → 직접 입력, 진행 차단, 검사, 이름표 · 대사 치환
  {
    const { page, errors } = await openGame(browser, { width: 844, height: 390 });
    const reached = await (async () => {
      for (let i = 0; i < 200; i++) {
        if (await page.evaluate(() => document.querySelector('#name-input').classList.contains('show'))) return true;
        await tapStage(page); await page.waitForTimeout(60);
      }
      return false;
    })();
    const q = await page.evaluate(() => window.__said.slice(-1)[0]);
    check('이름 입력: 안내자가 이름을 묻고 입력 창이 열림', reached && q.includes('이름은'), q);
    await page.waitForTimeout(400);
    for (let i = 0; i < 10; i++) { await page.mouse.click(420, 120); }
    const blocked = await page.evaluate(() => document.querySelector('#name-input').classList.contains('show') && WS.game.state.player.name === null);
    check('이름 입력: 입력 전에는 화면을 눌러도 진행되지 않음', blocked);
    await page.click('.ni-ok');
    const err = await page.textContent('.ni-err');
    check('이름 입력: 빈 이름은 안내 문구와 함께 거부', err.includes('입력해'), err);
    await page.fill('#ni-field', '하늘');
    await page.click('.ni-ok'); await page.waitForTimeout(350);
    await page.click('.cf-no'); await page.waitForTimeout(250);
    const still = await page.evaluate(() => document.querySelector('#name-input').classList.contains('show') && WS.game.state.player.name === null);
    check('이름 입력: 확인 창에서 "다시 쓸래요" → 다시 입력', still);
    await page.fill('#ni-field', '하늘');
    await page.click('.ni-ok'); await page.waitForTimeout(350);
    await page.click('.cf-yes'); await page.waitForTimeout(600);
    await tapStage(page); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ name: WS.game.state.player.name, said: window.__said.slice(-1)[0], plate: document.querySelector('.dlg-name').textContent }));
    check('이름 입력: 이름이 게임 상태에 저장되고 조사까지 맞춰 대사에 반영 ("……하늘이에요.")', r.name === '하늘' && r.said === '……하늘이에요.' && r.plate === '하늘', JSON.stringify(r));
    await advanceUntil(page, () => document.querySelector('.dlg-name').textContent === '미레유' && WS.game.ui.dialogue.mode === 'waiting', 20);
    const r2 = await page.evaluate(() => window.__said.slice(-1)[0]);
    check('이름 입력: 안내자가 정한 이름을 부름', r2.startsWith('하늘.'), r2);
    check('이름 입력: 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 3) 대사 빠르게 넘기기 (연타)
  {
    const { page, errors } = await openGame(browser, { width: 844, height: 390 });
    for (let i = 0; i < 400; i++) { await tapStage(page); if (i % 3 === 0) await page.keyboard.press('Enter'); }
    await page.waitForTimeout(200);
    const reached = await advanceUntil(page, () => WS.game.ui.jobSelect.isOpen, 600);
    check('연타: 직업 선택 화면에서 정상적으로 멈춤', reached);
    await page.waitForTimeout(400);
    await page.click('.job-item[data-job="amethyst"]');
    await page.click('.js-accept'); await page.waitForTimeout(300); await page.click('.cf-yes');
    // 각성 연출 중 연타
    for (let i = 0; i < 100; i++) await tapStage(page);
    await page.waitForTimeout(1800);
    const ok = await page.evaluate(() => WS.game.state.player.abilities.length === 1 && WS.game.state.player.abilities[0].id === 'crescent_fall');
    check('연타: 각성 중 연타해도 능력 1개만 정확히 등록', ok);
    const end = await advanceUntil(page, () => !!document.querySelector('.choices.end.show'), 600);
    check('연타: 끝까지 오류 없이 진행', end && errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 3-b) 일반 선택지(@choice): 탭으로 넘어가지 않고, 고른 라벨로 분기, 조건부 보기 숨김
  {
    const { page, errors } = await openGame(browser, { width: 844, height: 390 });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__done = WS.game.runner.run(`[주인공]
질문
@choice test_q
- 첫째 -> a
- 둘째 -> b
- 숨김 -> a @if secondLoop
@endchoice
@label a
[주인공]
A로 옴
@goto end
@label b
[주인공]
B로 옴
@label end`);
    });
    await advanceUntil(page, () => !!document.querySelector('.choices.show'), 50);
    await page.waitForTimeout(400);
    for (let i = 0; i < 20; i++) { await tapStage(page); await page.keyboard.press('Space'); }
    const st = await page.evaluate(() => ({ n: document.querySelectorAll('.choices button').length, mode: WS.game.ui.dialogue.mode }));
    check('일반 선택지: 탭/키로 넘어가지 않음, 조건 미충족 보기 숨김', st.mode === 'choice' && st.n === 2, JSON.stringify(st));
    await page.click('.choices button:nth-child(2)');
    await page.waitForTimeout(500);
    const said = await page.evaluate(() => window.__said.slice(-1)[0]);
    const rec = await page.evaluate(() => WS.game.state.choices.test_q);
    check('일반 선택지: 고른 보기로 분기 + 상태 기록', said === 'B로 옴' && rec === 1, said);
    check('일반 선택지: 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 3-c) 장면 분리: 별도로 등록한 새 장면이 이어 붙고, 직업·능력 상태가 넘어가며, 배경을 바꿀 수 있다
  {
    const { page, errors } = await openGame(browser, { width: 844, height: 390 });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      WS.SCRIPTS.testScene = '[주인공]\n{job.name} 으로 도착\n\n@end 계속 -> chapter1';
      WS.defineScriptScene('testScene', {
        script: 'testScene', next: 'chapter1', props: false,
        backdrop(ctx, W, H) { ctx.fillStyle = '#f6c9a8'; ctx.fillRect(0, 0, W, H); },
      });
      // 흰 공간의 다음 장면을 새 장면으로 바꿔 끼운다
      WS.SCENES.whiteSpace.next = 'testScene';
    });
    await advanceUntil(page, () => WS.game.ui.jobSelect.isOpen, 400);
    await page.waitForTimeout(400);
    await page.click('.job-item[data-job="ruby"]');
    await page.click('.js-accept'); await page.waitForTimeout(300); await page.click('.cf-yes');
    const end = await advanceUntil(page, () => !!document.querySelector('.choices.end.show button:not([disabled])'), 400);
    await page.click('.choices.end button');
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => ({
      scene: WS.game.state.sceneId, cur: WS.game.scenes.current,
      job: WS.game.state.player.jobId, ab: WS.game.state.player.abilities.map(a => a.id),
      props: WS.game.stage.props, hasBackdrop: !!WS.game.stage.backdrop, whiteout: WS.game.stage.whiteout,
      said: window.__said.slice(-1)[0],
    }));
    check('장면 분리: 새로 등록한 장면으로 이동 (-> 생략, 장면 정의의 next 사용)', end && r.scene === 'testScene' && r.cur === 'testScene', JSON.stringify(r));
    check('장면 분리: 직업·능력 상태가 다음 장면으로 이어짐 + 대사 치환', r.job === 'ruby' && r.ab[0] === 'thorn_waltz' && r.said === '로즈 루비 으로 도착', r.said);
    check('장면 분리: 장면별 배경 · 소품 설정 적용, 페이드인 중복 없음', r.props === false && r.hasBackdrop && r.whiteout === 0);
    await advanceUntil(page, () => !!document.querySelector('.choices.end.show button:not([disabled])'), 100);
    await page.click('.choices.end button');
    await page.waitForTimeout(2000);
    const back = await page.evaluate(() => WS.game.scenes.current);
    check('장면 분리: 연달아 장면 이동 (새 장면 → chapter1)', back === 'chapter1');
    await page.click('.ns-restart'); await page.waitForTimeout(400);
    const rs = await page.evaluate(() => ({ cur: WS.game.scenes.current, props: WS.game.stage.props, bd: !!WS.game.stage.backdrop, job: WS.game.state.player.jobId }));
    check('장면 분리: 처음부터 다시 시 흰 공간 · 기본 배경으로 복귀', rs.cur === 'whiteSpace' && rs.props && !rs.bd && rs.job === null, JSON.stringify(rs));
    check('장면 분리: 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 4) 화면 크기별 UI 잘림 검사
  const viewports = [
    { width: 667, height: 375, name: '소형 폰 가로' },
    { width: 844, height: 390, name: '폰 가로' },
    { width: 932, height: 430, name: '대형 폰 가로' },
    { width: 1024, height: 768, name: '태블릿 가로' },
    { width: 1180, height: 820, name: '태블릿 가로(대)' },
    { width: 768, height: 1024, name: '태블릿 세로' },
    { width: 1920, height: 1080, name: 'PC' },
  ];
  for (const vp of viewports) {
    const { page, errors } = await openGame(browser, vp);
    const tag = `[${vp.name} ${vp.width}x${vp.height}]`;
    // 모든 대사를 하나씩 넣어 대화창 검사 (잘림, 빈 높이)
    await page.waitForTimeout(3200);
    await page.evaluate(() => WS.game.runner.stop());
    await page.waitForTimeout(450);
    const dlg = await page.evaluate(() => {
      const room = WS.splitSections(WS.SCRIPTS.heroRoom);
      const lines = [WS.SCRIPTS.whiteSpace, ...Object.values(room)]
        .flatMap(src => WS.parseScript(src).nodes.filter(n => n.type === 'say'));
      const d = WS.game.ui.dialogue;
      const bad = [];
      for (const ln of lines) {
        d.say(ln.speaker, ln.text); d.finishTyping();
        const t = document.querySelector('.dlg-text');
        const r = document.querySelector('.dlg').getBoundingClientRect();
        const inside = r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0;
        if (!inside || t.scrollHeight > t.clientHeight + 1 || t.clientHeight === 0) bad.push(ln.text);
      }
      const longest = lines.reduce((a, b) => (b.text.length > a.text.length ? b : a));
      d.say(longest.speaker, longest.text); d.finishTyping();
      return { bad, fs: getComputedStyle(document.querySelector('.dlg-text')).fontSize };
    });
    check(`${tag} 대화창이 화면 안에 있고 모든 대사가 잘리지 않음`, dlg.bad.length === 0, `글자 ${dlg.fs} ${dlg.bad.join(' / ')}`);
    await shot(page, `vp-${vp.width}x${vp.height}-dialogue`);

    // 직업 선택창
    await page.evaluate(() => { WS.game.ui.dialogue.hide(); WS.game.ui.jobSelect.open(WS.game.meta, WS.game.state); });
    await page.waitForTimeout(500);
    await page.click('.job-item[data-job="heliodor"]');
    await page.waitForTimeout(150);
    const js = await page.evaluate(() => {
      const inView = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; };
      return {
        panel: inView(document.querySelector('.js-panel')),
        accept: inView(document.querySelector('.js-accept')),
        items: [...document.querySelectorAll('.job-item')].length,
        art: document.querySelector('.jd-art img').getBoundingClientRect().height,
      };
    });
    check(`${tag} 직업 선택창이 화면 안에 들어오고 확정 버튼이 보임`, js.panel && js.accept && js.items === 5 && js.art > 60, JSON.stringify(js));
    await shot(page, `vp-${vp.width}x${vp.height}-jobselect`);
    if (vp.width < vp.height && vp.width <= 600) {
      const rot = await page.evaluate(() => getComputedStyle(document.getElementById('rotate-hint')).display);
      check(`${tag} 세로 폰에서 가로 회전 안내`, rot === 'flex');
    }
    check(`${tag} 콘솔 오류 없음`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 5) 세로 폰: 회전 안내
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL);
    const rot = await page.evaluate(() => getComputedStyle(document.getElementById('rotate-hint')).display);
    check('[세로 폰 390x844] 가로로 돌려 달라는 안내 표시', rot === 'flex');
    await page.close();
  }

  // 6) 주인공의 방 (단독 실행)
  for (const vp of [{ width: 844, height: 390 }, { width: 1180, height: 820 }]) {
    const tag = `[방 ${vp.width}x${vp.height}]`;
    const page = await browser.newPage({ viewport: vp });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto(URL + '#room');
    await page.evaluate(() => {
      window.__said = []; window.__portraits = [];
      const d = WS.game.ui.dialogue;
      const orig = d.say.bind(d);
      d.say = (sp, text) => { window.__said.push(text); const r = orig(sp, text); window.__portraits.push(d.el.portraitImg.getAttribute('src')); return r; };
      window.__closeup = false;
      const oc = WS.game.ui.closeup.bind(WS.game.ui);
      WS.game.ui.closeup = id => { if (id) window.__closeup = true; return oc(id); };
    });
    await page.click('#start-gate p');
    await page.waitForTimeout(600);
    const start = await page.evaluate(() => ({ scene: WS.game.scenes.current, job: WS.game.state.player.jobId, aw: WS.game.state.player.awakened, pose: WS.game.stage.view.player.pose, fade: WS.game.stage.whiteout }));
    check(`${tag} 단독 실행: 방 장면 + 테스트 상태(직업·각성) + 어둠에서 시작`, start.scene === 'heroRoom' && start.job && start.aw && start.pose === 'lying' && start.fade > 0.5, JSON.stringify(start));
    const view = () => 'WS.game.stage.view';
    const explore = await advanceUntil(page, () => WS.game.stage.view.mode === 'explore', 600);
    const op = await page.evaluate(() => {
      const src = WS.splitSections(WS.SCRIPTS.heroRoom).opening;
      const expected = WS.parseScript(src).nodes.filter(n => n.type === 'say').map(n => WS.game.runner.interpolate(n.text));
      return {
        ok: JSON.stringify(window.__said) === JSON.stringify(expected), n: expected.length,
        // 각성 후라 클레어는 직업별(변신 후) 표정을 쓴다 (#room 기본 직업 = morganite)
        claire: window.__portraits.filter(p => p && /(claire|morganite)_/.test(p)).length,
        mayer: window.__portraits.filter(p => p && p.includes('mayer_')).length,
        closeup: window.__closeup, ev: WS.game.state.scenes.heroRoom.events.opening,
        dlg: document.querySelector('.dlg').classList.contains('show'),
        p: WS.game.state.position, mayerAlpha: WS.game.stage.view.npcs.mayer.alpha,
      };
    });
    check(`${tag} 시작 연출 · 첫 대화가 순서대로 진행 (${op.n}줄) → 자유 조사 모드`, explore && op.ok && op.ev && !op.dlg, JSON.stringify(op));
    check(`${tag} 표정 초상화(클레어 · 메이어) · 클로즈업 · 메이어 등장 연출`, op.claire > 5 && op.mayer > 5 && op.closeup && op.mayerAlpha === 1);
    check(`${tag} 이름 치환: "반갑습니다, 클레어님."`, await page.evaluate(() => window.__said.includes('“반갑습니다, 클레어님.”')));

    // 조사 표시: 조사 가능한 대상에만
    const marks = await page.evaluate(() => WS.game.stage.view.markerTargets().map(m => m.id).sort());
    check(`${tag} 조사 표시는 조사 가능한 대상에만 (장식 화분 제외)`, JSON.stringify(marks) === JSON.stringify(['bed', 'bookshelf', 'desk', 'door', 'mayer', 'mirror', 'window']), marks.join(','));

    // 이동 + 충돌
    const pos = () => page.evaluate(() => ({ x: WS.game.stage.view.player.x, y: WS.game.stage.view.player.y }));
    const press = async (key, ms = 260) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(280); };
    const p0 = await pos();
    await press('ArrowLeft');
    const p1 = await pos();
    check(`${tag} 충돌: 침대 쪽(왼쪽)으로는 이동 불가`, p0.x === 2 && p1.x === 2 && p1.y === p0.y, JSON.stringify([p0, p1]));
    await press('ArrowRight', 90);
    const p2 = await pos();
    check(`${tag} 이동: 방향키로 한 칸 이동 + 위치가 게임 상태에 저장`, p2.x === 3 && (await page.evaluate(() => WS.game.state.position.x)) === 3, JSON.stringify(p2));
    await press('ArrowUp', 1500);
    const p3 = await pos();
    check(`${tag} 충돌: 벽 앞에서 멈춤`, p3.y === 2, JSON.stringify(p3));
    await press('ArrowDown', 3000);
    const p4 = await pos();
    check(`${tag} 충돌: 아래쪽 벽 앞에서 멈춤`, p4.y === 6, JSON.stringify(p4));

    // 조이스틱: 마우스로 끌어 이동 → 놓으면 멈춤
    const padShown = await page.evaluate(() => document.querySelector('#pad').classList.contains('show'));
    check(`${tag} 탐색 중에 조이스틱 · 조사 버튼 표시`, padShown);
    const box = await page.locator('.pad-base').boundingBox();
    const pj = await pos();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - box.height * 0.4, { steps: 3 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const pj2 = await pos();
    await page.waitForTimeout(400);
    const pj3 = await pos();
    check(`${tag} 조이스틱 위로 → 위로 이동, 손을 떼면 멈춤`, pj2.y < pj.y && pj2.x === pj.x && pj3.y === pj2.y, JSON.stringify([pj, pj2, pj3]));
    // 떠다니는 조이스틱: 왼쪽 영역의 다른 곳을 눌러도 그 자리에서 조작
    const zone = await page.locator('.pad-zone').boundingBox();
    const pf = await pos();
    const fx = zone.x + zone.width * 0.6, fy = zone.y + zone.height * 0.45;
    await page.mouse.move(fx, fy); await page.mouse.down();
    await page.mouse.move(fx + 60, fy + 4, { steps: 3 });
    await page.waitForTimeout(260); await page.mouse.up(); await page.waitForTimeout(400);
    const pf2 = await pos();
    check(`${tag} 떠다니는 조이스틱: 왼쪽 영역 아무 곳에서나 끌어 이동`, pf2.x > pf.x && pf2.y === pf.y, JSON.stringify([pf, pf2]));
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(150); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(400);
    // 아래쪽 화면(숨은 대화창 자리)이 터치를 막지 않는지
    const hit = await page.evaluate(() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight - 30); return el && el.closest('.dlg') ? 'dlg' : el && el.id; });
    check(`${tag} 대화창이 숨어 있을 때 화면 아래쪽을 가로채지 않음`, hit !== 'dlg', hit);
    // 카펫 아래 칸까지 조이스틱으로 이동
    const dragTo = async (dx, dy, ms) => {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx * box.width * 0.4, box.y + box.height / 2 + dy * box.height * 0.4, { steps: 3 });
      await page.waitForTimeout(ms);
      await page.mouse.up();
      await page.waitForTimeout(350);
    };
    await dragTo(0, 1, 1600);
    const pDown = await pos();
    check(`${tag} 조이스틱으로 카펫 아래 줄(맨 아래 칸)까지 이동`, pDown.y === 6, JSON.stringify(pDown));

    const walkTo = async (x, y, face) => {
      await page.evaluate(([x, y, face]) => WS.game.stage.view.walkTo(x, y, face), [x, y, face]);
      await page.waitForFunction(([x, y]) => { const v = WS.game.stage.view; return v.player.x === x && v.player.y === y && !v.player.move && !v.path.length && !v.pending; }, [x, y], { timeout: 10000 });
    };
    const pressAct = async () => { await page.click('.pad-act'); await page.waitForFunction(() => WS.game.stage.view.mode === 'busy', null, { timeout: 5000 }); };
    const waitIdle = () => page.waitForFunction(() => WS.game.stage.view.mode === 'explore' && WS.game.ui.dialogue.mode === 'idle', null, { timeout: 20000 });
    const finishDialog = async () => {
      for (let i = 0; i < 80; i++) {
        const st = await page.evaluate(() => ({ m: WS.game.stage.view && WS.game.stage.view.mode, d: WS.game.ui.dialogue.mode }));
        if (st.m === 'explore' && st.d === 'idle') return true;
        if (st.d === 'choice') return 'choice';
        await tapStage(page); await page.waitForTimeout(90);
      }
      return false;
    };
    // 책상 앞에서 조사 버튼 → 아이템
    await walkTo(7, 5, 'up');
    const ready = await page.evaluate(() => document.querySelector('.pad-act').classList.contains('ready'));
    check(`${tag} 조사 대상 앞에 서면 조사 버튼이 빛남`, ready);
    await pressAct();
    await finishDialog();
    let inv = await page.evaluate(() => Object.assign({}, WS.game.state.inventory));
    check(`${tag} 조사 버튼으로 책상 조사 → 아이템 획득 (게임 상태 반영)`, inv.handkerchief === 1, JSON.stringify(inv));
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await finishDialog();
    inv = await page.evaluate(() => Object.assign({}, WS.game.state.inventory));
    const lastSaid = await page.evaluate(() => window.__said.slice(-1)[0]);
    check(`${tag} 두 번째 조사(Space 키): 다른 대사 + 아이템 중복 획득 없음`, inv.handkerchief === 1 && lastSaid.includes('평소와 다를 바 없다'), lastSaid);
    const seen = await page.evaluate(() => WS.game.stage.view.markerTargets().find(m => m.id === 'desk').state);
    check(`${tag} 조사한 대상의 표시는 옅어짐`, seen === 'seen');
    // 아무것도 없는 곳을 보고 조사 → 아무 일 없음
    await walkTo(4, 4, 'down');
    await page.click('.pad-act');
    await page.waitForTimeout(300);
    check(`${tag} 대상이 없는 곳에서 조사 버튼 → 반응 없음`, await page.evaluate(() => WS.game.stage.view.mode === 'explore' && WS.game.ui.dialogue.mode === 'idle'));

    // 나머지 오브젝트 조사
    const objs = [['bed', 2, 5, 'left'], ['bookshelf', 2, 3, 'up'], ['mirror', 3, 2, 'up'], ['window', 5, 2, 'up'], ['door', 8, 2, 'up']];
    for (const [id, x, y, face] of objs) {
      const before = await page.evaluate(() => window.__said.length);
      await walkTo(x, y, face);
      await pressAct();
      await finishDialog();
      const r = await page.evaluate(([id, before]) => ({ n: window.__said.length - before, c: WS.game.state.scenes.heroRoom.inspected[id] || 0 }), [id, before]);
      check(`${tag} 조사 이벤트: ${id}`, r.n > 0 && r.c === 1, JSON.stringify(r));
    }

    // 메이어: 첫 대화 → "조금 더 둘러본다" → 자기소개 반복 없음
    const talkMayer = async () => { await walkTo(6, 6, 'right'); await pressAct(); return finishDialog(); };
    const before = await page.evaluate(() => window.__said.length);
    let r = await talkMayer();
    check(`${tag} 메이어에게 다시 말 걸기 → 선택지`, r === 'choice');
    await page.waitForTimeout(450);
    await page.click('.choices button:nth-child(2)');
    await finishDialog();
    const again = await page.evaluate(b => window.__said.slice(b), before);
    check(`${tag} 메이어: 첫 자기소개를 반복하지 않음`, !again.some(t => t.includes('제 소개가 늦었군요')) && again.length >= 2, again.join(' / '));
    // 다시 말 걸기 → 이야기 계속 → 다음 스크립트 → 연결 지점
    r = await talkMayer();
    await page.waitForTimeout(450);
    await page.click('.choices button:nth-child(1)');
    const endShown = await ff(page, () => !!document.querySelector('.choices.end.show button:not([disabled])'));
    const brief = await page.evaluate(() => ({
      said: window.__said.includes('“네. 그럼 다음으로…….”'),
      doom: window.__said.includes('“예언에 따르면, 이 세계는 앞으로 30일 뒤에 멸망합니다.”'),
      mireille: window.__said.includes('“미레유님께서 예언하신 내용입니다.”'),
      last: window.__said.slice(-1)[0], ev: WS.game.state.scenes.heroRoom.events.briefing, flag: !!WS.game.state.flags.doom_revealed,
      btn: document.querySelector('.choices.end button').textContent,
    }));
    check(`${tag} 메이어: 다음 스크립트 → 새 원고(멸망 고지 · 미레유 · 첫 임무)까지 진행 → "밖으로 나간다"`,
      endShown && brief.said && brief.doom && brief.mireille && brief.ev && brief.flag && brief.btn === '밖으로 나간다' && brief.last === '다만, 이제는 끝이 정해진 세상이었다.', JSON.stringify(brief));
    await page.click('.choices.end button');
    await page.waitForTimeout(2000);
    const ph = await page.evaluate(() => ({ cur: WS.game.scenes.current, shown: document.querySelector('#next-scene').classList.contains('show'), back: !document.querySelector('.ns-back').hidden }));
    check(`${tag} 종료 지점: 미구현 다음 장면 → 임시 연결 지점 화면 (돌아가기 가능)`, ph.cur === 'heroRoom_next' && ph.shown && ph.back, JSON.stringify(ph));
    await page.click('.ns-back');
    await page.waitForTimeout(2000);
    const back = await page.evaluate(() => ({
      cur: WS.game.scenes.current, mode: WS.game.stage.view && WS.game.stage.view.mode,
      inv: WS.game.state.inventory.handkerchief, br: WS.game.state.scenes.heroRoom.events.briefing,
      p: WS.game.stage.view && [WS.game.stage.view.player.x, WS.game.stage.view.player.y], saved: WS.game.state.position,
    }));
    check(`${tag} 장면 이동 후 돌아와도 진행 상태 유지 (아이템 · 이벤트 · 위치, 시작 이벤트 재생 안 함)`,
      back.cur === 'heroRoom' && back.mode === 'explore' && back.inv === 1 && back.br && back.p[0] === back.saved.x && back.p[1] === back.saved.y, JSON.stringify(back));
    r = await talkMayer();
    const lastM = await page.evaluate(() => window.__said.slice(-1)[0]);
    check(`${tag} 연결 지점 이후 메이어 대사는 별도 문구`, r === 'choice' && lastM.includes('다음 설명을'), lastM);
    await page.waitForTimeout(450);
    await page.click('.choices button:nth-child(2)');
    await finishDialog();

    // 다시 시작
    await page.click('#btn-restart'); await page.waitForTimeout(350); await page.click('.cf-yes'); await page.waitForTimeout(700);
    const rs = await page.evaluate(() => ({
      cur: WS.game.scenes.current, inv: Object.keys(WS.game.state.inventory).length, sc: WS.game.state.scenes.heroRoom && WS.game.state.scenes.heroRoom.events.opening,
      pose: WS.game.stage.view.player.pose, mode: WS.game.stage.view.mode, aw: WS.game.state.player.awakened,
    }));
    check(`${tag} 처음부터: 새 테스트 상태로 방 장면 재시작 (오류 없음)`, rs.cur === 'heroRoom' && rs.inv === 0 && !rs.sc && rs.pose === 'lying' && rs.mode === 'cutscene' && rs.aw, JSON.stringify(rs));
    const again2 = await advanceUntil(page, () => WS.game.stage.view.mode === 'explore', 600);
    check(`${tag} 재시작 후 다시 끝까지 진행 가능`, again2);
    check(`${tag} 콘솔 오류 없음`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 7) 리스너 정리: 방 → 다른 장면으로 나간 뒤 키 입력이 남지 않는지
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(URL + '?scene=heroRoom&job=ruby');
    await page.click('#start-gate p');
    await page.waitForTimeout(400);
    const spr = await page.evaluate(() => WS.game.stage.view.player.sprite);
    check('[방] ?scene=heroRoom&job=ruby 로 의상(직업) 지정 진입', spr === 'ruby', spr);
    await page.evaluate(() => WS.game.newGame({ scene: 'whiteSpace' }));
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ view: WS.game.stage.view, cur: WS.game.scenes.current }));
    await page.keyboard.press('ArrowLeft');
    check('[방] 장면을 나가면 맵 화면과 입력이 정리됨', st.view === null && st.cur === 'whiteSpace');
    await page.close();
  }

  // 8) 방 장면을 직업별로 끝까지: 초상화 · 도트 · 표정 경고 · 알림 · @silence · 세이브/불러오기
  for (const job of ['morganite', 'aquamarine', 'amethyst', 'ruby', 'heliodor']) {
    const tag = `[방 · ${job}]`;
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    const issues = [];
    page.on('pageerror', e => issues.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') issues.push(m.text()); });
    await page.goto(URL + '?scene=heroRoom&job=' + job);
    await page.evaluate(() => {
      window.__said = []; window.__portraits = []; window.__toasts = []; window.__closeups = [];
      const d = WS.game.ui.dialogue, orig = d.say.bind(d);
      d.say = (sp, text) => { window.__said.push(text); const r = orig(sp, text); window.__portraits.push([sp, d.el.portraitImg.getAttribute('src')]); return r; };
      const t = WS.game.ui.toast.bind(WS.game.ui); WS.game.ui.toast = (m, e) => { window.__toasts.push(m); return t(m, e); };
      const c = WS.game.ui.closeup.bind(WS.game.ui); WS.game.ui.closeup = id => { window.__closeups.push([id, window.__said.slice(-1)[0]]); return c(id); };
    });
    await page.click('#start-gate p');
    await ff(page, () => WS.game.stage.view.mode === 'explore');
    await page.evaluate(() => WS.game.stage.view.walkTo(6, 6, 'right'));
    await page.waitForFunction(() => { const v = WS.game.stage.view; return v.player.x === 6 && v.player.y === 6 && !v.player.move && !v.pending; });
    await page.evaluate(() => WS.game.stage.view.onActionKey());
    await ff(page, () => WS.game.ui.dialogue.mode === 'choice');
    await page.waitForTimeout(400);
    await page.click('.choices button:nth-child(1)');
    // 멸망 고지 순간: 클로즈업이 켜져 있고 메이어를 비추는지
    const atDoom = await ff(page, () => window.__said.slice(-1)[0] === '“예언에 따르면, 이 세계는 앞으로 30일 뒤에 멸망합니다.”');
    const doomState = await page.evaluate(() => ({ cu: document.querySelector('#closeup').classList.contains('show'), cam: WS.game.stage.view.camFocus }));
    check(`${tag} 멸망 고지 대사에서 메이어 클로즈업 + 카메라`, atDoom && doomState.cu && doomState.cam === 'mayer', JSON.stringify(doomState));
    // @silence (맵 장면): 대화창이 내려가고 다시 이어짐
    await ff(page, () => WS.game.ui.dialogue.mode === 'idle' && !document.querySelector('.dlg').classList.contains('show'), 8000);
    const silent = await page.evaluate(() => ({ cu: document.querySelector('#closeup').classList.contains('show'), cam: WS.game.stage.view.camFocus, mode: WS.game.stage.view.mode }));
    check(`${tag} @silence: 맵 장면에서 대화창이 잠시 내려가고(클로즈업 해제 · 카메라 복귀) 진행 유지`, !silent.cu && silent.cam === 'player' && silent.mode === 'busy', JSON.stringify(silent));
    const ended = await ff(page, () => !!document.querySelector('.choices.end.show button:not([disabled])'));
    const r = await page.evaluate(() => {
      const hero = window.__portraits.filter(([sp]) => sp && sp.startsWith('클레어')).map(p => p[1]);
      return {
        heroSet: [...new Set(hero)], spr: WS.game.stage.view.player.sprite,
        toast: window.__toasts, flag: WS.game.state.flags.doom_revealed, ev: WS.game.state.scenes.heroRoom.events.briefing,
        josa: window.__said.find(t => t.includes('가장 알고 싶어 하는')),
        mireilleCam: window.__closeups.length,
      };
    });
    const expectJobFace = job === 'heliodor' ? r.heroSet.every(p => p === 'assets/portraits/heliodor.jpg') : r.heroSet.every(p => p.startsWith('assets/portraits/' + job + '_'));
    check(`${tag} 클레어 초상화 = 변신 후 표정 (${r.heroSet.length}종${job === 'heliodor' ? ', 시트 없음 → 직업 초상화' : ''}) · 도트 = ${job}`, ended && expectJobFace && r.spr === job, JSON.stringify(r.heroSet));
    check(`${tag} 알림 "세계 멸망까지 — 남은 날 30일" + doom_revealed 플래그 + briefing 이벤트`, r.toast.includes('세계 멸망까지 — 남은 날 30일') && r.flag && r.ev, JSON.stringify(r.toast));
    check(`${tag} 조사 {player.name:이/가}: 받침 없는 이름 → "클레어가"`, r.josa === '하지만 이번에도, 클레어가 가장 알고 싶어 하는 질문에는 답하지 않았다.', r.josa);
    await page.click('.choices.end button');
    await page.waitForTimeout(2000);
    const ph = await page.evaluate(() => WS.game.scenes.current);
    check(`${tag} @end "밖으로 나간다" → 다음 장면 자리 표시(heroRoom_next)`, ph === 'heroRoom_next', ph);
    // 세이브 → 불러오기 (게임 상태를 JSON 으로 저장했다가 되살림)
    const load = await page.evaluate(async () => {
      const saved = JSON.stringify(WS.game.state);
      WS.game.newGame({ scene: 'whiteSpace' });
      await new Promise(r => setTimeout(r, 200));
      WS.game.ui.resetAll(); WS.game.runner.stop();
      const prev = WS.game.scenes.currentScene; if (prev && prev.exit) prev.exit(WS.game);
      WS.game.state = JSON.parse(saved);
      WS.game.scenes.current = null;
      WS.game.scenes.start('heroRoom', {});
      await new Promise(r => setTimeout(r, 1200));
      return { flag: WS.game.state.flags.doom_revealed, ev: WS.game.state.scenes.heroRoom.events, mode: WS.game.stage.view.mode, pose: WS.game.stage.view.player.pose, pos: [WS.game.stage.view.player.x, WS.game.stage.view.player.y], saved: WS.game.state.position };
    });
    check(`${tag} 세이브(JSON) → 불러오기: doom_revealed · briefing 유지, 시작 이벤트 재생 안 함, 위치 복원`,
      load.flag && load.ev.briefing && load.ev.opening && load.mode === 'explore' && load.pose === 'stand' && load.pos[0] === load.saved.x && load.pos[1] === load.saved.y, JSON.stringify(load));
    check(`${tag} 콘솔 오류 · 경고(없는 표정 등) 없음`, issues.length === 0, issues.join(' | '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `room-${job}-loaded.png`) });
    await page.close();
  }

  // 9) 흰 공간에서 받침 있는 이름("하늘") → 방까지 이어서 조사 확인
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    const issues = [];
    page.on('pageerror', e => issues.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') issues.push(m.text()); });
    await page.goto(URL);
    await page.evaluate(() => { window.__said = []; const d = WS.game.ui.dialogue, o = d.say.bind(d); d.say = (sp, t) => { window.__said.push(t); return o(sp, t); }; });
    await page.click('#start-gate p');
    await ff(page, () => document.querySelector('#name-input').classList.contains('show'));
    await fillName(page, '하늘');
    await ff(page, () => WS.game.ui.jobSelect.isOpen);
    await page.waitForTimeout(400);
    await page.click('.job-item[data-job="amethyst"]');
    await page.click('.js-accept'); await page.waitForTimeout(300); await page.click('.cf-yes');
    await ff(page, () => !!document.querySelector('.choices.end.show button:not([disabled])'));
    await page.click('.choices.end button');
    await page.waitForTimeout(2200);
    const inRoom = await page.evaluate(() => WS.game.scenes.current === 'heroRoom' && WS.game.stage.view.mode === 'cutscene');
    check('[흰 공간 → 방] "다음 장면으로" 를 누르면 주인공의 방 시작 이벤트로 이어짐', inRoom);
    await ff(page, () => WS.game.stage.view.mode === 'explore');
    const greet = await page.evaluate(() => window.__said.find(t => t.startsWith('“반갑습니다')));
    check('[흰 공간 → 방] 입력한 이름으로 부름: "반갑습니다, 하늘님."', greet === '“반갑습니다, 하늘님.”', greet);
    await page.evaluate(() => WS.game.stage.view.walkTo(6, 6, 'right'));
    await page.waitForFunction(() => { const v = WS.game.stage.view; return v.player.x === 6 && v.player.y === 6 && !v.player.move && !v.pending; });
    await page.evaluate(() => WS.game.stage.view.onActionKey());
    await ff(page, () => WS.game.ui.dialogue.mode === 'choice');
    await page.waitForTimeout(400);
    await page.click('.choices button:nth-child(1)');
    await ff(page, () => window.__said.some(t => t.includes('가장 알고 싶어 하는')));
    const josa = await page.evaluate(() => window.__said.find(t => t.includes('가장 알고 싶어 하는')));
    check('[흰 공간 → 방] 받침 있는 이름 → "하늘이 가장 알고 싶어 하는"', josa === '하지만 이번에도, 하늘이 가장 알고 싶어 하는 질문에는 답하지 않았다.', josa);
    const plate = await page.evaluate(async () => {
      for (let i = 0; i < 400; i++) {
        const n = document.querySelector('.dlg-name').textContent;
        if (WS.game.ui.dialogue.el.box.dataset.speaker === 'hero' && WS.game.ui.dialogue.mode === 'waiting') return [n, WS.game.ui.dialogue.el.portraitImg.getAttribute('src')];
        const d = WS.game.ui.dialogue; if (d.mode === 'typing') d.finishTyping(); else if (d.mode === 'waiting' && performance.now() - d.completedAt > 95) d.advance();
        await new Promise(r => setTimeout(r, 25));
      }
      return null;
    });
    check('[흰 공간 → 방] 클레어 대사의 이름표 = 입력한 이름, 초상화 = 애머시스트 표정', plate && plate[0] === '하늘' && plate[1].startsWith('assets/portraits/amethyst_'), JSON.stringify(plate));
    check('[흰 공간 → 방] 콘솔 오류 · 경고 없음', issues.length === 0, issues.join(' | '));
    await page.close();
  }

  // 10) 알림 문구가 잘리지 않는지 (가로 폰 · 세로 폰 · 태블릿)
  for (const vp of [{ width: 667, height: 375 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(URL);
    const t = await page.evaluate(async () => {
      WS.game.ui.toast('세계 멸망까지 — 남은 날 30일');
      await new Promise(r => setTimeout(r, 500));
      const el = document.getElementById('toast'), r = el.getBoundingClientRect();
      return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0, fits: el.scrollWidth <= el.clientWidth + 1, h: Math.round(r.height), rot: getComputedStyle(document.getElementById('rotate-hint')).display };
    });
    check(`[알림 ${vp.width}x${vp.height}] "세계 멸망까지 — 남은 날 30일" 잘리지 않음${t.rot === 'flex' ? ' (세로 폰은 가로 회전 안내가 먼저 뜸)' : ''}`, t.inside && t.fits, JSON.stringify(t));
    await page.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n총 ${results.length}개 중 통과 ${results.length - failed.length}, 실패 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
