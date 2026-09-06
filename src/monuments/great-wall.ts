import type { Group, Monument } from './contract.ts';

/**
 * Great Wall of China — the Badaling section.
 *
 * **The extreme case of the `MAX_ASPECT` rule, and the reason the rule is
 * written the way it is.** The Wall is 21,196 km long and about 7 m tall: an
 * aspect of three million to one. There is no version of "model it whole". So,
 * as the contract says, crop first and then stretch the axis that carries the
 * least recognition — and here that axis is unambiguous. Nobody names the Great
 * Wall from its length. They name it from a notched grey ribbon walking over a
 * ridge with towers on it.
 *
 * **Three scales, deliberately different, and every one of them measured:**
 *
 * - **Along the run, 1 unit = 3.6 m.** The frame holds 353 m of wall, so the
 *   crop is about 1 : 60,000 of the whole. What is in it: three watchtowers,
 *   98 m and 157 m apart, which is Badaling's own tower spacing; a climb to a
 *   crest, a saddle, a second rise. Cut: everything else, which is all of it.
 * - **Across and up the wall, 1 unit = 0.84 m — a stretch of 4.3x.** The wall
 *   stands 10.5 units from the rock to the merlon tops, for a real 7 m of wall
 *   plus 1.8 m of parapet; it is 7.2 units thick, which comes back as the real
 *   6 m, and the walkway between its parapet and its back edge as the real
 *   4.8 m. Without the stretch that wall is 353 m long and 2.4 units tall: a
 *   kerb laid across the frame. The Golden Gate needed 2.3x; a wall needs
 *   nearly twice that, because a bridge at least has towers to be tall with.
 * - **The ridge is at neither scale.** Badaling climbs something like 100 m
 *   across a crop this long. At the wall's own scale that is 119 units, nearly
 *   four frames; even at the run's it is 28. It is drawn at 15.8, a compression
 *   of about 1.8x against the run and 7.5x against the wall — because what the
 *   eye reads is the *shape* of the crest, not its size. Enough relief that the
 *   wall visibly climbs, tops out and drops away, and no more: push it further
 *   and the model is a mountain with a thread on it, which is the failure this
 *   went through twice on the way here.
 *
 * The towers take the cross-section's scale in **both** horizontal axes. At the
 * run's 3.6 m per unit a 12 m tower would be 3.3 units long and 14 wide — a fin
 * standing across the wall. They are drawn square, 10 to 11.6 units each way,
 * which is what a photograph of one looks like.
 *
 * **The ridge is in the model because it cannot be anywhere else.**
 * `terrain.ts` flattens a 90-unit pad under every monument (`FLATTEN_RADIUS`),
 * so the ground this stands on is dead level by construction — the relief that
 * would have carried the wall was removed precisely so that models do not bury
 * one corner and float the other. A level wall between two towers on level
 * ground is a Roman fort. So the hill is geometry: three terraces of rock, all
 * rooted at y = 0, carrying the same crest line at three scales.
 *
 * **What had to survive at thumbnail size**, and what it cost:
 *
 * - **The crenellated parapet.** A smooth wall is a dam. The merlons are drawn
 *   3.3 units wide and 2.9 tall, one to a bay — a notch every 5.4 units, about
 *   12 px on the contact sheet. True to the two scales above they would be 0.4
 *   units wide and stand 1 unit proud, which is not a notch, it is noise. So the
 *   parapet is exaggerated a second time on top of the 4.3x — 4.7 units where
 *   its real 1.8 m earns 2.1 — for exactly the reason the Golden Gate fattens
 *   its cable fivefold: below a few pixels a feature is not simplified, it is
 *   absent.
 * - **Two towers of different heights, and here three.** One tower is a fort.
 *   Two make a wall going somewhere. The third, half down the far flank and the
 *   shortest of them, is what turns "somewhere" into "and it keeps going" — the
 *   same job the Golden Gate's deck stubs do. Tops at 32, 24 and 17 units, and
 *   the tallest stands on the crest, so the ridge and the tower line say the
 *   same thing twice.
 * - **The staircase.** The wall is laid in 18 blocks, each standing on its own
 *   step of the rock rather than following a smooth ramp. That is not a
 *   simplification of the real thing, it *is* the real thing — Badaling's
 *   walkway is stepped the whole way up the slope — and it gives the outline a
 *   line to draw at every joint. A smooth wedge of wall would come out as one
 *   long unbroken edge, which is what a dam looks like.
 *
 * **No `realHeight`.** The source list declines to assert one and so does this
 * file: the Wall has a length. The 7 m above is the Badaling parapet walk, a
 * fact about one section rather than about the monument, and the info card is
 * better off saying nothing than saying that.
 *
 * **Traded away.** No brick coursing, no loopholes, and no doorway where the
 * walkway enters a tower: all of them are under a pixel at the distance this is
 * read from, and each would cost a mesh a bay. The inner parapet went the same
 * way — Badaling has a low kerb along the walkway's inner edge, it was 12 meshes
 * of the budget, and at this camera height nothing of it was visible but a line
 * that the wall's own back edge was already drawing. Those meshes are the hill's
 * third terrace now, and that trade is the difference between a wall on a plinth
 * and a wall on a ridge.
 */

// ---------------------------------------------------------------------------
// The crop
// ---------------------------------------------------------------------------

