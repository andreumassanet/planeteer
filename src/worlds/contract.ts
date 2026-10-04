/**
 * The other worlds, walked: what a planet declares so that the engine in this
 * directory can put a person on it.
 *
 * `src/system/` says what a body **is** — its orbit, its radius, its gravity,
 * its nations, its towns and its people — and draws it in the orrery. This
 * directory says what it is **like to stand on**: how rough the ground is under
 * a foot, how many craters and how big, what colour the sky is at noon, what
 * the buildings look like, what the people say and in what script. Everything
 * here is a pure function of the body's id and the records below, so two
 * visitors on the same world see the same crater in the same place and the
 * same alien says the same thing to both.
 *
 * **Nothing in Earth's first load imports this directory.** `main.ts` reaches it
 * through one `import('./worlds/index.ts')`, fired when a body other than Earth
 * is chosen (the menu's *Explore*, or `?world=<id>`), and `scripts/check-worlds.ts`
 * walks the static graph of `main.ts` to hold that.
 *
 * ---
 *
 * # To add a planet (or flesh out one of the bare ones)
 *
 * One world is **two files of its own and nothing shared**:
 *
 * 1. **`src/system/bodies/<id>.ts`** — the `Body`: the true numbers, the `look`
 *    colours, a `GroundModel` (`makeGround` in `system/ground.ts` builds one
 *    from a table), its `nations` (caps), its `settlements` and its `SPECIES`
 *    (a `Morph` each). This is the file the orrery and the menu already read,
 *    and `node scripts/check-system.ts` validates it. A giant's `ground` may
 *    stay `null`: the cloud deck below needs none.
 * 2. **`src/worlds/bodies/<id>.ts`** — exports `WORLD: WorldSpec`, built with
 *    `defineWorld(BODY, { ... })` so every field left out takes the default.
 *    `src/worlds/bodies/mars.ts` is the reference and fills every field; the
 *    others start bare and walkable.
 *
 * The registry (`registry.ts`) already lists every body by id, so neither file
 * needs registering. What a spec fills, field by field, is documented on
 * `WorldSpec` below; the helpers a planet file may use are:
 *
 * - `defineWorld` and `defineCivilisation` (a species and only what differs:
 *   its script, voice, phrases, architecture, crowd), and the defaults they
 *   fill from — `DEFAULT_PHRASES`, `DEFAULT_SCRIPT`, `DEFAULT_VOICE`,
 *   `DEFAULT_ARCHITECTURE` (this file);
 * - `dome` and `ball` from `architecture.ts`, the two round primitives the
 *   scenery context does not have;
 * - the noise in `src/system/noise.ts` (`fbm`, `ridged`, `onSphere`,
 *   `alignment`, `smoothstep`, `clamp`) for a `Feature`;
 * - `PALETTE` from `src/theme.ts` — **the only colours**: every colour a spec
 *   names must be a palette entry, which `check-worlds.ts` asserts;
 * - `Decoration`s from `src/system/parts/` (import the ones the biomes name);
 * - a custom building as a `BuildingBuilder` in `architecture.extra`, built
 *   from `SceneryContext`'s primitives (`box`, `column`, `taper`, `ringWall`,
 *   `strut`, `roof`; **`box` and every prism stand on `y = 0`**); a part
 *   wrapped in `ctx.lit` glows after dark, as does any colour in
 *   `architecture.glow`;
 * - the space kit (`public/models/space/`, ids in its `manifest.json`): the
 *   people as its creatures (`Civilisation.cast`), the towns as its colony
 *   (`ArchitectureStyle.colony`), a craft as one of its models
 *   (`VehicleSpec.kit`), and its props and plants on the open ground
 *   (`WorldSpec.scatter`); `node scripts/check-aliens.ts <id>` builds them
 *   from the kit on disk;
 * - a craft of the planet's own as a `VehicleSpec` in `vehicles`, or one of
 *   `craft.ts`'s (`SUNSHADE_ROVER`, `CRAWLER`, `VENUS_AEROSTAT`);
 * - `palette.tint` to paint a place over the bands or biomes (a storm, a
 *   hood, a spot), `palette.churn` for how a deck's paint moves, and `wind`
 *   for what leans, turns and drifts.
 *
 * Then: `node scripts/check-worlds.ts <id>` (one world) or with no argument
 * (all of them), and `?world=<id>` in the browser — `&hour=10` for the local
 * hour at the spawn, `&at=lat,lon` to stand somewhere else.
 *
 * # The scale
 *
 * The person is the same person on every world, so a world unit is Earth's
 * 0.398 km everywhere and a body's walkable radius is `surfaceRadiusOf` of its
 * real one: Mars 8,514 units, Jupiter's 1-bar level 175,600. Every length below
 * is in **world units** unless it says otherwise; a person is `AVATAR_HEIGHT`,
 * 3.77. The ground mesh is drawn in tiles whose vertices are stored relative to
 * the tile's own centre, so a vertex at Jupiter's radius is as exact as one on
 * Mercury: the camera-relative difference is taken in the double-precision
 * matrices, never in a float32 position.
 */

