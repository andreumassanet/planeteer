/**
 * What a body of the solar system is, and the two scales it is drawn at.
 *
 * `src/traffic/contract.ts` is the model: a kit gets its own directory, its own
 * contract and its own check script when the thing it declares cannot be said
 * in the shape the existing contract uses. That is the case here twice over —
 * a `ScenicPart` declares a footprint radius and a planet declares an orbit —
 * so this is a fourth kit rather than a `kind` in an existing one.
 *
 * **Nothing in `src/` imports this file.** Every planet other than Earth is
 * behind an `import()` in the same way the monument registry and the scenery
 * kit are, and for a measured reason: a module in the initial graph is fetched
 * *and parsed* before `start()` runs, so code the first frame does not need is
 * a delay in front of the data it does. Earth is the detailed one and its first
 * load may not move.
 *
 * ---
 *
 * # The scale, and why there are two of them
 *
 * This is the decision the whole directory rests on, so it is written down with
 * its arithmetic rather than tuned into place. The short version: **the orbits
 * are exact and the bodies are drawn far too big, which is the lie every orrery
 * ever built has told, and the alternative is not a smaller lie but an empty
 * screen.**
 *
 * ## The numbers that force it
 *
 * Earth is `PLANET_RADIUS` = 16,000 units against a real 6,371 km, so one world
 * unit is **0.398 km** and the planet is about 1:400. Then:
 *
 * ```
 *   1 au                       149,597,871 km    375,690,000 world units
 *   Neptune's orbit, 30.07 au                     11,296,000,000 units
 * ```
 *
 * Two independent walls, either of which is fatal on its own:
 *
 * - **Float32 quantises it out of existence.** Three stores positions as
 *   `Float32Array`: 24 bits of mantissa. At 1.13e10 the spacing between
 *   representable numbers is `2^34 / 2^23` = **1,024 units — 460 people.** A
 *   person standing on Neptune at true scale cannot be given a position; they
 *   snap to a lattice a kilometre and a half across. This is not a look, it is
 *   an arithmetic impossibility, and no amount of camera-relative rendering
 *   fixes the orbit itself.
 * - **Nothing is visible anyway.** Earth seen from Mars at closest approach —
 *   0.52 au, 195 million units — subtends `2 * 16000 / 195e6` = 1.6e-4 radians.
 *   On this project's own lens (`937 * size / distance`, a 900 px frame at 55
 *   degrees) that is **0.08 pixels.** The true solar system, drawn truly, is a
 *   black screen with one dot in it.
 *
 * ## So: two scales, and they are two views
 *
 * **The surface scale is not compressed at all and is not a choice.** The
 * avatar is 3.77 units (6.8 until 2026-09-24) and stands for a real 1.75 m
 * person on every world, so
 * the kilometres per unit is fixed at Earth's 0.398 everywhere, so a body's
 * walkable radius is its *real* radius divided by that. Mars comes out at 8,514
 * units and Mercury at 6,128 — see `surfaceRadiusOf`. Nothing is decided here;
 * the constant was decided when the avatar was.
 *
 * **The system scale is compressed, and only in one place.** `AU_UNITS` is
 * 1,000 system units to the astronomical unit, applied linearly, so:
 *
 * - Every orbit keeps its true size, its true eccentricity, its true
 *   inclination and its true phase. Kepler is untouched. Mercury's ellipse is
 *   visibly off-centre because it really is.
 * - The whole system is 60,140 units across, where float32's spacing at
 *   Neptune's 30,070 is **0.0037 units** — five thousand times finer than a
 *   pixel at any framing.
 *
 * and **the bodies are then drawn at a size that has nothing to do with it.**
 * Earth's true radius at 1,000 units to the au is 0.0426 units, a
 * ten-thousandth of a pixel. So the exaggeration is the whole of the system
 * view's honesty budget and it is spent under one rule:
 *
 * > **Two neighbouring bodies' drawn radii must sum to less than half the
 * > minimum distance between their orbits.**
 *
 * Under that rule a square-root law on the radii — `EARTH_DRAWN * sqrt(R/Re)` —
 * fits with room to spare and keeps the one relation that matters, which is
 * that the giants read as giants. Squashing the ratio from 11.2:1 to 3.35:1 is
 * the cost, and it is the same crop `MAX_ASPECT` licenses for a monument:
 * distort the axis carrying least recognition.
 *
 * ## The Sun is not on that law, and it is worth knowing why
 *
 * The Sun is **109 Earth radii** and Mercury's perihelion is only **66 solar
 * radii**. So any exaggeration large enough to make Earth a shape at all puts
 * the Sun's own disc out past Mercury's orbit: at `EARTH_DRAWN` = 28 the
 * square-root law asks for a Sun of **293 units against a perihelion of 307**,
 * and Mercury spends part of every year inside the star. There is no exponent
 * that fixes it — holding the Sun inside Mercury's orbit *and* Earth visible
 * needs `q <= 0.14`, at which Jupiter is 1.4 Earths and the giants are gone.
 *
 * So the Sun gets its own number, capped by the constraint, and the ratio it
 * gives up is stated rather than hidden: **the Sun is drawn 4.6 times Earth
 * where it is really 109 times.** What is kept is that it is the largest thing
 * in the frame and that Mercury passes it with 1.25 solar radii of daylight.
 *
 * ## And below a size, a body is a pin
 *
 * From a framing that holds the whole system — 57,800 units back for a 55
 * degree lens — Earth's 28-unit disc is `937 * 56 / 57800` = **0.9 pixels.**
 * That is not a failure of the exaggeration, it is what a solar system is: it
 * is mostly nothing. So the same inequality `settlements.ts` uses one level
 * down decides it here — a body is built as geometry when it is worth
 * `MIN_APPARENT_PIXELS` and drawn as a mark when it is not — and the widest
 * view is a chart of nine pins on eight true ellipses, which is what a solar
 * system chart has always been and is drawn from the data rather than from the
 * scene, exactly as `map.ts` is.
 */

