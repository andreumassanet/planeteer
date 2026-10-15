import type { Group, Monument, Object3D } from './contract.ts';

/**
 * Mount Kilimanjaro.
 *
 * A massif, not a cone: the flat-topped Kibo in the middle, the shattered horn
 * of Mawenzi to the east and the broken rim of Shira to the west. The profile
 * has a shoulder in it (the Saddle bench) so the silhouette is not a haystack,
 * the summit is a table, and the ice is a set of flat slabs with sheer edges
 * lying on it rather than a cape down the flanks. The flanks change material
 * twice on the way up: rainforest, moorland, bare rock.
 *
 * Tier `landmark`, 48 units to Uhuru Peak across a 110-unit footprint. That
 * makes the vertical about 5.2x exaggerated, and the caldera and the ice are
 * exaggerated further, because a flat top with a hole in it has to survive
 * being a few pixels tall. The shield is stretched east-west by `SPREAD`, so
 * the front view carries the massif's real width. The rock is `tan`, a warm
 * colour that does not read as a browner lump of the clay land, and the
 * caldera is a recess that must stay on the contract's warm list.
 */

const DEG = Math.PI / 180;

/**
 * East-west stretch of the shield (the massif is about 1.5 times wider than
 * deep). Applied to a group holding the whole radial shield, so the band stack
 * stays seamless and anything lying on it is stretched with it. Slabs rotated
 * inside it are sheared, so everything lying on the flank is narrow and long.
 */
const SPREAD = 1.4;

/** Facets around the shield. 24 gives a 15-degree facet, as on Fuji, for the same reason. */
const SIDES = 24;

/**
 * The profile: half-width across the flats before the stretch, at each height.
 * The trailing comment is the width after the stretch and the slope of the band
 * below. The slopes climb to 50 degrees, lie back to 34 across the Saddle, climb
 * to 60 for Kibo's own cone and roll onto the summit table at 27. The bench is
 * where Mawenzi and Shira stand; the sharp roll-over is the plateau's edge.
 */
const PROFILE = [
  { y: 0, r: 39.0 }, // 54.6 stretched, 54.8 to a corner, inside the 55 footprint
  { y: 6, r: 33.93 }, // 47.5   40 deg
  { y: 11, r: 30.71 }, // 43.0   48    FOREST
  { y: 17, r: 27.14 }, // 38.0   50
  { y: 21, r: 24.64 }, // 34.5   49    MOOR
  { y: 25, r: 22.14 }, // 31.0   49
  { y: 28, r: 18.93 }, // 26.5   34    SADDLE, the bench
  { y: 33, r: 16.43 }, // 23.0   55
  { y: 39, r: 13.93 }, // 19.5   60
  { y: 42.5, r: 12.0 }, // 16.8   52
  { y: 44, r: 9.86 }, // 13.8   27    TABLE
];

/**
 * The two vegetation lines, as `PROFILE` heights so each zone is a band of its
 * own material. They sit lower than the real belts so the model reads as a dark
 * skirt under bare rock.
 */
const FOREST = 11;
const MOOR = 21;

/** The heights of Kibo's summit furniture. The bench is `PROFILE`'s y = 28. */
const TABLE = 44;
const RIM_WALL = 1.6;
const UHURU = 2.4;

/** The caldera, before the stretch. */
const RIM_INNER = 3.6;
const RIM_OUTER = 6.2;
const FLOOR_R = 3.4;

/** How thick the ice stands on the table; exaggerated so the sheer edge reads from the plain. */
const ICE_THICK = 3.4;

/** Thickness of a slab lying on the flank against its width. */
const SLAB = 0.15;

/**
 * The rainforest climbing the gullies: `[bearing, how far it runs above the
 * treeline, how wide it is at the bottom]`. Uneven bearings, running upward and
 * narrowing.
 */
const FOREST_TONGUES: [bearing: number, rise: number, half: number][] = [
  [12, 4.0, 3.4],
  [47, 1.5, 4.6],
  [88, 5.0, 2.8],
  [131, 2.5, 4.0],
  [168, 4.5, 3.0],
  [205, 1.0, 4.8],
  [253, 5.5, 2.6],
  [300, 3.0, 4.2],
  [334, 2.0, 3.6],
];

