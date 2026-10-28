/**
 * The rings, the guide and the rush headless: a ring's layout is a pure
 * function and clears what it hangs over, a pass counts through the opening
 * and nowhere else, the record survives a damaged store, the guide's
 * chevrons are proper rotations laid ahead and towards the target on what is
 * under them, and the rush is speed over height.
 *
 *   node scripts/check-rings.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { GUIDE_PROFILES, GUIDE_STOP, AIR_FLOOR, MAX_CHEVRONS, layGuide } from '../src/guide/layout.ts';
import type { GuideMedium } from '../src/guide/layout.ts';
import { TIERS } from '../src/monuments/contract.ts';
import {
  COURSE_CLEAR,
  COURSE_GAP,
  COURSE_LOBE,
  COURSE_RINGS,
  COURSE_RISE,
  COURSE_SWING,
  MISS_REACH,
  PASS_SLACK,
  courseLength,
  crossing,
  LANDMARK_RING_RADIUS,
  PASS_LONGEST,
  courseOf,
  landmarkRing,
  passes,
  ringMatrix,
} from '../src/rings/layout.ts';
import { RINGS_KEY, emptyRecord, lapText, parseRecord, readRecord, serialiseRecord, writeRecord } from '../src/rings/store.ts';
import { GOLD_PAR, SILVER_PAR, createRings, medalFor } from '../src/rings.ts';
import type { ActiveCourse } from '../src/rings.ts';
import { rushOf } from '../src/rush.ts';
import { setRingsOn } from '../src/rings/switch.ts';
import { COURSE_MIN_AREA, countryArea, courseAnchors } from '../src/rings/anchors.ts';
import { decodeCountries, decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { LAND_SPACING, SEA_GATES, buildCourse, courseSites } from '../src/rings/courses.ts';
import { isShown } from '../src/places.ts';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unitAt } from '../src/sphere.ts';
import { CAR_SPEED, PLANE_CEILING, PLANE_ROTATE, PLANE_THROTTLE_UP, planeCruiseAt } from '../src/vehicles.ts';
import { RUN_SPEED } from '../src/avatar.ts';

const R = 32000;
/** A rolling ground over the sea, so a height read from the wrong place shows. */
const ground = (d: THREE.Vector3): number => R + 20 + 40 * Math.sin(d.x * 900) * Math.cos(d.z * 700);

test('a landmark ring hangs clear of the tallest tier, and is the same every time', () => {
  const landmark = { id: 'eiffel-tower', lat: 48.858, lon: 2.294 };
  const a = landmarkRing(landmark, ground, R);
  const b = landmarkRing(landmark, ground, R);
  assert.deepEqual(a.centre.toArray(), b.centre.toArray());
  assert.deepEqual(a.axis.toArray(), b.axis.toArray());
  const tallest = Math.max(...Object.values(TIERS).map((t) => t.height));
  const under = ground(a.centre.clone().normalize());
  assert.ok(a.centre.length() - a.radius - under > tallest + 20, 'the ring clears the tallest landmark');
  assert.equal(LANDMARK_RING_RADIUS, a.radius);
  assert.ok(Math.abs(a.axis.dot(a.centre.clone().normalize())) < 1e-9, 'the axis is level');
});

