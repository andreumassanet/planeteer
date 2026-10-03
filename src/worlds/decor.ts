/**
 * What lies about on the ground: rocks, drifts, spires — `src/system/parts/`'s
 * decorations and a plain boulder — scattered over the finest tiles and merged
 * into each tile's own mesh.
 *
 * The biome says what may stand (`BodyBiome.parts`, `cover`) exactly as it
 * does on Earth, and the spec says which decorations exist on this world
 * (`WorldSpec.decorations`); a part a biome names and the spec does not bring
 * is skipped, and `check-worlds.ts` reports it. Six variants of each part are
 * built once, the first time one is wanted, and every rock after that is a
 * copy of a variant's arrays under a matrix — so a field of a hundred rocks
 * costs a hundred copies and no builds.
 *
 * **And the space kit's props and plants** (`WorldSpec.scatter`): its rocks,
 * crystals, meteors, craters and bones, and on a world with air its alien
 * trees and grasses, a few a tile, the rocks in the ground's own colours and
 * the rest brought onto the palette. A plant far from a town is a coarsened
 * copy of the pack's (`coarsened`, a few hundred triangles), because a tile
 * pays for everything on it whether anyone walks there or not; the towns'
 * gardens (`settlements.ts`) keep them whole. Until the kit is loaded the
 * tiles are built without them.
 *
 * Where: a function of the tile's key, so a tile built twice is the same tile,
 * and never on a town's pad nor in an outpost's yard (`outposts.ts`), whose
 * pieces are merged into the same tile. A cloud deck has no boulders, but where its body
 * has a ground model its biomes still name their parts — an ice plume on
 * Neptune's cirrus — and those stand on the deck like anything else.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Terrain, TerrainSample } from './terrain.ts';
import { grade, newSample } from './terrain.ts';
import type { TileKey } from './cube.ts';
import { faceDir, keyOf, tileSpan } from './cube.ts';
import type { Decoration } from '../system/contract.ts';
import { DECORATION_VARIANTS, decorationRng } from '../system/contract.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { mergeMeshes } from '../merge.ts';
import type { Merged } from '../merge.ts';
import { rngFrom } from '../scenery/random.ts';
import { coarsened, onPalette, paintColors, toned } from '../models.ts';
import type { Model } from '../models.ts';
import { SCATTER, worldKit } from './kit.ts';
import { ball } from './architecture.ts';
import { PALETTE } from '../theme.ts';
import type { Outposts } from './outposts.ts';

/** The kit's rocks a crust's boulders are drawn from. */
const KIT_ROCKS = ['rock-1', 'rock-2', 'rock-3', 'rock-4'];

/** Most triangles a scattered plant or prop keeps. */
const SCATTER_TRIANGLES = 420;

/** A plain rock, for every crust: the one decoration every rocky world has; the kit's rocks (`KIT_ROCKS`) once it is in. */
export const BOULDER: Decoration = {
  id: 'boulder',
  footprint: 2.5,
  bodies: [],
  build(ctx, rng, look) {
    const group = new ctx.THREE.Group();
    const lumps = rng.between(1, 3);
    for (let k = 0; k < lumps; k++) {
      const size = rng.range(0.6, 2.2) * (k === 0 ? 1 : 0.6);
      const rock = ctx.taper(size, size * rng.range(0.35, 0.7), size * rng.range(0.6, 1.3), k === 0 ? look.lowland : look.highland, rng.between(4, 6));
      rock.position.set(rng.jitter() * size, -size * 0.15, rng.jitter() * size);
      rock.rotation.y = rng.range(0, Math.PI * 2);
      group.add(rock);
    }
    return group;
  },
};

/**
 * A cloud deck's own lumps, where a crust has its boulders: a billow of the
 * deck heaped up, three to seven squashed puffs drawn white and tinted at
 * each spot to the deck's own colour there a shade lighter, as the top of a
 * cloud catches more of the sun than the deck it rises from. Without them a
 * giant's deck was one flat colour to the horizon.
 */
