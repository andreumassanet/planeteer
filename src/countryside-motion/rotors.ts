/** The turning rotors near the camera: one mesh, rewritten into a fixed buffer each frame. */
import * as THREE from 'three';
import { mergeMeshes } from '../merge.ts';
import { createToonRamp } from '../theme.ts';
import { seeThrough } from '../see-through.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { ROTOR_SPEED, buildRotor } from '../countryside-kit.ts';
import { ROTOR_KINDS } from '../countryside-tile.ts';
import type { Nearest } from './nearest.ts';

/** The most rotors turned at once, nearest first; the coarser tiles hold theirs still. */
export const MAX_ROTORS = 32;

interface Template {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  outline: Float32Array;
  count: number;
}

export interface Rotors {
  mesh: THREE.Mesh;
  material: THREE.MeshToonMaterial;
  attributes: THREE.BufferAttribute[];
  /** Writes the nearest rotors, turned to `clock`, round the mesh's own position; returns the vertices written. */
  write(clock: number): number;
  /** Shows the first `vertices` of the buffer. */
  show(vertices: number): void;
}

export function createRotors(ctx: Pick<SceneryContext, 'THREE' | 'box' | 'column' | 'taper' | 'tone'>, nearest: Nearest): Rotors {
  const templates: Template[] = ROTOR_KINDS.map((kind) => {
    const built = buildRotor(ctx, kind);
    const merged = mergeMeshes(built);
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    return { ...merged, count: merged.position.length / 3 };
  });
  const widest = Math.max(...templates.map((t) => t.count));
  const capacity = MAX_ROTORS * widest;
  const geometry = new THREE.BufferGeometry();
  const rotorPosition = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const rotorNormal = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const rotorColor = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const rotorOutline = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const attributes = [rotorPosition, rotorNormal, rotorColor, rotorOutline];
  for (const attribute of attributes) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', rotorPosition);
  geometry.setAttribute('normal', rotorNormal);
  geometry.setAttribute('color', rotorColor);
  geometry.setAttribute('outlineNormal', rotorOutline);
  geometry.setDrawRange(0, 0);
  const material = shadeByClouds(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) }));
  material.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
  seeThrough(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'country-rotors';
  // Rewritten every frame round the camera: no bounding sphere would be true for long.
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;

  const hub = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const upward = new THREE.Vector3();
  const right = new THREE.Vector3();

  /** A template's vectors turned by the angle about Z, into the rotor's frame, scaled and moved to its hub if they are points. */
  function turn(from: Float32Array, to: Float32Array, cursor: number, count: number, c: number, s: number, k: number, point: boolean): void {
    const ox = point ? hub.x : 0;
    const oy = point ? hub.y : 0;
    const oz = point ? hub.z : 0;
    for (let t = 0; t < count * 3; t += 3) {
      const x = from[t]!;
      const y = from[t + 1]!;
      const z = from[t + 2]!;
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      to[cursor + t] = (right.x * rx + upward.x * ry + axis.x * z) * k + ox;
      to[cursor + t + 1] = (right.y * rx + upward.y * ry + axis.y * z) * k + oy;
      to[cursor + t + 2] = (right.z * rx + upward.z * ry + axis.z * z) * k + oz;
    }
  }

  function write(clock: number): number {
    const position = rotorPosition.array as Float32Array;
    const normal = rotorNormal.array as Float32Array;
    const color = rotorColor.array as Float32Array;
    const outline = rotorOutline.array as Float32Array;
    let cursor = 0;
    for (let i = 0; i < nearest.count; i++) {
      const r = nearest.rows[i]!;
      const o = nearest.at[i]!;
      const kind = r[o + 9]!;
      const template = templates[kind]!;
      const scale = r[o + 11]!;
      const angle = r[o + 10]! + clock * ROTOR_SPEED[ROTOR_KINDS[kind]!];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      hub.set(r[o]! - mesh.position.x, r[o + 1]! - mesh.position.y, r[o + 2]! - mesh.position.z);
      axis.set(r[o + 3]!, r[o + 4]!, r[o + 5]!);
      upward.set(r[o + 6]!, r[o + 7]!, r[o + 8]!);
      // X = Y x Z: the rotor's own frame, right-handed, so nothing mirrors.
      right.crossVectors(upward, axis);
      turn(template.position, position, cursor, template.count, c, s, scale, true);
      turn(template.normal, normal, cursor, template.count, c, s, 1, false);
      turn(template.outline, outline, cursor, template.count, c, s, 1, false);
      color.set(template.color, cursor);
      cursor += template.count * 3;
    }
    return cursor / 3;
  }

  function show(vertices: number): void {
    geometry.setDrawRange(0, vertices);
    mesh.visible = vertices > 0;
  }

  return { mesh, material, attributes, write, show };
}
