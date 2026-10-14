/**
 * What a tree is: a trunk and its limbs, and a crown made of clusters of leaf
 * cards (alpha-cut quads painted from one runtime atlas, `foliage.ts`).
 *
 * One generator, one pass over one `Rng`, gives everything a tree is drawn
 * from:
 *
 * - `trunk`: the bole, and for the forked species (acacia, palm) what a far
 *   eye still sees of the wood;
 * - `limbs`: the boughs a near eye sees through the leaves;
 * - `crown`: the leaves as a few smooth lumps, for a far tile or a town;
 * - `cards`: the leaves themselves, with an atlas coordinate and what the
 *   wind needs to move each one.
 *
 * A near tile (`vegetation.ts`) draws `trunk + limbs` and `cards`; a far one
 * `trunk + crown`, so the same seed is the same tree at both distances.
 * Every card carries the crown's normal rather than its own, and a colour
 * darker and cooler the deeper and lower it hangs, so the whole mass takes the
 * sun as one ball of foliage.
 *
 * Everything is in the part's own frame: y up, standing on y = 0, the axis
 * through the origin, and inside the footprint the part declares.
 */

import * as THREE from 'three';
import type { SceneryContext } from './contract.ts';
import type { Rng } from './random.ts';
import { LEAF_TEXTURE_MEAN, cardSoup, soup, type FormSpec, type Soup, type Species, type TreeForm } from './tree-forms/soup.ts';
import { SPECIES } from './tree-forms/species.ts';

export { LEAF_ATLAS, LEAF_TEXTURE_MEAN } from './tree-forms/soup.ts';
export type { CardSoup, FormSpec, Soup, Species, TreeForm } from './tree-forms/soup.ts';

/**
 * One tree of `species` from `rng`, at `spec`'s size and in its colours.
 * Deterministic in the two and nothing else; the cards draw from forks, so a
 * change to how the leaves hang moves no trunk.
 */
export function treeForm(species: Species, rng: Rng, spec: FormSpec): TreeForm {
  const form: TreeForm = { species, height: 0, trunk: soup(), limbs: soup(), crown: soup(), cards: cardSoup() };
  SPECIES[species](rng, spec, form);
  // Stood on y = 0, whatever the lowest lump came to: a bush has no trunk to stand on.
  let low = Infinity;
  let high = 0;
  for (const part of [form.trunk, form.crown]) {
    for (let i = 1; i < part.position.length; i += 3) {
      low = Math.min(low, part.position[i]!);
      high = Math.max(high, part.position[i]!);
    }
  }
  if (Number.isFinite(low) && Math.abs(low) > 1e-6) {
    for (const part of [form.trunk, form.limbs, form.crown, form.cards]) {
      for (let i = 1; i < part.position.length; i += 3) part.position[i]! -= low;
    }
    high -= low;
  }
  form.height = high;
  return form;
}

/** A near tile's share of a tree: its wood as flat arrays, and its cards. */
export interface NearArrays {
  wood: { position: Float32Array; normal: Float32Array; color: Float32Array };
  leaves: LeafArrays;
}

/** Leaf cards as flat arrays: three a vertex but for `uv` and `leaf`, two. */
export interface LeafArrays {
  /** Whose cards they are, for what sheds them (`crownOf`). */
  species: Species;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  uv: Float32Array;
  leaf: Float32Array;
}

/** A form as a near tile merges it: the trunk and limbs, and the cards. */
export function nearArrays(form: TreeForm): NearArrays {
  return {
    wood: {
      position: Float32Array.from([...form.trunk.position, ...form.limbs.position]),
      normal: Float32Array.from([...form.trunk.normal, ...form.limbs.normal]),
      color: Float32Array.from([...form.trunk.color, ...form.limbs.color]),
    },
    leaves: {
      species: form.species,
      position: Float32Array.from(form.cards.position),
      normal: Float32Array.from(form.cards.normal),
      color: Float32Array.from(form.cards.color),
      uv: Float32Array.from(form.cards.uv),
      leaf: Float32Array.from(form.cards.leaf),
    },
  };
}

