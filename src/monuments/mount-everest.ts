import type { Group, Monument, Vector3 } from './contract.ts';

/**
 * Mount Everest.
 *
 * **This model is not the mountain. `terrain.ts` already built the mountain.**
 *
 * That sentence is the whole design, and it is the opposite of the one next
 * door. Fuji's file records that the relief at its own site is **2.7 units**,
 * because Fuji stands 0.4 degrees from Suruga Bay and `SHORE_SPAN` holds the
 * coast flat, so Fuji's model had to *be* the volcano. Measured the same way,
 * this site reads:
 *
 * - **raw relief 511.4 units** of the 680 `MAX_RELIEF` allows — the Himalaya
 *   entry in `RANGES` declares a peak of 620 across a 3-degree half-width and
 *   the ridged noise reaches 511 here. On a 0.5-degree sweep of every land
 *   sample on the planet, **0.07% stands higher.** This is the roof.
 * - **the south wall is already there.** Southward the ground falls
 *   511 -> 473 -> 430 -> 409 -> 286 -> 170 -> 75 -> 23 over 838 units: 488
 *   units of drop, 30 degrees averaged and 39 degrees across its steepest
 *   stretch. That is the Himalayan front, and no monument put it there.
 * - **eastward the range holds** — 545, 502, 483, 522, 545, 540 out to 2,000
 *   units — so the massif runs away along its own crest instead of ending.
 * - **the pad is a summit plateau.** `placement.ts` flattens `FLATTEN_RADIUS`
 *   90 units of ground to 507.8 and blends back to the massif by 240, so the
 *   model stands on a level disc 180 units across with the mountain falling
 *   away past its rim. From the middle of it, the nearest ground higher than
 *   your own eyes rises **1.5 degrees** above the horizon.
 *
 * So the terrain gives a 511-unit mountain with a summit plateau on top of it,
 * and what it cannot give is the reason anyone has heard of this one. Ridged
 * noise has no summit pyramid, no snowline, no yellow band of limestone, no
 * cornice, no plume, and nobody has ever stood on it. **The model is therefore
 * the summit pyramid and nothing below it** — the last 84 units of a 595-unit
 * mountain, cropped exactly where the pad crops it.
 *
 * **The crop is very nearly honest, and that is the terrain's doing.** 511
 * units of relief plus 84 of model is 595 units for an Everest that is 8,750 m
 * above the Gangetic plain, i.e. **0.068 units per metre**. At that rate the
 * real summit pyramid — 943 m from the South Col to the top — is 64 units, and
 * this model is 84: **1.3x vertical exaggeration**. The 110-unit width is
 * 1,618 m, against a real pyramid roughly 1.5-2 km across the South Col-North
 * Col line: **true scale in plan, to the width of the ink line.** Fuji's file
 * had to declare 4.5x and defend it. This one does not, and the difference is
 * not virtue — it is that Fuji's site was a plain and this one is a mountain.
 *
 * **Tier: `landmark`, taken for its footprint and not for its height.** The
 * tier question is "from how far should a player be able to name it?" and for
 * Everest the honest answer is "from the whole Himalaya" — but the terrain
 * answers most of that, in 511 units, before this file runs. What the model
 * actually needs from the tier is the **55-unit footprint**: the crop is 1,618
 * m of summit pyramid and `tower`'s 28 would halve the plan and leave a needle
 * where a horn belongs, which is the trade the contract already refuses for the
 * Arc de Triomphe. Height comes in at 84 of the 120 cap, 70%, for the same
 * reason the number 84 exists at all: the terrain fixed the scale and 84 is
 * what the crop is worth at it. A 120-unit cone here would be a 6,000-metre
 * spike planted on a mountain range.
 *
 * Aspect is 109.7 wide to 84 tall, **1.31 : 1**, well inside `MAX_ASPECT`.
 * Nothing is squeezed or stretched sideways; the only crop is the vertical one,
 * and the site made it.
 *
 * ---
 *
 * **What names Everest rather than any mountain**, in the order it survives
 * being shrunk:
 *
 * 1. **It is a horn, not a cone.** Three ridges, three faces, and a plan that
 *    is a triangle rather than a circle. Fuji is a stratovolcano and is
 *    therefore mirror-symmetric from every bearing; Everest is a block of
 *    seabed limestone shoved up and then carved from three sides by three
 *    glaciers, and every one of its silhouettes is different. Protecting that
 *    contrast is worth more than any detail below it.
 * 2. **The profile breaks, and it breaks the other way from Fuji's.** Fuji's
 *    slopes climb monotonically — 27, 37, 45, 51, 56, 64, 65, 67, 70 degrees —
 *    which is what makes its flanks read concave. Ours run **28.3, 41.9, 59.5,
 *    70.7, 73.3, 72.3, 67.2, 66.0, 62.8**: a shallow apron, a hard shoulder
 *    into near-vertical faces, and then an *easing* through the top third. Up
 *    to the waist it is steeper than Fuji; over the last quarter it turns
 *    convex and blunts. At half height it stands at 39% of its base radius
 *    where a straight cone would be at 52% and Fuji is at 42%.
 * 3. **Bare dark rock above the snow, which is the inversion.** Fuji is grey
 *    below and white above. Everest is white in the middle — the Western Cwm,
 *    the Khumbu and Rongbuk ice — and then goes **dark**, because above about
 *    7,000 m the faces stand too steep to hold anything, and only the last few
 *    metres of summit dome are white again. Anyone who has seen a photograph
 *    knows the black triangle under the white tip.
 * 4. **The Yellow Band.** A stripe of pale limestone across the upper mountain
 *    at roughly 8,200-8,600 m, visible in every photograph ever taken of it,
 *    and unique to this mountain. One `sand` band at y 58-68, deliberately
 *    crossed by dark ribs so it reads as a stratum and not as a cake tin.
 * 5. **The plume.** Snow streaming east off the summit into the jet stream. It
 *    is in every photograph and it is the only monument in this project that
 *    is made of weather.
 * 6. **The prayer flags.** Five, in the fixed lungta order — blue, white, red,
 *    green, yellow, for sky, air, fire, water and earth. The palette holds
 *    `skyBlue`, `white`, `red`, `green` and `gold` and that is the set exactly,
 *    which is luck this file did not deserve. They are the only saturated
 *    colour on a grey mountain and at thumbnail size they are what says a
 *    person has been here.
 *
 * **Facts deliberately not modelled.** The Khumbu Icefall is on the south side
 * and would be invisible from the sheet's front camera; six broken blocks sit
 * on the apron instead, which is as much icefall as 110 units can carry. The
 * Kangshung Face — the east side, 3,350 m of it, the biggest wall on the
 * mountain and unclimbed until 1983 — is modelled by **leaving bearing 90
 * completely bare**: no rib, no spur, no gully. It is the one direction on this
 * model with nothing bolted to it, and that absence is the feature.
 *
 * `iso` is NPL and the summit is on the Nepal-China border; the source list
 * says Nepal and this file agrees with it because two copies of a fact are two
 * chances to be wrong. `countryAt(27.988, 86.925)` returns nothing at 1:110m —
 * the point falls between the polygons — and `build-monuments.ts` has already
 * snapped the placement 2.2 km to 27.9739, 86.909. That is the same trap
 * `CLAUDE.md` records for coastal cities, met on a watershed instead of a
 * coast, and it is handled in the bake rather than here.
 */

