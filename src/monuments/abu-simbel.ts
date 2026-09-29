import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, Object3D } from './contract.ts';

/**
 * Abu Simbel — the Great Temple of Ramesses II.
 *
 * **Four seated figures in a row, and nothing else.** No columns, no order, no
 * plan to read: the monument is one line of colossi twenty metres high, knee to
 * knee across the face of a Nubian sandstone cliff, with a doorway between the
 * middle two small enough that a man walking through it is the scale bar. The
 * temple runs sixty metres back into the rock and none of it shows. What anyone
 * has ever photographed here is a hillside with four giants cut into it.
 *
 * That makes this the second rock-cut façade in the set after `petra.ts`, and
 * the two had to be stopped from becoming the same card. They are not the same
 * problem, and almost nothing transfers:
 *
 * - Petra is a **hole in a cliff** — a Hellenistic front standing at the back of
 *   a quarried slot, framed by rock on all four sides, and every device in that
 *   file serves the frame. Abu Simbel has no slot. It is the cliff's own face,
 *   dressed flat and leaning back, and the rock is *thinnest* exactly where
 *   Petra's is thickest: five units of jamb beside colossi twenty-one wide,
 *   because here the figures really do run out to the edges. The rock has to
 *   earn its mass somewhere else, and it earns it above.
 * - Petra is **architecture, and vertical**: two stacked orders, six columns
 *   below and four above, a round tholos in a broken pediment, 104 units tall on
 *   68 wide. Abu Simbel is **figures, and horizontal**: the row is 92 wide on 70
 *   tall, and there is not one column, pediment, capital or moulding in this
 *   file. The only round things in it are four crowns and nine baboons.
 * - Petra is rose — `clay`, `salmon`, `blush`. This is Nubian sandstone —
 *   `brown`, `tan`, `sand`, `cream`. The two files share one colour, `bark`, and
 *   only in the dark of a doorway.
 *
 * **Four devices make the figures read as cut *from* the cliff rather than stood
 * against it**, and they are deliberately not Petra's four:
 *
 * 1. **The wall plane sits six units behind their faces.** This is the most
 *    important number in the file. It was ten at first, and ten turned four
 *    colossi quarried out of a cliff into four figurines standing on a shelf:
 *    the gaps between them opened into shadow, the cornice became the shelf
 *    above, and the whole model read as a cabinet with dolls in it. Pull the
 *    wall forward until it is nearly flush with the thrones and the row becomes
 *    one wall in high relief, which is what it is. Nothing else here mattered
 *    half as much.
 * 2. **One sloping plane, not a stack of ledges.** From y 49 up, the wall is a
 *    single box tilted 6.6° back about its own base — a real batter, the thing a
 *    built wall never has, and 4.2 units of recession by the time it reaches the
 *    cornice. It was three set-back courses first, and three horizontal ink
 *    lines under a projecting cornice read as an architrave; a slope has no
 *    courses to be mistaken for. It was then a short tilted box above the crowns
 *    with a flat panel running up behind it, which is worse than either, because
 *    the flat panel stood in front of the slope the whole way and the batter
 *    existed only in this comment. The tilted box *is* the wall now.
 * 3. **The rock spreads as it rises.** Below the cornice the cliff is a jamb
 *    five units wide that narrows and shallows as it climbs; above it the rock
 *    opens out to twenty-two, nineteen and twenty-three, leaning at three
 *    different angles, at three different heights, set back as far as thirty
 *    units. The dressed rectangle is the *smallest* part of the mass, which is
 *    what a face quarried out of a hillside looks like and what a building never
 *    does. The irregularity is load-bearing: two matched blocks at the top
 *    corners read as chimneys, and three upright trapezoids read as dormers.
 * 4. **The one void is the doorway**, and it is made the way Petra makes voids —
 *    by arrangement, never by subtraction. The wall is built as two panels with
 *    a seven-unit slot left between them and a deeper slab five units behind; a
 *    dark panel, a lintel and the niche fill the slot from the terrace to y 52,
 *    and a full-width band closes it above. The opening is 6 units wide against
 *    figures 21 wide and 70 tall, and that ratio is the only thing in the model
 *    that says how big the figures are.
 *
 * And one more, for the half that is missing. **The break is modelled as absence
 * *plus* debris.** `great-sphinx.ts` records the lesson that an absence models as
 * nothing at all — a gap where something should be just looks unfinished. So the
 * second colossus, whose upper half fell in antiquity and lies at its feet in
 * every photograph ever taken here, gets a ragged stump and four pieces on its
 * own base: the head still in its nemes with its face, the `cream` crown, a
 * torso block and a shoulder. The head leans back against the statue's shins
 * rather than lying flat, because a 17-unit block of sandstone face down is a
 * slab; propped at 55° it is a head. The pale crown on the ground is what tells
 * the eye where the missing half went.
 *
 * **Colour is a four-step ramp, ordered by how much rock was cut away**: `brown`
 * for the raw hillside — jambs, the masses above, the ground — `tan` for the
 * dressed façade the figures stand out of, `sand` for the figures themselves,
 * their base and the frieze, `cream` for the crowns. Two tones will not do it,
 * and the thumbnail proves it both ways: figures and wall both `sand` and the
 * colossi dissolve into the wall at 200 px; wall `tan` with the figures ten
 * units in front of it and the wall reads as a hole, which is the exact failure
 * the note on `palette` in `contract.ts` warns about. Three tones a step apart,
 * with the figures pushed forward until they are nearly flush, is what works.
 * The terrace is `brown` too, and that is not laziness: a forecourt in its own
 * colour drew a pale band across the foot of the model, and a pale band under a
 * pale cornice with figures between them is a mantelpiece. The cornice went the
 * same way, from `sand` to `tan` and from six units thick to three and a half —
 * one bright beam straight across the widest part out-shouts four figures
 * however well they are built.
 *
 * **What has to survive at thumbnail size**, in the order the eye should get it:
 * four seated figures side by side, hands flat on their knees, facing dead
 * ahead, filling the façade; the crown and its tall twin plumes, a fifth of
 * each figure's height, carrying the top of the silhouette; the small dark doorway dwarfed
 * between the middle two; the row of small squatting figures along the skyline;
 * and the second figure broken off at the waist.
 *
 * **The crowns.** These four wear the nemes under the double crown of Upper and
 * Lower Egypt. The pschent is a smooth bulb, and a bulb on a headcloth at this
 * scale is a lump: the head loses a third of its height and the row stops
 * reading as crowned at all. So the crown here is the plumed one — a broad
 * modius and two tall feathers splayed four degrees — which is not invented
 * either, it is what the standing Ramesses colossi of the Small Temple a hundred
 * metres north are wearing. Two blades hold a skyline; a bulb does not. It costs
 * three meshes a head and it buys a fifth of the figure. The width of the modius
 * matters as much as the plumes: at 5 units on a 13-unit headcloth it was a knob
 * with two prongs, and a torso that widens into a head that narrows into a crown
 * that narrows again is a cone — four bowling pins in a row. Everything above
 * the shoulders had to stop tapering. The nemes goes 17 to 13 and no further,
 * and the modius is 12.8 across.
 *
 * **Proportion: nothing is cropped and nothing is stretched**, which is unusual
 * enough here to state. The model is 102 wide by 105 high where the real façade
 * is about 35 m by 38 — 0.97 against 0.92, and the difference is only that the
 * hill above the frieze is cut short, because every unit given to the rock up
 * there is a unit taken off the colossi's share of the picture. As built they
 * are 70 of the 105, two thirds, against roughly 20 m of the 33 m dressed face.
 * A colossus is 21 wide on 70 tall, 0.30, against roughly 7 m on 20 m in life:
 * the one proportion slightly off, and it is off because four figures at their
 * true width plus a doorway wide enough to read do not fit inside a footprint
 * whose radius may not pass 55. The half-diagonal is 53.5 against a height of
 * 105, a ratio of 0.51 where 2.0 is the cap, so the aspect rule never came near
 * binding. What is spent instead is **count**: the frieze carries 22 baboons in
 * life and 9 here, because at two meshes each — a hunched six-sided body and a
 * head pushed out in front of it, since one mesh each is a picket fence — the
 * real number would be a third of the whole tier's budget. Also gone, for the
 * same reason: the small standing figures of Ramesses' mother, wife and children
 * beside the colossi's legs, and the relief-carved sides of the thrones.
 *
 * **Tier: `landmark`.** By the tier's own question — from how far should you be
 * able to name it — Abu Simbel answers *from the far shore of the lake*, which
 * is where every photograph is taken from. Mechanically it is the same verdict
 * as Petra, its nearest neighbour in kind: a 38 m rock façade needs the 120-unit
 * ceiling to keep the doorway small enough to be dwarfed and the baboons small
 * enough to be a frieze.
 *
 * No `realHeight`: the source list asserts none, and there is no one height to
 * assert. The colossi are 20 m, the façade about 38, and the temple is 60 m of
 * corridor and hall running the other way entirely.
 */

