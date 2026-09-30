/* Maze: parses the ASCII layout and answers geometry questions.
 *
 * Legend
 *   #  wall            .  pellet          o  power pellet
 *   -  ghost-house door (ghosts only)     G  ghost-house floor
 *   P  chomper start   (space) empty floor, e.g. the wrap-around tunnel
 */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const ORDER = ['up', 'down', 'left', 'right'];
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const ALLOWED = new Set(['#', '.', 'o', ' ', '-', 'G', 'P']);

  const DEFAULT_ROWS = [
    '###################',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o...............o#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.### # ###.####',
    '####.#       #.####',
    '####.# ##-## #.####',
    '    .  #GGG#  .    ',
    '####.# ##### #.####',
    '####.#       #.####',
    '####.# ##### #.####',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o.#.....P.....#.o#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
    '#.######.#.######.#',
    '#.................#',
    '###################',
  ];

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // Breadth-first distances over a rows array; used before a Maze exists (validation).
  function bfsRows(rows, sx, sy, open) {
    const H = rows.length, W = rows[0].length;
    const d = new Int16Array(W * H).fill(-1);
    const q = [sy * W + sx];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const k of ORDER) {
        const nx = (x + DIRS[k][0] + W) % W, ny = y + DIRS[k][1];
        if (ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        if (d[j] < 0 && open(rows[ny][nx])) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    return d;
  }

  class Maze {
    constructor(rows = DEFAULT_ROWS) {
      const errors = Maze.validate(rows);
      if (errors.length) throw new Error(errors.join(' '));
      this.rows = rows.slice();
      this.H = rows.length;
      this.W = rows[0].length;
      this.id = fnv1a(rows.join('\n'));
      this.isDefault = rows.join('') === DEFAULT_ROWS.join('');

      const house = [];
      this.pelletTemplate = new Uint8Array(this.W * this.H);
      this.pelletCount = 0;
      for (let y = 0; y < this.H; y++) {
        for (let x = 0; x < this.W; x++) {
          const c = rows[y][x];
          if (c === 'P') this.pacStart = { x, y };
          else if (c === '-') this.door = { x, y };
          else if (c === 'G') house.push({ x, y });
          else if (c === '.' || c === 'o') {
            this.pelletTemplate[y * this.W + x] = c === 'o' ? 2 : 1;
            this.pelletCount++;
          }
        }
      }
      this.exit = { x: this.door.x, y: this.door.y - 1 };
      this.home = { x: this.door.x, y: this.door.y + 1 };
      house.sort((a, b) => Math.abs(a.x - this.home.x) - Math.abs(b.x - this.home.x));
      // Ghost 0 starts outside the house; the others wait inside it.
      this.ghostStarts = [{ ...this.exit }];
      for (let i = 0; i < 3; i++) this.ghostStarts.push({ ...house[i % house.length] });
      // Scatter targets sit just outside each corner, as in the arcade game.
      this.corners = [[this.W - 2, -2], [1, -2], [this.W - 1, this.H + 1], [0, this.H + 1]];
      this.homeDist = this.bfs(this.home.x, this.home.y, (x, y) => this.ghostOpen(x, y));
    }

    tile(x, y) {
      if (y < 0 || y >= this.H) return '#';
      return this.rows[y][((x % this.W) + this.W) % this.W];
    }
    step(x, y, d) {
      return [(x + DIRS[d][0] + this.W) % this.W, y + DIRS[d][1]];
    }
    // The chomper and roaming ghosts share one rule: no walls, no door.
    pacOpen(x, y) {
      const c = this.tile(x, y);
      return c !== '#' && c !== '-';
    }
    ghostOpen(x, y) {
      return this.tile(x, y) !== '#';
    }
    bfs(sx, sy, open = (x, y) => this.pacOpen(x, y)) {
      const W = this.W, H = this.H;
      const d = new Int16Array(W * H).fill(-1);
      const q = [sy * W + sx];
      d[q[0]] = 0;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const k of ORDER) {
          const [nx, ny] = this.step(x, y, k);
          if (ny < 0 || ny >= H) continue;
          const j = ny * W + nx;
          if (d[j] < 0 && open(nx, ny)) { d[j] = d[i] + 1; q.push(j); }
        }
      }
      return d;
    }

    // Share codes: run-length encoded rows in URL-safe base64, e.g. "CHOMP1.19x21.IzE5..."
    static encode(rows) {
      const body = rows.join('');
      let rle = '';
      for (let i = 0; i < body.length;) {
        let j = i;
        while (j < body.length && body[j] === body[i]) j++;
        rle += j - i > 2 ? body[i] + (j - i) : body[i].repeat(j - i);
        i = j;
      }
      const b64 = btoa(rle).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `CHOMP1.${rows[0].length}x${rows.length}.${b64}`;
    }

    static decode(code) {
      const m = /^CHOMP1\.(\d+)x(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
      if (!m) throw new Error('That is not a maze share code. Codes start with "CHOMP1.".');
      const W = +m[1], H = +m[2];
      let rle;
      try { rle = atob(m[3].replace(/-/g, '+').replace(/_/g, '/')); } catch { throw new Error('The share code is damaged.'); }
      let body = '';
      for (let i = 0; i < rle.length;) {
        const ch = rle[i++];
        let digits = '';
        while (i < rle.length && rle[i] >= '0' && rle[i] <= '9') digits += rle[i++];
        body += digits ? ch.repeat(+digits) : ch;
      }
      if (body.length !== W * H) throw new Error('The share code is incomplete.');
      const rows = [];
      for (let y = 0; y < H; y++) rows.push(body.slice(y * W, (y + 1) * W));
      return rows;
    }

    // Returns a list of human-readable problems; an empty list means the maze is playable.
    static validate(rows) {
      const errs = [];
      if (!Array.isArray(rows) || rows.length < 7 || rows.length > 41) return ['The maze needs 7 to 41 rows.'];
      const W = rows[0].length;
      if (W < 7 || W > 41) return ['The maze needs 7 to 41 columns.'];
      if (rows.some((r) => typeof r !== 'string' || r.length !== W)) return ['Every row must be the same width.'];
      const count = { P: 0, '-': 0, G: 0, pellets: 0 };
      let pac = null, door = null;
      rows.forEach((r, y) => [...r].forEach((c, x) => {
        if (!ALLOWED.has(c)) errs.push(`Unknown tile "${c}" at column ${x}, row ${y}.`);
        if (c === 'P') { count.P++; pac = { x, y }; }
        if (c === '-') { count['-']++; door = { x, y }; }
        if (c === 'G') count.G++;
        if (c === '.' || c === 'o') count.pellets++;
      }));
      if (errs.length) return errs.slice(0, 3);
      if (count.P !== 1) errs.push(`Place exactly one chomper start (found ${count.P}).`);
      if (count['-'] !== 1) errs.push(`Place exactly one ghost-house door (found ${count['-']}).`);
      if (!count.G) errs.push('Add at least one ghost-house tile.');
      if (!count.pellets) errs.push('Add at least one pellet.');
      if (errs.length) return errs;

      const H = rows.length;
      const pacOpen = (c) => c !== '#' && c !== '-';
      if (door.y < 1 || door.y > H - 2 || !pacOpen(rows[door.y - 1][door.x]) || rows[door.y - 1][door.x] === 'G')
        errs.push('The tile above the door must be open floor so ghosts can leave.');
      if (door.y < H - 1 && rows[door.y + 1][door.x] !== 'G')
        errs.push('The tile below the door must be ghost-house floor.');
      // House tiles must form one row under the door, connected to the tile below it.
      rows.forEach((r, y) => [...r].forEach((c, x) => {
        if (c !== 'G') return;
        if (y !== door.y + 1) { errs.push('Ghost-house tiles must all sit in the row directly below the door.'); return; }
        const lo = Math.min(x, door.x), hi = Math.max(x, door.x);
        for (let k = lo; k <= hi; k++) if (r[k] !== 'G') { errs.push('Ghost-house tiles must connect to the tile under the door.'); return; }
      }));
      if (errs.length) return [...new Set(errs)];

      const reach = bfsRows(rows, pac.x, pac.y, pacOpen);
      let unreachable = 0;
      rows.forEach((r, y) => [...r].forEach((c, x) => {
        if ((c === '.' || c === 'o') && reach[y * W + x] < 0) unreachable++;
      }));
      if (unreachable) errs.push(`${unreachable} pellet${unreachable > 1 ? 's are' : ' is'} unreachable from the start.`);
      if (reach[(door.y - 1) * W + door.x] < 0) errs.push('Ghosts leaving the house could never reach the chomper.');
      return errs;
    }
  }

  Object.assign(C, { Maze, DIRS, ORDER, OPP, DEFAULT_ROWS });
})(globalThis);
