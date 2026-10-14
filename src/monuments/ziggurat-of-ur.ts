import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Ziggurat of Ur, Dhi Qar, Iraq.
 *
 * Not a pyramid. Four things separate it at 260 pixels:
 * 1. The triple staircase: one flight straight out from the front and two
 *    running along the face to meet it at one gate.
 * 2. Very unequal stages: one enormous battered terrace with two much smaller
 *    boxes and a shrine on top (three masses, not nine).
 * 3. A rectangular plan, 64 by 45 m. Every prism `ctx` makes is regular, so each
 *    stage is a square `taper` inside a group carrying `scale.x`; this only works
 *    because the batter is a fraction (every stage narrows by 0.9 in both axes).
 * 4. Mudbrick: `clay` and `brown`, with bitumen-set lower courses in `bark`.
 *
 * The vertical is stretched 1.39x. Ur stood about 30 m on a 64 by 45 m base
 * (0.47), which would be 24.4 units over this model's 52-unit base; it ships at
 * 33.9. `MAX_ASPECT` did not force this (the honest proportion is 1.54 of the
 * 2.00 cap), the picture did: at 24 units the three stages become a low mound
 * with lines on it. Every photograph is taken from the foot of the central
 * staircase, where the terrace fills the sky. Half-diagonal over height as
 * built is 1.11. The stairs pay for it: the central flight climbs 14.0 over 23
 * (31 degrees) against the real 20, steeper in the same proportion as the
 * building.
 *
 * It owns its plinth and nothing else: the two-unit plinth is the building's own
 * foot and stops at the wall line, and the stairs run down onto whatever the
 * biome says is there. A temenos wall was tried and removed: seen edge-on from
 * the quarter view it gave two dark stubs for 250 triangles and pushed the
 * declared footprint from 38 to 43.
 */

/** How much of its own half-width each stage loses between its foot and its top. */
const BATTER = 0.9;

/**
 * The three masses, as [half-width in x at the foot, half-depth in z at the
 * foot, height, z of the centre]. The rectangle is `scale.x` on a group holding
 * a square `taper`, so the batter has to be a fraction.
 */
const STAGES: [halfX: number, halfZ: number, height: number, z: number][] = [
  [25.0, 16.0, 12.0, -8],
  [17.5, 11.5, 9.0, -10],
  [11.5, 7.5, 6.0, -11],
];

/** Top of the plinth, which is where the stages start. */
const PLINTH = 2.0;

/** Steps in the central flight, and in each of the two that run along the face. */
const CENTRE_STEPS = 13;
const FLANK_STEPS = 9;

/** Where the central stair starts on the ground, and the half-width of its ramp. */
const STAIR_FOOT = 31;
const STAIR_HALF = 5.5;

