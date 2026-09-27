/**
 * library.js — the track catalog for Dial.
 *
 * 24 fictional tracks with full metadata. DOM-free: importable in Node.
 * All queries are deterministic: results ordered by seed (ascending), never
 * shuffled. Tracks matching more requested moods rank first.
 */

/** Local mulberry32 — no shared dep, keeps modules independent. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TRACKS = [
  // ---- 90s hip hop ----
  { id: 't01', title: 'Boom Bap Reverie', artist: 'Concrete Poets', album: 'Rust Belt Gospel', bpm: 92,  moods: ['90s-hiphop', 'chill'], key: 'Am', durationSec: 214, seed: 11 },
  { id: 't02', title: 'Velvet Static',      artist: 'DJ Turnstile',  album: 'Side B Forever',    bpm: 96,  moods: ['90s-hiphop', 'night'], key: 'Gm', durationSec: 198, seed: 23 },
  { id: 't03', title: 'Corner Store Halo', artist: 'Concrete Poets', album: 'Rust Belt Gospel', bpm: 88,  moods: ['90s-hiphop', 'soul'],  key: 'Dm', durationSec: 231, seed: 37 },
  // ---- soul ----
  { id: 't04', title: 'Honey & Smoke',     artist: 'Paloma Drift',  album: 'Amber Hour',        bpm: 78,  moods: ['soul', 'chill'],      key: 'Fm', durationSec: 246, seed: 41 },
  { id: 't05', title: 'Copperline',        artist: 'Jonah Reyes',   album: 'Slow Parade',       bpm: 84,  moods: ['soul', 'night'],      key: 'Cm', durationSec: 222, seed: 53 },
  { id: 't06', title: 'Paper Sunsets',     artist: 'Saffron Youth', album: 'Faded Polaroids',   bpm: 102, moods: ['soul', 'energy'],     key: 'C',  durationSec: 187, seed: 67 },
  // ---- chill / night ----
  { id: 't07', title: 'Half-Light',        artist: 'Blue Hour Society', album: 'Blue Hour',     bpm: 76,  moods: ['chill', 'night'],     key: 'Em', durationSec: 263, seed: 71 },
  { id: 't08', title: 'Gravity Bloom',     artist: 'The Low Orbitals', album: 'Apogee',        bpm: 80,  moods: ['chill', 'focus'],     key: 'A',  durationSec: 240, seed: 83 },
  { id: 't09', title: 'Neon Meridian',     artist: 'Midnight Circuit', album: 'Afterhours',    bpm: 104, moods: ['night', 'electronic'], key: 'Bm', durationSec: 208, seed: 89 },
  // ---- rain / jazz ----
  { id: 't10', title: 'Wipers in 6/8',     artist: 'Motel Mirage',  album: 'Vacancy Sign',      bpm: 72,  moods: ['rain', 'jazz'],        key: 'Bb', durationSec: 271, seed: 97 },
  { id: 't11', title: 'Grey Window Seat',  artist: 'Cassette Palms', album: 'Drizzle Tapes',    bpm: 68,  moods: ['rain', 'chill'],      key: 'Eb', durationSec: 254, seed: 103 },
  { id: 't12', title: 'Umbrella Waltz',    artist: 'The Brubeck Ghosts', album: 'Blue Note Rain', bpm: 90, moods: ['jazz', 'rain'],       key: 'F',  durationSec: 216, seed: 109 },
  { id: 't13', title: 'Smoked Glass',      artist: 'Blue Hour Society', album: 'Blue Hour',    bpm: 118, moods: ['jazz', 'night'],       key: 'Dm', durationSec: 193, seed: 113 },
  // ---- electronic / energy ----
  { id: 't14', title: 'Overpass Glow',     artist: 'Midnight Circuit', album: 'Afterhours',    bpm: 122, moods: ['electronic', 'energy'], key: 'Am', durationSec: 201, seed: 127 },
  { id: 't15', title: 'Redline Reverie',   artist: 'Vector Bloom',  album: 'Seventh Gear',      bpm: 128, moods: ['electronic', 'energy'], key: 'Gm', durationSec: 189, seed: 131 },
  { id: 't16', title: 'Soft Ignition',     artist: 'Vector Bloom',  album: 'Seventh Gear',      bpm: 110, moods: ['electronic', 'focus'], key: 'D',  durationSec: 224, seed: 137 },
  // ---- focus ----
  { id: 't17', title: 'Lane Discipline',   artist: 'The Low Orbitals', album: 'Apogee',         bpm: 96,  moods: ['focus', 'chill'],     key: 'G',  durationSec: 238, seed: 139 },
  { id: 't18', title: 'Cruise Control',    artist: 'Paloma Drift',  album: 'Amber Hour',        bpm: 100, moods: ['focus', 'energy'],    key: 'E',  durationSec: 205, seed: 149 },
  // ---- more hip hop / soul crossovers ----
  { id: 't19', title: 'Dusty Fingers',     artist: 'DJ Turnstile',  album: 'Side B Forever',    bpm: 90,  moods: ['90s-hiphop', 'chill', 'soul'], key: 'Em', durationSec: 219, seed: 151 },
  { id: 't20', title: 'Low Beams',         artist: 'Jonah Reyes',   album: 'Slow Parade',       bpm: 82,  moods: ['soul', 'night', 'rain'], key: 'Cm', durationSec: 248, seed: 157 },
  // ---- night electronic / chill ----
  { id: 't21', title: 'Dashboard Confessional', artist: 'Neon Pastoral', album: 'Mile Marker', bpm: 98,  moods: ['night', 'chill'],     key: 'Am', durationSec: 226, seed: 163 },
  { id: 't22', title: 'Fogline',           artist: 'Cassette Palms', album: 'Drizzle Tapes',    bpm: 74,  moods: ['rain', 'night', 'chill'], key: 'Fm', durationSec: 259, seed: 167 },
  // ---- energy openers ----
  { id: 't23', title: 'First Light Anthem', artist: 'Saffron Youth', album: 'Faded Polaroids', bpm: 118, moods: ['energy', 'chill'],    key: 'G',  durationSec: 196, seed: 173 },
  { id: 't24', title: 'Tailwind',          artist: 'Neon Pastoral', album: 'Mile Marker',       bpm: 124, moods: ['energy', 'electronic'], key: 'A',  durationSec: 184, seed: 179 },
];

/** Fast id -> track lookup. */
export const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

