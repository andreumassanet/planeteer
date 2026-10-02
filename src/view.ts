import * as THREE from 'three';

/**
 * What the camera can see, as one object the three streamers share.
 *
 * Every streamer in this project admitted work by **distance from the player**,
 * and a radius is a sphere: it pays for the three hundred degrees behind you and
 * — the half nobody had looked at — for the ground *underneath* you when you are
 * in the air. Measured over boreal Finland before this file existed, with the
 * resident set counted against the camera's own frustum:
 *
 * ```
 *   altitude   vegetation on screen        settlements on screen
 *   15         21 of 44 tiles, 51% of tris  8 of 47 towns
 *   500        18 of 45,          43%       9 of 48
 *   1,200      12 of 30,          42%       4 of 48
 *   3,000       6 of 18,          22%       0 of 48
 *   6,000       0 of 0                      0 of 48, 127,670 triangles
 * ```
 *
 * The last row is the whole argument. At 6,000 units up the settlement streamer
 * was holding its full budget of forty-eight towns and **not one of them was on
 * the screen**: nearest-first ordering spends the entire budget on the ring
 * directly below the plane, which is exactly the part of the world the camera is
 * not pointed at. The vegetation was not there at all, because its range is a
 * radius from the player and at 6,000 up the nearest ground is 6,000 away.
 *
 * So this file answers two questions and they are separate:
 *
 * - **Is it on the screen?** The frustum, widened by a margin.
 * - **Is it near enough to be worth its detail?** That stays where it was, in
 *   each streamer, because only the streamer knows what it is placing.
 */

const DEG = Math.PI / 180;

/**
 * How much wider than the lens the admitting frustum is, and why the two axes
 * are not the same number.
 *
 * The margin buys the time to build something *before* it is on the screen, so
 * it is sized by how fast the frame sweeps across the world on that axis — and
 * the two axes are nothing alike. **Yaw is fast**: a mouse turn is the one
 * motion that puts a whole new hemisphere in front of you, so it gets 18
 * degrees, which at a brisk 120 degrees a second is 150 ms — about nine frames,
 * and nine frames of `BUILD_BUDGET_MS` is six or seven tiles. **Pitch is slow**:
 * the camera's elevation is driven by altitude in flight and by a clamped mouse
 * on foot, and it never sweeps.
 *
 * And pitch is where a wide margin costs the most, which is the second half of
 * it. At 6,000 units up the bottom of the frame meets the ground 1,500 units
 * ahead and the ground *directly below the plane* sits 14 degrees below that
 * edge — so a symmetric 20 degree margin admits the whole disc under the
 * aircraft, which is both the nearest ground on the planet and completely off
 * the screen. Nearest-first ordering then spends the budget on it. That is the
 * radius bug coming back through the margin, and 8 degrees of pitch is what
 * shuts the door on it.
 *
 * **A cone was tried first and this is why it is not a cone.** One sqrt against
 * a sphere is cheaper than six dot products and it needs no near or far plane —
 * but a cone that circumscribes the frustum has to reach the frame's *corner*,
 * 47 degrees at 16:9 against a vertical half-angle of 27.5, and that excess is
 * not spread evenly over the view: it bulges above and below the frame, which at
 * altitude is precisely where the near ground is. Measured, same scene, 6,000
 * units over Finland: the circumscribing cone left **94 settlements resident and
 * 1 on the screen**. The planes are worth their five extra dot products.
 */
const ADMIT_YAW = 18 * DEG;
const ADMIT_PITCH = 8 * DEG;

/**
 * And how much wider again the frustum that *keeps* things standing is.
 *
 * One boundary is a switch: a viewer turning slowly past it builds and disposes
 * the same tile on alternate scans. The gap between admitting and keeping is the
 * hysteresis, and it has to be comfortably larger than the turn that triggers a
 * rescan — `RESCAN_TURN` is 8 degrees in both streamers.
 */
const KEEP_YAW = 12 * DEG;
const KEEP_PITCH = 8 * DEG;

