import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Tiwanaku — the Gate of the Sun, the Kalasasaya and the sunken temple.
 *
 * **Why Bolivia:** the Andes between Machu Picchu and Perito Moreno had nothing,
 * and Bolivia had no landmark at all. Tiwanaku, on the altiplano south-east of
 * Lake Titicaca at about 3,850 m, was the ceremonial centre of a culture that
 * held the southern Andes from roughly AD 500 to 1000, and its Gate of the Sun
 * is one of the most reproduced objects of the pre-Columbian Americas.
 *
 * ---------------------------------------------------------------------------
 * What carries it at thumbnail size
 * ---------------------------------------------------------------------------
 *
 * - **The gate.** A single block of andesite cut into a doorway, the upper
 *   third carved with a frieze: the staff-holding figure over the door, three
 *   rows of winged attendants either side of him, and a band under them. A
 *   frame with a frieze across its top is the whole recognition.
 * - **The Kalasasaya.** The platform the gate stands on, walled by tall
 *   sandstone pillars with smaller masonry between them, entered up a broad
 *   stair between two great jambs. The pillar-and-infill rhythm is what makes
 *   it Tiwanaku and not any other walled platform.
 * - **The sunken temple** in front of the stair: a square court below the
 *   ground, its walls studded with carved stone heads tenoned into them, and a
 *   bearded monolith standing in the middle.
 * - **The Ponce monolith**, inside the Kalasasaya, holding a beaker and a
 *   sceptre against its chest.
 *
 * ---------------------------------------------------------------------------
 * The scale, and what it cost
 * ---------------------------------------------------------------------------
 *
 * The gate is about 3.8 m wide and 2.8 m high; the Kalasasaya is about 128 by
 * 118 m. Thirty-three gates side by side would cross it. At any honest plan the
 * gate is a speck on a field, so **the plan is compressed about 16:1 against
 * the gate**: the gate is 11 units wide by 8.6 high (a little taller than its
 * 1.36 ratio, 1.28, so the doorway under the frieze stays a doorway), and the
 * Kalasasaya is 26 by 16. The sunken temple is likewise a 9.2-unit court where
 * the real one is about 28 by 26 m, and it sits closer to the stair than in
 * life.
 *
 * The real Gate of the Sun stands in the north-west corner of the Kalasasaya,
 * so it is set back and to the left here, on its own low base; the Ponce
 * monolith stands on the right.
 *
 * Proportion: the furthest vertex is a Kalasasaya corner pillar, 21.2 units
 * out, against a height of 11.1 at the top of the gate — 3.82 against the
 * `MAX_ASPECT` of 4. That is why the gate is as tall as it is: shorter and the
 * whole composition is too flat to build.
 *
 * The court's depth is set by the camera. The sheet looks from about 13 degrees
 * up, so a rim of height h hides about 4h behind it; the pit's front wall is
 * 1.7 high and the back wall is 10 units behind it, so the heads on the back
 * wall are seen whole, and the stair gap in the front wall shows them to a
 * player at eye level too.
 *
 * Colours: the gate, the monoliths and the heads are andesite, `bone`, standing
 * in the open where a neutral is safe; the pillars are red sandstone, `clay`
 * toned down; the walls between them `brown`, warm because the inside of the
 * pit is in shade; the court floors and the earth bank round the pit are `tan`.
 */

/** The Kalasasaya: its outer box, wall thickness, wall top and court floor. */
const K_HALF = 13;
const K_FRONT = 0;
const K_BACK = -16;
const K_WALL = 1.6;
const K_TOP = 4.4;
const K_FLOOR = 2.0;
/** Half the width of the entrance stair, between the jambs. */
const GAP = 3.2;

/** The sunken temple: centre, inner half-width, wall and bank. */
const PIT_Z = 11;
const PIT_IN = 4.6;
const PIT_OUT = 5.6;
const PIT_TOP = 1.7;
const BANK_OUT = 7;
const BANK_TOP = 1.4;
/** Half the width of the stair down into the pit. */
const PIT_GAP = 2;

