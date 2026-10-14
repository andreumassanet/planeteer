/**
 * Which movers should exist: each family offers candidates near the viewer,
 * and the nearest win under a cap per family and one over all of them, so
 * the cast thins from the horizon inwards.
 */
import * as THREE from 'three';
import type { Folk } from '../folk.ts';
import { prominenceVersion } from '../places.ts';
import { detailCount, detailVersion, slantRange } from '../view.ts';
import type { ViewCone } from '../view.ts';
import type { HerdProbe, LifeStats } from './api.ts';
import type { Birds } from './birds.ts';
import type { HerdScan } from './herd-scan.ts';
import { emptyFrame, wayFor } from './mover.ts';
import type { Family, Mover } from './mover.ts';
import type { PlaceIndex } from './place-index.ts';
import type { SeaScan } from './sea-scan.ts';
import {
  ARRIVE_CLEAR,
  CEILING,
  EMERGE_BEYOND,
  FOOT_MOVERS,
  FRESH_JUMP,
  HERD_MOVERS,
  MAX_MOVERS,
  RESCAN_MOVE,
  RESCAN_MS,
  RESCAN_TURN,
  ROAD_MOVERS,
  WATER_MOVERS,
  moverReach,
} from './tuning.ts';

/** A mover as a family scan offers it; `lane` and `keep` seed a road vehicle's `Way`. */
export type Candidate = Omit<Mover, 'at' | 'mesh' | 'distance' | 'way'> & { lane?: number; keep?: number };

export type Consider = (mover: Candidate, viewer: THREE.Vector3, range: number) => void;

/** Caches each part empties wholesale past this size; they hold pure functions of a coordinate. */
const CACHE_CAP = 20_000;

export interface Scan {
  /**
   * Re-derives the cast at `clock` when the detail knob or the towns have
   * changed, `RESCAN_MS` has passed, or the viewer has moved, turned or
   * climbed far enough. `now` is real milliseconds.
   */
  rescanIfDue(viewer: THREE.Vector3, altitude: number, clock: number, now: number): void;
}

interface ScanDeps {
  movers: Map<string, Mover>;
  cone: ViewCone;
  group: THREE.Group;
  folk: Folk | undefined;
  stats: LifeStats;
  herds: HerdProbe;
  scanRoads(viewer: THREE.Vector3, roadRange: number, footRange: number, consider: Consider): void;
  sea: SeaScan;
  pasture: HerdScan;
  birds: Birds;
  placeIndex: PlaceIndex;
  refused: Set<string>;
  releaseHerd(mover: Mover): void;
  /** Called when the prominence knob has changed which towns are built. */
  townsChanged(): void;
}

