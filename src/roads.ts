import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundColorAt, groundRadius } from './globe.ts';
import { createToonRamp } from './theme.ts';
import { isShown, prominenceVersion, radiusFor } from './places.ts';
import type { Place } from './places.ts';
import { decodeRoads, inflate } from './pack.ts';
import {
  createViewCone,
  detailArea,
  detailBuild,
  detailReach,
  detailVersion,
  fogFar,
  horizonAt,
  slantRange,
} from './view.ts';
import { MAX_SLOPE, gradeAt } from './terrain.ts';
import type { Slope } from './terrain.ts';
import { seedOf } from './scenery/random.ts';
import { regionFor } from './scenery/regions.ts';
import { GROUND_LIFT, groundStyleFor, trodden } from './scenery/ground.ts';
import { assignGates, gateLevel, gatesOf, offsetDirection, streetBand, townFrame, townGrid } from './scenery/grid.ts';
import type { Gate, TownGrid } from './scenery/grid.ts';

/**
 * The road network: which settlements are joined, and what that looks like.
 *
 * The settlements already had roads and they did not go anywhere. Each town
 * throws two or three tracks at its nearest neighbours and stops 45 units out,
 * which reads correctly from the ground — a lane leaving the village — and from
 * the air reads as a hedgehog. What was missing is the half that only exists
 * between towns: **a road that arrives.**
 *
 * The split between this file and `scripts/build-roads.ts` is the same one
 * `monuments.json` makes, for the same reasons:
 *
 * - **The graph is baked.** Which pairs are joined is a pure function of
 *   `places.bin` and the outlines, it costs a few hundred thousand
 *   point-in-polygon queries to work out, and the answer is the same on every
 *   load. That belongs in a script and a data file, checked by `pnpm check`,
 *   not in a loading screen.
 * - **The geometry is not.** 9,000 roads at their full detail is more triangles
 *   than the land mesh, so what gets built is what the camera can see, on the
 *   same terms as the settlements and the vegetation.
 *
 * And two things live in *both*, which is why they are here rather than in the
 * script: `courseOf` / `coursePoint` is the shape of a road, from one town's
 * gate to the other's, and `crownLift` is how high it rides along that shape,
 * climbing to each gate's own paving. The bake walks the first to decide
 * whether the road goes in the sea, up a mountain or through a town, `pnpm
 * check` walks both, and this file, `life.ts`, `vegetation.ts` and the herds
 * walk them to lay the ribbon, drive on it, and keep off it. A second copy of
 * either is a road that was tested dry and drawn wet, or a carriageway drawn at
 * one height and driven at another.
 *
 * **What replaced `roadClip` and `roadSpan`** (2026-09-13), for anyone reading
 * an older note: a road used to run from one place's *centre* to the other's
 * and have its two ends cut off at `radiusFor + TOWN_STANDOFF`, leaving the
 * last forty units to a narrow track each town drew for itself. The user's
 * verdict on that join was *un caminito que renderiza muy mal*, and what they
 * asked for was one line: *que la ciudad esté sobre una base cuadrada y los
 * caminos se conecten ahí*. So a town is a north-up square now
 * (`scenery/grid.ts`) with a gate wherever a street meets its edge, and a road
 * *starts and stops at a gate*: nothing is clipped, because nothing is drawn
 * inside a square in the first place. The one-definition pair is `courseOf`
 * (where the ribbon runs) and `rampOf` + `crownLift` (how high), and the
 * invariants they carry are written beside them.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The shape of a road
// ---------------------------------------------------------------------------

/** One edge of the network, as `roads.bin` stores it; see `src/pack.ts`. */
export interface Road {
  /** Index into `places`, and the reason `pnpm check` asserts the two agree. */
  a: number;
  b: number;
  /** 0 lane, 1 road, 2 trunk. See `ROAD_CLASSES`. */
  cls: number;
  /**
   * Lateral bow, as a fraction of the road's own length.
   *
   * **A network of exact great circles reads as a diagram, not a map**, and the
   * giveaway is not any single road — it is that every junction is a perfect
   * pencil of straight lines. One seeded half-sine is enough to break that, and
   * it has to be *baked* rather than added at draw time: the bow is what decides
   * whether the road crosses a bay, so the path that was tested for water has to
   * be the path that gets drawn.
   *
   * The bow is a `sin^2` bump over the middle of the road and not the old
   * half-sine, because a half-sine has a slope at its ends and a road has to
   * leave its gate square to the kerb; see `courseOf`.
   */
  bend: number;
  /**
   * Which of town `a`'s gates the road leaves by, and which of `b`'s it comes
   * in by: indices into `gatesOf(townGrid(pop))` for that town.
   *
   * **Baked, for the bow's reason.** A gate is chosen by `assignGates` over the
   * town's own roads, and then, where the road through that gate would be wet,
   * steep or through a town, the bake tries the next gate before it gives up —
   * so which gate a road uses is decided *with* the ground tests, and the gate
   * the curve was tested through has to be the gate it is drawn through. A
   * change to `gatesOf` or to `townGrid` is therefore a re-bake, and `pnpm
   * check` asserts every stored gate still exists and can still be cut.
   */
  gateA: number;
  gateB: number;
  /**
   * How far back the road is drawn, in depth layers: 0 in front, and one
   * behind the deepest road it overlaps that outranks it. See `layersOf`, which
   * the bake writes and `pnpm check` recomputes from the file.
   */
  layer: number;
}

export interface RoadClass {
  name: string;
  /** Carriageway width in world units. The avatar is 6.8. */
  width: number;
  /**
   * How far away it is still worth drawing, in world units.
   *
   * **This is the level-of-detail scheme and it is a class table rather than a
   * pixel test, which is the one place roads differ from everything else the
   * streamers carry.** A settlement is a blob and the honest question is how
   * many pixels across it is; a road is a *line*, and a line stays legible long
   * after its width stops resolving — the coastline is one pixel wide from
   * orbit and it is the most readable thing on the planet. So a road is
   * admitted on what it *is* rather than on how wide it looks, and zooming out
   * drops the lanes first and leaves the trunks, which is what a map does.
   *
   * **The lane's reach came down from 3,200 to 1,300 and the road's from 11,000
   * to 5,000, and the reason is that the argument above has a limit.** One line
   * a pixel wide is the coastline; forty thousand of them is a texture, and the
   * network was forty thousand when it was baked over the whole gazetteer — at
   * 380 units over the Costa del Sol every field between villages came out
   * bounded by carriageway on three sides, and it read as a road atlas printed
   * on the land.
   *
   * The numbers are a width test worked out once here rather than measured per
   * frame: at `937 * width / distance`, a lane is **5.9 px at 1,300** and a road
   * 2.4 at 5,000, which is the point at which a mark stops being a road and
   * starts being grey. What the table is compared against is a road's own
   * distance **from the eye** — see `classReaches` and `priceRoads`, and the
   * trap that says what comparing a tile's distance from the *player* cost. The
   * trunk keeps the horizon because there are only 275 of them: 275 lines is a
   * map and 7,456 is a wash, and that difference is density and not legibility.
   *
   * **All three classes are drawn, and all three are asphalt** (2026-09-08). A
   * `lane` used to be a dirt track and the user's word for it was *caminos*;
   * what they asked for was one material and not a smaller network, so a lane is
   * a narrow made road between two small towns and the class is nothing but this
   * lever. **It is the lever to reach for if the world reads as busy, and the
   * row to move is the `road` and not the `lane`** — which is not what it looks
   * like, so it was measured. Same standpoints, headless at detail 0.5, over the
   * 17,238-road network:
   *
   * ```
   *                        shipped   lane 1,300 -> 650   road 5,000 -> 3,000
   *   Alps, on foot            337                 337                   252
   *   Ulm, on foot             357                 356                   269
   *   Ulm, 700 up              580                 580                   222
   *   Ulm, 1,200 up            491                 491                    81
   * ```
   *
   * The lane's reach does nothing because at the shipped detail it is already
   * 650 units from the **eye**, which a camera 700 units up has left behind
   * before it sees any ground at all: above a few hundred units of altitude the
   * lanes are gone whatever this number says. The `road` class is what is on the
   * screen from the air, and 5,000 -> 3,000 is a sixth of the marks at 1,200 up.
   * Neither touches a single connection, which is the difference between this
   * lever and the thinning that was tried instead and left Madrid with no road.
   */
  reach: number;
}

/**
 * **The widths are 1.5 times what they were, and the multiplier is the vehicles'
 * and not the roads'.** `src/traffic/` is placed at twice its authored scale —
 * see `PLACED_SECTION` — because a car at scenery scale has its roof at the
 * avatar's knee. That makes a hatchback 4.44 wide where it was 2.22, and 5.5
 * was a lane two of those could not share.
 *
 * 1.5 and not 2, deliberately: two placed hatchbacks are 8.88 across against a
 * 8.25-unit lane, so on a lane they give way and on a `road` (12.75) they pass,
 * which is the difference those two classes exist to draw. A placed city bus is
 * 6.60 wide and fits a lane alone; two of them pass on a trunk.
 *
 * And a trunk at 18 units is still 2.6 avatars across, where a real motorway is
 * sixteen people wide. Nothing here is close to life-sized; the roads are only
 * as wide as the things on them need.
 */
export const ROAD_CLASSES: readonly RoadClass[] = [
  { name: 'lane', width: 8.25, reach: 1300 },
  { name: 'road', width: 12.75, reach: 5000 },
  { name: 'trunk', width: 18, reach: 34000 },
];

/**
 * How much narrower a road is drawn in each distance band.
 *
 * **The reach is a cull and this is what keeps it from being a line the world
 * ends at.** A class that simply stops at its reach draws a ring of road edges
 * round the player; tapering the width over the bands means the network thins
 * before it goes, which is what a road at the limit of sight actually does.
 *
 * It is per *band* rather than continuous because a tile is only rebuilt when
 * its band changes — that is the streamer's existing contract — so a continuous
 * taper would be a lie the geometry could not tell.
 */
const BAND_WIDTH = [1, 0.8, 0.62];

/**
 * Which class a road between two places is.
 *
 * **`radiusFor` and nothing else**, because a settlement already has exactly one
 * definition of how big it is and inventing a second measure of importance is
 * how the HUD ends up calling a place a city while the map draws it as a hamlet.
 * A road is only as important as its *smaller* end — a lane joining a village to
 * a capital is a lane, which is why `min` and not a mean.
 *
 * The thresholds are read off the distribution `places.bin` actually has, and
 * **they had to be re-read when the law under them changed shape.** They were
 * 26 and 48 against a law whose radii ran 10 to 100 with a median of 25; the
 * law is `0.465 * pop^0.36` now, running 12 to 150 with a median of 15, and
 * leaving the numbers alone would have demoted a whole class of road for a
 * reason nobody decided. They are re-derived at the *population* the old pair
 * picked out — a road wants both ends over 22,300 people, a trunk over
 * 587,000 — so it is the same set of roads seen through the new law, and not a
 * new judgement smuggled in with a re-bake:
 *
 * ```
 *            pop        old radius   new radius
 *   road      22,300         26.0         17.1
 *   trunk    587,000         48.0         55.5
 * ```
 *
 * **The pairs it is asked about are adjacent again, which is what the
 * derivation above assumes.** For one round it also priced the two towns a
 * *route* ran between, because the network was baked over the whole gazetteer
 * and a city's own edges all ran to unbuilt suburbs. Repricing every edge that
 * way was measured and rejected: in a dense region the nearest built place is
 * over 22,300 people in every direction, so `classOf` answers `road` for the
 * whole lattice without being wrong — the thresholds were read off a
 * distribution of *adjacent* pairs, and re-pairing is a different distribution
 * rather than a different rule. The graph is over the built towns now
 * (`builtGraph`), so every pair this sees is one road's own two ends. What it
 * produces over the shipped bake (2026-09-08): **lane 7,456 · road 9,507 ·
 * trunk 275**.
 */
export function classOf(popA: number, popB: number): number {
  const importance = Math.min(radiusFor(popA), radiusFor(popB));
  if (importance >= 55.5) return 2;
  if (importance >= 17.1) return 1;
  return 0;
}

/** The pole of the great circle through `a` and `b`. Degenerate pairs get any axis. */
function roadPole(a: THREE.Vector3, b: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  target.crossVectors(a, b);
  if (target.lengthSq() < 1e-12) target.set(0, 1, 0).cross(a);
  if (target.lengthSq() < 1e-12) target.set(1, 0, 0);
  return target.normalize();
}

// ---------------------------------------------------------------------------
// Where a road arrives: a town's square and its gates
// ---------------------------------------------------------------------------

/**
 * One end of a road: the town's frame, its square, and the gates in it.
 *
 * `scenery/grid.ts` is the one definition of all three, and `settlements.ts`
 * raises the town from the same calls about the same place — `townFrame` about
 * the place's own direction, `townGrid` of its population — so the gate a road
 * arrives at and the paving the town cuts there are one point and not two that
 * happen to agree. Cached per place, because a town is asked once per road end
 * and a city stands at the end of eight roads.
 */
export interface Town {
  up: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  grid: TownGrid;
  gates: readonly Gate[];
}

const towns = new WeakMap<Place, Town>();
const gateLists = new Map<number, Gate[]>();

export function townOf(place: Place): Town {
  const known = towns.get(place);
  if (known !== undefined) return known;
  const up = placeDirection(place, new THREE.Vector3());
  const across = new THREE.Vector3();
  const north = new THREE.Vector3();
  townFrame(up, across, north);
  const grid = townGrid(place.pop);
  let gates = gateLists.get(place.pop);
  if (gates === undefined) {
    gates = gatesOf(grid);
    gateLists.set(place.pop, gates);
  }
  const town: Town = { up, across, north, grid, gates };
  towns.set(place, town);
  return town;
}

/**
 * Where a unit direction lands in a town's frame: `offsetDirection` run
 * backwards, exactly, for any point on the town's own hemisphere.
 */
export function townOffset(
  town: Town,
  direction: THREE.Vector3,
  out: { x: number; z: number },
): { x: number; z: number } {
  const up = direction.dot(town.up);
  out.x = (PLANET_RADIUS * direction.dot(town.across)) / up;
  out.z = (PLANET_RADIUS * direction.dot(town.north)) / up;
  return out;
}

const gateProbe = new THREE.Vector3();

/**
 * The level a town cuts one of its gates to, above sea level, or null where it
 * cannot cut one.
 *
 * `gateLevel`, asked the question `settlements.ts` asks about the same cells:
 * the ground through `offsetDirection` in the town's own frame, and a base of
 * the place's own elevation floored at the sea. The paving a road has to climb
 * to is this plus `GROUND_LIFT`. It is a handful of `elevationAt` calls, so
 * every caller caches it per road end rather than per frame.
 */
export function gateHeight(place: Place, gate: number, world: World): number | null {
  const town = townOf(place);
  const which = town.gates[gate];
  if (which === undefined) return null;
  const base = Math.max(0, world.elevationAt(town.up));
  return gateLevel(
    town.grid,
    which,
    (x, z) => world.elevationAt(offsetDirection(town.up, town.across, town.north, x, z, gateProbe)),
    base,
  );
}

