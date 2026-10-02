/**
 * The towns of another world: laid out, built from the space kit (or in code
 * where it is not loaded), merged one mesh a town, streamed by distance, and
 * solid.
 *
 * Earth's rules, kept where they transfer:
 *
 * - **A town stands on its own pad**, which the terrain levels to a plane
 *   (`terrain.ts`'s `Pad`), so everything in it is built in one flat frame and
 *   nothing is seated building by building.
 * - **One town, one draw call.** The kit's modules are painted in the
 *   civilisation's colours as vertex colours (`kit.ts`'s `buildingPaint`) and
 *   `mergeMeshes` reduces the lot to one buffer, the way a Terran town is;
 *   a window's vertices carry a glow the loop turns up after dark.
 * - **A building is a wall.** Each keeps its footprint as circles — one for a
 *   round module, a row of them along a long one, a string along a tube — and
 *   `collide` pushes a body out of them, the shape `settlements.collide` has
 *   on Earth with circles where Earth has a plan box.
 * - **The layout keeps the streets clear**: a square in the middle with the
 *   centrepiece in it, and `avenues` radial streets from the square to the
 *   edge with nothing on them. The people walk the square and the avenues, so
 *   a walker never walks through a wall — the streets are the only routes
 *   there are, which is the reason `life.ts` on Earth has walkers only on a
 *   road's verge.
 *
 * **A colony is laid out like a street, not scattered** (`ColonyStyle`): the
 * modules stand in a row down each side of every avenue, set back a pace from
 * it with their doors to it, joined to their neighbour by a pressurised tube
 * where the gap allows; behind each a yard of panels, tanks and plants; then
 * the back lots, facing the square, until the town's triangle budget
 * (`colonyBudget`) is spent. A big town keeps a landing pad with a ship on it,
 * the crew who flew it standing by (`Site.port`, peopled by `aliens.ts`); an
 * avenue leaves through a gate. All of it is a pure function of the world and
 * the town, so every visitor sees the same street.
 *
 * And one rule of its own: **on a cloud deck a town is a platform**, a disc
 * floating `PLATFORM_LIFT` over the levelled deck, and `floorAt` is what the
 * foot stands on inside it.
 *
 * Under `HAMLET` units of radius a settlement is a **hamlet**: its centrepiece
 * in a small square, two or three lanes, and its modules in short rows, so a
 * place of a few thousand is a place and not a monument on its own. The
 * avenues are as wide as the architecture says (`avenueWidth`), and the
 * buildings face their avenue, the square, or the wind (`yaw`).
 */

import * as THREE from 'three';
import type { ArchitectureStyle, ColonyStyle, KitCraft, VehicleSpec, WorldSpec } from './contract.ts';
import { DEFAULT_KITS } from './craft.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import { townRadii } from '../system/contract.ts';
import type { Pad, Terrain } from './terrain.ts';
import { buildForm } from './architecture.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';
import { mergeMeshes, sourceVertex } from '../merge.ts';
import type { MergePiece } from '../merge.ts';
import { toUnit } from '../sphere.ts';
import { linearOf, newSample } from './terrain.ts';
import { paintModel } from '../models.ts';
import type { Model, Paint } from '../models.ts';
import { PIECES, SCATTER, buildingPaint, craftPaint, isKitBuilding, liveryOf, onWorldKit, worldKit } from './kit.ts';
import type { Livery, WorldKit } from './kit.ts';
import { gridTownOf, planOf } from './town-grid.ts';
import { LAMP_FIELD } from '../lights.ts';
import { litAtNight } from './night.ts';
import { CARRIAGE_TOP, roadNetwork } from './roads.ts';
import type { Gate, RoadNetwork } from './roads.ts';
import type { GridPlot, GridTown } from './town-grid.ts';
import { PALETTE } from '../theme.ts';
import { AVATAR_HEIGHT } from '../stature.ts';

/** How high a cloud-deck town's floor floats over the levelled deck. */
export const PLATFORM_LIFT = 2;
/** Built inside this many units of the eye past a town's own radius; dropped past the second. */
const BUILD_REACH = 3200;
const DROP_REACH = 4200;
/** A building's footprint radius before it is built, units: what the layout leaves room for. */
const GUESS = 8;
/**
 * The room a colony leaves a form built in code, units at a scale of 1: the
 * forms run from 3 to 7 across, and one that turns out wider is let go when
 * it is built.
 */
const CODE_ROOM = 6;
/** Under this built radius a settlement is a hamlet: a ring of houses round its centrepiece. */
const HAMLET = 40;
/** How far a colony's row stands back from its avenue's kerb, units. */
const SETBACK = 2.5;
/** How deep a yard behind a module is, units. */
const YARD = 4.5;
/** A landing pad's radius, units: room for a ship and the crew round it. */
const PAD = 10;
const PAD_RADIUS = PAD;
/** The most triangles a plant in a grid town's planter or yard may cost. */
const SMALL_PLANT = 800;
/** The palette entry nearest a linear colour, and the tone that brings it to that colour's brightness. */
function paletteToneOf(r: number, g: number, b: number): { base: number; factor: number } {
  const want = new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const probe = new THREE.Color();
  let base: number = PALETTE.tan;
  let best = Infinity;
  for (const hex of Object.values(PALETTE)) {
    if (hex === PALETTE.ink) continue;
    probe.setHex(hex);
    // By hue and saturation more than brightness: the tone takes care of that.
    const scale = lum(want) / Math.max(1e-4, lum(probe));
    const d = (probe.r * scale - want.r) ** 2 + (probe.g * scale - want.g) ** 2 + (probe.b * scale - want.b) ** 2;
    if (d < best) [best, base] = [d, hex];
  }
  probe.setHex(base);
  return { base, factor: Math.min(1.6, Math.max(0.4, Math.sqrt(lum(want) / Math.max(1e-4, lum(probe))))) };
}

/** How far past the square a main street's track runs at most, units, and the length of one of its pieces. */
const TRACK_LENGTH = 70;
const TRACK_STEP = 7;
/** Whether a grid town keeps the kit's gates where its main streets leave it: see `buildGridTown`. */
const GRID_GATES = false;
/** A street lamp's height, units: a little over a person and a half. */
const LAMP_HEIGHT = AVATAR_HEIGHT * 1.45;
/** How high a building's doorway light hangs over its floor: over a head, under its eaves. */
const DOOR_LIGHT = AVATAR_HEIGHT * 0.8;
/**
 * What is parked on a grid town's main streets, as craft to take — the
 * engine's own models at the engine's own sizes (`DEFAULT_KITS`), so the
 * car on the kerb is the car you drive — and on a deck the skiff.
 */
const PARKED_KITS: readonly KitCraft[] = [DEFAULT_KITS.rover!, { id: 'rover-cab', length: 9.4, seat: [-0.17, 0.3, 0.17], closed: true }];

