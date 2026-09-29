import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Victoria Falls.
 *
 * **The hardest thing in the list, because the subject is water and water
 * moves.** Everything here is static geometry, flat cel fills and an ink
 * outline. Falling water has no silhouette of its own — it is a texture and a
 * motion, and this toolkit can draw neither. So the first decision is not how to
 * model it but *what the monument is*, and the answer this file commits to is:
 *
 * > **Victoria Falls is a shape of land.** A mile-wide river running dead flat,
 * > then a single straight-edged chasm cut clean across it at right angles, the
 * > water dropping into a slot barely wider than it is deep, and the slot
 * > escaping through one corner. The negative space is the monument. The water
 * > is what makes the negative space visible, not the other way round.
 *
 * That reading is what every element below is spending its budget on, in this
 * order of importance:
 *
 * 1. **The long straight lip.** The falls' whole strangeness is that the drop is
 *    a *line*, not a curve — nothing else on the planet ends like that. It runs
 *    84 of the model's 98 units and is drawn twice over: as a geometric edge
 *    (flat river, then nothing) and as a colour boundary (`skyBlue` river meets
 *    `white` water at exactly that line). Two signals on the same line, because
 *    it is the one thing that cannot be allowed to fail.
 * 2. **The slot.** A gorge 6.8 units nominal — 4.8 to 7.6 as the near rim
 *    wanders — against a 27-unit drop, running *parallel* to the lip rather than
 *    away from it, closed at the west end and open at one corner only. A river
 *    with nowhere to go is why the Boiling Pot boils.
 * 3. **The facing wall**, standing at exactly lip height — see the cutaway note
 *    below, which is the hardest call in the file.
 * 4. **The water**, as five broad vertical sheets divided by four rock islets.
 * 5. **The spray**, and it earns its place for a reason that is structural
 *    rather than decorative — again, see below.
 *
 * ---
 *
 * **The cutaway, and the arithmetic that forces it.**
 *
 * The contact sheet's quarter camera sits 13.4 degrees above the model (`VIEWS`
 * in `sheets/monuments.ts`, framed at `radius * 1.12 / sin(fov/2)`). Put two walls
 * of equal height 6.8 units apart and look between them from 13.4 degrees: the
 * near rim occludes the far wall down to `6.8 / cos(31.8deg) * tan(13.4deg)`
 * below its own top — **1.9 units of 27**. Not "a bit cramped": the lip, the
 * water, the gorge floor and the near wall's own inner face are *all* invisible,
 * from both fixed views, and the thumbnail is a mesa with a stripe on it. Nor
 * can it be fixed by scaling, because the occlusion depends only on the gorge's
 * width-to-depth ratio, and the real ratio is about 1 : 1. A faithful model of
 * this place is a model in which the monument cannot be seen.
 *
 * So the block is **cut**. The land south of the gorge is kept at full lip
 * height at the two ends — the west bluff over Devil's Cataract and Danger Point
 * at the east, both real promontories on the Zimbabwe rim — and between them it
 * is sliced down to a bench an eighth of its height, opening a 68-unit window
 * onto the falls. The wings are where the facing wall proves it stands as high
 * as the lip; the bench is where you get to look. Every rock face in the model is
 * therefore drawn in two horizontal courses, `bark` under `brown`, so that the
 * cut ends read as a *section* through layered basalt rather than as damage —
 * which is honest, because a slice through the Batoka plateau is exactly what
 * this is, and it is how the place is drawn in every geology text.
 *
 * The same reasoning explains the block's outer cliffs, which are not a plinth.
 * A monument's base must sit at `y = 0` and a chasm goes *down*; the only way to
 * model a hole in flat country is to raise the country instead. The gorge floor
 * is the ground, and the plateau is 27 units above it.
 *
 * ---
 *
 * **The spray is in, in two halves, and it nearly wrecked the model.**
 *
 * "Mosi-oa-Tunya", the smoke that thunders, is visible from 50 km, and it is the
 * *only* part of this place visible from outside the gorge — which is precisely
 * the tier question ("from how far should a player be able to name it?"). It is
 * also what carries the front view, where the lip is nearly edge-on: from
 * straight ahead you read a flat-topped escarpment with white standing off it,
 * which is what you actually see driving in from Bulawayo.
 *
 * **And the first version of it destroyed the thing it was advertising.** Six
 * puffs spread evenly along the brink turned out to sit exactly on the one line
 * that matters — the plume is the only element tall enough to occlude the river
 * — and the render came back with the cyan gone and a pale mass of water-plus-
 * cloud that read as a ruined building with a dome. Rendering it without the
 * plume at all was the moment the model became legible. So the plume now obeys:
 *
 * - **Two billows, not a bank.** Over Main Falls and over Rainbow Falls, the two
 *   places the column genuinely stands, and nowhere else. About a quarter of the
 *   brink is covered; three quarters keeps its cyan.
 * - **Lumps, not a dome.** Nine small twelve-sided prisms, overlapping at
 *   different heights, with a `taper` closing each stack. One big rounded mass
 *   is a dome and reads as architecture; a cluster of small ones is a cloud.
 *   That is the whole difference, and it cost nothing but arithmetic.
 * - **Base above 28.2**, clear of the crest shelves at 26.7, so no puff ever
 *   crosses the lip. The stack tops out at 37.6 of the tier's 40 — a *seventh*
 *   of the plume's true relative height (400 m of spray over a 108 m drop). At
 *   true scale this monument would be a cloud on a stick.
 * - **No second colour.** All `white`. A twelve-sided prism steps through two
 *   bands of the ramp unaided, and the obvious second colour is the wrong one:
 *   `bone` is the palette's only neutral and the note on `ctx.palette` measures
 *   it turning away from the sun at 76,68,58. A cloud with dark-brown facets
 *   against a cyan sky is a rock.
 *
 * The other half is at the bottom: the churn where the water lands, five white
 * blocks standing a unit or two proud of the cut bench. Their job is to break a
 * line — the curtain otherwise meets the bench in a dead horizontal, which is
 * the single strongest **"this is a dam"** cue the model has, and a dam is the
 * misread to fear here. Broken, the foot reads as water arriving somewhere
 * rather than as a wall standing on a plinth.
 *
 * **Rejected.** A rainbow — no transparency, and a coloured arc with an ink
 * outline is a decal, not light. The Victoria Falls Bridge — real, iconic and
 * fatal here, because a bridge is a strong enough shape that the model would be
 * named "a bridge". Any attempt at motion, streaks or foam sprites: `validate`
 * forbids `Points` and `Sprite`, and it is right to.
 *
 * ---
 *
 * **Scale: the plan is untouched, the vertical is exaggerated 5.1x.**
 *
 * The falls are 1,708 m of lip against a 108 m drop — **15.8 : 1**, and on the
 * measure that actually counts (`halfDiagonal / height`, which must come in at 2
 * or under) a true-scale Victoria Falls is about 8. The note beside `MAX_ASPECT`
 * says to distort the axis carrying the least recognition and protect the one
 * carrying the most, and here that is not a close call: the width *is* the fact
 * ("the largest sheet of falling water on Earth"), so **nothing is cropped along
 * the lip.** All 1,708 m are in the model, every named cataract in its true
 * proportion, at 1 unit to 20.3 m. Height instead runs at 1 unit to 4 m — 27
 * units for 108 — so the vertical is stretched **5.08x**, in the same way and
 * for the same reason as Mount Fuji's 4.8x.
 *
 * That lands the *land* at `53.88 / 27 = 2.00`, which is the cap to the second
 * decimal — a stretch of 5.0x buys exactly the model that is legal and not one
 * unit more. **The spray is what gives it air**: it takes the height to 37.6 and
 * the ratio to 1.43, which is the second reason the plume is not decoration.
 *
 * **What the stretch broke, and what fixes it.** Five times on the vertical and
 * once on the plan turns the gorge from a slot roughly as wide as it is deep
 * into one four times deeper than wide, and turns the 108 m drop into something
 * that reads, against a 340 m rainforest rim, like a canyon rather than a step.
 * Both of those are *more* like the photographs than the survey is, because a
 * photograph of a waterfall is always taken from a place that exaggerates the
 * drop. What it genuinely costs is the plan: the two gorges now look narrow for
 * their depth, so their widths are the two numbers pushed the other way (below),
 * partly undoing the stretch where it hurt.
 *
 * Two plan dimensions are therefore *not* true, and both are pushed against the
 * vertical stretch rather than with it:
 *
 * - **The gorge is 6.8 units, about 138 m, against a real 60-120 m.** Roughly
 *   1.4x. Below that the two walls' outlines touch and the slot closes up into a
 *   single black line.
 * - **Devil's Cataract is 3.4 units, about 69 m, against a real 30 m.** At true
 *   width it is 1.5 units — three pixels, a scratch. Its lip is genuinely ~38 m
 *   lower than the rest (it is where the river has begun cutting the *next*
 *   falls line); that is halved to 5 units here, because at full depth the notch
 *   stops reading as a lower cataract and starts reading as a chip out of the
 *   lip, and the lip's straightness is item 1 on the list.
 *
 * **Tier: `building`,** by Uluru's arithmetic rather than by modesty. A circular
 * footprint caps any monument at 55 units of radius, so a landform this wide can
 * be at most 110 across — and at `landmark`'s 120 of height it would be a wall,
 * not a plateau. At 37.6 tall it fills 94% of `building` and 99.8% of its
 * footprint, and lands in the same envelope as Uluru (106 x 37) and the Colosseum
 * (104 x 34), which is the right size on the ground for a thing you walk to.
 *
 * ---
 *
 * **Colour: how water reads as water with no transparency and no motion.**
 *
 * By separating the two states of it, which is what the falls do anyway.
 *
 * - **`skyBlue` above the lip.** Flat water reflects sky. This is the only
 *   `skyBlue` in the model, so the eye reads "river" before it reads anything
 *   else, and the plate's south edge draws the lip for free.
 * - **`white` below it.** Aerated water is not blue, it is white — the single
 *   most reliable cue that water is *falling*. The lip is therefore a hard
 *   `skyBlue`/`white` boundary running the width of the model.
 * - **Nothing else on the water, and that is the finding.** A 40-unit sheet of
 *   flat white is a blank, so the first version split every cataract into slabs
 *   and painted the recessed ones `bone` — Uluru's fluting, applied to water.
 *   Rendered, the alternation read as *columns with shadowed recesses between
 *   them*: the falls became a colonnade. The grain the curtain needed was never
 *   a second colour, it was a second **normal**, so each slab is now yawed up to
 *   15 degrees about its own axis instead. That swings the sun's dot product
 *   from 0.30 to 0.55 across the 4-step ramp's 0.5 threshold, so neighbouring
 *   panels land on different bands of the *same* white and the curtain gets its
 *   vertical grain from light rather than from paint. Six colours, no `bone`.
 * - **`bark` under `brown`** for the two basalt courses. Dark below because the
 *   inside of a 27-deep slot is in shadow all day, and because white water needs
 *   the darkest thing in the palette behind it.
 * - **`green` on the promontories, `darkOlive` on the banks.** Not decoration: a
 *   patch of true rainforest survives on the south rim *because the spray waters
 *   it*, in the middle of dry mopane bush. The plume's effect is drawn in colour
 *   as well as in geometry, and the two vegetations tell you which side of the
 *   chasm you are on.
 */

