import type { Mesh, Monument, Vector3 } from './contract.ts';

/**
 * Pyramids of Giza.
 *
 * The monument is the necropolis, not the pyramid. What names Giza from a
 * thumbnail is the set: three tombs of visibly different sizes on a diagonal,
 * the middle one wearing a white cap and standing higher than the biggest, and
 * up close the little pyramids, temples, causeways and rows of tombs.
 *
 * Sizes are true to each other (bases 230, 215 and 103 m, heights 138.5, 136.4
 * and 61 m as they stand today, on one scale), with slopes steepened to about 58
 * degrees from 52 so the pyramids out-top the Sphinx (27). The spacing is
 * compressed: `placement.ts` turns +Z north and +X west and every pyramid is
 * square with the compass, but at the real spacing the footprint would hold
 * Khufu only 12 units tall. Turning the diagonal toward the west lets the
 * squares close face to face: Khafre is 65 degrees west of south of Khufu and
 * Menkaure 60, at 1.8 times Khafre's distance (life has 2.0), and Khufu's
 * half-base is 15.6. From the north-north-west (the quarter view) the three
 * stand side by side, largest to smallest. The plateau supplies the height the
 * footprint refuses: six units of limestone escarpment, sloped at its rim, and a
 * bedrock knoll of three more under Khafre, so the smaller pyramid has the
 * higher summit.
 *
 * Khufu is a stepped core in twelve courses with a flat summit, a survey pole,
 * the entrance under its gable stones, a few courses of white casing and two
 * boat pits. Khafre has nine courses under a `cream` cap of polished casing on
 * its top quarter. Menkaure has two courses of red `clay` granite, fallen
 * blocks and the gash from 1196. The queens' pyramids stand east of Khufu and
 * south of Menkaure; each king has a mortuary temple against his east face (on
 * the southern half for Khafre and Menkaure, because of the compressed spacing)
 * and a causeway. The Western Field of mastabas lies north of Khafre. There is no
 * Sphinx: `great-sphinx` is its own entry, and Khafre's causeway points at it.
 *
 * Colour: `sand` for the core with courses alternating a tone down, `cream` for
 * Khafre's casing, `clay` for the granite, `tan` for the plateau, a duller `sand`
 * for temples and causeways, `brown` for mastabas, `bark` for entrance and boat
 * pits, `steel` for the pole. Khafre's point is at 33.6, 6.5 over the Sphinx's 27.
 * Pieces are built ordinarily and drawn by `ctx.merge` as one mesh per colour.
 */

const PLATEAU_SIDES = 16;
/**
 * Half-width across the flats, at the foot of the escarpment and at its top. At
 * 16 sides the foot's corners reach 54.96, inside the footprint; the top's flats
 * contain every pyramid (the farthest corner is 52.4 out).
 */
const PLATEAU_FOOT = 53.9;
const PLATEAU_TOP = 52.6;
const PLATEAU = 6;
const KNOLL = 3;

interface Pyramid {
  x: number;
  z: number;
  /** Top of the ground it stands on. */
  ground: number;
  /** Half-width across the flats at the base. */
  base: number;
  height: number;
  /** Stepped courses of bare core masonry. */
  courses: number;
  /** Half-width of the summit. Only Khafre still ends in a point. */
  apex: number;
  /** Fraction of the height wearing smooth casing at the top. */
  cap: number;
  /** How many of the lowest courses are granite rather than limestone. */
  granite: number;
  /** The setback of each course, as a fraction of the base. The unfinished queens show big ones. */
  ledge: number;
}

const pyramid = (p: Partial<Pyramid> & Pick<Pyramid, 'x' | 'z' | 'base' | 'height'>): Pyramid => ({
  ground: PLATEAU,
  courses: 3,
  apex: 0.4,
  cap: 0,
  granite: 0,
  ledge: 0.05,
  ...p,
});

/** 138.5 m at the scale that makes the 230 m base 31.2 units, steepened. */
const KHUFU = pyramid({ x: -18.8, z: 15.2, base: 15.6, height: 25.0, courses: 12, apex: 1.0 });
const KHAFRE = pyramid({
  x: 12.8, z: 0.45, ground: PLATEAU + KNOLL, base: 14.6, height: 24.6, courses: 9, apex: 0.35, cap: 0.24,
});
const MENKAURE = pyramid({ x: 35.5, z: -16.2, base: 7.0, height: 11.0, courses: 7, apex: 0.6, granite: 2 });

