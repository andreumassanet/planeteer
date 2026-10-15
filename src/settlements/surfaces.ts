import type * as THREE from 'three';
import type { Rng } from '../scenery/random.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { FlatVariant } from './types.ts';
import { FLOOR, GLASS, LAND_GROUND, MARK, ROOF, SURFACE, paneCornersOf, surfaceMarks } from '../surfaces.ts';
import type { Surface } from '../surfaces.ts';

/**
 * What a town's surfaces are made of, drawn by the town material over the
 * flat colour they carry: the walls, the roofs and the floor.
 *
 * One byte a vertex, `atlasSurface`. 0 is a surface left as drawn (a door, a
 * trim, a pane, a tree, a lawn); 1 to 5 a building's walls; `ROOF` its roof;
 * `FLOOR` the floor's asphalt, pavement, cobbles, road paint and stone
 * risers. Which of a building's vertices are walls and which roof is read off
 * the variant once (`surfaceMask`): the colours that cover most of its
 * upright area are the walls, most of its upward area the roof, so a base
 * course, an eave band or a window surround in a tone of its own keeps its
 * flat colour and reads as trim against the pattern. The floor's are set by
 * the colour object each face is pushed with (`floorKinds`). The codes and
 * the patterns are `src/surfaces.ts`'s, which the monuments share.
 *
 * Every pattern is a factor on the colour already there, so a region's
 * palette is untouched, and a height, which the material turns into a bent
 * normal: a joint is a groove the sun shades, a tile a ridge it lights.
 */
type Mix = readonly { item: Surface; weight: number }[];
const mix = (plaster: number, brick: number, stone: number, timber: number, concrete: number): Mix =>
  ([
    { item: SURFACE.plaster, weight: plaster },
    { item: SURFACE.brick, weight: brick },
    { item: SURFACE.stone, weight: stone },
    { item: SURFACE.timber, weight: timber },
    { item: SURFACE.concrete, weight: concrete },
  ] as const).filter((entry) => entry.weight > 0);

/** A region's houses, as plaster, brick, stone, timber and concrete. */
const HOUSES: Record<RegionId, Mix> = {
  nordic: mix(2, 1, 0, 6, 0),
  'atlantic-europe': mix(2, 5, 3, 0, 0),
  'east-europe': mix(5, 3, 1, 1, 0),
  mediterranean: mix(6, 1, 3, 0, 0),
  maghreb: mix(8, 0, 1, 0, 0),
  'sub-saharan': mix(7, 2, 0, 0, 0),
  'middle-east': mix(4, 0, 5, 0, 0),
  'south-asia': mix(6, 3, 0, 0, 0),
  'east-asia': mix(4, 0, 0, 4, 1),
  'southeast-asia': mix(5, 0, 0, 4, 0),
  'north-america': mix(1, 4, 0, 5, 0),
  'latin-america': mix(7, 2, 1, 0, 0),
  oceania: mix(2, 3, 0, 5, 0),
  polar: mix(1, 0, 0, 7, 2),
};

/** Blocks and towers anywhere: the city's materials, whatever the houses are. */
const BLOCKS: Mix = mix(3, 3, 1, 0, 4);
const TOWERS: Mix = mix(1, 0, 0, 0, 1);
/** A church, a mosque, a temple: built to last. */
const CIVIC: Record<RegionId, Mix> = {
  ...HOUSES,
  nordic: mix(2, 0, 1, 5, 0),
  'atlantic-europe': mix(0, 1, 5, 0, 0),
  'east-europe': mix(4, 1, 3, 0, 0),
  mediterranean: mix(3, 0, 5, 0, 0),
  'north-america': mix(2, 2, 2, 4, 0),
  'latin-america': mix(5, 0, 3, 0, 0),
};

const TALL = new Set(['tower-block', 'skyscraper']);

/** The material a standing building's walls are made of, drawn once per plot. */
export function wallSurfaceOf(region: string, partId: string, kind: string | undefined, rng: Rng): Surface {
  if (TALL.has(partId)) return rng.weighted(TOWERS);
  if (kind === 'block') return rng.weighted(BLOCKS);
  const id = (region in HOUSES ? region : 'atlantic-europe') as RegionId;
  if (kind === 'civic') return rng.weighted(CIVIC[id]);
  return rng.weighted(HOUSES[id]);
}

/** The floor's colour objects and what each is laid in; see `GroundWriter.kinds`. */
export function floorKinds(
  colours: {
    road: THREE.Color; walk: THREE.Color; line: THREE.Color; plaza: THREE.Color; kerbTop: THREE.Color; kerbFoot: THREE.Color; step: THREE.Color;
    apron: readonly THREE.Color[];
  },
  into: Map<THREE.Color, number>,
): void {
  into.clear();
  into.set(colours.road, FLOOR.asphalt);
  into.set(colours.walk, FLOOR.slabs);
  into.set(colours.line, FLOOR.paint);
  into.set(colours.plaza, FLOOR.cobbles);
  into.set(colours.kerbTop, FLOOR.riser);
  into.set(colours.kerbFoot, FLOOR.riser);
  into.set(colours.step, FLOOR.riser);
  // The edge slope is the land's own ground, drawn as the hillside it joins.
  for (const corner of colours.apron) into.set(corner, LAND_GROUND);
}

const masks = new WeakMap<FlatVariant, Uint8Array>();
const panes = new WeakMap<FlatVariant, Uint8Array>();

/** Which of a variant's vertices are its walls, its roof and its panes (`surfaceMarks`). Cached per variant. */
export function surfaceMask(flat: FlatVariant): Uint8Array {
  const cached = masks.get(flat);
  if (cached !== undefined) return cached;
  // A window is any upright face whose corners carry a window's light or hour (`flatten.ts`).
  const mask = surfaceMarks(flat.position, flat.color, (t) =>
    [0, 1, 2].every((k) => flat.glow[(t + k) * 2]! > 0 || flat.glow[(t + k) * 2 + 1]! > 0),
  );
  masks.set(flat, mask);
  return mask;
}

/** Where each corner of a pane lies across it (`paneCornersOf`). Cached per variant. */
export function paneCorners(flat: FlatVariant): Uint8Array {
  const cached = panes.get(flat);
  if (cached !== undefined) return cached;
  const out = paneCornersOf(flat.position, flat.normal, surfaceMask(flat));
  panes.set(flat, out);
  return out;
}

/** Writes a building's `atlasSurface` bytes at `vertex` (its walls' material, `ROOF`, `GLASS`) and its panes' corners. */
export function writeSurface(out: Uint8Array, pane: Uint8Array, vertex: number, flat: FlatVariant, wall: Surface): void {
  const mask = surfaceMask(flat);
  for (let i = 0; i < mask.length; i++) {
    const mark = mask[i]!;
    out[vertex + i] = mark === MARK.wall ? wall : mark === MARK.roof ? ROOF : mark === MARK.pane ? GLASS : 0;
  }
  pane.set(paneCorners(flat), vertex * 2);
}
