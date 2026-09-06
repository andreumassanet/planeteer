import type { Group, Monument, MonumentContext } from './contract.ts';

/**
 * Teotihuacan — the Pyramid of the Sun, on the Avenue of the Dead.
 *
 * **The decision this file exists to argue: is the monument the Sun pyramid, or
 * the avenue with both pyramids on it?** The avenue is the better picture — a
 * dead-straight kilometres-long street with pyramids and platform rows down it
 * is the composition every photograph uses, and it is the one thing Chichen Itza
 * three cards away can never have. So it was planned first, costed, and cut. The
 * numbers are below, because "the footprint would not take it" is worth nothing
 * without them.
 *
 * **What the aspect rule actually says here.** `MAX_ASPECT` is measured on the
 * half-*diagonal*: `radius / height <= 2`. For a square pyramid of base `B`
 * standing alone and centred, `radius` is its own corner, `0.707 B`, so the
 * flattest it can ever be is `B / height = 2.83`. The Pyramid of the Sun is 225
 * m across and 65 m tall — **3.46** — so it is *not buildable at true
 * proportions in any tier of this contract*, and 2.83 is the ceiling to aim at.
 * That number is the whole design problem, and it was worth finding before
 * drawing anything rather than after.
 *
 * **What the avenue costs.** Anything standing outside the pyramid's own corners
 * pushes `radius` out, and the rule then forces the pyramid *taller* to pay for
 * it. Searching every layout that carries an avenue with the Pyramid of the Moon
 * beyond the Sun — Moon shrunk, avenue narrowed, plan compressed, the model
 * nudged off-centre to the limit `validate` allows — the best base:height the
 * Sun pyramid can hold is **1.93**, a face slope of about 55 degrees. El
 * Castillo, as built in `chichen-itza.ts`, is 1.75 and 54.5 degrees. **The full
 * avenue buys the second pyramid by making the first one the same shape as the
 * pyramid it most needs to not be mistaken for.** That is not a trade worth
 * making on a contact sheet where the two cards sit six rows apart.
 *
 * There is a second, independent reason the Moon cannot come. At the one plan
 * scale that lets the Sun pyramid be blunt — 68 units for its 225 m, so 0.302
 * units/m — the Pyramid of the Moon is 45 units across and its centre stands
 * some 700 m up the street, **210 units** away. The whole footprint is 109 units
 * wide. It is off the model by a factor of four, and shrinking it to fit turns
 * the site's second great mass into a token that misreports it.
 *
 * **So: the Sun pyramid keeps its proportions, and the avenue is cropped rather
 * than dropped.** The paving, its kerbs, its cross-walls and its flanking ranks
 * run as far as the footprint circle allows and are cut by it at both ends —
 * which is what 2.4 km of street does to a 109-unit circle, and is honest in a
 * way a shortened avenue would not be. What the model gives up is the far end:
 * the Moon closing the vista. What it keeps is the near half of the photograph,
 * and the mass that the near half is actually about.
 *
 * **Scale, in one number each.** Plan: **0.302 units/m, true** — the pyramid's
 * 68-unit base, the avenue at 12.5 units for a real ~40 m, the platform fronts.
 * Vertical: 0.431 units/m, **1.43x exaggerated**, and every unit of that is the
 * aspect rule rather than taste — with the avenue out at the footprint edge the
 * model measures 54.2 of radius, so the summit is *required* to reach 27.1. That
 * leaves base:height at **2.43** where life is 3.46 and El Castillo is 1.75: a
 * third flatter than the pyramid it must not be confused with, on a base two
 * units *wider* and at 70% of its height, which is the comparison the sheet
 * makes.
 *
 * The stretch broke one thing, as stretches do. The pyramid's faces run at 47
 * degrees here against about 39 in life, because a face angle is the height over
 * the horizontal run and only the height moved. It is bought back where it
 * shows: **five tiers, not nine**, so every shoulder is four to six units deep
 * and reads as a shoulder rather than as a tread, and a summit platform 18 units
 * across — a quarter of the base, flat and **bare**. No temple stands on either
 * pyramid at Teotihuacan and none is invented here; against El Castillo's roofed
 * sanctuary that is the cheapest separation in the file and the most truthful.
 *
 * **And the colour is a separation too, not decoration.** El Castillo is Yucatan
 * limestone and is painted `sand` next door. Teotihuacan is built of dark
 * volcanic rock, so the pyramid is `bark` — the darkest mass on the sheet — and
 * the lime is spent only where it survives in life: the stairway, the cornices,
 * and the floor of the street.
 *
 * **No `realHeight`.** The source list asserts none, and there is no one number
 * to assert: this is a city of twenty square kilometres. The 65 m above is the
 * Sun pyramid's, used here only to fix a scale.
 *
 * Traded away, in order of how much it hurt: the Pyramid of the Moon and the far
 * end of the avenue, above; the Ciudadela and the Temple of the Feathered
 * Serpent, a kilometre south of this crop and a second whole monument's worth of
 * geometry; the ~100 m forecourt between the pyramid's west foot and the street,
 * squeezed to about 12 so the avenue could stay inside the circle at full length
 * — nobody names this place by how far back the pyramid stands; and the carved
 * relief on the tableros, which at two units of panel height is a smudge.
 */