import { PLANET_RADIUS } from '../globe.ts';
import type { OrbitId } from './orbits.ts';
import { ELEMENTS, heliocentric } from './orbits.ts';
import type { Rng } from '../scenery/random.ts';
import { rngFrom } from '../scenery/random.ts';

// ---------------------------------------------------------------------------
// The two scales
// ---------------------------------------------------------------------------

/** The astronomical unit, kilometres. The IAU's definition, exactly. */
export const AU_KM = 149597870.7;

/** Earth's volumetric mean radius, kilometres. What `PLANET_RADIUS` stands for. */
export const EARTH_RADIUS_KM = 6371;

/**
 * Kilometres to a world unit, and it is a **derived** number in the strict
 * sense: nothing chose it, `PLANET_RADIUS` and the real Earth did. 0.39819.
 */
export const KM_PER_UNIT = EARTH_RADIUS_KM / PLANET_RADIUS;

/**
 * How big a body is to stand on.
 *
 * The avatar is a person, on every world, so the scale cannot vary between
 * them — which makes this a division and not a decision. The consequence worth
 * knowing before anyone proposes normalising it: a lap of Mars at a run is
 * `2 pi * 8514 / RUN_SPEED` = **66 minutes** against Earth's 2.1 hours, and of
 * Jupiter's 1-bar level about 23 hours. Mercury is 48 minutes' run. That range
 * is real and it is the point. (At the run of 13.5 units a second since
 * 2026-09-24, and 89 minutes, 2.8 hours, 31 hours and an hour at the 10 it was
 * earlier that day; they were 9.9 minutes, 18.6, 3.4 hours and seven minutes at the 90 of
 * 2026-09-13, and 6.9, 12.9, 2.4 hours and five at the 130 before it; the
 * ratios between them did not move.)
 *
 * **This is declared and not yet wired.** `PLANET_RADIUS` is a module constant
 * in `globe.ts` that everything derives from, and making it per-body is that
 * file's change and not this one's; `scripts/check-system.ts` asserts the
 * arithmetic so the number cannot rot in the meantime.
 */
