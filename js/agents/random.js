/* Random walker: a baseline that picks among legal moves at random,
 * mildly avoiding turning back so it explores instead of jittering. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  class RandomAgent {
    constructor({ seed = 11 } = {}) {
      this.key = 'random';
      this.label = 'Random walker';
      this.rand = C.rng.makeRng(seed ^ 0x51ed270b);
    }
    decide(game) {
      const scores = {};
      for (const d of game.legal()) scores[d] = d === C.OPP[game.s.pac.dir] ? -1 : 0;
      return C.decide.decisionFromScores(scores, { temperature: 1, rand: this.rand, agent: this.key, label: this.label });
    }
  }

  C.agents.register('random', { label: 'Random walker', create: (opts) => new RandomAgent(opts) });
})(globalThis);
