import type { Mesh, Monument } from './contract.ts';

/**
 * The Minaret of Jam — Ghor, Afghanistan.
 *
 * A Ghurid minaret of fired brick, raised around 1190 at the meeting of the
 * Hari and Jam rivers, in a gorge so remote that it was barely known outside
 * the valley until the middle of the twentieth century. It stands alone: what
 * it belonged to — a mosque, perhaps the Ghurid summer capital Firuzkuh — is
 * gone or buried, and the picture everybody has of it is one tapering tower
 * between two steep flanks of rock.
 *
 * ## What carries the recognition
 *
 * 1. **The taper, in stages.** An octagonal base, then a tall first shaft that
 *    narrows by a quarter, then two shorter shafts, each set back over a
 *    corbelled balcony ring, and a small open lantern at the top. Four
 *    diminishing stages read as a minaret; one long cone would read as a
 *    chimney.
 * 2. **The bands.** The brick is laid in relief — geometric strapwork and
 *    Kufic inscription — in horizontal courses up the whole shaft. At 260 px
 *    the strapwork is a texture nobody can draw, so it is drawn as what it
 *    reads as from the valley floor: raised darker courses, one repeating
 *    feature on the surface and no second subdivision across it (see the
 *    masonry note in `docs/traps.md`, *Modelling*).
 * 3. **One turquoise band.** Near the top of the first shaft a band of glazed
 *    turquoise tile carries an inscription naming the sultan, Ghiyath al-Din
 *    Muhammad. It is the only colour on the tower and the only `skyBlue` in
 *    this model.
 *
 * ## Scale and the crop
 *
 * 65 m on the `tower` tier's 70 units, 1.077 units a metre, kept for the
 * tower's own heights and widths: the base, about 9 m across in life, is 10.4
 * units between the octagon's flats here (9.7 m, a little generous so the
 * octagon reads as a plinth under the round shaft). Nothing else on the
 * minaret is stretched.
 *
 * The gorge is cropped hard. Its walls rise far higher than the minaret; what
 * is drawn is two spurs of them, 21 and 14 units, either side and a little
 * behind, so the tower stands framed between rock from the front camera
 * without anything in front of it. They are `brown` stepped masses rather than
 * a cliff, because a cliff 70 units tall beside it would be the subject. They
 * set the footprint, 24 units; the half-diagonal against the height is 0.34.
 *
 * The brick is `sand` toned down to a buff, and the relief courses a step
 * darker again: both warm, so the shaded side of the tower keeps its hue.
 */

const TOP = 69.95;

/** The octagonal base, and the cornice over it. */
const BASE_H = 5.0;
const BASE_R = 5.2; // across the flats; 10.4 units, about 9.7 m
const CORNICE_H = 0.8;
const SHAFT_FOOT = BASE_H + CORNICE_H; // 5.8

/**
 * The three shafts: [foot, head, radius at foot, radius at head], radii across
 * the flats of a 16-sided prism. Each head is a balcony's springing.
 */
const SHAFTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [SHAFT_FOOT, 42.0, 4.7, 3.5],
  [44.2, 54.0, 3.2, 2.85],
  [55.7, 61.5, 2.6, 2.4],
];

/** A balcony ring over a shaft: the corbelled flare and the slab on it. */
const BALCONIES: ReadonlyArray<{ y: number; from: number; to: number; flare: number; slab: number }> = [
  { y: 42.0, from: 3.55, to: 4.4, flare: 1.6, slab: 0.6 },
  { y: 54.0, from: 2.9, to: 3.5, flare: 1.2, slab: 0.5 },
];

/** Relief courses: [shaft, height of the course's foot, course height]. */
const COURSES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11.0, 1.4],
  [0, 18.0, 1.4],
  [0, 25.0, 1.4],
  [0, 32.0, 1.4],
  [1, 48.5, 1.2],
];
/** The turquoise inscription band, high on the first shaft. */
const TILE_FOOT = 38.6;
const TILE_H = 2.0;
/** How far a course stands out of its shaft: well over `PROUD`, so the pen draws it. */
const RELIEF = 0.25;

/** The lantern: a dark core behind eight brick piers, then the cap. */
const LANTERN_FOOT = 61.5;
const LANTERN_H = 5.0;
const PIERS = 8;
const CAP_H = 0.6;

const SIDES = 16;

