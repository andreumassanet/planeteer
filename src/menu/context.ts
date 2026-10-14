/**
 * The menu's shared context: one object holding its handles and its state, built
 * once by `createContext`. Every module is a set of functions over it.
 */
import * as THREE from 'three';
import { LAND_HEIGHT } from '../globe.ts';
import { createOrrery, type Orrery, type OrreryBody } from '../orrery.ts';
import { ensureStyle, installUi } from '../ui.ts';
import { FOCUS_ELEVATION, FOV, R, SYSTEM_ELEVATION } from './constants.ts';
import { buildDom, type MenuDom } from './dom.ts';
import { orbitDistance } from './flight.ts';
import { type Flight, type GlobeView, makePose, type Orbit, type Pose } from './poses.ts';
import { createRibbonLayer, type RibbonLayer } from './ribbon-view.ts';
import { STYLE } from './style.ts';
import { EARTH_WORDS, type MenuBody, type MenuDeps, type MenuRegion, type MenuSite, type MenuSpawn, type MenuWords, type Stage } from './types.ts';

/** One catalogue per body: its regions by key and its sites by region, biggest first. */
export interface Catalogue {
  regionIndexOf: Map<string, number>;
  sitesOf: Map<string, MenuSite[]>;
}

/** Each body's disc on the screen this frame, for the labels and the pointer. */
export interface Disc {
  entry: OrreryBody;
  x: number;
  y: number;
  r: number;
  depth: number;
  visible: boolean;
}

/** One row the search can answer with. */
export interface Entry {
  /** The world it is on. */
  of: MenuBody;
  kind: 'country' | 'town';
  /** Found by a name the bake folded into the town, not the town's own. */
  alias?: boolean;
  /** What the row shows: for an alias, the town it finds. */
  name: string;
  /** What the query is matched against: for an alias, the alias. */
  folded: string;
  words: string[];
  weight: number;
  key: string;
  site: MenuSite | null;
  sub: string;
}

/**
 * Everything the menu's modules share: its handles (DOM, scene, orrery,
 * camera) and its mutable state. Each module is a set of functions over this.
 */
export interface MenuCtx extends MenuDom, RibbonLayer {
  readonly deps: MenuDeps;
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly draw: MenuDeps['draw'];
  readonly fallback: MenuDeps['fallback'];
  readonly time: MenuDeps['time'];
  /** The walkable world the globe stages start from: Earth. */
  readonly home: MenuBody;
  readonly walkable: Map<string, MenuBody>;
  /** The bodies `deps.loadBody` has made, kept for the session. */
  readonly loaded: Map<string, MenuBody>;
  readonly catalogues: Map<string, Catalogue>;
  readonly camera: THREE.PerspectiveCamera;
  readonly orrery: Orrery;
  /** Whether the player asked for less motion; read live. */
  readonly calm: MediaQueryList;
  readonly events: AbortController;
  readonly signal: AbortSignal;

  /** The walkable world the globe stages are about: Earth, until another's *Explore*. */
  body: MenuBody;
  /** What the current body calls a region and a site. */
  words: MenuWords;
  regionIndexOf: Map<string, number>;
  sitesOf: Map<string, MenuSite[]>;
  stage: Stage;
  flight: Flight | null;
  /** A screen in front (`hold`), and a world that has taken the screen (`suspend`). */
  held: boolean;
  suspended: boolean;
  /** The chosen country, at the site stage. */
  region: MenuRegion | null;
  regionIndex: number;
  /** The country under the pointer at the region stage. */
  hoverIndex: number;
  /** The body up close, at the planet stage. */
  focusId: string;
  /** The body under the pointer or the dock item under it. */
  hoverBody: string | null;
  picked: MenuSite | null;
  chosen: MenuSpawn | null;
  lastTouched: number;
  /** Where Continue goes; asked again whenever the menu comes back from a world, which has written its own record by then. */
  last: MenuSpawn | null;

  readonly sys: Orbit;
  readonly sysWant: Orbit;
  readonly focus: Orbit;
  readonly focusWant: Orbit;
  /** The globe: where the camera is and where it is going, degrees and units. */
  readonly view: GlobeView;
  readonly want: GlobeView;
  readonly pose: Pose;
  readonly scratch: THREE.Vector3;
  readonly scratchB: THREE.Vector3;
  readonly scratchC: THREE.Vector3;

  /** The region whose ribbon is showing. */
  shown: MenuRegion | null;
  readonly ray: THREE.Ray;
  readonly surface: THREE.Sphere;
  readonly discs: Disc[];
  readonly labels: Map<string, HTMLButtonElement>;
  readonly dockItems: Map<string, HTMLButtonElement>;