/** A craft standing in a site, in the site's frame. */
export interface CraftSpot {
  vehicle: VehicleSpec;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface Footprint {
  /** In the town's own frame. */
  x: number;
  z: number;
  radius: number;
  height: number;
  /**
   * Which building a circle belongs to, where a building is more than one: the
   * circles of one overlap each other by design. Omitted, a building of one.
   */
  part?: number;
}

/** Where a spaceport's crew stand: round the pad, in the town's frame. */
export interface Port {
  x: number;
  z: number;
  /** The pad's radius. */
  r: number;
  /** Which way the ship points. */
  yaw: number;
}

export interface Site {
  id: string;
  name: string;
  nation: string;
  population: number;
  /** Built radius and the radius the paving reaches. */
  radius: number;
  paving: number;
  /** The square in the middle, and the avenues' angles in the town's frame. */
  plaza: number;
  avenues: number[];
  /** Half an avenue's width, units. */
  avenueHalf: number;
  /** Unit vector of the centre, the frame's origin, and the frame itself (y up). */
  dir: THREE.Vector3;
  origin: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Where the floor is in the town's frame: 0 on a crust, the platform's top on a deck. */
  floor: number;
  /** Whether this is a landmark and not a town: one building, no people. */
  landmark: boolean;
  footprints: Footprint[];
  /** The landing pad, where the town has one. */
  port: Port | null;
  mesh: THREE.Mesh | null;
  /** Whether what stands was built from the kit, or from the code-built stand-ins. */
  kit: boolean;
  /**
   * The town as Earth's are laid out (`town-grid.ts`): its square, streets,
   * plots, pavements and lamps. Null for a landmark, and for a civilisation
   * without a colony of the kit's modules, which keeps the disc of forms.
   */
  town: GridTown | null;
}

export interface Settlements {
  group: THREE.Group;
  sites: readonly Site[];
  /** Builds and drops by distance; at most one build a call. */
  /** How far towns are built and kept, as a multiple of `BUILD_REACH`: the settings' render distance. */
  reach: number;
  update(eye: THREE.Vector3): void;
  /** Builds every site within reach of `eye` at once: the first frame. */
  prime(eye: THREE.Vector3): void;
  /** Pushes a body of `radius` at `position` out of every wall; true if it moved. */
  collide(position: THREE.Vector3, radius: number): boolean;
  /** Height over the walkable radius of a made floor at `dir`, or null where there is none. */
  floorAt(x: number, y: number, z: number): number | null;
  /**
   * The lights of the standing towns within `LAMP_FIELD` of `point` — each
   * street lamp's lantern and each building's lit doorway — as `x, y, z,
   * distance` in the world, nearest first, at most `max`; returns how many.
   * What `night.ts` hands Earth's per-pixel pools.
   */
  lampsNear(point: THREE.Vector3, out: Float32Array, max: number): number;
  /**
   * The craft that stand in a town or at a landmark, in its own frame: the
   * cars on its main streets, the ship on its pad, a landmark's own. Built
   * as craft (`index.ts`) while the town stands; pure, so every visitor finds
   * the same ones.
   */
  craftAt(site: Site): readonly CraftSpot[];
  /** Whether a point is inside a building, for the camera. */
  blocks(point: THREE.Vector3): boolean;
  /** The nearest site to a direction, and the angle to it in radians. */
  nearest(dir: THREE.Vector3, filter?: (site: Site) => boolean): { site: Site; angle: number } | null;
  /** A site's frame point to a world position. */
  toWorld(site: Site, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3;
  /** How brightly what glows in a town glows: about 0.6 by day and 2 at night. */
  glow: number;
  /** The roads between the towns (`roads.ts`), which the towns' main streets lead onto. */
  readonly network: RoadNetwork;
  readonly stats: { built: number; triangles: number; buildMs: number; kit: number };
  dispose(): void;
}

/** The frame of a site: `y` up, `z` toward the north pole, `x = y x z`. Right-handed, determinant +1. */
export function frameAt(dir: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const up = dir;
  const ref = Math.abs(up.y) > 0.995 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const north = ref.clone().addScaledVector(up, -ref.dot(up)).normalize();
  const x = new THREE.Vector3().crossVectors(up, north);
  const basis = new THREE.Matrix4().makeBasis(x, up, north);
  if (basis.determinant() <= 0) throw new Error('worlds: a town frame came out mirrored');
  return out.setFromRotationMatrix(basis);
}

/** The layout of one town: where each building goes, a pure function of the world and the town. */
export interface Plot {
  /** A kit building's id, a form's name, or `pad`. */
  form: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  seed: string;
  /** The circle the plot keeps to, units; the building may sit forward in it to leave a yard. */
  room?: number;
  /** A yard of panels and plants behind it. */
  yard?: boolean;
  /** The roof piece it carries, if any. */
  roof?: string;
  /** The row along an avenue it stands in (avenue * 2 + side), and its place in it; tubes join neighbours. */
  row?: number;
  place?: number;
}

/**
 * The triangles a colony of this built radius may cost. A Terran town is
 * cheaper (Beijing is 27,822), because a kit module is a thousand to three
 * thousand triangles where a City Kit house is a few hundred; a world has
 * twenty towns and two or three are built at once, so the largest may cost
 * twice Beijing and still draw in one call.
 */
export function colonyBudget(radius: number): number {
  return Math.round(Math.min(64000, 10000 + radius * 440));
}

/** The circle a kit building keeps to, units, at a colony's scale: half its wider side. */
export function pieceRadius(id: string, scale: number): number {
  const info = PIECES[id];
  if (info === undefined) return GUESS * scale;
  return (Math.max(info.size[0], info.size[2]) / 2) * info.scale * scale * 0.96;
}

/** About what a plot costs, triangles, for the budget. */
function plotTriangles(plot: Plot): number {
  const info = PIECES[plot.form];
  let t = info?.triangles ?? 900;
  if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') t += PIECES['house-single-support']!.triangles;
  if (plot.roof !== undefined) t += PIECES[plot.roof]?.triangles ?? 0;
  if (plot.yard === true) t += 800;
  if (plot.row !== undefined) t += PIECES.connector!.triangles * 0.6;
  if (plot.form === 'pad') t += 3400;
  return t;
}

export function layoutOf(spec: WorldSpec, id: string, radius: number, landmark: boolean): { plots: Plot[]; plaza: number; avenues: number[]; paving: number } {
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const rng = rngFrom('worlds', spec.id, 'town', id);
  const paving = radius * 0.96;
  const half = avenueHalfOf(spec);
  const colony = landmark ? undefined : style.colony;
  // A hamlet is its centrepiece in a small square and a ring of houses round
  // it, on two or three lanes; a town has a ring of buildings outside a square
  // wide enough for its landmark and a walk round it.
  const small = radius < HAMLET;
  let plaza = landmark ? radius * 0.9 : small ? Math.min(13, Math.max(6, radius * 0.34)) : Math.max(18, radius * 0.2);
  const wanted = Math.max(3, Math.min(8, Math.round(style.avenues)));
  // Two lanes through the smallest, opposite each other; three through a
  // larger hamlet.
  const count = small ? Math.min(radius < 25 ? 2 : 3, wanted) : wanted;
  const turn = rng.range(0, Math.PI * 2);
  const avenues: number[] = [];
  for (let k = 0; k < count; k++) avenues.push(turn + (k / count) * Math.PI * 2);
  const centreYaw = rng.range(0, Math.PI * 2);
  if (colony !== undefined) {
    // A hub from the kit wants a square round it wide enough to walk round
    // and for its dishes: the centrepiece's own radius and ten.
    // In a hamlet everything is smaller, so a ring of modules still fits
    // between its square and its edge.
    const tight = Math.min(1, Math.max(radius < 16 ? 0.42 : 0.6, radius / 50));
    const centreScale = Math.min(1.25, Math.max(0.5, radius / 40)) * (colony.scale ?? 1);
    const form = colony.centre ?? style.landmark;
    if (colony.centre !== null) plaza = Math.min(paving * 0.62, Math.max(plaza, pieceRadius(colony.centre, centreScale) + (small ? 3 : 10)));
    const plots: Plot[] = [{ form, x: 0, z: 0, yaw: centreYaw, scale: colony.centre === null ? (small ? 0.8 : 1.5) : centreScale, seed: `${id}:landmark` }];
    colonyLayout(spec, style, colony, id, radius, paving, plaza, avenues, half, plots, rng, tight);
    return { plots, plaza, avenues, paving };
  }
  const plots: Plot[] = [{ form: style.landmark, x: 0, z: 0, yaw: centreYaw, scale: landmark ? 1 : small ? 0.8 : 1.5, seed: `${id}:landmark` }];
  if (landmark) return { plots, plaza, avenues, paving };

  // Which way a front faces: into the square, or into the wind.
  const upwind = style.yaw === 'wind' && spec.wind !== null ? upwindYaw(spec.wind.toward) : null;
  const facing = (x: number, z: number): number => (upwind ?? Math.atan2(-x, -z)) + rng.jitter() * (upwind === null ? 0.3 : 0.18);
  const offAvenues = (x: number, z: number, room: number): boolean => clearOfAvenues(avenues, half, x, z, room);

  if (small) {
    // The ring: houses a little smaller than a town's, evenly round, each
    // set back to the paving's edge, and none on a lane.
    const scale = Math.min(0.85, Math.max(0.55, radius / HAMLET));
    const guess = GUESS * scale;
    const ring = Math.max(plaza + guess + 1, paving - guess * 0.6);
    const slots = Math.min(8, Math.floor((Math.PI * 2 * ring) / (guess * 2 + 2.5)));
    const start = rng.range(0, Math.PI * 2);
    for (let k = 0; k < slots; k++) {
      const a = start + ((k + rng.range(-0.12, 0.12)) / slots) * Math.PI * 2;
      const x = Math.sin(a) * ring;
      const z = Math.cos(a) * ring;
      if (!offAvenues(x, z, guess * 0.8)) continue;
      const form = rng.weighted(style.forms);
      plots.push({ form, x, z, yaw: facing(x, z), scale: scale * rng.range(0.9, 1.05), seed: `${id}:${plots.length}` });
    }
    return { plots, plaza, avenues, paving };
  }

  // Buildings by rejection: a point in the ring between the square and the
  // edge, off every avenue, clear of every building already placed. The
  // radii are guessed before building and the true ones are kept after, when
  // `build` lets go of any that turn out to reach into an avenue or a
  // neighbour — so the guess may be generous about the avenues, and is.
  const area = Math.PI * (paving * paving - plaza * plaza);
  const target = Math.round((area / 1000) * style.density);
  const placed: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: plaza * 0.5 }];
  // No room between the square and the edge: an outpost, its landmark alone.
  const inner = plaza + GUESS * 0.75;
  const outer = paving - GUESS * 0.6;
  const room = outer > inner;
  for (let attempt = 0; room && attempt < target * 8 && plots.length - 1 < target; attempt++) {
    const d = Math.sqrt(rng.range(inner ** 2, outer ** 2));
    const a = rng.range(0, Math.PI * 2);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    if (!offAvenues(x, z, GUESS * 0.75)) continue;
    let clear = true;
    for (const other of placed) {
      if (Math.hypot(other.x - x, other.z - z) < other.r + GUESS * 0.9) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    placed.push({ x, z, r: GUESS });
    const form = rng.weighted(style.forms);
    plots.push({ form, x, z, yaw: facing(x, z), scale: rng.range(0.8, 1.1), seed: `${id}:${plots.length}` });
  }
  return { plots, plaza, avenues, paving };
}

/** Whether a point stands clear of every avenue (a ray from the middle) by `room`. */
function clearOfAvenues(avenues: readonly number[], half: number, x: number, z: number, room: number): boolean {
  for (const avenue of avenues) {
    const along = x * Math.sin(avenue) + z * Math.cos(avenue);
    if (along < -room) continue;
    if (Math.abs(x * Math.cos(avenue) - z * Math.sin(avenue)) < half + room) return false;
  }
  return true;
}

/**
 * A colony's plots after its centrepiece: a landing pad if the town is big
 * enough, the rows down the avenues, then the back lots — in that order, so
 * the budget is spent on the street first. The gates over the avenues are
 * not plots: they stand on the street, which no plot may, and `build` puts
 * them there.
 */
function colonyLayout(
  spec: WorldSpec,
  style: ArchitectureStyle,
  colony: ColonyStyle,
  id: string,
  radius: number,
  paving: number,
  plaza: number,
  avenues: readonly number[],
  half: number,
  plots: Plot[],
  rng: Rng,
  tight: number,
): void {
  const scale = (colony.scale ?? 1) * tight;
  const budget = colonyBudget(radius);
  let spent = plotTriangles(plots[0]!);
  const placed: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: plaza - 1 }];
  const population = spec.body.settlements.find((one) => one.id === id)?.population ?? 0;
  const upwind = style.yaw === 'wind' && spec.wind !== null ? upwindYaw(spec.wind.toward) : null;
  const fits = (x: number, z: number, r: number): boolean => {
    const d = Math.hypot(x, z);
    if (d + r > paving - 1 || d - r < plaza + 1) return false;
    if (!clearOfAvenues(avenues, half, x, z, r + 0.6)) return false;
    for (const other of placed) if (Math.hypot(other.x - x, other.z - z) < other.r + r + 1.5) return false;
    return true;
  };
  /** A plot's building: its form, scale, roof and yard, before it is placed. */
  const draw = (): { form: string; scale: number; r: number; roof?: string; yard: boolean } => {
    const form = rng.weighted(colony.modules);
    const kit = isKitBuilding(form);
    const s = scale * rng.range(0.9, 1.06);
    const info = PIECES[form];
    const yard = kit && (info?.role === 'module' || info?.role === 'hub') && rng.chance(colony.yards);
    const roof = info?.roofed === true && rng.chance(colony.roofs) ? rng.pick(['roof-antenna', 'roof-radar', 'roof-opening', 'roof-antenna']) : undefined;
    return { form, scale: s, r: kit ? pieceRadius(form, s) : CODE_ROOM * s, yard, ...(roof === undefined ? {} : { roof }) };
  };

  // The landing pad: in the widest gap between two avenues, out at the edge.
  if (population >= colony.spaceport && radius >= HAMLET) {
    let best = 0;
    let gap = -1;
    avenues.forEach((a, k) => {
      const next = avenues[(k + 1) % avenues.length]! + (k === avenues.length - 1 ? Math.PI * 2 : 0);
      if (next - a > gap) {
        gap = next - a;
        best = a + gap / 2;
      }
    });
    const room = PAD + 1;
    const d = paving - room - 1;
    const x = Math.sin(best) * d;
    const z = Math.cos(best) * d;
    if (fits(x, z, room)) {
      const pad: Plot = { form: 'pad', x, z, yaw: best + Math.PI / 2, scale: 1, seed: `${id}:pad`, room };
      plots.push(pad);
      placed.push({ x, z, r: room });
      spent += plotTriangles(pad);
    }
  }

  // The rows: down each side of each avenue, set back from its kerb, doors to it.
  avenues.forEach((a, k) => {
    for (const side of [-1, 1]) {
      let along = plaza + 1;
      let place = 0;
      for (let tries = 0; tries < 60 && along < paving - 4; tries++) {
        const pick = draw();
        const room = pick.r + (pick.yard ? YARD : 0);
        const off = half + SETBACK + room;
        const at = along + room;
        const x = Math.sin(a) * at + Math.cos(a) * off * side;
        const z = Math.cos(a) * at - Math.sin(a) * off * side;
        const plot: Plot = {
          form: pick.form,
          x,
          z,
          // The front (+Z) to the avenue: back along the offset.
          yaw: Math.atan2(-Math.cos(a) * side, Math.sin(a) * side) + rng.jitter() * 0.05,
          scale: pick.scale,
          seed: `${id}:${k}:${side}:${place}`,
          room,
          yard: pick.yard,
          row: k * 2 + (side > 0 ? 1 : 0),
          place,
          ...(pick.roof === undefined ? {} : { roof: pick.roof }),
        };
        const cost = plotTriangles(plot);
        if (fits(x, z, room) && spent + cost <= budget) {
          plots.push(plot);
          placed.push({ x, z, r: room });
          spent += cost;
          place++;
          along = at + room + rng.range(1.5, 4);
        } else along += 3;
      }
    }
  });

  // The back lots, facing the square (or the wind), while the budget lasts.
  const inner = plaza + 1;
  const outer = paving - 1;
  for (let attempt = 0; attempt < 240 && outer > inner && spent < budget; attempt++) {
    const pick = draw();
    const room = pick.r + (pick.yard ? YARD : 0);
    const d = Math.sqrt(rng.range(inner ** 2, outer ** 2));
    const a = rng.range(0, Math.PI * 2);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const plot: Plot = {
      form: pick.form,
      x,
      z,
      yaw: (upwind ?? Math.atan2(-x, -z)) + rng.jitter() * 0.25,
      scale: pick.scale,
      seed: `${id}:${plots.length}`,
      room,
      yard: pick.yard,
      ...(pick.roof === undefined ? {} : { roof: pick.roof }),
    };
    const cost = plotTriangles(plot);
    if (spent + cost > budget || !fits(x, z, room)) continue;
    plots.push(plot);
    placed.push({ x, z, r: room });
    spent += cost;
  }
}

