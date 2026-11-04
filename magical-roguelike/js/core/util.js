// Shared helpers: seeded RNG, event bus, small math utilities.
(function () {
  const MG = (window.MG = window.MG || {});

  /** Mulberry32 seeded RNG so a run (map + rewards) can be reproduced from its seed. */
  function RNG(seed) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (a, b) => a + (b - a) * next(),
      int: (a, b) => a + Math.floor(next() * (b - a + 1)), // inclusive
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      weighted(entries) {
        // entries: [{w, v}]
        const total = entries.reduce((a, e) => a + e.w, 0);
        let r = next() * total;
        for (const e of entries) {
          r -= e.w;
          if (r <= 0) return e.v;
        }
        return entries[entries.length - 1].v;
      },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
    };
  }

  /** Minimal synchronous pub/sub. */
  class EventBus {
    constructor() {
      this.handlers = {};
    }
    on(evt, fn) {
      (this.handlers[evt] = this.handlers[evt] || []).push(fn);
      return () => this.off(evt, fn);
    }
    off(evt, fn) {
      const l = this.handlers[evt];
      if (l) this.handlers[evt] = l.filter((f) => f !== fn);
    }
    emit(evt, payload) {
      const l = this.handlers[evt];
      if (!l) return;
      for (const fn of l.slice()) fn(payload);
    }
  }

  MG.RNG = RNG;
  MG.EventBus = EventBus;
  MG.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  MG.lerp = (a, b, t) => a + (b - a) * t;
  MG.uid = (() => {
    let n = 0;
    return (p) => (p || 'id') + '_' + ++n;
  })();
})();
