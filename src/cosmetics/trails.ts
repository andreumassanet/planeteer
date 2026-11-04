/**
 * What follows a traveller about: sparkles at the feet, petals, bubbles,
 * embers, confetti, a rainbow ribbon behind a vehicle (`TRAILS` in
 * `catalogue.ts`).
 *
 * One pool and one draw call for every traveller near: an instanced
 * twenty-faced ball on the world's toon ramp, stretched, flattened and turned
 * per particle, drawn without ink (the pen is screen space, and a particle
 * ends by shrinking). Embers and sparkles add their own colour to the light
 * (`atlasGlow`), so they read at night.
 *
 * Emission is frame-rate independent, as the effects' are (`effects.ts`): an
 * emitter owes one particle every `spacing` units it moves, placed where it
 * was at that instant and aged by what is left of the frame, and a trickle by
 * time while it stands; a move faster than anything travels is a jump and
 * lays nothing. The spacing opens with speed so no emitter lays more than
 * `MAX_RATE` a second. A full pool refuses and counts it. Particles are kept
 * in doubles and written relative to the mesh, which rides with the viewer,
 * so float32 keeps millimetres on a planet thousands of units across.
 */
import * as THREE from 'three';
import { craftContext } from '../craft/build.ts';
import { PALETTE } from '../theme.ts';
import { TRAILS, cosmeticAt } from './catalogue.ts';
import { advance, createPool, spawn, write, type TrailKind } from './particles.ts';

export type { TrailKind } from './particles.ts';

/** The pool, across every emitter. */
export const MAX_TRAIL_PARTICLES = 480;
/** No emitter lays more than this many a second, however fast it goes. */
export const MAX_RATE = 24;
/** Only travellers this near the viewer emit, units. */
export const TRAIL_REACH = 450;
/** A move faster than this, units a second, is a jump: boarding, a teleport, a late pose. */
export const JUMP_SPEED = 900;
/** Under this speed an emitter is standing, units a second. */
const STANDING = 0.6;

export interface TrailEmitter {
  /** Stable for one traveller: `'hero'`, `'peer:<id>'`. */
  key: string;
  /** Where the trail comes off: the feet, or the vehicle's base, in world space. */
  position: THREE.Vector3;
  /** Away from the planet, unit. */
  up: THREE.Vector3;
  /** World units a second. */
  velocity: THREE.Vector3;
  /** The look's `trail`; 0 lays nothing. */
  trail: number;
  inVehicle: boolean;
}

/** By catalogue id. */
export const TRAIL_KINDS: Readonly<Record<string, TrailKind>> = {
  'trail-sparkles': {
    spacing: [0.9, 2.6], idle: 2.5, burst: 1, life: 0.9, size: [0.11, 0.22], stretch: [0.55, 1.6, 0.55],
    colours: [PALETTE.gold, PALETTE.white, PALETTE.apricot], glow: 0.7, rise: 0.9, scatter: 0.35, gravity: -0.4, drag: 1.5, spin: 4, spread: 0.45,
  },
  'trail-petals': {
    spacing: [0.7, 1.8], idle: 1.2, burst: 1, life: 1.9, size: [0.13, 0.24], stretch: [1.2, 0.22, 0.85],
    colours: [PALETTE.pink, PALETTE.white, PALETTE.salmon, PALETTE.cream], glow: 0, rise: 0.8, scatter: 0.7, gravity: 0.7, drag: 1.2, spin: 3, spread: 0.5,
  },
  'trail-bubbles': {
    spacing: [0.8, 2.2], idle: 1.8, burst: 1, life: 1.4, size: [0.1, 0.2], stretch: [1, 1, 1],
    colours: [PALETTE.skyBlue, PALETTE.white, PALETTE.cream], glow: 0.25, rise: 1.3, scatter: 0.3, gravity: -0.5, drag: 0.8, spin: 0.5, spread: 0.45,
  },
  'trail-embers': {
    spacing: [0.6, 1.7], idle: 3, burst: 1, life: 1.1, size: [0.08, 0.16], stretch: [0.8, 1.1, 0.8],
    colours: [PALETTE.orange, PALETTE.red, PALETTE.gold], glow: 0.9, rise: 1.8, scatter: 0.4, gravity: -0.6, drag: 1.8, spin: 5, spread: 0.35,
  },
  'trail-confetti': {
    spacing: [0.9, 2.2], idle: 0, burst: 2, life: 1.6, size: [0.11, 0.2], stretch: [1, 0.14, 0.7],
    colours: [PALETTE.crimson, PALETTE.gold, PALETTE.skyBlue, PALETTE.green, PALETTE.violet, PALETTE.pink, PALETTE.orange], glow: 0.1, rise: 2.4, scatter: 1.5, gravity: 3.2, drag: 1.4, spin: 7, spread: 0.3,
  },
  'trail-rainbow': {
    spacing: [0.7, 1.4], idle: 0, burst: 6, life: 1.0, size: [0.09, 0.2], stretch: [0.5, 1, 1],
    colours: [PALETTE.red, PALETTE.orange, PALETTE.gold, PALETTE.green, PALETTE.skyBlue, PALETTE.violet], glow: 0.35, rise: 0, scatter: 0, gravity: 0, drag: 0, spin: 0, spread: 0, ribbon: true,
  },
};

