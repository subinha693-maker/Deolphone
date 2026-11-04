// Branching node graph: columns of nodes with forks and merges, final node at the end.
(function () {
  const MG = (window.MG = window.MG || {});

  const MapManager = {
    generate(rng) {
      const cfg = MG.MAP_CONFIG;
      const nodes = {};
      const columns = [];
      let id = 0;
      for (let c = 0; c < cfg.columns; c++) {
        const isLast = c === cfg.columns - 1;
        const n = isLast ? 1 : c === 0 ? 2 : rng.int(cfg.minPerColumn, cfg.maxPerColumn);
        const col = [];
        for (let r = 0; r < n; r++) {
          const node = {
            id: 'n' + id++,
            col: c,
            row: r,
            y: n === 1 ? 0.5 : (r + 0.5) / n, // normalised vertical position
            type: 'battle',
            next: [],
            prev: [],
            difficulty: 1,
            defense: false,
          };
          nodes[node.id] = node;
          col.push(node.id);
        }
        columns.push(col);
      }

      // node types
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        col.forEach((nid, i) => {
          const node = nodes[nid];
          if (c === columns.length - 1) node.type = 'final';
          else if (c === 0) node.type = i === 0 ? 'battle' : rng.pick(['battle', 'event']);
          else node.type = rng.weighted(cfg.weights.filter((w) => !w.minCol || c >= w.minCol));
        });
        // the column right before the boss always offers a rest
        if (c === columns.length - 2 && !col.some((nid) => nodes[nid].type === 'rest')) nodes[rng.pick(col)].type = 'rest';
        // avoid an all-non-battle column early on (needs relic sources from fights)
        if (c > 0 && c < columns.length - 2 && !col.some((nid) => MG.NODE_TYPES[nodes[nid].type].battle)) nodes[col[0]].type = 'battle';
      }

      // difficulty + defense flag
      for (const node of Object.values(nodes)) {
        node.difficulty = Math.min(6, 1 + Math.floor(node.col * 0.75)) + (node.type === 'elite' ? 1 : 0);
        if (node.type === 'final') node.difficulty = 6;
        node.defense = node.type === 'battle' && node.col > 0 && rng.chance(cfg.defenseChance);
        if (node.type === 'final') node.defense = true;
        node.risk = node.type === 'elite' || node.type === 'final' ? 'high' : node.defense ? 'mid' : node.type === 'battle' ? 'mid' : 'low';
      }

      // edges: each node links to the nearest 1-2 nodes of the next column, then fix orphans
      for (let c = 0; c < columns.length - 1; c++) {
        const cur = columns[c].map((i) => nodes[i]);
        const nxt = columns[c + 1].map((i) => nodes[i]);
        for (const a of cur) {
          const sorted = nxt.slice().sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y));
          link(a, sorted[0]);
          if (sorted[1] && Math.abs(sorted[1].y - a.y) < 0.45 && rng.chance(0.55)) link(a, sorted[1]);
        }
        for (const b of nxt) {
          if (!b.prev.length) {
            const nearest = cur.slice().sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))[0];
            link(nearest, b);
          }
        }
      }
      // guarantee at least one extra fork and merge so paths actually cross
      const all = Object.values(nodes);
      if (!all.some((n) => n.next.length > 1)) {
        const cand = all.filter((n) => n.col < columns.length - 2 && columns[n.col + 1].length > 1);
        const a = rng.pick(cand);
        const other = columns[a.col + 1].map((i) => nodes[i]).filter((b) => !a.next.includes(b.id));
        if (other.length) link(a, other.sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y))[0]);
      }
      if (!all.some((n) => n.prev.length > 1)) {
        const cand = all.filter((n) => n.col > 0 && n.col < columns.length - 1 && columns[n.col - 1].length > 1);
        const b = rng.pick(cand);
        const other = columns[b.col - 1].map((i) => nodes[i]).filter((a) => !b.prev.includes(a.id));
        if (other.length) link(other.sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))[0], b);
      }
      return { nodes, columns, startIds: columns[0].slice(), finalId: columns[columns.length - 1][0] };

      function link(a, b) {
        if (!a.next.includes(b.id)) a.next.push(b.id);
        if (!b.prev.includes(a.id)) b.prev.push(a.id);
      }
    },

    /** Simple validation used by tests: every node reachable from a start, every node reaches the final. */
    validate(map) {
      const seen = new Set();
      const stack = map.startIds.slice();
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...map.nodes[id].next);
      }
      const allReachable = Object.keys(map.nodes).every((id) => seen.has(id));
      const allLeadToEnd = Object.values(map.nodes).every((n) => n.type === 'final' || n.next.length > 0);
      const noUnimplemented = Object.values(map.nodes).every((n) => MG.NODE_TYPES[n.type].implemented);
      return { allReachable, allLeadToEnd, noUnimplemented };
    },

    rewardHint(node) {
      switch (node.type) {
        case 'battle':
          return '유물 선택 · 별조각';
        case 'elite':
          return '희귀 유물 확률 ↑ · 별조각 多';
        case 'relic':
          return '유물 1개 선택';
        case 'event':
          return '알 수 없음';
        case 'rest':
          return '회복 · 부활';
        case 'final':
          return '탐사 구역 완료';
        default:
          return '';
      }
    },
  };

  MG.MapManager = MapManager;
})();