/**
 * Whether a road may come in by a gate at all.
 *
 * Two things, both about the gate and neither about the road: the town can cut
 * its cells (`gateHeight`, which refuses a cell whose centre is in the sea and
 * a gate cell whose corners span more than `GATE_CUT`), and the straight
 * approach out of it is dry for
 * its whole `APPROACH`, walked at the water test's own stride. A gate that fails
 * either would give every road through it an end against a wall or a first
 * stretch in the sea, so it is not offered to `assignGates` at all and the road
 * goes to the next gate round — which is what "prefer the gates whose approach
 * is dry" means here. The rest of the road is the bake's to test.
 *
 * **The slope under the approach was a third test and it was measured out.**
 * Over the 9,749 built towns (2026-09-13, under the corner-in-the-sea gate rule
 * the centre rule replaced) `gradeAt` at the approach's middle
 * shut 903 gates, a median grade of 0.67 against `MAX_SLOPE`'s 0.58, and left
 * 117 towns with no open gate that the two rules above would have left one: a
 * town on a hillside with every approach steep. The road's own slope walk
 * already asks that question of the whole course from its first probe out, so
 * a steep approach now refuses the roads that would climb it rather than the
 * gate, and a road that bows off the face still gets in.
 */
export function gateOpen(place: Place, gate: number, world: World): boolean {
  if (gateHeight(place, gate, world) === null) return false;
  const town = townOf(place);
  const which = town.gates[gate]!;
  for (let s = 0; s <= APPROACH + 1e-9; s += WATER_PROBE_STEP) {
    offsetDirection(town.up, town.across, town.north, which.x + which.outX * s, which.z + which.outZ * s, gateProbe);
    if (world.countryAtPoint(gateProbe) === 0) return false;
  }
  return true;
}

/**
 * Which gate each of a town's roads comes in by, before the ground has had its
 * say: `assignGates` over the bearings to the towns at their far ends, among
 * the gates `open` admits. Returns an index into the town's gates per road, or
 * -1 where the town has no open gate at all.
 *
 * The bearing is the far town's own direction projected onto the town's frame,
 * not the road's heading as it leaves: the heading is a function of the gate,
 * so it cannot be what chooses one.
 */
export function assignTownGates(
  place: Place,
  others: readonly Place[],
  open: (gate: number) => boolean,
): number[] {
  const town = townOf(place);
  const leaving = others.map((other) => {
    placeDirection(other, gateProbe);
    return [gateProbe.dot(town.across), gateProbe.dot(town.north)] as const;
  });
  return assignGates(town.gates, leaving, (_, index) => open(index));
}

// ---------------------------------------------------------------------------
// The course a road takes, gate to gate
// ---------------------------------------------------------------------------

/**
 * How far a road runs straight out of a gate, square to the kerb, before it
 * may bend, in world units.
 *
 * **The straight run is what makes a road continue a street rather than end
 * at a wall**: the street inside runs square to the square's edge, so a road
 * that arrives on a slant meets it at a kink, and a road that turns within its
 * own width of the kerb swings a corner of its carriageway over the paving. 18
 * is the trunk's whole drawn half-width (16.2, `roadClearance`) with a little
 * over, so the widest section on the planet is clear of the kerb before the
 * road is allowed to turn; it is also exactly one near-band span (`SPANS`), so
 * the approach is one piece of ribbon from the kerb out, and it is two and a
 * half avatars — a stretch of road you walk, not a notch in one.
 *
 * Two facing gates closer than four of these share what there is: see
 * `courseOf`.
 */
export const APPROACH = 18;

/** Points the middle's own length is estimated from; `coursePath` measures it. */
const MIDDLE_SAMPLES = 8;

/**
 * Everything a road's shape is a function of, worked out once per road.
 *
 * A road is **gate, straight approach, bowed middle, straight approach, gate**:
 *
 * - `gateA` and `gateB` are on the two squares' edges, where a street's centre
 *   line meets the kerb (`gatesOf`). The ribbon starts and stops exactly there,
 *   so there is nothing to clip and nothing inside a square to draw.
 * - `stubA` and `stubB` are `approach` units straight out of each gate along
 *   the side's outward normal — the final stretch that lines up with the street.
 * - Between them, a cubic Bezier whose two inner handles run along those same
 *   normals, a third of the chord out, so the middle leaves one approach and
 *   joins the other with no kink (it is tangent-continuous at both joins by
 *   construction, and when the two gates face each other it is a straight line
 *   at a uniform rate).
 * - And the bow, `bend` of the middle's own span along the chord's pole, as a
 *   `sin^2` bump. The old bow was a half-sine, and a half-sine has a slope at
 *   its ends — a road bowed 0.3 left its town 43 degrees off the chord, which
 *   was fine from a centre and is not from a gate. `sin^2` is flat at both
 *   ends, so the bow changes the middle and leaves the arrival square.
 *
 * Every piece is evaluated the way the old curve was — on unit vectors and
 * normalised back onto the sphere — and `t` is shared out so that it runs at
 * roughly one rate over the whole road: each approach takes `share` of it. It
 * is not exactly arc length, and nothing that needs distance reads it as if it
 * were: `coursePath` measures it.
 */
export interface RoadCourse {
  gateA: THREE.Vector3;
  gateB: THREE.Vector3;
  stubA: THREE.Vector3;
  stubB: THREE.Vector3;
  /** The middle's inner control points, off the sphere. */
  handleA: THREE.Vector3;
  handleB: THREE.Vector3;
  pole: THREE.Vector3;
  /** The bow's peak, in radians of the sphere. */
  bow: number;
  /** The length of each straight approach, in world units. */
  approach: number;
  /** The share of `t` each approach takes. */
  share: number;
  /** Estimated length, in world units: the two approaches and eight chords of the middle. */
  length: number;
}

export function emptyCourse(): RoadCourse {
  return {
    gateA: new THREE.Vector3(),
    gateB: new THREE.Vector3(),
    stubA: new THREE.Vector3(),
    stubB: new THREE.Vector3(),
    handleA: new THREE.Vector3(),
    handleB: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    bow: 0,
    approach: 0,
    share: 0,
    length: 0,
  };
}

const courseOutA = new THREE.Vector3();
const courseOutB = new THREE.Vector3();
const courseChord = new THREE.Vector3();
const courseLast = new THREE.Vector3();
const courseHere = new THREE.Vector3();

/** The longest a middle's handle may be, as a share of its chord; see `handleFor`. */
const HANDLE_CAP = 0.75;

/**
 * How far a middle's handle reaches out of its approach, on the unit sphere.
 *
 * **A third of the chord was the textbook handle and it folded two thousand
 * ribbons.** A third is right when the two gates face each other — the middle
 * is then a straight line at a uniform rate — and a cubic with short handles
 * does its turning at its two ends, so a road leaving a gate 45 degrees off
 * its chord turned at a radius of `c / (6 sin 45)` right after the approach:
 * 19 units on an 80-unit road, and under the drawn half-width of a trunk. Over
 * the first gated bake, 2,166 of 16,655 courses bent tighter than their own
 * ribbon was wide, 1,999 of them on the seeded bow — the Bezier's doing, not
 * the bow's (2026-09-13).
 *
 * So each handle is the one a cubic needs to be a circular arc turning `phi`
 * at that end, `c / (3 cos^2(phi / 2))`: a third when the gate faces the far
 * one, two thirds when it faces ninety degrees off, and an arc of constant
 * curvature — the gentlest turn there is between those two headings — when
 * both ends turn the same way. `toward` is the chord out of this end; `out`,
 * the gate's own normal, is a unit tangent. Capped at `HANDLE_CAP` of the
 * chord, because a gate facing away needs a U-turn that no handle makes gentle
 * and a long one only swings the road further out before it comes back.
 */
function handleFor(chord: number, out: THREE.Vector3, toward: THREE.Vector3): number {
  const length = toward.length();
  const cos = length > 0 ? Math.min(1, Math.max(-1, out.dot(toward) / length)) : 1;
  const halfCos = (1 + cos) * 0.5;
  return Math.min(HANDLE_CAP * chord, chord / (3 * Math.max(halfCos, 1e-6)));
}

/**
 * The course of a road, from the two places it joins, the gates it names and
 * its bow.
 *
 * **The approach shortens between two squares that nearly touch**, to a
 * quarter of the gap between the gates, so the two straight runs never meet
 * and the middle always has half the gap to turn in. The bake thins places so
 * that no two built discs touch and the squares are inscribed in them, so
 * facing squares are always at least `0.29 (ra + rb)` apart — seven units for
 * two of the smallest towns, which is a short road between two kerbs rather
 * than none.
 */
export function courseOf(road: Road, places: readonly Place[], into: RoadCourse = emptyCourse()): RoadCourse {
  const townA = townOf(places[road.a]!);
  const townB = townOf(places[road.b]!);
  const gateA = townA.gates[road.gateA];
  const gateB = townB.gates[road.gateB];
  if (gateA === undefined || gateB === undefined) {
    throw new Error(
      `road ${places[road.a]!.name}-${places[road.b]!.name} names gates ${road.gateA}/${road.gateB} ` +
        `of towns with ${townA.gates.length}/${townB.gates.length}; re-bake roads.bin`,
    );
  }
  offsetDirection(townA.up, townA.across, townA.north, gateA.x, gateA.z, into.gateA);
  offsetDirection(townB.up, townB.across, townB.north, gateB.x, gateB.z, into.gateB);
  const approach = Math.min(APPROACH, into.gateA.angleTo(into.gateB) * PLANET_RADIUS * 0.25);
  offsetDirection(
    townA.up, townA.across, townA.north,
    gateA.x + gateA.outX * approach, gateA.z + gateA.outZ * approach,
    into.stubA,
  );
  offsetDirection(
    townB.up, townB.across, townB.north,
    gateB.x + gateB.outX * approach, gateB.z + gateB.outZ * approach,
    into.stubB,
  );
  // Outward along the ground at each town: the side's own normal. It is a
  // tangent at the town's centre and not at the stub, and it does not need to
  // be — the curve is normalised, so what survives is its projection onto the
  // stub's own tangent plane, which is the approach's own direction exactly.
  courseOutA.copy(townA.across).multiplyScalar(gateA.outX).addScaledVector(townA.north, gateA.outZ);
  courseOutB.copy(townB.across).multiplyScalar(gateB.outX).addScaledVector(townB.north, gateB.outZ);
  const chord = into.stubA.distanceTo(into.stubB);
  courseChord.subVectors(into.stubB, into.stubA);
  into.handleA.copy(into.stubA).addScaledVector(courseOutA, handleFor(chord, courseOutA, courseChord));
  courseChord.negate();
  into.handleB.copy(into.stubB).addScaledVector(courseOutB, handleFor(chord, courseOutB, courseChord));
  roadPole(into.stubA, into.stubB, into.pole);
  into.bow = road.bend * into.stubA.angleTo(into.stubB);
  into.approach = approach;
  let middle = 0;
  courseLast.copy(into.stubA);
  for (let k = 1; k <= MIDDLE_SAMPLES; k++) {
    middlePoint(into, k / MIDDLE_SAMPLES, courseHere);
    middle += courseHere.distanceTo(courseLast) * PLANET_RADIUS;
    courseLast.copy(courseHere);
  }
  into.length = 2 * approach + middle;
  into.share = into.length > 0 ? approach / into.length : 0;
  return into;
}

/** The bowed middle at `u` in [0, 1], from one stub to the other. */
function middlePoint(course: RoadCourse, u: number, target: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u;
  const b0 = v * v * v;
  const b1 = 3 * v * v * u;
  const b2 = 3 * v * u * u;
  const b3 = u * u * u;
  const { stubA, handleA, handleB, stubB } = course;
  target.set(
    b0 * stubA.x + b1 * handleA.x + b2 * handleB.x + b3 * stubB.x,
    b0 * stubA.y + b1 * handleA.y + b2 * handleB.y + b3 * stubB.y,
    b0 * stubA.z + b1 * handleA.z + b2 * handleB.z + b3 * stubB.z,
  );
  const s = Math.sin(Math.PI * u);
  return target.addScaledVector(course.pole, course.bow * s * s).normalize();
}

/** A point along a road at `t` in [0, 1], as a unit vector. `t = 0` is gate A, exactly. */
export function coursePoint(course: RoadCourse, t: number, target: THREE.Vector3): THREE.Vector3 {
  const share = course.share;
  if (t <= share) return target.copy(course.gateA).lerp(course.stubA, share > 0 ? t / share : 1).normalize();
  if (t >= 1 - share) return target.copy(course.gateB).lerp(course.stubB, share > 0 ? (1 - t) / share : 1).normalize();
  return middlePoint(course, (t - share) / (1 - 2 * share), target);
}

const tangentAt = new THREE.Vector3();

/**
 * The unit tangent at `t`, pointing the way `t` increases.
 *
 * Differentiated rather than differenced, because the one place a difference
 * would be wrong is the one place it matters: at a gate the tangent has to be
 * the approach's own direction, so the ribbon's end section lies along the kerb
 * rather than a hundredth of a radian off it.
 */
export function courseTangent(course: RoadCourse, t: number, target: THREE.Vector3): THREE.Vector3 {
  const share = course.share;
  coursePoint(course, t, tangentAt);
  if (t < share) {
    target.subVectors(course.stubA, course.gateA);
  } else if (t > 1 - share) {
    target.subVectors(course.gateB, course.stubB);
  } else {
    const u = (t - share) / (1 - 2 * share);
    const v = 1 - u;
    const d0 = 3 * v * v;
    const d1 = 6 * u * v;
    const d2 = 3 * u * u;
    const { stubA, handleA, handleB, stubB } = course;
    target.set(
      d0 * (handleA.x - stubA.x) + d1 * (handleB.x - handleA.x) + d2 * (stubB.x - handleB.x),
      d0 * (handleA.y - stubA.y) + d1 * (handleB.y - handleA.y) + d2 * (stubB.y - handleB.y),
      d0 * (handleA.z - stubA.z) + d1 * (handleB.z - handleA.z) + d2 * (stubB.z - handleB.z),
    );
    target.addScaledVector(course.pole, course.bow * Math.PI * Math.sin(2 * Math.PI * u));
  }
  // Onto the ground at the point: the curve is normalised, so only the part of
  // its derivative along the sphere survives.
  return target.addScaledVector(tangentAt, -target.dot(tangentAt)).normalize();
}

/**
 * Longest piece of road treated as a straight chord, and how far that chord is
 * allowed to cut inside the curve, in world units.
 *
 * **These were `ribbonHeightAt`'s and they are everybody's now**, because the
 * curve they bound is. 48 was `vegetation.ts`'s chord, priced for a wood
 * against the tightest bow the bake kept; it is the wrong end of the
 * distribution for a foot — a short road bends hardest, and one chord across a
 * 60-unit lane at the median bow cut 3.3 units inside it, half a carriageway,
 * which `pnpm check` caught as a probe standing on a road that was not there.
 * So the chord is bounded by its own sag: 0.05 units, a hundredth of a lane's
 * half-width and under the width of the pen that draws the road. The Bezier
 * middle and the `sin^2` bow have no closed-form curvature worth writing down,
 * so `coursePath` measures the sag rather than predicting it.
 */
const PATH_STEP = 48;
const PATH_SAG = 0.05;
/** How many times a chord may halve before its sag is taken as good enough. */
const PATH_DEPTH = 10;

/**
 * A road's course as a polyline, with its length measured along it.
 *
 * **The one walk everything that needs distance takes.** `t` is only roughly
 * arc length, so a mover driving at a speed, a foot asking how far it is from
 * a gate, and a ribbon asking where to put a section every 18 units all read
 * `s` here, and a wood or a herd keeping off the carriageway walks the same
 * chords. The approaches are straight and get their two ends; the middle is
 * cut into chords of at most `PATH_STEP` and each is halved until the curve's
 * own midpoint is within `PATH_SAG` of the chord's.
 */