/** The moorland tongues above its own line. */
const MOOR_TONGUES: [bearing: number, rise: number, half: number][] = [
  [28, 3.5, 3.2],
  [72, 4.5, 2.6],
  [143, 2.0, 3.6],
  [192, 4.0, 2.8],
  [265, 2.5, 3.0],
  [318, 4.5, 2.4],
];

/**
 * The ribs and the barrancos: radial ridges and the ravines between them, as
 * slabs lying along the flank. `[bearing, from, to, half-width, dark]`. None
 * crosses the Saddle (a straight slab would bridge the bench), and the ribs
 * break the horizontal hoops that the stacked tapers would otherwise ink.
 */
const LOWER_RIBS: [bearing: number, from: number, to: number, half: number, dark: boolean][] = [
  [4, 14, 26.5, 4.0, false],
  [58, 15, 26.0, 3.4, false],
  [112, 14, 27.0, 4.6, false],
  [163, 15, 26.0, 3.6, false],
  [221, 14, 26.5, 4.2, false],
  [276, 15, 27.0, 3.2, false],
  [326, 14, 26.0, 4.4, false],
  [258, 13, 26.5, 5.2, false], // the three that carry Shira's western mass
  [272, 12, 27.0, 6.0, false],
  [286, 13, 26.0, 4.8, false],
  [22, 7, 23.5, 1.5, true],
  [95, 8, 22.0, 1.3, true],
  [168, 7, 23.5, 1.6, true],
  [240, 8, 21.5, 1.4, true],
  [312, 7, 23.0, 1.5, true],
];

const UPPER_RIBS: [bearing: number, from: number, to: number, half: number, dark: boolean][] = [
  [15, 29, 40.5, 2.6, false],
  [61, 29, 38.0, 2.2, false],
  [104, 30, 41.0, 2.4, false],
  [152, 29, 39.0, 2.8, false],
  [198, 30, 40.5, 2.3, false],
  [243, 29, 37.5, 2.6, false],
  [289, 30, 41.0, 2.2, false],
  [336, 29, 39.5, 2.5, false],
  [38, 30, 39.0, 1.2, true],
  [128, 29, 41.0, 1.1, true],
  [219, 30, 38.5, 1.3, true],
  [311, 29, 40.5, 1.2, true],
];

/**
 * Teeth on the caldera rim: `[bearing, height, half-width]`. Uhuru Peak is on
 * the front-left so the summit of Africa is not round the back.
 */
const TEETH: [bearing: number, height: number, half: number][] = [
  [318, UHURU, 2.2], // Uhuru Peak
  [352, 0.7, 1.8], // Stella Point
  [100, 0.9, 2.0], // Gillman's Point
  [212, 0.5, 1.6],
];

/**
 * The ice, as flat slabs on the table: `[width, depth, x, z, yaw]`. Four
 * overlapping plates hold the west and south, one patch is left in the east,
 * and one sits against the front lip so the white reaches the outline. Every
 * corner stays inside the ellipse the table's 24-gon inscribes (13.0 by 9.3).
 */
const ICE: [w: number, d: number, x: number, z: number, yaw: number][] = [
  [14.0, 7.4, -2.6, -1.4, 0.06], // the Northern Icefield
  [5.5, 5.8, -7.6, 0.4, -0.3], // the western lobe, over the Breach
  [9.0, 5.0, -2.0, 5.0, 0.1], // the Southern Icefield, on the front rim
  [6.0, 3.0, -1.0, 7.4, 0.05], // the Rebmann, right on the plateau's front lip
  [3.4, 2.4, 8.4, 2.0, 0.55], // what is left in the east
];

/**
 * Mawenzi, offset from `MAWENZI_X, MAWENZI_Z`: `[x, z, half-width at the base,
 * half-width at the top, top height, lean, dark]`. Six leaning spires out of one
 * plug; each starts at 16, below the plug's top, so only their points reach the
 * skyline. It stands further out than the real spacing so the notch between it
 * and Kibo is visible.
 */