export interface TrailStats {
  live: number;
  /** Particles asked for with the pool full, since the start. */
  refused: number;
  /** Emitters in reach this frame. */
  emitters: number;
}

export interface Trails {
  readonly mesh: THREE.InstancedMesh;
  readonly stats: TrailStats;
  /** Every frame, with every traveller who might emit; `viewer` is the camera, for the reach. */
  update(dt: number, emitters: readonly TrailEmitter[], viewer?: THREE.Vector3): void;
  clear(): void;
  dispose(): void;
}

/** The particle's ball: twenty faces, flat-shaded. */
function ballGeometry(): THREE.BufferGeometry {
  const ball = new THREE.IcosahedronGeometry(1, 0);
  const flat = ball.index === null ? ball : ball.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** The toon material with each instance's colour added to the light by `atlasGlow`. */
function trailMaterial(): THREE.MeshToonMaterial {
  const source = craftContext().toon(PALETTE.ink);
  const material = new THREE.MeshToonMaterial({ gradientMap: source.gradientMap });
  material.name = 'trails';
  // A particle has no hull: it shrinks away, and the pen is a share of the screen.
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float atlasGlow;\nvarying float vAtlasGlow;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vAtlasGlow = atlasGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAtlasGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vAtlasGlow;');
  };
  material.customProgramCacheKey = () => 'atlas-trails';
  return material;
}

