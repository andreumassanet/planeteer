import type { Rng, Weighted } from '../random.ts';
import { PROUD } from './tones.ts';

/**
 * A place's look, as data.
 *
 * `countryAt` is exact, so "a house in Japan is not a house in Morocco" needs
 * only this table, which lives in `regions.ts`. The interface is here so a part
 * file can import one module: a part receives the style and reads colours out
 * of it, which is how one `gabled-house` is Norwegian in falu red under a steep
 * roof and Australian in cream under a shallow one.
 */
export interface RegionStyle {
  id: string;
  name: string;
  /** One line: what you would notice if you landed there. */
  note: string;

  /**
   * Walls, renders and plaster.
   *
   * Warm entries: under this scene's blue hemisphere light a neutral turned away
   * from the sun goes hueless (`bone` 143,122,100 becomes 76,68,58), and a
   * village is nothing but small recesses. `white` (0xfff2e8) survives at
   * 132,111,88; `cream`, `sand`, `tan`, `blush` and `apricot` all hold. Avoid
   * `bone` and `steel`.
   */
  walls: readonly number[];
  /** Tile, thatch, slate, tin. The roof is half the regional signal. */
  roofs: readonly number[];
  /** Doors, shutters, beams, posts: the accent that is not the wall. */
  trim: readonly number[];
  /**
   * What a front door is painted: a wood, or the colour a street paints its
   * doors in. Never a near-black — `trim` capped carries `bark`, and a door of
   * it read as a hole in the wall. See `doorPaint`.
   */
  doors: readonly number[];
  /** Windows and openings. Warm darks, for the reason above. */
  glass: readonly number[];
  /**
   * Leaves. Regional, and one of the cheapest signals there is: olive and dark
   * olive read as dry, `green` reads as watered, and a village changes climate
   * on this one list.
   */
  foliage: readonly number[];
  /** Rock and bare ground. Grey in Norway, red in the Australian centre. */
  stone: readonly number[];
  /** The ground a village of this region sits on. */
  ground: number;

  /** Roof rise over half-span. 0.15 is a flat Maghreb terrace, 1.0 is alpine. */
  pitch: number;
  /** Chance a roof comes out hipped rather than gabled. */
  hipped: number;
  /** Storeys an ordinary building gets here, both ends included. */
  storeys: readonly [number, number];

  /** Part ids and their weights. Unknown ids are reported by `pnpm scenery`. */
  buildings: readonly Weighted<string>[];
  civic: readonly Weighted<string>[];
  trees: readonly Weighted<string>[];
  scatter: readonly Weighted<string>[];

  /** Plot pitch as a multiple of plot size. 1.0 is a dense town, 1.8 is scattered. */
  spacing: number;
  /** Share of the plots outside the built core that get a tree. 0 is tundra. */
  greenery: number;

  /**
   * Which of `buildings` and `civic` a near town draws from the CC0 kit instead:
   * code part id -> asset part id. Near is the rank that peoples a town
   * (`PEOPLED_RANK` in `settlements.ts`); beyond it a town is built of the cheap
   * code-built parts. A region with no entry is built in code at every distance.
   */
  assets?: Readonly<Record<string, string>>;
}

// The context

/** One floor's worth of glazing on one face. See `SceneryContext.windows`. */
export interface WindowRow {
  /** How many, centred on X. */
  count: number;
  width: number;
  height: number;
  /**
   * Panes across one window. Two is a casement and the default; one is a slit
   * or a porthole, three is a shopfront. Above three the bars are under the pen
   * and the window goes back to being a rectangle.
   */
  panes?: number;
  /** Centre to centre. Defaults to 1.9 widths, which is a plain terrace rhythm. */
  spread?: number;
  /** The frames: a tone of the trim, or of the wall for a rendered surround. */
  frame: number;
  /** The glass. Defaults to `ctx.glass`, and outside a special case it should. */
  glass?: number;
  /** If given, a pair of shutters flanking every window, in this colour. */
  shutters?: number;
  /** How deep the frames stand off the wall. 0 paints them on; see `window`. */
  reveal?: number;
  /** Ceiling on how bright these may burn after dark. See `lit`. */
  strength?: number;
}

/** A front door. See `SceneryContext.door`. */
export interface DoorSpec {
  /** The opening, inside the frame. */
  width: number;
  height: number;
  /** The leaf: `doorPaint`, never a cap tone of the trim. */
  leaf: number;
  /** The architrave round the opening: a light tone of the wall reads as stone or render. */
  frame: number;
  /**
   * How high the threshold stands over the group's base. A step this high
   * comes out to the pavement under it, as wide as the frame and no wider;
   * 0 is none. Put the threshold level with the wall's base course and paint
   * the step in the course's tone: the two tops share a plane.
   */
  sill?: number;
  /** The step's colour: the base course's. Defaults to the frame's. */
  step?: number;
  /** Panels on the leaf, in a darker tone of it: true by default. */
  panels?: boolean;
}

/** The architrave's jambs and head, how far it stands off the wall, and the step's depth. */
export const DOOR_JAMB = 0.2;
export const DOOR_HEAD = 0.26;
export const DOOR_REVEAL = PROUD * 3.5;
export const DOOR_STEP = 0.5;

/** A door's paint for a wall: one of the region's, and never the wall's own colour. */
export function doorPaint(rng: Rng, style: RegionStyle, wall: number): number {
  const choices = style.doors.filter((color) => color !== wall);
  return rng.pick(choices.length > 0 ? choices : style.doors);
}
