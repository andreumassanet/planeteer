/** Placing a plan's pieces into a tile: bedded to the ground like plants, with rotors, lamps and smoke handed on as rows. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { gradeAt, reliefAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import { drawnFootprint } from '../land-probe.ts';
import type { DrawnFootprint, LandProbe } from '../land-probe.ts';
import { rngFrom } from '../scenery/random.ts';
import type { RegionStyle } from '../scenery/contract.ts';
import { COUNTRY_PARTS } from '../countryside-kit.ts';
import { countryVehicleId, fleetVariant, parkedModel } from '../craft/parked.ts';
import type { CountryPiece, CountryPlan, CropField } from '../countryside.ts';
import type { Flats } from './flats.ts';
import { MACHINES, MOTION_LEVEL, PIECE_BURY, ROTOR_KINDS } from './types.ts';
import type { CountryFrame, CountryMachine, CountryPlaced } from './types.ts';
import { fieldPoint, orientField } from './surface.ts';
import type { Surface } from './surface.ts';

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** What one tile accumulates as pieces are placed. */
export interface TileAcc {
  placed: CountryPlaced[];
  rotorRows: number[];
  beaconRows: number[];
  smokeRows: number[];
  vertices: number;
  priced: number;
  pieces: number;
}

export interface Pieces {
  /** Places every piece of the plan that is legible at the tile's level. */
  placePlan(plan: CountryPlan, frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean, acc: TileAcc): void;
  /** An olive grove's trees, in their rows, legible as far as a tree is. */
  oliveGrove(plan: CountryPlan, field: CropField, frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean, acc: TileAcc): void;
}

