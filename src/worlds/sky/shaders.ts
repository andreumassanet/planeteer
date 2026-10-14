/** The sky's drawn parts: the dome's shader, the lit discs of moons, and the sun's halo. */

import * as THREE from 'three';
import { linearOf } from '../terrain.ts';

export const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

export const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uUp;
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSpace;
uniform vec3 uGlow;
uniform float uDay;
uniform float uAir;
uniform float uOvercast;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = dot(d, uUp);
  float h = smoothstep(-0.05, 0.55, e);
  vec3 sky = mix(uHorizon, uZenith, h);
  float s = max(dot(d, uSun), 0.0);
  float open = 1.0 - uOvercast;
  // The glow round the sun is the air's: none on an airless world, and none
  // under a deck that hides the sun.
  sky += uGlow * (pow(s, 24.0) * 0.6 + pow(s, 4.0) * 0.12) * uAir * open;
  // Dusk reddens the horizon a little toward the sun.
  float dusk = (1.0 - abs(uDay - 0.5) * 2.0) * uAir * open;
  sky = mix(sky, uGlow * 0.9, dusk * pow(s, 3.0) * (1.0 - h) * 0.6);
  // An overcast is brightest low down, where the eye looks through the most
  // lit cloud.
  sky *= 1.0 + uOvercast * 0.3 * (1.0 - h);
  vec3 colour = mix(uSpace, sky, clamp(uDay * uAir * 1.4, 0.0, 1.0));
  // Under the horizon the ground hides it; what shows at a cliff's foot is haze.
  colour = mix(colour, uHorizon * mix(0.2, 0.7, uDay), smoothstep(0.0, -0.2, e) * uAir);
  gl_FragColor = vec4(colour, 1.0);
}`;

const DISC_VERTEX = /* glsl */ `
varying vec2 vAt;
void main() {
  vAt = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * A lit ball, drawn as a disc facing the eye: the sphere's normal under each
 * point is `(x, y, sqrt(1 - r^2))` in the disc's own frame (+z toward the
 * eye), and `uSun` is the Sun's direction in that frame. Two bands and a soft
 * terminator, the cel look; the night side is drawn dark where the sky
 * behind it is dark (it hides the stars, as a moon does) and left out where
 * the day sky would show through it.
 */
const DISC_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSun;
uniform float uOpacity;
uniform float uDark;
varying vec2 vAt;
void main() {
  float r2 = dot(vAt, vAt);
  if (r2 > 1.0) discard;
  vec3 n = vec3(vAt, sqrt(1.0 - r2));
  float lit = dot(n, uSun);
  float light = smoothstep(-0.03, 0.05, lit);
  float band = mix(0.72, 1.0, step(0.35, lit));
  vec3 colour = uColor * light * band * (0.86 + 0.14 * n.z);
  float alpha = uOpacity * max(light, uDark) * smoothstep(1.0, 0.96, r2);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(colour, alpha);
}`;

export interface Disc {
  mesh: THREE.Mesh;
  uniforms: { uColor: { value: THREE.Color }; uSun: { value: THREE.Vector3 }; uOpacity: { value: number }; uDark: { value: number } };
}

export function litDisc(color: number, gain: number): Disc {
  const uniforms = {
    uColor: { value: new THREE.Color().fromArray(linearOf(color)).multiplyScalar(gain) },
    uSun: { value: new THREE.Vector3(0, 0, 1) },
    uOpacity: { value: 1 },
    uDark: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), material);
  // After the stars and the planets, with the sun; before the layers, so a
  // ring in front of a moon hides it.
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/** A soft round glow, as a sprite whose texture is drawn once. */
export function haloSprite(): THREE.Sprite {
  const size = 64;
  let texture: THREE.Texture;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,240,215,0.9)');
    gradient.addColorStop(0.25, 'rgba(255,225,180,0.35)');
    gradient.addColorStop(1, 'rgba(255,210,160,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    texture = new THREE.CanvasTexture(canvas);
  } else {
    texture = new THREE.Texture();
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  );
  sprite.renderOrder = -8;
  sprite.frustumCulled = false;
  return sprite;
}
