/** Questions the commands and the suggestions both ask: who is online, and what a place is called. */
import { worldName } from '../relay-players.ts';
import { worldOfKey } from '../chat-core.ts';
import type { Gazetteer } from '../chat-core.ts';
import type { ChatHost } from '../chat.ts';

export interface Lookups {
  /** Everyone online but us, as the minimap marks them. */
  players(): { id: string; name: string; x: number; y: number; z: number }[];
  /**
   * A country's or another world's nation's name, from the gazetteer `/goto`
   * searches, with the world after it when that is not this one:
   * `Tharsis · Mars`.
   */
  placeName(iso: string): string;
}

export function createLookups(host: ChatHost): Lookups {
  const peers = host.peers;
  const placeNames = new WeakMap<Gazetteer, Map<string, string>>();
  return {
    players: () => (peers === null ? [] : peers.marks.filter((mark) => mark.id !== peers.id).map((mark) => ({ ...mark }))),
    placeName(iso: string): string {
      const gazetteer = host.gazetteer();
      let names = placeNames.get(gazetteer);
      if (names === undefined) {
        names = new Map(gazetteer.countries.map((country) => [country.iso, country.name]));
        placeNames.set(gazetteer, names);
      }
      const name = names.get(iso) ?? host.countryName(iso);
      const world = worldOfKey(iso);
      return world === (host.world ?? 'earth') ? name : `${name} · ${worldName(world)}`;
    },
  };
}
