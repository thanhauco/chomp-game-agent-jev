/* Stats tab, part 1: the calibration dashboard.
 * Finished games (Play and Duel) are folded into per-agent bins in localStorage. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => C.panel.escapeHTML(s);

  C.features.push((app) => {
    const tab = app.ensureTab('tab-stats', 'Stats');
    const card = document.createElement('div');
    card.className = 'card stat-card';
    card.innerHTML = `
      <div class="stat-head">
        <div>
          <h2>Calibration</h2>
          <p class="hint">Is the agent as sure as it should be? Each point groups moves by the probability the agent gave its chosen move, and shows how many of those moves survived the next ${C.calibration.HORIZON} moves.</p>
        </div>
        <label class="ctl" for="calAgent">Agent <select id="calAgent"></select></label>
      </div>
      <div class="tiles" id="calTiles"></div>
      <div class="chart-wrap" id="calChart"></div>
      <p class="hint">Points below the diagonal mean overconfidence: moves the agent felt sure about still led to a lost life. Survival is a stand-in for "right move", so read the gap as a trend, not an exact score.</p>
      <details><summary>Table view</summary><div class="table-wrap" id="calTable"></div></details>
      <div><button id="calClear" class="link">Clear calibration data</button> <span class="hint" id="calClearMsg"></span></div>`;
    tab.appendChild(card);

    const load = () => C.store.get('calibration', {});
    let data = load();

    function record(session) {
      if (session.calibrated) return;
      session.calibrated = true;
      const byAgent = {};
      for (const smp of C.calibration.samples(session.history)) (byAgent[smp.agent] = byAgent[smp.agent] || []).push(smp);
      for (const [key, list] of Object.entries(byAgent)) {
        const rec = data[key] || { label: C.agents.get(key)?.label || list[0].label || key, games: 0, bins: C.calibration.emptyBins() };
        C.calibration.accumulate(rec.bins, list);
        rec.games++;
        data[key] = rec;
      }
      C.store.set('calibration', data);
      if (app.currentTab === 'tab-stats') render();
    }
    app.on('over', record);
    app.on('duel', ({ a, b }) => { record(a); record(b); });

    function fillAgents() {
      const sel = $('calAgent');
      const keys = Object.keys(data);
      const prev = sel.value;
      sel.innerHTML = keys.length
        ? keys.map((k) => `<option value="${k}">${esc(data[k].label)}</option>`).join('')
        : '<option value="">No finished games yet</option>';
      sel.value = keys.includes(prev) ? prev : keys.includes(app.agentKey) ? app.agentKey : keys[0] || '';
    }
    $('calAgent').onchange = render;

    function render() {
      fillAgents();
      const rec = data[$('calAgent').value];
      const sum = rec ? C.calibration.summarize(rec.bins) : { points: [], n: 0, ece: null };
      $('calTiles').innerHTML = [
        ['Games', rec ? rec.games : 0],
        ['Moves scored', sum.n],
        ['Calibration error', sum.ece == null ? '–' : sum.ece.toFixed(3)],
      ].map(([k, v]) => `<div class="tile"><div class="tile-k">${k}</div><div class="tile-v">${v}</div></div>`).join('');
      $('calChart').innerHTML = chart(sum.points, rec ? rec.label : '');
      $('calTable').innerHTML = sum.points.length
        ? `<table><thead><tr><th>Probability bin</th><th>Moves</th><th>Mean probability</th><th>Survived ${C.calibration.HORIZON} moves</th></tr></thead><tbody>${
          sum.points.map((p) => `<tr><td>${p.lo.toFixed(1)}–${p.hi.toFixed(1)}</td><td>${p.n}</td><td>${p.meanP.toFixed(2)}</td><td>${(p.rate * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint">Finish a game with an agent playing to see data here.</p>';
      wireTooltip();
    }

    // A reliability diagram as inline SVG, one series, diagonal for reference.
    function chart(points, label) {
      const W = 520, H = 320, m = { l: 52, r: 16, t: 16, b: 48 };
      const x = (v) => m.l + v * (W - m.l - m.r), y = (v) => H - m.b - v * (H - m.t - m.b);
      const ticks = [0, 0.25, 0.5, 0.75, 1];
      const maxN = Math.max(1, ...points.map((p) => p.n));
      const grid = ticks.map((t) => `
        <line class="grid" x1="${x(0)}" x2="${x(1)}" y1="${y(t)}" y2="${y(t)}"/>
        <text class="axis" x="${x(0) - 8}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>
        <text class="axis" x="${x(t)}" y="${y(0) + 18}" text-anchor="middle">${t.toFixed(2)}</text>`).join('');
      const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.meanP).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
      const dots = points.map((p) => {
        const r = 4 + 5 * Math.sqrt(p.n / maxN);
        const tip = `${p.lo.toFixed(1)}–${p.hi.toFixed(1)}: ${p.n} moves, mean probability ${p.meanP.toFixed(2)}, survived ${(p.rate * 100).toFixed(1)}%`;
        return `<circle class="hit" cx="${x(p.meanP)}" cy="${y(p.rate)}" r="${r + 8}" data-tip="${esc(tip)}"/>` +
          `<circle class="dot" cx="${x(p.meanP)}" cy="${y(p.rate)}" r="${r}"/>`;
      }).join('');
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration of ${esc(label)}">
        ${grid}
        <line class="diag" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}"/>
        ${points.length ? `<path class="series" d="${line}"/>` : `<text class="axis" x="${W / 2}" y="${H / 2}" text-anchor="middle">No finished games yet</text>`}
        ${dots}
        <text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 8}" text-anchor="middle">Probability given to the chosen move</text>
        <text class="axis" transform="translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">Survived next ${C.calibration.HORIZON} moves</text>
      </svg><div class="tooltip" id="calTip" hidden></div>`;
    }

    function wireTooltip() {
      const tip = $('calTip');
      for (const c of $('calChart').querySelectorAll('circle.hit')) {
        c.addEventListener('pointerenter', () => { tip.textContent = c.dataset.tip; tip.hidden = false; });
        c.addEventListener('pointermove', (e) => {
          const r = $('calChart').getBoundingClientRect();
          tip.style.left = `${Math.min(e.clientX - r.left + 12, r.width - 220)}px`;
          tip.style.top = `${e.clientY - r.top + 12}px`;
        });
        c.addEventListener('pointerleave', () => { tip.hidden = true; });
      }
    }

    let confirmClear = false;
    $('calClear').onclick = () => {
      if (!confirmClear) {
        confirmClear = true;
        $('calClearMsg').textContent = 'Click again to delete all calibration data on this device.';
        return;
      }
      confirmClear = false;
      data = {};
      C.store.remove('calibration');
      $('calClearMsg').textContent = 'Cleared.';
      render();
    };

    app.on('tab', (id) => { if (id === 'tab-stats') { data = load(); render(); } });
  });
})(globalThis);
