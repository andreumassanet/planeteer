/**
 * The chat's words, without the page: which commands there are, how a typed
 * line is read as one, what `Tab` completes it to, how `/goto` finds a place
 * and `/time` an hour, and how `/me` is shown. `chat.ts` is the panel that
 * uses them, and `scripts/check-chat.ts` holds every one of them to its
 * examples under Node, which is why nothing here touches the DOM.
 *
 * What a line *is* — how long, which characters, how often — is not here:
 * it is `cleanChat` and `spendChat` in `server/src/limits.ts`, the one
 * definition the relay reads as well.
 */
import { fold } from './ui.ts';
import { isShown } from './places.ts';
import type { Place } from './places.ts';

/** One command: its name, what follows it, and a line of help. */
export interface CommandSpec {
  name: string;
  /** What comes after the name, as the help shows it; `''` for nothing. */
  usage: string;
  help: string;
  /** Other names typed for it. */
  aliases?: readonly string[];
  /** What the argument is, for the suggestions offered while it is typed. */
  argument?: ArgumentKind;
}

/**
 * What a command's argument is drawn from: the players online, the built
 * towns and the countries, the words `/time` knows, the weathers.
 */
export type ArgumentKind = 'player' | 'place' | 'time' | 'weather';

/** Every command, in the order `/help` lists them. */
export const COMMANDS: readonly CommandSpec[] = [
  { name: 'help', usage: '', help: 'What you can type here', aliases: ['?', 'commands'] },
  { name: 'goto', usage: '<town, country or lat,lon>', help: 'Go straight there', aliases: ['go', 'travel'], argument: 'place' },
  { name: 'home', usage: '', help: 'Back where you started', aliases: ['spawn'] },
  { name: 'where', usage: '', help: 'Where you are standing', aliases: ['here'] },
  { name: 'time', usage: '<HH:MM · day · night · dawn · dusk · real>', help: 'Set the sun', argument: 'time' },
  { name: 'weather', usage: '<clear · rain · storm · snow · fog · auto>', help: 'Set the weather', argument: 'weather' },
  { name: 'who', usage: '', help: 'Who is online, and where', aliases: ['online', 'players'] },
  { name: 'tp', usage: '<player>', help: 'Go to another player', aliases: ['join'], argument: 'player' },
  { name: 'me', usage: '<action>', help: 'Say what you are doing: /me waves hello' },
  { name: 'wave', usage: '', help: 'Wave' },
  { name: 'dance', usage: '', help: 'Dance until you move' },
  { name: 'photo', usage: '', help: 'Save a photo of the world', aliases: ['screenshot'] },
  { name: 'mute', usage: '<player>', help: 'Hide what a player says, until you reload', argument: 'player' },
  { name: 'unmute', usage: '<player>', help: 'Show what they say again', argument: 'player' },
  { name: 'clear', usage: '', help: 'Empty the chat' },
];

const byName = new Map<string, CommandSpec>();
for (const command of COMMANDS) {
  byName.set(command.name, command);
  for (const alias of command.aliases ?? []) byName.set(alias, command);
}

/** A typed line read as a command: which one, as typed and as known, and the rest trimmed. */
export interface ParsedCommand {
  /** The name as typed, lower-case, without the slash. */
  typed: string;
  /** The command it names, or null for one nobody knows. */
  command: CommandSpec | null;
  args: string;
}

/**
 * A line that starts with `/` is a command; anything else is a message and
 * this is null. `//` escapes it: `//shrug` is sent as `/shrug`, which
 * `unescapeSlash` gives back.
 */
export function parseCommand(line: string): ParsedCommand | null {
  const text = line.trim();
  if (!text.startsWith('/') || text.startsWith('//')) return null;
  const match = /^\/(\S*)\s*(.*)$/su.exec(text);
  const typed = (match?.[1] ?? '').toLowerCase();
  return { typed, command: byName.get(typed) ?? null, args: (match?.[2] ?? '').trim() };
}

/** A message typed as `//…` is sent with one slash. */
export const unescapeSlash = (line: string): string => (line.trimStart().startsWith('//') ? line.trimStart().slice(1) : line);

/** The name a `/me` line was sent with, and what it says they do, or null for a plain line. */
export function actionOf(message: string): string | null {
  const match = /^\/me\s+(.+)$/su.exec(message);
  return match === null ? null : match[1]!;
}

