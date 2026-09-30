/* Maze editor: paint tiles, validate, play, and share as a code or link. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);
  const TOOLS = [
    ['#', 'Wall'], ['.', 'Pellet'], ['o', 'Power pellet'], [' ', 'Empty floor'],
    ['-', 'Ghost door'], ['G', 'Ghost house'], ['P', 'Chomper start'],
  ];
  const UNIQUE = new Set(['P', '-']);

  C.features.push((app) => {
    const tab = app.ensureTab('tab-editor', 'Maze editor');
    tab.innerHTML = `
      <div class="card editor">
        <div class="board editor-board" id="edBoard"><canvas id="edCv" aria-label="Maze editor grid"></canvas></div>
        <div class="panel">
          <div>
            <h2>Maze editor</h2>
            <p class="hint">Pick a tile, then click or drag on the grid. Mirror paints both halves at once. A maze needs one chomper start, one ghost door with ghost-house tiles in the row below it, and pellets the chomper can reach.</p>
          </div>
          <div class="tools" role="radiogroup" aria-label="Tile">
            ${TOOLS.map(([ch, name], i) => `<label class="tool"><input type="radio" name="edTool" value="${ch === ' ' ? 'space' : ch}" ${i === 0 ? 'checked' : ''}><span class="tool-chip" data-tile="${ch === ' ' ? 'space' : ch}"></span>${name}</label>`).join('')}
          </div>
          <label class="check"><input id="edMirror" type="checkbox" checked> Mirror left and right</label>
          <ul class="errors" id="edErrors" aria-live="polite"></ul>
          <div class="controls">
            <button id="edPlay" class="primary">Play this maze</button>
            <button id="edFromCurrent">Load the current maze</button>
            <button id="edDefault">Reset to default</button>
            <button id="edClear">Clear</button>
          </div>
          <div class="share">
            <label for="edCode">Share code</label>
            <div class="share-row"><input id="edCode" type="text" readonly spellcheck="false"><button id="edCopy">Copy</button><button id="edCopyLink">Copy link</button></div>
            <label for="edLoadCode">Load a code</label>
            <div class="share-row"><input id="edLoadCode" type="text" spellcheck="false" placeholder="CHOMP1.19x21.…"><button id="edLoad">Load</button></div>
            <span class="hint" id="edMsg" aria-live="polite"></span>
          </div>
        </div>
      </div>`;

    let rows = C.store.get('editorRows', null) || app.maze.rows.slice();
    let tool = '#';
    const renderer = new C.Renderer($('edCv'));
    const msg = (t) => { $('edMsg').textContent = t; };

    function fitBoard() {
      renderer.canvas.parentElement.style.aspectRatio = `${rows[0].length} / ${rows.length}`;
      renderer.maze = { W: rows[0].length, H: rows.length };
      renderer.resize();
    }
    renderer.onResize = () => draw();

    function draw() {
      const { ctx, colors: c } = renderer;
      const W = rows[0].length, H = rows.length, ts = renderer.ts;
      if (!renderer.canvas.width) return;
      renderer.readTokens();
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W * ts, H * ts);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ch = rows[y][x], cx = (x + 0.5) * ts, cy = (y + 0.5) * ts;
          if (ch === '#') { ctx.fillStyle = c.wall; ctx.fillRect(x * ts, y * ts, ts, ts); }
          else if (ch === '.' || ch === 'o') {
            ctx.fillStyle = c.dot;
            ctx.beginPath(); ctx.arc(cx, cy, ch === 'o' ? ts * 0.22 : ts * 0.09, 0, 7); ctx.fill();
          } else if (ch === '-') { ctx.fillStyle = c.door; ctx.fillRect(x * ts, (y + 0.42) * ts, ts, ts * 0.16); }
          else if (ch === 'G') { ctx.fillStyle = c['g-pink']; ctx.globalAlpha = 0.25; ctx.fillRect(x * ts, y * ts, ts, ts); ctx.globalAlpha = 1; }
          else if (ch === 'P') {
            ctx.fillStyle = c.pac;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, ts * 0.42, Math.PI + 0.5, 3 * Math.PI - 0.5); ctx.closePath(); ctx.fill();
          }
        }
      }
      // Faint grid so single tiles are easy to target.
      ctx.strokeStyle = c.wall;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < W; x++) { ctx.moveTo(x * ts, 0); ctx.lineTo(x * ts, H * ts); }
      for (let y = 1; y < H; y++) { ctx.moveTo(0, y * ts); ctx.lineTo(W * ts, y * ts); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function changed() {
      C.store.set('editorRows', rows);
      const errs = C.Maze.validate(rows);
      $('edErrors').innerHTML = errs.length
        ? errs.map((e) => `<li>${C.panel.escapeHTML(e)}</li>`).join('')
        : '<li class="ok">Playable.</li>';
      $('edPlay').disabled = errs.length > 0;
      $('edCode').value = C.Maze.encode(rows);
      draw();
    }

    function setTile(x, y, ch) {
      const W = rows[0].length;
      if (x < 0 || y < 0 || y >= rows.length || x >= W) return;
      const targets = [[x, y]];
      if ($('edMirror').checked && W - 1 - x !== x && !UNIQUE.has(ch)) targets.push([W - 1 - x, y]);
      if (UNIQUE.has(ch)) rows = rows.map((r) => r.split(ch).join(ch === '-' ? '#' : ' '));
      for (const [tx, ty] of targets) rows[ty] = rows[ty].slice(0, tx) + ch + rows[ty].slice(tx + 1);
    }

    let painting = false;
    const cv = $('edCv');
    const paintAt = (e) => {
      const { x, y } = renderer.tileAt(e.clientX, e.clientY);
      setTile(x, y, tool);
      changed();
    };
    cv.addEventListener('pointerdown', (e) => { painting = true; cv.setPointerCapture(e.pointerId); paintAt(e); });
    cv.addEventListener('pointermove', (e) => { if (painting && !UNIQUE.has(tool)) paintAt(e); });
    cv.addEventListener('pointerup', () => { painting = false; });
    cv.addEventListener('pointercancel', () => { painting = false; });

    for (const r of document.querySelectorAll('input[name="edTool"]')) {
      r.onchange = () => { tool = r.value === 'space' ? ' ' : r.value; };
    }

    const load = (newRows) => { rows = newRows.slice(); fitBoard(); changed(); };
    $('edFromCurrent').onclick = () => load(app.maze.rows);
    $('edDefault').onclick = () => load(C.DEFAULT_ROWS);
    $('edClear').onclick = () => {
      const W = rows[0].length, H = rows.length;
      load(rows.map((_, y) => (y === 0 || y === H - 1 ? '#'.repeat(W) : '#' + ' '.repeat(W - 2) + '#')));
    };

    function play(newRows, source) {
      const maze = new C.Maze(newRows);
      C.store.set('maze', maze.isDefault ? null : newRows);
      app.setMaze(maze);
      app.showTab('tab-play');
      if (source) msg(source);
    }
    $('edPlay').onclick = () => play(rows);

    const copy = async (text, done) => {
      try { await navigator.clipboard.writeText(text); msg(done); }
      catch { $('edCode').select(); msg('Copy is blocked here. The code is selected, so press Ctrl+C or Cmd+C.'); }
    };
    $('edCopy').onclick = () => copy($('edCode').value, 'Share code copied.');
    $('edCopyLink').onclick = () => copy(`${location.origin}${location.pathname}#maze=${$('edCode').value}`, 'Link copied. Opening it plays this maze.');
    $('edLoad').onclick = () => {
      try { load(C.Maze.decode($('edLoadCode').value)); msg('Code loaded into the editor.'); }
      catch (err) { msg(err.message); }
    };

    // A #maze=CODE link, or the last custom maze played on this device.
    const hash = decodeURIComponent(location.hash.slice(1));
    try {
      if (hash.startsWith('maze=')) {
        const shared = C.Maze.decode(hash.slice(5));
        rows = shared;
        if (!C.Maze.validate(shared).length) play(shared);
      } else {
        const saved = C.store.get('maze', null);
        if (saved && !C.Maze.validate(saved).length) app.setMaze(new C.Maze(saved));
      }
    } catch (err) {
      msg(err.message);
    }

    fitBoard();
    changed();
    app.on('tab', (id) => { if (id === 'tab-editor') requestAnimationFrame(draw); });
    app.on('theme', draw);
  });
})(globalThis);
