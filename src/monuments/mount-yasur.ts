import type { Group, Object3D, Monument, MonumentContext } from './contract.ts';

/**
 * Mount Yasur — Tanna, Vanuatu.
 *
 * **Why here:** the same empty third of the planet Nan Madol answers for
 * Micronesia. Melanesia — Papua New Guinea, the Solomons, Vanuatu, Fiji, New
 * Caledonia — had no landmark at all, and Yasur is the one every list of them
 * starts with: the most accessible continuously active volcano on Earth, a cone
 * you can drive to and stand on the rim of while it throws bombs past you.
 *
 * ---------------------------------------------------------------------------
 * It must not look like Fuji and it must not look like Kilimanjaro
 * ---------------------------------------------------------------------------
 *
 * This world already has two volcanoes and both are tall, pale-topped
 * stratovolcanoes. Yasur is the other kind of mountain entirely, and the whole
 * file is spent on the four things that separate them:
 *
 * - **Low and wide.** 12.5 units of cone over a 41-unit base, **0.31** — where
 *   Fuji — itself stretched four and a half times taller than the real
 *   mountain — still stands at 0.58. The silhouette is a broad black trapezoid,
 *   not a peak.
 * - **Cut off across a wide crater.** The rim is 22 units across on a 41-unit
 *   base: **more than half the cone is missing at the top.** Fuji's crater is
 *   0.17 of its base and Yasur's is 0.54, and that single ratio is most of the
 *   difference between the two silhouettes.
 * - **Straight flanks, not concave.** Fuji's file spends its whole argument on
 *   the flare, because a straight-sided cone is a slag heap. A cinder cone *is*
 *   a slag heap: it is loose scoria at its angle of repose, so the three bands
 *   here sit at 48.4, 47.9 and 49.9 degrees and the profile is a ruler.
 * - **The plume.** A column of ash standing out of the crater, which is a shape
 *   this world has never drawn.
 *
 * Colour finishes it. The cone is `bark` and the plain `slate` against a
 * ground the biome measures at #edd6ae — a black cone on pale sand is the
 * highest contrast this site could be given.
 *
 * ---------------------------------------------------------------------------
 * The exaggeration, and the crater that pays for it
 * ---------------------------------------------------------------------------
 *
 * Loose scoria stands at 30 to 35 degrees. Worked at the model's own plan — a
 * base half-width of 20.6 running in to a rim of 10.6 — true repose gives a run
 * of 10.0 and a rise of **6.0**: a cone six units tall and forty-one wide, which
 * at contact-sheet size is a smear with a hole in it. The model stands at **48
 * degrees**, a rise of 11.3, which is a **1.9x vertical exaggeration** — the
 * same factor Sigiriya ships at, and for the same reason: the honest proportion
 * is not the remembered picture.
 *
 * **What the stretch broke:** at 48 degrees a cone this wide would ordinarily
 * come to a point, and a pointed black cone is Fuji in a different colour. The
 * crater is what pays it back. Widening the rim from a true-ish 0.35 of the base
 * to 0.54 takes the top off exactly as much as the flanks were steepened, so the
 * *height* is the remembered one and the *truncation* stays honest. Both numbers
 * are in the paragraph above; neither would survive alone.
 *
 * Proportion: 25.8 half-diagonal on 32.0 of height, **0.81 against the 2.0 cap**
 * — and the height is the plume, not the mountain. Nothing here is near a limit.
 *
 * ---------------------------------------------------------------------------
 * You cannot see into the crater, so nothing is spent on it
 * ---------------------------------------------------------------------------
 *
 * The contact sheet looks from 13.4 degrees and 6.8. Over a near rim at z =
 * 11.1 and y = 14.1, the 6.8-degree sightline is already down to y = 12.8 by the
 * time it reaches the axis — below the crater floor. There is no view into this
 * thing from any camera the sheet owns, and no amount of geometry down there
 * would ever be drawn.
 *
 * So the crater is a `ringWall` and a floor disc, and everything else goes into
 * what *is* on the skyline: the profile, the rim, and the column. Two
 * consequences worth naming:
 *
 * - **The rim's notch is the absence of crags, not a cut in the ring.** Eleven
 *   crags stand on the ring at heights from 1.2 to 3.1 with three left out, and
 *   two of those are at 0 and 33 degrees, which leaves 98 degrees of bare ring
 *   turned to the front. A ring of even blocks is battlements; this is a rim.
 * - **The floor disc is `orange` even though the sheet cannot see it.** It costs
 *   one mesh and 48 triangles, and the sheet is not the only camera in this
 *   world: the plane flies at 23,200 units and looks *down*. A vent that glows
 *   from the air is worth 48 triangles.
 *
 * ---------------------------------------------------------------------------
 * The plume: five lobes, not fifty
 * ---------------------------------------------------------------------------
 *
 * The cloud-top trap is written down elsewhere in this repo and it applies
 * exactly: lumps at one cell wavelength on a shell come out as sharp triangular
 * peaks and read as **snow-capped mountains**. So the plume is a throat, a
 * glowing base, a dark column and **five big lobes** — nothing small, nothing
 * repeated. It leans 0.17 radians toward +X and 0.05 toward +Z, which is what
 * turns a chimney into smoke, and the lean is on a group so every piece travels
 * with it and the determinant stays positive.
 *
 * Its value ladder runs dark → hot → dark → grey → pale, bottom to top: `bark`
 * throat, `orange` incandescence, `steel` column, `slate` billows, `bone` crown.
 * The orange is the only saturated colour in the model and it sits at 14.5 to
 * 18.3 — starting 1.7 above the 12.8 sightline, so all of it clears the near
 * rim. It is the first thing the eye lands on and it is put where the eye can
 * actually reach it.
 *
 * The plume is 18.8 of the model's 32.0 units. That is the right split: a cinder
 * cone is a low thing and what makes Yasur famous is what comes out of it.
 *
 * ---------------------------------------------------------------------------
 * The ash plain, and why this model owns its ground
 * ---------------------------------------------------------------------------
 *
 * The Avenue of the Baobabs laid a `green` verge under itself and it is a
 * bright rectangle cut into Madagascar's gold savanna, invisible on a contact
 * sheet that stands every monument on a green disc. That is the test a ground
 * plate has to pass, and Yasur passes it outright: **the Siwi ash plain is a
 * real surface and it is the reason people know this volcano.** It is a grey
 * desert of ejecta with nothing growing on it, it is what the road crosses, and
 * a black cone rising straight out of tropical Tanna without it would be a lie
 * about the site. It is the same case as Giza's limestone plateau against gold
 * desert, and the same shape as Mont-Saint-Michel's tidal strand: a taper, 50.6
 * across the flats at the bottom and 48.4 at the top over 1.6 of height, so it
 * reads as a bank the cone stands out of rather than as a plate it is mounted on.
 *
 * Most of the plain is under the cone, which is literally true of a cinder cone
 * standing on its own ejecta; what shows is a 3.6-unit annulus plus the sloped
 * lip, and that band is where the bombs, the debris fans and the second vent
 * live. Nothing green grows anywhere in this file, which is the point.
 *
 * ---------------------------------------------------------------------------
 * One repeating feature per surface
 * ---------------------------------------------------------------------------
 *
 * Angel Falls' cliff took seven horizontal strata and five vertical ribs and
 * rendered as brickwork. A cinder cone's texture is **rills** — the gullies ash
 * cuts down the flank — so the flanks get rills and nothing else. There is no
 * horizontal banding of colour and no course line: the three profile bands are
 * all the same `bark` and all at the same angle, so the only joints on the cone
 * are the sixteen radial ribs.
 *
 * They are irregular in the axis that matters. Every rib runs as **one slab**
 * from its own foot to its own head — no two start or finish at the same height
 * — precisely so there is no horizontal line across the cone where a broken run
 * would have joined, which is the second subdivision that would have made it
 * masonry. Nine are `slate` (the pale ash washed down the gully), four are the
 * cone's own `bark` and contribute only an ink line, three are `steel` for fresh
 * spatter. Widths run 1.6 to 3.4 and do not correlate with length.
 */

