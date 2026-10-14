/**
 * Each frame: send our state, then place, dress and animate every peer near enough.
 */
import { hasFlag } from '../../server/src/limits.ts';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { DIVING_FROM, DRAW_REACH, GESTURE_STALE_MS, SEND_MS, SILENT_MS } from './constants.ts';
import type { PeerSelf, SeatFrameData } from './types.ts';
import type { PeersCore } from './core.ts';
import type { Roster } from './roster.ts';
import type { Link } from './link.ts';
import type { Outbound } from './outbound.ts';
import type { Canopy } from './canopy.ts';
import type { Sampler } from './sample.ts';
import type { Bodies } from './bodies.ts';

export function createUpdate(
  core: PeersCore,
  roster: Roster,
  link: Link,
  outbound: Outbound,
  canopy: Canopy,
  sampler: Sampler,
  bodies: Bodies,
) {
  const { basis, flagsById, forward, markPool, marks, onEarth, peers, right, stats, up, waterline } = core;
  const s = core.fields;
  const { drop } = roster;
  const { connect } = link;
  const { send, sendFlags } = outbound;
  const { drawCanopy } = canopy;
  const { sample } = sampler;
  const { dressed, onSeat, seat, stride } = bodies;

  /** Sends our state on its cadence and draws every peer: their mark for the minimap, and when near their body, label and canopy. */
  function update(dt: number, player: PeerSelf): void {
    s.lastPlayer = player;
    if (s.disposed) return;
    if (s.socket === null && stats.state === 'off') connect();
    const now = performance.now();
    if (now - s.sentAt >= SEND_MS) {
      s.sentAt = now;
      send(player);
    }
    sendFlags(player, now);

    marks.length = 0;
    s.nearestMoving = Infinity;
    stats.drawn = 0;
    // Deleting the entry being visited is safe in a Map's own iteration.
    for (const peer of peers.values()) {
      if (now - peer.heard > SILENT_MS) {
        drop(peer.id);
        continue;
      }
      const state = sample(peer, now);
      if (state === null) continue;
      peer.shown.copy(state.position);
      peer.aloft = state.airborne;
      let mark = markPool[marks.length];
      if (mark === undefined) {
        mark = { id: '', name: '', x: 0, y: 0, z: 0, state: 'foot' };
        markPool.push(mark);
      }
      mark.id = peer.id;
      mark.name = peer.name || 'Traveller';
      mark.state = state.state;
      marks.push(mark);
      up.copy(state.position).normalize();
      mark.x = up.x;
      mark.y = up.y;
      mark.z = up.z;

      const away = state.position.distanceTo(player.position);
      const near = away < DRAW_REACH;
      peer.holder.visible = near;
      if (!near) continue;
      peer.flags = flagsById.get(peer.id) ?? 0;
      drawCanopy(peer, dt, state.state === 'foot' && hasFlag(peer.flags, 'chute'));
      stats.drawn++;
      if (state.speed > 0) s.nearestMoving = Math.min(s.nearestMoving, away);

      const body = dressed(peer);
      const frame = state.state === 'seated' ? onSeat(peer) : null;
      if (frame !== null) {
        const data = frame.userData as SeatFrameData;
        peer.label.position.y = AVATAR_HEIGHT * 0.75;
        if (body !== null) {
          body.person.root.visible = data.shown !== false;
          if (data.shown !== false) seat(peer, body, dt, data);
        }
        continue;
      }

      // The one basis every placed thing uses: X is `up x forward`, so the
      // determinant is +1 and the ink stays a line.
      forward.copy(state.forward).projectOnPlane(up);
      if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
      forward.normalize();
      right.crossVectors(up, forward).normalize();
      basis.makeBasis(right, up, forward);
      peer.holder.position.copy(state.position);
      peer.holder.quaternion.setFromRotationMatrix(basis);
      peer.label.position.y = AVATAR_HEIGHT * (state.state === 'swim' ? 0.5 : 1.15);

      if (body === null) continue;
      // Seated in a vehicle nobody here has built: the name alone, where they are.
      body.person.root.visible = state.state !== 'seated';
      // A swimmer's position is the water's surface, which is where the
      // swimming clips are drawn from.
      if (peer.gesture !== null && state.state === 'foot') {
        if (now - peer.gestureAt < GESTURE_STALE_MS) body.motion.emote(peer.gesture);
        peer.gesture = null;
      }
      // On a bench, held there for as long as the relay says, which is what
      // a player who joined after they sat down has to go by; and up again
      // when it says they have stood.
      const sitting = state.state === 'foot' && hasFlag(peer.flags, 'sitting');
      if (sitting && body.motion.emoting !== 'sit' && state.speed < 0.5) body.motion.emote('sit');
      // Only as the flag goes: an older client says it sat down by the
      // gesture alone, and that sitting is let be.
      else if (!sitting && peer.sat && body.motion.emoting === 'sit') body.motion.emote(null);
      peer.sat = sitting;
      // A dance moves the shadow as much as a walk does.
      if (body.motion.emoting !== null) s.nearestMoving = Math.min(s.nearestMoving, away);
      if (state.state === 'foot') stride(body, dt, state.speed, state.airborne);
      else if (state.state === 'swim') {
        // A state under the water's surface is a diver's: the long pull and glide.
        const depth = onEarth ? waterline - state.position.length() : 0;
        body.under += ((depth > DIVING_FROM ? 1 : 0) - body.under) * (1 - Math.exp(-3 * dt));
        body.hold.off();
        body.motion.swim(dt, state.speed, body.under);
      }
    }
    stats.peers = peers.size;
  }

  return { update };
}

export type Update = ReturnType<typeof createUpdate>;
