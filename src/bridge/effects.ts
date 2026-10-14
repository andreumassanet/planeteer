/** The bridge's moving and glowing parts: the lights' blink, the glass, the holo planet and beam, the dust. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { H, HEAD, PLAN, SILL, WINDOWED, random } from './plan.ts';

/** The glow buffer's material: a screen breathes, an indicator blinks, the holo shimmers. No outline. */
export function glowMaterial(time: { value: number }): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 blink;\nuniform float uTime;\nvarying float vBlink;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wave = 0.5 + 0.5 * sin(uTime * blink.y + blink.x * 6.2832);
        // A screen breathes, an indicator is on or off, the holo shimmers.
        vBlink = blink.z < 0.5 ? 0.84 + 0.16 * wave
          : blink.z < 1.5 ? 0.2 + 0.8 * step(0.38, fract(uTime * blink.y * 0.5 + blink.x))
          : 0.72 + 0.28 * wave;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBlink;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vBlink, opacity );');
  };
  return material;
}

/** The window panes, two-sided and depth-free: a faint tint and two streaks over what is behind. */
export function glassPanes(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  const panes = new THREE.BufferGeometry();
  const position: number[] = [];
  const uv: number[] = [];
  for (let e = 0; e < PLAN.length - 1; e++) {
    if (WINDOWED[e] !== true) continue;
    const [ax, az] = PLAN[e]!;
    const [bx, bz] = PLAN[e + 1]!;
    const a = new THREE.Vector3(ax * H, 0, az * H);
    const b = new THREE.Vector3(bx * H, 0, bz * H);
    const lo = SILL * H;
    const hi = HEAD * H;
    const corners = [
      [a, lo, 0, 0],
      [b, lo, 1, 0],
      [b, hi, 1, 1],
      [a, hi, 0, 1],
    ] as const;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [p, y, u, v] = corners[k]!;
      position.push(p.x, y, p.z);
      uv.push(u * (b.distanceTo(a) / (2 * H)) + e * 0.37, v);
    }
  }
  panes.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  panes.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const glass = new THREE.Mesh(panes, material);
  glass.name = 'bridge-glass';
  glass.renderOrder = 2;
  return glass;
}

/** The holo table's beam: an open cone of scrolling additive lines. */
export function holoBeam(time: { value: number }, height: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColour: { value: new THREE.Color(PALETTE.skyBlue) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColour; varying vec2 vUv;
      void main() {
        float lines = 0.8 + 0.2 * sin(vUv.y * 40.0 - uTime * 3.0);
        float a = (1.0 - vUv.y) * 0.2 * lines;
        gl_FragColor = vec4(uColour, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  material.userData.outlineParameters = { visible: false };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * H, 0.1 * H, height, 24, 1, true), material);
  beam.renderOrder = 3;
  return beam;
}

/** Two soft diagonal streaks on a faint blue. */
function glassTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context !== null) {
    context.fillStyle = 'rgba(170, 215, 255, 0.035)';
    context.fillRect(0, 0, 128, 128);
    for (const [at, width, alpha] of [
      [34, 22, 0.07],
      [70, 9, 0.05],
    ] as const) {
      const streak = context.createLinearGradient(at - width, 0, at + width, 0);
      streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
      streak.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
      streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.save();
      context.translate(64, 64);
      context.transform(1, 0, -0.55, 1, 0, 0);
      context.translate(-64, -64);
      context.fillStyle = streak;
      context.fillRect(-64, -64, 256, 256);
      context.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** A faceted planet the size of a fist: a sea, two greens and a sand, white at the poles. */
export function tinyPlanet(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  const sea = new THREE.Color(PALETTE.skyBlue);
  const lands = [new THREE.Color(PALETTE.green), new THREE.Color(PALETTE.olive), new THREE.Color(PALETTE.sand)];
  const ice = new THREE.Color(PALETTE.white);
  const centre = new THREE.Vector3();
  for (let t = 0; t < position.count; t += 3) {
    centre.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centre.add(new THREE.Vector3().fromBufferAttribute(position, t + k));
    centre.normalize();
    const land = Math.sin(centre.x * 5.1 + 1.3) + Math.sin(centre.y * 4.3 - 0.7) + Math.sin(centre.z * 6.2 + 2.1);
    const colour = Math.abs(centre.y) > 0.86 ? ice : land > 0.55 ? lands[Math.floor((land * 7) % 3)]! : sea;
    for (let k = 0; k < 3; k++) colours.set([colour.r, colour.g, colour.b], (t + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  // The outline rides the sphere's own normal, one closed skin.
  const outline = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) outline.set(v.fromBufferAttribute(position, i).normalize().toArray(), i * 3);
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3));
  return geometry;
}

export function tinyRing(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius * 1.65, radius * 0.07, 4, 40);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  const colour = new THREE.Color(PALETTE.apricot);
  for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('outlineNormal', geometry.getAttribute('normal').clone());
  return geometry;
}

/** Dust motes: each one's position comes from its seed and the clock, so nothing is written per frame. */
export function dust(time: { value: number }): { points: THREE.Points; scale: { value: number } } {
  const COUNT = 150;
  const seeds = new Float32Array(COUNT * 4);
  const roll = random(0xd057);
  for (let i = 0; i < seeds.length; i++) seeds[i] = roll();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const scale = { value: 1000 };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uScale: scale,
      uMin: { value: new THREE.Vector3(-2.2 * H, 0.1 * H, -1.8 * H) },
      uSize: { value: new THREE.Vector3(3.8 * H, 1.5 * H, 2.9 * H) },
      uColour: { value: new THREE.Color(PALETTE.white) },
    },
    vertexShader: `
      attribute vec4 seed;
      uniform float uTime;
      uniform float uScale;
      uniform vec3 uMin;
      uniform vec3 uSize;
      varying float vAlpha;
      void main() {
        float rise = 0.05 + 0.08 * seed.w;
        float height = mod(seed.y * uSize.y + uTime * rise, uSize.y);
        vec3 p = uMin + vec3(seed.x * uSize.x, height, seed.z * uSize.z);
        p.x += sin(uTime * 0.23 + seed.w * 6.2832) * 0.35;
        p.z += cos(uTime * 0.19 + seed.x * 6.2832) * 0.35;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.022 * (0.6 + seed.w) / -view.z;
        float edge = smoothstep(0.0, 0.12, height / uSize.y) * (1.0 - smoothstep(0.85, 1.0, height / uSize.y));
        vAlpha = edge * (0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 0.9 + seed.w * 12.0)));
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform vec3 uColour;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColour, smoothstep(0.5, 0.1, d) * vAlpha * 0.6);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // The outline pass draws points a second time unless they opt out, and additive twice is double bright.
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  return { points, scale };
}
