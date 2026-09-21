import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Pitons — Soufrière, Saint Lucia.
 *
 * **Why Saint Lucia:** the small island states had one landmark between them.
 * The list before it gave the Caribbean the Citadelle Laferrière in Haiti and
 * that was the whole of it — nothing in the Lesser Antilles, nothing in the
 * Bahamas, nothing in Cuba or Jamaica or Trinidad, and nothing in the Pacific,
 * the Indian Ocean or the Mediterranean's islands either. Nearly forty
 * sovereign states are islands and the map had one pin on all of them.
 *
 * The Pitons are the obvious answer for the arc. They are on the flag, they are
 * a World Heritage site, and they are the only thing in the Antilles you can
 * name from thirty kilometres out at sea.
 *
 * **And the shape is new here.** The world holds four mountains — Everest, Fuji,
 * Kilimanjaro and Table Mountain — and every one of them is a single mass:
 * a ridge, a cone, a cone and a plateau. The Pitons are a **pair**, and the pair
 * is the recognition. Two volcanic plugs 2 km apart, one sharp and one broad,
 * both forested to the summit, both coming down into the water with no coastal
 * plain in front of them at all.
 *
 * ---------------------------------------------------------------------------
 * They are steeper than they are, by 1.4x and 1.5x
 * ---------------------------------------------------------------------------
 *
 * Petit Piton is 743 m on a base about a kilometre across, which is a mean slope
 * of 56 degrees; Gros Piton is 771 m on a base half again as wide, about 46. The
 * model builds them at **65 and 58** — `tan` ratios of 1.4 and 1.5 against life.
 *
 * That is Sigiriya's finding and the case for it is the same. Every photograph
 * of the Pitons is taken from the water at their foot or from a terrace across
 * Soufrière Bay, and from there the rock fills the sky and the base is
 * foreshortened to nothing. A pair of 46-degree cones is a pair of hills. What
 * makes these two famous is that they look impossible, and the impossibility is
 * entirely in the slope.
 *
 * The exaggeration is **not** equal on the two, and that is the point of doing it
 * at all: Petit gets more, so the difference between a spire and a dome is
 * bigger in the model than in life. Two identical cones would be one shape drawn
 * twice.
 *
 * Half-diagonal over height: **0.92** against the 2.00 cap.
 *
 * ---------------------------------------------------------------------------
 * There is no sea in this model and the sea is the reason
 * ---------------------------------------------------------------------------
 *
 * The Pitons rise straight out of the Caribbean and the temptation is to lay a
 * disc of `skyBlue` at their feet. Mont-Saint-Michel already wrote why not:
 * *"nothing in this world is transparent: an opaque `skyBlue` disc at y = 0 is
 * not water, it is a coaster."*
 *
 * Here it would also be redundant, and that is the better argument. Saint Lucia's
 * ring in the baked outlines is **50 units wide and 105 long**, and this model is
 * 73 units across — so the Pitons overhang their own island on both sides, the
 * placement pass will report them as standing over water, and `terrain.ts` will
 * hold their pad down to `SHORE_LIP`. **The world's own ocean comes up to their
 * feet.** That is the same arithmetic that already applies to the moai, where
 * Easter Island is narrower than its own statue, and here it happens to produce
 * exactly the right picture for free.
 *
 * So the model owns no ground at all: no apron, no reef, no beach. Two cones, a
 * saddle, some rock and some trees, standing on whatever `biome.ts` says is
 * there — which at this coordinate is the shore band's pale sand, `#edd6ae`.
 * Dark green on pale sand is the strongest contrast either of them will ever get.
 *
 * ---------------------------------------------------------------------------
 * Seven sides, because the ink decides — and what the first build got wrong
 * ---------------------------------------------------------------------------
 *
 * Every section of both peaks is a seven-sided `taper`. The Space Needle found
 * the ceiling on this — twelve segments rendered its legs as ladders — and the
 * Guggenheim found the floor, where three hard steps read as broken rock and six
 * fine ones read as panel courses. **Few joints say natural, many say
 * manufactured**, and these are the one thing in the world that must not look
 * built. Seven is enough that the sunlit half gets two cel bands and the ridges
 * between facets read as spurs.
 *
 * The other half of the same rule: the sections are the *only* regular
 * subdivision on these slopes. Angel Falls' cliff proved that two regular
 * subdivisions of one surface multiply into a brick grid.
 *
 * **The first build put the variation in the wrong place and it was invisible on
 * the card.** The two lowest sections of each peak were `darkOlive` and the rest
 * `green` — colour banding by height, which is the horizontal subdivision the
 * rule above had just spent the section count on. What it produced at 260 pixels
 * was a dark skirt that read as *shadow under a hill*, and — worse — the sixteen
 * trees round the feet were `darkOlive` **on that same dark skirt**, so the one
 * feature meant to break the silhouette had nothing to stand against and
 * disappeared entirely. Sixteen trees, 320 triangles, not one of them visible.
 *
 * So the banding is gone. Both cones are one `green` from foot to summit and let
 * the cel ramp do the shading, which is what it is for, and every dark and every
 * grey in the model is now a **feature**: three andesite cliffs and ten clumps of
 * forest, each big enough to be seen. A cliff is 20 units tall and a clump is
 * ten, against a model 73 across drawn at about 2 pixels a unit.
 */