export interface CoursePath {
  /** `t` at each vertex, 0 at gate A and 1 at gate B. */
  t: Float64Array;
  /** Distance along the path from gate A to each vertex, in world units. */
  s: Float64Array;
  /** Each vertex on the unit sphere, as x, y, z. */
  xyz: Float64Array;
  count: number;
  length: number;
}

const pathA = new THREE.Vector3();
const pathB = new THREE.Vector3();
const pathMid = new THREE.Vector3();
const pathChord = new THREE.Vector3();

export function coursePath(course: RoadCourse): CoursePath {
  const ts: number[] = [0];
  const t0 = course.share;
  const t1 = 1 - course.share;
  if (t0 > 0) ts.push(t0);
  const refine = (ta: number, tb: number, depth: number): void => {
    coursePoint(course, ta, pathA);
    coursePoint(course, tb, pathB);
    const tm = (ta + tb) * 0.5;
    coursePoint(course, tm, pathMid);
    pathChord.addVectors(pathA, pathB).normalize();
    if (depth < PATH_DEPTH && pathMid.distanceTo(pathChord) * PLANET_RADIUS > PATH_SAG) {
      refine(ta, tm, depth + 1);
      refine(tm, tb, depth + 1);
    } else {
      ts.push(tb);
    }
  };
  const middle = Math.max(0, course.length - 2 * course.approach);
  const pieces = Math.max(2, Math.ceil(middle / PATH_STEP));
  for (let k = 0; k < pieces; k++) refine(t0 + ((t1 - t0) * k) / pieces, t0 + ((t1 - t0) * (k + 1)) / pieces, 0);
  if (t1 < 1) ts.push(1);
  const count = ts.length;
  const t = Float64Array.from(ts);
  const s = new Float64Array(count);
  const xyz = new Float64Array(count * 3);
  for (let k = 0; k < count; k++) {
    coursePoint(course, t[k]!, pathA);
    xyz[k * 3] = pathA.x;
    xyz[k * 3 + 1] = pathA.y;
    xyz[k * 3 + 2] = pathA.z;
    if (k > 0) {
      const dx = pathA.x - xyz[k * 3 - 3]!;
      const dy = pathA.y - xyz[k * 3 - 2]!;
      const dz = pathA.z - xyz[k * 3 - 1]!;
      s[k] = s[k - 1]! + Math.sqrt(dx * dx + dy * dy + dz * dz) * PLANET_RADIUS;
    }
  }
  return { t, s, xyz, count, length: s[count - 1]! };
}

/**
 * The tightest radius a course turns through anywhere, in world units, read
 * off its path: the turn between each pair of consecutive chords over their
 * mean length.
 *
 * **A ribbon folds over itself where its course turns tighter than the ribbon
 * is wide** — the inner shoulder's radius is the turn's radius less the drawn
 * half-width — so the bake refuses a course whose tightest turn is under
 * `roadClearance` and `pnpm check` asserts none ships. The path's chords are
 * held to 0.05 units of sag, so a chord is always short against the turn it is
 * measuring and the estimate is good to a few per cent at any radius a road
 * could be drawn at.
 */
export function tightestTurn(path: CoursePath): number {
  const xyz = path.xyz;
  let tightest = Infinity;
  for (let k = 1; k + 1 < path.count; k++) {
    const ax = xyz[k * 3]! - xyz[k * 3 - 3]!;
    const ay = xyz[k * 3 + 1]! - xyz[k * 3 - 2]!;
    const az = xyz[k * 3 + 2]! - xyz[k * 3 - 1]!;
    const bx = xyz[k * 3 + 3]! - xyz[k * 3]!;
    const by = xyz[k * 3 + 4]! - xyz[k * 3 + 1]!;
    const bz = xyz[k * 3 + 5]! - xyz[k * 3 + 2]!;
    const la = Math.hypot(ax, ay, az);
    const lb = Math.hypot(bx, by, bz);
    if (la < 1e-12 || lb < 1e-12) continue;
    const turn = Math.acos(Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / (la * lb))));
    if (turn < 1e-9) continue;
    const radius = ((la + lb) * 0.5 * PLANET_RADIUS) / turn;
    if (radius < tightest) tightest = radius;
  }
  return tightest;
}

/** The `t` at a distance `s` along a path from gate A: 0 and 1 at the two gates, exactly. */
export function parameterAt(path: CoursePath, s: number): number {
  if (s <= 0) return 0;
  if (s >= path.length) return 1;
  let low = 0;
  let high = path.count - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (path.s[middle]! <= s) low = middle;
    else high = middle;
  }
  const span = path.s[high]! - path.s[low]!;
  const along = span > 0 ? (s - path.s[low]!) / span : 0;
  return path.t[low]! + (path.t[high]! - path.t[low]!) * along;
}

/**
 * The courses of one network, cached, for the files that walk it every frame.
 *
 * A course is seven vectors and a path a few dozen vertices, and the network
 * is 17,000 roads, so this holds the ones that were asked for recently rather
 * than all of them: `ribbonHeightAt` asks about the few under the player, the
 * movers about the few hundred near the viewer, and the wood and the herd about
 * the ones crossing a tile. Least recently used out. Shared, the way
 * `roadIndexFor` is, so four callers pay for one cache.
 */
export interface RoadGeometry {
  course(index: number): RoadCourse;
  path(index: number): CoursePath;
}

const GEOMETRY_CAP = 4096;
let sharedGeometry: { roads: readonly Road[]; places: readonly Place[]; geometry: RoadGeometry } | null = null;

export function roadGeometryFor(roads: readonly Road[], places: readonly Place[]): RoadGeometry {
  if (sharedGeometry !== null && sharedGeometry.roads === roads && sharedGeometry.places === places) {
    return sharedGeometry.geometry;
  }
  const cache = new Map<number, { course: RoadCourse; path: CoursePath | null }>();
  const entry = (index: number): { course: RoadCourse; path: CoursePath | null } => {
    const known = cache.get(index);
    if (known !== undefined) {
      cache.delete(index);
      cache.set(index, known);
      return known;
    }
    const made = { course: courseOf(roads[index]!, places), path: null };
    cache.set(index, made);
    if (cache.size > GEOMETRY_CAP) cache.delete(cache.keys().next().value!);
    return made;
  };
  const geometry: RoadGeometry = {
    course: (index) => entry(index).course,
    path(index) {
      const found = entry(index);
      found.path ??= coursePath(found.course);
      return found.path;
    },
  };
  sharedGeometry = { roads, places, geometry };
  return geometry;
}

// ---------------------------------------------------------------------------
// How high a road rides into a gate
// ---------------------------------------------------------------------------

/**
 * The steepest the ribbon's own climb to a gate may be: rise over run, on top
 * of whatever the relief under it is doing.
 *
 * **The crown is the relief plus `RIBBON_LIFT` everywhere but the last run
 * before a gate, and there it has to meet a level paving at an absolute
 * height** — `gateLevel + GROUND_LIFT`, which on flat ground is the same
 * number and on a hillside is up to a few terraces off it. So the offset
 * between the two decays from its whole value at the kerb to nothing at this
 * rate: a road meeting a gate four units over its natural crown ramps down to
 * it over 13 units, and one meeting a gate cut twelve units into a hillside
 * over 40. 0.3 is the number the town's own ramps already used, 17 degrees,
 * about the steepest street a car is driven up — and it is *added* to the
 * relief rather than absolute, because the relief under a road is allowed up
 * to `MAX_SLOPE` and a ramp that promised an absolute grade would have to
 * refuse every gate on a hill.
 */
export const RAMP_GRADE = 0.3;

/**
 * How much narrower than a one-cell gate's cell a crown arrives, in world
 * units: half a unit inside it, so its corners do not stand on the line where a
 * neighbouring cell's riser can start.
 */
const GATE_MARGIN = 0.5;

const continents = new WeakMap<World, Map<string, string>>();

/**
 * Half the street a gate opens onto, which is what a crown narrows to at its
 * kerb: a road continues the street it enters, at the street's own width.
 *
 * - **A gate on one cell** — the main street of a town an odd number of cells
 *   wide, which is the whole middle cell, or the one cell of a hamlet — opens
 *   onto that cell: half a pitch, less `GATE_MARGIN`.
 * - **A gate on a boundary** opens onto the two street bands either side of
 *   it, each `streetBand` of the region's own carriageway (`GroundStyle.street`)
 *   — the band the town paves in the road's colour, flush to the kerb. The
 *   region is the place's own, found the way `settlements.ts` finds it: the
 *   continent by the country's code in `world.countries`, then `regionFor`.
 */
function streetHalf(place: Place, town: Town, gate: Gate, world: World): number {
  if (gate.cells.length < 2) return town.grid.pitch * 0.5 - GATE_MARGIN;
  let continent = continents.get(world);
  if (continent === undefined) {
    continent = new Map(world.countries.map((country) => [country.iso, country.continent]));
    continents.set(world, continent);
  }
  const region = regionFor(place.iso, continent.get(place.iso) ?? '', place.lat);
  return streetBand(town.grid, groundStyleFor(region.id).street);
}

/**
 * What a road's two ends ask of its height, worked out once per road.
 *
 * `rise` is how far the gate's paving stands over the crown the relief would
 * give the road at the kerb: `gateLevel + GROUND_LIFT - (ground + RIBBON_LIFT)`,
 * the ground taken at the gate itself. `level` is how far out the section is
 * still levelling itself — the approach — and `narrow` is the crown half-width
 * the gate lets in. An end whose town is not built (the prominence knob, turned
 * away from the value the network was baked at) asks for nothing: no rise, no
 * levelling, no narrowing, and the ribbon ends at a gate of a square nobody
 * raised. `kerb` is the paving's own radius, for `pnpm check`.
 */
export interface RoadRamp {
  riseA: number;
  riseB: number;
  levelA: number;
  levelB: number;
  narrowA: number;
  narrowB: number;
  kerbA: number;
  kerbB: number;
}

export function emptyRamp(): RoadRamp {
  return { riseA: 0, riseB: 0, levelA: 0, levelB: 0, narrowA: Infinity, narrowB: Infinity, kerbA: 0, kerbB: 0 };
}

export function rampOf(
  road: Road,
  course: RoadCourse,
  places: readonly Place[],
  world: World,
  into: RoadRamp = emptyRamp(),
): RoadRamp {
  for (const end of [0, 1] as const) {
    const place = places[end === 0 ? road.a : road.b]!;
    const gate = end === 0 ? road.gateA : road.gateB;
    const level = isShown(place) ? gateHeight(place, gate, world) : null;
    let rise = 0;
    let run = 0;
    let narrow = Infinity;
    let kerb = 0;
    if (level !== null) {
      const town = townOf(place);
      kerb = PLANET_RADIUS + level + GROUND_LIFT;
      rise = level + GROUND_LIFT - (world.elevationAt(end === 0 ? course.gateA : course.gateB) + RIBBON_LIFT);
      run = course.approach;
      narrow = streetHalf(place, town, town.gates[gate]!, world);
    }
    if (end === 0) {
      into.riseA = rise;
      into.levelA = run;
      into.narrowA = narrow;
      into.kerbA = kerb;
    } else {
      into.riseB = rise;
      into.levelB = run;
      into.narrowB = narrow;
      into.kerbB = kerb;
    }
  }
  return into;
}

/** How far a ramp of `rise` reaches out from its kerb, in world units. */
export function rampReach(rise: number): number {
  return Math.abs(rise) / RAMP_GRADE;
}

/** What is left of a kerb's rise `s` units out from it. */
function riseLeft(rise: number, s: number): number {
  const left = Math.abs(rise) - RAMP_GRADE * s;
  return left > 0 ? Math.sign(rise) * left : 0;
}

/** How much of the relief's cross-slope is still being levelled out `s` units from a kerb. */
function levelling(level: number, s: number): number {
  return level > 0 && s < level ? 1 - s / level : 0;
}

/**
 * The bow a given pair of places gets.
 *
 * Seeded from the two *identities* rather than from their indices, so re-baking
 * `places.bin` with one more village in it does not re-shape every road in the
 * world. Same law as the settlement seeds, and the same reason.
 */
export function bendFor(a: Place, b: Place): number {
  const first = a.name < b.name ? a : b;
  const second = a.name < b.name ? b : a;
  const seed = seedOf(
    `${first.name}@${first.lat},${first.lon}`,
    `${second.name}@${second.lat},${second.lon}`,
  );
  // A twentieth of the length either way. Enough that a junction is not a
  // pencil of rays; small enough that nobody would call the road a detour.
  return (((seed >>> 0) / 4294967296) * 2 - 1) * 0.05;
}

/** Unit vector at a place. The negative z is the planet's handedness; see CLAUDE.md. */
export function placeDirection(place: Place, target: THREE.Vector3): THREE.Vector3 {
  const cos = Math.cos(place.lat * DEG);
  return target.set(cos * Math.cos(place.lon * DEG), Math.sin(place.lat * DEG), -cos * Math.sin(place.lon * DEG));
}

// ---------------------------------------------------------------------------
// The graph the bake keeps, and the check re-derives
// ---------------------------------------------------------------------------

/**
 * Longest road the network will build, in world units.
 *
 * One unit is 0.4 km, so 1,000 units is 400 km — about the longest single hop
 * that still reads as "these two towns are connected" rather than as a line
 * ruled across an empty continent. Past it the places are genuinely alone: the
 * interior of the Sahara, the Australian centre, Antarctic bases.
 */
export const MAX_ROAD_LENGTH = 1000;

/**
 * How often the water test asks what is underneath, in world units.
 *
 * **Here rather than in the bake because the check re-derives it.** The bake
 * decides which roads exist by walking them at this stride and asking
 * `countryAt`; `check-world.ts` walks the shipped ones again and asserts none
 * of them is wet. Two copies of the number is two answers to "is this road in
 * the sea", and the copies drifting is the shape of bug this project keeps
 * writing down.
 *
 * It was 18 in the bake, calibrated against the narrowest strait 1:50m drew —
 * Gibraltar, 14 km, 35 units, two samples deep at 18. 1:10m draws water 1:50m
 * did not: the Akashi Strait is 4 km, the Wouri and the Hooghly narrower still,
 * and an 18-unit stride walks over all of them. Re-probing the baked network at
 * 2 found roads standing in water that the old stride's samples had all
 * stepped over — a sampling miss and not a modelling one. At 2 the test is
 * several million probes and well under a minute, and the bake still finishes
 * quickly.
 */
export const WATER_PROBE_STEP = 2;

/**
 * How many steps that walk takes between two places, from their unit directions.
 *
 * **The stride was shared and the walk was not, and that is still two answers to
 * one question.** A road is only as dry as the points the walk stopped at, so
 * two grids a step out of phase disagree about any channel narrower than a
 * step. A bake that counts its steps from the *chord* its proximity graph
 * already had, against a check that counts from the *arc*, differ by a
 * fraction of a percent — nothing until `ceil` rounds the two of them apart on
 * a road that lands right at the boundary, dry to one and wet to the other.
 *
 * **It counts from the course now**, gate to gate, and both programs get the
 * course's length from `courseOf`, so it is still one count. A walk is `steps +
 * 1` probes from gate A to gate B inclusive: the ends are on a kerb rather than
 * in the middle of a town, so neither of them is known to be dry.
 */
