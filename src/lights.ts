import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { PALETTE } from './theme.ts';
import { radiusOf } from './places.ts';
import type { Place } from './places.ts';

/**
 * What is on when the sun is off.
 *
 * `sun.ts` decides what the *world* looks like at an hour and this file decides
 * what the world **emits**, and the split is the whole design. A mood is the air
 * around you — the sky, the fog, the fill, the floor of the cel ramp — and every
 * one of those is a property of where the *player* is standing. A lit window is
 * not: it is a property of where the *window* is standing, and on a planet you
 * fly over those two are different places in the same frame.
 *
 * That is the one requirement this file exists to meet. **The terminator sweeps
 * the planet, so a town on the day side must be dark and a town on the night
 * side lit, at the same instant, seen from the same camera.** Anything keyed to
 * `sky.state.elevation` — the sun's height where *you* are — looks right on the
 * ground and is wrong from the air, which is the one view the feature exists
 * for. So every light here takes its own local sun elevation from its own
 * position, in the shader, out of one shared direction:
 *
 * ```glsl
 * night = 1 - smoothstep(sin(-6 deg), sin(+2 deg), dot(normalize(worldPos), sunDir))
 * ```
 *
 * Three things are lit and they are three different things, which is worth
 * saying because the obvious implementation conflates them:
 *
 * - **Lit windows.** Interior light escaping through glazing. It is emission
 *   from a surface that is already in the town mesh — the dark rectangles the
 *   kit has always drawn — so it costs no geometry, no draw call and no second
 *   material. See `lightWindows`.
 * - **Street lights.** A lamp is not a window: it stands in the street rather
 *   than on a building, it is the same object by day, and it is what makes the
 *   *gaps* between the houses read at night, which is most of a village. It is
 *   `scenery/parts/street-lamp.ts`, placed by `settlements.ts` along the streets
 *   it already cuts.
 * - **Pools on the ground.** What the two above *land on*. A lamp lays a warm
 *   patch on the street and a lit building lays one against its own wall, and
 *   neither is a light in the renderer's sense — it is `settlements.ts` writing
 *   the same two bytes on the floor's own vertices that a window carries, so it
 *   goes through this file's terminator and this file's bedtime and costs no
 *   draw call, no triangle and no byte. See `poolByte`.
 * - **Cities from the air.** Neither of the three above exists past about twelve
 *   thousand units, because `settlements.ts` stops building towns there and from
 *   the plane's ceiling holds none at all. What you climb up to see therefore
 *   cannot be made of them. `createCityLights` draws **every place in
 *   `places.json`** as one buffer of points, from the data rather than from the
 *   scene — the same choice `map.ts` makes and for the same reason. The count is
 *   whatever the bake last produced (7,320 when this was written, 23,867 the
 *   week after) and the cost does not move with it: it is one draw call and
 *   twenty bytes a place either way.
 *
 * And what is **not** simulated, said plainly because the pools look like it:
 * **nothing here is a light.** There is no point light anywhere in this file and
 * there must not be — hundreds of them in a scene whose whole look is one
 * directional light stepping across a four-band ramp would flatten the ramp and
 * take the cel shading with it, which is the failure `theme.ts` is arranged
 * around. A pool is a *drawn* shape with a colour, the way a comic draws a
 * street at night: emission on vertices that already exist, obeying no falloff
 * the renderer knows about.
 *
 * The consequence is that light lands where there are vertices to land on, and
 * **there are none on a wall**: measured over the kit, a `gabled-house`'s wall
 * mass has six distinct vertices and every one is 4.89 to 5.30 units from the
 * nearest window, and a `tower-block`'s eight are 5.64 to 5.81 on a wall 22.8
 * units tall. A per-vertex wash there is one number for the whole wall, which
 * is the lantern `ctx.lit` warns about. See the trap. A moonlit wall is not this
 * file's either: that is `NIGHT_MOOD`'s moon, and it is the thing that keeps a
 * direction to step across after dark.
 */

const DEG = Math.PI / 180;

/**
 * Sun elevations the lights are keyed at, as the sine of the angle, which is
 * what a dot product against the local up already is.
 *
 * Full on by six degrees below the horizon — the middle of civil twilight, when
 * a real street lamp is already lit — and fully out two degrees above it. Both
 * are inside the ninety minutes `sun.ts` spends blending its three moods, so
 * the lights arrive while the sky is still changing rather than switching on
 * into a finished night.
 */
const NIGHT_FULL = Math.sin(-6 * DEG);
const NIGHT_NONE = Math.sin(2 * DEG);

/**
 * One GLSL function, shared by the town material and the point field, because
 * two copies of a terminator is how the windows of a city come on at a
 * different minute than the halo over it.
 */
const NIGHT_CHUNK = /* glsl */ `
  float atlasNight(vec3 upDir, vec3 sunDir) {
    return 1.0 - smoothstep(${NIGHT_FULL.toFixed(6)}, ${NIGHT_NONE.toFixed(6)}, dot(upDir, sunDir));
  }

  /**
   * Local solar time at a point, in hours, running 12 (noon) to 36 (next noon)
   * so that an evening and the small hours after it are one increasing number.
   *
   * The terminator above cannot answer this: dot(up, sun) is the same at nine in
   * the evening and at three in the morning, and half of what a night city looks
   * like is the difference between those two. Longitude against the subsolar
   * meridian is the whole of it, and it is free — the planet is centred on the
   * origin, so a vertex's own position is its longitude.
   *
   * It is *solar* time and not the clock. src/timezone.ts exists because a clock
   * two hours off the player's wrist is a bug in a HUD; a window that goes dark
   * two hours early is not a thing anyone can catch.
   */
  float atlasSolarHour(vec3 upDir, float subsolarLon) {
    float lon = atan(-upDir.z, upDir.x);
    float h = 12.0 + (lon - subsolarLon) * 3.8197186;
    return h < 12.0 ? h + 24.0 : (h >= 36.0 ? h - 24.0 : h);
  }
`;

