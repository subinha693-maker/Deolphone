/*
 * 게임 상태
 *  - meta : 회차를 넘어 유지되는 값 (localStorage). progression.js 참고
 *  - run  : 이번 플레이에서만 쓰는 값. 새로 시작하면 항상 새로 만든다.
 */
window.WS = window.WS || {};

WS.State = {
  createRun(meta) {
    return {
      version: 1,
      loop: meta.loop,
      sceneId: null,
      flags: {},
      choices: {},          // 선택지 ID → 고른 값 기록
      inventory: {},        // 아이템 ID → 개수 (items.js)
      position: null,       // 맵 장면에서의 주인공 위치 { sceneId, x, y, dir }
      scenes: {},           // 장면별 진행 { [장면ID]: { inspected: {오브젝트ID: 횟수}, events: {이벤트: true} } }
      player: {
        name: '클레어',     // 대사의 {player.name} — 이름 입력 기능이 생기면 여기에 저장
        jobId: null,
        awakened: false,
        stats: null,
        abilities: [],      // 등록된 능력 (balance.js ABILITIES 복사본 + id)
      },
    };
  },

  /** 직업 선택 확정: 직업 ID 와 초기 능력치를 플레이어에 반영 */
  applyJob(run, jobId) {
    const job = WS.getJob(jobId);
    const stats = WS.BALANCE.STATS[jobId];
    if (!job || !stats) throw new Error('알 수 없는 직업: ' + jobId);
    run.player.jobId = jobId;
    run.player.stats = Object.assign({}, stats);
    run.choices.job = jobId;
  },

  /** 각성: 직업의 첫 능력을 플레이어 능력 목록에 등록 (중복 등록 방지) */
  awaken(run) {
    const job = WS.getJob(run.player.jobId);
    if (!job) throw new Error('직업을 선택하기 전에 각성할 수 없습니다.');
    for (const abilityId of job.initialAbilities) {
      if (run.player.abilities.some(a => a.id === abilityId)) continue;
      const def = WS.BALANCE.ABILITIES[abilityId];
      if (!def) throw new Error('능력 데이터가 없습니다: ' + abilityId);
      run.player.abilities.push(Object.assign({ id: abilityId, level: 1 },
        JSON.parse(JSON.stringify(def))));
    }
    run.player.awakened = true;
  },

  /** 장면별 진행 데이터 (없으면 만든다) */
  sceneData(run, sceneId) {
    if (!run.scenes[sceneId]) run.scenes[sceneId] = { inspected: {}, events: {} };
    return run.scenes[sceneId];
  },

  /** 아이템 획득. unique 아이템은 이미 있으면 false (중복 획득 방지) */
  giveItem(run, itemId, count = 1) {
    const def = WS.ITEMS[itemId];
    if (!def) throw new Error('아이템 데이터가 없습니다: ' + itemId);
    const have = run.inventory[itemId] || 0;
    if (def.unique !== false && have > 0) return false;
    run.inventory[itemId] = have + count;
    return true;
  },

  hasItem(run, itemId) { return (run.inventory[itemId] || 0) > 0; },

  /** 테스트용: 장면을 단독 실행할 때 직업 선택 · 각성까지 끝난 상태를 만든다 */
  createTestRun(meta, jobId) {
    const run = this.createRun(meta);
    this.applyJob(run, jobId || WS.JOBS[0].id);
    this.awaken(run);
    run.flags.test_mode = true;
    return run;
  },
};