// ---------------------------------------------------------------------------
// The Pyramid of the Sun
// ---------------------------------------------------------------------------

/** Half-width across the flats at the ground. 68 units of base for 225 m. */
const BASE = 34;
/** The truncated summit: 17 units, about 56 m, and nothing standing on it. */
const SUMMIT = 8.5;
/** Top of the summit slab. Set by the aspect rule, not by the pyramid. */
const HEIGHT = 28;
const CAP = 0.8;
const BODY = HEIGHT - CAP;

/**
 * Five sloping bodies, each capped by a vertical band of plaster. Real, and it
 * is also the whole distinction from a nine-terrace Castillo: fewer, deeper
 * steps read as shoulders instead of as stairs.
 */
const TALUD = [5.9, 5.25, 4.75, 4.2, 3.6];
const LEDGE = 0.7;
/** How far a band stands proud of the body above it — the ledge the ink catches. */
const LIP = 0.55;

// --- the one stairway, on the west face ---
/**
 * Ten, not the real flight's hundred and some. A 260-pixel card frames about 128
 * units, so a unit is two pixels; the first version used fourteen steps, and a
 * 1.9-unit riser seen at this angle left under two pixels of visible tread. It
 * came out a smooth pale ramp. At 2.7 the flight reads as stairs, which is the
 * only thing it is there to say.
 */
const STEPS = 10;
const STEP_RISE = BODY / STEPS;
const STEP_RUN = 5.2;
const STAIR_HALF = 4.8;
const STAIR_PROUD = 1.6;
const RAIL = 1.9;
const RAIL_Z = STAIR_HALF + RAIL / 2;
const RAIL_FOOT = 1.9;

/** The face as a straight line, for hanging the stair and its alfardas off. */
const SLOPE = (BASE - SUMMIT) / BODY;
const faceX = (y: number): number => -(BASE - SLOPE * y);

// --- the Adosada, the low platform built against the foot of that stair ---
const ADOSADA_OUT = 3.5;
const ADOSADA_WING = 7.4;
const ADOSADA_TALUD = 5.2;

// ---------------------------------------------------------------------------
// The Avenue of the Dead
// ---------------------------------------------------------------------------

/**
 * The pyramid sits east of the street, so the whole composition is lopsided and
 * the model is shifted east until its two farthest points — the pyramid's far
 * corner and the outer edge of the near terrace — reach the same radius. That
 * balance is what holds the measured radius at 54.2 with a 12.5-unit avenue
 * still on the board; unbalanced, either the pyramid or the street has to give
 * up several units to the circle.
 */
const PYRAMID_X = 8.2;
const AVENUE_X = -35.55;
const AVENUE_WIDE = 12.5;
const AVENUE_LONG = 69;
/**
 * Past the last cross-wall the street narrows to a tongue and the far wall runs
 * on alone to 84 — not a taper anyone would build, but the circle is 54.2 across
 * the middle of the avenue and 45 at its inner edge, so length out there can
 * only be bought with width. It is worth buying: a wall that outruns everything
 * else in the model is the one line that says the street does not stop here.
 */