/**
 * A peak, as a stack of [top of the section, apothem at the foot, apothem at the
 * top]. Both are seven-sided; see the note above.
 *
 * Petit ends at 0.8 and Gros at 6.2, and that difference is the whole reason
 * there are two of them: a spire and a dome read as two mountains, two spires
 * read as one mountain drawn twice.
 */
const PETIT: [top: number, bottom: number, apex: number][] = [
  [9.0, 14.0, 11.6],
  [19.0, 11.6, 8.7],
  [28.0, 8.7, 5.6],
  [34.5, 5.6, 3.0],
  [39.4, 3.0, 0.7],
];

const GROS: [top: number, bottom: number, apex: number][] = [
  [8.0, 20.0, 17.5],
  [16.0, 17.5, 14.5],
  [23.0, 14.5, 11.0],
  [28.5, 11.0, 7.0],
];

/** Where each peak stands. Petit is nearer the camera and Gros is behind it. */
const PETIT_AT: [x: number, z: number] = [11, 6];
const GROS_AT: [x: number, z: number] = [-12.5, -5];

/**
 * The bare andesite, as [x, z, foot, apothem at the foot, height, lean, yaw].
 *
 * Three of them and no more, each big enough to be a *face* rather than a
 * speckle: the largest is 20 units on a model that is drawn at about two pixels
 * a unit, so it lands at 40 pixels. The first build had six at a quarter of this
 * size and they read as dirt.
 */
const CLIFFS: [x: number, z: number, y: number, size: number, tall: number, lean: number, yaw: number][] = [
  [15.5, 15.5, 2.0, 6.4, 20.0, 0.30, 0.5],
  [20.0, 3.0, 4.0, 4.2, 12.0, 0.26, 1.5],
  [-7.5, 11.0, 2.0, 5.0, 11.0, 0.22, -0.4],
];

/**
 * Forest clumps, as [x, z, height]. Ten of them, all `darkOlive` against the
 * peaks' `green`, and all of them big — see the note above on the sixteen
 * invisible ones these replace.
 */
const CLUMPS: [x: number, z: number, height: number][] = [
  [27.5, 13.0, 11.5],
  [24.0, 18.5, 7.5],
  [11.0, 25.0, 12.0],
  [5.0, 22.0, 8.0],
  [-4.5, 18.0, 9.5],
  [31.0, -1.0, 10.0],
  [24.5, -13.0, 8.5],
  [-25.5, 12.0, 11.0],
  [-31.5, -3.5, 9.0],
  [-21.0, -20.5, 11.5],
  [-6.5, -23.5, 8.0],
];

