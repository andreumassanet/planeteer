/**
 * Earth's rockets: a pad beside half the airstrips, and the rocket on it.
 *
 * **Which strips keep one is a pure function of the places**, as the fleet's
 * sites are (`fleet.ts`): a town whose plane found a strip keeps a pad when
 * its index rolls under `PAD_SHARE` (`keepsRocket`, seeded by the place and
 * never by `Math.random`), and the pad stands where the first of a fixed list
 * of spots beside that strip is clear (`PAD_SPOTS`). So every client puts the
 * same pad by the same strip with nothing on the wire, and a town whose spots
 * are all taken has no rocket rather than one forced onto a road.
 *
 * **Where**: off the strip's right-hand side — the windsock stands on its
 * left (`SOCK_OFF` in `fleet.ts`) — at the middle first and then out towards
 * either end, the far side after that, behind the plane's stand, and a pad's
 * width further out last. A spot is clear when the pad's disc (`PAD_KEEP`,
 * the rocket's own `ROCKET_CLEAR`) is clear of every field the fleet keeps
 * (its own strip's discs too, which is what keeps it beside the strip rather
 * than on it), of every town's disc, road and landmark by `PAD_MARGIN` more,
 * of the railway, of the water, and far enough from every other town's strip
 * that no two pads can meet (`PAD_RIVAL`); and on ground the drum under the
 * deck can stand on (`PAD_GRADE`, `PAD_FALL`).
 *
 * **What is taken stays taken**: `PadIndex.fieldsNear` answers the pads as
 * discs, and `main.ts` joins it to the fleet's and the railway's fields
 * (`joinFields` in `rails.ts`), so the wood, the countryside and the herds
 * keep off a pad by the test they keep off an airstrip by. The railway is the
 * one thing that does not yield to a pad: `rails.bin` is baked against the
 * fleet's fields alone, so a pad keeps off the line instead.
 *
 * **The rocket is `rocket.ts`'s**, the same model, pad, tower, ignition,
 * smoke, sound, curtain and unmanned launches the other worlds stand on their
 * towns' corners. What is Earth's here is the streaming — built near the
 * player inside the frame's build allowance and dissolved in and out
 * (`fade.ts`), as the airstrips are drawn — the walls, and seating the pad on
 * the drawn land (`land-probe.ts`), a knee of grass over the highest ground
 * under it (`PAD_LIFT`).
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, groundRadius } from './globe.ts';
import { gradeAt } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { rngFrom } from './scenery/random.ts';
import { isWater } from './vehicles.ts';
import { drawnFootprint, landProbeOf } from './land-probe.ts';
import type { DrawnFootprint } from './land-probe.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { NEAR_BUILD, mayBuild } from './view.ts';
import { createFader } from './fade.ts';
import { STRIP_APPROACH, STRIP_BACK, STRIP_HALF, STRIP_LENGTH, stripPoint } from './craft/airstrip.ts';
import { FIELD_SPREAD } from './fleet.ts';
import type { FieldIndex, FieldKeepout, FleetSite, SiteIndex } from './fleet.ts';
import type { Effects } from './effects.ts';
import {
  PAD_FOOT,
  PAD_RADIUS,
  ROCKET_CLEAR,
  ROCKET_HEIGHT,
  ROCKET_REACH,
  ROCKET_WALL,
  createRocket,
  watchHeading,
} from './rocket.ts';
import type { Rocket, RocketSound } from './rocket.ts';

const DEG = Math.PI / 180;

/** The share of the towns with an airstrip that keep a rocket beside it. */
export const PAD_SHARE = 0.5;
/** Whether town `place` keeps a rocket, if its plane found a strip: a roll of its index alone. */
export const keepsRocket = (place: number): boolean => rngFrom('fleet-rocket', place).chance(PAD_SHARE);

/** The ground a pad takes, units round its centre: the pad, its tower and tank, and a margin (`ROCKET_CLEAR`). */
export const PAD_KEEP = ROCKET_CLEAR;
/**
 * How much further than `PAD_KEEP` a pad keeps off a town's disc, a road's
 * verge and a landmark: what stands just outside each — a town's edge slope
 * and the trees round it, the poles and posts beside a road.
 */
