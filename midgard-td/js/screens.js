// =============================================================
//  메뉴 화면들: 타이틀 / 스테이지 선택 / 출전 확인 / 캐릭터 정보 / 결과
// =============================================================
const Screens = (() => {
  const CFG = () => GAME_CONFIG;
  function h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  const starStr = n => '★'.repeat(n) + '<span class="off">' + '★'.repeat(3 - n) + '</span>';

  function topBar(title, back) {
    const bar = h(`<div class="topbar">
      ${back ? '<button class="btn small back">◀ 뒤로</button>' : ''}
      <div class="tb-title">${title}</div>
      <div class="tb-res"><span>엽사 등급 <b>${Save.rank().name}</b> (Lv 상한 ${Save.levelCap()})</span><span class="yen">${Save.data.yen.toLocaleString()} 연</span></div>
    </div>`);
    if (back) bar.querySelector('.back').addEventListener('click', back);
    return bar;
  }

  function faceEl(id, w, hh) {
    const cv = Assets.faceCanvas(id, w, hh);
    if (cv) { cv.className = 'face-cv'; return cv; }
    const ch = CHARACTERS.find(c => c.id === id);
    const color = CFG().classes[ch.cls].color;
    return h(`<div class="face-fallback" style="background:radial-gradient(circle at 50% 40%, ${color}, #1b2030)">${ch.name.slice(0, 1)}</div>`);
  }

  // ---------- 타이틀 ----------
  function title() {
    const s = h(`<div class="screen title">
      <div class="title-bg"></div>
      <div class="title-chars"></div>
      <div class="title-box">
        <div class="t-sub">미드가르드 제도</div>
        <h1>${CFG().title}</h1>
        <div class="t-sub2">${CFG().subtitle}</div>
        <div class="t-menu">
          <button class="btn big go">출격</button>
          <button class="btn roster">엽사 명단</button>
          <button class="btn small reset">저장 데이터 초기화</button>
        </div>
        <div class="t-info">보유 ${Save.data.yen.toLocaleString()} 연 · 엽사 등급 「${Save.rank().name}」</div>
      </div>
      <div class="t-story">이상체가 사람을 습격하는 땅, 미드가르드 제도.<br>혼수상태에서 깨어난 옛 리더는 에레비아의 무너진 엽사 조직을 다시 일으키기로 한다.</div>
    </div>`);
    const chars = s.querySelector('.title-chars');
    ['sheba', 'amelie', 'vivian'].forEach((id, i) => {
      const img = Assets.portraits[id];
      if (img) { const im = img.cloneNode(); im.className = 'tc tc' + i; chars.appendChild(im); }
    });
    s.querySelector('.go').addEventListener('click', () => App.goto('stages'));
    s.querySelector('.roster').addEventListener('click', () => App.goto('chars'));
    s.querySelector('.reset').addEventListener('click', () => {
      if (confirm('저장 데이터(레벨·별·연)를 모두 지울까요?')) { Save.reset(); App.goto('title'); }
    });
    return s;
  }

  // ---------- 스테이지 선택 ----------
  function stages(opts) {
    const s = h(`<div class="screen stages"></div>`);
    s.appendChild(topBar('작전 선택', () => App.goto('title')));
    const list = h(`<div class="stage-list"></div>`);
    STAGES.forEach((st, i) => {
      const unlocked = Save.stageUnlocked(st);
      const stars = Save.stageStars(st.id);
      const node = h(`<div class="stage-node ${unlocked ? '' : 'locked'}">
        <div class="sn-code">${st.code}</div>
        <div class="sn-name">${st.name}</div>
        <div class="sn-stars">${starStr(stars)}</div>
        <div class="sn-desc">${unlocked ? st.desc : '이전 작전을 클리어하면 열립니다'}</div>
        ${st.tutorial ? '<div class="sn-tag">튜토리얼</div>' : ''}
      </div>`);
      if (unlocked) node.addEventListener('click', () => App.goto('prep', { stageId: st.id }));
      list.appendChild(node);
      if (i < STAGES.length - 1) list.appendChild(h('<div class="stage-link"></div>'));
    });
    s.appendChild(list);
    s.appendChild(h(`<div class="stages-foot">별 평가: 기지 체력 손실 0 = ★3 · 1~3 = ★2 · 4 이상 = ★1 &nbsp;|&nbsp; 보상 배율 ★1 ×0.6 · ★2 ×0.8 · ★3 ×1.0</div>`));
    return s;
  }

  // ---------- 출전 확인 ----------
  function miniMap(st) {
    const grid = st.map.map(l => l.trim().split(/\s+/));
    const cv = document.createElement('canvas');
    const t = 26;
    cv.width = grid[0].length * t; cv.height = grid.length * t;
    const ctx = cv.getContext('2d');
    const col = { X: '#141821', R: '#3a4050', G: '#55617a', H: '#7a86a2', S: '#e2875f', B: '#5aa8ff' };
    grid.forEach((row, r) => row.forEach((c, i) => {
      ctx.fillStyle = col[c] || '#000'; ctx.fillRect(i * t + 1, r * t + 1, t - 2, t - 2);
      if (c === 'G') { ctx.strokeStyle = '#a9c4f0'; ctx.setLineDash([3, 3]); ctx.strokeRect(i * t + 4, r * t + 4, t - 8, t - 8); ctx.setLineDash([]); }
    }));
    cv.className = 'minimap';
    return cv;
  }

  function prep(opts) {
    const st = STAGES.find(x => x.id === opts.stageId);
    const s = h(`<div class="screen prep"></div>`);
    s.appendChild(topBar(`${st.code} ${st.name}`, () => App.goto('stages')));
    const enemyIds = [];
    st.waves.forEach(w => w.groups.forEach(g => { if (!enemyIds.includes(g.enemy)) enemyIds.push(g.enemy); }));
    const body = h(`<div class="prep-body">
      <div class="prep-left">
        <div class="panel-title">작전 정보</div>
        <p class="prep-desc">${st.desc}</p>
        <div class="mm-wrap"></div>
        <div class="legend"><span class="lg g">지상(근접)</span><span class="lg h">언덕(원거리)</span><span class="lg r">진격로</span><span class="lg s">출현</span><span class="lg b">기지</span></div>
        <div class="panel-title">출현 이상체 · 웨이브 ${st.waves.length}개</div>
        <div class="enemy-list">${enemyIds.map(id => {
          const e = ENEMIES.find(x => x.id === id);
          const gr = ENEMY_GRADES[e.grade] || {};
          return `<div class="en"><i style="background:${gr.color}"></i><b>${e.name}</b><span>${e.grade} · ${e.type}</span><small>${e.desc}</small></div>`;
        }).join('')}</div>
        <div class="reward">클리어 보상: 경험치 ${st.reward.exp} · ${st.reward.yen} 연 (별에 따라 배율)</div>
      </div>
      <div class="prep-right">
        <div class="panel-title">출전 엽사 (6명 고정)</div>
        <div class="party"></div>
        <button class="btn big start">작전 개시</button>
      </div>
    </div>`);
    body.querySelector('.mm-wrap').appendChild(miniMap(st));
    const party = body.querySelector('.party');
    for (const ch of CHARACTERS) {
      const sv = Save.char(ch.id);
      const cls = CFG().classes[ch.cls];
      const p = h(`<div class="pcard" style="--cls:${cls.color}"><div class="face"></div><div class="pc-info"><b>${ch.name}</b><span>${cls.name} · Lv.${sv.level}</span><small>코스트 ${ch.cost}</small></div></div>`);
      p.querySelector('.face').appendChild(faceEl(ch.id, 120, 100));
      p.addEventListener('click', () => App.goto('chars', { id: ch.id, back: () => App.goto('prep', opts) }));
      party.appendChild(p);
    }
    body.querySelector('.start').addEventListener('click', () => App.goto('battle', { stageId: st.id }));
    s.appendChild(body);
    return s;
  }

  // ---------- 캐릭터 정보 ----------
  function chars(opts) {
    opts = opts || {};
    let cur = opts.id || CHARACTERS[0].id;
    const s = h(`<div class="screen chars"></div>`);
    s.appendChild(topBar('엽사 명단', opts.back || (() => App.goto('title'))));
    const body = h(`<div class="chars-body"><div class="roster"></div><div class="detail"></div></div>`);
    s.appendChild(body);
    const roster = body.querySelector('.roster');
    const detail = body.querySelector('.detail');

    function renderRoster() {
      roster.innerHTML = '';
      for (const ch of CHARACTERS) {
        const cls = CFG().classes[ch.cls];
        const sv = Save.char(ch.id);
        const n = h(`<div class="ritem ${ch.id === cur ? 'on' : ''}" style="--cls:${cls.color}"><div class="face"></div><div><b>${ch.name}</b><span>${cls.name} · Lv.${sv.level}</span></div></div>`);
        n.querySelector('.face').appendChild(faceEl(ch.id, 70, 70));
        n.addEventListener('click', () => { cur = ch.id; renderRoster(); renderDetail(); });
        roster.appendChild(n);
      }
    }
    function renderDetail() {
      const ch = CHARACTERS.find(c => c.id === cur);
      const sv = Save.char(ch.id);
      const cls = CFG().classes[ch.cls];
      const st = charStats(ch, sv.level);
      const cap = Save.levelCap();
      const need = sv.level * CFG().expPerLevel;
      const expP = sv.level >= cap ? 100 : Math.round(sv.exp / need * 100);
      const dmgName = { physical: '물리', magic: '마법', heal: '회복' }[ch.dmgType];
      detail.innerHTML = '';
      const d = h(`<div class="detail-inner" style="--cls:${cls.color}">
        <div class="illust"></div>
        <div class="dinfo">
          <div class="d-cls">${cls.name} <small>— ${cls.desc}</small></div>
          <h2>${ch.name}</h2>
          <p class="d-prof">${ch.profile || ''}</p>
          <div class="d-lv">Lv.<b>${sv.level}</b> <small>/ ${cap}</small>
            <div class="expbar"><i style="width:${expP}%"></i></div>
            <small>${sv.level >= cap ? '레벨 상한 (엽사 등급을 올리면 상한이 늘어납니다)' : `경험치 ${sv.exp} / ${need}`}</small></div>
          <div class="stats">
            <div><span>체력</span><b>${st.hp}</b></div>
            <div><span>공격</span><b>${st.atk}</b></div>
            <div><span>방어</span><b>${st.def}</b></div>
            <div><span>마법저항</span><b>${st.res}</b></div>
            <div><span>공격 간격</span><b>${ch.interval}초</b></div>
            <div><span>범위</span><b>반경 ${ch.range}칸</b></div>
            <div><span>저지</span><b>${ch.tile === 'ground' ? ch.block : '-'}</b></div>
            <div><span>배치 칸</span><b>${ch.tile === 'ground' ? '지상' : '언덕'}</b></div>
            <div><span>코스트</span><b>${ch.cost}</b></div>
            <div><span>재배치</span><b>${ch.redeploy}초</b></div>
            <div><span>피해 유형</span><b>${dmgName}</b></div>
          </div>
          <div class="skill-box">
            <div class="sk-head"><b>스킬 「${ch.skill.name}」</b><span>게이지 ${ch.skill.sp}</span></div>
            <p>${ch.skill.desc}</p>
            <small>스킬 게이지는 1초에 1씩 차고, 가득 차면 캐릭터를 눌러 직접 사용합니다.</small>
          </div>
        </div>
      </div>`);
      const img = Assets.portraits[ch.id];
      const il = d.querySelector('.illust');
      if (img) { const im = img.cloneNode(); il.appendChild(im); }
      else il.appendChild(h(`<div class="illust-fallback">${ch.name}<small>assets/portraits/${ch.id}.png</small></div>`));
      detail.appendChild(d);
    }
    renderRoster(); renderDetail();
    return s;
  }

  // ---------- 결과 ----------
  function result(opts) {
    const st = STAGES.find(x => x.id === opts.stageId);
    const s = h(`<div class="screen result ${opts.win ? 'win' : 'lose'}">
      <div class="res-box">
        <div class="res-code">${st.code} ${st.name}</div>
        <h1>${opts.win ? '작전 성공' : '작전 실패'}</h1>
        ${opts.win ? `<div class="res-stars">${starStr(opts.stars)}</div><div class="res-sub">기지 체력 손실 ${opts.lost}</div>` : '<div class="res-sub">기지가 함락되었습니다. 배치를 바꿔 다시 도전해 보세요.</div>'}
        <div class="res-rewards"></div>
        <div class="res-chars"></div>
        <div class="res-btns">
          <button class="btn retry">다시 하기</button>
          <button class="btn big next">작전 선택으로</button>
        </div>
      </div>
    </div>`);
    if (opts.win && opts.reward) {
      const r = opts.reward;
      s.querySelector('.res-rewards').innerHTML = `<div><span>경험치</span><b>+${r.exp}</b></div><div><span>연</span><b>+${r.yen}</b></div><div><span>보유</span><b>${Save.data.yen.toLocaleString()} 연</b></div>`;
      const wrap = s.querySelector('.res-chars');
      for (const it of r.results) {
        const ch = CHARACTERS.find(c => c.id === it.id);
        const need = it.after.level * CFG().expPerLevel;
        const p = it.capped ? 100 : Math.round(it.after.exp / need * 100);
        const n = h(`<div class="rc"><div class="face"></div><b>${ch.name}</b><span>Lv.${it.after.level}</span><div class="expbar"><i style="width:${p}%"></i></div>${it.levelUps > 0 ? `<div class="lvup">LEVEL UP! +${it.levelUps}</div>` : ''}</div>`);
        n.querySelector('.face').appendChild(faceEl(ch.id, 90, 90));
        wrap.appendChild(n);
      }
    }
    s.querySelector('.retry').addEventListener('click', () => App.goto('battle', { stageId: st.id }));
    s.querySelector('.next').addEventListener('click', () => App.goto('stages'));
    return s;
  }

  return { title, stages, prep, chars, result };
})();
