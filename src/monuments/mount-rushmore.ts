import type { Group, Mesh, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Mount Rushmore.
 *
 * **Four recognisable likenesses at thumbnail size is not on the table**, and
 * chasing it is how this file gets wrecked. In a 96-pixel cell a head is
 * nineteen pixels tall, its nose is one pixel wide and its eye is two. No
 * geometry inside that budget separates Jefferson from Roosevelt. So the target
 * is not four portraits, it is **four heads in a row emerging from a cliff**,
 * which is what anyone actually recognises — including people who cannot name
 * the third president.
 *
 * The failure mode is sharper than the goal: a tidy row of four busts on a shelf
 * is a **war memorial**, and a stack of flat-topped columns under them is a
 * **fortress**. Both were built here before this version. What makes it Rushmore
 * is that the carving is *unfinished and set into a mountain* — granite above
 * it, granite below it, wedges of uncarved rock left standing between the faces,
 * and the whole thing on the heap of rubble the carvers blasted off. By volume
 * the mountain is most of the model; the heads are a band across its upper
 * third.
 *
 * **Cutting into rock with helpers that only make solids.** Nothing here can
 * subtract, so, as at Petra, every recess is a void by arrangement and four
 * devices do the work:
 *
 * 1. **The heads live in a slot.** A field of rock closes over them (`CRAGS`,
 *    hanging down to y 86–92) and a second field rises to meet them from below
 *    (`RIBS`, topping out at 26–86). Neither is level, and the band between them
 *    is where the faces are. Only Washington's wig grazes the skyline, at the
 *    left end, and only Lincoln's crown breaks the rock line, at the right —
 *    which is what the mountain does at both ends.
 * 2. **Rock in front of the faces.** The ribs stand at z = 5..15 while the heads
 *    are cut back to a cheek plane of z = 6 (times their own scale, plus their
 *    own offset). Four ribs finish in front of the jaw above them — 15 against
 *    Washington's chin at 14.1, 10 against Roosevelt's at 8.8, 13 twice against
 *    Lincoln's beard at 12.3 — so three of the four heads are **cropped by raw
 *    granite** rather than ending on a clean edge. A carving in a cliff is
 *    occluded by its own mountain; a bust on a shelf never is.
 * 3. **Nothing was built behind them.** The gaps between the heads, the notch
 *    under a chin, the dark beside a wig: all of it is one back plane
 *    (`BACKDROP`, in `steel`) a tone darker than the rock. Modelling shoulders
 *    back there would have been modelling four statues.
 * 4. **The carving stops mid-block.** Each head grows out of a rough slate shelf
 *    whose top crosses the chin line, and only Washington gets a hint of collar.
 *    The other three end in the mountain, which is what they do at Keystone.
 *
 * **Why the mountain is not a wall.** The first two versions of this file were a
 * fortress and a pipe organ, and four things fixed it. Every rock block is a
 * `wedge` that narrows as it rises, so the mass leans back and nothing is a
 * parallel-sided pipe — with `OVERLAP` of slop in x, so the narrowing leaves a
 * serrated joint rather than a crack of sky. The `MASSES` fill the cliff solid
 * behind the ribs, so the gaps between ribs show rock and not a black slot. The
 * `face` values fall off toward both ends — 15 at the middle, 5 at the edges —
 * so the cliff is **convex in plan** and its flanks step rather than presenting
 * one wall to a three-quarter view. And the whole thing stands on a **scree cone
 * 100 units wide against the cliff's 96**, with the profile stepping in at ±50,
 * ±47, ±45 and ±43 on the way up. A mass the same width at the top and the
 * bottom is a building.
 *
 * **The face, at fifteen pixels.** The moai's lesson applies unchanged: in one
 * stone colour a feature reads only by the ink under its own ledge, so the whole
 * face is a depth cascade off the cheek plane — muzzle 8.4, chin 9.4, brow 9.4,
 * mouth 9.6, nose tip 11.2 raked back to 8.8 at the root, and the sockets
 * *recessed* to 7.2 in the slot between muzzle and brow, in `ink`. That pair of
 * black notches under a lit brow is the strongest signal at this size;
 * everything else exists to make the notch read as a shadow rather than a hole.
 *
 * Distinct silhouettes carry the rest — one tag each, none of them on the eye
 * line, because the eye line is where downsampling does its worst:
 *
 * - **Washington** — the roll of the wig: 20.5 wide against a 17.5 head and
 *   standing a unit proud of the brow. A hat brim, and the only head that is
 *   wider than the skull it sits on.
 * - **Jefferson** — no tag at all, which is his tag: the highest head, and a
 *   plain back-swept crown tapering from 17 to 8.5 where the others are capped.
 * - **Roosevelt** — the pince-nez: one bar of `steel` across both sockets, plus
 *   the moustache. The only dark horizontal in any face, and the deepest-set
 *   head, sitting in its own notch a unit and a half behind the rest.
 * - **Lincoln** — the beard, a mass wider than the jaw running past the chin and
 *   down into the rock. The only head with no chin at all.
 *
 * **Not evenly spaced, not level, not one plane.** Centres at x = -32, -12.5, 7
 * and 29 — gaps of 19.5, 19.5 and 22, so the first three touch as they do on the
 * mountain and Lincoln stands off with a wedge of granite between. Chins at
 * y = 61, 64, 60 and 62; depths at z = +3, +1, -1.5 and 0, Washington forward and
 * Roosevelt deepest; and scales of 1.18, 1.12, 1.09 and 1.14, so no two heads are
 * the same size either.
 *
 * **Colour.** One rock in four weathers. `slate` is the mountain: the coolest
 * grey in the palette and the only one that is not a soil colour — Harney Peak
 * granite is grey with a lilac cast, and `tan` or `brown` would have made this a
 * sandstone butte. `bone` is the carved granite, genuinely paler than the face
 * it was cut from, and the pale boulders in the talus are the blasting waste,
 * which is the same fresh stone. `steel` is what every gap shows — the plane
 * behind the carving, the solid the crags stand out of, and the four crags set
 * furthest back — so colour and depth say the same thing.
 * `ink` is the sockets, the only true black in the model. `darkOlive` is the
 * ponderosa pine at the foot — in every
 * photograph ever taken of the place, and the only thing in frame with a
 * knowable size: a 13-unit tree against a 119-unit mountain puts the heads at
 * about 18 m, which is what they are.
 *
 * **Proportion — the mountain is cropped, the heads are not stretched.** The
 * carving alone is 83 units wide by 34 tall, 2.4:1, which on its own would read
 * as a frieze. Framed by the mountain the model is 100 by 119, and the crop is
 * vertical: from the Grand View Terrace the granite runs six to eight
 * head-heights from talus to summit, and here it runs four. That is the axis
 * carrying least recognition — nobody names Rushmore by how much rock is under
 * it — while the head row's own proportions are untouched. The ridge above and
 * the scree below are each cut roughly in half.
 *
 * **Tier: `landmark`.** By the tier's own question this is a mountainside seen
 * from the road miles out, not something you discover by walking into it; and
 * mechanically, a `building` at 40 units would leave each head 10 units in which
 * to hold a nine-part face, which is where the depth cascade stops resolving.
 *
 * No `realHeight`: the source list asserts none, and Rushmore has no single
 * height to assert. The heads are 18 m and the mountain is 1,745 m above the
 * sea; neither is *the* height of the monument.
 */

// ---------------------------------------------------------------------------
// The mountain
// ---------------------------------------------------------------------------

/** Every rock block runs back to this plane. The mountain has no inside. */
const BACK = -20;

/**
 * How much each rock block overhangs its slot on either side. Every block
 * narrows as it rises (see `pillar`), and without the overlap two neighbours
 * part company at the top and leave a slit of sky in the middle of a mountain.
 */
const OVERLAP = 1.3;

/** How much of its base width a block keeps at its top. Rock leans back and in. */
const LEAN = 0.86;

/**
 * The solid of the cliff below the carving: three leaning masses, one behind the
 * other and each narrower than the last, `[x0, x1, top, face]`. They exist so
 * the ribs in front of them have something to be ribs *of* — without them the
 * gaps between ribs are black slots and the mountain reads as a colonnade.
 */
const MASSES: readonly (readonly [number, number, number, number])[] = [
  [-45, 45, 56, 6],
  [-40, 40, 67, 3],
  [-28, 28, 46, 11],
];

/**
 * The vertical joint columns standing on the masses, `[x0, x1, top, face]`.
 * Rushmore's granite breaks this way, and a rib standing 4 units proud of its
 * neighbour hands `OutlineEffect` a seam from the talus to the skyline for free:
 * it is Uluru's fluting, done with eighteen boxes instead of thirty slabs.
 *
 * Two things are encoded in the numbers. The `face` values fall off toward both
 * ends, so the cliff bows forward in the middle instead of presenting a flat
 * side to a three-quarter view; the marked spurs break that envelope on purpose,
 * because they are the ones that crop a jaw. And the tops fall away at both
 * ends, which together with the talus at ±50 is what steps the profile in on the
 * way up. Where two heads touch, the rib between them (80 and 84) sits behind
 * both and only fills; the one at 86 is the visible wedge of uncarved granite,
 * in the one real gap in the row, between Roosevelt and Lincoln.
 */
const RIBS: readonly (readonly [number, number, number, number])[] = [
  [-46, -43, 32, 5],
  [-43, -38.5, 50, 7],
  [-38.5, -34, 60, 10],
  [-36, -32, 65, 15], // a spur, and it crops Washington's chin
  [-33, -28, 48, 11],
  [-27, -21, 80, 6], // between Washington and Jefferson
  [-23, -18, 58, 12],
  [-17.5, -12, 55, 14],
  [-11, -6, 84, 5], // between Jefferson and Roosevelt
  [-7, -2, 61, 13],
  [-1, 4, 63, 10], // crops Roosevelt's chin
  [5, 10, 46, 15],
  [15, 21, 86, 6], // the mass between Roosevelt and Lincoln
  [21, 26, 67 - PROUD, 13], // crops Lincoln's beard; under the 67 mass's top, which it would share
  [27, 32, 51, 12],
  [33, 38, 68, 13], // crops Lincoln's beard
  [38, 43, 40, 8],
  [43, 46, 26, 5],
];

/**
 * The rock above, hanging over the heads. `[x0, x1, bottom, top, face]`.
 * Contiguous in x on purpose: a gap in this row is a hole in a mountain. The
 * skyline peaks at 119 just left of centre; the two outermost crags run all the
 * way down to the masses and carry the shoulders, which is what stops the whole
 * thing reading as a slab.
 */
const CRAGS: readonly (readonly [number, number, number, number, number])[] = [
  [-42, -38, 50, 78, 8],
  [-39, -35, 50, 99, 4],
  [-36, -30, 88, 104, 3],
  [-30, -24, 90, 100, 7],
  [-24, -18, 86, 111, 4],
  [-18, -12, 92, 106, 6],
  [-12, -5, 89, 114, 3],
  [-5, 2, 87, 119, 5],
  [2, 9, 86, 112, 3],
  [9, 15, 88, 117, 4],
  [15, 22, 90, 107, 6],
  [22, 29, 92, 113, 3],
  [29, 35, 89, 102, 5],
  [34, 39, 50, 88, 4],
  [38, 42, 50, 74, 8],
];

/** The solid the crags stand out of, and the dark the gaps between them show. */
const RIDGE_MASS: readonly [number, number, number, number] = [-36, 32, 76, 94];

/** A column set this far back or further is painted `steel` rather than `slate`. */
const DEEP_FACE = 3;

/**
 * The dark plane behind the carving: what the notch between two heads, the shadow
 * under a chin and the gap beside a wig all show. One tone darker than the rock,
 * so a gap reads as depth and never as sky. Kept narrow and close so it does not
 * swing out past the cliff's own edge when the model is turned.
 */
const BACKDROP: readonly [number, number, number, number] = [-36, 36, 40, 94];

// --- the talus -------------------------------------------------------------

/** Two steps of scree, wider than the cliff, which is what makes the foot flare. */
const CONES: readonly (readonly [number, number, number, number, number])[] = [
  // [base width, top width, base y, height, depth]
  [100, 86, 0, 12, 40],
  [86, 68, 12, 13, 33],
];

/**
 * Boulder rows up the cone. `[base y, front z, count, half spread, size]`.
 *
 * **`front` is measured against a face that leans back, and the leaning is what
 * makes the numbers look wrong.** The cone's front face is at z = 19.6 at the
 * grass and z = 13.5 by the top row, so a row set at the same z as the row below
 * it is further *inside* the hill, not further out. The first four values were
 * 18 / 15 / 12 / 9 — a straight taper, which reads as scree receding up the
 * slope and is off by more than the leaning face at every row but the first.
 * Six boulders were sealed inside the cone and drew nothing. Each row now clears
 * the face at its own height by about a unit: proud, not flush, or two coplanar
 * faces would get no ink between them.
 */
const TALUS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 18, 9, 39, 5.2],
  [7, 16.5, 6, 32, 4.8],
  [14, 15, 5, 25, 4.2],
  [21, 12.5, 3, 16, 3.4],
  // Two rows of two, out on the flanks, so the cliff does not meet the grass on
  // a clean vertical corner at either end. These two clear the cone sideways
  // rather than forwards, so it is the spread and not the front that has to
  // carry them past it: at 38 the upper pair sat just inside a face that is
  // 42.7 out at their height, and both were buried.
  [0, 3, 2, 42, 4.6],
  [9, 0, 2, 42, 3.8],
];

