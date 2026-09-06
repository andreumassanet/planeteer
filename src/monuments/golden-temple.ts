import type { Group, Monument } from './contract.ts';

/**
 * Golden Temple (Harmandir Sahib), Amritsar.
 *
 * **The tank is the monument.** Take the water away and this is a small gold
 * building; leave it and it is the Golden Temple. So the budget is spent on the
 * composition rather than on the pavilion, and four things have to survive at
 * thumbnail size:
 *
 * - **The gold pavilion standing alone in the middle of the water**: two storeys
 *   under a shallow inverted-lotus dome, with a small domed kiosk at each corner.
 *   Squat and wide — the dome is 8 units across 4.05 of rise (0.51) where the Taj
 *   Mahal's onion in this same folder is 12.7 across 9.6 (0.76). Those two are
 *   India's entries and both are domed marble-and-gold buildings; if they read as
 *   one card, this file has failed. The separation is deliberate at every level:
 *   Taj is one white block rising to a tall onion on a drum, this is a low gold
 *   box under a flat lid, and it is standing in water.
 * - **The single straight causeway.** It is the whole difference between a
 *   building that happens to be near water and an island reached from one side.
 * - **The square white perimeter** of arcaded buildings round the tank.
 * - **The colour split: gold on white on dark water.** The fastest read of the
 *   four, legible when the other three have collapsed into a smudge, and worth
 *   protecting everything else for.
 *
 * ## How still water reads with no transparency and no reflection
 *
 * Nothing in this world is transparent, reflective or moving, so water cannot be
 * shown here — it has to be *stated*. Four decisions, in order of how much work
 * they do:
 *
 * 1. **`steel` (0x575a5e), not `skyBlue`.** This is a value composition before
 *    it is a colour one: gold and marble are both bright, so the tank has to
 *    supply the dark or there is nothing for them to be bright against.
 *    `skyBlue` — the right answer at Victoria Falls, where the river needs to
 *    name itself in one glance — is nearly as light as the marble here, and a
 *    bright tank turns the island into a pale shape on a pale field. `steel`
 *    lands at roughly a third of the marble's value, which is what lets the gold
 *    be found from across the city. `ink` was the other candidate and is wrong
 *    for the opposite reason: it is the outline's own colour, so the tank would
 *    read as a hole cut in the marble rather than a surface.
 * 2. **The sky tints it, not the pigment.** The hemisphere light's sky colour is
 *    the scene's blue, so a neutral goes cold — usually a warning (a grey wall in
 *    shadow turns on you) and here the entire trick, because a horizontal face is
 *    the most sky-lit surface there is. The tank comes out cool and faintly blue
 *    while the vertical marble a unit away from it stays warm. That temperature
 *    split across a hard ink line, rather than any blue paint, is what says
 *    water. `steel` already leans that way in the palette (blue above red).
 * 3. **It is sunk, and edged twice.** The parikrama is a single square ring —
 *    `ringWall` with four sides, the one helper that makes a real hole — so the
 *    ink draws an unbroken rectangle round the tank with the water 1.1 below it.
 *    A second ring, a marble kerb standing 0.45 out of the water all the way
 *    round, draws that rectangle again one unit in. A plate flush with the
 *    pavement is a dark floor; two concentric edges with a drop between them is
 *    something you are looking down into.
 * 4. **Things go into it.** Three ghat steps descend from the near walkway until
 *    the last is 0.3 above the surface; the causeway crosses on a `bone` deck
 *    between two white parapets. Both exist because the strongest evidence for
 *    water in a still drawing is other objects behaving as though it were there.
 *
 * The three darks in the file each do one job and are never swapped: `steel` is
 * water, `slate` is shadow inside marble (cool), `bark` is shadow inside gold
 * (warm — the doorways and the upper gallery).
 *
 * ## What is distorted, and by how much
 *
 * - **The pavilion is about 4.3x too big for its tank.** In life the temple is
 *   12.25 m square in a tank roughly 150 m across — 0.08 of the width. Here it is
 *   12.4 across a 35-unit tank, or 0.35. At the true ratio it would be 2.9 units
 *   in a 78-unit frame: a gold speck, and the card would be a photograph of a
 *   swimming pool. The ratio is not free to choose, either. The tier's aspect cap
 *   forces a 39-unit footprint to stand at least 19.5 tall; the pavilion has to
 *   be the tallest thing here or it stops being the subject; and a 20-unit
 *   pavilion that is *not* most of that again in width stops being squat and
 *   starts being a lighthouse. Roughly a third is what those three constraints
 *   leave. It is still an island: 10.3 units from the edge of its marble platform
 *   to the kerb on every side, more on the diagonals.
 * - **The dome is fat, for the Taj's reason.** 8 units across a 12.4-unit body
 *   (0.65) where the real one is about 6 m on 12.25 (0.49). Below that it reads
 *   as a knob, and the dome is half of what makes this building nameable.
 * - **The finial is long.** 2.6 units over a 4.05-unit dome. Held to the Taj's
 *   one-fifth it would be a bump, and this is the only vertical the model has.
 * - **The causeway runs along X, not toward the viewer.** The real bridge
 *   approaches from the west bank; the tank is four-fold symmetric so any side is
 *   as true as another, and the camera decides. Running to +Z it projects to 53%
 *   of its length in the contact sheet's quarter view and is completely hidden
 *   behind the pavilion in the front view. Crossing to +X it is 85% and 100%.
 *   The front of this monument is therefore the broad face of the tank, with the
 *   causeway crossing left to right and the ghats in the foreground.
 * - **The two near sides of the perimeter are cut down to a 1.3-unit arcade**
 *   while the two far sides stand 4.4 with cornice and roof. Not decoration: the
 *   sheet's two cameras sit 13 and 7 degrees above the horizon, and a wall 6
 *   units up between them and the tank swallows the near half of the water and
 *   the causeway with it. At 1.3 it hides about one unit of a 35-unit tank. The
 *   water is the monument; the near wall is what one gives up to keep it.
 *
 * ## Traded away
 *
 * - **The two Ramgarhia towers.** They are 47 m and would solve the height
 *   problem outright — and then the tallest, most eye-catching thing on the card
 *   would not be the gold temple.
 * - **Pillar-by-pillar arcades.** One shadowed course standing 0.1 proud of the
 *   wall reads as a colonnade the moment the ink lands on it, for one mesh a side
 *   instead of fifteen. Angkor Wat settled this argument already.
 * - **The Akal Takht is one block with a gilt dome**, six meshes, set off to the
 *   far left so it never crosses the pavilion's silhouette. It is the second
 *   building of the complex and it earns its place by saying the perimeter is a
 *   town rather than a wall.
 */

