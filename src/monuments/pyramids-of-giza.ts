import type { Group, Mesh, Monument, Vector3 } from './contract.ts';

/**
 * Pyramids of Giza.
 *
 * **The monument is the necropolis, not the pyramid.** One smooth four-sided
 * taper is the emptiest thing this contract can build and it passes every
 * mechanical check. What names Giza from a thumbnail is the *set*: three tombs
 * of visibly different sizes on a diagonal, the middle one wearing a white cap
 * and standing higher than the biggest; and up close, the little pyramids, the
 * temples and causeways and the rows of tombs that make it a city of the dead.
 *
 * ## Sizes true, spacing compressed, bearing turned
 *
 * `placement.ts` turns +Z north and +X west, and the site is laid out on those
 * axes: every pyramid square with the compass, as the real ones are to within
 * a few minutes of arc.
 *
 * - **Sizes are true to each other**: bases 230, 215 and 103 m and heights
 *   138.5, 136.4 and 61 m as they stand today, all on one scale — so Khafre is
 *   0.94 of Khufu's base and 0.98 of its height, and Menkaure 0.45 and 0.44.
 *   The slopes are steepened to about 58 degrees from 52, the previous model's
 *   trade, kept: at the true angle the pyramids are as tall as the Sphinx next
 *   door (27), and the pyramids have to out-top it.
 * - **The spacing is not**, and cannot be. Khufu to Khafre is 475 m in life,
 *   twice Khufu's own base, and Menkaure twice as far; at that spacing
 *   the whole site fits the footprint only with Khufu 12 units tall. Measured
 *   before planning: at the real bearings — Khafre 44 degrees west of south of
 *   Khufu, Menkaure 38 — and with the bases pushed until they nearly touch,
 *   Khufu's half-base cannot pass 12.5. Turning the diagonal toward the west
 *   lets the squares close face to face instead of corner to corner, which is
 *   worth a quarter of the size: here Khafre is 65 degrees west of south of
 *   Khufu and Menkaure 60, at 1.8 times Khafre's distance where life has 2.0,
 *   and Khufu's half-base is 15.6. It is still a diagonal from every side, and
 *   from the north-north-west — the contact sheet's quarter view, which lands
 *   within two degrees of square to the diagonal — the three stand side by
 *   side, largest to smallest, as on every postcard.
 * - **The plateau is part of the model.** It is where the height comes from
 *   that the footprint refuses to give: six units of limestone escarpment under
 *   everything, sloped at its rim rather than a drum, and a bedrock knoll of
 *   three more under Khafre — the real ten metres, exaggerated so the famous
 *   illusion shows: the smaller pyramid has the higher summit.
 *
 * ## What is here
 *
 * - **Khufu**, stripped to its stepped core in twelve courses, with its flat
 *   summit and the survey pole that marks the lost apex; on the north face the
 *   entrance under its pair of gable stones, and along the foot of that face
 *   the few courses of white casing still in place; his two boat pits along
 *   the south face.
 * - **Khafre**, nine courses under the cap of polished casing that still
 *   clings to its top quarter, in `cream`: the single most identifiable detail
 *   on the plateau.
 * - **Menkaure**, its lowest two courses in red Aswan granite, `clay`, with
 *   granite blocks fallen at its foot, and the great vertical gash in its north
 *   face from the demolition attempt of 1196.
 * - **The queens' pyramids**: Khufu's three in a row along his east side, and
 *   Menkaure's three in a row south of his — the eastern one finished as a
 *   true pyramid, the other two left stepped, as they are.
 * - **The temples and causeways**: each king's mortuary temple against his
 *   east face; Khufu's causeway running east off the plateau, Khafre's running
 *   south-east toward the Sphinx and ending at his valley temple, Menkaure's a
 *   stub running east.
 * - **The cemeteries**: the Western Field's grid of mastabas north of Khafre,
 *   and a few of the Eastern beyond Khufu's queens.
 *
 * Where the compressed spacing forced a compromise it is in the temples: Khafre
 * and Menkaure each stand so close to their neighbour's flank that their
 * mortuary temples sit on the southern half of the east face rather than its
 * middle.
 *
 * **No Sphinx.** `great-sphinx` is its own entry in the dataset, 400 m from
 * here; carving it into this model would put two monuments on one card and
 * leave whoever draws that one with nothing to place. Khafre's causeway points
 * at it and stops.
 *
 * **Colour.** `sand` for the limestone core, the courses alternating between
 * it and a tone down so they read as masonry; `cream` for Khafre's casing;
 * `clay` for Menkaure's granite; `tan` for the plateau, as the Sphinx's quarry
 * floor next door is; the temples and causeways a duller `sand`; `brown` for
 * the mastabas; `bark` for the entrance and the boat pits; `steel` for the pole.
 *
 * **Height.** 33.6 to Khafre's point, where the old model was 38.5: its three
 * queens stood north of Khufu and Menkaure's north of him, both on the wrong
 * side, which is what bought its larger pyramids. Here they are where they are,
 * and Khafre's point still clears the Sphinx's 27 by six and a half units.
 *
 * **Budget.** Built as ordinary pieces and drawn by `ctx.merge` as one mesh per
 * colour — the "merging them by material later is a single call" that
 * `contract.ts` made every geometry non-indexed for.
 */

