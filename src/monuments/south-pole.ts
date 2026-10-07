import type { Monument } from './contract.ts';

/**
 * The South Pole.
 *
 * # What this is, and why
 *
 * There is no building here. Every other file in this folder starts from a
 * structure and asks how much of it fits in a tier; this one has to decide what
 * the monument *is* first, because the place offers three candidates and they do
 * not add up to a building between them:
 *
 * - the **Ceremonial South Pole** — a mirrored sphere on a short red-and-white
 *   barber's pole, ringed by the twelve flags of the original Antarctic Treaty
 *   signatories on staffs. Chest-high, and the only image of this place anybody
 *   carries.
 * - the **Geographic South Pole**, a few paces off: a small brass marker on a
 *   plain stake, re-made and re-planted every New Year because the ice sheet
 *   drifts about ten metres a year, with a modest sign beside it. Nobody
 *   photographs it, and it is the actual point.
 * - **flat white ice to the horizon**, in every direction, for two thousand
 *   kilometres.
 *
 * **This model is all three, in that order of prominence**, and the argument for
 * each is different.
 *
 * The **ceremonial ring** is the read. A dozen thin verticals in a circle is a
 * shape that survives being shrunk — it is the same shape Stonehenge is built
 * on, and it is the reason both of those files are in the `monument` tier. Take
 * the ring away and there is nothing here for a thumbnail to be.
 *
 * The **geographic marker** is included because the ceremonial pole is theatre
 * and the marker is the fact. Building only the ring would be building the
 * photograph rather than the place, and the ten-metre-a-year drift — the reason
 * the marker is a stake and not a plinth — is the single most interesting thing
 * about the South Pole as a *location*. It costs three meshes: a stake, a brass
 * disc, and a sign board.
 *
 * The **emptiness** is the one that needed a decision rather than an argument.
 * The tempting answer, and the brief-shaped one, is a bare white plane with a
 * single bright bead on it: honest about the place, and cheap. **It is rejected,
 * for the reason a model is judged at thumbnail size.** At thumbnail size, next to the
 * Colosseum and Christ the Redeemer, a white disc with a dot on it is
 * indistinguishable from a monument whose `build` half-failed, and the registry
 * has no way to tell the two apart. `index.ts` puts it plainly: bare is not
 * chunky, it is what underspending looks like. So the emptiness is kept as a
 * **proportion** instead of as an absence: the snow pad is 28 units across and
 * the flag ring is 20, so **48% of the pad's area lies outside the ring and
 * carries nothing but sastrugi.** That reads as a monument standing in a lot of
 * nothing, which is the true thing, rather than as a monument that is nothing.
 *
 * # Tier: `monument`, and this one is not a compromise
 *
 * The tier question is "from how far should a player be able to name it?" and
 * for the South Pole the honest answer is *from nowhere*. The tallest object on
 * the polar plateau is a four-metre flagstaff; there is no relief, no coast, no
 * skyline. You find it by walking into it — which is the `monument` tier's own
 * definition, and "a stone circle" is the contract's own example of it.
 *
 * There was a real pull towards `building`, and it was a budget argument, not a
 * design one: `monument` allows 40 meshes and 24 of them go on the ring before
 * anything else is built. Going up a tier would have bought 110 meshes by
 * telling a lie about how far away this thing is visible. It is not taken.
 *
 * **The reward for staying is that this is the only monument in the world built
 * at true scale.** At the avatar's rate — 6.8 units for 1.8 m, so 3.78 units per
 * metre — a 4 m flagstaff is 15.1 units and the tier cap is 15. Everything
 * vertical here is life-size to within the ink line: the staffs top out between
 * 13.7 and 14.8 units (3.63 to 3.92 m), the geographic marker at 4.9 (1.30 m),
 * which is hip height, and the ridges at 1.7 to 2.3 units (45 to 61 cm), which
 * is a real sastruga from the large end of a range that runs from 10 cm to about
 * a metre. Nowhere else in this set do the tier and the metre agree, and it is
 * worth protecting: the South Pole is the one entry where the world's scale
 * distortion simply vanishes.
 *
 * # What is distorted, since something always is
 *
 * **The plan, by 1.9x** — the Stonehenge trade, in the same direction and for
 * the same reason. The real ring of flags is roughly 10 m across; at 3.78 units
 * per metre that is 37.8 units, and the tier's footprint caps the whole model at
 * 28. So the ring is squeezed to 20 units (5.3 m) while the heights stay true.
 * What that costs is how much room there is to stand inside the ring; what it
 * protects is that the flags are much taller than they are far apart, which is
 * the proportion the photograph is made of.
 *
 * **The staffs are 3x too thick.** A real flagpole is about 5 cm; at 3.78 units
 * per metre that is 0.19 units, and a 260 px thumbnail works out
 * at 6.4 pixels per unit, so a true pole is 1.2 px wide — thinner than the pen
 * `OutlineEffect` would ink it with, which means the ink decides its width and
 * twelve of them come out as identical hairlines. They are 0.56 units (15 cm)
 * instead, 3.6 px, which is a drawn object rather than an artefact of the pen.
 * This is the stretch's price paid somewhere else, as the `MAX_ASPECT` note
 * asks: squeezing the ring 1.9x brought the staffs closer together, and
 * fattening them is what keeps twelve of them from merging into a fence.
 *
 * **The sphere is 2.3x oversized** — 3.0 units (79 cm) against a real ball of
 * about 35 cm — and the pole under it is 1.5x tall, topping out at 8.4 units
 * (2.22 m) rather than 1.5 m. Both because the sphere is the one object that
 * names this place and at true scale it is a bead: 1.3 units, about nine pixels
 * on a 260 px card, which is a smudge and not a ball. The relationship that
 * matters, that the flags tower over the pole, survives — the ball tops out at
 * 57% of the staff height where in life it is nearer 37% — and the ball's
 * height was chosen by rendering rather than by arithmetic. Lifted a further
 * unit it collides with the band of flags behind it and stops being a separate
 * object; where it sits now there is clear sky between it and them.
 *
 * Aspect: 28.0 wide by 14.8 tall is **1.89 : 1**, and the half-diagonal test is
 * 13.98 / 14.8 = **0.95** against a limit of 2. Nothing here is near the cap;
 * this monument's constraint was never its shape, it was its mesh count.
 *
 * # The flags, and what a flag is allowed to be here
 *
 * This world generates real flags in `src/flags.ts`, and a monument may not
 * import it — the contract permits `ctx` and nothing else, and that rule is why
 * sixty of these files fit together. So the choice was between a few coloured
 * blocks per flag and one.
 *
 * **One.** Each flag is a single box in a single palette colour. Two reasons,
 * and the second is the real one:
 *
 * 1. Meshes. Two blocks per flag is 36 of the tier's 40, which leaves four for
 *    the snow, the pole, the sphere and the marker. There is no version of this
 *    model that survives that.
 * 2. A flag here is 3.5 by 2.4 units, which is about **20 px by 14** in a
 *    thumbnail and a good deal less than that on the planet, where the
 *    whole monument is eight pixels tall at the distance it is built. Twenty by
 *    fourteen is enough for two or three horizontal bands and nowhere near
 *    enough for a saltire, a canton, a crescent, a sun or a maple leaf — so a
 *    subdivided flag would not read as *that nation*, it would read as a
 *    striped rectangle, which is a worse answer than a solid one because it
 *    looks like it was trying. What the ring actually says, and the only thing
 *    it says, is that it is **many-coloured**: this is the one place on Earth
 *    that belongs to everybody. One colour per nation says that as well as
 *    three would, and says it more cleanly.
 *
 * The colour is the one that nation's flag would land on in this 24-entry
 * palette, with one rule laid over the top: **no two neighbours in the ring may
 * take the same entry**, because two identical blocks side by side read as one
 * wide block and the ring loses a flag. That rule is what moves France off blue
 * (its neighbour at the prime meridian has it) and New Zealand onto `slate`,
 * which is the palette's nearest thing to navy — and which happens to be the
 * only reason the Australian and New Zealand flags are told apart here, as they
 * are famously hard to tell apart anywhere else.
 *
 * The flags fly clear of the snow, against the sky, which is what lets Japan
 * keep `white`: a white flag would vanish on a white pad and reads perfectly
 * against `SKY_TOP`.
 *
 * # Facing +Z at the one place where every direction is north
 *
 * This is the only site in the world where `placement.ts`'s orientation has a
 * singularity in it, so it is worth writing down what actually happens rather
 * than guessing.
 *
 * Placement builds its basis by projecting the world's north pole onto the
 * tangent plane and calling that +Z. At lat -89.999 that projection has length
 * cos(89.999 deg) = **1.75e-5**, and `placement.ts` guards the degenerate case
 * at `lengthSq < 1e-8`, i.e. length 1e-4. So **the fallback branch fires here,
 * and it is the only monument in the world that takes it** — the branch needs
 * a latitude past 89.9943 degrees, and the next most polar entry in
 * `scripts/monuments.source.json` is Saint Basil's at 55.8.
 *
 * It does not matter, and that is the point worth recording: the fallback
 * projects world +X instead, and world +X *is* where the main branch was already
 * pointing, to within 1.75e-5 of a unit vector. Both branches land on the same
 * direction, so there is no discontinuity to design around. Where they land is
 * **the prime meridian**: world +X is the point at lat 0, lon 0, so the model's
 * +Z points along the ground down the 0-degree meridian, away from the pole.
 *
 * That turns a degeneracy into the one piece of structure this model has.
 * **At the pole every bearing is a meridian, so the ring of flags is a compass
 * of the world.** Rebuilding that basis and walking 200 units out from the
 * anchor at model bearings of 0, 30, 90, 180 and 270 degrees lands at longitudes
 * of 0.00, 29.96, 89.92, 180.00 and -89.92: the model's bearing *is* the
 * longitude, to a twentieth of a degree. `around` puts index 0 on +Z and steps
 * eastward, so the twelve
 * flags are ordered by the longitude of each signatory's capital, starting at
 * Greenwich: the United Kingdom stands at the front of the ring facing home, and
 * you can walk round it from London to Buenos Aires. They are evenly spaced
 * rather than at their true longitudes — five of the twelve are inside the first
 * 30 degrees east and there is nothing at all across the Pacific, so true
 * spacing would give a huddle and a hole instead of a circle, and the circle is
 * the whole read.
 */

