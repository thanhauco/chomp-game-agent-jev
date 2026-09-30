/* Leaderboard: finished games, humans and agents side by side.
 * Scores are stored on this device only. The static site has no server; see
 * ARCHITECTURE.md for how to back this with a shared store. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => C.panel.escapeHTML(s);
  const MAX_ROWS = 200;
  const KIND_LABEL = { human: 'Human', agent: 'Agent', assisted: 'Assisted' };

  C.features.push((app) => {
    const tab = app.ensureTab('tab-stats', 'Stats');
    const card = document.createElement('div');
    card.className = 'card stat-card';
    card.innerHTML = `
      <div class="stat-head">
        <div>
          <h2>Leaderboard</h2>
          <p class="hint">Finished games on this device. "Assisted" means you and an agent both made moves in the same game.</p>
        </div>
        <label class="ctl" for="lbName">Your name <input id="lbName" type="text" maxlength="24" placeholder="Player"></label>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="Show">
          <button data-kind="all" aria-pressed="true">All</button>
          <button data-kind="human" aria-pressed="false">Humans</button>
          <button data-kind="agent" aria-pressed="false">Agents</button>
        </div>
        <label class="check"><input id="lbThisMaze" type="checkbox" checked> This maze only</label>
      </div>
      <div class="table-wrap" id="lbTable"></div>
      <div><button id="lbClear" class="link">Clear the leaderboard</button> <span class="hint" id="lbMsg"></span></div>`;
    tab.appendChild(card);

    let rows = C.store.get('leaderboard', []);
    let kind = 'all';
    $('lbName').value = C.store.get('playerName', '');
    $('lbName').addEventListener('input', (e) => C.store.set('playerName', e.target.value.trim()));

    function record(s) {
      if (s.ranked) return;
      s.ranked = true;
      const who = s.playerKind();
      const agentMove = s.history.find((e) => e.decision && e.decision.by === 'agent');
      const agentLabel = agentMove ? agentMove.decision.label : '';
      const st = s.history[s.last].state;
      rows.push({
        name: who === 'agent' ? agentLabel : C.store.get('playerName', '') || 'Player',
        kind: who, agent: agentLabel, score: st.score, level: st.level, moves: s.last,
        maze: s.maze.id, seed: s.seed, duel: !!s.duel, date: new Date().toISOString(),
      });
      rows.sort((a, b) => b.score - a.score);
      rows = rows.slice(0, MAX_ROWS);
      C.store.set('leaderboard', rows);
      if (app.currentTab === 'tab-stats') render();
      return rows.indexOf(rows.find((r) => r.seed === s.seed && r.moves === s.last && r.score === st.score)) + 1;
    }

    app.on('over', (s) => { s.rank = record(s); });
    app.on('panel', (entry, s) => {
      if (!s.rank || s.view !== s.last) return;
      const ev = $('event');
      ev.innerHTML += `${ev.innerHTML ? ' · ' : ''}Leaderboard rank #${s.rank} on this device.`;
    });

    function render() {
      const list = rows.filter((r) =>
        (kind === 'all' || r.kind === kind || (kind === 'human' && r.kind === 'assisted')) &&
        (!$('lbThisMaze').checked || r.maze === app.maze.id));
      $('lbTable').innerHTML = list.length
        ? `<table><thead><tr><th>#</th><th>Player</th><th>Type</th><th>Score</th><th>Level</th><th>Moves</th><th>Seed</th><th>Date</th></tr></thead><tbody>${
          list.slice(0, 50).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td><span class="pill ${r.kind}">${KIND_LABEL[r.kind]}${r.duel ? ' · duel' : ''}</span></td>` +
            `<td>${r.score}</td><td>${r.level}</td><td>${r.moves}</td><td class="mono">${r.seed}</td><td>${new Date(r.date).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint">No finished games yet. Finish a game on the Play or Duel tab to get on the board.</p>';
    }

    for (const b of card.querySelectorAll('.seg button')) {
      b.onclick = () => {
        kind = b.dataset.kind;
        for (const o of card.querySelectorAll('.seg button')) o.setAttribute('aria-pressed', String(o === b));
        render();
      };
    }
    $('lbThisMaze').onchange = render;
    let confirmClear = false;
    $('lbClear').onclick = () => {
      if (!confirmClear) { confirmClear = true; $('lbMsg').textContent = 'Click again to delete every score on this device.'; return; }
      confirmClear = false;
      rows = [];
      C.store.remove('leaderboard');
      $('lbMsg').textContent = 'Cleared.';
      render();
    };
    app.on('tab', (id) => { if (id === 'tab-stats') render(); });
  });
})(globalThis);
