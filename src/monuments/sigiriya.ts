import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Sigiriya — the Lion Rock, Sri Lanka.
 *
 * **Why Sri Lanka:** India had two landmarks and Nepal one, and the whole of the
 * rest of South Asia — Sri Lanka, Pakistan, Bangladesh, Afghanistan, Bhutan, the
 * Maldives — had none. Sigiriya is the one that most rewards being built: a
 * gneiss plug 180 m out of a flat plain with a fifth-century palace on top of
 * it, reached through a gateway shaped as a lion whose paws are still there and
 * whose head is not.
 *
 * ---------------------------------------------------------------------------
 * Tier, and the proportion argument that settled it
 * ---------------------------------------------------------------------------
 *
 * The obvious filing is `tower` — it is a vertical thing, the landmark of its
 * district. It is also **wider than it is tall**: 370 m across against 180 m
 * high, a ratio of 0.49. The `tower` tier caps the footprint at 28 against a
 * height of 70, so a `tower` Sigiriya is 56 wide and 70 tall, ratio 1.25, a
 * **2.6x vertical stretch** — more than the Golden Gate's 2.3, and spent on the
 * one axis nobody would name this rock by.
 *
 * `building` inverts that, and the first build took it all the way: 39.9 tall on
 * a 30-unit half-diagonal, ratio 0.66 against a real 0.49, a **1.35x stretch and
 * the most honest version of this rock the contract allows**. It renders as a
 * pot. Squat is what *correct* looks like here, because the photograph everyone
 * has of Sigiriya is taken from the foot of it — where the rock fills the sky and
 * the 370 m of width is behind you and out of frame.
 *
 * So it is 21.6 of half-diagonal against 39.6 — 43.3 wide against 39.6 tall, a
 * height-to-width of 0.91 against a real 0.49, which is a **1.9x vertical
 * stretch**, written down rather than hidden: less than the Golden Gate's 2.3 and
 * spent on exactly the axis the tier note says to spend it on — the proportion
 * that carries the recognition is *sheer sides*, and the one that carries none is
 * how much plain is underneath. What `building` still costs is that Sigiriya is
 * 40 units where Everest is 120, and that is correct.
 *
 * ---------------------------------------------------------------------------
 * Four courses, not seven
 * ---------------------------------------------------------------------------
 *
 * The rock is a stack of seven-sided `taper`s and the count of them was chosen
 * against the note in `CLAUDE.md`: *few joints say natural, many say
 * manufactured*. Seven courses would have read as a layer cake, which is exactly
 * wrong for a homogeneous gneiss plug with no bedding in it at all. Four, with
 * the third one **wider at the top than at the bottom**, gives a swelling
 * overhang two thirds of the way up and one hard ink line under it, and that
 * single reversal is what makes the silhouette a monolith rather than a cone.
 *
 * Seven sides rather than eight because seven is odd: a face lands on +Z and a
 * *corner* lands opposite it, so the front elevation and the back are different
 * shapes, which a rock should be.
 *
 * ---------------------------------------------------------------------------
 * What is spent, and where the camera let it be spent
 * ---------------------------------------------------------------------------
 *
 * The contact sheet's 13.4-degree camera decides two things here.
 *
 * **The summit ruins have to stand at the front of the platform, and the summit
 * had to come down to make room for them.** The rim's top edge is at 34.5 and
 * 13.6 out, so a ray grazing it is already at 35.6 by z = 9 and at 37.7 in the
 * middle of the plateau. Walls at z = 8 to 12 rising to 39.9 show four of their
 * four and a half units; the same walls in the centre would show a fifth of
 * themselves. Sigiriya's palace was on the north end anyway.
 *
 * **The paws have to come forward of the rock, not sit against it.** They are on
 * a terrace that projects 4 units past the face, and they are the one part of
 * this model anybody could name it by.
 *
 * The stair is two `strut`s. A strut is placed by its two endpoints rather than
 * by a base, which is the only helper here that can lie a flight against a face
 * that is neither vertical nor flat, and the two flights zigzag the way the
 * real gallery does.
 */

