import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Gyeongbokgung — Geunjeongjeon, the Hall of Government by Restraint.
 *
 * A palace hall on a terrace in a walled courtyard, built to differ from the
 * Forbidden City's card in four ways:
 * - Colour: Korean dancheong. `green` (0x91ad78) on every beam and bracket
 *   corbel, a `white` line and a `skyBlue` fascia stepping out above it, a row of
 *   `skyBlue` bracket blocks along the green, over `clay` (0xb36d45) columns, under
 *   grey-black `steel` roofs (never gold).
 * - A gentler, longer roof: two `taper` courses at 21 then 31 degrees on both roofs
 *   (the Forbidden City: 25/33 and 28/35), and an eave overhanging the wall by 5.5
 *   units on a 10.0 half-width and 8.8 storey (0.63 of the wall's height against
 *   0.40).
 * - Painted brackets, so a band and not a shadow: each eave gets three stacked
 *   courses (`green` corbel, `white` line, `skyBlue` fascia, each stepping 0.25
 *   further out) plus a row of `skyBlue` blocks proud of the green, one over each
 *   column. Ten meshes an eave.
 * - Two tiers of terrace and haetae: the woldae is a two-level granite platform
 *   with squat posts (2.0 wide, 2.5 tall against a 1.4-thick, 1.5-tall rail), a
 *   pair of haetae flanking the foot of the lower flight, and the dapdo laid
 *   between the two flights.
 *
 * The crop is Geunjeongjeon on its woldae inside its own courtyard: the haengnang
 * cloister down both sides and across the back, Geunjeongmun in that back run, and
 * the small gates Ilhwamun and Wolhwamun beside it. Two scales, as for the Forbidden
 * City: the buildings at 1.47 units per metre (44.0 units of eave, 31.0 deep), the
 * plan at about 0.5 (the 110 by 130 m courtyard is 60 by 58), foreshortened about 3x.
 *
 * Departures:
 * - The hall is 12% squatter than life (28.75 units against 32.3) and the terrace
 *   1.8x taller (7.9 against 4.4), to fit a palace hall in a 40-unit `building`;
 *   38.85 of 40 are used. The rail is 1.5 and the posts 2.5 (1.7x), or it is a
 *   pencil line on a wall.
 * - Geunjeongmun's height is true (20.9 against 38.85, 0.54) and its width is 1.6x
 *   too wide (a 46-unit lower eave against the hall's 44). 20.9 is a floor, found
 *   by tracing the quarter view's sight line over the hall's skirt roof to about
 *   19.7; shorter is inside the hall's silhouette. From dead front it is still
 *   behind the hall, so that view is carried by the far cloister's wings and the
 *   two small gates.
 * - The cloister is held to 8.0 units (the real one is 8.8 at plan scale) so it
 *   does not cross the lower tier from oblique angles.
 *
 * Left out: the other 329 buildings, the rank stones (24 meshes for two dotted
 * lines), and the japsang. The two chwidu ending the main ridge are kept, `bark`
 * against a `bone` ridge.
 *
 * Colour choices: `bark` is the ground storey's wall, the deepest shade (behind the
 * columns, under an eave overhanging by two thirds of its height), bounded by `tan`
 * podium and `green` architrave so it reads as a recess; the courtyard is `slate`
 * and the woldae `tan` (in `sand` the tiers stop reading as lifted; a neutral
 * terrace goes cold in shade); the main ridge is `bone` where every other roof
 * surface is `steel`, a bright line along the top of the silhouette.
 */

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * The hall's plan aspect: 30 m of eave over 21 m of depth. Every course holds it,
 * since `taper` makes only regular prisms (a four-sided taper inside a group scaled
 * in x). The hips come out shallower than the long slopes; the front elevation is right.
 */
const ASPECT = 1.42;

/**
 * The hall and its terrace sit forward of the plan's centre: the gate and the back
 * cloister need the far third, the stairs and the haetae the near third.
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
 * The rail is low and the posts stand a head above it (2.0 wide and 2.5 tall against
 * a 1.4-thick, 1.5-tall rail), so each post reads as a separate squat block.
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
 * The stack, bottom to top, in half-widths along z; x follows by `ASPECT`. The
 * courses `gongpo`, `gongpoLine` and `eaveFascia` are the painted bracket band
 * (`green` corbel, `white` line, `skyBlue` fascia, each stepping 0.25 further out,
 * with the `skyBlue` blocks of `BRACKET` proud of the green). The same four repeat
 * above the clerestory at 0.8 of the size.
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
 * The bracket blocks, one over each column, proud of the green corbel. `skyBlue`:
 * white blocks read as a dotted highlight, and 1.7 units on a 44-unit eave is about
 * ten pixels where the 0.45-unit blue fascia course is one.
 */
