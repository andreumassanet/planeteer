import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Terracotta Army.
 *
 * Pit 1 seen from its open end, as in every photograph: long corridors of
 * rammed earth running away from the viewer, each with two files of warriors
 * in it, and the vanguard standing three deep across the front, facing out.
 * What names it is the count and the order, so the triangles go on men: a
 * warrior is a four-sided body broadening to the shoulders and a head, 24
 * triangles, and 70 of them stand here, each a slightly different tone of
 * `clay` as the real faces and fired colours differ. A team of four horses
 * stands at the head of the middle corridor, where the chariots were.
 *
 * The partitions carry a dark beam along their crest, the timber roof that
 * once covered the corridors, which is the one detail that says "excavated"
 * rather than "parade ground". The back of the pit is a high cut bank of loess
 * under a cap of topsoil; it is what keeps the model inside `MAX_ASPECT`, as
 * the real pit's earth banks frame the photograph.
 *
 * Crop and distortion: pit 1 is 230 m by 62 m. Five of its eleven corridors
 * are kept, two files each instead of four, and the men are 1.2x the avatar.
 * Warm earths throughout: `clay` men, `sand` floor, `tan` partitions, `brown`
 * cut faces, `darkOlive` undisturbed topsoil.
 */

/** The pit's inside, in plan: x across the corridors, z towards the viewer. */
const HALF_X = 19;
const BACK_Z = -15;
const FRONT_Z = 16;

/** The corridors: five, each `CORRIDOR` wide between partitions `WALL` thick. */
const CORRIDORS = 5;
const CORRIDOR = 5.6;
const WALL = 1.4;
const WALL_TOP = 2.7;
/** Where the partitions stop and the vanguard's open ground begins. */
const WALL_FRONT = 7.5;

/** The men. */
const BODY = 3.3;
const HEAD = 0.8;

/** A deterministic tone for the nth man, so no two neighbours are alike. */
const toneOf = (n: number): number => 0.86 + ((n * 37) % 23) / 100;

