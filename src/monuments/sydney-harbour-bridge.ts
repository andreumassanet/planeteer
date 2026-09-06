import type { Monument } from './contract.ts';

/**
 * Sydney Harbour Bridge.
 *
 * **A crop and a stretch, per the `MAX_ASPECT` policy.** The bridge is 1,149 m
 * end to end under an arch that stands 134 m above the water — 8.6:1 — and
 * `footprint` is a circle with no long axis to spend. What is kept is the frame
 * every photograph uses: the whole 503 m arch span, the four pylons that stand
 * just outside its bearings, and about 41 m of approach deck running out past
 * each pylon so the roadway leaves the frame instead of stopping in mid-air.
 * That is 648 m of the 1,149; cut are ~250 m of granite-faced approach viaduct
 * at each end, and the toll plaza.
 *
 * The crop on its own is still 648 x 134, or **4.8x wider than tall**, over the
 * cap of 4. So the vertical is exaggerated **1.55x**: horizontal scale is
 * 40 units / 251.5 m = 0.159 u/m, vertical is 33 units / 134 m = 0.246 u/m, and
 * the model comes out **3.1x wider than tall** — 103.5 by 33.3, the last 0.3
 * being the half-thickness of the crown chord itself. Everything vertical
 * follows that one number and nothing was tuned by eye: deck 49 m -> 12.0,
 * pylon tops 89 m -> 22.0, truss depth at the crown 18 m -> 4.4.
 *
 * Two things are drawn at the *vertical* scale in plan as well, deliberately:
 *
 * - **The pylons.** At the horizontal scale a 20 m-square pylon is 3.2 units
 *   wide against 22 tall, which is a needle. Drawn at the vertical scale it is
 *   5.0 wide — its own true 1:4.4 — and it reads as the squat stone block it is.
 * - **The deck**, at 9.6 units across rather than 7.8, so the near arch truss
 *   does not sit on top of the far one when you walk it.
 *
 * Filed `landmark` for the footprint and the mesh budget, not for the height: at
 * 103 units wide and 33 tall it fills its tier on width, which is the case the
 * contract has in mind when it says a wall passes on its diameter.
 *
 * ---
 *
 * **Against the Golden Gate, which is the card this one would otherwise
 * duplicate.** That is a suspension bridge and this is a steel through-arch, and
 * the whole difference is one curve read upside down. Protected, in order:
 *
 * - **The curve.** The Golden Gate's cable *sags*, diving from the saddles to
 *   within a rope's height of the deck at mid-span. This arch *bows up*, from
 *   the water at the springings to its highest point at mid-span. The two
 *   silhouettes are reflections of each other, and nothing else here is allowed
 *   to soften that.
 * - **Nothing tall at the ends.** The Golden Gate's read is tower-cable-tower:
 *   two vertical spikes with a V between them. Here the tallest thing is the
 *   middle. The pylons stop at 22 against the crown's 33 — two thirds — so they
 *   frame the arch rather than competing with it, which is what they do in life
 *   as well, where they carry no load at all.
 * - **Lattice, not band.** The arch is two chords with posts and diagonals
 *   between them, so the sky shows through it. A smooth band at this size would
 *   read as an inverted cable and undo the point.
 * - **Hangers below, not above.** The deck hangs *under* this arch and *from
 *   above* on the Golden Gate. Same comb of vertical ropes, opposite end.
 * - **Colour.** International Orange is the Golden Gate's loudest signal; this
 *   bridge is grey. The steelwork is `steel`, the darkest neutral that still
 *   silhouettes, and there is no warm colour anywhere in the structure.
 *
 * **The chords converge.** Truss depth is 4.4 at the crown and falls to zero at
 * the springings, because both chords are the same parabola scaled to different
 * rises. That taper to a pin at the water is the second-most recognisable thing
 * about the arch after its span, and it is free.
 *
 * **Colour and the cold shadow.** The hemisphere light's sky colour is blue, so
 * a neutral in shadow reads cold here. That is used rather than fought: the
 * steel is allowed to go blue in the shade, which is what steel does, and every
 * *stone* surface is a warm neutral — `bone` pylons, `tan` abutments and piers —
 * so the masonry stays warm against a cold arch and the two never merge. The
 * roadway is `bark`, darker and warmer than the steel, so the deck's top edge
 * shows against the truss it sits on.
 *
 * **Traded away.** No roadway markings, no railway, no lane structure — at
 * thumbnail size they are noise on a band 2.4 units deep. No cross-bracing below
 * the deck. The arch has 10 panels against the real 28: the mesh budget, not the
 * triangle budget, is what binds here (123 of 130 meshes against 1,492 of 3,600
 * triangles), and 28 bays would cost 222 meshes on their own. Chunky panels
 * with sky between them read as a lattice; 28 hairlines would read as a band.
 *
 * ---
 *
 * **NOTE — this monument and the Sydney Opera House collide, and no footprint
 * declared here can fix it.** The Opera House is at (-33.857, 151.215) and this
 * is at (-33.852, 151.211): **1.68 world units apart**, about 670 m at the
 * planet's 0.00251 units per metre. Its footprint is 45 and this one's is 52, so
 * they would need 97 units of clearance and have 1.7. They are, for practical
 * purposes, concentric. Specifically:
 *
 * - Its podium is 78 x 44 in plan, so it sits entirely inside this arch's
 *   80-unit span.
 * - Its two cascades stand at z = -9 and z = +10.5 with half-widths of 10.5 and
 *   8, spanning z in [-19.5, 1.5] and [2.5, 18.5]. This bridge's two arch
 *   trusses are at z = +/-4.8 — inside both of them. The arch passes straight
 *   through the sails.
 * - Its tallest shell reaches y = 39.4, above this crown's 33, so it comes out
 *   through the top of the arch as well.
 *
 * The one thing this file *can* control is the height of the deck, and it does:
 * the Opera House's podium tops out at y = 9.4 and this deck's underside is at
 * **9.6**, so the roadway clears the podium by 0.2 units rather than slicing it.
 * That clearance is why `DECK_BOTTOM` is 9.6 and not a rounder number.
 *
 * The rest belongs to the placement layer, which is the only place it can be
 * solved: `scripts/build-monuments.ts` bakes both at their true coordinates with
 * no de-collision pass, and at monument tier two landmarks 670 m apart in life
 * are two landmarks 1.7 units apart in the world. A minimum-separation nudge
 * that pushed co-located monuments apart along the real bearing between them by
 * the sum of their footprints would fix it — and would move them about 0.35 deg
 * of arc, roughly 40 km, apart. That is the honest price of tier-scaled
 * monuments on a real globe, and it should be paid once, in the bake, rather
 * than by each of the two files guessing.
 */

