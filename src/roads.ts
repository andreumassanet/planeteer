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
import { groundStyleFor, trodden } from './scenery/ground.ts';

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
 * script: `roadPoint` is the shape of a road and `roadSpan` is how much of that
 * shape is drawn. The bake walks the first to decide whether the road goes in
 * the sea and `pnpm check` walks both to assert that no ribbon crosses water or
 * a town; this file walks them to lay the ribbon. A second copy of either is a
 * road that was tested dry and drawn wet, or asserted clear of a town and drawn
 * across its plots.
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
   */
  bend: number;
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

/**
 * A point along a road, at `t` in [0, 1], as a unit vector.
 *
 * `a` and `b` are unit vectors at the two settlements. The bow is applied along
 * the great circle's own pole, which is the only direction that is
 * perpendicular to the arc everywhere on it — offsetting along a fixed vector
 * would bend the road out of the tangent plane and put its middle underground.
 */
export function roadPoint(
  a: THREE.Vector3,
  b: THREE.Vector3,
  bend: number,
  t: number,
  target: THREE.Vector3,
  pole: THREE.Vector3,
): THREE.Vector3 {
  target.copy(a).lerp(b, t).normalize();
  if (bend !== 0) {
    // The arc's own length in radians, so `bend` is a fraction of the road.
    const span = a.angleTo(b);
    target.addScaledVector(pole, bend * span * Math.sin(Math.PI * t)).normalize();
  }
  return target;
}

/** The pole of the great circle through `a` and `b`. Degenerate pairs get any axis. */
export function roadPole(a: THREE.Vector3, b: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  target.crossVectors(a, b);
  if (target.lengthSq() < 1e-12) target.set(0, 1, 0).cross(a);
  if (target.lengthSq() < 1e-12) target.set(1, 0, 0);
  return target.normalize();
}

// ---------------------------------------------------------------------------
// Where a road stops
// ---------------------------------------------------------------------------

/**
 * How far *outside* a built town's edge the ribbon stops, in world units.
 *
 * **Everything else in this world yields to something and the road yielded to
 * nothing** — a town gets pushed off a monument, a tree and a herd get pushed
 * off both, and the ribbon was drawn straight across the plots at either end of
 * it. The town already draws its own half of the join: `settlements.ts` paves
 * its streets out of the ground's own cells and aims *tracks* along the real
 * road bearings out to `slot.radius * 0.8 + TRACK_REACH`. So the arrangement
 * reads ribbon -> track -> paving, and only the first of the three ever stopped.
 *
 * **It was eight units *inside* the built radius and it is four units outside
 * it, and what changed is the town.** The overlap was there because a ribbon
 * that stops exactly on the built edge stops in the open, and a squared-off end
 * cap in the open reads as a cut rather than as an arrival — true while the
 * town's edge was a colour change. A town is a terraced platform now
 * (`GROUND_LIFT` 3.0, `TERRACE_STEP` 4 in `scenery/ground.ts`) whose rim is a
 * vertical retaining wall of up to 11.8 units, so a ribbon laid eight units
 * inside that rim is a carriageway drawn through a wall and along the tops of
 * the plots behind it, which is what the user photographed: *las carreteras
 * irían hasta esta plataforma, ahora llegan al centro y se solapa con las
 * casas.*
 *
 * Four units is a little over half an avatar — near enough that the town's own
 * track, which now draws a ramp down off the last paved cell to `RIBBON_LIFT`
 * (see `buildTracks`), still runs past the ribbon's cap and covers the seam.
 * **The track always reaches past it**: it runs to `0.8 r + 45` and the ribbon
 * starts at `r + 4`, so the overlap is `41 - 0.2 r` — eleven units at the
 * 150-unit size cap and forty at the 12-unit floor, positive for every radius
 * under 205. `pnpm check` asserts that over the whole range the size law
 * produces rather than leaving it as arithmetic in a comment.
 */
export const TOWN_STANDOFF = 4;

/**
 * How near a place a road may be drawn: nothing at a hidden one, the built
 * radius plus the standoff at a shown one.
 *
 * **Every endpoint in the file is built, so the second branch is a guard and
 * not a case.** `builtGraph` only joins places `isShown` returns true for, so
 * at the shipped `PROMINENCE_RADIUS` this always returns a radius. It stays a
 * function of `isShown` because the knob is live and the network is not: turn
 * `atlas.prominence(r)` up and some endpoints stop being built, and a ribbon
 * that went on stopping at the edge of a town nobody had built would be a gap
 * in the road with nothing to explain it.
 */