export const minaretOfJam: Monument = {
  id: 'minaret-of-jam',
  name: 'Minaret of Jam',
  iso: 'AFG',
  lat: 34.3964,
  lon: 64.516,
  realHeight: 65,
  tier: 'tower',
  /** The left spur's outer corner, 23.5 from the axis. */
  footprint: 24,

  build(ctx) {
    const { THREE, palette, tone, column, taper, box, around } = ctx;
    const brick = tone(palette.sand, 0.92);
    const relief = tone(palette.sand, 0.8);
    const tile = palette.skyBlue;
    const shade = palette.bark; // the lantern's openings, in shade all day
    const rock = palette.brown;

    const group = new THREE.Group();
    const place = (mesh: Mesh, x: number, y: number, z: number, yaw = 0): Mesh => {
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      group.add(mesh);
      return mesh;
    };

    /** A shaft's radius at height `y`, read off its own two ends. */
    const radiusOf = (shaft: number, y: number): number => {
      const [foot, head, r0, r1] = SHAFTS[shaft]!;
      return r0 + ((r1 - r0) * (y - foot)) / (head - foot);
    };
    /** A ring laid on a shaft from `y` for `h`, `RELIEF` proud of it, with its slope. */
    const course = (shaft: number, y: number, h: number, color: number): void => {
      const ring = taper(radiusOf(shaft, y) + RELIEF, radiusOf(shaft, y + h) + RELIEF, h, color, SIDES);
      place(ring, 0, y, 0);
    };

    // --- the octagonal base and its cornice ---
    place(taper(BASE_R + 0.2, BASE_R, BASE_H, brick, 8), 0, 0, 0);
    place(column(BASE_R + 0.35, CORNICE_H, relief, 8), 0, BASE_H, 0);

    // --- the three shafts ---
    for (const [foot, head, r0, r1] of SHAFTS) place(taper(r0, r1, head - foot, brick, SIDES), 0, foot, 0);

    // --- the relief courses and the turquoise band ---
    for (const [shaft, y, h] of COURSES) course(shaft, y, h, relief);
    course(0, TILE_FOOT, TILE_H, tile);

    // --- the two balconies: a corbelled flare and a slab ---
    for (const balcony of BALCONIES) {
      place(taper(balcony.from, balcony.to, balcony.flare, relief, SIDES), 0, balcony.y, 0);
      place(column(balcony.to, balcony.slab, brick, SIDES), 0, balcony.y + balcony.flare, 0);
    }

    // --- the lantern: eight piers round a dark core, so the gaps are openings ---
    place(column(1.7, LANTERN_H, shade, 8), 0, LANTERN_FOOT, 0);
    const piers = around(PIERS, () => {
      const pier = box(0.9, LANTERN_H, 1.0, brick);
      pier.position.set(0, LANTERN_FOOT, 2.0);
      return pier;
    });
    // `around` starts on +Z, so a pier, not an opening, is dead on the front.
    group.add(piers);
    const capFoot = LANTERN_FOOT + LANTERN_H;
    place(column(2.6, CAP_H, relief, SIDES), 0, capFoot, 0);
    place(taper(2.2, 0.5, TOP - capFoot - CAP_H, brick, 8), 0, capFoot + CAP_H, 0);

    // --- the gorge: two spurs of its walls, either side and a little behind ---
    // Stacked five-sided masses, each turned off the last so no two faces line
    // up; the left one taller, as the gorge is not symmetrical either.
    place(taper(6.0, 4.4, 9, rock, 5), -16, 0, -1.5, 0.3);
    place(taper(4.4, 3.0, 7, tone(rock, 0.88), 5), -15.2, 9, -2.2, 0.9);
    place(taper(3.0, 1.1, 5, tone(rock, 1.08), 5), -16.2, 16, -2.6, 1.6);
    place(taper(3.6, 2.2, 3, tone(rock, 0.88), 5), -11.6, 0, 3.0, 0.5);

    place(taper(5.6, 4.0, 8, rock, 5), 16, 0, -1.5, -0.4);
    place(taper(4.0, 2.4, 6, tone(rock, 1.08), 5), 16.8, 8, -2.4, -1.1);
    place(taper(3.2, 2.0, 2.4, tone(rock, 0.88), 5), 11.8, 0, 3.4, -0.7);

    return group;
  },
};
