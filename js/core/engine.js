/* Game engine: pure, deterministic, DOM-free.
 *
 * The whole game lives in `game.s`, a plain object that structuredClone can copy.
 * One call to step(choice) advances one tile. Randomness comes only from the seeded
 * generator stored in s.rng, so replaying the same choices from the same seed
 * reproduces the game exactly. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const { DIRS, ORDER, OPP } = C;

  const GHOSTS = [
    { name: 'red', color: 'g-red' },
    { name: 'pink', color: 'g-pink' },
    { name: 'cyan', color: 'g-cyan' },
    { name: 'orange', color: 'g-orange' },
  ];
  const RELEASE = [0, 8, 30, 55]; // ticks each ghost waits in the house
  const PHASE = { cycle: 160, scatter: 35 }; // scatter for 35 ticks out of every 160
  const EVENT_RANK = { over: 6, death: 5, level: 4, ghost: 3, power: 2, ready: 1, pellet: 0 };

  class Game {
    constructor(maze, opts = {}) {
      this.maze = maze;
      const seed = (opts.seed ?? C.rng.randomSeed()) >>> 0;
      this.s = {
        seed, rng: seed, tick: 0, moves: 0, level: 1, score: 0, lives: opts.lives ?? 3,
        pellets: maze.pelletTemplate.slice(), left: maze.pelletCount,
        fright: 0, combo: 0, pending: null, over: false, dead: false, phase0: 0,
        pac: null, ghosts: null,
      };
      this.resetPositions();
    }

    static restore(maze, state) {
      const g = Object.create(Game.prototype);
      g.maze = maze;
      g.s = structuredClone(state);
      return g;
    }

    snapshot() {
      return structuredClone(this.s);
    }

    legal() {
      const { x, y } = this.s.pac;
      return ORDER.filter((d) => this.maze.pacOpen(...this.maze.step(x, y, d)));
    }

    resetPositions() {
      const s = this.s, m = this.maze;
      s.pac = { x: m.pacStart.x, y: m.pacStart.y, dir: 'left' };
      s.ghosts = m.ghostStarts.map((p, i) => ({
        i, x: p.x, y: p.y, dir: i === 0 ? 'left' : 'up',
        mode: i === 0 ? 'active' : 'house', scared: false,
        release: s.tick + RELEASE[i],
      }));
      s.fright = 0;
      s.phase0 = s.tick;
      s.dead = false;
      s.pending = null;
    }

    // Advance one tile. choice is 'up' | 'down' | 'left' | 'right' | 'stay'.
    // Returns the list of events that happened this tick.
    step(choice) {
      const s = this.s, m = this.maze;
      if (s.over || s.pending) throw new Error('step() called while the game is paused; call resume() first.');
      const events = [];
      const prevPac = { x: s.pac.x, y: s.pac.y };

      if (choice && choice !== 'stay') {
        const [nx, ny] = m.step(s.pac.x, s.pac.y, choice);
        if (m.pacOpen(nx, ny)) { s.pac.x = nx; s.pac.y = ny; s.pac.dir = choice; }
      }

      const idx = s.pac.y * m.W + s.pac.x, pellet = s.pellets[idx];
      if (pellet) {
        s.pellets[idx] = 0;
        s.left--;
        s.score += pellet === 2 ? 50 : 10;
        if (pellet === 2) {
          s.fright = Math.max(14, 46 - s.level * 6);
          s.combo = 0;
          for (const g of s.ghosts) if (g.mode === 'active') { g.scared = true; g.dir = OPP[g.dir]; }
          events.push({ type: 'power', text: 'Power pellet: the ghosts are frightened' });
        } else {
          events.push({ type: 'pellet', text: '' });
        }
      }

      this.collide(null, null, events);
      if (!s.dead) {
        const prevGhosts = s.ghosts.map((g) => ({ x: g.x, y: g.y }));
        for (const g of s.ghosts) this.moveGhost(g);
        this.collide(prevPac, prevGhosts, events);
      }
      if (s.fright > 0 && --s.fright === 0) for (const g of s.ghosts) g.scared = false;
      s.tick++;
      s.moves++;

      if (s.dead) {
        s.lives--;
        const cause = events.find((e) => e.type === 'death');
        if (s.lives <= 0) {
          s.over = true;
          events.push({ type: 'over', text: `${cause.text}. Game over at ${s.score} points` });
        } else {
          s.pending = 'reset';
        }
      } else if (s.left === 0) {
        s.pending = 'level';
        events.push({ type: 'level', text: `Level ${s.level} cleared` });
      }
      return events;
    }

    // After a death or a cleared level the game waits for resume().
    resume() {
      const s = this.s;
      if (s.pending === 'level') {
        s.level++;
        s.pellets = this.maze.pelletTemplate.slice();
        s.left = this.maze.pelletCount;
      }
      const text = s.pending === 'level' ? `Level ${s.level}` : 'Ready';
      this.resetPositions();
      return { type: 'ready', text };
    }

    collide(prevPac, prevGhosts, events) {
      const s = this.s;
      s.ghosts.forEach((g, k) => {
        if (s.dead || (g.mode !== 'active' && g.mode !== 'leaving')) return;
        const same = g.x === s.pac.x && g.y === s.pac.y;
        const swapped = prevGhosts && g.x === prevPac.x && g.y === prevPac.y &&
          prevGhosts[k].x === s.pac.x && prevGhosts[k].y === s.pac.y;
        if (!same && !swapped) return;
        if (g.scared) {
          g.scared = false;
          g.mode = 'eaten';
          const pts = 200 * 2 ** s.combo;
          s.combo++;
          s.score += pts;
          events.push({ type: 'ghost', text: `Ate the ${GHOSTS[g.i].name} ghost, +${pts}` });
        } else {
          s.dead = true;
          events.push({ type: 'death', text: `Caught by the ${GHOSTS[g.i].name} ghost` });
        }
      });
    }

    target(g) {
      const s = this.s, m = this.maze;
      const corner = m.corners[g.i];
      if ((s.tick - s.phase0) % PHASE.cycle < PHASE.scatter) return corner;
      const p = s.pac, [dx, dy] = DIRS[p.dir];
      switch (g.i) {
        case 0: return [p.x, p.y];
        case 1: return [p.x + 4 * dx, p.y + 4 * dy];
        case 2: {
          const red = s.ghosts[0];
          return [2 * (p.x + 2 * dx) - red.x, 2 * (p.y + 2 * dy) - red.y];
        }
        default: return (g.x - p.x) ** 2 + (g.y - p.y) ** 2 > 64 ? [p.x, p.y] : corner;
      }
    }

    moveGhost(g) {
      const s = this.s, m = this.maze;
      if (g.mode === 'house') {
        if (s.tick < g.release) return;
        g.mode = 'leaving';
      }
      if (g.mode === 'leaving') {
        if (g.x < m.door.x) { g.x++; g.dir = 'right'; }
        else if (g.x > m.door.x) { g.x--; g.dir = 'left'; }
        else { g.y--; g.dir = 'up'; }
        if (g.x === m.exit.x && g.y === m.exit.y) { g.mode = 'active'; g.dir = 'left'; }
        return;
      }
      if (g.mode === 'eaten') {
        if (g.x === m.home.x && g.y === m.home.y) { g.mode = 'leaving'; return; }
        const here = m.homeDist[g.y * m.W + g.x];
        for (const d of ORDER) {
          const [nx, ny] = m.step(g.x, g.y, d);
          const dist = m.ghostOpen(nx, ny) ? m.homeDist[ny * m.W + nx] : -1;
          if (dist >= 0 && dist < here) { g.x = nx; g.y = ny; g.dir = d; break; }
        }
        return;
      }
      // Frightened ghosts move at half speed; others skip one tick in (4 + level).
      if (g.scared && s.tick % 2) return;
      if (!g.scared && s.tick % (4 + s.level) === 0) return;
      let opts = ORDER.filter((d) => d !== OPP[g.dir] && m.pacOpen(...m.step(g.x, g.y, d)));
      if (!opts.length) opts = [OPP[g.dir]];
      let pick = opts[0];
      if (g.scared) {
        pick = opts[Math.floor(C.rng.nextFloat(s) * opts.length)];
      } else {
        const [tx, ty] = this.target(g);
        let best = Infinity;
        for (const d of opts) {
          const [nx, ny] = m.step(g.x, g.y, d);
          const dd = (nx - tx) ** 2 + (ny - ty) ** 2;
          if (dd < best) { best = dd; pick = d; }
        }
      }
      [g.x, g.y] = m.step(g.x, g.y, pick);
      g.dir = pick;
    }

    // The single event worth showing to the viewer.
    static primaryEvent(events) {
      let best = null;
      for (const e of events || []) {
        if (e.type === 'pellet') continue;
        if (!best || EVENT_RANK[e.type] > EVENT_RANK[best.type]) best = e;
      }
      return best;
    }
  }

  Object.assign(C, { Game, GHOSTS });
})(globalThis);
