/**
 * audio/engine.js — generative audio engine for Dial (on-device).
 *
 * No audio assets needed: each track gets a seeded generative pad
 * (detuned oscillators through a lowpass filter, chord derived from
 * track.key) plus a soft pulse at track.bpm via a lookahead scheduler.
 *
 * init() -> engine (context is created lazily on first play, i.e. on a
 * user gesture — never at import). Every public method wakes a suspended
 * AudioContext first, so the engine is safe to drive before any gesture.
 *
 * engine: {
 *   play(queue, index=0), pause(), toggle() -> playing,
 *   next(), prev(), setVolume(v), volumeUp(), volumeDown(),
 *   onBeat(cb) -> unsub, currentTrack() -> track|null,
 *   getLevel() 0..1, getPositionSec(), isFinished(), isLive()
 * }
 *
 * Graceful degradation: if WebAudio is unavailable, a timer-based
 * fallback still advances track position and fires onBeat at the track's
 * BPM. Module top-level is DOM-free — all browser APIs are touched
 * inside functions only.
 */

import { TRACK_BY_ID } from '../core/library.js';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Root MIDI note for a key string like 'Am', 'F#', 'Bb'. */
const ROOT_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function keyToMidi(key) {
  if (!key) return { midi: 69, minor: false }; // A4 fallback
  const k = String(key).trim();
  const letter = k[0].toUpperCase();
  let semi = ROOT_OFFSETS[letter];
  if (semi == null) return { midi: 69, minor: false };
  let rest = k.slice(1);
  if (rest[0] === '#') { semi += 1; rest = rest.slice(1); }
  else if (rest[0] === 'b') { semi -= 1; rest = rest.slice(1); }
  const minor = /m/i.test(rest);
  return { midi: 60 + semi, minor };
}
function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Generative pad voice — module-level so both the realtime engine and the
 * offline renderer share the exact same deterministic construction.
 * buildVoice(track, ac, dest) where ac is any BaseAudioContext and dest is
 * the node to connect the voice output to. Deterministic per track.seed.
 */
function buildVoice(track, ac, dest) {
  const rng = mulberry32(track.seed >>> 0);
  const { midi, minor } = keyToMidi(track.key);
  const third = minor ? 3 : 4;
  const chord = [0, third, 7, 12, 12 + third].map((iv) => midiToFreq(midi + iv - 12));

  const out = ac.createGain();
  out.gain.value = 0;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700 + rng() * 500;
  filter.Q.value = 0.6;
  filter.connect(out);
  out.connect(dest);

  // Slow LFO breathing on the filter cutoff — the "liquid" feel.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.05 + rng() * 0.06;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const oscs = [];
  for (const f of chord) {
    for (const det of [-6, 5]) {
      const o = ac.createOscillator();
      o.type = rng() < 0.6 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.detune.value = det + (rng() * 8 - 4);
      const g = ac.createGain();
      g.gain.value = 0.028; // quiet per-voice; chord sums to a soft pad
      o.connect(g);
      g.connect(filter);
      o.start();
      oscs.push(o);
    }
  }

  const t = ac.currentTime;
  out.gain.cancelScheduledValues(t);
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(1, t + 1.2); // fade in

  let stopped = false;
  return {
    gain: out,
    stop(fadeMs = 800) {
      if (stopped) return;
      stopped = true;
      const now = ac.currentTime;
      const fade = fadeMs / 1000;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + fade);
      const killAt = now + fade + 0.1;
      for (const o of oscs) { try { o.stop(killAt); } catch {} }
      try { lfo.stop(killAt); } catch {}
    },
    /** Hard stop at an absolute context time (for offline renders). */
    stopAt(when) {
      if (stopped) return;
      stopped = true;
      for (const o of oscs) { try { o.stop(when); } catch {} }
      try { lfo.stop(when); } catch {}
    },
  };
}

/** Soft kick thump — module-level, shared by realtime and offline. */
function schedulePulseAt(ac, dest, when) {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(72, when);
  o.frequency.exponentialRampToValueAtTime(44, when + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.16, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + 0.3);
}

/**
 * Render a track to an AudioBuffer offline (build-time phone audio).
 * Deterministic: same seed -> same music as the realtime engine.
 */
