// Procedural backdrops for the title, event and rest screens.
(function () {
  const MG = (window.MG = window.MG || {});

  const SPEAKER_CHAR = { 로젤: 'rozel', 실피: 'sylphy', 벨라: 'bella', 루나: 'luna', 아모레: 'amore', 청련: 'cheongryeon' };

  function bg(g, top, bottom) {
    const grad = g.createLinearGradient(0, 0, 0, 720);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 1280, 720);
  }

  function vignette(g) {
    const v = g.createRadialGradient(640, 330, 200, 640, 360, 820);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = v;
    g.fillRect(0, 0, 1280, 720);
  }

  const PROPS = {
    chapel(g) {
      bg(g, '#1b1028', '#3a1d3f');
      // stained glass rose window
      const cx = 760;
      const cy = 250;
      for (let i = 0; i < 12; i++) {
        g.fillStyle = ['#7a3f8f', '#c46a9e', '#4f6fb0', '#f2c14e'][i % 4];
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, 150, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#140a19';
      g.lineWidth = 8;
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos((i / 12) * Math.PI * 2) * 150, cy + Math.sin((i / 12) * Math.PI * 2) * 150);
        g.stroke();
      }
      g.beginPath();
      g.arc(cx, cy, 150, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,230,250,0.08)';
      g.beginPath();
      g.moveTo(cx - 120, cy);
      g.lineTo(cx + 120, cy);
      g.lineTo(cx + 260, 720);
      g.lineTo(cx - 260, 720);
      g.fill();
      g.fillStyle = '#24142c';
      g.fillRect(660, 420, 200, 80);
    },
    roses(g) {
      bg(g, '#1a0b14', '#3a0f22');
      const r = MG.RNG(5);
      for (let i = 0; i < 70; i++) {
        const x = r.int(300, 1280);
        const y = r.int(260, 520);
        const s = r.int(10, 22);
        g.fillStyle = r.chance(0.5) ? '#8f1d32' : '#c22d48';
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#4a0f1c';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, s * 0.55, 0, Math.PI * 1.5);
        g.stroke();
        g.fillStyle = '#2a3a22';
        g.fillRect(x - 1, y + s, 3, 40);
      }
    },
    peddler(g) {
      bg(g, '#14101f', '#2a1c33');
      g.fillStyle = '#3a2440';
      g.fillRect(620, 300, 360, 200);
      g.fillStyle = '#5b3760';
      g.fillRect(600, 280, 400, 30);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ['#c7a0d9', '#9fe0a4', '#ff9fb8', '#9fd8ff'][i % 4];
        g.fillRect(640 + i * 40, 330, 18, 28);
      }
      const doll = MG.Assets.enemyFrames.doll;
      if (doll) g.drawImage(doll[0].normal, 760, 380, 48 * 2, 64 * 2);
    },
    mirror(g) {
      bg(g, '#0f1424', '#22213a');
      for (let i = 0; i < 4; i++) {
        const x = 480 + i * 190;
        g.fillStyle = '#c7b9d6';
        g.fillRect(x, 150, 130, 300);
        g.fillStyle = '#5b6e9a';
        g.fillRect(x + 8, 158, 114, 284);
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(x + 18, 170, 20, 260);
      }
    },
    candle(g) {
      bg(g, '#120b10', '#2b1a1a');
      const glow = g.createRadialGradient(760, 300, 10, 760, 300, 260);
      glow.addColorStop(0, 'rgba(255,200,120,0.55)');
      glow.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1280, 720);
      g.fillStyle = '#f4ecf7';
      g.fillRect(745, 310, 30, 120);
      g.fillStyle = '#ffcf6b';
      g.beginPath();
      g.ellipse(760, 290, 10, 22, 0, 0, Math.PI * 2);
      g.fill();
    },
    rest(g) {
      bg(g, '#0e0b1a', '#1f1a2e');
      const glow = g.createRadialGradient(760, 430, 10, 760, 430, 320);
      glow.addColorStop(0, 'rgba(255,160,90,0.5)');
      glow.addColorStop(1, 'rgba(255,160,90,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1280, 720);
      g.fillStyle = '#4a2c22';
      g.fillRect(700, 440, 120, 14);
      g.fillStyle = '#ff9a4f';
      g.beginPath();
      g.moveTo(720, 440);
      g.quadraticCurveTo(760, 330, 800, 440);
      g.fill();
      g.fillStyle = '#ffd36b';
      g.beginPath();
      g.moveTo(738, 440);
      g.quadraticCurveTo(760, 375, 782, 440);
      g.fill();
    },
  };

  const SceneArt = {
    SPEAKER_CHAR,
    /** Paint an event backdrop; party members stand on the left (speaker in front, larger). */
    drawEvent(canvas, artKey, speaker, party) {
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      (PROPS[artKey] || PROPS.chapel)(g);
      const chars = party.fieldUnits().map((u) => u.id);
      const sp = SPEAKER_CHAR[speaker];
      const order = sp ? [sp, ...chars.filter((c) => c !== sp)] : chars;
      order.slice(0, 3).reverse().forEach((cid, i, arr) => {
        const front = i === arr.length - 1;
        MG.Assets.drawFrame(g, cid, 'idle', 0, 150 + i * 120, 500, front ? 3.4 : 2.6, front ? 1 : 0.55);
      });
      vignette(g);
    },

    /** Title: parallax sky + the whole party running. */
    drawTitle(canvas, renderer, t) {
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 1280, 720);
      renderer.g = g;
      renderer.drawLayer(renderer.layers.sky, t * 10);
      renderer.drawLayer(renderer.layers.far, t * 50);
      renderer.drawLayer(renderer.layers.near, t * 200);
      renderer.g = renderer.canvas.getContext('2d');
      const ids = Object.keys(MG.CHARACTERS);
      ids.forEach((id, i) => {
        const frame = [0, 1, 2, 1][Math.floor(t * 8 + i) % 4];
        MG.Assets.drawFrame(g, id, 'walk', frame, 300 + i * 120, 506 + (i % 2) * 6, 1.5);
      });
      g.fillStyle = 'rgba(20,10,25,0.55)';
      g.fillRect(0, 0, 1280, 720);
    },
  };

  MG.SceneArt = SceneArt;
})();
