/**
 * What a vehicle may knock over, and how hard each knock is felt. Pure: the
 * towns, the wood and the checks all read one table, so what is breakable is
 * the same on every client and nothing about it is on the wire.
 */

export type PropKind =
  | 'tree'
  | 'lamp'
  | 'bench'
  | 'sign'
  | 'post'
  | 'bin'
  | 'bollard'
  | 'hydrant'
  | 'postbox'
  | 'planter'
  | 'pots'
  | 'table'
  | 'stall'
  | 'rack'
  | 'vending'
  | 'newsbox'
  | 'clock'
  | 'stone'
  | 'bale'
  | 'boulder'
  | 'building';

/** What breaking sounds like, and what it throws. */
export type KnockVoice = 'wood' | 'metal' | 'soft' | 'bonk';
export type KnockBurst = 'leaves' | 'splinters' | 'sparks' | 'dust' | 'rubble';

export interface KindRule {
  /** How hard knocking one over is felt, 0 to 1: the camera's knock. It costs the vehicle no speed. */
  jolt: number;
  /** The least `punchOf` a vehicle needs to knock it over; a lighter one meets it as a wall, or passes through as it always did. */
  need: number;
  /** The least speed that does, units a second, where it is more than `BREAK_SPEED`: slower, it is a wall the vehicle bounces off. */
  speed?: number;
  voice: KnockVoice;
  burst: KnockBurst;
}

/**
 * Light and medium things go down for anything on wheels or hooves, a bicycle
 * and a horse included (the least `punchOf` is 0.25); only the heaviest (a
 * vending machine, a standing stone, a boulder) want a car's weight.
 */
export const BREAKABLE: Record<PropKind, KindRule> = {
  tree: { jolt: 0.22, need: 0.25, voice: 'wood', burst: 'leaves' },
  lamp: { jolt: 0.1, need: 0.25, voice: 'metal', burst: 'sparks' },
  bench: { jolt: 0.07, need: 0.25, voice: 'wood', burst: 'splinters' },
  sign: { jolt: 0.04, need: 0.25, voice: 'metal', burst: 'sparks' },
  post: { jolt: 0.02, need: 0.2, voice: 'wood', burst: 'splinters' },
  bin: { jolt: 0.03, need: 0.2, voice: 'metal', burst: 'dust' },
  bollard: { jolt: 0.03, need: 0.2, voice: 'metal', burst: 'sparks' },
  hydrant: { jolt: 0.06, need: 0.25, voice: 'metal', burst: 'sparks' },
  postbox: { jolt: 0.05, need: 0.25, voice: 'metal', burst: 'dust' },
  planter: { jolt: 0.06, need: 0.25, voice: 'soft', burst: 'leaves' },
  pots: { jolt: 0.02, need: 0.2, voice: 'soft', burst: 'leaves' },
  table: { jolt: 0.05, need: 0.25, voice: 'metal', burst: 'dust' },
  stall: { jolt: 0.1, need: 0.25, voice: 'wood', burst: 'splinters' },
  rack: { jolt: 0.04, need: 0.25, voice: 'metal', burst: 'sparks' },
  vending: { jolt: 0.12, need: 0.8, voice: 'metal', burst: 'sparks' },
  newsbox: { jolt: 0.04, need: 0.25, voice: 'metal', burst: 'dust' },
  clock: { jolt: 0.08, need: 0.25, voice: 'metal', burst: 'sparks' },
  stone: { jolt: 0.12, need: 0.6, voice: 'bonk', burst: 'dust' },
  bale: { jolt: 0.05, need: 0.25, voice: 'soft', burst: 'leaves' },
  // A rock of the wood: a car at a run shatters it, a crawl bounces off it.
  boulder: { jolt: 0.28, need: 0.6, speed: 16, voice: 'bonk', burst: 'rubble' },
  // No vehicle knocks a building down: only a blast (`Breakables.blast`).
  building: { jolt: 0.5, need: Infinity, voice: 'soft', burst: 'rubble' },
};

/** The street dressing's pieces that break, by the kind each is; a kiosk is a shop and stays a wall. */
export const DRESSING_KIND: Readonly<Record<string, PropKind>> = {
  cafe: 'table',
  rack: 'rack',
  vending: 'vending',
  bin: 'bin',
  planter: 'planter',
  pots: 'pots',
  stall: 'stall',
  newsbox: 'newsbox',
  hydrant: 'hydrant',
  postbox: 'postbox',
  clock: 'clock',
  bollard: 'bollard',
};

/** Under this speed, units a second, a vehicle breaks nothing: a bench stops a creeping car as it always did. */
export const BREAK_SPEED = 9;
/** The most one frame's knocks may add up to. */
export const MAX_JOLT = 0.5;
/** How hard a person or an animal knocked down is felt. */
export const BODY_JOLT = 0.04;
/** A car's plan, in square units: what `punchOf` measures a vehicle against. */
const CAR_PLAN = 9;

/**
 * How hard a vehicle hits, from its plan: a car is 1, a bicycle a quarter,
 * a bus about one and a half. A kind breaks for a vehicle whose punch is at
 * least its `need`.
 */
export function punchOf(length: number, width: number): number {
  return Math.min(1.6, Math.max(0.25, (length * width) / CAR_PLAN));
}

/** Whether a vehicle of `punch` going at `speed` breaks `kind`. */
export function breaks(kind: PropKind, punch: number, speed: number): boolean {
  const rule = BREAKABLE[kind];
  return speed >= Math.max(BREAK_SPEED, rule.speed ?? 0) && punch >= rule.need;
}

/**
 * Whether a blast of `power` (0 to 1) reaching `share` of its radius out
 * knocks `kind` down: anything small anywhere in it, a building only in the
 * inner part and the harder the blast the further out.
 */
export function blown(kind: PropKind, power: number, share: number): boolean {
  if (share > 1 || power <= 0) return false;
  return kind !== 'building' || share <= BUILDING_REACH * Math.min(1, power);
}

/** The share of a blast's radius a full one brings buildings down within. */
export const BUILDING_REACH = 0.6;
