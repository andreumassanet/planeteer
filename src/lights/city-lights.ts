/** Every populated place as one buffer of additive points, seen from the air. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { NIGHT_CHUNK, POINT_GAIN, POINT_LIGHT, atlasGain, atlasSubsolar, atlasSun } from './night.ts';

/**
 * How far above the ground a city's own light hangs, in world units: enough to
 * clear the tallest thing the kit builds (a tower block is 29) so a light is
 * never drawn inside its own town, and a fraction of a pixel out of place from
 * anywhere it is visible.
 */
const LIGHT_LIFT = 32;

/**
 * Where the point field takes over from the town mesh, in world units of
 * distance from the camera. The two overlap without coinciding: in a town its
 * own windows and lamps are what you see and a soft disc pasted over them would
 * be a lens flare; from the plane's ceiling the towns do not exist and the discs
 * are the whole picture. The near end is the on-foot fog at detail 1 (about
 * 1,430 units), so on the ground the field is behind the haze whatever the knob
 * says, and it is fully in by four thousand, where a median town is a smudge.
 */
const FADE_NEAR = 1500;
const FADE_FAR = 4000;

/**
 * The smallest and largest a city's light may be drawn, in CSS pixels. The floor
 * makes this a map of civilisation rather than of the six biggest cities: from
 * the ceiling a 25-unit town subtends about 2 pixels, so without a floor the
 * night hemisphere is empty except over Tokyo. The ceiling is small on purpose:
 * at 11 px a median town seen from 6,000 units is already at the cap and a
 * continent reads as evenly sized dots on a chart. 4.5 px is about a fifth of
 * the town's own diameter, roughly the share of a town that is lit.
 */
const MIN_PIXELS = 1.6;
const MAX_PIXELS = 4.5;

/**
 * How bright a place is, from its population: the logarithm `urbanityOf` uses
 * in `settlements.ts`, because a linear read makes every place either Chongqing
 * or nothing. The floor is 0.3 rather than 0: a village at night is a few
 * lights, and the point field is the only thing that says a village is there
 * from the air.
 */
function brightnessOf(pop: number): number {
  const t = Math.min(1, Math.max(0, (Math.log10(Math.max(1, pop)) - 2.6) / 3.8));
  // Curved rather than linear: the bake is GeoNames `cities5000`, overwhelmingly
  // small towns, so a linear read puts a village of six thousand at half a
  // metropolis and a continent comes out as one even wash. The square-ish curve
  // puts it at a quarter: bright cities in a dust of small ones.
  return 0.12 + 0.88 * t ** 1.6;
}

/**
 * How much of a city's light is gone by the small hours. The windows go out one
 * at a time on their own seeds; a city seen from the ceiling is one dot and
 * cannot, so it dims instead, not to nothing (street lighting, roads and
 * industry never stop).
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
 * It is drawn from the data and not from the scene. `settlements.ts` builds
 * the towns the camera can see under a triangle budget and a pixel floor, and
 * from the plane's ceiling that is a few dozen towns of two pixels each in
 * about a third of the surface, so a lighting scheme built on the settlement
 * mesh has nothing legible to light exactly where the night hemisphere is worth
 * looking at. This is one draw call at every altitude, covers the whole planet
 * and does not move with `atlas.detail`.
 *
 * The anchors come from `settlements.ts` rather than being asked for again
 * (`groundRadius` is a point-in-polygon per place), which also guarantees the
 * two agree about where a town is.
 *
 * It keeps every place, including the ones `isShown` does not build.
 * `PROMINENCE_RADIUS` (`places.ts`) says nothing may glow where nothing is
 * built when seen from the ground, and this field satisfies that: `FADE_NEAR`
 * is past the on-foot fog, so from the ground a hidden village's light is not
 * drawn. From altitude the field is population and not buildings, and thinning
 * it to the built places would take out the dust of small towns the curve above
 * exists to keep.
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
    // last house stands, and what is lit is a fraction of the ground inside it.
    // `radiusOf` is a radius, so this is 1.8 times it as a diameter.
    span[i] = radiusOf(place) * 0.9;

    bright[i] = brightnessOf(place.pop);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('span', new THREE.BufferAttribute(span, 1));
  geometry.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
  // The field covers the whole planet, so a bounding sphere on the origin is
  // correct and the only one that will not cull half of it at the limb.
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
    // Light adds, so a cluster of towns saturates into one bright patch on its
    // own, as a city region does from space.
    blending: THREE.AdditiveBlending,
    transparent: true,
    // The planet is opaque and these sit on it, so the depth buffer stops the far
    // hemisphere's cities shining through the Earth. Writing depth too would have
    // every dot punch a hole in whatever is drawn after it.
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  // `OutlineEffect` only inks meshes, so nothing here would be hulled anyway;
  // this says so out loud, as the sky dome does.
  material.userData.outlineParameters = { visible: false };

  const points = new THREE.Points(geometry, material);
  points.name = 'city-lights';
  // Additive and no depth write, so it only has to come after the opaque world.
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
      // `gl_PointSize` is in framebuffer pixels, so the pixel floors move with the
      // device pixel ratio and the scale is taken off the drawing buffer rather than
      // `innerHeight`; otherwise the field is twice as coarse on a retina screen.
      const ratio = renderer.getPixelRatio();
      uniforms.screenScale.value = size.y * 0.5;
      uniforms.minSize.value = MIN_PIXELS * ratio;
      uniforms.maxSize.value = MAX_PIXELS * ratio;
    },
  };
}
