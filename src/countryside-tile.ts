import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import { gradeAt, reliefAt } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { mergeMeshes } from './merge.ts';
import { measure } from './scenery/contract.ts';
import type { RegionStyle, SceneryContext } from './scenery/contract.ts';
import { rngFrom } from './scenery/random.ts';
import { PALETTE } from './theme.ts';
import { drawnFootprint } from './land-probe.ts';
import type { DrawnFootprint, LandProbe } from './land-probe.ts';
import { COUNTRY_PARTS, ROTOR_RADIUS, buildRotor, pieceRng } from './countryside-kit.ts';
import { countryVehicleId, fleetVariant, parkedArrays, parkedModel } from './craft/parked.ts';
import type { RotorKind } from './countryside-kit.ts';
import type { BodyKind } from './scenery/occupancy.ts';
import { nearArrays } from './scenery/tree-forms.ts';
import type { LeafArrays } from './scenery/tree-forms.ts';
import type { CountryLine, CountryPiece, CountryPlan, CropField, CropId, Countryside } from './countryside.ts';
import { cellsOf, rootOf } from './tile-grid.ts';

/**
 * The countryside's plans made into a vegetation tile's geometry: the pieces
 * placed and bedded like the plants, the fields laid on the drawn land, the
 * fences along the ground — all into the tile's one merged buffer, in its own
 * frame, so the countryside shares the wood's levels, budgets and dissolve.
 *
 * **What a tile of each level draws of a plan.** Every piece that is legible
 * at the level's distance (`legibleFloor` in `vegetation.ts`, the rule the
 * plants follow), every field at every level — a patchwork of crops is what
 * farmland looks like from a thousand units up — but its rows and its bunds
 * only in the finest tiles, and fences only there. What the wood keeps off is
 * every piece, field and fence of every plan under the tile, at every level,
 * so no tree stands where a coarser tile has none and a finer one a barn.
 *
 * **A field lies on what is drawn, not on the relief.** The land is triangles
 * between points of the relief, up to a unit and a half off it on a tenth of
 * the ground (`land-probe.ts`), and a patch of wheat a quarter of a unit
 * over the relief is a patch of wheat under the land on a tenth of the
 * farmland. So where the land probe answers — the near field, where the grass
 * grows — a field's every vertex is the drawn land's own height and normal
 * plus its level's `FIELD_LIFTS`. Past it (a tile built from the air, before the probe has
 * gathered) a field stands `FAR_FIELD_LIFT` over the relief with a skirt down
 * into the ground, which from where it can be seen is a field; a near tile
 * built that way is marked provisional and built again once the probe answers.
 *
 * **What turns is not here.** A windmill's sails, a turbine's blades and a
 * windpump's wheel are merged standing still into the coarser tiles only; in
 * the two finest a tile hands its rotors, its lighthouses' lamps and its
 * campfires to `countryside-motion.ts` instead, as rows of numbers.
 */

/**
 * Over the drawn land, by level: a quarter of a unit clears the land's own
 * creases between a field's vertices, and the coarser levels, seen from
 * further, get more so the depth buffer can still tell the two apart — on
 * foot the near plane is about 1.8 and a step of depth at 1,600 units is 0.09.
 */
const FIELD_LIFTS = [0.22, 0.3, 0.5, 0.8];
/** Over the relief, where the drawn land cannot be asked; see above. */
const FAR_FIELD_LIFT = 1.6;
/** And how far the skirt of such a field goes into the ground below it. */
const FAR_SKIRT = 3.5;
/** The longest a field's strip runs between two heights, by level: the drawn land's creases are what it follows. */
const SEGMENT = [6, 12, 40, 80];
/** Levels whose tiles hand what turns to the moving mesh, rather than merging it still. */
export const MOTION_LEVEL = 1;
/** How far a piece is bedded, as in `vegetation.ts`'s `SEATING`: burying is invisible, floating is not. */
export const PIECE_BURY = 0.2;

/** The parts that are the fleet's own vehicles, standing still until one is taken (`CountryMachine`). */
const MACHINES: ReadonlySet<string> = new Set(['tractor']);

/** A flattened build: what `vegetation.ts` calls a `FlatVariant`. */
export interface CountryFlat {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  outline: Float32Array;
  triangles: number;
  height: number;
  footprint: number;
  tilt: number;
  /** What it is to a body walking into it (`vegetation.ts`'s `wallsOf`); absent, nothing. */
  solid?: BodyKind;
}

export interface CountryPlaced {
  flat: CountryFlat;
  matrix: THREE.Matrix4;
  /** A near tree's leaf cards and whether its wood bends in the wind (`vegetation.ts`'s `CARD_LEVEL`). */
  leaves?: LeafArrays | null;
  sways?: boolean;
  /** A vehicle that can be taken (a farm's tractor): its fleet id and where it stands. See `CountryMachine`. */
  machine?: CountryMachine;
}

/**
 * A vehicle the countryside stands that the fleet can take: a farm's tractor,
 * named `countryVehicleId` of its cell and its ordinal there, merged into its
 * tile as the fleet's own craft in the look its id decides (`craft/parked.ts`).
 */
export interface CountryMachine {
  id: string;
  /** The craft that takes its place. */
  model: string;
  /** Its base, and the way it faces, in the world. */
  position: THREE.Vector3;
  forward: THREE.Vector3;
}

/** Rows of numbers for `countryside-motion.ts`, world space. */
export interface CountryMotionRows {
  /** Per rotor: hub (3), axis (3), up (3), kind index, phase, scale. */
  rotors: Float32Array;
  /** Per lamp: position (3), up (3), phase. */
  beacons: Float32Array;
  /** Per fire: position (3), up (3). */
  smokes: Float32Array;
}
export const ROTOR_STRIDE = 12;
export const BEACON_STRIDE = 7;
export const SMOKE_STRIDE = 6;
export const ROTOR_KINDS: readonly RotorKind[] = ['sails', 'blades', 'vanes'];

export interface CountryTile {
  placed: CountryPlaced[];
  vertices: number;
  /** The vertices it would have were every tree drawn as lumps: what the budget counts. */
  priced: number;
  pieces: number;
  fields: number;
  fences: number;
  motion: CountryMotionRows | null;
  /** Built near without the drawn land to lay its fields on: to be built again when it answers. */
  provisional: boolean;
}

/** The tile being built, as the countryside needs it: its level, its frame and world to tile. */
export interface CountryFrame {
  level: number;
  across: THREE.Vector3;
  north: THREE.Vector3;
  /** World to the tile's own space. */
  inverse: THREE.Matrix4;
  /** A near tile: a tree is its wood and its leaf cards, not its lumps. */
  cards?: boolean;
  /** Where each piece's base went, while `vegetation.sample` is asking (`pnpm seated`). */
  seats?: { id: string; x: number; y: number; z: number; reach: number; drawn: boolean }[];
}

