/** Getting out of the vehicle in hand: stepping out, or jumping out to let it go on alone. */
import * as THREE from 'three';
import { isAirKind } from '../craft/contract.ts';
import { COAST_STOP } from './limits.ts';
import { applyPose } from './pose.ts';
import type { FleetContext } from './state.ts';
import type { Coasting } from './coasting.ts';

export function createLeaving(ctx: FleetContext, coasting: Coasting) {
  const { options, link, group, drawn, state } = ctx;
  const { player, onEvent } = options;
  const { finishCoast } = coasting;

  function leave(): void {
    if (state.held === null) return;
    // How it was going, read before the player lets go of it.
    const speed = player.speed;
    const climb = player.climb;
    const flying = isAirKind(state.held.model.kind) && player.airborne;
    const sinking = player.foundering;
    const out = player.leave();
    if (out === null) {
      onEvent?.('leave-refused', state.held.model);
      return;
    }
    const entry = state.held;
    state.held = null;
    group.add(entry.group);
    applyPose(out, entry.group);
    drawn.set(entry.id, entry);
    entry.site = null;
    entry.reseat = 0;
    state.scanAge = Infinity;
    // Going down in the water is under way too, however slowly: released
    // there it would be parked afloat for good, for everyone.
    const under = flying || sinking >= 0 || Math.abs(speed) > COAST_STOP * 4;
    // A passenger leaves the driver to it; the driver of a vehicle under way
    // leaves it going.
    if (state.heldSeat === 0 && under) {
      finishCoast();
      state.coast = {
        entry,
        position: new THREE.Vector3(out[0]!, out[1]!, out[2]!),
        forward: new THREE.Vector3(out[3]!, out[4]!, out[5]!),
        speed,
        vertical: flying ? climb : 0,
        age: 0,
        flying,
        // On from where it had got to, not afloat again for a moment first.
        sinking,
      };
    } else link.release(entry.id, state.heldSeat === 0 ? out : null);
    onEvent?.(under || flying ? 'bailed' : 'left', entry.model);
  }

  return { leave };
}

export type Leaving = ReturnType<typeof createLeaving>;
