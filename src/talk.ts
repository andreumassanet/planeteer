import * as THREE from 'three';
import { loadCountryFacts } from './country-facts.ts';
import { labelOf } from './controls.ts';
import { ensureStyle, fold, h, installUi, kbd } from './ui.ts';
import { rngFrom } from './scenery/random.ts';
import { ENGLISH_COMPASS, FACTS, fill, languageOf, loadLanguage, meantOf, saidOf } from './phrases.ts';
import type { Language, LineKey, Placeholder } from './phrases.ts';
import type { BiomeId } from './biome.ts';
import { planSpeech, revealed, speak, SPEECH_LEAD, voiceOf } from './voice.ts';
import type { Speech, Utterance, Voice } from './voice.ts';

/**
 * Talking to the townsfolk: `E` beside somebody standing in a town, and they
 * stop, turn to you and say something, in the language of the country they
 * live in, with the English under it.
 *
 * ## What they say is about where they are, and who is saying it
 *
 * A conversation is a hello, a few things about the place and a goodbye. The
 * hello is for the hour it is where they stand, with a welcome that names the
 * town — or an "again" to somebody already talked to this session. The things
 * are drawn by weight from what is true here: whether the town is the
 * country's capital or what the capital is, how big it is built, the water,
 * the height of the ground and what grows on it, the nearest landmark with its
 * distance and direction, a plane, balloon or launch standing near enough to
 * point at, the weather and the hour, and above all the country's own facts
 * (`phrases/*.ts`): a dish to try, a drink, a festival, a sport, a wonder,
 * what its people are proud of and a proverb of theirs. A grown-up with facts
 * to tell says at least one.
 *
 * Who says it is the person's key: a child (the crowd's own draw, `isYoung`)
 * says a child's things; of the grown-ups a few are grumpy, some old and full
 * of how it used to be, some will not stop talking and say more. The draw is
 * seeded by the key and by how many times you have spoken, so a second word
 * with somebody is a different one.
 *
 * ## A session remembers
 *
 * `Memory` is what the townsfolk know of you: who you have talked to, what the
 * last conversation was about and what each person has told you already —
 * which they leave out while they have anything else to say — and which
 * variants of every line were said lately, so each key's variants come round
 * before any is heard twice.
 *
 * ## The words arrive on the first conversation
 *
 * `phrases.ts` says which language a country speaks, and each language is a
 * module of its own under `phrases/`, fetched on the first conversation in it
 * along with the country facts (the capital), which the border card reads too.
 * Nothing of it is in the world's first load.
 *
 * ## A bubble over the head, in the card language
 *
 * The line is a small card over the speaker, placed each frame by projecting
 * their crown, so it stays with them as the camera turns; it hides while they
 * are behind the camera. `E` again goes to the next line, and after the
 * goodbye closes it; walking off closes it too.
 *
 * ## And a voice
 *
 * With the voices on, each line is said as it appears — a babble in the
 * speaker's own voice, a child's, a woman's, an old man's (`voice.ts`) — and
 * the bubble types it out in step with the syllables. `E` during a line
 * finishes it at once; the next `E` goes on.
 */

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

/** Where a line is said, when it is said aloud at all. */
export interface TalkOptions {
  /**
   * The context and the node a voice joins (`Audio.bus`), or null while the
   * voices are off or the sound is not open yet: then a line appears whole.
   */
  voice?: () => { context: BaseAudioContext; node: AudioNode } | null;
}

/** One line of a conversation: what is said, and what it means. */
export interface Line {
  said: string;
  meant: string;
}

