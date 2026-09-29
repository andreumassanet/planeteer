import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Sagrada Familia.
 *
 * One silhouette carries it and nothing else does: **a bundle of tall, thin,
 * tapering towers of unequal height** — four low ones standing on the front
 * façade, four slightly taller behind them, four taller again around the
 * crossing, one standing alone over the apse, and one far above the rest. A
 * church with one spire is a
 * cathedral in any country on the planet. A church with fourteen spires at five
 * different heights is only ever this one, which is why the count and the
 * stagger were fixed before a single other part of this file was written.
 *
 * **Every tower ends in a knob, not a point.** The real pinnacles are bulbous
 * Venetian-glass finials, wider than the shaft carrying them and tiled gold,
 * red and green. Three meshes each, and they are the second thing that names
 * the building: a cluster of plain cones is a Kremlin, or a fairground. The
 * knob here swells to 2.1x the shaft's neck and takes about 15% of the tower,
 * a shade more than life — the one exaggeration in the file, and the reason it
 * is still a knob at twenty pixels. Only its upper half is gilded: colouring
 * the whole finial turned fourteen towers into fourteen lit candles, and the
 * stone-to-gold seam is an extra ink line exactly where the bulge starts.
 *
 * **The cranes are out, and it was a real decision.** The building has been
 * under construction since 1882, nobody now alive has seen it without a crane
 * over it, and leaving them out says something slightly false about the place.
 * They lose on the same test everything else here was judged by. A crane is a
 * long horizontal boom; this monument is read as vertical. At thumbnail size,
 * in outline ink as heavy as the coastline's, a boom lays a black bar straight
 * across the tower cluster — over the one shape that does all the naming. They
 * would also be the only deliberately temporary thing in the world — the
 * central tower is due to be topped out, and the booms will come down. The unfinishedness is said in
 * stone instead, by the blunt towerless Glory end at +X, which is what that
 * side of the building actually looks like today, and by the absence of
 * `realHeight` on the entry below.
 *
 * What else was traded, and why:
 *
 * - **The façade is texture, not sculpture.** Gaudí's Nativity portals carry
 *   several hundred carved figures; here they are four piers, a lintel and
 *   eight buttress ribs. Below about a metre of screen the difference between
 *   deep relief and a flat wall is only whether there are vertical lines on it,
 *   and vertical lines cost 12 triangles.
 * - **The shafts are hexagonal prisms.** The real ones are parabolic, fluted,
 *   and slotted with louvres the whole way up. Six flats give six cel bands and
 *   an ink line down every corner, which is what makes a 5-unit stick read as a
 *   tower rather than a pole.
 * - **No stained glass, no hyperboloid vaults, no interior.** All of it is
 *   inside a solid nobody can walk into.
 * - **Nothing is distorted.** The plan is the real 90 x 60 m and every height
 *   is the published design figure, both through the one 120/172.5 scale, so
 *   the stagger between the towers is the building's own and not a taste
 *   decision. It fits without help: 172.5 m over 90 m is 1.9 times taller than
 *   wide, and `MAX_ASPECT` allows 4.
 *
 * **Why `landmark`.** By the tier question — from how far should a player be
 * able to name it? — this is a thing you should pick out from out at sea on the
 * way into Barcelona, not something you find by walking into it. The budget
 * agrees: fourteen towers with knobbed finials cost 118 meshes and 2,524
 * triangles, past what `tower` (80 / 1,800) can hold, and at `building`'s 40
 * units the whole cluster would be fourteen 12-unit sticks staggered across
 * four units, which is the silhouette gone. The 120 units are not scale, they
 * are where the recognition lives.
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

/**
 * The fourteen towers that are standing today, in their real positions and at
 * their design heights. The eighteenth-tower scheme is complete only on paper;
 * modelling the four unbuilt Glory towers would put the tallest group at the
 * front and bury the stagger.
 */