const DEG = Math.PI / 180;

/** Summit height. Everything is a fraction of this; see the note on the tier. */
const TOP = 84;

/**
 * The profile: hexagonal apothem at each height, foot to summit.
 *
 * **Six sides, and it is the single most load-bearing number in the file.**
 * With the contract's half-segment rotation a hexagon puts its corners at
 * bearings 30, 90, 150, 210, 270 and 330, and its faces at 0, 60, 120, 180, 240
 * and 300. Everest's three ridges run **northeast (~40), southeast (~140) and
 * west (~270)**, and its three faces are the **North Face** (spanning 270
 * through 0 to 30), the **Kangshung/East Face** (30 through 90 to 150) and the
 * **Southwest Face** (150 through 210 to 270). A hexagon lands its corners on
 * the three ridges and centres its faces on the three faces, to within a few
 * degrees, for free. The plan of this mountain is a hexagon; nothing else was
 * tried.
 *
 * Read the slopes rather than the radii — 35.2, 45.7, 58.2, 70.7, 73.3, 72.3,
 * 67.2, 66.0, 62.8 degrees. The jump from 45.7 to 58.2 is the shoulder where
 * the massif's apron gives way to the faces, and the fall from 73.3 back to
 * 62.8 is the summit pyramid blunting into a dome. Both are the opposite of
 * Fuji's single monotone sweep, and both are checkable in this table.
 *
 * The first band was 28 degrees for one round and the model came out standing
 * on a plinth: at that angle the apron is nearly a floor, and a wide flat
 * hexagon lit from above reads as a base plate with a mountain set on it, not
 * as the foot of the mountain. 35 is enough to lose it and still shallow enough
 * to be an apron.
 *
 * The apothem is a half-width across the flats, so a corner reaches 1.1547x it:
 * 46.9 at the foot is 54.16 to the ridge corners, and the ribs standing proud
 * of them take the measured radius to about 54.2 inside the 55 footprint.
 */
