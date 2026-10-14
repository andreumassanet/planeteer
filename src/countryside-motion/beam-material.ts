/** The lighthouse beam's material: the shaft as light in the air, integrated in closed form along each ray. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';

/**
 * The shaft as light in the air rather than a cone of colour.
 *
 * Each fragment of the cone asks what the ray from the eye through it passes
 * through inside: the light is a gaussian across the beam, so along any ray
 * its integral is closed-form — `exp(-k b^2 / R^2) * R * sqrt(pi / k) / |rp|`,
 * `b` the ray's nearest approach to the axis, `R` the radius where it passes,
 * `rp` the ray's part square to the axis. That one expression is the whole
 * look: seen from the side the band is brightest down its middle and fades
 * to nothing at its edges (so the polygon is never seen), and seen down its
 * length `|rp|` shrinks and it becomes a glow. Energy spreads as the cone
 * widens, so it is brightest and narrowest at the lamp and fades out before
 * its end, and slow dust drifts through it, fixed to the world, so the beam
 * sweeps through the dust rather than carrying it.
 *
 * One surface a pixel: the front faces from outside the cone, the back faces
 * from inside it (`beamShape.w`, decided on the CPU), so the sum is never
 * counted twice. Additive, depth-tested so the land hides it, writing no
 * depth; the haze closes it more gently than it closes the land, so a beam
 * reads as lit air a long way into it.
 *
 * `beamAxis.w` says what a vertex belongs to: 0 a shaft, 1 the halo round the
 * lamp (`beamShape.xy` its corner, `.z` the flash), 2 the lantern's glass
 * (`beamShape.xyz` the lighthouse's up, `.w` its half height).
 */
const BEAM_VERTEX = /* glsl */ `
attribute vec4 beamApex;
attribute vec4 beamAxis;
attribute vec4 beamShape;
varying vec3 vFromApex;
varying vec3 vEyeFromApex;
varying float vStrength;
varying vec4 vAxis;
varying vec4 vShape;
#include <common>
#include <fog_pars_vertex>
void main() {
  // The mesh stands at the eye, so these are small numbers, not the planet's radius.
  vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFromApex = position - beamApex.xyz;
  vEyeFromApex = (cameraPosition - origin) - beamApex.xyz;
  vStrength = beamApex.w;
  vAxis = beamAxis;
  vShape = beamShape;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uLight;
uniform float uTime;
varying vec3 vFromApex;
varying vec3 vEyeFromApex;
varying float vStrength;
varying vec4 vAxis;
varying vec4 vShape;
#include <common>
#include <fog_pars_fragment>

float beamHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float beamNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(beamHash(i), beamHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(beamHash(i + vec3(0.0, 1.0, 0.0)), beamHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(beamHash(i + vec3(0.0, 0.0, 1.0)), beamHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(beamHash(i + vec3(0.0, 1.0, 1.0)), beamHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

void main() {
  float value = 0.0;
  if (vAxis.w < 0.5) {
    // The shaft.
    bool inside = vShape.w > 0.5;
    if (inside == gl_FrontFacing) discard;
    vec3 axis = normalize(vAxis.xyz);
    vec3 w = vFromApex;
    vec3 ray = w - vEyeFromApex;
    float reach = length(ray);
    ray /= max(reach, 1e-4);
    vec3 r = w - axis * dot(w, axis);
    vec3 rp = ray - axis * dot(ray, axis);
    float rp2 = max(dot(rp, rp), 1e-4);
    float rdot = dot(r, rp);
    // Where the ray passes nearest the axis, never behind the eye.
    float s = max(-rdot / rp2, -reach);
    vec3 nearest = w + ray * s;
    float t = clamp(dot(nearest, axis) / vShape.z, 0.0, 1.0);
    float radius = mix(vShape.x, vShape.y, t);
    float q = max(dot(r, r) - rdot * rdot / rp2, 0.0) / (radius * radius);
    float edge = clamp(1.0 - q, 0.0, 1.0);
    float across = exp(-3.0 * q) * edge * edge;
    float depth = min(inversesqrt(rp2), 4.0);
    float along = pow(vShape.x / radius, 0.45) * pow(1.0 - t, 1.3) * smoothstep(0.0, 0.03, t);
    float dust = 0.55 * beamNoise(nearest * 0.16 + vec3(0.0, uTime * 0.22, uTime * 0.09))
      + 0.45 * beamNoise(nearest * 0.47 - vec3(uTime * 0.31, 0.0, uTime * 0.17));
    value = vStrength * 1.1 * across * depth * along * (0.62 + 0.76 * dust);
    value = min(value, 3.0);
  } else if (vAxis.w < 1.5) {
    // The halo: a faint glow at rest, over the bloom's threshold only as a beam faces the eye.
    vec2 uv = vShape.xy;
    float r2 = dot(uv, uv);
    if (r2 >= 1.0) discard;
    float window = (1.0 - r2) * (1.0 - r2);
    float core = exp(-r2 * 30.0);
    float glow = exp(-r2 * 6.0) * window;
    float streak = exp(-uv.y * uv.y * 260.0) * exp(-uv.x * uv.x * 2.5) * window;
    value = vStrength * (0.9 * core + 0.18 * glow) + vShape.z * (3.2 * core + 0.7 * glow + 0.5 * streak);
  } else {
    // The glass, lit from inside, hottest where a beam leaves it.
    if (!gl_FrontFacing) discard;
    vec3 up = vShape.xyz;
    float height = dot(vFromApex, up);
    vec3 normal = normalize(vFromApex - up * height);
    vec3 view = normalize(vEyeFromApex - vFromApex);
    float facing = max(dot(normal, view), 0.0);
    float hot = pow(abs(dot(normal, normalize(vAxis.xyz))), 6.0);
    float band = 1.0 - pow(clamp(abs(height) / vShape.w, 0.0, 1.0), 6.0);
    value = vStrength * band * (0.45 + 0.35 * facing + 1.2 * hot);
  }
  // The haze, as the one fog chunk has it, closing this more gently than the land.
  gl_FragColor = vec4(1.0);
  {
    vec3 fogColor = vec3(0.0);
    #include <fog_fragment>
  }
  float haze = 1.0 - gl_FragColor.r;
  gl_FragColor = vec4(uLight * value * (1.0 - haze * haze), 1.0);
  #include <colorspace_fragment>
}
`;

/** The warm white of an old lamp, off the palette: gold most of the way to white. */
const BEAM_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.72);

export function createBeamMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'country-beams',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: BEAM_LIGHT.clone() }, uTime: { value: 0 } }]),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  // Light adds, and is not inked: a light drawn twice by the pen's second pass would clip to white.
  material.userData.outlineParameters = { visible: false };
  return material;
}
