import { PROUD, TONES } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Round hut — thatched, and the reason Sub-Saharan Africa does not look like
 * anywhere else in the kit.
 *
 * It is the only part with no straight walls, which is most of why it works: at
 * 26 pixels a cylinder under a cone is unmistakable next to a street of boxes,
 * and no colour choice could have done that.
 *
 * Three decisions worth writing down:
 *
 * - **The cone overhangs the wall by 0.7 units.** Without the overhang the wall
 *   and the roof share one silhouette and the hut reads as a single tapered
 *   lump. With it, the ink finds a ledge and the roof separates — the same trick
 *   Stonehenge's lintels use to stop the ring reading as one band of stone.
 * - **The thatch is two cones and the wall is two tones**, which is what the
 *   redesign bought and what it was bought with. A dark skirt at the eaves
 *   under a lighter crown *is* the overhang's shadow, drawn instead of lit, and
 *   a darker course round the foot is where a mud wall is rained on. Neither
 *   costs a colour: they are tones, and `measure` folds them onto their base.
 * - **Ten sides, not twelve and not twenty-four.** `OutlineEffect` hulls every
 *   mesh separately and a facet is an ink line: past about twelve the facets are
 *   under a pixel and the cone goes back to being smooth, which under a
 *   four-step ramp is a grey blur. This part used to spend twelve, and the two
 *   facets it gave back paid for the second tone on both the wall and the
 *   thatch — a 10-sided piece is 40 triangles against 48, four of them, and the
 *   extra cone and the base course are 80. Ten still reads as *drawn*, and the
 *   silhouette of a hut is a circle either way.
 *
 * The doorway is `ink` by way of `style.glass` — a small dark rectangle on a
 * curved wall, which is the one detail that survives to any distance because it
 * is the only dark thing on a pale hut. It is `lit` at half strength, because a
 * hole with a fire behind it is a dimmer claim than a window; see `ctx.lit`.
 */

const SIDES = 10;
const FOOTPRINT = 7.1;

export const roundHut: ScenicPart = {
  id: 'round-hut',
  name: 'Round hut',
  kind: 'dwelling',
  footprint: FOOTPRINT,
  note: 'Mud wall in two tones, thatch in two cones, one lit door. The only part with no corners.',

  build(ctx, rng, style) {
    const { THREE, panes, tone, column, lit, taper } = ctx;
    const group = new THREE.Group();

    const mud = rng.pick(style.walls);
    const thatch = rng.pick(style.roofs);
    const dark = rng.pick(style.glass);

    const course = tone(mud, TONES.course);
    const lintelTone = tone(mud, TONES.cap);
    const skirtTone = tone(thatch, TONES.eave);
    const capTone = tone(thatch, TONES.cap);

    const radius = rng.range(2.5, 3.4);
    const wall = rng.range(2.6, 3.4);
    const cone = rng.range(2.9, 4.2);

    // A slightly battered wall — wider at the foot — is what a mud wall does and
    // it costs nothing, since `taper` is the same helper as `column`. The course
    // is battered harder and stands proud of the wall above it, so the pen
    // draws the ledge between them.
    const courseHeight = wall * 0.3;
    group.add(taper(radius * 1.09, radius * 1.045, courseHeight, course, SIDES));
    const shell = taper(radius * 1.025, radius, wall - courseHeight, mud, SIDES);
    shell.position.y = courseHeight;
    group.add(shell);

    // The thatch: a dark skirt under a lighter crown. The join is where the
    // overhang's own shadow line falls on a real one.
    const skirtHeight = cone * rng.range(0.34, 0.46);
    const eaves = radius + 0.7;
    const waist = eaves * rng.range(0.55, 0.68);
    const skirt = taper(eaves, waist, skirtHeight, skirtTone, SIDES);
    skirt.position.y = wall;
    group.add(skirt);
    const crown = taper(waist, 0.14, cone - skirtHeight, thatch, SIDES);
    crown.position.y = wall + skirtHeight;
    group.add(crown);
    // The bound cap at the apex, which is what a thatcher actually ties on and
    // what stops the cone ending in a needle the pen cannot draw.
    const knot = taper(0.42, 0.16, 0.6, capTone, 6);
    knot.position.y = wall + cone - 0.22;
    group.add(knot);

    // Firelight through the doorway, which is the only opening a hut has, under
    // a lintel of the same mud a shade lighter.
    const doorway = lit(panes(1, 1.05, 1.9, 0, dark, 0.36), 0.5);
    doorway.position.set(0, 0, radius * 1.02);
    group.add(doorway);
    const lintel = panes(1, 1.35, 0.22, 0, lintelTone, 0.3);
    lintel.position.set(0, 1.9, radius * 1.02 + PROUD);
    group.add(lintel);

    // A granary or a store beside the house on half the variants: a compound is
    // never one building, and the second mass is what makes a cluster of these
    // read as a settlement rather than as a field of cones. Six sides on it, not
    // ten: it is a third the size, so its facets are a third the width.
    if (rng.chance(0.5)) {
      const small = radius * rng.range(0.32, 0.42);
      const stand = column(small, 1.5, course, 6);
      const angle = rng.range(0, Math.PI * 2);
      // Held inside the declared footprint by its lid's *circumradius*, which is
      // the corner of a hexagon and not its half-width across the flats — the
      // same 1/cos(pi/n) that makes a 10-sided eaves reach 4.31 for a 4.10
      // radius. Without it the largest hut with the largest granary measured
      // 7.25 against a 7.1 footprint.
      const lidReach = (small + 0.45) / Math.cos(Math.PI / 6);
      const at = Math.min(radius + small + 0.25, FOOTPRINT - 0.1 - lidReach);
      stand.position.set(Math.sin(angle) * at, 0, Math.cos(angle) * at);
      group.add(stand);

      const lid = taper(small + 0.45, 0.1, 1.7, skirtTone, 6);
      lid.position.set(stand.position.x, 1.5, stand.position.z);
      group.add(lid);
    }

    return group;
  },
};
