/**
 * The beacon over the marker: a column of light standing on the place,
 * fading up into the sky, brightest down its middle. Drawn through the haze
 * and widened with distance so it is a line on the horizon from far off and
 * a column close to. Not inked: a see-through fill would show its hull.
 */
import * as THREE from 'three';

/** The column's radius and height close to, units. */
const BEACON_RADIUS = 6;
const BEACON_HEIGHT = 900;
/** How wide and tall it is drawn per unit of distance from the eye, so it keeps a few pixels and reaches over the horizon. */
const WIDEN = 0.0035;
const RAISE = 0.22;

const Y = new THREE.Vector3(0, 1, 0);

export interface Beacon {
  readonly mesh: THREE.Mesh;
  /** Stands it on `anchor` (a point on the ground) or puts it away. */
  place(anchor: THREE.Vector3 | null, eye: THREE.Vector3, time: number): void;
  dispose(): void;
}

export function createBeacon(color: THREE.ColorRepresentation): Beacon {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.ShaderMaterial({
    name: 'guide:beacon',
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float core = pow(facing, 2.5);
        float fade = pow(1.0 - vUv.y, 1.8);
        float bands = 0.8 + 0.2 * sin(vUv.y * 60.0 - uTime * 3.0);
        float alpha = fade * bands * (0.12 + 0.78 * core);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.55) * 1.6, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'guide:beacon';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.renderOrder = 2;
  const up = new THREE.Vector3();

  return {
    mesh,
    place(anchor, eye, time) {
      if (anchor === null) {
        mesh.visible = false;
        return;
      }
      const distance = eye.distanceTo(anchor);
      up.copy(anchor).normalize();
      mesh.position.copy(anchor);
      mesh.quaternion.setFromUnitVectors(Y, up);
      const radius = Math.max(BEACON_RADIUS, distance * WIDEN);
      mesh.scale.set(radius, Math.max(BEACON_HEIGHT, distance * RAISE), radius);
      material.uniforms.uTime!.value = time;
      mesh.visible = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