const BRACKET = { width: 1.7, height: 1.5, depth: 1.0 };

/**
 * The two eaves. `hz` is the eave, `mid` the kink, `top` where the course closes.
 * Both roofs run 21 degrees then 31; two courses rather than one is the juzhe idea
 * reduced to a single bend.
 */
const SKIRT = { hz: 15.5, mid: 12.4, top: 8.5, lower: 1.2, upper: 2.4 };
const ROOF = { hz: 12.8, mid: 10.6, top: 5.8, lower: 0.85, upper: 2.9 };

const RIDGE = { width: 17.5, depth: 7.0, height: 1.5 };
/** The dragon-head tiles that terminate the ridge. */
const CHWIDU = { bottom: 1.25, top: 0.8, height: 1.5 };

/**
 * The corner lift: a small kick (1.9 out and 1.25 up on an eave 22.0 half-widths
 * across; the Forbidden City spends 3.2 on 23.5), not a shallow one. A long low beam
 * silhouetted against the sky reads as a rod (4.0 out for 1.8 up did). Each strut
 * starts `out * 2.4` back along the hip line, buried in the tile, so the corner
 * itself turns up. The long, low character is carried by the pitches and the 5.5-unit
 * overhang on a 10.0 half-width.
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
   * The side runs stop at z = 17, short of the woldae's front face at 22.5; run to
   * the paving's front edge they cross the terrace's front corners, which carry the
   * haetae, the dapdo and both flights of stairs.
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
 * Geunjeongmun. Two storeys, on the paving, forward of the back run. 20.9 tall is a
 * floor (see the header): the hall's lower eave lip sits at 21.45 and the skirt roof
 * behind climbs to 25.05, so a sight line from the quarter view's fixed camera
 * reaches the gate's plane at about 19.7. In the three-quarter view the courtyard's
 * 26 units of depth swing it clear of the hall; from the front none of it survives.
 * Seeing it past the hall would take a lower eave narrower than 44 or a gate wider
 * than 55.
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
 * Centred at x = 25.0 their roofs reach 29.8, 7.8 clear of the hall's 22.0 eave, so
 * perspective cannot swallow them (it does to anything nearer than about 27). They
 * carry "this courtyard has gates" in the dead-front view. Two meshes each, a body
 * and a hipped roof, topping out at 9.0, a unit above the cloister.
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
  // No realHeight: the source list gives none (Geunjeongjeon about 25.8 m,
  // Geunjeongmun about 14).
  tier: 'building',
  surface: 'plaster',
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
    // A third value and a cool one: paved in `sand` the courtyard matched the `tan`
    // woldae and the tiers stopped reading as lifted. Cool ground, warm terrace,
    // light rail.

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
     * rectangle comes from a group scaled in x by the plan aspect (the top's x
     * follows from its z). Returns the top half-widths so courses chain.
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
     * The four corners of an eave: a beam running out and up along the hip line, the
     * diagonal of the roof's plan. Long out and little up (see `FLARE`).
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
          // `tile`, not `shade`: a darker strut on a dark roof reads as a black
          // stick; the roof's own colour reads as the corner turning up.
          group.add(strut(from, to, FLARE.thick, tile));
        }
      }
    };

    /**
     * A triangular prism laid on its side, apex up, running along Z (or X with
     * `alongX`): the cloister roofs, 12 triangles. A three-sided `column` has its
     * pitch fixed at 60 degrees, so it is built at unit size and the mesh carries the
     * scale (legal: only the returned group needs an identity transform). After the
     * quarter turn about X: local x is world x, local y the run, local z the height
     * spanning -1 to +2.
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
     * A slab lying on a slope in the z/y plane: the dapdo, the carved stone between
     * the two flights of each stair. The box's long axis is +Z and its origin the
     * centre of its bottom face, so one rotation about X puts its low end at (y0, z0)
     * and its high end at (y1, z1).
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
      // The head sits forward of the body: two solids on one axis are a bollard,
      // and a smaller one pushed out over the paving is an animal crouching.
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