// ---------------------------------------------------------------------------
// The cliff
// ---------------------------------------------------------------------------

const CLIFF_HALF = 51;
/**
 * The back of the model, and with `CLIFF_HALF` the pair that fixes the
 * footprint: the jamb's bottom corners at (±51, -16) reach 53.45 from the axis,
 * which is what `footprint: 54` is sized to. `measure` takes the greatest
 * *horizontal* distance, so depth costs as much as width here.
 */
const SLAB_BACK = -16;
/**
 * The two planes of the dressed wall, and the most important pair of numbers in
 * the file. `WALL` is the face the colossi are carved out of and it sits only
 * six units behind their own faces, so the gaps between them are filled almost
 * flush and the row reads as one wall in high relief. It was at -3 first, ten
 * units back, and that gap turned four colossi cut from a cliff into four
 * figurines standing on a shelf — the single worst thing this model did.
 * `WALL_BACK` is the plane the doorway and the niche are cut to, and it exists
 * only so those two have somewhere to be recessed *into*.
 */
const WALL = 1;
const WALL_BACK = -4;

/** The untouched rock left standing either side of the row: five units, as thin as it is in life. */
const JAMB_HALF = 2.5;
const JAMB_X = CLIFF_HALF - JAMB_HALF;

/**
 * The batter: one box tilted back about its own base, carrying the whole wall
 * from y 49 to the cornice. 6.6 degrees, which is a real pylon's slope and puts
 * the face 4.2 units further back at the cornice than at the colossi's
 * shoulders. It sat above the crowns only at first, from y 76 — and a flat panel
 * ran up behind it to the cornice, so the batter was *entirely hidden inside its
 * own wall* and the model had a device the header claimed and the geometry did
 * not do. There is no flat panel above y 52 now; the tilted box is the wall.
 */
