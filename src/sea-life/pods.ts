// The passes: dolphin pods that leap and whales that rise to breathe, decided by
// a coarse cell and a slot of time (`podIn`) so every client sees the same ones.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { DOLPHIN_SLOT, WHALE_SLOT, podCellOf, podIn } from '../sea-floor.ts';
import type { Pod } from '../sea-floor.ts';
import { hash3 } from '../weather.ts';
import type { SeaLifeFrame, SeaLifeOptions } from '../sea-life.ts';
import type { SwimContext } from './context.ts';
import type { SwimmerMeshes } from './swimmers.ts';

const DOLPHIN_RANGE = 450;
const WHALE_RANGE = 1600;
export const MAX_DOLPHINS = 12;
export const MAX_WHALES = 2;

/** A dolphin's leap: how often, how long it is in the air, and how high. */
const LEAP_EVERY = 3.6;
const LEAP_TIME = 1.1;
const LEAP_HEIGHT = 2.6;
/** How deep a dolphin cruises between leaps. */
const DOLPHIN_DEPTH = 1.8;
/** A whale's breath: how long a cycle, how much of it at the surface, how deep it sounds. */
const WHALE_CYCLE = 44;
const WHALE_UP = 14;
const WHALE_SOUND = 16;

const POD_KINDS = ['dolphin', 'whale'] as const;

