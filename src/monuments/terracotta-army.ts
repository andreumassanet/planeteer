import type { Group, Mesh, Monument } from './contract.ts';

/**
 * Terracotta Army.
 *
 * A pit full of warriors in formation, so the model spends nearly all its
 * meshes on count. Of the `building` tier's 110 meshes, 95 are people (48
 * standing in the ranks, 41 of them with a head, plus three torsos face down
 * and three heads off them) and 12 are earth. A warrior is two meshes and 36
 * triangles: a six-sided tapered body flattened to 0.72 in Z, and a box for the
 * head, which is the site's own subject because the broken end has lost it.
 * They are 7.2 units tall against the 6.8-unit avatar, so a player stands among
 * figures his own size; the head is 1/6 of the figure rather than 1/7.5.
 *
 * y = 0 is the underside of the pit floor (the floor is at 0.8), because
 * `validate` rejects any vertex below zero. The surrounding earth is positive
 * mass and a player arrives on the pit floor at the mouth of the corridors.
 *
 * Crop and distortion: pit 1 is 230 m by 62 m, which would be 870 units long.
 * True scale is kept for the men (1.9 m), the 1.15 m between ranks and the
 * 4.9 m back bank. The plan across the corridors is squeezed about 2.5x: three
 * of eleven corridors, two files each instead of four, partitions 0.8 m
 * thick instead of 2.5. Vertically, at 13 degrees a rim of height h hides a
 * band 4.2h deep, so a true 5 m rim would hide the pit; the side rims are 8.2
 * (a rail you look over) and the partitions stand 5.2 above the floor, so every
 * rank's head and shoulders clear the wall crest. The back bank (18.5, 4.9 m)
 * is the tallest thing and sets the tier's height; shallower and the model
 * would pass `MAX_ASPECT` (65 across, 3.5x wider than tall).
 *
 * Tier `building`: 40 meshes is a dozen warriors. Meshes are the binding
 * constraint (height 18.5 of 40, about 1,900 of 2,600 triangles).
 *
 * Colour is warm earths throughout (a neutral grey reads cold under the blue
 * hemisphere light): `clay` figures; `sand` floor and partitions (the same loess
 * swept flat or beaten into walls); `tan` spoil; `brown` cut faces; `darkOlive`
 * for undisturbed ground (topsoil caps, front kerb, bank). Dark earth is
 * undisturbed, light earth has been dug, and the figures sit between in value.
 */

// --- the pit, in plan: corridors run along Z, away from the viewer, as in every photograph ---

const CORRIDORS = 3;
const CORRIDOR_WIDTH = 5.9;
const WALL_THICKNESS = 3;
const CORRIDOR_PITCH = CORRIDOR_WIDTH + WALL_THICKNESS;
const PIT_HALF_WIDTH = (CORRIDORS * CORRIDOR_WIDTH + (CORRIDORS - 1) * WALL_THICKNESS) / 2;

/** The floor is a thin plate and y = 0 is its underside, so the pit floor is here. */
const FLOOR = 0.8;
const FLOOR_FRONT_Z = 23.5;
const FLOOR_BACK_Z = -22;

/**
 * The partitions. `WALL_HEIGHT` is measured from y = 0, so they stand 5.2 above
 * the floor against figures 7.2 tall. The batter is mild (0.93); because the
 * helper flares X and Z together it ramps the ends down too, like the real
 * unexcavated stubs, and the walls end level with the front rank so those ramps
 * are not blank wedges in front of the army.
 */
const WALL_HEIGHT = 6;
const WALL_LENGTH = 36;
const WALL_CENTRE_Z = 0;
const WALL_BATTER = 0.93;

// --- the rim: a cut face, capped by the dark line of undisturbed ground ---
const RIM_X = PIT_HALF_WIDTH + 2.1;
const RIM_WIDTH = 4.2;
const RIM_HEIGHT = 6.6;
const RIM_BATTER = 0.9;
const RIM_LENGTH = 52;
const RIM_CENTRE_Z = -2;
const CAP_WIDTH = 3.8;
const CAP_HEIGHT = 1.6;
const CAP_LENGTH = 44;

/** The lip you look over. Low on purpose: at 7 deg, anything taller eats the front rank. */
const KERB_WIDTH = 32;
const KERB_HEIGHT = 2.2;
const KERB_DEPTH = 2.8;
const KERB_Z = 24.9;

/** The undug bank the corridors run into. 18.5 units is 4.9 m: the pit's true depth. */
const BANK_WIDTH = 32.1;
const BANK_HEIGHT = 18.5;
const BANK_DEPTH = 8;
const BANK_BATTER = 0.78;
const BANK_Z = -24.5;

