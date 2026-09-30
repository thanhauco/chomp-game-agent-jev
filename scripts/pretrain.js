// Trains the Q-learning agent headlessly and prints weights for PRETRAINED in js/agents/qlearn.js.
//   node scripts/pretrain.js [episodes] [seed]
const path = require('node:path');
const C = require(path.join(__dirname, '..', 'tests', 'load.js'));

const episodes = +process.argv[2] || 400;
const seed = +process.argv[3] || 2026;
const zero = Object.fromEntries(C.qlearn.FEATURES.map((f) => [f.key, 0]));
const trainer = new C.qlearn.Trainer({ maze: new C.Maze(), weights: zero, episodes, seed });
const t0 = Date.now();
trainer.runFor(Infinity);
const secs = (Date.now() - t0) / 1000;

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const first = trainer.history.slice(0, 20).map((h) => h.score);
const last = trainer.history.slice(-20).map((h) => h.score);
console.log(`${episodes} episodes, ${trainer.steps} steps in ${secs.toFixed(1)} s`);
console.log(`mean score, first 20 episodes: ${avg(first).toFixed(0)}; last 20: ${avg(last).toFixed(0)}`);

function evaluate(make) {
  const scores = [];
  for (let i = 0; i < 20; i++) {
    const s = new C.Session({ maze: new C.Maze(), seed: 9000 + i, controller: make(9000 + i) });
    for (let k = 0; k < 3000 && !s.game.s.over; k++) s.tick();
    scores.push(s.game.s.score);
  }
  return avg(scores).toFixed(0);
}
const w = Object.fromEntries(Object.entries(trainer.weights).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
console.log('greedy eval (20 seeds, temperature 0.5):');
console.log('  q-learning', evaluate((sd) => new C.qlearn.QAgent({ weights: w, temperature: 0.5, seed: sd })));
console.log('  heuristic ', evaluate((sd) => new C.HeuristicAgent({ temperature: 0.5, seed: sd })));
console.log('  random    ', evaluate((sd) => C.agents.create('random', { seed: sd })));
console.log(JSON.stringify(w, null, 2));
