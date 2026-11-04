// Procedural audio (Web Audio API, no files). Every call is a safe no-op when audio is
// unavailable or blocked. Battle sounds come from battle.bus events (game rules never call audio).
// Sounds are defined as define(name, {synth, file}); registerFile() can later swap in real files.
(function () {
  const MG = (window.MG = window.MG || {});

  const MAX_VOICES = 24;
  const defs = {};
  const define = (name, d) => (defs[name] = Object.assign({ gap: 0.03 }, d));

  const Audio = {
    ctx: null,
    master: null,
    sfxBus: null,
    bgmBus: null,
    noise: null,
    voices: 0,
    lastPlay: {},
    bgm: null, // {id, gain, timer, step, next}
    wantBgm: null,
    duck: 1,

    settings() {
      return MG.Save ? MG.Save.get().settings : { master: 0.8, sfx: 1, bgm: 0.6, muted: false };
    },

    /** Create / resume the AudioContext. Must be called from a user gesture. */
    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.sfxBus = this.ctx.createGain();
          this.bgmBus = this.ctx.createGain();
          const comp = this.ctx.createDynamicsCompressor();
          this.sfxBus.connect(this.master);
          this.bgmBus.connect(this.master);
          this.master.connect(comp);
          comp.connect(this.ctx.destination);
          const len = this.ctx.sampleRate * 0.5;
          this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const ch = this.noise.getChannelData(0);
          for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
          document.addEventListener('visibilitychange', () => {
            if (!this.ctx) return;
            if (document.hidden) this.ctx.suspend().catch(() => {});
            else this.ctx.resume().catch(() => {});
          });
          this.applySettings();
          if (this.wantBgm) this.playBgm(this.wantBgm);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (e) {
        this.ctx = null;
      }
    },

    applySettings() {
      if (!this.ctx) return;
      const s = this.settings();
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.02);
      this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.02);
      this.bgmBus.gain.setTargetAtTime(s.bgm * 0.5 * this.duck, t, 0.05);
    },
    setDuck(on) {
      this.duck = on ? 0.35 : 1;
      this.applySettings();
    },

    // ---------- primitives ----------
    tone(freq, dur, o) {
      const c = this.ctx;
      const p = o || {};
      const t0 = c.currentTime + (p.delay || 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = p.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (p.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.slide), t0 + dur);
      const vol = p.vol == null ? 0.3 : p.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (p.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(p.bus || this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      this.voices++;
      osc.onended = () => this.voices--;
    },
    noiseHit(dur, o) {
      const c = this.ctx;
      const p = o || {};
      const t0 = c.currentTime + (p.delay || 0);
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = p.filter || 'bandpass';
      f.frequency.value = p.freq || 1200;
      f.Q.value = p.q || 1;
      const g = c.createGain();
      g.gain.setValueAtTime(p.vol == null ? 0.3 : p.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(p.bus || this.sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      this.voices++;
      src.onended = () => this.voices--;
    },
    chord(freqs, dur, o) {
      freqs.forEach((f, i) => this.tone(f, dur, Object.assign({}, o, { delay: ((o && o.delay) || 0) + i * ((o && o.arp) || 0) })));
    },

    // ---------- public ----------
    play(name, opts) {
      try {
        if (!this.ctx || this.settings().muted) return;
        const d = defs[name];
        if (!d) return;
        const now = this.ctx.currentTime;
        if (now - (this.lastPlay[name] || -9) < d.gap) return;
        if (this.voices > MAX_VOICES) return;
        this.lastPlay[name] = now;
        if (d.buffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = d.buffer;
          src.connect(this.sfxBus);
          src.start();
        } else d.synth(this, opts || {});
      } catch (e) {
        /* audio must never break the game */
      }
    },
    define,
    /** Optional: replace a synth sound with a real file later. */
    registerFile(name, url) {
      try {
        if (!this.ctx) return;
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((buf) => {
            defs[name] = Object.assign(defs[name] || { gap: 0.03 }, { buffer: buf });
          })
          .catch(() => {});
      } catch (e) {
        /* ignore */
      }
    },

    // ---------- BGM (look-ahead step sequencer) ----------
    playBgm(id) {
      this.wantBgm = id;
      if (!this.ctx) return;
      if (this.bgm && this.bgm.id === id) return;
      const old = this.bgm;
      if (old) {
        clearInterval(old.timer);
        old.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
        setTimeout(() => old.gain.disconnect(), 1200);
      }
      const track = TRACKS[id];
      if (!track) {
        this.bgm = null;
        return;
      }
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.27); // ~0.8s crossfade
      gain.connect(this.bgmBus);
      const b = { id, gain, step: 0, next: this.ctx.currentTime + 0.05, track };
      b.timer = setInterval(() => this.schedule(b), 50);
      this.bgm = b;
    },
    schedule(b) {
      if (!this.ctx || this.bgm !== b) return;
      const spb = 60 / b.track.bpm / 2; // eighth notes
      while (b.next < this.ctx.currentTime + 0.2) {
        b.track.step(this, b.step, b.next, spb, b.gain);
        b.step++;
        b.next += spb;
      }
    },
    /** BGM note at absolute time. */
    note(bus, freq, at, dur, type, vol) {
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol || 0.08, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g);
      g.connect(bus);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    },
    drum(bus, at, kind) {
      const c = this.ctx;
      if (kind === 'kick') {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.setValueAtTime(140, at);
        o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
        g.gain.setValueAtTime(0.35, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
        o.connect(g);
        g.connect(bus);
        o.start(at);
        o.stop(at + 0.2);
      } else {
        const s = c.createBufferSource();
        s.buffer = this.noise;
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = kind === 'hat' ? 7000 : 1800;
        const g = c.createGain();
        g.gain.setValueAtTime(kind === 'hat' ? 0.05 : 0.14, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'hat' ? 0.04 : 0.12));
        s.connect(f);
        f.connect(g);
        g.connect(bus);
        s.start(at);
        s.stop(at + 0.15);
      }
    },

    // ---------- wiring ----------
    attachBattle(battle) {
      const bus = battle.bus;
      bus.on('attack', ({ melee }) => this.play(melee ? 'hit_melee' : 'hit_ranged'));
      bus.on('skillHit', () => this.play('hit_skill'));
      bus.on('enemyKilled', () => this.play('enemy_die'));
      bus.on('allyDamaged', ({ dmg, unit }) => dmg > unit.maxHp * 0.05 && this.play('ally_hurt'));
      bus.on('allyDown', () => this.play('ally_down'));
      bus.on('skillCast', ({ skill }) => this.play('cast_' + skill.type));
      bus.on('swapIn', () => this.play('swap'));
      bus.on('laneMoveStart', () => this.play('lane_move'));
      bus.on('laneMoveEnd', () => this.play('lane_move'));
      bus.on('leak', () => this.play('leak_alarm'));
      bus.on('waveStart', () => this.play('wave_start'));
      bus.on('waveEnd', () => this.play('wave_clear'));
      bus.on('spawnWarning', () => this.play('boss_warning'));
      bus.on('relicProc', () => this.play('relic_proc'));
      bus.on('phase', ({ phase }) => {
        if (phase === 'nodeClear') this.play('node_clear');
        if (phase === 'defeat') this.play('defeat');
      });
    },
    bgmForState(state, gm) {
      switch (state) {
        case 'TITLE':
        case 'SANCTUARY':
        case 'CODEX':
        case 'PARTY_SELECT':
          return 'title';
        case 'MAP':
        case 'RUN_FAILED':
        case 'RUN_CLEARED':
          return 'map';
        case 'BATTLE':
        case 'REWARD':
          return gm.battle && gm.battle.node.type === 'final' ? 'boss' : 'battle';
        case 'EVENT':
        case 'REST':
        case 'RELIC':
        case 'RECRUIT':
          return 'event_rest';
        case 'SHOP':
          return 'shop';
        default:
          return null;
      }
    },
  };

  // ---------------- sound definitions ----------------
  const N = (semi) => 440 * Math.pow(2, semi / 12);
  define('hit_ranged', { gap: 0.05, synth: (a) => a.tone(N(10), 0.08, { type: 'triangle', slide: N(3), vol: 0.12 }) });
  define('hit_melee', { gap: 0.05, synth: (a) => a.noiseHit(0.08, { freq: 2400, q: 2, vol: 0.22 }) });
  define('hit_skill', { gap: 0.06, synth: (a) => (a.noiseHit(0.12, { freq: 900, vol: 0.2 }), a.tone(N(-5), 0.12, { type: 'square', vol: 0.06 })) });
  define('enemy_die', { gap: 0.06, synth: (a) => a.tone(N(0), 0.25, { type: 'square', slide: N(-24), vol: 0.07 }) });
  define('ally_hurt', { gap: 0.12, synth: (a) => a.tone(N(-8), 0.15, { type: 'sawtooth', slide: N(-14), vol: 0.08 }) });
  define('ally_down', { synth: (a) => a.chord([N(-5), N(-9), N(-12)], 0.5, { type: 'triangle', arp: 0.12, vol: 0.12 }) });
  define('cast_heal', { synth: (a) => a.chord([N(3), N(7), N(10), N(15)], 0.5, { type: 'sine', arp: 0.06, vol: 0.12 }) });
  define('cast_regen', { synth: (a) => a.chord([N(5), N(9), N(12), N(17)], 0.6, { type: 'sine', arp: 0.08, vol: 0.1 }) });
  define('cast_aoe', { synth: (a) => (a.tone(N(12), 0.5, { type: 'sawtooth', slide: N(-12), vol: 0.08 }), a.noiseHit(0.4, { freq: 600, vol: 0.18, delay: 0.1 })) });
  define('cast_multi', { synth: (a) => [0, 1, 2, 3].forEach((i) => a.tone(N(14 - i * 2), 0.1, { type: 'triangle', vol: 0.08, delay: i * 0.05 })) });
  define('cast_shield', { synth: (a) => a.tone(N(7), 0.45, { type: 'sine', slide: N(19), vol: 0.12 }) });
  define('cast_sanctuary', { synth: (a) => a.chord([N(0), N(4), N(7)], 0.7, { type: 'triangle', vol: 0.08 }) });
  define('cast_single', { synth: (a) => (a.noiseHit(0.2, { freq: 3000, q: 3, vol: 0.25 }), a.tone(N(-12), 0.3, { type: 'square', vol: 0.08 })) });
  define('cast_void', { synth: (a) => a.tone(N(-12), 0.6, { type: 'sawtooth', slide: N(-30), vol: 0.1 }) });
  define('cast_freeze', { synth: (a) => [0, 1, 2].forEach((i) => a.tone(N(19 + i * 3), 0.2, { type: 'sine', vol: 0.08, delay: i * 0.04 })) });
  define('cast_defense', { synth: (a) => a.chord([N(-12), N(-5), N(0)], 1.0, { type: 'triangle', vol: 0.1 }) });
  define('cast_tag', { synth: (a) => (a.tone(N(5), 0.15, { type: 'square', vol: 0.07 }), a.tone(N(12), 0.2, { type: 'square', vol: 0.07, delay: 0.1 })) });
  define('swap', { synth: (a) => a.tone(N(0), 0.15, { type: 'triangle', slide: N(12), vol: 0.1 }) });
  define('lane_move', { gap: 0.2, synth: (a) => a.noiseHit(0.15, { freq: 500, vol: 0.08 }) });
  define('leak_alarm', { gap: 0.4, synth: (a) => [0, 1].forEach((i) => a.tone(N(3), 0.15, { type: 'square', vol: 0.1, delay: i * 0.2 })) });
  define('wave_start', { synth: (a) => a.chord([N(-5), N(0), N(7)], 0.3, { type: 'square', arp: 0.07, vol: 0.06 }) });
  define('wave_clear', { synth: (a) => a.chord([N(0), N(4), N(7), N(12)], 0.4, { type: 'triangle', arp: 0.06, vol: 0.1 }) });
  define('node_clear', { synth: (a) => a.chord([N(0), N(4), N(7), N(12), N(16)], 0.8, { type: 'triangle', arp: 0.09, vol: 0.12 }) });
  define('defeat', { synth: (a) => a.chord([N(0), N(-3), N(-7), N(-12)], 1.0, { type: 'sawtooth', arp: 0.2, vol: 0.06 }) });
  define('relic_proc', { gap: 0.4, synth: (a) => a.tone(N(17), 0.12, { type: 'sine', vol: 0.06 }) });
  define('ui_click', { gap: 0.04, synth: (a) => a.tone(N(12), 0.05, { type: 'triangle', vol: 0.08 }) });
  define('ui_hover', { gap: 0.06, synth: (a) => a.tone(N(19), 0.03, { type: 'sine', vol: 0.03 }) });
  define('reward_pick', { synth: (a) => a.chord([N(7), N(12), N(19)], 0.35, { type: 'triangle', arp: 0.05, vol: 0.1 }) });
  define('coin', { synth: (a) => (a.tone(N(19), 0.08, { type: 'square', vol: 0.06 }), a.tone(N(24), 0.18, { type: 'square', vol: 0.06, delay: 0.07 })) });
  define('potion', { synth: (a) => [0, 1, 2].forEach((i) => a.tone(N(5 + i * 4), 0.12, { type: 'sine', vol: 0.08, delay: i * 0.06 })) });
  define('type_tick', { gap: 0.05, synth: (a) => a.tone(N(24), 0.02, { type: 'square', vol: 0.015 }) });
  define('toast', { gap: 0.2, synth: (a) => a.tone(N(10), 0.08, { type: 'sine', vol: 0.05 }) });
  define('boss_warning', { gap: 0.8, synth: (a) => [0, 1, 2].forEach((i) => a.tone(N(-12), 0.25, { type: 'sawtooth', vol: 0.08, delay: i * 0.28 })) });

  // ---------------- BGM tracks ----------------
  // scale helpers (A minor pentatonic etc.), notes in semitones from A4
  const pent = [0, 3, 5, 7, 10];
  const TRACKS = {
    title: {
      bpm: 70,
      step(a, s, t, spb, bus) {
        const prog = [[-12, -9, -5], [-16, -12, -9], [-19, -15, -12], [-14, -10, -7]][Math.floor(s / 8) % 4];
        a.note(bus, N(prog[s % 3] + 12), t, spb * 1.8, 'triangle', 0.05);
        if (s % 8 === 0) a.note(bus, N(prog[0] - 12), t, spb * 8, 'sine', 0.07);
      },
    },
    map: {
      bpm: 84,
      step(a, s, t, spb, bus) {
        if (s % 2 === 0) a.note(bus, N(pent[(s * 3) % 5] - 3), t, spb * 1.6, 'triangle', 0.035);
        if (s % 8 === 0) a.note(bus, N([-15, -19, -17, -22][Math.floor(s / 8) % 4] - 12), t, spb * 7, 'sine', 0.07);
      },
    },
    battle: {
      bpm: 132,
      step(a, s, t, spb, bus) {
        if (s % 4 === 0) a.drum(bus, t, 'kick');
        if (s % 4 === 2) a.drum(bus, t, 'snare');
        a.drum(bus, t, 'hat');
        const root = [-24, -24, -20, -22][Math.floor(s / 16) % 4];
        if (s % 2 === 0) a.note(bus, N(root + (s % 4 === 2 ? 12 : 0)), t, spb * 0.9, 'sawtooth', 0.045);
        if (s % 4 === 1) a.note(bus, N(root + 24 + pent[(s >> 2) % 5]), t, spb * 0.8, 'square', 0.022);
      },
    },
    boss: {
      bpm: 150,
      step(a, s, t, spb, bus) {
        if (s % 2 === 0) a.drum(bus, t, 'kick');
        if (s % 4 === 2) a.drum(bus, t, 'snare');
        const root = [-24, -23, -24, -18][Math.floor(s / 8) % 4];
        a.note(bus, N(root + (s % 3 === 0 ? 6 : 0)), t, spb * 0.8, 'sawtooth', 0.05);
        if (s % 8 === 4) a.note(bus, N(root + 25), t, spb * 2, 'square', 0.025);
      },
    },
    event_rest: {
      bpm: 60,
      step(a, s, t, spb, bus) {
        if (s % 8 === 0) {
          const ch = [[-12, -8, -5], [-14, -10, -7], [-17, -13, -10], [-15, -12, -8]][Math.floor(s / 8) % 4];
          for (const f of ch) a.note(bus, N(f), t, spb * 8, 'sine', 0.035);
        }
        if (s % 4 === 2) a.note(bus, N(pent[s % 5] + 3), t, spb * 2, 'triangle', 0.02);
      },
    },
    shop: {
      bpm: 112,
      step(a, s, t, spb, bus) {
        const mel = [0, 4, 7, 12, 7, 4, 2, 5];
        a.note(bus, N(mel[s % 8] + 3), t, spb * 0.6, 'sine', 0.05);
        if (s % 4 === 0) a.note(bus, N([-21, -17, -14, -19][Math.floor(s / 8) % 4]), t, spb * 3, 'triangle', 0.06);
      },
    },
  };

  MG.Audio = Audio;
})();
