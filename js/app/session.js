/* Session: one game plus its full move history and a playhead.
 *
 * history[i] = { state, decision, events, event } is the world after move i.
 * `view` is the move on screen. When view is behind the end, tick() replays
 * forward; at the end, it asks the controller for a decision and plays it.
 * Controllers may be async (the Claude agent): the session waits, and a
 * `token` guards against answers that arrive after a fork or restart. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  let nextId = 1;

  class Session {
    constructor({ maze, seed, controller, pauseTicks = 7, onEntry = null, lives }) {
      this.id = nextId++;
      this.maze = maze;
      this.controller = controller;
      this.pauseTicks = pauseTicks;
      this.onEntry = onEntry;
      this.game = new C.Game(maze, { seed, lives });
      this.evaluator = new C.HeuristicAgent({ sample: false });
      this.history = [];
      this.view = 0;
      this.viewAt = -Infinity; // when the view last changed, for interpolation
      this.pause = 0;
      this.waiting = false;
      this.running = true;
      this.token = 0;
      this.error = null;
      this.push(null, [{ type: 'ready', text: 'Ready' }]);
    }

    get seed() { return this.game.s.seed; }
    get last() { return this.history.length - 1; }
    get entry() { return this.history[this.view]; }
    get live() { return this.view === this.last; }

    push(decision, events) {
      const evs = (events || []).filter(Boolean);
      if (!decision) {
        decision = this.evaluator.decide(this.game);
        decision.choice = null;
      }
      const entry = {
        move: this.history.length,
        state: this.game.snapshot(),
        decision,
        events: evs,
        event: C.Game.primaryEvent(evs),
      };
      this.history.push(entry);
      this.setView(this.last, true);
      if (this.onEntry) this.onEntry(entry, this);
      return entry;
    }

    setView(i, animate) {
      this.view = Math.max(0, Math.min(this.last, i));
      this.viewAt = animate ? now() : -Infinity;
    }

    // One timer tick. Returns what happened: replay | advance | wait | hold | over.
    tick() {
      if (this.view < this.last) { this.setView(this.view + 1, true); return 'replay'; }
      const g = this.game;
      if (g.s.over) return 'over';
      if (this.waiting) return 'wait';
      if (g.s.pending) {
        if (--this.pause > 0) return 'hold';
        this.push(null, [g.resume()]);
        return 'advance';
      }
      const d = this.controller.decide(g);
      if (d && typeof d.then === 'function') {
        const token = ++this.token;
        this.waiting = true;
        d.then(
          (dec) => { if (token === this.token) { this.waiting = false; this.error = null; this.apply(dec); } },
          (err) => {
            if (token !== this.token) return;
            this.waiting = false;
            this.error = err;
            // Keep the game moving: fall back to the heuristic for this move.
            const dec = this.evaluator.decide(g);
            dec.error = String(err && err.message ? err.message : err);
            dec.by = 'fallback';
            this.apply(dec);
          },
        );
        return 'wait';
      }
      this.apply(d);
      return 'advance';
    }

    apply(decision) {
      const events = this.game.step(decision.choice);
      if (this.game.s.pending) this.pause = this.pauseTicks;
      this.push(decision, events);
    }

    // Continue from an earlier move, discarding everything after it.
    fork(i = this.view) {
      this.game = C.Game.restore(this.maze, this.history[i].state);
      this.history.length = i + 1;
      this.token++;
      this.waiting = false;
      this.pause = this.game.s.pending ? this.pauseTicks : 0;
      this.setView(i, false);
    }

    // Who made the moves in this game: 'agent', 'human' or 'assisted'.
    playerKind() {
      let agent = 0, human = 0;
      for (const e of this.history) {
        if (!e.decision || e.decision.choice == null) continue;
        if (e.decision.by === 'you') human++; else agent++;
      }
      if (human && agent) return 'assisted';
      return human ? 'human' : 'agent';
    }
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  C.Session = Session;
})(globalThis);
