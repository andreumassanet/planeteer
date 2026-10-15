import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Hallgrímskirkja — Reykjavík.
 *
 * The west front alone: the nave (60 deep) cannot be built, since from 13.4 degrees
 * a 70-unit tower hides a band about 290 deep behind it.
 *
 * The wings are twelve separate slabs, after the columnar basalt of Svartifoss. Eight
 * a side (six read as steps, eight as a sweep; 24 more meshes of an 80-mesh budget,
 * 288 triangles of 1,800), tops running from the tower outward
 *
 *     38.0  31.0  24.8  19.2  14.2   9.8   6.0   3.0
 *
 * with the drop between neighbours falling from 7.0 to 3.0, which makes the sweep
 * concave (a straight line is a ziggurat). Each shaft steps 0.9 further forward than
 * the one inside it so the ink finds every one (coplanar slabs render as one blank
 * rectangle); the five `slate` reveals between them are shadow grooves set back 1.4.
 *
 * Colour: `white` (0xfff2e8, the warm white; `bone` collapses to hueless 76,68,58 in
 * shade). `bone` only where a face sits back: the plinth, the setbacks, the cross.
 * Grooves and louvres are `slate`.
 *
 * 69.8 tall, 26.9 half-diagonal (0.38). Real height 74.5 m. Tier `tower`: the
 * landmark of its city.
 */

/** Top of the tower shaft, where the belfry starts. */
const SHAFT_TOP = 38;

/** The tower's own half-width, and the front and back of it. */
const TOWER = 6.4;
const TOWER_FRONT = 6;
const TOWER_BACK = -6;

/** Half-width of one basalt shaft, and the pitch from one to the next. */
const PIPE = 1.05;
const PITCH = 2.25;
/** Centre of the innermost shaft. */
const PIPE_X = 7.7;
/** How much further forward each shaft stands than the one inside it. */
const SPLAY = 0.62;
const PIPE_DEPTH = 7.2;

/** Tops of the eight shafts, inside to outside. The falling drop is the sweep. */
const PIPES = [38.0, 31.0, 24.8, 19.2, 14.2, 9.8, 6.0, 3.0];

