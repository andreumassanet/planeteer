import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { fbm } from './terrain.ts';
import { createToonRamp } from './theme.ts';
import { sunUniform } from './sun.ts';
import type { OutlineTransform } from './outline.ts';
import { latOf } from './sphere.ts';

/**
 * The weather, as a solid.
 *
 * **A cloud in this world is not a participating medium, it is a shape with an
 * ink line round it.** That is the whole decision in this file and it was made
 * before any of the arithmetic below. The obvious build is a raymarch: sample a
 * noise field along the view ray, accumulate transmittance, and you get real
 * volumetrics that you can fly into. It would also be the one object in the
 * scene that is not drawn the way everything else is drawn — no cel bands, no
 * silhouette, and no ink, because ink here is `OutlineEffect` hulling a mesh
 * and a density field has no mesh to hull. Reimplementing the pen inside a
 * shader means finding the silhouette of a fuzzy field in screen space, which
 * is a hard problem whose *best* outcome is a slightly worse copy of what
 * `src/outline.ts` already does perfectly. So the clouds are geometry: a closed
 * shell cut out of a geodesic sphere, `MeshToonMaterial` on the shared ramp,
 * and the same pen as the coastline. Volume in the sense that matters — it has
 * a base you stand under, a top you fly over, sides you see edge-on, and an
 * inside, which is a white-out because the material is `DoubleSide`.
 *
 * The raymarch was not built and measured against this; the argument above is
 * the reason, and it is an argument about the pen rather than about cost.
 *
 * **It is one mesh built once, not a streamer.** Settlements and vegetation are
 * streamed because they are only ever seen from close up; from the plane's
 * ceiling the towns stop building and the woods hand their job to the ground
 * colour. Weather cannot do that — from the ceiling the cloud field *is* the
 * thing you climbed up to look at, so it has to exist over the whole planet at
 * once. So it is built like the land: from angles rather than distances, at one
 * resolution everywhere. 90,514 cells of 327,680, 238,736 triangles, 16.4 MB,
 * 0.4 s headless and up to 0.75 s cold in the browser, and it costs +47,620
 * drawn triangles standing on the ground and +226,888 from the plane's ceiling
 * — see `DETAIL` for why one resolution is enough at both ends.
 *
 * **Four of its uniforms ride the camera's distance to the deck rather than
 * being constants, and each of them was a bug before it was a uniform**: the
 * haze it takes (`hazeAt`), the pen it is drawn with (`penAt`), how much of its
 * own shape is allowed to shade it (`flattenAt`) and how much of its own height
 * it keeps (`squashAt`). One mesh, built once, and a distance is the only thing
 * a mesh built once can respond to. Two of them used to be mutually exclusive —
 * the pen could not be on while the deck was squashed — and are not any more:
 * see `SQUASH_GLSL`.
 */

/**
 * Base of the deck, and it is the number the whole file is arranged around.
 *
 * **The altitude is not free: it is the cell size times how many cells a cloud
 * needs.** How big a cloud looks from underneath is `width / altitude`, and how
 * much shape it can have is `width / cell`, so wanting a cumulus about 45
 * degrees across and about nine cells wide fixes `altitude / cell` at around
 * ten whatever else moves. The first build had a 198-unit cell 430 units up,
 * and it came out as a flat white ceiling for exactly that reason: one cell
 * overhead was 26 degrees, so standing under a cloud you were looking at two
 * triangles.
 *
 * The other end of the clamp is orbit. The deck is drawn on a sphere of
 * `PLANET_RADIUS + this`, so from the plane's ceiling it stands proud of the
 * limb by exactly its own fraction of the radius — at 2,600 that is a 16%
 * halo, a ring of weather floating clear of the planet. Under about a
 * fifteenth of the radius it reads as an atmosphere instead, and it only ever
 * reads at all because the coverage is a third: a solid shell at this height
 * would be a rind.
 */
const CLOUD_BASE = 1000;
/** How far the base wanders. Cumulus bases are flat, so this is gentle. */
const BASE_SWING = 260;
/** The thinnest a cloud gets at its own edge: enough wall to carry an ink line. */
const THICKNESS_MIN = 45;
/** And the tallest it builds where the coverage field is deepest. */
const THICKNESS_RANGE = 420;
/**
 * Cauliflower on top of that.
 *
 * `LUMP_SPAN` is four cells and not one on purpose. At one cell the noise
 * lands a different height on every vertex and the top comes out as a field of
 * sharp triangular peaks, which under a cel ramp reads as **snow-capped
 * mountains** — the first build of this deck looked like the Alps hung upside
 * down. A lobe wants to be several triangles across before it is a lobe.
 */
const LUMP_HEIGHT = 280;

/**
 * How far the *underside* is pulled up at the rim of a bank.
 *
 * Without it the base of the whole deck is one smooth surface and every cloud
 * is a slab: from underneath, which is where you spend most of your time, that
 * is a ceiling. Lifting the rim while the top rises in the middle makes each
 * bank a lens — thin and high at the edge, hanging low in the middle — so the
 * underside has the same shape the top does. The real thing has a flat base and
 * this does not, which is the trade: a flat base is only legible when you can
 * see the cloud from the side, and from the side is not where you are.
 */
const RIM_LIFT = 95;

