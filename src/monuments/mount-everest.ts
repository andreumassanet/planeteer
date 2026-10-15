import type { Group, Monument, Vector3 } from './contract.ts';

/**
 * Mount Everest.
 *
 * The terrain already builds the mountain at this site: 511 units of raw relief
 * with a Himalayan front falling away to the south and the range holding to the
 * east, and the placement pad flattens a 90-unit summit plateau. The model is
 * therefore the summit pyramid only, the last 84 units of a 595-unit mountain,
 * cropped where the pad crops it. That is about 0.068 units per metre, so the
 * 84-unit height is a 1.3x exaggeration and the 110-unit width is true scale.
 *
 * Tier `landmark`, taken for its 55-unit footprint rather than its height
 * (`tower`'s 28 would leave a needle where a horn belongs). Aspect 1.31.
 *
 * What names Everest: a horn with three ridges and three faces on a hexagonal
 * plan (not a symmetric cone); a profile that is steep to the waist and then
 * eases and blunts over the top quarter; bare dark rock above the snow with
 * only the last metres of summit dome white; a pale Yellow Band (`sand`, y
 * 58-68) crossed by dark ribs so it reads as a stratum; a snow plume streaming
 * east; and five prayer flags in the lungta order, the only saturated colour on
 * the grey mountain. The Khumbu Icefall is reduced to six serac blocks on the
 * apron, and bearing 90, the Kangshung Face, is left completely bare.
 *
 * `iso` is NPL, as in the source list. `countryAt` returns nothing at this
 * coordinate at low resolution, and the bake snaps the placement 2.2 km.
 */

const DEG = Math.PI / 180;

/** Summit height. Everything is a fraction of this. */
const TOP = 84;

/**
 * The profile: hexagonal apothem at each height, foot to summit.
 *
 * Six sides: with the contract's half-segment rotation a hexagon puts its
 * corners at bearings 30, 90, 150, 210, 270 and 330 and its faces at 0, 60, 120,
 * 180, 240 and 300. Everest's ridges run northeast (~40), southeast (~140) and
 * west (~270) and its faces are the North Face, the Kangshung/East Face and the
 * Southwest Face, so the corners land on the ridges and the faces centre on the
 * faces. Read the slopes (35.2, 45.7, 58.2, 70.7, 73.3, 72.3, 67.2, 66.0, 62.8
 * degrees): a shoulder where the apron gives way to the faces, and a fall as the
 * summit blunts into a dome. A first band steeper than 28 degrees avoids a
 * plinth reading.
 *
 * The apothem is a half-width across the flats, so a corner reaches 1.1547x it:
 * 46.9 at the foot is 54.16 to the ridge corners, and the ribs take the
 * measured radius to about 54.2, inside the 55 footprint.
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
 * How far the summit hangs off the base centre, east and north. `placement.ts`
 * aims a monument's +Z at the north pole, so +Z is north and -X is east, and the
 * front view looks at the North Face with the West Ridge on the right and the
 * Kangshung Face on the left. North (+Z 5.5) steepens the North Face; east
 * (-X 6.5) makes the west profile long and stepped and the east a near-vertical
 * drop, which the cornice and the plume reinforce. `LEAN_BIAS` 1.4 keeps the
 * apron planted and spends the lean on the summit pyramid.
 */
const LEAN_EAST = 9.5;
const LEAN_NORTH = 6.5;
const LEAN_BIAS = 1.4;

/** The three ridges, as bearings: corners of the hexagon (see `PROFILE`). */
const NE_RIDGE = 30;
const SE_RIDGE = 150;
const W_RIDGE = 270;

/**
 * Rock ribs standing up through the snow, as `[bearing, top, half-width]`. All
 * start at y 20 and end either side of the snowline at 34. Tops and widths are
 * uncorrelated, or every rib is the same rib at a different size. Bearing 90 and
 * every bearing within 25 degrees of it are absent: the Kangshung Face is one
 * unbroken wall.
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
 * The glaciers, as `[bearing, root, top, half-width]`, rooted near y 2. They
 * carry the snowline: the body is rock all the way up and the ice is laid on it
 * in tongues, so the line is never a horizontal ring. They come in three
 * clusters that merge into sheets (Rongbuk, Kangshung, Khumbu) and three lone
 * tongues down the west, with roots staggered from 2.8 to 6.5; even spacing
 * reads as a paper crown.
 */
