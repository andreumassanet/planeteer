/**
 * A course's ghost: the track of the best run round it, kept on the device.
 *
 * The recorder samples the craft's pose `GHOST_RATE` times a second of run
 * time, each sample interpolated between the two frames either side of its
 * instant, so a run recorded at 30 fps and at 144 gives the same samples. A
 * position is kept in whole `GHOST_QUANTUM`s, a rotation as four bytes. On
 * disk a track is its first cell and then ten bytes a sample (three 16-bit
 * deltas of position, four signed bytes of quaternion), in base64, under its
 * own key (`GHOST_KEY`), never synced. The store keeps at most
 * `GHOST_MAX_COURSES` courses and `GHOST_MAX_CHARS` of tracks, the newest
 * first. Every read and write is wrapped; a damaged entry is dropped alone.
 */
import * as THREE from 'three';

export const GHOST_KEY = 'atlas.ghosts.v1';
/** Samples a second of run time. */
export const GHOST_RATE = 8;
/** The step a position is kept in, units. */
export const GHOST_QUANTUM = 1 / 8;
/** The longest run kept, in samples: fifteen minutes. */
export const GHOST_MAX_SAMPLES = GHOST_RATE * 900;
/** The most courses with a ghost on the device. */
export const GHOST_MAX_COURSES = 16;
/** The most characters of encoded track, all courses together. */
export const GHOST_MAX_CHARS = 320_000;
/** Bytes a sample on disk. */
const SAMPLE_BYTES = 10;
const COURSE_KEY = /^[asl]:[a-z0-9-]{1,40}$/;
const MODEL_ID = /^[a-z0-9-]{0,32}$/;
const INT16 = 32767;

export interface GhostTrack {
  /** The craft model it was run in (`CraftModel.id`), or '' for none known. */
  model: string;
  /** Which way round the course it was run. */
  way: 1 | -1;
  /** Its lap, ms, as the record counts it. */
  ms: number;
  /** When it was kept, ms since the epoch: the newest are kept first. */
  saved: number;
  /** The lap clock, ms, at each ring of the run in the order it was run (the start's is 0). */
  splits: number[];
  /** Positions in quanta, three a sample. */
  cells: Int32Array;
  /** Rotations as signed bytes over 127, four a sample (x, y, z, w). */
  turns: Int8Array;
}

export type GhostStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function sampleCount(track: GhostTrack): number {
  return track.turns.length / 4;
}

/** How long the track runs, seconds. */
export function ghostDuration(track: GhostTrack): number {
  return Math.max(0, sampleCount(track) - 1) / GHOST_RATE;
}

const ta = new THREE.Quaternion();
const tb = new THREE.Quaternion();

function readTurn(turns: Int8Array, i: number, out: THREE.Quaternion): THREE.Quaternion {
  out.set(turns[i * 4]!, turns[i * 4 + 1]!, turns[i * 4 + 2]!, turns[i * 4 + 3]!);
  if (out.lengthSq() < 1e-6) return out.identity();
  return out.normalize();
}

/**
 * The ghost `seconds` into its run: position and rotation interpolated
 * between the samples either side, held at either end. False past its end or
 * for an empty track.
 */
export function ghostPose(track: GhostTrack, seconds: number, position: THREE.Vector3, turn: THREE.Quaternion): boolean {
  const n = sampleCount(track);
  if (n === 0) return false;
  const at = Math.min(Math.max(seconds * GHOST_RATE, 0), n - 1);
  const i = Math.min(Math.floor(at), n - 2 < 0 ? 0 : n - 2);
  const j = Math.min(i + 1, n - 1);
  const f = at - i;
  const c = track.cells;
  position.set(
    (c[i * 3]! + (c[j * 3]! - c[i * 3]!) * f) * GHOST_QUANTUM,
    (c[i * 3 + 1]! + (c[j * 3 + 1]! - c[i * 3 + 1]!) * f) * GHOST_QUANTUM,
    (c[i * 3 + 2]! + (c[j * 3 + 2]! - c[i * 3 + 2]!) * f) * GHOST_QUANTUM,
  );
  turn.slerpQuaternions(readTurn(track.turns, i, ta), readTurn(track.turns, j, tb), f);
  return seconds <= ghostDuration(track);
}

