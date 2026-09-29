import type { Monument, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Mont-Saint-Michel.
 *
 * One shape, and everything in this file is spent on it: **a cone of buildings
 * that narrows without a break from a walled base to a single gold point.**
 * There is no other silhouette like it, and it survives at any size — which is
 * lucky, because almost nothing else here does. Named parts, in the order the
 * eye finds them:
 *
 * - **The conical pyramid of buildings.** Three rings of village, each smaller
 *   and higher than the last, then the abbey's buttressed drum, then the
 *   church, then the tower, then the spire. Measured off the built model the
 *   outer radius runs 51.5, 41.3, 38.0, 33.9, 31.8, 27.3, 20.9, 14.4, 12.3,
 *   11.4, 8.9, 4.0, 1.6, 0 — falling the whole way up apart from three
 *   deliberate corbels, which are the enceinte built out from the rock's foot,
 *   the bastions' parapets and the abbey's two cornices. That is the model's
 *   one non-negotiable invariant: anything that bulges over what is under it
 *   breaks the cone, and the cone is the monument. It is worth re-measuring
 *   after any edit — the abbey's apse was moved in from x = 8.5 to x = 7.6
 *   because it overhung the stage below by a unit.
 * - **The abbey church on the summit**, with the crossing tower and the 1897
 *   spire above it. Tower and spire take 44 of the 120 units — everything from
 *   the church eaves up is 37% of the model's height — because that vertical
 *   run is what makes a hill town into *this* hill town.
 * - **Saint Michael, gilded, on the tip.** Three meshes and 48 triangles, and
 *   the only `gold` in the model, so the eye lands where the cone points.
 * - **The ramparts.** A fourteen-sided `bone` enceinte with six squat round
 *   bastions on its corners, holding the village in. They are deliberately a
 *   shade *down* from the village's `white`, the same trick Neuschwanstein
 *   plays with its terraces: the base must not compete with the mass above it.
 * - **The rock.** `darkOlive`, the only dark mass here, and it shows in three
 *   places: below the walls, on the terrace risers between the village rings,
 *   and as two crags that burst through the west flank where the roofs are left
 *   out on purpose. Without visible rock this is a wedding cake.
 *
 * ## The two questions this site asks, and the answers
 *
 * **The water is not modelled.** Three reasons, in increasing order of weight.
 * First, nothing in this world is transparent: an opaque `skyBlue` disc at y=0
 * is not water, it is a coaster, and `OutlineEffect` would ink its rim into a
 * hard black circle around the monument. Second, the ground under every
 * monument is flattened to a 90-unit pad, so the "sea" would be a plate lying
 * on grass with a visible edge, which is worse than no sea at all. Third and
 * decisive: **the water is usually not there.** The bay empties twice a day and
 * the mount is fully surrounded only around the spring tides. Modelling the sea
 * would be modelling the exception.
 *
 * What *is* always there is modelled instead: the **strand**, a shallow `sand`
 * dome 2.4 units tall and 103 across that the rock stands out of. It costs one
 * mesh and 64 triangles, it is the widest thing in the model, and it does the
 * whole job the water was wanted for — it says *this stands alone on a flat*,
 * which is the reading "island" was shorthand for. It also happens to be the
 * honest one: the tidal flats are what Mont-Saint-Michel sits in for most of
 * every day.
 *
 * **The causeway is out.** It is how everybody arrives, and it is still wrong
 * here. It is modern (1879, and replaced in 2014 by a bridge on piles), and the
 * whole point of that replacement was to *undo* it — the causeway silted the
 * bay and cost the mount its maritime character, and 260 million euros were
 * spent making it an island again. Modelling it would be modelling the mistake
 * they paid to remove. It fails mechanically too: a bar running out from one
 * side is not a shape a `footprint` circle can hold, and `validate` checks that
 * the model straddles the Y axis, so a causeway long enough to read would drag
 * the bounding box off-centre and fail.
 *
 * But the *arrival* is kept, because it is the only thing that gives a radially
 * symmetric model a front — and facing +Z is the one clause of the contract no
 * validator can check. So the six meshes a stub causeway would have cost went
 * into the **Porte de l'Avancée** instead: a barbican standing two units proud
 * of the curtain wall on +Z, a `bark` arch in it, and two small bastions
 * flanking it. That is where you come in, and now it is unmistakably where the
 * model looks.
 *
 * ## Scale, and the one axis that is squeezed
 *
 * The half-diagonal test, worked before anything was planned: the tide line is
 * about 300 m across and the tip of Saint Michael is about 170 m up, so the true
 * `halfDiagonal / height` is 150/170 = **0.88**, nowhere near the 2.0 cap. The
 * cap that actually bites is the tier's, and it bites hard.
 *
 * At `landmark`'s 120 units the scale is 0.706 units per metre, so the true
 * tide line would be 212 units across — a half-width of 106 against a footprint
 * ceiling of 55. The plan is therefore **squeezed 2.05x** (106 -> 51.5), which
 * is the same trade Stonehenge makes at 2:1 and for the same reason: a tier is
 * a budget in world units, so the axis carrying the least recognition gives way.
 * Here that is easy to call. Nobody names Mont-Saint-Michel by how broad its
 * beach is; everybody names it by how it *rises*. The squeeze steepens the cone
 * flank from about 30 degrees to about 50, and a steeper Mont-Saint-Michel is
 * still Mont-Saint-Michel where a squatter one is Assisi.
 *
 * **What the squeeze broke, and the repair.** Compressing the plan compresses
 * the circuit the houses stand on, and the houses were *not* squeezed with it —
 * a village of tangentially flattened slabs would read as a fence. So the cost
 * landed on the count: ring 1's circle is 186 units around where true scale
 * wants 381, and it carries 15 gable ends where the real Grande Rue front
 * carries something like 45. The repair is that each modelled gable stands for
 * **three** houses, 12.1 units across (17 m) rather than one at 6 m, and the
 * pitch is about 43 degrees so the sawtooth stays sharp at that width. A
 * shallow roof on a 17 m span reads as a warehouse.
 *
 * The other repair is structural. Three rings of houses modelled as free
 * standing blocks would have cost 40 meshes each; instead each ring's walls are
 * a single `ringWall` band with the gables set on top of it, which is 1 mesh
 * plus one per roof and is also *truer* — the Grande Rue's houses share walls
 * and the ring really is continuous. That saved about 45 meshes, and 45 meshes
 * is the abbey.
 *
 * ## What the thumbnail changed
 *
 * Rendered small, twice, and both times it came back a wedding cake rather than
 * a village. Two things were doing it, and neither was visible in the numbers:
 *
 * - **Identical gables.** Eighteen roofs of one height on one circle is a cog
 *   wheel. `JITTER_RISE` and `JITTER_EAVES` now vary every roof on five-long
 *   cycles that never close against 18, 14 and 12, and seven `TALL_HOUSES`
 *   stand a storey above their ring. The silhouette went from a scalloped rim
 *   to a jumble. The jitter is two arrays and costs nothing at all; the two
 *   extra proud houses cost 4 meshes and are the best 4 in the file.
 * - **A 22-unit cylinder.** The abbey's substructure was one drum of constant
 *   radius — a fifth of the model's height where the cone stopped narrowing,
 *   and it read as a tower standing on a tin. It is two stages now, 12.5 to
 *   11.2 with a cornice at the setback, and the buttresses were deepened from
 *   2.0 to 2.8 because at 260 pixels a 1-unit relief is not there at all.
 *
 * Also from the small render: the bands' `sides` came down from 20/18/16 to
 * 14/12/11. A 20-sided ring is a turned drum; a 14-sided one is a town wall
 * following a rock, and it is 48 triangles cheaper.
 *
 * ## Colour
 *
 * `white` for the village and the abbey (warm, 0xfff2e8 — `bone` would have gone
 * hueless in the deep shade between the rings), `bone` for the ramparts and
 * every cornice, `steel` for every roof, spire and cone so the forty-odd roof
 * points read as one system, `darkOlive` for the rock, `sand` for the strand,
 * `bark` for openings, `gold` for Saint Michael alone. Seven entries, and the
 * value ladder runs dark rock -> mid bone -> warm white -> gold point, bottom to
 * top, which is the cone drawn in tone as well as in outline.
 *
 * ## Traded away
 *
 * The Merveille's three storeys read as two buttressed stages rather than as
 * the Gothic hall it is; the church's flying buttresses, its choir's forest of
 * pinnacles and its west terrace are all below the size at which a mesh earns
 * its outline here. The abbey's cloister and refectory are interior. The
 * windmill on the Tour Gabriel is one conical roof. The ramparts' crenellations
 * are gone: at 0.4 units a merlon is smaller than the pen that would ink it.
 * The Grande Rue itself — the single spiral street — is a gap in the roofline
 * and nothing more, because a street modelled at this scale is a scratch.
 *
 * Spent, in the end: **123 of 130 meshes and 2,796 of 3,600 triangles.** Meshes
 * were the binding budget the whole way, which is why the village is bands and
 * roofs rather than houses, and why the seven left over are left over.
 */

// ---------------------------------------------------------------------------
// Elevation. Every number in `build` is measured off this ladder, and the ladder
// is continuous: each stage begins where the one below it ends, so the cone
// cannot develop a step outward by arithmetic slip — only where one is meant.
// ---------------------------------------------------------------------------

/** Top of the tidal strand — the datum the rock stands out of. */
const STRAND_TOP = 2.4;
/** The rampart curtain: base, top of the wall, top of its coping. */
const WALL_FOOT = 8.0;
const WALL_TOP = 15.4;
const COPING_TOP = 16.4;

/** The three village rings: base, eaves, and the rise of their gables. */
const RING = [
  { base: 15.4, eaves: 22.4, rise: 5.6 }, // roofs to 28.0
  { base: 24.2, eaves: 30.2, rise: 4.8 }, // roofs to 35.0
  { base: 31.5, eaves: 36.5, rise: 4.0 }, // roofs to 40.5
] as const;

/** The abbey's substructure drum, and the church floor on top of it. */
const ABBEY_FOOT = 40.0;
const ABBEY_TOP = 62.0;
const CHURCH_EAVES = 76.0;
const CHURCH_RIDGE = 86.0;
const SHAFT_TOP = 94.0;
const PARAPET_TOP = 98.0;
const SPIRE_TOP = 116.0;
/** The tier ceiling, reached by the tip of Saint Michael's sword and nothing else. */
const TOP = 120.0;

/**
 * The rock, as a stack of tapers.
 *
 * `radius` is the half-width across the flats at the *top* of each section, so
 * each section's bottom is the one below it and the profile cannot develop a
 * ledge by arithmetic slip. Sides drop from 14 to 10 as it narrows: at radius 14
 * a twelve-gon is spending triangles on facets under a unit wide.
 */
const ROCK = [
  { top: WALL_FOOT, radius: 35.0, sides: 14 },
  { top: RING[0].base, radius: 31.5, sides: 12 },
  { top: RING[1].base, radius: 24.5, sides: 12 },
  { top: RING[2].base, radius: 18.5, sides: 12 },
  { top: ABBEY_FOOT, radius: 14.0, sides: 10 },
] as const;

/** Half-width across the flats at the very foot of the rock, where it meets the strand. */
const ROCK_FOOT = 45.0;

/**
 * The village bands. `outer` and `inner` are `ringWall` radii — note these are
 * circumradii where every `column`/`taper` radius in this file is an apothem,
 * which is a distinction worth 2.6% at 14 sides and 4.2% at 11 and is the whole
 * reason the rock sits inside its bands instead of poking through them.
 *
 * `gables` is how many roofs go round; `skip` leaves them out, and the three
 * gaps are all on the same west flank so the two crags come through a single
 * unbroken column of bare rock rather than three unrelated holes.
 */
interface Band {
  /** `ringWall` radii, so circumradii. */
  inner: number;
  outer: number;
  sides: number;
  /** Roofs around the ring, and the ones left out. */
  gables: number;
  skip: number[];
  /** Where a gable's ridge is centred, how far it runs radially, and its half-width. */
  radius: number;
  depth: number;
  half: number;
}

const BANDS: Band[] = [
  { inner: 26.0, outer: 33.0, sides: 14, gables: 18, skip: [14, 15, 16], radius: 29.6, depth: 8.6, half: 6.05 },
  { inner: 20.0, outer: 26.4, sides: 12, gables: 14, skip: [11, 12], radius: 23.3, depth: 8.0, half: 6.2 },
  { inner: 15.0, outer: 20.0, sides: 11, gables: 12, skip: [10], radius: 17.6, depth: 6.6, half: 5.55 },
];

/**
 * Houses that break their ring's roofline.
 *
 * Three rings of even gables step down like a ziggurat however hard the roofs
 * are jittered, because every roof still starts from one eaves line. These
 * seven blocks stand a whole storey taller than the band they sit on, at angles
 * that share no common factor with the gable counts, and they are the
 * difference between a crowd and a colonnade. Angles in degrees about the
 * mount, measured from the gate.
 */
const TALL_HOUSES = [
  { ring: 0, angle: 24, width: 7.6, wall: 11.4, rise: 4.6 },
  { ring: 0, angle: 133, width: 6.8, wall: 10.0, rise: 4.2 },
  { ring: 1, angle: 62, width: 6.4, wall: 9.4, rise: 3.8 },
  { ring: 1, angle: 205, width: 5.8, wall: 8.4, rise: 3.6 },
  { ring: 2, angle: 158, width: 5.2, wall: 7.2, rise: 3.2 },
  { ring: 0, angle: 246, width: 6.2, wall: 9.6, rise: 4.0 },
  { ring: 1, angle: 331, width: 6.0, wall: 8.8, rise: 3.6 },
] as const;

/** Per-roof variation, applied by index. See the note where they are used. */
const JITTER_RISE = [1.0, 0.84, 1.14, 0.92, 1.06];
const JITTER_EAVES = [0, -0.55, 0.35, -0.25, 0.5];

const RAD = Math.PI / 180;

export const montSaintMichel: Monument = {
  id: 'mont-saint-michel',
  name: 'Mont-Saint-Michel',
  iso: 'FRA',
  lat: 48.636,
  lon: -1.511,
  // No `realHeight`: the source list carries none, and there is no single
  // number to carry. The rock is 92 m, the church floor 80, the spire tip 157
  // and Saint Michael's sword 170, and the thing people mean by "the height of
  // Mont-Saint-Michel" changes with which of those they were told.
  tier: 'landmark',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, column, taper, ringWall, around } = ctx;

    const stone = palette.white; // village and abbey walls
    const wall = palette.bone; // ramparts, copings, cornices
    const slate = palette.steel; // every roof, cone and the spire
    const rock = palette.darkOlive; // the mount itself
    const strand = palette.sand; // the tidal flat
    const dark = palette.bark; // arches and windows
    const gilt = palette.gold; // Saint Michael, and nothing else

    const group = new THREE.Group();

    const put = <T extends Object3D>(child: T, x: number, y: number, z: number): T => {
      child.position.set(x, y, z);
      group.add(child);
      return child;
    };

    /**
     * A gable roof, ridge along Z, eaves at `eaves`, apex `rise` above them.
     *
     * A three-sided `column` on its side is the cheapest gable there is (12
     * triangles) but its pitch is fixed at 60 degrees, so the prism is built at
     * unit size and the *mesh* carries the scale — legal, since only the
     * returned group must have an identity transform, and it lets `half` and
     * `rise` be chosen independently. After the quarter turn about X, local y is
     * world z and local -z is world y, which is what the odd `scale.set` is.
     */
    const gable = (cx: number, cz: number, length: number, half: number, eaves: number, rise: number) => {
      const prism = column(1, length, slate, 3);
      prism.scale.set(half / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);
      const pivot = new THREE.Group();
      pivot.add(prism);
      pivot.position.set(cx, eaves, cz);
      return pivot;
    };

    /** Puts a child at `radius` out along the +Z axis and `base` up, then swings it to `angle`. */
    const spoke = (angle: number, radius: number, base: number, child: Object3D): void => {
      const pivot = new THREE.Group();
      pivot.rotation.y = angle;
      child.position.set(0, base, radius);
      pivot.add(child);
      group.add(pivot);
    };

    /** A dark strip standing slightly proud of a wall, so the ink outlines it. */
    const opening = (x: number, y: number, z: number, w: number, h: number): void => {
      put(box(w, h, 0.5, dark), x, y, z);
    };

    // -----------------------------------------------------------------------
    // The strand. A shallow sand dome, not a disc: 50.5 across the flats at the
    // bottom and 45.5 at the top over 2.4 of height, which reads as a bank the
    // rock rises out of rather than as a base plate the model is mounted on.
    // Its corners at 51.5 units are what set the footprint.
    // -----------------------------------------------------------------------
    put(taper(50.5, 45.5, STRAND_TOP, strand, 16), 0, 0, 0);

    // -----------------------------------------------------------------------
    // The rock. Five tapers, each starting where the last stopped.
    // -----------------------------------------------------------------------
    let foot = STRAND_TOP;
    let below = ROCK_FOOT;
    for (const section of ROCK) {
      put(taper(below, section.radius, section.top - foot, rock, section.sides), 0, foot, 0);
      foot = section.top;
      below = section.radius;
    }

    // -----------------------------------------------------------------------
    // The ramparts. Fourteen sides, so the six bastions land on alternate
    // corners of the enceinte, which is where a bastion belongs — the curtain
    // between two towers is a straight run of wall, and a polygon is what the
    // real circuit is. The coping is a second, wider ring: 0.7 proud outside and
    // 0.5 in, one whole extra lathe spent on the line it draws under the village.
    // -----------------------------------------------------------------------
    put(ringWall(34.5, 38.0, WALL_TOP - WALL_FOOT, wall, 14), 0, WALL_FOOT, 0);
    put(ringWall(34.0, 38.7, COPING_TOP - WALL_TOP, wall, 14), 0, WALL_TOP, 0);

    // Six squat bastions on the corners; index 0 is the gate and is left out.
    // Every one of them is wider at the top than the bottom — a battered drum
    // under a corbelled parapet — because "round and squat" is the whole read
    // and a straight cylinder at this size reads as a bollard.
    group.add(
      around(7, (index) => {
        if (index === 0) return null;
        const bastion = new THREE.Group();
        const drum = taper(2.4, 2.9, 9.5, wall, 8);
        drum.position.set(0, WALL_FOOT, 38.0);
        bastion.add(drum);
        const cap = column(3.2, 1.1, wall, 8);
        cap.position.set(0, WALL_FOOT + 9.5, 38.0);
        bastion.add(cap);
        // The Tour Gabriel, alone in carrying a roof — it holds the mill.
        if (index === 3) {
          const cone = taper(3.0, 0, 4.2, slate, 8);
          cone.position.set(0, WALL_FOOT + 10.6, 38.0);
          bastion.add(cone);
        }
        return bastion;
      }),
    );

    // -----------------------------------------------------------------------
    // Porte de l'Avancee. The arrival, and the model's front. See the header:
    // this is what the causeway's budget was spent on instead.
    // -----------------------------------------------------------------------
    put(box(9.0, 9.5, 4.0, wall), 0, WALL_FOOT, 38.0);
    // Its foot goes `PROUD` under the gate's, whose underside it would share.
    opening(0, WALL_FOOT - PROUD, 40.1, 3.2, 5.5 + PROUD);
    for (const x of [-5.4, 5.4]) {
      put(column(1.9, 11.0, wall, 8), x, WALL_FOOT, 38.6);
      put(column(2.2, 0.9, wall, 8), x, WALL_FOOT + 11.0, 38.6);
    }

    // -----------------------------------------------------------------------
    // The village: three bands of wall with a sawtooth of gables on each.
    // -----------------------------------------------------------------------
    BANDS.forEach((band, index) => {
      const level = RING[index]!;
      // Sunk `PROUD` into the rock: at the ring's own base its underside lay
      // in the plane of the rock section's cap, two colours in one plane.
      put(
        ringWall(band.inner, band.outer, level.eaves - level.base + PROUD, stone, band.sides),
        0,
        level.base - PROUD,
        0,
      );
      group.add(
        around(band.gables, (i) => {
          if (band.skip.includes(i)) return null;
          // No two neighbours the same. A ring of identical gables is a cog
          // wheel, and a cog wheel is exactly what turns a hill town into a
          // wedding cake — it was the single worst thing about the first pass.
          // Five-long cycles against 18, 14 and 12 roofs never close, so the
          // pattern does not repeat even at the seam.
          return gable(
            0,
            band.radius,
            band.depth,
            band.half,
            level.eaves + JITTER_EAVES[i % 5]!,
            level.rise * JITTER_RISE[i % 5]!,
          );
        }),
      );
    });

    for (const house of TALL_HOUSES) {
      const level = RING[house.ring]!;
      const band = BANDS[house.ring]!;
      const block = new THREE.Group();
      // The body goes `PROUD` below the ring's base, so its underside is not in
      // the plane of the coping's or the rock's, which flickers; its top stays.
      const body = box(house.width, house.wall + PROUD, band.depth * 0.85, stone);
      body.position.y = -PROUD;
      block.add(body);
      block.add(gable(0, 0, band.depth * 0.85 + 0.6, house.width / 2 + 0.3, house.wall, house.rise));
      // Body and roof are both built at the origin, so they travel together when
      // `spoke` swings the block out to its ring; only the base height is left,
      // and it is the band's own.
      spoke(house.angle * RAD, band.radius, level.base, block);
    }

    // A dark shutter on the band facing the gate — the one place in the village
    // where a single opening is big enough on screen to be worth a mesh.
    //
    // The band is a `ringWall`, so its lathe puts a vertex exactly on the +Z
    // axis at `outer` — 33.0, not the 33.7 this once stood at. At 33.7 the
    // shutter's back face was 0.45 clear of the wall and the strip hung in the
    // air, touching nothing. 33.05 leaves it 0.3 proud, which is the same
    // clearance every other opening in this file uses.
    opening(0, 17.4, 33.05, 1.8, 3.2);

    // -----------------------------------------------------------------------
    // Two crags on the west flank, at 300 and 288 degrees, where all three rings
    // drop their roofs. The lower one starts inside the first band and stands 2
    // units proud of it, so the rock is seen coming *through* the village rather
    // than merely beside it; the upper one clears the third band and finishes
    // just above the abbey's foot, which is where the real summit crag is.
    // Between them they are the only place a viewer sees what the whole village
    // is built on, and they are why three rings' worth of gables are skipped.
    // -----------------------------------------------------------------------
    // The lower crag's foot is `PROUD` under the ring's base, out of the plane
    // of the coping's underside; its top is where it was.
    spoke(300 * RAD, 29.0, RING[0].base - PROUD, taper(6.0, 2.8, 17.4 + PROUD, rock, 6));
    spoke(288 * RAD, 19.0, 30.0, taper(4.2, 1.8, 12.6, rock, 6));

    // -----------------------------------------------------------------------
    // The abbey substructure: the Merveille and the great retaining walls. Two
    // stages with a cornice at the setback, because a single 22-unit drum is a
    // fifth of the model's height over which the cone stops narrowing, and that
    // is what a wedding cake is. Ten buttresses standing 1.8 proud break the
    // largest pale surface left in the model, standing 1.9 units off its face.
    // -----------------------------------------------------------------------
    const ABBEY_SETBACK = 54.0;
    put(column(12.5, ABBEY_SETBACK - ABBEY_FOOT, stone, 10), 0, ABBEY_FOOT, 0);
    group.add(
      around(10, () => {
        const buttress = box(2.2, ABBEY_SETBACK - ABBEY_FOOT - 1.2, 2.8, stone);
        buttress.position.set(0, ABBEY_FOOT, 13.0);
        return buttress;
      }),
    );
    put(column(12.9, 1.2, wall, 10), 0, ABBEY_SETBACK - 1.2, 0);
    put(column(11.2, ABBEY_TOP - ABBEY_SETBACK - 1.2, stone, 10), 0, ABBEY_SETBACK, 0);
    put(column(11.7, 1.2, wall, 10), 0, ABBEY_TOP - 1.2, 0);
    for (const x of [-2.4, 2.4]) opening(x, 44.0, 12.55, 1.5, 7.5);
    for (const x of [-6.6, 6.6]) opening(x, 44.0, 11.6, 1.3, 6.5);

    // -----------------------------------------------------------------------
    // The abbey church. Long axis along X, so the nave is seen broadside from
    // the front with the tower rising out of its middle: the one arrangement
    // that says "church" at 60 pixels. Apse east, two stair turrets west.
    // -----------------------------------------------------------------------
    put(box(17.0, CHURCH_EAVES - ABBEY_TOP, 11.0, stone), 0, ABBEY_TOP, 0);
    const nave = gable(0, 0, 17.6, 5.8, CHURCH_EAVES, CHURCH_RIDGE - CHURCH_EAVES);
    nave.rotation.y = Math.PI / 2;
    group.add(nave);
    opening(0, 64.0, 5.55, 2.2, 6.0);

    put(column(3.4, 11.0, stone, 8), 7.6, ABBEY_TOP, 0);
    put(taper(3.7, 0, 5.0, slate, 8), 7.6, ABBEY_TOP + 11.0, 0);
    for (const z of [-4.0, 4.0]) {
      put(column(1.4, 18.0, stone, 8), -8.0, ABBEY_TOP, z);
      put(taper(1.7, 0, 5.0, slate, 8), -8.0, ABBEY_TOP + 18.0, z);
    }

    // -----------------------------------------------------------------------
    // Crossing tower and spire. The corbel ring is the one place above the
    // church where the plan of a thing changes on the way up, and it is where
    // the eye stops climbing the tower and starts climbing the spire.
    // -----------------------------------------------------------------------
    put(box(5.6, SHAFT_TOP - ABBEY_TOP, 5.6, stone), 0, ABBEY_TOP, 0);
    // One string course and two windows break the shaft — but only the part of
    // it you can see, which is not the part it spans. The shaft runs from 62,
    // and the nave roof around it is 5.8 half-deep at its eaves and closes to a
    // ridge at 86, so it clears the shaft's own 2.8 face only above 81.2.
    // Nineteen of those thirty-two units are inside the church.
    //
    // All three of these sat in that buried stretch: the string course at 78
    // and the lower window at 68.5 drew nothing at all, and the upper window at
    // 82.5 had its foot in the roof. They are spaced up the 12.8 units that are
    // actually on screen now, and the course marks where the tower comes out of
    // the roof, which is where a string course belongs anyway.
    put(column(3.1, 0.9, wall, 8), 0, 81.2, 0);
    opening(0, 84.9, 2.85, 1.2, 4.6);
    opening(0, 90.6, 2.85, 1.2, 5.0);
    put(column(3.6, 1.5, wall, 8), 0, SHAFT_TOP, 0);
    put(column(3.4, PARAPET_TOP - SHAFT_TOP - 1.5, stone, 8), 0, SHAFT_TOP + 1.5, 0);
    put(column(2.9, 1.2, wall, 8), 0, PARAPET_TOP, 0);
    put(taper(2.5, 0, SPIRE_TOP - PARAPET_TOP - 1.2, slate, 8), 0, PARAPET_TOP + 1.2, 0);

    // -----------------------------------------------------------------------
    // Saint Michael. Four units of gold on a hundred and sixteen of stone, and
    // the reason the whole cone points: robe, spread wings, raised sword.
    // -----------------------------------------------------------------------
    put(taper(0.9, 0.35, 2.6, gilt, 6), 0, SPIRE_TOP, 0);
    put(box(3.2, 0.55, 0.6, gilt), 0, SPIRE_TOP + 1.3, 0);
    put(box(0.3, TOP - (SPIRE_TOP + 2.6), 0.3, gilt), 0, SPIRE_TOP + 2.6, 0);

    return group;
  },
};