/** Half an avenue's width for a world's architecture, units. */
export function avenueHalfOf(spec: WorldSpec): number {
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  return Math.max(1.5, (style.avenueWidth ?? DEFAULT_ARCHITECTURE.avenueWidth ?? 6) / 2);
}

/**
 * The yaw that turns a building's front (+Z) to face *into* a wind blowing
 * toward `toward` degrees, in a town's frame — whose +X is **west** and +Z
 * north (`frameAt`: x = up x north), so a bearing's east component is -X.
 */
export function upwindYaw(toward: number): number {
  const b = (toward * Math.PI) / 180;
  return Math.atan2(Math.sin(b), -Math.cos(b));
}

/** Where a traveller arriving at a town stands: on its first avenue, a little out from the square. */
export function arrivalOf(site: Site): { x: number; z: number } {
  if (site.town !== null) return site.town.arrival;
  const avenue = site.avenues[0]!;
  const out = Math.min(site.paving - 3, site.plaza + 6);
  return { x: Math.sin(avenue) * out, z: Math.cos(avenue) * out };
}

// ---------------------------------------------------------------------------
// Building a kit piece
// ---------------------------------------------------------------------------

/** A material that says "the colours are the geometry's" to `mergeMeshes`; it is never drawn. */
const PAINTED = new THREE.MeshBasicMaterial();
PAINTED.userData.atlasPainted = true;

/**
 * A kit model as a mesh in its own pack frame, painted, its window vertices
 * marked in `userData.glow` for the town's emission. Its attributes are the
 * model's, shared: `userData.shared` keeps the town from disposing them.
 */
function pieceMesh(model: Model, paint: Paint, glass: Set<string> | null): THREE.Mesh {
  const geometry = paintModel(model, paint);
  const mesh = new THREE.Mesh(geometry, PAINTED);
  mesh.userData.shared = true;
  if (glass !== null && glass.size > 0) {
    const lit = model.slots.map((slot) => glass.has(slot));
    const mask = new Uint8Array(model.slot.length);
    for (let v = 0; v < mask.length; v++) mask[v] = lit[model.slot[v]!] === true ? 1 : 0;
    mesh.userData.glow = mask;
  }
  return mesh;
}

/** The circles a building of the kit keeps, in its plot's frame before the yaw: one, or a row along a long side. */
export function circlesOf(id: string, scale: number, forward: number): { x: number; z: number; r: number }[] {
  const info = PIECES[id];
  if (info === undefined) return [{ x: 0, z: forward, r: GUESS * scale }];
  const s = info.scale * scale;
  const w = info.size[0] * s;
  const d = info.size[2] * s;
  const long = Math.max(w, d);
  const short = Math.min(w, d);
  if (long < short * 1.4) return [{ x: 0, z: forward, r: (long / 2) * 0.96 }];
  const n = Math.ceil(long / short);
  const out: { x: number; z: number; r: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * (long - short);
    out.push(w > d ? { x: t, z: forward, r: (short / 2) * 1.02 } : { x: 0, z: forward + t, r: (short / 2) * 1.02 });
  }
  return out;
}

