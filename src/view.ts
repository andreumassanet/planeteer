import * as THREE from 'three';

/**
 * What the camera can see, shared by the streamers.
 *
 * Admitting work by distance from the player pays for the ground behind and
 * underneath the camera, which in the air is most of it. This file answers two
 * separate questions: is a sphere on screen (the frustum, widened by a margin),
 * and is it near enough to be worth its detail (left to each streamer, which
 * knows what it places).
 */

const DEG = Math.PI / 180;

/**
 * How much wider than the lens the admitting frustum is, per axis.
 *
 * The margin buys time to build before something is on screen, so it follows
 * how fast the frame sweeps the world on each axis. Yaw is fast (a mouse turn
 * can bring a new hemisphere in front), so it gets 18 degrees. Pitch is slow,
 * and a wide pitch margin is costly: in the air the ground directly below the
 * aircraft is the nearest and is off screen, so a wide margin would admit it
 * and nearest-first ordering would spend the budget on it. Eight degrees keeps
 * it out. Six planes are used rather than a bounding cone, whose excess at the
 * frame's corner bulges above and below the frame where the near ground is.
 */
const ADMIT_YAW = 18 * DEG;
const ADMIT_PITCH = 8 * DEG;

/**
 * How much wider again the frustum that keeps things standing is. The gap
 * between admitting and keeping is the hysteresis against building and
 * disposing the same tile on alternate scans; it must exceed the turn that
 * triggers a rescan (`RESCAN_TURN`, 8 degrees in both streamers).
 */
const KEEP_YAW = 12 * DEG;
const KEEP_PITCH = 8 * DEG;

export interface ViewCone {
  /**
   * False until a camera has been aimed at it; until then everything is
   * admitted, because a streamer must work with no camera (headless checks, the
   * first frame).
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
 * A widened copy of a camera's frustum. The widening is applied to the
 * half-angles rather than to the fov, because `fov` is vertical and `aspect`
 * couples the two; widening the tangents separately keeps the margins
 * independent.
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
 * `nearAlways` is measured from the camera, so spinning on the spot cannot
 * empty the ground you stand on. It is per streamer because a settlement's is
 * the width of a town and a vegetation tile's is the level-0 ring.
 */
export function createViewCone(nearAlways: number | (() => number)): ViewCone {
  // A function, because the detail knob moves what this is sized against.
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
 * How far a streamer reaches, given how high the camera is. `reach` is how far
 * along the ground the thing is worth placing; the slant distance a streamer
 * compares against is the hypotenuse of that and the altitude.
 */
export function slantRange(altitude: number, reach: number): number {
  return Math.hypot(altitude, reach);
}

/**
 * How far along the ground the horizon is from a given height: the same
 * `sqrt(2 R h)` the fog uses, so a streamer's reach and its haze agree.
 */
export function horizonAt(altitude: number, planetRadius: number): number {
  return Math.sqrt(2 * planetRadius * Math.max(0, altitude));
}

/**
 * How far the world is built, as one number every streamer multiplies by.
 *
 * - Reach scales linearly.
 * - Triangle budgets and resident caps scale as the square: the ground inside
 *   a radius goes as its square.
 * - Apparent-size floors scale inversely, down to `MIN_PIXELS_FLOOR`.
 * - Vegetation's `REFINE` scales linearly; it sets how far the fine levels reach.
 * - The build budget scales as the square root: milliseconds of building are
 *   milliseconds of frame.
 */
/**
 * Storage key for the knob. It is versioned: bumping it retires every stored
 * value once, so a new default reaches machines that already ran the world.
 * The default is only a starting point; the automatic knob (`sampleFrame`)
 * moves it by what the frames say and remembers where it got to. The haze
 * opens linearly with the knob (`detailFog`).
 */
const DETAIL_KEY = 'atlas.detail.v3';
export const DETAIL_MIN = 0.25;
/**
 * The top of the knob. Past it `vegetation.ts`'s `MAX_TRIANGLES` (a memory
 * ceiling) would bind before the haze, so a higher setting would do nothing.
 */
export const DETAIL_MAX = 3;
export const DETAIL_DEFAULT = 0.5;

/**
 * The floor under every apparent-size test, in pixels. Without it the knob
 * would divide the floors toward nothing and a town would render as a speck.
 */
const MIN_PIXELS_FLOOR = 3.5;

const clampDetail = (value: number): number =>
  Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Number.isFinite(value) ? value : DETAIL_DEFAULT));