export interface GhostRecorder {
  /** Samples kept so far. */
  readonly count: number;
  /** The run outgrew `GHOST_MAX_SAMPLES` and will keep no ghost. */
  readonly overflowed: boolean;
  /** The run starts here: its first sample, at run time 0. */
  begin(position: THREE.Vector3, turn: THREE.Quaternion): void;
  /** A frame `elapsed` seconds into the run: every sample due since the last frame. */
  step(elapsed: number, position: THREE.Vector3, turn: THREE.Quaternion): void;
  /** The run as a track, or null when there is nothing to keep. */
  track(model: string, way: 1 | -1, ms: number, splits: readonly number[], saved: number): GhostTrack | null;
  /** Forgets the run under way. */
  stop(): void;
}

export function createGhostRecorder(): GhostRecorder {
  let cells: number[] = [];
  let turns: number[] = [];
  let on = false;
  let overflowed = false;
  let last = 0;
  const lastPosition = new THREE.Vector3();
  const lastTurn = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();

  function keep(position: THREE.Vector3, turn: THREE.Quaternion): void {
    if (turns.length / 4 >= GHOST_MAX_SAMPLES) {
      overflowed = true;
      return;
    }
    cells.push(Math.round(position.x / GHOST_QUANTUM), Math.round(position.y / GHOST_QUANTUM), Math.round(position.z / GHOST_QUANTUM));
    const sign = turn.w < 0 ? -1 : 1;
    turns.push(...[turn.x, turn.y, turn.z, turn.w].map((v) => Math.max(-127, Math.min(127, Math.round(v * sign * 127)))));
  }

  return {
    get count() {
      return turns.length / 4;
    },
    get overflowed() {
      return overflowed;
    },
    begin(position, turn) {
      cells = [];
      turns = [];
      overflowed = false;
      on = true;
      last = 0;
      lastPosition.copy(position);
      lastTurn.copy(turn);
      keep(position, turn);
    },
    step(elapsed, position, turn) {
      if (!on || overflowed || !(elapsed > last)) return;
      const span = elapsed - last;
      for (let k = turns.length / 4; k / GHOST_RATE <= elapsed + 1e-9 && !overflowed; k++) {
        const f = Math.min(1, Math.max(0, (k / GHOST_RATE - last) / span));
        p.lerpVectors(lastPosition, position, f);
        q.slerpQuaternions(lastTurn, turn, f);
        keep(p, q);
      }
      last = elapsed;
      lastPosition.copy(position);
      lastTurn.copy(turn);
    },
    track(model, way, ms, splits, saved) {
      if (!on || overflowed || turns.length < 8) return null;
      return {
        model: MODEL_ID.test(model) ? model : '',
        way,
        ms: Math.round(ms),
        saved,
        splits: splits.map((s) => Math.round(s)),
        cells: Int32Array.from(cells),
        turns: Int8Array.from(turns),
      };
    },
    stop() {
      on = false;
      cells = [];
      turns = [];
    },
  };
}

/** The lap clock against the ghost's at ring `n`, ms: negative ahead of it. Null where the ghost cannot say. */
export function splitDelta(ghost: GhostTrack | null, way: number, n: number, clockMs: number): number | null {
  if (ghost === null || ghost.way !== way) return null;
  const theirs = ghost.splits[n];
  return theirs === undefined ? null : Math.round(clockMs - theirs);
}

/** A split as the callout shows it: `−1.4 s` ahead, `+0.8 s` behind. */
export function splitText(ms: number): string {
  const tenths = Math.round(Math.abs(ms) / 100);
  if (tenths === 0) return '±0.0 s';
  return `${ms < 0 ? '−' : '+'}${(tenths / 10).toFixed(1)} s`;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** A track's samples as base64, or null where a step is too long for 16 bits. */
export function encodeTrack(track: GhostTrack): string | null {
  const n = sampleCount(track);
  const bytes = new Uint8Array(n * SAMPLE_BYTES);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const delta = i === 0 ? 0 : track.cells[i * 3 + a]! - track.cells[(i - 1) * 3 + a]!;
      if (Math.abs(delta) > INT16) return null;
      view.setInt16(i * SAMPLE_BYTES + a * 2, delta, true);
    }
    for (let a = 0; a < 4; a++) view.setInt8(i * SAMPLE_BYTES + 6 + a, track.turns[i * 4 + a]!);
  }
  return toBase64(bytes);
}

