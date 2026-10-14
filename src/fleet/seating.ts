/** Taking a seat on the link, and keeping it. */
import { LOST_SEAT_SECONDS, LOST_SEAT_TRIES } from './limits.ts';
import type { Drawn, FleetContext } from './state.ts';
import type { Placing } from './placing.ts';
import type { Drawing } from './drawing.ts';
import type { Coasting } from './coasting.ts';
import type { Leaving } from './leaving.ts';

export function createSeating(
  ctx: FleetContext,
  placing: Placing,
  drawing: Drawing,
  coasting: Coasting,
  leaving: Leaving,
) {
  const { options, link, group, drawn, state, pose } = ctx;
  const { player, onEvent } = options;
  const { poseOf } = placing;
  const { endFades } = drawing;
  const { finishCoast, coastPose } = coasting;
  const { leave } = leaving;

  function takeSeat(entry: Drawn, seat: number): void {
    endFades(entry);
    drawn.delete(entry.id);
    group.remove(entry.group);
    poseOf(entry.id, pose);
    // Back into one still rolling: where it has got to, and going as it was.
    let going = 0;
    if (state.coast !== null && state.coast.entry === entry) {
      for (let i = 0; i < 9; i++) pose[i] = coastPose[i]!;
      going = seat === 0 ? state.coast.speed : 0;
      state.coast = null;
    }
    state.held = entry;
    state.heldSeat = seat;
    state.lostFor = 0;
    state.lostTries = 0;
    player.board({ vehicle: entry.id, seat, model: entry.model, group: entry.group }, pose, going);
    if (seat === 0) link.drive(entry.id, player.pose(pose), 0);
    onEvent?.('boarded', entry.model);
  }

  function claim(entry: Drawn, seat: number): Promise<boolean> {
    // The one rolling on is claimed as it goes, its driver's seat already
    // ours; anything else is somewhere else, and that one parks.
    if (state.coast === null || state.coast.entry !== entry) finishCoast();
    state.pending = true;
    state.prompt = null;
    // The pose goes with the claim: a relay that has never seen this vehicle
    // moved learns from it where the vehicle is.
    poseOf(entry.id, pose);
    return link.claim(entry.id, seat, pose.slice(0, 9)).then(
      (ok) => {
        state.pending = false;
        if (!ok) {
          onEvent?.('taken', entry.model);
          return false;
        }
        // Somebody may have walked off, or been taken elsewhere, while the
        // relay answered: the seat is released rather than sat in from afar.
        if (player.state === 'seated' || drawn.get(entry.id) !== entry) {
          link.release(entry.id, null);
          return false;
        }
        takeSeat(entry, seat);
        return true;
      },
      () => {
        state.pending = false;
        return false;
      },
    );
  }

  /**
   * A passenger aloft with nobody at the controls (a driver whose connection
   * dropped mid-flight, which the relay answers by emptying the seat) could
   * not get out and would hang there for ever, so `E` takes the controls
   * instead of leaving. On the ground it leaves, like any passenger's.
   */
  function takeControls(entry: Drawn): void {
    state.pending = true;
    const at = player.pose([]);
    link.claim(entry.id, 0, at).then(
      (ok) => {
        state.pending = false;
        if (!ok) {
          onEvent?.('taken', entry.model);
          return;
        }
        if (state.held !== entry || player.ride === null) {
          link.release(entry.id, null);
          return;
        }
        state.heldSeat = 0;
        player.board({ vehicle: entry.id, seat: 0, model: entry.model, group: entry.group }, player.pose(pose));
        link.drive(entry.id, player.pose(pose), 0);
        onEvent?.('boarded', entry.model);
      },
      () => {
        state.pending = false;
      },
    );
  }

  /**
   * The seat in hand, as the link has it. Asked for again when the link says
   * it is not ours, and, refused every time, given up as soon as the player is
   * on the ground: in the air the player flies on and is let out where he lands.
   */
  function keepSeat(dt: number, entry: Drawn): void {
    const holder = link.moved.get(entry.id)?.seats[state.heldSeat] ?? null;
    if (holder === link.self || state.pending) {
      if (holder === link.self) {
        state.lostFor = 0;
        state.lostTries = 0;
      }
      return;
    }
    state.lostFor += dt;
    if (state.lostFor < LOST_SEAT_SECONDS) return;
    state.lostFor = 0;
    if (state.lostTries >= LOST_SEAT_TRIES) {
      if (!player.airborne) leave();
      return;
    }
    state.lostTries++;
    state.pending = true;
    link.claim(entry.id, state.heldSeat, player.pose([])).then(
      () => {
        state.pending = false;
      },
      () => {
        state.pending = false;
      },
    );
  }

  return { takeSeat, claim, takeControls, keepSeat };
}

export type Seating = ReturnType<typeof createSeating>;
