import { PROUD } from './contract.ts';
import type { Group, Monument } from './contract.ts';

/**
 * Table Mountain.
 *
 * A flat-topped range, kept distinct from Uluru by class of shape: a wall and
 * a lid with no shoulder, a dead-level crest, a flank of buttresses and ravines,
 * and a range (two lower pointed peaks and two saddles) rather than one
 * monolith. Four things carry it at 40 pixels:
 * 1. The level top: one single `box` (`CAP`) laid across every slice of the
 *    cliff, so no arithmetic can put two points of the summit at different
 *    heights. Maclear's Beacon is left out for the same reason.
 * 2. The hard corner where the top meets the cliff: `CAP` overhangs the wall
 *    by `CORNICE` on all four sides, so the lip is one ink line with a shadow
 *    under it.
 * 3. The sheer, fluted face below it (`BUTTRESSES`).
 * 4. Devil's Peak and Lion's Head, lower and pointed at either end, with a
 *    saddle between each and the table.
 *
 * It is a model rather than terrain because `reliefAt` is 0.0 across the whole
 * Cape (a peninsula with ocean on three sides), so there is nothing to build on.
 *
 * Tier `landmark`, 45 units tall: `tower` cannot hold a range, and `building`'s
 * 40 would squeeze the five levels (scree 12, Kloof Nek 13, the Saddle 31,
 * Devil's Peak 40.5, the table 45) until Devil's Peak sat 4 units under the
 * tabletop. The vertical stretch is 2.8x, the mildest of any landform here since
 * the mountain is already a cliff. The tabletop pays: 60 over 29.8 (2.0:1)
 * against 6.1:1 in life, so it takes 60 of the model's 110 units of width. The
 * widest points are the flanking peaks, 54.6 out against 45 tall (aspect 1.21).
 * The massif's southern extent is cropped, with `SHELVES` as the only nod to it.
 *
 * Left out: the tablecloth of cloud (white geometry with an ink outline reads
 * as rock or snow, and it hides the level line), the cable car, which would put
 * a building on the corner that has to stay hard, and Signal Hill.
 *
 * Colour: the rock is `slate` (the palette's cool mid-tone, as for Fuji) over
 * `brown` scree and lower slopes, so the colour change falls on the change of
 * slope. `bark` fills the deep ravines, which are recesses. `green` is the
 * fynbos on the skirt.
 */

// --- levels ---------------------------------------------------------------

/** The tabletop, and the highest point in the model. */
const TOP = 45;

/** The capping stratum: one slab over every slice, and the reason the top is level. */
const CAP = 3.2;

/**
 * How far `CAP` overhangs the wall on all four sides. Any further and it is an
 * eave over pilasters, a warehouse; at 0.7 the lip is one ink line with a
 * shadow under it.
 */
const CORNICE = 0.7;

/** Top of the cliff slices, under the cap. */
const CLIFF_TOP = TOP - CAP;

/** The scree line: cliff foot above, talus below. The one horizontal in the model. */
const SCREE = 12;

/** The cliff plane. A flush buttress's face sits here; a ravine is recessed from it. */
const FRONT = 15;
/**
 * The back of the cliff block. At -15 the high mass was nearly a cube, and a
 * flat-topped cube with vertical ribs is a building. The cliff block is 19
 * deep and `SHELVES` carries the summit back at full height on a narrower plan,
 * then drops in two courses to the Back Table. The front lip is one straight
 * box; everything irregular happens where the front camera cannot see it.
 */
const BACK = -4;

/** The table's ends. 60 units of level top, 55% of the model's 109.3-unit width. */
const TABLE_X0 = -32;
const TABLE_X1 = 28;

// --- the cliff ------------------------------------------------------------

/**
 * The north face: eight buttress masses, each with fine flutes across it.
 *
 * Two scales are needed: a flat plane with decoration is a building. `set` is
 * the big shape, how far a whole mass stands back from `FRONT` (up to 5.5
 * units), and `flutes` is the small one, one slice per entry recessed from its
 * mass's face (never past 1.0).
 *
 * No mass carries a cap: eight level lids hull separately and would crenellate
 * the skyline, so the masses stop `BROW` short of the lip and one band carries
 * one cap.
 *
 * `slot` is a cleft cut deeper into one flute, as `[which flute, how much
 * deeper]`. The deepest, 8.5 units into a 19-unit block, is Platteklip Gorge,
 * just east of centre, the wall's one asymmetry.
 *
 * `ledges` are bedding shelves at absolute heights, `LEDGE_OUT` proud of their
 * own mass's face (a ledge crossing a bay would be a bridge). Their heights run
 * 16.8 to 32.6 with no two masses sharing one; a unit of jitter is a third of a
 * pixel and would read as rows of windows.
 */