// ---------------------------------------------------------------------------
// The plan. Every half-width is measured to a flat face; nothing crosses OUTER.
// ---------------------------------------------------------------------------

/** Hard outer limit of the complex. The corners of the square are the footprint. */
const OUTER = 27.5;
/** Inner face of the perimeter buildings — the far edge of the walkway. */
const ARCADE = 22.5;
/** The water's edge: half-width of the hole in the marble ring. */
const TANK = 17.5;

/** The parikrama, the white walkway the whole square stands on. */
const WALK_TOP = 2.6;
/** Sunk 1.1 below it. That gap is the reason the tank reads as a tank. */
const WATER_TOP = 1.5;

const BAND_MID = (ARCADE + OUTER) / 2;
const BAND_DEPTH = OUTER - ARCADE;
/** Each of the four perimeter runs spans the whole square, so the corners meet. */
const RUN = OUTER * 2;

/**
 * `ringWall` takes lathe radii — distances to a *vertex*, not to a flat — and at
 * four sides it lands its vertices on the axes. So the half-widths above are
 * scaled by root two and the mesh is turned 45 degrees, which is what turns a
 * diamond into a square ring with a square hole.
 */
const DIAGONAL = Math.SQRT2;

// ---------------------------------------------------------------------------
// The pavilion, from the bottom up. Bases start below the waterline so nothing
// shows a coplanar seam with the tank.
// ---------------------------------------------------------------------------

const ISLAND_BASE = 1;

/** Marble platform, marble dado, then gold: the split every photograph shows. */
const STOREYS: Array<{ half: number; height: number; coat: 'gold' | 'marble' | 'trim' }> = [
  { half: 7.2, height: 1, coat: 'marble' }, //    the island itself
  { half: 6.75, height: 0.7, coat: 'trim' }, //   its upper step
  { half: 6.5, height: 0.9, coat: 'marble' }, //  the dado: marble as high as a man
  { half: 6.2, height: 5, coat: 'gold' }, //      ground storey
  { half: 7, height: 0.7, coat: 'trim' }, //      chhajja, the eave that runs round
  { half: 6.6, height: 0.5, coat: 'gold' }, //    roof of the ground storey
  { half: 4.85, height: 3.9, coat: 'gold' }, //   upper storey
  { half: 5.5, height: 0.6, coat: 'trim' }, //    upper eave
  { half: 5.1, height: 0.45, coat: 'gold' }, //   roof the dome stands on
];

