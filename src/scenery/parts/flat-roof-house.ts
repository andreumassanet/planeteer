import { DOOR_HEAD, PROUD, STOREY, TONES, doorPaint } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Flat-roof house — the Maghreb, the Middle East, South Asia, Latin America.
 *
 * The read is **stacked cubes**, not one cube. A single flat-topped box is the
 * most boring silhouette a building can have and it is what this part would be
 * if it stopped at the walls; what makes it a house is the second block set back
 * on top of the first, the parapet standing proud of the roof line, and the
 * stair enclosure poking above everything. Those three are also, not by
 * accident, exactly what a real flat roof grows.
 *
 * The parapet is worth its mesh and its 32 triangles: 0.85 units is six pixels
 * at 120 units, it is the difference between a flat roof and a missing roof,
 * and it is a `ctx.rim` — a ring with a real hole — because the camera sits
 * above the avatar and looks *down* onto these roofs. A solid cap would read as
 * a lid.
 *
 * What the redesign added is the thing a rendered building has and a box does
 * not: **the wall is three tones of one colour**. A darker base course where
 * the render meets the dust, the wall itself, and a darker band under the
 * parapet where the coping shades it. The set-back upper block is a shade
 * lighter again — a flat-roofed house is built in stages and rendered in
 * stages, so the top floor is the newest coat. That is four tones of one
 * palette entry, which costs one colour and no draw calls.
 *
 * The openings are small and deep, which is what a hot climate builds: a
 * reveal, two panes, a door set in a stone frame and a step under it. **The
 * blue door is not decoration.** The Maghreb and the Mediterranean both put
 * `skyBlue` in `style.doors`, and against a sand wall it is the only saturated
 * mark on the whole building — at 26 pixels it is the thing you actually see.
 */

const PARAPET = 0.85;
const STAIR = 1.35;
/**
 * Three storeys and no more, and the height that follows from it.
 *
 * The `dwelling` kind is 1 to 3 storeys by definition, and `atlantic-europe`
 * asks for up to 4 — which built a stack of 15.8 with a stair head on top of it
 * and failed the kind's 16-unit cap. Four storeys of anything is a `block`, and
 * the kit already has two of those.
 */
const STOREYS = 3;
/** The darker course where the render meets the ground. */
const COURSE = 0.55;
/** The coping's shadow on the wall under it. */
const SHADE = 0.3;

