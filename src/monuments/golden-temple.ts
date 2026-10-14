import type { Group, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Golden Temple (Harmandir Sahib), Amritsar.
 *
 * The tank is the monument: the budget goes to the composition. What must
 * survive at thumbnail size:
 * - The gold pavilion alone in the water: two storeys under a shallow inverted-
 *   lotus dome (8 units across 4.05 of rise, 0.51, against the Taj Mahal's onion
 *   at 0.76), a small domed kiosk at each corner. Low gold box under a flat lid,
 *   unlike the Taj's white block under a tall onion.
 * - The single straight causeway, which makes it an island.
 * - The square white perimeter of arcaded buildings round the tank.
 * - The colour split: gold on white on dark water.
 *
 * Still water, with no transparency or reflection, is stated:
 * 1. `steel` (0x575a5e), not `skyBlue`: the tank supplies the dark that gold and
 *    marble are bright against (about a third of the marble's value). `ink` would
 *    read as a hole.
 * 2. The sky tints it: a horizontal face is the most sky-lit surface, so the tank
 *    comes out cool against the warm vertical marble; that split across an ink
 *    line says water.
 * 3. It is sunk and edged twice: the parikrama is a four-sided `ringWall` (the
 *    helper that makes a hole), the water 1.1 below it, and a marble kerb
 *    standing 0.45 out of the water draws the rectangle again one unit in.
 * 4. Things go into it: three ghat steps from the near walkway (the last 0.3
 *    above the surface), and the causeway on a `bone` deck between two white
 *    parapets.
 * The three darks never swap: `steel` is water, `slate` shadow inside marble,
 * `bark` shadow inside gold (doorways, upper gallery).
 *
 * Distortions:
 * - The pavilion is about 4.3x too big for its tank (12.4 across a 35-unit tank,
 *   0.35, against 0.08): at true ratio it would be a 2.9-unit speck. The aspect
 *   cap forces a 39-unit footprint to stand 19.5 tall; the pavilion has to be
 *   the tallest thing; a 20-unit pavilion much narrower is a lighthouse. It is
 *   still an island, 10.3 units from the platform edge to the kerb.
 * - The dome is fat: 8 across a 12.4 body (0.65) against about 0.49, or it reads
 *   as a knob. The finial is 2.6 over a 4.05 dome, the model's only vertical.
 * - The causeway runs along X: to +Z it projects to 53% in the quarter view and
 *   hides behind the pavilion in the front view; to +X it is 85% and 100%. The
 *   front is the tank's broad face, with the ghats in the foreground.
 * - The two near sides of the perimeter are a 1.3-unit arcade and the far two
 *   stand 4.4 with cornice and roof (the cameras sit 13 and 7 degrees up; a 6-unit
 *   wall would swallow the near water).
 *
 * Left out: the Ramgarhia towers (they would be the tallest thing) and pillar-by-
 * pillar arcades (one shadowed course 0.1 proud reads as a colonnade). The Akal
 * Takht is one block with a gilt dome, six meshes, off to the far left.
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
 * `ringWall` takes lathe radii (distances to a vertex), and at four sides its
 * vertices land on the axes. So the half-widths above are scaled by root two and
 * the mesh turned 45 degrees to get a square ring with a square hole.
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
 * The inverted lotus. Half-widths up from the springing. Widest at 0.17 of its
 * height and barely half as tall as wide, so it flares hard off the drum, turns
 * over and runs nearly flat to the finial; the low lip is what the outline catches
 * from 13 degrees above the water.
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
    // wide and one mesh: the second rectangle of ink inside the first.
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

    // At 13 degrees a deck level with the pavement is invisible, so the two bright
    // parapets are the causeway, with a darker floor between.
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

    // The four doors: buried 0.05 into the wall and standing 0.45 proud, a dark
    // panel the ink turns into an opening.
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
    // `around` puts index 0 on +Z and turns clockwise: 0 is the near side, 1 the
    // causeway's, 2 and 3 the far sides. The near two are cut down to a parapet-
    // high arcade; the far two carry their full storey, cornice and roof.

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

        // `PROUD` short at each end: a coping run to OUTER ended in the plane
        // of the neighbouring side's outer wall, two colours in one plane.
        const coping = box(length - 2 * PROUD, near ? 0.35 : 0.6, BAND_DEPTH - 0.4, trim);
        coping.position.set(at, WALK_TOP + wallHeight, BAND_MID - 0.1);
        side.add(coping);

        // The near arcade stops `PROUD` under the wall's top.
        side.add(
          near
            ? colonnade(length - 3, WALK_TOP + 0.4, wallHeight - 0.4 - PROUD, at)
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
        // pavement, clear of the pavilion's silhouette.
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
    // Four low domed towers where the runs cross, held to 9.3 units (taller and
    // the near two cut into the pavilion).

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