import type { Body, Decoration, Species } from '../system/contract.ts';
import type { Group, SceneryContext } from '../scenery/contract.ts';
import type { Rng } from '../scenery/random.ts';
import { PALETTE } from '../theme.ts';
import type { Color, Object3D, Vector3 } from 'three';
import type { SeatedPose } from '../cast.ts';

// ---------------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------------

/**
 * What the ground is, as far as the engine's drawing and walking go.
 *
 * - `rock` — a solid crust: craters, the body's relief, rovers.
 * - `ice` — a solid crust that is white and smooth: the same as `rock` with a
 *   glassier palette and fewer craters; the difference is the spec's numbers.
 * - `cloud-deck` — no surface at all (the four giants): the walkable thing is
 *   the cloud top at the 1-bar radius, soft, banded and slowly churning in the
 *   shader, and a settlement is a platform floating on it.
 */
export type GroundMode = 'rock' | 'ice' | 'cloud-deck';

/**
 * One size class of crater, laid on a lattice.
 *
 * Each face of the cube-sphere is cut into cells about `cell` units on a side
 * (never less); each cell holds a crater with probability `chance`, its
 * centre jittered inside the cell, its radius drawn from `radius`. A crater
 * must fit its neighbours' search, so **`radius[1]` may not exceed
 * `cell * 0.45`** — the ejecta reach twice the radius and the search is one
 * cell either way. `check-worlds.ts` asserts it.
 */
export interface CraterClass {
  /** Lattice spacing, units: the smallest a cell is. */
  cell: number;
  /** 0 to 1: how many cells hold a crater. */
  chance: number;
  /** Rim radius, units, [min, max]. */
  radius: readonly [number, number];
  /** Bowl depth as a fraction of the diameter. Fresh simple craters are about 0.2. */
  depth: number;
  /** Rim height as a fraction of the diameter. About 0.04. */
  rim: number;
  /** Above this radius a crater has a flat floor and a central peak. */
  complexAbove?: number;
}

export interface CraterRecipe {
  /** Part of every crater's seed, so two worlds with one recipe differ. */
  seed: string;
  classes: readonly CraterClass[];
  /**
   * 0 to 1, how much of the cratering a place keeps: Mars's young northern
   * plains are smoother than its ancient south. Omitted is 1 everywhere.
   */
  density?(lat: number, lon: number): number;
}

/** One octave band of walking-scale relief. */
export interface DetailRecipe {
  /** Peak to centre, units. */
  amplitude: number;
  /** Units between bumps. */
  wavelength: number;
  /** 1 to 6. */
  octaves?: number;
  /** 0 is soft `fbm`, 1 is creased `ridged`; between is a mix. */
  ridged?: number;
}

/**
 * A special landform, as a function: units of height to add at a point.
 *
 * `dir` is the unit vector (this project's frame, `sphere.ts`), `lat`/`lon` in
 * degrees. **Pure and cheap**: it runs once per ground vertex, about a
 * thousand times per tile. Prefer an early `return 0` from a dot product over
 * anything trigonometric.
 */
export type Feature = (dir: { readonly x: number; readonly y: number; readonly z: number }, lat: number, lon: number) => number;

export interface ReliefRecipe {
  /**
   * The body's own `GroundModel.relief` times this. 1 by default; a giant's
   * cloud-top relief is in the thousands of units and wants a small share.
   */
  planetScale: number;
  /** Walking-scale bumps, summed. */
  detail: readonly DetailRecipe[];
  craters: CraterRecipe | null;
  features: readonly Feature[];
  /**
   * How far round a settlement the ground is levelled, as a multiple of its
   * built radius. The town stands on its own pad, the way Earth's do.
   */
  padReach: number;
  /**
   * The steepest the ground may fall from a pad's edge back to the land, as
   * rise over run. A pad on a slope then reaches further — far enough that the
   * land meets it at this grade rather than as a cliff — up to four times its
   * built radius and never into a neighbour's. Omitted, every pad reaches
   * `padReach` whatever stands round it.
   */
  padGrade?: number;
}

/** A colour laid over the ground at a place, and how much of it. */
export interface Tint {
  /** A `PALETTE` entry, or `ctx.tone` of one. */
  color: number;
  /** 0 to 1. */
  weight: number;
}

/**
 * Paint at a point, over whatever the bands or the biome said: the Great Red
 * Spot red, Neptune's Dark Spot dark, a polar hood. `dir` is the unit vector,
 * `lat`/`lon` degrees, `height` the ground's over the radius. Pure and cheap,
 * like a `Feature`: it runs once a ground vertex. Null (or a weight of 0)
 * leaves the colour alone.
 */
export type GroundTint = (dir: { readonly x: number; readonly y: number; readonly z: number }, lat: number, lon: number, height: number) => Tint | null;

/**
 * How a cloud deck's paint moves. Two motions, both in the shader and neither
 * moving a vertex: the **boil**, light and shade swelling in place along each
 * vertex's own phase, and the **drift**, a wave train running along the
 * parallels at the deck's wind speed (westward is negative).
 */
