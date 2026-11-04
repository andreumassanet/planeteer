/**
 * The ghosts headless: the recorder is frame-rate free, a track survives the
 * store bit for bit, the caps hold the newest, a hostile store costs nothing
 * but its own entry, the pose interpolates, the split is plain arithmetic,
 * and a course run twice races its own first run.
 *
 *   node scripts/check-rings.ts (which imports it)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  GHOST_KEY,
  GHOST_MAX_CHARS,
  GHOST_MAX_COURSES,
  GHOST_MAX_SAMPLES,
  GHOST_QUANTUM,
  GHOST_RATE,
  createGhostRecorder,
  encodeTrack,
  ghostDuration,
  ghostPose,
  parseGhosts,
  readGhosts,
  sampleCount,
  serialiseGhosts,
  splitDelta,
  splitText,
  writeGhosts,
} from '../../src/rings/ghost.ts';
import type { GhostTrack } from '../../src/rings/ghost.ts';
import { ghostShape } from '../../src/rings/ghost-view.ts';
import { createRings } from '../../src/rings.ts';
import type { CalloutTone, CourseResult } from '../../src/rings/panel.ts';
import { decodeCountries, decodePlaces, decodeRoads, inflate } from '../../src/pack.ts';
import { unitAt } from '../../src/sphere.ts';

const R = 32000;
const centre = unitAt(40.4, -3.7, new THREE.Vector3()).multiplyScalar(R + 200);
const east = new THREE.Vector3(0, 1, 0).cross(centre).normalize();
const north = centre.clone().normalize().cross(east).normalize();

/** A wide turn at a plane's speed, rolling as it goes: the path a recorder is handed. */
function poseAt(t: number, position: THREE.Vector3, turn: THREE.Quaternion): void {
  const a = (t * 150) / 2000;
  position.copy(centre).addScaledVector(east, Math.cos(a) * 2000).addScaledVector(north, Math.sin(a) * 2000);
  turn.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), t * 0.4);
}

function record(dts: () => number, seconds: number): GhostTrack {
  const recorder = createGhostRecorder();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  poseAt(0, p, q);
  recorder.begin(p, q);
  for (let t = 0; t < seconds; ) {
    t = Math.min(seconds, t + dts());
    poseAt(t, p, q);
    recorder.step(t, p, q);
  }
  return recorder.track('light-plane', 1, seconds * 1000, [0, 1000, 2000], 1)!;
}

test('the recorder samples the same instants at any frame rate', () => {
  let seed = 7;
  const jitter = (): number => {
    seed = (seed * 16807) % 2147483647;
    return 1 / 200 + (seed / 2147483647) * (1 / 20);
  };
  const tracks = [record(() => 1 / 30, 20), record(() => 1 / 60, 20), record(() => 1 / 144, 20), record(jitter, 20)];
  const n = sampleCount(tracks[0]!);
  assert.equal(n, 20 * GHOST_RATE + 1);
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (const track of tracks) {
    assert.equal(sampleCount(track), n);
    for (let i = 0; i < n; i++) {
      poseAt(i / GHOST_RATE, p, q);
      for (let a = 0; a < 3; a++) {
        const truth = p.getComponent(a) / GHOST_QUANTUM;
        assert.ok(Math.abs(track.cells[i * 3 + a]! - truth) <= 1.01, `sample ${i} axis ${a}: ${track.cells[i * 3 + a]} against ${truth.toFixed(2)}`);
        assert.ok(Math.abs(track.cells[i * 3 + a]! - tracks[0]!.cells[i * 3 + a]!) <= 1, 'the same cell at every rate');
      }
      for (let a = 0; a < 4; a++) assert.ok(Math.abs(track.turns[i * 4 + a]! - tracks[0]!.turns[i * 4 + a]!) <= 1);
    }
  }
});