/** Ponderosa pine at the foot. `[x, z, height]`. */
const PINES: readonly (readonly [number, number, number])[] = [
  [-38, 22, 12.5],
  [-22, 25, 10],
  [-5, 23, 13],
  [15, 24, 10.5],
  [32, 22, 13.5],
];

// ---------------------------------------------------------------------------
// One head
// ---------------------------------------------------------------------------
//
// Local coordinates: y = 0 is the underside of the chin, which is where the
// carving disappears into raw granite, and z is measured off the cheek plane at
// `CHEEK`. Every number below is a depth off that plane, because a depth off
// that plane is the only thing that draws a feature.

const HEAD_H = 26; // chin to the crown of the skull; the hair goes on top
const JAW_W = 15;
const TEMPLE_W = 17.5;
const HEAD_D = 17;
const CHEEK = 6;

/**
 * The cheeks, and the mass the nose and mouth are cut on. It is a wedge, not a
 * box: 10.5 across at the jaw and 15.6 at the cheekbones, so its sides run into
 * the head's own silhouette instead of drawing a rectangle inside the face. A
 * box here — which is what this was first — turns every head into a totem.
 */
const MUZZLE_W = 10.5;
const MUZZLE_TOP = 15.6;
const MUZZLE_Y = 3;
const MUZZLE_H = 10;
const MUZZLE_D = 5;
const MUZZLE_Z = 8.4;

