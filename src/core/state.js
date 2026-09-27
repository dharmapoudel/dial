/**
 * state.js — tiny reactive store for Dial.
 *
 * DOM-free: safe to import in Node (tests, SSR) and in the browser.
 * createStore(initial) -> { getState, update(patch), subscribe(fn) }
 * update() shallow-merges the patch into state and notifies subscribers.
 */

/** Default 4 sample Drives. trackIds are filled later by main.js. */
export const DEFAULT_DRIVES = [
  {
    id: 'drive-morning',
    name: 'Morning Commute',
    vibe: 'dawn',
    seed: 101,
    thread: [
      {
        role: 'dj',
        text: 'Good morning. Traffic is light, coffee is hot — I lined up something bright and steady for the on-ramp.',
      },
    ],
    trackIds: [],
  },
  {
    id: 'drive-night',
    name: 'Late Night Drive',
    vibe: 'midnight',
    seed: 202,
    thread: [
      {
        role: 'dj',
        text: 'Windows down, city asleep. This one stays low and slow — just you and the dashboard glow.',
      },
    ],
    trackIds: [],
  },
  {
    id: 'drive-rain',
    name: 'Rainy Highway',
    vibe: 'rain',
    seed: 303,
    thread: [
      {
        role: 'dj',
        text: 'Wipers on, headlights out. I queued a wet-weather mix — jazzy, grey, and perfectly unhurried.',
      },
    ],
    trackIds: [],
  },
  {
    id: 'drive-golden',
    name: 'Golden Hour Run',
    vibe: 'dusk',
    seed: 404,
    thread: [
      {
        role: 'dj',
        text: 'Sun is doing the thing. Warm soul, a little bounce — this drive mixes itself.',
      },
    ],
    trackIds: [],
  },
];

export const DEFAULT_STATE = {
  view: 'drives',            // 'drives' | 'thread' | 'now'
  mode: 'parked',            // 'parked' | 'driving'
  drives: DEFAULT_DRIVES,
  activeDriveId: 'drive-morning',
  selectedDrive: 0,          // index highlighted in crate view
  queue: [],
  queueIndex: 0,
  playing: false,
  volume: 0.8,
  voice: { active: false, transcript: '', reply: '' },
  hud: { speed: 0, nextTurn: '' },
  phone: { view: 'library', handedOff: false },
  saved: [],
};

/** Deep-enough clone of the default state (so callers can mutate freely). */
export function defaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

/**
 * Create a store. `initial` is shallow-cloned at the top level.
 */
export function createStore(initial = defaultState()) {
  let state = { ...initial };
  const subs = new Set();

  function getState() {
    return state;
  }

  /** Shallow-merge patch into state, then notify subscribers. */
  function update(patch = {}) {
    const prev = state;
    state = { ...state, ...patch };
    if (state !== prev) {
      for (const fn of subs) {
        try {
          fn(state);
        } catch {
          /* subscriber errors must not break the store */
        }
      }
    }
    return state;
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  return { getState, update, subscribe };
}
