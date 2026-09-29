import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Gyeongbokgung — Geunjeongjeon, the Hall of Government by Restraint.
 *
 * **The card this file had to avoid.** A palace hall on a stone terrace inside a
 * walled courtyard with a gate is, in words, the Forbidden City's card exactly,
 * and read side by side the two would be the same drawing twice. So the file is
 * organised around the four things that are *not* the same, and the tier is spent
 * on them to the last mesh:
 *
 * - **Colour, which lands before any shape is read.** The Forbidden City is
 *   `red`/`crimson` timber under `gold` tile. Korean *dancheong* is the other
 *   half of the wheel: `green` (0x91ad78, the grey-green of *noerok* pigment) on
 *   every beam and bracket corbel, a `white` line and a `skyBlue` fascia stepping
 *   out above it, and a row of `skyBlue` bracket blocks along the green — over
 *   `clay` (0xb36d45) columns, *seokganju*, an earth red rather than a vermilion,
 *   under `steel` roofs that are **grey-black, never gold**. One thumbnail is
 *   green-and-grey, the other red-and-gold, and nothing else has to be legible
 *   for the two to separate.
 * - **A roof with a gentler, longer curve.** Both roofs are two `taper` courses,
 *   shallow then steep, but the pitches here are **21 then 31 degrees** on both,
 *   against the Forbidden City's 25/33 on its main roof and 28/35 on its skirt.
 *   And the eave overhangs the wall it covers by **5.5 units on a 10.0-unit
 *   half-width and an 8.8-unit storey** — 0.63 of the wall's own height, against
 *   the Chinese hall's 0.40. That is what a *gyeopcheoma* double rafter layer
 *   buys, and it is what makes a Korean hall look like it is sheltering under its
 *   own hat.
 * - **The brackets are painted, so they are a band and not a shadow.** The
 *   Forbidden City spends one `bark` course per eave on its *dougong*, correctly:
 *   Chinese brackets read as the shadow a heavy overhang casts. Korean *gongpo*
 *   are chunkier, stand further out, and are painted, so they must read as a
 *   *decorated band*. Each eave here gets three stacked courses — `green` corbel,
 *   `white` line, `skyBlue` fascia, each stepping 0.25 further out than the one
 *   below — plus a row of `skyBlue` blocks standing proud of the green, one over
 *   each column. Ten meshes an eave for what the Chinese hall does in one, and it
 *   is the most expensive decision in the file.
 * - **Two tiers of terrace, and haetae at the stairs.** The *woldae* is a
 *   two-level granite platform with a balustrade of **squat posts** — 2.0 wide
 *   and 2.5 tall against a 1.4-thick, 1.5-tall rail, so every post stands a head
 *   above the line it sits on, which is what a Korean *dongjaseok* does and what
 *   a Chinese newel does not. A pair of **haetae**, the horned stone beasts, sit
 *   on the paving flanking the foot of the lower flight, and the stone laid
 *   between the two flights is the *dapdo*.
 *
 * ## The crop, and its two scales
 *
 * Gyeongbokgung is 43 hectares and about 330 buildings. What is modelled is one
 * of them — **Geunjeongjeon on its woldae** — inside **its own courtyard**, which
 * is the enclosure this hall is always photographed in and never seen without:
 * the *haengnang* cloister down both sides and across the back, **Geunjeongmun**
 * standing in that back run, and the two small gates beside it, Ilhwamun and
 * Wolhwamun.
 *
 * The crop has two scales. That is the Forbidden City's move, reused here on
 * purpose because it is the correct one and it lands on almost the same number:
 *
 * - **The buildings are at 1.47 units per metre.** Geunjeongjeon's 30 m of eave
 *   is 44.0 units across and its 21 m of depth is 31.0 — one scale, both axes.
 * - **The plan they stand in is at about 0.5.** The real courtyard is roughly
 *   110 m by 130 m; here it is 60 by 58. The enclosure is therefore foreshortened
 *   about **3x against the buildings inside it**, where the Forbidden City's axis
 *   is foreshortened 3.3x.
 *
 * That is what a long lens does, and every photograph of this courtyard is taken
 * with one. Nobody names Gyeongbokgung by how far its gate stands from its hall;
 * at true spacing the gate is a smudge and the paving is the subject.
 *
 * ## Departures, in numbers
 *
 * - **The hall is 12% squatter than life, and the terrace is 1.8x taller.** At
 *   the plan's 1.47 units per metre the hall's 22 m from the woldae surface to
 *   the ridge would be 32.3 units; it is 28.75, so its height runs at 1.31
 *   against its plan's 1.47. The terrace goes the other way: 3 m of real woldae
 *   is 4.4 units at plan scale and it is built at 7.9. Both moves are the same
 *   move. A `building` is 40 units tall, the terrace is a quarter of what makes
 *   this a palace hall rather than a temple, and something had to give it room —
 *   so the hall gave, in the axis a Korean hall can most afford to give, since
 *   long and low is what it is. 38.85 of the 40 units are used.
 * - **What the terrace stretch broke, and the fix.** A 7.9-unit terrace wants a
 *   balustrade in proportion to itself, and a rail at true proportion — about
 *   1 m, so 1.5 units including its posts — came out as a pencil line drawn on a
 *   wall. The rail went to 1.5 alone and the posts to 2.5, which is 1.7x. The
 *   exaggeration landed on the feature that could carry it, because squat is what
 *   those posts already are.
 * - **Geunjeongmun's height is true and its width is not.** It stands 20.9 units
 *   to the hall's 38.85, which is 0.54 — and 14 m against 25.8 m is 0.54, so that
 *   ratio is simply correct. Its lower eave is 46 units wide against the hall's
 *   44, where in life the gate is two thirds of the hall's width: **1.6x too
 *   wide**, and spent deliberately. This is the same bill the Forbidden City paid
 *   on its Meridian Gate and it is paid here for the opposite geometry — see the
 *   note on `GATE`, where the sight line that fixes the number is worked out.
 * - **The cloister is held to 8.0 units where the real haengnang is about 6 m
 *   (8.8 at plan scale, more with its plinth) and stands taller than the woldae.**
 *   It is the only thing between the camera and the terrace across three quarters
 *   of the compass, and at true height it crosses the lower tier from any oblique
 *   angle. Short, it encloses the courtyard and never covers it — the same
 *   compromise the Forbidden City's palace wall makes at 5.8.
 *
 * ## Traded away
 *
 * - **The other 329 buildings** — Gyeonghoeru on its 48 pillars in the lake,
 *   Gwanghwamun and its own haetae, Hyangwonjeong, the whole northern half. Each
 *   costs the courtyard, and the courtyard is the frame.
 * - **The rank stones.** Two rows of twelve *pumgyeseok* line the path from the
 *   gate to the woldae, and nothing else on the planet has them. Twenty-four
 *   meshes is a fifth of the tier for two dotted lines three pixels tall.
 * - **The japsang**, the clay figurines walking down each hip ridge: below a
 *   pixel. The two *chwidu* that terminate the main ridge are kept, because they
 *   break the ridge line, and they are `bark` against a `bone` ridge so they read
 *   as ornaments rather than as more roof.
 *
 * ## Three colour choices worth the words
 *
 * `bark` (0x4a413c) is the ground storey's wall, and it is dark on purpose: what
 * stands behind Geunjeongjeon's columns is a wall of dark latticed doors under an
 * eave overhanging it by two thirds of its own height, so it is genuinely the
 * deepest shade in the model. It is bounded — `tan` podium below, `green`
 * architrave above — so it reads as a recess and not as a hole, and it is what
 * makes the `clay` columns in front of it register at all.
 *
 * The courtyard is `slate` and the woldae `tan`, and that pairing was arrived at
 * the hard way. Paved in `sand` the court came out the same tone as the terrace
 * standing on it and the two tiers stopped reading as lifted at all. Cool ground,
 * warm terrace, light `bone` rail is the ladder, and it takes exactly three steps
 * to get it. `tan` for the terrace rather than the obvious `bone` is the note on
 * `palette` in `contract.ts` being obeyed: a 7.9-unit mass has a shaded face from
 * every angle there is, and a neutral in shade here comes back a cold hole.
 *
 * The main ridge is `bone` where every other roof surface is `steel`. Korean
 * palace ridges are stacked tile bedded in lime and they come back pale in every
 * photograph; at thumbnail size it draws a bright line along the top of the
 * silhouette, which is the one place a dark roof has nothing to give the ink.
 */

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * The hall's plan aspect — 30 m of eave over 21 m of depth. Every course of the
 * hall holds it, because `taper` makes only *regular* prisms: a rectangular
 * course is a four-sided taper inside a group scaled in x, and the scale is the
 * aspect. The cost is that the hips come out shallower than the long slopes; the
 * front elevation, which is the one that names the building, is right.
 */
