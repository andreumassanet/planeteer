import type { Monument } from './contract.ts';

/**
 * The Great Mosque of Djenne, Mali.
 *
 * The largest mud-brick building in the world. The read:
 * - Three great tapering towers across the qibla wall, each on a spike with an
 *   ostrich egg, the middle one proud of the other two.
 * - A forest of pilasters (ten on the front) so the facade is a rhythm of
 *   vertical fins; their pinnacles make the roofline a row of spikes.
 * - The toron: palm-wood bundles in three continuous rows across the wall and
 *   the towers. They are indivisible (one mesh each, doubled by the outline), 54
 *   of the 108 meshes; the budget was fixed around them.
 * - Battered walls and rounded corners: every mass is a `taper`, and each of
 *   the four corners is a fat eight-sided pier (one blunt cone, not shaft plus
 *   pinnacle).
 *
 * The crop is the prayer hall and its eastern qibla wall; the courtyard, low
 * walls and north stair are gone, and the rear wall carries no toron.
 *
 * Exaggerations: the plan is squeezed 1.56x (66 units of facade, ratio 1.67,
 * against 2.6 in life) because the vertical fin rhythm carries the recognition
 * and a true fin would be 1.5 units in a 102-unit facade. Toron are 3x thick and
 * 3.7x long (0.62 projecting 2.6), or they are a fifth of a pixel. The front
 * leans 10 degrees; the flanks lean 4.7, since a mass is one square frustum
 * scaled to a rectangle and the shallower axis shares the shrink factor; the
 * corner piers lean 11 along the diagonal so they stay welded to both walls.
 *
 * Tier `building`. 108 meshes, 1,968 triangles.
 *
 * Colour: `sand` banco plaster, `brown` platform, `bark` toron and finial spikes
 * (a small shape reads by value, a large one by its edge), `white` ostrich eggs.
 */

const RAD = Math.PI / 180;

// --- the raised earth platform the mosque stands on -----------------------
const PLATFORM = { w: 35.5, d: 19, h: 3 };

// --- the prayer hall: one battered mass -----------------------------------
/** Half-widths at the foot, and how far the wide (x) faces lean off vertical. */
const WALL = { w: 33, d: 15.5, y: 3, h: 22.5, deg: 10 };

/** Top over bottom. One factor for both axes — see the batter note above. */
const SHRINK = 1 - (Math.tan(WALL.deg * RAD) * WALL.h) / WALL.w;

/** The shrink part-way up, clamped so a fin taller than the wall still lands on it. */
const shrinkAt = (y: number): number =>
  1 + (SHRINK - 1) * Math.min(Math.max((y - WALL.y) / WALL.h, 0), 1);

/** Where the front face and the flank face stand at height `y`. */
const faceZ = (y: number): number => WALL.d * shrinkAt(y);
const faceX = (y: number): number => WALL.w * shrinkAt(y);

/** How far each face leans back, so a fin laid on it leans with it. */
const TILT_Z = Math.atan(((1 - SHRINK) * WALL.d) / WALL.h);
const TILT_X = Math.atan(((1 - SHRINK) * WALL.w) / WALL.h);
/** And along the corner diagonal, for the piers. */
const TILT_CORNER = Math.atan(
  Math.hypot((1 - SHRINK) * WALL.w, (1 - SHRINK) * WALL.d) / WALL.h,
);

/** The lip round the roof. Sunk into the wall's own top so the two do not z-fight. */
const PARAPET = { y: 24.8, h: 1.1, proud: 0.5 };

// --- pilasters ------------------------------------------------------------

/**
 * A fin standing against a wall. `waist` and `tip` are fractions of the foot: the
 * thing is one prism scaled to a rectangle, so it narrows in both axes at once.
 * `point` of 0 means no separate pinnacle: the shaft runs the full height and
 * closes on `tip` (the corner piers, one mesh each).
 */
interface Pilaster {
  w: number;
  d: number;
  sides: number;
  shaft: number;
  waist: number;
  point: number;
  tip: number;
}

/**
 * The wall fins: six-sided, pointed above the parapet. The pinnacle is short and
 * stubby, little cones barely taller than wide; a longer one reads as a palisade.
 */
const FIN: Pilaster = {
  w: 1.05, d: 0.7, sides: 6, shaft: 23.4, waist: 0.74, point: 2.6, tip: 0.26,
};
/** The corner piers: fat, eight-sided, blunt. They are what rounds the corners. */
const PIER: Pilaster = { w: 1.5, d: 1.5, sides: 8, shaft: 26.6, waist: 1, point: 0, tip: 0.22 };

