/*
 * 주인공의 방 — 맵 데이터 (이 장면 전용)
 * ------------------------------------------------------------
 * layout: '#' 벽(이동 불가) / '.' 바닥.  한 칸 = 48px, 10 x 8 칸
 * objects: 가구 · 조사 대상
 *   tiles     차지하는 칸 (벽에 걸린 물건은 벽 칸)
 *   solid     false 면 지나갈 수 있음 (기본: 막힘)
 *   interact  조사 이벤트 ID (script.js 의 섹션 이름과 연결) — 없으면 장식
 *   from      조사할 때 주인공이 바라봐야 하는 방향 (없으면 아무 방향)
 * npcs: 등장인물 (sprite = js/render/dots.js 의 ID)
 */
window.WS = window.WS || {};
WS.MAPS = WS.MAPS || {};

WS.MAPS.heroRoom = {
  tile: 48,
  layout: [
    '##########',
    '##########',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '##########',
  ],
  start: { x: 1, y: 4, dir: 'down', pose: 'lying' },   // 침대에 누워 있음
  wakeTile: { x: 2, y: 5, dir: 'down' },               // 일어나서 서는 곳
  npcs: [
    { id: 'mayer', sprite: 'mayer', x: 7, y: 6, dir: 'left', alpha: 0.1 },
  ],
  objects: [
    { id: 'bookshelf', name: '책장', tiles: [[1, 2], [2, 2]], interact: 'bookshelf', from: ['up'], markerDy: -40 },
    { id: 'mirror', name: '거울', tiles: [[3, 1]], interact: 'mirror', from: ['up'], markerDy: 4 },
    { id: 'window', name: '창문', tiles: [[5, 1], [6, 1]], interact: 'window', from: ['up'], markerDy: 2 },
    { id: 'door', name: '출입문', tiles: [[8, 1]], interact: 'door', from: ['up'], markerDy: 0 },
    { id: 'bed', name: '침대', tiles: [[1, 4], [1, 5]], interact: 'bed', markerDy: -6 },
    { id: 'desk', name: '책상', tiles: [[7, 4], [8, 4]], interact: 'desk', markerDy: -26 },
    { id: 'plant', name: '화분', tiles: [[1, 6]] },
  ],

  voidColor: '#1c1218',

  // ------------------------------------------------------------
  // 그리기 (도트를 코드로 직접 찍는다. 색은 따뜻한 나무 톤)
  // ------------------------------------------------------------
  drawBase(g, map) {
    const T = map.T, W = map.cols * T, H = map.rows * T;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

    // 바깥 어둠
    R(0, 0, W, H, '#2a1a1c');

    // 바닥 (가로 나무판)
    const fx0 = T, fy0 = 2 * T, fx1 = 9 * T, fy1 = 7 * T;
    for (let y = fy0, row = 0; y < fy1; y += 12, row++) {
      R(fx0, y, fx1 - fx0, 12, row % 2 ? '#c38c58' : '#cb9561');
      R(fx0, y + 11, fx1 - fx0, 1, '#8e5a38');
      R(fx0, y, fx1 - fx0, 1, row % 2 ? '#d3a06c' : '#d9a874');
      const off = (row * 37) % 80;
      for (let x = fx0 + off; x < fx1; x += 80) {
        R(x, y + 1, 1, 10, '#8e5a38');
        R(x + 1, y + 1, 1, 10, '#d6a571');
        R(x + 30, y + 5, 2, 1, '#9a6640');            // 옹이
      }
    }
    // 벽 아래 그늘
    for (let i = 0; i < 8; i++) {
      g.globalAlpha = 0.28 * (1 - i / 8);
      R(fx0, fy0 + i, fx1 - fx0, 1, '#3a2018');
    }
    g.globalAlpha = 1;

    // 뒷벽 (세로 나무판 + 허리 몰딩 + 걸레받이)
    for (let x = T, i = 0; x < 9 * T; x += 12, i++) {
      R(x, 6, 12, 54, i % 2 ? '#b8865a' : '#c08e62');
      R(x, 6, 1, 54, '#8a5a3c');
      R(x + 1, 6, 1, 54, '#cf9f72');
      if (i % 3 === 1) R(x + 5, 20 + (i * 7) % 24, 2, 2, '#9a6a44');
    }
    R(T, 0, 8 * T, 6, '#4a2e24');                          // 천장 쪽 들보
    R(T, 6, 8 * T, 1, '#6e4634');
    R(T, 58, 8 * T, 5, '#8a5a3c');                         // 허리 몰딩
    R(T, 58, 8 * T, 1, '#b07a52');
    R(T, 62, 8 * T, 1, '#5e3a28');
    for (let x = T, i = 0; x < 9 * T; x += 16, i++) {      // 아래 판벽
      R(x, 63, 16, 27, i % 2 ? '#9c6c46' : '#a4744c');
      R(x, 63, 1, 27, '#6e4632');
    }
    R(T, 90, 8 * T, 6, '#5a3626');                         // 걸레받이
    R(T, 90, 8 * T, 1, '#7c5038');

    // 옆벽 · 아래벽 (위에서 내려다본 벽 윗면)
    for (const x of [0, 9 * T]) {
      R(x, 0, T, H, '#3a2420');
      R(x === 0 ? T - 4 : x, 0, 4, H, '#5a382c');
      R(x === 0 ? T - 1 : x + 3, 0, 1, H, '#2a1814');
    }
    R(T, 7 * T, 8 * T, T, '#3a2420');
    R(T, 7 * T, 8 * T, 4, '#5a382c');
    R(T, 7 * T + 4, 8 * T, 1, '#2a1814');

    // 러그
    const rx = 3 * T + 6, ry = 4 * T + 4, rw = 3 * T - 12, rh = 2 * T - 8;
    R(rx, ry, rw, rh, '#9a5a6a');
    R(rx + 3, ry + 3, rw - 6, rh - 6, '#c98a96');
    R(rx + 7, ry + 7, rw - 14, rh - 14, '#d9a4ac');
    g.fillStyle = '#f4dcd6';
    for (let x = rx + 14; x < rx + rw - 10; x += 16) {
      for (let y = ry + 14; y < ry + rh - 10; y += 16) {
        g.fillRect(x, y - 2, 1, 5); g.fillRect(x - 2, y, 5, 1);
      }
    }
    for (let x = rx; x < rx + rw; x += 4) { R(x + 1, ry - 2, 1, 2, '#e8c8c8'); R(x + 1, ry + rh, 1, 2, '#e8c8c8'); }

    // 창문 (벽, 5~6열)
    const wx = 5 * T + 6, wy = 10, ww = 2 * T - 12, wh = 70;
    R(wx - 4, wy - 4, ww + 8, wh + 8, '#5a3626');
    R(wx - 3, wy - 3, ww + 6, wh + 6, '#7a4e34');
    for (let y = 0; y < wh; y++) {
      const k = y / wh;
      g.fillStyle = `rgb(${Math.round(214 + 30 * k)},${Math.round(232 + 14 * k)},${Math.round(242 + 2 * k)})`;
      g.fillRect(wx, wy + y, ww, 1);
    }
    R(wx + 6, wy + 8, 3, 18, '#ffffff'); R(wx + 11, wy + 8, 1, 10, '#ffffff');
    R(wx + ww / 2 - 2, wy, 4, wh, '#7a4e34');                 // 창살
    R(wx, wy + wh / 2 - 2, ww, 4, '#7a4e34');
    R(wx - 6, wy + wh, ww + 12, 5, '#8a5a3c');                // 창턱
    R(wx - 6, wy + wh, ww + 12, 1, '#b07a52');
    // 커튼
    for (const [cx, dir] of [[wx - 10, 1], [wx + ww - 4, -1]]) {
      R(cx, wy - 6, 14, wh + 14, '#e7a7ba');
      for (let i = 0; i < 4; i++) R(cx + 2 + i * 3, wy - 4, 1, wh + 10, i % 2 ? '#c9849a' : '#f3c4d2');
      R(cx, wy - 6, 14, 3, '#b86a84');
      R(cx + (dir > 0 ? 9 : 0), wy + 30, 5, 3, '#c97890');      // 커튼 끈
    }
    R(wx - 14, wy - 9, ww + 28, 3, '#5a3626');                // 커튼봉

    // 창으로 들어오는 빛 (바닥)
    g.fillStyle = 'rgba(255,246,222,0.20)';
    g.beginPath();
    g.moveTo(wx, 2 * T); g.lineTo(wx + ww, 2 * T); g.lineTo(wx + ww - 22, 4 * T + 20); g.lineTo(wx - 22, 4 * T + 20);
    g.closePath(); g.fill();

    // 거울 (벽, 3열)
    const mx = 3 * T + 8, my = 12, mw = T - 16, mh = 64;
    g.fillStyle = '#8a6a2a';
    g.beginPath(); g.ellipse(mx + mw / 2, my + mh / 2, mw / 2 + 4, mh / 2 + 4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d6b25e';
    g.beginPath(); g.ellipse(mx + mw / 2, my + mh / 2, mw / 2 + 2, mh / 2 + 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#cfe0ea';
    g.beginPath(); g.ellipse(mx + mw / 2, my + mh / 2, mw / 2 - 1, mh / 2 - 1, 0, 0, Math.PI * 2); g.fill();
    R(mx + 8, my + 12, 3, 22, '#f4fbff'); R(mx + 13, my + 10, 2, 12, '#f4fbff');
    R(mx + mw / 2 - 3, my - 7, 6, 4, '#e8a7ba');               // 리본
    R(mx + mw / 2 - 6, my - 8, 3, 3, '#c97890'); R(mx + mw / 2 + 3, my - 8, 3, 3, '#c97890');
    // 픽셀 느낌을 위해 가장자리 정리
    g.imageSmoothingEnabled = false;

    // 출입문 (벽, 8열)
    const dx = 8 * T + 6, dy = 8, dw = T - 12, dh = 2 * T - 8;
    R(dx - 4, dy - 4, dw + 8, dh + 4, '#4a2a1c');
    R(dx, dy, dw, dh, '#8a5a3a');
    R(dx + 4, dy + 6, dw - 8, 30, '#7a4c30'); R(dx + 4, dy + 6, dw - 8, 1, '#5e3a24');
    R(dx + 4, dy + 44, dw - 8, 36, '#7a4c30'); R(dx + 4, dy + 44, dw - 8, 1, '#5e3a24');
    R(dx + 1, dy, 1, dh, '#a87046');
    R(dx + dw - 8, dy + 46, 4, 4, '#e2b84e'); R(dx + dw - 8, dy + 46, 2, 2, '#fff0a8');
  },

  drawObject(g, o, map) {
    const T = map.T;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    switch (o.id) {
      case 'bookshelf': {
        const x = T + 2, y = 30, w = 2 * T - 4, h = 3 * T - 30 - 4;
        R(x - 2, y - 2, w + 4, h + 4, '#3a2218');
        R(x, y, w, h, '#7a4e34');
        R(x, y, w, 6, '#9a6a44'); R(x, y, w, 1, '#b8885c');
        const books = ['#b5455a', '#4a6a9a', '#d9b45a', '#6a8a5a', '#8a5aa0', '#e8d8b8', '#c97a5a', '#5a7a8a'];
        for (let s = 0; s < 3; s++) {
          const sy = y + 10 + s * 32;
          R(x + 4, sy, w - 8, 26, '#4a2c1e');
          let bx = x + 5, i = s * 3;
          while (bx < x + w - 8) {
            const bw = 4 + ((i * 7) % 4), bh = 18 + ((i * 5) % 7);
            const c = books[i % books.length];
            R(bx, sy + 26 - bh, bw, bh, c);
            R(bx, sy + 26 - bh, 1, bh, 'rgba(255,255,255,0.25)');
            R(bx, sy + 26 - bh + 4, bw, 1, 'rgba(0,0,0,0.2)');
            bx += bw + 1; i++;
            if (i % 9 === 4) { bx += 6; }
          }
          R(x + 2, sy + 26, w - 4, 4, '#9a6a44'); R(x + 2, sy + 26, w - 4, 1, '#b8885c');
        }
        break;
      }
      case 'bed': {
        const x = T + 2, y = 4 * T - 14, w = T - 4, h = 2 * T + 10;
        R(x - 1, y - 1, w + 2, h + 2, '#3a2218');
        R(x, y, w, 16, '#8a5a3c'); R(x, y, w, 2, '#b07a52');                  // 머리판
        R(x + 4, y + 4, w - 8, 8, '#7a4c30');
        R(x, y + 16, w, h - 16, '#f6ece2');                                  // 시트
        R(x + 5, y + 18, w - 10, 14, '#fffaf4'); R(x + 5, y + 31, w - 10, 1, '#e0d0c4');   // 베개
        const lying = map.player.pose === 'lying';
        if (lying) {
          // 잠든 주인공 (눈 감은 얼굴만 보임)
          const img = WS.getDot(map.player.sprite, 'blink');
          g.drawImage(img, 0, 0, 48, 30, x + w / 2 - 24, y + 4, 48, 30);
        }
        // 이불
        const qy = lying ? y + 34 : y + 40;
        R(x, qy, w, y + h - qy, '#e7a4b8');
        R(x, qy, w, 4, '#f6c6d4');
        for (let yy = qy + 8; yy < y + h - 4; yy += 10) R(x + 3, yy, w - 6, 1, '#d48aa2');
        for (let xx = x + 8; xx < x + w - 4; xx += 12) R(xx, qy + 6, 1, y + h - qy - 10, '#d48aa2');
        R(x, y + h - 4, w, 4, '#c97890');
        if (!lying) { R(x + w - 14, qy - 6, 12, 8, '#f6c6d4'); R(x + w - 14, qy - 6, 12, 1, '#fde0e8'); }  // 걷어 낸 이불
        R(x, y + h, w, 3, '#6e4630');                                         // 침대 다리 쪽
        break;
      }
      case 'desk': {
        const x = 7 * T + 2, y = 4 * T - 18, w = 2 * T - 4;
        R(x - 1, y - 1, w + 2, 50, '#3a2218');
        R(x, y, w, 12, '#a87046'); R(x, y, w, 2, '#c99060');                  // 상판
        R(x, y + 12, w, 36, '#8e5e3e');                                       // 앞판
        R(x + 6, y + 16, w / 2 - 10, 12, '#7a4c30'); R(x + w / 2 + 4, y + 16, w / 2 - 10, 12, '#7a4c30');
        R(x + w / 4 - 2, y + 21, 5, 2, '#e2b84e'); R(x + 3 * w / 4 - 2, y + 21, 5, 2, '#e2b84e');
        R(x + 2, y + 32, 6, 16, '#7a4c30'); R(x + w - 8, y + 32, 6, 16, '#7a4c30');
        // 책상 위: 스탠드 · 책 · 필통
        R(x + 8, y - 14, 3, 14, '#6a5a4a'); R(x + 2, y - 22, 16, 9, '#f3b6c6'); R(x + 2, y - 22, 16, 1, '#ffd8e2');
        R(x + 4, y - 2, 12, 2, '#5a4a3a');
        R(x + 34, y - 6, 22, 5, '#4a6a9a'); R(x + 36, y - 10, 20, 4, '#d9b45a'); R(x + 35, y - 12, 18, 2, '#b5455a');
        R(x + 70, y - 12, 8, 11, '#c9a0d0'); R(x + 71, y - 16, 1, 5, '#3a3a5a'); R(x + 74, y - 18, 1, 7, '#c4283a');
        break;
      }
      case 'plant': {
        const x = T + 10, y = 6 * T + 10;
        R(x + 4, y + 18, 20, 16, '#b8644a'); R(x + 2, y + 16, 24, 4, '#d07a5a'); R(x + 4, y + 30, 20, 4, '#8a4a3a');
        const leaves = [[14, 0], [6, 6], [22, 5], [10, 10], [18, 11], [2, 12], [26, 12]];
        for (const [lx, ly] of leaves) { R(x + lx, y + ly, 6, 6, '#5a8a4a'); R(x + lx + 1, y + ly + 1, 2, 2, '#7aac5a'); }
        break;
      }
      default:
        break;
    }
  },

  // 창빛 속 먼지 (분위기)
  drawOverlay(g, map) {
    const T = map.T;
    g.fillStyle = '#fff8e0';
    for (let i = 0; i < 9; i++) {
      const t = map.time * 0.15 + i * 1.7;
      const x = 5 * T + ((i * 23 + Math.sin(t) * 10) % (2 * T));
      const y = 2 * T + ((t * 18 + i * 31) % (2 * T + 20));
      g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3);
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    g.globalAlpha = 1;
  },
};
