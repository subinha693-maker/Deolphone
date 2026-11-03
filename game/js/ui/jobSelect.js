/*
 * 직업 선택 UI
 *  open(meta, run) → 최종 확정한 직업 ID 로 resolve
 *  - 목록에서 직업을 누르면 상세 정보 표시 (아직 확정 아님)
 *  - "이 힘을 받아들인다" → 확인 창 → [받아들인다] 시 확정 / [다시 생각한다] 시 취소
 */
window.WS = window.WS || {};

WS.JobSelect = class {
  constructor(root, ui) {
    this.root = root;          // #job-select
    this.ui = ui;
    this.list = root.querySelector('.js-list');
    this.detail = root.querySelector('.js-detail');
    this.acceptBtn = root.querySelector('.js-accept');
    this.selectedId = null;
    this.resolve = null;
    this.acceptBtn.addEventListener('click', e => { e.stopPropagation(); this.confirm(); });
  }

  get isOpen() { return this.root.classList.contains('show'); }

  open(meta, run) {
    this.meta = meta;
    this.run = run;
    this.selectedId = null;
    this.render();
    this.root.classList.add('show');
    this.ui.pushModal();
    this.armedAt = performance.now() + WS.Dialogue.ARM_MS;
    return new Promise(resolve => { this.resolve = resolve; });
  }

  close() {
    if (!this.isOpen) return;
    this.root.classList.remove('show');
    this.ui.popModal();
    this.resolve = null;
  }

  render() {
    this.list.innerHTML = '';
    WS.JOBS.forEach(job => {
      const unlocked = WS.Progression.check(job.unlock, this.meta, this.run);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'job-item' + (unlocked ? '' : ' locked');
      b.dataset.job = job.id;
      b.style.setProperty('--job', job.color);
      b.style.setProperty('--job-light', job.colorLight);
      b.disabled = !unlocked;
      b.innerHTML = unlocked
        ? `<span class="job-thumb"><img src="${job.portrait}" alt=""></span>
           <span class="job-item-text"><b>${job.name}</b><small>${job.role}</small></span>`
        : `<span class="job-thumb"></span><span class="job-item-text"><b>？？？</b><small>잠겨 있음</small></span>`;
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (performance.now() < this.armedAt) return;
        this.select(job.id);
      });
      this.list.appendChild(b);
    });
    this.renderDetail();
  }

  select(id) {
    this.selectedId = id;
    this.list.querySelectorAll('.job-item').forEach(el => el.classList.toggle('active', el.dataset.job === id));
    this.renderDetail();
  }

  renderDetail() {
    const job = WS.getJob(this.selectedId);
    this.acceptBtn.disabled = !job;
    if (!job) {
      this.root.style.removeProperty('--job');
      this.detail.innerHTML = `<p class="js-hint">왼쪽에서 받아들일 힘을 골라 자세히 살펴보세요.</p>`;
      return;
    }
    this.root.style.setProperty('--job', job.color);
    this.root.style.setProperty('--job-light', job.colorLight);
    const stats = WS.BALANCE.STATS[job.id];
    const sig = WS.BALANCE.ABILITIES[job.signatureAbility];
    const bar = (k) => {
      const v = stats[k];
      const norm = (k === 'hp' || k === 'mp') ? v / 6 : v;
      const pct = Math.max(4, Math.min(100, (norm / WS.STAT_MAX) * 100));
      return `<div class="stat"><span>${WS.STAT_LABELS[k]}</span><i><em style="width:${pct}%"></em></i><b>${v}</b></div>`;
    };
    this.detail.innerHTML = `
      <div class="jd-art"><img src="${job.card}" alt="${job.name}"></div>
      <div class="jd-info">
        <h3>${job.name}${job.draft ? ' <span class="draft" title="설정 미확정 임시 데이터">임시</span>' : ''}</h3>
        <p class="jd-tagline">${job.tagline}</p>
        <dl>
          <dt>전투 성향</dt><dd><span class="role">${job.role}</span> ${job.style}</dd>
          <dt>대표 능력</dt><dd><b class="ability">「${sig.name}」</b> ${sig.desc}
            <span class="meta">마나 ${sig.cost} · 대기 ${sig.cooldown}턴</span></dd>
          <dt>장점과 특징</dt><dd><ul>${job.strengths.map(s => `<li>${s}</li>`).join('')}</ul></dd>
        </dl>
        <div class="stats">${Object.keys(WS.STAT_LABELS).map(bar).join('')}</div>
      </div>`;
    this.detail.scrollTop = 0;
  }

  async confirm() {
    const job = WS.getJob(this.selectedId);
    if (!job || !this.resolve) return;
    const ok = await this.ui.confirm({
      title: job.name,
      body: `이 힘을 받아들이시겠어요?<br><small>한 번 받아들인 힘은 되돌릴 수 없습니다.</small>`,
      yes: '받아들인다',
      no: '다시 생각한다',
      color: job.color,
    });
    if (!ok || !this.resolve) return;
    const r = this.resolve;
    this.close();
    r(job.id);
  }
};
