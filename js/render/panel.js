/* The decision panel: renders a decision as the `answers.move` JSON document. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  // The document shown in the panel and written to exported replays.
  function decisionDocument(d) {
    const probabilities = {};
    for (const [dir, p] of Object.entries(d.probs).sort((x, y) => y[1] - x[1])) probabilities[dir] = round(p);
    return {
      answers: {
        move: {
          type: 'choice',
          choice: d.choice ?? d.best,
          probabilities,
          confidence: round(d.confidence),
        },
      },
    };
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // Pretty-print JSON with spans for syntax colors.
  function jsonHTML(value, indent = 0) {
    const pad = '  '.repeat(indent);
    if (value === null) return '<span class="n">null</span>';
    if (typeof value === 'number') return `<span class="n">${value.toFixed(2)}</span>`;
    if (typeof value === 'string') return `<span class="s">"${escapeHTML(value)}"</span>`;
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    const inner = keys.map((k) => `${pad}  <span class="k">"${escapeHTML(k)}"</span>: ${jsonHTML(value[k], indent + 1)}`);
    return `{\n${inner.join(',\n')}\n${pad}}`;
  }

  C.panel = { decisionDocument, jsonHTML, escapeHTML };
})(globalThis);
