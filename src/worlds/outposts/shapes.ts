/** An outpost's pieces as flat arrays at their drawn size, one set per livery, built the first time they are wanted. */

import { coarsened, paintColors } from '../../models.ts';
import type { Model, Paint } from '../../models.ts';
import type { Merged } from '../../merge.ts';
import { PIECES, SCATTER, buildingPaint, craftPaint, worldKit } from '../kit.ts';
import type { Livery } from '../kit.ts';
import type { OutpostPiece } from './layout.ts';

/** Most triangles a building keeps out here: far enough from a street that its finest detail is never seen close. */
const BUILDING_TRIANGLES = 1600;
/** And a prop or a plant. */
const PROP_TRIANGLES = 420;

/** Returns `shapeOf(piece, livery)`: a kit piece's arrays at its drawn size, feet on y = 0 and centred; null before the kit is in. */
export function createShapes(liveries: readonly Livery[]): (one: OutpostPiece, livery: number) => Merged | null {
  const shapes = new Map<string, Merged | null>();
  return (one, livery) => {
    const cacheKey = `${one.from}:${one.id}:${one.from === 'piece' ? livery : 0}`;
    if (shapes.has(cacheKey)) return shapes.get(cacheKey)!;
    const kit = worldKit();
    const made = kit?.pieces.get(one.id);
    const size = one.from === 'piece' ? PIECES[one.id]?.scale : SCATTER[one.id]?.scale;
    if (made === undefined || size === undefined) {
      shapes.set(cacheKey, null);
      return null;
    }
    const most = one.from === 'piece' ? BUILDING_TRIANGLES : PROP_TRIANGLES;
    let model: Pick<Model, 'geometry' | 'slot' | 'slots' | 'defaults'> = made.model;
    if (made.model.triangles > most) {
      const coarse = coarsened(made.model.geometry, made.model.slot, most);
      model = { geometry: coarse.geometry, slot: coarse.slot, slots: made.model.slots, defaults: made.model.defaults };
    }
    const paint: Paint = one.from === 'piece' ? buildingPaint(one.id, liveries[livery]!) : craftPaint(liveries[livery]!);
    const colors = paintColors(model as Model, paint);
    const geometry = model.geometry.index === null ? model.geometry : model.geometry.toNonIndexed();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = model.geometry.index;
    const box = made.model.box;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    // A roof piece stands where the pack put it, over its module's floor.
    const floor = PIECES[one.id]?.role === 'roof' ? 0 : box.min.y;
    const out: Merged = {
      position: new Float32Array(position.count * 3),
      normal: new Float32Array(position.count * 3),
      color: new Float32Array(position.count * 3),
      outline: new Float32Array(position.count * 3),
      triangles: position.count / 3,
    };
    for (let v = 0; v < position.count; v++) {
      out.position[v * 3] = (position.getX(v) - (PIECES[one.id]?.role === 'roof' ? 0 : cx)) * size;
      out.position[v * 3 + 1] = (position.getY(v) - floor) * size;
      out.position[v * 3 + 2] = (position.getZ(v) - (PIECES[one.id]?.role === 'roof' ? 0 : cz)) * size;
      out.normal[v * 3] = normal.getX(v);
      out.normal[v * 3 + 1] = normal.getY(v);
      out.normal[v * 3 + 2] = normal.getZ(v);
      const source = index === null ? v : index.getX(v);
      out.color[v * 3] = colors[source * 3]!;
      out.color[v * 3 + 1] = colors[source * 3 + 1]!;
      out.color[v * 3 + 2] = colors[source * 3 + 2]!;
    }
    shapes.set(cacheKey, out);
    return out;
  };
}
