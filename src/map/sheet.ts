import type { World } from '../geo.ts';
import type { Place } from '../places.ts';
import type { MapTiles } from '../map-tiles.ts';
import type { SheetRing } from '../map-outline.ts';
import type { MapDom } from './dom.ts';
import type { CountryLabel, Hit, MapMarker, SheetRoad, SheetTown, WorldMapOptions } from './types.ts';
import type { Placement } from '../placement.ts';

/** The pointer press in progress: where it began and the view it began from. */
export interface Press {
  id: number;
  x: number;
  y: number;
  cu: number;
  cv: number;
  moved: boolean;
}

/**
 * Everything one open map owns. The modules of `src/map/` are functions of it:
 * the DOM and the options are fixed at creation, the rest changes as the sheet
 * is used.
 */
export interface MapSheet extends MapDom {
  readonly world: World;
  readonly options: WorldMapOptions;
  readonly monuments: readonly Placement[];
  readonly marker: () => MapMarker | null;
  readonly onMark: WorldMapOptions['onMark'];
  readonly onUnmark: () => void;
  readonly lockTarget: HTMLElement | null;
  readonly allPlaces: readonly Place[];
  readonly surface: WorldMapOptions['surface'];
  /** The body's radius in world units, units per degree and radius in kilometres. */
  readonly RADIUS: number;
  readonly UNITS_PER_DEG: number;
  readonly RADIUS_KM: number;
  /** A body with no sea: every ring is land, painted in its nation's colour. */
  readonly dry: boolean;
  readonly ownTiles: boolean;
  readonly mapTiles: MapTiles;
  readonly countryName: Map<string, string>;
  readonly createdAt: number;
  /** Aborts every listener the map added. */
  readonly events: AbortController;
  readonly signal: AbortSignal;

  // What is on the sheet, projected once.
  rings: SheetRing[] | null;
  readonly countryLabels: CountryLabel[];
  /** The built towns, biggest first; rebuilt on each open. */
  readonly towns: SheetTown[];
  sheetRoads: SheetRoad[] | null;

  // The view: the sheet's size in pixels, the middle in map units, and pixels per map unit.
  width: number;
  height: number;
  ratio: number;
  cu: number;
  cv: number;
  S: number;
  zoomSet: boolean;
  canvasLeft: number;
  canvasTop: number;
  /** Where the canvas sits in the window, for the pointer. */
  canvasX: number;
  canvasY: number;

  readonly me: { u: number; v: number; lat: number; lon: number; heading: number; known: boolean };

  /** The sheet wants drawing again: the view, a tile, the names or the destination changed. */
  dirty: boolean;
  /** Only the marks over it do. */
  marksDirty: boolean;
  drawnAt: number;
  drawMs: number;
  marksMs: number;
  level: number;
  drawnVersion: number;
  /** What the cursor can point at on the sheet (towns and pins), and over it (the players). */
  readonly hits: Hit[];
  readonly peerHits: Hit[];
  /** The landmarks surviving the thinning this draw. */
  readonly keptPins: { index: number; x: number; y: number }[];
  /** The course sites on the sheet, projected once the list is known, and the ones kept this draw. */
  courseSpots: { u: number; v: number; dx: number }[] | null;
  /** Where each course's first ring stands on the sheet, by its key, once asked (`courseStart`); null where it has none. */
  courseStarts: Map<string, { u: number; v: number } | null>;
  courseSpotsFor: readonly unknown[] | null;
  readonly keptCourses: { index: number; x: number; y: number }[];
  /** The ring the shown course waited for at the last marks, to redraw them when it moves on. */
  lastCourseRing: unknown;
  /** Where you stood on the screen when the names were laid out round you. */
  laidMeX: number;
  laidMeY: number;
  /** Until when the sheet is being moved by hand, and whether the last draw was one of those. */
  busyUntil: number;
  drawnBusy: boolean;
  /** Label widths by font and text. */
  readonly widths: Map<string, number>;

  readonly padsOnSheet: Map<string, { u: number; v: number }>;
  padsAskedFor: string;
  warmedAt: number;
  warmedKey: string;

  hover: Hit | null;
  tipFor: Hit | null;
  tipIso: string;
  pendingClick: number;
  press: Press | null;
  readonly fingers: Map<number, { x: number; y: number }>;
  pinchSpread: number;

  showing: boolean;
  relockOnHide: boolean;
  lastMeX: number;
  lastMeY: number;
  lastHeading: number;
  lastMarker: string;
  lastUpdateAt: number;
}