export const surfaceRadiusOf = (radiusKm: number): number => radiusKm / KM_PER_UNIT;

/** System units to the astronomical unit. The one compression in the orrery. */
export const AU_UNITS = 1000;

/**
 * Earth's drawn radius in the system view, and the peg the others hang off.
 *
 * 28 rather than 40 for one reason and it is the Sun: at 40 the square-root law
 * gives Jupiter 134 units against a Sun that cannot exceed 129, and a Sun
 * smaller than Jupiter is a worse picture than a squashed one.
 */
export const EARTH_DRAWN = 28;

/**
 * The law. Square root of the true radius ratio, which halves every ratio in
 * the logarithm and leaves the ordering and the families intact.
 */
export const drawnRadiusOf = (radiusKm: number): number =>
  EARTH_DRAWN * Math.sqrt(radiusKm / EARTH_RADIUS_KM);

/**
 * The Sun, off the law and against the constraint.
 *
 * Mercury's perihelion is `a(1-e)` = 0.30752 au = 307.5 system units, and
 * Mercury's own drawn radius is 17.3, so the Sun may reach
 * `0.5 * 307.5 - 17.3` = 136.5 before the two discs are closer than half the
 * gap they have to share. 129 is that with a margin, and it leaves Mercury
 * passing at **161 units — 1.25 solar radii — of clear sky at its closest.**
 */
export const SUN_DRAWN = 129;

/**
 * When a body stops being a mark and becomes a mesh.
 *
 * `settlements.ts`'s number and `settlements.ts`'s lens, one level up: a town
 * builds at 8 apparent pixels and a body does the same. `937 * 2r / d > 8`
 * rearranges to `d < 234 * r`, which is `LEGIBLE_AT` in the scenery contract
 * written the other way round, so Earth is a mesh inside 6,552 system units and
 * the Sun inside 30,186. From the whole-system framing every one of them is a
 * pin, which is correct rather than a shortfall.
 */
export const MIN_APPARENT_PIXELS = 8;
export const meshWithin = (drawnRadius: number): number => 234 * drawnRadius;

/** How many pixels a body of this radius is at this range, on the shared lens. */
export const apparentPixels = (drawnRadius: number, distance: number): number =>
  (937 * 2 * drawnRadius) / distance;

// ---------------------------------------------------------------------------
// The frames
// ---------------------------------------------------------------------------

/**
 * The ecliptic frame into the world frame, and the good news is that it is a
 * relabelling.
 *
 * `orbits.ts` works in the J2000 ecliptic: +x at the vernal equinox, +z at the
 * ecliptic north pole, right-handed. `globe.ts` puts north at +y and `geo.ts`
 * reads longitude as `atan2(-z, x)`, because this planet was mirrored for
 * months and the repair was to choose one hand and hold it everywhere that
 * converts — which is one file, `sphere.ts`, since 2026-09-21. Mapping `(x, y, z) -> (x, z, -y)` lands ecliptic north
 * on the world's north pole and — this is the part worth checking rather than
 * believing — **carries ecliptic longitude to world longitude unchanged**:
 * ecliptic longitude 90 is `(0, 1, 0)`, which arrives at `(0, 0, -1)`, whose
 * world longitude is `atan2(1, 0)` = 90.
 *
 * Its determinant is +1, so it is a rotation and not a reflection. That is
 * asserted in the check script and not asserted here, because a mirror
 * introduced in a conversion is precisely the bug this project has now shipped
 * three times, and every time the only witness was a third party.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const eclipticToWorld = (v: Vec3): Vec3 => ({ x: v.x, y: v.z, z: -v.y });

/** A body's position in the system view, world frame, system units. */
export function systemPosition(orbit: OrbitId, date: Date): Vec3 {
  const h = heliocentric(orbit, date);
  const v = eclipticToWorld(h);
  return { x: v.x * AU_UNITS, y: v.y * AU_UNITS, z: v.z * AU_UNITS };
}

// ---------------------------------------------------------------------------
// What a body is
// ---------------------------------------------------------------------------

export type BodyKind = 'star' | 'rocky' | 'giant' | 'moon';

