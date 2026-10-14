/**
 * What a conversation says: a hello, a few things about the place drawn by
 * weight from what is true here, and a goodbye, in the language of the
 * speaker's country with the English under it. Pure but for `Memory`.
 */
import { fold } from '../ui.ts';
import { rngFrom } from '../scenery/random.ts';
import { ENGLISH_COMPASS, FACTS, fill, languageOf, meantOf, saidOf } from '../phrases.ts';
import type { Language, LineKey, Placeholder } from '../phrases.ts';
import type { BiomeId } from '../biome.ts';

/** What a conversation needs to know about where it is, asked when it starts. */
export interface Where {
  /** The outline code of the country, '' at sea or on ground with none. */
  iso: string;
  /** Its English name, for the translation and where `Intl` has no other. */
  countryName: string;
  /** The built town this person stands in. */
  town: string;
  /** How many live in it, which is how big it is built. */
  population: number;
  /** Whether it is its country's capital. */
  capital: boolean;
  /** Within a stroll of water, sea or lake. */
  coastal: boolean;
  /** 0 frozen to 1 tropical: the biome's warmth where they stand. */
  warmth: number;
  /** The biome where they stand (`biome.ts`), which is what the ground is like. */
  biome: BiomeId;
  /** How high the ground stands over the shelf, in world units (`BiomeSample.elevation`). */
  elevation: number;
  /** The local hour, 0 to 23, on the clock the chip shows. */
  hour: number;
  /** The nearest landmark, how far in real km, and which way from north, clockwise, in radians. */
  landmark: { name: string; km: number; bearing: number } | null;
  /** The vehicles standing near enough to point at, one of each kind at most, and which way they are. */
  craft: readonly { kind: 'plane' | 'balloon' | 'boat'; bearing: number }[];
  /** Whether the speaker is one of the town's children (`isYoung` in `folk.ts`). */
  young: boolean;
  /** Whether the crowd dressed the speaker as a woman (`isWoman` in `folk.ts`): the voice's range. */
  woman?: boolean;
}

/** One line of a conversation: what is said, and what it means. */
export interface Line {
  said: string;
  meant: string;
}

/** How big a town has to be to be called a big city, and how small to be called small. */
const BIG_TOWN = 1_000_000;
const SMALL_TOWN = 30_000;
/** Under this many real km a landmark is "very close"; past this it is not worth the walk. */
const LANDMARK_NEAR_KM = 2;
const LANDMARK_FAR_KM = 3000;
/** Over this many world units above the shelf a town is up in the hills (about a third of `MAX_RELIEF`). */
const HIGH_GROUND = 220;

/**
 * Who is talking. A child is one of the town's children, as the crowd dressed
 * them; the rest are drawn from the person's key, so the same stranger is the
 * same sort of person on every visit.
 */
export type Persona = 'child' | 'elder' | 'grumpy' | 'chatty' | 'plain';

/** The adults' kinds, cumulatively: a grumpy 12%, an elder 20%, a chatty 17%, the rest plain. */
const GRUMPY_SHARE = 0.12;
const ELDER_SHARE = 0.32;
const CHATTY_SHARE = 0.49;

export function personaOf(key: string, young: boolean): Persona {
  if (young) return 'child';
  const draw = rngFrom(key, 'persona').unit();
  return draw < GRUMPY_SHARE ? 'grumpy' : draw < ELDER_SHARE ? 'elder' : draw < CHATTY_SHARE ? 'chatty' : 'plain';
}

/** The lines that are a kind of person's own. */
const PERSONAL: readonly LineKey[] = ['grumpyChat', 'elderChat', 'chattyChat', 'childChat'];

/** How many things about the place each kind of person says between hello and goodbye. */
const TOPICS: Readonly<Record<Persona, number>> = { child: 2, grumpy: 2, plain: 3, elder: 3, chatty: 5 };

/**
 * What a session remembers of its conversations: who has been talked to, what
 * the last conversation was about, what each person has told you already (which
 * they leave out while they have anything else to say), and which variants of
 * each line were said lately, so every variant comes round before any repeats.
 */
export interface Memory {
  met: Map<string, number>;
  lastTopics: Set<string>;
  told: Map<string, Set<string>>;
  said: Map<LineKey, number[]>;
}

export const createMemory = (): Memory => ({ met: new Map(), lastTopics: new Set(), told: new Map(), said: new Map() });

