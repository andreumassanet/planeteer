import * as THREE from 'three';
import type { LandRing, World } from './geo.ts';
import { PLANET_RADIUS, angleForSag, coastEdges, onSphere } from './globe.ts';
import { biomeAt, biomeSample } from './biome.ts';
import { MOSAIC_WATER, OCEAN_COLOR, PALETTE, createToonRamp } from './theme.ts';
import { fbm } from './terrain.ts';
import { detail } from './view.ts';

/**
 * The sea.
 *
 * It used to be one line of `globe.ts`: an icosphere at `PLANET_RADIUS` with
 * every vertex painted the same `OCEAN_COLOR`. Seven tenths of the planet was a
 * single flat blue, and the user's word for it was exact — *una capa azul y ya*.
 *
 * **What the sea is here is not scenery, it is a mechanic**, and that is the
 * constraint every idea below had to survive. Walk down a beach and you are in
 * the boat; `vehicles.ts`'s `isWater` is a predicate on *ground* height
 * (`<= PLANET_RADIUS + 0.5`), so what keeps the walking-on-water bug deleted is
 * that the land never comes below `SHORE_LIP`, four units. Nothing in this file
 * touches the ground, and nothing in it displaces the water surface downward, so
 * the whole of that arrangement is untouched — see `OCEAN_SAG` below for the one
 * number that could have been spent and was not.
 *
 * Three things are built, and the split is by what each can afford to resolve:
 *
 * - **The water sphere** carries what varies over thousands of units: sea
 *   surface temperature and the basins. It is smooth, coarse and free.
 * - **The shallows** are a ribbon laid along every coastline in the world, at
 *   the resolution the outlines have, carrying the shelf, the shoals and the
 *   surf. Everything that has to line up with a coast is here, because the
 *   sphere cannot resolve a coast at all.
 * - **The glitter** is the sun's own path on the water, rebuilt every frame from
 *   where the camera and the light actually are.
 */

const DEG = Math.PI / 180;

/**
 * Subdivision of the water sphere, and **what sets it changed**.
 *
 * It used to be derived from the sag alone: a flat triangle spanning an angle
 * dips below the sphere at its centre, and if that dip were deeper than the
 * shallowest ground on the planet the water would close over the smallest
 * islands. `SHORE_LIP` is four units, the sag budget was 1.5, and `pnpm check`
 * asserts the two against each other.
 *
 * That is still true and it is no longer what binds, because the sphere now
 * carries a **colour field** — the depth ramp below, driven by a distance to
 * the nearest land computed on the sphere's own vertices. The shallows hand off
 * to it at `SHELF`, 430 units, and at the old detail 40 the vertex spacing was
 * 443: the first sphere vertex outside the ribbon was a whole ribbon-width away,
 * so the handoff was a 443-unit linear ramp that could not follow a coast and
 * the ribbon read as a decal with a hard edge. At detail 80 the spacing is 221
 * and there are two vertices inside the next ribbon-width.
 *
 * The sag comes along for free and the margin **improves**: 1.46 units of dip
 * against a four-unit lip becomes 0.37, from a fifth of the shelf to a
 * twentieth. Nothing here spends it.
 *
 * **And nothing here displaces the surface, which is the finding rather than an
 * omission.** The obvious way to make a sea look like a sea is waves, waves are
 * displacement, and displacement is spent out of exactly this margin. The
 * arithmetic that killed them is in `SHALLOW_ROWS` below: in this style a wave
 * is only visible where the *normal* turns, and on any sphere this project can
 * afford that wave would have to be taller than the coastal lip is deep. The
 * motion is somewhere else — see `FOAM_REACH`.
 */
const OCEAN_SAG = 0.4;
const OCEAN_DETAIL = Math.ceil(63.4349 / (angleForSag(OCEAN_SAG) / DEG)) - 1;

/**
 * How far out from the coast the shallows reach, in world units.
 *
 * A real continental shelf runs 50 to 200 km out and one unit is 0.4 km, so 430
 * is 172 km — the middle of the real range, chosen from the other end. From the
 * plane's ceiling the camera is 2.45 radii out and the globe subtends 47.8
 * degrees of a 55 degree lens, which puts about 48 units on a pixel: a 430-unit
 * shelf is a **9 pixel** fringe around every continent, and 130 — the width of
 * the shore ramp, the other candidate — is 2.7, a hairline. From the ground it
 * is a third of the on-foot fog, so the near sea is shelf and the far sea is
 * ocean, which is the read a coast actually has.
 */
const SHELF = 430;

/**
 * Where the water is as dark as it gets, in world units from the nearest land.
 *
 * The other end of the same ramp, and the one the view from the ceiling is
 * made of. It is not a depth — this planet has no bathymetry — it is distance
 * from land, which on the real Earth is most of what decides the colour of the
 * open sea anyway: the shelves are near the coasts and the abyssal plains are
 * not. 2,600 units is 1,040 km, so the Mediterranean, the North Sea, the
 * Caribbean, Hudson Bay and the Sunda shelf are all in the pale half and only
 * the middle of an ocean is at the dark end.
 */
const ABYSS = 2600;

/**
 * The widest a quad of the ribbon may be, in world units, in **either**
 * direction.
 *
 * A quad spanning `w` units of arc dips `w^2 / 8R` below the chord between its
 * ends, and the ribbon floats only `LIFT_SHELF` over a sphere whose own vertices
 * are at exactly `PLANET_RADIUS`. The two dips are perpendicular and they add at
 * the quad's centre, so the budget is halved: 0.12 units each, which is 124
 * units of width, 0.24 together against a 0.35 lift.
 *
 * **It binds along the shore as well as across it, and that half was missing.**
 * The bands were sized this way from the start; the *spans* were whatever the
 * outlines happened to give, and the outlines are not uniform — median 19.4
 * units, p99 108, and a longest sea-facing edge of **1,578**, which is a quad
 * that plunges **19.5 units** below sea level in the middle. About 1% of spans
 * are over the limit, so splitting them costs about 1% more triangles and closes
 * a hole that was there from the first build.
 */
const MAX_QUAD = Math.sqrt(8 * PLANET_RADIUS * 0.12);

/**
 * How far the shallows reach and how finely they follow the coast, both from
 * `atlas.detail()`.
 *
 * **The ribbon scales with the knob and the water sphere does not, and that
 * split is the whole of it.** The knob turns the world down to a tenth — at 0.25
 * the vegetation is 25,000 triangles and a handful of towns are standing — and a
 * sea that went on spending three quarters of a million is not a knob anyone can
 * trust. But the two halves of the sea are not the same kind of thing:
 *
 * - **The sphere carries the orbital read**, which is the view the knob is least
 *   able to give up: you climb to see the planet. It is also the cheap half —
 *   124,820 triangles and 11 MB against the ribbon's 458,816 and 35 — and, most
 *   of all, when the ribbon shrinks *the sphere has to carry more of the depth
 *   ramp, not less*. Turning it down at low detail would make the low-detail
 *   world worse in exactly the band the ribbon has just stopped covering. So it
 *   is fixed, the way the land mesh is.
 * - **The ribbon refines what the sphere already says.** Its 430 units are a
 *   fringe nine pixels wide from the plane's ceiling and the whole of the near
 *   sea from a beach, so shortening it and coarsening it is a level-of-detail
 *   decision in the ordinary sense: less of the thing that only sharpens an
 *   answer that is already there.
 *
 * `SHELF` itself does not scale past 1. It is 172 km because a continental shelf
 * is, and it is capped rather than grown for the same reason `MIN_PIXELS_FLOOR`
 * caps the other end of the knob: past a point more detail should buy *finer*
 * and not *bigger*. What detail above 1 buys is the tolerance below, and it runs
 * out at the outlines themselves — 57,352 spans is the data, and there is
 * nothing finer to build.
 *
 * **It is read once, when the sea is built.** `[` and `]` move every streamer on
 * the next frame and they do not move this, for the same reason they do not move
 * the land mesh or the cloud deck: it is a one-second rebuild, not a rescan. The
 * knob survives a reload in `localStorage`, so the setting still arrives — one
 * page load late.
 */