/** Units per metre: the avatar is 6.8 units for 1.8 m. Everything vertical here is measured with it. */
const PER_METRE = 6.8 / 1.8;

// ---------------------------------------------------------------------------
// The snow
// ---------------------------------------------------------------------------

/**
 * The pad. `cream` is `CONTINENT_COLORS.Antarctica`, so on the planet this disc
 * is the same colour as the ice it stands on and the model has no visible edge —
 * the snow simply continues. On a `green` ground it
 * reads as a white field. Both are wanted.
 *
 * `bone` was rendered and rejected, and the trade is worth recording because it
 * is not one-sided: against `bone` the sastrugi and the sphere both read
 * markedly better, since everything white in the model then has 21% of value to
 * separate it from the ground. What it costs is that `bone` reads as concrete
 * rather than as snow — the palette note beside `ctx.palette` warns it has no
 * hue left to lose — and that a grey disc would be a patch on a cream continent.
 * The surface of this monument has to be snow before it has to be legible.
 */
const PAD_RADIUS = 13.86;
const PAD_CROWN = 13.35;
const PAD_HEIGHT = 0.5;
const PAD_SIDES = 24;

/** Top of the pad. Everything else stands on this. */
const SNOW = PAD_HEIGHT;

/**
 * Sastrugi: the low ridges the wind carves into the plateau, and the only
 * texture this place has. All parallel, because wind-carving is what makes them
 * and a scatter of unaligned lumps reads as debris instead.
 *
 * **The bearing is the one decision here that had to be made by rendering it,
 * and the first answer was wrong.** A ridge on a flat pad has nothing but its
 * own shading to show it is a ridge, and on a four-step ramp the first version's
 * visible flank landed in the same band as the pad it sat on: twelve pixels of
 * ink and no form at all, a scratch rather than a ridge. The flank that reads is
 * the one turned *away* from the sun, so the bearing has to satisfy two things
 * at once — the shaded flank facing the camera, and the ridge still lying across
 * the view rather than pointing down it. With this scene's sun at
 * (-0.8, 1.25, 0.75) and the default quarter camera at (0.62, 0.28, 1),
 * that leaves a window about 78 degrees wide, and -0.55 rad sits in the middle
 * of it: the near flank drops from ramp band 3 to band 2 and the ridges run 63
 * degrees across the quarter view and 32 across the front one.
 *
 * Tuning a monument to one camera would be indefensible almost anywhere else.
 * Here the real place gives it away for nothing: at the pole the sun does not
 * rise or set, it circles the horizon at a constant height for six months, so
 * every bearing is the sunlit one twice a day and none of them is the true one.
 */