/** A corrupt or absent store (private window, cleared site data) falls back to the default. */
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
 * Bumped on every change, so a streamer can notice without a subscription: it
 * compares one integer at the top of `update`, where it already decides
 * whether to rescan. Turning the knob forces that rescan.
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
    // Storage unavailable: carry on without remembering.
  }
  return current;
}

/**
 * The automatic knob. While `auto` is on, every frame hands in the interval
 * since the last one and the milliseconds `main.ts` spent inside it, and every
 * `AUTO_WINDOW_MS` the knob moves one `AUTO_STEP`:
 *
 * - down when frames are dropped: the median interval over a quarter above the
 *   display's period, or the 95th percentile over 1.6 of it (the period is the
 *   fastest tenth of the intervals, at the best the session has seen);
 * - up when nothing is dropped and the 95th-percentile work is under half the
 *   period.
 *
 * Two windows in a row must agree before it moves. A step is followed by
 * `AUTO_SETTLE_MS` of not listening, and after a step down it does not step
 * back up to that detail for `AUTO_COOLDOWN_MS`. It stays within
 * `[AUTO_MIN, AUTO_MAX]` and ignores the first `AUTO_WARMUP_MS` (the cold
 * fill). `setDetail` turns it off; `setAutoDetail(true)` gives it back.
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
    // Storage unavailable: carry on without remembering.
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
  // The display's period is the fastest interval seen over the session, not
  // this window's: a machine at 30 frames a second on a 60 Hz display would
  // otherwise call 33 ms smooth. It relaxes upward slowly, for a window dragged
  // to a slower screen.
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
 * A frame that is not a measure of this machine (the map over an undrawn
 * world, the pause card's half-rate loop) is thrown away instead of fed in,
 * or it would read as dropped frames.
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
 * A count cap (resident settlements, tiles). It is a draw-call budget rather
 * than a triangle one, so it grows as the knob to the power 1.5 instead of the
 * square, which keeps it in front of the triangle budget without deciding the
 * frame.
 */
export const detailCount = (count: number): number => Math.round(count * current ** 1.5);

/**
 * Milliseconds of building a frame. Each streamer checks its allowance before
 * starting a build, so one big town lands on top of it; this grows as the
 * fourth root and stops at 1.4, because a slower cold fill is better than a
 * hitch.
 */
export const detailBuild = (ms: number): number => ms * Math.min(1.4, current ** 0.25);

/**
 * Milliseconds of a frame every streamer together may spend, counted from
 * `beginFrameBuild`. It does not move with the knob. Each streamer keeps its
 * own slice as a cap on itself; this is the frame's cap on all of them, so
 * after one long build the rest wait a frame.
 */
const FRAME_BUILD_MS = 8;
/**
 * How much of it work the player is not standing in may use, so near work
 * served later in the frame has the rest. The order is `main.ts`'s update
 * order: the town under your feet, the road, the near wood, the grass, what
 * moves.
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
 * Milliseconds the streamers have run past the frame's allowance in frames
 * that started far work, and not yet paid back; far work waits while there is
 * any.
 *
 * An allowance checked before a build is overshot by the whole build, and from
 * the air every build is far, so the overrun is carried: a frame that owes
 * starts no far work and every frame pays back `FAR_BUILD_MS`. Far work then
 * costs about its share on average. A far build that fits inside the frame
 * owes nothing, and near work never waits on it.
 */
