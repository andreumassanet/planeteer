import type { Monument } from './contract.ts';

/**
 * Machu Picchu.
 *
 * Not a building — a town on a saddle at 2,430 m, so the silhouette test has to
 * be answered by a landscape rather than by an outline. Three things carry it,
 * and everything in this file serves one of them:
 *
 * - **The flight of agricultural terraces.** Long parallel retaining walls
 *   stepping up the slope, stone below and grass on top, and they are the single
 *   most identifiable thing on the site. They get the whole front of the model
 *   and more than half its meshes. They are bowed, not straight: the flight
 *   wraps the nose of the ridge, and the bow is what separates contour terracing
 *   from the steps of a pyramid.
 * - **A dense grid of small roofless rooms** above them. Roofless is not a
 *   detail to be traded: every room here is a four-sided `ringWall` — a hollow
 *   stone box with the sky in it — because a solid block reads as a shed with a
 *   flat roof, and a site of two hundred sheds looks reconstructed. They stand
 *   in three ranks, each on its own platform 3.2 units above the last, so a
 *   camera at eye level sees three rows of rooms instead of one row and a wall.
 * - **Huayna Picchu behind.** Without the horn this is a ruin anywhere; with it
 *   it is only this place. It is the tallest thing in the model by 15 units and
 *   the only dark mass in it, so it holds the whole silhouette.
 *
 * **Why the horn's foot is 44 units across when its summit is a needle.** The
 * first version was a true sugarloaf, 28 wide, and it failed at thumbnail
 * size: narrower than the 36-unit town in front of it, its flanks never reached
 * the ground, and what was left above the rooftops read as a pointed hat sitting
 * on the last rank of houses. Spreading the foot wider than the town puts two
 * slopes back on the ground either side of it, and the mountain reads as
 * standing behind the site rather than on it. The upper two thirds keep the
 * profile: steep, then pointed.
 *
 * **Scale, and the one axis that is stretched.** Taking the citadel's ~500 m
 * along the ridge against the 55 units from the lowest terrace to the last room
 * gives about 0.11 units per metre, and at that rate Huayna Picchu's ~260 m
 * above the site is 29 units against the 26 modelled here: heights are close to
 * a single honest scale. The plan is not. The citadel is roughly 500 m long and
 * 200 m wide, which at the same rate is 55 by 22 — a ribbon lost inside the
 * footprint circle, seen end-on and almost entirely self-occluding. So the
 * cross-ridge axis is stretched about 2.5x, to 61 units at the foot of the
 * terraces. That is the axis carrying the least recognition (nobody names this
 * place by how narrow the ridge is) and it is what lets the axis carrying the
 * most — the parallel terrace lines, read broadside — fill the frame. Every
 * photograph of the site makes the same trade by standing at the far end of it.
 *
 * The peak is pulled in as well as spread: its summit is about 600 m from the
 * main plaza in life and 33 units here against the 66 the scale asks for, so it
 * climbs at 39 degrees off the plaza where the mountain climbs at about 23. It
 * has to clear the rooflines while staying inside the footprint, and a horn that
 * does not clear them is not in the picture at all.
 *
 * Eight terraces stand for a flight that runs to dozens; each modelled step is
 * therefore about five times too tall, while the flight's total rise (12.4
 * units, ~110 m) is close to right.
 *
 * Traded away, in order of how much it hurt: the Intihuatana, the Temple of the
 * Sun and the Sacred Rock — the three things a visitor is actually shown, all of
 * them single stones under two units here and invisible past ten; the thatched
 * roofs on the restored huts, which would have contradicted the roofless read;
 * the great stairway and the flying steps, finer than the terrace walls that
 * carry them; and the second flight of terraces on the western flank, which
 * costs as much as the first and reads as the same thing twice.
 */

// --- the terrace flight ---------------------------------------------------

const TERRACES = 8;
const RISE = 1.55;
const RUN = 2.25;
/** Top of the last tread, and the level the town's retaining wall stands on. */
const CREST = TERRACES * RISE;

/**
 * The flight is an arc of this radius centred behind the town, which is what
 * bows it. Big and far back on purpose: 90 units of radius sag only 5 across 61
 * of width, so the walls stay parallel and read as contour lines rather than as
 * a bowl.
 */
const ARC_RADIUS = 90;
const ARC_CENTRE_Z = -52;