/**
 * Where the front fins stand, mirrored about the centre line. Five a side: seven
 * leave no plaster for the toron.
 */
const FRONT_FINS = [7.5, 10.9, 14.3, 26.7, 29.4];
/**
 * And the flanks, along z, mirrored about both. Three a side, which with the
 * corner piers gives five verticals across the 31-unit flank for the quarter view.
 */
const FLANK_FINS = [-8.5, 0, 8.5];
/** The piers stand a little inside the corner so they bulge out of both walls. */
const CORNER = { x: WALL.w - 0.6, z: WALL.d - 0.6 };

// --- the three towers -----------------------------------------------------

/**
 * A minaret. It grows out of the qibla wall (its back is buried in the mass) and
 * closes on a cone, a spike and an egg.
 */
interface Tower {
  x: number;
  z: number;
  /** Half-width and half-depth at the foot, and top over bottom at the shaft's head. */
  w: number;
  d: number;
  h: number;
  shrink: number;
  /** The cone above the shaft, and how narrow it closes. */
  cap: number;
  capTip: number;
  spike: number;
  /** The ostrich egg: half-width, then its two halves. */
  eggR: number;
  eggLow: number;
  eggHigh: number;
  /** Where its own toron sit across its face. */
  pegs: number[];
}

/**
 * Wider than deep, with a short blunt cone: a slab standing in the wall's plane
 * closing on a stump (as deep as wide reads as a pepper-pot).
 */
const CENTRE_TOWER: Tower = {
  x: 0, z: 14.3, w: 5.6, d: 4, h: 30.6, shrink: 0.68,
  cap: 3, capTip: 0.26, spike: 1.4,
  eggR: 0.62, eggLow: 0.75, eggHigh: 1,
  pegs: [-2.8, 2.8],
};

/** The flanking pair, 4.75 units shorter and set two thirds of the way out. */
const SIDE_TOWER = {
  z: 14.1, w: 4.5, d: 3.5, h: 26.4, shrink: 0.7,
  cap: 3, capTip: 0.28, spike: 1.2,
  eggR: 0.52, eggLow: 0.58, eggHigh: 0.82,
  pegs: [-2.2, 2.2],
};

const TOWERS: Tower[] = [
  CENTRE_TOWER,
  { ...SIDE_TOWER, x: -20.5 },
  { ...SIDE_TOWER, x: 20.5 },
];

/** Everything sits this far into the thing below it, never exactly on it. */
const SEAT = 0.12;

/** The tower's own shrink part-way up, so its toron start on its face and not in the air. */
const towerShrinkAt = (t: Tower, y: number): number =>
  1 + (t.shrink - 1) * Math.min(Math.max((y - WALL.y) / t.h, 0), 1);

// --- the toron ------------------------------------------------------------

/** Thickness, how far it projects, and how far it is buried so no end floats free. */
const TORON = { thick: 0.62, out: 2.6, into: 0.4 };
/** Three rows, and they run across the wall *and* the towers at the same heights. */
const TORON_ROWS = [9, 14.4, 19.8];
/** Across the front, in the bays between the fins. Mirrored. */
const WALL_TORON = [9.2, 12.6, 25.85, 28.05];
/** The flanks carry the same three rows, at the same heights, all the way round. */
const FLANK_TORON = [-4.25, 4.25];

