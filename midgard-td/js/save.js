// 진행 상황 자동 저장 (브라우저 localStorage)
const Save = {
  KEY: 'midgard_td_save_v1',
  data: null,

  defaults() {
    const chars = {};
    for (const c of CHARACTERS) chars[c.id] = { level: 1, exp: 0 };
    return { version: 1, yen: 0, rank: 0, chars, stages: {}, settings: { speed: 1 } };
  },

  load() {
    let d = null;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) { d = null; }
    const def = this.defaults();
    if (!d || typeof d !== 'object') d = def;
    // 나중에 캐릭터·항목이 추가돼도 깨지지 않게 기본값과 합치기
    d.chars = Object.assign({}, def.chars, d.chars || {});
    d.stages = d.stages || {};
    d.settings = Object.assign({}, def.settings, d.settings || {});
    if (typeof d.yen !== 'number') d.yen = 0;
    if (typeof d.rank !== 'number') d.rank = 0;
    this.data = d;
    this.save();
    return d;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 불가 환경이면 무시 */ }
  },

  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
    this.data = null;
    return this.load();
  },

  rank() { const r = GAME_CONFIG.ranks; return r[Math.min(this.data.rank, r.length - 1)]; },
  levelCap() { return this.rank().cap; },
  char(id) { return this.data.chars[id] || (this.data.chars[id] = { level: 1, exp: 0 }); },
  stageStars(id) { return (this.data.stages[id] && this.data.stages[id].stars) || 0; },
  stageCleared(id) { return !!(this.data.stages[id] && this.data.stages[id].cleared); },
  stageUnlocked(st) { return !st.unlockAfter || this.stageCleared(st.unlockAfter); },

  // 클리어 보상 적용. 캐릭터별 레벨 변화 결과를 돌려줌
  applyVictory(stage, stars, partyIds) {
    const mult = GAME_CONFIG.rewardMult[stars] || 1;
    const exp = Math.round(stage.reward.exp * mult);
    const yen = Math.round(stage.reward.yen * mult);
    const cap = this.levelCap();
    const per = GAME_CONFIG.expPerLevel;
    const results = [];
    for (const id of partyIds) {
      const c = this.char(id);
      const before = { level: c.level, exp: c.exp };
      let gain = exp;
      while (gain > 0 && c.level < cap) {
        const need = c.level * per - c.exp;
        if (gain >= need) { gain -= need; c.level++; c.exp = 0; }
        else { c.exp += gain; gain = 0; }
      }
      if (c.level >= cap) c.exp = 0;
      results.push({ id, before, after: { level: c.level, exp: c.exp }, levelUps: c.level - before.level, capped: c.level >= cap });
    }
    this.data.yen += yen;
    const s = this.data.stages[stage.id] || (this.data.stages[stage.id] = { stars: 0, cleared: false });
    s.cleared = true;
    s.stars = Math.max(s.stars, stars);
    this.save();
    return { exp, yen, results };
  }
};

// 레벨이 반영된 능력치
function charStats(ch, level) {
  const g = 1 + GAME_CONFIG.statGrowth * (level - 1);
  return {
    hp: Math.round(ch.hp * g), atk: Math.round(ch.atk * g), def: Math.round(ch.def * g),
    res: ch.res, interval: ch.interval, range: ch.range, block: ch.block
  };
}
