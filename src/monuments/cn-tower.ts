import type { Monument } from './contract.ts';

/**
 * CN Tower.
 *
 * ## Tier: `landmark`, and the argument is entirely about height
 *
 * At 553 m this is the tallest structure on the whole sheet but one — the only
 * things above it are the Burj Khalifa and the mountains. Read off the sibling
 * files, the company it has to be placed among:
 *
 * | | metres | tier | model units |
 * |---|---|---|---|
 * | Burj Khalifa | 828 | `landmark` | 120 |
 * | **CN Tower** | **553** | ? | ? |
 * | Taipei 101 | 508 | `tower` | 70 |
 * | Petronas Towers | 452 | `tower` | 70 |
 * | Empire State | 443 | `tower` | 70 |
 * | Tokyo Tower | 333 | `landmark` | 120 |
 * | Eiffel Tower | 330 | `landmark` | 120 |
 * | Space Needle | 184 | `tower` | 70 |
 * | Big Ben | 96 | `tower` | 70 |
 * | Statue of Liberty | 93 | `tower` | 70 |
 * | Leaning Tower of Pisa | 57 | `tower` | 70 |
 *
 * **That column is not sorted by metres, and the exceptions are the argument.**
 * A 508 m building is a `tower` and a 333 m one is a `landmark`. What the sheet
 * has actually converged on is a split by *kind*: every supertall office
 * building is filed `tower` — Taipei 101, Petronas, Empire State, all of them
 * taller than the Eiffel Tower and all of them 70 units — while every
 * free-standing tower is filed `landmark`, down to the Atomium at 102 m. One
 * building crosses the line, the Burj Khalifa, and it crosses it for one reason:
 * it holds the record.
 *
 * This monument is on the `landmark` side of both halves of that split. It is
 * not a building, and it held the record. Walking the four rungs anyway:
 *
 * - **`monument` (15 tall, 14 footprint)** — "you find it by walking into it. A
 *   gate, a statue, a fountain, a stone circle." At 15 units the thing that was
 *   the tallest free-standing structure on Earth would stand shorter than the
 *   Arc de Triomphe's attic band, and the antenna — 19% of the model — would be
 *   2.8 units. Refused on sight.
 * - **`building` (40 tall, 55 footprint)** — the tier's own examples are an
 *   amphitheatre, an opera house, a palace, a cathedral, and the sentence is
 *   "you see it from the far side of the city". Wrong on both counts: this is
 *   not a building (see below) and it is not read from across the city, it is
 *   read from across Lake Ontario. The killing arithmetic is the detail budget,
 *   not the tier's footprint: at 40 units the antenna is 7.5 units, the upper
 *   pod is 0.98 units tall and the main pod's nine decks compress into 1.99.
 *   Three of the six things the silhouette is made of would be sub-pixel on the
 *   contact sheet. Refused.
 * - **`tower` (70 tall, 28 footprint)** — "the landmark of its city. Big Ben,
 *   Pisa, the Statue of Liberty." Superficially this is the right sentence: the
 *   CN Tower is exactly what Toronto is drawn as, and it is the rung the three
 *   supertall buildings above took. Two numbers refuse it. First, the tier-mates
 *   it is named after are 96, 57 and 93 m, mean **82 m**; this is **6.7x** that.
 *   Second and decisive, at 70 units it would stand **0.58 of the Tokyo Tower**,
 *   which is 333 m, a `landmark`, and a copy of the Eiffel Tower — so a
 *   free-standing tower that was the tallest on Earth would be filed *below* a
 *   free-standing tower 220 m shorter that was never the tallest anywhere.
 *   Against the Eiffel Tower itself the same 0.58 lands opposite a real ratio of
 *   1.68x: a **2.9x inversion**, on the single axis this monument is about. And
 *   the tier's tight 28-unit footprint, the constraint it uses to refuse things
 *   like the Arc de Triomphe, is six times more room than this needs — the
 *   thing that tier is built to enforce does not bind here at all. Refused.
 * - **`landmark` (120 tall, 55 footprint)** — "the landmark of the planet." It
 *   held the record for the world's tallest free-standing structure from 1975
 *   to 2007, **thirty-two years**, and lost it to the Burj Khalifa, which is on
 *   this sheet as a `landmark` for that same reason, and is the *only* building
 *   there. Two consecutive holders of one record belong on the same rung. Taken.
 *
 * The one entry this has to answer for is **Taipei 101**: 508 m, filed `tower`,
 * 45 m shorter than this and 50 units shorter in the model — 1.09x apart in life
 * and 1.71x apart on the sheet. That gap is the genre split doing its job, and
 * the two files' own footprints say the same thing without being asked: Taipei
 * 101 declares 14.5 against this file's 4.8. One has a hundred and one floors
 * and the other has none.
 *
 * The cost is the one the contract already names and blesses: 553 against the
 * Burj's 828 and the Eiffel's 330 all come out at 120 units, so in metres the
 * ladder lies by 1.5x in one direction and 1.68x in the other. That is the same
 * trade that puts Christ the Redeemer (38 m) and the Eiffel Tower (330 m) at
 * the same height, and the alternative — 70 against 120 — is a *bigger* lie
 * pointing the *wrong* way.
 *
 * **What is left to say 553 m with, then, is width.** Every landmark gets the
 * same 120 units, so the only axis still free is the plan, and this file spends
 * all of it: footprint **4.8**, against the Burj Khalifa's 14.5, the Tokyo
 * Tower's 26 and the Eiffel Tower's 35. Three times narrower than the Burj at
 * the same height, seven times narrower than the Eiffel, and the narrowest
 * declared footprint anywhere on the sheet. On a rung where everything is 120
 * units tall, this one is a hair and the rest are masses, and that is the whole
 * point of it.
 *
 * ## Aspect, and the three distortions
 *
 * `halfDiagonal / height` is **4.70 / 120 = 0.039** against a cap of 2.00. This
 * monument is at the opposite end of the range from the Golden Gate: there is
 * nothing to crop and nothing to stretch, and the `MAX_ASPECT` policy never
 * comes into play. Every elevation in the file is the real tower's, in metres,
 * multiplied by `U = 120 / 553.33`, and `at()` is right there in the code so
 * any number can be checked against a section drawing.
 *
 * Three things are not that, and all three are declared:
 *
 * 1. **The main pod is 1.10x taller than life** — 27.5 m of model against about
 *    25 m of real pod, so its height/width goes 0.82 to 0.90. This is the Space
 *    Needle discrimination and it is deliberate; see below.
 * 2. **The upper pod is about 1.2x wider than life** — 15.2 m against something
 *    nearer 13. Built honestly it disappeared. Rendered at 180 pixels, which is
 *    roughly what a monument-sheet thumbnail gives a 120-unit model, a 2.7-unit
 *    drum on a 1.5-unit mast was one grey pixel of swelling, and the tower lost
 *    one of the six things it is made of. Widened, it is 2.14x the shaft it
 *    stands on and it survives. It is still only **half the main pod's width**,
 *    which is the proportion that actually matters, since the pair has to read
 *    as a big pod and a small one.
 * 3. **The plan widths are proportions off elevation photographs, not a spec
 *    sheet.** I have the tower's heights to the metre and not its base width,
 *    so the base is set by slenderness instead: **12.8 : 1** across the buttress
 *    noses (9.40 units wide, 120 tall), which is what the elevation measures to
 *    within the accuracy of measuring a photograph. The bare hexagonal shaft
 *    alone is 24 : 1 at the ground and 82 : 1 at the neck. Nothing was widened
 *    "so it reads": the brief's own warning is that any thickening makes it a
 *    chimney, and a chimney is what 10 : 1 would already look like.
 *
 * ## The six things that must survive to a thumbnail
 *
 * - **Slenderness.** Above. It is carried by the footprint and by refusing to
 *   put anything on the shaft that has width.
 * - **The hexagonal shaft, tapering continuously.** It is **one mesh**: a single
 *   six-sided `taper`, 2.50 to 0.73 half-width over 97.6 units. One mesh
 *   because the shaft's taper is genuinely straight in elevation *and* because
 *   `OutlineEffect` inks every mesh boundary — a shaft built as a stack of ten
 *   frusta comes back with nine horizontal rules across it, which is the ladder
 *   the Arc de Triomphe's arch head had to be recut to avoid. The line fits all
 *   three known widths: 2.50 at the ground, 1.19 at the pod neck (real: the
 *   shaft is visibly about half its base width there) and 0.73 at the top of the
 *   concrete (real: about 7.6 m). Zero joints between the ground and the pod.
 * - **The three buttress legs.** These are **not** three legs. They are one
 *   three-sided `taper` sharing the shaft's axis, and that is the whole trick:
 *   a regular triangle's circumradius is exactly twice its apothem, so a
 *   triangular frustum whose flats sit *inside* the hexagon still throws three
 *   corners out to 4.70 at the ground. Those corners land at 60, 180 and 300
 *   degrees, which is where the *middles of the hexagon's faces* are — wings on
 *   alternating faces of the core, which is the real plan. The wing dies where
 *   its corner is swallowed: `2 * apothem(y) = shaftHalf(y)`, which solves to
 *   **y = 43.0, 35.9% of the height**, exactly the "lower third" the brief asks
 *   for, and it is a blend rather than a step because both cones are linear.
 *   Two meshes, in two segments so the flare steepens over the bottom 46 m
 *   (0.100 of reach per unit of rise, against 0.060 above it) — without that
 *   the base is two straight cones and the brief's "not a plain cone" is not
 *   met.
 * - **The main pod.** Nine meshes between 333 m and 360.5 m: a **sloping skirt**
 *   flaring 1.25 to 2.95 over 8.5 m of rise, then three dark glazed bands
 *   (Glass Floor and LookOut at 342-346, the restaurant at 351, the Sky Terrace
 *   at 356) separated by pale rims that stand 0.26-0.32 proud of them, then the
 *   upper drum and a coned cap. The proud rims are what make it *stacked decks*
 *   rather than a barrel: on a 460-pixel card the whole pod is 22 pixels wide,
 *   and the ink between a 2.99 band and a 3.31 rim is the only thing left
 *   drawing the levels.
 * - **The antenna.** 97.59 to 120 units, **22.4 units = 18.7% of the total**,
 *   which is the real 102 m mast to within a metre. Two lengths with a step
 *   from 0.42 to 0.30 half-width at 503 m, a collar on the step and a second
 *   one higher up, because a single unbroken taper that thin reads as a wire
 *   rather than a mast — the collars are what give it sections, and sections
 *   are what make a needle read as built.
 * - **The small upper pod.** Four meshes at 439.5-453 m, centred on
 *   **446.3 m** against the SkyPod's real 447, and 13.5 m tall. Half-width 1.65
 *   where the shaft is 0.77, so it is **2.14x** the mast it rides and cannot be
 *   missed, and it sits at **80.6% of the height** — high enough that it is
 *   obviously a second thing and not a repeat of the main pod.
 *
 * ## Against the Space Needle, which is the real collision
 *
 * Toronto and Seattle are 29.9 degrees apart on the great circle — 3,330 km, or
 * **8,354 world units** at 279.25 units per degree — so there is no placement
 * conflict of the kind the Arc de Triomphe had with the Eiffel Tower. The
 * collision is entirely a *reading* collision on the contact sheet: both are
 * concrete observation towers with a pod near the top.
 *
 * `space-needle.ts` landed while this was being written, so the comparison below
 * is against what it actually declares rather than against a guess: `tower`,
 * 70 units, footprint **11.3**, painted `white`, `darkOlive`, `red`, `bark` and
 * `gold`. Two rungs and two palettes apart before the geometry is looked at —
 * the only entry the two files share is `white`, which here is the antenna and
 * nothing else. Six numbers then separate them, and every one is a thing this
 * file deliberately protects:
 *
 * 1. **Slenderness 12.8 : 1 against 3.1 : 1.** As built: 120 units over 9.4,
 *    against 70 over a footprint of 11.3. **Four times apart**, which settles
 *    the silhouette at any size before any detail is looked at. (In life the gap
 *    is smaller, 12.8 against about 4.6 — the tier ladder widens it, because a
 *    tripod needs its spread and a mast does not.)
 * 2. **One unbroken shaft, no daylight.** The Space Needle's three legs are
 *    free-standing with sky between them for its whole height; the base of that
 *    tower is mostly hole. Here the wings never leave the core — they are a
 *    frustum *around* the shaft's own axis, so there is no gap anywhere and the
 *    base is solid ink. In a thumbnail this is the single most reliable tell.
 * 3. **Drum, not saucer.** This pod is 5.96 units tall over 6.62 wide, ratio
 *    **0.90**, in three glazed levels. A flying saucer is about 4 : 1 the other
 *    way. This is what the 1.10x vertical exaggeration of the pod buys, and it
 *    costs almost nothing — the pod's top moves from 360 m to 360.5 m, 0.1 of a
 *    unit.
 * 4. **Pod at 63% of the height, not 83%.** 35% of this tower stands *above* its
 *    main pod. Above the Space Needle's saucer there is only a short spire.
 * 5. **A second pod at 81%.** The Space Needle has no equivalent, so a small
 *    drum up on the needle is by itself disambiguating.
 * 6. **120 units against 70.** They are not even the same size on the sheet:
 *    one is nearly twice the other and a third of its width.
 *
 * ## Against the skyscrapers on the sheet
 *
 * This is a mast, not a building, and the model says so by having **no floors**.
 * The Burj Khalifa has eighteen setbacks and the Empire State has floor bands
 * and setbacks of its own; between the wings vanishing at y = 43.0 and the pod
 * skirt at y = 72.2 this model has **29.2 units of completely bare cone** — a
 * quarter of its height with nothing on it at all — and the only horizontal
 * events anywhere on it are the two pods. The three dark strips running the
 * shaft are the elevator window slots; they are 0.22 and 0.13 thick,
 * half-buried in the face, and they are there to add vertical
 * grain, which makes a shaft look *thinner*, not to suggest storeys.
 *
 * ## Colour
 *
 * The brief is raw concrete with a white antenna, and the constraint that
 * decides it is in the note beside `ctx.palette`: a neutral loses its identity
 * in shade, and this monument is one material from the ground to 450 m. A
 * six-sided cone always has three faces turned away from the sun, so half of a
 * 97-unit shaft is permanently in the shaded band. `bone` is the obvious
 * concrete and the contract measures it going 143,122,100 -> 76,68,58, "a dark
 * hueless patch" — on a tower that is one surface, that is half the model dead.
 * `steel` is worse (effectively black) and `slate` has more blue than red, so it
 * would go cold.
 *
 * That leaves the warm entries, and the four candidates were rendered rather
 * than argued, because "raw concrete" is a hue judgement and the project's rule
 * is to look. `sand` (0xebd1a3) comes back frankly golden — a sandstone tower,
 * which is what it is doing for the Arc de Triomphe two files over. `tan`
 * (0xa49876) comes back olive and dark, more bronze than concrete, and it is
 * also `CONTINENT_COLORS['North America']`, so it would have stood the tower in
 * the exact colour of the Canadian ground under it.
 *
 * So the shaft is **`blush`** (0xeec3af). It is the palette's one *pale*
 * warm-neutral: 238,195,175, which is 63 more red than blue — enough hue to
 * survive the shaded band, not enough to read as a colour. Rendered, it is
 * sun-warmed grey concrete, and pale is what this tower is; the CN Tower
 * photographs nearly white against the sky, not grey. It is also the rarest
 * entry in use on the sheet — two monuments out of fifty before this one — which
 * is worth something for the same reason the rest of this file is: the Space
 * Needle went `white` over `darkOlive`, so the two towers do not share a single
 * large surface between them.
 *
 * Three more, and no others. **`tan`** for the ground apron and the base roof —
 * chosen *because* it is the continent's own colour, so the ground works settle
 * into the plate they stand on instead of becoming a fourth thing on the tower,
 * while still reading as a dark collar against the sky on the contact sheet.
 * **`steel`** for the glazing — the three pod bands, the upper pod's band, the
 * two antenna collars and the elevator slots, every one of them narrow, which
 * is the one place where going near-black in shade is the point rather than the
 * problem. And **`white`** for the antenna, which is the brief's; at 0xfff2e8 it
 * is warm enough to keep its identity where a needle has no volume left to
 * carry hue, and against `blush` it separates cleanly, which `cream` would not
 * have done.
 *
 * ## Against the budget
 *
 * 29 meshes of the `landmark` tier's 130 and 1,192 triangles of 3,600 — 22% and
 * 33%. That is under-spent by the sheet's usual standard and it
 * is the right answer here, because the budget is a cap and not a quota: this
 * model is 120 units tall and 9.4 wide, and there is nothing that can be added
 * to a mast that is wider than a line without contradicting the one thing it is
 * for. Where the budget did go is where the detail belongs — **13 of the 29
 * meshes are the two pods**, against one for the entire 97-unit shaft. Reach
 * 4.70 of the declared 4.8, height 120.0 of 120, aspect 0.078 of 4.
 */

