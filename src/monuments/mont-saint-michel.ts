import type { Monument, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Mont-Saint-Michel.
 *
 * One shape: a cone of buildings that narrows without a break from a walled
 * base to a single gold point. Three rings of village, each smaller and higher
 * than the last, then the abbey's buttressed drum, the church, the crossing
 * tower and the 1897 spire (44 of the 120 units), and Saint Michael in `gold` on
 * the tip. Every outer radius falls on the way up except three deliberate
 * corbels (the enceinte, the bastions' parapets, the abbey's two cornices);
 * anything else that bulges over the stage below breaks the cone, so re-measure
 * after an edit. A fourteen-sided `bone` enceinte with six round bastions holds
 * the village, a shade down from the village's `white` so the base does not
 * compete. `darkOlive` rock shows below the walls, on the terrace risers and
 * through two crags on the west flank where the roofs are left out.
 *
 * The water and the causeway are not modelled: nothing here is transparent, the
 * bay is usually empty, and the causeway is a modern addition that does not fit
 * a footprint circle. A shallow `sand` strand dome (2.4 tall, 103 across) shows
 * that the rock stands alone on a flat. The Porte de l'Avancee, a barbican two
 * units proud on +Z with a `bark` arch and two small bastions, gives the radial
 * model its front.
 *
 * At the `landmark` tier (0.706 units per metre) the true tide line would be
 * 212 units across against a footprint ceiling of 55, so the plan is squeezed
 * 2.05x and the flank steepens from about 30 degrees to about 50. Because the
 * houses were not squeezed with the circuit, ring 1 carries 15 gable ends where
 * the real front has about 45: each gable stands for three houses, 12.1 units
 * across, at a pitch of about 43 degrees. Each ring's walls are a single
 * `ringWall` band with the gables on top, which saved about 45 meshes.
 *
 * Gables vary by index (`JITTER_RISE`, `JITTER_EAVES`, on five-long cycles that
 * never close against 18, 14 and 12), and seven `TALL_HOUSES` stand a storey
 * above their ring, so the roofline is not a cog wheel. The abbey drum is two
 * stages (12.5 to 11.2) with a cornice at the setback, its buttresses are 2.8
 * deep, and the bands have 14/12/11 sides.
 *
 * Colour: `white` for village and abbey, `bone` for ramparts and cornices,
 * `steel` for every roof, spire and cone, `darkOlive` rock, `sand` strand, `bark`
 * openings, `gold` for Saint Michael alone. Left out: the Merveille's third
 * storey, flying buttresses, the west terrace, crenellations (a 0.4-unit merlon
 * is smaller than the pen) and the Grande Rue. Meshes are the binding budget
 * (123 of 130), which is why the village is bands and roofs rather than houses.
 */

// --- Elevation. Every stage begins where the one below it ends, so the cone
// --- cannot develop a step by arithmetic slip. ---

/** Top of the tidal strand, the datum the rock stands out of. */
const STRAND_TOP = 2.4;
/** The rampart curtain: base, top of the wall, top of its coping. */
const WALL_FOOT = 8.0;
const WALL_TOP = 15.4;
const COPING_TOP = 16.4;

/** The three village rings: base, eaves, and the rise of their gables. */
const RING = [
  { base: 15.4, eaves: 22.4, rise: 5.6 }, // roofs to 28.0
  { base: 24.2, eaves: 30.2, rise: 4.8 }, // roofs to 35.0
  { base: 31.5, eaves: 36.5, rise: 4.0 }, // roofs to 40.5
] as const;

/** The abbey's substructure drum, and the church floor on top of it. */
const ABBEY_FOOT = 40.0;
const ABBEY_TOP = 62.0;
const CHURCH_EAVES = 76.0;
const CHURCH_RIDGE = 86.0;
const SHAFT_TOP = 94.0;
const PARAPET_TOP = 98.0;
const SPIRE_TOP = 116.0;
/** The tier ceiling, reached by the tip of Saint Michael's sword and nothing else. */
const TOP = 120.0;

/**
 * The rock, as a stack of tapers. `radius` is the half-width across the flats
 * at the top of each section, so each bottom is the one below and the profile
 * has no ledge. Sides drop from 14 to 10 as it narrows.
 */
const ROCK = [
  { top: WALL_FOOT, radius: 35.0, sides: 14 },
  { top: RING[0].base, radius: 31.5, sides: 12 },
  { top: RING[1].base, radius: 24.5, sides: 12 },
  { top: RING[2].base, radius: 18.5, sides: 12 },
  { top: ABBEY_FOOT, radius: 14.0, sides: 10 },
] as const;

/** Half-width across the flats at the very foot of the rock, where it meets the strand. */
const ROCK_FOOT = 45.0;

/**
 * The village bands. `outer` and `inner` are `ringWall` radii, which are
 * circumradii where every `column`/`taper` radius in this file is an apothem
 * (2.6% at 14 sides, 4.2% at 11), so the rock sits inside its bands. `gables`
 * is how many roofs go round; `skip` leaves them out, all on the west flank so
 * the crags come through one column of bare rock.
 */
interface Band {
  /** `ringWall` radii, so circumradii. */
  inner: number;
  outer: number;
  sides: number;
  /** Roofs around the ring, and the ones left out. */
  gables: number;
  skip: number[];
  /** Where a gable's ridge is centred, how far it runs radially, and its half-width. */
  radius: number;
  depth: number;
  half: number;
}

const BANDS: Band[] = [
  { inner: 26.0, outer: 33.0, sides: 14, gables: 18, skip: [14, 15, 16], radius: 29.6, depth: 8.6, half: 6.05 },
  { inner: 20.0, outer: 26.4, sides: 12, gables: 14, skip: [11, 12], radius: 23.3, depth: 8.0, half: 6.2 },
  { inner: 15.0, outer: 20.0, sides: 11, gables: 12, skip: [10], radius: 17.6, depth: 6.6, half: 5.55 },
];

/**
 * Houses that break their ring's roofline: seven blocks a storey taller than the
 * band, at angles that share no factor with the gable counts. Degrees about the
 * mount, measured from the gate.
 */
const TALL_HOUSES = [
  { ring: 0, angle: 24, width: 7.6, wall: 11.4, rise: 4.6 },
  { ring: 0, angle: 133, width: 6.8, wall: 10.0, rise: 4.2 },
  { ring: 1, angle: 62, width: 6.4, wall: 9.4, rise: 3.8 },
  { ring: 1, angle: 205, width: 5.8, wall: 8.4, rise: 3.6 },
  { ring: 2, angle: 158, width: 5.2, wall: 7.2, rise: 3.2 },
  { ring: 0, angle: 246, width: 6.2, wall: 9.6, rise: 4.0 },
  { ring: 1, angle: 331, width: 6.0, wall: 8.8, rise: 3.6 },
] as const;

/** Per-roof variation, applied by index. */
const JITTER_RISE = [1.0, 0.84, 1.14, 0.92, 1.06];
const JITTER_EAVES = [0, -0.55, 0.35, -0.25, 0.5];

const RAD = Math.PI / 180;

export const montSaintMichel: Monument = {
  id: 'mont-saint-michel',
  name: 'Mont-Saint-Michel',
  iso: 'FRA',
  lat: 48.636,
  lon: -1.511,
  // No `realHeight`: the rock, the church floor, the spire tip and the sword
  // give four different heights.
  tier: 'landmark',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, column, taper, ringWall, around } = ctx;

    const stone = palette.white; // village and abbey walls
    const wall = palette.bone; // ramparts, copings, cornices
    const slate = palette.steel; // every roof, cone and the spire
    const rock = palette.darkOlive; // the mount itself
    const strand = palette.sand; // the tidal flat
    const dark = palette.bark; // arches and windows
    const gilt = palette.gold; // Saint Michael, and nothing else

    const group = new THREE.Group();

    const put = <T extends Object3D>(child: T, x: number, y: number, z: number): T => {
      child.position.set(x, y, z);
      group.add(child);
      return child;
    };

    /**
     * A gable roof, ridge along Z, eaves at `eaves`, apex `rise` above them. A
     * three-sided `column` on its side is the cheapest gable but its pitch is
     * fixed at 60 degrees, so the prism is built at unit size and the mesh
     * carries the scale. After the quarter turn about X, local y is world z and
     * local -z is world y, which is what the odd `scale.set` is.
     */
    const gable = (cx: number, cz: number, length: number, half: number, eaves: number, rise: number) => {
      const prism = column(1, length, slate, 3);
      prism.scale.set(half / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);
      const pivot = new THREE.Group();
      pivot.add(prism);
      pivot.position.set(cx, eaves, cz);
      return pivot;
    };

    /** Puts a child at `radius` out along the +Z axis and `base` up, then swings it to `angle`. */
    const spoke = (angle: number, radius: number, base: number, child: Object3D): void => {
      const pivot = new THREE.Group();
      pivot.rotation.y = angle;
      child.position.set(0, base, radius);
      pivot.add(child);
      group.add(pivot);
    };

    /** A dark strip standing slightly proud of a wall, so the ink outlines it. */
    const opening = (x: number, y: number, z: number, w: number, h: number): void => {
      put(box(w, h, 0.5, dark), x, y, z);
    };

    // --- The strand: a shallow sand dome, 50.5 across the flats at the bottom
    // and 45.5 at the top, so it reads as a bank. Its corners at 51.5 set the footprint. ---
    put(taper(50.5, 45.5, STRAND_TOP, strand, 16), 0, 0, 0);

    // --- The rock: five tapers, each starting where the last stopped ---
    let foot = STRAND_TOP;
    let below = ROCK_FOOT;
    for (const section of ROCK) {
      put(taper(below, section.radius, section.top - foot, rock, section.sides), 0, foot, 0);
      foot = section.top;
      below = section.radius;
    }

    // --- The ramparts: fourteen sides, so the six bastions land on alternate
    // corners. The coping is a second, wider ring (0.7 proud outside, 0.5 in). ---
    put(ringWall(34.5, 38.0, WALL_TOP - WALL_FOOT, wall, 14), 0, WALL_FOOT, 0);
    put(ringWall(34.0, 38.7, COPING_TOP - WALL_TOP, wall, 14), 0, WALL_TOP, 0);

    // Six squat bastions on the corners, battered under a corbelled parapet;
    // index 0 is the gate and is left out.
    group.add(
      around(7, (index) => {
        if (index === 0) return null;
        const bastion = new THREE.Group();
        const drum = taper(2.4, 2.9, 9.5, wall, 8);
        drum.position.set(0, WALL_FOOT, 38.0);
        bastion.add(drum);
        const cap = column(3.2, 1.1, wall, 8);
        cap.position.set(0, WALL_FOOT + 9.5, 38.0);
        bastion.add(cap);
        // The Tour Gabriel, alone in carrying a roof — it holds the mill.
        if (index === 3) {
          const cone = taper(3.0, 0, 4.2, slate, 8);
          cone.position.set(0, WALL_FOOT + 10.6, 38.0);
          bastion.add(cone);
        }
        return bastion;
      }),
    );

    // --- Porte de l'Avancee: the arrival, and the model's front ---
    put(box(9.0, 9.5, 4.0, wall), 0, WALL_FOOT, 38.0);
    // Its foot goes `PROUD` under the gate's, whose underside it would share.
    opening(0, WALL_FOOT - PROUD, 40.1, 3.2, 5.5 + PROUD);
    for (const x of [-5.4, 5.4]) {
      put(column(1.9, 11.0, wall, 8), x, WALL_FOOT, 38.6);
      put(column(2.2, 0.9, wall, 8), x, WALL_FOOT + 11.0, 38.6);
    }

    // --- The village: three bands of wall with a sawtooth of gables on each ---
    BANDS.forEach((band, index) => {
      const level = RING[index]!;
      // Sunk `PROUD` into the rock, off the plane of the rock section's cap.
      put(
        ringWall(band.inner, band.outer, level.eaves - level.base + PROUD, stone, band.sides),
        0,
        level.base - PROUD,
        0,
      );
      group.add(
        around(band.gables, (i) => {
          if (band.skip.includes(i)) return null;
          // No two neighbours the same; five-long cycles never close, even at the seam.
          return gable(
            0,
            band.radius,
            band.depth,
            band.half,
            level.eaves + JITTER_EAVES[i % 5]!,
            level.rise * JITTER_RISE[i % 5]!,
          );
        }),
      );
    });

    for (const house of TALL_HOUSES) {
      const level = RING[house.ring]!;
      const band = BANDS[house.ring]!;
      const block = new THREE.Group();
      // The body goes `PROUD` below the ring's base, off the coping's plane; its top stays.
      const body = box(house.width, house.wall + PROUD, band.depth * 0.85, stone);
      body.position.y = -PROUD;
      block.add(body);
      block.add(gable(0, 0, band.depth * 0.85 + 0.6, house.width / 2 + 0.3, house.wall, house.rise));
      // Body and roof are built at the origin, so they travel together when `spoke` swings the block out.
      spoke(house.angle * RAD, band.radius, level.base, block);
    }

    // A dark shutter on the band facing the gate. The band's lathe puts a vertex
    // exactly on +Z at `outer` (33.0), so 33.05 leaves the strip 0.3 proud like
    // every other opening.
    opening(0, 17.4, 33.05, 1.8, 3.2);

    // --- Two crags on the west flank, at 300 and 288 degrees, where all three
    // rings drop their roofs. The lower one starts inside the first band and
    // stands 2 units proud of it; the upper one clears the third band and
    // finishes just above the abbey's foot. Its foot is `PROUD` under the ring's base. ---
    spoke(300 * RAD, 29.0, RING[0].base - PROUD, taper(6.0, 2.8, 17.4 + PROUD, rock, 6));
    spoke(288 * RAD, 19.0, 30.0, taper(4.2, 1.8, 12.6, rock, 6));

    // --- The abbey substructure: two stages with a cornice at the setback; ten
    // buttresses stand 1.8 proud to break the largest pale surface ---
    const ABBEY_SETBACK = 54.0;
    put(column(12.5, ABBEY_SETBACK - ABBEY_FOOT, stone, 10), 0, ABBEY_FOOT, 0);
    group.add(
      around(10, () => {
        const buttress = box(2.2, ABBEY_SETBACK - ABBEY_FOOT - 1.2, 2.8, stone);
        buttress.position.set(0, ABBEY_FOOT, 13.0);
        return buttress;
      }),
    );
    put(column(12.9, 1.2, wall, 10), 0, ABBEY_SETBACK - 1.2, 0);
    put(column(11.2, ABBEY_TOP - ABBEY_SETBACK - 1.2, stone, 10), 0, ABBEY_SETBACK, 0);
    put(column(11.7, 1.2, wall, 10), 0, ABBEY_TOP - 1.2, 0);
    for (const x of [-2.4, 2.4]) opening(x, 44.0, 12.55, 1.5, 7.5);
    for (const x of [-6.6, 6.6]) opening(x, 44.0, 11.6, 1.3, 6.5);

    // --- The abbey church: long axis along X so the nave is seen broadside with
    // the tower rising out of its middle. Apse east, two stair turrets west. ---
    put(box(17.0, CHURCH_EAVES - ABBEY_TOP, 11.0, stone), 0, ABBEY_TOP, 0);
    const nave = gable(0, 0, 17.6, 5.8, CHURCH_EAVES, CHURCH_RIDGE - CHURCH_EAVES);
    nave.rotation.y = Math.PI / 2;
    group.add(nave);
    opening(0, 64.0, 5.55, 2.2, 6.0);

    put(column(3.4, 11.0, stone, 8), 7.6, ABBEY_TOP, 0);
    put(taper(3.7, 0, 5.0, slate, 8), 7.6, ABBEY_TOP + 11.0, 0);
    for (const z of [-4.0, 4.0]) {
      put(column(1.4, 18.0, stone, 8), -8.0, ABBEY_TOP, z);
      put(taper(1.7, 0, 5.0, slate, 8), -8.0, ABBEY_TOP + 18.0, z);
    }

    // --- Crossing tower and spire; the corbel ring is where the plan changes on the way up ---
    put(box(5.6, SHAFT_TOP - ABBEY_TOP, 5.6, stone), 0, ABBEY_TOP, 0);
    // One string course and two windows break the shaft, spaced up the 12.8 units
    // that are on screen: the nave roof clears the shaft's 2.8 face only above
    // 81.2, and the course marks where the tower comes out of the roof.
    put(column(3.1, 0.9, wall, 8), 0, 81.2, 0);
    opening(0, 84.9, 2.85, 1.2, 4.6);
    opening(0, 90.6, 2.85, 1.2, 5.0);
    put(column(3.6, 1.5, wall, 8), 0, SHAFT_TOP, 0);
    put(column(3.4, PARAPET_TOP - SHAFT_TOP - 1.5, stone, 8), 0, SHAFT_TOP + 1.5, 0);
    put(column(2.9, 1.2, wall, 8), 0, PARAPET_TOP, 0);
    put(taper(2.5, 0, SPIRE_TOP - PARAPET_TOP - 1.2, slate, 8), 0, PARAPET_TOP + 1.2, 0);

    // --- Saint Michael: robe, spread wings, raised sword ---
    put(taper(0.9, 0.35, 2.6, gilt, 6), 0, SPIRE_TOP, 0);
    put(box(3.2, 0.55, 0.6, gilt), 0, SPIRE_TOP + 1.3, 0);
    put(box(0.3, TOP - (SPIRE_TOP + 2.6), 0.3, gilt), 0, SPIRE_TOP + 2.6, 0);

    return group;
  },
};