/**
 * How finely the shell is cut. 20 * 4^DETAIL faces before anything is thrown
 * away: 327,680 at 7, which is a cell 99 units across.
 *
 * One resolution everywhere, the way the land is built, and it is enough at
 * both ends for the same reason: a cell is an *angle*. At 99 units under a
 * 1,000-unit base a cell is 5.7 degrees standing beneath it, so a nine-cell
 * cumulus is 48 degrees and has lobes; from the plane's ceiling the same cell
 * is 5 px of a globe 800 px across, so a bank of nine is a weather system you
 * can point at. Going one level coarser saves three quarters of the triangles
 * and costs the whole of the near view, because the altitude has to rise with
 * the cell to keep the angle — and the altitude is capped by the limb.
 */
const DETAIL = 7;

/**
 * Wavelengths, in world units, that the field is built from. Every frequency
 * below is `PLANET_RADIUS / wavelength`, because a direction is a unit vector
 * and the noise lattice lives in that space: dividing here is the only place
 * this file has to think about it.
 */
const WEATHER_SPAN = 900;
const WARP_SPAN = 7000;
const BASE_SPAN = 5200;
const LUMP_SPAN = 420;

const WEATHER_FREQUENCY = PLANET_RADIUS / WEATHER_SPAN;
const WARP_FREQUENCY = PLANET_RADIUS / WARP_SPAN;
const BASE_FREQUENCY = PLANET_RADIUS / BASE_SPAN;
const LUMP_FREQUENCY = PLANET_RADIUS / LUMP_SPAN;

/** How far the warp drags the weather field. In units of the weather lattice. */
const WARP_STRENGTH = 0.55;

/**
 * Where the cut falls, and how much the latitude moves it.
 *
 * A single global threshold gives even coverage, which is the one thing the
 * Earth's cloud does not have: from orbit the planet is a wet band at the
 * equator, two clear belts over the deserts, and a stormy ring around each
 * mid-latitude. That is three cells of circulation and it is a cosine —
 * `cos(lat * pi / 27.5)` is +1 at the equator, -1 at 27.5, +1 at 55 — so the
 * whole of it costs one term and no table. It is a bias and not a rule: at
 * `CLIMATE_BIAS` the noise still decides, so the belts are where the weather is
 * likelier rather than where it is drawn.
 */
const THRESHOLD = 0.575;
const CLIMATE_BIAS = 0.042;
const CLIMATE_PERIOD = 27.5;

/**
 * The wind, as one rotation of the whole field.
 *
 * A rigid turn about a tilted axis is the entire model, and it is worth what it
 * costs (nothing): the field is a pure function of direction, so drifting it
 * means turning the group rather than rebuilding anything. The period is not 24
 * hours on purpose — locked to the day, the same cloud would sit over the same
 * coast at the same hour forever.
 */
const WIND_PERIOD_HOURS = 19;
const WIND_TILT = 17 * (Math.PI / 180);

/**
 * The pen, and **how far away it stops being a pen.**
 *
 * `OutlineEffect`'s thickness is screen space, so 0.005 is about four pixels of
 * a 775-pixel frame whatever it is drawn around. On the land that is a line: the
 * land is one continuous surface whose whole silhouette is a single stroke
 * thousands of pixels long, and four pixels of it is a drawing. **On the deck it
 * is not**, because the deck is thousands of separate small hulls, and a hull
 * only has to get small for the stroke to stop being its edge and start being
 * its area. From the plane's ceiling the camera is 25,000 units off the near
 * clouds and a 99-unit cell subtends **2.9 pixels against a 3.9-pixel pen**: the
 * ink is wider than the thing it is outlining. Measured against the same frame
 * with the deck hidden, that turned a night hemisphere — dark continents, city
 * lights, the sea's depth ramp — into grey rubble with black rims, and the limb
 * into a crown of gravel. The same pen at the same width is right on the ground
 * and wrong from orbit, and nothing about the pen changed.
 *
 * So the pen fades, and what it fades with is the **distance to the deck**
 * rather than the altitude: standing under it, flying in it and looking down on
 * it from just above are all close range, and the number that says so is
 * `|altitude - CLOUD_BASE|`.
 *
 * **Where the fade starts was got wrong first, by measuring the wrong shape.**
 * Pricing the pen against a *cell* — 99 units — puts the ink at a quarter of the
 * shape by 3,600 units of range, and fading it there was measurably worse than
 * leaving it: at 6,000 units up the deck came out as white faceted masses with
 * no line on them, which in this project is the definition of a mistake rather
 * than a decision. `OutlineEffect` hulls a *mesh*, so the line lands on the
 * silhouette of a whole bank and on the steps between banks, not around every
 * cell — and a bank is nine cells. Priced against that, the ink is still a
 * thirtieth of the shape at 5,000 units and only becomes the shape out where the
 * banks themselves are a few pixels. Full ink inside 6,000 and gone by 16,000.
 *
 * It is one uniform on one mesh, so the far side of the sky keeps the near
 * side's pen; that is the price of a deck built once instead of streamed, and
 * the haze has the horizon covered anyway.
 */
const PEN_THICKNESS = 0.005;
const PEN_FULL_RANGE = 6000;
const PEN_GONE_RANGE = 15000;

