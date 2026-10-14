import type * as THREE from 'three';
import type { World } from '../geo.ts';
import type { Place } from '../places.ts';
import type { Road } from '../roads.ts';
import type { LandmarkSite } from '../landmark-ground.ts';
import type { CraftKind } from '../craft/contract.ts';

/** One vehicle's default place in the world. */
export interface FleetSite {
  /** `<model>:<placeIndex>:<n>`, the same on every client. */
  id: string;
  model: string;
  kind: CraftKind;
  /** Index into `places`. */
  place: number;
  /** Where the model's origin is, as a unit direction. */
  at: THREE.Vector3;
  /** The way it faces, a unit tangent at `at`. */
  forward: THREE.Vector3;
  /** The road a car is parked on; -1 for anything else. */
  road: number;
}

/** What the sites are a function of. */
export interface FleetSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  /** The landmarks, which a field keeps clear of by their plan (`landmark-ground.ts`). */
  monuments?: readonly LandmarkSite[];
}

/**
 * Ground a standing plane or balloon keeps to itself: a disc of it. A
 * balloon's field is one, `SITE_ROOM.balloon` round the site; a plane's
 * airstrip is a row of them down its length. The wood and the herds keep off
 * them (`vegetation.ts`, `life.ts`), each with its own spread, as they do a road.
 */
export interface FieldKeepout {
  at: THREE.Vector3;
  radius: number;
}

/** The fields alone, which is all the wood and the herds ask of the fleet. */
export interface FieldIndex {
  /**
   * Every disc of every airstrip and balloon field within `radius` units of
   * `direction`, appended to `out`. Pure and complete: the towns it needs are
   * worked out on the spot and kept, with no cap, so a wood tile built in Node
   * and one built in the browser keep off the same ground.
   */
  fieldsNear(direction: THREE.Vector3, radius: number, out: FieldKeepout[]): FieldKeepout[];
  /**
   * Every plane site whose town is within `radius` units plus the widest
   * reach of a strip, appended to `out`: what the strips are drawn from. Pure
   * and complete, like `fieldsNear`.
   */
  planesNear(direction: THREE.Vector3, radius: number, out: FleetSite[]): FleetSite[];
}

export interface SiteIndex extends FieldIndex {
  /** One town's vehicles, worked out on the first ask and kept. */
  sitesOf(place: number): readonly FleetSite[];
  /**
   * Every site whose town is within `radius` units plus the widest spread of a
   * site, appended to `out`. `fresh` caps how many towns not yet worked out
   * this call may work out, so arriving somewhere new costs a few milliseconds
   * a scan rather than one long frame.
   */
  near(direction: THREE.Vector3, radius: number, out: FleetSite[], fresh?: number): FleetSite[];
  /** Every site on the planet, in place order. Seconds, not milliseconds: for the check and the console. */
  all(): FleetSite[];
  /** A site by its id, or null if no town places one by that name. */
  byId(id: string): FleetSite | null;
  /** How many sites of each kind have been worked out so far, and in how many towns. */
  readonly counts: Readonly<Record<CraftKind, number>> & { towns: number };
  /**
   * Works out ahead of time what `fieldsNear` and `planesNear` would work out
   * on their first ask round `direction`: the plane towns within `radius`
   * units, nearest first, one town at a time while `more()` says so. True once
   * nothing within `radius` is left. It only fills the caches the lookups
   * fill, so it changes when the work is done and never what it finds.
   */
  warm(direction: THREE.Vector3, radius: number, more: () => boolean): boolean;
  /**
   * What keeps a thing `clear` units round a spot off it, of what a field
   * keeps off: a built town's disc, a road's carriageway and verge, a
   * landmark's plan, or null where none does. The rockets' pads ask it.
   */
  takenAt(direction: THREE.Vector3, clear: number): 'town' | 'road' | 'landmark' | null;
}
