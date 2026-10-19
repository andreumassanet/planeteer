import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Shibam, Hadhramaut, Yemen.
 *
 * The walled city of mud-brick tower houses, "the Manhattan of the desert":
 * some five hundred houses of five to eleven storeys packed inside a wall on a
 * mound over the wadi. What names it is the density and the uniformity: tall
 * plain blocks of one earthen colour shoulder to shoulder, narrow alleys
 * between, every one whitewashed along its top, with small dark windows in
 * rows. Thirty-five houses stand here on a seven by five grid with narrow
 * alleys; their heights vary by a fixed sequence, never at random.
 *
 * The mud is `tan` lifted, the lime `white`, the windows `bark`. Drawn about
 * 2.5x taller than the plan to keep the skyline's crowding at this size.
 */

const COLS = 7;
const ROWS = 5;
const CELL = 5.4;
const ALLEY = 0.7;
const MOUND = 2.4;

/** A deterministic height for each house, between 12 and 25. */
const heightOf = (i: number, j: number): number => 12 + ((i * 7 + j * 11 + i * j * 3) % 14);

export const shibam: Monument = {
  id: 'shibam',
  name: 'Shibam',
  iso: 'YEM',
  lat: 15.9269,
  lon: 48.6267,
  tier: 'building',
  surface: 'plaster',
  footprint: 29,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, box } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const mud = tone(palette.tan, 1.15);
    const lime = palette.white;
    const window = palette.bark;

    // 1. The mound and the city wall.
    const halfX = (COLS * CELL) / 2 + 1.6;
    const halfZ = (ROWS * CELL) / 2 + 1.6;
    const mound = new THREE.Group();
    mound.scale.set(halfX + 2, 1, halfZ + 2);
    mound.add(taper(1, 0.93, MOUND, tone(palette.tan, 0.9), 4));
    add(mound);
    for (const [w, d, x, z] of [
      [halfX * 2, 1.0, 0, halfZ - 0.5],
      [halfX * 2, 1.0, 0, -halfZ + 0.5],
      [1.0, halfZ * 2, halfX - 0.5, 0],
      [1.0, halfZ * 2, -halfX + 0.5, 0],
    ] as const) {
      const wall = box(w, 3.6, d, mud);
      wall.position.set(x, MOUND, z);
      add(wall);
    }
    // The gate in the south wall.
    const gate = box(4, 6, 2.2, tone(palette.tan, 1.05));
    gate.position.set(0, MOUND, halfZ - 0.5);
    add(gate);
    const arch = box(1.8, 3.4, 0.3, window);
    arch.position.set(0, MOUND, halfZ + 0.65);
    add(arch);

    // 2. The houses.
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const x = (i - (COLS - 1) / 2) * CELL;
        const z = (j - (ROWS - 1) / 2) * CELL;
        const h = heightOf(i, j);
        const w = CELL - ALLEY;
        const body = box(w, h - 1, w, mud);
        body.position.set(x, MOUND, z);
        add(body);
        // The whitewashed top storey and its parapet.
        const top = box(w + 0.16, 2.2, w + 0.16, lime);
        top.position.set(x, MOUND + h - 2.2, z);
        add(top);
        // Rows of small windows on the two faces the eye meets, only where
        // they stand clear of the neighbour in front or beside.
        const clearFront = j === ROWS - 1 ? 3.5 : heightOf(i, j + 1) + 1;
        const clearSide = i === COLS - 1 ? 3.5 : heightOf(i + 1, j) + 1;
        for (let y = MOUND + 3.5; y < MOUND + h - 3; y += 3.2) {
          if (y >= MOUND + clearFront) {
            const front = box(w * 0.55, 0.7, 0.2, window);
            front.position.set(x, y, z + w / 2 + 0.05);
            add(front);
          }
          if (y >= MOUND + clearSide) {
            const side = box(0.2, 0.7, w * 0.55, window);
            side.position.set(x + w / 2 + 0.05, y, z);
            add(side);
          }
        }
      }
    }

    return ctx.merge(draft);
  },
};