export interface Churn {
  /** How fast the boil turns over; 0.35 is a slow simmer. */
  boil: number;
  /** Units a second along the parallel, + east. 0 holds the drift still. */
  speed: number;
  /** Units from one crest of the drift to the next. */
  wavelength: number;
  /** 0 to about 0.2: how much light and shade the drift carries. */
  strength: number;
}

/** How the ground is coloured, over what the body's biomes say. */
export interface GroundPalette {
  /** Biome id -> `PALETTE` entry, replacing the body's own colour for it. */
  biomes: Readonly<Record<string, number>>;
  /** Where the body has no `GroundModel`: the ground's colour. */
  base: number;
  /** Ground steeper than about 30 degrees takes this. */
  steep: number;
  /** A crater's floor is darkened by this factor (0.5 to 1.5). */
  craterFloor: number;
  /** Its fresh ejecta are lightened by this factor. */
  ejecta: number;
  /** Cloud decks: the bands from equator to pole, repeated. Rock ignores them. */
  bands: readonly number[];
  /**
   * Cloud decks: degrees of latitude the whole `bands` list spans before it
   * repeats. 37.5 by default; 90 lays the list once from the equator to the pole.
   */
  bandSpan: number;
  /** How strongly the bands vary along a parallel, 0 to 1. */
  turbulence: number;
  /**
   * Cloud decks: how much of a biome's colour shows over the bands, where the
   * body has a ground model and `biomes` names a colour for that biome. 0 to 1.
   */
  biomeBlend: number;
  /** Paint at a place, over the bands or the biomes; see `GroundTint`. */
  tint: GroundTint | null;
  /** Cloud decks: how the paint moves. */
  churn: Churn;
  /**
   * How much of the palette's saturation the ground keeps: 1 is the colour as
   * named, 0 is its grey. The Moon is grey, and no palette entry is.
   */
  chroma: number;
  /** Multiplies the ground's colour: under 1 darker, over 1 lighter. */
  value: number;
}

// ---------------------------------------------------------------------------
// The sky
// ---------------------------------------------------------------------------

export interface SkySpec {
  /** At the horizon by day. Defaults to `body.look.sky`. */
  horizon: number;
  /** Overhead by day. */
  zenith: number;
  /**
   * 0 to 1: how much air. 0 is the Moon and Mercury — a black sky in full
   * sun, stars at noon, no haze at all; 1 is Venus. It sets the haze's reach,
   * how blue-black the day sky goes and how far the stars fade by day.
   */
  air: number;
  /** The colour of the light, as a `PALETTE` entry; white by default. */
  light: number;
  /**
   * Multiplies the sunlight after the inverse-square law has been softened to
   * something a screen can show. 1 by default.
   */
  exposure: number;
  /**
   * A sky you cannot see out of (Venus): no Sun's disc and no halo, no
   * stars, planets or moons; the dome brightest at the horizon and the light
   * diffuse, from overhead and from everywhere, following the hidden Sun's
   * height for day and night. False by default.
   */
  overcast: boolean;
  /** The moons drawn in this sky, each where its orbit has it and lit by the Sun. None by default. */
  moons: readonly SkyMoon[];
  /**
   * What this world draws in its own sky and nobody else's: rings, an aurora.
   * Each is made once with the walkable radius and updated every frame; see
   * `SkyLayer`. None by default.
   */
  layers: readonly SkyLayerFactory[];
}

/**
 * A moon in the sky, as the planet file declares it: the true numbers, from
 * which the engine works out where it stands, how big it is from where the
 * traveller stands — a moon overhead is nearer by a planet's radius than one
 * on the horizon — and how much of it is lit.
 *
 * Its orbit is a circle in the planet's equatorial frame (the pole is
 * `Body.pole`), tipped by `inclination` about the line of `node`, and it
 * runs at its sidereal `period` from `epoch`, in the sense the planet turns
 * unless `retrograde`. The angles are measured in the planet's equator from
 * its own equinox — where the Sun crosses that equator going north — which
 * is the frame the published mean longitudes are close to; for a moon whose
 * place matters to nobody but the picture, any `epoch` will do and the same
 * one is the same sky for every visitor.
 */
export interface SkyMoon {
  name: string;
  /** Mean radius, km. */
  radiusKm: number;
  /** Semi-major axis, km from the planet's centre. */
  distanceKm: number;
  /** Sidereal period, days. */
  period: number;
  /** To the planet's equator, degrees, 0 to 90. */
  inclination: number;
  /** The ascending node's longitude in the equator, degrees. 0 if left out. */
  node?: number;
  /** Degrees along the orbit at J2000.0 (2000-01-01 12:00 TT), from the equinox. */
  epoch: number;
  /** Orbits against the planet's turn (Triton). */
  retrograde?: boolean;
  /** A `PALETTE` entry: the lit face. */
  color: number;
}

