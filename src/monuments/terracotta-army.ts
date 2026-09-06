import type { Group, Mesh, Monument } from './contract.ts';

/**
 * Terracotta Army.
 *
 * **One warrior is a statue in a museum; a pit full of them in formation is the
 * Terracotta Army.** So this model spends almost everything it owns on count. Of
 * the `building` tier's 110 meshes, **95 are people and 12 are earth** — 48
 * standing in the ranks, 41 of those still with a head, plus three torsos face
 * down on the floor and three heads off them — and most of what follows is the
 * arithmetic of that split.
 *
 * **How cheap a warrior is: two meshes, 36 triangles.** A six-sided tapered body
 * — flattened to 0.72 in Z, so the shoulders are wider than the chest is deep —
 * and a box for the head. One mesh per man was the tempting answer, because it
 * buys ninety figures instead of forty-eight; it is also a rank of fence posts.
 * The head is the whole difference between a peg and a standing man, it is about
 * 4 px on the contact sheet's thumbnail, and it is not decoration here but the
 * site's own subject, because the figures at the broken end are precisely the
 * ones that have lost it. So two meshes, and the size of the army falls out as
 * `(110 - earth - wreckage) / 2`.
 *
 * Where this parts company with the moai, the other row-of-figures card in the
 * set: a moai's head is two fifths of it and that disguise is the whole point,
 * while these are **men** — 7.2 units against the 6.8-unit avatar, so a player
 * who walks in stands among figures his own size, which no other monument here
 * can say. The head is 1/6 of the figure rather than a human 1/7.5, the smallest
 * cheat that survives the ink at thumbnail size.
 *
 * # Where y = 0 is, and why
 *
 * **y = 0 is the underside of the pit floor**, so the excavation floor is at 0.8
 * and every grain of earth is *above* it. The alternative — y = 0 at the
 * surrounding ground, with the pit dug down into it — is not on offer:
 * `validate` rejects any vertex below zero, and the entire subject of this
 * monument is below ground. Putting the floor at the bottom turns the
 * surrounding earth from a hole into positive mass, which is exactly what an
 * excavation edge is once you are standing in it: a bank over your head. It also
 * settles the visit. A player arrives **on the pit floor**, at the mouth of the
 * corridors, at eye level with the front rank. The pit still reads as sunk from
 * outside, but it reads that way because of the rim and the bank, not because of
 * where the origin sits.
 *
 * # The crop, and what is distorted
 *
 * Pit 1 is 230 m by 62 m, 5 m deep, eleven corridors, some six thousand figures.
 * At the avatar's scale (6.8 units to 1.8 m, so 3.8 units per metre) it would be
 * 870 units long — twelve times this tier's whole footprint. Kept at true scale:
 * the men (1.9 m), the 1.15 m between ranks, and the 4.9 m depth of the bank at
 * the back. Squeezed: **the plan across the corridors, by about 2.5x.** Three
 * corridors of the eleven, two files to a corridor instead of four, and earth
 * partitions 0.8 m thick instead of 2.5. What survives that squeeze is the
 * density of the formation, which is the thing being drawn; what is given away
 * is how much elbow room the ranks had, which no photograph of the place shows
 * you anyway.
 *
 * The other distortion is vertical, and it is forced by the camera. **The
 * contact sheet views this from 7 deg and 13 deg above the horizon, and at 13
 * deg a rim of height h hides a band 4.2h deep behind it.** A rim at the true
 * 5 m (19 units) hides the entire pit: the monument becomes a lump of earth with
 * a slot in it. So the side rims are trimmed to 8.2 — head height, a rail you
 * look over — and the rammed-earth partitions stand 5.2 above the floor, which
 * puts every rank's head and shoulders above the wall crest. In the real pit
 * those walls stood a good half-metre over the tallest man. This is the trade
 * the `MAX_ASPECT` note describes, in its other direction: protect the
 * proportion that names the thing (files of figures between parallel walls) and
 * give away the one that does not (how far the diggers had to climb down). The
 * true depth survives at the back bank, which is also the tallest thing here and
 * therefore the height the tier measures.
 *
 * # Tier
 *
 * **`building`.** By the tier's own question — from how far should a player be
 * able to name it — a pit is not a `landmark`: you cannot see a hole from out at
 * sea. It is a walled excavation the size of a city block, read on approach,
 * which is what `building` is for. Mechanically it is also the only tier that
 * fits: `monument` caps at 40 meshes, and 40 meshes is a dozen warriors, which
 * is a museum vitrine and not an army. Nothing here is near the height cap (18.5
 * of 40) or the triangles (~1,900 of 2,600); the binding constraint from the
 * first line to the last is **meshes**.
 *
 * At 65 units across and 18.5 tall the model is 3.5x wider than tall, just
 * inside `MAX_ASPECT` — and that is why the back bank is 18.5 and not 12. A
 * shallower one puts the whole thing over the limit, and the honest way to buy
 * height in a pit is the earth it was cut into.
 *
 * # Colour
 *
 * Warm earths throughout, on purpose. A neutral grey — which is what unpigmented
 * terracotta actually is — reads **cold** in this scene, because the hemisphere
 * light's sky colour is blue and half of this model is a shaded pit floor lit
 * mostly by that. So `clay` for the figures; `sand` for the floor **and** the
 * partitions, which are one material because that is the truth of the place —
 * the same loess, swept flat or beaten into walls — and because the brightest
 * earth in the palette behind every rank is what makes the figures read at
 * thumbnail size; `tan` for the loose spoil, `brown` for cut faces, and
 * `darkOlive` for ground nobody has touched: the topsoil caps, the front kerb
 * and the bank. That last split doubles as a code the eye reads without being
 * told — **dark earth is undisturbed, light earth has been dug** — and it leaves
 * the figures sitting between the two in value, so they never disappear against
 * either the floor they stand on or the bank behind them.
 */