// --- the arch ---------------------------------------------------------------

/** Half the arch span. The chords meet here, at the pin on the abutment. */
const SPAN_HALF = 40;
const SPRING_Y = 1.6;
const CROWN_TOP = 33;
const CROWN_BOTTOM = 28.6;
/** Panels across the whole arch. Even, so there is a node at the crown. */
const PANELS = 10;

/** The two arch trusses, at the edges of the deck. The hangers come down these planes. */
const ARCH_Z = 4.8;
const CHORD_THICKNESS = 0.62;
const WEB_THICKNESS = 0.42;
const HANGER_THICKNESS = 0.4;
const BRACE_THICKNESS = 0.36;

// --- the deck ---------------------------------------------------------------

const DECK_END = 51.5;
/** 0.2 units above the Opera House podium's 9.4. See the note in the header. */
const DECK_BOTTOM = 9.6;
const DECK_TOP = 11.6;
const ROAD_TOP = 12;
const RAIL_HEIGHT = 0.9;
const DECK_HALF_Z = ARCH_Z;
const ROAD_HALF_Z = 4;
const RAIL_Z = 4.3;

// --- the stonework ----------------------------------------------------------

const PYLON_X = 45;
const PYLON_Z = 7.2;
const PYLON_TOP = 22;
const PLINTH_HEIGHT = 1.4;
const CORNICE_HEIGHT = 1.4;
/** Where the approach deck comes down onto a pier, out past the pylons. */
const PIER_X = 48.5;

const nodeX = (index: number): number => -SPAN_HALF + (index * 2 * SPAN_HALF) / PANELS;

/**
 * One parabola, two rises. Sharing the shape is what makes the truss depth fall
 * to zero at the springings instead of having to be tapered by hand.
 */
const arcAt = (x: number): number => 1 - (x / SPAN_HALF) ** 2;
const topChordY = (x: number): number => SPRING_Y + (CROWN_TOP - SPRING_Y) * arcAt(x);
const bottomChordY = (x: number): number => SPRING_Y + (CROWN_BOTTOM - SPRING_Y) * arcAt(x);

/**
 * Nodes with a hanger under them: the ones where the bottom chord is clear above
 * the deck. Outside these the arch drops through the deck plane and then below
 * it, which is the real crossing and happens here at |x| = 33.6.
 */
const HANGER_NODES = [2, 3, 4, 5, 6, 7, 8];

/** Spandrel posts, in the stretch where the arch runs under the deck and carries it. */
const SPANDREL_X = 36;

