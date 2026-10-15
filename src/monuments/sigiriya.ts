import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Sigiriya, the Lion Rock, Sri Lanka.
 *
 * A gneiss plug 180 m out of a flat plain, with a palace on top and a gateway
 * shaped as a lion whose paws survive. The rock is four seven-sided `taper`
 * courses (few joints read as natural, and seven sides make the front and back
 * elevations differ); the third course is wider at the top than the bottom,
 * which gives one hard overhang line and makes it a monolith rather than a
 * cone. Around it stand the boulder garden, the mirror wall, the brick paws on
 * their terrace, the stair flights laid with `strut`s, wall stubs of
 * the summit palace and the water gardens on the plain.
 *
 * Tier `building`. The rock is really wider than tall (0.49); `tower` would
 * stretch it 2.6x vertically, so it is a deliberate 1.9x stretch (21.6 of
 * half-diagonal against 39.6 tall), squat as the view from its foot is. The
 * summit ruins stand at the front of the platform because the camera cannot
 * see into the middle of a plateau it looks across, and the paws sit on a
 * terrace projecting 4 units past the face.
 */

/**
 * The rock, as [top of the course, apothem at the bottom, apothem at the top].
 *
 * The step between the first and second course (16.8 down to 14.4) is the talus
 * apron: the cliff springs from inside it, which puts a shoulder of forest
 * round the foot. The apron is `darkOlive` because in life it is under jungle.
 */
const ROCK: [top: number, bottom: number, apex: number][] = [
  [3.8, 19.5, 16.8],
  [24.0, 14.4, 13.0],
  [32.0, 13.0, 14.0],
  [35.5, 14.0, 10.6],
];
const SIDES = 7;

/** The lion terrace: where its floor is, and how far it stands out from the face. */
const TERRACE_Y = 6.5;
const TERRACE_TOP = 9.5;
const TERRACE_OUT = 17.5;

/** Apothem of the front face at a given height, so a ledge can be laid on it. */
function faceAt(y: number): number {
  let base = 0;
  for (const [top, bottom, apex] of ROCK) {
    if (y <= top) return bottom + ((apex - bottom) * (y - base)) / (top - base);
    base = top;
  }
  return ROCK[ROCK.length - 1]![2];
}

