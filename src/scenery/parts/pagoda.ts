import { PROUD, TONES } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Pagoda — the civic building of East and Southeast Asia.
 *
 * The recognition is **the stack of eaves**, and it is a rhythm rather than a
 * shape: three to five roofs, each a little smaller and a little closer to the
 * one above it than the one below. Get the taper wrong and it is a wedding cake;
 * get it right and it reads at any distance, because a repeated horizontal is
 * the one pattern the eye resolves long after it has lost the detail.
 *
 * The overhang does the rest. Each roof projects 1.3 units past its own tier,
 * which at the top tier is nearly the width of the tier itself — so from the
 * ground the tiers disappear and you see only the roofs, which is exactly what
 * you see in life.
 *
 * This is the one place in the kit where an *evenly spaced* repeat is right, and
 * it is worth saying why, given "evenly spaced glaciers read as a paper crown"
 * is a lesson already paid for in this repo. A crown is a ring of identical
 * things at identical spacing seen all at once. This is a vertical series where
 * every member is a different size, so the spacing is read as perspective, not
 * as a pattern. The rule is about identical repeats, not about repeats.
 *
 * **The tones follow the conifer's rule and for the conifer's reason.** A stack
 * of identical roofs in one flat tile colour takes the same cel band on the same
 * side at every tier, so the eye sees one object with horizontal lines drawn on
 * it. Graded from a dark eave at the foot to a light one at the crown, the same
 * geometry reads as a tower standing in its own shade. Under each roof is a
 * darker soffit band — an eave this deep casts the largest shadow on the model
 * and half the day the sun is not on the face that would show it — and along
 * each ridge a darker cap. The ground tier gets a lit lattice behind timber
 * bars, one `panes` row each, which is what a lantern-lit hall looks like from
 * outside at night.
 */

const TIER_TAPER = 0.84;
const OVERHANG = 1.3;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const pagoda: ScenicPart = {
  id: 'pagoda',
  name: 'Pagoda',
  kind: 'civic',
  footprint: 8.6,
  note: 'Three to five stacked eaves graded from dark to light, over a lit lattice hall. East Asia.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, column, taper, roof } = ctx;
    const group = new THREE.Group();

    const timber = rng.pick(style.trim);
    const tile = rng.pick(style.roofs);
    const wall = rng.pick(style.walls);
    const stone = rng.pick(style.stone);

    const post = tone(timber, TONES.eave);
    const rail = tone(timber, TONES.cap);
    const soffit = tone(tile, TONES.eave);
    const ridgeTile = tone(tile, TONES.cap);
    const coping = tone(stone, TONES.light);

    const tiers = rng.between(3, 5);
    const first = rng.range(2.5, 2.9);
    const groundWidth = rng.range(6.4, 7.4);
    let width = groundWidth;
    let y = 0.7;

    group.add(box(width + 2.6, 0.7, width + 2.6, stone));
    const cope = box(width + 2.8, 0.16, width + 2.8, coping);
    cope.position.y = 0.7;
    group.add(cope);

    for (let tier = 0; tier < tiers; tier++) {
      // 0 at the ground tier, 1 at the crown: the tile grades light going up,
      // exactly as the conifer's needles do, and for the same reason.
      const up = tiers > 1 ? tier / (tiers - 1) : 1;
      const roofTone = tone(tile, Math.round(lerp(0.82, 1.12, up) * 100) / 100);
      const height = first * Math.pow(TIER_TAPER, tier);
      const body = box(width, height, width, tier === 0 ? wall : timber);
      body.position.y = y;
      group.add(body);

      // Posts at the corners of the ground tier only, as one `panes` pair a
      // face. Higher up they are under a pixel and the eaves have already taken
      // over the reading.
      if (tier === 0) {
        for (const side of [1, -1]) {
          const pair = panes(2, 0.46, height, width - 0.46, post, 0.46);
          pair.position.set(0, y, (side * width) / 2);
          group.add(pair);
        }
      }

      const span = width + OVERHANG * 2;
      // The soffit: the shadow the overhang throws back onto its own tier.
      const shade = box(span - 0.5, 0.26, span - 0.5, soffit);
      shade.position.y = y + height - 0.13;
      group.add(shade);

      // A hip, not a gable: the ridge is a third of the span, so all four eaves
      // sweep and the pagoda reads the same from every side. It has to — a
      // village is walked around.
      const ridge = span * 0.34;
      const eaves = roof(span, span, 1.55, ridge, roofTone);
      eaves.position.y = y + height;
      group.add(eaves);
      const ridgeCap = box(ridge + 0.3, 0.28, 0.42, ridgeTile);
      ridgeCap.position.y = y + height + 1.55 - 0.1;
      group.add(ridgeCap);

      // A balustrade on the front of every tier above the first: the one
      // horizontal that is not a roof, and one mesh apiece.
      if (tier > 0) {
        const balusters = 5;
        const gap = (width * 0.9 - balusters * 0.14) / (balusters - 1);
        const rails = panes(balusters, 0.14, 0.55, gap, rail);
        rails.position.set(0, y + 0.12, width / 2 + PROUD);
        group.add(rails);
      }

      y += height + 1.05;
      width *= TIER_TAPER;
    }

    // --- the ground-floor hall: a lit lattice behind timber bars, and a door ---
    // Two `panes` rows and the hall is lantern-lit at night behind a screen. The
    // bars are eleven triangles and are the only thing on this model an avatar
    // standing in front of it is close enough to resolve.
    const face = groundWidth / 2;
    const screenWidth = groundWidth * 0.52;
    const screenHeight = first * 0.62;
    const screen = lit(panes(1, screenWidth, screenHeight, 0, ctx.glass, PROUD), 0.85);
    screen.position.set(0, 0.7 + first * 0.22, face + PROUD);
    group.add(screen);
    const bars = 6;
    const bar = panes(bars, 0.12, screenHeight, (screenWidth - bars * 0.12) / (bars - 1), rail);
    bar.position.set(0, 0.7 + first * 0.22, face + PROUD * 2.6);
    group.add(bar);
    const doors = panes(2, groundWidth * 0.15, first * 0.55, 0.16, post, PROUD * 2);
    doors.position.set(0, 0.7, face + PROUD);
    group.add(doors);

    // The finial: a mast through three rings. It is 12% of the height and it is
    // what stops the stack ending in a shrug.
    const mast = column(0.22, 3.4, ridgeTile, 6);
    mast.position.y = y;
    group.add(mast);
    for (let ring = 0; ring < 3; ring++) {
      const disc = taper(0.85 - ring * 0.2, 0.7 - ring * 0.2, 0.22, tone(tile, TONES.light), 6);
      disc.position.y = y + 0.7 + ring * 0.8;
      group.add(disc);
    }

    return group;
  },
};