/** What a sky layer is told each frame. Every vector is in the world's body-fixed frame. */
export interface SkyLayerInput {
  /** The traveller, world units from the planet's centre. */
  observer: Vector3;
  /** Unit vector toward the Sun. */
  sun: Vector3;
  /** 0 night to 1 day, at the observer. */
  day: number;
  /** Seconds since the sky was made, for whatever drifts. */
  time: number;
  /** The haze colour, linear, if the sky has one. */
  haze?: Color;
  /** The sunlight's strength the sky is using, about 1 on a sunlit world. */
  light?: number;
  /** The instant the sky is drawn for (a locked world's clock moves it). */
  date?: Date;
  /**
   * Radians the body has turned since its equinox faced the prime meridian:
   * a direction fixed in the equatorial frame at longitude `a` (radians, from
   * the equinox) is at body-fixed longitude `a - turn`.
   */
  turn?: number;
}

/**
 * Something one world draws in its own sky: a mesh for the sky's group, which
 * is centred on the eye, unrotated (the body-fixed frame, the pole at +y) and
 * scaled to the far plane, so the mesh is a unit sphere's worth; and, each
 * frame, the fraction of direct sunlight it lets through to the traveller,
 * which the sky multiplies into the Sun's light.
 */
export interface SkyLayer {
  readonly object: Object3D;
  update(input: SkyLayerInput): number;
  dispose(): void;
}

/** A layer from the walkable radius, in world units. */
export type SkyLayerFactory = (radius: number) => SkyLayer;

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

/**
 * How a species writes. The script is generated, glyph by glyph, from `seed`
 * and these weights (`glyphs.ts`): loops, hooks, bars, dots and zigzags, slanted
 * and hung from a line or not. Two species with different seeds never share a
 * glyph set, which `check-worlds.ts` asserts.
 */
export interface ScriptStyle {
  seed: string;
  /** How many glyphs the script has, 12 to 36. */
  glyphs: number;
  /** Strokes a glyph, [min, max]. */
  strokes: readonly [number, number];
  /** Relative weights of the stroke kinds. */
  loops: number;
  hooks: number;
  bars: number;
  dots: number;
  zigzags: number;
  /** Forward lean, radians; 0 upright. */
  slant: number;
  /** A line every glyph hangs from (`top`), stands on (`base`), or none. */
  line: 'top' | 'base' | 'none';
  /** How the glyphs are said aloud: the consonants and vowels of the babble. */
  consonants: string;
  vowels: string;
}

/** The ranges an individual's voice is drawn from (`voice.ts`'s `Voice`). */
export interface VoiceRange {
  /** Hz. */
  pitch: readonly [number, number];
  /** Syllables a second. */
  pace: readonly [number, number];
  /** Formant scale: under 1 a huge throat, over 1.4 a tiny one. */
  tract: readonly [number, number];
  /** How far the pitch wanders, as a fraction. */
  wander: number;
}

/**
 * What they say, in English: the line under the glyphs is the translation.
 *
 * `{place}`, `{nation}`, `{body}`, `{species}` and `{distance}` (to the nearest
 * other town) are filled in. A conversation is a greeting, then a line about
 * their world, then one about you, then a farewell, round again; which line of
 * each is a function of who is speaking.
 */
export interface Phrasebook {
  greet: readonly string[];
  world: readonly string[];
  visitor: readonly string[];
  farewell: readonly string[];
}

/** Which way a building's front faces: the town's middle, or into the wind. */
export type BuildingYaw = 'centre' | 'wind';

/** Which buildings an alien town is made of. Custom ones go in `extra`. */
export type BuildingForm = 'dome' | 'spire' | 'pod' | 'stack' | 'arch' | 'bulb' | 'ring';

/**
 * A building of the planet's own, for when the seven forms are not enough.
 * Returns the group standing on `y = 0` and its footprint radius, which is
 * the wall the player is pushed out of.
 */
export type BuildingBuilder = (ctx: SceneryContext, rng: Rng, style: ArchitectureStyle) => { group: Group; radius: number };

export interface ArchitectureStyle {
  /** The built-in forms and the custom ones by name, weighted. */
  forms: readonly { item: string; weight: number }[];
  /** What stands in the middle of every town. A form name. */
  landmark: string;
  walls: readonly number[];
  roofs: readonly number[];
  accents: readonly number[];
  /** The paving of the town's floor. */
  ground: number;
  /** Multiplies every building's height. */
  height: number;
  /** Buildings per 1,000 square units of town, before the streets are kept clear. */
  density: number;
  /** Radial avenues kept clear from the square to the edge, 3 to 8. */
  avenues: number;
  /** How wide an avenue is, kerb to kerb, units. 6 by default: two people pass and a rover fits. */
  avenueWidth?: number;
  /**
   * Which way the buildings face: `centre` (the default) toward the square,
   * `wind` into the world's wind (`WorldSpec.wind`), the way a boat lies at
   * anchor.
   */
  yaw?: BuildingYaw;
  /**
   * Colours that glow wherever a town is painted in them: a lamp's glass, a
   * window. A part wrapped in `ctx.lit` glows whatever its colour.
   */
  glow?: readonly number[];
  /** Custom forms, keyed by the name `forms` and `landmark` use. */
  extra: Readonly<Record<string, BuildingBuilder>>;
  /**
   * The town built from the space kit's buildings (`public/models/space/`)
   * instead of the forms above, which then stand in only where the kit is
   * not loaded. Omitted, the town is the forms.
   */
  colony?: ColonyStyle;
}