export interface ViewCone {
  /**
   * False until a camera has been aimed at it, and then everything is admitted.
   *
   * A streamer must work with no camera — `check-world.ts` has none, and neither
   * does the first frame — and the honest default is the behaviour this file
   * replaced: a plain radius. Never a frustum with a guessed direction.
   */
  active: boolean;
  /** Where the view starts: the camera, not the player. */
  apex: THREE.Vector3;
  /** Where it points. Unit. */
  axis: THREE.Vector3;
  /** Point it at a camera. Call once per scan, not once per candidate. */
  aim(camera: THREE.Camera | undefined): void;
  /** Should this sphere be built? Inside the frame plus the admit margin. */
  admits(centre: THREE.Vector3, radius: number): boolean;
  /** Should this sphere, already standing, be kept? Wider again. */
  keeps(centre: THREE.Vector3, radius: number): boolean;
  /** Radians between the current axis and a remembered one. */
  turnFrom(axis: THREE.Vector3): number;
}

/**
 * A widened copy of a camera's frustum.
 *
 * The widening is applied to the half-angles rather than to the fov, because
 * `fov` is vertical and `aspect` couples the two: adding degrees to the fov adds
 * proportionally more to the horizontal, which is the opposite of what the
 * asymmetry above is for. Taking the tangents apart, widening each, and putting
 * them back as a fov and an aspect keeps the two margins independent.
 */
function widen(
  target: THREE.PerspectiveCamera,
  camera: THREE.PerspectiveCamera,
  yaw: number,
  pitch: number,
): void {
  const tanV = Math.tan(((camera.fov ?? 55) * DEG) / 2);
  const tanH = tanV * (camera.aspect ?? 1);
  const cap = 89 * DEG;
  const wideV = Math.tan(Math.min(cap, Math.atan(tanV) + pitch));
  const wideH = Math.tan(Math.min(cap, Math.atan(tanH) + yaw));
  target.fov = (2 * Math.atan(wideV)) / DEG;
  target.aspect = wideH / wideV;
  target.near = camera.near;
  target.far = camera.far;
  target.position.copy(camera.position);
  target.quaternion.copy(camera.quaternion);
  target.updateMatrixWorld(true);
  target.updateProjectionMatrix();
}

/**
 * A view that also always admits what is close, whatever it is pointed at.
 *
 * `nearAlways` is measured from the camera and it is the answer to the mouse
 * flick: a flick is 180 degrees in a tenth of a second and no margin covers it,
 * so inside this radius the streamer behaves exactly as it did before this file
 * — a plain disc. Spinning on the spot therefore cannot empty the ground you are
 * standing on. It is a per-streamer number because a settlement's is the width
 * of a town and a vegetation tile's is the level-0 ring.
 *
 * From the air it costs nothing at all, because it is a sphere around a camera
 * that is thousands of units above any ground.
 */
export function createViewCone(nearAlways: number | (() => number)): ViewCone {
  // A function, not just a number, because the detail knob moves what this is
  // sized against: it holds the level-0 ring and the knob multiplies where that
  // ring stops. A value captured once would silently stop matching.
  const near = typeof nearAlways === 'function' ? nearAlways : (): number => nearAlways;
  const apex = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, -1);
  const admitCamera = new THREE.PerspectiveCamera();
  const keepCamera = new THREE.PerspectiveCamera();
  const admitFrustum = new THREE.Frustum();
  const keepFrustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  const cone: ViewCone = {
    active: false,
    apex,
    axis,

    aim(camera) {
      if (camera === undefined || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        cone.active = false;
        return;
      }
      const perspective = camera as THREE.PerspectiveCamera;
      perspective.updateMatrixWorld();
      apex.setFromMatrixPosition(perspective.matrixWorld);
      // Three's cameras look down local -Z.
      axis.set(0, 0, -1).transformDirection(perspective.matrixWorld).normalize();

      widen(admitCamera, perspective, ADMIT_YAW, ADMIT_PITCH);
      admitFrustum.setFromProjectionMatrix(
        matrix.multiplyMatrices(admitCamera.projectionMatrix, admitCamera.matrixWorldInverse),
      );
      widen(keepCamera, perspective, ADMIT_YAW + KEEP_YAW, ADMIT_PITCH + KEEP_PITCH);
      keepFrustum.setFromProjectionMatrix(
        matrix.multiplyMatrices(keepCamera.projectionMatrix, keepCamera.matrixWorldInverse),
      );
      cone.active = true;
    },

    admits(centre, radius) {
      if (!cone.active) return true;
      const disc = near() + radius;
      if (centre.distanceToSquared(apex) <= disc * disc) return true;
      sphere.center.copy(centre);
      sphere.radius = radius;
      return admitFrustum.intersectsSphere(sphere);
    },

    keeps(centre, radius) {
      if (!cone.active) return true;
      const disc = near() + radius;
      if (centre.distanceToSquared(apex) <= disc * disc) return true;
      sphere.center.copy(centre);
      sphere.radius = radius;
      return keepFrustum.intersectsSphere(sphere);
    },

    turnFrom(other) {
      if (!cone.active) return 0;
      return Math.acos(Math.min(1, Math.max(-1, axis.dot(other))));
    },
  };

  return cone;
}

