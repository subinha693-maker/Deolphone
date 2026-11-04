// Persistent save (permanent progression, settings, codex). localStorage when available,
// in-memory fallback otherwise (sandboxed viewers, private windows). Never throws.
(function () {
  const MG = (window.MG = window.MG || {});
  const KEY = 'mg_save';
  const VERSION = 1;

  function defaults() {
    return {
      v: VERSION,
      moon: 0,
      upgrades: {},
      unlocks: { characters: (MG.DEFAULT_UNLOCKED || []).slice(), relics: [], events: [] },
      ascension: { unlocked: 0, selected: 0 },
      stats: { runs: 0, clears: 0, bestNode: 0, kills: 0, elites: 0 },
      codex: { relics: {}, enemies: {}, events: {}, characters: {} },
      settings: { master: 0.8, sfx: 1, bgm: 0.6, muted: false },
      lastParty: [],
    };
  }

  /** Fill missing fields from defaults (recursively for plain objects). */
  function fill(target, def) {
    for (const k of Object.keys(def)) {
      if (target[k] === undefined || target[k] === null) target[k] = def[k];
      else if (typeof def[k] === 'object' && !Array.isArray(def[k]) && typeof target[k] === 'object') fill(target[k], def[k]);
    }
    return target;
  }

  function storage() {
    try {
      return typeof window.localStorage !== 'undefined' ? window.localStorage : null;
    } catch (e) {
      return null;
    }
  }

  const Save = {
    KEY,
    data: null,
    persistent: false,
    _timer: null,
    _forceFail: false, // tests: simulate blocked storage

    migrate(d) {
      // future: if (d.v < 2) { ...; d.v = 2; }
      d.v = VERSION;
      return fill(d, defaults());
    },

    load() {
      this.data = defaults();
      this.persistent = false;
      const st = this._forceFail ? null : storage();
      if (!st) return this.data;
      try {
        st.setItem(KEY + '_probe', '1');
        st.removeItem(KEY + '_probe');
        this.persistent = true;
      } catch (e) {
        this.persistent = false;
        return this.data;
      }
      let raw = null;
      try {
        raw = st.getItem(KEY);
      } catch (e) {
        raw = null;
      }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') throw new Error('bad save');
          this.data = this.migrate(parsed);
        } catch (e) {
          try {
            st.setItem(KEY + '_corrupt', raw);
          } catch (e2) {
            /* ignore */
          }
          this.data = defaults();
        }
      }
      return this.data;
    },

    get() {
      if (!this.data) this.load();
      return this.data;
    },

    update(fn) {
      fn(this.get());
      this.scheduleFlush();
    },

    scheduleFlush() {
      if (typeof setTimeout !== 'function') return this.flush();
      if (typeof clearTimeout === 'function') clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), 500);
    },

    flush() {
      if (typeof clearTimeout === 'function') clearTimeout(this._timer);
      if (!this.persistent || this._forceFail) return false;
      const st = storage();
      if (!st) return false;
      try {
        st.setItem(KEY, JSON.stringify(this.data));
        return true;
      } catch (e) {
        this.persistent = false;
        return false;
      }
    },

    exportString() {
      const json = JSON.stringify(this.get());
      try {
        return btoa(unescape(encodeURIComponent(json)));
      } catch (e) {
        return '';
      }
    },

    importString(s) {
      try {
        const json = decodeURIComponent(escape(atob(String(s).trim())));
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object' || parsed.v == null) return { ok: false, reason: '저장 문자열 형식이 아닙니다' };
        this.data = this.migrate(parsed);
        this.flush();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: '저장 문자열을 읽을 수 없습니다' };
      }
    },

    reset() {
      this.data = defaults();
      this.flush();
    },

    defaults,
  };

  MG.Save = Save;
})();
