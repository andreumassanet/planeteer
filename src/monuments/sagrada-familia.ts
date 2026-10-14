import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Sagrada Familia.
 *
 * A bundle of tall, thin, tapering towers of unequal height: four low ones on
 * the front façade, four slightly taller behind them, four around the
 * crossing, one over the apse and the tall central one. The count and the
 * stagger are what name the building.
 *
 * Every tower ends in a knob rather than a point (the real finials are bulbous
 * and tiled), three meshes each. The knob is 2.1x the shaft's neck and about
 * 15% of the tower, a shade more than life, so it still reads at distance.
 * Only its upper half is gilded.
 *
 * Simplified: no cranes (a boom would lay a black bar across the tower
 * cluster), no sculpted façade (piers, a lintel and buttress ribs stand for
 * it), hexagonal shafts instead of parabolic fluted ones, no interior. The
 * Glory end at +X is left towerless, as it is today. Plan and heights are the
 * real ones through a single scale, so nothing is distorted.
 *
 * Tier `landmark`: fourteen knobbed towers cost 118 meshes and 2,524 triangles,
 * more than `tower` allows, and at `building` height the cluster would lose its
 * stagger.
 */

/** Real metres to tier units. The central tower's 172.5 m is the tier's 120. */
const SCALE = 120 / 172.5;
const m = (metres: number): number => metres * SCALE;

// --- plan: the real 90 x 60 m, undistorted ---
/** Apse end to Glory end, along X. */
const HALF_LENGTH = m(90) / 2; // 31.3
/** Nativity façade to Passion façade, along Z. The front is +Z. */
const HALF_WIDTH = m(60) / 2; // 20.9
/** The five naves together. */
const AISLE_HALF = m(45) / 2; // 15.7
/** The central vessel, which rises clear of the aisles as a clerestory. */
const VESSEL_HALF = m(15) / 2; // 5.2
const TRANSEPT_HALF = m(32) / 2; // 11.1

// --- elevation, every figure the real one through `m` ---
const PLINTH = 2.6;
const AISLE_TOP = m(30); // 20.9
const NAVE_TOP = m(45); // 31.3
const CROSSING_TOP = m(60); // 41.7
const APSE_TOP = m(52); // 36.2
const NATIVITY_TOP = m(47); // 32.7 — the towers spring from inside this wall
const PASSION_TOP = m(44); // 30.6

/** Where each façade's quartet stands, just inside its own wall. */
const NATIVITY_Z = 17.4;
const PASSION_Z = -17.4;

interface Tower {
  x: number;
  z: number;
  /** The y the shaft starts at. Always buried in the mass below — never in the air. */
  base: number;
  /** The y of the pinnacle's tip. */
  top: number;
  /** Half-width across the flats at `base`. */
  radius: number;
  /** Radians of outward lean per unit of x. The façade quartets splay; the rest stand up. */
  splay: number;
}

/** The fourteen towers standing today, at their design heights. */
const TOWERS: Tower[] = [
  // Four over the Nativity façade, 96-107 m, no two alike.
  { x: -9.2, z: NATIVITY_Z, base: 29, top: m(98), radius: 2.7, splay: 0.006 },
  { x: -3.1, z: NATIVITY_Z, base: 29, top: m(107), radius: 2.7, splay: 0.006 },
  { x: 3.1, z: NATIVITY_Z, base: 29, top: m(104), radius: 2.7, splay: 0.006 },
  { x: 9.2, z: NATIVITY_Z, base: 29, top: m(96), radius: 2.7, splay: 0.006 },
  // Four over the Passion façade, 105-112 m: taller than the first four, so they show over them from the front.
  { x: -9.2, z: PASSION_Z, base: 27, top: m(107), radius: 2.7, splay: 0.006 },
  { x: -3.1, z: PASSION_Z, base: 27, top: m(112), radius: 2.7, splay: 0.006 },
  { x: 3.1, z: PASSION_Z, base: 27, top: m(110), radius: 2.7, splay: 0.006 },
  { x: 9.2, z: PASSION_Z, base: 27, top: m(105), radius: 2.7, splay: 0.006 },
  // The four evangelists, 135 m, engaged with the corners of the crossing.
  { x: -7.6, z: 7.6, base: 20, top: m(135), radius: 3.5, splay: 0 },
  { x: 7.6, z: 7.6, base: 20, top: m(135), radius: 3.5, splay: 0 },
  { x: -7.6, z: -7.6, base: 20, top: m(135), radius: 3.5, splay: 0 },
  { x: 7.6, z: -7.6, base: 20, top: m(135), radius: 3.5, splay: 0 },
  // The Virgin, 138 m, standing alone over the apse at the far end.
  { x: -23.2, z: 0, base: 20, top: m(138), radius: 3.9, splay: 0 },
];