const AVENUE_TAIL = 5.5;
const TAIL_WIDE = 6;
const FAR_KERB_LONG = 84;
const PAVING = 0.5;

/**
 * Kerbs down both edges of the paving, and cross-walls across it.
 *
 * **The paving itself cannot carry the avenue and it was a mistake to think it
 * could.** The sheet's cameras sit 13 degrees above the ground, so anything
 * lying flat is foreshortened to 0.23 of its width: a 12.5-unit street is three
 * units of pale smear and disappears at thumbnail size. What reads at 13 degrees
 * is anything standing up. So the street is drawn by its *edges* — two unbroken
 * kerb lines the length of the model, a rank outside each of them, and the
 * cross-walls of the sunken courts laddering between — and the paving underneath
 * is only the colour they enclose.
 */
const KERB = 0.9;
const FAR_KERB = 2.2;
/** The avenue is not one flat street: it climbs north through a chain of sunken courts. */
const CROSS_Z = [-25, -8.5, 8.5, 25];

/**
 * The two ranks are deliberately unequal, and the reason is the camera again.
 *
 * The west side is the one *between the lens and the street*. A platform of
 * height `h` covers `h / tan(13.5 deg)` = 4h of ground behind it, so a 5.7-unit
 * compound on this side hides twenty-three units — the whole avenue and the far
 * rank's feet with it — and the two sides merge into one heap of crates. That is
 * exactly what the first version did. So the near side is 1.9 units all told,
 * one long terrace rather than a rank of blocks, and all the height goes to the
 * far rank standing against the pyramid's foot, which is seen *over* the street
 * rather than across it.
 *
 * That is also the photograph: the standard view of the Pyramid of the Sun is
 * taken from the west side of the Avenue, looking east across it.
 */
const ROW_X = -43.6;
const ROW_DEEP = 4;
/**
 * The near terrace is one unbroken run rather than a rank of blocks, and short:
 * at 1.95 units it hides eight of the twelve-and-a-half-unit street, which is
 * about the most that can be given away. Its length is set by the circle — at 46
 * units out in x there are only 28.6 left in z.
 */
const ROW_LONG = 55;
const ROW_STAIR_Z = [-19, 0, 19];

/** The east rank, in the Plaza of the Sun, so the street is lined on both sides. */
const PLAZA_X = -27.5;
const PLAZA_DEEP = 3.5;
const PLAZA_Z = [-31, -23.5, -16, 16, 23.5, 31];

/**
 * How far the site is turned inside the group, and it is the avenue that chooses
 * the angle rather than the pyramid.
 *
 * The quarter camera stands 32 degrees right of +Z, so a street running at
 * azimuth `TURN` shows only `sin(TURN - 32)` of its length across the frame and
 * spends the rest running away from the lens. At 55 degrees — where this started,
 * chosen to make the avenue recede hardest — that is 0.39, and 69 units of avenue
 * came out shorter on screen than the pyramid is wide. At 72 it is 0.64 and the
 * street crosses most of the frame while still carrying 0.77 of its length in
 * depth, which is recession enough to read. The stair face follows at 18 degrees
 * left of +Z, and it lands well: 0.65 of full-on to the quarter camera, 0.95 to
 * the front one, and 0.93 of the sun. The turn lives on a child group; the
 * monument's own transform stays identity, as the contract requires.
 */
const TURN = (72 * Math.PI) / 180;

