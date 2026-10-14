/** What the crowd's parts share: the group, the pools and the maps of who is where. */

import * as THREE from 'three';
import type { Civilisation, WindSpec, WorldSpec } from '../contract.ts';
import type { Settlements, Site } from '../settlements.ts';
import type { Rigged } from '../../models.ts';
import type { CreatureCast } from '../contract.ts';
import type { KeepClear, Plan, Walker } from './types.ts';

export interface CrowdState {
  spec: WorldSpec;
  civ: Civilisation | null;
  cast: CreatureCast | undefined;
  settlements: Settlements;
  keepClear: (site: Site) => readonly KeepClear[];
  group: THREE.Group;
  material: THREE.MeshToonMaterial;
  stats: { walkers: number; bodies: number; buildMs: number; animated: number; pooled: number };
  walkers: Walker[];
  plans: Map<string, Plan>;
  peopled: Set<string>;
  /** Rigs put away, by creature id, to stand up again. */
  pool: Map<string, Rigged[]>;
  windLean: number;
  wind: WindSpec | null;
  /** Upwind, in a town's frame (+X west, +Z north). */
  upwind: { x: number; z: number } | null;
}

export function createCrowdState(spec: WorldSpec, settlements: Settlements, gradientMap: THREE.Texture, keepClear: (site: Site) => readonly KeepClear[]): CrowdState {
  const group = new THREE.Group();
  group.name = 'world-crowd';
  const civ = spec.civilisation;
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.name = 'world:aliens';
  // Inked along the welded normals, as the cast is.
  material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01], outlineNormal: true };
  const wind: WindSpec | null = spec.wind;
  return {
    spec,
    civ,
    cast: civ?.cast,
    settlements,
    keepClear,
    group,
    material,
    stats: { walkers: 0, bodies: 0, buildMs: 0, animated: 0, pooled: 0 },
    walkers: [],
    plans: new Map(),
    peopled: new Set(),
    pool: new Map(),
    windLean: civ?.species.morph.windLean ?? 0,
    wind,
    upwind: wind === null ? null : { x: Math.sin((wind.toward * Math.PI) / 180), z: -Math.cos((wind.toward * Math.PI) / 180) },
  };
}
