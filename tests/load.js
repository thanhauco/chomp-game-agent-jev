// Loads the DOM-free modules into globalThis.Chomp, in the same order as index.html.
const path = require('node:path');
const FILES = [
  'core/rng.js', 'core/store.js', 'core/maze.js', 'core/engine.js',
  'agents/registry.js', 'agents/features.js', 'agents/heuristic.js', 'agents/human.js', 'agents/random.js', 'agents/claude.js', 'agents/qlearn.js',
  'render/panel.js', 'app/session.js', 'core/replay.js', 'core/calibration.js',
];
for (const f of FILES) require(path.join(__dirname, '..', 'js', f));
module.exports = globalThis.Chomp;