export const teotihuacan: Monument = {
  id: 'teotihuacan',
  name: 'Teotihuacan',
  iso: 'MEX',
  lat: 19.692,
  lon: -98.844,
  // No realHeight: the source list asserts none, and a city has no height.
  tier: 'building',
  footprint: 54.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper, strut } = ctx;
    // The material story, and it is also what keeps this card from reading as a
    // second Chichen Itza: that pyramid is Yucatan limestone and is painted pale
    // sand here; Teotihuacan is built of dark volcanic rock and tezontle, and
    // shows it wherever the plaster has gone. So the mass is the darkest thing
    // on the card and the lime is reserved for the three places it survives —
    // the stairway, the cornices, and the floor of the street.
    const stone = palette.bark; // bare volcanic rock, and the pyramid alone
    const weathered = palette.tan; // terrace bands, summit, kerbs, cross-walls
    const plaster = palette.sand; // lime: the stair, the cornices, the paving
    const painted = palette.clay; // the red the tableros and alfardas carried
    const built = palette.brown; // the taluds of every platform but the pyramid
    const shade = palette.darkOlive; // the step down into each sunken court

    const group = new THREE.Group();
    const site = new THREE.Group();
    site.rotation.y = TURN;
    group.add(site);

    /**
     * One talud-tablero platform: the profile Teotihuacan invented and exported.
     * A sloping batter, a vertical panel above it, an overhanging cornice — and
     * the cornice is the point, because it is what puts a hard ink line and a
     * band of shadow across every low building on the street.
     *
     * The talud is a unit square prism stretched by the wrapper, so the geometry
     * underneath is the same 16 triangles whatever shape the platform is. Their
     * taluds are `brown` and not the pyramid's `bark`: the east rank stands
     * directly against the pyramid's foot, and in the same colour it would be
     * swallowed by it.
     */
    const platform = (
      width: number,
      depth: number,
      talud: number,
      panel: number,
    ): Group => {
      const batter = 0.16;
      const made = new THREE.Group();

      const wrap = new THREE.Group();
      wrap.add(taper(1, 1 - batter, talud, built, 4));
      wrap.scale.set(width / 2, 1, depth / 2);
      made.add(wrap);

      const px = width * (1 - batter);
      const pz = depth * (1 - batter);
      const face = box(px, panel, pz, painted);
      face.position.y = talud;
      made.add(face);

      const cornice = box(px + 0.9, 0.45, pz + 0.9, plaster);
      cornice.position.y = talud + panel;
      made.add(cornice);

      return made;
    };

    // --- the pyramid: five bodies, each closed by a plaster band ---
    const pyramid = new THREE.Group();
    pyramid.position.x = PYRAMID_X;
    site.add(pyramid);

    let y = 0;
    let half = BASE;
    for (let i = 0; i < TALUD.length; i++) {
      const tier = TALUD[i]! + LEDGE;
      const top = half - ((BASE - SUMMIT) * tier) / BODY;

      const body = taper(half, top, TALUD[i]!, stone, 4);
      body.position.y = y;
      pyramid.add(body);

      // Wider than the body it caps and wider than the one above: every tier
      // ends on a ledge with an ink line under it rather than on a crease.
      const band = box((top + LIP) * 2, LEDGE, (top + LIP) * 2, weathered);
      band.position.y = y + TALUD[i]!;
      pyramid.add(band);

      y += tier;
      half = top;
    }

    // The summit. Flat, generous, and empty — no temple survives on either
    // pyramid here, and inventing one would hand the card straight back to
    // Chichen Itza.
    const crown = box((SUMMIT + 0.6) * 2, CAP, (SUMMIT + 0.6) * 2, weathered);
    crown.position.y = BODY;
    pyramid.add(crown);

    // --- the stairway ---
    for (let i = 0; i < STEPS; i++) {
      const at = i * STEP_RISE;
      const front = faceX(at) - STAIR_PROUD;
      // Deep enough to bury itself in the bodies behind, so only the tread and
      // its riser are ever seen and the flight is held onto the pyramid rather
      // than leaned against it.
      const step = box(STEP_RUN, STEP_RISE, STAIR_HALF * 2, plaster);
      step.position.set(front + STEP_RUN / 2, at, 0);
      pyramid.add(step);
    }

    for (const side of [1, -1]) {
      const foot = faceX(RAIL_FOOT) - STAIR_PROUD + 0.6;
      const head = faceX(BODY) - STAIR_PROUD + 0.6;
      pyramid.add(
        strut(
          new THREE.Vector3(foot, RAIL_FOOT, side * RAIL_Z),
          new THREE.Vector3(head, BODY, side * RAIL_Z),
          RAIL,
          painted,
        ),
      );
      // The alfarda is a beam centred on its own axis, so its lower end is cut
      // on the diagonal and hangs below y = 0. This block covers it, and a
      // squared-off footing is how the real balustrades end.
      const block = box(4.6, RAIL_FOOT + 0.4, RAIL + 0.8, weathered);
      block.position.set(foot + 0.65, 0, side * RAIL_Z);
      pyramid.add(block);
    }

    // --- the Adosada, split by the stair into two wings ---
    for (const side of [1, -1]) {
      const wing = platform(ADOSADA_OUT, ADOSADA_WING, ADOSADA_TALUD, 1.6);
      wing.position.set(
        -BASE - ADOSADA_OUT / 2,
        0,
        side * (RAIL_Z + RAIL / 2 + ADOSADA_WING / 2),
      );
      pyramid.add(wing);
    }

    // --- the street ---
    const paving = box(AVENUE_WIDE, PAVING, AVENUE_LONG, plaster);
    paving.position.set(AVENUE_X, 0, 0);
    site.add(paving);

    // The two lines that actually draw the avenue. Set inside the paving's own
    // edge rather than outside it, because those edges are what set the model's
    // radius and there is nothing left to spend out there.
    for (const side of [1, -1]) {
      // Unequal for the same reason the ranks are: the far wall may be a wall,
      // the near one may only be a kerb. And the far one is the longest thing in
      // the model, because it is the one running away from the eye.
      const far = side > 0;
      const kerb = box(0.9, far ? FAR_KERB : KERB, far ? FAR_KERB_LONG : AVENUE_LONG, weathered);
      kerb.position.set(AVENUE_X + side * (AVENUE_WIDE / 2 - 0.45), PAVING, 0);
      site.add(kerb);
    }

    for (const end of [1, -1]) {
      const tail = box(TAIL_WIDE, PAVING, AVENUE_TAIL, plaster);
      tail.position.set(
        AVENUE_X + AVENUE_WIDE / 2 - TAIL_WIDE / 2,
        0,
        end * (AVENUE_LONG / 2 + AVENUE_TAIL / 2),
      );
      site.add(tail);
    }

    for (const z of CROSS_Z) {
      const wall = box(AVENUE_WIDE, 1.8, 1.6, weathered);
      wall.position.set(AVENUE_X, PAVING, z);
      site.add(wall);
      // The floor on the far side of each wall, a step lower and darker: the
      // avenue climbs north through a chain of enclosed courts rather than
      // running level, and this is the only cue for that which survives at
      // thumbnail size.
      const sill = box(AVENUE_WIDE - 2.2, 0.35, 2.4, shade);
      sill.position.set(AVENUE_X, PAVING, z - 2);
      site.add(sill);
    }

    // An altar in the middle of each court. Small and real, and they are what
    // stops the paving reading as one long empty slab.
    for (const z of [-16.75, 0, 16.75]) {
      const altar = box(3.2, 1, 3.2, built);
      altar.position.set(AVENUE_X, PAVING, z);
      site.add(altar);
      const top = box(3.9, 0.4, 3.9, plaster);
      top.position.set(AVENUE_X, PAVING + 1, z);
      site.add(top);
    }

    // --- the near side: one long low terrace, and three stairs off the street ---
    const terrace = platform(ROW_DEEP, ROW_LONG, 0.9, 0.6);
    terrace.position.set(ROW_X, 0, 0);
    site.add(terrace);

    for (const z of ROW_STAIR_Z) {
      const steps = box(2.2, 0.9, 3.4, plaster);
      steps.position.set(ROW_X + ROW_DEEP / 2 + 1.1, 0, z);
      site.add(steps);
    }

    // --- the far rank, standing against the pyramid's foot ---
    for (const z of PLAZA_Z) {
      const court = platform(PLAZA_DEEP, 6.4, 3.4, 2.2);
      court.position.set(PLAZA_X, 0, z);
      site.add(court);

      // Each fronts the street with a stair. Six of these are what give the
      // avenue its beat; without them the rank is a fence.
      const steps = box(2.4, 2.2, 3.4, plaster);
      steps.position.set(PLAZA_X - PLAZA_DEEP / 2 - 1.2, 0, z);
      site.add(steps);
    }

    return group;
  },
};