export function createPods(
  ctx: SwimContext,
  meshes: SwimmerMeshes,
  options: SeaLifeOptions,
  bubble: (from: THREE.Vector3, rise: number, spread: number, life: number) => void,
): (frame: SeaLifeFrame, t: number, dt: number) => void {
  const { dolphins, whales } = meshes;
  const { home, at, ahead, forward, up, side, heading, bigCount, saw, place } = ctx;
  const podEye = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const podStart = new THREE.Vector3();
  const podHeading = new THREE.Vector3();
  const splashAt = new THREE.Vector3();
  /**
   * Each dolphin's last height over the surface and the frame it was taken on,
   * as pairs by its place in its pod, to see it break the water. Kept by the
   * animal and not by its instance, since instances are handed out afresh every
   * frame in the order the pods are met.
   */
  const dolphinWas = new WeakMap<Pod, Float64Array>();
  let podFrame = 0;
  const spoutClock = new Float32Array(MAX_WHALES);

  /** The dolphins and the whales passing near the camera now. */
  function pods(frame: SeaLifeFrame, t: number, dt: number): void {
    const camera = frame.camera;
    podEye.copy(camera).normalize();
    podFrame++;
    for (const kind of POD_KINDS) {
      const slotLength = kind === 'dolphin' ? DOLPHIN_SLOT : WHALE_SLOT;
      const slot = Math.floor(t / slotLength);
      const cell = podCellOf(kind, podEye.x, podEye.y, podEye.z);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const pod = podIn(kind, cell.row + dr, cell.col + dc, slot);
          if (pod === null) continue;
          if (t < pod.from || t > pod.from + pod.length) continue;
          if (kind === 'dolphin') swimDolphins(pod, t, camera);
          else swimWhale(pod, t, camera, dt);
        }
      }
    }
  }

  /** Where a pod's lead is at `t`: along the great circle it set out on. */
  function podAt(pod: Pod, t: number): void {
    podStart.set(pod.x, pod.y, pod.z);
    podHeading.set(pod.hx, pod.hy, pod.hz);
    axis.crossVectors(podStart, podHeading).normalize();
    const travelled = (pod.speed * (t - pod.from)) / PLANET_RADIUS;
    at.copy(podStart).applyAxisAngle(axis, travelled);
    forward.copy(podHeading).applyAxisAngle(axis, travelled).normalize();
  }

  function swimDolphins(pod: Pod, t: number, camera: THREE.Vector3): void {
    podAt(pod, t);
    home.copy(at);
    heading.copy(forward);
    up.copy(home);
    side.crossVectors(up, heading).normalize();
    let was = dolphinWas.get(pod);
    if (was === undefined) {
      was = new Float64Array(pod.count * 2).fill(NaN);
      dolphinWas.set(pod, was);
    }
    for (let k = 0; k < pod.count; k++) {
      const index = bigCount.dolphin!;
      if (index >= MAX_DOLPHINS) return;
      // Abreast and a little staggered, each leaping on a clock of its own.
      const lateral = (k - (pod.count - 1) / 2) * 3.2 + Math.sin(t * 0.5 + k) * 0.6;
      const behind = (k % 2) * 2.5 + hash3(pod.seed, k, 1) * 2;
      const phase = ((t + hash3(pod.seed, k, 2) * LEAP_EVERY) % LEAP_EVERY) / LEAP_EVERY;
      const leapShare = LEAP_TIME / LEAP_EVERY;
      let height = -DOLPHIN_DEPTH + Math.sin(t * 1.3 + k) * 0.3;
      let climb = 0;
      if (phase < leapShare) {
        // A parabola from under the surface, over it, and back in.
        const u = phase / leapShare;
        height = -DOLPHIN_DEPTH * 0.5 + (LEAP_HEIGHT + DOLPHIN_DEPTH * 0.5) * 4 * u * (1 - u);
        climb = (LEAP_HEIGHT + DOLPHIN_DEPTH * 0.5) * 4 * (1 - 2 * u);
      } else {
        const u = (phase - leapShare) / (1 - leapShare);
        climb = -Math.sin(u * Math.PI * 2) * 0.4;
      }
      at.copy(home)
        .addScaledVector(side, lateral / PLANET_RADIUS)
        .addScaledVector(heading, -behind / PLANET_RADIUS)
        .normalize();
      const upHere = splashAt.copy(at);
      at.multiplyScalar(PLANET_RADIUS + height);
      // Out and back in, judged against its own height a frame ago: one not
      // seen last frame (out of range, past the cap) has nothing to compare.
      const broke = was[k * 2 + 1] === podFrame - 1 && (was[k * 2]! < 0) !== (height < 0);
      was[k * 2] = height;
      was[k * 2 + 1] = podFrame;
      if (at.distanceTo(camera) > DOLPHIN_RANGE) continue;
      // Nose up out of the water and down into it: the arc's own slope.
      forward.copy(heading).multiplyScalar(pod.speed).addScaledVector(upHere, climb).normalize();
      place(dolphins, index, at, forward, upHere, 1);
      // A splash where it breaks the surface.
      if (broke && options.splash !== undefined && at.distanceTo(camera) < 250) {
        options.splash(splashAt.multiplyScalar(PLANET_RADIUS + 0.5), 2.2);
      }
      bigCount.dolphin = index + 1;
      saw('dolphin', at);
    }
  }

  function swimWhale(pod: Pod, t: number, camera: THREE.Vector3, dt: number): void {
    const index = bigCount.whale!;
    if (index >= MAX_WHALES) return;
    podAt(pod, t);
    const upHere = home.copy(at);
    // Up to breathe, then down: the back awash at the surface, the tail
    // rising as it sounds.
    const cycle = ((t - pod.from + hash3(pod.seed, 1, 1) * WHALE_CYCLE) % WHALE_CYCLE);
    let depth: number;
    let pitch = 0;
    if (cycle < WHALE_UP) {
      depth = 1.2 + Math.sin((cycle / WHALE_UP) * Math.PI * 3) * 0.2;
    } else {
      const u = (cycle - WHALE_UP) / (WHALE_CYCLE - WHALE_UP);
      depth = 1.2 + WHALE_SOUND * Math.sin(u * Math.PI);
      pitch = -Math.cos(u * Math.PI) * 0.28;
    }
    at.multiplyScalar(PLANET_RADIUS - depth);
    if (at.distanceTo(camera) > WHALE_RANGE) return;
    forward.addScaledVector(upHere, pitch).normalize();
    place(whales, index, at, forward, upHere, 1);
    bigCount.whale = index + 1;
    // The spout, every few seconds while it is up.
    if (cycle < WHALE_UP) {
      spoutClock[index] = (spoutClock[index] ?? 0) - dt;
      if (spoutClock[index]! <= 0) {
        spoutClock[index] = 4;
        ahead.copy(at).addScaledVector(forward, 5).setLength(PLANET_RADIUS + 1.5);
        for (let k = 0; k < 14; k++) bubble(ahead, 5 + Math.random() * 3, 0.8, 1.2);
      }
    }
    saw('whale', at);
  }

  return pods;
}
