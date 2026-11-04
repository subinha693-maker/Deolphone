// Image loading, pixel-art enemy rasterising, portrait generation.
(function () {
  const MG = (window.MG = window.MG || {});

  const Assets = {
    images: {},
    enemyFrames: {}, // id -> [{normal, flash}]
    portraits: {}, // charId -> dataURL

    load() {
      const list = Object.keys(MG.CHARACTERS).map((id) => ['char_' + id, `assets/sprites/${id}.png`]);
      list.push(['ui_dialog', 'assets/ui/dialog_box.png'], ['ui_name', 'assets/ui/name_tab.png'], ['ui_choice_light', 'assets/ui/choice_light.png'], ['ui_choice_dark', 'assets/ui/choice_dark.png'], ['ui_divider', 'assets/ui/divider.png']);
      return Promise.all(
        list.map(
          ([key, src]) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                this.images[key] = img;
                resolve();
              };
              img.onerror = () => {
                console.error('failed to load', src);
                resolve();
              };
              img.src = src;
            })
        )
      ).then(() => {
        this.buildEnemyFrames();
        this.buildPortraits();
      });
    },

    rasterArt(rows, scale, flash) {
      const w = Math.max(...rows.map((r) => r.length));
      const h = rows.length;
      const c = document.createElement('canvas');
      c.width = w * scale;
      c.height = h * scale;
      const g = c.getContext('2d');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          const ch = rows[y][x];
          if (ch === '.') continue;
          g.fillStyle = flash ? (ch === 'K' ? '#ffd6e6' : '#ffffff') : MG.PIXEL_PALETTE[ch] || '#f0f';
          g.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      return c;
    },

    buildEnemyFrames() {
      for (const [id, art] of Object.entries(MG.ENEMY_ART)) {
        this.enemyFrames[id] = art.frames.map((rows) => ({
          normal: this.rasterArt(rows, art.scale, false),
          flash: this.rasterArt(rows, art.scale, true),
        }));
      }
    },

    /** Small data-URL icon of an enemy (first frame), cached. */
    enemyIcon(id) {
      this._icons = this._icons || {};
      if (!this._icons[id]) {
        const fr = this.enemyFrames[id];
        this._icons[id] = fr ? fr[0].normal.toDataURL() : '';
      }
      return this._icons[id];
    },

    buildPortraits() {
      for (const id of Object.keys(MG.CHARACTERS)) {
        const img = this.images['char_' + id];
        const f = MG.SPRITE_DATA[id].idle[0];
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const g = c.getContext('2d');
        if (img) {
          // head & shoulders: top ~55% of the idle frame
          const sw = Math.min(f.w, 46);
          const sx = f.x + Math.round((f.w - sw) / 2);
          g.drawImage(img, sx, f.y, sw, sw, 0, 0, 64, 64);
        }
        this.portraits[id] = c.toDataURL();
      }
    },

    /** Draw a character animation frame anchored at feet (x, y). */
    drawFrame(g, charId, anim, index, x, y, scale, alpha) {
      const img = this.images['char_' + charId];
      const frames = MG.SPRITE_DATA[charId][anim];
      if (!img || !frames) return;
      const f = frames[Math.max(0, Math.min(index | 0, frames.length - 1))];
      const s = scale || 1;
      if (alpha != null) g.globalAlpha = alpha;
      g.drawImage(img, f.x, f.y, f.w, f.h, Math.round(x + f.ox * s), Math.round(y + f.oy * s), Math.round(f.w * s), Math.round(f.h * s));
      if (alpha != null) g.globalAlpha = 1;
    },

    /** Draw the frame centred on (x, y) — used for projectile/impact effect frames. */
    drawFrameCentered(g, charId, anim, index, x, y, scale, alpha) {
      const img = this.images['char_' + charId];
      const frames = MG.SPRITE_DATA[charId][anim];
      if (!img || !frames || !frames[index]) return false;
      const f = frames[index];
      const s = scale || 1;
      if (alpha != null) g.globalAlpha = alpha;
      g.drawImage(img, f.x, f.y, f.w, f.h, Math.round(x - (f.w * s) / 2), Math.round(y - (f.h * s) / 2), Math.round(f.w * s), Math.round(f.h * s));
      if (alpha != null) g.globalAlpha = 1;
      return true;
    },
  };

  MG.Assets = Assets;
})();
