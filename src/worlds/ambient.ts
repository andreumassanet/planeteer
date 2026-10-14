/**
 * The small weather of another world, round the camera: dust devils walking
 * the plain, motes drifting or falling, cirrus racing overhead, glints on the
 * ground, lightning on the horizon, sheets of haze and flocks of fliers.
 *
 * All of it is cheap by construction (a handful of meshes, a `Points` or a
 * `LineSegments` a kind) and lives only near the eye. A devil that wanders
 * past `DEVIL_REACH` is stood up again ahead of the traveller; the motes are a
 * box that moves with the camera and wraps; the streaks, glints and haze are
 * laid out on the ground's tangent plane round the traveller and wrap as they
 * go, keyed to how far the traveller has walked so that they hold still in
 * the world rather than ride along. Each entry in `WorldSpec.ambient` is its
 * own system, so a world may have two kinds of mote in two colours.
 *
 * The systems are in `ambient/`: `drift.ts`, `fliers.ts` (with the manta of
 * `manta.ts`), `glints.ts` and `lightning.ts`.
 */

import * as THREE from 'three';
import type { AmbientSpec, WindSpec } from './contract.ts';
import { linearOf } from './terrain.ts';
import { rngFrom } from '../scenery/random.ts';
import { glints } from './ambient/glints.ts';
import { fliers } from './ambient/fliers.ts';
import { haze, motes, streaks } from './ambient/drift.ts';
import { lightning } from './ambient/lightning.ts';
import type { AmbientContext, Devil, Frame, System } from './ambient/types.ts';

const DEVIL_REACH = 520;

export interface Ambient {
  group: THREE.Group;
  update(dt: number, player: THREE.Vector3, eye: THREE.Vector3, groundAt: (point: THREE.Vector3) => number, radius: number): void;
  /**
   * The dust devils walking the plain this frame: where each stands, its up,
   * its colour, how tall it is and how hard it spins — drawn by whoever
   * holds the dust (`Effects.whirl`), as a column of Earth's own puffs.
   */
  eachDevil(visit: (base: THREE.Vector3, up: THREE.Vector3, color: number, height: number, carry: Float64Array) => void): void;
  dispose(): void;
}

/** A soft round spot, for haze and flashes: white with alpha falling off from the middle. */
function softSpot(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = Math.hypot(i + 0.5 - size / 2, j + 0.5 - size / 2) / (size / 2);
      const a = Math.max(0, 1 - d);
      const k = (j * size + i) * 4;
      data[k] = 255;
      data[k + 1] = 255;
      data[k + 2] = 255;
      data[k + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createAmbient(specs: readonly AmbientSpec[], seed: string, wind: WindSpec | null = null): Ambient {
  const group = new THREE.Group();
  group.name = 'world-ambient';
  const devils: Devil[] = [];
  const systems: System[] = [];
  const rng = rngFrom('worlds', 'ambient', seed);
  const disposables: { dispose(): void }[] = [];
  let time = 0;
  let spot: THREE.DataTexture | null = null;
  const soft = (): THREE.DataTexture => {
    if (spot === null) {
      spot = softSpot();
      disposables.push(spot);
    }
    return spot;
  };
  const driftOf: AmbientContext['driftOf'] = (spec, fallback) => {
    const bearing = ((spec.bearing ?? wind?.toward ?? 70) * Math.PI) / 180;
    const speed = spec.speed ?? (wind !== null ? wind.speed * 0.5 : fallback);
    return { e: Math.sin(bearing), n: Math.cos(bearing), speed };
  };
  const context: AmbientContext = { group, rng, disposables, soft, driftOf };

  for (const spec of specs) {
    const [r, g, b] = linearOf(spec.color);
    const color = new THREE.Color(r, g, b);
    if (spec.kind === 'dust-devil') {
      // No mesh of its own: it is a column of dust puffs, raised by the effects (`eachDevil`).
      for (let k = 0; k < spec.count; k++) {
        devils.push({
          position: new THREE.Vector3(),
          drift: new THREE.Vector3(),
          up: new THREE.Vector3(),
          height: rng.range(16, 34),
          color: spec.color,
          carry: new Float64Array(2),
          placed: false,
        });
      }
    } else if (spec.kind === 'motes') {
      systems.push(motes(context, spec, color));
    } else if (spec.kind === 'streaks') {
      systems.push(streaks(context, spec, color));
    } else if (spec.kind === 'glint') {
      systems.push(glints(context, spec, color));
    } else if (spec.kind === 'lightning') {
      systems.push(lightning(context, spec, color));
    } else if (spec.kind === 'haze') {
      systems.push(haze(context, spec, color));
    } else if (spec.kind === 'fliers') {
      systems.push(fliers(context, spec));
    }
  }

  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const frame: Frame = {
    time: 0,
    player: new THREE.Vector3(),
    eye: new THREE.Vector3(),
    up: new THREE.Vector3(),
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
    walkedE: 0,
    walkedN: 0,
    radius: 0,
    groundAt: () => 0,
  };
  const last = new THREE.Vector3();
  let started = false;

  function respawn(devil: Devil, player: THREE.Vector3, radius: number): void {
    up.copy(player).normalize();
    side.set(up.y, -up.x, 0.3).addScaledVector(up, -up.dot(side)).normalize();
    side.applyAxisAngle(up, rng.range(0, Math.PI * 2));
    devil.position.copy(up).multiplyScalar(radius).addScaledVector(side, rng.range(120, DEVIL_REACH * 0.8));
    devil.drift.copy(side).applyAxisAngle(up, rng.range(-2, 2)).multiplyScalar(rng.range(3, 7));
    devil.placed = true;
  }

  return {
    group,
    update(dt, player, eye, groundAt, radius) {
      time += dt;
      for (const devil of devils) {
        if (!devil.placed || devil.position.distanceTo(player) > DEVIL_REACH) respawn(devil, player, radius);
        devil.position.addScaledVector(devil.drift, dt);
        devil.position.setLength(radius + groundAt(devil.position));
        devil.up.copy(devil.position).normalize();
      }
      if (systems.length === 0) return;
      // The frame: up, north and east at the traveller, and the walk so far.
      frame.time = time;
      frame.player.copy(player);
      frame.eye.copy(eye);
      frame.up.copy(player).normalize();
      frame.north.set(0, 1, 0).addScaledVector(frame.up, -frame.up.y);
      if (frame.north.lengthSq() < 1e-8) frame.north.set(1, 0, 0).addScaledVector(frame.up, -frame.up.x);
      frame.north.normalize();
      // East is north x up in this project's frame (`sphere.ts`).
      frame.east.crossVectors(frame.north, frame.up).normalize();
      if (started) {
        last.subVectors(player, last);
        frame.walkedE += last.dot(frame.east);
        frame.walkedN += last.dot(frame.north);
      }
      started = true;
      last.copy(player);
      frame.radius = radius;
      frame.groundAt = groundAt;
      for (const system of systems) system.update(frame, dt);
    },
    eachDevil(visit) {
      for (const devil of devils) if (devil.placed) visit(devil.position, devil.up, devil.color, devil.height, devil.carry);
    },
    dispose() {
      for (const one of disposables) one.dispose();
    },
  };
}