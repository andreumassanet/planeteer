import type { Mesh, Monument, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Amphitheatre of El Jem — Thysdrus, Tunisia.
 *
 * **Why Tunisia:** the map had the Colosseum, the Parthenon and Baalbek round
 * the Mediterranean and nothing between Morocco and Egypt. El Jem is the third
 * largest amphitheatre the Romans built and, unlike the Colosseum, its outer
 * wall still stands almost all the way round: an olive-country town of
 * one-storey houses with a wall of three arcades rising out of the middle of it.
 *
 * Three things name it, and they are what separates it from the Colosseum
 * standing a few hundred kilometres north on the same contact sheet:
 *
 * 1. **The ring is whole.** All three storeys of arches run right round the
 *    oval; the Colosseum is two-fifths of an outer ring on a stump. Here the
 *    complete ellipse is the silhouette.
 * 2. **Three storeys and no attic.** Arcade on arcade on arcade, the top one
 *    under a heavier crowning course (the attic that stood over it is lost),
 *    so the wall ends on arches and not on a blind band.
 * 3. **One breach.** On the west side a wedge is cut out of the wall, widest at
 *    the top and narrowing to a single bay at the ground, with rubble heaped in
 *    the gap — the hole opened in 1695 to drive out rebels sheltering inside.
 *    The broken piers stand up out of the gap as ragged stubs, which is what
 *    the breach looks like in every photograph: a V, not a clean cut.
 *
 * ## The arches, and the budget
 *
 * The real ring has 64 arches a storey. At a box a pier and a box a band
 * (12 triangles each) plus a turned box a head, a bay costs 84 triangles over
 * three storeys, so the 2,600 cap allows about 26 bays once the bowl is paid
 * for. A bay here is two and a half real ones, the same trade the Colosseum
 * made at 32 — 26 because there is no breach-sized saving: this wall is
 * complete. At 26 an opening is 7.45 wide at the face and 10.35 to the band on
 * the ground storey, 1.39 : 1, which still reads as an arch; the storeys were
 * made tall for it, which is where the vertical stretch below comes from.
 *
 * **An arch head is a diamond**, exactly as in `colosseum.ts`: a box turned 45
 * degrees about the radial axis, centred on the pier at the band's underside,
 * whose lower flanks chamfer the top corners of the openings either side. On
 * the top storey its upper half is buried in the crowning course, which is
 * why that course is `HEAD` plus a margin tall. A pier at the edge of the
 * breach has no head: the flank would stand out over the gap as a spike.
 *
 * **One mesh a colour**: every piece is built as an ordinary helper piece and
 * drawn by `ctx.merge`.
 *
 * ## Scale and proportion
 *
 * 148 by 122 m on the ground and about 36 m tall. Built as a circle and
 * squashed once (`OVAL`, 122 / 148), 100 by 82 units at the pier faces and
 * 37.4 to the top of the crowning course: vertical 1.55x the plan, a little
 * more than the Colosseum's 1.5x, so the storeys have room to be arcades.
 * Half-diagonal about 51 against 37.4 is 1.4, inside the 2.0 cap.
 *
 * The long axis is X. `placement.ts` turns +Z to north and +X to west, so the
 * breach, centred on +X, is on the west side.
 *
 * ## Colour
 *
 * The stone is a golden limestone: `sand`, toned down for the bands and
 * further for the crowning course, which weathers darkest. The cavea is stone
 * too, in tones of `sand` and `tan`. What the arches look into is the
 * substructure at `brown` 0.72, warm and dark, because a neutral seen through
 * an opening reads as sky.
 */

const TAU = Math.PI * 2;

/** Bays round the ring. See the header: set by the triangle cap and the arch proportion. */
const BAYS = 26;
const BAY = TAU / BAYS;
/** The breach is centred on +X, west. Bay 0 is centred on it. */
const BREACH = Math.PI / 2;

/** Short axis against long: 122 m against 148. Applied as `scale.z` on the whole ring. */
const OVAL = 0.824;

// --- the outer wall, in the frame of one pier: z out, x along the ring ---
const FACE = 50;
const PIER_BACK = 47.2;
const PIER_WIDTH = 4.6;
/** Opening half-width at the face: half the bay chord less a pier. 3.73. */
const ARCH_HALF = FACE * Math.sin(BAY / 2) - PIER_WIDTH / 2;
/** How far the diamond's flank climbs before the band cuts it off. */
const CHAMFER = 0.55 * ARCH_HALF;
/** Half-diagonal of the diamond: from the pier's corner to the band's underside, at 45 degrees. */
const HEAD = PIER_WIDTH / 2 + CHAMFER;

/** The bands stand proud of the piers, so each storey ends on an ink line. */
const BAND_FACE = 50.35;
const BAND_BACK = 47.4;
/**
 * 2.2 and not less: the diamond of the storey below is `2 * (HEAD - BAND)`
 * wide where it leaves the band's top, and that has to stay inside the 4.6
 * pier above it (4.3 here).
 */
const BAND = 2.2;
/** The crowning course over the top storey, tall enough to bury that storey's heads. */
const CORNICE = HEAD + 0.6;

interface Storey {
  floor: number;
  /** Top of the straight jamb, where the head's chamfer starts. */
  spring: number;
  /** Signed bay indices missing from this storey: the breach, widest at the top. */
  gap: [number, number];
}

const STOREYS: Storey[] = [
  { floor: 0, spring: 8.3, gap: [0, 0] },
  { floor: 12.55, spring: 20.2, gap: [-1, 1] },
  { floor: 24.45, spring: 30.4, gap: [-2, 3] },
];
const bandBottom = (storey: Storey): number => storey.spring + CHAMFER;
const bandHeight = (index: number): number => (index === STOREYS.length - 1 ? CORNICE : BAND);
const storeyTop = (index: number): number => bandBottom(STOREYS[index]!) + bandHeight(index);

/** How far a broken pier stands above the last band it carries. At least the head's reach over that band (2.15). */
const RAGGED = [2.8, 4.6, 3.3, 5.4, 2.6, 3.9];

/** The substructure behind the arcade: what the arches look into, and the bowl's rim. */
const CORE_INNER = 40;
const CORE_OUTER = 44.2;
const CORE_HEIGHT = 29;

/** Cavea banks, arena outward. Stepped, so each bank is its own ink line from the air. */
const CAVEA = [
  { inner: 22, outer: 28, height: 7 },
  { inner: 28, outer: 34, height: 15 },
  { inner: 34, outer: CORE_INNER, height: 23.5 },
];
const RING_SIDES = 14;

/** Arena radius in the circle frame; squashed it is 44 by 36, the real 65 by 39 m made rounder. */
const ARENA = 22;

/** A signed bay index, -12..13, so the breach's ranges can be written round 0. */
const signed = (k: number): number => (k > BAYS / 2 ? k - BAYS : k);
const standing = (k: number, storey: number): boolean => {
  const [lo, hi] = STOREYS[storey]!.gap;
  const s = signed(((k % BAYS) + BAYS) % BAYS);
  return s < lo || s > hi;
};

export const elJemAmphitheatre: Monument = {
  id: 'el-jem-amphitheatre',
  name: 'Amphitheatre of El Jem',
  iso: 'TUN',
  lat: 35.2964,
  lon: 10.7069,
  realHeight: 36,
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, ringWall } = ctx;
    const stone = palette.sand;
    const band = tone(palette.sand, 0.9);
    const crown = tone(palette.sand, 0.84);
    const core = tone(palette.brown, 0.72);
    const seats = [tone(palette.sand, 0.82), tone(palette.tan, 1.12), tone(palette.sand, 0.74)];
    const arena = tone(palette.sand, 1.06);
    const pit = tone(palette.brown, 0.58);
    const rubble = [tone(palette.sand, 0.78), tone(palette.tan, 0.95)];

    const draft = new THREE.Group();
    // Built as a circle and squashed once. The scale sits on a group with no
    // rotation and every piece turns inside its own pivot below it, which
    // composes as S * R: yawed first, squashed after.
    const oval = new THREE.Group();
    oval.scale.z = OVAL;
    draft.add(oval);

    const radial = (angle: number, ...pieces: Object3D[]): void => {
      const pivot = new THREE.Group();
      pivot.rotation.y = angle;
      pivot.add(...pieces);
      oval.add(pivot);
    };
    /** A box standing on `base`, spanning `back` to `face` out from the axis. */
    const slab = (width: number, base: number, top: number, back: number, face: number, color: number): Mesh => {
      const mesh = box(width, top - base, face - back, color);
      mesh.position.set(0, base, (face + back) / 2);
      return mesh;
    };
    const chord = (r: number): number => 2 * r * Math.sin(BAY / 2);

    // Bay k is centred on BREACH + k * BAY; pier j stands between bay j and
    // bay j + 1, half a bay on.
    const bayAngle = (k: number): number => BREACH + k * BAY;
    const pierAngle = (j: number): number => BREACH + (j + 0.5) * BAY;

    // --- the piers and their heads ------------------------------------------
    for (let j = 0; j < BAYS; j++) {
      // The highest storey this pier carries a band on, from either side.
      let top = -1;
      for (let s = 0; s < STOREYS.length; s++) if (standing(j, s) || standing(j + 1, s)) top = s;
      if (top < 0) continue;

      const height =
        top === STOREYS.length - 1
          ? storeyTop(top) - PROUD // stops under the crowning course's top: flush, two colours in one plane
          : storeyTop(top) + RAGGED[j % RAGGED.length]!; // a broken stub standing up out of the breach
      const pieces: Object3D[] = [slab(PIER_WIDTH, 0, height, PIER_BACK, FACE, stone)];

      for (let s = 0; s <= top; s++) {
        // A head only between two standing bays; at the breach's edge its far
        // flank would stand out over the gap.
        if (!(standing(j, s) && standing(j + 1, s))) continue;
        const side = HEAD * Math.SQRT2;
        const diamond = box(side, side, FACE - PIER_BACK, stone);
        diamond.position.y = -side / 2;
        const turn = new THREE.Group();
        turn.rotation.z = Math.PI / 4;
        turn.position.set(0, bandBottom(STOREYS[s]!), (FACE + PIER_BACK) / 2);
        turn.add(diamond);
        pieces.push(turn);
      }
      radial(pierAngle(j), ...pieces);
    }

    // --- the bands, bay by bay ----------------------------------------------
    for (let k = 0; k < BAYS; k++) {
      const pieces: Object3D[] = [];
      STOREYS.forEach((storey, s) => {
        if (!standing(k, s)) return;
        const bottom = bandBottom(storey);
        pieces.push(
          slab(
            chord(BAND_FACE) + 0.05,
            bottom,
            bottom + bandHeight(s),
            BAND_BACK,
            BAND_FACE,
            s === STOREYS.length - 1 ? crown : band,
          ),
        );
      });
      if (pieces.length > 0) radial(bayAngle(k), ...pieces);
    }

    // --- the breach's rubble --------------------------------------------------
    // Heaped in the one ground-storey bay that is gone, spilling in over the
    // substructure, with a lower heap against the next pier.
    {
      const heap = taper(4.6, 1.4, 6.0, rubble[0]!, 5);
      heap.position.z = 45;
      const spill = taper(3.4, 1.0, 3.6, rubble[1]!, 5);
      spill.position.set(5.5, 0, 44.5);
      radial(BREACH, heap, spill);
    }

    // --- the substructure and the cavea --------------------------------------
    oval.add(ringWall(CORE_INNER, CORE_OUTER, CORE_HEIGHT, core, RING_SIDES));
    CAVEA.forEach((bank, index) => {
      oval.add(ringWall(bank.inner, bank.outer, bank.height, seats[index]!, RING_SIDES));
    });

    // --- the arena, and the two galleries under it ----------------------------
    // The floor survives here, with the long slot over the galleries that cross
    // under it: a dark strip down the long axis and a shorter one across.
    oval.add(column(ARENA, 0.3, arena, RING_SIDES));
    const long = box(30, 0.45, 3.0, pit);
    oval.add(long);
    const across = box(3.0, 0.45, 20, pit);
    oval.add(across);

    return ctx.merge(draft);
  },
};
