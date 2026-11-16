// =============================================================
//  시작 / 화면 전환 / 16:9 자동 확대·축소
// =============================================================
const App = {
  scale: 1,
  gameEl: null,
  current: null,

  mount(node) {
    this.gameEl.innerHTML = '';
    this.gameEl.appendChild(node);
  },

  goto(name, opts) {
    if (name !== 'battle') BattleUI.stop();
    this.current = name;
    if (name === 'battle') { BattleUI.start(opts.stageId); return; }
    const fn = Screens[name];
    if (fn) this.mount(fn(opts || {}));
  },

  fit() {
    const W = 1600, H = 900;
    const vw = window.innerWidth, vh = window.innerHeight;
    this.scale = Math.min(vw / W, vh / H);
    const g = this.gameEl;
    g.style.transform = `scale(${this.scale})`;
    g.style.left = Math.round((vw - W * this.scale) / 2) + 'px';
    g.style.top = Math.round((vh - H * this.scale) / 2) + 'px';
    BattleUI.resize();
  },

  async boot() {
    this.gameEl = document.getElementById('game');
    this.fit();
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 200));
    // 모바일에서 화면이 끌려 움직이지 않게
    document.addEventListener('touchmove', e => { if (e.target.closest && !e.target.closest('.scrollable')) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', e => e.preventDefault());

    this.mount(Object.assign(document.createElement('div'), { className: 'screen loading', innerHTML: '<div class="ld-title">불러오는 중…</div><div class="ld-bar"><i></i></div>' }));
    const bar = this.gameEl.querySelector('.ld-bar i');
    Save.load();
    try {
      await Assets.loadAll(p => { bar.style.width = Math.round(p * 100) + '%'; });
    } catch (e) { console.warn('이미지 불러오기 중 오류(무시하고 진행)', e); }
    this.goto('title');
  }
};

window.addEventListener('DOMContentLoaded', () => App.boot());
