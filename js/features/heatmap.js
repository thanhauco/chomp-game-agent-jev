/* Heatmaps: where the chomper spends its time and where it gets caught.
 * Counts are kept per maze in localStorage and can be overlaid on the Play board
 * or viewed on the Stats tab. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);

  C.features.push((app) => {
    const cache = new Map(); // maze id -> { visits, deaths, games, dirty }
    function get(maze) {
      let h = cache.get(maze.id);
      if (!h) {
        const saved = C.store.get('heatmap:' + maze.id, null);
        const n = maze.W * maze.H;
        h = saved && saved.visits.length === n
          ? { ...saved, dirty: false }
          : { visits: new Array(n).fill(0), deaths: new Array(n).fill(0), games: 0, dirty: false };
        cache.set(maze.id, h);
      }
      return h;
    }
    function save() {
      for (const [id, h] of cache) {
        if (!h.dirty) continue;
        C.store.set('heatmap:' + id, { visits: h.visits, deaths: h.deaths, games: h.games });
        h.dirty = false;
      }
    }
    addEventListener('pagehide', save);

    let pending = 0;
    app.on('entry', (entry, s) => {
      if (!entry.decision || entry.decision.choice == null) return;
      const h = get(s.maze), st = entry.state, i = st.pac.y * s.maze.W + st.pac.x;
      h.visits[i]++;
      if (entry.events.some((e) => e.type === 'death')) h.deaths[i]++;
      h.dirty = true;
      if (++pending >= 300) { pending = 0; save(); }
    });
    app.on('over', (s) => { get(s.maze).games++; get(s.maze).dirty = true; save(); });

    // --- drawing ---
    function drawHeat(ctx, maze, ts, counts, color) {
      const max = Math.max(0, ...counts);
      if (!max) return max;
      ctx.save();
      ctx.fillStyle = color;
      for (let i = 0; i < counts.length; i++) {
        if (!counts[i]) continue;
        ctx.globalAlpha = 0.1 + 0.7 * (Math.log1p(counts[i]) / Math.log1p(max));
        ctx.fillRect((i % maze.W) * ts, ((i / maze.W) | 0) * ts, ts, ts);
      }
      ctx.restore();
      return max;
    }

    let mode = C.store.get('heatmapMode', 'off');
    const label = document.createElement('label');
    label.className = 'ctl';
    label.htmlFor = 'heatMode';
    label.innerHTML = 'Heatmap <select id="heatMode"><option value="off">Off</option><option value="visits">Visits</option><option value="deaths">Deaths</option></select>';
    app.controls.appendChild(label);
    $('heatMode').value = mode;
    $('heatMode').onchange = (e) => { mode = e.target.value; C.store.set('heatmapMode', mode); };

    app.mainRenderer.layers.unshift({
      id: 'heatmap', z: 'under',
      draw(ctx, { maze, ts, renderer }) {
        if (mode === 'off') return;
        const h = get(maze);
        drawHeat(ctx, maze, ts, h[mode], mode === 'deaths' ? renderer.colors.danger : renderer.colors.accent);
      },
    });

    // --- Stats card ---
    const tab = app.ensureTab('tab-stats', 'Stats');
    const card = document.createElement('div');
    card.className = 'card stat-card';
    card.innerHTML = `
      <div class="stat-head">
        <div>
          <h2>Heatmaps</h2>
          <p class="hint">Every move by any player on the current maze, stored on this device. Darker tiles mean more visits or more lives lost there. The scale is logarithmic so quiet corridors still show.</p>
        </div>
        <div class="tiles" id="heatTiles"></div>
      </div>
      <div class="heat-grid">
        <figure><div class="board"><canvas id="heatVisits" aria-label="Visits heatmap"></canvas></div><figcaption><span class="swatch visits"></span>Visits <span class="muted" id="heatVisitsMax"></span></figcaption></figure>
        <figure><div class="board"><canvas id="heatDeaths" aria-label="Deaths heatmap"></canvas></div><figcaption><span class="swatch deaths"></span>Lives lost <span class="muted" id="heatDeathsMax"></span></figcaption></figure>
      </div>
      <div><button id="heatClear" class="link">Clear heatmaps for this maze</button> <span class="hint" id="heatClearMsg"></span></div>`;
    tab.appendChild(card);
    const minis = [['visits', new C.Renderer($('heatVisits'))], ['deaths', new C.Renderer($('heatDeaths'))]];

    function paint(kind, r) {
      const maze = r.maze, h = get(maze);
      if (!r.canvas.width) return;
      r.readTokens();
      r.drawMaze(maze, null, 0);
      const max = drawHeat(r.ctx, maze, r.ts, h[kind], kind === 'deaths' ? r.colors.danger : r.colors.accent);
      $(kind === 'visits' ? 'heatVisitsMax' : 'heatDeathsMax').textContent = max ? `(darkest tile: ${max})` : '(no data yet)';
    }
    for (const [kind, r] of minis) r.onResize = () => paint(kind, r);

    function renderCard() {
      const maze = app.maze, h = get(maze);
      for (const [kind, r] of minis) {
        if (r.maze !== maze) r.setMaze(maze); else paint(kind, r);
      }
      const total = (a) => a.reduce((x, y) => x + y, 0);
      $('heatTiles').innerHTML = [['Games', h.games], ['Moves', total(h.visits)], ['Lives lost', total(h.deaths)]]
        .map(([k, v]) => `<div class="tile"><div class="tile-k">${k}</div><div class="tile-v">${v}</div></div>`).join('');
    }
    let confirmClear = false;
    $('heatClear').onclick = () => {
      if (!confirmClear) { confirmClear = true; $('heatClearMsg').textContent = 'Click again to delete this maze’s heatmaps.'; return; }
      confirmClear = false;
      cache.delete(app.maze.id);
      C.store.remove('heatmap:' + app.maze.id);
      $('heatClearMsg').textContent = 'Cleared.';
      renderCard();
    };
    app.on('tab', (id) => { if (id === 'tab-stats') requestAnimationFrame(renderCard); });
    app.on('theme', () => { if (app.currentTab === 'tab-stats') renderCard(); });
  });
})(globalThis);
