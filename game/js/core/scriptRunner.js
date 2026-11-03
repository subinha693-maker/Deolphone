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
      'player.name': run.player.name,
      'job.name': job ? job.name : '',
      'job.role': job ? job.role : '',
      'ability.name': ability ? ability.name : '',
      'loop': String(run.loop),
    };
    return text.replace(/\{([\w.]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
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
        const target = m ? m[2] : 'next';
        await g.ui.dialogue.choose([label], { kind: 'end' });
        if (!alive()) return null;
        g.scenes.goTo(target, { from: 'whiteSpace' });
        return null;
      }
      default:
        console.warn('[script] 알 수 없는 명령:', name);
        return null;
    }
  }
};

WS.sleep = ms => new Promise(r => setTimeout(r, ms));