export async function renderTrack(track, seconds = 150) {
  const OC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
  if (!OC) throw new Error('OfflineAudioContext unavailable');
  const sampleRate = 44100;
  const ac = new OC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const master = ac.createGain();
  master.gain.value = 0.8;
  master.connect(ac.destination);
  const voice = buildVoice(track, ac, master);
  const interval = 60 / (track.bpm || 100);
  for (let t = 0.08; t < seconds - 1; t += interval) {
    schedulePulseAt(ac, master, t);
  }
  // Fade out over the last 4 seconds so the file ends cleanly.
  const fadeStart = Math.max(0, seconds - 4);
  master.gain.setValueAtTime(0.8, fadeStart);
  master.gain.linearRampToValueAtTime(0.0001, seconds - 0.05);
  voice.stopAt(seconds);
  return ac.startRendering();
}

/** Accept track objects or track ids; drop anything unresolvable. */
function normalizeQueue(queue) {
  const out = [];
  for (const item of queue || []) {
    if (item && typeof item === 'object' && item.bpm) {
      out.push(item);
    } else if (typeof item === 'string' && TRACK_BY_ID.has(item)) {
      out.push(TRACK_BY_ID.get(item));
    }
  }
  return out;
}

export function init() {
  let ctx = null;
  let master = null;
  let analyser = null;
  let voice = null; // { nodes, gain, stop() }
  const beatCbs = new Set();
  let current = null;
  let queue = [];
  let queueIndex = -1;
  let playing = false;
  let volume = 0.8;

  // Audio-mode transport bookkeeping
  let startedAtCtx = 0;   // ctx.currentTime when the current track started
  let pausedAtSec = 0;    // position when paused
  let schedulerTimer = null;
  let nextPulseTime = 0;
  let pulseCount = 0;

  // Timer-fallback bookkeeping
  let fallbackPos = 0;
  let fallbackTimer = null;
  let fallbackLast = 0;
  let fallbackBeatAcc = 0;

  const timeBuf = new Uint8Array(256);

  function ensureCtx() {
    if (ctx) return true;
    try {
      const w = typeof window !== 'undefined' ? window : null;
      const AC = w && (w.AudioContext || w.webkitAudioContext);
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  /** Resume a suspended context (e.g. before the first user gesture). */
  function wake() {
    if (ensureCtx() && ctx.state === 'suspended') {
      try { ctx.resume(); } catch { /* will retry on next call */ }
    }
  }

  function isLive() {
    return ensureCtx();
  }

  // ---- pulse scheduler (lookahead) -------------------------------------

  function pulseInterval() {
    return current && current.bpm > 0 ? 60 / current.bpm : 0.5;
  }

  function schedulePulse(when) {
    // Soft thump: sine drop + gentle noise tick (shared audio builder).
    schedulePulseAt(ctx, master, when);

    // Fire beat callbacks aligned to the audible pulse.
    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
    const n = pulseCount++;
    setTimeout(() => {
      for (const cb of beatCbs) {
        try { cb(n); } catch {}
      }
    }, delayMs);
  }

  function startScheduler() {
    stopScheduler();
    nextPulseTime = ctx.currentTime + 0.08;
    pulseCount = 0;
    schedulerTimer = setInterval(() => {
      if (!playing || !current) return;
      const horizon = ctx.currentTime + 0.18;
      while (nextPulseTime < horizon) {
        schedulePulse(nextPulseTime);
        nextPulseTime += pulseInterval();
      }
    }, 40);
  }

  function stopScheduler() {
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  }

  // ---- timer fallback (no WebAudio) ------------------------------------

  function startFallback() {
    stopFallback();
    fallbackLast = Date.now();
    fallbackBeatAcc = 0;
    fallbackTimer = setInterval(() => {
      if (!playing || !current) { fallbackLast = Date.now(); return; }
      const now = Date.now();
      const dt = (now - fallbackLast) / 1000;
      fallbackLast = now;
      fallbackPos += dt;
      fallbackBeatAcc += dt;
      const beat = 60 / (current.bpm || 100);
      while (fallbackBeatAcc >= beat) {
        fallbackBeatAcc -= beat;
        for (const cb of beatCbs) { try { cb(pulseCount++); } catch {} }
      }
    }, 50);
  }

  function stopFallback() {
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
  }

  // ---- transport internals ---------------------------------------------

  function startTrackAt(i, fadeMs = 1200) {
    if (i < 0 || i >= queue.length) return false;
    queueIndex = i;
    const track = queue[queueIndex];
    if (ensureCtx()) {
      wake();
      const old = voice;
      voice = buildVoice(track, ctx, master);
      if (old) old.stop(fadeMs);
      current = track;
      startedAtCtx = ctx.currentTime;
      pausedAtSec = 0;
      playing = true;
      startScheduler();
    } else {
      current = track;
      fallbackPos = 0;
      playing = true;
      startFallback();
    }
    return true;
  }

  // ---- public API -------------------------------------------------------

  /** Start playback of a queue (track objects or ids), at index. */
  function play(newQueue, index = 0) {
    wake();
    const q = normalizeQueue(newQueue);
    if (q.length === 0) return false;
    queue = q;
    return startTrackAt(Math.min(Math.max(0, index), q.length - 1), 400);
  }

  function pause() {
    if (!playing) return false;
    return setPlaying(false);
  }

  function setPlaying(next) {
    if (!current) {
      // Nothing loaded: play starts the queue from the top.
      if (next && queue.length > 0) return startTrackAt(Math.max(0, queueIndex));
      return playing;
    }
    if (next === playing) return playing;
    playing = next;
    if (ensureCtx()) {
      if (playing) {
        wake();
        startedAtCtx = ctx.currentTime - pausedAtSec;
        startScheduler();
      } else {
        pausedAtSec = Math.max(0, ctx.currentTime - startedAtCtx);
        try { ctx.suspend(); } catch {}
        stopScheduler();
      }
    } else {
      if (playing) startFallback();
      else stopFallback();
    }
    return playing;
  }

  /** Toggle play/pause. Starts the queue if nothing is loaded. Returns playing. */
  function toggle() {
    wake();
    return setPlaying(!playing);
  }

  /** Advance to the next track in the queue (crossfades). */
  function next() {
    wake();
    if (queue.length === 0) return false;
    if (queueIndex < queue.length - 1) return startTrackAt(queueIndex + 1);
    return false;
  }

  /** Go back to the previous track in the queue (crossfades). */
  function prev() {
    wake();
    if (queue.length === 0) return false;
    if (queueIndex > 0) return startTrackAt(queueIndex - 1);
    return false;
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    if (master && ctx) {
      try { master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03); } catch {}
    }
    return volume;
  }

  function volumeUp(step = 0.1) {
    return setVolume(volume + step);
  }

  function volumeDown(step = 0.1) {
    return setVolume(volume - step);
  }

  function onBeat(cb) {
    beatCbs.add(cb);
    return () => beatCbs.delete(cb);
  }

  function currentTrack() {
    return current;
  }

  /** 0..1 energy level for visuals (analyser RMS, or simulated in fallback). */
  function getLevel() {
    if (analyser && playing) {
      analyser.getByteTimeDomainData(timeBuf);
      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / timeBuf.length) * 3.2);
    }
    // Simulated: breathe on the beat phase so visuals stay alive headless.
    if (!playing || !current) return 0;
    const beat = 60 / (current.bpm || 100);
    const phase = (getPositionSec() % beat) / beat;
    return 0.35 + 0.3 * Math.exp(-phase * 6);
  }

  function getPositionSec() {
    if (!current) return 0;
    if (ctx) {
      return playing
        ? Math.max(0, ctx.currentTime - startedAtCtx)
        : pausedAtSec;
    }
    return fallbackPos;
  }

  function isFinished() {
    return !!current && getPositionSec() >= current.durationSec;
  }

  function queueInfo() {
    return { length: queue.length, index: queueIndex };
  }

  return {
    play,
    pause,
    toggle,
    next,
    prev,
    setVolume,
    volumeUp,
    volumeDown,
    onBeat,
    currentTrack,
    getLevel,
    getPositionSec,
    isFinished,
    queueInfo,
    isLive,
  };
}