const RIDGE_YAW = -0.55;
/** How much narrower a ridge is at its crest. Sharp: a sastruga is a knife, not a mound. */
const RIDGE_CREST = 0.22;
/** bearing from +Z, distance from the axis, length, width, height. */
const RIDGES: readonly (readonly [number, number, number, number, number])[] = [
  [0.62, 7.8, 9.5, 2.2, 2.3],
  [1.15, 9.6, 7.5, 1.8, 1.8],
  [3.35, 10.0, 8.0, 2.0, 1.9],
  [4.35, 5.6, 7.5, 1.8, 1.7],
  [5.35, 9.0, 8.5, 2.1, 2.2],
];

// ---------------------------------------------------------------------------
// The ring of flags
// ---------------------------------------------------------------------------

const RING_RADIUS = 10.0;
const STAFF_SIZE = 0.56;
/** 3.64 m, written in metres because it is the one number here that is simply life-size. */
const STAFF_HEIGHT = 3.64 * PER_METRE;
const FLAG_WIDTH = 3.5;
const FLAG_HEIGHT = 2.4;
const FLAG_DEPTH = 0.22;
/** How far below the top of its staff a flag hangs. */
const FLAG_DROP = 0.45;

/**
 * The twelve original signatories of the Antarctic Treaty, 1959, in order of
 * their capitals' longitude going east from Greenwich, with the single palette
 * entry each one is worth at six pixels.
 *
 * The Soviet Union signed it and Russia flies it; either way the flag is red.
 */
