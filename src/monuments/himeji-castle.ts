import type { Monument } from './contract.ts';

/**
 * Himeji Castle — Shirasagi-jo, the White Heron.
 *
 * **One tower, and everything else is scaffolding for it.** Himeji is not a
 * castle in the European sense of a walled compound you look *at*; it is a
 * single object — the daitenshu, the great keep — that a whole hill was rebuilt
 * to lift into the air. So this file spends 46.9 of its 69.9 units on one stack,
 * 23 on the stone that holds it up, and builds exactly four other things around
 * its foot.
 *
 * What has to survive at thumbnail size, in the order the eye finds it:
 *
 * - **The stack of receding storeys, each ringed by its own wide roof.** Five
 *   levels, and the number that matters at every one of them is the *overhang*:
 *   in x the eave stands 4.6 units clear of the wall it covers on the first
 *   level, then 3.7, 2.9, 2.4, 2.2. That is what makes the silhouette a series
 *   of horizontal wings — five grey bars, each shorter than the last, with a
 *   white band showing between every pair. The bird in the nickname is a heron
 *   with its wings half-spread, and that is a statement about this profile and
 *   nothing else.
 * - **The recession is not uniform, and it took a rebuild to learn that.** Eave
 *   half-widths run 12.4, 11.0, 8.0, 6.2, 4.9 — ratios 0.89, 0.73, 0.78, 0.79.
 *   The first version stepped in by a constant 0.81 all the way up and came out
 *   a **pagoda**: a pagoda's storeys are a geometric series and a keep's are
 *   not. A keep has a big lower mass — floors one and two, nearly the same size,
 *   carrying the great roof — and then a sharp step in for the small floors
 *   above. That one change did more for the read than any amount of ornament.
 * - **The stone base, and its curve.** 23 of the 69.9 units, 33%, which is also
 *   its real share (14.85 m of ishigaki under a 31.5 m keep = 32%). Four `taper`
 *   courses whose half-widths step in by 1.6, then 0.8, then 0.4, then 0.15 —
 *   the deltas shrink, so the profile is **concave**: near vertical where the
 *   keep sits on it and flaring hard at the ground. That is the *ogi-no-kobai*,
 *   the fan slope, and it is the one thing about a Japanese castle base that a
 *   European one never does. A straight batter reads as a plinth; the
 *   accelerating flare reads as a hillside that has been built.
 * - **The gables set into the roof faces.** Five *chidori-hafu*, the triangular
 *   dormers — a pair side by side on the great first roof, one on each of its
 *   flanks, one more on the third — and two *kara-hafu*, the curved ones, on the
 *   second and fourth. White against grey. Without them the five roofs are five
 *   plain trapezoids; this is the ornament, and there is no other.
 * - **The upturned corners.** Four struts per roof running out and up along the
 *   hip line, on all five roofs: twenty meshes, a quarter of the tier's budget,
 *   for the single feature that most says *this roof was built in Japan*.
 * - **It is a group, not a solitary tower.** Two subsidiary keeps
 *   (*shotenshu*) stand at the front corners, each with its own fan-slope base
 *   and its own two-roof stack; a *watariyagura* corridor runs back from each
 *   one down the flank of the main base. In life there are three small keeps and
 *   four corridors closing a courtyard; two of each is what the footprint holds,
 *   and two is enough to say the keep has a family.
 *
 * ## Colour
 *
 * `white` (0xfff2e8) is every plastered wall and every gable, and it is doing
 * the naming: this building is famous for being white, and it is white because
 * the fireproofing plaster is carried over the timber *and over the roof tiles'
 * own joints*, which is why the roofs read as grey lines drawn on a white thing
 * rather than as a lid set on top of it. `steel` (0x575a5e) is every roof, ridge
 * and corner strut — the dark blue-grey of the tile.
 *
 * The stone base is `brown` (0x988165), and that is a deliberate refusal of the
 * obvious `bone`. Read the note on `palette` in `contract.ts`: a neutral turned
 * away from the sun keeps its value and loses its hue, and this scene's
 * `HemisphereLight` is sky-blue, so `bone` in shade comes back a cold hueless
 * patch and `slate` comes back frankly blue. A 23-unit battered mass has a shaded
 * face from every angle there is, and a base that reads as a hole is a base that
 * has stopped holding the keep up. `brown` is warm, so its shaded side stays
 * stone — and it was picked over the greyer `tan` on the contact sheet itself,
 * where `tan` lit came out within a band of `white` in shade and the base and
 * the plaster started to merge into one cream mass.
 * `bark` is the gate, the window slots and the top storey's gallery band; `gold`
 * is the two *shachihoko*, the dolphin finials on the ridge, and it is 32
 * triangles of the whole model.
 *
 * Five colours: white, grey, warm stone, and two accents. The model is meant to
 * be nameable from that list alone.
 *
 * ## Departures, in numbers
 *
 * - **`tower`, and the whole file follows from that.** `building` would have let
 *   this be built at true proportions — 40 units tall is 0.86 units per metre,
 *   the group's real 60 m spread comes to 52 units, and it all fits inside that
 *   tier's 55-unit footprint with room over. It was rejected. The tier question
 *   is "from how far should a player be able to name it"; the answer for a keep
 *   on a hill above a city is *from across the city*; and at 40 units Himeji
 *   would stand exactly as tall as Neuschwanstein and the Forbidden City and be
 *   filed with them as a third wide palace. `tower` caps the footprint at 28
 *   against 70 units of height precisely so that nothing in it can come out
 *   squat, which is the right constraint for the most vertical thing in Japanese
 *   architecture. The bill is itemised below.
 * - **The keep's own plan is squeezed 1.56x.** At this model's vertical scale
 *   (69.9 units over the real 46.4 m = 1.51 units per metre) the keep's 20 m of
 *   wall would be 30.1 units across; it is 19.3. So the tower stands 2.43 tall
 *   for every 1 wide where life gives 1.58 — **1.54x more slender than the real
 *   building**, and that is the single largest liberty in the file. It is taken
 *   knowingly: what a castle keep is *for* is height, the tier is 70 units of it,
 *   and the alternative was to spend the height allowance on air.
 * - **What that broke, and the fix.** Squeezing the plan under an unchanged
 *   vertical shrinks the overhangs, and the overhang is the whole read. Himeji's
 *   first eave projects about 2 m past the wall, which is 3.0 units at this
 *   scale, and 3 units of eave on a 47-unit tower is a pinstripe. The first
 *   overhang was widened to 4.6 — **1.53x** — and the others in step, so the
 *   wings stay wings. The roofs were therefore squeezed only 1.27x against the
 *   walls' 1.56x, which is why the great roof still hangs clear of the stone
 *   base's foot — 0.7 units in x, 0.6 in z — as it does in life.
 * - **The courtyard spacing is squeezed about 2.0x on top of that.** The tenshu
 *   group is roughly 60 m across in life, 90 units at this scale; here it is
 *   44.7. The small keeps have been pulled in against the great one until their
 *   stone feet run into its own, which is the same move the Forbidden City makes
 *   with its axis and for the same reason — nobody names Himeji by how far apart
 *   its keeps stand, and every photograph taken from the Nishinomaru already
 *   compresses them into one mass.
 * - **Five roofs, not six storeys.** Himeji is six floors inside, seven counting
 *   the basement, and five from outside, because two of the upper floors share a
 *   roof. The model builds the five you can see, which is the number the
 *   silhouette has always had.
 * - **Two small keeps, not three; no Nishinomaru, no Hyakken-roka, no moats, no
 *   82 other buildings.** The complex is 233 hectares. Everything past the
 *   tenshu group is a texture at this size.
  */

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * The keep's plan aspect: it is 1.15 wider across the front than it is deep, and
 * every course of it — base, wall and roof — holds that ratio.
 *
 * It has to be one number because `taper` makes only *regular* prisms, so a
 * rectangular course is a four-sided taper inside a group scaled in x, and the
 * scale is the aspect. The cost is that the hips come out shallower than the
 * long slopes; the front elevation, which is the one that names the building, is
 * right.
 */
