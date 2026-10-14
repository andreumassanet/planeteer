import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Baalbek, the Temple of Jupiter — Beqaa, Lebanon.
 *
 * A fragment, not a peristyle: the six surviving columns (19.9 m of shaft) in a
 * line at one edge of an empty platform, entablature still on top and nothing
 * behind them but sky. The cella is deliberately not modelled; a wall behind the
 * columns would make it a Parthenon. Only a three-unit stub of the cella's
 * stylobate wall stands, low enough that the camera looks over it.
 *
 * The podium is the ground it owns (no apron): five stepped courses, the third
 * the trilithon, nearly three units tall with three joints. Nothing is
 * stretched: columns 22.5 units for 19.9 m, podium 12.5 for about 13 m
 * (half-diagonal over height 0.65). The plan is cropped to six columns on a
 * 38 by 34 platform.
 */

/** Half-width and half-depth of the podium, and how high it stands. */
const PODIUM_X = 19;
const PODIUM_Z = 17;
const PODIUM_TOP = 12.5;

/**
 * The podium's courses, as [top of the course, how far it is stepped in from
 * `PODIUM_X`/`PODIUM_Z`]. The third is the trilithon, nearly three units tall.
 */
const COURSES: [top: number, inset: number][] = [
  [2.4, 0.0],
  [5.0, 0.35],
  [8.6, 0.7],
  [10.8, 1.15],
  [12.5, 1.5],
];

/** Where the trilithon sits in the list above, and how many stones it is. */
const TRILITHON = 2;

/** Six columns, and how far apart their axes are. */
const COLUMNS = 6;
const SPACING = 5.8;

/** The columns stand near the front edge of the platform, not in the middle of it. */
const COLUMN_Z = 12.5;

