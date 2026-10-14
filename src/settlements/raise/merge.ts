import * as THREE from 'three';
import { MACHINE_BED } from '../../craft/parked.ts';
import type { Ground } from '../ground/build.ts';
import { townGlass, townLeaves } from '../meshes.ts';
import type { LeafCard } from '../meshes.ts';
import { LAMP_HEAD } from '../rules.ts';
import type { RaiseJob, RaiseKit } from './job.ts';

/**
 * The town's one buffer: everything standing, transformed into the town's
 * frame, then the floor as its tail; then the mesh placed by one transform,
 * so the vertex coordinates stay small and the bounding sphere is the town's.
 */

/** The merged attributes, and where the floor starts in them. */
interface TownBuffer {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  outline: Int8Array;
  glow: Uint8Array;
  total: number;
  groundVertices: number;
}

/** A near town's trees: the wood goes into the buffer and the leaf cards into a mesh of their own. */
export function swapNearTrees(kit: RaiseKit, job: RaiseJob): { cards: LeafCard[]; leafVertices: number } {
  const cards: LeafCard[] = [];
  let leafVertices = 0;
  if (!job.slot.builtPeopled) return { cards, leafVertices };
  for (const item of job.standing) {
    const near = kit.variants.nearTrees.get(item.flat);
    if (near === undefined) continue;
    job.vertices += (near.wood.position.length - item.flat.position.length) / 3;
    item.flat = near.wood;
    cards.push({ leaves: near.leaves, matrix: item.matrix });
    leafVertices += near.leaves.position.length / 3;
  }
  return { cards, leafVertices };
}

/**
 * Merges everything standing and then the floor. Normals use the rotation
 * alone (scales are uniform; a part may not scale itself). The ink's normals
 * are three signed bytes; the light is two bytes, the window's brightness
 * dimmed per instance and its bedtime shifted per building, or `MACHINE_BED`
 * on a vehicle that can be taken. A byte pair with no light keeps no hour.
 */