/**
 * A town made of the space kit's pieces: pressure modules, domes, hangars,
 * solar arrays and dishes, painted in the style's `walls`, `roofs` and
 * `accents` and merged into one buffer a town (`settlements.ts`).
 *
 * The modules stand in rows along the avenues with their doors to the street,
 * and then behind them as far as the town's triangle budget allows; a module
 * may carry a mast or a radar on its roof, keep a yard of panels and tanks
 * behind it, and be joined to its neighbour in the row by a tube.
 */
export interface ColonyStyle {
  /**
   * What a plot holds, weighted: a kit building by its manifest id, or a
   * form's name (the built-in seven, or one in `extra`) to keep a few of the
   * civilisation's own shapes among the modules.
   */
  modules: readonly { item: string; weight: number }[];
  /**
   * The centrepiece: a kit building by id, dressed as the town's hub (a
   * radar on its roof, dishes round it), or `null` to keep the style's
   * `landmark` form, built in code.
   */
  centre: string | null;
  /** Multiplies every module's size, the kit's and the forms among them: under 1 squat, over 1 grand. 1 by default. */
  scale?: number;
  /** 0 to 1: how many modules carry a mast, a radar or a hatch on the roof. */
  roofs: number;
  /** 0 to 1: how many keep a yard of panels, tanks and crates behind them. */
  yards: number;
  /** Whether neighbouring modules in a row are joined by a pressurised tube. */
  tubes: boolean;
  /** Kit plants by id set in the yards and round the square, or none. */
  gardens: readonly string[];
  /**
   * From this population up, a town keeps a landing pad with a ship on it
   * and a few crew from elsewhere standing about. `Infinity` for none.
   */
  spaceport: number;
}

/**
 * The people drawn as the space kit's creatures (`space-kit.ts`): which ones,
 * and who comes from elsewhere. Each walker is a creature of `creatures`
 * scaled to the species' height (`Morph.height`) and painted in the species'
 * own hides, trims and accents, so a town's people are recognisably that
 * world's whatever the pack coloured them.
 */
export interface CreatureCast {
  /** The kit's creature ids, weighted: one or two read as one people. */
  creatures: readonly { item: string; weight: number }[];
  /** Crew astronauts who trade at a spaceport, by id. None by default. */
  visitors?: readonly string[];
}

export interface Civilisation {
  species: Species;
  script: ScriptStyle;
  voice: VoiceRange;
  phrases: Phrasebook;
  architecture: ArchitectureStyle;
  /** People walking a town, per 10,000 of its population, before the cap. */
  crowd: number;
  /** How the people are drawn: the space kit's creatures. Without it nobody walks the towns. */
  cast?: CreatureCast;
}

// ---------------------------------------------------------------------------
// What moves and what is scattered
// ---------------------------------------------------------------------------

/**
 * A craft to take, by how it moves. `rover` drives the ground, `lander` flies
 * with the aircraft's keys — Space up, C down, Shift the afterburner, W and S
 * the throttle, A and D to turn — `ufo` is the saucer, which flies on the same
 * keys and laws but takes its speed at once and turns briskly (`ufo.ts`), and
 * `aerostat` is a balloon: it climbs and sinks slowly on the same keys, holds
 * its height when neither is held, and drifts with the world's wind when the
 * throttle is let go.
 */
export type VehicleKind = 'rover' | 'lander' | 'aerostat' | 'ufo';

/** How a craft answers its keys, units and seconds. */
export interface Handling {
  /** Top speed forward and back, units a second. */
  top: number;
  reverse: number;
  /** Units a second, each second. */
  accel: number;
  /** Radians a second at full lock. */
  turn: number;
  /** Climbing and sinking speed, units a second, for what flies. */
  climb: number;
  sink: number;
}

/** A craft's model: standing on `y = 0`, facing +Z, built from the context's primitives. */
export interface VehicleModel {
  group: Group;
  /** Where the driver's hips go, in the model's frame. */
  seat: { x: number; y: number; z: number };
  /** Footprint radius: the wall it is when parked. */
  radius: number;
  /** Whether its pilot stands, as in a balloon's basket, rather than sits. */
  stand?: boolean;
  /**
   * The driver's eye, for `V` in the seat, in the model's frame; omitted,
   * `SEAT_EYE` over the hip (`craft/body.ts`), or a standing eye for `stand`.
   */
  eye?: { x: number; y: number; z: number };
  /**
   * How the driver sits and what the hands hold, as Earth's seats say it
   * (`SeatedPose` in `cast.ts`): omitted, a chair's fold and the hands idle.
   */
  pose?: SeatedPose;
}

