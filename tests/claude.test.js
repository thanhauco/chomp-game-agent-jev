const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');

test('the board prompt marks the chomper, ghosts and legal moves', () => {
  const game = new C.Game(new C.Maze(), { seed: 3 });
  const text = C.claude.boardText(game);
  assert.match(text, /C/);
  assert.match(text, /red at \(9, 7\)/);
  assert.match(text, /Legal moves: left, right\./);
});

test('the output schema only allows legal moves', () => {
  const schema = C.claude.schemaFor(['up', 'left']);
  assert.deepEqual(schema.properties.move.enum, ['up', 'left']);
  assert.deepEqual(schema.properties.probabilities.required, ['up', 'left']);
  assert.equal(schema.additionalProperties, false);
});

test('model answers are normalized into a decision', () => {
  const d = C.claude.toDecision(
    { move: 'up', probabilities: { up: 0.8, down: 0.4 }, reason: 'food above' },
    ['up', 'down'], { latencyMs: 900, model: 'claude-opus-5' });
  assert.equal(d.choice, 'up');
  assert.ok(Math.abs(d.probs.up - 2 / 3) < 1e-9);
  assert.equal(d.reason, 'food above');
  const bad = C.claude.toDecision({ move: 'left', probabilities: {} }, ['up', 'down'], { model: 'x' });
  assert.equal(bad.probs.up, 0.5);
  assert.ok(['up', 'down'].includes(bad.choice));
});