const ASPECT = 1.42;

/**
 * The hall and its terrace sit forward of the plan's centre. The gate and the
 * back cloister need the far third, and the stairs and the haetae need somewhere
 * to land in the near third.
 */
const AXIS_Z = 3;

/** The courtyard paving. Its corner, hypot(30, 29) = 41.7, is the model's radius. */
const PAVING = { hx: 30, hz: 29, height: 0.6 };

// ---------------------------------------------------------------------------
// The woldae: two granite tiers, a squat balustrade, and the haetae
// ---------------------------------------------------------------------------

const TERRACE = [
  { hx: 25.5, hz: 19.5, base: PAVING.height, height: 3.9 },
  { hx: 23.0, hz: 17.0, base: 4.5, height: 4.1 },
];
const TERRACE_TOP = 8.6;

/**
 * The rail is low and the posts stand a head above it. That ratio is the whole
 * difference between a Korean stone balustrade and a Chinese one: 2.0 wide and
 * 2.5 tall against a 1.4-thick, 1.5-tall rail, so each post reads as a separate
 * squat block rather than as a bump in a continuous line.
 */
const RAIL = { thick: 1.4, height: 1.5 };
const POST = { width: 2.0, height: 2.5 };

/** Half-width of the gap the stairs cut in the rail and of the flights themselves. */
const STAIR = { half: 8, run: 4.6, tread: 2.4, dapdo: 5 };