/**
 * How much of its leaf a species lets go, 0 to 1: what a crown sheds all year
 * and more in its autumn (`ambient.ts`), and what lies under it. A birch and a
 * broadleaf drop theirs; a bush keeps most, being low and close; an acacia
 * sheds a few small leaves; a conifer and a cypress keep their needles and
 * scales and a palm its fronds, which do not come down as leaves.
 */
export const SHED: Readonly<Record<Species, number>> = {
  broadleaf: 1,
  birch: 0.9,
  bush: 0.35,
  acacia: 0.3,
  conifer: 0,
  cypress: 0,
  palm: 0,
};

/**
 * A crown as the small life sees it (`ambient.ts`): where its leaves hang and
 * what colour they are, in the part's own frame (y up, standing on y = 0,
 * the axis through the origin).
 */
export interface CrownShape {
  species: Species;
  shed: number;
  /** The middle of the cards' box. */
  x: number;
  y: number;
  z: number;
  /** Half the box across, the larger of its two sides, and half its height. */
  radius: number;
  half: number;
  /** The cards' mean vertex colour, linear: the region's green as the crown carries it. */
  r: number;
  g: number;
  b: number;
}

const crowns = new WeakMap<LeafArrays, CrownShape | null>();

/**
 * A tree's crown from its cards: the box they fill and their mean colour,
 * worked out once per variant and kept against the arrays themselves. Null
 * for a species that sheds nothing, or a tree with no cards.
 */
export function crownOf(leaves: LeafArrays): CrownShape | null {
  const known = crowns.get(leaves);
  if (known !== undefined) return known;
  const shed = SHED[leaves.species];
  const count = leaves.position.length / 3;
  let value: CrownShape | null = null;
  if (shed > 0 && count > 0) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < count; i++) {
      const x = leaves.position[i * 3]!;
      const y = leaves.position[i * 3 + 1]!;
      const z = leaves.position[i * 3 + 2]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      r += leaves.color[i * 3]!;
      g += leaves.color[i * 3 + 1]!;
      b += leaves.color[i * 3 + 2]!;
    }
    // The cards are painted a grey under their colour (`LEAF_TEXTURE_MEAN`):
    // a leaf off the crown is the colour the crown is seen at.
    const k = LEAF_TEXTURE_MEAN / count;
    value = {
      species: leaves.species,
      shed,
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      z: (z0 + z1) / 2,
      radius: Math.max(x1 - x0, z1 - z0) / 2,
      half: (y1 - y0) / 2,
      r: r * k,
      g: g * k,
      b: b * k,
    };
  }
  crowns.set(leaves, value);
  return value;
}

/** Floats a placed crown takes in a list of them (`placeCrown`). */
export const CROWN_STRIDE = 9;

const crownPoint = new THREE.Vector3();

/**
 * A crown placed by a part's matrix into a flat list, `CROWN_STRIDE` floats:
 * its middle in the matrix's space, its radius and half height scaled by it,
 * its colour, and how much it sheds. The matrix is the plant's, uniform in
 * scale (`vegetation.ts`, `settlements.ts`); a crown that sheds nothing adds
 * nothing.
 */
export function placeCrown(leaves: LeafArrays, matrix: THREE.Matrix4, out: number[]): void {
  const crown = crownOf(leaves);
  if (crown === null) return;
  const e = matrix.elements;
  const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
  crownPoint.set(crown.x, crown.y, crown.z).applyMatrix4(matrix);
  out.push(crownPoint.x, crownPoint.y, crownPoint.z, crown.radius * scale, crown.half * scale, crown.r, crown.g, crown.b, crown.shed);
}

/** A soup as geometry: position, normal and colour, non-indexed. */
export function soupGeometry(...parts: readonly Soup[]): THREE.BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  for (const part of parts) {
    position.push(...part.position);
    normal.push(...part.normal);
    color.push(...part.color);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

/**
 * The scenic part's build: the trunk and the solid crown as one painted mesh,
 * which is what a town merges and a far tile draws.
 */
export function solidTree(ctx: SceneryContext, form: TreeForm): THREE.Group {
  const group = new THREE.Group();
  const mesh = ctx.coloured(soupGeometry(form.trunk, form.crown));
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}
