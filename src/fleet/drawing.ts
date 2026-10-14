/** Vehicles as built things: made or taken from the pool, animated, dissolved in and out, and put away. */
import type { WirePose } from '../craft/contract.ts';
import { createAnimator } from './animate.ts';
import { createBuilder } from './build.ts';
import { createDissolve } from './dissolve.ts';
import type { Placing } from './placing.ts';
import type { FleetSite } from './site-types.ts';
import type { Drawn, FleetContext } from './state.ts';

export interface Drawing {
  /** Advances the dissolves. */
  fadeStep(): void;
  /** The colour a parked vehicle was parked in, or undefined for the craft's own look. */
  paintOf(id: string): number | undefined;
  /** A vehicle built, or taken from the pool; not yet standing. */
  build(id: string, site: FleetSite | null): Drawn | null;
  /** Hands another player's vehicle the speed and turn its poses imply. */
  animate(entry: Drawn, dt: number, at: WirePose): void;
  /** A vehicle nobody is driving: a hull near enough to see rides its mooring and a horse idles. */
  settle(entry: Drawn, dt: number): void;
  /** A vehicle just built or taken from the pool, placed: in, dissolving. */
  arrive(entry: Drawn): void;
  /** Its own materials back at once, for a vehicle somebody gets into mid-fade. */
  endFades(entry: Drawn): void;
  /** Out of the walls now, and out of sight when its fade is done. */
  putAway(entry: Drawn): void;
  /** Takes a vehicle out of the scene into the pool, or frees it. */
  retire(entry: Drawn): void;
  /**
   * Puts away the furthest vehicle standing, if it is further than `distance`
   * by `ROOM_MARGIN`, to make room under `MAX_BUILT` for one that near. Never
   * the one going on alone.
   */
  makeRoom(distance: number): boolean;
}

export function createDrawing(ctx: FleetContext, placing: Placing): Drawing {
  return {
    ...createBuilder(ctx),
    ...createAnimator(ctx, placing),
    ...createDissolve(ctx, placing),
  };
}
