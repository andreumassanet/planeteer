import type * as THREE from 'three';
import { PARKED_SLOT } from '../craft/contract.ts';
import { fleetVariant, paintFor, parkedArrays, parkedModel } from '../craft/parked.ts';
import { VARIANTS, measure, part, validatePart, variantRng } from '../scenery/index.ts';
import type { RegionStyle, SceneryContext } from '../scenery/index.ts';
import { propModels } from '../scenery/street-dressing.ts';
import { nearArrays } from '../scenery/tree-forms.ts';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import { VEHICLES, createTrafficContext, placedScale, placedSize, trafficFor, variantRng as vehicleRng } from '../traffic/index.ts';
import type { TrafficStyle, Vehicle } from '../traffic/index.ts';
import { flatten, planBox } from './flatten.ts';
import { BENCH_PART, LAMP_PART, SIGNAL_PART } from './rules.ts';
import type { FlatVariant, Slot } from './types.ts';

/**
 * Every kit variant a town stands, built and flattened once and cached: the
 * region parts, a near tree's wood and leaf cards, the traffic parked at a
 * kerb, and the takeable vehicles parked as the craft that replaces them.
 */
export interface Variants {
  /** A part's variant in a region, or null where the part is missing or broke its contract. */
  variantOf(partId: string, style: RegionStyle, index: number): FlatVariant | null;
  /** A tree variant's wood and cards, for a near town; keyed by its lumps' variant. */
  readonly nearTrees: WeakMap<FlatVariant, { wood: FlatVariant; leaves: LeafArrays }>;
  /** Builds a region's variants a step each, so a far town's plan finds them cached. */
  warmSteps(slot: Slot): Generator<void, void, void>;
  /** A vehicle nobody can take, merged at its placed scale with no rider. */
  parkedVariant(style: TrafficStyle, id: string, index: number): FlatVariant | null;
  /** A vehicle that can be taken, as the craft that takes it stands parked. */
  machineVariant(id: string, kind: string): FlatVariant | null;
  /** The body colour of a vehicle a town parks, by its id alone; null for the craft's own look. */
  parkedPaintOf(id: string): number | null;
  readonly vehicleById: ReadonlyMap<string, Vehicle>;
  /** The street dressing's CC0 pieces, fitted and painted once each. */
  readonly dressModels: ReturnType<typeof propModels>;
}

export function createVariants(
  ctx: SceneryContext,
  slots: readonly Slot[],
  continentOf: ReadonlyMap<string, string>,
  styleFor: (slot: Slot) => RegionStyle,
  missing: string[],
  broken: string[],
): Variants {
  return {
    ...createPartVariants(ctx, styleFor, missing, broken),
    ...createParkedVariants(ctx, slots, continentOf, missing, broken),
  };
}

/** The region parts and their near trees. */
function createPartVariants(
  ctx: SceneryContext,
  styleFor: (slot: Slot) => RegionStyle,
  missing: string[],
  broken: string[],
): Pick<Variants, 'variantOf' | 'nearTrees' | 'warmSteps'> {
  const variants = new Map<string, FlatVariant | null>();
  const nearTrees = new WeakMap<FlatVariant, { wood: FlatVariant; leaves: LeafArrays }>();

  function variantOf(partId: string, style: RegionStyle, index: number): FlatVariant | null {
    const key = `${partId}:${style.id}:${index}`;
    const cached = variants.get(key);
    if (cached !== undefined) return cached;

    const entry = part(partId);
    if (entry === undefined) {
      if (!missing.includes(partId)) missing.push(partId);
      variants.set(key, null);
      return null;
    }
    let built: THREE.Group;
    try {
      built = entry.build(ctx, variantRng(entry, style, index), style);
      // Checked once per variant: a broken part is broken across a whole continent.
      const problems = validatePart(entry, built);
      if (problems.length > 0) throw new Error(problems.join('; '));
    } catch (error) {
      broken.push(`${key}: ${String(error)}`);
      variants.set(key, null);
      return null;
    }
    // A lamp is not a household: see `flatten`.
    const flat = flatten(built, key, entry.kind !== 'scatter');
    const value: FlatVariant = { ...flat, height: measure(built).height };
    variants.set(key, value);
    if (entry.form !== undefined) {
      try {
        const near = nearArrays(entry.form(variantRng(entry, style, index), style));
        const count = near.wood.position.length / 3;
        nearTrees.set(value, {
          wood: {
            ...near.wood,
            outline: near.wood.normal,
            glow: new Uint8Array(count * 2),
            emits: false,
            litBed: 0,
            triangles: count / 3,
            height: value.height,
            box: value.box,
            pieceVertices: [count],
          },
          leaves: near.leaves,
        });
      } catch (error) {
        broken.push(`${key} (near): ${String(error)}`);
      }
    }
    return value;
  }

  /** Every part a town built in `style` can ask for: its four mixes and the street furniture. Cached per style. */
  const partsOfStyle = new WeakMap<RegionStyle, readonly string[]>();
  function partsAskedBy(style: RegionStyle): readonly string[] {
    let found = partsOfStyle.get(style);
    if (found === undefined) {
      const ids = new Set<string>();
      for (const mix of [style.buildings, style.civic, style.trees, style.scatter]) {
        for (const entry of mix) ids.add(entry.item);
      }
      ids.add(LAMP_PART).add(SIGNAL_PART).add(BENCH_PART);
      found = [...ids];
      partsOfStyle.set(style, found);
    }
    return found;
  }

  /**
   * One variant made a step, with the frame's allowance asked between them, so
   * the first far town of a new region does not make them all inside one step.
   * It makes what `variantOf` would make later, from the same key and seed.
   */
  function* warmSteps(slot: Slot): Generator<void, void, void> {
    const style = slot.style;
    for (const id of partsAskedBy(styleFor(slot))) {
      for (let index = 0; index < VARIANTS; index++) {
        if (variants.has(`${id}:${style.id}:${index}`)) continue;
        variantOf(id, style, index);
        yield;
      }
    }
  }

  return { variantOf, nearTrees, warmSteps };
}