// ---------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------

/** East-west extent. The lip runs almost all of it; see `LIP_W` / `LIP_E`. */
const WEST = -49;
const EAST = 49;

/**
 * North edge of the block, and the deeper lobe of river in the middle of it.
 *
 * This is the one dimension in the model that is fought over unit by unit, and
 * the reason is that **a horizontal plane seen from 13.4 degrees collapses to
 * `depth * sin(13.4deg)` on screen** — the whole Zambezi, however much of it is
 * modelled, is a *line* in the thumbnail, and its job is to be a cyan line
 * lying along the top of a white curtain. So it gets everything the footprint
 * will give.
 *
 * A rectangular block runs out of room at its corners: `hypot(49, 22.4) = 53.9`
 * against the 54-unit circle, and that is `RIVER_N`. But the corners are the
 * only part that is tight, so the middle 60 units step a further 6.6 north to
 * `LOBE_N`, where `hypot(32, 29) = 43.2` has room to spare. It buys 38% more
 * river across the part of the lip that matters, and the step reads as the far
 * bank being a bank rather than a saw cut.
 */
const RIVER_N = -22.4;
const LOBE_N = -29;
const LOBE_W = -32;
const LOBE_E = 28;

/** **The lip.** The north wall of the gorge and the line the whole model serves. */
const LIP_Z = -8;

