/* Train tab: run Q-learning in the browser and watch the learning curve. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => C.panel.escapeHTML(s);
  const WINDOW = 20; // moving-average width

  C.features.push((app) => {
    const tab = app.ensureTab('tab-train', 'Train');
    tab.innerHTML = `
      <div class="card stat-card">
        <div class="stat-head">
          <div>
            <h2>Train a Q-learning agent</h2>
            <p class="hint">The agent scores each move as a weighted sum of eight features. Training plays fast headless games on the current maze, explores at random a share of the time (epsilon), and nudges the weights toward moves that led to more reward. Pellets and ghosts earn points, a lost life costs 50.</p>
          </div>
        </div>
        <div class="train-form">
          <label for="trEpisodes">Episodes</label><input id="trEpisodes" type="number" min="10" max="5000" step="10" value="200">
          <label for="trAlpha">Learning rate (alpha)</label><input id="trAlpha" type="number" min="0.0005" max="0.2" step="0.0005" value="0.01">
          <label for="trGamma">Discount (gamma)</label><input id="trGamma" type="number" min="0" max="0.99" step="0.01" value="0.9">
          <label for="trEpsilon">Starting exploration (epsilon)</label><input id="trEpsilon" type="number" min="0" max="1" step="0.05" value="0.3">
          <label for="trFrom">Start from</label>
          <select id="trFrom"><option value="current">Current weights</option><option value="zero">All zeros (from scratch)</option></select>
        </div>
        <div class="controls">
          <button id="trStart" class="primary">Start training</button>
          <button id="trStop" disabled>Stop</button>
          <button id="trWatch">Watch the trained agent</button>
          <button id="trReset" class="link">Restore the pretrained weights</button>
          <span class="hint" id="trStatus" aria-live="polite"></span>
        </div>
        <div class="tiles" id="trTiles"></div>
        <div class="legend"><span><i class="lg-dot"></i>Score per episode</span><span><i class="lg-line"></i>${WINDOW}-episode average</span></div>
        <div class="chart-wrap" id="trChart"></div>
        <h3>Weights</h3>
        <div class="weights" id="trWeights"></div>
      </div>`;

    let trainer = null, timer = null, curve = [];
    const current = () => C.qlearn.loadWeights();

    function saveWeights(w, episodes) {
      const prev = C.store.get('qweights', null);
      C.store.set('qweights', { weights: w, episodes: (prev ? prev.episodes : 0) + episodes, maze: app.maze.id });
    }

    function start() {
      const zero = Object.fromEntries(C.qlearn.FEATURES.map((f) => [f.key, 0]));
      trainer = new C.qlearn.Trainer({
        maze: app.maze,
        weights: $('trFrom').value === 'zero' ? zero : current(),
        episodes: Math.max(10, +$('trEpisodes').value || 200),
        alpha: +$('trAlpha').value || 0.01,
        gamma: +$('trGamma').value,
        epsilon: +$('trEpsilon').value,
      });
      curve = [];
      $('trStart').disabled = true;
      $('trStop').disabled = false;
      const t0 = performance.now();
      const slice = () => {
        const done = trainer.runFor(24);
        curve = trainer.history;
        const secs = (performance.now() - t0) / 1000;
        $('trStatus').textContent = `Episode ${trainer.episode} of ${trainer.episodes} · ${Math.round(trainer.steps / Math.max(secs, 0.001)).toLocaleString()} moves per second · epsilon ${trainer.currentEpsilon.toFixed(2)}`;
        render(trainer.weights);
        if (done) finish('Training finished. The Q-learning agent now uses these weights.');
        else timer = setTimeout(slice, 0);
      };
      slice();
    }

    function finish(text) {
      clearTimeout(timer);
      timer = null;
      if (trainer && trainer.episode > 0) saveWeights(trainer.weights, trainer.episode);
      $('trStart').disabled = false;
      $('trStop').disabled = true;
      $('trStatus').textContent = text;
      render(current());
    }

    $('trStart').onclick = start;
    $('trStop').onclick = () => finish(`Stopped after ${trainer.episode} episodes. Weights so far are saved.`);
    $('trReset').onclick = () => { C.store.remove('qweights'); curve = []; render(current()); $('trStatus').textContent = 'Pretrained weights restored.'; };
    $('trWatch').onclick = () => {
      $('agent').value = 'qlearn';
      app.setAgent('qlearn');
      app.setMode('watch');
      app.newGame();
      app.showTab('tab-play');
    };

    function render(weights) {
      const saved = C.store.get('qweights', null);
      const last = curve.slice(-WINDOW).map((h) => h.score);
      const avg = last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : null;
      $('trTiles').innerHTML = [
        ['Episodes this run', curve.length],
        [`Average of last ${WINDOW}`, avg ?? '–'],
        ['Episodes in saved weights', saved ? saved.episodes : 'pretrained'],
      ].map(([k, v]) => `<div class="tile"><div class="tile-k">${k}</div><div class="tile-v">${v}</div></div>`).join('');
      $('trChart').innerHTML = chart(curve);
      const max = Math.max(1, ...Object.values(weights).map(Math.abs));
      $('trWeights').innerHTML = C.qlearn.FEATURES.map((f) => {
        const v = weights[f.key] || 0, pct = (Math.abs(v) / max) * 50;
        return `<div class="w-row"><span>${esc(f.label)}</span><span class="w-track"><span class="w-fill ${v < 0 ? 'neg' : 'pos'}" style="${v < 0 ? `right:50%;width:${pct}%` : `left:50%;width:${pct}%`}"></span></span><span class="mono">${v.toFixed(2)}</span></div>`;
      }).join('');
    }

    function chart(h) {
      const W = 640, H = 260, m = { l: 52, r: 16, t: 12, b: 36 };
      if (!h.length) return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Learning curve"><text class="axis" x="${W / 2}" y="${H / 2}" text-anchor="middle">Start training to draw the learning curve</text></svg>`;
      const maxY = Math.max(100, ...h.map((p) => p.score));
      const niceMax = Math.ceil(maxY / 1000) * 1000 || 1000;
      const n = Math.max(h.length, 10);
      const x = (i) => m.l + ((i + 0.5) / n) * (W - m.l - m.r);
      const y = (v) => H - m.b - (v / niceMax) * (H - m.t - m.b);
      const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
      const ma = h.map((_, i) => {
        const w = h.slice(Math.max(0, i - WINDOW + 1), i + 1);
        return w.reduce((a, p) => a + p.score, 0) / w.length;
      });
      const xt = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Learning curve: score per episode">
        ${yt.map((v) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? v / 1000 + 'k' : v}</text>`).join('')}
        ${xt.map((i) => `<text class="axis" x="${x(i)}" y="${H - m.b + 18}" text-anchor="middle">${i + 1}</text>`).join('')}
        <text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">Episode</text>
        ${h.map((p, i) => `<circle class="raw" cx="${x(i)}" cy="${y(p.score)}" r="3"><title>Episode ${p.episode}: ${p.score} points, ${p.moves} moves</title></circle>`).join('')}
        <path class="ma" d="${ma.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>
      </svg>`;
    }

    app.on('tab', (id) => { if (id === 'tab-train' && !timer) render(current()); });
  });
})(globalThis);
