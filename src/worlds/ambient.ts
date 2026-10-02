/**
 * The small weather of another world, round the camera: dust devils walking
 * the plain, motes drifting or falling, cirrus racing overhead, glints on the
 * ground, lightning on the horizon and sheets of haze.
 *
 * All of it is cheap by construction — a handful of meshes, a `Points` or a
 * `LineSegments` a kind — and all of it lives only near the eye. A devil that
 * wanders past `DEVIL_REACH` is stood up again ahead of the traveller; the
 * motes are a box that moves with the camera and wraps; the streaks, glints
 * and haze are laid out on the ground's own tangent plane round the traveller
 * and wrap as they go, keyed to how far the traveller has walked so that they
 * hold still in the world (and pass with parallax) rather than ride along.
 * Each entry in `WorldSpec.ambient` is its own system, so a world may have two
 * kinds of mote, in two colours, going two ways.
 */

import * as THREE from 'three';
import type { AmbientSpec, WindSpec } from './contract.ts';
import { linearOf } from './terrain.ts';
import { latOf, lonOf } from '../sphere.ts';
import { rngFrom } from '../scenery/random.ts';

const DEVIL_REACH = 520;
const MOTE_BOX = 60;
/** The square the streaks, glints and haze wrap in, units on a side. */
const STREAK_BOX = 320;
const GLINT_BOX = 120;
const HAZE_BOX = 420;

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

interface Devil {
  position: THREE.Vector3;
  drift: THREE.Vector3;
  up: THREE.Vector3;
  height: number;
  color: number;
  /** The dust it owes, carried from frame to frame. */
  carry: Float64Array;
  placed: boolean;
}

/** A system updated once a frame with the frame's tangent basis. */
interface System {
  update(frame: Frame, dt: number): void;
}

/** What every system shares in a frame: where the traveller is, which way is up, north and east. */
interface Frame {
  time: number;
  player: THREE.Vector3;
  eye: THREE.Vector3;
  up: THREE.Vector3;
  north: THREE.Vector3;
  east: THREE.Vector3;
  /** How far the traveller has walked east and north since the start, units. */
  walkedE: number;
  walkedN: number;
  radius: number;
  groundAt: (point: THREE.Vector3) => number;
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

/** `v` wrapped into [-half, half). */
const wrap = (v: number, size: number): number => ((((v + size / 2) % size) + size) % size) - size / 2;

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

  /** A drift's direction (east, north) and speed: the spec's, else the wind's, else a slow drift east. */
  const driftOf = (spec: AmbientSpec, fallback: number): { e: number; n: number; speed: number } => {
    const bearing = ((spec.bearing ?? wind?.toward ?? 70) * Math.PI) / 180;
    const speed = spec.speed ?? (wind !== null ? wind.speed * 0.5 : fallback);
    return { e: Math.sin(bearing), n: Math.cos(bearing), speed };
  };

  for (const spec of specs) {
    const [r, g, b] = linearOf(spec.color);
    const color = new THREE.Color(r, g, b);
    if (spec.kind === 'dust-devil') {
      // No mesh of its own: a see-through cone was a cone. It is a column
      // of dust puffs, raised by the effects (`eachDevil`).
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
      systems.push(motes(spec, color));
    } else if (spec.kind === 'streaks') {
      systems.push(streaks(spec, color));
    } else if (spec.kind === 'glint') {
      systems.push(glints(spec, color));
    } else if (spec.kind === 'lightning') {
      systems.push(lightning(spec, color));
    } else if (spec.kind === 'haze') {
      systems.push(haze(spec, color));
    }
  }

