/**
 * Rings in the world (`rings/layout.ts` and `rings/courses.ts` say where):
 * a gold one high over every landmark, to collect, and courses of three kinds
 * — round a country's capital in the air, along a road out of it on land, and
 * off a port on each sea — to run in order against the clock.
 *
 * A course shows only to a craft of its kind, the nearest in reach, and only
 * its green start ring until that is passed: nothing else of it (no card, no
 * reticle, no guide, no pull on a plane) is drawn before. Passed, it runs on
 * the way it was taken (a loop either way round, a rally from its start),
 * showing the next two rings (the next one larger and beating) and the last,
 * the finish, in black and white squares. A ring through the middle is a
 * perfect and takes `PERFECT_BONUS` off the time; one passed beside is a miss
 * and the run carries on; the medal is read off the misses and the time
 * against the course's own par. Each ring strikes a bell a step higher
 * (`rings/chime.ts`); the HUD (`rings/panel.ts`) shows the run; the device
 * keeps what was collected and each course's best (`rings/store.ts`).
 */
import * as THREE from 'three';
import type { Place } from './places.ts';
import type { Road } from './roads/types.ts';
import { unitAt } from './sphere.ts';
import { SCENERY_SCALE } from './stature.ts';
import { PALETTE, createToonRamp } from './theme.ts';
import { courseAnchors } from './rings/anchors.ts';
import type { Chime } from './rings/chime.ts';
import { buildCourse, courseSites } from './rings/courses.ts';
import type { CourseKind, CourseSite, CourseWorld } from './rings/courses.ts';
import { PASS_SLACK, crossing, landmarkRing, passes, ringMatrix } from './rings/layout.ts';
import type { Ring } from './rings/layout.ts';
import type { Pip, RingPanel } from './rings/panel.ts';
import { deviceStore, lapText, readRecord, writeRecord } from './rings/store.ts';
import type { RingRecord, RingStorage } from './rings/store.ts';

export type { Ring } from './rings/layout.ts';
export type { CourseKind, CourseSite } from './rings/courses.ts';

/** How near a landmark's ring is drawn, units: past the haze on foot, inside it from the air. */
const LANDMARK_SHOW = 6000;
/** Seconds out of a craft of the course's kind, or past `COURSE_ABANDON` of its next ring, before a run is let go. */
const COURSE_LETGO = 6;
/** How far from its next ring a run may stray, units, before it counts as abandoned. */
const COURSE_ABANDON = 3200;
/** Seconds between two scans of the landmarks and the courses. */
const SCAN_EVERY = 0.5;
/** Seconds a ring flown through takes to swell and vanish. */
const POP_TIME = 0.45;
/** The most landmark rings drawn at once. */
const MAX_LANDMARK_RINGS = 6;
/** Seconds a perfect pass takes off the time. */
export const PERFECT_BONUS = 0.5;
/**
 * The speed each kind's par is set at, units a second: a little over the
 * plane's low cruise (`PLANE_CRUISE_LOW`, 140), a car's top (`CAR_SPEED`, 45)
 * less the bends, and a launch's (`BOAT_SPEED`, 30) less the turns.
 */
export const PAR_SPEED: Readonly<Record<CourseKind, number>> = { air: 150, land: 40, sea: 27 };
/** Time against par, at most, for gold (no miss) and for silver (one miss at most). */
export const GOLD_PAR = 1.2;
export const SILVER_PAR = 1.6;
/** A crossing of a course ring's plane this far from its centre, units, is a ring missed and passed by. */
export const MISS_REACH: Readonly<Record<CourseKind, number>> = { air: 650, land: 200, sea: 300 };
/** How the ring after the next is drawn, as a share of its size. */
const AFTER_NEXT = 0.82;
/** How far in from the screen's edge the reticle's arrow is held, CSS px. */
const RETICLE_MARGIN = 70;

export interface RingsOptions {
  landmarks: readonly { id: string; name: string; lat: number; lon: number }[];
  places: readonly Place[];
  /** The countries, for which have a course and what it is called. */
  countries: readonly { iso: string; name: string; rings: number[][][] }[];
  roads: readonly Road[];
  planetRadius: number;
  /** The sea's radius: no ring is hung over the water any lower than over the shore. */
  sea: number;
  groundAt: (direction: THREE.Vector3) => number;
  isWater: (ground: number) => boolean;
  chime: Chime;
  panel: RingPanel;
  storage?: RingStorage | null;
}

