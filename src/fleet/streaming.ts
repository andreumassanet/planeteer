/**
 * What the fleet does each frame to keep the right vehicles standing: look for
 * candidates round the player, build the nearest inside the frame's
 * allowance, put away the rest, and set down or animate each one that stands.
 */
import * as THREE from 'three';
import { NEAR_BUILD, createViewCone, mayBuild } from '../view.ts';
import {
  ALWAYS_WITHIN,
  BUILD_MS,
  MAX_BUILT,
  REACH,
  RESCAN_MOVE,
  RESCAN_SECONDS,
  RESEAT_SECONDS,
  WARM_MOVE,
  WARM_MS,
  WARM_REACH,
} from './limits.ts';
import { modelOfVehicle } from './models.ts';
import { applyPose, isPose } from './pose.ts';
import type { Airstrips } from './airstrips.ts';
import type { Candidates, Wanted } from './candidates.ts';
import type { Drawing } from './drawing.ts';
import type { Placing } from './placing.ts';
import type { Drawn, FleetContext } from './state.ts';

export interface Streaming {
  /** The vehicles somebody else drove this frame (or that are rolling on alone); rewritten by every `frame`, never reallocated. */
  readonly drivenNow: readonly Drawn[];
  /** Warms the airstrips ahead, rescans, builds, and tends every standing vehicle. */
  frame(dt: number, camera?: THREE.Camera): void;
}

export function createStreaming(
  ctx: FleetContext,
  placing: Placing,
  drawing: Drawing,
  airstrips: Airstrips,
  candidates: Candidates,
): Streaming {
  const { options, models, link, sites, drawn, state, centre, pose } = ctx;
  const { player } = options;
  const { poseOf, seat, sitePose } = placing;
  const { build, arrive, animate, settle, putAway, makeRoom } = drawing;
  const { scan } = candidates;
  const cone = createViewCone(ALWAYS_WITHIN);
  const lastScan = new THREE.Vector3(Infinity, 0, 0);
  /** Where the warm-up last finished everything in its reach; it rests until the player moves on. */
  const warmed = new THREE.Vector3(Infinity, 0, 0);
  const warmAt = new THREE.Vector3();
  let wanted: Wanted[] = [];
  const drivenNow: Drawn[] = [];

  /** Works out the plane strips ahead of the first ask, in what is left of the frame's allowance. */
  function warmUp(): void {
    if (warmed.distanceTo(player.position) > WARM_MOVE) {
      const began = performance.now();
      const more = (): boolean => mayBuild(began, WARM_MS, false);
      if (more() && sites.warm(warmAt.copy(player.position).normalize(), WARM_REACH, more)) warmed.copy(player.position);
    }
  }

  function rescan(dt: number): void {
    state.scanAge += dt;
    if (state.scanAge > RESCAN_SECONDS || lastScan.distanceTo(player.position) > RESCAN_MOVE) {
      wanted = scan();
      state.scanAge = 0;
      lastScan.copy(player.position);
      const keep = new Set(wanted.map((entry) => entry.id));
      if (state.coast !== null) keep.add(state.coast.entry.id);
      for (const entry of [...drawn.values()]) if (!keep.has(entry.id)) putAway(entry);
    }
  }

  /**
   * Builds what is wanted and not standing, nearest first, inside the frame's
   * allowance; at the cap, in the place of the furthest standing. The cone is
   * aimed every frame, not only at a scan, so a vehicle turned towards is
   * admitted now rather than up to a second later. Returns when the building
   * began, for the airstrips' share.
   */
  function buildWanted(camera?: THREE.Camera): number {
    if (camera !== undefined) cone.aim(camera);
    const began = performance.now();
    for (const want of wanted) {
      if (drawn.has(want.id) || (state.held !== null && state.held.id === want.id)) continue;
      if (want.distance > REACH) break;
      if (!mayBuild(began, BUILD_MS, want.distance < NEAR_BUILD, 'fleet')) break;
      if (want.distance > ALWAYS_WITHIN && cone.active) {
        if (!poseOf(want.id, pose)) continue;
        centre.set(pose[0]!, pose[1]!, pose[2]!);
        const model = models.get(want.site?.model ?? modelOfVehicle(want.id));
        if (model !== undefined && !cone.admits(centre, Math.max(...model.size))) continue;
      }
      if (drawn.size >= MAX_BUILT && !makeRoom(want.distance)) break;
      const entry = build(want.id, want.site);
      if (entry === null) continue;
      arrive(entry);
    }
    return began;
  }

  /**
   * Anything somebody else is driving moves every frame; a parked one is set
   * down again now and then, on whatever made ground has arrived.
   */
  function tendStanding(dt: number): void {
    drivenNow.length = 0;
    for (const entry of drawn.values()) {
      if (state.coast !== null && state.coast.entry === entry) {
        drivenNow.push(entry);
        continue;
      }
      const moved = link.moved.get(entry.id);
      if (moved !== undefined) {
        const driven = link.sample(entry.id, pose);
        if (driven || isPose(moved.pose)) {
          if (driven) {
            applyPose(pose, entry.group);
            drivenNow.push(entry);
            animate(entry, dt, pose);
            entry.reseat = 0;
          } else {
            // Where it was left, set down on its wheels there — on the
            // ground as it is drawn here, which every client agrees on —
            // and again now and then as the ground under it arrives.
            entry.reseat -= dt;
            if (entry.reseat <= 0) {
              entry.reseat = RESEAT_SECONDS;
              applyPose(seat(entry.model, moved.pose, pose), entry.group);
            }
            settle(entry, dt);
          }
          entry.site = null;
          continue;
        }
      }
      if (entry.site === null && !entry.siteless) {
        // Moved once and since expired or reset: back to its site.
        entry.site = sites.byId(entry.id);
        entry.siteless = entry.site === null;
        entry.reseat = 0;
      }
      entry.reseat -= dt;
      if (entry.reseat <= 0 && entry.site !== null) {
        entry.reseat = RESEAT_SECONDS;
        applyPose(sitePose(entry.site, pose), entry.group);
      }
      settle(entry, dt);
    }
  }

  function frame(dt: number, camera?: THREE.Camera): void {
    warmUp();
    rescan(dt);
    const began = buildWanted(camera);
    airstrips.update(dt, began);
    tendStanding(dt);
  }

  return { drivenNow, frame };
}
