/** A grid town's shared types. */

import type { TownGrid } from '../../scenery/grid.ts';

/** One street: a line along `axis` at `at` across the other, `half` wide either side, with its pavements. */
export interface Street {
  /** `'x'`: the street runs along x (it is a line of constant z); `'z'`: along z. */
  axis: 'x' | 'z';
  at: number;
  half: number;
  walk: number;
  /** The main street through the middle: where the gates are, the parking, the bunting. */
  main: boolean;
}

/** What stands on a plot. */
export type PlotKind = 'module' | 'hub' | 'pad' | 'garden' | 'lot';

export interface GridPlot {
  kind: PlotKind;
  /** A kit building's id, or a form's name (built in code). */
  form: string;
  /** Where the building's middle stands, its yaw, and its scale over its own (`PIECES[form].scale`). */
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** The plot's free rectangle, the street's bands taken off: `[x0, z0, x1, z1]`. */
  rect: [number, number, number, number];
  /** Where its yard is, behind it, as a rectangle; null where there is no room for one. */
  yard: [number, number, number, number] | null;
  roof?: string;
  seed: string;
}

/** A stretch of pavement a person may stroll end to end. */
export interface Walk {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** A thing on the street, placed and turned: a lamp, a planter, a parked craft. */
export interface Placed {
  x: number;
  z: number;
  yaw: number;
}

/** What stands on a pavement between its lamps, as Earth's street dressing does (`street-dressing.ts`). */
export type FurnitureKind = 'bench' | 'bin' | 'vending' | 'sign';

export interface GridTown {
  grid: TownGrid;
  streets: Street[];
  plots: GridPlot[];
  walks: Walk[];
  lamps: Placed[];
  planters: Placed[];
  /** The pavements' furniture: halfway between two lamps, on the kerb side, its back to the carriageway. */
  furniture: (Placed & { kind: FurnitureKind })[];
  parked: Placed[];
  /** Where a traveller comes down: on the main street south of the middle, looking north into the town. */
  arrival: { x: number; z: number };
  /** The carriageway's half of the main street, for a craft parked on it. */
  mainCarriage: number;
}