const BATTER = 0.115;
const BATTER_Y = 49;

/**
 * The cornice is deliberately thin — three and a half units of a hundred and
 * five, and `tan` rather than `sand`. At six units thick and pale it stopped
 * being a moulding and became a mantelpiece: one bright slab straight across the
 * model with four figures standing under it, which is a fireplace, not a cliff.
 */
const CORNICE_Y = 86;
const CORNICE_TOP = 89.5;

/**
 * The rock above the cornice, where the cliff gets its mass back. Each is a
 * wedge narrowing as it rises, leaning its own way, set back between 6 and 30
 * units, and no two share a width, a depth or a top: the skyline steps down from
 * left to right like a hillside. Two matched blocks at the top corners read as
 * chimneys, three upright trapezoids read as dormers, and three *tall* ones over
 * a frieze read as the towers of a castle — all three were tried. Squat is what
 * reads as hill: none of them clears the cornice by more than 18 units, which is
 * also what keeps the colossi at two thirds of the model's height. The middle
 * one is 26 deep, which is what stops the whole top reading as folded card from
 * three quarters on.
 */
const MASSES: Array<
  [bottom: number, top: number, height: number, depth: number, x: number, z: number, lean: number]
> = [
  [22, 12, 18, 15, -37, -10, 0.15],
  [19, 8, 14, 26, -14, -17, -0.11],
  [23, 10, 11, 13, 39, -10.5, -0.17],
];

// --- the terrace ---
const TERRACE_TOP = 5;
/** Narrower than the cliff, so the rock overhangs the ground it stands on. */
const TERRACE_HALF = 47;
const TERRACE_FRONT = 17;

