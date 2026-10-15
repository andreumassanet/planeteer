import type { Monument } from './contract.ts';

/**
 * Tokyo Tower.
 *
 * An avowed copy of the Eiffel Tower (square plan, four legs, riveted lattice,
 * thirteen metres taller), so it is built for the differences that survive at
 * thumbnail size:
 * 1. Colour: international orange and white in alternating bands against the
 *    Eiffel's flat bronze; `orange` and `white` share no palette entry with its
 *    `brown` and `darkOlive`, and both are warm enough to survive shade.
 * 2. Proportion: 88.8 m across 333 m (29% narrower than the Eiffel) with nearly
 *    straight legs. The radius profiles cross: 0.72 of the Eiffel's at the base,
 *    1.09 at a quarter height and 0.53 at five sixths.
 * 3. Two fat decks instead of three thin ones: the Main Deck is a two-storey
 *    building clamped round the shaft at 150 m, the small Top Deck is at 250 m.
 * 4. A bare, unlatticed antenna over the top fifth.
 * 5. No great arch: the Foot Town building fills the space between the legs.
 *
 * Heights are the real tower's fractions of 333 m mapped onto the 120-unit
 * `landmark` tier (Main Deck at 150/333, Top Deck at 250/333, antenna from
 * 253/333); the half-diagonal test gives 0.42 against `MAX_ASPECT` 4. The Main
 * Deck is deliberately off in plan (x1.2, 15 units for a real ~35 m) and height
 * (x1.15, 7.2 units), so it is 7% blockier than life (width-to-height 2.08
 * against 1.94) and no more. Because a deck 9 units deep swallows the top of
 * the fourth lattice panel, the bracing there is drawn to `y = 51` and covered.
 */

/**
 * Half-width across the flats at each height. Square plan, so a leg sits at
 * `(±r, y, ±r)` and stands `r * sqrt(2)` from the axis.
 *
 * The deltas over the lower half (2.5, 2.4, 2.3, 2.2) are near-constant, a
 * straight line with the faintest concave bow, where the Eiffel's fall 4.9,
 * 3.7, 1.6. As in `eiffel-tower.ts` the bottom entry starts above 0, because a
 * diagonal `strut` dips a little below its endpoint; the piers cover it.
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
 * Thickness of a leg in panel `i`. Held close to the Eiffel's in absolute units
 * on a narrower tower, so the lattice reads denser and an orange band gets enough
 * area to be a band.
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
  surface: 'metal',
  surfaces: { bark: 'none' },
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
      // The pivot turns this leg out to a corner; undo it so the pier stays square with the tower.
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
    // X-bracing in every panel, including the widest at the ground: this tower is narrow enough, has no arch to fence, and is braced all the way down.
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
    // `ringWall` with four sides is a square annulus in one mesh (four struts would cost four); it wants the same quarter turn as the legs.
    for (const i of [1, 2, 3, 4, 7, 8]) {
      const level = LEVELS[i]!;
      const outer = level.r * SQRT2 + 0.9;
      const belt = ringWall(outer - 1.8, outer, 1.2, band(i - 1), 4);
      belt.rotation.y = Math.PI / 4;
      belt.position.y = level.y - 1.2;
      group.add(belt);
    }

    // --- Foot Town, the building between the legs: where the Eiffel shows sky under its arch, this shows a wall ---
    const town = box(24, 7.4, 24, white);
    group.add(town);
    const townGlass = box(24.4, 1.6, 24.4, dark);
    townGlass.position.y = 3.4;
    group.add(townGlass);
    const townRoof = box(24.8, 1.0, 24.8, orange);
    townRoof.position.y = 7.4;
    group.add(townRoof);

    // --- the Main Deck: two storeys, glazed, blocky. The skirt springs from the leg
    // corners (the lattice corner width at y = 49) and flares out to the box, so the deck is carried. ---
    const skirt = taper(4.8, 7.5, 2.0, orange, 4);
    skirt.position.y = 49.0;
    group.add(skirt);

    const storey = (base: number, width: number, height: number, glass: number) => {
      const floor = box(width, height, width, white);
      floor.position.y = base;
      group.add(floor);
      // Proud of the wall rather than recessed, so the outline has an edge to ink.
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