/**
 * The earth still standing inside the pit, in two steps down from the bank.
 * They bury the ends of the partitions, and their lit tops keep the dark mass
 * at that end from going flat.
 */
const STEPS: readonly (readonly [z: number, depth: number, height: number])[] = [
  [-20.8, 4.6, 11],
  [-16.2, 4.6, 5.4],
];

/** Spoil fallen out of the lower step, and the one bright thing at the broken end. */
const HEAP_WIDTH = 6;
const HEAP_HEIGHT = 2.2;
const HEAP_DEPTH = 4.6;
const HEAP_X = -8.9;
const HEAP_Z = -11.2;

// --- the formation ---

const RANKS = 8;
const RANK_PITCH = 4.4;
const FRONT_RANK_Z = 17.6;
/** Two files to a corridor, 3.2 apart on 2.1-wide shoulders: they nearly touch. */
const FILES = 2;
const FILE_PITCH = 3.2;

/** From this rank back the figures start losing heads. The army decays into the earth. */
const BROKEN_RANK = 6;

// --- one warrior ---
const BODY_HEIGHT = 5.95;
/** Half-widths across the flats: the hem of the coat, then the shoulders. */
const BODY_HEM = 0.95;
const BODY_SHOULDER = 0.9;
/** A hexagonal prism is as deep as it is wide; a man is not. */
const BODY_FLATTEN = 0.72;
const HEAD_WIDTH = 0.98;
const HEAD_HEIGHT = 1.25;
const HEAD_DEPTH = 0.82;

/** Per-figure variation, as a fraction either side of nominal, and in radians. */
const HEIGHT_RANGE = 0.045;
const YAW = 0.05;
const JITTER = 0.18;
/** Only the broken ranks lean. A leaning figure in the front rank reads as a bug. */
const LEAN = 0.06;

/**
 * Torsos face down on the apron, in front of the first rank: [x, z, yaw, length
 * fraction]. At 13 degrees the back end is hidden behind eight ranks, so the
 * wreckage is on the brightest surface at the bottom of the frame, where it
 * says this is a dig.
 */
const FALLEN: readonly (readonly [x: number, z: number, yaw: number, length: number])[] = [
  [-7.6, 18.9, 0.6, 0.74],
  [2.2, 22.6, -2.5, 0.62],
  [10.2, 19.2, -1.9, 0.7],
];
/** Heads off the fallen, on the same apron: [x, z, yaw]. */
const LOOSE_HEADS: readonly (readonly [x: number, z: number, yaw: number])[] = [
  [-10.2, 20.9, 0.55],
  [-3.4, 21.8, -0.4],
  [5.6, 20.4, 0.3],
];