/**
 * The colour of made light, and it is not a palette entry.
 *
 * `ctx.toon` refuses anything outside `PALETTE` and that gate is right for
 * *surfaces*: it is what keeps sixty-five monuments and a kit of houses looking
 * like one world. A light is not a surface — the sun disc, the moon and the
 * dome's stars are all mixed towards white for the same reason, and a window at
 * full palette `gold` reads as a painted orange panel rather than as something
 * shining. Derived from the palette rather than invented: `gold` a third of the
 * way to the palette's own warm white.
 */
const WINDOW_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.34);

/**
 * How far over 1 a fully lit window is driven, and **it has to be over 1 or the
 * whole feature reads as paint rather than as light.**
 *
 * What makes gain 1 too dim is not the colour, it is that the lottery which
 * gives a street its variety — `WINDOW_DARK`, `WINDOW_LOW` and `INSTANCE_DIM` in
 * `settlements.ts` — multiplies the *typical* window down to about half. Measured
 * over one frame in Ulm at 22:00, same camera, as a histogram of how far each
 * pixel moved when the emission is switched on:
 *
 * ```
 *   delta        0-40   40-80  80-120  120-160  160-200  200+   pixels moved
 *   gain 1      4,868   7,610   2,025      663       18     2      15,186
 *   gain 2.4    2,138   6,779   3,505    1,371    1,162   286      15,241
 * ```
 *
 * The same pixels light up either way and the whole difference is where they
 * land: at gain 1 **twenty pixels of the frame cross 160** and a window is a warm
 * grey on a night wall, which is what a warm grey is. At 2.4 there are 1,448, the
 * mean window is `(252, 212, 160)`, the brightest saturate to a warm white, and
 * the dimmest still sit at `(147, 122, 87)`.
 *
 * It is a constant in the shader rather than a uniform because it is a property
 * of the *look*, not something to scrub: `atlasGain` is the debug lever and it
 * multiplies this.
 */
const WINDOW_GAIN = 2.4;

/**
 * When a window goes out, in local solar hours on `atlasSolarHour`'s clock —
 * 20.5 is half past eight in the evening and 27.5 is half past three the next
 * morning.
 *
 * **This is what makes a night have a shape rather than a switch.** Every window
 * in the world used to come on at dusk and still be on at four, which is a city
 * that has been turned on rather than one that is being lived in. The hour is
 * drawn from the window's own seed, so it costs one byte a vertex and nothing
 * per frame, and it is skewed early — `t^1.6` — because most rooms go dark
 * before midnight and the tail to the small hours is thin.
 *
 * `NEVER` is the share that stays on all night: stairwells, shopfronts, a
 * corridor somebody left. Without it a city is completely dark by four in the
 * morning, which is truer of a village than of anywhere with a name.
 */
const BED_FROM = 20.5;
const BED_TO = 27.5;
const BED_NEVER = 0.12;
/** Hours the byte spans, so 18:00 is 0 and 34:00 is 255: a step of 3.75 minutes. */
const BED_BASE = 18;
const BED_SPAN = 16;
/** Encoded bedtimes past this are never reached, because dawn arrives first. */
const BED_ALWAYS = 255;

/**
 * The city-light colour, and it is **more saturated than the window colour, not
 * less**.
 *
 * The first version reused `WINDOW_LIGHT` and pushed it past 1 to make the dots
 * bright, which is the one thing an additive sprite must not do: over 1 the
 * green and blue channels clip together with the red and the light goes
 * **white**. Measured over the Ruhr from 6,000 units up, the field rendered as
 * white confetti on a green map — the read was hail, not cities.
 *
 * **Two things were doing it and only one of them was the colour.** The other is
 * in `src/outline.ts`: the ink pass draws the whole scene again, so an additive
 * object is added *twice*, and the same lights measured `(253, 253, 199)` through
 * one pass against `(255, 255, 238)` through two. Fixing the pass and holding
 * the colour under 1 — with the *alpha* carrying the brightness instead — is what
 * keeps the hue: `gold` barely mixed towards white is `(233, 182, 90)` on
 * screen, and a warm amber dot on dark ground is the only thing that says
 * sodium lamp from two hundred kilometres up.
 */
const POINT_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.12);

/**
 * How hard the alpha is driven, so that a large city clips and a village does
 * not.
 *
 * On the alpha rather than on the colour — see above. Over 1 it saturates in the
 * blend, which is the intended headroom: it is what makes Tokyo a solid mark
 * where a market town of six thousand is a speck.
 */
const POINT_GAIN = 1.35;

/**
 * Shared uniforms. Module state, the way `theme.ts` owns every toon ramp and
 * for the same reason: the alternative is every file that emits light being
 * handed the sun.
 */
const atlasSun = { value: new THREE.Vector3(0, 1, 0) };
/** Longitude of the subsolar point, radians. The other half of the clock. */
const atlasSubsolar = { value: 0 };
const atlasLight = { value: WINDOW_LIGHT.clone() };
/** Master gain, so `atlas.lights.brightness(0)` is the A/B for the whole feature. */
const atlasGain = { value: 1 };

/**
 * Called once a frame from `main.ts`, before the render.
 *
 * Two numbers and they answer different questions. The **direction** says
 * whether a point is on the night side, which is what turns a light on. The
 * **subsolar longitude** says how far into that night it is, which is what turns
 * one off again — see `atlasSolarHour`.
 */
export function setSunDirection(direction: THREE.Vector3, subsolarLon: number): void {
  atlasSun.value.copy(direction);
  atlasSubsolar.value = subsolarLon * DEG;
}

/**
 * How far into the night a point is, 0 by day to 1 after dusk: `atlasNight`
 * above, for the one light drawn on the CPU's side — a lighthouse's beam
 * (`countryside-motion.ts`) — so it comes on at the same minute as the windows
 * round it. The master gain rides on it, as it does on theirs.
 */
export function nightAt(up: THREE.Vector3): number {
  const t = Math.min(1, Math.max(0, (up.dot(atlasSun.value) - NIGHT_FULL) / (NIGHT_NONE - NIGHT_FULL)));
  return (1 - t * t * (3 - 2 * t)) * atlasGain.value;
}

export function lightBrightness(value?: number): number {
  if (value !== undefined) atlasGain.value = Math.max(0, value);
  return atlasGain.value;
}

// ---------------------------------------------------------------------------
// The near lamps: pools drawn per pixel round the camera
// ---------------------------------------------------------------------------

