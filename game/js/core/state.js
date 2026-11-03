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
      player: {
        name: '주인공',
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
};
