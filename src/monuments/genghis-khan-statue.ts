import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * The Genghis Khan Equestrian Statue — Tsonjin Boldog, Mongolia.
 *
 * A 40 m stainless-steel horseman on a drum of thirty-six columns, the world's
 * largest equestrian statue.
 *
 * The front is the horse's flank: a horse seen head-on is a post with ears. The
 * three-quarter view sits 31.8 degrees round from +Z, so a horse along X is seen
 * 31.8 degrees off broadside (length foreshortened to 0.85) and side-on from the
 * front. Christ the Redeemer makes the same choice for its arms.
 *
 * - The drum: 30 m across under a 40 m statue, a third of the total height. Sixteen
 *   columns rather than thirty-six, which would be 1.6 units apart and inked as
 *   one grey band.
 * - The horse's line: deep chest, level back, high croup, a neck leaving the
 *   shoulder at about 50 degrees, four legs straight down (the only pose whose
 *   feet all reach the plinth).
 * - The silver: `bone` in full light, and every part turned from the sun
 *   (belly, underside of the neck, saddle, mane, tail) is `slate`, a material
 *   split rather than shading. The whip is `gold`, the one warm note, carrying
 *   the eye to the top.
 *
 * Proportion: 21.0 of base under 47.5 of statue (1:2.3 against 1:4 in life; true
 * proportion leaves a drum too thin to read a colonnade). Half-diagonal 18.8
 * over 68.5 is 0.27.
 */

/** The drum: its plinth, its wall, its colonnade and the slab the horse stands on. */
const PLINTH = 18.4;
const DRUM = 17.0;
const DRUM_TOP = 11.0;
const COLONNADE = 18.0;
const DECK = 21.0;

/** Where the horse's belly and back are. Everything about the animal hangs off these. */
const BELLY = 33.5;
const BACK = 42.5;

