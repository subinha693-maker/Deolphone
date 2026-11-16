// 이미지 불러오기. 없는 이미지는 null 로 두고 게임은 임시 그래픽으로 계속 진행합니다.
const Assets = {
  portraits: {},   // id -> Image
  sprites: {},     // id -> { action -> [Image|null] }
  enemies: {},     // id -> Image
  bullets: {},     // id -> Image

  loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      img.onload = () => finish(img.naturalWidth > 0 ? img : null);
      img.onerror = () => finish(null);
      setTimeout(() => finish(null), 8000);
      img.src = src;
    });
  },

  async loadAll(onProgress) {
    const tasks = [];
    const add = (src, cb) => tasks.push(() => this.loadImage(src).then(cb));
    for (const ch of CHARACTERS) {
      add(`assets/portraits/${ch.id}.png`, img => { if (img) this.portraits[ch.id] = img; });
      add(`assets/effects/${ch.id}_bullet.png`, img => { if (img) this.bullets[ch.id] = img; });
      const anim = (ANIMATIONS.characters || {})[ch.id];
      this.sprites[ch.id] = {};
      if (!anim) continue;
      for (const [act, def] of Object.entries(anim.actions || {})) {
        const frames = new Array(def.frames).fill(null);
        this.sprites[ch.id][act] = frames;
        for (let i = 0; i < def.frames; i++) {
          add(`assets/sprites/${ch.id}/${act}_${i + 1}.png`, img => { frames[i] = img; });
        }
      }
    }
    for (const en of ENEMIES) {
      add(`assets/enemies/${en.id}.png`, img => { if (img) this.enemies[en.id] = img; });
    }
    let done = 0;
    const total = tasks.length;
    // 동시에 너무 많이 요청하지 않도록 나눠서 불러옴
    const queue = tasks.slice();
    const worker = async () => {
      while (queue.length) {
        const t = queue.shift();
        await t();
        done++;
        if (onProgress) onProgress(done / total);
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));

    // 프레임이 하나도 없는 동작은 '없음'으로 처리. 일부만 있으면 있는 프레임으로 채움
    for (const id of Object.keys(this.sprites)) {
      for (const act of Object.keys(this.sprites[id])) {
        const fr = this.sprites[id][act];
        if (!fr.some(Boolean)) { delete this.sprites[id][act]; continue; }
        let last = fr.find(Boolean);
        for (let i = 0; i < fr.length; i++) { if (fr[i]) last = fr[i]; else fr[i] = last; }
      }
    }
  },

  hasAction(id, act) { return !!(this.sprites[id] && this.sprites[id][act]); },

  // 카드용 얼굴 크롭을 그린 canvas 를 만들어 돌려줌 (초상화가 없으면 null)
  faceCanvas(id, w, h) {
    const img = this.portraits[id];
    if (!img) return null;
    const ch = CHARACTERS.find(c => c.id === id);
    const f = (ch && ch.face) || { x: 0.5, y: 0.15, zoom: 3 };
    const k = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const ctx = cv.getContext('2d');
    // 화면 폭 w 에 그림 폭의 1/zoom 이 들어오도록
    const sw = img.naturalWidth / f.zoom;
    const sh = sw * h / w;
    let sx = img.naturalWidth * f.x - sw / 2;
    let sy = img.naturalHeight * f.y - sh * 0.42;
    sx = Math.max(0, Math.min(img.naturalWidth - sw, sx));
    sy = Math.max(0, Math.min(img.naturalHeight - sh, sy));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }
};