/**
 * The furthest-forward thing above the nose, and everything about the eye
 * depends on it. Exactly as wide as the two sockets it covers: run it to the
 * full width of the head and it stops being a brow and becomes a visor.
 */
const BROW_W = 13.6;
const BROW_Y = 15.6;
const BROW_H = 2.6;
const BROW_D = 4.6;
const BROW_Z = 9.4;

/** Sunk 1.2 behind the muzzle and 2.2 behind the brow: the slot between them is the socket. */
const EYE_X = 4.7;
const EYE_W = 4;
const EYE_H = 2.7;
const EYE_D = 2.2;
const EYE_Y = 12.9;
const EYE_Z = 7.2;

/** Long, and raked back so the root disappears under the brow rather than meeting it. */
const NOSE_W = 5.2;
const NOSE_NARROW = 0.6;
const NOSE_Y = 6.3;
const NOSE_H = 10.4;
const NOSE_D = 4.2;
const NOSE_Z = 11.2;
const NOSE_RAKE = -0.197;

const MOUTH_W = 6.5;
const MOUTH_Y = 4.5;
const MOUTH_H = 1.4;
const MOUTH_D = 2.6;
const MOUTH_Z = 9.6;

/** A wedge as well, narrowing downward: a jaw, where a box is a drawer. */
const CHIN_W = 7;
const CHIN_TOP = 9.6;
const CHIN_H = 4.2;
const CHIN_D = 4;
const CHIN_Z = 9.4;

