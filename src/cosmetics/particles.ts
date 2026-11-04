/**
 * The trails' particles: a fixed pool in typed arrays, the live ones first,
 * swapped out when they die, so nothing is allocated a frame. Positions are
 * doubles, written to the mesh relative to an anchor beside the viewer.
 */
import * as THREE from 'three';

/** How one trail behaves. Lengths in world units, times in seconds. */
export interface TrailKind {
  /** Units between two emissions, on foot and in a vehicle. */
  spacing: readonly [number, number];
  /** Emissions a second while standing on foot. */
  idle: number;
  /** Particles an emission. */
  burst: number;
  life: number;
  /** The particle's size, on foot and in a vehicle, and its stretch (across, up, along). */
  size: readonly [number, number];
  stretch: readonly [number, number, number];
  colours: readonly number[];
  /** How much of its own colour it adds to the light, 0 to 1. */
  glow: number;
  /** Speed up off the ground at birth, and scattered sideways. */
  rise: number;
  scatter: number;
  /** Pull towards the ground (negative lifts), and drag, a second. */
  gravity: number;
  drag: number;
  /** Radians a second it tumbles. */
  spin: number;
  /** How far round the emitter it starts, units. */
  spread: number;
  /** A ribbon: stacked bands in its colours, laid along the way it goes, not tumbling. */
  ribbon?: boolean;
}

export interface Pool {
  pos: Float64Array;
  vel: Float32Array;
  up: Float32Array;
  along: Float32Array;
  axis: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  phase: Float32Array;
  /** A ribbon band's length along the way: the spacing it was laid at. */
  length: Float32Array;
  kindOf: (TrailKind | null)[];
  colour: Uint32Array;
  live: number;
  /** Particles asked for with the pool full. */
  refused: number;
  random: () => number;
}

/** A small seeded generator, so a run is the same run every time. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPool(n: number, seed: number): Pool {
  return {
    pos: new Float64Array(n * 3),
    vel: new Float32Array(n * 3),
    up: new Float32Array(n * 3),
    along: new Float32Array(n * 3),
    axis: new Float32Array(n * 3),
    age: new Float32Array(n),
    life: new Float32Array(n),
    size: new Float32Array(n),
    phase: new Float32Array(n),
    length: new Float32Array(n),
    kindOf: new Array<TrailKind | null>(n).fill(null),
    colour: new Uint32Array(n),
    live: 0,
    refused: 0,
    random: generator(seed),
  };
}

const SIDE = new THREE.Vector3();
const AXIS = new THREE.Vector3();
/** The writer's scratch. */
const W = {
  u: new THREE.Vector3(),
  f: new THREE.Vector3(),
  side: new THREE.Vector3(),
  basis: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
  spinQ: new THREE.Quaternion(),
  spinAxis: new THREE.Vector3(),
  at: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  matrix: new THREE.Matrix4(),
  tint: new THREE.Color(),
};

/** One particle of `kind` at (x, y, z), the `band`th of its emission, `aged` seconds old already. */
export function spawn(p: Pool, kind: TrailKind, x: number, y: number, z: number, upV: THREE.Vector3, ahead: THREE.Vector3, band: number, aged: number, inVehicle: boolean, spacing: number): void {
  if (p.live >= p.size.length) {
    p.refused++;
    return;
  }
  const i = p.live++;
  p.kindOf[i] = kind;
  // Round the emitter in its own plane, and up by the band for a ribbon.
  const side = SIDE.crossVectors(upV, ahead).normalize();
  const r = kind.spread * Math.sqrt(p.random());
  const a = p.random() * Math.PI * 2;
  const lift = kind.ribbon === true ? (inVehicle ? 0.35 : 0.2) + band * kind.size[inVehicle ? 1 : 0] * kind.stretch[1] * 1.8 : 0.15 + p.random() * 0.3;
  p.pos[i * 3] = x + side.x * Math.cos(a) * r + ahead.x * Math.sin(a) * r + upV.x * lift;
  p.pos[i * 3 + 1] = y + side.y * Math.cos(a) * r + ahead.y * Math.sin(a) * r + upV.y * lift;
  p.pos[i * 3 + 2] = z + side.z * Math.cos(a) * r + ahead.z * Math.sin(a) * r + upV.z * lift;
  const sx = (p.random() - 0.5) * 2 * kind.scatter;
  const sz = (p.random() - 0.5) * 2 * kind.scatter;
  const rise = kind.rise * (0.7 + p.random() * 0.6);
  p.vel[i * 3] = upV.x * rise + side.x * sx + ahead.x * sz;
  p.vel[i * 3 + 1] = upV.y * rise + side.y * sx + ahead.y * sz;
  p.vel[i * 3 + 2] = upV.z * rise + side.z * sx + ahead.z * sz;
  upV.toArray(p.up, i * 3);
  ahead.toArray(p.along, i * 3);
  const spinAxis = AXIS.set(p.random() - 0.5, p.random() - 0.5, p.random() - 0.5);
  if (spinAxis.lengthSq() < 1e-6) spinAxis.set(1, 0, 0);
  spinAxis.normalize();
  p.axis[i * 3] = spinAxis.x;
  p.axis[i * 3 + 1] = spinAxis.y;
  p.axis[i * 3 + 2] = spinAxis.z;
  p.age[i] = aged;
  p.life[i] = kind.life * (kind.ribbon === true ? (inVehicle ? 1.3 : 1) : 0.8 + p.random() * 0.4);
  p.size[i] = kind.size[inVehicle ? 1 : 0] * (kind.ribbon === true ? 1 : 0.75 + p.random() * 0.5);
  p.phase[i] = p.random() * Math.PI * 2;
  p.length[i] = spacing;
  p.colour[i] = kind.ribbon === true ? kind.colours[band % kind.colours.length]! : kind.colours[Math.floor(p.random() * kind.colours.length)]!;
}

