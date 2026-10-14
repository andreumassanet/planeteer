import type * as THREE from 'three';

/** What `layRoadside` needs to know about one road. */
export interface RoadsideSite {
  /** The road's length along its path, gate A to gate B. */
  length: number;
  /** Half the carriageway. */
  half: number;
  /** The top's half-width at a point: the carriageway and its shoulder or pavement. */
  top(s: number): number;
  /**
   * The point on the road's drawn surface `lateral` units off the centre line
   * at `s` (positive is left of the way from A to B), or on the ground past
   * the section's foot, written into `point`; `ahead` (A to B) and `side`
   * (to its left) are unit tangents there.
   */
  surface(s: number, lateral: number, point: THREE.Vector3, ahead: THREE.Vector3, side: THREE.Vector3): void;
  /** The ground's elevation under a point, as a radius. */
  groundRadius(point: THREE.Vector3): number;
  /**
   * What a bridge pier stands on under a point, as a radius: the sea floor
   * over water, the land elsewhere. Defaults to `groundRadius`.
   */
  floorRadius?(point: THREE.Vector3): number;
  /**
   * Whether a thing at `point` with `footprint` either side is clear of every
   * other road's top less `OTHER_EDGE`. Absent means the road is alone.
   */
  clear?(point: THREE.Vector3, footprint: number): boolean;
  /**
   * The highest any other road's top stands under `point`, as a radius, or 0:
   * what a lamp's arm over a shared approach must clear. Absent means alone.
   */
  roofline?(point: THREE.Vector3): number;
  /** Town names at each end, for their name boards. */
  nameA?: string;
  nameB?: string;
  /** Whether each end is a built town, and whether it gets lamps. */
  townA: boolean;
  townB: boolean;
  lampsA: boolean;
  lampsB: boolean;
  /** The side traffic keeps to: 1 on the left of its motion, -1 on the right. */
  keep: number;
  /** Where the country starts at each end, measured from that end. */
  countryA: number;
  countryB: number;
  /** A seed of the road's own. */
  seed: string;
  /**
   * The road's bridge: where its water starts and stops along the road, and
   * how far each ramp runs onto the land. Null or absent for none.
   */
  bridge?: readonly [number, number, number] | null;
}

/** A road's roadside as buffers, in world units at double precision, and its lamp heads. */
export interface Roadside {
  position: number[];
  normal: number[];
  color: number[];
  /** Two `atlasLit` bytes a vertex: a lamp head burns till dawn. */
  lit: number[];
  heads: number[];
}