export const PAD_MARGIN = 8;
/**
 * How steep the ground under a pad may be, and how far it may fall across
 * the pad's disc (the relief's four probes `gradeAt` takes at `PAD_RADIUS`).
 * The drum under the deck reaches `PAD_FOOT` under its seat and the seat is
 * `PAD_LIFT` over the highest drawn ground, so a fall of half what is left
 * leaves the other half for the mesh, which strays up to a unit and a half
 * off the relief on a tenth of the land (`land-probe.ts`).
 */
export const PAD_GRADE = Math.tan(8 * DEG);
/**
 * A knee of grass (`grass.ts`) the deck stands over the highest drawn ground
 * under it: the grass grows on any ground the probe keeps, and a deck seated
 * flush on the high side had blades through its rim.
 */
export const PAD_LIFT = AVATAR_HEIGHT * 0.3;
export const PAD_FALL = (PAD_FOOT - PAD_LIFT) / 2;
/** How far off the strip's centre line a pad stands: just clear of its discs, then a pad further. */
const PAD_SIDES = [STRIP_HALF + PAD_KEEP + 4, STRIP_HALF + 2 * PAD_KEEP + 4] as const;
/** Where along the strip, as shares of its length: the middle first, then towards either end. */
const PAD_ALONG = [0.5, 0.35, 0.65, 0.2, 0.8] as const;
/** Behind the plane's stand, on the centre line: past the back end's disc and the pad's. */
const PAD_BEHIND = -(STRIP_BACK + STRIP_HALF + PAD_KEEP + 6);
/**
 * Every spot tried, in order, as `[along, across]` in the strip's frame
 * (across positive to its right, away from the windsock): the near side's
 * row on both sides of the strip, behind the stand, then the far row.
 */
const PAD_SPOTS: readonly (readonly [number, number])[] = [
  ...PAD_ALONG.flatMap((share) => [[share * STRIP_LENGTH, PAD_SIDES[0]], [share * STRIP_LENGTH, -PAD_SIDES[0]]] as const),
  [PAD_BEHIND, 0],
  ...PAD_ALONG.flatMap((share) => [[share * STRIP_LENGTH, PAD_SIDES[1]], [share * STRIP_LENGTH, -PAD_SIDES[1]]] as const),
];
/** The furthest a pad's centre stands from its own strip's centre line, from its back end to its approach. */
export const PAD_REACH = Math.max(PAD_SIDES[1], -PAD_BEHIND - STRIP_BACK);
/**
 * How far a pad keeps from every other strip's centre line: its own furthest
 * from its own, and two pads' ground and two units more. So two pads of two
 * towns stand at least `2 PAD_KEEP + 2` apart, by the triangle inequality,
 * without either knowing where the other is.
 */
export const PAD_RIVAL = PAD_REACH + 2 * PAD_KEEP + 2;

/** One rocket's pad: where it stands and the way it is turned. */
export interface LaunchPad {
  /** `rocket:<placeIndex>`, the same on every client. */
  id: string;
  place: number;
  /** The airstrip it stands beside. */
  strip: FleetSite;
  /** The pad's centre, a unit direction. */
  at: THREE.Vector3;
  /** The heading to hand `createRocket` (`watchHeading`): the lens that watches a launch stands towards the strip. */
  heading: THREE.Vector3;
  /** Which of `PAD_SPOTS` it took. */
  spot: number;
}

/** Why a spot was refused, for `pnpm fleet`. */
export type PadRefusal = 'field' | 'town' | 'road' | 'landmark' | 'airstrip' | 'railway' | 'water' | 'slope';

/** What the pads are a function of. */
export interface PadSource {
  world: World;
  /** The fleet's sites: the strips, the fields, the towns, roads and landmarks. */
  sites: Pick<SiteIndex, 'planesNear' | 'fieldsNear' | 'takenAt' | 'warm'>;
  /** The railway's ground, when there is a railway (`railFields`). */
  rails: Pick<FieldIndex, 'fieldsNear'> | null;
}