/** Khufu's queens, G1-a to G1-c, north to south along his east side. */
const KHUFU_QUEENS = [
  pyramid({ x: -39.5, z: 6.2, base: 3.5, height: 5.4, apex: 0.5 }),
  pyramid({ x: -39.5, z: -1.3, base: 3.45, height: 5.4, apex: 0.5 }),
  pyramid({ x: -39.5, z: -8.8, base: 3.25, height: 5.2, apex: 0.5 }),
];
/** Menkaure's queens, G3-a to G3-c, east to west south of him: one true pyramid, two left stepped. */
const MENKAURE_QUEENS = [
  pyramid({ x: 29.3, z: -27.8, base: 3.0, height: 4.6, courses: 1, apex: 0.25 }),
  pyramid({ x: 35.5, z: -27.8, base: 2.8, height: 3.9, apex: 0.8, ledge: 0.12 }),
  pyramid({ x: 40.9, z: -27.8, base: 2.1, height: 3.0, apex: 0.7, ledge: 0.12 }),
];

/** Khafre's causeway: from his temple, south-east toward the Sphinx, to his valley temple. */
const CAUSEWAY_FROM = { x: -6.8, z: -7 };
const CAUSEWAY_LENGTH = 35;

/** Khufu's two boat pits along his south face, as x centres; long slots, dark. */
const BOAT_PITS = [-26, -13];
/** Granite casing blocks fallen at Menkaure's foot, as [x, z, yaw]. */
const FALLEN: [number, number, number][] = [[37.8, -8.2, 0.3], [40.4, -8.5, -0.5], [43.7, -14, 0.9], [43.9, -19.6, 0.2]];

/** The Western Field, a grid of mastabas north of Khafre, and a few of the Eastern Field. */
const WESTERN_FIELD_X = [2, 9, 16, 23, 30];
const WESTERN_FIELD_Z = [20.5, 27, 33.5];
const EASTERN_FIELD: [number, number][] = [[-33, -17.5], [-40, -17.5], [-40, -24.5], [-33, -24.5], [-47, -2], [-47, 5]];