/**
 * The rock, as [top of the course, apothem at the bottom, apothem at the top].
 *
 * The **step between the first course and the second** — 16.8 down to 14.4 — is
 * the most important number in the file. It is the talus apron, and the cliff
 * springs from *inside* it rather than continuing it, which is what puts a
 * shoulder of forest round the foot and makes the rock rise out of something.
 * Without that step this is a barrel; the first build did not have it and
 * rendered as a pot.
 *
 * The apron is also the **one course that is not rock-coloured**. It is
 * `darkOlive`, because in life you cannot see it — it is under jungle — and a
 * dark irregular skirt is what separates the monolith from the plain at 260
 * pixels. Colour does that job here and geometry cannot: a talus modelled
 * honestly is a cone, and a cone under a cylinder is a lampshade.
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

    // -----------------------------------------------------------------------
    // 1. The rock. Four courses, and the count is the note in `CLAUDE.md` about
    //    joints: *few say natural, many say manufactured*, and a homogeneous
    //    gneiss plug has no bedding in it at all. Seven sides rather than eight
    //    because seven is odd — a face lands on +Z and a corner opposite it, so
    //    the front elevation and the back are different shapes, which a rock
    //    should be.
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 2. The Boulder Garden and the forest on the apron. Sigiriya's foot is a
    //    field of house-sized boulders under trees, and the rock has to come
    //    *out* of something or a 40-unit prism is a bollard.
    // -----------------------------------------------------------------------
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
          const tree = taper(size, size * 0.5, height, color, 5);
          tree.position.set(dx, 3.2, at);
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

    // -----------------------------------------------------------------------
    // 3. The mirror wall — the polished plaster gallery half way up the front,
    //    the one bright horizontal on a wall of rock, and still legible after
    //    fifteen hundred years of people writing on it. Kept narrow: at full
    //    width it reads as a shelf bolted to the cliff.
    // -----------------------------------------------------------------------
    const gallery = faceAt(22);
    block(-5.2, 5.2, 21.4, 22.5, gallery - 0.4, gallery + 0.55, plaster);

    // -----------------------------------------------------------------------
    // 4. The lion terrace, and the paws. The head is gone — it fell in the
    //    fourteenth century — so what is here is what is there: two enormous
    //    brick forepaws with a stairway between them going into the rock.
    // -----------------------------------------------------------------------
    const faceLow = faceAt(TERRACE_Y);
    block(-8.0, 8.0, TERRACE_Y - 2.4, TERRACE_TOP, faceLow - 3, TERRACE_OUT, brick);

    for (const side of [-1, 1]) {
      const x = side * 4.2;
      block(x - 2.2, x + 2.2, TERRACE_TOP, TERRACE_TOP + 4.1, 12.5, 16.4, brick);
      // Four claws to a paw, and they are what stop a paw reading as a plinth.
      for (const at of [-1.45, -0.5, 0.5, 1.45]) {
        block(x + at - 0.38, x + at + 0.38, TERRACE_TOP, TERRACE_TOP + 1.4, 16.4, 17.6, brick);
      }
    }

    // The stair mouth between them, and three steps up to it.
    block(-2.0, 2.0, TERRACE_TOP, TERRACE_TOP + 4.6, 11.8, 13.0, shade);
    for (let i = 0; i < 3; i++) {
      block(-1.8, 1.8, TERRACE_TOP + i * 0.5, TERRACE_TOP + (i + 1) * 0.5, 13.0 + i * 1.1, 15.8, brick);
    }

    // -----------------------------------------------------------------------
    // 4b. The water gardens. The other half of Sigiriya, and the half a model of
    //     the rock alone always loses: symmetrical pools, moats and fountains
    //     laid out on the plain in front of the gate, which are the oldest
    //     landscaped gardens in the world still in their original plan.
    //
    //     They are also the only saturated colour in the model. Everything else
    //     here is a warm earth, and 860 triangles of a 2,600 budget was buying a
    //     card with nothing bright anywhere on it.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 9.0, side * 16.0, 0, 1.0, 6.0, 15.6, brick);
      block(side * 9.8, side * 15.2, 0.55, 1.05, 6.8, 14.8, palette.skyBlue);
      // A pavilion on a plinth in the middle of each pool, which is what the
      // excavated ones have.
      const island = box(2.2, 1.8, 2.2, brick);
      island.position.set(side * 12.5, 0.55, 10.8);
      group.add(island);
    }

    // The Boulder Garden between the pools and the terrace: three of the
    // house-sized rocks the whole lower site is threaded between.
    for (const [x, z, size, height] of [
      [-6.6, 17.4, 3.2, 4.4],
      [7.4, 18.6, 2.6, 3.4],
      [0.4, 20.2, 2.1, 2.6],
    ] as const) {
      const boulder = taper(size, size * 0.72, height, crown, 6);
      boulder.position.set(x, 0, z);
      group.add(boulder);
    }

    // -----------------------------------------------------------------------
    // 5. The stair up the face. One flight, laid against a wall that is neither
    //    vertical nor flat, which is the one thing a `strut` can do and a box
    //    cannot — it is placed by its two endpoints rather than by a base.
    //
    //    **One flight and not two.** The first build zigzagged twice up the
    //    cliff and the two beams crossed it like scaffolding, which was the only
    //    thing anybody saw in the thumbnail.
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 6. The palace on the summit. Wall stubs only — that is all that is left of
    //    it — and every one of them at the front of the platform, because the
    //    camera cannot see into the middle of a plateau it is looking across.
    //    The rim's top edge is at 35.5 and 10.6 out, so a grazing ray is at 36.6
    //    by z = 6 and at 38.0 in the middle: walls at the front show three
    //    quarters of themselves and the same walls in the centre show none.
    // -----------------------------------------------------------------------
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
