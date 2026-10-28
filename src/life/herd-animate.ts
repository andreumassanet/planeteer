/**
 * Standing a near herd up as its animals and handing it back. Each animal is
 * a skinned copy of its rig playing the clip its merged frame was taken from,
 * from that same instant, so the swap is not a jump.
 */
import * as THREE from 'three';
import { FAUNA_RESCALE, rigPaint, rigScale } from '../fauna/contract.ts';
import type { Animal } from '../fauna/contract.ts';
import { FAUNA_STYLES } from '../fauna/regions.ts';
import type { RegionId } from '../fauna/regions.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { makeRigged, paintColors } from '../models.ts';
import type { Model, RigSource, Rigged } from '../models.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { rngFrom } from '../scenery/random.ts';
import { unitAt } from '../sphere.ts';
import { frameOpenFor } from '../view.ts';
import type { LifeStats } from './api.ts';
import { clipFor, farFrameOf } from './herd-build.ts';
import type { HerdBehaviour } from './herd-behaviour.ts';
import { settledHerd } from './herd-behaviour.ts';
import type { Grazer, HerdHead, HerdSite, Herding } from './herd-types.ts';
import type { ClearOfMade } from './made-ground.ts';
import type { Mover } from './mover.ts';
import type { PlaceIndex } from './place-index.ts';
import type { Pooled } from './pool.ts';
import { HERDS_PER_FRAME, HERD_ANIMATED_CAP } from './tuning.ts';

/** The herd's frame in the world this frame: its mesh's X, Y and Z. */
export interface HerdAxes {
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
}

export interface HerdAnimator {
  /**
   * Stands a herd up as its animals (if not already) and lives one frame of
   * it. False if the cap, the frame's allowance or a rig not yet arrived says
   * wait; the merged herd stands in meanwhile.
   */
  animateHerd(mover: Mover, pooled: Pooled, mesh: THREE.Mesh, dt: number, viewer: THREE.Vector3, axes: HerdAxes, viewerPace: number): boolean;
  /** Hands a near herd back to its merged buffer, keeping its rigs for reuse. */
  releaseHerd(mover: Mover): void;
  beginFrame(): void;
}

interface AnimatorDeps {
  places: readonly Place[];
  rigs: RigSource | undefined;
  bestiary: ReadonlyMap<string, Animal>;
  group: THREE.Group;
  stats: LifeStats;
  herdSites: ReadonlyMap<string, HerdSite>;
  placeIndex: PlaceIndex;
  clearOfMade: ClearOfMade;
  behaviour: HerdBehaviour;
}