export interface RingsFrame {
  position: THREE.Vector3;
  /** Which kind of course the player's craft runs, or null on foot. */
  kind: CourseKind | null;
  /** Off the ground: an air course's reticle shows. */
  airborne: boolean;
  camera: THREE.PerspectiveCamera;
}

/** A ring just flown through, for whoever wants to answer it (the camera's punch). */
export interface RingPass {
  ring: Ring;
  /** How it was taken. */
  grade: 'perfect' | 'through' | 'missed';
  /** The course run to its end, or a landmark's ring collected. */
  finished: boolean;
}

/** The medal a course run earns: 3 gold, 2 silver, 1 bronze (half the rings or more), 0 none. */
export function medalFor(lapMs: number, parMs: number, missed: number, rings: number): number {
  if (missed === 0 && lapMs <= parMs * GOLD_PAR) return 3;
  if (missed <= 1 && lapMs <= parMs * SILVER_PAR) return 2;
  return rings - missed >= rings / 2 ? 1 : 0;
}

/** A course being shown: its site, its rings, and whether a run is under way and what it waits for. */
export interface ActiveCourse {
  site: CourseSite;
  rings: readonly Ring[];
  running: boolean;
  /** The ring that starts it, before a run; the next to take, during one. */
  next: Ring;
  /** Whether `next` is the finish. */
  finish: boolean;
}

export interface Rings {
  readonly group: THREE.Group;
  /** Each frame: draws what is near, and the ring flown through this frame if any. */
  update(dt: number, frame: RingsFrame): RingPass | null;
  /** The next ring of a run under way, for the guide and the assist to lead to; null before a run. */
  readonly next: Ring | null;
  /** Whether a run is under way. */
  readonly running: boolean;
  /** The course shown now, run or not. */
  readonly active: ActiveCourse | null;
  /** Every course on the planet, laid or not: for the maps and the passport. */
  readonly sites: readonly CourseSite[];
  readonly record: RingRecord;
  readonly stats: { drawn: number; landmarks: number; course: string | null; progress: number; collected: number; total: number };
  /** Lays a site's rings (cached), for the console and the check. */
  course(key?: string): readonly Ring[] | null;
  /** Forgets every ring collected and every best. */
  clear(): void;
  dispose(): void;
}

function ringMaterial(color: THREE.ColorRepresentation, glow: number): THREE.MeshToonMaterial {
  const tint = new THREE.Color(color);
  return new THREE.MeshToonMaterial({ color: tint, emissive: tint.clone().multiplyScalar(glow), gradientMap: createToonRamp(4) });
}

/** A ring's torus, round +Z with radius 1: the tube thick enough to read as a gate. */
function ringGeometry(): THREE.TorusGeometry {
  return new THREE.TorusGeometry(1, 0.11, 8, 48);
}

