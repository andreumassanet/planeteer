/**
 * The ghost drawn: the craft it was run in as one translucent, unlit,
 * un-inked sky-blue shell, or a glowing orb where that model is not to hand,
 * and a short ribbon of where it has just been. Two draw calls; it casts no
 * shadow, writes no depth and nothing collides with it.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { GHOST_RATE, ghostDuration, ghostPose } from './ghost.ts';
import type { GhostTrack } from './ghost.ts';

/** Points in the ribbon behind the ghost. */
const TRAIL_POINTS = 24;
/** Seconds of run between two of them. */
const TRAIL_STEP = 1 / (GHOST_RATE * 1.5);
/** How see-through the shell is. */
const SHELL_OPACITY = 0.38;
/** Seconds the ghost takes to come in and to go after its run's end. */
const FADE_TIME = 0.6;
/** Past this far from the player, units, the ghost is not drawn. */
export const GHOST_REACH = 6000;

/** Anything that builds a craft's model: `CraftModel` is one. */
export interface GhostModel {
  id: string;
  build(variant: number): THREE.Object3D;
}

/** A model's meshes as one position-only buffer in its own frame, every face wound outward. */
export function ghostShape(model: GhostModel): THREE.BufferGeometry {
  const root = model.build(0);
  root.updateMatrixWorld(true);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const position = mesh.geometry.getAttribute('position');
    if (position === undefined) return;
    const index = mesh.geometry.getIndex();
    // A reflected node would turn its faces inside out: wind them back.
    const flip = mesh.matrixWorld.determinant() < 0;
    const count = index === null ? position.count : index.count;
    for (let t = 0; t + 2 < count; t += 3) {
      for (const k of flip ? [0, 2, 1] : [0, 1, 2]) {
        const at = index === null ? t + k : index.getX(t + k);
        v.fromBufferAttribute(position, at).applyMatrix4(mesh.matrixWorld);
        out.push(v.x, v.y, v.z);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface GhostView {
  readonly object: THREE.Group;
  /** Whether it is drawn this frame. */
  readonly shown: boolean;
  /** What it is drawn as: the craft's shell, the orb, or nothing. */
  readonly shape: 'model' | 'orb' | null;
  /** A run starts against `track`, drawn as `shell` or, null, as the orb. */
  start(track: GhostTrack, shell: THREE.BufferGeometry | null): void;
  /** Each frame: the ghost `seconds` into its run, near `from`. */
  update(seconds: number, from: THREE.Vector3): void;
  stop(): void;
  dispose(): void;
}

export function createGhostView(): GhostView {
  const object = new THREE.Group();
  object.name = 'ghost';
  const tint = new THREE.Color(PALETTE.skyBlue).lerp(new THREE.Color(0xffffff), 0.25);
  const glass = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: SHELL_OPACITY, depthWrite: false });
  glass.userData.outlineParameters = { visible: false };
  const orbGeometry = new THREE.IcosahedronGeometry(AVATAR_HEIGHT * 0.6, 2);
  const body = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(orbGeometry, glass);
  body.name = 'ghost-body';
  body.castShadow = false;
  body.receiveShadow = false;
  body.visible = false;
  const trailPositions = new Float32Array(TRAIL_POINTS * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const trailMaterial = new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.7, depthWrite: false });
  trailMaterial.userData.outlineParameters = { visible: false };
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  trail.name = 'ghost-trail';
  trail.frustumCulled = false;
  trail.visible = false;
  object.add(body, trail);

  let track: GhostTrack | null = null;
  let shape: 'model' | 'orb' | null = null;
  let shown = false;
  const at = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const spare = new THREE.Quaternion();

  function hide(): void {
    body.visible = false;
    trail.visible = false;
    shown = false;
  }

  return {
    object,
    get shown() {
      return shown;
    },
    get shape() {
      return shape;
    },
    start(next, shell) {
      track = next;
      body.geometry = shell ?? orbGeometry;
      shape = shell === null ? 'orb' : 'model';
      hide();
    },
    update(seconds, from) {
      if (track === null) return hide();
      const end = ghostDuration(track);
      ghostPose(track, seconds, at, turn);
      if (seconds > end + FADE_TIME || at.distanceTo(from) > GHOST_REACH) return hide();
      const fade = Math.min(1, seconds / FADE_TIME, (end + FADE_TIME - seconds) / FADE_TIME);
      glass.opacity = SHELL_OPACITY * Math.max(0, fade);
      trailMaterial.opacity = 0.7 * Math.max(0, fade);
      body.position.copy(at);
      body.quaternion.copy(turn);
      for (let k = 0; k < TRAIL_POINTS; k++) {
        ghostPose(track, Math.max(0, seconds - k * TRAIL_STEP), at, spare);
        trailPositions.set([at.x, at.y, at.z], k * 3);
      }
      trailGeometry.attributes.position!.needsUpdate = true;
      body.visible = true;
      trail.visible = true;
      shown = true;
    },
    stop() {
      track = null;
      shape = null;
      hide();
    },
    dispose() {
      object.removeFromParent();
      orbGeometry.dispose();
      trailGeometry.dispose();
      glass.dispose();
      trailMaterial.dispose();
    },
  };
}
