import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from './globe.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import type { BiomeId, BiomeSample } from './biome.ts';
import { shoreDistance } from './terrain.ts';
import { latOf, lonOf, unitAt } from './sphere.ts';
import { PALETTE, createToonRamp } from './theme.ts';
import { nightAt } from './lights.ts';
import { isWater } from './vehicles.ts';
import { birdGeometry } from './life.ts';
import { hash3, seasonTurn } from './weather.ts';
import { proxyOf } from './warm.ts';

/**
 * The small life round the camera: fireflies over the grass on a summer
 * night, butterflies over a meadow by day, pollen hanging in the sun, gulls
 * wheeling over a coast, a fish jumping off the shore, and leaves coming down
 * under the trees in autumn.
 *
 * **Nothing here is stored, streamed or random.** The ground round the player
 * is cut into cells of `CELL` units on a fixed grid of the sphere, and a cell
 * is a pure function of its row and column: what lives there comes from the
 * biome, the coast and the meadows at its centre, and each creature's seed is
 * `hash3` of the cell and its own number. Where it is at any instant is a pure
 * function of that seed and the clock. So turning round, walking off and
 * coming back, or arriving by another road all show the same fireflies in the
 * same places; a cell that comes into range fades in over `FADE_IN` rather
 * than appearing, and one at the edge of the range fades with distance.
 *
 * **Two draw calls, and none of either is inked.** The lights — fireflies and
 * pollen — are one `THREE.Points`, additive, the lamp halos' kind of object
 * (`lights.ts`), gated by the same terminator (`nightAt`) so that a firefly
 * comes on at the minute the windows do and `atlas.brightness(0)` puts it out
 * with them. Everything with a body — wings, leaves, fish and gulls — is one
 * mesh of loose triangles rewritten every frame, as the flocks in `life.ts`
 * are. It is drawn without the pen: an ink hull is a second draw of the whole
 * mesh, and on a wing a fifth of a unit across the pen would be the whole
 * wing (the pen is screen space; see `outline.ts`).
 *
 * **Everything quiets with the weather and nothing lives where it would not.**
 * Rain, snow, a gale or the cold send the insects in; a storm grounds the
 * gulls; a desert, the ice, the bare rock and a town's paving hold none of the
 * insects at all; the leaves fall only in the temperate and boreal woods, in
 * the autumn of the hemisphere they are in.
 *
 * **Sizes are chosen to be seen, not to be right**, as the birds' are
 * (`life.ts`): a butterfly is seven centimetres, which at `SCENERY_SCALE` and
 * the animals' stature is a fifth of a unit and three pixels at twenty units
 * away. They are drawn about twice that.
 */

export interface AmbientOptions {
  /** The drawn land's radius under a point (`groundRadius`). */
  groundAt(point: THREE.Vector3): number;
  /** A town's floor or a road's ribbon under a point, as a radius, or 0 (`main.ts`'s `madeHeightAt`). */
  madeHeightAt(point: THREE.Vector3): number;
  /** Whether a unit direction is inside a meadow of the countryside (`countryside.meadowAt`). */
  meadowAt?(direction: THREE.Vector3): boolean;
  /** Whether a tree stands within a few units of a point: what a falling leaf needs over it. */
  treeNear?(point: THREE.Vector3): boolean;
  /** A splash on the water at a point, `reach` units across (`effects.splashAt`). */
  splash?(point: THREE.Vector3, reach: number): void;
  /**
   * How many new cells a frame may work out. Each is a biome, a coast
   * distance and seven ground heights; the headless check lifts it.
   */
  admitPerFrame?: number;
}

/** The weather where the player is, as `weather-view.ts`'s `here()` gives it: only what this reads. */
export interface AmbientWeather {
  precipitation: number;
  snow: number;
  storm: number;
  fog: number;
  temperatureC: number;
  lying: number;
  wind: { speed: number; from: number };
}

export interface AmbientFrame {
  /** The player: the range is centred here. */
  player: THREE.Vector3;
  /** The camera's height over the ground under the player, in units. */
  cameraHeight: number;
  /** The sky's clock: the season. */
  time: Date;
  /** `sky.state.daylight`, 0 full night to 1 full day. */
  daylight: number;
  /** On the water: swimming or in a boat, when the fish jump anywhere near and not only off the shore. */
  afloat: boolean;
}

export interface AmbientStats {
  enabled: boolean;
  /** Small cells in range, and cells worked out since the page loaded. */
  cells: number;
  gullCells: number;
  admitted: number;
  fireflies: number;
  motes: number;
  butterflies: number;
  leaves: number;
  fish: number;
  gulls: number;
  /** 0 to 2. */
  calls: number;
  /** Why the insects are in, if they are: `rain`, `cold`, `wind`, `snow`, or `''`. */
  quiet: string;
  /** Autumn here, 0 to 1. */
  autumn: number;
  updateMs: number;
}