  /**
   * Specks in a box round the eye, each drifting and wrapping inside it: the
   * box is the world's axes and the drift is the frame's, so a mote that falls
   * falls toward the ground wherever on the planet the box is.
   */
  function motes(spec: AmbientSpec, color: THREE.Color): System {
    const count = Math.max(1, spec.count);
    const box = spec.fall !== undefined && spec.fall > 0 ? MOTE_BOX * 1.6 : MOTE_BOX;
    const positions = new Float32Array(count * 3);
    const offsets = new Float32Array(count * 3);
    for (let k = 0; k < count * 3; k++) offsets[k] = rng.range(0, box);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size: spec.size ?? 0.35, transparent: true, opacity: 0.7, depthWrite: false });
    // The ink draws the scene twice; a see-through speck drawn twice is twice as opaque.
    material.userData.outlineParameters = { visible: false };
    disposables.push(geometry, material);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    const drift = driftOf(spec, 0.8);
    const fall = spec.fall ?? 0;
    const moved = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    return {
      update(frame, dt) {
        velocity
          .copy(frame.east)
          .multiplyScalar(drift.e * drift.speed)
          .addScaledVector(frame.north, drift.n * drift.speed)
          .addScaledVector(frame.up, -fall);
        moved.addScaledVector(velocity, dt);
        const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
        const array = attribute.array as Float32Array;
        const eye = frame.eye;
        for (let k = 0; k < array.length; k += 3) {
          // A little wander of its own on top of the drift, so a box of them
          // is not a lattice sliding by.
          const sway = Math.sin(frame.time * 0.3 + k) * 0.5;
          array[k] = eye.x + wrap(offsets[k]! + moved.x + sway - eye.x, box);
          array[k + 1] = eye.y + wrap(offsets[k + 1]! + moved.y - eye.y, box);
          array[k + 2] = eye.z + wrap(offsets[k + 2]! + moved.z + sway * 0.6 - eye.z, box);
        }
        attribute.needsUpdate = true;
      },
    };
  }

  /** Where a tangent-plane coordinate is in the world: east, north, and up from the traveller's ground. */
  const place = (frame: Frame, e: number, n: number, up: number, out: THREE.Vector3): THREE.Vector3 =>
    out.copy(frame.player).addScaledVector(frame.east, e).addScaledVector(frame.north, n).addScaledVector(frame.up, up);

  /**
   * Racing cirrus: thin strokes high over the traveller, torn along the wind,
   * fading from a bright head to nothing at the tail, and moving fast.
   */
  function streaks(spec: AmbientSpec, color: THREE.Color): System {
    const count = Math.max(1, spec.count);
    const positions = new Float32Array(count * 6);
    const colors = new Float32Array(count * 6);
    const seeds = Array.from({ length: count }, () => ({
      e: rng.range(0, STREAK_BOX),
      n: rng.range(0, STREAK_BOX),
      up: rng.range(30, 110),
      length: rng.range(18, 60) * (spec.size ?? 1),
      pace: rng.range(0.7, 1.3),
    }));
    for (let k = 0; k < count; k++) {
      // Additive: black is nothing, so the tail fades to it.
      colors.set([color.r, color.g, color.b, 0, 0, 0], k * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    material.userData.outlineParameters = { visible: false };
    disposables.push(geometry, material);
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    group.add(lines);
    const drift = driftOf(spec, 30);
    const head = new THREE.Vector3();
    let travelled = 0;
    return {
      update(frame, dt) {
        travelled += drift.speed * dt;
        const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
        const array = attribute.array as Float32Array;
        seeds.forEach((s, k) => {
          const e = wrap(s.e + drift.e * travelled * s.pace - frame.walkedE, STREAK_BOX);
          const n = wrap(s.n + drift.n * travelled * s.pace - frame.walkedN, STREAK_BOX);
          place(frame, e, n, s.up, head);
          array[k * 6] = head.x;
          array[k * 6 + 1] = head.y;
          array[k * 6 + 2] = head.z;
          head.addScaledVector(frame.east, -drift.e * s.length).addScaledVector(frame.north, -drift.n * s.length);
          array[k * 6 + 3] = head.x;
          array[k * 6 + 4] = head.y;
          array[k * 6 + 5] = head.z;
        });
        attribute.needsUpdate = true;
      },
    };
  }

  /**
   * Sparkles on the ground: each spot flashes for a moment now and then, on a
   * clock of its own, which is how a facet catching the sun looks to someone
   * walking past it.
   */
  function glints(spec: AmbientSpec, color: THREE.Color): System {
    const count = Math.max(1, spec.count);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = Array.from({ length: count }, () => ({
      e: rng.range(0, GLINT_BOX),
      n: rng.range(0, GLINT_BOX),
      rate: rng.range(0.25, 0.7),
      phase: rng.range(0, Math.PI * 2),
      height: 0,
      cell: '',
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: spec.size ?? 0.6, map: soft(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    material.userData.outlineParameters = { visible: false };
    disposables.push(geometry, material);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    const at = new THREE.Vector3();
    return {
      update(frame) {
        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
        seeds.forEach((s, k) => {
          const e = wrap(s.e - frame.walkedE, GLINT_BOX);
          const n = wrap(s.n - frame.walkedN, GLINT_BOX);
          place(frame, e, n, 0, at);
          // The ground under it is asked again only when it has wrapped to a new place.
          const cell = `${Math.round(s.e - frame.walkedE - e)}:${Math.round(s.n - frame.walkedN - n)}`;
          if (cell !== s.cell) {
            s.cell = cell;
            s.height = frame.groundAt(at);
          }
          at.setLength(frame.radius + s.height + 0.15);
          position.setXYZ(k, at.x, at.y, at.z);
          // A sharp peak once a cycle: most of the time nothing at all.
          const flash = Math.pow(Math.max(0, Math.sin(frame.time * s.rate * Math.PI * 2 + s.phase)), 60) * 3;
          colour.setXYZ(k, color.r * flash, color.g * flash, color.b * flash);
        });
        position.needsUpdate = true;
        colour.needsUpdate = true;
      },
    };
  }

  /**
   * A bolt on the horizon: a jagged line from a cloud base to the ground and a
   * glow round it, flickering twice in a quarter of a second. Where it strikes
   * is drawn at random round the traveller and kept at the odds `where` gives
   * the place, so a belt storms and a zone does not.
   */
  function lightning(spec: AmbientSpec, color: THREE.Color): System {
    const SEGMENTS = 10;
    const positions = new Float32Array(SEGMENTS * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    material.userData.outlineParameters = { visible: false };
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const glowMaterial = new THREE.PointsMaterial({ color: color.clone().multiplyScalar(1.6), size: 420, map: soft(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    glowMaterial.userData.outlineParameters = { visible: false };
    disposables.push(geometry, material, glowGeometry, glowMaterial);
    const bolt = new THREE.LineSegments(geometry, material);
    const glow = new THREE.Points(glowGeometry, glowMaterial);
    bolt.frustumCulled = false;
    glow.frustumCulled = false;
    bolt.visible = false;
    glow.visible = false;
    group.add(bolt, glow);
    const perMinute = Math.max(0.01, spec.rate ?? Math.max(1, spec.count));
    let next = rng.range(1, 60 / perMinute);
    let age = Infinity;
    const top = new THREE.Vector3();
    const point = new THREE.Vector3();
    const strike = new THREE.Vector3();
    return {
      update(frame, dt) {
        next -= dt;
        age += dt;
        if (next <= 0) {
          // Exponential gaps: a storm has no metronome.
          next = -Math.log(1 - rng.unit() * 0.999) * (60 / perMinute);
          for (let attempt = 0; attempt < 6; attempt++) {
            const a = rng.range(0, Math.PI * 2);
            const d = rng.range(450, 1900);
            place(frame, Math.sin(a) * d, Math.cos(a) * d, 0, strike);
            const n = strike.clone().normalize();
            const odds = spec.where === undefined ? 1 : spec.where(latOf(n.y), lonOf(n.x, n.z));
            if (rng.unit() > odds) continue;
            strike.setLength(frame.radius + frame.groundAt(strike));
            const up = n;
            const side = new THREE.Vector3().crossVectors(up, frame.north).normalize();
            const height = rng.range(220, 420);
            top.copy(strike).addScaledVector(up, height);
            const array = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
            let from = top.clone();
            for (let k = 0; k < SEGMENTS; k++) {
              const t = (k + 1) / SEGMENTS;
              point.copy(top).lerp(strike, t);
              if (k < SEGMENTS - 1) point.addScaledVector(side, rng.range(-1, 1) * height * 0.08).addScaledVector(frame.north, rng.range(-1, 1) * height * 0.05);
              array.set([from.x, from.y, from.z, point.x, point.y, point.z], k * 6);
              from = point.clone();
            }
            geometry.getAttribute('position').needsUpdate = true;
            const glowAt = glowGeometry.getAttribute('position') as THREE.BufferAttribute;
            glowAt.setXYZ(0, (top.x + strike.x) / 2, (top.y + strike.y) / 2, (top.z + strike.z) / 2);
            glowAt.needsUpdate = true;
            age = 0;
            break;
          }
        }
        // Two flickers and a fade.
        const on = age < 0.07 || (age > 0.12 && age < 0.26);
        bolt.visible = on;
        glow.visible = age < 0.45;
        glowMaterial.opacity = Math.max(0, 1 - age / 0.45);
      },
    };
  }

  /**
   * Haze: big soft sheets of murk hanging at a few heights over the ground,
   * drifting slowly and passing as the traveller walks through them.
   */
  function haze(spec: AmbientSpec, color: THREE.Color): System {
    const count = Math.max(1, spec.count);
    const positions = new Float32Array(count * 3);
    const seeds = Array.from({ length: count }, () => ({
      e: rng.range(0, HAZE_BOX),
      n: rng.range(0, HAZE_BOX),
      up: rng.range(3, 36),
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size: spec.size ?? 90, map: soft(), transparent: true, opacity: 0.16, depthWrite: false });
    material.userData.outlineParameters = { visible: false };
    disposables.push(geometry, material);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 2;
    group.add(points);
    const drift = driftOf(spec, 1.2);
    let travelled = 0;
    const at = new THREE.Vector3();
    const ground = { height: 0, clock: Infinity };
    return {
      update(frame, dt) {
        travelled += drift.speed * dt;
        ground.clock += dt;
        if (ground.clock > 0.5) {
          ground.clock = 0;
          ground.height = frame.groundAt(frame.player);
        }
        const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
        seeds.forEach((s, k) => {
          const e = wrap(s.e + drift.e * travelled - frame.walkedE, HAZE_BOX);
          const n = wrap(s.n + drift.n * travelled - frame.walkedN, HAZE_BOX);
          place(frame, e, n, 0, at);
          at.setLength(frame.radius + ground.height + s.up);
          attribute.setXYZ(k, at.x, at.y, at.z);
        });
        attribute.needsUpdate = true;
      },
    };
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
