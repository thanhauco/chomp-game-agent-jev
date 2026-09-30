/* Replay files: JSON Lines, one decision per line.
 *
 * Line 1 is a header with the seed and the maze. Every later line is either a
 * "move" (the decision document shown in the panel, plus score and position)
 * or a "ready" marker after a lost life or cleared level.
 * Because the engine is deterministic, importing re-plays the recorded choices
 * from the seed and checks each resulting position against the file. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const FORMAT = 'chomp-replay';
  const VERSION = 1;

  function toJSONL(session) {
    const first = session.history[0].state;
    const lastState = session.history[session.last].state;
    const agentEntry = session.history.find((e) => e.decision && e.decision.choice != null);
    const header = {
      type: 'header', format: FORMAT, version: VERSION,
      seed: first.seed, lives: first.lives, maze: session.maze.rows,
      player: session.playerKind(),
      agent: agentEntry ? agentEntry.decision.agent : null,
      moves: session.last, score: lastState.score, level: lastState.level,
      created: new Date().toISOString(),
    };
    const lines = [JSON.stringify(header)];
    for (const e of session.history.slice(1)) {
      const d = e.decision, st = e.state;
      if (d.choice == null) {
        lines.push(JSON.stringify({ type: 'ready', move: e.move, event: e.event ? e.event.text : null }));
        continue;
      }
      const line = {
        type: 'move', move: e.move, by: d.by, agent: d.agent,
        ...C.panel.decisionDocument(d),
        event: e.event ? e.event.text : null,
        score: st.score, lives: st.lives, level: st.level, pac: [st.pac.x, st.pac.y],
      };
      if (d.scores && Object.keys(d.scores).length) line.scores = roundAll(d.scores);
      if (d.reason) line.reason = d.reason;
      if (d.latencyMs) line.latency_ms = Math.round(d.latencyMs);
      if (d.error) line.error = d.error;
      lines.push(JSON.stringify(line));
    }
    return lines.join('\n') + '\n';
  }

  function roundAll(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = Math.round(v * 100) / 100;
    return out;
  }

  function parse(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) throw new Error('The file is empty.');
    let header;
    try { header = JSON.parse(lines[0]); } catch { throw new Error('The first line is not JSON.'); }
    if (header.format !== FORMAT) throw new Error('This is not a Chomp Agent replay file.');
    if (header.version > VERSION) throw new Error(`Replay version ${header.version} is newer than this page supports.`);
    const records = lines.slice(1).map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`Line ${i + 2} is not valid JSON.`); }
    });
    return { header, records };
  }

  // Rebuild a Session from a replay file. `controller` plays on after the recording ends.
  function rebuild(text, controller) {
    const { header, records } = parse(text);
    const maze = new C.Maze(header.maze);
    const session = new C.Session({ maze, seed: header.seed, lives: header.lives, controller });
    let mismatches = 0, firstMismatch = null;
    for (const r of records) {
      if (r.type !== 'move') continue;
      const g = session.game;
      if (g.s.over) break;
      if (g.s.pending) session.push(null, [g.resume()]);
      const move = r.answers && r.answers.move;
      if (!move) throw new Error(`Move ${r.move} has no answers.move.`);
      const probs = { ...move.probabilities };
      const decision = {
        agent: r.agent, label: r.agent, by: r.by || 'agent', choice: move.choice,
        best: C.decide.argmax(probs), probs, scores: r.scores || {}, confidence: move.confidence,
        reason: r.reason, latencyMs: r.latency_ms, error: r.error, imported: true,
      };
      session.apply(decision);
      const st = session.game.s;
      if (st.score !== r.score || (r.pac && (st.pac.x !== r.pac[0] || st.pac.y !== r.pac[1]))) {
        mismatches++;
        if (firstMismatch == null) firstMismatch = r.move;
      }
    }
    session.pause = session.game.s.pending ? session.pauseTicks : 0;
    return { session, header, mismatches, firstMismatch };
  }

  C.replay = { toJSONL, parse, rebuild, FORMAT, VERSION };
})(globalThis);