/*
 * **Where the ink pass stops being drawn is `PEN_GONE_RANGE` itself, and it used
 * to be a constant of its own.** Past that range the smoothstep has reached 1
 * and the thickness is exactly zero, so the pass draws a hull that lands on the
 * fill it is copying, fails the depth test everywhere, and costs 226,888
 * triangles and 19 draw calls to paint nothing. `visible: false` is the same
 * picture for half the frame.
 *
 * The constant it used to be — `PEN_OFF_RANGE`, 12,000 — was not a cost switch
 * but a truce: the pen and the squash could not both be on, because the hull was
 * built from the *unsquashed* attribute and a squashed fill under a live hull
 * came out as the whole silhouette of the tall deck painted solid ink over the
 * short one. The hull applies the squash now — see `SQUASH_GLSL` and
 * `outlineParameters.transform` in `outline.ts` — so there is no handover left
 * to name, and the two schedules are chosen independently.
 */

/**
 * How much of a cloud's own shape is allowed to shade it, and why it has to go
 * away at range.
 *
 * Losing the pen took the night hemisphere from rubble-with-black-rims to
 * rubble, which is the half of the diagnosis the pen did not cover. A cel ramp
 * gives every facet of a lump a lit side and a dark side, and **a small pale
 * object with a lit side and a dark side is how you draw a rock.** At 25,000
 * units a cell is three pixels, so what is left of a cloud is one facet and its
 * shadow — and 27% coverage of that over a dark planet is gravel, not weather.
 * What a cloud reads as from orbit is *area and value*: a bright field whose
 * brightness sweeps with the terminator. It is the same lesson the outermost
 * vegetation ring paid for — past a certain range the colour carries the thing
 * and the geometry is noise.
 *
 * So the shading normal is bent toward the local up with distance. The deck
 * keeps every triangle it had — the silhouette, the holes, the crown at the
 * limb are all still geometry — and stops lighting them individually, so a bank
 * takes one value the way a sheet would. It stops at `FLAT_MAX` rather than at
 * 1 because a completely flat deck loses the limb: with no form at all the
 * clouds near the edge of the disc shade exactly like the ones at its centre
 * and the globe stops being a sphere.
 *
 * It is not the same fade as the pen's and it must not be: the ink is unusable
 * the moment a cell is comparable to four pixels, while the form is still worth
 * having well past that.
 */
/**
 * What a cloud on the night hemisphere is worth from orbit, as a fraction of
 * what it is worth on the day one.
 *
 * The material is near white and the ground at night is at `ORBIT_LOOK`'s 0.03
 * ramp floor, so under the same moon the deck comes out three or four times the
 * value of the land under it — which is true of the real thing and is still the
 * wrong picture, because *this* night hemisphere is carrying the city lights and
 * the terminator, and a pale sheet over 28% of it takes both away. Measured
 * against the identical frame with the deck hidden: without it the terminator
 * sweeps the Atlantic and Europe and Africa are dark and speckled; with it at
 * full value they are grey.
 *
 * So the night side of the deck is pulled down toward the land it is standing
 * over. **It is not turned off** — from the ceiling the cloud field is what you
 * climbed up to look at, and at this floor it is still a veil that hides the
 * lights under it, which is what weather at night actually does. It rides
 * `orbitDim`, so it does not exist standing on the ground, where a moonlit
 * cloud is the only thing in the sky worth looking at.
 *
 * The two thresholds are `lights.ts`'s own, to the digit, and deliberately: the
 * cloud has to dim on the same terminator the windows come on at, or the
 * frame's one line is drawn twice in two places.
 */
/**
 * How much of the deck's own height survives at range, and **the limb is the
 * only place it matters.**
 *
 * Fading the pen and flattening the shading fixed the disc and left the edge:
 * against black space the deck came out as a chunky grey crust standing proud
 * of the planet's silhouette, with individual lumps resolvable — and a
 * silhouette against maximum contrast is the first thing the eye finds, so it
 * was worse than the disc had ever been. The cause is that **the limb is the
 * one place the deck is seen edge-on.** Everywhere else you look through the
 * thickness; there you look *along* it, so the outer edge of the ring is the
 * tallest top along a chord that crosses dozens of cells. That height runs from
 * 915 to 1,875 units, which at the ceiling is a ring wobbling between 20 and 40
 * pixels: the wobble *is* the crust, and no amount of shading fixes it, because
 * it is geometry.
 *
 * So the height is compressed toward the deck's own mean base, in the vertex
 * shader, on the same distance the other three ride. `SQUASH_KEEP` of 0.12
 * leaves a slab about a hundred units thick where the towers were and takes the
 * ring's outer edge to a smooth 23 pixels — the same width, because that is set
 * by `CLOUD_BASE` and not by the thickness, but with the jaggedness gone.
 *
 * **What it must not do is move the base**, which is why it compresses toward a
 * reference radius rather than scaling the group: scaling the group takes the
 * whole deck down toward the ground and slides it through the mountains on the
 * way up. The base stays at `CLOUD_BASE` and only the height above it shrinks.
 *
 * **It used to start at `PEN_OFF_RANGE` and that was not a range, it was a
 * truce.** The pen and the squash could not both be on, so the squash was not
 * allowed to begin until the ink had gone — which left a band from about 11,000
 * to 14,000 of range with no ink *and* no squash, and the limb there was the
 * crust this whole constant exists to remove. The hull applies the squash now,
 * so the schedule is chosen against the thing it is for: 7,000 is where the
 * deck's edge-on lumps stop being cloud tops you can read and start being
 * gravel on a silhouette, and 13,000 is where the fade has to be finished
 * because that is where the crust was worst. Both are ranges the pen is still
 * partly drawn at, which is the point — the two now overlap for 8,000 units and
 * the deck is inked *and* flattened through the whole of it.
 */