interface Buttress {
  /** Along the range, before the set is normalised to span `TABLE_X0..TABLE_X1`. */
  width: number;
  /** How far this mass's face stands back from `FRONT`. The big shape. */
  set: number;
  /** One slice each, recessed this much from the mass's own face. The small shape. */
  flutes: readonly number[];
  /** A cleft cut deeper into one flute: `[index, extra depth]`. */
  slot?: readonly [index: number, depth: number];
  /** Bedding shelves on this mass, at absolute height. */
  ledges?: readonly number[];
}

const BUTTRESSES: readonly Buttress[] = [
  { width: 9.0, set: 4.0, flutes: [0, 0.8, 0.3, 0.6], ledges: [24.6] },
  {
    width: 10.0,
    set: 0.0,
    flutes: [0.2, 0.9, 0, 0.6, 0.3],
    slot: [2, 2.4],
    ledges: [18.9, 29.4],
  }, // Africa Face, the broad mass east of the gorge
  { width: 5.0, set: 5.5, flutes: [0.4, 0], slot: [1, 3.0] }, // the Platteklip bay
  { width: 9.5, set: 1.0, flutes: [0, 0.7, 0.3, 1.0], ledges: [22.3, 32.6] },
  { width: 6.0, set: 4.0, flutes: [0.5, 0, 0.9] },
  { width: 9.5, set: 0.5, flutes: [0.3, 0, 0.8, 0.4], ledges: [16.8, 27.1] }, // Arrow Face
  { width: 5.0, set: 4.5, flutes: [0, 0.6], slot: [0, 2.2] },
  { width: 6.0, set: 1.5, flutes: [0.4, 0, 0.9], ledges: [30.8] }, // Kloof Corner
];

/**
 * The brow: a band flush with `FRONT`, running the whole 60 units under the cap.
 * It lets the wall be bayed and the lip straight at once: the top six units of
 * cliff are one flush plane, so the cap sits on solid rock along its length and
 * every bay, flute and cleft below dies out into it.
 */
const BROW = 6;

/** Ledges: how far proud of their mass's face, and how thick. */
const LEDGE_OUT = 0.9;
const LEDGE_THICK = 1.1;
/** How much of a mass's width a ledge leaves clear at each end. */
const LEDGE_INSET = 1.4;

// --- the scree ------------------------------------------------------------

/**
 * The talus apron: one stretched octagonal frustum, `[half-depth, half-length]`
 * at the foot and at the scree line.
 *
 * One frustum keeps the slope's angle constant. The front runs 10.5 units out
 * for 12 up (48.8 degrees, steep for real talus, but what has to read is the
 * break between slope and wall). Octagonal because a stretched octagon's
 * corners are 45.6 out against 53.4 for a rectangle, leaving the flanking peaks
 * their room.
 */
const SCREE_BASE_Z = 29;
const SCREE_BASE_X = 46;
const SCREE_TOP_Z = 18.5;
// No half-length at the scree line: the frustum is one shape stretched in x, so it is
// `SCREE_TOP_Z * SCREE_BASE_X / SCREE_BASE_Z`.
/** The apron's centre: the massif's own, so the model straddles the Y axis. */
const MASSIF_X = -2;
const MASSIF_Z = -3;

/**
 * Talus fans below the gullies: `[x, height]`.
 *
 * Debris comes off a cliff through its ravines, so the scree line is scalloped:
 * overlapping cones with their apexes at the gully mouths. They are cut
 * shallower than the apron (40 degrees against 48.8), since a cone at the
 * apron's own gradient is coplanar with it. They also break the scree line's
 * long horizontal by pushing `brown` up past it, and the apron's octagonal plan
 * retreats near the table's corners.
 */
