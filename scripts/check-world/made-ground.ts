import { DEG, check, here } from './harness.ts';
import type { WorldContext } from './context.ts';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { radiusFor } from '../../src/places.ts';
import { decodeRoads, inflate } from '../../src/pack.ts';
import {
  ROAD_CLASSES,
  } from '../../src/roads.ts';
import { poolAt, poolByte } from '../../src/lights.ts';
import {
  cornerOffset,
  gateGlow,
  gateMouth,
  gateLevel,
  gatesOf,
  groundOf,
  OUTSKIRT_MIN_CELLS,
  outskirtsOf,
  partnerOf,
  streetBand,
  townGrid,
  townTerraces,
} from '../../src/scenery/grid.ts';
import type { TownGrid } from '../../src/scenery/grid.ts';
import {
  EDGE_RUN,
  GROUND_LIFT,
  KERB_DROP,
  STREET_GRADE,
  TERRACE_STEP,
  cellKey,
  pavementOf,
} from '../../src/scenery/ground.ts';
import {
  STEP_RISE,
  buildFloor,
  edgeSink,
  flightHeight,
  flightRect,
  floorLiftAt,
  rampGrade,
} from '../../src/scenery/floor.ts';
import type { FloorField } from '../../src/scenery/floor.ts';
import { STEP_UP } from '../../src/player.ts';
import { checkBakedRoads } from './road-feet.ts';

/**
 * The ground people made, and whether a foot can find it.
 *
 * A town's floor is a plinth `GROUND_LIFT` over the relief and a road's
 * carriageway a ribbon at `RIBBON_LIFT`. `settlements.ts` publishes
 * `madeHeightAt` and `roads.ts` `ribbonHeightAt`, and `player.ts` stands on the
 * higher of the two and the relief.
 *
 * `roads.ts` and `scenery/floor.ts` are Node-safe, so the ribbon is checked
 * against the shipped network and the floor against the shipped builder over a
 * synthetic town. `settlements.ts` is not (it reaches the kit through an
 * `import.meta.glob` registry); `atlas.settlements.survey()` samples a ring
 * across every resident town in a browser instead.
 */