type FlagColour = 'crimson' | 'skyBlue' | 'gold' | 'red' | 'green' | 'white' | 'slate';

const FLAGS: readonly (readonly [string, FlagColour])[] = [
  ['United Kingdom', 'crimson'], // 0.1 W. The cross, not the field: its neighbour has the blue.
  ['France', 'skyBlue'], //         2.3 E
  ['Belgium', 'gold'], //           4.4 E. The centre band, and the only gold in the ring.
  ['Norway', 'red'], //            10.7 E. The field the cross is laid on.
  ['South Africa', 'green'], //    28.2 E. The spine of it.
  ['Russia', 'crimson'], //        37.6 E
  ['Japan', 'white'], //          139.7 E. Read against the sky, never against the snow.
  ['Australia', 'skyBlue'], //    149.1 E
  ['New Zealand', 'slate'], //    174.8 E. The palette's nearest navy, and the only thing
  //                                       separating it from the flag before it.
  ['United States', 'crimson'], // 77.0 W
  ['Chile', 'red'], //             70.7 W
  ['Argentina', 'skyBlue'], //     58.4 W. Celeste, and the palette's `skyBlue` is exactly it.
];

// ---------------------------------------------------------------------------
// The ceremonial pole
// ---------------------------------------------------------------------------

const SHAFT_RADIUS = 0.52;
const SHAFT_HEIGHT = 5.0;
const SHAFT_SIDES = 8;
/** Two red bands on a cream shaft: five apparent stripes, which is a barber's pole. */
const BAND_RADIUS = 0.58;
const BAND_HEIGHT = 0.75;
const BAND_FEET = [1.5, 3.3];

