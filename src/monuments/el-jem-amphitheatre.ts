import type { Mesh, Monument, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Amphitheatre of El Jem — Thysdrus, Tunisia.
 *
 * Unlike the Colosseum it is almost whole, and three things name it:
 * 1. The ring is whole: all three storeys of arches run right round the oval.
 * 2. Three storeys and no attic: arcade on arcade on arcade, the top under a
 *    heavier crowning course, so the wall ends on arches.
 * 3. One breach on the west side (+X): a wedge cut out of the wall, widest at the
 *    top and narrowing to a single bay at the ground, with rubble heaped in the
 *    gap and the broken piers standing as ragged stubs (a V, not a clean cut).
 *    A pier at the edge of the breach has no head: its flank would be a spike.
 *
 * A bay costs 84 triangles over three storeys, so the 2,600 cap allows about 26
 * (a bay is two and a half real ones, the 64 arches a storey being too many). At
 * 26 an opening is 7.45 wide at the face and 10.35 to the band on the ground
 * storey, 1.39 : 1; the storeys are tall for it. An arch head is a diamond as in
 * `colosseum.ts`: a box turned 45 degrees about the radial axis, centred on the
 * pier at the band's underside; on the top storey its upper half is buried in the
 * crowning course (`HEAD` plus a margin tall). Everything is drawn with
 * `ctx.merge`, one mesh a colour.
 *
 * Scale: built as a circle and squashed once (`OVAL`, 122 / 148), 100 by 82 units
 * at the pier faces and 37.4 to the crowning course, vertical 1.55x the plan.
 * Half-diagonal about 51 over 37.4 is 1.4. The long axis is X.
 *
 * Colour: golden `sand` limestone, toned down for the bands and further for the
 * crowning course; the cavea in tones of `sand` and `tan`; arches look into the
 * substructure at `brown` 0.72 (a neutral reads as sky).
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
 * 2.2 and not less: the storey below's diamond is `2 * (HEAD - BAND)` wide where
 * it leaves the band's top, and that must stay inside the 4.6 pier above (4.3).
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
    // Built as a circle and squashed once; the scale sits on a rotation-free group
    // and every piece turns inside its own pivot (S * R).
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
    // Heaped in the ground-storey bay that is gone, with a lower heap against the next pier.
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
    // The floor survives, with a long slot over the galleries: a dark strip down
    // the long axis and a shorter one across.
    oval.add(column(ARENA, 0.3, arena, RING_SIDES));
    const long = box(30, 0.45, 3.0, pit);
    oval.add(long);
    const across = box(3.0, 0.45, 20, pit);
    oval.add(across);

    return ctx.merge(draft);
  },
};
