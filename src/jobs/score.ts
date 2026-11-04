/**
 * How a job is scored: its par from how far it goes and how, the medal a time
 * earns against it, the reputation a medal is worth, and the standing that
 * reputation buys in a country. Pure.
 */
import type { JobKind } from './types.ts';

/**
 * The speed a par is set at, units a second, over a job's distance: a scooter's
 * for an errand, a car's on the road, the plane's cruise, and between a boat and
 * a helicopter for a rescue, which is there and back.
 */
export const PAR_SPEED: Readonly<Record<JobKind, number>> = { errand: 26, taxi: 40, cargo: 140, rescue: 34 };

/** Seconds every par is given on top: boarding, a take-off, finding the door. */
export const PAR_SLACK: Readonly<Record<JobKind, number>> = { errand: 20, taxi: 25, cargo: 60, rescue: 45 };

/** A run within this many pars is gold, then silver; anything finished is bronze. */
export const GOLD_PAR = 1;
export const SILVER_PAR = 1.4;

export function parFor(kind: JobKind, distance: number): number {
  return Math.round((distance / PAR_SPEED[kind] + PAR_SLACK[kind]) * 1000);
}

/** 3 gold, 2 silver, 1 bronze: a job finished always earns one. */
export function medalFor(ms: number, parMs: number): number {
  if (!(ms > 0) || !(parMs > 0)) return 1;
  if (ms <= parMs * GOLD_PAR) return 3;
  if (ms <= parMs * SILVER_PAR) return 2;
  return 1;
}

/** What each kind is worth before its medal: a rescue counts most. */
export const KIND_POINTS: Readonly<Record<JobKind, number>> = { errand: 6, taxi: 8, cargo: 12, rescue: 15 };

/** Reputation for a job done with `medal`: bronze the kind's worth, gold twice it. */
export function pointsFor(kind: JobKind, medal: number): number {
  return Math.round(KIND_POINTS[kind] * (1 + Math.max(0, Math.min(3, medal) - 1) * 0.5));
}

/** The standings a country's reputation reaches, from the first job on. */
export const STANDINGS: readonly { name: string; from: number }[] = [
  { name: 'Stranger', from: 0 },
  { name: 'Helping hand', from: 1 },
  { name: 'Regular', from: 40 },
  { name: 'Local favourite', from: 120 },
  { name: 'Household name', from: 300 },
  { name: 'Legend', from: 700 },
];

/** The standing `points` earns, its index, and how far it is to the next (null at the top). */
export function standingOf(points: number): { name: string; rank: number; next: number | null; from: number } {
  let rank = 0;
  for (let i = 0; i < STANDINGS.length; i++) if (points >= STANDINGS[i]!.from) rank = i;
  const next = STANDINGS[rank + 1]?.from ?? null;
  return { name: STANDINGS[rank]!.name, rank, next, from: STANDINGS[rank]!.from };
}
