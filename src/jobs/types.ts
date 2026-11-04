/**
 * What a job is: somewhere to collect something or somebody, somewhere to
 * take them, a par time to beat and whose reputation it earns.
 */
import type * as THREE from 'three';

/** An errand on foot or on anything, a fare by road, a load by air, somebody brought home. */
export type JobKind = 'errand' | 'taxi' | 'cargo' | 'rescue';

export const JOB_KINDS: readonly JobKind[] = ['errand', 'taxi', 'cargo', 'rescue'];

/** The id's first letter for each kind. */
export const KIND_LETTER: Readonly<Record<JobKind, string>> = { errand: 'e', taxi: 't', cargo: 'c', rescue: 'r' };

/** Where a rescue is: off a coast, or up a hill. */
export type RescueSite = 'sea' | 'hill';

export interface Job {
  /** `<letter>:<from>:<n>:<day>`, the same on every client for the same day. */
  id: string;
  kind: JobKind;
  /** What the card says, in a few words: "Parcel to Sóller". */
  title: string;
  /** The line the one who offers it says, in English. */
  line: string;
  /** Index into `places` of the town it is offered in, and of the one it ends in. */
  from: number;
  to: number;
  /** Where it is collected, a unit direction; where it is left, another. */
  pickup: THREE.Vector3;
  drop: THREE.Vector3;
  /** How near the drop, along the ground, units, counts as there. */
  dropRadius: number;
  /** The name of where it is left. */
  toName: string;
  /** The way it goes, units: the road's length for a fare, the great circle otherwise. */
  distance: number;
  /** The time a gold-medal run is measured against, ms. */
  parMs: number;
  /** The country whose reputation it earns: the town it is offered in. */
  iso: string;
  /** A rescue's site; absent for the rest. */
  site?: RescueSite;
  /** Who waits at the pickup: a person's key, so they look the same every time. */
  who: string;
}

/** The fields a job's medal and reputation are worked out from, kept in the record. */
export interface JobDone {
  kind: JobKind;
  iso: string;
  title: string;
  /** The best time, ms, and the best medal: 3 gold, 2 silver, 1 bronze, 0 none. */
  ms: number;
  medal: number;
}