export const hallgrimskirkja: Monument = {
  id: 'hallgrimskirkja',
  name: 'Hallgrímskirkja',
  iso: 'ISL',
  lat: 64.1417,
  lon: -21.9266,
  realHeight: 74.5,
  tier: 'tower',
  surface: 'concrete',
  footprint: 27.6,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const wall = palette.white; // warm white: concrete that survives being in shade
    const set = palette.bone; // the faces that are meant to sit back
    const groove = palette.slate; // the shadow gaps between shafts, and the louvres
    const dark = palette.bark; // the doorway, which is the one real hole
    const face = palette.gold; // the clock

    const group = new THREE.Group();

    const block = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
    ): Mesh => {
      const mesh = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    /** Front face of shaft `i`, counting outward from the tower. */
    const pipeFront = (i: number): number => TOWER_FRONT + 1.2 + i * SPLAY;

    // -----------------------------------------------------------------------
    // 1. The steps: a raised forecourt, two courses, so the shafts do not grow out
    //    of the grass.
    // -----------------------------------------------------------------------
    // The forecourt is held inside the outermost shaft: the footprint cap is 28, and
    // a plate one unit wider each side put the corner at 29.
    const last = PIPES.length - 1;
    const outer = PIPE_X + last * PITCH + PIPE;
    block(-outer, outer, 0, 0.75, TOWER_BACK, pipeFront(last) + 0.8, set);
    block(-outer + 1.0, outer - 1.0, 0.75, 1.5, TOWER_BACK, pipeFront(last) + 0.2, wall);

    // -----------------------------------------------------------------------
    // 2. The wings: twelve shafts, each stepped forward of the one inside it, with a
    //    set-back reveal in each gap.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      for (let i = 0; i < PIPES.length; i++) {
        const x = side * (PIPE_X + i * PITCH);
        const front = pipeFront(i);
        block(x - PIPE, x + PIPE, 1.5, PIPES[i]!, front - PIPE_DEPTH, front, wall);

        // The groove on the inner side of this shaft: as deep as the shorter of the
        // two it separates and set back so it reads as a gap. Its foot sinks `PROUD`
        // into the forecourt and its back stops `PROUD` inside the shafts either side.
        const inner = i === 0 ? SHAFT_TOP : PIPES[i - 1]!;
        const gap = side * (PIPE_X + i * PITCH - PITCH / 2);
        block(
          gap - 0.32,
          gap + 0.32,
          1.5 - PROUD,
          Math.min(inner, PIPES[i]!) - 0.5,
          front - PIPE_DEPTH + PROUD,
          front - 0.5,
          groove,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 3. The tower. One shaft to the belfry, then two setbacks and the spire.
    // -----------------------------------------------------------------------
    block(-TOWER, TOWER, 1.5, SHAFT_TOP, TOWER_BACK, TOWER_FRONT, wall);

    // Three tall slots up the tower face (the stair windows), so an 11-unit slab is
    // not a blank pier. They, the louvres and the door stand `PROUD` out of the face.
    for (const x of [-3.1, 0, 3.1]) {
      block(x - 0.55, x + 0.55, 12, 29.5, TOWER_FRONT - 1.0, TOWER_FRONT + PROUD, groove);
    }

    // The clock, high on the front. A `column` laid on its face is the only disc the
    // contract makes; the hands are boxes standing on the dial.
    const clock = column(2.5, 0.55, face, 8);
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 33.6, TOWER_FRONT + 0.05);
    group.add(clock);
    block(-0.19, 0.19, 33.6, 35.5, TOWER_FRONT + 0.5, TOWER_FRONT + 0.85, groove);
    block(-0.19, 1.5, 33.42, 33.78, TOWER_FRONT + 0.5, TOWER_FRONT + 0.85, groove);

    // The belfry: louvred on all four faces, the one place the tower is open.
    block(-TOWER, TOWER, SHAFT_TOP, 45, TOWER_BACK, TOWER_FRONT, wall);
    for (const x of [-3.6, 0, 3.6]) {
      block(x - 1.25, x + 1.25, 39.2, 44.0, TOWER_FRONT - 0.9, TOWER_FRONT + PROUD, groove);
    }
    // The side louvres stand `PROUD` out of the tower's flank, as the front
    // ones do: flush with it, the two colours shared its plane.
    for (const side of [-1, 1]) {
      block(side * (TOWER + PROUD), side * (TOWER - 0.9), 39.2, 44.0, TOWER_BACK + 1.4, TOWER_FRONT - 1.4, groove);
    }

    // Two setbacks, each a course proud of what it carries, then the spire: 17 units
    // on an 8.4 base, a 2:1 pyramid.
    block(-TOWER - 0.5, TOWER + 0.5, 45, 46.4, TOWER_BACK - 0.5, TOWER_FRONT + 0.5, set);
    block(-5.0, 5.0, 46.4, 48.8, TOWER_BACK + 1.2, TOWER_FRONT - 1.2, wall);
    block(-4.6, 4.6, 48.8, 50.0, TOWER_BACK + 1.6, TOWER_FRONT - 1.6, set);

    const spire = taper(4.2, 0.4, 17.0, wall, 4);
    spire.position.y = 50.0;
    group.add(spire);

    block(-0.16, 0.16, 66.6, 69.8, -0.16, 0.16, set);
    block(-0.85, 0.85, 68.3, 68.7, -0.14, 0.14, set);

    // -----------------------------------------------------------------------
    // 4. The door: a tall arch-headed opening in the tower's foot, in three courses.
    // -----------------------------------------------------------------------
    block(-2.6, 2.6, 1.5, 9.8, TOWER_FRONT - 1.3, TOWER_FRONT + PROUD, dark);
    block(-2.1, 2.1, 9.8, 11.0, TOWER_FRONT - 1.3, TOWER_FRONT + PROUD, dark);
    block(-1.35, 1.35, 11.0, 12.0, TOWER_FRONT - 1.3, TOWER_FRONT + PROUD, dark);
    for (const side of [-1, 1]) {
      block(side * 2.6, side * 3.5, 1.5, 12.6, TOWER_FRONT - 0.55, TOWER_FRONT + 0.4, set);
    }
    block(-3.5, 3.5, 12.6, 13.5, TOWER_FRONT - 0.55, TOWER_FRONT + 0.4, set);

    return group;
  },
};
