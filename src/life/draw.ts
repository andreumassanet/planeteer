/**
 * Drawing the movers each frame: each is placed on its route, given its
 * pooled buffer (asking for it if it is not built), oriented, and counted.
 * A near herd stands up as its animals here.
 */
import * as THREE from 'three';
import { CABIN_REACH } from '../craft/cabin.ts';
import { glassMaterial } from '../craft/build.ts';
import type { Folk } from '../folk.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { ViewCone } from '../view.ts';
import type { LifeStats } from './api.ts';
import type { Drives } from './drive.ts';
import type { HerdAnimator } from './herd-animate.ts';
import { moving, settleUnseen, settledHerd } from './herd-behaviour.ts';
import type { Herding } from './herd-types.ts';
import { emptyFrame, insideKeyOf, phaseKeyOf } from './mover.ts';
import type { Mover } from './mover.ts';
import type { Pool, Pooled } from './pool.ts';
import { HERD_ANIMATED_REACH, HERD_HOLD_REACH, HERD_HOME_REACH, LANE_CHANGE, WALK_PHASES } from './tuning.ts';
import { walkPhase } from './walkers.ts';
import type { Walkers } from './walkers.ts';

export interface MoverDrawer {
  drawMover(mover: Mover, viewer: THREE.Vector3, clock: number, realDt: number, viewerPace: number): void;
  /** The near herds drawn this frame, for `collide` and the traffic. */
  herdsShown: Herding[];
  beginFrame(): void;
}

interface DrawDeps {
  group: THREE.Group;
  material: THREE.Material;
  stats: LifeStats;
  cone: ViewCone;
  folk: Folk | undefined;
  pool: Pool;
  drives: Drives;
  animator: HerdAnimator;
  walkers: Walkers;
}

