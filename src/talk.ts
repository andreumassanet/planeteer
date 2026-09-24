import * as THREE from 'three';
import { loadCountryFacts } from './country-facts.ts';
import { labelOf } from './controls.ts';
import { ensureStyle, fold, h, installUi, kbd } from './ui.ts';
import { rngFrom } from './scenery/random.ts';
import type { Language, LineKey, Placeholder } from './phrases.ts';

/**
 * Talking to the townsfolk: `E` beside somebody standing in a town, and they
 * stop, turn to you and say something, in the language of the country they
 * live in, with the English under it.
 *
 * ## What they say is about where they are
 *
 * A conversation is a greeting for the hour it is where they stand, a welcome
 * that names the town, three things about the place, and a goodbye. The three
 * are drawn, per person, from what is true here: whether the town is the
 * country's capital or what the capital is, how big it is built, whether it
 * is by the water, the nearest landmark with its distance and its compass
 * direction, the weather its biome and its clock say, the country itself, or
 * a question for the stranger. Two people in one square say different things
 * and the same person says the same things twice, because the draw is seeded
 * by who they are.
 *
 * ## The words arrive on the first conversation
 *
 * The tables are `phrases.ts`, thirty-one languages of them, and nothing in
 * the world's first load carries them: the first `E` imports them and fetches
 * the country facts (the capital), and the bubble opens when both are in. The
 * facts are the same file the border card reads, fetched once.
 *
 * ## A bubble over the head, in the card language
 *
 * The line is a small card over the speaker, placed each frame by projecting
 * their crown, so it stays with them as the camera turns; it hides while they
 * are behind the camera. `E` again goes to the next line, and after the
 * goodbye closes it; walking off closes it too.
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
  /** The local hour, 0 to 23, on the clock the chip shows. */
  hour: number;
  /** The nearest landmark, how far in real km, and which way from north, clockwise, in radians. */
  landmark: { name: string; km: number; bearing: number } | null;
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
  /** A conversation's lines for a person, without the page: what `atlas.talk.script` shows. */
  script(key: string, where: Where): Promise<Script>;
}