export const sigiriya: Monument = {
  id: 'sigiriya',
  name: 'Sigiriya',
  iso: 'LKA',
  lat: 7.957,
  lon: 80.7603,
  tier: 'building',
  surface: 'none',
  footprint: 23.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, strut, around } = ctx;

    const rock = palette.clay; // the gneiss, which really is this colour
    const lit = palette.salmon; // the upper face, which the sun is on all afternoon
    const crown = palette.brown; // the rim, the boulders and the cut stair
    const brick = palette.tan; // the terrace, the paws and the palace walls
    const plaster = palette.cream; // the mirror wall, polished and still shining
    const shade = palette.bark; // the stair mouth between the paws
    const scrub = palette.darkOlive; // the apron, under jungle
    const leaf = palette.green;

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

    // 1. The rock: four courses, seven sides.
    let base = 0;
    const colors = [scrub, rock, lit, crown];
    for (let i = 0; i < ROCK.length; i++) {
      const [top, bottom, apex] = ROCK[i]!;
      const course = taper(bottom, apex, top - base, colors[i]!, SIDES);
      course.position.y = base;
      group.add(course);
      base = top;
    }
    const summit = column(10.2, 0.8, brick, SIDES);
    summit.position.y = 35.5;
    group.add(summit);

    // 2. The boulder garden and the forest on the apron, so the rock comes out of something.
    group.add(
      around(SIDES, (index) => {
        // Nothing on the front face: the lion terrace is there.
        if (index === 0) return null;
        const clump = new THREE.Group();
        for (const [dx, size, height, at, color] of [
          [-5.4, 3.1, 7.4, 15.4, scrub],
          [0.2, 3.7, 9.8, 14.6, leaf],
          [5.0, 2.8, 6.0, 15.6, scrub],
        ] as const) {
          // The green one is sunk `PROUD` deeper, so overlapping crowns do not share a plane.
          const sink = color === leaf ? PROUD : 0;
          const tree = taper(size, size * 0.5, height + sink, color, 5);
          tree.position.set(dx, 3.2 - sink, at);
          clump.add(tree);
        }
        // One boulder, low and dark, sitting out on the apron.
        if (index % 2 === 1) {
          const boulder = taper(3.1, 2.2, 3.4, crown, 6);
          boulder.position.set(2.6, 2.2, 17.4);
          clump.add(boulder);
        }
        return clump;
      }),
    );

    // 3. The mirror wall: a narrow polished gallery half way up the front.
    const gallery = faceAt(22);
    block(-5.2, 5.2, 21.4, 22.5, gallery - 0.4, gallery + 0.55, plaster);

    // 4. The lion terrace and the paws: two brick forepaws with a stairway between them.
    const faceLow = faceAt(TERRACE_Y);
    block(-8.0, 8.0, TERRACE_Y - 2.4, TERRACE_TOP, faceLow - 3, TERRACE_OUT, brick);

    for (const side of [-1, 1]) {
      const x = side * 4.2;
      block(x - 2.2, x + 2.2, TERRACE_TOP, TERRACE_TOP + 4.1, 12.5, 16.4, brick);
      // Four claws to a paw, so it does not read as a plinth.
      for (const at of [-1.45, -0.5, 0.5, 1.45]) {
        block(x + at - 0.38, x + at + 0.38, TERRACE_TOP, TERRACE_TOP + 1.4, 16.4, 17.6, brick);
      }
    }

    // The stair mouth between them, and three steps up to it.
    block(-2.0, 2.0, TERRACE_TOP, TERRACE_TOP + 4.6, 11.8, 13.0, shade);
    for (let i = 0; i < 3; i++) {
      block(-1.8, 1.8, TERRACE_TOP + i * 0.5, TERRACE_TOP + (i + 1) * 0.5, 13.0 + i * 1.1, 15.8, brick);
    }

    // 4b. The water gardens: symmetrical pools on the plain in front of the gate, the model's only saturated colour.
    for (const side of [-1, 1]) {
      block(side * 9.0, side * 16.0, 0, 1.0, 6.0, 15.6, brick);
      block(side * 9.8, side * 15.2, 0.55, 1.05, 6.8, 14.8, palette.skyBlue);
      // A pavilion on a plinth in the middle of each pool.
      const island = box(2.2, 1.8, 2.2, brick);
      island.position.set(side * 12.5, 0.55, 10.8);
      group.add(island);
    }

    // The boulder garden between the pools and the terrace.
    for (const [x, z, size, height] of [
      [-6.6, 17.4, 3.2, 4.4],
      [7.4, 18.6, 2.6, 3.4],
      [0.4, 20.2, 2.1, 2.6],
    ] as const) {
      const boulder = taper(size, size * 0.72, height, crown, 6);
      boulder.position.set(x, 0, z);
      group.add(boulder);
    }

    // 5. The stair up the face: one flight laid against the cliff, placed by its two endpoints.
    const flight = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      thickness: number,
      color: number,
    ): void => {
      group.add(
        strut(
          new THREE.Vector3(x0, y0, faceAt(y0) + 0.45),
          new THREE.Vector3(x1, y1, faceAt(y1) + 0.45),
          thickness,
          color,
        ),
      );
    };
    flight(-4.6, TERRACE_TOP + 1.0, 4.6, 20.6, 0.75, crown);
    flight(-4.6, TERRACE_TOP + 1.9, 4.6, 21.5, 0.3, brick);

    // 6. The palace on the summit: wall stubs at the front of the platform, where the camera can see them.
    const RUIN = 36.3;
    block(-4.6, 3.9, RUIN, 39.6, 6.8, 7.9, rock);
    block(-4.6, -3.5, RUIN, 38.7, 2.6, 7.9, rock);
    block(2.8, 3.9, RUIN, 39.2, 1.6, 7.9, rock);
    block(-1.2, 1.6, RUIN, 37.9, 2.1, 3.2, rock);
    // The cistern cut in the rock, and a wall stub on the far shoulder.
    block(5.0, 8.2, RUIN, 37.0, 0.4, 4.8, crown);
    block(-7.6, -5.4, RUIN, 38.4, -0.6, 2.6, rock);

    return group;
  },
};