const MAWENZI_X = 32;
const MAWENZI_Z = -2;
const MAWENZI: [
  x: number,
  z: number,
  base: number,
  top: number,
  y: number,
  lean: number,
  dark: boolean,
][] = [
  [-1.0, 1.0, 4.6, 0.8, 38.0, 0.05, true], // Hans Meyer Peak, the 5,149 m point
  [2.8, -2.0, 3.4, 0.6, 34.5, -0.07, false],
  [-3.6, 3.2, 3.6, 0.7, 33.0, 0.04, true],
  [3.2, 4.0, 2.8, 0.5, 31.0, -0.05, true],
  [5.6, 0.8, 2.6, 0.5, 29.5, 0.08, false],
  [-2.8, -3.2, 3.0, 0.6, 32.0, -0.06, true],
];

/**
 * Shira, as a broken ridge of crags on the western shoulder: `[x, z,
 * half-width, height it reaches]`. The height is a rise above the flank the crag
 * stands on, which keeps a crest a crest on a slope. The crags stay on the bench
 * (x between -26 and -32), where a prism shows a modest downhill face.
 */
const SHIRA: [x: number, z: number, half: number, rise: number][] = [
  [-26.0, 2.6, 3.0, 4.6],
  [-28.2, -2.4, 3.6, 5.4],
  [-27.4, -6.6, 2.6, 3.8],
  [-30.4, 4.4, 2.8, 3.2],
  [-31.6, -5.2, 2.6, 3.4],
  [-29.4, 8.0, 2.4, 2.4],
];

/** The pre-stretch profile radius at a height, linearly interpolated. */
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

/**
 * The inverse: how high the shield's surface is at a pre-stretch radius.
 * Pieces are seated with `groundUnder`, never at a height chosen by hand.
 */
function heightAt(radius: number): number {
  const first = PROFILE[0]!;
  if (radius >= first.r) return 0;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!;
    const b = PROFILE[i]!;
    if (radius >= b.r) return a.y + ((b.y - a.y) * (a.r - radius)) / (a.r - b.r);
  }
  return PROFILE[PROFILE.length - 1]!.y;
}

/** The shield's surface height under a point, in final (stretched) coordinates. */
function surfaceAt(x: number, z: number): number {
  return heightAt(Math.hypot(x / SPREAD, z));
}

/** The lowest the surface gets under a disc of `radius` about a point. */
function groundUnder(x: number, z: number, radius: number): number {
  let lowest = surfaceAt(x, z);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    lowest = Math.min(lowest, surfaceAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
  }
  return lowest;
}

