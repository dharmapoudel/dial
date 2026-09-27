/**
 * dj.js — the co-pilot DJ agent.
 *
 * interpret(command, ctx) -> { actions, reply }
 * applyActions(store, actions, deps) -> mutates the store.
 *
 * ctx = { library, queue, queueIndex, drives, activeDriveId }
 *   library: array of track objects (or anything with .id/.moods); the
 *            built-in catalog is used for lookups via queryLibrary.
 *
 * DOM-free: pure string matching + store updates. Deterministic track
 * selection via queryLibrary (no Math.random anywhere).
 */

import { TRACKS, TRACK_BY_ID, queryLibrary } from './library.js';

/** Map drive vibes -> the moods that extend them. */
export const VIBE_MOODS = {
  dawn: ['chill', 'focus', 'energy'],
  midnight: ['night', 'soul', 'chill'],
  rain: ['rain', 'chill', 'jazz'],
  dusk: ['soul', 'energy', 'chill'],
};

const MOOD_LABEL = {
  dawn: 'dawn',
  midnight: 'midnight',
  rain: 'rainy',
  dusk: 'golden-hour',
};

function currentTrack(ctx) {
  const id = ctx.queue && ctx.queue[ctx.queueIndex];
  return (id && TRACK_BY_ID.get(id)) || null;
}

function excludeFor(ctx) {
  // Keep the DJ from repeating: exclude everything already queued.
  return new Set(ctx.queue || []);
}

function addAfterCurrent(trackIds) {
  return [{ type: 'queue.add', trackIds, position: 'after-current' }];
}

