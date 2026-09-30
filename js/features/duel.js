/* Duel: two agents, one maze, one seed, side by side.
 * The seed fixes the ghosts' dice, so differences in the result come from the
 * agents' choices. Once their paths diverge the games differ, which is the point. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);

  C.features.push((app) => {
    const sides = [
      { agent: 'heuristic', session: null },
      { agent: 'random', session: null },
    ];
    let done = false;

    const grid = $('duelGrid');
    grid.innerHTML = sides.map((_, i) => `
      <div class="card duel-side">
        <label class="ctl" for="duelAgent${i}">Agent ${i === 0 ? 'A' : 'B'} <select id="duelAgent${i}"></select></label>
        <div class="board" id="duelBoard${i}"><canvas id="duelCv${i}" aria-label="Duel board ${i === 0 ? 'A' : 'B'}"></canvas></div>
        <dl class="stats">
          <div><dt>Score</dt><dd id="duelScore${i}">0</dd></div>
          <div><dt>Lives</dt><dd id="duelLives${i}">3</dd></div>
          <div><dt>Move</dt><dd id="duelMove${i}">0</dd></div>
        </dl>
        <pre class="json small" id="duelJson${i}"></pre>
      </div>`).join('');

    const renderers = sides.map((side, i) => {
      const r = new C.Renderer($('duelCv' + i));
      app.addView(r, () => side.session, () => app.currentTab === 'tab-duel');
      return r;
    });

    function fillAgents() {
      sides.forEach((side, i) => {
        const sel = $('duelAgent' + i);
        sel.innerHTML = C.agents.list().map((a) => `<option value="${a.key}">${a.label}</option>`).join('');
        sel.value = side.agent;
        sel.onchange = () => { side.agent = sel.value; };
      });
    }
    fillAgents();
    app.on('agents', fillAgents);

    const seedInput = $('duelSeed');
    seedInput.value = C.rng.randomSeed();
    $('duelRandom').onclick = () => { seedInput.value = C.rng.randomSeed(); };

    function start() {
      const seed = (+seedInput.value >>> 0) || 1;
      done = false;
      $('duelResult').textContent = '';
      sides.forEach((side, i) => {
        if (side.session) app.sessions.delete(side.session);
        side.session = app.newSession({ seed, controller: app.makeController(side.agent, { seed }) });
        side.session.duel = true;
        app.sessions.add(side.session);
        renderers[i].setMaze(app.maze);
      });
      $('duelPause').textContent = 'Pause';
    }

    $('duelStart').onclick = start;
    $('duelPause').onclick = () => {
      if (!sides[0].session) return;
      const run = !sides.some((s) => s.session.running);
      for (const s of sides) if (!s.session.game.s.over && !s.session.capped) s.session.running = run;
      $('duelPause').textContent = run ? 'Pause' : 'Resume';
    };

    // Stop a side at the move cap so endless games still produce a result.
    app.on('entry', (entry, s) => {
      if (!s.duel) return;
      const cap = +$('duelCap').value || 1500;
      if (entry.move >= cap) { s.running = false; s.capped = true; }
    });

    function finished(s) { return s.game.s.over || s.capped; }

    app.on('frame', () => {
      if (app.currentTab !== 'tab-duel' || !sides[0].session) return;
      sides.forEach((side, i) => {
        const s = side.session, st = s.entry.state;
        $('duelScore' + i).textContent = st.score;
        $('duelLives' + i).textContent = Math.max(0, st.lives);
        $('duelMove' + i).textContent = s.view;
        if (s.lastShown !== s.view) {
          s.lastShown = s.view;
          $('duelJson' + i).innerHTML = C.panel.jsonHTML(C.panel.decisionDocument(s.entry.decision).answers.move);
        }
      });
      if (!done && sides.every((side) => finished(side.session))) {
        done = true;
        const [a, b] = sides.map((side) => side.session);
        const name = (i) => `${i === 0 ? 'A' : 'B'} (${C.agents.get(sides[i].agent).label})`;
        const sa = a.game.s.score, sb = b.game.s.score;
        const verdict = sa === sb ? `Tie at ${sa} points.` : `${name(sa > sb ? 0 : 1)} wins, ${Math.max(sa, sb)} to ${Math.min(sa, sb)}.`;
        $('duelResult').innerHTML = `<b>${verdict}</b> A lasted ${a.last} moves, B lasted ${b.last}.`;
        app.emit('duel', { a, b, agents: sides.map((s) => s.agent) });
      }
    });

    app.on('tab', (id) => { if (id === 'tab-duel' && !sides[0].session) start(); });
  });
})(globalThis);
