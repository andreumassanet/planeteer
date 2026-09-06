import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from './globe.ts';
import { OCEAN_COLOR, PALETTE, createToonRamp } from './theme.ts';
import { decodeRivers, inflate } from './pack.ts';
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

/**
 * The rivers: where the fresh water runs, and what it looks like on the ground.
 *
 * The planet had two kinds of water and both of them were the sea's — the ocean
 * sphere and 27 lakes cut out of the land — so every continent was a dry sheet
 * with a coastline round it. A river is the third kind and it is the one that
 * makes a continent read as drained rather than as painted.
 *
 * The split is `roads.ts`'s and it is the same split for the same two reasons:
 *
 * - **The geometry is baked.** Which vertices of Natural Earth's river
 *   centrelines are on the land *this* world draws is a pure function of
 *   `countries.bin` and `lakes.bin`, it costs 25,641 point-in-polygon queries,
 *   and the answer is identical on every load. That is a script and a data
 *   file, checked by `pnpm check`.
 * - **The ribbon is not.** Every river on the planet at the near band's own
 *   span is more triangles than the whole road network, so what gets built is
 *   what the camera can see, on the same `view.ts` terms as the settlements,
 *   the vegetation and the roads.
 *
 * **And a river is not a hole.** `docs/traps.md` prices what cutting inland
 * water out of the land mesh costs — 410 lakes covering 0.09% of the land took
 * the mesh from 1.45 M triangles to 7.08 M, because earcut bridges every hole
 * to the outer contour and the refinement squares the slivers — and a river is
 * a hole 25,000 vertices long. So the water is *laid on* the relief, the way a
 * road is, and what it costs is `RIVER_LIFT` worth of the ground occasionally
 * eating it rather than five million triangles.
 */

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// What a river is
// ---------------------------------------------------------------------------

/** One named watercourse. `rivers.bin` carries 444 of them; see `src/pack.ts`. */
export interface River {
  /** Natural Earth's `name_en`, or `''` for the 10 shipped features that have none. */
  name: string;
  /**
   * Natural Earth's own rank, 1 (the Amazon, the Nile, the Yangtze) to 6.
   *
   * Kept beside the width class rather than replaced by it, because it is the
   * only judgement in the source about how important a river is and a class is
   * a lossy read of it: `pnpm check` re-derives the class from this column, so
   * a hand-edited width fails rather than quietly widening the Ebro.
   */
  scalerank: number;
}

/** One unbroken run of a river that stayed on land, as baked. */
export interface RiverLine {
  /** Index into `RiverData.rivers`. */
  river: number;
  /** `[lon, lat]` in degrees, at the precision the bake rounds to. */
  points: number[][];
  /** Width class per point, an index into `RIVER_CLASSES`. */
  classes: Uint8Array;
}

export interface RiverData {
  /**
   * `dataStamp` of the `countries.bin` and `lakes.bin` this was baked against.
   * Asserted by `pnpm check`, not trusted — see `src/pack.ts`.
   */
  stamp: number;
  rivers: River[];
  lines: RiverLine[];
}

export interface RiverClass {
  name: string;
  /** Width of the drawn ribbon in world units. The avatar is 6.8. */
  width: number;
  /**
   * How far away it is still worth drawing, in world units.
   *
   * **The same table `ROAD_CLASSES` carries and the same argument**, which is
   * worth restating because it is the one place a line differs from everything
   * else the streamers hold: a settlement is a blob and the honest question is
   * how many pixels across it is, but a river is a *line*, and a line stays
   * legible long after its width stops resolving. So a river is admitted on
   * what it *is* and climbing drops the creeks first and leaves the Amazon,
   * which is what a map does.
   *
   * The numbers are the roads' three, and they are not a coincidence — they are
   * the same pixel arithmetic run on a narrower pen. At `937 * width /
   * distance` a `brook` is 5.9 px at 635 units and 2.9 at 1,300, which is where
   * a mark stops being a river and starts being a blue scratch; the on-foot
   * haze closes at about 936, so a brook is a thing you see from the bank and
   * from nowhere else. A `river` is 2.6 px at 2,500. The `great` class keeps the
   * horizon for the reason the trunk roads do — **there are 60 of them on the
   * planet in 116 drawn runs, and that is a map where the 260 brooks are a
   * wash** — and the difference is density and not legibility.
   */
  reach: number;
}

/**
 * Three widths, and the middle one is the avatar.
 *
 * A river cannot be drawn at its true width on this planet and the arithmetic
 * says why: the Amazon is about 5 km across at Manaus, which is **12.5 world
 * units**, and the Thames at Westminster is 250 m, which is 0.6 — a third of a
 * pixel at any distance you would look at it from. So the pen is the same
 * compromise `roads.ts` writes down about a lane: a mark wide enough for the
 * thing beside it to make sense of. 11 units is 1.6 avatars, which is a river
 * you would not step over and would not swim without meaning to; 4 is a stream
 * you can jump. Coincidentally close to life at the top and forty times life at
 * the bottom, which is the honest way round.
 *
 * The classes come off `scalerank` and nothing else — see `classForRank`.
 */
