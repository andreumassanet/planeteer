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
  /** Where they stand on their world, in its units, once they have said; for `/tp`. */
  at?: { x: number; y: number; z: number };
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
      const { id, name, w, p } = raw as { id?: unknown; name?: unknown; w?: unknown; p?: unknown };
      const world = cleanBody(w);
      if (typeof id !== 'string' || world === '') continue;
      // The relay cleaned the name when the socket opened; it is only ever drawn as text.
      const player: RelayPlayer = { id, name: typeof name === 'string' && name !== '' ? name.slice(0, 40) : 'Traveller', world };
      if (Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        player.at = { x: p[0] as number, y: p[1] as number, z: p[2] as number };
      }
      out.push(player);
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
