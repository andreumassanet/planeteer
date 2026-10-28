import type { World } from '../geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { EARTH_KM } from '../cartography.ts';
import { ensureStyle, installUi } from '../ui.ts';
import { SHEET_HEIGHT, createMapTiles } from '../map-tiles.ts';
import { createDom } from './dom.ts';
import type { MapSheet } from './sheet.ts';
import { STYLE } from './style.ts';
import type { WorldMapOptions } from './types.ts';

/** Builds the overlay and the state every other module of the map works on. */
export function createSheet(world: World, options: WorldMapOptions): MapSheet {
  const { monuments, marker, onMark, onUnmark } = options;
  // The body under the sheet: Earth's own functions unless a surface is handed in.
  const surface = options.surface;
  const ownTiles = options.tiles === undefined;
  const mapTiles = options.tiles ?? createMapTiles({ world, ...(surface === undefined ? {} : { surface }) });

  installUi();
  ensureStyle('atlas-map', STYLE);
  const dom = createDom(options);
  const events = new AbortController();

  return {
    ...dom,
    world,
    options,
    monuments,
    marker,
    onMark,
    onUnmark,
    lockTarget: options.lockTarget ?? null,
    allPlaces: options.places ?? [],
    surface,
    RADIUS: surface?.radius ?? PLANET_RADIUS,
    UNITS_PER_DEG: surface === undefined ? UNITS_PER_DEGREE : (surface.radius * Math.PI) / 180,
    RADIUS_KM: surface?.radiusKm ?? EARTH_KM,
    dry: surface !== undefined && !surface.sea,
    ownTiles,
    mapTiles,
    countryName: new Map(world.countries.map((country) => [country.iso, country.name])),
    createdAt: performance.now(),
    events,
    signal: events.signal,

    rings: null,
    countryLabels: [],
    towns: [],
    sheetRoads: null,

    width: 0,
    height: 0,
    ratio: 1,
    cu: 0.5,
    cv: SHEET_HEIGHT / 2,
    S: 0,
    zoomSet: false,
    canvasLeft: 3,
    canvasTop: 3,
    canvasX: 17,
    canvasY: 17,

    me: { u: 0.5, v: SHEET_HEIGHT / 2, lat: 0, lon: 0, heading: 0, known: false },

    dirty: true,
    marksDirty: true,
    drawnAt: 0,
    drawMs: 0,
    marksMs: 0,
    level: 0,
    drawnVersion: -1,
    hits: [],
    peerHits: [],
    keptPins: [],
    courseSpots: null,
    courseSpotsFor: null,
    keptCourses: [],
    lastCourseRing: null,
    laidMeX: -1e9,
    laidMeY: -1e9,
    busyUntil: 0,
    drawnBusy: false,
    widths: new Map(),

    padsOnSheet: new Map(),
    padsAskedFor: '',
    warmedAt: -Infinity,
    warmedKey: '',

    hover: null,
    tipFor: null,
    tipIso: '',
    pendingClick: 0,
    press: null,
    fingers: new Map(),
    pinchSpread: 0,

    showing: false,
    relockOnHide: false,
    lastMeX: -1,
    lastMeY: -1,
    lastHeading: 99,
    lastMarker: '',
    lastUpdateAt: 0,
  };
}
