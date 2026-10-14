/** The sun's shadow: the box's size and fades, the light's settings, and how the light is placed. */
import * as THREE from 'three';
import { DEG, sunDirection } from './astronomy.ts';
import { NORTH } from './twilight.ts';

/**
 * The sun's shadow map, and the box it covers.
 *
 * A planet cannot have one shadow map (2048 texels over 32,000 units is a texel
 * every 15.6 units), so the map covers a box that follows the player:
 * `SHADOW_REACH` either side of where you stand, where a texel is
 * `2 * 170 / 2048 = 0.166` units across the sun's bearing, 23 texels up a
 * 3.77-unit body. That keeps a hat's brim and a leg apart at the distance the
 * camera sits. Along the bearing a texel stretches by `1 / sin(elevation)`:
 * 0.33 units at 30 degrees, 1.2 at 8, which is why the shadow fades below.
 *
 * Moving a directional light along its own direction changes nothing in the
 * shading (three reads it as `normalize(position - target)`), so the light is
 * put at `focus + direction * SHADOW_DISTANCE` with its target on the focus. The
 * focus is snapped to whole texels in the shadow camera's own frame, or every
 * shadow shimmers as the box slides; that frame is rebuilt exactly as
 * `Matrix4.lookAt` builds it (right is `up x direction`, `up` being world Y). The
 * lattice it rounds to must itself hold still: see `SHADOW_STEP`.
 *
 * `SHADOW_DEPTH` is derived. The land never casts (a shadow pass over it would
 * redraw the whole planet), so the map only holds what stands on the ground,
 * and the range it needs along the light is the ground inside the box,
 * `SHADOW_REACH / tan(elevation)` at the elevation the fade completes at, plus
 * `SHADOW_RELIEF` of hill either side of the focus (peaks reach 620 units).
 * The depth texture is 24-bit, so the range costs nothing in precision.
 *
 * The bias pair is in world units and converted once, because three's `bias` is
 * a fraction of the depth range.
 */
const SHADOW_MAP_SIZE = 2048;
const SHADOW_REACH = 170;
const SHADOW_RELIEF = 700;
/**
 * Degrees of sun elevation the shadow fades over: none from a sun on the
 * horizon, whose shadows are texels stretched to 2 units and a kilometre long,
 * full by the time the mood is fully day (`DAY_ELEVATION` is 10). Halfway at 8.
 */
export const SHADOW_SUN_FADE: readonly [number, number] = [4, 12];
/**
 * Units of eye height above the ground under the player the shadow fades over.
 * The box is 340 units across and its edge is a line where shadows stop. On the
 * ground it cannot be seen (the ground at its edge is seen at a grazing angle),
 * but from the plane's circuit the camera looks down at the far edge at about
 * sixty degrees and every tree's shadow ends on the same moving line. So the
 * fade is full on foot (camera 15 up) and in the boat (20), and gone by the
 * circuit altitude (camera 18 above a plane 320 up). It is measured against the
 * ground under the player rather than sea level, so a mountain top keeps its
 * shadows.
 */
export const SHADOW_EYE_FADE: readonly [number, number] = [60, 240];
const SHADOW_DEPTH = SHADOW_REACH / Math.tan(SHADOW_SUN_FADE[1] * DEG) + SHADOW_RELIEF;
export const SHADOW_DISTANCE = 2 * SHADOW_DEPTH;
export const SHADOW_TEXEL = (2 * SHADOW_REACH) / SHADOW_MAP_SIZE;
/**
 * How far from the player a caster can stand and still be in the box: its
 * corner, plus a bus's length for what stands astride the edge. `main.ts`
 * redraws the map every frame while something that moves is inside this, and on
 * the slow cadence otherwise.
 */
export const SHADOW_COVER = SHADOW_REACH * Math.SQRT2 + 20;
/**
 * Degrees the sun moves before the shadow light follows it.
 *
 * Snapping the box to whole texels keeps shadows still while the player walks
 * only if the texel lattice holds still, and one built on the live sun does
 * not: its axes turn with the sun, and with the snap measured from the planet's
 * centre 16,000 units away the lattice slid across the ground by several
 * texels, so small shadows (a chimney's, a ridge cap's) crawled at the redraw
 * rate.
 *
 * Two things stop it and both are needed. The light's direction is the sun's as
 * of the last whole step, so between steps the axes do not turn; and the
 * lattice is pinned to the last focus instead of to the centre (`pin` in
 * `createShadowPlacer`), so when a step does turn it, it turns about the
 * player. At 0.03 degrees a step is 7.2 seconds of sun and moves the lattice
 * under a shadow 60 units away by at most a tenth of a texel.
 */