type Kind = 'washington' | 'jefferson' | 'roosevelt' | 'lincoln';

interface Face {
  kind: Kind;
  /** Centre of the head. */
  x: number;
  /** The chin line, where the carving meets raw rock. */
  base: number;
  /** How far the whole head stands forward of the mountain's own face plane. */
  z: number;
  scale: number;
  yaw: number;
}

const FACES: readonly Face[] = [
  { kind: 'washington', x: -32, base: 61, z: 3, scale: 1.18, yaw: 0.05 },
  { kind: 'jefferson', x: -12.5, base: 64, z: 1, scale: 1.12, yaw: 0.02 },
  { kind: 'roosevelt', x: 7, base: 60, z: -1.5, scale: 1.09, yaw: -0.03 },
  { kind: 'lincoln', x: 29, base: 62, z: 0, scale: 1.14, yaw: -0.06 },
];

/** They were carved looking out over the plain, not down at it. */
const HEAD_LIFT = -0.04;

/**
 * Deterministic variation in [-1, 1]. The step is the golden angle, so the talus
 * never falls into a pattern, and `Math.random()` — which the loader would catch,
 * since it builds twice and compares — is not needed.
 */
const grain = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const mountRushmore: Monument = {
  id: 'mount-rushmore',
  name: 'Mount Rushmore',
  iso: 'USA',
  lat: 43.879,
  lon: -103.459,
  tier: 'landmark',
  footprint: 55,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;

    const rock = palette.slate; // the weathered mountain
    const stone = palette.bone; // the carved granite, paler than what it was cut from
    const shade = palette.steel; // every gap, and the columns set deepest back
    const socket = palette.ink; // the eyes
    const pine = palette.darkOlive;

    const group = new THREE.Group();

    /**
     * A block whose plan is not square: a 4-sided prism carries the flare from
     * `width` at the base to `top` at the crown, and `scale.z` sets the depth
     * afterwards. The only way to get an un-square slab out of a helper that
     * only makes regular prisms — and the depth flares with the width, which is
     * exactly what a leaning rock face wants.
     */
    const wedge = (width: number, top: number, height: number, depth: number, color: number): Mesh => {
      const mesh = taper(width / 2, top / 2, height, color, 4);
      mesh.scale.z = depth / width;
      return mesh;
    };

    /**
     * A column of the mountain, spanning `x0..x1` and `y0..y1` and presenting
     * `face` to the front at its base. It narrows and recedes as it rises, and
     * overhangs its slot so its neighbours never part company.
     */
    const pillar = (x0: number, x1: number, y0: number, y1: number, face: number): void => {
      const width = x1 - x0 + OVERLAP * 2;
      const depth = face - BACK;
      const mesh = wedge(width, width * LEAN, y1 - y0, depth, face <= DEEP_FACE ? shade : rock);
      mesh.position.set((x0 + x1) / 2, y0, face - depth / 2);
      group.add(mesh);
    };

    /** A plain rock block, for the shelves the heads grow out of. */
    const slab = (x0: number, x1: number, y0: number, y1: number, face: number): void => {
      const depth = face - BACK;
      const mesh = box(x1 - x0, y1 - y0, depth, rock);
      mesh.position.set((x0 + x1) / 2, y0, face - depth / 2);
      group.add(mesh);
    };

    // -----------------------------------------------------------------------
    // 1. The mountain, back to front.
    // -----------------------------------------------------------------------

    // The plane every gap in the carving shows. One tone darker than the rock,
    // so a notch between two heads reads as depth and never as sky.
    const [bx0, bx1, by0, by1] = BACKDROP;
    const backdrop = box(bx1 - bx0, by1 - by0, 5, shade);
    backdrop.position.set((bx0 + bx1) / 2, by0, -11.5);
    group.add(backdrop);

    const [rx0, rx1, ry0, ry1] = RIDGE_MASS;
    const ridge = box(rx1 - rx0, ry1 - ry0, 21, shade);
    ridge.position.set((rx0 + rx1) / 2, ry0, -9.5);
    group.add(ridge);

    for (const [x0, x1, top, face] of MASSES) pillar(x0, x1, 0, top, face);
    for (const [x0, x1, bottom, top, face] of CRAGS) pillar(x0, x1, bottom, top, face);
    for (const [x0, x1, top, face] of RIBS) pillar(x0, x1, 0, top, face);

    // -----------------------------------------------------------------------
    // 2. The heads.
    // -----------------------------------------------------------------------

    const head = (kind: Kind): Group => {
      const face = new THREE.Group();

      /** A carved block, placed by the plane it presents to the front. */
      const cut = (
        width: number,
        height: number,
        depth: number,
        color: number,
        x: number,
        y: number,
        z: number,
      ): Mesh => {
        const mesh = box(width, height, depth, color);
        mesh.position.set(x, y, z - depth / 2);
        face.add(mesh);
        return mesh;
      };

      // The skull: wider at the temples than at the jaw, and three quarters of
      // it inside the mountain.
      const skull = wedge(JAW_W, TEMPLE_W, HEAD_H, HEAD_D, stone);
      skull.position.z = CHEEK - (HEAD_D * TEMPLE_W) / JAW_W / 2;
      face.add(skull);

      const muzzle = wedge(MUZZLE_W, MUZZLE_TOP, MUZZLE_H, MUZZLE_D, stone);
      muzzle.position.set(0, MUZZLE_Y, MUZZLE_Z - (MUZZLE_D * MUZZLE_TOP) / MUZZLE_W / 2);
      face.add(muzzle);

      cut(BROW_W, BROW_H, BROW_D, stone, 0, BROW_Y, BROW_Z);
      for (const side of [-1, 1]) {
        cut(EYE_W, EYE_H, EYE_D, socket, side * EYE_X, EYE_Y, EYE_Z);
      }

      const nose = wedge(NOSE_W, NOSE_W * NOSE_NARROW, NOSE_H, NOSE_D, stone);
      nose.position.set(0, NOSE_Y, NOSE_Z - NOSE_D / 2);
      nose.rotation.x = NOSE_RAKE;
      face.add(nose);

      if (kind !== 'roosevelt') cut(MOUTH_W, MOUTH_H, MOUTH_D, stone, 0, MOUTH_Y, MOUTH_Z);
      if (kind !== 'lincoln') {
        const chin = wedge(CHIN_W, CHIN_TOP, CHIN_H, CHIN_D, stone);
        chin.position.set(0, 0, CHIN_Z - (CHIN_D * CHIN_TOP) / CHIN_W / 2);
        face.add(chin);
      }

      /** The crown. Every head gets a taper, so none of them ends on a flat lid. */
      const crown = (width: number, top: number, height: number, depth: number, y: number, z: number): void => {
        const mesh = wedge(width, top, height, depth, stone);
        mesh.position.set(0, y, z - depth / 2);
        face.add(mesh);
      };

      if (kind === 'washington') {
        crown(18.6, 15, 8.8, 6, 20.4, 7.6); // the wig
        cut(20.5, 3.2, 8.4, stone, 0, 17.6, 10.4); // its roll over the forehead: the brim
        cut(15, 6.6, 5.4, stone, 0, -6, 8.6); // a collar, still half in the rock
      } else if (kind === 'jefferson') {
        crown(17, 8.5, 11, 6.6, 19.4, 7.2); // swept back and up, and the tallest head
      } else if (kind === 'roosevelt') {
        crown(17.4, 11.5, 9, 6, 20, 7.2);
        // The pince-nez, and its shadow; `PROUD` in front of the brow, whose
        // face it would otherwise share and flicker in.
        cut(16.2, 1.4, 2.4, shade, 0, 15, BROW_Z + PROUD);
        cut(8.4, 2.4, 3.4, stone, 0, 4.7, 10.8); // the moustache, which is his mouth
      } else {
        crown(17.4, 11, 8, 6, 21.4, 7.2); // a high forehead, so a high hairline
        const beard = wedge(12, 8.5, 10, 6.4, stone);
        beard.position.set(0, -5, 10.8 - 3.2);
        face.add(beard);
      }

      return face;
    };

    for (const spec of FACES) {
      // The rough block the carving grows out of. It crosses the chin line, so
      // no head ends on a clean edge, and it is the mountain's colour.
      const shelf = (TEMPLE_W / 2 + 3) * spec.scale;
      slab(spec.x - shelf, spec.x + shelf, spec.base - 13, spec.base + 1.5, spec.z + 5.5);

      const carved = head(spec.kind);
      carved.position.set(spec.x, spec.base, spec.z);
      carved.scale.setScalar(spec.scale);
      carved.rotation.y = spec.yaw;
      carved.rotation.x = HEAD_LIFT;
      group.add(carved);
    }

    // -----------------------------------------------------------------------
    // 3. The talus. Four hundred thousand tonnes came off this mountain and
    //    none of it was carried away; the heap is still there, and it is half of
    //    what a photograph of Rushmore contains. It is also what stops the cliff
    //    standing on a straight edge like a tower.
    // -----------------------------------------------------------------------

    for (const [width, top, y, height, depth] of CONES) {
      const cone = wedge(width, top, height, depth, rock);
      cone.position.y = y;
      group.add(cone);
    }

    let index = 0;
    for (const [y, front, count, spread, size] of TALUS) {
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i - (count - 1) / 2) / ((count - 1) / 2);
        const scatter = grain(index, 2.7);
        const radius = size * (0.7 + 0.3 * (1 + scatter));
        // Fresh blasting waste is paler than the weathered face; the rest has
        // been lying there since 1941.
        const tint = grain(index, 4.3);
        const color = tint > 0.5 ? stone : tint < -0.65 ? shade : rock;
        // A row up the heap stands on a cone, and chunks of two colours there
        // would share the row's underside plane and flicker where they overlap,
        // so each colour is sunk its own `PROUD` into the cone. The ground row
        // stays on y = 0.
        const sink = y > 0 ? (color === stone ? 0 : color === rock ? PROUD : 2 * PROUD) : 0;
        const chunk = taper(
          radius,
          radius * 0.62,
          radius * (1.2 + 0.35 * scatter),
          color,
          5,
        );
        chunk.rotation.y = grain(index, 0.4) * 0.6;
        chunk.position.set(t * spread + grain(index, 1.1) * 3, y - sink, front + grain(index, 3.5) * 2);
        group.add(chunk);
        index++;
      }
    }

    for (const [x, z, height] of PINES) {
      const tree = taper(height * 0.17, 0.25, height, pine, 5);
      tree.position.set(x, 0, z);
      group.add(tree);
    }

    return group;
  },
};