/**
 * A planet's own craft: a model, a name and a motion. The engine's own
 * (`rover`, `lander`, `aerostat`, `ufo`) are kinds named by themselves in
 * `vehicles`; this is the other way in, for a rover with a sunshade or a
 * crawler in armour, or a town's saucer in the town's colours.
 */
export interface VehicleSpec {
  kind: VehicleKind;
  /** What the HUD calls it: "the crawler". */
  name: string;
  /**
   * The model in code: the craft, or where `kit` is given what stands in for
   * it while the kit is not loaded. Omitted, the engine's own model of the kind.
   */
  build?(ctx: SceneryContext): VehicleModel;
  /** A craft from the space kit; see `KitCraft`. */
  kit?: KitCraft;
  /**
   * Parts in code added to the kit's model (a sunshade over a rover), in its
   * frame — standing on `y = 0`, facing +Z, centred — given its size in units.
   */
  dress?(ctx: SceneryContext, size: { width: number; height: number; length: number }): Group;
  /** Over the kind's own handling. */
  handling?: Partial<Handling>;
  /** `PALETTE` entries for a code-built craft's hull, trim and accent (the saucer's); its own colours omitted. */
  livery?: { wall: number; roof: number; accent: number };
}

/**
 * A craft from the space kit, fitted to the person: scaled so it is `length`
 * units nose to tail, turned to face +Z, and the seat put where the hips go.
 */
export interface KitCraft {
  /** The manifest id, in the `craft` group. */
  id: string;
  /** Units nose to tail. */
  length: number;
  /**
   * Where the driver's hips go, as fractions of the model's box once it faces
   * +Z: across from -0.5 (left) to 0.5, up from 0 to 1, along from -0.5 (tail)
   * to 0.5 (nose). A `closed` craft's seats are laid off its own shell
   * instead (`cockpit.ts`), where a seated crown clears its roof, and this
   * is not read.
   */
  seat: readonly [number, number, number];
  /** The pack authored it facing -Z (Kenney's), so it is turned half round. */
  faces?: 'z' | '-z';
  /**
   * A ship with no wheels stands on legs this long, units, folded away once
   * it is well off the ground.
   */
  legs?: number;
  /**
   * A closed cabin: glazed, lined and furnished from Earth's cabin pieces
   * (`cockpit.ts`), a cab on wheels or a canopy on `legs`, the driver seen
   * through its glass. The craft is fitted so a seated crown clears its
   * roof, and `scripts/check-worlds.ts` holds it.
   */
  closed?: boolean;
  /**
   * A ship's exhausts on its tail, each `[across, up, radius]` as shares of
   * its box (across from -0.5 to 0.5, up from 0 to 1, the radius of its
   * height): a turbine's bell, and the afterburner's flame out of it.
   */
  nozzles?: readonly (readonly [number, number, number])[];
  /**
   * `PALETTE` entries for its panels, its trim and its stripe; omitted, the
   * pack's own colours brought onto the palette.
   */
  livery?: { wall: number; roof: number; accent: number };
}

/**
 * The space kit's props and plants scattered over the open ground, merged
 * into the ground's tiles beside the decorations (`decor.ts`).
 */
export interface KitScatter {
  /** Props by manifest id (rocks, crystals, meteors, craters, bones), weighted. */
  props: readonly { item: string; weight: number }[];
  /** Plants by manifest id, weighted. None on an airless world. */
  flora: readonly { item: string; weight: number }[];
  /** Pieces a finest tile on average; a tile draws a whole number round it. */
  perTile: number;
  /** 0 to 1 of the pieces that are plants rather than props. */
  green: number;
}

/**
 * A little life in the air round the camera.
 *
 * - `dust-devil` — a few whirling columns wandering the plain.
 * - `motes` — specks drifting in a box round the eye; with `fall` they come
 *   down (ice out of a ring), with `speed` they blow along `bearing`.
 * - `streaks` — racing cirrus: long thin strokes torn along the wind, high
 *   and fast.
 * - `glint` — rare sparkles on the ground round the traveller: a facet
 *   catching the sun, a diamond, a hollow's glaze.
 * - `lightning` — a bolt now and then on the horizon, where `where` says
 *   there is weather to make one.
 * - `haze` — soft sheets of murk hanging in layers over the ground.
 */
export interface AmbientSpec {
  kind: 'dust-devil' | 'motes' | 'streaks' | 'glint' | 'lightning' | 'haze' | 'fliers';
  count: number;
  color: number;
  /** Degrees clockwise from north the drift runs *toward*. Omitted, the world's wind, else a slow drift. */
  bearing?: number;
  /** Drift, units a second. */
  speed?: number;
  /** Motes: how fast they fall, units a second. */
  fall?: number;
  /** How big one is, units; fliers, times Earth's bird. */
  size?: number;
  /** Fliers: the underside's colour, under `color` on the back. */
  belly?: number;
  /** Lightning: flashes a minute where it storms hardest. */
  rate?: number;
  /** Lightning: 0 to 1, how stormy a place is; omitted, everywhere alike. */
  where?(lat: number, lon: number): number;
}

