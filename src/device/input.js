/* Dial — src/device/input.js (on-device)
 *
 * Maps the Car Thing hardware inputs onto app handlers.
 *
 *   const input = initInput(handlers);
 *   input.destroy();
 *
 * handlers:
 *   root            — element touch/swipe/tap gestures attach to (#app)
 *   onScrub(dir)    — knob rotated; dir = +1 | -1 (one call per detent)
 *   onPush()        — knob pressed (tap, <600ms)
 *   onPull()        — knob held (>600ms) then released
 *   onButton(i)     — tactile button 1..4 pressed
 *   onSelectDrive(i)— touch tap on a drive card
 *   onToggleMode()  — driving-mode chip tapped
 *   onVoice()       — voice button tapped
 *   onTransport(cmd)— 'toggle' | 'next' | 'prev'
 *   onSave()        — save button tapped
 *
 * Hardware facts:
 * - Knob rotate arrives as `wheel` events (dominant axis wins). One detent
 *   per ~40px of accumulated delta. preventDefault (non-passive, capture)
 *   so the page never scrolls.
 * - Knob press arrives as Enter keydown/keyup. A single press can produce
 *   TWO key event pairs — debounced (~350ms). keyup after a hold (>600ms)
 *   is a long-press.
 * - Tactile buttons arrive as keys '1'..'4'. (2+3 chord is screenshot;
 *   nothing critical is bound to 2 or 3 alone — see main.js mapping.)
 * - Touch: tap a drive card = select; horizontal swipe on main = scrub.
 */

'use strict';

const DETENT_PX = 40;      // wheel px per detent
const PRESS_DEBOUNCE_MS = 350;
const HOLD_MS = 600;
const TAP_MOVE_PX = 12;
const SWIPE_PX = 48;

export function initInput(handlers = {}) {
  const root = handlers.root || document.getElementById('app') || document.body;
  const noop = () => {};
  const h = {
    onScrub: handlers.onScrub || noop,
    onPush: handlers.onPush || noop,
    onPull: handlers.onPull || noop,
    onButton: handlers.onButton || noop,
    onSelectDrive: handlers.onSelectDrive || noop,
    onToggleMode: handlers.onToggleMode || noop,
    onVoice: handlers.onVoice || noop,
    onTransport: handlers.onTransport || noop,
    onSave: handlers.onSave || noop,
  };

  /* ---- knob: wheel -> detents ------------------------------------ */
  let acc = 0;
  const onWheel = (e) => {
    e.preventDefault();
    const dx = e.deltaX || 0;
    const dy = e.deltaY || 0;
    // dominant axis wins
    const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    if (!d) return;
    acc += d;
    while (Math.abs(acc) >= DETENT_PX) {
      const dir = acc > 0 ? 1 : -1;
      acc -= dir * DETENT_PX;
      try { h.onScrub(dir); } catch { /* handler fault must not kill input */ }
    }
  };

  /* ---- knob press: Enter tap vs hold, debounced ------------------- */
  let pressT = 0;
  let lastHandled = 0;
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (!pressT) pressT = performance.now();
      return;
    }
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      if (e.repeat) return;
      try { h.onButton(Number(e.key)); } catch { /* see above */ }
    }
  };
  const onKeyUp = (e) => {
    if (e.key !== 'Enter' || !pressT) return;
    e.preventDefault();
    const now = performance.now();
    const held = now - pressT;
    pressT = 0;
    if (now - lastHandled < PRESS_DEBOUNCE_MS) return; // double key events
    lastHandled = now;
    try {
      if (held > HOLD_MS) h.onPull();
      else h.onPush();
    } catch { /* see above */ }
  };

  /* ---- touch: tap (cards + action buttons) and swipe --------------- */
  const ptr = new Map(); // pointerId -> {x0,y0,t0}
  const onPointerDown = (e) => {
    if (!e.isPrimary) return;
    ptr.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: performance.now() });
  };
  const onPointerUp = (e) => {
    if (!e.isPrimary) return;
    const p = ptr.get(e.pointerId);
    ptr.delete(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // horizontal swipe = scrub
    if (adx >= SWIPE_PX && adx > ady * 1.5) {
      try { h.onScrub(dx < 0 ? 1 : -1); } catch { /* see above */ }
      return;
    }
    // tap = card select or action button
    if (adx <= TAP_MOVE_PX && ady <= TAP_MOVE_PX) {
      const card = e.target.closest && e.target.closest('[data-drive-index]');
      if (card) {
        try { h.onSelectDrive(Number(card.dataset.driveIndex)); } catch { /* see above */ }
        return;
      }
      const act = e.target.closest && e.target.closest('[data-action]');
      if (act) {
        const cmd = act.dataset.action;
        try {
          if (cmd === 'mode') h.onToggleMode();
          else if (cmd === 'voice') h.onVoice();
          else if (cmd === 'save') h.onSave();
          else if (cmd === 'toggle' || cmd === 'next' || cmd === 'prev') h.onTransport(cmd);
        } catch { /* see above */ }
      }
    }
  };
  const onPointerCancel = (e) => { ptr.delete(e.pointerId); };

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });
  root.addEventListener('pointerdown', onPointerDown, { passive: true });
  root.addEventListener('pointerup', onPointerUp, { passive: true });
  root.addEventListener('pointercancel', onPointerCancel, { passive: true });

  return {
    destroy() {
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
      ptr.clear();
    },
  };
}