export function* mergeSteps(job: RaiseJob, ground: Ground): Generator<void, TownBuffer, void> {
  const groundVertices = ground.position.length / 3;
  const total = job.vertices + groundVertices;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const outline = new Int8Array(total * 3);
  const glow = new Uint8Array(total * 2);
  let cursor = 0;
  let vertex = 0;
  for (const item of job.standing) {
    yield;
    const e = item.matrix.elements;
    const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
    const inverseScale = scale === 0 ? 0 : 1 / scale;
    const source = item.flat;
    const count = source.position.length;
    for (let i = 0; i < count; i += 3) {
      const x = source.position[i]!;
      const y = source.position[i + 1]!;
      const z = source.position[i + 2]!;
      position[cursor] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      position[cursor + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      position[cursor + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      const nx = source.normal[i]!;
      const ny = source.normal[i + 1]!;
      const nz = source.normal[i + 2]!;
      normal[cursor] = (e[0]! * nx + e[4]! * ny + e[8]! * nz) * inverseScale;
      normal[cursor + 1] = (e[1]! * nx + e[5]! * ny + e[9]! * nz) * inverseScale;
      normal[cursor + 2] = (e[2]! * nx + e[6]! * ny + e[10]! * nz) * inverseScale;
      const ox = source.outline[i]!;
      const oy = source.outline[i + 1]!;
      const oz = source.outline[i + 2]!;
      outline[cursor] = Math.round((e[0]! * ox + e[4]! * oy + e[8]! * oz) * inverseScale * 127);
      outline[cursor + 1] = Math.round((e[1]! * ox + e[5]! * oy + e[9]! * oz) * inverseScale * 127);
      outline[cursor + 2] = Math.round((e[2]! * ox + e[6]! * oy + e[10]! * oz) * inverseScale * 127);
      cursor += 3;
    }
    color.set(source.color, cursor - count);
    const written = count / 3;
    if (item.bay !== undefined) {
      item.bay.start = vertex;
      item.bay.count = written;
      // Marked for the material to paint as a craft is (`MACHINE_TEST`).
      for (let i = 0; i < written; i++) glow[(vertex + i) * 2 + 1] = MACHINE_BED;
    } else if (item.glow > 0) {
      for (let i = 0; i < written; i++) {
        const lit = Math.round(source.glow[i * 2]! * item.glow);
        glow[(vertex + i) * 2] = lit;
        const shift = item.bed ?? 0;
        glow[(vertex + i) * 2 + 1] = lit > 0 ? Math.max(0, Math.min(255, source.glow[i * 2 + 1]! + shift)) : 0;
      }
    }
    vertex += written;
  }
  yield;
  position.set(ground.position, cursor);
  normal.set(ground.normal, cursor);
  color.set(ground.color, cursor);
  for (let i = 0; i < ground.normal.length; i++) outline[cursor + i] = Math.round(ground.normal[i]! * 127);
  // The floor is the buffer's tail, so its pools land on the vertices the floor wrote them for.
  glow.set(ground.glow, vertex * 2);
  for (let i = vertex * 2; i < glow.length; i += 2) if (glow[i] === 0) glow[i + 1] = 0;
  yield;
  return { position, normal, color, outline, glow, total, groundVertices };
}

/**
 * The town's mesh, placed and fading in, with its leaves and parked glass as
 * children; then everything published in the town's frame moved into the
 * world's once (the town does not move while it stands), and the town's
 * memory counted.
 */
export function placeTown(kit: RaiseKit, job: RaiseJob, ground: Ground, buffer: TownBuffer, cards: readonly LeafCard[], leafVertices: number): void {
  const { slot } = job;
  const { frame, registry } = kit;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffer.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(buffer.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffer.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(buffer.outline, 3, true));
  // `normalized`, so the shader reads 0..1; the name is the one `lightWindows` declares.
  geometry.setAttribute('atlasLit', new THREE.BufferAttribute(buffer.glow, 2, true));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, kit.material);
  mesh.name = `town:${slot.place.name}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Where the floor starts in the buffer: the only way to tell it from what stands on it once merged.
  mesh.userData.groundVertices = buffer.groundVertices;
  mesh.userData.overhead = slot.overhead;
  mesh.userData.dressing = slot.dressing;
  mesh.position.copy(frame.origin);
  mesh.quaternion.setFromRotationMatrix(frame.basis);
  const leafMesh = leafVertices > 0 ? townLeaves(cards, leafVertices, slot.place.name, kit.leaves) : null;
  if (leafMesh !== null) {
    mesh.add(leafMesh);
    mesh.userData.leaves = leafMesh;
    registry.townCrowns(mesh, cards);
  }
  const glassMesh = townGlass(job.standing, slot.place.name);
  if (glassMesh !== null) {
    mesh.add(glassMesh);
    mesh.userData.glass = glassMesh;
  }
  registry.group.add(mesh);
  registry.fader.in(mesh);
  if (leafMesh !== null) registry.fader.in(leafMesh);
  if (glassMesh !== null) registry.fader.in(glassMesh);
  publish(kit, job, ground, mesh);

  slot.mesh = mesh;
  const glassVertices = glassMesh === null ? 0 : glassMesh.geometry.getAttribute('position').count;
  slot.triangles = (buffer.total + leafVertices + glassVertices) / 3;
  slot.parts = job.standing.length;
  // Three float triples, two light bytes and three ink bytes: 41 bytes a vertex.
  slot.bytes = buffer.total * (3 * 4 * 3 + 2 + 3) + leafVertices * 26 + glassVertices * 36;
}

/** Moves the town's people, lamps, bays, benches and racks into the world's frame, and registers the town for each. */
function publish(kit: RaiseKit, job: RaiseJob, ground: Ground, mesh: THREE.Mesh): void {
  const { slot } = job;
  const { registry } = kit;
  for (const person of slot.folk) {
    person.position.applyQuaternion(mesh.quaternion).add(mesh.position);
    person.from.applyQuaternion(mesh.quaternion).add(mesh.position);
    person.to.applyQuaternion(mesh.quaternion).add(mesh.position);
    person.quaternion.premultiply(mesh.quaternion);
    person.town.copy(mesh.quaternion);
  }
  if (slot.folk.length > 0) registry.inhabited.add(slot);
  if (ground.lamps.length >= 3) {
    const at = kit.scratch.at;
    const heads = new Float32Array(ground.lamps.length);
    for (let i = 0; i + 2 < ground.lamps.length; i += 3) {
      at.set(ground.lamps[i]!, ground.lamps[i + 1]! + LAMP_HEAD, ground.lamps[i + 2]!)
        .applyQuaternion(mesh.quaternion).add(mesh.position);
      heads[i] = at.x;
      heads[i + 1] = at.y;
      heads[i + 2] = at.z;
    }
    slot.lampHeads = heads;
    registry.lit.add(slot);
  }
  for (const bay of slot.parked) {
    bay.position.applyQuaternion(mesh.quaternion).add(mesh.position);
    bay.forward.applyQuaternion(mesh.quaternion);
  }
  if (slot.parked.length > 0) registry.parkedTowns.add(slot);
  for (const bench of slot.benches) {
    bench.position.applyQuaternion(mesh.quaternion).add(mesh.position);
    bench.facing.applyQuaternion(mesh.quaternion);
  }
  if (slot.benches.length > 0) registry.benchTowns.add(slot);
  for (const rack of slot.bikeSlots) {
    rack.position.applyQuaternion(mesh.quaternion).add(mesh.position);
    rack.forward.applyQuaternion(mesh.quaternion);
  }
  if (slot.bikeSlots.length > 0) registry.rackTowns.add(slot);
}