const TOWERS: Tower[] = [
  // Four apostles over the Nativity façade, 96-107 m. No two alike: the
  // unevenness is not decoration, it is the thing being drawn.
  { x: -9.2, z: NATIVITY_Z, base: 29, top: m(98), radius: 2.7, splay: 0.006 },
  { x: -3.1, z: NATIVITY_Z, base: 29, top: m(107), radius: 2.7, splay: 0.006 },
  { x: 3.1, z: NATIVITY_Z, base: 29, top: m(104), radius: 2.7, splay: 0.006 },
  { x: 9.2, z: NATIVITY_Z, base: 29, top: m(96), radius: 2.7, splay: 0.006 },
  // Four more over the Passion façade, 105-112 m — built later and taller, so
  // from the front they show over the shoulders of the first four instead of
  // hiding behind them. That is why the front quartet is the shorter one.
  { x: -9.2, z: PASSION_Z, base: 27, top: m(107), radius: 2.7, splay: 0.006 },
  { x: -3.1, z: PASSION_Z, base: 27, top: m(112), radius: 2.7, splay: 0.006 },
  { x: 3.1, z: PASSION_Z, base: 27, top: m(110), radius: 2.7, splay: 0.006 },
  { x: 9.2, z: PASSION_Z, base: 27, top: m(105), radius: 2.7, splay: 0.006 },
  // The four evangelists, thicker and 135 m, engaged with the corners of the
  // crossing block so they read as one mass with the central tower.
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
  // No `realHeight`: the source list asserts none, because the building is not
  // finished. The 172.5 m the model is scaled from is the design figure for the
  // central tower, not a height the basilica has reached and holds.
  tier: 'landmark',
  footprint: 38,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;
    const stone = palette.sand;
    const trim = palette.tan;
    const knob = palette.gold;
    const tip = palette.crimson;
    const cypress = palette.green;

    // `THREE` arrives as a value, not a namespace, so the helpers' own return
    // types are borrowed rather than named.
    type Mesh = ReturnType<typeof box>;

    const group = new THREE.Group();
    const put = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // --- the mass: five naves along X, a transept across Z, and a crossing
    //     block in the middle thick enough to carry the central tower. Every
    //     tower below starts inside one of these solids, which is how fourteen
    //     of them stand up without a single strut. ---
    put(box(HALF_LENGTH * 2, PLINTH, HALF_WIDTH * 2, trim), 0, 0, 0);
    put(box(60.6, AISLE_TOP - PLINTH, AISLE_HALF * 2, stone), 0, PLINTH, 0);
    put(box(TRANSEPT_HALF * 2, AISLE_TOP - PLINTH, HALF_WIDTH * 2 - 1.6, stone), 0, PLINTH, 0);
    put(box(60.6, NAVE_TOP - PLINTH, VESSEL_HALF * 2 + 1.2, stone), 0, PLINTH, 0);
    put(box(VESSEL_HALF * 2 + 1.2, NAVE_TOP - 3 - PLINTH, HALF_WIDTH * 2 - 1.6, stone), 0, PLINTH, 0);
    put(box(17, CROSSING_TOP - PLINTH, 17, stone), 0, PLINTH, 0);

    // Cornices, in the darker stone. Each one is an ink line straight across the
    // building, which is what keeps the mass from reading as a single lump under
    // the towers.
    // Each stops `PROUD` under the roof it girds, so the roof keeps the stone
    // colour rather than sharing its plane with the cornice's top, and `PROUD`
    // inside the apse's drum at its end.
    const cornice = 61.2 - PROUD * 2;
    put(box(cornice, 1.4, AISLE_HALF * 2 + 1, trim), 0, AISLE_TOP - 1.4 - PROUD, 0);
    put(box(cornice, 1.4, VESSEL_HALF * 2 + 2.4, trim), 0, NAVE_TOP - 1.4 - PROUD, 0);
    put(box(18.4, 1.6, 18.4, trim), 0, CROSSING_TOP - 1.6 - PROUD, 0);

    // --- the two ends: a rounded apse at -X, and the Glory end at +X, which is
    //     a blunt wall with no towers on it because that is what is there ---
    put(column(7.4, APSE_TOP - PLINTH, stone, 8), -23.2, PLINTH, 0);
    put(taper(7.4, 4.2, 5.4, trim, 8), -23.2, APSE_TOP, 0); // crown, stopping just under the crossing
    put(box(5.4, 21, 27, trim), 28.4, PLINTH, 0);

    // --- the Nativity façade, the front. Piers, a lintel and ribs: at this size
    //     Gaudí's stone crowd is a vertical rhythm and nothing more ---
    put(box(25.5, NATIVITY_TOP - PLINTH, 4.6, stone), 0, PLINTH, HALF_WIDTH - 2.6);
    // The piers stand directly under the four towers and run the whole height of
    // the wall, because that is what the towers grow out of. Stopping them at the
    // portals left a blank slab between the doors and the spires, which is the
    // one place on the model the eye travels through every time.
    for (const tower of TOWERS.slice(0, 4)) {
      // `PROUD` over the wall's top, and the lintel `PROUD` past its ends:
      // flush, the two colours shared a plane.
      put(box(3, NATIVITY_TOP - PLINTH + PROUD, 2.6, trim), tower.x, PLINTH, HALF_WIDTH - 0.8);
    }
    put(box(25.5 + PROUD * 2, 2.8, 2.6, trim), 0, 17, HALF_WIDTH - 0.8);
    // The Tree of Life cypress, wedged between the two centre towers. It is the
    // one green thing on the building and it costs one mesh.
    put(taper(1.8, 0.35, 11, cypress, 6), 0, NATIVITY_TOP, HALF_WIDTH - 3.4);

    // --- the Passion façade behind, starker: a plain wall and two of the
    //     leaning columns it is known for ---
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

    /**
     * One tower: two shaft segments, then a three-piece finial — flare out,
     * close in, spike. The proportions are identical for all fourteen, so the
     * cluster reads as one family and the only thing that varies between them is
     * how high each one goes.
     */
    const spire = (tower: Tower, sides = 6) => {
      const pivot = new THREE.Group();
      pivot.position.set(tower.x, tower.base, tower.z);
      // The façade quartets lean out as they rise, in proportion to how far off
      // centre each one stands, so the four open like a hand instead of standing
      // as a picket fence.
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
      // A balcony course at the joint, in the darker stone. Without it a long
      // even taper reads as a sharpened pencil; one horizontal ink line across
      // each shaft is enough to make it masonry again, and the real towers do
      // step there, where the bell openings start.
      add(column(mid * 1.24, 1.3, trim, sides), shaft * 0.55 - 0.65);
      add(taper(mid, neck, shaft * 0.45, stone, sides), shaft * 0.55);
      add(taper(neck, tower.radius * 0.72, finial * 0.3, stone, sides), shaft);
      add(taper(tower.radius * 0.72, neck * 0.8, finial * 0.42, knob, sides), shaft + finial * 0.3);
      add(taper(neck * 0.8, tower.radius * 0.07, finial * 0.28, tip, sides), shaft + finial * 0.72);

      group.add(pivot);
      return pivot;
    };

    for (const tower of TOWERS) spire(tower);

    // --- the central tower, thicker and eight-sided, carrying the four-armed
    //     cross that sets the tier's ceiling at exactly 120 ---
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
