import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Sultan Qaboos Grand Mosque — Muscat.
 *
 * **Why Oman:** the Arabian peninsula had the Burj Khalifa and nothing else;
 * between Dubai and the Horn of Africa the map was empty. Oman's principal
 * mosque, opened in 2001 in the Bawshar district of Muscat, is the repair, and
 * it gives the peninsula a building of its own tradition beside a skyscraper.
 *
 * ---------------------------------------------------------------------------
 * What carries it at thumbnail size
 * ---------------------------------------------------------------------------
 *
 * - **The dome** over the prayer hall, pointed rather than bulbous, on a drum
 *   pierced by windows, and finished with a gold finial. It is the one gold
 *   mass on the model.
 * - **Five minarets**: one main minaret, about 91.5 m, and four flanking ones,
 *   about 45.5 m, each an octagonal shaft with a balcony and a pointed cap.
 *   Here the main one is 39.9 units and the four are 21.6, close to the real
 *   ratio of two to one.
 * - **The arcaded courtyard** (the riwaq) in front of the prayer hall, its
 *   outer walls a run of pointed arches, entered through a tall portal.
 *
 * ---------------------------------------------------------------------------
 * The layout, and what was moved
 * ---------------------------------------------------------------------------
 *
 * The real complex is a long walled platform with the prayer hall at its qibla
 * end and the courtyard before it. That arrangement is kept: the hall is at the
 * back (-Z) and the courtyard in front, so the front camera looks across the
 * arcade, over the court, at the dome. The four flanking minarets stand at the
 * four corners of the platform, and the main minaret beside the hall where the
 * hall meets the courtyard's left arcade — a composition choice, so that it is
 * seen full height and not hidden behind the dome.
 *
 * The plan is compressed: the real platform is several hundred metres long and
 * here it is 42 by 45. The dome is relatively larger than in life (its top is
 * 27.6 units against a 40-unit minaret, about 0.69, where the real 50 m dome
 * against the 91.5 m minaret is 0.55), because at the true ratio the dome is
 * lost behind the arcade from the front.
 *
 * Proportion: the furthest vertex is a plinth corner at 31.1 units, on a
 * height of 39.9 — a half-diagonal of 0.78 against the cap of 2. 2,464
 * triangles of the tier's 2,600.
 *
 * The arcade hides a band about four times its height behind it from the
 * quarter camera, so the courtyard floor is never seen and carries nothing; the
 * arches are on the outer faces, where they are.
 *
 * Colours: the walls are the pale sandstone of the building, `sand`; the trim
 * and balconies `white`; the dome and the finials `gold`; the arch recesses
 * `brown`, warm because they are in shade all day.
 */

/** The platform: two courses, and the level everything stands on. */
const PLINTH_X = 21;
const PLINTH_Z0 = -23;
const PLINTH_Z1 = 22;
const TOP = 1.6;

/** The prayer hall. */
const HALL_X = 15;
const HALL_BACK = -21;
const HALL_FRONT = -7;
const HALL_TOP = TOP + 9;
const ROOF_TOP = HALL_TOP + 0.6;
const DOME_Z = -14;

/** The courtyard's arcades. */
const RIWAQ_OUT = 20;
const RIWAQ_IN = 16;
const RIWAQ_START = -6.6;
const RIWAQ_TOP = TOP + 5;

/**
 * Half-widths up the dome from its springing. Widest a little above the base,
 * then closing to a point: the swell is slight, which is what separates this
 * dome from an onion.
 */
const DOME = [
  { y: 0, r: 6.4 },
  { y: 1.7, r: 6.7 },
  { y: 3.8, r: 6.2 },
  { y: 5.8, r: 5.0 },
  { y: 7.5, r: 3.3 },
  { y: 9.6, r: 0.35 },
];

