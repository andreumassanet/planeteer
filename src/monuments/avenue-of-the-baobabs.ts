import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Avenue of the Baobabs — Menabe, Madagascar.
 *
 * **Why Madagascar:** it is the fourth largest island in the world, it is four
 * hundred kilometres of it across the minimap, and there was nothing on it. The
 * whole Indian Ocean was empty — Madagascar, Mauritius, the Seychelles, the
 * Comoros, Réunion — and this is the one thing on any of them that a person
 * would fly somewhere to look at.
 *
 * **And it is a landmark made of plants**, which is a category the world did not
 * have. The list already holds a glacier, three mountains, two waterfalls, a
 * rock and a beach of boulders; a *grove* is the shape none of those can make.
 *
 * ---------------------------------------------------------------------------
 * What a baobab is, and what it is not
 * ---------------------------------------------------------------------------
 *
 * `vegetation.ts` scatters trees over the whole planet and none of them look
 * like this, because *Adansonia grandidieri* is not tree-shaped. It is a
 * **smooth grey-pink cylinder** thirty metres high and three across that does
 * not taper and does not branch, and then a flat spray of stubby limbs at the
 * very top like roots in the air. The proportions are the entire recognition:
 *
 *   trunk near-parallel: it loses 0.58 of half-width over 25 units of rise
 *   crown 15 across on a 33-unit tree — under half its height, and flat
 *
 * A tree drawn with any conventional taper reads as a pine, so the taper is what
 * the table below spends almost nothing on, and every branch leaves the top at
 * between 22 and 34 degrees above horizontal and no steeper.
 *
 * **The trunk is about twice as fat as life and that is deliberate.** A real
 * grandidieri is 30 m on a 3 m bole, 10:1; this is 29 on 5, which is 5.8:1. At
 * true slenderness the trunk is 2.5 units across — under half an avatar — and
 * the ink line down each side of it closes up into one stroke. The *parallel*
 * is what carries the recognition and the *thickness* is what carries none, so
 * the thickness is what pays.
 *
 * The crown is deliberately **thin**. These trees are bare for most of the year
 * and the photograph everyone has is at sunset with nothing on them, but a
 * completely bare crown at 260 pixels reads as a dead stick, so each tree gets
 * two small `darkOlive` pads and no more. That is the whole of the liberty.
 *
 * ---------------------------------------------------------------------------
 * Six trees, and why they are not in two straight rows
 * ---------------------------------------------------------------------------
 *
 * The avenue is a laterite road with baobabs down both sides, and the strongest
 * thing about the place is that you look *along* it. So the road runs in z —
 * toward the camera — and the six trees are staggered rather than paired, at
 * z = -19, -6, 7, 20 on one side and -13, 6 on the other. Paired, the near two
 * would occlude the far two exactly; staggered, every trunk is its own vertical
 * and the road opens between them.
 *
 * The trees are also **not the same height**: 33.0, 30.7, 28.5, 31.6, 27.1 and
 * 29.7. A row of identical ones is a colonnade, and this is a wood.
 *
 * The tallest is 33 and not 38, and the reason is arithmetic rather than taste:
 * a limb leaves the trunk 1.6 below the top and rises by up to 4.1, and a
 * secondary off it rises half as far again, so **the crown finishes about 5.3
 * above the trunk it grows from**. At 38 the model measured 45.5 and the tier
 * ceiling is 40.
 *
 * Proportion: 38.1 tall on a 32.0 half-diagonal, 0.84 against the 2.0 cap. No
 * `realHeight` — the source list carries none and a grove does not have one.
 *
 * ---------------------------------------------------------------------------
 * The model used to bring its own lawn, and that is a class of mistake rather
 * than a mistake
 * ---------------------------------------------------------------------------
 *
 * It laid a 38 by 52 unit plate of `green` under everything as a verge, with the
 * laterite track on top of it. Seen alone that is invisible: a model shown on its
 * own stands on a `PALETTE.green` disc, so a green plate on a green
 * disc has no edge. **In the world it is a bright green rectangle with a straight
 * edge all the way round, cut into western Madagascar's dry gold.** Measured at
 * the placed coordinate: `biomeAt` says `savanna` and `groundColorAt` says
 * `#d2981f`, against `green`'s `#91ad78`.
 *
 * The plate is gone and the track sits straight on the ground. What is left is
 * `clay` on gold, which is a red laterite road on dry savanna — a road is
 * *supposed* to differ from the ground it crosses, and `clay` is dark and
 * strongly hued, which is what `settlements.ts` already found separates a road
 * from a shadow.
 *
 * **The general rule this is one case of:** decide deliberately whether a
 * monument owns its ground. Giza carries a pale limestone plateau against the
 * same kind of gold desert and it reads *right*, because a plateau in sand is a
 * real thing and the eye names it. A plaza, a courtyard, a quarry floor, a
 * temple platform all own their ground. A landmark standing in open country does
 * not, and should let `biome.ts` show through.
 */

/**
 * One trunk, as [top of the section, half-width at the bottom, at the top], for
 * a 29-unit tree. Everything is scaled by the individual's own height. The last
 * section is the only one that narrows quickly: a baobab has no shoulders, it
 * just stops.
 */