export async function checkMadeGround(ctx: WorldContext): Promise<void> {
  const { world, placesRaw } = ctx;
  console.log('\nmade ground');
  const { edge, hill, pitch, stepped } = checkFloorSurface();
  /**
   * And the streets across the risers, which is what the flights are for.
   *
   * Walked from one side of the town to the other down the middle of the
   * avenue, the tallest single rise a foot meets is one step and the whole
   * climb is still the two terraces; walked through the yards beside it, the
   * same risers are walls a `TERRACE_STEP` tall, which a foot takes in one
   * frame as it always did (`HEIGHT_SMOOTHING` in `player.ts`).
   */
  const across = (z: number): { rise: number; climb: number } => {
    let rise = 0;
    let start = 0;
    let last = 0;
    for (let x = -edge + 0.01, k = 0; x <= edge - 0.01; x += 0.02, k++) {
      const ground = hill(x / pitch + 1.5);
      const stand = ground + Math.max(0, floorLiftAt(stepped, x, z, ground));
      if (k === 0) start = stand;
      else rise = Math.max(rise, stand - last);
      last = stand;
    }
    return { rise, climb: last - start };
  };
  const street = across(0);
  const yard = across(-pitch);
  check(
    street.rise <= STEP_RISE + 1e-9 && Math.abs(street.climb - 2 * TERRACE_STEP) < 1e-9 &&
      Math.abs(yard.rise - TERRACE_STEP) < 1e-9,
    'and a street that crosses a riser climbs it by a flight, no step taller than STEP_RISE',
    `${stepped.stats?.flights} flights of ${stepped.stats?.steps} risers: tallest step on the avenue ` +
      `${street.rise.toFixed(2)} in a climb of ${street.climb.toFixed(1)}, beside it ${yard.rise.toFixed(2)}`,
  );

  /**
   * One level a street, which is what the flights are laid on.
   *
   * `townTerraces` cuts the cells that share a street to one level; cut apart,
   * a riser would run down the middle of a street on a hill. Held over a square
   * of every size `townGrid` gives, on a hill climbing both ways with a ripple
   * in it:
   *
   * - no cell has a band on both of its sides;
   * - the two cells either side of every band are one level;
   * - every flight on a band has its twin on the other half, at the same line
   *   and between the same two levels;
   * - every gate's cells are cut to the level `gateLevel` gives the road.
   */
  {
    const { sizes } = checkStreetLevels();

    /**
     * And where a town stops short of its square (`outskirtsOf`), over every
     * size of square and forty seeds each: never a cell the caller keeps nor
     * one of the town's middle, never a clearing inside the town — every cell given up
     * reaches the square's edge through others given up, or the edge slope
     * would go down into a pit — the same answer twice, and the town keeps
     * most of itself.
     */
    let outskirtTowns = 0;
    let outskirtCells = 0;
    let outskirtOf = 0;
    let onStreet = 0;
    let onKept = 0;
    let clearings = 0;
    let unstable = 0;
    let leastKept = 1;
    for (const grid of sizes.values()) {
      if (grid.cells < OUTSKIRT_MIN_CELLS) continue;
      const keep = (col: number, row: number): boolean => col === 1 && row === 1;
      for (let s = 0; s < 40; s++) {
        ({ unstable, outskirtTowns, outskirtCells, outskirtOf, leastKept, onStreet, onKept, clearings } = checkOutskirts(s, grid, keep, unstable, outskirtTowns, outskirtCells, outskirtOf, leastKept, onStreet, onKept, clearings));
      }
    }
    check(
      onStreet === 0 && onKept === 0 && clearings === 0 && unstable === 0 && outskirtCells > 0,
      'a town stops short of its square only from its edge in, never at its middle or on the cells it keeps, the same way twice',
      `${outskirtTowns} towns, ${outskirtCells} of ${outskirtOf} cells given up; ${onStreet} at the middle, ${onKept} kept, ${clearings} in a clearing, ${unstable} unstable`,
    );
    check(
      leastKept >= 0.7,
      'and every town keeps most of its square',
      `the least kept ${(leastKept * 100).toFixed(0)}% of its cells`,
    );

    checkGateLight(sizes);
  }

  /**
   * The ribbon, against the network that ships.
   *
   * `ribbonHeightAt` is asked about points on real roads — the same course the
   * bake tested for water and the streamer lays the ribbon along, the same path
   * and the same `crownLift` — so a road that was asserted clear of a town
   * cannot be a road a foot stands on inside one, and a kerb asserted at its
   * gate's paving cannot be a step for the foot that crosses it.
   */
  const roadsPath = resolve(here, '../public/data/roads.bin');
  if (!existsSync(roadsPath)) {
    check(false, 'public/data/roads.bin exists', 'run `pnpm roads`');
  } else {
    const bakedNetwork = decodeRoads(await inflate(readFileSync(roadsPath)));
    // The file, whole: it is baked over the built towns now, so every row in it
    // is a row the streamer lays and there is nothing to filter out first.
    checkBakedRoads(bakedNetwork, placesRaw, world);
  }
}

/**
 * The floor, which is drawn where a foot stands on it.
 *
 * The town's edge is a drawn slope, and a street that crosses a riser a drawn
 * flight of steps, both built by `buildFloor` and read back by
 * `floorLiftAt` out of the one field `buildGround` draws — so what is held
 * here is the field's contract, over the builder the streamer calls: level
 * paving; a slope that leaves it without a step and meets level ground
 * `EDGE_RUN` out at a gradient a body walks up; a convex corner that is a
 * hip; a quay that is still a wall; and, on a street that would otherwise be
 * a riser, a flight no step of which is taller than `STEP_RISE`.
 */
