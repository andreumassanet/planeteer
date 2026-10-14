/** The three meshes the small life is drawn with, their arrays, and the writer that fills them. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { birdGeometry } from '../life.ts';
import { MAX_BUTTERFLIES, MAX_FISH, MAX_GULLS, MAX_LEAVES, MAX_LITTER, MAX_POINTS } from './constants.ts';
import { bodyMaterial, lightMaterial, litterMaterial } from './materials.ts';
import type { AmbientState, Buffers, Writer } from './types.ts';

export function createBuffers(): Buffers {
  const group = new THREE.Group();
  group.name = 'ambient';

  // The lights.
  const lightPosition = new Float32Array(MAX_POINTS * 3);
  const lightGlow = new Float32Array(MAX_POINTS);
  const lightSize = new Float32Array(MAX_POINTS);
  const lightKind = new Float32Array(MAX_POINTS);
  const lightGeometry = new THREE.BufferGeometry();
  const lightAttributes = [
    new THREE.BufferAttribute(lightPosition, 3),
    new THREE.BufferAttribute(lightGlow, 1),
    new THREE.BufferAttribute(lightSize, 1),
    new THREE.BufferAttribute(lightKind, 1),
  ];
  for (const attribute of lightAttributes) attribute.setUsage(THREE.DynamicDrawUsage);
  lightGeometry.setAttribute('position', lightAttributes[0]!);
  lightGeometry.setAttribute('glow', lightAttributes[1]!);
  lightGeometry.setAttribute('spot', lightAttributes[2]!);
  lightGeometry.setAttribute('kind', lightAttributes[3]!);
  lightGeometry.setDrawRange(0, 0);
  const lightMat = lightMaterial();
  const lights = new THREE.Points(lightGeometry, lightMat);
  lights.name = 'ambient-lights';
  lights.frustumCulled = false;
  lights.renderOrder = 2;
  lights.visible = false;
  group.add(lights);

  // The bodies: loose triangles, rewritten each frame.
  const gull = birdGeometry(PALETTE.bone, PALETTE.white);
  const gullVertices = gull.position.length / 3;
  const MAX_VERTICES =
    MAX_BUTTERFLIES * 4 * 3 + MAX_LEAVES * 2 * 3 + MAX_FISH * 3 * 3 + MAX_GULLS * gullVertices;
  const bodyPosition = new Float32Array(MAX_VERTICES * 3);
  const bodyNormal = new Float32Array(MAX_VERTICES * 3);
  const bodyColor = new Float32Array(MAX_VERTICES * 3);
  const bodyGeometry = new THREE.BufferGeometry();
  const bodyAttributes = [
    new THREE.BufferAttribute(bodyPosition, 3),
    new THREE.BufferAttribute(bodyNormal, 3),
    new THREE.BufferAttribute(bodyColor, 3),
  ];
  for (const attribute of bodyAttributes) attribute.setUsage(THREE.DynamicDrawUsage);
  bodyGeometry.setAttribute('position', bodyAttributes[0]!);
  bodyGeometry.setAttribute('normal', bodyAttributes[1]!);
  bodyGeometry.setAttribute('color', bodyAttributes[2]!);
  bodyGeometry.setDrawRange(0, 0);
  const bodyMat = bodyMaterial();
  const bodies = new THREE.Mesh(bodyGeometry, bodyMat);
  bodies.name = 'ambient-bodies';
  // Spread over a few hundred units and every vertex moves every frame.
  bodies.frustumCulled = false;
  bodies.visible = false;
  group.add(bodies);

  // The litter: flat leaves on the ground, rewritten when the crowns move.
  const LITTER_VERTICES = MAX_LITTER * 6;
  const litterPosition = new Float32Array(LITTER_VERTICES * 3);
  const litterNormal = new Float32Array(LITTER_VERTICES * 3);
  const litterColor = new Float32Array(LITTER_VERTICES * 3);
  const litterGeometry = new THREE.BufferGeometry();
  const litterAttributes = [
    new THREE.BufferAttribute(litterPosition, 3),
    new THREE.BufferAttribute(litterNormal, 3),
    new THREE.BufferAttribute(litterColor, 3),
  ];
  for (const attribute of litterAttributes) attribute.setUsage(THREE.DynamicDrawUsage);
  litterGeometry.setAttribute('position', litterAttributes[0]!);
  litterGeometry.setAttribute('normal', litterAttributes[1]!);
  litterGeometry.setAttribute('color', litterAttributes[2]!);
  litterGeometry.setDrawRange(0, 0);
  const litterMat = litterMaterial();
  const litter = new THREE.Mesh(litterGeometry, litterMat);
  litter.name = 'ambient-litter';
  litter.frustumCulled = false;
  // Under the crowns' own shadow, which is most of what makes it lie there.
  litter.receiveShadow = true;
  litter.visible = false;
  group.add(litter);

  return {
    group, lights, lightMat, lightGeometry, lightAttributes, lightPosition, lightGlow, lightSize, lightKind,
    gull, gullVertices, MAX_VERTICES, bodies, bodyMat, bodyGeometry, bodyAttributes, bodyPosition, bodyNormal, bodyColor,
    litter, litterMat, litterGeometry, litterAttributes, litterPosition, litterNormal, litterColor,
  };
}

/** Appends to the lights and to the body triangles, at the cursors in `state`. */
export function createWriter(buffers: Buffers, state: AmbientState): Writer {
  const { lightPosition, lightGlow, lightSize, lightKind, bodyPosition, bodyNormal, bodyColor, MAX_VERTICES } = buffers;

  function light(at: THREE.Vector3, glow: number, size: number, kind: number): void {
    if (glow < 0.004 || state.lightCursor >= MAX_POINTS) return;
    const i = state.lightCursor++;
    lightPosition[i * 3] = at.x;
    lightPosition[i * 3 + 1] = at.y;
    lightPosition[i * 3 + 2] = at.z;
    lightGlow[i] = glow;
    lightSize[i] = size;
    lightKind[i] = kind;
  }

  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color): void {
    if (state.vertexCursor + 3 > MAX_VERTICES) return;
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    vertex(a, nx, ny, nz, colour);
    vertex(b, nx, ny, nz, colour);
    vertex(c, nx, ny, nz, colour);
  }

  function vertex(p: THREE.Vector3, nx: number, ny: number, nz: number, colour: THREE.Color): void {
    const o = state.vertexCursor * 3;
    bodyPosition[o] = p.x;
    bodyPosition[o + 1] = p.y;
    bodyPosition[o + 2] = p.z;
    bodyNormal[o] = nx;
    bodyNormal[o + 1] = ny;
    bodyNormal[o + 2] = nz;
    bodyColor[o] = colour.r;
    bodyColor[o + 1] = colour.g;
    bodyColor[o + 2] = colour.b;
    state.vertexCursor++;
  }

  return { light, triangle, vertex };
}
