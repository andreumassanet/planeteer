import type { Monument } from './contract.ts';
import { PROUD as STEP_PROUD } from './contract.ts';

/**
 * Taipei 101.
 *
 * **Every other tall thing on this sheet narrows as it rises.** Burj Khalifa
 * spirals inward through eighteen setbacks, the Empire State steps back four
 * times and telescopes into a mast, Petronas rings in to 53% of its width above
 * floor 60. All three are one mass converging on a point, which is what a
 * skyscraper looks like.
 *
 * Taipei 101 does the opposite, eight times in a row. Each of its eight modules
 * is a **truncated pyramid stood on its head** — narrow at the bottom, splayed
 * 7 degrees outward all the way up, so it finishes a fifth wider than it
 * started. Then the plan drops back to where the module began and does it
 * again. The eight modules are the *same size*: the stack does not diminish, it
 * repeats. The silhouette is a sawtooth with a vertical envelope, and nothing
 * else in this world is shaped like that.
 *
 * Everything in this file is one of five things, and the first one is the file:
 *
 * - **The inverted taper, eight times.** If the outline narrows as it rises, the
 *   model is a generic tower and the work was wasted. The plan is stretched
 *   hard (see below) for one reason only: to keep the splay above the ink line.
 * - **The notch between modules.** A dark band at the foot of every module,
 *   inset 0.55 units from the module above and overhung by 1.59 from the module
 *   below, so the shaft reads as eight separate segments rather than one striped
 *   mass. The overhang is not a mesh: module *n*'s top is already 1.04 units
 *   wider per side than module *n+1*'s bottom, so the flare builds its own
 *   cornice at every junction and the band only has to be darker than both.
 * - **The medallions.** Four `gold` roundels at the four corners of every
 *   junction — the ruyi ornaments, one on each shoulder, mounted so they project
 *   0.67 units past the widest point of the module they sit on and break the
 *   silhouette. Thirty-two of them, which is 44% of the model's meshes and 57% of
 *   its triangles, and they are worth it: they are the only ornament on the
 *   building and they mark the eight junctions a second time in a colour nothing
 *   else here uses.
 * - **The stepped base.** Three stacked boxes with cornices, 9.4 units half-wide
 *   against the shaft's 5.21 — **1.8x wider than the tower stands on it** — and
 *   they step *inward* as they rise. The base converging and the shaft splaying
 *   above it, sharing one silhouette, is the read at any size.
 * - **The spire.** 8.17 units of the 69.9, **11.7%**, which is the real 60 m of
 *   508 to two significant figures. A collar, a mast, a bead and a needle.
 *
 * ## Tier: `tower`, and the argument is a comparison of two errors
 *
 * There is no tier between `tower`'s 70 units and `landmark`'s 120, and the gap
 * is 1.71x. So the question is not "which tier is right" — neither is — but
 * **which of the two available errors is smaller**, measured against the two
 * neighbours this building will actually be confused with.
 *
 * At 508 m, Taipei 101 is 1.12x Petronas (452 m) and 0.61x Burj Khalifa (828 m).
 *
 * - **Filed `tower` (70 units)** the sheet says it is exactly as tall as
 *   Petronas and the Empire State. It is 12% taller than one and 15% taller than
 *   the other. **The sheet understates it by at most 15%.**
 * - **Filed `landmark` (120 units)** the sheet says it is 1.71x Petronas, where
 *   it is 1.12x — an overstatement of 52% — and says it equals the Burj, where
 *   it is 0.61x, an overstatement of 63%. **The sheet overstates it by 52-63%.**
 *
 * `tower` is four times more accurate. That is the whole argument and it does
 * not need any taste in it.
 *
 * Two checks, both landing on the same number:
 *
 * - **Interpolate.** Pin the scale on the Burj — 120 units at 828 m — and Taipei
 *   101 comes out at **73.6 units**. Pin it on Petronas — 70 at 452 — and it
 *   comes out at **78.6**. Both estimates sit within 12% of `tower`'s 70 and
 *   miss `landmark`'s 120 by nearly 40%.
 * - **The record cannot separate it from Petronas.** Petronas held the outright
 *   world record 1998-2004; Taipei 101 took it off Petronas and held it
 *   2004-2010. **Six years each, to the year.** Two buildings with identical
 *   tenures of the same record cannot be filed at different tiers on the
 *   strength of that record, and Petronas is a `tower`.
 *
 * ## The collision is on the sheet, not on the planet
 *
 * `empire-state.ts` argued its tier partly from world-unit distance: it and the
 * Statue of Liberty are 20.7 units apart, so their tiers have to agree or the
 * office block eats the statue. **That lever does not exist here.** At 279 units
 * per degree, Taipei 101's nearest neighbours in `monuments.source.json` are
 * Gyeongbokgung at about 4,100 units, the Forbidden City at about 4,300 and
 * Mount Fuji at about 4,900 — a walk of minutes at a run, and no two of them are
 * ever in frame together. **Nothing on this planet is close enough to this
 * building for its tier to be a placement decision.**
 *
 * So the tier here is doing one job and one only: saying how tall this is
 * *relative to the other skyscrapers on the contact sheet*, which are the things
 * it will be read beside. That is exactly the comparison the error arithmetic
 * above measures, and it is why that arithmetic is allowed to decide alone.
 *
 * ## Plan stretch: 1.8x uniform, and the flare is what sets the number
 *
 * The vertical metre is `70 / 508 = 0.1378` units. At that rate the plan is a
 * disaster:
 *
 * - The tower is 508 m over a 50.4 m module at its widest: **10.1 : 1**, more
 *   slender than anything else on the sheet including Petronas at 9.8.
 * - Worse, and this is the number that decides the file: a module splays 7
 *   degrees over its 33.6 m, which is **4.2 m per side**. At the height's own
 *   scale that is **0.58 units** — and a monument-sheet cell runs about 2.9
 *   pixels to the unit (`empire-state.ts` measures it: nine bands on a
 *   12.3-unit face at ~4 px each). **0.58 units is 1.7 pixels of splay, which
 *   is the pen.** The eight modules would come back as a straight-sided shaft
 *   with some noise on its edges, and the one thing that makes this building
 *   unmistakable would be gone.
 *
 * So **the whole plan is scaled by 1.8 against the height** — modules, base,
 * ornaments and all, uniformly, so every plan *ratio* survives untouched: the
 * flare stays 1.20 : 1, the base stays 1.8x the shaft, the medallions stay 8 m
 * against a 42 m face. The splay becomes **1.04 units, 3.0 pixels per side, 6.0
 * across a module** — twice the pen, which is the floor for a slope reading as a
 * slope. Below about 1.72x it goes back under the ink; above 2x the tower starts
 * looking like a chimney. 1.8 is the smallest number that works.
 *
 * **What the stretch cost, and the fix.** Two things, and only the second one
 * was fixable:
 *
 * 1. **The slenderness.** 10.1 : 1 becomes 5.6 : 1 — which happens to be the
 *    Empire State's shaft exactly (12.3 units over 70), and chunkier than
 *    Petronas at 7.6. In life Taipei 101 is the *most* slender of the three;
 *    here it is the second chunkiest. That inversion is accepted deliberately:
 *    slenderness is the proportion you name *Petronas* by, and nobody has ever
 *    named Taipei 101 by anything but the eight flaring modules. Distort the
 *    axis that carries the least recognition.
 * 2. **The module aspect, and this one is fixed.** A real module is 33.6 m tall
 *    on a 42 m face — taller-than-half-its-width, 0.80 : 1. After the stretch
 *    each module here is 4.38 units on a 10.42-unit face, **0.42 : 1**, very
 *    nearly twice as squat. Eight squat segments are in danger of merging into
 *    plain horizontal banding, so the junction band is built at **0.62 units
 *    where the scaled reveal is 0.15** — 4x — and inset 0.55 rather than the
 *    0.25 the plan metre would give, 2.2x. The groove has to do more work
 *    because the stretch made the segments flatter. Both numbers are here rather
 *    than in a comment because they are consequences of the 1.8, not choices.
 *
 * Where this lands against `MAX_ASPECT`: **14.38 units of half-diagonal against
 * 69.9 tall is 0.41 against a cap of 4**, ten times of headroom. As with both
 * other towers here the cap is nowhere near; the binding constraint is `tower`'s
 * deliberately tight 28-unit footprint, and the declared **14.5** is 52% of it.
 *
 * ## Not the other three towers
 *
 * Four skyscrapers on one sheet is the real risk in this file, so every axis of
 * separation is spent:
 *
 * - **Shape.** The other three converge; this one repeats and splays. Their
 *   silhouettes are triangles, this one is a column of eight wedges.
 * - **Colour.** The Burj and the Empire State are both `bone`; Petronas is
 *   `slate`. All three are grey. This one is **`green`** — 0x91ad78, the closest
 *   entry in the palette to Taipei 101's blue-green curtain wall, and the only
 *   tall thing here with a hue. A green tower on a sheet of grey ones is
 *   separable before any detail resolves at all.
 * - **The dark is warm, and that is not decoration.** The eight grooves are the
 *   deepest recesses in the model. The note beside `palette` in `contract.ts`
 *   measures `steel` at 13,13,12 once it turns away from the sun — effectively
 *   black — and a black slot with cyan sky nearby reads as a *hole*, which is
 *   exactly the failure that sent the Parthenon's cella from `bone` to `tan`.
 *   Eight holes up a tower would be a disaster. The grooves are **`darkOlive`**
 *   (0x574e37), which holds a warm hue in shade and reads as a shadowed recess
 *   in a green wall rather than a gap in it. Both other towers use `steel` for
 *   their dark; this one does not use `steel` at all.
 * - **Ornament.** Nothing else tall here has any. Thirty-two `gold` roundels,
 *   four to a junction, on a green wall.
 * - **The base goes the other way from the shaft.** Three boxes stepping in
 *   under eight wedges stepping out. The Empire State's base and shaft both
 *   narrow; the Burj's podium is a plinth; Petronas' is a flat mall block.
 *
 * ## Traded away, and why
 *
 * - **The modules are square, not chamfered.** The real floor plate clips its
 *   corners. Four sides is what gives the front elevation two clean splaying
 *   edges and a flat face on +Z; eight sides would round the corners off and
 *   cost 128 triangles to soften the one line the model exists to draw. It also
 *   keeps the corner a sharp vertical edge for the medallions to sit on.
 * - **No cornice mesh at the junctions.** See above: the flare makes the
 *   overhang for free. Eight cornices would have been eight meshes for an ink
 *   line the geometry was already going to draw.
 * - **The ruyi are discs.** The real ornament is a curled scepter head. Six
 *   sides and 24 triangles each is what makes thirty-two of them affordable at
 *   the `tower` tier; below about ten pixels a curl is a blob, and a blob with
 *   an outline round it is a roundel.
 * - **No curtain-wall mullions on the modules.** They would have to lean with
 *   the splay, which means `strut`s, four to a module face — 128 meshes for a
 *   texture that dies at thirty units. The vertical piers that survive are on
 *   the base, where the walls are plumb and a beam driven through the block
 *   surfaces on two faces for one mesh.
 * - **The podium is one dark plate.** Taipei 101 stands on a six-storey mall
 *   with a curved front. Here that is 0.9 units of `bark` at the pavement, which
 *   is the Empire State's granite-course trick: a dark line under the stone so
 *   the building meets the ground somewhere instead of growing out of it.
 */