export const baalbek: Monument = {
  id: 'baalbek',
  name: 'Baalbek',
  iso: 'LBN',
  lat: 34.0069,
  lon: 36.2039,
  tier: 'building',
  footprint: 27,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const stone = palette.sand; // the columns: warm honey limestone, and a lit surface all day
    const podium = palette.tan; // the great wall, greyer and cooler than the temple on it
    const mega = palette.brown; // the trilithon course, dark enough to read as one band
    const fallen = palette.brown; // drums lying where they fell
    const shadow = palette.bark; // joints and the cella stub, both of which live in shade

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
    // 1. The podium. Five courses, each stepped in from the one below, so every
    //    joint is a change of depth and gets its own ink line (flush faces draw
    //    none).
    // -----------------------------------------------------------------------
    let base = 0;
    for (let i = 0; i < COURSES.length; i++) {
      const [top, inset] = COURSES[i]!;
      const x = PODIUM_X - inset;
      const z = PODIUM_Z - inset;
      if (i === TRILITHON) {
        // Three stones and not one wall: the joints are what Baalbek is known for.
        for (let k = 0; k < 3; k++) {
          const x0 = -x + (k * 2 * x) / 3;
          const x1 = -x + ((k + 1) * 2 * x) / 3;
          // Each stone stands 0.12 proud of or shy of its neighbours, alternating,
          // so the two vertical joints are depth changes rather than colour ones.
          const face = z - (k === 1 ? 0.0 : 0.12);
          block(x0 + 0.1, x1 - 0.1, base, top, -face, face, mega);
        }
        // The joint faces, dark, in the two gaps. They sit 0.2 back so they read
        // as shadow between stones rather than as a stripe on a wall.
        for (const k of [1, 2]) {
          const at = -x + (k * 2 * x) / 3;
          block(at - 0.14, at + 0.14, base, top, -(z - 0.2), z - 0.2, shadow);
        }
      } else {
        block(-x, x, base, top, -z, z, podium);
      }
      base = top;
    }

    // -----------------------------------------------------------------------
    // 2. The stylobate: two steps in from the podium.
    // -----------------------------------------------------------------------
    block(-17.4, 17.4, PODIUM_TOP, PODIUM_TOP + 0.6, -15.4, 15.4, stone);
    block(-16.6, 16.6, PODIUM_TOP + 0.6, PODIUM_TOP + 1.2, -14.6, 14.6, stone);
    const FLOOR = PODIUM_TOP + 1.2;

    // -----------------------------------------------------------------------
    // 3. The six columns: plinth, base, shaft, capital. The shaft has ten sides
    //    so the cel band steps twice round it and it reads as round (eight left
    //    a flat wide enough to read as a flat).
    // -----------------------------------------------------------------------
    const first = -((COLUMNS - 1) * SPACING) / 2;
    let capTop = 0;
    for (let i = 0; i < COLUMNS; i++) {
      const x = first + i * SPACING;

      const plinth = box(3.4, 0.5, 3.4, stone);
      plinth.position.set(x, FLOOR, COLUMN_Z);
      group.add(plinth);

      const attic = column(1.5, 1.0, stone, 8);
      attic.position.set(x, FLOOR + 0.5, COLUMN_Z);
      group.add(attic);

      const shaft = taper(1.25, 1.08, 18.4, stone, 10);
      shaft.position.set(x, FLOOR + 1.5, COLUMN_Z);
      group.add(shaft);

      // Corinthian: the capital flares to nearly twice the shaft, which is what
      // makes a row of these read as Roman rather than as Doric posts.
      const capital = taper(1.08, 1.95, 2.6, stone, 8);
      capital.position.set(x, FLOOR + 19.9, COLUMN_Z);
      group.add(capital);
      capTop = FLOOR + 22.5;
    }

    // -----------------------------------------------------------------------
    // 4. The entablature: architrave, frieze and cornice, each at its own depth
    //    (three ink lines), overhanging the end columns slightly.
    // -----------------------------------------------------------------------
    const span = -first + 2.6;
    block(-span, span, capTop, capTop + 1.5, COLUMN_Z - 2.0, COLUMN_Z + 2.0, stone);
    block(-span + 0.3, span - 0.3, capTop + 1.5, capTop + 2.6, COLUMN_Z - 1.7, COLUMN_Z + 1.7, podium);
    block(-span - 0.5, span + 0.5, capTop + 2.6, capTop + 3.4, COLUMN_Z - 2.5, COLUMN_Z + 2.5, stone);

    // -----------------------------------------------------------------------
    // 5. The cella stub: three units high, so from 13.4 degrees every gap
    //    between the columns stays open.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 11.0, side * 12.6, FLOOR, FLOOR + 3.0, -9.5, 2.5, shadow);
    }
    block(-12.6, 12.6, FLOOR, FLOOR + 2.2, -11.1, -9.5, shadow);

    // -----------------------------------------------------------------------
    // 6. Five fallen drums on the platform. A lying prism is a rotation only (no
    //    scale on the same object).
    // -----------------------------------------------------------------------
    for (const [x, z, roll, len] of [
      [-9.5, -4.0, 0.35, 3.6],
      [-4.2, -6.5, 1.9, 3.2],
      [3.0, -3.2, 0.9, 3.8],
      [8.6, -7.0, 2.6, 3.0],
      [12.2, 1.5, 0.2, 3.4],
    ] as const) {
      const drum = column(1.22, len, fallen, 10);
      // Lay it down: the prism's own axis is +Y, so a quarter turn about X puts
      // it on the floor, and `roll` about Y is which way it points.
      const lie = new THREE.Group();
      lie.position.set(x, FLOOR + 1.22, z);
      lie.rotation.y = roll;
      const inner = new THREE.Group();
      inner.rotation.x = Math.PI / 2;
      inner.add(drum);
      // `column` stands on its base, so the laid drum comes back half its length.
      drum.position.y = -len / 2;
      lie.add(inner);
      group.add(lie);
    }

    return group;
  },
};