export interface PadIndex extends Pick<FieldIndex, 'fieldsNear'> {
  /** The pad beside a plane's strip, or null: worked out on the first ask and kept. */
  padOf(strip: FleetSite): LaunchPad | null;
  /** Every pad whose centre is within `radius` units of `direction`, appended to `out`. Pure and complete. */
  padsNear(direction: THREE.Vector3, radius: number, out: LaunchPad[]): LaunchPad[];
  /**
   * `padsNear` for the maps, which ask over a whole screen: the strips and
   * the pads not worked out yet are worked out only while `more()` says so,
   * nearest strips first (`SiteIndex.warm`), and what is left is left out.
   * True once nothing within `radius` was left, so the caller asks again
   * until it is; what it is handed is always a subset of `padsNear`'s.
   */
  padsWithin(direction: THREE.Vector3, radius: number, out: LaunchPad[], more: () => boolean): boolean;
  /** For a strip whose town keeps a rocket and found no spot: what refused each spot, in `PAD_SPOTS` order. */
  refusals(strip: FleetSite): readonly PadRefusal[] | null;
}

/** The distance from `point` to a strip's centre line, from its back end to its approach's, units. */
export function stripLineDistance(strip: Pick<FleetSite, 'at' | 'forward'>, point: THREE.Vector3): number {
  const dx = point.x - strip.at.x;
  const dy = point.y - strip.at.y;
  const dz = point.z - strip.at.z;
  const along = (dx * strip.forward.x + dy * strip.forward.y + dz * strip.forward.z) * PLANET_RADIUS;
  const square = (dx * dx + dy * dy + dz * dz) * PLANET_RADIUS * PLANET_RADIUS;
  const across = Math.sqrt(Math.max(0, square - along * along));
  const clamped = Math.max(-STRIP_BACK, Math.min(STRIP_LENGTH + STRIP_APPROACH, along));
  return Math.hypot(along - clamped, across);
}

