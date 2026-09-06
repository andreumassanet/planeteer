import type { Monument } from './contract.ts';

/**
 * Golden Gate Bridge.
 *
 * **A crop, and it has to be.** The bridge is 2.7 km of roadway under a 227 m
 * tower — 12:1 — and `footprint` is a circle, which has no long axis to spend on
 * a long thing. What is here is the frame every photograph of it uses: both
 * towers, the main span between them, the main cable diving from the saddles to
 * within a rope's height of the deck at mid-span and rising again, and the comb
 * of suspenders between the two. Cut: the anchorages, the approach viaducts,
 * Fort Point, and all but a stub of the two side spans. The stubs stay so the
 * deck reads as running off the edge of the frame rather than stopping.
 *
 * The crop is also stretched vertically. In life a tower stands 0.13 of the main
 * span above the deck; here it stands 0.29, because at the true ratio the model
 * would come out 5.8x wider than tall and `MAX_ASPECT` is 4. All of the
 * exaggeration went into the vertical, because everything that names this bridge
 * — the sag, the portals, the suspenders — lives there. The cable is fattened
 * about fivefold for the same reason: true to scale it is a fifth of a unit and
 * simply is not drawn.
 *
 * Filed `landmark` for the footprint and the mesh budget, not for the height. At
 * 107 units wide and 36 tall it fills its tier on width, which is the case the
 * contract has in mind when it says a wall passes on its diameter. A suspension
 * bridge cannot be tall; this one has to be wide.
 *
 * **Colour.** International Orange is a vermilion, hue around 7deg. `red`
 * (0xec3f1c) sits at 10deg; `orange` (0xe56202) at 25deg, which is a traffic
 * cone; `clay` has the hue and none of the saturation. So `red` on everything
 * structural — towers, truss, cables, ropes — broken only by the grey of the
 * roadway and the piers, which is the only place the real bridge breaks it
 * either.
 *
 * **Traded away.** The stiffening truss is a solid beam rather than a chord-and-
 * diagonal lattice: reading a truss 107 units long and 2.4 deep needs about
 * forty struts, and they buy nothing the ink line along its edge does not
 * already give. The meshes went into suspenders instead, which are the feature
 * that says *suspension* bridge.
 */

/** Half the main span. The towers stand here; the deck runs on past them. */
const TOWER_X = 41;
const DECK_END = 53.5;
const DECK_HALF = 4.5;

/**
 * Where the cables, the ropes and the tower legs sit across the bridge: at the
 * edge of the deck, so the roadway passes clear between the legs. That gap is
 * the portal, and the portal is why the towers are not goalposts.
 */
const CABLE_Z = 4.3;

const PIER_TOP = 4.2;
const TRUSS_BASE = 10.6;
const TRUSS_TOP = 13;
const ROAD_TOP = 13.6;
const TOWER_TOP = 36;

/** The cable over the saddle, and at mid-span where it all but touches the deck. */
const CABLE_TOP = 35.5;
const CABLE_MID = 14.4;
const CABLE_THICKNESS = 0.8;
const ROPE_THICKNESS = 0.5;

/** Segments across the main span. Every joint is also a suspender. */
const SPAN_SEGMENTS = 14;
const SIDE_SEGMENTS = 3;
/**
 * Where the side cable leaves the frame. It comes down onto the deck edge rather
 * than stopping in the air, which is both what the real side span does on its
 * way to an anchorage off the frame, and the difference between a cut and a
 * cable that looks snapped.
 */
const SIDE_END_Y = 15.5;
const SIDE_SAG = 1;

/**
 * The tower legs, bottom to top. Each segment starts narrower than the one below
 * it ended: that step is the Art Deco setback, and the ledge it leaves is what
 * the outline draws. Without them the leg is one long extrusion and the tower
 * loses its second most recognisable feature after the portals.
 */
const LEG = [
  { base: PIER_TOP, top: 14.5, bottom: 1.6, head: 1.48 },
  { base: 14.5, top: 22.5, bottom: 1.4, head: 1.31 },
  { base: 22.5, top: 29.5, bottom: 1.24, head: 1.16 },
  { base: 29.5, top: TOWER_TOP, bottom: 1.09, head: 1.02 },
];

/**
 * The horizontal cross-bracing. One below the deck, then five up the tower, and
 * the openings they leave get shorter with height — 4.6, 3.9, 3.2, 2.4 — which
 * is the rhythm you actually recognise the tower by.
 */
const PORTALS = [
  { base: 6.4, height: 1.5 },
  { base: 14.4, height: 1.6 },
  { base: 20.6, height: 1.3 },
  { base: 25.8, height: 1.2 },
  { base: 30.2, height: 1.1 },
  { base: 33.7, height: 1.1 },
];

