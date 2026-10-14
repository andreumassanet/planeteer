import type { Monument } from './contract.ts';

/**
 * The South Pole.
 *
 * There is no building here, so the model has three parts in order of
 * prominence: the ceremonial pole (a mirrored sphere on a red-and-white
 * barber's pole, ringed by the twelve flags of the original Antarctic Treaty
 * signatories), the geographic marker a few paces off (a brass disc on a stake
 * with a small sign), and the flat snow pad with low wind-carved ridges
 * (sastrugi). A dozen thin verticals in a circle is a shape that survives
 * being shrunk; the pad is 28 units across against a 20-unit ring, so nearly
 * half of its area is empty snow.
 *
 * Tier `monument`: nothing here is visible from afar. It is also the one model
 * close to true scale (3.78 units per metre): staffs are 3.6 to 3.9 m, the
 * marker hip height, the ridges 45 to 61 cm.
 *
 * Deliberate distortions:
 * - The flag ring is squeezed 1.9x in plan (20 units instead of about 38) to
 *   fit the tier's footprint; heights stay true.
 * - The staffs are 3x too thick (0.56 units), since a true pole would be
 *   thinner than the outline pen.
 * - The sphere is 2.3x oversized (3.0 units) and its pole 1.5x tall, so it
 *   reads as a ball rather than a bead.
 *
 * A flag is a single box in one palette colour (two boxes per flag would use
 * 36 of the tier's 40 meshes, and a subdivided flag would not read at 20 px
 * anyway). Neighbours never share a colour, so France takes `skyBlue` and New
 * Zealand `slate`. The flags fly against the sky, which lets Japan keep
 * `white`.
 *
 * Orientation: at this latitude placement's north projection is degenerate and
 * its fallback branch points the model's +Z down the prime meridian, so every
 * model bearing is a longitude. `around` starts at +Z and steps east, so the
 * flags run from Greenwich (the United Kingdom, at the front) by the longitude
 * of each signatory's capital, evenly spaced rather than at true longitudes.
 */

/** Units per metre: the avatar is 6.8 units for 1.8 m. Everything vertical here is measured with it. */
const PER_METRE = 6.8 / 1.8;

// --- the snow ---

/**
 * The pad. `cream` is `CONTINENT_COLORS.Antarctica`, so on the planet the disc
 * matches the ice it stands on and has no visible edge.
 */
const PAD_RADIUS = 13.86;
const PAD_CROWN = 13.35;
const PAD_HEIGHT = 0.5;
const PAD_SIDES = 24;

/** Top of the pad. Everything else stands on this. */
const SNOW = PAD_HEIGHT;

/**
 * Sastrugi: the low parallel ridges the wind carves into the plateau.
 *
 * The bearing (-0.55 rad) puts the flank turned away from the sun toward the
 * camera while the ridge still lies across the view, so its shading shows
 * (a window of about 78 degrees for the scene's sun and default camera).
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

// --- the ring of flags ---

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
 * The twelve original signatories of the Antarctic Treaty, in order of their
 * capitals' longitude going east from Greenwich, with the palette entry each
 * flag takes.
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

// --- the ceremonial pole ---

const SHAFT_RADIUS = 0.52;
const SHAFT_HEIGHT = 5.0;
const SHAFT_SIDES = 8;
/** Two red bands on a cream shaft: five apparent stripes, which is a barber's pole. */
const BAND_RADIUS = 0.58;
const BAND_HEIGHT = 0.75;
const BAND_FEET = [1.5, 3.3];

/**
 * The sphere, in four lathed slices of twelve sides. Four slices climb 0.55,
 * 1.2, 1.5, 1.2, 0.55 with no step, and step across all four ramp bands, which
 * reads as polished metal; three would give a bell on a stick.
 */
const BALL_CENTRE = 6.9;
const BALL_RADIUS = 1.5;
const BALL_SIDES = 12;
/** Slice heights, and the bottom and top radius of each. Sums to 2 * BALL_RADIUS. */
const BALL_SLICES = [0.6, 0.9, 0.9, 0.6];
const BALL_RADII = [0.55, 1.2, 1.2, 1.5, 1.5, 1.2, 1.2, 0.55];

// --- the geographic pole ---

/**
 * Off to one side, and much smaller. The real markers stand tens of metres
 * apart; the separation is compressed to 5 units so both fit in one frame.
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
 * The sign has no posts: a board standing straight in the snow costs one mesh
 * instead of three, and is the only dark mass at snow level.
 */
const SIGN_BEARING = -0.8;
const SIGN_RADIUS = 6.6;
const SIGN_WIDTH = 4.6;
const SIGN_HEIGHT = 3.3;
const SIGN_DEPTH = 0.32;
const SIGN_YAW = -0.35;

/**
 * Deterministic jitter in [-1, 1], stepping by the golden angle so nearby
 * indices differ. Never `Math.random()`: the loader builds twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const southPole: Monument = {
  id: 'south-pole',
  name: 'The South Pole',
  iso: 'ATA',
  lat: -89.999,
  lon: 0.0,
  // No `realHeight`: the ceremonial pole is chest-high and the marker a stake.
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
      // crest and stretched along its own z (scale runs before rotation, so the
      // stretch stays on the long axis). `white` sits a shade brighter than the pad.
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

      // All twelve fly the same way round the ring; the flag hangs off the staff.
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
      // Proud of the shaft, so the ink finds an edge and the stripe is a band.
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