test('a course is a wide, gentle loop round its town at nearly one height', () => {
  const town = { lat: 40.4168, lon: -3.7038 };
  const built = 180;
  const flat = (): number => R + 20;
  const rings = courseOf(town, 1234, built, R, flat, R);
  assert.equal(rings.length, COURSE_RINGS);
  assert.deepEqual(rings.map((r) => r.centre.toArray()), courseOf(town, 1234, built, R, flat, R).map((r) => r.centre.toArray()));
  const up = unitAt(town.lat, town.lon, new THREE.Vector3());
  const loop = built + COURSE_GAP;
  for (const [i, ring] of rings.entries()) {
    const at = ring.centre.clone().normalize();
    const out = Math.acos(Math.min(1, at.dot(up))) * R;
    assert.ok(out >= loop * (1 - COURSE_LOBE) - 2 && out <= loop * (1 + COURSE_LOBE) + 2, `ring ${i} is ${out.toFixed(1)} out`);
    const over = ring.centre.length() - flat();
    assert.ok(Math.abs(over - COURSE_RISE) <= COURSE_SWING + 1e-6, `ring ${i} is ${over.toFixed(1)} up`);
    const next = rings[(i + 1) % rings.length]!;
    const gap = next.centre.distanceTo(ring.centre);
    assert.ok(gap > 450 && gap < 1100, `ring ${i} to the next is ${gap.toFixed(0)}`);
    assert.ok(Math.abs(next.centre.length() - ring.centre.length()) < 25, `ring ${i} to the next climbs ${(next.centre.length() - ring.centre.length()).toFixed(1)}`);
    const toward = next.centre.clone().sub(ring.centre).normalize();
    assert.ok(ring.axis.dot(toward) > 0.85, `ring ${i} faces the next (${ring.axis.dot(toward).toFixed(2)})`);
    // The turn from one ring to the next is a shallow one.
    assert.ok(Math.acos(Math.min(1, ring.axis.dot(next.axis))) < (65 * Math.PI) / 180, `ring ${i} turns too hard to the next`);
    assert.ok(ring.key === `c:1234:${i}` && ring.index === i);
  }
  // A ridge under a ring lifts that ring clear of it.
  const ridge = (d: THREE.Vector3): number => (d.distanceTo(rings[3]!.centre.clone().normalize()) * R < 60 ? R + 200 : R + 20);
  const lifted = courseOf(town, 1234, built, R, ridge, R);
  assert.ok(lifted[3]!.centre.length() - (R + 200) >= COURSE_CLEAR - 1e-6);
  assert.ok(Math.abs(courseLength(rings) - rings.reduce((sum, r, i) => sum + r.centre.distanceTo(rings[(i + 1) % rings.length]!.centre), 0)) < 1e-6);
});

test('a medal is read off the misses and the time against par', () => {
  assert.equal(medalFor(50_000, 50_000, 0, 8), 3);
  assert.equal(medalFor(50_000 * GOLD_PAR + 1, 50_000, 0, 8), 2);
  assert.equal(medalFor(50_000, 50_000, 1, 8), 2);
  assert.equal(medalFor(50_000 * SILVER_PAR + 1, 50_000, 1, 8), 1);
  assert.equal(medalFor(40_000, 50_000, 4, 8), 1);
  assert.equal(medalFor(40_000, 50_000, 5, 8), 0);
});

test('every ring is drawn with a proper rotation', () => {
  const m = new THREE.Matrix4();
  const all = [
    ...courseOf({ lat: 89.9, lon: 0 }, 7, 60, R, ground, R),
    ...courseOf({ lat: -33.9, lon: 151.2 }, 8, 225, R, ground, R),
    landmarkRing({ id: 'x', lat: -89.95, lon: 10 }, ground, R),
  ];
  for (const ring of all) {
    assert.ok(ringMatrix(ring, 1, m).determinant() > 0, ring.key);
    // The torus's +Z is the way through it.
    const z = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
    assert.ok(z.dot(ring.axis) > 0.999, `${ring.key} faces its axis`);
  }
});

test('a pass counts through the opening, either way, and nowhere else', () => {
  const ring = landmarkRing({ id: 'pass', lat: 10, lon: 20 }, ground, R);
  const { centre, axis } = ring;
  const side = new THREE.Vector3().crossVectors(axis, centre).normalize();
  const at = (along: number, off: number): THREE.Vector3 => centre.clone().addScaledVector(axis, along).addScaledVector(side, off);
  assert.ok(passes(at(-5, 0), at(5, 0), ring));
  assert.ok(passes(at(5, 3), at(-5, 3), ring), 'the other way');
  assert.ok(passes(at(-5, ring.radius + 4), at(5, ring.radius + 4), ring), 'inside the slack');
  assert.ok(!passes(at(-5, ring.radius + 12), at(5, ring.radius + 12), ring), 'wide of it');
  assert.ok(!passes(at(-5, 0), at(-1, 0), ring), 'short of it');
  assert.ok(!passes(at(0, -10), at(0, 10), ring), 'along its plane');
  assert.ok(!passes(at(-PASS_LONGEST, 0), at(PASS_LONGEST, 0), ring), 'a jump on the map');
  assert.equal(crossing(at(-5, 1), at(5, 1), ring), 'perfect');
  assert.equal(crossing(at(-5, ring.radius * 0.8), at(5, ring.radius * 0.8), ring), 'through');
  assert.equal(crossing(at(-5, 200), at(5, 200), ring), null, 'beside it, with no reach for a miss');
  assert.equal(crossing(at(-5, 200), at(5, 200), ring, PASS_SLACK, MISS_REACH), 'missed');
  assert.equal(crossing(at(-5, MISS_REACH + 10), at(5, MISS_REACH + 10), ring, PASS_SLACK, MISS_REACH), null, 'too far off to be this ring');
});