test('a track survives the store bit for bit, and a long one is not kept', () => {
  const track = record(() => 1 / 60, 30);
  const stored = serialiseGhosts(new Map([['a:123', track]]));
  const back = parseGhosts(stored).get('a:123')!;
  assert.deepEqual([...back.cells], [...track.cells]);
  assert.deepEqual([...back.turns], [...track.turns]);
  assert.deepEqual(back.splits, track.splits);
  assert.equal(back.model, 'light-plane');
  assert.equal(back.ms, 30000);
  assert.equal(serialiseGhosts(parseGhosts(stored)), stored, 'the round trip is a fixed point');
  const bytes = (sampleCount(track) * 10 * 4) / 3;
  assert.ok(stored.length < bytes + 200, `${stored.length} characters for ${sampleCount(track)} samples`);
  const recorder = createGhostRecorder();
  const p = centre.clone();
  const q = new THREE.Quaternion();
  recorder.begin(p, q);
  recorder.step(GHOST_MAX_SAMPLES / GHOST_RATE + 1, p, q);
  assert.ok(recorder.overflowed && recorder.count === GHOST_MAX_SAMPLES);
  assert.equal(recorder.track('', 1, 1, [], 0), null, 'a run past the longest kept keeps no ghost');
  // A teleport is a step past 16 bits: that track is dropped, not wrapped.
  const jump: GhostTrack = { ...track, cells: track.cells.slice() };
  jump.cells[3] = jump.cells[0]! + 40000;
  assert.equal(encodeTrack(jump), null);
});

test('the caps keep the newest courses', () => {
  const track = record(() => 1 / 60, 10);
  const many = new Map<string, GhostTrack>();
  for (let i = 0; i < GHOST_MAX_COURSES + 5; i++) many.set(`l:${i}`, { ...track, saved: 1000 + i });
  const kept = parseGhosts(serialiseGhosts(many));
  assert.equal(kept.size, GHOST_MAX_COURSES);
  assert.ok(!kept.has('l:0') && kept.has(`l:${GHOST_MAX_COURSES + 4}`), 'the oldest go first');
  const long = record(() => 1 / 60, 600);
  const big = new Map<string, GhostTrack>();
  for (let i = 0; i < 8; i++) big.set(`a:${i}`, { ...long, saved: i });
  const stored = serialiseGhosts(big);
  assert.ok(stored.length < GHOST_MAX_CHARS + 4000, `${stored.length} characters`);
  assert.ok(big.size < 8 && big.has('a:7'), `${big.size} long tracks kept, the newest among them`);
});

test('a hostile store costs nothing but its own entry', () => {
  const good = JSON.parse(serialiseGhosts(new Map([['s:baltic', record(() => 1 / 60, 5)]]))) as { g: Record<string, Record<string, unknown>> };
  const entry = good.g['s:baltic']!;
  const bad: Record<string, unknown> = {
    'x:nope': entry,
    's:a': { ...entry, p: '%%%not base64' },
    's:b': { ...entry, p: entry.p!.toString().slice(0, 7) },
    's:c': { ...entry, w: 0 },
    's:d': { ...entry, ms: -1 },
    's:e': { ...entry, o: [1, 2] },
    's:f': { ...entry, o: [1e12, 0, 0] },
    's:g': { ...entry, m: '<script>' },
    's:h': { ...entry, s: ['1'] },
    's:i': null,
    's:j': 'text',
    's:baltic': entry,
  };
  const parsed = parseGhosts(JSON.stringify({ v: 1, g: bad }));
  assert.deepEqual([...parsed.keys()], ['s:baltic']);
  for (const junk of [null, undefined, '', '{', '[]', 'null', '{"g":[]}', '{"g":5}', '"x"']) assert.equal(parseGhosts(junk).size, 0);
  const refusing = { getItem: (): string => { throw new Error('no'); }, setItem: (): void => { throw new Error('full'); } };
  assert.equal(readGhosts(refusing).size, 0);
  writeGhosts(refusing, parsed);
  writeGhosts(null, parsed);
  const memory = new Map<string, string>();
  const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  writeGhosts(store, parsed);
  assert.ok(memory.has(GHOST_KEY));
  assert.equal(readGhosts(store).size, 1);
});