const SHELF_TOLERANCE = 3;
const SHELF_TOLERANCE_MAX = 10;

/** How far the shallows reach at this detail, in world units. */
function shelfReach(d: number): number {
  return Math.min(SHELF, SHELF * d);
}

/**
 * How far the ribbon's inner edge may cut the corner of a bay, in world units.
 *
 * The decimation is what buys most of the saving — the outlines carry 57,352
 * sea-facing edges at a median of 19.4 units, which is four times finer than the
 * narrowest band — and what it costs is exactness at the waterline: on a concave
 * stretch the chord runs *seaward* of the coast by up to this much. Ten units is
 * a wave and a half of the surf's own reach, which is why it is capped there and
 * why the innermost row is inset by the tolerance as well: the ribbon's first row
 * stays inland of the true coast at every detail, so there is never a strip of
 * bare water between the land and the foam.
 */
function shelfTolerance(d: number): number {
  return Math.min(SHELF_TOLERANCE_MAX, SHELF_TOLERANCE / d);
}

/**
 * Rows across the ribbon, in world units from the coastline, at this detail.
 *
 * The first is inland — see the tolerance above. The rest divide the reach into
 * bands no wider than `MAX_QUAD`, evenly, which is what makes the band count
 * fall out of the reach rather than being a second number: 4 bands at detail 1
 * and above, 3 at a half, 2 at a quarter.
 *
 * **This is where the waves died.** `MeshToonMaterial` steps a four-band ramp,
 * so a wave is visible only where the normal turns far enough to cross a band —
 * about 30 degrees, a gradient of 0.58. A sinusoid of wavelength `L` reaches
 * that at an amplitude of `0.58 L / 2pi`. The finest wavelength a sphere can
 * carry is about four vertex spacings, so:
 *
 * ```
 *   detail   faces        spacing   finest wave   amplitude needed
 *   40        33,620      443 u     1,772 u       164 u
 *   160      518,420      110 u       440 u        41 u
 *   1,770     62.7 M       10 u        40 u         3.7 u
 * ```
 *
 * The coastal lip is **four units** and the boat's deck sits two above the
 * water. So the only row that gives a wave small enough not to flood the beach
 * is the one with sixty-two million faces, and the two affordable rows ask for
 * a swell four to forty times deeper than the entire coastal step — which is
 * not a rough sea, it is a mountain range with a boat in it. A local patch that
 * follows the player fails the same test from the other side: at a 40-unit
 * wavelength the amplitude is still 3.7 units against a boat that floats at a
 * fixed radius and would spend half of every cycle submerged. Waves are not a
 * triangle problem here and no budget fixes them.
 */
function shallowRows(d: number): number[] {
  const reach = shelfReach(d);
  const surf = Math.min(SURF_WIDTH, reach * 0.5);
  const rows = [-(SHORE_INSET + shelfTolerance(d)), surf];
  const outer = reach - surf;
  const bands = Math.max(1, Math.ceil(outer / MAX_QUAD));
  for (let i = 1; i <= bands; i++) rows.push(surf + (outer * i) / bands);
  return rows;
}

/** The inner band, which is where the surf is drawn. */
const SURF_WIDTH = 22;
/** How far inside the coastline the ribbon starts, before the tolerance. */
const SHORE_INSET = 6;
/**
 * What the packed `aShore.x` is offset by, so the inland row is a positive
 * integer. The innermost row is `-(SHORE_INSET + tolerance)`, at worst -16.
 */
const SHORE_BIAS = 32;

/**
 * How high the ribbon floats over the water sphere, at the coast and at the
 * shelf edge.
 *
 * Two jobs, and the second is the reason it is a gradient rather than a number.
 *
 * It has to **clear the sphere**: a quad of the ribbon dips up to `MAX_QUAD`'s
 * budget below the line between its corners in each of two perpendicular
 * directions, 0.24 units together, and the sphere's vertices are at exactly
 * `PLANET_RADIUS`. The outer end has a margin of about 1.5 on that.
 *
 * And it has to **resolve a strait**. Two coasts closer together than twice the
 * shelf both grow a ribbon over the water between them — the Channel, the
 * Adriatic, the Aegean, half of Indonesia — and two opaque sheets at the same
 * height are a depth tie, which renders as a stippled flicker rather than as
 * water. With the lift falling as the distance from *its own* coast rises, the
 * nearer coast's ribbon is always the higher one and the depth buffer draws the
 * medial axis of the strait for free. The two agree in colour where they meet,
 * because both are a function of the same distance, so the seam is invisible
 * rather than merely resolved.
 *
 * The inner value is capped by the boat, which floats at a fixed
 * `PLANET_RADIUS` and does not know this file exists: 0.75 units is a ninth of
 * the avatar, so the hull sits a little into the surf at the shore and level
 * with the sea everywhere else.
 */
const LIFT_COAST = 0.75;
const LIFT_SHELF = 0.35;

/**
 * The foam, as a distance from the coast in world units: the shortest it ever
 * pulls back to, and how far it runs up.
 *
 * **This is the whole of the sea's movement and it is drawn rather than
 * displaced.** Nothing here moves a vertex — the geometry is built once and
 * never touched — and the surf is a mix computed in the fragment shader against
 * two things the mesh carries per vertex: how far this point is from the coast,
 * and how far along the coast it is. A wave is then a phase running along the
 * shoreline, which is what a beach actually looks like from a hundred units up
 * and costs one uniform.
 *
 * It is also the only kind of motion that survives the argument above: a foam
 * line is a *colour* edge, so it does not need a normal to turn, does not spend
 * the sag margin, does not move the water the boat floats on, and does not care
 * that the sphere under it is 443 units to a triangle.
 *
 * The two wavelengths are in units along the shore and both divide `PHASE_WRAP`
 * exactly, so the phase can be wrapped on a long ring — Antarctica's is 190,000
 * units — without a step where it wraps.
 */
const FOAM_REACH = 3;
const FOAM_SWING = 11;
/**
 * How much of the water the foam covers where it is strongest.
 *
 * **Not 1, and the first version was.** Solid foam at 32 units wide rendered as
 * a cream halo round every island — measured from the plane's circuit at 320
 * units, a band 60 to 80 units across in the same `sand` the beach behind it is
 * painted, so it read as a *sandbar* and not as surf. Two things were wrong and
 * both are here: it was three times too wide, and being opaque cream it had no
 * water left in it. At 0.86 over a turquoise shoal the wash stays cool, and at
 * 3 to 14 units it is a line along the shore rather than a field beside it.
 */
const FOAM_STRENGTH = 0.86;
const FOAM_WAVELENGTH = 900;
const FOAM_WAVELENGTH_2 = 500;
const FOAM_PERIOD = 11;
const FOAM_PERIOD_2 = 7;
const PHASE_WRAP = 90000;

/**
 * Cells the ribbon is cut into, so the frustum can throw most of it away.
 *
 * One mesh for the whole planet is 459,000 triangles that are always submitted;
 * `view.ts` is not involved because the sea is not streamed — like the cloud
 * deck it is built once, at one resolution everywhere, because from the ceiling
 * it is most of what you are looking at. Cutting it into cells gets the frustum
 * back without a streamer.
 */
const CHUNK_COLS = 16;
const CHUNK_ROWS = 8;

