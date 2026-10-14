import * as THREE from 'three';
import { PLANET_RADIUS } from '../../globe.ts';
import { MAX_CUT, SIDEWALK, TERRACE_STEP, pavementOf } from '../ground.ts';

/**
 * A town's square as pure functions of its built radius (`radiusOf`): its
 * cells, where its streets run, its frame, and the gates a road may come in
 * by. The town that stands on it and the roads that arrive at it both read
 * these, so they cannot disagree about where its edge or its gates are.
 *
 * The square is inscribed in `radiusOf`'s disc (half-side `r / sqrt 2`): the
 * bake keeps discs apart, so squares never overlap, and anything that keeps
 * off a town's disc keeps off its square. Everything is north-up.
 */

/**
 * The nominal cell, in world units. One number for the planet, so a road can
 * find a gate without the kit; a town's actual cell is its side divided into a
 * whole number of these, 8 to 18 units.
 */
export const TOWN_PITCH = 12;

/**
 * How deep a gate's cell may be cut, in world units: two terrace steps deeper
 * than any other cell's `MAX_CUT`, because a gate refused is a road lost.
 * This bounds the cut on the cell's own corners, not the wall it shows.
 */
export const GATE_CUT = MAX_CUT + 2 * TERRACE_STEP;

/**
 * Half the street band on each side of a street boundary, in world units: half
 * the region's carriageway, capped at 0.3 of a cell. Here because a road
 * arriving at a gate meets exactly the street it enters.
 */
export function streetBand(grid: TownGrid, street: number): number {
  return Math.min(0.3 * grid.pitch, street * 0.5);
}

/**
 * How far into a gate's cells its mouth runs, in world units: where the
 * town's street widens or narrows to the road's. Short, because a ramp keeps
 * off it; never more than half a cell.
 */
export function gateFlare(pitch: number): number {
  return Math.min(pitch * 0.5, 2);
}

/** Half the carriageway of every road between the towns, in world units (`ROAD_CLASSES` in `roads.ts`). */
export const CARRIAGEWAY_HALF = 3.6;

/** Where a road meets a town's street: the street's section at the gate, and the road's, which the mouth flares between. */
export interface GateMouth {
  /** The street's half-width at the gate — half the cell on an avenue, the band on a boundary — and its pavement. */
  street: number;
  walk: number;
  /** The road's carriageway half-width, which it keeps to the kerb. */
  carriage: number;
  /** Where the road's pavement ends, from the street's centre line, at the kerb. */
  edge: number;
  /** How far in from the kerb the town's street takes to become its own again. 0 where there is no street. */
  flare: number;
}

/**
 * The mouth of a gate. The road keeps its width and a pavement to the kerb,
 * and over `gateFlare` of the gate's cells the town's carriageway runs from
 * the road's half-width to its own, and its pavement's outer edge from `edge`
 * to the street's. On a band that widens the street into the plots either side
 * (`rectOf` in `settlements/`); an avenue's mouth narrows the carriageway and
 * widens the pavement instead. A one-cell square has no street.
 */
export function gateMouth(grid: TownGrid, gate: Gate, band: number): GateMouth {
  if (grid.cells < 2) {
    return { street: 0, walk: 0, carriage: CARRIAGEWAY_HALF, edge: CARRIAGEWAY_HALF, flare: 0 };
  }
  const avenue = gate.cells.length < 2;
  const street = avenue ? grid.pitch * 0.5 : band;
  const walk = pavementOf(street);
  const edge = avenue
    ? Math.min(street, CARRIAGEWAY_HALF + SIDEWALK)
    : Math.max(street, CARRIAGEWAY_HALF + walk);
  return { street, walk, carriage: CARRIAGEWAY_HALF, edge, flare: gateFlare(grid.pitch) };
}

