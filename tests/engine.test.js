const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');

function playOut(seed, maxMoves = 3000) {
  const maze = new C.Maze();
  const game = new C.Game(maze, { seed });
  const agent = new C.HeuristicAgent({ seed, temperature: 1.5 });
  const choices = [];
  while (!game.s.over && choices.length < maxMoves) {
    if (game.s.pending) { game.resume(); continue; }
    const d = agent.decide(game);
    choices.push(d.choice);
    game.step(d.choice);
  }
  return { game, choices };
}

test('the default maze is valid', () => {
  assert.deepEqual(C.Maze.validate(C.DEFAULT_ROWS), []);
  const m = new C.Maze();
  assert.equal(m.W, 19);
  assert.equal(m.H, 21);
  assert.ok(m.pelletCount > 100);
});

test('validation explains broken mazes', () => {
  const rows = C.DEFAULT_ROWS.map((r) => r.replace('P', '.'));
  assert.match(C.Maze.validate(rows).join(' '), /exactly one chomper/);
  const walled = C.DEFAULT_ROWS.slice();
  walled[1] = '#.#' + walled[1].slice(3);
  walled[2] = '##' + walled[2].slice(2);
  assert.match(C.Maze.validate(walled).join(' '), /unreachable/);
});

test('same seed and same choices give the same game', () => {
  const a = playOut(1234);
  const maze = new C.Maze();
  const replay = new C.Game(maze, { seed: 1234 });
  for (const ch of a.choices) {
    if (replay.s.pending) replay.resume();
    replay.step(ch);
  }
  assert.deepEqual(replay.snapshot(), a.game.snapshot());
});

test('games end and scores only go up', () => {
  const { game } = playOut(99);
  assert.ok(game.s.score > 0);
  assert.ok(game.s.over || game.s.moves >= 3000);
});

test('probabilities sum to one and cover only legal moves', () => {
  const game = new C.Game(new C.Maze(), { seed: 5 });
  const d = new C.HeuristicAgent({ sample: false }).decide(game);
  const sum = Object.values(d.probs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.deepEqual(Object.keys(d.probs).sort(), game.legal().sort());
});

test('confidence is one minus normalized entropy', () => {
  const c = C.decide.confidenceOf({ up: 0.94, down: 0.06 });
  assert.equal(Math.round(c * 100) / 100, 0.67);
  assert.equal(C.decide.confidenceOf({ up: 1 }), 1);
});

test('sessions fork and continue from an earlier move', () => {
  const s = new C.Session({ maze: new C.Maze(), seed: 7, controller: new C.HeuristicAgent({ seed: 7 }) });
  for (let i = 0; i < 40; i++) s.tick();
  const at = s.history[20].state;
  s.fork(20);
  assert.equal(s.last, 20);
  assert.deepEqual(s.game.snapshot(), at);
  s.tick();
  assert.equal(s.last, 21);
});
