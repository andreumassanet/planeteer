import type { Monument } from './contract.ts';

/**
 * Stonehenge.
 *
 * Three things carry it: the lintels joining the uprights (so the surviving arc
 * reads as one band of stone), the horseshoe of trilithons, half again as tall
 * as the circle and open towards +Z, and the ruin (five uprights gone, one
 * stone prone in the breach, two out of plumb, one trilithon snapped). The
 * great trilithon is whole here, where in life it lost an upright.
 *
 * Deliberate departures:
 * - The plan is compressed about 2:1 against the heights. The real circle is
 *   33 m across and 4.9 m high (6.7:1), beyond `MAX_ASPECT`, and the `monument`
 *   tier caps the width at 14 units.
 * - Eighteen uprights instead of thirty, to fit the tier's 40 meshes and still
 *   leave some for the horseshoe; the stone-to-gap rhythm stays near 3:2.
 */

/** How much narrower a stone is at the top. Enough that the ink reads a hewn face, not a wedge. */
const STONE_TAPER = 0.88;

/** Stones stand a little into the chalk, so no seam shows and a leaning one has room to dip. */
const BED = 0.35;
const PLATFORM_RADIUS = 13.8;
const PLATFORM_HEIGHT = 0.5;

// --- the outer sarsen circle ---
const RING_BAYS = 18;
const RING_RADIUS = 12.6;
const RING_WIDTH = 2.7;
const RING_DEPTH = 1.35;
const RING_HEIGHT = 7.2;
const LINTEL_LENGTH = 4.3;
const LINTEL_DEPTH = 1.65;
const LINTEL_HEIGHT = 1.2;
const LEAN = 0.085;

/** Bays whose upright is gone. Two of them adjacent, so the breach is a hole and not a gap. */
const MISSING = [2, 3, 8, 10, 12];
/** Bays that still carry the lintel spanning them to the next bay: five run unbroken round the front, the sixth stands alone. */
const LINTELS = [14, 15, 16, 17, 0, 6];
/** Uprights out of plumb — never one under a lintel, since those are the ones that held. */
const LEANING = [5, 13];

/** The bay where a stone lies on its face, in the middle of the breach. */
const PRONE_BAY = 3;
const PRONE_RADIUS = 10.9;
const PRONE_LENGTH = 5.2;
const PRONE_WIDTH = 2.6;
const PRONE_THICKNESS = 1.15;
const PRONE_YAW = -0.12;

// --- the trilithon horseshoe ---
const HORSESHOE_BAYS = 8;
const HORSESHOE_RADIUS = 7.9;
/** Bays 2..6 of 8: a half-circle of five, leaving the mouth open towards +Z. */
const TRILITHON_FIRST = 2;
const TRILITHON_LAST = 6;
const TRILITHON_WIDTH = 2.0;
const TRILITHON_DEPTH = 1.6;
/** Half the gap between the two uprights of a pair. Narrow: a trilithon is a slot, not an arch. */
const TRILITHON_SPREAD = 1.3;
const TRILITHON_LINTEL_LENGTH = 5.0;
const TRILITHON_LINTEL_DEPTH = 1.9;
/** Top and lintel thickness by rank out from the back: the great one, its neighbours, the tips. */
const TRILITHON_TOP = [13.4, 11.9, 11.1];
const TRILITHON_CAP = [1.55, 1.45, 1.4];
/** The trilithon that lost its lintel and half an upright. On the near left, where it shows. */
const TRILITHON_BROKEN = 6;

// --- the bluestones ---
const BLUESTONE_BAYS = [0, 1, 12, 16];
const BLUESTONE_RADIUS = 10;
const BLUESTONE_WIDTH = 1.2;
const BLUESTONE_DEPTH = 0.9;
const BLUESTONE_HEIGHT = 3.6;

