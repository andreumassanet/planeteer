import * as THREE from 'three';
import { modelsFrom, rigFrom } from './kit.ts';
import type { Model, Rig } from './models.ts';

/**
 * The space kit at runtime: what `scripts/build-space.ts` wrote under
 * `models/space/`, read back for the other worlds and the title screen.
 *
 * Five static files, each one GLB of many models, loaded whole and only when a
 * caller asks for that group — `buildings` (the colony), `craft` (rovers and
 * ships), `props` (rocks, crystals, clutter), `flora` (alien plants) and
 * `interior` (a ship's bridge) — and one file a creature, with its skeleton and the clips it
 * plays. `manifest.json` lists every model with its group, triangles, size in
 * the pack's units, tags and clips, so a caller can choose before fetching.
 *
 * **Nothing here is in Earth's first load.** Import it with `import()` from
 * the worlds or the title screen; it pulls `kit.ts` and `models.ts` with it,
 * which are already deferred chunks. Every slot keeps the pack's own colour;
 * the caller paints it.
 */

const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/space/`;

export type SpaceGroup = 'buildings' | 'craft' | 'props' | 'flora' | 'interior';

/** How a creature moves: the crew are astronauts, the rest are the aliens. */
export type CreatureKind = 'crew' | 'walker' | 'blob' | 'flyer';

/** One row of `manifest.json`. */
export interface SpaceEntry {
  id: string;
  group: SpaceGroup | 'creatures';
  file: string;
  pack: string;
  source: string;
  triangles: number;
  /** Bounding box, x by y by z, in the pack's own units (a creature's in its bind pose, arms out). */
  size: [number, number, number];
  slots: number;
  tags: string[];
  kind?: CreatureKind;
  bones?: number;
  clips?: { name: string; seconds: number }[];
  bytes?: number;
}

export interface SpacePiece {
  entry: SpaceEntry;
  /** Indexed, creased, with `outlineNormal` and its colour slots; feet on y = 0 as authored. */
  model: Model;
}

/** What a creature is asked to do; `clipFor` answers with the pack's clip for it. */
export type ClipRole = 'idle' | 'walk' | 'run' | 'greet' | 'yes' | 'no' | 'jump' | 'dance' | 'hover' | 'fly';

/** The pack clips that play a role, best first. Flyers hover where walkers stand. */
const ROLE_CLIPS: Record<ClipRole, readonly string[]> = {
  idle: ['Idle', 'Flying_Idle'],
  walk: ['Walk', 'Flying_Idle'],
  run: ['Run', 'Fast_Flying', 'Walk'],
  greet: ['Wave', 'Dance', 'Yes'],
  yes: ['Yes'],
  no: ['No'],
  jump: ['Jump'],
  dance: ['Dance', 'Wave', 'Yes'],
  hover: ['Flying_Idle', 'Idle'],
  fly: ['Fast_Flying', 'Flying_Idle', 'Run'],
};

export interface SpaceCreature {
  entry: SpaceEntry;
  rig: Rig;
  /** The clip that plays `role`, or `null` when the creature has none for it. */
  clipFor(role: ClipRole): THREE.AnimationClip | null;
  /** Standing height in the pack's units: scale by `height / creature.height` to stand it `height` tall. */
  height: number;
}

let manifest: Promise<SpaceEntry[]> | null = null;

async function fetchBytes(file: string): Promise<ArrayBuffer> {
  const response = await fetch(`${BASE}${file}`);
  if (!response.ok) throw new Error(`space-kit: ${file} answered ${response.status}`);
  return response.arrayBuffer();
}

/** Every model the bake wrote. Fetched once. */
export function loadSpaceManifest(): Promise<SpaceEntry[]> {
  if (manifest === null) {
    manifest = fetch(`${BASE}manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`space-kit: manifest.json answered ${response.status}`);
        return response.json() as Promise<{ models: SpaceEntry[] }>;
      })
      .then((json) => json.models);
    manifest.catch(() => (manifest = null));
  }
  return manifest;
}

/** A group's models from its file's bytes, keyed by id; works in Node given the bytes. */
export async function spaceGroupFrom(bytes: ArrayBuffer | Uint8Array, entries: readonly SpaceEntry[]): Promise<Map<string, SpacePiece>> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const pieces = new Map<string, SpacePiece>();
  for (const model of await modelsFrom(bytes)) {
    const entry = byId.get(model.name);
    if (entry === undefined) throw new Error(`space-kit: ${model.name} is not in the manifest`);
    pieces.set(model.name, { entry, model });
  }
  return pieces;
}

const groups = new Map<SpaceGroup, Promise<Map<string, SpacePiece>>>();

/** One static group, fetched once and shared; a failed load is tried again on the next ask. */
export function loadSpaceGroup(group: SpaceGroup): Promise<Map<string, SpacePiece>> {
  let pending = groups.get(group);
  if (pending === undefined) {
    pending = Promise.all([loadSpaceManifest(), fetchBytes(`${group}.bin`)]).then(([entries, bytes]) =>
      spaceGroupFrom(bytes, entries.filter((entry) => entry.group === group)),
    );
    pending.catch(() => groups.delete(group));
    groups.set(group, pending);
  }
  return pending;
}

/** A creature from its file's bytes; works in Node given the bytes. */
export async function spaceCreatureFrom(bytes: ArrayBuffer | Uint8Array, entry: SpaceEntry, material: THREE.Material): Promise<SpaceCreature> {
  const rig = await rigFrom(bytes, entry.id, material);
  const byName = new Map(rig.clips.map((clip) => [clip.name, clip]));
  return {
    entry,
    rig,
    height: entry.size[1],
    clipFor(role) {
      for (const name of ROLE_CLIPS[role]) {
        const clip = byName.get(name);
        if (clip !== undefined) return clip;
      }
      return null;
    },
  };
}

const creatures = new Map<string, Promise<SpaceCreature>>();

/**
 * A creature by id, fetched once and shared. The rig's body takes `material`
 * the first time it is asked for.
 */
export function loadCreature(id: string, material: THREE.Material): Promise<SpaceCreature> {
  let pending = creatures.get(id);
  if (pending === undefined) {
    pending = loadSpaceManifest().then(async (entries) => {
      const entry = entries.find((row) => row.id === id && row.group === 'creatures');
      if (entry === undefined) throw new Error(`space-kit: no creature ${id}`);
      return spaceCreatureFrom(await fetchBytes(entry.file), entry, material);
    });
    pending.catch(() => creatures.delete(id));
    creatures.set(id, pending);
  }
  return pending;
}