function asArray(v) {
  if (v == null) return null;
  return Array.isArray(v) ? v : [v];
}

/**
 * queryLibrary({ mood, bpmMin, bpmMax, artist, excludeIds, limit })
 * - mood: string | string[] — track must share at least one mood; tracks
 *   matching MORE requested moods rank first, then by seed ascending.
 * - bpmMin / bpmMax: inclusive tempo bounds.
 * - artist: case-insensitive substring match.
 * - excludeIds: array of track ids to skip.
 * - limit: max results (default: all).
 * Deterministic: same filters -> same order, every time.
 */
export function queryLibrary(filters = {}) {
  const { bpmMin, bpmMax, artist, limit } = filters;
  const moods = asArray(filters.mood);
  const exclude = new Set(filters.excludeIds || []);
  const artistQ = artist ? String(artist).toLowerCase() : null;

  const scored = [];
  for (const t of TRACKS) {
    if (exclude.has(t.id)) continue;
    if (bpmMin != null && t.bpm < bpmMin) continue;
    if (bpmMax != null && t.bpm > bpmMax) continue;
    if (artistQ && !t.artist.toLowerCase().includes(artistQ)) continue;
    let moodHits = 0;
    if (moods) {
      moodHits = moods.filter((m) => t.moods.includes(m)).length;
      if (moodHits === 0) continue;
    }
    scored.push({ t, moodHits });
  }

  // More mood matches first, then ascending seed: fully deterministic.
  scored.sort((a, b) => b.moodHits - a.moodHits || a.t.seed - b.t.seed);

  const out = scored.map((s) => s.t);
  return limit != null ? out.slice(0, limit) : out;
}

/** Deterministic RNG stream for a track (sleeves, generative audio). */
export function rngFor(seed) {
  return mulberry32(seed >>> 0);
}

/* ── seeded Drives (from the simulator's main.js — data identical) ──── */

/**
 * DRIVE_DEFS — the 5 seeded Drives.
 * `mood`/`bpmMin`/`bpmMax` feed queryLibrary(); `vibe` is the display
 * tag; `hello` is the DJ's opening line. `seed` drives deterministic
 * ordering (mood matches rank first, then seed ascending).
 */
export const DRIVE_DEFS = [
  {
    id: 'morning-commute', name: 'Morning Commute', vibe: 'WAKEFUL · UPBEAT',
    mood: 'energy', bpmMin: 100, bpmMax: 132, seed: 101,
    hello: "Morning. Windows-down mix is rolling — say the word and I'll steer the vibe.",
  },
  {
    id: 'late-night', name: 'Late Night Drive', vibe: 'NOCTURNAL · DEEP',
    mood: 'night', bpmMin: 70, bpmMax: 100, seed: 202,
    hello: "Late night. Low lights, low end. I'll keep it deep — tell me where your head's at.",
  },
  {
    id: 'rainy-highway', name: 'Rainy Highway', vibe: 'GREY · ROLLING',
    mood: 'rain', bpmMin: 68, bpmMax: 110, seed: 303,
    hello: "Rain on the windshield. I've got something grey and rolling — lean in.",
  },
  {
    id: 'golden-hour', name: 'Golden Hour', vibe: 'WARM · CRUISING',
    mood: ['chill', 'soul'], bpmMin: 78, bpmMax: 120, seed: 404,
    hello: "Golden hour. Warm drums, long light. This one's built for the long way home.",
  },
  {
    id: 'city-lights', name: 'City Lights', vibe: 'NEON · ELECTRIC',
    mood: 'electronic', bpmMin: 104, bpmMax: 140, seed: 505,
    hello: "City lights. Neon tempo, electric low end. Let's move.",
  },
];

/** Seed a drive's trackIds via the library's mood+BPM query, with graceful
 *  fallbacks. Deterministic: same catalog -> same drive, every time. */
export function seedDriveTracks(def) {
  try {
    let hits = queryLibrary({ mood: def.mood, bpmMin: def.bpmMin, bpmMax: def.bpmMax });
    if (!hits.length) hits = queryLibrary({ mood: def.mood });
    if (!hits.length) hits = queryLibrary({});
    return hits.map((t) => t.id);
  } catch {
    return TRACKS.slice(0, 8).map((t) => t.id);
  }
}

/** Build the 5 drive objects: { id, name, vibe, seed, thread, trackIds }. */
export function buildDrives(defs = DRIVE_DEFS) {
  return defs.map((def) => ({
    id: def.id,
    name: def.name,
    vibe: def.vibe,
    seed: def.seed,
    thread: [{ role: 'dj', text: def.hello }],
    trackIds: seedDriveTracks(def),
  }));
}