/**
 * How far a streamer reaches, given how high the camera is.
 *
 * Every `rangeFor` in this project used to return a radius around the *player*
 * and compare it against a distance to a point on the *ground*. Standing up that
 * is the same thing. In the air it is not, and the error is the altitude itself:
 * at 6,000 units up, vegetation's 4,200 radius could not reach the ground at all
 * and the field simply switched off — not because a forest at 6,000 units is not
 * worth drawing, but because the budget had been spent on empty sky.
 *
 * So a range is two numbers now. `reach` is how far along the ground the thing
 * being placed is still worth placing, which is a question about the thing, and
 * the slant distance the streamer actually compares against is the hypotenuse.
 */
export function slantRange(altitude: number, reach: number): number {
  return Math.hypot(altitude, reach);
}

/**
 * How far along the ground the horizon is, from a given height.
 *
 * The same `sqrt(2 R h)` `main.ts` uses for the fog, in one place so that a
 * streamer's reach and the haze that hides it cannot drift apart.
 */
export function horizonAt(altitude: number, planetRadius: number): number {
  return Math.sqrt(2 * planetRadius * Math.max(0, altitude));
}

// ---------------------------------------------------------------------------
// The knob
// ---------------------------------------------------------------------------

/**
 * How far the world is built, as one number every streamer multiplies by.
 *
 * **It exists because the honest default is not knowable from one machine.** The
 * headroom here measured 4.7 M streamed triangles and 263 draw calls in 1.11 ms,
 * sixteen times what the budgets admitted — and the only conclusion that could
 * be drawn from one GPU was "probably fine, unverified elsewhere", which is how
 * a project ends up shipping a timid default to nobody's benefit. A knob turns
 * that from a guess into a setting: the default can be generous because the
 * number that does not suit a machine can come down without editing a file.
 *
 * What it scales, and the exponents are not decoration:
 *
 * - **Reach, linearly.** It is a radius, and a radius is what the knob means.
 * - **Triangle budgets and resident caps, as the square.** Doubling a radius
 *   quadruples the ground inside it, so a budget that grew linearly would
 *   silently clip the reach it had just been asked to double — the cap would
 *   bind first and the knob would stop doing anything past about 1.5.
 * - **The apparent-size floors, inversely.** These are what make a distant thing
 *   vanish, so a reach that grew without them buys only *large* things further
 *   away. Floored at `MIN_PIXELS_FLOOR`, below which a settlement really is a
 *   smudge with an ink line round it and a tree really is one dark pixel.
 * - **Vegetation's `REFINE`, linearly**, which is the lever that actually
 *   matters: it is how far the *fine* levels reach, so it is what puts dense
 *   trees at a distance rather than a thin scatter of them.
 * - **The build budget, as the square root.** Trebling the reach multiplies the
 *   cold build by about nine and a fill that takes four seconds reads as broken;
 *   but milliseconds of building are milliseconds of frame, so this one is
 *   deliberately the slowest-growing of them.
 *
 * At 1 the world is what it was before the knob existed. The default is 0.5
 * and that is temporary; see `DETAIL_KEY`.
 */
