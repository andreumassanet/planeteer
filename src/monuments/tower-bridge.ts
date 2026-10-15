import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Tower Bridge.
 *
 * Cropped and stretched. In life the roadway is 244 m under 65 m towers
 * (3.75:1); fitting all of it in a 55-unit footprint would leave the towers 27
 * units apart and a thin ladder. Everything is at true proportion except the
 * two side spans, cut to roughly 48% of their real length (tower face to
 * abutment face from 1.10x the tower height to 0.53x). The approach viaducts
 * are cut, the deck runs on two units past each abutment so it leaves the frame,
 * and the suspension chains survive the crop. Every height is then multiplied by
 * 1.2 against the plan: towers go from 3.3:1 to 4:1, still stockier than Big Ben
 * at 6.4:1. The result is 108 wide and 48 tall, aspect 2.25, filed `landmark`
 * for the footprint and mesh budget rather than the height.
 *
 * Distinct from Big Ben: two towers joined at the top; stocky, with round corner
 * turrets standing proud of a square mass; a steep pyramid roof (7.8 units over
 * a 6-unit half-width) ending in a stub finial; and Portland stone and painted
 * iron (`bone`, `slate`, `skyBlue`, `white`, `steel`) with no gilt and no clock.
 * The blue is the colour the bridge is named by.
 *
 * What carries it: the two towers (four round turrets each, with pointed caps,
 * above a corbelled cornice); the high-level walkways, a real pair at 30.8 to
 * 34.9 with a 3.2-unit gap; the bascules, a heavier blue steel deck between the
 * towers split by a seam on the centreline against the dark hung side spans; and
 * the chains, straight girder segments with a slight upward camber.
 *
 * The roadway does not pass between real tower legs (the legs would be 2 units
 * thick or the deck 5 wide). Each tower carries a dark pointed portal on its two
 * end faces instead, with the deck hidden inside. The engine rooms, land ties
 * and the lattice inside the chains are left out.
 */

// --- plan, in world units. y = 0 is the river. ---
const TOWER_X = 25;
const TOWER_HALF_X = 6;
const TOWER_HALF_Z = 5.6;

const ABUT_X = 49;
const DECK_END = 54;
const DECK_HALF_Z = 3.3;
/** Deck edge: the chains, the hangers and the railings all stand on this line. */
const EDGE_Z = 3.1;

// --- elevation ---
const PIER_TOP = 3.6;
const PLINTH_TOP = 4.8;
/** The bascule girders are deeper than the hung side spans. */
const BASCULE_BASE = 5.2;
const SIDE_BASE = 5.6;
const DECK_MID = 6.6;
const ROAD_TOP = 7.4;

const PORTAL_TOP = 11.5;
/** Half-width across the flats of the portal's gable head: 3.46r wide, 3r tall. */
const ARCH_R = 2;
const ARCH_W = ARCH_R * 2 * Math.sqrt(3);

const BAND_A = 18.4;
const SLOT_LOW = 13;
const SLOT_LOW_TOP = 17;
const SLOT_HIGH = 20.4;
const SLOT_HIGH_TOP = 28.4;
const BAND_B = 29.2;

const WALK_BASE = 30.8;
const WALK_TOP = 34;
const WALK_CAP_TOP = 34.9;
const WALK_SPAN = 40;
const WALK_DEPTH = 3;
const WALK_Z = 3.1;

const SHAFT_TOP = 37.4;
const CORNICE_TOP = 39.2;
const ROOF_TOP = 47;
const TOP = 48;

const TURRET_R = 1.3;
const TURRET_AT_X = 5;
const TURRET_AT_Z = 4.6;
const TURRET_TOP = 41.2;
const TURRET_CAP_TOP = 45;

const ABUT_TOP = 17;
const ABUT_CAP_TOP = 20.5;

/**
 * The suspension chain, tower face to abutment top: straight segments with
 * about 0.6 units of upward camber at the joints (the real chains are stiff
 * girders in tension, not hanging rope).
 */
const CHAIN = [
  { x: 31, y: 30 },
  { x: 37, y: 26.4 },
  { x: 43, y: 21.9 },
  { x: ABUT_X, y: ABUT_TOP },
];
const CHAIN_THICKNESS = 1;
const HANGERS = [34, 40, 46];

function chainY(x: number): number {
  const distance = Math.abs(x);
  for (let i = 1; i < CHAIN.length; i++) {
    const a = CHAIN[i - 1]!;
    const b = CHAIN[i]!;
    if (distance <= b.x) return a.y + ((b.y - a.y) * (distance - a.x)) / (b.x - a.x);
  }
  return CHAIN[CHAIN.length - 1]!.y;
}

