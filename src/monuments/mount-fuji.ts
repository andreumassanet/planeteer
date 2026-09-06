import type { Group, Monument } from './contract.ts';

/**
 * Mount Fuji.
 *
 * The only thing that names this mountain is its **outline**, and the outline is
 * three facts:
 *
 * - the flanks are **concave** — they flare out at the foot and stand up as they
 *   rise, so the silhouette bows *inside* the straight line from base to summit.
 *   A straight-sided cone is a slag heap or a party hat. This is the whole reason
 *   Fuji is the most drawn mountain on the planet and the commonest way a model
 *   of it goes wrong;
 * - it is **cut off flat** at the top, not pointed, and the cut is uneven — the
 *   crater rim is a ring of low teeth of which Kengamine, the point that is
 *   actually 3,776 m, is the tallest;
 * - the **snow cap** is a second colour over the top half, and its lower edge is
 *   ragged: the snow runs far down the gullies and the bare ridges stand up
 *   through it. A straight horizontal snow line reads as a birthday cake.
 *
 * Everything in this file serves one of those three. Nothing else is modelled —
 * not the Hoei crater on the south-east flank, which is a real notch in the real
 * profile but at thumbnail size reads only as a dent someone forgot to fix, and
 * the whole brief for this mountain is symmetry.
 *
 * **Why this is a model and not terrain.** `terrain.ts` grows real ranges, and
 * asking it for Fuji is the obvious first thought. Measured, it cannot: the raw
 * relief at 35.361, 138.728 is **2.7 units**, because Fuji stands 0.4 degrees
 * from Suruga Bay and `SHORE_SPAN` holds the coast down. Its named Japanese Alps
 * run 60 km north, and every monument sits on a flat 90-unit pad in any case.
 * That is not a gap to patch — it is the right answer, twice over. Fuji is a
 * stratovolcano standing *alone on a plain*, which is exactly what the site
 * gives; and ridged noise cannot make a symmetrical cone with a crater and a
 * snow line however it is tuned. Everest, at 511 units of relief, is the
 * opposite case and its model should be a marker on a massif. This one has to
 * be the mountain.
 *
 * **Tier: `landmark`, and the height deliberately well under the cap.** See the
 * note on `RIM`.
 *
 * **Vertical exaggeration: about 4.5x, and the flare is what it protects.** Fuji
 * is 3,776 m over a flank about 12 km from the summit to where the cone meets
 * the plain: a real half-profile near 3.9 : 1 wide. The `landmark` tier caps the
 * footprint at 55, so the model is 54.9 out and 63 up to the rim, 0.87 : 1 —
 * the vertical stretched about 4.5x, the same move and the same reason as the
 * Golden Gate's 2.3x. It is the right axis to stretch, because every drawing of
 * Fuji ever made is steeper than the mountain: what carries the recognition is
 * the *curve* of the flank, not its true angle. The curve survives intact — at
 * half height the profile stands at 42% of the base radius where a straight cone
 * would be at 58%.
 *
 * The crater is exaggerated too, and that one is not optional: the real rim is
 * 780 m across against a 24 km base, a ratio of 0.03, which here would be a
 * 1.8-unit dot. It is 18.8 units on a 110-unit base instead, 0.17, because "flat
 * on top" is one of the three things that has to survive being 40 pixels tall,
 * and at true scale it does not survive at all.
 */

/**
 * Facets around the cone.
 *
 * 24 gives a 15-degree facet, which at the base is a 14-unit flat — smooth
 * enough that the silhouette reads as a curve rather than a polygon, coarse
 * enough that the toon ramp still steps from facet to facet around the cone
 * instead of sweeping it. It also divides by the ridges and gullies: 12 of each,
 * every 30 degrees, so every one of them sits on the centre of a facet rather
 * than straddling an edge.
 */
const SIDES = 24;

/**
 * The profile: half-width across the flats at each height, foot to crater rim.
 *
 * Read the slopes and not the radii — they are the shape: 27, 37, 45, 51, 56,
 * 64, 65, 67, 70 degrees from the horizontal, every band steeper than the one
 * below it. That monotone climb *is* the concavity, and it is why this is a
 * table and not a cone. The radii were then chosen so no two adjacent bands
 * differ enough to read as a step, while the top of the mountain is two and a
 * half times as steep as the bottom.
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
 * Where the snow cap starts. Must be one of the `PROFILE` heights.
 *
 * At 31.5 the cap takes the top half of the height and 42% of the width, which
 * is the mountain as it is photographed and printed. It was 41 in the first
 * pass, which put the whole cap on the steep upper cone and made the summit read
 * as a white plug pushed into a grey funnel: the cap has to start low enough
 * that it is still *flaring* where it starts.
 */
const SNOW = 31.5;

/**
 * Height of the crater rim, and the number that decides the tier.
 *
 * `landmark` is right. The tier question is "from how far should a player be
 * able to name it?", and the answer for Fuji is from the sea — it is the
 * landmark of a country and it is visible from 100 km away in life. But the
 * tier's *height* of 120 is wrong for this shape, and the contract only ever
 * says a model may come in under it. At 120 tall inside a 55 footprint the cone
 * would be 0.92 : 1, steeper than Mayon and steeper than anything anyone has
 * ever drawn of Fuji: a spike, which is precisely the failure this file exists
 * to avoid. At 63 to the rim, 67.2 to the tallest tooth, it is 1.63 : 1, still
 * four and a half times steeper than the real mountain but with the flare
 * intact.
 *
 * The width does the work instead, and the width is at the cap: 109.7 units
 * across, the widest a `landmark` may be, 1.6 times the height and 90% of the
 * flat pad `terrain.ts` puts under every monument. The tier's fill check is
 * written for exactly this case — "a wide flat thing passes on its diameter".
 */