let farDebt = 0;
/** Milliseconds `endFrameBuild` measured for the last frame's streamers; negative when it was not called. */
let lastSpan = -1;
/** Whether this frame let any far work start. */
let farStarted = false;

/*
 * Far work that names itself (`who`) takes turns, in the order it was refused:
 * while any named streamer is waiting, only the one waiting longest may start
 * far work, and a streamer served goes to the back of the line. Once a frame
 * the streamer whose turn it is may start one far build even when the far
 * share is spent (`FAR_FORCED_MS`), bounded by `farDebt`. Without turns the
 * first streamer in the frame's order takes every far share and the later ones
 * starve. A streamer alone with far work builds as much as the frame allows.
 */
/** Named streamers refused far work and not served since, longest waiting first. */
const farWaiting = new Set<string>();
/** Whether this frame has already let one far build start past the share. */
let farForced = false;
/**
 * Who asked for far work last frame: a streamer whose queue has emptied stops
 * being waited for.
 */
const farAsked = new Set<string>();

/**
 * The streamer served far work this frame, and until when a forced start lets
 * it go on: its next asks are part of the same turn and are judged by the
 * share, or by `FAR_FORCED_MS` after a forced start.
 */
let farHolder: string | null = null;
let farHeldUntil = 0;
const FAR_FORCED_MS = 1;

/** Whether `who` may start far work now, and the bookkeeping either way. */
function farTurn(open: boolean, who: string | undefined): boolean {
  if (who === undefined) {
    if (open) farStarted = true;
    return open;
  }
  farAsked.add(who);
  if (who === farHolder) {
    if (open || performance.now() < farHeldUntil) return true;
    // Its turn is over: to the back of the line.
    farHolder = null;
    farWaiting.add(who);
    return false;
  }
  let turn: string | null = null;
  for (const waiting of farWaiting) {
    turn = waiting;
    break;
  }
  if (turn === null || turn === who) {
    const forced = !open && !farForced && farDebt <= 0;
    if (open || forced) {
      farForced ||= forced;
      farHeldUntil = forced ? performance.now() + FAR_FORCED_MS : 0;
      farHolder = who;
      farWaiting.delete(who);
      farStarted = true;
      return true;
    }
  }
  farWaiting.add(who);
  return false;
}

/**
 * Once a frame, before the first streamer. Without it (a headless check) there
 * is no frame allowance and each streamer is held by its own slice.
 */
export function beginFrameBuild(): void {
  // Charged only for a frame that started far work: a frame that overran on
  // near work alone was already closed to the far, and owes it nothing.
  if (lastSpan >= 0 && farStarted) farDebt = Math.min(FAR_DEBT_CAP, farDebt + Math.max(0, lastSpan - FRAME_BUILD_MS));
  farDebt = Math.max(0, farDebt - FAR_BUILD_MS);
  lastSpan = -1;
  farStarted = false;
  farForced = false;
  farHolder = null;
  for (const waiting of farWaiting) if (!farAsked.has(waiting)) farWaiting.delete(waiting);
  farAsked.clear();
  frameBegan = performance.now();
}

/**
 * Once a frame, after the last streamer: records what the frame's building
 * cost, which charges the next frame's far allowance. A caller that never ends
 * a frame carries no debt.
 */
export function endFrameBuild(): void {
  if (frameBegan >= 0) lastSpan = performance.now() - frameBegan;
}

/** The most far work can owe, in milliseconds. */
const FAR_DEBT_CAP = 40;

/** Whether the frame has room left for one more build, near or far. */
export function frameOpen(near: boolean): boolean {
  if (frameBegan < 0) return true;
  if (!near && farDebt > 0) return false;
  return performance.now() - frameBegan < (near ? FRAME_BUILD_MS : FAR_BUILD_MS);
}