/**
 * How many street lamps are lit per pixel at once: the nearest this many to the
 * camera, out of every standing town's (`settlements.lampsNear`).
 *
 * **A pool written on a vertex is as fine as the floor under it, and the floor
 * is coarse.** Its vertices are 4 to 15 units apart against a 14-unit pool, so
 * seen from the street a lamp's pool was a lifted polygon with the floor's own
 * triangles in it, a plot's spill was a square of evenly warm paving, and a
 * street at night read as yellow ground with a rim rather than as lamps. Up
 * close the pixel is asked instead: a disc under every lamp, stepped in
 * two bands the way the sun steps across the ramp, landing on walls as well
 * as on the ground, and tinted by the surface it lands on rather than painted
 * over it. Past `LAMP_FIELD` the vertex pools take over again, where they are a
 * few pixels and read as what they are.
 */
export const NEAR_LAMPS = 24;

/** Where the per-pixel lamps hand back to the vertex pools, in units from the camera. */
export const LAMP_FIELD = 170;

/**
 * The sun's elevation where the player stands, in degrees, above which no
 * near lamp can be lit and none is looked for. `atlasNight` is nothing from
 * `NIGHT_NONE`'s 2 degrees up, and every lamp handed over stands within
 * `LAMP_FIELD` of a camera near the player — well under a degree of arc away
 * — so 5 leaves three degrees of margin and the picture unchanged, while a
 * frame by day skips both searches and the land skips the loop's test.
 */
export const LAMPS_OFF_ABOVE = 5;

/**
 * How far a lamp's light reaches along the ground, in world units, as a pool
 * written on the vertices of the ground it falls on.
 *
 * **The reach is the lamp's own height and not a number**: `street-lamp.ts`
 * builds a column 4.8 to 5.8 units tall, and a road's approach lamp
 * (`roadside.ts`) is 5.4, and light from a head at that height
 * grazing the ground at about 20 degrees stops at roughly two and a half times
 * it. 14 is that, and it is bounded on both sides by the floor it falls on —
 * a town's cell is 8 to 18 units across (`TOWN_PITCH` in `scenery/grid.ts`),
 * and the carriageway it crosses is 6.0 to 15.0. A reach
 * inside that range is a pool that is smaller than the block it stands in and
 * wider than the street, and **a pool wider than its own cell has no ground
 * left to be dark.** At 14 the floor of 140 resident towns comes out 58.8% lit,
 * spread from a tenth of peak to full; there is no reach that lights a street
 * and leaves this floor mostly dark, because there are only four to nine
 * vertices in a cell to say it with.
 *
 * `LAMP_STRENGTH` in `settlements.ts` is 1 rather than the lamp's own instance
 * draw. A lamp's head is dimmed 0.82 to 1 by its `raise` so a street of them is not a row of identical
 * bulbs, and carrying that into the pool would be the same lottery twice on two
 * surfaces a metre apart — the head and the ground under it visibly disagreeing
 * about how bright the lamp is.
 */
export const LAMP_POOL = 14;

/** How far one lamp reaches, in world units, per pixel; `LAMP_POOL` is the vertex pools' 14. */
const LAMP_REACH = 17;

/**
 * The colour a lamp lights with: a sodium amber, warmer than a window and
 * further from white, because what it lands on is the *surface's* colour and
 * the light only tints it (`diffuseColor * LAMP_LIGHT`), where a window is
 * itself the thing shining.
 */
const LAMP_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.45);

/** Lamp heads in view space (xyz) and how lit each one is (w), refreshed each frame. */
const atlasLamps = { value: Array.from({ length: NEAR_LAMPS }, () => new THREE.Vector4()) };
const atlasLampCount = { value: 0 };

/**
 * Headlights: the car you drive and the nearest few of the traffic's, lit
 * through the same per-pixel pools as the street lamps but as cones — a lamp
 * with a direction. `setHeadlights` hands them over each frame, before
 * `setNearLamps`.
 */
export const NEAR_HEADLIGHTS = 8;
/** How far a headlight reaches, in world units, and how wide its cone is. */
const HEAD_REACH = 48;
const HEAD_INNER = Math.cos(14 * DEG);
const HEAD_OUTER = Math.cos(30 * DEG);
const atlasHeads = { value: Array.from({ length: NEAR_HEADLIGHTS }, () => new THREE.Vector4()) };
const atlasHeadDirs = { value: Array.from({ length: NEAR_HEADLIGHTS }, () => new THREE.Vector3()) };
const atlasHeadCount = { value: 0 };
/**
 * How far from the camera any near lamp or headlight can light a surface:
 * the farthest of them plus its reach, in view units, refreshed with them.
 * A fragment further out than this is further than a reach from every one of
 * them, so the loops would add nothing, and it does not run them.
 */
const atlasLightReach = { value: 0 };
/** The headlights in world space, for the halos. */
const headWorld = new Float32Array(NEAR_HEADLIGHTS * 4);
const atlasLampTint = { value: LAMP_LIGHT.clone() };
/** How much a lamp lifts the surface it lands on, over its own colour. */
const LAMP_LIGHT_GAIN = 1.15;

/**
 * The GLSL for the near lamps' light on one fragment, as a banded amount 0..1.
 *
 * `pos` and `n` are the fragment's view-space position and normal. A lamp
 * lights a face by how near it is (squared, so most of the drop is in the
 * first half of the reach) and by how squarely the face looks at it, with a
 * floor of a third so the ground under a lamp's own arm is still lit. The sum
 * is then stepped: two bands with a narrow edge each, and a wall takes a
 * little over half what the ground under the same lamp does, which is a comic's
 * pool of light rather than a photograph's.
 */
