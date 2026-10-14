import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Petronas Towers.
 *
 * Four things survive to a thumbnail: two identical towers standing apart (the
 * silhouette has a hole in it, translated rather than mirrored since the real
 * pair is one design built twice); a double-decker skybridge at 37% of the
 * height (two horizontal bars with a slot of sky between them, with the
 * two-legged arch under it), which stitches the pair together at the waist; the
 * eight-pointed plan (two squares crossed at 45 degrees, with the notches
 * filled by an octagonal core turned so a flat sits in each notch; three meshes
 * a storey-band, putting five vertical steel piers on every face); and the
 * stepped setbacks (above floor 60 the shaft telescopes through four rings to
 * 53% of its width, each capped with a dark collar that oversails the tier
 * above) and the tapering mast, 11.3 units or a sixth of the model, which is
 * what counted as architectural height for the 1998 record.
 *
 * Tier `tower`: 452 m against the Empire State's 443 m is the same height to
 * within 2%, so filing Petronas at `landmark` would say it is 71% taller. A pair
 * reads bigger than a single at the same height anyway. Overall width 30.29
 * units on 70 tall is an aspect of 0.43 against a cap of 4; the declared
 * footprint is 15.2 and the model reaches 15.14.
 *
 * The whole plan is scaled 1.3x against the height (towers, gap, bridge span
 * and star together), so the proportions are preserved: the gap stays 1.27
 * tower-widths, the bridge stays 58.4 m of the 104.4 m between axes. At true
 * scale a tower face carries nine separable vertical bands of 0.79 units each;
 * at 1.3x they are 1.03. The tower is still 7.6 : 1, the most slender monument.
 *
 * Traded away: the notch infills are one chord of an octagon rather than
 * semicircles (eight circles per band would be 1,920 triangles and 80 meshes);
 * the skybridge is 2.2x too tall (2.8 units: deck 0.9, slot 1.0, deck 0.9, plus
 * a 0.3 canopy), because two bars touching is one bar; the horizontal sunshades
 * are gone (88 of them would be a grey wash), leaving the four setback collars,
 * the lobby band, the bridge band and the arch springing band; and the podium is
 * a plain two-step block (4.2 units, 6% of the height).
 *
 * Distinct from the other tall towers by being two masses, having a horizontal
 * element, a cool `slate` curtain wall with white piers, an eight-pointed plan,
 * two needles and a symmetric crown. Squinted at, it is a capital H.
 */

// --- Scale. The vertical and the horizontal have different metres. ---

/** Metres to the tip of the pinnacle, and the 70 units of the `tower` tier over it. */
const UNIT = 70 / 451.9;
/** The plan's metre: 1.3x the height's, uniformly, so plan ratios are untouched. */
const PLAN = UNIT * 1.3;

/** Half the 104.4 m between the two tower axes. */
const HALF_SPACING = 52.2 * PLAN;
/** Half the 46 m plan: the radius of the eight star points at the shaft. */
const SHAFT_POINT = 23 * PLAN;

/**
 * The octagonal core's apothem, as a fraction of the point radius. Two crossed
 * squares meet at 0.765 of the point radius, so anything above that bulges out
 * of the notch like the infill circles do. 0.85 leaves the core's corners at
 * 0.92, inside the points, and the bulge 0.39 units at the shaft.
 */
const NOTCH = 0.85;

/** A square's apothem against its corner radius. The corners are the star points. */
const SQUARE = Math.SQRT1_2;

/**
 * A setback collar's apothem, as a multiple of the point radius of the tier it
 * caps. At 1.03 its corners land at 1.115 of that, just inside the tier below's
 * points (each tier is about 0.88 of the one below), so every collar oversails
 * upward and none flanges outward.
 */
const COLLAR = 1.03;
/** How tall each of those collars stands. */
const COLLAR_HEIGHT = 0.45;

// --- elevation ---
const APRON_TOP = 0.9;
const PODIUM_TOP = 4.2;
const CORNICE_TOP = 4.55;
const LOBBY_TOP = 6.1;
/** Floor 29, where the two legs of the skybridge arch spring from the towers. */
const LEG_FOOT = 18.6;
/** Floors 41 and 42, at 170 m. */
const BRIDGE_BASE = 24.95;
const DECK = 0.9;
const SLOT = 1.0;
const CANOPY = 0.3;
const BRIDGE_TOP = BRIDGE_BASE + DECK + SLOT + DECK + CANOPY;
/** Floor 88, where the shaft stops and the mast starts. */
const ROOF = 57.2;
const MAST_BASE = 58.7;
const TOP = 70;

/**
 * The shaft and the four setbacks above floor 60, by the radius of their star
 * points. The top tier is 53% of the shaft.
 */
const LEVELS = [
  { base: 0, top: 38.7, point: SHAFT_POINT },
  { base: 38.7, top: 45.2, point: SHAFT_POINT * 0.896 },
  { base: 45.2, top: 50.4, point: SHAFT_POINT * 0.782 },
  { base: 50.4, top: 54.3, point: SHAFT_POINT * 0.659 },
  { base: 54.3, top: ROOF, point: SHAFT_POINT * 0.531 },
];
const CROWN_POINT = SHAFT_POINT * 0.531;

/** Half the bridge box: the clear gap between the towers, plus a bite into each. */
const BRIDGE_HALF = HALF_SPACING - SHAFT_POINT + 0.75;
const BRIDGE_DEPTH = 1.4;

