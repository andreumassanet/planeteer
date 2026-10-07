/**
 * Who is connected to the relay, on every world, from its `/count` beside the
 * socket's `/ws`: the title says how many, and `Tab` lists the ones on other
 * worlds (a world's own players come live off its socket, `peers.ts`).
 *
 * Small and free of the world on purpose: the title asks it before anything
 * of Earth is built, and the other worlds ask it from their own shell.
 */
import { BODY_NAMES, cleanBody } from '../server/src/limits.ts';

/** One traveller as the relay counts them: their id in their world's room, their name and that world. */
export interface RelayPlayer {
  id: string;
  name: string;
  world: string;
}

/** Everybody on every world, or null when the relay does not answer, or answers something else. */
export async function relayPlayers(socketUrl: string): Promise<RelayPlayer[] | null> {
  try {
    const url = new URL(socketUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace(/\/ws$/, '/count');
    url.search = '';
    const answer = await fetch(url, { cache: 'no-store' });
    if (!answer.ok) return null;
    const { players } = (await answer.json()) as { players?: unknown };
    if (!Array.isArray(players)) return null;
    const out: RelayPlayer[] = [];
    for (const raw of players as unknown[]) {
      if (typeof raw !== 'object' || raw === null) continue;
      const { id, name, w } = raw as { id?: unknown; name?: unknown; w?: unknown };
      const world = cleanBody(w);
      if (typeof id !== 'string' || world === '') continue;
      // The relay cleaned the name when the socket opened; it is only ever drawn as text.
      out.push({ id, name: typeof name === 'string' && name !== '' ? name.slice(0, 40) : 'Traveller', world });
    }
    return out;
  } catch {
    return null;
  }
}

/** A world's name, short, for a line or a row: `'Moon'`; the id itself for one the table does not know. */
export function worldName(world: string): string {
  return BODY_NAMES[world] ?? world;
}