function checkFloorSurface(): { edge: number; hill: (i: number) => number; pitch: number; stepped: FloorField } {
  const pitch = 12.65;
  const GROUND = 100;
  // A square three cells a side with an avenue down the middle both ways,
  // which is what `townGrid` cuts one that size into.
  const lane = (at: number): Uint8Array => {
    const flags = new Uint8Array(3);
    if (at >= 0) flags[at] = 1;
    return flags;
  };
  const grid = { pitch, shift: 1, avenue: lane(1), low: lane(-1), high: lane(-1) };
  const floorOf = (level: (c: number) => number, ground: (i: number, j: number) => number | null) => {
    const terraces = new Map<number, number>();
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) terraces.set(cellKey(c, r), level(c));
    return buildFloor({ grid, band: 3.6, terraces, cornerGround: ground });
  };
  /**
   * A nine-cell town on flat ground, and the same one cut into a hillside.
   *
   * The flat one is the case half the world is: one terrace, so the paving is
   * a plane at `GROUND_LIFT` over it and the slope round it is the whole edge.
   * The stepped one is three columns a `TERRACE_STEP` apart on a hill rising
   * under them, which is what a town on a slope is: it holds the *absolute*
   * half of the contract — on a terrace the answer must not move as the ground
   * under it does — and its avenue crosses both risers.
   */
  const flat = floorOf(() => GROUND, () => GROUND);
  const hill = (i: number): number => GROUND - 3 + TERRACE_STEP * Math.max(0, Math.min(3, i));
  const stepped = floorOf((c) => GROUND + c * TERRACE_STEP, (i) => hill(i));
  const edge = pitch * 1.5;

  let onPaving = 0;
  let wrongOnPaving = 0;
  for (let x = 0; x < edge - 1e-6; x += 0.05) {
    // The ground the query stands on, which on the paving is whatever the hill
    // happens to be doing under a level surface. Walked deliberately, so that a
    // lift measured against a *moving* ground still adds back up to one height.
    const ground = GROUND + Math.sin(x * 0.3) * 0.9;
    onPaving++;
    if (Math.abs(ground + floorLiftAt(flat, x, 0, ground) - (GROUND + GROUND_LIFT)) > 1e-9) wrongOnPaving++;
  }
  check(
    wrongOnPaving === 0,
    'the paving is level over its own cell, at GROUND_LIFT over the terrace',
    `${onPaving} samples inside the floor, ${wrongOnPaving} wrong, lift ${GROUND_LIFT}`,
  );

  /**
   * The edge slope, walked straight out from the middle of a side over level
   * ground, to the far side of its one course.
   *
   * Measured against a fixed ground, because what it has to be is monotonic in
   * the distance. It starts on the paving — the first sample past the kerb line
   * is `GROUND_LIFT` up, which is what makes it a slope and not a step — and
   * its whole course is one plane, from the paving's top down to `edgeSink`
   * under the ground, so the gradient where a foot is on it and where it is
   * buried is the same number: `GROUND_LIFT / EDGE_RUN`, 0.33, 18 degrees.
   */
  const sink = edgeSink(pitch);
  const first = floorLiftAt(flat, edge + 1e-6, 0, GROUND);
  let previous = GROUND_LIFT;
  let outOfRange = 0;
  let backwards = 0;
  let steepest = 0;
  let reaches = -1;
  for (let x = edge; x < edge + pitch - 0.05; x += 0.05) {
    const lift = floorLiftAt(flat, x, 0, GROUND);
    if (lift > GROUND_LIFT + 1e-9 || lift < -sink - 1e-9) outOfRange++;
    if (lift > previous + 1e-9) backwards++;
    steepest = Math.max(steepest, (previous - lift) / 0.05);
    if (lift <= 0 && reaches < 0) reaches = x - edge;
    previous = lift;
  }
  check(
    Math.abs(first - GROUND_LIFT) < 1e-6 && outOfRange === 0 && backwards === 0,
    'the edge slope leaves the paving without a step and only ever falls',
    `${first.toFixed(3)} just past the kerb line against ${GROUND_LIFT}, ` +
      `${outOfRange} out of [-${sink.toFixed(2)}, ${GROUND_LIFT}], ${backwards} rising`,
  );
  check(
    reaches >= 0 && Math.abs(reaches - EDGE_RUN) < 0.1 && steepest <= GROUND_LIFT / EDGE_RUN + 1e-6,
    'and it meets level ground EDGE_RUN out, at a gradient a body walks up',
    `${reaches.toFixed(2)} units out, steepest ${steepest.toFixed(3)} (${(Math.atan(steepest) / DEG).toFixed(1)} deg)`,
  );
  // The corner. Split through the one corner it touches, the cell off a convex
  // corner is two slopes meeting at a hip, so it meets the ground on the square
  // `EDGE_RUN` out — not on a circle, and not along a fold across the cell.
  let hip = -1;
  for (let d = 0; d <= pitch; d += 0.02) {
    if (floorLiftAt(flat, edge + d, edge + d, GROUND) <= 0) {
      hip = d;
      break;
    }
  }
  check(
    Math.abs(hip - EDGE_RUN) < 0.05,
    'and a convex corner is a hip, meeting the ground on the square EDGE_RUN out',
    `${hip.toFixed(2)} out on each axis along the diagonal`,
  );
  // Over a valley the slope still ends one course out and under the ground
  // there, so it steepens into an embankment down to the field rather than
  // stand a ledge over it.
  const inSquare = (i: number, j: number): boolean => i >= 0 && i <= 3 && j >= 0 && j <= 3;
  const fill = floorOf(() => GROUND, (i, j) => (inSquare(i, j) ? GROUND : GROUND - 15));
  const footOfFill = floorLiftAt(fill, edge + pitch - 0.01, 0, GROUND - 15);
  check(
    Math.abs(floorLiftAt(fill, edge, 0, GROUND) - GROUND_LIFT) < 1e-9 && footOfFill < 0,
    'and over falling ground it is an embankment that reaches the field, not a ledge',
    `${footOfFill.toFixed(2)} against the field at its foot, steepest ${fill.stats?.embankment.toFixed(2)}`,
  );
  // And a quay: where the sea is next door the edge keeps its face.
  const quay = floorOf(() => GROUND, (i) => (i > 3 ? null : GROUND));
  const offQuay = floorLiftAt(quay, edge + 2, 0, GROUND);
  check(
    offQuay === 0 && quay.stats?.quays === 3 && quay.stats.slopes === 9,
    'and where the sea is next door the edge is a quay, with no slope to stand on',
    `${quay.stats?.quays} quay edges of ${(GROUND_LIFT + KERB_DROP).toFixed(1)}, ` +
      `${quay.stats?.slopes} sloped, lift past it ${offQuay}`,
  );

  /**
   * And the stepped town, which is the terracing's own contract.
   *
   * A foot on a terrace stands at that terrace's height and not at the one next
   * door, and the height it stands at does not move with the ground under it.
   * Sampled in the rows either side of the avenue, because the avenue itself
   * climbs by flights and is the next assertion's.
   */
  let wrongTerrace = 0;
  let terraceSamples = 0;
  for (let c = 0; c < 3; c++) {
    for (let step = 0; step < 9; step++) {
      const x = (c - 1 + (step / 8 - 0.5) * 0.9) * pitch;
      const z = (step % 2 === 0 ? 1 : -1) * pitch * (0.8 + 0.1 * (step % 3));
      const ground = hill(c + 0.5) + Math.sin(x * 0.7) * 1.4;
      const want = GROUND + c * TERRACE_STEP + GROUND_LIFT;
      terraceSamples++;
      if (Math.abs(ground + floorLiftAt(stepped, x, z, ground) - want) > 1e-9) wrongTerrace++;
    }
  }
  check(
    wrongTerrace === 0,
    'and on a stepped town a foot stands on its own terrace, whatever the ground does',
    `${terraceSamples} samples over ${new Set(stepped.terraces.values()).size} terraces, ${wrongTerrace} wrong`,
  );
  return { edge, hill, pitch, stepped };
}

