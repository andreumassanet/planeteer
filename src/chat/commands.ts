/** The slash commands: each takes its arguments and answers in the chat; `run` says whether to keep the field open. */
import { fold } from '../ui.ts';
import { worldName } from '../relay-players.ts';
import { latLonOf } from '../sphere.ts';
import { COMMANDS, findPlace, matchPlayer, parseClock, parseLatLon, parseWeather } from '../chat-core.ts';
import type { ParsedCommand } from '../chat-core.ts';
import { WHO_LIST } from './style.ts';
import type { ChatCtx } from './context.ts';
import type { ChatLog } from './log.ts';
import type { Lookups } from './lookups.ts';
import type { Say } from './say.ts';

type Handler = (args: string) => boolean;

const usage = (name: string): string => {
  const spec = COMMANDS.find((command) => command.name === name)!;
  return `/${spec.name}${spec.usage === '' ? '' : ` ${spec.usage}`}`;
};

export function createCommands(ctx: ChatCtx, chat: ChatLog, lookups: Lookups, talk: Say): (parsed: ParsedCommand) => boolean {
  const { host, dom, state } = ctx;
  const { system } = chat;
  const { players, placeName } = lookups;
  const peers = host.peers;

  function help(): boolean {
    system('Type / and a list follows what you type · Tab fills it in · // sends a line that starts with /');
    for (const spec of COMMANDS) system(`/${spec.name}${spec.usage === '' ? '' : ` ${spec.usage}`} · ${spec.help}`);
    return true;
  }

  function goto(args: string): boolean {
    if (args === '') {
      system(`Where to? ${usage('goto')}`, 'error');
      return true;
    }
    const point = parseLatLon(args);
    if (point !== null) {
      host.jumpTo(point.lat, point.lon);
      system(`Off to ${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`);
      return false;
    }
    const found = findPlace(args, host.gazetteer(), host.here().iso || undefined);
    if (found === null) {
      system(`Nothing called “${args}” is built · try a bigger town nearby`, 'error');
      return true;
    }
    const away = found.world !== (host.world ?? 'earth');
    if (away && host.travel === undefined) {
      system(`${found.name} is on ${worldName(found.world)}, and there is no getting there from here`, 'error');
      return true;
    }
    if (away) host.travel!(found.world, found.lat, found.lon, found.name);
    else host.jumpTo(found.lat, found.lon);
    system(`Off to ${found.name}, ${placeName(found.iso)}${found.via === undefined ? '' : ` · for ${found.via}`}`);
    if (found.others.length > 0) {
      const also = found.others.slice(0, 3).map((iso) => `${found.via ?? found.name}, ${placeName(iso)}`);
      system(`Also: ${also.join(' · ')}`);
    }
    return false;
  }

  function home(): boolean {
    const spot = host.home();
    host.jumpTo(spot.lat, spot.lon);
    system(`Back to ${spot.name}`);
    return false;
  }

  function where(): boolean {
    const here = host.here();
    const place = here.country === '' ? `At sea off ${here.town}` : `${here.near ? 'In' : 'Near'} ${here.town}, ${here.country}`;
    system(`${place} · ${here.lat.toFixed(4)}, ${here.lon.toFixed(4)}`);
    return true;
  }

  function time(args: string): boolean {
    const wanted = parseClock(args);
    if (wanted === null) {
      system(`Which time? ${usage('time')}`, 'error');
      return true;
    }
    if (wanted === 'real') {
      host.time.setLive();
      system('The sun is the real one again');
    } else {
      host.time.setHour(wanted.hour);
      const minutes = Math.round(wanted.hour * 60) % 1440;
      system(`The sun is at ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} here`);
    }
    return false;
  }

  function weather(args: string): boolean {
    const wanted = parseWeather(args);
    if (wanted === null) {
      system(`Which weather? ${usage('weather')}`, 'error');
      return true;
    }
    const done = host.weather(wanted);
    if (done === null) system('The weather cannot be set in this world yet', 'error');
    else if (!done) system(`The ${wanted} would not come`, 'error');
    else system(wanted === 'auto' ? 'The weather is the world’s again' : `Weather · ${wanted}`);
    return done !== true;
  }

  function who(): boolean {
    if (peers === null) system('You are playing offline · choose Play online on the title screen to meet others');
    else if (peers.online === null) system('Not connected right now', 'error');
    else {
      // Here first, where a town can be named; then the other worlds, from the relay.
      const here = players().map((other) => {
        const spot = host.whereIs(other);
        return `${other.name} · ${spot.country === '' ? `at sea off ${spot.town}` : `${spot.near ? 'in' : 'near'} ${spot.town}, ${spot.country}`}`;
      });
      const world = host.world ?? 'earth';
      void (host.elsewhere?.() ?? Promise.resolve(null)).then((all) => {
        const away = (all ?? []).filter((one) => one.world !== world).map((one) => `${one.name} · on ${worldName(one.world)}`);
        const lines = [...here, ...away];
        if (lines.length === 0) {
          system('Nobody else is online right now');
          return;
        }
        system(`${lines.length} other ${lines.length === 1 ? 'traveller' : 'travellers'} online`);
        for (const text of lines.slice(0, WHO_LIST)) system(text);
        if (lines.length > WHO_LIST) system(`and ${lines.length - WHO_LIST} more`);
      });
    }
    return true;
  }

  function tp(args: string): boolean {
    const found = matchPlayer(args, players());
    if (found === null && args !== '' && host.elsewhere !== undefined && host.travel !== undefined) {
      // Not on this world: perhaps on another, where the relay says they stand.
      const world = host.world ?? 'earth';
      void host.elsewhere().then((all) => {
        const away = matchPlayer(args, (all ?? []).filter((one) => one.world !== world && one.at !== undefined));
        if (away === null || away.at === undefined) {
          system(`No one online is called “${args}” · /who lists them`, 'error');
          return;
        }
        const { lat, lon } = latLonOf(away.at);
        system(`Off to ${away.name}, on ${worldName(away.world)}`);
        host.travel!(away.world, lat, lon, away.name);
      });
      return true;
    }
    if (found === null) {
      system(args === '' ? `Who? ${usage('tp')}` : `No one online is called “${args}” · /who lists them`, 'error');
      return true;
    }
    if (!host.joinPlayer(found.id)) {
      system(`${found.name} has gone`, 'error');
      return true;
    }
    system(`Off to ${found.name}`);
    return false;
  }

  function me(args: string): boolean {
    if (args === '') {
      system(`Doing what? ${usage('me')}`, 'error');
      return true;
    }
    talk.say(`/me ${args}`);
    return false;
  }

  function mute(name: 'mute' | 'unmute', args: string): boolean {
    const known = [...new Set([...players().map((player) => player.name), ...state.names.values(), ...state.muted])].map((each) => ({ name: each }));
    const found = matchPlayer(args, known);
    if (found === null) {
      system(args === '' ? `Who? ${usage(name)}` : `No one called “${args}”`, 'error');
      return true;
    }
    const folded = fold(found.name);
    if (name === 'mute') {
      state.muted.add(folded);
      // What they said already goes as well.
      for (const entry of state.entries) if (entry.from === folded) entry.element.remove();
      system(`${found.name} is muted until you reload`);
    } else {
      state.muted.delete(folded);
      system(`${found.name} is heard again`);
    }
    return true;
  }

  function clear(): boolean {
    state.entries.length = 0;
    dom.log.replaceChildren();
    return true;
  }

  const handlers: Record<string, Handler> = {
    help,
    goto,
    home,
    where,
    time,
    weather,
    who,
    tp,
    me,
    wave: () => (talk.gesture('wave'), false),
    dance: () => (talk.gesture('dance'), false),
    photo: () => (host.photo(), false),
    mute: (args) => mute('mute', args),
    unmute: (args) => mute('unmute', args),
    clear,
  };

  /** Runs a command; true to leave the field open, for an answer worth reading or a line to fix. */
  return function run(parsed: ParsedCommand): boolean {
    const { command, args } = parsed;
    if (command === null) {
      system(`There is no /${parsed.typed} · /help lists what there is`, 'error');
      return true;
    }
    return handlers[command.name]?.(args) ?? true;
  };
}