export function createSettlements(spec: WorldSpec, terrain: Terrain, ctx: SceneryContext, gradientMap: THREE.Texture): Settlements {
  const body = spec.body;
  const R = terrain.radius;
  const deck = spec.ground === 'cloud-deck';
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const colony = style.colony;
  const padOf = new Map<string, Pad>(terrain.pads.map((pad) => [pad.id, pad]));
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.name = 'world:towns';
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01], outlineNormal: true };
  // What glows: a per-vertex weight, laid on as emission in the vertex's own
  // colour and scaled by one uniform the loop turns up after dark. Past the
  // tone map's white it blooms, which is what makes a lamp a lamp.
  const glowUniform = { value: 0.6 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = glowUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;');
  };
  material.customProgramCacheKey = () => 'world:towns';
  // And the lamps and doorways round the traveller light it after dark (`night.ts`).
  litAtNight(material);
  const glowColors = new Set<number>(style.glow ?? []);
  /**
   * The garden plants a grid town sets in its planters and yards: the
   * colony's, those under `SMALL_PLANT` triangles where it has any — a
   * town's hundreds of planters are a budget, and a tree of the pack is two
   * thousand triangles.
   */
  const smallPlants = (() => {
    const all = colony?.gardens ?? [];
    // None small, none at all: a tree of the pack in every planter of a
    // city was a hundred thousand triangles of planters.
    return all.filter((id) => (SCATTER[id]?.triangles ?? 0) <= SMALL_PLANT);
  })();
  const avenueHalf = avenueHalfOf(spec);
  const group = new THREE.Group();
  group.name = 'world-towns';

  /**
   * What each of the civilisation's own forms costs, triangles, built once:
   * the grid towns' budget spends it (`town-grid.ts`), and a form's cost is
   * whatever it is drawn with — Saturn's hanging garden is five times a dome.
   */
  const formCost = new Map<string, number>();
  for (const { item } of style.forms) {
    const built = buildForm(ctx, rngFrom('worlds', spec.id, 'cost', item), style, item, 1);
    let triangles = 0;
    built.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
      mesh.geometry.dispose();
    });
    formCost.set(item, Math.round(triangles));
  }
  const unit = [0, 0, 0];
  const sites: Site[] = [];
  const addSite = (id: string, name: string, nation: string, population: number, lat: number, lon: number, radius: number, landmark: boolean): void => {
    toUnit(lat, lon, unit);
    const dir = new THREE.Vector3(unit[0], unit[1], unit[2]);
    const pad = padOf.get(id);
    const height = pad?.height ?? terrain.heightAt(dir.x, dir.y, dir.z);
    const town = !landmark && colony !== undefined ? gridTownOf(spec, id, radius, population, formCost) : null;
    const laid = town === null ? layoutOf(spec, id, radius, landmark) : null;
    // A grid town's streets run the four ways from its middle, and its
    // "square" is the crossing there.
    const plaza = town === null ? laid!.plaza : town.grid.pitch * 0.5;
    const avenues = town === null ? laid!.avenues : [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const paving = town === null ? laid!.paving : radius * 0.96;
    sites.push({
      id,
      name,
      nation,
      population,
      radius,
      paving,
      plaza,
      avenues,
      avenueHalf,
      dir,
      origin: dir.clone().multiplyScalar(R + height),
      quaternion: frameAt(dir, new THREE.Quaternion()),
      floor: deck ? PLATFORM_LIFT : 0,
      landmark,
      footprints: [],
      port: null,
      mesh: null,
      kit: false,
      town,
    });
  };
  for (const place of body.settlements) {
    addSite(place.id, place.name, place.nation, place.population, place.lat, place.lon, townRadii(body, spec.landmarks).get(place.id)!, false);
  }
  for (const mark of spec.landmarks) addSite(mark.id, mark.name, '', 0, mark.lat, mark.lon, mark.radius, true);

  const stats = { built: 0, triangles: 0, buildMs: 0, kit: 0 };

  /**
   * A town's lights in the world, once: each lamp's lantern, where
   * `gridLamp` hangs it over the kerb, and each building's doorway, a lamp's
   * height off its front — so a street at night is lit by its lamps and its
   * houses, as Earth's are by its lamps and its windows' spill.
   */
  const lights = new Map<string, Float32Array>();
  const spots = new Map<string, CraftSpot[]>();
  const found: { x: number; y: number; z: number; d: number }[] = [];
  const scratchLamp = new THREE.Vector3();
  function lightsOf(site: Site): Float32Array {
    const known = lights.get(site.id);
    if (known !== undefined) return known;
    const town = site.town!;
    const out: number[] = [];
    const at = new THREE.Vector3();
    const push = (x: number, y: number, z: number): void => {
      at.set(x, y, z).applyQuaternion(site.quaternion).add(site.origin);
      out.push(at.x, at.y, at.z);
    };
    for (const lamp of town.lamps) push(lamp.x + Math.sin(lamp.yaw) * 1.15, site.floor + CARRIAGE_TOP + LAMP_HEIGHT - 0.5, lamp.z + Math.cos(lamp.yaw) * 1.15);
    for (const plot of town.plots) {
      if (plot.kind !== 'module' && plot.kind !== 'hub') continue;
      const deep = planOf(plot.form, plot.scale)[1];
      const out1 = deep / 2 + 1.2;
      push(plot.x + Math.sin(plot.yaw) * out1, site.floor + DOOR_LIGHT, plot.z + Math.cos(plot.yaw) * out1);
    }
    const heads = new Float32Array(out);
    lights.set(site.id, heads);
    return heads;
  }
  // The roads, a function of the towns: which main street ends lead somewhere.
  const network = roadNetwork(spec, sites, terrain);

  /**
   * A kit piece standing in `draft`: re-centred from the pack's frame onto
   * its own middle and the floor, scaled to `size` world units a pack unit,
   * turned. `extra` is set in the same pack frame (a roof piece, the cradle
   * under a pod). Returns its height, or 0 if the piece is not loaded.
   */
  function placeModel(kit: WorldKit, draft: THREE.Group, id: string, paint: (id: string, glass: Set<string>) => Paint, size: number, x: number, y: number, z: number, yaw: number, extra: readonly string[] = []): number {
    const piece = kit.pieces.get(id);
    if (piece === undefined) return 0;
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    const glass = new Set<string>();
    inner.add(pieceMesh(piece.model, paint(id, glass), glass));
    for (const more of extra) {
      const part = kit.pieces.get(more);
      if (part === undefined) continue;
      const partGlass = new Set<string>();
      inner.add(pieceMesh(part.model, paint(more, partGlass), partGlass));
    }
    const box = piece.model.box;
    inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    holder.add(inner);
    holder.scale.setScalar(size);
    holder.rotation.y = yaw;
    holder.position.set(x, y, z);
    draft.add(holder);
    let top = box.max.y;
    for (const more of extra) top = Math.max(top, kit.pieces.get(more)?.model.box.max.y ?? top);
    return (top - box.min.y) * size;
  }

  /** A kit building in a livery, at a colony scale on top of its own (`PIECES`). */
  function placePiece(kit: WorldKit, draft: THREE.Group, id: string, livery: Livery, scale: number, x: number, y: number, z: number, yaw: number, extra: readonly string[] = []): number {
    const info = PIECES[id];
    if (info === undefined) return 0;
    return placeModel(kit, draft, id, (one, glass) => buildingPaint(one, livery, glass), info.scale * scale, x, y, z, yaw, extra);
  }

  /** A plant or a prop of the kit, at its own size (`SCATTER`) times `scale`. */
  function placeScatter(kit: WorldKit, draft: THREE.Group, id: string, livery: Livery | null, scale: number, x: number, y: number, z: number, yaw: number): number {
    const info = SCATTER[id];
    if (info === undefined) return 0;
    return placeModel(kit, draft, id, () => craftPaint(livery), info.scale * scale, x, y, z, yaw);
  }

  /** A plot built from the kit: the module, its cradle and roof, its yard; its circles into `footprints`. */
  function buildKitPlot(kit: WorldKit, site: Site, plot: Plot, draft: THREE.Group, footprints: Footprint[], part: number): void {
    const floor = site.floor;
    const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
    const livery = liveryOf(style, rng);
    const cos = Math.cos(plot.yaw);
    const sin = Math.sin(plot.yaw);
    /** A point of the plot's frame (+Z its front) in the town's. */
    const at = (lx: number, lz: number): { x: number; z: number } => ({ x: plot.x + lx * cos + lz * sin, z: plot.z - lx * sin + lz * cos });
    const r = pieceRadius(plot.form, plot.scale);
    // With a yard the building stands forward in its plot, the yard behind it.
    const forward = plot.yard === true ? YARD / 2 : 0;
    const centre = at(0, forward);
    const extra: string[] = [];
    if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') extra.push('house-single-support');
    if (plot.roof !== undefined) extra.push(plot.roof);
    const height = placePiece(kit, draft, plot.form, livery, plot.scale, centre.x, floor, centre.z, plot.yaw, extra);
    for (const c of circlesOf(plot.form, plot.scale, forward)) {
      const p = at(c.x, c.z);
      footprints.push({ x: p.x, z: p.z, radius: c.r, height, part });
    }
    if (plot.yard !== true) return;
    // The yard: panels in a row, or a tank, a generator, a dish, a plant.
    const across = Math.min(r * 0.6, 3.6);
    const depth = forward - r - 2.3;
    const things = rng.between(2, 3);
    const gardens = colony?.gardens ?? [];
    for (let k = 0; k < things; k++) {
      const lx = -across + (2 * across * k) / (things - 1);
      const p = at(lx, depth);
      const roll = rng.unit();
      let made = 0;
      if (gardens.length > 0 && roll < 0.3) {
        made = placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.7, 0.95), p.x, floor, p.z, rng.range(0, Math.PI * 2));
      } else if (roll < 0.62) {
        made = placePiece(kit, draft, 'solar-ground', livery, 1, p.x, floor, p.z, plot.yaw + Math.PI);
      } else {
        const prop = rng.pick(['barrels', 'tank', 'generator', 'dish', 'jar']);
        made = PIECES[prop] !== undefined
          ? placePiece(kit, draft, prop, livery, 0.8, p.x, floor, p.z, plot.yaw + rng.range(-0.5, 0.5))
          : placeScatter(kit, draft, prop, livery, 1, p.x, floor, p.z, rng.range(0, Math.PI * 2));
      }
      // The yard is the module's: its things may stand close together.
      if (made > 0) footprints.push({ x: p.x, z: p.z, radius: 1.4, height: made, part });
    }
  }

  /** The hub in the square: the kit's centrepiece, a radar on its crown, dishes round it between the avenues. */
  function buildHub(kit: WorldKit, site: Site, plot: Plot, draft: THREE.Group, footprints: Footprint[]): void {
    const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
    const livery = liveryOf(style, rng);
    const id = plot.form;
    const height = placePiece(kit, draft, id, livery, plot.scale, 0, site.floor, 0, plot.yaw);
    const r = pieceRadius(id, plot.scale);
    footprints.push({ x: 0, z: 0, radius: r, height });
    if (id === 'base-large') {
      // The radar sits in the hub's open crown: authored for a pod's roof, so
      // set on the hub's own top instead.
      const info = PIECES[id]!;
      const lift = (info.size[1] - 0.3) * info.scale * plot.scale;
      placeModel(kit, draft, 'roof-radar', (one, glass) => buildingPaint(one, livery, glass), PIECES['roof-radar']!.scale * plot.scale * 1.3, 0, site.floor + lift, 0, plot.yaw);
    }
    // Dishes and beacons round it, midway between the avenues, outside the walk round the square.
    const ring = r + 6.5;
    if (ring + 2 > site.plaza) return;
    const gardens = colony?.gardens ?? [];
    site.avenues.forEach((a, k) => {
      const next = site.avenues[(k + 1) % site.avenues.length]! + (k === site.avenues.length - 1 ? Math.PI * 2 : 0);
      const mid = (a + next) / 2;
      const x = Math.sin(mid) * ring;
      const z = Math.cos(mid) * ring;
      const what = k % 2 === 0 ? 'dish-large' : 'beacon';
      const made = placePiece(kit, draft, what, livery, 1, x, site.floor, z, mid + Math.PI);
      if (made > 0) footprints.push({ x, z, radius: 1.6, height: made });
      if (gardens.length > 0 && k % 2 === 1 && site.plaza - 2.5 > ring + 3) {
        const px = Math.sin(mid) * (site.plaza - 2.5);
        const pz = Math.cos(mid) * (site.plaza - 2.5);
        const grown = placeScatter(kit, draft, rng.pick(gardens), null, 1, px, site.floor, pz, rng.range(0, Math.PI * 2));
        if (grown > 0) footprints.push({ x: px, z: pz, radius: 1.2, height: grown });
      }
    });
  }

  /** The landing pad: a marked disc, beacons round it, a ship parked on it. */
  function buildPad(kit: WorldKit | null, site: Site, plot: Plot, draft: THREE.Group, footprints: Footprint[]): void {
    const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
    const livery = liveryOf(style, rng);
    const PAD = plot.room ?? PAD_RADIUS;
    const disc = ctx.column(PAD, 0.5, ctx.tone(style.ground, 0.78), 24);
    disc.position.set(plot.x, site.floor - 0.3, plot.z);
    draft.add(disc);
    const ring = ctx.ringWall(PAD * 0.62, PAD * 0.7, 0.55, livery.accent, 24);
    ring.position.set(plot.x, site.floor - 0.3, plot.z);
    draft.add(ring);
    for (let k = 0; k < 4; k++) {
      const a = plot.yaw + Math.PI / 4 + (k / 4) * Math.PI * 2;
      const x = plot.x + Math.sin(a) * (PAD - 1.2);
      const z = plot.z + Math.cos(a) * (PAD - 1.2);
      if (kit !== null) {
        const made = placePiece(kit, draft, 'beacon', livery, 0.55, x, site.floor, z, a);
        if (made > 0) footprints.push({ x, z, radius: 1, height: made });
      } else {
        const post = ctx.lit(ctx.column(0.35, 2.4, livery.accent, 6));
        post.position.set(x, site.floor, z);
        draft.add(post);
      }
    }
    site.port = { x: plot.x, z: plot.z, r: PAD, yaw: plot.yaw };
    // Its ship is a craft to take (`craftAt`), standing on the disc.
  }

  /** The tubes between neighbours in a row: a connector stretched from hull to hull, at the doors' height. */
  function buildTubes(kit: WorldKit, site: Site, plots: readonly Plot[], draft: THREE.Group, footprints: Footprint[]): void {
    if (colony?.tubes !== true) return;
    const tube = kit.pieces.get('connector');
    if (tube === undefined) return;
    const rows = new Map<number, Plot[]>();
    for (const plot of plots) {
      if (plot.row === undefined || PIECES[plot.form]?.joins !== true) continue;
      const row = rows.get(plot.row) ?? [];
      row.push(plot);
      rows.set(plot.row, row);
    }
    let part = 10000;
    const centreOf = (p: Plot): { x: number; z: number } => {
      const f = p.yard === true ? YARD / 2 : 0;
      return { x: p.x + Math.sin(p.yaw) * f, z: p.z + Math.cos(p.yaw) * f };
    };
    for (const row of rows.values()) {
      row.sort((a, b) => a.place! - b.place!);
      for (let k = 0; k + 1 < row.length; k++) {
        const a = row[k]!;
        const b = row[k + 1]!;
        if (b.place !== a.place! + 1) continue;
        const ca = centreOf(a);
        const cb = centreOf(b);
        const ra = pieceRadius(a.form, a.scale);
        const rb = pieceRadius(b.form, b.scale);
        const dx = cb.x - ca.x;
        const dz = cb.z - ca.z;
        const d = Math.hypot(dx, dz);
        const gap = d - ra - rb;
        if (gap < 1.5 || gap > 16) continue;
        const ux = dx / d;
        const uz = dz / d;
        const from = { x: ca.x + ux * ra * 0.72, z: ca.z + uz * ra * 0.72 };
        const to = { x: cb.x - ux * rb * 0.72, z: cb.z - uz * rb * 0.72 };
        const length = Math.hypot(to.x - from.x, to.z - from.z);
        const s = PIECES.connector!.scale * (colony.scale ?? 1);
        const livery = liveryOf(style, rngFrom('worlds', spec.id, 'tube', a.seed));
        const holder = new THREE.Group();
        const mesh = pieceMesh(tube.model, buildingPaint('connector', livery), null);
        const box = tube.model.box;
        // Along +X from its start, the tube's own height kept: it is authored at a door's.
        mesh.position.set(-box.min.x, 0, -(box.min.z + box.max.z) / 2);
        holder.add(mesh);
        holder.scale.set(length / (box.max.x - box.min.x), s, s);
        holder.rotation.y = Math.atan2(-uz, ux);
        holder.position.set(from.x, site.floor, from.z);
        draft.add(holder);
        const radius = ((box.max.z - box.min.z) / 2) * s;
        const top = box.max.y * s;
        const beads = Math.max(2, Math.ceil(length / (radius * 1.2)));
        for (let n = 0; n <= beads; n++) {
          const t = n / beads;
          footprints.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, radius, height: top, part });
        }
        part++;
      }
    }
  }

  /** A gate over each avenue where it leaves the paving, in a town past a hamlet: its two posts are the walls. */
  function buildGates(kit: WorldKit, site: Site, draft: THREE.Group, footprints: Footprint[]): void {
    if (site.radius < HAMLET) return;
    const info = PIECES.gate!;
    // As wide as the street and its kerbs, and tall enough for its people to walk under.
    const span = Math.max((site.avenueHalf + 1.6) * 2, (spec.civilisation?.species.morph.height ?? 0) * 1.35);
    for (const a of site.avenues) {
      const livery = liveryOf(style, rngFrom('worlds', spec.id, 'gate', site.id, a.toFixed(3)));
      const d = site.paving - 2.5;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const height = placePiece(kit, draft, 'gate', livery, span / (info.size[0] * info.scale), x, site.floor, z, a);
      if (height === 0) return;
      for (const side of [-1, 1]) {
        const off = (span / 2) * 0.86;
        footprints.push({ x: x + Math.cos(a) * off * side, z: z - Math.sin(a) * off * side, radius: 0.9, height });
      }
    }
  }

  /**
   * **A town laid out as Earth's** (`town-grid.ts`), built: the street plan
   * drawn on the floor — the yards, the carriageways, the pavements standing
   * a kerb over them, a lit line down the main streets — then one building a
   * plot facing its street with its yard behind it, the hub, the landing pad,
   * the lamps and planters on the pavements, craft parked on the main
   * streets, and a gate where each main street leaves the square.
   */
  function buildGridTown(kit: WorldKit | null, site: Site, town: GridTown, draft: THREE.Group, footprints: Footprint[]): void {
    const floor = site.floor;
    const half = town.grid.half;
    const accent = style.accents[0] ?? PALETTE.gold;
    // **No slab: the yards are the planet's own ground**, as a Terran town's
    // lawns are its land. The terrain levels a town's pad to the town's own
    // plane (`terrain.ts`), so the ground there *is* the floor, and only the
    // street is drawn on it: the carriageway a cool grey that reads against
    // any ground, the pavement pale, each standing a little proud of the
    // ground and of each other. A slab in a colour of its own was a square
    // cut out of the planet. A cloud deck's platform keeps its own floor.
    const carriage = ctx.tone(PALETTE.steel, 1.25);
    const pavement = ctx.tone(PALETTE.bone, 1.04);
    if (deck) {
      const yard = ctx.box(half * 2 + 1.2, 0.8, half * 2 + 1.2, ctx.tone(style.ground, 1.08));
      yard.position.set(0, floor - 0.8, 0);
      draft.add(yard);
    }
    const KERB_TOP = 0.28;
    for (const street of town.streets) {
      const along = street.axis === 'x';
      const width = (street.half - street.walk) * 2;
      // The carriageways one way a hair over the other, where they cross.
      const lift = along ? 0.012 : 0;
      const road = ctx.box(along ? half * 2 : width, 0.3, along ? width : half * 2, carriage);
      road.position.set(along ? 0 : street.at, floor + CARRIAGE_TOP + lift - 0.3, along ? street.at : 0);
      draft.add(road);
      // The pavements, cut at every crossing, a kerb's height over the road.
      const crossings = town.streets
        .filter((other) => other.axis !== street.axis)
        .map((other) => [other.at - other.half + other.walk, other.at + other.half - other.walk] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      const runs: [number, number][] = [];
      let from = -half;
      for (const [lo, hi] of crossings) {
        if (lo > from) runs.push([from, lo]);
        from = Math.max(from, hi);
      }
      if (from < half) runs.push([from, half]);
      for (const side of [-1, 1]) {
        const centre = street.at + side * (street.half - street.walk / 2);
        for (const [a, b] of runs) {
          const length = b - a;
          if (length < 0.5) continue;
          const walk = ctx.box(along ? length : street.walk, KERB_TOP + 0.3, along ? street.walk : length, pavement);
          walk.position.set(along ? (a + b) / 2 : centre, floor - 0.3, along ? centre : (a + b) / 2);
          draft.add(walk);
        }
      }
      // A lit line down the middle of a main street: the civilisation's
      // accent, dashed, glowing after dark.
      if (street.main && width > 4) {
        for (let t = -half + 2; t < half - 2; t += 5.5) {
          const dash = ctx.lit(ctx.box(along ? 2.6 : 0.32, 0.04, along ? 0.32 : 2.6, accent), 0.8);
          dash.position.set(along ? t + 1.3 : street.at, floor + CARRIAGE_TOP + lift, along ? street.at : t + 1.3);
          draft.add(dash);
        }
      }
    }

    // **Where the streets end.** A main street goes on past the square as a
    // track of trodden ground — the carriageway's width narrowing, its grey
    // giving way to the ground's own colour — until it is the planet again;
    // any other street is closed by its pavement turning across its end.
    // A street cut off square at the edge was a road sawn through.
    for (const street of town.streets) {
      const along = street.axis === 'x';
      for (const end of [-1, 1]) {
        if (street.main && !deck) {
          // A road leaves by this end: it carries the street on (`roads.ts`).
          const gate: Gate = along ? (end > 0 ? 'w' : 'e') : end > 0 ? 'n' : 's';
          if (network.ends.get(site.id)?.has(gate) !== true) layTrack(site, street.at, along, end, half, (street.half - street.walk) * 2, draft);
          continue;
        }
        const cap = ctx.box(along ? street.walk : street.half * 2, KERB_TOP + 0.3, along ? street.half * 2 : street.walk, pavement);
        const t = end * (half - street.walk / 2);
        cap.position.set(along ? t : street.at, floor - 0.3, along ? street.at : t);
        draft.add(cap);
      }
    }

    // The buildings.
    let part = 0;
    for (const plot of town.plots) {
      part++;
      if (plot.kind === 'pad') {
        buildPad(kit, site, { form: 'pad', x: plot.x, z: plot.z, yaw: plot.yaw, scale: 1, seed: plot.seed, room: plot.scale }, draft, footprints);
        continue;
      }
      if (plot.kind === 'lot') {
        if (kit !== null) dressLot(kit, site, plot, draft, footprints, part);
        continue;
      }
      if (plot.kind !== 'garden') {
        if (kit !== null && isKitBuilding(plot.form)) placeGridBuilding(kit, site, plot, draft, footprints, part);
        else placeGridForm(site, plot, draft, footprints);
      }
      if (plot.yard !== null && kit !== null) dressYard(kit, site, plot, draft, footprints, part);
    }

    // On the pavements: lamps, planters.
    for (const lamp of town.lamps) {
      const post = gridLamp(accent);
      // On the carriageway's edge, against the kerb.
      post.position.set(lamp.x, floor + CARRIAGE_TOP, lamp.z);
      post.rotation.y = lamp.yaw;
      draft.add(post);
      footprints.push({ x: lamp.x, z: lamp.z, radius: 0.35, height: LAMP_HEIGHT });
    }
    const gardens = smallPlants;
    town.planters.forEach((spot, k) => {
      const rng = rngFrom('worlds', spec.id, 'planter', site.id, k);
      const box = ctx.box(1.5, 0.75, 1.5, ctx.tone(style.walls[0] ?? PALETTE.cream, 0.92));
      box.position.set(spot.x, floor + KERB_TOP, spot.z);
      draft.add(box);
      let grown = 0;
      if (kit !== null && gardens.length > 0) grown = placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.32, 0.45), spot.x, floor + KERB_TOP + 0.75, spot.z, rng.range(0, Math.PI * 2));
      footprints.push({ x: spot.x, z: spot.z, radius: 0.95, height: 0.75 + grown });
    });

    // The craft parked on the main streets are craft to take, not part of
    // the town's mesh (`craftAt`): a car you cannot get into is a picture.

    // A gate where each main street leaves the square.
    // No gates: the pack's arch is a hexagon twice a person's height that
    // stood in front of the lens wherever the traveller came in, and Earth's
    // towns have none either — a street simply leaves the square.
    if (GRID_GATES && kit !== null && town.grid.cells >= 5) {
      const info = PIECES.gate!;
      for (const street of town.streets) {
        if (!street.main) continue;
        const span = Math.max((street.half - street.walk) * 2 + 1.4, (spec.civilisation?.species.morph.height ?? 0) * 1.35);
        for (const end of [-1, 1]) {
          const t = end * (half - 1.2);
          const x = street.axis === 'x' ? t : street.at;
          const z = street.axis === 'x' ? street.at : t;
          const yaw = street.axis === 'x' ? Math.PI / 2 : 0;
          const livery = liveryOf(style, rngFrom('worlds', spec.id, 'gate', site.id, street.axis, end));
          const height = placePiece(kit, draft, 'gate', livery, span / (info.size[0] * info.scale), x, floor + CARRIAGE_TOP, z, yaw);
          if (height === 0) continue;
          for (const side of [-1, 1]) {
            const off = (span / 2) * 0.86 * side;
            footprints.push({ x: x + (street.axis === 'x' ? 0 : off), z: z + (street.axis === 'x' ? off : 0), radius: 0.9, height });
          }
        }
      }
    }
  }

  /**
   * A main street's track past the square's edge: segments out to the levelled
   * pad's rim, each narrower and nearer the ground's own colour than the last
   * (sampled off the terrain there), flat on the pad's plane.
   */
  function layTrack(site: Site, at: number, along: boolean, end: number, half: number, width: number, draft: THREE.Group): void {
    const reach = Math.max(8, Math.min(site.radius * 0.97, half + TRACK_LENGTH) - half);
    const steps = Math.max(3, Math.ceil(reach / TRACK_STEP));
    const local = new THREE.Vector3();
    const sample = newSample();
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const mid = half + reach * (t0 + t1) / 2;
      // The ground's colour where the segment lies, as the palette entry
      // nearest it and the tone that matches its brightness (`ctx` draws in
      // the palette only): trodden darker near the town, its own at the end.
      api.toWorld(site, along ? end * mid : at, 0, along ? at : end * mid, local).normalize();
      terrain.sample(local.x, local.y, local.z, sample);
      const ground = paletteToneOf(sample.r, sample.g, sample.b);
      const colour = t0 < 0.15 ? ctx.tone(PALETTE.steel, 1.1) : ctx.tone(ground.base, Math.min(1.5, Math.max(0.5, ground.factor * (0.8 + 0.2 * Math.min(1, (t0 - 0.15) / 0.6)))));
      const w = width * (1 - t0 * 0.62);
      const length = reach / steps + 0.05;
      const piece = ctx.box(along ? length : w, 0.3, along ? w : length, colour);
      piece.position.set(along ? end * mid : at, site.floor + 0.1 - 0.3 - k * 0.004, along ? at : end * mid);
      draft.add(piece);
    }
  }

  /** A kit building on its grid plot: the module, its cradle and roof, its circles. */
  function placeGridBuilding(kit: WorldKit, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[], part: number): void {
    const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
    const livery = liveryOf(style, rng);
    const extra: string[] = [];
    if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') extra.push('house-single-support');
    if (plot.roof !== undefined) extra.push(plot.roof);
    const height = placePiece(kit, draft, plot.form, livery, plot.scale, plot.x, site.floor, plot.z, plot.yaw, extra);
    if (plot.kind === 'hub' && plot.form === 'base-large') {
      const info = PIECES[plot.form]!;
      const lift = (info.size[1] - 0.3) * info.scale * plot.scale;
      placeModel(kit, draft, 'roof-radar', (one, glass) => buildingPaint(one, livery, glass), PIECES['roof-radar']!.scale * plot.scale * 1.3, plot.x, site.floor + lift, plot.z, plot.yaw);
    }
    const cos = Math.cos(plot.yaw);
    const sin = Math.sin(plot.yaw);
    for (const c of circlesOf(plot.form, plot.scale, 0)) {
      footprints.push({ x: plot.x + c.x * cos + c.z * sin, z: plot.z - c.x * sin + c.z * cos, radius: c.r, height, part });
    }
  }

  /** A form built in code on a grid plot, while the kit is not here: fitted to the plot. */
  function placeGridForm(site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[]): void {
    const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
    // The form the layout chose and counted; a kit module's plot drawn while
    // the kit is not here takes one of the forms instead.
    const form = style.forms.some((one) => one.item === plot.form) ? plot.form : rng.weighted(style.forms);
    const [x0, z0, x1, z1] = plot.rect;
    const room = Math.min(x1 - x0, z1 - z0) / 2 - 1;
    if (room < 2) return;
    const built = buildForm(ctx, rng, style, form, 1);
    if (built.radius > room) {
      built.group.scale.multiplyScalar(room / built.radius);
      built.radius = room;
    }
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    built.group.position.set(x, site.floor, z);
    built.group.rotation.y = plot.yaw;
    draft.add(built.group);
    const box = new THREE.Box3().setFromObject(built.group);
    footprints.push({ x, z, radius: built.radius, height: box.max.y - site.floor });
  }

  /** An empty lot at the town's edge: the planet's own ground, and now and then a crate, a barrel or a tank on it. */
  function dressLot(kit: WorldKit, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[], part: number): void {
    const rng = rngFrom('worlds', spec.id, 'lot', plot.seed);
    if (!rng.chance(0.35)) return;
    const [x0, z0, x1, z1] = plot.rect;
    const x = x0 + (x1 - x0) * rng.range(0.25, 0.75);
    const z = z0 + (z1 - z0) * rng.range(0.25, 0.75);
    const livery = liveryOf(style, rng);
    const prop = rng.pick(['barrels', 'tank', 'generator']);
    const made = PIECES[prop] !== undefined
      ? placePiece(kit, draft, prop, livery, 0.7, x, site.floor, z, rng.range(0, Math.PI * 2))
      : placeScatter(kit, draft, prop, livery, 0.8, x, site.floor, z, rng.range(0, Math.PI * 2));
    if (made > 0) footprints.push({ x, z, radius: 1.2, height: made, part });
  }

  /**
   * A yard: what a household keeps behind its house — panels, a tank, crates,
   * a plant or two — set out in a row across it, never touching.
   */
  function dressYard(kit: WorldKit, site: Site, plot: GridPlot, draft: THREE.Group, footprints: Footprint[], part: number): void {
    const [x0, z0, x1, z1] = plot.yard!;
    const rng = rngFrom('worlds', spec.id, 'yard', plot.seed);
    const livery = liveryOf(style, rng);
    const wide = x1 - x0 > z1 - z0;
    const length = wide ? x1 - x0 : z1 - z0;
    const depth = wide ? z1 - z0 : x1 - x0;
    if (depth < 2.2 || length < 2.5) return;
    const count = Math.max(1, Math.min(plot.kind === 'garden' ? 3 : 2, Math.floor(length / 3.2)));
    const gardens = smallPlants;
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const x = wide ? x0 + (x1 - x0) * t : (x0 + x1) / 2 + rng.range(-0.3, 0.3) * (depth - 2);
      const z = wide ? (z0 + z1) / 2 + rng.range(-0.3, 0.3) * (depth - 2) : z0 + (z1 - z0) * t;
      const roll = rng.unit();
      let made = 0;
      if (gardens.length > 0 && (roll < 0.38 || plot.kind === 'garden')) {
        made = placeScatter(kit, draft, rng.pick(gardens), null, rng.range(0.5, 0.75), x, site.floor, z, rng.range(0, Math.PI * 2));
      } else if (roll < 0.66) {
        made = placePiece(kit, draft, 'solar-ground', livery, 1, x, site.floor, z, plot.yaw + Math.PI);
      } else {
        const prop = rng.pick(['barrels', 'tank', 'generator', 'crate', 'jar']);
        made = PIECES[prop] !== undefined
          ? placePiece(kit, draft, prop, livery, 0.7, x, site.floor, z, plot.yaw + rng.range(-0.5, 0.5))
          : placeScatter(kit, draft, prop, livery, 0.8, x, site.floor, z, rng.range(0, Math.PI * 2));
      }
      if (made > 0) footprints.push({ x, z, radius: 1.2, height: made, part });
    }
  }

  /**
   * A street lamp: a slim post, an arm over the kerb and a lantern in the
   * civilisation's accent that glows after dark. Code-built: no pack lamp is
   * in the style, and a lamp is four shapes.
   */
  function gridLamp(accent: number): THREE.Group {
    const lamp = new THREE.Group();
    const steel = ctx.tone(PALETTE.steel, 1.1);
    const foot = ctx.column(0.32, 0.35, steel, 6);
    lamp.add(foot);
    const post = ctx.column(0.13, LAMP_HEIGHT - 0.3, steel, 5);
    lamp.add(post);
    const arm = ctx.box(0.18, 0.18, 1.3, steel);
    arm.position.set(0, LAMP_HEIGHT - 0.4, 0.6);
    lamp.add(arm);
    const lantern = ctx.lit(ctx.taper(0.42, 0.22, 0.42, accent, 6));
    lantern.rotation.x = Math.PI;
    lantern.position.set(0, LAMP_HEIGHT - 0.22, 1.15);
    lamp.add(lantern);
    return lamp;
  }

  function build(site: Site): void {
    const began = performance.now();
    const kit = colony !== undefined ? worldKit() : null;
    const draft = new THREE.Group();
    const floor = site.floor;
    // The floor: paving flush with the levelled ground, or a platform.
    if (deck) {
      const platform = ctx.column(site.paving + 2, PLATFORM_LIFT + 1.2, style.ground, 28);
      platform.position.y = -1.2;
      draft.add(platform);
      const keel = ctx.taper(site.paving * 0.2, site.paving * 0.9, 5, ctx.tone(style.ground, 0.8), 14);
      keel.rotation.x = Math.PI;
      keel.position.y = -1.2;
      draft.add(keel);
    } else if (site.town === null) {
      const paving = ctx.column(site.paving, 0.45, style.ground, 28);
      paving.position.y = -0.4;
      draft.add(paving);
      if (!site.landmark) {
        const square = ctx.column(site.plaza, 0.45, ctx.tone(style.ground, 1.12), 20);
        square.position.y = -0.38;
        draft.add(square);
      }
    }
    if (!site.landmark && colony !== undefined && site.town === null) {
      // The avenues paved a shade darker, so the street plan reads from above.
      for (const a of site.avenues) {
        const length = site.paving - site.plaza;
        const lane = ctx.box(site.avenueHalf * 2, 0.45, length, ctx.tone(style.ground, 0.88));
        lane.position.set(Math.sin(a) * (site.plaza + length / 2), floor - 0.36, Math.cos(a) * (site.plaza + length / 2));
        lane.rotation.y = a;
        draft.add(lane);
      }
    }
    const footprints: Footprint[] = [];
    site.port = null;
    if (site.landmark) {
      const mark = spec.landmarks.find((one) => one.id === site.id)!;
      const made = mark.build(ctx, rngFrom('worlds', spec.id, 'landmark', mark.id));
      made.position.y = floor;
      draft.add(made);
      footprints.push({ x: 0, z: 0, radius: mark.radius * 0.6, height: 40 });
    } else if (site.town !== null) {
      buildGridTown(kit, site, site.town, draft, footprints);
    } else {
      const { plots } = layoutOf(spec, site.id, site.radius, false);
      plots.forEach((plot, k) => {
        if (k === 0 && kit !== null && isKitBuilding(plot.form)) {
          buildHub(kit, site, plot, draft, footprints);
          return;
        }
        if (plot.form === 'pad') {
          buildPad(kit, site, plot, draft, footprints);
          return;
        }
        if (kit !== null && isKitBuilding(plot.form)) {
          buildKitPlot(kit, site, plot, draft, footprints, k);
          return;
        }
        // In code: a form of the civilisation's own, or the stand-in for a
        // kit module while the kit is not here.
        const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
        const standIn = isKitBuilding(plot.form);
        const form = standIn ? (k === 0 ? style.landmark : rng.weighted(style.forms)) : plot.form;
        const scale = standIn ? (k === 0 ? (site.radius < HAMLET ? 0.8 : 1.5) : Math.min(1.1, (plot.room ?? GUESS) / GUESS)) : plot.scale;
        const built = buildForm(ctx, rng, style, form, scale);
        // The centrepiece fits its square with a walk round it, so the way in
        // from every avenue sees across the square: one that comes out wider
        // is built smaller.
        const fit = site.plaza * 0.82 - 1;
        if (k === 0 && built.radius > fit && fit > 1) {
          built.group.scale.multiplyScalar(fit / built.radius);
          built.radius = fit;
        }
        // The layout guessed every radius; the true one is known now. A
        // building that turns out to reach into an avenue or into a building
        // already standing is let go — the streets are the walkers' only
        // routes and a wall in one is a walker walking through it.
        const reaches =
          k > 0 &&
          (footprints.some((f) => Math.hypot(f.x - plot.x, f.z - plot.z) < (f.radius + built.radius) * 0.95) ||
            site.avenues.some((avenue) => {
              const along = plot.x * Math.sin(avenue) + plot.z * Math.cos(avenue);
              return along > 0 && Math.abs(plot.x * Math.cos(avenue) - plot.z * Math.sin(avenue)) < site.avenueHalf + built.radius * 0.97;
            }));
        if (reaches) {
          built.group.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh === true) mesh.geometry.dispose();
          });
          return;
        }
        built.group.position.set(plot.x, floor, plot.z);
        built.group.rotation.y = plot.yaw;
        draft.add(built.group);
        const box = new THREE.Box3().setFromObject(built.group);
        footprints.push({ x: plot.x, z: plot.z, radius: built.radius, height: box.max.y - floor });
      });
      if (kit !== null) {
        buildTubes(kit, site, plots, draft, footprints);
        buildGates(kit, site, draft, footprints);
      }
    }
    const pieces: MergePiece[] = [];
    const merged = mergeMeshes(draft, pieces);
    const glow = new Float32Array(merged.position.length / 3);
    for (const piece of pieces) {
      const mask = piece.mesh.userData.glow as Uint8Array | undefined;
      if (mask !== undefined) {
        for (let i = 0; i < piece.count; i++) if (mask[sourceVertex(piece, i)] === 1) glow[piece.first + i] = 1;
        continue;
      }
      const lit = typeof piece.mesh.userData.atlasLit === 'number' ? (piece.mesh.userData.atlasLit as number) : 0;
      const stamped = piece.material.userData.atlasToon as number | undefined;
      const value = Math.max(lit, stamped !== undefined && glowColors.has(stamped) ? 1 : 0);
      if (value > 0) glow.fill(value, piece.first, piece.first + piece.count);
    }
    draft.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh === true && mesh.userData.shared !== true) mesh.geometry.dispose();
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(merged.outline, 3));
    geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `town ${site.id}`;
    mesh.position.copy(site.origin);
    mesh.quaternion.copy(site.quaternion);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    site.mesh = mesh;
    site.footprints = footprints;
    site.kit = kit !== null;
    stats.built++;
    if (site.kit) stats.kit++;
    stats.triangles += merged.triangles;
    stats.buildMs = performance.now() - began;
  }

  function drop(site: Site): void {
    if (site.mesh === null) return;
    group.remove(site.mesh);
    stats.triangles -= site.mesh.geometry.getAttribute('position').count / 3;
    site.mesh.geometry.dispose();
    site.mesh = null;
    site.footprints = [];
    site.port = null;
    if (site.kit) stats.kit--;
    site.kit = false;
    stats.built--;
  }

  // When the kit arrives, the towns built from the stand-ins go, and the
  // stream builds them again from it.
  const unsubscribe =
    colony === undefined
      ? () => true
      : onWorldKit(() => {
          for (const site of sites) if (site.mesh !== null && !site.kit && !site.landmark) drop(site);
        });

  // The beacons: every town as a mark in its accent, seen from far off and
  // from the air, which is how anybody finds one on a planet this size.
  const beaconPositions = new Float32Array(sites.length * 3);
  const beaconColors = new Float32Array(sites.length * 3);
  const accent = linearOf(style.accents[0] ?? 0xe4a90c);
  sites.forEach((site, k) => {
    const p = site.origin.clone().addScaledVector(site.dir, 30);
    beaconPositions.set([p.x, p.y, p.z], k * 3);
    beaconColors.set([accent[0] * 3, accent[1] * 3, accent[2] * 3], k * 3);
  });
  const beaconGeometry = new THREE.BufferGeometry();
  beaconGeometry.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3));
  beaconGeometry.setAttribute('color', new THREE.BufferAttribute(beaconColors, 3));
  const beacons = new THREE.Points(
    beaconGeometry,
    new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }),
  );
  beacons.name = 'world-beacons';
  beacons.frustumCulled = false;
  group.add(beacons);

  const local = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  function toLocal(site: Site, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(point).sub(site.origin).applyQuaternion(inverse.copy(site.quaternion).invert());
  }

  const api: Settlements = {
    group,
    sites,
    stats,
    network,
    reach: 1,
    update(eye) {
      let wanted: Site | null = null;
      let best = Infinity;
      for (const site of sites) {
        const d = eye.distanceTo(site.origin);
        if (site.mesh !== null) {
          if (d > site.radius + DROP_REACH * api.reach) drop(site);
        } else if (d < site.radius + BUILD_REACH * api.reach && d < best) {
          best = d;
          wanted = site;
        }
      }
      if (wanted !== null) build(wanted);
    },
    prime(eye) {
      for (const site of sites) {
        if (site.mesh === null && eye.distanceTo(site.origin) < site.radius + BUILD_REACH * api.reach) build(site);
      }
    },
    collide(position, radius) {
      let moved = false;
      for (const site of sites) {
        if (site.mesh === null || position.distanceTo(site.origin) > site.radius + 60) continue;
        toLocal(site, position, local);
        let changed = false;
        for (const f of site.footprints) {
          if (local.y > site.floor + f.height) continue;
          const dx = local.x - f.x;
          const dz = local.z - f.z;
          const d = Math.hypot(dx, dz);
          const min = f.radius + radius;
          if (d >= min) continue;
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          local.x = f.x + nx * min;
          local.z = f.z + nz * min;
          changed = true;
        }
        if (changed) {
          local.applyQuaternion(site.quaternion).add(site.origin);
          // Keep the radial distance: the push is sideways only.
          const keep = position.length();
          position.copy(local).setLength(keep);
          moved = true;
        }
      }
      return moved;
    },
    craftAt(site) {
      const known = spots.get(site.id);
      if (known !== undefined) return known;
      const out: CraftSpot[] = [];
      if (site.landmark) {
        for (const one of spec.landmarks.find((mark) => mark.id === site.id)?.craft ?? []) out.push({ ...one, y: site.floor });
      } else if (site.town !== null) {
        const town = site.town;
        town.parked.forEach((spot, k) => {
          const rng = rngFrom('worlds', spec.id, 'parked', site.id, k);
          const livery = liveryOf(style, rng);
          const kit = deck ? DEFAULT_KITS.skiff! : rng.pick(PARKED_KITS);
          out.push({
            vehicle: { kind: deck ? 'skiff' : 'rover', name: deck ? 'the skiff' : 'the rover', kit: { ...kit, livery: { wall: livery.wall, roof: livery.roof, accent: livery.accent } } },
            x: spot.x,
            y: site.floor + CARRIAGE_TOP,
            z: spot.z,
            yaw: spot.yaw,
          });
        });
        for (const plot of town.plots) {
          if (plot.kind !== 'pad') continue;
          const rng = rngFrom('worlds', spec.id, 'building', plot.seed);
          const livery = liveryOf(style, rng);
          out.push({
            vehicle: { kind: 'lander', name: 'the ship', kit: { ...DEFAULT_KITS.lander!, livery: { wall: livery.wall, roof: livery.roof, accent: livery.accent } } },
            x: plot.x,
            y: site.floor + 0.2,
            z: plot.z,
            yaw: plot.yaw,
          });
        }
      }
      spots.set(site.id, out);
      return out;
    },
    lampsNear(point, out, max) {
      found.length = 0;
      for (const site of sites) {
        if (site.mesh === null || site.town === null) continue;
        if (site.origin.distanceTo(point) > site.radius * 1.5 + LAMP_FIELD) continue;
        const heads = lightsOf(site);
        for (let k = 0; k < heads.length; k += 3) {
          scratchLamp.set(heads[k]!, heads[k + 1]!, heads[k + 2]!);
          const d = scratchLamp.distanceTo(point);
          if (d < LAMP_FIELD) found.push({ x: heads[k]!, y: heads[k + 1]!, z: heads[k + 2]!, d });
        }
      }
      found.sort((a, b) => a.d - b.d);
      const n = Math.min(max, found.length);
      for (let i = 0; i < n; i++) out.set([found[i]!.x, found[i]!.y, found[i]!.z, found[i]!.d], i * 4);
      return n;
    },
    floorAt(x, y, z) {
      if (!deck) return null;
      const length = Math.hypot(x, y, z) || 1;
      for (const site of sites) {
        const dot = (x * site.dir.x + y * site.dir.y + z * site.dir.z) / length;
        if (dot < 0.9) continue;
        const angle = Math.acos(Math.min(1, dot));
        // The plane's own distance from the centre, along it.
        const across = Math.tan(angle) * site.origin.length();
        if (across > site.paving + 2) continue;
        return site.origin.length() / dot - R + site.floor;
      }
      return null;
    },
    blocks(point) {
      for (const site of sites) {
        if (site.mesh === null || point.distanceTo(site.origin) > site.radius + 40) continue;
        toLocal(site, point, local);
        for (const f of site.footprints) {
          if (local.y < site.floor + f.height && Math.hypot(local.x - f.x, local.z - f.z) < f.radius) return true;
        }
      }
      return false;
    },
    nearest(dir, filter) {
      let found: Site | null = null;
      let best = -2;
      for (const site of sites) {
        if (filter !== undefined && !filter(site)) continue;
        const dot = dir.dot(site.dir);
        if (dot > best) {
          best = dot;
          found = site;
        }
      }
      return found === null ? null : { site: found, angle: Math.acos(Math.min(1, Math.max(-1, best))) };
    },
    toWorld(site, x, y, z, out) {
      return out.set(x, y, z).applyQuaternion(site.quaternion).add(site.origin);
    },
    get glow() {
      return glowUniform.value;
    },
    set glow(value: number) {
      glowUniform.value = value;
    },
    dispose() {
      unsubscribe();
      for (const site of sites) drop(site);
      material.dispose();
      beaconGeometry.dispose();
    },
  };
  return api;
}
