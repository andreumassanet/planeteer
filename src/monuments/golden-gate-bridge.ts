import type { Monument } from './contract.ts';

/**
 * Golden Gate Bridge.
 *
 * **Land to land, compressed.** The bridge is 2.7 km of roadway under a 227 m
 * tower — 12:1 — and `footprint` is a circle, which has no long axis to spend on
 * a long thing. What is here is the whole crossing, shortened: both towers on
 * their piers, the main span between them, the main cable diving from the
 * saddles to within a rope's height of the deck at mid-span and rising again,
 * the comb of suspenders, and at each end a side span that lands on a headland.
 * There the truss meets a rock cliff whose flat top is at the truss's own level,
 * the roadway runs on over it between two grassed hills, the side cable runs
 * down into a concrete anchorage on the bluff, one block a cable outside the
 * road, and the road then tilts down an earth embankment to the ground at the
 * plan's end. The embankment's other slope runs under the side span to the
 * tower's pier as a rocky shore, so nothing is left standing on the air: the
 * deck rests on the piers and the cliffs, and every cliff, hill, embankment and
 * ramp stands on y = 0. Cut: the approach viaducts, Fort Point, and most of the
 * side spans' length.
 *
 * The crossing is also stretched vertically. In life a tower stands 0.13 of the
 * main span above the deck; here it stands 0.43 (23.2 units over a 54-unit
 * span, as drawn), because the headlands take a third of the width and the model may be
 * no more than `MAX_ASPECT` (4) times wider than tall. All of the exaggeration
 * went into the vertical, because everything that names this bridge — the sag,
 * the portals, the suspenders — lives there. The deck is kept low, at 0.24 of
 * the tower's height (0.30 in life), so the ramps down the headlands are short.
 * The cable is fattened about fivefold for the same reason the towers are
 * tall: true to scale it is a fifth of a unit and simply is not drawn.
 *
 * Filed `landmark` for the footprint and the mesh budget, not for the height. At
 * 109 units long and 30 tall it fills its tier on length, which is the case the
 * contract has in mind when it says a wall passes on its diameter. A suspension
 * bridge cannot be tall; this one has to be long. It is turned to run north and
 * south, as the real one does from San Francisco to Marin, so its plan is 25 by
 * 109: the hills either side of the road are what widen it past the deck. It
 * crosses nothing in this world, as Tower Bridge does not: it stands on dry land
 * out of its town, its headlands the ground at both ends.

 * **Colour.** International Orange is a vermilion, hue around 7deg. `red`
 * (0xec3f1c) sits at 10deg; `orange` (0xe56202) at 25deg, which is a traffic
 * cone; `clay` has the hue and none of the saturation. So `red` on everything
 * structural — towers, truss, cables, ropes — broken only by the grey of the
 * roadway and the concrete of the piers and anchorages, which is the only place
 * the real bridge breaks it either. The headlands are brown rock, tan earth and
 * green hills, so the orange stops where the land begins.
 *
 * **Traded away.** The stiffening truss is a solid beam rather than a chord-and-
 * diagonal lattice: reading a truss 72 units long and 2 deep needs about
 * thirty struts, and they buy nothing the ink line along its edge does not
 * already give. The meshes went into suspenders instead, which are the feature
 * that says *suspension* bridge.
 */

/** Half the main span. The towers stand here; the side spans run on past them. */
const TOWER_X = 27;

/**
 * Where each headland's cliff stands, and so where the deck's truss ends: the
 * side span lands on the rock here and the roadway carries on over it.
 */
const BLUFF_X = 36;
/** The back of the bluff's flat top, where the roadway starts down to the ground. */
const BLUFF_BACK = 42;
/** How far the bluff reaches across the bridge, either side of the road. */
const BLUFF_HALF_Z = 9;
/** The foot of the ramp, at the plan's end, on the ground. */
const RAMP_FOOT = 54;

const DECK_HALF = 4.5;
const ROAD_HALF = 2.6;
const RAIL_Z = 3.3;

/**
 * Where the cables, the ropes and the tower legs sit across the bridge: at the
 * edge of the deck, so the roadway passes clear between the legs. That gap is
 * the portal, and the portal is why the towers are not goalposts.
 */
const CABLE_Z = 4.3;