/** The tower of Jesus Christ. Stone to 155 m, then the cross to 172.5 m. */
const JESUS: Tower = { x: 0, z: 0, base: 34, top: m(155), radius: 5.8, splay: 0 };
const CROSS_HEIGHT = 120 - JESUS.top;

export const sagradaFamilia: Monument = {
  id: 'sagrada-familia',
  name: 'Sagrada Familia',
  iso: 'ESP',
  lat: 41.404,
  lon: 2.174,
  // No `realHeight`: the building is unfinished, and 172.5 m is the central tower's design figure.
  tier: 'landmark',
  footprint: 38,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;
    const stone = palette.sand;
    const trim = palette.tan;
    const knob = palette.gold;
    const tip = palette.crimson;
    const cypress = palette.green;

    // `THREE` arrives as a value, not a namespace, so the helpers' return types are borrowed.
    type Mesh = ReturnType<typeof box>;

    const group = new THREE.Group();
    const put = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // --- the mass: five naves along X, a transept across Z and a crossing block
    // thick enough to carry the central tower; every tower starts inside one ---
    put(box(HALF_LENGTH * 2, PLINTH, HALF_WIDTH * 2, trim), 0, 0, 0);
    put(box(60.6, AISLE_TOP - PLINTH, AISLE_HALF * 2, stone), 0, PLINTH, 0);
    put(box(TRANSEPT_HALF * 2, AISLE_TOP - PLINTH, HALF_WIDTH * 2 - 1.6, stone), 0, PLINTH, 0);
    put(box(60.6, NAVE_TOP - PLINTH, VESSEL_HALF * 2 + 1.2, stone), 0, PLINTH, 0);
    put(box(VESSEL_HALF * 2 + 1.2, NAVE_TOP - 3 - PLINTH, HALF_WIDTH * 2 - 1.6, stone), 0, PLINTH, 0);
    put(box(17, CROSSING_TOP - PLINTH, 17, stone), 0, PLINTH, 0);

    // Cornices in the darker stone, each an ink line across the mass. Each stops
    // `PROUD` under the roof it girds so the roof keeps the stone colour, and
    // `PROUD` inside the apse's drum at its end.
    const cornice = 61.2 - PROUD * 2;
    put(box(cornice, 1.4, AISLE_HALF * 2 + 1, trim), 0, AISLE_TOP - 1.4 - PROUD, 0);
    put(box(cornice, 1.4, VESSEL_HALF * 2 + 2.4, trim), 0, NAVE_TOP - 1.4 - PROUD, 0);
    put(box(18.4, 1.6, 18.4, trim), 0, CROSSING_TOP - 1.6 - PROUD, 0);

    // --- the two ends: a rounded apse at -X and the towerless Glory end at +X ---
    put(column(7.4, APSE_TOP - PLINTH, stone, 8), -23.2, PLINTH, 0);
    put(taper(7.4, 4.2, 5.4, trim, 8), -23.2, APSE_TOP, 0); // crown, stopping just under the crossing
    put(box(5.4, 21, 27, trim), 28.4, PLINTH, 0);

    // --- the Nativity façade (front): piers, a lintel and ribs ---
    put(box(25.5, NATIVITY_TOP - PLINTH, 4.6, stone), 0, PLINTH, HALF_WIDTH - 2.6);
    // The piers run the whole height of the wall, under the four towers.
    for (const tower of TOWERS.slice(0, 4)) {
      // `PROUD` over the wall's top, and the lintel `PROUD` past its ends, so no colours share a plane.
      put(box(3, NATIVITY_TOP - PLINTH + PROUD, 2.6, trim), tower.x, PLINTH, HALF_WIDTH - 0.8);
    }
    put(box(25.5 + PROUD * 2, 2.8, 2.6, trim), 0, 17, HALF_WIDTH - 0.8);
    // The Tree of Life cypress between the two centre towers.
    put(taper(1.8, 0.35, 11, cypress, 6), 0, NATIVITY_TOP, HALF_WIDTH - 3.4);

    // --- the Passion façade behind: a plain wall and two leaning columns ---
    put(box(25.5, PASSION_TOP - PLINTH, 4.6, stone), 0, PLINTH, -(HALF_WIDTH - 2.6));
    put(box(22, 2.6, 2.6, trim), 0, m(24), -(HALF_WIDTH - 0.8));
    for (const x of [-7.6, 7.6]) {
      group.add(
        strut(
          new THREE.Vector3(x * 1.15, PLINTH + 1, -(HALF_WIDTH - 0.8)),
          new THREE.Vector3(x, m(24), -(HALF_WIDTH - 1.4)),
          1.9,
          trim,
        ),
      );
    }

    // --- buttress ribs down the flanks of the naves ---
    for (const x of [-25, -17.5, 17.5, 25]) {
      for (const z of [AISLE_HALF - 0.4, -(AISLE_HALF - 0.4)]) {
        put(box(1.8, AISLE_TOP - PLINTH - 1.4, 2.4, trim), x, PLINTH, z);
      }
    }

    /** One tower: two shaft segments, then a three-piece finial (flare out, close in, spike). */
    const spire = (tower: Tower, sides = 6) => {
      const pivot = new THREE.Group();
      pivot.position.set(tower.x, tower.base, tower.z);
      // The façade quartets lean out in proportion to how far off centre each stands.
      pivot.rotation.z = -tower.splay * tower.x;

      const finial = tower.radius * 2.4;
      const shaft = tower.top - tower.base - finial;
      const mid = tower.radius * 0.62;
      const neck = tower.radius * 0.34;
      const add = (mesh: Mesh, y: number): void => {
        mesh.position.y = y;
        pivot.add(mesh);
      };

      add(taper(tower.radius, mid, shaft * 0.55, stone, sides), 0);
      // A balcony course at the joint, in the darker stone, so a long even taper reads as masonry.
      add(column(mid * 1.24, 1.3, trim, sides), shaft * 0.55 - 0.65);
      add(taper(mid, neck, shaft * 0.45, stone, sides), shaft * 0.55);
      add(taper(neck, tower.radius * 0.72, finial * 0.3, stone, sides), shaft);
      add(taper(tower.radius * 0.72, neck * 0.8, finial * 0.42, knob, sides), shaft + finial * 0.3);
      add(taper(neck * 0.8, tower.radius * 0.07, finial * 0.28, tip, sides), shaft + finial * 0.72);

      group.add(pivot);
      return pivot;
    };

    for (const tower of TOWERS) spire(tower);

    // --- the central tower, eight-sided, carrying the four-armed cross that sets the tier's ceiling at 120 ---
    const jesus = spire(JESUS, 8);
    const stem = box(1.3, CROSS_HEIGHT, 1.3, knob);
    stem.position.y = JESUS.top - JESUS.base;
    jesus.add(stem);
    for (const arm of [box(7.2, 1.3, 1.3, knob), box(1.3, 1.3, 7.2, knob)]) {
      arm.position.y = JESUS.top - JESUS.base + CROSS_HEIGHT * 0.42;
      jesus.add(arm);
    }

    return group;
  },
};
