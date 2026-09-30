/* Canvas renderer.
 * Draws one history entry, sliding actors from the previous entry by t in [0, 1].
 * Colors come from CSS custom properties (--b-*), so light, dark and CRT themes
 * are pure CSS. Features add drawing through `layers`:
 *   { id, z: 'under' | 'over', draw(ctx, info) }
 * 'under' layers paint after the maze and before the actors; 'over' paint last. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const TOKENS = ['bg', 'wall', 'dot', 'door', 'pac', 'eye', 'pupil', 'scared', 'text', 'accent', 'danger',
    'g-red', 'g-pink', 'g-cyan', 'g-orange'];
  const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  const lerp = (a, b, t) =>
    Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 ? { x: b.x, y: b.y } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.layers = [];
      this.colors = {};
      this.ts = 16;
      this.maze = null;
      this.readTokens();
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }

    readTokens() {
      const cs = getComputedStyle(this.canvas);
      for (const k of TOKENS) this.colors[k] = cs.getPropertyValue('--b-' + k).trim();
      this.font = cs.getPropertyValue('--mono').trim() || 'monospace';
    }

    setMaze(maze) {
      this.maze = maze;
      this.canvas.parentElement.style.aspectRatio = `${maze.W} / ${maze.H}`;
      this.resize();
    }

    resize() {
      if (!this.maze) return;
      const r = this.canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.ts = r.width / this.maze.W;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Resizing clears the canvas; static pictures repaint through this hook.
      if (this.onResize) this.onResize();
    }

    // Tile coordinates of a point on the canvas, for editors and clicks.
    tileAt(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return { x: Math.floor((clientX - r.left) / this.ts), y: Math.floor((clientY - r.top) / this.ts) };
    }

    drawMaze(maze, pellets, now) {
      const { ctx, ts, colors: c } = this;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, maze.W * ts, maze.H * ts);
      ctx.fillStyle = c.wall;
      for (let y = 0; y < maze.H; y++) {
        for (let x = 0; x < maze.W; x++) {
          if (maze.rows[y][x] === '#') ctx.fillRect(x * ts - 0.3, y * ts - 0.3, ts + 0.6, ts + 0.6);
        }
      }
      ctx.fillStyle = c.door;
      ctx.fillRect(maze.door.x * ts, (maze.door.y + 0.42) * ts, ts, ts * 0.16);
      if (!pellets) return;
      ctx.fillStyle = c.dot;
      for (let i = 0; i < pellets.length; i++) {
        if (!pellets[i]) continue;
        const x = i % maze.W, y = (i / maze.W) | 0;
        const r = pellets[i] === 2 ? ts * (0.2 + 0.04 * Math.sin(now / 200)) : ts * 0.085;
        ctx.beginPath();
        ctx.arc((x + 0.5) * ts, (y + 0.5) * ts, r, 0, 7);
        ctx.fill();
      }
    }

    drawGhost(g, pos, fright, now) {
      const { ctx, ts, colors: c } = this;
      const cx = (pos.x + 0.5) * ts, cy = (pos.y + 0.5) * ts, r = ts * 0.44;
      if (g.mode !== 'eaten') {
        let col = c[C.GHOSTS[g.i].color];
        if (g.scared) col = fright < 10 && Math.floor(now / 180) % 2 ? c.eye : c.scared;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0);
        ctx.lineTo(cx + r, cy + r * 0.85);
        const w = (2 * r) / 3, sway = Math.floor(now / 160) % 2 ? -w * 0.1 : w * 0.1;
        for (let k = 0; k < 3; k++) {
          const x0 = cx + r - k * w;
          ctx.quadraticCurveTo(x0 - w / 2 + sway, cy + r * 0.55, x0 - w, cy + r * 0.85);
        }
        ctx.closePath();
        ctx.fill();
      }
      if (g.scared) {
        ctx.fillStyle = c.eye;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * r * 0.33, cy - r * 0.2, r * 0.12, 0, 7); ctx.fill(); }
        return;
      }
      const [dx, dy] = C.DIRS[g.dir] || [0, 0];
      for (const s of [-1, 1]) {
        const ex = cx + s * r * 0.35, ey = cy - r * 0.2;
        ctx.fillStyle = c.eye;
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.25, r * 0.3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = c.pupil;
        ctx.beginPath(); ctx.arc(ex + dx * r * 0.1, ey + dy * r * 0.12, r * 0.13, 0, 7); ctx.fill();
      }
    }

    drawPac(pos, dir, moving, dying, t, now) {
      const { ctx, ts, colors: c } = this;
      let mouth = moving ? 0.05 + 0.28 * Math.abs(Math.sin(now / 70)) : 0.18;
      if (dying) mouth = Math.min(Math.PI * 0.98, 0.2 + t * Math.PI);
      const ang = ANGLE[dir] ?? 0, cx = (pos.x + 0.5) * ts, cy = (pos.y + 0.5) * ts;
      ctx.fillStyle = c.pac;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, ts * 0.46, ang + mouth, ang + 2 * Math.PI - mouth);
      ctx.closePath();
      ctx.fill();
      if (dying) return;
      ctx.fillStyle = c.pupil;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang - Math.PI / 2) * ts * 0.2, cy + Math.sin(ang - Math.PI / 2) * ts * 0.2, ts * 0.05, 0, 7);
      ctx.fill();
    }

    // Draw entry b, with actors moving from entry a by fraction t.
    draw(a, b, t, now) {
      const maze = this.maze;
      if (!maze || !this.canvas.width) return;
      const { ctx, ts } = this;
      const sa = a.state, sb = b.state;
      ctx.clearRect(0, 0, maze.W * ts, maze.H * ts);
      // Pellets disappear when the chomper reaches the middle of the step.
      this.drawMaze(maze, t < 0.5 ? sa.pellets : sb.pellets, now);
      const info = { maze, ts, a, b, t, now, renderer: this };
      for (const l of this.layers) if (l.z === 'under') l.draw(ctx, info);

      sb.ghosts.forEach((g, k) => this.drawGhost(g, lerp(sa.ghosts[k] || g, g, t), sb.fright, now));
      const pos = lerp(sa.pac, sb.pac, t);
      const moving = sa.pac.x !== sb.pac.x || sa.pac.y !== sb.pac.y;
      const dying = !!b.event && (b.event.type === 'death' || b.event.type === 'over');
      this.drawPac(pos, sb.pac.dir, moving, dying, t, now);

      for (const l of this.layers) if (l.z === 'over') l.draw(ctx, info);

      const banner = b.event && { ready: b.event.text.toUpperCase(), death: 'CAUGHT', over: 'GAME OVER', level: 'CLEARED' }[b.event.type];
      if (banner) {
        ctx.font = `600 ${ts * 0.72}px ${this.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = b.event.type === 'ready' ? this.colors.pac : this.colors['g-red'];
        ctx.fillText(banner, (maze.home.x + 0.5) * ts, (maze.home.y + 2.5) * ts);
      }
    }
  }

  C.Renderer = Renderer;
})(globalThis);
