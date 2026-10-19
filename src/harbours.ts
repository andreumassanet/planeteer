/**
 * The harbours: a coastal town's piers, quays, breakwater and boats
 * (`harbours/plan.ts`, `harbours/layout.ts`), drawn near the player
 * (`harbours/build.ts`), each merged into one mesh and dissolved in and out as
 * the rest of the world is.
 *
 * Its decks are made surfaces (`madeHeightAt`, which `app/walls.ts` adds to
 * the others; a wooden one is a roof to a swimmer under it), its sheds,
 * stacks and lighthouse are walls, its lamps join the near pools
 * (`lampsNear`), and the boats at its berths are the fleet's own
 * (`fleet/site-harbours.ts`), so the towns near the player are found through
 * the fleet's site index, which has worked them out already.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import type { World } from './geo.ts';
import type { Place } from './places.ts';
import type { LandmarkSite } from './landmark-ground.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { mergeMeshes } from './merge.ts';
import type { MergePiece } from './merge.ts';
import { createFader, fadeTwin } from './fade.ts';
import { frameOpenFor } from './view.ts';
import { proxyOf } from './warm.ts';
import { createHarbourPlanner, deckRadiusAt } from './harbours/plan.ts';
import type { Harbour } from './harbours/plan.ts';
import { buildHarbour } from './harbours/build.ts';
import type { HarbourSolid } from './harbours/build.ts';
import { harbourMaterial, harbourTime } from './harbours/material.ts';
import { takenBy } from './fleet/site-harbours.ts';
import type { FleetSite, SiteIndex } from './fleet.ts';

export type { Harbour } from './harbours/plan.ts';

/** How far a harbour is built, and kept, from the player, in units; and above what height none is. */
const REACH = 900;
const KEEP = REACH * 1.25;
const CEILING = 2500;
/** How often, or after how far a move, the towns near the player are asked again. */
const RESCAN_S = 0.75;
const RESCAN_MOVE = 60;
/** How many towns not yet worked out the fleet may work out for one scan. */
const FRESH_TOWNS = 2;
/** How far a body is kept off a crate or the crane's foot past its own radius. */
const SKIN = 0.05;

export interface HarboursDeps {
  world: World;
  places: readonly Place[];
  monuments?: readonly LandmarkSite[];
  sites: SiteIndex;
  ctx: MonumentContext;
}

interface Standing {
  harbour: Harbour;
  mesh: THREE.Mesh;
  solids: HarbourSolid[];
  /** The lamps' glass, in the world. */
  lamps: THREE.Vector3[];
}

export interface HarbourStats {
  known: number;
  standing: number;
  triangles: number;
  buildMs: number;
}

export interface Harbours {
  group: THREE.Group;
  readonly stats: HarbourStats;
  update(dt: number, viewer: THREE.Vector3, altitude: number): void;
  /** The deck under a point, as a radius, or 0: a standing harbour's. */
  madeHeightAt(point: THREE.Vector3): number;
  /** `settlements.collide`'s contract: the crates and the crane's foot. */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** The standing harbours' lamps near a point, chained after the others (`roads.lampsNear`'s contract). */
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array, count: number): number;
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** The harbours planned so far, for the console and the checks. */
  known(): Harbour[];
  proxies(): THREE.Object3D[];
}

