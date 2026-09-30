/* BFS heuristic agent.
 * Scores each legal move with a hand-tuned formula, turns the scores into
 * probabilities with a softmax, then samples (or takes the best move). */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  const WEIGHTS = {
    pellet: 10, power: 14, foodDistance: -1.2,
    adjacentGhost: -200, ghostRadius: 7, ghostFalloff: -4,
    prey: 30, reverse: -1.5,
  };

  function scoreMove(a) {
    let s = 0;
    if (a.pellet) s += a.pellet === 2 ? WEIGHTS.power : WEIGHTS.pellet;
    s += a.nearFood * WEIGHTS.foodDistance;
    for (const t of a.threats) {
      if (t.d <= 1) s += WEIGHTS.adjacentGhost;
      else if (t.d < WEIGHTS.ghostRadius) s += (WEIGHTS.ghostRadius - t.d) ** 2 * WEIGHTS.ghostFalloff;
    }
    for (const p of a.prey) s += WEIGHTS.prey / (1 + p.d);
    if (a.reverse) s += WEIGHTS.reverse;
    return s;
  }

  class HeuristicAgent {
    constructor({ temperature = 1.5, seed = 7, sample = true } = {}) {
      this.key = 'heuristic';
      this.label = 'BFS heuristic';
      this.temperature = temperature;
      this.rand = sample ? C.rng.makeRng(seed ^ 0x9e3779b9) : null;
    }
    decide(game) {
      const scores = {};
      for (const d of game.legal()) scores[d] = scoreMove(C.analyzeMove(game, d));
      return C.decide.decisionFromScores(scores, {
        temperature: this.temperature, rand: this.rand, agent: this.key, label: this.label,
      });
    }
  }

  C.HeuristicAgent = HeuristicAgent;
  C.heuristicWeights = WEIGHTS;
  C.agents.register('heuristic', {
    label: 'BFS heuristic',
    usesTemperature: true,
    create: (opts) => new HeuristicAgent(opts),
  });
})(globalThis);
