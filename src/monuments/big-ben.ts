import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Elizabeth Tower — the clock tower at Westminster, which everybody calls Big
 * Ben after the bell hanging inside it.
 *
 * A square tower with a circle on it is nearly right and completely
 * forgettable, so four things carry this one and every part in the file serves
 * one of them:
 *
 * - **Vertical stripes.** The tower reads tall because it is striped, not
 *   because it is thin. Each face is corner pier / dark slot / rib / dark slot
 *   / corner pier, and that five-band rhythm is picked up again by the clock
 *   stage's corner shafts, the belfry posts and the spire's pinnacles, so one
 *   line runs from the pedestal to the sky. A smooth box of these proportions
 *   is a chimney.
 * - **A clock stage wider than the shaft**, corbelled out on a flare. Without
 *   the step the dials look stuck on; with it they look carried.
 * - **The spire**, 27% of the height, dark against the stone and gilded along
 *   its four ridges. It is most of the character and it is the part a plain
 *   tower has none of.
 * - **The belfry openings** between the two: real gaps between four posts
 *   rather than painted-on panels, which is a dark band with light corners at
 *   any size and costs nine meshes.
 *
 * Traded away, and why:
 *
 * - **The louvres are square-headed.** Arched heads need an extruded shape with
 *   a hole, and the belfry is a dark band the moment it is in shadow.
 * - **The inscription is a plain gilt course.** DOMINE SALVAM FAC REGINAM
 *   NOSTRAM VICTORIAM PRIMAM is illegible below about a metre away; the band it
 *   sits on is not.
 * - **It is stockier than life.** The real tower is 96 m over a 12 m square,
 *   8:1. Across the corner piers this one is 6.4:1, because a truer tower
 *   frames smaller in every view it will ever be seen in and loses the ribs
 *   first.
 * - **The hands are kept**, at 12 triangles each. They are the difference
 *   between a clock and a porthole, which is the entire building.
 */

// --- elevation, in tier units. The spire tip is the `tower` ceiling. ---
const PLINTH_TOP = 4;
const BASE_TOP = 5.8;
const SHAFT_TOP = 31;
const STAGE_BASE = 32.8;
const STAGE_TOP = 42.6;
const GALLERY_TOP = 44;
const BELFRY_TOP = 49.6;
const SPIRE_BASE = 51;
const SPIRE_TOP = 65;
const LANTERN_TOP = 66.9;
const TOP = 69.9;

/** Where the shaft's window slots start and stop, clear of the pedestal and the corbel. */
const SLOT_BASE = 8;
const SLOT_TOP = 29.8;
const STRING_COURSE = 18.5;

// --- half-widths across the flats, which is what `box` and `taper` want ---
const SHAFT_HALF = 4.6;
/** Corner piers are 2.6 square, so their outer face lands at 5.5 — proud of the core. */
const PIER_AT = 4.2;
const STAGE_HALF = 6.4;
const STAGE_CORNER_AT = 5.6;
const BELFRY_HALF = 4.9;
const BELFRY_POST_AT = 4.4;
const SPIRE_HALF = 5.4;
const SPIRE_TIP = 0.45;
const CORNICE_HALF = 6.3;
/** Half-width across the flats of the gable prism: it stands 3r tall and 3.46r wide. */
const GABLE_R = 1.9;
const GABLE_DEPTH = 2.6;

/** Top of the gilt course under the dials. Everything about the dial hangs off it. */
const BAND_TOP = 33.9;
const DIAL_Y = (BAND_TOP + STAGE_TOP) / 2;
const DIAL_RIM = 4.05;
const DIAL_PLATE = 3.15;
/** Twelve sides, not eight: the dial is the one part read as a curve. */
const DIAL_SIDES = 12;

