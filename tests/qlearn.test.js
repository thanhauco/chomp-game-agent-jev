const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');

test('features are finite and cover every weight', () => {
  const game = new C.Game(new C.Maze(), { seed: 1 });
  for (const d of game.legal()) {
    const f = C.qlearn.features(game, d);
    assert.deepEqual(Object.keys(f).sort(), C.qlearn.FEATURES.map((x) => x.key).sort());
    assert.ok(Object.values(f).every(Number.isFinite));
  }
});

test('training from zero learns to fear ghosts and seek food', () => {
  const zero = Object.fromEntries(C.qlearn.FEATURES.map((f) => [f.key, 0]));
  const t = new C.qlearn.Trainer({ maze: new C.Maze(), weights: zero, episodes: 60, seed: 5 });
  t.runFor(Infinity);
  assert.equal(t.history.length, 60);
  assert.ok(t.weights.ghostNear < 0, `ghostNear=${t.weights.ghostNear}`);
  assert.ok(t.weights.foodDistance < 0, `foodDistance=${t.weights.foodDistance}`);
});

test('the pretrained agent plays a full game', () => {
  const s = new C.Session({ maze: new C.Maze(), seed: 77, controller: new C.qlearn.QAgent({ seed: 77 }) });
  for (let i = 0; i < 1500 && !s.game.s.over; i++) s.tick();
  assert.ok(s.game.s.score > 500);
});
