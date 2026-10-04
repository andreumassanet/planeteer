import { PROUD } from './contract.ts';
import type { Mesh, Monument } from './contract.ts';

/**
 * Tikal Temple I — the Temple of the Great Jaguar, on the east side of the
 * Great Plaza.
 *
 * Its neighbour on this sheet is El Castillo (`chichen-itza.ts`), so what
 * matters is what Tikal is and Chichen is not:
 *
 * 1. **Steep.** El Castillo rises at about 55 degrees and is wider than it is
 *    tall; Temple I is a tower of terraces. The body here rises at about 76
 *    degrees over its nine terraces and the whole model is 40 tall on a
 *    25-unit base, where El Castillo is 40 on 70. At true proportions the 47 m
 *    temple stands on a base of about 30 m, and that is what this keeps.
 * 2. **The roof comb.** The temple on the summit carries a stepped crest of
 *    masonry on its back half, as tall as the temple under it, which once
 *    bore a giant figure of the enthroned king. A third of the model's height
 *    is temple and comb, and it is the silhouette everyone knows from the
 *    photographs taken across the plaza from Temple II.
 * 3. **Inset corners.** Every Petén terrace steps in at its corners, so each
 *    one here is two crossing frusta and two crossing aprons, a plus in plan:
 *    eighteen re-entrant corners down each arris instead of one straight edge,
 *    which is what separates this masonry from a smooth stepped cone.
 * 4. **One stair, no balustrades**, running up the west face over the
 *    terraces, then three more steps up the temple's own platform to a single
 *    doorway under a wooden lintel. Seventeen steps, not the real flight's
 *    hundred: seventeen because no step top then shares a plane with a
 *    terrace's apron (the nearest miss is 0.16), and a shared plane in two
 *    tones is a z-fight.
 *
 * **Orientation.** `placement.ts` turns +Z north and +X west, and the stair
 * faces west onto the Great Plaza, so the model is drawn with its stair on +Z
 * and turned a quarter (`rotation.y = PI / 2`) before it is merged. The contact
 * sheet's front view therefore sees its north flank in profile, which is the
 * terraced arris and the comb, and its quarter view sees the stair.
 *
 * **Scale.** One scale throughout, 0.85 units a metre: 47 m is the comb's top
 * at 40. Body 24.75 (nine terraces of 2.75), the temple's platform to 27, the
 * temple to 33, the comb to 40. `building` and not `tower`, for Chichen's
 * reason inverted: at the tower tier's 70 units the base would want a 26-unit
 * half-width and a 37-unit half-diagonal, past that tier's 28-unit footprint,
 * and the only way in would be to steepen a pyramid that is already steep.
 *
 * **Colour.** Grey limestone is `tan` lifted, as at Chichen, with the aprons
 * and the stair a tone lighter because they catch the sun; the comb a tone
 * darker, because it is the weathered, lichened part; `bark` for the doorway
 * and `brown` for its sapodilla lintel; grass on the unrestored rear ledges.
 *
 * Drawn through `ctx.merge` as one mesh a colour.
 */

// --- the body ---------------------------------------------------------------
const TERRACES = 9;
const TALUD = 2.1;
const APRON = 0.65;
const TERRACE = TALUD + APRON;
const BODY = TERRACES * TERRACE;
/** Half-width across the flats at the ground, on the arms of the plus. */
const BASE = 12.5;
/** Each terrace starts this much further in than the one below. */
const INSET = 0.75;
/** How far a terrace wall leans in over its own height. */
const LEAN = 0.45;
/** The apron stands this far proud of the top of the wall under it. */
const LIP = 0.3;
/** How far a corner is stepped in from the arms. */
const CORNER = 1.5;

const bottomOf = (terrace: number): number => BASE - INSET * terrace;
const SUMMIT = bottomOf(TERRACES - 1) - LEAN + LIP;

