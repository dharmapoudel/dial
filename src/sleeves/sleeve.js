/* ═══════════════════════════════════════════════════════════════════
   src/sleeves/sleeve.js — deterministic "studio vinyl label" sleeves
   -------------------------------------------------------------------
   drawSleeve(canvas, track, px) — paints a premium, consistent record-
     sleeve visual for a track onto the given 2D canvas.
   sleeveURL(track, makeCanvas?) — cached dataURL (Map). makeCanvas is an
     optional canvas factory for non-browser use; in the browser it
     defaults to document.createElement (resolved lazily at call time).

   track = { id, title, artist, album, bpm, moods[], key, seed }

   Design system (same rig for every track, hue/composition vary):
   • matte paper stock + seeded grain
   • one dominant geometric form in a per-track hue (mulberry32 from seed)
   • hairline Swiss grid + edge ticks
   • diagonal refractive light streak
   • foil outer ring (machined, jittered segments)
   • center label disc: arc-set artist, title, catalog no (CT-####),
     BPM / key / mood micro-typography, spindle hole

   Determinism: every random choice flows from the seeded PRNG. Same
   seed -> identical pixels, forever. No Math.random, no Date.

   DOM-free at module top level: `document` is only touched inside the
   default canvas factory, at call time — this module imports cleanly
   in Node (see test/smoke.mjs conventions).
   ═══════════════════════════════════════════════════════════════════ */

/* ── seeded PRNG ──────────────────────────────────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedFromTrack(track = {}) {
  const base = fnv1a(String(track.id ?? track.title ?? 'unknown'));
  const extra = (Number(track.seed) >>> 0) || 0;
  return (base ^ Math.imul(extra || 0x9E3779B1, 0x85EBCA6B)) >>> 0;
}

export function catalogNo(track = {}) {
  const n = 1000 + (seedFromTrack(track) % 9000);
  return 'CT-' + String(n).padStart(4, '0');
}

/* ── canvas helpers ───────────────────────────────────────────────── */
function setTracking(ctx, px) {
  // canvas letter-spacing (Chrome/Edge); harmless elsewhere
  try { ctx.letterSpacing = px; } catch { /* noop */ }
}

function fitText(ctx, text, maxWidth, baseSize, weight = 700) {
  let size = baseSize;
  ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (size > 8 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
  }
  return size;
}

