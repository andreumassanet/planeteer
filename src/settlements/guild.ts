import * as THREE from 'three';
import { BENCH_LONGEST, BENCH_SIT_AHEAD } from '../bench.ts';
import { biomeAt, biomeSample } from '../biome.ts';
import type { FolkAnchor } from '../folk.ts';
import { drawGuild } from '../guild/square-build.ts';
import type { GuildDrawn } from '../guild/square-build.ts';
import { BOARD_DEPTH, guildSolids } from '../guild/square.ts';
import type { GuildLayout, GuildSquare } from '../guild/square.ts';
import { PROUD } from '../scenery/contract/tones.ts';
import { GROUND_LIFT } from '../scenery/ground.ts';
import { VARIANTS, rngFrom } from '../scenery/index.ts';
import type { Sink } from '../scenery/street-dressing/sink.ts';
import { SURFACE } from '../surfaces.ts';
import { planBox } from './flatten.ts';
import type { TownFrame } from './frame.ts';
import type { GroundJob } from './ground/job.ts';
import { solidOf } from './plots.ts';
import { BENCH_PART } from './rules.ts';
import { AXIS_Y, compose } from './raise/job.ts';
import type { RaiseJob, RaiseKit } from './raise/job.ts';
import type { FlatVariant } from './types.ts';

/**
 * The Explorers' Guild's square in a town that has one (`frame.guild`, laid
 * out by `guildLayout`): its hall and decor merged into the town's buffer as
 * three runs, its walls among the town's, its lamps among the town's lamps,
 * its benches the town's own bench, a few of the town's people in it, and the
 * square published for the guild's people (`GuildSquare`).
 *
 * The runs are drawn in the square's own frame and stood on its terrace by
 * one transform, its up the local up at the square's middle, so the paint on
 * the paving lies on the paving across the whole square.
 */

/** How many squares' runs are kept drawn, the most recent; a square is a few hundred kilobytes. */
const KEPT = 12;
/** The share of the guild's benches somebody sits on. */
const SITTING = 0.5;
/** How bright the hall's windows light the paving before it after dark. */
const HALL_SPILL = 0.6;

/** A drawn square's three runs, as the town merges them. */
interface GuildRuns {
  stone: FlatVariant;
  upper: FlatVariant;
  decor: FlatVariant;
  hallHeight: number;
}

const kept = new Map<string, GuildRuns>();

/** A run of a `Sink` as a standing variant: its ink is its own normal. */
function flatOf(sink: Sink, height: number): FlatVariant {
  const position = Float32Array.from(sink.position);
  const normal = Float32Array.from(sink.normal);
  const glow = Uint8Array.from(sink.glow);
  let litBed = 0;
  let emits = false;
  for (let i = 0; i < glow.length; i += 2) {
    if (glow[i]! > 0) {
      emits = true;
      litBed = glow[i + 1]!;
      break;
    }
  }
  return {
    position,
    normal,
    color: Float32Array.from(sink.color),
    outline: normal,
    glow,
    emits,
    litBed,
    triangles: position.length / 9,
    height,
    box: planBox(position),
    pieceVertices: [position.length / 3],
  };
}

/** The square's runs for this town, drawn once and kept for the next build of it. */
function runsFor(kit: RaiseKit, job: RaiseJob, layout: GuildLayout): GuildRuns {
  const { slot } = job;
  const { parcel } = layout;
  const key = `${slot.index}:${job.peopled}:${parcel.c0},${parcel.r0},${parcel.c1},${parcel.r1},${parcel.hallSide}`;
  const known = kept.get(key);
  if (known !== undefined) {
    kept.delete(key);
    kept.set(key, known);
    return known;
  }
  const drawn: GuildDrawn = drawGuild(layout, {
    region: kit.styleFor(slot).id,
    iso: slot.place.iso,
    plaza: slot.ground.plaza,
    near: job.peopled,
    seed: slot.seed,
  });
  const runs: GuildRuns = {
    stone: flatOf(drawn.stone, drawn.hallHeight),
    upper: flatOf(drawn.upper, drawn.hallHeight),
    decor: flatOf(drawn.decor, drawn.hallHeight),
    hallHeight: drawn.hallHeight,
  };
  kept.set(key, runs);
  while (kept.size > KEPT) kept.delete(kept.keys().next().value!);
  return runs;
}

/**
 * The transform from the square's frame to the town's: its middle on the
 * paving, its up the local up there. Asserted proper.
 */