export function createPadIndex(source: PadSource): PadIndex {
  const { world, sites, rails } = source;
  const known = new Map<string, LaunchPad | null>();
  const refused = new Map<string, PadRefusal[]>();
  const discs = new Map<LaunchPad, FieldKeepout>();
  const hits: FieldKeepout[] = [];
  const rivals: FleetSite[] = [];
  const planes: FleetSite[] = [];
  const found: LaunchPad[] = [];
  const at = new THREE.Vector3();
  const north = new THREE.Vector3();
  const across = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

  const wet = (direction: THREE.Vector3): boolean => isWater(groundRadius(world, probe.copy(direction).multiplyScalar(PLANET_RADIUS)));

  /** What refuses a pad at `at` beside `strip`, or null: the cheap tests first, the outlines last. */
  function refusal(strip: FleetSite): PadRefusal | null {
    const taken = sites.takenAt(at, PAD_KEEP + PAD_MARGIN);
    if (taken !== null) return taken;
    hits.length = 0;
    if (sites.fieldsNear(at, PAD_KEEP, hits).length > 0) return 'field';
    rivals.length = 0;
    for (const other of sites.planesNear(at, PAD_RIVAL, rivals)) {
      if (other.id !== strip.id && stripLineDistance(other, at) < PAD_RIVAL) return 'airstrip';
    }
    hits.length = 0;
    if (rails !== null && rails.fieldsNear(at, PAD_KEEP, hits).length > 0) return 'railway';
    north.set(0, 1, 0).projectOnPlane(at);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(at);
    north.normalize();
    across.crossVectors(at, north).normalize();
    gradeAt(at, across, north, PAD_RADIUS, slope);
    if (slope.grade > PAD_GRADE || slope.highest - slope.lowest > PAD_FALL) return 'slope';
    if (wet(at)) return 'water';
    for (let k = 0; k < 8; k++) {
      const bearing = (k / 8) * Math.PI * 2;
      corner
        .copy(at)
        .addScaledVector(across, (Math.sin(bearing) * PAD_KEEP) / PLANET_RADIUS)
        .addScaledVector(north, (Math.cos(bearing) * PAD_KEEP) / PLANET_RADIUS)
        .normalize();
      if (wet(corner)) return 'water';
    }
    return null;
  }

  function search(strip: FleetSite): LaunchPad | null {
    const why: PadRefusal[] = [];
    for (let spot = 0; spot < PAD_SPOTS.length; spot++) {
      const [along, side] = PAD_SPOTS[spot]!;
      stripPoint(strip, along, side, at);
      const no = refusal(strip);
      if (no !== null) {
        why.push(no);
        continue;
      }
      // The lens that watches the launch stands out over the strip, which is
      // mown and open: towards the nearest point of its centre line.
      const toward = stripPoint(strip, Math.max(0, Math.min(STRIP_LENGTH, along)), 0, new THREE.Vector3()).sub(at).projectOnPlane(at);
      if (toward.lengthSq() < 1e-14) toward.copy(strip.forward);
      toward.normalize();
      return { id: `rocket:${strip.place}`, place: strip.place, strip, at: at.clone(), heading: watchHeading(at, toward, new THREE.Vector3()).normalize(), spot };
    }
    refused.set(strip.id, why);
    return null;
  }

  function padOf(strip: FleetSite): LaunchPad | null {
    let pad = known.get(strip.id);
    if (pad === undefined) {
      pad = strip.kind === 'plane' && keepsRocket(strip.place) ? search(strip) : null;
      known.set(strip.id, pad);
    }
    return pad;
  }

  function padsNear(direction: THREE.Vector3, radius: number, out: LaunchPad[]): LaunchPad[] {
    // A pad is within `PAD_REACH` of its strip, and `planesNear`'s spread
    // reaches every strip's approach and a disc past it, which is further.
    planes.length = 0;
    for (const strip of sites.planesNear(direction, radius, planes)) {
      const pad = padOf(strip);
      if (pad !== null && pad.at.angleTo(direction) * PLANET_RADIUS < radius) out.push(pad);
    }
    return out;
  }

  function padsWithin(direction: THREE.Vector3, radius: number, out: LaunchPad[], more: () => boolean): boolean {
    if (!sites.warm(direction, radius + FIELD_SPREAD, more)) {
      // The strips are still being worked out, and `planesNear` would finish
      // them unasked: the pads already known, and nothing new.
      for (const pad of known.values()) {
        if (pad !== null && pad.at.angleTo(direction) * PLANET_RADIUS < radius) out.push(pad);
      }
      return false;
    }
    let done = true;
    planes.length = 0;
    for (const strip of sites.planesNear(direction, radius, planes)) {
      if (!known.has(strip.id) && !more()) {
        done = false;
        continue;
      }
      const pad = padOf(strip);
      if (pad !== null && pad.at.angleTo(direction) * PLANET_RADIUS < radius) out.push(pad);
    }
    return done;
  }

  return {
    padOf,
    padsNear,
    padsWithin,
    refusals: (strip) => refused.get(strip.id) ?? null,
    fieldsNear(direction, radius, out) {
      found.length = 0;
      for (const pad of padsNear(direction, radius + PAD_KEEP, found)) {
        let disc = discs.get(pad);
        if (disc === undefined) discs.set(pad, (disc = { at: pad.at, radius: PAD_KEEP }));
        out.push(disc);
      }
      return out;
    },
  };
}

// ---- the rockets standing ------------------------------------------------------

/**
 * How near a pad has to be to be built, and how far it may go before it is
 * put away, units from the player: an airstrip's reach (`STRIP_REACH` in
 * `fleet.ts`), because the rocket is the tallest thing on that field and is
 * seen with it from a climbing plane.
 */
const PAD_BUILD = 1400;
const PAD_DROP = PAD_BUILD * 1.15;
/**
 * The most rockets standing at once, the nearest: nine meshes each, eighteen
 * draws with the ink. Round Beijing ten pads are within `PAD_BUILD`
 * (2026-10-04), and the furthest of them is a speck in the haze.
 */
const MAX_STANDING = 4;
/** How far the player moves, or how long passes, before the pads near him are asked again. */
const RESCAN_MOVE = 40;
const RESCAN_SECONDS = 1;
/** Milliseconds of building a frame may give this streamer: a rocket is a few dozen meshes on shared shapes. */
const BUILD_MS = 1;
/**
 * How often a pad nobody is at launches on its own, on average, seconds a
 * pad. The worlds' is 240 with three or four pads in sight from a town; on
 * Earth one or two stand within reach at most, so half that, and a smoke
 * column goes up beyond a city every couple of minutes from a plane over it.
 */