// --- the stair --------------------------------------------------------------
const STEPS = 17;
const STAIR_HALF = 3.2;
const STAIR_FOOT = BASE + 3.5;
const STAIR_HEAD = SUMMIT + 0.5;
const stairZ = (y: number): number => STAIR_FOOT - ((STAIR_FOOT - STAIR_HEAD) * y) / BODY;
/** Deep enough that the back of every step is buried in the terraces behind it. */
const STEP_DEPTH = 4.5;

// --- the temple on the summit -------------------------------------------------
/** Two tiers of platform, the second set back. */
const PLATFORM = [
  { half: 5.4, z: -0.4, top: BODY + 1.25 },
  { half: 4.7, z: -0.8, top: BODY + 2.25 },
];
const FLOOR = PLATFORM[1]!.top;
const TEMPLE = { halfX: 4.1, halfZ: 3.4, z: -1.0 };
const WALL_TOP = FLOOR + 3.4;
const MEDIAL_TOP = WALL_TOP + 0.5;
const FRIEZE_TOP = MEDIAL_TOP + 1.6;
const CORNICE_TOP = FRIEZE_TOP + 0.5;
const DOOR = { half: 0.9, height: 2.5 };

/** The comb: three tiers, each narrower and thinner, standing on the back of the roof. */
const COMB = [
  { half: 3.5, depth: 2.8, top: CORNICE_TOP + 3.0 },
  { half: 2.9, depth: 2.4, top: CORNICE_TOP + 5.3 },
  { half: 2.2, depth: 2.0, top: 40 },
];
/** The comb's back face lines up with the temple's back wall, less a step. */
const COMB_BACK = TEMPLE.z - TEMPLE.halfZ + 0.6;