export const flatRoofHouse: ScenicPart = {
  id: 'flat-roof-house',
  name: 'Flat-roof house',
  kind: 'dwelling',
  footprint: 6.6,
  note: 'Stacked cubes, a parapet, a roof stair and four tones of one render. Dry regions, every continent.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, rim, windows } = ctx;
    const group = new THREE.Group();

    const wall = rng.pick(style.walls);
    // The trim colour is drawn and not used, so the draws after it — and every
    // variant's colours — stay where they were.
    rng.pick(style.trim);

    const course = tone(wall, TONES.course);
    const shade = tone(wall, TONES.eave);
    const coping = tone(wall, TONES.cap);
    // The upper block is a shade different from the lower one on some variants:
    // a flat-roofed house is built in stages and rendered in stages.
    const upperWall = rng.chance(0.55) ? tone(wall, TONES.light) : wall;
    const surround = tone(wall, TONES.light);

    const width = rng.range(6, 7.2);
    const depth = width * rng.range(0.82, 1.05);
    const storeys = Math.min(STOREYS, rng.between(style.storeys[0], style.storeys[1]));
    // A roof stair and a parapet are built by whoever lives there, so they are
    // the two continuous dimensions on an otherwise wholly discrete building —
    // without them six variants in a two-storey region come out as three
    // silhouettes, which is `reviewPart` saying the seed did nothing.
    const parapet = PARAPET * rng.range(0.85, 1.2);
    const stairHeight = STAIR * rng.range(0.85, 1.35);

    // Split the storeys between two blocks, the upper one set back. One storey
    // stays one block, which is what most of them are.
    const lower = storeys >= 3 ? storeys - 1 : storeys;
    const upper = storeys - lower;

    const lowerHeight = lower * STOREY + COURSE;
    group.add(box(width + PROUD * 2, COURSE, depth + PROUD * 2, course));
    // The shell rises `PROUD` past the band, into the parapet, which hides the
    // difference. Stopped at `lowerHeight`, its roof and the band's closed top
    // were one plane in two colours, and a merged town is one mesh with one
    // depth test: the whole lower roof z-fought between the wall and the eave
    // tone as the camera moved. Measured 2026-09-13, 27.6 u² of it on every
    // one of the 84 builds.
    const shell = box(width, lowerHeight - COURSE + PROUD, depth, wall);
    shell.position.y = COURSE;
    group.add(shell);
    const band = box(width + PROUD * 2, SHADE, depth + PROUD * 2, shade);
    band.position.y = lowerHeight - SHADE;
    group.add(band);

    const skirt = rim(width + 0.35, depth + 0.35, 0.42, parapet, coping);
    skirt.position.y = lowerHeight;
    group.add(skirt);

    let top = lowerHeight;
    let topWidth = width;
    let topDepth = depth;
    let offsetX = 0;
    let offsetZ = 0;

    if (upper > 0) {
      topWidth = width * rng.range(0.55, 0.78);
      topDepth = depth * rng.range(0.6, 0.85);
      offsetX = (width - topWidth) * 0.5 * rng.jitter();
      offsetZ = -(depth - topDepth) * 0.5 * rng.range(0.2, 0.9);
      const upperHeight = upper * STOREY;
      const block = box(topWidth, upperHeight, topDepth, upperWall);
      block.position.set(offsetX, lowerHeight, offsetZ);
      group.add(block);

      const crown = rim(topWidth + 0.3, topDepth + 0.3, 0.38, parapet * 0.92, coping);
      crown.position.set(offsetX, lowerHeight + upperHeight, offsetZ);
      group.add(crown);
      top = lowerHeight + upperHeight;
    }

    // The stair head, always: it is what puts a third step in the silhouette and
    // it is why a real flat roof is never flat. Its own coping is what stops it
    // reading as a crate left on the roof.
    const stairX = offsetX + topWidth * 0.22 * rng.sign();
    const stairZ = offsetZ - topDepth * 0.2;
    // Sunk `PROUD` into the roof under it: on the narrowest upper blocks it
    // hangs through the crown, and standing on the roof its underside out
    // there was the crown's underside too.
    const stair = box(1.9, stairHeight + PROUD, 1.7, upperWall);
    stair.position.set(stairX, top - PROUD, stairZ);
    group.add(stair);
    const stairCap = box(2.14, 0.22, 1.94, coping);
    stairCap.position.set(stairX, top + stairHeight, stairZ);
    group.add(stairCap);

    // --- openings: small and few, which is what a hot climate builds ---
    // Two bays a floor, off-centre, and on the ground floor the door takes one
    // of them. It used to stand anywhere near the middle and overlapped the
    // ground-floor pair on nearly every variant, a slab with a board over it
    // laid across the window frames.
    const front = depth / 2;
    const bays = [-width * 0.29, width * 0.13];
    const doorBay = rng.between(0, 1);
    const doorX = bays[doorBay]!;
    const windowX = bays[1 - doorBay]!;
    const doorWidth = 1.4;
    const doorHeight = 2.5;
    const leaf = doorPaint(rng, style, wall);
    const door = ctx.door({
      width: doorWidth,
      height: doorHeight,
      leaf,
      frame: surround,
      sill: COURSE,
      step: course,
    });
    door.position.set(doorX, 0, front);
    group.add(door);

    for (let floor = 0; floor < lower; floor++) {
      const sill = COURSE + floor * STOREY + STOREY * 0.44;
      const ground = floor === 0;
      const row = windows({
        count: ground ? 1 : 2,
        width: 1.15,
        height: 1.35,
        frame: surround,
        spread: width * 0.42,
        // Painted-on grilles above the first floor: a reveal is ten triangles
        // and at that height nobody is close enough to look into one.
        reveal: floor < 2 ? undefined : 0,
      });
      row.position.set(ground ? windowX : -width * 0.08, sill, front);
      group.add(row);

      // One deep slot on each flank, which is what a courtyard house shows the
      // street. Two triangles a side, and they light as one room.
      const flank = lit(panes(1, 1.0, 1.35, 0, ctx.glass));
      flank.rotation.y = Math.PI / 2;
      flank.position.set(width / 2 + PROUD, sill, rng.jitter() * depth * 0.18);
      group.add(flank);
    }

    // A canvas awning over the door on some of them: the one horizontal on a
    // building made entirely of verticals, and the only shadow the front has.
    // Canvas in the door's own colour, a shade lighter, and no wider than the
    // frame and a hand either side: a dark board here read as a plank nailed
    // over the door.
    if (rng.chance(0.4)) {
      const awning = box(doorWidth + 0.7, 0.1, 1.0, tone(leaf, TONES.light));
      awning.position.set(doorX, COURSE + doorHeight + DOOR_HEAD + 0.2, front + 0.55);
      awning.rotation.x = -0.16;
      group.add(awning);
    }

    return group;
  },
};
