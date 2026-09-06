import type { Monument } from './contract.ts';

/**
 * Tower Bridge.
 *
 * **The crop, and the stretch.** In life the bridge is 244 m of roadway under
 * 65 m towers — 3.75:1, which squeaks under `MAX_ASPECT` on paper and is a trap
 * in practice: fitting all 244 m inside a 55-unit footprint leaves the towers
 * 27 units apart and about 12 wide, and the two things that name this bridge
 * (the tower pair and the walkways slung between them) come out as a thin
 * ladder. So the length is spent where it earns the most.
 *
 * - **Cropped.** Everything is at true proportion except the two side spans,
 *   which are cut to roughly **48%** of their real length — tower face to
 *   abutment face goes from 1.10x the tower height to 0.53x. The approach
 *   viaducts beyond the abutments are cut entirely, and the deck runs on two
 *   units past each abutment so it reads as leaving the frame rather than
 *   stopping. **The suspension chains survive the crop**, and they had to: the
 *   space between tower and shore is the other half of this bridge's outline,
 *   and an empty gap there is a bridge nobody recognises.
 * - **Stretched.** Every height is then multiplied by **1.2x** against the
 *   plan. The towers go from 3.3:1 to 4:1 (still half of Big Ben's 6.4:1, which
 *   is the point — see below), the main span reads a little narrower than life,
 *   and the road-to-walkway gap gets the room it needs to read as two decks.
 *
 * Result: 108 wide, 48 tall, an aspect of 2.25. Filed `landmark` for the
 * footprint and the mesh budget, not for the height, exactly as the Golden Gate
 * is — the tier's 120 units of height are unspendable on anything that has to
 * lie across a river.
 *
 * **Not Big Ben.** They are three miles apart, both Victorian Gothic, both pale
 * stone with pinnacles, and on the same contact sheet, so the differences are
 * deliberate:
 *
 * - **Two towers, not one**, joined at the top. The paired silhouette is the
 *   whole read; nothing else on the sheet has it.
 * - **Stocky, not slender.** 4:1 against Big Ben's 6.4:1, and the corner
 *   turrets are round shafts standing proud of a square mass rather than flush
 *   piers, so the plan reads as a castle keep and not a chimney.
 * - **A steep pyramid roof**, not a spire: 7.8 units over a 6-unit half-width,
 *   ending in a stub finial rather than a lantern and a gilded flèche.
 * - **Portland stone and painted iron** — `bone`, `slate`, `skyBlue`, `white`,
 *   `steel` — against Big Ben's `sand`, `tan`, `gold`. No gilt anywhere, and no
 *   clock. The blue is the one colour a visitor names this bridge by.
 *
 * **What carries the thumbnail.**
 *
 * - The **two towers**: square masses, four round corner turrets each with its
 *   own pointed cap, steep dark roofs above a corbelled cornice.
 * - The **high-level walkways**: two parallel blue spans at 30.8–34.9, two
 *   thirds of the way up, joining the tower tops well clear of the road. They
 *   are modelled as a real pair with a 3.2-unit gap between them, so the
 *   quarter view gets two and the elevation gets one thick band.
 * - The **bascules**: the deck between the towers is a separate, heavier, blue
 *   steel element split by a seam on the centreline, against the dark hung
 *   roadway of the side spans. Colour and girder depth are what say *this part
 *   opens* at 2 pixels per unit; the seam is what says it opens *there*.
 * - The **chains**: straight girder segments with a slight upward camber, not a
 *   catenary. That is true to the bridge and it is also the fastest way to tell
 *   it apart from the Golden Gate's parabola three cells away on the sheet.
 *
 * **Traded away.** The roadway does not pass between real tower legs — at this
 * width the legs come out 2 units thick or the deck 5 wide, and neither
 * survives. Each tower carries a dark pointed portal on its two end faces
 * instead, with the deck running through hidden inside; from any view that
 * matters the arch is a dark hole where the road enters, which is what it looks
 * like. The engine rooms, the land ties and the lattice inside the chains are
 * gone; the meshes went to the turrets and the window slots, which are what the
 * ink line has to draw.
 */