const SHADOW_STEP = 0.03;
/** `SHADOW_STEP` as clock time: the sun's hour angle runs 360 degrees a day. */
export const SHADOW_STEP_MS = (SHADOW_STEP / 360) * 86_400_000;
/**
 * How dark a cast shadow is, as the fraction of the sun's term it removes.
 * `MeshToonMaterial` multiplies the whole directional term by the shadow, ramp
 * floor included, so a shadowed surface keeps `1 - intensity` of its sunlight
 * plus all the ambient and hemisphere fill; that is why a cast shadow can go
 * darker than the ramp's shadow band without going to a muddy neutral black.
 * With the sun at 47 degrees the same paving reads 226 in the sun, 154 in the
 * ramp's shadow band and 134 in a cast shadow at 0.65.
 */
export const SHADOW_INTENSITY = 0.65;
/** Units the receiving surface is pushed along its normal before the test. */
const SHADOW_NORMAL_BIAS = 0.34;
/** Units of depth the receiver is pulled towards the light. Negative is towards. */
const SHADOW_BIAS = -0.145;
/**
 * A sun's shadow, as Earth's is cast: the map, the blur, the biases and the
 * box. One definition for every world: another world's sun (`worlds/sky.ts`)
 * casts through this, sits `SUN_SHADOW.distance` up its own direction from the
 * traveller and fades as Earth's does.
 */
export function castSunShadow(sun: THREE.DirectionalLight): void {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.radius = SHADOW_RADIUS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
  // Three's bias is a fraction of the depth range: units over the range.
  sun.shadow.bias = SHADOW_BIAS / (2 * SHADOW_DEPTH);
  sun.shadow.intensity = 0;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -SHADOW_REACH;
  shadowCamera.right = SHADOW_REACH;
  shadowCamera.bottom = -SHADOW_REACH;
  shadowCamera.top = SHADOW_REACH;
  shadowCamera.near = SHADOW_DISTANCE - SHADOW_DEPTH;
  shadowCamera.far = SHADOW_DISTANCE + SHADOW_DEPTH;
  shadowCamera.updateProjectionMatrix();
}

/** How far up its direction a shadow-casting sun stands, and how its shadow fades: with the sun's elevation and the eye's height. */
export const SUN_SHADOW = {
  distance: SHADOW_DISTANCE,
  intensity: SHADOW_INTENSITY,
  sunFade: SHADOW_SUN_FADE,
  eyeFade: SHADOW_EYE_FADE,
} as const;

/**
 * Texels of blur across the shadow's edge. One, not four: r182's PCF samples a
 * hardware `sampler2DShadow` (already a bilinear comparison) on a 3x3 grid
 * spread `radius` texels apart, and at 4 the taps straddle the shadow instead
 * of sampling it, leaving a wash that reads as no shadows at all.
 */
const SHADOW_RADIUS = 1;

/**
 * The shadow box: placed on the player and snapped to its own texels, with the
 * light's direction stepped (`SHADOW_STEP`) so the map is not redrawn for
 * nothing.
 */
export function createShadowPlacer(sun: THREE.DirectionalLight) {
  const shadowRight = new THREE.Vector3();
  const shadowUp = new THREE.Vector3();
  const focus = new THREE.Vector3();
  /** Where the player stood at the last `update`; what `placeShadow` centres on. */
  const shadowFocus = new THREE.Vector3();
  /** The sun as of the last whole `SHADOW_STEP`, which is where the light points. */
  const lightDirection = new THREE.Vector3(0, 1, 0);
  let lightStep = Number.NaN;
  const stepTime = new Date(0);
  /**
   * A point of the texel lattice, which the next placement snaps against. It is
   * the last focus, so moving it there every time moves the lattice not at all,
   * until the light's direction steps; then the lattice turns about the player
   * instead of about the centre of the planet. See `SHADOW_STEP`.
   */
  const pin = new THREE.Vector3();
  let pinned = false;

  function placeShadow(): void {
    // The box on the player, snapped to its own texels (see `SHADOW_REACH` and
    // `SHADOW_STEP`). The light sits `SHADOW_DISTANCE` up its own direction from
    // there.
    shadowRight.crossVectors(NORTH, lightDirection).normalize();
    shadowUp.crossVectors(lightDirection, shadowRight);
    if (!pinned) {
      pin.copy(shadowFocus);
      pinned = true;
    }
    focus.copy(shadowFocus).sub(pin);
    const alongRight = focus.dot(shadowRight);
    const alongUp = focus.dot(shadowUp);
    focus
      .copy(shadowFocus)
      .addScaledVector(shadowRight, Math.round(alongRight / SHADOW_TEXEL) * SHADOW_TEXEL - alongRight)
      .addScaledVector(shadowUp, Math.round(alongUp / SHADOW_TEXEL) * SHADOW_TEXEL - alongUp);
    pin.copy(focus);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(lightDirection, SHADOW_DISTANCE);
  }

  /** Points the light at the sun as of the last whole `SHADOW_STEP` of `time`. */
  function stepLight(time: Date): void {
    const step = Math.floor(time.getTime() / SHADOW_STEP_MS);
    if (step !== lightStep) {
      lightStep = step;
      stepTime.setTime(step * SHADOW_STEP_MS);
      sunDirection(stepTime, lightDirection);
    }
  }

  return { placeShadow, stepLight, shadowFocus };
}