export const genghisKhanStatue: Monument = {
  id: 'genghis-khan-statue',
  name: 'Genghis Khan Equestrian Statue',
  iso: 'MNG',
  lat: 47.8083,
  lon: 107.5306,
  realHeight: 40,
  tier: 'tower',
  surfaces: { bone: 'metal', slate: 'metal' },
  footprint: 20,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, strut, around } = ctx;

    const steel = palette.bone; // mirror-polished stainless, in full light
    const under = palette.slate; // every surface of it the sun does not reach
    const stone = palette.tan; // the plinth and the cornice
    const wall = palette.cream; // the drum and its columns
    const whip = palette.gold; // the legend the whole site is built on
    const dark = palette.bark; // the door into the base, and the horse's eye

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
    // 1. The drum: plinth, wall, colonnade, cornice, deck.
    // -----------------------------------------------------------------------
    const plinth = column(PLINTH, 1.6, stone, 16);
    group.add(plinth);
    const drum = column(DRUM, DRUM_TOP - 1.6, wall, 16);
    drum.position.y = 1.6;
    group.add(drum);

    // The entrance. The real base is a museum and you go in at the front.
    block(-3.2, 3.2, 1.6, 8.8, DRUM - 0.6, DRUM + 0.1, dark);

    group.add(
      around(16, () => {
        const post = column(1.05, COLONNADE - DRUM_TOP, wall, 6);
        post.position.set(0, DRUM_TOP, DRUM - 0.2);
        return post;
      }),
    );
    // A shadow wall behind the colonnade so the gaps are gaps and not sky. It
    // must be dark (`slate` against `cream` posts rendered the storey as one band).
    const backing = column(DRUM - 3.4, COLONNADE - DRUM_TOP, dark, 16);
    backing.position.y = DRUM_TOP;
    group.add(backing);

    const cornice = column(PLINTH - 0.4, 1.4, stone, 16);
    cornice.position.y = COLONNADE;
    group.add(cornice);
    const deck = column(DRUM - 0.8, DECK - COLONNADE - 1.4, wall, 16);
    deck.position.y = COLONNADE + 1.4;
    group.add(deck);

    // -----------------------------------------------------------------------
    // 2. The horse, along X and facing +X. Legs first, because everything else
    //    hangs from where the belly ends up.
    // -----------------------------------------------------------------------
    for (const [x, z, thickness] of [
      [7.2, 2.0, 1.15],
      [7.2, -2.0, 1.15],
      [-6.6, 2.1, 1.25],
      [-6.6, -2.1, 1.25],
    ] as const) {
      // The shank stops `PROUD` inside the gaskin and the hoof stands `PROUD` over
      // the deck, so no tops share a plane with a face of another colour.
      const leg = taper(thickness, thickness * 0.72, BELLY - DECK - 1.0 - PROUD, under, 6);
      leg.position.set(x, DECK, z);
      group.add(leg);
      // The gaskin or forearm: a thicker section on the top half, which is what
      // makes a leg read as a leg rather than as a pipe.
      const upper = taper(thickness * 1.45, thickness * 1.05, 4.6, steel, 6);
      upper.position.set(x, BELLY - 5.6, z);
      group.add(upper);
      const hoof = column(thickness * 1.15, 0.9, under, 6);
      hoof.position.set(x, DECK - 0.9 + PROUD, z);
      group.add(hoof);
    }

    // The barrel. Three masses, not one: a deep chest at the front, the barrel
    // proper, and the croup rising behind. One box is a crate.
    block(2.0, 9.6, BELLY - 1.2, BACK, -3.3, 3.3, steel);
    block(-5.4, 2.0, BELLY, BACK - 0.6, -3.6, 3.6, steel);
    block(-9.4, -5.4, BELLY + 1.6, BACK + 0.4, -3.2, 3.2, steel);
    // The belly, in the shade colour, so the underside of the animal is not the
    // same value as its back.
    block(-6.0, 8.4, BELLY - 1.6, BELLY + 1.0, -2.9, 2.9, under);

    // The neck, one strut from the withers up and forward, with a mane laid on
    // it. `strut` is placed by its endpoints, so a diagonal needs no rotation.
    group.add(
      strut(
        new THREE.Vector3(8.0, BACK - 2.4, 0),
        new THREE.Vector3(13.4, BACK + 6.4, 0),
        3.6,
        steel,
      ),
    );
    group.add(
      strut(
        new THREE.Vector3(7.4, BACK - 1.0, 0),
        new THREE.Vector3(12.6, BACK + 7.4, 0),
        1.5,
        under,
      ),
    );

    // The head: a jowl, a muzzle thrown forward and down, and two ears.
    block(12.2, 15.6, BACK + 5.2, BACK + 9.0, -1.5, 1.5, steel);
    block(14.6, 18.2, BACK + 4.6, BACK + 7.2, -1.2, 1.2, steel);
    block(17.2, 18.4, BACK + 4.9, BACK + 6.4, -1.0, 1.0, under);
    for (const side of [-1, 1]) {
      const ear = taper(0.5, 0.12, 1.7, steel, 4);
      ear.position.set(13.0, BACK + 9.0, side * 0.85);
      group.add(ear);
    }
    for (const side of [-1, 1]) {
      const eye = box(0.5, 0.5, 0.35, dark);
      eye.position.set(14.4, BACK + 7.2, side * 1.5);
      group.add(eye);
    }

    // The tail, hanging off the croup.
    const tail = taper(1.35, 0.55, 9.6, under, 5);
    tail.rotation.x = Math.PI;
    tail.position.set(-9.8, BACK + 1.4, 0);
    group.add(tail);

    // -----------------------------------------------------------------------
    // 3. The rider. A Mongol deel flares over the saddle, so the figure is a taper
    //    and not a cylinder.
    // -----------------------------------------------------------------------
    const saddle = box(6.6, 1.4, 7.2, under);
    saddle.position.set(1.2, BACK, 0);
    group.add(saddle);

    const SEAT = BACK + 1.4;
    const coat = taper(3.5, 2.5, 8.4, steel, 6);
    coat.position.set(1.2, SEAT, 0);
    group.add(coat);
    // The skirts of the deel, spread over the horse's flanks.
    for (const side of [-1, 1]) {
      const skirt = taper(1.5, 2.4, 4.2, under, 4);
      skirt.rotation.x = Math.PI;
      skirt.position.set(1.2, SEAT + 4.4, side * 3.3);
      group.add(skirt);
    }
    // Legs, gripping the barrel.
    for (const side of [-1, 1]) {
      const thigh = box(2.2, 2.0, 4.4, under);
      thigh.position.set(1.6, SEAT + 0.4, side * 3.6);
      group.add(thigh);
      const shin = taper(0.85, 0.7, 4.6, steel, 5);
      shin.rotation.x = Math.PI;
      shin.position.set(2.4, SEAT + 1.6, side * 3.9);
      group.add(shin);
    }

    const chest = taper(2.9, 2.6, 4.0, steel, 6);
    chest.position.set(1.2, SEAT + 8.4, 0);
    group.add(chest);

    // The head, and the *toortsog* — the pointed Mongol cap, which is more of
    // the silhouette than the face is.
    const neck = column(1.0, 1.0, under, 6);
    neck.position.set(1.2, SEAT + 12.4, 0);
    group.add(neck);
    const head = box(2.6, 3.0, 2.6, steel);
    head.position.set(1.2, SEAT + 13.4, 0);
    group.add(head);
    const brim = column(2.0, 0.6, under, 8);
    brim.position.set(1.2, SEAT + 16.4, 0);
    group.add(brim);
    const cap = taper(1.75, 0.2, 3.0, steel, 8);
    cap.position.set(1.2, SEAT + 17.0, 0);
    group.add(cap);

    // -----------------------------------------------------------------------
    // 4. The arms and the whip. The left arm holds the reins low and the right
    //    is raised, and what it is holding is the top of the model.
    // -----------------------------------------------------------------------
    group.add(
      strut(
        new THREE.Vector3(1.6, SEAT + 11.4, -2.6),
        new THREE.Vector3(5.6, SEAT + 6.6, -3.4),
        1.5,
        steel,
      ),
    );
    group.add(
      strut(
        new THREE.Vector3(1.6, SEAT + 11.6, 2.6),
        new THREE.Vector3(-1.4, SEAT + 15.8, 3.6),
        1.5,
        steel,
      ),
    );
    group.add(
      strut(
        new THREE.Vector3(-1.4, SEAT + 14.4, 3.6),
        new THREE.Vector3(-3.9, SEAT + 24.2, 4.6),
        0.72,
        whip,
      ),
    );
    // The lash, doubled back — a straight rod reads as a spear, and he is not
    // holding a spear.
    group.add(
      strut(
        new THREE.Vector3(-3.9, SEAT + 24.2, 4.6),
        new THREE.Vector3(-0.8, SEAT + 22.0, 4.2),
        0.5,
        whip,
      ),
    );

    return group;
  },
};
