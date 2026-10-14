/** Flocks of the world's sky creatures wheeling over the traveller. */

import * as THREE from 'three';
import type { AmbientSpec } from '../contract.ts';
import { PALETTE } from '../../theme.ts';
import { MANTA_WAVE, mantaGeometry } from './manta.ts';
import type { AmbientContext, System } from './types.ts';
import { place } from './types.ts';

/** A flock wheels this far from the traveller at most before it is stood up again ahead, units. */
const FLOCK_REACH = 360;
/** Fliers in one flock, at most. */
const FLOCK_MOST = 9;

/**
 * Flocks wheeling over the traveller: each a ring of fliers round a centre
 * that drifts on the wind, at its own height and pace, the wings rippling
 * in a few strokes and then held in a glide. A flock left `FLOCK_REACH`
 * behind is stood up again somewhere ahead and out of sight.
 */
export function fliers(c: AmbientContext, spec: AmbientSpec): System {
  const { rng, group, disposables, driftOf } = c;
  const count = Math.max(1, spec.count);
  const flocks = Math.max(1, Math.ceil(count / FLOCK_MOST));
  const size = spec.size ?? 1;
  const bird = mantaGeometry(spec.color, spec.belly ?? PALETTE.cream);
  const per = bird.position.length / 3;
  const position = new Float32Array(count * per * 3);
  const normal = new Float32Array(count * per * 3);
  const colour = new Float32Array(count * per * 3);
  for (let k = 0; k < count; k++) colour.set(bird.color, k * per * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  const material = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });
  disposables.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'world-fliers';
  mesh.frustumCulled = false;
  group.add(mesh);
  const drift = driftOf(spec, 2);
  const flock = Array.from({ length: flocks }, () => ({
    centre: new THREE.Vector3(),
    placed: false,
    height: rng.range(14, 42),
    ring: rng.range(18, 45),
    turn: rng.range(0.12, 0.25) * rng.sign(),
    clock: rng.range(0, 100),
    ground: 0,
  }));
  const birds = Array.from({ length: count }, (_, k) => ({
    flock: k % flocks,
    angle: rng.range(0, Math.PI * 2),
    out: rng.range(0.7, 1.25),
    rise: rng.range(-5, 5),
    // Strokes a second: a wing this broad rows the air slowly, where a
    // bird's beat (four to six) made it buzz.
    beat: rng.range(1.1, 1.7) / Math.max(0.6, Math.sqrt(size)),
    phase: rng.range(0, Math.PI * 2),
  }));
  const up = new THREE.Vector3();
  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const side = new THREE.Vector3();
  const local = new THREE.Vector3();
  const toward = new THREE.Vector3();
  return {
    update(frame, dt) {
      for (const one of flock) {
        if (!one.placed || one.centre.distanceTo(frame.player) > FLOCK_REACH) {
          const a = rng.range(0, Math.PI * 2);
          const d = one.placed ? rng.range(200, 300) : rng.range(30, 160);
          place(frame, Math.cos(a) * d, Math.sin(a) * d, 0, one.centre);
          one.placed = true;
        }
        toward.copy(frame.east).multiplyScalar(drift.e * drift.speed).addScaledVector(frame.north, drift.n * drift.speed);
        one.centre.addScaledVector(toward, dt);
        one.clock += dt;
        // The ground under the flock, asked once a frame for all of it rather
        // than for each bird: they fly tens of units over it.
        one.ground = frame.groundAt(one.centre);
      }
      const array = position;
      const normals = normal;
      let v = 0;
      for (const b of birds) {
        const f = flock[b.flock]!;
        const angle = b.angle + f.clock * f.turn;
        up.copy(f.centre).normalize();
        // The ring round the centre on its tangent plane.
        side.set(up.y, -up.x, 0.2).addScaledVector(up, -up.dot(side)).normalize();
        ahead.crossVectors(up, side).normalize();
        at.copy(f.centre).addScaledVector(side, Math.cos(angle) * f.ring * b.out).addScaledVector(ahead, Math.sin(angle) * f.ring * b.out);
        at.setLength(frame.radius + f.ground + f.height + b.rise + Math.sin(f.clock * 0.4 + b.phase) * 3);
        // Flying round the ring: forward is its tangent, the way it turns.
        const forward = toward.copy(side).multiplyScalar(-Math.sin(angle)).addScaledVector(ahead, Math.cos(angle)).multiplyScalar(Math.sign(f.turn)).normalize();
        up.copy(at).normalize();
        forward.addScaledVector(up, -forward.dot(up)).normalize();
        const right = side.crossVectors(up, forward).normalize();
        // A few strokes, then a glide with the wings held a little up. The
        // strokes ease in and out over `EASE` of the cycle rather than
        // snapping to the glide's pose, and the glide keeps a slow ripple.
        const cycle = (f.clock * 0.35 + b.phase) % 3;
        const EASE = 0.3;
        const held = cycle < 1.6 ? Math.min(1, cycle / EASE, (1.6 - cycle) / EASE) : 0;
        const stroke = held * held * (3 - 2 * held);
        const beat = f.clock * b.beat * Math.PI * 2 + b.phase;
        const glide = 0.12 + 0.04 * Math.sin(f.clock * 1.3 + b.phase);
        // The tail's sway, slow and side to side.
        const swing = Math.sin(f.clock * 1.6 + b.phase) * 0.22 * size;
        // A bank into the turn.
        const bank = 0.35 * Math.sign(f.turn);
        const cb = Math.cos(bank);
        const sb = Math.sin(bank);
        for (let i = 0; i < per; i++) {
          const bx = bird.position[i * 3]!;
          const bz = bird.position[i * 3 + 2]!;
          let x = bx * size + swing * bird.tail[i]!;
          let y = bird.position[i * 3 + 1]! * size;
          const z = bz * size;
          let nx = bird.normal[i * 3]!;
          let ny = bird.normal[i * 3 + 1]!;
          const nz = bird.normal[i * 3 + 2]!;
          // The wing bends rather than hinges: the turn about the body's
          // axis grows with the distance from the spine, and its phase runs
          // back along the body, so the ripple travels from nose to tail.
          const bend = bird.bend[i]!;
          if (bend !== 0) {
            const flap = stroke * Math.sin(beat + bz * MANTA_WAVE) * 0.75 + (1 - stroke) * glide;
            const a = flap * bend;
            const c = Math.cos(a);
            const sn = Math.sin(a);
            const rx = x * c - y * sn;
            y = x * sn + y * c;
            x = rx;
            const rn = nx * c - ny * sn;
            ny = nx * sn + ny * c;
            nx = rn;
          }
          const bx2 = x * cb - y * sb;
          y = x * sb + y * cb;
          x = bx2;
          const bn = nx * cb - ny * sb;
          ny = nx * sb + ny * cb;
          nx = bn;
          local.copy(at).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(forward, z);
          array[v * 3] = local.x;
          array[v * 3 + 1] = local.y;
          array[v * 3 + 2] = local.z;
          normals[v * 3] = right.x * nx + up.x * ny + forward.x * nz;
          normals[v * 3 + 1] = right.y * nx + up.y * ny + forward.y * nz;
          normals[v * 3 + 2] = right.z * nx + up.z * ny + forward.z * nz;
          v++;
        }
      }
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('normal').needsUpdate = true;
    },
  };
}
