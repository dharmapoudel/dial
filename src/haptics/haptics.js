/**
 * haptics.js — linear haptic motor interface for Dial (on-device).
 *
 * Uses navigator.vibrate when available (guarded), otherwise no-ops so the
 * app runs headless / in Node. A master enable switch mirrors the
 * manifest `haptics` config key (see device/config.js): when disabled,
 * every call is a silent no-op.
 *
 * Patterns (ms):
 *   tick    — short rotary-detent tick
 *   confirm — warm double-tap (voice accepted, save, etc.)
 *   error   — long buzz for failures
 *   beat    — soft tick synced to the music pulse
 */

export const PATTERNS = {
  tick: [8],
  confirm: [12, 40, 12],
  error: [60],
  beat: [6],
};

let enabled = true;

/** Master switch. setEnabled(false) silences every haptic call. */
export function setEnabled(v) {
  enabled = !!v;
  return enabled;
}

export function isEnabled() {
  return enabled;
}

function canVibrate() {
  if (!enabled) return false;
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  } catch {
    return false;
  }
}

/** Low-level buzz: vibrate a pattern (number or number[]). */
export function buzz(pattern) {
  if (!canVibrate()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** Short tick: rotary detents, button presses. strength 0..1 scales length. */
export function tick(strength = 0.5) {
  const s = Math.min(1, Math.max(0, strength));
  return buzz([Math.round(5 + s * 9)]);
}

/** Warm double-tap: voice command accepted, bridge save, etc. */
export function confirm() {
  return buzz(PATTERNS.confirm);
}

/** Long buzz: command failed, voice not understood. */
export function error() {
  return buzz(PATTERNS.error);
}

/** Soft tick aligned to the beat. intensity 0..1 scales tick length. */
export function beatTick(intensity = 0.5) {
  const i = Math.min(1, Math.max(0, intensity));
  return buzz([Math.round(3 + i * 6)]);
}