test('the ghost is interpolated between its samples and held at its ends', () => {
  const track: GhostTrack = {
    model: '', way: 1, ms: 250, saved: 0, splits: [0],
    cells: Int32Array.from([0, 0, 0, 8, 16, -8, 16, 16, -8]),
    turns: Int8Array.from([0, 0, 0, 127, 0, 90, 0, 90, 0, 90, 0, 90]),
  };
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  assert.equal(ghostDuration(track), 2 / GHOST_RATE);
  assert.ok(ghostPose(track, 0.5 / GHOST_RATE, p, q));
  assert.deepEqual(p.toArray(), [0.5, 1, -0.5]);
  const half = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  assert.ok(q.angleTo(half) < 1e-6, 'the rotation is slerped');
  ghostPose(track, 1.5 / GHOST_RATE, p, q);
  assert.deepEqual(p.toArray(), [1.5, 2, -1]);
  assert.ok(ghostPose(track, -1, p, q));
  assert.deepEqual(p.toArray(), [0, 0, 0]);
  assert.equal(ghostPose(track, 10, p, q), false, 'past its end');
  assert.deepEqual(p.toArray(), [2, 2, -1], 'held at its last sample');
});

test('a split is the clock against the ghost at the same ring, the same way round', () => {
  const track = record(() => 1 / 60, 5);
  assert.equal(splitDelta(track, 1, 1, 600), -400);
  assert.equal(splitDelta(track, 1, 2, 2800), 800);
  assert.equal(splitDelta(track, -1, 1, 600), null, 'the other way round says nothing');
  assert.equal(splitDelta(track, 1, 9, 600), null);
  assert.equal(splitDelta(null, 1, 1, 600), null);
  assert.equal(splitText(-1400), '−1.4 s');
  assert.equal(splitText(820), '+0.8 s');
  assert.equal(splitText(30), '±0.0 s');
});

test('a craft model is one ghost shell, faces wound outward', () => {
  const model = {
    id: 'box',
    build: () => {
      const group = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      b.scale.set(-1, 1, 1);
      b.position.set(0, 2, 0);
      group.add(a, b);
      return group;
    },
  };
  const shell = ghostShape(model);
  assert.equal(shell.attributes.position!.count, 72);
  // The signed volume of a closed, outward shell is positive, mirrored part and all.
  const p = shell.attributes.position!;
  let volume = 0;
  const [u, v, w] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < p.count; i += 3) {
    u.fromBufferAttribute(p, i);
    v.fromBufferAttribute(p, i + 1);
    w.fromBufferAttribute(p, i + 2);
    volume += u.dot(v.cross(w)) / 6;
  }
  assert.ok(Math.abs(volume - 9) < 1e-6, `volume ${volume}`);
});