export function createHarbours(deps: HarboursDeps): Harbours {
  const { sites, ctx } = deps;
  const planner = createHarbourPlanner({ world: deps.world, places: deps.places, monuments: deps.monuments });
  const group = new THREE.Group();
  group.name = 'harbours';
  const material = harbourMaterial(ctx);
  const pieces: MergePiece[] = [];
  const fader = createFader();
  const harbours = new Map<number, Harbour>();
  const standing = new Map<number, Standing>();
  const stats: HarbourStats = { known: 0, standing: 0, triangles: 0, buildMs: 0 };
  const lastScan = new THREE.Vector3(Infinity, 0, 0);
  const found: FleetSite[] = [];
  const here = new THREE.Vector3();
  const local = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const up = new THREE.Vector3();
  let sinceScan = Infinity;

  function scan(viewer: THREE.Vector3): void {
    found.length = 0;
    sites.near(here.copy(viewer).normalize(), REACH, found, FRESH_TOWNS);
    const towns = new Set<number>();
    for (const site of found) towns.add(site.place);
    for (const p of towns) {
      if (harbours.has(p) || planner.planned(p) === null) continue;
      const harbour = planner.harbourOf(p, takenBy(sites.sitesOf(p)));
      if (harbour !== null) harbours.set(p, harbour);
    }
    stats.known = harbours.size;
  }

  function raise(harbour: Harbour): void {
    const began = performance.now();
    const { group: draft, solids, lamps } = buildHarbour(ctx, harbour);
    const merged = mergeMeshes(draft, pieces);
    // What bobs and what glows, per vertex, off each piece's own marks.
    const bob = new Float32Array((merged.position.length / 3) * 4);
    const glow = new Uint8Array(merged.position.length / 3);
    for (const piece of pieces) {
      const marks = piece.mesh.userData;
      const swing = marks.harbourBob as number[] | undefined;
      for (let i = piece.first; i < piece.first + piece.count; i++) {
        if (swing !== undefined) bob.set(swing, i * 4);
        if (marks.harbourGlow === 1) glow[i] = 255;
      }
    }
    pieces.length = 0;
    draft.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    const outline = new Int8Array(merged.outline.length);
    for (let i = 0; i < outline.length; i++) outline[i] = Math.round(merged.outline[i]! * 127);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
    geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outline, 3, true));
    geometry.setAttribute('harbourBob', new THREE.BufferAttribute(bob, 4));
    geometry.setAttribute('harbourGlow', new THREE.BufferAttribute(glow, 1, true));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `harbour:${harbour.place}`;
    // `across = up x out`, so across, up, out is a proper basis.
    up.copy(harbour.root);
    basis.makeBasis(harbour.across, up, harbour.out);
    if (basis.determinant() <= 0) throw new Error('harbours: the frame would be mirrored');
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(harbour.root).multiplyScalar(PLANET_RADIUS);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    fader.in(mesh);
    mesh.updateMatrixWorld(true);
    for (const lamp of lamps) lamp.applyMatrix4(mesh.matrixWorld);
    standing.set(harbour.place, { harbour, mesh, solids, lamps });
    stats.triangles += merged.triangles;
    stats.buildMs = performance.now() - began;
  }

  function drop(p: number): void {
    const entry = standing.get(p);
    if (entry === undefined) return;
    standing.delete(p);
    stats.triangles -= entry.mesh.geometry.getAttribute('position').count / 3;
    fader.out(entry.mesh, () => {
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    });
  }

  /** A point in a harbour's frame: `x` across, `z` out, from its root. */
  function toLocal(harbour: Harbour, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    here.copy(point).normalize().sub(harbour.root);
    return out.set(here.dot(harbour.across) * PLANET_RADIUS, point.length() - PLANET_RADIUS, here.dot(harbour.out) * PLANET_RADIUS);
  }

  const freePush = new THREE.Vector3();

  function collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean {
    let hit = false;
    push.set(0, 0, 0);
    for (const { harbour, solids } of standing.values()) {
      if (solids.length === 0 || harbour.root.angleTo(here.copy(point).normalize()) * PLANET_RADIUS > harbour.extent + 20) continue;
      toLocal(harbour, point, local);
      for (const solid of solids) {
        if (local.y > solid.top) continue;
        const dx = local.x - solid.x;
        const dz = local.z - solid.z;
        const ox = solid.hx + radius - Math.abs(dx);
        const oz = solid.hz + radius - Math.abs(dz);
        if (ox <= 0 || oz <= 0) continue;
        hit = true;
        // Out by the shorter way, along the harbour's own axes.
        if (ox < oz) push.addScaledVector(harbour.across, Math.sign(dx || 1) * (ox + SKIN));
        else push.addScaledVector(harbour.out, Math.sign(dz || 1) * (oz + SKIN));
      }
    }
    return hit;
  }

  return {
    group,
    stats,
    update(dt, viewer, altitude) {
      fader.update();
      harbourTime.value = (harbourTime.value + dt) % 3600;
      sinceScan += dt;
      if (altitude > CEILING) {
        for (const p of [...standing.keys()]) drop(p);
        return;
      }
      if (sinceScan > RESCAN_S || lastScan.distanceToSquared(viewer) > RESCAN_MOVE * RESCAN_MOVE) {
        sinceScan = 0;
        lastScan.copy(viewer);
        scan(viewer);
      }
      const unit = here.copy(viewer).normalize();
      let raised = 0;
      for (const [p, harbour] of harbours) {
        const distance = harbour.root.angleTo(unit) * PLANET_RADIUS;
        if (standing.has(p)) {
          if (distance > KEEP) drop(p);
          continue;
        }
        if (distance > REACH || !frameOpenFor(raised, distance < REACH / 2, 'harbours')) continue;
        raise(harbour);
        raised++;
      }
      stats.standing = standing.size;
    },
    madeHeightAt(point) {
      let best = 0;
      for (const { harbour } of standing.values()) {
        const deck = deckRadiusAt(harbour, point);
        if (deck > best) best = deck;
      }
      return best;
    },
    collide,
    lampsNear(viewer, radius, out, count) {
      const max = Math.floor(out.length / 4);
      let n = Math.min(count, max);
      for (const { lamps } of standing.values()) {
        for (const lamp of lamps) {
          const d = lamp.distanceTo(viewer);
          if (d > radius) continue;
          // Sorted by distance and capped, as the others insert.
          let at = n < max ? n : max - 1;
          if (n === max && d >= out[at * 4 + 3]!) continue;
          while (at > 0 && out[(at - 1) * 4 + 3]! > d) {
            out.copyWithin(at * 4, (at - 1) * 4, at * 4);
            at--;
          }
          out[at * 4] = lamp.x;
          out[at * 4 + 1] = lamp.y;
          out[at * 4 + 2] = lamp.z;
          out[at * 4 + 3] = d;
          if (n < max) n++;
        }
      }
      return n;
    },
    freeSpotNear(point, radius, out) {
      if (!collide(point, radius, freePush)) return false;
      out.copy(point).add(freePush);
      return true;
    },
    known: () => [...harbours.values()],
    proxies: () => [proxyOf(material), proxyOf(fadeTwin(material))],
  };
}
