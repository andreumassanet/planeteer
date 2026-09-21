import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Genghis Khan Equestrian Statue — Tsonjin Boldog, Mongolia.
 *
 * **Why Mongolia:** it is 1.5 million square kilometres between Russia and China
 * and there was nothing on it — nor on Kazakhstan, Kyrgyzstan, Turkmenistan or
 * anywhere else in the interior of Asia. Fifty kilometres east of Ulaanbaatar
 * there is a 40 m stainless-steel horseman standing on a drum of thirty-six
 * columns in an otherwise empty valley, which is the largest equestrian statue
 * in the world and the only thing in the country you can see from a long way
 * off. It is also the world's first **horse**: sixty-five landmarks and not one
 * animal among them.
 *
 * ---------------------------------------------------------------------------
 * The front of this monument is the horse's flank, deliberately
 * ---------------------------------------------------------------------------
 *
 * The contract asks a model to face +Z, and for a building that means the
 * façade. For an equestrian statue it has to mean **the profile**, because a
 * horse seen head-on is a post with ears. The contact sheet's quarter view sits
 * 31.8 degrees round from +Z, so a horse whose long axis runs along X is seen
 * 31.8 degrees off broadside — its length foreshortened to 0.85 — and in the
 * front view it is exactly side-on. Any other choice loses the animal.
 *
 * Christ the Redeemer settled the same argument the same way: its arms run along
 * X and its front is the chest, because the T is the silhouette.
 *
 * ---------------------------------------------------------------------------
 * What has to survive at 260 pixels
 * ---------------------------------------------------------------------------
 *
 * Three things, and none of them is detail.
 *
 * **The drum.** It is 30 m across under a 40 m statue — a third of the total
 * height and almost as wide as the horse is long — and it is what makes the
 * thing monumental rather than merely large. Sixteen columns round it rather
 * than the real thirty-six: at this size thirty-six columns are 1.6 units apart
 * and `OutlineEffect` draws them as one grey band, where sixteen read as a
 * colonnade. That is the joint-count rule (few ink lines read as natural, many
 * as manufactured) in its usual direction, and the count was chosen by what the
 * ink can resolve.
 *
 * **The horse's line.** Deep chest, level back, high croup, and a neck that
 * leaves the shoulder at about 50 degrees. Four legs straight down, which is
 * both what the statue does and the only pose whose feet all reach the plinth.
 *
 * **The silver.** The real thing is 250 tonnes of mirror-polished stainless
 * steel, and `bone` is the pale neutral of the twenty-four. It is used here in
 * the one place the palette note says it is safe — a large object in full light —
 * and every part of it that turns away from the sun is `slate` instead: the
 * belly, the underside of the neck, the saddle, the mane and the tail. That is
 * not shading, it is a *material* split, and it is what keeps the figure from
 * going hueless where the light leaves it.
 *
 * The whip is `gold`. Genghis is holding a golden whip because of the legend the
 * site is built on — he found one here — and it is the one warm note against the
 * silver and the one thing carrying the eye to the top of the model.
 *
 * ---------------------------------------------------------------------------
 * Proportion
 * ---------------------------------------------------------------------------
 *
 * Real: a 10 m base under a 40 m statue, 1:4. Here: 21.0 under 47.5, 1:2.3. The
 * base is a third taller than it should be relative to the figure, which is the
 * tier's doing — at true proportion the drum is 14 units, thinner than the
 * horse's own body is deep, and a colonnade cannot be read in it at all.
 *
 * Half-diagonal 18.8 against 68.5 is 0.27, well inside the 2.0 cap.
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
    // A shadow wall behind the colonnade, so the gaps between the columns are
    // gaps and not sky. Sixteen posts standing against nothing read as a fence —
    // and the wall has to be **dark**, not merely a shade cooler: at `slate`
    // against `cream` posts the whole storey rendered as one smooth band of drum
    // and the colonnade was not there at all.
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
      const leg = taper(thickness, thickness * 0.72, BELLY - DECK - 1.0, under, 6);
      leg.position.set(x, DECK, z);
      group.add(leg);
      // The gaskin or forearm: a thicker section on the top half, which is what
      // makes a leg read as a leg rather than as a pipe.
      const upper = taper(thickness * 1.45, thickness * 1.05, 4.6, steel, 6);
      upper.position.set(x, BELLY - 5.6, z);
      group.add(upper);
      const hoof = column(thickness * 1.15, 0.9, under, 6);
      hoof.position.set(x, DECK - 0.9, z);
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
    // 3. The rider. A Mongol *deel* is a long coat that flares over the saddle,
    //    so the figure is a taper and not a cylinder — the flare is what stops
    //    him reading as a bollard on a horse.
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
