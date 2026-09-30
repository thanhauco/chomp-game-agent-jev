/* Claude agent settings and per-move details (latency, reason, tokens). */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);

  C.features.push((app) => {
    const cfg = C.claude.settings;
    const saved = C.store.get('claude', null);
    if (saved) Object.assign(cfg, saved);

    const box = $('claudeBox');
    $('claudeModel').innerHTML = C.claude.MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    $('claudeModel').value = cfg.model;
    $('claudeEffort').value = cfg.effort;
    $('claudeKey').value = cfg.apiKey;
    $('claudeRemember').checked = !!(saved && saved.apiKey);

    function persist() {
      const remember = $('claudeRemember').checked;
      C.store.set('claude', { model: cfg.model, effort: cfg.effort, apiKey: remember ? cfg.apiKey : '' });
    }
    $('claudeKey').addEventListener('input', (e) => { cfg.apiKey = e.target.value.trim(); persist(); });
    $('claudeModel').onchange = (e) => { cfg.model = e.target.value; persist(); };
    $('claudeEffort').onchange = (e) => { cfg.effort = e.target.value; persist(); };
    $('claudeRemember').onchange = persist;
    $('claudeForget').onclick = () => {
      cfg.apiKey = '';
      $('claudeKey').value = '';
      $('claudeRemember').checked = false;
      persist();
    };

    // Open the settings the first time someone picks the Claude agent without a key.
    const showBox = () => {
      const usingClaude = app.agentKey === 'claude';
      box.hidden = !usingClaude;
      if (usingClaude && !cfg.apiKey) box.open = true;
    };
    $('agent').addEventListener('change', showBox);
    showBox();

    const detail = document.createElement('div');
    detail.className = 'event';
    detail.id = 'claudeDetail';
    $('panel').appendChild(detail);
    app.on('panel', (entry) => {
      const d = entry.decision;
      if (d.agent !== 'claude') { detail.textContent = ''; return; }
      const tokens = d.usage ? ` · ${d.usage.input_tokens} in / ${d.usage.output_tokens} out tokens` : '';
      detail.innerHTML = `${C.panel.escapeHTML(d.label)} answered in ${(d.latencyMs / 1000).toFixed(1)} s${tokens}` +
        (d.reason ? `<br><b>Reason:</b> ${C.panel.escapeHTML(d.reason)}` : '');
    });
  });
})(globalThis);