/** One level a street: the terraces, the flights and the gates' cells over every size of square. */
function checkStreetLevels(): { sizes: Map<number, TownGrid> } {
  const hillside = (x: number, z: number): number => 100 + 0.34 * x + 0.21 * z + 2.5 * Math.sin(x * 0.11 + z * 0.07);
  const sizes = new Map<number, TownGrid>();
  for (let k = 0; k <= 160; k++) {
    const grid = townGrid(radiusFor(Math.round(10 ** (k / 20))));
    if (!sizes.has(grid.cells)) sizes.set(grid.cells, grid);
  }
  let doubleBanded = 0;
  let pairs = 0;
  let split = 0;
  let levelsSeen = 0;
  let bandFlights = 0;
  let orphans = 0;
  let rampSides = 0;
  let rampWalls = 0;
  let rampWallWorst = 0;
  let gateCells = 0;
  let gateWrong = 0;
  let rampsSeen = 0;
  let stairsSeen = 0;
  let rampSteepest = 0;
  let rampSlope = 0;
  let rampLongest = 0;
  let rampWrong = 0;
  let streetStep = 0;
  let inMouth = 0;
  let mouthsSeen = 0;
  let mouthsWrong = 0;
  for (const grid of sizes.values()) {
    /**
     * The gate's mouth: the road's carriageway to the kerb, which is every
     * class's, and a pavement out to where the street's own reaches, or
     * past it on a band street, never inside it.
     */
    for (const gate of gatesOf(grid)) {
      for (const street of [6, 9.75, 15]) {
        const band = streetBand(grid, street);
        const mouth = gateMouth(grid, gate, band);
        mouthsSeen++;
        const carriageOk = ROAD_CLASSES.every((entry) => Math.abs(entry.width * 0.5 - mouth.carriage) < 1e-9);
        const edgeOk = grid.cells < 2
          ? mouth.edge === mouth.carriage && mouth.flare === 0
          : gate.cells.length < 2
            ? mouth.edge <= mouth.street + 1e-9 && mouth.edge > mouth.carriage
            : mouth.edge >= Math.max(mouth.street, mouth.carriage + pavementOf(band)) - 1e-9;
        if (!carriageOk || !edgeOk || mouth.flare > grid.pitch * 0.5 + 1e-9) mouthsWrong++;
      }
    }
    for (let c = 0; c < grid.cells; c++) {
      if (grid.high[c] === 1 && grid.low[c] === 1) doubleBanded++;
      if (partnerOf(grid, partnerOf(grid, c)) !== c) doubleBanded++;
    }
    const base = hillside(0, 0);
    const levels = townTerraces(grid, groundOf(grid, hillside, base));
    const paved = new Map<number, number>();
    for (const [key, level] of levels) if (level !== null) paved.set(key, level);
    levelsSeen = Math.max(levelsSeen, new Set(paved.values()).size);
    for (let c = 0; c + 1 < grid.cells; c++) {
      if (grid.high[c] !== 1) continue;
      for (let r = 0; r < grid.cells; r++) {
        for (const [a, b] of [[cellKey(c, r), cellKey(c + 1, r)], [cellKey(r, c), cellKey(r, c + 1)]] as const) {
          const la = paved.get(a);
          const lb = paved.get(b);
          if (la === undefined || lb === undefined) continue;
          pairs++;
          if (la !== lb) split++;
        }
      }
    }
    // A road in at every gate, so the ramps keep off every mouth.
    const mouths = new Set<number>();
    for (const gate of gatesOf(grid)) for (const [col, row] of gate.cells) mouths.add(cellKey(col, row) * 4 + gate.side);
    const field = buildFloor({
      grid,
      mouths,
      band: streetBand(grid, 9.75),
      terraces: paved,
      cornerGround: (i, j) => hillside(cornerOffset(grid, i), cornerOffset(grid, j)),
    });
    // And the same town with a ragged edge (`outskirtsOf`), where the two
    // rows either side of a band street stop in different places: the twin
    // of a half is planned with it, not found by it.
    const ragged = new Map(paved);
    for (const key of outskirtsOf(grid, `ramps-${grid.cells}`, () => false)) ragged.delete(key);
    const raggedField = buildFloor({
      grid,
      mouths,
      band: streetBand(grid, 9.75),
      terraces: ragged,
      cornerGround: (i, j) => hillside(cornerOffset(grid, i), cornerOffset(grid, j)),
    });
    for (const floor of [field, raggedField]) {
      for (const list of floor.flights?.values() ?? []) {
        for (const flight of list) {
          const col = Math.floor(flight.cell / 1024) - 512;
          const row = (flight.cell % 1024) - 512;
          // The street it climbs runs along `axis`, so its band is on the cell's
          // index on the other axis; an avenue's flight is a whole cell wide.
          const across = flight.axis === 0 ? row : col;
          const twin = partnerOf(grid, across);
          const other = flight.axis === 0 ? cellKey(col, twin) : cellKey(twin, row);
          // A half whose twin row is not paved on both sides of the riser —
          // given up to the outskirts — is a street's last half, and its
          // midline is the town's edge, not a carriageway.
          const twinAbove = flight.axis === 0
            ? cellKey(col + (flight.into > 0 ? -1 : 1), twin)
            : cellKey(twin, row + (flight.into > 0 ? -1 : 1));
          const paired = twin !== across && floor.terraces.has(other) && floor.terraces.has(twinAbove);
          if (paired) {
            bandFlights++;
            const matched = (floor.flights?.get(other) ?? []).some((f) =>
              f.axis === flight.axis && Math.abs(f.at - flight.at) < 1e-9 && f.into === flight.into &&
              f.high === flight.high && f.low === flight.low && f.ramp === flight.ramp &&
              Math.abs(f.back - flight.back) < 1e-9 && Math.abs(f.run - flight.run) < 1e-9);
            if (!matched) orphans++;
          }
          // Nothing stands up out of the carriageway beside a ramp: at each
          // of its sides inside the carriageway — a band half's midline —
          // what is just beyond is the ramp's own surface all the way along,
          // so the drawing's side there has no height anywhere.
          if (!flight.ramp || !paired) continue;
          const carriage = flight.half - pavementOf(flight.half);
          for (const [t, sign] of [[flight.from, -1], [flight.to, 1]] as const) {
            if (Math.abs(t - flight.centre) >= carriage) continue;
            rampSides++;
            const probe = t + sign * 1e-3;
            for (let s = -flight.back; s <= flight.run; s += 0.25) {
              const along = flight.at + flight.into * s;
              const [x, z] = flight.axis === 0 ? [along, probe] : [probe, along];
              const drop = Math.abs(floorLiftAt(floor, x, z, 0) - flightHeight(flight, s));
              if (drop > 1e-3) {
                rampWalls++;
                rampWallWorst = Math.max(rampWallWorst, drop);
              }
            }
          }
        }
      }
    }
    // Every crossing walked down the middle of what it carries, from the
    // level paving before it to the level paving after it: the steepest
    // stretch of a ramp, and the tallest single rise anywhere on it.
    for (const list of field.flights?.values() ?? []) {
      for (const flight of list) {
        const t = (flight.from + flight.to) * 0.5;
        const pointAt = (s: number): [number, number] => {
          const along = flight.at + flight.into * s;
          return flight.axis === 0 ? [along, t] : [t, along];
        };
        if (flight.ramp) {
          rampsSeen++;
          rampSteepest = Math.max(rampSteepest, rampGrade(flight));
          rampLongest = Math.max(rampLongest, flight.back + flight.run);
        } else {
          stairsSeen++;
        }
        let last = NaN;
        const d = 0.02;
        for (let s = -flight.back - 0.5; s <= flight.run + 0.5; s += d) {
          const [x, z] = pointAt(s);
          const h = floorLiftAt(field, x, z, 0);
          if (!Number.isNaN(last)) {
            const rise = Math.abs(h - last);
            streetStep = Math.max(streetStep, rise);
            if (flight.ramp) rampSlope = Math.max(rampSlope, rise / d);
          }
          last = h;
        }
        // And nothing climbs in a gate's mouth, where the town's street
        // flares to the road's section on level paving.
        const [fx0, fx1, fz0, fz1] = flightRect(flight);
        for (const gate of gatesOf(grid)) {
          const mouth = gateMouth(grid, gate, streetBand(grid, 9.75));
          if (mouth.flare <= 0) continue;
          const outer = Math.max(mouth.edge, mouth.street);
          const k0 = gate.outX !== 0 ? gate.x - gate.outX * mouth.flare : gate.z - gate.outZ * mouth.flare;
          const k1 = gate.outX !== 0 ? gate.x : gate.z;
          const [mx0, mx1, mz0, mz1] = gate.outX !== 0
            ? [Math.min(k0, k1), Math.max(k0, k1), gate.z - outer, gate.z + outer]
            : [gate.x - outer, gate.x + outer, Math.min(k0, k1), Math.max(k0, k1)];
          if (fx0 < mx1 - 1e-6 && mx0 < fx1 - 1e-6 && fz0 < mz1 - 1e-6 && mz0 < fz1 - 1e-6) inMouth++;
        }
        // And the drawn surface is the one described: the field at the
        // ramp's own middle is `flightHeight` there.
        if (flight.ramp) {
          const mid = (flight.run - flight.back) * 0.5;
          const [x, z] = pointAt(mid);
          if (Math.abs(floorLiftAt(field, x, z, 0) - flightHeight(flight, mid)) > 1e-9) rampWrong++;
        }
      }
    }
    for (const gate of gatesOf(grid)) {
      const level = gateLevel(grid, gate, hillside, base);
      if (level === null) continue;
      for (const [col, row] of gate.cells) {
        gateCells++;
        if (levels.get(cellKey(col, row)) !== level) gateWrong++;
      }
    }
  }
  check(
    doubleBanded === 0,
    'no cell of a town has a band street on both of its sides, so a street is shared by at most four cells',
    `${sizes.size} sizes of square, 1 to ${Math.max(...sizes.keys())} cells a side`,
  );
  check(
    split === 0 && pairs > 0,
    'and the two cells either side of every band street are cut to one level: no riser runs down a street',
    `${pairs.toLocaleString()} cell pairs across a band on a hillside, ${split} split, up to ${levelsSeen} levels a town`,
  );
  check(
    orphans === 0 && bandFlights > 0,
    'and every flight on a band street has its twin on the other half, at the same line, ragged edge or not',
    `${bandFlights} half-flights, ${orphans} without a twin`,
  );
  check(
    rampSides > 0 && rampWalls === 0,
    'and no ramp stands a wall inside the carriageway: its side on a band’s midline meets its twin',
    `${rampSides} ramp sides inside a carriageway, ${rampWalls} quarter-unit samples off what is beside them` +
      (rampWalls > 0 ? `, worst ${rampWallWorst.toFixed(3)}` : ''),
  );
  check(
    rampsSeen > 0 && stairsSeen === 0 && rampSteepest <= STREET_GRADE + 1e-9 && rampSlope <= STREET_GRADE + 1e-6 && rampWrong === 0,
    'and every street crosses its risers by ramps, none steeper than STREET_GRADE, with no flight of steps',
    `${rampsSeen} ramps and ${stairsSeen} flights, steepest ${rampSteepest.toFixed(3)} by its ends and ` +
      `${rampSlope.toFixed(3)} walked, longest ${rampLongest.toFixed(1)} units, against ${STREET_GRADE}`,
  );
  check(
    inMouth === 0 && mouthsWrong === 0 && mouthsSeen > 0,
    'and at a gate the road keeps its carriageway to the kerb, and the town’s street flares to it on level paving',
    `${mouthsSeen} mouths over three street widths, ${mouthsWrong} wrong, ${inMouth} ramps or flights reaching into one`,
  );
  check(
    streetStep <= STEP_UP,
    'and no street that crosses a riser has a step a foot or a wheel cannot take',
    `tallest single rise ${streetStep.toFixed(3)} across every ramp and flight, against STEP_UP ${STEP_UP}`,
  );
  check(
    gateWrong === 0 && gateCells > 0,
    'and every gate’s cells are cut to the level gateLevel gives the road',
    `${gateCells} gate cells, ${gateWrong} disagreeing`,
  );
  return { sizes };
}

