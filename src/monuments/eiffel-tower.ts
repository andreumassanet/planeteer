import type { Monument } from './contract.ts';

/**
 * Eiffel Tower.
 *
 * The silhouette test is the only one that matters, and for this tower it is
 * four things: the flared legs, the great arch under the first platform, two
 * horizontal decks, and a lattice needle. Everything here serves one of those
 * four. There is no ornament — at a hundred units the real tower's 18,000 iron
 * pieces are one grey smear anyway, and the outline does the drawing.
 *
 * The profile is the real one, scaled: heights and widths are the tower's own
 * ratios against 330 m, mapped onto the 120-unit `landmark` tier.
 */

/**
 * Half-width across the flats at each height. The tower is a square in plan, so
 * a leg sits at `(±r, y, ±r)` and its distance from the axis is `r * sqrt(2)`.
 *
 * The bottom entry starts at y = 3.2, not 0: a diagonal `strut` is a box centred
 * on its axis, so its cross-section pokes *below* the endpoint by half its
 * thickness. The masonry footings cover that, which is also what the real tower
 * does.
 */
const LEVELS = [
  { y: 3.2, r: 21.5 },
  { y: 8.5, r: 16.6 },
  { y: 14.5, r: 12.9 },
  { y: 20.5, r: 11.3 }, // first platform (57 m)
  { y: 31, r: 7.8 },
  { y: 42, r: 5.4 }, // second platform (115 m)
  { y: 60, r: 4.4 },
  { y: 80, r: 3.7 },
  { y: 100, r: 3.2 }, // top platform (276 m)
];

const TOP = 120;
const FOOTING = 3.2;

/** Where the great arch springs from the legs, and where its crown sits. */
const ARCH_SPRING = 5;
const ARCH_CROWN = 17.8;

const SQRT2 = Math.SQRT2;

function halfWidthAt(y: number): number {
  const first = LEVELS[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < LEVELS.length; i++) {
    const a = LEVELS[i - 1]!;
    const b = LEVELS[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return LEVELS[LEVELS.length - 1]!.r;
}

export const eiffelTower: Monument = {
  id: 'eiffel-tower',
  name: 'Eiffel Tower',
  iso: 'FRA',
  lat: 48.8584,
  lon: 2.2945,
  realHeight: 330,
  tier: 'landmark',
  footprint: 35,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;
    const iron = palette.brown;
    const deck = palette.darkOlive;
    const group = new THREE.Group();

    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // Thick at the ground, thin at the top: the taper is what stops the needle
    // reading as a mast bolted onto a pylon.
    const thickness = (segment: number) => 3.1 - (2.1 * segment) / (LEVELS.length - 2);

    // --- the four legs, at the corners of the square ---
    const legs = around(4, () => {
      const leg = new THREE.Group();

      const footing = box(6, FOOTING, 6, deck);
      footing.position.z = LEVELS[0]!.r * SQRT2;
      // The pivot below turns this leg to a corner; undo that on the footing so
      // the pier stays square with the tower instead of standing on its edge.
      footing.rotation.y = -Math.PI / 4;
      leg.add(footing);

      for (let i = 0; i + 1 < LEVELS.length; i++) {
        const a = LEVELS[i]!;
        const b = LEVELS[i + 1]!;
        leg.add(strut(at(0, a.y, a.r * SQRT2), at(0, b.y, b.r * SQRT2), thickness(i), iron));
      }
      return leg;
    });
    legs.rotation.y = Math.PI / 4;
    group.add(legs);

    // --- the four faces: the arch, and the lattice above the first platform ---
    const faces = around(4, () => {
      const face = new THREE.Group();

      // The arch is a flattened parabola between the two legs of this face. It
      // rises as the legs close in, so every point rides the profile: x and z
      // both come from the half-width at that height.
      const archPoint = (t: number) => {
        const y = ARCH_CROWN - (ARCH_CROWN - ARCH_SPRING) * t * t;
        const r = halfWidthAt(y);
        return at(t * r, y, r);
      };
      for (let i = 0; i < 4; i++) {
        face.add(strut(archPoint(-1 + i * 0.5), archPoint(-0.5 + i * 0.5), 2.2, iron));
      }

      // Cross bracing, first platform upward. Below it the legs are too far
      // apart for an X to read as anything but a fence across the arch.
      for (let i = 3; i + 1 < LEVELS.length; i++) {
        const a = LEVELS[i]!;
        const b = LEVELS[i + 1]!;
        const width = thickness(i) * 0.55;
        face.add(strut(at(-a.r, a.y, a.r), at(b.r, b.y, b.r), width, iron));
        face.add(strut(at(a.r, a.y, a.r), at(-b.r, b.y, b.r), width, iron));
      }
      return face;
    });
    group.add(faces);

    // --- the decks ---
    const platform = (level: number, overhang: number, height: number) => {
      const r = halfWidthAt(level);
      const slab = box(r * 2 * overhang, height, r * 2 * overhang, deck);
      slab.position.y = level - height / 2;
      group.add(slab);
    };
    platform(20.5, 1.5, 1.7);
    platform(42, 1.5, 1.4);
    platform(100, 1.6, 1.1);

    // --- the needle ---
    const spire = taper(LEVELS[LEVELS.length - 1]!.r * 0.75, 0.6, 13, iron, 4);
    spire.position.y = 100;
    group.add(spire);

    const mast = column(0.4, TOP - 113, deck, 6);
    mast.position.y = 113;
    group.add(mast);

    return group;
  },
};