const TRUNK: [top: number, bottom: number, apex: number][] = [
  [3.2, 2.62, 2.5],
  [11.0, 2.5, 2.36],
  [18.5, 2.36, 2.22],
  [25.0, 2.22, 2.04],
  [29.0, 2.04, 1.35],
];
const TRUNK_HEIGHT = 29.0;

/** [x, z, height]. Staggered, not paired — see the note above. */
const TREES: [x: number, z: number, height: number][] = [
  [-12.5, -19, 33.0],
  [-12.5, -6, 28.5],
  [-12.5, 7, 31.6],
  [-12.5, 20, 27.1],
  [12.5, -13, 30.7],
  [12.5, 6, 29.7],
];

/** Half-width of the road, and how far along z it runs. */
const ROAD = 6.5;
const ROAD_END = 26;

export const avenueOfTheBaobabs: Monument = {
  id: 'avenue-of-the-baobabs',
  name: 'Avenue of the Baobabs',
  iso: 'MDG',
  lat: -20.2506,
  lon: 44.4181,
  tier: 'building',
  footprint: 34,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper, strut, around } = ctx;

    const bark = palette.blush; // smooth, pale, faintly pink: this really is the colour
    const limb = palette.brown; // the crown, which is a different surface and a darker one
    const leaf = palette.darkOlive; // the two pads a bare tree needs to not be a stick
    const laterite = palette.clay; // the road, and the reason the photographs look like that
    const rut = palette.brown; // packed earth in the wheel tracks, a shade off the laterite
    const scrub = palette.darkOlive;

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
    // 1. The road, and nothing under it. A 13-unit red track laid straight on
    //    the savanna. Without it these are six trees in a field; with it they
    //    are an avenue, which is the whole name of the place. See the note
    //    above for the green plate that used to be here and why it went.
    // -----------------------------------------------------------------------
    block(-ROAD, ROAD, 0, 0.4, -ROAD_END, ROAD_END, laterite);
    // Ruts. Two darker strips down the track, and they are what make a flat
    // rectangle read as a road that is used. `brown` and not the verge colour,
    // because there is no verge any more: this is packed earth, one step darker
    // and less red than the laterite either side of it.
    for (const side of [-1, 1]) {
      block(side * 2.0, side * 3.6, 0.4, 0.55, -ROAD_END, ROAD_END, rut);
    }

    // -----------------------------------------------------------------------
    // 2. The trees.
    // -----------------------------------------------------------------------
    for (const [x, z, height] of TREES) {
      const k = height / TRUNK_HEIGHT;
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      group.add(tree);

      let base = 0;
      for (const [top, bottom, apex] of TRUNK) {
        const section = taper(bottom * k, apex * k, (top - base) * k, bark, 6);
        section.position.y = base * k;
        tree.add(section);
        base = top;
      }

      // The crown. Five primaries leaving the top at 22 to 34 degrees — a
      // baobab's limbs are almost horizontal and that is most of the
      // recognition — then two secondaries off the two longest, and two pads.
      //
      // `strut` places by its two endpoints, so a limb is one mesh and needs no
      // rotation of its own. That matters here more than anywhere: `T * R * S`
      // applies scale first, and this file scales every tree by its own height.
      const top = height;
      const reach = 6.4 * k;
      tree.add(
        around(5, (index) => {
          const rise = [2.9, 4.1, 2.4, 3.6, 3.1][index]! * k;
          const out = reach * [1.0, 0.82, 1.06, 0.9, 0.96][index]!;
          const limbGroup = new THREE.Group();
          limbGroup.add(
            strut(
              new THREE.Vector3(0, top - 1.6 * k, 0.6 * k),
              new THREE.Vector3(0, top - 1.6 * k + rise, out),
              0.72 * k,
              limb,
            ),
          );
          if (index === 1 || index === 3) {
            limbGroup.add(
              strut(
                new THREE.Vector3(0, top - 1.6 * k + rise, out),
                new THREE.Vector3(0.9 * k, top - 1.6 * k + rise * 1.45, out + 2.2 * k),
                0.42 * k,
                limb,
              ),
            );
          }
          return limbGroup;
        }),
      );

      for (const [dx, dz, size] of [
        [-1.6, 3.4, 2.5],
        [2.4, -2.2, 2.0],
      ] as const) {
        const pad = taper(size * k, size * 0.6 * k, 1.5 * k, leaf, 6);
        pad.position.set(dx * k, top + 1.3 * k, dz * k);
        tree.add(pad);
      }
    }

    // -----------------------------------------------------------------------
    // 3. The scrub. Four low bushes either side of the track, so the ground
    //    between the trunks is not bare. They are the cheapest thing in the model
    //    and they are what stops the track reading as a paved plinth.
    // -----------------------------------------------------------------------
    for (const [x, z, size] of [
      [-17.0, -12, 2.6],
      [-16.2, 14, 2.1],
      [16.6, -2, 2.4],
      [17.2, 19, 1.9],
    ] as const) {
      const bush = taper(size, size * 0.5, size * 1.8, scrub, 5);
      bush.position.set(x, 0, z);
      group.add(bush);
    }

    return group;
  },
};