/** The vehicles parked at a kerb: the traffic nobody can take, and the craft that can be. */
function createParkedVariants(
  ctx: SceneryContext,
  slots: readonly Slot[],
  continentOf: ReadonlyMap<string, string>,
  missing: string[],
  broken: string[],
): Pick<Variants, 'parkedVariant' | 'machineVariant' | 'parkedPaintOf' | 'vehicleById' | 'dressModels'> {
  const traffic = createTrafficContext(ctx);
  const dressModels = propModels(ctx);
  const parked = new Map<string, FlatVariant | null>();
  const vehicleById = new Map<string, Vehicle>(VEHICLES.map((entry) => [entry.id, entry]));

  /**
   * `placedScale` is baked into the vertices as `life.ts` does, since a
   * non-uniform scale needs the inverse transpose for the normals the ink hull
   * is built from, and `flatten` applies the normal matrix properly.
   */
  function parkedVariant(style: TrafficStyle, id: string, index: number): FlatVariant | null {
    const key = `parked:${id}:${style.id}:${index}`;
    const cached = parked.get(key);
    if (cached !== undefined) return cached;
    let value: FlatVariant | null = null;
    const entry = vehicleById.get(id);
    if (entry === undefined) {
      if (!missing.includes(id)) missing.push(id);
    } else {
      try {
        const built = entry.build(traffic, vehicleRng(entry, style, index), style);
        const scale = placedScale(entry);
        built.scale.set(scale[0]!, scale[1]!, scale[2]!);
        value = { ...flatten(built, key, false), height: placedSize(entry)[2] };
      } catch (error) {
        broken.push(`${key}: ${String(error)}`);
      }
    }
    parked.set(key, value);
    return value;
  }

  /**
   * Merged at the craft's own size, which is the traffic's (`Vehicle.section`):
   * what is taken is the size it stood at. Null while the kit is not
   * registered. Its light bytes are left to the merge, which marks it
   * (`MACHINE_BED`).
   */
  const machines = new Map<string, FlatVariant | null>();
  function machineVariant(id: string): FlatVariant | null {
    const craft = id.slice(0, id.indexOf(':'));
    const model = parkedModel(craft);
    if (model === null) return null;
    const variant = fleetVariant(id, model.variants);
    const paint = parkedPaintOf(id);
    const key = `${craft}#${variant}@${paint ?? '-'}`;
    const cached = machines.get(key);
    if (cached !== undefined) return cached;
    let value: FlatVariant | null = null;
    try {
      const arrays = parkedArrays(model, variant, paint ?? undefined, 1, true);
      const vertices = arrays.triangles * 3;
      value = {
        ...arrays,
        glow: new Uint8Array(vertices * 2),
        emits: false,
        litBed: 0,
        height: model.size[2],
        paint,
        box: planBox(arrays.position, true),
        pieceVertices: [vertices],
      };
    } catch (error) {
      broken.push(`${key}: ${String(error)}`);
    }
    machines.set(key, value);
    return value;
  }

  /**
   * A pick off the region's traffic paints for a kerb's car, van, bus, tractor,
   * scooter or tuk-tuk; null for a bicycle, a field's or a site's vehicle, or
   * an unknown town. The fleet paints the one it takes by the same answer.
   */
  function parkedPaintOf(id: string): number | null {
    const parts = id.split(':');
    if (parts.length !== 3 || parts[0] === 'bicycle' || !(Number(parts[2]) >= PARKED_SLOT)) return null;
    const slot = slots[Number(parts[1])];
    if (slot === undefined) return null;
    return paintFor(id, trafficFor(slot.place.iso, continentOf.get(slot.place.iso) ?? '', slot.place.lat).paint);
  }

  return { parkedVariant, machineVariant, parkedPaintOf, vehicleById, dressModels };
}