const ASPECT = 1.15;

/**
 * The keep sits back of centre. The two small keeps take the front of the plan,
 * so the great one gives them the room by moving 5 units into it — which also
 * puts its enormous first roof where it belongs, hanging over them.
 */
const KEEP_Z = -5;

/** Top of the stone base, and the datum every storey is measured from. */
const BASE_TOP = 23;

/**
 * The fan slope, bottom to top: each course's half-width in z where it starts,
 * where it finishes, and how tall it is.
 *
 * The list is the feature. Step in by 1.6, then 0.8, then 0.4, then 0.15 and the
 * profile is concave — near vertical at the top, flaring hard at the foot. Step
 * in by 0.74 four times instead and you have a pyramid, which is what every
 * European castle plinth in this folder already is. The courses also get taller
 * as they rise (5.0, 5.5, 6.0, 6.5), so the flare tightens twice over.
 */
const FAN = [
  { bottom: 11.8, top: 10.2, height: 5.0 },
  { bottom: 10.2, top: 9.4, height: 5.5 },
  { bottom: 9.4, top: 9.0, height: 6.0 },
  { bottom: 9.0, top: 8.85, height: 6.5 },
];

/**
 * The five storeys, bottom to top. Half-widths in z; x follows by `ASPECT`.
 *
 * `wall` is the plastered box, `eave` the half-width the roof starts at — always
 * the wider number, by 4.0, 3.2, 2.5, 2.1, 1.9 in z and half again as much in x
 * — and the roof is two courses, shallow then steep, because one course is a
 * pyramid and two are a curve. The kink is the *juzhe* idea reduced to a single
 * bend, and about 28 degrees into 37 is the pair that reads as "gently curving"
 * rather than as a tent.
 *
 * `flare`, `rise` and `thick` are the corner struts, and they are small on
 * purpose: 1.3 out against 1.9 up on the great roof, tapering to 0.75 against
 * 1.05 at the top. A first pass had them at 2.6 out against 2.0 up and the model
 * grew ten dark horizontal prongs — the exposed rafter ends of a pagoda, which
 * is the one building this must not be mistaken for. Short, thin and steep reads
 * as a corner turning up; long and shallow reads as a stick.
 */
