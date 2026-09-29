import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Borobudur.
 *
 * The trap this file exists to avoid is being read as a second Chichen Itza.
 * Both are stepped stone pyramids and there the resemblance stops: El Castillo
 * is a steep square cone with a temple on the summit, and Borobudur is a
 * mandala you walk — a very broad, very low stone hill whose *plan changes
 * shape as it rises*. Five square galleries at the bottom, three circular
 * terraces above them, and that switch from square to round is the whole
 * argument of the building. Nothing else on the sheet does it.
 *
 * Four things have to survive at thumbnail size, and every unit here is spent
 * on one of them:
 *
 * - **Square below, circular above.** Five square galleries stepping in by 2.5
 *   units each, then three plain discs. The discs are 20-gons where everything
 *   under them is a 4-gon, and the top square gallery is left 1.6 units wider
 *   than the first disc so its four corners stand out empty around it: a circle
 *   inside a square, which is the plan of the whole building in one join.
 * - **The ring of bells.** The perforated stupas standing in concentric circles
 *   on those terraces are the most photographed thing in Indonesia, and they get
 *   36 of this model's 104 meshes without argument. Three rings, and the rings
 *   have to read as rings: the radii are set against the counts so neighbours
 *   sit 6.4 to 6.5 units apart on all three, which is what makes them scan as
 *   one system seen in perspective rather than three scatterings.
 * - **The great stupa**, alone at the centre and the top, 12.2 units wide
 *   against the small bells' 3.0. Without it the summit is a pincushion.
 * - **Four stairways cutting through every terrace, gated at each level.** They
 *   run on the axes, they project through every balustrade they cross, and each
 *   crossing is marked by a dark gate. The gates, not the treads, are what says
 *   "stairway" on this building.
 *
 * **The galleries are corridors, not steps.** This is the detail that separates
 * Borobudur from a wedding cake and it costs exactly two meshes a level: a solid
 * body whose top face is the corridor floor, plus a hollow square parapet
 * standing at that floor's outer edge, half a unit proud of the wall below it.
 * The corridor's *inner* wall is the next gallery's body rising behind the gap.
 * So every terrace edge draws two ink lines with a shadow between them, which is
 * what a walled gallery looks like and what a single stepped-back ledge does
 * not. The parapets take the darkest of the three greys for the same reason: at
 * this size the corridor itself is 1.1 units wide and will not be seen into, so
 * the shadow it should be casting is painted on instead.
 *
 * **Why `building`, at 30 of that tier's 40 units.** The tier question is "from
 * how far should a player be able to name it", and Borobudur answers it the way
 * Angkor Wat does: from across the site, over the trees. It is horizontal, it
 * sits in a plain, and 120 landmark units spent on something three times wider
 * than tall buys a pagoda. Within the tier the model is deliberately short of
 * the 40-unit ceiling, because the ceiling is a budget and *flatness is the read
 * here*: at 40 tall over this base the aspect would be 2.55, and the Castillo's
 * is 2.48, so the two cards would collapse into each other. At 30 it is 3.39 —
 * 37% flatter than the Castillo, 2.8 units wider than it, and three quarters of
 * its height. The contract's fill check passes on the diameter, as it is
 * written to for exactly this kind of shape.
 *
 * Five trades, with their numbers:
 *
 * - **The plan is squeezed 1.46x against the height.** In life the base is about
 *   123 m square and the summit about 35 m up, so corner to corner over height
 *   is near 5.0 — `MAX_ASPECT` is 4 and will not take it. Here it is 3.39. The
 *   squeeze goes into the plan rather than the height because the *sequence*
 *   square-square-square-round-round-round is what names this building, and that
 *   sequence lives on the vertical axis.
 * - **36 stupas, not 72.** Exactly half of each real ring: 32/24/16 becomes
 *   16/12/8. At full count the outer ring's bells would stand 3.3 units apart
 *   and be 3.2 wide — touching — and the ring would fill in to a solid collar.
 *   Half the count is what leaves daylight between them.
 * - **The stupas are not perforated and have no finial.** The lattice that gives
 *   them their name is well under a pixel at this size; a second mesh for a
 *   finial on each would cost 36 more of a 110 budget. One eight-sided taper per
 *   stupa keeps the bell silhouette, which is all that survives anyway.
 * - **A gate is one dark tapered mesh.** Jambs and a lintel would be three each,
 *   sixty for the twenty gates, more than half the tier. Instead each gate is
 *   wider than the stair at its foot — so its edges read as jambs standing clear
 *   on both sides — and closes to a point, which is the kala crown. Dark, so it
 *   reads as an opening the moment the ink lands, the same trick Angkor Wat uses
 *   on its doorways.
 * - **The round section is taller than life.** The three circular terraces and
 *   the crowning stupa are 14.8 of these 30 units, half the model, against
 *   roughly a third of the real building. They were built to scale first and the
 *   whole crown disappeared behind the top square balustrade — five galleries of
 *   busy horizontal banding will always beat a low disc. The exaggeration buys
 *   the one silhouette nothing else on the sheet has.
 *
 * **No `realHeight`, and it is not an omission.** The source list asserts none
 * and it is right not to: the figure depends on whether you count the encased
 * hidden foot at the bottom and the reconstructed crown at the top, and 34.5,
 * 35 and 42 m all circulate for that reason. Two copies of a disputed fact are
 * two chances to be wrong.
 *
 * **There is no front to mark.** Borobudur is a mandala and its symmetry is the
 * point, so unlike the Castillo — whose serpent heads sit on the north stairway
 * only, because that is where they are — nothing here distinguishes one face.
 * The +Z stairway is the eastern approach by convention.
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
 * Twenty sides against the galleries' four, and each disc stands 0.7 to 0.8
 * taller than the ring of bells in front of it, so its wall clears them and the
 * three read as three steps rather than one mound. Roundness is the whole
 * argument up here, which is why it is the one place in the model paying for
 * twenty sides.
 */