export const kilimanjaro: Monument = {
  id: 'kilimanjaro',
  name: 'Mount Kilimanjaro',
  iso: 'TZA',
  lat: -3.067,
  lon: 37.355,
  realHeight: 5895,
  tier: 'landmark',
  surface: 'none',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper, column, ringWall } = ctx;
    const forest = palette.darkOlive;
    const moor = palette.green;
    const rock = palette.tan;
    const shadow = palette.bark;
    const ice = palette.white;

    const group = new THREE.Group();

    /** Which climate zone a height is in. */
    const zone = (y: number): number => (y < FOREST ? forest : y < MOOR ? moor : rock);

    // --- the shield ---
    // Everything radial lives in here and is stretched east-west together, so
    // the band stack stays seamless. See `SPREAD`.
    const shield = new THREE.Group();
    shield.scale.x = SPREAD;
    group.add(shield);

    for (let i = 0; i + 1 < PROFILE.length; i++) {
      const a = PROFILE[i]!;
      const b = PROFILE[i + 1]!;
      const band = taper(a.r, b.r, b.y - a.y, zone(a.y), SIDES);
      band.position.y = a.y;
      shield.add(band);
    }

    /**
     * A slab lying along the flank between two heights, standing proud of it.
     * A `taper` stands on +Y, so it is held in a group turned about X until its
     * +Y runs up the slope, and squashing the normal axis by `SLAB` makes it a
     * slab. `sink` pushes it in: the chord is straight and the flank is not,
     * so the ends bury and the belly shows.
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

    /** Puts something on a bearing, 0 being the front. */
    const onBearing = (bearing: number, child: Object3D): Group => {
      const pivot = new THREE.Group();
      pivot.rotation.y = bearing * DEG;
      pivot.add(child);
      return pivot;
    };

    // --- the climate zones' ragged edges ---
    for (const [bearing, rise, half] of FOREST_TONGUES) {
      shield.add(onBearing(bearing, flank(FOREST - 5, FOREST + rise, half, half * 0.3, forest, 0.35)));
    }
    for (const [bearing, rise, half] of MOOR_TONGUES) {
      shield.add(onBearing(bearing, flank(MOOR - 4, MOOR + rise, half, half * 0.3, moor, 0.3)));
    }

    // --- the ribs and the barrancos ---
    // A ravine is sunk until little but its floor shows; a rib barely sinks.
    for (const [bearing, from, to, half, dark] of LOWER_RIBS) {
      const color = dark ? shadow : rock;
      shield.add(onBearing(bearing, flank(from, to, half, half * 0.55, color, dark ? 1.3 : 0.3)));
    }
    for (const [bearing, from, to, half, dark] of UPPER_RIBS) {
      const color = dark ? shadow : rock;
      shield.add(onBearing(bearing, flank(from, to, half, half * 0.5, color, dark ? 0.6 : 0.25)));
    }

    // --- the summit ---
    // Out of the shield group, in final coordinates: the rim and the floor carry
    // their own `scale.x`, while the yawed ice slabs must not be sheared.
    const rim = ringWall(RIM_INNER, RIM_OUTER, RIM_WALL, rock, 16);
    rim.position.y = TABLE;
    rim.scale.x = SPREAD;
    group.add(rim);

    // Ash, dark, so the summit reads as a hole from above.
    const floor = column(FLOOR_R, 0.55, shadow, 14);
    floor.position.y = TABLE;
    floor.scale.x = SPREAD;
    group.add(floor);

    const rimRadius = (RIM_INNER + RIM_OUTER) / 2;
    for (const [bearing, height, half] of TEETH) {
      // Tapered: a block on a rim is a merlon, a wedge is a rock. They start at
      // the table so the rim wall runs through them and nothing overhangs.
      const tooth = taper(half, half * 0.45, RIM_WALL + height, rock, 5);
      tooth.position.set(
        Math.sin(bearing * DEG) * rimRadius * SPREAD,
        TABLE,
        Math.cos(bearing * DEG) * rimRadius,
      );
      group.add(tooth);
    }

    // --- the ice ---
    for (const [w, d, x, z, yaw] of ICE) {
      const slab = box(w, ICE_THICK, d, ice);
      slab.position.set(x, TABLE, z);
      slab.rotation.y = yaw;
      group.add(slab);
    }
    // --- Mawenzi ---
    // The plug, then the spires out of it.
    const plug = taper(7.5, 4.2, 16, shadow, 8);
    plug.position.set(MAWENZI_X, 10, MAWENZI_Z);
    group.add(plug);

    for (const [x, z, base, top, y, lean, dark] of MAWENZI) {
      // A five-sided taper's circumradius is its apothem over cos 36 degrees.
      const reach = base / Math.cos(Math.PI / 5);
      const foot = Math.min(16, groundUnder(MAWENZI_X + x, MAWENZI_Z + z, reach));
      const spire = taper(base, top, y - foot, dark ? shadow : rock, 5);
      spire.position.set(MAWENZI_X + x, foot, MAWENZI_Z + z);
      // Leaned, each a different way, like dykes at every angle.
      spire.rotation.z = lean;
      spire.rotation.x = lean * 0.7;
      group.add(spire);
    }

    // --- Shira ---
    for (const [x, z, half, rise] of SHIRA) {
      const reach = half / Math.cos(Math.PI / 5);
      const foot = groundUnder(x, z, reach);
      // Blunt and overlapping so they read as a ridge, not standing stones.
      const crag = taper(half, half * 0.55, surfaceAt(x, z) + rise - foot, rock, 5);
      crag.position.set(x, foot, z);
      group.add(crag);
    }

    return group;
  },
};