/**
 * **The key is versioned and the default is deliberately low, and both are
 * temporary.**
 *
 * The value persists, so moving the default alone would change nothing for
 * anyone who has already run the world once — the stale 3 in their store would
 * win. Bumping the key retires every existing value exactly once, which is what
 * makes a change of default actually reach a machine.
 *
 * 0.5 is lighter than the world was before the knob existed: 9 resident
 * vegetation tiles and 75,088 triangles against detail 1's 39 and 284,540, and
 * the fog closes at 963 units. It is set there because the world was built on a
 * machine running several browser windows at once, and a window that costs a
 * quarter of a millisecond is a window that can be left open. **It is not a
 * judgement about the right default** — the measured headroom is sixteen times
 * what these budgets admit, and the range above is meant to be spent.
 * `atlas.detail(3)` is the world this was tuned for. **Since 2026-09-21 it is
 * only where a machine starts**: the automatic knob (`sampleFrame`) moves it
 * from there by what the frames say, and remembers where it got to.
 */
const DETAIL_KEY = 'atlas.detail.v2';
export const DETAIL_MIN = 0.25;
export const DETAIL_MAX = 6;
export const DETAIL_DEFAULT = 0.5;

/**
 * The floor under every apparent-size test, in pixels.
 *
 * The knob divides those floors, and without a stop it would divide them to
 * nothing: at detail 6 a settlement's 8 px becomes 1.3, which is a town rendered
 * as a single dark speck — geometry paid for and read as dirt. This is the point
 * past which the knob stops buying *more things* and starts buying only *further
 * things*, which is the honest way for it to run out.
 */
const MIN_PIXELS_FLOOR = 3.5;

const clampDetail = (value: number): number =>
  Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Number.isFinite(value) ? value : DETAIL_DEFAULT));

/**
 * Reading a corrupt or absent store must not cost you the world.
 *
 * A private window, cleared site data or storage switched off is a worse
 * session and not a broken one.
 */
let current = clampDetail(
  (() => {
    try {
      const raw = localStorage.getItem(DETAIL_KEY);
      return raw === null ? DETAIL_DEFAULT : Number(raw);
    } catch {
      return DETAIL_DEFAULT;
    }
  })(),
);

/**
 * Bumped on every change, so a streamer can notice without a subscription.
 *
 * A callback would have to be unregistered and would run inside whatever frame
 * the knob was turned in; a version is one integer compared against a remembered
 * one at the top of `update`, which is where every streamer already decides
 * whether to rescan. Turning the knob has to force that rescan outright — the
 * movement and turn thresholds cannot see it, and the reach may not have moved
 * far enough to trip the range test either.
 */
let version = 0;

export const detail = (): number => current;
export const detailVersion = (): number => version;

/**
 * The knob, turned by hand: the keys, the slider, `atlas.detail(n)`. It turns
 * the automatic knob off, because the player has taken it; see `sampleFrame`.
 */
export function setDetail(value: number): number {
  if (autoOn) setAutoDetail(false);
  return applyDetail(value);
}

function applyDetail(value: number): number {
  const next = clampDetail(value);
  autoDetailState.detail = next;
  if (next === current) return current;
  current = next;
  version++;
  try {
    localStorage.setItem(DETAIL_KEY, String(current));
  } catch {
    // Not being able to remember is a worse session, not a broken one.
  }
  return current;
}

// ---------------------------------------------------------------------------
// The knob, turned by the frame rate
// ---------------------------------------------------------------------------

