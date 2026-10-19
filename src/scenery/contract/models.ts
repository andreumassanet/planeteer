import * as THREE from 'three';
import { onPalette, toned, type Model, type Paint } from '../../models.ts';
import { PALETTE } from '../../theme.ts';
import type { ModelFit } from './context-type.ts';
import { GLASS_TONE } from './tones.ts';

export const SCENERY_MODELS = new Map<string, Model>();

/**
 * Hands the kit baked models: the flora and the vehicles (`scripts/build-kit.ts`).
 * `main.ts` calls it with what `src/kit.ts` loaded before anything builds a
 * part; the headless checks call it with the same files read off disk.
 */
export function registerSceneryModels(models: Iterable<Model>): void {
  for (const model of models) SCENERY_MODELS.set(model.name, model);
}

/** A registered model by its name, or null: for a caller asking whether a mesh is one (`glazeTraffic`). */
export function findSceneryModel(id: string): Model | null {
  return SCENERY_MODELS.get(id) ?? null;
}

export function sceneryModel(id: string): Model {
  const model = SCENERY_MODELS.get(id);
  if (model === undefined) {
    throw new Error(
      SCENERY_MODELS.size === 0
        ? `model '${id}': the kit has not been registered (registerSceneryModels)`
        : `model '${id}' is not in the registered kit`,
    );
  }
  return model;
}

export const windowMasks = new WeakMap<Model, Uint8Array | null>();
/**
 * Which window each vertex of a model is glass of, 1 to 255, or 0: its glass
 * triangles joined where they share a corner, by position. Cached per model,
 * because every variant of every building asks the same question of it.
 */
export function windowsOf(model: Model, isWindow: NonNullable<ModelFit['windows']>): Uint8Array | null {
  const cached = windowMasks.get(model);
  if (cached !== undefined) return cached;
  const glass = model.slots.map((slot, i) => isWindow(slot, model.defaults[i]!));
  const position = model.geometry.getAttribute('position');
  const index = model.geometry.index;
  const corners = index ? index.count : position.count;
  const vertexAt = (i: number) => (index ? index.getX(i) : i);
  const parent = new Int32Array(position.count).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
    return x;
  };
  const byPoint = new Map<string, number>();
  const keyOf = (v: number) => `${Math.round(position.getX(v) * 1e4)},${Math.round(position.getY(v) * 1e4)},${Math.round(position.getZ(v) * 1e4)}`;
  let any = false;
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = vertexAt(t);
    if (!glass[model.slot[a]!]) continue;
    any = true;
    for (let k = 0; k < 3; k++) {
      const v = vertexAt(t + k);
      parent[find(v)] = find(a);
      const key = keyOf(v);
      const same = byPoint.get(key);
      if (same === undefined) byPoint.set(key, v);
      else parent[find(same)] = find(v);
    }
  }
  if (!any) {
    windowMasks.set(model, null);
    return null;
  }
  const mask = new Uint8Array(position.count);
  const numbers = new Map<number, number>();
  for (let v = 0; v < position.count; v++) {
    if (!glass[model.slot[v]!]) continue;
    const root = find(v);
    let number = numbers.get(root);
    if (number === undefined) {
      number = (numbers.size % 255) + 1;
      numbers.set(root, number);
    }
    mask[v] = number;
  }
  windowMasks.set(model, mask);
  return mask;
}

/**
 * How tall a door in Kenney's City Kits is, in the kit's own units: every door
 * leaf the suburban and commercial packs model stands 0.27 off its sill.
 */
export const KIT_DOOR = 0.27;

export const doors = new WeakMap<Model, number>();
/**
 * How tall the front door of a building model is, in its own units: the
 * darkest slot that is not glass, on the +Z face from the ground up to under
 * half a unit (a leaf, or a shopfront's opening). `KIT_DOOR` where no slot
 * reads as one.
 */
export function doorOf(model: Model, isWindow: NonNullable<ModelFit['windows']>): number {
  const known = doors.get(model);
  if (known !== undefined) return known;
  const position = model.geometry.getAttribute('position');
  const normal = model.geometry.getAttribute('normal');
  const ground = model.box.min.y;
  const hsl = { h: 0, s: 0, l: 0 };
  const lightness = model.defaults.map((color) => {
    color.clone().convertLinearToSRGB().getHSL(hsl);
    return hsl.l;
  });
  let darkest = -1;
  let top = 0;
  const tops = new Map<number, number>();
  for (let t = 0; t + 2 < position.count; t += 3) {
    const s = model.slot[t]!;
    if (lightness[s]! > 0.4 || isWindow(model.slots[s]!, model.defaults[s]!)) continue;
    if (normal.getZ(t) + normal.getZ(t + 1) + normal.getZ(t + 2) < 2.7) continue;
    const low = Math.min(position.getY(t), position.getY(t + 1), position.getY(t + 2)) - ground;
    const high = Math.max(position.getY(t), position.getY(t + 1), position.getY(t + 2)) - ground;
    if (low > 0.08 || high > 0.5) continue;
    tops.set(s, Math.max(tops.get(s) ?? 0, high));
  }
  for (const [s, high] of tops) {
    if (darkest < 0 || lightness[s]! < lightness[darkest]!) {
      darkest = s;
      top = high;
    }
  }
  const door = darkest >= 0 && top > 0.2 ? top : KIT_DOOR;
  doors.set(model, door);
  return door;
}

