/**
 * The people of another world, walking their towns.
 *
 * **A species is drawn as the space kit's creatures** (`CreatureCast`): one or
 * two of the pack's animated aliens — a greyling, a mushroom king, a blob, a
 * floating squid — scaled to the species' own height (`Morph.height`, against
 * the person's `AVATAR_HEIGHT`) and painted in its hides, trims and accents
 * (`kit.ts`'s `creaturePaint`), so the people of a world are one people and
 * every one of them a different coat. They play the pack's own clips, the way
 * Earth's cast and herds do: the walk timed to the ground they cover (a
 * walker's stride measured off the clip, a blob's hop, a flyer's hover), the
 * idle while they stand, now and then a wave, a nod, a jump or a dance; spoken
 * to, they stop, turn to the visitor and wave, then nod and shake their heads
 * as they talk. A species that leans (`Morph.windLean`) leans into the world's
 * wind whichever way it walks.
 *
 * **Near only, and pooled.** A town is peopled while the traveller is within
 * `CROWD_REACH` of it, its walkers animated within `ANIMATE_REACH` of the eye
 * and stood still (their last frame) past it, hidden past `SHOW_REACH`; a
 * walker put away keeps its rig in a pool by creature, repainted when it is
 * stood up again, so walking between towns allocates nothing once each
 * creature has been met.
 *
 * **Where a walker may go is the street plan and nothing else.** A town's
 * layout keeps its square and its avenues clear (`settlements.ts`), and a
 * walker moves along an avenue, round the square to the next one, or a few
 * steps off an avenue into a **pocket** — a patch of open paving beside a
 * building, found once the town is built and kept only if the straight line
 * to it from the avenue touches no wall. Every route is a straight segment
 * tested against the town's footprints, so a walker never walks through a
 * wall and needs no collision of its own.
 *
 * **Visitors at a spaceport.** A town with a landing pad (`Site.port`) has two
 * or three of the kit's crew astronauts standing round the ship that brought
 * them, unpainted: they are from elsewhere, and they are not the people a
 * traveller talks to.
 *
 * **They are spread, and the arrival is kept clear.** A town gets a few people
 * for its size rather than its population (`crowdOf`), dealt out over its
 * avenues and pockets, and never stood up inside the discs `keepClear` names
 * — where a traveller arrives, where the craft are parked — nor routed through
 * them. Who walks, in which body and which coat, is a function of the town and
 * the walker's number; where they are is a function of time since they were
 * stood up, so they are not shared between visitors (nor need to be).
 */

import * as THREE from 'three';
import type { Civilisation, WindSpec, WorldSpec } from './contract.ts';
import type { Settlements, Site } from './settlements.ts';
import { alienFor, rigAlien, standAlien } from '../system/alien.ts';
import type { AlienRig } from '../system/alien.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { rngFrom, seedOf } from '../scenery/random.ts';
import { mergeMeshes } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { WALK_SPEED } from '../avatar.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { makeRigged, paintColors } from '../models.ts';
import type { Model, Rigged } from '../models.ts';
import type { ClipRole, SpaceCreature } from '../space-kit.ts';
import { creaturePaint, worldKit } from './kit.ts';
import type { Walk } from './town-grid.ts';
import type { Coat } from './kit.ts';

/** Walkers are stood up in towns within this of the traveller, past their radius, and put away past the second. */
const CROWD_REACH = 450;
const CROWD_DROP = 650;
/** At most this many in one town. */
const CROWD_CAP = 14;
/** Past this from the eye a walker still walks but holds its last frame; past the second it is not drawn. */
const ANIMATE_REACH = 160;
const SHOW_REACH = 420;
/** How near the traveller a walker stops rather than walk into them. */
const GIVE_WAY = 2.8;
/** Crew standing at a pad. */
const VISITORS = 3;
const TAU = Math.PI * 2;

/**
 * How fast each kind covers ground at the clip's own pace, pack units a
 * second: measured off the walk clip's foot, which travels 1.09 units back
 * over a half of a one-second cycle (the humanoids, crew and walkers alike);
 * a blob's hop is about 1.6 a second; a flyer's hover carries it nowhere.
 */
const NATURAL_PACE = { crew: 2.18, walker: 2.18, blob: 1.6, flyer: 0 } as const;

/** A disc in a town's frame that nobody stands in or walks through. */
export interface KeepClear {
  x: number;
  z: number;
  r: number;
}

interface Lane {
  angle: number;
  from: number;
  to: number;
  /** Whether its inner end reaches the walk round the square. */
  ring: boolean;
}

interface Pocket {
  lane: number;
  along: number;
  x: number;
  z: number;
}

interface Plan {
  lanes: Lane[];
  pockets: Pocket[];
  /** The walk round the square, or null where the landmark leaves no room for one. */
  ring: number | null;
  half: number;
}