export const RIVER_CLASSES: readonly RiverClass[] = [
  { name: 'brook', width: 4, reach: 1300 },
  { name: 'river', width: 7, reach: 5000 },
  { name: 'great', width: 11, reach: 34000 },
];

/**
 * Which of the three a river is, from Natural Earth's rank.
 *
 * **`scalerank` and nothing else**, for the reason `classOf` is `radiusFor` and
 * nothing else: the source already carries one judgement of how important a
 * river is and a second measure invented here is how the map ends up drawing
 * the Ebro wider than the Danube. The split is at the source's own quantiles —
 * of the 444 rivers that ship, **60 at rank 1 and 2, 124 at 3 and 4, 260 at 5
 * and 6** — which puts the Amazon, the Nile, the Congo, the Yangtze, the
 * Mississippi and the Danube in the top class and every creek in the bottom
 * one.
 *
 * It lives here rather than in `scripts/build-rivers.mjs` for the reason
 * `classOf` lives in `roads.ts`: two programs need one answer, the bake that
 * writes the column and `pnpm check` that refuses to believe it.
 */
export function classForRank(scalerank: number): number {
  if (scalerank <= 2) return 2;
  if (scalerank <= 4) return 1;
  return 0;
}

/** Unit vector at a lon/lat pair. The negative z is the planet's handedness. */
export function riverPoint(lon: number, lat: number, target: THREE.Vector3): THREE.Vector3 {
  const cos = Math.cos(lat * DEG);
  return target.set(cos * Math.cos(lon * DEG), Math.sin(lat * DEG), -cos * Math.sin(lon * DEG));
}

/**
 * How far from a river's own centreline the water reaches, in world units.
 *
 * **Half the drawn ribbon, and unlike a road that is the whole of it.** A road
 * publishes `roadClearance` as half the *drawn strip* — the crown plus however
 * much of the shoulder the relief lets show — because its shoulders are laid
 * below the ground. A river has no shoulder: the outer edge of the ribbon is the
 * bank, laid `BANK_DROP` under the water surface so the pen has a rim to hold, and
 * that edge is at `±width / 2`. So this is 2, 3.5 and 5.5 units.
 *
 * Exported for the three files that have to keep something out of the water —
 * `settlements.ts` its plots, `vegetation.ts` a wood, `life.ts` a herd — and it
 * is half of each of their tests, exactly as the road's is: how wide the water
 * is is a fact about the river, and how wide a house or a cow or a saguaro is is
 * a fact about the thing standing beside it. Neither file states the other's
 * half.
 */
export function riverClearance(cls: number): number {
  return (RIVER_CLASSES[cls] ?? RIVER_CLASSES[0]!).width * 0.5;
}

/** The widest class, for a query that has to bound every river at once. */
export function widestRiverClearance(): number {
  return riverClearance(RIVER_CLASSES.length - 1);
}

/**
 * How far back from the water's own edge a settlement's plots stand, in world
 * units: the towpath.
 *
 * **The counterpart of `roadClip`, and it lives here rather than in
 * `settlements.ts` because the thing it is a fact about is the bank.** A road
 * yields to a town — it stops at `radiusFor - TOWN_OVERLAP` and the town's own
 * track covers the join — and a river cannot: two thirds of the Danube's length
 * is between towns and a Danube that stopped at Vienna and restarted the other
 * side would be a gap in the Danube, which reads worse than what it replaces. So
 * the yielding goes the other way and the *town* keeps off the water.
 *
 * It is a width and not a share, for the reason the green belt is: a house on
 * the Danube and a house on a brook both stand about as far back from the edge.
 * Six units is a little under one avatar, which buys the strip of ground the
 * ribbon's own `BANK_DROP` already digs into and nothing wider — at a `great`
 * river 5.5 + 6 = 11.5 units either side, one course of cells on each bank
 * against the median 12.6-unit European plot pitch.
 *
 * **The ceiling on it is `SMALLEST_SETTLEMENT`**, and `pnpm check` asserts that
 * rather than trusting it: at 12 units of radius a hamlet with a great river
 * through its middle has 12 units to give, so a corridor wider than that is a
 * village the water deletes. Exported so the check imports the number instead of
 * restating it.
 */
export const TOWN_BANK = 6;

// ---------------------------------------------------------------------------
// Which rivers pass near a patch of ground
// ---------------------------------------------------------------------------

/** Which lines pass near a patch of ground; see `createRiverIndex`. */
export interface RiverIndex {
  /**
   * Indices into `RiverData.lines`, of every line that could come within
   * `radius` world units of `direction`. Appended to `out`, which is cleared.
   */
  near(direction: THREE.Vector3, radius: number, out: number[]): number[];
}

