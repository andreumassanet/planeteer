import * as THREE from 'three';
import type { World } from '../../geo.ts';
import { PLANET_RADIUS, groundColorAt } from '../../globe.ts';
import type { LandProbe } from '../../land-probe.ts';
import { buildFloor, flightAt } from '../../scenery/floor.ts';
import type { FloorField } from '../../scenery/floor.ts';
import { OUTSKIRT_MIN_CELLS, OUTSKIRT_RING, cellCentre, cellIndex, gatesOf, outskirtScore } from '../../scenery/grid.ts';
import type { Gate, GateMouth, TownGrid } from '../../scenery/grid.ts';
import { GROUND_LIFT, cellKey, trodden } from '../../scenery/ground.ts';
import type { GroundStyle } from '../../scenery/ground.ts';
import { PALETTE } from '../../theme.ts';
import type { TownFrame } from '../frame.ts';
import { CLEAR_FOLK, DRAWN_BULGE } from '../rules.ts';
import type { Slot } from '../types.ts';
import type { Emitter, GroundWriter } from './writer.ts';

/** A town's floor being built: what it produces, and the state its phases share. */

/**
 * The floor's flat arrays in the settlement's tangent frame, appended to the
 * town's one buffer, and what the floor decided about where things stand.
 * Positions are returned rather than geometry for anything that is a part
 * (lamps, signals, benches) or a person or vehicle, since only the floor knows
 * where the streets are.
 */
export interface Ground {
  position: number[];
  normal: number[];
  color: number[];
  /** Two bytes a vertex, as a part carries: how lit this patch of floor is, and the hour it goes out. */
  glow: number[];
  /** Where a street lamp stands, as triples in the settlement's frame. */
  lamps: number[];
  /** Each lamp's yaw: its arm (over local -z) turned to the street it stands at. */
  lampYaws: number[];
  /** A city's middle-crossing traffic lights, as quadruples: a position and the yaw facing its traffic. */
  signals: number[];
  /** The benches beside the lamps, as quadruples: a position on the paving and the yaw facing the street. */
  benches: number[];
  /**
   * Where a person stands, as runs of `FOLK_STRIDE`: the spot, the two ends of
   * the stretch they may stroll (both the spot where there is no room), the yaw
   * to a partner or NaN, and +1/-1 for the two halves of a pair, 0 otherwise.
   */
  folk: number[];
  /** Where a vehicle is parked, as quadruples with a yaw along the kerb. */
  kerbs: number[];
  /** Which cells are lawn, one byte a cell by `col * cells + row`; null where yards are earth. See `swardAt`. */
  lawn: Uint8Array | null;
  /** The gate mouths' rectangles in the town's plane, `[x0, x1, z0, z1]`, which are street wherever they fall. */
  mouths: [number, number, number, number][];
  /** How many cells came out as floor. */
  paved: number;
  /** The paved set and each cell's terrace, which a foot has to be able to ask about. */
  terraces: Map<number, number>;
  /** The whole floor as a foot finds it, which the geometry is drawn out of (`buildFloor`). */
  field: FloorField;
}

/** The colours one floor is drawn in, reused across builds. */
export interface GroundColours {
  road: THREE.Color;
  walk: THREE.Color;
  line: THREE.Color;
  land: THREE.Color;
  yard: THREE.Color;
  plaza: THREE.Color;
  /** The paving of the cell being drawn: its floor colour times the cell's own tone. */
  cell: THREE.Color;
  /** The retaining walls' top and foot: the pavement's stone walked towards `KERB_INK`. */
  kerbTop: THREE.Color;
  kerbFoot: THREE.Color;
  /** A step's riser. */
  step: THREE.Color;
  /** The edge slope's four corners in the cell being drawn. */
  apron: [THREE.Color, THREE.Color, THREE.Color, THREE.Color];
}

/** A warm dark brown the kerbs and risers are toned towards, so they do not read as shadow on pale paving. */
export const KERB_INK = new THREE.Color(0x2a1410);