/* ------------------------------------------------------------------------- *
 * Suggestions
 * ------------------------------------------------------------------------- */

/** One row of the list over the field: what accepting it writes, and how it is shown. */
export interface Suggestion {
  /** The whole line accepting it leaves in the field. */
  line: string;
  /** The command's name with its slash, or the argument as it would be written. */
  label: string;
  /** What the command takes, greyed after its name; `''` for an argument. */
  usage: string;
  /** One line about it: a command's help, a town's country. */
  detail: string;
  /** What the field shows greyed after the typed text while this row is chosen. */
  ghost: string;
  /** Accepting it finishes the line, so `Enter` sends it as well. */
  done: boolean;
}

/** The list for a line, and the ghost to show when the list is empty. */
export interface Suggestions {
  items: Suggestion[];
  /** The rest of the usage while no row stands for it: `/me ` shows `<action>`. */
  ghost: string;
}

/** Where the suggestions draw their arguments from. */
export interface SuggestSources {
  /** The names of the players online. */
  players: readonly string[];
  /** The towns and countries a `/goto` would find, best first; asked only after `/goto `. */
  places?(query: string, limit: number): readonly { name: string; detail: string }[];
}

/** How many rows the list shows at most. */
export const SUGGEST_LIMIT = 8;

/** The words `/time` offers, in the order of a day, with what each is. */
const TIME_WORDS: readonly (readonly [string, string])[] = [
  ['dawn', '06:00'],
  ['morning', '09:00'],
  ['noon', '12:00'],
  ['afternoon', '15:30'],
  ['dusk', '19:30'],
  ['night', '23:00'],
  ['midnight', '00:00'],
  ['real', 'The real sun again'],
];

/** What each weather `/weather` takes is, for its row. */
const WEATHER_WORDS: Readonly<Record<WeatherWanted, string>> = {
  clear: 'Clear skies',
  rain: 'Rain where you stand',
  storm: 'Thunder and lightning',
  snow: 'Snow, where it is cold enough',
  fog: 'A close haze',
  auto: 'The world’s own weather again',
};

/** `typed` read as the start of `whole`, with the rest of `whole` as the ghost; `''` when it is not. */
function rest(typed: string, whole: string): string {
  return fold(whole).startsWith(fold(typed)) ? whole.slice(typed.length) : '';
}

/**
 * The list a line offers as it is typed, as a game's console offers it: the
 * commands that begin with what follows the slash, each with its usage and
 * help, and once the command is written out, the arguments it takes — the
 * players online for `/tp` and `/mute`, the towns and countries for `/goto`,
 * the words for `/time` and `/weather` — that begin with what is typed,
 * then those with it inside. Empty for a line that is not a command.
 */
export function suggest(line: string, sources: SuggestSources): Suggestions {
  const none: Suggestions = { items: [], ghost: '' };
  if (!line.startsWith('/') || line.startsWith('//')) return none;
  const space = line.search(/\s/);
  if (space < 0) {
    const typed = line.slice(1).toLowerCase();
    const starts: CommandSpec[] = [];
    const aliased: CommandSpec[] = [];
    for (const command of COMMANDS) {
      if (command.name.startsWith(typed)) starts.push(command);
      else if ((command.aliases ?? []).some((alias) => alias.startsWith(typed))) aliased.push(command);
    }
    const items = [...starts, ...aliased].map((command): Suggestion => {
      const usage = command.usage === '' ? '' : ` ${command.usage}`;
      const tail = command.name.startsWith(typed) ? command.name.slice(typed.length) : '';
      return {
        line: `/${command.name}${usage === '' ? '' : ' '}`,
        label: `/${command.name}`,
        usage: command.usage,
        detail: command.help,
        ghost: tail === '' && typed !== command.name ? '' : `${tail}${usage}`,
        done: command.usage === '',
      };
    });
    return { items, ghost: '' };
  }
  const parsed = parseCommand(line);
  const command = parsed?.command ?? null;
  if (parsed === null || command === null) return none;
  const args = line.slice(space).trimStart();
  const typedHead = line.slice(0, line.length - args.length);
  const usage = args === '' ? command.usage : '';
  let rows: { value: string; detail: string }[] = [];
  switch (command.argument) {
    case 'player': {
      const names = [...new Set(sources.players)];
      const query = fold(args);
      const starts = names.filter((name) => fold(name).startsWith(query));
      const inside = query === '' ? [] : names.filter((name) => !fold(name).startsWith(query) && fold(name).includes(query));
      rows = [...starts, ...inside].map((name) => ({ value: name, detail: 'Online' }));
      break;
    }
    case 'place':
      rows = args === '' || parseLatLon(args) !== null || sources.places === undefined
        ? []
        : sources.places(args, SUGGEST_LIMIT).map((found) => ({ value: found.name, detail: found.detail }));
      break;
    case 'time': {
      const query = args.toLowerCase();
      rows = TIME_WORDS.filter(([word]) => word.startsWith(query)).map(([word, detail]) => ({ value: word, detail }));
      break;
    }
    case 'weather': {
      const query = args.toLowerCase();
      rows = WEATHERS.filter((word) => word.startsWith(query)).map((word) => ({ value: word, detail: WEATHER_WORDS[word] }));
      break;
    }
    default:
      rows = [];
  }
  const items = rows.slice(0, SUGGEST_LIMIT).map(
    (row): Suggestion => ({
      line: `${typedHead}${row.value}`,
      label: row.value,
      usage: '',
      detail: row.detail,
      ghost: rest(args, row.value),
      done: true,
    }),
  );
  // What is typed already is the whole of the one row: nothing to offer.
  if (items.length === 1 && fold(items[0]!.label) === fold(args)) return { items: [], ghost: '' };
  return { items, ghost: usage };
}

