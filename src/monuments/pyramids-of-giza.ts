import type { Monument } from './contract.ts';

/**
 * Pyramids of Giza.
 *
 * **The monument is the group, not the pyramid.** One smooth four-sided taper
 * is the emptiest thing this contract can build and it passes every mechanical
 * check, because a cone fills a bounding box as well as a cathedral does. What
 * names Giza from a thumbnail is the *set*: three tombs of visibly different
 * sizes stepping away on a diagonal, the middle one wearing a white cap.
 *
 * Three departures from the survey, all forced by the 55-unit footprint, and
 * all of them the same trade — the site is a kilometre across and 139 m tall,
 * an aspect of seven, so it cannot be modelled whole:
 *
 * - **The spacing is compressed.** Khufu and Khafre stand 500 m apart in life,
 *   more than twice Khufu's own base. Keeping that spacing inside the footprint
 *   leaves Khufu fourteen units tall — twice the avatar. Here the bases touch,
 *   which is the compression every photograph of the site already performs.
 * - **The slope is steepened**, from 51.8 degrees to about 58. At the true
 *   angle the largest pyramid that fits the footprint is 23 units tall against
 *   109 wide: a low ridge, and a `landmark` that reads as a kerb. Steeper is
 *   the smaller lie than flatter, because the thing still reads as a pyramid.
 * - **The plateau is part of the model.** It is not scenery. It is where the
 *   height comes from that the footprint refuses to give — five free units
 *   under everything, four and a half more under Khafre — and it is the honest
 *   reason Khafre's apex out-tops Khufu's while its pyramid is the smaller one.
 *
 * What is spent instead of size:
 *
 * - **Stepped courses.** Each pyramid is a stack of frusta, each set back a
 *   ledge from the one below. That is what the stripped core actually looks
 *   like, and every course boundary is a horizontal ink line the outline draws
 *   for free. A single taper has one silhouette; Khufu has six.
 * - **Khafre's casing cap**, in `cream` against `sand`. The one surviving patch
 *   of polished limestone on the plateau, and the single most identifiable
 *   detail on the site. It costs one mesh.
 * - **Menkaure's granite skirt**, in `clay`: its lowest casing courses are red
 *   Aswan granite, left unfinished. One colour change on the smallest pyramid,
 *   which is also what stops it reading as a spare cone.
 * - The queens' pyramids, Khafre's causeway running off toward the valley, and
 *   the mastaba field. Small, but they are what turn three shapes into a
 *   necropolis and fill the foreground the pyramids leave empty.
 *
 * **No Sphinx.** `great-sphinx` is its own entry in the dataset, 400 m from
 * here; carving it into this model would put two monuments on one card and
 * leave whoever draws that one with nothing to place.
 */

const PLATEAU_SIDES = 16;
/**
 * Half-width across the flats. At 16 sides the corners sit at 54.7, just inside
 * the footprint, and the flats are the containing circle for everything on top:
 * anything within 53.6 of the axis is provably standing on the plateau.
 */
const PLATEAU_RADIUS = 53.6;
const PLATEAU_HEIGHT = 5;

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
  /** Half-width of the summit. Every pyramidion at Giza is gone; only Khafre still ends in a point. */
  apex: number;
  /** Fraction of the height wearing smooth casing stone at the top. */
  cap: number;
  /** How many of the lowest courses are granite rather than limestone. */
  granite: number;
}

/**
 * The three, front-left to back-right. The heights keep the real ratios of 139,
 * 136 and 65 metres, and the *placement* carries the rest: Khufu nearest and
 * largest, Menkaure furthest and smallest, so perspective widens a gap the
 * footprint had to close.
 */
const KHUFU: Pyramid = {
  x: -27.5, z: 6.5, ground: PLATEAU_HEIGHT,
  base: 19, height: 30.5, courses: 6, apex: 1.1, cap: 0, granite: 0,
};

/** 9.5, not 5: the knoll under it is why the smaller pyramid has the higher summit. */
const KHAFRE: Pyramid = {
  x: 11, z: -6, ground: 9.5,
  base: 17, height: 29, courses: 4, apex: 0.5, cap: 0.26, granite: 0,
};

const MENKAURE: Pyramid = {
  x: 38.5, z: -15.5, ground: PLATEAU_HEIGHT,
  base: 9, height: 14.5, courses: 4, apex: 0.8, cap: 0, granite: 1,
};

/** Queens' pyramids, in a row off Khufu's front face, largest first. */
const QUEENS: Pyramid[] = [-36, -26, -16.5].map((x, i) => ({
  x, z: 31, ground: PLATEAU_HEIGHT,
  base: 4 - i * 0.4, height: 6.4 - i * 0.65, courses: 2, apex: 0.4, cap: 0, granite: 0,
}));

