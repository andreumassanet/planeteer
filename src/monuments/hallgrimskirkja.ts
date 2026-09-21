import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Hallgrímskirkja — Reykjavík.
 *
 * **Why Iceland:** the first sixty-five landmarks put nothing north of
 * Copenhagen and nothing at all in the North Atlantic. Iceland, Norway, Sweden,
 * Finland, Greenland and the Faroes were one continuous blank on the map behind
 * `M`, and the country with nine towns in the whole gazetteer had no reason to
 * fly to it. This is Reykjavík's one unmistakable object and it is visible from
 * most of the city.
 *
 * ---------------------------------------------------------------------------
 * The crop: the west front and nothing else
 * ---------------------------------------------------------------------------
 *
 * The church is a long nave with a tower at one end, and **the nave cannot be
 * built here** — not because of the tier but because of the camera. The contact
 * sheet looks from 13.4 degrees up, so a 70-unit tower at the front hides a band
 * roughly 290 units deep behind it, and the nave is 60. Every triangle spent on
 * it would render as nothing. So the model is the west front alone, which is
 * also the only elevation anybody photographs.
 *
 * ---------------------------------------------------------------------------
 * The wings are the whole silhouette, and they are twelve separate slabs
 * ---------------------------------------------------------------------------
 *
 * Guðjón Samúelsson took the shape from **columnar basalt** — the hexagonal
 * organ-pipe cliffs at Svartifoss — and a stepped concave sweep of shafts either
 * side of the tower is the only thing about this building that has to survive at
 * thumbnail size. Six shafts a side, and their tops run
 *
 *     38.0  31.0  24.8  19.2  14.2   9.8   6.0   3.0
 *
 * from the tower outward: the *drop* between neighbours falls from 7.0 to 3.0,
 * which is what makes the sweep concave rather than a ramp. A straight line of
 * them is a staircase and reads as a ziggurat.
 *
 * **Eight a side and not six**, and the count was chosen by looking. Six read as
 * steps; eight read as a sweep, for 24 more meshes of an 80-mesh budget and 288
 * triangles of 1,800. This is the Guggenheim's finding rather than the Space
 * Needle's: cutting joints to reduce ink can make a surface read as broken rock
 * where more of them read as courses on something built, and a wall of cast
 * concrete shafts is as built as anything on the planet.
 *
 * **Each shaft also steps 0.9 further forward than the one inside it**, and
 * that is not styling, it is the coplanar-mesh trap: `OutlineEffect` hulls
 * every mesh separately, so twelve slabs sharing one front plane render as one
 * blank white rectangle with no ink between them — which is exactly what
 * happened to Niagara's American curtain. Stepped in depth, every shaft gets
 * its own line down its full height, and the forward splay is true of the
 * building. The five `slate` reveals between them are the shadow grooves, set
 * back 1.4 so they read as gaps rather than as stripes.
 *
 * ---------------------------------------------------------------------------
 * Colour
 * ---------------------------------------------------------------------------
 *
 * The building is white concrete, and `white` here is 0xfff2e8 — the *warm*
 * white the palette note points at, which holds at 132,111,88 in shade where
 * `bone` collapses to a hueless 76,68,58. `bone` is used only where a face is
 * meant to sit back: the plinth, the setbacks, the cross. The grooves and the
 * louvres are `slate`, which is the one dark in the twenty-four with more blue
 * in it than red, and on a building in Reykjavík that is correct.
 *
 * Proportion: 69.8 units tall, 26.9 of half-diagonal, so 0.38 against the 2.0 cap.
 * Real height 74.5 m, and the tier is `tower` for the reason the tier list
 * gives — it is the landmark of its city, and you can see it from the far side
 * of one.
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
    // 1. The steps. Reykjavík's church stands at the top of Skólavörðustígur on
    //    a raised forecourt, and two courses of it are enough to stop the shafts
    //    growing out of the grass.
    // -----------------------------------------------------------------------
    // The forecourt is held *inside* the outermost shaft rather than run past
    // it: at this tier the footprint cap is 28, and a plate one unit wider on
    // every side is what put the model's corner at 29.
    const last = PIPES.length - 1;
    const outer = PIPE_X + last * PITCH + PIPE;
    block(-outer, outer, 0, 0.75, TOWER_BACK, pipeFront(last) + 0.8, set);
    block(-outer + 1.0, outer - 1.0, 0.75, 1.5, TOWER_BACK, pipeFront(last) + 0.2, wall);

    // -----------------------------------------------------------------------
    // 2. The wings. Twelve shafts, each stepped forward of the one inside it so
    //    the ink can find every one of them, with a set-back reveal in each gap.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      for (let i = 0; i < PIPES.length; i++) {
        const x = side * (PIPE_X + i * PITCH);
        const front = pipeFront(i);
        block(x - PIPE, x + PIPE, 1.5, PIPES[i]!, front - PIPE_DEPTH, front, wall);

        // The groove on the inner side of this shaft: as deep as the shorter of
        // the two it separates, and set back so it reads as a gap.
        const inner = i === 0 ? SHAFT_TOP : PIPES[i - 1]!;
        const gap = side * (PIPE_X + i * PITCH - PITCH / 2);
        block(
          gap - 0.32,
          gap + 0.32,
          1.5,
          Math.min(inner, PIPES[i]!) - 0.5,
          front - PIPE_DEPTH,
          front - 0.5,
          groove,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 3. The tower. One shaft to the belfry, then two setbacks and the spire.
    // -----------------------------------------------------------------------
    block(-TOWER, TOWER, 1.5, SHAFT_TOP, TOWER_BACK, TOWER_FRONT, wall);

    // Three tall slots up the tower face — the stair windows, and the only thing
    // that keeps an 11-unit slab from reading as a blank pier.
    for (const x of [-3.1, 0, 3.1]) {
      block(x - 0.55, x + 0.55, 12, 29.5, TOWER_FRONT - 1.0, TOWER_FRONT + 0.05, groove);
    }

    // The clock, high on the front where the wings have already fallen away.
    // A `column` laid on its face is the only disc the contract makes, and the
    // two hands are boxes standing on the dial rather than sunk into it, so the
    // outline has something to draw round.
    const clock = column(2.5, 0.55, face, 8);
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 33.6, TOWER_FRONT + 0.05);
    group.add(clock);
    block(-0.19, 0.19, 33.6, 35.5, TOWER_FRONT + 0.5, TOWER_FRONT + 0.85, groove);
    block(-0.19, 1.5, 33.42, 33.78, TOWER_FRONT + 0.5, TOWER_FRONT + 0.85, groove);

    // The belfry: louvred on all four faces, and the one place the tower is
    // open. A wide dark band this high is what stops the upper tower reading as
    // a solid post.
    block(-TOWER, TOWER, SHAFT_TOP, 45, TOWER_BACK, TOWER_FRONT, wall);
    for (const x of [-3.6, 0, 3.6]) {
      block(x - 1.25, x + 1.25, 39.2, 44.0, TOWER_FRONT - 0.9, TOWER_FRONT + 0.05, groove);
    }
    for (const side of [-1, 1]) {
      block(side * TOWER, side * (TOWER - 0.9), 39.2, 44.0, TOWER_BACK + 1.4, TOWER_FRONT - 1.4, groove);
    }

    // Two setbacks, each a course proud of what it carries, then the spire. It
    // is 17 units on an 8.4 base — a 2:1 pyramid, which is what stops the top of
    // this tower reading as a cap dropped on it.
    block(-TOWER - 0.5, TOWER + 0.5, 45, 46.4, TOWER_BACK - 0.5, TOWER_FRONT + 0.5, set);
    block(-5.0, 5.0, 46.4, 48.8, TOWER_BACK + 1.2, TOWER_FRONT - 1.2, wall);
    block(-4.6, 4.6, 48.8, 50.0, TOWER_BACK + 1.6, TOWER_FRONT - 1.6, set);

    const spire = taper(4.2, 0.4, 17.0, wall, 4);
    spire.position.y = 50.0;
    group.add(spire);

    block(-0.16, 0.16, 66.6, 69.8, -0.16, 0.16, set);
    block(-0.85, 0.85, 68.3, 68.7, -0.14, 0.14, set);

    // -----------------------------------------------------------------------
    // 4. The door. A tall arch-headed opening in the tower's foot, stepped in
    //    three courses the way the arch over it actually is.
    // -----------------------------------------------------------------------
    block(-2.6, 2.6, 1.5, 9.8, TOWER_FRONT - 1.3, TOWER_FRONT + 0.05, dark);
    block(-2.1, 2.1, 9.8, 11.0, TOWER_FRONT - 1.3, TOWER_FRONT + 0.05, dark);
    block(-1.35, 1.35, 11.0, 12.0, TOWER_FRONT - 1.3, TOWER_FRONT + 0.05, dark);
    for (const side of [-1, 1]) {
      block(side * 2.6, side * 3.5, 1.5, 12.6, TOWER_FRONT - 0.55, TOWER_FRONT + 0.4, set);
    }
    block(-3.5, 3.5, 12.6, 13.5, TOWER_FRONT - 0.55, TOWER_FRONT + 0.4, set);

    return group;
  },
};