/**
 * The water's own colours, derived from `OCEAN_COLOR` rather than picked.
 *
 * The 2D maps — `minimap.ts`, `map.ts`, the HUD — paint the sea as one flat
 * `OCEAN_COLOR`, and they are right to: a sheet of paper has no depth on it. So
 * the sphere's colours are that same blue moved in two directions and nothing
 * else, which keeps the map and the planet the same sea.
 *
 * **Temperature comes from `biome.ts` and not from a copy of it.** `biomeAt` at
 * zero elevation is exactly `1 - |lat| / 86.7`, the one warmth model on the
 * planet, so the turquoise starts where the sand starts (`SHORE_WARM0` in
 * `globe.ts` fades sand in over warmth 0.30 to 0.50) and a cold coast gets grey
 * water above a shingle beach without either file naming a latitude.
 */
// **The open ocean *is* `OCEAN_COLOR`, exactly**, and that is the anchor rather
// than a tuned value: it is what the flat maps paint, most of the sea is at the
// deep end of the ramp, so the planet and the sheet of paper agree by
// construction and `pnpm check` measures the residue. Everything shallower is
// brighter than it and everything colder is darker.
const deepWarm = new THREE.Color(OCEAN_COLOR);
const deepCold = new THREE.Color(OCEAN_COLOR)
  .lerp(new THREE.Color(PALETTE.steel), 0.30)
  .multiplyScalar(0.66);
// **The shelf was half this far from the deep and it did not read.** Measured
// from the plane's circuit at 320 units, where the frame spans about 5,600 units
// of sea and the whole shelf-to-abyss ramp is inside it, the first version's
// luminance ratio of 1.40 was invisible: the water came out one blue with a
// white line round the island. At 1.77 warm and 2.78 cold the margin is a band
// you can see, and it costs nothing — the tones are the same two palette entries
// mixed further.
const shelfWarm = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.60);
const shelfCold = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.bone), 0.30);
const shoalWarm = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.92);
const shoalCold = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.bone), 0.52);
/**
 * The wash itself: `white`, not `cream`.
 *
 * `cream` is the palette's warm off-white and it is two steps from `sand`, which
 * is what `globe.ts` paints a warm beach with — so a cream surf against a sand
 * beach is the same colour twice and the waterline disappears into the shore.
 * `white` is cooler, and what keeps it from reading as paint is that it is mixed
 * at `FOAM_STRENGTH` over the turquoise underneath rather than replacing it.
 */
const FOAM_COLOR = new THREE.Color(PALETTE.white);

/** Basin variation: one slow noise, so no two oceans are the same flat tone. */
const BASIN_FREQUENCY = 3.2;
const BASIN_DEPTH = 0.20;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const waterSample = biomeSample();
const waterDeep = new THREE.Color();
const waterShelf = new THREE.Color();
const waterShoal = new THREE.Color();

/**
 * The three tones this patch of sea runs between: shoal, shelf and deep.
 *
 * **It is separated from the depth ramp because of what each half costs.** The
 * profile asks `biomeAt` for the warmth and a three-octave noise for the basin,
 * which is about a microsecond; the ramp is three lerps. The ribbon has
 * 1.4 million vertices and only 57,000 *points* — every vertex of a band shares
 * its point's profile — so evaluating the expensive half per point and the cheap
 * half per vertex is the difference between 90 ms and a second and a half.
 *
 * Nine numbers written into `out`, so the loop that fills a buffer allocates
 * nothing.
 */
function waterProfile(ux: number, uy: number, uz: number, out: Float64Array, offset: number): void {
  const lat = Math.asin(clamp(uy, -1, 1)) / DEG;
  const lon = Math.atan2(-uz, ux) / DEG;
  // Zero elevation, so this is the warmth term and nothing else — the sea has
  // no relief to lapse against. Going through `biomeAt` rather than writing the
  // line out is what stops the coast and the water disagreeing about the
  // tropics when somebody re-fits the model.
  biomeAt(ux, uy, uz, lat, lon, 0, waterSample);
  const warm = smoothstep(0.20, 0.72, waterSample.warmth);
  // The noise is on the *lightness* only and it is small, for the same reason
  // `biome.ts` keeps its own noise small: it is there so a basin is not a flat
  // wash, not so the map is a surprise.
  const basin = 1 + BASIN_DEPTH * (fbm(ux * BASIN_FREQUENCY, uy * BASIN_FREQUENCY, uz * BASIN_FREQUENCY, 3) - 0.5);

  waterShoal.copy(shoalCold).lerp(shoalWarm, warm).multiplyScalar(basin);
  waterShelf.copy(shelfCold).lerp(shelfWarm, warm).multiplyScalar(basin);
  waterDeep.copy(deepCold).lerp(deepWarm, warm).multiplyScalar(basin);
  out[offset] = waterShoal.r; out[offset + 1] = waterShoal.g; out[offset + 2] = waterShoal.b;
  out[offset + 3] = waterShelf.r; out[offset + 4] = waterShelf.g; out[offset + 5] = waterShelf.b;
  out[offset + 6] = waterDeep.r; out[offset + 7] = waterDeep.g; out[offset + 8] = waterDeep.b;
}

/**
 * The depth ramp: where between shoal, shelf and deep a point `distance` units
 * from the coast sits.
 *
 * **Two ramps rather than one.** A single lerp from shoal to deep spends the
 * whole of the colour change in the first hundred units and leaves the rest of
 * the shelf reading as open ocean, which is the flat blue this file exists to
 * delete. The shelf tone holds the middle third.
 *
 * **And the second ramp runs to `ABYSS`, not to the shelf edge, which is what
 * the view from the plane's ceiling is made of.** The ribbon stops at 430 units
 * and the sphere carries the rest, so a ramp that had finished by then would
 * leave five sixths of the planet a single blue again — which was measured from
 * orbit and is exactly what it looked like. Running it out to 2,600 units
 * instead gives every landmass a graded margin 54 pixels wide at that distance,
 * puts the enclosed seas (the North Sea reaches 700 units from land, the
 * Mediterranean about 900, the Persian Gulf 200) in the pale half of the ramp,
 * and leaves only the middle of an ocean basin at the dark end. That is the
 * structure the real thing has from space, and it costs one term.
 */
function depthMix(profile: Float64Array, offset: number, distance: number, target: THREE.Color): THREE.Color {
  const toShelf = smoothstep(0, SHELF * 0.44, distance);
  const toDeep = smoothstep(SHELF * 0.54, ABYSS, distance);
  const shoalR = profile[offset]!, shoalG = profile[offset + 1]!, shoalB = profile[offset + 2]!;
  const shelfR = profile[offset + 3]!, shelfG = profile[offset + 4]!, shelfB = profile[offset + 5]!;
  const deepR = profile[offset + 6]!, deepG = profile[offset + 7]!, deepB = profile[offset + 8]!;
  const r = shoalR + (shelfR - shoalR) * toShelf;
  const g = shoalG + (shelfG - shoalG) * toShelf;
  const b = shoalB + (shelfB - shoalB) * toShelf;
  // Set in the working space, which is where the profile's numbers already are:
  // they came out of `THREE.Color`, and a colour space argument here would
  // convert them a second time.
  return target.setRGB(
    r + (deepR - r) * toDeep,
    g + (deepG - g) * toDeep,
    b + (deepB - b) * toDeep,
  );
}

const singleProfile = new Float64Array(9);

/** Both halves at once, for the sphere, which asks once per vertex. */
function waterColor(
  ux: number,
  uy: number,
  uz: number,
  distance: number,
  target: THREE.Color,
): THREE.Color {
  waterProfile(ux, uy, uz, singleProfile, 0);
  return depthMix(singleProfile, 0, distance, target);
}

/**
 * Outline width for the water sphere.
 *
 * The same 0.005 the land uses, and it is doing one job: the planet's limb
 * against the sky from the air. The shallows below get no ink at all — see
 * `shallowsMaterial`.
 */
const OUTLINE_THICKNESS = 0.005;