/**
 * A "country".
 *
 * There is no `countries.bin` for Mars and there is not going to be one: the
 * Earth's outlines are 97,280 coordinates of real cartography and the whole
 * data pipeline exists to serve them. What another world needs is the *answer*
 * `countryAt` gives — whose ground is this — and the cheapest honest shape for
 * that is a **spherical cap**: a centre and an angular radius, resolved by
 * smallest-containing-cap exactly as `countryAt` resolves overlapping rings to
 * the smallest.
 *
 * That is not a poorer version of the Earth's model, it is a different claim.
 * A cap has no coastline, so a Martian nation has no shape you could recognise
 * from orbit — and Mars has no coastlines either. What it does have is the
 * property the Earth's version was built for and the reason the rasterised
 * index was thrown out: **it is exact.** A point is inside a cap or it is not,
 * to the last bit, with no antialiased boundary handing back an arbitrary
 * neighbour.
 */
export interface Nation {
  id: string;
  /** Shown in the HUD and on the menu. English, like everything here. */
  name: string;
  /** Cap centre, degrees. */
  lat: number;
  lon: number;
  /** Angular radius of the cap, degrees. */
  radius: number;
  /** A `PALETTE` entry. What the map tints this nation. */
  color: number;
  /** Free text for the border card. One sentence. */
  note: string;
}

/** A "city": a named place with a population, the shape `places.bin` carries. */
export interface Settlement {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Whatever this world counts. Drives the built radius the same way. */
  population: number;
  /** The `Nation.id` this stands in. Asserted by the check. */
  nation: string;
}

/**
 * What the ground is made of, per body.
 *
 * The same split `biome.ts` makes and the same reason for it: `reliefAt` says
 * how high the ground is and `biomeAt` says what it is made of, and everything
 * downstream reads them rather than deciding for itself. What does **not**
 * transfer is the model — Earth's pair is temperature against *moisture*, and
 * a world with no water cycle has no moisture axis at all. Mars's second axis
 * is dust; Venus's is altitude. So the axes are the body's and only the shape
 * is shared.
 */
export interface BodyBiome {
  id: string;
  /** From `PALETTE`, like every other colour in this project. */
  color: number;
  /** 0 to 1, read as a probability per plot by whatever scatters things. */
  cover: number;
  /** Decoration ids from `src/system/parts/`, most likely first. */
  parts: readonly string[];
}

export interface GroundSample {
  id: string;
  /** 0 to 1. Whatever the body's first axis is; for a planet, how warm. */
  warmth: number;
  /** 0 to 1. The body's second axis — dust, altitude, ice, whatever it has. */
  second: number;
  /** Relief above the datum, world units. */
  elevation: number;
}

export interface GroundModel {
  /** What the second axis is called, for the check script's own table. */
  secondAxis: string;
  biomes: Record<string, BodyBiome>;
  /** Relief in world units at a point on the unit sphere. Pure. */
  relief(lat: number, lon: number): number;
  /** The classifier. Fills `target` rather than allocating; see `biomeAt`. */
  at(lat: number, lon: number, elevation: number, target: GroundSample): GroundSample;
}

/**
 * One world.
 *
 * Split deliberately into three groups: what is **true** of the real body, what
 * this project **draws**, and what has been **invented** to stand on it. The
 * first group is checkable against an almanac and the check script does check
 * it; the second is the scale decision applied; the third is the part a
 * different author could replace without touching either of the others.
 */
export interface Body {
  id: string;
  name: string;
  kind: BodyKind;

  // --- what is true ---
  /** Which row of `ELEMENTS` moves it. `null` for the Sun, which is the origin. */
  orbit: OrbitId | null;
  /** Volumetric mean radius, km. */
  radiusKm: number;
  /** Sidereal rotation, hours. Negative where the body turns retrograde. */
  rotationHours: number;
  /** Obliquity, degrees. Venus's 177 is why its day runs backwards. */
  tiltDeg: number;
  /** Surface gravity, m/s². Drives how the species is built; see `alien.ts`. */
  gravity: number;
  /** One sentence for the menu card. */
  blurb: string;