/** Nominal south wall of the gorge. Individual pieces vary either side of it. */
const RIM_Z = -1.2;

/** South edge of the cut bench, and of the promontories that flank it. */
const BENCH_S = 6;
const SOUTH = 16;

/** Plateau top = lip = the height of the facing wall. 27 units for 108 m. */
const LIP_Y = 27;

/** Where the basalt changes course. Every cut face shows this line. */
const COURSE = 12;

/**
 * Top of the water in the gorge, and the lower course of the cut bench.
 *
 * The bench finishes between 3.3 and 3.9 — an eighth of the wall it replaces,
 * and it was 5.5 until the render said otherwise. A tall bench draws a hard
 * horizontal a fifth of the way up the curtain and turns the whole model into a
 * wall standing on a plinth; dropping it lets the white run most of the way to
 * the ground, and lets the churn blocks show above it.
 */
const FLOOR = 1.4;
const BENCH_Y = 2.2;

/** Top of the rock under the river; the `skyBlue` plate is the 1.8 above it. */
const RIVER_Y = 25.2;

/** Devil's Cataract: its channel and its lip, 5 units down. See the header. */
const DEVIL_ROCK = 20.2;
const DEVIL_Y = 22;

/**
 * How far the upper course steps back from the lower one on the model's *outer*
 * faces — never on a gorge wall, which has to stay sheer. It turns four blank
 * cliffs into a stepped escarpment with an ink line round it, at no extra mesh.
 */
