import { PROUD, STOREY, TONES } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Machiya: the East Asian townhouse, the part that makes a house in Japan not
 * a house in Morocco. Three proportions, all the opposite of the gabled
 * house's:
 *
 * - The eaves are enormous: 1.7 units of overhang on a 5.7-unit frontage,
 *   where a European roof gets 0.9. The band under the eaves is the darkest
 *   tone on the building, drawn rather than lit.
 * - The pitch is shallow and the roof hipped (`east-asia` sets 0.45 and 0.85),
 *   a wide dark lid with a darker ridge cap (the *munagawara*).
 * - The plan is deep, not wide: narrow to the street and long back, 1.45 to
 *   1.95 times the frontage, which also reads as a terrace in a row.
 *
 * The lattice (*koshi*) is bars: `panes` draws a row in one mesh, so seven bars
 * in front of a lit recess are fourteen triangles and no draw calls, and at 40
 * units they are the front of the building. The recess is glass and `lit`.
 */

const EAVES = 1.7;
/** The stone plinth a machiya's timber frame stands on. */
const BASE = 0.36;
/** As `gabled-house`: the shortest a dwelling may come out, against the kind's floor of 5. */
const FLOOR = 5.6;

export const machiya: ScenicPart = {
  id: 'machiya',
  name: 'Machiya',
  kind: 'dwelling',
  footprint: 8.8,
  note: 'Deep plan, shallow hipped roof, eaves a third of the frontage, a lit lattice front. East Asia.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, roof, windows } = ctx;
    const group = new THREE.Group();

    const plaster = rng.pick(style.walls);
    const tile = rng.pick(style.roofs);
    const timber = rng.pick(style.trim);

    const shade = tone(plaster, TONES.eave);
    const course = tone(plaster, TONES.course);
    const surround = tone(plaster, TONES.light);
    const ridgeTile = tone(tile, TONES.cap);
    const frame = tone(timber, TONES.cap);
    const post = tone(timber, TONES.eave);

    const width = rng.range(5.2, 6.2);
    const depth = width * rng.range(1.45, 1.95);
    const storeys = rng.between(Math.max(1, style.storeys[0]), Math.min(2, style.storeys[1]));
    const rise = style.pitch * (width / 2 + EAVES);
    // The upper floor of a machiya is a low half-storey under the roof, not a
    // full one. Building it at full height is what turns it into an office. The
    // `FLOOR` term stretches the shop front rather than the roof in the flattest
    // regions, where one storey under a 0.15 pitch measured 4.8 and failed the
    // kind's floor.
    const body = Math.max(STOREY * (storeys === 1 ? 1.25 : 1.72), FLOOR - BASE - rise);

    group.add(box(width + 0.3, BASE, depth + 0.3, course));
    // `PROUD` short of the eave band, which caps the wall: level with it, the
    // two tops were one plane in two colours under the roof.
    const shell = box(width, body - PROUD, depth, plaster);
    shell.position.y = BASE;
    group.add(shell);

    // Corner posts, proud of the plaster, front pair and back pair. Two colours
    // on a wall is the whole timber-frame read, and one `panes` call is a pair.
    for (const side of [1, -1]) {
      const pair = panes(2, 0.44, body, width - 0.44, post, 0.44);
      pair.position.set(0, BASE, (side * depth) / 2);
      group.add(pair);
    }

    // The band under the eaves: a machiya's overhang is its signature and half
    // the day the sun is not on the face that would show it.
    const eaveBand = box(width + PROUD * 2, 0.36, depth + PROUD * 2, shade);
    eaveBand.position.y = BASE + body - 0.36;
    group.add(eaveBand);

    const cap = roof(depth + EAVES * 1.2, width + EAVES * 2, rise, depth * 0.55, tile);
    cap.rotation.y = Math.PI / 2;
    cap.position.y = BASE + body;
    group.add(cap);
    const ridgeCap = box(0.5, 0.34, depth * 0.55 + 0.4, ridgeTile);
    ridgeCap.position.y = BASE + body + rise - 0.12;
    group.add(ridgeCap);

    // The hisashi: a pent roof over the shopfront, tilted forward off the wall,
    // with its own dark soffit under it.
    const pentY = BASE + STOREY * (storeys === 1 ? 0.9 : 1.02);
    const pent = box(width + EAVES, 0.34, 2.2, tile);
    pent.position.set(0, pentY, depth / 2 + 0.55);
    pent.rotation.x = -0.3;
    group.add(pent);
    const soffit = box(width + EAVES - 0.3, 0.16, 1.9, ridgeTile);
    soffit.position.set(0, pentY - 0.2, depth / 2 + 0.5);
    soffit.rotation.x = -0.3;
    group.add(soffit);

    // The entrance, off to one side as a machiya's is, inside the corner post;
    // the koshi fills the rest of the front, from the other post to a hand's
    // width short of the door's jamb.
    const side = rng.sign();
    const doorWidth = 1.1;
    const jambWidth = 0.16;
    const postInner = width / 2 - 0.22;
    const doorX = side * (postInner - 0.12 - jambWidth - doorWidth / 2);
    const doorway = lit(panes(1, doorWidth, 2.2, 0, ctx.glass, PROUD), 0.6);
    doorway.position.set(doorX, BASE, depth / 2);
    doorway.userData.atlasDoor = true;
    group.add(doorway);
    const jamb = panes(2, jambWidth, 2.3, doorWidth, post, PROUD * 2);
    jamb.position.set(doorX, BASE, depth / 2 + PROUD * 1.5);
    jamb.userData.atlasDoor = true;
    group.add(jamb);

    // The koshi: a lit recess with a row of timber bars across it. See the note
    // above — the bars are one mesh, which is why they exist at all.
    const near = doorX - side * (doorWidth / 2 + jambWidth + 0.25);
    const far = -side * (postInner - 0.12);
    const latticeWidth = Math.abs(near - far);
    const latticeX = (near + far) / 2;
    const latticeHeight = STOREY * 0.66;
    const recess = lit(panes(1, latticeWidth, latticeHeight, 0, ctx.glass, PROUD), 0.85);
    recess.position.set(latticeX, BASE + 0.35, depth / 2 + PROUD);
    group.add(recess);
    const bars = latticeWidth > 3.2 ? 7 : 6;
    const bar = panes(bars, 0.11, latticeHeight, (latticeWidth - bars * 0.11) / (bars - 1), frame);
    bar.position.set(latticeX, BASE + 0.35, depth / 2 + PROUD * 3.5);
    group.add(bar);
    const head = panes(1, latticeWidth + 0.2, 0.22, 0, post, PROUD * 2);
    head.position.set(latticeX, BASE + 0.35 + latticeHeight, depth / 2 + PROUD);
    group.add(head);

    if (storeys > 1) {
      const upper = windows({
        count: 2,
        width: width * 0.3,
        height: 1.15,
        frame: surround,
        spread: width * 0.38,
      });
      upper.position.set(0, BASE + STOREY * 1.22, depth / 2);
      group.add(upper);
    }

    // A lit slot down one flank, which is what an eel's bed shows the alley.
    const flank = lit(panes(2, 0.9, 1.2, depth * 0.3, ctx.glass));
    flank.rotation.y = Math.PI / 2;
    flank.position.set(width / 2 + PROUD, BASE + body * 0.45, 0);
    group.add(flank);

    // Noren or a shop sign, on some of them: one saturated mark on a pale front.
    if (rng.chance(0.45)) {
      const sign = box(0.55, 1.9, 0.3, timber);
      sign.position.set(width * rng.range(0.28, 0.36) * -Math.sign(doorX || 1), 0.9, depth / 2 + 0.9);
      group.add(sign);
    }

    return group;
  },
};
