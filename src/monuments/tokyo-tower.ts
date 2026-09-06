import type { Monument } from './contract.ts';

/**
 * Tokyo Tower.
 *
 * The tower is not the hard part of this file. The Eiffel Tower is. Tokyo Tower
 * is an avowed copy of it — square plan, four legs, riveted lattice, thirteen
 * metres taller — and on one contact sheet two brown lattice pylons would read
 * as the same monument printed twice. Everything below is built for the
 * difference that survives at thumbnail size, and every one of them is a
 * difference the real towers have:
 *
 * 1. **Colour, which does most of the work.** Japanese aviation law paints it
 *    international orange and white in alternating bands; the Eiffel is one flat
 *    bronze from foot to finial. `orange` and `white` against the Eiffel's
 *    `brown` and `darkOlive` share no palette entry at all — and the *banding*
 *    is itself a signature the Eiffel has nothing resembling. Both are warm, so
 *    both survive the shade note in `contract.ts`.
 * 2. **Proportion.** The Eiffel is 125 m across a 330 m height; Tokyo Tower is
 *    88.8 m across 333 m — 29% narrower — and its legs are close to straight
 *    lines where the Eiffel's sweep out in a curve. The two facts compound. The
 *    profiles below cross: Tokyo starts at 0.72 of the Eiffel's radius, is 1.09
 *    of it at a quarter height, and 0.53 of it at five sixths. Flare against
 *    mast. That crossing is the silhouette, not the base width on its own.
 * 3. **Two fat decks, not three thin ones.** The Main Deck is a two-storey
 *    building clamped round the shaft at 150 m, blocky enough to have windows;
 *    the small Top Deck sits at 250 m. The Eiffel answers with three slabs a
 *    metre and a half thick.
 * 4. **A bare antenna over the top fifth.** Unlatticed, thin, and the reason the
 *    tower out-measures the Eiffel at all. The Eiffel's top is more lattice.
 * 5. **No great arch.** The Eiffel's defining hole is the arch under the first
 *    platform. Tokyo Tower's base is *filled*: the Foot Town building sits
 *    between the legs, so the ground line is a solid box where the Eiffel's is
 *    empty sky.
 *
 * ## Scale and the two exaggerations
 *
 * Aspect is not a constraint here — 50.3 wide against 120 tall is 0.42 on the
 * half-diagonal test, against `MAX_ASPECT` 4 — so heights are the real tower's
 * own fractions of 333 m mapped onto the 120-unit `landmark` tier: Main Deck at
 * 150/333, Top Deck at 250/333, antenna from 253/333.
 *
 * Two things are deliberately off, both in the Main Deck, because it is
 * differentiator 3 and at 260 px a faithful deck is a smudge:
 *
 * - **plan x1.2** — 15 units is 41.6 m where the real deck is about 35 m.
 * - **height x1.15** — the boxes span 7.2 units, 20 m against about 18 m.
 *
 * They were kept in step on purpose, which is what a stretch usually costs and
 * here does not: the deck's own width-to-height ends at 2.08 where the real one
 * is about 1.94, so it is 7% blockier and no more. The bill was paid elsewhere —
 * a deck 9 units deep swallows the top of the fourth lattice panel, so the
 * bracing there is drawn to `y = 51` and simply covered.
 */

/**
 * Half-width across the flats at each height. Square plan, so a leg sits at
 * `(±r, y, ±r)` and stands `r * sqrt(2)` from the axis.
 *
 * The deltas are 2.5, 2.4, 2.3, 2.2 over the lower half: near-constant, which is
 * a straight line with the faintest concave bow. That is the whole proportion
 * argument in five numbers — the Eiffel's equivalents fall 4.9, 3.7, 1.6 over a
 * sixth of its height and it has spent its flare before this tower has started.
 *
 * As in `eiffel-tower.ts` the bottom entry starts above 0: a diagonal `strut` is
 * a box centred on its axis and dips a little below its endpoint. The piers
 * cover it.
 */
const LEVELS = [
  { y: 2.4, r: 15.6 },
  { y: 12.3, r: 13.1 },
  { y: 22.2, r: 10.7 },
  { y: 32.1, r: 8.4 },
  { y: 42.0, r: 6.2 },
  { y: 51.0, r: 4.4 }, // Main Deck springs here (150 m)
  { y: 58.2, r: 3.4 }, // and the shaft resumes above it
  { y: 69.6, r: 2.7 },
  { y: 80.0, r: 2.1 },
  { y: 88.4, r: 1.7 }, // Top Deck (250 m)
];

/** The panel the Main Deck occupies. Its legs and bracing are inside the box, so they are not drawn. */
const DECK = 5;

const TOP = 120;
const FOOTING = 2.4;
const SQRT2 = Math.SQRT2;

/** Top of each antenna segment, and the half-width there. 253 m to 333 m, bare. */
const MAST = [
  { y: 93.1, r: 1.35 },
  { y: 99.5, r: 1.15 },
  { y: 105.2, r: 0.95 },
  { y: 110.5, r: 0.75 },
  { y: 115.5, r: 0.55 },
  { y: TOP, r: 0.22 },
];

/**
 * Thickness of a leg in panel `i`. Held deliberately close to the Eiffel's in
 * absolute units on a tower a third narrower, which makes the lattice read
 * denser — true of the real thing, and the only way an orange band gets enough
 * area to be a band rather than a speckle.
 */
const legThickness = (panel: number): number => 2.6 - 0.21875 * panel;