const SQUASH_REFERENCE = PLANET_RADIUS + CLOUD_BASE;
const SQUASH_KEEP = 0.12;
const SQUASH_START_RANGE = 7000;
const SQUASH_FULL_RANGE = 13000;

/**
 * The squash itself, as one string, because **it is compiled into two programs
 * and the two must not be able to disagree.**
 *
 * The fill calls it on `transformed`; `OutlineEffect` splices the same
 * declaration into the hull's vertex shader and calls it on the same value —
 * see `OutlineTransform` in `outline.ts`. The `squash` uniform is one object
 * shared by both, not two objects that a frame has to keep in step. Written as
 * a function rather than as an inline expression for exactly that reason: a
 * hook that hands over an equation can be got wrong in one of its two copies,
 * and one that hands over a function cannot.
 *
 * `mix(1.0, ..., 0.0)` is exactly 1.0, so at zero squash this multiplies every
 * vertex by one and the near view is the frame it always was, to the bit.
 */
const SQUASH_GLSL = /* glsl */ `uniform float squash;

vec3 atlasVertex( vec3 p ) {
  float r = length( p );
  return p * mix( 1.0, ( ${SQUASH_REFERENCE.toFixed(1)} + ( r - ${SQUASH_REFERENCE.toFixed(1)} ) * ${SQUASH_KEEP.toFixed(3)} ) / r, squash );
}`;

function squashAt(altitude: number): number {
  const range = Math.abs(altitude - CLOUD_BASE);
  return THREE.MathUtils.smoothstep(range, SQUASH_START_RANGE, SQUASH_FULL_RANGE);
}

const NIGHT_FLOOR = 0.34;

const FLAT_FULL_RANGE = 4000;
const FLAT_GONE_RANGE = 16000;
const FLAT_MAX = 0.9;

function flattenAt(altitude: number): number {
  const range = Math.abs(altitude - CLOUD_BASE);
  return FLAT_MAX * THREE.MathUtils.smoothstep(range, FLAT_FULL_RANGE, FLAT_GONE_RANGE);
}

function penAt(
  altitude: number,
  pen: { thickness: number; color: [number, number, number]; visible: boolean },
): void {
  const range = Math.abs(altitude - CLOUD_BASE);
  const t = THREE.MathUtils.smoothstep(range, PEN_FULL_RANGE, PEN_GONE_RANGE);
  pen.thickness = PEN_THICKNESS * (1 - t);
  // `visible` is read out of these parameters every frame — see `outlineFor` in
  // `outline.ts` — so this is a switch and not a rebuild. Keyed on the range and
  // on the fade's own end, so the pass goes out exactly where the line already
  // has and never a unit before it.
  pen.visible = range < PEN_GONE_RANGE;
}

export interface CloudStats {
  /** Faces of the cut shell that came out cloudy, and the fraction they are. */
  cells: number;
  cover: number;
  triangles: number;
  chunks: number;
  megabytes: number;
  buildMs: number;
  /** Walls that came out facing into the cloud. Must be 0; see the count below. */
  inward: number;
}

/**
 * Where the deck sits in the opaque list, and it is a number because something
 * has to be drawn *before* it.
 *
 * The frontiers in `borders.ts` are drawn with no depth test — nothing on the
 * ground may hide one from the air — so the only thing that decides what covers
 * them is the order. They take `CLOUD_ORDER - 1` and the deck takes this: the
 * land and the towns first, then the line over them, then the weather over the
 * line, depth-tested as it always was. Before this the frontier was drawn last
 * of all, as a transparent, and the dashes came out painted across the tops of
 * the clouds. It stays well under the sky dome's 1000, which is drawn last so
 * that only the sky left over is shaded.
 */
export const CLOUD_ORDER = 5;

export interface Clouds {
  group: THREE.Group;
  /**
   * Turns the deck into the wind and re-reaches its haze. Call once a frame,
   * after `sky.update` has set the fog's colour and `main.ts` its distances.
   */
  update(time: Date, cameraPosition: THREE.Vector3, fog: THREE.Fog): void;
  /**
   * How much of the deck you can see: 1 is the world's own solid deck, less is
   * a veil, and under a hundredth the group is not drawn at all.
   *
   * **For the start menu and nothing else**, which fades the deck out while you
   * choose a country and a town — a map you click on, where a solid cloud over
   * eastern Spain hid which coast Valencia's pin was on — and back in from
   * space, where the weather is most of what the planet looks like. It is a
   * material switch (transparent and one-sided) and so a recompile, once, the
   * first time it is asked for; the ink follows on its own because the hull
   * takes the fill's opacity.
   */
  setVeil(opacity: number): void;
  stats: CloudStats;
}