export const petronasTowers: Monument = {
  id: 'petronas-towers',
  name: 'Petronas Towers',
  iso: 'MYS',
  lat: 3.158,
  lon: 101.712,
  realHeight: 452,
  tier: 'tower',
  footprint: 15.2,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;

    // Dark vision glass between the piers: `slate`, the only true mid-grey, not
    // the `bone` the other tall towers use.
    const glass = palette.slate;
    // Stainless steel: the eight points, the bands, the bridge and the mast.
    // `white`, not `bone`: against `slate`, `bone` is two ramp steps away and the
    // piers dissolve into the glass.
    const skin = palette.white;
    // Setback collars, the crown, and the line on top of the podium.
    const dark = palette.steel;
    const mall = palette.tan;
    const park = palette.green;

    const group = new THREE.Group();

    /** A band of the plan's octagonal core, turned by half a segment so a flat sits in each notch. */
    const core = (apothem: number, base: number, height: number, color: number) => {
      const mesh = column(apothem, height, color, 8);
      mesh.rotation.y = Math.PI / 8;
      mesh.position.y = base;
      return mesh;
    };

    const buildTower = (side: number) => {
      const tower = new THREE.Group();

      // --- shaft and setbacks: one core and two crossed squares per band. A
      // setback's shaft rises out of the top of its collar, so the glass core,
      // the piers and the collar's underside are not three colours in one plane. ---
      for (const [index, level] of LEVELS.entries()) {
        const base = index === 0 ? level.base : level.base + COLLAR_HEIGHT;
        const height = level.top - base;
        tower.add(core(level.point * NOTCH, base, height, glass));
        // Turn 0 puts a flat on +Z and corners on the diagonals; turn 45 puts corners on +Z and +X.
        for (const turn of [0, Math.PI / 4]) {
          const square = column(level.point * SQUARE, height, skin, 4);
          square.rotation.y = turn;
          square.position.y = base;
          tower.add(square);
        }
      }

      // --- the dark collar under each setback ---
      for (const level of LEVELS.slice(1)) {
        tower.add(core(level.point * COLLAR, level.base, COLLAR_HEIGHT, dark));
      }

      // --- the three horizontals on the shaft, proud of the glass so each gets its own outline ---
      const shaftCore = SHAFT_POINT * NOTCH;
      tower.add(core(shaftCore + 0.16, CORNICE_TOP, LOBBY_TOP - CORNICE_TOP, skin));
      tower.add(core(shaftCore + 0.1, LEG_FOOT - 0.25, 0.6, skin));
      tower.add(core(shaftCore + 0.1, BRIDGE_BASE, BRIDGE_TOP - BRIDGE_BASE, skin));

      // --- the crown: the last narrowing, and the only sloped face on the tower ---
      const crown = taper(CROWN_POINT * COLLAR, 1.05, MAST_BASE - ROOF, dark, 8);
      crown.rotation.y = Math.PI / 8;
      crown.position.y = ROOF;
      tower.add(crown);

      // --- the pinnacle: 11.3 units, a sixth of the model, with the ring at its foot and the bead partway up ---
      tower.add(core(1.25, MAST_BASE, 0.5, skin));

      const lower = taper(0.62, 0.4, 4.3, skin, 6);
      lower.position.y = MAST_BASE + 0.5;
      tower.add(lower);

      const bead = column(0.58, 0.45, dark, 6);
      bead.position.y = 63.5;
      tower.add(bead);

      const upper = taper(0.36, 0.17, 4.1, skin, 6);
      upper.position.y = 63.95;
      tower.add(upper);

      const needle = taper(0.17, 0.045, TOP - 68.05, skin, 4);
      needle.position.y = 68.05;
      tower.add(needle);

      tower.position.x = side * HALF_SPACING;
      return tower;
    };

    group.add(buildTower(-1));
    group.add(buildTower(1));

    // --- the base: park, mall podium, and one dark line on top. It makes the pair
    // one object at the bottom as the bridge does at the waist. The apron
    // oversails the podium by a full unit, the least that leaves green visible,
    // and its ends reach `PROUD` past the towers' outer piers. ---
    group.add(box(27.6 + PROUD * 2, APRON_TOP, 11.4, park));

    const podium = box(25, PODIUM_TOP - APRON_TOP, 9.4, mall);
    podium.position.y = APRON_TOP;
    group.add(podium);

    const cornice = box(25.4, CORNICE_TOP - PODIUM_TOP, 9.8, dark);
    cornice.position.y = PODIUM_TOP;
    group.add(cornice);

    // --- the skybridge ---
    for (const base of [BRIDGE_BASE, BRIDGE_BASE + DECK + SLOT]) {
      const deck = box(BRIDGE_HALF * 2, DECK, BRIDGE_DEPTH, skin);
      deck.position.y = base;
      group.add(deck);
    }

    // Two posts in the slot and no more: the open sky between the decks makes it read as two decks.
    for (const x of [-3.4, 3.4]) {
      const post = box(0.5, SLOT, 1, dark);
      post.position.set(x, BRIDGE_BASE + DECK, 0);
      group.add(post);
    }

    const canopy = box(BRIDGE_HALF * 2, CANOPY, BRIDGE_DEPTH + 0.3, skin);
    canopy.position.y = BRIDGE_TOP - CANOPY;
    group.add(canopy);

    // The two-hinged arch: one leg out of each tower at floor 29, meeting under
    // the middle of the bridge. Struts, because they lean.
    for (const x of [-1, 1]) {
      group.add(
        strut(
          new THREE.Vector3(x * 6.35, LEG_FOOT, 0),
          new THREE.Vector3(0, BRIDGE_BASE, 0),
          0.55,
          skin,
        ),
      );
    }

    return group;
  },
};