const LAMP_CHUNK = /* glsl */ `
  uniform vec4 atlasLamps[${NEAR_LAMPS}];
  uniform int atlasLampCount;
  uniform vec4 atlasHeads[${NEAR_HEADLIGHTS}];
  uniform vec3 atlasHeadDirs[${NEAR_HEADLIGHTS}];
  uniform int atlasHeadCount;
  uniform float atlasLightReach;

  float atlasLampLight(vec3 pos, vec3 n, float flatness) {
    float sum = 0.0;
    for (int i = 0; i < ${NEAR_LAMPS}; i++) {
      if (i >= atlasLampCount) break;
      vec3 d = atlasLamps[i].xyz - pos;
      float dist = length(d);
      if (dist >= ${LAMP_REACH.toFixed(1)}) continue;
      float fall = 1.0 - dist / ${LAMP_REACH.toFixed(1)};
      float facing = max(dot(n, d / max(dist, 1e-3)), 0.0);
      sum += fall * fall * (0.34 + 0.66 * facing) * atlasLamps[i].w * mix(0.55, 1.0, flatness);
    }
    for (int i = 0; i < ${NEAR_HEADLIGHTS}; i++) {
      if (i >= atlasHeadCount) break;
      vec3 d = pos - atlasHeads[i].xyz;
      float dist = length(d);
      if (dist >= ${HEAD_REACH.toFixed(1)} || dist < 1e-3) continue;
      vec3 ray = d / dist;
      float cone = smoothstep(${HEAD_OUTER.toFixed(4)}, ${HEAD_INNER.toFixed(4)}, dot(ray, atlasHeadDirs[i]));
      float fall = 1.0 - dist / ${HEAD_REACH.toFixed(1)};
      float facing = max(dot(n, -ray), 0.0);
      sum += cone * fall * (0.3 + 0.7 * facing) * atlasHeads[i].w * 0.9;
    }
    return 0.55 * smoothstep(0.07, 0.1, sum) + 0.45 * smoothstep(0.26, 0.31, sum);
  }
`;

/**
 * The near lamps and the headlights for a surface that carries no `atlasLit`
 * bytes of its own — the land, round a town's edge and along every road — so a
 * pool that spills off the paving and a headlight that leaves the carriageway
 * keep lighting what they land on. Three pieces, for the material's own
 * `onBeforeCompile`: the uniforms, the declarations, and the statement that
 * adds the light, which wants `normal`, `vViewPosition` and `diffuseColor` in
 * scope (after `<emissivemap_fragment>` in a `MeshToonMaterial`) and a world
 * position whose direction is the local up.
 */
export function bindNearLights(uniforms: Record<string, THREE.IUniform>): void {
  uniforms.atlasSun = atlasSun;
  uniforms.atlasGain = atlasGain;
  uniforms.atlasLamps = atlasLamps;
  uniforms.atlasLampCount = atlasLampCount;
  uniforms.atlasHeads = atlasHeads;
  uniforms.atlasHeadDirs = atlasHeadDirs;
  uniforms.atlasHeadCount = atlasHeadCount;
  uniforms.atlasLightReach = atlasLightReach;
  uniforms.atlasLampTint = atlasLampTint;
}

export function nearLightsGLSL(): string {
  return /* glsl */ `
  uniform vec3 atlasSun;
  uniform float atlasGain;
  uniform vec3 atlasLampTint;
  ${NIGHT_CHUNK}
  ${LAMP_CHUNK}`;
}

export function nearLightsChunk(worldPosition: string): string {
  return /* glsl */ `
  if ((atlasLampCount > 0 || atlasHeadCount > 0) && length(vViewPosition) < atlasLightReach) {
    float atlasNearDark = atlasGain * atlasNight(normalize(${worldPosition}), atlasSun);
    if (atlasNearDark > 0.0) {
      totalEmissiveRadiance += (diffuseColor.rgb * ${LAMP_LIGHT_GAIN.toFixed(2)} + 0.06) * atlasLampTint
        * atlasLampLight(-vViewPosition, normal, 1.0) * atlasNearDark * 0.75;
    }
  }`;
}

const lampView = new THREE.Vector3();

/**
 * Hands the shaders this frame's near lamps: `heads` is `settlements.lampsNear`'s
 * output (`x, y, z, distance` in world space, nearest first) and `count` how
 * many of them there are. Each is moved into the camera's view space here, so
 * the fragment works on small numbers, and fades out over the last fifth of
 * `LAMP_FIELD` so a lamp leaving the list goes out by degrees.
 */
export function setNearLamps(camera: THREE.Camera, heads: Float32Array, count: number): void {
  const n = Math.min(count, NEAR_LAMPS);
  const view = camera.matrixWorldInverse;
  let reach = headReach;
  for (let i = 0; i < n; i++) {
    lampView.set(heads[i * 4]!, heads[i * 4 + 1]!, heads[i * 4 + 2]!).applyMatrix4(view);
    const distance = heads[i * 4 + 3]!;
    const fade = 1 - Math.min(1, Math.max(0, (distance - LAMP_FIELD * 0.8) / (LAMP_FIELD * 0.2)));
    atlasLamps.value[i]!.set(lampView.x, lampView.y, lampView.z, fade);
    reach = Math.max(reach, lampView.length() + LAMP_REACH);
  }
  atlasLampCount.value = n;
  // A unit of slack over the exact bound, for the view transform's rounding.
  atlasLightReach.value = reach > 0 ? reach + 1 : 0;
  halos.update(heads, n, headWorld, atlasHeadCount.value);
}

const headDir = new THREE.Vector3();
/** The headlights' part of `atlasLightReach`, which `setNearLamps` finishes. */
let headReach = 0;

/**
 * Hands the shaders this frame's headlights: `lights` is `x, y, z, dx, dy,
 * dz, strength` in world space, seven floats each, `count` of them. Call
 * before `setNearLamps`, which draws their halos with the lamps'.
 */
export function setHeadlights(camera: THREE.Camera, lights: Float32Array, count: number): void {
  const n = Math.min(count, NEAR_HEADLIGHTS);
  const view = camera.matrixWorldInverse;
  headReach = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    lampView.set(lights[o]!, lights[o + 1]!, lights[o + 2]!).applyMatrix4(view);
    headReach = Math.max(headReach, lampView.length() + HEAD_REACH);
    atlasHeads.value[i]!.set(lampView.x, lampView.y, lampView.z, lights[o + 6]!);
    headDir.set(lights[o + 3]!, lights[o + 4]!, lights[o + 5]!).transformDirection(view);
    atlasHeadDirs.value[i]!.copy(headDir);
    headWorld[i * 4] = lights[o]!;
    headWorld[i * 4 + 1] = lights[o + 1]!;
    headWorld[i * 4 + 2] = lights[o + 2]!;
  }
  atlasHeadCount.value = n;
}