/** The water sphere: temperature, basins, and nothing that needs a coastline. */
function buildWater(world: World): {
  mesh: THREE.Mesh;
  wet: number;
  deepest: number;
  medianDepth: number;
  mean: [number, number, number];
} {
  const geometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, OCEAN_DETAIL);
  const position = geometry.getAttribute('position');
  const count = position.count;

  // The sphere is non-indexed, so the same vertex arrives five or six times.
  // Deduplicating is what makes everything below affordable: 393,660 slots
  // collapse to 65,522 places.
  const index = new Int32Array(count);
  const unique: number[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const x = position.getX(i) / PLANET_RADIUS;
    const y = position.getY(i) / PLANET_RADIUS;
    const z = position.getZ(i) / PLANET_RADIUS;
    const key = `${Math.round(x * 4e5)},${Math.round(y * 4e5)},${Math.round(z * 4e5)}`;
    let at = seen.get(key);
    if (at === undefined) {
      at = unique.length / 3;
      seen.set(key, at);
      unique.push(x, y, z);
    }
    index[i] = at;
  }
  const places = unique.length / 3;

  /**
   * How far each vertex is from the nearest land, along the sphere's own edges.
   *
   * **This is a distance to water and it is not a third copy of one.**
   * `terrain.ts` owns two and neither answers it: `shoreDistance` is a chamfer
   * transform whose cells are only filled over *land* — it is zero everywhere at
   * sea, which is the half of the planet this file is about — and the fine shore
   * index is gated to `SHORE_RAMP`, 130 units, which is a fifth of the ribbon and
   * a fiftieth of the ramp the open ocean needs. Neither is wrong; both were
   * built to answer "how far inland am I".
   *
   * So it is not a field at all. It is a multi-source Dijkstra over the
   * **sphere's own vertex graph**, seeded at every vertex the outlines call land
   * and relaxed along the edges the mesh already has. That is the right shape for
   * three reasons: the resolution is exactly the resolution of the thing being
   * coloured, there is no grid to alias against a coastline, and it costs one
   * `countryAt` per place — the same 65,522 the colour is already paying for.
   *
   * What it is *not* is exact near a coast. A vertex is land or it is not, so the
   * true waterline sits somewhere inside the last edge and the answer carries
   * half a spacing, about 110 units, of error. That does not matter here and it
   * is why the ribbon exists: the first 430 units are drawn from the outlines
   * themselves, and this only has to be right about the 2,600-unit ramp beyond.
   */
  const distance = new Float64Array(places).fill(Infinity);
  const heap: number[] = [];
  let wet = 0;
  for (let p = 0; p < places; p++) {
    const x = unique[p * 3]!;
    const y = unique[p * 3 + 1]!;
    const z = unique[p * 3 + 2]!;
    const lat = Math.asin(clamp(y, -1, 1)) / DEG;
    const lon = Math.atan2(-z, x) / DEG;
    if (world.countryAt(lat, lon) !== 0) distance[p] = 0;
    else wet++;
  }

  // Adjacency from the triangles, both ways, deduplicated by a set per vertex.
  const neighbours: number[][] = Array.from({ length: places }, () => []);
  for (let t = 0; t < count; t += 3) {
    const a = index[t]!;
    const b = index[t + 1]!;
    const c = index[t + 2]!;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      if (!neighbours[u]!.includes(v)) neighbours[u]!.push(v);
      if (!neighbours[v]!.includes(u)) neighbours[v]!.push(u);
    }
  }

  // A binary heap keyed on distance. Edges are all within a few percent of each
  // other, so a bucket queue would do as well; this is 65,522 places and the
  // whole relaxation is milliseconds either way.
  const push = (value: number, at: number): void => {
    heap.push(value, at);
    let i = heap.length / 2 - 1;
    while (i > 0) {
      const parent = ((i - 1) >> 1);
      if (heap[parent * 2]! <= heap[i * 2]!) break;
      const dv = heap[i * 2]!, di = heap[i * 2 + 1]!;
      heap[i * 2] = heap[parent * 2]!; heap[i * 2 + 1] = heap[parent * 2 + 1]!;
      heap[parent * 2] = dv; heap[parent * 2 + 1] = di;
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0]!, heap[1]!];
    const size = heap.length / 2 - 1;
    heap[0] = heap[size * 2]!; heap[1] = heap[size * 2 + 1]!;
    heap.length = size * 2;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = i * 2 + 2;
      let small = i;
      if (l < size && heap[l * 2]! < heap[small * 2]!) small = l;
      if (r < size && heap[r * 2]! < heap[small * 2]!) small = r;
      if (small === i) break;
      const dv = heap[i * 2]!, di = heap[i * 2 + 1]!;
      heap[i * 2] = heap[small * 2]!; heap[i * 2 + 1] = heap[small * 2 + 1]!;
      heap[small * 2] = dv; heap[small * 2 + 1] = di;
      i = small;
    }
    return top;
  };
  for (let p = 0; p < places; p++) if (distance[p] === 0) push(0, p);
  let deepest = 0;
  while (heap.length > 0) {
    const [d, p] = pop();
    if (d > distance[p]!) continue;
    if (d > deepest) deepest = d;
    // Nothing past the ramp needs an accurate answer, and stopping there is what
    // keeps this linear in the ocean rather than in the planet.
    if (d >= ABYSS) continue;
    const ax = unique[p * 3]!, ay = unique[p * 3 + 1]!, az = unique[p * 3 + 2]!;
    for (const q of neighbours[p]!) {
      const step = Math.hypot(unique[q * 3]! - ax, unique[q * 3 + 1]! - ay, unique[q * 3 + 2]! - az) * PLANET_RADIUS;
      const next = d + step;
      if (next < distance[q]!) {
        distance[q] = next;
        push(next, q);
      }
    }
  }

  const colors = new Uint8Array(count * 3);
  const color = new THREE.Color();
  const placeColor = new Uint8Array(places * 3);
  // The mean is taken over the **wet** vertices only, and that is not tidiness.
  // 29% of this sphere is under the land mesh, at distance zero, painted the
  // brightest shoal there is; averaging those in reports a sea a third paler
  // than the one anybody can see, which is what it did.
  const mean: [number, number, number] = [0, 0, 0];
  const depths: number[] = [];
  for (let p = 0; p < places; p++) {
    const x = unique[p * 3]!, y = unique[p * 3 + 1]!, z = unique[p * 3 + 2]!;
    const depth = Math.min(distance[p]!, ABYSS);
    waterColor(x, y, z, depth, color);
    placeColor[p * 3] = Math.round(clamp(color.r, 0, 1) * 255);
    placeColor[p * 3 + 1] = Math.round(clamp(color.g, 0, 1) * 255);
    placeColor[p * 3 + 2] = Math.round(clamp(color.b, 0, 1) * 255);
    if (distance[p]! > 0) {
      mean[0] += color.r; mean[1] += color.g; mean[2] += color.b;
      depths.push(depth);
    }
  }
  const wetCount = Math.max(1, depths.length);
  mean[0] /= wetCount;
  mean[1] /= wetCount;
  mean[2] /= wetCount;
  depths.sort((a, b) => a - b);
  // The mosaic on the water: every face of the sphere a few percent off its
  // neighbours, which is the same per-facet jitter the reference gives its
  // sea. **Per face and not per place**: a place is shared by six faces, and a
  // factor on it would interpolate into a smooth gradient, where the facet is
  // the unit the eye is meant to see — the sphere is non-indexed for exactly
  // this. A multiplier on all three channels, so the hue holds and only the
  // lightness moves; see `MOSAIC_WATER`. Only the sphere: the shallows are a
  // colour *step* along a coast and a jitter on a band four cells wide reads
  // as dirt in the surf, and the glitter is rebuilt every frame. The mean
  // above is taken before this, so `atlas.ocean.stats` reports the sea's
  // colour and not the jitter's.
  const [waterLow, waterHigh] = MOSAIC_WATER;
  for (let i = 0; i < count; i++) {
    const p = index[i]!;
    const tone = waterLow + (waterHigh - waterLow) * hash((i / 3) | 0, 7);
    colors[i * 3] = Math.min(255, Math.round(placeColor[p * 3]! * tone));
    colors[i * 3 + 1] = Math.min(255, Math.round(placeColor[p * 3 + 1]! * tone));
    colors[i * 3 + 2] = Math.min(255, Math.round(placeColor[p * 3 + 2]! * tone));
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
  // Nothing samples a map on this, and the UVs are a third of its buffer.
  geometry.deleteAttribute('uv');

  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { thickness: OUTLINE_THICKNESS, color: [0.11, 0.02, 0.01] };
  const mesh = new THREE.Mesh(geometry, material);
  // `atlas.scene.getObjectByName('ocean')` is in the debugging notes and is
  // still the sphere: it is what "sea level" means.
  mesh.name = 'ocean';
  // A cliff's shadow falls on the water. Receives, never casts.
  mesh.receiveShadow = true;
  return { mesh, wet, deepest, medianDepth: Math.round(depths[depths.length >> 1] ?? 0), mean };
}

