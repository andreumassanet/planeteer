/**
 * A herd as one merged buffer: each animal seated on the ground it stands
 * over, at its own yaw and size, all in the herd's tangent frame. Bodies are
 * cached per (species, region, variant, pose); the herd buffer is per site.
 */
import * as THREE from 'three';
import { buildAnimal } from '../fauna/body.ts';
import type { Pose as AnimalPose } from '../fauna/body.ts';
import { FAUNA_RESCALE, VARIANTS as FAUNA_VARIANTS, rigPaint, rigScale } from '../fauna/contract.ts';
import type { Animal, AnimalShape, FaunaContext, RigChoice } from '../fauna/contract.ts';
import { FAUNA_STYLES } from '../fauna/regions.ts';
import type { RegionId } from '../fauna/regions.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { drawnFootprint, landProbeOf } from '../land-probe.ts';
import type { DrawnFootprint } from '../land-probe.ts';
import { mergeMeshes } from '../merge.ts';
import type { Merged } from '../merge.ts';
import { paintColors, paintModel, posedGeometry } from '../models.ts';
import type { Model, Rig as ModelRig, RigSource } from '../models.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Weighted } from '../scenery/random.ts';
import { MAX_SLOPE, gradeAt, reliefAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import type { LifeShared } from './api.ts';
import type { HerdGround, HerdHead, HerdSite } from './herd-types.ts';
import { PAINTED_MERGE } from './material.ts';
import { disposeBuilt, geometryOf } from './pool.ts';
import type { Pooled } from './pool.ts';
import { TAU } from './tuning.ts';

/** What a member of a merged herd is doing; weighted to grazing, which reads as alive. */
const HERD_POSES: Weighted<AnimalPose['kind']>[] = [
  { item: 'graze', weight: 6 },
  { item: 'stand', weight: 3 },
  { item: 'alert', weight: 1 },
];

const BODY_CACHE_CAP = 120;

/**
 * The clip a pose is a frame of: `Eating` for a grazer where the rig has one,
 * else `Idle`. Never no clip: these rigs rest with the armature turned a
 * quarter over, and only a clip stands them up.
 */
export function clipFor(rig: ModelRig, pose: AnimalPose['kind']): string {
  if (pose === 'graze' && rig.clips.some((clip) => clip.name === 'Eating')) return 'Eating';
  return rig.clips.some((clip) => clip.name === 'Idle') ? 'Idle' : (rig.clips[0]?.name ?? 'Idle');
}

/** The far frame a head is held in: one of its clip's, chosen by the head's seed, so merged and animated herds agree. */
export function farFrameOf(rig: ModelRig, pose: AnimalPose['kind'], key: string): number {
  const clip = clipFor(rig, pose);
  const frames = rig.far.map((frame, index) => ({ frame, index })).filter((entry) => entry.frame.clip === clip);
  if (frames.length === 0) return -1;
  return frames[Math.floor(rngFrom(key, 'frame').unit() * frames.length)]!.index;
}

/**
 * One head from its baked rig: a far frame painted with `shape`'s coat and
 * fitted by its back (`rigScale`), feet on y = 0, facing +Z. A rig with no far
 * frames is posed here at full detail.
 */
function rigAnimal(shape: AnimalShape, choice: RigChoice, rig: ModelRig, frame: number): THREE.Group {
  const still = rig.far[frame];
  const paint = rigPaint(shape, choice);
  let geometry: THREE.BufferGeometry;
  if (still !== undefined) {
    geometry = paintModel(still.model, paint);
  } else {
    geometry = posedGeometry(rig, clipFor(rig, 'stand'), 0);
    geometry.setAttribute('color', new THREE.BufferAttribute(paintColors(rig as unknown as Model, paint), 3));
  }
  const k = rigScale(choice, rig);
  const mesh = new THREE.Mesh(geometry, PAINTED_MERGE);
  mesh.scale.setScalar(k);
  mesh.position.set(-((rig.box.min.x + rig.box.max.x) / 2) * k, -rig.box.min.y * k, -((rig.box.min.z + rig.box.max.z) / 2) * k);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

export interface HerdBuilder {
  /** The herd at `site` as one buffer; null if nothing could stand, 'pending' while a rig loads. */
  buildHerd(key: string, site: HerdSite): Pooled | null | 'pending';
  /**
   * An animal's seat at `direction` as a height over its herd's origin: the
   * lowest drawn land under its hooves where the land probe covers it, else
   * the relief's, which `gradeAt` has put in `slope`. Merged and animated
   * herds both stand here, so the swap does not move an animal.
   */
  seatOf(site: HerdGround, direction: THREE.Vector3, stance: number, slope: Slope): number;
}

interface HerdBuilderDeps {
  fauna: FaunaContext;
  bestiary: ReadonlyMap<string, Animal>;
  rigs: RigSource | undefined;
  land: THREE.Mesh | undefined;
  shared: LifeShared;
}

export function createHerdBuilder({ fauna, bestiary, rigs, land, shared }: HerdBuilderDeps): HerdBuilder {
  const bodyCache = new Map<string, Merged>();
  const landProbe = land === undefined ? null : landProbeOf(land);
  const herdDrawn: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };
  const herdNormal = new THREE.Matrix3();
  const herdPoint = new THREE.Vector3();
  const herdQuat = new THREE.Quaternion();
  const herdUp = new THREE.Vector3(0, 1, 0);
  const herdScale = new THREE.Vector3();
  const herdSeat = new THREE.Vector3();
  const headSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

  function seatOf(site: HerdGround, direction: THREE.Vector3, stance: number, slope: Slope): number {
    if (landProbe !== null && drawnFootprint(landProbe, direction, site.right, site.forward, stance, herdDrawn) === 'drawn') {
      return herdDrawn.lowest - site.base;
    }
    return Math.min(reliefAt(direction.x, direction.y, direction.z), slope.lowest) - site.relief;
  }

  function animalBuffer(species: string, region: string, variant: number, pose: AnimalPose): Merged | null | 'pending' {
    const key = `${species}|${region}|${variant}|${pose.kind}`;
    let found = bodyCache.get(key);
    if (found !== undefined) return found;
    const entry = bestiary.get(species);
    const style = FAUNA_STYLES[region as RegionId];
    if (entry === undefined || style === undefined) return null;
    const shape = entry.shape(rngFrom(entry.id, style.id, variant), style);
    if (entry.rigs !== undefined && entry.rigs.length > 0 && rigs !== undefined) {
      const choice = rngFrom(entry.id, style.id, variant, 'rig').weighted(entry.rigs.map((rig) => ({ item: rig, weight: rig.weight })));
      const rig = rigs.get(choice.id);
      if (rig === null) return 'pending';
      found = mergeMeshes(rigAnimal(shape, choice, rig, farFrameOf(rig, pose.kind, key)));
    } else {
      const built = buildAnimal(fauna, shape, pose);
      found = mergeMeshes(built.group);
      disposeBuilt(built.group);
    }
    if (bodyCache.size >= BODY_CACHE_CAP) bodyCache.clear();
    bodyCache.set(key, found);
    return found;
  }

  /**
   * Each animal is bedded to the lowest of four probes at its own stance (the
   * way `vegetation.ts` beds a plant), so nothing floats; uphill hooves sink a
   * little instead. An animal on a patch steeper than `MAX_SLOPE` is dropped
   * rather than tilted: the legs are solved for level ground.
   */
  function buildHerd(key: string, site: HerdSite): Pooled | null | 'pending' {
    const members: { merged: Merged; matrix: THREE.Matrix4 }[] = [];
    const heads: HerdHead[] = [];
    const shape = bestiary.get(site.species);
    if (shape === undefined) return null;
    // `gradeAt` probes at `reach` on the diagonals, so half the box's diagonal
    // puts a probe under each hoof.
    const stance = Math.max(1.2 * FAUNA_RESCALE, Math.hypot(shape.size[0], shape.size[1]) * 0.5);
    let vertices = 0;
    for (let i = 0; i < site.heads; i++) {
      const each = rngFrom(key, 'head', i);
      const variant = each.int(FAUNA_VARIANTS);
      const poseKind = each.weighted(HERD_POSES);
      const merged = animalBuffer(site.species, site.region, variant, { kind: poseKind } as AnimalPose);
      if (merged === null || merged === 'pending') return merged;
      // Scattered over a disc on the herd's tangent plane.
      const angle = each.unit() * TAU;
      const radius = Math.sqrt(each.unit()) * site.spread;
      // Yaw is free; scale is baked into the vertices by the merge, which
      // transforms the normals properly for the ink.
      const scale = each.spread(1, 0.07);
      herdQuat.setFromAxisAngle(herdUp, each.unit() * TAU);
      herdScale.set(scale, scale, scale);

      // Where it really is, in the frame `update` draws the mesh in (local X
      // is `right`, local Z is `forward`).
      herdSeat
        .copy(site.centre)
        .addScaledVector(site.right, (Math.cos(angle) * radius) / PLANET_RADIUS)
        .addScaledVector(site.forward, (Math.sin(angle) * radius) / PLANET_RADIUS)
        .normalize();
      gradeAt(herdSeat, site.right, site.forward, stance, headSlope);
      // The site gate is a mean over the spread; this catches an outcrop inside it.
      if (headSlope.grade > MAX_SLOPE) continue;
      const seat = seatOf(site, herdSeat, stance, headSlope);
      shared.seatLog?.push({ x: herdSeat.x, y: herdSeat.y, z: herdSeat.z, radius: site.base + seat, reach: stance });

      herdPoint.set(Math.cos(angle) * radius, seat, Math.sin(angle) * radius);
      const matrix = new THREE.Matrix4().compose(herdPoint, herdQuat, herdScale);
      members.push({ merged, matrix });
      heads.push({ species: site.species, region: site.region, variant, pose: poseKind, matrix });
      vertices += merged.position.length / 3;
    }
    if (members.length === 0) return null;

    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const color = new Float32Array(vertices * 3);
    const outline = new Float32Array(vertices * 3);
    let cursor = 0;
    for (const member of members) {
      herdNormal.getNormalMatrix(member.matrix);
      const source = member.merged;
      for (let i = 0; i < source.position.length; i += 3) {
        herdPoint.set(source.position[i]!, source.position[i + 1]!, source.position[i + 2]!).applyMatrix4(member.matrix);
        position[cursor] = herdPoint.x;
        position[cursor + 1] = herdPoint.y;
        position[cursor + 2] = herdPoint.z;
        herdPoint.set(source.normal[i]!, source.normal[i + 1]!, source.normal[i + 2]!).applyMatrix3(herdNormal).normalize();
        normal[cursor] = herdPoint.x;
        normal[cursor + 1] = herdPoint.y;
        normal[cursor + 2] = herdPoint.z;
        herdPoint.set(source.outline[i]!, source.outline[i + 1]!, source.outline[i + 2]!).applyMatrix3(herdNormal).normalize();
        outline[cursor] = herdPoint.x;
        outline[cursor + 1] = herdPoint.y;
        outline[cursor + 2] = herdPoint.z;
        color[cursor] = source.color[i]!;
        color[cursor + 1] = source.color[i + 1]!;
        color[cursor + 2] = source.color[i + 2]!;
        cursor += 3;
      }
    }
    const geometry = geometryOf({ position, normal, color, outline, triangles: vertices / 3 });
    const rigged = shape.rigs !== undefined && shape.rigs.length > 0 && rigs !== undefined;
    return { geometry, triangles: vertices / 3, bytes: position.byteLength * 4, heads: members.length, animals: rigged ? heads : undefined };
  }

  return { buildHerd, seatOf };
}
