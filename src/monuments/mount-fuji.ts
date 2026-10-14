import type { Group, Monument } from './contract.ts';

/**
 * Mount Fuji.
 *
 * Three facts name the mountain: the flanks are concave (they flare at the foot
 * and stand up as they rise, where a straight cone reads as a slag heap), the
 * top is cut off flat with an uneven ring of low teeth of which Kengamine is the
 * tallest, and the snow cap is a second colour whose lower edge is ragged, with
 * snow in the gullies and bare ridges standing up through it. Nothing else is
 * modelled.
 *
 * It is a model and not terrain: the raw relief at the site is 2.7 units (the
 * coast is held flat nearby), and ridged noise cannot make a symmetrical cone
 * with a crater and a snow line.
 *
 * Tier `landmark`, 63 units to the rim (see `RIM`) across a 110-unit base. That
 * stretches the vertical about 4.5x, the right axis to stretch because the curve
 * of the flank carries the recognition, and the curve survives: at half height
 * the profile stands at 42% of the base radius where a straight cone would be at
 * 58%. The crater is exaggerated too (0.17 of the base against a real 0.03), or
 * "flat on top" would not survive being 40 pixels tall.
 */

/**
 * Facets around the cone. 24 gives a 15-degree facet, smooth enough to read as a
 * curve and coarse enough that the toon ramp steps from facet to facet. It also
 * divides by the 12 ridges and gullies (every 30 degrees), so each sits on the
 * centre of a facet.
 */
const SIDES = 24;

/**
 * The profile: half-width across the flats at each height, foot to crater rim.
 * Read the slopes: 27, 37, 45, 51, 56, 64, 65, 67, 70 degrees, every band
 * steeper than the one below. That climb is the concavity. No two adjacent bands
 * differ enough to read as a step.
 */
const PROFILE = [
  { y: 0, r: 54.4 }, // the skirt: 54.4 across the flats is 54.9 to a corner, inside the 55 footprint
  { y: 3, r: 48.6 },
  { y: 8, r: 42.0 },
  { y: 14.5, r: 35.5 },
  { y: 22.5, r: 29.0 },
  { y: 31.5, r: 23.0 }, // SNOW: a band boundary, so the cap is a change of material and not a decal
  { y: 41, r: 18.4 },
  { y: 49, r: 14.6 },
  { y: 56.5, r: 11.4 },
  { y: 63, r: 9.0 }, // RIM
];

/**
 * Where the snow cap starts. Must be one of the `PROFILE` heights. At 31.5 the
 * cap takes the top half of the height and 42% of the width; it must start low
 * enough to still be flaring where it starts.
 */
const SNOW = 31.5;

/**
 * Height of the crater rim, and the number that decides the tier. At the
 * `landmark` tier's 120 a 55-unit footprint would give a 0.92 : 1 spike, so the
 * model comes in under the height cap: 1.63 : 1 to the tallest tooth (67.2),
 * with the flare intact. The width is at the cap (109.7 units, 90% of the flat
 * pad under every monument).
 */
const RIM = 63;

/** Crater. `CRATER_INNER` is the hole; the floor sits low inside it so it reads as a hole. */
const CRATER_INNER = 4.6;
const CRATER_OUTER = 9.4; // proud of the body's 9.08, so the ink catches the lip
const CRATER_WALL = 1.8;

/**
 * The snow's lower edge: one tongue per 30 degrees, `[how far it runs below the
 * snow line, how wide it is where it leaves the cap]`. Depth and width must not
 * correlate, or every tongue is the same tongue at a different size and the
 * twelve read as a paper crown. At the snow line a sector is 12 units wide, so a
 * tongue of 6.2 overlaps its neighbours and one of 4.2 leaves rock between them.
 * The deep ones sit at 90 and 270 degrees, on the silhouette from the front camera.
 */
const TONGUES: [depth: number, half: number][] = [
  [10, 6.2],
  [4, 5.4],
  [8, 4.4],
  [14, 5.0],
  [5, 6.4],
  [11, 4.6],
  [3, 5.8],
  [9, 6.0],
  [6, 4.2],
  [13, 5.6],
  [7, 4.8],
  [3, 6.2],
];

/** How far each ridge pushes up into the cap, offset half a sector from the tongues. */
const RIDGES = [10, 5, 14, 7, 11, 4, 13, 6, 9, 5, 16, 8];

