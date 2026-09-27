/**
 * device/config.js — tiny config reader for Dial.
 *
 * Mirrors the manifest's config keys (see public/manifest.json) with
 * hardcoded defaults so the app behaves sanely before — or without —
 * the daemon. Fed by device/client.js's getConfig; refresh() pulls the
 * live values, get() reads the cached copy.
 *
 * createConfig(fetcher) -> { get(key), set(key, v), refresh(), values() }
 *   fetcher: async (key) -> string | null  (e.g. client.getConfig)
 */

export const CONFIG_DEFAULTS = {
  dj_voice: true, // DJ voice replies spoken out loud
  haptics: true,  // haptic confirmation ticks
};

function parseBool(raw, fallback) {
  if (raw == null) return fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return fallback;
}

export function createConfig(fetcher) {
  const values = { ...CONFIG_DEFAULTS };

  /** Pull every known key through the fetcher; never rejects. */
  async function refresh() {
    for (const key of Object.keys(CONFIG_DEFAULTS)) {
      let raw = null;
      try {
        raw = fetcher ? await fetcher(key) : null;
      } catch {
        raw = null;
      }
      values[key] = parseBool(raw, CONFIG_DEFAULTS[key]);
    }
    return { ...values };
  }

  /** Read the cached value for a key (undefined for unknown keys). */
  function get(key) {
    return key in values ? values[key] : undefined;
  }

  /** Local override (e.g. instant UI toggle before the daemon confirms). */
  function set(key, v) {
    values[key] = !!v;
    return values[key];
  }

  function current() {
    return { ...values };
  }

  return { get, set, refresh, values: current };
}
