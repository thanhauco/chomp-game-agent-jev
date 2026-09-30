/* Move analysis shared by the agents.
 * For one candidate move, look one tile ahead and measure what matters:
 * food, ghosts that can hurt us, ghosts we could eat. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  function analyzeMove(game, dir) {
    const s = game.s, m = game.maze;
    const [nx, ny] = m.step(s.pac.x, s.pac.y, dir);
    const dist = m.bfs(nx, ny);
    const pellet = s.pellets[ny * m.W + nx];

    let nearFood = m.W + m.H;
    for (let i = 0; i < s.pellets.length; i++) {
      if (s.pellets[i] && dist[i] >= 0 && dist[i] < nearFood) nearFood = dist[i];
    }

    const threats = [], prey = [];
    for (const g of s.ghosts) {
      if (g.mode !== 'active' && g.mode !== 'leaving') continue;
      const d = dist[g.y * m.W + g.x];
      if (d < 0) continue; // still inside the house
      // A frightened ghost that will recover before we reach it still counts as a threat.
      if (g.scared && s.fright > d + 3) prey.push({ ghost: g.i, d });
      else threats.push({ ghost: g.i, d });
    }
    return { dir, nx, ny, dist, pellet, nearFood, threats, prey, reverse: dir === C.OPP[s.pac.dir] };
  }

  C.analyzeMove = analyzeMove;
})(globalThis);
