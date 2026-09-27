/**
 * device/phone.js — Phone audio playback for Dial.
 *
 * The Car Thing has no speaker and no audio output; the platform's audio
 * story is "playback belongs to the phone". The phone fetches audio over
 * HTTP and plays it natively (client.player.play({ uri })).
 *
 * This module:
 *  1. Discovers a phone-reachable base URL for this app's bundle via
 *     WebRTC ICE host candidates (the daemon serves the bundle over HTTP
 *     on all interfaces; the webapp itself only sees 127.0.0.1).
 *  2. Drives player.play / pause / resume with bundle-relative audio URLs.
 *  3. Subscribes to player snapshots so the UI can reflect phone state.
 *
 * Everything degrades gracefully: if discovery fails or the daemon is
 * unreachable, every call is a safe no-op and the local engine keeps
 * driving the visuals.
 */

function fire(p) {
  try { Promise.resolve(p).catch(() => {}); } catch { /* noop */ }
}

/** Collect WebRTC ICE host candidates (IPs or .local names). */
function iceHosts(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const hosts = [];
    let pc = null;
    try {
      pc = new RTCPeerConnection();
      pc.createDataChannel('dial-probe');
    } catch {
      resolve(hosts);
      return;
    }
    const done = () => { try { pc.close(); } catch {} resolve(hosts); };
    const timer = setTimeout(done, timeoutMs);
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(timer); done(); return; }
      // Candidate line: "candidate:<id> 1 udp <prio> <address> <port> typ host ..."
      const addr = e.candidate.candidate.split(' ')[4];
      if (addr && !hosts.includes(addr)) hosts.push(addr);
    };
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(() => { clearTimeout(timer); done(); });
  });
}

function isLoopback(h) {
  return h === '127.0.0.1' || h === '::1' || h === 'localhost';
}

/** Derive the bundle's URL prefix from the webapp's own location. */
function bundlePrefix() {
  try {
    const u = new URL(window.location.href);
    let path = u.pathname || '/';
    // Strip a trailing filename (index.html) to get the directory prefix.
    if (/\/[^/]+\.[a-z0-9]+$/i.test(path)) path = path.slice(0, path.lastIndexOf('/') + 1);
    if (!path.endsWith('/')) path += '/';
    return { port: u.port || '8891', path };
  } catch {
    return { port: '8891', path: '/' };
  }
}

/**
 * Resolve a phone-fetchable absolute URL for a bundle-relative path
 * (e.g. 'audio/t01.mp3'). Returns null when unreachable.
 * The winning base URL is cached for the session.
 */
let cachedBase = null;
let resolvePromise = null;

export function resolvePhoneUrl(bundlePath) {
  if (cachedBase) return Promise.resolve(cachedBase + bundlePath);
  if (resolvePromise) return resolvePromise.then((b) => (b ? b + bundlePath : null));
  resolvePromise = (async () => {
    try {
      const { port, path } = bundlePrefix();
      const hosts = await iceHosts();
      const ordered = hosts.filter((h) => !isLoopback(h));
      // Prefer .local names (exempt from iOS ATS), then LAN IPs.
      ordered.sort((a, b) => {
        const al = a.endsWith('.local') ? 0 : 1;
        const bl = b.endsWith('.local') ? 0 : 1;
        return al - bl;
      });
      for (const h of ordered) {
        const base = `http://${h}:${port}${path}`;
        try {
          // no-cors: resolves on any HTTP response, rejects on network error.
          await fetch(base + bundlePath, { mode: 'no-cors', method: 'HEAD' });
          cachedBase = base;
          return base;
        } catch { /* try next */ }
      }
    } catch { /* fall through */ }
    resolvePromise = null;
    return null;
  })();
  return resolvePromise.then((b) => (b ? b + bundlePath : null));
}

/**
 * initPhone(client) -> { playTrack, pause, resume, onSnapshot, lastSnapshot }
 * client is the @bridgething/client instance (may be null when degraded).
 */
export function initPhone(getClient) {
  const snapCbs = new Set();
  let lastSnapshot = null;
  let subscribed = false;

  function client() {
    try { return getClient ? getClient() : null; } catch { return null; }
  }

  function ensureSubscribed() {
    if (subscribed) return;
    const c = client();
    if (!c || !c.player || !c.player.onSnapshot) return;
    subscribed = true;
    try {
      c.player.onSnapshot((msg) => {
        lastSnapshot = msg;
        for (const cb of snapCbs) { try { cb(msg); } catch {} }
      });
    } catch { subscribed = false; }
  }

  /**
   * Play a bundle audio file on the phone. track: { id, title, artist }.
   * Returns the phone URL when playback was requested, null otherwise.
   */
  async function playTrack(track) {
    ensureSubscribed();
    const c = client();
    if (!c || !c.player || !c.player.play) return null;
    const url = await resolvePhoneUrl(`audio/${track.id}.mp3`);
    if (!url) return null;
    fire(c.player.play({ uri: url, context: null }));
    return url;
  }

  function pause() {
    const c = client();
    if (c && c.player && c.player.pause) fire(c.player.pause());
  }

  function resume() {
    const c = client();
    if (c && c.player && c.player.resume) fire(c.player.resume());
  }

  function onSnapshot(cb) {
    ensureSubscribed();
    snapCbs.add(cb);
    return () => snapCbs.delete(cb);
  }

  return { playTrack, pause, resume, onSnapshot, get lastSnapshot() { return lastSnapshot; } };
}