function legHalfWidthAt(y: number): number {
  const first = LEG[0]!;
  if (y <= first.base) return first.bottom;
  for (const segment of LEG) {
    if (y > segment.top) continue;
    const t = (y - segment.base) / (segment.top - segment.base);
    return segment.bottom + (segment.head - segment.bottom) * t;
  }
  return LEG[LEG.length - 1]!.head;
}

/** Height of the main cable over any point of the deck, on both spans. */
function cableY(x: number): number {
  const distance = Math.abs(x);
  if (distance <= TOWER_X) {
    // A parabola. At this sag it and a catenary differ by less than the width of
    // the rope that draws them.
    return CABLE_MID + (CABLE_TOP - CABLE_MID) * (distance / TOWER_X) ** 2;
  }
  const t = (distance - TOWER_X) / (DECK_END - TOWER_X);
  return CABLE_TOP + (SIDE_END_Y - CABLE_TOP) * t - SIDE_SAG * 4 * t * (1 - t);
}

export const goldenGateBridge: Monument = {
  id: 'golden-gate-bridge',
  name: 'Golden Gate Bridge',
  iso: 'USA',
  lat: 37.82,
  lon: -122.478,
  realHeight: 227,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper, strut } = ctx;
    const paint = palette.red;
    const concrete = palette.bone;
    const asphalt = palette.steel;
    const group = new THREE.Group();

    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- deck ---
    const truss = box(DECK_END * 2, TRUSS_TOP - TRUSS_BASE, DECK_HALF * 2, paint);
    truss.position.y = TRUSS_BASE;
    group.add(truss);

    const road = box(DECK_END * 2, ROAD_TOP - TRUSS_TOP, 5.2, asphalt);
    road.position.y = TRUSS_TOP;
    group.add(road);

    // The railings carry no mass; they are here so the deck ends in an ink line
    // rather than a bare edge, which is what stops it reading as a plank.
    for (const side of [1, -1]) {
      const rail = box(DECK_END * 2, 0.7, 0.4, paint);
      rail.position.set(0, TRUSS_TOP, side * 3.3);
      group.add(rail);
    }

    // --- towers ---
    for (const side of [1, -1]) {
      const x = side * TOWER_X;

      const pier = box(9.6, PIER_TOP, 12.4, concrete);
      pier.position.x = x;
      group.add(pier);

      for (const z of [CABLE_Z, -CABLE_Z]) {
        for (const segment of LEG) {
          const leg = taper(
            segment.bottom,
            segment.head,
            segment.top - segment.base,
            paint,
            4,
          );
          leg.position.set(x, segment.base, z);
          group.add(leg);
        }
      }

      for (const portal of PORTALS) {
        const half = legHalfWidthAt(portal.base + portal.height / 2);
        // Flush with the legs' outer faces and a little thinner than they are,
        // so the brace sits *into* the tower and the leg keeps its own outline.
        const brace = box(half * 1.7, portal.height, (CABLE_Z + half) * 2, paint);
        brace.position.set(x, portal.base, 0);
        group.add(brace);
      }
    }

    // --- the two main cables, and the ropes under them ---
    for (const z of [CABLE_Z, -CABLE_Z]) {
      const node = (x: number) => at(x, cableY(x), z);

      for (let i = 0; i < SPAN_SEGMENTS; i++) {
        const a = -TOWER_X + (i * 2 * TOWER_X) / SPAN_SEGMENTS;
        const b = -TOWER_X + ((i + 1) * 2 * TOWER_X) / SPAN_SEGMENTS;
        group.add(strut(node(a), node(b), CABLE_THICKNESS, paint));
      }

      for (const side of [1, -1]) {
        for (let i = 0; i < SIDE_SEGMENTS; i++) {
          const a = side * (TOWER_X + (i * (DECK_END - TOWER_X)) / SIDE_SEGMENTS);
          const b = side * (TOWER_X + ((i + 1) * (DECK_END - TOWER_X)) / SIDE_SEGMENTS);
          group.add(strut(node(a), node(b), CABLE_THICKNESS, paint));
        }
      }

      // A rope at every joint of the cable, skipping mid-span, where on the real
      // bridge the cable comes down and touches the deck, and the towers, where
      // there is a tower already.
      const rope = (x: number) => {
        const hanger = box(ROPE_THICKNESS, cableY(x) - TRUSS_TOP, ROPE_THICKNESS, paint);
        hanger.position.set(x, TRUSS_TOP, z);
        group.add(hanger);
      };
      for (let i = 1; i < SPAN_SEGMENTS; i++) {
        if (i === SPAN_SEGMENTS / 2) continue;
        rope(-TOWER_X + (i * 2 * TOWER_X) / SPAN_SEGMENTS);
      }
      for (const side of [1, -1]) {
        for (let i = 1; i < SIDE_SEGMENTS; i++) {
          rope(side * (TOWER_X + (i * (DECK_END - TOWER_X)) / SIDE_SEGMENTS));
        }
      }
    }

    return group;
  },
};
