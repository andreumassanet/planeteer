/**
 * The lit lamp of every traffic light near the viewer: one small bulb a
 * light, red, amber or green as `signals.ts` says at the world clock, over
 * the dark glass of the merged town. One instanced mesh, unlit, so it reads
 * by day and shines by night, and without ink: a lamp is a few pixels.
 */
import * as THREE from 'three';
import { AMBER, GREEN, signalLight } from './signals.ts';
import type { SignalAxis } from './signals.ts';

/** How far from the viewer a lit lamp is drawn. */
export const SIGNAL_LAMP_REACH = 320;
/** How many lights at once: four a crossing, a few crossings. */
const CAP = 48;
/** Numbers a light publishes (`SIGNAL_HEAD` in `settlements/raise/furniture.ts`). */
const STRIDE = 11;
/** A lit bulb against the lamp's own radius. */
const BULB = 1.15;

const COLOURS = [new THREE.Color(0x4dff8a), new THREE.Color(0xffb22e), new THREE.Color(0xff3b2a)];

export interface SignalSource {
  signalsNear(viewer: THREE.Vector3, radius: number, visit: (town: number, heads: Float32Array) => void): void;
}

export interface SignalLamps {
  readonly mesh: THREE.InstancedMesh;
  /** Lights the nearest lamps for the world clock, in seconds. */
  update(viewer: THREE.Vector3, clock: number): void;
  readonly stats: { lit: number };
}

export function createSignalLamps(source: SignalSource): SignalLamps {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.InstancedMesh(geometry, material, CAP);
  mesh.name = 'signal-lamps';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.setColorAt(0, COLOURS[0]!);
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const stats = { lit: 0 };
  const reach2 = SIGNAL_LAMP_REACH * SIGNAL_LAMP_REACH;
  let count = 0;
  let now = 0;
  let from = new THREE.Vector3();

  const visit = (town: number, heads: Float32Array): void => {
    for (let i = 0; i + STRIDE <= heads.length && count < CAP; i += STRIDE) {
      const axis = heads[i + 9]! as SignalAxis;
      const light = signalLight(town, now, axis);
      // Red on top, amber, green below: the order the heads are published in.
      const lamp = light === GREEN ? 2 : light === AMBER ? 1 : 0;
      at.set(heads[i + lamp * 3]!, heads[i + lamp * 3 + 1]!, heads[i + lamp * 3 + 2]!);
      if (at.distanceToSquared(from) > reach2) continue;
      const r = heads[i + 10]! * BULB;
      matrix.makeScale(r, r, r).setPosition(at);
      mesh.setMatrixAt(count, matrix);
      mesh.setColorAt(count, COLOURS[light]!);
      count++;
    }
  };

  return {
    mesh,
    stats,
    update(viewer, clock) {
      count = 0;
      now = clock;
      from = viewer;
      source.signalsNear(viewer, SIGNAL_LAMP_REACH, visit);
      mesh.count = count;
      stats.lit = count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
