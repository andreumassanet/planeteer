/**
 * The ground's material: vertex colours with the nations' colour laid over
 * them by one uniform, and on a cloud deck a churning wave of light and shade
 * along each vertex's own phase.
 */

import * as THREE from 'three';
import type { Terrain } from '../terrain.ts';

export interface GroundUniforms {
  uTime: { value: number };
  uPolitical: { value: number };
  uBoil: { value: number };
  uWaves: { value: number };
  uDrift: { value: number };
  uDriftStrength: { value: number };
}

export function createGroundMaterial(terrain: Terrain, gradientMap: THREE.Texture): { material: THREE.MeshToonMaterial; uniforms: GroundUniforms } {
  const R = terrain.radius;
  const deck = terrain.spec.ground === 'cloud-deck';
  // The deck's motion, from the palette: the boil's rate, and the drift as a
  // whole number of waves round a parallel (so the wave train closes on
  // itself at the antimeridian) travelling at the deck's wind speed.
  const churn = terrain.spec.palette.churn;
  const waves = Math.max(1, Math.round((2 * Math.PI * R) / Math.max(1, churn.wavelength)));
  const uniforms: GroundUniforms = {
    uTime: { value: 0 },
    uPolitical: { value: 0 },
    uBoil: { value: churn.boil },
    uWaves: { value: waves },
    // Radians of the wave's phase a second: a crest moves `speed` units a
    // second along the equator.
    uDrift: { value: (churn.speed * waves) / R },
    uDriftStrength: { value: churn.strength },
  };
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.name = deck ? 'world:deck' : 'world:ground';
  // A deck has no edge to ink: the pen's hull round each tile, on a surface
  // this flat, is the tile's square drawn on the clouds.
  if (deck) material.userData.outlineParameters = { visible: false };
  // The crust is faceted, as Earth's land is, and the facets are the shader's:
  // `FLAT_SHADED` takes each fragment's normal from the screen-space
  // derivatives of its own position, so the grid stays indexed and needs no
  // normals uploaded at all. `MeshToonMaterial` has no `flatShading` switch of
  // its own; the chunk it would set is this define.
  if (!deck) material.defines = { ...material.defines, FLAT_SHADED: '' };
  // The political map: each vertex carries its nation's colour (`aNation`,
  // linear) and one uniform lays it over the ground's own, after the ground's
  // colour and before the light, so the hills still read through it.
  const nationVertex = ['#include <common>', 'attribute vec3 aNation;', 'varying vec3 vNation;'];
  const nationFragment = ['#include <common>', 'uniform float uPolitical;', 'varying vec3 vNation;'];
  const political = '  diffuseColor.rgb = mix(diffuseColor.rgb, vNation, uPolitical);';
  // The deck churns: a slow wave of light and shade along each vertex's own
  // phase, which is a function of where it is and so continuous from tile to
  // tile, and a wave train drifting along the parallels. The geometry never
  // moves; only the paint does. The longitude is taken per fragment from the
  // world position (the planet is at the origin), because one interpolated
  // across a triangle that straddles the antimeridian would run the whole way
  // round inside it.
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (!deck) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', nationVertex.join('\n'))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNation = aNation;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', nationFragment.join('\n'))
        .replace('#include <color_fragment>', `#include <color_fragment>\n${political}`);
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${nationVertex.join('\n')}\nattribute float aPhase;\nvarying float vPhase;\nvarying vec3 vDeck;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNation = aNation;\nvPhase = aPhase;\nvDeck = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `${nationFragment.join('\n')}\nuniform float uTime;\nuniform float uBoil;\nuniform float uWaves;\nuniform float uDrift;\nuniform float uDriftStrength;\nvarying float vPhase;\nvarying vec3 vDeck;`,
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          political,
          '  float boil = 0.94 + 0.09 * sin(vPhase * 18.0 + uTime * uBoil) + 0.04 * sin(vPhase * 41.0 - uTime * uBoil * 1.7);',
          '  vec3 deckDir = normalize(vDeck);',
          '  float deckLon = atan(-deckDir.z, deckDir.x);',
          '  float drift = sin(deckLon * uWaves + vPhase * 9.0 - uTime * uDrift) + 0.5 * sin(deckLon * uWaves * 2.0 - vPhase * 13.0 - uTime * uDrift * 2.0);',
          '  diffuseColor.rgb *= boil * (1.0 + uDriftStrength * drift * 0.67);',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => (deck ? 'world:deck' : 'world:ground');
  return { material, uniforms };
}