/**
 * Chords per terrace. Three is the whole bow at 0.6 units of error, and the
 * joints do not stack into a crease because each terrace spans a different
 * angle. Every chord is run 8% long so its neighbours interpenetrate instead of
 * leaving a wedge of daylight at the joint.
 */
const CHORDS = 3;
const CHORD_OVERLAP = 1.08;

/**
 * Each terrace is solid from y = 0 rather than a band on the one below, and
 * deeper than its own run, so the next terrace up — which is taller — swallows
 * the surplus. Nothing is hollow, nothing can show a hole, and it costs the same
 * twelve triangles either way.
 */
const TERRACE_DEPTH = RUN + 3.6;

/** The grass on top of a terrace, standing 0.2 proud of its wall for the ink line. */
const TREAD = 0.5;
const TREAD_PROUD = 0.2;

/** The flight narrows as it climbs, because the ridge does. */
const HALF_BOTTOM = 30.5;
const HALF_TOP = 19;

// --- the town -------------------------------------------------------------

/** The urban sector stands 0.8 above the last tread. That step is the dividing wall. */
const TOWN = CREST + 0.8;
const RANK_STEP = 3.2;
/** Grass laid over each platform. Thin: it is a colour, not a slab. */
const SKIN = 0.4;

/** The room the whole grid is scaled from: a 4 by 4 box with 0.75 of wall. */
const ROOM_SIDE = 4;
const ROOM_WALL = 0.75;
const ROOM_OUTER = (ROOM_SIDE / 2) * Math.SQRT2;
const ROOM_INNER = (ROOM_SIDE / 2 - ROOM_WALL) * Math.SQRT2;
const STREET = 1;

// --- the mountains --------------------------------------------------------

const PEAK_Z = -28;
/** Broad at the foot, steep through the middle, a needle at the top. */
const HORN = [
  { bottom: 22, top: 16.5, height: 13 },
  { bottom: 16.5, top: 9.5, height: 16 },
  { bottom: 9.5, top: 1.8, height: 10.6 },
];
/** The far side of the col. Less than half the horn's height: a shoulder, not a rival. */
const SHOULDER = [
  { bottom: 7.5, top: 5.2, height: 10 },
  { bottom: 5.2, top: 1.4, height: 7 },
];
const SHOULDER_X = -30;
const SHOULDER_Z = -16;