function squareFrame(frame: TownFrame, layout: GuildLayout): THREE.Matrix4 {
  const top = layout.parcel.level + GROUND_LIFT;
  const at = frame.pointIn(layout.cx, layout.cz, top, [0, 0, 0]);
  const up = frame.directionAt(layout.cx, layout.cz, new THREE.Vector3()).applyMatrix4(frame.inverse).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(AXIS_Y, up);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), turn, new THREE.Vector3(1, 1, 1));
  if (!(matrix.determinant() > 0)) throw new Error(`guild square: a transform with determinant ${matrix.determinant()}`);
  return matrix;
}

/**
 * Stands the guild's square: the hall's two runs (stone, then plaster under
 * its roof, for the Ultra surfaces) and the decor, its walls, the light its
 * windows lay on the paving, its benches and, near, a few people. Before the
 * floor, which reads the light; after the map's plan, which draws the square
 * from the layout.
 */
export function* standGuildSteps(kit: RaiseKit, job: RaiseJob): Generator<void, void, void> {
  const { frame } = kit;
  const layout = frame.guild;
  job.guild = null;
  if (layout === null) return;
  const runs = runsFor(kit, job, layout);
  yield;
  const matrix = squareFrame(frame, layout);
  job.standing.push({ flat: runs.stone, matrix, glow: 1, surface: SURFACE.stone });
  job.standing.push({ flat: runs.upper, matrix, glow: 1, surface: SURFACE.plaster });
  job.standing.push({ flat: runs.decor, matrix, glow: 1 });
  job.vertices += (runs.stone.position.length + runs.upper.position.length + runs.decor.position.length) / 3;
  for (const { solid } of guildSolids(layout, { hall: runs.hallHeight })) job.solids.push(solid);
  const top = layout.parcel.level + GROUND_LIFT;
  const hallAt = frame.pointIn(layout.hall.x - Math.sin(layout.hall.yaw) * layout.hall.depth / 2, layout.hall.z - Math.cos(layout.hall.yaw) * layout.hall.depth / 2, top, [0, 0, 0]);
  job.litPlots.push({ x: hallAt[0]!, z: hallAt[2]!, radius: layout.hall.width / 2, strength: HALL_SPILL, bed: 254 });
  standBenches(kit, job, layout);
  if (job.peopled) standFolk(kit, job, layout);
  job.guild = squareOf(kit, job, layout, matrix);
}

/** The benches round the fountain: the town's one bench, a wall each, sat on by some. */
function standBenches(kit: RaiseKit, job: RaiseJob, layout: GuildLayout): void {
  const { slot } = job;
  const { frame } = kit;
  const top = layout.parcel.level + GROUND_LIFT;
  layout.benches.forEach((bench, k) => {
    const rng = rngFrom(slot.seed, 'guild-bench', k);
    const flat = kit.variants.variantOf(BENCH_PART, slot.style, rng.int(VARIANTS));
    if (flat === null) return;
    const p = frame.pointIn(bench.x, bench.z, top, [0, 0, 0]);
    const at = new THREE.Vector3(p[0], p[1], p[2]);
    const matrix = compose(kit.scratch, at, bench.yaw, 1).clone();
    const solid = solidOf(flat, at.x, at.z, bench.yaw, 1, layout.parcel.level);
    const props = [{ kind: 'bench' as const, first: 0, count: flat.position.length / 3, x: at.x, y: at.y, z: at.z, radius: BENCH_LONGEST / 2, height: flat.height, solid }];
    job.standing.push({ flat, matrix, glow: 0, props });
    job.vertices += flat.position.length / 3;
    job.solids.push(solid);
    const facing = new THREE.Vector3(Math.sin(bench.yaw), 0, Math.cos(bench.yaw));
    job.benches.push({ position: facing.clone().multiplyScalar(BENCH_SIT_AHEAD).add(at), facing, sink: 0, key: `guild-bench:${slot.index}:${k}` });
  });
}

