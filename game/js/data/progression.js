/*
 * 회차 · 해금 데이터 (확장용 뼈대)
 * ------------------------------------------------------------
 * 회차 간에 유지되는 정보(메타 데이터)는 localStorage 에 저장된다.
 * 한 번의 플레이 안에서만 쓰는 값(선택한 직업 등)은 state.js 의 run 상태에 있고,
 * 새로 시작할 때마다 완전히 새로 만들어진다.
 *
 * 해금 조건 형식 (jobs.js 의 unlock, 스크립트 선택지의 "? 조건이름" 에서 사용)
 *   { type: 'always' }
 *   { type: 'loopAtLeast', value: 2 }        n회차 이상
 *   { type: 'endingSeen', value: 'ending_a' } 특정 엔딩을 본 적이 있음
 *   { type: 'flag', value: '플래그' }          이번 회차 상태에 플래그가 있음
 *   { type: 'all', of: [조건...] } / { type: 'any', of: [조건...] }
 *
 * 예) 다음 회차에서만 보이는 직업:  unlock: { type: 'loopAtLeast', value: 2 }
 */
window.WS = window.WS || {};

/** 스크립트에서 이름으로 참조하는 조건 */
WS.CONDITIONS = {
  secondLoop: { type: 'loopAtLeast', value: 2 },
  // 예시: 'remembersMireille': { type: 'endingSeen', value: 'ending_true' },
};

/** 엔딩 목록 (아직 미구현 — ID 만 예약) */
WS.ENDINGS = {
  // ending_true: { name: '…', unlocks: ['job:obsidian'] },
};

WS.Progression = {
  STORAGE_KEY: 'whitespace.meta.v1',

  defaultMeta() {
    return { loop: 1, endingsSeen: [], prologueClears: 0 };
  },

  loadMeta() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return this.defaultMeta();
      return Object.assign(this.defaultMeta(), JSON.parse(raw));
    } catch (e) {
      return this.defaultMeta();
    }
  },

  saveMeta(meta) {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(meta)); } catch (e) { /* 저장 불가 환경 */ }
  },

  /** 조건 평가. cond 가 문자열이면 WS.CONDITIONS 에서 찾는다. */
  check(cond, meta, run) {
    if (!cond) return true;
    if (typeof cond === 'string') {
      const named = WS.CONDITIONS[cond];
      if (!named) { console.warn('[progression] 알 수 없는 조건:', cond); return false; }
      cond = named;
    }
    switch (cond.type) {
      case 'always': return true;
      case 'loopAtLeast': return (meta.loop || 1) >= cond.value;
      case 'endingSeen': return (meta.endingsSeen || []).includes(cond.value);
      case 'flag': return !!(run && run.flags[cond.value]);
      case 'all': return cond.of.every(c => this.check(c, meta, run));
      case 'any': return cond.of.some(c => this.check(c, meta, run));
      default:
        console.warn('[progression] 알 수 없는 조건 형식:', cond);
        return false;
    }
  },
};
