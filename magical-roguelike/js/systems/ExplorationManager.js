// Run progress across the map: which nodes can be chosen, travel, completion.
(function () {
  const MG = (window.MG = window.MG || {});

  const ExplorationManager = {
    /** 'completed' | 'current' | 'selectable' | 'locked' | 'skipped' */
    nodeState(run, id) {
      if (run.completed.has(id)) return run.currentId === id ? 'current' : 'completed';
      if (this.selectable(run).includes(id)) return 'selectable';
      const node = run.map.nodes[id];
      const curCol = run.currentId ? run.map.nodes[run.currentId].col : -1;
      if (node.col <= curCol) return 'skipped';
      return 'locked';
    },
    selectable(run) {
      if (!run.currentId) return run.map.startIds.slice();
      if (!run.completed.has(run.currentId)) return [];
      return run.map.nodes[run.currentId].next.slice();
    },
    travel(run, id) {
      if (!this.selectable(run).includes(id)) return null;
      run.currentId = id;
      run.path.push(id);
      return run.map.nodes[id];
    },
    complete(run) {
      if (!run.currentId) return false;
      run.completed.add(run.currentId);
      return run.map.nodes[run.currentId].type === 'final';
    },
  };

  MG.ExplorationManager = ExplorationManager;
})();
