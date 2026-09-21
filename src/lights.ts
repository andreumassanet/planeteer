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

export function lightBrightness(value?: number): number {
  if (value !== undefined) atlasGain.value = Math.max(0, value);
  return atlasGain.value;
}

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
        varying vec2 vAtlasLit;
        varying vec3 vAtlasUp;
        ${NIGHT_CHUNK}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // x is how bright this window is, y is the hour it goes out. Half an
        // hour of ramp either side of the hour, because a room does not switch.
        float atlasBed = ${BED_BASE.toFixed(1)} + vAtlasLit.y * ${(255 / BED_SPAN).toFixed(6)};
        float atlasAwake = 1.0 - smoothstep(atlasBed - 0.5, atlasBed + 0.5,
          atlasSolarHour(vAtlasUp, atlasSubsolar));
        totalEmissiveRadiance += atlasLight * (${WINDOW_GAIN.toFixed(2)} * vAtlasLit.x * atlasAwake
          * atlasGain * atlasNight(vAtlasUp, atlasSun));`,
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