export function roadClip(place: Place): number {
  return isShown(place) ? radiusFor(place.pop) + TOWN_STANDOFF : 0;
}

/** Where a road's ribbon starts and stops, in `t`; see `roadSpan`. */
export interface RoadSpan {
  t0: number;
  t1: number;
}

const clipProbe = new THREE.Vector3();

/**
 * The `t` at which a road leaves a disc of `angle` radians about one of its own
 * ends, or the far end if it never does.
 *
 * Bisection and not arithmetic, because the bow makes the distance from an
 * endpoint a transcendental function of `t` — a road that bends 0.3 of its own
 * length leaves its town on a heading 43 degrees off the chord, and solving
 * `t * span` for the clip would put the cut a quarter of a town too far in on
 * exactly the coastal roads that needed the bow. Fourteen halvings of a whole
 * road is a resolution of 0.06 units on the longest one the network builds,
 * against a standoff of four; the comparison is a dot product rather than an
 * angle because `roadPoint` returns a unit vector and this is the one loop in
 * the build that runs per road rather than per section.
 *
 * **The bracket is the whole road and not its own half, and half of it was the
 * first version's bug.** A clip can only stop short of the middle when the two
 * ends are of a size, and they are not: a village 155 units from a city of
 * radius 140 has a road whose whole middle is inside the city, and the right
 * answer there is a fifteen-unit stub at the village. Bracketing at 0.5 threw
 * the road away instead — **2,279 roads, 5.3% of the network, came out
 * swallowed whole**, and `pnpm check` counting them is what said so.
 *
 * **The far end being outside is no longer free either, and that is what
 * `TOWN_STANDOFF` bought.** The bake thins `places.bin` so that no two *built*
 * discs touch, which is why the old clip at `radiusFor - 8` always left the far
 * end outside; a clip at `radiusFor + 4` reaches four units past that promise at
 * both ends, and over the shipped network 150 pairs of clip discs meet
 * (2026-09-08). 143 come back swallowed whole, which is the right answer: the
 * two are joined by their own paving and a ribbon between them would be a few
 * units of stub. `pnpm check` counts them so a size law that swallowed a
 * thousand would fail rather than quietly delete them.
 */
function leavesDisc(
  a: THREE.Vector3,
  b: THREE.Vector3,
  bend: number,
  pole: THREE.Vector3,
  end: THREE.Vector3,
  angle: number,
  atB: boolean,
): number {
  const cos = Math.cos(angle);
  // A road with both of its ends inside one town's disc is a road the thinning
  // should not have left standing; drop it rather than draw a stub of it.
  if ((atB ? a : b).dot(end) > cos) return atB ? 0 : 1;
  let inside = atB ? 1 : 0;
  let outside = atB ? 0 : 1;
  for (let i = 0; i < 14; i++) {
    const middle = (inside + outside) * 0.5;
    if (roadPoint(a, b, bend, middle, clipProbe, pole).dot(end) > cos) inside = middle;
    else outside = middle;
  }
  return outside;
}

/**
 * The stretch of a road that is actually drawn, once both ends have taken their
 * clearance out of it.
 *
 * `clipA` and `clipB` are world units, from `roadClip`; zero leaves that end
 * alone. False means there is nothing left to draw — two towns whose discs meet
 * are joined by their own paving and not by a ribbon.
 *
 * It is here, beside `roadPoint`, for the reason `roadPoint` is here: the ribbon
 * walks it and `pnpm check` walks it, and a second copy of where a road stops is
 * a road that was asserted clear of a town and drawn across it.
 */