function checkOutskirts(s: number, grid: TownGrid, keep: (col: number, row: number) => boolean, unstable: number, outskirtTowns: number, outskirtCells: number, outskirtOf: number, leastKept: number, onStreet: number, onKept: number, clearings: number): { unstable: number; outskirtTowns: number; outskirtCells: number; outskirtOf: number; leastKept: number; onStreet: number; onKept: number; clearings: number } {
  const seed = `outskirts-${s}`;
  const out = outskirtsOf(grid, seed, keep);
  const again = outskirtsOf(grid, seed, keep);
  if (out.size !== again.size || [...out].some((key) => !again.has(key))) unstable++;
  outskirtTowns++;
  outskirtCells += out.size;
  outskirtOf += grid.cells * grid.cells;
  leastKept = Math.min(leastKept, 1 - out.size / (grid.cells * grid.cells));
  const reached = new Set<number>();
  const queue: [number, number][] = [];
  for (const key of out) {
    const col = Math.floor(key / 1024) - 512;
    const row = (key % 1024) - 512;
    if (Math.max(Math.abs(col - grid.shift), Math.abs(row - grid.shift)) < 1) onStreet++;
    if (keep(col, row)) onKept++;
    if (col === 0 || row === 0 || col === grid.cells - 1 || row === grid.cells - 1) {
      reached.add(key);
      queue.push([col, row]);
    }
  }
  while (queue.length > 0) {
    const [col, row] = queue.pop()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = cellKey(col + dc, row + dr);
      if (!out.has(key) || reached.has(key)) continue;
      reached.add(key);
      queue.push([col + dc, row + dr]);
    }
  }
  clearings += out.size - reached.size;
  return { unstable, outskirtTowns, outskirtCells, outskirtOf, leastKept, onStreet, onKept, clearings };
}

