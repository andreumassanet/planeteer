/** Lighthouse beams: for each lamp near the camera and in the dark, two cones, the lantern's glass and a halo, rewritten into a fixed buffer each frame. */
import * as THREE from 'three';
import { nightAt } from '../lights.ts';
import { createBeamMaterial } from './beam-material.ts';
import type { Nearest } from './nearest.ts';

/** Lighthouses whose beams are drawn, nearest first, and how far off one still sweeps the sky. */
export const MAX_BEAMS = 6;
export const BEAM_REACH = 9000;
/**
 * A beam's shape: its length, its radius at the lamp and at the end, and how
 * far it dips over that length. The light is a gaussian across the cone
 * (`BEAM_FRAGMENT`), so these are where it has faded out, not an edge.
 */
const BEAM_LENGTH = 170;
const BEAM_ROOT = 0.8;
const BEAM_END = 12;
const BEAM_DIP = 0.015;
/** Sides of the cone the shaft is drawn in: the light is round whatever the polygon is. */
const BEAM_SIDES = 8;
/** Eight seconds a turn, two beams: a flash every four seconds, as a real light's character is. */
const BEAM_SPEED = (Math.PI * 2) / 8;
/**
 * The lantern room's glass, lit from inside: a shell just outside the
 * lantern's column (`lighthouse` in `countryside-kit.ts`: radius 1.25 on ten
 * sides, 2.3 tall, centred on the beacon), wide enough to clear that column's
 * corners at any yaw and under the gallery's rail at 1.6.
 */
const GLASS_RADIUS = 1.25 / Math.cos(Math.PI / 10) + 0.05;
const GLASS_HALF = 1.12;
const GLASS_SIDES = 10;
/** The halo round the lamp: its radius, never under a few pixels far off, and how far towards the eye it stands, clear of the gallery. */
const HALO_RADIUS = 6;
const HALO_PIXELS = 0.005;
const HALO_FORWARD = 3;
/** How sharply the lamp flashes as a beam passes the eye: across the horizon, and above or below it. */
const FLASH_SHARP = 60;
const FLASH_ELEVATION = 0.35;
/** Vertices a lighthouse takes: two cones, the glass and the halo. */
const BEACON_VERTICES = 2 * BEAM_SIDES * 6 + GLASS_SIDES * 6 + 6;
/** How far out the cone is drawn at a fraction of its length: past the polygon's flats, so the light's own fade is the edge. */
const GEOMETRY_WIDEN = 1.02 / Math.cos(Math.PI / BEAM_SIDES);

export interface Beams {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  attributes: THREE.BufferAttribute[];
  /** Lighthouses drawn by the last `write`. */
  lighthouses(): number;
  /** Writes the nearest lamps that are lit, round the mesh's own position; returns the vertices written. */
  write(clock: number): number;
  show(vertices: number): void;
  setTime(seconds: number): void;
}