/**
 * **The default was never a judgement about the right detail, and this is what
 * replaces it with one.** `DETAIL_DEFAULT` is 0.5 because it was set on a
 * machine shared by several browser windows; on the machine the world is
 * actually played on, the frame itself says how much it can afford. So, while
 * `auto` is on, every frame hands in two numbers — the interval since the last
 * one and the milliseconds `main.ts` spent inside it — and every
 * `AUTO_WINDOW_MS` the knob moves one `AUTO_STEP` if the window says so:
 *
 * - **Down** when frames are being dropped: the median interval over a
 *   quarter longer than the display's own period, or the 95th percentile over
 *   1.6 of it. The period is the fastest tenth of the intervals at the best
 *   the session has seen, which on a vsynced display is the refresh, whatever
 *   it is.
 * - **Up** when nothing is dropped and the work is under half the period at
 *   the 95th percentile — the CPU has the room, and the GPU is not the thing
 *   holding the interval up. On a vsynced display the interval alone can never
 *   show headroom, which is why the work is measured at all.
 *
 * Two windows in a row have to agree before it moves, a step is followed by
 * `AUTO_SETTLE_MS` of not listening (the rescan and the builds a step causes
 * are not what the step should be judged on), and after a step down it will
 * not step back up to the detail it left for `AUTO_COOLDOWN_MS`: a machine
 * that could not hold a detail should not be dragged back to it the moment
 * the lower one has given it room, which is an oscillation. It never
 * leaves `[AUTO_MIN, AUTO_MAX]`, and the first `AUTO_WARMUP_MS` after arrival
 * are the cold fill, which says nothing about the machine.
 *
 * A manual `setDetail` — the keys, the slider — turns it off: the player has
 * taken the knob. `setAutoDetail(true)` gives it back. Both are remembered.
 */
const AUTO_KEY = 'atlas.detail.auto';
const AUTO_MIN = DETAIL_MIN;
/** Not `DETAIL_MAX`: the range above this is there to be chosen by hand. */
const AUTO_MAX = 2;
const AUTO_STEP = 1.25;
const AUTO_WINDOW_MS = 2500;
const AUTO_SETTLE_MS = 2000;
const AUTO_COOLDOWN_MS = 120_000;
const AUTO_WARMUP_MS = 4000;
/** An interval longer than this is a hidden tab or a stall, and is not a frame. */
const AUTO_IGNORE_MS = 250;

export interface AutoDetailState {
  on: boolean;
  detail: number;
  /** The last window's median and 95th-percentile interval, the display period, and the 95th of the work. */
  p50: number;
  p95: number;
  period: number;
  work95: number;
  /** What the last window voted; two in a row move the knob. */
  vote: 'up' | 'down' | 'hold';
  /** The last step taken, and when (a `performance.now()`). */
  lastStep: 'up' | 'down' | 'none';
  lastStepAt: number;
  bounds: [number, number];
}

let autoOn = (() => {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
})();

export const autoDetailState: AutoDetailState = {
  on: autoOn,
  detail: current,
  p50: 0,
  p95: 0,
  period: 0,
  work95: 0,
  vote: 'hold',
  lastStep: 'none',
  lastStepAt: -Infinity,
  bounds: [AUTO_MIN, AUTO_MAX],
};

export const autoDetail = (): boolean => autoOn;

export function setAutoDetail(on: boolean): boolean {
  autoOn = on;
  autoDetailState.on = on;
  intervals.length = 0;
  works.length = 0;
  previousVote = 'hold';
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    // Not being able to remember is a worse session, not a broken one.
  }
  return on;
}

const intervals: number[] = [];
const works: number[] = [];
let firstSample = -1;
let windowBegan = -1;
let deafUntil = -Infinity;
let previousVote: AutoDetailState['vote'] = 'hold';
/** The display's frame period as learned so far, in milliseconds; 0 until a window has been read. */
let displayPeriod = 0;
/** The detail the last step down was taken from, and until when it is not tried again. */
let failedAt = Infinity;
let failedUntil = -Infinity;

const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
const ascending = (a: number, b: number): number => a - b;

/**
 * One frame: the milliseconds since the last one began, and the milliseconds
 * spent inside it. `main.ts` calls it once a frame from arrival on.
 */
