/* Calibration: does the agent's confidence match what happens next?
 *
 * For every move an agent made, take p = the probability it gave the move it
 * chose, and ask whether the chomper survived the next HORIZON moves.
 * Grouping moves into probability bins gives a reliability curve: a
 * well-calibrated agent's points sit near the diagonal, points below it mean
 * overconfidence. Survival is a proxy (p is "this is the best move", not
 * "I will survive"), which the dashboard states plainly. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const HORIZON = 10;
  const BINS = 10;

  // One sample per agent move whose outcome is known.
  function samples(history) {
    const out = [];
    const deathAt = [];
    history.forEach((e, i) => { if (e.events.some((ev) => ev.type === 'death')) deathAt.push(i); });
    const last = history.length - 1;
    const endedByDeath = history[last].state.over;
    for (let i = 1; i <= last; i++) {
      const d = history[i].decision;
      if (!d || d.choice == null || d.by !== 'agent' || d.imported) continue;
      const p = d.probs[d.choice];
      if (typeof p !== 'number') continue;
      // The move that produced entry i "survives" if no death happens in entries i..i+HORIZON-1.
      const died = deathAt.some((k) => k >= i && k < i + HORIZON);
      if (!died && i + HORIZON - 1 > last && !endedByDeath) continue; // outcome unknown
      out.push({ p, survived: !died, agent: d.agent, label: d.label });
    }
    return out;
  }

  function emptyBins() {
    return Array.from({ length: BINS }, () => ({ n: 0, sumP: 0, survived: 0 }));
  }

  function accumulate(bins, list) {
    for (const s of list) {
      const b = bins[Math.min(BINS - 1, Math.floor(s.p * BINS))];
      b.n++;
      b.sumP += s.p;
      if (s.survived) b.survived++;
    }
    return bins;
  }

  // Points for the chart plus expected calibration error (weighted |p - rate|).
  function summarize(bins) {
    const total = bins.reduce((a, b) => a + b.n, 0);
    const points = [];
    let ece = 0;
    bins.forEach((b, i) => {
      if (!b.n) return;
      const meanP = b.sumP / b.n, rate = b.survived / b.n;
      points.push({ bin: i, lo: i / BINS, hi: (i + 1) / BINS, meanP, rate, n: b.n });
      ece += (b.n / total) * Math.abs(meanP - rate);
    });
    return { points, n: total, ece: total ? ece : null };
  }

  C.calibration = { HORIZON, BINS, samples, emptyBins, accumulate, summarize };
})(globalThis);