interface Storey {
  /** Half-width in z of the plastered wall, and how tall it stands. */
  wall: number;
  height: number;
  /** Half-width in z at the eave, where the roof begins. */
  eave: number;
  /** Lower roof course: height, and the half-width it narrows to. */
  lower: number;
  waist: number;
  /** Upper roof course: height, and the half-width it closes to. */
  upper: number;
  top: number;
  /** How far the corner struts run out along the hip line, and how far up. */
  flare: number;
  rise: number;
  thick: number;
}

const STOREYS: Storey[] = [
  { wall: 8.4, height: 7.8, eave: 12.4, lower: 1.1, waist: 10.4, upper: 2.4, top: 8.0, flare: 1.3, rise: 1.9, thick: 0.6 },
  { wall: 7.8, height: 5.8, eave: 11.0, lower: 1.0, waist: 9.4, upper: 2.2, top: 6.0, flare: 1.2, rise: 1.7, thick: 0.55 },
  { wall: 5.5, height: 5.4, eave: 8.0, lower: 0.8, waist: 6.8, upper: 1.9, top: 4.3, flare: 1.0, rise: 1.4, thick: 0.45 },
  { wall: 4.1, height: 4.6, eave: 6.2, lower: 0.7, waist: 5.2, upper: 1.7, top: 3.2, flare: 0.85, rise: 1.2, thick: 0.4 },
  // The crowning irimoya. Its upper course is the steepest in the model (47
  // degrees against 37 below) so the stack finishes on a point rather than
  // trailing off.
  { wall: 3.0, height: 4.5, eave: 4.9, lower: 0.8, waist: 4.0, upper: 3.1, top: 1.3, flare: 0.75, rise: 1.05, thick: 0.35 },
];

