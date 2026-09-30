/* Human controller.
 * Keeps a buffered direction from the keyboard or a swipe, and asks the heuristic
 * agent for advice so the panel can show what the agent would have done. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  class HumanController {
    constructor() {
      this.key = 'human';
      this.label = 'You';
      this.next = null;
      this.advisor = new C.HeuristicAgent({ sample: false });
    }
    decide(game) {
      const advice = this.advisor.decide(game);
      const { x, y, dir } = game.s.pac;
      const m = game.maze;
      let want = dir;
      if (this.next && m.pacOpen(...m.step(x, y, this.next))) want = this.next;
      const choice = m.pacOpen(...m.step(x, y, want)) ? want : 'stay';
      return { ...advice, agent: 'human', label: 'You', by: 'you', choice };
    }
  }

  C.HumanController = HumanController;
})(globalThis);