// ---------------------------------------------------------------------------
// Scale. The vertical and the horizontal have different metres — see the header.
// ---------------------------------------------------------------------------

/** Metres to the tip of the spire, over the 70 units of the `tower` tier. */
const UNIT = 70 / 508;
/** The plan's metre: 1.8x the height's, uniformly, so plan ratios are untouched. */
const PLAN = UNIT * 1.8;

// --- elevation --------------------------------------------------------------
const APRON_TOP = 0.9;
const STEP1_TOP = 5.6;
const LEDGE1_TOP = 6.15;
const STEP2_TOP = 10.3;
const LEDGE2_TOP = 10.85;
/** Top of the stepped base, floor 26 at about 100 m. The eight modules start here. */
const BASE_TOP = 100 * UNIT;
/** Top of module eight, floor 90 at about 390 m. */
const STACK_TOP = 390 * UNIT;
/** The roof at 448 m. Everything above it is spire. */
const ROOF = 448 * UNIT;
/**
 * The tier ceiling less a hair. `validate` allows 70.05 and 508 * UNIT lands on
 * 70 exactly in real arithmetic but not necessarily in floating point, and a
 * monument that fails its own tier by 1e-14 is a bad way to spend an afternoon.
 */
const TOP = 69.9;

// --- the eight modules ------------------------------------------------------
const MODULES = 8;
const PITCH = (STACK_TOP - BASE_TOP) / MODULES;
/** The notch. 4x the scaled reveal: see *what the stretch cost* in the header. */
const BAND_H = 0.62;
const MODULE_H = PITCH - BAND_H;