/**
 * The sphere, in four lathed slices, because `ctx` has no ball and this is what
 * a ball costs in meshes. It is the only thing in the model that turns through
 * the full range of surface angles, and that is what does the work: on a
 * four-step cel ramp a flat snow pad shows exactly one band, while the sphere
 * steps from its lit cap to its dark underside across all four, which is what
 * reads as polished metal rather than as a white dot. Twelve sides, so the ink
 * draws a circle.
 *
 * **The fourth slice was bought with a sastruga**, and it was worth it. Three
 * slices have to be a cone, a drum and a cone, and the model rendered at 260 px
 * showed a bell on a stick — the step out to the drum's radius put a lip round
 * the equator and the flat cap read as a shade. Four slices climb 0.55, 1.2,
 * 1.5, 1.2, 0.55 with no step anywhere and read as a ball at the first glance.
 * Six sastrugi that read as ridges are worth less than a sphere that reads as a
 * sphere, so there are five.
 */
const BALL_CENTRE = 6.9;
const BALL_RADIUS = 1.5;
const BALL_SIDES = 12;
/** Slice heights, and the bottom and top radius of each. Sums to 2 * BALL_RADIUS. */
const BALL_SLICES = [0.6, 0.9, 0.9, 0.6];
const BALL_RADII = [0.55, 1.2, 1.2, 1.5, 1.5, 1.2, 1.2, 0.55];

// ---------------------------------------------------------------------------
// The geographic pole
// ---------------------------------------------------------------------------

/**
 * Off to one side, and much smaller. In life the two markers stand some tens of
 * metres apart, which at this scale is several times the whole footprint, so the
 * separation is compressed to 5 units — 1.3 m. That is the ordinary crop this
 * contract asks for: a photograph holds both in one frame and the true plan
 * cannot, so the model is the photograph's composition rather than the survey's.
 */
const MARKER_BEARING = -0.3;
const MARKER_RADIUS = 5.0;
const STAKE_SIZE = 0.55;
/** 1.06 m: about hip height, which is what the geographic marker is. */
const STAKE_HEIGHT = 1.06 * PER_METRE;
/** The brass disc that is replaced every New Year, because the ice has moved ten metres under it. */
const DISC_RADIUS = 0.66;
const DISC_HEIGHT = 0.4;
const DISC_SIDES = 10;

/**
 * The sign, and the cheapest cheat in the file: it has no posts. A board and
 * two legs is three meshes and there are not three meshes; a board standing
 * straight in the snow is one, and at the pole anything at ground level is
 * drifted in within a season anyway. It is also the only dark mass down at snow
 * level, which is what stops the bottom half of the model being a blank.
 */
const SIGN_BEARING = -0.8;
const SIGN_RADIUS = 6.6;
const SIGN_WIDTH = 4.6;
const SIGN_HEIGHT = 3.3;
const SIGN_DEPTH = 0.32;
const SIGN_YAW = -0.35;

