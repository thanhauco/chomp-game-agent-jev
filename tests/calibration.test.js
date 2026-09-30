const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');

test('samples mark moves before a death as not surviving', () => {
  const s = new C.Session({ maze: new C.Maze(), seed: 21, controller: new C.HeuristicAgent({ seed: 21, temperature: 4 }) });
  for (let i = 0; i < 4000 && !s.game.s.over; i++) s.tick();
  assert.ok(s.game.s.over, 'a hot agent should lose eventually');
  const list = C.calibration.samples(s.history);
  assert.ok(list.length > 50);
  assert.ok(list.some((x) => !x.survived));
  assert.ok(list.every((x) => x.p > 0 && x.p <= 1 && x.agent === 'heuristic'));
});

test('bins summarize into points and an error score', () => {
  const bins = C.calibration.accumulate(C.calibration.emptyBins(), [
    { p: 0.95, survived: true }, { p: 0.92, survived: false }, { p: 0.55, survived: true },
  ]);
  const sum = C.calibration.summarize(bins);
  assert.equal(sum.n, 3);
  assert.equal(sum.points.length, 2);
  assert.equal(sum.points[1].rate, 0.5);
  assert.ok(sum.ece > 0 && sum.ece < 1);
});