function decodeTrack(origin: readonly number[], samples: string): { cells: Int32Array; turns: Int8Array } | null {
  const bytes = fromBase64(samples);
  if (bytes === null || bytes.length === 0 || bytes.length % SAMPLE_BYTES !== 0) return null;
  const n = bytes.length / SAMPLE_BYTES;
  if (n < 2 || n > GHOST_MAX_SAMPLES) return null;
  const view = new DataView(bytes.buffer);
  const cells = new Int32Array(n * 3);
  const turns = new Int8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const previous = i === 0 ? origin[a]! : cells[(i - 1) * 3 + a]!;
      cells[i * 3 + a] = previous + view.getInt16(i * SAMPLE_BYTES + a * 2, true);
    }
    for (let a = 0; a < 4; a++) turns[i * 4 + a] = view.getInt8(i * SAMPLE_BYTES + 6 + a);
  }
  return { cells, turns };
}

/** The tracks as stored, keeping whatever of them can still be vouched for, within the caps. */
export function parseGhosts(stored: string | null | undefined): Map<string, GhostTrack> {
  const ghosts = new Map<string, GhostTrack>();
  if (typeof stored !== 'string' || stored === '') return ghosts;
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return ghosts;
  }
  if (typeof raw !== 'object' || raw === null) return ghosts;
  const all = (raw as Record<string, unknown>).g;
  if (typeof all !== 'object' || all === null || Array.isArray(all)) return ghosts;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  for (const [key, value] of Object.entries(all)) {
    if (!COURSE_KEY.test(key) || typeof value !== 'object' || value === null) continue;
    const { m, w, ms, at, s, o, p } = value as Record<string, unknown>;
    if (typeof m !== 'string' || !MODEL_ID.test(m) || (w !== 1 && w !== -1)) continue;
    if (!finite(ms) || ms < 0 || !finite(at) || at < 0) continue;
    if (!Array.isArray(s) || s.length > 256 || !s.every(finite)) continue;
    if (!Array.isArray(o) || o.length !== 3 || !o.every((v) => Number.isInteger(v) && Math.abs(v) < 2 ** 30)) continue;
    if (typeof p !== 'string' || p.length > GHOST_MAX_CHARS) continue;
    const samples = decodeTrack(o as number[], p);
    if (samples === null) continue;
    ghosts.set(key, { model: m, way: w, ms: Math.round(ms), saved: at, splits: (s as number[]).map(Math.round), ...samples });
  }
  capGhosts(ghosts);
  return ghosts;
}

/** Drops the oldest tracks past the caps; what is left, encoded. */
function capped(ghosts: Map<string, GhostTrack>): [string, GhostTrack, string][] {
  const kept: [string, GhostTrack, string][] = [];
  let chars = 0;
  const newest = [...ghosts].sort((a, b) => b[1].saved - a[1].saved || (a[0] < b[0] ? -1 : 1));
  for (const [key, track] of newest) {
    const samples = encodeTrack(track);
    if (samples === null || kept.length >= GHOST_MAX_COURSES || chars + samples.length > GHOST_MAX_CHARS) {
      ghosts.delete(key);
      continue;
    }
    chars += samples.length;
    kept.push([key, track, samples]);
  }
  return kept;
}

/** Holds the map to the caps, the newest kept. */
export function capGhosts(ghosts: Map<string, GhostTrack>): void {
  capped(ghosts);
}

/** The tracks as stored, after holding them to the caps. */
export function serialiseGhosts(ghosts: Map<string, GhostTrack>): string {
  const g: Record<string, unknown> = {};
  for (const [key, track, samples] of capped(ghosts).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    g[key] = { m: track.model, w: track.way, ms: track.ms, at: track.saved, s: track.splits, o: [track.cells[0], track.cells[1], track.cells[2]], p: samples };
  }
  return JSON.stringify({ v: 1, g });
}

/** Encoded characters of the stored tracks: what they cost the device's store. */
export function ghostChars(ghosts: Map<string, GhostTrack>): number {
  let chars = 0;
  for (const track of ghosts.values()) chars += Math.ceil((sampleCount(track) * SAMPLE_BYTES) / 3) * 4;
  return chars;
}

export function readGhosts(storage: GhostStorage | null): Map<string, GhostTrack> {
  try {
    return parseGhosts(storage?.getItem(GHOST_KEY));
  } catch {
    return new Map();
  }
}

export function writeGhosts(storage: GhostStorage | null, ghosts: Map<string, GhostTrack>): void {
  try {
    storage?.setItem(GHOST_KEY, serialiseGhosts(ghosts));
  } catch {
    // Full or blocked: the ghosts last this visit.
  }
}
