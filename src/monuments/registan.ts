import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * The Registan — Samarkand.
 *
 * **Why this one, of everything in Central Asia:** because between the Caspian
 * and the Great Wall the world had nothing. Forty of the first sixty-five
 * landmarks stand in Europe, East Asia and the United States, and the whole belt
 * from Ankara to Xi'an — Uzbekistan, Turkmenistan, Kazakhstan, Kyrgyzstan,
 * Tajikistan, Afghanistan — was empty. The Registan is the obvious repair: three
 * madrasas facing one square, and the thing every photograph of it is actually
 * of is a single shape repeated three times.
 *
 * ---------------------------------------------------------------------------
 * The crop
 * ---------------------------------------------------------------------------
 *
 * The square is three buildings around three sides of a plaza about 100 m
 * across. At the `building` tier's 55-unit footprint that is a model in which
 * each madrasa is 30 units wide and 8 tall, and nothing in it reads. So the crop
 * is **one madrasa, the Sher-Dor**, at full height — which is also what a
 * photographer does, because the Registan's silhouette is not the plaza, it is:
 *
 *   a giant rectangular portal screen, a minaret at each of its outer corners,
 *   and a ribbed turquoise dome standing over each wing.
 *
 * That is five masses and it is unmistakable. The Ulugh Beg and Tilya-Kori
 * madrasas are the same five masses in a different order; building one of them
 * properly says more than building three of them badly.
 *
 * **Nothing is stretched.** Sher-Dor's portal is about 32 m to the top of the
 * pishtaq on a facade about 51 m wide, and here it is 35.0 units on 64 with the
 * minarets going on to 39.8. Half-diagonal 35.9 against height 39.8 is 0.90,
 * comfortably inside `MAX_ASPECT`,
 * so the only liberty is the one every crop makes: the wings stop at the corner
 * domes instead of running on to the back of the courtyard.
 *
 * ---------------------------------------------------------------------------
 * Turquoise is the whole point, and the palette already had it
 * ---------------------------------------------------------------------------
 *
 * `skyBlue` (0x3dbbe7) is the sky dome's own zenith colour, and it is also
 * within a few per cent of Samarkand tile. Nothing else in the twenty-four is
 * close, and nothing else in this model may compete with it: the body is `sand`,
 * the plinth and drums `tan`, and every square unit of blue is spent on the four
 * things that carry it in life — the two melon domes, the frame band around the
 * iwan, the parapet course, and the minaret galleries.
 *
 * **The minarets have to finish above the portal and the first build did not let
 * them.** With the pishtaq at 39.6 and the tier ceiling at 40 they came out level
 * with it and read as buttresses. The portal is 35.0 now and they clear it by
 * 4.8, which is the one proportion at Sher-Dor a photograph will not let you
 * get wrong.
 *
 * The two `gold` discs in the spandrels are not decoration either. Sher-Dor
 * means *bearing lions*, and the tympanum panels carry a lion-and-sun above each
 * haunch of the arch — the one figurative image on a Timurid madrasa, and the
 * reason this madrasa rather than its neighbours has a name.
 *
 * ---------------------------------------------------------------------------
 * The arch is a stair, on purpose
 * ---------------------------------------------------------------------------
 *
 * A four-centred Timurid arch has no helper here and the obvious substitute — a
 * `column` on its side — is the wheel trap `contract.ts` warns about, and is
 * round where this arch is pointed. The head is six horizontal courses of
 * decreasing width instead. `OutlineEffect` inks every course, which is the
 * right answer twice over: the real arch *is* a tiled surface laid in courses,
 * and the joint-count rule is that few joints read as natural and many read as
 * manufactured. This is the most manufactured object on the planet.
 *
 * The recess behind it is `brown`, not a neutral: an iwan is a half-domed cave
 * facing the square, it is in shade all day, and the note beside `ctx.palette`
 * is unambiguous about what `bone` does in one.
 */

/** Half-width of the great portal screen, and the springing of its arch. */
const PORTAL = 13;
const PORTAL_TOP = 35.0;
/** Half-width of the iwan void the screen frames. */
const VOID = 7.5;
/** Front and back of the screen. The wings stand 2 units behind it. */
const FRONT = 13;
const SCREEN_BACK = 4;
const WING_FRONT = 11;
const WING_BACK = -11;

/** The wings: from the portal's edge out to here. */
const WING_OUT = 32;
const WING_TOP = 20;
const PARAPET = 2;

/** Minaret centres, tucked against the outer corners of the screen. */
const MINARET_X = 14.9;
const MINARET_Z = 8.4;