/**
 * How far into the haze a cloud is, and it is **not** the fog the land is in.
 *
 * `main.ts` closes the fog at about `1.35 * sqrt(2 R h)` — the distance to the
 * *land's* horizon — because that is the number that has to hide the edge of
 * the world. Standing on the ground that is 1,430 units, and a cloud 1,000
 * units overhead is 65% of the way into it: the entire deck comes out one flat
 * mauve wash, and the first build did exactly that. It is not a bug in the fog.
 * Haze is a path length through air, and the path to something overhead is the
 * one direction that leaves the atmosphere immediately, which is why the zenith
 * is blue on the same afternoon the hills are grey.
 *
 * So the cloud is in the same haze, in the same colour, measured over the
 * horizon of *its own* sphere: `sqrt(2 R (h + CLOUD_BASE))`, times the same
 * `spread` that opens the fog as you climb. Standing on the ground that closes
 * at 6,000 units, which is where the deck meets the horizon, and it opens far
 * enough by the plane's ceiling that the weather is still weather from up
 * there.
 *
 * The one thing it does not carry is the ink: `OutlineEffect` copies `fog` off
 * the source material and knows nothing about this, so the outline stays black
 * at any distance. That is the right way round — a pale shape with its line
 * still on it is a drawing; the alternative, which is what `fog: true` gives,
 * is every cloud in the sky outlined in mauve, because the deck starts beyond
 * the land's fog and the ink saturates before the fill has begun.
 */
function hazeAt(
  altitude: number,
  fog: THREE.Fog,
  haze: { color: { value: THREE.Color }; near: { value: number }; far: { value: number } },
): void {
  const above = Math.max(1, altitude);
  const horizon = Math.sqrt(2 * PLANET_RADIUS * (above + CLOUD_BASE));
  const far = horizon * (1.05 + (above / PLANET_RADIUS) * 6);
  haze.far.value = far;
  haze.near.value = far * 0.2;
  haze.color.value.copy(fog.color);
}

/**
 * A geodesic sphere, indexed, with the faces still grouped by the base face
 * they came out of.
 *
 * Three's own `IcosahedronGeometry` would give the same points and is no use
 * here: it is non-indexed, so nothing shares a vertex and there is no way to
 * ask which face is on the other side of an edge. That question is the whole
 * build — a wall belongs on an edge exactly when the face across it is clear —
 * and welding a quarter of a million vertices back together by hashing their
 * coordinates is both slower and a rounding decision waiting to be wrong.
 * Subdividing with a midpoint cache gives exact shared indices for free.
 */
function icosphere(detail: number): {
  vertices: Float64Array;
  faces: Int32Array;
  /** Which of the 20 base faces each face descends from. */
  chunkOf: Int32Array;
} {
  const t = (1 + Math.sqrt(5)) / 2;
  const seed = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  // Wound counter-clockwise seen from outside, which is what makes a face's own
  // normal point away from the planet without anything having to check.
  const seedFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const count = 10 * 4 ** detail + 2;
  const vertices = new Float64Array(count * 3);
  let written = 0;
  for (const v of seed) {
    const length = Math.hypot(v[0]!, v[1]!, v[2]!);
    vertices[written * 3] = v[0]! / length;
    vertices[written * 3 + 1] = v[1]! / length;
    vertices[written * 3 + 2] = v[2]! / length;
    written++;
  }

  const midpoints = new Map<number, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? a * 1e6 + b : b * 1e6 + a;
    const found = midpoints.get(key);
    if (found !== undefined) return found;
    const x = vertices[a * 3]! + vertices[b * 3]!;
    const y = vertices[a * 3 + 1]! + vertices[b * 3 + 1]!;
    const z = vertices[a * 3 + 2]! + vertices[b * 3 + 2]!;
    const length = Math.hypot(x, y, z);
    const index = written++;
    vertices[index * 3] = x / length;
    vertices[index * 3 + 1] = y / length;
    vertices[index * 3 + 2] = z / length;
    midpoints.set(key, index);
    return index;
  };

  // Each base face is subdivided on its own so its descendants stay contiguous,
  // which is what lets the shell be cut into 20 separately culled chunks with
  // no bookkeeping. The midpoint cache is shared, so the seams still weld.
  const perChunk = 4 ** detail;
  const faces = new Int32Array(20 * perChunk * 3);
  const chunkOf = new Int32Array(20 * perChunk);
  let out = 0;
  for (let base = 0; base < 20; base++) {
    let current = [seedFaces[base]!.slice()];
    for (let level = 0; level < detail; level++) {
      const next: number[][] = [];
      for (const [a, b, c] of current) {
        const ab = midpoint(a!, b!);
        const bc = midpoint(b!, c!);
        const ca = midpoint(c!, a!);
        next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
      }
      current = next;
    }
    for (const face of current) {
      faces[out * 3] = face[0]!;
      faces[out * 3 + 1] = face[1]!;
      faces[out * 3 + 2] = face[2]!;
      chunkOf[out] = base;
      out++;
    }
  }
  return { vertices, faces, chunkOf };
}

/**
 * How cloudy this direction is, before the cut.
 *
 * Two things beyond plain noise, and both are there to stop the field reading
 * as noise. The domain warp is what turns blobs into fronts and swirls, which
 * is what weather looks like from orbit and is one extra `fbm` at build time.
 * The climate term is the three-cell bias described at `CLIMATE_BIAS`.
 */
function coverageAt(x: number, y: number, z: number): number {
  const warpX = fbm(x * WARP_FREQUENCY + 19.7, y * WARP_FREQUENCY - 4.3, z * WARP_FREQUENCY + 31.1, 2);
  const warpY = fbm(x * WARP_FREQUENCY - 12.9, y * WARP_FREQUENCY + 27.5, z * WARP_FREQUENCY - 8.7, 2);
  const warpZ = fbm(x * WARP_FREQUENCY + 5.1, y * WARP_FREQUENCY + 14.2, z * WARP_FREQUENCY + 23.9, 2);
  const raw = fbm(
    x * WEATHER_FREQUENCY + (warpX - 0.5) * 2 * WARP_STRENGTH + 101.3,
    y * WEATHER_FREQUENCY + (warpY - 0.5) * 2 * WARP_STRENGTH - 57.9,
    z * WEATHER_FREQUENCY + (warpZ - 0.5) * 2 * WARP_STRENGTH + 8.4,
    4,
  );
  const lat = latOf(y);
  return raw + CLIMATE_BIAS * Math.cos((lat * Math.PI) / CLIMATE_PERIOD);
}

