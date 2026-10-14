/**
 * The bridge of a small ship, where the title screen stands the traveller,
 * with the solar system outside a window that fills most of the wall behind.
 *
 * The window is a hole: the stage draws into a transparent canvas over the
 * planet menu, and this room covers every pixel except the window's bays, so
 * the menu's orrery shows through them. The glass is a faint depth-free tint.
 * Floor and ceiling are each closed by a plate cut to the plan under the
 * tiles, since a tile grid on a faceted plan leaves wedges at the walls.
 *
 * Every still piece is merged into one buffer on the world's toon material
 * (`modelMaterial`); what glows (screens, indicators, the holo pad) is a
 * second buffer whose vertices carry a phase, a rate and a kind for one
 * shader. It is loaded by dynamic import from `hero-stage.ts`, so none of it
 * is in Earth's first load.
 */
import * as THREE from 'three';
import { modelMaterial } from './models.ts';
import { loadSpaceGroup } from './space-kit.ts';
import type { SpacePiece } from './space-kit.ts';
import { H, random } from './bridge/plan.ts';
import { createPlacer } from './bridge/placer.ts';
import { floorAndCeiling, furniture, pipes, walls } from './bridge/room.ts';
import type { BridgeBay } from './bridge/room.ts';
import { dust, glassPanes, glowMaterial, holoBeam, tinyPlanet, tinyRing } from './bridge/effects.ts';

export type { BridgeBay } from './bridge/room.ts';

/** What the bridge is drawn with: the ramp and the outline the hero already has. */
export interface BridgeLook {
  gradientMap: THREE.Texture;
  ink: { thickness: number; color: [number, number, number] };
}

export interface Bridge {
  /** The room, its lights and everything in it. Feet on y = 0 at the origin, the window towards -z. */
  group: THREE.Group;
  /** The window's bays, for a camera that leaves through one. */
  bays: readonly BridgeBay[];
  /** The small life: `time` in seconds, `pointScale` the pixels a world unit spans at one unit away. */
  update(time: number, pointScale: number): void;
  dispose(): void;
}

export function loadBridgePieces(): Promise<Map<string, SpacePiece>> {
  return loadSpaceGroup('interior');
}

/** The room, put together from the kit's pieces. Throws if a piece the plan needs is missing. */
export function buildBridge(pieces: ReadonlyMap<string, SpacePiece>, look: BridgeLook): Bridge {
  const placer = createPlacer(pieces, random(0x5b1d6e));
  floorAndCeiling(placer);
  const bays = walls(placer, pieces);
  pipes(placer, pieces);
  const { table, padTop } = furniture(placer, pieces);

  const group = new THREE.Group();
  group.name = 'bridge';
  const material = modelMaterial(look.gradientMap, look.ink);
  const room = new THREE.Mesh(placer.solid.geometry(true), material);
  room.name = 'bridge-room';
  room.receiveShadow = true;
  group.add(room);

  const time = { value: 0 };
  const lights = new THREE.Mesh(placer.glow.geometry(false), glowMaterial(time));
  lights.name = 'bridge-lights';
  group.add(lights);

  const glass = glassPanes();
  group.add(glass);

  // The planet over the holo table, its ring, and the beam it stands in.
  const holo = new THREE.Group();
  holo.position.set(table.x, padTop + 0.36 * H, table.z);
  const planet = new THREE.Mesh(tinyPlanet(0.16 * H), material);
  const ring = new THREE.Mesh(tinyRing(0.16 * H), material);
  ring.rotation.x = Math.PI / 2 - 0.35;
  planet.rotation.z = 0.35;
  holo.add(planet, ring);
  group.add(holo);
  const beamHeight = 0.36 * H;
  const beam = holoBeam(time, beamHeight);
  beam.position.set(table.x, padTop + beamHeight / 2 - 0.05, table.z);
  group.add(beam);

  const motes = dust(time);
  group.add(motes.points);

  // A warm lamp over the hero, the cool of the screens from the window, the holo's own.
  const lamp = new THREE.PointLight(0xffd6a8, 10, 0, 1);
  lamp.position.set(0.4 * H, 1.75 * H, 0.8 * H);
  const screens = new THREE.PointLight(0x7fd4ff, 7, 0, 1);
  screens.position.set(-0.6 * H, 0.6 * H, -1.7 * H);
  const holoLight = new THREE.PointLight(0x8fe0ff, 3, 0, 1);
  holoLight.position.copy(holo.position);
  group.add(lamp, screens, holoLight);

  const glassMaterial = glass.material as THREE.MeshBasicMaterial;
  return {
    group,
    bays,
    update(seconds, pointScale) {
      time.value = seconds;
      holo.rotation.y = seconds * 0.35;
      planet.rotation.y = seconds * 0.6;
      holo.position.y = padTop + 0.36 * H + Math.sin(seconds * 1.1) * 0.06;
      holoLight.intensity = 3 * (0.85 + 0.15 * Math.sin(seconds * 2.3));
      screens.intensity = 7 * (0.94 + 0.06 * Math.sin(seconds * 0.9));
      motes.scale.value = pointScale;
    },
    dispose() {
      for (const mesh of [room, lights, glass, planet, ring, beam]) mesh.geometry.dispose();
      motes.points.geometry.dispose();
      for (const used of [material, lights.material as THREE.Material, glassMaterial, beam.material as THREE.Material, motes.points.material as THREE.Material]) used.dispose();
      glassMaterial.map?.dispose();
    },
  };
}
