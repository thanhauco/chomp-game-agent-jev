/* Export the current game as a .jsonl replay, or import one and watch it. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);

  C.features.push((app) => {
    const row = document.createElement('div');
    row.className = 'controls';
    row.innerHTML = `
      <button id="replayExport">Export replay</button>
      <button id="replayImport">Import replay</button>
      <input id="replayFile" type="file" accept=".jsonl,.json,application/x-ndjson,text/plain" hidden>
      <span class="hint" id="replayMsg" aria-live="polite"></span>`;
    $('controls').after(row);
    const msg = (text) => { $('replayMsg').textContent = text; };

    $('replayExport').onclick = () => {
      const s = app.main;
      const text = C.replay.toJSONL(s);
      const name = `chomp-replay-${s.seed}-${s.last}moves.jsonl`;
      const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      msg(`Saved ${name} (${s.last} moves).`);
    };

    $('replayImport').onclick = () => $('replayFile').click();
    $('replayFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const controller = app.makeController(app.mode === 'play' ? 'human' : app.agentKey);
        const { session, header, mismatches, firstMismatch } = C.replay.rebuild(text, controller);
        if (session.maze.id !== app.maze.id) app.maze = session.maze;
        app.adoptSession(session);
        session.running = false;
        session.setView(0, false);
        app.refresh(true);
        const check = mismatches
          ? `${mismatches} moves did not match the recording (first at move ${firstMismatch}).`
          : 'Every move matched the recording.';
        msg(`Imported ${session.last} moves by ${header.agent || header.player}. ${check} Press Play replay to watch.`);
      } catch (err) {
        msg(`Could not import ${file.name}: ${err.message}`);
      }
    };
  });
})(globalThis);
