/** The prompt for the nearest free seat, taking a parked car over from its town, and `E`. */
import type { CraftKind } from '../craft/contract.ts';
import { writePose } from '../player/pose.ts';
import type { ParkedCar } from '../settlements.ts';
import { BOARD_REACH, PARKED_SEARCH, USE_INTERVAL_MS } from './limits.ts';
import { applyPose } from './pose.ts';
import type { Drawing } from './drawing.ts';
import type { HeldSync } from './held.ts';
import type { Leaving } from './leaving.ts';
import type { Seating } from './seating.ts';
import type { Drawn, FleetContext } from './state.ts';
import type { Prompt } from './types.ts';

/** What `E` is offered as at the driver's seat of each kind. */
function takeLabel(kind: CraftKind): Prompt['label'] {
  if (kind === 'bicycle' || kind === 'motorbike' || kind === 'horse' || kind === 'jetski') return 'Ride';
  if (kind === 'plane' || kind === 'helicopter' || kind === 'balloon') return 'Fly';
  if (kind === 'sailboat') return 'Sail';
  return 'Drive';
}

export interface Boarding {
  /** The nearest free seat within reach, for the prompt. */
  findPrompt(): Prompt | null;
  /** `E`: take the prompted seat, or leave the one you are in. */
  use(): void;
  /** Gets out of the vehicle in hand. */
  leave(): void;
  /** Takes a seat, for the console and automated shots; resolves false if refused. */
  claim(entry: Drawn, seat: number): Promise<boolean>;
  /** Every frame: the vehicle in hand, see `HeldSync`. */
  syncHeld(dt: number): void;
}

export function createBoarding(
  ctx: FleetContext,
  drawing: Drawing,
  leaving: Leaving,
  seating: Seating,
  held: HeldSync,
): Boarding {
  const { options, models, link, group, drawn, bayPose, paints, state, up } = ctx;
  const { player, parked } = options;
  const { build } = drawing;
  const { leave } = leaving;
  const { claim, takeControls } = seating;
  const bays: ParkedCar[] = [];

  /** The nearest free seat within reach, for the prompt. */
  function findPrompt(): Prompt | null {
    if (player.state === 'seated' || state.pending) return null;
    let best: Prompt | null = null;
    let bestGap = Infinity;
    for (const entry of drawn.values()) {
      // A vehicle jumped out of and still rolling is the jumper's to take
      // again: its driver's seat is still his on the link (`coastOn`). One
      // gliding down aloft is not.
      const rolling = state.coast !== null && state.coast.entry === entry;
      if (rolling && state.coast!.flying) continue;
      const size = entry.model.size;
      const gap = entry.group.position.distanceTo(player.position) - Math.max(size[0], size[1]) / 2;
      if (gap > BOARD_REACH || gap >= bestGap) continue;
      const seats = link.moved.get(entry.id)?.seats ?? [];
      const free = entry.model.seats.findIndex((_, i) => (seats[i] ?? null) === null || (rolling && i === 0 && seats[i] === link.self));
      if (free < 0) continue;
      bestGap = gap;
      best = { vehicle: entry.id, seat: free, model: entry.model, label: free === 0 ? takeLabel(entry.model.kind) : 'Get in', gap, at: entry.group.position };
    }
    // And the cars parked in the towns, which are nobody's until one is taken.
    if (parked !== undefined) {
      bays.length = 0;
      parked.near(player.position, PARKED_SEARCH, bays);
      for (const bay of bays) {
        if (drawn.has(bay.id) || bayPose.has(bay.id) || link.moved.has(bay.id)) continue;
        const model = models.get(bay.model);
        if (model === undefined) continue;
        const gap = bay.position.distanceTo(player.position) - Math.max(model.size[0], model.size[1]) / 2;
        if (gap > BOARD_REACH || gap >= bestGap) continue;
        bestGap = gap;
        best = { vehicle: bay.id, seat: 0, model, label: takeLabel(model.kind), gap, at: bay.position };
        state.promptBay = bay;
      }
    }
    if (best === null || best.vehicle !== state.promptBay?.id) state.promptBay = null;
    return best;
  }

  /**
   * A town's parked car becomes the fleet's: built as a vehicle where the
   * town had it, and folded out of the town's buffer, so there is one car and
   * it is the one that can be driven off.
   */
  function adopt(bay: ParkedCar): Drawn | null {
    const kerb = writePose(bay.position, bay.forward, up.copy(bay.position).normalize(), new Array<number>(9));
    paints.set(bay.id, bay.paint);
    const entry = build(bay.id, null);
    if (entry === null) return null;
    bayPose.set(bay.id, kerb);
    drawn.set(entry.id, entry);
    group.add(entry.group);
    applyPose(kerb, entry.group);
    parked?.hide(bay.id);
    return entry;
  }

  /** `E`: take the prompted seat, or leave the one you are in. */
  function use(): void {
    if (state.pending) return;
    const now = performance.now();
    if (now - state.usedAt < USE_INTERVAL_MS) return;
    state.usedAt = now;
    if (state.held !== null) {
      const driver = link.moved.get(state.held.id)?.seats[0] ?? null;
      if (state.heldSeat > 0 && player.airborne && driver === null) takeControls(state.held);
      else leave();
      return;
    }
    if (state.prompt === null) return;
    const entry = drawn.get(state.prompt.vehicle) ?? (state.promptBay?.id === state.prompt.vehicle ? adopt(state.promptBay) : null);
    if (entry !== undefined && entry !== null) void claim(entry, state.prompt.seat);
  }

  return { findPrompt, use, leave, claim, syncHeld: held.syncHeld };
}
