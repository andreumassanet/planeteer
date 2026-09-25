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
  /** What `Tab` completes the argument from: the players online. */
  argument?: 'player';
}

/** Every command, in the order `/help` lists them. */
export const COMMANDS: readonly CommandSpec[] = [
  { name: 'help', usage: '', help: 'What you can type here', aliases: ['?', 'commands'] },
  { name: 'goto', usage: '<town, country or lat,lon>', help: 'Go straight there', aliases: ['go', 'travel'] },
  { name: 'home', usage: '', help: 'Back where you started', aliases: ['spawn'] },
  { name: 'where', usage: '', help: 'Where you are standing', aliases: ['here'] },
  { name: 'landmark', usage: '', help: 'Point at the nearest landmark you have not found', aliases: ['next'] },
  { name: 'time', usage: '<HH:MM · day · night · dawn · dusk · real>', help: 'Set the sun' },
  { name: 'weather', usage: '<clear · rain · storm · snow · fog · auto>', help: 'Set the weather' },
  { name: 'who', usage: '', help: 'Who is online, and where', aliases: ['online', 'players'] },
  { name: 'tp', usage: '<player>', help: 'Go to another player', aliases: ['join'], argument: 'player' },
  { name: 'me', usage: '<action>', help: 'Say what you are doing: /me waves hello' },
  { name: 'wave', usage: '', help: 'Wave' },
  { name: 'dance', usage: '', help: 'Dance until you move' },
  { name: 'sit', usage: '', help: 'Sit down until you move' },
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
 * Tab
 * ------------------------------------------------------------------------- */

/** The longest start every string in `words` shares, compared folded. */
function sharedStart(words: readonly string[]): string {
  if (words.length === 0) return '';
  let end = words[0]!.length;
  for (const word of words) {
    let i = 0;
    while (i < end && i < word.length && fold(word[i]!) === fold(words[0]![i]!)) i++;
    end = i;
  }
  return words[0]!.slice(0, end);
}

/** What `Tab` gives for a line, and the choices it had, which the panel lists when there are several. */
export interface Completion {
  line: string;
  choices: string[];
}

/**
 * `Tab` in the field: the command's name while the line is `/` and part of
 * one, and a player's name after a command that takes one. One choice is
 * written out whole with a space after it; several give their shared start,
 * and the choices to show. Null where there is nothing to complete.
 */
export function complete(line: string, players: readonly string[]): Completion | null {
  if (!line.startsWith('/')) return null;
  const space = line.indexOf(' ');
  if (space < 0) {
    const typed = line.slice(1).toLowerCase();
    const names = COMMANDS.map((command) => command.name).filter((name) => name.startsWith(typed));
    if (names.length === 0) return null;
    if (names.length === 1) return { line: `/${names[0]} `, choices: names };
    return { line: `/${sharedStart(names) || typed}`, choices: names };
  }
  const parsed = parseCommand(line);
  if (parsed?.command?.argument !== 'player') return null;
  const typed = fold(parsed.args);
  const names = [...new Set(players)].filter((name) => fold(name).startsWith(typed));
  if (names.length === 0) return null;
  const head = line.slice(0, space + 1);
  if (names.length === 1) return { line: `${head}${names[0]} `, choices: names };
  return { line: `${head}${sharedStart(names) || parsed.args}`, choices: names };
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
    if (candidate === folded) return 4;
    if (candidate.startsWith(folded)) return 3;
    if (candidate.split(/[\s\-']+/).some((word) => word.startsWith(folded))) return 2;
    return folded.length > 2 && candidate.includes(folded) ? 1 : 0;
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
    let seat: Place | null = null;
    for (const place of gazetteer.places) {
      if (place.iso !== country.iso || !isShown(place)) continue;
      if (seat === null || (place.capital === true && seat.capital !== true) || (place.capital === seat.capital && place.pop > seat.pop)) {
        seat = place;
      }
    }
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