/** The finish: the same torus in black and white squares, two tube segments a square. */
function finishGeometry(): THREE.BufferGeometry {
  const geometry = ringGeometry();
  const tubular = 48;
  const count = geometry.attributes.position!.count;
  const colours = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    const i = v % (tubular + 1);
    const j = Math.floor(v / (tubular + 1));
    const white = (Math.floor(i / 2) + Math.floor(j / 4)) % 2 === 0;
    const c = white ? 1 : 0.06;
    colours.set([c, c, c], v * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

export function createRings(options: RingsOptions): Rings {
  const { landmarks, places, countries, planetRadius, sea, groundAt, chime, panel } = options;
  const storage = options.storage === undefined ? deviceStore() : options.storage;
  const record = readRecord(storage);
  const group = new THREE.Group();
  group.name = 'rings';
  const geometry = ringGeometry();
  const checkered = finishGeometry();
  const gold = ringMaterial(PALETTE.gold, 0.6);
  const green = ringMaterial(PALETTE.green, 0.55);
  const greenSoft = ringMaterial(new THREE.Color(PALETTE.green).lerp(new THREE.Color(PALETTE.cream), 0.45), 0.3);
  const red = ringMaterial(PALETTE.crimson, 0.4);
  const finish = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x222222, gradientMap: createToonRamp(4) });
  const pool: THREE.Mesh[] = [];
  for (let i = 0; i < MAX_LANDMARK_RINGS + 6; i++) {
    const mesh = new THREE.Mesh(geometry, gold);
    mesh.name = 'ring';
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    pool.push(mesh);
    group.add(mesh);
  }

  const units = landmarks.map((l) => unitAt(l.lat, l.lon, new THREE.Vector3()));
  const landmarkRings = new Map<string, Ring>();
  const countryNames = new Map(countries.map((c) => [c.iso, c.name]));
  const sites = courseSites(places, courseAnchors(places, countries), options.roads, (iso) => countryNames.get(iso) ?? iso);
  const world: CourseWorld = { places, roads: options.roads, planetRadius, sea, groundAt, isWater: options.isWater };
  /** Laid courses by key; null where one could not be laid. */
  const laid = new Map<string, Ring[] | null>();
  let near: number[] = [];
  /** The nearest site of each kind at the last scan, and how far off it is, units. */
  const nearestOf = new Map<CourseKind, { site: CourseSite; units: number }>();
  let sinceScan = Infinity;
  const previous = new THREE.Vector3();
  let hasPrevious = false;
  const here = new THREE.Vector3();
  const projected = new THREE.Vector3();

  /** The site shown and how the run round it stands. */
  let site: CourseSite | null = null;
  let rings: Ring[] | null = null;
  let pips: Pip[] = [];
  let progress = 0;
  let first = 0;
  let way = 1;
  let perfects = 0;
  let missed = 0;
  let started = 0;
  let away = 0;
  const popping: { ring: Ring; t: number; material: THREE.Material }[] = [];
  let time = 0;
  const stats = { drawn: 0, landmarks: 0, course: null as string | null, progress: 0, collected: record.landmarks.size, total: landmarks.length };

  function ringOf(i: number): Ring {
    const landmark = landmarks[i]!;
    let ring = landmarkRings.get(landmark.id);
    if (ring === undefined) {
      ring = landmarkRing(landmark, groundAt, sea);
      landmarkRings.set(landmark.id, ring);
    }
    return ring;
  }

  function lay(s: CourseSite): Ring[] | null {
    if (!laid.has(s.key)) laid.set(s.key, buildCourse(s, world));
    return laid.get(s.key)!;
  }

  /** The `n`th ring of the run, as an index into the course. */
  const ringAt = (n: number): number => {
    const count = rings?.length ?? 1;
    return (((first + way * n) % count) + count) % count;
  };

  /** The run's length, units, ring to ring in the order it is run: the par is read off it. */
  function runLength(course: readonly Ring[]): number {
    let length = 0;
    for (let n = 1; n < course.length; n++) length += course[ringAt(n)]!.centre.distanceTo(course[ringAt(n - 1)]!.centre);
    return length;
  }

  function scan(position: THREE.Vector3): void {
    here.copy(position).normalize();
    const cos = Math.cos(LANDMARK_SHOW / planetRadius);
    near = [];
    for (let i = 0; i < landmarks.length; i++) {
      if (record.landmarks.has(landmarks[i]!.id)) continue;
      if (units[i]!.dot(here) >= cos) near.push(i);
    }
    near.sort((a, b) => units[b]!.dot(here) - units[a]!.dot(here));
    near.length = Math.min(near.length, MAX_LANDMARK_RINGS);
    nearestOf.clear();
    for (const s of sites) {
      const distance = Math.acos(Math.min(1, s.at.dot(here))) * planetRadius;
      const held = nearestOf.get(s.kind);
      if (held === undefined || distance < held.units) nearestOf.set(s.kind, { site: s, units: distance });
    }
  }

  function reset(): void {
    progress = 0;
    first = 0;
    way = 1;
    perfects = 0;
    missed = 0;
    away = 0;
    pips = Array.from({ length: rings?.length ?? 0 }, (): Pip => 'todo');
  }

  function show(next: CourseSite | null): void {
    if (next?.key === site?.key) return;
    site = next;
    rings = next === null ? null : lay(next);
    if (rings === null) site = null;
    reset();
  }

  /** The course to show this frame, or null. */
  function chooseCourse(frame: RingsFrame, dt: number): void {
    if (progress > 0 && site !== null && rings !== null) {
      const target = rings[ringAt(progress)]!;
      if (frame.kind !== site.kind || target.centre.distanceTo(frame.position) > COURSE_ABANDON) {
        away += dt;
        if (away > COURSE_LETGO) {
          panel.callout('Course abandoned', '', 'miss', 1.4);
          show(null);
        }
      } else away = 0;
      return;
    }
    const pick = frame.kind === null ? undefined : nearestOf.get(frame.kind);
    show(pick !== undefined && pick.units < pick.site.reach ? pick.site : null);
  }

  function finishRun(course: Ring[]): void {
    const s = site!;
    const lap = Math.max(0, (time - started - perfects * PERFECT_BONUS) * 1000);
    const par = (runLength(course) / PAR_SPEED[s.kind]) * 1000;
    const medal = medalFor(lap, par, missed, course.length);
    const best = record.courses.get(s.key);
    const fresh = medal > 0 && (best === undefined || lap < best.ms);
    if (medal > 0) {
      record.courses.set(s.key, {
        ms: fresh ? Math.round(lap) : best!.ms,
        medal: Math.max(medal, best?.medal ?? 0),
        title: s.title,
        kind: s.kind,
      });
      writeRecord(storage, record);
    }
    chime.fanfare();
    panel.result({
      title: s.title,
      time: lapText(lap),
      medal,
      rings: course.length - missed,
      of: course.length,
      perfect: perfects,
      beat: fresh && best !== undefined ? lapText(best.ms) : null,
      fresh,
    });
    reset();
  }

  /** Before a run: its start ring passed either way starts it, a loop running on the way it was taken. */
  function startCourse(course: Ring[], from: THREE.Vector3, to: THREE.Vector3): RingPass | null {
    const ring = course[0]!;
    const grade = crossing(from, to, ring, PASS_SLACK, 0);
    if (grade !== 'perfect' && grade !== 'through') return null;
    first = 0;
    way = site!.loop && projected.subVectors(to, from).dot(ring.axis) < 0 ? -1 : 1;
    started = time;
    panel.callout(site!.title, `${course.length} ${site!.kind === 'air' ? 'rings' : 'gates'} · go!`, 'info', 1.8);
    return take(course, ring, grade);
  }

  /** A run under way: the next ring taken, or passed by. */
  function passCourse(course: Ring[], from: THREE.Vector3, to: THREE.Vector3): RingPass | null {
    const ring = course[ringAt(progress)]!;
    const grade = crossing(from, to, ring, PASS_SLACK, MISS_REACH[site!.kind]);
    return grade === null ? null : take(course, ring, grade);
  }

  /** Counts `ring` as the run's next, by how it was taken. */
  function take(course: Ring[], ring: Ring, grade: 'perfect' | 'through' | 'missed'): RingPass {
    if (grade === 'missed') {
      missed++;
      pips[progress] = 'missed';
      popping.push({ ring, t: 0, material: red });
      chime.miss();
      panel.callout('Missed', '', 'miss', 0.8);
    } else {
      if (grade === 'perfect') {
        perfects++;
        pips[progress] = 'perfect';
        if (progress > 0) panel.callout('Perfect!', `−${PERFECT_BONUS.toFixed(1)} s`, 'gold', 0.9);
      } else pips[progress] = 'hit';
      popping.push({ ring, t: 0, material: progress === course.length - 1 ? finish : green });
      chime.ring(progress);
    }
    progress++;
    if (progress < course.length) {
      pips[progress] = 'next';
      return { ring, grade, finished: false };
    }
    finishRun(course);
    return { ring, grade, finished: true };
  }

  function passLandmarks(from: THREE.Vector3, to: THREE.Vector3): RingPass | null {
    for (const i of near) {
      const landmark = landmarks[i]!;
      if (record.landmarks.has(landmark.id)) continue;
      const ring = ringOf(i);
      if (!passes(from, to, ring)) continue;
      record.landmarks.add(landmark.id);
      writeRecord(storage, record);
      stats.collected = record.landmarks.size;
      popping.push({ ring, t: 0, material: gold });
      chime.fanfare();
      panel.callout('Landmark ring!', `${landmark.name} · ${record.landmarks.size} of ${landmarks.length}`, 'gold', 2.2);
      near = near.filter((n) => n !== i);
      return { ring, grade: 'through', finished: true };
    }
    return null;
  }

  function draw(): void {
    let used = 0;
    const put = (ring: Ring, grow: number, material: THREE.Material, shape: THREE.BufferGeometry = geometry): void => {
      const mesh = pool[used++];
      if (mesh === undefined) return;
      ringMatrix(ring, grow, mesh.matrix);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.material = material;
      mesh.geometry = shape;
      mesh.visible = true;
    };
    const beat = 1 + 0.08 * Math.sin(time * 6);
    if (rings !== null) {
      const last = rings.length - 1;
      if (progress === 0) put(rings[0]!, beat, green);
      for (let n = progress; n > 0 && n <= Math.min(last, progress + 1); n++) {
        const isNext = n === progress;
        const ring = rings[ringAt(n)]!;
        if (n === last) put(ring, isNext ? beat : AFTER_NEXT, finish, checkered);
        else put(ring, isNext ? beat : AFTER_NEXT, isNext ? green : greenSoft);
      }
    }
    for (const i of near) put(ringOf(i), 1 + 0.04 * Math.sin(time * 2.5 + i), gold);
    for (const pop of popping) {
      const f = pop.t / POP_TIME;
      put(pop.ring, (1 + 0.6 * f) * (1 - f * f), pop.material, pop.material === finish ? checkered : geometry);
    }
    stats.drawn = used;
    for (let i = used; i < pool.length; i++) pool[i]!.visible = false;
  }

  /** The reticle over the next ring, or its arrow on the screen's edge. */
  function track(ring: Ring, frame: RingsFrame): void {
    const metres = ring.centre.distanceTo(frame.position) / SCENERY_SCALE;
    const distance = metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`;
    const camera = frame.camera;
    camera.updateMatrixWorld();
    projected.copy(ring.centre).project(camera);
    const behind = projected.z > 1;
    let x = (projected.x * 0.5 + 0.5) * innerWidth;
    let y = (0.5 - projected.y * 0.5) * innerHeight;
    if (behind) {
      x = innerWidth - x;
      y = innerHeight - y;
    }
    const inside = !behind && x > RETICLE_MARGIN && x < innerWidth - RETICLE_MARGIN && y > RETICLE_MARGIN && y < innerHeight - RETICLE_MARGIN;
    if (inside) {
      panel.track({ x, y, inside, angle: 0, distance });
      return;
    }
    const midX = innerWidth / 2;
    const midY = innerHeight / 2;
    const dx = x - midX;
    const dy = Math.abs(dx) < 1e-4 && Math.abs(y - midY) < 1e-4 ? 1 : y - midY;
    const reach = Math.min((midX - RETICLE_MARGIN) / Math.max(Math.abs(dx), 1e-6), (midY - RETICLE_MARGIN) / Math.max(Math.abs(dy), 1e-6));
    panel.track({ x: midX + dx * reach, y: midY + dy * reach, inside: false, angle: Math.atan2(dy, dx), distance });
  }

  return {
    group,
    record,
    stats,
    sites,
    get next() {
      return rings === null || progress === 0 ? null : rings[ringAt(progress)] ?? null;
    },
    get running() {
      return rings !== null && progress > 0;
    },
    get active() {
      if (site === null || rings === null) return null;
      const n = progress === 0 ? 0 : ringAt(progress);
      return { site, rings, running: progress > 0, next: rings[n]!, finish: progress === rings.length - 1 };
    },
    update(dt, frame) {
      time += dt;
      sinceScan += dt;
      if (sinceScan >= SCAN_EVERY) {
        sinceScan = 0;
        scan(frame.position);
      }
      chooseCourse(frame, dt);
      let pass: RingPass | null = null;
      if (hasPrevious) {
        if (rings !== null) pass = progress === 0 ? startCourse(rings, previous, frame.position) : passCourse(rings, previous, frame.position);
        pass ??= passLandmarks(previous, frame.position);
      }
      previous.copy(frame.position);
      hasPrevious = true;
      for (let i = popping.length - 1; i >= 0; i--) {
        popping[i]!.t += dt;
        if (popping[i]!.t >= POP_TIME) popping.splice(i, 1);
      }
      draw();

      if (site !== null && rings !== null && progress > 0) {
        const best = record.courses.get(site.key);
        panel.course({
          title: site.title,
          pips,
          clock: lapText((time - started - perfects * PERFECT_BONUS) * 1000),
          best: best === undefined ? null : { time: lapText(best.ms), medal: best.medal },
        });
        if (site.kind !== 'air' || frame.airborne) track(rings[ringAt(progress)]!, frame);
        else panel.track(null);
      } else {
        panel.course(null);
        panel.track(null);
      }

      stats.landmarks = near.length;
      stats.course = site?.key ?? null;
      stats.progress = progress;
      return pass;
    },
    course(key) {
      const s = key === undefined ? site : sites.find((c) => c.key === key) ?? null;
      return s === null ? null : lay(s);
    },
    clear() {
      record.landmarks.clear();
      record.courses.clear();
      writeRecord(storage, record);
      stats.collected = 0;
      sinceScan = Infinity;
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      checkered.dispose();
      for (const material of [gold, green, greenSoft, red, finish]) material.dispose();
    },
  };
}