export const bigBen: Monument = {
  id: 'big-ben',
  name: 'Elizabeth Tower',
  iso: 'GBR',
  lat: 51.501,
  lon: -0.125,
  realHeight: 96,
  tier: 'tower',
  footprint: 10,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;
    const stone = palette.sand;
    const brick = palette.tan;
    const iron = palette.darkOlive;
    const gilt = palette.gold;
    const opal = palette.white;
    const hand = palette.ink;

    const group = new THREE.Group();

    /**
     * `around` spins a face to the four sides; this puts a copy on the four
     * corners instead, square with the tower rather than turned to the
     * diagonal. Every vertical accent on the building uses one or the other.
     */
    const atCorners = (make: (x: number, z: number) => ReturnType<typeof box>) => {
      const corners = new THREE.Group();
      for (const x of [1, -1]) {
        for (const z of [1, -1]) corners.add(make(x, z));
      }
      return corners;
    };

    // --- base: one dark ground course, then two steps of stone ---
    group.add(box(13.8, 1.7, 13.8, brick));

    const step = box(12.4, PLINTH_TOP - 1.7, 12.4, stone);
    step.position.y = 1.7;
    group.add(step);

    const pedestal = box(11, BASE_TOP - PLINTH_TOP, 11, stone);
    pedestal.position.y = PLINTH_TOP;
    group.add(pedestal);

    // --- shaft ---
    const core = box(SHAFT_HALF * 2, SHAFT_TOP - BASE_TOP, SHAFT_HALF * 2, brick);
    core.position.y = BASE_TOP;
    group.add(core);

    group.add(
      atCorners((x, z) => {
        const pier = box(2.6, SHAFT_TOP - BASE_TOP, 2.6, stone);
        pier.position.set(x * PIER_AT, BASE_TOP, z * PIER_AT);
        return pier;
      }),
    );

    // One rib and two window slots per face. The slots stand a little proud
    // rather than sinking in: a recess this shallow is invisible under a cel
    // ramp, while a raised dark strip gets its own ink line for free.
    group.add(
      around(4, () => {
        const bay = new THREE.Group();

        const rib = box(1.8, SHAFT_TOP - BASE_TOP, 1.3, stone);
        rib.position.set(0, BASE_TOP, SHAFT_HALF);
        bay.add(rib);

        for (const side of [1, -1]) {
          const slot = box(1.5, SLOT_TOP - SLOT_BASE, 0.55, iron);
          slot.position.set(side * 1.9, SLOT_BASE, SHAFT_HALF);
          bay.add(slot);
        }
        return bay;
      }),
    );

    // The single horizontal in twenty-five units of shaft. It crosses the slots
    // and cuts them in two, which is cheaper than modelling them in two banks.
    const course = box(11.6, 0.9, 11.6, stone);
    course.position.y = STRING_COURSE;
    group.add(course);

    // --- clock stage, corbelled out so the dials read as carried, not stuck on ---
    const corbel = taper(5.6, STAGE_HALF, STAGE_BASE - SHAFT_TOP, stone, 4);
    corbel.position.y = SHAFT_TOP;
    group.add(corbel);

    const stage = box(STAGE_HALF * 2, STAGE_TOP - STAGE_BASE, STAGE_HALF * 2, stone);
    stage.position.y = STAGE_BASE;
    group.add(stage);

    const band = box(13, BAND_TOP - STAGE_BASE, 13, gilt);
    band.position.y = STAGE_BASE;
    group.add(band);

    group.add(
      atCorners((x, z) => {
        const shaft = box(2.4, STAGE_TOP - STAGE_BASE, 2.4, stone);
        shaft.position.set(x * STAGE_CORNER_AT, STAGE_BASE, z * STAGE_CORNER_AT);
        return shaft;
      }),
    );

    // --- the four dials ---
    group.add(
      around(4, () => {
        const face = new THREE.Group();
        // Set back into the stonework so only the rim's depth shows.
        face.position.set(0, DIAL_Y, STAGE_HALF - 0.35);

        // A gilt disc with a slightly deeper white one on top of it: the same
        // read as a ring around a dial, at half a `ringWall`'s triangles.
        const rim = column(DIAL_RIM, 0.7, gilt, DIAL_SIDES);
        rim.rotation.x = Math.PI / 2;
        face.add(rim);

        // Its back starts `PROUD` in front of the rim's: flush, the gilt and
        // the white shared a plane and flickered.
        const plate = column(DIAL_PLATE, 0.85 - PROUD, opal, DIAL_SIDES);
        plate.rotation.x = Math.PI / 2;
        plate.position.z = PROUD;
        face.add(plate);

        // Ten past ten. Both hands straight up would collapse into one stroke;
        // a V is what a clock looks like when it is eight pixels across.
        // Rotating a face about Y keeps its handedness as seen from outside, so
        // all four tell the same time rather than mirroring at the back.
        const pointer = (length: number, width: number, clockwise: number) => {
          const arm = box(width, length, 0.32, hand);
          arm.position.z = 1.05;
          arm.rotation.z = -clockwise;
          return arm;
        };
        face.add(pointer(2, 0.6, -Math.PI / 3));
        face.add(pointer(2.75, 0.48, Math.PI / 3));

        return face;
      }),
    );

    const gallery = box(13.6, GALLERY_TOP - STAGE_TOP, 13.6, stone);
    gallery.position.y = STAGE_TOP;
    group.add(gallery);

    // --- belfry: four posts around a dark box, so the openings are real gaps ---
    const bells = box(BELFRY_HALF * 2, BELFRY_TOP - GALLERY_TOP, BELFRY_HALF * 2, iron);
    bells.position.y = GALLERY_TOP;
    group.add(bells);

    group.add(
      atCorners((x, z) => {
        const post = box(2.8, BELFRY_TOP - GALLERY_TOP, 2.8, stone);
        post.position.set(x * BELFRY_POST_AT, GALLERY_TOP, z * BELFRY_POST_AT);
        return post;
      }),
    );

    group.add(
      around(4, () => {
        const mullion = box(1.2, BELFRY_TOP - GALLERY_TOP, 1.2, stone);
        mullion.position.set(0, GALLERY_TOP, 5.2);
        return mullion;
      }),
    );

    const cornice = box(CORNICE_HALF * 2, SPIRE_BASE - BELFRY_TOP, CORNICE_HALF * 2, stone);
    cornice.position.y = BELFRY_TOP;
    group.add(cornice);

    // --- spire ---
    const spire = taper(SPIRE_HALF, SPIRE_TIP, SPIRE_TOP - SPIRE_BASE, iron, 4);
    spire.position.y = SPIRE_BASE;
    group.add(spire);

    // Lucarnes. A gable is a triangular prism, not a pyramid: a four-sided
    // `taper` puts its point in the middle of the roof, where the spire simply
    // swallows it. A three-sided `column` laid on its side has the point over
    // the front wall where a gable's belongs, and costs four triangles less.
    // After the quarter turn it occupies x +/- 1.73r, y -r to +2r, z 0 to depth.
    group.add(
      around(4, () => {
        const lucarne = column(GABLE_R, GABLE_DEPTH, iron, 3);
        lucarne.rotation.x = Math.PI / 2;
        lucarne.position.set(0, SPIRE_BASE + GABLE_R, CORNICE_HALF - GABLE_DEPTH);
        return lucarne;
      }),
    );

    // Gilded ridges. Four gold lines up a dark cone is the whole reason the
    // spire does not read as a traffic cone.
    group.add(
      atCorners((x, z) =>
        strut(
          new THREE.Vector3(x * SPIRE_HALF, SPIRE_BASE, z * SPIRE_HALF),
          new THREE.Vector3(x * SPIRE_TIP, SPIRE_TOP, z * SPIRE_TIP),
          0.8,
          gilt,
        ),
      ),
    );

    group.add(
      atCorners((x, z) => {
        const pinnacle = taper(0.75, 0.1, 5.2, iron, 4);
        pinnacle.position.set(x * 5.6, SPIRE_BASE, z * 5.6);
        return pinnacle;
      }),
    );

    // The Ayrton Light, gilt because a lantern that is not lit is a knob.
    const lantern = column(1.05, LANTERN_TOP - SPIRE_TOP, gilt, 8);
    lantern.position.y = SPIRE_TOP;
    group.add(lantern);

    const finial = taper(1.05, 0.14, TOP - LANTERN_TOP, iron, 8);
    finial.position.y = LANTERN_TOP;
    group.add(finial);

    return group;
  },
};