// --- plan, in world units. y = 0 is the river. ---
const TOWER_X = 25;
const TOWER_HALF_X = 6;
const TOWER_HALF_Z = 5.6;

const ABUT_X = 49;
const DECK_END = 54;
const DECK_HALF_Z = 3.3;
/** Deck edge: the chains, the hangers and the railings all stand on this line. */
const EDGE_Z = 3.1;

// --- elevation ---
const PIER_TOP = 3.6;
const PLINTH_TOP = 4.8;
/** The bascule girders are deeper than the hung side spans, and that is the tell. */
const BASCULE_BASE = 5.2;
const SIDE_BASE = 5.6;
const DECK_MID = 6.6;
const ROAD_TOP = 7.4;

const PORTAL_TOP = 11.5;
/** Half-width across the flats of the portal's gable head: 3.46r wide, 3r tall. */
const ARCH_R = 2;
const ARCH_W = ARCH_R * 2 * Math.sqrt(3);

const BAND_A = 18.4;
const SLOT_LOW = 13;
const SLOT_LOW_TOP = 17;
const SLOT_HIGH = 20.4;
const SLOT_HIGH_TOP = 28.4;
const BAND_B = 29.2;

const WALK_BASE = 30.8;
const WALK_TOP = 34;
const WALK_CAP_TOP = 34.9;
const WALK_SPAN = 40;
const WALK_DEPTH = 3;
const WALK_Z = 3.1;

const SHAFT_TOP = 37.4;
const CORNICE_TOP = 39.2;
const ROOF_TOP = 47;
const TOP = 48;

const TURRET_R = 1.3;
const TURRET_AT_X = 5;
const TURRET_AT_Z = 4.6;
const TURRET_TOP = 41.2;
const TURRET_CAP_TOP = 45;

const ABUT_TOP = 17;
const ABUT_CAP_TOP = 20.5;

/**
 * The suspension chain, tower face to abutment top.
 *
 * Straight segments with about 0.6 units of upward camber at the joints — Tower
 * Bridge's chains are stiff girders in tension, not hanging rope, and they bow
 * the opposite way to every cable-stayed thing on the sheet.
 */
const CHAIN = [
  { x: 31, y: 30 },
  { x: 37, y: 26.4 },
  { x: 43, y: 21.9 },
  { x: ABUT_X, y: ABUT_TOP },
];
const CHAIN_THICKNESS = 1;
const HANGERS = [34, 40, 46];

function chainY(x: number): number {
  const distance = Math.abs(x);
  for (let i = 1; i < CHAIN.length; i++) {
    const a = CHAIN[i - 1]!;
    const b = CHAIN[i]!;
    if (distance <= b.x) return a.y + ((b.y - a.y) * (distance - a.x)) / (b.x - a.x);
  }
  return CHAIN[CHAIN.length - 1]!.y;
}

