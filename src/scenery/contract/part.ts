import * as THREE from 'three';
import { measure, type Measurements } from '../../monuments/contract.ts';
import { rngFrom, type Rng } from '../random.ts';
import type { TreeForm } from '../tree-forms.ts';
import type { SceneryContext } from './context-type.ts';
import { KINDS, type PartKind } from './kinds.ts';
import type { RegionStyle } from './style.ts';

export interface ScenicPart {
  /** Kebab-case, unique, and the file is named after it: `gabled-house.ts`. */
  id: string;
  name: string;
  kind: PartKind;
  /**
   * Radius of the circle every variant must stay inside.
   *
   * Stricter than a monument's, because a monument declares a footprint for one
   * model and this one is a promise about a family: every seed built is held
   * to it. A layout that has to re-measure
   * each variant is a layout that cannot be a table of transforms.
   */
  footprint: number;
  /** One line: what this is and what it is for. */
  note?: string;
  /**
   * A triangle cap of the part's own, over its kind's. A baked model's: a
   * Kenney house is a thousand triangles where a code-built one is two hundred,
   * and the kind's cap is kept tight for the parts built in code.
   */
  triangles?: number;
  /**
   * Builds one variant.
   *
   * Deterministic in `rng` and `style` and nothing else — no `Math.random()`, no
   * `Date`, no module-level counters. `pnpm scenery` builds each variant twice
   * from the same seed and compares, exactly as the monument loader does.
   *
   * The `Group` it returns follows the monument rules: faces +Z, base at y = 0,
   * inside `footprint`, identity transform, materials only from `ctx.toon`.
   */
  build(ctx: SceneryContext, rng: Rng, style: RegionStyle): THREE.Group;
  /**
   * A tree's whole form (`tree-forms.ts`) from the same `rng` and `style`
   * `build` is handed: the trunk and limbs and the leaf cards a near tile of
   * the wood draws, where `build` is the trunk and the solid crown a town and
   * a far tile draw. The two are one tree only if `build` is `solidTree` of
   * this, drawing nothing from `rng` first.
   */
  form?(rng: Rng, style: RegionStyle): TreeForm;
}

/** The seed for one variant. Identity, not order: see `random.ts`. */
export function variantRng(part: ScenicPart, style: RegionStyle, variant: number): Rng {
  return rngFrom(part.id, style.id, variant);
}

export const round = (value: number): string => value.toFixed(1);

/** Everything wrong with one built variant, in plain English. Empty means it is fine. */
export function validatePart(part: ScenicPart, group: THREE.Group): string[] {
  const problems: string[] = [];
  const kind = KINDS[part.kind];
  if (!kind) return [`kind '${part.kind}' is not one of ${Object.keys(KINDS).join(', ')}`];

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(part.id)) problems.push(`id '${part.id}' is not kebab-case`);

  if (group.position.lengthSq() > 1e-6) problems.push('group.position must be the origin');
  if (group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('group.rotation must be identity — bake the rotation into the children');
  }
  if (Math.abs(group.scale.x - 1) > 1e-6 || Math.abs(group.scale.y - 1) > 1e-6) {
    problems.push('group.scale must be 1 — the instance carries the scale, not the variant');
  }

  group.traverse((object) => {
    if (object === group) return;
    const kinds = object as unknown as Record<string, boolean>;
    if (kinds.isPoints || kinds.isLine || kinds.isSprite) {
      problems.push(`${object.type} is not allowed: OutlineEffect only inks meshes`);
      return;
    }
    if (kinds.isLight || kinds.isCamera) {
      problems.push(`${object.type} is not allowed: the scene owns the lights and the camera`);
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.userData.atlasToon === undefined) {
        problems.push(`a ${material.type} escaped ctx.toon — every material must come from it`);
      }
      if (material.side !== THREE.FrontSide) {
        problems.push('materials must stay FrontSide — the outline is an inverted back-face hull');
      }
    }
  });

  const { triangles, meshes, height, base, radius, colors } = measure(group);
  if (meshes === 0) {
    problems.push('the variant is empty');
    return problems;
  }

  if (Math.abs(base) > 0.06) {
    problems.push(base < 0 ? `sinks ${round(-base)} below y = 0` : `floats ${round(base)} above y = 0`);
  }
  if (!(part.footprint > 0) || part.footprint > kind.footprint) {
    problems.push(`footprint ${part.footprint} is outside the '${part.kind}' kind's 0..${kind.footprint}`);
  }
  if (radius > part.footprint + 0.05) {
    problems.push(`reaches ${round(radius)} out, past its ${part.footprint}-unit footprint`);
  }
  if (height > kind.height + 0.05) {
    problems.push(`is ${round(height)} tall, over the '${part.kind}' cap of ${kind.height}`);
  }
  if (height < kind.minHeight) {
    problems.push(`is only ${round(height)} tall — under the '${part.kind}' floor of ${kind.minHeight}`);
  }
  const budget = part.triangles ?? kind.triangles;
  if (triangles > budget) {
    problems.push(`${triangles} triangles, over the '${part.id}' budget of ${budget}`);
  }
  if (meshes > kind.meshes) {
    problems.push(`${meshes} meshes, over the '${part.kind}' budget of ${kind.meshes}`);
  }
  if (colors.length > kind.colors) {
    problems.push(
      `${colors.length} palette colours, over the '${part.kind}' budget of ${kind.colors} — ` +
        `colours are draw calls here, see KindSpec.colors`,
    );
  }
  problems.push(...doorClashes(group));
  return problems;
}

