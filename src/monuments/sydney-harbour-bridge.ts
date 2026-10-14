import type { Monument } from './contract.ts';

/**
 * Sydney Harbour Bridge.
 *
 * A crop and a vertical stretch. The bridge is 1,149 m end to end under an
 * arch 134 m above the water (8.6:1), beyond `MAX_ASPECT`. The model keeps the
 * frame every photograph uses: the 503 m arch span, the four pylons just
 * outside its bearings and about 41 m of approach deck past each pylon (648 m
 * in all). Vertical is stretched 1.55x (0.159 u/m horizontally, 0.246
 * vertically), so the model is 3.1x wider than tall, 103.5 by 33.3. Everything
 * vertical follows that one number: deck 49 m is 12.0, pylon tops 89 m are
 * 22.0, truss depth at the crown 18 m is 4.4. The pylons are drawn at the
 * vertical scale in plan too (5.0 wide, the squat block they are) and the deck
 * is 9.6 across so the near truss does not sit on the far one.
 *
 * Tier `landmark`, for the footprint and the mesh budget rather than the height.
 *
 * It must not read as the Golden Gate. That cable sags and this arch bows up,
 * so nothing here softens the reflected curve. The tallest point is the middle
 * (pylons reach 22 of the crown's 33, and carry no load, as in life). The arch
 * is a lattice of two chords with posts and diagonals so the sky shows through.
 * The hangers come down from the arch to the deck. The steelwork is `steel`,
 * and the stone is a warm neutral (`bone` pylons, `tan` abutments and piers) so
 * masonry stays warm against the cold shaded arch. The roadway is `bark`.
 *
 * Both chords are the same parabola at different rises, so the truss depth is
 * 4.4 at the crown and falls to zero at the springings. The arch has 10 panels
 * against the real 28 (the mesh budget binds: 123 of 130 meshes). There are no
 * roadway markings, railway or cross-bracing below the deck.
 *
 * This monument and the Sydney Opera House are 1.68 world units apart at their
 * true coordinates, so they overlap whatever footprints are declared. The one
 * thing this file controls is the deck height: its underside is at 9.6, 0.2
 * above the Opera House podium's 9.4, which is why `DECK_BOTTOM` is not rounder.
 * Separating them is the placement bake's job.
 */

// --- the arch ---

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

// --- the deck ---

const DECK_END = 51.5;
/** 0.2 units above the Opera House podium's 9.4. */
const DECK_BOTTOM = 9.6;
const DECK_TOP = 11.6;
const ROAD_TOP = 12;
const RAIL_HEIGHT = 0.9;
const DECK_HALF_Z = ARCH_Z;
const ROAD_HALF_Z = 4;
const RAIL_Z = 4.3;

// --- the stonework ---

const PYLON_X = 45;
const PYLON_Z = 7.2;
const PYLON_TOP = 22;
const PLINTH_HEIGHT = 1.4;
const CORNICE_HEIGHT = 1.4;
/** Where the approach deck comes down onto a pier, out past the pylons. */
const PIER_X = 48.5;

const nodeX = (index: number): number => -SPAN_HALF + (index * 2 * SPAN_HALF) / PANELS;

/**
 * One parabola, two rises: the truss depth falls to zero at the springings
 * without being tapered by hand.
 */
const arcAt = (x: number): number => 1 - (x / SPAN_HALF) ** 2;
const topChordY = (x: number): number => SPRING_Y + (CROWN_TOP - SPRING_Y) * arcAt(x);
const bottomChordY = (x: number): number => SPRING_Y + (CROWN_BOTTOM - SPRING_Y) * arcAt(x);

/**
 * Nodes with a hanger under them: those where the bottom chord is clear above
 * the deck. Past |x| = 33.6 the arch drops through the deck plane.
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

    // --- the deck: one beam the whole length, a straight line crossing a curve ---
    const stringers = box(DECK_END * 2, DECK_TOP - DECK_BOTTOM, DECK_HALF_Z * 2, steelwork);
    stringers.position.y = DECK_BOTTOM;
    group.add(stringers);

    const road = box(DECK_END * 2, ROAD_TOP - DECK_TOP, ROAD_HALF_Z * 2, asphalt);
    road.position.y = DECK_TOP;
    group.add(road);

    // The rails carry no mass; they give the deck an ink line along its top.
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

        // Every diagonal climbs towards the crown, so the pattern mirrors about mid-span.
        const uphill = i < PANELS / 2;
        const from = uphill ? at(a, bottomChordY(a), z) : at(a, topChordY(a), z);
        const to = uphill ? at(b, topChordY(b), z) : at(b, bottomChordY(b), z);
        group.add(strut(from, to, WEB_THICKNESS, steelwork));
      }

      // Posts at every interior node. `box`, not `strut`: a vertical strut takes an arbitrary roll.
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

      // --- spandrel posts: past the crossing the arch is below the deck and holds it up ---
      for (const side of [1, -1]) {
        const x = side * SPANDREL_X;
        const post = box(WEB_THICKNESS, DECK_BOTTOM - bottomChordY(x), WEB_THICKNESS, steelwork);
        post.position.set(x, bottomChordY(x), z);
        group.add(post);
      }
    }

    // Transverse bracing between the two trusses, so the arch is a box rather than two cut-outs.
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

      // The approach deck comes down onto a pier out past the pylons.
      const pier = box(3.2, DECK_BOTTOM, DECK_HALF_Z * 2, abutment);
      pier.position.x = side * PIER_X;
      group.add(pier);
    }

    // --- the four pylons: they carry nothing, and pale granite frames the arch ---
    for (const sideX of [1, -1]) {
      for (const sideZ of [1, -1]) {
        const x = sideX * PYLON_X;
        const z = sideZ * PYLON_Z;

        const plinth = box(5.8, PLINTH_HEIGHT, 5.8, granite);
        plinth.position.set(x, 0, z);
        group.add(plinth);

        // Barely tapered: more batter turns a pylon into an obelisk.
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