/** The part of the day an hour is in, as the greeting that goes with it. */
function greetingFor(hour: number): LineKey {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/** What the ground is like, as the line about it; temperate, steppe and rock have none of their own. */
function groundLine(biome: BiomeId): LineKey | null {
  switch (biome) {
    case 'ice':
    case 'tundra':
      return 'snowy';
    case 'boreal':
      return 'forest';
    case 'desert':
      return 'desert';
    case 'grassland':
    case 'savanna':
      return 'plains';
    case 'tropical':
      return 'tropical';
    default:
      return null;
  }
}

/** A topic a conversation could take: the key, how likely, and the direction its `{dir}` means, if its own. */
interface Topic {
  key: LineKey;
  weight: number;
  bearing?: number;
}

/** A conversation, as said: in which language, by whom, and its lines. */
export interface Script {
  language: string;
  locale: string;
  rtl: boolean;
  persona: Persona;
  /** What the lines between hello and goodbye were about, in order. */
  topics: LineKey[];
  lines: Line[];
}

type Values = Partial<Record<Placeholder, string>>;

/** The placeholder values, once in the speaker's language and once in English. */
function placeholdersFor(language: Language, capital: string | undefined, where: Where): { native: Values; gloss: Values } {
  const { alpha2 } = languageOf(where.iso);
  const locale = language.locale;
  const facts = language.countries[where.iso];
  const native: Values = { town: where.town };
  const gloss: Values = { town: where.town };
  if (where.countryName !== '') gloss.country = where.countryName;
  native.country = gloss.country;
  if (alpha2 !== '' && language.locale !== 'en') {
    try {
      native.country = new Intl.DisplayNames([locale], { type: 'region' }).of(alpha2) ?? native.country;
    } catch {
      // An engine with no display names keeps the English one.
    }
  }
  if (native.country === undefined) delete native.country;
  if (capital !== undefined) native.capital = gloss.capital = capital;
  if (where.landmark !== null) {
    native.landmark = gloss.landmark = where.landmark.name;
    gloss.km = String(Math.round(where.landmark.km));
    native.km = gloss.km;
    try {
      native.km = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(where.landmark.km);
      gloss.km = new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(where.landmark.km);
    } catch {
      // As above.
    }
  }
  if (facts !== undefined) {
    for (const fact of FACTS) {
      const value = facts[fact];
      if (value === undefined) continue;
      native[fact] = saidOf(value);
      gloss[fact] = meantOf(value);
    }
  }
  return { native, gloss };
}

const eighthOf = (bearing: number): number => ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;

/**
 * Builds a line from keys. Each key's variant is one of those said longest ago
 * or never, so a key's variants all come round before any comes round twice.
 */
function createLiner(
  language: Language,
  memory: Memory,
  rng: ReturnType<typeof rngFrom>,
  values: { native: Values; gloss: Values },
  where: Where,
): (keys: readonly LineKey[], bearing?: number) => Line {
  const { native, gloss } = values;
  const locale = language.locale;
  const variant = (k: LineKey): number => {
    const count = language.lines[k].length;
    const recent = memory.said.get(k) ?? [];
    const fresh: number[] = [];
    for (let i = 0; i < count; i++) if (!recent.includes(i)) fresh.push(i);
    const index = fresh.length > 0 ? fresh[rng.int(fresh.length)]! : recent[0]!;
    const next = recent.filter((i) => i !== index);
    next.push(index);
    // Remember all but one, so there is always a choice.
    while (next.length > Math.max(0, count - 1)) next.shift();
    memory.said.set(k, next);
    return index;
  };
  return (keys, bearing) => {
    const said: string[] = [];
    const meant: string[] = [];
    for (const k of keys) {
      const template = language.lines[k][variant(k)]!;
      let nativeValues = native;
      let glossValues = gloss;
      const direction = bearing ?? where.landmark?.bearing;
      if (direction !== undefined) {
        const eighth = eighthOf(direction);
        nativeValues = { ...native, dir: language.compass[eighth]! };
        glossValues = { ...gloss, dir: ENGLISH_COMPASS[eighth]! };
      }
      said.push(fill(saidOf(template), nativeValues, true, locale));
      meant.push(fill(meantOf(template), glossValues, false));
    }
    // Said and meant alike but for the isolates round a name, which is an
    // English line: the bubble shows it once.
    const whole = said.join(language.join);
    const meaning = meant.join(' ');
    return { said: whole, meant: meaning === whole.replace(/[⁨⁩]/g, '') ? whole : meaning };
  };
}

/** What is true here, and so could be said, and how likely each is. */
function topicsFor(where: Where, persona: Persona, capital: string | undefined, native: Values, gloss: Values): Topic[] {
  const topics: Topic[] = [];
  const offer = (k: LineKey, weight: number, bearing?: number): void => {
    topics.push(bearing === undefined ? { key: k, weight } : { key: k, weight, bearing });
  };
  const late = where.hour >= 22 || where.hour < 5;
  const early = where.hour >= 5 && where.hour < 8;
  const weather: LineKey = late ? 'late' : early ? 'early' : where.warmth > 0.7 ? 'hot' : where.warmth < 0.3 ? 'cold' : 'mild';
  const nearLandmark = where.landmark !== null && where.landmark.km < LANDMARK_FAR_KM;
  for (const craft of where.craft) offer(craft.kind, persona === 'child' ? 2 : 1.4, craft.bearing);
  if (persona === 'child') {
    offer('childChat', 100);
    offer(weather, 1);
    if (nearLandmark && where.landmark!.km < LANDMARK_NEAR_KM) offer('landmarkNear', 1);
    if (native.dish !== undefined) offer('dish', 0.6);
    if (native.sport !== undefined) offer('sport', 0.8);
    return topics;
  }
  const isCapital = where.capital || (capital !== undefined && fold(capital) === fold(where.town));
  if (isCapital) offer('capitalHere', 1);
  else if (capital !== undefined) offer('capitalThere', 0.8);
  offer(where.population >= BIG_TOWN ? 'big' : where.population < SMALL_TOWN ? 'small' : 'middling', 1);
  offer(where.coastal ? 'coast' : 'inland', 0.8);
  if (where.elevation > HIGH_GROUND) offer('high', 1.4);
  const ground = groundLine(where.biome);
  if (ground !== null) offer(ground, 1.2);
  if (nearLandmark) offer(where.landmark!.km < LANDMARK_NEAR_KM ? 'landmarkNear' : 'landmark', 1.5);
  offer(weather, 1);
  if (native.country !== undefined && gloss.country !== undefined) offer('country', 0.5);
  for (const fact of FACTS) if (native[fact] !== undefined) offer(fact, fact === 'proverb' ? 1.4 : 1);
  offer('chat', 1);
  if (persona === 'grumpy') offer('grumpyChat', 4);
  if (persona === 'elder') offer('elderChat', 3);
  if (persona === 'chatty') offer('chattyChat', 2.5);
  return topics;
}

/**
 * Draws a few topics by weight, leaving out what the last conversation was
 * about and what this person has told you before while there is anything else
 * to say. A grown-up with a fact to tell says at least one, replacing the
 * plainest topic drawn (never the person's own kind of talk or a vehicle).
 */
function chooseTopics(topics: Topic[], persona: Persona, key: string, memory: Memory, rng: ReturnType<typeof rngFrom>): Topic[] {
  const wanted = TOPICS[persona];
  const chosen: Topic[] = [];
  const draw = (pool: Topic[]): void => {
    while (chosen.length < wanted && pool.length > 0) {
      let total = 0;
      for (const topic of pool) total += topic.weight;
      let at = rng.unit() * total;
      let index = 0;
      while (index < pool.length - 1 && at >= pool[index]!.weight) at -= pool[index++]!.weight;
      chosen.push(pool.splice(index, 1)[0]!);
    }
  };
  const told = memory.told.get(key) ?? new Set<string>();
  const heard = (t: Topic): boolean => memory.lastTopics.has(t.key) || told.has(t.key);
  const [fresh, stale] = [topics.filter((t) => !heard(t)), topics.filter(heard)];
  draw(fresh);
  draw(stale);
  const isFact = (t: Topic): boolean => (FACTS as readonly string[]).includes(t.key);
  if (persona !== 'child' && !chosen.some(isFact)) {
    const fact = fresh.find(isFact);
    let plain = chosen.length - 1;
    while (plain >= 0 && (chosen[plain]!.bearing !== undefined || PERSONAL.includes(chosen[plain]!.key))) plain--;
    if (fact !== undefined && plain >= 0) chosen[plain] = fact;
  }
  memory.lastTopics = new Set(chosen.map((t) => t.key));
  for (const t of chosen) told.add(t.key);
  memory.told.set(key, told);
  return chosen;
}

/**
 * A person's conversation about `where`, in `language`, which is the one its
 * country speaks (`languageOf`); `capital` is the country's capital by
 * GeoNames if it has one. Pure but for `memory`, which it reads and then
 * writes what it said into, so a fresh memory gives the same conversation
 * every time and `pnpm people` can hold every language to it.
 */
export function compose(
  language: Language,
  capital: string | undefined,
  key: string,
  where: Where,
  memory: Memory = createMemory(),
): Script {
  const persona = personaOf(key, where.young);
  const met = memory.met.get(key) ?? 0;
  memory.met.set(key, met + 1);
  // A second word with somebody is a new draw, not the first one again.
  const rng = rngFrom(key, 'talk', met);
  const values = placeholdersFor(language, capital, where);
  const line = createLiner(language, memory, rng, values, where);

  // Hello: again, to somebody met before; the child's and the grump's own;
  // anyone else's by the hour, and a welcome that names the town.
  const out: Line[] = [];
  if (met > 0) out.push(line(['again']));
  else if (persona === 'child') out.push(line(['childGreet']));
  else if (persona === 'grumpy') out.push(line(['grumpyGreet']));
  else out.push(line([greetingFor(where.hour), 'welcome']));

  const chosen = chooseTopics(topicsFor(where, persona, capital, values.native, values.gloss), persona, key, memory, rng);
  for (const topic of chosen) out.push(line([topic.key], topic.bearing));

  out.push(line([persona === 'child' ? 'childBye' : persona === 'grumpy' ? 'grumpyBye' : 'bye']));
  return { language: language.name, locale: language.locale, rtl: language.rtl === true, persona, topics: chosen.map((t) => t.key), lines: out };
}