export interface Talk {
  /** Whether a bubble is up, or on its way up. */
  readonly open: boolean;
  /** Who is being talked to, or null. */
  readonly with: string | null;
  /** Starts a conversation with `key`, about `where`. */
  start(key: string, where: Where): void;
  /** The next line, or the end of the conversation after the last. */
  next(): void;
  close(): void;
  /**
   * Once a frame: puts the bubble over `crown` (a world point) as `camera`
   * sees it on a `width` by `height` view, or hides it where it is behind.
   */
  place(crown: THREE.Vector3, camera: THREE.Camera, width: number, height: number): void;
  /**
   * A conversation's lines for a person, without the page: what
   * `atlas.talk.script` shows. With no `memory`, as if to a stranger met for
   * the first time.
   */
  script(key: string, where: Where, memory?: Memory): Promise<Script>;
}

const STYLE = `
.atlas-bubble {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 5;
  max-width: min(340px, calc(100vw - 32px));
  padding: 10px 14px 9px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -100%) translate(var(--x), var(--y)) scale(0.92);
  transform-origin: 50% 100%;
  transition: opacity 0.15s ease;
  will-change: transform;
}
.atlas-bubble.on { opacity: 1; transform: translate(-50%, -100%) translate(var(--x), var(--y)); }
.atlas-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -11px;
  width: 14px;
  height: 14px;
  background: var(--ui-paper);
  border-right: 3px solid var(--ui-ink);
  border-bottom: 3px solid var(--ui-ink);
  transform: translateX(-50%) rotate(45deg);
}
.atlas-bubble .said { font-size: 17px; font-weight: 800; line-height: 1.3; }
/* The part of a line not yet said keeps its room, so the bubble does not grow as it types. */
.atlas-bubble .said .unsaid { visibility: hidden; }
.atlas-bubble .meant { margin-top: 4px; font-size: 12.5px; font-weight: 600; line-height: 1.3; color: var(--ui-muted); }
.atlas-bubble .foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-muted);
}
.atlas-bubble .foot .ui-kbd { height: 18px; min-width: 18px; font-size: 10px; margin-right: 4px; }
`;

/** How big a town has to be to be called a big city, and how small to be called small. */
const BIG_TOWN = 1_000_000;
const SMALL_TOWN = 30_000;
/** Under this many real km a landmark is "very close"; past this it is not worth the walk. */
const LANDMARK_NEAR_KM = 2;
const LANDMARK_FAR_KM = 3000;
/**
 * Over this many world units above the shelf a town is up in the hills: about
 * a third of `MAX_RELIEF`, which is where the biome's lapse starts turning a
 * temperate slope to rock.
 */
const HIGH_GROUND = 220;

/**
 * Who is talking. A child is one of the town's children, as the crowd dressed
 * them; the rest are drawn from the person's key, so the same stranger is the
 * same sort of person on every visit.
 */
export type Persona = 'child' | 'elder' | 'grumpy' | 'chatty' | 'plain';

/** How many of the adults are each kind, cumulatively: an eighth grumpy, a fifth old, a sixth chatty. */
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
 * the last conversation was about, and which variants of each line have been
 * said lately. It is what makes a second word with somebody an "again", keeps
 * two conversations in a row off the same subjects, and walks each key's
 * variants before any comes round a second time.
 */