const GLACIERS: [bearing: number, root: number, top: number, half: number][] = [
  // Rongbuk, north, the one the front camera sees: three tongues that run together.
  [4, 3.0, 34, 3.8],
  [18, 5.5, 24, 2.6],
  [34, 3.5, 19, 3.2],
  // Kangshung, east and behind: four, also merged.
  [124, 4.0, 38, 2.8],
  [136, 2.8, 28, 3.6],
  [152, 6.0, 33, 2.2],
  [168, 3.2, 22, 3.4],
  // Khumbu, south.
  [196, 4.5, 36, 2.6],
  [210, 3.0, 26, 3.9],
  // Three single tongues down the west, with bare rock between them.
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

/** The lungta order, fixed: sky, air, fire, water, earth. */
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
 * Distance from the axis to the hexagon's surface at a bearing: the apothem
 * over the cosine of the angle off the nearest face normal. Everything that
 * sits on the mountain is placed with it, so ribs land on the rock instead of
 * hovering over corners or sinking into flats.
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
  surface: 'none',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;

    // Four colours for the mountain and four more for the flags. `steel` (not
    // Fuji's `slate`) so the two cards differ at thumbnail size; `bark` under
    // `sand` under `white` is the real sequence of the upper mountain.
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
     * `taper` stands on +Y, so the holder rotates +Y onto the beam's axis, and
     * which rotation matters because `flatten` squashes one particular local
     * axis: the minimal `setFromUnitVectors` turns tangentially and leaves +Z
     * along the slope at some bearings. So the basis is stated: local Z is
     * `face` made perpendicular to the axis, local X is what is left. For
     * anything on a flank pass `outward(bearing)` and the slab lies on the rock
     * with its width across the slope and its thickness out of it. Nothing here
     * repeats about the axis, so nothing here can use `around`.
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
     * A rib or gully running up the flank at one bearing. `fromY` is never 0:
     * the beam's foot is a flat square cut perpendicular to a sloping axis, so
     * half of it is below the start point (2.2 units at the base).
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

    // --- the body: nine hexagonal bands, each placed at the lean of its own
    // midpoint so the seam offset splits evenly above and below. The bottom
    // band stands on y = 0. ---
    const BANDS = [rock, rock, rock, rock, dark, dark, band, dark, snow];
    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      const lean = leanFraction((a.y + b.y) / 2);
      const seg = taper(a.r, b.r, b.y - a.y, BANDS[i]!, 6);
      seg.position.set(-LEAN_EAST * lean, a.y, LEAN_NORTH * lean);
      group.add(seg);
    }

    // --- the three ridges: four runs each, thinning as they climb. They are the
    // corners of the hexagon, so already in the silhouette. Treated differently
    // so the symmetry does not return: the West Ridge is long and low and
    // carries the West Shoulder, the North-East Ridge the Second Step, the
    // South-East Ridge the South Summit. ---
    for (const bearing of [NE_RIDGE, SE_RIDGE, W_RIDGE]) {
      group.add(rib(bearing, 3, 14, 4.6, 3.6, dark, 1.5, 0.6));
      group.add(rib(bearing, 14, 34, 3.6, 2.7, dark, 1.2, 0.6));
      group.add(rib(bearing, 34, 58, 2.7, 2.0, dark, 0.9, 0.6));
      group.add(rib(bearing, 58, 78, 2.0, 1.1, dark, 0.6, 0.6));
    }

    // Secondary spurs, low and short, at two of the three remaining corners; the third (bearing 90) stays bare.
    group.add(rib(210, 3, 20, 3.4, 2.2, dark, 1.4, 0.55));
    group.add(rib(330, 3, 26, 3.0, 1.9, dark, 1.4, 0.55));

    /**
     * The West Shoulder: the broad step where the West Ridge flattens before it
     * climbs again. It pushes the right-hand profile out from 32 to 47 units
     * across y 8 to 22, so the silhouette is not two clean straight edges.
     */
    group.add(spar(at(10, W_RIDGE, 2.5), at(24, W_RIDGE, 0.5), 7.2, 4.6, dark, 0.5, outward(W_RIDGE)));

    // --- the North Face: runs at 81.5 degrees where the cone runs at 65-73, sunk
    // 2 units at the foot and 4 proud at the head, so it reads steeper than the mountain ---
    group.add(spar(at(16, 0, -2), at(60, 0, 4), 15, 5.5, dark, 0.22, outward(0)));

    // The Great Couloir and the Hornbein, the two snow gullies on the North Face.
    group.add(spar(at(26, -14, 1.2), at(64, -5, 4.8), 1.7, 0.9, snow, 0.5, outward(-10)));
    group.add(spar(at(24, 12, 1.2), at(62, 3, 4.6), 1.5, 0.8, snow, 0.5, outward(8)));

    // --- the snowline, broken both ways: rock ribs stand up through the white
    // from below and snow lodges up into the dark from above, on different bearings ---
    for (const [bearing, root, top, half] of GLACIERS) {
      // Long and narrow: a glacier at this scale is a streak (5 to 8 wide over
      // 16 to 34 high), sunk over a unit and tapered to 45% at the head.
      group.add(rib(bearing, root, top, half, half * 0.45, snow, 1.1, 0.35));
    }
    for (const [bearing, top, half] of ROCK_RIBS) {
      group.add(rib(bearing, 21, top, half, half * 0.55, dark, 0.8, 0.5));
    }
    for (const [bearing, top, half] of SNOW_TONGUES) {
      group.add(rib(bearing, 28, top, half, half * 0.45, snow, 0.5, 0.45));
    }

    // Two more dark ribs on the front, to cross the Yellow Band so its edges
    // are not dead-horizontal lines.
    group.add(rib(348, 52, 71, 2.0, 1.4, dark, 0.4, 0.5));
    group.add(rib(20, 54, 70, 1.7, 1.2, dark, 0.4, 0.5));

    // --- the summit region ---

    // The corniced snow crest: two arms running down the North-East and
    // South-East ridges, slightly proud, doubling the white at the top.
    group.add(rib(NE_RIDGE, 70, 82, 1.8, 0.8, snow, -0.4, 0.5));
    group.add(rib(SE_RIDGE, 68, 81, 1.8, 0.8, snow, -0.4, 0.5));

    // The Second Step: the rock wall on the North-East Ridge, steeper than the ridge it sits on.
    group.add(spar(at(58, NE_RIDGE, 0.5), at(67, NE_RIDGE, 2.5), 2.4, 1.7, dark, 0.6, outward(NE_RIDGE)));

    /**
     * The South Summit, and the notch of the Hillary Step below it: a twin
     * summit with a notch reads as a crest, not a cone. It stands 5 units under
     * the 84-unit summit (6%, about 5x the real 1.1%).
     */
    const south = taper(4.2, 1.4, 9, snow, 6);
    const southFoot = at(70, SE_RIDGE, -2);
    south.position.copy(southFoot);
    group.add(south);
    const step = taper(2.2, 1.6, 4, dark, 4);
    step.position.copy(at(72, SE_RIDGE + 8, -3.5));
    group.add(step);

    /** The summit cornice, overhanging east: a `taper` wider at the top, on the same edge as the lean and the plume. */
    const cornice = taper(1.7, 3.4, 4, snow, 6);
    cornice.position.set(-8.6, 79, 4.8);
    group.add(cornice);

    /**
     * The plume: snow streaming east off the summit. Three separate slabs with
     * gaps between them: one continuous wedge joined to the rock reads as part
     * of the rock under the same black outline. The first slab starts 3 units
     * clear of the summit's east flank. They run 30 units east and drop 8
     * degrees, topping out at 81.1 so the peak stays the highest point. Each is
     * squashed across its width: a banner from the front, nearly invisible from
     * the side.
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

    // --- the apron: six serac blocks on the south-west apron, turned off the
    // radial by a few degrees and sunk into the slope ---
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
     * A string of prayer flags between two poles. Oversized (poles of 8 units,
     * flags 2.5 by 2.0), five flags in the fixed order.
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
        // The line sags, so the flags do.
        const sag = Math.sin(t * Math.PI) * 0.9;
        const flag = box(2.1, 1.7, 0.3, palette[name]);
        flag.position.set(hang.x, hang.y - sag - 2.0, hang.z);
        flag.rotation.y = yaw;
        string.add(flag);
      });
      return string;
    };

    // One string across the north apron where the front camera sees it, one on
    // the north-west; both poles at the same height.
    group.add(flagLine(-14, 12, 1.9));
    group.add(flagLine(296, 320, 2.4));

    // A chorten beside them: two blocks, a made thing next to a made thing.
    const chorten = taper(1.9, 1.1, 2.2, rock, 6);
    chorten.position.copy(at(2.2, 26));
    group.add(chorten);
    const spire = taper(0.8, 0.25, 1.6, rock, 6);
    spire.position.copy(at(2.2, 26).setY(4.4));
    group.add(spire);

    return group;
  },
};