/**
 * Teeth around the crater rim: nine places, three of them empty. A rim is
 * uneven, not crenellated, and the tallest tooth stands alone.
 */
const TEETH = [2.4, 0, 1.0, 0.6, 0, 1.5, 0, 0.5, 1.1];

/**
 * How thick a slab lying on the flank is against its width: a tongue 12 wide is
 * 1.8 thick and stands about a unit proud of the rock. Thicker slabs show their
 * undersides from the ground.
 */
const SLAB = 0.15;

function radiusAt(y: number): number {
  const first = PROFILE[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return PROFILE[PROFILE.length - 1]!.r;
}

export const mountFuji: Monument = {
  id: 'mount-fuji',
  name: 'Mount Fuji',
  iso: 'JPN',
  lat: 35.361,
  lon: 138.728,
  realHeight: 3776,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, column, taper, ringWall, around } = ctx;
    // Slate: Fuji at any distance is a cool grey-violet, which holds the most
    // contrast against snow and keeps the shaded half from going to one mass.
    const rock = palette.slate;
    const snow = palette.white;
    const shadow = palette.steel;
    const group = new THREE.Group();

    /**
     * A slab lying along the flank between two heights, standing proud of it. A
     * `taper` stands on +Y, so the slab is held in a group turned about X until
     * its +Y points up the slope; its +Z is then the surface normal, and
     * squashing that axis (`SLAB`) makes a slab lying on the mountain. `sink`
     * pushes it in: the flank is concave and the slab a straight chord, so
     * sinking buries the ends and leaves the belly showing.
     */
    const flank = (
      fromY: number,
      toY: number,
      halfBottom: number,
      halfTop: number,
      color: number,
      sink: number,
    ): Group => {
      const bottom = radiusAt(fromY);
      const top = radiusAt(toY);
      const holder = new THREE.Group();
      holder.position.set(0, fromY, bottom - sink);
      holder.rotation.x = Math.atan2(toY - fromY, bottom - top) - Math.PI / 2;

      const slab = new THREE.Group();
      slab.scale.z = SLAB;
      slab.add(taper(halfBottom, halfTop, Math.hypot(toY - fromY, bottom - top), color, 4));
      holder.add(slab);
      return holder;
    };

    // --- the cone ---
    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      const band = taper(a.r, b.r, b.y - a.y, a.y >= SNOW ? snow : rock, SIDES);
      band.position.y = a.y;
      group.add(band);
    }

    // --- the ridges, in three runs: one slab foot to snow line would arch three
    // units clear of its middle. Broken at 24 and at the snow line, no run is more
    // than 0.2 off the surface. The third run is the bare rock through the white. ---
    group.add(around(12, () => flank(4, 24, 5.2, 3.2, rock, 1.2)));
    group.add(around(12, () => flank(24, SNOW, 2.8, 2.2, rock, 0.25)));
    group.add(around(12, (index) => flank(SNOW, SNOW + RIDGES[index]!, 2.2, 1.0, rock, 0.1)));

    // --- the snow's lower edge: half a sector round from the ridges, so both sets land on facet centres ---
    const gullies = around(TONGUES.length, (index) => {
      const [depth, half] = TONGUES[index]!;
      // The tops stagger with the depth; one height would draw a horizontal line across the cap.
      return flank(SNOW - depth, SNOW + 2 + depth * 0.35, half * 0.32, half, snow, 0.3);
    });
    gullies.rotation.y = Math.PI / 12;
    group.add(gullies);

    // --- the crater ---
    const rim = ringWall(CRATER_INNER, CRATER_OUTER, CRATER_WALL, snow, 12);
    rim.position.y = RIM;
    group.add(rim);

    // The floor, low inside the ring and in the darkest colour, makes the summit read as a hole.
    const floor = column(4.4, 0.9, shadow, 12);
    floor.position.y = RIM;
    group.add(floor);

    const teeth = around(TEETH.length, (index) => {
      const height = TEETH[index]!;
      if (height === 0) return null;
      // Tapered, not square: a block on a rim is a merlon, a wedge is a rock.
      const tooth = taper(1.7, 0.9, height, snow, 4);
      tooth.position.set(0, RIM + CRATER_WALL, 7.0);
      return tooth;
    });
    group.add(teeth);

    return group;
  },
};
