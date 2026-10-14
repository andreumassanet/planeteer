/** The orrery's materials and textures: the planets' ramp and shader, the Sun, its glow and the rings. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { REGION_TINT } from './constants.ts';

/** The cel ramp the planets are lit through; not the world's, whose mood floor would turn a planet's far side black. Four fixed bands, the darkest at a fifth of full light, tinted cool at the dark end. */
export function planetRamp(): THREE.DataTexture {
  const bands = [0.2, 0.46, 0.76, 1];
  const shadowTint = [0.74, 0.84, 1];
  const lightTint = [1, 0.97, 0.91];
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((value, i) => {
    const t = i / (bands.length - 1);
    for (let c = 0; c < 3; c++) {
      const tint = shadowTint[c]! + (lightTint[c]! - shadowTint[c]!) * t;
      data[i * 4 + c] = Math.round(255 * value * tint);
    }
    data[i * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, bands.length, 1);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Lit by the Sun where the Sun is: the scene's sun is directional from Earth, so the planets carry a one-light toon shader with the Sun's position as a uniform. */
export function planetMaterial(sun: { value: THREE.Vector3 }, ramp: THREE.DataTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: sun,
      uRamp: { value: ramp },
      uOpacity: { value: 1 },
      // A held globe's regions (`holdUpright`): off until one is handed in.
      uTint: { value: null },
      uTinted: { value: 0 },
      uTintRadius: { value: 0 },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        vColor = color;
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform sampler2D uRamp;
      uniform float uOpacity;
      uniform sampler2D uTint;
      uniform float uTinted;
      uniform float uTintRadius;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        float lit = dot(normalize(vNormal), normalize(uSun - vWorld)) * 0.5 + 0.5;
        vec3 band = texture2D(uRamp, vec2(lit, 0.5)).rgb;
        vec3 base = vColor;
        // The region under this pixel, read off the held globe's own frame:
        // sphere.ts's lat = asin(y) and lon = atan2(-z, x). Not on Saturn's
        // rings, which share the material and lie outside the globe.
        if (uTinted > 0.5 && length(vLocal) < uTintRadius) {
          vec3 unit = normalize(vLocal);
          float lon = atan(-unit.z, unit.x);
          float lat = asin(clamp(unit.y, -1.0, 1.0));
          vec4 region = texture2D(uTint, vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5));
          base = mix(base, region.rgb, region.a * ${REGION_TINT.toFixed(2)});
        }
        gl_FragColor = vec4(base * band, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

/** The Sun: three cel bands of its own light, brightest where it faces you, stepped like the rest. Not lit by anything, because it is the light. */
export function sunMaterial(): THREE.ShaderMaterial {
  const cream = new THREE.Color(PALETTE.cream);
  const gold = new THREE.Color(PALETTE.gold);
  const orange = new THREE.Color(PALETTE.orange);
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: cream }, uBody: { value: gold }, uLimb: { value: orange }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore;
      uniform vec3 uBody;
      uniform vec3 uLimb;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        float facing = dot(normalize(vNormal), normalize(cameraPosition - vWorld));
        vec3 c = facing > 0.72 ? uCore : facing > 0.36 ? uBody : uLimb;
        gl_FragColor = vec4(c, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

/** Fades a planet or the Sun: the fill turns transparent and keeps writing depth, which hides the inside of its ink hull; the hull takes the fill's opacity on its own. */
export function fade(material: THREE.ShaderMaterial, opacity: number): void {
  (material.uniforms['uOpacity'] as THREE.IUniform<number>).value = opacity;
  material.opacity = opacity;
  material.transparent = opacity < 1;
}

/** A soft round glow for the Sun, drawn on a canvas. */
export function glowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 236, 190, 0.95)');
  gradient.addColorStop(0.22, 'rgba(248, 166, 88, 0.55)');
  gradient.addColorStop(0.5, 'rgba(228, 120, 12, 0.16)');
  gradient.addColorStop(1, 'rgba(228, 98, 2, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A ring as a camera-facing strip of constant screen width: the buffer holds the
 * circle and its tangent, and the vertex shader steps sideways, across the tangent
 * and the view, by a width that grows with the distance to the eye. It has no
 * normal, so the ink pass leaves it alone.
 */
export function ringGeometry(radius: number, segments: number): THREE.BufferGeometry {
  const position = new Float32Array((segments + 1) * 2 * 3);
  const tangent = new Float32Array((segments + 1) * 2 * 3);
  const side = new Float32Array((segments + 1) * 2);
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let k = 0; k < 2; k++) {
      const at = i * 2 + k;
      position.set([c * radius, s * radius, 0], at * 3);
      tangent.set([-s, c, 0], at * 3);
      side[at] = k === 0 ? -1 : 1;
    }
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geometry.setIndex(index);
  return geometry;
}

export interface RingUniforms {
  uColor: { value: THREE.Color };
  uAlpha: { value: number };
  uWidth: { value: number };
}

export function ringMaterial(): THREE.ShaderMaterial & { uniforms: RingUniforms } {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.cream) },
      uAlpha: { value: 0.3 },
      uWidth: { value: 0.001 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTangent;
      attribute float aSide;
      uniform float uWidth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 tangent = normalize(mat3(modelMatrix) * aTangent);
        vec3 view = world.xyz - cameraPosition;
        float range = length(view);
        vec3 across = normalize(cross(tangent, view / range));
        world.xyz += across * aSide * uWidth * range;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      void main() {
        gl_FragColor = vec4(uColor, uAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // A camera-facing strip has no front, so both sides — and in one pass,
    // which since r163 a transparent double-sided material is not by default.
    forceSinglePass: true,
  });
  material.userData.outlineParameters = { visible: false };
  return material as THREE.ShaderMaterial & { uniforms: RingUniforms };
}