export function createGroundColours(): GroundColours {
  return {
    road: new THREE.Color(),
    walk: new THREE.Color(),
    line: new THREE.Color(),
    land: new THREE.Color(),
    yard: new THREE.Color(),
    plaza: new THREE.Color(),
    cell: new THREE.Color(),
    kerbTop: new THREE.Color(),
    kerbFoot: new THREE.Color(),
    step: new THREE.Color(),
    apron: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()],
  };
}

/** A gate's mouth in one of its cells: the gate, its section, which side of the street's line the cell is on (0 both), and its rectangle. */
export interface Mouth {
  gate: Gate;
  mouth: GateMouth;
  side: number;
  rect: [number, number, number, number];
}

/** What every phase of one floor build shares. */
export interface GroundJob {
  readonly world: World;
  readonly frame: TownFrame;
  readonly slot: Slot;
  readonly grid: TownGrid;
  readonly band: number;
  readonly pitch: number;
  readonly cells: number;
  readonly style: GroundStyle;
  readonly marked: boolean;
  readonly out: Ground;
  readonly levels: Map<number, number>;
  readonly field: FloorField;
  readonly gates: Gate[];
  /** The gates the town's roads come in by, as indices into `gates`. */
  readonly roads: readonly number[];
  /** Every edge a road comes in over, as `cellKey * 4 + side`. */
  readonly roadEnds: Set<number>;
  /** The mouths by the gate cell each reaches into. */
  readonly mouthsIn: Map<number, Mouth[]>;
  /** The middle cell where the two main streets cross, or -1 for a town with an even count. */
  readonly plazaKey: number;
  readonly emitters: Emitter[];
  readonly colours: GroundColours;
  readonly writer: GroundWriter;
  /** Whether a yard is the land's own ground: the edge of the town wherever yards are not earth. */
  outerYard(col: number, row: number): boolean;
  /**
   * One point on the paving at its terrace's lift, appended to `into` (and
   * `yaw` after it), or false: off the paving, in a landmark's ground, or
   * within `clearance` of a flight of steps.
   */
  spotAt(x: number, z: number, into: number[], yaw?: number, clearance?: number): boolean;
  /** A point of the paving at `level`, in the settlement's frame, appended to `into`. */
  pavingAt(x: number, z: number, level: number, into: number[]): void;
  /** Whether a person may stand at `x, z` on the terrace `level`: `spotAt`'s test, and the same level. */
  standable(x: number, z: number, level: number): boolean;
}

/** The scratch a floor build reuses. */
export interface GroundScratch {
  readonly colours: GroundColours;
  readonly writer: GroundWriter;
  readonly dir: THREE.Vector3;
  readonly local: THREE.Vector3;
  readonly slopeDir: THREE.Vector3;
}

/**
 * Sets up a floor build: the colours, the paved set, and the field. Returns
 * null with the (empty) result in `out` where nothing is paved.
 *
 * The floor's base is the region's road colour; a yard is the land at the
 * town's middle (lawn), that land trodden (earth), or the pavement (paved).
 */
