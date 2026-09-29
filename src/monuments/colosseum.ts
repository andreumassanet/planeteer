import type { Mesh, Monument, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Colosseum.
 *
 * Three things name it from across Rome, and a fourth rewards walking up to it:
 *
 * 1. **Four storeys, and the top one is blind.** Three tiers of arches under a
 *    solid attic pierced by small square windows. Without the attic it is any
 *    arena; the attic is a quarter of the wall's height (10.8 of 38.9 here, as
 *    in life) and it is what makes the wall look *tall*. The piers run up it as
 *    pilasters and stop under a plain top course, so the crown is one line.
 * 2. **One side is gone.** The outer ring stands for 13 bays of 32 across the
 *    north — 146 degrees, the two fifths of the ring that survive in life — and
 *    everywhere else the building is its inner ring, two storeys of arcade half
 *    the height, stepping up toward the two ends where the outer wall breaks
 *    off. That drop is the whole silhouette: a complete ring reads as a stadium,
 *    or a gasometer.
 * 3. **The two buttresses that hold the break.** Stern's (1807) at the east end
 *    is a single sloping wedge of brick; Valadier's (the 1820s) at the west end
 *    steps down in brick over three bays. Both are `clay` against the
 *    travertine, which is exactly what they are in every photograph: the only
 *    red on the building.
 * 4. **Up close and from the air: the arena is open to the hypogeum.** Six long
 *    brick walls down the arena's length, the service corridors that were under
 *    the floor, with a stretch of restored timber floor over one end. It is what the
 *    plane sees first, and it is what makes the bowl read as a ruin rather than
 *    a stadium with the seats taken out.
 *
 * ## The arches, and what 2,600 triangles buy
 *
 * The real building has 80 arches a ring, and **the triangle cap rules that out
 * before the mesh cap is even asked**: a box is 12 triangles, the cheapest closed
 * solid the helpers make, and 80 openings on three tiers is 240 piers — 2,880
 * triangles for the piers alone. So a bay here is two and a half real ones: 32
 * round the ring, 13 of them standing. The count was set by the budget and the
 * arch proportion together. At 32 bays an opening is 5.6 wide and 7.8 to its
 * crown, 1.4 : 1 against the real 1.7 : 1; at 24 it would be 1.1 : 1, which is
 * a doorway, not an arch.
 *
 * **An arch head is a diamond.** There is no helper that cuts a round hole, so
 * each opening is the gap between two piers, and its head is made by what
 * stands *over the piers*: a box turned 45 degrees about its own depth, centred
 * on the pier, whose two lower flanks rise from the pier's corners at the
 * springing line and chamfer the top corners of the openings either side. The
 * band above cuts the chamfers off 1.5 units up, so each opening ends in a flat
 * crown 2.5 wide with its corners cut — a round arch drawn in five strokes, and
 * at the size the model is read from, a round arch. The diamond's face is flush
 * with the pier's and its upper half falls inside the next storey's pier, so
 * both of those are coplanar and the ink draws neither; the only lines it adds
 * are the two flanks. It costs 12 triangles a head, where a laid prism wants 24
 * and draws its buried lower arc straight across the opening (the wheels
 * `ctx.column` warns about).
 *
 * **One mesh a colour.** Everything is built as ordinary helper pieces and then
 * drawn by `ctx.merge` as one mesh per colour, which is the "merging them by
 * material later is a single call" that `contract.ts` built every geometry
 * non-indexed for. The 14 piers and 42 heads of the arcade are 56 pieces of
 * `sand` in one draw call. That is what lets the tones be spent freely: a tone
 * is a colour, and a colour is one draw call, not one per piece.
 *
 * ## Scale and proportion
 *
 * 188 by 156 m on the ground and 48.5 m tall. Built as a circle and squashed
 * once (`OVAL`), an ellipse 100 by 83 units at the outer piers and 38.9 to the
 * attic top: vertical 1.5x the plan, so the arches have room to be arches. The
 * old model was 34 tall with an attic of 3; this one is 4.9 taller and its
 * arcades 2.9 shorter, so the attic is 10.8 — the storey it was missing. The long
 * axis is X, east-west, as it lies in Rome — `placement.ts` turns +Z to north
 * and +X to west, so the standing arc is on +Z facing the Esquiline, Stern's
 * buttress is at -X and Valadier's at +X, all three as they are.
 *
 * ## Colour
 *
 * `sand` for the travertine, toned down for the entablature bands and further
 * for the attic, which weathers darkest; `clay` for the brick (buttresses,
 * blocked arches, the ruined core, the hypogeum walls); `brown` and `tan` for
 * the cavea, which is rubble brick and tufa now, not seats; `bark` for the attic
 * windows. What the arches look into is the brick core at 0.6, dark and warm,
 * because a neutral seen through an opening reads as sky.
 */