export const thePitons: Monument = {
  id: 'the-pitons',
  name: 'The Pitons',
  iso: 'LCA',
  lat: 13.81,
  lon: -61.06,
  realHeight: 771,
  tier: 'building',
  footprint: 38,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, taper } = ctx;

    const canopy = palette.green; // the rainforest that covers both peaks to the summit
    const deep = palette.darkOlive; // the clumps at the feet, and the col between the two
    const cliff = palette.slate; // bare andesite: the only cool colour, and the only grey
    const scrub = palette.bark; // trunks, warm enough to keep hue in the shade they sit in

    const group = new THREE.Group();

    /** One peak: a stack of seven-sided frusta, all one colour. */
    const peak = (
      sections: [top: number, bottom: number, apex: number][],
      x: number,
      z: number,
    ): Object3D => {
      const mountain = new THREE.Group();
      mountain.position.set(x, 0, z);
      let base = 0;
      for (const [top, bottom, apex] of sections) {
        const shell = taper(bottom, apex, top - base, canopy, 7);
        shell.position.y = base;
        mountain.add(shell);
        base = top;
      }
      group.add(mountain);
      return mountain;
    };

    // -----------------------------------------------------------------------
    // 1. The two peaks. Petit is 39.4 units and comes to a point; Gros is 30 and
    //    stops at an apothem of 6.2, which is a dome. Petit also stands nearer
    //    the camera, so the near one is unambiguously the taller — which is a
    //    lie about the mountains (Gros is 28 m higher) and the truth about every
    //    photograph taken from Soufrière Bay.
    // -----------------------------------------------------------------------
    peak(PETIT, PETIT_AT[0], PETIT_AT[1]);
    peak(GROS, GROS_AT[0], GROS_AT[1]);

    // -----------------------------------------------------------------------
    // 2. Piton Mitan, the col. Two low masses joining the feet of the peaks,
    //    which is what stops them reading as two separate hills that happen to
    //    be near each other. It is the one place the model is *low*, and at 13.4
    //    degrees a low thing between two tall ones is what gives the pair depth.
    // -----------------------------------------------------------------------
    const saddleA = taper(10.0, 7.0, 8.0, deep, 6);
    saddleA.position.set(-1.0, 0, 2.0);
    group.add(saddleA);
    const saddleB = taper(8.0, 5.0, 5.5, deep, 6);
    saddleB.position.set(-3.0, 0, -8.0);
    group.add(saddleB);

    // -----------------------------------------------------------------------
    // 3. The rock. Petit Piton's seaward face is bare andesite for most of its
    //    height, and grey against all that green is what tells the two peaks
    //    apart at the size where both are green triangles.
    //
    //    Each cliff is one leaning frustum. A lean is a rotation and nothing
    //    else — no scale on the same object — so `T * R * S` cannot bite, and
    //    five sides keeps it in the same "few joints" family as the peak it lies
    //    against.
    // -----------------------------------------------------------------------
    for (const [x, z, y, size, tall, lean, yaw] of CLIFFS) {
      const rock = taper(size, size * 0.32, tall, cliff, 5);
      rock.rotation.set(Math.cos(yaw) * lean, yaw, -Math.sin(yaw) * lean);
      rock.position.set(x, y, z);
      group.add(rock);
    }

    // -----------------------------------------------------------------------
    // 4. The forest at the feet. Ten clumps, none on a grid, each about a
    //    quarter of Petit Piton's height. Without them the model is two smooth
    //    cones and the eye reads *slag heap*; with them the silhouette at the
    //    base is broken and it reads as jungle coming down to the water, which
    //    is what is actually there.
    // -----------------------------------------------------------------------
    for (const [x, z, height] of CLUMPS) {
      const trunk = taper(0.75, 0.6, height * 0.30, scrub, 5);
      trunk.position.set(x, 0, z);
      group.add(trunk);
      // **Blunt, not pointed.** The first pass topped these at a tenth of their
      // own width and they came out as conifers — a stand of spruce round a
      // Caribbean volcanic plug. A crown that keeps 0.44 of its width at the top
      // reads as a broadleaf mass, which is what grows here.
      const crown = taper(height * 0.42, height * 0.28, height * 0.66, deep, 7);
      crown.position.set(x, height * 0.26, z);
      group.add(crown);
    }

    return group;
  },
};