const PLATEAU_SIDES = 16;
/**
 * Half-width across the flats, at the foot of the escarpment and at its top.
 * At 16 sides the foot's corners reach 54.96, just inside the footprint; the
 * top's flats contain every pyramid, the farthest corner being 52.4 out.
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

    // The bedrock knoll under Khafre: square with the pyramid, a unit proud of
    // it at the foot and less at the top, which is all the room Khufu leaves.
    placed(taper(KHAFRE.base + 1.0, KHAFRE.base + 0.4, KNOLL, bedrock, 4), KHAFRE.x, PLATEAU, KHAFRE.z);

    // --- the pyramids ---
    const build = (p: Pyramid): void => {
      // Each course is set back this far from the top of the one below, which
      // leaves a horizontal ledge for the outline to catch.
      const ledge = p.base * p.ledge;
      const capFrom = p.height * (1 - p.cap);
      const radiusAt = (y: number): number => p.apex + (p.base - p.apex) * (1 - y / p.height);
      for (let i = 0; i < p.courses; i++) {
        // An exponent under 1 makes the lower courses the tall ones. Equal
        // courses stripe a pyramid like a ziggurat; these read as masonry.
        const y0 = capFrom * (i / p.courses) ** 0.85;
        const y1 = capFrom * ((i + 1) / p.courses) ** 0.85;
        const summit = i + 1 === p.courses && p.cap === 0;
        const color = i < p.granite ? granite : limestone[i % 2]!;
        placed(taper(radiusAt(y0), summit ? p.apex : radiusAt(y1) + ledge, y1 - y0, color, 4), p.x, p.ground + y0, p.z);
      }
      if (p.cap > 0) {
        // Proud of the core by a third of a ledge: the casing is the finished
        // surface, and the stripped core beneath it is what is set back.
        placed(taper(radiusAt(capFrom) + ledge * 1.3, p.apex, p.height - capFrom, casing, 4), p.x, p.ground + capFrom, p.z);
      }
    };
    for (const p of [KHUFU, KHAFRE, MENKAURE, ...KHUFU_QUEENS, ...MENKAURE_QUEENS]) build(p);

    // --- Khufu's north face: the entrance under its gable stones ---
    // It sits on the first course's ledge, a little east of the centre line as
    // the real one is, dark and set against the second course's face.
    {
      const y = KHUFU.ground + KHUFU.height * (1 / KHUFU.courses) ** 0.85;
      const face = KHUFU.z + KHUFU.apex + (KHUFU.base - KHUFU.apex) * (1 - (y - KHUFU.ground) / KHUFU.height);
      const x = KHUFU.x - 1.0;
      const door = box(1.4, 1.3, 1.9, dark);
      placed(door, x, y, face - 0.3);
      for (const side of [1, -1]) {
        // Leaning back with the course they stand on, their backs on its face.
        draft.add(strut(at(x + side * 1.25, y + 1.45, face - 0.2), at(x, y + 2.5, face - 0.55), 0.5, limestone[0]!));
      }
    }

    // The survey pole on Khufu's flat summit, standing to the lost apex.
    placed(column(0.12, 1.6, palette.steel, 6), KHUFU.x, KHUFU.ground + KHUFU.height, KHUFU.z);

    // The last of Khufu's casing: a few courses of the white limestone still in
    // place along the foot of the north face, proud of the stripped core.
    placed(box(KHUFU.base * 1.2, 0.9, 1.2, casing), KHUFU.x - 1.0, PLATEAU, KHUFU.z + KHUFU.base - 0.35);

    // His boat pits along the south face: the dark slots the ships were found in.
    for (const x of BOAT_PITS) placed(box(8, 0.1, 1.2, dark), x, PLATEAU, KHUFU.z - KHUFU.base - 2.2);

    // Menkaure's red granite casing, fallen and lying where it fell.
    for (const [x, z, yaw] of FALLEN) {
      const block = box(1.5, 0.9, 1.0, granite);
      block.rotation.y = yaw;
      placed(block, x, PLATEAU, z);
    }

    // --- Menkaure's north face: the gash of 1196 ---
    // A dark slab tilted to the face's slope, its front just proud of the
    // courses' lips, running up the lower half of the face.
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
    // Khafre's and Menkaure's are pushed to the south half of the face, clear
    // of the neighbour the compressed spacing stood against it.
    placed(box(5, 2.0, 10, ruin), KHAFRE.x - KHAFRE.base - 2.5 - 0.6, PLATEAU, -7);
    placed(box(4.5, 1.6, 8, ruin), MENKAURE.x - MENKAURE.base - 2.25, PLATEAU, -19);

    // --- the causeways ---
    // Khufu's, straight east off the plateau.
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