const TAU = Math.PI * 2;

/** Bays round the ring. See the header: set by the triangle cap and the arch proportion. */
const BAYS = 32;
const BAY = TAU / BAYS;
/** Bays of the outer ring still standing, centred on +Z (north). 13 of 32 is the real 31 of 80. */
const INTACT = 13;
const HALF_INTACT = (INTACT - 1) / 2;

/** Short axis against long: 156 m against 188. Applied as `scale.z` on the whole ring. */
const OVAL = 0.83;

// --- the outer wall, in the frame of one pier: z out, x along the ring ---
const FACE = 50;
const PIER_BACK = 47.2;
const PIER_WIDTH = 4.2;
/** Opening half-width at the face: half of the bay chord less a pier. 2.8. */
const ARCH_HALF = FACE * Math.sin(BAY / 2) - PIER_WIDTH / 2;
/** How far the diamond's flank climbs before the band cuts it off. */
const CHAMFER = 0.55 * ARCH_HALF;
/** Half-diagonal of the diamond: from the pier's corner to the band's underside, at 45 degrees. */
const HEAD = PIER_WIDTH / 2 + CHAMFER;

/** Entablature bands stand this far proud of the piers, so each storey ends on an ink line. */
const BAND_FACE = 50.35;
const BAND_BACK = 47.4;
const BAND = 2.0;

interface Storey {
  floor: number;
  /** Top of the straight jamb, where the head's chamfer starts. */
  spring: number;
}

/**
 * Doric, Ionic, Corinthian. Each storey is its jamb, `CHAMFER` of head, and a
 * `BAND` of entablature; the ground storey's jamb is the tallest, as in life.
 */
const STOREYS: Storey[] = [
  { floor: 0, spring: 6.3 },
  { floor: 9.84, spring: 15.6 },
  { floor: 19.14, spring: 24.6 },
];
const bandBottom = (storey: Storey): number => storey.spring + CHAMFER;
const storeyTop = (storey: Storey): number => bandBottom(storey) + BAND;

const ATTIC_BASE = storeyTop(STOREYS[2]!);
/** The piers stop here, and the attic runs on above them as a plain top course. */
const PIER_TOP = 38.2;
const ATTIC_TOP = 38.9;
/** The attic is set back from the pier line, so the piers run up it as pilasters. */
const ATTIC_FACE = 49.72;
const WINDOW_WIDTH = 1.5;
const WINDOW_HEIGHT = 2.4;
const WINDOW_Y = 31.8;

// --- the inner ring, which is the outside of the building wherever the outer one fell ---
const INNER_FACE = 46.6;
const INNER_BACK = 43.8;
const INNER_PIER = 3.8;
/** The ground-storey vault over the ambulatory: the inner ring's band, and the outer ring's ceiling. */
const VAULT_INNER = INNER_BACK;
const VAULT_OUTER = 47.6;
const VAULT_SIDES = 16;

/** The brick core behind the inner arcade: what the arches look into, and the ruin above them. */
const CORE_INNER = 40;
const CORE_HEIGHT = 23;

/** Cavea banks, arena outward. Stepped, so each bank is its own ink line from the air. */
const CAVEA = [
  { inner: 22, outer: 28, height: 4.0 },
  { inner: 28, outer: 34, height: 10.5 },
  { inner: 34, outer: CORE_INNER, height: 17 },
];
const RING_SIDES = 16;

/** Arena radius in the circle frame; squashed it is 44 by 36.5, the real 86 by 54 m made rounder. */
const ARENA = 22;