  // --- what is drawn ---
  /** `PALETTE` entries, so the whole system is painted from the same 24. */
  look: {
    /** The dominant ground colour, and what the pin is drawn in. */
    surface: number;
    /** The high ground, the second cel band's worth lighter or darker. */
    highland: number;
    /** The low ground. */
    lowland: number;
    /** Poles, cloud tops, whatever is white here. */
    cap: number;
    /** The sky standing on it. Mars's is butterscotch and it is not blue. */
    sky: number;
  };

  // --- what is invented ---
  ground: GroundModel | null;
  nations: readonly Nation[];
  settlements: readonly Settlement[];
  /** The `Species.id` that lives here, or `null` where nothing does. */
  species: string | null;
}

// ---------------------------------------------------------------------------
// A species
// ---------------------------------------------------------------------------

/**
 * A body plan, and the point of the record is that it is **parametric in kind
 * and not in size**.
 *
 * A different alien per planet is a different set of numbers here, not a
 * different builder — which is `scenery/people.ts`'s own arrangement seen from
 * one step further out: `Figure` describes one species and `Look` describes one
 * member of it, and `buildPerson` reads nothing else. What is added is that the
 * *topology* moves too: how many legs, how many arms, how many trunk segments,
 * how many eyes and where. A martian with four arms is the same code as a
 * martian with two.
 *
 * **Gravity is the parameter with an argument behind it.** Mars is 0.38 g, so a
 * skeleton doing the same job can be longer and thinner; Venus's crushing
 * pressure and Jupiter's 2.5 g say the opposite. That is not physiology this
 * project can claim to have modelled — it is a *rule for generating difference*
 * that produces recognisably different silhouettes for a reason a player can
 * name, which is the whole job.
 */
export interface Morph {
  id: string;
  name: string;
  /** Crown above the sole, world units, before the per-individual spread. */
  height: number;
  /** Head heights to the whole figure. Four is the avatar's; three is squat. */
  heads: number;
  /** Legs as a fraction of height. The avatar is 0.44. */
  legShare: number;
  /** 1 or 2. Two pairs is a quadruped stance on a bipedal rig. */
  legPairs: 1 | 2;
  /** 1 or 2. */
  armPairs: 1 | 2;
  /** Trunk segments. One is a torso; three is an insect. */
  segments: 1 | 2 | 3;
  /** Half-widths as a fraction of height, shoulder and hip. */
  shoulderShare: number;
  hipShare: number;
  /** Front-to-back squash on the trunk. Under 1 is a slab, over 1 is a barrel. */
  depth: number;
  /** How the head sits: on a neck, on a stalk, sunk into the shoulders, none. */
  neck: 'short' | 'long' | 'stalk' | 'none';
  /** Sides on the head prism. Three reads as a wedge, eight as a dome. */
  headSides: number;
  /** Eyes, in one row across the face. 1 to 6. */
  eyes: number;
  /** A crest, a frill or nothing on the crown. */
  crown: 'none' | 'crest' | 'frill' | 'horns';
  /** A tail counterbalance, as a fraction of height. 0 is none. */
  tail: number;
  /** Limb half-widths as a fraction of height. */
  limbR: number;
}

/** One member of a species, the way `Look` is one member of ours. */
export interface Alien {
  height: number;
  /** Multiplies every half-width. 0.85 to 1.2. */
  girth: number;
  /** Skin, and it is drawn from the species' own range and not from a region. */
  hide: number;
  /** The one dark colour: harness, boots, tool. */
  trim: number;
  /** The one bright colour: a sash, a pack, a marking. */
  accent: number;
  /** What is worn. Regional, and drawn from a different fork than the body. */
  wear: 'none' | 'wrap' | 'harness' | 'cloak' | 'suit';
  /** What is carried, or `none`. */
  carry: 'none' | 'pack' | 'staff' | 'vessel';
  /** Which pose, out of the species' own set. */
  pose: 'stand' | 'walk' | 'work' | 'watch';
  /** A signed nudge on every swing angle. */
  sway: number;
  /** Forward lean about the hip, radians. */
  stoop: number;
}