/**
 * Draws the band of a painted model's geometry from `ground` up to `ground +
 * band` `stretch` times as tall and lifts what stands over it by the
 * difference. A face is in the band by its centre; its normals (fill and hull)
 * take the stretch's inverse transpose, so a wall keeps its own and a slope in
 * the band steepens as drawn.
 */
export function stretchBand(geometry: THREE.BufferGeometry, ground: number, band: number, stretch: number): void {
  const source = geometry.getAttribute('position');
  const position = new THREE.Float32BufferAttribute(new Float32Array(source.count * 3), 3);
  const top = ground + band;
  const lift = band * (stretch - 1);
  const normals = ['normal', 'outlineNormal']
    .filter((name) => geometry.getAttribute(name) !== undefined)
    .map((name) => ({ name, attribute: (geometry.getAttribute(name) as THREE.BufferAttribute).clone() }));
  const n = new THREE.Vector3();
  for (let t = 0; t + 2 < source.count; t += 3) {
    const centre = (source.getY(t) + source.getY(t + 1) + source.getY(t + 2)) / 3;
    const inBand = centre < top;
    for (let k = t; k < t + 3; k++) {
      const y = source.getY(k);
      const drawn = y <= top ? ground + (y - ground) * stretch : y + lift;
      position.setXYZ(k, source.getX(k), drawn, source.getZ(k));
      if (!inBand) continue;
      for (const { attribute } of normals) {
        n.fromBufferAttribute(attribute, k);
        n.y /= stretch;
        n.normalize();
        attribute.setXYZ(k, n.x, n.y, n.z);
      }
    }
  }
  geometry.setAttribute('position', position);
  for (const { name, attribute } of normals) geometry.setAttribute(name, attribute);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** The narrowest `ModelFit.narrow` draws a model, as a share of its own plan. */
export const NARROWEST = 0.6;

export const radii = new WeakMap<Model, number>();
/** How far a model reaches from its own vertical axis through the box's centre. */
export function radiusOf(model: Model): number {
  let radius = radii.get(model);
  if (radius !== undefined) return radius;
  const position = model.geometry.getAttribute('position');
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, Math.hypot(position.getX(i) - cx, position.getZ(i) - cz));
  radii.set(model, radius);
  return radius;
}

/**
 * Paint by role: each `[pattern, colour]` names the slots that play one part —
 * leaves, bark, stone — and every slot of a role takes the role's colour, toned
 * by how light that slot was against the role's mean. A slot no role names goes
 * to its nearest palette colour.
 */
export function rolePaint(model: Pick<Model, 'slot' | 'slots' | 'defaults'>, roles: readonly (readonly [RegExp, number])[]): Paint {
  const shares = new Array<number>(model.slots.length).fill(0);
  for (const s of model.slot) shares[s]!++;
  const lightness = model.defaults.map((color) => {
    const hsl = { h: 0, s: 0, l: 0 };
    color.clone().convertLinearToSRGB().getHSL(hsl);
    return hsl.l;
  });
  const roleOf = model.slots.map((slot) => roles.findIndex(([pattern]) => pattern.test(slot)));
  const means = roles.map((_, r) => {
    let sum = 0;
    let weight = 0;
    roleOf.forEach((role, i) => {
      if (role !== r) return;
      sum += lightness[i]! * shares[i]!;
      weight += shares[i]!;
    });
    return weight > 0 ? sum / weight : 0.5;
  });
  return (slot, original) => {
    const i = model.slots.indexOf(slot);
    const role = roleOf[i] ?? -1;
    if (role < 0) return onPalette(original);
    const mean = means[role]!;
    return toned(roles[role]![1], THREE.MathUtils.clamp(mean > 0 ? lightness[i]! / mean : 1, 0.7, 1.3));
  };
}

