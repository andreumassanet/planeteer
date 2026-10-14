import { BENCH_LONGEST } from '../bench.ts';
import { planGapToBox } from '../landmark-ground.ts';
import { PARTS } from '../scenery/index.ts';
import type { PartKind, RegionStyle, Weighted } from '../scenery/index.ts';
import { BODY_SCALE } from '../stature.ts';
import type { Keepout, Slot } from './types.ts';

/** The numbers and small rules a town is laid out by. */

/**
 * How much of a settlement is town rather than village, 0 to 1: 0 at ten
 * thousand people, 1 at ten million, logarithmic between. Drives the built
 * core, the plot fill, the house/block mix, the crowd and the parked cars.
 */
export function urbanityOf(pop: number): number {
  return Math.min(1, Math.max(0, (Math.log10(Math.max(1, pop)) - 4) / 2.6));
}

/**
 * How far a building's walls stand back from the square's edge on a side with
 * no street, in world units: a wall flush with the kerb face would share its
 * plane and get no ink line.
 */
export const EDGE_SETBACK = 0.6;

/** The smallest a building may be scaled to fit its cell; past it, the region's next part is tried. */
export const FIT_SCALE = 0.9;

/** How far the drawn land between two lattice corners can stand over the line joining them, for the edge slope's foot. */
export const DRAWN_BULGE = 1;
/** A tree in a landmark's parcel: one every this many units along a side, where there is this much room either side of its line. */
export const PARCEL_TREE_STEP = 9;
export const PARCEL_TREE_ROOM = 1.2;

/** The street furniture a town places itself, rather than through a region's lists. */
export const LAMP_PART = 'street-lamp';
/** The traffic light a kit-built city stands at its middle crossing. */
export const SIGNAL_PART = 'traffic-light';
/** The bench beside some lamps, its back to the building line (`bench.ts`). */
export const BENCH_PART = 'street-bench';
/** The share of lamps with a bench beside them, and the most benches a town has. */
export const BENCH_CHANCE = 0.4;
export const BENCH_CAP = 8;
/** How far along the pavement from its lamp a bench stands, centre to post. */
export const BENCH_FROM_LAMP = 2.6;
/** A bench's back this far off the building line. */
export const BENCH_OFF_LINE = 0.05;

/**
 * What a near town's street dressing may add, in triangles: a share of what
 * already stands in it, never under the least nor over the most.
 */
export const DRESS_SHARE = 0.3;
export const DRESS_LEAST = 1_200;
export const DRESS_MOST = 12_000;

/** How much less often a cell past `OUTSKIRT_RING` is built, as a factor on the fill. */
export const OUTER_FILL = 0.75;
/** And how much more readily an empty one grows a tree, as a factor on `greenery`. */
export const OUTER_GREENERY = 1.4;

/** The share of the country's cells that are an orchard, and that are a loose tree or two. The rest is meadow. */
export const ORCHARD_SHARE = 0.4;
export const LOOSE_SHARE = 0.4;
/**
 * How far from the town's cells, as a share of the pitch, the country may grow
 * on a cell of the edge slope: past the slope's middle, where it is near the
 * ground a tree is seated on.
 */
export const SLOPE_CLEAR = 0.55;
/** How far off a road's centre line the country keeps: the carriageway's half and a crown. */
export const ROAD_KEEP = 7.5;

/**
 * How urban a town must be before its region's towers are towers (about
 * 200,000 people); below it `TOWER_PART` is built as `TOWERLESS_PART`.
 */
export const TOWER_URBANITY = 0.5;
export const TOWER_PART = 'skyscraper';
export const TOWERLESS_PART = 'city-block';

/** People in a town, and vehicles at its kerbs; the latter also scale with the region's traffic density. */
export const TOWN_PEOPLE = (urbanity: number): number => Math.round(3 + urbanity * 11);
/** How many numbers one person takes in `Ground.folk`. */
export const FOLK_STRIDE = 11;
export const TOWN_PARKED = (urbanity: number, density: number): number =>
  Math.round((0.6 + urbanity * 3.4) * Math.min(1.8, density * 2.6));
/** The share of a town's rack slots with a bicycle in. */
export const RACK_FILL = 0.55;

/**
 * The share of lattice corners on a street that get a lamp: from
 * `GroundStyle.hardness` mostly, then urbanity, between a floor and a ceiling.
 */
export const LAMP_FLOOR = 0.12;
export const LAMP_MAX_CHANCE = 0.55;
/** And a hard count, so a metropolis does not spend more geometry on posts than on buildings. */
export const LAMP_CAP = 30;

