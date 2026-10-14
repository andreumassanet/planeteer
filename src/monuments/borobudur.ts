import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Borobudur.
 *
 * A broad, low mandala whose plan changes shape as it rises: five square
 * galleries stepping in by 2.5 units each, then three plain 20-gon discs (the
 * top square gallery is left 1.6 wider than the first disc, a circle inside a
 * square). Not a second Chichen Itza: that is a steep cone with a temple.
 *
 * Pieces: 36 bell stupas in three rings (16/12/8, half the real counts, spaced
 * 6.4 to 6.5 apart so the rings read), a great stupa 12.2 wide at the summit,
 * and four axial stairways with a dark gate at each level (one tapered mesh per
 * gate, wider than the stair so its edges read as jambs). The stupas are not
 * perforated and have no finial.
 *
 * Each gallery is two meshes: a solid body whose top is the corridor floor and a
 * hollow square parapet half a unit proud of the wall below, in the darkest grey
 * to stand for the corridor's shadow.
 *
 * Tier `building`, 30 of 40 units: flatness is the read (aspect 3.39 against the
 * Castillo's 2.48). The plan is squeezed 1.46x against the height, and the round
 * section is taller than life (14.8 of 30 units) or it vanishes behind the top
 * balustrade. No `realHeight`: 34.5, 35 and 42 m all circulate. There is no
 * front; the +Z stairway is the eastern approach by convention.
 */

// --- the base ---------------------------------------------------------------
/** Half-width across the flats. A 4-gon, so the corners reach x1.414 of this. */
const PLINTH_HALF = 36;
const PLINTH_H = 1;
const FOOT_HALF = 34.8;
const FOOT_H = 1.2;
const FOOT_TOP = PLINTH_H + FOOT_H;

// --- the five square galleries ----------------------------------------------
const GALLERIES = 5;
const RISE = 2.6;
/** Half-width of the lowest gallery wall. */
const OUTER_HALF = 32;
/** The two halves of the corridor: a parapet to stand behind and a floor to walk. */
const PARAPET_T = 1.4;
const CORRIDOR = 1.1;
/** How far each gallery steps in from the one below — parapet plus corridor. */
const INSET = PARAPET_T + CORRIDOR;
const PARAPET_H = 1.5;
/** How far a parapet stands proud of the wall under it: the ledge the ink catches. */
const LIP = 0.5;

const galleryHalf = (i: number): number => OUTER_HALF - INSET * i;
const galleryBase = (i: number): number => FOOT_TOP + RISE * i;
/** The floor the round terraces stand on. */
const SQUARE_TOP = FOOT_TOP + RISE * GALLERIES;

// --- the three circular terraces --------------------------------------------
/**
 * Twenty sides against the galleries' four. Each disc stands 0.7 to 0.8 taller
 * than the ring of bells in front of it, so the three read as three steps.
 */
const CIRCLE_SIDES = 20;
const CIRCLES = [
  { radius: 18.8, height: 3.2 },
  { radius: 14.4, height: 3 },
  { radius: 10.2, height: 2.8 },
];

/**
 * One ring of bells per terrace. `ring` is the radius the stupas stand on: 16.6,
 * 12.3 and 8.2 for counts of 16, 12 and 8 put neighbours 6.5, 6.4 and 6.4 apart.
 * Each ring sits six to eight tenths inside its terrace's rim and four tenths
 * clear of the wall behind it.
 */
const STUPA_SIDES = 8;
const STUPAS = [
  { count: 16, ring: 16.6, foot: 1.5, cap: 0.78, height: 2.2 },
  { count: 12, ring: 12.3, foot: 1.45, cap: 0.75, height: 2.1 },
  { count: 8, ring: 8.2, foot: 1.4, cap: 0.72, height: 2 },
];

/**
 * The great stupa: drum, bell, dome, finial. Four meshes, 5.8 tall and 12.2
 * across against small bells 2.0 to 2.2 tall and 2.8 to 3.0 across. The
 * recession accelerates (0.9 of radius lost per unit of height over the bell,
 * 1.3 over the dome, 1.0 in the finial's first tenth) so it closes as a dome;
 * `dark` puts the darker course on the drum and finial.
 */
const GREAT_SIDES = 12;
const GREAT = [
  { bottom: 6.1, top: 6.1, height: 1.5, sides: GREAT_SIDES, dark: true },
  { bottom: 5.8, top: 4, height: 2, sides: GREAT_SIDES, dark: false },
  { bottom: 3.8, top: 1.9, height: 1.5, sides: GREAT_SIDES, dark: false },
  { bottom: 1.1, top: 0.3, height: 0.8, sides: 8, dark: true },
];

// --- the four stairways ------------------------------------------------------
const STAIR_W = 5.6;
/** The gallery faces stepping in: 2.5 across for every 2.6 up. */
const SLOPE = INSET / RISE;
/** The face line, taken through the middle of the lowest gallery wall. */
const FACE_Y = FOOT_TOP + RISE / 2;
const FACE_Z = OUTER_HALF + LIP;
/** Pulls the whole ramp in, leaving it 2.0 proud of every parapet it crosses. */
const RAMP_SET = -0.6;
const rampZ = (y: number): number => FACE_Z + RAMP_SET - SLOPE * (y - FACE_Y);

const RAMP_Y0 = 4.2;
const RAMP_Y1 = 14.1;
/**
 * The ramp is a square beam laid along the slope, so its climbing face is offset
 * from its centreline up and out by these two; every step nose and gate hangs
 * off the face, not the line.
 */
const RAMP_N = Math.hypot(1, SLOPE);
const RAMP_UP = (STAIR_W / 2) * (SLOPE / RAMP_N);
const RAMP_OUT = (STAIR_W / 2) / RAMP_N;

/**
 * A step nose halfway up each gallery: a nose every 2.6 units, offset 1.3 from
 * a gate every 2.6, gives the stairway an element every 1.3 units for six
 * meshes a side. `NOSE_H` is set against `NOSE_D`: shallower and the nose's
 * outer lip lifts off the sloping face.
 */
const NOSE_W = STAIR_W + 1.6;
const NOSE_H = 1.7;
const NOSE_D = 3;

const GATE_FOOT = 3.3;
const GATE_CAP = 0.85;
const GATE_H = 2.8;
/** Keeps the gate's face just behind the stair's, so the climb passes in front of it. */
const GATE_SET = 0.4;

const LANDING_W = STAIR_W + 2.4;
const LANDING_D = 5.4;
const LANDING_H = 3.6;

export const borobudur: Monument = {
  id: 'borobudur',
  name: 'Borobudur',
  iso: 'IDN',
  lat: -7.608,
  lon: 110.204,
  tier: 'building',
  // The plinth's corner, at 36 x 1.414. Everything else is inside it.
  footprint: 51,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, ringWall, around } = ctx;
    // Andesite, cool on purpose (the Castillo is warm). `band` stripes the square
    // base, `course` belongs to the round crown, `stone` is common to both.
    const stone = palette.bone;
    const band = palette.steel;
    const course = palette.slate;
    const shadow = palette.bark;
    const apron = palette.brown;

    const group = new THREE.Group();

    /**
     * A hollow square ring, the only helper that makes a hole. `ringWall` is
     * lathed and starts on a vertex, so at four sides it is a diamond; half a
     * segment of yaw squares it up, and the radii are then corners.
     */
    const parapet = (halfIn: number, halfOut: number, height: number, y: number): void => {
      const ring = ringWall(halfIn * Math.SQRT2, halfOut * Math.SQRT2, height, band, 4);
      ring.rotation.y = Math.PI / 4;
      ring.position.y = y;
      group.add(ring);
    };

    // --- the base: a broad apron, the processional foot, and its balustrade ---
    group.add(box(PLINTH_HALF * 2, PLINTH_H, PLINTH_HALF * 2, apron));

    const foot = box(FOOT_HALF * 2, FOOT_H, FOOT_HALF * 2, stone);
    foot.position.y = PLINTH_H;
    group.add(foot);

    // Built to the same rule as the five above it, so the base reads as a sixth
    // gallery rather than as a plinth the building happens to sit on.
    parapet(FOOT_HALF - PARAPET_T, FOOT_HALF + LIP, PARAPET_H, FOOT_TOP);

    // --- five square galleries: body, then parapet on the floor it makes ---
    for (let i = 0; i < GALLERIES; i++) {
      const half = galleryHalf(i);
      const base = galleryBase(i);

      const body = box(half * 2, RISE, half * 2, stone);
      body.position.y = base;
      group.add(body);

      parapet(half - PARAPET_T, half + LIP, PARAPET_H, base + RISE);
    }

    // --- three circular terraces, each with its ring of bells ---
    let y = SQUARE_TOP;
    CIRCLES.forEach((circle, i) => {
      const terrace = column(circle.radius, circle.height, course, CIRCLE_SIDES);
      terrace.position.y = y;
      group.add(terrace);
      y += circle.height;

      const ring = STUPAS[i]!;
      const base = y;
      group.add(
        around(ring.count, () => {
          const bell = taper(ring.foot, ring.cap, ring.height, stone, STUPA_SIDES);
          bell.position.set(0, base, ring.ring);
          return bell;
        }),
      );
    });

    // --- the great stupa ---
    for (const part of GREAT) {
      const piece = taper(
        part.bottom,
        part.top,
        part.height,
        part.dark ? course : stone,
        part.sides,
      );
      piece.position.y = y;
      group.add(piece);
      y += part.height;
    }

    // --- four stairways, on the axes, through every terrace ---
    group.add(
      around(4, () => {
        const stair = new THREE.Group();

        stair.add(
          strut(
            new THREE.Vector3(0, RAMP_Y0, rampZ(RAMP_Y0)),
            new THREE.Vector3(0, RAMP_Y1, rampZ(RAMP_Y1)),
            STAIR_W,
            stone,
          ),
        );

        const landing = box(LANDING_W, LANDING_H, LANDING_D, stone);
        landing.position.set(0, PLINTH_H, rampZ(RAMP_Y0) + 0.8);
        stair.add(landing);

        for (let i = 0; i < GALLERIES; i++) {
          // The nose sits on the climbing face at the middle of gallery i.
          const middle = FACE_Y + RISE * i;
          const nose = box(NOSE_W, NOSE_H, NOSE_D, course);
          nose.position.set(0, middle + RAMP_UP - NOSE_H, rampZ(middle) + RAMP_OUT);
          stair.add(nose);

          // The gate at the top, where the stair breaks the parapet: solved back
          // through the offset so its foot lands on the face at the parapet's height.
          const top = galleryBase(i) + RISE;
          // Its foot is sunk `PROUD` into the gallery: standing on the floor,
          // its underside shared a plane with the parapet's and flickered.
          const gate = taper(GATE_FOOT, GATE_CAP, GATE_H + PROUD, shadow, 4);
          gate.position.set(0, top - PROUD, rampZ(top - RAMP_UP) + RAMP_OUT - GATE_SET - GATE_FOOT);
          stair.add(gate);
        }

        return stair;
      }),
    );

    return group;
  },
};