export interface Walker {
  key: string;
  site: Site;
  /** The walker as it stands in the world: moved and turned each frame. */
  mesh: THREE.Group;
  creature: SpaceCreature;
  rigged: Rigged;
  /** A crew member from elsewhere: stands at the pad and is not spoken to. */
  visitor: boolean;
  /** Units tall, and the scale from the pack's units. */
  height: number;
  scale: number;
  /** Where it is in the town's frame, and which way it faces. */
  x: number;
  z: number;
  yaw: number;
  lane: number;
  /** The pocket it is in or bound for, or -1. */
  pocket: number;
  /** In a grid town, the stretch of pavement it strolls end to end; null for one who stands. */
  stretch: Walk | null;
  path: { x: number; z: number }[];
  /** Seconds to stand where it is, and how long to stand once the path is walked. */
  wait: number;
  rest: number;
  speed: number;
  clock: number;
  decisions: number;
  /** Set while it is being talked to: it stands and faces this. */
  facing: THREE.Vector3 | null;
  /** Lines said so far this visit. */
  turn: number;
  /** The clip playing, its action, and until when a one-off (a wave, a nod) holds. */
  clip: string;
  action: THREE.AnimationAction | null;
  holdUntil: number;
  nextGesture: number;
  talking: boolean;
}

export interface Crowd {
  group: THREE.Group;
  walkers: readonly Walker[];
  /** Stands people up and puts them away round `player`, moves them, and animates those near `eye`. */
  update(dt: number, player: THREE.Vector3, eye?: THREE.Vector3): void;
  /** The nearest walker to a point within `reach` who can be spoken to, or null. */
  nearest(point: THREE.Vector3, reach: number): Walker | null;
  /** Where a walker's head is, in the world. */
  headOf(walker: Walker, out: THREE.Vector3): THREE.Vector3;
  readonly stats: { walkers: number; bodies: number; buildMs: number; animated: number; pooled: number };
  dispose(): void;
}

/** How many people walk a town: by its size, not its census, and never a crowd. */
export function crowdOf(civ: Civilisation, population: number): number {
  return Math.max(2, Math.min(CROWD_CAP, Math.round((civ.crowd * Math.sqrt(Math.max(1, population))) / 45)));
}

/** One member's coat, drawn from the species' hides, trims and accents. */
export function coatOf(civ: Civilisation, key: string): Coat {
  const rng = rngFrom('worlds', 'coat', civ.species.id, key);
  return { hide: rng.pick(civ.species.hides), trim: rng.pick(civ.species.trims), accent: rng.pick(civ.species.accents) };
}

/** Whether a segment from (ax, az) to (bx, bz) passes clear of every footprint by `margin`. */
function segmentClear(site: Site, ax: number, az: number, bx: number, bz: number, margin: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz || 1e-9;
  for (const f of site.footprints) {
    const t = Math.min(1, Math.max(0, ((f.x - ax) * dx + (f.z - az) * dz) / length2));
    if (Math.hypot(ax + dx * t - f.x, az + dz * t - f.z) < f.radius + margin) return false;
  }
  return true;
}

/** A point on an avenue: `along` out from the middle, `offset` across it. */
function lanePoint(lane: Lane, along: number, offset: number): { x: number; z: number } {
  return {
    x: Math.sin(lane.angle) * along + Math.cos(lane.angle) * offset,
    z: Math.cos(lane.angle) * along - Math.sin(lane.angle) * offset,
  };
}

/**
 * Where the people of a built town may walk: a lane down each avenue, cut
 * short where a keep-clear disc sits on it; the walk round the square if the
 * landmark leaves room; and pockets beside the buildings.
 */