const PROFILE = [
  { y: 0, r: 46.9 },
  { y: 6, r: 38.4 },
  { y: 14, r: 30.6 },
  { y: 24, r: 24.4 },
  { y: 36, r: 20.2 }, // the faces begin
  { y: 48, r: 16.6 },
  { y: 58, r: 13.4 }, // the Yellow Band starts here
  { y: 68, r: 9.2 },
  { y: 77, r: 5.2 },
  { y: TOP, r: 1.6 }, // the summit is a flat about the size of a dining table
];

/**
 * How far the summit hangs off the base centre, east and north.
 *
 * This is the asymmetry, and both components earn their place from the front
 * camera. `placement.ts` aims a monument's +Z at the north pole, so **+Z is
 * north, -X is east**, and the contact sheet's front view therefore looks
 * straight at the North Face with the West Ridge on the screen's right and the
 * Kangshung Face on its left.
 *
 * - **North (+Z 5.5).** Pulling the summit toward the camera steepens the
 *   North Face, which is the wall the sheet is going to see.
 * - **East (-X 6.5).** This is the one that shows in *silhouette*: the west
 *   flank has to run 61 units out from under the summit and the east flank only
 *   49, so the screen-right profile is long and stepped and the screen-left
 *   profile is a near-vertical drop. The cornice overhangs east and the plume
 *   streams east, both reinforcing the same edge. A mountain that is symmetric
 *   in silhouette is a cone; that is Fuji's card and it is already taken.
 *
 * `LEAN_BIAS` 1.4 keeps the lean near zero through the apron — the massif stays
 * planted — and spends it all on the summit pyramid, where it is a lean and not
 * a topple.
 */
const LEAN_EAST = 9.5;
const LEAN_NORTH = 6.5;
const LEAN_BIAS = 1.4;

/** The three ridges, as bearings. Corners of the hexagon; see `PROFILE`. */
const NE_RIDGE = 30;
const SE_RIDGE = 150;
const W_RIDGE = 270;

/**
 * Rock ribs standing up through the snow, as `[bearing, top, half-width]`.
 *
 * All start at y 20, inside the white, and end somewhere either side of the
 * snowline at 34. **The tops and the widths must not correlate** — Fuji's file
 * learned this the expensive way: make one a function of the other and every
 * rib is the same rib at a different size, which reads as a paper crown rather
 * than as rock. A wide one here is as likely to be short as long.
 *
 * Bearing 90 is absent, and so is every bearing within 25 degrees of it. That
 * is the Kangshung Face and it is meant to be one unbroken wall.
 */
const ROCK_RIBS: [bearing: number, top: number, half: number][] = [
  [52, 44, 2.1],
  [58, 37, 2.9],
  [122, 41, 1.8],
  [136, 36, 2.6],
  [188, 45, 2.4],
  [214, 38, 1.7],
  [248, 42, 2.8],
  [296, 36, 2.2],
  [316, 43, 1.6],
  [340, 39, 2.7],
];

/** Snow lodged in gullies above the snowline, as `[bearing, top, half-width]`. All start at y 28. */
const SNOW_TONGUES: [bearing: number, top: number, half: number][] = [
  [44, 48, 2.4],
  [128, 45, 1.9],
  [166, 52, 2.6],
  [200, 41, 3.0],
  [232, 47, 2.0],
  [268, 40, 2.7],
  [308, 50, 2.2],
  [330, 43, 3.1],
];

