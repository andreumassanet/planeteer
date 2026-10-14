/** The shapes scattered on the tiles: the kit's props and plants, and the spec's own decorations, built once and copied under a matrix. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import { grade } from '../terrain.ts';
import { DECORATION_VARIANTS, decorationRng } from '../../system/contract.ts';
import type { Decoration } from '../../system/contract.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import { mergeMeshes } from '../../merge.ts';
import type { Merged } from '../../merge.ts';
import { coarsened, onPalette, paintColors, toned } from '../../models.ts';
import type { Model } from '../../models.ts';
import { SCATTER, worldKit } from '../kit.ts';
import { PALETTE } from '../../theme.ts';

/** Most triangles a scattered plant or prop keeps. */
const SCATTER_TRIANGLES = 420;

export interface Shapes {
  /** A kit piece as flat arrays at its scattered size, feet on y = 0 and centred, coarsened past `SCATTER_TRIANGLES`; null before the kit is in. */
  kitShape(id: string): Merged | null;
  /** The variants of a decoration, built the first time one is wanted. */
  variantsOf(part: Decoration): Merged[];
}

export function createShapes(spec: WorldSpec, ctx: SceneryContext): Shapes {
  const variants = new Map<string, Merged[]>();
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
        graded(merged.color);
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

  return { kitShape, variantsOf };
}