/** Intent rules: [matcher(lowercaseCmd), handler(cmd, ctx) -> {actions, reply} | null] */
const RULES = [
  // "what's playing" / "what song is this"
  [
    (c) => /what('| i)s playing|what song|what'?s this|now playing/.test(c),
    (c, ctx) => {
      const t = currentTrack(ctx);
      if (!t) return { actions: [], reply: 'Nothing on the decks yet — spin up a drive and I’ll take it from there.' };
      return {
        actions: [],
        reply: `That’s “${t.title}” by ${t.artist} — ${t.bpm} BPM in ${t.key}.`,
      };
    },
  ],
  // pause / resume / play / stop
  [
    (c) => /\b(pause|stop|mute)\b/.test(c) && !/pause-yield/.test(c),
    () => ({ actions: [{ type: 'transport.set', playing: false }], reply: 'Paused. The road can wait.' }),
  ],
  [
    (c) => /\b(resume|unpause|keep playing|play it)\b/.test(c) || /^\s*play\s*$/.test(c),
    () => ({ actions: [{ type: 'transport.set', playing: true }], reply: 'Back on. Rolling.' }),
  ],
  // next / skip
  [
    (c) => /\b(next|skip|skip this|forward)\b/.test(c),
    () => ({ actions: [{ type: 'transport.next' }], reply: 'Skipped — next one’s already warming up.' }),
  ],
  // "extend the drive" / "keep it going"
  [
    (c) => /\b(extend|keep (it|this) going|keep going|more music|don'?t stop)\b/.test(c),
    (c, ctx) => {
      const drive = (ctx.drives || []).find((d) => d.id === ctx.activeDriveId);
      const moods = (drive && VIBE_MOODS[drive.vibe]) || ['chill'];
      const picks = queryLibrary({ mood: moods, excludeIds: [...excludeFor(ctx)], limit: 4 });
      return {
        actions: [{ type: 'drive.extend', count: 4 }],
        reply:
          picks.length > 0
            ? `Extending the drive — ${picks.length} more in the same lane, starting with “${picks[0].title}”.`
            : 'I’m fresh out of road for this vibe — try shifting the mood and I’ll keep building.',
      };
    },
  ],
  // 90s hip hop (optionally kept chill)
  [
    (c) => /90'?s|hip[\s-]?hop|boom bap/.test(c),
    (c, ctx) => {
      const keepChill = /chill|mellow|calm|relax|driving/.test(c);
      const moods = keepChill ? ['90s-hiphop', 'chill'] : ['90s-hiphop'];
      const picks = queryLibrary({ mood: moods, excludeIds: [...excludeFor(ctx)], limit: 3 });
      if (picks.length === 0) {
        return { actions: [], reply: 'I’m tapped out on 90s joints for this queue — say “extend the drive” and I’ll dig deeper.' };
      }
      return {
        actions: addAfterCurrent(picks.map((t) => t.id)),
        reply: `On it — sliding ${picks.length} 90s joint${picks.length > 1 ? 's' : ''} in after this one${keepChill ? ', kept mellow for the wheel' : ''}.`,
      };
    },
  ],
  // "drop something like X after this" / "play something like X"
  [
    (c) => /(like|similar to|in the vibe of)\s+([a-z .&'’-]+?)(?:\s+(after this|next|up next))?$/.test(c) || /something like/.test(c),
    (c, ctx) => {
      // Frank Ocean-ish -> soul + chill; default soulful lane otherwise.
      const frankish = /frank ocean|ocean/.test(c);
      const moods = frankish ? ['soul', 'chill'] : ['soul', 'chill'];
      const picks = queryLibrary({ mood: moods, excludeIds: [...excludeFor(ctx)], limit: 2 });
      if (picks.length === 0) return { actions: [], reply: 'Nothing in that pocket right now — give me another name.' };
      return {
        actions: addAfterCurrent(picks.map((t) => t.id)),
        reply: `Got you — “${picks[0].title}” by ${picks[0].artist} is up next. Same wavelength.`,
      };
    },
  ],
  // vibe shifts
  [
    (c) => /rain(y|ier)?|drizzle|storm/.test(c),
    () => ({ actions: [{ type: 'vibe.set', vibe: 'rain' }], reply: 'Making it rainier — wipers optional, mood mandatory.' }),
  ],
  [
    (c) => /night(y|ier)?|midnight|dark/.test(c),
    () => ({ actions: [{ type: 'vibe.set', vibe: 'midnight' }], reply: 'Taking it into the night. Headlights on.' }),
  ],
  [
    (c) => /\b(chill|mellow|calm (it |things )?down|softer)\b/.test(c),
    () => ({ actions: [{ type: 'vibe.set', vibe: 'dawn' }], reply: 'Chilling it out — easy cruising from here.' }),
  ],
  [
    (c) => /\b(energy|hype|faster|upbeat|wake me up)\b/.test(c),
    () => ({ actions: [{ type: 'vibe.set', vibe: 'dusk' }], reply: 'Turning the energy up. Windows down.' }),
  ],
  // generic "more X" — try to map X to a mood
  [
    (c) => /\bmore\s+([a-z-]+)/.test(c),
    (c, ctx) => {
      const m = c.match(/\bmore\s+([a-z-]+)/);
      const word = m && m[1];
      const moodHit = ['chill', 'night', 'rain', 'energy', 'focus', 'soul', 'electronic', 'jazz'].find(
        (mo) => word.startsWith(mo) || mo.startsWith(word)
      );
      if (!moodHit) return null;
      const picks = queryLibrary({ mood: [moodHit], excludeIds: [...excludeFor(ctx)], limit: 3 });
      if (picks.length === 0) return { actions: [], reply: `I’m out of ${moodHit} for now — name another flavor.` };
      return {
        actions: addAfterCurrent(picks.map((t) => t.id)),
        reply: `More ${moodHit}, coming right up — “${picks[0].title}” leads the way.`,
      };
    },
  ],
];

/**
 * interpret(command, ctx) -> { actions, reply }
 * Case-insensitive; first matching rule wins. Always returns a reply —
 * the DJ never goes silent.
 */
export function interpret(command, ctx = {}) {
  const cmd = String(command || '').toLowerCase().trim();
  const safeCtx = {
    library: TRACKS,
    queue: [],
    queueIndex: 0,
    drives: [],
    activeDriveId: null,
    ...ctx,
  };

  if (!cmd) {
    return { actions: [], reply: 'I’m listening — tell me what the drive needs.' };
  }

  for (const [match, handle] of RULES) {
    if (match(cmd)) {
      const out = handle(cmd, safeCtx);
      if (out) return out;
    }
  }

  return {
    actions: [],
    reply: 'Say the word — I can shift the vibe, drop something new after this, or extend the drive.',
  };
}

/**
 * applyActions(store, actions, deps)
 * Mutates the store: queue / queueIndex / playing / drive vibe + thread.
 * deps (optional): { extendLimit } — cap for drive.extend (default 4).
 */
export function applyActions(store, actions = [], deps = {}) {
  const extendLimit = deps.extendLimit || 4;

  for (const a of actions) {
    const s = store.getState();
    switch (a.type) {
      case 'queue.add': {
        const ids = (a.trackIds || []).filter((id) => TRACK_BY_ID.has(id));
        if (ids.length === 0) break;
        const queue = [...s.queue];
        if (a.position === 'after-current') {
          queue.splice(s.queueIndex + 1, 0, ...ids);
        } else {
          queue.push(...ids);
        }
        store.update({ queue });
        break;
      }
      case 'vibe.set': {
        if (!VIBE_MOODS[a.vibe]) break;
        const drives = s.drives.map((d) =>
          d.id === s.activeDriveId
            ? {
                ...d,
                vibe: a.vibe,
                thread: [
                  ...d.thread,
                  { role: 'dj', text: `Shifting us into ${MOOD_LABEL[a.vibe] || a.vibe} territory.` },
                ],
              }
            : d
        );
        store.update({ drives });
        break;
      }
      case 'transport.next': {
        if (s.queueIndex < s.queue.length - 1) {
          store.update({ queueIndex: s.queueIndex + 1, playing: true });
        }
        break;
      }
      case 'transport.toggle': {
        store.update({ playing: !s.playing });
        break;
      }
      case 'transport.set': {
        store.update({ playing: !!a.playing });
        break;
      }
      case 'drive.extend': {
        const count = Math.min(a.count || extendLimit, extendLimit);
        const drive = s.drives.find((d) => d.id === s.activeDriveId);
        const moods = (drive && VIBE_MOODS[drive.vibe]) || ['chill'];
        const picks = queryLibrary({
          mood: moods,
          excludeIds: [...s.queue],
          limit: count,
        }).map((t) => t.id);
        if (picks.length === 0) break;
        const drives = s.drives.map((d) =>
          d.id === s.activeDriveId
            ? {
                ...d,
                trackIds: [...d.trackIds, ...picks],
                thread: [
                  ...d.thread,
                  { role: 'dj', text: `Extended the drive — ${picks.length} more tracks queued up.` },
                ],
              }
            : d
        );
        store.update({ drives, queue: [...s.queue, ...picks] });
        break;
      }
      default:
        // Unknown action types are ignored — never crash the DJ.
        break;
    }
  }
  return store.getState();
}