test('the record round-trips, and a damaged one keeps what it can vouch for', () => {
  const record = emptyRecord();
  record.landmarks.add('eiffel-tower').add('big-ben');
  record.courses.set('a:12', { ms: 42_345, medal: 3, title: 'Spain sky course', kind: 'air' });
  record.courses.set('s:mediterranean', { ms: 90_000, medal: 1, title: 'Mediterranean Sea race', kind: 'sea' });
  const back = parseRecord(serialiseRecord(record));
  assert.deepEqual([...back.landmarks].sort(), ['big-ben', 'eiffel-tower']);
  assert.deepEqual(back.courses.get('a:12'), { ms: 42_345, medal: 3, title: 'Spain sky course', kind: 'air' });
  assert.equal(back.courses.get('s:mediterranean')?.kind, 'sea');
  const damaged = parseRecord(JSON.stringify({
    landmarks: ['ok-one', 3, '<script>', ''],
    courses: { 'l:4': { ms: 1000, medal: 2, title: 'x' }, 'x:5': { ms: 1, medal: 1 }, 'a:6': { ms: -1, medal: 1 }, 'a:7': { ms: 5, medal: 4 }, 'a:8': 5 },
  }));
  assert.deepEqual([...damaged.landmarks], ['ok-one']);
  assert.deepEqual([...damaged.courses.keys()], ['l:4']);
  assert.equal(damaged.courses.get('l:4')?.kind, 'land');
  for (const junk of [null, '', '{', '[]', '42', 'null']) assert.equal(parseRecord(junk).landmarks.size, 0);
  const items: Record<string, string> = {};
  const storage = { getItem: (k: string) => items[k] ?? null, setItem: (k: string, v: string) => void (items[k] = v) };
  writeRecord(storage, record);
  assert.ok(items[RINGS_KEY] !== undefined);
  assert.equal(readRecord(storage).courses.get('a:12')?.ms, 42_345);
  const refusing = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
  assert.doesNotThrow(() => writeRecord(refusing, record));
  assert.equal(readRecord(refusing).landmarks.size, 0);
  assert.equal(lapText(42_345), '0:42.3');
  assert.equal(lapText(61_000), '1:01.0');
});

test('the guide lays proper chevrons ahead, towards the target, on what is under them', () => {
  const matrices = Array.from({ length: MAX_CHEVRONS }, () => new THREE.Matrix4());
  const start = unitAt(41.39, 2.17, new THREE.Vector3());
  const goalDir = unitAt(48.86, 2.29, new THREE.Vector3());
  const surfaceAt = (d: THREE.Vector3): number => Math.max(ground(d), R);
  for (const medium of ['foot', 'road', 'water', 'air'] as GuideMedium[]) {
    const profile = GUIDE_PROFILES[medium];
    const from = start.clone().multiplyScalar(surfaceAt(start) + (medium === 'air' ? 300 : 0));
    const target = goalDir.clone().multiplyScalar(surfaceAt(goalDir) + (medium === 'air' ? 90 : 0));
    const eye = from.clone().addScaledVector(start, 20);
    for (const time of [0, 0.37, 5.2]) {
      const n = layGuide({ from, target, medium, time, radius: R, surfaceAt, eye }, matrices);
      assert.ok(n > 3 && n <= MAX_CHEVRONS, `${medium}: ${n} chevrons`);
      for (let i = 0; i < n; i++) {
        const m = matrices[i]!;
        assert.ok(m.determinant() > 0, `${medium} chevron ${i} is mirrored`);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        const dir = p.clone().normalize();
        const z = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
        const toward = goalDir.clone().addScaledVector(dir, -goalDir.dot(dir)).normalize();
        assert.ok(z.dot(toward) > 0.9, `${medium} chevron ${i} points at the target`);
        const gone = Math.acos(Math.min(1, dir.dot(start))) * R;
        assert.ok(gone >= profile.from - 1e-6 && gone <= profile.to + 1e-6, `${medium} chevron ${i} is ${gone.toFixed(1)} out`);
        const over = p.length() - surfaceAt(dir);
        if (medium === 'air') assert.ok(over >= AIR_FLOOR - 1e-6, `air chevron ${i} is ${over.toFixed(1)} up`);
        else assert.ok(over >= profile.lift - 0.05 && over < profile.lift + 40, `${medium} chevron ${i} is ${over.toFixed(2)} up`);
      }
    }
  }
  // Close to the target the line stops short of it, and at it there is none.
  const near = goalDir.clone().multiplyScalar(R);
  const by = new THREE.Vector3().crossVectors(goalDir, new THREE.Vector3(0, 1, 0)).normalize();
  const from = goalDir.clone().addScaledVector(by, 40 / R).normalize().multiplyScalar(R + 20);
  const n = layGuide({ from, target: near, medium: 'foot', time: 0, radius: R, surfaceAt, eye: from }, matrices);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().setFromMatrixPosition(matrices[i]!).normalize();
    assert.ok(Math.acos(Math.min(1, p.dot(goalDir))) * R >= GUIDE_STOP - GUIDE_PROFILES.foot.size, 'stops short');
  }
  assert.equal(layGuide({ from: near.clone().multiplyScalar(1.001), target: near, medium: 'foot', time: 0, radius: R, surfaceAt, eye: from }, matrices), 0);
});