/** Half-widths across the flats. 42 m at the bottom of a module, 50.4 m at the top. */
const MODULE_BOTTOM = 21 * PLAN;
const MODULE_TOP = 25.2 * PLAN;
/** How far the notch is inset from the module standing on it. 2.2x the scaled value. */
const NOTCH = 0.55;
const BAND_HALF = MODULE_BOTTOM - NOTCH;

/** A square's corner distance against its half-width across the flats. */
const CORNER = Math.SQRT2;

// --- the ruyi medallions ----------------------------------------------------
/**
 * 8 m across on a 42 m face, sized by the **plan** metre like everything else
 * horizontal, so the 1.8x that saves the flare saves these too and no separate
 * exaggeration is needed.
 */
const MEDAL_R = 4 * PLAN;
const MEDAL_T = 6 * PLAN;
/**
 * Clearance under the top of the module the medallion is mounted on, the
 * contract's `PROUD`: at 0.05 the disc's top flat and the module's top were two
 * colours a hair apart, facing up, and flickered.
 */
const MEDAL_DROP = STEP_PROUD;

// --- plan: the base, half-widths across the flats, in the same plan metre ---
// 82 m at the pavement down to 56 m where the stack starts, against the shaft's
// 42 m. Every one of these goes through `PLAN` for the same reason the modules
// do: the 1.8 is only honest if it is applied to the whole plan at once.
const APRON_HALF = 41 * PLAN;
const STEP1_HALF = 38 * PLAN;
const LEDGE1_HALF = 40.2 * PLAN;
const STEP2_HALF = 33 * PLAN;
const LEDGE2_HALF = 35.2 * PLAN;
const STEP3_HALF = 27.8 * PLAN;