/** How far over its foot a lamp's light hangs, for the per-pixel pools (`lampsNear`). */
export const LAMP_HEAD = 4.5;
export const LAMP_STRENGTH = 1;

/**
 * How far past its own wall a lit building lays light, in world units: one
 * house width, half a lamp's pool, so lamps and windows do not wash together.
 */
export const WINDOW_SPILL = 7;

/**
 * How far from a flight of steps each thing the street holds stands, in world
 * units: a lamp's post, a person's shoulders, and half the longest parked
 * vehicle, so no bonnet stands in the stairs.
 */
export const CLEAR_LAMP = 0.6;
export const CLEAR_FOLK = 1.3 * BODY_SCALE;
export const CLEAR_CAR = 4.4;
/** How far apart two people talking stand, centre to centre: about a metre and a half. */
export const PAIR_GAP = 3 * BODY_SCALE;
/** How many of the first people on a street are one of a pair. */
export const PAIR_SHARE = 0.3;
/** How far a stroller keeps from a bench's middle: half the longest bench, and a person's own clearance. */
export const CLEAR_BENCH = BENCH_LONGEST / 2 + CLEAR_FOLK;
/** The pace a stroll's stretch is sampled at, and the shortest stretch worth walking. */
export const STROLL_STEP = 0.8;
export const STROLL_MIN = 3;

export const KIND_OF = new Map<string, PartKind>(PARTS.map((entry) => [entry.id, entry.kind]));
const FOOTPRINT_OF = new Map<string, number>(PARTS.map((entry) => [entry.id, entry.footprint]));
export const footprintOf = (id: string): number => FOOTPRINT_OF.get(id) ?? 0;

/** Whether a keepout reaches the box `[x0, x1] x [z0, z1]` of a town's frame. */
export function keepoutReaches(keepout: Keepout, x0: number, x1: number, z0: number, z1: number): boolean {
  return planGapToBox(keepout.shape, x0 - keepout.x, x1 - keepout.x, z0 - keepout.z, z1 - keepout.z) < keepout.radius;
}

/**
 * The building mix at one plot: `RegionStyle.buildings` re-weighted by how
 * urban the place is and how near the middle the plot sits, so a metropolis
 * has blocks in the middle and houses at the edge from one table.
 */
export function mixAt(style: RegionStyle, urbanity: number, edge: number, room: number): Weighted<string>[] {
  const blockward = (0.25 + 3.5 * urbanity) * (1 + 2 * urbanity * (1 - edge));
  const houseward = 1.4 - 1.2 * urbanity;
  const out: Weighted<string>[] = [];
  for (const entry of style.buildings) {
    if (footprintOf(entry.item) > room) continue;
    const kind = KIND_OF.get(entry.item);
    const weight = entry.weight * (kind === 'block' ? blockward : houseward);
    if (weight > 0) out.push({ item: entry.item, weight });
  }
  return out;
}

/** The entries of a mix that fit this plot, or null if none do. */
export function fitting(mix: readonly Weighted<string>[], room: number): Weighted<string>[] | null {
  const ok = mix.filter((entry) => footprintOf(entry.item) <= room);
  return ok.length > 0 ? ok : null;
}

/**
 * The region as a town at this rank builds it: a peopled town of a region with
 * `assets` swaps the code parts for the baked ones in its building and civic
 * mixes, and below `TOWER_URBANITY` a tower becomes a commercial block. Cached
 * per region and tower choice.
 */
export function createStyleFor(): (slot: Slot) => RegionStyle {
  const detailedStyles = new Map<string, RegionStyle>();
  return (slot) => {
    const style = slot.style;
    if (!slot.peopled || style.assets === undefined) return style;
    const towers = urbanityOf(slot.place.pop) >= TOWER_URBANITY;
    const key = `${style.id}:${towers}`;
    let found = detailedStyles.get(key);
    if (found === undefined) {
      const assets = style.assets;
      const swapped = (item: string) => {
        const to = assets[item] ?? item;
        return !towers && to === TOWER_PART ? TOWERLESS_PART : to;
      };
      const swap = (mix: readonly Weighted<string>[]) => mix.map((entry) => ({ item: swapped(entry.item), weight: entry.weight }));
      found = { ...style, buildings: swap(style.buildings), civic: swap(style.civic) };
      detailedStyles.set(key, found);
    }
    return found;
  };
}