export const tokyoTower: Monument = {
  id: 'tokyo-tower',
  name: 'Tokyo Tower',
  iso: 'JPN',
  lat: 35.659,
  lon: 139.746,
  realHeight: 333,
  tier: 'landmark',
  footprint: 26,

  build(ctx) {
    const { THREE, palette, box, taper, strut, ringWall, around } = ctx;
    const orange = palette.orange; // international orange, as close as 24 colours get
    const white = palette.white; // the warm white; `bone` would read as a hole in shade
    const dark = palette.bark; // glazing and the concrete piers
    const group = new THREE.Group();

    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    /** Bands alternate, orange at the bottom and orange at the top, as the rule requires. */
    const band = (panel: number) => (panel % 2 === 0 ? orange : white);

    // --- the four legs and their piers ---
    const legs = around(4, () => {
      const leg = new THREE.Group();

      const pier = box(4.4, FOOTING, 4.4, dark);
      pier.position.z = LEVELS[0]!.r * SQRT2;
      // The pivot turns this leg out to a corner; undo it here so the pier stays
      // square with the tower rather than standing on its edge.
      pier.rotation.y = -Math.PI / 4;
      leg.add(pier);

      for (let i = 0; i + 1 < LEVELS.length; i++) {
        if (i === DECK) continue; // inside the Main Deck box
        const a = LEVELS[i]!;
        const b = LEVELS[i + 1]!;
        leg.add(strut(at(0, a.y, a.r * SQRT2), at(0, b.y, b.r * SQRT2), legThickness(i), band(i)));
      }
      return leg;
    });
    legs.rotation.y = Math.PI / 4;
    group.add(legs);

    // --- the four faces ---
    // X-bracing in every panel, including the widest ones at the ground. The
    // Eiffel starts its cross bracing only above the first platform because
    // below that its legs are too far apart for an X to read as anything but a
    // fence across the arch. This tower is narrow enough, has no arch to fence,
    // and is genuinely braced all the way down.
    const faces = around(4, () => {
      const face = new THREE.Group();
      for (let i = 0; i + 1 < LEVELS.length; i++) {
        if (i === DECK) continue;
        const a = LEVELS[i]!;
        const b = LEVELS[i + 1]!;
        const width = legThickness(i) * 0.6;
        face.add(strut(at(-a.r, a.y, a.r), at(b.r, b.y, b.r), width, band(i)));
        face.add(strut(at(a.r, a.y, a.r), at(-b.r, b.y, b.r), width, band(i)));
      }
      return face;
    });
    group.add(faces);

    // --- the horizontal chords that give each band a hard edge ---
    // `ringWall` with four sides is a square annulus in one mesh, which four
    // struts would cost four of. Its vertices land on ±X and ±Z, so it wants the
    // same quarter turn the legs got to put its corners on them.
    for (const i of [1, 2, 3, 4, 7, 8]) {
      const level = LEVELS[i]!;
      const outer = level.r * SQRT2 + 0.9;
      const belt = ringWall(outer - 1.8, outer, 1.2, band(i - 1), 4);
      belt.rotation.y = Math.PI / 4;
      belt.position.y = level.y - 1.2;
      group.add(belt);
    }

    // --- Foot Town, the building between the legs ---
    // Differentiator 5, and the cheapest three meshes in the file: where the
    // Eiffel shows sky under its arch, this shows a wall.
    const town = box(24, 7.4, 24, white);
    group.add(town);
    const townGlass = box(24.4, 1.6, 24.4, dark);
    townGlass.position.y = 3.4;
    group.add(townGlass);
    const townRoof = box(24.8, 1.0, 24.8, orange);
    townRoof.position.y = 7.4;
    group.add(townRoof);

    // --- the Main Deck: two storeys, glazed, blocky ---
    // The skirt springs from the leg corners and flares out to the box, so the
    // deck is carried rather than floating. Its bottom half-width is the lattice
    // corner width at y = 49, which is what makes the join look structural.
    const skirt = taper(4.8, 7.5, 2.0, orange, 4);
    skirt.position.y = 49.0;
    group.add(skirt);

    const storey = (base: number, width: number, height: number, glass: number) => {
      const floor = box(width, height, width, white);
      floor.position.y = base;
      group.add(floor);
      // Proud of the wall rather than recessed: an inset band would be invisible,
      // and the outline needs an edge to ink.
      const windows = box(width + 0.4, glass, width + 0.4, dark);
      windows.position.y = base + (height - glass) / 2;
      group.add(windows);
    };
    storey(51.0, 15.0, 3.2, 1.0);
    storey(54.2, 13.9, 3.0, 0.9);

    const cornice = box(15.2, 1.0, 15.2, orange);
    cornice.position.y = 57.2;
    group.add(cornice);

    // --- the Top Deck, small, at 250 m ---
    const collar = taper(2.4, 3.5, 1.2, orange, 4);
    collar.position.y = 88.4;
    group.add(collar);
    storey(89.6, 7.0, 2.8, 0.9);
    const cap = box(6.4, 0.7, 6.4, orange);
    cap.position.y = 92.4;
    group.add(cap);

    // --- the antenna: the top fifth, bare ---
    for (let i = 0; i + 1 < MAST.length; i++) {
      const a = MAST[i]!;
      const b = MAST[i + 1]!;
      const segment = taper(a.r, b.r, b.y - a.y, band(i), 6);
      segment.position.y = a.y;
      group.add(segment);
    }

    return group;
  },
};
