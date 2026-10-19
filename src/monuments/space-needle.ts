import type { Monument } from './contract.ts';

/**
 * Space Needle.
 *
 * Four parts carry it: the saucer (wide, shallow, double-edged, on a sharply
 * flared underside), three curved legs splayed at the ground, pinched to a
 * waist two-fifths of the way up and opening again to meet the saucer (the
 * hourglass), a thin dark core running up between them, and the needle out of
 * the saucer's centre.
 *
 * Tier `tower`: the aspect is 0.32 against a cap of 4 and the saucer is 40% of
 * the footprint cap, so nothing comes out squat. The declared footprint is 11.3
 * (the saucer's vertex reach is 11.216) so `build-monuments.ts` does not push
 * neighbours away from ground it does not stand on.
 *
 * Deliberate distortions, all in the plan and the vertical split:
 * - The saucer is 1.41x wider than life (22.43 across for 69.9 tall), so it
 *   reads from any distance. The legs pay for it with a base circle of 16.4,
 *   giving a stubbier hourglass than the real one (2.8:1 against 3.9:1).
 * - The needle is 1.6x longer than life (12.3 units, 17.6% of the height), since
 *   at life size it would be a one-pixel scratch. The saucer sits lower to make
 *   room: 0.757 of the height instead of 0.86.
 *
 * Colours follow the 1962 scheme: `white` legs, flare and mast (not `bone`,
 * which goes grey in shade against sky), `darkOlive` core (it is seen through
 * the gaps between legs, where a neutral turns into a hole), `red` rims and
 * roof, `bark` for the glazing band and footing pads (`steel` there is almost
 * black), and a `gold` beacon bead.
 *
 * The legs are turned half a step (60/180/300 degrees) so none stands directly
 * in front of the core. The saucer is a stack of five 16-gon prisms with
 * alternating overhangs, which gives the horizontal ink lines of a double-edged
 * disc. Two levels of schematic ties join the legs to the core. The lattice
 * under the saucer, the elevator cars and the restaurant mullions are left out.
 *
 * Budget (`tower`: 70 tall, 1,800 triangles, 80 meshes): 69.9 tall, 956
 * triangles, merged into one mesh a colour.
 */

// --- elevation, in tier units. Every level is absolute above y = 0. ---
const PAD_TOP = 1.5;
/** Where the legs start. Below it a tilted `strut`'s corner would dip out of the pad. */
const LEG_BASE = 2.0;
/** Where the legs tuck under the saucer's flare. */
const LEG_TOP = 48.2;
const CONE_TOP = 52.6;
const DECK_TOP = 53.5;
const GLASS_TOP = 55.0;
const HALO_TOP = 55.9;
const CAP_TOP = 57.6;
const MAST_TOP = 63.0;
const BEACON_TOP = 63.9;
const TIP = 69.9;

// --- plan: half-widths across the flats, as every `ctx` radius is ---
const R_BASE = 8.2;
/** Where the three legs end up, just outside the core. */
const R_WAIST = 2.35;
const R_CORE = 1.3;
const R_CONE_BOTTOM = 3.0;
const R_CONE_TOP = 8.7;
const R_DECK = 10.1;
/** Inset under both rims: the band that makes the disc double-edged. */
const R_GLASS = 9.2;
const R_HALO = 11.0;
const R_CAP = 4.2;

/**
 * Sixteen sides, not twelve: a twelve-gon of apothem 11 has a 3.5% ripple
 * between flat and vertex that shows as a faceted rim; sixteen halves it.
 */
const DISC_SIDES = 16;

const LEGS = 3;

/**
 * How many beams a leg is made of. The model is merged by colour, so a joint
 * between two beams draws no ink line of its own and the count only buys
 * smoothness.
 */
const LEG_SEGMENTS = 12;

/** Where the legs end: on the underside of the saucer's flare, not at its foot. */
const LEG_END = 50.4;
/** Their radius there, on the flare's surface. */
const R_UPPER = 5.8;
/**
 * The waist, as a fraction of the legs' run. The legs close from the pads to
 * here and open again to the saucer: the hourglass is the Space Needle.
 */
const WAIST_T = 0.4;

/** Two levels of tie between each leg and the core, the upper one at the waist. */
const TIE_LEVELS = [10, 21.5];

const LEG_SPAN = LEG_END - LEG_BASE;

const legRadius = (t: number): number =>
  t < WAIST_T
    ? R_WAIST + (R_BASE - R_WAIST) * (1 - t / WAIST_T) ** 1.7
    : R_WAIST + (R_UPPER - R_WAIST) * ((t - WAIST_T) / (1 - WAIST_T)) ** 1.8;
