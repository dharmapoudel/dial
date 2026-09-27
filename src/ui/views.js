/* Dial — src/ui/views.js (on-device)
 *
 * Pure DOM renderers for the 800x480 device UI (#app in index.html).
 *
 *   export renderApp(root, state, deps)
 *     root  — the #app element
 *     state — store state: { view, mode, drives, activeDriveId,
 *             selectedDrive, queue, queueIndex, playing, volume,
 *             voice: { active, transcript, reply }, saved: [] }
 *     deps  — { TRACKS, DRIVES, sleeve, config, actions }
 *             actions: { selectDrive(i), push(), toggleMode(), voice(),
 *                        transport('toggle'|'next'|'prev'), save() }
 *
 * renderApp is idempotent and syncs body[data-mode] / body[data-view].
 * No Bridgething UI kit. Styling via src/ui/styles.css.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

function trackMap(TRACKS) {
  const m = new Map();
  for (const t of TRACKS || []) m.set(t.id, t);
  return m;
}

function currentTrack(state, TRACKS) {
  const id = state.queue && state.queue[state.queueIndex];
  if (!id) return null;
  return trackMap(TRACKS).get(id) || null;
}

function driveById(drives, id) {
  return (drives || []).find((d) => d.id === id) || (drives || [])[0] || null;
}

/* Groove Dial mark, reversed white. 96-grid, matches assets/logo/dial.svg. */
const MARK_SVG =
  '<svg viewBox="0 0 96 96" width="30" height="30" aria-hidden="true">' +
  '<g fill="none" stroke="#f2efe6"><circle cx="48" cy="48" r="31" stroke-width="10"/>' +
  '<circle cx="48" cy="48" r="18" stroke-width="6"/></g>' +
  '<circle cx="48" cy="48" r="5" fill="#f2efe6"/>' +
  '<rect x="43.5" y="18" width="9" height="17" rx="2.5" fill="#f2efe6" transform="rotate(45 48 48)"/>' +
  '</svg>';

const MIC_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#f2efe6" stroke-width="2" stroke-linecap="round">' +
  '<rect x="9" y="3" width="6" height="11" rx="3"/>' +
  '<path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l8-7zM16 5h2v14h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 5v14l-8-7zM6 5h2v14H6z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
};

/** Draw a sleeve only when its art changed (cheap signature guard).
 *  Canvases are rebuilt every render, so the guard must key on the canvas
 *  ELEMENT (WeakMap) — a slot-keyed Map goes stale: after innerHTML rebuilds
 *  the cards, the guard would skip painting the brand-new canvases and the
 *  cards would stay black. Same element + same seed => skip (thumb etc.). */
const _painted = new WeakMap();
function paintSleeve(sleeve, canvas, slot, track, px) {
  if (!sleeve || !canvas) return;
  const seed = (track && track.seed) || 0;
  if (_painted.get(canvas) === seed) return;
  _painted.set(canvas, seed);
  try {
    sleeve.drawSleeve(canvas, track || { seed }, px);
  } catch { /* sleeve failure must never break render */ }
}

/* ------------------------------------------------------------------ */
/* skeleton (built once)                                               */
/* ------------------------------------------------------------------ */