test('a course run twice races its own first run', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const countries = decodeCountries(await inflate(readFileSync(resolve(here, '../../public/data/countries.bin'))));
  const places = decodePlaces(await inflate(readFileSync(resolve(here, '../../public/data/places.bin'))));
  const roads = decodeRoads(await inflate(readFileSync(resolve(here, '../../public/data/roads.bin')))).roads;
  Object.assign(globalThis, { innerWidth: 1600, innerHeight: 900 });
  const callouts: { text: string; sub: string; tone: CalloutTone | undefined }[] = [];
  const results: CourseResult[] = [];
  const panel = {
    element: null as never,
    course: () => {},
    track: () => {},
    callout: (text: string, sub = '', tone?: CalloutTone) => void callouts.push({ text, sub, tone }),
    result: (r: CourseResult) => void results.push(r),
  };
  const chime = { ring: () => {}, fanfare: () => {}, miss: () => {} };
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  const make = () => createRings({
    landmarks: [], places, countries, roads, planetRadius: R, sea: R, groundAt: () => R + 20, isWater: (g) => g <= R + 0.5, chime, panel, storage,
  });
  const madrid = places.findIndex((p) => p.name === 'Madrid' && p.iso === 'ESP');
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 1e6);
  const start = unitAt(places[madrid]!.lat, places[madrid]!.lon, new THREE.Vector3()).multiplyScalar(R + 200);
  const model = { id: 'box', build: () => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4))) };
  /** Round the course in its own order, `wait` seconds before each ring. */
  const run = (rings: ReturnType<typeof make>, wait: (n: number) => number): void => {
    const frame = { position: start.clone(), kind: 'air' as const, airborne: true, camera, model };
    rings.update(1 / 60, frame);
    const course = rings.course()!;
    const order = [...course.keys()];
    for (const [n, i] of order.entries()) {
      const ring = course[i]!;
      frame.position.copy(ring.centre).addScaledVector(ring.axis, -20);
      for (let t = 0; t < wait(n); t += 1 / 30) rings.update(1 / 30, frame);
      frame.position.copy(ring.centre).addScaledVector(ring.axis, -8);
      rings.update(1 / 60, frame);
      frame.position.copy(ring.centre).addScaledVector(ring.axis, 8);
      rings.update(1 / 60, frame);
    }
    rings.update(1 / 60, frame);
  };
  const first = make();
  run(first, (n) => (n === 0 ? 0 : 1.4));
  assert.equal(results.length, 1);
  assert.equal(results[0]!.ghost, null, 'no ghost to race the first time');
  assert.equal(first.ghost.stored, 1, 'the first medal keeps its ghost');
  assert.ok(memory.has(GHOST_KEY) && first.ghost.chars > 0);
  assert.equal(first.ghost.playing, null);

  const second = make();
  assert.equal(second.ghost.stored, 1, 'read back off the store');
  callouts.length = 0;
  let seen = 0;
  const frame = { position: start.clone(), kind: 'air' as const, airborne: true, camera, model };
  second.update(1 / 60, frame);
  const course = second.course()!;
  // Faster at every ring after the first: the splits say so in green.
  for (const [n, ring] of course.entries()) {
    frame.position.copy(ring.centre).addScaledVector(ring.axis, -20);
    for (let t = 0; t < (n === 0 ? 0 : 0.9); t += 1 / 30) {
      second.update(1 / 30, frame);
      if (second.ghost.shown) seen++;
    }
    frame.position.copy(ring.centre).addScaledVector(ring.axis, -8);
    second.update(1 / 60, frame);
    frame.position.copy(ring.centre).addScaledVector(ring.axis, 8);
    second.update(1 / 60, frame);
    if (n === 0) assert.equal(second.ghost.playing, `a:${madrid}`, 'the ghost runs from the start ring');
  }
  assert.ok(seen > 0, 'the ghost was drawn');
  assert.equal(second.ghost.shape, null, 'and put away at the line');
  const splits = callouts.filter((c) => c.tone === 'ahead' || (c.text === 'Perfect!' && c.sub.includes('ghost')));
  assert.ok(splits.length >= course.length - 3, `${splits.length} splits called`);
  assert.ok(callouts.every((c) => c.tone !== 'behind'), 'never behind a slower ghost');
  const last = results.at(-1)!;
  assert.match(last.ghost ?? '', /^Ghost beaten by \d+\.\d s$/);
  assert.equal(last.ahead, true);
  assert.ok((second.ghost.split ?? 0) < 0);
  // The faster run is the ghost now; forgetting takes it away for good.
  const kept = parseGhosts(memory.get(GHOST_KEY)).get(`a:${madrid}`)!;
  assert.ok(kept.model === 'box' && kept.splits.length === course.length);
  assert.ok(Math.abs(kept.ms - kept.splits.at(-1)!) <= 1, 'the last split is the lap');
  assert.equal(second.forgetGhosts(), 1);
  assert.equal(make().ghost.stored, 0);
});
