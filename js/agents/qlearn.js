/* Approximate Q-learning agent and trainer.
 *
 * Q(s, a) = w · f(s, a), a linear function of a few features of the move a
 * (the same one-tile look-ahead the heuristic uses). Training plays headless
 * games with epsilon-greedy exploration and applies the TD update
 *   w_i += alpha * (r + gamma * max_a' Q(s', a') - Q(s, a)) * f_i(s, a)
 * The trainer runs in small time slices so the page stays responsive. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  const FEATURES = [
    { key: 'bias', label: 'Bias' },
    { key: 'eatsFood', label: 'Eats a pellet' },
    { key: 'eatsPower', label: 'Eats a power pellet' },
    { key: 'foodDistance', label: 'Distance to nearest pellet' },
    { key: 'ghostAdjacent', label: 'Ghost within 1 tile' },
    { key: 'ghostNear', label: 'Ghosts within 5 tiles' },
    { key: 'preyNear', label: 'Frightened ghost nearby' },
    { key: 'reverse', label: 'Turns back' },
  ];

  // Starting weights: 400 headless episodes on the default maze, seed 2026
  // (`node scripts/pretrain.js 400 2026`). Training in the browser continues from these.
  const PRETRAINED = {
    bias: 11.067, eatsFood: 2.58, eatsPower: 24.097, foodDistance: -23.779,
    ghostAdjacent: -14.251, ghostNear: -23.217, preyNear: 51.497, reverse: -2.975,
  };

  const REWARD = { stepCost: -0.1, death: -50, level: 50, scoreScale: 0.1 };

  function features(game, dir) {
    const a = C.analyzeMove(game, dir), m = game.maze;
    let adjacent = 0, near = 0, prey = 0;
    for (const t of a.threats) {
      if (t.d <= 1) adjacent++;
      if (t.d <= 5) near += (5 - t.d) / 5;
    }
    for (const p of a.prey) prey += 1 / (1 + p.d);
    return {
      bias: 1,
      eatsFood: a.pellet === 1 ? 1 : 0,
      eatsPower: a.pellet === 2 ? 1 : 0,
      foodDistance: a.nearFood / (m.W + m.H),
      ghostAdjacent: adjacent,
      ghostNear: near,
      preyNear: prey,
      reverse: a.reverse ? 1 : 0,
    };
  }

  function qValue(w, f) {
    let q = 0;
    for (const k in f) q += (w[k] || 0) * f[k];
    return q;
  }

  class QAgent {
    constructor({ weights = null, temperature = 1.5, seed = 13, sample = true } = {}) {
      this.key = 'qlearn';
      this.label = 'Q-learning';
      this.weights = weights || C.qlearn.loadWeights();
      this.temperature = temperature;
      this.rand = sample ? C.rng.makeRng(seed ^ 0x2545f491) : null;
    }
    decide(game) {
      const scores = {};
      for (const d of game.legal()) scores[d] = qValue(this.weights, features(game, d));
      return C.decide.decisionFromScores(scores, {
        temperature: this.temperature, rand: this.rand, agent: this.key, label: this.label,
      });
    }
  }

  class Trainer {
    constructor({ maze, weights, alpha = 0.01, gamma = 0.9, epsilon = 0.3, epsilonMin = 0.02,
      episodes = 200, maxSteps = 1500, seed = C.rng.randomSeed() } = {}) {
      Object.assign(this, { maze, alpha, gamma, epsilon, epsilonMin, episodes, maxSteps });
      this.weights = { ...PRETRAINED, ...(weights || {}) };
      this.rand = C.rng.makeRng(seed);
      this.episode = 0;
      this.steps = 0;
      this.history = []; // one { episode, score, moves, level } per finished episode
      this.game = null;
    }

    get done() { return this.episode >= this.episodes; }
    get currentEpsilon() {
      const t = this.episodes > 1 ? this.episode / (this.episodes - 1) : 1;
      return this.epsilon + (this.epsilonMin - this.epsilon) * t;
    }

    startEpisode() {
      this.game = new C.Game(this.maze, { seed: (this.rand() * 4294967296) >>> 0 });
      this.feats = null;
      this.moves = 0;
    }

    // Features for every legal move in the current state.
    featureMap(game) {
      const out = {};
      for (const d of game.legal()) out[d] = features(game, d);
      return out;
    }

    step() {
      if (!this.game) this.startEpisode();
      const g = this.game;
      if (g.s.pending) { g.resume(); this.feats = null; }
      const fs = this.feats || this.featureMap(g);
      const dirs = Object.keys(fs);
      let dir;
      if (this.rand() < this.currentEpsilon) dir = dirs[Math.floor(this.rand() * dirs.length)];
      else dir = dirs.reduce((best, d) => (qValue(this.weights, fs[d]) > qValue(this.weights, fs[best]) ? d : best), dirs[0]);

      const before = g.s.score;
      const events = g.step(dir);
      let reward = (g.s.score - before) * REWARD.scoreScale + REWARD.stepCost;
      let terminal = false;
      if (events.some((e) => e.type === 'death')) { reward += REWARD.death; terminal = true; }
      if (events.some((e) => e.type === 'level')) reward += REWARD.level;

      let next = 0;
      this.feats = null;
      if (!terminal && !g.s.pending) {
        this.feats = this.featureMap(g);
        next = Math.max(...Object.values(this.feats).map((f) => qValue(this.weights, f)));
      }
      const f = fs[dir];
      const diff = reward + this.gamma * next - qValue(this.weights, f);
      for (const k in f) this.weights[k] += this.alpha * diff * f[k];

      this.steps++;
      this.moves++;
      if (g.s.over || this.moves >= this.maxSteps) {
        this.history.push({ episode: this.episode + 1, score: g.s.score, moves: this.moves, level: g.s.level });
        this.episode++;
        this.game = null;
      }
    }

    // Train until the time budget runs out; returns true when all episodes are done.
    runFor(ms) {
      const end = Date.now() + ms;
      while (!this.done && Date.now() < end) this.step();
      return this.done;
    }
  }

  C.qlearn = {
    FEATURES, PRETRAINED, REWARD, features, qValue, QAgent, Trainer,
    loadWeights() { return { ...PRETRAINED, ...((C.store && C.store.get('qweights', null)) || {}).weights }; },
  };
  C.agents.register('qlearn', { label: 'Q-learning', usesTemperature: true, create: (opts) => new QAgent(opts) });
})(globalThis);
