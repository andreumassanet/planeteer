/** The console's views of a tile: what one costs and holds, and whether two builds agree. */
import * as THREE from 'three';
import { pitchOf } from './levels.ts';
import { tileOver } from './enumerate.ts';
import type { TileBuilder } from './tile-builder.ts';
import type { Built } from './tiles.ts';
import type { PlantSeat, Vegetation } from './types.ts';

type Debug = Pick<Vegetation, 'sample' | 'verify' | 'raiseTile'>;

export function createDebug(builder: TileBuilder, seatLog: { current: PlantSeat[] | null }): Debug {
  return {
    sample(lat, lon, level = 0) {
      const tile = tileOver(lat, lon, level, new THREE.Vector3());
      const began = performance.now();
      const seats: PlantSeat[] = [];
      seatLog.current = seats;
      let result: Built;
      try {
        result = builder.raise(tile);
      } finally {
        seatLog.current = null;
      }
      const ms = performance.now() - began;
      result.mesh?.geometry.dispose();
      result.leaves?.geometry.dispose();
      return {
        tile: tile.key,
        at: `${tile.lat.toFixed(3)}, ${tile.lon.toFixed(3)}`,
        span: `${Math.round(tile.halfEast * 2)} x ${Math.round(tile.halfNorth * 2)} units`,
        pitch: Number(pitchOf(level).toFixed(1)),
        plots: result.plots,
        plants: result.plants,
        triangles: result.triangles,
        leaves: (result.leaves?.geometry.getAttribute('position').count ?? 0) / 3,
        inTheSea: result.inTheSea,
        builtOver: result.builtOver,
        onRoad: result.onRoad,
        onSlope: result.onSlope,
        onCountry: result.onCountry,
        pieces: result.pieces,
        fields: result.fields,
        fences: result.fences,
        fastPath: result.fastPath,
        kilobytes: Number((result.bytes / 1024).toFixed(1)),
        buildMs: Number(ms.toFixed(2)),
        provisional: result.provisional,
        seats,
      };
    },

    raiseTile(lat, lon, level = 0) {
      const result = builder.raise(tileOver(lat, lon, level, new THREE.Vector3()));
      const mesh = result.mesh;
      mesh?.updateMatrixWorld(true);
      // And what in it can be taken, for the checks to hold against the fleet's.
      if (mesh !== null) mesh.userData.machines = result.machines;
      return mesh;
    },

    /**
     * Builds a tile twice and compares every attribute: a tile draws from a
     * seed per cell, and one `Math.random()` anywhere in the chain would give a
     * different wood on every load.
     */
    verify(lat, lon, level = 0) {
      const tile = tileOver(lat, lon, level, new THREE.Vector3());
      const first = builder.raise(tile);
      const second = builder.raise(tile);
      const a = first.mesh?.geometry.getAttribute('position').array as Float32Array | undefined;
      const b = second.mesh?.geometry.getAttribute('position').array as Float32Array | undefined;
      let same = a !== undefined && b !== undefined && a.length === b.length;
      let differed = -1;
      if (same && a && b) {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            same = false;
            differed = i;
            break;
          }
        }
      }
      // The leaves, every attribute of them: a card's wind or its place on the atlas is the tree too.
      const cardsOf = (built: Built): ArrayLike<number>[] =>
        built.leaves === null ? [] : Object.values(built.leaves.geometry.attributes).map((attribute) => (attribute as THREE.BufferAttribute).array);
      const leavesA = cardsOf(first);
      const leavesB = cardsOf(second);
      let leavesSame = leavesA.length === leavesB.length;
      for (let k = 0; leavesSame && k < leavesA.length; k++) {
        const x = leavesA[k]!;
        const y = leavesB[k]!;
        if (x.length !== y.length) leavesSame = false;
        for (let i = 0; leavesSame && i < x.length; i++) if (x[i] !== y[i]) leavesSame = false;
      }
      first.mesh?.geometry.dispose();
      second.mesh?.geometry.dispose();
      first.leaves?.geometry.dispose();
      second.leaves?.geometry.dispose();
      return {
        tile: tile.key,
        plants: first.plants,
        vertices: a?.length ?? 0,
        cards: (first.leaves?.geometry.getAttribute('position').count ?? 0) / 6,
        deterministic: same && leavesSame,
        firstDifferenceAt: differed,
      };
    },
  };
}