function buildSkeleton(root, deps) {
  const a = deps.actions;

  const gl = el('canvas'); gl.id = 'glbg';
  root.appendChild(gl);

  const header = el('header', 'dl-header');
  const mark = el('span', 'dl-mark'); mark.innerHTML = MARK_SVG;
  const word = el('div');
  word.innerHTML = '<div class="dl-wordmark">DIAL</div><div class="dl-sub">CO-PILOT DJ · BRIDGETHING OS</div>';
  const conn = el('span', 'dl-conn'); conn.id = 'dl-conn'; conn.title = 'Bridge link';
  const spacer = el('div', 'dl-spacer');
  const chip = el('button', 'dl-chip');
  chip.setAttribute('data-action', 'mode');
  chip.setAttribute('aria-label', 'Toggle driving mode');
  const voice = el('button', 'dl-voice');
  voice.setAttribute('data-action', 'voice');
  voice.setAttribute('aria-label', 'Talk to the DJ');
  voice.innerHTML = MIC_SVG;
  header.append(mark, word, conn, spacer, chip, voice);
  root.appendChild(header);

  const main = el('main', 'dl-main'); main.id = 'dl-main';
  root.appendChild(main);

  const nowbar = el('footer', 'dl-nowbar');
  const thumb = el('canvas'); thumb.id = 'dl-thumb';
  const track = el('div', 'dl-track');
  track.innerHTML = '<b id="dl-tb-title">—</b><span id="dl-tb-artist">Open a Drive to start</span>';
  const eq = el('div', 'dl-eq'); eq.setAttribute('aria-hidden', 'true');
  eq.innerHTML = '<i></i><i></i><i></i>';
  const tport = el('div', 'dl-tport');
  const mkBtn = (cmd, icon, label, cls) => {
    const b = el('button', 'dl-tbtn' + (cls ? ' ' + cls : ''));
    b.setAttribute('data-action', cmd);
    b.setAttribute('aria-label', label);
    b.innerHTML = ICONS[icon];
    return b;
  };
  tport.append(
    mkBtn('prev', 'prev', 'Previous track'),
    mkBtn('toggle', 'play', 'Play or pause', 'play'),
    mkBtn('next', 'next', 'Next track'),
    mkBtn('save', 'heart', 'Save track', 'save'),
  );
  nowbar.append(thumb, track, eq, tport);
  root.appendChild(nowbar);

  const voicebar = el('div', 'dl-voicebar'); voicebar.id = 'dl-voicebar';
  voicebar.innerHTML = '<div class="tr"></div><div class="rp"></div>';
  root.appendChild(voicebar);

  const toast = el('div', 'dl-toast'); toast.id = 'dl-toast';
  root.appendChild(toast);

  root._dial = { gl, header, main, nowbar, thumb, chip, voice, voicebar, toast, conn,
                 title: track.querySelector('#dl-tb-title'),
                 artist: track.querySelector('#dl-tb-artist') };
  return root._dial;
}

/* ------------------------------------------------------------------ */
/* header + nowbar sync                                                */
/* ------------------------------------------------------------------ */

function syncChrome(skel, state, deps) {
  const { chip, voice, conn } = skel;
  const driving = state.mode === 'driving';
  chip.innerHTML = '<span class="dot"></span>' + (driving ? 'DRIVING' : 'PARKED');
  voice.classList.toggle('listening', !!(state.voice && state.voice.active));
  conn.classList.toggle('on', !!deps.connected);

  const t = currentTrack(state, deps.TRACKS);
  skel.title.textContent = t ? t.title : '—';
  skel.artist.textContent = t ? `${t.artist} · ${t.album || ''}`.replace(/ · $/, '') : 'Open a Drive to start';
  const playBtn = skel.nowbar.querySelector('[data-action="toggle"]');
  if (playBtn) playBtn.innerHTML = state.playing ? ICONS.pause : ICONS.play;
  const saveBtn = skel.nowbar.querySelector('[data-action="save"]');
  if (saveBtn) saveBtn.classList.toggle('saved', !!(t && (state.saved || []).includes(t.id)));
  if (t) paintSleeve(deps.sleeve, skel.thumb, 'thumb', t, 112);

  const vb = skel.voicebar;
  const v = state.voice || {};
  vb.classList.toggle('show', !!(v.active || v.transcript || v.reply));
  if (v.active || v.transcript || v.reply) {
    vb.querySelector('.tr').textContent = v.transcript ? `“${v.transcript}”` : (v.active ? 'Listening…' : '');
    vb.querySelector('.rp').textContent = v.reply || '';
  }
}

/* ------------------------------------------------------------------ */
/* drives view                                                         */
/* ------------------------------------------------------------------ */