/**
 * Facets around the cone. 16 gives a 22.5-degree facet, which is 8 units of
 * flat at the base — coarse enough that the cel ramp steps facet to facet and
 * the thing reads as loose rubble rather than as a turned cone. It also divides
 * by the ribs exactly: one rib per facet centre.
 */
const SIDES = 16;

/** Top of the ash plain — the datum everything else is measured from. */
const PLAIN_TOP = 1.6;

/**
 * The cone, as half-width across the flats at each height.
 *
 * Read the slopes, not the radii: 48.4, 47.9, 49.9 degrees. Constant, unlike
 * Fuji's 27-to-70 climb, and that is the difference between a stratovolcano and
 * a heap of scoria at its angle of repose.
 */
const PROFILE = [
  { y: PLAIN_TOP, r: 20.6 },
  { y: 6.9, r: 15.9 },
  { y: 11.0, r: 12.2 },
  { y: 12.9, r: 10.6 },
];

/** The crater rim: the ring's base, and its top. */
const RIM_BASE = 12.9;
const RIM_TOP = 14.1;

/**
 * Crags around the rim, in units above the ring.
 *
 * Zero leaves a gap, and the two gaps at index 0 and 1 are a 65-degree notch
 * facing the camera. Eleven against sixteen facets shares no factor, so no crag
 * sits on the same bearing as a rib.
 */