export const towerBridge: Monument = {
  id: 'tower-bridge',
  name: 'Tower Bridge',
  iso: 'GBR',
  lat: 51.506,
  lon: -0.075,
  realHeight: 65,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;
    const stone = palette.bone;
    const granite = palette.slate;
    const paint = palette.skyBlue;
    const trim = palette.white;
    const iron = palette.steel;

    const group = new THREE.Group();

    // -----------------------------------------------------------------------
    // The two main towers
    // -----------------------------------------------------------------------
    for (const side of [1, -1]) {
      const x = side * TOWER_X;

      // River pier, battered so it reads as sitting in water rather than on it.
      const pier = taper(7.8, 7, PIER_TOP, granite, 4);
      pier.position.x = x;
      group.add(pier);

      const plinth = box(13.6, PLINTH_TOP - PIER_TOP, 12.8, stone);
      plinth.position.set(x, PIER_TOP, 0);
      group.add(plinth);

      const body = box(TOWER_HALF_X * 2, SHAFT_TOP - PLINTH_TOP, TOWER_HALF_Z * 2, stone);
      body.position.set(x, PLINTH_TOP, 0);
      group.add(body);

      // --- the roadway portal, on both end faces ---
      // A dark reveal with a gable head. The deck runs through the tower hidden
      // inside; what shows is a pointed hole where the road goes in, which is
      // the whole of what a real portal reads as at this size.
      for (const face of [1, -1]) {
        const reveal = box(0.8, PORTAL_TOP - PLINTH_TOP, ARCH_W, iron);
        reveal.position.set(x + face * TOWER_HALF_X, PLINTH_TOP, 0);
        group.add(reveal);

        // A three-sided `column` on its side is a gable: apex up, spanning
        // +/-1.73r across and 3r tall. It is built lying across z and then
        // swung a quarter turn so it lies across x instead — one wrapper group,
        // because the two rotations do not compose in a single Euler.
        const head = new THREE.Group();
        head.rotation.y = face * (Math.PI / 2);
        const gable = column(ARCH_R, 0.8, iron, 3);
        gable.rotation.x = Math.PI / 2;
        gable.position.y = PORTAL_TOP + ARCH_R;
        head.add(gable);
        head.position.x = x + face * (TOWER_HALF_X - 0.4);
        group.add(head);
      }

      // --- string courses. The lower one is flush with the turrets; the upper
      // one corbels out past them, because the walkways have to look carried.
      const lower = box(TOWER_HALF_X * 2 + 0.7, 1.1, TOWER_HALF_Z * 2 + 0.7, stone);
      lower.position.set(x, BAND_A, 0);
      group.add(lower);

      const gallery = box(TOWER_HALF_X * 2 + 1.6, 1.6, TOWER_HALF_Z * 2 + 1.6, stone);
      gallery.position.set(x, BAND_B, 0);
      group.add(gallery);

      // --- window slots, raised rather than recessed: a shallow recess is
      // invisible under a cel ramp, a proud dark strip gets its own ink line.
      for (const z of [1, -1]) {
        for (const offset of [-2.8, 0, 2.8]) {
          const slot = box(1.7, SLOT_HIGH_TOP - SLOT_HIGH, 0.7, iron);
          slot.position.set(x + offset, SLOT_HIGH, z * TOWER_HALF_Z);
          group.add(slot);
        }
        for (const offset of [-2.2, 2.2]) {
          const slot = box(1.7, SLOT_LOW_TOP - SLOT_LOW, 0.7, iron);
          slot.position.set(x + offset, SLOT_LOW, z * TOWER_HALF_Z);
          group.add(slot);
        }
      }

      // --- corner turrets. Round shafts standing proud of the square mass,
      // running the full height and breaking through the cornice with their own
      // caps. This is the silhouette, and it is where the mesh budget went.
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          const tx = x + sx * TURRET_AT_X;
          const tz = sz * TURRET_AT_Z;

          const shaft = column(TURRET_R, TURRET_TOP - PLINTH_TOP, stone, 8);
          shaft.position.set(tx, PLINTH_TOP, tz);
          group.add(shaft);

          const cap = taper(TURRET_R + 0.2, 0.1, TURRET_CAP_TOP - TURRET_TOP, iron, 8);
          cap.position.set(tx, TURRET_TOP, tz);
          group.add(cap);
        }
      }

      const cornice = box(TOWER_HALF_X * 2 + 1.6, CORNICE_TOP - SHAFT_TOP, TOWER_HALF_Z * 2 + 1.6, stone);
      cornice.position.set(x, SHAFT_TOP, 0);
      group.add(cornice);

      const roof = taper(6, 0.5, ROOF_TOP - CORNICE_TOP, iron, 4);
      roof.position.set(x, CORNICE_TOP, 0);
      group.add(roof);

      const finial = taper(0.5, 0.08, TOP - ROOF_TOP, iron, 4);
      finial.position.set(x, ROOF_TOP, 0);
      group.add(finial);
    }

    // -----------------------------------------------------------------------
    // High-level walkways: two of them, with daylight between
    // -----------------------------------------------------------------------
    for (const z of [1, -1]) {
      const girder = box(WALK_SPAN, WALK_TOP - WALK_BASE, WALK_DEPTH, paint);
      girder.position.set(0, WALK_BASE, z * WALK_Z);
      group.add(girder);

      const glazing = box(WALK_SPAN - 4, 1.7, 0.5, iron);
      glazing.position.set(0, WALK_BASE + 0.8, z * (WALK_Z + WALK_DEPTH / 2));
      group.add(glazing);

      const cap = box(WALK_SPAN + 0.8, WALK_CAP_TOP - WALK_TOP, WALK_DEPTH + 0.6, trim);
      cap.position.set(0, WALK_TOP, z * WALK_Z);
      group.add(cap);
    }

    // -----------------------------------------------------------------------
    // Deck
    // -----------------------------------------------------------------------
    // The bascules: two leaves parted by a seam on the centreline, in painted
    // steel and a third deeper than the roadway either side of them.
    // Half the seam. 1.6 units wide is far more than a real expansion joint and
    // that is the point: below about three pixels the split stops existing, and
    // the split is the whole reason this section of deck is modelled apart.
    const LEAF_GAP = 0.8;
    const LEAF_INNER = TOWER_X - TOWER_HALF_X;
    const leafLength = LEAF_INNER - LEAF_GAP;
    for (const side of [1, -1]) {
      const centre = side * (LEAF_GAP + leafLength / 2);

      const leaf = box(leafLength, DECK_MID - BASCULE_BASE, DECK_HALF_Z * 2, paint);
      leaf.position.set(centre, BASCULE_BASE, 0);
      group.add(leaf);

      const road = box(leafLength, ROAD_TOP - DECK_MID, DECK_HALF_Z * 2 - 0.6, iron);
      road.position.set(centre, DECK_MID, 0);
      group.add(road);
    }

    // The hung side spans, running through the towers and two units past the
    // abutments so the roadway leaves the frame instead of stopping in it.
    const sideLength = DECK_END - LEAF_INNER;
    for (const side of [1, -1]) {
      const centre = side * (LEAF_INNER + sideLength / 2);

      const girder = box(sideLength, DECK_MID - SIDE_BASE, DECK_HALF_Z * 2, iron);
      girder.position.set(centre, SIDE_BASE, 0);
      group.add(girder);

      const road = box(sideLength, ROAD_TOP - DECK_MID, DECK_HALF_Z * 2 - 0.6, iron);
      road.position.set(centre, DECK_MID, 0);
      group.add(road);

      for (const z of [1, -1]) {
        const rail = box(sideLength, 1, 0.5, trim);
        rail.position.set(centre, ROAD_TOP, z * EDGE_Z);
        group.add(rail);
      }
    }

    // -----------------------------------------------------------------------
    // Abutment towers, where the chains land
    // -----------------------------------------------------------------------
    for (const side of [1, -1]) {
      const x = side * ABUT_X;

      const base = taper(4.4, 4, 2.4, granite, 4);
      base.position.x = x;
      group.add(base);

      const shaft = box(7.2, ABUT_TOP - 2.4, 8.8, stone);
      shaft.position.set(x, 2.4, 0);
      group.add(shaft);

      const band = box(8.4, 1, 9.6, stone);
      band.position.set(x, 12.5, 0);
      group.add(band);

      const cap = taper(4, 1.5, ABUT_CAP_TOP - ABUT_TOP, iron, 4);
      cap.position.set(x, ABUT_TOP, 0);
      group.add(cap);
    }

    // -----------------------------------------------------------------------
    // Chains and hangers
    // -----------------------------------------------------------------------
    for (const side of [1, -1]) {
      for (const z of [1, -1]) {
        for (let i = 1; i < CHAIN.length; i++) {
          const a = CHAIN[i - 1]!;
          const b = CHAIN[i]!;
          group.add(
            strut(
              new THREE.Vector3(side * a.x, a.y, z * EDGE_Z),
              new THREE.Vector3(side * b.x, b.y, z * EDGE_Z),
              CHAIN_THICKNESS,
              paint,
            ),
          );
        }

        for (const at of HANGERS) {
          const hanger = box(0.45, chainY(at) - ROAD_TOP, 0.45, paint);
          hanger.position.set(side * at, ROAD_TOP, z * EDGE_Z);
          group.add(hanger);
        }
      }
    }

    return group;
  },
};