/**
 * Deterministic wobble in [-1, 1], stepping by the golden angle so nearby bays
 * differ. Never `Math.random()`: the loader builds twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const stonehenge: Monument = {
  id: 'stonehenge',
  name: 'Stonehenge',
  iso: 'GBR',
  lat: 51.179,
  lon: -1.826,
  // No `realHeight`, matching the source list: Stonehenge has no single height.
  tier: 'monument',
  footprint: 14,

  build(ctx) {
    const { THREE, palette, box, taper, around } = ctx;
    const sarsen = palette.bone;
    const bluestone = palette.slate;
    const chalk = palette.sand;

    const group = new THREE.Group();

    /**
     * One dressed stone. `taper` only makes regular prisms, so a slab is a square
     * one squashed on its own z: the top stays square to the ring, which a
     * lintel needs, and the top is narrower than the base.
     */
    const stone = (width: number, depth: number, height: number, color: number) => {
      const mesh = taper(width / 2, (width / 2) * STONE_TAPER, height, color, 4);
      mesh.scale.z = depth / width;
      return mesh;
    };

    // --- the scoured chalk the circle stands on ---
    group.add(taper(PLATFORM_RADIUS, PLATFORM_RADIUS - 0.35, PLATFORM_HEIGHT, chalk, 24));

    // --- the outer sarsen circle ---
    /** Half a bay. Lintels are placed on it, so they span two uprights rather than sit on one. */
    const half = Math.PI / RING_BAYS;
    const holdsLintel = (bay: number): boolean =>
      LINTELS.includes(bay) || LINTELS.includes((bay + RING_BAYS - 1) % RING_BAYS);

    const circle = around(RING_BAYS, (bay) => {
      const parts = new THREE.Group();

      if (bay === PRONE_BAY) {
        const prone = box(PRONE_WIDTH, PRONE_THICKNESS, PRONE_LENGTH, sarsen);
        prone.position.set(0, BED, PRONE_RADIUS);
        prone.rotation.y = PRONE_YAW;
        parts.add(prone);
      }

      if (!MISSING.includes(bay)) {
        const holds = holdsLintel(bay);
        const upright = stone(
          RING_WIDTH * (1 + 0.09 * wobble(bay, 0)),
          RING_DEPTH,
          // A stone under a lintel is exactly nominal height, so the lintel lands flat on it.
          holds ? RING_HEIGHT : RING_HEIGHT * (1 + 0.08 * wobble(bay, 1)),
          sarsen,
        );
        upright.position.set(0, BED, RING_RADIUS);
        upright.rotation.y = (holds ? 0.02 : 0.06) * wobble(bay, 2);
        // Inward, always: tipped the other way a stone swings its top out past the footprint.
        if (LEANING.includes(bay)) upright.rotation.x = -LEAN;
        parts.add(upright);
      }

      if (LINTELS.includes(bay)) {
        const lintel = box(LINTEL_LENGTH, LINTEL_HEIGHT, LINTEL_DEPTH, sarsen);
        // Deeper than the uprights it rests on, so the ink finds a ledge under it.
        lintel.position.set(
          RING_RADIUS * Math.sin(half),
          BED + RING_HEIGHT,
          RING_RADIUS * Math.cos(half),
        );
        lintel.rotation.y = half;
        parts.add(lintel);
      }

      return parts.children.length > 0 ? parts : null;
    });
    group.add(circle);

    // --- the trilithon horseshoe ---
    const horseshoe = around(HORSESHOE_BAYS, (bay) => {
      if (bay < TRILITHON_FIRST || bay > TRILITHON_LAST) return null;
      // Rank out from the back: 0 is the great trilithon, 2 the two tips.
      const rank = Math.abs(bay - (TRILITHON_FIRST + TRILITHON_LAST) / 2);
      const top = TRILITHON_TOP[rank]!;
      const cap = TRILITHON_CAP[rank]!;
      const broken = bay === TRILITHON_BROKEN;

      const pair = new THREE.Group();
      for (const side of [-1, 1]) {
        const snapped = broken && side === 1 ? 0.58 : 1;
        const post = stone(TRILITHON_WIDTH, TRILITHON_DEPTH, (top - cap - BED) * snapped, sarsen);
        post.position.set(side * TRILITHON_SPREAD, BED, HORSESHOE_RADIUS);
        post.rotation.y = 0.03 * wobble(bay * 2 + side, 3);
        pair.add(post);
      }

      if (!broken) {
        const lintel = box(TRILITHON_LINTEL_LENGTH, cap, TRILITHON_LINTEL_DEPTH, sarsen);
        lintel.position.set(0, top - cap, HORSESHOE_RADIUS);
        pair.add(lintel);
      }
      return pair;
    });
    group.add(horseshoe);

    // --- the bluestones, between the circle and the horseshoe ---
    const bluestones = around(RING_BAYS, (bay) => {
      if (!BLUESTONE_BAYS.includes(bay)) return null;
      const post = stone(
        BLUESTONE_WIDTH * (1 + 0.18 * wobble(bay, 4)),
        BLUESTONE_DEPTH,
        BLUESTONE_HEIGHT * (1 + 0.14 * wobble(bay, 5)),
        bluestone,
      );
      post.position.set(0, BED, BLUESTONE_RADIUS);
      post.rotation.y = 0.3 * wobble(bay, 6);
      return post;
    });
    // Half a bay round from the sarsens, so they show through the gaps in the circle.
    bluestones.rotation.y = half;
    group.add(bluestones);

    return group;
  },
};