// ---------------------------------------------------------------------------
// Everything vertical is the real tower in metres. `U` is the only conversion.
// ---------------------------------------------------------------------------

const REAL_HEIGHT = 553.33;
const TOP = 120;
/** World units per metre: 0.21687. */
const U = TOP / REAL_HEIGHT;
const at = (metres: number): number => metres * U;

// --- the shaft: one straight cone, ground to the top of the concrete ---
const SHAFT_TOP = at(450);
const SHAFT_FOOT = 2.5;
const SHAFT_NECK = 0.73;

/** Half-width across the flats of the hexagonal core at height `y`. */
const shaftHalf = (y: number): number =>
  SHAFT_FOOT + ((SHAFT_NECK - SHAFT_FOOT) * y) / SHAFT_TOP;

// --- the buttress wings: a triangular frustum on the same axis ---
/**
 * Apothems, so the corners reach twice these. The wing is swallowed where
 * `2 * apothem(y) = shaftHalf(y)`; with these four numbers that is y = 43.0.
 * The last unit above it is modelled and buried, which is what makes the
 * vanishing a blend instead of a point.
 */
const WING_FOOT = 2.35;
const WING_KNEE = 1.85;
const WING_HEAD = 0.83;
const WING_KNEE_Y = at(46);
const WING_TOP_Y = at(203);