function renderDrives(skel, state, deps) {
  const main = skel.main;
  main.innerHTML = '';
  const wrap = el('div', 'dl-drives');
  const drives = deps.DRIVES || [];

  if (!drives.length) {
    const e = el('div', 'dl-empty');
    e.innerHTML = '<b>No Drives yet</b><p>The DJ is still warming up. Check back shortly.</p>';
    main.appendChild(e);
    return;
  }

  drives.forEach((d, i) => {
    const card = el('article', 'dl-drive');
    card.setAttribute('data-drive-index', String(i));
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open ${d.name}`);
    if (i === state.selectedDrive) card.classList.add('sel');
    if (d.id === state.activeDriveId) card.classList.add('active');

    const cv = el('canvas');
    card.appendChild(cv);
    const rep = { seed: d.seed, title: d.name };
    paintSleeve(deps.sleeve, cv, 'drive:' + i, rep, 224);

    const now = el('span', 'now', 'NOW');
    card.appendChild(now);
    card.appendChild(el('h2', null, d.name));
    card.appendChild(el('div', 'vibe', (d.vibe || '').toUpperCase()));
    const n = (d.trackIds || []).length;
    card.appendChild(el('div', 'count', n ? `${n} TRACKS` : 'DJ MIX'));

    // tap dispatch lives in device/input.js (data-drive-index) — no click
    // listener here, or a touch tap would fire select twice.
    wrap.appendChild(card);
  });

  main.appendChild(wrap);
  const hint = el('div', 'dl-hint', 'KNOB: BROWSE · PUSH: OPEN');
  main.appendChild(hint);
}

/* ------------------------------------------------------------------ */
/* thread view                                                         */
/* ------------------------------------------------------------------ */

function renderThread(skel, state, deps) {
  const main = skel.main;
  main.innerHTML = '';
  const drive = driveById(deps.DRIVES, state.activeDriveId);

  if (!drive) {
    const e = el('div', 'dl-empty');
    e.innerHTML = '<b>No active Drive</b><p>Push the knob on a Drive card to open its thread.</p>';
    main.appendChild(e);
    return;
  }

  const wrap = el('div', 'dl-thread');

  const convo = el('section', 'dl-convo');
  convo.innerHTML = `<header><b>${escapeHtml(drive.name).toUpperCase()}</b> · DJ THREAD</header>`;
  const msgs = el('div', 'dl-msgs');
  for (const m of drive.thread || []) {
    const b = el('div', 'dl-msg ' + (m.role === 'user' ? 'user' : 'dj'));
    if (m.role === 'dj') {
      const who = el('span', 'who', 'DIAL DJ');
      b.appendChild(who);
      b.appendChild(document.createTextNode(m.text));
    } else {
      b.textContent = m.text;
    }
    msgs.appendChild(b);
  }
  convo.appendChild(msgs);
  wrap.appendChild(convo);

  const q = el('section', 'dl-queue');
  q.innerHTML = '<header>UP NEXT</header>';
  const ol = el('ol');
  const tm = trackMap(deps.TRACKS);
  (state.queue || []).forEach((id, i) => {
    const t = tm.get(id);
    if (!t) return;
    const li = el('li');
    if (i === state.queueIndex) li.classList.add('cur');
    li.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="t"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.artist)}</span></span>`;
    ol.appendChild(li);
  });
  if (!ol.children.length) {
    const li = el('li');
    li.innerHTML = '<span class="t"><b>Queue is empty</b><span>Ask the DJ for music</span></span>';
    ol.appendChild(li);
  }
  q.appendChild(ol);
  wrap.appendChild(q);

  main.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ------------------------------------------------------------------ */
/* driving view                                                        */
/* ------------------------------------------------------------------ */

function renderDriving(skel, state, deps) {
  const main = skel.main;
  main.innerHTML = '';
  const wrap = el('div', 'dl-driving');

  const t = currentTrack(state, deps.TRACKS);
  const info = el('div', 'dl-drive-info');
  const hud = state.hud || {};
  info.innerHTML =
    '<div class="kicker">' + (state.playing ? 'NOW PLAYING' : 'PAUSED') + '</div>' +
    `<h2>${escapeHtml(t ? t.title : '—')}</h2>` +
    `<div class="artist">${escapeHtml(t ? t.artist : 'Open a Drive to start')}</div>`;

  if (hud.nextTurn) {
    const nx = el('div', 'dl-next');
    nx.innerHTML = `<div class="turn">↗</div><div class="txt"><b>${escapeHtml(hud.nextTurn)}</b>` +
      `<span>${hud.speed ? hud.speed + ' MPH' : ''}</span></div>`;
    info.appendChild(nx);
  }
  wrap.appendChild(info);

  const big = el('button', 'dl-bigvoice');
  big.setAttribute('data-action', 'voice');
  big.setAttribute('aria-label', 'Talk to the DJ');
  big.innerHTML = MIC_SVG + '<span>TALK</span>';
  if (state.voice && state.voice.active) big.classList.add('listening');
  wrap.appendChild(big);

  main.appendChild(wrap);
}

/* ------------------------------------------------------------------ */
/* top-level                                                           */
/* ------------------------------------------------------------------ */

export function renderApp(root, state, deps) {
  const skel = root._dial || buildSkeleton(root, deps);
  document.body.dataset.mode = state.mode === 'driving' ? 'driving' : 'parked';
  document.body.dataset.view = state.view || 'drives';

  syncChrome(skel, state, deps);

  const view = state.view || 'drives';
  if (view === 'thread') renderThread(skel, state, deps);
  else if (view === 'driving') renderDriving(skel, state, deps);
  else renderDrives(skel, state, deps);
}

/** Toast helper for confirmations. */
export function showToast(root, msg, ms = 1600) {
  const skel = root._dial;
  if (!skel) return;
  skel.toast.textContent = msg;
  skel.toast.classList.add('show');
  clearTimeout(skel.toast._t);
  skel.toast._t = setTimeout(() => skel.toast.classList.remove('show'), ms);
}