// ---------------------------------------------------------------------------
// The pit, in plan. Corridors run along Z, away from the viewer, because that is
// the composition of every photograph of the place.
// ---------------------------------------------------------------------------

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
 * the floor against figures 7.2 tall — see above for why the crests are kept
 * below the heads. The batter is what eroded rammed earth does; because the
 * helper flares X and Z together it also ramps the ends down, which is what the
 * unexcavated stubs of these walls look like in any case. Kept very mild (0.93),
 * and the walls end level with the front rank: at 0.78, and running on into the
 * apron, those end ramps are pale blank wedges standing in front of the army,
 * and they take the eye off it.
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
 * The earth still standing inside the pit, in two steps down from the bank. They
 * bury the ends of the partitions — which is why the walls need no ruined
 * variant of their own — and their lit top faces are what keeps the dark mass at
 * that end from going flat.
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

// ---------------------------------------------------------------------------
// The formation
// ---------------------------------------------------------------------------

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
 * fraction]. **They are here rather than at the ruined back end because at 13
 * deg the back end is behind eight ranks of standing men and cannot be seen.**
 * On the apron they lie on the brightest surface in the model, right at the
 * bottom of the frame, and they are what tells you this is a dig and not a
 * parade ground. The back end keeps the other half of the wreckage — the
 * headless ranks leaning where the earth still holds them.
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
 * Deterministic variation in [-1, 1]. The step is the golden angle, so
 * neighbours in a rank never land on the same value and the formation never
 * falls into a visible pattern. `Math.random()` is out: the loader builds twice
 * and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const terracottaArmy: Monument = {
  id: 'terracotta-army',
  name: 'Terracotta Army',
  iso: 'CHN',
  lat: 34.385,
  lon: 109.278,
  // No `realHeight`, matching the source list. The site has no height: the pit
  // is 5 m deep and the men standing in it are 1.8 to 2 m, and neither number is
  // the height of the Terracotta Army.
  tier: 'building',
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
     * the length. It is the only way to get a slab that is not square in plan
     * out of a helper that makes regular prisms, and the reason every bank here
     * ramps down at its ends as well as leaning in at its sides.
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

    // --- the far end: the bank the dig has not reached, and the earth still
    //     standing in the corridors in front of it ---
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
     * One warrior, standing on y = 0 and facing +Z — which is where the army
     * faces, out through the mouth of the pit. The head is a separate mesh so
     * `OutlineEffect` inks it apart from the shoulders: at thumbnail size that
     * one line is what makes the silhouette a man and not a post.
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
          // The damage is not regular: the last rank has gone entirely, the one
          // before it about half, and which half is the wobble's business.
          const broken = rank > BROKEN_RANK || (rank === BROKEN_RANK && wobble(index, 5) > 0);
          const figure = warrior(index, !broken);
          figure.position.set(x + JITTER * wobble(index, 1), FLOOR, z + JITTER * wobble(index, 2));
          figure.rotation.y = YAW * wobble(index, 4);
          if (broken) {
            // Sunk 0.4 into the floor plate and out of true: these are the ones
            // the earth is still holding. Nothing reaches below y = 0 — that is
            // what the floor's 0.8 of thickness is for.
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
      // Laid on its front: `scale.z` flattened the chest, and after the quarter
      // turn about X that flattening is what lets the torso lie low on the floor.
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