export function createHerdAnimator(deps: AnimatorDeps): HerdAnimator {
  const { places, rigs, bestiary, group, stats, herdSites, placeIndex, clearOfMade, behaviour } = deps;
  /**
   * Rigs kept by rig id and handed out again repainted. Never disposed: a
   * rigged body's geometry shares its rig's attributes, and disposing it would
   * free those GPU buffers too.
   */
  const spareRigs = new Map<string, Rigged[]>();
  let animatedHeads = 0;
  let herdsStoodThisFrame = 0;
  const fitScratch = new THREE.Vector3();
  const homePoint = new THREE.Vector3();
  const homeQuat = new THREE.Quaternion();
  const homeScale = new THREE.Vector3();

  /**
   * How far from its centre a herd's animals may go: the scan's own gates
   * (`clearOfMade` and the nearest town) asked again at twice and one and a
   * half times its spread, taking the widest that passes. The disc is convex,
   * so a straight walk inside it never crosses a road it is clear of.
   */
  function roomOf(herd: Herding): number {
    const site = herd.site;
    let farthest = 0;
    for (const head of herd.heads) farthest = Math.max(farthest, Math.hypot(head.homeX, head.homeZ));
    const townGap = herd.town === null ? Infinity : herd.town.angleTo(site.centre) * PLANET_RADIUS - herd.townRadius;
    for (const share of [2, 1.5]) {
      const room = site.spread * share;
      if (room <= townGap && clearOfMade(site.centre, room)) return room;
    }
    return Math.max(farthest, Math.min(site.spread, townGap));
  }

  /** One animal stood up from its merged head, or null if its rig is not there. */
  function standHead(mover: Mover, source: RigSource, head: HerdHead, holder: THREE.Group, index: number): Grazer | null {
    const entry = bestiary.get(head.species);
    const style = FAUNA_STYLES[head.region as RegionId];
    if (entry?.rigs === undefined || style === undefined) return null;
    const shape = entry.shape(rngFrom(entry.id, style.id, head.variant), style);
    const choice = rngFrom(entry.id, style.id, head.variant, 'rig').weighted(entry.rigs.map((rig) => ({ item: rig, weight: rig.weight })));
    const rig = source.get(choice.id);
    if (rig === null) return null;
    const paint = rigPaint(shape, choice);
    const spare = spareRigs.get(choice.id)?.pop();
    let rigged: Rigged;
    if (spare !== undefined) {
      rigged = spare;
      const colors = rigged.body.geometry.getAttribute('color') as THREE.BufferAttribute;
      (colors.array as Float32Array).set(paintColors(rig as unknown as Model, paint));
      colors.needsUpdate = true;
    } else {
      rigged = makeRigged(rig, paint);
    }
    const size = rig.box.getSize(fitScratch);
    const k = rigScale(choice, rig);
    rigged.root.position.set(-(rig.box.min.x + rig.box.max.x) / 2, -rig.box.min.y, -(rig.box.min.z + rig.box.max.z) / 2);
    const fit = new THREE.Group();
    fit.scale.setScalar(k);
    fit.add(rigged.root);
    const place = new THREE.Group();
    place.matrixAutoUpdate = true;
    head.matrix.decompose(place.position, place.quaternion, place.scale);
    place.add(fit);
    holder.add(place);
    const rest = rigged.actions.get(clipFor(rig, head.pose));
    if (rest !== undefined) {
      rest.reset().setEffectiveWeight(1).play();
      // From the instant the merged herd held it in.
      const still = rig.far[farFrameOf(rig, head.pose, `${head.species}|${head.region}|${head.variant}|${head.pose}`)];
      rest.time = still?.time ?? 0;
      rest.timeScale = 0.85 + rngFrom(mover.key, 'rate', index).unit() * 0.3;
    }
    // Its own yaw and size from the matrix `buildHerd` seated it with: a turn
    // about +y and a uniform scale.
    head.matrix.decompose(homePoint, homeQuat, homeScale);
    const scale = homeScale.x;
    const yaw = 2 * Math.atan2(homeQuat.y, homeQuat.w);
    // The rig's own box at its standing scale, not the declared one.
    const halfLength = (size.z * k * scale) / 2;
    return {
      rigged, rig: choice.id, place,
      rest,
      graze: rigged.actions.get('Eating') ?? rigged.actions.get('Idle'),
      idle: rigged.actions.get('Idle'),
      walk: rigged.actions.get('Walk'),
      current: rest,
      halfLength,
      halfWidth: (size.x * k * scale) / 2,
      height: size.y * k * scale,
      stance: Math.max(1.2 * FAUNA_RESCALE, Math.hypot(size.z * k, size.x * k) * 0.5),
      // A third of its own length a second, scaling with the rig as its walk clip does.
      pace: halfLength * 2 * 0.3,
      homeX: homePoint.x, homeZ: homePoint.z, homeY: homePoint.y, homeYaw: yaw,
      x: homePoint.x, z: homePoint.z, y: homePoint.y, yaw,
      fromY: homePoint.y, toX: homePoint.x, toZ: homePoint.z, toY: homePoint.y, leg: 0, speed: 0,
      face: NaN,
      mode: 'settled',
      timer: rngFrom(mover.key, 'first', index).range(0.5, 4),
      draws: 0, bolt: 0, stuck: 0, bob: 0,
      world: new THREE.Vector3(), facing: new THREE.Vector3(),
      knocked: -1, knockX: 0, knockZ: 0, knockDx: 0, knockDz: 1, knockFling: 0,
    };
  }

  /** Stands a herd up; false if it has to wait. */
  function standUp(mover: Mover, source: RigSource, animals: HerdHead[]): boolean {
    const site = herdSites.get(mover.pool);
    if (site === undefined) return false;
    if (animatedHeads + animals.length > HERD_ANIMATED_CAP) return false;
    // One herd a frame, and only while the frame has room.
    if (herdsStoodThisFrame >= HERDS_PER_FRAME || !frameOpenFor(herdsStoodThisFrame, true)) return false;
    herdsStoodThisFrame++;
    const holder = new THREE.Group();
    holder.name = `herd-animated:${mover.key}`;
    const heads: Grazer[] = [];
    for (const head of animals) {
      const grazer = standHead(mover, source, head, holder, heads.length);
      if (grazer !== null) heads.push(grazer);
    }
    if (heads.length === 0) return false;
    group.add(holder);
    const town = placeIndex.nearestShown(site.centre, `p${mover.pool.slice(2)}`);
    mover.animated = {
      holder, heads, site,
      room: 0,
      town: town < 0 ? null : unitAt(places[town]!.lat, places[town]!.lon, new THREE.Vector3()),
      townRadius: town < 0 ? 0 : radiusOf(places[town]!),
      axisX: new THREE.Vector3(), axisY: new THREE.Vector3(), axisZ: new THREE.Vector3(),
      homing: false,
    };
    mover.animated.room = roomOf(mover.animated);
    animatedHeads += heads.length;
    return true;
  }

  function animateHerd(mover: Mover, pooled: Pooled, mesh: THREE.Mesh, dt: number, viewer: THREE.Vector3, axes: HerdAxes, viewerPace: number): boolean {
    if (rigs === undefined || pooled.animals === undefined) return false;
    if (!mover.animated && !standUp(mover, rigs, pooled.animals)) return false;
    const herd = mover.animated!;
    herd.holder.visible = true;
    herd.holder.position.copy(mesh.position);
    herd.holder.quaternion.copy(mesh.quaternion);
    herd.axisX.copy(axes.x);
    herd.axisY.copy(axes.y);
    herd.axisZ.copy(axes.z);
    behaviour.herdStep(mover, herd, dt, viewer, viewerPace);
    return true;
  }

  function releaseHerd(mover: Mover): void {
    const animated = mover.animated;
    if (!animated) return;
    if (!settledHerd(animated)) stats.snapped++;
    for (const head of animated.heads) {
      head.rigged.mixer.stopAllAction();
      head.rigged.root.removeFromParent();
      const spares = spareRigs.get(head.rig) ?? [];
      spares.push(head.rigged);
      spareRigs.set(head.rig, spares);
    }
    group.remove(animated.holder);
    animatedHeads -= animated.heads.length;
    mover.animated = null;
  }

  return {
    animateHerd,
    releaseHerd,
    beginFrame() {
      herdsStoodThisFrame = 0;
    },
  };
}
