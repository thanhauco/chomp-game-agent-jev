const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');

test('share codes round-trip and are compact', () => {
  const code = C.Maze.encode(C.DEFAULT_ROWS);
  assert.match(code, /^CHOMP1\.19x21\./);
  assert.ok(code.length < C.DEFAULT_ROWS.join('').length);
  assert.deepEqual(C.Maze.decode(code), C.DEFAULT_ROWS);
});

test('bad share codes explain themselves', () => {
  assert.throws(() => C.Maze.decode('hello'), /not a maze share code/);
  assert.throws(() => C.Maze.decode('CHOMP1.19x21.IzE5'), /incomplete/);
});

test('custom mazes play', () => {
  const rows = [
    '#########',
    '#o.....o#',
    '#.##-##.#',
    '#.#GGG#.#',
    '#.#####.#',
    '#...P...#',
    '#########',
  ];
  assert.deepEqual(C.Maze.validate(rows), []);
  const maze = new C.Maze(rows);
  const s = new C.Session({ maze, seed: 4, controller: new C.HeuristicAgent({ seed: 4 }) });
  for (let i = 0; i < 400 && !s.game.s.over; i++) s.tick();
  assert.ok(s.game.s.score > 0);
});