const BATTER = 1.1;

/** The lip's own span. 84 units for 1,708 m: 1 unit to 20.3 m. */
const LIP_W = -46;
const LIP_E = 38;

/**
 * The falls, west to east, in the commonly quoted proportions.
 *
 * `lip` is where this cataract's water leaves the rock. Only Devil's Cataract is
 * far down (see the header); the 0.2-0.4 wobble on the others is what stops
 * eighty-four units of brink reading as a machined edge.
 *
 * `slabs` is how many vertical pieces the sheet is cut into — the streaks. Each
 * is yawed a few degrees about its own axis and overlaps its neighbours, so the
 * seam is both an edge for `OutlineEffect` to ink from brink to floor and a step
 * in the toon ramp. The counts are deliberately low (five across the 40 units of
 * Main Falls): too many and the curtain stops being one falling mass.
 */
const CATARACTS: ReadonlyArray<{ x0: number; x1: number; lip: number; slabs: number }> = [
  { x0: -46.0, x1: -42.6, lip: DEVIL_Y, slabs: 2 }, // Devil's Cataract
  { x0: -38.0, x1: 2.0, lip: 27.0, slabs: 5 }, //     Main Falls
  { x0: 7.6, x1: 11.0, lip: 26.8, slabs: 2 }, //      Horseshoe Falls
  { x0: 12.8, x1: 32.4, lip: 27.0, slabs: 3 }, //     Rainbow Falls
  { x0: 33.8, x1: 38.0, lip: 26.6, slabs: 2 }, //     Eastern Cataract
];

/**
 * The islands that divide them. `rise` is how far the rock stands above the
 * river — they notch the skyline, which is what stops the lip being a ruler, and
 * their downstream spurs stand proud of every sheet. `wooded` is Cataract Island
 * and Livingstone Island, and only those two carry their spur the full height —
 * four dark ribs across a white curtain is a colonnade, two is a divided
 * waterfall. The other two are bare rock and their spurs stop at 58%.
 */
const ISLETS: ReadonlyArray<{ x0: number; x1: number; rise: number; wooded: boolean }> = [
  { x0: -42.6, x1: -38.0, rise: 2.6, wooded: true }, //  Cataract Island
  { x0: 2.0, x1: 7.6, rise: 3.0, wooded: true }, //      Livingstone Island
  { x0: 11.0, x1: 12.8, rise: 1.6, wooded: false },
  { x0: 32.4, x1: 33.8, rise: 1.4, wooded: false },
];