/**
 * The prevailing wind at the ground: what leans a Gale, turns a town's
 * buildings and blows the motes. One wind for the whole world, which is a
 * simplification a jet stream would object to and a walker never notices.
 */
export interface WindSpec {
  /** Degrees clockwise from north the wind blows *toward*: 270 is a westward wind. */
  toward: number;
  /** Units a second, for what it carries. */
  speed: number;
  /** 0 to 1: how hard it pushes what leans into it. */
  strength: number;
}

/** A one-off structure at a coordinate, outside any town: a monument, a wreck, a crater observatory. */
export interface Landmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Footprint radius, units: the pad levelled under it and the wall round it. */
  radius: number;
  build(ctx: SceneryContext, rng: Rng): Group;
  /**
   * The craft parked at it, in its own frame (units, the yaw as
   * `Object3D.rotation.y`): built as craft to take, never into its model —
   * a vehicle you cannot get into is a picture of one.
   */
  craft?: readonly { vehicle: VehicleSpec; x: number; z: number; yaw: number }[];
}

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

export interface WorldSpec {
  /** The body's id, which is the registry key and the `?world=` value. */
  id: string;
  /** The `Body` from `src/system/bodies/<id>.ts` (the Moon carries its own). */
  body: Body;
  ground: GroundMode;
  relief: ReliefRecipe;
  palette: GroundPalette;
  sky: SkySpec;
  /** Who lives here, or `null` where nobody does. Settlements are the body's. */
  civilisation: Civilisation | null;
  /** The decorations the body's biomes name by id, from `src/system/parts/`. */
  decorations: readonly Decoration[];
  /** Plain boulders on every finest tile (about 50 units square); on a cloud deck, billows of it (`BILLOW` in `decor.ts`). */
  rocks: number;
  /** One of each stands beside the spawn: an engine kind by name, or a planet's own. */
  vehicles: readonly (VehicleKind | VehicleSpec)[];
  ambient: readonly AmbientSpec[];
  /** The wind at the ground, or `null` for still air. */
  wind: WindSpec | null;
  landmarks: readonly Landmark[];
  /** The space kit's props and plants on the open ground, or `null` for none. */
  scatter: KitScatter | null;
  /** A settlement id, or a coordinate. Defaults to the most populous settlement, else 0 N 0 E. */
  spawn: string | { lat: number; lon: number } | null;
}

/**
 * What `enterWorld` is handed is `src/world-host.ts`'s `WorldHost`: the page's
 * renderer and frame, the sound, the traveller and the way back to the menu.
 * `?world=<id>` builds one of its own (`index.ts`'s `standalone`).
 */
export type { WorldHost } from '../world-host.ts';

// ---------------------------------------------------------------------------
// The defaults, which a bare world is made of
// ---------------------------------------------------------------------------

export const DEFAULT_PHRASES: Phrasebook = {
  greet: [
    'You walk on two legs and you came down from the sky. Welcome to {place}.',
    'A visitor! Nobody told us there would be visitors today.',
    'Greetings, traveller. You are standing in {nation}.',
  ],
  world: [
    'This is {place}. The nearest other town is {distance} away, which is close, for here.',
    'On {body} we say the ground remembers every footstep. It does: there is no wind to fill them.',
    'Our grandparents built {place} where the ground was flattest. It is still the flattest.',
  ],
  visitor: [
    'Is it true your world is mostly water? That sounds like a great deal of trouble.',
    'You are very small. Is everyone where you come from so small?',
    'Your sky is blue, they say. Ours has never been that colour.',
  ],
  farewell: [
    'Go well. Mind the craters.',
    'Come back when the sun is lower. It is kinder then.',
    'Safe travels, small one.',
  ],
};

export const DEFAULT_SCRIPT: ScriptStyle = {
  seed: 'default',
  glyphs: 24,
  strokes: [1, 3],
  loops: 2,
  hooks: 2,
  bars: 2,
  dots: 1,
  zigzags: 1,
  slant: 0,
  line: 'none',
  consonants: 'kvtlmsrzn',
  vowels: 'aeiou',
};

export const DEFAULT_VOICE: VoiceRange = {
  pitch: [180, 260],
  pace: [6, 8],
  tract: [0.8, 1.2],
  wander: 0.12,
};

export const DEFAULT_ARCHITECTURE: ArchitectureStyle = {
  forms: [
    { item: 'dome', weight: 4 },
    { item: 'pod', weight: 2 },
    { item: 'stack', weight: 2 },
    { item: 'spire', weight: 1 },
  ],
  landmark: 'spire',
  walls: [PALETTE.bone, PALETTE.tan, PALETTE.sand],
  roofs: [PALETTE.slate, PALETTE.steel],
  accents: [PALETTE.gold, PALETTE.skyBlue],
  ground: PALETTE.tan,
  height: 1,
  density: 3,
  avenues: 4,
  avenueWidth: 6,
  yaw: 'centre',
  glow: [],
  extra: {},
};