/**
 * A lat/lon grid over the baked lines, so a town, a vegetation tile or a herd
 * can ask which rivers cross it.
 *
 * **It is `createRoadIndex` with one simplification, and the simplification is
 * the whole difference between the two datasets.** A road is a *curve* the bake
 * computed — `roadPoint` walks a bow — so the road index bounds each edge by
 * sampling five points along it and every consumer has to re-walk the curve to
 * get a chord. A river is already a polyline: the bake stores its vertices about
 * 50 units apart and `raise` lerps between exactly those, so the stored chords
 * *are* the drawn centreline and a consumer tests against them directly. There
 * is no second copy of the curve to get wrong, which is the trap the road index
 * carries.
 *
 * A line is bucketed on its own middle vertex with the angle to the furthest of
 * its own points as the bound, and a query walks the block of cells a line of
 * the widest bound could have arrived from — the same shape and the same
 * polar-cosine guard the road index uses. Over the shipped 805 lines and their
 * 14,523 vertices it is a few milliseconds to build and a query is tens of
 * microseconds.
 */
export function createRiverIndex(lines: readonly RiverLine[]): RiverIndex {
  const CELL = 4;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const middle = new Float64Array(lines.length * 3);
  const half = new Float64Array(lines.length);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();
  let widest = 0;

  lines.forEach((line, i) => {
    const centre = line.points[line.points.length >> 1]!;
    riverPoint(centre[0]!, centre[1]!, mid);
    middle[i * 3] = mid.x;
    middle[i * 3 + 1] = mid.y;
    middle[i * 3 + 2] = mid.z;
    let reach = 0;
    for (const p of line.points) reach = Math.max(reach, mid.angleTo(riverPoint(p[0]!, p[1]!, at)));
    half[i] = reach;
    if (reach > widest) widest = reach;
    const lat = centre[1]!;
    const lon = centre[0]!;
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
      // The longitude span of a cell shrinks with the cosine; the same guard
      // `createRoadIndex` and `proximityGraph` use, for the same reason.
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
 * A river's channel through some patch of ground, in that patch's own tangent
 * frame: one stored chord and how far from it nothing may stand.
 *
 * **A keepout that is a line.** A town is a disc and a monument is a pad; a
 * river, like a road, is neither — approximating one by discs along it is the
 * same test at four times the count, and by its bounding disc it clears a wood
 * off half of Bavaria. The chords are the vertices the bake stored and `raise`
 * lerps between, so this is the drawn centreline itself and not a second copy of
 * it: the trap `roads.ts` carries about the bow cannot happen here.
 */
export interface RiverCorridor {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** `riverClearance` of the wider of the chord's two ends, plus the caller's margin. */
  clearance: number;
}

const corridorAt = new THREE.Vector3();

/**
 * Every river chord that could reach into a patch of ground, in its own frame.
 *
 * `up`, `across` and `north` are the patch's tangent basis and `reach` is how
 * far out a chord still matters, in world units. Everything a town or a
 * vegetation tile places is within a few hundredths of a radian of its centre,
 * so the tangent components *are* the local coordinates — the identity
 * `settlements.ts` already leans on for its keepouts — and no projection is
 * needed beyond two dot products a vertex.
 *
 * A line runs out of the patch at both ends, so the chords are filtered on their
 * own midpoints rather than the line being clipped: a chord whose middle is
 * further out than `reach` cannot touch anything inside.
 *
 * `margin` is the caller's half of the clearance and this file states only its
 * own: a town stands its plots back from the bank by a towpath, a wood adds the
 * plant's own footprint per plot and passes 0 here. Neither file states the
 * other's half, which is the same split `roadClearance` has.
 */
export function riverCorridorsNear(
  index: RiverIndex,
  lines: readonly RiverLine[],
  up: THREE.Vector3,
  across: THREE.Vector3,
  north: THREE.Vector3,
  reach: number,
  margin: number,
  out: RiverCorridor[],
  hits: number[] = [],
): RiverCorridor[] {
  out.length = 0;
  const limit = reach * reach;
  index.near(up, reach, hits);
  for (const hit of hits) {
    const line = lines[hit]!;
    let x0 = 0;
    let z0 = 0;
    for (let i = 0; i < line.points.length; i++) {
      const p = line.points[i]!;
      riverPoint(p[0]!, p[1]!, corridorAt);
      const x = corridorAt.dot(across) * PLANET_RADIUS;
      const z = corridorAt.dot(north) * PLANET_RADIUS;
      if (i > 0) {
        const mx = (x0 + x) * 0.5;
        const mz = (z0 + z) * 0.5;
        if (mx * mx + mz * mz <= limit) {
          // The wider of the chord's two ends, so a class change along a line
          // widens the water rather than narrowing it: whatever stands beside it
          // has to clear the river at its widest.
          const cls = Math.max(line.classes[i - 1] ?? 0, line.classes[i] ?? 0);
          out.push({ x0, z0, x1: x, z1: z, clearance: riverClearance(cls) + margin });
        }
      }
      x0 = x;
      z0 = z;
    }
  }
  return out;
}

/**
 * Is this point in the water, or within `extra` of it?
 *
 * Point to segment in the patch's own tangent plane. `extra` is the footprint of
 * whatever wants to stand here — a plot, a plant, a herd — which is the half of
 * the clearance the caller owns.
 */
export function inRiverCorridor(
  corridors: readonly RiverCorridor[],
  x: number,
  z: number,
  extra: number,
): boolean {
  for (const river of corridors) {
    const dx = river.x1 - river.x0;
    const dz = river.z1 - river.z0;
    const lengthSq = dx * dx + dz * dz;
    let t = 0;
    if (lengthSq > 1e-6) {
      t = ((x - river.x0) * dx + (z - river.z0) * dz) / lengthSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const ox = river.x0 + t * dx - x;
    const oz = river.z0 + t * dz - z;
    const clear = river.clearance + extra;
    if (ox * ox + oz * oz < clear * clear) return true;
  }
  return false;
}

/**
 * The one index over the shipped lines, built once and shared.
 *
 * Three files keep something out of the water and a fourth asks where the water
 * is under the player's feet, and the index is a few milliseconds and a bucket
 * per line. Keyed on the array itself, exactly as `roadIndexFor` is: `main.ts`
 * hands the same `rivers.all` to all of them, and a caller arriving with a
 * different set — a check script, a re-bake — gets its own rather than the wrong
 * one.
 */
let sharedIndex: { lines: readonly RiverLine[]; index: RiverIndex } | null = null;

export function riverIndexFor(lines: readonly RiverLine[]): RiverIndex {
  if (sharedIndex !== null && sharedIndex.lines === lines) return sharedIndex.index;
  const index = createRiverIndex(lines);
  sharedIndex = { lines, index };
  return index;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export async function loadRivers(url = '/data/rivers.bin'): Promise<RiverData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeRivers(await inflate(await response.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * How far the water is laid above `elevationAt`, in world units.
 *
 * **Lower than the road's 1.5 on purpose, and the measurement that decides it is
 * the road's own.** `RIBBON_LIFT` documents the share of the land mesh standing
 * more than a given height over the exact relief out in open country: 24.4% over
 * 0.5, 12.9% over 1.1, 8.45% over 1.5. A road took 1.5 because a carriageway you
 * wade through to the knee is worse than one the hill occasionally eats.
 *
 * A river is the opposite trade and it is the one case in this world where the
 * ground cutting through the surface is *right*: water lies in a channel, so a
 * bank standing over it reads as a bank, and a sheet of blue standing over the
 * ground reads as a canal on stilts. So the lift is only what it takes to beat
 * the depth buffer at the distance the ribbon is seen from — 0.6 is a tenth of
 * the avatar and three times `RELIEF_SAG`'s own floor at the near band's span —
 * and the ~20% of the mesh that then stands over it is the relief drawing the
 * river's banks for free.
 */
export const RIVER_LIFT = 0.6;

/**
 * How wide the lighter centre band is, as a fraction of the ribbon's half-width.
 *
 * **Two tones and not one, and it costs the same six triangles a section a road
 * pays.** A single flat band of blue on green reads as tape; what says *water*
 * in this style is that the middle of it is brighter than the edge, which is the
 * ocean's own shelf-to-shoal ramp seen across seven units instead of across a
 * continental shelf. The buffers are non-indexed, so the two quads meeting at
 * `+/- inner` do not share vertices and the step is a **hard line** rather than a
 * gradient — which is the whole point, and is why it reads at a distance a
 * Gouraud ramp across half a river would not.
 *
 * 0.45 rather than a half, because the eye reads the centre band as *the* river
 * and the edges as its banks: at 0.5 the three bands are equal and it reads as a
 * stripe.
 */
const CENTRE_SHARE = 0.45;

/**
 * How far the outer edge of the ribbon sits below the water surface.
 *
 * **It is what gives the pen something to hold on to, and that is a fact about
 * `OutlineEffect` rather than a look.** The hull is built by projecting each
 * vertex and the same vertex pushed one unit along its own normal, and expanding
 * the first away from the second *in screen space* — so a perfectly flat sheet
 * whose normals all point straight up has nothing to expand along and gets no
 * line at all, whatever `thickness` says. Tilting the outer band 20-odd degrees
 * turns its normal out and the ink lands where the water meets the ground, which
 * is the mark this wants: **one line per bank.**
 *
 * It is the same 0.5 that buries it, which is the road's shoulder trick arriving
 * for a second reason: the outer edge sits at `RIVER_LIFT - BANK_DROP` = 0.1
 * above the relief, so the hill closes over it and what you see is water in a
 * channel rather than a blue rectangle laid on a field.
 */
const BANK_DROP = 0.5;

/**
 * The water's two tones, and they are `OCEAN_COLOR` moved the way the shallows
 * move rather than a colour picked for a river.
 *
 * **A tone of the water and not a dark neutral**, which is the same rule
 * `GROUND_STYLES` states and `roads.ts`'s kerb obeys: a dark neutral band lying
 * on the ground is what a *shadow* looks like in this scene, and a grey river is
 * a shadow of a river.
 *
 * It is derived here rather than taken from `ocean.ts` because that file's ramp
 * answers a different question — how deep is the sea and how cold is this
 * latitude, evaluated per point over 124,820 faces — and it has no answer for a
 * seven-unit ribbon a thousand miles inland. What both share is the anchor:
 * `OCEAN_COLOR` is what the flat maps paint the sea, and mixing toward
 * `skyBlue` is what the sea's own shelf and shoal do, so a river runs into an
 * estuary the same colour the estuary already is.
 */
const BANK_WATER = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.32);
const OPEN_WATER = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.78);

/**
 * Longest piece of river drawn as one quad, by how far away it is.
 *
 * **The same three bands `roads.ts` uses, and it is the same answer to the same
 * question rather than a copy of a decision.** A section takes its height at its
 * ends and the ground does what it likes in between; out between the towns
 * `RELIEF_SAG` is three units and the relief's finest octave is about nine units
 * of amplitude over a 133-unit wavelength, so a 38-unit chord dips about 0.9
 * below the curve and an 18-unit one about 0.23. That arithmetic is a fact about
 * `terrain.ts` and not about what is being laid on it, so the near band is 18
 * here for exactly the reason it is 18 there — and a river laid at 0.6 needs it
 * more than a road laid at 1.5 does.
 *
 * The bake stores vertices about 50 units apart, so the near band subdivides and
 * the far band merges; both are driven from the stored line rather than from the
 * source, which is what keeps the wire small and the near ground honest.
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
 * **There is no band taper here and `roads.ts` has one, and the reason is that
 * the two tables do not line up.** A road narrows over the distance bands so
 * that a class thins before its reach cuts it off, which stops the network
 * ending in a hard ring round the player. The same table on a river does the
 * opposite of that, measured: a `brook`'s reach at the shipped detail of 0.5 is
 * **650 units**, which is inside the first band's 2,600, so the taper never
 * reaches the class it exists to soften — and the only thing it does reach is a
 * `great` river at altitude, where it is the one class still drawn. From 6,000
 * units up the Amazon is 11 units wide and 1.7 px; at the roads' 0.7 it is 1.2,
 * and it is the only mark on a continent. The taper was written, looked at over
 * the Amazon, and taken out again.
 */

/** How far each class is worth drawing right now: the table times the knob. */
function classReaches(into: number[]): number[] {
  for (let i = 0; i < RIVER_CLASSES.length; i++) into[i] = detailReach(RIVER_CLASSES[i]!.reach);
  return into;
}

/**
 * The lowest class still worth drawing at a distance, as an index into
 * `RIVER_CLASSES`: 0 draws everything, 3 draws nothing.
 *
 * A rebuild key and not the test, exactly as `cutFor` is in `roads.ts`: it is
 * asked of the tile's *nearest possible point*, so a class is only dropped when
 * no line in the tile could pass it, and the per-line test does the fine work
 * inside `raise`. Keying the rebuild on the tile's centre would delete the brook
 * you are standing beside the moment the tile's middle crossed its reach.
 */
function cutFor(distance: number, reaches: readonly number[]): number {
  let cut = 0;
  while (cut < RIVER_CLASSES.length && distance > reaches[cut]!) cut++;
  return cut;
}

/**
 * Degrees of latitude and longitude in one streaming tile.
 *
 * Four, the same as the roads', for the same reason: a river is not a slot the
 * way a town is, so the unit of streaming is a patch of the planet and every
 * line whose middle vertex falls in it. A stored line is at most a few hundred
 * units long — the bake breaks a river wherever it touches water — so a tile's
 * bounding sphere stays tight enough for the frustum test to mean something.
 */
const TILE = 4;
const TILE_COLS = Math.round(360 / TILE);
const TILE_ROWS = Math.round(180 / TILE);

/**
 * Triangles of resident river. `OutlineEffect` draws them twice, and unlike the
 * roads a river carries an ink hull, so a triangle here is a triangle drawn in
 * both passes rather than only in the first.
 *
 * A third of the road network's 260,000, which is roughly the ratio of the two
 * datasets: 14,523 stored river vertices against 42,804 roads. It has never
 * bound — the worst standpoint measured holds 5,256 triangles — and it is here
 * so that a re-bake with a finer tolerance cannot quietly make a river the most
 * expensive thing on the screen.
 */
const TRIANGLE_BUDGET = 90_000;
const triangleBudget = (): number => detailArea(TRIANGLE_BUDGET);
/** Milliseconds of building allowed in one frame. Same law as the roads. */
const BUILD_BUDGET_MS = 2;
/** How far the viewer moves, or turns, before the candidate list is worked out again. */
const RESCAN_MOVE = 90;
const RESCAN_TURN = 8 * DEG;
/**
 * Rivers inside this of the camera are built whatever it is pointed at.
 *
 * A mouse flick is 180 degrees in a tenth of a second and no frustum margin
 * covers it. The roads' number, because it is sized on the same thing — the
 * longest span a near tile uses plus the ground a spin can reveal — and a river
 * you are standing beside must not blink.
 */
const KEEP_ALL_WITHIN = 620;
/** Fixed, not scaled: see the same constant in `roads.ts` and `settlements.ts`. */
const keepAllWithin = (): number => KEEP_ALL_WITHIN;

/**
 * How far along the ground a river is worth drawing, before its class has its
 * say. The horizon, doubled, the same shape the roads use — and the class reach
 * in `RIVER_CLASSES` is what actually binds for everything but a great river.
 */
function reachFor(altitude: number): number {
  return Math.min(
    fogFar(altitude, PLANET_RADIUS) * 1.1,
    detailReach(Math.min(34000, Math.max(2600, horizonAt(altitude, PLANET_RADIUS) * 2))),
  );
}

export interface RiverStats {
  /** Tiles standing. */
  resident: number;
  /** Tiles wanted and waiting for a frame with room. */
  pending: number;
  /** Lines drawn, across every resident tile. */
  lines: number;
  triangles: number;
  megabytes: number;
  built: number;
  lastBuildMs: number;
  /** Ground reach, and the slant distance actually compared against. */
  reach: number;
  range: number;
}

export interface Rivers {
  group: THREE.Group;
  stats: RiverStats;
  /**
   * Every line, as baked, and the names they belong to.
   *
   * Exported the way `roads.all` is and for the same consumer: the sheet maps
   * draw the network from the data rather than from the mesh, because the mesh
   * is whatever the camera happened to be pointed at.
   */
  all: readonly RiverLine[];
  rivers: readonly River[];
  /** Call each frame. The camera is optional; without one, admission is a radius. */
  update(viewer: THREE.Vector3, altitude: number, camera?: THREE.Camera): void;
}

interface Tile {
  /** Indices into `lines`. */
  members: number[];
  centre: THREE.Vector3;
  anchor: THREE.Vector3;
  bound: number;
  mesh: THREE.Mesh | null;
  /** The band this tile is currently built for, or -1 if it is not built. */
  band: number;
  /** And the lowest class it was built to draw; see `cutFor`. */
  cut: number;
  /** Lines it actually drew, which is not `members.length` once the class LOD bites. */
  drawn: number;
  triangles: number;
  bytes: number;
}

export function createRivers(world: World, data: RiverData): Rivers {
  const group = new THREE.Group();
  group.name = 'rivers';

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
  });
  /**
   * **The pen is on, which is the one place a river disagrees with a road.**
   * `roads.ts` turns its hull off, arguing that a carriageway is a mark on the
   * ground rather than an object standing on it and an outline round it would
   * read as tape. Water is the other thing: in this style a body of water has an
   * inked edge — the sea has one, `ocean.ts` sets exactly these parameters on
   * the shallows — and a river without one is a blue road.
   *
   * `OutlineEffect` hulls **per mesh** and expands it in **screen space**, so
   * what a long thin ribbon gets is a line down each bank and a cap at each end,
   * which is the mark this wants and is why it needs no geometry of its own.
   * The consequence to know is that a tile is one hull: two lines of the same
   * river that meet inside a tile get no ink between them, which is right, and
   * two that meet *across* a tile boundary get a cap each, which is the trap
   * `docs/traps.md` writes down about coplanar meshes and is invisible at 4
   * degrees of tile.
   */
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01] };

  const lines = data.lines;

  // ------------------------------------------------------------------
  // Tiles
  // ------------------------------------------------------------------

  const tiles = new Map<number, Tile>();
  const scratch = new THREE.Vector3();
  const point = new THREE.Vector3();

  lines.forEach((line, i) => {
    const middle = line.points[line.points.length >> 1]!;
    const lat = middle[1]!;
    const lon = middle[0]!;
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
        cut: -1,
        drawn: 0,
        triangles: 0,
        bytes: 0,
      };
      tiles.set(key, tile);
    }
    tile.members.push(i);
    tile.centre.add(riverPoint(lon, lat, point));
  });

  const list = [...tiles.values()];
  for (const tile of list) {
    tile.centre.normalize();
    // The bound has to cover every *vertex*, not the middles the tile was
    // bucketed on: a line runs out of the tile it belongs to at both ends, and
    // a frustum test against a sphere that only covers the middles culls a
    // river whose visible half is on screen.
    let reach = 0;
    for (const i of tile.members) {
      for (const p of lines[i]!.points) {
        reach = Math.max(reach, tile.centre.angleTo(riverPoint(p[0]!, p[1]!, point)));
      }
    }
    tile.bound = reach * PLANET_RADIUS + 60;
    tile.anchor
      .copy(tile.centre)
      .multiplyScalar(groundRadius(world, scratch.copy(tile.centre).multiplyScalar(PLANET_RADIUS)));
  }

  // ------------------------------------------------------------------
  // Building one tile
  // ------------------------------------------------------------------

  const surface = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const side = new THREE.Vector3();
  /**
   * Where the eye was at the last scan: the camera and not the player, because
   * the class reach is a statement about how far a mark is from the thing
   * looking at it, and the two are the same on foot and thousands of units apart
   * the moment the rig pulls back. The same bug the roads' reach had, avoided
   * from the start rather than shipped and measured.
   */
  const eye = new THREE.Vector3();
  const reaches = [0, 0, 0];

  /**
   * Puts a cross-section point on the ground.
   *
   * The height is asked for at the point itself rather than shared across the
   * section, so water on a cross-slope follows the hill instead of standing
   * proud of it on the downhill side. Four `elevationAt` calls a section, and
   * that is the whole cost of building a river.
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

  /** Unit vectors for one line, rebuilt per line rather than cached: 12,000 of them. */
  const head = new THREE.Vector3();
  const tail = new THREE.Vector3();
  const at = new THREE.Vector3();

  /**
   * How far the nearest end of a line is from the eye.
   *
   * Three points and not one — both ends and the middle — for the reason
   * `eyeDistanceTo` in `roads.ts` takes three: a line is up to a few hundred
   * units long and its middle is not necessarily what you are looking at.
   * Sampled on the sea-level sphere, because the tallest ground on the planet is
   * 620 units against a shortest reach of 1,300 and this is a step function.
   */
  const eyeDistanceTo = (line: RiverLine): number => {
    const first = line.points[0]!;
    const last = line.points[line.points.length - 1]!;
    const mid = line.points[line.points.length >> 1]!;
    let best = Infinity;
    for (const p of [first, mid, last]) {
      best = Math.min(best, eye.distanceTo(riverPoint(p[0]!, p[1]!, point).multiplyScalar(PLANET_RADIUS)));
    }
    return best;
  };

  /** The class of a whole line, for the reach test: the widest vertex in it. */
  const classOfLine = (line: RiverLine): number => {
    let widest = 0;
    for (const cls of line.classes) if (cls > widest) widest = cls;
    return widest;
  };

  function raise(tile: Tile, band: number, cut: number): void {
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
      c: THREE.Color,
    ): void => {
      push(p0, c); push(p1, c); push(p2, c);
      push(p0, c); push(p2, c); push(p3, c);
    };

    // One cross-section is four points and the piece between two of them is
    // three quads. `near` is rolled into `far` each step, so every point is put
    // on the ground exactly once however many pieces share it.
    const near = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const far = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    for (const index of tile.members) {
      const line = lines[index]!;
      const cls = classOfLine(line);
      // The class reach, applied per line and measured from the eye. `cut` is
      // the tile's own conservative answer and this is the honest one; see
      // `cutFor` and the road trap that says what conflating the two costs.
      if (cls < cut) continue;
      if (eyeDistanceTo(line) > reaches[cls]!) continue;
      drawn++;

      /**
       * One cross-section, into four points.
       *
       * The direction across is taken from the line's own tangent at that point
       * — the chord either side of it, crossed with up — rather than from the
       * piece in front of it, so the two pieces meeting at a section agree about
       * where its corners are and the ribbon has no seam down the middle.
       */
      const section = (
        from: THREE.Vector3, to: THREE.Vector3, t: number, half: number, into: THREE.Vector3[],
      ): void => {
        at.copy(from).lerp(to, t).normalize();
        head.copy(from).lerp(to, Math.max(0, t - 0.02)).normalize();
        tail.copy(from).lerp(to, Math.min(1, t + 0.02)).normalize();
        surface.copy(at);
        ahead.subVectors(tail, head).normalize();
        side.crossVectors(surface, ahead).normalize();
        place(at, side, -half, RIVER_LIFT - BANK_DROP, into[0]!);
        place(at, side, -half * CENTRE_SHARE, RIVER_LIFT, into[1]!);
        place(at, side, half * CENTRE_SHARE, RIVER_LIFT, into[2]!);
        place(at, side, half, RIVER_LIFT - BANK_DROP, into[3]!);
      };

      let started = false;
      for (let k = 0; k + 1 < line.points.length; k++) {
        const p0 = line.points[k]!;
        const p1 = line.points[k + 1]!;
        riverPoint(p0[0]!, p0[1]!, a);
        riverPoint(p1[0]!, p1[1]!, b);
        const length = a.angleTo(b) * PLANET_RADIUS;
        const steps = Math.max(1, Math.ceil(length / span));
        // The width is the vertex's own, so a line whose class changes along it
        // tapers rather than steps. Uniform today; see `encodeRivers`.
        const halfA = RIVER_CLASSES[line.classes[k]!]!.width * 0.5;
        const halfB = RIVER_CLASSES[line.classes[k + 1]!]!.width * 0.5;
        if (!started) {
          section(a, b, 0, halfA, near);
          started = true;
        }
        for (let step = 0; step < steps; step++) {
          const t = (step + 1) / steps;
          section(a, b, t, halfA + (halfB - halfA) * t, far);
          quad(near[0]!, far[0]!, far[1]!, near[1]!, BANK_WATER);
          quad(near[1]!, far[1]!, far[2]!, near[2]!, OPEN_WATER);
          quad(near[2]!, far[2]!, far[3]!, near[3]!, BANK_WATER);
          for (let c = 0; c < 4; c++) near[c]!.copy(far[c]!);
        }
      }
    }

    // A tile every one of whose rivers is too minor to draw at this distance is
    // *built* — it is built as nothing. Leaving `band` at -1 would put it back
    // in the queue on every scan for as long as the viewer stood still.
    tile.band = band;
    tile.cut = cut;
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `rivers:${tile.members.length}`;
    // Water takes the hill's shadow and throws none of its own.
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
    // The geometry is this tile's; the material is shared by every river on the
    // planet and disposing it would blank all of them.
    tile.mesh.geometry.dispose();
    tile.mesh = null;
    tile.band = -1;
    tile.cut = -1;
    tile.drawn = 0;
    tile.triangles = 0;
    tile.bytes = 0;
  }

  // ------------------------------------------------------------------
  // The streamer
  // ------------------------------------------------------------------

  const stats: RiverStats = {
    resident: 0,
    pending: 0,
    lines: 0,
    triangles: 0,
    megabytes: 0,
    built: 0,
    lastBuildMs: 0,
    reach: 0,
    range: 0,
  };

  let wanted: Tile[] = [];
  let queue: { tile: Tile; band: number; cut: number }[] = [];
  const scannedAt = new THREE.Vector3(Infinity, Infinity, Infinity);
  const scannedAxis = new THREE.Vector3(0, 0, 1);
  let scannedRange = -1;
  /** Turning the knob forces a rescan; nothing else can see that it moved. */
  let scannedDetail = -1;
  const cone = createViewCone(keepAllWithin);

  /**
   * Roughly what a tile costs before it is built: six triangles a span, over the
   * stored polyline's own length.
   *
   * The vertex count is not enough on its own — a stored segment is about 50
   * units and the near band's span is 18, so the near bands cost three times
   * what a vertex count would say — so the estimate walks the lengths. It is one
   * `angleTo` a stored segment and it runs on every rescan, which is why the
   * lengths are worked out once at load and cached rather than here.
   */
  const lineLength = new Float64Array(lines.length);
  {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    lines.forEach((line, i) => {
      let total = 0;
      for (let k = 0; k + 1 < line.points.length; k++) {
        riverPoint(line.points[k]![0]!, line.points[k]![1]!, a);
        riverPoint(line.points[k + 1]![0]!, line.points[k + 1]![1]!, b);
        total += a.angleTo(b) * PLANET_RADIUS;
      }
      lineLength[i] = total;
    });
  }

  function estimate(tile: Tile, band: number, cut: number): number {
    const span = SPANS[band]!.span;
    let total = 0;
    for (const index of tile.members) {
      const line = lines[index]!;
      const cls = classOfLine(line);
      if (cls < cut) continue;
      if (eyeDistanceTo(line) > reaches[cls]!) continue;
      // One section a stored segment at least, `span` units apart at most.
      total += Math.max(line.points.length - 1, Math.ceil(lineLength[index]! / span)) * 6;
    }
    return total;
  }

  function scan(viewer: THREE.Vector3, altitude: number): void {
    const reach = reachFor(altitude);
    eye.copy(cone.active ? cone.apex : viewer);
    classReaches(reaches);
    const candidates: { tile: Tile; distance: number; band: number; cut: number }[] = [];
    for (const tile of list) {
      const distance = tile.anchor.distanceTo(viewer);
      if (distance - tile.bound > slantRange(altitude, reach)) continue;
      const admitted = tile.band >= 0
        ? cone.keeps(tile.anchor, tile.bound)
        : cone.admits(tile.anchor, tile.bound);
      if (!admitted) continue;
      const fromEye = tile.anchor.distanceTo(eye);
      // The tile's *nearest possible* line for the class cut and its middle for
      // the span band: the first is a promise that nothing inside was wrongly
      // dropped, the second is a chord error and the middle is where it is.
      const cut = cutFor(Math.max(0, fromEye - tile.bound), reaches);
      if (cut >= RIVER_CLASSES.length) continue;
      candidates.push({ tile, distance, band: bandFor(fromEye), cut });
    }
    candidates.sort((x, y) => x.distance - y.distance);

    wanted = [];
    queue = [];
    let triangles = 0;
    const keep = new Set<Tile>();
    for (const candidate of candidates) {
      const cost = candidate.tile.triangles > 0
        ? candidate.tile.triangles
        : estimate(candidate.tile, candidate.band, candidate.cut);
      if (triangles + cost > triangleBudget() && wanted.length > 0) continue;
      triangles += cost;
      wanted.push(candidate.tile);
      keep.add(candidate.tile);
      if (candidate.tile.band !== candidate.band || candidate.tile.cut !== candidate.cut) {
        queue.push({ tile: candidate.tile, band: candidate.band, cut: candidate.cut });
      }
    }
    for (const tile of list) if (!keep.has(tile)) drop(tile);
  }

  return {
    group,
    stats,
    all: lines,
    rivers: data.rivers,

    update(viewer, altitude, camera) {
      const reach = reachFor(altitude);
      const range = slantRange(altitude, reach);
      stats.reach = Math.round(reach);
      stats.range = Math.round(range);
      cone.aim(camera);
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
          if (next.tile.band === next.band && next.tile.cut === next.cut) continue;
          drop(next.tile);
          raise(next.tile, next.band, next.cut);
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
      stats.lines = drawn;
      stats.triangles = triangles;
      stats.megabytes = Number((bytes / 1048576).toFixed(1));
    },
  };
}
