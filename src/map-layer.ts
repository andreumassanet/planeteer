/**
 * The map layer's fades against the eye's height over the ground, one table
 * for Earth (`app/overlay.ts`) and every other world (`worlds/shell/frame.ts`).
 * Each country's colour comes up first, from a little over the rooftops; the
 * frontiers once a hill no longer hides a valley; the towns' names are there
 * from the ground and hand over to the countries' names on the way up, so
 * the screen holds one kind of name at a time.
 */

export interface LayerFades {
  /** Each country's colour over its land. */
  colour: number;
  /** The dashed frontiers, drawn with no depth test, so not while a hill could stand in front. */
  frontier: number;
  /** The countries' names. */
  country: number;
  /** The built towns' names. */
  town: number;
}

/** The colour starts over the rooftops and is whole by here, on a curve that shows it early. */
const COLOUR_LOW = 25;
const COLOUR_HIGH = 2200;
const COLOUR_CURVE = 0.6;
const FRONTIER_LOW = 450;
const FRONTIER_HIGH = 2200;
const COUNTRY_LOW = 1500;
const COUNTRY_HIGH = 3200;
const TOWN_LOW = 1900;
const TOWN_HIGH = 3800;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** The fades at a height over the ground, all zero when the layer is off (`B`). */
export function layerFades(height: number, on: boolean, out: LayerFades): LayerFades {
  if (!on) {
    out.colour = out.frontier = out.country = out.town = 0;
    return out;
  }
  out.colour = Math.max(0, Math.min(1, (height - COLOUR_LOW) / (COLOUR_HIGH - COLOUR_LOW))) ** COLOUR_CURVE;
  out.frontier = smoothstep(FRONTIER_LOW, FRONTIER_HIGH, height);
  out.country = smoothstep(COUNTRY_LOW, COUNTRY_HIGH, height);
  out.town = 1 - smoothstep(TOWN_LOW, TOWN_HIGH, height);
  return out;
}
