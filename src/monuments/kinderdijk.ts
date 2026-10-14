import { PROUD } from './contract.ts';
import type { Group, Monument } from './contract.ts';

/**
 * Kinderdijk Windmills.
 *
 * The monument is the line of mills, not one mill: seven of them in two rows
 * along parallel canals, all alike and facing one way, on a flat green polder
 * that sits below the water held in the canals. Each mill is a squat octagonal
 * thatched tower (0.65 across to height) on a brick foot, with a four-sailed
 * lattice cross that has to read as a frame with gaps. Seven is what the
 * `building` tier's mesh budget allows (13 meshes a mill).
 *
 * Still water is `steel`, not `skyBlue`, so it supplies the dark against the
 * green. A light towpath on each dike's lip puts the lightest and darkest
 * values in contact along the canal, which is what survives at thumbnail size.
 * The canals are slots cut into the land and edged on both sides, and a barge
 * and a footbridge sit as though the water were there.
 *
 * The plan is distorted: the line is compressed about 3.6x (true spacing needs
 * six times the footprint), the canals are about half their real width, and the
 * sail bays are about 2.5x too wide so the gaps survive the ink. The tower's
 * proportion is untouched.
 *
 * The sails are two stocks offset in depth, each arm carrying its bay on the
 * leading side only. The roll differs on every mill (a golden-ratio sequence
 * over the cross's quarter turn, deterministic) while the yaw is shared. The
 * windshaft tilts back 0.12 rad.
 */

// ---------------------------------------------------------------------------
// The polder. Everything on the ground is a band running across the model.
// ---------------------------------------------------------------------------

const HALF_X = 47;
const Z_FRONT = 26;
const Z_BACK = -27.5;

/** The drained land, the water held above it, and the high dike behind. */
const FIELD_TOP = 1.2;
const WATER_TOP = 4.3;
const DIKE_TOP = 5.4;
/** The far row stands on the high boezem's dike, three units over the near one. */
const HIGH_TOP = 8.6;
/**
 * Bands start buried in the polder slab. The water and the towpaths start
 * `PROUD` and twice that higher than the grass, so two colours never share a plane.
 */
const BAND_BASE = 0.6;
const WATER_BASE = BAND_BASE + PROUD;
const PATH_BASE = BAND_BASE + PROUD * 2;

/**
 * `[front, back, top, water?]`, front to back. The water bands overlap their
 * dikes by 0.3 rather than meeting them, and a canal stops `PROUD` short of the
 * dikes' ends, so nothing is coplanar.
 */
const BANDS: Array<[number, number, number, boolean]> = [
  [21.0, 19.5, DIKE_TOP, false], //     the bank you stand on to look across
  [19.8, 3.2, WATER_TOP, true], //      the near boezem canal
  [3.4, -6.4, DIKE_TOP, false], //      the near dike: four mills stand here
  [-6.4, -7.9, DIKE_TOP - 0.2, false], // the far canal's near bank
  [-8.2, -17.6, WATER_TOP, true], //    the far boezem, one level up the system
  [-17.4, -27.5, HIGH_TOP, false], //   the high dike: three mills, three up
];

/**
 * A towpath along the far bank of each canal: two units of `tan` laid on the
 * dike's edge, stepped `PROUD` back from its face and run `PROUD` past its ends.
 * `[front, back, top]`.
 */
const PATHS: Array<[number, number, number]> = [
  [3.4 - PROUD, 1.4, DIKE_TOP + 0.1],
  [-17.4 - PROUD, -19.4, HIGH_TOP + 0.1],
];

/**
 * A drainage ditch, crossing the foreground field into the near canal. It stops
 * `PROUD` inside the field's front face, which it would otherwise share.
 */
const DITCH = { x: -25, width: 1.8, from: Z_FRONT - PROUD, to: 20.2, top: 1.45 };

// ---------------------------------------------------------------------------
// The two rows
// ---------------------------------------------------------------------------

