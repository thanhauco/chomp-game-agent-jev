/* Reasoning overlay: what the agent is weighing, drawn on the board.
 *   - red tint: tiles a dangerous ghost can reach within a few moves
 *   - dashed line: shortest path to the nearest pellet
 *   - arrows: one per legal move, length proportional to its probability
 * Plus a bar per move under the JSON with its probability and raw score. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);
  const DANGER_RADIUS = 5;

  // Geometry derived from one state; cached per history entry.
  function analyze(maze, s) {
    const danger = new Float32Array(maze.W * maze.H);
    for (const g of s.ghosts) {
      if ((g.mode !== 'active' && g.mode !== 'leaving') || g.scared) continue;
      const d = maze.bfs(g.x, g.y);
      for (let i = 0; i < d.length; i++) {
        if (d[i] >= 0 && d[i] <= DANGER_RADIUS) danger[i] = Math.max(danger[i], 1 - d[i] / (DANGER_RADIUS + 1));
      }
    }
    // Path to the nearest pellet, by BFS with parent links.
    const W = maze.W, start = s.pac.y * W + s.pac.x;
    const prev = new Int32Array(W * maze.H).fill(-2);
    prev[start] = -1;
    const q = [start];
    let goal = -1;
    for (let h = 0; h < q.length && goal < 0; h++) {
      const i = q[h];
      for (const k of C.ORDER) {
        const [nx, ny] = maze.step(i % W, (i / W) | 0, k);
        if (!maze.pacOpen(nx, ny)) continue;
        const j = ny * W + nx;
        if (prev[j] !== -2) continue;
        prev[j] = i;
        if (s.pellets[j]) { goal = j; break; }
        q.push(j);
      }
    }
    const path = [];
    for (let i = goal; i >= 0; i = prev[i]) path.push(i);
    return { danger, path: path.reverse() };
  }

  C.features.push((app) => {
    const cache = new WeakMap();
    const get = (maze, entry) => {
      let v = cache.get(entry);
      if (!v) { v = analyze(maze, entry.state); cache.set(entry, v); }
      return v;
    };
    let enabled = C.store.get('reasoning', true);

    const toggle = document.createElement('label');
    toggle.className = 'check';
    toggle.innerHTML = '<input id="reasonToggle" type="checkbox"> Show reasoning';
    app.controls.appendChild(toggle);
    $('reasonToggle').checked = enabled;
    $('reasonToggle').onchange = (e) => {
      enabled = e.target.checked;
      C.store.set('reasoning', enabled);
      bars.hidden = !enabled;
    };

    app.mainRenderer.layers.push({
      id: 'danger', z: 'under',
      draw(ctx, { maze, ts, b, renderer }) {
        if (!enabled) return;
        const { danger, path } = get(maze, b);
        ctx.save();
        ctx.fillStyle = renderer.colors.danger;
        for (let i = 0; i < danger.length; i++) {
          if (!danger[i]) continue;
          ctx.globalAlpha = 0.28 * danger[i];
          ctx.fillRect((i % maze.W) * ts, ((i / maze.W) | 0) * ts, ts, ts);
        }
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = renderer.colors.accent;
        ctx.lineWidth = Math.max(1.5, ts * 0.1);
        ctx.setLineDash([ts * 0.25, ts * 0.2]);
        ctx.beginPath();
        path.forEach((i, k) => {
          const x = (i % maze.W + 0.5) * ts, y = (((i / maze.W) | 0) + 0.5) * ts;
          // Don't draw a line across the board when the path wraps through the tunnel.
          if (k && Math.abs(i % maze.W - path[k - 1] % maze.W) > 1) ctx.moveTo(x, y);
          else if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      },
    });

    app.mainRenderer.layers.push({
      id: 'arrows', z: 'over',
      draw(ctx, { ts, a, b, t, renderer }) {
        if (!enabled || !b.decision || b.decision.choice == null) return;
        const from = a.state.pac, to = b.state.pac;
        const wrap = Math.abs(from.x - to.x) > 1;
        const px = ((wrap ? to.x : from.x + (to.x - from.x) * t) + 0.5) * ts;
        const py = ((wrap ? to.y : from.y + (to.y - from.y) * t) + 0.5) * ts;
        ctx.save();
        ctx.strokeStyle = renderer.colors.accent;
        ctx.fillStyle = renderer.colors.accent;
        ctx.lineWidth = Math.max(2, ts * 0.12);
        ctx.lineCap = 'round';
        for (const [dir, p] of Object.entries(b.decision.probs)) {
          const [dx, dy] = C.DIRS[dir];
          const r0 = ts * 0.62, r1 = r0 + ts * (0.25 + 1.6 * p);
          ctx.globalAlpha = 0.35 + 0.65 * p;
          ctx.beginPath();
          ctx.moveTo(px + dx * r0, py + dy * r0);
          ctx.lineTo(px + dx * r1, py + dy * r1);
          ctx.stroke();
          const h = ts * 0.22;
          ctx.beginPath();
          ctx.moveTo(px + dx * (r1 + h), py + dy * (r1 + h));
          ctx.lineTo(px + dx * r1 - dy * h, py + dy * r1 - dx * h);
          ctx.lineTo(px + dx * r1 + dy * h, py + dy * r1 + dx * h);
          ctx.fill();
        }
        ctx.restore();
      },
    });

    // Probability and score bars under the JSON.
    const bars = document.createElement('div');
    bars.className = 'bars';
    bars.hidden = !enabled;
    $('json').after(bars);
    app.on('panel', (entry) => {
      const d = entry.decision;
      const rows = Object.entries(d.probs).sort((x, y) => y[1] - x[1]);
      const who = d.by === 'you' ? 'Agent advice' : 'Move probabilities';
      bars.innerHTML = `<div class="bars-title">${who}</div>` + rows.map(([dir, p]) => {
        const score = d.scores && dir in d.scores ? d.scores[dir].toFixed(1) : '';
        const chosen = dir === d.choice ? ' chosen' : '';
        return `<div class="bar-row${chosen}"><span class="bar-dir">${dir}</span>` +
          `<span class="bar-track"><span class="bar-fill" style="width:${(p * 100).toFixed(1)}%"></span></span>` +
          `<span class="bar-num">${Math.round(p * 100)}%</span><span class="bar-num muted" title="Raw score">${score}</span></div>`;
      }).join('');
    });
  });
})(globalThis);