  readonly shownPins: Map<number, HTMLButtonElement>;
  readonly freePins: HTMLButtonElement[];
  /** The towns of the chosen region, with their unit vectors and this frame's projection. */
  sites: MenuSite[];
  unitOf: THREE.Vector3[];
  projX: Float32Array;
  projY: Float32Array;
  order: Int32Array;
  kept: Int32Array;
  keptX: Float32Array;
  keptY: Float32Array;
  /** The town under the pointer in the list, whose pin lights up. */
  hotSite: MenuSite | null;
  readonly rowOf: Map<MenuSite, HTMLButtonElement>;

  /** *Explore* on a body's card, while its `MenuBody` is being made. */
  exploring: string | null;
  /** The bodies being made, so a click and the warm-up never make one twice. */
  readonly making: Map<string, Promise<MenuBody | null>>;
  /** The walked worlds' own grounds standing in the system, and whose. */
  readonly globes: { entry: OrreryBody; globe: NonNullable<MenuBody['globe']> }[];
  disposed: boolean;

  readonly entriesOf: Map<string, Entry[]>;
  found: Entry[];
  cursor: number;

  dragging: boolean;
  dragged: number;
  pointer: { x: number; y: number };

  resolveChoice: ((spawn: MenuSpawn) => void) | null;
  /** One promise for every caller of `choose()`. */
  choice: Promise<MenuSpawn> | null;
  running: boolean;
  /** What the sound last heard was under the pointer, and which stage it last heard. */
  lastHovered: string | null;
  heardStage: Stage | null;
  previous: number;
  beforeRender: ((camera: THREE.PerspectiveCamera) => void) | null;
  /** The animation-frame callback; set once the context exists. */
  tick: (now: number) => void;
}

export function createContext(deps: MenuDeps): MenuCtx {
  const { bodies, scene, renderer, draw, fallback, time } = deps;
  if (bodies.length === 0) throw new Error('createMenu: no bodies to spawn on');
  installUi();
  ensureStyle('atlas-menu', STYLE);

  const home = bodies[0]!;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 5, R * 300);
  const orrery = createOrrery();
  scene.add(orrery.group);
  const dom = buildDom(deps);
  const events = new AbortController();
  const view = { lat: 20, lon: 6, dist: orbitDistance(R) };
  const sys: Orbit = { azimuth: 0, elevation: SYSTEM_ELEVATION, distance: orrery.extent * 1.5 };
  const focus: Orbit = { azimuth: 0, elevation: FOCUS_ELEVATION, distance: R };

  return {
    ...dom,
    ...createRibbonLayer(scene),
    deps,
    scene,
    renderer,
    draw,
    fallback,
    time,
    home,
    walkable: new Map(bodies.map((candidate) => [candidate.id, candidate])),
    loaded: new Map(),
    catalogues: new Map(),
    camera,
    orrery,
    calm: matchMedia('(prefers-reduced-motion: reduce)'),
    events,
    signal: events.signal,
    body: home,
    words: home.words ?? EARTH_WORDS,
    regionIndexOf: new Map(),
    sitesOf: new Map(),
    stage: 'system',
    flight: null,
    held: false,
    suspended: false,
    region: null,
    regionIndex: 0,
    hoverIndex: 0,
    focusId: '',
    hoverBody: null,
    picked: null,
    chosen: null,
    lastTouched: performance.now(),
    last: null,
    sys,
    sysWant: { ...sys },
    focus,
    focusWant: { ...focus },
    view,
    want: { ...view },
    pose: makePose(),
    scratch: new THREE.Vector3(),
    scratchB: new THREE.Vector3(),
    scratchC: new THREE.Vector3(),
    shown: null,
    ray: new THREE.Ray(),
    surface: new THREE.Sphere(new THREE.Vector3(), R + LAND_HEIGHT),
    discs: orrery.bodies.map((entry) => ({ entry, x: 0, y: 0, r: 0, depth: 0, visible: false })),
    labels: new Map(),
    dockItems: new Map(),
    shownPins: new Map(),
    freePins: [],
    sites: [],
    unitOf: [],
    projX: new Float32Array(0),
    projY: new Float32Array(0),
    order: new Int32Array(0),
    kept: new Int32Array(0),
    keptX: new Float32Array(0),
    keptY: new Float32Array(0),
    hotSite: null,
    rowOf: new Map(),
    exploring: null,
    making: new Map(),
    globes: [],
    disposed: false,
    entriesOf: new Map(),
    found: [],
    cursor: 0,
    dragging: false,
    dragged: 0,
    pointer: { x: -1, y: -1 },
    resolveChoice: null,
    choice: null,
    running: true,
    lastHovered: null,
    heardStage: null,
    previous: performance.now(),
    beforeRender: null,
    tick: () => {},
  };
}
