/**
 * Ramps and flights of steps where a town street crosses a riser between two
 * terraces: the record, its sizes and its surface.
 */

/**
 * How tall one step of a flight is, in world units: a flight divides its
 * riser into whole steps as near this as they come.
 */
export const STEP_RISE = 0.32;

/** How deep a tread is at most, in world units. A shallower cell gets steeper stairs rather than a longer flight. */
export const STEP_TREAD = 1.5;

/**
 * How far into its cell a flight of steps may run, as a share of the pitch.
 * Under a half, so two flights descending into one cell from its two ends
 * leave a landing between them.
 */
export const FLIGHT_RUN = 0.45;

/**
 * How far a ramp's or a flight's side stands in from the edge of its street,
 * in world units. A building's front is flush with its street, so a side in
 * that plane would z-fight with the front in the merged town mesh.
 */
export const FLIGHT_INSET = 0.5;

/**
 * How much level paving a ramp leaves between its foot and the next thing
 * along its street, in world units. A crossing street, an avenue and a gate's
 * mouth are level paving already and need none.
 */
export const RAMP_LANDING = 1;

/** The gentlest a ramp is spread to, as rise over run: a riser should read as one. */
export const RAMP_GENTLEST = 0.2;

/**
 * Where a street crosses a riser between two terraces: a ramp, or a flight of
 * steps where the street has no room to ramp (`life.ts` does not drive
 * through one).
 *
 * A ramp tilts the carriageway and its pavements together at no more than
 * `STREET_GRADE`: a fill standing on the lower terrace's paving and a cut sunk
 * into the higher one's. On a band street it is one of a pair, one per half,
 * meeting at the band's midline.
 *
 * Positions are in the town's plane; heights are elevations of the surface
 * (a terrace's level plus `GROUND_LIFT`).
 */
export interface Flight {
  /** The cell it stands in, which is the lower of the two. */
  cell: number;
  /** The higher cell, which a ramp's cut runs back into. */
  above: number;
  /** 0 when the street, and the climb, run along x; 1 along z. */
  axis: 0 | 1;
  /** Where the lower cell meets the higher one: the boundary's coordinate on `axis`. */
  at: number;
  /** Which way from `at` the surface descends, into the lower cell. */
  into: 1 | -1;
  /** Its extent across the street, on the other axis. */
  from: number;
  to: number;
  /** The street it carries: its centre line on the other axis, and its half-width. */
  centre: number;
  half: number;
  /** The higher terrace's surface, which the top meets, and the lower one's. */
  high: number;
  low: number;
  /** A ramp, rather than a flight of steps. */
  ramp: boolean;
  /** How far a ramp's cut runs back into the higher cell from `at`. 0 for steps. */
  back: number;
  /** How far it runs into the lower cell from `at`. */
  run: number;
  /** A flight's risers (the treads between them are one fewer) and how deep a tread is. 0 for a ramp. */
  steps: number;
  tread: number;
}

/** How far a flight runs into its cell: its treads end to end, or a ramp's fill. */
export function flightRun(flight: Flight): number {
  return flight.run;
}

/** A ramp's grade, rise over its whole run; 0 for a flight of steps. */
export function rampGrade(flight: Flight): number {
  return flight.ramp ? (flight.high - flight.low) / (flight.back + flight.run) : 0;
}

/**
 * The surface `s` units into the lower cell from `at`, as an elevation.
 *
 * A ramp is one plane from `high` at `s = -back` to `low` at `s = run`. A
 * flight has `steps` risers and `steps - 1` treads, its first riser at `s = 0`
 * and its last at `flightRun`.
 */
export function flightHeight(flight: Flight, s: number): number {
  if (flight.ramp) {
    if (s <= -flight.back) return flight.high;
    if (s >= flight.run) return flight.low;
    return flight.high - ((flight.high - flight.low) * (s + flight.back)) / (flight.back + flight.run);
  }
  if (s < 0) return flight.high;
  const k = Math.floor(s / flight.tread) + 1;
  if (k >= flight.steps) return flight.low;
  return flight.high - (k * (flight.high - flight.low)) / flight.steps;
}

/** How far `(x, z)` is into a flight along its climb: 0 at the top riser. */
export function flightDepth(flight: Flight, x: number, z: number): number {
  return ((flight.axis === 0 ? x : z) - flight.at) * flight.into;
}

/** A flight's footprint in the plane, as `[x0, x1, z0, z1]`. */
export function flightRect(flight: Flight, margin = 0): [number, number, number, number] {
  const a = flight.at - flight.into * flight.back;
  const b = flight.at + flight.into * flightRun(flight);
  const along0 = Math.min(a, b) - margin;
  const along1 = Math.max(a, b) + margin;
  const across0 = flight.from - margin;
  const across1 = flight.to + margin;
  return flight.axis === 0 ? [along0, along1, across0, across1] : [across0, across1, along0, along1];
}

/** Whether two flights' footprints overlap. */
export function overlap(a: Flight, b: Flight): boolean {
  const [ax0, ax1, az0, az1] = flightRect(a);
  const [bx0, bx1, bz0, bz1] = flightRect(b);
  return ax0 < bx1 - 1e-6 && bx0 < ax1 - 1e-6 && az0 < bz1 - 1e-6 && bz0 < az1 - 1e-6;
}
