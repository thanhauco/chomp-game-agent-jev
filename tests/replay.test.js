const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./load.js');

function recordGame(seed, moves) {
  const s = new C.Session({ maze: new C.Maze(), seed, controller: new C.HeuristicAgent({ seed }) });
  for (let i = 0; i < moves && !s.game.s.over; i++) s.tick();
  return s;
}

test('a replay round-trips through JSONL and re-simulates exactly', () => {
  const original = recordGame(42, 600);
  const text = C.replay.toJSONL(original);
  const lines = text.trim().split('\n');
  assert.equal(JSON.parse(lines[0]).format, 'chomp-replay');
  assert.ok(lines.slice(1).every((l) => ['move', 'ready'].includes(JSON.parse(l).type)));

  const { session, mismatches } = C.replay.rebuild(text, new C.HeuristicAgent());
  assert.equal(mismatches, 0);
  const a = original.history[original.last].state, b = session.history[session.last].state;
  assert.equal(b.score, a.score);
  assert.deepEqual(b.pac, a.pac);
  assert.deepEqual([...b.pellets], [...a.pellets]);
});

test('each move line carries the panel document', () => {
  const text = C.replay.toJSONL(recordGame(8, 20));
  const move = JSON.parse(text.split('\n')[1]);
  assert.equal(move.answers.move.type, 'choice');
  assert.ok(typeof move.answers.move.confidence === 'number');
});

test('tampered replays are detected', () => {
  const text = C.replay.toJSONL(recordGame(9, 200));
  const lines = text.trim().split('\n');
  const rec = JSON.parse(lines[30]);
  rec.score += 999;
  lines[30] = JSON.stringify(rec);
  const { mismatches } = C.replay.rebuild(lines.join('\n'), new C.HeuristicAgent());
  assert.ok(mismatches >= 1);
});

test('non-replay files are rejected with a clear message', () => {
  assert.throws(() => C.replay.parse('{"hello":1}'), /not a Chomp Agent replay/);
});