interface EmitterState {
  last: Float64Array;
  carry: number;
  idle: number;
  seen: number;
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

/** The scratch for an emitter's frame. */
const U = new THREE.Vector3();
const F = new THREE.Vector3();

/** One emission of `kind`, `burst` particles (a ribbon's bands), at (x, y, z). */
function emit(p: ReturnType<typeof createPool>, kind: TrailKind, x: number, y: number, z: number, upV: THREE.Vector3, ahead: THREE.Vector3, aged: number, inVehicle: boolean, spacing: number): void {
  for (let b = 0; b < kind.burst; b++) spawn(p, kind, x, y, z, upV, ahead, b, aged, inVehicle, spacing);
}


/** One emitter's frame: what it owes since the last, by the way it moved or by the time it stood. */
function emitFrom(p: ReturnType<typeof createPool>, states: Map<string, EmitterState>, clock: number, e: TrailEmitter, dt: number): void {
  const item = cosmeticAt('trail', e.trail);
  const kind = item === null ? undefined : TRAIL_KINDS[item.id];
  let state = states.get(e.key);
  if (state === undefined) {
    state = { last: new Float64Array([e.position.x, e.position.y, e.position.z]), carry: 0, idle: 0, seen: clock };
    states.set(e.key, state);
    return;
  }
  state.seen = clock;
  const [lx, ly, lz] = [state.last[0]!, state.last[1]!, state.last[2]!];
  const dx = e.position.x - lx;
  const dy = e.position.y - ly;
  const dz = e.position.z - lz;
  const moved = Math.hypot(dx, dy, dz);
  state.last[0] = e.position.x;
  state.last[1] = e.position.y;
  state.last[2] = e.position.z;
  if (kind === undefined || dt <= 0) return;
  if (moved > JUMP_SPEED * dt + 5) {
    state.carry = 0;
    return;
  }
  const u = U.copy(e.up).normalize();
  const f = F;
  f.copy(e.velocity).addScaledVector(u, -e.velocity.dot(u));
  if (f.lengthSq() < 1e-8) f.set(dx, dy, dz).addScaledVector(u, -(dx * u.x + dy * u.y + dz * u.z));
  // Standing still with no way to face: any direction across the up will do.
  if (f.lengthSq() < 1e-8) f.copy(Math.abs(u.y) < 0.9 ? Y : X).addScaledVector(u, Math.abs(u.y) < 0.9 ? -u.y : -u.x);
  f.normalize();
  const speed = dt > 0 ? moved / dt : 0;
  if (speed < STANDING) {
    state.carry = 0;
    if (e.inVehicle || kind.idle <= 0) return;
    state.idle += dt * kind.idle;
    while (state.idle >= 1) {
      state.idle -= 1;
      emit(p, kind, e.position.x, e.position.y, e.position.z, u, f, state.idle / kind.idle, false, kind.spacing[0]);
    }
    return;
  }
  state.idle = 0;
  const spacing = Math.max(kind.spacing[e.inVehicle ? 1 : 0], speed / MAX_RATE);
  state.carry += moved;
  while (state.carry >= spacing) {
    state.carry -= spacing;
    // Where it was when this one was owed, and how long ago that was.
    const t = moved > 0 ? 1 - state.carry / moved : 1;
    const aged = (1 - t) * dt;
    emit(p, kind, lx + dx * t, ly + dy * t, lz + dz * t, u, f, aged, e.inVehicle, spacing);
  }
}

export function createTrails(scene: THREE.Object3D): Trails {
  const N = MAX_TRAIL_PARTICLES;
  const geometry = ballGeometry();
  const material = trailMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, N);
  mesh.name = 'trails';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('atlasGlow', glow);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const pool = createPool(N, 0x7a11);
  const stats: TrailStats = { live: 0, refused: 0, emitters: 0 };
  const states = new Map<string, EmitterState>();
  const anchor = new THREE.Vector3();
  let clock = 0;

  return {
    mesh,
    stats,
    update(dt, emitters, viewer) {
      const step = Math.max(0, Math.min(0.25, dt));
      clock += step;
      advance(pool, step);
      let near = 0;
      for (const e of emitters) {
        if (viewer !== undefined && e.position.distanceToSquared(viewer) > TRAIL_REACH * TRAIL_REACH) {
          states.delete(e.key);
          continue;
        }
        near++;
        emitFrom(pool, states, clock, e, step);
      }
      for (const [key, state] of states) if (clock - state.seen > 2) states.delete(key);
      stats.emitters = near;
      if (viewer !== undefined) anchor.copy(viewer);
      else if (emitters[0] !== undefined) anchor.copy(emitters[0].position);
      write(pool, mesh, glow, anchor);
      stats.live = pool.live;
      stats.refused = pool.refused;
    },
    clear() {
      pool.live = 0;
      mesh.count = 0;
      states.clear();
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/** Whether every trail in the catalogue has a kind. */
export const TRAILED = TRAILS.every((item) => TRAIL_KINDS[item.id] !== undefined);