export const djenneMosque: Monument = {
  id: 'djenne-mosque',
  name: 'Great Mosque of Djenne',
  iso: 'MLI',
  lat: 13.905,
  lon: -4.555,
  tier: 'building',
  surface: 'plaster',
  footprint: 41,

  build(ctx) {
    const { THREE, palette, box, taper, column, strut } = ctx;
    const banco = palette.sand; // every plastered wall, fin and tower
    const earth = palette.brown; // the platform, a duller and darker warm
    const wood = palette.bark; // the toron, and the spikes under the eggs
    const shell = palette.white; // the three ostrich eggs

    const group = new THREE.Group();

    // --- the platform ---
    group.add(box(PLATFORM.w * 2, PLATFORM.h, PLATFORM.d * 2, earth));

    // --- the prayer hall, one battered mass ---
    const mass = new THREE.Group();
    mass.add(taper(1, SHRINK, WALL.h, banco, 4));
    mass.scale.set(WALL.w, 1, WALL.d);
    mass.position.y = WALL.y;
    group.add(mass);

    // The roof lip. It stops the wall's own top cap reading as a lid, and the
    // fins are prouder than it is, so they still stand clear of it.
    const parapet = box(
      (faceX(PARAPET.y) + PARAPET.proud) * 2,
      PARAPET.h,
      (faceZ(PARAPET.y) + PARAPET.proud) * 2,
      banco,
    );
    parapet.position.y = PARAPET.y;
    group.add(parapet);

    /**
     * One pilaster: a prism scaled to a rectangle, tilted back into the plane of
     * its wall, then yawed onto the face it serves.
     */
    const pilaster = (
      spec: Pilaster,
      x: number,
      z: number,
      yaw: number,
      tilt: number,
    ): void => {
      const leaf = new THREE.Group();
      if (spec.point > 0) {
        leaf.add(taper(1, spec.waist, spec.shaft, banco, spec.sides));
        const pinnacle = taper(spec.waist, spec.tip, spec.point, banco, spec.sides);
        pinnacle.position.y = spec.shaft - SEAT;
        leaf.add(pinnacle);
      } else {
        leaf.add(taper(1, spec.tip, spec.shaft, banco, spec.sides));
      }
      leaf.scale.set(spec.w, 1, spec.d);
      leaf.rotation.x = -tilt;

      const wrap = new THREE.Group();
      wrap.add(leaf);
      wrap.rotation.y = yaw;
      wrap.position.set(x, WALL.y, z);
      group.add(wrap);
    };

    // --- the forest, on the qibla wall ---
    for (const x of FRONT_FINS) {
      for (const side of [1, -1]) {
        pilaster(FIN, side * x, faceZ(WALL.y) + FIN.d / 2, 0, TILT_Z);
      }
    }

    // --- and three on each flank ---
    for (const z of FLANK_FINS) {
      for (const side of [1, -1]) {
        pilaster(FIN, side * (faceX(WALL.y) + FIN.d / 2), z, (side * Math.PI) / 2, TILT_X);
      }
    }

    // --- the four rounded corners ---
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        // Yawed so the pier leans along its own diagonal, inward. Not 45 degrees:
        // the mass is wider than it is deep, so its corner runs steeper than that.
        const yaw = Math.atan2(sx * WALL.w, sz * WALL.d);
        pilaster(PIER, sx * CORNER.x, sz * CORNER.z, yaw, TILT_CORNER);
      }
    }

    // --- the three towers ---
    for (const t of TOWERS) {
      const shaft = new THREE.Group();
      shaft.add(taper(1, t.shrink, t.h, banco, 8));
      shaft.scale.set(t.w, 1, t.d);
      shaft.position.set(t.x, WALL.y, t.z);
      group.add(shaft);

      // The cone starts on the shaft's own head, so the two are one profile.
      const headY = WALL.y + t.h;
      const cone = new THREE.Group();
      cone.add(taper(t.shrink, t.capTip, t.cap, banco, 8));
      cone.scale.set(t.w, 1, t.d);
      cone.position.set(t.x, headY - SEAT, t.z);
      group.add(cone);

      const spikeY = headY + t.cap - 2 * SEAT;
      const spike = column(0.13, t.spike, wood, 4);
      spike.position.set(t.x, spikeY, t.z);
      group.add(spike);

      // Two tapers back to back. One prism reads as a knob on a stick; the
      // ovoid is the whole reason the finial is worth two meshes.
      const eggY = spikeY + t.spike - SEAT;
      const lower = taper(0.14, t.eggR, t.eggLow, shell, 6);
      lower.position.set(t.x, eggY, t.z);
      group.add(lower);
      const upper = taper(t.eggR, 0.1, t.eggHigh, shell, 6);
      upper.position.set(t.x, eggY + t.eggLow, t.z);
      group.add(upper);
    }

    // --- the toron ---
    /** One bundle, from inside the wall to `TORON.out` clear of it. */
    const peg = (x: number, y: number, z: number, yaw: number): void => {
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      group.add(
        strut(
          new THREE.Vector3(x - dx * TORON.into, y, z - dz * TORON.into),
          new THREE.Vector3(x + dx * TORON.out, y, z + dz * TORON.out),
          TORON.thick,
          wood,
        ),
      );
    };

    for (const y of TORON_ROWS) {
      const z = faceZ(y);
      for (const x of WALL_TORON) {
        for (const side of [1, -1]) peg(side * x, y, z, 0);
      }
      // The same row continues across the towers at the same height, which is
      // what makes it a row and not a scatter of dots.
      for (const t of TOWERS) {
        const face = t.z + t.d * towerShrinkAt(t, y);
        for (const dx of t.pegs) peg(t.x + dx, y, face, 0);
      }
      // And round the corner onto both flanks, at the same height again.
      const x = faceX(y);
      for (const z of FLANK_TORON) {
        for (const side of [1, -1]) peg(side * x, y, z, (side * Math.PI) / 2);
      }
    }

    return group;
  },
};
