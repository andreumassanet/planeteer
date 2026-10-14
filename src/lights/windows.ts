/** Lit windows: emission inside a merged, vertex-coloured town, and the pools on the ground. */
import * as THREE from 'three';
import { BED_ALWAYS, BED_BASE, BED_FROM, BED_NEVER, BED_SPAN, BED_TO, NIGHT_CHUNK, WINDOW_GAIN, atlasGain, atlasLight, atlasSubsolar, atlasSun } from './night.ts';
import { LAMP_CHUNK, LAMP_FIELD, LAMP_LIGHT_GAIN, atlasFireCount, atlasFireTint, atlasFires, atlasHeadCount, atlasHeadDirs, atlasHeads, atlasLampCount, atlasLampTint, atlasLamps, atlasLightReach } from './near-lights.ts';

/**
 * Draws one window's bedtime and returns it as the byte the buffer carries.
 * The encoding has to be one thing: `settlements.ts` writes the byte and the
 * shader reads it.
 */
export function bedtimeByte(draw: number, never: boolean): number {
  if (never) return BED_ALWAYS;
  const hour = BED_FROM + (BED_TO - BED_FROM) * draw ** 1.6;
  return Math.max(0, Math.min(254, Math.round((hour - BED_BASE) * BED_SPAN)));
}

/** The share of windows that never go out. See `BED_NEVER`. */
export const bedtimeNever = (draw: number): boolean => draw < BED_NEVER;

/**
 * The brightest a pool may be written, as a share of a window's own byte.
 *
 * A window and the ground under it are the same emission through the same
 * uniform but must not be the same number: a window is a thin rectangle whose
 * read is that it saturates, while a pool is fifty times that area, and an area
 * driven to the same clip is not a lamp on a road but a white tile. Over a town
 * at night, with only this number changed:
 *
 * ```
 *   peak   red > 200    warm     white    brightest pixel
 *   0.42     69,909    69,641      241    (255, 255, 215)
 *   0.50     94,317    94,199      250    (255, 255, 215)
 *   1.00    166,002   148,266   40,393    (255, 255, 245)
 * ```
 *
 * 0.42 is where the core clips and the rest of the pool does not:
 * `WINDOW_GAIN * 0.42` is 1.008, so the red channel of `WINDOW_LIGHT` reaches 1
 * and the blue 0.42, an amber centre on ground whose own night value is about
 * 0.15. It is the additive rule the city lights follow: mix towards white,
 * never past it. It lives here, not in `settlements.ts`, because the peak
 * written into the buffer and the gain that reads it must be one thing.
 */
const POOL_PEAK = 0.42;

/**
 * A pool's falloff, encoded as the byte `atlasLit.x` carries. `strength` is how
 * bright the emitter is (a lamp's instance draw, a building's window dimming)
 * and `falloff` is 1 at the emitter and 0 at the edge of its reach. Squared,
 * because the vertices of a town's floor are 4 to 15 units apart and a linear
 * ramp across one is a wash: the square puts three quarters of the drop in the
 * first half of the reach, where the geometry can resolve it.
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
 * One law for every surface a pool lands on. A town's floor asks it about each
 * lamp, lit building and gate light round every vertex, and a road's ribbon
 * asks it about the light at the gate it comes in by (`gateGlow` in
 * `scenery/grid.ts`), so the two meet at the kerb on the same value.
 */
export function poolAt(strength: number, distance: number, inner: number, reach: number): number {
  if (distance >= reach) return 0;
  const span = reach - inner;
  return poolByte(strength, span <= 0 ? 1 : 1 - Math.max(0, distance - inner) / span);
}

/**
 * Teaches one `MeshToonMaterial` to emit wherever the `atlasLit` attribute says
 * so, gated by the local terminator.
 *
 * A town is one merged buffer and one draw call, so the windows are not a
 * second emissive mesh (which would cost every resident settlement another draw
 * call, doubled again by `OutlineEffect`). A per-vertex attribute costs one byte
 * a vertex and nothing at draw time. It is `Uint8` normalised, as
 * `vegetation.ts`'s normals are: a window is on, off, or one of a couple of
 * hundred dimmer values.
 *
 * It hooks `<emissivemap_fragment>`, where `MeshToonMaterial` builds
 * `totalEmissiveRadiance`, so the emission goes through the material's own
 * `outgoingLight` and therefore tone mapping, colour space conversion and the
 * fog; a lit window far off sits in the same haze as the wall around it.
 *
 * The outline pass is untouched: `outline.ts` builds its own `ShaderMaterial`
 * per source material and never reads this one's program.
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
    shader.uniforms.atlasFires = atlasFires;
    shader.uniforms.atlasFireCount = atlasFireCount;
    shader.uniforms.atlasFireTint = atlasFireTint;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec2 atlasLit;
        varying vec2 vAtlasLit;
        varying vec3 vAtlasUp;`,
      )
      // After `project_vertex` rather than before: `transformed` is final by then,
      // and the planet is centred on the origin, so the normalised world position of
      // a vertex is the local up at the window.
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
          if ((atlasLampCount > 0 || atlasHeadCount > 0 || atlasFireCount > 0) && length(vViewPosition) < atlasLightReach) {
            float atlasLamp = atlasLampLight(-vViewPosition, normal, atlasFlat);
            totalEmissiveRadiance += (diffuseColor.rgb * ${LAMP_LIGHT_GAIN.toFixed(2)} + 0.06) * atlasLampTint * atlasLamp * atlasDark;
            if (atlasFireCount > 0) {
              totalEmissiveRadiance += (diffuseColor.rgb * ${LAMP_LIGHT_GAIN.toFixed(2)} + 0.05) * atlasFireTint
                * atlasFireLight(-vViewPosition, normal) * atlasDark * 0.8;
            }
          }
        }`,
      );
  };
}