const PIER_TOP = 2.4;
const TRUSS_BASE = 4.6;
/** Also the bluff's top: the roadway runs on from the truss onto the rock at one level. */
const TRUSS_TOP = 6.6;
const ROAD_TOP = 7.2;
const TOWER_TOP = 30.4;

/** The cable over the saddle, and at mid-span where it all but touches the deck. */
const CABLE_TOP = 29.9;
const CABLE_MID = 8;
const CABLE_THICKNESS = 0.8;
const ROPE_THICKNESS = 0.5;

/** Segments across the main span. Every joint is also a suspender. */
const SPAN_SEGMENTS = 12;
const SIDE_SEGMENTS = 3;

/**
 * The anchorage: a concrete block on the bluff, one under each cable, outside
 * the roadway. The side cable runs from the saddle down into its front face.
 */
const ANCHOR_FRONT = 38;
const ANCHOR_BACK = 41.4;
const ANCHOR_TOP = 10.4;
const ANCHOR_HALF_Z = 1.3;
/** Where the side cable ends, a little inside the anchorage's front face. */
const SIDE_END_X = 38.8;
const SIDE_END_Y = 9.6;
const SIDE_SAG = 0.8;

/**
 * The tower legs, bottom to top. Each segment starts narrower than the one below
 * it ended: that step is the Art Deco setback, and the ledge it leaves is what
 * the outline draws. Without them the leg is one long extrusion and the tower
 * loses its second most recognisable feature after the portals.
 */
const LEG = [
  { base: PIER_TOP, top: 12.7, bottom: 1.5, head: 1.39 },
  { base: 12.7, top: 20, bottom: 1.3, head: 1.22 },
  { base: 20, top: 24.2, bottom: 1.15, head: 1.09 },
  { base: 24.2, top: TOWER_TOP, bottom: 1.02, head: 0.95 },
];

/**
 * The horizontal cross-bracing. One below the deck, then five up the tower, and
 * the openings they leave get shorter with height — 3.9, 3.2, 2.5, 1.9 over the
 * roadway's own 4.8 — which is the rhythm you actually recognise the tower by.
 */