const CIRCLE_SIDES = 20;
const CIRCLES = [
  { radius: 18.8, height: 3.2 },
  { radius: 14.4, height: 3 },
  { radius: 10.2, height: 2.8 },
];

/**
 * One ring of bells per terrace. `ring` is the radius the stupas stand on: 16.6,
 * 12.3 and 8.2 against counts of 16, 12 and 8 put neighbours 6.5, 6.4 and 6.4
 * apart, so all three rings read at one rhythm. Each ring is also tucked six to
 * eight tenths inside its own terrace's rim and four tenths clear of the wall
 * behind it, which is the margin that keeps the bells standing on a terrace
 * rather than embedded in one.
 */
const STUPA_SIDES = 8;
const STUPAS = [
  { count: 16, ring: 16.6, foot: 1.5, cap: 0.78, height: 2.2 },
  { count: 12, ring: 12.3, foot: 1.45, cap: 0.75, height: 2.1 },
  { count: 8, ring: 8.2, foot: 1.4, cap: 0.72, height: 2 },
];

/**
 * The great stupa: drum, bell, dome, finial. Four meshes, 5.8 units tall and
 * 12.2 across, against small bells 2.0 to 2.2 tall and 2.8 to 3.0 across. The
 * size difference is the hierarchy and it has to be obvious.
 *
 * The recession accelerates — 0.9 of radius lost per unit of height over the
 * bell, 1.3 over the dome, 1.0 in the finial's first tenth — so the profile
 * closes as a dome rather than running out to the cone that a constant taper
 * gives. `dark` puts the darker course on the drum and the finial, bracketing
 * the pale dome instead of leaving one smooth lump.
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
 * The ramp is a square beam laid along the slope, so its climbing face is
 * offset from its centreline both up and out. These two are that offset, and
 * every step nose and gate below is hung off the face rather than the line —
 * placing them on the centreline buries them.
 */
const RAMP_N = Math.hypot(1, SLOPE);
const RAMP_UP = (STAIR_W / 2) * (SLOPE / RAMP_N);
const RAMP_OUT = (STAIR_W / 2) / RAMP_N;

/**
 * A step nose halfway up each gallery. This is the Castillo's lesson bought
 * cheaply: a smooth ramp reads as a ramp, so the axis needs marks finer than the
 * terraces it crosses. A nose every 2.6 units, offset 1.3 from a gate every 2.6,
 * gives the stairway an element every 1.3 units — half the terrace pitch — for
 * six meshes a side, where a stack of treads fine enough to say the same costs
 * eight on its own.
 *
 * `NOSE_H` is set against `NOSE_D`: any shallower and the nose's outer lip lifts
 * off the sloping face it is supposed to be cut into.
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
    // Andesite, and cool on purpose: the Castillo is sand, tan and clay, and two
    // warm stepped pyramids on one sheet are one card printed twice. The three
    // greys also do the model's zoning, which matters more than the hue: `band`
    // stripes the square base, `course` belongs to the round crown and to
    // nothing below it, and `stone` is the one thing common to both.
    const stone = palette.bone;
    const band = palette.steel;
    const course = palette.slate;
    const shadow = palette.bark;
    const apron = palette.brown;

    const group = new THREE.Group();

    /**
     * A hollow square ring — the only helper that makes a hole. `ringWall` is
     * lathed and starts on a vertex, so at four sides it comes out as a diamond
     * with its corners on the axes; half a segment of yaw squares it up, and the
     * radii are then corners, not flats.
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

          // And the gate at the top of it, where the stair breaks the parapet.
          // Solving back through the offset is what puts the gate's foot exactly
          // on the face at the parapet's own height.
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