/** The two gold storeys: the doors and the gallery are hung off their faces. */
const GROUND = STOREYS[3]!;
const UPPER = STOREYS[6]!;

/** Top of the ground-storey roof — the sixth course — is where the kiosks stand. */
const KIOSK_FLOOR = STOREYS.slice(0, 6).reduce((y, course) => y + course.height, ISLAND_BASE);
/** Diagonal distance of a kiosk, so the four sit on the corners of that roof. */
const KIOSK_RING = 5.45 * DIAGONAL;

const DRUM = { radius: 3.4, height: 1.2 };

/**
 * The inverted lotus. Half-widths up from the springing.
 *
 * An onion and a lotus are the same list of numbers arranged differently, and
 * the difference is where the swell sits. The Taj's widest point is a third of
 * the way up a dome three quarters as tall as it is wide. This one is widest at
 * 0.17 of its height and is barely half as tall as it is wide, so the profile
 * flares hard off the drum, turns over almost at once and then runs nearly flat
 * to the finial. That low lip is the flower, and it is also the one thing the
 * outline can catch from a camera 13 degrees above the water.
 */
const DOME = [
  { y: 0, r: 3.3 },
  { y: 0.7, r: 4 },
  { y: 1.75, r: 3.75 },
  { y: 2.7, r: 2.85 },
  { y: 3.45, r: 1.7 },
  { y: 4.05, r: 0.7 },
];

/** The causeway, crossing the tank to +X. */
const BRIDGE = { half: 1.8, top: WALK_TOP - 0.1, inner: 7.4, outer: TANK + 0.3 };