/**
 * Deterministic variation in [-1, 1], stepping by the golden angle so
 * neighbours differ. Never `Math.random()`: the loader builds twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const terracottaArmy: Monument = {
  id: 'terracotta-army',
  name: 'Terracotta Army',
  iso: 'CHN',
  lat: 34.385,
  lon: 109.278,
  // No `realHeight`: the site has no single height.
  tier: 'building',
  surface: 'none',
  footprint: 34,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const terracotta = palette.clay;
    const loess = palette.sand;
    const spoil = palette.tan;
    const cut = palette.brown;
    const undug = palette.darkOlive;

    const group = new THREE.Group();

    /**
     * A bank of earth: a square frustum carries the batter, then `scale.z` sets
     * the length, which is how a slab that is not square in plan comes out of a
     * helper that makes regular prisms (so every bank also ramps down at its ends).
     */
    const bank = (
      width: number,
      height: number,
      depth: number,
      color: number,
      batter: number,
    ): Mesh => {
      const mesh = taper(width / 2, (width * batter) / 2, height, color, 4);
      mesh.scale.z = depth / width;
      return mesh;
    };

    // --- the floor, swept clean between the ranks and the brightest thing here ---
    const floor = box(PIT_HALF_WIDTH * 2 + 0.4, FLOOR, FLOOR_FRONT_Z - FLOOR_BACK_Z, loess);
    floor.position.z = (FLOOR_FRONT_Z + FLOOR_BACK_Z) / 2;
    group.add(floor);

    // --- the rammed-earth partitions: the parallel lines that name the place ---
    for (let index = 0; index < CORRIDORS - 1; index++) {
      const wall = bank(WALL_THICKNESS, WALL_HEIGHT, WALL_LENGTH, loess, WALL_BATTER);
      wall.position.set((index - (CORRIDORS - 2) / 2) * CORRIDOR_PITCH, 0, WALL_CENTRE_Z);
      group.add(wall);
    }

    // --- the rim, with the modern ground surface as a dark line along its top ---
    for (const side of [-1, 1]) {
      const rim = bank(RIM_WIDTH, RIM_HEIGHT, RIM_LENGTH, cut, RIM_BATTER);
      rim.position.set(side * RIM_X, 0, RIM_CENTRE_Z);
      group.add(rim);

      const cap = box(CAP_WIDTH, CAP_HEIGHT, CAP_LENGTH, undug);
      cap.position.set(side * RIM_X, RIM_HEIGHT, RIM_CENTRE_Z);
      group.add(cap);
    }

    const kerb = box(KERB_WIDTH, KERB_HEIGHT, KERB_DEPTH, undug);
    kerb.position.z = KERB_Z;
    group.add(kerb);

    // --- the far end: the bank the dig has not reached, and the earth still standing in front of it ---
    const bluff = bank(BANK_WIDTH, BANK_HEIGHT, BANK_DEPTH, undug, BANK_BATTER);
    bluff.position.z = BANK_Z;
    group.add(bluff);

    for (const [z, depth, height] of STEPS) {
      const step = box(PIT_HALF_WIDTH * 2, height, depth, cut);
      step.position.z = z;
      group.add(step);
    }

    const heap = bank(HEAP_WIDTH, HEAP_HEIGHT, HEAP_DEPTH, spoil, 0.35);
    heap.position.set(HEAP_X, FLOOR, HEAP_Z);
    group.add(heap);

    /**
     * One warrior, standing on y = 0 and facing +Z, out through the mouth of the
     * pit. The head is a separate mesh so the outline inks it apart from the
     * shoulders.
     */
    const warrior = (index: number, headed: boolean): Group => {
      const figure = new THREE.Group();
      const height = BODY_HEIGHT * (1 + HEIGHT_RANGE * wobble(index, 0));

      const body = taper(BODY_HEM, BODY_SHOULDER, height, terracotta, 6);
      body.scale.z = BODY_FLATTEN;
      figure.add(body);

      if (headed) {
        const head = box(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, terracotta);
        head.position.y = height - 0.02;
        head.rotation.y = YAW * 2 * wobble(index, 3);
        figure.add(head);
      }

      return figure;
    };

    // --- the ranks ---
    let index = 0;
    for (let corridor = 0; corridor < CORRIDORS; corridor++) {
      const centre = (corridor - (CORRIDORS - 1) / 2) * CORRIDOR_PITCH;
      for (let file = 0; file < FILES; file++) {
        const x = centre + (file - (FILES - 1) / 2) * FILE_PITCH;
        for (let rank = 0; rank < RANKS; rank++) {
          index++;
          const z = FRONT_RANK_Z - rank * RANK_PITCH;
          // The damage is irregular: the last rank has gone, the one before about half.
          const broken = rank > BROKEN_RANK || (rank === BROKEN_RANK && wobble(index, 5) > 0);
          const figure = warrior(index, !broken);
          figure.position.set(x + JITTER * wobble(index, 1), FLOOR, z + JITTER * wobble(index, 2));
          figure.rotation.y = YAW * wobble(index, 4);
          if (broken) {
            // Sunk 0.4 into the floor plate and out of true: the ones the earth still
            // holds. Nothing reaches below y = 0.
            figure.position.y = FLOOR - 0.4;
            figure.rotation.z = LEAN * wobble(index, 6);
            figure.rotation.x = LEAN * wobble(index, 7);
          }
          group.add(figure);
        }
      }
    }

    // --- what is left of the rest ---
    for (const [x, z, yaw, length] of FALLEN) {
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      // Laid on its front: `scale.z` flattened the chest, and after the quarter turn about X that lets the torso lie low.
      const torso = taper(BODY_HEM, BODY_SHOULDER, BODY_HEIGHT * length, terracotta, 6);
      torso.scale.z = BODY_FLATTEN;
      torso.rotation.x = Math.PI / 2;
      pivot.add(torso);
      pivot.position.set(x, FLOOR + BODY_HEM * BODY_FLATTEN, z);
      group.add(pivot);
    }

    for (const [x, z, yaw] of LOOSE_HEADS) {
      const head = box(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH, terracotta);
      head.rotation.set(Math.PI / 2, yaw, 0);
      head.position.set(x, FLOOR + HEAD_DEPTH / 2, z);
      group.add(head);
    }

    return group;
  },
};