/**
 * `frameOpen` for work counted per frame rather than timed: the first near
 * item of the frame always goes (`done` is how many this caller has done) and
 * the rest wait for the allowance. Far work named by `who` takes turns
 * (`farTurn`).
 */
export function frameOpenFor(done: number, near: boolean, who?: string): boolean {
  if (near) return done === 0 || frameOpen(true);
  return farTurn(frameOpen(false), who);
}

/**
 * How long into its own slice a streamer may still start its first near build
 * of the frame when the frame's allowance is spent. Every streamer with near
 * work starts one build a frame, or those late in the frame's order (the wood,
 * the herds) would starve behind a queue of towns.
 */
const FIRST_BUILD_MS = 1;

/**
 * Whether a streamer may start one more build: inside its own slice (`share`
 * milliseconds since it began, at `began`) and inside the frame's — or, for
 * near work, as its first build of the frame (`FIRST_BUILD_MS`). Far work
 * named by `who` takes turns with the other named streamers (`farTurn`).
 */
export function mayBuild(began: number, share: number, near: boolean, who?: string): boolean {
  const own = performance.now() - began;
  if (own >= share) return false;
  if (near) return frameOpen(true) || own < FIRST_BUILD_MS;
  return farTurn(frameOpen(false), who);
}

/**
 * How far the haze should let you see, given how far the streamers build.
 * `main.ts` closes the fog at about 1.35 horizons, so geometry admitted past
 * that would be spent on a wall. The haze opens linearly with the knob,
 * anchored at the default, so a step of the knob changes the visible distance
 * in the same proportion as the reach.
 */
export const detailFog = (spread: number): number => spread * Math.SQRT1_2 * detailScale();

/**
 * The knob as a multiple of its default, which is the one curve every world
 * reads: Earth's haze above, and another world's reach and haze
 * (`worlds/index.ts`).
 */
export function detailScale(): number {
  return current / DETAIL_DEFAULT;
}

/**
 * Where the haze closes, in world units along the ground: `main.ts`'s fog
 * arithmetic in the one place a streamer can reach it, so reach and haze
 * cannot drift apart. Capping a reach at this binds on the ground, where the
 * haze is close, and not in the air, where it opens with altitude.
 */
export function fogFar(altitude: number, planetRadius: number): number {
  const horizon = horizonAt(altitude, planetRadius);
  return horizon * detailFog(1.35 + (altitude / planetRadius) * 6) * weatherHazeAt(altitude);
}

/**
 * Where the haze closes on foot in clear air at a given setting, in world
 * units: what the render distance means, for the settings card to say.
 */
export function clearHazeAt(value: number, planetRadius: number): number {
  const knob = clampDetail(value);
  return horizonAt(FOOT_ALTITUDE, planetRadius) * (1.35 + (FOOT_ALTITUDE / planetRadius) * 6) * Math.SQRT1_2 * (knob / DETAIL_DEFAULT);
}
/** The altitude the streamers are handed on foot: `STREAM_FLOOR` in `main.ts`. */
const FOOT_ALTITUDE = 20;

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
 * How much of the clear-air haze the weather leaves: 1 is clear air, fog, rain
 * and snow lower it to `WEATHER_HAZE_MIN`. `weather-view.ts` sets it a few
 * times a second. It lives here because streamers cap their reach on `fogFar`;
 * a fog that closed the haze without telling them would leave them building
 * towns nobody can see. It lets go between `HAZE_LIFT`'s two altitudes, so a
 * plane climbs out of the murk and the planet from orbit is never fogged by
 * the weather at the player's feet.
 */
let weatherHaze = 1;
export const WEATHER_HAZE_MIN = 0.28;
const HAZE_LIFT: [number, number] = [350, 1300];

export function setWeatherHaze(value: number): void {
  weatherHaze = Math.max(WEATHER_HAZE_MIN, Math.min(1, Number.isFinite(value) ? value : 1));
}