export const sydneyHarbourBridge: Monument = {
  id: 'sydney-harbour-bridge',
  name: 'Sydney Harbour Bridge',
  iso: 'AUS',
  lat: -33.852,
  lon: 151.211,
  realHeight: 134,
  tier: 'landmark',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, taper, strut } = ctx;
    const steelwork = palette.steel;
    const asphalt = palette.bark;
    const granite = palette.bone;
    const abutment = palette.tan;
    const group = new THREE.Group();

    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- the deck ---
    // One beam the whole length, so it reads as a single straight line crossing
    // a curve. That contrast is doing more work than any amount of detail on it.
    const stringers = box(DECK_END * 2, DECK_TOP - DECK_BOTTOM, DECK_HALF_Z * 2, steelwork);
    stringers.position.y = DECK_BOTTOM;
    group.add(stringers);

    const road = box(DECK_END * 2, ROAD_TOP - DECK_TOP, ROAD_HALF_Z * 2, asphalt);
    road.position.y = DECK_TOP;
    group.add(road);

    // The rails carry no mass. They sit on the ledge the narrower roadway leaves
    // and give the deck an ink line along its top, which is what stops a band
    // 2.4 units deep from disappearing at thumbnail size.
    for (const side of [1, -1]) {
      const rail = box(DECK_END * 2, RAIL_HEIGHT, 0.35, steelwork);
      rail.position.set(0, DECK_TOP, side * RAIL_Z);
      group.add(rail);
    }

    // --- the two arch trusses ---
    for (const z of [ARCH_Z, -ARCH_Z]) {
      for (let i = 0; i < PANELS; i++) {
        const a = nodeX(i);
        const b = nodeX(i + 1);

        group.add(strut(at(a, topChordY(a), z), at(b, topChordY(b), z), CHORD_THICKNESS, steelwork));
        group.add(
          strut(at(a, bottomChordY(a), z), at(b, bottomChordY(b), z), CHORD_THICKNESS, steelwork),
        );

        // Every diagonal climbs towards the crown, so the pattern mirrors about
        // mid-span and the two central diagonals meet at the highest node.
        const uphill = i < PANELS / 2;
        const from = uphill ? at(a, bottomChordY(a), z) : at(a, topChordY(a), z);
        const to = uphill ? at(b, topChordY(b), z) : at(b, bottomChordY(b), z);
        group.add(strut(from, to, WEB_THICKNESS, steelwork));
      }

      // Posts at every interior node. `box`, not `strut`: a vertical strut takes
      // an arbitrary roll about its own axis.
      for (let i = 1; i < PANELS; i++) {
        const x = nodeX(i);
        const post = box(
          WEB_THICKNESS,
          topChordY(x) - bottomChordY(x),
          WEB_THICKNESS,
          steelwork,
        );
        post.position.set(x, bottomChordY(x), z);
        group.add(post);
      }

      // --- hangers ---
      for (const i of HANGER_NODES) {
        const x = nodeX(i);
        const hanger = box(
          HANGER_THICKNESS,
          bottomChordY(x) - DECK_BOTTOM,
          HANGER_THICKNESS,
          steelwork,
        );
        hanger.position.set(x, DECK_BOTTOM, z);
        group.add(hanger);
      }

      // --- spandrel posts ---
      // Past the crossing the arch is below the deck and holds it up instead of
      // hanging it. Four short posts say so.
      for (const side of [1, -1]) {
        const x = side * SPANDREL_X;
        const post = box(WEB_THICKNESS, DECK_BOTTOM - bottomChordY(x), WEB_THICKNESS, steelwork);
        post.position.set(x, bottomChordY(x), z);
        group.add(post);
      }
    }

    // Transverse bracing between the two trusses. Barely visible head-on, and
    // the only thing that makes the arch a box rather than two flat cut-outs
    // once you are standing under it.
    for (const i of HANGER_NODES) {
      const x = nodeX(i);
      const y = topChordY(x);
      group.add(strut(at(x, y, ARCH_Z), at(x, y, -ARCH_Z), BRACE_THICKNESS, steelwork));
    }

    // --- the stonework ---
    for (const side of [1, -1]) {
      const x = side * SPAN_HALF;

      // The skewback the arch is pinned to, spanning both trusses.
      const skewback = box(6.4, SPRING_Y, 12.4, abutment);
      skewback.position.x = x;
      group.add(skewback);

      // The approach deck comes down onto a pier out past the pylons, so the
      // roadway is carried to the edge of the frame rather than floating there.
      const pier = box(3.2, DECK_BOTTOM, DECK_HALF_Z * 2, abutment);
      pier.position.x = side * PIER_X;
      group.add(pier);
    }

    // --- the four pylons ---
    // They carry nothing; they are ballast dressed as gateposts, and they are in
    // every photograph. Pale granite against the dark steel is what makes them
    // frame the arch at thumbnail size.
    for (const sideX of [1, -1]) {
      for (const sideZ of [1, -1]) {
        const x = sideX * PYLON_X;
        const z = sideZ * PYLON_Z;

        const plinth = box(5.8, PLINTH_HEIGHT, 5.8, granite);
        plinth.position.set(x, 0, z);
        group.add(plinth);

        // Barely tapered, on purpose. Any more batter and a pylon turns into an
        // obelisk; the real ones are near-prismatic and read as square blocks.
        const shaft = taper(2.5, 2.34, PYLON_TOP - PLINTH_HEIGHT - CORNICE_HEIGHT, granite, 4);
        shaft.position.set(x, PLINTH_HEIGHT, z);
        group.add(shaft);

        const cornice = box(5.6, CORNICE_HEIGHT, 5.6, granite);
        cornice.position.set(x, PYLON_TOP - CORNICE_HEIGHT, z);
        group.add(cornice);
      }
    }

    return group;
  },
};