export const goldenTemple: Monument = {
  id: 'golden-temple',
  name: 'Golden Temple',
  iso: 'IND',
  lat: 31.62,
  lon: 74.877,
  tier: 'building',
  footprint: 39,

  build(ctx) {
    const { THREE, palette, box, column, taper, ringWall, around } = ctx;
    const marble = palette.white;
    const trim = palette.bone;
    const gilt = palette.gold;
    const water = palette.steel; //  the tank. See the note at the top of the file.
    const shade = palette.slate; //  shadow inside marble: cool
    const recess = palette.bark; //  shadow inside gold: warm

    const coats = { gold: gilt, marble, trim };
    const group = new THREE.Group();

    // --- the tank, and the marble ring that holds it --------------------------

    // The water overlaps the marble by 0.3 all round rather than meeting it, so
    // no two faces are coplanar and the surface stops exactly at the ink line.
    const surface = box((TANK + 0.3) * 2, WATER_TOP, (TANK + 0.3) * 2, water);
    group.add(surface);

    const walkway = ringWall(TANK * DIAGONAL, OUTER * DIAGONAL, WALK_TOP, marble, 4);
    walkway.rotation.y = Math.PI / 4;
    group.add(walkway);

    // A marble kerb standing 0.45 out of the water the whole way round, one unit
    // wide and one mesh: the second rectangle of ink inside the first. Two
    // concentric edges are what tell the eye it is looking down into something,
    // and the sarovar really is stepped like this all round.
    const kerb = ringWall((TANK - 1) * DIAGONAL, (TANK + 0.25) * DIAGONAL, WATER_TOP + 0.45, marble, 4);
    kerb.rotation.y = Math.PI / 4;
    group.add(kerb);

    // The ghats: three steps down the near side into the water. Their feet are
    // below the surface, so they enter the tank instead of hovering over it.
    const GHATS: Array<[number, number, number]> = [
      [TANK - 0.35, 2.5, 0], //   one shallow step down off the pavement
      [TANK - 1.25, 2.15, 0],
      [TANK - 2.15, 1.8, 1], //   the wet one, 0.3 above the surface
    ];
    for (const [z, top, worn] of GHATS) {
      const step = box(15, top - 1.4, 0.9, worn ? trim : marble);
      step.position.set(0, 1.4, z);
      group.add(step);
    }

    // --- the causeway ---------------------------------------------------------

    const span = BRIDGE.outer - BRIDGE.inner;
    const deck = box(span, BRIDGE.top - 1, BRIDGE.half * 2, trim);
    deck.position.set((BRIDGE.inner + BRIDGE.outer) / 2, 1, 0);
    group.add(deck);

    // At 13 degrees a deck level with the pavement is invisible, and a white one
    // dissolves into the white pavement it runs to. So the parapets are the
    // causeway — two bright rails with a darker floor between them, which is a
    // bridge at any size — and the deck is only what they stand on.
    for (const side of [1, -1]) {
      const rail = box(span, 1, 0.4, marble);
      rail.position.set((BRIDGE.inner + BRIDGE.outer) / 2, BRIDGE.top, side * (BRIDGE.half - 0.2));
      group.add(rail);
    }

    // --- the pavilion ---------------------------------------------------------

    let y = ISLAND_BASE;
    for (const storey of STOREYS) {
      const course = box(storey.half * 2, storey.height, storey.half * 2, coats[storey.coat]);
      course.position.y = y;
      group.add(course);
      y += storey.height;
    }

    // The four doors, one to each direction, which is the point of them. Buried
    // 0.05 into the wall and standing 0.45 proud: a dark panel the ink turns into
    // an opening, at one mesh instead of the three a real reveal would cost.
    const doors = around(4, () => {
      const door = box(2.6, 3.4, 0.5, recess);
      door.position.set(0, 3.6, GROUND.half + 0.2);
      return door;
    });
    group.add(doors);

    // The upper storey's gallery, same trick, so it is not a blank gold box.
    const gallery = around(4, () => {
      const band = box(5.8, 1.7, 0.4, recess);
      band.position.set(0, 10.6, UPPER.half + 0.15);
      return band;
    });
    group.add(gallery);

    // --- the four corner kiosks -----------------------------------------------

    const kiosks = around(4, () => {
      const kiosk = new THREE.Group();
      let top = KIOSK_FLOOR;

      const stack: Array<[number, number, number, number]> = [
        [1.35, 1.35, 0.35, trim], //  deck
        [1, 1, 1.15, gilt], //        the posts, as one drum
        [1.2, 1, 0.7, gilt], //       the little dome's swell
        [1, 0.12, 1, gilt], //        and its cap
      ];
      for (const [bottom, head, height, color] of stack) {
        const piece = taper(bottom, head, height, color, 6);
        piece.position.set(0, top, KIOSK_RING);
        kiosk.add(piece);
        top += height;
      }
      return kiosk;
    });
    kiosks.rotation.y = Math.PI / 4;
    group.add(kiosks);

    // --- drum, dome, finial ---------------------------------------------------

    const drum = column(DRUM.radius, DRUM.height, gilt, 12);
    drum.position.y = y;
    group.add(drum);
    y += DRUM.height;

    for (let i = 0; i + 1 < DOME.length; i++) {
      const a = DOME[i]!;
      const b = DOME[i + 1]!;
      const course = taper(a.r, b.r, b.y - a.y, gilt, 12);
      course.position.y = y + a.y;
      group.add(course);
    }
    y += DOME[DOME.length - 1]!.y;

    const finial: Array<[number, number, number, number, number]> = [
      [0.8, 0.8, 0.4, trim, 8], //   neck
      [1.2, 0.5, 0.85, gilt, 8], //  the lotus the kalash sits in
      [0.22, 0.22, 0.75, gilt, 6], //stem
      [0.55, 0.08, 0.6, gilt, 6], // and the point
    ];
    for (const [bottom, head, height, color, sides] of finial) {
      const piece = taper(bottom, head, height, color, sides);
      piece.position.y = y;
      group.add(piece);
      y += height;
    }

    // --- the perimeter --------------------------------------------------------
    //
    // `around` puts index 0 on +Z and turns clockwise, so 0 is the near side, 1
    // the causeway's own side, and 2 and 3 the two far sides. The near two are
    // cut down to a parapet-high arcade so the camera can see the water over
    // them; the far two carry their full storey, cornice and roof.

    /** A shadowed course standing 0.1 proud of the wall: the arcade, in one mesh. */
    const colonnade = (length: number, base: number, height: number, offset: number): Group => {
      const wrap = new THREE.Group();
      const band = box(length, height, 0.5, shade);
      band.position.set(offset, base, ARCADE - 0.15);
      wrap.add(band);
      return wrap;
    };

    const perimeter = around(4, (index) => {
      const side = new THREE.Group();
      const near = index === 0 || index === 1;
      const gate = index === 1;

      // The gate side is the same run broken either side of the causeway.
      const runs: Array<[number, number]> = gate
        ? [
            [OUTER - 5.5, (OUTER + 5.5) / 2],
            [OUTER - 5.5, -(OUTER + 5.5) / 2],
          ]
        : [[RUN, 0]];

      const wallHeight = near ? 1.3 : 4.4;
      for (const [length, at] of runs) {
        const wall = box(length, wallHeight, BAND_DEPTH, marble);
        wall.position.set(at, WALK_TOP, BAND_MID);
        side.add(wall);

        const coping = box(length, near ? 0.35 : 0.6, BAND_DEPTH - 0.4, trim);
        coping.position.set(at, WALK_TOP + wallHeight, BAND_MID - 0.1);
        side.add(coping);

        side.add(
          near
            ? colonnade(length - 3, WALK_TOP + 0.4, 0.85, at)
            : colonnade(length - 5, WALK_TOP + 0.7, 2.6, at),
        );
      }

      if (!near) {
        // The roof course the far sides carry, which is what makes them read as
        // buildings rather than as a taller wall.
        const roof = box(RUN - 1.5, 0.9, BAND_DEPTH - 1, marble);
        roof.position.set(0, WALK_TOP + wallHeight + 0.6, BAND_MID + 0.15);
        side.add(roof);
      }

      if (gate) {
        // Darshani Deorhi: two gilt-capped pylons where the causeway leaves the
        // pavement. They stand well off the pavilion's silhouette from both of
        // the sheet's cameras.
        for (const flank of [1, -1]) {
          const post = column(0.85, 3.6, marble, 4);
          post.position.set(flank * 3.2, WALK_TOP, 20.4);
          side.add(post);

          const cap = taper(1, 0.18, 1.1, gilt, 6);
          cap.position.set(flank * 3.2, WALK_TOP + 3.6, 20.4);
          side.add(cap);
        }
      }

      if (index === 3) {
        // The Akal Takht, off to one side of the far run so it never stands
        // behind the temple.
        const takht = new THREE.Group();
        const at = 14;
        let top = WALK_TOP;

        const lower = box(10.5, 6.4, BAND_DEPTH - 0.1, marble);
        lower.position.set(at, top, BAND_MID);
        takht.add(lower);
        top += 6.4;

        const cornice = box(11.3, 0.5, BAND_DEPTH + 0.2, trim);
        cornice.position.set(at, top, BAND_MID - 0.1);
        takht.add(cornice);
        top += 0.5;

        const upper = box(7.6, 2.6, BAND_DEPTH - 1.1, marble);
        upper.position.set(at, top, BAND_MID - 0.35);
        takht.add(upper);
        top += 2.6;

        const crown: Array<[number, number, number, number]> = [
          [1.8, 1.8, 0.7, trim],
          [2, 1.45, 1.15, gilt],
          [1.45, 0.18, 1.35, gilt],
        ];
        for (const [bottom, head, height, color] of crown) {
          const piece = taper(bottom, head, height, color, 8);
          piece.position.set(at, top, BAND_MID - 0.35);
          takht.add(piece);
          top += height;
        }
        side.add(takht);
      }

      return side;
    });
    group.add(perimeter);

    // --- the corner bungas ----------------------------------------------------
    //
    // Four low domed towers where the runs cross. They are what makes the
    // perimeter read as a square rather than as four walls, and they are held to
    // 9.3 units: taller than that and the two near ones rise over the waterline
    // and start cutting into the pavilion.

    const bungas = around(4, () => {
      const bunga = new THREE.Group();
      let top = WALK_TOP;

      const stack: Array<[number, number, number, number]> = [
        [2, 2, 4.6, marble],
        [2.2, 1.6, 1, trim],
        [1.6, 0.15, 1.1, marble],
      ];
      for (const [bottom, head, height, color] of stack) {
        const piece = taper(bottom, head, height, color, 8);
        piece.position.set(0, top, 24.5 * DIAGONAL);
        bunga.add(piece);
        top += height;
      }
      return bunga;
    });
    bungas.rotation.y = Math.PI / 4;
    group.add(bungas);

    return group;
  },
};