/**
 * A soft glow round each near lamp's head, additive, so a street at night has
 * its lights *in* it and not only under it. The same points buffer is
 * rewritten each frame from `setNearLamps`; it is gated by the terminator in
 * its own shader like everything else here, so by day it draws nothing.
 */
function createHalos(): { points: THREE.Points; update(heads: Float32Array, count: number, more: Float32Array, extra: number): void } {
  const position = new Float32Array((NEAR_LAMPS + NEAR_HEADLIGHTS) * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(position, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  // Not the planet's radius: this runs as the module loads, which can be before
  // `globe.ts` (which imports this file) has one. The halos are never culled.
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']!),
      atlasSun,
      atlasGain,
      atlasLight: { value: LAMP_LIGHT.clone() },
      screenScale: { value: 450 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 atlasSun;
      uniform float atlasGain;
      uniform float screenScale;
      varying float vAlpha;
      #include <common>
      #include <fog_pars_vertex>
      ${NIGHT_CHUNK}
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(-mvPosition.z, 1.0);
        vAlpha = atlasNight(normalize(position), atlasSun) * atlasGain
          * (1.0 - smoothstep(${(LAMP_FIELD * 0.7).toFixed(1)}, ${LAMP_FIELD.toFixed(1)}, dist));
        gl_PointSize = clamp(2.6 * projectionMatrix[1][1] * screenScale / dist, 2.0, 96.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 atlasLight;
      varying float vAlpha;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        if (vAlpha < 0.004) discard;
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float glow = (1.0 - smoothstep(0.0, 1.0, r));
        float core = 1.0 - smoothstep(0.12, 0.2, r);
        gl_FragColor = vec4(atlasLight, (glow * glow * 0.55 + core * 0.6) * vAlpha);
        #ifdef USE_FOG
          gl_FragColor *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.name = 'lamp-halos';
  points.renderOrder = 2;
  points.frustumCulled = false;
  return {
    points,
    update(heads, count, more, extra) {
      for (let i = 0; i < count; i++) {
        position[i * 3] = heads[i * 4]!;
        position[i * 3 + 1] = heads[i * 4 + 1]!;
        position[i * 3 + 2] = heads[i * 4 + 2]!;
      }
      for (let j = 0; j < extra; j++) {
        const i = count + j;
        position[i * 3] = more[j * 4]!;
        position[i * 3 + 1] = more[j * 4 + 1]!;
        position[i * 3 + 2] = more[j * 4 + 2]!;
      }
      // By day there are none, and nothing to send.
      if (count + extra > 0) attribute.needsUpdate = true;
      geometry.setDrawRange(0, count + extra);
      material.uniforms.screenScale!.value = (typeof innerHeight === 'number' ? innerHeight : 900) * 0.5;
    },
  };
}

const halos = createHalos();

/** The glow round the near lamps' heads, to add to the scene once. */
export const lampHalos: THREE.Points = halos.points;

/**
 * Draws one window's bedtime and returns it as the byte the buffer carries.
 *
 * Exported because the *encoding* has to be one thing: `settlements.ts` writes
 * the byte and the shader reads it, and two files agreeing on 18 and 16 by
 * having both typed out is exactly how a city ends up going dark at teatime.
 */
export function bedtimeByte(draw: number, never: boolean): number {
  if (never) return BED_ALWAYS;
  const hour = BED_FROM + (BED_TO - BED_FROM) * draw ** 1.6;
  return Math.max(0, Math.min(254, Math.round((hour - BED_BASE) * BED_SPAN)));
}

/** The share of windows that never go out. See `BED_NEVER`. */
export const bedtimeNever = (draw: number): boolean => draw < BED_NEVER;

/**
 * The brightest a **pool** may be written, as a share of a window's own byte.
 *
 * A window and the ground under it are the same emission through the same
 * uniform, and they must not be the same *number*, because they are seen at
 * opposite ends of the exposure. A window is a two-pixel-thick rectangle whose
 * whole read is that it saturates — the trap above measured that at gain 1 only
 * twenty pixels of a frame cross 160 and the thing reads as warm grey paint. A
 * pool is fifty times that area, and **an area driven to the same clip is not a
 * lamp on a road, it is a white tile.**
 *
 * Measured 260 units over Nordlingen at 22:20, 140 resident towns, the same
 * frame with only this number changed. `warm` is red over 200 with blue at
 * least 40 below it; `white` is every channel over 200:
 *
 * ```
 *   peak   red > 200    warm     white    brightest pixel
 *   0.42     69,909    69,641      241    (255, 255, 215)
 *   0.50     94,317    94,199      250    (255, 255, 215)
 *   1.00    166,002   148,266   40,393    (255, 255, 245)
 * ```
 *
 * **At 1.0 forty thousand pixels of the frame go white against two hundred and
 * forty at 0.42** — a hundred and sixty-eight times as many, and the town comes
 * out as pale slabs with a rim. 0.42 is where the *core* clips and the rest of
 * the pool does not: `WINDOW_GAIN * 0.42` is 1.008, so the red channel of
 * `WINDOW_LIGHT` reaches 1 and the blue reaches 0.42, which is an amber centre
 * on ground whose own night value is about 0.15. It is the additive rule the
 * city lights already follow, seen from the emissive side: mix *towards* white,
 * never past it.
 *
 * It is here rather than in `settlements.ts` for the reason `bedtimeByte` is:
 * the encoding has to be one thing, and a peak written down in the file that
 * fills the buffer and a gain written down in the file that reads it is exactly
 * how a street ends up brighter than the windows above it.
 */
const POOL_PEAK = 0.42;

/**
 * A pool's falloff, encoded as the byte `atlasLit.x` carries.
 *
 * `strength` is how bright the emitter is (a lamp's own instance draw, a
 * building's window dimming) and `falloff` is 1 at the emitter and 0 at the
 * edge of its reach. Squared, because the vertices a town's floor already has
 * are 4 to 15 units apart and a linear ramp across one of them is a wash: the
 * square puts three quarters of the drop in the first half of the reach, which
 * is where the geometry can still resolve it.
 */
export function poolByte(strength: number, falloff: number): number {
  const value = Math.max(0, Math.min(1, falloff));
  return Math.round(Math.max(0, Math.min(1, strength)) * value * value * POOL_PEAK * 255);
}

/**
 * An emitter's pool at a point `distance` from it, as the byte `atlasLit.x`
 * carries: full out to `inner`, falling by `poolByte`'s square to nothing at
 * `reach`.
 *
 * **One law for every surface a pool lands on.** A town's floor asks it about
 * each lamp, lit building and gate light round every vertex, and a road's
 * ribbon asks it about the light at the gate it comes in by (`gateGlow` in
 * `scenery/grid.ts`), so the two meet at the kerb on the same value. Until
 * 2026-09-13 only the floor carried light: a road entering a lit town at night
 * met a floor glowing amber at the kerb and stayed dark itself, and once the
 * floor was the road's own colour the line between them was the whole
 * difference. The light has to reach everything, or the cut shows.
 */
export function poolAt(strength: number, distance: number, inner: number, reach: number): number {
  if (distance >= reach) return 0;
  const span = reach - inner;
  return poolByte(strength, span <= 0 ? 1 : 1 - Math.max(0, distance - inner) / span);
}

// ---------------------------------------------------------------------------
// Lit windows: emission inside a merged, vertex-coloured town
// ---------------------------------------------------------------------------

/**
 * Teaches one `MeshToonMaterial` to emit wherever the `atlasLit` attribute says
 * so, gated by the local terminator.
 *
 * **A second mesh with an emissive material was the obvious answer and it is the
 * expensive one.** A town is one merged buffer and one draw call precisely
 * because that measured two hundred times better than instancing it (see
 * `townMaterial` in `settlements.ts`); splitting the windows out into their own
 * mesh gives every resident settlement a second draw call, and `OutlineEffect`
 * doubles it again. A per-vertex attribute costs one byte a vertex — `+2.8%` of
 * a buffer that already carries position, normal and colour as floats — and
 * nothing at draw time at all.
 *
 * The attribute is `Uint8` normalised rather than a float, and the reason is the
 * same one `vegetation.ts` gives for its normals: a window is on, off, or one of
 * a couple of hundred dimmer values, and a quarter of a percent of brightness is
 * not a thing anyone can see against a four-band ramp.
 *
 * It hooks `<emissivemap_fragment>`, which is where `MeshToonMaterial` already
 * builds `totalEmissiveRadiance`, so the emission goes through the material's
 * own `outgoingLight` and therefore through tone mapping, the colour space
 * conversion and the fog, in that order. Fogging it matters: a lit window a
 * thousand units off should sit in the same haze as the wall around it.
 *
 * The outline pass is untouched. `src/outline.ts` builds its own
 * `ShaderMaterial` per source material and never reads this one's program, so a
 * window that glows is still a window with an ink line round it.
 */
export function lightWindows(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.atlasSun = atlasSun;
    shader.uniforms.atlasSubsolar = atlasSubsolar;
    shader.uniforms.atlasLight = atlasLight;
    shader.uniforms.atlasGain = atlasGain;
    shader.uniforms.atlasLamps = atlasLamps;
    shader.uniforms.atlasLampCount = atlasLampCount;
    shader.uniforms.atlasHeads = atlasHeads;
    shader.uniforms.atlasHeadDirs = atlasHeadDirs;
    shader.uniforms.atlasHeadCount = atlasHeadCount;
    shader.uniforms.atlasLightReach = atlasLightReach;
    shader.uniforms.atlasLampTint = atlasLampTint;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec2 atlasLit;
        varying vec2 vAtlasLit;
        varying vec3 vAtlasUp;`,
      )
      // After `project_vertex` rather than before it: `transformed` is final by
      // then, and the planet is centred on the origin, so the normalised world
      // position of a vertex *is* the local up at the window.
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        vAtlasLit = atlasLit;
        vAtlasUp = normalize((modelMatrix * vec4(transformed, 1.0)).xyz);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 atlasSun;
        uniform float atlasSubsolar;
        uniform vec3 atlasLight;
        uniform float atlasGain;
        uniform vec3 atlasLampTint;
        varying vec2 vAtlasLit;
        varying vec3 vAtlasUp;
        ${NIGHT_CHUNK}
        ${LAMP_CHUNK}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // The terminator first: by day nothing below is lit at all, and the
        // bedtime's arctangent and the lamps' loop are skipped with it.
        float atlasDark = atlasGain * atlasNight(vAtlasUp, atlasSun);
        if (atlasDark > 0.0) {
          // A face that looks at the sky is ground (a slope too: the edge of a
          // town is one, and lit as a window it came out as a yellow rim round
          // every town seen from the air), and on the ground the byte is
          // a pool rather than a window: it tints the surface it lies on instead
          // of being painted over it, and inside the near lamps' field it gives
          // way to them (see NEAR_LAMPS), keeping a quarter as the spill of the
          // lit rooms and the gates.
          float atlasFlat = smoothstep(0.25, 0.5, dot(normal, normalize(mat3(viewMatrix) * vAtlasUp)));
          if (vAtlasLit.x > 0.0) {
            // x is how bright this window is, y is the hour it goes out. Half an
            // hour of ramp either side of the hour, because a room does not switch.
            float atlasBed = ${BED_BASE.toFixed(1)} + vAtlasLit.y * ${(255 / BED_SPAN).toFixed(6)};
            float atlasAwake = 1.0 - smoothstep(atlasBed - 0.5, atlasBed + 0.5,
              atlasSolarHour(vAtlasUp, atlasSubsolar));
            float atlasNearField = atlasLampCount > 0
              ? 1.0 - smoothstep(${(LAMP_FIELD * 0.6).toFixed(1)}, ${(LAMP_FIELD * 0.9).toFixed(1)}, length(vViewPosition))
              : 0.0;
            vec3 atlasPool = mix(atlasLight, diffuseColor.rgb * atlasLight * 0.9, atlasFlat)
              * (1.0 - atlasFlat * atlasNearField * 0.75);
            totalEmissiveRadiance += atlasPool * (${WINDOW_GAIN.toFixed(2)} * vAtlasLit.x * atlasAwake * atlasDark);
          }
          if ((atlasLampCount > 0 || atlasHeadCount > 0) && length(vViewPosition) < atlasLightReach) {
            float atlasLamp = atlasLampLight(-vViewPosition, normal, atlasFlat);
            totalEmissiveRadiance += (diffuseColor.rgb * ${LAMP_LIGHT_GAIN.toFixed(2)} + 0.06) * atlasLampTint * atlasLamp * atlasDark;
          }
        }`,
      );
  };
}

// ---------------------------------------------------------------------------
// Cities from the air
// ---------------------------------------------------------------------------

/**
 * How far above the ground a city's own light hangs, in world units.
 *
 * Enough to clear the tallest thing the kit builds — a tower block is 29 — so a
 * light is never drawn inside the town it belongs to, and small enough that it
 * is a fraction of a pixel out of place from anywhere it is visible from.
 */
const LIGHT_LIFT = 32;

/**
 * Where the point field takes over from the town mesh, in world units of
 * distance from the camera.
 *
 * **The two have to overlap and must not coincide.** Standing in a town its own
 * windows and lamps are what you see, and a soft warm disc pasted over them
 * would be a lens flare on a street; from the plane's ceiling the towns do not
 * exist and the discs are the whole picture. The near end is the on-foot fog at
 * detail 1 (about 1,430 units), so on the ground the field is behind the haze
 * whatever the knob says, and it is fully in by four thousand, which is about
 * where a median town stops resolving as anything but a smudge.
 */
const FADE_NEAR = 1500;
const FADE_FAR = 4000;

/**
 * The smallest and largest a city's light may be drawn, in CSS pixels.
 *
 * The floor is what makes this a map of civilisation rather than a map of the
 * six biggest cities: from the ceiling a 25-unit town subtends 937 * 50 /
 * 23,000 = 2.0 pixels and a hamlet half of that, so without a floor the night
 * hemisphere is empty except over Tokyo.
 *
 * **The ceiling is the number that was wrong first and it was wrong by a factor
 * of two and a half.** At 11 px a median town seen from 6,000 units up is
 * already at the cap — its true apparent size there is 7 px — so the whole of
 * Europe came out as evenly sized dots the size of a fingernail on a map, which
 * reads as *polka dots on a chart* and not as light. What a light at that range
 * has to be is smaller than the thing it stands for: 4.5 px is about a fifth of
 * the town's own diameter on screen, which is roughly the share of a town that
 * is actually lit.
 */
const MIN_PIXELS = 1.6;
const MAX_PIXELS = 4.5;

/**
 * How bright a place is, from its population.
 *
 * The same logarithm `urbanityOf` uses in `settlements.ts`, because population
 * is logarithmic and a linear read makes every place on the planet either
 * Chongqing or nothing. The floor is 0.3 rather than 0: a village at night is a
 * few lights and not none, and the point field is the only thing that will ever
 * say a village is there from the air.
 */
function brightnessOf(pop: number): number {
  const t = Math.min(1, Math.max(0, (Math.log10(Math.max(1, pop)) - 2.6) / 3.8));
  // Curved, not linear, and that is what gives the field its structure. The bake
  // is GeoNames `cities5000`, so the population histogram is overwhelmingly
  // small towns — a linear read puts a village of six thousand at half a
  // metropolis and the continent comes out as one even wash. The square-ish
  // curve puts it at a quarter, so what you see from orbit is bright cities in a
  // dust of small ones, which is what the real photograph shows.
  return 0.12 + 0.88 * t ** 1.6;
}

/**
 * How much of a city's light is gone by the small hours.
 *
 * The windows go out one at a time on their own seeds; a city seen from the
 * ceiling is one dot and cannot, so it dims instead. Not to nothing — the
 * street lighting, the roads and the industry that never stop are most of what
 * a real city shows from space at four in the morning, and a continent that
 * switches off is a continent that looks broken.
 */
const LATE_DIM = 0.4;

const pointVertex = /* glsl */ `
  uniform vec3 atlasSun;
  uniform float atlasSubsolar;
  uniform float screenScale;
  uniform float minSize;
  uniform float maxSize;
  uniform float atlasGain;

  attribute float span;
  attribute float bright;

  varying float vAlpha;

  #include <common>
  #include <fog_pars_vertex>
  ${NIGHT_CHUNK}

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = max(-mvPosition.z, 1.0);
    // The place's own local up, so the terminator is drawn where it actually
    // falls and not where the player happens to be standing.
    vec3 up = normalize(position);
    float night = atlasNight(up, atlasSun);
    // Same clock the windows go to bed on, run once for the whole city.
    float late = 1.0 - ${LATE_DIM.toFixed(2)} * smoothstep(23.0, 27.5, atlasSolarHour(up, atlasSubsolar));
    // Handed over from the town mesh rather than shown on top of it.
    float far = smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, dist);
    vAlpha = bright * night * late * far * atlasGain * ${POINT_GAIN.toFixed(2)};

    // projectionMatrix[1][1] is 1/tan(fov/2), so this is the same
    // 937 * size / distance arithmetic the rest of the project prices things
    // with, taken off the live camera instead of off a remembered viewport.
    float pixels = span * projectionMatrix[1][1] * screenScale / dist;
    gl_PointSize = clamp(pixels, minSize, maxSize);

    #include <fog_vertex>
  }
`;

const pointFragment = /* glsl */ `
  uniform vec3 atlasLight;

  varying float vAlpha;

  #include <common>
  #include <fog_pars_fragment>

  void main() {
    if (vAlpha < 0.004) discard;
    // A square point reads as a pixel artefact and a hard disc reads as a
    // sticker. A soft falloff is the one shape that reads as light, and it is
    // the same reason the sky's stars are drawn with a smoothstep rather than a
    // threshold.
    float core = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
    float value = core * vAlpha;
    // Additive blending in three is src * srcAlpha + dst, so the colour is left
    // unpremultiplied and the alpha carries the whole falloff. Premultiplying it
    // here as well would square the falloff and turn every light into a pinprick
    // — and pushing the colour over 1 instead would clip all three channels
    // together and turn every light white. See POINT_LIGHT.
    gl_FragColor = vec4(atlasLight, value);

    #ifdef USE_FOG
      // Additive light is *attenuated* by haze, never mixed towards its colour:
      // the stock fog_fragment chunk blends towards fogColor, which on an
      // additive pass would add fog to the frame instead of taking light out
      // of it - a mauve wash over the night side that gets brighter the
      // further away the city is. (GLSL source is ASCII; see outline.ts.)
      gl_FragColor *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface CityLights {
  points: THREE.Points;
  stats: {
    /** How many places carry a light. All of them, and it is one draw call. */
    places: number;
    /** Kilobytes of buffers. */
    kilobytes: number;
    /** Milliseconds the field took to build, once, at load. */
    buildMs: number;
  };
  /** Call once a frame, after `setSunDirection`. */
  update(renderer: THREE.WebGLRenderer): void;
}

/**
 * Every populated place on the planet as one buffer of points.
 *
 * **It is drawn from the data and not from the scene, which is the whole reason
 * it exists.** `settlements.ts` builds the towns the camera can see under a
 * triangle budget and a pixel floor, and from the plane's ceiling at 23,078
 * units it holds 23 of them at the shipped detail of 0.5 and 357 at detail 3 —
 * so the towns are up there, and they are no use: a median 25-unit town
 * subtends `937 * 50 / 23,000`, **two pixels**, and the frustum only reaches a
 * 66-degree cap, about a third of the surface. A lighting scheme built on the
 * settlement mesh therefore has nothing legible to light at exactly the altitude
 * the night hemisphere is worth looking at from, and can only ever light a third
 * of it. This is one draw call at every altitude, it covers the whole planet, it
 * does not move with `atlas.detail`, and turning the knob down takes towns off
 * the ground without taking cities off the map.
 *
 * The anchors come from `settlements.ts` rather than being asked for again:
 * `groundRadius` is a point-in-polygon per place and the streamer has already
 * paid for every one of them. Sharing the array is also the only way the two can
 * be guaranteed to agree about where a town is.
 *
 * **It keeps every place, including the two thirds `isShown` does not build,
 * and that is a decision rather than an oversight.** The rule for the thinning
 * (`PROMINENCE_RADIUS` in `places.ts`) is that nothing may glow where nothing
 * is built *when seen from the ground*, and this field satisfies it by
 * construction: `FADE_NEAR` is 1,500 units, past the on-foot fog, so from the
 * ground a hidden village's light is not drawn at all. From altitude the field
 * is population and not buildings — it already lights every town the streamer
 * does not build, which at 3,000 units up is most of them — and a hidden place
 * is that same case, not a new one. Thinning it to the 9,734 built places would
 * take the dust of small towns out of the picture that the curve above exists
 * to keep, and would make the night side of Germany 61 dots.
 */
export function createCityLights(
  places: readonly Place[],
  anchors: Float32Array,
): CityLights {
  const began = performance.now();

  const count = places.length;
  const position = new Float32Array(count * 3);
  const span = new Float32Array(count);
  const bright = new Float32Array(count);

  const point = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const place = places[i]!;
    point.set(anchors[i * 3]!, anchors[i * 3 + 1]!, anchors[i * 3 + 2]!);
    // The anchor is on the ground; a light hangs a little over the roofs.
    const length = point.length() || PLANET_RADIUS;
    point.multiplyScalar((length + LIGHT_LIFT) / length);
    position[i * 3] = point.x;
    position[i * 3 + 1] = point.y;
    position[i * 3 + 2] = point.z;
    // Smaller than the built town on purpose: a settlement's radius is where its
    // last house stands, and what is *lit* is a fraction of the ground inside
    // it. `radiusOf` is a radius, so this is 1.8 times it as a diameter.
    span[i] = radiusOf(place) * 0.9;

    bright[i] = brightnessOf(place.pop);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('span', new THREE.BufferAttribute(span, 1));
  geometry.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
  // The field covers the whole planet, so a bounding sphere on the origin is
  // both correct and the only one that will not cull half of it at the limb.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), PLANET_RADIUS * 1.1);

  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']!),
    atlasSun,
    atlasSubsolar,
    atlasLight: { value: POINT_LIGHT.clone() },
    atlasGain,
    screenScale: { value: 450 },
    minSize: { value: MIN_PIXELS },
    maxSize: { value: MAX_PIXELS },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    // Light adds. It also means a cluster of towns — the Randstad, the Ruhr,
    // the Kanto plain — saturates into one bright patch on its own, which is
    // what a city region looks like from space and is not something this file
    // has to know about.
    blending: THREE.AdditiveBlending,
    transparent: true,
    // The planet is opaque and these sit on it, so the depth buffer is what
    // stops the far hemisphere's cities shining through the Earth. Writing
    // depth as well would have every dot punch a hole in whatever is drawn
    // after it.
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  // `OutlineEffect` only inks meshes, so nothing here would be hulled anyway —
  // this says so out loud, the way the sky dome does.
  material.userData.outlineParameters = { visible: false };

  const points = new THREE.Points(geometry, material);
  points.name = 'city-lights';
  // Drawn after the land, before nothing: it is additive and writes no depth,
  // so it only ever has to come after the opaque world.
  points.renderOrder = 2;
  points.frustumCulled = false;

  const size = new THREE.Vector2();
  const stats = {
    places: count,
    kilobytes: Number((((count * 5 * 4) / 1024)).toFixed(1)),
    buildMs: Number((performance.now() - began).toFixed(2)),
  };

  return {
    points,
    stats,
    update(renderer) {
      renderer.getDrawingBufferSize(size);
      // `gl_PointSize` is in framebuffer pixels, so the pixel floors move with
      // the device pixel ratio and the scale is taken off the drawing buffer
      // rather than off `innerHeight`. Getting this wrong is a field of lights
      // that is twice as coarse on a retina screen as on a laptop.
      const ratio = renderer.getPixelRatio();
      uniforms.screenScale.value = size.y * 0.5;
      uniforms.minSize.value = MIN_PIXELS * ratio;
      uniforms.maxSize.value = MAX_PIXELS * ratio;
    },
  };
}