export const tikalTempleI: Monument = {
  id: 'tikal-temple-i',
  name: 'Tikal Temple I',
  iso: 'GTM',
  lat: 17.222,
  lon: -89.6237,
  realHeight: 47,
  tier: 'building',
  footprint: 17,

  build(ctx) {
    const { THREE, palette, tone, box, taper } = ctx;
    const stone = tone(palette.tan, 1.12);
    const apron = tone(palette.tan, 1.28);
    const stair = tone(palette.tan, 1.22);
    const comb = tone(palette.tan, 0.94);
    const relief = tone(palette.tan, 1.08);
    const dark = palette.bark;
    const lintel = palette.brown;
    const grass = [palette.green, palette.darkOlive];

    const draft = new THREE.Group();
    // The stair is drawn on +Z and the whole is turned to face west; see above.
    const site = new THREE.Group();
    site.rotation.y = Math.PI / 2;
    draft.add(site);
    const placed = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      site.add(mesh);
      return mesh;
    };

    // --- nine terraces, each a plus of two frusta under a plus of two aprons ---
    for (let i = 0; i < TERRACES; i++) {
      const bottom = bottomOf(i);
      const y = i * TERRACE;
      // The arm running across x is full width in x and stepped in in z, and
      // the other the reverse. No rotation on either, so the scale lands on
      // the axes it is written in.
      const narrow = (bottom - CORNER) / bottom;
      const across = placed(taper(bottom, bottom - LEAN, TALUD, stone, 4), 0, y, 0);
      across.scale.set(1, 1, narrow);
      const along = placed(taper(bottom, bottom - LEAN, TALUD, stone, 4), 0, y, 0);
      along.scale.set(narrow, 1, 1);

      const wide = (bottom - LEAN + LIP) * 2;
      const short = wide - CORNER * 2;
      placed(box(wide, APRON, short, apron), 0, y + TALUD, 0);
      placed(box(short, APRON, wide, apron), 0, y + TALUD, 0);
    }

    // --- the stair up the west face ---
    const rise = BODY / STEPS;
    for (let k = 0; k < STEPS; k++) {
      const nose = stairZ(k * rise);
      // The last stops `PROUD` under the summit, whose apron it would share a
      // plane with.
      const height = k === STEPS - 1 ? rise - PROUD : rise;
      placed(box(STAIR_HALF * 2, height, STEP_DEPTH, stair), 0, k * rise, nose - STEP_DEPTH / 2);
    }

    // --- the temple's platform, and the stair's last three steps up it ---
    let under = BODY;
    for (const tier of PLATFORM) {
      placed(box(tier.half * 2, tier.top - under, tier.half * 2, stone), 0, under, tier.z);
      under = tier.top;
    }
    const front = PLATFORM[0]!.z + PLATFORM[0]!.half;
    const landing = (FLOOR - BODY) / 3;
    for (let k = 0; k < 3; k++) {
      // Each tread a little further back and `PROUD` short of the level it
      // arrives at, so no tread top is a platform's top in another tone.
      placed(box(STAIR_HALF * 1.6, landing * (k + 1) - PROUD, 0.7, stair), 0, BODY, front + 0.7 * (2 - k) + 0.35);
    }

    // --- the temple: walls, a medial moulding, the sloping frieze, a cornice ---
    placed(box(TEMPLE.halfX * 2, WALL_TOP - FLOOR, TEMPLE.halfZ * 2, stone), 0, FLOOR, TEMPLE.z);
    const face = TEMPLE.z + TEMPLE.halfZ;
    // A dark panel standing proud of the wall reads as the doorway into shadow.
    placed(box(DOOR.half * 2, DOOR.height, 0.3, dark), 0, FLOOR, face + 0.15 - PROUD / 2);
    placed(box(DOOR.half * 2 + 0.8, 0.4, 0.5, lintel), 0, FLOOR + DOOR.height, face + 0.1);
    placed(box((TEMPLE.halfX + 0.35) * 2, MEDIAL_TOP - WALL_TOP, (TEMPLE.halfZ + 0.35) * 2, apron), 0, WALL_TOP, TEMPLE.z);
    // The upper facade leans in, as a Maya temple's does over its moulding.
    const frieze = placed(taper(TEMPLE.halfX + 0.1, TEMPLE.halfX - 0.5, FRIEZE_TOP - MEDIAL_TOP, stone, 4), 0, MEDIAL_TOP, TEMPLE.z);
    frieze.scale.set(1, 1, (TEMPLE.halfZ + 0.1) / (TEMPLE.halfX + 0.1));
    placed(box((TEMPLE.halfX + 0.3) * 2, CORNICE_TOP - FRIEZE_TOP, (TEMPLE.halfZ + 0.3) * 2, apron), 0, FRIEZE_TOP, TEMPLE.z);

    // --- the roof comb, stepped back as it rises ---
    let base = CORNICE_TOP;
    for (const tier of COMB) {
      placed(box(tier.half * 2, tier.top - base, tier.depth, comb), 0, base, COMB_BACK + tier.depth / 2);
      base = tier.top;
    }
    // What is left of the enthroned king on the comb's west face: the throne
    // on the first tier, his body and his headdress on the second. Each panel
    // stands proud of its tier's face.
    const faceOf = (tier: number): number => COMB_BACK + COMB[tier]!.depth;
    placed(box(4.4, 1.0, 0.5, relief), 0, CORNICE_TOP + 0.5, faceOf(0) + 0.25);
    placed(box(2.2, 1.3, 0.5, relief), 0, CORNICE_TOP + 1.7, faceOf(0) + 0.25);
    for (const x of [-1.9, 1.9]) placed(box(0.9, 1.6, 0.4, relief), x, CORNICE_TOP + 1.2, faceOf(0) + 0.2);
    placed(box(1.6, 1.4, 0.5, relief), 0, COMB[0]!.top + 0.4, faceOf(1) + 0.25);
    placed(box(3.4, 0.6, 0.4, relief), 0, COMB[0]!.top + 1.6, faceOf(1) + 0.2);

    // --- grass on the rear ledges, where the restorers left the facing as found ---
    const tufts: [number, number][] = [[1, -6], [2, 4.5], [3, -2.5], [4, 6], [5, -4], [6, 1.5], [7, -3]];
    tufts.forEach(([terrace, x], index) => {
      // The ledge is 0.6 deep, from the wall's foot to the apron's lip.
      placed(taper(0.5, 0.3, 0.7, grass[index % 2]!, 5), x, terrace * TERRACE, -(bottomOf(terrace) + 0.15));
    });

    return ctx.merge(draft);
  },
};
