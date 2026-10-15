import * as THREE from 'three';
import { HAZE_RADIUS } from './globe.ts';
import { applyPose } from './fleet.ts';
import { weatherHazeAt } from './view.ts';
import type { CraftKind, CraftModel } from './craft/contract.ts';
import { AT_REST, motionOf } from './craft/motion.ts';
import type { MotionInput } from './craft/motion.ts';
import { CAPS, FLYER_KINDS, REACH, flyerPose } from './air-traffic/flight.ts';
import type { AirSource, Flight, FlyerKind, FlyerPose } from './air-traffic/flight.ts';
import { CRUISE } from './air-traffic/airliners.ts';
import { createAirSchedule } from './air-traffic/schedule.ts';
import type { AirSchedule } from './air-traffic/schedule.ts';
import { smooth } from './air-traffic/paths.ts';
import { createFlyerPool } from './air-traffic/pool.ts';
import { createContrails } from './air-traffic/contrails.ts';
import { createNavLights } from './air-traffic/nav-lights.ts';

/**
 * What flies with nobody flying it: airliners between the great cities with
 * contrails, light aircraft flying circuits at the airstrips, helicopters
 * over big cities, balloons and the odd airship.
 *
 * Every flight is a pure function of the sky clock and the places (see
 * `air-traffic/schedule.ts`), so all clients agree and a flight that leaves
 * range and returns is where it should be. The timetable is read round the
 * player every `RESCAN_S`, and the nearest `CAPS[kind]` of each kind are
 * drawn, each its own group. Airliners use their own haze (`airlinerFar`)
 * because they fly far above the land's fog distance.
 */

export { FLYER_KINDS, REACH, CAPS, flyerPose } from './air-traffic/flight.ts';
export type { FlyerKind, FlyerPose, Flight, AirSource } from './air-traffic/flight.ts';
export { HUB_COUNT, HUB_POP, AIRLINER_EVERY, AIRLINER_SPEED, CRUISE, DEPART, HOP_MIN, HOP_MAX } from './air-traffic/airliners.ts';
export { hashUnit, hullAt } from './air-traffic/paths.ts';
export { createAirSchedule } from './air-traffic/schedule.ts';
export type { AirSchedule } from './air-traffic/schedule.ts';

/**
 * The airliners' haze, measured over the horizon of the sphere they fly on
 * (as the cloud deck's `hazeAt` is), so an airliner at cruise is visible far
 * beyond the land's fog.
 */
export function airlinerFar(altitude: number): number {
  const above = Math.max(0, altitude);
  const horizon = Math.sqrt(2 * HAZE_RADIUS * (above + CRUISE));
  return horizon * (1.05 + (above / HAZE_RADIUS) * 6) * weatherHazeAt(altitude);
}

/** What `main.ts` hands a frame. */
export interface AirFrame {
  dt: number;
  /** The sky's clock, seconds. */
  seconds: number;
  camera: THREE.Camera;
  /** The player, from the planet's centre. */
  player: THREE.Vector3;
  /** The altitude every streamer is handed. */
  altitude: number;
  /** The land's fog's far distance. */
  fogFar: number;
  /** `sky.state.daylight`, 0 night to 1 day. */
  daylight: number;
}

/** The nearest flyer of a voice, for the ear: how far, and how fast it closes. */
export interface Passing {
  distance: number;
  /** Units a second toward the listener; negative going away. */
  closing: number;
}

export interface AirTraffic {
  readonly group: THREE.Group;
  readonly schedule: AirSchedule;
  update(frame: AirFrame): void;
  /** Every drawn flyer the effects follow (light planes, helicopters, balloons), as `effects.ts`'s visitor takes them. */
  eachFlyer(visit: (object: THREE.Object3D, kind: CraftKind, model: CraftModel | null) => void): void;
  /** The nearest of each voice this frame, or null. */
  readonly passing: Record<'prop' | 'rotor' | 'jet', Passing | null>;
  enabled: boolean;
  readonly stats: {
    flights: number;
    drawn: Record<FlyerKind, number>;
    ms: number;
  };
}

export interface AirOptions {
  source: AirSource;
  /** The takeable craft: the light plane, the helicopter and the balloon are drawn from these. */
  craft: ReadonlyMap<string, CraftModel>;
}