const AUTO_LAUNCH = 120;
/** Nearer than this to the player a pad waits for him rather than launching: the worlds' `AUTO_QUIET`. */
const AUTO_QUIET = 90;
/** Under this the walls hold a body or a camera: the pad and the tower, which a launch leaves standing. */
const WALL_TOP = ROCKET_HEIGHT + AVATAR_HEIGHT * 0.5;

export interface LaunchPadsOptions {
  world: World;
  pads: PadIndex;
  /** The ramp the rockets are drawn with, as the world's toon materials are. */
  gradientMap: THREE.Texture;
  /** The land mesh, for seating a pad on what is drawn rather than on the relief. */
  land?: THREE.Mesh;
}

export interface LaunchPadsFrame {
  dt: number;
  /** Where the player is: what decides what stands, and who a pad waits for. */
  player: THREE.Vector3;
  /** Where the lens is: what the roar is heard from. */
  listener: THREE.Vector3;
  /** `Space` held, by whoever rides a rocket. */
  hold: boolean;
  effects: Effects | null;
  sound: RocketSound | null;
}

export interface LaunchPads {
  readonly group: THREE.Group;
  /** The rocket the player is in, or null. */
  readonly riding: Rocket | null;
  readonly stats: { standing: number; retiring: number; wanted: number; pending: number; launches: number; nearestMoving: number };
  /** The rockets standing, nearest first by nothing in particular: for the console. */
  standing(): Rocket[];
  /** The nearest parked rocket within `ROCKET_REACH` of `point`, with its gap (the distance less its wall), or null. */
  offer(point: THREE.Vector3): { rocket: Rocket; gap: number } | null;
  /** Gets `body` in, hiding it. */
  board(rocket: Rocket, body: THREE.Object3D): void;
  /** Out again beside the pad, before lift-off: where to stand, into `out`. False if not riding or already gone. */
  leave(out: THREE.Vector3): boolean;
  /** Streams, launches and moves them; once a frame. */
  update(frame: LaunchPadsFrame): void;
  /** While riding: the lens on the ground beside the pad. */
  frame(camera: THREE.PerspectiveCamera, dt: number): void;
  /** The pads and towers as walls, as `settlements.collide`: true and `push` the way out. */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** The same for an aircraft: anything under the tower's top. */
  collideAloft(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Whether `point` is inside a pad's tower or rocket, for the camera. */
  blocksSight(point: THREE.Vector3): boolean;
}

interface Standing {
  pad: LaunchPad;
  rocket: Rocket;
  meshes: THREE.Mesh[];
  /** Seated on the relief, the probe not having the drawn land under it yet: seated again once it has. */
  onRelief: boolean;
}

export function createLaunchPads(options: LaunchPadsOptions): LaunchPads {
  const { world, pads, gradientMap } = options;
  const group = new THREE.Group();
  group.name = 'launch-pads';
  const probe = options.land === undefined ? null : landProbeOf(options.land);
  const fader = createFader();
  const standing = new Map<string, Standing>();
  const retiring = new Set<Standing>();
  let wanted: { pad: LaunchPad; distance: number }[] = [];
  const near: LaunchPad[] = [];
  const lastScan = new THREE.Vector3(Infinity, 0, 0);
  let scanAge = Infinity;
  let riding: Standing | null = null;
  const stats = { standing: 0, retiring: 0, wanted: 0, pending: 0, launches: 0, nearestMoving: Infinity };
  const up = new THREE.Vector3();
  const north = new THREE.Vector3();
  const across = new THREE.Vector3();
  const seatAt = new THREE.Vector3();
  const ground = new THREE.Vector3();
  const footprint: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };
  const offset = new THREE.Vector3();
  const unit = new THREE.Vector3();
  const free = new THREE.Vector3();
  const freePush = new THREE.Vector3();