export interface Species {
  id: string;
  name: string;
  /** The body this one is. */
  morph: Morph;
  /** Hides, in the order they are drawn. `PALETTE` entries. */
  hides: readonly number[];
  /** What this species wears, weighted. */
  wears: readonly { item: Alien['wear']; weight: number }[];
  carries: readonly { item: Alien['carry']; weight: number }[];
  /** Trims and accents to draw from. */
  trims: readonly number[];
  accents: readonly number[];
}

// ---------------------------------------------------------------------------
// Decoration
// ---------------------------------------------------------------------------

/**
 * A scenic part for another world.
 *
 * It is `ScenicPart` with two changes and they are both forced. **The style
 * argument is the body's palette and not a `RegionStyle`**, because a region on
 * Earth carries a wardrobe, a set of building weights and a ground style, none
 * of which a rock formation on Mars has an opinion about. And **`bodies` is the
 * range map**, which is `NATIVE_TO` in `scenery/regions.ts` arriving one level
 * up: `BIOMES[id].plants` says what grows and the range map says whose ground
 * it is, because one list of species per climate puts a saguaro outside
 * Timbuktu. Empty means anywhere.
 *
 * There is no `kind` and no `VARIANTS` table. Six variants, one budget, and the
 * reason the scenery kit needs five kinds is that a house, a tower and a bush
 * are priced differently; nothing here is a house.
 */
export interface Decoration {
  id: string;
  /** Bounding radius. Right for a rock, which is roughly as deep as it is wide. */
  footprint: number;
  /** `Body.id`s this may stand on. Empty is anywhere. */
  bodies: readonly string[];
  build(ctx: import('../scenery/contract.ts').SceneryContext, rng: Rng, look: Body['look']): import('../scenery/contract.ts').Group;
}

export const DECORATION_VARIANTS = 6;

/**
 * The seed for one variant, from identity and never from order.
 *
 * `scenery/random.ts` states the rule and the reason: seed a plot from a
 * running counter and inserting one house at the head of a village reshuffles
 * the whole village. Same shape here — a decoration's seed is its id, its
 * world and its variant number, so adding a part to the registry moves nothing
 * that was already standing.
 */
