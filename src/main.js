/* Dial — src/main.js (on-device boot)
 *
 * Boots the 800x480 device UI. Every subsystem owned by the other agent
 * (config, client, core, audio, sleeves, shaders, haptics) is loaded via
 * dynamic import with a local fallback, so a failing subsystem can never
 * kill boot — the UI always comes up.
 *
 * Input map (see src/device/input.js):
 *   knob rotate  -> scrub: drives view = browse Drives,
 *                   thread view = move queue cursor, driving view = volume
 *   knob tap      -> push: drives = open Drive, thread/driving = play/pause
 *   knob hold     -> pull: thread -> back to drives
 *   button 1      -> voice push-to-talk
 *   button 2      -> play/pause
 *   button 3      -> next track
 *   button 4      -> save current track
 *   touch tap     -> drive card select / header + transport buttons
 *   touch swipe   -> scrub
 */

'use strict';

import { renderApp, showToast } from './ui/views.js';
import { initInput } from './device/input.js';

/* ------------------------------------------------------------------ */
/* safe dynamic import + local fallbacks                                */
/* ------------------------------------------------------------------ */

// NOTE: keep every import() argument a string literal — Vite only bundles
// dynamic imports it can trace statically. A variable path silently ships
// an empty chunk and the subsystem never loads on-device.
async function safeImportLiteral(promise) {
  try {
    return await promise;
  } catch {
    return null;
  }
}

const fallbackStore = {
  createStore(initial = {}) {
    let s = {
      view: 'drives', mode: 'parked', drives: [], activeDriveId: null,
      selectedDrive: 0, queue: [], queueIndex: 0, playing: false,
      volume: 0.8, voice: { active: false, transcript: '', reply: '' },
      hud: { speed: 0, nextTurn: '' }, saved: [], ...initial,
    };
    const subs = new Set();
    return {
      getState: () => s,
      update(patch) {
        s = { ...s, ...patch };
        subs.forEach((fn) => { try { fn(s); } catch { /* subscriber fault */ } });
      },
      subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    };
  },
};

const fallbackDj = {
  interpret() {
    return { actions: [], reply: 'Say that once more — I missed it over the road noise.' };
  },
  applyActions() { /* no-op */ },
};

/* No-arg-safe engine fallback (real engine: init/play/pause/toggle/next/prev/…). */
const fallbackEngine = {
  init() {}, play() {}, pause() {}, toggle() {}, next() {}, prev() {},
  setVolume() {}, volumeUp() {}, volumeDown() {}, onBeat() {}, currentTrack: () => null,
};