export const pyramidsOfGiza: Monument = {
  id: 'pyramids-of-giza',
  name: 'Pyramids of Giza',
  iso: 'EGY',
  lat: 29.979,
  lon: 31.134,
  realHeight: 139,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, strut } = ctx;
    const limestone = [palette.sand, tone(palette.sand, 0.94)];
    const casing = palette.cream;
    const granite = palette.clay;
    const bedrock = palette.tan;
    const ruin = tone(palette.sand, 0.8);
    const road = tone(palette.sand, 0.86);
    const mudbrick = [palette.brown, tone(palette.brown, 1.1)];
    const dark = palette.bark;
    const scar = tone(palette.sand, 0.66);

    const draft = new THREE.Group();
    const at = (x: number, y: number, z: number): Vector3 => new THREE.Vector3(x, y, z);
    const placed = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      draft.add(mesh);
      return mesh;
    };

    // --- the plateau, with a sloped escarpment rather than a drum's wall ---
    placed(taper(PLATEAU_FOOT, PLATEAU_TOP, PLATEAU, bedrock, PLATEAU_SIDES), 0, 0, 0);

    // The bedrock knoll under Khafre: square with the pyramid, a unit proud at the foot.
    placed(taper(KHAFRE.base + 1.0, KHAFRE.base + 0.4, KNOLL, bedrock, 4), KHAFRE.x, PLATEAU, KHAFRE.z);

    // --- the pyramids ---
    const build = (p: Pyramid): void => {
      // Each course is set back from the top of the one below, leaving a ledge for the outline to catch.
      const ledge = p.base * p.ledge;
      const capFrom = p.height * (1 - p.cap);
      const radiusAt = (y: number): number => p.apex + (p.base - p.apex) * (1 - y / p.height);
      for (let i = 0; i < p.courses; i++) {
        // An exponent under 1 makes the lower courses the tall ones; equal courses stripe it like a ziggurat.
        const y0 = capFrom * (i / p.courses) ** 0.85;
        const y1 = capFrom * ((i + 1) / p.courses) ** 0.85;
        const summit = i + 1 === p.courses && p.cap === 0;
        const color = i < p.granite ? granite : limestone[i % 2]!;
        placed(taper(radiusAt(y0), summit ? p.apex : radiusAt(y1) + ledge, y1 - y0, color, 4), p.x, p.ground + y0, p.z);
      }
      if (p.cap > 0) {
        // Proud of the core by a third of a ledge: the casing is the finished surface.
        placed(taper(radiusAt(capFrom) + ledge * 1.3, p.apex, p.height - capFrom, casing, 4), p.x, p.ground + capFrom, p.z);
      }
    };
    for (const p of [KHUFU, KHAFRE, MENKAURE, ...KHUFU_QUEENS, ...MENKAURE_QUEENS]) build(p);

    // --- Khufu's north face: the entrance under its gable stones, on the first course's ledge, a little east of the centre line ---
    {
      const y = KHUFU.ground + KHUFU.height * (1 / KHUFU.courses) ** 0.85;
      const face = KHUFU.z + KHUFU.apex + (KHUFU.base - KHUFU.apex) * (1 - (y - KHUFU.ground) / KHUFU.height);
      const x = KHUFU.x - 1.0;
      const door = box(1.4, 1.3, 1.9, dark);
      placed(door, x, y, face - 0.3);
      for (const side of [1, -1]) {
        // Leaning back with the course they stand on.
        draft.add(strut(at(x + side * 1.25, y + 1.45, face - 0.2), at(x, y + 2.5, face - 0.55), 0.5, limestone[0]!));
      }
    }

    // The survey pole on Khufu's flat summit, standing to the lost apex.
    placed(column(0.12, 1.6, palette.steel, 6), KHUFU.x, KHUFU.ground + KHUFU.height, KHUFU.z);

    // The last of Khufu's casing: a few white courses along the foot of the north face.
    placed(box(KHUFU.base * 1.2, 0.9, 1.2, casing), KHUFU.x - 1.0, PLATEAU, KHUFU.z + KHUFU.base - 0.35);

    // His boat pits along the south face.
    for (const x of BOAT_PITS) placed(box(8, 0.1, 1.2, dark), x, PLATEAU, KHUFU.z - KHUFU.base - 2.2);

    // Menkaure's red granite casing, fallen where it fell.
    for (const [x, z, yaw] of FALLEN) {
      const block = box(1.5, 0.9, 1.0, granite);
      block.rotation.y = yaw;
      placed(block, x, PLATEAU, z);
    }

    // --- Menkaure's north face: the gash of 1196, a dark slab tilted to the face's slope, up the lower half ---
    {
      const slope = Math.atan((MENKAURE.base - MENKAURE.apex) / MENKAURE.height);
      const depth = 1.2;
      const proud = MENKAURE.base * MENKAURE.ledge + 0.1;
      const gash = box(1.8, 5.2, depth, scar);
      gash.rotation.x = -slope;
      const z = MENKAURE.z + MENKAURE.base + (proud - depth / 2) / Math.cos(slope);
      placed(gash, MENKAURE.x, MENKAURE.ground, z);
    }

    // --- the mortuary temples, each against its king's east face (-X) ---
    placed(box(5, 1.8, 10, ruin), KHUFU.x - KHUFU.base - 2.5, PLATEAU, KHUFU.z);
    // Khafre's and Menkaure's are pushed to the south half of the face, clear of the neighbour.
    placed(box(5, 2.0, 10, ruin), KHAFRE.x - KHAFRE.base - 2.5 - 0.6, PLATEAU, -7);
    placed(box(4.5, 1.6, 8, ruin), MENKAURE.x - MENKAURE.base - 2.25, PLATEAU, -19);

    // --- the causeways: Khufu's, straight east off the plateau ---
    placed(box(10.6, 1.1, 2.6, road), KHUFU.x - KHUFU.base - 5 - 5.3, PLATEAU, KHUFU.z);
    // Khafre's, south-east toward the Sphinx, and the valley temple it ends at.
    {
      const causeway = box(2.6, 1.1, CAUSEWAY_LENGTH, road);
      causeway.rotation.y = Math.atan2(-1, -1);
      const half = CAUSEWAY_LENGTH / 2 / Math.SQRT2;
      placed(causeway, CAUSEWAY_FROM.x - half, PLATEAU, CAUSEWAY_FROM.z - half);
      const end = CAUSEWAY_LENGTH / Math.SQRT2;
      placed(box(6, 2.6, 6, ruin), CAUSEWAY_FROM.x - end - 2, PLATEAU, CAUSEWAY_FROM.z - end - 2);
    }
    // Menkaure's, a stub running east past Khafre's south face.
    placed(box(18, 0.9, 2.2, road), 15, PLATEAU, -19);

    // --- the cemeteries: rows of mastabas, long north to south ---
    let n = 0;
    for (const z of WESTERN_FIELD_Z) {
      for (const x of WESTERN_FIELD_X) {
        placed(box(4.6 - (n % 3) * 0.5, 1.6 + ((n * 7) % 4) * 0.3, 5.2, mudbrick[n % 2]!), x, PLATEAU, z);
        n++;
      }
    }
    for (const [x, z] of EASTERN_FIELD) {
      placed(box(4.2 - (n % 2) * 0.4, 1.8 + (n % 3) * 0.3, 5.0, mudbrick[n % 2]!), x, PLATEAU, z);
      n++;
    }

    return ctx.merge(draft);
  },
};
