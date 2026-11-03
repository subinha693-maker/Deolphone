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

/** 조건이 될 때까지 화면을 탭해 대사 진행 */
async function advanceUntil(page, cond, maxTaps = 200) {
  for (let i = 0; i < maxTaps; i++) {
    if (await page.evaluate(cond)) return true;
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
  const next = await page.evaluate(() => ({ scene: WS.game.state.sceneId, shown: document.querySelector('#next-scene').classList.contains('show') }));
  check(`${tag} 종료 버튼 → 다음 장면 전환 함수 동작`, next.scene === 'chapter1' && next.shown);
  await shot(page, `${jobId}-8-next`);

  // 대사 순서
  const said = await page.evaluate(() => window.__said);
  const expected = await page.evaluate(() => WS.parseScript(WS.SCRIPTS.whiteSpace).nodes.filter(n => n.type === 'say').map(n => n.text));
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
    await page.click('.ns-restart');
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
      const lines = WS.parseScript(WS.SCRIPTS.whiteSpace).nodes.filter(n => n.type === 'say');
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

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n총 ${results.length}개 중 통과 ${results.length - failed.length}, 실패 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
