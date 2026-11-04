// Explicit finite state machine with a whitelist of transitions.
// Illegal transitions are rejected (and logged) instead of silently happening,
// which prevents things like a reward screen opening while a battle is still running.
(function () {
  const MG = (window.MG = window.MG || {});

  class StateMachine {
    /**
     * @param {string} initial
     * @param {Object<string,string[]>} transitions  state -> allowed next states
     */
    constructor(name, initial, transitions) {
      this.name = name;
      this.state = initial;
      this.transitions = transitions;
      this.listeners = [];
      this.history = [initial];
    }
    can(next) {
      return (this.transitions[this.state] || []).includes(next);
    }
    is(...states) {
      return states.includes(this.state);
    }
    go(next, data) {
      if (!this.can(next)) {
        console.warn(`[${this.name}] illegal transition ${this.state} -> ${next}`);
        return false;
      }
      const prev = this.state;
      this.state = next;
      this.history.push(next);
      if (this.history.length > 50) this.history.shift();
      for (const l of this.listeners) l(next, prev, data);
      return true;
    }
    onChange(fn) {
      this.listeners.push(fn);
    }
  }

  MG.StateMachine = StateMachine;
})();