export interface TownGrid {
  /** Half the side of the square, in world units. */
  half: number;
  /** Cells along each side. */
  cells: number;
  /** The side of one cell, in world units: `2 * half / cells`. */
  pitch: number;
  /** `(cells - 1) / 2`. Cell `c`'s centre is `(c - shift) * pitch` from the town's centre. */
  shift: number;
  /**
   * The streets, per cell index along either axis — the square is symmetric,
   * so one set of three arrays says it for both.
   *
   * `avenue[c]` makes the whole cell street: the main street of a town with an
   * odd number of cells runs down the middle one. `low[c]` and `high[c]` put a
   * band of street along that edge of the cell, which is how every other street
   * is drawn: two cells either side of a boundary each pave their own half of
   * it. See `streetsFor` for the rule that places them.
   */
  avenue: Uint8Array;
  low: Uint8Array;
  high: Uint8Array;
  /**
   * Where a street meets the edge of the square, as offsets along any side
   * from its midpoint. The main street's end is always 0; a town of six or more
   * cells a side has secondary streets and more. This is where roads come in.
   */
  slots: readonly number[];
}

const grids = new Map<number, TownGrid>();

/**
 * The square a place built at this radius stands on: `radiusOf(place)`, never
 * the law's answer for its population. Cached: it is asked per road end.
 */
export function townGrid(radius: number): TownGrid {
  const known = grids.get(radius);
  if (known !== undefined) return known;
  const half = radius / Math.SQRT2;
  const cells = Math.max(1, Math.round((2 * half) / TOWN_PITCH));
  const pitch = (2 * half) / cells;
  const shift = (cells - 1) / 2;
  const { avenue, low, high } = streetsFor(cells);
  const slots = [0];
  for (let c = 0; c + 1 < cells; c++) {
    // A secondary band on the positive side of the centre, mirrored: the main
    // street is the one at 0 and it is already in the list.
    if (high[c] === 1 && (c + 0.5 - shift) * pitch > pitch * 0.75) {
      const at = (c + 0.5 - shift) * pitch;
      slots.push(at, -at);
    }
  }
  slots.sort((a, b) => a - b);
  const grid: TownGrid = { half, cells, pitch, shift, avenue, low, high, slots };
  grids.set(radius, grid);
  return grid;
}

/** How many cells past the square's edge the country round a town reaches, at most (the disc stops it first). */
export const COUNTRY_RING = 2;

/**
 * How far from its centre a town's own country reaches: its disc, or for a
 * town too small to have room inside it, `COUNTRY_RING` cells past its square.
 * The countryside between the towns (`countryside.ts`) starts past it.
 */
export function countryReach(radius: number): number {
  const grid = townGrid(radius);
  return Math.max(radius, grid.half + COUNTRY_RING * grid.pitch);
}

/**
 * Where the streets run along one axis of a square `cells` wide, so that every
 * cell touches a street or the edge: a main street through the centre (the
 * middle cell when odd, the middle boundary when even), then blocks two cells
 * deep outwards from it.
 */
function streetsFor(cells: number): { avenue: Uint8Array; low: Uint8Array; high: Uint8Array } {
  const avenue = new Uint8Array(cells);
  const low = new Uint8Array(cells);
  const high = new Uint8Array(cells);
  if (cells === 1) return { avenue, low, high };
  let first: number;
  let last: number;
  if (cells % 2 === 1) {
    const middle = (cells - 1) / 2;
    avenue[middle] = 1;
    first = middle + 1;
    last = middle - 1;
  } else {
    const middle = cells / 2;
    high[middle - 1] = 1;
    low[middle] = 1;
    first = middle;
    last = middle - 1;
  }
  const quarter = Math.floor(cells / 2);
  for (let j = 1; j + 1 < quarter; j += 2) {
    high[first + j] = 1;
    low[first + j + 1] = 1;
    low[last - j] = 1;
    high[last - j - 1] = 1;
  }
  return { avenue, low, high };
}

/** A cell's centre, as an offset from the town's centre along either axis. */
export function cellCentre(grid: TownGrid, c: number): number {
  return (c - grid.shift) * grid.pitch;
}

/** Corner `i` of the lattice, shared by cells `i - 1` and `i`, as an offset. */
export function cornerOffset(grid: TownGrid, i: number): number {
  return (i - 0.5 - grid.shift) * grid.pitch;
}

/** The cell an offset falls in. May be outside `[0, cells)`: that is off the square. */
export function cellIndex(grid: TownGrid, offset: number): number {
  return Math.round(offset / grid.pitch + grid.shift);
}