/** See `ModelFit.shade`. Tones in sRGB, the way `tone` does. */
export function shadeUp(model: Model, geometry: THREE.BufferGeometry, shade: NonNullable<ModelFit['shade']>): void {
  const wanted = model.slots.map((slot) => shade.slots.test(slot));
  const position = geometry.getAttribute('position');
  let low = Infinity;
  let high = -Infinity;
  for (let v = 0; v < model.slot.length; v++) {
    if (!wanted[model.slot[v]!]) continue;
    low = Math.min(low, position.getY(v));
    high = Math.max(high, position.getY(v));
  }
  if (!(high > low)) return;
  const color = geometry.getAttribute('color') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let v = 0; v < model.slot.length; v++) {
    if (!wanted[model.slot[v]!]) continue;
    const t = (position.getY(v) - low) / (high - low);
    c.fromBufferAttribute(color, v);
    c.copy(toned(c, shade.bottom + (shade.top - shade.bottom) * t));
    color.setXYZ(v, c.r, c.g, c.b);
  }
}

/**
 * A building's paint: the region's `walls`, `roofs` and `trim`, found on a pack
 * model by what its slots *are* rather than by what they are called, because an
 * atlas-coloured pack names nothing — Kenney's City Kits are a hundred swatches
 * of one `colormap`.
 *
 * - Glass is `isGlass` and goes to `slate` at `GLASS_TONE`.
 * - Roof is a slot whose faces point up on average (the mean normal's
 *   height over 0.45) and stand in the upper half of the model.
 * - Walls are the largest remaining colour family by vertex count — every
 *   swatch within a small hue and saturation of the largest slot — toned by
 *   their own lightness against the family's mean.
 * - Trim is every remaining slot darker than the walls; anything else keeps
 *   its nearest palette colour.
 */
export function buildingPaint(
  model: Model,
  colors: { walls: number; roofs: number; trim: number },
  isGlass: (slot: string, color: THREE.Color) => boolean,
): Paint {
  const count = model.slots.length;
  const shares = new Array<number>(count).fill(0);
  const up = new Array<number>(count).fill(0);
  const height = new Array<number>(count).fill(0);
  const normal = model.geometry.getAttribute('normal');
  const position = model.geometry.getAttribute('position');
  const low = model.box.min.y;
  const span = Math.max(1e-6, model.box.max.y - low);
  for (let v = 0; v < model.slot.length; v++) {
    const s = model.slot[v]!;
    shares[s]!++;
    up[s]! += normal.getY(v);
    height[s]! += (position.getY(v) - low) / span;
  }
  const hsl = model.defaults.map((color) => {
    const out = { h: 0, s: 0, l: 0 };
    color.clone().convertLinearToSRGB().getHSL(out);
    return out;
  });
  const role = new Array<'glass' | 'roof' | 'wall' | 'trim' | 'other'>(count).fill('other');
  for (let i = 0; i < count; i++) {
    if (shares[i] === 0) continue;
    if (isGlass(model.slots[i]!, model.defaults[i]!)) role[i] = 'glass';
    else if (up[i]! / shares[i]! > 0.45 && height[i]! / shares[i]! > 0.5) role[i] = 'roof';
  }
  let lead = -1;
  for (let i = 0; i < count; i++) if (role[i] === 'other' && (lead < 0 || shares[i]! > shares[lead]!)) lead = i;
  const near = (i: number, j: number) => {
    const dh = Math.min(Math.abs(hsl[i]!.h - hsl[j]!.h), 1 - Math.abs(hsl[i]!.h - hsl[j]!.h));
    return (dh < 0.06 || (hsl[i]!.s < 0.15 && hsl[j]!.s < 0.15)) && Math.abs(hsl[i]!.s - hsl[j]!.s) < 0.25;
  };
  if (lead >= 0) {
    for (let i = 0; i < count; i++) if (role[i] === 'other' && near(i, lead) && hsl[i]!.l > hsl[lead]!.l - 0.2) role[i] = 'wall';
    for (let i = 0; i < count; i++) if (role[i] === 'other' && hsl[i]!.l < hsl[lead]!.l) role[i] = 'trim';
  }
  const meanOf = (which: string) => {
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < count; i++) {
      if (role[i] !== which) continue;
      sum += hsl[i]!.l * shares[i]!;
      weight += shares[i]!;
    }
    return weight > 0 ? sum / weight : 0.5;
  };
  const means = { roof: meanOf('roof'), wall: meanOf('wall'), trim: meanOf('trim') };
  const glass = toned(PALETTE.slate, GLASS_TONE);
  return (slot, original) => {
    const i = model.slots.indexOf(slot);
    const which = role[i];
    const ratio = (mean: number) => THREE.MathUtils.clamp(mean > 0 ? hsl[i]!.l / mean : 1, 0.75, 1.25);
    if (which === 'glass') return glass;
    if (which === 'roof') return toned(colors.roofs, ratio(means.roof));
    if (which === 'wall') return toned(colors.walls, ratio(means.wall));
    if (which === 'trim') return toned(colors.trim, ratio(means.trim));
    return onPalette(original);
  };
}