/** Folded names, built once a gazetteer: 29,651 folds a keystroke would be felt. */
interface FoldedEntry {
  folded: string;
  words: string[];
  name: string;
  place: Place;
  /** The alias or country it was found by, or undefined for the place's own name. */
  via?: string;
  country?: boolean;
}
const foldedIndex = new WeakMap<Gazetteer, FoldedEntry[]>();

function indexOf(gazetteer: Gazetteer): FoldedEntry[] {
  let entries = foldedIndex.get(gazetteer);
  if (entries !== undefined) return entries;
  entries = [];
  const entry = (name: string, place: Place, via?: string, country?: boolean): FoldedEntry => {
    const folded = fold(name);
    const made: FoldedEntry = { folded, words: folded.split(/[\s\-']+/), name, place };
    if (via !== undefined) made.via = via;
    if (country === true) made.country = true;
    return made;
  };
  for (const place of gazetteer.places) if (isShown(place)) entries.push(entry(place.name, place));
  for (const [alias, index] of gazetteer.aliases) {
    const place = gazetteer.places[index];
    if (place !== undefined) entries.push(entry(alias, place, alias));
  }
  const seats = new Map<string, Place>();
  for (const place of gazetteer.places) {
    if (!isShown(place)) continue;
    const seat = seats.get(place.iso);
    if (seat === undefined || betterSeat(place, seat)) seats.set(place.iso, place);
  }
  for (const country of gazetteer.countries) {
    const seat = seats.get(country.iso);
    if (seat !== undefined) entries.push(entry(country.name, seat, country.name, true));
  }
  foldedIndex.set(gazetteer, entries);
  return entries;
}

/**
 * A typed `/goto` split into the name and, after a comma, the country it is
 * in: `Toledo, Spain`, `toledo, es`, `Cuenca,ESP`. The country is folded and
 * kept only when one of the gazetteer's countries answers to it — its name's
 * start or its outline code — so a comma inside a name is still a name.
 */
function splitQualifier(query: string, gazetteer: Gazetteer): { name: string; isos: Set<string> | null } {
  const comma = query.lastIndexOf(',');
  if (comma < 0) return { name: fold(query.trim()), isos: null };
  const name = fold(query.slice(0, comma).trim());
  const wanted = fold(query.slice(comma + 1).trim());
  if (name === '' || wanted === '') return { name: fold(query.trim()), isos: null };
  const isos = new Set<string>();
  for (const country of gazetteer.countries) {
    if (fold(country.iso) === wanted || fold(country.name).startsWith(wanted)) isos.add(country.iso);
  }
  return isos.size === 0 ? { name: fold(query.trim()), isos: null } : { name, isos };
}

/**
 * The order both `/goto` and its suggestions rank by: how well the name
 * matches (whole, start, a word's start, inside); on a whole name a country
 * first ("Georgia" is the country); a town's own name before a name folded
 * into a bigger one, because the host's population is not the alias's — a
 * suburb of Bogotá called Madrid outweighed Madrid by Bogotá's; then the
 * country the player stands in, so `/goto Toledo` from Spain is Spain's; then
 * the bigger place.
 */
function rank(prefer: string | undefined) {
  const folded = (entry: FoldedEntry): number => Number(entry.via !== undefined && entry.country !== true);
  return (a: { entry: FoldedEntry; score: number }, b: { entry: FoldedEntry; score: number }): number =>
    b.score - a.score ||
    (a.score === 4 ? Number(b.entry.country === true) - Number(a.entry.country === true) : 0) ||
    folded(a.entry) - folded(b.entry) ||
    (prefer === undefined ? 0 : Number(b.entry.place.iso === prefer) - Number(a.entry.place.iso === prefer)) ||
    b.entry.place.pop - a.entry.place.pop;
}

/** Every entry the query names, ranked, a qualifying country applied. */
function matches(query: string, gazetteer: Gazetteer, prefer: string | undefined): { entry: FoldedEntry; score: number }[] {
  const { name, isos } = splitQualifier(query, gazetteer);
  if (name === '') return [];
  const scored: { entry: FoldedEntry; score: number }[] = [];
  for (const entry of indexOf(gazetteer)) {
    if (isos !== null && (entry.country === true || !isos.has(entry.place.iso))) continue;
    const s = scoreFolded(entry.folded, entry.words, name);
    if (s > 0) scored.push({ entry, score: s });
  }
  return scored.sort(rank(prefer));
}

/**
 * What `/goto` would offer for a query, best first, in `findPlace`'s order.
 * One row a name and country: the first row of a name is offered bare, as
 * the bare name finds it, and the rest as `Toledo, Spain`, which is what Tab
 * fills in and what `findPlace` reads back, so picking a row goes to that row.
 */
export function suggestPlaces(
  query: string,
  gazetteer: Gazetteer,
  countryName: (iso: string) => string,
  limit = SUGGEST_LIMIT,
  prefer?: string,
): { name: string; detail: string }[] {
  const rows: { entry: FoldedEntry }[] = [];
  const taken = new Set<string>();
  for (const match of matches(query, gazetteer, prefer)) {
    if (rows.length >= limit) break;
    const key = `${match.entry.folded}|${match.entry.country === true ? '' : match.entry.place.iso}`;
    if (taken.has(key)) continue;
    taken.add(key);
    rows.push(match);
  }
  // The first row of a name is what the bare name finds; the rest say whose.
  const firsts = new Set<string>();
  return rows.map(({ entry }) => {
    const country = countryName(entry.place.iso);
    const shared = entry.country !== true && firsts.has(entry.folded);
    if (entry.country !== true) firsts.add(entry.folded);
    const folded = entry.via !== undefined && fold(entry.via) !== fold(entry.place.name);
    const detail = entry.country === true
      ? `Country · ${entry.place.name}`
      : folded
        ? shared ? `In ${entry.place.name}` : `${entry.place.name}, ${country}`
        : shared ? '' : country;
    return { name: shared ? `${entry.name}, ${country}` : entry.name, detail };
  });
}

/**
 * The player a typed name means: the one whose name it is, folded, else the
 * only one it starts, else the only one it is inside. Null for none or for
 * more than one, which the caller says as such.
 */
export function matchPlayer<T extends { name: string }>(typed: string, players: readonly T[]): T | null {
  const query = fold(typed.trim());
  if (query === '') return null;
  const exact = players.filter((player) => fold(player.name) === query);
  if (exact.length > 0) return exact[0]!;
  const starts = players.filter((player) => fold(player.name).startsWith(query));
  if (starts.length === 1) return starts[0]!;
  if (starts.length > 1) return null;
  const inside = players.filter((player) => fold(player.name).includes(query));
  return inside.length === 1 ? inside[0]! : null;
}

/* ------------------------------------------------------------------------- *
 * Where /goto goes
 * ------------------------------------------------------------------------- */

/** `48.86, 2.29`, `48.86 2.29` or `-33.9,151.2`: a point, or null. */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (match === null) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** A place `/goto` found: where it is, what it is called, and the name that found it. */
export interface Found {
  lat: number;
  lon: number;
  name: string;
  /** The outline code of its country. */
  iso: string;
  /** The name that matched, when it is not `name`: an alias, or the country for its capital. */
  via?: string;
}

/** What `/goto` searches: the gazetteer, the names folded into it, and the countries. */
export interface Gazetteer {
  places: readonly Place[];
  /** `Places.aliases()`: a name as written to the index of the built town it stands for. */
  aliases: ReadonlyMap<string, number>;
  countries: readonly { iso: string; name: string }[];
}

/**
 * How well a folded query names a folded candidate: 4 for the whole name, 3
 * for its start, 2 for a word's start, 1 for anywhere inside past two
 * letters, 0 for not at all.
 */
function scoreFolded(candidate: string, words: readonly string[], query: string): number {
  if (candidate === query) return 4;
  if (candidate.startsWith(query)) return 3;
  if (words.some((word) => word.startsWith(query))) return 2;
  return query.length > 2 && candidate.includes(query) ? 1 : 0;
}

/** A country is arrived at in its capital, or in its biggest built town where the capital is not built. */
const betterSeat = (place: Place, seat: Place): boolean =>
  (place.capital === true && seat.capital !== true) || (place.capital === seat.capital && place.pop > seat.pop);

/**
 * The best match for a name, in `matches`' order, over the built towns, the
 * names folded into them and the countries. A country is its capital, or its
 * biggest built town where the capital is not built, because a country is
 * somewhere to arrive and not a point. `others` are the other countries a
 * town of the very same name stands in, for the caller to mention.
 */
export function findPlace(
  query: string,
  gazetteer: Gazetteer,
  prefer?: string,
): (Found & { others: string[] }) | null {
  const ranked = matches(query, gazetteer, prefer);
  const best = ranked[0];
  if (best === undefined) return null;
  const { entry } = best;
  const found: Found & { others: string[] } = { lat: entry.place.lat, lon: entry.place.lon, name: entry.place.name, iso: entry.place.iso, others: [] };
  if (entry.via !== undefined && fold(entry.via) !== fold(entry.place.name)) found.via = entry.via;
  if (entry.country !== true) {
    for (const { entry: other, score } of ranked) {
      if (score !== best.score || other.folded !== entry.folded || other.country === true) continue;
      if (other.place.iso !== entry.place.iso && !found.others.includes(other.place.iso)) found.others.push(other.place.iso);
    }
  }
  return found;
}

/* ------------------------------------------------------------------------- *
 * /time
 * ------------------------------------------------------------------------- */

/** An hour to put the sun at, local to where you stand, or the real clock back. */
export type ClockWanted = { hour: number } | 'real';

/** The words `/time` takes, as hours on the local clock. */
const TIMES: Readonly<Record<string, number>> = {
  dawn: 6,
  sunrise: 6.5,
  morning: 9,
  day: 12,
  noon: 12,
  midday: 12,
  afternoon: 15.5,
  dusk: 19.5,
  sunset: 19.5,
  evening: 20.5,
  night: 23,
  midnight: 0,
};

/**
 * `18:30`, `7`, `7pm`, `12am`, a word from `TIMES`, or `real` (`live`, `now`)
 * for the real clock; null for anything else.
 */
export function parseClock(text: string): ClockWanted | null {
  const word = text.trim().toLowerCase();
  if (word === 'real' || word === 'live' || word === 'now' || word === 'auto') return 'real';
  const named = TIMES[word];
  if (named !== undefined) return { hour: named };
  const match = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/.exec(word);
  if (match === null) return null;
  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (minutes > 59) return null;
  if (match[3] !== undefined) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (match[3] === 'pm' ? 12 : 0);
  } else if (hours > 24 || (hours === 24 && minutes > 0)) return null;
  return { hour: (hours % 24) + minutes / 60 };
}

/** The weathers `/weather` asks for; `auto` hands it back. */
export const WEATHERS = ['clear', 'rain', 'storm', 'snow', 'fog', 'auto'] as const;
export type WeatherWanted = (typeof WEATHERS)[number];

export function parseWeather(text: string): WeatherWanted | null {
  const word = text.trim().toLowerCase();
  const synonyms: Record<string, WeatherWanted> = { sun: 'clear', sunny: 'clear', thunder: 'storm', mist: 'fog', real: 'auto', live: 'auto' };
  const wanted = synonyms[word] ?? word;
  return (WEATHERS as readonly string[]).includes(wanted) ? (wanted as WeatherWanted) : null;
}
