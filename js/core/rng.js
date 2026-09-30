/* Seeded randomness.
 * mulberry32 keeps its whole state in one uint32, which lets the game store the
 * generator inside its plain-object state and clone it with structuredClone.
 * Same seed + same moves => the exact same game, which replays and duels rely on. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});

  // Advances holder.rng and returns a float in [0, 1).
  function nextFloat(holder) {
    let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function makeRng(seed) {
    const holder = { rng: seed >>> 0 };
    return () => nextFloat(holder);
  }

  function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  C.rng = { nextFloat, makeRng, randomSeed };
})(globalThis);