/**
 * The glaciers, as `[bearing, top, half-width]`, all rooted at y 2.
 *
 * **These carry the snowline, and they replaced three horizontal white bands
 * that were doing it before.** Painting the body white from y 5 to 34 drew a
 * hard ring right where the profile already breaks, and the two together read
 * as a plinth with a dark cone standing on it — the model looked like a
 * building with a roof. Snow does not arrive at an altitude, it arrives in the
 * places that will hold it, so the body is rock all the way up and the ice is
 * laid on it in tongues, with rock showing between them. The snowline is then
 * somewhere around 22 without ever being a line, which is what it looks like
 * from the Khumbu.
 *
 * **They are grouped, not spread, and that is the second thing this list had to
 * be told.** Twelve tongues at even bearings with even roots read as a paper
 * crown — Fuji's file names that exact failure for its snow, and evenly spacing
 * these reproduced it on the first try, a ring of white petals round the foot.
 * So they come in three clusters that merge into sheets (Rongbuk, Kangshung,
 * Khumbu) and three lone tongues down the west with bare rock either side, and
 * the roots stagger from 2.8 to 6.5 so no two start on the same contour. A
 * glacier is a river; rivers are where the valleys are, and valleys are not
 * evenly spaced.
 */
const GLACIERS: [bearing: number, root: number, top: number, half: number][] = [
  // Rongbuk, north, and the one the front camera sees: three tongues close
  // enough to run together into a sheet.
  [4, 3.0, 34, 3.8],
  [18, 5.5, 24, 2.6],
  [34, 3.5, 19, 3.2],
  // Kangshung, east and behind — four, also merged.
  [124, 4.0, 38, 2.8],
  [136, 2.8, 28, 3.6],
  [152, 6.0, 33, 2.2],
  [168, 3.2, 22, 3.4],
  // Khumbu, south.
  [196, 4.5, 36, 2.6],
  [210, 3.0, 26, 3.9],
  // And three single tongues down the west, with bare rock between them.
  [248, 5.0, 31, 2.4],
  [300, 3.5, 29, 3.3],
  [318, 6.5, 21, 2.8],
];

/** Séracs on the apron: `[bearing, radius from the axis, width, height]`. */
const SERACS: [bearing: number, out: number, width: number, height: number][] = [
  [162, 42, 3.4, 2.4],
  [178, 45, 2.6, 1.7],
  [196, 40, 3.0, 2.8],
  [214, 44, 2.2, 2.0],
  [148, 46, 2.4, 1.5],
  [232, 41, 3.2, 2.2],
];

/** The lungta order, and it is fixed: sky, air, fire, water, earth. */
const FLAG_ORDER = ['skyBlue', 'white', 'red', 'green', 'gold'] as const;

