import type { Monument } from './contract.ts';

/**
 * Stonehenge.
 *
 * Three things carry it at thumbnail size, and everything in this file serves
 * one of them:
 *
 * - **The lintels.** A ring of bare posts is a fence. What makes this Stonehenge
 *   and not a paddock is that the uprights are joined across their tops, so the
 *   surviving arc reads as one continuous band of stone in the air.
 * - **The horseshoe of trilithons**, half again as tall as the circle and open
 *   towards +Z. Without it the model is a circle of identical stones, which is
 *   every other stone ring in Europe.
 * - **The ruin.** Five uprights gone, one stone prone in the breach, two out of
 *   plumb, one trilithon snapped. A closed ring with every lintel in place is a
 *   Victorian folly; the gaps are half the reason the real thing is famous.
 *
 * Two deliberate departures from the real monument:
 *
 * - **It is far less flat than life.** The sarsen circle is 33 m across and
 *   4.9 m to the top of its lintels — a ratio of 6.7, and 4.5 even measured
 *   against the great trilithon. `MAX_ASPECT` is 4, so the true proportion is
 *   not modellable at any size, and the `monument` tier's 14-unit footprint caps
 *   the width before anything else does. So the plan is compressed about 2:1
 *   against the heights. Sizing the other way — true proportions at 14 units
 *   wide — would put the uprights at 3.7 units, barely half the avatar, and
 *   Stonehenge is not a thing you look down at.
 * - **Eighteen uprights, not thirty.** The `monument` tier allows 40 meshes and
 *   the real circle alone is sixty stones. Eighteen bays keep the stone-to-gap
 *   rhythm of the original (roughly 3:2) while leaving meshes for the horseshoe,
 *   which matters more.
 *
 * The ruin is a plausible one rather than a survey: the great trilithon is whole
 * here, where in life it lost an upright. It is the tallest thing in the model
 * and the centre of the silhouette, and a monument has to be nameable before it
 * is accurate.
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
/**
 * Bays that still carry the lintel spanning them to the next bay. Five of them
 * run unbroken from 280 degrees round through the front, which is the one
 * stretch of the real circle that never fell; the sixth stands alone.
 */
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
 * Deterministic wobble in [-1, 1]: sarsens were dressed by hand and a ring of
 * identical prisms is a fence. The step is the golden angle, so no two nearby
 * bays land on the same value and the ring never falls into a visible pattern.
 * `Math.random()` is forbidden — the loader builds twice and compares.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const stonehenge: Monument = {
  id: 'stonehenge',
  name: 'Stonehenge',
  iso: 'GBR',
  lat: 51.179,
  lon: -1.826,
  // No `realHeight`, matching the source list: Stonehenge has no single one.
  // 4.9 m at the sarsen lintels, 7.3 m at the great trilithon, and picking
  // either would be asserting a fact the data declines to assert.
  tier: 'monument',
  footprint: 14,

  build(ctx) {
    const { THREE, palette, box, taper, around } = ctx;
    const sarsen = palette.bone;
    const bluestone = palette.slate;
    const chalk = palette.sand;

    const group = new THREE.Group();

    /**
     * One dressed stone. `taper` only makes regular prisms, so a slab is a
     * square one squashed on its own z: it keeps the top face square to the
     * ring, which is what a lintel has to land on, and it costs four triangles
     * over a box to gain a top narrower than the base.
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
          // A stone under a lintel is exactly nominal height: the lintel has to
          // land flat on it, and the ones that kept theirs are the ones that
          // never moved.
          holds ? RING_HEIGHT : RING_HEIGHT * (1 + 0.08 * wobble(bay, 1)),
          sarsen,
        );
        upright.position.set(0, BED, RING_RADIUS);
        upright.rotation.y = (holds ? 0.02 : 0.06) * wobble(bay, 2);
        // Inward, always. Tipped the other way a stone swings its top out past
        // the footprint, and the ones that lean at all lean into the circle.
        if (LEANING.includes(bay)) upright.rotation.x = -LEAN;
        parts.add(upright);
      }

      if (LINTELS.includes(bay)) {
        const lintel = box(LINTEL_LENGTH, LINTEL_HEIGHT, LINTEL_DEPTH, sarsen);
        // Deeper than the uprights it rests on, so the ink finds a ledge under
        // it instead of one flat face running from the ground to the sky.
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
    // Half a bay round from the sarsens, so they show through the gaps in the
    // circle rather than hiding behind its uprights. They are the only colour
    // in the model that is not sarsen, and they are why it is not monochrome.
    bluestones.rotation.y = half;
    group.add(bluestones);

    return group;
  },
};
