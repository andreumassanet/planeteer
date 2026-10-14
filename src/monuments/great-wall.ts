import type { Group, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Great Wall of China — the Badaling section.
 *
 * The extreme case of the `MAX_ASPECT` rule: the Wall is 21,196 km long and about
 * 7 m tall. Crop first, then stretch the axis that carries the least recognition:
 * the model is a notched grey ribbon walking over a ridge with towers on it.
 *
 * Three scales:
 * - Along the run, 1 unit = 3.6 m: the frame holds 353 m of wall, three
 *   watchtowers 98 m and 157 m apart (Badaling's own spacing), a climb to a
 *   crest, a saddle and a second rise.
 * - Across and up the wall, 1 unit = 0.84 m, a stretch of 4.3x: 10.5 units from
 *   rock to merlon tops (7 m of wall plus 1.8 m of parapet), 7.2 thick (6 m), the
 *   walkway the real 4.8 m. Unstretched it is 2.4 units tall.
 * - The ridge is at neither scale: about 100 m of climb is drawn at 15.8 units,
 *   enough that the wall visibly climbs, tops out and drops away; more and the
 *   model is a mountain with a thread on it.
 * The towers use the cross-section's scale in both horizontal axes, square, 10 to
 * 11.6 units each way (at the run's scale they would be a fin across the wall).
 *
 * The ridge is geometry because `terrain.ts` flattens a 90-unit pad under every
 * monument (`FLATTEN_RADIUS`): three terraces of rock, all rooted at y = 0,
 * carrying the same crest line at three scales.
 *
 * What must survive at thumbnail size:
 * - The crenellated parapet: merlons 3.3 wide and 2.9 tall, one to a bay (a notch
 *   every 5.4 units, about 12 px). True to scale they are 0.4 wide, noise.
 * - Three towers of different heights (tops 32, 24, 17); the tallest on the crest,
 *   the shortest half down the far flank, so the wall keeps going.
 * - The staircase: the wall is 18 blocks, each on its own step of the rock, as
 *   Badaling's walkway is stepped; a smooth wedge would be a dam.
 *
 * No `realHeight`: the Wall has a length. Left out: brick coursing, loopholes,
 * doorways into towers, and the inner parapet.
 */

// ---------------------------------------------------------------------------
// The crop
// ---------------------------------------------------------------------------

/** Half the modelled run. The wall is cut square at both ends: it continues. */
const HALF_RUN = 49;

/**
 * How far the run swings off the straight line, either way. `sin(pi t)^3` has zero
 * slope at both ends and in the middle, so the run leaves the frame parallel to X
 * and the end blocks stay square to the axis.
 */
const SNAKE = 5;

/** Blocks the run is laid in. One block is one step of the staircase. */
const STATIONS = 18;

/**
 * How much a block overruns its own station: square blocks on a curve leave a wedge
 * open on the outside of every joint, and overlapping closes it. The hill needs
 * more than the wall because it is wider.
 */
const BAY_OVERLAP = 1.12;
const HILL_OVERLAP = 1.25;

// ---------------------------------------------------------------------------
// The cross-section, at 0.84 m per unit
// ---------------------------------------------------------------------------

/** Half the wall's thickness. 7.2 units across is the real 6 m. */
const WALL_HALF = 3.6;
/** Rock to walkway. */
const WALL_BODY = 5.8;
/** Walkway to the floor of a crenel, and the merlons above it. */
const PARAPET_SOLID = 1.8;
const PARAPET_DEPTH = 1.5;
const MERLON_H = 2.9;
const MERLON_W = 3.3;

/**
 * The hillside, as three terraces, widest and lowest first. Each carries the same
 * crest line scaled down by `share`, and each is wider in plan than the one above.
 * Two terraces read as a plinth (one step is a nine-unit vertical face); three
 * steps of about five units, set back about six, are a stepped 40-degree flank.
 * The width is nearly free: 34 across costs about a unit of measured radius more
 * than 30.
 */
const HILL = [
  { half: 17, share: 0.35 },
  { half: 10.4, share: 0.66 },
  { half: 5.8, share: 1 },
];

/**
 * How much narrower the hill gets where it is low: full width at the crest, two
 * thirds at the saddle and the ends. A ridge of constant width is an embankment.
 */
const HILL_TAPER = 0.62;

/**
 * The crest line, as height over the run: out of the frame low, a steep climb past
 * the third tower, the crest with the big tower, a long drop into the saddle, a
 * second rise under the middle tower, and out low again. The anchors at -0.778,
 * -0.222 and 0.667 are the tower centres.
 */
const RIDGE = [
  { t: -1, y: 1.6 },
  { t: -0.889, y: 4.6 },
  { t: -0.778, y: 7.6 },
  { t: -0.611, y: 12.2 },
  { t: -0.389, y: 16 },
  { t: -0.222, y: 17.4 },
  { t: -0.056, y: 13.8 },
  { t: 0.167, y: 7.2 },
  { t: 0.389, y: 9.2 },
  { t: 0.667, y: 12.6 },
  { t: 0.833, y: 8 },
  { t: 1, y: 1.6 },
];

/**
 * A watchtower. `station` is the first of the two stations it stands on, so a tower
 * is exactly two bays wide and the wall it replaces is skipped by index. Towers are
 * two-storey where the ground is worth watching from and one-storey elsewhere.
 */
interface TowerSpec {
  station: number;
  /** Half-width across the flats at the foot of the battered base. */
  half: number;
  /** Height of that base above the rock. */
  base: number;
  /** The upper storey, or `null` for a single-storey tower. */
  chamber: { half: number; height: number } | null;
  parapet: number;
  merlon: number;
  /** Merlons along each of the two long sides. The ends get one each. */
  perSide: number;
}

const TOWERS: TowerSpec[] = [
  // On the crest, and the tallest thing in the frame.
  {
    station: 6,
    half: 5.8,
    base: 7.4,
    chamber: { half: 4.9, height: 3.8 },
    parapet: 1.3,
    merlon: 1.4,
    perSide: 3,
  },
  // On the second rise, one storey.
  { station: 14, half: 5.4, base: 9, chamber: null, parapet: 1.4, merlon: 1.3, perSide: 2 },
  // Half down the far flank, going out of the frame.
  { station: 1, half: 5, base: 8, chamber: null, parapet: 1.3, merlon: 1.2, perSide: 2 },
];

/** The crest's own peak, which is what the hill's plan is swelled against. */
const RIDGE_PEAK = Math.max(...RIDGE.map((point) => point.y));

const pathX = (t: number): number => HALF_RUN * t;
const pathZ = (t: number): number => SNAKE * Math.sin(Math.PI * t) ** 3;

/** Where a station starts, as a parameter along the run. */
const stationT = (index: number): number => -1 + (2 * index) / STATIONS;

/** Height of the rock at a point of the run. Smoothstep, so the crest is round. */
function ridgeAt(t: number): number {
  const first = RIDGE[0]!;
  if (t <= first.t) return first.y;
  for (let i = 1; i < RIDGE.length; i++) {
    const a = RIDGE[i - 1]!;
    const b = RIDGE[i]!;
    if (t <= b.t) {
      const u = (t - a.t) / (b.t - a.t);
      return a.y + (b.y - a.y) * u * u * (3 - 2 * u);
    }
  }
  return RIDGE[RIDGE.length - 1]!.y;
}

/** The rock under a whole span, taken at its lowest so nothing built on it floats. */
function ridgeUnder(from: number, to: number): number {
  let lowest = Infinity;
  for (let i = from; i < to; i++) {
    lowest = Math.min(lowest, ridgeAt((stationT(i) + stationT(i + 1)) / 2));
  }
  return lowest;
}

export const greatWall: Monument = {
  id: 'great-wall',
  name: 'Great Wall of China',
  iso: 'CHN',
  lat: 40.356,
  lon: 116.008,
  tier: 'landmark',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, taper, ringWall } = ctx;
    const stone = palette.bone;
    const tile = palette.slate;
    // Earth below, greyer rock in the band the wall is founded on: two tones over
    // three terraces (the outline draws the steps; a tone per terrace is a layer
    // cake, and the land's green leaves only the outline). Both are mid-to-light:
    // the toon ramp bottoms out at 0.45, so a dark colour over this area reads as
    // a shadow, not a hillside.
    const terrace = [palette.clay, palette.clay, palette.brown];

    const group = new THREE.Group();

    /**
     * A patch of ground standing on the run, turned so local +X goes along the wall
     * and local +Z is the outer (crenellated, front-camera) face.
     */
    const spanFrom = (t0: number, t1: number): { bay: Group; chord: number } => {
      const x0 = pathX(t0);
      const z0 = pathZ(t0);
      const x1 = pathX(t1);
      const z1 = pathZ(t1);
      const bay = new THREE.Group();
      bay.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      bay.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      group.add(bay);
      return { bay, chord: Math.hypot(x1 - x0, z1 - z0) };
    };

    // Two bays each, and the wall inside them is not built: a bay under a tower
    // would push its merlons out through the tower's flanks.
    const covered = new Set<number>();
    for (const tower of TOWERS) covered.add(tower.station).add(tower.station + 1);

    // --- the ridge, and the wall walking up it ---
    for (let i = 0; i < STATIONS; i++) {
      const t0 = stationT(i);
      const t1 = stationT(i + 1);
      const ground = ridgeAt((t0 + t1) / 2);
      const { bay, chord } = spanFrom(t0, t1);

      // Widest and lowest first. Every terrace is rooted at y = 0 rather than
      // stacked on the one below, so none can float off a step.
      const swell = HILL_TAPER + (1 - HILL_TAPER) * (ground / RIDGE_PEAK);
      // Each terrace is `PROUD` shorter at both ends than the one under it.
      HILL.forEach((step, tier) => {
        const depth = step.half * swell * 2;
        const length = chord * HILL_OVERLAP - 2 * PROUD * tier;
        bay.add(box(length, ground * step.share, depth, terrace[tier]!));
      });

      if (covered.has(i)) continue;

      const length = chord * BAY_OVERLAP;

      const body = box(length, WALL_BODY, WALL_HALF * 2, stone);
      body.position.y = ground;
      bay.add(body);

      const parapet = box(length, PARAPET_SOLID, PARAPET_DEPTH, stone);
      parapet.position.set(0, ground + WALL_BODY, WALL_HALF - PARAPET_DEPTH / 2);
      bay.add(parapet);

      // One merlon per bay, centred. Two would halve the notch and the gap, and
      // a 5-pixel gap between two 5-pixel teeth is a grey band.
      const merlon = box(MERLON_W, MERLON_H, PARAPET_DEPTH, stone);
      merlon.position.set(0, ground + WALL_BODY + PARAPET_SOLID, WALL_HALF - PARAPET_DEPTH / 2);
      bay.add(merlon);
    }

    // --- the towers ---
    for (const spec of TOWERS) {
      const { bay } = spanFrom(stationT(spec.station), stationT(spec.station + 2));
      let y = ridgeUnder(spec.station, spec.station + 2);

      // The batter is small and is the difference between a watchtower and a
      // chimney: two converging lines instead of two parallel ones.
      const base = taper(spec.half, spec.half - 0.45, spec.base, stone, 4);
      base.position.y = y;
      bay.add(base);
      y += spec.base;

      // Each storey ends on a ledge that overhangs it. Same trick as the
      // Colosseum's cornices, same reason: the ink needs a step to catch on.
      let half = spec.half - 0.45 + 0.6;
      const ledge = box(half * 2, 0.7, half * 2, tile);
      ledge.position.y = y;
      bay.add(ledge);
      y += 0.7;

      if (spec.chamber) {
        const room = box(spec.chamber.half * 2, spec.chamber.height, spec.chamber.half * 2, stone);
        room.position.y = y;
        bay.add(room);
        y += spec.chamber.height;

        half = spec.chamber.half + 0.5;
        const cornice = box(half * 2, 0.7, half * 2, tile);
        cornice.position.y = y;
        bay.add(cornice);
        y += 0.7;
      }

      // A square parapet with a real hole, in one mesh: `ringWall` radii are corner
      // distances with the corners on the axes, hence the root two and 45 degrees.
      const rail = ringWall((half - 1.1) * Math.SQRT2, half * Math.SQRT2, spec.parapet, stone, 4);
      rail.rotation.y = Math.PI / 4;
      rail.position.y = y;
      bay.add(rail);
      y += spec.parapet;

      const merlonWidth = 2.4;
      const merlonDepth = 1.3;
      for (const side of [1, -1]) {
        for (let k = 0; k < spec.perSide; k++) {
          const slot = (k + 0.5) / spec.perSide - 0.5;
          const merlon = box(merlonWidth, spec.merlon, merlonDepth, stone);
          merlon.position.set(slot * (half * 2 - merlonWidth), y, side * (half - merlonDepth / 2));
          bay.add(merlon);
        }
        const end = box(merlonDepth, spec.merlon, merlonWidth, stone);
        end.position.set(side * (half - merlonDepth / 2), y, 0);
        bay.add(end);
      }
    }

    return group;
  },
};