test('the rush is speed over height', () => {
  assert.equal(rushOf(RUN_SPEED, 0), 0, 'a run');
  const car = rushOf(CAR_SPEED, 0);
  assert.ok(car > 0 && car < 0.6, `a car flat out: ${car.toFixed(2)}`);
  assert.ok(rushOf(PLANE_ROTATE * 1.2, 0) > 0.9, 'a take-off run');
  const top = planeCruiseAt(PLANE_CEILING) * (1 + PLANE_THROTTLE_UP);
  assert.ok(rushOf(top, PLANE_CEILING) < 0.1, `at the ceiling flat out: ${rushOf(top, PLANE_CEILING).toFixed(2)}`);
  assert.ok(rushOf(planeCruiseAt(30), 30) > 0.15, 'low over the sea');
  assert.ok(rushOf(planeCruiseAt(8) * (1 + PLANE_THROTTLE_UP), 8) > 0.9, 'flat out, skimming it');
  assert.equal(rushOf(NaN, 0), 0);
  assert.equal(rushOf(100, NaN), 0);
});

test('one course a country big enough, round its capital', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const countries = decodeCountries(await inflate(readFileSync(resolve(here, '../public/data/countries.bin'))));
  const places = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
  const area = (iso: string): number => countryArea(countries.find((c) => c.iso === iso)!);
  // Against the published figures, km²: the outlines are simplified, so within a tenth.
  for (const [iso, real] of [['ESP', 505_990], ['DEU', 357_588], ['IRL', 70_273], ['BEL', 30_689]] as const) {
    assert.ok(Math.abs(area(iso) / real - 1) < 0.12, `${iso} is ${Math.round(area(iso))} km² against ${real}`);
  }
  const anchors = courseAnchors(places, countries);
  const isos = anchors.map((i) => places[i]!.iso);
  assert.equal(new Set(isos).size, isos.length, 'one course a country');
  assert.ok(anchors.length > 80 && anchors.length < 160, `${anchors.length} courses`);
  for (const i of anchors) {
    assert.ok(isShown(places[i]!), `${places[i]!.name} is built`);
    assert.ok(area(places[i]!.iso) >= COURSE_MIN_AREA, `${places[i]!.iso} is big enough`);
  }
  assert.ok(!isos.includes('BEL') && isos.includes('ESP') && isos.includes('IRL'));
  const madrid = anchors.find((i) => places[i]!.iso === 'ESP')!;
  assert.equal(places[madrid]!.name, 'Madrid');
});