export const machuPicchu: Monument = {
  id: 'machu-picchu',
  name: 'Machu Picchu',
  iso: 'PER',
  lat: -13.163,
  lon: -72.545,
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, taper, ringWall } = ctx;
    const stone = palette.tan; // every retaining wall on the site
    const walling = palette.bone; // the rooms, the one pale thing here
    const grass = palette.green; // treads and the town's open ground
    const rock = palette.darkOlive; // both mountains

    const group = new THREE.Group();

    /**
     * One bowed course of blocks: `face` is the arc radius of its front, `half`
     * the half-width it has to span. Angles are measured at the course's own
     * centre radius, so a course and the grass on top of it stay concentric.
     */
    const course = (
      face: number,
      half: number,
      base: number,
      height: number,
      depth: number,
      color: number,
    ): void => {
      const centre = face - depth / 2;
      const spread = Math.asin(Math.min(half / centre, 1));
      const step = (2 * spread) / CHORDS;
      const chord = 2 * centre * Math.sin(step / 2) * CHORD_OVERLAP;
      for (let i = 0; i < CHORDS; i++) {
        const angle = -spread + step * (i + 0.5);
        const block = box(chord, height, depth, color);
        block.position.set(
          centre * Math.sin(angle),
          base,
          ARC_CENTRE_Z + centre * Math.cos(angle),
        );
        // Local +z is radial after a Y rotation, which is what makes the block
        // sit square across the slope instead of skewed to it.
        block.rotation.y = angle;
        group.add(block);
      }
    };

    for (let i = 0; i < TERRACES; i++) {
      const face = ARC_RADIUS - i * RUN;
      const top = (i + 1) * RISE;
      const half = HALF_BOTTOM + ((HALF_TOP - HALF_BOTTOM) * i) / (TERRACES - 1);

      course(face, half, 0, top - TREAD, TERRACE_DEPTH, stone);
      // A tread is only as deep as the step it caps, except the topmost, which
      // has to carry the grass all the way back to the town's front wall.
      const depth = i === TERRACES - 1 ? TERRACE_DEPTH : RUN;
      course(face + TREAD_PROUD, half, top - TREAD, TREAD, depth + TREAD_PROUD, grass);
    }

    // --- the platforms the town is built on ---
    const platform = (
      width: number,
      top: number,
      front: number,
      back: number,
      turf: boolean,
    ): void => {
      const depth = front - back;
      const z = (front + back) / 2;
      const body = box(width, turf ? top - SKIN : top, depth, stone);
      body.position.z = z;
      group.add(body);
      if (!turf) return;
      const skin = box(width, SKIN, depth, grass);
      skin.position.set(0, top - SKIN, z);
      group.add(skin);
    };

    // Three aprons rather than one slab. The town's retaining wall is 13 units
    // tall down both flanks and, built in one piece, that is the largest blank
    // surface in the model; stepped in 2.8s with grass on each ledge it reads as
    // more of the same terracing, which is what the real flanks are.
    platform(40, TOWN - 5.6, 18, -21, true);
    platform(38, TOWN - 2.8, 17.5, -20.5, true);
    platform(36, TOWN, 17, -20, true);
    platform(32, TOWN + RANK_STEP, 1, -8, true);
    // Overlapping the rank above into the one below by a unit: two platforms
    // meeting exactly would put two faces in the same plane and z-fight.
    platform(26, TOWN + 2 * RANK_STEP, -7, -18, true);

    /**
     * A rank of rooms, laid left to right with a street between each.
     *
     * The walls are built as one square and stretched by the wrapper, so the
     * lathe underneath is always the same 32 triangles. The 45-degree turn is
     * not decoration: `LatheGeometry` starts at phi = 0, so a four-sided ring
     * comes out as a diamond with its corners on the axes, and the turn squares
     * it up. The stretch is applied outside that turn, so it runs along x and z
     * as intended rather than diagonally.
     */
    const rank = (
      widths: number[],
      depth: number,
      height: number,
      base: number,
      z: number,
      centreX: number,
    ): void => {
      const span = widths.reduce((a, b) => a + b, 0) + STREET * (widths.length - 1);
      let x = centreX - span / 2;
      widths.forEach((width, i) => {
        const wrap = new THREE.Group();
        const walls = ringWall(ROOM_INNER, ROOM_OUTER, height, walling, 4);
        walls.rotation.y = Math.PI / 4;
        wrap.add(walls);
        wrap.scale.set(width / ROOM_SIDE, 1, depth / ROOM_SIDE);
        // A few degrees of yaw, cycling: the blocks of the real town follow the
        // ground, and a perfect grid reads as a car park.
        wrap.rotation.y = ((i % 3) - 1) * 0.04;
        wrap.position.set(x + width / 2, base, z);
        group.add(wrap);
        x += width + STREET;
      });
    };

    // The front rank, behind the esplanade at the head of the terraces.
    rank([4.2, 3.4, 5.6, 3.4, 4.4, 3.4, 4.2], 5, 4.6, TOWN, 12.5, 0);
    // A short block down one side of the plaza. The plaza is the gap it leaves:
    // twenty units by nine of open grass, the only part of the town that is
    // empty on purpose.
    rank([3.4, 4.6, 3.4], 4.4, 4.2, TOWN, 5.5, -9);
    rank([3.6, 4.8, 3.6, 5, 3.6, 4.2], 4.6, 4.6, TOWN + RANK_STEP, -3.5, 0);
    rank([4, 3.4, 4.8, 3.4, 4], 4.2, 4.4, TOWN + 2 * RANK_STEP, -11, 0);

    // --- Huayna Picchu, and the shoulder that makes the site a saddle ---
    const mountain = (
      sections: { bottom: number; top: number; height: number }[],
      x: number,
      z: number,
      sides: number,
      turn: number,
    ): void => {
      let y = 0;
      for (const section of sections) {
        const cone = taper(section.bottom, section.top, section.height, rock, sides);
        cone.position.set(x, y, z);
        cone.rotation.y = turn;
        group.add(cone);
        y += section.height;
      }
    };

    mountain(HORN, 0, PEAK_Z, 8, 0);
    // Turned a sixth so the hexagon's corners point front and back rather than
    // sideways, which keeps its foot off the horn's flank.
    mountain(SHOULDER, SHOULDER_X, SHOULDER_Z, 6, Math.PI / 6);

    return group;
  },
};