/**
 * Deterministic jitter in [-1, 1], stepping by the golden angle so no two nearby
 * indices land on the same value. Twelve staffs planted by hand in ice do not
 * come out the same height. `Math.random()` is forbidden — the loader builds
 * twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const southPole: Monument = {
  id: 'south-pole',
  name: 'The South Pole',
  iso: 'ATA',
  lat: -89.999,
  lon: 0.0,
  // No `realHeight`, matching the source list. There is nothing here with a
  // height: the ceremonial pole is chest-high, the marker is a stake, and the
  // number anyone would want is the 2,835 m the ice stands at, which is an
  // elevation and not a monument's height.
  tier: 'monument',
  footprint: 14,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;
    const snow = palette.cream;

    const group = new THREE.Group();

    // --- the plateau ---
    group.add(taper(PAD_RADIUS, PAD_CROWN, PAD_HEIGHT, snow, PAD_SIDES));

    for (const [bearing, distance, length, width, height] of RIDGES) {
      // `taper` only makes regular prisms, so a ridge is a square one drawn to a
      // crest and then stretched along its own z. Scale runs before rotation, so
      // the stretch stays on the ridge's long axis.
      // `white` on the pad's `cream`: sastrugi are glazed hard by the wind and
      // do sit a shade brighter than the softer surface between them. It is a
      // 5% difference and it is not what makes them read — the shaded flank is —
      // but it costs nothing, since `white` is already in the model.
      const ridge = taper(width / 2, (width / 2) * RIDGE_CREST, height, palette.white, 4);
      ridge.scale.z = length / width;
      ridge.position.set(distance * Math.sin(bearing), SNOW, distance * Math.cos(bearing));
      ridge.rotation.y = RIDGE_YAW;
      group.add(ridge);
    }

    // --- the twelve flags, ordered east from the prime meridian ---
    const ring = around(FLAGS.length, (index) => {
      const bay = new THREE.Group();
      const height = STAFF_HEIGHT * (1 + 0.04 * wobble(index, 0));

      const staff = box(STAFF_SIZE, height, STAFF_SIZE, palette.steel);
      staff.position.set(0, SNOW, RING_RADIUS);
      bay.add(staff);

      // All twelve fly the same way round the ring, which is what one wind
      // looks like. The flag hangs off the staff rather than straddling it.
      const flag = box(FLAG_WIDTH, FLAG_HEIGHT, FLAG_DEPTH, palette[FLAGS[index]![1]]);
      flag.position.set(
        (STAFF_SIZE + FLAG_WIDTH) / 2,
        SNOW + height - FLAG_DROP - FLAG_HEIGHT,
        RING_RADIUS,
      );
      flag.rotation.y = 0.09 * wobble(index, 1);
      bay.add(flag);

      return bay;
    });
    group.add(ring);

    // --- the ceremonial pole ---
    const shaft = column(SHAFT_RADIUS, SHAFT_HEIGHT, snow, SHAFT_SIDES);
    shaft.position.y = SNOW;
    group.add(shaft);

    for (const foot of BAND_FEET) {
      // Proud of the shaft, so the ink finds an edge and the stripe is a band
      // rather than a painted line that cel shading would flatten away.
      const band = column(BAND_RADIUS, BAND_HEIGHT, palette.red, SHAFT_SIDES);
      band.position.y = foot;
      group.add(band);
    }

    let ballFoot = BALL_CENTRE - BALL_RADIUS;
    for (let slice = 0; slice < BALL_SLICES.length; slice++) {
      const height = BALL_SLICES[slice]!;
      const piece = taper(
        BALL_RADII[slice * 2]!,
        BALL_RADII[slice * 2 + 1]!,
        height,
        palette.white,
        BALL_SIDES,
      );
      piece.position.y = ballFoot;
      group.add(piece);
      ballFoot += height;
    }

    // --- the geographic pole, a few paces off ---
    const markerX = MARKER_RADIUS * Math.sin(MARKER_BEARING);
    const markerZ = MARKER_RADIUS * Math.cos(MARKER_BEARING);
    const stake = box(STAKE_SIZE, STAKE_HEIGHT, STAKE_SIZE, palette.bark);
    stake.position.set(markerX, SNOW, markerZ);
    group.add(stake);

    const disc = column(DISC_RADIUS, DISC_HEIGHT, palette.gold, DISC_SIDES);
    disc.position.set(markerX, SNOW + STAKE_HEIGHT, markerZ);
    group.add(disc);

    const sign = box(SIGN_WIDTH, SIGN_HEIGHT, SIGN_DEPTH, palette.bark);
    sign.position.set(
      SIGN_RADIUS * Math.sin(SIGN_BEARING),
      SNOW,
      SIGN_RADIUS * Math.cos(SIGN_BEARING),
    );
    sign.rotation.y = SIGN_YAW;
    group.add(sign);

    return group;
  },
};
