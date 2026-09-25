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
  { name: 'landmark', usage: '', help: 'Point at the nearest landmark you have not found', aliases: ['next'] },
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
 * What `/goto` would offer for a query, best first: the countries, the built
 * towns and the names folded into them, scored as `findPlace` scores them —
 * whole name, then its start, then a word's start, then inside it — then
 * a town's own name before a name folded into a bigger one, then the bigger
 * place, a country counting as its seat's size (a whole name that is a
 * country's is the country, as there). One row a name; `countryName`
 * says whose it is.
 */
export function suggestPlaces(
  query: string,
  gazetteer: Gazetteer,
  countryName: (iso: string) => string,
  limit = SUGGEST_LIMIT,
): { name: string; detail: string }[] {
  const folded = fold(query.trim());
  if (folded === '') return [];
  const scored: { entry: FoldedEntry; score: number }[] = [];
  for (const entry of indexOf(gazetteer)) {
    const s = scoreFolded(entry.folded, entry.words, folded);
    if (s > 0) scored.push({ entry, score: s });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.score === 4 ? Number(b.entry.country === true) - Number(a.entry.country === true) : 0) ||
      Number(a.entry.via !== undefined && a.entry.country !== true) - Number(b.entry.via !== undefined && b.entry.country !== true) ||
      b.entry.place.pop - a.entry.place.pop,
  );
  const out: { name: string; detail: string }[] = [];
  const taken = new Set<string>();
  for (const { entry } of scored) {
    if (out.length >= limit) break;
    if (taken.has(entry.folded)) continue;
    taken.add(entry.folded);
    const country = countryName(entry.place.iso);
    const detail = entry.country === true
      ? `Country · ${entry.place.name}`
      : entry.via !== undefined && fold(entry.via) !== fold(entry.place.name)
        ? `${entry.place.name}, ${country}`
        : country;
    out.push({ name: entry.name, detail });
  }
  return out;
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

function seatOf(iso: string, gazetteer: Gazetteer): Place | null {
  let seat: Place | null = null;
  for (const place of gazetteer.places) {
    if (place.iso === iso && isShown(place) && (seat === null || betterSeat(place, seat))) seat = place;
  }
  return seat;
}

/**
 * The best match for a name, scored as the menu's search scores it — a name
 * that starts with the query beats a word in it, which beats a substring —
 * over the built towns and the names folded into them, ties to the bigger
 * place. A country that matches at least as well is its capital, or its
 * biggest built town where the capital is not built, because a country is
 * somewhere to arrive and not a point.
 */
export function findPlace(query: string, gazetteer: Gazetteer): Found | null {
  const folded = fold(query.trim());
  if (folded === '') return null;
  const score = (name: string): number => {
    const candidate = fold(name);
    return scoreFolded(candidate, candidate.split(/[\s\-']+/), folded);
  };
  let best: { place: Place; score: number; via?: string } | null = null;
  const offer = (place: Place, s: number, via?: string): void => {
    if (s === 0) return;
    if (best === null || s > best.score || (s === best.score && place.pop > best.place.pop)) {
      best = via === undefined ? { place, score: s } : { place, score: s, via };
    }
  };
  for (const place of gazetteer.places) if (isShown(place)) offer(place, score(place.name));
  for (const [alias, index] of gazetteer.aliases) {
    const place = gazetteer.places[index];
    if (place !== undefined) offer(place, score(alias), alias);
  }
  const town = best as { place: Place; score: number; via?: string } | null;
  // A country wins a tie with any town: "Georgia" is the country.
  let country: { iso: string; name: string; score: number } | null = null;
  for (const candidate of gazetteer.countries) {
    const s = score(candidate.name);
    if (s > 0 && (country === null || s > country.score)) country = { ...candidate, score: s };
  }
  if (country !== null && (town === null || country.score >= town.score)) {
    const seat = seatOf(country.iso, gazetteer);
    if (seat !== null) return { lat: seat.lat, lon: seat.lon, name: seat.name, iso: seat.iso, via: country.name };
  }
  if (town === null) return null;
  const found: Found = { lat: town.place.lat, lon: town.place.lon, name: town.place.name, iso: town.place.iso };
  if (town.via !== undefined && fold(town.via) !== fold(town.place.name)) found.via = town.via;
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
