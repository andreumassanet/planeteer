// What swims: schools of fish over the reef and the kelp, the odd shark, ray
// and turtle, dolphins that pass and jump, and a whale now and then far out.
//
// Draw calls: the fish, one instanced mesh without ink (a fish is a couple of
// pixels and the pen would be all of it); each kind of big swimmer its own
// instanced mesh, inked with the craft's material and hidden when none of its
// kind is near, which is nearly always; and the bubbles, one `Points`. Near
// only, capped, allocated once. Where each swimmer is lives in `sea-life/swimmers.ts`.

import * as THREE from 'three';
import { craftMaterial } from './craft/build.ts';
import { CRUISER_KINDS } from './sea-floor.ts';
import type { CruiserKind, TileLife } from './sea-floor.ts';
import { proxyOf } from './warm.ts';
import { createBubbles } from './sea-life/bubbles.ts';
import {
  dolphinGeometry,
  fishGeometry,
  fishMaterial,
  fishTime,
  rayGeometry,
  sharkGeometry,
  turtleGeometry,
  whaleGeometry,
} from './sea-life/shapes.ts';
import { MAX_CRUISERS, MAX_DOLPHINS, MAX_FISH, MAX_WHALES, createSwimmers } from './sea-life/swimmers.ts';

export interface SeaLifeFrame {
  /** The camera, world position. */
  camera: THREE.Vector3;
  /** The sky's clock, seconds: what every client agrees on. */
  seconds: number;
  /** Where a diver's head is, for his bubbles, or null. */
  diver: THREE.Vector3 | null;
  /** Where a submerged submarine's screw is, for its bubbles, and how fast it goes; or null. */
  screw: THREE.Vector3 | null;
  screwSpeed: number;
}

export interface SeaLifeStats {
  enabled: boolean;
  fish: number;
  schools: number;
  cruisers: number;
  dolphins: number;
  whales: number;
  bubbles: number;
  calls: number;
  updateMs: number;
}

export interface SeaLife {
  group: THREE.Group;
  enabled: boolean;
  readonly stats: SeaLifeStats;
  update(dt: number, frame: SeaLifeFrame, tiles: (visit: (life: TileLife) => void) => void): void;
  /** Every swimmer's position, rounded and sorted: the same clock gives the same list. */
  snapshot(): string[];
  proxies(): THREE.Object3D[];
}

export interface SeaLifeOptions {
  /** A splash on the water at a point, `reach` units across (`effects.splashAt`). */
  splash?(point: THREE.Vector3, reach: number): void;
}