/**
 * The arch head: [half-width, height of the course]. Read the first column down
 * and that is the profile — a four-centred arch, in six courses of tile.
 */
const ARCH: [half: number, rise: number][] = [
  [7.5, 1.65],
  [7.1, 1.65],
  [6.4, 1.65],
  [5.3, 1.65],
  [3.7, 1.65],
  [1.6, 1.6],
];
const ARCH_SPRING = 19.6;
/** Where the arch head finishes and the header band over it begins. */
const ARCH_TOP = 29.45;

/** The melon dome, as five drums of a lathe that does not exist. */
const DOME: [bottom: number, top: number, rise: number][] = [
  [5.75, 5.95, 2.1],
  [5.95, 5.7, 2.3],
  [5.7, 4.8, 2.1],
  [4.8, 3.2, 1.8],
  [3.2, 1.1, 1.5],
];

export const registan: Monument = {
  id: 'registan',
  name: 'The Registan',
  iso: 'UZB',
  lat: 39.6548,
  lon: 66.9758,
  tier: 'building',
  footprint: 36.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, ringWall } = ctx;

    const body = palette.sand; // the brick facade, sunlit all day
    const base = palette.tan; // plinth, drums, the shaded lower courses
    const tile = palette.skyBlue; // Samarkand
    const recess = palette.brown; // the iwan, in shade from dawn to dusk
    const dark = palette.bark; // doorways and the deepest niches
    const sun = palette.gold; // the two lion-and-sun discs, and the finials

    const group = new THREE.Group();

    /** A block named by its two opposite corners. Half of this file is walls that must meet. */
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
    // 1. The plinth. One course under everything, a unit proud of the facade, so
    //    the whole building sits on a line instead of on the ground.
    // -----------------------------------------------------------------------
    block(-WING_OUT - 1, WING_OUT + 1, 0, 1.6, WING_BACK - 1, FRONT + 1, base);

    // -----------------------------------------------------------------------
    // 2. The wings. Two storeys of cells behind an arcade, capped by a blue
    //    parapet course — the horizontal that ties the whole facade together and
    //    the only blue on the model that is not a dome.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const inner = side * PORTAL;
      const outer = side * WING_OUT;
      block(inner, outer, 1.6, WING_TOP, WING_BACK, WING_FRONT, body);
      block(inner, outer, WING_TOP, WING_TOP + PARAPET, WING_BACK, WING_FRONT, tile);

      // Three arched cell-fronts per wing, sunk into the face. Each is a dark
      // panel with a two-course head, which at this size is an arcade.
      for (let i = 0; i < 3; i++) {
        const x = side * (PORTAL + 3.6 + i * 5.9);
        block(x - 1.7, x + 1.7, 3.2, 13.4, WING_FRONT - 0.7, WING_FRONT + 0.05, recess);
        block(x - 1.7, x + 1.7, 13.4, 14.6, WING_FRONT - 0.7, WING_FRONT + 0.05, recess);
        block(x - 1.1, x + 1.1, 14.6, 15.6, WING_FRONT - 0.7, WING_FRONT + 0.05, recess);
        // A tile spandrel over each, so the arcade reads in colour as well as
        // in shadow.
        block(x - 2.1, x + 2.1, 16.4, 17.6, WING_FRONT - 0.35, WING_FRONT + 0.15, tile);
      }
    }

    // -----------------------------------------------------------------------
    // 3. The domes. A drum, five courses of melon, a gold finial. They stand on
    //    the wings rather than behind them, which is both where Sher-Dor's are
    //    and the only place the contact sheet's 13-degree camera could see them:
    //    anything behind a 22-unit parapet is under a ray that has already
    //    climbed past the tier's ceiling by the time it gets there.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const x = side * 22.4;
      const z = -3;
      const drum = column(5.6, 6.5, base, 12);
      drum.position.set(x, WING_TOP + PARAPET, z);
      group.add(drum);

      let y = WING_TOP + PARAPET + 6.5;
      for (const [bottom, top, rise] of DOME) {
        const course = taper(bottom, top, rise, tile, 12);
        course.position.set(x, y, z);
        group.add(course);
        y += rise;
      }
      const finial = column(0.55, 1.5, sun, 6);
      finial.position.set(x, y, z);
      group.add(finial);
    }

    // -----------------------------------------------------------------------
    // 4. The portal screen. Two jambs, a header, and between them a void with a
    //    stepped four-centred arch in it.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * VOID, side * PORTAL, 1.6, PORTAL_TOP, SCREEN_BACK, FRONT, body);
      // The tile frame runs up the inner edge of each jamb and across the head:
      // one continuous band, which is exactly how a pishtaq is bordered.
      // It wraps `PROUD` round the jamb's inner edge, stops `PROUD` under the
      // screen's top and starts `PROUD` into the plinth: the jamb has faces in
      // all three planes, and flush faces of two colours flicker.
      block(side * (VOID - PROUD), side * (VOID + 1.5), 1.6 - PROUD, PORTAL_TOP - PROUD, FRONT - 0.5, FRONT + 0.25, tile);
    }
    block(-PORTAL, PORTAL, ARCH_TOP + 1.5, PORTAL_TOP, SCREEN_BACK, FRONT, body);
    // The head's band stops `PROUD` inside the jambs' outer faces, for the same reason.
    block(-PORTAL + PROUD, PORTAL - PROUD, ARCH_TOP, ARCH_TOP + 1.5, FRONT - 0.5, FRONT + 0.25, tile);

    // The back of the iwan, and the door in it. `brown` because this face never
    // sees the sun and a neutral in a recess reads as a hole in the model.
    block(-VOID, VOID, 1.6, ARCH_TOP, SCREEN_BACK - 0.5, SCREEN_BACK, dark);
    block(-3.4, 3.4, 1.6, 9.2, SCREEN_BACK - 1.1, SCREEN_BACK - 0.45, recess);

    // The arch head. Six courses, each shallower than the void it hangs in so
    // the ink line of every one of them is drawn across the opening.
    let y = ARCH_SPRING;
    for (const [half, rise] of ARCH) {
      block(-half, half, y, y + rise, SCREEN_BACK, FRONT - 1.4, body);
      y += rise;
    }

    // The lions and their suns, one over each haunch of the arch. Discs laid
    // flat against the jamb face — the one figurative image on the building and
    // the reason it is called Sher-Dor.
    for (const side of [-1, 1]) {
      const disc = column(2.05, 0.5, sun, 8);
      disc.rotation.x = Math.PI / 2;
      // `PROUD` forward of the tile frame, whose front it would otherwise share.
      disc.position.set(side * 10.25, 25.4, FRONT - 0.25 + PROUD);
      group.add(disc);
    }

    // -----------------------------------------------------------------------
    // 5. The minarets. Sher-Dor's stand at the outer corners of the screen and
    //    lean very slightly outward — the lean is real, it is the thing every
    //    guide points at, and 1.4 degrees is enough to see and not enough to
    //    look like a mistake. The tilt is on a pivot group with no scale of its
    //    own: `T * R * S` puts scale first, and a scaled-then-rotated tower is
    //    how thirty monument files went wrong.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      // The foot stands square and the lean starts above it. Tilting the whole
      // tower from y = 0 drops the corner of a 3-unit octagon 0.07 below the
      // ground, which `validate` calls sinking and is right to.
      const foot = column(3.0, 3.4, base, 8);
      foot.position.set(side * MINARET_X, 0, MINARET_Z);
      group.add(foot);

      const pivot = new THREE.Group();
      pivot.position.set(side * MINARET_X, 3.4, MINARET_Z);
      pivot.rotation.z = -side * 0.024;
      group.add(pivot);

      const shaft = taper(2.85, 2.15, 29.6, body, 8);
      pivot.add(shaft);

      // Two tile bands up the shaft. A Timurid minaret is banded, and without
      // them a 29-unit prism is a chimney.
      for (const at of [13, 25]) {
        const band = ringWall(2.6, 2.85, 1.3, tile, 8);
        band.position.y = at - 3.4;
        pivot.add(band);
      }

      // The gallery, its lantern, and a blue cap.
      const gallery = ringWall(2.05, 3.05, 1.7, tile, 8);
      gallery.position.y = 33.0 - 3.4;
      pivot.add(gallery);

      const lantern = column(1.85, 3.1, body, 8);
      lantern.position.y = 34.7 - 3.4;
      pivot.add(lantern);

      const cap = taper(2.1, 0.45, 2.0, tile, 8);
      cap.position.y = 37.8 - 3.4;
      pivot.add(cap);
    }

    // -----------------------------------------------------------------------
    // 6. The floor of the square. A *registan* is a sandy place, and the one
    //    thing the crop loses is that this facade is only ever seen across an
    //    open pavement. One thin plate, a hand's width proud of the ground, is
    //    the cheapest way to say the building stands at the far side of
    //    somewhere rather than in a field.
    // -----------------------------------------------------------------------
    block(-26, 26, 0, 0.5, FRONT + 1, FRONT + 7, base);

    return group;
  },
};
