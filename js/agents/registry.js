/* Agent registry and the shared decision format.
 *
 * Every agent exposes decide(game) and returns (or resolves to) a decision:
 *   { agent, label, choice, best, probs: {dir: p}, scores: {dir: n}, confidence, by }
 * `probs` covers only the legal moves. `confidence` is 1 minus the normalized
 * entropy of `probs`: 1 when the agent is certain, 0 when every move is equally likely. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  const defs = new Map();
  const agents = {
    register(key, def) { defs.set(key, { key, ...def }); },
    create(key, opts = {}) {
      const def = defs.get(key);
      if (!def) throw new Error(`Unknown agent "${key}"`);
      return def.create(opts);
    },
    get(key) { return defs.get(key); },
    list() { return [...defs.values()]; },
  };

  function confidenceOf(probs) {
    const ps = Object.values(probs);
    if (ps.length < 2) return 1;
    let h = 0;
    for (const p of ps) if (p > 0) h -= p * Math.log(p);
    return Math.max(0, 1 - h / Math.log(ps.length));
  }

  function softmax(scores, temperature) {
    const keys = Object.keys(scores);
    const max = Math.max(...keys.map((k) => scores[k]));
    const t = Math.max(0.05, temperature);
    let z = 0;
    const ex = {};
    for (const k of keys) { ex[k] = Math.exp((scores[k] - max) / t); z += ex[k]; }
    const probs = {};
    for (const k of keys) probs[k] = ex[k] / z;
    return probs;
  }

  function argmax(probs) {
    let best = null;
    for (const k of Object.keys(probs)) if (best === null || probs[k] > probs[best]) best = k;
    return best;
  }

  function sample(probs, rand) {
    let r = rand();
    const keys = Object.keys(probs);
    for (const k of keys) { r -= probs[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
  }

  // Turns raw move scores into a full decision, sampling when requested.
  function decisionFromScores(scores, { temperature = 1, rand = null, agent, label }) {
    const probs = softmax(scores, temperature);
    const best = argmax(probs);
    return {
      agent, label, by: 'agent', scores, probs, best,
      choice: rand ? sample(probs, rand) : best,
      confidence: confidenceOf(probs),
    };
  }

  C.agents = agents;
  C.decide = { confidenceOf, softmax, argmax, sample, decisionFromScores };
})(globalThis);