/**
 * **Deleted, and worth a note so it is not reinvented.** There were four rock
 * buttresses here, standing out of the falls' wall and stopping short of the
 * brink so the water poured over them — real, and by the argument on paper the
 * best detail in the file. Rendered, they were fatal. Four dark full-height ribs
 * plus four island spurs plus eighteen inked slab seams turned the curtain into
 * a **colonnade**: the thumbnail read as a ruined portico between two wings, not
 * as water. The whole read hangs on the curtain being one broad pale mass
 * interrupted only where an island genuinely interrupts it, so everything that
 * put a dark vertical stripe on it had to go, and the slab count came down with
 * it. This is the failure this shape is prone to; spend nothing on rock inside
 * the water.
 */

/**
 * The bench: the cut. Four segments with different north edges, so the near rim
 * of the gorge is ragged where the lip opposite it is straight — which is true
 * (one is a fault line, the other is eroded), and is what keeps the two edges
 * from reading as a pair of parallel rules. Those two lines running parallel
 * with white between them are also the only way the *slot* survives the fixed
 * cameras: you cannot see into it, but you can see its width in plan.
 */
const BENCH: ReadonlyArray<{ x0: number; x1: number; z: number; top: number }> = [
  { x0: -42, x1: -24, z: -2.2, top: 3.6 },
  { x0: -24, x1: -8, z: -0.4, top: 3.3 },
  { x0: -8, x1: 8, z: -2.4, top: 3.9 },
  { x0: 8, x1: 26, z: -1.0, top: 3.5 },
];

/**
 * The smoke that thunders, as two billows rather than a bank, each a cluster of
 * small overlapping lumps closed by a `taper` — see the header for why a single
 * rounded mass is a dome and a cluster is a cloud. `base` clears every crest
 * shelf (26.7) so no puff ever crosses the lip. `r` is the half-width
 * across the flats of a twelve-sided prism, so a puff reaches about 3% further
 * at its corners than the number says.
 */
interface Puff {
  x: number;
  z: number;
  r: number;
  base: number;
  h: number;
  /** Closes a stack with a `taper` instead of a `column`, so it does not end flat. */
  cap: boolean;
}

const PLUME: ReadonlyArray<Puff> = [
  { x: -25, z: -3.4, r: 3.6, base: 28.2, h: 3.4, cap: false }, // the billow over Main Falls
  { x: -19, z: -2.4, r: 4.2, base: 28.4, h: 4.0, cap: false },
  { x: -14, z: -3.6, r: 3.0, base: 28.3, h: 3.0, cap: false },
  { x: -23, z: -2.6, r: 3.8, base: 31.2, h: 3.6, cap: false },
  { x: -17, z: -3.2, r: 3.2, base: 31.8, h: 3.2, cap: false },
  { x: -21, z: -2.8, r: 2.8, base: 34.4, h: 3.2, cap: true },
  { x: 18, z: -3.0, r: 2.8, base: 28.4, h: 2.8, cap: false }, //  the lesser one over Rainbow
  { x: 23, z: -2.2, r: 3.2, base: 28.4, h: 3.2, cap: false },
  { x: 20, z: -2.6, r: 2.6, base: 31.0, h: 2.8, cap: true },
];

/** Rocks in the river above the falls, and bush on the ground below the bench. */
const RIVER_ROCKS: ReadonlyArray<{ x: number; z: number; w: number; d: number; h: number }> = [
  { x: -28, z: -13.5, w: 3.6, d: 3.0, h: 1.3 },
  { x: -6.5, z: -16.0, w: 3.0, d: 2.8, h: 1.1 },
  { x: 17.5, z: -12.5, w: 3.2, d: 3.2, h: 1.5 },
];

const BUSH: ReadonlyArray<{ x: number; z: number; w: number; d: number; h: number }> = [
  { x: -36, z: 9.5, w: 7.0, d: 5.0, h: 2.6 },
  { x: -20, z: 12.0, w: 5.0, d: 4.0, h: 3.0 },
  { x: -4, z: 8.5, w: 8.0, d: 5.5, h: 2.2 },
  { x: 12, z: 11.0, w: 6.0, d: 4.5, h: 2.8 },
  { x: 21, z: 13.5, w: 5.0, d: 4.0, h: 2.4 },
];