export function createBeams(nearest: Nearest): Beams {
  const beamVertices = MAX_BEAMS * BEACON_VERTICES;
  const geometry = new THREE.BufferGeometry();
  const beamPosition = new THREE.BufferAttribute(new Float32Array(beamVertices * 3), 3);
  const beamApex = new THREE.BufferAttribute(new Float32Array(beamVertices * 4), 4);
  const beamAxis = new THREE.BufferAttribute(new Float32Array(beamVertices * 4), 4);
  const beamShape = new THREE.BufferAttribute(new Float32Array(beamVertices * 4), 4);
  const attributes = [beamPosition, beamApex, beamAxis, beamShape];
  for (const attribute of attributes) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', beamPosition);
  geometry.setAttribute('beamApex', beamApex);
  geometry.setAttribute('beamAxis', beamAxis);
  geometry.setAttribute('beamShape', beamShape);
  geometry.setDrawRange(0, 0);
  const material = createBeamMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'country-beams';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  mesh.visible = false;

  const hub = new THREE.Vector3();
  const upward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lampUp = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const rim = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const ways = [new THREE.Vector3(), new THREE.Vector3()];
  /** Where the next vertex goes, and what every vertex of the piece being written carries. */
  let cursor = 0;
  const apex = new THREE.Vector3();
  let strength = 0;
  const axisOut = new THREE.Vector3();
  let kind = 0;
  const shape = new THREE.Vector4();
  let beamLighthouses = 0;

  function vertex(x: number, y: number, z: number): void {
    const position = beamPosition.array as Float32Array;
    const a = beamApex.array as Float32Array;
    const b = beamAxis.array as Float32Array;
    const c = beamShape.array as Float32Array;
    position[cursor * 3] = x;
    position[cursor * 3 + 1] = y;
    position[cursor * 3 + 2] = z;
    const four = cursor * 4;
    a[four] = apex.x;
    a[four + 1] = apex.y;
    a[four + 2] = apex.z;
    a[four + 3] = strength;
    b[four] = axisOut.x;
    b[four + 1] = axisOut.y;
    b[four + 2] = axisOut.z;
    b[four + 3] = kind;
    c[four] = shape.x;
    c[four + 1] = shape.y;
    c[four + 2] = shape.z;
    c[four + 3] = shape.w;
    cursor++;
  }

  /**
   * A frustum of a cone round `along` from `from`, `length` long, `r0` to `r1`
   * across, open at both ends and wound so its front faces look outward: the
   * frame (e1, e2, along) is right-handed, and each quad is (00, 01, 11),
   * (00, 11, 10), whose normal is the rim's own outward direction.
   */
  function frustum(from: THREE.Vector3, along: THREE.Vector3, length: number, r0: number, r1: number, sides: number): void {
    e1.copy(along).cross(lampUp);
    if (e1.lengthSq() < 1e-8) e1.set(1, 0, 0).projectOnPlane(along);
    if (e1.lengthSq() < 1e-8) e1.set(0, 0, 1).projectOnPlane(along);
    e1.normalize();
    e2.crossVectors(along, e1);
    tip.copy(from).addScaledVector(along, length);
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const x00 = from.x + (e1.x * c0 + e2.x * s0) * r0;
      const y00 = from.y + (e1.y * c0 + e2.y * s0) * r0;
      const z00 = from.z + (e1.z * c0 + e2.z * s0) * r0;
      const x01 = from.x + (e1.x * c1 + e2.x * s1) * r0;
      const y01 = from.y + (e1.y * c1 + e2.y * s1) * r0;
      const z01 = from.z + (e1.z * c1 + e2.z * s1) * r0;
      const x10 = tip.x + (e1.x * c0 + e2.x * s0) * r1;
      const y10 = tip.y + (e1.y * c0 + e2.y * s0) * r1;
      const z10 = tip.z + (e1.z * c0 + e2.z * s0) * r1;
      const x11 = tip.x + (e1.x * c1 + e2.x * s1) * r1;
      const y11 = tip.y + (e1.y * c1 + e2.y * s1) * r1;
      const z11 = tip.z + (e1.z * c1 + e2.z * s1) * r1;
      vertex(x00, y00, z00);
      vertex(x01, y01, z01);
      vertex(x11, y11, z11);
      vertex(x00, y00, z00);
      vertex(x11, y11, z11);
      vertex(x10, y10, z10);
    }
  }

  /** The two beams of a lamp, opposite each other; returns how brightly the eye sees the lamp flash. */
  function writeShafts(angle: number, dark: number, flat: THREE.Vector3, flatLength: number): number {
    let flash = 0;
    for (let half = 0; half < 2; half++) {
      const way = angle + half * Math.PI;
      const heading = ways[half]!;
      heading.copy(east).multiplyScalar(Math.cos(way)).addScaledVector(north, Math.sin(way)).addScaledVector(lampUp, -BEAM_DIP).normalize();
      if (flatLength > 1e-6) {
        const facing = Math.max(0, heading.dot(flat) * Math.hypot(1, BEAM_DIP));
        flash = Math.max(flash, Math.pow(facing, FLASH_SHARP));
      }
      // Is the eye inside this cone? Then its back faces are the ones drawn.
      rim.copy(hub).negate();
      const along = rim.dot(heading);
      let inside = 0;
      if (along > 0 && along < BEAM_LENGTH) {
        const radius = (BEAM_ROOT + ((BEAM_END - BEAM_ROOT) * along) / BEAM_LENGTH) * GEOMETRY_WIDEN;
        if (rim.addScaledVector(heading, -along).lengthSq() < radius * radius) inside = 1;
      }
      apex.copy(hub);
      strength = dark;
      axisOut.copy(heading);
      kind = 0;
      shape.set(BEAM_ROOT, BEAM_END, BEAM_LENGTH, inside);
      frustum(hub, heading, BEAM_LENGTH, BEAM_ROOT * GEOMETRY_WIDEN, BEAM_END * GEOMETRY_WIDEN, BEAM_SIDES);
    }
    return flash;
  }

  /** The halo: a card square to the eye, level with the horizon, stood in front of the lantern so the glass does not cut it. */
  function writeHalo(dark: number, flash: number, eyeDistance: number): void {
    const size = Math.max(HALO_RADIUS, eyeDistance * HALO_PIXELS) * Math.min(1, eyeDistance / (HALO_RADIUS * 4));
    if (eyeDistance <= HALO_FORWARD * 2) return;
    right.crossVectors(lampUp, toEye);
    if (right.lengthSq() < 1e-8) right.copy(east);
    right.normalize();
    upward.crossVectors(toEye, right);
    apex.copy(hub).addScaledVector(toEye, HALO_FORWARD);
    strength = dark;
    axisOut.set(0, 0, 0);
    kind = 1;
    const corner = (u: number, v: number): void => {
      shape.set(u, v, dark * flash, 0);
      vertex(
        apex.x + (right.x * u + upward.x * v) * size,
        apex.y + (right.y * u + upward.y * v) * size,
        apex.z + (right.z * u + upward.z * v) * size,
      );
    };
    corner(-1, -1);
    corner(1, -1);
    corner(1, 1);
    corner(-1, -1);
    corner(1, 1);
    corner(-1, 1);
  }

  function write(clock: number): number {
    cursor = 0;
    let drawn = 0;
    for (let i = 0; i < nearest.count; i++) {
      const b = nearest.rows[i]!;
      const o = nearest.at[i]!;
      lampUp.set(b[o + 3]!, b[o + 4]!, b[o + 5]!);
      const night = nightAt(lampUp);
      if (night <= 0.01) continue;
      // Nothing by day, a thread at dusk, the whole shaft once it is dark.
      const dark = Math.pow(night, 1.5);
      drawn++;
      hub.set(b[o]! - mesh.position.x, b[o + 1]! - mesh.position.y, b[o + 2]! - mesh.position.z);
      north.set(0, 1, 0).projectOnPlane(lampUp);
      if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(lampUp);
      north.normalize();
      east.crossVectors(lampUp, north).normalize();
      const angle = b[o + 6]! + clock * BEAM_SPEED;
      // The eye as the lamp sees it: its bearing across the horizon and its height over it.
      toEye.copy(hub).negate();
      const eyeDistance = Math.max(1e-3, toEye.length());
      toEye.divideScalar(eyeDistance);
      const elevation = Math.asin(Math.max(-1, Math.min(1, toEye.dot(lampUp))));
      flat.copy(toEye).addScaledVector(lampUp, -toEye.dot(lampUp));
      const flatLength = flat.length();
      if (flatLength > 1e-6) flat.divideScalar(flatLength);
      let flash = writeShafts(angle, dark, flat, flatLength);
      flash *= Math.exp(-((elevation / FLASH_ELEVATION) ** 2));

      // The glass, lit from inside, hottest where a beam leaves it.
      apex.copy(hub);
      strength = dark * (1 + flash);
      axisOut.copy(ways[0]!);
      kind = 2;
      shape.set(lampUp.x, lampUp.y, lampUp.z, GLASS_HALF);
      lift.copy(hub).addScaledVector(lampUp, -GLASS_HALF);
      frustum(lift, lampUp, GLASS_HALF * 2, GLASS_RADIUS, GLASS_RADIUS, GLASS_SIDES);

      writeHalo(dark, flash, eyeDistance);
    }
    beamLighthouses = drawn;
    return cursor;
  }

  function show(vertices: number): void {
    geometry.setDrawRange(0, vertices);
    mesh.visible = vertices > 0;
  }

  return {
    mesh,
    material,
    attributes,
    lighthouses: () => beamLighthouses,
    write,
    show,
    setTime: (seconds) => {
      material.uniforms.uTime!.value = seconds;
    },
  };
}
