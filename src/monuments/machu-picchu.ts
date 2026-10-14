import type { Monument } from './contract.ts';

/**
 * Machu Picchu.
 *
 * A town on a saddle, so the silhouette is a landscape. Three things carry it:
 * a bowed flight of agricultural terraces across the front (stone below, grass
 * on top, wrapping the nose of the ridge), a grid of small roofless rooms above
 * them (each a four-sided `ringWall`, so the sky is in it; they stand in three
 * ranks on platforms 3.2 units apart), and Huayna Picchu behind, the tallest
 * and the only dark mass in the model.
 *
 * The horn's foot is 44 units across, wider than the 36-unit town, so its flanks
 * reach the ground either side and it reads as standing behind the site. Heights
 * are close to one scale (about 0.11 units per metre) but the cross-ridge axis is
 * stretched about 2.5x so the terrace lines fill the frame, and the peak is
 * pulled in so it clears the rooflines. Eight terraces stand for dozens, so each
 * step is about five times too tall; the total rise (12.4 units) is close to
 * right. The Intihuatana, the Temple of the Sun, the great stairway and the
 * western terraces are left out.
 */

// --- the terrace flight ---

const TERRACES = 8;
const RISE = 1.55;
const RUN = 2.25;
/** Top of the last tread, and the level the town's retaining wall stands on. */
const CREST = TERRACES * RISE;

/**
 * The flight is an arc of this radius centred behind the town, which bows it.
 * Big and far back: 90 units of radius sag only 5 across 61 of width, so the
 * walls stay parallel and read as contour lines.
 */
const ARC_RADIUS = 90;
const ARC_CENTRE_Z = -52;

/**
 * Chords per terrace. Three is the whole bow at 0.6 units of error. Every chord
 * is run 8% long so neighbours interpenetrate instead of leaving a wedge of
 * daylight at the joint.
 */
const CHORDS = 3;
const CHORD_OVERLAP = 1.08;

/**
 * Each terrace is solid from y = 0 and deeper than its own run, so the next
 * terrace up swallows the surplus and nothing can show a hole.
 */
const TERRACE_DEPTH = RUN + 3.6;

/** The grass on top of a terrace, standing 0.2 proud of its wall for the ink line. */
const TREAD = 0.5;
const TREAD_PROUD = 0.2;

/** The flight narrows as it climbs, because the ridge does. */
const HALF_BOTTOM = 30.5;
const HALF_TOP = 19;

// --- the town ---

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

// --- the mountains ---

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
     * centre radius, so a course and its grass stay concentric.
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
        // Local +z is radial after a Y rotation, so the block sits square across the slope.
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
      // carries the grass back to the town's front wall.
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

    // Three aprons rather than one slab, so the 13-unit retaining wall is not
    // the largest blank surface in the model.
    platform(40, TOWN - 5.6, 18, -21, true);
    platform(38, TOWN - 2.8, 17.5, -20.5, true);
    platform(36, TOWN, 17, -20, true);
    platform(32, TOWN + RANK_STEP, 1, -8, true);
    // Each rank overlaps the one below by a unit; exact meeting would z-fight.
    platform(26, TOWN + 2 * RANK_STEP, -7, -18, true);

    /**
     * A rank of rooms, laid left to right with a street between each. The walls
     * are built as one square and stretched by the wrapper. The 45-degree turn
     * squares up `LatheGeometry`'s four-sided ring (it starts at phi = 0); the
     * stretch is applied outside the turn, so it runs along x and z.
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
        // A few degrees of cycling yaw: a perfect grid reads as a car park.
        wrap.rotation.y = ((i % 3) - 1) * 0.04;
        wrap.position.set(x + width / 2, base, z);
        group.add(wrap);
        x += width + STREET;
      });
    };

    // The front rank, behind the esplanade at the head of the terraces.
    rank([4.2, 3.4, 5.6, 3.4, 4.4, 3.4, 4.2], 5, 4.6, TOWN, 12.5, 0);
    // A short block down one side of the plaza; the plaza is the gap it leaves.
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
    // Turned a sixth so the hexagon's corners point front and back, off the horn's flank.
    mountain(SHOULDER, SHOULDER_X, SHOULDER_Z, 6, Math.PI / 6);

    return group;
  },
};