/** Menkaure's three subsidiaries. One was finished as a true pyramid; the others were left stepped. */
const SUBSIDIARIES: Pyramid[] = [32, 38, 44].map((x, i) => ({
  x, z: -1.5, ground: PLATEAU_HEIGHT,
  base: 2.8 - i * 0.2, height: 4.2 - i * 0.3, courses: i === 0 ? 1 : 2, apex: i === 0 ? 0.3 : 1,
  cap: 0, granite: 0,
}));

/** Khafre's causeway, from his mortuary temple down toward the valley. */
const CAUSEWAY_FROM = { x: 19.5, z: 16.5 };
const CAUSEWAY_TO = { x: 32, z: 25.5 };

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
    const { THREE, palette, box, column, taper } = ctx;
    const sand = palette.tan;
    const limestone = palette.sand;
    const casing = palette.cream;
    const granite = palette.clay;
    const mudbrick = palette.brown;

    const group = new THREE.Group();
    group.add(column(PLATEAU_RADIUS, PLATEAU_HEIGHT, sand, PLATEAU_SIDES));

    // The bedrock knoll under Khafre. It can only stand a unit proud of the
    // pyramid it carries — the neighbouring bases are two units away — so it is
    // square with the pyramid and does its work by height rather than by width.
    const knoll = taper(KHAFRE.base + 1, KHAFRE.base + 0.4, KHAFRE.ground - PLATEAU_HEIGHT, sand, 4);
    knoll.position.set(KHAFRE.x, PLATEAU_HEIGHT, KHAFRE.z);
    group.add(knoll);

    const pyramid = (p: Pyramid): void => {
      // Each course is set back this far from the top of the one below, which is
      // what leaves a horizontal ledge for the outline to catch.
      const ledge = p.base * 0.05;
      const capFrom = p.height * (1 - p.cap);
      const radiusAt = (y: number) => p.apex + (p.base - p.apex) * (1 - y / p.height);

      for (let i = 0; i < p.courses; i++) {
        // Exponent under 1 makes the lower courses the tall ones. Equal courses
        // stripe the pyramid like a ziggurat; these read as masonry.
        const y0 = capFrom * (i / p.courses) ** 0.85;
        const y1 = capFrom * ((i + 1) / p.courses) ** 0.85;
        const summit = i + 1 === p.courses && p.cap === 0;
        const course = taper(
          radiusAt(y0),
          summit ? p.apex : radiusAt(y1) + ledge,
          y1 - y0,
          i < p.granite ? granite : limestone,
          4,
        );
        course.position.set(p.x, p.ground + y0, p.z);
        group.add(course);
      }

      if (p.cap > 0) {
        // Proud of the core by a third of a ledge: the casing is the finished
        // surface, and the stripped core beneath it is what is set back.
        const cap = taper(radiusAt(capFrom) + ledge * 1.3, p.apex, p.height - capFrom, casing, 4);
        cap.position.set(p.x, p.ground + capFrom, p.z);
        group.add(cap);
      }
    };

    for (const p of [KHUFU, KHAFRE, MENKAURE, ...QUEENS, ...SUBSIDIARIES]) pyramid(p);

    // --- Khafre's mortuary temple, causeway and valley temple ---
    const dx = CAUSEWAY_TO.x - CAUSEWAY_FROM.x;
    const dz = CAUSEWAY_TO.z - CAUSEWAY_FROM.z;
    const bearing = Math.atan2(dx, dz);

    const temple = box(16, 3.6, 7, mudbrick);
    temple.position.set(KHAFRE.x, PLATEAU_HEIGHT, 16.5);
    group.add(temple);

    const causeway = box(5, 2.6, Math.hypot(dx, dz), mudbrick);
    causeway.position.set(
      (CAUSEWAY_FROM.x + CAUSEWAY_TO.x) / 2,
      PLATEAU_HEIGHT,
      (CAUSEWAY_FROM.z + CAUSEWAY_TO.z) / 2,
    );
    causeway.rotation.y = bearing;
    group.add(causeway);

    const valleyTemple = box(9, 4.5, 7, mudbrick);
    valleyTemple.position.set(34.5, PLATEAU_HEIGHT, 27.5);
    valleyTemple.rotation.y = bearing;
    group.add(valleyTemple);

    // --- the eastern cemetery: two ranks of mastabas in the foreground ---
    for (let rank = 0; rank < 2; rank++) {
      for (let i = 0; i < 5; i++) {
        const mastaba = box(5.6 - (i % 3) * 0.6, 2.2 + ((i + rank) % 3) * 0.5, 4, mudbrick);
        mastaba.position.set(-8 + i * 8.5, PLATEAU_HEIGHT, 33 + rank * 8);
        group.add(mastaba);
      }
    }

    return group;
  },
};