export const towerBridge: Monument = {
  id: 'tower-bridge',
  name: 'Tower Bridge',
  iso: 'GBR',
  lat: 51.506,
  lon: -0.075,
  realHeight: 65,
  tier: 'landmark',
  surfaces: { skyBlue: 'metal', steel: 'metal' },
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;
    const stone = palette.bone;
    const granite = palette.slate;
    const paint = palette.skyBlue;
    const trim = palette.white;
    const iron = palette.steel;

    const group = new THREE.Group();

    // --- the two main towers ---
    for (const side of [1, -1]) {
      const x = side * TOWER_X;

      // River pier, battered so it reads as sitting in water rather than on it.
      const pier = taper(7.8, 7, PIER_TOP, granite, 4);
      pier.position.x = x;
      group.add(pier);

      const plinth = box(13.6, PLINTH_TOP - PIER_TOP, 12.8, stone);
      plinth.position.set(x, PIER_TOP, 0);
      group.add(plinth);

      const body = box(TOWER_HALF_X * 2, SHAFT_TOP - PLINTH_TOP, TOWER_HALF_Z * 2, stone);
      body.position.set(x, PLINTH_TOP, 0);
      group.add(body);

      // --- the roadway portal, on both end faces: a dark reveal with a gable head, with the deck hidden inside ---
      for (const face of [1, -1]) {
        const reveal = box(0.8, PORTAL_TOP - PLINTH_TOP, ARCH_W, iron);
        reveal.position.set(x + face * TOWER_HALF_X, PLINTH_TOP, 0);
        group.add(reveal);

        // A three-sided `column` on its side is a gable (apex up, +/-1.73r across,
        // 3r tall). It is built across z and swung a quarter turn by a wrapper
        // group, since the two rotations do not compose in one Euler.
        const head = new THREE.Group();
        head.rotation.y = face * (Math.PI / 2);
        const gable = column(ARCH_R, 0.8, iron, 3);
        gable.rotation.x = Math.PI / 2;
        gable.position.y = PORTAL_TOP + ARCH_R;
        head.add(gable);
        head.position.x = x + face * (TOWER_HALF_X - 0.4);
        group.add(head);
      }

      // --- string courses: the lower flush with the turrets, the upper corbelled past them so the walkways look carried ---
      const lower = box(TOWER_HALF_X * 2 + 0.7, 1.1, TOWER_HALF_Z * 2 + 0.7, stone);
      lower.position.set(x, BAND_A, 0);
      group.add(lower);

      const gallery = box(TOWER_HALF_X * 2 + 1.6, 1.6, TOWER_HALF_Z * 2 + 1.6, stone);
      gallery.position.set(x, BAND_B, 0);
      group.add(gallery);

      // --- window slots, raised rather than recessed: a shallow recess is invisible under a cel ramp ---
      for (const z of [1, -1]) {
        for (const offset of [-2.8, 0, 2.8]) {
          const slot = box(1.7, SLOT_HIGH_TOP - SLOT_HIGH, 0.7, iron);
          slot.position.set(x + offset, SLOT_HIGH, z * TOWER_HALF_Z);
          group.add(slot);
        }
        for (const offset of [-2.2, 2.2]) {
          const slot = box(1.7, SLOT_LOW_TOP - SLOT_LOW, 0.7, iron);
          slot.position.set(x + offset, SLOT_LOW, z * TOWER_HALF_Z);
          group.add(slot);
        }
      }

      // --- corner turrets: round shafts proud of the square mass, running the full height and breaking through the cornice with their own caps ---
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          const tx = x + sx * TURRET_AT_X;
          const tz = sz * TURRET_AT_Z;

          const shaft = column(TURRET_R, TURRET_TOP - PLINTH_TOP, stone, 8);
          shaft.position.set(tx, PLINTH_TOP, tz);
          group.add(shaft);

          const cap = taper(TURRET_R + 0.2, 0.1, TURRET_CAP_TOP - TURRET_TOP, iron, 8);
          cap.position.set(tx, TURRET_TOP, tz);
          group.add(cap);
        }
      }

      const cornice = box(TOWER_HALF_X * 2 + 1.6, CORNICE_TOP - SHAFT_TOP, TOWER_HALF_Z * 2 + 1.6, stone);
      cornice.position.set(x, SHAFT_TOP, 0);
      group.add(cornice);

      const roof = taper(6, 0.5, ROOF_TOP - CORNICE_TOP, iron, 4);
      roof.position.set(x, CORNICE_TOP, 0);
      group.add(roof);

      const finial = taper(0.5, 0.08, TOP - ROOF_TOP, iron, 4);
      finial.position.set(x, ROOF_TOP, 0);
      group.add(finial);
    }

    // --- high-level walkways: two, with daylight between ---
    for (const z of [1, -1]) {
      const girder = box(WALK_SPAN, WALK_TOP - WALK_BASE, WALK_DEPTH, paint);
      girder.position.set(0, WALK_BASE, z * WALK_Z);
      group.add(girder);

      const glazing = box(WALK_SPAN - 4, 1.7, 0.5, iron);
      glazing.position.set(0, WALK_BASE + 0.8, z * (WALK_Z + WALK_DEPTH / 2));
      group.add(glazing);

      const cap = box(WALK_SPAN + 0.8, WALK_CAP_TOP - WALK_TOP, WALK_DEPTH + 0.6, trim);
      cap.position.set(0, WALK_TOP, z * WALK_Z);
      group.add(cap);
    }

    // --- deck ---
    // The bascules: two leaves parted by a seam on the centreline, in painted steel
    // and a third deeper than the roadway either side. The seam is half of 1.6
    // units, far more than a real expansion joint, because below about three
    // pixels the split stops existing.
    const LEAF_GAP = 0.8;
    const LEAF_INNER = TOWER_X - TOWER_HALF_X;
    const leafLength = LEAF_INNER - LEAF_GAP;
    for (const side of [1, -1]) {
      const centre = side * (LEAF_GAP + leafLength / 2);

      const leaf = box(leafLength, DECK_MID - BASCULE_BASE, DECK_HALF_Z * 2, paint);
      leaf.position.set(centre, BASCULE_BASE, 0);
      group.add(leaf);

      const road = box(leafLength, ROAD_TOP - DECK_MID, DECK_HALF_Z * 2 - 0.6, iron);
      road.position.set(centre, DECK_MID, 0);
      group.add(road);
    }

    // The hung side spans, running through the towers and two units past the abutments.
    const sideLength = DECK_END - LEAF_INNER;
    for (const side of [1, -1]) {
      const centre = side * (LEAF_INNER + sideLength / 2);

      const girder = box(sideLength, DECK_MID - SIDE_BASE, DECK_HALF_Z * 2, iron);
      girder.position.set(centre, SIDE_BASE, 0);
      group.add(girder);

      const road = box(sideLength, ROAD_TOP - DECK_MID, DECK_HALF_Z * 2 - 0.6, iron);
      road.position.set(centre, DECK_MID, 0);
      group.add(road);

      for (const z of [1, -1]) {
        const rail = box(sideLength, 1, 0.5, trim);
        rail.position.set(centre, ROAD_TOP, z * EDGE_Z);
        group.add(rail);
      }
    }

    // --- abutment towers, where the chains land ---
    for (const side of [1, -1]) {
      const x = side * ABUT_X;

      const base = taper(4.4, 4, 2.4, granite, 4);
      base.position.x = x;
      group.add(base);

      const shaft = box(7.2, ABUT_TOP - 2.4, 8.8, stone);
      shaft.position.set(x, 2.4, 0);
      group.add(shaft);

      const band = box(8.4, 1, 9.6, stone);
      band.position.set(x, 12.5, 0);
      group.add(band);

      const cap = taper(4, 1.5, ABUT_CAP_TOP - ABUT_TOP, iron, 4);
      cap.position.set(x, ABUT_TOP, 0);
      group.add(cap);
    }

    // --- chains and hangers ---
    for (const side of [1, -1]) {
      for (const z of [1, -1]) {
        for (let i = 1; i < CHAIN.length; i++) {
          const a = CHAIN[i - 1]!;
          const b = CHAIN[i]!;
          group.add(
            strut(
              new THREE.Vector3(side * a.x, a.y, z * EDGE_Z),
              new THREE.Vector3(side * b.x, b.y, z * EDGE_Z),
              CHAIN_THICKNESS,
              paint,
            ),
          );
        }

        for (const at of HANGERS) {
          // `PROUD` inside the railing's faces on each side (0.45 deep against its 0.5).
          const hanger = box(0.45, chainY(at) - ROAD_TOP, 0.5 - 2 * PROUD, paint);
          hanger.position.set(side * at, ROAD_TOP, z * EDGE_Z);
          group.add(hanger);
        }
      }
    }

    return group;
  },
};
