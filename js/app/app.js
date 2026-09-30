/* App shell: owns the main session, the tick loop, tabs and the Play tab UI.
 *
 * Features are plain scripts that push an init function onto Chomp.features.
 * They get the app object and extend it through a few hooks:
 *   app.on(event, fn)       'entry' | 'over' | 'newgame' | 'panel' | 'tab' | 'theme' | 'frame'
 *   app.sessions            every Session in this Set is ticked by the loop
 *   app.addView(renderer, getSession, isVisible)
 *   app.mainRenderer.layers overlays on the Play board
 *   app.controls            the Play tab's control row, for extra buttons */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  C.features = C.features || [];
  const $ = (id) => document.getElementById(id);
  const BASE_MS = 150;

  const app = {
    maze: new C.Maze(),
    main: null,
    mode: 'watch',
    agentKey: 'heuristic',
    temperature: 1.5,
    speed: 1,
    sessions: new Set(),
    views: [],
    listeners: {},
    uiKey: '',

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    emit(ev, ...args) { for (const fn of this.listeners[ev] || []) fn(...args); },

    get tickMs() { return BASE_MS / this.speed; },

    makeController(kind, opts = {}) {
      if (kind === 'human') return new C.HumanController();
      return C.agents.create(kind, { temperature: this.temperature, ...opts });
    },

    newSession({ seed, controller, maze = this.maze } = {}) {
      return new C.Session({
        maze, seed, controller,
        onEntry: (entry, s) => this.emit('entry', entry, s),
      });
    },

    newGame(opts = {}) {
      const controller = this.makeController(this.mode === 'play' ? 'human' : this.agentKey);
      this.adoptSession(this.newSession({ seed: opts.seed, controller }));
    },

    // Make a session the one shown on the Play tab (new games, imports).
    adoptSession(session) {
      if (this.main) this.sessions.delete(this.main);
      session.onEntry = (entry, s) => this.emit('entry', entry, s);
      session.isMain = true;
      this.main = session;
      this.sessions.add(session);
      this.mainRenderer.setMaze(session.maze);
      this.emit('newgame', session);
      this.refresh(true);
    },

    setMaze(maze) {
      this.maze = maze;
      this.newGame();
    },

    setMode(mode) {
      this.mode = mode;
      $('mWatch').setAttribute('aria-pressed', String(mode === 'watch'));
      $('mPlay').setAttribute('aria-pressed', String(mode === 'play'));
      this.main.controller = this.makeController(mode === 'play' ? 'human' : this.agentKey);
      this.refresh(true);
    },

    setAgent(key) {
      this.agentKey = key;
      const def = C.agents.get(key);
      $('tempWrap').hidden = !def.usesTemperature;
      if (this.mode === 'watch') this.main.controller = this.makeController(key);
      this.refresh(true);
    },

    // Find or create a tab section; features call this before tabs are built.
    ensureTab(id, label) {
      let s = $(id);
      if (!s) {
        s = document.createElement('section');
        s.className = 'tab';
        s.id = id;
        s.dataset.label = label;
        s.hidden = true;
        document.querySelector('main').appendChild(s);
      }
      return s;
    },

    addView(renderer, getSession, isVisible) {
      this.views.push({ renderer, getSession, isVisible });
    },

    // Rebuild the agent picker, e.g. after a feature registers a new agent.
    refreshAgents() {
      const sel = $('agent');
      sel.innerHTML = C.agents.list().map((a) => `<option value="${a.key}">${a.label}</option>`).join('');
      sel.value = this.agentKey;
      this.emit('agents');
    },

    // Tabs are built from <section class="tab" data-label="..."> elements.
    initTabs() {
      const nav = $('tabs');
      const sections = [...document.querySelectorAll('section.tab')];
      nav.innerHTML = sections.map((s) =>
        `<button role="tab" id="tabbtn-${s.id}" aria-controls="${s.id}" data-tab="${s.id}">${s.dataset.label}</button>`).join('');
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-tab]');
        if (b) this.showTab(b.dataset.tab);
      });
      const fromHash = location.hash.slice(1);
      this.showTab(sections.some((s) => s.id === 'tab-' + fromHash) ? 'tab-' + fromHash : 'tab-play');
    },

    showTab(id) {
      for (const s of document.querySelectorAll('section.tab')) {
        s.hidden = s.id !== id;
        const b = $('tabbtn-' + s.id);
        if (b) b.setAttribute('aria-selected', String(s.id === id));
      }
      try { history.replaceState(null, '', '#' + id.replace(/^tab-/, '')); } catch { /* sandboxed frames */ }
      this.currentTab = id;
      this.emit('tab', id);
      this.refreshTheme();
    },

    refreshTheme() {
      for (const v of this.views) v.renderer.readTokens();
      this.emit('theme');
    },

    // --- the Play tab panel ---
    refresh(force) {
      const s = this.main;
      const key = [s.id, s.view, s.last, s.waiting, s.running, this.mode, this.agentKey].join('|');
      if (!force && key === this.uiKey) return;
      this.uiKey = key;
      const e = s.entry, st = e.state, d = e.decision;
      $('moveLabel').textContent = `Move ${s.view} of ${s.last}`;
      $('seedLabel').textContent = `seed ${s.seed}`;
      $('json').innerHTML = C.panel.jsonHTML(C.panel.decisionDocument(d));
      $('score').textContent = st.score;
      $('lives').textContent = Math.max(0, st.lives);
      $('level').textContent = st.level;
      const scrub = $('scrub');
      scrub.max = s.last; scrub.value = s.view;
      $('scrubMax').textContent = s.last;
      const atEnd = s.view === s.last;
      $('btnPlay').textContent = s.running ? 'Pause' : s.game.s.over && atEnd ? 'Watch replay' : atEnd ? 'Play' : 'Play replay';
      $('btnFork').disabled = atEnd;

      const notes = [];
      if (e.event) notes.push(`<b>${C.panel.escapeHTML(e.event.text)}</b>`);
      if (d.by === 'you' && d.choice && d.choice !== 'stay' && d.choice !== d.best)
        notes.push(`Agent preferred ${d.best} (${Math.round(d.probs[d.best] * 100)}%)`);
      if (d.error) notes.push(`Agent error, used the heuristic instead: ${C.panel.escapeHTML(d.error)}`);
      if (atEnd && s.waiting) notes.push(`Waiting for ${C.panel.escapeHTML(s.controller.label)}…`);
      $('event').innerHTML = notes.join(' · ');
      const who = this.mode === 'play' ? 'You are playing, with the BFS heuristic as advisor' : `${C.agents.get(this.agentKey).label} running in your browser`;
      $('caption').textContent = `${who}, replayed at ${this.speed === 1 ? 'real-time' : this.speed + '×'} speed.`;
      this.emit('panel', e, s);
    },

    takeControl(dir) {
      const s = this.main;
      if (this.mode !== 'play') this.setMode('play');
      if (s.view < s.last) s.fork(s.view);
      if (!s.game.s.over) s.running = true;
      s.controller.next = dir;
      this.refresh(true);
    },

    initControls() {
      this.controls = $('controls');
      this.refreshAgents();
      $('mWatch').onclick = () => this.setMode('watch');
      $('mPlay').onclick = () => this.setMode('play');
      $('agent').onchange = (e) => this.setAgent(e.target.value);
      $('btnPlay').onclick = () => {
        const s = this.main;
        if (!s.running && s.game.s.over && s.view === s.last) s.setView(0, false);
        s.running = !s.running;
        this.refresh(true);
      };
      $('btnRestart').onclick = () => this.newGame();
      $('btnFork').onclick = () => { this.main.fork(this.main.view); this.main.running = true; this.refresh(true); };
      $('speed').onchange = (e) => { this.speed = +e.target.value; this.refresh(true); };
      $('temp').oninput = (e) => {
        this.temperature = +e.target.value;
        $('tempOut').textContent = this.temperature.toFixed(1);
        if ('temperature' in this.main.controller) this.main.controller.temperature = this.temperature;
      };
      $('scrub').oninput = (e) => {
        this.main.running = false;
        this.main.setView(+e.target.value, false);
        this.refresh();
      };

      const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      addEventListener('keydown', (e) => {
        if (this.currentTab !== 'tab-play') return;
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); $('btnPlay').click(); return; }
        const dir = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
        if (!dir || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        this.takeControl(dir);
      });
      let touch = null;
      const board = $('board');
      board.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY }; });
      board.addEventListener('pointerup', (e) => {
        if (!touch) return;
        const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
        touch = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        this.takeControl(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      });
    },

    // --- the loop ---
    frame(now) {
      const dt = Math.min(250, now - (this.lastFrame ?? now));
      this.lastFrame = now;
      this.acc = (this.acc || 0) + dt;
      const ms = this.tickMs;
      while (this.acc >= ms) {
        this.acc -= ms;
        for (const s of this.sessions) {
          if (!s.running) continue;
          if (s.tick() === 'over') {
            s.running = false;
            this.emit('over', s);
          }
        }
      }
      for (const v of this.views) {
        if (v.isVisible && !v.isVisible()) continue;
        const s = v.getSession();
        if (!s) continue;
        const t = Math.max(0, Math.min(1, (now - s.viewAt) / ms));
        v.renderer.draw(s.history[Math.max(0, s.view - 1)], s.entry, s.view === 0 ? 1 : t, now);
      }
      this.refresh();
      this.emit('frame', now);
      requestAnimationFrame((n) => this.frame(n));
    },

    init() {
      this.mainRenderer = new C.Renderer($('cv'));
      this.addView(this.mainRenderer, () => this.main, () => this.currentTab === 'tab-play');
      this.initControls();
      this.newGame();
      for (const f of C.features) f(this);
      this.initTabs();
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.refreshTheme());
      new MutationObserver(() => this.refreshTheme())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      requestAnimationFrame((n) => this.frame(n));
    },
  };

  C.app = app;
  document.addEventListener('DOMContentLoaded', () => app.init());
})(globalThis);