export function sampleFrame(intervalMs: number, workMs: number): void {
  const now = performance.now();
  if (firstSample < 0) firstSample = now;
  if (!autoOn || now - firstSample < AUTO_WARMUP_MS || now < deafUntil) {
    windowBegan = now;
    intervals.length = 0;
    works.length = 0;
    return;
  }
  if (intervalMs > 0 && intervalMs < AUTO_IGNORE_MS) {
    intervals.push(intervalMs);
    works.push(workMs);
  }
  if (now - windowBegan < AUTO_WINDOW_MS || intervals.length < 30) return;
  intervals.sort(ascending);
  works.sort(ascending);
  // The display's period is the fastest the frames have gone, not the fastest
  // this window went: a machine at 30 frames a second on a 60 Hz display has
  // every interval at 33 ms, and a period read off that window alone would
  // call it smooth. It relaxes upward slowly, for a window dragged to a
  // slower screen.
  const fastest = quantile(intervals, 0.1);
  displayPeriod = displayPeriod === 0 ? fastest : Math.min(fastest, displayPeriod + (fastest - displayPeriod) * 0.05);
  const period = Math.max(4, displayPeriod);
  const p50 = quantile(intervals, 0.5);
  const p95 = quantile(intervals, 0.95);
  const work95 = quantile(works, 0.95);
  autoDetailState.period = Number(period.toFixed(2));
  autoDetailState.p50 = Number(p50.toFixed(2));
  autoDetailState.p95 = Number(p95.toFixed(2));
  autoDetailState.work95 = Number(work95.toFixed(2));
  intervals.length = 0;
  works.length = 0;
  windowBegan = now;

  let vote: AutoDetailState['vote'] = 'hold';
  if (p50 > period * 1.25 || p95 > period * 1.6) vote = 'down';
  else if (p95 < period * 1.2 && work95 < period * 0.5) vote = 'up';
  autoDetailState.vote = vote;
  const agreed = vote !== 'hold' && vote === previousVote;
  previousVote = vote;
  if (!agreed) return;
  const next = vote === 'down'
    ? Math.max(AUTO_MIN, current / AUTO_STEP)
    : Math.min(AUTO_MAX, current * AUTO_STEP);
  // Not back up to a detail that has just failed, for a while.
  if (vote === 'up' && now < failedUntil && next >= failedAt - 1e-6) return;
  if (Math.abs(next - current) < 1e-6) return;
  if (vote === 'down') {
    failedAt = current;
    failedUntil = now + AUTO_COOLDOWN_MS;
  }
  applyDetail(next);
  autoDetailState.detail = current;
  autoDetailState.lastStep = vote === 'down' ? 'down' : 'up';
  autoDetailState.lastStepAt = now;
  previousVote = 'hold';
  deafUntil = now + AUTO_SETTLE_MS;
}

/**
 * A frame that is not a measure of this machine — the map's sheet over an
 * undrawn world, or the loop deliberately idling at half rate on the pause
 * card — throws the window away instead of feeding it: at 30 frames a second
 * on purpose, every interval reads as a dropped frame, and a tab left on the
 * pause card for two minutes stepped the knob down to its floor.
 */
export function skipFrame(): void {
  windowBegan = performance.now();
  intervals.length = 0;
  works.length = 0;
  previousVote = 'hold';
}

/** A reach, a budget, a cap, a pixel floor and a build allowance, each scaled its own way. */
export const detailReach = (units: number): number => units * current;
export const detailArea = (count: number): number => Math.round(count * current * current);
export const detailPixels = (pixels: number): number => Math.max(MIN_PIXELS_FLOOR, pixels / current);

/**
 * A count cap — resident settlements, resident tiles — which is a *draw call*
 * budget and not a triangle one, so it grows more slowly than the ground does.
 *
 * The square is right for triangles because the ground inside a radius goes as
 * the square. It is wrong for meshes: measured on foot in Finland with the caps
 * squared, detail 6 held **2,288 settlements and 4.15 M triangles**, and the
 * frame went to 14 ms on 615 draw calls — the count cap had stopped binding long
 * before the triangle budget did, and what it bought was meshes the frustum then
 * threw away. `1.5` keeps the cap in front of the budget without it being the
 * thing that decides the frame.
 */
export const detailCount = (count: number): number => Math.round(count * current ** 1.5);