const CRAGS = [0, 0, 1.5, 3.0, 1.2, 2.3, 0, 2.0, 3.1, 1.4, 2.6];

/**
 * The rills: `[foot, head, half-width, tone]`, one per facet centre.
 *
 * Tone 0 is `slate` — pale ash in the gully, nine of them. Tone 1 is the cone's
 * own `bark`, four, which draw an ink line and no colour change. Tone 2 is
 * `steel`, three, for the freshest spatter. No two feet and no two heads are the
 * same height; see the header for why that matters more than it sounds.
 */
const RIBS: [foot: number, head: number, half: number, tone: number][] = [
  [1.9, 11.9, 3.2, 0],
  [2.6, 9.8, 2.0, 1],
  [1.8, 12.2, 2.6, 0],
  [3.1, 10.6, 3.4, 2],
  [2.0, 11.2, 1.8, 0],
  [2.4, 12.4, 2.8, 1],
  [1.7, 9.4, 2.2, 0],
  [2.9, 11.6, 3.0, 0],
  [2.1, 12.0, 1.6, 2],
  [3.4, 10.2, 2.4, 0],
  [1.9, 11.4, 3.3, 1],
  [2.7, 9.0, 2.0, 0],
  [2.2, 12.3, 2.9, 0],
  [3.0, 10.8, 1.9, 2],
  [1.8, 11.0, 2.5, 0],
  [2.5, 12.1, 3.1, 1],
];

/**
 * How thick a rill is against its width, and how far it stands proud of the
 * flank it lies on.
 *
 * A gully is a groove and nothing here can cut one, so what is modelled is the
 * rib *between* two gullies: it stands out, not in. Fuji found the number the
 * hard way — a slab any thicker shows its underside from the ground and reads as
 * a shelf bolted to the mountain — and thickness is not what makes it read
 * anyway. The ink line is the same width whatever the slab is, and against dark
 * cinder the pale ash is doing its work in colour.
 */
const SLAB = 0.16;
const PROUD = 0.16;

/** Volcanic bombs on the plain: `[bearing in degrees, radius, half-width, height, dark]`. */
const BOMBS: [bearing: number, radius: number, half: number, height: number, dark: boolean][] = [
  [12, 22.4, 1.4, 1.8, false],
  [37, 21.3, 0.9, 1.1, true],
  [64, 23.0, 1.9, 2.4, false],
  [88, 21.8, 1.1, 1.4, true],
  [109, 22.9, 1.6, 2.0, false],
  [131, 21.2, 0.8, 0.9, false],
  [152, 22.6, 2.0, 2.6, true],
  [176, 21.6, 1.2, 1.5, false],
  [198, 22.8, 1.5, 1.9, false],
  [221, 21.4, 1.0, 1.2, true],
  [244, 23.1, 1.8, 2.2, false],
  [268, 21.9, 1.3, 1.6, false],
  [292, 22.5, 0.9, 1.0, true],
  [318, 21.5, 1.7, 2.1, false],
  [341, 23.0, 1.2, 1.4, false],
  [26, 20.9, 2.1, 2.7, true],
  [143, 21.0, 1.9, 2.3, false],
  [259, 20.8, 2.2, 2.8, true],
  [304, 21.1, 1.6, 1.9, false],
];

/**
 * Debris fans spilling off the cone onto the plain: `[bearing, radius, half-width]`.
 *
 * Measured off the built prism rather than assumed: `contract.ts` turns every
 * prism half a segment so a *face* points at +Z, which for a triangle leaves the
 * flat edge at the apothem on +Z and the lone apex at **twice** the apothem on
 * -Z. Set on a spoke that is broad edge outward and point inward — which is what
 * a debris fan is, spreading as it runs downslope. The Citadelle wanted the
 * opposite and had to yaw its prow 60 degrees for it; this wants the prism as it
 * comes.
 */