/**
 * Builds the deck.
 *
 * Two passes over the same faces: the first counts triangles so the buffers can
 * be allocated once, the second writes them. Growing arrays instead would cost
 * more than the count does.
 */
export function createClouds(): Clouds {
  const began = performance.now();
  const { vertices, faces, chunkOf } = icosphere(DETAIL);
  const vertexCount = vertices.length / 3;
  const faceCount = faces.length / 3;

  // Everything a vertex is worth, evaluated once. A vertex is shared by six
  // faces, so asking the noise per face would be six times the work and — worse
  // — six answers where the mesh needs one, which is a crack.
  const cover = new Float32Array(vertexCount);
  const floor = new Float32Array(vertexCount);
  const ceiling = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 3]!;
    const y = vertices[i * 3 + 1]!;
    const z = vertices[i * 3 + 2]!;
    const c = coverageAt(x, y, z);
    cover[i] = c;
    const base =
      CLOUD_BASE +
      (fbm(x * BASE_FREQUENCY + 61.3, y * BASE_FREQUENCY + 2.7, z * BASE_FREQUENCY - 44.1, 2) - 0.5) *
        BASE_SWING;
    // Depth of the bank drives how tall it stands, so an edge is a wisp and the
    // middle is a tower, with no second field saying so.
    const depth = Math.max(0, Math.min(1, (c - THRESHOLD) / 0.16));
    const lump = fbm(x * LUMP_FREQUENCY + 7.7, y * LUMP_FREQUENCY - 19.4, z * LUMP_FREQUENCY + 3.3, 3);
    const bottom = base + RIM_LIFT * (1 - depth);
    floor[i] = PLANET_RADIUS + bottom;
    ceiling[i] =
      PLANET_RADIUS +
      bottom +
      THICKNESS_MIN +
      // Smoothstep and not a power, because it is flat at *both* ends: a power
      // curve peaks at the deepest cell, so a bank only three cells across —
      // and most of them are — comes to a point and reads as a tent.
      THICKNESS_RANGE * depth * depth * (3 - 2 * depth) +
      LUMP_HEIGHT * lump * depth;
  }

  const kept = new Uint8Array(faceCount);
  let cells = 0;
  for (let f = 0; f < faceCount; f++) {
    const a = faces[f * 3]!;
    const b = faces[f * 3 + 1]!;
    const c = faces[f * 3 + 2]!;
    // The face's own coverage is the mean of its corners rather than a fourth
    // sample at the centroid. That is not a saving, it is the thing that keeps
    // the cut and the heights the same decision: a corner where the cut says
    // "edge" is a corner where the height says "thinnest", always.
    if ((cover[a]! + cover[b]! + cover[c]!) / 3 > THRESHOLD) {
      kept[f] = 1;
      cells++;
    }
  }

  // Which face is on the other side of each edge. Only kept faces need asking,
  // but the neighbour may be a face that was thrown away, so the map is built
  // over all of them.
  const across = new Map<number, number>();
  const edgeKey = (a: number, b: number): number => (a < b ? a * 1e6 + b : b * 1e6 + a);
  for (let f = 0; f < faceCount; f++) {
    const a = faces[f * 3]!;
    const b = faces[f * 3 + 1]!;
    const c = faces[f * 3 + 2]!;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(u, v);
      const found = across.get(key);
      // Two faces to an edge and no more, so the sum of the two indices minus
      // the one you have is the other. One integer per edge instead of a pair.
      across.set(key, found === undefined ? f : found + f);
    }
  }
  const neighbour = (f: number, u: number, v: number): number => {
    const sum = across.get(edgeKey(u, v));
    return sum === undefined ? -1 : sum - f;
  };

  const wallOf = new Uint8Array(faceCount);
  let triangles = 0;
  for (let f = 0; f < faceCount; f++) {
    if (kept[f] === 0) continue;
    const a = faces[f * 3]!;
    const b = faces[f * 3 + 1]!;
    const c = faces[f * 3 + 2]!;
    let walls = 0;
    if (kept[neighbour(f, a, b)] !== 1) walls |= 1;
    if (kept[neighbour(f, b, c)] !== 1) walls |= 2;
    if (kept[neighbour(f, c, a)] !== 1) walls |= 4;
    wallOf[f] = walls;
    triangles += 2 + 2 * ((walls & 1) + ((walls >> 1) & 1) + ((walls >> 2) & 1));
  }

  const ramp = createToonRamp(4);
  const haze = { color: { value: new THREE.Color(0xc6b6cf) }, near: { value: 1200 }, far: { value: 6000 } };
  const flatten = { value: 0 };
  const orbitDim = { value: 0 };
  const squash = { value: 0 };
  const material = new THREE.MeshToonMaterial({
    color: 0xfbf3ec,
    gradientMap: ramp,
    // The inside is a surface too. Culled back faces mean flying into a cloud
    // shows you the far wall from behind, which renders as nothing: the deck
    // you were about to enter simply stops existing at the near plane. Both
    // sides, and entering one is the white-out it should be.
    side: THREE.DoubleSide,
    // And the scene's fog is off, which is the one thing here that looks like
    // ignoring the world and is the opposite. See `hazeAt`.
    fog: false,
  });
  const pen: {
    thickness: number;
    color: [number, number, number];
    visible: boolean;
    transform: OutlineTransform;
  } = {
    thickness: PEN_THICKNESS,
    color: [0.11, 0.02, 0.01],
    visible: true,
    // The pen carries the squash with it: `OutlineEffect` compiles this same
    // declaration into the hull and calls the same function on the same vertex,
    // sharing this same uniform object, so the ink is drawn round the deck that
    // is actually on the screen. Before this the two were different shapes and
    // the pen had to be switched off before the squash could start.
    transform: { declaration: SQUASH_GLSL, uniforms: { squash } },
  };
  material.userData.outlineParameters = pen;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = haze.color;
    shader.uniforms.hazeNear = haze.near;
    shader.uniforms.hazeFar = haze.far;
    shader.uniforms.flatten = flatten;
    shader.uniforms.orbitDim = orbitDim;
    shader.uniforms.atlasSun = sunUniform;
    shader.uniforms.squash = squash;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        SQUASH_GLSL + '\nvarying float vHaze;\nvarying vec3 vRadial;\nvarying vec3 vUp;\nvoid main() {',
      )
      // See `squashAt` and `SQUASH_GLSL`. Radial, in object space, which for this
      // mesh is the planet's own frame turned by the wind — so it is radial in
      // the world too, and it moves nothing sideways. One line here and the same
      // line in the hull, out of the one declaration above.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = atlasVertex(transformed);')
      // `position` is the radial direction times the radius: the chunks sit at
      // the group's own origin, which is the planet's centre, so normalising it
      // is the local up with no extra matrix and no extra attribute.
      .replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\n  vHaze = -mvPosition.z;\n  vRadial = normalize(normalMatrix * normalize(position));\n  vUp = normalize((modelMatrix * vec4(position, 1.0)).xyz);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 hazeColor;\nuniform float hazeNear;\nuniform float hazeFar;\nuniform float flatten;\nuniform float orbitDim;\nuniform vec3 atlasSun;\nvarying float vHaze;\nvarying vec3 vRadial;\nvarying vec3 vUp;\nvoid main() {',
      )
      // See `flattenAt`. The sign keeps a floor a floor: blending every normal
      // to +up would light the underside of the deck as though it faced the sky,
      // and the underside is what the limb is made of.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n\tvec3 atlasUp = normalize(vRadial) * (dot(normal, normalize(vRadial)) < 0.0 ? -1.0 : 1.0);\n\tnormal = normalize(mix(normal, atlasUp, flatten));',
      )
      // See `NIGHT_FLOOR`. Before the haze and after the light, so what is dimmed
      // is the cloud and not the air in front of it.
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n\tfloat atlasNightSide = 1.0 - smoothstep(-0.104528, 0.034899, dot(vUp, atlasSun));\n\tgl_FragColor.rgb *= mix(1.0, ' +
          NIGHT_FLOOR.toFixed(3) +
          ', atlasNightSide * orbitDim);',
      )
      // Before tone mapping, so the blend happens in the same linear space the
      // light was accumulated in — which is one step earlier than three puts
      // its own fog, and is why the haze does not go chalky at dusk.
      .replace(
        '#include <tonemapping_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, smoothstep(hazeNear, hazeFar, vHaze));\n\t#include <tonemapping_fragment>',
      );
  };

  const group = new THREE.Group();
  group.name = 'clouds';

  // One mesh per base face of the icosahedron: 20 bounding spheres instead of
  // one that covers the planet, which is the whole of the culling. The faces
  // are already contiguous per chunk, so this is a range and not a sort.
  const chunkTriangles = new Int32Array(20);
  for (let f = 0; f < faceCount; f++) {
    if (kept[f] === 0) continue;
    const walls = wallOf[f]!;
    const chunk = chunkOf[f]!;
    chunkTriangles[chunk] = chunkTriangles[chunk]! + 2 + 2 * ((walls & 1) + ((walls >> 1) & 1) + ((walls >> 2) & 1));
  }

  const positions: Float32Array[] = [];
  const cursors = new Int32Array(20);
  for (let chunk = 0; chunk < 20; chunk++) positions.push(new Float32Array(chunkTriangles[chunk]! * 9));

  const push = (chunk: number, x: number, y: number, z: number): void => {
    const array = positions[chunk]!;
    const at = cursors[chunk]!;
    array[at] = x;
    array[at + 1] = y;
    array[at + 2] = z;
    cursors[chunk] = at + 3;
  };
  const pushAt = (chunk: number, v: number, radius: Float32Array): void => {
    const r = radius[v]!;
    push(chunk, vertices[v * 3]! * r, vertices[v * 3 + 1]! * r, vertices[v * 3 + 2]! * r);
  };

  /**
   * Wall triangles that came out facing into the cloud, which is the one thing
   * here that cannot be seen and cannot be reasoned about from the winding.
   *
   * A vertical wall's normal is perpendicular to the radius whichever way round
   * it is, so "no triangle faces inward" — the test that catches a flipped land
   * cliff — passes for a coast wound backwards. `globe.ts` answers that by
   * stepping off the wall and asking the outlines whether it landed in the sea.
   * There is no such third party up here, so the check is the one fact the
   * construction does supply: the wall's normal must point away from the
   * centroid of the face it belongs to. Counted at build and reported on
   * `atlas.clouds.stats`, because a deck built inside out looks like a deck.
   */
  let inward = 0;
  const centroid = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const inward_ = new THREE.Vector3();

  const at = (v: number, radius: Float32Array, target: THREE.Vector3): THREE.Vector3 => {
    const r = radius[v]!;
    return target.set(vertices[v * 3]! * r, vertices[v * 3 + 1]! * r, vertices[v * 3 + 2]! * r);
  };

  for (let f = 0; f < faceCount; f++) {
    if (kept[f] === 0) continue;
    const chunk = chunkOf[f]!;
    const a = faces[f * 3]!;
    const b = faces[f * 3 + 1]!;
    const c = faces[f * 3 + 2]!;

    // The top, wound as the base face was: outward, away from the planet.
    pushAt(chunk, a, ceiling);
    pushAt(chunk, b, ceiling);
    pushAt(chunk, c, ceiling);
    // The floor of the bank, reversed so its normal points down at whoever is
    // standing under it. This is the surface the deck is mostly seen as.
    pushAt(chunk, a, floor);
    pushAt(chunk, c, floor);
    pushAt(chunk, b, floor);

    const walls = wallOf[f]!;
    if (walls === 0) continue;
    at(a, floor, p0);
    at(b, floor, p1);
    at(c, floor, p2);
    centroid.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
    for (const [bit, u, v] of [[1, a, b], [2, b, c], [4, c, a]] as const) {
      if ((walls & bit) === 0) continue;
      // The interior of a counter-clockwise face is to the left of u -> v seen
      // from outside, so outward is to the right, and the quad
      // (u.floor, v.floor, v.ceiling, u.ceiling) carries exactly that normal.
      pushAt(chunk, u, floor);
      pushAt(chunk, v, floor);
      pushAt(chunk, v, ceiling);
      pushAt(chunk, u, floor);
      pushAt(chunk, v, ceiling);
      pushAt(chunk, u, ceiling);

      at(u, floor, p0);
      at(v, floor, p1);
      at(v, ceiling, p2);
      edge1.subVectors(p1, p0);
      edge2.subVectors(p2, p0);
      normal.crossVectors(edge1, edge2);
      if (normal.dot(inward_.subVectors(centroid, p0)) > 0) inward++;
    }
  }

  let bytes = 0;
  for (let chunk = 0; chunk < 20; chunk++) {
    const array = positions[chunk]!;
    if (array.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
    // Non-indexed on purpose, exactly as the land is: one normal per face, so
    // a lump has facets to step the cel bands across instead of a smooth
    // gradient that has nothing to band.
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `clouds-${chunk}`;
    mesh.renderOrder = CLOUD_ORDER;
    group.add(mesh);
    bytes += array.byteLength * 2;
  }

  if (inward > 0) {
    console.warn(`clouds: ${inward} wall triangles face into the cloud they belong to`);
  }

  const stats: CloudStats = {
    cells,
    cover: Number((cells / faceCount).toFixed(3)),
    triangles,
    chunks: group.children.length,
    megabytes: Number((bytes / 1048576).toFixed(1)),
    buildMs: Math.round(performance.now() - began),
    inward,
  };

  const axis = new THREE.Vector3(Math.sin(WIND_TILT), Math.cos(WIND_TILT), 0).normalize();
  const period = WIND_PERIOD_HOURS * 3600000;

  return {
    group,
    stats,
    setVeil(opacity: number): void {
      // Not drawn at all rather than drawn at nothing: 226,888 triangles and two
      // passes of them to paint no pixel.
      group.visible = opacity > 0.01;
      const veiled = opacity < 0.999;
      if (veiled !== material.transparent) {
        material.transparent = veiled;
        // One side: a see-through deck drawn double-sided shows its own floor
        // through its own top, which is a grey smear rather than a veil.
        //
        // **And it keeps writing depth, which is the part that looks optional
        // and is not.** The ink is an inverted hull drawn in a second pass, and
        // what hides the inside of that hull is the depth the fill wrote in
        // the first. A veil that wrote none had the whole hull show through
        // it at the veil's own opacity: every cloud over Spain came out a
        // sheet of dark red-brown ink with a white rim, which is what the
        // first screenshot of this showed.
        material.side = veiled ? THREE.FrontSide : THREE.DoubleSide;
        material.needsUpdate = true;
      }
      material.opacity = veiled ? Math.max(0, opacity) : 1;
    },
    update(time: Date, cameraPosition: THREE.Vector3, fog: THREE.Fog): void {
      // An absolute angle, not an increment: the deck is then a pure function
      // of the clock, so `atlas.sky.setTime` scrubs the weather with the sun
      // and `setRate(600)` runs a front past you in seconds.
      group.quaternion.setFromAxisAngle(axis, ((time.getTime() % period) / period) * Math.PI * 2);
      const altitude = cameraPosition.length() - PLANET_RADIUS;
      hazeAt(altitude, fog, haze);
      penAt(altitude, pen);
      flatten.value = flattenAt(altitude);
      orbitDim.value = flattenAt(altitude) / FLAT_MAX;
      squash.value = squashAt(altitude);
    },
  };
}