export function createScan(deps: ScanDeps): Scan {
  const { movers, cone, group, folk, stats, herds, sea, pasture, birds, placeIndex, refused, releaseHerd } = deps;
  const candidates: Mover[] = [];
  const probeFrame = emptyFrame();
  const point = new THREE.Vector3();
  let clockNow = 0;
  let freshCast = true;
  let scannedVersion = -1;
  const scanned = new THREE.Vector3(Infinity, 0, 0);
  const scannedAxis = new THREE.Vector3(0, 0, -1);
  /** The other knob: which towns exist (`PROMINENCE_RADIUS`). */
  let scannedProminence = -1;
  let scannedAltitude = -1;
  let scannedMs = -Infinity;

  /**
   * Keeps a candidate if it is in range and on screen. A standing mover that
   * has left the frame gives up its slot. The distance skips the ground query:
   * the relief is within the rescan's hysteresis.
   */
  const consider: Consider = (mover, viewer, range) => {
    const standing = movers.get(mover.key);
    if (standing !== undefined) {
      if (!cone.keeps(standing.at, 20)) return;
      standing.distance = standing.at.distanceTo(viewer);
      candidates.push(standing);
      return;
    }
    mover.route(clockNow, probeFrame, false);
    point.copy(probeFrame.dir).multiplyScalar(probeFrame.height);
    const distance = point.distanceTo(viewer);
    if (distance > range || !cone.admits(point, 14)) return;
    // A vehicle arrives by driving in, out of the haze or a town, unless the
    // whole cast is being laid out afresh.
    if (mover.family === 'road' && !freshCast && probeFrame.live && distance < range * EMERGE_BEYOND) return;
    if ((mover.family === 'road' || mover.family === 'water') && distance < ARRIVE_CLEAR) return;
    const { lane, keep, ...rest } = mover;
    candidates.push({
      ...rest, at: point.clone(), mesh: null, distance,
      way: mover.family === 'road' ? wayFor(mover.key, lane ?? 0, keep ?? 1) : undefined,
    });
  };

  /** Spends the budget nearest first and lets go of every mover not kept. */
  function admit(): void {
    herds.admitted = 0;
    candidates.sort((a, b) => a.distance - b.distance);
    const caps: Record<Family, number> = {
      road: Math.min(MAX_MOVERS, detailCount(ROAD_MOVERS)),
      water: Math.min(MAX_MOVERS, detailCount(WATER_MOVERS)),
      foot: Math.min(MAX_MOVERS, detailCount(FOOT_MOVERS)),
      herd: Math.min(MAX_MOVERS, detailCount(HERD_MOVERS)),
    };
    const taken: Record<Family, number> = { road: 0, water: 0, foot: 0, herd: 0 };
    const keep = new Set<string>();
    let total = 0;
    for (const candidate of candidates) {
      if (total >= MAX_MOVERS) break;
      if (taken[candidate.family] >= caps[candidate.family]) continue;
      taken[candidate.family]++;
      if (candidate.family === 'herd') herds.admitted++;
      total++;
      keep.add(candidate.key);
      if (!movers.has(candidate.key)) movers.set(candidate.key, candidate);
    }
    for (const [key, mover] of movers) {
      if (keep.has(key)) continue;
      if (mover.animated) releaseHerd(mover);
      if (mover.person) {
        group.remove(mover.person.holder);
        // Back to the cast's pool, not disposed: see `Cast.release`.
        folk?.release(mover.person.person);
        mover.person = null;
      }
      if (mover.mesh !== null) {
        group.remove(mover.mesh);
        mover.mesh = null;
      }
      movers.delete(key);
    }
  }

  function trim(): void {
    birds.trim(CACHE_CAP);
    pasture.trim(CACHE_CAP);
    sea.trim(CACHE_CAP);
    placeIndex.trim(CACHE_CAP);
    // A herd's pool key is its site, so refusals grow with distance travelled.
    if (refused.size > CACHE_CAP) refused.clear();
  }

  /** Re-derives the cast. `fresh` (the first scan, or a jump) lets vehicles appear in plain view. */
  function scan(viewer: THREE.Vector3, altitude: number, clock: number, fresh: boolean): void {
    clockNow = clock;
    freshCast = fresh;
    candidates.length = 0;
    // A zero reach must give a zero range: `slantRange` of zero reach is the
    // altitude itself, which would admit the ground under an aircraft.
    const rangeFor = (family: keyof typeof CEILING): number => {
      const along = moverReach(family, altitude);
      return along <= 0 ? 0 : slantRange(altitude, along);
    };
    const roadRange = rangeFor('road');
    const waterRange = rangeFor('water');
    const footRange = rangeFor('foot');
    const birdRange = rangeFor('air');
    const herdRange = rangeFor('herd');
    stats.reach = moverReach('road', altitude);

    deps.scanRoads(viewer, roadRange, footRange, consider);
    sea.scan(viewer, waterRange, consider);
    herds.altitude = altitude;
    pasture.scan(viewer, herdRange, consider);
    birds.scan(viewer, birdRange, cone);
    admit();
    trim();
    scannedVersion = detailVersion();
  }

  function rescanIfDue(viewer: THREE.Vector3, altitude: number, clock: number, now: number): void {
    if (prominenceVersion() !== scannedProminence) {
      // The herds were admitted against the towns as they were.
      scannedProminence = prominenceVersion();
      deps.townsChanged();
      scannedVersion = -1;
    }
    if (
      detailVersion() !== scannedVersion ||
      now - scannedMs > RESCAN_MS ||
      viewer.distanceTo(scanned) > RESCAN_MOVE ||
      cone.turnFrom(scannedAxis) > RESCAN_TURN ||
      Math.abs(altitude - scannedAltitude) > Math.max(60, scannedAltitude * 0.25)
    ) {
      const fresh = scanned.x === Infinity || viewer.distanceTo(scanned) > FRESH_JUMP;
      scanned.copy(viewer);
      scannedAxis.copy(cone.axis);
      scannedAltitude = altitude;
      scannedMs = now;
      scan(viewer, altitude, clock, fresh);
      stats.lastScanMs = Number((performance.now() - now).toFixed(2));
    }
  }

  return { rescanIfDue };
}