// --- the base the four sit on: two halves, so the doorway reaches the terrace ---
const PLINTH_TOP = 10;
const PLINTH_BACK = -13;
const PLINTH_FRONT = 14;

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

/**
 * Centres. The outer pair all but touch the inner pair — half a unit of
 * daylight, as the real thrones do — and the doorway is the seven-unit gap in
 * the middle.
 */
const FIGURE_X = [-35.5, -14, 14, 35.5];
/**
 * The one that fell. Second from the viewer's left, immediately left of the
 * doorway: the camera looks down -Z so its right is +X, which puts -14 second
 * from the left of the picture, and that is where the break is.
 */
const FALLEN = 1;

const THRONE_HALF = 10.5;
const THRONE_BACK = -8.5;
const THRONE_FRONT = 4.5;

// --- the seated figure, in local y from the top of the plinth ---
/** Hips, and the top of the thighs: a third of the way up, as a seated figure is. */
const SEAT = 22;
const SHIN_TOP = 17;
const KNEE_Z = 11.5;
const SHOULDER = 43;
const NEMES_BOTTOM = 41;
const NEMES_TOP = 56;
const CROWN_TOP = 62.5;
const PLUME_TOP = 70;

// ---------------------------------------------------------------------------
// The frieze
// ---------------------------------------------------------------------------

/** Nine, against 22 in life, and odd so one sits on the axis over the doorway. */
const BABOONS = 9;
const BABOON_PITCH = 7;