/** Horizontal run per unit of rise: `1 / tan(40 deg)`, against the apron's 0.875. */
const FAN_SLOPE = 1.192;
/** A fan's half-width in x against its half-depth. Under 1: a cone below a gully is a tongue running downslope. */
const FAN_WIDE = 1.15;
const FANS: ReadonlyArray<readonly [x: number, height: number]> = [
  [-26.0, 8.0],
  [-14.0, 9.5],
  [-8.0, 11.0], // under Platteklip Gorge, the largest
  [3.0, 8.5],
  [12.0, 9.5],
  [22.0, 8.0],
];

/**
 * Where the apron's front or back face stands at a given depth.
 *
 * Exact only across the flat facet the octagon presents to +Z and -Z (x -15 to
 * +11 at the top, -21 to +19 at the foot). It puts a bush or a fallen block on
 * the slope rather than at the bottom of it.
 */
const apronAt = (z: number): number => {
  const t = (SCREE_BASE_Z - Math.abs(z - MASSIF_Z)) / (SCREE_BASE_Z - SCREE_TOP_Z);
  return Math.max(0, Math.min(1, t)) * SCREE;
};

/**
 * Fynbos and pine on the slope: `[x, z, width, height, depth, yaw]`. Kept to a
 * couple of units so they say how big the thing behind them is, and allowed to
 * climb the scree to break the scree line. Each is sunk `PLANT_SINK` into the
 * slope so it grows out of it.
 */
const PLANT_SINK = 0.9;
const FYNBOS: ReadonlyArray<
  readonly [x: number, z: number, w: number, h: number, d: number, yaw: number]
> = [
  [-19, 24.0, 9, 2.4, 6, 0.3],
  [-11, 21.0, 7, 2.0, 5, -0.25],
  [-3, 25.5, 10, 2.6, 6, 0.15],
  [6, 22.5, 8, 2.2, 5, -0.4],
  [15, 25.0, 9, 2.4, 6, 0.2],
  [-16, -23.5, 8, 2.2, 5, 0.4],
  [4, -25.0, 9, 2.4, 6, -0.2],
  [-6, -21.5, 7, 2.0, 5, 0.1],
];

/**
 * Clumps out on the flat, beyond the apron's toe: `[x, z, width, height, depth,
 * yaw]`. Off the octagon's diagonal facets, standing at y = 0.
 */
const OUTLIERS: ReadonlyArray<
  readonly [x: number, z: number, w: number, h: number, d: number, yaw: number]
> = [
  [-44, 20, 8, 2.2, 5, 0.2],
  [40, 17, 9, 2.6, 6, -0.3],
  [-38, -22, 8, 2.0, 5, 0.35],
  [30, -21, 7, 2.2, 5, -0.15],
  [47, 10, 7, 2.0, 4, 0.45],
];

/** Blocks fallen off the face and lying on the apron: `[x, z, size, height, yaw]`. */
const BOULDERS: ReadonlyArray<
  readonly [x: number, z: number, size: number, height: number, yaw: number]
> = [
  [-14, 19.5, 3.4, 2.6, 0.4],
  [-5, 22.5, 4.2, 3.2, -0.3],
  [7, 18.5, 3.0, 2.4, 0.55],
  [17, 21.5, 3.8, 2.8, -0.5],
];

// --- the range ------------------------------------------------------------

/**
 * Devil's Peak, east of the table, and Lion's Head, west of it. Devil's Peak
 * takes negative x because the front camera looks at +Z from the north, as in
 * the canonical photograph across Table Bay.
 *
 * Heights are the real ratios: Devil's Peak 0.92 of the table (41.4, brought to
 * 40.5 so the tabletop clearly wins) and Lion's Head 0.62 (27.8). The saddles
 * are deliberately unequal: the Saddle, between the table and Devil's Peak, is
 * high (31), so the peak grows from the massif's shoulder; Kloof Nek, between
 * the table and Lion's Head, is low (13), so Lion's Head stands almost free.
 */
const SADDLE_X = -35.5;
const SADDLE_TOP = 31;
const DEVIL_X = -43;
const DEVIL_TOP = 40.5;
const NEK_X = 33;
const NEK_TOP = 13;
const LION_X = 45;
const LION_TOP = 27.8;

/**
 * The plateau behind the lip: `[x0, x1, z0, z1, top]`, south-facing courses.
 * The first is at the summit's own height, so the top is level but not
 * rectangular. The two behind it are the massif falling away south.
 */