export function inGrid(grid: TownGrid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cells && row < grid.cells;
}

/** Whether a cell is street from edge to edge: on an avenue in either direction. */
export function isAvenue(grid: TownGrid, col: number, row: number): boolean {
  return grid.avenue[col] === 1 || grid.avenue[row] === 1;
}

/**
 * The town's tangent frame: +Z along the ground towards the pole, `across` the
 * other way, written into the vectors handed in. Shared by the town and the
 * roads. `makeBasis(across, up, north)` has a positive determinant with
 * `across = up x north`; the other order is a reflection and flips winding.
 */
export function townFrame(up: THREE.Vector3, across: THREE.Vector3, north: THREE.Vector3): void {
  north.set(0, 1, 0).projectOnPlane(up);
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
  north.normalize();
  across.crossVectors(up, north).normalize();
}

/** Where an offset `(x, z)` in a town's frame lands on the unit sphere. */
export function offsetDirection(
  up: THREE.Vector3, across: THREE.Vector3, north: THREE.Vector3,
  x: number, z: number, target: THREE.Vector3,
): THREE.Vector3 {
  return target
    .copy(up)
    .addScaledVector(across, x / PLANET_RADIUS)
    .addScaledVector(north, z / PLANET_RADIUS)
    .normalize();
}

/**
 * One place a road may come into a town. `(x, z)` is where a street's
 * centreline meets the square's edge, in the town's frame; `out` is the edge's
 * outward normal; `cells` are the edge cells the street opens onto (one on an
 * avenue, two on a band), whose level the road climbs to.
 */
export interface Gate {
  /** 0 +x, 1 +z, 2 -x, 3 -z, in the town's frame (`+x` is `across`, which points west). */
  side: number;
  x: number;
  z: number;
  outX: number;
  outZ: number;
  cells: readonly (readonly [number, number])[];
}

export const SIDES: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Every gate the square has: its street ends on all four sides. */
export function gatesOf(grid: TownGrid): Gate[] {
  const gates: Gate[] = [];
  const edge = grid.cells - 1;
  for (let side = 0; side < 4; side++) {
    const [outX, outZ] = SIDES[side]!;
    for (const along of grid.slots) {
      // The cells along the side the street opens onto: one if `along` is a
      // cell centre, the two either side if it is a boundary.
      const u = along / grid.pitch + grid.shift;
      const onCentre = Math.abs(u - Math.round(u)) < 1e-6;
      const lanes = onCentre ? [Math.round(u)] : [Math.floor(u), Math.ceil(u)];
      const cells = lanes
        .filter((c) => c >= 0 && c < grid.cells)
        .map((c): readonly [number, number] => {
          if (outX > 0) return [edge, c];
          if (outX < 0) return [0, c];
          if (outZ > 0) return [c, edge];
          return [c, 0];
        });
      gates.push({
        side,
        x: outX !== 0 ? outX * grid.half : along,
        z: outZ !== 0 ? outZ * grid.half : along,
        outX,
        outZ,
        cells,
      });
    }
  }
  return gates;
}

/**
 * How far past the mouth of a gate its light runs, out along the road and in
 * along the street, in world units: about a town's approach, over which the
 * falloff takes the road from the floor's brightness to dark.
 */
const GATE_GLOW_RUN = 24;

/**
 * The light at a gate a road comes in by: its centre in the town's frame, the
 * radius it is full to and where it ends; strength 1, burning till dawn. Full
 * across the whole mouth and a unit over, so where the floor and the road's
 * ribbon meet both are at their peak and the kerb disappears at night. `poolAt`
 * in `lights.ts` is the law both apply.
 */
export function gateGlow(grid: TownGrid, gate: Gate, band: number): { x: number; z: number; inner: number; reach: number } {
  const mouth = gateMouth(grid, gate, band);
  const inner = Math.max(gate.cells.length < 2 ? grid.pitch * 0.5 : band, mouth.edge) + 1;
  return { x: gate.x, z: gate.z, inner, reach: inner + GATE_GLOW_RUN };
}
