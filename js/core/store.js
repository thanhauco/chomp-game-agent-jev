/* localStorage with a key prefix and JSON encoding.
 * Storage can be missing or throw (private windows, blocked site data),
 * so every call degrades to the fallback value instead of failing. */
(function (root) {
  'use strict';
  const C = (root.Chomp = root.Chomp || {});
  const PREFIX = 'chomp:';

  function backend() {
    try { return root.localStorage || null; } catch { return null; }
  }

  C.store = {
    get(key, fallback = null) {
      try {
        const raw = backend()?.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { backend()?.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) {
      try { backend()?.removeItem(PREFIX + key); } catch { /* ignore */ }
    },
  };
})(globalThis);