export const BILLOW: Decoration = {
  id: 'billow',
  footprint: 9,
  bodies: [],
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const lumps = rng.between(3, 7);
    const spread = rng.range(3, 7);
    for (let k = 0; k < lumps; k++) {
      const r = rng.range(1.8, 4.2) * (k === 0 ? 1.3 : 1);
      const puff = ball(ctx, r, k % 3 === 2 ? ctx.tone(PALETTE.white, 0.9) : PALETTE.white, 10);
      const a = rng.range(0, Math.PI * 2);
      const d = k === 0 ? 0 : rng.range(0.4, 1) * spread;
      puff.scale.y = rng.range(0.38, 0.55);
      puff.position.set(Math.cos(a) * d, r * 0.05, Math.sin(a) * d);
      group.add(puff);
    }
    return group;
  },
};

export function createDecor(spec: WorldSpec, terrain: Terrain, ctx: SceneryContext, outposts: Outposts | null = null): (key: TileKey, centre: THREE.Vector3, up: THREE.Vector3) => THREE.BufferGeometry | null {
  const byId = new Map<string, Decoration>(spec.decorations.map((part) => [part.id, part]));
  const variants = new Map<string, Merged[]>();
  const biomes = spec.body.ground?.biomes ?? {};
  const rocky = spec.ground !== 'cloud-deck';
  const look = spec.body.look;

  /** The ground's own grading on a buffer of colours, so a grey Moon's rocks are grey too. */
  function graded(c: Float32Array): void {
    const { chroma, value } = spec.palette;
    if (chroma === 1 && value === 1) return;
    for (let i = 0; i < c.length; i += 3) {
      const [r, g, b] = grade([c[i]!, c[i + 1]!, c[i + 2]!], chroma, value);
      c[i] = r;
      c[i + 1] = g;
      c[i + 2] = b;
    }
  }

  /** A kit piece as flat arrays at its scattered size, feet on y = 0 and centred, coarsened past `SCATTER_TRIANGLES`. */
  const kitShapes = new Map<string, Merged | null>();
  function kitShape(id: string): Merged | null {
    if (kitShapes.has(id)) return kitShapes.get(id)!;
    const piece = worldKit()?.pieces.get(id);
    const info = SCATTER[id];
    if (piece === undefined || info === undefined) return null;
    let model: Pick<Model, 'geometry' | 'slot' | 'slots' | 'defaults'> = piece.model;
    if (piece.model.triangles > SCATTER_TRIANGLES) {
      const coarse = coarsened(piece.model.geometry, piece.model.slot, SCATTER_TRIANGLES);
      model = { geometry: coarse.geometry, slot: coarse.slot, slots: piece.model.slots, defaults: piece.model.defaults };
    }
    // A rock is the ground's rock; the rest on the palette.
    const rock = info.kind === 'rock';
    // A rock keeps the pack's light and shade on white, and takes the colour
    // of the ground it lies on where it is placed (`tint`).
    const colors = paintColors(model as Model, (_slot, original) => (rock ? toned(PALETTE.white, 0.7 + 0.45 * original.getHSL({ h: 0, s: 0, l: 0 }).l) : onPalette(original)));
    graded(colors);
    const geometry = model.geometry.index === null ? model.geometry : model.geometry.toNonIndexed();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const box = piece.model.box;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const out: Merged = {
      position: new Float32Array(position.count * 3),
      normal: new Float32Array(position.count * 3),
      color: new Float32Array(position.count * 3),
      outline: new Float32Array(position.count * 3),
      triangles: position.count / 3,
    };
    const index = model.geometry.index;
    for (let v = 0; v < position.count; v++) {
      out.position[v * 3] = (position.getX(v) - cx) * info.scale;
      out.position[v * 3 + 1] = (position.getY(v) - box.min.y) * info.scale;
      out.position[v * 3 + 2] = (position.getZ(v) - cz) * info.scale;
      out.normal[v * 3] = normal.getX(v);
      out.normal[v * 3 + 1] = normal.getY(v);
      out.normal[v * 3 + 2] = normal.getZ(v);
      const source = index === null ? v : index.getX(v);
      out.color[v * 3] = colors[source * 3]!;
      out.color[v * 3 + 1] = colors[source * 3 + 1]!;
      out.color[v * 3 + 2] = colors[source * 3 + 2]!;
    }
    kitShapes.set(id, out);
    return out;
  }

  function variantsOf(part: Decoration): Merged[] {
    let found = variants.get(part.id);
    if (found === undefined) {
      found = [];
      for (let v = 0; v < DECORATION_VARIANTS; v++) {
        const group = part.build(ctx, decorationRng(part, spec.id, v), look);
        const merged = mergeMeshes(group);
        // The ground's own grading, so a rock is the colour of the ground it
        // lies on: a grey Moon's boulders are grey too.
        const { chroma, value } = spec.palette;
        if (chroma !== 1 || value !== 1) {
          const c = merged.color;
          for (let i = 0; i < c.length; i += 3) {
            const [r, g, b] = grade([c[i]!, c[i + 1]!, c[i + 2]!], chroma, value);
            c[i] = r;
            c[i + 1] = g;
            c[i + 2] = b;
          }
        }
        found.push(merged);
        group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh === true) mesh.geometry.dispose();
        });
      }
      variants.set(part.id, found);
    }
    return found;
  }

  const sample: TerrainSample = newSample();
  const dir = { x: 0, y: 0, z: 0 };
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const R = terrain.radius;

  /**
   * The ground's colour at a direction times `shade`, for a rock to lie in:
   * a shade lighter than the dust round it, as a rock's faces catch the sun
   * the regolith's grain scatters.
   */
  function groundTint(at: { x: number; y: number; z: number }, shade: number): [number, number, number] {
    terrain.sample(at.x, at.y, at.z, sample);
    return [Math.min(1, sample.r * shade), Math.min(1, sample.g * shade), Math.min(1, sample.b * shade)];
  }

  return (key, centre) => {
    if (key.level !== terrain.levels) return null;
    const rng = rngFrom('worlds', spec.id, 'decor', keyOf(key));
    const [u0, v0, size] = tileSpan(key);
    const picks: { variant: Merged; matrix: THREE.Matrix4; tint?: [number, number, number] | undefined }[] = [];
    const tries = spec.rocks + 14;
    for (let k = 0; k < tries; k++) {
      faceDir(key.face, u0 + rng.unit() * size, v0 + rng.unit() * size, dir);
      const yaw = rng.range(0, Math.PI * 2);
      const roll = rng.unit();
      const variantIndex = rng.int(DECORATION_VARIANTS);
      const grow = rng.range(0.7, 1.25);
      if (terrain.bareAt(dir.x, dir.y, dir.z)) continue;
      if (outposts !== null && outposts.covers(key, dir)) continue;
      let part: Decoration | undefined;
      let tint = false;
      let rock: Merged | null = null;
      if (k < spec.rocks) {
        part = rocky ? BOULDER : BILLOW;
        tint = !rocky;
        // On a crust, the kit's own rocks in the ground's colours once it is
        // in: the code-built boulder is a stand-in until then.
        if (rocky) rock = kitShape(KIT_ROCKS[Math.floor(roll * KIT_ROCKS.length)]!);
      } else {
        terrain.sample(dir.x, dir.y, dir.z, sample);
        const biome = sample.biome === null ? undefined : biomes[sample.biome];
        if (biome === undefined || biome.parts.length === 0 || roll > biome.cover * 4) continue;
        part = byId.get(biome.parts[Math.floor(roll * 997) % biome.parts.length]!);
        if (part === undefined) continue;
      }
      const ground = terrain.groundAt(dir.x, dir.y, dir.z);
      up.set(dir.x, dir.y, dir.z);
      forward.set(up.y, -up.x, 0);
      if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
      forward.addScaledVector(up, -forward.dot(up)).normalize().applyAxisAngle(up, yaw);
      right.crossVectors(up, forward).normalize();
      // Sunk a little, so a rock on a slope has no daylight under its low side.
      point.copy(up).multiplyScalar(R + ground - 0.25).sub(centre);
      scale.setScalar(rock === null ? grow : grow * 0.55);
      matrix.makeBasis(right, up, forward).scale(scale).setPosition(point);
      if (matrix.determinant() <= 0) continue;
      if (rock !== null) {
        picks.push({ variant: rock, matrix: matrix.clone(), tint: groundTint(dir, rng.range(1.05, 1.4)) });
        continue;
      }
      let colour: [number, number, number] | undefined;
      if (tint) {
        terrain.sample(dir.x, dir.y, dir.z, sample);
        colour = [Math.min(1, sample.r * 1.1), Math.min(1, sample.g * 1.1), Math.min(1, sample.b * 1.1)];
      }
      picks.push({ variant: variantsOf(part)[variantIndex]!, matrix: matrix.clone(), tint: colour });
    }
    // What stands between the towns (`outposts.ts`), once the kit is in.
    const outpost = outposts?.planOf(key) ?? null;
    if (outpost !== null && worldKit() !== null) outposts!.build(key, outpost, centre, picks);
    // The kit's props and plants, a few a tile.
    const scatter = spec.scatter;
    if (scatter !== null && worldKit() !== null) {
      const count = Math.floor(scatter.perTile * rng.range(0.4, 1.6) + rng.unit());
      for (let k = 0; k < count; k++) {
        faceDir(key.face, u0 + rng.unit() * size, v0 + rng.unit() * size, dir);
        const plant = scatter.flora.length > 0 && rng.chance(scatter.green);
        const list = plant ? scatter.flora : scatter.props;
        if (list.length === 0) continue;
        const id = rng.weighted(list);
        const yaw = rng.range(0, Math.PI * 2);
        const grow = rng.range(0.7, 1.3);
        if (terrain.bareAt(dir.x, dir.y, dir.z)) continue;
        if (outposts !== null && outposts.covers(key, dir)) continue;
        const shape = kitShape(id);
        if (shape === null) continue;
        const ground = terrain.groundAt(dir.x, dir.y, dir.z);
        up.set(dir.x, dir.y, dir.z);
        forward.set(up.y, -up.x, 0);
        if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
        forward.addScaledVector(up, -forward.dot(up)).normalize().applyAxisAngle(up, yaw);
        right.crossVectors(up, forward).normalize();
        point.copy(up).multiplyScalar(R + ground - 0.3).sub(centre);
        scale.setScalar(grow);
        matrix.makeBasis(right, up, forward).scale(scale).setPosition(point);
        if (matrix.determinant() <= 0) continue;
        picks.push({ variant: shape, matrix: matrix.clone(), tint: SCATTER[id]?.kind === 'rock' ? groundTint(dir, rng.range(1.05, 1.4)) : undefined });
      }
    }
    if (picks.length === 0) return null;
    let count = 0;
    for (const pick of picks) count += pick.variant.position.length;
    const position = new Float32Array(count);
    const normal = new Float32Array(count);
    const color = new Float32Array(count);
    let at = 0;
    for (const pick of picks) {
      normalMatrix.getNormalMatrix(pick.matrix);
      const source = pick.variant;
      for (let i = 0; i < source.position.length; i += 3) {
        point.set(source.position[i]!, source.position[i + 1]!, source.position[i + 2]!).applyMatrix4(pick.matrix);
        position[at + i] = point.x;
        position[at + i + 1] = point.y;
        position[at + i + 2] = point.z;
        point.set(source.normal[i]!, source.normal[i + 1]!, source.normal[i + 2]!).applyMatrix3(normalMatrix).normalize();
        normal[at + i] = point.x;
        normal[at + i + 1] = point.y;
        normal[at + i + 2] = point.z;
      }
      color.set(source.color, at);
      const tint = pick.tint;
      if (tint !== undefined) {
        for (let i = 0; i < source.color.length; i += 3) {
          color[at + i] = color[at + i]! * tint[0];
          color[at + i + 1] = color[at + i + 1]! * tint[1];
          color[at + i + 2] = color[at + i + 2]! * tint[2];
        }
      }
      at += source.position.length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.computeBoundingSphere();
    return geometry;
  };
}
