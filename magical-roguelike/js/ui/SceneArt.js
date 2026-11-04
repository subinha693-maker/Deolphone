// Procedural backdrops for the title, event and rest screens.
(function () {
  const MG = (window.MG = window.MG || {});

  const SPEAKER_CHAR = {};
  for (const c of Object.values(MG.CHARACTERS || {})) SPEAKER_CHAR[c.name] = c.id;

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
    clocktower(g) {
      bg(g, '#120d22', '#2a1f3d');
      g.fillStyle = '#1d1430';
      g.fillRect(660, 80, 200, 460);
      g.beginPath();
      g.moveTo(650, 80);
      g.lineTo(760, 0);
      g.lineTo(870, 80);
      g.fill();
      g.fillStyle = '#e8dcc0';
      g.beginPath();
      g.arc(760, 200, 70, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2a1f3d';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(760, 200);
      g.lineTo(760, 145);
      g.moveTo(760, 200);
      g.lineTo(800, 200);
      g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.fillStyle = '#2a1f3d';
        g.fillRect(760 + Math.cos(a) * 58 - 3, 200 + Math.sin(a) * 58 - 3, 6, 6);
      }
    },
    hound(g) {
      bg(g, '#0d0a14', '#241830');
      g.fillStyle = '#05030a';
      g.beginPath();
      g.ellipse(800, 430, 150, 60, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(920, 360, 60, 50, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff3b5c';
      g.fillRect(930, 350, 14, 6);
      g.fillRect(900, 350, 14, 6);
    },
    well(g) {
      bg(g, '#0f1424', '#1d2a3a');
      g.fillStyle = '#4a4560';
      g.fillRect(660, 340, 220, 140);
      g.fillStyle = '#2a2638';
      g.beginPath();
      g.ellipse(770, 340, 110, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9fd8ff';
      for (let i = 0; i < 14; i++) g.fillRect(700 + ((i * 37) % 140), 330 + ((i * 13) % 20), 3, 3);
    },
    library(g) {
      bg(g, '#140f0f', '#2b1d1a');
      for (let x = 440; x < 1240; x += 160) {
        g.fillStyle = '#3a2620';
        g.fillRect(x, 90, 130, 420);
        for (let y = 110; y < 500; y += 46) {
          for (let b = 0; b < 8; b++) {
            g.fillStyle = ['#7a3f3f', '#3f5a7a', '#6b5a2a', '#4a3a5e'][(b + y) % 4];
            g.fillRect(x + 6 + b * 15, y, 12, 38);
          }
        }
      }
    },
    forge(g) {
      bg(g, '#120a08', '#2e1a10');
      const glow = g.createRadialGradient(780, 420, 10, 780, 420, 260);
      glow.addColorStop(0, 'rgba(255,120,40,0.6)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1280, 720);
      g.fillStyle = '#2a2a30';
      g.fillRect(700, 420, 180, 50);
      g.fillRect(740, 470, 100, 60);
    },
    altar(g) {
      bg(g, '#100816', '#2a0f24');
      g.fillStyle = '#3a2440';
      g.fillRect(650, 380, 260, 110);
      g.fillStyle = '#d8b5ff';
      g.fillRect(770, 220, 12, 150);
      g.fillRect(740, 250, 72, 12);
      const glow = g.createRadialGradient(776, 300, 10, 776, 300, 200);
      glow.addColorStop(0, 'rgba(200,160,255,0.35)');
      glow.addColorStop(1, 'rgba(200,160,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1280, 720);
    },
    feast(g) {
      bg(g, '#0b1410', '#1d2a22');
      g.fillStyle = '#5b3d2a';
      g.fillRect(560, 400, 520, 30);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = ['#ff9fb8', '#ffd66b', '#9fe0a4'][i % 3];
        g.beginPath();
        g.arc(600 + i * 56, 390, 14, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 30; i++) {
        g.fillStyle = 'rgba(255,240,180,0.7)';
        g.fillRect(450 + ((i * 97) % 800), 60 + ((i * 53) % 260), 3, 3);
      }
    },
    shrine(g) {
      bg(g, '#0e0c1c', '#22203a');
      g.fillStyle = '#2e2a48';
      g.fillRect(640, 200, 280, 300);
      g.beginPath();
      g.moveTo(620, 200);
      g.lineTo(780, 110);
      g.lineTo(940, 200);
      g.fill();
      g.fillStyle = '#ffe9a8';
      g.fillRect(760, 300, 40, 60);
    },
    cart(g) {
      bg(g, '#120e0a', '#2a2216');
      g.fillStyle = '#5b3d22';
      g.fillRect(640, 340, 300, 110);
      g.fillStyle = '#2a1c10';
      g.beginPath();
      g.arc(690, 460, 34, 0, Math.PI * 2);
      g.arc(890, 460, 34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2c14e';
      for (let i = 0; i < 12; i++) g.fillRect(660 + i * 22, 325 - (i % 3) * 6, 10, 10);
    },
    stars(g) {
      bg(g, '#070514', '#1a1236');
      for (let i = 0; i < 120; i++) {
        g.fillStyle = i % 5 ? '#c7b9ff' : '#fff';
        g.fillRect((i * 131) % 1280, (i * 71) % 520, 2, 2);
      }
      g.strokeStyle = 'rgba(255,240,200,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(1100, 80);
      g.lineTo(820, 260);
      g.stroke();
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
    drawShop(canvas) {
      const g = canvas.getContext('2d');
      bg(g, '#140c18', '#2a1a2a');
      g.fillStyle = '#3a2440';
      for (let x = 0; x < 1280; x += 160) g.fillRect(x + 20, 120, 120, 8);
      const glow = g.createRadialGradient(640, 300, 40, 640, 300, 600);
      glow.addColorStop(0, 'rgba(255,190,120,0.18)');
      glow.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1280, 720);
      const doll = MG.Assets.enemyFrames.doll;
      if (doll) {
        g.imageSmoothingEnabled = false;
        g.drawImage(doll[0].normal, 40, 520, 96, 128);
      }
      vignette(g);
    },
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
        MG.Assets.drawFrame(g, id, 'walk', frame, 150 + i * (1000 / Math.max(1, ids.length - 1)), 506 + (i % 2) * 8, 1.35);
      });
      g.fillStyle = 'rgba(20,10,25,0.55)';
      g.fillRect(0, 0, 1280, 720);
    },
  };

  MG.SceneArt = SceneArt;
})();