export const colosseum: Monument = {
  id: 'colosseum',
  name: 'Colosseum',
  iso: 'ITA',
  lat: 41.8902,
  lon: 12.4922,
  realHeight: 48,
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, ringWall } = ctx;
    const travertine = palette.sand;
    const entablature = tone(palette.sand, 0.9);
    const attic = tone(palette.sand, 0.86);
    const inner = tone(palette.sand, 0.95);
    const unlit = palette.bark;
    const brick = tone(palette.clay, 0.88);
    const core = tone(palette.clay, 0.6);
    const vaulting = tone(palette.tan, 1.08);
    const rubble = [tone(palette.tan, 0.92), palette.brown, tone(palette.brown, 0.9)];
    const pit = tone(palette.brown, 0.58);
    const hypogeum = tone(palette.clay, 0.78);
    const deck = tone(palette.brown, 1.18);

    const draft = new THREE.Group();
    // Everything is built as a circle and squashed once, so every radius in the
    // file stays one honest number. The scale sits on a group with no rotation
    // and every piece under it turns inside its own pivot, which composes as
    // S * R: pieces are yawed first and squashed after, as they must be.
    const oval = new THREE.Group();
    oval.scale.z = OVAL;
    draft.add(oval);

    /** Pieces stood in the frame of a bay or a pier, turned round to `angle`. */
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
    /** Chord of one bay at radius `r`: how wide a straight piece has to be to span it. */
    const chord = (r: number): number => 2 * r * Math.sin(BAY / 2);

    // Pier j stands between bay j and bay j+1, so its angle is a half bay off
    // the bays'. Bay 0 is centred on +Z.
    const pierAngle = (j: number): number => (j + 0.5) * BAY;
    const bayAngle = (k: number): number => k * BAY;

    // --- the outer wall: 14 piers, 13 bays -----------------------------------
    for (let j = -HALF_INTACT - 1; j <= HALF_INTACT; j++) {
      const pieces: Object3D[] = [slab(PIER_WIDTH, 0, PIER_TOP, PIER_BACK, FACE, travertine)];

      // One head a storey over this pier: a box in a group turned 45 degrees
      // about the radial axis, standing on its own centre.
      for (const storey of STOREYS) {
        const side = HEAD * Math.SQRT2;
        const diamond = box(side, side, FACE - PIER_BACK, travertine);
        diamond.position.y = -side / 2;
        const turn = new THREE.Group();
        turn.rotation.z = Math.PI / 4;
        turn.position.set(0, bandBottom(storey), (FACE + PIER_BACK) / 2);
        turn.add(diamond);
        pieces.push(turn);
      }
      radial(pierAngle(j), ...pieces);
    }

    for (let k = -HALF_INTACT; k <= HALF_INTACT; k++) {
      const pieces: Object3D[] = [];
      for (const storey of STOREYS) {
        pieces.push(
          slab(chord(BAND_FACE) + 0.05, bandBottom(storey), storeyTop(storey), BAND_BACK, BAND_FACE, entablature),
        );
      }
      pieces.push(slab(chord(ATTIC_FACE), ATTIC_BASE, ATTIC_TOP, BAND_BACK, ATTIC_FACE, attic));

      // One window a bay: the real attic has one every other bay, and a bay
      // here is two and a half real ones.
      const opening = box(WINDOW_WIDTH, WINDOW_HEIGHT, 0.3, unlit);
      opening.position.set(0, WINDOW_Y, ATTIC_FACE - 0.07);
      pieces.push(opening);
      radial(bayAngle(k), ...pieces);
    }

    // --- where the outer wall breaks off -------------------------------------
    // In a pier's own frame +X is the way the angle grows, so past the east end
    // (the negative angles) is local -X and past the west end is local +X.
    // The brick infill starts `PROUD` in front of the piers' back face and stops
    // `PROUD` under the attic's base: laid flush, its back shared a plane with
    // the travertine piers and its top with the entablature band, two colours
    // in one plane that flickered.
    const blockedBack = PIER_BACK + PROUD;
    const blockedTop = ATTIC_BASE - PROUD;
    const blockedWidth = chord(FACE) - PIER_WIDTH + 0.2;
    const blockedAt = ARCH_HALF + PIER_WIDTH / 2;

    // Stern's buttress: one wedge of brick leaning on the east end. A four-sided
    // taper, thinned through the wall by a parent carrying only scale, so the
    // result is S * R and the squeeze lands on the radial axis. The last
    // standing bay has its arches bricked up, as Stern left them.
    {
      const thin = new THREE.Group();
      thin.scale.z = 0.42;
      thin.position.set(-3.6, 0, 48.2);
      thin.add(taper(6.4, 1.1, 33, brick, 4));
      const blocked = slab(blockedWidth, 0, blockedTop, blockedBack, FACE - 0.3, brick);
      blocked.position.x = blockedAt;
      radial(pierAngle(-HALF_INTACT - 1), thin, blocked);
    }

    // Valadier's buttress: the arcade carried on in brick, cut down in steps,
    // with the last travertine bay's arches filled.
    {
      const blocked = slab(blockedWidth, 0, blockedTop, blockedBack, FACE - 0.3, brick);
      blocked.position.x = -blockedAt;
      const upper = slab(5.2, 0, storeyTop(STOREYS[2]!) + 0.8, blockedBack, FACE - 0.1, brick);
      upper.position.x = 4.5;
      const lower = slab(4.4, 0, storeyTop(STOREYS[1]!), PIER_BACK - 0.4, FACE - 0.5, brick);
      lower.position.x = 9.2;
      const foot = slab(3.6, 0, storeyTop(STOREYS[0]!) - 1.5, PIER_BACK - 0.8, FACE - 1.1, brick);
      foot.position.x = 12.9;
      radial(pierAngle(HALF_INTACT), blocked, upper, lower, foot);
    }

    // --- the inner ring: the outside of the south half ------------------------
    // Piers where the outer ring is gone, with a ragged top that climbs toward
    // the two ends, where the fallen wall once tied into it.
    const brokenPiers = BAYS - INTACT + 1;
    for (let n = 0; n < brokenPiers; n++) {
      // 0 at either end of the broken arc, 1 in the middle.
      const middle = Math.sin((Math.PI * n) / (brokenPiers - 1));
      const ragged = [0, 2.6, 0.8, 4.1, 1.5, 0.2, 3.2][n % 7]!;
      const top = 19.4 + (1 - middle) * 7.5 + ragged;
      radial(pierAngle(HALF_INTACT + n), slab(INNER_PIER, 0, top, INNER_BACK, INNER_FACE, inner));
    }

    // The ground-storey vault over the ambulatory, one full ring: on the south
    // it is the inner ring's band, standing proud of its piers; on the north it
    // is the ceiling seen through the arches. Its twin a storey up was cut for
    // the triangles, and the slot it closed is the open upper ambulatory the
    // plane really does look down into.
    // `PROUD` inside the band at top and bottom: it reaches into the outer
    // bands, and at the band's own height their tops and soffits shared planes.
    const vault = ringWall(VAULT_INNER, VAULT_OUTER, BAND - 2 * PROUD, vaulting, VAULT_SIDES);
    vault.position.y = bandBottom(STOREYS[0]!) + PROUD;
    oval.add(vault);

    // What the arches look into, and on the south the ruined upper cavea rising
    // behind the arcade: one dark ring of brick. Dark and warm, because through
    // an arch a neutral reads as sky.
    oval.add(ringWall(CORE_INNER, INNER_BACK, CORE_HEIGHT, core, RING_SIDES));

    // --- the cavea ------------------------------------------------------------
    CAVEA.forEach((bank, index) => {
      oval.add(ringWall(bank.inner, bank.outer, bank.height, rubble[index]!, RING_SIDES));
    });

    // --- the arena, open to the hypogeum ---
    oval.add(column(ARENA, 0.3, pit, RING_SIDES));

    // Six corridor walls down the long axis, the middle pair framing the
    // central gallery. Each is cut to the circle it stands in.
    for (const z of [-13.4, -8.2, -2.7, 2.7, 8.2, 13.4]) {
      const wall = box(2 * Math.sqrt(ARENA * ARENA - z * z) - 2, 3.1, 1.0, hypogeum);
      wall.position.z = z;
      oval.add(wall);
    }

    // A stretch of restored timber floor, over the east end. Its far edge runs
    // under the podium, which hides it.
    const floor = box(10, 3.4, 32, deck);
    floor.position.x = -17;
    oval.add(floor);

    return ctx.merge(draft);
  },
};