export const abuSimbel: Monument = {
  id: 'abu-simbel',
  name: 'Abu Simbel',
  iso: 'EGY',
  lat: 22.337,
  lon: 31.626,
  tier: 'landmark',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;

    // Four tones of one sandstone, ordered by how much of it was cut away. The
    // ramp is the whole thumbnail: at two tones the figures vanished into the
    // wall, and at two tones with the wall dark the wall read as a hole.
    const rock = palette.brown; // the raw hillside: jambs, the masses, the ground
    const wall = palette.tan; // the dressed façade the figures stand out of
    const carved = palette.sand; // the figures themselves, their base, the frieze
    const regalia = palette.cream; // crowns and plumes, the top of the silhouette
    const dark = palette.bark; // doorway, niche, eyes — the only shadows in the file

    const group = new THREE.Group();

    /**
     * A block spanning `y0..y1` and `z0..z1`. The file reasons in elevations and
     * planes rather than in centres and depths, because a façade is an elevation.
     */
    const slab = (
      width: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
      x = 0,
    ): Mesh => {
      const mesh = box(width, y1 - y0, z1 - z0, color);
      mesh.position.set(x, y0, (z0 + z1) / 2);
      return mesh;
    };

    /**
     * A hewn block that flares or narrows. `taper` only makes regular prisms, so
     * a four-sided one carries the flare and `scale.z` sets the depth after — the
     * trick is `moai-rapa-nui.ts`'s. Here it makes the torso, the nemes and the
     * cavetto cornice, all three of which are trapezoids in elevation.
     */
    const wedge = (
      bottom: number,
      top: number,
      height: number,
      depth: number,
      color: number,
    ): Mesh => {
      const mesh = taper(bottom / 2, top / 2, height, color, 4);
      mesh.scale.z = depth / bottom;
      return mesh;
    };

    /**
     * Sets a piece down so its lowest point rests exactly on `floor`, whatever
     * rotation it was given. The debris is the only thing in the file at an
     * arbitrary angle, and eyeballing a `position.y` for a tumbled block is how a
     * monument ends up sunk into its own terrace — `validate` fails the whole
     * model for a tenth of a unit. This computes it instead.
     */
    const restOn = (object: Object3D, floor: number): void => {
      object.updateMatrixWorld(true);
      object.position.y += floor - new THREE.Box3().setFromObject(object).min.y;
    };

    // -----------------------------------------------------------------------
    // 1. The terrace. Cut from the hillside and painted the same `brown`, and
    //    that is not laziness: a forecourt in its own colour drew a pale band
    //    right across the foot of the model, and a pale band under a pale
    //    cornice with the figures between them is a mantelpiece. The only
    //    horizontal the eye is allowed here is the frieze.
    // -----------------------------------------------------------------------
    group.add(slab(TERRACE_HALF * 2, 0, TERRACE_TOP, SLAB_BACK, TERRACE_FRONT, rock));

    // -----------------------------------------------------------------------
    // 2. The cliff: a deep back slab, two front panels with the doorway slot
    //    left between them, one tilted face carrying the wall to the cornice,
    //    two jamb wedges, and the rock that spreads over the top.
    // -----------------------------------------------------------------------
    // The back slab stops short of the jambs on both sides, so the jamb wedges —
    // not a rectangle behind them — are what the model's outline is made of.
    // It is also the rock the doorway and the niche are seen against, and the
    // two front panels leave the seven-unit slot between them that they live in.
    group.add(slab(96, 0, CORNICE_Y, SLAB_BACK, WALL_BACK, rock));
    // Each panel's inner end stands 0.2 into the doorway slot, at 3.3: at 3.5
    // it shared the inner throne's side in another colour, and the figure's
    // carved pieces stand at 3.4 and 3.6, so 3.3 is the nearest plane clear
    // of all three by `PROUD`.
    const PANEL_IN = 0.2;
    for (const side of [-1, 1]) {
      group.add(slab(44.5 + PANEL_IN, 0, 52, WALL_BACK, WALL, wall, side * (25.75 - PANEL_IN / 2)));
    }

    // A jamb is one wedge, not a stack of courses: it narrows 5.4 to 3.6 and
    // shallows 20 to 13 over its 88 units, so the cliff leans back and closes in
    // at the same rate the face above the crowns does.
    for (const side of [-1, 1]) {
      const jamb = wedge(5.4, 3.6, CORNICE_Y, 20, rock);
      jamb.position.set(side * (CLIFF_HALF - 2.7), 0, -6);
      group.add(jamb);
    }

    // The batter. `box` stands on its base, so rotating about X tips the top
    // back and leaves the foot where it was. It starts three units below the top
    // of the wall panels, so no seam opens at the join, and it stops 1.4 short of
    // the cornice's top edge, so the cornice hides its sawn end. It is also what
    // closes the doorway slot above the niche: full width, no extra mesh.
    const face = box(JAMB_X * 2 - JAMB_HALF * 2, 39, 6, wall);
    face.position.set(0, BATTER_Y, -2);
    face.rotation.x = -BATTER;
    group.add(face);

    // The cavetto cornice: one wedge flaring outward as it rises, which is the
    // Egyptian profile. Narrower than the cliff so the jambs pass it at the
    // ends, three and a half units thin, and `tan` rather than `sand` — a pale
    // beam straight across the widest part of the model out-shouts four figures
    // no matter how well they are built.
    const cornice = wedge(90, 96, CORNICE_TOP - CORNICE_Y, 6, wall);
    cornice.position.set(0, CORNICE_Y, 0);
    group.add(cornice);

    for (const [bottom, top, height, depth, x, z, lean] of MASSES) {
      const mass = wedge(bottom, top, height, depth, rock);
      mass.position.set(x, CORNICE_TOP - 3, z);
      mass.rotation.z = lean;
      group.add(mass);
    }

    // -----------------------------------------------------------------------
    // 3. The plinth, in two halves. A continuous one would floor the doorway.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      group.add(slab(43, TERRACE_TOP, PLINTH_TOP, PLINTH_BACK, PLINTH_FRONT, carved, side * 24.5));
    }

    // -----------------------------------------------------------------------
    // 4. The doorway, and Ra-Horakhty in his niche above it. Both are voids by
    //    arrangement: the two inner thrones are the jambs, the lintel is the
    //    head, and what shows between them is a dark panel standing a unit proud
    //    of the cliff and seven units behind the thrones' fronts.
    // -----------------------------------------------------------------------
    group.add(slab(6, TERRACE_TOP, 28, WALL_BACK, WALL_BACK + 1.5, dark));
    // The lintel stands `PROUD` out of the panels' faces, front and back, now
    // that their ends reach into the slot beside it.
    group.add(slab(9, 28, 32.5, WALL_BACK - PROUD, WALL + PROUD, carved));

    // Three meshes, and they are what stops the strip between the middle two
    // colossi from being blank for forty units.
    group.add(slab(5.6, 34, 50, WALL_BACK, WALL_BACK + 1.6, dark));
    const godBody = wedge(3.4, 2.6, 10, 2.8, carved);
    godBody.position.set(0, 36, -1.6);
    group.add(godBody);
    group.add(slab(2.4, 45.5, 48.7, -2.8, 0, carved));

    // -----------------------------------------------------------------------
    // 5. The frieze of baboons along the skyline. Two meshes each — a hunched
    //    six-sided body and a head pushed out in front of it — because one mesh
    //    each is a picket fence, and squat matters more than tall: at 6 wide by
    //    7 high they read as animals, at 4.4 by 9 they read as balusters.
    // -----------------------------------------------------------------------
    for (let i = 0; i < BABOONS; i++) {
      const baboon = new THREE.Group();
      const body = taper(3.4, 2.5, 3.8, carved, 6);
      body.position.z = 0.4;
      baboon.add(body);
      baboon.add(slab(3.2, 3.8, 7.2, 0.2, 3.8, carved));
      // Nine identical blocks at an even pitch are crenellations, and the whole
      // model came out a castle gatehouse. The step is the golden angle, so no
      // two neighbours land near the same height and the row never falls into a
      // pattern; `Math.random` is out, the loader builds twice and compares.
      baboon.scale.y = 1 + 0.11 * Math.sin(i * 2.39996);
      baboon.rotation.y = 0.09 * Math.sin(i * 2.39996 + 1.7);
      baboon.position.set((i - (BABOONS - 1) / 2) * BABOON_PITCH, CORNICE_TOP, 0);
      group.add(baboon);
    }

    // -----------------------------------------------------------------------
    // 6. The colossus. Built once, placed four times, identical every time:
    //    these four are machine-regular and that regularity is half the subject,
    //    so unlike the moai there is no per-figure wobble here at all.
    // -----------------------------------------------------------------------
    const colossus = (fallen: boolean): Group => {
      const figure = new THREE.Group();

      // Throne, thighs, shins, forearms, hands. All of this survived the fall.
      figure.add(slab(THRONE_HALF * 2, 0, SEAT, THRONE_BACK, THRONE_FRONT, carved));
      figure.add(slab(19, SEAT - 5, SEAT, -3, KNEE_Z, carved));
      for (const side of [-1, 1]) {
        figure.add(slab(7.2, 0, SHIN_TOP, 4.5, KNEE_Z, carved, side * 4.2));
        // Forearm along the outside of the thigh; hand flat on the knee and
        // wider than the arm that carries it — that overhang is what makes it a
        // hand rather than the end of a stick.
        figure.add(slab(3.6, SEAT, SEAT + 3.8, -1, KNEE_Z, carved, side * 8.8));
        figure.add(slab(4.8, SEAT, SEAT + 2.8, KNEE_Z - 5, KNEE_Z + 0.3, carved, side * 8.2));
      }

      if (fallen) {
        // The stump, and a smaller block tipped off its top: the break is
        // ragged, and a flat sawn top would read as unfinished, not broken.
        figure.add(slab(14, SEAT, 30, -6.5, 3.5, carved));
        const shear = slab(9.5, 30, 34, -5, 1.5, carved, 1.3);
        shear.rotation.z = -0.1;
        figure.add(shear);

        // --- what is lying at its feet, on its own base ---
        // The head, face and all, still in its nemes: one group, so the two
        // pieces tumble together. It leans back against the statue's own shins
        // with the face turned up, which is how it lies in the photographs and,
        // more to the point, the only attitude in which a 17-unit block of
        // sandstone still reads as a head — laid flat it is a slab.
        const head = new THREE.Group();
        head.add(wedge(17, 13, 14, 10, carved));
        head.add(slab(7, 3, 13.5, 3.6, 7, carved));
        head.rotation.set(-0.95, 0.3, 0.22);
        head.position.set(-8.5, 0, 11);
        restOn(head, 0);
        figure.add(head);

        // The crown, off the head and lying beside it: the only pale thing on
        // the ground, and the piece that names the pile.
        const crown = taper(6.4, 5.6, 6.5, regalia, 8);
        crown.rotation.set(1.45, 0.3, 0.3);
        crown.position.set(4, 0, 9);
        restOn(crown, 0);
        figure.add(crown);

        const torso = box(15, 9, 11, carved);
        torso.rotation.set(0.22, 0.6, 0.2);
        torso.position.set(-14, 0, 3);
        restOn(torso, 0);
        figure.add(torso);

        const shoulder = box(9, 6, 7, carved);
        shoulder.rotation.set(-0.3, -0.45, 0.24);
        shoulder.position.set(4, 0, 1);
        restOn(shoulder, 0);
        figure.add(shoulder);

        return figure;
      }

      // The feet, projecting past the plinth's face. Only the standing three get
      // them; on the fallen one they would be buried under its own head.
      for (const side of [-1, 1]) {
        figure.add(slab(7.2, 0, 3.8, KNEE_Z - 2, PLINTH_FRONT, carved, side * 4.2));
      }

      // Torso: 13 wide at the waist, 18 at the shoulders and 9.5 deep, so the
      // back sits three units inside the wall plane and is never seen.
      const torso = wedge(13, 18, SHOULDER - SEAT, 9.5, carved);
      torso.position.set(0, SEAT, -1.5);
      figure.add(torso);

      for (const side of [-1, 1]) {
        figure.add(slab(3.6, SEAT, SHOULDER, -2, 4.5, carved, side * 8.6));
      }

      // The nemes is one wedge — the headcloth and both its lappets in a single
      // solid — 17 wide over shoulders 18 wide, and it must *barely* narrow, 17
      // to 13. At 16 down to 8.5 the head came to a point, and a torso that
      // widens into a head that narrows into a crown that narrows again is a
      // cone: four bowling pins in a row. Egyptian nemes hardly tapers, and that
      // is the whole reason the head reads as a head.
      const nemes = wedge(17, 13, NEMES_TOP - NEMES_BOTTOM, 10, carved);
      nemes.position.set(0, NEMES_BOTTOM, 0);
      figure.add(nemes);

      // The face stands proud of the cloth that frames it, the beard proud of
      // the face, and the eyes proud of that — the depth cascade from
      // `moai-rapa-nui.ts`, the only way a feature reads when the whole head is
      // one colour. Egyptian statues wear a painted cosmetic line, so here the
      // eye comes forward as a bar instead of sinking back as a socket.
      figure.add(slab(7, 43.5, 55, 3.4, 7, carved));
      figure.add(slab(2.6, 36.5, 44, 4.6, 7.6, carved));
      // The two lappets of the headcloth, falling out of the wedge onto the
      // chest either side of the beard. They are the only thing between the
      // shoulders and the jaw, and without them the torso is a blank panel and
      // the head sits on it like a hat on a box.
      for (const side of [-1, 1]) {
        figure.add(slab(3.4, 36, 47, 3.5, 6.5, carved, side * 5.5));
      }
      for (const side of [-1, 1]) {
        figure.add(slab(1.8, 49.5, 51, 6.5, 7.4, dark, side * 2.1));
      }

      // A broad drum almost as wide as the nemes it sits on. At 5 units against
      // a 13-unit headcloth it was a knob with two prongs on it, and four heads
      // in a row came out as rabbits.
      const crown = taper(6.4, 5.6, CROWN_TOP - NEMES_TOP, regalia, 8);
      crown.position.set(0, NEMES_TOP, 0);
      figure.add(crown);
      for (const side of [-1, 1]) {
        const plume = slab(4.6, CROWN_TOP, PLUME_TOP, -1.5, 1.5, regalia, side * 2.5);
        // Splayed four degrees: two parallel posts read as an aerial, two
        // leaning blades read as feathers.
        plume.rotation.z = -side * 0.07;
        figure.add(plume);
      }

      return figure;
    };

    for (let i = 0; i < FIGURE_X.length; i++) {
      const figure = colossus(i === FALLEN);
      figure.position.set(FIGURE_X[i]!, PLINTH_TOP, 0);
      group.add(figure);
    }

    return group;
  },
};