/** The Gate of the Sun: where it stands on the court floor, and its size. */
const GATE_X = -4;
const GATE_Z = -11;
const GATE_HALF = 5.5;
const GATE_DEPTH = 1.3;
const GATE_BASE = 0.5;
const DOOR_HALF = 1.3;
const DOOR_TOP = GATE_BASE + 4.6;
const GATE_TOP = GATE_BASE + 8.6;

/** The Ponce monolith. */
const PONCE_X = 5.5;
const PONCE_Z = -7.5;

export const tiwanaku: Monument = {
  id: 'tiwanaku',
  name: 'Tiwanaku',
  iso: 'BOL',
  lat: -16.5545,
  lon: -68.6733,
  // No `realHeight`: a gate, a platform and a court have no one height.
  tier: 'building',
  footprint: 21.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, column } = ctx;

    const andesite = palette.bone;
    const andesiteDark = tone(palette.bone, 0.8);
    const andesiteLight = tone(palette.bone, 1.1);
    const pillar = tone(palette.clay, 0.85);
    const masonry = palette.brown;
    const earth = tone(palette.tan, 0.9);
    const steps = tone(palette.tan, 1.05);

    const draft = new THREE.Group();

    /** A box between two corners, in a frame offset by (ox, oy, oz). */
    const block = (
      x0: number, x1: number,
      y0: number, y1: number,
      z0: number, z1: number,
      color: number,
      ox = 0, oy = 0, oz = 0,
    ): Mesh => {
      const mesh = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color);
      mesh.position.set(ox + (x0 + x1) / 2, oy + y0, oz + (z0 + z1) / 2);
      draft.add(mesh);
      return mesh;
    };

    // -----------------------------------------------------------------------
    // 1. The Kalasasaya: four walls round a court raised to K_FLOOR, a stair
    //    up its front between two jambs.
    // -----------------------------------------------------------------------
    const inner = K_HALF - K_WALL;
    // Side walls run the whole depth; the back wall sits between them.
    for (const side of [-1, 1]) {
      block(side * inner, side * K_HALF, 0, K_TOP, K_BACK, K_FRONT, masonry);
    }
    block(-inner, inner, 0, K_TOP, K_BACK, K_BACK + K_WALL, masonry);
    // The front wall in two halves, each ending inside its jamb so no end face
    // shares the jamb's plane.
    for (const side of [-1, 1]) {
      block(side * (GAP + 0.8), side * K_HALF, 0, K_TOP, K_FRONT - K_WALL, K_FRONT, masonry);
    }
    // The court floor, and the threshold through the gap.
    block(-inner, inner, 0, K_FLOOR, K_BACK + K_WALL, K_FRONT - K_WALL, earth);
    block(-GAP, GAP, 0, K_FLOOR, K_FRONT - K_WALL, K_FRONT, earth);

    // The stair: six steps up to the court floor, the highest against the
    // threshold.
    for (let i = 0; i < 6; i++) {
      block(-GAP, GAP, 0, ((i + 1) * K_FLOOR) / 6, K_FRONT, K_FRONT + 3.6 - i * 0.6, steps);
    }

    // The two jambs of the entrance: the tallest stones in the wall.
    for (const side of [-1, 1]) {
      block(side * GAP, side * (GAP + 1.6), 0, 6.2, K_FRONT - 1.9, K_FRONT + 0.4, pillar);
    }

    // The pillars. Each stands proud of the wall's face and a little over its
    // top, so the ink draws every one: a pillar flush with its wall is a change
    // of colour and nothing else.
    const PILLAR_RISE = 0.5;
    const PILLAR_PROUD = 0.35;
    for (const side of [-1, 1]) {
      for (const x of [5.8, 8.2, 10.6]) {
        block(
          side * (x - 0.55), side * (x + 0.55),
          0, K_TOP + PILLAR_RISE,
          K_FRONT - 1.2, K_FRONT + PILLAR_PROUD,
          pillar,
        );
      }
      for (const z of [-2.6, -5.0, -7.4, -9.8, -12.2]) {
        block(
          side * (K_HALF - 1.0), side * (K_HALF + PILLAR_PROUD),
          0, K_TOP + PILLAR_RISE,
          z - 0.55, z + 0.55,
          pillar,
        );
      }
      // The corner stones are the heaviest, and stand proud on both faces.
      for (const z of [K_FRONT - 0.55, K_BACK + 0.55]) {
        block(
          side * (K_HALF - 1.3), side * (K_HALF + 0.5),
          0, K_TOP + 1.0,
          z - 0.9, z + 0.9,
          pillar,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 2. The Gate of the Sun, on its own low base on the court floor.
    // -----------------------------------------------------------------------
    const gx = GATE_X;
    const gy = K_FLOOR;
    const gz = GATE_Z;
    const front = GATE_DEPTH / 2;
    block(-GATE_HALF - 0.6, GATE_HALF + 0.6, 0, GATE_BASE, -1.2, 1.2, andesiteDark, gx, gy, gz);
    // The jambs and the lintel: one stone in life, three blocks here, merged
    // into one mesh so the ink draws only the outline and the doorway.
    for (const side of [-1, 1]) {
      block(side * DOOR_HALF, side * GATE_HALF, GATE_BASE, DOOR_TOP, -front, front, andesite, gx, gy, gz);
    }
    block(-GATE_HALF, GATE_HALF, DOOR_TOP, GATE_TOP, -front, front, andesite, gx, gy, gz);

    // The frieze: a field cut back into a darker tone, and the figures standing
    // light on it. Field PROUD off the lintel, figures 0.15 off the field.
    const field = front + PROUD + 0.02;
    block(-5.0, 5.0, DOOR_TOP + 0.5, GATE_TOP - 0.7, front - 0.1, field, andesiteDark, gx, gy, gz);
    const relief = field + 0.15;
    // The band under the frieze, its meander reduced to one course.
    block(-5.0, 5.0, DOOR_TOP + 0.1, DOOR_TOP + 0.42, front - 0.1, relief - 0.05, andesiteLight, gx, gy, gz);
    // The staff god over the doorway: a square body under a wider headdress.
    block(-1.0, 1.0, DOOR_TOP + 0.6, GATE_TOP - 0.95, front, relief, andesiteLight, gx, gy, gz);
    block(-1.45, 1.45, GATE_TOP - 1.65, GATE_TOP - 0.8, front, relief, andesiteLight, gx, gy, gz);
    // Three rows of attendants either side, four to a row, all running in
    // towards him.
    const rows = [DOOR_TOP + 1.05, DOOR_TOP + 1.85, DOOR_TOP + 2.65];
    for (const side of [-1, 1]) {
      for (const y of rows) {
        for (const x of [1.95, 2.8, 3.65, 4.5]) {
          block(side * (x - 0.32), side * (x + 0.32), y - 0.3, y + 0.3, front, relief, andesiteLight, gx, gy, gz);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. The Ponce monolith: a squared figure on a plinth, a belt, the beaker
    //    and the sceptre held against the chest, square eyes, a flat crown.
    // -----------------------------------------------------------------------
    const px = PONCE_X;
    const pz = PONCE_Z;
    block(-1.2, 1.2, 0, 0.5, -1.2, 1.2, andesiteDark, px, gy, pz);
    block(-0.8, 0.8, 0.5, 4.9, -0.55, 0.55, andesite, px, gy, pz);
    block(-0.9, 0.9, 1.6, 1.95, -0.65, 0.65, andesiteDark, px, gy, pz);
    // Forearms across the chest, and what each hand holds.
    block(-0.7, 0.7, 3.05, 3.4, 0.4, 0.75, andesiteLight, px, gy, pz);
    block(-0.7, 0.7, 3.6, 3.95, 0.4, 0.75, andesiteLight, px, gy, pz);
    const kero = column(0.28, 0.8, andesiteLight, 8);
    kero.position.set(px - 0.38, gy + 3.95, pz + 0.55);
    draft.add(kero);
    block(0.28, 0.5, 2.3, 4.6, 0.5, 0.85, andesiteLight, px, gy, pz);
    block(-0.7, 0.7, 4.9, 6.2, -0.5, 0.5, andesite, px, gy, pz);
    for (const side of [-1, 1]) {
      block(side * 0.15, side * 0.5, 5.55, 5.85, 0.4, 0.62, andesiteDark, px, gy, pz);
    }
    block(-0.85, 0.85, 6.2, 6.65, -0.62, 0.62, andesiteLight, px, gy, pz);

    // -----------------------------------------------------------------------
    // 4. The sunken temple: stone retaining walls round a square court, the
    //    earth bank they hold back, a stair down through the front, pillars
    //    and tenoned heads on the inside faces, and the bearded monolith.
    // -----------------------------------------------------------------------
    const z0 = PIT_Z;
    // Walls.
    block(-PIT_OUT, PIT_OUT, 0, PIT_TOP, z0 - PIT_OUT, z0 - PIT_IN, masonry);
    for (const side of [-1, 1]) {
      block(side * PIT_IN, side * PIT_OUT, 0, PIT_TOP, z0 - PIT_IN, z0 + PIT_IN, masonry);
      block(side * PIT_GAP, side * PIT_OUT, 0, PIT_TOP, z0 + PIT_IN, z0 + PIT_OUT, masonry);
    }
    // The bank: the ground the court is sunk into, its top a little under the
    // wall's coping so the stone rim reads.
    block(-BANK_OUT, BANK_OUT, 0, BANK_TOP, z0 - BANK_OUT, z0 - PIT_OUT, earth);
    for (const side of [-1, 1]) {
      block(side * PIT_OUT, side * BANK_OUT, 0, BANK_TOP, z0 - PIT_OUT, z0 + BANK_OUT, earth);
      block(side * PIT_GAP, side * PIT_OUT, 0, BANK_TOP, z0 + PIT_OUT, z0 + BANK_OUT, earth);
    }
    // The stair down: four steps from the bank's top to the court floor.
    for (let j = 1; j <= 4; j++) {
      block(-PIT_GAP, PIT_GAP, 0, (BANK_TOP * j) / 4, z0 + PIT_IN + 0.6 * (j - 1), z0 + BANK_OUT, steps);
    }

    // Pillars and heads on the back wall's inner face (it faces +Z) and on
    // the two side walls' inner faces. Four bays a wall between five pillars,
    // two heads a bay on the back wall and one on the sides.
    const PIT_PILLARS = [-4.0, -2.0, 0, 2.0, 4.0];
    const HEAD_PROUD = 0.35;
    const back = z0 - PIT_IN;
    for (const x of PIT_PILLARS) {
      block(x - 0.28, x + 0.28, 0, PIT_TOP + 0.2, back - 0.3, back + 0.15, pillar);
    }
    for (const side of [-1, 1]) {
      for (const dz of PIT_PILLARS) {
        block(side * (PIT_IN - 0.15), side * (PIT_IN + 0.3), 0, PIT_TOP + 0.2, z0 + dz - 0.28, z0 + dz + 0.28, pillar);
      }
    }
    const head = (x0: number, x1: number, y: number, z0h: number, z1h: number): Mesh =>
      block(x0, x1, y - 0.28, y + 0.28, z0h, z1h, andesite);
    for (let bay = 0; bay < 4; bay++) {
      const mid = -3.0 + bay * 2.0;
      for (const y of [0.6, 1.25]) {
        for (const dx of [-0.42, 0.42]) {
          head(mid + dx - 0.22, mid + dx + 0.22, y, back - 0.1, back + HEAD_PROUD);
        }
      }
      for (const side of [-1, 1]) {
        const y = bay % 2 === 0 ? 0.75 : 1.15;
        block(
          side * (PIT_IN - HEAD_PROUD), side * (PIT_IN + 0.1),
          y - 0.28, y + 0.28,
          z0 + mid - 0.22, z0 + mid + 0.22,
          andesite,
        );
      }
    }

    // The bearded monolith in the middle of the court.
    block(-0.8, 0.8, 0, 0.3, -0.8, 0.8, andesiteDark, 0, 0, z0);
    block(-0.45, 0.45, 0.3, 2.7, -0.35, 0.35, andesite, 0, 0, z0);
    block(-0.4, 0.4, 2.7, 3.35, -0.32, 0.32, andesiteLight, 0, 0, z0);

    return ctx.merge(draft);
  },
};