test('a course starts at its first ring, either way, and runs on the way it was taken', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const countries = decodeCountries(await inflate(readFileSync(resolve(here, '../public/data/countries.bin'))));
  const places = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
  const roads = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin')))).roads;
  Object.assign(globalThis, { innerWidth: 1600, innerHeight: 900 });
  const shown: string[] = [];
  const panel = {
    element: null as never,
    course: (view: { pips: readonly string[] } | null) => void shown.push(view === null ? 'none' : view.pips.join(',')),
    track: () => {},
    callout: () => {},
    result: () => {},
  };
  const chime = { ring: () => {}, fanfare: () => {}, miss: () => {} };
  const rings = createRings({
    landmarks: [], places, countries, roads, planetRadius: R, sea: R, groundAt: () => R + 20, isWater: (g) => g <= R + 0.5, chime, panel, storage: null,
  });
  const madrid = places.findIndex((p) => p.name === 'Madrid' && p.iso === 'ESP');
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 1e6);
  const at = unitAt(places[madrid]!.lat, places[madrid]!.lon, new THREE.Vector3()).multiplyScalar(R + 200);
  const frame = { position: at.clone(), kind: 'air' as const, airborne: true, camera };
  rings.update(1 / 60, frame);
  assert.equal(rings.active?.site.key, `a:${madrid}`, 'the air course is shown to an aircraft near its town');
  const course = rings.course()!;
  assert.equal(course.length, COURSE_RINGS);
  const next = (): number | undefined => rings.next?.index;
  assert.equal(next(), undefined, 'nothing to lead to before a run');
  assert.equal(shown.at(-1), 'none', 'no card before a run');
  assert.equal(rings.stats.drawn, 1, 'only the start ring is drawn');
  const through = (ring: (typeof course)[number], sign: number): void => {
    frame.position.copy(ring.centre).addScaledVector(ring.axis, -8 * sign);
    rings.update(1 / 60, frame);
    frame.position.copy(ring.centre).addScaledVector(ring.axis, 8 * sign);
    rings.update(1 / 60, frame);
  };
  // Through the start against its axis: the loop runs the other way round.
  through(course[0]!, -1);
  assert.ok(rings.running, 'the run has started');
  assert.equal(next(), COURSE_RINGS - 1, 'it runs on against the course order');
  assert.equal(rings.stats.drawn, 3, 'the next two and the start popping');
  through(course[COURSE_RINGS - 1]!, -1);
  assert.equal(next(), COURSE_RINGS - 2);
  assert.match(shown.at(-1)!, /^perfect,perfect,next/);
  // Switched off: nothing shown, run or marked, and the record stays; on again, the course comes back to its start.
  const held = rings.record.courses.size;
  setRingsOn(false);
  assert.equal(rings.update(1 / 60, frame), null);
  assert.equal(rings.active, null);
  assert.equal(rings.next, null);
  assert.equal(rings.sites.length, 0, 'no marks on the maps');
  assert.ok(rings.catalogue.length > 0, 'the passport still counts against every course');
  assert.equal(shown.at(-1), 'none', 'no card');
  through(course[COURSE_RINGS - 2]!, -1);
  assert.equal(rings.running, false, 'no ring passes while off');
  assert.equal(rings.record.courses.size, held);
  setRingsOn(true);
  rings.update(1 / 60, frame);
  const back = (): ActiveCourse | null => rings.active;
  assert.ok(back() !== null && !back()!.running, 'on again: the course from its start');
  // On foot nothing is shown; a boat sees the sea's courses only.
  const sites = rings.sites;
  assert.ok(sites.filter((s) => s.kind === 'air').length > 80);
  assert.ok(sites.filter((s) => s.kind === 'sea').length >= 10);
  const land = sites.filter((s) => s.kind === 'land');
  assert.ok(land.length > 30, `${land.length} rallies`);
  for (const kind of ['air', 'sea', 'land'] as const) {
    const keys = sites.filter((s) => s.kind === kind).map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `one ${kind} course a country or sea`);
  }
});

test('a rally runs along its road out of town, and a sea race lies in open water', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const places = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
  const roads = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin')))).roads;
  const countries = decodeCountries(await inflate(readFileSync(resolve(here, '../public/data/countries.bin'))));
  const sites = courseSites(places, courseAnchors(places, countries), roads, (iso) => iso);
  const flat = (): number => R + 20;
  const world = { places, roads, planetRadius: R, sea: R, groundAt: flat, isWater: (g: number) => g <= R + 0.5 };
  let laid = 0;
  for (const site of sites.filter((s) => s.kind === 'land').slice(0, 25)) {
    const gates = buildCourse(site, world);
    if (gates === null) continue;
    laid++;
    assert.ok(gates.length >= 4, `${site.title}: ${gates.length} gates`);
    for (let i = 1; i < gates.length; i++) {
      const gap = gates[i]!.centre.distanceTo(gates[i - 1]!.centre);
      // Along one road about `LAND_SPACING`; across a town between two roads, more.
      assert.ok(gap > 40 && gap < LAND_SPACING * 6, `${site.title}: gate ${i} is ${gap.toFixed(0)} on`);
    }
    for (const gate of gates) {
      assert.ok(Math.abs(gate.centre.length() - flat()) < 1e-6, 'an arch stands on the ground');
      assert.ok(Math.abs(gate.axis.dot(gate.centre.clone().normalize())) < 1e-6, 'and faces along the ground');
    }
  }
  assert.ok(laid > 15, `${laid} rallies laid`);
  // All sea: the first candidate fits; all land: none does.
  const sea = sites.find((s) => s.key === 's:mediterranean')!;
  const wet = buildCourse(sea, { ...world, groundAt: () => R })!;
  assert.equal(wet.length, SEA_GATES);
  for (const gate of wet) assert.ok(Math.abs(gate.centre.length() - R) < 1e-6, 'a buoyed arch floats at sea level');
  assert.equal(buildCourse(sea, world), null, 'no open sea, no race');
});