/**
 * And the light at a gate, which the floor and the road share at night.
 *
 * The floor takes the brightest light over each vertex and the ribbon only
 * its gates' (`gateGlow`), so the kerb shows no step only if the gate's
 * light is at the peak across the whole mouth of the street — the most any
 * light gives, which nothing else on the floor can exceed — and gone by
 * `reach`. Held over every gate of every size of square, at the widest band
 * the kit gives a street.
 */
function checkGateLight(sizes: Map<number, TownGrid>): void {
  const peak = poolByte(1, 1);
  let mouths = 0;
  let points = 0;
  let dim = 0;
  let lingering = 0;
  for (const grid of sizes.values()) {
    const band = streetBand(grid, 15);
    for (const gate of gatesOf(grid)) {
      mouths++;
      const glow = gateGlow(grid, gate, band);
      const half = gate.cells.length < 2 ? grid.pitch * 0.5 : band;
      for (let k = -8; k <= 8; k++) {
        points++;
        if (poolAt(1, Math.abs(k / 8) * half, glow.inner, glow.reach) !== peak) dim++;
      }
      if (poolAt(1, glow.reach, glow.inner, glow.reach) !== 0) lingering++;
    }
  }
  check(
    peak > 0 && dim === 0 && lingering === 0,
    'and the light at every gate is at the peak across the whole mouth of its street, and gone at its reach',
    `${points} points across ${mouths} mouths at ${peak} of 255, the most any light gives`,
  );
}