export function decorationRng(part: Decoration, bodyId: string, variant: number): Rng {
  return rngFrom('system', bodyId, part.id, variant);
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * What one of anything may cost.
 *
 * A crowd person on Earth is 296 triangles median against a 420 cap and is the
 * object you stand next to; an alien is the same object on a different world,
 * so it gets the same allowance and not a bigger one. The decoration is priced
 * against `scenery/contract.ts`'s `scatter` and `tree` tiers for the same
 * reason: a Martian rock formation seen at 40 units is a Terran boulder seen at
 * 40 units, and the pen does not know which planet it is on.
 */
export const BUDGETS = {
  alien: { triangles: 520, meshes: 34, colors: 6 },
  decoration: { triangles: 220, meshes: 12, colors: 4 },
} as const;

/** How many variants of a species a world builds. `PEOPLE_VARIANTS` is 24. */
export const ALIEN_VARIANTS = 24;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Everything about a body that can be wrong without anything crashing.
 *
 * The list is the point: each entry is a class of error that a screenshot
 * cannot show. A settlement outside its own nation's cap, a nation centred in
 * another nation, an orbit id that is not in the table, a drawn radius that
 * breaks the neighbour rule — none of them throws and all of them are wrong.
 */
export function validateBody(body: Body): string[] {
  const problems: string[] = [];

  if (body.orbit !== null && !(body.orbit in ELEMENTS)) {
    problems.push(`orbit '${body.orbit}' is not a row of ELEMENTS`);
  }
  if (body.kind === 'star' && body.orbit !== null) problems.push('a star does not orbit anything here');
  if (body.kind !== 'star' && body.orbit === null) problems.push('has no orbit');
  if (!(body.radiusKm > 0)) problems.push('radius must be positive');
  if (!(body.gravity > 0)) problems.push('gravity must be positive');
  if (Math.abs(body.tiltDeg) > 180) problems.push(`tilt ${body.tiltDeg} is out of range`);

  const nations = new Map<string, Nation>();
  for (const nation of body.nations) {
    if (nations.has(nation.id)) problems.push(`duplicate nation id '${nation.id}'`);
    nations.set(nation.id, nation);
    if (Math.abs(nation.lat) > 90) problems.push(`${nation.id} has latitude ${nation.lat}`);
    if (nation.lon < -180 || nation.lon > 180) problems.push(`${nation.id} has longitude ${nation.lon}`);
    if (!(nation.radius > 0 && nation.radius < 90)) {
      problems.push(`${nation.id} has an angular radius of ${nation.radius}, which is not a cap`);
    }
  }

  // A cap whose centre is inside another cap is the enclave case, and it is
  // legal — `countryAt` resolves overlapping rings to the smallest and this
  // resolves overlapping caps the same way. What is not legal is two caps of
  // the *same* size sharing a centre, which no rule can separate.
  for (const a of body.nations) {
    for (const b of body.nations) {
      if (a.id >= b.id) continue;
      if (angularDistance(a.lat, a.lon, b.lat, b.lon) < 0.01 && Math.abs(a.radius - b.radius) < 0.01) {
        problems.push(`${a.id} and ${b.id} are the same cap — nothing can tell them apart`);
      }
    }
  }

  const ids = new Set<string>();
  for (const place of body.settlements) {
    if (ids.has(place.id)) problems.push(`duplicate settlement id '${place.id}'`);
    ids.add(place.id);
    if (Math.abs(place.lat) > 90) problems.push(`${place.id} has latitude ${place.lat}`);
    if (place.lon < -180 || place.lon > 180) problems.push(`${place.id} has longitude ${place.lon}`);
    const nation = nations.get(place.nation);
    if (nation === undefined) {
      problems.push(`${place.id} claims nation '${place.nation}', which does not exist here`);
    } else {
      const found = nationAt(body, place.lat, place.lon);
      if (found?.id !== place.nation) {
        const d = angularDistance(place.lat, place.lon, nation.lat, nation.lon);
        problems.push(
          `${place.id} declares '${place.nation}' and stands in '${found?.id ?? 'nowhere'}'` +
            ` — it is ${d.toFixed(1)} deg from that cap's centre, whose radius is ${nation.radius}`,
        );
      }
    }
    if (!(place.population > 0)) problems.push(`${place.id} has no population`);
  }

  if (body.ground !== null) {
    for (const [id, biome] of Object.entries(body.ground.biomes)) {
      if (biome.id !== id) problems.push(`biome '${id}' calls itself '${biome.id}'`);
      if (biome.cover < 0 || biome.cover > 1) problems.push(`biome '${id}' has cover ${biome.cover}`);
    }
  }

  return problems;
}

/** Great-circle angle between two lat/lon, degrees. */
export function angularDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const d = Math.PI / 180;
  const a = Math.sin(lat1 * d) * Math.sin(lat2 * d);
  const b = Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.cos((lon1 - lon2) * d);
  return Math.acos(Math.max(-1, Math.min(1, a + b))) / d;
}

/**
 * Whose ground this is: the **smallest** cap containing the point.
 *
 * The same resolution `countryAt` uses on overlapping rings, and it is here for
 * the same reason it is there — Natural Earth's Morocco covers the Moroccan
 * part of Western Sahara and Lesotho sits inside South Africa, so first-match
 * made both unreachable. A cap model has exactly that shape of problem the
 * moment anyone writes an enclave, and answering it once now costs a
 * comparison.
 */
export function nationAt(body: Body, lat: number, lon: number): Nation | null {
  let best: Nation | null = null;
  for (const nation of body.nations) {
    if (angularDistance(lat, lon, nation.lat, nation.lon) > nation.radius) continue;
    if (best === null || nation.radius < best.radius) best = nation;
  }
  return best;
}

export { PLANET_RADIUS };
export type { OrbitId, Rng };