/**
 * How far a dark pier stands out of the base wall it is set into.
 *
 * Big Ben's trick, repeated by the Empire State and worth repeating again: a
 * recess this shallow is invisible under a four-step cel ramp, which has nothing
 * between "lit" and "lit" to spend on it. A pier standing *proud* earns its own
 * outline, and an outline is a hard black line at any distance.
 */
const PROUD = 0.28;

/** Non-negative offsets, mirrored about the axis; a 0 stays single. */
const mirrored = (offsets: number[]): number[] =>
  offsets.flatMap((offset) => (offset === 0 ? [0] : [offset, -offset]));

export const taipei101: Monument = {
  id: 'taipei-101',
  name: 'Taipei 101',
  iso: 'TWN',
  lat: 25.034,
  lon: 121.565,
  realHeight: 508,
  tier: 'tower',
  footprint: 14.5,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;

    // The blue-green curtain wall. `green` is the only entry in the palette with
    // a hue that could stand for it, and it is what separates this tower from
    // three grey ones at a glance. See *not the other three towers*.
    const glass = palette.green;
    // Every dark on the building: the eight grooves, the base piers, the doorway
    // and the top of the crown. Warm on purpose — see the header. Deliberately
    // **not** `steel`, which is what the Burj, the Empire State and Petronas all
    // use and which goes hueless in exactly the recesses this model depends on.
    const dark = palette.darkOlive;
    // The ruyi, the observatory band and the doorway lintel.
    const gilt = palette.gold;
    // The base's stone, and the sunlit top of each of its cornices.
    const stone = palette.tan;
    const trim = palette.sand;
    // The pavement plate.
    const ground = palette.bark;
    // The spire. The brightest thing in the palette, because a needle 0.2 units
    // thick against a cyan sky has nothing but contrast to survive on.
    const steelwork = palette.white;

    const group = new THREE.Group();

    /** A rectangular course, placed by the heights it starts and stops at. */
    const slab = (base: number, top: number, half: number, color: number): void => {
      const mesh = box(half * 2, top - base, half * 2, color);
      mesh.position.y = base;
      group.add(mesh);
    };

    /** A pier driven through a base step: one mesh, front face and back. */
    const acrossFront = (
      base: number,
      top: number,
      x: number,
      half: number,
      width: number,
    ): void => {
      const pier = box(width, top - base, half * 2 + PROUD * 2, dark);
      pier.position.set(x, base, 0);
      group.add(pier);
    };

    /** The same beam turned through a right angle: one mesh, both side faces. */
    const alongSide = (
      base: number,
      top: number,
      z: number,
      half: number,
      depth: number,
    ): void => {
      const pier = box(half * 2 + PROUD * 2, top - base, depth, dark);
      pier.position.set(0, base, z);
      group.add(pier);
    };

    // --- the pavement, and the base stepping inward ---
    slab(0, APRON_TOP, APRON_HALF, ground);
    slab(APRON_TOP, STEP1_TOP, STEP1_HALF, stone);
    slab(STEP1_TOP, LEDGE1_TOP, LEDGE1_HALF, trim);
    slab(LEDGE1_TOP, STEP2_TOP, STEP2_HALF, stone);
    slab(STEP2_TOP, LEDGE2_TOP, LEDGE2_HALF, trim);
    // The top of the base is already curtain wall, which is what stitches the
    // stone to the stack: the colour changes one step before the shape does.
    slab(LEDGE2_TOP, BASE_TOP, STEP3_HALF, glass);

    // Piers on the two tall steps. Four bays across the front, three down the
    // side, and none through the middle of the front because the doorway is
    // there. The third step is glass and gets none: it is 2.9 units tall and
    // striping it would be texture, not structure.
    for (const x of mirrored([2.6, 6.5])) {
      acrossFront(APRON_TOP, STEP1_TOP, x, STEP1_HALF, 1.5);
    }
    for (const z of mirrored([4.7])) {
      alongSide(APRON_TOP, STEP1_TOP, z, STEP1_HALF, 1.5);
    }
    for (const x of mirrored([4.1])) {
      acrossFront(LEDGE1_TOP, STEP2_TOP, x, STEP2_HALF, 1.4);
    }

    // --- the doorway. It marks +Z for the one check `validate` cannot make,
    //     and it is the only thing in the model with a human dimension on it. ---
    const portal = box(3.2, 3.0, 0.7, dark);
    portal.position.set(0, APRON_TOP, STEP1_HALF);
    group.add(portal);

    const lintel = box(4.2, 0.55, 0.6, gilt);
    lintel.position.set(0, APRON_TOP + 3.0, STEP1_HALF + 0.05);
    group.add(lintel);

    // --- the eight modules ---------------------------------------------------
    //
    // All eight identical, which is the point: the stack repeats instead of
    // diminishing, so the overall envelope is vertical and every segment of it
    // splays. Each iteration lays a dark band, stands a flaring frustum on it,
    // and rings the frustum's shoulders with four medallions.

    /** Half-width across the flats a fraction `t` of the way up a module. */
    const halfAt = (t: number): number =>
      MODULE_BOTTOM + (MODULE_TOP - MODULE_BOTTOM) * t;

    /**
     * How far out the medallions are mounted, measured along the corner
     * diagonal, and the one number in the file that had to be solved rather
     * than chosen.
     *
     * A disc hung on a *splaying* corner is buried at the top of its travel and
     * floating at the bottom, because the wall behind it moves outward as it
     * rises. So the back of the disc is set just inside the corner at the disc's
     * **lowest** point — where the wall is nearest the axis — and it is made
     * thick enough (1.49 units, of which about a unit is buried) to still stand
     * 0.67 proud at the module's widest. Embedded over its whole height, proud
     * over its whole height, no gap behind it at any bearing.
     */
    const MEDAL_BACK =
      halfAt((MODULE_H - 2 * MEDAL_R - MEDAL_DROP) / MODULE_H) * CORNER - 0.15;

    /** Four ruyi on the four shoulders of a module, at height `y` above its base. */
    const ruyi = (y: number) =>
      around(MODULES / 2, () => {
        // `around` puts its copies on the axes; the ornaments belong on the
        // corners, so each one carries its own 45 degrees.
        const shoulder = new THREE.Group();
        shoulder.rotation.y = Math.PI / 4;

        const disc = column(MEDAL_R, MEDAL_T, gilt, 6);
        // A prism runs up +Y from its own base; laid on its back it runs out
        // along +Z from its origin, which is where the corner is.
        disc.rotation.x = Math.PI / 2;
        disc.position.set(0, y, MEDAL_BACK);
        shoulder.add(disc);

        return shoulder;
      });

    for (let index = 0; index < MODULES; index++) {
      const bandBase = BASE_TOP + index * PITCH;
      const moduleBase = bandBase + BAND_H;

      slab(bandBase, moduleBase, BAND_HALF, dark);

      const shell = taper(MODULE_BOTTOM, MODULE_TOP, MODULE_H, glass, 4);
      shell.position.y = moduleBase;
      group.add(shell);

      group.add(ruyi(moduleBase + MODULE_H - MEDAL_R - MEDAL_DROP));
    }

    // --- the crown ------------------------------------------------------------
    // One bright band where the stack stops — the 89th and 91st floor decks, and
    // the same trick the Empire State plays at its own observatory: give the eye
    // a target exactly where the silhouette changes character. Then three
    // receding steps, the only place on the building where anything narrows.
    slab(STACK_TOP, STACK_TOP + 0.76, 4.9, gilt);

    const crown: Array<[bottom: number, top: number, to: number, color: number]> = [
      [4.6, 4.0, 57.4, glass],
      [3.75, 3.05, 59.9, dark],
      [2.8, 1.85, ROOF, dark],
    ];
    let crownBase = STACK_TOP + 0.76;
    for (const [bottom, top, to, color] of crown) {
      const step = taper(bottom, top, to - crownBase, color, 4);
      step.position.y = crownBase;
      group.add(step);
      crownBase = to;
    }

    // --- the spire: 8.17 units of 69.9, the real 60 m of 508 -------------------
    // Four lengths and a bead. A bare stick is a scratch on the sky; the collar
    // at its foot and the dark bead two thirds of the way up are what make it a
    // piece of engineering, and they cost 48 triangles between them.
    const collar = column(1.5, 0.55, steelwork, 6);
    collar.position.y = ROOF;
    group.add(collar);

    const mast = taper(1.05, 0.62, 3.3, steelwork, 6);
    mast.position.y = ROOF + 0.55;
    group.add(mast);

    const bead = column(0.66, 0.45, dark, 6);
    bead.position.y = ROOF + 3.85;
    group.add(bead);

    const upper = taper(0.44, 0.24, 2.4, steelwork, 6);
    upper.position.y = ROOF + 4.3;
    group.add(upper);

    const needle = taper(0.22, 0.05, TOP - (ROOF + 6.7), steelwork, 4);
    needle.position.y = ROOF + 6.7;
    group.add(needle);

    return group;
  },
};
