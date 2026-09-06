import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Baalbek, the Temple of Jupiter — Beqaa, Lebanon.
 *
 * **Why Lebanon:** the Levant had one pin. Petra covers Jordan and everything
 * north of it — Lebanon, Syria, Israel, Palestine — was empty, which is a
 * thousand kilometres of the oldest continuously inhabited coast on Earth with
 * nothing to walk to. Baalbek is the largest Roman temple ever built and the six
 * columns that survive of it are the tallest in the classical world: 19.9 metres
 * of shaft on a podium of stones that nobody has satisfactorily explained the
 * moving of.
 *
 * ---------------------------------------------------------------------------
 * Six columns is not a Parthenon and the difference is what is missing
 * ---------------------------------------------------------------------------
 *
 * The obvious objection to a Roman temple is that this world already has the
 * Parthenon and Persepolis, and a third row of columns is a third row of columns.
 * It is not, and the reason is worth being precise about. **The Parthenon is a
 * complete peristyle — a colonnade all the way round a building — and reads as
 * an enclosure. Baalbek is a fragment.** Fifty-four columns stood here and six
 * are left, standing in a line at one edge of an empty platform with the
 * entablature still on top of them and nothing behind them but sky. What the eye
 * gets is *height and absence*, which is the opposite read, and it is why the
 * cella is deliberately not modelled: put a wall behind these columns and you
 * have built the Parthenon by accident.
 *
 * The other half of the place is the **podium**, and it is not scenery. Its
 * lower courses are single stones of eight hundred tonnes — the trilithon, three
 * stretchers of about nineteen metres each — and the model gives that course its
 * own height and its own three joints so the wall reads as a few colossal blocks
 * rather than as masonry. The columns stand on a cliff of them.
 *
 * ---------------------------------------------------------------------------
 * Nothing is stretched, which almost never happens here
 * ---------------------------------------------------------------------------
 *
 * The columns are 22.5 units from plinth to capital against 19.9 metres, and the
 * podium 12.5 units against about 13: **1.13 and 0.96 units per metre**, so the
 * model is within about a sixth of one uniform scale and carries no vertical
 * exaggeration at all. That is unusual under this contract and it happens for a
 * simple reason — the thing is already tall and narrow, so the `building` tier's
 * 40 units of height and the six-column crop meet without either having to give.
 * Half-diagonal over height: **0.65** against the 2.00 cap, the most slack any
 * monument in this wave has.
 *
 * What *is* cropped is the plan. The stylobate was 88 by 48 metres and ten
 * columns wide; this is six of them on a platform 38 by 34 units, which is about
 * 35 by 31 metres. The crop is along the temple's own axis and takes the corner
 * away, which is the one direction a photograph of Baalbek never looks.
 *
 * ---------------------------------------------------------------------------
 * The podium is the ground it owns, and there is no apron
 * ---------------------------------------------------------------------------
 *
 * `biomeAt` calls the Beqaa `temperate` and `groundColorAt` paints it `#8fa565`.
 * There is no paved court laid round the foot of this model. The podium is a
 * twelve-unit vertical wall of masonry meeting the ground directly — which is
 * exactly what Baalbek is, a temple standing on a cliff it built for itself —
 * and everything above it is the building. A stone apron would be a second
 * ground, and the shallow camera would show its straight edge before it showed
 * anything else.
 */

/** Half-width and half-depth of the podium, and how high it stands. */
const PODIUM_X = 19;
const PODIUM_Z = 17;
const PODIUM_TOP = 12.5;

/**
 * The podium's courses, as [top of the course, how far it is stepped in from
 * `PODIUM_X`/`PODIUM_Z`]. The third is the trilithon and it is nearly three
 * units tall on its own, because at Baalbek one course really is that much
 * bigger than the others.
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
    //    joint is a change of *depth* and gets its own ink line. Flush courses
    //    in two colours would be paint: `OutlineEffect` hulls each mesh
    //    separately and a face coplanar with its neighbour's draws nothing,
    //    which is what turned Niagara's American curtain into one blank
    //    rectangle.
    // -----------------------------------------------------------------------
    let base = 0;
    for (let i = 0; i < COURSES.length; i++) {
      const [top, inset] = COURSES[i]!;
      const x = PODIUM_X - inset;
      const z = PODIUM_Z - inset;
      if (i === TRILITHON) {
        // Three stones and not one wall. The joints are the whole point: this
        // course is what people come to Baalbek to stand in front of, and a
        // single block would say nothing about why.
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
    // 2. The stylobate. Two steps in from the podium, which is what puts the
    //    temple visibly *on* the platform instead of flush with its edge.
    // -----------------------------------------------------------------------
    block(-17.4, 17.4, PODIUM_TOP, PODIUM_TOP + 0.6, -15.4, 15.4, stone);
    block(-16.6, 16.6, PODIUM_TOP + 0.6, PODIUM_TOP + 1.2, -14.6, 14.6, stone);
    const FLOOR = PODIUM_TOP + 1.2;

    // -----------------------------------------------------------------------
    // 3. The six columns. Plinth, base, shaft, capital — four pieces each, and
    //    the shaft has ten sides.
    //
    //    Ten is a decision about ink rather than about geometry. A ten-sided
    //    shaft 2.5 units across deviates from a circle by 0.03 units, which is
    //    nothing; what ten buys is a cel band that steps twice round the shaft
    //    instead of once, so a column reads as round and not as a post. Eight
    //    was tried first and the flat facing the sun was wide enough to read as
    //    a flat.
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
    // 4. The entablature. Architrave, frieze and cornice, each at its own depth
    //    so the three bands are three ink lines. It overhangs the end columns by
    //    a little, which is what makes it read as a beam carried by them rather
    //    than as a lid sitting on them.
    // -----------------------------------------------------------------------
    const span = -first + 2.6;
    block(-span, span, capTop, capTop + 1.5, COLUMN_Z - 2.0, COLUMN_Z + 2.0, stone);
    block(-span + 0.3, span - 0.3, capTop + 1.5, capTop + 2.6, COLUMN_Z - 1.7, COLUMN_Z + 1.7, podium);
    block(-span - 0.5, span + 0.5, capTop + 2.6, capTop + 3.4, COLUMN_Z - 2.5, COLUMN_Z + 2.5, stone);

    // -----------------------------------------------------------------------
    // 5. What is left of the temple behind them. A stub of the cella's own
    //    stylobate wall, three units high and no more.
    //
    //    **This is where the model could have gone wrong.** A cella wall at any
    //    real height would stand behind the columns, fill the gaps between them,
    //    and turn six columns against sky into a colonnade in front of a
    //    building — which is the Parthenon. Three units is low enough that the
    //    camera looks over it from 13.4 degrees and every gap stays open.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 11.0, side * 12.6, FLOOR, FLOOR + 3.0, -9.5, 2.5, shadow);
    }
    block(-12.6, 12.6, FLOOR, FLOOR + 2.2, -11.1, -9.5, shadow);

    // -----------------------------------------------------------------------
    // 6. Fallen drums. Five of them lying on the platform, which is what an
    //    empty temple floor actually has on it, and what stops the biggest flat
    //    area in the model from being flat.
    //
    //    A lying prism is a rotation and nothing else — no scale on the same
    //    object — so `T * R * S` cannot bite here.
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
      // `column` stands on its own base, so the laid drum has to come back half
      // its own length to sit centred on the point it was placed at.
      drum.position.y = -len / 2;
      lie.add(inner);
      group.add(lie);
    }

    return group;
  },
};