/** Centre to centre. A cross is 23.7 across its frames' corners, so they clear by 2.9. */
const PITCH = 26.6;
const NEAR_Z = -1.5;
const FAR_Z = -22.45;
const NEAR_X = [-1.5 * PITCH, -0.5 * PITCH, 0.5 * PITCH, 1.5 * PITCH];
/**
 * The far row. The offsets are chosen so that in both the front and the quarter
 * view each far mill shows a shoulder past a near one (8.3 units clear of every
 * hiding position); the 30-unit spacing against 26.6 corrects the foreshortening.
 */
const FAR_X = [-37.0, -6.6, 23.1];

// ---------------------------------------------------------------------------
// One mill. Local origin is the dike crown it stands on.
// ---------------------------------------------------------------------------

/** Brick foot. Half-widths are across the flats. Its top is 0.1 inside the tower's foot so the flanks do not flicker. */
const FOOT = { bottom: 4.6, top: 4.55, height: 1.4 };
/** The thatched octagon: 8.9 across against 13.8 of height. */
const TOWER = { bottom: 4.45, top: 2.45, height: 13.8 };
/** The cap overhangs the tower top by 0.8. */
const CAP = { bottom: 3.25, top: 1.5, height: 3.0 };

const HUB_Y = FOOT.height + TOWER.height + 1.0;
/** Far enough in front of the cap that the lowest sail clears the tower's flank. */
const HUB_Z = 2.95;
const TILT = -0.12;

// --- the cross ---
const REACH = 11.2;
const STOCK = 0.85;
const STOCK_DEPTH = 0.5;
/** Depth between the two stocks, so the crossing reads as two beams and not one. */
const PLANE_GAP = 0.55;
const BAR_DEPTH = 0.45;
/** The bay starts a hair off the hub; the other stock closes that end. */
const RAIL_INNER = 0.35;
const RAIL_WIDTH = 0.5;
const RIB_WIDTH = 0.5;
/** Underside of the rail. */
const BAY_TOP = 3.4;

/**
 * Sail roll, in radians, for mill `index`: a golden-ratio sequence over the
 * cross's quarter turn. The 0.06 offset keeps the first mill just off vertical.
 */
const rollAt = (index: number): number =>
  0.06 + ((index * 0.618033988749895) % 1) * (Math.PI / 2);