/** A few of the town's people in the square: strolling its lines, and sitting on half its benches. */
function standFolk(kit: RaiseKit, job: RaiseJob, layout: GuildLayout): void {
  const { slot } = job;
  const { frame, world } = kit;
  const up = frame.up;
  const warmth = biomeAt(up.x, up.y, up.z, slot.place.lat, slot.place.lon, Math.max(0, world.elevationAt(up)), biomeSample()).warmth;
  const top = layout.parcel.level + GROUND_LIFT;
  const person = (key: string, at: THREE.Vector3, yaw: number): FolkAnchor => ({
    key: `${slot.seed}|guild|${key}`,
    position: at.clone(),
    quaternion: new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw),
    from: at.clone(),
    to: at.clone(),
    chatting: false,
    town: new THREE.Quaternion(),
    region: slot.style.id,
    warmth,
    distance: 0,
  });
  layout.strolls.forEach(([x0, z0, x1, z1], k) => {
    const rng = rngFrom(slot.seed, 'guild-stroll', k);
    const a = frame.pointIn(x0, z0, top, [0, 0, 0]);
    const b = frame.pointIn(x1, z1, top, [0, 0, 0]);
    const from = new THREE.Vector3(a[0], a[1], a[2]);
    const to = new THREE.Vector3(b[0], b[1], b[2]);
    const walker = person(`stroll|${k}`, from.clone().lerp(to, rng.range(0.2, 0.8)), Math.atan2(x1 - x0, z1 - z0));
    walker.from.copy(from);
    walker.to.copy(to);
    job.folk.push(walker);
  });
  const benches = job.benches.filter((bench) => bench.key.startsWith(`guild-bench:${slot.index}:`));
  benches.forEach((bench, k) => {
    if (!rngFrom(slot.seed, 'guild-sits', k).chance(SITTING)) return;
    const sitter = person(`sit|${k}`, bench.position, Math.atan2(bench.facing.x, bench.facing.z));
    sitter.seated = true;
    job.folk.push(sitter);
  });
}

/** The square in the world, for the guild's people: its middle, its people's spots, its boards' faces and the hall's door. */
function squareOf(kit: RaiseKit, job: RaiseJob, layout: GuildLayout, matrix: THREE.Matrix4): GuildSquare {
  const { frame } = kit;
  const top = layout.parcel.level + GROUND_LIFT;
  const world = (x: number, z: number): THREE.Vector3 => {
    const p = frame.pointIn(x, z, top, [0, 0, 0]);
    return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(frame.basis).add(frame.origin);
  };
  /** A direction of the town's frame turned into the world's and laid on the ground at `at`. */
  const along = (yaw: number, at: THREE.Vector3): THREE.Vector3 => {
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).applyMatrix4(frame.basis);
    const n = at.clone().normalize();
    return d.addScaledVector(n, -d.dot(n)).normalize();
  };
  const toWorld = new THREE.Matrix4().multiplyMatrices(frame.basis, matrix);
  const rotation = new THREE.Matrix4().extractRotation(toWorld);
  const centre = world(layout.fountain.x, layout.fountain.z);
  const boards = layout.boards.map((board) => {
    const turn = new THREE.Matrix4().makeRotationY(board.yaw);
    const face = new THREE.Vector3(0, board.lift, BOARD_DEPTH / 2 + PROUD).applyMatrix4(turn);
    face.x += board.x - layout.cx;
    face.z += board.z - layout.cz;
    return {
      kind: board.kind,
      at: face.applyMatrix4(toWorld).add(frame.origin),
      normal: new THREE.Vector3(Math.sin(board.yaw), 0, Math.cos(board.yaw)).applyMatrix4(rotation).normalize(),
      up: new THREE.Vector3(0, 1, 0).applyMatrix4(rotation).normalize(),
      width: board.width,
      height: board.height,
    };
  });
  const spots = layout.spots.map((spot) => {
    const at = world(spot.x, spot.z);
    return { role: spot.role, at, facing: along(spot.yaw, at) };
  });
  const door = world(layout.hall.x, layout.hall.z);
  return {
    place: job.slot.place,
    index: job.slot.index,
    centre,
    up: centre.clone().normalize(),
    spots,
    boards,
    hall: { at: door, facing: along(layout.hall.yaw, door) },
  };
}

/** The guild's lamps among the town's, on the square's paving, each one's arm over the square. */
export function guildLamps(job: GroundJob): void {
  const layout = job.frame.guild;
  if (layout === null) return;
  for (const lamp of layout.lamps) {
    job.pavingAt(lamp.x, lamp.z, layout.parcel.level, job.out.lamps);
    job.out.lampYaws.push(lamp.yaw);
  }
}

/**
 * Discs over the square, as runs of `(x, z, radius)`, for what hangs over the
 * town's streets to keep its poles off: the square is the guild's.
 */
export function guildKeep(frame: TownFrame, into: number[]): void {
  const layout = frame.guild;
  if (layout === null) return;
  const step = 4;
  for (let x = layout.x0; x <= layout.x1 + 1e-6; x += step) {
    for (let z = layout.z0; z <= layout.z1 + 1e-6; z += step) into.push(x, z, step * 0.75);
  }
}