/** The haetae, on the paving at the foot of the lower flight. */
const HAETAE = { x: 11.2, z: 25.4, body: 3.0, head: 1.7 };

// ---------------------------------------------------------------------------
// Geunjeongjeon
// ---------------------------------------------------------------------------

/**
 * The stack, bottom to top, in half-widths along z; x follows by `ASPECT`.
 *
 * The three courses named `gongpo`, `gongpoLine` and `eaveFascia` are one thing:
 * the painted bracket band — `green` corbel, `white` line, `skyBlue` fascia,
 * each stepping 0.25 further out than the one below, with the `skyBlue` blocks
 * of `BRACKET` standing proud of the green. The same four repeat above the
 * clerestory at 0.8 of the size.
 */
const HALL = {
  podium: { hz: 13.5, height: 0.9 },
  storey: { hz: 10.0, height: 8.8 },
  architrave: { hz: 10.3, height: 1.0 },
  gongpo: { hz: 11.3, height: 1.3 },
  gongpoLine: { hz: 11.55, height: 0.4 },
  eaveFascia: { hz: 11.8, height: 0.45 },
  clerestory: { hz: 8.0, height: 4.2 },
  upperArch: { hz: 8.3, height: 0.9 },
  upperGongpo: { hz: 9.2, height: 1.2 },
  upperLine: { hz: 9.4, height: 0.35 },
  upperFascia: { hz: 9.6, height: 0.4 },
};

/** Six columns across the front, so Geunjeongjeon's five bays come out as five bays. */
const COLUMNS = { count: 6, radius: 1.15, sideZ: 4.3 };

/**
 * The bracket blocks, one over each column, standing proud of the green corbel.
 *
 * They are `skyBlue` and were `white` first. White blocks on a green band read
 * as a dotted highlight and nothing more; blue ones put the third dancheong
 * colour on the model at a size that survives — 1.7 units on a 44-unit eave is
 * about ten pixels at thumbnail size, where the 0.45-unit blue fascia course is
 * one. The band went from "green with a pale line" to "green, blue and white" on
 * that change alone, and it cost nothing: the meshes were already there.
 */
const BRACKET = { width: 1.7, height: 1.5, depth: 1.0 };

/**
 * The two eaves. `hz` is the eave, `mid` the kink, `top` where the course closes.
 *
 * Both roofs run **21 degrees then 31**, where the Forbidden City's main roof is
 * 25 then 33 and its skirt 28 then 35. Two courses rather than one is the *juzhe*
 * idea reduced to a single bend and it is what separates either roof from a
 * pyramid; the four degrees between the two countries' versions of it is the
 * whole of "gentler", and it is worth exactly as much as the overhang and the
 * corner kick that go with it.
 */