const SHELVES: ReadonlyArray<
  readonly [x0: number, x1: number, z0: number, z1: number, top: number]
> = [
  [-26, 16, -14, -4, 45],
  [-29, 20, -20, -14, 40.5],
  [-23, 12, -27, -20, 35],
];

/**
 * The ends of the table, stepping down to the two saddles:
 * `[x0, x1, z0, z1, top]`.
 *
 * Left as one vertical plane the ends would make the whole thing a box. Two
 * steps on the west, dropping towards `NEK_TOP`; one on the east, where Devil's
 * Peak's own mass takes over. That step tops out at 38.5, so the east notch is
 * 38.5 and not `SADDLE_TOP`'s 31, and this end is the weaker of the two.
 */
const ENDS: ReadonlyArray<
  readonly [x0: number, x1: number, z0: number, z1: number, top: number]
> = [
  [-38.2, -32.7, -4, 13, 38.5],
  [28.7, 34.0, -3, 13, 39.0],
  [34.0, 37.6, -1, 11, 27.0],
];

export const tableMountain: Monument = {
  id: 'table-mountain',
  name: 'Table Mountain',
  iso: 'ZAF',
  lat: -33.957,
  lon: 18.403,
  realHeight: 1085,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const rock = palette.slate;
    const gully = palette.brown;
    const shadow = palette.bark;
    const talus = palette.brown;
    const fynbos = palette.green;

    const group = new THREE.Group();

    /**
     * A prism stretched along x, standing on its own base. `taper` is regular in
     * plan, so scaling the mesh in x makes the half-widths independent. Eight
     * sides, because with a flat face on +Z an octagon's widest vertex in x sits
     * on the apothem, so a stretched octagon reaches `halfX` and no further; a
     * pentagon's widest vertex is at 1.18 of the apothem.
     */
    const mass = (
      x: number,
      z: number,
      y: number,
      halfZ0: number,
      halfZ1: number,
      halfX0: number,
      height: number,
      color: number,
      sides = 8,
    ): Group => {
      const holder = new THREE.Group();
      const mesh = taper(halfZ0, halfZ1, height, color, sides);
      mesh.scale.x = halfX0 / halfZ0;
      holder.add(mesh);
      holder.position.set(x, y, z);
      return holder;
    };

    /** A block given by its plan corners and its top, standing on the ground. */
    const slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      base: number,
      top: number,
      color: number,
    ): Group => {
      const holder = new THREE.Group();
      const mesh = box(x1 - x0, top - base, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, base, (z0 + z1) / 2);
      holder.add(mesh);
      return holder;
    };

    // --- the scree apron, first, so everything else is drawn standing in it ---
    group.add(
      mass(
        MASSIF_X, MASSIF_Z, 0,
        SCREE_BASE_Z, SCREE_TOP_Z, SCREE_BASE_X,
        SCREE, talus,
      ),
    );

    for (const [x, height] of FANS) {
      // Centred on the cliff plane, so half the cone is buried and a fan is banked against the wall.
      const reach = 1.5 + FAN_SLOPE * height;
      group.add(mass(x, FRONT, 0, reach, 1.5, reach * FAN_WIDE, height, talus, 6));
    }

    // --- the cliff: eight masses, their flutes and their ledges ---
    const spanned = BUTTRESSES.reduce((sum, b) => sum + b.width, 0);
    const scale = (TABLE_X1 - TABLE_X0) / spanned;
    const bayTop = CLIFF_TOP - BROW;
    let cursor = TABLE_X0;

    for (const buttress of BUTTRESSES) {
      const width = buttress.width * scale;
      const x0 = cursor;
      const x1 = cursor + width;
      cursor = x1;
      const massFace = FRONT - buttress.set;
      const fluteWidth = width / buttress.flutes.length;

      buttress.flutes.forEach((flute, index) => {
        const slot = buttress.slot?.[0] === index ? buttress.slot[1] : 0;
        const face = massFace - flute - slot;
        const slice = box(fluteWidth, bayTop, face - BACK, slot > 0 ? shadow : rock);
        slice.position.set(x0 + fluteWidth * (index + 0.5), 0, (face + BACK) / 2);
        group.add(slice);
      });

      for (const y of buttress.ledges ?? []) {
        const ledge = box(width - LEDGE_INSET * 2, LEDGE_THICK, LEDGE_OUT + 2.6, rock);
        ledge.position.set((x0 + x1) / 2, y, massFace + LEDGE_OUT - (LEDGE_OUT + 2.6) / 2);
        group.add(ledge);
      }
    }

    // --- the brow, then the cap: one flush band the length of the table and one lid whose top is `TOP` everywhere ---
    const brow = box(TABLE_X1 - TABLE_X0, BROW, FRONT - BACK, rock);
    brow.position.set((TABLE_X0 + TABLE_X1) / 2, bayTop, (FRONT + BACK) / 2);
    group.add(brow);

    const cap = box(
      TABLE_X1 - TABLE_X0 + CORNICE * 2,
      CAP,
      FRONT - BACK + CORNICE * 2,
      rock,
    );
    cap.position.set((TABLE_X0 + TABLE_X1) / 2, CLIFF_TOP, (FRONT + BACK) / 2);
    group.add(cap);

    // --- the plateau behind it, and the ends stepping down to the saddles ---
    for (const [x0, x1, z0, z1, top] of SHELVES) group.add(slab(x0, x1, z0, z1, 0, top, rock));
    for (const [x0, x1, z0, z1, top] of ENDS) group.add(slab(x0, x1, z0, z1, 0, top, rock));

    // --- the Saddle, and Devil's Peak out of it ---
    group.add(mass(SADDLE_X, -2, 0, 13, 10.5, 11, SCREE, talus));
    group.add(mass(SADDLE_X, -2, SCREE, 10.5, 7.5, 9, SADDLE_TOP - SCREE, rock));

    group.add(mass(DEVIL_X, -1, 0, 13.5, 11, 11.2, SCREE + 2, talus));
    group.add(mass(DEVIL_X, -1, SCREE + 2, 11, 7.5, 10, 14, rock));
    group.add(mass(DEVIL_X + 0.6, -0.5, 28, 7.5, 1.0, 6.8, DEVIL_TOP - 28, rock, 5));
    // Crags on the ridge running down to the sea, so the peak has a ridge and not two symmetrical sides.
    group.add(mass(DEVIL_X - 6.5, 1.5, 20, 4.0, 1.2, 3.4, 8.5, rock, 5));
    // The gully's foot is `PROUD` down in the scree, so the two colours do not share a plane at 14.
    group.add(mass(DEVIL_X - 7.5, -2.0, 14 - PROUD, 3.2, 1.0, 2.8, 6.0 + PROUD, gully, 5));
    group.add(mass(DEVIL_X + 5.5, 2.5, 22, 3.6, 1.1, 3.2, 6.5, rock, 5));

    // --- Kloof Nek, and Lion's Head beyond it ---
    group.add(mass(NEK_X, 0, 0, 12, 9.5, 6.5, NEK_TOP, talus));

    group.add(mass(LION_X, 0, 0, 11, 8, 9.5, SCREE - 2, talus));
    group.add(mass(LION_X, 0, SCREE - 2, 8, 4.2, 8, 11, rock));
    group.add(mass(LION_X - 0.5, 0.5, 21, 4.2, 0.8, 4.2, LION_TOP - 21, rock, 5));
    group.add(mass(LION_X + 4.5, -1.5, 12, 3.2, 1.0, 3.0, 5.5, gully, 5));

    // --- the foot ---
    // Clamped at the ground: near the apron's toe a clump sunk `PLANT_SINK` would go below y = 0.
    const seat = (z: number): number => Math.max(0, apronAt(z) - PLANT_SINK);

    for (const [x, z, size, height, yaw] of BOULDERS) {
      const block = box(size, height, size * 0.8, rock);
      block.position.set(x, seat(z), z);
      block.rotation.y = yaw;
      group.add(block);
    }

    for (const [x, z, w, h, d, yaw] of FYNBOS) {
      const clump = box(w, h, d, fynbos);
      clump.position.set(x, seat(z), z);
      clump.rotation.y = yaw;
      group.add(clump);
    }

    for (const [x, z, w, h, d, yaw] of OUTLIERS) {
      const clump = box(w, h, d, fynbos);
      clump.position.set(x, 0, z);
      clump.rotation.y = yaw;
      group.add(clump);
    }

    return group;
  },
};