export const terracottaArmy: Monument = {
  id: 'terracotta-army',
  name: 'Terracotta Army',
  iso: 'CHN',
  lat: 34.385,
  lon: 109.278,
  tier: 'building',
  surface: 'none',
  footprint: 29.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, taper, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    let count = 0;

    const warrior = (x: number, z: number, facing: number): void => {
      const n = count++;
      const fired = tone(palette.clay, toneOf(n));
      const body = taper(0.62, 0.78, BODY, fired, 4);
      body.position.set(x, 0.3, z);
      body.rotation.y = facing;
      add(body);
      const head = box(0.56, HEAD, 0.56, tone(palette.clay, 0.74));
      head.position.set(x, 0.3 + BODY, z);
      head.rotation.y = facing;
      add(head);
    };

    // 1. The floor, the side banks and the high back bank.
    const floor = box(HALF_X * 2, 0.3, FRONT_Z - BACK_Z, palette.sand);
    floor.position.z = (FRONT_Z + BACK_Z) / 2;
    add(floor);
    for (const side of [1, -1]) {
      const bank = box(3, 5, FRONT_Z - BACK_Z + 4, palette.brown);
      bank.position.set(side * (HALF_X + 1.5), 0, (FRONT_Z + BACK_Z) / 2 - 2);
      add(bank);
      const cap = box(3.2, 0.8, FRONT_Z - BACK_Z + 4.2, palette.darkOlive);
      cap.position.set(side * (HALF_X + 1.5), 5, (FRONT_Z + BACK_Z) / 2 - 2);
      add(cap);
    }
    const back = taper(1, 0.86, 14, palette.brown, 4);
    const backStretch = new THREE.Group();
    backStretch.scale.set(HALF_X + 2, 1, 2.6);
    backStretch.position.z = BACK_Z - 2.6;
    backStretch.add(back);
    add(backStretch);
    const backCap = box((HALF_X + 2) * 1.72 + 0.2, 1.0, 2.6 * 1.72 + 0.2, palette.darkOlive);
    backCap.position.set(0, 14, BACK_Z - 2.6);
    add(backCap);
    const kerb = box(HALF_X * 2 + 6, 0.9, 1.4, palette.darkOlive);
    kerb.position.z = FRONT_Z + 0.7;
    add(kerb);

    // 2. The partitions, with the timber roof's beam along each crest.
    const span = CORRIDORS * CORRIDOR + (CORRIDORS + 1) * WALL;
    const left = -span / 2;
    const wallLength = WALL_FRONT - BACK_Z;
    for (let k = 0; k <= CORRIDORS; k++) {
      const x = left + WALL / 2 + k * (CORRIDOR + WALL);
      const wall = box(WALL, WALL_TOP, wallLength, palette.tan);
      wall.position.set(x, 0.3, BACK_Z + wallLength / 2);
      add(wall);
      const beam = box(WALL * 0.5, 0.35, wallLength + 0.4, palette.bark);
      beam.position.set(x, 0.3 + WALL_TOP, BACK_Z + wallLength / 2);
      add(beam);
    }
    // A few fallen beams across the back of two corridors.
    for (const [x, z] of [[left + WALL + CORRIDOR * 0.5, -12.5], [left + (WALL + CORRIDOR) * 3 + WALL + CORRIDOR * 0.5, -11.5]] as const) {
      add(strut(new THREE.Vector3(x - 2.6, 0.5, z), new THREE.Vector3(x + 2.6, 1.3, z + 0.8), 0.4, palette.bark));
    }

    // 3. The men in the corridors: two files, six ranks, facing out (+Z).
    for (let c = 0; c < CORRIDORS; c++) {
      const centre = left + WALL + CORRIDOR / 2 + c * (CORRIDOR + WALL);
      for (let rank = 0; rank < 5; rank++) {
        const z = 5 - rank * 3.6;
        if (c === 2 && rank < 2) continue; // the chariot team stands here
        for (const file of [-1, 1]) warrior(centre + file * 1.35, z, 0);
      }
    }

    // 4. The vanguard: three ranks across the front, facing out.
    for (let rank = 0; rank < 3; rank++) {
      for (let k = 0; k < 8; k++) {
        const x = -15.4 + k * 4.4 + (rank % 2) * 1.2;
        warrior(x, 14 - rank * 2.4, 0);
      }
    }

    // 5. The chariot team at the head of the middle corridor: four horses abreast.
    const centre = left + WALL + CORRIDOR / 2 + 2 * (CORRIDOR + WALL);
    for (let h = 0; h < 4; h++) {
      const x = centre - 1.95 + h * 1.3;
      const coat = tone(palette.clay, toneOf(h + 40));
      for (const z of [5.2, 2.2]) {
        const legs = box(0.75, 1.9, 0.6, coat);
        legs.position.set(x, 0.3, z);
        add(legs);
      }
      const barrel = box(0.85, 1.2, 4.0, coat);
      barrel.position.set(x, 2.1, 3.6);
      add(barrel);
      add(strut(new THREE.Vector3(x, 3.0, 5.4), new THREE.Vector3(x, 4.4, 6.4), 0.6, coat));
      const muzzle = box(0.55, 0.6, 1.3, coat);
      muzzle.position.set(x, 4.0, 6.9);
      add(muzzle);
    }
    // The chariot's box behind them, its wood long gone: two wheels and a floor.
    for (const side of [-1, 1]) {
      const wheel = ctx.column(1.25, 0.25, palette.bark, 8);
      const turn = new THREE.Group();
      turn.position.set(centre + side * 2.4, 1.55, -0.2);
      turn.rotation.z = Math.PI / 2;
      wheel.position.y = -0.125;
      turn.add(wheel);
      add(turn);
    }
    const bed = box(4.4, 0.4, 2.2, palette.bark);
    bed.position.set(centre, 1.4, -0.2);
    add(bed);

    return ctx.merge(draft);
  },
};