const SKIRT = { hz: 15.5, mid: 12.4, top: 8.5, lower: 1.2, upper: 2.4 };
const ROOF = { hz: 12.8, mid: 10.6, top: 5.8, lower: 0.85, upper: 2.9 };

const RIDGE = { width: 17.5, depth: 7.0, height: 1.5 };
/** The dragon-head tiles that terminate the ridge. */
const CHWIDU = { bottom: 1.25, top: 0.8, height: 1.5 };

/**
 * The corner lift, and it is the softness of a **small** kick rather than a
 * shallow one. The first version reasoned that "gentler" meant a lower rise over
 * a longer run — 4.0 out for 1.8 up, against the Forbidden City's 3.2 for 2.2 —
 * and at thumbnail size the eight struts came out as black sticks projecting
 * sideways off the roof, because a nearly horizontal beam silhouetted against
 * the sky is a rod and not a roof. The softness lives instead in the *scale* of
 * the kick: 1.9 out and 1.25 up on a roof whose eave is 22.0 half-widths across,
 * where the Forbidden City spends 3.2 on an eave of 23.5. Half the gesture on
 * nearly the same roof. Each strut starts `out * 2.4` back along the hip line,
 * buried inside the tile, so what emerges is the corner itself turning up.
 *
 * The *long, low* half of the Korean roof is carried where it belongs and where
 * it survives the thumbnail: in the pitches, and in a 5.5-unit overhang on a
 * 10.0-unit half-width.
 */
const FLARE = { skirtOut: 1.9, skirtRise: 1.25, roofOut: 1.7, roofRise: 1.1, thick: 1.15 };

// ---------------------------------------------------------------------------
// The haengnang cloister, and the gates in it
// ---------------------------------------------------------------------------

const CLOISTER = {
  x: 28.0,
  half: 1.4,
  plinthHalf: 1.8,
  bandHalf: 2.1,
  roofHalf: 2.7,
  /**
   * The side runs stop at z = 17, short of the woldae's front face at 22.5. Run
   * to the front edge of the paving they cross the terrace's front corners from
   * any oblique angle, and those corners carry the haetae, the dapdo and both
   * flights of stairs.
   */
  front: 17,
  back: -26.5,
  plinth: 1.0,
  wall: 3.9,
  band: 0.55,
  rise: 1.95,
  /** Two posts a side, spanning the wall's full thickness so both faces show them. */
  posts: [-16, 4],
};

/**
 * Geunjeongmun. Two storeys, on the paving, standing forward of the back run.
 *
 * **20.9 tall is a floor, not a ceiling, and it was measured rather than
 * chosen.** The hall's lower eave is a hard horizontal whose lip sits at 21.45,
 * and behind that lip the skirt roof keeps climbing to 25.05. Trace a sight line
 * from the contact sheet's own camera — it is a fixed rig, so this is arithmetic
 * and not taste — over that roof at the half-widths where the gate stands, and it
 * lands at about 19.7 units on the gate's plane. Anything shorter is inside the
 * hall's silhouette and is nine meshes nobody will ever see. The first version
 * was 19.0 and was exactly that.
 *
 * **And from dead front it is still behind the hall, which is the honest finding
 * and is why the file spends elsewhere.** The gate was rendered with its meshes
 * flagged a different colour to check: in the contact sheet's default
 * three-quarter view the courtyard's 26 units of depth swing it clear of the hall
 * and it reads as a stepped two-storey mass on the far wall; with the front-view
 * box ticked, none of it survives. Getting it seen *past* the hall instead of
 * over it would take a lower eave narrower than 44 units or a gate wider than 55,
 * and the second is what the Forbidden City did. So dead front is carried by the
 * far cloister's wings and by Ilhwamun and Wolhwamun, which stand outboard of the
 * hall's eave and cost two meshes each.
 */
const GATE = {
  z: -21,
  bodyHalf: 9.5,
  bodyDepth: 6.0,
  bodyHeight: 7.5,
  posts: [-6.3, 6.3],
  bandHalf: 10.5,
  bandDepth: 7.2,
  bandHeight: 1.1,
  eaveHx: 23,
  eaveHz: 6.0,
  eaveTop: 4.0,
  eaveHeight: 2.2,
  upperHalf: 6.75,
  upperDepth: 4.8,
  upperHeight: 4.6,
  upperBandHalf: 7.5,
  upperBandDepth: 5.6,
  upperBandHeight: 0.8,
  roofHx: 17.5,
  roofHz: 4.8,
  roofTop: 2.5,
  roofHeight: 3.0,
  ridge: { width: 11.5, depth: 3.4, height: 1.1 },
};