/** Particle `i` gone: the last live one takes its place. */
export function kill(p: Pool, i: number): void {
  const last = --p.live;
  if (i === last) return;
  p.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
  p.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
  p.up.copyWithin(i * 3, last * 3, last * 3 + 3);
  p.along.copyWithin(i * 3, last * 3, last * 3 + 3);
  p.axis.copyWithin(i * 3, last * 3, last * 3 + 3);
  p.age[i] = p.age[last]!;
  p.life[i] = p.life[last]!;
  p.size[i] = p.size[last]!;
  p.phase[i] = p.phase[last]!;
  p.length[i] = p.length[last]!;
  p.kindOf[i] = p.kindOf[last]!;
  p.colour[i] = p.colour[last]!;
}

/** Every particle `dt` on: older, pulled, dragged and moved; the dead ones dropped. */
export function advance(p: Pool, dt: number): void {
  for (let i = p.live - 1; i >= 0; i--) {
    p.age[i]! += dt;
    if (p.age[i]! >= p.life[i]!) {
      kill(p, i);
      continue;
    }
    const kind = p.kindOf[i]!;
    const damp = Math.exp(-kind.drag * dt);
    for (let k = 0; k < 3; k++) {
      const v = (p.vel[i * 3 + k]! - p.up[i * 3 + k]! * kind.gravity * dt) * damp;
      p.vel[i * 3 + k] = v;
      p.pos[i * 3 + k]! += v * dt;
    }
  }
}

/** Every live particle into the mesh's instances, relative to `anchor`, which the mesh is moved to. */
export function write(p: Pool, mesh: THREE.InstancedMesh, glow: THREE.InstancedBufferAttribute, anchor: THREE.Vector3): void {
  const { u, f, side, basis, q, spinQ, spinAxis, at, scale, matrix, tint } = W;
  mesh.position.copy(anchor);
  mesh.updateMatrixWorld();
  for (let i = 0; i < p.live; i++) {
    const kind = p.kindOf[i]!;
    const t = p.age[i]! / p.life[i]!;
    // In quickly, out over the last part of its life.
    const swell = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.45);
    const s = p.size[i]! * Math.max(0.001, swell);
    u.fromArray(p.up, i * 3);
    f.fromArray(p.along, i * 3);
    side.crossVectors(u, f);
    basis.makeBasis(side, u, f);
    q.setFromRotationMatrix(basis);
    if (kind.spin > 0) {
      spinQ.setFromAxisAngle(spinAxis.fromArray(p.axis, i * 3), p.phase[i]! + p.age[i]! * kind.spin);
      q.multiply(spinQ);
    }
    // A petal sways as it falls.
    const sway = kind.gravity > 0 && kind.ribbon !== true ? Math.sin(p.age[i]! * 3 + p.phase[i]!) * 0.12 : 0;
    at.set(p.pos[i * 3]! - anchor.x, p.pos[i * 3 + 1]! - anchor.y, p.pos[i * 3 + 2]! - anchor.z).addScaledVector(side, sway);
    // A ribbon's band reaches a little past the next, so the bands run on as one.
    if (kind.ribbon === true) scale.set(kind.stretch[0] * s, kind.stretch[1] * s, p.length[i]! * 0.6 * Math.max(0.001, swell));
    else scale.set(kind.stretch[0] * s, kind.stretch[1] * s, kind.stretch[2] * s);
    matrix.compose(at, q, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, tint.set(p.colour[i]!));
    glow.setX(i, kind.glow);
  }
  mesh.count = p.live;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  glow.needsUpdate = true;
}

