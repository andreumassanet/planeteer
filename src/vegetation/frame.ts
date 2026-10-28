/** A tile's tangent frame, and what is read off it: solids and crowns in the world. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, groundRadius } from '../globe.ts';
import { placeCrown } from '../scenery/tree-forms.ts';
import type { LeafArrays } from '../scenery/tree-forms.ts';
import { solidField } from '../scenery/solids.ts';
import type { Solid } from '../scenery/solids.ts';
import { partShape, placeShape } from '../scenery/occupancy.ts';
import type { PartShape } from '../scenery/occupancy.ts';
import type { CountryMachine } from '../countryside-tile.ts';
import { SOLID_MARGIN } from './tiles.ts';
import type { FlatVariant, Tile, TileWalls } from './tiles.ts';

const ONE = new THREE.Vector3(1, 1, 1);

/** The tile's own tangent frame: `up`, `north` and `across`, the basis, the origin on the ground, and the matrices in and out. */
export interface TileFrame {
  up: THREE.Vector3;
  north: THREE.Vector3;
  across: THREE.Vector3;
  basis: THREE.Matrix4;
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
  origin: THREE.Vector3;
}

export interface Placed {
  flat: FlatVariant;
  matrix: THREE.Matrix4;
  /** A near tree's cards. */
  leaves?: LeafArrays | null;
  /** Whether the wood bends in the wind. */
  sways?: boolean;
  /** A vehicle the fleet can take. */
  machine?: CountryMachine;
}

export interface Framer {
  frame: TileFrame;
  /** Sets the frame for `tile`. False, and reported, if the basis reflects. */
  frameTile(tile: Tile): boolean;
  /** Where a local offset from the tile centre lands on the sphere. */
  directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3;
  /** The tile's solids, in the frame `frameTile` has just set. */
  wallsOf(tile: Tile, placed: readonly Placed[]): TileWalls | null;
  /** The placed trees' crowns in the world, in the frame `frameTile` has just set. */
  crownsOf(placed: readonly Placed[]): Float32Array | null;
  /** The walls `wallsOf` placed for each vehicle in the tile it last walled. */
  machineWalls: Map<CountryMachine, Solid[]>;
  /** And for each trunk and each small country piece, which a vehicle may knock over. */
  propWalls: Map<Placed, Solid[]>;
}

export function createFramer(world: World, broken: string[]): Framer {
  const frame: TileFrame = {
    up: new THREE.Vector3(),
    north: new THREE.Vector3(),
    across: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
    matrix: new THREE.Matrix4(),
    inverse: new THREE.Matrix4(),
    origin: new THREE.Vector3(),
  };
  const quaternion = new THREE.Quaternion();

  function frameTile(tile: Tile): boolean {
    const { up, north, across, basis, matrix, inverse, origin } = frame;
    up.copy(tile.direction);
    // +Z along the ground towards the pole, X = Y cross Z. `makeBasis(east, up,
    // north)` is a reflection that fills a mesh with ink, which an ordinary
    // `Mesh` hides by discarding it.
    north.set(0, 1, 0).projectOnPlane(up);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
    north.normalize();
    across.crossVectors(up, north).normalize();
    basis.makeBasis(across, up, north);
    if (basis.determinant() <= 0) {
      broken.push(`${tile.key}: tile basis has determinant ${basis.determinant()}`);
      return false;
    }
    origin.copy(up).multiplyScalar(groundRadius(world, up));
    matrix.compose(origin, quaternion.setFromRotationMatrix(basis), ONE);
    inverse.copy(matrix).invert();
    return true;
  }

  function directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(frame.up)
      .addScaledVector(frame.across, x / PLANET_RADIUS)
      .addScaledVector(frame.north, z / PLANET_RADIUS)
      .normalize();
  }

  /** Each part's obstacle, measured once from its first build. */
  const shapes = new WeakMap<object, PartShape>();
  const machineWalls = new Map<CountryMachine, Solid[]>();
  const propWalls = new Map<Placed, Solid[]>();

  /**
   * A disc for every trunk and boulder placed and the measured walls of every
   * farm building, each where its placed matrix puts it: what is solid is what
   * is drawn. A trunk takes no roof (`top` 0) so the camera passes the trees;
   * a building's walls take the height of what stands over them.
   */
  function wallsOf(tile: Tile, placed: readonly Placed[]): TileWalls | null {
    const solids: Solid[] = [];
    const ground = frame.origin.length();
    machineWalls.clear();
    propWalls.clear();
    for (const item of placed) {
      const kind = item.flat.solid;
      if (kind === undefined) continue;
      let shape = shapes.get(item.flat);
      if (shape === undefined) {
        shape = partShape(item.flat.position, kind);
        shapes.set(item.flat, shape);
      }
      const from = solids.length;
      placeShape(shape, item.matrix.elements, ground, solids);
      if (item.machine !== undefined) machineWalls.set(item.machine, solids.slice(from));
      else if (kind === 'trunk' || item.flat.breaks !== undefined) propWalls.set(item, solids.slice(from));
    }
    if (solids.length === 0) return null;
    return {
      field: solidField(solids),
      solids,
      across: frame.across.clone(),
      north: frame.north.clone(),
      up: frame.up.clone(),
      cosBound: Math.cos((Math.hypot(tile.halfEast, tile.halfNorth) + SOLID_MARGIN) / PLANET_RADIUS),
    };
  }

  const crownList: number[] = [];
  const crownMatrix = new THREE.Matrix4();

  function crownsOf(placed: readonly Placed[]): Float32Array | null {
    crownList.length = 0;
    for (const item of placed) {
      if (item.leaves == null) continue;
      crownMatrix.multiplyMatrices(frame.matrix, item.matrix);
      placeCrown(item.leaves, crownMatrix, crownList);
    }
    return crownList.length === 0 ? null : Float32Array.from(crownList);
  }

  return { frame, frameTile, directionAt, wallsOf, crownsOf, machineWalls, propWalls };
}