export function* openGround(
  world: World,
  frame: TownFrame,
  scratch: GroundScratch,
  landProbe: LandProbe | null,
  roads: readonly number[],
  slot: Slot,
  grid: TownGrid,
  band: number,
): Generator<void, { job: GroundJob | null; out: Ground }, void> {
  const out: Ground = {
    position: [], normal: [], color: [], glow: [], lamps: [], lampYaws: [], signals: [], benches: [], folk: [], kerbs: [], paved: 0, lawn: null, mouths: [],
    terraces: new Map(),
    field: { pitch: grid.pitch, shift: grid.shift, terraces: new Map() },
  };
  const style = slot.ground;
  const pitch = grid.pitch;
  const cells = grid.cells;
  const { colours } = scratch;
  colours.road.setHex(style.road);
  colours.walk.setHex(style.walk);
  colours.line.setHex(PALETTE.white);
  colours.plaza.setHex(style.plaza);
  frame.directionAt(0, 0, scratch.dir);
  groundColorAt(world, scratch.dir.multiplyScalar(PLANET_RADIUS), colours.land);
  if (style.yard === 'paved') colours.yard.copy(colours.walk);
  else if (style.yard === 'earth') trodden(colours.land, colours.yard);
  else colours.yard.copy(colours.land);
  colours.kerbTop.copy(colours.walk).lerp(KERB_INK, 0.16);
  colours.kerbFoot.copy(colours.walk).lerp(KERB_INK, 0.42);

  const levels = new Map<number, number>();
  for (let col = 0; col < cells; col++) {
    yield;
    for (let row = 0; row < cells; row++) {
      const level = frame.terraceAt(col, row);
      if (level !== null) levels.set(cellKey(col, row), level);
    }
  }
  out.paved = levels.size;
  out.terraces = levels;
  out.field = { pitch, shift: grid.shift, terraces: levels };
  if (levels.size === 0) return { job: null, out };

  const gates = gatesOf(grid);
  const roadEnds = new Set<number>();
  for (const index of roads) {
    const gate = gates[index];
    if (gate === undefined) continue;
    for (const [col, row] of gate.cells) roadEnds.add(cellKey(col, row) * 4 + gate.side);
  }
  const field = buildFloor({
    grid,
    band,
    terraces: levels,
    mouths: roadEnds,
    // The slope's foot dives under the land as drawn, which stands up to a few
    // units off the relief; the terraces stay the relief's, which the roads read.
    cornerGround: (i, j) => {
      const corner = frame.cornerAt(i, j);
      if (corner.sea) return null;
      if (landProbe === null) return corner.elevation;
      frame.directionAt(corner.x, corner.z, scratch.slopeDir);
      if (!landProbe.covers(scratch.slopeDir)) return corner.elevation;
      const drawn = landProbe.radiusAt(scratch.slopeDir);
      // And a unit more: the land between two corners bulges over the line between them.
      return drawn === null ? corner.elevation : Math.max(corner.elevation, drawn - PLANET_RADIUS + DRAWN_BULGE);
    },
    open: (col, row) => !frame.blocked(cellCentre(grid, col), cellCentre(grid, row)),
  });
  out.field = field;

  const pavingAt = (x: number, z: number, level: number, into: number[]): void => {
    frame.directionAt(x, z, scratch.dir);
    scratch.local
      .copy(scratch.dir)
      .multiplyScalar(PLANET_RADIUS + level + GROUND_LIFT)
      .sub(frame.origin)
      .applyMatrix4(frame.inverse);
    into.push(scratch.local.x, scratch.local.y, scratch.local.z);
  };
  const job: GroundJob = {
    world,
    frame,
    slot,
    grid,
    band,
    pitch,
    cells,
    style,
    marked: style.marked,
    out,
    levels,
    field,
    gates,
    roads,
    roadEnds,
    mouthsIn: new Map(),
    plazaKey: cells % 2 === 1 && cells >= 3 ? cellKey(grid.shift, grid.shift) : -1,
    emitters: [],
    colours,
    writer: scratch.writer,
    outerYard: (col, row) =>
      style.yard !== 'earth' && (cells < OUTSKIRT_MIN_CELLS || outskirtScore(grid, slot.seed, col, row) > OUTSKIRT_RING),
    spotAt(x, z, into, yaw, clearance = 0) {
      if (frame.blocked(x, z)) return false;
      const level = levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
      if (level === undefined) return false;
      if (flightAt(field, x, z, clearance) !== null) return false;
      pavingAt(x, z, level, into);
      if (yaw !== undefined) into.push(yaw);
      return true;
    },
    pavingAt,
    standable: (x, z, level) =>
      !frame.blocked(x, z) &&
      levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z))) === level &&
      flightAt(field, x, z, CLEAR_FOLK) === null,
  };
  return { job, out };
}