const radiusAt = (y: number): number => {
  const first = PROFILE[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return PROFILE[PROFILE.length - 1]!.r;
};

const leanFraction = (y: number): number => Math.pow(Math.min(1, Math.max(0, y / TOP)), LEAN_BIAS);

/**
 * Distance from the axis to the hexagon's surface at a bearing.
 *
 * Exact rather than approximate: the apothem divided by the cosine of the angle
 * off the nearest face normal, which gives `r` at a face and 1.1547r at a
 * corner. Everything in this file that sits *on* the mountain is placed with
 * it, so ribs land on the rock instead of hovering over the corners or sinking
 * into the flats — the mistake a single `radiusAt` would make on a hexagon.
 */
const boundaryAt = (y: number, bearing: number): number => {
  let off = ((bearing % 60) + 60) % 60;
  if (off > 30) off -= 60;
  return radiusAt(y) / Math.cos(off * DEG);
};

export const mountEverest: Monument = {
  id: 'mount-everest',
  name: 'Mount Everest',
  iso: 'NPL',
  lat: 27.988,
  lon: 86.925,
  realHeight: 8849,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;

    // Four colours for the mountain and four more for the flags.
    //
    // `steel` and not Fuji's `slate` is the deliberate one. Fuji is a pale
    // grey-violet cone and that is how it is printed; Everest is dark, and the
    // two cards have to be told apart at thumbnail size before either caption
    // is read. `bark` under `sand` under `white` is the real sequence of the
    // upper mountain and the reason the summit reads as a black triangle with a
    // white tip.
    const rock = palette.steel; // moraine and the lower walls
    const dark = palette.bark; // the great faces, and every rib
    const snow = palette.white; // glacier, gully and summit dome
    const band = palette.sand; // the Yellow Band

    const group = new THREE.Group();
    const UP = new THREE.Vector3(0, 1, 0);

    /** A point on the mountain's skin, pushed `out` units clear of it. */
    const at = (y: number, bearing: number, out = 0): Vector3 => {
      const b = bearing * DEG;
      const d = boundaryAt(y, bearing) + out;
      const lean = leanFraction(y);
      return new THREE.Vector3(
        -LEAN_EAST * lean - Math.sin(b) * d,
        y,
        LEAN_NORTH * lean + Math.cos(b) * d,
      );
    };

    /** The horizontal outward direction at a bearing. */
    const outward = (bearing: number): Vector3 =>
      new THREE.Vector3(-Math.sin(bearing * DEG), 0, Math.cos(bearing * DEG));

    /**
     * A tapered beam from one point to another, squashed flat across `face`.
     *
     * The one piece of geometry worth explaining, and the reason the rest of
     * this file is arithmetic rather than trigonometry. `taper` stands on +Y,
     * so the holder needs a rotation that takes +Y onto the beam's axis — and
     * **which rotation matters, because `flatten` squashes one particular local
     * axis.** The obvious `quaternion.setFromUnitVectors(UP, axis)` is the
     * minimal rotation, and it turns about `UP x axis`, which is *tangential*:
     * that leaves local +Z pointing out of the slope at bearing 0 and pointing
     * sideways along it at bearing 270. Built that way the three ridges came
     * out as slabs lying flat on the mountain, on their edge, and hanging 3.9
     * units through the ground, all from the same one line — and only the ones
     * near due north looked right, which is exactly the kind of bug that
     * survives a screenshot.
     *
     * So the basis is stated rather than inferred. `face` is where the broad
     * side has to look; local Z is `face` made perpendicular to the axis, and
     * local X is what is left. For anything on a flank, pass `outward(bearing)`
     * and the slab lies on the rock with its width running across the slope and
     * its thickness measured out of it — Fuji's `flank` helper, with the
     * bearing taken out of the frame and put into the endpoints. That is what
     * an asymmetric mountain needs: nothing here repeats about the axis, so
     * nothing here can use `around`.
     */
    const spar = (
      from: Vector3,
      to: Vector3,
      halfFrom: number,
      halfTo: number,
      color: number,
      flatten: number,
      face: Vector3,
    ): Group => {
      const yAxis = to.clone().sub(from);
      const length = yAxis.length();
      yAxis.divideScalar(length);
      const zAxis = face.clone().addScaledVector(yAxis, -face.dot(yAxis)).normalize();
      const xAxis = yAxis.clone().cross(zAxis);

      const holder = new THREE.Group();
      holder.position.copy(from);
      holder.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
      );
      const slab = new THREE.Group();
      slab.scale.z = flatten;
      slab.add(taper(halfFrom, halfTo, length, color, 4));
      holder.add(slab);
      return holder;
    };

    /**
     * A rib or gully running up the flank at one bearing.
     *
     * `fromY` is never 0. The beam's foot is a flat square cut perpendicular to
     * a sloping axis, so half of it is always below the point it starts from:
     * at the base, `half * flatten * cos(slope)` is 2.2 units, and a rib
     * starting at y = 0 hangs that far through the ground. Starting at 3 puts
     * the whole cut inside the apron, and costs nothing visible — the hexagon's
     * corner is already the silhouette down there.
     */
    const rib = (
      bearing: number,
      fromY: number,
      toY: number,
      halfFrom: number,
      halfTo: number,
      color: number,
      sink: number,
      flatten = 0.55,
    ): Group =>
      spar(
        at(fromY, bearing, -sink),
        at(toY, bearing, -sink),
        halfFrom,
        halfTo,
        color,
        flatten,
        outward(bearing),
      );

    // --- the body ---------------------------------------------------------
    //
    // Nine hexagonal bands. Each is placed at the lean of its own *midpoint*
    // rather than of its foot, which splits the seam offset evenly above and
    // below instead of stacking it on one side: at the summit that is 0.4 units
    // against a 5-unit radius, and it reads as a ledge, which is what a rock
    // horn has. The bottom band still stands on y = 0.
    const BANDS = [rock, rock, rock, rock, dark, dark, band, dark, snow];
    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      const lean = leanFraction((a.y + b.y) / 2);
      const seg = taper(a.r, b.r, b.y - a.y, BANDS[i]!, 6);
      seg.position.set(-LEAN_EAST * lean, a.y, LEAN_NORTH * lean);
      group.add(seg);
    }

    // --- the three ridges -------------------------------------------------
    //
    // Four runs each, thinning as they climb, broken so no run stands more than
    // a fraction clear of a flank that changes slope under it. They are the
    // corners of the hexagon, so they are already in the silhouette; the ribs
    // only ink them.
    //
    // The three are given different treatments on purpose. The West Ridge is
    // the long low one and carries the West Shoulder; the North-East Ridge
    // carries the Second Step; the South-East Ridge carries the South Summit.
    // Three identical ridges would put the symmetry straight back in.
    for (const bearing of [NE_RIDGE, SE_RIDGE, W_RIDGE]) {
      group.add(rib(bearing, 3, 14, 4.6, 3.6, dark, 1.5, 0.6));
      group.add(rib(bearing, 14, 34, 3.6, 2.7, dark, 1.2, 0.6));
      group.add(rib(bearing, 34, 58, 2.7, 2.0, dark, 0.9, 0.6));
      group.add(rib(bearing, 58, 78, 2.0, 1.1, dark, 0.6, 0.6));
    }

    // Secondary spurs, low and short, at two of the three remaining corners.
    // They stop the plan reading as a clean triangle. The third remaining
    // corner is bearing 90 and it stays bare: see the Kangshung note above.
    group.add(rib(210, 3, 20, 3.4, 2.2, dark, 1.4, 0.55));
    group.add(rib(330, 3, 26, 3.0, 1.9, dark, 1.4, 0.55));

    /**
     * The West Shoulder — the broad step at about 7,300 m where the West Ridge
     * flattens before it climbs again.
     *
     * It is here because it is the only feature that changes the *silhouette*
     * on the screen's right-hand side: it pushes the profile out from 32 units
     * to 47 across y 8 to 22, so the right edge of the thumbnail has a step in
     * it. A horn with two clean straight edges is a Matterhorn; the step is
     * what makes this one Everest seen from the north.
     */
    group.add(spar(at(10, W_RIDGE, 2.5), at(24, W_RIDGE, 0.5), 7.2, 4.6, dark, 0.5, outward(W_RIDGE)));

    // --- the North Face ---------------------------------------------------
    //
    // The wall the front camera sees. Its endpoints are chosen so that it runs
    // at 81.5 degrees where the cone under it runs at 65-73: sunk 2 units into
    // the rock at its foot and standing 4 proud at its head, so the ink catches
    // a hard edge across the top of it and the face reads as *steeper than the
    // mountain*, which is exactly what a face is.
    group.add(spar(at(16, 0, -2), at(60, 0, 4), 15, 5.5, dark, 0.22, outward(0)));

    // The Great Couloir and the Hornbein, the two snow gullies that split the
    // North Face and are the reason anyone can climb it. White on dark does the
    // work; the thickness of the slab does not, which Fuji's file settled.
    group.add(spar(at(26, -14, 1.2), at(64, -5, 4.8), 1.7, 0.9, snow, 0.5, outward(-10)));
    group.add(spar(at(24, 12, 1.2), at(62, 3, 4.6), 1.5, 0.8, snow, 0.5, outward(8)));

    // --- the snowline, broken both ways -----------------------------------
    //
    // The band boundary at y 34 is a horizontal line and would read as one.
    // Fuji breaks its snow line with tongues of snow running *down*; this
    // mountain breaks the same line twice and in opposite directions, because
    // its snowline is the opposite way round: rock ribs stand *up* through the
    // white from below, and snow lodges *up* into the dark from above. The two
    // sets are on different bearings, so a rib never sits on a gully.
    for (const [bearing, root, top, half] of GLACIERS) {
      // Long and narrow, not short and broad. The first pass ran them 14 units
      // wide over 16 of height and every one came out a white teepee pitched on
      // the apron; a glacier at this scale is a *streak*, so they are 5 to 8
      // wide over 16 to 34 of height instead, and they read as ice in a gully.
      // Sunk over a unit and tapered to 45% at the head — not to a point, which
      // is the other half of what made them tents.
      group.add(rib(bearing, root, top, half, half * 0.45, snow, 1.1, 0.35));
    }
    for (const [bearing, top, half] of ROCK_RIBS) {
      group.add(rib(bearing, 21, top, half, half * 0.55, dark, 0.8, 0.5));
    }
    for (const [bearing, top, half] of SNOW_TONGUES) {
      group.add(rib(bearing, 28, top, half, half * 0.45, snow, 0.5, 0.45));
    }

    // Two more dark ribs, on the front, purely to cross the Yellow Band. Its
    // top and bottom edges are the only dead-horizontal lines left on the model
    // and unbroken they turn a stratum into a painted collar. The three ridges
    // already cross it at 30, 150 and 270; these put a break either side of the
    // North Face as well, where the camera is looking.
    group.add(rib(348, 52, 71, 2.0, 1.4, dark, 0.4, 0.5));
    group.add(rib(20, 54, 70, 1.7, 1.2, dark, 0.4, 0.5));

    // --- the summit region ------------------------------------------------

    // The summit ridge is a corniced snow crest, and these are the two arms of
    // it running down the North-East and South-East ridges. They stand slightly
    // proud rather than sunk, which is what a cornice does, and they roughly
    // double the amount of white at the top: the thing that has to read from
    // across the sheet is a white tip on a black triangle, and the tip alone
    // was too small to be sure of.
    group.add(rib(NE_RIDGE, 70, 82, 1.8, 0.8, snow, -0.4, 0.5));
    group.add(rib(SE_RIDGE, 68, 81, 1.8, 0.8, snow, -0.4, 0.5));

    // The Second Step: the 40-metre rock wall on the North-East Ridge that
    // stopped everyone before 1960 and now carries a ladder. Steeper than the
    // ridge it sits on, which is the whole of what a step is.
    group.add(spar(at(58, NE_RIDGE, 0.5), at(67, NE_RIDGE, 2.5), 2.4, 1.7, dark, 0.6, outward(NE_RIDGE)));

    /**
     * The South Summit, and the notch of the Hillary Step below it.
     *
     * The best-value 40 triangles in the file. A single apex is a cone from
     * every angle; a **twin summit with a notch between them** is a crest, and
     * a crest is what you are looking at. Real: 8,749 m against 8,849, a gap of
     * 100 m in 8,849 or 1.1%. Here it stands 5 units under an 84-unit summit,
     * 6%, so about 5x exaggerated — the same trade Fuji makes for its crater
     * and for the same reason, that at 40 pixels tall the true ratio is nothing
     * at all.
     */
    const south = taper(4.2, 1.4, 9, snow, 6);
    const southFoot = at(70, SE_RIDGE, -2);
    south.position.copy(southFoot);
    group.add(south);
    const step = taper(2.2, 1.6, 4, dark, 4);
    step.position.copy(at(72, SE_RIDGE + 8, -3.5));
    group.add(step);

    /**
     * The summit cornice, overhanging east.
     *
     * `taper` with a wider top than bottom is the only overhang in the helper
     * set, and this is what it is for. The last few metres of Everest are a
     * wind-built snow crest hanging out over the Kangshung Face, so it flares
     * east — the same edge the lean and the plume are already on, because one
     * side of the silhouette has to win.
     */
    const cornice = taper(1.7, 3.4, 4, snow, 6);
    cornice.position.set(-8.6, 79, 4.8);
    group.add(cornice);

    /**
     * The plume: snow streaming east off the summit into the jet stream.
     *
     * **Three separate slabs with gaps between them, and it started as one
     * continuous wedge growing out of the summit.** That version came out as a
     * walrus tusk, and the reason is the ink: a solid white wedge joined to the
     * rock and drawn with the same black outline as the rock is read as *part
     * of the rock*, and no amount of thinning fixed it. Detaching it does. The
     * first slab starts 3 units clear of the summit's east flank and the three
     * break twice more on the way out, so the outline draws three floating
     * shapes and the eye has nothing to attach them to. Broken means weather.
     * Three was arrived at from 1.5: at 1.5 the gap closed against the summit's
     * own snow crest, which is on the same side, and the two ran together into
     * a wing.
     *
     * They run 30 units east and drop 8 degrees, topping out at 81.1 so the
     * peak at 84 stays the highest point of the model. Each is squashed across
     * its width, which leaves it broad in the screen plane and thin front to
     * back: from the sheet's camera it is a banner, and from the side it nearly
     * disappears, which is what a banner cloud does.
     */
    const PLUME_FACE = new THREE.Vector3(0, 0, 1);
    const PLUME: [number, number, number, number, number, number, number, number][] = [
      [-16.5, 79.2, 5.2, -25.0, 78.6, 4.0, 1.9, 1.5],
      [-28.0, 78.0, 3.6, -36.5, 77.0, 2.4, 1.4, 1.0],
      [-39.5, 76.2, 2.0, -46.5, 74.8, 1.0, 0.9, 0.45],
    ];
    for (const [ax, ay, az, bx, by, bz, halfA, halfB] of PLUME) {
      group.add(
        spar(
          new THREE.Vector3(ax, ay, az),
          new THREE.Vector3(bx, by, bz),
          halfA,
          halfB,
          snow,
          0.45,
          PLUME_FACE,
        ),
      );
    }

    // --- the apron --------------------------------------------------------
    //
    // Séracs: the Khumbu Icefall, which is on the south side and therefore
    // behind the camera, reduced to six broken blocks on the south-west apron.
    // Turned off the radial by a few degrees each so they do not line up, and
    // sunk into the slope so they read as ice already broken rather than as
    // crates set down.
    for (const [bearing, out, width, height] of SERACS) {
      const b = bearing * DEG;
      const y = 1.4;
      const lean = leanFraction(y);
      const block = box(width, height, width * 0.8, snow);
      block.position.set(
        -LEAN_EAST * lean - Math.sin(b) * out,
        y - height * 0.3,
        LEAN_NORTH * lean + Math.cos(b) * out,
      );
      block.rotation.y = -b + (bearing % 7) * 0.09;
      group.add(block);
    }

    /**
     * A string of prayer flags between two poles.
     *
     * Deliberately oversized: the poles are 8 units against a 6.8-unit avatar
     * and each flag is 2.5 by 2.0, which at true scale would be a couple of
     * units of nothing. Five flags, one full set, in the order they are always
     * strung. They are the only saturated colour anywhere on this mountain, so
     * at thumbnail size they cost 60 triangles and buy the one thing the rock
     * cannot say, which is that people come here.
     */
    const flagLine = (bearingA: number, bearingB: number, y: number): Group => {
      const string = new THREE.Group();
      const poleH = 6.5;
      const a = at(y, bearingA);
      const b = at(y, bearingB);
      for (const foot of [a, b]) {
        const pole = column(0.55, poleH, dark, 6);
        pole.position.copy(foot);
        string.add(pole);
      }
      const headA = a.clone().setY(a.y + poleH);
      const headB = b.clone().setY(b.y + poleH);
      string.add(spar(headA, headB, 0.28, 0.28, dark, 1, UP));

      const run = headB.clone().sub(headA);
      const yaw = Math.atan2(-run.z, run.x);
      FLAG_ORDER.forEach((name, index) => {
        const t = (index + 0.5) / FLAG_ORDER.length;
        const hang = headA.clone().lerp(headB, t);
        // The line sags, so the flags do. A flat row of them reads as bunting
        // on a stick; the curve is what makes it a string between two poles.
        const sag = Math.sin(t * Math.PI) * 0.9;
        const flag = box(2.1, 1.7, 0.3, palette[name]);
        flag.position.set(hang.x, hang.y - sag - 2.0, hang.z);
        flag.rotation.y = yaw;
        string.add(flag);
      });
      return string;
    };

    // One string across the north apron, where the front camera sees it, and
    // one on the north-west. Both poles of a string sit at the same height, so
    // the line is level and the sag is the only curve in it.
    group.add(flagLine(-14, 12, 1.9));
    group.add(flagLine(296, 320, 2.4));

    // A chorten beside them. Two blocks, no more: it is 3 units tall and its
    // whole job is to be a made thing standing next to a made thing.
    const chorten = taper(1.9, 1.1, 2.2, rock, 6);
    chorten.position.copy(at(2.2, 26));
    group.add(chorten);
    const spire = taper(0.8, 0.25, 1.6, rock, 6);
    spire.position.copy(at(2.2, 26).setY(4.4));
    group.add(spire);

    return group;
  },
};