/**
 * Ilhwamun and Wolhwamun, the small gates flanking Geunjeongmun in the same run.
 * Centred at x = 25.0 their roofs reach 29.8, which is 7.8 clear of the hall's
 * 22.0 eave — enough that perspective cannot swallow them at the extra 26 units
 * of depth, which it does to anything nearer than about 27. That margin is the
 * only reason they are here: they carry "this courtyard has gates" in the
 * dead-front view, where Geunjeongmun itself is entirely behind the hall. Two
 * meshes each, a body and a hipped roof, and they top out at 9.0 — a unit above
 * the cloister they sit in, so the far roofline steps up twice before it steps
 * up to the gate.
 */
const SIDE_GATE = {
  x: 25.0,
  z: -25.5,
  half: 3.2,
  depth: 3.0,
  height: 6.0,
  eaveHx: 4.8,
  eaveHz: 3.4,
  eaveTop: 1.3,
  eaveHeight: 2.4,
};

export const gyeongbokgung: Monument = {
  id: 'gyeongbokgung',
  name: 'Gyeongbokgung Palace',
  iso: 'KOR',
  lat: 37.579,
  lon: 126.977,
  // No realHeight: the source list asserts none, and there is no such number.
  // Geunjeongjeon is about 25.8 m, Geunjeongmun about 14, Gwanghwamun another
  // figure again, and the thing itself is a 43-hectare palace.
  tier: 'building',
  // The paving's corner, at hypot(30, 29) = 41.72. Everything else is inside it.
  footprint: 42,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;

    const tile = palette.steel; // every roof: the grey-black giwa, never gold
    const ridgeStone = palette.bone; // the lime-bedded ridge, and the balustrade
    const timber = palette.clay; // seokganju: the earth-red columns and posts
    const shade = palette.bark; // the lattice-door wall, the chwidu, the flares
    const paint = palette.green; // noerok: every beam and every bracket corbel
    const line = palette.white; // the white line of dancheong, and the plaster
    const accent = palette.skyBlue; // the blue fascia under each bracket band
    const granite = palette.tan; // the woldae and the cloister plinths — warm,
    // so a mass with a shaded face from every angle keeps its hue. See the note
    // on `palette` in `contract.ts`: `bone` here would come back a cold hole.
    const bakseok = palette.slate; // the rough grey bakseok paving of the court.
    // It has to be a third value and a cool one: paved in `sand` the courtyard
    // came out the same tone as the `tan` woldae standing on it, and the two
    // tiers stopped reading as lifted at all. Cool ground, warm terrace, light
    // rail is the ladder, and it only takes three steps to get it.

    const group = new THREE.Group();

    /** A box placed by its base centre, which is where every helper's origin is. */
    const put = (
      width: number,
      height: number,
      depth: number,
      color: number,
      x: number,
      y: number,
      z: number,
    ): void => {
      const mesh = box(width, height, depth, color);
      mesh.position.set(x, y, z);
      group.add(mesh);
    };

    /** One course of the hall, stated as a half-width in z, with x by `ASPECT`. */
    const course = (
      half: { hz: number; height: number },
      y: number,
      color: number,
    ): number => {
      put(half.hz * ASPECT * 2, half.height, half.hz * 2, color, 0, y, AXIS_Z);
      return y + half.height;
    };

    /**
     * One course of a hipped roof. `taper` makes regular prisms only, so the
     * rectangle comes from a group scaled in x by the plan aspect — which is why
     * the top's x follows from the top's z and cannot be chosen. Returns the top
     * half-widths so courses chain.
     */
    const roofCourse = (
      hx: number,
      hz: number,
      topHz: number,
      height: number,
      y: number,
      z: number,
      color: number,
      x = 0,
    ): { hx: number; hz: number; top: number } => {
      const aspect = hx / hz;
      const wrap = new THREE.Group();
      wrap.add(taper(hz, topHz, height, color, 4));
      wrap.scale.x = aspect;
      wrap.position.set(x, y, z);
      group.add(wrap);
      return { hx: topHz * aspect, hz: topHz, top: y + height };
    };

    /**
     * The four corners of an eave: a beam running out and up along the hip line,
     * which is the diagonal of the roof's own plan. Long out and little up — see
     * `FLARE`.
     */
    const flare = (hz: number, y: number, out: number, rise: number): void => {
      const hx = hz * ASPECT;
      const length = Math.hypot(hx, hz);
      const ux = hx / length;
      const uz = hz / length;
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          const inset = out * 2.4;
          const from = new THREE.Vector3(
            sx * (hx - ux * inset),
            y - 0.35,
            AXIS_Z + sz * (hz - uz * inset),
          );
          const to = new THREE.Vector3(
            sx * (hx + ux * out),
            y + rise,
            AXIS_Z + sz * (hz + uz * out),
          );
          // `tile`, not `shade`. A darker strut on a dark roof reads as a black
          // stick glued to a corner; the same colour as the tile it grows out
          // of reads as the corner itself turning up, which is the thing.
          group.add(strut(from, to, FLARE.thick, tile));
        }
      }
    };

    /**
     * A triangular prism laid on its side, apex up, running along Z — or along X
     * with `alongX`. The cloister roofs, and the cheapest gable there is at 12
     * triangles.
     *
     * A three-sided `column` on its side has its pitch fixed at 60 degrees by its
     * own geometry, so it is built at unit size and the *mesh* carries the scale,
     * which is legal — only the returned group must have an identity transform.
     * Local axes after the quarter turn about X: local x stays world x, local y
     * becomes the world run, local z becomes the world height spanning -1 to +2.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      alongX = false,
    ): void => {
      const prism = column(1, length, tile, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
    };

    /**
     * A slab lying on a slope in the z/y plane: the dapdo, the carved stone laid
     * between the two flights of each stair. The box's long axis is +Z and its
     * origin is the centre of its bottom face, so one rotation about X puts its
     * low end at (y0, z0) and its high end at (y1, z1) exactly.
     */
    const dapdo = (y0: number, z0: number, y1: number, z1: number): void => {
      const run = z0 - z1;
      const rise = y1 - y0;
      const mesh = box(STAIR.dapdo, 0.55, Math.hypot(run, rise), ridgeStone);
      mesh.rotation.x = Math.atan2(rise, run);
      mesh.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
      group.add(mesh);
    };

    // --- the courtyard paving -------------------------------------------
    put(PAVING.hx * 2, PAVING.height, PAVING.hz * 2, bakseok, 0, 0, 0);

    // --- the woldae: two tiers, their balustrade and their stairs --------
    for (const tier of TERRACE) {
      put(tier.hx * 2, tier.height, tier.hz * 2, granite, 0, tier.base, AXIS_Z);

      const top = tier.base + tier.height;
      const inner = tier.hz - RAIL.thick;

      // Four runs, lapped at the corners so the ink draws the joint, the front
      // one split for the stairs.
      put(tier.hx * 2, RAIL.height, RAIL.thick, ridgeStone, 0, top, AXIS_Z - tier.hz + RAIL.thick / 2);
      for (const side of [1, -1]) {
        put(RAIL.thick, RAIL.height, inner * 2, ridgeStone, side * (tier.hx - RAIL.thick / 2), top, AXIS_Z);
        put(
          tier.hx - STAIR.half,
          RAIL.height,
          RAIL.thick,
          ridgeStone,
          (side * (tier.hx + STAIR.half)) / 2,
          top,
          AXIS_Z + tier.hz - RAIL.thick / 2,
        );
        // A squat post at the head of the flight and one at the front corner.
        for (const x of [STAIR.half + POST.width / 2, tier.hx - POST.width / 2]) {
          put(POST.width, POST.height, POST.width, ridgeStone, side * x, top, AXIS_Z + tier.hz - POST.width / 2);
        }
      }

      // Two treads and the dapdo, which rides 0.3 above them because it is a
      // separate stone laid between two flights, not on them.
      const face = AXIS_Z + tier.hz;
      put(STAIR.half * 2, tier.height / 2, STAIR.tread, granite, 0, tier.base, face + STAIR.run - STAIR.tread / 2);
      put(STAIR.half * 2, tier.height, STAIR.tread, granite, 0, tier.base, face + STAIR.tread / 2);
      dapdo(tier.base + 0.3, face + STAIR.run, top + 0.3, face);
    }

    // --- the haetae, flanking the foot of the lower flight ----------------
    for (const side of [1, -1]) {
      const body = taper(1.95, 1.3, HAETAE.body, ridgeStone, 6);
      body.position.set(side * HAETAE.x, PAVING.height, HAETAE.z);
      group.add(body);
      // The head sits forward of the body, which is the whole trick: two solids
      // on one axis are a bollard, and two with the smaller one pushed out over
      // the paving are an animal crouching towards you.
      const head = column(1.15, HAETAE.head, ridgeStone, 6);
      head.position.set(side * HAETAE.x, PAVING.height + HAETAE.body, HAETAE.z + 0.85);
      group.add(head);
    }

    // --- the hall: podium, dark storey, red columns -----------------------
    let y = course(HALL.podium, TERRACE_TOP, granite);
    const storeyBase = y;
    y = course(HALL.storey, y, shade);

    // The end columns stand `PROUD` in from the storey's ends: flush, their
    // outer flats lay in the plane of the dark wall's end and flickered.
    const span = HALL.storey.hz * ASPECT - COLUMNS.radius - PROUD;
    for (let i = 0; i < COLUMNS.count; i++) {
      const post = column(COLUMNS.radius, HALL.storey.height, timber, 8);
      post.position.set(
        -span + (2 * span * i) / (COLUMNS.count - 1),
        storeyBase,
        AXIS_Z + HALL.storey.hz + COLUMNS.radius * 0.4,
      );
      group.add(post);
    }
    for (const side of [1, -1]) {
      for (const offset of [COLUMNS.sideZ, -COLUMNS.sideZ]) {
        const post = column(COLUMNS.radius, HALL.storey.height, timber, 8);
        post.position.set(
          side * (HALL.storey.hz * ASPECT + COLUMNS.radius * 0.4),
          storeyBase,
          AXIS_Z + offset,
        );
        group.add(post);
      }
    }

    // --- the lower dancheong band: green, white, blue, then the brackets ---
    y = course(HALL.architrave, y, paint);
    const bracketBase = y;
    y = course(HALL.gongpo, y, paint);
    y = course(HALL.gongpoLine, y, line);
    y = course(HALL.eaveFascia, y, accent);
    for (let i = 0; i < COLUMNS.count; i++) {
      put(
        BRACKET.width,
        BRACKET.height,
        BRACKET.depth,
        accent,
        -span + (2 * span * i) / (COLUMNS.count - 1),
        bracketBase + 0.15,
        AXIS_Z + HALL.gongpo.hz + BRACKET.depth / 2 - 0.2,
      );
    }

    // --- the lower eave: shallow then steep, and a very long overhang ------
    const skirtBase = y;
    const skirtLower = roofCourse(SKIRT.hz * ASPECT, SKIRT.hz, SKIRT.mid, SKIRT.lower, y, AXIS_Z, tile);
    const skirtUpper = roofCourse(
      skirtLower.hx,
      skirtLower.hz,
      SKIRT.top,
      SKIRT.upper,
      skirtLower.top,
      AXIS_Z,
      tile,
    );
    flare(SKIRT.hz, skirtBase, FLARE.skirtOut, FLARE.skirtRise);

    // --- the clerestory, its red pilasters, and the second band -----------
    const clerestoryBase = skirtUpper.top;
    y = course(HALL.clerestory, clerestoryBase, shade);
    for (const x of [-7.4, -2.6, 2.6, 7.4]) {
      put(1.3, HALL.clerestory.height, 0.7, timber, x, clerestoryBase, AXIS_Z + HALL.clerestory.hz + 0.3);
    }

    y = course(HALL.upperArch, y, paint);
    const upperBracketBase = y;
    y = course(HALL.upperGongpo, y, paint);
    y = course(HALL.upperLine, y, line);
    y = course(HALL.upperFascia, y, accent);
    for (const x of [-6.6, -2.2, 2.2, 6.6]) {
      put(1.4, 1.2, 0.8, accent, x, upperBracketBase + 0.1, AXIS_Z + HALL.upperGongpo.hz + 0.2);
    }

    // --- the main roof ----------------------------------------------------
    const roofBase = y;
    const roofLower = roofCourse(ROOF.hz * ASPECT, ROOF.hz, ROOF.mid, ROOF.lower, y, AXIS_Z, tile);
    const roofUpper = roofCourse(
      roofLower.hx,
      roofLower.hz,
      ROOF.top,
      ROOF.upper,
      roofLower.top,
      AXIS_Z,
      tile,
    );
    flare(ROOF.hz, roofBase, FLARE.roofOut, FLARE.roofRise);

    put(RIDGE.width, RIDGE.height, RIDGE.depth, ridgeStone, 0, roofUpper.top, AXIS_Z);
    for (const side of [1, -1]) {
      const head = taper(CHWIDU.bottom, CHWIDU.top, CHWIDU.height, shade, 4);
      head.position.set((side * RIDGE.width) / 2, roofUpper.top + RIDGE.height, AXIS_Z);
      group.add(head);
    }

    // --- the cloister down both sides -------------------------------------
    const runLength = CLOISTER.front - CLOISTER.back;
    const runZ = (CLOISTER.front + CLOISTER.back) / 2;
    const plinthTop = PAVING.height + CLOISTER.plinth;
    const wallTop = plinthTop + CLOISTER.wall;
    for (const side of [1, -1]) {
      const x = side * CLOISTER.x;
      put(CLOISTER.plinthHalf * 2, CLOISTER.plinth, runLength, granite, x, PAVING.height, runZ);
      put(CLOISTER.half * 2, CLOISTER.wall, runLength, line, x, plinthTop, runZ);
      for (const z of CLOISTER.posts) {
        put(CLOISTER.half * 2 + 0.5, CLOISTER.wall, 1.1, timber, x, plinthTop, z);
      }
      put(CLOISTER.bandHalf * 2, CLOISTER.band, runLength + 1, timber, x, wallTop, runZ);
      gable(x, runZ, runLength + 1, CLOISTER.roofHalf, wallTop + CLOISTER.band, CLOISTER.rise);
    }

    // --- and across the back ----------------------------------------------
    const backHalf = CLOISTER.x + CLOISTER.plinthHalf;
    put(backHalf * 2, CLOISTER.plinth, CLOISTER.plinthHalf * 2, granite, 0, PAVING.height, CLOISTER.back);
    put(backHalf * 2 - 1, CLOISTER.wall, CLOISTER.half * 2, line, 0, plinthTop, CLOISTER.back);
    put(backHalf * 2, CLOISTER.band, CLOISTER.bandHalf * 2, timber, 0, wallTop, CLOISTER.back);
    gable(0, CLOISTER.back, backHalf * 2, CLOISTER.roofHalf, wallTop + CLOISTER.band, CLOISTER.rise, true);

    // --- Geunjeongmun, standing forward of the back run -------------------
    let g = PAVING.height;
    put(GATE.bodyHalf * 2, GATE.bodyHeight, GATE.bodyDepth * 2, shade, 0, g, GATE.z);
    for (const x of GATE.posts) {
      put(1.5, GATE.bodyHeight, GATE.bodyDepth * 2 + 0.6, timber, x, g, GATE.z);
    }
    g += GATE.bodyHeight;
    put(GATE.bandHalf * 2, GATE.bandHeight, GATE.bandDepth * 2, paint, 0, g, GATE.z);
    g += GATE.bandHeight;
    const gateSkirt = roofCourse(GATE.eaveHx, GATE.eaveHz, GATE.eaveTop, GATE.eaveHeight, g, GATE.z, tile);
    put(GATE.upperHalf * 2, GATE.upperHeight, GATE.upperDepth * 2, timber, 0, gateSkirt.top, GATE.z);
    g = gateSkirt.top + GATE.upperHeight;
    put(GATE.upperBandHalf * 2, GATE.upperBandHeight, GATE.upperBandDepth * 2, paint, 0, g, GATE.z);
    g += GATE.upperBandHeight;
    const gateRoof = roofCourse(GATE.roofHx, GATE.roofHz, GATE.roofTop, GATE.roofHeight, g, GATE.z, tile);
    put(GATE.ridge.width, GATE.ridge.height, GATE.ridge.depth, ridgeStone, 0, gateRoof.top, GATE.z);

    // --- Ilhwamun and Wolhwamun -------------------------------------------
    for (const side of [1, -1]) {
      const x = side * SIDE_GATE.x;
      put(SIDE_GATE.half * 2, SIDE_GATE.height, SIDE_GATE.depth * 2, timber, x, PAVING.height, SIDE_GATE.z);
      roofCourse(
        SIDE_GATE.eaveHx,
        SIDE_GATE.eaveHz,
        SIDE_GATE.eaveTop,
        SIDE_GATE.eaveHeight,
        PAVING.height + SIDE_GATE.height,
        SIDE_GATE.z,
        tile,
        x,
      );
    }

    return group;
  },
};