export function waterProbeSteps(course: RoadCourse): number {
  return Math.max(2, Math.ceil(course.length / WATER_PROBE_STEP));
}

/**
 * The two proximity graphs, and the one thing both of them are.
 *
 * - **Gabriel** keeps an edge when no third place lies inside the circle that
 *   has the edge as its diameter.
 * - **The relative neighbourhood graph** is stricter: it keeps an edge only
 *   when no third place is closer to *both* ends than they are to each other.
 *   It is a *subgraph* of Gabriel and it still contains the minimum spanning
 *   tree, which is the whole reason the thinning pass can lean on it.
 *
 * They were measured against each other before either shipped — see
 * `docs/traps.md` — and the answer is that neither one alone is the network:
 * Gabriel at mean degree 4.25 is a lattice and the relative neighbourhood graph
 * at 2.64 is a chain. `build-roads.ts` keeps Gabriel and then uses the
 * subgraph relation to decide which of Gabriel's extra edges are worth having.
 */
export type ProximityGraph = 'gabriel' | 'rng';

export interface GraphEdge {
  /** Indices into the place list, always `a < b`, so a pair has one key. */
  a: number;
  b: number;
  /** Chord length in world units. Monotonic in the arc, which is all it is for. */
  length: number;
}

/**
 * Builds one of the two graphs over a list of places.
 *
 * **It lives here rather than in `scripts/build-roads.ts` for the reason
 * `courseOf` does.** Two programs need the same answer: the bake, which
 * chooses the edges, and `pnpm check`, which has to be able to say *this
 * network is as connected as the one the bake tested* without trusting the
 * bake to tell it. A second copy of a graph rule is two graphs that agree
 * today.
 *
 * Both tests are local — an edge is only ever checked against places inside a
 * disc it defines — so the neighbour list gathered once per place is all either
 * of them needs, and a lat/lon grid makes that list local too. It is about
 * 0.8 s over the 29,545 places, and nothing in the browser calls it.
 */
export function proximityGraph(
  places: readonly Place[],
  kind: ProximityGraph,
  maxLength = MAX_ROAD_LENGTH,
): GraphEdge[] {
  const unit = new Float64Array(places.length * 3);
  const scratch = new THREE.Vector3();
  places.forEach((place, i) => {
    placeDirection(place, scratch);
    unit[i * 3] = scratch.x;
    unit[i * 3 + 1] = scratch.y;
    unit[i * 3 + 2] = scratch.z;
  });
  const chord = (i: number, j: number): number => {
    const dx = unit[i * 3]! - unit[j * 3]!;
    const dy = unit[i * 3 + 1]! - unit[j * 3 + 1]!;
    const dz = unit[i * 3 + 2]! - unit[j * 3 + 2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * PLANET_RADIUS;
  };

  // `maxLength` is 1,000 units, which is 3.6 degrees of latitude — so a
  // 4-degree cell means a query never looks at more than a 3x3 block. The
  // longitude span of a cell shrinks with the cosine, which is what stops a
  // search near the poles from sweeping a band thousands of units wide.
  const CELL = 4;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const cellOf = (lat: number, lon: number): number =>
    Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL))) * COLS +
    (((Math.floor((lon + 180) / CELL) % COLS) + COLS) % COLS);
  places.forEach((place, i) => grid[cellOf(place.lat, place.lon)]!.push(i));

  const near = (i: number, radius: number): number[] => {
    const place = places[i]!;
    const found: number[] = [];
    const latSpan = Math.ceil(radius / UNITS_PER_DEGREE / CELL);
    const lonSpan = Math.ceil(
      radius / UNITS_PER_DEGREE / Math.max(0.02, Math.cos(place.lat * DEG)) / CELL,
    );
    const row0 = Math.max(0, Math.floor((90 - place.lat) / CELL) - latSpan);
    const row1 = Math.min(ROWS - 1, Math.floor((90 - place.lat) / CELL) + latSpan);
    const col = Math.floor((place.lon + 180) / CELL);
    for (let r = row0; r <= row1; r++) {
      for (let c = col - lonSpan; c <= col + lonSpan; c++) {
        // The search wraps the whole planet: walk every column once.
        if (lonSpan * 2 + 1 >= COLS && c > col - lonSpan + COLS - 1) break;
        for (const j of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
          if (j !== i && chord(i, j) <= radius) found.push(j);
        }
      }
    }
    return found;
  };

  const edges: GraphEdge[] = [];
  for (let i = 0; i < places.length; i++) {
    const neighbours = near(i, maxLength);
    for (const j of neighbours) {
      // Each pair once.
      if (j < i) continue;
      const length = chord(i, j);
      if (length > maxLength || length < 1e-6) continue;
      let kept = true;
      for (const k of neighbours) {
        if (k === i || k === j) continue;
        const ik = chord(i, k);
        const jk = chord(j, k);
        if (kind === 'gabriel') {
          // Inside the circle on `ij` as a diameter: the angle at k is obtuse.
          if (ik * ik + jk * jk < length * length) {
            kept = false;
            break;
          }
        } else if (Math.max(ik, jk) < length) {
          // In the lune: closer to both ends than they are to each other.
          kept = false;
          break;
        }
      }
      if (kept) edges.push({ a: i, b: j, length });
    }
  }
  return edges;
}

/** One key per unordered pair, for the set difference the bake and the check both take. */
export function pairKey(places: number, a: number, b: number): number {
  return Math.min(a, b) * places + Math.max(a, b);
}

/**
 * The candidate pairs, over the places that are actually **built**.
 *
 * **The network is a graph over the 9,734 towns that stand, not over the 29,545
 * rows of the gazetteer, and that one line is the whole of this round.** Gabriel
 * over the gazetteer joins a place to its nearest neighbours, and a city's
 * nearest neighbours are its own suburbs — `PROMINENCE_RADIUS` hides two thirds
 * of the file, so every edge out of Madrid ran to a village that is not built,
 * `classOf` called it a lane because it reads the *smaller* end, and a whole
 * layer of machinery grew up to reconstruct city-to-city connections out of a
 * graph that never held them: a prune for dead ends at unbuilt villages, routes
 * chained through hidden junctions, a floor putting one road back at each
 * orphaned metropolis. None of that exists here. Every endpoint is a town you
 * can walk into, every road joins two of them, and the user's sentence is the
 * specification: *solo conexiones entre ciudades.*
 *
 * Measured over the shipped `places.bin` (2026-09-08), carried through the water
 * and slope tests below:
 *
 * ```
 *                       candidates   roads    wet   steep   towns with none
 *   gabriel                 20,022  17,196  1,236   1,590     733   7.5%
 *   rng                     12,595  10,918    731     946     806   8.3%
 * ```
 *
 * Gabriel is what ships, unthinned. It is a **median degree of 4** — *no hace
 * falta que conectes una ciudad con 20* — where the relative neighbourhood graph
 * is a median of 2 and reads as a chain, and the thinning pass that used to sit
 * between them is gone with the lattice it was invented for: Gabriel over the
 * gazetteer was 4.14 at a 106-unit spacing and Gabriel over the built towns is
 * not, because the points are 260 units apart to begin with.
 *
 * The indices that come back are indices into the **whole** `places.bin`, so
 * `roads.bin` still stores what it always stored and everything downstream reads
 * a place the same way. It lives here for the reason `proximityGraph` does: the
 * bake chooses the edges and `pnpm check` has to be able to re-derive them
 * without believing the file.
 *
 * **It is a function of `isShown`, so it is a function of `PROMINENCE_RADIUS`.**
 * `atlas.prominence(r)` moves the towns live and the network no longer follows
 * it at all — the roads are a **re-bake** now, not a reload. `pnpm check`
 * asserts the file against this function, so a knob left turned in
 * `places.ts` fails there rather than showing up as roads to nowhere.
 */
export function builtGraph(
  places: readonly Place[],
  kind: ProximityGraph,
  maxLength = MAX_ROAD_LENGTH,
): GraphEdge[] {
  const index: number[] = [];
  const built: Place[] = [];
  places.forEach((place, i) => {
    if (!isShown(place)) return;
    index.push(i);
    built.push(place);
  });
  // `proximityGraph` emits `a < b` in the order it was given, and `index` is
  // increasing, so the remapped pair is still ordered and `pairKey` still works.
  return proximityGraph(built, kind, maxLength).map((edge) => ({
    a: index[edge.a]!,
    b: index[edge.b]!,
    length: edge.length,
  }));
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface RoadData {
  /** How many places the graph was baked against. Asserted, not trusted. */
  places: number;
  /** Which proximity graph the bake kept: `gabriel` today. See `build-roads.ts`. */
  graph: string;
  roads: Road[];
}

export async function loadRoads(url = '/data/roads.bin'): Promise<RoadData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeRoads(await inflate(await response.arrayBuffer()));
}

/**
 * How often the slope test asks how steep the ground is, in world units.
 *
 * The water test's own `PROBE_STEP`, and for the same reason: it is the step at
 * which a road is already known to be sampled finely enough to catch a feature
 * it must not cross. `gradeAt` measures over the road's own half-width — 11.5
 * units for a `road`, 16.2 for a trunk, from `roadClearance` — so the probes
 * overlap along the whole carriageway rather than leaving gaps between them.
 */
const SLOPE_STEP = 18;

const slopeAt = new THREE.Vector3();
const slopeAhead = new THREE.Vector3();
const slopeSide = new THREE.Vector3();
const slopeNorth = new THREE.Vector3();
const slopeCourse = emptyCourse();
const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

/**
 * Whether a road crosses ground steeper than anything is built on.
 *
 * **A road on a mountain face is a carriageway sunk into rock, and the user
 * asked for it to go**: *en las pendientes hemos quitado la decoración, está
 * muy bien, pero también hay que quitar las carreteras y caminos.* The
 * vegetation had already answered the same question — nothing grows on scree —
 * and `MAX_SLOPE` is `terrain.ts`'s one definition of how steep that is, the
 * angle of repose, so this asks it through `gradeAt` rather than writing a
 * second gradient.
 *
 * **All or nothing, and it is asked in the bake.** Clipping a road at the foot
 * of the slope would leave a carriageway stopping in a field, so a pair whose
 * road touches scree anywhere is simply not joined — *si en ningún momento se
 * pasa por una montaña.* It ran as a load-time pass over the shipped file for
 * one round, at 350 ms of `reliefAt` every time the world started; a road that
 * is refused for good is a road that should not be in the file, so
 * `build-roads.ts` asks it now and `bendThatWorks` uses it to **bow round the
 * mountain** the way it already bows round a bay. Over the 20,022 candidates,
 * 1,928 are steep on their own seeded bow, the search saves 338 of them, and
 * 1,590 are refused (2026-09-08).
 *
 * The refusal is emphatic rather than knife-edge, which is the measurement that
 * says the rule means what it claims: the worst grade along a refused road runs
 * p10 0.64, median 0.97, p90 1.51 against a `MAX_SLOPE` of 0.577, and only 24 of
 * 241 sampled fall within a tenth of the threshold.
 *
 * The **interior** and not the whole curve: the two ends are gates on a kerb,
 * and the ground under a gate is the town's own cut rather than the ground the
 * ribbon lies on — `gateOpen` asks the approach out of each gate separately. It
 * is `SLOPE_STEP` apart along the course and four `reliefAt` calls a probe. `pnpm check` re-walks all 17,238 shipped roads with it in **984 ms**
 * (2026-09-08) rather than trusting the bake, for the reason the water test is
 * re-walked: the bake tests a path and writes down a `bend`, and if the two ever
 * drift every road in the world would still be a road between two real towns and
 * some of them would climb a scree face.
 */
export function crossesScree(road: Road, places: readonly Place[]): boolean {
  return screeAt(road, places) >= 0;
}

/**
 * Where `crossesScree` first finds a road too steep, as the course's `t`, or
 * -1 if it never does. The same walk; the bake reads where, because a mountain
 * beside a gate is one another gate can go round and a mountain in the middle
 * of the road is not.
 */
export function screeAt(road: Road, places: readonly Place[]): number {
  const course = courseOf(road, places, slopeCourse);
  const steps = Math.max(2, Math.ceil(course.length / SLOPE_STEP));
  const reach = roadClearance(road.cls);
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    coursePoint(course, t, slopeAt);
    // The road's own frame, so `gradeAt`'s four probes straddle the carriageway
    // rather than an arbitrary square: across it, and along it.
    courseTangent(course, t, slopeAhead);
    slopeSide.crossVectors(slopeAt, slopeAhead).normalize();
    slopeNorth.crossVectors(slopeSide, slopeAt).normalize();
    if (gradeAt(slopeAt, slopeSide, slopeNorth, reach, slope).grade > MAX_SLOPE) return t;
  }
  return -1;
}

/**
 * The gates a set of pairs would use before any of them has been tested:
 * `assignTownGates` at every town, over every pair that ends there, among the
 * gates `gateOpen` admits. Two entries per pair, `a`'s gate then `b`'s, and -1
 * where a town has no open gate at all.
 *
 * **Here and not in the bake because two programs start from it.** The bake
 * gives each candidate these gates first and only tries others when the ground
 * near a gate refuses it, and then assigns the kept network again with the
 * same function so that gates a refused candidate had taken go back round;
 * `pnpm check` explains every candidate the file does not carry against this
 * assignment. Deterministic in the order the pairs are handed in, which both
 * callers take from `builtGraph` and from the sorted file.
 */