/**
 * Milliseconds of building a frame.
 *
 * **This is the one that must not grow the way the others do, and the
 * measurement is blunt about it.** Three streamers each take an independent
 * slice of the frame — 3.5 ms for the settlements, 3 for the roads, 2.5 for the
 * vegetation — and each checks its allowance *before* starting a build rather
 * than during, so one big town lands on top of it. With the allowance growing as
 * the square root, detail 3 put 15.6 ms of building into a frame that has 16.7,
 * and the worst single update measured **54.5 ms**: a visible hitch, at the
 * default, which is worse than anything the extra reach buys.
 *
 * So it grows as the fourth root and stops at 1.4. The cost is that a cold fill
 * at detail 3 takes about three seconds of walking rather than two, and a fill
 * is a thing that gets better on its own while a hitch is a thing you feel.
 */
export const detailBuild = (ms: number): number => ms * Math.min(1.4, current ** 0.25);

// ---------------------------------------------------------------------------
// The frame's building, shared
// ---------------------------------------------------------------------------

/**
 * Milliseconds of a frame every streamer together may spend, from the moment
 * `main.ts` calls `beginFrameBuild` — building, scanning and whatever else
 * runs between the streamers — and it does **not** move with the knob.
 *
 * **Each streamer used to take its own slice and check it before starting a
 * build**: 3.5 for the settlements, 3 for the roads, 2.5 for the vegetation,
 * 1.5 for the sward and 2 for the movers, 10.5 ms together at detail 0.5 (the
 * slices scale by `detailBuild`), and each could overshoot by a whole build on
 * top of it. Five independent overshoots in one frame is the hitch. The
 * slices stay, as each streamer's cap on itself; this is the frame's cap on
 * all of them, so after one streamer's long build the rest wait a frame.
 */
const FRAME_BUILD_MS = 8;
/**
 * How much of it work the player is not standing in may use, so that near
 * work served later in the frame always has the rest. The order is the order
 * `main.ts` updates in: the town under your feet, the road under them, the
 * near wood, the grass, what moves — and far work of any of them only out of
 * this.
 */
const FAR_BUILD_MS = 4;
/**
 * What counts as near, in world units from the viewer to the nearest of the
 * thing: the ground you stand in and the next step of it. Wider than every
 * streamer's own `KEEP_ALL_WITHIN`, which is the disc a mouse flick reveals.
 */
export const NEAR_BUILD = 600;

/** When the frame's building began; negative while nobody has begun one. */
let frameBegan = -1;

/**
 * Once a frame, before the first streamer. Without it — a headless check, a
 * review sheet — there is no frame allowance and each streamer is held by
 * its own slice alone, which is what they did before this existed.
 */
export function beginFrameBuild(): void {
  frameBegan = performance.now();
}

/** Whether the frame has room left for one more build, near or far. */
export function frameOpen(near: boolean): boolean {
  if (frameBegan < 0) return true;
  return performance.now() - frameBegan < (near ? FRAME_BUILD_MS : FAR_BUILD_MS);
}

/**
 * `frameOpen` for work counted per frame rather than timed: the first near
 * item of the frame always goes (`done` is how many this caller has done), for
 * the reason `FIRST_BUILD_MS` gives, and the rest wait for the allowance.
 */
export function frameOpenFor(done: number, near: boolean): boolean {
  return (near && done === 0) || frameOpen(near);
}

/**
 * How long into its own slice a streamer may still start its first near build
 * of the frame when the frame's allowance is already spent.
 *
 * **The frame's allowance is served in order, and in order starves the end of
 * the queue.** With towns and roads first, a view with dozens of towns in
 * reach spent every frame's 8 ms before the wood and the herds were asked: on
 * a software renderer, 56 seconds after arriving over San Diego the wood had 4
 * tiles and 9 near ones pending against the 16 the per-streamer slices had
 * built, and no herd stood at all (2026-09-21). So every streamer with near
 * work starts one build a frame whatever the frame has spent — the worst frame
 * is then one build per streamer, which is exactly what the separate slices
 * cost before this allowance existed — and only the rest waits its turn.
 */
const FIRST_BUILD_MS = 1;

/**
 * Whether a streamer may start one more build: inside its own slice (`share`
 * milliseconds since it began, at `began`) and inside the frame's — or, for
 * near work, as its first build of the frame (`FIRST_BUILD_MS`).
 */