/* Minimal vinyl placeholder if the sleeve module is missing. */
const fallbackSleeve = {
  drawSleeve(canvas, seed = 1) {
    const px = canvas.width || 224;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = px / 2;
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#17171d';
    ctx.beginPath(); ctx.arc(c, c, c, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(242,239,230,.10)';
    for (let r = px * 0.18; r < c; r += px * 0.045) {
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = '#ff4d00';
    ctx.beginPath(); ctx.arc(c, c, px * 0.05, 0, 7); ctx.fill();
  },
};

const fallbackHaptics = {
  setEnabled() {},
  tick() { try { navigator.vibrate && navigator.vibrate(8); } catch { /* no haptics */ } },
  confirm() { try { navigator.vibrate && navigator.vibrate([12, 30, 12]); } catch { /* no haptics */ } },
  error() { try { navigator.vibrate && navigator.vibrate([40, 40, 40]); } catch { /* no haptics */ } },
};

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  const root = document.getElementById('app');
  if (!root) return;

  // 1 · config
  const configMod = await safeImportLiteral(import('./device/config.js'));
  const defaults = (configMod && configMod.defaults) || { dj_voice: true, haptics: true };

  // 2 · core: state + library + dj
  const stateMod = await safeImportLiteral(import('./core/state.js'));
  const createStore = (stateMod && stateMod.createStore) || fallbackStore.createStore;
  const libMod = await safeImportLiteral(import('./core/library.js'));
  const TRACKS = (libMod && libMod.TRACKS) || [];
  const djMod = await safeImportLiteral(import('./core/dj.js'));
  const dj = djMod || fallbackDj;

  // 3 · subsystems
  const engineMod = await safeImportLiteral(import('./audio/engine.js'));
  const engine = engineMod || fallbackEngine;
  const sleeveMod = await safeImportLiteral(import('./sleeves/sleeve.js'));
  const sleeve = sleeveMod || fallbackSleeve;
  const glMod = await safeImportLiteral(import('./shaders/gl.js'));
  const hapticsMod = await safeImportLiteral(import('./haptics/haptics.js'));
  const haptics = hapticsMod || fallbackHaptics;

  // 4 · bridge client (voice intents in, push-to-talk out)
  const clientMod = await safeImportLiteral(import('./device/client.js'));
  let client = null;
  const deps = { TRACKS, DRIVES: [], sleeve, config: { ...defaults }, connected: false, actions: {} };
  const rerender = () => { try { renderApp(root, store.getState(), deps); } catch { /* never kill boot */ } };
  if (clientMod && clientMod.initClient) {
    try {
      client = clientMod.initClient({
        onVoiceIntent: (text) => handleVoiceText(String(text || '')),
        onConnect: () => { deps.connected = true; rerender(); },
        onDisconnect: () => { deps.connected = false; rerender(); },
      });
      deps.connected = !!(client && (typeof client.connected === 'function' ? client.connected() : client.connected));
    } catch { client = null; }
  }
  try {
    if (client && client.getConfig) {
      const live = {};
      for (const k of Object.keys(defaults)) {
        try {
          const v = await client.getConfig(k);
          if (v != null) live[k] = (v === true || v === 'true');
        } catch { /* keep default for this key */ }
      }
      deps.config = { ...defaults, ...live };
    }
  } catch { /* keep defaults */ }
  const cfg = deps.config;
  try { haptics.setEnabled && haptics.setEnabled(cfg.haptics !== false); } catch { /* no-op */ }

  // 4b · phone audio (the Car Thing has no speaker; the phone plays bundle MP3s)
  let phone = null;
  try {
    const phoneMod = await safeImportLiteral(import('./device/phone.js'));
    if (phoneMod && phoneMod.initPhone) {
      phone = phoneMod.initPhone(() => (client && client.rawClient ? client.rawClient() : null));
      phone.onSnapshot((msg) => {
        try { console.log('[dial] phone snapshot', JSON.stringify(msg).slice(0, 220)); } catch {}
      });
    }
  } catch { phone = null; }
  // Probe build: only these tracks have rendered MP3s in public/audio/.
  const PHONE_TRACKS = new Set(['t01', 't02', 't03', 't04', 't05', 't06']);
  let phoneTrackId = null;
  let phoneWantsPlaying = false;
  function syncPhone() {
    if (!phone) return;
    const t = curTrack();
    const wantPlaying = !!(S().playing && t && PHONE_TRACKS.has(t.id));
    const wantId = wantPlaying ? t.id : null;
    if (wantPlaying === phoneWantsPlaying && wantId === phoneTrackId) return;
    phoneWantsPlaying = wantPlaying;
    phoneTrackId = wantId;
    if (wantPlaying) {
      phone.playTrack(t).then((url) => {
        try { console.log(url ? `[dial] phone playing ${url}` : `[dial] phone unavailable for ${t.id}`); } catch {}
      });
    } else {
      try { phone.pause(); } catch { /* no-op */ }
    }
  }

  // 5 · store + drives
  const store = createStore();
  deps.DRIVES = (libMod && libMod.DRIVES) || store.getState().drives || [];

  const S = () => store.getState();
  const trackById = (id) => TRACKS.find((t) => t.id === id) || null;
  const curTrack = () => trackById(S().queue[S().queueIndex]) || null;

  /* ---- helpers ---------------------------------------------------- */

  const toast = (msg) => showToast(root, msg);

  function appendThread(role, text) {
    const st = S();
    const drives = (st.drives || []).map((d) =>
      d.id === st.activeDriveId
        ? { ...d, thread: [...(d.thread || []), { role, text }] }
        : d,
    );
    store.update({ drives });
    deps.DRIVES = deps.DRIVES.length ? deps.DRIVES : drives;
  }

  function speak(text) {
    if (!cfg.dj_voice || !text) return;
    try {
      const ss = window.speechSynthesis;
      if (!ss) return;
      ss.cancel();
      ss.speak(new SpeechSynthesisUtterance(text));
    } catch { /* speech unavailable */ }
  }

  function ensureQueueFor(drive) {
    const st = S();
    if ((st.queue || []).length) return;
    const ids = (drive && drive.trackIds && drive.trackIds.length)
      ? drive.trackIds.slice()
      : TRACKS.slice(0, 6).map((t) => t.id);
    store.update({ queue: ids, queueIndex: 0 });
  }

  function togglePlay() {
    try { engine.toggle(); } catch { /* engine fault */ }
    store.update({ playing: !S().playing });
    syncPhone();
    try { haptics.tick(); } catch { /* no-op */ }
  }

  /* ---- DJ voice flow ---------------------------------------------- */

  async function handleVoiceText(text) {
    if (!text.trim()) return;
    store.update({ voice: { active: false, transcript: text, reply: '' } });
    appendThread('user', text);
    let result;
    try {
      result = dj.interpret(text, { state: S(), library: { TRACKS } }) || {};
    } catch {
      result = fallbackDj.interpret();
    }
    try {
      dj.applyActions(store, result.actions || [], { engine, library: libMod || { TRACKS } });
    } catch { /* action fault must not kill the reply */ }
    const reply = result.reply || 'On it.';
    appendThread('dj', reply);
    store.update({ voice: { active: false, transcript: text, reply } });
    try { if (cfg.haptics !== false) haptics.confirm(); } catch { /* no-op */ }
    speak(reply);
  }

  function startVoice() {
    if (!client || !client.pushToTalk) {
      toast('VOICE UNAVAILABLE');
      try { haptics.error(); } catch { /* no-op */ }
      return;
    }
    store.update({ voice: { active: true, transcript: '', reply: '' } });
    try {
      client.pushToTalk();
    } catch {
      store.update({ voice: { active: false, transcript: '', reply: '' } });
      toast('VOICE FAILED');
    }
  }

  /* ---- actions ------------------------------------------------------ */

  function openDrive() {
    const drives = deps.DRIVES;
    const drive = drives[S().selectedDrive];
    if (!drive) return;
    store.update({ activeDriveId: drive.id, view: 'thread' });
    ensureQueueFor(drive);
    if (!S().playing) {
      try { engine.toggle(); } catch { /* engine fault */ }
      store.update({ playing: true });
      syncPhone();
    }
    try { haptics.confirm(); } catch { /* no-op */ }
  }

  deps.actions = {
    selectDrive(i) {
      const n = deps.DRIVES.length;
      if (!n) return;
      if (i === S().selectedDrive) { openDrive(); return; } // tap again = open
      store.update({ selectedDrive: Math.max(0, Math.min(n - 1, i)) });
      try { haptics.tick(); } catch { /* no-op */ }
    },
    push() {
      const v = S().view;
      if (v === 'drives') openDrive();
      else togglePlay();
    },
    toggleMode() {
      if (S().mode === 'driving') {
        store.update({ mode: 'parked', view: 'drives' });
      } else {
        store.update({ mode: 'driving', view: 'driving' });
      }
      try { haptics.confirm(); } catch { /* no-op */ }
    },
    voice() { startVoice(); },
    transport(cmd) {
      if (cmd === 'toggle') { togglePlay(); return; }
      const q = S().queue || [];
      if (!q.length) return;
      if (cmd === 'next') {
        try { engine.next(); } catch { /* engine fault */ }
        store.update({ queueIndex: Math.min(q.length - 1, S().queueIndex + 1) });
        syncPhone();
      } else if (cmd === 'prev') {
        try { engine.prev(); } catch { /* engine fault */ }
        store.update({ queueIndex: Math.max(0, S().queueIndex - 1) });
        syncPhone();
      }
      try { haptics.tick(); } catch { /* no-op */ }
    },
    save() {
      const t = curTrack();
      if (!t) return;
      const saved = S().saved || [];
      const has = saved.includes(t.id);
      store.update({ saved: has ? saved.filter((id) => id !== t.id) : [...saved, t.id] });
      toast(has ? 'REMOVED FROM SAVED' : 'SAVED');
      try { haptics.confirm(); } catch { /* no-op */ }
    },
  };

  /* ---- input wiring ------------------------------------------------- */

  const input = initInput({
    root,
    onScrub(dir) {
      const st = S();
      if (st.view === 'drives') {
        const n = deps.DRIVES.length;
        if (!n) return;
        store.update({ selectedDrive: (st.selectedDrive + dir + n) % n });
        try { haptics.tick(); } catch { /* no-op */ }
      } else if (st.view === 'thread') {
        const q = st.queue || [];
        if (!q.length) return;
        const qi = Math.max(0, Math.min(q.length - 1, st.queueIndex + dir));
        if (qi !== st.queueIndex) {
          store.update({ queueIndex: qi });
          if (st.playing) {
            try { dir > 0 ? engine.next() : engine.prev(); } catch { /* engine fault */ }
          }
          try { haptics.tick(); } catch { /* no-op */ }
        }
      } else if (st.view === 'driving') {
        const v = Math.max(0, Math.min(1, (st.volume || 0.8) + dir * 0.06));
        store.update({ volume: v });
        try { dir > 0 ? engine.volumeUp() : engine.volumeDown(); } catch { /* engine fault */ }
      }
    },
    onPush: () => deps.actions.push(),
    onPull: () => {
      if (S().view === 'thread') {
        store.update({ view: 'drives' });
        try { haptics.tick(); } catch { /* no-op */ }
      }
    },
    onButton(i) {
      if (i === 1) deps.actions.voice();
      else if (i === 2) togglePlay();
      else if (i === 3) deps.actions.transport('next');
      else if (i === 4) deps.actions.save();
    },
    onSelectDrive: (i) => deps.actions.selectDrive(i),
    onToggleMode: () => deps.actions.toggleMode(),
    onVoice: () => deps.actions.voice(),
    onTransport: (cmd) => deps.actions.transport(cmd),
    onSave: () => deps.actions.save(),
  });

  /* ---- first render --------------------------------------------------- */

  store.subscribe(rerender);
  rerender();

  /* ---- ambient GL backdrop -------------------------------------------- */

  if (glMod && glMod.initGL && root._dial && root._dial.gl) {
    try {
      const gl = glMod.initGL(root._dial.gl);
      if (gl && gl.tick) {
        const loop = (t) => { try { gl.tick(t); } catch { return; } requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      }
    } catch { /* shader failure never kills boot */ }
  }

  /* ---- audio unlock: boot attempt + first-gesture retry ----------------- */

  try { engine.init && engine.init(); } catch { /* retry on gesture */ }
  let armed = false;
  const armAudio = () => {
    if (armed) return;
    armed = true;
    try { engine.init && engine.init(); } catch { /* silent */ }
  };
  window.addEventListener('pointerdown', armAudio, { capture: true });
  window.addEventListener('keydown', armAudio, { capture: true });

  return { store, input, client, deps };
}

boot().catch(() => {
  // Last-resort: never leave a black screen.
  try {
    document.getElementById('app').innerHTML =
      '<div style="display:flex;height:480px;align-items:center;justify-content:center;' +
      'color:#f2efe6;font-family:sans-serif">Dial failed to start.</div>';
  } catch { /* truly out of options */ }
});