export const sultanQaboosGrandMosque: Monument = {
  id: 'sultan-qaboos-grand-mosque',
  name: 'Sultan Qaboos Grand Mosque',
  iso: 'OMN',
  lat: 23.5838,
  lon: 58.3889,
  realHeight: 91.5,
  tier: 'building',
  footprint: 31.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, column, taper, around } = ctx;

    const stone = palette.sand;
    const stoneLight = tone(palette.sand, 1.05);
    const plinthLow = tone(palette.sand, 0.85);
    const plinthHigh = tone(palette.sand, 0.95);
    const trim = palette.white;
    const recess = palette.brown;
    const gilt = palette.gold;

    const draft = new THREE.Group();

    const block = (
      x0: number, x1: number,
      y0: number, y1: number,
      z0: number, z1: number,
      color: number,
    ): Mesh => {
      const mesh = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      draft.add(mesh);
      return mesh;
    };

    /**
     * A pointed arch as a dark panel standing `proud` off a face, with one or
     * two narrowing courses over it for the point. `along` is 'x' for a face that
     * looks along Z and 'z' for one that looks along X; `face` is the face's
     * coordinate and `out` the side it looks to.
     */
    const arch = (
      along: 'x' | 'z',
      at: number,
      face: number,
      out: number,
      half: number,
      y0: number,
      y1: number,
    ): void => {
      const proud = 0.1;
      const courses: [number, number, number][] = [
        [half, y0, y1],
        [half * 0.62, y1, y1 + half * 0.7],
      ];
      // The tip course only where an arch is big enough for it to show: on
      // the two portals. At the arcade's size two courses already read as a
      // point, and the third was 400 triangles over the run.
      if (half >= 1.5) courses.push([half * 0.25, y1 + half * 0.7, y1 + half * 1.15]);
      for (const [h, a, b] of courses) {
        if (along === 'x') block(at - h, at + h, a, b, face - out * 0.1, face + out * proud, recess);
        else block(face - out * 0.1, face + out * proud, a, b, at - h, at + h, recess);
      }
    };

    // -----------------------------------------------------------------------
    // 1. The platform, two courses.
    // -----------------------------------------------------------------------
    block(-PLINTH_X, PLINTH_X, 0, 1.0, PLINTH_Z0, PLINTH_Z1, plinthLow);
    block(-PLINTH_X + 0.6, PLINTH_X - 0.6, 1.0, TOP, PLINTH_Z0 + 0.6, PLINTH_Z1 - 0.6, plinthHigh);

    // -----------------------------------------------------------------------
    // 2. The prayer hall: the block, a cornice round its roof, a tall portal
    //    on its courtyard face, and arches along its front and sides.
    // -----------------------------------------------------------------------
    block(-HALL_X, HALL_X, TOP, HALL_TOP, HALL_BACK, HALL_FRONT, stone);
    block(-HALL_X - 0.4, HALL_X + 0.4, HALL_TOP, ROOF_TOP, HALL_BACK - 0.4, HALL_FRONT + 0.4, trim);

    // The portal (pishtaq) rises over the roof line, with a white frame round
    // its arch and a white coping.
    const portalFront = HALL_FRONT + 0.8;
    block(-5, 5, TOP, 15, HALL_FRONT, portalFront, stoneLight);
    block(-5.3, 5.3, 15, 15.6, HALL_FRONT - 0.2, portalFront + 0.3, trim);
    block(-3.5, 3.5, TOP, 14.2, portalFront - 0.1, portalFront + 0.1, trim);
    arch('x', 0, portalFront + 0.1, 1, 3, TOP, TOP + 8.5);

    for (const side of [-1, 1]) {
      for (const x of [7.8, 11.6]) arch('x', side * x, HALL_FRONT, 1, 1.1, TOP + 0.8, TOP + 5.6);
      for (const z of [-18.6, -14.8, -11.0]) arch('z', z, side * HALL_X, side, 1.1, TOP + 0.8, TOP + 5.6);
    }

    // -----------------------------------------------------------------------
    // 3. The drum, its windows, and the dome.
    // -----------------------------------------------------------------------
    const dome = new THREE.Group();
    dome.position.set(0, 0, DOME_Z);
    draft.add(dome);

    const drum = column(6.6, 2.8, stone, 12);
    drum.position.y = ROOF_TOP;
    dome.add(drum);
    // Six windows on alternate faces of the twelve; `around` puts a face, not
    // an edge, on +Z, so each panel lands on a flat.
    dome.add(
      around(12, (i) => {
        if (i % 2 === 1) return null;
        const pane = box(1.4, 1.7, 0.3, recess);
        pane.position.set(0, ROOF_TOP + 0.5, 6.65);
        return pane;
      }),
    );
    const collar = column(6.95, 0.5, trim, 12);
    collar.position.y = ROOF_TOP + 2.8;
    dome.add(collar);

    const springing = ROOF_TOP + 3.3;
    for (let i = 0; i + 1 < DOME.length; i++) {
      const a = DOME[i]!;
      const b = DOME[i + 1]!;
      const piece = taper(a.r, b.r, b.y - a.y, gilt, 12);
      piece.position.y = springing + a.y;
      dome.add(piece);
    }
    const crown = springing + DOME[DOME.length - 1]!.y;
    const knop = column(0.55, 0.7, gilt, 8);
    knop.position.y = crown;
    dome.add(knop);
    const spire = taper(0.35, 0.05, 2.8, gilt, 6);
    spire.position.y = crown + 0.7;
    dome.add(spire);

    // -----------------------------------------------------------------------
    // 4. The courtyard: arcades on three sides, a coping along their tops,
    //    pointed arches on their outer faces, and the entrance portal.
    // -----------------------------------------------------------------------
    block(-RIWAQ_OUT, RIWAQ_OUT, TOP, RIWAQ_TOP, RIWAQ_IN, RIWAQ_OUT, stone);
    for (const side of [-1, 1]) {
      block(side * RIWAQ_IN, side * RIWAQ_OUT, TOP, RIWAQ_TOP, RIWAQ_START, RIWAQ_IN, stone);
    }
    // The copings stop inside the corner minarets' bases rather than at their
    // faces, so no end shares a plane with a base.
    block(-18.8, 18.8, RIWAQ_TOP, RIWAQ_TOP + 0.5, RIWAQ_IN - 0.3, RIWAQ_OUT + 0.3, trim);
    for (const side of [-1, 1]) {
      block(side * (RIWAQ_IN - 0.3), side * (RIWAQ_OUT + 0.3), RIWAQ_TOP, RIWAQ_TOP + 0.5, RIWAQ_START - 0.15, 18.8, trim);
    }

    for (const side of [-1, 1]) {
      for (const x of [5.8, 8.4, 11.0, 13.6, 16.2]) arch('x', side * x, RIWAQ_OUT, 1, 0.75, TOP + 0.8, TOP + 3.4);
      for (const z of [-4.2, -1.2, 1.8, 4.8, 7.8, 10.8, 13.8]) {
        arch('z', z, side * RIWAQ_OUT, side, 0.75, TOP + 0.8, TOP + 3.4);
      }
    }

    // The entrance portal on the front arcade.
    const gateFront = RIWAQ_OUT + 0.8;
    block(-4, 4, TOP, 10.5, RIWAQ_OUT, gateFront, stoneLight);
    block(-4.3, 4.3, 10.5, 11, RIWAQ_OUT - 0.2, gateFront + 0.2, trim);
    block(-3, 3, TOP, 10, gateFront - 0.1, gateFront + 0.1, trim);
    arch('x', 0, gateFront + 0.1, 1, 2.0, TOP, TOP + 5.8);

    // -----------------------------------------------------------------------
    // 5. The minarets: a square base to above the arcade, a white coping,
    //    octagonal shafts, corbelled balconies, a lantern and a gold cap.
    // -----------------------------------------------------------------------
    const stack = (x: number, z: number, parts: [Mesh, number][]): void => {
      let y = TOP;
      for (const [mesh, rise] of parts) {
        mesh.position.set(x, y, z);
        draft.add(mesh);
        y += rise;
      }
    };

    // The main minaret.
    stack(-18, -9, [
      [box(4.4, 6, 4.4, stoneLight), 6],
      [box(4.8, 0.5, 4.8, trim), 0.5],
      [column(1.7, 13, stone, 8), 13],
      [taper(1.7, 2.3, 0.8, trim, 8), 0.8],
      [column(2.3, 0.6, trim, 8), 0.6],
      [column(1.45, 8.5, stone, 8), 8.5],
      [taper(1.45, 2.0, 0.7, trim, 8), 0.7],
      [column(2.0, 0.5, trim, 8), 0.5],
      [column(1.1, 3.2, stone, 8), 3.2],
      [taper(1.3, 0.15, 3.4, gilt, 8), 3.4],
      [taper(0.25, 0.04, 1.1, gilt, 4), 1.1],
    ]);

    // The four flanking minarets, at the platform's corners: one balcony each,
    // without the main minaret's coping and corbels, which the budget could
    // not carry four times over.
    for (const [x, z] of [
      [-18.8, 19.6],
      [18.8, 19.6],
      [-17.6, -20.6],
      [17.6, -20.6],
    ] as const) {
      stack(x, z, [
        [box(3.2, 6.4, 3.2, stoneLight), 6.4],
        [column(1.2, 8.2, stone, 8), 8.2],
        [column(1.65, 0.45, trim, 8), 0.45],
        [column(0.85, 2.0, stone, 8), 2.0],
        [taper(1.0, 0.1, 2.2, gilt, 8), 2.2],
        [taper(0.2, 0.03, 0.75, gilt, 4), 0.75],
      ]);
    }

    return ctx.merge(draft);
  },
};