function ellipsis(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

/** Set text along an arc. flip=true renders along the bottom arc. */
function arcText(ctx, text, cx, cy, radius, centerAngle, spread, font, color, flip = false) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const a = centerAngle + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* ── main painter ─────────────────────────────────────────────────── */
export function drawSleeve(canvas, track = {}, px = 512) {
  px = Math.max(64, px | 0 || 512);
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('drawSleeve needs a 2D canvas context');

  const seed = seedFromTrack(track);
  const rng = mulberry32(seed);
  const hue = Math.floor(rng() * 360);
  const sat = 34 + Math.floor(rng() * 24);      // muted, premium
  const lit = 30 + Math.floor(rng() * 14);
  const paper = '#161417';
  const bone = '#f2efe6';
  const title = String(track.title ?? 'Untitled');
  const artist = String(track.artist ?? 'Unknown Artist').toUpperCase();
  const bpm = track.bpm ? `${track.bpm} BPM` : '— BPM';
  const key = track.key ? String(track.key).toUpperCase() : '—';
  const mood = track.moods && track.moods[0] ? String(track.moods[0]).toUpperCase() : 'DEEP';
  const cat = catalogNo(track);

  /* 1 · matte paper stock */
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, px, px);

  /* 2 · seeded grain (paper tooth) */
  const grains = Math.floor(px * px / 110);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < grains; i++) {
    ctx.fillRect(rng() * px, rng() * px, 1, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = 0; i < grains / 2; i++) {
    ctx.fillRect(rng() * px, rng() * px, 1, 1);
  }

  /* 3 · hue wash — soft radial light from a seeded point */
  const wx = px * (0.3 + rng() * 0.4), wy = px * (0.25 + rng() * 0.35);
  const wash = ctx.createRadialGradient(wx, wy, 0, wx, wy, px * 0.75);
  wash.addColorStop(0, `hsla(${hue},${sat}%,${lit + 14}%,0.34)`);
  wash.addColorStop(1, 'hsla(0,0%,0%,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, px, px);

  /* 4 · dominant geometric form — the "record" motif, seeded quadrant */
  const fx = px * (0.5 + (rng() - 0.5) * 0.52);
  const fy = px * (0.44 + (rng() - 0.5) * 0.40);
  const fr = px * (0.20 + rng() * 0.15);
  ctx.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
  ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
  // machined inner ring on the form
  ctx.strokeStyle = 'rgba(242,239,230,0.28)';
  ctx.lineWidth = Math.max(1, px * 0.003);
  ctx.beginPath(); ctx.arc(fx, fy, fr * 0.72, 0, Math.PI * 2); ctx.stroke();
  // offset hairline echo
  ctx.strokeStyle = 'rgba(242,239,230,0.16)';
  ctx.beginPath(); ctx.arc(fx + px * 0.03, fy - px * 0.03, fr * 1.18, 0, Math.PI * 2); ctx.stroke();

  /* 5 · Swiss hairline grid + edge ticks */
  ctx.strokeStyle = 'rgba(242,239,230,0.10)';
  ctx.lineWidth = 1;
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath(); ctx.moveTo(px * f, 0); ctx.lineTo(px * f, px); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, px * f); ctx.lineTo(px, px * f); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(242,239,230,0.22)';
  const ticks = 28;
  for (let i = 0; i < ticks; i++) {
    const x = (i + 0.5) * (px / ticks);
    const tall = i % 7 === 0;
    ctx.beginPath();
    ctx.moveTo(x, px - (tall ? px * 0.045 : px * 0.025));
    ctx.lineTo(x, px - 1);
    ctx.stroke();
  }

  /* 6 · diagonal refractive light streak */
  ctx.save();
  ctx.translate(px / 2, px / 2);
  ctx.rotate(-0.5 + (rng() - 0.5) * 0.12);
  const streak = ctx.createLinearGradient(-px * 0.09, 0, px * 0.09, 0);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,255,255,0.13)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(-px * 0.09, -px * 0.75, px * 0.18, px * 1.5);
  ctx.restore();

  /* 7 · foil outer ring — machined segments with seeded jitter */
  const foilR = px * 0.455;
  const segs = 72;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 0.86) / segs) * Math.PI * 2;
    const l = 52 + rng() * 34;
    ctx.strokeStyle = `hsla(${hue},8%,${l}%,0.85)`;
    ctx.lineWidth = Math.max(2, px * 0.006);
    ctx.beginPath(); ctx.arc(px / 2, px / 2, foilR, a0, a1); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(242,239,230,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px / 2, px / 2, foilR - px * 0.012, 0, Math.PI * 2); ctx.stroke();

  /* 8 · corner micro-typography */
  ctx.fillStyle = bone;
  ctx.textBaseline = 'alphabetic';
  // top-left: house stamp
  setTracking(ctx, `${px * 0.006}px`);
  ctx.font = `700 ${px * 0.026}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242,239,230,0.75)';
  ctx.fillText('DIAL', px * 0.055, px * 0.085);
  // top-right: catalog
  ctx.textAlign = 'right';
  ctx.font = `700 ${px * 0.026}px "SF Mono", ui-monospace, Menlo, monospace`;
  ctx.fillStyle = '#ff4d00';
  ctx.fillText(cat, px * 0.945, px * 0.085);
  setTracking(ctx, '0px');
  // bottom-left: artist — title
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242,239,230,0.85)';
  const bottomLine = `${artist} — ${title}`;
  fitText(ctx, bottomLine, px * 0.62, px * 0.030, 700);
  ctx.fillText(ellipsis(ctx, bottomLine, px * 0.62), px * 0.055, px * 0.925);
  // bottom-right: bpm · key
  ctx.textAlign = 'right';
  ctx.font = `700 ${px * 0.026}px "SF Mono", ui-monospace, Menlo, monospace`;
  ctx.fillStyle = 'rgba(242,239,230,0.6)';
  ctx.fillText(`${bpm} · ${key}`, px * 0.945, px * 0.925);
  // hairline separators
  ctx.strokeStyle = 'rgba(242,239,230,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px * 0.055, px * 0.105); ctx.lineTo(px * 0.30, px * 0.105); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px * 0.70, px * 0.895); ctx.lineTo(px * 0.945, px * 0.895); ctx.stroke();

  /* 9 · center label disc */
  const lr = px * 0.195, lcx = px / 2, lcy = px / 2;
  const labelFill = ctx.createRadialGradient(lcx - lr * 0.3, lcy - lr * 0.35, lr * 0.1, lcx, lcy, lr);
  labelFill.addColorStop(0, `hsl(${hue},${Math.min(60, sat + 8)}%,${Math.min(46, lit + 12)}%)`);
  labelFill.addColorStop(1, `hsl(${hue},${sat}%,10%)`);
  ctx.fillStyle = labelFill;
  ctx.beginPath(); ctx.arc(lcx, lcy, lr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(242,239,230,0.55)';
  ctx.lineWidth = Math.max(1, px * 0.0035);
  ctx.beginPath(); ctx.arc(lcx, lcy, lr, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(242,239,230,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(lcx, lcy, lr * 0.80, 0, Math.PI * 2); ctx.stroke();

  // arc-set artist (top) + pressing info (bottom)
  const arcName = artist.length > 22 ? artist.slice(0, 22) : artist;
  arcText(ctx, arcName.split('').join('  '), lcx, lcy, lr * 0.66,
    -Math.PI / 2, Math.PI * 0.72,
    `700 ${px * 0.030}px "Helvetica Neue", Arial, sans-serif`,
    'rgba(242,239,230,0.92)');
  arcText(ctx, '33⅓ RPM · STEREO', lcx, lcy, lr * 0.66,
    Math.PI / 2, Math.PI * 0.55,
    `700 ${px * 0.022}px "SF Mono", ui-monospace, Menlo, monospace`,
    'rgba(242,239,230,0.55)', true);

  // label center: mood stamp, title, catalog
  ctx.textAlign = 'center';
  setTracking(ctx, `${px * 0.008}px`);
  ctx.fillStyle = '#ff4d00';
  ctx.font = `700 ${px * 0.024}px "SF Mono", ui-monospace, Menlo, monospace`;
  ctx.fillText(mood, lcx, lcy - px * 0.045);
  setTracking(ctx, '0px');
  ctx.fillStyle = bone;
  const tSize = fitText(ctx, title.toUpperCase(), lr * 1.15, px * 0.042, 800);
  ctx.font = `800 ${tSize}px "Helvetica Neue", Arial, sans-serif`;
  const tShort = ellipsis(ctx, title.toUpperCase(), lr * 1.15);
  // two-line title if it fits nicely, else one ellipsized line
  if (tShort.includes(' ') && ctx.measureText(tShort).width > lr * 0.95) {
    const words = tShort.split(' ');
    const mid = Math.ceil(words.length / 2);
    const l1 = ellipsis(ctx, words.slice(0, mid).join(' '), lr * 1.1);
    const l2 = ellipsis(ctx, words.slice(mid).join(' '), lr * 1.1);
    ctx.fillText(l1, lcx, lcy + px * 0.005);
    ctx.fillText(l2, lcx, lcy + px * 0.048);
  } else {
    ctx.fillText(tShort, lcx, lcy + px * 0.028);
  }
  ctx.font = `700 ${px * 0.022}px "SF Mono", ui-monospace, Menlo, monospace`;
  ctx.fillStyle = 'rgba(242,239,230,0.6)';
  ctx.fillText(cat, lcx, lcy + px * 0.098);

  // spindle hole
  ctx.fillStyle = '#0a0a0c';
  ctx.beginPath(); ctx.arc(lcx, lcy, px * 0.016, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(242,239,230,0.85)';
  ctx.beginPath(); ctx.arc(lcx - px * 0.004, lcy - px * 0.004, px * 0.005, 0, Math.PI * 2); ctx.fill();

  return canvas;
}

/* ── cached dataURL ───────────────────────────────────────────────── */
const _cache = new Map();

function cacheKey(track = {}) {
  return [track.id, track.seed, track.title, track.artist, track.bpm, track.key]
    .map((v) => String(v ?? '')).join('|');
}

function defaultCanvasFactory(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  throw new Error('sleeveURL: no canvas factory available (pass makeCanvas outside the browser)');
}

export function sleeveURL(track = {}, makeCanvas) {
  const key = cacheKey(track);
  const hit = _cache.get(key);
  if (hit) return hit;
  const canvas = (makeCanvas || defaultCanvasFactory)(512, 512);
  drawSleeve(canvas, track, 512);
  const url = canvas.toDataURL('image/png');
  _cache.set(key, url);
  return url;
}

export function clearSleeveCache() {
  _cache.clear();
}

export function sleeveCacheSize() {
  return _cache.size;
}