const legHeight = (t: number): number => LEG_BASE + t * LEG_SPAN;
/** Thick at the pads, slim at the waist and the saucer. */
const legThickness = (t: number): number => 1.3 - 0.45 * Math.min(1, t / WAIST_T);

export const spaceNeedle: Monument = {
  id: 'space-needle',
  name: 'Space Needle',
  iso: 'USA',
  lat: 47.62,
  lon: -122.349,
  realHeight: 184,
  tier: 'tower',
  surface: 'metal',
  surfaces: { darkOlive: 'metal', bark: 'none' },
  footprint: 11.3,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;
    const paint = palette.white; // Astronaut White
    const core = palette.darkOlive; // Orbital Olive
    const halo = palette.red; // Re-entry Red
    const glass = palette.bark;
    const beaconLight = palette.gold; // Galaxy Gold
    const footing = palette.bark;

    const group = new THREE.Group();
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- the core: one column, ground to saucer, dark against the pale legs ---
    group.add(column(R_CORE, LEG_TOP, core, 8));

    // --- the tripod ---
    const legs = around(LEGS, () => {
      const leg = new THREE.Group();

      // The pad is radial rather than square with the world: a tripod's footings
      // face the way their leg leans, which is outward.
      const pad = box(3.0, PAD_TOP, 2.2, footing);
      pad.position.z = R_BASE;
      leg.add(pad);

      for (let i = 0; i < LEG_SEGMENTS; i++) {
        const a = i / LEG_SEGMENTS;
        const b = (i + 1) / LEG_SEGMENTS;
        const from = at(0, legHeight(a), legRadius(a));
        const to = at(0, legHeight(b), legRadius(b));
        const thickness = legThickness((a + b) / 2);
        // Butt the beams end to end and every joint shows (a wedge of sky opens at
        // each bend, a step where the section changes). Pushing both ends half a
        // section past their neighbour buries the joint inside the beams.
        const overlap = to.clone().sub(from).setLength(thickness * 0.5);
        leg.add(strut(from.sub(overlap), to.add(overlap), thickness, paint));
      }

      // Ties, starting inside the core so the joint never opens a gap.
      for (const y of TIE_LEVELS) {
        const t = (y - LEG_BASE) / LEG_SPAN;
        leg.add(strut(at(0, y, R_CORE * 0.6), at(0, y, legRadius(t)), 0.42, paint));
      }
      return leg;
    });
    // Half a step, so no leg stands in front of the core.
    legs.rotation.y = Math.PI;
    group.add(legs);

    // --- the saucer, bottom to top ---
    // The flare: 5.7 units of radius gained over 4.4 of height (52 degrees off
    // vertical), sharp enough that the saucer reads as a separate object.
    const flare = taper(R_CONE_BOTTOM, R_CONE_TOP, CONE_TOP - LEG_TOP, paint, DISC_SIDES);
    flare.position.y = LEG_TOP;
    group.add(flare);

    // Edge one: the deck ring, 1.4 proud of the flare below it.
    const deck = column(R_DECK, DECK_TOP - CONE_TOP, halo, DISC_SIDES);
    deck.position.y = CONE_TOP;
    group.add(deck);

    const windows = column(R_GLASS, GLASS_TOP - DECK_TOP, glass, DISC_SIDES);
    windows.position.y = DECK_TOP;
    group.add(windows);

    // Edge two: the halo, the widest thing in the model, 1.8 proud of the glass.
    const brim = column(R_HALO, HALO_TOP - GLASS_TOP, halo, DISC_SIDES);
    brim.position.y = GLASS_TOP;
    group.add(brim);

    const roof = taper(R_HALO, R_CAP, CAP_TOP - HALO_TOP, halo, DISC_SIDES);
    roof.position.y = HALO_TOP;
    group.add(roof);

    // --- the needle ---
    const mast = taper(1.5, 0.95, MAST_TOP - CAP_TOP, paint, 6);
    mast.position.y = CAP_TOP;
    group.add(mast);

    const beacon = column(1.35, BEACON_TOP - MAST_TOP, beaconLight, 6);
    beacon.position.y = MAST_TOP;
    group.add(beacon);

    const needle = taper(0.9, 0.14, TIP - BEACON_TOP, paint, 4);
    needle.position.y = BEACON_TOP;
    group.add(needle);

    return ctx.merge(group);
  },
};