const KIND_OF: Partial<Record<FlyerKind, CraftKind>> = { plane: 'plane', helicopter: 'helicopter', balloon: 'balloon' };
type Voice = 'prop' | 'rotor' | 'jet';
const VOICE_OF: Record<FlyerKind, Voice | null> = {
  airliner: 'jet',
  plane: 'prop',
  airship: 'prop',
  helicopter: 'rotor',
  balloon: null,
};
/**
 * The timetable is rescanned every `RESCAN_S` of wall-clock time, not sky
 * time, so a fast sky does not rescan every frame. Each scan looks `ahead`
 * over the sky time the next interval will cover (capped at `AHEAD_MAX`);
 * if the sky outruns the window, the next scan comes early.
 */
const RESCAN_S = 0.5;
const RESCAN_MOVE = 250;
const AHEAD_MAX = 60;

interface Drawn {
  flight: Flight;
  object: THREE.Group;
  key: string;
  model: CraftModel | null;
  pose: FlyerPose;
  distance: number;
  frame: number;
}

export function createAirTraffic(options: AirOptions): AirTraffic {
  const { source, craft } = options;
  const schedule = createAirSchedule(source);
  const group = new THREE.Group();
  group.name = 'air-traffic';
  const pool = createFlyerPool(group, craft);
  const contrails = createContrails();
  group.add(contrails.mesh);
  const navLights = createNavLights();
  group.add(navLights.points);

  let candidates: Flight[] = [];
  let scanAt = -Infinity;
  /** The sky seconds past `scanAt` the last scan covers, and the wall seconds since it. */
  let scanAhead = 0;
  let sinceScan = 0;
  let lastSeconds = NaN;
  const scanFrom = new THREE.Vector3(Infinity, 0, 0);
  const drawn = new Map<string, Drawn>();
  const eye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const pose = flyerPose();
  const wire: number[] = new Array(9).fill(0);
  const ranked: { flight: Flight; distance: number }[] = [];
  const counts: Record<FlyerKind, number> = { airliner: 0, plane: 0, helicopter: 0, balloon: 0, airship: 0 };
  const motionInput: MotionInput = { ...AT_REST };
  const toEye = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let frameCount = 0;

  const passing: AirTraffic['passing'] = { prop: null, rotor: null, jet: null };
  const passings: Record<Voice, Passing> = {
    prop: { distance: 0, closing: 0 },
    rotor: { distance: 0, closing: 0 },
    jet: { distance: 0, closing: 0 },
  };

  const stats: AirTraffic['stats'] = {
    flights: 0,
    drawn: { airliner: 0, plane: 0, helicopter: 0, balloon: 0, airship: 0 },
    ms: 0,
  };

  function release(entry: Drawn): void {
    pool.give(entry.object, entry.key);
  }

  function hideAll(): void {
    for (const entry of drawn.values()) release(entry);
    drawn.clear();
    contrails.clear();
    navLights.clear();
    passing.prop = passing.rotor = passing.jet = null;
  }

  /** Reads the timetable again when the interval, the sky or the player has moved past the last scan. */
  function rescan(frame: AirFrame): void {
    const { seconds } = frame;
    // The sky's pace in sky seconds a wall second; a clock run backwards has
    // no window ahead and falls back on a scan each `RESCAN_S` of sky.
    const pace = frame.dt > 0 && Number.isFinite(lastSeconds) ? (seconds - lastSeconds) / frame.dt : 1;
    lastSeconds = seconds;
    sinceScan += frame.dt;
    if (
      sinceScan > RESCAN_S ||
      seconds < scanAt - RESCAN_S ||
      seconds > scanAt + scanAhead ||
      scanFrom.distanceTo(frame.player) > RESCAN_MOVE
    ) {
      const ahead = Math.min(AHEAD_MAX, Math.max(RESCAN_S, pace * RESCAN_S * 1.5));
      candidates = schedule.flightsNear(direction, seconds, [], ahead);
      scanAt = seconds;
      scanAhead = ahead;
      sinceScan = 0;
      scanFrom.copy(frame.player);
      stats.flights = candidates.length;
    }
  }

  /** Keeps the nearest of each kind within its reach and the haze drawn, and releases the rest. */
  function choose(frame: AirFrame, skyFar: number): void {
    const { seconds } = frame;
    ranked.length = 0;
    for (const flight of candidates) {
      if (seconds < flight.from || seconds >= flight.to) continue;
      flight.pose(seconds, pose);
      if (pose.shown <= 0.001) continue;
      const distance = pose.position.distanceTo(eye);
      const far = flight.kind === 'airliner' ? skyFar : Math.min(frame.fogFar * 1.05, REACH[flight.kind] + frame.altitude);
      if (distance > far) continue;
      ranked.push({ flight, distance });
    }
    ranked.sort((a, b) => a.distance - b.distance);
    for (const kind of FLYER_KINDS) counts[kind] = 0;
    for (const { flight, distance } of ranked) {
      if (counts[flight.kind] >= CAPS[flight.kind]) continue;
      counts[flight.kind]++;
      let entry = drawn.get(flight.id);
      if (entry === undefined) {
        const got = pool.take(flight.kind, flight.variant);
        if (got === null) continue;
        entry = { flight, object: got.object, model: got.model, key: got.key, pose: flyerPose(), distance, frame: frameCount };
        drawn.set(flight.id, entry);
      }
      entry.distance = distance;
      entry.frame = frameCount;
    }
    for (const [id, entry] of drawn) {
      if (entry.frame === frameCount) continue;
      release(entry);
      drawn.delete(id);
    }
  }

  /** Records `entry` as its voice's nearest if it is nearer than the last. */
  function listen(entry: Drawn, p: FlyerPose): void {
    const voice = VOICE_OF[entry.flight.kind];
    if (voice === null || !(passing[voice] === null || entry.distance < passing[voice]!.distance)) return;
    velocity.copy(p.forward).multiplyScalar(p.speed);
    toEye.subVectors(eye, p.position);
    const out = passings[voice];
    out.distance = entry.distance;
    out.closing = entry.distance > 1e-3 ? velocity.dot(toEye) / entry.distance : 0;
    passing[voice] = out;
  }

  /** Poses one drawn flyer and turns its parts. */
  function stand(entry: Drawn, frame: AirFrame): FlyerPose {
    const { flight, object } = entry;
    const p = flight.pose(frame.seconds, entry.pose);
    wire[0] = p.position.x;
    wire[1] = p.position.y;
    wire[2] = p.position.z;
    wire[3] = p.forward.x;
    wire[4] = p.forward.y;
    wire[5] = p.forward.z;
    wire[6] = p.up.x;
    wire[7] = p.up.y;
    wire[8] = p.up.z;
    applyPose(wire, object);
    object.scale.setScalar(Math.max(0.001, p.shown));
    if (entry.model !== null && flight.kind !== 'balloon') {
      motionInput.speed = p.speed;
      motionInput.grounded = p.grounded;
      motionInput.engine = true;
      motionInput.throttle = p.climb > 0 || p.grounded ? 1 : 0.6;
      motionOf(object, entry.model).update(frame.dt, motionInput);
    }
    return p;
  }

  const traffic: AirTraffic = {
    group,
    schedule,
    passing,
    enabled: true,
    stats,
    eachFlyer(visit) {
      for (const entry of drawn.values()) {
        const kind = KIND_OF[entry.flight.kind];
        if (kind !== undefined && entry.object.visible) visit(entry.object, kind, entry.model);
      }
    },
    update(frame) {
      const began = performance.now();
      if (!traffic.enabled) {
        if (drawn.size > 0) hideAll();
        group.visible = false;
        return;
      }
      group.visible = true;
      frameCount++;
      const { seconds } = frame;
      frame.camera.getWorldPosition(eye);
      direction.copy(frame.player).normalize();
      rescan(frame);
      const skyFar = airlinerFar(frame.altitude);
      choose(frame, skyFar);

      contrails.begin();
      navLights.begin();
      passing.prop = passing.rotor = passing.jet = null;
      const night = 1 - smooth(0.25, 0.6, frame.daylight);
      const white = 0.35 + 0.65 * frame.daylight;
      for (const entry of drawn.values()) {
        const { flight, object } = entry;
        const p = stand(entry, frame);
        listen(entry, p);
        if (night > 0.01 && flight.kind !== 'balloon') navLights.add(flight, object, seconds, night, p.shown);
        if (flight.kind === 'airliner') contrails.add(flight, seconds, eye, skyFar, white);
      }
      contrails.finish();
      navLights.finish();

      for (const kind of FLYER_KINDS) stats.drawn[kind] = 0;
      for (const entry of drawn.values()) stats.drawn[entry.flight.kind]++;
      stats.ms = stats.ms * 0.9 + (performance.now() - began) * 0.1;
    },
  };
  return traffic;
}