export interface Ambient {
  group: THREE.Group;
  /** Off hides both meshes and does no work; the Settings card's *Effects* switch carries it. */
  enabled: boolean;
  readonly stats: AmbientStats;
  /** Every frame. `weather` is read at most every `WEATHER_EVERY` seconds. */
  update(dt: number, frame: AmbientFrame, weather: () => AmbientWeather): void;
  /**
   * Every live creature's position, rounded to a thousandth and sorted: two
   * runs that end at the same place and clock agree on this, however they got
   * there. For the headless check and the console.
   */
  snapshot(): string[];
  /** One mesh per program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
}

/* --- the grid ------------------------------------------------------------- */

/** A small cell's side, in units: the insects, the leaves and the fish. */
export const CELL = 16;
/** A gull cell's side: a harbour's worth of sky. */
export const GULL_CELL = 90;
/** How far from the player the small cells are kept, and where they start to fade. */
const RANGE = 64;
const FADE_FROM = 46;
const GULL_RANGE = 260;
/** Seconds a newly worked-out cell takes to fade in. */
const FADE_IN = 1.2;
/** The camera this far over the ground sees none of it, and it fades from `HIGH_FADE`. */
const HIGH = 160;
const HIGH_FADE = 90;
const GULL_HIGH = 700;
/** Rescan after this much walking, or this long standing. */
const RESCAN_MOVE = 4;
const RESCAN_EVERY = 0.5;
const WEATHER_EVERY = 0.5;
/** Past this latitude nothing here lives, and the columns are too narrow to be worth cutting. */
const POLAR = 78;
/** The cache is forgotten past this many cells, keeping those in range. */
const CACHE_CAP = 3000;

const DEG = Math.PI / 180;

/** The row of a latitude on a grid of cells `size` units tall. */
export function rowOf(lat: number, size: number): number {
  return Math.floor((lat * UNITS_PER_DEGREE) / size);
}

/** The latitude of a row's middle. */
export function rowLat(row: number, size: number): number {
  return ((row + 0.5) * size) / UNITS_PER_DEGREE;
}

/**
 * How many cells a row is cut into: as many as fit round the parallel at its
 * middle, so a cell is about `size` wide at every latitude and the columns of
 * a row never depend on where the player stands.
 */
export function columnsIn(row: number, size: number): number {
  const across = Math.cos(rowLat(row, size) * DEG);
  return Math.max(1, Math.floor((360 * UNITS_PER_DEGREE * Math.max(across, 0.02)) / size));
}

/** The column of a longitude in a row of `columns` cells. */
export function columnOf(lon: number, columns: number): number {
  const c = Math.floor(((lon + 180) / 360) * columns);
  return ((c % columns) + columns) % columns;
}

/** A cell's middle longitude. */
export function columnLon(column: number, columns: number): number {
  return ((column + 0.5) / columns) * 360 - 180;
}

/** One number per cell, unique on the planet at either size. */
export function cellKey(row: number, column: number): number {
  return (row + 8192) * 1048576 + column;
}

/* --- who lives where -------------------------------------------------------- */

/** How likely a small cell is to hold fireflies, by biome; the rest hold none. */
const FIREFLY: Partial<Record<BiomeId, number>> = { tropical: 0.7, temperate: 0.45, grassland: 0.3, savanna: 0.35, boreal: 0.2 };
/** And butterflies, outside a meadow; a meadow always has them. */
const BUTTERFLY: Partial<Record<BiomeId, number>> = { temperate: 0.22, grassland: 0.25, savanna: 0.2, tropical: 0.3 };
/** And pollen in the sun. */
const MOTE: Partial<Record<BiomeId, number>> = { temperate: 0.5, grassland: 0.6, savanna: 0.3, steppe: 0.25, tropical: 0.35 };
/** Woods that shed their leaves, and how likely a cell of one is to be shedding. */
const LEAF: Partial<Record<BiomeId, number>> = { temperate: 0.9, boreal: 0.45 };

/** Anchors a frame may ask whether a tree stands over them (`treeNear`). */
const TREE_PROBES = 36;
/** Ground points per small cell that the creatures in it circle. */
const ANCHORS = 6;
/** Units to the water inside which a cell is waterside: wetter for fireflies, and fish off it. */
const WATERSIDE = 60;
/** How near the coast a gull cell has to be. */
const GULL_COAST = 140;

/** The seeds' third argument: a kind and a creature's number in its cell. */
const K_FIREFLY = 0;
const K_BUTTERFLY = 64;
const K_MOTE = 128;
const K_LEAF = 192;
const K_FISH = 256;
const K_GULL = 320;
const K_CELL = 384;
const K_ANCHOR = 448;

/* --- the creatures' own numbers ----------------------------------------- */

const MAX_FIREFLIES = 150;
const MAX_MOTES = 70;
const MAX_POINTS = MAX_FIREFLIES + MAX_MOTES;
const MAX_BUTTERFLIES = 24;
const MAX_LEAVES = 48;
const MAX_FISH = 4;
const MAX_GULLS = 8;

/** Half a butterfly's span, and its body's half length, in units. */
const WING = 0.19;
const WING_BODY = 0.08;
/** Half a leaf's diagonal. */
const LEAF_SIZE = 0.15;
/** A fish's half length, and its jump: how high and how far, and how long it is out. */
const FISH_HALF = 0.32;
const FISH_HEIGHT = 1.5;
const FISH_TRAVEL = 2.2;
const FISH_AIR = 1.1;
/** Seconds in one of a water cell's jump slots, and the odds it has a jump in it. */
const FISH_SLOT = 7;
const FISH_ODDS = 0.16;
/** The water's surface, over the sea's radius: `life.ts`'s `SEA_SINK` in the other direction, near enough. */
const WATER_LINE = PLANET_RADIUS - 0.4;
/** A firefly's glow and a mote's, in world units across. */
const FIREFLY_SIZE = 0.5;
const MOTE_SIZE = 0.14;

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const fract = (t: number): number => t - Math.floor(t);

/**
 * Autumn at a latitude, 0 to 1: the fall of the hemisphere the point is in,
 * from late August to mid-December in the north and its mirror in the south.
 * The tropics have no autumn to speak of.
 */
export function autumnAt(timeMs: number, lat: number): number {
  const turn = Math.sin(seasonTurn(timeMs)) * (lat >= 0 ? 1 : -1);
  return smooth((turn - 0.55) / 0.35) * smooth((Math.abs(lat) - 24) / 8);
}

/** A small cell, worked out once and kept. */
interface Cell {
  key: number;
  row: number;
  column: number;
  /** Unit vector at its middle, and the local frame there. */
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  biome: BiomeId;
  water: boolean;
  /** Units to the nearest water. */
  shore: number;
  town: boolean;
  meadow: boolean;
  fireflies: number;
  butterflies: number;
  motes: number;
  /** Leaves per anchor that stands under a tree; 0 for a cell that sheds none. */
  leaves: number;
  /** Which anchors stand under a tree, as bits; and when that was last asked. */
  trees: number;
  treesAskedAt: number;
  fish: boolean;
  /** The anchors: ground points as unit direction and radius, `[x, y, z, r]` each. */
  anchors: Float32Array;
  anchorCount: number;
  /** The clock when it was worked out, for the fade in. */
  born: number;
  /** The last jump slot splashed going in and coming out. */
  fishIn: number;
  fishOut: number;
  /** This frame's fade, distance and age together. */
  fade: number;
}

/** A gull cell: the sky over a stretch of coast. */
interface GullCell {
  key: number;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** How many gulls wheel here, 0 to 3, and the height they wheel at. */
  count: number;
  altitude: number;
  row: number;
  column: number;
  born: number;
  fade: number;
}

/** The frame at a unit vector: north along the meridian, east along the parallel. */
function frameAt(up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): void {
  north.set(0, 1, 0).addScaledVector(up, -up.y);
  if (north.lengthSq() < 1e-10) north.set(1, 0, 0);
  north.normalize();
  east.crossVectors(north, up).normalize();
}

/* --- the lights' material -------------------------------------------------- */

function lightMaterial(): THREE.ShaderMaterial {
  const firefly = new THREE.Color(PALETTE.olive).lerp(new THREE.Color(PALETTE.white), 0.45);
  const mote = new THREE.Color(PALETTE.cream);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']!),
      fireflyColor: { value: firefly },
      moteColor: { value: mote },
      screenScale: { value: 450 },
    },
    vertexShader: /* glsl */ `
      attribute float glow;
      attribute float spot;
      attribute float kind;
      uniform float screenScale;
      varying float vGlow;
      varying float vKind;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(-mvPosition.z, 0.5);
        vGlow = glow;
        vKind = kind;
        gl_PointSize = clamp(spot * projectionMatrix[1][1] * screenScale / dist, 1.5, 28.0);
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fireflyColor;
      uniform vec3 moteColor;
      varying float vGlow;
      varying float vKind;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        if (vGlow < 0.004) discard;
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float halo = 1.0 - smoothstep(0.0, 1.0, r);
        float core = 1.0 - smoothstep(0.18, 0.32, r);
        vec3 colour = mix(fireflyColor, moteColor, vKind);
        float alpha = mix(halo * halo * 0.6 + core * 0.8, core * 0.9 + halo * 0.15, vKind) * vGlow;
        gl_FragColor = vec4(colour, alpha);
        #ifdef USE_FOG
          gl_FragColor *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  material.userData.outlineParameters = { visible: false };
  return material;
}

function bodyMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4), side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  return material;
}

/* --- the colours ---------------------------------------------------------- */

const WINGS: readonly number[] = [PALETTE.gold, PALETTE.white, PALETTE.orange, PALETTE.skyBlue, PALETTE.apricot, PALETTE.violet];
const LEAVES: readonly number[] = [PALETTE.orange, PALETTE.gold, PALETTE.clay, PALETTE.red, PALETTE.apricot];
const colourCache = new Map<number, THREE.Color>();
function colourOf(hex: number): THREE.Color {
  let colour = colourCache.get(hex);
  if (colour === undefined) colourCache.set(hex, (colour = new THREE.Color(hex)));
  return colour;
}

/* --- the module ----------------------------------------------------------- */

export function createAmbient(options: AmbientOptions): Ambient {
  const group = new THREE.Group();
  group.name = 'ambient';
  const admitPerFrame = options.admitPerFrame ?? 2;

  // The lights.
  const lightPosition = new Float32Array(MAX_POINTS * 3);
  const lightGlow = new Float32Array(MAX_POINTS);
  const lightSize = new Float32Array(MAX_POINTS);
  const lightKind = new Float32Array(MAX_POINTS);
  const lightGeometry = new THREE.BufferGeometry();
  const lightAttributes = [
    new THREE.BufferAttribute(lightPosition, 3),
    new THREE.BufferAttribute(lightGlow, 1),
    new THREE.BufferAttribute(lightSize, 1),
    new THREE.BufferAttribute(lightKind, 1),
  ];
  for (const attribute of lightAttributes) attribute.setUsage(THREE.DynamicDrawUsage);
  lightGeometry.setAttribute('position', lightAttributes[0]!);
  lightGeometry.setAttribute('glow', lightAttributes[1]!);
  lightGeometry.setAttribute('spot', lightAttributes[2]!);
  lightGeometry.setAttribute('kind', lightAttributes[3]!);
  lightGeometry.setDrawRange(0, 0);
  const lightMat = lightMaterial();
  const lights = new THREE.Points(lightGeometry, lightMat);
  lights.name = 'ambient-lights';
  lights.frustumCulled = false;
  lights.renderOrder = 2;
  lights.visible = false;
  group.add(lights);

  // The bodies: loose triangles, rewritten each frame.
  const gull = birdGeometry(PALETTE.bone, PALETTE.white);
  const gullVertices = gull.position.length / 3;
  const MAX_VERTICES =
    MAX_BUTTERFLIES * 4 * 3 + MAX_LEAVES * 2 * 3 + MAX_FISH * 3 * 3 + MAX_GULLS * gullVertices;
  const bodyPosition = new Float32Array(MAX_VERTICES * 3);
  const bodyNormal = new Float32Array(MAX_VERTICES * 3);
  const bodyColor = new Float32Array(MAX_VERTICES * 3);
  const bodyGeometry = new THREE.BufferGeometry();
  const bodyAttributes = [
    new THREE.BufferAttribute(bodyPosition, 3),
    new THREE.BufferAttribute(bodyNormal, 3),
    new THREE.BufferAttribute(bodyColor, 3),
  ];
  for (const attribute of bodyAttributes) attribute.setUsage(THREE.DynamicDrawUsage);
  bodyGeometry.setAttribute('position', bodyAttributes[0]!);
  bodyGeometry.setAttribute('normal', bodyAttributes[1]!);
  bodyGeometry.setAttribute('color', bodyAttributes[2]!);
  bodyGeometry.setDrawRange(0, 0);
  const bodyMat = bodyMaterial();
  const bodies = new THREE.Mesh(bodyGeometry, bodyMat);
  bodies.name = 'ambient-bodies';
  // Spread over a few hundred units and every vertex moves every frame.
  bodies.frustumCulled = false;
  bodies.visible = false;
  group.add(bodies);

  const stats: AmbientStats = {
    enabled: true, cells: 0, gullCells: 0, admitted: 0, fireflies: 0, motes: 0, butterflies: 0,
    leaves: 0, fish: 0, gulls: 0, calls: 0, quiet: '', autumn: 0, updateMs: 0,
  };
  let enabled = true;

  const cells = new Map<number, Cell>();
  const gullCells = new Map<number, GullCell>();
  const active: Cell[] = [];
  const activeGulls: GullCell[] = [];
  const lastScan = new THREE.Vector3(Infinity, 0, 0);
  let sinceScan = Infinity;
  let pending = false;
  let clock = 0;
  let weatherAge = Infinity;
  const weatherNow: AmbientWeather = { precipitation: 0, snow: 0, storm: 0, fog: 0, temperatureC: 15, lying: 0, wind: { speed: 0, from: 0 } };

  const sample: BiomeSample = biomeSample();
  const probe = new THREE.Vector3();
  const point = new THREE.Vector3();
  const other = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const tipA = new THREE.Vector3();
  const tipB = new THREE.Vector3();
  const axisA = new THREE.Vector3();
  const axisB = new THREE.Vector3();
  const drift = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const scanUp = new THREE.Vector3();
  const scanCell = new THREE.Vector3();
  const playerUp = new THREE.Vector3();
  let lightCursor = 0;
  /**
   * How many anchors a frame may ask the woods about. A walk into an autumn
   * wood brings sixty cells into range at once, and asking all of them in one
   * frame is a few hundred wall tests.
   */
  let treeProbes = 0;
  let vertexCursor = 0;

  /* --- working a cell out ------------------------------------------------ */

  function admit(row: number, column: number, columns: number): Cell {
    const lat = rowLat(row, CELL);
    const lon = columnLon(column, columns);
    const up = unitAt(lat, lon, new THREE.Vector3());
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    frameAt(up, east, north);
    probe.copy(up).multiplyScalar(PLANET_RADIUS);
    const ground = options.groundAt(probe);
    const made = options.madeHeightAt(probe);
    biomeAt(up.x, up.y, up.z, lat, lon, Math.max(0, ground - PLANET_RADIUS), sample);
    const water = isWater(ground) && made <= 0;
    const shore = shoreDistance(lat, lon) * UNITS_PER_DEGREE;
    const town = made > 0;
    const biome = sample.id;
    const meadow = !water && !town && (options.meadowAt?.(up) ?? false);
    const roll = (i: number): number => hash3(row, column, K_CELL + i);

    let fireflies = 0;
    let butterflies = 0;
    let motes = 0;
    let leaves = 0;
    if (!water && !town) {
      const wet = shore < WATERSIDE ? 1.6 : 1;
      const firefly = (FIREFLY[biome] ?? 0) * wet * (0.4 + 0.6 * BIOMES[biome].sward);
      if (roll(0) < firefly) fireflies = 2 + Math.floor(roll(1) * 4);
      if (meadow) butterflies = 2 + Math.floor(roll(2) * 2);
      else if (roll(3) < (BUTTERFLY[biome] ?? 0)) butterflies = 1;
      if (roll(4) < (MOTE[biome] ?? 0) * (meadow ? 1.6 : 1)) motes = 2 + Math.floor(roll(5) * 3);
      if (roll(6) < (LEAF[biome] ?? 0)) leaves = 2;
    }
    const fish = water && biome !== 'ice' && roll(7) < 0.8;

    const cell: Cell = {
      key: cellKey(row, column), row, column, up, east, north, biome, water, shore, town, meadow,
      fireflies, butterflies, motes, leaves, trees: 0, treesAskedAt: -Infinity, fish,
      anchors: new Float32Array(ANCHORS * 4), anchorCount: 0, born: clock, fishIn: -1, fishOut: -1, fade: 0,
    };
    // The anchors, only where something will use them: a cell of the desert
    // or of open sea far from anything asks no heights at all.
    if (fireflies + butterflies + motes + leaves > 0 || fish) {
      for (let i = 0; i < ANCHORS; i++) {
        const e = (hash3(row, column, K_ANCHOR + i * 2) - 0.5) * CELL;
        const n = (hash3(row, column, K_ANCHOR + i * 2 + 1) - 0.5) * CELL;
        probe.copy(up).addScaledVector(east, e / PLANET_RADIUS).addScaledVector(north, n / PLANET_RADIUS).normalize();
        point.copy(probe).multiplyScalar(PLANET_RADIUS);
        const floor = options.madeHeightAt(point);
        const radius = floor > 0 ? floor : options.groundAt(point);
        // A fish wants water under it and everything else land: an anchor
        // on the wrong side of the shore is dropped rather than moved.
        if (isWater(radius) !== fish) continue;
        const o = cell.anchorCount * 4;
        cell.anchors[o] = probe.x;
        cell.anchors[o + 1] = probe.y;
        cell.anchors[o + 2] = probe.z;
        cell.anchors[o + 3] = fish ? WATER_LINE : radius;
        cell.anchorCount++;
      }
    }
    stats.admitted++;
    return cell;
  }

  function admitGulls(row: number, column: number, columns: number): GullCell {
    const lat = rowLat(row, GULL_CELL);
    const lon = columnLon(column, columns);
    const up = unitAt(lat, lon, new THREE.Vector3());
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    frameAt(up, east, north);
    probe.copy(up).multiplyScalar(PLANET_RADIUS);
    const ground = Math.max(PLANET_RADIUS, options.groundAt(probe));
    const shore = shoreDistance(lat, lon) * UNITS_PER_DEGREE;
    const coastal = shore < GULL_COAST || isWater(ground);
    // Out at sea past sight of land there are gulls too, but fewer.
    const odds = !coastal ? 0 : shore < GULL_COAST ? 0.45 : 0.12;
    const count = hash3(row, column, K_GULL) < odds ? 1 + Math.floor(hash3(row, column, K_GULL + 1) * 3) : 0;
    const altitude = ground + 14 + hash3(row, column, K_GULL + 2) * 16;
    return { key: cellKey(row, column), up, east, north, count, altitude, row, column, born: clock, fade: 0 };
  }

  /**
   * Every cell of a grid whose middle is within `range` of the player, as a
   * row, a column and the row's column count. Allocates nothing but the
   * closure its caller hands it, twice a second.
   */
  function forEachNear(size: number, range: number, visit: (row: number, column: number, columns: number) => void): void {
    const lat = latOf(scanUp.y);
    if (Math.abs(lat) > POLAR) return;
    const lon = lonOf(scanUp.x, scanUp.z);
    const reachDeg = (range + size) / UNITS_PER_DEGREE;
    const cosRange = Math.cos((range + size * 0.75) / PLANET_RADIUS);
    for (let row = rowOf(lat - reachDeg, size), last = rowOf(lat + reachDeg, size); row <= last; row++) {
      const columns = columnsIn(row, size);
      const across = reachDeg / Math.max(0.05, Math.cos(rowLat(row, size) * DEG));
      const span = Math.ceil((across / 360) * columns) + 1;
      const whole = span * 2 + 1 >= columns;
      const middle = columnOf(lon, columns);
      const from = whole ? 0 : middle - span;
      const to = whole ? columns - 1 : middle + span;
      const middleLat = rowLat(row, size);
      for (let k = from; k <= to; k++) {
        const column = ((k % columns) + columns) % columns;
        unitAt(middleLat, columnLon(column, columns), scanCell);
        if (scanCell.dot(scanUp) < cosRange) continue;
        visit(row, column, columns);
      }
    }
  }

  /** Which cells are in range: kept ones reused, new ones worked out while the budget lasts. */
  function scan(player: THREE.Vector3, small: boolean, budget: number): number {
    scanUp.copy(player).normalize();
    if (small) {
      active.length = 0;
      forEachNear(CELL, RANGE, (row, column, columns) => {
        const key = cellKey(row, column);
        let cell = cells.get(key);
        if (cell === undefined) {
          if (budget <= 0) {
            pending = true;
            return;
          }
          budget--;
          cell = admit(row, column, columns);
          cells.set(key, cell);
        }
        if (cell.anchorCount > 0) active.push(cell);
      });
    }
    activeGulls.length = 0;
    forEachNear(GULL_CELL, GULL_RANGE, (row, column, columns) => {
      const key = cellKey(row, column);
      let cell = gullCells.get(key);
      if (cell === undefined) {
        if (budget <= 0) {
          pending = true;
          return;
        }
        budget--;
        cell = admitGulls(row, column, columns);
        gullCells.set(key, cell);
      }
      if (cell.count > 0) activeGulls.push(cell);
    });
    return budget;
  }

  function forget(): void {
    if (cells.size > CACHE_CAP) {
      const keep = new Set(active.map((cell) => cell.key));
      for (const key of cells.keys()) if (!keep.has(key)) cells.delete(key);
    }
    if (gullCells.size > CACHE_CAP) {
      const keep = new Set(activeGulls.map((cell) => cell.key));
      for (const key of gullCells.keys()) if (!keep.has(key)) gullCells.delete(key);
    }
  }

  /* --- writing ----------------------------------------------------------- */

  function light(at: THREE.Vector3, glow: number, size: number, kind: number): void {
    if (glow < 0.004 || lightCursor >= MAX_POINTS) return;
    const i = lightCursor++;
    lightPosition[i * 3] = at.x;
    lightPosition[i * 3 + 1] = at.y;
    lightPosition[i * 3 + 2] = at.z;
    lightGlow[i] = glow;
    lightSize[i] = size;
    lightKind[i] = kind;
  }

  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color): void {
    if (vertexCursor + 3 > MAX_VERTICES) return;
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    vertex(a, nx, ny, nz, colour);
    vertex(b, nx, ny, nz, colour);
    vertex(c, nx, ny, nz, colour);
  }

  function vertex(p: THREE.Vector3, nx: number, ny: number, nz: number, colour: THREE.Color): void {
    const o = vertexCursor * 3;
    bodyPosition[o] = p.x;
    bodyPosition[o + 1] = p.y;
    bodyPosition[o + 2] = p.z;
    bodyNormal[o] = nx;
    bodyNormal[o + 1] = ny;
    bodyNormal[o + 2] = nz;
    bodyColor[o] = colour.r;
    bodyColor[o + 1] = colour.g;
    bodyColor[o + 2] = colour.b;
    vertexCursor++;
  }

  /** An anchor's ground point, lifted `height` along the cell's up and moved `e`, `n` across it. */
  function anchorPoint(cell: Cell, index: number, e: number, n: number, height: number, out: THREE.Vector3): THREE.Vector3 {
    const o = (index % cell.anchorCount) * 4;
    const r = cell.anchors[o + 3]!;
    return out
      .set(cell.anchors[o]! * r, cell.anchors[o + 1]! * r, cell.anchors[o + 2]! * r)
      .addScaledVector(cell.east, e)
      .addScaledVector(cell.north, n)
      .addScaledVector(cell.up, height);
  }

  /* --- the creatures ----------------------------------------------------- */

  function fireflies(cell: Cell, strength: number): void {
    const night = nightAt(cell.up);
    const gate = strength * night * cell.fade;
    if (gate < 0.01) return;
    for (let i = 0; i < cell.fireflies; i++) {
      const s = hash3(cell.row, cell.column, K_FIREFLY + i);
      const t = clock;
      const a = s * 97.3;
      const e = 2.2 * Math.sin(t * (0.21 + s * 0.2) + a) + 0.8 * Math.sin(t * 0.63 + a * 1.7);
      const n = 2.2 * Math.cos(t * (0.17 + s * 0.23) + a * 1.3) + 0.8 * Math.sin(t * 0.71 + a * 0.3);
      const h = 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * (0.3 + s * 0.25) + a * 2.1));
      anchorPoint(cell, i, e, n, h, point);
      // A flash, a pause, sometimes a double: a quarter of each cycle lit.
      const period = 2.4 + s * 2.6;
      const phase = fract(t / period + s * 7.1);
      const flash = phase < 0.24 ? Math.sin((phase / 0.24) * Math.PI) : 0;
      const echo = s > 0.6 && phase > 0.3 && phase < 0.42 ? 0.6 * Math.sin(((phase - 0.3) / 0.12) * Math.PI) : 0;
      const glow = (0.08 + 0.92 * Math.max(flash, echo)) * gate;
      if (glow > 0.004 && stats.fireflies < MAX_FIREFLIES) {
        light(point, glow, FIREFLY_SIZE, 0);
        stats.fireflies++;
      }
    }
  }

  function motes(cell: Cell, strength: number): void {
    const gate = strength * cell.fade;
    if (gate < 0.01) return;
    for (let i = 0; i < cell.motes && stats.motes < MAX_MOTES; i++) {
      const s = hash3(cell.row, cell.column, K_MOTE + i);
      const a = s * 61.7;
      const e = 3 * Math.sin(clock * 0.07 + a) + 0.4 * Math.sin(clock * 0.9 + a);
      const n = 3 * Math.cos(clock * 0.06 + a * 1.9) + 0.4 * Math.cos(clock * 0.8 + a);
      const h = 1.2 + 1.8 * fract(s * 13.1) + 0.5 * Math.sin(clock * 0.25 + a);
      anchorPoint(cell, i + 3, e, n, h, point);
      light(point, 0.55 * gate, MOTE_SIZE, 1);
      stats.motes++;
    }
  }

  /** Where a butterfly is at `t`: loops round its anchor, a quick wobble in them, and a bob. */
  function flutter(cell: Cell, i: number, a: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 3.2 * Math.sin(t * 0.43 + a) + 1.1 * Math.sin(t * 1.7 + a * 2.3);
    const n = 3.2 * Math.cos(t * 0.37 + a * 1.4) + 1.1 * Math.cos(t * 1.9 + a * 0.7);
    const h = 0.7 + 0.9 * Math.abs(Math.sin(t * 0.9 + a)) + 0.25 * Math.sin(t * 5.3 + a);
    return anchorPoint(cell, i + 1, e, n, h, out);
  }

  function butterflies(cell: Cell, strength: number): void {
    const gate = strength * cell.fade;
    if (gate < 0.05) return;
    for (let i = 0; i < cell.butterflies && stats.butterflies < MAX_BUTTERFLIES; i++) {
      const s = hash3(cell.row, cell.column, K_BUTTERFLY + i);
      const a = s * 83.9;
      flutter(cell, i, a, clock, point);
      flutter(cell, i, a, clock + 0.08, other);
      forward.subVectors(other, point);
      forward.addScaledVector(cell.up, -forward.dot(cell.up));
      if (forward.lengthSq() < 1e-8) forward.copy(cell.north);
      forward.normalize();
      right.crossVectors(cell.up, forward).normalize();
      // The wings beat fast and a little unevenly, and shut to a glide now and then.
      const beat = 0.15 + 1.15 * (0.5 + 0.5 * Math.sin(clock * (15 + s * 6) + a));
      const scale = gate < 1 ? 0.3 + 0.7 * gate : 1;
      const span = WING * scale;
      const body = WING_BODY * scale;
      const colour = colourOf(WINGS[Math.floor(s * WINGS.length) % WINGS.length]!);
      for (let side = -1; side <= 1; side += 2) {
        lift.copy(right).multiplyScalar(side * Math.cos(beat) * span).addScaledVector(cell.up, Math.sin(beat) * span);
        tipA.copy(point).add(lift).addScaledVector(forward, body * 1.2);
        tipB.copy(point).add(lift).addScaledVector(forward, -body * 1.1);
        axisA.copy(point).addScaledVector(forward, body);
        axisB.copy(point).addScaledVector(forward, -body);
        triangle(axisA, tipA, tipB, colour);
        triangle(axisA, tipB, axisB, colour);
      }
      stats.butterflies++;
    }
  }

  function leaves(cell: Cell, autumn: number, now: number): void {
    if (cell.leaves === 0 || autumn < 0.02) return;
    // Which anchors stand under a tree is asked of the drawn woods, which may
    // not be standing yet when the cell is worked out: a cell that found none
    // asks again every few seconds while it is in range.
    if (cell.trees === 0 && options.treeNear !== undefined && now - cell.treesAskedAt > 3 && treeProbes >= cell.anchorCount) {
      cell.treesAskedAt = now;
      treeProbes -= cell.anchorCount;
      for (let i = 0; i < cell.anchorCount; i++) {
        anchorPoint(cell, i, 0, 0, 0.5, point);
        if (options.treeNear(point)) cell.trees |= 1 << i;
      }
    }
    if (cell.trees === 0) return;
    const windTo = (weatherNow.wind.from + 180) * DEG;
    const windSpeed = Math.min(weatherNow.wind.speed, 14) * 0.12;
    drift.copy(cell.east).multiplyScalar(Math.sin(windTo) * windSpeed).addScaledVector(cell.north, Math.cos(windTo) * windSpeed);
    for (let anchor = 0; anchor < cell.anchorCount; anchor++) {
      if ((cell.trees & (1 << anchor)) === 0) continue;
      for (let j = 0; j < cell.leaves && stats.leaves < MAX_LEAVES; j++) {
        const s = hash3(cell.row, cell.column, K_LEAF + anchor * 4 + j);
        // Not every leaf is in the air at once: the thinner the autumn, the
        // longer each one waits on the branch between falls.
        const fall = 7 + s * 4;
        const period = fall / Math.max(0.25, autumn);
        const phase = fract(clock / period + s * 5.3);
        const u = (phase * period) / fall;
        if (u >= 1) continue;
        const a = s * 71.3;
        const top = 5 + s * 4;
        const h = top * (1 - u);
        const sway = 0.9 * Math.sin(clock * (1.4 + s) + a);
        const around = 1.5 + 1.5 * fract(s * 17.9);
        anchorPoint(cell, anchor, Math.cos(a) * around + sway, Math.sin(a) * around, h, point);
        point.addScaledVector(drift, u * fall);
        const size = LEAF_SIZE * cell.fade * smooth(u / 0.08) * (1 - smooth((u - 0.94) / 0.06));
        if (size < 0.01) continue;
        const spin = clock * (2 + s * 2) + a;
        const tilt = 0.9 * Math.sin(clock * (1.4 + s) + a + 1.2);
        axisA.copy(cell.east).multiplyScalar(Math.cos(spin)).addScaledVector(cell.north, Math.sin(spin));
        axisB.copy(cell.north).multiplyScalar(Math.cos(spin)).addScaledVector(cell.east, -Math.sin(spin))
          .multiplyScalar(Math.cos(tilt)).addScaledVector(cell.up, Math.sin(tilt));
        const colour = colourOf(LEAVES[Math.floor(fract(s * 3.7) * LEAVES.length) % LEAVES.length]!);
        tipA.copy(point).addScaledVector(axisA, size);
        tipB.copy(point).addScaledVector(axisA, -size);
        lift.copy(point).addScaledVector(axisB, size * 0.62);
        other.copy(point).addScaledVector(axisB, -size * 0.62);
        triangle(tipA, lift, tipB, colour);
        triangle(tipA, tipB, other, colour);
        stats.leaves++;
      }
    }
  }

  function fish(cell: Cell, player: THREE.Vector3, afloat: boolean, calm: number): void {
    if (!cell.fish || calm < 0.05) return;
    if (!afloat && cell.shore > WATERSIDE) return;
    const slot = Math.floor(clock / FISH_SLOT);
    const s = hash3(cell.row, cell.column, K_FISH + (slot % 4096));
    if (s >= FISH_ODDS * calm) return;
    const start = slot * FISH_SLOT + (s / FISH_ODDS) * (FISH_SLOT - FISH_AIR);
    const u = (clock - start) / FISH_AIR;
    if (u < 0 || u > 1.02 || stats.fish >= MAX_FISH) return;
    const a = hash3(cell.row, cell.column, K_FISH + 4096 + (slot % 4096)) * Math.PI * 2;
    const heading = forward.copy(cell.east).multiplyScalar(Math.cos(a)).addScaledVector(cell.north, Math.sin(a));
    const k = u < 0 ? 0 : u > 1 ? 1 : u;
    anchorPoint(cell, slot, (k - 0.5) * FISH_TRAVEL * Math.cos(a), (k - 0.5) * FISH_TRAVEL * Math.sin(a), 4 * k * (1 - k) * FISH_HEIGHT, point);
    const near = point.distanceTo(player) < RANGE;
    if (options.splash !== undefined && near) {
      if (u < 0.25 && cell.fishIn !== slot) {
        cell.fishIn = slot;
        options.splash(point, 0.9);
      } else if (u > 0.95 && cell.fishOut !== slot) {
        cell.fishOut = slot;
        options.splash(point, 0.7);
      }
    }
    if (u > 0.98) return;
    // Along its own flight: nose up out of the water, nose down into it.
    axisA.copy(heading).multiplyScalar(FISH_TRAVEL).addScaledVector(cell.up, 4 * FISH_HEIGHT * (1 - 2 * k)).normalize();
    right.crossVectors(cell.up, heading).normalize();
    axisB.crossVectors(right, axisA).normalize();
    const body = colourOf(PALETTE.bone);
    const back = colourOf(PALETTE.slate);
    tipA.copy(point).addScaledVector(axisA, FISH_HALF);
    tipB.copy(point).addScaledVector(axisA, -FISH_HALF * 0.8);
    lift.copy(point).addScaledVector(axisB, FISH_HALF * 0.3);
    other.copy(point).addScaledVector(axisB, -FISH_HALF * 0.26);
    triangle(tipA, lift, tipB, back);
    triangle(tipA, tipB, other, body);
    // The tail, flicking.
    const flick = Math.sin(clock * 30) * 0.5;
    lift.copy(tipB).addScaledVector(axisA, -FISH_HALF * 0.45).addScaledVector(axisB, FISH_HALF * 0.3).addScaledVector(right, flick * 0.1);
    other.copy(tipB).addScaledVector(axisA, -FISH_HALF * 0.45).addScaledVector(axisB, -FISH_HALF * 0.3).addScaledVector(right, flick * 0.1);
    triangle(tipB, lift, other, back);
    stats.fish++;
  }

  // The gulls' own scratch: a matrix a gull and one a wing.
  const gullMatrix = new THREE.Matrix4();
  const wingLeft = new THREE.Matrix4();
  const wingRight = new THREE.Matrix4();
  const gullNormal = new THREE.Matrix3();
  const leftNormal = new THREE.Matrix3();
  const rightNormal = new THREE.Matrix3();
  const bank = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const gullColour = new THREE.Color();

  function gulls(cell: GullCell, strength: number): void {
    const gate = strength * cell.fade;
    if (gate < 0.05) return;
    for (let i = 0; i < cell.count && stats.gulls < MAX_GULLS; i++) {
      const s = hash3(cell.row, cell.column, K_GULL + 8 + i);
      const lead = s * Math.PI * 2;
      const radius = 14 + 18 * fract(s * 11.3);
      const rate = (fract(s * 5.9) > 0.5 ? 1 : -1) * (0.18 + 0.1 * fract(s * 3.1));
      // The ring wanders over the cell, so a gull is not nailed to one point of sky.
      const ce = 20 * Math.sin(clock * 0.03 + lead);
      const cn = 20 * Math.cos(clock * 0.025 + lead * 1.3);
      const angle = lead + clock * rate;
      const c = Math.cos(angle);
      const si = Math.sin(angle);
      point.copy(cell.up).multiplyScalar(PLANET_RADIUS)
        .addScaledVector(cell.east, ce + c * radius)
        .addScaledVector(cell.north, cn + si * radius);
      const here = other.copy(point).normalize();
      point.copy(here).multiplyScalar(cell.altitude + 3 * Math.sin(clock * 0.4 + lead));
      forward.copy(cell.east).multiplyScalar(-si * rate).addScaledVector(cell.north, c * rate);
      forward.addScaledVector(here, -forward.dot(here)).normalize();
      right.crossVectors(here, forward).normalize();
      basis.makeBasis(right, here, forward);
      spin.setFromRotationMatrix(basis);
      bank.makeRotationZ(rate > 0 ? 0.3 : -0.3);
      gullMatrix.compose(point, spin, unit).multiply(bank);
      gullNormal.getNormalMatrix(gullMatrix);
      // Flap and glide: a few beats, then the wings held.
      const beat = Math.sin(clock * 6.5 + lead) * 0.55 * smooth(Math.sin(clock * 0.5 + lead * 2) * 2);
      wingLeft.makeRotationZ(beat + 0.08).premultiply(gullMatrix);
      wingRight.makeRotationZ(-beat - 0.08).premultiply(gullMatrix);
      leftNormal.getNormalMatrix(wingLeft);
      rightNormal.getNormalMatrix(wingRight);
      const shrink = gate < 1 ? gate : 1;
      if (vertexCursor + gullVertices > MAX_VERTICES) return;
      for (let v = 0; v < gullVertices; v++) {
        const bone = gull.bone[v]!;
        const matrix = bone === 0 ? gullMatrix : bone === 1 ? wingLeft : wingRight;
        const normals = bone === 0 ? gullNormal : bone === 1 ? leftNormal : rightNormal;
        eye.set(gull.position[v * 3]! * shrink, gull.position[v * 3 + 1]! * shrink, gull.position[v * 3 + 2]! * shrink).applyMatrix4(matrix);
        const o = vertexCursor * 3;
        bodyPosition[o] = eye.x;
        bodyPosition[o + 1] = eye.y;
        bodyPosition[o + 2] = eye.z;
        eye.set(gull.normal[v * 3]!, gull.normal[v * 3 + 1]!, gull.normal[v * 3 + 2]!).applyMatrix3(normals).normalize();
        bodyNormal[o] = eye.x;
        bodyNormal[o + 1] = eye.y;
        bodyNormal[o + 2] = eye.z;
        gullColour.setRGB(gull.color[v * 3]!, gull.color[v * 3 + 1]!, gull.color[v * 3 + 2]!);
        bodyColor[o] = gullColour.r;
        bodyColor[o + 1] = gullColour.g;
        bodyColor[o + 2] = gullColour.b;
        vertexCursor++;
      }
      stats.gulls++;
    }
  }

  /* --- the frame ---------------------------------------------------------- */

  function hide(): void {
    lights.visible = false;
    bodies.visible = false;
    lightGeometry.setDrawRange(0, 0);
    bodyGeometry.setDrawRange(0, 0);
    stats.fireflies = stats.motes = stats.butterflies = stats.leaves = stats.fish = stats.gulls = 0;
    stats.calls = 0;
  }

  function update(dt: number, frame: AmbientFrame, weather: () => AmbientWeather): void {
    const began = performance.now();
    clock += dt;
    if (!enabled) return;
    const { player, cameraHeight } = frame;
    if (cameraHeight > GULL_HIGH) {
      hide();
      stats.updateMs = performance.now() - began;
      return;
    }

    weatherAge += dt;
    if (weatherAge >= WEATHER_EVERY) {
      weatherAge = 0;
      const here = weather();
      weatherNow.precipitation = here.precipitation;
      weatherNow.snow = here.snow;
      weatherNow.storm = here.storm;
      weatherNow.fog = here.fog;
      weatherNow.temperatureC = here.temperatureC;
      weatherNow.lying = here.lying;
      weatherNow.wind.speed = here.wind.speed;
      weatherNow.wind.from = here.wind.from;
    }

    // The scan: on a move or a clock, or while cells are still owed.
    sinceScan += dt;
    if (pending || sinceScan > RESCAN_EVERY || lastScan.distanceToSquared(player) > RESCAN_MOVE * RESCAN_MOVE) {
      pending = false;
      sinceScan = 0;
      lastScan.copy(player);
      if (cameraHeight >= HIGH) active.length = 0;
      scan(player, cameraHeight < HIGH, admitPerFrame);
      forget();
    }
    stats.cells = active.length;
    stats.gullCells = activeGulls.length;

    // What the weather and the hour allow, for everything at once.
    const w = weatherNow;
    const wet = clamp01(w.precipitation * 2.5);
    const cold = clamp01((w.temperatureC - 8) / 6);
    const windy = clamp01((w.wind.speed - 9) / 6);
    const snowing = w.snow > 0.3 && w.precipitation > 0.05 ? 1 : 0;
    const insects = (1 - wet) * (1 - w.storm) * cold * (1 - windy) * (1 - snowing) * (1 - clamp01(w.lying * 2));
    stats.quiet = insects > 0.5 ? '' : snowing ? 'snow' : wet > 0.5 ? 'rain' : cold < 0.5 ? 'cold' : windy > 0.5 ? 'wind' : 'storm';
    const high = 1 - smooth((cameraHeight - HIGH_FADE) / (HIGH - HIGH_FADE));
    const day = smooth((frame.daylight - 0.35) / 0.4);
    const fireflyStrength = insects * high * clamp01((w.temperatureC - 12) / 4);
    const butterflyStrength = insects * high * day * clamp01((w.temperatureC - 13) / 4);
    const moteStrength = insects * high * smooth((frame.daylight - 0.6) / 0.3) * (1 - clamp01(w.fog * 2));
    const gullStrength = (1 - smooth((w.storm - 0.3) / 0.4)) * (1 - smooth((w.precipitation - 0.5) / 0.4)) *
      smooth((frame.daylight - 0.15) / 0.3) * (1 - smooth((cameraHeight - 400) / (GULL_HIGH - 400)));
    const calm = high * (1 - w.storm) * (1 - smooth((w.wind.speed - 10) / 8));
    const timeMs = frame.time.getTime();
    const up = playerUp.copy(player).normalize();
    const autumn = w.lying > 0.5 ? 0 : autumnAt(timeMs, latOf(up.y)) * high;
    stats.autumn = Number(autumn.toFixed(2));

    stats.fireflies = stats.motes = stats.butterflies = stats.leaves = stats.fish = stats.gulls = 0;
    lightCursor = 0;
    vertexCursor = 0;
    treeProbes = TREE_PROBES;
    const now = clock;
    for (const cell of active) {
      const distance = cell.up.distanceTo(up) * PLANET_RADIUS;
      cell.fade = smooth((RANGE - distance) / (RANGE - FADE_FROM)) * smooth((now - cell.born) / FADE_IN);
      if (cell.fade <= 0) continue;
      if (cell.fireflies > 0 && fireflyStrength > 0.01) fireflies(cell, fireflyStrength);
      if (cell.motes > 0 && moteStrength > 0.01) motes(cell, moteStrength);
      if (cell.butterflies > 0 && butterflyStrength > 0.01) butterflies(cell, butterflyStrength);
      if (cell.leaves > 0 && autumn > 0.02) leaves(cell, autumn, now);
      if (cell.fish) fish(cell, player, frame.afloat, calm);
    }
    if (gullStrength > 0.01) {
      for (const cell of activeGulls) {
        const distance = cell.up.distanceTo(up) * PLANET_RADIUS;
        cell.fade = smooth((GULL_RANGE - distance) / (GULL_RANGE * 0.3)) * smooth((now - cell.born) / FADE_IN);
        gulls(cell, gullStrength);
      }
    }

    lightGeometry.setDrawRange(0, lightCursor);
    bodyGeometry.setDrawRange(0, vertexCursor);
    lights.visible = lightCursor > 0;
    bodies.visible = vertexCursor > 0;
    if (lightCursor > 0) {
      for (const attribute of lightAttributes) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, lightCursor * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      lightMat.uniforms.screenScale!.value = (typeof innerHeight === 'number' ? innerHeight : 900) * 0.5;
    }
    if (vertexCursor > 0) {
      for (const attribute of bodyAttributes) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, vertexCursor * 3);
        attribute.needsUpdate = true;
      }
    }
    stats.calls = (lights.visible ? 1 : 0) + (bodies.visible ? 1 : 0);
    stats.updateMs = performance.now() - began;
  }

  return {
    group,
    get enabled() {
      return enabled;
    },
    set enabled(on: boolean) {
      enabled = on;
      stats.enabled = on;
      if (!on) hide();
    },
    stats,
    update,
    snapshot() {
      const out: string[] = [];
      const fixed = (x: number): string => x.toFixed(3);
      for (let i = 0; i < lightCursor; i++) {
        out.push(`${lightKind[i] === 0 ? 'firefly' : 'mote'} ${fixed(lightPosition[i * 3]!)} ${fixed(lightPosition[i * 3 + 1]!)} ${fixed(lightPosition[i * 3 + 2]!)} ${lightGlow[i]!.toFixed(3)}`);
      }
      for (let v = 0; v < vertexCursor; v++) {
        out.push(`body ${fixed(bodyPosition[v * 3]!)} ${fixed(bodyPosition[v * 3 + 1]!)} ${fixed(bodyPosition[v * 3 + 2]!)}`);
      }
      return out.sort();
    },
    proxies() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      geometry.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(1), 1));
      geometry.setAttribute('spot', new THREE.BufferAttribute(new Float32Array(1), 1));
      geometry.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(1), 1));
      return [new THREE.Points(geometry, lightMat), proxyOf(bodyMat)];
    },
  };
}
