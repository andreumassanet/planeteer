/** What goes out on the relay socket every tick: our state, and our flags when they change. */
import { FLAGS } from '../../server/src/limits.ts';
import { PLAYER_STATES } from '../craft/contract.ts';
import type { PlayerState } from '../craft/contract.ts';
import { FLAGS_SEND_MS } from './constants.ts';
import type { PeersCore } from './core.ts';
import type { PeerSelf, State } from './types.ts';

/** What the player is doing, read so that a `Player` without `state` yet reads as on foot. */
function stateIndex(player: PeerSelf): number {
  const state = (player as { state?: string }).state ?? 'foot';
  return Math.max(0, PLAYER_STATES.indexOf(state as PlayerState));
}

export function createOutbound(core: PeersCore) {
  const { stats } = core;
  const s = core.fields;

  /** Our flags, sent when they change, no sooner than `FLAGS_SEND_MS` after the last. */
  function sendFlags(player: PeerSelf, now: number): void {
    if (s.socket === null || s.socket.readyState !== WebSocket.OPEN || stats.id === null) return;
    const flags = (player.canopy ? 1 << FLAGS.indexOf('chute') : 0) | (player.sitting ? 1 << FLAGS.indexOf('sitting') : 0);
    if (flags === s.flagsSent || now - s.flagsSentAt < FLAGS_SEND_MS) return;
    s.flagsSent = flags;
    s.flagsSentAt = now;
    s.socket.send(JSON.stringify({ t: 'flags', f: flags }));
    stats.sent++;
  }

  /** Our state, as the wire writes it. */
  function send(player: PeerSelf): void {
    if (s.socket === null || s.socket.readyState !== WebSocket.OPEN) return;
    const { position: p, forward: f } = player;
    const state: State = [p.x, p.y, p.z, f.x, f.y, f.z, stateIndex(player), player.velocity, player.airborne ? 1 : 0];
    s.socket.send(JSON.stringify(state.map((n, i) => (i < 3 ? +n.toFixed(2) : i < 6 ? +n.toFixed(3) : +n.toFixed(1)))));
    stats.sent++;
  }

  return { sendFlags, send };
}

export type Outbound = ReturnType<typeof createOutbound>;