/**
 * Deterministic pseudo-noise in about [-1, 1], the same three-incommensurate-
 * sines trick Uluru uses and for the same reason: the slab widths must vary or
 * the curtain is a comb, and `Math.random` is forbidden — the loader builds
 * twice and compares.
 */
function grain(i: number, seed: number): number {
  return (
    Math.sin(i * 1.7 + seed) * 0.55 +
    Math.sin(i * 0.61 + seed * 2.3) * 0.3 +
    Math.sin(i * 3.13 + seed * 0.7) * 0.15
  );
}

export const victoriaFalls: Monument = {
  id: 'victoria-falls',
  name: 'Victoria Falls',
  iso: 'ZWE',
  lat: -17.925,
  lon: 25.858,
  // No `realHeight`. The source list asserts none, and the falls have no single
  // one to assert: 108 m at Rainbow Falls, 70 at Devil's Cataract, and the
  // number people quote is the width anyway.
  tier: 'building',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const rockLow = palette.bark; //     the shadowed lower course, and the islet spurs
    const rockHigh = palette.brown; //   the sunlit upper course and the cut bench
    const river = palette.skyBlue; //    flat water, above the lip only
    const foam = palette.white; //       aerated water: the sheets, the crests, the plume
    const forest = palette.green; //     the spray-fed rainforest on the south rim
    const bush = palette.darkOlive; //   dry mopane everywhere else

    const group = new THREE.Group();

    /**
     * Every rectangular mass in the file, given as the box it occupies rather
     * than as a size and a position. Almost nothing here is centred on anything,
     * so bounds are the honest way to write it and the only way the numbers in
     * the tables above stay legible as a map.
     */
    const slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      y0: number,
      y1: number,
      color: number,
    ) => {
      const mesh = box(x1 - x0, y1 - y0, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    // --- the north block: the river, the lip, and the wall the falls hang on ---
    // One lower course across the whole width, and an upper course stepped back
    // by `BATTER` at the two ends. Neither the north face nor `LIP_Z` is
    // battered: the north edge gets its step from the lobe instead, and the
    // falls' wall is the one face that must stay sheer top to bottom.
    slab(WEST, EAST, RIVER_N, LIP_Z, 0, COURSE, rockLow);

    // West bank: the plateau closing the gorge's blind end.
    slab(WEST + BATTER, LIP_W, RIVER_N, LIP_Z, COURSE, LIP_Y - 1.0, rockHigh);
    slab(WEST + BATTER, LIP_W, RIVER_N, LIP_Z, LIP_Y - 1.0, LIP_Y + 0.6, bush);
    // Devil's Cataract's channel, cut 5 units into the plateau.
    slab(LIP_W, -42.6, RIVER_N, LIP_Z, COURSE, DEVIL_ROCK, rockHigh);
    slab(LIP_W, -42.6, RIVER_N, LIP_Z, DEVIL_ROCK, DEVIL_Y, river);
    // The Zambezi.
    slab(-42.6, LIP_E, RIVER_N, LIP_Z, COURSE, RIVER_Y, rockHigh);
    slab(-42.6, LIP_E, RIVER_N, LIP_Z, RIVER_Y, LIP_Y, river);
    // East bank, above the Boiling Pot.
    slab(LIP_E, EAST - BATTER, RIVER_N, LIP_Z, COURSE, LIP_Y - 1.0, rockHigh);
    slab(LIP_E, EAST - BATTER, RIVER_N, LIP_Z, LIP_Y - 1.0, LIP_Y + 0.6, bush);
    // The lobe: the same three layers again, stepped north. See `LOBE_N`.
    slab(LOBE_W, LOBE_E, LOBE_N, RIVER_N, 0, COURSE, rockLow);
    slab(LOBE_W, LOBE_E, LOBE_N, RIVER_N, COURSE, RIVER_Y, rockHigh);
    slab(LOBE_W, LOBE_E, LOBE_N, RIVER_N, RIVER_Y, LIP_Y, river);

    for (const rock of RIVER_ROCKS) {
      slab(
        rock.x - rock.w / 2,
        rock.x + rock.w / 2,
        rock.z - rock.d / 2,
        rock.z + rock.d / 2,
        RIVER_Y,
        LIP_Y + rock.h,
        rockHigh,
      );
    }

    // --- the two gorges ---
    // The first runs the length of the lip and is closed at both ends; the
    // second leaves it at the east corner at right angles and runs off the
    // model, which is the first bend of the zigzag and the only way out.
    slab(LIP_W, 42, LIP_Z, RIM_Z, 0, FLOOR, foam);
    slab(36, 42, RIM_Z, SOUTH - BATTER, 0, FLOOR, foam);

    // --- the west end: the blind end of the trough, and the bluff above it ---
    slab(WEST, LIP_W, LIP_Z, RIM_Z, 0, COURSE, rockLow);
    slab(WEST + BATTER, LIP_W, LIP_Z, RIM_Z, COURSE, LIP_Y, rockHigh);
    slab(WEST, -42, -2.4, SOUTH, 0, COURSE, rockLow);
    slab(WEST + BATTER, -42, -2.4, 9, COURSE, LIP_Y, rockHigh);
    slab(WEST + BATTER, -42, -2.4, 9, LIP_Y, LIP_Y + 1.2, forest);
    // A shoulder falling away from the rim, so the promontory is a landform and
    // not a box with a lawn on it.
    slab(WEST + BATTER, -42, 9, SOUTH - BATTER, COURSE, 19, rockHigh);
    slab(WEST + BATTER, -42, 9, SOUTH - BATTER, 19, 20.2, bush);

    // --- the bench: the cut ---
    for (const seg of BENCH) {
      slab(seg.x0, seg.x1, seg.z, BENCH_S, 0, BENCH_Y, rockLow);
      slab(seg.x0, seg.x1, seg.z, BENCH_S, BENCH_Y, seg.top, rockHigh);
    }

    // --- Danger Point: the promontory between the two gorges ---
    slab(26, 36, -3.2, SOUTH, 0, COURSE, rockLow);
    slab(26, 36, -3.2, 8.5, COURSE, LIP_Y, rockHigh);
    slab(26, 36, -3.2, 8.5, LIP_Y, LIP_Y + 1.2, forest);
    slab(26, 36, 8.5, SOUTH - BATTER, COURSE, 20, rockHigh);
    slab(26, 36, 8.5, SOUTH - BATTER, 20, 21.2, bush);

    // --- the land beyond the second gorge, closing the trough's east end ---
    slab(42, EAST, LIP_Z, SOUTH, 0, COURSE, rockLow);
    // Full height where it dams the trough's east end, then falling away south of
    // the bend: the block is a corner of country, not a bookend.
    slab(42, EAST - BATTER, LIP_Z, RIM_Z, COURSE, LIP_Y - 1.0, rockHigh);
    slab(42, EAST - BATTER, LIP_Z, RIM_Z, LIP_Y - 1.0, LIP_Y + 0.6, bush);
    slab(42, EAST - BATTER, RIM_Z, SOUTH - BATTER, COURSE, 22, rockHigh);
    slab(42, EAST - BATTER, RIM_Z, SOUTH - BATTER, 22, 23.4, bush);

    // --- the water ---
    for (const [index, fall] of CATARACTS.entries()) {
      // The crest: a shelf of white breaking over the brink and overhanging the
      // curtain, which is what draws the lip as a *line* rather than as the top
      // edge of a wall. Its top sits 0.3 **below** the river rather than proud of
      // it, and that 0.3 is load-bearing: anything standing above the water here
      // occludes `height / tan(13.4deg)` of river behind it, so half a unit of
      // proud roll would cost 2.3 units of the 14 to 21 that exist. The lip is
      // worth more as a colour boundary than as a bump. It projects 3.4 into the
      // gorge against the sheets' 2.0, so it is a real cornice: the top face
      // catches the sun square and reads a band brighter than the curtain
      // hanging under it, which is the water going over the edge.
      //
      // It runs `PROUD` into the rock at either end: cut to the fall's own
      // width, its ends lay in the planes of the channel walls beside it, and
      // flush faces of two colours flicker.
      slab(fall.x0 - PROUD, fall.x1 + PROUD, LIP_Z - 0.6, LIP_Z + 3.4, fall.lip - 2.0, fall.lip - 0.3, foam);

      // The sheet, cut into overlapping slabs of alternating depth and yawed a
      // few degrees each. Widths are drifted off the even division so the
      // streaks are not a picket fence, and the yaw is what gives the curtain
      // its grain — see the colour note in the header.
      const span = fall.x1 - fall.x0;
      const edges: number[] = [fall.x0];
      for (let j = 1; j < fall.slabs; j++) {
        const even = fall.x0 + (span * j) / fall.slabs;
        edges.push(even + grain(index * 7 + j, 2.6) * (span / fall.slabs) * 0.5);
      }
      edges.push(fall.x1);

      for (let j = 0; j < fall.slabs; j++) {
        const wobble = grain(index * 5 + j, 8.2);
        const sheet = slab(
          // Half a unit of overlap each side: yawing a slab opens a hairline at
          // its edges, and a hairline here shows the black wall behind.
          edges[j]! - 0.5,
          edges[j + 1]! + 0.5,
          LIP_Z,
          LIP_Z + 1.5 + (j % 2) * 0.5,
          0.9,
          // `PROUD` under the lip: at the lip itself the yawed top lay in the
          // plane of the river's surface and of the spurs' tops beside it.
          fall.lip - PROUD,
          foam,
        );
        sheet.rotation.y = wobble * 0.26;
      }
    }

    // The churn where the water lands: five blocks standing 1 to 2 units proud
    // of the cut bench in front of them. Most of the depth is hidden — the water
    // goes into the slot and does not come out — but the tops break the dead
    // horizontal the curtain would otherwise meet the bench in, which is the
    // model's strongest "dam" cue. Blocks, not the twelve-sided lumps that were
    // here first: at this size a cel-shaded cylinder reads as a block anyway,
    // and a row of them read as masonry stacked against a wall.
    slab(-38, -18, LIP_Z + 1.4, -2.6, 0, 6.0, foam);
    slab(-18, 2, LIP_Z + 1.4, -2.2, 0, 5.2, foam);
    slab(12.8, 23, LIP_Z + 1.4, -2.6, 0, 5.6, foam);
    slab(23, 32.4, LIP_Z + 1.4, -2.2, 0, 4.6, foam);
    slab(-46, -42.6, LIP_Z + 1.4, -3.2, 0, 4.4, foam);

    // --- the islands, and the spurs they trail into the gorge ---
    for (const islet of ISLETS) {
      // The spur stands proud of every sheet, so the ink separates one cataract
      // from the next all the way down instead of only at the brink. Only the
      // two real islands get a full-height one: four dark ribs across a white
      // curtain is a colonnade, two is a divided waterfall.
      const spur = islet.wooded ? LIP_Y : LIP_Y * 0.58;
      slab(islet.x0, islet.x1, LIP_Z, LIP_Z + 2.7, 0, spur, rockLow);
      // The island itself, standing out of the river and notching the skyline.
      const top = LIP_Y + islet.rise;
      const [a, b] = [islet.x0 - 0.3, islet.x1 + 0.3];
      slab(a, b, LIP_Z - 6.5, LIP_Z + 0.6, RIVER_Y - 1.4, top, rockLow);
      if (islet.wooded) {
        slab(a, b, LIP_Z - 6.5, LIP_Z + 0.6, top, top + 1.3, forest);
      }
    }

    // --- the spray ---
    for (const puff of PLUME) {
      const cloud = puff.cap
        ? taper(puff.r, puff.r * 0.5, puff.h, foam, 12)
        : column(puff.r, puff.h, foam, 12);
      cloud.position.set(puff.x, puff.base, puff.z);
      group.add(cloud);
    }

    // --- bush on the flat below the cut, which is what gives the cliff a scale ---
    for (const clump of BUSH) {
      slab(
        clump.x - clump.w / 2,
        clump.x + clump.w / 2,
        clump.z - clump.d / 2,
        clump.z + clump.d / 2,
        0,
        clump.h,
        clump.x > 0 ? forest : bush,
      );
    }

    return group;
  },
};