/** Half the modelled run. The wall is cut square at both ends: it continues. */
const HALF_RUN = 49;

/**
 * How far the run swings off the straight line, either way.
 *
 * `sin(pi t)^3` rather than `sin(pi t)`: the cube has zero slope at both ends
 * and in the middle, so the run leaves the frame parallel to the X axis instead
 * of diving out of it. That keeps the end blocks square to the axis, which is
 * what stops their far corners spending footprint the model has no use for.
 */
const SNAKE = 5;

/** Blocks the run is laid in. One block is one step of the staircase. */
const STATIONS = 18;

/**
 * How much a block overruns its own station. Square blocks on a curve leave a
 * wedge open on the outside of every joint; overlapping closes it. The hill
 * needs more than the wall does because it is wider, and a wider block on the
 * same kink opens a wider wedge.
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
 * The hillside, as three terraces, widest and lowest first. Each carries the
 * same crest line scaled down by `share`, so all three rise and fall together,
 * and each is wider in plan than the one above it.
 *
 * **Two terraces read as a plinth, and it took building it to see why.** With
 * one step the ground goes from the pad to the wall's base in a single vertical
 * face nine units tall, and the eye files that as a podium the wall is standing
 * on rather than as ground the wall is lying along. Three steps of about five
 * units, each set back about six, is a stepped 40-degree flank, and that is a
 * hill. The Colosseum's seating banks are the same trick for the same reason.
 *
 * The width is nearly free: the block that reaches furthest out is the one at
 * the end of the run, and its radius is almost all X, so the foot went from 30
 * units across to 34 for about a unit of measured radius.
 */
const HILL = [
  { half: 17, share: 0.35 },
  { half: 10.4, share: 0.66 },
  { half: 5.8, share: 1 },
];

/**
 * How much narrower the hill gets where it is low.
 *
 * A ridge of constant width is an embankment. Swelling the plan with the height
 * — full width at the crest, two thirds of it at the saddle and the ends — costs
 * nothing, and it is what stops the three terraces reading as a railway
 * cutting. It also hands back footprint at exactly the place the model was
 * spending the most of it, the low blocks at the two ends of the run.
 */
const HILL_TAPER = 0.62;

/**
 * The crest line, as height over the run.
 *
 * Read left to right it is: out of the frame low, a steep climb past the third
 * tower, the crest with the big tower on it, a long drop into the saddle, a
 * second rise under the middle tower, and out of the frame low again. The
 * anchors at -0.778, -0.222 and 0.667 are the tower centres, because a tower
 * standing on a slope wants its own control point or it stands on a guess.
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
 * A watchtower.
 *
 * `station` is the first of the **two** stations it stands on, so a tower is
 * exactly two bays wide and the wall it replaces can be skipped by index rather
 * than by clipping blocks against a footprint. Badaling's towers are two-storey
 * where the ground is worth watching from and one-storey elsewhere, which is
 * also the cheapest way to give three towers three heights.
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
    // Earth below, greyer rock in the band the wall is founded on. Two tones
    // over three terraces, because the steps between them are drawn by the
    // outline and do not need a colour each: a tone per terrace came back as a
    // layer cake, and painting the lowest one the green of the land came back as
    // a row of crates on a lawn — same colour as the ground, so all that
    // survived of it was its own outline.
    //
    // Both are mid-to-light on purpose. The toon ramp bottoms out at 0.45, so a
    // dark colour over an area this size does not read as a hillside in shadow,
    // it reads as a shadow. An earlier pass had the flank in `darkOlive` and the
    // hill came out as a moat.
    const terrace = [palette.clay, palette.clay, palette.brown];

    const group = new THREE.Group();

    /**
     * A patch of ground standing on the run, turned so local +X goes along the
     * wall and local +Z is the outer face — the crenellated one, and the one the
     * contact sheet's front camera looks at.
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

    // Two bays each, and the wall inside them is not built: a tower is wider and
    // taller than the wall everywhere, so a bay left underneath it would push
    // its merlons out through the tower's own flanks.
    const covered = new Set<number>();
    for (const tower of TOWERS) covered.add(tower.station).add(tower.station + 1);

    // --- the ridge, and the wall walking up it ---
    for (let i = 0; i < STATIONS; i++) {
      const t0 = stationT(i);
      const t1 = stationT(i + 1);
      const ground = ridgeAt((t0 + t1) / 2);
      const { bay, chord } = spanFrom(t0, t1);

      // Widest and lowest first. Every terrace is rooted at y = 0 rather than
      // stacked on the one below, so none of them can float off a step, and the
      // one that meets the pad is the one whose height is nearest to nothing.
      const swell = HILL_TAPER + (1 - HILL_TAPER) * (ground / RIDGE_PEAK);
      HILL.forEach((step, tier) => {
        const depth = step.half * swell * 2;
        bay.add(box(chord * HILL_OVERLAP, ground * step.share, depth, terrace[tier]!));
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

      // The batter is small and it is the whole difference between a watchtower
      // and a chimney: the outline draws two converging lines instead of two
      // parallel ones.
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

      // A square parapet with a real hole in it, in one mesh. `ringWall` is a
      // lathe, so its radii are corner distances and its four corners land on
      // the axes — hence the root two and the 45 degrees, which together turn a
      // diamond into a square with a face to the front.
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