/**
 * The two subsidiary keeps, at the front corners, and the corridor running back
 * from each along the flank of the main base.
 *
 * **They are not a mirrored pair, and that is the point.** Himeji's three
 * shotenshu are three different buildings — Inui is three storeys, Higashi and
 * Nishi are two, and they stand at three different distances from the great
 * keep. Build twins and the model turns into a pagoda with two candlesticks; one
 * at 1.0 and one at 0.86, set a little further forward, and the group reads as
 * something that grew.
 *
 * The larger tops out at 27.7, which is 0.40 of the great keep and just under
 * its first eave at 30.8. That ceiling is not taste, it is clearance: anything
 * taller pushes a small roof through the great roof's overhang, and two roof
 * planes crossing at a shallow angle is the one junction the ink cannot make
 * sense of. Their stone feet do run into the main base at ground level, which is
 * exactly what the real ishigaki does where two of them meet.
 */
const SMALL = [
  { x: 16.8, z: 7.6, scale: 1, corridor: 17 },
  { x: -15.6, z: 9.4, scale: 0.86, corridor: -15.8 },
];

/** The watariyagura: how far back it runs, and how thick. */
const CORRIDOR = { z: 0.5, length: 14, half: 2.6 };

export const himejiCastle: Monument = {
  id: 'himeji-castle',
  name: 'Himeji Castle',
  iso: 'JPN',
  lat: 34.839,
  lon: 134.694,
  // No realHeight: the source list asserts none. The keep is 31.5 m, the keep on
  // its stone base 46.4 m, and the ridge stands 92 m above sea level; the number
  // people quote depends on which of those they meant.
  tier: 'tower',
  // Set by the larger small keep's skirt corner, at hypot(23.4, 14.2) = 27.4.
  // The great keep and its base reach only 22.5 on their own.
  footprint: 28,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;

    const plaster = palette.white; // every wall, every gable: the White Heron
    const tile = palette.steel; // every roof, ridge and corner strut
    const stone = palette.brown; // the fan slopes — warm, so shade keeps its hue
    const dark = palette.bark; // gate, window slots, the top storey's gallery
    const gilt = palette.gold; // two shachihoko and nothing else

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

    /**
     * One rectangular course of the keep — base, wall or roof — stated as
     * half-widths in z, with x following by `ASPECT`.
     *
     * `taper` makes regular prisms only, so the rectangle is a four-sided taper
     * inside a group scaled in x. Returns the y it finishes at, so courses chain
     * down the body of `build` in the order they are stacked.
     */
    const course = (bottom: number, top: number, height: number, y: number, color: number): number => {
      const wrap = new THREE.Group();
      wrap.add(taper(bottom, top, height, color, 4));
      wrap.scale.x = ASPECT;
      wrap.position.set(0, y, KEEP_Z);
      group.add(wrap);
      return y + height;
    };

    /**
     * The four upturned corners of an eave: a beam running out and up along the
     * hip line, which is the diagonal of the roof's own plan. It starts a little
     * inside the eave so it is bedded in the tile rather than stuck on it.
     */
    const corners = (hz: number, y: number, out: number, rise: number, thick: number): void => {
      const hx = hz * ASPECT;
      const length = Math.hypot(hx, hz);
      const ux = hx / length;
      const uz = hz / length;
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          // The inner end starts *above* the eave line, not below it. Below it —
          // which is where the obvious `y - 0.35` puts it — the strut hangs in
          // the air under the overhang instead of being buried in the tile, and
          // five roofs' worth of that reads as a pagoda's rafter ends rather
          // than as four corners turning up.
          const inset = out * 0.9;
          const from = new THREE.Vector3(
            sx * (hx - ux * inset),
            y + 0.2,
            KEEP_Z + sz * (hz - uz * inset),
          );
          const to = new THREE.Vector3(
            sx * (hx + ux * out),
            y + rise,
            KEEP_Z + sz * (hz + uz * out),
          );
          group.add(strut(from, to, thick, tile));
        }
      }
    };

    /**
     * A triangular prism laid on its side: apex up, eaves at `eaves`, ridge
     * `rise` above them, running along Z — or along X with `alongX`.
     *
     * A three-sided `column` on its side is the cheapest gable there is, 12
     * triangles, but its pitch is fixed at 60 degrees by the prism's own
     * geometry. So it is built at unit size and the *mesh* carries the scale,
     * which is legal — only the returned group must have an identity transform —
     * and lets width and rise be chosen apart. Local axes after the quarter turn
     * about X: local x stays world x, local y becomes the world run, local z
     * becomes the world height spanning -1 to +2, hence `scale.set(_, 1, _)`.
     *
     * This is both the corridor roofs and, at small sizes with its back end
     * buried in the tile, the chidori-hafu dormers.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
      alongX = false,
    ): void => {
      const prism = column(1, length, color, 3);
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
     * A kara-hafu: the *curved* gable, the one whose bargeboard swells in the
     * middle and turns back down at the ends.
     *
     * An eight-sided taper squashed flat is a hump with rounded shoulders, and a
     * hump beside four sharp triangles is the whole distinction the pair is for.
     * Closing it to 0.35 rather than to a point keeps the crown flat, which is
     * what an ogee does and a cone does not.
     */
    const karahafu = (y: number, z: number, halfWidth: number, rise: number, depth: number): void => {
      const wrap = new THREE.Group();
      wrap.add(taper(1, 0.35, 1, plaster, 8));
      wrap.scale.set(halfWidth, rise, depth);
      wrap.position.set(0, y, z);
      group.add(wrap);
    };

    /** A dark slot standing slightly proud of a wall, so it never z-fights it. */
    const slot = (x: number, y: number, z: number, width: number, height: number, facing: 'x' | 'z') => {
      put(facing === 'z' ? width : 0.5, height, facing === 'z' ? 0.5 : width, dark, x, y, z);
    };

    // -----------------------------------------------------------------------
    // The fan slope. Four courses, each stepping in less than the one below, so
    // the profile accelerates outward on the way down.
    // -----------------------------------------------------------------------
    let y = 0;
    for (const step of FAN) y = course(step.bottom, step.top, step.height, y, stone);

    // The gate through the base. It stands proud of the batter, which is what a
    // Japanese castle gate does — it is built out of the wall, not cut into it.
    put(4.6, 4.2, 0.9, dark, 0, 0, KEEP_Z + FAN[0]!.bottom - 0.15);

    // -----------------------------------------------------------------------
    // The keep: five times a white wall and a wide grey roof.
    // -----------------------------------------------------------------------
    y = BASE_TOP;
    for (const storey of STOREYS) {
      const wallBase = y;
      y = course(storey.wall, storey.wall, storey.height, y, plaster);

      const eaveY = y;
      y = course(storey.eave, storey.waist, storey.lower, y, tile);
      y = course(storey.waist, storey.top, storey.upper, y, tile);
      corners(storey.eave, eaveY, storey.flare, storey.rise, storey.thick);

      // Window slots, on the two storeys big enough to carry a row of them. The
      // first gets five across the front and one on each flank; the second gets
      // three. Above that no wall is 13 units across and a slot would be a
      // speck, so the top storey takes a single dark gallery band instead.
      if (storey === STOREYS[0]) {
        for (const x of [-7, -3.5, 0, 3.5, 7]) {
          slot(x, wallBase + 2.6, KEEP_Z + storey.wall + 0.15, 1.2, 1.7, 'z');
        }
        for (const side of [1, -1]) {
          slot(side * (storey.wall * ASPECT + 0.15), wallBase + 2.6, KEEP_Z, 1.4, 1.7, 'x');
        }
      } else if (storey === STOREYS[1]) {
        for (const x of [-4.4, 0, 4.4]) {
          slot(x, wallBase + 1.9, KEEP_Z + storey.wall + 0.15, 1.1, 1.5, 'z');
        }
      } else if (storey === STOREYS[4]) {
        put(storey.wall * ASPECT * 2 + 0.5, 1.5, storey.wall * 2 + 0.5, dark, 0, wallBase + 1.0, KEEP_Z);
      }
    }

    // The ridge, and the two shachihoko — the gilt dolphins that stand on its
    // ends, tails up, and that no other roof on the planet has.
    const ridgeTop = y + 1.3;
    put(4.4, 1.3, 2.4, tile, 0, y, KEEP_Z);
    for (const side of [1, -1]) {
      const fish = taper(0.55, 0.26, 1.8, gilt, 4);
      fish.position.set(side * 1.9, ridgeTop, KEEP_Z);
      group.add(fish);
    }

    // -----------------------------------------------------------------------
    // The gables. Everything above this line is trapezoids; these are what stop
    // the roofs being plain, and they are the only ornament in the model.
    //
    // Each runs back level into a rising slope, so the far end buries itself and
    // only the front shows: the chidori set 0.7 inside their eaves, so they read
    // as dormers standing on the tile, the kara-hafu 0.2 proud of theirs, so they
    // read as the eave line itself swelling — which is what an ogee gable is.
    // -----------------------------------------------------------------------
    // The paired chidori on the great first roof, and one on each of its flanks.
    for (const x of [-6.2, 6.2]) {
      gable(x, KEEP_Z + STOREYS[0]!.eave - 3.1, 4.8, 3.5, 30.4, 3.2, plaster);
    }
    for (const side of [1, -1]) {
      gable(side * (STOREYS[0]!.eave * ASPECT - 3.2), KEEP_Z, 5.0, 3.2, 30.4, 3.0, plaster, true);
    }
    // Then the kara-hafu on the second roof — the most photographed detail on the
    // south face — a fifth chidori on the third, and a smaller kara-hafu on the
    // fourth. Triangle, hump, triangle, hump going up: no two roofs in a row
    // carry the same gable, which is the whole reason there are two kinds.
    karahafu(39.9, KEEP_Z + STOREYS[1]!.eave + 0.2 - 2.8, 5.2, 2.4, 2.8);
    gable(0, KEEP_Z + STOREYS[2]!.eave - 2.7, 4.0, 2.7, 48.3, 2.5, plaster);
    karahafu(55.8, KEEP_Z + STOREYS[3]!.eave + 0.2 - 2.0, 3.2, 1.7, 2.0);

    // -----------------------------------------------------------------------
    // The two small keeps. The same grammar at two fifths the height: fan-slope
    // foot, white storey, skirt roof, white storey, two-course roof.
    // -----------------------------------------------------------------------
    for (const { x, z, scale: k } of SMALL) {
      const stack = taper(6.2 * k, 5.4 * k, 10.5 * k, stone, 4);
      stack.position.set(x, 0, z);
      group.add(stack);

      put(9.6 * k, 6 * k, 9.6 * k, plaster, x, 10.5 * k, z);

      const skirt = taper(6.6 * k, 4.6 * k, 3 * k, tile, 4);
      skirt.position.set(x, 16.5 * k, z);
      group.add(skirt);

      put(7.2 * k, 4.4 * k, 7.2 * k, plaster, x, 19.5 * k, z);

      const lower = taper(5.6 * k, 4.8 * k, 1 * k, tile, 4);
      lower.position.set(x, 23.9 * k, z);
      group.add(lower);

      // Closes to 1.6, not to a point: a small hipped roof with a flat crown
      // reads as a keep, and a cone reads as a turret on a German castle.
      const upper = taper(4.8 * k, 2.2 * k, 2.8 * k, tile, 4);
      upper.position.set(x, 24.9 * k, z);
      group.add(upper);
    }

    // -----------------------------------------------------------------------
    // The watariyagura corridors, running back from each small keep along the
    // flank of the main base. They are kept to the sides on purpose: anything
    // crossing the front hides the fan slope, which is a third of the read and
    // the third that is hardest to get back.
    // -----------------------------------------------------------------------
    for (const { corridor: x, scale: k } of SMALL) {
      put(CORRIDOR.half * 2, 9.5 * k, CORRIDOR.length, stone, x, 0, CORRIDOR.z);
      put(CORRIDOR.half * 2 - 0.4, 5 * k, CORRIDOR.length - 0.4, plaster, x, 9.5 * k, CORRIDOR.z);
      gable(x, CORRIDOR.z, CORRIDOR.length + 0.6, CORRIDOR.half + 0.7, 14.5 * k, 2.6 * k, tile);
    }

    return group;
  },
};