export const kinderdijk: Monument = {
  id: 'kinderdijk',
  name: 'Kinderdijk Windmills',
  iso: 'NLD',
  lat: 51.884,
  lon: 4.64,
  // No `realHeight`: nineteen mills stand here and no height belongs to all.
  tier: 'building',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const grass = palette.green; //     the drained polder
    const water = palette.steel; //     the canals. See the note at the top.
    const brick = palette.clay; //      the mills' feet, and the barge's cabin
    const thatch = palette.bark; //     the tower: the darkest thing standing up
    const oak = palette.brown; //       the cap, the barge's hull, the bridge deck
    const wood = palette.tan; //        towpaths and sails: the light against the dark

    const group = new THREE.Group();

    // --- the polder, and the water held above it ------------------------------

    const field = box(HALF_X * 2, FIELD_TOP, Z_FRONT - Z_BACK, grass);
    field.position.z = (Z_FRONT + Z_BACK) / 2;
    group.add(field);

    for (const [front, back, top, wet] of BANDS) {
      const base = wet ? WATER_BASE : BAND_BASE;
      const long = wet ? (HALF_X - PROUD) * 2 : HALF_X * 2;
      const band = box(long, top - base, front - back, wet ? water : grass);
      band.position.set(0, base, (front + back) / 2);
      group.add(band);
    }

    for (const [front, back, top] of PATHS) {
      const path = box((HALF_X + PROUD) * 2, top - PATH_BASE, front - back, wood);
      path.position.set(0, PATH_BASE, (front + back) / 2);
      group.add(path);
    }

    const ditch = box(DITCH.width, DITCH.top - WATER_BASE, DITCH.from - DITCH.to, water);
    ditch.position.set(DITCH.x, WATER_BASE, (DITCH.from + DITCH.to) / 2);
    group.add(ditch);

    // --- things that behave as though the canal held water ---------------------

    // A barge, 1.2 of its hull under the surface and 0.6 of it above.
    const hull = box(9, 1.8, 2.6, oak);
    hull.position.set(18, WATER_TOP - 1.2, 11.5);
    hull.rotation.y = 0.06;
    group.add(hull);

    const cabin = box(2.6, 1.3, 2, brick);
    cabin.position.set(20.2, WATER_TOP + 0.6, 11.5);
    cabin.rotation.y = 0.06;
    group.add(cabin);

    // A plank footbridge between the dike crowns, its deck 0.57 clear of the
    // water, sunk `PROUD` into the crowns and stopping `PROUD` inside each bank.
    const span = 20 - PROUD * 2;
    const deck = box(2.4, 0.45, span, oak);
    deck.position.set(-30, DIKE_TOP - 0.45 - PROUD, 11.0);
    group.add(deck);

    const handrail = box(0.3, 1, span, wood);
    handrail.position.set(-31, DIKE_TOP - PROUD, 11.0);
    group.add(handrail);

    // --- one mill --------------------------------------------------------------

    const mill = (roll: number): Group => {
      const body = new THREE.Group();

      body.add(taper(FOOT.bottom, FOOT.top, FOOT.height, brick, 8));

      const tower = taper(TOWER.bottom, TOWER.top, TOWER.height, thatch, 8);
      tower.position.y = FOOT.height;
      body.add(tower);

      const cap = taper(CAP.bottom, CAP.top, CAP.height, oak, 8);
      cap.position.y = FOOT.height + TOWER.height;
      body.add(cap);

      // The windshaft's tilt lives on its own group, so the roll is in the plane of the sails.
      const head = new THREE.Group();
      head.position.set(0, HUB_Y, HUB_Z);
      head.rotation.x = TILT;
      body.add(head);

      const cross = new THREE.Group();
      cross.rotation.z = roll;
      head.add(cross);

      // The two stocks, offset in depth so the ink finds the crossing.
      const alongX = box(REACH * 2, STOCK, STOCK_DEPTH, wood);
      alongX.position.y = -STOCK / 2;
      cross.add(alongX);

      const alongY = box(STOCK, REACH * 2, STOCK_DEPTH, wood);
      alongY.position.set(0, -REACH, PLANE_GAP);
      cross.add(alongY);

      // Four bays, each on the leading side of its arm; a quarter turn carries
      // the bay to the opposite arm.
      for (let arm = 0; arm < 4; arm++) {
        const sail = new THREE.Group();
        sail.rotation.z = (arm * Math.PI) / 2;
        // Arms 0 and 2 belong to the first stock, 1 and 3 to the second, so each
        // bay sits in the plane of the beam that carries it.
        sail.position.z = arm % 2 === 0 ? 0 : PLANE_GAP;

        const rail = box(REACH - RAIL_INNER, RAIL_WIDTH, BAR_DEPTH, wood);
        rail.position.set((RAIL_INNER + REACH) / 2, BAY_TOP, 0);
        sail.add(rail);

        const rib = box(RIB_WIDTH, BAY_TOP + RAIL_WIDTH + STOCK / 2, BAR_DEPTH, wood);
        rib.position.set(REACH - RIB_WIDTH / 2, -STOCK / 2, 0);
        sail.add(rib);

        cross.add(sail);
      }

      return body;
    };

    // --- the two rows ----------------------------------------------------------

    let index = 0;
    for (const [z, offsets] of [
      [NEAR_Z, NEAR_X],
      [FAR_Z, FAR_X],
    ] as Array<[number, number[]]>) {
      for (const x of offsets) {
        const one = mill(rollAt(index));
        one.position.set(x, z === FAR_Z ? HIGH_TOP : DIKE_TOP, z);
        group.add(one);
        index++;
      }
    }

    return group;
  },
};