// --- the ground works. Kept deliberately small: see "a mast, not a building". ---
const APRON_HALF = 4.2;
const APRON_TOP = at(2.3);
const BASE_HALF = 3.1;
const BASE_TOP = at(9.7);
const BASE_ROOF_HALF = 3.3;
const BASE_ROOF_TOP = at(10.8);

// --- the elevator slots ---
const SLOT_LOW_TOP = 50;
const SLOT_HIGH_TOP = 95;
const SLOT_LOW_THICK = 0.22;
const SLOT_HIGH_THICK = 0.13;

// --- the main pod, 333 m to 360.5 m ---
const POD_FOOT = at(333);
const POD_SKIRT_TOP = at(341.5);
const POD_SKIRT_FOOT_HALF = 1.25;
const POD_SKIRT_HEAD_HALF = 2.95;
/** `[top in metres, half-width, glazed]`, stacked from the skirt's top up. */
const POD_DECKS: Array<[number, number, boolean]> = [
  [345.3, 3.03, true], // Glass Floor and LookOut, 342-346 m
  [346.4, 3.25, false],
  [350.2, 2.99, true], // the revolving restaurant, 351 m
  [351.3, 3.31, false], // the widest thing on the pod
  [354.4, 2.95, true], // Sky Terrace, 356 m
  [355.9, 3.27, false], // the EdgeWalk ledge, standing proud
  [357.9, 2.68, false],
];
const POD_CAP_TOP = at(360.5);
const POD_CAP_HALF = 1.25;

