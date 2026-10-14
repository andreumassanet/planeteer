/**
 * The countryside's plans made into a vegetation tile's geometry: the pieces
 * placed and bedded like the plants, the fields laid on the drawn land, the
 * fences along the ground, all into the tile's one merged buffer in its own
 * frame, so the countryside shares the wood's levels, budgets and dissolve.
 *
 * What a tile of each level draws of a plan: every piece legible at the
 * level's distance (the rule the plants follow), every field at every level,
 * but its rows and bunds only in the finest tiles, and fences only there. The
 * wood keeps off every piece, field and fence of every plan under the tile at
 * every level, so no tree stands where a coarser tile has none and a finer
 * one a barn.
 *
 * A field lies on what is drawn, not on the relief: the land is triangles
 * between points of the relief, up to a unit and a half off it, so where the
 * land probe answers a field's every vertex is the drawn land's own height and
 * normal plus its level's `FIELD_LIFTS`. Past it a field stands
 * `FAR_FIELD_LIFT` over the relief with a skirt into the ground; a near tile
 * built that way is marked provisional and built again once the probe answers.
 *
 * What turns is merged standing still into the coarser tiles only; in the two
 * finest a tile hands its rotors, lamps and campfires to
 * `countryside-motion.ts` as rows of numbers.
 *
 * The parts live in `countryside-tile/`.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import type { LandProbe } from './land-probe.ts';
import type { RegionStyle, SceneryContext } from './scenery/contract.ts';
import type { Countryside, CountryPlan } from './countryside.ts';
import { cellsOf, rootOf } from './tile-grid.ts';
import { fenceAlong } from './countryside-tile/bar.ts';
import { createFlats } from './countryside-tile/flats.ts';
import { createKeepouts } from './countryside-tile/keepouts.ts';
import { lookOf, shootsOf } from './countryside-tile/looks.ts';
import type { CropRows, Look } from './countryside-tile/looks.ts';
import { createPieces } from './countryside-tile/pieces.ts';
import type { TileAcc } from './countryside-tile/pieces.ts';
import { plate } from './countryside-tile/plate.ts';
import { rows } from './countryside-tile/rows.ts';
import { createSurface, resetSurface } from './countryside-tile/surface.ts';
import type { Surface } from './countryside-tile/surface.ts';
import { FIELD_LIFTS, MOTION_LEVEL } from './countryside-tile/types.ts';
import type { CountryBuilder, CountryFlat, CountryFrame, CountryPlaced, CountryTile } from './countryside-tile/types.ts';
import type { CropId } from './countryside.ts';

export { cropPlate, strawOf } from './countryside-tile/looks.ts';
export {
  BEACON_STRIDE,
  MOTION_LEVEL,
  PIECE_BURY,
  ROTOR_KINDS,
  ROTOR_STRIDE,
  SMOKE_STRIDE,
} from './countryside-tile/types.ts';
export type {
  CountryBuilder,
  CountryFlat,
  CountryFrame,
  CountryMachine,
  CountryMotionRows,
  CountryPlaced,
  CountryTile,
} from './countryside-tile/types.ts';

const IDENTITY = new THREE.Matrix4();

/** The tile's own geometry (fields, rows, fences), brought into its frame as one more placed part. */
function ownGeometry(surface: Surface, frame: CountryFrame): CountryFlat | null {
  const { out } = surface;
  if (out.position.length === 0) return null;
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
  return flat;
}

export function createCountryBuilder(
  world: World,
  ctx: SceneryContext,
  country: Countryside,
  scenic: (part: string, style: RegionStyle, variant: number) => CountryFlat | null,
): CountryBuilder {
  let taken: (id: string) => boolean = () => false;
  const flats = createFlats(ctx, scenic);
  const surface = createSurface(world);
  const keepouts = createKeepouts();
  const pieces = createPieces(world, surface, flats, () => taken);
  const shoots: CropRows = shootsOf(ctx);
  const looks = new Map<CropId, Look>();
  const lookFor = (crop: CropId): Look => {
    let look = looks.get(crop);
    if (look === undefined) looks.set(crop, (look = lookOf(ctx, crop)));
    return look;
  };

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

  function build(plans: readonly CountryPlan[], frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean): CountryTile {
    const acc: TileAcc = { placed: [], rotorRows: [], beaconRows: [], smokeRows: [], vertices: 0, priced: 0, pieces: 0 };
    resetSurface(surface);
    let fields = 0;
    let fences = 0;
    let fallback = false;
    surface.fieldLift = FIELD_LIFTS[Math.min(frame.level, FIELD_LIFTS.length - 1)]!;

    for (const plan of plans) {
      pieces.placePlan(plan, frame, floor, land, landReady, acc);
      for (const field of plan.fields) {
        const look = lookFor(field.crop);
        if (plate(surface, look, field, frame.level, land, landReady)) fallback = true;
        if (frame.level === 0) rows(surface, ctx, look, shoots, field, land, landReady);
        fields++;
        if (field.crop === 'olives') pieces.oliveGrove(plan, field, frame, floor, land, landReady, acc);
      }
      if (frame.level === 0) {
        for (const line of plan.lines) {
          fenceAlong(surface, ctx, line, plan.style, land, landReady);
          fences++;
        }
      }
    }

    const own = ownGeometry(surface, frame);
    if (own !== null) {
      const count = own.position.length / 3;
      acc.placed.push({ flat: own, matrix: IDENTITY } satisfies CountryPlaced);
      acc.vertices += count;
      acc.priced += count;
    }

    const { rotorRows, beaconRows, smokeRows } = acc;
    const motion =
      rotorRows.length + beaconRows.length + smokeRows.length > 0
        ? { rotors: Float32Array.from(rotorRows), beacons: Float32Array.from(beaconRows), smokes: Float32Array.from(smokeRows) }
        : null;
    return { placed: acc.placed, vertices: acc.vertices, priced: acc.priced, pieces: acc.pieces, fields, fences, motion, provisional: fallback && frame.level <= MOTION_LEVEL };
  }

  return {
    plansUnder,
    ensure,
    prepare: keepouts.prepare,
    blocks: keepouts.blocks,
    build,
    setTaken(test) {
      taken = test;
    },
  };
}