/** A conversation, as said: in which language, and its lines. */
export interface Script {
  language: string;
  locale: string;
  rtl: boolean;
  lines: Line[];
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
/** How many things about the place a conversation says between the welcome and the goodbye. */
const TOPICS = 3;

/** The part of the day an hour is in, as the greeting that goes with it. */
function greetingFor(hour: number): LineKey {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

type Phrases = typeof import('./phrases.ts');

/**
 * A person's conversation about `where`, in the language of its country:
 * `phrases` is the module, `capital` the country's capital by GeoNames if it
 * has one. Pure, so `pnpm people` can hold every language to it.
 */
export function compose(module: Phrases, capital: string | undefined, key: string, where: Where): Script {
  const { language, alpha2 } = module.languageOf(where.iso);
  const english = module.LANGUAGES.en!;
  const rng = rngFrom(key, 'talk');

  // The values, once in the speaker's language and once in English.
  const valuesFor = (lang: Language): Partial<Record<Placeholder, string>> => {
    const values: Partial<Record<Placeholder, string>> = { town: where.town };
    let country = where.countryName;
    // The country as its own people call it; in English, the outlines' name.
    if (alpha2 !== '' && (lang !== english || country === '')) {
      try {
        country = new Intl.DisplayNames([lang.locale], { type: 'region' }).of(alpha2) ?? country;
      } catch {
        // An engine with no display names keeps the English one.
      }
    }
    if (country !== '') values.country = country;
    if (capital !== undefined) values.capital = capital;
    if (where.landmark !== null) {
      values.landmark = where.landmark.name;
      let km = String(Math.round(where.landmark.km));
      try {
        km = new Intl.NumberFormat(lang.locale, { maximumFractionDigits: 0 }).format(where.landmark.km);
      } catch {
        // As above.
      }
      values.km = km;
      const eighth = ((Math.round(where.landmark.bearing / (Math.PI / 4)) % 8) + 8) % 8;
      values.dir = lang.compass[eighth]!;
    }
    return values;
  };
  const native = valuesFor(language);
  const gloss = valuesFor(english);
  const line = (keys: readonly (readonly [LineKey, number])[]): Line => ({
    said: keys.map(([k, i]) => module.fill(language.lines[k][i]!, native)).join(language.join),
    meant: keys.map(([k, i]) => module.fill(english.lines[k][i]!, gloss, false)).join(' '),
  });
  const pick = (k: LineKey): readonly [LineKey, number] => [k, rng.int(english.lines[k].length)];

  const out: Line[] = [line([[greetingFor(where.hour), 0], pick('welcome')])];
  // What is true here, and so could be said.
  const topics: (readonly [LineKey, number])[] = [];
  if (where.capital || (capital !== undefined && fold(capital) === fold(where.town))) topics.push(['capitalHere', 0]);
  else if (capital !== undefined) topics.push(['capitalThere', 0]);
  topics.push([where.population >= BIG_TOWN ? 'big' : where.population < SMALL_TOWN ? 'small' : 'middling', 0]);
  topics.push([where.coastal ? 'coast' : 'inland', 0]);
  if (where.landmark !== null && where.landmark.km < LANDMARK_FAR_KM) {
    topics.push([where.landmark.km < LANDMARK_NEAR_KM ? 'landmarkNear' : 'landmark', 0]);
  }
  const late = where.hour >= 22 || where.hour < 5;
  topics.push([late ? 'late' : where.warmth > 0.7 ? 'hot' : where.warmth < 0.3 ? 'cold' : 'mild', 0]);
  if (native.country !== undefined && gloss.country !== undefined) topics.push(['country', 0]);
  topics.push(pick('chat'));
  // A few of them, in an order of this person's own.
  for (let i = topics.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [topics[i], topics[j]] = [topics[j]!, topics[i]!];
  }
  for (const topic of topics.slice(0, TOPICS)) out.push(line([topic]));
  out.push(line([['bye', 0]]));
  return { language: language.name, locale: language.locale, rtl: language.rtl === true, lines: out };
}

export function createTalk(): Talk {
  installUi();
  ensureStyle('atlas-talk', STYLE);
  const said = h('div', { class: 'said' });
  const meant = h('div', { class: 'meant' });
  const speaks = h('span');
  const action = h('span');
  const foot = h('div', { class: 'foot' }, speaks, action);
  const bubble = h('div', { class: 'atlas-bubble ui-card', role: 'status', 'aria-live': 'polite' }, said, meant, foot);
  document.body.append(bubble);

  let phrases: Promise<Phrases> | null = null;
  let lines: Line[] = [];
  let at = 0;
  let who: string | null = null;
  /** Bumped by every start and close, so a script that arrives late for a conversation already over is dropped. */
  let generation = 0;
  const projected = new THREE.Vector3();

  function show(): void {
    const line = lines[at]!;
    said.textContent = line.said;
    meant.textContent = line.meant === line.said ? '' : line.meant;
    meant.hidden = line.meant === line.said;
    const last = at === lines.length - 1;
    action.replaceChildren(kbd(labelOf('use')), last ? 'Close' : 'Next');
    bubble.classList.add('on');
  }

  async function script(key: string, where: Where): Promise<Script> {
    phrases ??= import('./phrases.ts');
    const [module, facts] = await Promise.all([
      phrases,
      loadCountryFacts().catch(() => ({}) as Awaited<ReturnType<typeof loadCountryFacts>>),
    ]);
    return compose(module, facts[where.iso]?.capital, key, where);
  }

  function close(): void {
    generation++;
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
      script(key, where)
        .then((result) => {
          if (mine !== generation) return;
          lines = result.lines;
          at = 0;
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
    script,
  };
}
