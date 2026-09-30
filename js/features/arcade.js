/* Sound effects (synthesized with Web Audio, no files) and a CRT arcade look. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const $ = (id) => document.getElementById(id);

  C.features.push((app) => {
    const toggles = $('toggles');
    toggles.innerHTML = `
      <button id="tgSound" aria-pressed="false" title="Sound effects">Sound</button>
      <button id="tgCrt" aria-pressed="false" title="CRT arcade look">CRT</button>`;

    // --- sound ---
    let audio = null, soundOn = false, waka = 0;
    function tone({ freq, to, dur = 0.08, type = 'square', vol = 0.05, at = 0 }) {
      const t = audio.currentTime + at;
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    const SOUNDS = {
      pellet: () => { const up = waka++ % 2; tone({ freq: up ? 330 : 440, to: up ? 440 : 330, dur: 0.07, type: 'triangle', vol: 0.07 }); },
      power: () => tone({ freq: 180, to: 900, dur: 0.35, type: 'sawtooth', vol: 0.04 }),
      ghost: () => [0, 1, 2, 3].forEach((i) => tone({ freq: 400 * 1.25 ** i, dur: 0.06, at: i * 0.05, vol: 0.05 })),
      death: () => tone({ freq: 760, to: 60, dur: 1.0, type: 'sawtooth', vol: 0.05 }),
      level: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.12, at: i * 0.11, type: 'square', vol: 0.04 })),
      ready: () => [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.1, at: i * 0.1, type: 'triangle', vol: 0.06 })),
    };
    function setSound(on) {
      soundOn = on;
      $('tgSound').setAttribute('aria-pressed', String(on));
      C.store.set('sound', on);
      if (on && !audio) {
        try { audio = new (root.AudioContext || root.webkitAudioContext)(); } catch { soundOn = false; }
      }
      if (on && audio && audio.state === 'suspended') audio.resume();
    }
    // Browsers only allow audio after a click, so sound starts off until the button is pressed.
    $('tgSound').onclick = () => setSound(!soundOn);
    $('tgSound').setAttribute('aria-pressed', 'false');

    app.on('entry', (entry, s) => {
      if (!soundOn || !audio || !s.isMain || app.currentTab !== 'tab-play') return;
      const types = new Set(entry.events.map((e) => e.type));
      for (const t of ['over', 'death', 'level', 'ghost', 'power', 'ready', 'pellet']) {
        if (types.has(t)) { SOUNDS[t === 'over' ? 'death' : t](); break; }
      }
    });

    // --- CRT ---
    function setCrt(on) {
      document.documentElement.classList.toggle('crt', on);
      $('tgCrt').setAttribute('aria-pressed', String(on));
      C.store.set('crt', on);
    }
    $('tgCrt').onclick = () => setCrt(!document.documentElement.classList.contains('crt'));
    setCrt(!!C.store.get('crt', false));
  });
})(globalThis);