export interface CountryBuilder {
  /** The plans of every finest cell under a tile. */
  plansUnder(level: number, row: number, column: number): CountryPlan[];
  /**
   * Works out the plans under a tile that are not yet, one at least and then
   * while `more` says the frame has room; true when all of them are. A coarse
   * tile holds sixty-four cells, which is tens of milliseconds planned cold,
   * so the streamer spreads them over frames before it builds the tile.
   */
  ensure(level: number, row: number, column: number, more: () => boolean): boolean;
  /** Readies the keepouts for a tile, in its frame; `blocks` answers against them until the next call. */
  prepare(plans: readonly CountryPlan[], frame: CountryFrame): void;
  /** Whether a plant `spread` wide at (x, z) in the tile's frame stands on something planned. */
  blocks(x: number, z: number, spread: number): boolean;
  /** The tile's share of the countryside. `floor` is the smallest thing legible at its level. */
  build(plans: readonly CountryPlan[], frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean): CountryTile;
  /**
   * Whether a vehicle the countryside stands has been taken, asked by every
   * build so one that is somewhere else is not also in its yard. Until this
   * is set, nothing has been.
   */
  setTaken(test: (id: string) => boolean): void;
}

/**
 * A row's cross-section, from its left foot over its crown to its right
 * foot: (across, up) pairs, units, up from the plate. Its colour runs from
 * `foot` at the plate to `crown` at its top, vertex by vertex.
 */
interface RowSection {
  points: readonly (readonly [number, number])[];
  foot: number;
  crown: number;
}

/**
 * What grows in a field's rows at the finest level: its section, and a
 * second crown colour every other row takes (a bed of lettuce beside one of
 * cabbage), and how far apart the rows are where there are no furrows.
 */
interface CropRows {
  section: RowSection;
  second?: number;
  spacing: number;
}

interface Look {
  /** The plate's two tones, across the rows. */
  plate: [number, number];
  /** Width of one tone's stripe, units. 0 is one colour. */
  stripe: number;
  /** A paddy's bunds, round it and across it into pools, at the finest level. */
  bunds?: { width: number; height: number; color: number; tone: number; bury: number };
  /**
   * The ridges of soil the plough throws up, at the finest level, `spacing`
   * apart: the plate under them is the furrows' bottoms, one tone. Low and
   * rounded — a few decimetres, never a step — and lighter on top, where the
   * soil dries first.
   */
  furrows?: { spacing: number; section: RowSection };
  /** What grows in rows: on the ridges where there are furrows, else on the plate. */
  crop?: CropRows;
  /** Whether the grass grows through it, tinted: a field of straw. */
  straw: boolean;
}

/**
 * A row of plants seen end on: a narrow foot, its widest a little over
 * half-way up (`waist`), and a rounded top; `width` its widest, `height` its
 * top over the plate. Five faces and the colour from the foot up.
 */
function plantSection(width: number, height: number, foot: number, crown: number, waist = 0.55): RowSection {
  return {
    points: [
      [-width * 0.3, -0.1],
      [-width / 2, height * waist],
      [-width * 0.3, height * 0.92],
      [width * 0.3, height * 0.92],
      [width / 2, height * waist],
      [width * 0.3, -0.1],
    ],
    foot,
    crown,
  };
}

/** A ridge of ploughed soil: `width` at the foot and `height` over the furrows, rounded over a narrow crown. */
function ridgeSection(width: number, height: number, foot: number, crown: number): RowSection {
  return {
    points: [
      [-width / 2, -0.12],
      [-width * 0.22, height * 0.82],
      [0, height],
      [width * 0.22, height * 0.82],
      [width / 2, -0.12],
    ],
    foot,
    crown,
  };
}

/** The furrows' ridges of every ridged crop, in its own soil's tones. */
const RIDGE_HEIGHT = 0.3;
/** Of a field just ploughed, the share sown, its rows of shoots up out of the ridges. */
const SOWN = 0.5;

/** How each crop is drawn: palette colours and their tones. */
function lookOf(ctx: SceneryContext, crop: CropId): Look {
  const t = ctx.tone;
  const P = PALETTE;
  switch (crop) {
    case 'wheat':
      return { plate: [P.gold, t(P.gold, 0.86)], stripe: 1.8, straw: true };
    case 'barley':
      return { plate: [t(P.sand, 0.96), t(P.tan, 1.12)], stripe: 1.8, straw: true };
    case 'rapeseed':
      return { plate: [t(P.gold, 1.18), t(P.gold, 1.05)], stripe: 2.2, straw: true };
    case 'millet':
      return { plate: [t(P.tan, 1.1), t(P.gold, 0.8)], stripe: 1.6, straw: true };
    case 'lavender':
      // Rounded bushes in rows on bare soil: grey-green at the foot, violet over the top.
      return {
        plate: [t(P.violet, 0.78), t(P.tan, 0.92)],
        stripe: 1.1,
        crop: { section: plantSection(1.4, 0.95, t(P.green, 0.62), t(P.violet, 0.86), 0.45), second: t(P.violet, 0.78), spacing: 2.1 },
        straw: false,
      };
    case 'greens':
      // Beds of leaf vegetables on their ridges, a light and a blue-green bed in turn.
      return {
        plate: [t(P.green, 0.92), t(P.clay, 0.62)],
        stripe: 1.2,
        furrows: { spacing: 1.7, section: ridgeSection(1.6, RIDGE_HEIGHT, t(P.clay, 0.58), t(P.brown, 0.98)) },
        crop: { section: plantSection(1.05, 0.6, t(P.green, 0.66), t(P.green, 1.08)), second: t(P.slate, 1.05), spacing: 0 },
        straw: false,
      };
    case 'ploughed':
      // Turned soil, warm and dark in the furrows, drier and lighter on the ridges.
      return {
        plate: [t(P.clay, 0.7), t(P.brown, 0.66)],
        stripe: 1,
        furrows: { spacing: 1.35, section: ridgeSection(1.3, RIDGE_HEIGHT, t(P.clay, 0.55), t(P.brown, 1.02)) },
        straw: false,
      };
    case 'maize':
      // Tall leafy rows on low ridges, yellowing to the tassels.
      return {
        plate: [t(P.brown, 0.9), t(P.green, 0.85)],
        stripe: 1.3,
        furrows: { spacing: 2.2, section: ridgeSection(1.8, RIDGE_HEIGHT * 0.8, t(P.clay, 0.58), t(P.brown, 0.92)) },
        crop: { section: plantSection(1.15, 2.6, t(P.green, 0.6), t(P.olive, 0.95)), spacing: 0 },
        straw: false,
      };
    case 'vineyard':
      // Vines on their wires: the dark stocks at the foot, the leaves over them.
      return {
        plate: [t(P.tan, 1.05), t(P.darkOlive, 1.2)],
        stripe: 1.5,
        crop: { section: plantSection(1.0, 1.6, t(P.bark, 1.2), t(P.green, 0.9), 0.62), second: t(P.olive, 0.8), spacing: 3 },
        straw: false,
      };
    case 'olives':
      return { plate: [t(P.tan, 1.08), t(P.tan, 0.98)], stripe: 4, straw: false };
    case 'paddy':
      return { plate: [t(P.skyBlue, 0.72), t(P.green, 1.12)], stripe: 0.9, bunds: { width: 0.8, height: 0.45, color: P.brown, tone: 0.95, bury: 0.35 }, straw: false };
    case 'pond':
      return { plate: [t(P.skyBlue, 0.78), t(P.skyBlue, 0.84)], stripe: 0, straw: false };
  }
}

