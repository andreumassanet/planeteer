/** The layers' ring meshes: building them for a quality, and setting a layer's uniforms each frame. */
import * as THREE from 'three';
import { bladeGeometry, grassMaterial } from './material.ts';
import { COARSE, FINE, METRE, RINGS } from './types.ts';
import type { GrassFrame, GrassQuality, GrassStats, Ring } from './types.ts';
import { createField, tangentOf } from './layers.ts';
import type { Layer } from './layers.ts';

interface RingMesh {
  ring: Ring;
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshToonMaterial>;
  rect: THREE.Vector4;
}

export interface Rings {
  /** Replaces a layer's ring meshes with a quality's. */
  build(layer: Layer, wanted: GrassQuality): void;
  /** Sets a layer's uniforms for the frame, and counts the instances its rings draw. */
  setUniforms(layer: Layer, frame: GrassFrame, eyeAt: THREE.Vector3): void;
}

/** A layer: a frame and its two fields, hidden until anchored, with its group in `group`. */
export function createLayer(name: string, group: THREE.Group, R: number): Layer {
  const fine = createField(FINE.texel, FINE.size);
  const coarse = createField(COARSE.texel, COARSE.size);
  const layerGroup = new THREE.Group();
  layerGroup.name = name;
  layerGroup.visible = false;
  group.add(layerGroup);
  return {
    frame: { radius: R, up: new THREE.Vector3(0, 1, 0), across: new THREE.Vector3(), north: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
    fine,
    coarse,
    group: layerGroup,
    uniforms: {
      uCameraPos: { value: new THREE.Vector3() },
      uPlayerPos: { value: new THREE.Vector3() },
      uPushShape: { value: new THREE.Vector4(0, 1, 0, 0) },
      uPushOn: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uAppear: { value: 0 },
      uFineData: { value: fine.dataTexture },
      uFinePaint: { value: fine.paintTexture },
      uFineWindow: { value: fine.window },
      uCoarseData: { value: coarse.dataTexture },
      uCoarsePaint: { value: coarse.paintTexture },
      uCoarseWindow: { value: coarse.window },
    },
    appear: 0,
    shown: false,
    began: -1,
    anchored: false,
  };
}

export function createRings(shared: Record<string, THREE.IUniform>, ramp: THREE.Texture, R: number, earth: boolean, stats: GrassStats): Rings {
  const ringsOf = new Map<Layer, RingMesh[]>();
  const playerAt = new THREE.Vector3();

  function build(layer: Layer, wanted: GrassQuality): void {
    for (const old of ringsOf.get(layer) ?? []) {
      layer.group.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
    const made: RingMesh[] = RINGS[wanted].map((ring, index) => {
      const rect = new THREE.Vector4();
      const uniforms: Record<string, THREE.IUniform> = {
        ...shared,
        ...layer.uniforms,
        uGRect: { value: rect },
        uGSpacing: { value: ring.spacing },
        uGRadius: { value: ring.radius },
        uGWidth: { value: ring.width },
        uGFaceCam: { value: ring.faceCamera },
        uGRing: { value: index },
      };
      const mesh = new THREE.Mesh(bladeGeometry(ring.segments), grassMaterial(uniforms, ramp, R, earth));
      mesh.name = `grass-ring-${index}`;
      // Every vertex is placed by the shader; there is nothing for a box to bound.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      layer.group.add(mesh);
      return { ring, mesh, rect };
    });
    ringsOf.set(layer, made);
  }

  function setUniforms(layer: Layer, frame: GrassFrame, eyeAt: THREE.Vector3): void {
    const metre = METRE;
    (layer.uniforms.uCameraPos!.value as THREE.Vector3).set(eyeAt.x / metre, eyeAt.y / metre, eyeAt.z / metre);
    const player = tangentOf(layer.frame, frame.player, playerAt);
    (layer.uniforms.uPlayerPos!.value as THREE.Vector3).set(player.x / metre, player.y / metre, player.z / metre);
    const press = frame.press;
    layer.uniforms.uPushOn!.value = press === null ? 0 : 1;
    if (press !== null) {
      // The tangent plane's x is `across`, its z `north` (`tangentOf`).
      const fx = press.forward.dot(layer.frame.across);
      const fz = press.forward.dot(layer.frame.north);
      const fl = Math.hypot(fx, fz);
      (layer.uniforms.uPushShape!.value as THREE.Vector4).set(fl > 1e-6 ? fx / fl : 0, fl > 1e-6 ? fz / fl : 1, press.length / metre, press.width / metre);
    }
    // Toward the bearing the wind blows to; `across` is west (see `frameAt`).
    const toward = ((frame.wind.from + 180) * Math.PI) / 180;
    (layer.uniforms.uWindDir!.value as THREE.Vector2).set(-Math.sin(toward), Math.cos(toward));
    layer.uniforms.uAppear!.value = layer.appear * layer.appear * (3 - 2 * layer.appear);
    for (const { ring, mesh, rect } of ringsOf.get(layer) ?? []) {
      const cx = eyeAt.x / metre;
      const cz = eyeAt.z / metre;
      const cells = Math.ceil((2 * ring.radius) / ring.spacing) + 1;
      rect.set(Math.floor((cx - ring.radius) / ring.spacing), Math.floor((cz - ring.radius) / ring.spacing), cells, 0);
      mesh.geometry.instanceCount = layer.group.visible ? cells * cells : 0;
      if (layer.group.visible) stats.instances += cells * cells;
    }
  }

  return { build, setUniforms };
}