export interface Memory {
  met: Map<string, number>;
  lastTopics: Set<string>;
  /** What each person has talked about already, which they do not come back to while they have anything else. */
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

/**
 * A person's conversation about `where`, in `language`, which is the one its
 * country speaks (`languageOf`); `capital` is the country's capital by
 * GeoNames if it has one. Pure but for `memory`, which it reads and then
 * writes what it said into, so `pnpm people` can hold every language to it
 * and a fresh memory gives the same conversation every time.
 */
export function compose(
  language: Language,
  capital: string | undefined,
  key: string,
  where: Where,
  memory: Memory = createMemory(),
): Script {
  const { alpha2 } = languageOf(where.iso);
  const persona = personaOf(key, where.young);
  const met = memory.met.get(key) ?? 0;
  memory.met.set(key, met + 1);
  // A second word with somebody is a new draw, not the first one again.
  const rng = rngFrom(key, 'talk', met);
  const facts = language.countries[where.iso];
  const locale = language.locale;

  // The values, once in the speaker's language and once in English.
  const native: Partial<Record<Placeholder, string>> = { town: where.town };
  const gloss: Partial<Record<Placeholder, string>> = { town: where.town };
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
  const eighthOf = (bearing: number): number => ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;

  /**
   * A variant of `k`: one of those said longest ago, or never, so a key's
   * variants all come round before any comes round twice.
   */
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
  const line = (keys: readonly LineKey[], bearing?: number): Line => {
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
    return { said: whole, meant: meaning === whole.replace(/[\u2068\u2069]/g, '') ? whole : meaning };
  };

  // Hello: again, to somebody met before; the child's and the grump's own;
  // anyone else's by the hour, and a welcome that names the town.
  const out: Line[] = [];
  if (met > 0) out.push(line(['again']));
  else if (persona === 'child') out.push(line(['childGreet']));
  else if (persona === 'grumpy') out.push(line(['grumpyGreet']));
  else out.push(line([greetingFor(where.hour), 'welcome']));

  // What is true here, and so could be said, and how likely each is.
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
  } else {
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
  }

  // A few of them, drawn by weight, leaving out what the last conversation
  // was about, and what this person has told you before, while there is
  // anything else to say.
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
  // A grown-up with something to say about the country says at least one of those things.
  // The line it gives way to is the plainest one drawn: never the person's
  // own kind of talk, nor a vehicle pointed out.
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
  for (const topic of chosen) out.push(line([topic.key], topic.bearing));

  out.push(line([persona === 'child' ? 'childBye' : persona === 'grumpy' ? 'grumpyBye' : 'bye']));
  return { language: language.name, locale, rtl: language.rtl === true, persona, topics: chosen.map((t) => t.key), lines: out };
}

/** The voice a persona speaks in: its age, and a grump's or a chatterbox's manner. */
function voiceFor(key: string, persona: Persona, woman: boolean): Voice {
  const age = persona === 'child' ? 'child' : persona === 'elder' ? 'elder' : 'adult';
  const mood = persona === 'grumpy' ? 'grumpy' : persona === 'chatty' ? 'chatty' : 'plain';
  return voiceOf(key, age, woman, mood);
}