const RIM = 63;

/** Crater. `CRATER_INNER` is the hole; the floor sits low inside it so it reads as a hole. */
const CRATER_INNER = 4.6;
const CRATER_OUTER = 9.4; // proud of the body's 9.08, so the ink catches the lip
const CRATER_WALL = 1.8;

/**
 * The snow's lower edge: one tongue per 30 degrees, `[how far it runs below the
 * snow line, how wide it is where it leaves the cap]`.
 *
 * Both numbers, and **they must not correlate**. The first pass made the width a
 * function of the depth, so every tongue was the same tongue at a different size
 * and twelve of them round a cone read as a paper crown. Snow comes down a broad
 * shallow lobe on one bearing and a thin deep streak on the next, so a wide one
 * here is as likely to be short as long.
 *
 * At the snow line a sector is 12 units wide, so a tongue of 6.2 overlaps its
 * neighbours into a continuous collar and one of 4.2 leaves rock showing between
 * them: that mix is the ragged edge. Placed by hand rather than noised — the
 * deep ones sit at 90 and 270 degrees, on the silhouette from the front camera,
 * where one notch is worth three of them hidden round the back.
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

/** How far each ridge pushes up *into* the cap, offset half a sector from the tongues. */
const RIDGES = [10, 5, 14, 7, 11, 4, 13, 6, 9, 5, 16, 8];

/**
 * Teeth around the crater rim: nine places, three of them empty.
 *
 * Eight even ones read as battlements and turned the summit into a castle. A rim
 * is uneven, not crenellated, so the gaps matter as much as the teeth and the
 * tallest one stands alone.
 */
const TEETH = [2.4, 0, 1.0, 0.6, 0, 1.5, 0, 0.5, 1.1];

/**
 * How thick a slab lying on the flank is against its width — 0.15, so a tongue
 * 12 wide is 1.8 thick and stands about a unit proud of the rock.
 *
 * It was 0.24, and from the ground the tongues read as shelves bolted to the
 * mountain: at a low angle you saw their undersides. Thickness is not what makes
 * them read anyway. The ink outline is the same width whatever the slab is, and
 * against grey rock the snow is doing its work in colour.
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
    // Slate rather than a brown or a black. Fuji at any distance is a cool
    // grey-violet — it is what every print of it uses, it holds the most
    // contrast against snow, and it is light enough that the shaded half of the
    // cone does not go to one solid mass at thumbnail size.
    const rock = palette.slate;
    const snow = palette.white;
    const shadow = palette.steel;
    const group = new THREE.Group();

    /**
     * A slab lying along the flank between two heights, standing proud of it.
     *
     * The one piece of geometry here worth explaining. A `taper` stands on +Y;
     * the flank runs up and inward, so the slab is held in a group turned about
     * X until its +Y points up the slope, which leaves its +Z pointing straight
     * out of the slope — the surface normal. Squashing that axis (`SLAB`) is
     * then what turns a square beam into a slab lying flat *on* the mountain
     * rather than a plank nailed to it.
     *
     * `sink` pushes it in. The flank is concave and this is a straight chord
     * across it, so a long slab stands clear of its own middle; sinking it puts
     * the ends inside the rock and leaves the belly showing, which is how a
     * ridge comes out of a slope in the first place.
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

    // --- the ridges, in three runs ---
    // Foot to snow line in one slab would arch three units clear of its own
    // middle. Broken at 24 and again at the snow line, no run is more than 0.2
    // off the surface, and the kinks where they meet read as ridge lines rather
    // than seams. The third run is the one that has to carry: it is the bare
    // rock standing up through the white.
    group.add(around(12, () => flank(4, 24, 5.2, 3.2, rock, 1.2)));
    group.add(around(12, () => flank(24, SNOW, 2.8, 2.2, rock, 0.25)));
    group.add(around(12, (index) => flank(SNOW, SNOW + RIDGES[index]!, 2.2, 1.0, rock, 0.1)));

    // --- the snow's lower edge ---
    // Half a sector round from the ridges, so a rock rib stands between every
    // pair of gullies and both sets still land on facet centres: 24 facets, 12
    // of each.
    const gullies = around(TONGUES.length, (index) => {
      const [depth, half] = TONGUES[index]!;
      // The tops stagger with the depth. Twelve slabs ending at one height draw
      // a hard horizontal line across the cap, which is the very thing the
      // tongues are here to break.
      return flank(SNOW - depth, SNOW + 2 + depth * 0.35, half * 0.32, half, snow, 0.3);
    });
    gullies.rotation.y = Math.PI / 12;
    group.add(gullies);

    // --- the crater ---
    const rim = ringWall(CRATER_INNER, CRATER_OUTER, CRATER_WALL, snow, 12);
    rim.position.y = RIM;
    group.add(rim);

    // The floor, low inside the ring and in the darkest colour here, is the only
    // thing that makes the summit read as a hole rather than as a flat disc.
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
