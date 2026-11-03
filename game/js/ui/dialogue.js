/*
 * 대화창 UI
 *  say(화자, 문장)  → 플레이어가 다 읽고 넘길 때 resolve
 *  choose(보기[])   → 고른 보기의 index 로 resolve. 선택지 표시 중에는 일반 진행 입력 무시
 *  advance()        → 탭/클릭/키 입력: 타이핑 중이면 전체 표시, 다 나왔으면 다음으로
 */
window.WS = window.WS || {};

WS.Dialogue = class {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.el = {
      box: root.querySelector('.dlg'),
      portrait: root.querySelector('.dlg-portrait'),
      portraitImg: root.querySelector('.dlg-portrait img'),
      name: root.querySelector('.dlg-name'),
      text: root.querySelector('.dlg-text'),
      next: root.querySelector('.dlg-next'),
      choices: root.querySelector('.choices'),
    };
    this.CHAR_MS = 34;
    this.reset();
  }

  reset() {
    this.token = (this.token || 0) + 1;   // 진행 중인 타이핑 타이머 무효화
    clearTimeout(this.timer);
    this.mode = 'idle';
    this.full = '';
    this.shown = 0;
    this.pending = null;
    this.el.choices.innerHTML = '';
    this.el.choices.classList.remove('show');
    this.hide();
  }

  hide() {
    this.el.box.classList.remove('show');
  }

  get waitingForInput() { return this.mode === 'typing' || this.mode === 'waiting'; }

  say(speakerName, text) {
    const charId = speakerName ? WS.findCharacterId(speakerName) : null;
    const ch = charId ? WS.CHARACTERS[charId] : null;
    const isSystem = ch && ch.kind === 'system';

    this.el.box.classList.toggle('system', !!isSystem);
    this.el.box.classList.toggle('no-portrait', !!isSystem || !ch);
    this.el.box.dataset.speaker = charId || '';
    this.el.name.textContent = isSystem ? '' : (speakerName || '');
    this.el.name.classList.toggle('empty', isSystem || !speakerName);

    if (ch && !isSystem) {
      let src = ch.portrait;
      const run = this.game.state;
      if (ch.usesJobPortrait && run.player.awakened) {
        const job = WS.getJob(run.player.jobId);
        if (job) src = job.portrait;
      }
      if (this.el.portraitImg.getAttribute('src') !== src) this.el.portraitImg.src = src;
    }

    this.el.box.classList.add('show');
    this.full = text;
    this.shown = 0;
    this.el.text.textContent = '';
    this.el.next.classList.remove('show');
    this.mode = 'typing';
    const myToken = ++this.token;

    return new Promise(resolve => {
      this.pending = resolve;
      const tick = () => {
        if (myToken !== this.token || this.mode !== 'typing') return;
        this.shown++;
        this.el.text.textContent = this.full.slice(0, this.shown);
        if (this.shown >= this.full.length) { this.finishTyping(); return; }
        const c = this.full[this.shown - 1];
        const pause = '…'.includes(c) ? 110 : '.?!'.includes(c) ? 90 : ','.includes(c) ? 60 : 0;
        this.timer = setTimeout(tick, this.CHAR_MS + pause);
      };
      this.timer = setTimeout(tick, 60);
    });
  }

  finishTyping() {
    clearTimeout(this.timer);
    this.shown = this.full.length;
    this.el.text.textContent = this.full;
    this.mode = 'waiting';
    this.completedAt = performance.now();
    this.el.next.classList.add('show');
  }

  /** 일반 진행 입력 (화면 탭, 클릭, Space/Enter) */
  advance() {
    if (this.mode === 'typing') { this.finishTyping(); return true; }
    if (this.mode === 'waiting') {
      // 같은 순간의 중복 입력(터치+클릭 등)으로 두 줄이 넘어가지 않도록 아주 짧은 간격을 둔다
      if (performance.now() - this.completedAt < 90) return false;
      this.mode = 'idle';
      this.el.next.classList.remove('show');
      const r = this.pending; this.pending = null;
      if (r) r();
      return true;
    }
    return false; // choice / idle 상태에서는 아무 일도 하지 않음
  }

  /**
   * 선택지 표시. 일반 진행 입력으로는 넘어가지 않는다.
   * 실수 방지를 위해 표시 직후 잠깐(ARM_MS) 동안은 눌리지 않는다.
   */
  choose(labels, opts = {}) {
    this.mode = 'choice';
    this.el.next.classList.remove('show');
    const box = this.el.choices;
    box.innerHTML = '';
    box.className = 'choices' + (opts.kind ? ' ' + opts.kind : '');
    const myToken = this.token;
    return new Promise(resolve => {
      labels.forEach((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'g-btn choice-btn';
        b.textContent = label;
        b.disabled = true;
        b.addEventListener('click', e => {
          e.stopPropagation();
          if (b.disabled || myToken !== this.token || this.mode !== 'choice') return;
          box.querySelectorAll('button').forEach(x => (x.disabled = true));
          b.classList.add('picked');
          this.mode = 'idle';
          setTimeout(() => {
            box.classList.remove('show');
            box.innerHTML = '';
            resolve(i);
          }, 180);
        });
        box.appendChild(b);
      });
      requestAnimationFrame(() => box.classList.add('show'));
      setTimeout(() => {
        if (myToken === this.token) box.querySelectorAll('button').forEach(x => (x.disabled = false));
      }, WS.Dialogue.ARM_MS);
    });
  }
};

WS.Dialogue.ARM_MS = 350;