export function createTalk(options: TalkOptions = {}): Talk {
  installUi();
  ensureStyle('atlas-talk', STYLE);
  const saidText = h('span');
  const unsaid = h('span', { class: 'unsaid', 'aria-hidden': 'true' });
  const said = h('div', { class: 'said' }, saidText, unsaid);
  const meant = h('div', { class: 'meant' });
  const speaks = h('span');
  const action = h('span');
  const foot = h('div', { class: 'foot' }, speaks, action);
  const bubble = h('div', { class: 'atlas-bubble ui-card', role: 'status', 'aria-live': 'polite' }, said, meant, foot);
  document.body.append(bubble);

  /** This session's conversations, which is all the townsfolk remember of you. */
  const memory = createMemory();
  let lines: Line[] = [];
  let at = 0;
  let who: string | null = null;
  /** The speaker's voice, the line being said, and when it began, from `performance.now()`. */
  let voice: Voice | null = null;
  let speech: Speech | null = null;
  let utterance: Utterance | null = null;
  let spokenAt = 0;
  /** The line's characters, and how many of them are showing. */
  let characters: string[] = [];
  let shown = 0;
  /** Bumped by every start and close, so a script that arrives late for a conversation already over is dropped. */
  let generation = 0;
  const projected = new THREE.Vector3();

  /** Shows the first `count` characters of the line and keeps the room of the rest. */
  function reveal(count: number): void {
    if (count === shown) return;
    shown = count;
    saidText.textContent = characters.slice(0, count).join('');
    unsaid.textContent = characters.slice(count).join('');
  }

  function hush(): void {
    utterance?.stop();
    utterance = null;
    speech = null;
  }

  function show(): void {
    const line = lines[at]!;
    hush();
    characters = Array.from(line.said);
    shown = -1;
    const out = voice === null ? null : options.voice?.() ?? null;
    if (out !== null && voice !== null) {
      speech = planSpeech(line.said, voice, `${who ?? ''}:${at}`);
      utterance = speak(out.context, out.node, speech, voice);
      spokenAt = performance.now() + SPEECH_LEAD * 1000;
      reveal(0);
    } else reveal(characters.length);
    // The whole line for a screen reader at once; the typing is for the eye.
    said.setAttribute('aria-label', line.said);
    meant.textContent = line.meant === line.said ? '' : line.meant;
    meant.hidden = line.meant === line.said;
    const last = at === lines.length - 1;
    action.replaceChildren(kbd(labelOf('use')), last ? 'Close' : 'Next');
    bubble.classList.add('on');
  }

  /**
   * The conversation's lines, composed once its words have arrived. `current`
   * says whether the conversation is still wanted by then: composing writes
   * the memory (who was met, what was told), so a conversation walked away
   * from while its language was loading must not be remembered as held.
   */
  async function script(
    key: string,
    where: Where,
    remembered: Memory = createMemory(),
    current: () => boolean = () => true,
  ): Promise<Script | null> {
    const [language, facts] = await Promise.all([
      loadLanguage(languageOf(where.iso).code),
      loadCountryFacts().catch(() => ({}) as Awaited<ReturnType<typeof loadCountryFacts>>),
    ]);
    if (!current()) return null;
    return compose(language, facts[where.iso]?.capital, key, where, remembered);
  }

  function close(): void {
    generation++;
    hush();
    who = null;
    lines = [];
    bubble.classList.remove('on');
  }

  return {
    get open() {
      return who !== null;
    },
    get with() {
      return who;
    },
    start(key, where) {
      const mine = ++generation;
      who = key;
      lines = [];
      bubble.classList.remove('on');
      script(key, where, memory, () => mine === generation)
        .then((result) => {
          if (result === null || mine !== generation) return;
          lines = result.lines;
          at = 0;
          voice = voiceFor(key, result.persona, where.woman === true);
          speaks.textContent = result.language;
          said.lang = result.locale;
          said.dir = result.rtl ? 'rtl' : 'ltr';
          show();
        })
        .catch((error: unknown) => {
          console.warn('talk: nothing to say', error);
          if (mine === generation) close();
        });
    },
    next() {
      // Still on its way: the key is not lost, it simply waits for the words.
      if (lines.length === 0) return;
      // Mid-line: the rest of it at once, and the next `E` goes on.
      if (shown < characters.length) {
        hush();
        reveal(characters.length);
        return;
      }
      if (at >= lines.length - 1) {
        close();
        return;
      }
      at++;
      show();
    },
    close,
    place(crown, camera, width, height) {
      if (who === null || lines.length === 0) return;
      if (speech !== null) {
        reveal(revealed(speech, (performance.now() - spokenAt) / 1000));
        if (shown >= characters.length) speech = null;
      }
      projected.copy(crown).project(camera);
      const behind = projected.z > 1 || projected.z < -1;
      bubble.style.visibility = behind ? 'hidden' : '';
      if (behind) return;
      // Clear of the head by a few pixels, and kept on the screen.
      const x = THREE.MathUtils.clamp((projected.x + 1) * 0.5 * width, 16, width - 16);
      const y = THREE.MathUtils.clamp((1 - projected.y) * 0.5 * height - 14, 60, height);
      bubble.style.setProperty('--x', `${x.toFixed(1)}px`);
      bubble.style.setProperty('--y', `${y.toFixed(1)}px`);
    },
    // Nothing to cancel from the console: the script is always wanted.
    script: (key, where, memory) => script(key, where, memory).then((result) => result!),
  };
}
