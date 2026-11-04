/*
 * 스크립트 실행기
 *  - 노드를 순서대로 실행하고, 대사/선택지/연출이 끝날 때까지 기다린다.
 *  - 다시 시작하면 runId 가 바뀌어 이전 실행은 다음 대기 지점에서 스스로 멈춘다.
 *  - 화면 처리는 ctx(game) 가 제공하는 함수에 맡긴다 (UI · 연출과 분리).
 */
window.WS = window.WS || {};

WS.ScriptRunner = class {
  constructor(game) {
    this.game = game;
    this.runId = 0;
    this.pc = 0;
    this.program = null;
  }

  stop() { this.runId++; }

  async run(source) {
    const myRun = ++this.runId;
    this.program = WS.parseScript(source);
    this.pc = 0;
    const { nodes, labels } = this.program;
    const alive = () => myRun === this.runId;

    while (this.pc < nodes.length) {
      const node = nodes[this.pc++];
      try {
        const jump = await this.exec(node, alive, labels);
        if (!alive()) return 'aborted';
        if (jump) {
          if (!(jump in labels)) throw new Error(`라벨 없음: ${jump}`);
          this.pc = labels[jump];
        }
      } catch (err) {
        console.error(`[script] ${node.line}행 실행 오류:`, err);
        if (!alive()) return 'aborted';
        this.game.ui.toast('스크립트 오류: ' + err.message, true);
      }
    }
    return 'done';
  }

  interpolate(text) {
    const run = this.game.state;
    const job = WS.getJob(run.player.jobId);
    const ability = run.player.abilities[0];
    const vars = {
      'player.name': run.player.name || WS.DEFAULT_PLAYER_NAME,
      'job.name': job ? job.name : '',
      'job.role': job ? job.role : '',
      'ability.name': ability ? ability.name : '',
      'loop': String(run.loop),
    };
    // {변수} 또는 {변수:이/가} — 조사는 받침에 맞춰 자동 선택
    return text.replace(/\{([\w.]+)(?::([^}]+))?\}/g, (m, k, josa) => {
      if (!(k in vars)) return m;
      return josa ? WS.josa(vars[k], josa) : vars[k];
    });
  }

  async exec(node, alive) {
    const g = this.game;
    switch (node.type) {
      case 'heading':
        g.state.sceneLabel = node.title;
        return null;

      case 'say':
        await g.ui.dialogue.say(node.speaker, this.interpolate(node.text));
        return null;

      case 'choice': {
        const options = node.options.filter(o => WS.Progression.check(o.cond, g.meta, g.state));
        const picked = await g.ui.dialogue.choose(options.map(o => this.interpolate(o.text)));
        if (!alive()) return null;
        g.state.choices[node.id] = picked;
        return options[picked].goto;
      }

      case 'cmd':
        return this.command(node.name, node.args, alive);
    }
    return null;
  }

  async command(name, args, alive) {
    const g = this.game;
    const [a0, a1] = args.split(/\s+/);
    const ms = (v, d) => (isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

    switch (name) {
      case 'fadein':
        await g.stage.fadeIn(ms(a0, 2000));
        return null;
      case 'wait':
        await WS.sleep(ms(a0, 500));
        return null;
      case 'silence':
        g.ui.dialogue.hide();
        g.stage.setMood('hush');
        await WS.sleep(ms(a0, 1500));
        if (alive()) g.stage.setMood('normal');
        return null;
      case 'show':
        await g.stage.show(a0, ms(a1, 1200));
        return null;
      case 'hide':
        await g.stage.hide(a0, ms(a1, 1200));
        return null;
      case 'mood':
        g.stage.setMood(a0 || 'normal');
        return null;
      case 'jobselect': {
        g.ui.dialogue.hide();
        const jobId = await g.ui.jobSelect.open(g.meta, g.state);
        if (!alive()) return null;
        WS.State.applyJob(g.state, jobId);
        g.ui.hud.refresh();
        return null;
      }
      case 'awaken': {
        const job = WS.getJob(g.state.player.jobId);
        if (!job) throw new Error('@awaken 전에 @jobselect 가 필요합니다.');
        g.ui.dialogue.hide();
        // 연출 정점(섬광)에서 능력 등록 + 외형 변경
        await g.stage.playAwakening(job, () => {
          WS.State.awaken(g.state);
          g.ui.hud.refresh();
        });
        return null;
      }
      case 'notify':
        g.ui.toast(this.interpolate(args));
        return null;
      case 'set':
        g.state.flags[a0] = true;
        return null;
      case 'goto':
        return a0;
      case 'end': {
        const m = args.match(/^(.*?)\s*->\s*(\S+)$/);
        const label = m ? m[1] : args;
        const from = g.scenes.current;
        const target = m ? m[2] : g.scenes.nextId;
        await g.ui.dialogue.choose([label], { kind: 'end' });
        if (!alive()) return null;
        if (!target) { g.ui.toast('다음 장면이 지정되지 않았습니다.', true); return null; }
        g.scenes.goTo(target, { from });
        return null;
      }
      case 'goscene': {
        // 버튼 없이 바로 장면 이동
        const from = g.scenes.current;
        g.ui.dialogue.hide();
        await g.scenes.goTo(a0, { from });
        return null;
      }
      case 'give': {
        // @give 아이템ID  — 이미 가진 고유 아이템이면 다시 주지 않는다
        const item = WS.ITEMS[a0];
        if (!item) throw new Error('아이템 데이터가 없습니다: ' + a0);
        if (WS.State.giveItem(g.state, a0)) g.ui.toast(`「${item.name}」을(를) 얻었다`);
        g.ui.hud.refresh();
        return null;
      }
      case 'event':
        // @event 이름  — 현재 장면의 이벤트 진행 기록 (세이브 대상)
        WS.State.sceneData(g.state, g.state.sceneId).events[a0] = true;
        return null;
      case 'nameinput': {
        // @nameinput 질문문구  — 주인공 이름을 직접 입력받는다
        g.ui.dialogue.hide();
        const name = await g.ui.askName(args || null);
        if (!alive()) return null;
        g.state.player.name = name;
        return null;
      }
      case 'closeup':
        // @closeup 캐릭터이름 | @closeup off
        if (!a0 || a0 === 'off') g.ui.closeup(null);
        else g.ui.closeup(WS.findCharacterId(a0) || a0);
        return null;
      default: {
        // 장면 · 맵 시스템이 등록한 명령 (WS.SCRIPT_COMMANDS)
        const ext = WS.SCRIPT_COMMANDS[name];
        if (ext) return ext(g, args.split(/\s+/).filter(Boolean), alive);
        console.warn('[script] 알 수 없는 명령:', name);
        return null;
      }
    }
  }
};

WS.sleep = ms => new Promise(r => setTimeout(r, ms));

/** 장면 · 시스템별 추가 스크립트 명령: WS.SCRIPT_COMMANDS.이름 = async (game, args, alive) => 점프할라벨|null */
WS.SCRIPT_COMMANDS = WS.SCRIPT_COMMANDS || {};

/**
 * 한 파일에 여러 스크립트를 섹션으로 나눠 쓰기
 *   === 섹션이름
 *   ...대사...
 * → { 섹션이름: '...대사...' }
 */
WS.splitSections = function (text) {
  const out = {};
  let name = null, buf = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^===\s*(\S+)/);
    if (m) {
      if (name) out[name] = buf.join('\n');
      name = m[1]; buf = [];
    } else if (name) buf.push(line);
  }
  if (name) out[name] = buf.join('\n');
  return out;
};