/**
 * The material the shallows wear.
 *
 * `MeshToonMaterial` with two things bolted on, and the reason it can carry a
 * custom vertex shader at all is that it is the one surface in this project
 * with **no ink**. `OutlineEffect` builds its own program from its own source
 * and knows nothing about an `onBeforeCompile`, so a displaced or re-coloured
 * surface and its hull disagree — which is why the water sphere, which does
 * have an outline, is left alone. The shallows declare
 * `outlineParameters.visible: false` and are free.
 *
 * **And no ink is the right answer here rather than a concession.** Ink in this
 * project marks an object: a house, a monument, the edge of a continent. A
 * shelf is not an object, it is a change of depth, and a black line around every
 * coast at 430 units out would be a second coastline competing with the real
 * one. What draws the shelf is the colour step, which is what a painted map
 * does.
 */
function shallowsMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
  });
  material.userData.outlineParameters = { visible: false };
  const uniforms = {
    uTime: { value: 0 },
    uFoam: { value: FOAM_COLOR.clone() },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uniforms.uTime;
    shader.uniforms['uFoam'] = uniforms.uFoam;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aShore;\nvarying vec2 vShore;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vShore = aShore;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vShore;
uniform float uTime;
uniform vec3 uFoam;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    // Two swells running along the shoreline at different rates, so the surf
    // is a phase travelling down a beach rather than the whole coast of a
    // continent flashing at once.
    float a = sin(vShore.y * ${(2 * Math.PI / FOAM_WAVELENGTH).toFixed(8)} - uTime * ${(2 * Math.PI / FOAM_PERIOD).toFixed(6)});
    float b = sin(vShore.y * ${(2 * Math.PI / FOAM_WAVELENGTH_2).toFixed(8)} + uTime * ${(2 * Math.PI / FOAM_PERIOD_2).toFixed(6)} + 1.7);
    float reach = ${FOAM_REACH.toFixed(1)} + ${FOAM_SWING.toFixed(1)} * clamp(0.5 + 0.34 * a + 0.16 * b, 0.0, 1.0);
    // The wash is solid to two thirds of its reach and feathers out over the
    // last third, which is what stops it reading as a painted stripe.
    float foam = 1.0 - smoothstep(reach * 0.45, reach, vShore.x - ${SHORE_BIAS}.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam * ${FOAM_STRENGTH.toFixed(2)});
  }`,
      );
  };
  // Two materials that compile to different programs must not share a cache
  // key, and Three keys on the source plus this.
  material.customProgramCacheKey = () => 'atlas-shallows';
  return material;
}

/**
 * The shallows: one ribbon along every coastline in the world.
 *
 * **A ring boundary is not a coastline**, and that is the trap this shares with
 * `terrain.ts`'s shore index and with `borders.ts`. The rings are *country*
 * outlines, so 40% of their edges are land frontiers, and a surf line down the
 * Rhine is the same bug as a trench down it. `coastEdges` in `globe.ts` is the
 * one answer to that question now, computed once for all three.
 */
function buildShallows(
  world: World,
  d: number,
): { meshes: THREE.Mesh[]; spans: number; triangles: number; rows: number[]; tolerance: number } {
  const seaward = coastEdges(world);
  const rows = shallowRows(d);
  const tolerance = shelfTolerance(d);
  const reach = shelfReach(d);
  const bands = rows.length - 1;

  /** One bucket per lat/lon cell, so the frustum has something to cull. */
  const cells = new Map<number, { position: number[]; normal: number[]; color: number[]; shore: number[] }>();
  const bucketFor = (lat: number, lon: number) => {
    const r = clamp(Math.floor(((90 - lat) / 180) * CHUNK_ROWS), 0, CHUNK_ROWS - 1);
    const c = clamp(Math.floor(((lon + 180) / 360) * CHUNK_COLS), 0, CHUNK_COLS - 1);
    const id = r * CHUNK_COLS + c;
    let bucket = cells.get(id);
    if (bucket === undefined) {
      bucket = { position: [], normal: [], color: [], shore: [] };
      cells.set(id, bucket);
    }
    return bucket;
  };

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const along = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const chord = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const color = new THREE.Color();

  /**
   * The current run, as the outlines give it: a maximal stretch of consecutive
   * sea-facing edges, and how far along the ring each of its points stands.
   *
   * It is collected raw and *then* resampled, which is the order that matters:
   * the outward direction and the mitre at a kept point have to be built from
   * the neighbours it actually ends up with, not from the ones the decimation
   * is about to throw away.
   */
  let rawAt: THREE.Vector3[] = [];
  let rawPhase: number[] = [];

  let spans = 0;
  let triangles = 0;

  /** The resampled run: point, sea direction, mitre length, phase. */
  let runAt: THREE.Vector3[] = [];
  let runOut: THREE.Vector3[] = [];
  let runMitre: number[] = [];
  let runPhase: number[] = [];

  /** Rows of the ribbon, laid out per run point: position, colour. */
  let rowAt: Float64Array = new Float64Array(0);
  let rowColor: Float64Array = new Float64Array(0);
  let profiles: Float64Array = new Float64Array(0);

  const point = new THREE.Vector3();

  const pushVertex = (
    bucket: { position: number[]; normal: number[]; color: number[]; shore: number[] },
    index: number,
    row: number,
  ): void => {
    const at = (index * rows.length + row) * 3;
    const x = rowAt[at]!;
    const y = rowAt[at + 1]!;
    const z = rowAt[at + 2]!;
    bucket.position.push(x, y, z);
    const inverse = 1 / Math.hypot(x, y, z);
    bucket.normal.push(x * inverse, y * inverse, z * inverse);
    bucket.color.push(rowColor[at]!, rowColor[at + 1]!, rowColor[at + 2]!);
    bucket.shore.push(rows[row]!, runPhase[index]!);
  };

  /**
   * Resamples the raw run: merges what is straighter than `tolerance`, splits
   * what is longer than `MAX_QUAD`, and keeps the arc length as the phase.
   *
   * Both halves are the same rule — a quad may not be wider than `MAX_QUAD` in
   * either direction, and it need not be finer than the tolerance — and neither
   * of them existed before. The merge is what the detail knob buys; the split
   * closes a hole the outlines had all along, where a 1,578-unit edge made a
   * quad that dipped nineteen units under the sea.
   */
  const resample = (): void => {
    runAt = [];
    runPhase = [];
    const n = rawAt.length;
    if (n < 2) return;

    let anchor = 0;
    runAt.push(rawAt[0]!.clone());
    runPhase.push(rawPhase[0]!);
    while (anchor < n - 1) {
      let end = anchor + 1;
      // Extend while everything skipped stays inside the tolerance and the
      // chord stays inside one quad's width.
      while (end + 1 < n) {
        const span = rawAt[anchor]!.angleTo(rawAt[end + 1]!) * PLANET_RADIUS;
        if (span > MAX_QUAD) break;
        chord.subVectors(rawAt[end + 1]!, rawAt[anchor]!);
        const length = chord.length();
        if (length === 0) break;
        chord.multiplyScalar(1 / length);
        let worst = 0;
        for (let k = anchor + 1; k <= end; k++) {
          offset.subVectors(rawAt[k]!, rawAt[anchor]!);
          offset.addScaledVector(chord, -offset.dot(chord));
          worst = Math.max(worst, offset.length() * PLANET_RADIUS);
        }
        if (worst > tolerance) break;
        end++;
      }
      // And split what one step of the outline already exceeds.
      const span = rawAt[anchor]!.angleTo(rawAt[end]!) * PLANET_RADIUS;
      const pieces = end === anchor + 1 ? Math.max(1, Math.ceil(span / MAX_QUAD)) : 1;
      for (let piece = 1; piece <= pieces; piece++) {
        const t = piece / pieces;
        runAt.push(rawAt[anchor]!.clone().lerp(rawAt[end]!, t).normalize());
        runPhase.push((rawPhase[anchor]! + (rawPhase[end]! - rawPhase[anchor]!) * t) % PHASE_WRAP);
      }
      anchor = end;
    }

    // The sea's direction at each kept point, and the mitre that makes two
    // bands meet rather than leaving a wedge on the outside of every turn.
    runOut = [];
    runMitre = [];
    for (let i = 0; i + 1 < runAt.length; i++) {
      along.subVectors(runAt[i + 1]!, runAt[i]!).normalize();
      // Land is on the right of `a -> b`, so the sea is `cross(up, b - a)`. The
      // same sign the cliffs and the shore index use, and it flipped with the
      // planet's handedness.
      c.copy(runAt[i]!).add(runAt[i + 1]!).normalize();
      runOut.push(new THREE.Vector3().crossVectors(c, along).normalize());
      runMitre.push(1);
    }
    if (runOut.length === 0) return;
    runOut.push(runOut[runOut.length - 1]!.clone());
    runMitre.push(1);
    for (let i = 1; i + 1 < runAt.length; i++) {
      const previous = runOut[i - 1]!;
      const next = runOut[i]!;
      const joined = previous.clone().add(next).normalize();
      // Capped, because a spit that doubles back on itself would otherwise ask
      // for a spike hundreds of units long.
      runMitre[i] = clamp(1 / Math.max(0.4, joined.dot(next)), 1, 2.5);
      runOut[i] = joined;
    }
  };

  /** Emits the ribbon for the run currently accumulated. */
  const emitRun = (): void => {
    resample();
    const n = runAt.length;
    if (n < 2) return;

    if (rowAt.length < n * rows.length * 3) {
      rowAt = new Float64Array(n * rows.length * 3);
      rowColor = new Float64Array(n * rows.length * 3);
      profiles = new Float64Array(n * 9);
    }

    for (let i = 0; i < n; i++) {
      // The profile is asked once per point of the outline and shared by every
      // row above it; the depth ramp is what varies across the ribbon.
      waterProfile(runAt[i]!.x, runAt[i]!.y, runAt[i]!.z, profiles, i * 9);
      for (let row = 0; row < rows.length; row++) {
        const distance = rows[row]!;
        point
          .copy(runAt[i]!)
          .addScaledVector(runOut[i]!, (distance * runMitre[i]!) / PLANET_RADIUS)
          .normalize()
          .multiplyScalar(
            PLANET_RADIUS + LIFT_COAST + (LIFT_SHELF - LIFT_COAST) * clamp(distance / reach, 0, 1),
          );
        const at = (i * rows.length + row) * 3;
        rowAt[at] = point.x;
        rowAt[at + 1] = point.y;
        rowAt[at + 2] = point.z;
        depthMix(profiles, i * 9, Math.max(0, distance), color);
        rowColor[at] = color.r;
        rowColor[at + 1] = color.g;
        rowColor[at + 2] = color.b;
      }
    }

    for (let i = 0; i + 1 < n; i++) {
      spans++;
      const lat = Math.asin(clamp(runAt[i]!.y, -1, 1)) / DEG;
      const lon = Math.atan2(-runAt[i]!.z, runAt[i]!.x) / DEG;
      const bucket = bucketFor(lat, lon);
      for (let band = 0; band < bands; band++) {
        // Wound so the face points away from the centre: the sea is only ever
        // looked at from above.
        pushVertex(bucket, i, band);
        pushVertex(bucket, i + 1, band);
        pushVertex(bucket, i + 1, band + 1);
        pushVertex(bucket, i, band);
        pushVertex(bucket, i + 1, band + 1);
        pushVertex(bucket, i, band + 1);
        triangles += 2;
      }
    }
  };

  const clearRun = (): void => {
    rawAt = [];
    rawPhase = [];
  };

  for (let r = 0; r < world.rings.length; r++) {
    const ring = (world.rings as LandRing[])[r]!;
    const flags = seaward[r]!;
    const points = ring.points;
    const n = points.length;
    // Cumulative arc length round the ring, so the swell runs continuously along
    // a coast rather than restarting at every point of the outline. It advances
    // over land edges too, so a coast interrupted by a frontier picks the phase
    // up where it left it.
    let travelled = 0;
    // Starting at the first *land* edge means a coastline that wraps the ring is
    // one run and not two. An island has no land edge and any start does.
    let start = 0;
    while (start < n && flags[start] === 1) start++;
    if (start === n) start = 0;

    clearRun();
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const j = (i + 1) % n;
      onSphere(points[i]![0]!, points[i]![1]!, a);
      onSphere(points[j]![0]!, points[j]![1]!, b);
      const span = a.angleTo(b) * PLANET_RADIUS;

      if (flags[i] !== 1 || span < 0.001) {
        emitRun();
        clearRun();
        travelled += span;
        continue;
      }

      if (rawAt.length === 0) {
        rawAt.push(a.clone());
        rawPhase.push(travelled);
      }
      travelled += span;
      rawAt.push(b.clone());
      rawPhase.push(travelled);
    }
    emitRun();
    clearRun();
  }

  const meshes: THREE.Mesh[] = [];
  const material = shallowsMaterial();
  for (const bucket of cells.values()) {
    if (bucket.position.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
    // 127, not 128: `normalized: true` divides a signed byte by 127, so scaling
    // by 128 clips every normal that is exactly 1 on an axis.
    const normal = new Int8Array(bucket.normal.length);
    for (let i = 0; i < normal.length; i++) normal[i] = Math.round(bucket.normal[i]! * 127);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    const colour = new Uint8Array(bucket.color.length);
    for (let i = 0; i < colour.length; i++) colour[i] = Math.round(clamp(bucket.color[i]!, 0, 1) * 255);
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3, true));
    // **`Uint16`, not `Float32`, and not `normalized` either.** The pair is a
    // distance from the coast and a distance along it, both in whole world
    // units, so an integer attribute read straight into a `float` carries them
    // exactly: the rows run from about -16 to 430 (offset by `SHORE_BIAS` so the
    // inland one is positive) and the phase wraps at `PHASE_WRAP`, which is
    // 65,535-safe and which both foam wavelengths divide exactly, so the wrap is
    // continuous in the wave. It is 4 bytes a vertex where the obvious `Float32`
    // pair is 8 — 24 of the ribbon's 78 bytes a triangle, and the same treatment
    // `vegetation.ts` gave its normals and colours.
    const shore = new Uint16Array(bucket.shore.length);
    for (let i = 0; i < shore.length; i += 2) {
      shore[i] = Math.max(0, Math.round(bucket.shore[i]! + SHORE_BIAS));
      shore[i + 1] = Math.round(bucket.shore[i + 1]!) % PHASE_WRAP;
    }
    geometry.setAttribute('aShore', new THREE.BufferAttribute(shore, 2));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'shallows';
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return { meshes, spans, triangles, rows, tolerance };
}

/**
 * The sun's path on the water.
 *
 * **A sea that does not change between noon, dusk and moonlight is missing the
 * best thing this project already built**, and the thing that makes water read
 * as wet rather than as blue plastic is the mirror: the reflection of the light
 * stretched into a path by a surface that is not quite flat. `MeshToonMaterial`
 * has no specular term and would be the wrong place for one anyway — a cel ramp
 * has four steps and a highlight is not one of them — so the path is *geometry*,
 * a chain of pale dashes rebuilt every frame from where the camera and the light
 * actually are.
 *
 * Two things about it are worth knowing.
 *
 * **It is not clipped to the water and does not need to be.** The dashes sit
 * just above the sphere and the land stands `SHORE_LIP` above that at its very
 * lowest, so any land between the camera and a dash — or under it — occludes it.
 * The depth buffer does the clipping and there is not one point-in-polygon in
 * the whole of this.
 *
 * **It is marched rather than solved.** The specular point of a distant light on
 * a sphere is Alhazen's problem; walking the great circle from under the camera
 * out towards the light's bearing and asking each step how well it reflects is
 * two dot products a step, is exact wherever it lands, and gives the *shape* of
 * the path for free — compact and round overhead, a long streak at dusk, because
 * that is what the alignment does as the light comes down.
 */
const GLITTER_STEPS = 150;
/**
 * And how many of them the detail knob buys, because this is the one part of the
 * sea that gets *better* past detail 1 rather than merely not worse.
 *
 * A sparkle is two triangles, so the whole path at detail 6 is under two
 * thousand — free against a ribbon of three hundred thousand — and what it buys
 * is density: at detail 0.25 a path of 38 flecks is a dotted line and at 6 it is
 * a field. It goes as the square root because the path is a *band* on the water
 * and its area is what is being filled, so a linear count would thin out as the
 * knob opened the fog and the path grew with it.
 */
const sparklesFor = (d: number): number => Math.round(GLITTER_STEPS * Math.sqrt(d));
/**
 * Where the march starts and ends, in world units along the ground.
 *
 * **Geometric, not linear, and not quadratic either.** The path is a chain of
 * dashes laid on a surface the camera sees almost edge-on, so what decides
 * whether they are spread evenly on the *screen* is the ratio between
 * consecutive distances, not the difference. The first version stepped
 * `reach = 2600 * t^2` and put three quarters of its dashes inside 600 units,
 * which from a boat is the strip immediately under the bow: measured, of five
 * dashes built with the sun at 65 degrees, **one was on the screen** and the
 * rest had normalised device coordinates from -0.82 down to -4.75 — under the
 * frame, not in it.
 */
const GLITTER_NEAR = 7;
const GLITTER_FAR = 3000;
/**
 * How tightly the path clings to the mirror direction.
 *
 * This is the one number in the file that is a **physical** quantity rather
 * than a compositional one: what makes a glitter path a path and not a point is
 * that the sea is not a mirror, and how far it spreads is the RMS slope of the
 * waves. 0.20 radians is 11.5 degrees, which is about what a moderate sea has.
 *
 * **It is a Gaussian on the angle and not `pow(align, n)`, and the difference is
 * entirely in the tail.** Both fall off at the same rate near the axis and a
 * power has a far fatter tail: at `n = 18` — nominally a 15.8 degree lobe — a
 * point on the horizon under a **65 degree** sun still scores 0.054, so the
 * midday path ran all the way to the limb and looked identical to the sunset
 * one. The same geometry under `exp(-(theta/sigma)^2 / 2)` scores 0.020 and
 * falls under the cut. What the tail is deciding is the *shape* of the path, so
 * it is the whole feature: compact and near the boat at noon, a streak to the
 * horizon at dusk, and nothing anywhere says so.
 *
 * The first version was `pow(align, 220)`, a 4.5 degree lobe. That is plate
 * glass: with the sun at 65 degrees the entire path sat 8 units from the camera,
 * straight down, off the bottom of the frame.
 */
const GLITTER_SLOPE = 0.20;
/**
 * Dash size as a fraction of its own distance, so it holds its angular size.
 *
 * A fixed width is a bar under the bow and a speck at the horizon. Ten percent
 * of the distance is about 5.7 degrees, which at the near end is a dash a
 * finger wide and at 3,000 units is a 300-unit smear — clamped, because past a
 * point it stops being glitter and becomes a painted lane.
 */
const GLITTER_SIZE = 0.030;
const GLITTER_MAX_WIDTH = 70;
/**
 * How wide the sparkle field is thrown, as a fraction of its own distance.
 *
 * Not a taper: the scatter is uniform across this band at every distance and the
 * alignment throws away whatever is off the mirror direction, so the shape of
 * the path — a compact patch at noon, a long narrow streak at dusk — falls out
 * of `GLITTER_LOBE` rather than out of a curve written here.
 */
const GLITTER_WIDEN = 0.26;

/** A stable hash per sparkle, so a dash keeps its size and place across frames. */
function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Glitter {
  mesh: THREE.Mesh;
  update(camera: THREE.Vector3, direction: THREE.Vector3, tint: THREE.Color, strength: number): void;
}

function buildGlitter(d: number): Glitter {
  const sparkles = sparklesFor(d);
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(sparkles * 6 * 3);
  const color = new Float32Array(sparkles * 6 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  material.userData.outlineParameters = { visible: false };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'glitter';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const up = new THREE.Vector3();
  const bearing = new THREE.Vector3();
  const across = new THREE.Vector3();
  const at = new THREE.Vector3();
  const view = new THREE.Vector3();
  const half = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const tone = new THREE.Color();

  const update = (
    camera: THREE.Vector3,
    direction: THREE.Vector3,
    tint: THREE.Color,
    strength: number,
  ): void => {
    up.copy(camera).normalize();
    // The light's bearing on the ground under the camera: the component of the
    // light direction that lies in the local horizontal plane. Straight overhead
    // there is none and the path is a disc, which the march gives on its own.
    bearing.copy(direction).addScaledVector(up, -direction.dot(up));
    if (strength <= 0.001 || bearing.lengthSq() < 1e-8) {
      geometry.setDrawRange(0, 0);
      return;
    }
    bearing.normalize();
    across.crossVectors(up, bearing).normalize();

    let cursor = 0;
    let vertices = 0;
    for (let step = 0; step < sparkles; step++) {
      // **A scatter, not a chain**, and the first version was a chain. Marching
      // one dash per distance along the light's bearing draws a ladder of
      // equally spaced bars from the bow to the horizon, which is the Space
      // Needle's finding on a flat surface: regular joints read as *made*, and
      // 52 of them in a straight line read as a **zebra crossing**. Light on
      // water is a cloud of specks whose density falls away from the mirror
      // direction, so both coordinates are drawn from a hash and the physics
      // below decides which of them survive.
      const h1 = hash(step, 0);
      const h2 = hash(step, 1);
      const h3 = hash(step, 2);
      const reach = GLITTER_NEAR * Math.pow(GLITTER_FAR / GLITTER_NEAR, h1);
      const angle = reach / PLANET_RADIUS;
      at.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(bearing, Math.sin(angle));
      // Off the axis by up to the path's own half-width at this distance. The
      // taper is not drawn: sparkles land across the whole band and only the
      // ones the alignment keeps are built, so the path narrows on its own.
      at.addScaledVector(across, ((h2 * 2 - 1) * reach * GLITTER_WIDEN) / PLANET_RADIUS).normalize();
      view.subVectors(camera, scratch.copy(at).multiplyScalar(PLANET_RADIUS)).normalize();
      // A flat sea reflects the light into the eye only where the surface normal
      // bisects the two. The sea is not flat, so the falloff is generous: what
      // decides the *length* of a glitter path in life is the spread of the
      // wave slopes, and `GLITTER_LOBE` is that spread.
      half.copy(view).add(direction).normalize();
      const theta = Math.acos(Math.min(1, Math.max(0, half.dot(at))));
      const glint = Math.exp((-theta * theta) / (2 * GLITTER_SLOPE * GLITTER_SLOPE)) * strength;
      if (glint < 0.03) continue;

      const width = Math.min(GLITTER_MAX_WIDTH, reach * GLITTER_SIZE) * (0.45 + h3);
      const length = width * 0.55;
      tone.copy(tint).multiplyScalar(glint);

      const quad = (dx: number, dy: number): void => {
        corner
          .copy(at)
          .addScaledVector(bearing, (dy * length) / PLANET_RADIUS)
          .addScaledVector(across, (dx * width) / PLANET_RADIUS)
          .normalize()
          .multiplyScalar(PLANET_RADIUS + LIFT_COAST + 0.2);
        position[cursor] = corner.x;
        position[cursor + 1] = corner.y;
        position[cursor + 2] = corner.z;
        color[cursor] = tone.r;
        color[cursor + 1] = tone.g;
        color[cursor + 2] = tone.b;
        cursor += 3;
        vertices++;
      };
      // **Wound the other way round than it reads.** `across` is
      // `cross(up, bearing)`, so a quad laid out in the obvious order — round
      // the corners anticlockwise in (across, bearing) — has a normal of
      // `across x bearing`, which is **minus up**: every dash faces the centre
      // of the planet and `FrontSide` culls the lot. What it looks like is not
      // "no glitter": the path renders as a **single thin line on the horizon**,
      // because past the limb the sphere has curved far enough that you are
      // looking at the undersides. 42 of 52 dashes were measured inside the
      // frame with vertex colours up to 0.997, and none of them drew.
      quad(-1, -1); quad(1, 1); quad(1, -1);
      quad(-1, -1); quad(-1, 1); quad(1, 1);
    }
    geometry.setDrawRange(0, vertices);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('color').needsUpdate = true;
  };

  return { mesh, update };
}

/**
 * The numbers `pnpm check` holds the sea to, so the assertions are made against
 * this file rather than against a copy of it.
 *
 * `quadSag` is the arithmetic that decides the lift, and it is **both**
 * directions: a quad of the ribbon dips `w^2 / 8R` below the line between its
 * corners across the bands and again along the shore, and the two add at its
 * centre. The ribbon's lowest point is `liftShelf` minus that sum above the
 * sphere's own vertices, and the moment it goes negative the water pokes through
 * its own shallows.
 */
export function oceanLimits(rows: readonly number[]): {
  sag: number;
  detail: number;
  shelf: number;
  rows: readonly number[];
  liftCoast: number;
  liftShelf: number;
  quadSag: number;
} {
  const sagOf = (w: number): number => (w * w) / (8 * PLANET_RADIUS);
  let widest = 0;
  for (let i = 1; i < rows.length; i++) widest = Math.max(widest, rows[i]! - rows[i - 1]!);
  return {
    sag: OCEAN_SAG,
    detail: OCEAN_DETAIL,
    shelf: SHELF,
    rows,
    liftCoast: LIFT_COAST,
    liftShelf: LIFT_SHELF,
    // Across the widest band plus along the longest span, which is `MAX_QUAD`.
    quadSag: sagOf(widest) + sagOf(MAX_QUAD),
  };
}

export interface OceanLight {
  /** Unit vector from the planet's centre towards the body. */
  direction: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
}

export interface Ocean {
  group: THREE.Group;
  /** On `atlas.ocean.stats`. */
  stats: {
    builtAt: number;
    shelfReach: number;
    rows: number[];
    tolerance: number;
    quadSag: number;
    detail: number;
    sphereFaces: number;
    sag: number;
    spans: number;
    chunks: number;
    openVertices: number;
    furthestFromLand: number;
    medianDepth: number;
    meanWater: readonly [number, number, number];
    triangles: number;
    mb: number;
    buildMs: number;
  };
  /**
   * The surf's clock and the glitter's geometry.
   *
   * The clock is `performance.now()` and deliberately *not* the sky's: a swell
   * is a fact about water and `atlas.sky.setRate(600)` is for watching a dawn,
   * not for putting the sea in a blender.
   */
  update(camera: THREE.Vector3, lights: readonly OceanLight[]): void;
}

export function createOcean(world: World): Ocean {
  const began = performance.now();
  const group = new THREE.Group();
  group.name = 'sea';

  const water = buildWater(world);
  group.add(water.mesh);

  // Read once, here, and not again — see `shelfReach`. `[` and `]` move the
  // streamers on the next frame and they do not move this, the same way they do
  // not move the land mesh or the cloud deck.
  const knob = detail();
  const shallows = buildShallows(world, knob);
  for (const mesh of shallows.meshes) group.add(mesh);

  const glitter = buildGlitter(knob);
  group.add(glitter.mesh);

  const sphereFaces = water.mesh.geometry.getAttribute('position').count / 3;
  const sphereEdge = (63.4349 / Math.sqrt(sphereFaces / 20)) * DEG;
  let bytes = 0;
  group.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (geometry === undefined) return;
    for (const name of Object.keys(geometry.attributes)) {
      bytes += (geometry.getAttribute(name).array as ArrayLike<number> & { BYTES_PER_ELEMENT?: number }).length *
        ((geometry.getAttribute(name).array as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 4);
    }
  });

  const limits = oceanLimits(shallows.rows);
  const stats = {
    /** What `atlas.detail()` said when the sea was built, and what that bought. */
    builtAt: knob,
    shelfReach: Math.round(shelfReach(knob)),
    rows: shallows.rows.map((row) => Math.round(row)),
    tolerance: Number(shallows.tolerance.toFixed(2)),
    quadSag: Number(limits.quadSag.toFixed(3)),
    detail: OCEAN_DETAIL,
    sphereFaces,
    sag: PLANET_RADIUS * (1 - Math.cos(sphereEdge / 2)),
    spans: shallows.spans,
    chunks: shallows.meshes.length,
    triangles: sphereFaces + shallows.triangles,
    /** Sphere vertices the outlines call sea, and the furthest any of them is
     *  from land — the middle of the Pacific, and what the ramp is sized on. */
    openVertices: water.wet,
    furthestFromLand: Math.round(water.deepest),
    medianDepth: water.medianDepth,
    meanWater: water.mean,
    mb: Number((bytes / 1e6).toFixed(1)),
    buildMs: Math.round(performance.now() - began),
  };

  const uniforms = (shallows.meshes[0]?.material as THREE.Material | undefined)?.userData['uniforms'] as
    | { uTime: { value: number } }
    | undefined;

  const tint = new THREE.Color();
  const update = (camera: THREE.Vector3, lights: readonly OceanLight[]): void => {
    if (uniforms !== undefined) uniforms.uTime.value = performance.now() / 1000;
    // One path, from whichever body is doing the lighting. Two would be two
    // suns: the moon's path is only ever worth drawing when the sun's is not.
    let best: OceanLight | null = null;
    for (const light of lights) {
      if (light.intensity <= 0.01) continue;
      if (best === null || light.intensity > best.intensity) best = light;
    }
    if (best === null) {
      glitter.update(camera, camera, tint, 0);
      return;
    }
    tint.copy(best.color);
    glitter.update(camera, best.direction, tint, Math.min(1, best.intensity * 0.55));
  };

  return { group, stats, update };
}