/** The colour the grass takes in a field of straw, or null where no grass grows through it. */
export function strawOf(ctx: SceneryContext, crop: CropId): number | null {
  const look = lookOf(ctx, crop);
  return look.straw ? look.plate[0] : null;
}

export function createCountryBuilder(
  world: World,
  ctx: SceneryContext,
  country: Countryside,
  scenic: (part: string, style: RegionStyle, variant: number) => CountryFlat | null,
): CountryBuilder {
  // --- the variants --------------------------------------------------------
  const variants = new Map<string, CountryFlat | null>();
  function flatOf(piece: CountryPiece, style: RegionStyle): CountryFlat | null {
    if (piece.scenic) return scenic(piece.part, style, piece.variant);
    const key = `${piece.part}|${style.id}|${piece.variant}`;
    const known = variants.get(key);
    if (known !== undefined) return known;
    const spec = COUNTRY_PARTS[piece.part];
    let made: CountryFlat | null = null;
    if (spec !== undefined) {
      try {
        const group = spec.build(ctx, pieceRng(spec.id, style.id, piece.variant), style);
        made = {
          ...mergeMeshes(group),
          height: measure(group).height,
          footprint: spec.footprint,
          tilt: 0,
          solid: spec.afloat === true ? undefined : spec.body ?? 'walls',
        };
        group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
      } catch (error) {
        console.warn(`countryside: ${key} did not build`, error);
      }
    }
    variants.set(key, made);
    return made;
  }
  /**
   * A vehicle the fleet can take, as its tile draws it: the craft itself in
   * the look its id decides, at the craft's own size, solid as a
   * farm's building is. Null while the kit is not registered.
   */
  const machineFlats = new Map<string, CountryFlat | null>();
  function machineFlat(craft: string, variant: number): CountryFlat | null {
    const key = `${craft}#${variant}`;
    const known = machineFlats.get(key);
    if (known !== undefined) return known;
    const model = parkedModel(craft);
    if (model === null) return null;
    let made: CountryFlat | null = null;
    try {
      made = {
        ...parkedArrays(model, variant, undefined),
        height: model.size[2],
        footprint: COUNTRY_PARTS[craft]?.footprint ?? Math.max(model.size[0], model.size[1]) * 0.5,
        tilt: 0,
        solid: 'walls',
      };
    } catch (error) {
      console.warn(`countryside: the ${key} did not build`, error);
    }
    machineFlats.set(key, made);
    return made;
  }
  let taken: (id: string) => boolean = () => false;

  /** A tree piece as a near tile draws it: its wood, solid as its lumps are, and its cards. */
  const nearVariants = new Map<string, { flat: CountryFlat; leaves: LeafArrays } | null>();
  function nearOf(piece: CountryPiece, style: RegionStyle): { flat: CountryFlat; leaves: LeafArrays } | null {
    if (piece.scenic) return null;
    const key = `${piece.part}|${style.id}|${piece.variant}`;
    const known = nearVariants.get(key);
    if (known !== undefined) return known;
    const spec = COUNTRY_PARTS[piece.part];
    const lumps = flatOf(piece, style);
    let made: { flat: CountryFlat; leaves: LeafArrays } | null = null;
    if (spec?.form !== undefined && lumps !== null) {
      const { wood, leaves } = nearArrays(spec.form(pieceRng(spec.id, style.id, piece.variant), style));
      made = { flat: { ...wood, outline: wood.normal, triangles: wood.position.length / 9, height: lumps.height, footprint: lumps.footprint, tilt: 0, solid: lumps.solid }, leaves };
    }
    nearVariants.set(key, made);
    return made;
  }
  const rotors = new Map<RotorKind, CountryFlat>();
  function rotorOf(kind: RotorKind): CountryFlat {
    let flat = rotors.get(kind);
    if (flat === undefined) {
      const group = buildRotor(ctx, kind);
      flat = { ...mergeMeshes(group), height: ROTOR_RADIUS[kind] * 2, footprint: ROTOR_RADIUS[kind], tilt: 0 };
      rotors.set(kind, flat);
    }
    return flat;
  }
  const looks = new Map<CropId, Look>();
  const lookFor = (crop: CropId): Look => {
    let look = looks.get(crop);
    if (look === undefined) looks.set(crop, (look = lookOf(ctx, crop)));
    return look;
  };
  /** What a field just ploughed and sown carries on its ridges: rows of shoots, bright against the soil. */
  const shoots: CropRows = { section: plantSection(0.45, 0.36, ctx.tone(PALETTE.green, 0.7), ctx.tone(PALETTE.green, 1.22)), spacing: 0 };

  // --- the plans under a tile ------------------------------------------------
  function plansUnder(level: number, row: number, column: number): CountryPlan[] {
    const out: CountryPlan[] = [];
    const span = 2 ** level;
    const rows0 = row * span;
    const cells = cellsOf(rootOf(rows0, 0), 0);
    for (let r = 0; r < span; r++) {
      for (let c = 0; c < span; c++) {
        const column0 = (((column * span + c) % cells) + cells) % cells;
        out.push(country.plan(rows0 + r, column0));
      }
    }
    return out;
  }

  function ensure(level: number, row: number, column: number, more: () => boolean): boolean {
    const span = 2 ** level;
    const rows0 = row * span;
    const cells = cellsOf(rootOf(rows0, 0), 0);
    let planned = 0;
    for (let r = 0; r < span; r++) {
      for (let c = 0; c < span; c++) {
        const column0 = (((column * span + c) % cells) + cells) % cells;
        if (country.has(rows0 + r, column0)) continue;
        if (planned > 0 && !more()) return false;
        country.plan(rows0 + r, column0);
        planned++;
      }
    }
    return true;
  }

  // --- the keepouts, in the tile's frame ----------------------------------------
  const discs: number[] = [];
  const rects: number[] = [];
  const lines: number[] = [];
  let across = new THREE.Vector3();
  let north = new THREE.Vector3();
  const lx = (u: THREE.Vector3): number => u.dot(across) * PLANET_RADIUS;
  const lz = (u: THREE.Vector3): number => u.dot(north) * PLANET_RADIUS;

  function prepare(plans: readonly CountryPlan[], frame: CountryFrame): void {
    across = frame.across;
    north = frame.north;
    discs.length = 0;
    rects.length = 0;
    lines.length = 0;
    for (const plan of plans) {
      for (const piece of plan.pieces) discs.push(lx(piece.at), lz(piece.at), piece.footprint);
      for (const field of plan.fields) rects.push(lx(field.at), lz(field.at), field.yaw, field.halfX, field.halfZ);
      for (const line of plan.lines) lines.push(lx(line.from), lz(line.from), lx(line.to), lz(line.to));
    }
  }

  function blocks(x: number, z: number, spread: number): boolean {
    for (let i = 0; i < discs.length; i += 3) {
      const r = discs[i + 2]! + spread * 0.6;
      const dx = x - discs[i]!;
      const dz = z - discs[i + 1]!;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (let i = 0; i < rects.length; i += 5) {
      const dx = x - rects[i]!;
      const dz = z - rects[i + 1]!;
      const c = Math.cos(rects[i + 2]!);
      const s = Math.sin(rects[i + 2]!);
      if (Math.abs(dx * c - dz * s) < rects[i + 3]! + spread * 0.5 && Math.abs(dx * s + dz * c) < rects[i + 4]! + spread * 0.5) return true;
    }
    for (let i = 0; i < lines.length; i += 4) {
      const ax = lines[i]!;
      const az = lines[i + 1]!;
      const dx = lines[i + 2]! - ax;
      const dz = lines[i + 3]! - az;
      const lengthSq = dx * dx + dz * dz;
      let t = lengthSq > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = ax + t * dx - x;
      const oz = az + t * dz - z;
      const r = 1 + spread * 0.5;
      if (ox * ox + oz * oz < r * r) return true;
    }
    return false;
  }

  // --- building ------------------------------------------------------------------
  const up = new THREE.Vector3();
  const pieceNorth = new THREE.Vector3();
  const pieceAcross = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const world4 = new THREE.Matrix4();
  const hub4 = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const point = new THREE.Vector3();
  const faceUp = new THREE.Vector3();
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const IDENTITY = new THREE.Matrix4();
  const colour = new THREE.Color();

  /** A piece's frame at its own base: north, across, up; the spin by its yaw. */
  function frameAt(at: THREE.Vector3, yaw: number): void {
    up.copy(at);
    pieceNorth.set(0, 1, 0).projectOnPlane(up);
    if (pieceNorth.lengthSq() < 1e-8) pieceNorth.set(1, 0, 0).projectOnPlane(up);
    pieceNorth.normalize();
    pieceAcross.crossVectors(up, pieceNorth).normalize();
    basis.makeBasis(pieceAcross, up, pieceNorth);
    quaternion.setFromRotationMatrix(basis);
    quaternion.multiply(spin.setFromAxisAngle(AXIS_Y, yaw));
  }

  /**
   * How high a piece's base is: bedded to the lowest of the ground under its
   * footprint — **the drawn land's** where the probe has it (`drawnFootprint`),
   * which is what is seen, else the relief's. Whether it was the drawn land
   * is left in `seatedOnDrawn`.
   *
   * It was the lower of the relief's lowest and the drawn land under the
   * middle, and the drawn land is up to seven units off the relief: on a
   * slope where the mesh runs under the relief, a barn's downhill side
   * stood on nothing.
   */
  let seatedOnDrawn = false;
  function baseOf(piece: CountryPiece, land: LandProbe | undefined, landReady: boolean): number {
    seatedOnDrawn = false;
    if (piece.base !== undefined) return PLANET_RADIUS + piece.base;
    const reach = Math.max(1, piece.footprint * 0.7);
    if (land !== undefined && landReady && drawnFootprint(land, piece.at, pieceAcross, pieceNorth, reach, drawnUnder) === 'drawn') {
      seatedOnDrawn = true;
      return drawnUnder.lowest - PIECE_BURY;
    }
    const elevation = world.elevationAt(piece.at);
    const relief = reliefAt(piece.at.x, piece.at.y, piece.at.z);
    gradeAt(piece.at, pieceAcross, pieceNorth, Math.max(1, piece.footprint * 0.6), slope);
    return PLANET_RADIUS + elevation - relief + Math.min(relief, slope.lowest) - PIECE_BURY;
  }
  const drawnUnder: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };

  /**
   * A field's ground under a point: the drawn land's height and its face's
   * normal where the probe answers, else the relief and the field's own tilt.
   */
  interface Ground {
    radius: number;
    nx: number;
    ny: number;
    nz: number;
    drawn: boolean;
  }
  const ground: Ground = { radius: 0, nx: 0, ny: 1, nz: 0, drawn: false };
  /** The lift of the tile being built; see `FIELD_LIFTS`. */
  let fieldLift = FIELD_LIFTS[0]!;
  function groundAt(direction: THREE.Vector3, shelf: number, fallbackUp: THREE.Vector3, land: LandProbe | undefined, landReady: boolean): Ground {
    if (land !== undefined && landReady) {
      const drawn = land.radiusAt(direction, faceUp);
      if (drawn !== null) {
        ground.radius = drawn + fieldLift;
        ground.nx = faceUp.x;
        ground.ny = faceUp.y;
        ground.nz = faceUp.z;
        ground.drawn = true;
        return ground;
      }
    }
    ground.radius = PLANET_RADIUS + shelf + reliefAt(direction.x, direction.y, direction.z) + FAR_FIELD_LIFT;
    ground.nx = fallbackUp.x;
    ground.ny = fallbackUp.y;
    ground.nz = fallbackUp.z;
    ground.drawn = false;
    return ground;
  }

  /** The growing arrays of one tile's own geometry (fields, rows, fences), world space until the end. */
  const out = {
    position: [] as number[],
    normal: [] as number[],
    color: [] as number[],
    outline: [] as number[],
  };

  function pushVertex(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, ink: THREE.Vector3): void {
    out.position.push(p.x, p.y, p.z);
    out.normal.push(n.x, n.y, n.z);
    out.color.push(c.r, c.g, c.b);
    out.outline.push(ink.x, ink.y, ink.z);
  }

  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const vd = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();
  const nd = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const noInk = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();

  /** One quad, a b c d anticlockwise seen from its front, with a normal per corner. */
  function quad(ink: boolean): void {
    // The face's own normal decides the ink; the corners' decide the light.
    e1.subVectors(vb, va);
    e2.subVectors(vd, va);
    faceNormal.crossVectors(e1, e2).normalize();
    const hull = ink ? faceNormal : noInk.copy(va).normalize().negate();
    pushVertex(va, na, colour, hull);
    pushVertex(vb, nb, colour, hull);
    pushVertex(vc, nc, colour, hull);
    pushVertex(va, na, colour, hull);
    pushVertex(vc, nc, colour, hull);
    pushVertex(vd, nd, colour, hull);
  }

  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]] as const;
  const probeAt = new THREE.Vector3();
  /** A direction at a field-local point: across the rows (x) and along them (z). */
  const fieldNorth = new THREE.Vector3();
  const fieldEast = new THREE.Vector3();
  function fieldPoint(field: CropField, x: number, z: number, into: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(field.yaw);
    const s = Math.sin(field.yaw);
    const ex = x * c + z * s;
    const nz = -x * s + z * c;
    return into.copy(field.at).addScaledVector(fieldEast, ex / PLANET_RADIUS).addScaledVector(fieldNorth, nz / PLANET_RADIUS).normalize();
  }

  /**
   * A field's plate: strips of its two tones across the rows, each strip a run
   * of quads along them no longer than `SEGMENT`, every vertex on the ground.
   * Returns whether it had to stand on the relief.
   */
  function plate(field: CropField, level: number, land: LandProbe | undefined, landReady: boolean): boolean {
    const look = lookFor(field.crop);
    fieldNorth.set(0, 1, 0).projectOnPlane(field.at).normalize();
    fieldEast.crossVectors(field.at, fieldNorth).normalize();
    const shelf = world.elevationAt(field.at) - reliefAt(field.at.x, field.at.y, field.at.z);
    gradeAt(field.at, fieldEast, fieldNorth, Math.min(field.halfX, field.halfZ) * 0.7, slope);
    const tilt = new THREE.Vector3().copy(field.at).addScaledVector(fieldEast, -slope.across).addScaledVector(fieldNorth, -slope.north).normalize();
    // Strips double in width a level up, so a far field is a few bands and not a
    // moire; at the finest level a ridged field's plate is the furrows' bottoms,
    // one tone under its ridges.
    const furrowed = level === 0 && look.furrows !== undefined;
    const stripe = look.stripe > 0 && !furrowed ? look.stripe * 2 ** level : 0;
    const strips = stripe > 0 ? Math.max(1, Math.round((2 * field.halfX) / stripe)) : Math.max(1, Math.ceil((2 * field.halfX) / SEGMENT[level]!));
    const segments = Math.max(1, Math.ceil((2 * field.halfZ) / SEGMENT[level]!));
    // All of a field on the drawn land or all of it on the relief: a field at
    // the edge of what the probe has gathered is not half of each.
    let onLand = land !== undefined && landReady;
    for (const [u, v] of CORNERS) {
      if (!onLand) break;
      if (land!.radiusAt(fieldPoint(field, u * field.halfX, v * field.halfZ, probeAt)) === null) onLand = false;
    }
    // The grid of the plate's corners, each asked of the ground once: a
    // corner is shared by four quads, and the probe is the cost of a field.
    const columns = strips + 1;
    const grid = new Float64Array(columns * (segments + 1) * 6);
    let fallback = false;
    for (let i = 0; i <= strips; i++) {
      const x = -field.halfX + (i * 2 * field.halfX) / strips;
      // A round field is its rectangle pulled in to the ellipse, strip by strip.
      const room = field.round ? Math.sqrt(Math.max(0, 1 - (x / field.halfX) ** 2)) : 1;
      for (let j = 0; j <= segments; j++) {
        const z = (-field.halfZ + (j * 2 * field.halfZ) / segments) * room;
        fieldPoint(field, x, z, probeAt);
        const g = groundAt(probeAt, shelf, tilt, land, onLand);
        if (!g.drawn) fallback = true;
        const o = (j * columns + i) * 6;
        grid[o] = probeAt.x * g.radius;
        grid[o + 1] = probeAt.y * g.radius;
        grid[o + 2] = probeAt.z * g.radius;
        grid[o + 3] = g.nx;
        grid[o + 4] = g.ny;
        grid[o + 5] = g.nz;
      }
    }
    const at = (i: number, j: number, into: THREE.Vector3, normal: THREE.Vector3): void => {
      const o = (j * columns + i) * 6;
      into.set(grid[o]!, grid[o + 1]!, grid[o + 2]!);
      normal.set(grid[o + 3]!, grid[o + 4]!, grid[o + 5]!);
    };
    for (let i = 0; i < strips; i++) {
      colour.set(look.plate[furrowed ? 1 : i % 2]!);
      for (let j = 0; j < segments; j++) {
        // Anticlockwise seen from above, with x east and z north: up the
        // western side and back down the eastern one.
        at(i, j, va, na);
        at(i, j + 1, vb, nb);
        at(i + 1, j + 1, vc, nc);
        at(i + 1, j, vd, nd);
        quad(false);
      }
    }
    // The skirt, where the field stands on the relief: its edge carried down
    // into the ground, a quad under every edge of the plate.
    if (fallback && !field.round) {
      colour.set(look.plate[0]!).multiplyScalar(0.8);
      const edge = (ai: number, aj: number, bi: number, bj: number): void => {
        at(ai, aj, va, na);
        at(bi, bj, vb, nb);
        vc.copy(vb).setLength(vb.length() - FAR_SKIRT);
        vd.copy(va).setLength(va.length() - FAR_SKIRT);
        // Lit as the wall it is, not as the field above it.
        e1.subVectors(vb, va);
        e2.subVectors(vd, va);
        na.crossVectors(e1, e2).normalize();
        nb.copy(na);
        nc.copy(na);
        nd.copy(na);
        quad(false);
      };
      // Clockwise round the field seen from above, so each face looks out.
      for (let j = segments; j > 0; j--) edge(0, j, 0, j - 1);
      for (let i = 0; i < strips; i++) edge(i, 0, i + 1, 0);
      for (let j = 0; j < segments; j++) edge(strips, j, strips, j + 1);
      for (let i = strips; i > 0; i--) edge(i, segments, i - 1, segments);
    }
    return fallback;
  }

  /**
   * A prism along the ground from a to b (unit vectors): `width` at its foot,
   * `top` at its crown, `height` over the ground and `bury` into it, at
   * `lift` over the ground. Split every `SEGMENT[0]` units so it follows the
   * ground. The rows of a vineyard, a paddy's bunds, a fence's rails, a wall.
   */
  const barFrom = new THREE.Vector3();
  const barTo = new THREE.Vector3();
  const side = new THREE.Vector3();
  const along = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  function bar(
    a: THREE.Vector3, b: THREE.Vector3, width: number, top: number, height: number, bury: number, lift: number,
    color: number, ink: boolean, land: LandProbe | undefined, landReady: boolean,
  ): void {
    const length = a.distanceTo(b) * PLANET_RADIUS;
    const pieces = Math.max(1, Math.ceil(length / SEGMENT[0]!));
    colour.set(color);
    for (let k = 0; k < pieces; k++) {
      barFrom.copy(a).lerp(b, k / pieces).normalize();
      barTo.copy(a).lerp(b, (k + 1) / pieces).normalize();
      const shelfA = world.elevationAt(barFrom) - reliefAt(barFrom.x, barFrom.y, barFrom.z);
      const g0 = groundAt(barFrom, shelfA, barFrom, land, landReady).radius - (ground.drawn ? fieldLift : FAR_FIELD_LIFT);
      const g1 = groundAt(barTo, shelfA, barTo, land, landReady).radius - (ground.drawn ? fieldLift : FAR_FIELD_LIFT);
      pa.copy(barFrom).multiplyScalar(g0);
      pb.copy(barTo).multiplyScalar(g1);
      along.subVectors(pb, pa).normalize();
      side.crossVectors(along, barFrom).normalize();
      const upA = barFrom;
      const upB = barTo;
      // Cross-section: foot left, foot right, crown right, crown left.
      const foot = (p: THREE.Vector3, u: THREE.Vector3, s: number, into: THREE.Vector3): THREE.Vector3 =>
        into.copy(p).addScaledVector(side, s * width / 2).addScaledVector(u, lift - bury);
      const crown = (p: THREE.Vector3, u: THREE.Vector3, s: number, into: THREE.Vector3): THREE.Vector3 =>
        into.copy(p).addScaledVector(side, s * top / 2).addScaledVector(u, lift + height);
      const sideFace = (s: number): void => {
        // The face on side `s`, anticlockwise seen from outside it.
        if (s > 0) {
          foot(pa, upA, 1, va); foot(pb, upB, 1, vb); crown(pb, upB, 1, vc); crown(pa, upA, 1, vd);
        } else {
          foot(pb, upB, -1, va); foot(pa, upA, -1, vb); crown(pa, upA, -1, vc); crown(pb, upB, -1, vd);
        }
        e1.subVectors(vb, va);
        e2.subVectors(vd, va);
        na.crossVectors(e1, e2).normalize();
        nb.copy(na); nc.copy(na); nd.copy(na);
        quad(ink);
      };
      sideFace(1);
      sideFace(-1);
      // The crown.
      crown(pa, upA, 1, va); crown(pb, upB, 1, vb); crown(pb, upB, -1, vc); crown(pa, upA, -1, vd);
      e1.subVectors(vb, va);
      e2.subVectors(vd, va);
      na.crossVectors(e1, e2).normalize();
      nb.copy(na); nc.copy(na); nd.copy(na);
      quad(ink);
      // The two ends, only at the ends of the whole bar.
      if (k === 0 || k === pieces - 1) {
        const end = (p: THREE.Vector3, u: THREE.Vector3, outward: number): void => {
          // `side` is `along x up`, so the start's face runs from the -side foot.
          if (outward < 0) {
            foot(p, u, -1, va); foot(p, u, 1, vb); crown(p, u, 1, vc); crown(p, u, -1, vd);
          } else {
            foot(p, u, 1, va); foot(p, u, -1, vb); crown(p, u, -1, vc); crown(p, u, 1, vd);
          }
          e1.subVectors(vb, va);
          e2.subVectors(vd, va);
          na.crossVectors(e1, e2).normalize();
          nb.copy(na); nc.copy(na); nd.copy(na);
          quad(ink);
        };
        if (k === 0) end(pa, upA, -1);
        if (k === pieces - 1) end(pb, upB, 1);
      }
    }
  }

  /**
   * A row along the ground from a to b (unit vectors), drawn as the layers
   * given, each a section (`RowSection`) swept along it `over` units above
   * the plate: a ridge of soil, and the plants on its crown. The ground is
   * asked once a `SEGMENT[0]` along it, as a bar's is, and shared by every
   * layer; the faces have no ink (a pen line round every furrow is a
   * hatching) and their normals are the section's own, smoothed round it, so
   * the ramp steps across a ridge as across something round. Each end is
   * closed.
   */
  interface RowLayer {
    section: RowSection;
    over: number;
    crown: number;
  }
  const rowGround: THREE.Vector3[] = [];
  const rowUp: THREE.Vector3[] = [];
  const footColour = new THREE.Color();
  const crownColour = new THREE.Color();
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  const cc = new THREE.Color();
  const cd = new THREE.Color();
  const sectionNormal: [number, number][] = [];
  /** One quad with a colour a corner, wound to face the way its corners' normals do. */
  function shadedQuad(): void {
    e1.subVectors(vb, va);
    e2.subVectors(vd, va);
    faceNormal.crossVectors(e1, e2);
    const facing = faceNormal.dot(e1.copy(na).add(nb).add(nc).add(nd)) >= 0;
    const hull = noInk.copy(va).normalize().negate();
    if (facing) {
      pushVertex(va, na, ca, hull); pushVertex(vb, nb, cb, hull); pushVertex(vc, nc, cc, hull);
      pushVertex(va, na, ca, hull); pushVertex(vc, nc, cc, hull); pushVertex(vd, nd, cd, hull);
    } else {
      pushVertex(va, na, ca, hull); pushVertex(vc, nc, cc, hull); pushVertex(vb, nb, cb, hull);
      pushVertex(va, na, ca, hull); pushVertex(vd, nd, cd, hull); pushVertex(vc, nc, cc, hull);
    }
  }
  function rowAlong(a: THREE.Vector3, b: THREE.Vector3, layers: readonly RowLayer[], land: LandProbe | undefined, landReady: boolean): void {
    const length = a.distanceTo(b) * PLANET_RADIUS;
    const pieces = Math.max(1, Math.ceil(length / SEGMENT[0]!));
    while (rowGround.length <= pieces) {
      rowGround.push(new THREE.Vector3());
      rowUp.push(new THREE.Vector3());
    }
    for (let k = 0; k <= pieces; k++) {
      const up = rowUp[k]!.copy(a).lerp(b, k / pieces).normalize();
      const shelf = world.elevationAt(up) - reliefAt(up.x, up.y, up.z);
      const g = groundAt(up, shelf, up, land, landReady);
      rowGround[k]!.copy(up).multiplyScalar(g.radius - (g.drawn ? 0 : FAR_FIELD_LIFT - fieldLift));
    }
    for (const layer of layers) {
      const points = layer.section.points;
      const top = Math.max(...points.map(([, y]) => y));
      footColour.set(layer.section.foot);
      crownColour.set(layer.crown);
      // Each corner's normal in the section: its two edges' outward normals
      // averaged, a foot's tipped up by the ground it stands on.
      sectionNormal.length = 0;
      for (let i = 0; i < points.length; i++) {
        let nx = 0;
        let ny = 0;
        for (const [p, q] of [[i - 1, i], [i, i + 1]] as const) {
          if (p < 0 || q >= points.length) {
            ny += 1;
            continue;
          }
          const dx = points[q]![0] - points[p]![0];
          const dy = points[q]![1] - points[p]![1];
          const l = Math.hypot(dx, dy) || 1;
          nx += -dy / l;
          ny += dx / l;
        }
        const l = Math.hypot(nx, ny) || 1;
        sectionNormal.push([nx / l, ny / l]);
      }
      const shade = (y: number, into: THREE.Color): THREE.Color => into.copy(footColour).lerp(crownColour, Math.min(1, Math.max(0, y / top)));
      const corner = (k: number, i: number, into: THREE.Vector3, normal: THREE.Vector3, tint: THREE.Color): void => {
        const [x, y] = points[i]!;
        const up = rowUp[k]!;
        into.copy(rowGround[k]!).addScaledVector(side, x).addScaledVector(up, layer.over + y);
        const [nx, ny] = sectionNormal[i]!;
        normal.copy(side).multiplyScalar(nx).addScaledVector(up, ny).normalize();
        shade(y, tint);
      };
      for (let k = 0; k < pieces; k++) {
        along.subVectors(rowGround[k + 1]!, rowGround[k]!).normalize();
        side.crossVectors(along, rowUp[k]!).normalize();
        for (let i = 0; i + 1 < points.length; i++) {
          corner(k, i, va, na, ca);
          corner(k + 1, i, vb, nb, cb);
          corner(k + 1, i + 1, vc, nc, cc);
          corner(k, i + 1, vd, nd, cd);
          shadedQuad();
        }
        // The two ends, a fan from the section's middle at the plate.
        for (const end of k === 0 ? (pieces === 1 ? [0, 1] : [0]) : k === pieces - 1 ? [pieces] : []) {
          const outward = end === 0 ? -1 : 1;
          const n = nd.copy(along).multiplyScalar(outward);
          const up = rowUp[end]!;
          const middle = pa.copy(rowGround[end]!).addScaledVector(up, layer.over);
          for (let i = 0; i + 1 < points.length; i++) {
            corner(end, i, vb, na, cb);
            corner(end, i + 1, vc, na, cc);
            e1.subVectors(vb, middle);
            e2.subVectors(vc, middle);
            faceNormal.crossVectors(e1, e2);
            const hull = noInk.copy(middle).normalize().negate();
            shade(0, ca);
            const [p, q, cp, cq] = faceNormal.dot(n) >= 0 ? [vb, vc, cb, cc] : [vc, vb, cc, cb];
            pushVertex(middle, n, ca, hull);
            pushVertex(p, n, cp, hull);
            pushVertex(q, n, cq, hull);
          }
        }
      }
    }
  }

  /**
   * A field's rows at the finest level: the plough's ridges with what grows
   * on them, or rows of plants on the bare plate, and a paddy's bunds round
   * it and across it. A field just ploughed is sown or not by its own seed:
   * half of them carry rows of shoots.
   */
  const rowA = new THREE.Vector3();
  const rowB = new THREE.Vector3();
  const layers: RowLayer[] = [];
  function rows(field: CropField, land: LandProbe | undefined, landReady: boolean): void {
    const look = lookFor(field.crop);
    fieldNorth.set(0, 1, 0).projectOnPlane(field.at).normalize();
    fieldEast.crossVectors(field.at, fieldNorth).normalize();
    const furrows = look.furrows;
    let crop = look.crop;
    if (field.crop === 'ploughed') {
      const seed = rngFrom('sown', Math.round(field.at.x * 1e6), Math.round(field.at.y * 1e6), Math.round(field.at.z * 1e6));
      if (seed.chance(SOWN)) crop = shoots;
    }
    const spacing = furrows?.spacing ?? crop?.spacing ?? 0;
    if (spacing > 0) {
      const count = Math.max(1, Math.floor((2 * field.halfX) / spacing));
      for (let i = 0; i < count; i++) {
        const x = -field.halfX + (i + 0.5) * ((2 * field.halfX) / count);
        // A round field's rows end at its ellipse.
        const room = field.round ? Math.sqrt(Math.max(0, 1 - (x / field.halfX) ** 2)) : 1;
        const reach = field.halfZ * room - 0.8;
        if (reach <= 1) continue;
        fieldPoint(field, x, -reach, rowA);
        fieldPoint(field, x, reach, rowB);
        layers.length = 0;
        if (furrows !== undefined) layers.push({ section: furrows.section, over: 0, crown: furrows.section.crown });
        if (crop !== undefined) {
          const over = furrows === undefined ? 0 : Math.max(...furrows.section.points.map(([, y]) => y)) - 0.05;
          layers.push({ section: crop.section, over, crown: i % 2 === 1 && crop.second !== undefined ? crop.second : crop.section.crown });
        }
        rowAlong(rowA, rowB, layers, land, landReady);
      }
    }
    const bunds = look.bunds;
    if (bunds === undefined) return;
    // A paddy: bunds round it, and across it into pools of about a dozen units.
    const X = field.halfX;
    const Z = field.halfZ;
    const edges: [number, number, number, number][] = [[-X, -Z, X, -Z], [X, -Z, X, Z], [X, Z, -X, Z], [-X, Z, -X, -Z]];
    const pools = Math.max(1, Math.round((2 * Z) / 12));
    for (let j = 1; j < pools; j++) {
      const z = -Z + (j * 2 * Z) / pools;
      edges.push([-X, z, X, z]);
    }
    for (const [ax, az, bx, bz] of edges) {
      fieldPoint(field, ax, az, rowA);
      fieldPoint(field, bx, bz, rowB);
      bar(rowA, rowB, bunds.width, bunds.width * 0.5, bunds.height, bunds.bury, fieldLift, ctx.tone(bunds.color, bunds.tone), false, land, landReady);
    }
  }

  /** A fence (posts and two rails) or a dry-stone wall, along the ground. */
  const postA = new THREE.Vector3();
  const postB = new THREE.Vector3();
  function fenceAlong(line: CountryLine, style: RegionStyle, land: LandProbe | undefined, landReady: boolean): void {
    if (line.kind === 'wall') {
      const stone = style.stone[0] ?? PALETTE.slate;
      bar(line.from, line.to, 0.95, 0.7, 1.15, 0.4, 0, stone, true, land, landReady);
      return;
    }
    const wood = style.id === 'north-america' ? PALETTE.white : PALETTE.brown;
    const length = line.from.distanceTo(line.to) * PLANET_RADIUS;
    const posts = Math.max(1, Math.round(length / 4));
    // A post is a bar as long as it is wide, along the fence.
    const half = 0.12 / Math.max(length, 1e-3);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      postA.copy(line.from).lerp(line.to, Math.max(0, t - half)).normalize();
      postB.copy(line.from).lerp(line.to, Math.min(1, t + half)).normalize();
      bar(postA, postB, 0.24, 0.24, 1.45, 0.3, 0, ctx.tone(wood, 0.85), true, land, landReady);
    }
    bar(line.from, line.to, 0.12, 0.12, 0.16, 0, 0.62, wood, true, land, landReady);
    bar(line.from, line.to, 0.12, 0.12, 0.16, 0, 1.12, wood, true, land, landReady);
  }

  function build(plans: readonly CountryPlan[], frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean): CountryTile {
    const placed: CountryPlaced[] = [];
    const rotorRows: number[] = [];
    const beaconRows: number[] = [];
    const smokeRows: number[] = [];
    out.position.length = 0;
    out.normal.length = 0;
    out.color.length = 0;
    out.outline.length = 0;
    let vertices = 0;
    let priced = 0;
    let pieces = 0;
    let fields = 0;
    let fences = 0;
    let fallback = false;
    const moving = frame.level <= MOTION_LEVEL;
    fieldLift = FIELD_LIFTS[Math.min(frame.level, FIELD_LIFTS.length - 1)]!;

    for (const plan of plans) {
      const style = plan.style;
      /** The cell's row and column, off its key, for the ids of what can be taken. */
      const cell = plan.key.split('/').map(Number);
      let machines = 0;
      plan.pieces.forEach((piece, index) => {
        // A farm's tractor is the fleet's (`CountryMachine`): named by its
        // cell and its ordinal among the cell's, taken or not, and left out
        // while it is somewhere else.
        let machine: CountryMachine | undefined;
        let flat: CountryFlat | null;
        if (!piece.scenic && MACHINES.has(piece.part)) {
          const id = countryVehicleId(piece.part, cell[0]!, cell[1]!, machines++);
          const model = parkedModel(piece.part);
          if (id === null || model === null || taken(id)) return;
          flat = machineFlat(piece.part, fleetVariant(id, model.variants));
          machine = { id, model: piece.part, position: new THREE.Vector3(), forward: new THREE.Vector3() };
        } else {
          flat = flatOf(piece, style);
        }
        if (flat === null) return;
        if (flat.height * piece.scale < floor) return;
        frameAt(piece.at, piece.yaw);
        const base = baseOf(piece, land, landReady);
        scaleVector.setScalar(piece.scale);
        world4.compose(position.copy(piece.at).multiplyScalar(base), quaternion, scaleVector);
        if (piece.base === undefined) frame.seats?.push({ id: piece.part, x: position.x, y: position.y, z: position.z, reach: Math.max(1, piece.footprint * 0.7), drawn: seatedOnDrawn });
        if (machine !== undefined) {
          machine.position.copy(position);
          machine.forward.copy(AXIS_Z).applyQuaternion(quaternion);
        }
        const near = frame.cards === true && machine === undefined ? nearOf(piece, style) : null;
        const drawn = near?.flat ?? flat;
        placed.push({ flat: drawn, matrix: new THREE.Matrix4().multiplyMatrices(frame.inverse, world4), leaves: near?.leaves ?? null, sways: near !== null, machine });
        vertices += drawn.position.length / 3;
        priced += flat.position.length / 3;
        pieces++;
        const spec = piece.scenic ? undefined : COUNTRY_PARTS[piece.part];
        if (spec === undefined) return;
        const phase = rngFrom('country-turn', plan.key, index).unit() * Math.PI * 2;
        if (spec.rotor !== undefined) {
          point.set(spec.rotor.x, spec.rotor.y, spec.rotor.z).applyMatrix4(world4);
          if (moving) {
            axis.copy(AXIS_Z).applyQuaternion(quaternion);
            faceUp.copy(AXIS_Y).applyQuaternion(quaternion);
            rotorRows.push(point.x, point.y, point.z, axis.x, axis.y, axis.z, faceUp.x, faceUp.y, faceUp.z, ROTOR_KINDS.indexOf(spec.rotor.kind), phase, piece.scale);
          } else {
            const rotor = rotorOf(spec.rotor.kind);
            hub4.makeRotationZ(phase).setPosition(spec.rotor.x, spec.rotor.y, spec.rotor.z);
            placed.push({ flat: rotor, matrix: new THREE.Matrix4().multiplyMatrices(frame.inverse, world4).multiply(hub4) });
            vertices += rotor.position.length / 3;
            priced += rotor.position.length / 3;
          }
        }
        if (spec.beacon !== undefined) {
          point.set(0, spec.beacon.y, 0).applyMatrix4(world4);
          beaconRows.push(point.x, point.y, point.z, piece.at.x, piece.at.y, piece.at.z, phase);
        }
        if (spec.smoke !== undefined && moving) {
          point.set(0, spec.smoke.y, 0).applyMatrix4(world4);
          smokeRows.push(point.x, point.y, point.z, piece.at.x, piece.at.y, piece.at.z);
        }
      });
      for (const field of plan.fields) {
        if (plate(field, frame.level, land, landReady)) fallback = true;
        if (frame.level === 0) rows(field, land, landReady);
        fields++;
        // An olive grove's trees, in their rows, legible as far as a tree is.
        if (field.crop === 'olives') {
          const olive = COUNTRY_PARTS['olive']!;
          const spacing = 8;
          const nx = Math.max(1, Math.floor((2 * field.halfX) / spacing));
          const nz = Math.max(1, Math.floor((2 * field.halfZ) / spacing));
          fieldNorth.set(0, 1, 0).projectOnPlane(field.at).normalize();
          fieldEast.crossVectors(field.at, fieldNorth).normalize();
          for (let i = 0; i < nx; i++) {
            for (let j = 0; j < nz; j++) {
              const variant = rngFrom('olive', plan.key, i, j).int(3);
              const tree = flatOf({ part: olive.id, scenic: false, variant, at: field.at, yaw: 0, scale: 1, footprint: olive.footprint }, style);
              if (tree === null || tree.height < floor) continue;
              const at = fieldPoint(field, -field.halfX + (i + 0.5) * ((2 * field.halfX) / nx), -field.halfZ + (j + 0.5) * ((2 * field.halfZ) / nz), new THREE.Vector3());
              const yaw = rngFrom('olive-turn', plan.key, i, j).unit() * Math.PI * 2;
              frameAt(at, yaw);
              const base = baseOf({ part: olive.id, scenic: false, variant, at, yaw, scale: 1, footprint: olive.footprint }, land, landReady);
              world4.compose(position.copy(at).multiplyScalar(base), quaternion, scaleVector.setScalar(1));
              const piece = { part: olive.id, scenic: false, variant, at, yaw, scale: 1, footprint: olive.footprint };
              const near = frame.cards === true ? nearOf(piece, style) : null;
              const drawn = near?.flat ?? tree;
              placed.push({ flat: drawn, matrix: new THREE.Matrix4().multiplyMatrices(frame.inverse, world4), leaves: near?.leaves ?? null, sways: near !== null });
              vertices += drawn.position.length / 3;
              priced += tree.position.length / 3;
            }
          }
        }
      }
      if (frame.level === 0) {
        for (const line of plan.lines) {
          fenceAlong(line, style, land, landReady);
          fences++;
        }
      }
    }

    // The tile's own geometry, into its frame, as one more placed part.
    if (out.position.length > 0) {
      const count = out.position.length / 3;
      const flat: CountryFlat = {
        position: new Float32Array(count * 3),
        normal: new Float32Array(count * 3),
        color: Float32Array.from(out.color),
        outline: new Float32Array(count * 3),
        triangles: count / 3,
        height: 0,
        footprint: 0,
        tilt: 0,
      };
      const e = frame.inverse.elements;
      for (let i = 0; i < count * 3; i += 3) {
        const x = out.position[i]!;
        const y = out.position[i + 1]!;
        const z = out.position[i + 2]!;
        flat.position[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        flat.position[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        flat.position[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
        for (const [from, to] of [[out.normal, flat.normal], [out.outline, flat.outline]] as const) {
          const nx = from[i]!;
          const ny = from[i + 1]!;
          const nz = from[i + 2]!;
          to[i] = e[0]! * nx + e[4]! * ny + e[8]! * nz;
          to[i + 1] = e[1]! * nx + e[5]! * ny + e[9]! * nz;
          to[i + 2] = e[2]! * nx + e[6]! * ny + e[10]! * nz;
        }
      }
      placed.push({ flat, matrix: IDENTITY });
      vertices += count;
      priced += count;
    }

    const motion =
      rotorRows.length + beaconRows.length + smokeRows.length > 0
        ? { rotors: Float32Array.from(rotorRows), beacons: Float32Array.from(beaconRows), smokes: Float32Array.from(smokeRows) }
        : null;
    return { placed, vertices, priced, pieces, fields, fences, motion, provisional: fallback && frame.level <= MOTION_LEVEL };
  }

  return {
    plansUnder,
    ensure,
    prepare,
    blocks,
    build,
    setTaken(test) {
      taken = test;
    },
  };
}
