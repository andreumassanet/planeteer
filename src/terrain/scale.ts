/**
 * World units per radian of arc, handed in by `prepareTerrain`.
 *
 * Geography here is measured in degrees and scales with the planet; footprints
 * (pads, valleys, probes) are human-scale and stay the same size in units. The
 * scale is passed in rather than imported because `globe.ts` imports the
 * terrain, and importing back would leave constants in their temporal dead zone.
 */
export const scale = { unitsPerRadian: 0 };