export function createMoverDrawer(deps: DrawDeps): MoverDrawer {
  const { group, material, stats, cone, folk, pool, drives, animator, walkers } = deps;
  const frame = emptyFrame();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const wayLeft = new THREE.Vector3();
  /** The herd's axes are the mover's own basis, as `drawMover` builds it. */
  const herdAxes = { x: right, y: frame.dir, z: forward };
  const herdsShown: Herding[] = [];


  /** Places a mover on its route at its own clock, and a road vehicle across its lane while it passes. */
  function placeMover(mover: Mover, clock: number): void {
    drives.resetPart();
    const way = mover.way;
    mover.route(way === undefined ? clock : clock - way.delay, frame, true);
    if (way !== undefined) {
      way.part = drives.part;
      way.shown = false;
      way.facing.copy(frame.forward).projectOnPlane(frame.dir).normalize();
      if (way.shift !== 0) {
        // Out across its own left to pass, and turned towards where it is going.
        wayLeft.crossVectors(frame.dir, way.facing).normalize();
        frame.dir.addScaledVector(wayLeft, way.shift / PLANET_RADIUS).normalize();
        const across = way.shiftTo - way.shift;
        if (across !== 0) {
          const steer = Math.sign(across) * Math.min(0.35, (LANE_CHANGE + 0.2 * mover.speed * way.pace) / Math.max(2, mover.speed * way.pace));
          frame.forward.copy(way.facing).addScaledVector(wayLeft, steer).normalize();
        }
      }
    }
    mover.at.copy(frame.dir).multiplyScalar(frame.height);
  }

  /**
   * The buffer a mover is drawn with this frame, asking for it if it is not
   * built; near, a road vehicle's glazed build once it is (`CABIN_REACH`).
   */
  function pooledFor(mover: Mover, clock: number, viewer: THREE.Vector3): Pooled | undefined {
    const key = mover.family === 'foot'
      ? phaseKeyOf(mover, Math.min(WALK_PHASES - 1, Math.floor(walkPhase(mover, clock) * WALK_PHASES)))
      : mover.pool;
    let pooled = pool.entries.get(key);
    if (pooled !== undefined) pool.touch(key);
    if (pooled === undefined) {
      if (!pool.refused.has(mover.pool)) pool.wanted.add(mover.pool);
      if (mover.mesh !== null) mover.mesh.visible = false;
      if (mover.animated) animator.releaseHerd(mover);
      return undefined;
    }
    if (mover.family === 'road' && mover.at.distanceTo(viewer) < CABIN_REACH) {
      const insideKey = insideKeyOf(mover, mover.way?.keep === 1);
      const inside = pool.refused.has(insideKey) ? undefined : pool.entries.get(insideKey);
      if (inside !== undefined) {
        pool.touch(insideKey);
        pooled = inside;
      } else if (!pool.refused.has(insideKey)) pool.wanted.add(insideKey);
    }
    return pooled;
  }

  /** The mover's mesh on `pooled`'s geometry, with its glass while the build has any. */
  function meshFor(mover: Mover, pooled: Pooled): THREE.Mesh {
    let mesh = mover.mesh;
    if (mesh === null) {
      mesh = new THREE.Mesh(pooled.geometry, material);
      mesh.name = `${mover.family}:${mover.key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mover.mesh = mesh;
      group.add(mesh);
    }
    mesh.visible = true;
    if (mesh.geometry !== pooled.geometry) mesh.geometry = pooled.geometry;
    let pane = mesh.userData.glass as THREE.Mesh | undefined;
    if (pooled.glass !== undefined) {
      if (pane === undefined) {
        pane = new THREE.Mesh(pooled.glass, glassMaterial());
        pane.name = 'glass';
        pane.castShadow = false;
        pane.receiveShadow = true;
        mesh.add(pane);
        mesh.userData.glass = pane;
      }
      if (pane.geometry !== pooled.glass) pane.geometry = pooled.glass;
      pane.visible = true;
    } else if (pane !== undefined) pane.visible = false;
    const way = mover.way;
    if (way !== undefined) {
      way.shown = true;
      if (way.sized !== pooled.geometry) {
        // Its box, which the traffic around it measures it by.
        way.sized = pooled.geometry;
        const box = pooled.geometry.boundingBox ?? (pooled.geometry.computeBoundingBox(), pooled.geometry.boundingBox!);
        way.halfLength = Math.max(-box.min.z, box.max.z);
        way.halfWidth = Math.max(-box.min.x, box.max.x);
      }
    }
    return mesh;
  }

  /**
   * A herd near enough stands up as its animals, and is held past that until
   * every animal is back where the merged herd has it (`HERD_HOME_REACH`).
   */
  function drawHerd(mover: Mover, pooled: Pooled, mesh: THREE.Mesh, away: number, viewer: THREE.Vector3, realDt: number, viewerPace: number): void {
    const standing = mover.animated;
    const wanted = standing
      ? away < HERD_HOLD_REACH && !(away >= HERD_ANIMATED_REACH && settledHerd(standing))
      : away < HERD_ANIMATED_REACH;
    if (wanted && animator.animateHerd(mover, pooled, mesh, realDt, viewer, herdAxes, viewerPace)) {
      const herd = mover.animated!;
      mesh.visible = false;
      stats.animated += herd.heads.length;
      stats.nearestMoving = Math.min(stats.nearestMoving, away);
      herdsShown.push(herd);
      if (herd.homing) stats.homing++;
      for (const head of herd.heads) {
        if (head.mode === 'flee') stats.fleeing++;
        else if (moving(head)) stats.wandering++;
        else stats.grazing++;
      }
    } else if (mover.animated) {
      animator.releaseHerd(mover);
    }
  }

  function drawMover(mover: Mover, viewer: THREE.Vector3, clock: number, realDt: number, viewerPace: number): void {
    placeMover(mover, clock);
    if (mover.family === 'foot' && folk !== undefined) {
      walkers.draw(mover, frame, clock, viewer);
      return;
    }
    const pooled = pooledFor(mover, clock, viewer);
    if (pooled === undefined) return;
    if (!frame.live || !cone.keeps(mover.at, 20)) {
      if (mover.mesh !== null) mover.mesh.visible = false;
      if (mover.animated) {
        // Walked away from while out of sight: home at once, unseen.
        if (mover.at.distanceTo(viewer) > HERD_HOME_REACH) settleUnseen(mover.animated);
        mover.animated.holder.visible = false;
      }
      return;
    }
    const mesh = meshFor(mover, pooled);

    // X cross Y must be Z: X is `up x forward`. `makeBasis(east, up, north)`
    // has determinant -1 and renders the mesh as a solid ink blob.
    forward.copy(frame.forward).projectOnPlane(frame.dir).normalize();
    right.crossVectors(frame.dir, forward).normalize();
    basis.makeBasis(right, frame.dir, forward);
    mesh.position.copy(mover.at);
    mesh.quaternion.setFromRotationMatrix(basis);
    // Nose up is a turn about the body's own x that lifts its +Z.
    if (frame.pitch !== 0) mesh.rotateX(-frame.pitch);
    if (frame.roll !== 0) mesh.rotateZ(frame.roll);

    const away = mover.at.distanceTo(viewer);
    if (mover.family === 'herd' && pooled.animals !== undefined) drawHerd(mover, pooled, mesh, away, viewer, realDt, viewerPace);
    else if (mover.family !== 'herd') stats.nearestMoving = Math.min(stats.nearestMoving, away);

    stats[mover.family]++;
    if (mover.family === 'road') {
      if (drives.part === 1 || drives.part === 2) stats.inTown++;
      if (drives.part >= 2) stats.turning++;
    }
    // What was built, not what was asked for: steep patches drop animals.
    if (mover.family === 'herd') stats.animals += pooled.heads ?? mover.heads ?? 0;
    stats.meshes++;
    stats.triangles += pooled.triangles;
  }

  return {
    drawMover,
    herdsShown,
    beginFrame() {
      herdsShown.length = 0;
    },
  };
}
