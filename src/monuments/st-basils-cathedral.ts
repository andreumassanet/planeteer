import type { Monument } from './contract.ts';

/**
 * Saint Basil's Cathedral.
 *
 * Ten buildings on one platform: a tented spire in the middle, nine onion
 * domes crowded around it, no two alike. The nine are written out one at a
 * time in `CHAPELS`, each with its own body, drum, dome and palette, because
 * anything that makes them agree turns it into a generic Orthodox church.
 *
 * Four large chapels stand on the axes, four smaller on the diagonals, and a
 * low annex off-axis at the front left breaks the eight-fold symmetry. Heights
 * step from 14 (annex) to 29.5 (back chapel) to 39.5 (the tent).
 *
 * A dome is a list of courses rather than one `taper`: it springs narrower than
 * its drum, swells past it within the first fifth of its height, then closes to
 * a point under a gilded cross. Each course is turned a few degrees against the
 * one below, so the inked facet edges read as a spiral, and the courses cycle
 * through the dome's colour list, which gives stripes for free.
 *
 * Colour: walls are `clay`, the gable under each drum and the white stripes are
 * `cream`, the tent is `sand` (cream lost its edges among eight cream drums),
 * the terrace `tan`, the gallery `bone`, slots `bark`, the cornice ring under
 * the tent `crimson`. The chromatic range is spent on the domes. `violet` is a
 * liberty: no dome in Moscow is lilac, but one cold surprise does more for "no
 * two of these match" than a ninth shade of orange.
 *
 * Departures: the plan is 14% wider than life (ratio 0.62 against 0.54) so the
 * domes do not touch, and the domes are fat (0.17 of the height against 0.09),
 * as in the Taj Mahal. The bell tower is left out because it would read as a
 * second spire, and the kokoshniki are two plain tapers.
 *
 * Tier `building`, with the Taj Mahal.
 */

const DEG = Math.PI / 180;

/** The raised gallery everything stands on. Two steps, so the ink catches each. */
const TERRACE = { r: 10.6, h: 1.5 };
const GALLERY = { r: 9.9, h: 1.6 };
const DECK = TERRACE.h + GALLERY.h;

/** The central church: brick core, two stepped gables, cornice, tent, lantern. */
const CORE = { r: 4.55, h: 13.4 };
const TENT = { bottom: 3.0, top: 0.6, h: 11.6 };

/**
 * The onion, normalised: `r` is a fraction of the dome's belly, `y` a fraction
 * of its height. Both profiles start at about 0.55 (pinched where the dome
 * springs) and reach full width by a fifth of the way up. The five-course
 * profile is for the four big domes, the four-course one for the small ones.
 */
const ONION_5 = [
  { y: 0.0, r: 0.54 },
  { y: 0.17, r: 1.0 },
  { y: 0.42, r: 0.95 },
  { y: 0.66, r: 0.66 },
  { y: 0.85, r: 0.34 },
  { y: 1.0, r: 0.0 },
];
const ONION_4 = [
  { y: 0.0, r: 0.55 },
  { y: 0.2, r: 1.0 },
  { y: 0.5, r: 0.85 },
  { y: 0.76, r: 0.46 },
  { y: 1.0, r: 0.0 },
];

interface DomeSpec {
  sides: number;
  /** Widest half-width across the flats. Always greater than the drum below it. */
  belly: number;
  height: number;
  /** Degrees each course is turned against the one under it. Sign picks the hand. */
  twist: number;
  courses: 4 | 5;
  /** Cycled course by course: one entry is a plain dome, two are stripes. */
  colors: number[];
}

interface ChapelSpec {
  /** Degrees round the plan. 0 is the front, +Z, as `around` counts. */
  angle: number;
  /** Distance of the chapel's own axis from the cathedral's. */
  reach: number;
  /** Half-width of the porch this one needs under it, if it overhangs the gallery. */
  plinth?: number;
  body: { r: number; h: number; sides: number };
  /** Stacked kokoshniki, bottom half-width, top half-width, height. */
  gables: Array<[number, number, number]>;
  drum: { r: number; h: number };
  dome: DomeSpec;
  /** Crossbar 0 leaves a plain spike, which is all a small dome can carry. */
  cross: { h: number; bar: number };
  /** A dark slot on the outward face: width, height. */
  opening?: [number, number];
}