// --- the upper pod, 441 m to 452 m, centred on the SkyPod's real 447 m ---
const SKYPOD_FOOT = at(439.5);
const SKYPOD_SKIRT_TOP = at(444);
const SKYPOD_SKIRT_FOOT_HALF = 0.8;
const SKYPOD_SKIRT_HEAD_HALF = 1.5;
const SKYPOD_DECKS: Array<[number, number, boolean]> = [
  [448.5, 1.58, true],
  [449.8, 1.65, false],
];
const SKYPOD_CAP_TOP = at(453);
const SKYPOD_CAP_HALF = 0.72;

// --- the antenna: 450 m to 553.33 m, one metre off the real 102 m mast ---
const MAST_STEP = at(503);
const MAST_COLLAR_TOP = at(504.4);
const MAST_FOOT_HALF = 0.58;
const MAST_STEP_HALF = 0.42;
const MAST_COLLAR_HALF = 0.5;
const MAST_UPPER_HALF = 0.3;
const MAST_TIP_HALF = 0.11;
const MAST_HIGH_COLLAR = 114.5;

const POD_SIDES = 16;
const APRON_SIDES = 12;

export const cnTower: Monument = {
  id: 'cn-tower',
  name: 'CN Tower',
  iso: 'CAN',
  lat: 43.643,
  lon: -79.387,
  realHeight: 553,
  tier: 'landmark',
  footprint: 4.8,

  build(ctx) {
    const { THREE, palette, column, taper, strut, around } = ctx;
    const concrete = palette.blush;
    const apron = palette.tan;
    const glass = palette.steel;
    const mast = palette.white;

    const group = new THREE.Group();

    /** Stacks a drum on the running cursor and returns the new cursor. */
    const drum = (base: number, top: number, half: number, color: number) => {
      const mesh = column(half, top - base, color, POD_SIDES);
      mesh.position.y = base;
      group.add(mesh);
      return top;
    };

    // --- ground works ---
    group.add(column(APRON_HALF, APRON_TOP, apron, APRON_SIDES));
    const entrance = column(BASE_HALF, BASE_TOP - APRON_TOP, concrete, APRON_SIDES);
    entrance.position.y = APRON_TOP;
    group.add(entrance);
    const baseRoof = column(BASE_ROOF_HALF, BASE_ROOF_TOP - BASE_TOP, apron, APRON_SIDES);
    baseRoof.position.y = BASE_TOP;
    group.add(baseRoof);

    // --- the shaft. One mesh, ground to 450 m: see the note on joints. ---
    group.add(taper(SHAFT_FOOT, SHAFT_NECK, SHAFT_TOP, concrete, 6));

    // --- the buttress wings: two triangular frusta on the shaft's own axis ---
    group.add(taper(WING_FOOT, WING_KNEE, WING_KNEE_Y, concrete, 3));
    const wingUpper = taper(WING_KNEE, WING_HEAD, WING_TOP_Y - WING_KNEE_Y, concrete, 3);
    wingUpper.position.y = WING_KNEE_Y;
    group.add(wingUpper);

    // --- the elevator slots, on the three hexagon faces the wings do not use.
    //     `around` puts them at 0, 120 and 240 degrees; the wings' corners are
    //     at 60, 180 and 300, so the two never share a face. A strut is placed
    //     by its endpoints, so laying the centreline on the shaft's face buries
    //     half of it and leaves a line, not a rib.
    //
    //     `strut` warns that a *vertical* one gets an arbitrary roll about its
    //     own axis. These lean 1.04 degrees — the shaft's own batter — which is
    //     enough for `lookAt` to resolve, and the section is square anyway, so
    //     the roll cannot be seen either way. ---
    group.add(
      around(3, () => {
        const slot = new THREE.Group();
        const face = (y: number) => new THREE.Vector3(0, y, shaftHalf(y));
        slot.add(strut(face(BASE_ROOF_TOP), face(SLOT_LOW_TOP), SLOT_LOW_THICK, glass));
        slot.add(strut(face(SLOT_LOW_TOP), face(SLOT_HIGH_TOP), SLOT_HIGH_THICK, glass));
        return slot;
      }),
    );

    // --- the main pod ---
    const skirt = taper(
      POD_SKIRT_FOOT_HALF,
      POD_SKIRT_HEAD_HALF,
      POD_SKIRT_TOP - POD_FOOT,
      concrete,
      POD_SIDES,
    );
    skirt.position.y = POD_FOOT;
    group.add(skirt);

    let cursor = POD_SKIRT_TOP;
    for (const [topMetres, half, glazed] of POD_DECKS) {
      cursor = drum(cursor, at(topMetres), half, glazed ? glass : concrete);
    }
    const podCap = taper(
      POD_DECKS[POD_DECKS.length - 1]![1],
      POD_CAP_HALF,
      POD_CAP_TOP - cursor,
      concrete,
      POD_SIDES,
    );
    podCap.position.y = cursor;
    group.add(podCap);

    // --- the upper pod ---
    const skypodSkirt = taper(
      SKYPOD_SKIRT_FOOT_HALF,
      SKYPOD_SKIRT_HEAD_HALF,
      SKYPOD_SKIRT_TOP - SKYPOD_FOOT,
      concrete,
      POD_SIDES,
    );
    skypodSkirt.position.y = SKYPOD_FOOT;
    group.add(skypodSkirt);

    cursor = SKYPOD_SKIRT_TOP;
    for (const [topMetres, half, glazed] of SKYPOD_DECKS) {
      cursor = drum(cursor, at(topMetres), half, glazed ? glass : concrete);
    }
    const skypodCap = taper(
      SKYPOD_DECKS[SKYPOD_DECKS.length - 1]![1] - 0.06,
      SKYPOD_CAP_HALF,
      SKYPOD_CAP_TOP - cursor,
      concrete,
      POD_SIDES,
    );
    skypodCap.position.y = cursor;
    group.add(skypodCap);

    // --- the antenna ---
    const lower = taper(MAST_FOOT_HALF, MAST_STEP_HALF, MAST_STEP - SHAFT_TOP, mast, 6);
    lower.position.y = SHAFT_TOP;
    group.add(lower);

    const collar = column(MAST_COLLAR_HALF, MAST_COLLAR_TOP - MAST_STEP, glass, 6);
    collar.position.y = MAST_STEP;
    group.add(collar);

    const upper = taper(MAST_UPPER_HALF, MAST_TIP_HALF, TOP - MAST_COLLAR_TOP, mast, 6);
    upper.position.y = MAST_COLLAR_TOP;
    group.add(upper);

    const highCollar = column(0.24, 0.22, glass, 6);
    highCollar.position.y = MAST_HIGH_COLLAR;
    group.add(highCollar);

    return group;
  },
};
