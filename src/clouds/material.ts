/** The clouds' material: the toon ramp, patched to squash, flatten, haze, tint and rim-light the deck. */
import * as THREE from 'three';
import { createToonRamp } from '../theme.ts';
import { sunUniform } from '../sun.ts';
import { BACK_POWER, BELLY_DEEP, BELLY_TINT, CROWN_TINT, EDGE_NEAR, GREY_DEPTH, HEAP_BLEND, HEAP_DROP, NIGHT_FLOOR, RIM_BACK, RIM_POWER, RIM_SIDE, SCATTER, SELF_LIGHT, SQUASH_GLSL } from './field.ts';

/** `vec3(...)` literal for a tint. */
const vec = (c: readonly number[]): string => `vec3(${c.map((v) => v.toFixed(3)).join(', ')})`;

type Shader = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

/** The squash, the heap-shaped normal and the deck-frame position. */
function patchVertex(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      'void main() {',
      SQUASH_GLSL +
        '\nattribute float deep;\nattribute vec3 puff;\nvarying float vDeep;\nvarying float vHaze;\nvarying float vPuffY;\nvarying float vLift;\nvarying vec3 vRadial;\nvarying vec3 vUp;\n' +
        'void main() {\n  vDeep = deep;\n  vPuffY = position.y;\n  vLift = puff.z;',
    )
    // See `HEAP_DROP`: the upper half of the puff's normal bent toward a dome
    // under it and the bank's slope, in the puff's own frame, before the
    // instance matrix takes it into the deck's.
    .replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\n' +
        '\t{\n' +
        `\t\tvec3 atlasHeap = normalize( position + vec3( 0.0, ${HEAP_DROP.toFixed(2)}, 0.0 ) );\n` +
        '\t\tvec3 atlasMass = normalize( vec3( puff.x, 1.0, puff.y ) );\n' +
        `\t\tobjectNormal = normalize( mix( objectNormal, normalize( atlasHeap + atlasMass ), smoothstep( -0.2, 0.55, objectNormal.y ) * ${HEAP_BLEND.toFixed(2)} ) );\n` +
        '\t}',
    )
    // The instance matrix first and the squash after it, because the squash
    // is radial about the planet and a puff's own frame is not.
    .replace(
      '#include <project_vertex>',
      'vec4 atlasDeck = vec4( transformed, 1.0 );\n' +
        '#ifdef USE_INSTANCING\n\tatlasDeck = instanceMatrix * atlasDeck;\n#endif\n' +
        'atlasDeck.xyz = atlasVertex( atlasDeck.xyz );\n' +
        'vec4 mvPosition = modelViewMatrix * atlasDeck;\n' +
        'gl_Position = projectionMatrix * mvPosition;\n' +
        // The chunks sit at the group's origin, the planet's centre, so the
        // deck-frame position normalised is the local up.
        'vHaze = -mvPosition.z;\n' +
        'vRadial = normalize( normalMatrix * normalize( atlasDeck.xyz ) );\n' +
        'vUp = normalize( ( modelMatrix * atlasDeck ).xyz );',
    );
}