export function roadSpan(
  a: THREE.Vector3,
  b: THREE.Vector3,
  bend: number,
  pole: THREE.Vector3,
  clipA: number,
  clipB: number,
  into: RoadSpan,
): boolean {
  into.t0 = clipA > 0 ? leavesDisc(a, b, bend, pole, a, clipA / PLANET_RADIUS, false) : 0;
  into.t1 = clipB > 0 ? leavesDisc(a, b, bend, pole, b, clipB / PLANET_RADIUS, true) : 1;
  return into.t1 - into.t0 > 1e-4;
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
 * `roadPoint` does.** Two programs need the same answer: the bake, which
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
const slopeTail = new THREE.Vector3();
const slopeAhead = new THREE.Vector3();
const slopeSide = new THREE.Vector3();
const slopeNorth = new THREE.Vector3();
const slopePole = new THREE.Vector3();
const slopeA = new THREE.Vector3();
const slopeB = new THREE.Vector3();
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
 * The **interior** and not the whole curve, the same walk the water test makes:
 * the two ends are towns, and a town cuts its own terraces into the hill
 * (`TERRACE_STEP`, `MAX_CUT`) so the ground it stands on is not the ground the
 * ribbon has to lie on. It is `SLOPE_STEP` apart and four `reliefAt` calls a
 * probe. `pnpm check` re-walks all 17,238 shipped roads with it in **984 ms**
 * (2026-09-08) rather than trusting the bake, for the reason the water test is
 * re-walked: the bake tests a path and writes down a `bend`, and if the two ever
 * drift every road in the world would still be a road between two real towns and
 * some of them would climb a scree face.
 */
export function crossesScree(road: Road, places: readonly Place[]): boolean {
  placeDirection(places[road.a]!, slopeA);
  placeDirection(places[road.b]!, slopeB);
  roadPole(slopeA, slopeB, slopePole);
  const length = slopeA.angleTo(slopeB) * PLANET_RADIUS;
  const steps = Math.max(2, Math.ceil(length / SLOPE_STEP));
  const reach = roadClearance(road.cls);
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    roadPoint(slopeA, slopeB, road.bend, t, slopeAt, slopePole);
    roadPoint(slopeA, slopeB, road.bend, Math.min(1, t + 0.004), slopeTail, slopePole);
    // The road's own frame, so `gradeAt`'s four probes straddle the carriageway
    // rather than an arbitrary square: across it, and along it.
    slopeAhead.subVectors(slopeTail, slopeAt).normalize();
    slopeSide.crossVectors(slopeAt, slopeAhead).normalize();
    slopeNorth.crossVectors(slopeSide, slopeAt).normalize();
    if (gradeAt(slopeAt, slopeSide, slopeNorth, reach, slope).grade > MAX_SLOPE) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * How far the ribbon is laid above `elevationAt`, in world units.
 *
 * **Exported, because a town's own tracks have to arrive at this height.**
 * `settlements.ts` draws the last 45 units of every road as a track on its own
 * paving and the two overlap by `41 - 0.2 r` units (see `TOWN_STANDOFF`); a
 * track that gave up its lift where the ribbon still had its own left a step
 * across the join. The two halves are still separate surfaces in separate
 * frames — see `buildTracks` — but they now agree about how high a carriageway
 * rides.
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
 * over the same relief, so the ramp `buildTracks` draws off the last paved cell
 * has nothing to climb down and a road entering a town needs no step at all.
 * The residue goes from **8.45% of the land to 3.31%** — the knee of the
 * distribution, past which only the coastal shelf is left.
 *
 * `SHOULDER_DROP` is written as `RIBBON_LIFT + 1.5` rather than as a number, so
 * the shoulders bury themselves exactly as far as they always did and this move
 * cannot quietly un-bury them; `life.ts` and `settlements.ts` read this constant
 * rather than restating it, so the wheels and the town's own track came up with
 * the tarmac.
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
 * The bound per road is the angle from its middle to the furthest of five
 * points along its own curve, which is its endpoints — a bow is a bulge with
 * its apex at the middle, so the ends are always the extreme. `MAX_ROAD_LENGTH`
 * is 1,000 units and the widest bow the bake will keep is 0.3, so the widest
 * bound on the planet is about 580 units and the search is two cells either
 * way for a level-0 vegetation tile.
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
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();
  let widest = 0;

  roads.forEach((road, i) => {
    placeDirection(places[road.a]!, a);
    placeDirection(places[road.b]!, b);
    roadPole(a, b, pole);
    roadPoint(a, b, road.bend, 0.5, mid, pole);
    middle[i * 3] = mid.x;
    middle[i * 3 + 1] = mid.y;
    middle[i * 3 + 2] = mid.z;
    let reach = 0;
    for (let k = 0; k <= 4; k++) {
      roadPoint(a, b, road.bend, k / 4, at, pole);
      reach = Math.max(reach, mid.angleTo(at));
    }
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
 * covers it. The number is the reach of a settlement's own tracks plus the
 * longest span a near tile uses, so spinning on the spot cannot delete the road
 * you are standing on.
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

  // Unit vector per place, once. The streamer never converts a coordinate again.
  const direction = new Float64Array(places.length * 3);
  const scratch = new THREE.Vector3();
  places.forEach((place, i) => {
    placeDirection(place, scratch);
    direction[i * 3] = scratch.x;
    direction[i * 3 + 1] = scratch.y;
    direction[i * 3 + 2] = scratch.z;
  });

  const roads = data.roads;

  // ------------------------------------------------------------------
  // Tiles
  // ------------------------------------------------------------------

  const tiles = new Map<number, Tile>();
  const endA = new THREE.Vector3();
  const endB = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const point = new THREE.Vector3();

  const readEnd = (index: number, target: THREE.Vector3): THREE.Vector3 =>
    target.set(direction[index * 3]!, direction[index * 3 + 1]!, direction[index * 3 + 2]!);

  roads.forEach((road, i) => {
    readEnd(road.a, endA);
    readEnd(road.b, endB);
    roadPole(endA, endB, pole);
    roadPoint(endA, endB, road.bend, 0.5, point, pole);
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
    // The bound has to cover the road *ends*, not the middles the tile was
    // bucketed on: a road is up to a thousand units long and both of its ends
    // can sit outside the tile it belongs to. A frustum test against a sphere
    // that only covers the middles culls a road whose visible half is on screen.
    let reach = 0;
    for (const i of tile.members) {
      const road = roads[i]!;
      readEnd(road.a, endA);
      readEnd(road.b, endB);
      reach = Math.max(reach, tile.centre.angleTo(endA), tile.centre.angleTo(endB));
    }
    tile.bound = reach * PLANET_RADIUS + 60;
    tile.anchor.copy(tile.centre).multiplyScalar(groundRadius(world, scratch.copy(tile.centre).multiplyScalar(PLANET_RADIUS)));
  }

  // ------------------------------------------------------------------
  // Which routes are worth drawing
  // ------------------------------------------------------------------

  /**
   * The three points a road is priced at, on the sea-level sphere.
   *
   * **Three and not one, because a road is up to a thousand units long and its
   * middle is not what you are looking at.** They used to be worked out inside
   * the per-road test — a `roadPole` and a `roadPoint` every time a tile was
   * rebuilt or estimated — and they are a pure function of the network, so they
   * are worked out once here instead: 24 bytes a road against two normalises and
   * a cross product per road per rescan. Sampled at sea level rather than on the
   * relief because the tallest ground on the planet is 620 units against the
   * shortest reach this is compared to, which is a couple of percent of a
   * decision that is already a step function.
   */
  const samples = new Float64Array(roads.length * 9);
  roads.forEach((road, i) => {
    readEnd(road.a, endA);
    readEnd(road.b, endB);
    roadPole(endA, endB, pole);
    roadPoint(endA, endB, road.bend, 0.5, point, pole);
    for (const [k, v] of [endA, endB, point].entries()) {
      samples[i * 9 + k * 3] = v.x * PLANET_RADIUS;
      samples[i * 9 + k * 3 + 1] = v.y * PLANET_RADIUS;
      samples[i * 9 + k * 3 + 2] = v.z * PLANET_RADIUS;
    }
  });

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

  const surface = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const side = new THREE.Vector3();
  /** The stretch of the road left after both towns have taken their clearance. */
  const stretch: RoadSpan = { t0: 0, t1: 1 };
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
   * Puts a cross-section point on the ground.
   *
   * The height is asked for at the point itself rather than shared across the
   * section, so a road on a cross-slope follows the hill instead of standing
   * proud of it on the downhill side. It is four `elevationAt` calls a section
   * and it is the whole cost of building a road.
   */
  const place = (
    centre: THREE.Vector3,
    across: THREE.Vector3,
    offset: number,
    lift: number,
    target: THREE.Vector3,
  ): THREE.Vector3 => {
    target.copy(centre).addScaledVector(across, offset / PLANET_RADIUS).normalize();
    const radius = groundRadius(world, scratch.copy(target).multiplyScalar(PLANET_RADIUS));
    return target.multiplyScalar(radius + lift);
  };

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
    let drawn = 0;

    const push = (p: THREE.Vector3, c: THREE.Color): void => {
      positions.push(p.x, p.y, p.z);
      colors.push(c.r, c.g, c.b);
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
    const head = new THREE.Vector3();
    const tail = new THREE.Vector3();
    const at = new THREE.Vector3();

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
      readEnd(road.a, endA);
      readEnd(road.b, endB);
      roadPole(endA, endB, pole);
      // Where the ribbon stops: a town's plots are not carriageway, and the
      // town's own track is what covers the last few units. See `roadSpan`.
      if (!roadSpan(endA, endB, road.bend, pole, roadClip(places[road.a]!), roadClip(places[road.b]!), stretch)) {
        continue;
      }
      drawn++;
      const length = endA.angleTo(endB) * PLANET_RADIUS;
      const drawnLength = length * (stretch.t1 - stretch.t0);
      const steps = Math.max(2, Math.ceil(drawnLength / span));
      const half = style.width * 0.5 * (BAND_WIDTH[band] ?? 1);
      const shoulder = half * SHOULDER_SPREAD;

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
      roadPoint(endA, endB, road.bend, 0.5, point, pole);
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

      /**
       * One cross-section, into four points.
       *
       * The direction across the road is taken from the *road* at that point —
       * the arc's own tangent crossed with up — rather than from the piece
       * either side of it, so the two pieces meeting at a section agree about
       * where its corners are and the ribbon has no seam down the middle of it.
       */
      const section = (t: number, into: THREE.Vector3[]): void => {
        roadPoint(endA, endB, road.bend, Math.max(0, t - 0.004), head, pole);
        roadPoint(endA, endB, road.bend, Math.min(1, t + 0.004), tail, pole);
        roadPoint(endA, endB, road.bend, t, at, pole);
        surface.copy(at);
        ahead.subVectors(tail, head).normalize();
        side.crossVectors(surface, ahead).normalize();
        place(at, side, -shoulder, RIBBON_LIFT - SHOULDER_DROP, into[0]!);
        place(at, side, -half, RIBBON_LIFT, into[1]!);
        place(at, side, half, RIBBON_LIFT, into[2]!);
        place(at, side, shoulder, RIBBON_LIFT - SHOULDER_DROP, into[3]!);
      };

      // The walk runs over the clipped stretch rather than over the whole road,
      // so a section is still `span` units long and the two ends land exactly
      // on the clip rather than on the nearest multiple of it.
      const t0 = stretch.t0;
      const step0 = (stretch.t1 - stretch.t0) / steps;
      section(t0, near);
      for (let step = 0; step < steps; step++) {
        section(t0 + (step + 1) * step0, far);
        quad(near[0]!, far[0]!, far[1]!, near[1]!, verge, kerb);
        quad(near[1]!, far[1]!, far[2]!, near[2]!, crown, crown);
        quad(near[2]!, far[2]!, far[3]!, near[3]!, kerb, verge);
        for (let k = 0; k < 4; k++) near[k]!.copy(far[k]!);
      }
    }

    // A tile every one of whose roads was clipped away by its two towns is
    // *built* — it is built as nothing. Leaving `band` at -1 would put it back
    // in the queue on every scan for as long as the viewer stood still.
    tile.band = band;
    tile.sign = sign;
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `roads:${tile.members.length}`;
    // A mark on the ground takes the ground's shadows; it casts none.
    mesh.receiveShadow = true;
    group.add(mesh);
    tile.mesh = mesh;
    tile.triangles = positions.length / 9;
    tile.bytes = positions.length * 4 * 2;
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
   * And so does the prominence knob: `roadClip` asks `isShown`, so
   * `atlas.prominence(0)` changes where every ribbon stops. The *network* does
   * not follow it at all — `roads.bin` is a graph over the places that were
   * built when it was baked, so the knob is a re-bake and not a reload — but
   * the clip is live, and a stale one would leave a ribbon stopping at the edge
   * of a town that is no longer built.
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
   * The clip comes off the length rather than being solved for: `roadSpan` is
   * fourteen halvings a road and this runs over every member of every candidate
   * tile on every rescan, where `raise` runs over one tile that is being built.
   * Subtracting the two clearances is the same number to within the bow.
   */
  function estimate(tile: Tile, band: number): number {
    const span = SPANS[band]!.span;
    let total = 0;
    for (const index of tile.members) {
      const road = roads[index]!;
      if (roadDrawn[index] === 0) continue;
      readEnd(road.a, endA);
      readEnd(road.b, endB);
      const length = endA.angleTo(endB) * PLANET_RADIUS
        - roadClip(places[road.a]!) - roadClip(places[road.b]!);
      if (length <= 0) continue;
      total += Math.max(2, Math.ceil(length / span)) * 6;
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
   * point, on the terms the ribbon is actually laid — the same `roadPoint`
   * curve, the same `roadSpan` clip, the same `RIBBON_LIFT`, and the same
   * cross-section, so a foot cannot stand on a road that is not there and a road
   * cannot be drawn where a foot does not find it.
   *
   * Four things about it are deliberate:
   *
   * - **The clip is applied.** A road stops at `radiusFor + TOWN_STANDOFF` at a
   *   *shown* town and the town's own track and plinth take over from there, so
   *   inside that disc this answers nothing and `madeHeightAt` answers instead.
   * - **The band taper is not.** `BAND_WIDTH` narrows the drawn strip at
   *   distance, which is a level of detail; the ground under your feet is
   *   always band 0 and a surface that changed width with the camera's altitude
   *   would be a road you fall off by climbing.
   * - **The route's reach is not either**, for the same reason: whether a road
   *   is worth *drawing* from here has nothing to do with whether it is there.
   * - **The ramp is the geometry.** Full lift out to `half`, then down to the
   *   relief by `CROWN_FALL * half`, which is where the drawn shoulder crosses
   *   the ground. There is no smoothing constant in it.
   *
   * The cost is one grid query — `roadIndexFor`'s, shared with the wood and the
   * herd, so the 13 ms of bucketing is paid once for the planet — and a
   * point-to-chord walk over the handful of roads it returns. Called once a
   * frame from `player.ts`.
   */
  const heightIndex = { index: null as RoadIndex | null };
  const heightHits: number[] = [];
  const heightDir = new THREE.Vector3();
  const heightA = new THREE.Vector3();
  const heightB = new THREE.Vector3();
  const heightPole = new THREE.Vector3();
  const heightHere = new THREE.Vector3();
  const heightLast = new THREE.Vector3();
  const heightLeg = new THREE.Vector3();
  const heightFoot = new THREE.Vector3();
  const heightProbe = new THREE.Vector3();
  const heightSpan: RoadSpan = { t0: 0, t1: 1 };
  /**
   * Longest piece of road treated as a straight chord, and how far that chord is
   * allowed to cut inside the bow.
   *
   * **48 units is `vegetation.ts`'s number and it is right for a wood and wrong
   * for a foot, and the arithmetic that says so is the one written beside it
   * there.** That note prices the *tightest bow the bake keeps* — 0.3 over a
   * thousand units, radius of curvature 338, a 48-unit chord sagging 0.85 — and
   * concludes it is a fifth of a lane's half-width, which is fine when the test
   * adds a whole plant's footprint on top. It is the wrong end of the
   * distribution for a surface a body stands on: the bow is
   * `bend * span * sin(pi t)`, so `|y''|` is `bend * pi^2 / span` and a **short**
   * road bends hardest. A 60-unit lane at the network's median bend of 0.045
   * has a radius of curvature of 135 units, and one chord across the whole of it
   * cuts **3.3 units** inside — which is half a carriageway, and `pnpm check`
   * caught it as a probe standing on a road half a unit outside the strip and as
   * a ribbon found inside a town it had been clipped out of.
   *
   * So the chord is bounded by its own sag instead: `c^2 * bend * pi^2 / (8 *
   * span) <= HEIGHT_SAG`. At the median bend that is five pieces of a 60-unit
   * lane; at the hardest bow the bake keeps it is 87 pieces of a thousand-unit
   * road, which is a few hundred point-to-chord tests in a query that runs once
   * a frame.
   *
   * 0.05 units is a hundredth of a lane's half-width and a hundred and thirtieth
   * of the avatar's own width — under the width of the pen that draws the road.
   */
  const HEIGHT_STEP = 48;
  const HEIGHT_SAG = 0.05;
  const WIDEST_HALF = Math.max(...ROAD_CLASSES.map((style) => style.width)) * 0.5 * CROWN_FALL;

  function ribbonHeightAt(point: THREE.Vector3): number {
    if (roads.length === 0 || places.length === 0) return 0;
    heightIndex.index ??= roadIndexFor(roads, places);
    heightDir.copy(point).normalize();
    let best = 0;
    for (const hit of heightIndex.index.near(heightDir, WIDEST_HALF, heightHits)) {
      const road = roads[hit]!;
      const style = ROAD_CLASSES[road.cls] ?? ROAD_CLASSES[0]!;
      const half = style.width * 0.5;
      const fall = half * CROWN_FALL;
      readEnd(road.a, heightA);
      readEnd(road.b, heightB);
      roadPole(heightA, heightB, heightPole);
      if (!roadSpan(heightA, heightB, road.bend, heightPole, roadClip(places[road.a]!), roadClip(places[road.b]!), heightSpan)) {
        continue;
      }
      const span = heightA.angleTo(heightB) * PLANET_RADIUS;
      const bow = Math.abs(road.bend);
      // The bow's own curvature, not a fixed step: see `HEIGHT_SAG`.
      const chord = bow > 1e-4
        ? Math.min(HEIGHT_STEP, Math.sqrt((8 * HEIGHT_SAG * span) / (bow * Math.PI * Math.PI)))
        : HEIGHT_STEP;
      const steps = Math.max(2, Math.ceil((span * (heightSpan.t1 - heightSpan.t0)) / chord));
      let nearest = Infinity;
      /**
       * Whether the point is past one of the ribbon's two ends.
       *
       * **A drawn ribbon has a flat cap and a distance to a polyline has a round
       * one**, and the difference is `fall` units of ground: without this a foot
       * would be lifted in a disc beyond where the carriageway stops, which at a
       * shown town is exactly the ground `roadClip` took the ribbon off so that
       * the town's own plinth could have it. The test is the unclamped
       * projection onto the first and last chord — before 0 on the first or past
       * 1 on the last means the point is beyond the cap, whatever its distance
       * from the line.
       */
      let pastCap = false;
      for (let step = 0; step <= steps; step++) {
        const t = heightSpan.t0 + (heightSpan.t1 - heightSpan.t0) * (step / steps);
        roadPoint(heightA, heightB, road.bend, t, heightHere, heightPole);
        heightHere.multiplyScalar(PLANET_RADIUS);
        if (step > 0) {
          heightLeg.subVectors(heightHere, heightLast);
          const lengthSq = heightLeg.lengthSq();
          let raw = 0;
          if (lengthSq > 1e-9) {
            raw = heightFoot.copy(heightDir).multiplyScalar(PLANET_RADIUS).sub(heightLast).dot(heightLeg) / lengthSq;
          }
          if ((step === 1 && raw < 0) || (step === steps && raw > 1)) pastCap = true;
          const along = raw < 0 ? 0 : raw > 1 ? 1 : raw;
          heightFoot.copy(heightLast).addScaledVector(heightLeg, along);
          // The chord is a straight line through the sphere and the query point
          // is on its surface, so the distance is measured across the ground:
          // both are projected back out before they are subtracted.
          heightFoot.normalize().multiplyScalar(PLANET_RADIUS);
          const away = heightFoot.distanceTo(heightProbe.copy(heightDir).multiplyScalar(PLANET_RADIUS));
          if (away < nearest) nearest = away;
        }
        heightLast.copy(heightHere);
      }
      if (pastCap || nearest >= fall) continue;
      const lift = nearest <= half ? RIBBON_LIFT : RIBBON_LIFT * (1 - (nearest - half) / (fall - half));
      if (lift > best) best = lift;
    }
    if (best <= 0) return 0;
    const ground = groundRadius(world, point);
    // A road is baked dry, so this cannot fire — and if a re-bake ever puts one
    // in the water, standing on it is not the way to find out.
    return ground <= PLANET_RADIUS ? 0 : ground + best;
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