export const zigguratOfUr: Monument = {
  id: 'ziggurat-of-ur',
  name: 'Ziggurat of Ur',
  iso: 'IRQ',
  lat: 30.9626,
  lon: 46.1031,
  tier: 'building',
  footprint: 38,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper } = ctx;

    const brick = palette.clay; // baked mudbrick: the warm red every reconstruction uses
    const bitumen = palette.bark; // the plinth and the gate pylons, set in pitch
    const stair = palette.brown; // the three flights, a shade off the wall they climb
    const upper = palette.tan; // the third stage, weathered paler than the terrace
    const shrine = palette.white; // the whitewashed temple on top, and the warm white

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

    /** One battered rectangular mass. The group carries `scale.x` and no rotation, the child carries the geometry, so there is no R to meet the `T * R * S` trap. */
    const mass = (halfX: number, halfZ: number, height: number, y: number, z: number, color: number): Group => {
      const shell = new THREE.Group();
      shell.scale.x = halfX / halfZ;
      shell.position.set(0, y, z);
      shell.add(taper(halfZ, halfZ * BATTER, height, color, 4));
      group.add(shell);
      return shell;
    };

    // 1. The plinth: two units of dark brick stepped out past every wall above it, the terrace's one horizontal ink line.
    block(-26, 26, 0, PLINTH, -25, 9, bitumen);

    // 2. The three stages, unequal on purpose (13.5, 10.5 and 7.5 units): one great mass with two boxes on it, not a series of terraces.
    let level = PLINTH;
    const tops: number[] = [];
    for (let i = 0; i < STAGES.length; i++) {
      const [halfX, halfZ, height, z] = STAGES[i]!;
      mass(halfX, halfZ, height, level, z, i === 2 ? upper : brick);
      level += height;
      tops.push(level);
    }
    const TERRACE = tops[0]!; // 15.5: where all three stairs arrive

    // The parapet round the first terrace, on three sides: the front is left open because the stairs land there.
    const t1 = STAGES[0]!;
    const topX = t1[0] * BATTER;
    const topZ = t1[1] * BATTER;
    block(-topX, topX, TERRACE, TERRACE + 1.3, t1[3] - topZ - 0.6, t1[3] - topZ + 0.9, bitumen);
    for (const side of [-1, 1]) {
      block(
        side * (topX + 0.6),
        side * (topX - 0.9),
        TERRACE,
        TERRACE + 1.3,
        t1[3] - topZ,
        t1[3] + topZ,
        bitumen,
      );
    }

    // 3. The shrine: the one white thing in a red building, a whitewashed temple on the summit.
    const summit = tops[2]!;
    block(-7.5, 7.5, summit, summit + 4.2, -15.7, -6.3, shrine);
    block(-8.2, 8.2, summit + 4.2, summit + 4.9, -16.4, -5.6, upper);
    // Four niches in the shrine's front wall, stepped 0.35 proud so each gets its own ink line (flush, they would draw nothing).
    for (let i = 0; i < 4; i++) {
      const x = -5.4 + i * 3.6;
      block(x - 1.0, x + 1.0, summit + 0.5, summit + 3.5, -6.3, -5.95, bitumen);
    }

    // 4. The central staircase: thirteen steps from the ground at z = 31 to the terrace at 15.5 (34 degrees).
    //    Each step is a whole block standing on y = 0, which puts the ink line at the riser.
    const run = STAIR_FOOT - 8;
    for (let i = 0; i < CENTRE_STEPS; i++) {
      const z1 = STAIR_FOOT - (i * run) / CENTRE_STEPS;
      const z0 = STAIR_FOOT - ((i + 1) * run) / CENTRE_STEPS;
      block(-STAIR_HALF, STAIR_HALF, 0, ((i + 1) * TERRACE) / CENTRE_STEPS, z0, z1, stair);
    }
    // The two cheek walls turn the flight from a wedge into a channel.
    for (const side of [-1, 1]) {
      for (let i = 0; i < CENTRE_STEPS; i += 2) {
        const z1 = STAIR_FOOT - (i * run) / CENTRE_STEPS;
        const z0 = STAIR_FOOT - ((i + 2) * run) / CENTRE_STEPS;
        const top = Math.min(TERRACE, ((i + 2) * TERRACE) / CENTRE_STEPS) + 1.4;
        block(side * STAIR_HALF, side * (STAIR_HALF + 1.6), 0, top, z0, z1, bitumen);
      }
    }

    // 5. The two flights along the face: they start at the outer ends of the terrace and climb inward, so all three arrive at one gate.
    for (const side of [-1, 1]) {
      for (let i = 0; i < FLANK_STEPS; i++) {
        const x1 = side * (23.0 - (i * 15.5) / FLANK_STEPS);
        const x0 = side * (23.0 - ((i + 1) * 15.5) / FLANK_STEPS);
        block(x0, x1, 0, ((i + 1) * TERRACE) / FLANK_STEPS, 8.0, 11.4, stair);
      }
    }

    // 6. The gate: two pylons rather than one tower, since a solid gatehouse 6 units tall would hide most of the second stage.
    for (const side of [-1, 1]) {
      block(side * 4.4, side * 8.6, TERRACE, TERRACE + 4.2, 2.0, 6.4, bitumen);
      block(side * 4.0, side * 9.0, TERRACE + 4.2, TERRACE + 5.0, 1.6, 6.8, brick);
    }

    // 7. The pilasters: three on each flank of the great terrace and three across its back, proud of the
    //    wall by about a third of a unit. Each is a square `taper` inside a group carrying `scale.z`, so it
    //    is a strip, and they batter with the wall (the same 0.9). Three a side, since two regular
    //    subdivisions of one surface multiply into brickwork.
    const pilaster = (x: number, z: number, sx: number, sz: number): void => {
      const strip = new THREE.Group();
      strip.scale.set(sx, 1, sz);
      strip.position.set(x, PLINTH, z);
      strip.add(taper(5.6, 5.6 * BATTER, t1[2], brick, 4));
      group.add(strip);
    };
    for (const side of [-1, 1]) {
      for (const z of [-19.5, -8.0, 3.5]) pilaster(side * 21.2, z, 0.78, 0.36);
    }
    for (const x of [-13.5, 0, 13.5]) pilaster(x, -21.4, 0.36, 0.72);

    // 8. The cheek walls of the two flanking stairs, and the apron at the foot of the central one.
    for (const side of [-1, 1]) {
      block(side * 23.0, side * 25.0, 0, 3.2, 7.6, 11.8, bitumen);
      for (let i = 0; i < FLANK_STEPS; i += 2) {
        const x1 = side * (23.0 - (i * 15.5) / FLANK_STEPS);
        const x0 = side * (23.0 - ((i + 2) * 15.5) / FLANK_STEPS);
        const top = Math.min(TERRACE, ((i + 2) * TERRACE) / FLANK_STEPS) + 1.2;
        block(x0, x1, 0, top, 11.4, 12.9, bitumen);
      }
    }
    // The apron: two shallow courses spreading wider than the flight, so the ramp does not look cut off at the ground.
    block(-11.0, 11.0, 0, 1.0, STAIR_FOOT - 1.4, STAIR_FOOT + 3.0, stair);
    block(-8.2, 8.2, 1.0, 1.9, STAIR_FOOT - 2.6, STAIR_FOOT + 0.4, stair);

    return group;
  },
};
