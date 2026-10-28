/**
 * Other people: the players connected to the same relay, drawn where they are.
 *
 * Nothing about the world is sent, because every client builds the same one from
 * the same data. A player is nine numbers (where, which way, what they are doing,
 * how fast, whether in the air) sent ten times a second to the relay in
 * `server/`, which passes them on to everyone else; `State` in `peers/types.ts`
 * is the client half of that wire. The same socket carries the vehicles' typed
 * messages, which this file only passes to whoever subscribes (`fleet-sync.ts`).
 *
 * A peer is drawn a little in the past, `DELAY_MS` behind the newest state, so
 * there are nearly always two states to interpolate between. Near, a peer is a
 * cast character dressed as that player chose to look, played by the hero's own
 * motion from the speed and state on the wire; seated, it is held in its seat on
 * the fleet's vehicle. Past `DRAW_REACH` it is only a mark on the minimap. A
 * peer is a moving mesh and therefore its own, never merged.
 *
 * The parts live in `peers/` over a shared `PeersCore`.
 */
import type { Folk } from './folk.ts';
import { LOOK_SEND_MS } from './peers/constants.ts';
import { createBodies } from './peers/bodies.ts';
import { createCanopy } from './peers/canopy.ts';
import { createPeersCore } from './peers/core.ts';
import { createLink } from './peers/link.ts';
import { createOutbound } from './peers/outbound.ts';
import { cleanName, storeName } from './peers/names.ts';
import { createRoster } from './peers/roster.ts';
import { createSampler } from './peers/sample.ts';
import { createUpdate } from './peers/update.ts';
import type { Peers, PeersOptions } from './peers/types.ts';

export { cleanName, guestName, shownName, storeName, storedName } from './peers/names.ts';
export type {
  PeerMark,
  PeerSeat,
  PeerSelf,
  Peers,
  PeersOptions,
  PeersStats,
  RelayMessage,
  SeatFrameData,
} from './peers/types.ts';

export function createPeers(url: string, folk: Folk, options: PeersOptions = {}): Peers {
  const core = createPeersCore(url, folk, options);
  const { group, peers, marks, stats, messageListeners, stateListeners } = core;
  const s = core.fields;

  const roster = createRoster(core);
  const outbound = createOutbound(core);
  const link = createLink(core, roster, outbound);
  const canopy = createCanopy(core);
  const sampler = createSampler();
  const bodies = createBodies(core);
  const { update } = createUpdate(core, roster, link, outbound, canopy, sampler, bodies);

  return {
    group,
    update,
    get marks() {
      return marks;
    },
    get nearestMoving() {
      return s.nearestMoving;
    },
    get stats() {
      return { ...stats };
    },
    get online() {
      return stats.state === 'open' ? peers.size : null;
    },
    airborneOf(id) {
      return peers.get(id)?.aloft ?? false;
    },
    positionOf(id) {
      const peer = peers.get(id);
      return peer === undefined || peer.snapshots.length === 0 ? null : peer.shown;
    },
    get name() {
      return stats.name;
    },
    rename(name) {
      const kept = cleanName(name);
      if (kept === stats.name) return kept;
      stats.name = storeName(kept);
      // The relay learns a name only as a socket opens, so a rename is a
      // reconnection, straight away rather than after the backoff.
      s.retry = 0;
      s.socket?.close();
      return kept;
    },
    setLook(code) {
      if (code === s.look) return;
      s.look = code;
      // The next connection carries it in its address; the open one is told
      // now, or as soon as the relay would take another.
      window.clearTimeout(s.lookTimer);
      const sendLook = (): void => {
        if (s.socket === null || s.socket.readyState !== WebSocket.OPEN) return;
        s.lookSentAt = performance.now();
        s.socket.send(JSON.stringify({ t: 'look', l: s.look }));
        stats.sent++;
      };
      const wait = LOOK_SEND_MS - (performance.now() - s.lookSentAt);
      if (wait <= 0) sendLook();
      else s.lookTimer = window.setTimeout(sendLook, wait);
    },
    get id() {
      return stats.id;
    },
    send(message) {
      if (s.socket === null || s.socket.readyState !== WebSocket.OPEN) return false;
      s.socket.send(JSON.stringify(message));
      stats.sent++;
      return true;
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    useSeats(fleetSeats, holderOf) {
      s.seats = fleetSeats;
      s.seatOf = holderOf;
    },
    dispose() {
      if (s.disposed) return;
      s.disposed = true;
      window.clearTimeout(s.lookTimer);
      window.clearTimeout(s.retryTimer);
      const open = s.socket;
      s.socket = null;
      open?.close();
      for (const id of [...peers.keys()]) roster.drop(id);
      messageListeners.clear();
      stateListeners.clear();
      link.setState('closed');
    },
  };
}