export function candidateGates(
  places: readonly Place[],
  pairs: readonly { a: number; b: number }[],
  world: World,
): Int16Array {
  const chosen = new Int16Array(pairs.length * 2).fill(-1);
  const byTown = new Map<number, number[]>();
  pairs.forEach((pair, i) => {
    for (const [town, end] of [[pair.a, i * 2], [pair.b, i * 2 + 1]] as const) {
      const list = byTown.get(town);
      if (list === undefined) byTown.set(town, [end]);
      else list.push(end);
    }
  });
  for (const [town, ends] of byTown) {
    const place = places[town]!;
    const open = townOf(place).gates.map((_, gate) => gateOpen(place, gate, world));
    const others = ends.map((end) => {
      const pair = pairs[end >> 1]!;
      return places[end % 2 === 0 ? pair.b : pair.a]!;
    });
    const gates = assignTownGates(place, others, (gate) => open[gate]!);
    ends.forEach((end, k) => {
      chosen[end] = gates[k]!;
    });
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Which road is drawn in front
// ---------------------------------------------------------------------------

/**
 * How far one depth layer pushes a ribbon back, in clip-space depth.
 *
 * **Two ribbons that overlap are two surfaces at one height, and heights
 * cannot separate them.** Two roads into one gate run on the same approach for
 * its first eighteen units; two out of adjacent gates of a one-cell hamlet
 * overlap at its corner, eight units from either kerb; and both ends of both
 * have to meet the same paving at `gateLevel + GROUND_LIFT`. Lowering one of
 * them would put a step at its kerb, and leaving them coplanar z-fights, which
 * is the defect the roofs had. So the choice of which one shows is made in the
 * depth buffer instead: every road carries a `layer`, and the shader moves each
 * layer this far back after projection — `polygonOffset` in units, per vertex,
 * so one mesh a tile still carries every layer.
 *
 * 1e-6 is about eight quanta of a 24-bit depth buffer (one is 2 / 2^24 of clip
 * depth, 1.2e-7), and a constant in clip space is a constant number of quanta
 * at any distance, which is the point: it resolves two coplanar ribbons and
 * loses to anything genuinely in front of them by more than that. Nothing about
 * the ground a foot or a wheel stands on changes — `ribbonHeightAt` reads the
 * one height law and the two surfaces are at the same height anyway.
 */
export const LAYER_DEPTH = 1e-6;

/**
 * Whether road `q` is drawn in front of road `r` where the two overlap: the
 * higher class, and between two of a class the lower index — which is to say
 * the bake's own order, so the answer is the file's and not the frame's.
 */
export function outranks(roads: readonly Road[], q: number, r: number): boolean {
  const a = roads[q]!.cls;
  const b = roads[r]!.cls;
  return a > b || (a === b && q < r);
}

/** The nearest two segments come, on the unit sphere: Ericson's closest points between segments. */
function segmentGap(
  p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number,
): number {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  let s = 0;
  let t = 0;
  if (a <= 1e-24 && e <= 1e-24) {
    s = 0;
    t = 0;
  } else if (a <= 1e-24) {
    t = clamp(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-24) {
      s = clamp(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-30 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t);
}

/**
 * How near chord `k` of one path comes to any chord of another, in world
 * units, or `limit` if it comes no nearer than that. Pairs of chords whose
 * midpoints are further apart than their half-lengths and the best so far are
 * skipped, which is almost all of them.
 */
export function chordGap(from: CoursePath, k: number, to: CoursePath, limit = Infinity): number {
  const f = from.xyz;
  const g = to.xyz;
  const px = f[k * 3 - 3]!;
  const py = f[k * 3 - 2]!;
  const pz = f[k * 3 - 1]!;
  const qx = f[k * 3]!;
  const qy = f[k * 3 + 1]!;
  const qz = f[k * 3 + 2]!;
  const mx = (px + qx) * 0.5;
  const my = (py + qy) * 0.5;
  const mz = (pz + qz) * 0.5;
  const half = Math.hypot(qx - px, qy - py, qz - pz) * 0.5;
  let best = limit / PLANET_RADIUS;
  for (let j = 1; j < to.count; j++) {
    const ux = g[j * 3 - 3]!;
    const uy = g[j * 3 - 2]!;
    const uz = g[j * 3 - 1]!;
    const vx = g[j * 3]!;
    const vy = g[j * 3 + 1]!;
    const vz = g[j * 3 + 2]!;
    const reach = half + Math.hypot(vx - ux, vy - uy, vz - uz) * 0.5;
    if (Math.hypot(mx - (ux + vx) * 0.5, my - (uy + vy) * 0.5, mz - (uz + vz) * 0.5) - reach >= best) continue;
    const gap = segmentGap(px, py, pz, qx, qy, qz, ux, uy, uz, vx, vy, vz);
    if (gap < best) best = gap;
  }
  return best * PLANET_RADIUS;
}

/** Whether any part of one path comes within `reach` world units of any part of another. */
export function pathsOverlap(a: CoursePath, b: CoursePath, reach: number): boolean {
  for (let k = 1; k < a.count; k++) if (chordGap(a, k, b, reach) < reach) return true;
  return false;
}

/**
 * Every road's depth layer: 0 for a road no higher-ranking road overlaps, and
 * one behind the deepest of those that do.
 *
 * **Overlap is the two drawn strips, shoulders and all**, `roadClearance` of
 * each and the paths' own sag either side: a shoulder is mostly buried, but two
 * shoulders on the same approach are parallel planes and that is where two
 * roads into one gate would fight first. Ranked by `outranks` and walked in that
 * order, so every road a road could have to sit behind has its layer already —
 * the layers are the longest chain of overlaps above each road, and two roads
 * that overlap are never on one layer.
 *
 * **Baked, and asserted.** It is a pure function of the network, but it is a
 * few seconds of chord pairs over seventeen thousand roads, which is a bake and
 * not a loading screen; `build-roads.ts` writes it and `pnpm check` recomputes it
 * from the file, the way the gates and the bow are written and re-walked.
 */
export function layersOf(roads: readonly Road[], places: readonly Place[]): Uint8Array {
  const layers = new Uint8Array(roads.length);
  const course = emptyCourse();
  const paths: CoursePath[] = [];
  const middles: THREE.Vector3[] = [];
  roads.forEach((road) => {
    courseOf(road, places, course);
    paths.push(coursePath(course));
    middles.push(coursePoint(course, 0.5, new THREE.Vector3()));
  });
  const index = createRoadIndex(roads, places);
  const order = roads.map((_, i) => i).sort((x, y) => roads[y]!.cls - roads[x]!.cls || x - y);
  const done = new Uint8Array(roads.length);
  const hits: number[] = [];
  const widest = roadClearance(ROAD_CLASSES.length - 1);
  const slack = 2 * PATH_SAG + 0.1;
  for (const r of order) {
    const path = paths[r]!;
    const clear = roadClearance(roads[r]!.cls);
    let layer = 0;
    for (const q of index.near(middles[r]!, path.length * 0.5 + clear + widest + slack, hits)) {
      // Only a road already walked outranks this one.
      if (done[q] === 0 || layers[q]! + 1 <= layer) continue;
      if (pathsOverlap(path, paths[q]!, clear + roadClearance(roads[q]!.cls) + slack)) layer = layers[q]! + 1;
    }
    layers[r] = Math.min(255, layer);
    done[r] = 1;
  }
  return layers;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * How far the ribbon is laid above `elevationAt`, in world units.
 *
 * **Exported, because the traffic's wheels ride at it** (`life.ts`, through
 * `surfaceLift`) and `pnpm check` measures the crown against it. It used to be
 * exported for the towns' own tracks as well, which drew the last forty units
 * of every road on the town's paving; they are gone (2026-09-13), and a road
 * climbs to its gate's paving by itself — see `crownLift`.
 *
 * The same fight `settlements.ts` documents, and it is worth saying why roads
 * cannot use the fix that settlements got. `setDetailSites` tightens the mesh's
 * error budget under every settlement, which took the share of town ground the
 * mesh cuts through from 31% to 1.9%. **A road is not under a settlement.** It
 * runs between them, across open country where `RELIEF_SAG` is still three
 * units, so the ribbon is lifted and the residue is that the ground cuts
 * through it.
 *
 * **It was 1.1 and the residue was an eighth of the planet, which is what the
 * user was looking at when they said the roads sink into the terrain.** The
 * measurement that had never been taken is the *mesh* against the exact relief
 * out in open country, where nothing claims detail — over the 1,234,410 land
 * triangles of the shipped mesh, the share standing more than a given height
 * over `elevationAt` (2026-09-06):
 *
 * ```
 *   over    0.5    1.1    1.5    2.0    2.6    3.0    3.5    5.0
 *   land  24.43% 12.88%  8.45%  4.92%  3.54%  3.31%  3.20%  3.07%
 * ```
 *
 * (Re-measured 2026-09-07 over the same 1,234,410 upward-facing land triangles;
 * every column that existed before came back to the digit, and 3.0 is the new
 * one.) A road laid 1.1 above the relief is under the ground you can see on
 * **12.9%** of it, and the flat tail past 2.6 is the coastal shelf's own
 * 20-unit step rather than anything a lift could reach.
 *
 * **It is 3.0, and what capped it at 1.5 has been deleted twice over.** The cap
 * was the avatar — the player walked at `elevationAt` and `FIGURE` puts his knee
 * at 1.66, so the lift was how deep he waded through the carriageway — and
 * `ribbonHeightAt` ended that: `player.ts` stands *on* the ribbon now, so the
 * number is free to be what the road wants rather than what the wading would
 * bear. And what the road wants is **exactly `GROUND_LIFT`**, which is also 3.0:
 * on flat ground a town's paving and a road's crown are then the same height
 * over the same relief, so `rampOf`'s rise is zero and a road meets its gate
 * with no ramp at all.
 * The residue goes from **8.45% of the land to 3.31%** — the knee of the
 * distribution, past which only the coastal shelf is left.
 *
 * `SHOULDER_DROP` is written as `RIBBON_LIFT + 1.5` rather than as a number, so
 * the shoulders bury themselves exactly as far as they always did and this move
 * cannot quietly un-bury them; `life.ts` reads this constant rather than
 * restating it, so the wheels came up with the tarmac.
 *
 * **The sag along the road is a different question and it is measured and
 * small**: `pnpm check` walks the drawn ribbon at the near band's own span and
 * compares the ground at each section's midpoint against the chord its ends
 * draw — **6 of 62,601 sections cut through, 0.01%, worst 8.39 units**
 * (2026-09-08, over the whole shipped network at this lift; it was 140 of
 * 81,538, 0.17%, at a lift of 1.5 over a network four times as large). That is
 * the number `SPANS` bought at 18 units, and it is not what the user saw.
 *
 * See the trap in CLAUDE.md for what a detail claim along the network — the fix
 * that would actually delete this — would cost.
 */
export const RIBBON_LIFT = 3.0;

/**
 * Longest piece of road drawn as one quad, by how far away it is.
 *
 * The chord problem, priced by distance rather than fixed. A segment takes its
 * height at its ends and the ground does what it likes in between, so near the
 * camera the spans have to be short enough to follow a hill — and 100,000 units
 * of trunk road on the far side of a continent subtends less than a pixel of
 * sag, so paying short spans for it is paying for nothing. Three bands, with the
 * band stored on the tile: a tile whose band changes is rebuilt, which is the
 * same contract as a settlement whose range changed.
 *
 * **The near span was 38 and standing on the road showed why it could not be.**
 * `settlements.ts` got the mesh tightened under every town by `setDetailSites`,
 * which is what took the share of town ground the land cuts through from 31% to
 * 1.9% — and a road is the one thing in the world that is deliberately *not*
 * under a settlement. Out there `RELIEF_SAG` is still three units and the
 * relief's finest octave is about nine units of amplitude over a 133-unit
 * wavelength, so a 38-unit chord across it dips about 0.9 below the curve,
 * against the lift of 1.1 it had then. That is not a margin, it is a coin toss,
 * and the
 * Augsburg-to-Ulm road had the ground cutting through it at every third seam.
 * At 18 the same arithmetic gives 0.23 and the seams are gone.
 *
 * It costs nothing that was not already paid for, because halving the span
 * doubled the sections and rolling each section forward into the next halved
 * the ground queries: a section is shared by the two pieces either side of it,
 * and the first version asked `elevationAt` for all eight of its corners twice.
 */
const SPANS: readonly { until: number; span: number }[] = [
  { until: 2600, span: 18 },
  { until: 9000, span: 150 },
  { until: Infinity, span: 520 },
];

function bandFor(distance: number): number {
  for (let i = 0; i < SPANS.length; i++) if (distance < SPANS[i]!.until) return i;
  return SPANS.length - 1;
}

/**
 * How far each class is worth drawing right now, in world units: the table
 * times the detail knob, worked out once a scan instead of once a road.
 *
 * **It is deliberately not floored at the haze, and the floor was measured
 * before it was rejected.** At the shipped default of 0.5 a lane's 1,300
 * becomes 650 while the fog on foot closes at about 936, so a lane does end
 * inside the haze — but the fog is a function of the *camera's* altitude and
 * the whole point of a class reach is that it is not. Flooring at
 * `fogFar(altitude)` took the Alps at a camera height of 700 from 510 roads
 * and 10,830 triangles to **1,597 and 29,760**, which is worse than the wash
 * this LOD exists to remove: 912 units up the haze is 6,466 and it was
 * licensing every `road` within four thousand units of the camera. The knob
 * shrinking a reach faster than it shrinks the fog is the documented asymmetry
 * in `view.ts` — reach linearly, fog as the square root — and this is not the
 * file that should be arguing with it.
 */
function classReaches(into: number[]): number[] {
  for (let i = 0; i < ROAD_CLASSES.length; i++) into[i] = detailReach(ROAD_CLASSES[i]!.reach);
  return into;
}

/**
 * How far the verge either side drops below the carriageway.
 *
 * The same trick the settlement tracks and the paving apron use: the shoulders
 * are laid *below* the ground so they bury themselves, and what you see is the
 * crown plus however much of the shoulder the terrain lets through. That is what
 * gives a road an edge the relief drew rather than a hard rectangle, and it is
 * also what hides the lift — the ribbon is a cut into the ground rather than a
 * strip lying on it.
 *
 * **It is written as the lift plus 1.5 and that is the rule rather than the
 * number**: the outer edge is laid a fixed depth *under the relief* whatever the
 * crown is doing, so raising the lift to clear the land mesh cannot quietly
 * un-bury the shoulder. It has been 2.6 against a lift of 1.1, 3.0 against 1.5
 * and 4.5 against 3.0, which is the same 1.5 of burial every time.
 */
const SHOULDER_DROP = RIBBON_LIFT + 1.5;
/** And how far out, as a multiple of the carriageway's own half-width. */
const SHOULDER_SPREAD = 1.8;

/**
 * How far from a road's own centre line the ribbon reaches, in world units.
 *
 * Half the *drawn* strip and not half the carriageway: the shoulders are laid
 * below the ground so they bury themselves, and what a plant standing on one
 * would push up through is the crown plus however much of the shoulder the
 * relief lets show. 7.4 for a lane, 11.5 for a road, 16.2 for a trunk.
 *
 * Exported because `vegetation.ts` is the one file that has to keep something
 * off a road, and half a road's width is a fact about the road. What it adds to
 * this is the plant's own footprint, which is a fact about the plant — so the
 * verge a wood keeps is a sum of the two and neither file states the other's
 * half.
 */
export function roadClearance(cls: number): number {
  const style = ROAD_CLASSES[cls] ?? ROAD_CLASSES[0]!;
  return style.width * 0.5 * SHOULDER_SPREAD;
}

/** Which roads pass near a patch of ground; see `createRoadIndex`. */
export interface RoadIndex {
  /**
   * Indices into the road list, of every road whose curve could come within
   * `radius` world units of `direction`. Appended to `out`, which is cleared.
   */
  near(direction: THREE.Vector3, radius: number, out: number[]): number[];
}

/**
 * A lat/lon grid over the network, so a tile can ask which roads cross it.
 *
 * **The scan it exists to prevent is plants times roads.** `vegetation.ts` has
 * to keep a wood off a carriageway and it holds a couple of hundred plants
 * against 17,238 roads; testing the second against the first is the wrong way
 * round, and so is testing every road against every tile — at 17,238 dot
 * products a tile that is a fifth of a millisecond, against a whole tile build
 * of 1.2. So a road is bucketed on its own middle, exactly as the streamer's
 * own tiles are, and a query walks the block of cells a road of the longest
 * possible reach could have arrived from.
 *
 * The bound per road is the angle from its middle to the furthest of nine
 * points along its course, plus a sixteenth of its length for whatever the
 * curve does between two of them. It used to be the two endpoints alone — a
 * bow is a bulge with its apex at the middle, so the ends were the extreme —
 * and a course through a gate that faces away from the far town swings out
 * past its own end, so they are not any more.
 */
/**
 * The one index over the shipped network, built once and shared.
 *
 * Two files have to keep something off a carriageway now — `vegetation.ts` a
 * plant and `life.ts` a herd — and the index is **13 ms and a bucket per road**
 * over 17,238 of them (2026-09-08). Building it twice is that cost paid again
 * for an identical answer, so the second caller gets the first one's. Keyed on
 * the arrays themselves rather than on a flag: `main.ts` hands the same pruned
 * list to both, and a caller that arrives with a *different* network — a check
 * script, a re-bake — gets its own rather than the wrong one.
 */
let sharedIndex: { roads: readonly Road[]; places: readonly Place[]; index: RoadIndex } | null = null;

export function roadIndexFor(roads: readonly Road[], places: readonly Place[]): RoadIndex {
  if (sharedIndex !== null && sharedIndex.roads === roads && sharedIndex.places === places) {
    return sharedIndex.index;
  }
  const index = createRoadIndex(roads, places);
  sharedIndex = { roads, places, index };
  return index;
}

export function createRoadIndex(roads: readonly Road[], places: readonly Place[]): RoadIndex {
  const CELL = 4;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const middle = new Float64Array(roads.length * 3);
  /** Angle from the middle to the far end, in radians. */
  const half = new Float64Array(roads.length);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const course = emptyCourse();
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();
  let widest = 0;

  roads.forEach((road, i) => {
    courseOf(road, places, course);
    coursePoint(course, 0.5, mid);
    middle[i * 3] = mid.x;
    middle[i * 3 + 1] = mid.y;
    middle[i * 3 + 2] = mid.z;
    let reach = 0;
    for (let k = 0; k <= 8; k++) reach = Math.max(reach, mid.angleTo(coursePoint(course, k / 8, at)));
    reach += course.length / 16 / PLANET_RADIUS;
    half[i] = reach;
    if (reach > widest) widest = reach;
    const lat = Math.asin(Math.min(1, Math.max(-1, mid.y))) / DEG;
    const lon = Math.atan2(-mid.z, mid.x) / DEG;
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
    const col = ((Math.floor((lon + 180) / CELL) % COLS) + COLS) % COLS;
    grid[row * COLS + col]!.push(i);
  });

  const widestUnits = widest * PLANET_RADIUS;

  return {
    near(direction, radius, out) {
      out.length = 0;
      const lat = Math.asin(Math.min(1, Math.max(-1, direction.y))) / DEG;
      const lon = Math.atan2(-direction.z, direction.x) / DEG;
      const span = (radius + widestUnits) / UNITS_PER_DEGREE;
      const rowSpan = Math.ceil(span / CELL);
      // The longitude span of a cell shrinks with the cosine, which is what
      // stops a query near the poles from sweeping a band thousands of units
      // wide; the same guard `proximityGraph` uses, for the same reason.
      const colSpan = Math.ceil(span / Math.max(0.02, Math.cos(lat * DEG)) / CELL);
      const row0 = Math.max(0, Math.floor((90 - lat) / CELL) - rowSpan);
      const row1 = Math.min(ROWS - 1, Math.floor((90 - lat) / CELL) + rowSpan);
      const col = Math.floor((lon + 180) / CELL);
      const angle = radius / PLANET_RADIUS;
      for (let r = row0; r <= row1; r++) {
        for (let c = col - colSpan; c <= col + colSpan; c++) {
          if (colSpan * 2 + 1 >= COLS && c > col - colSpan + COLS - 1) break;
          for (const i of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
            const dot =
              direction.x * middle[i * 3]! +
              direction.y * middle[i * 3 + 1]! +
              direction.z * middle[i * 3 + 2]!;
            if (Math.acos(Math.min(1, Math.max(-1, dot))) - half[i]! <= angle) out.push(i);
          }
        }
      }
      return out;
    },
  };
}

/**
 * Degrees of latitude and longitude in one streaming tile.
 *
 * A road is not a slot the way a town is: 9,000 meshes is 9,000 draw calls and
 * the merge that made a town one call is the whole reason settlements are
 * affordable. So the unit of streaming is a patch of the planet and every road
 * whose middle falls in it. Four degrees is 1,116 units at the equator — about
 * the length of the longest roads, so a tile's bounding sphere stays tight
 * enough for the frustum test to mean something.
 */
const TILE = 4;
const TILE_COLS = Math.round(360 / TILE);
const TILE_ROWS = Math.round(180 / TILE);

/** Triangles of resident road. `OutlineEffect` draws them twice. */
const TRIANGLE_BUDGET = 260_000;
const triangleBudget = (): number => detailArea(TRIANGLE_BUDGET);
/** Milliseconds of building allowed in one frame. Same law as the settlements. */
const BUILD_BUDGET_MS = 3;
/** How far the viewer moves, or turns, before the candidate list is worked out again. */
const RESCAN_MOVE = 90;
const RESCAN_TURN = 8 * DEG;
/**
 * Roads inside this of the camera are built whatever it is pointed at.
 *
 * A mouse flick is 180 degrees in a tenth of a second and no frustum margin
 * covers it, so spinning on the spot cannot delete the road you are standing
 * on. The number was derived as the reach of a settlement's own tracks plus the
 * longest span a near tile uses; the tracks are gone (2026-09-13) and it has
 * not been re-derived since.
 */
const KEEP_ALL_WITHIN = 620;
/** Fixed, not scaled: see the same constant in `settlements.ts` for why. */
const keepAllWithin = (): number => KEEP_ALL_WITHIN;

/**
 * How far along the ground a road is worth drawing, before its class has its
 * say. The horizon, doubled, the same shape `settlements.ts` uses — and the
 * class reach in `ROAD_CLASSES` is what actually binds for everything but a
 * trunk.
 */
function reachFor(altitude: number): number {
  return Math.min(fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(Math.min(34000, Math.max(2600, horizonAt(altitude, PLANET_RADIUS) * 2))));
}

export interface RoadStats {
  /** Tiles standing. */
  resident: number;
  /** Tiles wanted and waiting for a frame with room. */
  pending: number;
  /** Roads drawn, across every resident tile. */
  roads: number;
  triangles: number;
  megabytes: number;
  built: number;
  lastBuildMs: number;
  /** Ground reach, and the slant distance actually compared against. */
  reach: number;
  range: number;
}

export interface Roads {
  group: THREE.Group;
  stats: RoadStats;
  /**
   * Every road in `roads.bin`, which is every road that is drawn: the bake
   * joins the built towns and there is no load-time pass left. For the console
   * and for `check-world.ts`.
   */
  all: readonly Road[];
  /** Degree of every place in the graph, for the console. */
  degrees(): { mean: number; max: number; isolated: number; histogram: number[] };
  /**
   * How high the carriageway rides here, as a radius from the planet's centre,
   * or 0 if this point is not on one. See `ribbonHeightAt` inside.
   */
  ribbonHeightAt(point: THREE.Vector3): number;
  /** Call each frame. The camera is optional; without one, admission is a radius. */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
}

/**
 * How far out the ribbon's crown holds its full lift, and where the shoulder
 * has carried it back down to the ground, as multiples of the carriageway's own
 * half-width.
 *
 * **Read off the drawn geometry rather than chosen.** A cross-section is four
 * points: the crown at `±half` sits at `RIBBON_LIFT` and the shoulder at
 * `±half * SHOULDER_SPREAD` sits at `RIBBON_LIFT - SHOULDER_DROP`, which is 1.5
 * *below* the relief. The straight line between them crosses the ground where
 * the lift has been used up, which is `RIBBON_LIFT / SHOULDER_DROP` of the way
 * out — so the surface a foot stands on runs from full lift at 1.0 of the
 * half-width to nothing at 1.533 of it, and the ramp is a fact about the road
 * rather than a courtesy to the player. That is why a kerb needs `KERB_BLEND`
 * and a road does not.
 *
 * **The ratio is not a half any more and the arithmetic never was one.** At a
 * lift of 1.5 the drop was 3.0 and the crossing landed exactly half way, at
 * 1.400; at 3.0 against 4.5 it is two thirds of the way, at 1.533. The formula
 * is unchanged — it was already written as the ratio — and this is the sentence
 * that used to say "half" and would have been wrong.
 *
 * **Exported, because `pnpm check` had this arithmetic written out longhand**:
 * `half * (1 + 0.8 * (RIBBON_LIFT / (RIBBON_LIFT + 1.5)))`, which is two files
 * answering "where does the drawn shoulder cross the ground?" and therefore two
 * chances to disagree the next time either constant moves.
 */
export const CROWN_FALL = 1 + (SHOULDER_SPREAD - 1) * (RIBBON_LIFT / SHOULDER_DROP);

/**
 * How far the crown stands over the relief at one point of a road, `sA` and
 * `sB` units along it from its two gates.
 *
 * **The one definition of a road's height**, and every surface that has to
 * agree about it asks here: the ribbon's own sections (`ribbonSection`), the
 * foot (`ribbonHeightAt`), the traffic's wheels and the walkers on the verge
 * (`life.ts`), and `pnpm check`. `ground` is the relief under the point and
 * `centre` the relief under the centre line at the same distance along; only
 * their difference is read, so they may be radii or elevations alike.
 *
 * Three terms:
 *
 * - `RIBBON_LIFT`, which is the whole of it away from the gates.
 * - Each gate's `rise` (`rampOf`), decaying at `RAMP_GRADE` from its whole
 *   value at the kerb to nothing, so the centre line arrives at exactly
 *   `gateLevel + GROUND_LIFT`.
 * - And the cross-slope, levelled out over the approach: at the kerb it is
 *   taken off in full — `ground - centre` subtracted — because the paving the
 *   crown meets is level, and a crown that followed the hill across its own
 *   width would stand over the kerb at one corner and under it at the other.
 *   By the end of the approach the section follows the hill again.
 *
 * So at a kerb every point of the crown is at the paving's own height, and a
 * body walking in off the road steps onto the surface it left.
 */
export function crownLift(ramp: RoadRamp, sA: number, sB: number, ground: number, centre: number): number {
  const lift = RIBBON_LIFT + riseLeft(ramp.riseA, sA) + riseLeft(ramp.riseB, sB);
  return lift - (levelling(ramp.levelA, sA) + levelling(ramp.levelB, sB)) * (ground - centre);
}

/** Whether `crownLift` reads `centre` here at all: only over an approach into a built town. */
export function needsCentre(ramp: RoadRamp, sA: number, sB: number): boolean {
  return levelling(ramp.levelA, sA) + levelling(ramp.levelB, sB) > 0;
}

/**
 * The crown's half-width at a point: the class's own `half`, narrowed over
 * each approach to the street its gate opens onto (`streetHalf`), from nothing
 * at the end of the approach to all of it at the kerb. A road narrower than its
 * street keeps its own width.
 */
export function ribbonHalf(ramp: RoadRamp, half: number, sA: number, sB: number): number {
  const a = ramp.narrowA < half ? half - (half - ramp.narrowA) * levelling(ramp.levelA, sA) : half;
  const b = ramp.narrowB < half ? half - (half - ramp.narrowB) * levelling(ramp.levelB, sB) : half;
  return Math.min(a, b);
}

/**
 * The surface a foot or a wheel stands on, `lateral` units off the centre line,
 * as a lift over `ground`: zero or less means off the road.
 *
 * The drawn section read back — see `ribbonSection` — so there is nothing to
 * tune: the crown at `crownLift` out to `ribbonHalf`, then the shoulder's
 * straight line down to `RIBBON_LIFT - SHOULDER_DROP` at `SHOULDER_SPREAD`
 * times the half-width. Where the crown has its ordinary lift that line crosses
 * the ground at `CROWN_FALL` of the half-width, as it always did; where a ramp
 * has lifted it onto an embankment it crosses further out, which is the
 * embankment's own side.
 */
export function surfaceLift(
  ramp: RoadRamp,
  half: number,
  sA: number,
  sB: number,
  lateral: number,
  ground: number,
  centre: number,
): number {
  const crown = ribbonHalf(ramp, half, sA, sB);
  const edge = crownLift(ramp, sA, sB, ground, centre);
  const away = Math.abs(lateral);
  if (away <= crown) return edge;
  const shoulder = crown * SHOULDER_SPREAD;
  const foot = RIBBON_LIFT - SHOULDER_DROP;
  if (away >= shoulder) return foot;
  return edge + ((away - crown) / (shoulder - crown)) * (foot - edge);
}

/**
 * Where a ribbon's cross-sections stand, as distances from gate A, for pieces
 * of at most `span`.
 *
 * Every break in the height law is a station, so what is drawn is the law and
 * not a chord across one of its corners: both kerbs, both ends of the approach
 * (where the levelling and the narrowing stop), and where each ramp runs out.
 * Between those the pieces are equal. The first and the last are exactly 0 and
 * `length`, which `parameterAt` turns into exactly the two gates.
 */
export function ribbonStations(
  length: number,
  approach: number,
  ramp: RoadRamp,
  span: number,
  out: number[],
): number[] {
  const marks = [0, length, approach, length - approach, rampReach(ramp.riseA), length - rampReach(ramp.riseB)]
    .filter((s) => s >= 0 && s <= length)
    .sort((x, y) => x - y);
  out.length = 0;
  let last = 0;
  for (const mark of marks) {
    if (out.length > 0 && mark - last < 1e-6) continue;
    if (out.length > 0) {
      const pieces = Math.max(1, Math.ceil((mark - last) / span));
      for (let k = 1; k < pieces; k++) out.push(last + ((mark - last) * k) / pieces);
    }
    out.push(mark);
    last = mark;
  }
  out[out.length - 1] = length;
  return out;
}

const sectionAt = new THREE.Vector3();
const sectionAhead = new THREE.Vector3();
const sectionSide = new THREE.Vector3();

/**
 * One cross-section of a road's ribbon, `s` units along it from gate A, as four
 * points from the left shoulder to the right: shoulder, crown edge, crown edge,
 * shoulder.
 *
 * The direction across is taken from the course's own tangent at that point
 * rather than from the pieces either side of it, so the two pieces meeting at a
 * section agree about where its corners are and the ribbon has no seam down
 * it — and at a gate that tangent is the approach's own direction, so the end
 * section lies along the kerb line and the ribbon neither overlaps the square
 * nor stops short of it. The height is asked at each point rather than shared
 * across the section, so a road on a cross-slope follows the hill instead of
 * standing proud of it on the downhill side: four `elevationAt` calls a
 * section, five on an approach, and it is the whole cost of building a road.
 * `half` is the class's half-width with the band's taper already applied.
 */
export function ribbonSection(
  world: World,
  course: RoadCourse,
  path: CoursePath,
  ramp: RoadRamp,
  half: number,
  s: number,
  into: readonly THREE.Vector3[],
): void {
  const t = parameterAt(path, s);
  coursePoint(course, t, sectionAt);
  courseTangent(course, t, sectionAhead);
  sectionSide.crossVectors(sectionAt, sectionAhead).normalize();
  const sB = path.length - s;
  const crown = ribbonHalf(ramp, half, s, sB);
  const shoulder = crown * SHOULDER_SPREAD;
  const centre = needsCentre(ramp, s, sB) ? world.elevationAt(sectionAt) : 0;
  for (let k = 0; k < 4; k++) {
    const offset = k === 0 ? -shoulder : k === 1 ? -crown : k === 2 ? crown : shoulder;
    const target = into[k]!;
    target.copy(sectionAt).addScaledVector(sectionSide, offset / PLANET_RADIUS).normalize();
    const ground = world.elevationAt(target);
    const lift = k === 0 || k === 3 ? RIBBON_LIFT - SHOULDER_DROP : crownLift(ramp, s, sB, ground, centre);
    target.multiplyScalar(PLANET_RADIUS + ground + lift);
  }
}

interface Tile {
  /** Indices into `roads`. */
  members: number[];
  /** Unit vector at the middle of the tile's roads, and a radius that covers them. */
  centre: THREE.Vector3;
  anchor: THREE.Vector3;
  bound: number;
  mesh: THREE.Mesh | null;
  /** The band this tile is currently built for, or -1 if it is not built. */
  band: number;
  /**
   * And which of its members were admitted when it was, as a hash; see `scan`.
   *
   * **The rebuild key is the admitted *set* and not a bound on it.** It used to
   * be a *class cut*: a conservative question about the whole tile — a class was
   * only dropped when no road in it could pass that class — with the fine work
   * done per road inside `raise`, which meant a tile went on drawing whatever it
   * was built with until its cut moved. The exact key costs one FNV pass over
   * the tile's members per scan and it is what lets a road appear the frame the
   * eye comes into its reach rather than the frame the tile's cut happens to
   * change. 0 means it is not built.
   */
  sign: number;
  /** Roads it actually drew, which is not `members.length` once the LOD bites. */
  drawn: number;
  triangles: number;
  bytes: number;
}

export function createRoads(world: World, places: readonly Place[], data: RoadData): Roads {
  const group = new THREE.Group();
  group.name = 'roads';

  // **Not a warning, a refusal.** The graph stores endpoints as indices into
  // `places.bin`, so a road baked against a different list of places joins two
  // arbitrary towns — and it would look plausible, because every road in the
  // world would still be a road between two real settlements. `pnpm check`
  // asserts the same thing; this is the runtime half of it.
  if (data.places !== places.length) {
    throw new Error(
      `roads.bin was baked against ${data.places} places and there are ${places.length}. Run \`pnpm roads\`.`,
    );
  }

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
  });
  // No ink hull, for the same reason `borders.ts` has none: a road is a mark on
  // the ground rather than an object standing on it, and an outline round a
  // ribbon whose edges are meant to dissolve into the verge is the one thing
  // that would make it read as a strip of tape laid over the world.
  material.userData.outlineParameters = { visible: false };
  // Each road's depth layer, pushed back after projection: see `LAYER_DEPTH`.
  // `OutlineEffect` builds its own program and ignores this, and that is fine
  // here and nowhere else — a road has no ink hull for it to build.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float roadLayer;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n\tgl_Position.z += roadLayer * ${LAYER_DEPTH.toExponential(3)} * gl_Position.w;`,
      );
  };
  material.customProgramCacheKey = () => 'roads:layers';

  const scratch = new THREE.Vector3();
  const roads = data.roads;
  /** Every road's course and path, cached and shared with the wood, the herd and the traffic. */
  const geometry = roadGeometryFor(roads, places);

  /**
   * Per road, once: its middle, how far its course reaches from it, its length,
   * and the three points it is priced at.
   *
   * **Worked out from the course and not from the two places**, because the
   * road no longer runs between the two places: it runs between two gates, and a
   * gate that faces away from the far town swings the road out past its own
   * end. So the middle is the course's `t = 0.5`, the reach is the widest of
   * nine points along it from there plus a sixteenth of its length for what
   * the curve does between two of them, and the three price points are the two
   * gates and the middle. The course is a scratch here — building the network's
   * seventeen thousand of them takes a few tens of milliseconds and keeping them
   * would be several megabytes of vectors nothing reads again.
   */
  const middles = new Float64Array(roads.length * 3);
  const lengths = new Float64Array(roads.length);
  const reachOf = new Float64Array(roads.length);
  /**
   * The three points a road is priced at, on the sea-level sphere.
   *
   * **Three and not one, because a road is up to a thousand units long and its
   * middle is not what you are looking at.** They are a pure function of the
   * network, so they are worked out once here: 72 bytes a road against a
   * course per road per rescan. Sampled at sea level rather than on the relief
   * because the tallest ground on the planet is 620 units against the shortest
   * reach this is compared to, which is a couple of percent of a decision that
   * is already a step function.
   */
  const samples = new Float64Array(roads.length * 9);
  {
    const course = emptyCourse();
    const mid = new THREE.Vector3();
    const at = new THREE.Vector3();
    roads.forEach((road, i) => {
      courseOf(road, places, course);
      coursePoint(course, 0.5, mid);
      middles[i * 3] = mid.x;
      middles[i * 3 + 1] = mid.y;
      middles[i * 3 + 2] = mid.z;
      lengths[i] = course.length;
      let reach = 0;
      for (let k = 0; k <= 8; k++) reach = Math.max(reach, mid.angleTo(coursePoint(course, k / 8, at)));
      reachOf[i] = reach + course.length / 16 / PLANET_RADIUS;
      for (const [k, v] of [course.gateA, course.gateB, mid].entries()) {
        samples[i * 9 + k * 3] = v.x * PLANET_RADIUS;
        samples[i * 9 + k * 3 + 1] = v.y * PLANET_RADIUS;
        samples[i * 9 + k * 3 + 2] = v.z * PLANET_RADIUS;
      }
    });
  }
  const readMiddle = (index: number, target: THREE.Vector3): THREE.Vector3 =>
    target.set(middles[index * 3]!, middles[index * 3 + 1]!, middles[index * 3 + 2]!);

  /**
   * Each road's `RoadRamp`, cached: two `gateLevel`s and two `elevationAt`s a
   * road, which is nothing once and a lot per frame. Bounded, and emptied when
   * the prominence knob turns, because a ramp only climbs into a town that is
   * built and `isShown` is live.
   */
  const ramps = new Map<number, RoadRamp>();
  const rampFor = (index: number): RoadRamp => {
    let found = ramps.get(index);
    if (found === undefined) {
      found = rampOf(roads[index]!, geometry.course(index), places, world);
      if (ramps.size >= GEOMETRY_CAP) ramps.clear();
      ramps.set(index, found);
    }
    return found;
  };

  // ------------------------------------------------------------------
  // Tiles
  // ------------------------------------------------------------------

  const tiles = new Map<number, Tile>();
  const point = new THREE.Vector3();

  roads.forEach((_, i) => {
    readMiddle(i, point);
    const lat = Math.asin(Math.min(1, Math.max(-1, point.y))) / DEG;
    const lon = Math.atan2(-point.z, point.x) / DEG;
    const row = Math.min(TILE_ROWS - 1, Math.max(0, Math.floor((90 - lat) / TILE)));
    const col = ((Math.floor((lon + 180) / TILE) % TILE_COLS) + TILE_COLS) % TILE_COLS;
    const key = row * TILE_COLS + col;
    let tile = tiles.get(key);
    if (tile === undefined) {
      tile = {
        members: [],
        centre: new THREE.Vector3(),
        anchor: new THREE.Vector3(),
        bound: 0,
        mesh: null,
        band: -1,
        sign: 0,
        drawn: 0,
        triangles: 0,
        bytes: 0,
      };
      tiles.set(key, tile);
    }
    tile.members.push(i);
    tile.centre.add(point);
  });

  const list = [...tiles.values()];
  for (const tile of list) {
    tile.centre.normalize();
    // The bound has to cover the whole of every course, not the middles the
    // tile was bucketed on: a road is up to a thousand units long and both of
    // its ends can sit outside the tile it belongs to. A frustum test against a
    // sphere that only covers the middles culls a road whose visible half is on
    // screen.
    let reach = 0;
    for (const i of tile.members) reach = Math.max(reach, tile.centre.angleTo(readMiddle(i, point)) + reachOf[i]!);
    tile.bound = reach * PLANET_RADIUS + 60;
    tile.anchor.copy(tile.centre).multiplyScalar(groundRadius(world, scratch.copy(tile.centre).multiplyScalar(PLANET_RADIUS)));
  }

  // ------------------------------------------------------------------
  // Which routes are worth drawing
  // ------------------------------------------------------------------

  /** Set by `scan`: whether each road is close enough to be worth drawing. */
  const roadDrawn = new Uint8Array(roads.length);

  // ------------------------------------------------------------------
  // Building one tile
  // ------------------------------------------------------------------

  /**
   * The region at one end of a road, cached per place.
   *
   * `regionFor` is a table lookup and a latitude test, so this is not about
   * speed — it is about asking `world.countries` for a continent once per place
   * instead of once per road per rebuild, which is 25,578 lookups every time a
   * band changes.
   */
  const continentOf = new Map<string, string>(
    world.countries.map((country) => [country.iso, country.continent]),
  );
  const regions = new Array<ReturnType<typeof regionFor> | undefined>(places.length);
  const regionOf = (index: number) => {
    let found = regions[index];
    if (found === undefined) {
      const place = places[index]!;
      found = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat);
      regions[index] = found;
    }
    return found;
  };

  /**
   * Where the eye was at the last scan.
   *
   * The camera and not the player, because the class reach is a statement about
   * how far a mark is from the thing looking at it — and the two are the same
   * on foot and thousands of units apart the moment the rig pulls back. Held
   * here rather than passed down because the queue outlives the scan that
   * filled it and every tile in it was priced against this one position.
   */
  const eye = new THREE.Vector3();
  /** And what each class was worth at that scan; see `classReaches`. */
  const reaches = [0, 0, 0];
  const crown = new THREE.Color();
  /** The carriageway's own edge, a tone of the crown; see where it is set. */
  const kerb = new THREE.Color();
  const verge = new THREE.Color();
  const ground = new THREE.Color();
  const ink = new THREE.Color(0x2a1410);

  /**
   * Which roads are worth drawing from where the eye is now.
   *
   * **The whole network at once, and it is the cheapest half of a scan.** A road
   * is drawn when its *nearest* of three sample points is inside its class's
   * reach — three squared distances, no square roots and no trigonometry — and
   * the answer is global rather than per tile, so two tiles that share a
   * junction cannot disagree about what is drawn near it.
   *
   * **It used to be per *route*, and the graph that needed that is gone.** When
   * `roads.bin` was baked over the whole gazetteer a junction could stand on a
   * place `isShown` does not build: two roads meeting there had distances
   * differing by their own length, so one was drawn and the other was not and
   * the carriageway ended in a field with nothing to explain it. The network is
   * baked over the **built** towns now (see `builtGraph`), so every junction is
   * a town you can walk into and a road that stops at one stops at something.
   *
   * The reach is a *class* table and not a pixel test, for the reason
   * `ROAD_CLASSES` gives.
   */
  function priceRoads(): void {
    for (let i = 0; i < roads.length; i++) {
      const reach = reaches[roads[i]!.cls] ?? reaches[0]!;
      const limit = reach * reach;
      let drawn = 0;
      for (let k = 0; k < 3; k++) {
        const dx = samples[i * 9 + k * 3]! - eye.x;
        const dy = samples[i * 9 + k * 3 + 1]! - eye.y;
        const dz = samples[i * 9 + k * 3 + 2]! - eye.z;
        if (dx * dx + dy * dy + dz * dz <= limit) {
          drawn = 1;
          break;
        }
      }
      roadDrawn[i] = drawn;
    }
  }

  function raise(tile: Tile, band: number, sign: number): void {
    const span = SPANS[band]!.span;
    const positions: number[] = [];
    const colors: number[] = [];
    /** Each vertex's road's depth layer; see `LAYER_DEPTH`. */
    const layers: number[] = [];
    let layer = 0;
    let drawn = 0;

    const push = (p: THREE.Vector3, c: THREE.Color): void => {
      positions.push(p.x, p.y, p.z);
      colors.push(c.r, c.g, c.b);
      layers.push(layer);
    };
    const quad = (
      p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
      c0: THREE.Color, c1: THREE.Color,
    ): void => {
      push(p0, c0); push(p1, c0); push(p2, c1);
      push(p0, c0); push(p2, c1); push(p3, c1);
    };

    // One cross-section is four points; the piece between two of them is three
    // quads. `near` is rolled into `far` each step, so every point is placed on
    // the ground exactly once however many pieces share it.
    const near = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const far = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const stations: number[] = [];

    for (const index of tile.members) {
      const road = roads[index]!;
      const style = ROAD_CLASSES[road.cls] ?? ROAD_CLASSES[0]!;
      // The level of detail, and it has to be applied *here* rather than only in
      // the table it is written in. The first version admitted a tile and then
      // drew everything in it, so `ROAD_CLASSES[].reach` documented a
      // level-of-detail scheme that did not exist: at 6,000 units up the
      // streamer held 10,057 roads and 818 draw calls, nearly all of them lanes
      // between villages three pixels apart. It is per road and from the eye —
      // see `priceRoads` — and `tile.sign` is what rebuilds a tile when the
      // drawn set moves.
      if (roadDrawn[index] === 0) continue;
      drawn++;
      layer = road.layer;
      // Gate to gate, on the course the bake tested: nothing is clipped,
      // because nothing of a road is inside a square to begin with.
      const course = geometry.course(index);
      const path = geometry.path(index);
      const ramp = rampFor(index);
      const half = style.width * 0.5 * (BAND_WIDTH[band] ?? 1);

      /**
       * The surface, sampled once per road at its middle.
       *
       * **Every road drawn is made ground.** It takes the region's own
       * carriageway colour — the same `GroundStyle.road` the streets inside the
       * towns at either end are paved with, so a road entering a town continues
       * rather than changing surface at the sign — and a trunk is that same
       * surface worn darker by what runs on it.
       *
       * There used to be a third answer here: a `lane` was drawn as a dirt
       * track, `dirt(ground)`, the local ground shifted to brown. It was the
       * right colour for the wrong object — *¿son caminos? Fuera, solo
       * carreteras* — and what the user wanted was **one material**, so a lane
       * is drawn in the same made surface as everything else and is narrower.
       * The branch is gone rather than unreachable.
       *
       * The region comes from the road's own end rather than from the ground it
       * crosses, because a carriageway is a thing people built and `regions.ts`
       * is where the kit keeps who built it.
       */
      readMiddle(index, point);
      groundColorAt(world, scratch.copy(point).multiplyScalar(PLANET_RADIUS), ground);
      crown.setHex(groundStyleFor(regionOf(road.a).id).road);
      if (road.cls === 2) crown.lerp(ink, 0.12);
      trodden(ground, verge);
      /**
       * The edge of the carriageway, and it costs **no triangle at all**.
       *
       * The user asked for a road that reads as more than one flat band, and the
       * obvious way to do it — a narrower crown strip inside the carriageway, or
       * a dashed line down the middle — needs two more points in every
       * cross-section, which is ten triangles a section against six: **+67% of
       * the whole network's geometry**, against a 260,000 triangle budget that
       * already binds at altitude, for a mark 1.2 units wide that stops
       * resolving at about sixty units. So the two tones are put where the
       * section already has a vertex: the shoulder quads carry `kerb` at the
       * carriageway's edge instead of the crown's own colour, and the crown quad
       * keeps it.
       *
       * The buffers are non-indexed, so the two quads meeting at ±half do not
       * share vertices and the step is a **hard line** rather than a gradient —
       * which is the whole point, and is why this reads at the distance a
       * Gouraud ramp across half a carriageway would not. Geometrically that
       * line is where the shoulder starts dropping, so the tone is drawing an
       * edge that is really there.
       *
       * A tone of the crown and not a neutral, for `GROUND_STYLES`' own reason:
       * a dark neutral band on the ground is what a *shadow* looks like in this
       * scene. `ink` is a warm brown and the mix is small.
       */
      kerb.copy(crown).lerp(ink, 0.26);

      // The stations are measured along the path, so a section is still at
      // most `span` units long, both ends land exactly on the two kerbs, and
      // every break in the height law — the end of an approach, the end of a
      // ramp — is a section rather than a chord across it. See
      // `ribbonStations` and `ribbonSection`, which `pnpm check` walks too.
      ribbonStations(path.length, course.approach, ramp, span, stations);
      ribbonSection(world, course, path, ramp, half, stations[0]!, near);
      for (let k = 1; k < stations.length; k++) {
        ribbonSection(world, course, path, ramp, half, stations[k]!, far);
        quad(near[0]!, far[0]!, far[1]!, near[1]!, verge, kerb);
        quad(near[1]!, far[1]!, far[2]!, near[2]!, crown, crown);
        quad(near[2]!, far[2]!, far[3]!, near[3]!, kerb, verge);
        for (let j = 0; j < 4; j++) near[j]!.copy(far[j]!);
      }
    }

    // A tile none of whose roads made it into the mesh is *built* — it is
    // built as nothing. Leaving `band` at -1 would put it back
    // in the queue on every scan for as long as the viewer stood still.
    tile.band = band;
    tile.sign = sign;
    if (positions.length === 0) return;
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    buffer.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    buffer.setAttribute('roadLayer', new THREE.Float32BufferAttribute(layers, 1));
    buffer.computeVertexNormals();
    buffer.computeBoundingSphere();

    const mesh = new THREE.Mesh(buffer, material);
    mesh.name = `roads:${tile.members.length}`;
    // A mark on the ground takes the ground's shadows; it casts none.
    mesh.receiveShadow = true;
    group.add(mesh);
    tile.mesh = mesh;
    tile.triangles = positions.length / 9;
    tile.bytes = (positions.length * 2 + layers.length) * 4;
    tile.drawn = drawn;
  }

  function drop(tile: Tile): void {
    if (tile.mesh === null) return;
    group.remove(tile.mesh);
    // The geometry is this tile's; the material is shared by every road on the
    // planet and disposing it would blank all of them.
    tile.mesh.geometry.dispose();
    tile.mesh = null;
    tile.band = -1;
    tile.sign = 0;
    tile.drawn = 0;
    tile.triangles = 0;
    tile.bytes = 0;
  }

  // ------------------------------------------------------------------
  // The streamer
  // ------------------------------------------------------------------

  const stats: RoadStats = {
    resident: 0,
    pending: 0,
    roads: 0,
    triangles: 0,
    megabytes: 0,
    built: 0,
    lastBuildMs: 0,
    reach: 0,
    range: 0,
  };

  let wanted: Tile[] = [];
  let queue: { tile: Tile; band: number; sign: number }[] = [];
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  /** Turning the knob forces a rescan; nothing else can see that it moved. */
  let scannedDetail = -1;
  /**
   * And so does the prominence knob: `rampOf` asks `isShown`, so
   * `atlas.prominence(0)` changes which gates a ribbon climbs to. The
   * *network* does not follow it at all — `roads.bin` is a graph over the
   * places that were built when it was baked, and its gates are baked with it,
   * so the knob is a re-bake and not a reload — but the climb is live, and a
   * stale one would leave a ribbon ramping up to the paving of a town that is
   * no longer built.
   */
  let scannedProminence = -1;
  const cone = createViewCone(keepAllWithin);

  /**
   * The admitted members of a tile, as a hash, and 0 for none of them.
   *
   * **The rebuild key, and it is the drawn set itself rather than a bound on
   * it.** The key used to be a class cut — the tile's *nearest possible* road
   * against the class table — and the fine per-road test ran inside `raise`, so
   * a tile went on drawing whatever it was built with until its cut moved. That
   * was tolerable when the test was per road and it is not now that it is per
   * route: a unit spanning two tiles would be drawn by the one that happened to
   * be rebuilt. FNV-1a over the admitted indices, in `members` order, so a swap
   * of one road for another shows where a count would not.
   */
  function signOf(tile: Tile): number {
    let sign = 2166136261;
    let count = 0;
    for (const index of tile.members) {
      if (roadDrawn[index] === 0) continue;
      count++;
      sign = Math.imul(sign ^ (index + 1), 16777619);
    }
    // 0 means "nothing here is worth drawing"; a hash that lands on it is
    // bumped rather than confused with it.
    if (count === 0) return 0;
    return (sign >>> 0) || 1;
  }

  function scan(viewer: THREE.Vector3, altitude: number): void {
    const reach = reachFor(altitude);
    // The eye, for the spans and the classes; the *player* still decides how
    // far the streamer reaches, which is what `slantRange` is for. Without a
    // camera the two are the same thing, which is the honest fallback and is
    // what `check-world.ts` gets.
    eye.copy(cone.active ? cone.apex : viewer);
    classReaches(reaches);
    priceRoads();
    const candidates: { tile: Tile; distance: number; band: number; sign: number }[] = [];
    for (const tile of list) {
      const distance = tile.anchor.distanceTo(viewer);
      if (distance - tile.bound > slantRange(altitude, reach)) continue;
      const admitted = tile.band >= 0
        ? cone.keeps(tile.anchor, tile.bound)
        : cone.admits(tile.anchor, tile.bound);
      if (!admitted) continue;
      const sign = signOf(tile);
      // Nothing in it is worth drawing from here. It is dropped rather than
      // built as nothing, which is where the class cut's early exit used to go.
      if (sign === 0) continue;
      // The band is a chord error and the tile's middle is where it is.
      candidates.push({ tile, distance, band: bandFor(tile.anchor.distanceTo(eye)), sign });
    }
    candidates.sort((x, y) => x.distance - y.distance);

    wanted = [];
    queue = [];
    let triangles = 0;
    const keep = new Set<Tile>();
    for (const candidate of candidates) {
      const cost = candidate.tile.triangles > 0
        ? candidate.tile.triangles
        : estimate(candidate.tile, candidate.band);
      if (triangles + cost > triangleBudget() && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(candidate.tile);
      keep.add(candidate.tile);
      // A tile whose band changed is rebuilt: the spans it was built with are
      // the wrong length for where it is now. So is one whose drawn set changed
      // — a route it was drawing has gone out of reach, or one it was not has
      // come back in.
      if (candidate.tile.band !== candidate.band || candidate.tile.sign !== candidate.sign) {
        queue.push({ tile: candidate.tile, band: candidate.band, sign: candidate.sign });
      }
    }
    for (const tile of list) if (!keep.has(tile)) drop(tile);
  }

  /**
   * Roughly what a tile costs before it is built. Six triangles a span.
   *
   * The course's own estimated length, worked out at load: a path is a few
   * dozen `coursePoint`s a road and this runs over every member of every
   * candidate tile on every rescan, where `raise` runs over one tile that is
   * being built. The stations `raise` adds at the approaches and the ramps are
   * a few sections a road on top of this, which is inside what an estimate is
   * for.
   */
  function estimate(tile: Tile, band: number): number {
    const span = SPANS[band]!.span;
    let total = 0;
    for (const index of tile.members) {
      if (roadDrawn[index] === 0) continue;
      total += Math.max(2, Math.ceil(lengths[index]! / span)) * 6;
    }
    return total;
  }

  // ------------------------------------------------------------------
  // Where the carriageway is, for a foot rather than for a camera
  // ------------------------------------------------------------------

  /**
   * How high the ribbon rides at a point, as a radius, or 0 if the point is not
   * on one.
   *
   * **The player used to walk at `elevationAt` and the ribbon is 3.0 above it,
   * so he waded through every road in the world to the thigh.** This is the half
   * of the answer that belongs to `roads.ts`: the ribbon's own surface at a
   * point, on the terms the ribbon is actually laid — the same course, the same
   * path, the same `crownLift` and the same cross-section — so a foot cannot
   * stand on a road that is not there and a road cannot be drawn where a foot
   * does not find it.
   *
   * Four things about it are deliberate:
   *
   * - **It stops at the kerb.** The course starts and ends on a gate, and the
   *   test below is the ribbon's flat end cap, which lies along the kerb line:
   *   a point inside the square is past the cap and gets nothing here, so
   *   `madeHeightAt` answers there instead, at the same height — the crown
   *   meets the gate's paving at exactly `gateLevel + GROUND_LIFT`.
   * - **The band taper is not applied.** `BAND_WIDTH` narrows the drawn strip
   *   at distance, which is a level of detail; the ground under your feet is
   *   always band 0 and a surface that changed width with the camera's altitude
   *   would be a road you fall off by climbing. The narrowing into a gate *is*
   *   applied, because that is the road's shape and not its level of detail.
   * - **The route's reach is not either**, for the same reason: whether a road
   *   is worth *drawing* from here has nothing to do with whether it is there.
   * - **The ramp is the geometry.** `surfaceLift` is the drawn section read
   *   back: the crown out to its half-width, then the shoulder's line down to
   *   where it crosses the ground. There is no smoothing constant in it.
   *
   * The cost is one grid query — `roadIndexFor`'s, shared with the wood and the
   * herd, so the 13 ms of bucketing is paid once for the planet — a
   * point-to-chord walk over the cached paths of the handful of roads it
   * returns, and one more `elevationAt` when the point is on an approach.
   * Called once a frame from `player.ts`.
   */
  const heightIndex = { index: null as RoadIndex | null };
  const heightHits: number[] = [];
  const heightDir = new THREE.Vector3();
  const heightHere = new THREE.Vector3();
  const heightLast = new THREE.Vector3();
  const heightLeg = new THREE.Vector3();
  const heightFoot = new THREE.Vector3();
  const heightProbe = new THREE.Vector3();
  const heightNearest = new THREE.Vector3();
  /**
   * The widest the surface can be from a centre line: a trunk's whole drawn
   * half-width, shoulder and all. `CROWN_FALL` was enough while the crown
   * always had its ordinary lift; a ramp onto an embankment carries the
   * surface out along the shoulder further than that.
   */
  const WIDEST_HALF = Math.max(...ROAD_CLASSES.map((style) => style.width)) * 0.5 * SHOULDER_SPREAD;

  function ribbonHeightAt(point: THREE.Vector3): number {
    if (roads.length === 0 || places.length === 0) return 0;
    heightIndex.index ??= roadIndexFor(roads, places);
    heightDir.copy(point).normalize();
    heightProbe.copy(heightDir).multiplyScalar(PLANET_RADIUS);
    let best = 0;
    let ground = NaN;
    for (const hit of heightIndex.index.near(heightDir, WIDEST_HALF, heightHits)) {
      const road = roads[hit]!;
      const style = ROAD_CLASSES[road.cls] ?? ROAD_CLASSES[0]!;
      const path = geometry.path(hit);
      let nearest = Infinity;
      let along = 0;
      /**
       * Whether the point is past one of the ribbon's two ends.
       *
       * **A drawn ribbon has a flat cap and a distance to a polyline has a round
       * one**, and the difference is the shoulder's width of ground: without
       * this a foot would be lifted in a half-disc beyond where the carriageway
       * stops, which at a gate is the town's own paving. The test is the
       * unclamped projection onto the first and last chord — before 0 on the
       * first or past 1 on the last means the point is beyond the cap, whatever
       * its distance from the line — and the first and last chords are the two
       * straight approaches, so the cap is the kerb line exactly.
       */
      let pastCap = false;
      const last = path.count - 1;
      for (let k = 0; k <= last; k++) {
        heightHere.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).multiplyScalar(PLANET_RADIUS);
        if (k > 0) {
          heightLeg.subVectors(heightHere, heightLast);
          const lengthSq = heightLeg.lengthSq();
          let raw = 0;
          if (lengthSq > 1e-9) raw = heightFoot.copy(heightProbe).sub(heightLast).dot(heightLeg) / lengthSq;
          const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
          heightFoot.copy(heightLast).addScaledVector(heightLeg, clamped);
          // The chord is a straight line through the sphere and the query point
          // is on its surface, so the distance is measured across the ground:
          // both are projected back out before they are subtracted.
          heightFoot.normalize().multiplyScalar(PLANET_RADIUS);
          const away = heightFoot.distanceTo(heightProbe);
          if (away < nearest) {
            nearest = away;
            along = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * clamped;
            heightNearest.copy(heightFoot);
            pastCap = (k === 1 && raw < 0) || (k === last && raw > 1);
          }
        }
        heightLast.copy(heightHere);
      }
      if (pastCap || nearest >= style.width * 0.5 * SHOULDER_SPREAD) continue;
      const ramp = rampFor(hit);
      if (Number.isNaN(ground)) ground = world.elevationAt(heightDir);
      const centre = needsCentre(ramp, along, path.length - along) ? world.elevationAt(heightNearest) : ground;
      const lift = surfaceLift(ramp, style.width * 0.5, along, path.length - along, nearest, ground, centre);
      if (lift > best) best = lift;
    }
    if (best <= 0) return 0;
    // A road is baked dry, so this cannot fire — and if a re-bake ever puts one
    // in the water, standing on it is not the way to find out.
    return ground <= 0 ? 0 : PLANET_RADIUS + ground + best;
  }

  return {
    group,
    stats,
    all: roads,
    ribbonHeightAt,

    degrees() {
      const count = new Int32Array(places.length);
      for (const road of roads) {
        count[road.a]!++;
        count[road.b]!++;
      }
      const histogram: number[] = [];
      let total = 0;
      let max = 0;
      let isolated = 0;
      for (const value of count) {
        total += value;
        if (value > max) max = value;
        if (value === 0) isolated++;
        histogram[value] = (histogram[value] ?? 0) + 1;
      }
      for (let i = 0; i < histogram.length; i++) histogram[i] = histogram[i] ?? 0;
      return { mean: Number((total / places.length).toFixed(2)), max, isolated, histogram };
    },

    update(viewer, altitude, camera) {
      const reach = reachFor(altitude);
      const range = slantRange(altitude, reach);
      stats.reach = Math.round(reach);
      stats.range = Math.round(range);
      cone.aim(camera);
      // Nothing about a tile's band or cut can see that the towns moved, so the
      // knob drops the geometry outright rather than trusting the rebuild key.
      if (scannedProminence !== prominenceVersion()) {
        for (const tile of list) drop(tile);
        ramps.clear();
        scannedProminence = prominenceVersion();
        scannedAt.set(Infinity, Infinity, Infinity);
      }
      if (
        viewer.distanceToSquared(scannedAt) > RESCAN_MOVE * RESCAN_MOVE ||
        Math.abs(range - scannedRange) > scannedRange * 0.1 ||
        cone.turnFrom(scannedAxis) > RESCAN_TURN ||
        scannedDetail !== detailVersion()
      ) {
        scan(viewer, altitude);
        scannedAt.copy(viewer);
        scannedAxis.copy(cone.axis);
        scannedRange = range;
        scannedDetail = detailVersion();
      }

      if (queue.length > 0) {
        const began = performance.now();
        let built = 0;
        while (queue.length > 0 && performance.now() - began < detailBuild(BUILD_BUDGET_MS)) {
          const next = queue.shift()!;
          if (next.tile.band === next.band && next.tile.sign === next.sign) continue;
          drop(next.tile);
          raise(next.tile, next.band, next.sign);
          built++;
        }
        if (built > 0) {
          stats.lastBuildMs = Number((performance.now() - began).toFixed(2));
          stats.built += built;
        }
      }

      let resident = 0;
      let drawn = 0;
      let triangles = 0;
      let bytes = 0;
      for (const tile of wanted) {
        if (tile.mesh === null) continue;
        resident++;
        drawn += tile.drawn;
        triangles += tile.triangles;
        bytes += tile.bytes;
      }
      stats.resident = resident;
      stats.pending = queue.length;
      stats.roads = drawn;
      stats.triangles = triangles;
      stats.megabytes = Number((bytes / 1048576).toFixed(1));
    },
  };
}
