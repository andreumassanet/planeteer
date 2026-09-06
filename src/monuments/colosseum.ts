import type { Monument } from './contract.ts';

/**
 * Colosseum.
 *
 * Three things make it readable and nothing else does: an oval drum, the
 * vertical rhythm of the arcades, and the fact that **one side is twice as tall
 * as the other**. That broken outer wall is the whole silhouette — a complete
 * ring would read as a stadium, or a gasometer.
 *
 * Two deliberate departures from the real building:
 *
 * - **The openings are rectangular.** A proper arched head costs about 130
 *   triangles a bay (an extruded shape with a hole), 72 bays of it, which is
 *   four times this tier's entire budget for something under a pixel wide at the
 *   distance the model is read from. The rhythm of pier-gap-pier is what the eye
 *   gets, and that is free.
 * - **It is squarer than life.** The real thing is 188 m across and 48 m tall, a
 *   ratio of 3.9. At the `building` tier's 40 units that would make it 156 units
 *   wide — most of an island — and squash the arcades into a band. 104 by 34 is
 *   3.06, close enough to read as squat and tall enough for three storeys.
 */

const BAYS = 24;
/** Bays either side of the front that keep their upper storeys. 9 of 24, as in life. */
const INTACT = 4;

const WALL_OUTER = 50;
const WALL_INNER = 46;
const PIER_CENTRE = (WALL_OUTER + WALL_INNER) / 2;
const PIER_WIDTH = 6;
const BAY_WIDTH = (2 * Math.PI * PIER_CENTRE) / BAYS;

/** Cornices overhang the piers, so each storey ends on a ledge with its own ink line. */
const CORNICE_OUTER = 51.5;
const CORNICE_INNER = 44.5;
const CORNICE = 1.5;

const STOREY = [
  { base: 0, height: 9.5 },
  { base: 11, height: 9 },
  { base: 21.5, height: 8 },
];
const ATTIC = { base: 31, height: 3 };

/** Radius of the arena floor. The real one is 0.46 of the outer wall. */
const ARENA = 22;

/** How much narrower the short axis is. 156 m against 188 m. */
const OVAL = 0.85;

export const colosseum: Monument = {
  id: 'colosseum',
  name: 'Colosseum',
  iso: 'ITA',
  lat: 41.8902,
  lon: 12.4922,
  realHeight: 48,
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, column, ringWall, around } = ctx;
    const stone = palette.sand;
    const trim = palette.tan;
    const seating = palette.bone;
    const floor = palette.brown;

    const group = new THREE.Group();
    // Everything is built as a circle and squashed once. Doing it here rather
    // than per part keeps every radius in the file a single honest number.
    const oval = new THREE.Group();
    oval.scale.x = OVAL;
    group.add(oval);

    // Distance in bays from the front. The wall does not stop dead at the end
    // of the surviving arc: the last bay keeps its third storey but loses its
    // attic, so the ruin steps down instead of ending in a hook.
    const fromFront = (bay: number) => Math.min(bay, BAYS - bay);
    const intact = (bay: number) => fromFront(bay) <= INTACT;

    // --- the arcades ---
    STOREY.forEach((storey, index) => {
      const piers = around(BAYS, (bay) => {
        if (index === 2 && !intact(bay)) return null;
        const pier = box(PIER_WIDTH, storey.height, WALL_OUTER - WALL_INNER, stone);
        pier.position.set(0, storey.base, PIER_CENTRE);
        return pier;
      });
      oval.add(piers);
    });

    // --- the cornices between them ---
    const cornice = (base: number) => {
      const ring = ringWall(CORNICE_INNER, CORNICE_OUTER, CORNICE, trim, BAYS);
      ring.position.y = base;
      oval.add(ring);
    };
    cornice(STOREY[0]!.base + STOREY[0]!.height);
    cornice(STOREY[1]!.base + STOREY[1]!.height);

    // The third cornice and the attic survive only where the outer wall does, so
    // they are laid bay by bay rather than as a ring. Overlapping the blocks
    // slightly leaves a seam at every joint, which is the attic's pilasters.
    const crown = around(BAYS, (bay) => {
      if (!intact(bay)) return null;
      const bank = new THREE.Group();

      const ledge = box(BAY_WIDTH * 1.03, CORNICE, CORNICE_OUTER - CORNICE_INNER, trim);
      ledge.position.set(0, STOREY[2]!.base + STOREY[2]!.height, (CORNICE_OUTER + CORNICE_INNER) / 2);
      bank.add(ledge);

      if (fromFront(bay) < INTACT) {
        const wall = box(BAY_WIDTH * 1.03, ATTIC.height, WALL_OUTER - WALL_INNER, trim);
        wall.position.set(0, ATTIC.base, PIER_CENTRE);
        bank.add(wall);
      }

      return bank;
    });
    oval.add(crown);

    // --- the bowl, stepped rather than smooth: the ink line between each bank
    //     of seats is what stops the interior reading as a funnel ---
    const banks = [
      { inner: ARENA, outer: 30, height: 6 },
      { inner: 30, outer: 38, height: 11 },
      { inner: 38, outer: WALL_INNER, height: 16 },
    ];
    for (const bank of banks) {
      oval.add(ringWall(bank.inner, bank.outer, bank.height, seating, BAYS));
    }

    const arena = column(ARENA, 1.2, floor, BAYS);
    oval.add(arena);

    return group;
  },
};