export function createSeaLife(options: SeaLifeOptions = {}): SeaLife {
  const group = new THREE.Group();
  group.name = 'sea life';

  const fish = new THREE.InstancedMesh(fishGeometry(), fishMaterial(), MAX_FISH);
  fish.name = 'fish';
  fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fish.setColorAt(0, new THREE.Color());
  fish.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  fish.frustumCulled = false;
  fish.count = 0;
  group.add(fish);

  const cruiserMeshes: Record<CruiserKind, THREE.InstancedMesh> = {
    shark: new THREE.InstancedMesh(sharkGeometry(), craftMaterial(), MAX_CRUISERS),
    ray: new THREE.InstancedMesh(rayGeometry(), craftMaterial(), MAX_CRUISERS),
    turtle: new THREE.InstancedMesh(turtleGeometry(), craftMaterial(), MAX_CRUISERS),
  };
  const dolphins = new THREE.InstancedMesh(dolphinGeometry(), craftMaterial(), MAX_DOLPHINS);
  const whales = new THREE.InstancedMesh(whaleGeometry(), craftMaterial(), MAX_WHALES);
  const big = [...CRUISER_KINDS.map((kind) => cruiserMeshes[kind]), dolphins, whales];
  for (const mesh of big) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    group.add(mesh);
  }
  CRUISER_KINDS.forEach((kind) => (cruiserMeshes[kind].name = kind));
  dolphins.name = 'dolphins';
  whales.name = 'whales';

  const bubbles = createBubbles();
  group.add(bubbles.points);
  const swimmers = createSwimmers(
    { fish, cruisers: cruiserMeshes, dolphins, whales },
    options,
    bubbles.spawn,
  );
  const bigCount = swimmers.bigCount;

  const stats: SeaLifeStats = { enabled: true, fish: 0, schools: 0, cruisers: 0, dolphins: 0, whales: 0, bubbles: 0, calls: 0, updateMs: 0 };

  let diverClock = 0;
  let screwClock = 0;

  const life: SeaLife = {
    group,
    enabled: true,
    stats,
    update(dt, frame, tiles) {
      const began = performance.now();
      stats.enabled = life.enabled;
      group.visible = life.enabled;
      if (!life.enabled) return;
      fishTime.value = frame.seconds % 1000;
      swimmers.begin(frame.seconds, frame.camera);

      tiles(swimmers.visitTile);
      const fishCount = swimmers.fishCount();
      fish.count = fishCount;
      // As the big swimmers below: no school, no draw and no upload, which is
      // every frame away from a reef.
      fish.visible = fishCount > 0;
      if (fishCount > 0) {
        fish.instanceMatrix.needsUpdate = true;
        if (fish.instanceColor !== null) fish.instanceColor.needsUpdate = true;
      }

      swimmers.pods(frame, frame.seconds, dt);

      for (const mesh of big) {
        const count = mesh === dolphins ? bigCount.dolphin! : mesh === whales ? bigCount.whale! : bigCount[mesh.name]!;
        mesh.count = count;
        mesh.visible = count > 0;
        if (count > 0) mesh.instanceMatrix.needsUpdate = true;
      }

      // The diver's breath, and a submarine's screw.
      if (frame.diver !== null) {
        diverClock -= dt;
        if (diverClock <= 0) {
          diverClock = 1.4 + Math.random() * 0.8;
          for (let k = 0; k < 4; k++) bubbles.spawn(frame.diver, 1.6 + Math.random(), 0.25, 3);
        }
      }
      if (frame.screw !== null && frame.screwSpeed > 0.5) {
        screwClock -= dt * Math.min(4, frame.screwSpeed / 4);
        if (screwClock <= 0) {
          screwClock = 0.12;
          bubbles.spawn(frame.screw, 1.2, 0.6, 2.2);
        }
      }
      const alive = bubbles.update(dt);

      stats.fish = fishCount;
      stats.schools = swimmers.schoolCount();
      stats.cruisers = (bigCount.shark ?? 0) + (bigCount.ray ?? 0) + (bigCount.turtle ?? 0);
      stats.dolphins = bigCount.dolphin ?? 0;
      stats.whales = bigCount.whale ?? 0;
      stats.bubbles = alive;
      let calls = (fishCount > 0 ? 1 : 0) + (alive > 0 ? 1 : 0);
      for (const mesh of big) if (mesh.visible) calls++;
      stats.calls = calls;
      stats.updateMs = performance.now() - began;
    },
    snapshot: swimmers.snapshot,
    proxies() {
      // Programs are keyed on the instancing and the instance colour, and a
      // point sprite is not a mesh, so each proxy is drawn the way its
      // swimmers are; the geometry is the proxy's own, since the warm-up
      // disposes what it is handed.
      const fishProxy = new THREE.InstancedMesh(proxyOf(fish.material as THREE.Material).geometry, fish.material, 1);
      fishProxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
      const bigProxy = new THREE.InstancedMesh(proxyOf(dolphins.material as THREE.Material).geometry, dolphins.material, 1);
      const bubbleProxy = new THREE.BufferGeometry();
      bubbleProxy.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      return [fishProxy, bigProxy, new THREE.Points(bubbleProxy, bubbles.material)];
    },
  };

  return life;
}