/** The fields a planet file may leave out, and what they become. */
export type WorldOverrides = Partial<Omit<WorldSpec, 'id' | 'body' | 'relief' | 'palette' | 'sky'>> & {
  relief?: Partial<ReliefRecipe>;
  palette?: Partial<Omit<GroundPalette, 'churn'>> & { churn?: Partial<Churn> };
  sky?: Partial<SkySpec>;
};

/**
 * A spec from a body and only what differs from the default — the shape every
 * file in `bodies/` uses. The defaults follow the body: a giant gets a cloud
 * deck, a saucer and banded colours from its `look`; a rocky body a crust, a
 * rover and a light cratering.
 */
export function defineWorld(body: Body, overrides: WorldOverrides = {}): WorldSpec {
  const giant = body.kind === 'giant';
  const look = body.look;
  const relief: ReliefRecipe = {
    planetScale: giant ? 0.04 : 1,
    detail: giant
      ? [
          { amplitude: 7, wavelength: 140, octaves: 3, ridged: 0 },
          { amplitude: 30, wavelength: 1800, octaves: 2, ridged: 0 },
        ]
      : [
          { amplitude: 2.2, wavelength: 26, octaves: 3, ridged: 0.6 },
          { amplitude: 9, wavelength: 260, octaves: 3, ridged: 0.3 },
        ],
    craters: giant
      ? null
      : {
          seed: body.id,
          classes: [
            { cell: 90, chance: 0.35, radius: [5, 22], depth: 0.18, rim: 0.05 },
            { cell: 600, chance: 0.4, radius: [40, 160], depth: 0.14, rim: 0.04, complexAbove: 120 },
          ],
        },
    features: [],
    padReach: 1.5,
    ...overrides.relief,
  };
  const palette: GroundPalette = {
    biomes: {},
    base: look.surface,
    steep: look.highland,
    craterFloor: 0.85,
    ejecta: 1.12,
    bands: giant ? [look.surface, look.cap, look.highland, look.cap, look.lowland] : [look.surface],
    bandSpan: 37.5,
    turbulence: giant ? 0.5 : 0,
    biomeBlend: 0.7,
    tint: null,
    chroma: 1,
    value: 1,
    ...overrides.palette,
    churn: { boil: 0.35, speed: 0, wavelength: 260, strength: 0, ...overrides.palette?.churn },
  };
  const sky: SkySpec = {
    horizon: look.sky,
    zenith: look.sky,
    air: giant ? 0.8 : 0.3,
    light: PALETTE.white,
    exposure: 1,
    overcast: false,
    moons: [],
    layers: [],
    ...overrides.sky,
  };
  return {
    id: body.id,
    body,
    ground: overrides.ground ?? (giant ? 'cloud-deck' : 'rock'),
    relief,
    palette,
    sky,
    civilisation: overrides.civilisation ?? null,
    decorations: overrides.decorations ?? [],
    rocks: overrides.rocks ?? (giant ? 14 : 6),
    vehicles: overrides.vehicles ?? [giant ? 'ufo' : 'rover'],
    ambient: overrides.ambient ?? [],
    wind: overrides.wind ?? null,
    landmarks: overrides.landmarks ?? [],
    scatter: overrides.scatter ?? null,
    spawn: overrides.spawn ?? null,
  };
}

/**
 * How a settlement's built radius follows its population: Earth's law
 * (`radiusFor` in `places.ts`, `0.465 * pop^0.36` in [12, 150]) and for the
 * same reason — a town of a hundred thousand is a few hundred units across at
 * a person's scale. Restated rather than imported because `places.ts` reads
 * `places.bin`; the check holds the two to the same numbers.
 */
export const settlementRadius = (population: number): number =>
  Math.min(150, Math.max(12, 0.465 * Math.pow(Math.max(1, population), 0.36)));

/** A civilisation's fields a planet file may leave out; each part merges over the default. */
export interface CivilisationOverrides {
  script?: Partial<ScriptStyle>;
  voice?: Partial<VoiceRange>;
  phrases?: Partial<Phrasebook>;
  architecture?: Partial<ArchitectureStyle>;
  crowd?: number;
  cast?: CreatureCast;
}

/**
 * A civilisation from a species and what differs from the default. The
 * script's seed defaults to the species' id, so two species never write
 * alike unless a file insists.
 */
export function defineCivilisation(species: Species, overrides: CivilisationOverrides = {}): Civilisation {
  return {
    species,
    script: { ...DEFAULT_SCRIPT, seed: species.id, ...overrides.script },
    voice: { ...DEFAULT_VOICE, ...overrides.voice },
    phrases: { ...DEFAULT_PHRASES, ...overrides.phrases },
    architecture: { ...DEFAULT_ARCHITECTURE, ...overrides.architecture },
    crowd: overrides.crowd ?? 1,
    ...(overrides.cast === undefined ? {} : { cast: overrides.cast }),
  };
}
