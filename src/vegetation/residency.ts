/** The tiles that stand: records, residency counts, and moving a tile through staged, shown, retiring and released. */
import type * as THREE from 'three';
import { createFader } from '../fade.ts';
import { LEVELS } from '../tile-grid.ts';
import { overlaps } from './tiles.ts';
import type { Standing, Tile } from './tiles.ts';
import type { Built } from './tiles.ts';

/** The tiles that are standing, and the subsets other systems query. */
export interface StreamState {
  standing: Map<string, Standing>;
  /**
   * Tiles no longer wanted and still drawn, until every wanted tile covering
   * their ground is standing, barren or refused.
   */
  retiring: Map<string, Standing>;
  /** Drawn tiles that have solids: solid from the frame shown to the frame released, retiring included. */
  walled: Set<Standing>;
  /** Drawn tiles with crowns that shed. */
  crowned: Set<Standing>;
  /** Drawn tiles with a vehicle that can be taken. */
  machined: Set<Standing>;
}

/** Everything the streamer keeps about what stands and what has been decided. */
export interface Residency extends StreamState {
  /** Tiles that were asked and had nothing on them: open ocean, ice cap, an empty desert. */
  barren: Set<string>;
  /**
   * Triangles standing, kept incrementally. The scan's budget is spent against
   * an estimate, which is not a cap, so the build loop also stops the moment
   * what stands passes the budget; the queue is nearest first, so it drops the
   * furthest.
   */
  residentTriangles: number;
  residentByLevel: number[];
  /** The wanted tiles of the last scan. */
  wanted: Tile[];
  /**
   * Wanted tiles the build turned away since the last scan (over their level's
   * share, or left in the queue at the cap). `settle` counts them as barren so
   * a retiring tile does not wait on them forever.
   */
  refused: Set<string>;
  /** Near tiles whose fields lie on the relief because the drawn land was not ready; built again, and swapped, once it is. */
  provisional: Set<string>;
  fader: ReturnType<typeof createFader>;
}

export function createResidency(): Residency {
  return {
    standing: new Map(),
    retiring: new Map(),
    walled: new Set(),
    crowned: new Set(),
    machined: new Set(),
    barren: new Set(),
    residentTriangles: 0,
    residentByLevel: new Array<number>(LEVELS).fill(0),
    wanted: [],
    refused: new Set(),
    provisional: new Set(),
    fader: createFader(),
  };
}

export function release(r: Residency, group: THREE.Group, entry: Standing): void {
  r.walled.delete(entry);
  r.crowned.delete(entry);
  r.machined.delete(entry);
  // The geometry is this tile's; the material is shared by every tile.
  const mesh = entry.mesh;
  const leaves = entry.leaves;
  if (!entry.shown) {
    mesh.geometry.dispose();
    leaves?.geometry.dispose();
    return;
  }
  // Dissolved away (`fade.ts`); the leaves go with their tile, on the same clock.
  if (leaves !== null) r.fader.out(leaves, () => leaves.geometry.dispose());
  r.fader.out(mesh, () => {
    group.remove(mesh);
    mesh.geometry.dispose();
  });
}

export function drop(r: Residency, group: THREE.Group, key: string): void {
  const entry = r.standing.get(key);
  if (entry === undefined) return;
  release(r, group, entry);
  r.residentTriangles -= entry.priced;
  r.residentByLevel[entry.level]! -= entry.priced;
  r.standing.delete(key);
}

/**
 * A level-of-detail swap happens in one frame or it is a hole. A tile the
 * scan no longer wants retires: it stays drawn until every wanted tile that
 * covers any of its ground is standing, known barren or refused, and a tile
 * built while a retiring one still covers its ground is staged (built,
 * counted, not drawn). A tile leaving the range altogether goes at once.
 */
export function retire(r: Residency, group: THREE.Group, key: string): void {
  const entry = r.standing.get(key);
  if (entry === undefined) return;
  r.standing.delete(key);
  r.residentTriangles -= entry.priced;
  r.residentByLevel[entry.level]! -= entry.priced;
  // One never drawn has nothing on the screen to hold.
  if (entry.shown) r.retiring.set(key, entry);
  else release(r, group, entry);
}

/** Releases retiring tiles whose ground is covered, and shows staged tiles nothing retiring holds. */
export function settle(r: Residency, group: THREE.Group): void {
  if (r.retiring.size > 0) {
    for (const [key, old] of r.retiring) {
      let covered = true;
      for (const tile of r.wanted) {
        if (!overlaps(old, tile)) continue;
        if (r.standing.has(tile.key) || r.barren.has(tile.key) || r.refused.has(tile.key)) continue;
        covered = false;
        break;
      }
      if (!covered) continue;
      release(r, group, old);
      r.retiring.delete(key);
    }
  }
  for (const entry of r.standing.values()) {
    if (entry.shown) continue;
    let held = false;
    for (const old of r.retiring.values()) {
      if (overlaps(old, entry)) {
        held = true;
        break;
      }
    }
    if (held) continue;
    group.add(entry.mesh);
    r.fader.in(entry.mesh);
    if (entry.leaves !== null) r.fader.in(entry.leaves);
    entry.shown = true;
    if (entry.walls !== null) r.walled.add(entry);
    if (entry.crowns !== null) r.crowned.add(entry);
    if (entry.machines !== null) r.machined.add(entry);
  }
}

/** Records a built tile as standing (not yet drawn: `settle` shows it). */
export function admit(r: Residency, tile: Tile, result: Built): void {
  r.standing.set(tile.key, {
    mesh: result.mesh!,
    priced: result.priced,
    leaves: result.leaves,
    triangles: result.triangles,
    plants: result.plants,
    bytes: result.bytes,
    pieces: result.pieces,
    fields: result.fields,
    fences: result.fences,
    motion: result.motion,
    level: tile.level,
    row: tile.row,
    column: tile.column,
    shown: false,
    walls: result.walls,
    crowns: result.crowns,
    machines: result.machines,
  });
  if (result.provisional) r.provisional.add(tile.key);
  else r.provisional.delete(tile.key);
  r.residentTriangles += result.priced;
  r.residentByLevel[tile.level] = r.residentByLevel[tile.level]! + result.priced;
}