export function createPieces(world: World, surface: Surface, flats: Flats, isTaken: () => (id: string) => boolean): Pieces {
  const up = new THREE.Vector3();
  const pieceNorth = new THREE.Vector3();
  const pieceAcross = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const world4 = new THREE.Matrix4();
  const hub4 = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const point = new THREE.Vector3();
  const faceUp = new THREE.Vector3();
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const drawnUnder: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };
  let seatedOnDrawn = false;

  /** A piece's frame at its own base: north, across, up; the spin by its yaw. */
  function frameAt(at: THREE.Vector3, yaw: number): void {
    up.copy(at);
    pieceNorth.set(0, 1, 0).projectOnPlane(up);
    if (pieceNorth.lengthSq() < 1e-8) pieceNorth.set(1, 0, 0).projectOnPlane(up);
    pieceNorth.normalize();
    pieceAcross.crossVectors(up, pieceNorth).normalize();
    basis.makeBasis(pieceAcross, up, pieceNorth);
    quaternion.setFromRotationMatrix(basis);
    quaternion.multiply(spin.setFromAxisAngle(AXIS_Y, yaw));
  }

  /**
   * How high a piece's base is: bedded to the lowest of the ground under its
   * footprint, the drawn land's where the probe has it (`drawnFootprint`),
   * else the relief's. Whether it was the drawn land is left in `seatedOnDrawn`.
   */
  function baseOf(piece: CountryPiece, land: LandProbe | undefined, landReady: boolean): number {
    seatedOnDrawn = false;
    if (piece.base !== undefined) return PLANET_RADIUS + piece.base;
    const reach = Math.max(1, piece.footprint * 0.7);
    if (land !== undefined && landReady && drawnFootprint(land, piece.at, pieceAcross, pieceNorth, reach, drawnUnder) === 'drawn') {
      seatedOnDrawn = true;
      return drawnUnder.lowest - PIECE_BURY;
    }
    const elevation = world.elevationAt(piece.at);
    const relief = reliefAt(piece.at.x, piece.at.y, piece.at.z);
    gradeAt(piece.at, pieceAcross, pieceNorth, Math.max(1, piece.footprint * 0.6), slope);
    return PLANET_RADIUS + elevation - relief + Math.min(relief, slope.lowest) - PIECE_BURY;
  }

  /** What a piece with a rotor, a lamp or smoke hands on: rows when the tile moves them, merged still parts otherwise. */
  function motionOf(piece: CountryPiece, plan: CountryPlan, index: number, frame: CountryFrame, moving: boolean, acc: TileAcc): void {
    const spec = piece.scenic ? undefined : COUNTRY_PARTS[piece.part];
    if (spec === undefined) return;
    const phase = rngFrom('country-turn', plan.key, index).unit() * Math.PI * 2;
    if (spec.rotor !== undefined) {
      point.set(spec.rotor.x, spec.rotor.y, spec.rotor.z).applyMatrix4(world4);
      if (moving) {
        axis.copy(AXIS_Z).applyQuaternion(quaternion);
        faceUp.copy(AXIS_Y).applyQuaternion(quaternion);
        acc.rotorRows.push(point.x, point.y, point.z, axis.x, axis.y, axis.z, faceUp.x, faceUp.y, faceUp.z, ROTOR_KINDS.indexOf(spec.rotor.kind), phase, piece.scale);
      } else {
        const rotor = flats.rotorOf(spec.rotor.kind);
        hub4.makeRotationZ(phase).setPosition(spec.rotor.x, spec.rotor.y, spec.rotor.z);
        acc.placed.push({ flat: rotor, matrix: new THREE.Matrix4().multiplyMatrices(frame.inverse, world4).multiply(hub4) });
        acc.vertices += rotor.position.length / 3;
        acc.priced += rotor.position.length / 3;
      }
    }
    if (spec.beacon !== undefined) {
      point.set(0, spec.beacon.y, 0).applyMatrix4(world4);
      acc.beaconRows.push(point.x, point.y, point.z, piece.at.x, piece.at.y, piece.at.z, phase);
    }
    if (spec.smoke !== undefined && moving) {
      point.set(0, spec.smoke.y, 0).applyMatrix4(world4);
      acc.smokeRows.push(point.x, point.y, point.z, piece.at.x, piece.at.y, piece.at.z);
    }
  }

  function placePlan(plan: CountryPlan, frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean, acc: TileAcc): void {
    const style: RegionStyle = plan.style;
    const moving = frame.level <= MOTION_LEVEL;
    /** The cell's row and column, off its key, for the ids of what can be taken. */
    const cell = plan.key.split('/').map(Number);
    let machines = 0;
    plan.pieces.forEach((piece, index) => {
      // A farm's tractor is the fleet's: named by its cell and its ordinal
      // among the cell's, taken or not, and left out while it is elsewhere.
      let machine: CountryMachine | undefined;
      let flat;
      if (!piece.scenic && MACHINES.has(piece.part)) {
        const id = countryVehicleId(piece.part, cell[0]!, cell[1]!, machines++);
        const model = parkedModel(piece.part);
        if (id === null || model === null || isTaken()(id)) return;
        flat = flats.machineFlat(piece.part, fleetVariant(id, model.variants));
        machine = { id, model: piece.part, position: new THREE.Vector3(), forward: new THREE.Vector3() };
      } else {
        flat = flats.flatOf(piece, style);
      }
      if (flat === null) return;
      if (flat.height * piece.scale < floor) return;
      frameAt(piece.at, piece.yaw);
      const base = baseOf(piece, land, landReady);
      scaleVector.setScalar(piece.scale);
      world4.compose(position.copy(piece.at).multiplyScalar(base), quaternion, scaleVector);
      if (piece.base === undefined) frame.seats?.push({ id: piece.part, x: position.x, y: position.y, z: position.z, reach: Math.max(1, piece.footprint * 0.7), drawn: seatedOnDrawn });
      if (machine !== undefined) {
        machine.position.copy(position);
        machine.forward.copy(AXIS_Z).applyQuaternion(quaternion);
      }
      const near = frame.cards === true && machine === undefined ? flats.nearOf(piece, style) : null;
      const drawn = near?.flat ?? flat;
      acc.placed.push({ flat: drawn, matrix: new THREE.Matrix4().multiplyMatrices(frame.inverse, world4), leaves: near?.leaves ?? null, sways: near !== null, machine });
      acc.vertices += drawn.position.length / 3;
      acc.priced += flat.position.length / 3;
      acc.pieces++;
      motionOf(piece, plan, index, frame, moving, acc);
    });
  }

  function oliveGrove(plan: CountryPlan, field: CropField, frame: CountryFrame, floor: number, land: LandProbe | undefined, landReady: boolean, acc: TileAcc): void {
    const style = plan.style;
    const olive = COUNTRY_PARTS['olive']!;
    const spacing = 8;
    const nx = Math.max(1, Math.floor((2 * field.halfX) / spacing));
    const nz = Math.max(1, Math.floor((2 * field.halfZ) / spacing));
    orientField(surface, field);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const variant = rngFrom('olive', plan.key, i, j).int(3);
        const tree = flats.flatOf({ part: olive.id, scenic: false, variant, at: field.at, yaw: 0, scale: 1, footprint: olive.footprint }, style);
        if (tree === null || tree.height < floor) continue;
        const at = fieldPoint(surface, field, -field.halfX + (i + 0.5) * ((2 * field.halfX) / nx), -field.halfZ + (j + 0.5) * ((2 * field.halfZ) / nz), new THREE.Vector3());
        const yaw = rngFrom('olive-turn', plan.key, i, j).unit() * Math.PI * 2;
        frameAt(at, yaw);
        const base = baseOf({ part: olive.id, scenic: false, variant, at, yaw, scale: 1, footprint: olive.footprint }, land, landReady);
        world4.compose(position.copy(at).multiplyScalar(base), quaternion, scaleVector.setScalar(1));
        const piece = { part: olive.id, scenic: false, variant, at, yaw, scale: 1, footprint: olive.footprint };
        const near = frame.cards === true ? flats.nearOf(piece, style) : null;
        const drawn = near?.flat ?? tree;
        acc.placed.push({ flat: drawn, matrix: new THREE.Matrix4().multiplyMatrices(frame.inverse, world4), leaves: near?.leaves ?? null, sways: near !== null });
        acc.vertices += drawn.position.length / 3;
        acc.priced += tree.position.length / 3;
      }
    }
  }

  return { placePlan, oliveGrove };
}