/** Flattening, the crown and belly tints, the rim light, the night floor, the grey of a storm and the haze. */
function patchFragment(shader: Shader): void {
  shader.fragmentShader = shader.fragmentShader
    .replace(
      'void main() {',
      'uniform vec3 hazeColor;\nuniform float hazeNear;\nuniform float hazeFar;\nuniform float flatten;\nuniform float orbitDim;\nuniform float cloudGrey;\nuniform float edgeSoft;\nuniform vec3 atlasSun;\n' +
        'varying float vDeep;\nvarying float vHaze;\nvarying float vPuffY;\nvarying float vLift;\nvarying vec3 vRadial;\nvarying vec3 vUp;\nvoid main() {',
    )
    // See `flattenAt`. The sign keeps a belly a belly: blending every normal
    // to +up would light the underside of the deck as though it faced the sky.
    // The shape's own normal is kept for the soft edge, which is geometry.
    .replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tvec3 atlasShape = normal;\n\tvec3 atlasUp = normalize(vRadial) * (dot(normal, normalize(vRadial)) < 0.0 ? -1.0 : 1.0);\n\tnormal = normalize(mix(normal, atlasUp, flatten));',
    )
    .replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\n' +
        '\t{\n' +
        '\t\tvec3 cloudView = normalize( vViewPosition );\n' +
        '\t\tfloat cloudFacing = abs( dot( normalize( atlasShape ), cloudView ) );\n' +
        // See `CROWN_TINT`: by facing, by height in the puff and by tier.
        '\t\tfloat cloudCrown = smoothstep( -0.45, 0.8, 0.6 * dot( normal, normalize( vRadial ) ) + 0.4 * vPuffY + 0.35 * vLift );\n' +
        `\t\tvec3 cloudBelly = ${vec(BELLY_TINT)} * ( 1.0 - ${BELLY_DEEP.toFixed(2)} * vDeep * ( 1.0 - vLift ) );\n` +
        `\t\tgl_FragColor.rgb *= mix( cloudBelly, ${vec(CROWN_TINT)}, cloudCrown );\n` +
        '\t\tvec3 cloudSky = vec3( 0.55, 0.68, 0.85 );\n' +
        '\t\t#if NUM_HEMI_LIGHTS > 0\n\t\t\tcloudSky = hemisphereLights[ 0 ].skyColor;\n\t\t#endif\n' +
        `\t\tgl_FragColor.rgb += diffuseColor.rgb * cloudSky * ${SELF_LIGHT.toFixed(2)} * mix( 0.6, 1.0, cloudCrown );\n` +
        // The sun is the first directional light: it casts the shadow and
        // three puts shadow casters first.
        '\t\t#if NUM_DIR_LIGHTS > 0\n' +
        '\t\t\tvec3 cloudToSun = directionalLights[ 0 ].direction;\n' +
        '\t\t\tvec3 cloudSun = directionalLights[ 0 ].color;\n' +
        `\t\t\tfloat cloudRim = pow( 1.0 - cloudFacing, ${RIM_POWER.toFixed(1)} );\n` +
        `\t\t\tfloat cloudBack = pow( max( dot( -cloudView, cloudToSun ), 0.0 ), ${BACK_POWER.toFixed(1)} );\n` +
        '\t\t\tfloat cloudThin = 1.0 - 0.6 * vDeep;\n' +
        `\t\t\tgl_FragColor.rgb += cloudSun * ( cloudRim * ( ${RIM_SIDE.toFixed(2)} * max( dot( normal, cloudToSun ), 0.0 ) + ${RIM_BACK.toFixed(2)} * cloudBack * cloudThin ) + ${SCATTER.toFixed(2)} * cloudBack * cloudThin * ( 1.0 - 0.5 * cloudFacing ) );\n` +
        '\t\t#endif\n' +
        '\t\tgl_FragColor.a *= smoothstep( 0.02, edgeSoft, cloudFacing );\n' +
        '\t}\n' +
        // See `NIGHT_FLOOR`: after the light and before the haze, so what is
        // dimmed is the cloud and not the air in front of it.
        '\tfloat atlasNightSide = 1.0 - smoothstep(-0.104528, 0.034899, dot(vUp, atlasSun));\n\tgl_FragColor.rgb *= mix(1.0, ' +
        NIGHT_FLOOR.toFixed(3) +
        ', atlasNightSide * orbitDim);' +
        // See `setGrey`: the deep middle of a bank goes the grey of a rain
        // cloud, and its rim stays white, so a storm is a dark heart in a
        // pale bank rather than a grey sky.
        `\n\tgl_FragColor.rgb *= 1.0 - cloudGrey * ${GREY_DEPTH.toFixed(2)} * smoothstep(0.2, 0.85, vDeep);`,
    )
    // Before tone mapping, so the blend happens in the same linear space the
    // light was accumulated in.
    .replace(
      '#include <tonemapping_fragment>',
      'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, smoothstep(hazeNear, hazeFar, vHaze));\n\t#include <tonemapping_fragment>',
    );
}

/** The uniforms the material shares with the update loop. */
export interface CloudUniforms {
  haze: { color: { value: THREE.Color }; near: { value: number }; far: { value: number } };
  flatten: { value: number };
  orbitDim: { value: number };
  squash: { value: number };
  grey: { value: number };
  edgeSoft: { value: number };
}

export function createCloudMaterial(): { material: THREE.MeshToonMaterial; uniforms: CloudUniforms } {
  const ramp = createToonRamp(4);
  const haze = { color: { value: new THREE.Color(0xc6b6cf) }, near: { value: 1200 }, far: { value: 6000 } };
  const flatten = { value: 0 };
  const orbitDim = { value: 0 };
  const squash = { value: 0 };
  const grey = { value: 0 };
  const edgeSoft = { value: EDGE_NEAR };
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: ramp,
    // The inside is a surface too: flying into a puff is the white-out it
    // should be, not the puff vanishing at the near plane.
    side: THREE.DoubleSide,
    // The soft edge, as coverage: see `EDGE_NEAR`.
    alphaToCoverage: true,
    // And the scene's fog is off, which is the one thing here that looks like
    // ignoring the world and is the opposite. See `hazeAt`.
    fog: false,
  });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = haze.color;
    shader.uniforms.hazeNear = haze.near;
    shader.uniforms.hazeFar = haze.far;
    shader.uniforms.flatten = flatten;
    shader.uniforms.orbitDim = orbitDim;
    shader.uniforms.atlasSun = sunUniform;
    shader.uniforms.squash = squash;
    shader.uniforms.cloudGrey = grey;
    shader.uniforms.edgeSoft = edgeSoft;
    patchVertex(shader);
    patchFragment(shader);
  };
  return { material, uniforms: { haze, flatten, orbitDim, squash, grey, edgeSoft } };
}