  /**
   * The pad's seat: `PAD_LIFT` over the highest drawn ground under the pad,
   * the drum reaching down to the rest — or, where the drawn land falls
   * further across the pad than the drum reaches, as high as the drum still
   * meets the lowest of it, the uphill rim sunk rather than a gap under the
   * downhill one. The relief's where the probe has not gathered.
   */
  let seatedOnRelief = false;
  function seatOf(pad: LaunchPad): number {
    up.copy(pad.at);
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    across.crossVectors(up, north).normalize();
    let lowest: number;
    let highest: number;
    if (probe !== null && drawnFootprint(probe, up, across, north, PAD_RADIUS, footprint) === 'drawn') {
      lowest = footprint.lowest;
      highest = footprint.highest;
      seatedOnRelief = false;
    } else {
      seatedOnRelief = true;
      // The relief's ground (`groundRadius`, the shelf and all) under the
      // middle and the same ring of eight `drawnFootprint` takes.
      lowest = highest = groundRadius(world, ground.copy(up).multiplyScalar(PLANET_RADIUS));
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        ground
          .copy(up)
          .addScaledVector(across, (Math.cos(angle) * PAD_RADIUS) / PLANET_RADIUS)
          .addScaledVector(north, (Math.sin(angle) * PAD_RADIUS) / PLANET_RADIUS)
          .normalize()
          .multiplyScalar(PLANET_RADIUS);
        const radius = groundRadius(world, ground);
        if (radius < lowest) lowest = radius;
        if (radius > highest) highest = radius;
      }
    }
    return Math.min(highest + PAD_LIFT, lowest + PAD_FOOT - 0.25);
  }

  function build(pad: LaunchPad): Standing {
    const seat = seatOf(pad);
    seatAt.copy(pad.at).multiplyScalar(seat);
    const rocket = createRocket(seatAt, pad.at, pad.heading, gradientMap);
    rocket.object.name = pad.id;
    group.add(rocket.object);
    rocket.object.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    rocket.object.traverse((object) => {
      if ((object as THREE.Mesh).isMesh === true) meshes.push(object as THREE.Mesh);
    });
    for (const mesh of meshes) fader.in(mesh);
    return { pad, rocket, meshes, onRelief: seatedOnRelief };
  }

  function retire(entry: Standing): void {
    // No more updates reach it: a roar left on would hold its last level
    // through the fade and then cut.
    entry.rocket.silence();
    retiring.add(entry);
    let left = entry.meshes.length;
    const done = (): void => {
      if (--left > 0) return;
      entry.rocket.dispose();
      retiring.delete(entry);
    };
    if (left === 0) {
      entry.rocket.dispose();
      retiring.delete(entry);
      return;
    }
    // A vehicle gone up is not among the meshes drawn: it fades as nothing.
    for (const mesh of entry.meshes) {
      if (mesh.parent === null) done();
      else fader.out(mesh, done);
    }
  }

  function scan(player: THREE.Vector3): void {
    lastScan.copy(player);
    scanAge = 0;
    near.length = 0;
    pads.padsNear(unit.copy(player).normalize(), PAD_DROP, near);
    wanted = [];
    for (const pad of near) {
      const distance = seatAt.copy(pad.at).multiplyScalar(player.length()).distanceTo(player);
      if (distance <= (standing.has(pad.id) ? PAD_DROP : PAD_BUILD)) wanted.push({ pad, distance });
    }
    wanted.sort((a, b) => a.distance - b.distance || (a.pad.id < b.pad.id ? -1 : 1));
    if (wanted.length > MAX_STANDING) wanted.length = MAX_STANDING;
    const keep = new Set(wanted.map((want) => want.pad.id));
    for (const [id, entry] of standing) {
      if (keep.has(id) || entry === riding) continue;
      standing.delete(id);
      retire(entry);
    }
  }

  /** Where `point` is against a rocket's axis: its height over the pad, and the way and distance out from the axis. */
  function against(entry: Standing, point: THREE.Vector3): number {
    const base = entry.rocket.position;
    unit.copy(base).normalize();
    offset.copy(point).sub(base);
    const height = offset.dot(unit);
    offset.addScaledVector(unit, -height);
    return height;
  }

  /**
   * The pads and their towers as walls, from a body's height under the deck
   * to the tower's top — an aircraft too, which meets nothing else of a
   * rocket's field: a disc of `ROCKET_WALL` round the rocket's axis, which
   * holds the tower, the tank and the vehicle, and leaves a step of the
   * deck's rim outside it.
   */
  function collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean {
    push.set(0, 0, 0);
    let hit = false;
    for (const entry of standing.values()) {
      const height = against(entry, point);
      if (height < -AVATAR_HEIGHT * 2 || height > WALL_TOP) continue;
      const d = offset.length();
      const min = ROCKET_WALL + radius;
      if (d >= min) continue;
      if (d > 1e-6) push.addScaledVector(offset, (min - d) / d);
      else push.add(north.set(0, 1, 0).projectOnPlane(point).setLength(min));
      hit = true;
    }
    if (hit) push.projectOnPlane(unit.copy(point).normalize());
    return hit;
  }

  return {
    group,
    stats,
    get riding() {
      return riding?.rocket ?? null;
    },
    standing: () => [...standing.values()].map((entry) => entry.rocket),
    offer(point) {
      let best: { rocket: Rocket; gap: number } | null = null;
      for (const entry of standing.values()) {
        if (entry.rocket.state !== 'parked') continue;
        const height = against(entry, point);
        if (height < -AVATAR_HEIGHT || height > AVATAR_HEIGHT * 2) continue;
        const d = offset.length();
        if (d < ROCKET_REACH && (best === null || d - ROCKET_WALL < best.gap)) best = { rocket: entry.rocket, gap: d - ROCKET_WALL };
      }
      return best;
    },
    board(rocket, body) {
      for (const entry of standing.values()) {
        if (entry.rocket !== rocket || rocket.state !== 'parked') continue;
        rocket.board(body);
        riding = entry;
        return;
      }
    },
    leave(out) {
      if (riding === null || !riding.rocket.leave(out)) return false;
      riding = null;
      return true;
    },
    update(frame) {
      const { dt, player } = frame;
      scanAge += dt;
      if (scanAge >= RESCAN_SECONDS || player.distanceTo(lastScan) > RESCAN_MOVE) scan(player);
      const began = performance.now();
      let pending = 0;
      for (const want of wanted) {
        if (standing.has(want.pad.id)) continue;
        // The land gathered a slice a frame: a pad waits for it rather than sits on the relief.
        if (pending > 0 || !mayBuild(began, BUILD_MS, want.distance < NEAR_BUILD) || (probe !== null && !probe.prepare(player))) {
          pending++;
          continue;
        }
        standing.set(want.pad.id, build(want.pad));
      }
      stats.pending = pending;
      fader.update();
      let nearestMoving = Infinity;
      for (const entry of standing.values()) {
        const rocket = entry.rocket;
        const mine = entry === riding;
        const away = rocket.position.distanceTo(player);
        if (!mine && rocket.state === 'parked' && away > AUTO_QUIET && Math.random() < dt / AUTO_LAUNCH) {
          if (rocket.autolaunch()) stats.launches++;
        }
        if (entry.onRelief && rocket.state === 'parked' && probe !== null && probe.covers(entry.pad.at)) {
          const seat = seatOf(entry.pad);
          entry.onRelief = seatedOnRelief;
          rocket.position.setLength(seat);
          rocket.object.position.copy(rocket.position);
        }
        rocket.update(dt, mine && frame.hold, frame.listener, frame.effects, frame.sound);
        if (rocket.state === 'boarded' || rocket.state === 'flying') nearestMoving = Math.min(nearestMoving, away);
      }
      stats.nearestMoving = nearestMoving;
      stats.standing = standing.size;
      stats.retiring = retiring.size;
      stats.wanted = wanted.length;
    },
    frame(camera, dt) {
      riding?.rocket.frame(camera, dt);
    },
    collide,
    collideAloft: collide,
    freeSpotNear(point, radius, out) {
      free.copy(point);
      let moved = false;
      for (let round = 0; round < 4; round++) {
        if (!collide(free, radius, freePush)) break;
        free.add(freePush.setLength(freePush.length() + 0.01)).setLength(point.length());
        moved = true;
      }
      if (moved) out.copy(free);
      return moved;
    },
    blocksSight(point) {
      for (const entry of standing.values()) {
        const height = against(entry, point);
        if (height > -1 && height < WALL_TOP && offset.length() < ROCKET_WALL) return true;
      }
      return false;
    },
  };
}