const PORTALS = [
  { base: 3, height: 1 },
  { base: 12, height: 1.4 },
  { base: 17.3, height: 1.2 },
  { base: 21.7, height: 1.1 },
  { base: 25.3, height: 1 },
  { base: 28.2, height: 1 },
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

/** Height of the main cable over any point between the two anchorages. */
function cableY(x: number): number {
  const distance = Math.abs(x);
  if (distance <= TOWER_X) {
    // A parabola. At this sag it and a catenary differ by less than the width of
    // the rope that draws them.
    return CABLE_MID + (CABLE_TOP - CABLE_MID) * (distance / TOWER_X) ** 2;
  }
  const t = (distance - TOWER_X) / (SIDE_END_X - TOWER_X);
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
    const { THREE, palette, box, taper, column, strut, tone } = ctx;
    const paint = palette.red;
    const concrete = palette.bone;
    const asphalt = palette.steel;
    const rock = palette.brown;
    const scree = tone(palette.brown, 0.82);
    const earth = palette.tan;
    const grass = palette.green;
    const outer = new THREE.Group();
    const group = new THREE.Group();
    // Turned to run north and south, as the real one does across its
    // strait: drawn along x, stood along z.
    group.rotation.y = Math.PI / 2;
    outer.add(group);

    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- deck ---
    // The truss spans from cliff to cliff; the roadway runs on over the bluffs
    // to the top of each ramp.
    const truss = box(BLUFF_X * 2, TRUSS_TOP - TRUSS_BASE, DECK_HALF * 2, paint);
    truss.position.y = TRUSS_BASE;
    group.add(truss);

    const road = box(BLUFF_BACK * 2, ROAD_TOP - TRUSS_TOP, ROAD_HALF * 2, asphalt);
    road.position.y = TRUSS_TOP;
    group.add(road);

    // The railings carry no mass; they are here so the deck ends in an ink line
    // rather than a bare edge, which is what stops it reading as a plank. They
    // stop where the bridge does, at the cliff.
    for (const side of [1, -1]) {
      const rail = box(BLUFF_X * 2, 0.7, 0.4, paint);
      rail.position.set(0, TRUSS_TOP, side * RAIL_Z);
      group.add(rail);
    }

    // --- towers ---
    for (const side of [1, -1]) {
      const x = side * TOWER_X;

      const pier = box(8, PIER_TOP, 12.4, concrete);
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

    // --- the headlands ---
    // Each end lands on land. A cliff of rock stands where the truss ends, its
    // flat top at the truss's own level so the roadway runs straight on; an
    // embankment under the road's ramp falls from the back of that top to the
    // ground at the plan's end, and its front slope runs down under the side
    // span to the tower's pier as a rocky shore. Two hills either side of the
    // road rise over the deck, the way the headlands do over the real
    // approaches, and a lower shoulder of scree steps down behind each.
    const run = RAMP_FOOT - BLUFF_BACK;
    const fall = TRUSS_TOP;
    const slope = Math.atan2(fall, run);
    const embankmentHalfZ = 5.5;
    for (const side of [1, -1]) {
      const bluff = box(BLUFF_BACK - BLUFF_X, TRUSS_TOP, BLUFF_HALF_Z * 2, rock);
      bluff.position.x = side * (BLUFF_X + BLUFF_BACK) / 2;
      group.add(bluff);

      // A three-sided prism laid on its side is a gable: its ridge under the
      // back edge of the bluff's top, one slope under the ramp, the other under
      // the side span. Apothem 1, so the triangle is 2 * sqrt(3) wide and 3
      // tall before it is scaled; scale goes on the prism's own axes, before
      // the rotation lays it down (`T * R * S`).
      const embankment = column(1, embankmentHalfZ * 2, earth, 3);
      embankment.scale.set(run / Math.sqrt(3), 1, fall / 3);
      embankment.rotation.x = Math.PI / 2;
      embankment.position.set(side * BLUFF_BACK, fall / 3, -embankmentHalfZ);
      group.add(embankment);

      // The ramp: the roadway, tilted down the embankment's back slope until
      // its lower edge is on the ground at the plan's end.
      const length = Math.hypot(run, fall);
      const ramp = box(length, ROAD_TOP - TRUSS_TOP, ROAD_HALF * 2, asphalt);
      ramp.rotation.z = -side * slope;
      ramp.position.set(side * (BLUFF_BACK + run / 2), fall / 2, 0);
      group.add(ramp);

      for (const z of [CABLE_Z, -CABLE_Z]) {
        const anchorage = box(ANCHOR_BACK - ANCHOR_FRONT, ANCHOR_TOP - TRUSS_TOP, ANCHOR_HALF_Z * 2, concrete);
        anchorage.position.set(side * (ANCHOR_FRONT + ANCHOR_BACK) / 2, TRUSS_TOP, z);
        group.add(anchorage);
      }

      for (const sideZ of [1, -1]) {
        // Scaled in x only, so the frustum keeps its faces and its batter.
        const hill = taper(3.2, 2, 8.6, grass);
        hill.scale.set(1.4, 1, 1);
        hill.position.set(side * 39, 0, sideZ * 9.5);
        group.add(hill);

        const shoulder = taper(2.6, 1.4, 4, scree);
        shoulder.position.set(side * 46, 0, sideZ * 7.5);
        group.add(shoulder);
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

      // The side spans: from the saddle down into the anchorage's face.
      for (const side of [1, -1]) {
        for (let i = 0; i < SIDE_SEGMENTS; i++) {
          const a = side * (TOWER_X + (i * (SIDE_END_X - TOWER_X)) / SIDE_SEGMENTS);
          const b = side * (TOWER_X + ((i + 1) * (SIDE_END_X - TOWER_X)) / SIDE_SEGMENTS);
          group.add(strut(node(a), node(b), CABLE_THICKNESS, paint));
        }
      }

      // A rope at every joint of the cable, skipping mid-span, where on the real
      // bridge the cable comes down and touches the deck, and the towers, where
      // there is a tower already. On the side spans both joints fall over the
      // truss, short of the cliff.
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
          rope(side * (TOWER_X + (i * (SIDE_END_X - TOWER_X)) / SIDE_SEGMENTS));
        }
      }
    }

    // One mesh a colour, which the ink draws the same.
    return ctx.merge(outer);
  },
};