function planOf(spec: WorldSpec, site: Site, keep: readonly KeepClear[]): Plan {
  const half = site.avenueHalf;
  const landmark = site.footprints.find((f) => Math.hypot(f.x, f.z) < 0.5)?.radius ?? 0;
  // The walk round the square keeps a body's width off the landmark inside
  // it and off the nearest wall outside it, or there is none.
  let edge = Infinity;
  for (const f of site.footprints) if (Math.hypot(f.x, f.z) >= 0.5) edge = Math.min(edge, Math.hypot(f.x, f.z) - f.radius);
  const ringR = Math.min(site.plaza - 3, edge - 1.8);
  const ring = ringR >= landmark + 2.5 && ringR > 2 ? ringR : null;
  const lanes: Lane[] = [];
  for (const angle of site.avenues) {
    let from = (ring ?? landmark + 1.5) + 1.5;
    let to = site.paving - 6;
    let reaches = ring !== null;
    for (const disc of keep) {
      const along = disc.x * Math.sin(angle) + disc.z * Math.cos(angle);
      const off = Math.abs(disc.x * Math.cos(angle) - disc.z * Math.sin(angle));
      if (along < 0 || off > half + disc.r) continue;
      if (along < (from + to) / 2) {
        from = Math.max(from, along + disc.r);
        reaches = false;
      } else to = Math.min(to, along - disc.r);
    }
    if (to - from >= 4) lanes.push({ angle, from, to, ring: reaches });
  }
  const pockets: Pocket[] = [];
  const rng = rngFrom('worlds', spec.id, 'pockets', site.id);
  const buildings = site.footprints.filter((f) => Math.hypot(f.x, f.z) >= 0.5 && f.radius > 2.5);
  for (let attempt = 0; attempt < 70 && pockets.length < 10 && buildings.length > 0 && lanes.length > 0; attempt++) {
    const f = buildings[rng.int(buildings.length)]!;
    const a = rng.range(0, TAU);
    const x = f.x + Math.sin(a) * (f.radius + 3.2);
    const z = f.z + Math.cos(a) * (f.radius + 3.2);
    const d = Math.hypot(x, z);
    if (d > site.paving - 2.5 || d < site.plaza + 1) continue;
    if (site.footprints.some((g) => Math.hypot(g.x - x, g.z - z) < g.radius + 2.2)) continue;
    if (keep.some((disc) => Math.hypot(disc.x - x, disc.z - z) < disc.r + 2)) continue;
    if (pockets.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    // The lane it opens off: the nearest whose avenue it can be walked to straight.
    let best = -1;
    let bestOff = Infinity;
    let bestAlong = 0;
    lanes.forEach((lane, k) => {
      const along = x * Math.sin(lane.angle) + z * Math.cos(lane.angle);
      const off = Math.abs(x * Math.cos(lane.angle) - z * Math.sin(lane.angle));
      if (along < lane.from + 1 || along > lane.to - 1 || off >= bestOff) return;
      const q = lanePoint(lane, along, 0);
      if (!segmentClear(site, x, z, q.x, q.z, 1.1)) return;
      best = k;
      bestOff = off;
      bestAlong = along;
    });
    if (best >= 0 && bestOff < 30) pockets.push({ lane: best, along: bestAlong, x, z });
  }
  return { lanes, pockets, ring, half };
}

/** The shortest turn from `a` to `b`, radians. */
const turnTo = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function createCrowd(
  spec: WorldSpec,
  settlements: Settlements,
  _ctx: SceneryContext,
  gradientMap: THREE.Texture,
  keepClear: (site: Site) => readonly KeepClear[] = () => [],
): Crowd {
  const group = new THREE.Group();
  group.name = 'world-crowd';
  const civ = spec.civilisation;
  const cast = civ?.cast;
  const stats = { walkers: 0, bodies: 0, buildMs: 0, animated: 0, pooled: 0 };
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.name = 'world:aliens';
  // Inked along the welded normals, as the cast is.
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01], outlineNormal: true };
  const windLean = civ?.species.morph.windLean ?? 0;
  const wind: WindSpec | null = spec.wind;
  /** Upwind, in a town's frame (+X west, +Z north). */
  const upwind = wind === null ? null : { x: Math.sin((wind.toward * Math.PI) / 180), z: -Math.cos((wind.toward * Math.PI) / 180) };

  const walkers: Walker[] = [];
  const plans = new Map<string, Plan>();
  const peopled = new Set<string>();
  /** Rigs put away, by creature id, to stand up again. */
  const pool = new Map<string, Rigged[]>();
  const turn = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const leanEuler = new THREE.Euler();
  const UP = new THREE.Vector3(0, 1, 0);
  const local = new THREE.Vector3();
  const near = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  /** A rig of `creature` painted in `coat` (or the pack's own colours brought onto the palette). */
  function rigOf(creature: SpaceCreature, coat: Coat | null): Rigged {
    const id = creature.entry.id;
    const paint = creaturePaint(id, coat);
    const spare = pool.get(id)?.pop();
    if (spare !== undefined) {
      stats.pooled--;
      const colors = spare.body.geometry.getAttribute('color') as THREE.BufferAttribute;
      (colors.array as Float32Array).set(paintColors(creature.rig as unknown as Model, paint));
      colors.needsUpdate = true;
      spare.mixer.stopAllAction();
      return spare;
    }
    const rigged = makeRigged(creature.rig, paint);
    rigged.body.material = material;
    rigged.body.castShadow = true;
    return rigged;
  }

  /** Stands a walker up: its rig, its scale, the clip it starts on. */
  function standUp(site: Site, key: string, creature: SpaceCreature, coat: Coat | null, height: number, visitor: boolean, at: { x: number; z: number }, yaw: number, speed: number): Walker {
    const rigged = rigOf(creature, coat);
    const holder = new THREE.Group();
    holder.name = `alien ${key}`;
    const scale = height / creature.height;
    rigged.root.scale.setScalar(scale);
    rigged.root.rotation.set(0, 0, 0);
    holder.add(rigged.root);
    group.add(holder);
    const rng = rngFrom('worlds', 'walker-clock', key);
    const walker: Walker = {
      key,
      site,
      mesh: holder,
      creature,
      rigged,
      visitor,
      height,
      scale,
      x: at.x,
      z: at.z,
      yaw,
      lane: 0,
      pocket: -1,
      stretch: null,
      path: [],
      wait: rng.range(0.5, 5),
      rest: 0,
      speed,
      clock: rng.range(0, 100),
      decisions: 0,
      facing: null,
      turn: 0,
      clip: '',
      action: null,
      holdUntil: 0,
      nextGesture: rng.range(3, 12),
      talking: false,
    };
    play(walker, 'idle', 0);
    // Not all in step: each starts its idle somewhere in the loop.
    walker.rigged.mixer.setTime(rng.range(0, 2));
    return walker;
  }

  /** Plays the clip for `role`, crossfading from what was playing; a one-off holds until it is done. */
  function play(w: Walker, role: ClipRole, fade = 0.25, once = false): void {
    const clip = w.creature.clipFor(role);
    if (clip === null) return;
    const action = w.rigged.actions.get(clip.name);
    if (action === undefined) return;
    if (w.action === action && !once) return;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();
    if (w.action !== null && w.action !== action && fade > 0) action.crossFadeFrom(w.action, fade, false);
    else if (w.action !== null && w.action !== action) w.action.stop();
    w.action = action;
    w.clip = role;
    w.holdUntil = once ? w.clock + clip.duration * 0.96 : 0;
  }

  /**
   * **A grid town is peopled as Earth's towns are** (`folk.ts`): most stroll
   * a stretch of pavement end to end and back, one stroller a stretch so
   * nobody walks in a queue; some stand in pairs turned to each other,
   * talking; the rest stand on the pavement by a door. Nobody starts inside a
   * keep-clear disc or a wall, nor within a body of anybody else.
   */
  function peopleGrid(site: Site, keep: readonly KeepClear[], choices: readonly { item: string; weight: number }[], base: number): void {
    const kit = worldKit()!;
    const town = site.town!;
    const rng = rngFrom('worlds', spec.id, 'grid-people', site.id);
    const free = (x: number, z: number, room: number): boolean =>
      !keep.some((disc) => Math.hypot(disc.x - x, disc.z - z) < disc.r) &&
      !site.footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.radius + room) &&
      !walkers.some((other) => other.site === site && Math.hypot(other.x - x, other.z - z) < room * 2 + 1.2);
    // The stretches clear of every wall along their length, the longest first.
    const stretches = town.walks
      .filter((one) => Math.hypot(one.bx - one.ax, one.bz - one.az) > 5 && segmentClear(site, one.ax, one.az, one.bx, one.bz, 0.5))
      .map((one) => ({ one, order: rng.unit() }))
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.one);
    const count = Math.min(crowdOf(civ!, site.population) + 4, CROWD_CAP + 6, Math.max(2, Math.round(stretches.length * 0.9)));
    let next = 0;
    let made = 0;
    const make = (n: number, at: { x: number; z: number }, yaw: number, stretch: Walk | null): Walker | null => {
      const key = `${site.id}:${n}`;
      const pick = rngFrom('worlds', spec.id, 'walker', key);
      const creature = kit.creatures.get(pick.weighted(choices))!;
      const height = base * pick.range(0.92, 1.06);
      const blob = creature.entry.kind === 'blob';
      const speed = WALK_SPEED * pick.range(0.42, 0.6) * (blob ? 0.75 : 1) * Math.min(1.4, Math.max(0.7, height / 4.5));
      const w = standUp(site, key, creature, coatOf(civ!, key), height, false, at, yaw, speed);
      w.stretch = stretch;
      walkers.push(w);
      return w;
    };
    for (let n = 0; n < count && next < stretches.length; n++) {
      const s = stretches[next++]!;
      const roll = rng.unit();
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const length = Math.hypot(dx, dz);
      const t = rng.range(0.15, 0.85);
      const at = { x: s.ax + dx * t, z: s.az + dz * t };
      if (!free(at.x, at.z, 0.7)) continue;
      const along = Math.atan2(dx, dz);
      if (roll < 0.58) {
        make(made++, at, along + (rng.chance(0.5) ? 0 : Math.PI), s);
      } else if (roll < 0.82 && length > 6) {
        // A pair, a step and a half apart along the pavement, face to face.
        const gap = 0.85 + base * 0.12;
        const a = { x: at.x - (dx / length) * gap, z: at.z - (dz / length) * gap };
        const b = { x: at.x + (dx / length) * gap, z: at.z + (dz / length) * gap };
        if (!free(a.x, a.z, 0.6) || !free(b.x, b.z, 0.6)) continue;
        const one = make(made++, a, along, null);
        const two = make(made++, b, along + Math.PI, null);
        for (const w of [one, two]) if (w !== null) w.wait = Infinity;
      } else {
        // Standing by a door: on the pavement, turned to the street.
        const w = make(made++, at, along + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1), null);
        if (w !== null) w.wait = Infinity;
      }
    }
  }

  function people(site: Site): boolean {
    if (civ === null || cast === undefined || site.landmark) return true;
    const kit = worldKit();
    if (kit === null) return false;
    const choices = cast.creatures.filter((one) => kit.creatures.has(one.item));
    if (choices.length === 0) return false;
    const began = performance.now();
    const keep = keepClear(site);
    const base = civ.species.morph.height;
    if (site.town !== null) peopleGrid(site, keep, choices, base);
    const plan = site.town !== null ? null : planOf(spec, site, keep);
    if (plan !== null) plans.set(site.id, plan);
    if (plan !== null && plan.lanes.length > 0) {
      const count = Math.min(crowdOf(civ, site.population), plan.lanes.length * 3 + plan.pockets.length);
      const placed: { x: number; z: number }[] = [];
      for (let n = 0; n < count; n++) {
        const key = `${site.id}:${n}`;
        const rng = rngFrom('worlds', spec.id, 'walker', key);
        const creature = kit.creatures.get(rng.weighted(choices))!;
        // Dealt round the avenues in turn, so no two start on one while
        // another is empty; a third or so start in a pocket.
        let lane = n % plan.lanes.length;
        let pocket = -1;
        let at = { x: 0, z: 0 };
        let found = false;
        for (let attempt = 0; attempt < 24 && !found; attempt++) {
          const free = plan.pockets.map((_, k) => k).filter((k) => !placed.some((q) => Math.hypot(q.x - plan.pockets[k]!.x, q.z - plan.pockets[k]!.z) < 3));
          if (free.length > 0 && rng.chance(0.35)) {
            pocket = free[rng.int(free.length)]!;
            lane = plan.pockets[pocket]!.lane;
            at = { x: plan.pockets[pocket]!.x, z: plan.pockets[pocket]!.z };
          } else {
            pocket = -1;
            const L = plan.lanes[lane]!;
            at = lanePoint(L, rng.range(L.from, L.to), rng.range(-plan.half + 1.2, plan.half - 1.2));
          }
          found = !placed.some((q) => Math.hypot(q.x - at.x, q.z - at.z) < 3.5) && !keep.some((disc) => Math.hypot(disc.x - at.x, disc.z - at.z) < disc.r);
          if (!found) lane = rng.int(plan.lanes.length);
        }
        if (!found) continue;
        placed.push(at);
        const height = base * rng.range(0.9, 1.08);
        const blob = creature.entry.kind === 'blob';
        const speed = WALK_SPEED * rng.range(0.4, 0.62) * (blob ? 0.75 : 1) * Math.min(1.4, Math.max(0.7, height / 4.5));
        const w = standUp(site, key, creature, coatOf(civ, key), height, false, at, rng.range(0, TAU), speed);
        w.lane = lane;
        w.pocket = pocket;
        walkers.push(w);
      }
    }
    // The crew at a spaceport, round the ship, facing it or the town.
    const port = site.port;
    const crew = (cast.visitors ?? []).filter((id) => kit.creatures.has(id));
    if (port !== null && crew.length > 0) {
      for (let n = 0; n < VISITORS; n++) {
        const key = `${site.id}:crew:${n}`;
        const rng = rngFrom('worlds', spec.id, 'crew', key);
        // Round the pad's rim, and further round it where the ship or a
        // beacon stands in the way.
        let at: { x: number; z: number } | null = null;
        let a = 0;
        for (let step = 0; step < 24 && at === null; step++) {
          a = port.yaw + Math.PI * 0.5 + (n - 1) * 0.55 + step * 0.52 + rng.jitter() * 0.1;
          // On the rim, or just off it on a pad the ship fills.
          const d = step < 12 ? Math.max(2.5, port.r - 2.4) : port.r + 1.2;
          const spot = { x: port.x + Math.sin(a) * d, z: port.z + Math.cos(a) * d };
          if (!site.footprints.some((f) => Math.hypot(f.x - spot.x, f.z - spot.z) < f.radius + 0.8)) at = spot;
        }
        if (at === null) continue;
        const creature = kit.creatures.get(crew[(Math.abs(seedOf(key)) + n) % crew.length]!)!;
        // Turned to each other and to the town by turns.
        const yaw = n === 1 ? Math.atan2(-at.x, -at.z) : a + Math.PI + rng.jitter() * 0.6;
        const w = standUp(site, key, creature, null, AVATAR_HEIGHT * rng.range(0.96, 1.04), true, at, yaw, 0);
        w.wait = Infinity;
        walkers.push(w);
      }
    }
    stats.buildMs = performance.now() - began;
    return true;
  }

  function release(w: Walker): void {
    group.remove(w.mesh);
    w.mesh.remove(w.rigged.root);
    w.rigged.mixer.stopAllAction();
    const id = w.creature.entry.id;
    const list = pool.get(id) ?? [];
    list.push(w.rigged);
    pool.set(id, list);
    stats.pooled++;
  }

  function unpeople(site: Site): void {
    for (let k = walkers.length - 1; k >= 0; k--) {
      const w = walkers[k]!;
      if (w.site !== site) continue;
      release(w);
      walkers.splice(k, 1);
    }
    peopled.delete(site.id);
    plans.delete(site.id);
  }

  /** What a walker does next, once it has stood its time. */
  function decide(w: Walker): void {
    if (w.stretch !== null) {
      // To the far end of its stretch, or now and then a point along it,
      // and a pause there: Earth's stroll (`folk.ts`).
      const rng = rngFrom('worlds', 'stroll', w.key, w.decisions++);
      const s = w.stretch;
      const nearA = Math.hypot(w.x - s.ax, w.z - s.az) < Math.hypot(w.x - s.bx, w.z - s.bz);
      const t = rng.chance(0.7) ? (nearA ? 1 : 0) : rng.range(0.2, 0.8);
      w.path = [{ x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t }];
      w.rest = rng.range(2, 9);
      return;
    }
    const plan = plans.get(w.site.id);
    if (plan === undefined || plan.lanes.length === 0 || w.visitor) return;
    const rng = rngFrom('worlds', 'walk', w.key, w.decisions++);
    const lane = plan.lanes[w.lane]!;
    const offset = (): number => rng.range(-plan.half + 1.2, plan.half - 1.2);
    if (w.pocket >= 0) {
      // Back out of a pocket the way it came.
      const p = plan.pockets[w.pocket]!;
      w.path = [lanePoint(plan.lanes[p.lane]!, p.along, offset())];
      w.lane = p.lane;
      w.pocket = -1;
      w.rest = rng.range(0.3, 1.5);
      return;
    }
    const roll = rng.unit();
    const here = plan.pockets.map((p, k) => (p.lane === w.lane ? k : -1)).filter((k) => k >= 0);
    const others = plan.lanes.map((L, k) => (k !== w.lane && L.ring ? k : -1)).filter((k) => k >= 0);
    if (roll < 0.3 && here.length > 0) {
      const k = here[rng.int(here.length)]!;
      const p = plan.pockets[k]!;
      w.path = [lanePoint(lane, p.along, offset()), { x: p.x, z: p.z }];
      w.pocket = k;
      w.rest = rng.range(4, 11);
    } else if (roll < 0.55 && plan.ring !== null && lane.ring && others.length > 0) {
      // Round the square to another avenue, the short way.
      const next = others[rng.int(others.length)]!;
      const target = plan.lanes[next]!;
      const path = [lanePoint(lane, lane.from, 0)];
      const sweep = turnTo(lane.angle, target.angle);
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / 0.3));
      for (let k = 0; k <= steps; k++) {
        const a = lane.angle + (sweep * k) / steps;
        path.push({ x: Math.sin(a) * plan.ring, z: Math.cos(a) * plan.ring });
      }
      path.push(lanePoint(target, target.from, 0), lanePoint(target, rng.range(target.from, target.to), offset()));
      w.path = path;
      w.lane = next;
      w.rest = rng.range(1, 5);
    } else {
      w.path = [lanePoint(lane, rng.range(lane.from, lane.to), offset())];
      w.rest = rng.range(1.5, 6);
    }
  }

  /** How much room a body keeps round it, units: a share of its height, never under a person's shoulders. */
  const roomOf = (w: Walker): number => Math.max(AVATAR_HEIGHT * 0.22, w.height * 0.24);

  /**
   * Whether another walker of the same town stands in the way along
   * (`dx`, `dz`): nearer than both their rooms and a step, and in front.
   * The one further along gives way to nobody, so two never wait for each
   * other for ever: of a pair facing, the lower index goes first.
   */
  function someoneAhead(w: Walker, dx: number, dz: number): boolean {
    const length = Math.hypot(dx, dz) || 1;
    for (const other of walkers) {
      if (other === w || other.site !== w.site) continue;
      const ox = other.x - w.x;
      const oz = other.z - w.z;
      const gap = Math.hypot(ox, oz);
      if (gap > roomOf(w) + roomOf(other) + 0.9) continue;
      const ahead = (ox * dx + oz * dz) / length;
      if (ahead <= 0.05) continue;
      // Face to face: one of the two steps aside rather than both stopping.
      const facing = other.path.length > 0 && (other.path[0]!.x - other.x) * -ox + (other.path[0]!.z - other.z) * -oz > 0;
      if (facing && walkers.indexOf(w) < walkers.indexOf(other)) continue;
      return true;
    }
    return false;
  }

  /** Two bodies that ended up inside each other are eased apart, a little a frame. */
  function separate(dt: number): void {
    for (let i = 0; i < walkers.length; i++) {
      const a = walkers[i]!;
      for (let j = i + 1; j < walkers.length; j++) {
        const b = walkers[j]!;
        if (a.site !== b.site) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const gap = Math.hypot(dx, dz);
        const room = roomOf(a) + roomOf(b);
        if (gap >= room) continue;
        const push = Math.min(room - gap, dt * 2) / 2;
        const ux = gap > 1e-4 ? dx / gap : 1;
        const uz = gap > 1e-4 ? dz / gap : 0;
        a.x -= ux * push;
        a.z -= uz * push;
        b.x += ux * push;
        b.z += uz * push;
      }
    }
  }

  /** Moves a walker along its path, or keeps it still, in the town's frame. */
  function step(w: Walker, dt: number, player: THREE.Vector3 | null): number {
    let wanted = w.yaw;
    let travelled = 0;
    if (w.facing !== null) {
      // Spoken to: stand, and turn to face the visitor.
      local.copy(w.facing).sub(w.site.origin).applyQuaternion(inverse.copy(w.site.quaternion).invert());
      wanted = Math.atan2(local.x - w.x, local.z - w.z);
      w.wait = Math.max(w.wait, 1.5);
    } else if (w.path.length > 0) {
      const target = w.path[0]!;
      const dx = target.x - w.x;
      const dz = target.z - w.z;
      const distance = Math.hypot(dx, dz);
      wanted = Math.atan2(dx, dz);
      // Give way: the traveller ahead and near, or another of the town's
      // people, and it waits — nobody walks into anybody.
      const blocked =
        (player !== null &&
          Math.hypot(player.x - w.x, player.z - w.z) < GIVE_WAY + w.height * 0.15 &&
          (player.x - w.x) * dx + (player.z - w.z) * dz > 0) ||
        someoneAhead(w, dx, dz);
      if (!blocked && w.holdUntil <= w.clock) {
        // It walks once it is roughly facing the way: a body turns before it steps off.
        const facing = Math.cos(turnTo(w.yaw, wanted));
        const move = Math.min(distance, w.speed * dt * Math.max(0, facing));
        if (distance > 1e-6) {
          w.x += (dx / distance) * move;
          w.z += (dz / distance) * move;
        }
        travelled = move;
        if (distance - move < 0.05) {
          w.path.shift();
          if (w.path.length === 0) w.wait = w.rest;
        }
      }
    } else {
      w.wait -= dt;
      if (w.wait <= 0) decide(w);
    }
    const delta = turnTo(w.yaw, wanted);
    w.yaw += Math.sign(delta) * Math.min(Math.abs(delta), dt * (w.facing !== null ? 3 : 4.5));
    return travelled;
  }

  /** The clip for this frame: walk to the pace covered, stand, gesture, talk. */
  function animate(w: Walker, dt: number, travelled: number, animated: boolean): void {
    w.clock += dt;
    const kind = w.creature.entry.kind ?? 'walker';
    const talking = w.facing !== null;
    if (talking && !w.talking) {
      // Spoken to: a wave first, then a nod or a shake as the line goes.
      w.talking = true;
      play(w, 'greet', 0.2, true);
      w.nextGesture = w.clock + 2.4;
    } else if (!talking && w.talking) {
      w.talking = false;
    }
    if (w.holdUntil <= w.clock) {
      if (talking) {
        if (w.clock >= w.nextGesture) {
          const rng = rngFrom('worlds', 'nod', w.key, w.decisions++);
          play(w, rng.chance(0.65) ? 'yes' : 'no', 0.2, true);
          w.nextGesture = w.clock + rng.range(2.5, 4.5);
        } else play(w, 'idle');
      } else if (travelled > 1e-4) {
        // A flyer swims through the air on its fast clip, slowed to a drift.
        play(w, kind === 'flyer' ? 'fly' : 'walk', 0.2);
        if (kind === 'flyer' && w.action !== null) w.action.setEffectiveTimeScale(0.75);
        const pace = NATURAL_PACE[kind] * w.scale;
        if (w.action !== null && pace > 0) w.action.setEffectiveTimeScale(Math.min(1.8, Math.max(0.5, travelled / dt / pace)));
      } else {
        play(w, 'idle', 0.3);
        if (w.clock >= w.nextGesture) {
          const rng = rngFrom('worlds', 'gesture', w.key, w.decisions++);
          const pick: ClipRole = kind === 'blob' ? rng.pick(['dance', 'dance', 'jump', 'yes']) : kind === 'flyer' ? rng.pick(['yes', 'no', 'fly']) : rng.pick(['greet', 'yes', 'jump', 'no']);
          if (rng.chance(w.visitor ? 0.5 : 0.7)) play(w, pick, 0.25, true);
          w.nextGesture = w.clock + rng.range(5, 14);
        }
      }
    }
    if (animated) w.rigged.mixer.update(dt);
  }

  return {
    group,
    walkers,
    stats,
    update(dt, player, eye = player) {
      for (const site of settlements.sites) {
        if (site.landmark) continue;
        const d = player.distanceTo(site.origin);
        const on = peopled.has(site.id);
        const ready = site.mesh !== null && site.kit;
        if (!on && ready && d < site.radius + CROWD_REACH) {
          if (people(site)) peopled.add(site.id);
        } else if (on && (d > site.radius + CROWD_DROP || !ready)) unpeople(site);
      }
      separate(dt);
      let animated = 0;
      let lastSite: Site | null = null;
      let playerLocal: THREE.Vector3 | null = null;
      for (const w of walkers) {
        if (w.site !== lastSite) {
          lastSite = w.site;
          near.copy(player).sub(w.site.origin).applyQuaternion(inverse.copy(w.site.quaternion).invert());
          playerLocal = Math.abs(near.y - w.site.floor) < 6 ? near : null;
        }
        const travelled = step(w, dt, playerLocal);
        settlements.toWorld(w.site, w.x, w.site.floor, w.z, w.mesh.position);
        w.mesh.quaternion.copy(w.site.quaternion).multiply(turn.setFromAxisAngle(UP, w.yaw));
        // Into the wind: forward by how much of it comes from ahead, sideways by the rest.
        if (upwind !== null && windLean !== 0 && wind !== null) {
          const gust = windLean * wind.strength * (1 + 0.18 * Math.sin(w.clock * 2.3 + w.x));
          const ahead = upwind.x * Math.sin(w.yaw) + upwind.z * Math.cos(w.yaw);
          const side = upwind.x * Math.cos(w.yaw) - upwind.z * Math.sin(w.yaw);
          w.mesh.quaternion.multiply(lean.setFromEuler(leanEuler.set(gust * ahead, 0, -gust * side)));
        }
        const d = w.mesh.position.distanceTo(eye);
        w.mesh.visible = d < SHOW_REACH;
        const live = d < ANIMATE_REACH;
        animate(w, dt, travelled, live);
        if (live) animated++;
      }
      stats.walkers = walkers.length;
      stats.animated = animated;
      stats.bodies = cast === undefined ? 0 : cast.creatures.filter((one) => worldKit()?.creatures.has(one.item) === true).length;
    },
    nearest(point, reach) {
      let found: Walker | null = null;
      let best = reach;
      for (const w of walkers) {
        if (w.visitor) continue;
        // A tall body is spoken to from further off.
        const d = w.mesh.position.distanceTo(point) - Math.max(0, w.height - 4) * 0.3;
        if (d < best) {
          best = d;
          found = w;
        }
      }
      return found;
    },
    headOf(walker, out) {
      return out.copy(walker.site.dir).multiplyScalar(walker.height * 1.04).add(walker.mesh.position);
    },
    dispose() {
      for (const w of walkers) release(w);
      walkers.length = 0;
      // Each rig's geometry is its own colour over the creature's shared
      // attributes; the creature is kept for the next visit, and its buffers
      // are uploaded again the first time it is drawn.
      for (const list of pool.values()) for (const rigged of list) rigged.body.geometry.dispose();
      pool.clear();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// The species built in code
// ---------------------------------------------------------------------------

/** One body of the species built in code (`system/alien.ts`), skinned: a section a joint. */
export interface AlienBody {
  geometry: THREE.BufferGeometry;
  /** The joints as built, without their sections. */
  rig: AlienRig;
  inverses: THREE.Matrix4[];
  height: number;
  float: boolean;
}

/**
 * A member of the species as `system/alien.ts` builds it — the parametric
 * body the system's checks hold to its budget — skinned onto its own joints:
 * every section merged into one geometry and bound wholly to the joint it
 * hangs from. The towns are peopled from the kit's creatures instead; this
 * is the body the species' numbers describe.
 */
export function bodyOf(ctx: SceneryContext, spec: WorldSpec, civ: Civilisation, index: number): AlienBody {
  const alien = alienFor(rngFrom('worlds', spec.id, 'alien', index), civ.species, { pose: 'stand' });
  const rig = rigAlien(ctx, civ.species.morph, alien);
  standAlien(rig);
  const pieces: MergePiece[] = [];
  const merged = mergeMeshes(rig.group, pieces);
  const count = merged.position.length / 3;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (const piece of pieces) {
    let owner: THREE.Object3D | null = piece.mesh.parent;
    while (owner !== null && (owner as THREE.Bone).isBone !== true) owner = owner.parent;
    const bone = Math.max(0, rig.bones.indexOf(owner as THREE.Bone));
    for (let i = piece.first; i < piece.first + piece.count; i++) {
      skinIndex[i * 4] = bone;
      skinWeight[i * 4] = 1;
    }
    piece.mesh.parent?.remove(piece.mesh);
    piece.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(merged.outline, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.computeBoundingSphere();
  // Bound where it stands: the rig's group is at the origin, so the joints'
  // world matrices are their rest matrices and their inverses are the bind.
  const holder = new THREE.SkinnedMesh(geometry);
  holder.add(rig.root);
  holder.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones);
  holder.bind(skeleton);
  holder.remove(rig.root);
  return { geometry, rig, inverses: skeleton.boneInverses, height: rig.height, float: rig.hover > 0 };
}