const FANS: [bearing: number, radius: number, half: number][] = [
  [24, 19.4, 3.0],
  [96, 19.8, 2.4],
  [163, 19.2, 3.4],
  [247, 19.6, 2.8],
  [306, 19.3, 2.2],
  [71, 19.5, 2.6],
  [199, 19.7, 3.1],
];

/**
 * Ash banked into drifts near the plain's outer edge: `[bearing, radius,
 * half-width, height]`.
 *
 * A 16-gon at 260 pixels is a circle, and a circle with a free edge is exactly
 * the coaster a ground plate is not allowed to be. These seven sit just inside
 * the lip on bearings that share no factor with 16, so the plain's own horizon
 * rises and falls instead of running level the whole way round.
 */
const DRIFTS: [bearing: number, radius: number, half: number, height: number][] = [
  [8, 22.2, 2.4, 1.3],
  [59, 22.8, 1.9, 0.9],
  [117, 21.9, 2.8, 1.6],
  [168, 22.6, 2.1, 1.1],
  [214, 22.0, 2.6, 1.4],
  [271, 22.9, 1.8, 0.8],
  [329, 22.3, 2.3, 1.2],
];

const RAD = Math.PI / 180;

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

export const mountYasur: Monument = {
  id: 'mount-yasur',
  name: 'Mount Yasur',
  iso: 'VUT',
  lat: -19.53,
  lon: 169.447,
  realHeight: 361,
  tier: 'building',
  // 25.8 of it is used, by the corner of the ash plain. Tanna's baked ring is
  // 72 x 91 units, so 52 across is already most of the island's width and a
  // wider plain would run into the sea on both coasts.
  footprint: 26,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, column, taper, ringWall, around } = ctx;

    const cinder = palette.bark; // the cone: warm dark, and it keeps a hue in shade
    const ash = palette.slate; // the plain, the rills and the billows
    const fresh = palette.steel; // the darkest scoria, and the ash column
    const ember = palette.orange; // the vent and the base of the plume, and nothing else
    const lit = palette.bone; // the top of the cloud, the only thing up in full sun

    const group = new THREE.Group();

    const put = <T extends Object3D>(child: T, x: number, y: number, z: number): T => {
      child.position.set(x, y, z);
      group.add(child);
      return child;
    };

    /** Puts a child out at `radius` on +Z and `base` up, then swings it to `bearing`. */
    const spoke = (bearing: number, radius: number, base: number, child: Object3D): void => {
      const pivot = new THREE.Group();
      pivot.rotation.y = bearing * RAD;
      child.position.set(0, base, radius);
      pivot.add(child);
      group.add(pivot);
    };

    /**
     * A rib lying along the flank between two heights, standing `PROUD` of it.
     *
     * A `taper` stands on +Y and the flank runs up and inward, so the slab is
     * held in a group turned about X until its +Y points up the slope — which
     * leaves its +Z pointing straight out of the slope, the surface normal.
     * Squashing *that* axis is what turns a beam into something lying on the
     * mountain rather than nailed to it.
     *
     * The scale and the rotation are on **different nodes** on purpose. Three
     * composes `T * R * S`, so a scale and a rotation on one object applies the
     * scale first and puts the numbers on the axes the object had *before* it
     * turned; a group carrying the scale inside a group carrying the rotation
     * composes as `S` then `R`, which is what squashing along a surface normal
     * requires. Both are proper rotations and both scales are positive, so the
     * determinant stays above zero.
     */
    const rib = (foot: number, head: number, half: number, color: number): Group => {
      const bottom = radiusAt(foot);
      const top = radiusAt(head);
      const holder = new THREE.Group();
      holder.position.set(0, foot, bottom + PROUD);
      holder.rotation.x = Math.atan2(head - foot, bottom - top) - Math.PI / 2;

      const slab = new THREE.Group();
      slab.scale.z = SLAB;
      slab.add(taper(half, half * 0.35, Math.hypot(head - foot, bottom - top), color, 4));
      holder.add(slab);
      return holder;
    };

    // -----------------------------------------------------------------------
    // 1. The Siwi ash plain. See the header: this model owns its ground and
    //    this is it. A taper, not a disc — the 1.1 of batter on the lip is
    //    what stops it reading as a plate the cone is mounted on.
    // -----------------------------------------------------------------------
    put(taper(25.3, 24.2, PLAIN_TOP, ash, SIDES), 0, 0, 0);

    // -----------------------------------------------------------------------
    // 2. The cone. Three bands at one angle, all the same colour, because the
    //    only repeating feature this surface is allowed is the rills.
    // -----------------------------------------------------------------------
    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      put(taper(a.r, b.r, b.y - a.y, cinder, SIDES), 0, a.y, 0);
    }

    // -----------------------------------------------------------------------
    // 3. The rills. One slab per facet centre, each running the whole way in
    //    one piece so the cone never develops a horizontal line.
    // -----------------------------------------------------------------------
    const tones = [ash, cinder, fresh];
    group.add(
      around(RIBS.length, (index) => {
        const [foot, head, half, tone] = RIBS[index]!;
        return rib(foot, head, half, tones[tone]!);
      }),
    );

    // -----------------------------------------------------------------------
    // 4. The crater. A ring standing 0.3 proud of the cone's head so the lip
    //    catches its own ink, a floor that glows, and eleven uneven crags with
    //    the notch turned to the front.
    // -----------------------------------------------------------------------
    put(ringWall(6.4, 11.1, RIM_TOP - RIM_BASE, cinder, SIDES), 0, RIM_BASE, 0);
    put(column(6.0, 0.4, ember, 12), 0, RIM_BASE, 0);
    group.add(
      around(CRAGS.length, (index) => {
        const height = CRAGS[index]!;
        if (height === 0) return null;
        // Tapered and five-sided: a block on a rim is a merlon, a wedge is rock.
        const crag = taper(1.6, 0.9, height, cinder, 5);
        crag.position.set(0, RIM_TOP, 8.75);
        return crag;
      }),
    );

    // -----------------------------------------------------------------------
    // 5. The plume. One leaning group, five lobes, and the only orange in the
    //    model. Every piece overlaps the one under it, so the whole column is
    //    joined even though almost none of it is standing on anything — which
    //    is what a plume is, and why `findUnsupported` is an author's tool and
    //    not a rule.
    // -----------------------------------------------------------------------
    const plume = new THREE.Group();
    plume.position.set(0, RIM_BASE + 0.3, 0);
    plume.rotation.set(0.05, 0, -0.17);
    group.add(plume);

    const puff = (child: Object3D, x: number, y: number, z: number): void => {
      child.position.set(x, y, z);
      plume.add(child);
    };

    puff(taper(3.4, 3.0, 1.3, cinder, 7), 0, 0, 0);
    puff(taper(3.0, 3.6, 3.8, ember, 7), 0, 1.3, 0);
    puff(taper(3.6, 4.6, 4.4, fresh, 7), 0, 5.1, 0);
    puff(taper(4.8, 6.0, 4.0, ash, 7), 0.4, 8.8, -0.3);
    puff(taper(6.0, 5.0, 3.6, ash, 7), -0.9, 12.0, 0.7);
    puff(column(4.2, 3.0, ash, 6), 3.6, 12.4, -1.4);
    puff(taper(5.2, 3.2, 3.4, lit, 7), 0.5, 14.2, 0.2);
    puff(column(2.8, 2.4, lit, 6), -2.4, 15.8, 1.0);

    // -----------------------------------------------------------------------
    // 6. What is scattered on the plain. The annulus the cone leaves visible is
    //    3.6 units wide plus the lip, and everything below lives in it: bombs,
    //    black debris fans running out over the grey, and a second vent.
    // -----------------------------------------------------------------------
    for (const [bearing, radius, half, height, dark] of BOMBS) {
      spoke(bearing, radius, PLAIN_TOP, taper(half, half * 0.45, height, dark ? fresh : cinder, 5));
    }
    for (const [bearing, radius, half] of FANS) {
      spoke(bearing, radius, PLAIN_TOP, taper(half, half * 0.86, 0.7, cinder, 3));
    }
    // Drifts of ash banked up near the plain's edge — `ash` on `ash`, so the
    // ink does all the drawing, which is the whole reason this style can afford
    // seven of them for 84 triangles.
    for (const [bearing, radius, half, height] of DRIFTS) {
      spoke(bearing, radius, PLAIN_TOP, taper(half, half * 0.8, height, ash, 3));
    }

    // The second vent, on the front-right where both fixed cameras catch it.
    // Yasur's crater has never had one mouth, and a single cone dead-centre in
    // its own disc is the most symmetrical thing this model could have been.
    spoke(56, 21.0, PLAIN_TOP, taper(3.2, 1.9, 2.4, cinder, 8));
    spoke(56, 21.0, PLAIN_TOP + 2.4, taper(2.0, 2.1, 0.5, fresh, 8));

    return group;
  },
};