export const stBasilsCathedral: Monument = {
  id: 'st-basils-cathedral',
  name: "Saint Basil's Cathedral",
  iso: 'RUS',
  lat: 55.752,
  lon: 37.623,
  realHeight: 65,
  tier: 'building',
  footprint: 12.3,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;

    const brick = palette.clay;
    const stone = palette.cream;
    const terrace = palette.tan;
    const paving = palette.bone;
    const shadow = palette.bark;
    const gilt = palette.gold;

    const group = new THREE.Group();
    // `THREE` arrives through the context, so the one type needed is read off a value.
    type Node = Parameters<typeof group.add>[0];

    /** A dome, standing on y = 0, ready to be dropped on top of a drum. */
    const onion = (dome: DomeSpec) => {
      const bulb = new THREE.Group();
      const profile = dome.courses === 5 ? ONION_5 : ONION_4;
      for (let i = 0; i + 1 < profile.length; i++) {
        const a = profile[i]!;
        const b = profile[i + 1]!;
        const course = taper(
          a.r * dome.belly,
          b.r * dome.belly,
          (b.y - a.y) * dome.height,
          dome.colors[i % dome.colors.length]!,
          dome.sides,
        );
        course.position.y = a.y * dome.height;
        course.rotation.y = i * dome.twist * DEG;
        bulb.add(course);
      }
      return bulb;
    };

    /** Gilded cross, standing on y = 0 — on the tip of a dome, in practice. */
    const cross = (height: number, bar: number) => {
      const finial = new THREE.Group();
      const thickness = Math.max(0.14, height * 0.1);
      const shaft = box(thickness, height, thickness, gilt);
      finial.add(shaft);
      if (bar > 0) {
        const arm = box(bar, thickness, thickness, gilt);
        arm.position.y = height * 0.46;
        finial.add(arm);
      }
      return finial;
    };

    // --- the gallery, and the stair that says which way is the front ---
    group.add(column(TERRACE.r, TERRACE.h, terrace, 8));
    const gallery = column(GALLERY.r, GALLERY.h, paving, 8);
    gallery.position.y = TERRACE.h;
    group.add(gallery);

    const lowerStep = box(5.6, 1.05, 1.2, paving);
    lowerStep.position.z = 11.2;
    group.add(lowerStep);
    const upperStep = box(4.9, 2.1, 1.2, paving);
    upperStep.position.z = 10.3;
    group.add(upperStep);

    // --- the central church: its brick core is mostly buried by the chapels, so the tent gets the height ---
    let y = DECK;
    const core = column(CORE.r, CORE.h, brick, 8);
    core.position.y = y;
    group.add(core);
    y += CORE.h;

    for (const [bottom, top, height, color] of [
      [4.8, 4.1, 1.5, brick],
      [4.1, 3.05, 1.7, stone],
    ] as const) {
      const gable = taper(bottom, top, height, color, 8);
      gable.position.y = y;
      group.add(gable);
      y += height;
    }

    const collar = column(3.2, 0.55, palette.crimson, 8);
    collar.position.y = y;
    group.add(collar);
    y += 0.55;

    const tent = taper(TENT.bottom, TENT.top, TENT.h, palette.sand, 8);
    tent.position.y = y;
    group.add(tent);
    y += TENT.h;

    const lantern = column(0.7, 1.4, stone, 6);
    lantern.position.y = y;
    group.add(lantern);
    y += 1.4;

    const crown: DomeSpec = {
      sides: 6,
      belly: 1.15,
      height: 3.6,
      twist: 9,
      courses: 4,
      colors: [gilt],
    };
    const crownDome = onion(crown);
    crownDome.position.y = y;
    group.add(crownDome);
    y += crown.height;

    const crownCross = cross(2.6, 1.0);
    crownCross.position.y = y;
    group.add(crownCross);

    /** The nine chapels, laid out by hand. Body heights, drums, dome widths and colours differ on purpose. */
    const CHAPELS: ChapelSpec[] = [
      {
        // Front. Green and white, spiralled: the one every photograph is of.
        angle: 0,
        reach: 7.6,
        body: { r: 3.3, h: 10.4, sides: 8 },
        gables: [
          [3.55, 3.05, 1.3],
          [3.05, 2.4, 1.5],
        ],
        drum: { r: 1.78, h: 3.5 },
        dome: { sides: 6, belly: 3.05, height: 6.5, twist: 13, courses: 5, colors: [palette.green, stone] },
        cross: { h: 1.5, bar: 0.85 },
        opening: [2.2, 5.4],
      },
      {
        // Right. Blue and white, and wound the other way.
        angle: 90,
        reach: 7.6,
        body: { r: 3.15, h: 9.2, sides: 8 },
        gables: [
          [3.4, 2.95, 1.2],
          [2.95, 2.3, 1.4],
        ],
        drum: { r: 1.7, h: 3.2 },
        dome: { sides: 6, belly: 2.9, height: 6.0, twist: -10, courses: 5, colors: [palette.skyBlue, stone] },
        cross: { h: 1.4, bar: 0.8 },
        opening: [1.6, 4.6],
      },
      {
        // Back, and the tallest of the nine, so it clears the front one in a three-quarter view.
        angle: 180,
        reach: 7.6,
        body: { r: 3.4, h: 11.4, sides: 8 },
        gables: [
          [3.65, 3.1, 1.3],
          [3.1, 2.45, 1.6],
        ],
        drum: { r: 1.85, h: 3.7 },
        dome: { sides: 6, belly: 3.15, height: 6.8, twist: 9, courses: 5, colors: [palette.crimson, stone] },
        cross: { h: 1.6, bar: 0.9 },
        opening: [1.6, 5.8],
      },
      {
        // Left. The gold one: eight facets, no twist, no stripe.
        angle: 270,
        reach: 7.6,
        body: { r: 3.22, h: 9.9, sides: 8 },
        gables: [
          [3.47, 3.0, 1.25],
          [3.0, 2.35, 1.45],
        ],
        drum: { r: 1.74, h: 3.35 },
        dome: { sides: 8, belly: 2.98, height: 6.2, twist: 0, courses: 5, colors: [gilt] },
        cross: { h: 1.45, bar: 0.82 },
        opening: [1.6, 5.0],
      },
      {
        // The four diagonals: smaller, one gable, a plain spike, the hardest twists.
        angle: 45,
        reach: 7.2,
        body: { r: 2.45, h: 7.6, sides: 6 },
        gables: [[2.65, 2.05, 1.2]],
        drum: { r: 1.25, h: 2.5 },
        dome: { sides: 6, belly: 2.15, height: 4.6, twist: 16, courses: 4, colors: [palette.olive] },
        cross: { h: 1.1, bar: 0 },
      },
      {
        angle: 135,
        reach: 7.2,
        body: { r: 2.35, h: 6.9, sides: 6 },
        gables: [[2.55, 1.95, 1.1]],
        drum: { r: 1.18, h: 2.3 },
        dome: { sides: 6, belly: 2.05, height: 4.3, twist: -14, courses: 4, colors: [palette.orange, stone] },
        cross: { h: 1.05, bar: 0 },
      },
      {
        angle: 225,
        reach: 7.2,
        body: { r: 2.4, h: 7.2, sides: 6 },
        gables: [[2.6, 2.0, 1.15]],
        drum: { r: 1.22, h: 2.4 },
        dome: { sides: 6, belly: 2.1, height: 4.45, twist: 12, courses: 4, colors: [palette.violet, stone] },
        cross: { h: 1.08, bar: 0 },
      },
      {
        angle: 315,
        reach: 7.2,
        body: { r: 2.3, h: 6.6, sides: 6 },
        gables: [[2.5, 1.9, 1.05]],
        drum: { r: 1.15, h: 2.2 },
        dome: { sides: 6, belly: 2.0, height: 4.2, twist: -18, courses: 4, colors: [palette.green, palette.crimson] },
        cross: { h: 1.02, bar: 0 },
      },
      {
        // The annex: off the eight-fold rhythm, two units further out on a porch of
        // its own, and short enough that its dome sits below every other.
        angle: 305,
        reach: 10.0,
        plinth: 1.9,
        body: { r: 1.6, h: 4.6, sides: 6 },
        gables: [],
        drum: { r: 0.95, h: 1.9 },
        dome: { sides: 6, belly: 1.68, height: 3.5, twist: 20, courses: 4, colors: [gilt, palette.crimson] },
        cross: { h: 0.9, bar: 0 },
      },
    ];

    for (const spec of CHAPELS) {
      // One pivot per chapel, turned to its angle, with everything inside built on
      // the +Z axis at `reach`.
      const pivot = new THREE.Group();
      pivot.rotation.y = spec.angle * DEG;
      group.add(pivot);

      const stack = (object: Node, level: number): void => {
        object.position.set(0, level, spec.reach);
        pivot.add(object);
      };

      if (spec.plinth !== undefined) {
        stack(column(spec.plinth, DECK, terrace, 6), 0);
      }

      let level = DECK;
      stack(column(spec.body.r, spec.body.h, brick, spec.body.sides), level);
      level += spec.body.h;

      spec.gables.forEach(([bottom, top, height], course) => {
        // Only the course under the drum is limestone; both white built a pale block as wide as the dome.
        stack(taper(bottom, top, height, course === 0 ? brick : stone, spec.body.sides), level);
        level += height;
      });

      stack(column(spec.drum.r, spec.drum.h, stone, spec.dome.sides), level);
      level += spec.drum.h;

      stack(onion(spec.dome), level);
      level += spec.dome.height;

      stack(cross(spec.cross.h, spec.cross.bar), level);

      if (spec.opening) {
        // Proud of the wall rather than sunk into it: nothing in the contract cuts a hole.
        const [width, height] = spec.opening;
        const slot = box(width, height, 0.5, shadow);
        slot.position.set(0, DECK + 0.9, spec.reach + spec.body.r + 0.15);
        pivot.add(slot);
      }
    }

    return group;
  },
};