export function mayBuild(began: number, share: number, near: boolean): boolean {
  const own = performance.now() - began;
  return own < share && (frameOpen(near) || (near && own < FIRST_BUILD_MS));
}

/**
 * How far the haze should let you see, given how far the streamers now build.
 *
 * **This is the half of the knob that makes the other half visible, and leaving
 * it out was the whole of the first attempt's mistake.** `main.ts` closes the
 * fog at about 1.35 horizons, which on flat ground is 1,430 units; a knob that
 * admits geometry at eight thousand while the haze closes at fourteen hundred
 * spends the frame on a wall. So the fog opens with the knob.
 *
 * It opens as the *square root*, not linearly, and that is a judgement rather
 * than an arithmetic: the warm depth haze is half the visual direction this
 * project took from bruno-simon, and a world with the fog pulled to the geometry
 * limit is an airless diagram — every hill equally crisp to the horizon, no
 * sense of distance, and the cel bands flattened by having nothing to recede
 * into. A square root at detail 3 opens the ground horizon from about 1,430 to
 * 2,470 units, which is the furthest it goes before the air stops reading as
 * air. Past that the knob buys reach that the haze keeps softening, which is the
 * right way round.
 */
export const detailFog = (spread: number): number => spread * Math.sqrt(current);

/**
 * Where the haze closes, in world units along the ground.
 *
 * `main.ts` owns the fog and always has; this is the same arithmetic in the one
 * place a *streamer* can reach it, so that reach and haze cannot drift apart —
 * and they had already drifted. At detail 6 on foot the vegetation reached
 * 10,945 units while the fog closed at 4,719: two and a third times the geometry
 * for a band nobody can see through, which is the knob spending the frame on a
 * wall in the other direction from the one that was fixed first.
 *
 * Capping a reach at this is the honest ceiling. It binds on the ground, where
 * the haze is close, and it does not bind in the air, where `spread` opens with
 * altitude and the fog runs to tens of thousands.
 */
export function fogFar(altitude: number, planetRadius: number): number {
  const horizon = horizonAt(altitude, planetRadius);
  return horizon * detailFog(1.35 + (altitude / planetRadius) * 6) * weatherHazeAt(altitude);
}

/**
 * The weather's share of the haze at an altitude: `weatherHaze` on the
 * ground, let go on the way up — the camera climbs out of a fog bank, or
 * through the rain to the cloud base. The cloud deck's own haze
 * (`clouds.ts`) takes the same factor, so a fog hides the deck as it hides
 * the hills.
 */
export function weatherHazeAt(altitude: number): number {
  const lift =
    altitude <= HAZE_LIFT[0] ? 0 : altitude >= HAZE_LIFT[1] ? 1 : (altitude - HAZE_LIFT[0]) / (HAZE_LIFT[1] - HAZE_LIFT[0]);
  return weatherHaze + (1 - weatherHaze) * lift;
}

/**
 * **How much of the clear-air haze the weather leaves, and it is the only
 * thing besides the knob that moves `fogFar`.** 1 is clear air; fog, rain and
 * snow take it down to `WEATHER_HAZE_MIN`, set by `weather-view.ts` a few times a
 * second and eased there over seconds. Here and not in `main.ts` because the
 * streamers cap their reach on `fogFar`: a fog that closed the haze without
 * telling them would leave them building a town nobody can see, and one that
 * does tell them is the cheapest frame the world draws.
 *
 * It lets go between `HAZE_LIFT`'s two altitudes — the handed-over altitude
 * `main.ts` gives every streamer — so a plane climbs out of the murk into
 * the clear, and the planet from orbit is never fogged by the weather at the
 * player's feet.
 */
let weatherHaze = 1;
export const WEATHER_HAZE_MIN = 0.28;
const HAZE_LIFT: [number, number] = [350, 1300];

export function setWeatherHaze(value: number): void {
  weatherHaze = Math.max(WEATHER_HAZE_MIN, Math.min(1, Number.isFinite(value) ? value : 1));
}

