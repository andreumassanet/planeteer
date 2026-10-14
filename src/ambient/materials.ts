/** Materials and palettes for the small life. */
import { LUSH_GLSL } from '../globe.ts';
import { PALETTE, createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import * as THREE from 'three';


export function lightMaterial(): THREE.ShaderMaterial {
  const firefly = new THREE.Color(PALETTE.olive).lerp(new THREE.Color(PALETTE.white), 0.45);
  const mote = new THREE.Color(PALETTE.cream);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']!),
      fireflyColor: { value: firefly },
      moteColor: { value: mote },
      screenScale: { value: 450 },
    },
    vertexShader: /* glsl */ `
      attribute float glow;
      attribute float spot;
      attribute float kind;
      uniform float screenScale;
      varying float vGlow;
      varying float vKind;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(-mvPosition.z, 0.5);
        vGlow = glow;
        vKind = kind;
        gl_PointSize = clamp(spot * projectionMatrix[1][1] * screenScale / dist, 1.5, 28.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fireflyColor;
      uniform vec3 moteColor;
      varying float vGlow;
      varying float vKind;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        if (vGlow < 0.004) discard;
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float halo = 1.0 - smoothstep(0.0, 1.0, r);
        float core = 1.0 - smoothstep(0.18, 0.32, r);
        vec3 colour = mix(fireflyColor, moteColor, vKind);
        float alpha = mix(halo * halo * 0.6 + core * 0.8, core * 0.9 + halo * 0.15, vKind) * vGlow;
        gl_FragColor = vec4(colour, alpha);
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
  return material;
}

/**
 * The land's green (`atlasLush`) over the vertex colour, as the leaf cards
 * take it (`foliage.ts`): a leaf off a crown is the green the crown is drawn
 * in. Nothing here but a leaf is green enough for it to touch.
 */
export function lush(material: THREE.MeshToonMaterial, key: string): THREE.MeshToonMaterial {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LUSH_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = atlasLush(diffuseColor.rgb);');
  };
  material.customProgramCacheKey = () => key;
  material.userData.outlineParameters = { visible: false };
  return shadeByClouds(material);
}

/**
 * Pulled forward in depth a little, for the leaves lying `LIE_LIFT` over the
 * ground: a flat quad that close is a z-fight at range without it.
 */
export function bodyMaterial(): THREE.MeshToonMaterial {
  return lush(new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  }), 'atlas-ambient-bodies');
}

/** The litter: flat on the ground, facing up, and forward in depth as the airstrips are (`craft/airstrip.ts`). */
export function litterMaterial(): THREE.MeshToonMaterial {
  return lush(new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  }), 'atlas-ambient-litter');
}

/* --- the colours ---------------------------------------------------------- */

export const WINGS: readonly number[] = [PALETTE.gold, PALETTE.white, PALETTE.orange, PALETTE.skyBlue, PALETTE.apricot, PALETTE.violet];
export const LEAVES: readonly number[] = [PALETTE.orange, PALETTE.gold, PALETTE.clay, PALETTE.red, PALETTE.apricot];
/** What a leaf that has lain a while turns toward, out of the autumn. */
export const DRIED: readonly number[] = [PALETTE.clay, PALETTE.brown, PALETTE.tan, PALETTE.gold];
const colourCache = new Map<number, THREE.Color>();
export function colourOf(hex: number): THREE.Color {
  let colour = colourCache.get(hex);
  if (colour === undefined) colourCache.set(hex, (colour = new THREE.Color(hex)));
  return colour;
}

/* --- the module ----------------------------------------------------------- */