/**
 * Every place a door crosses a window in a built variant: a door's frame or
 * leaf (`atlasDoor`) against any triangle of glazing, a window's frame or its
 * shutters (`atlasWindow`, or lit and not a door). A triangle's box is tested
 * rather than a mesh's, because a row of frames is one mesh and its box spans
 * the gaps a door may stand in. Touching is allowed; a hundredth of a unit of
 * overlap on every axis is a clash.
 */
export function doorClashes(group: THREE.Object3D): string[] {
  group.updateMatrixWorld(true);
  const doors: THREE.Box3[] = [];
  const openings: THREE.Mesh[] = [];
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.atlasDoor === true) doors.push(new THREE.Box3().setFromObject(mesh));
    else if (mesh.userData.atlasWindow === true || typeof mesh.userData.atlasLit === 'number') openings.push(mesh);
  });
  if (doors.length === 0 || openings.length === 0) return [];
  const problems: string[] = [];
  const triangle = new THREE.Box3();
  const v = new THREE.Vector3();
  const EPS = 0.01;
  // A flat face has no extent across itself, so on that axis lying inside
  // the other box is enough.
  const axis = (a0: number, a1: number, b0: number, b1: number): boolean => {
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    return overlap > EPS || (overlap >= 0 && Math.min(a1 - a0, b1 - b0) < EPS);
  };
  const overlaps = (a: THREE.Box3, b: THREE.Box3): boolean =>
    axis(a.min.x, a.max.x, b.min.x, b.max.x) && axis(a.min.y, a.max.y, b.min.y, b.max.y) && axis(a.min.z, a.max.z, b.min.z, b.max.z);
  for (const mesh of openings) {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count && problems.length === 0; i += 3) {
      triangle.makeEmpty();
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld);
        triangle.expandByPoint(v);
      }
      for (const door of doors) {
        if (overlaps(door, triangle)) {
          const c = triangle.getCenter(v);
          problems.push(`a door crosses a window at (${round(c.x)}, ${round(c.y)}, ${round(c.z)})`);
          break;
        }
      }
    }
  }
  return problems;
}

/**
 * The height of every door a built variant opens, in the variant's units: what
 * `ctx.door` and a part's own doorway or a fitted model's door mark as
 * `atlasDoorHeight`, through the scale above the mark.
 */
export function doorHeights(group: THREE.Object3D): number[] {
  group.updateMatrixWorld(true);
  const heights: number[] = [];
  const scale = new THREE.Vector3();
  group.traverse((object) => {
    const height = object.userData.atlasDoorHeight;
    if (typeof height !== 'number') return;
    object.getWorldScale(scale);
    heights.push(height * scale.y);
  });
  return heights;
}

export interface Variety {
  /** Distinct silhouettes across the sample, by height and width to a tenth of a unit. */
  shapes: number;
  /** Distinct colour sets across the sample. */
  palettes: number;
  samples: number;
}

/**
 * How much a part actually varies. A part that ignores its seed produces a
 * village of one house repeated, which no bounding-box check can see; this is
 * the mechanical half of that judgement.
 */
export function varietyOf(measurements: readonly Measurements[]): Variety {
  const shapes = new Set<string>();
  const palettes = new Set<string>();
  for (const m of measurements) {
    // A tenth of a unit is a bin for a house and about a fifth of a head for a
    // 3.77-unit person, so the bins are one per cent wide on a log
    // scale: the same share of a figure as of a tower.
    const bin = (value: number): number => Math.round(Math.log(Math.max(value, 1e-3)) * 100);
    shapes.add(`${bin(m.height)}x${bin(m.radius)}`);
    palettes.add([...m.colors].sort((a, b) => a - b).join(','));
  }
  return { shapes: shapes.size, palettes: palettes.size, samples: measurements.length };
}
