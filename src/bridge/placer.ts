import * as THREE from 'three';
import { onPalette } from '../models.ts';
import type { SpacePiece } from '../space-kit.ts';
import { BASE_PAINT, H, INDICATOR, PLAN } from './plan.ts';

/** A buffer being filled: the solid one carries normals for the light and the outline, the glow one its blink. */
export class Buffer {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly outlineNormal: number[] = [];
  readonly color: number[] = [];
  readonly blink: number[] = [];

  geometry(withNormals: boolean): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    if (withNormals) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
      geometry.setAttribute('outlineNormal', new THREE.Float32BufferAttribute(this.outlineNormal, 3));
    } else {
      geometry.setAttribute('blink', new THREE.Float32BufferAttribute(this.blink, 3));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** Where a piece goes: its base's middle at `at`, turned `yaw`, scaled per axis on top of its own scale. */
export interface Placing {
  at: THREE.Vector3;
  yaw?: number;
  /** Turned about its own long axis first (a pipe laid down). */
  roll?: number;
  /** Upside down (a ceiling tile). */
  flip?: boolean;
  /** Put down by its middle rather than its base: a pipe laid on its side. */
  middle?: boolean;
  scale?: readonly [number, number, number];
  /** The architecture's scale or the furniture's. */
  unit: number;
  paint?: Readonly<Record<string, THREE.Color>>;
  /** Slots that glow instead, in one colour, and how. */
  glow?: { slots: readonly string[]; colour: number; kind: number };
}

/** Fills the room's two buffers from the kit's pieces. */
export interface Placer {
  solid: Buffer;
  glow: Buffer;
  /** The room's seeded generator; every small choice draws from it in order. */
  roll: () => number;
  /** Adds a kit piece. Throws if the kit lacks it. */
  place(id: string, placing: Placing): void;
  /** A flat plate cut to the plan at `y`, facing up or down, closing what the tiles leave. */
  plate(y: number, up: boolean, colour: THREE.Color): void;
}

const scratch = {
  matrix: new THREE.Matrix4(),
  normalMatrix: new THREE.Matrix3(),
  centre: new THREE.Matrix4(),
  rotation: new THREE.Matrix4(),
  scale: new THREE.Matrix4(),
  euler: new THREE.Euler(),
  v: new THREE.Vector3(),
  n: new THREE.Vector3(),
};

export function createPlacer(pieces: ReadonlyMap<string, SpacePiece>, roll: () => number): Placer {
  const solid = new Buffer();
  const glow = new Buffer();
  /** The glow's own clock per piece: a phase, a rate and its kind. */
  const blinkOf = (kind: number): [number, number, number] => [roll(), kind === INDICATOR ? 0.6 + roll() * 1.4 : 0.6 + roll() * 0.9, kind];

  function place(id: string, placing: Placing): void {
    const piece = pieces.get(id);
    if (piece === undefined) throw new Error(`bridge: the kit has no ${id}`);
    const { model } = piece;
    const box = model.box;
    // The base's middle to the origin, then scaled, turned and put down: T * R * S * C.
    const lift = placing.middle === true ? (box.min.y + box.max.y) / 2 : box.min.y;
    scratch.centre.makeTranslation(-(box.min.x + box.max.x) / 2, -lift, -(box.min.z + box.max.z) / 2);
    const [sx, sy, sz] = placing.scale ?? [1, 1, 1];
    scratch.scale.makeScale(sx * placing.unit, sy * placing.unit, sz * placing.unit);
    scratch.euler.set(placing.flip === true ? Math.PI : 0, placing.yaw ?? 0, placing.roll ?? 0, 'YXZ');
    scratch.rotation.makeRotationFromEuler(scratch.euler);
    scratch.matrix.makeTranslation(placing.at.x, placing.at.y, placing.at.z).multiply(scratch.rotation).multiply(scratch.scale).multiply(scratch.centre);
    // A reflected basis turns the outline hull inside out (OutlineEffect draws its hull BackSide).
    if (!(scratch.matrix.determinant() > 0)) throw new Error(`bridge: ${id} placed with a reflected basis`);
    scratch.normalMatrix.getNormalMatrix(scratch.matrix);

    const colours = model.slots.map((slot, s) => placing.paint?.[slot] ?? BASE_PAINT[slot] ?? onPalette(model.defaults[s]!));
    const glowing = model.slots.map((slot) => placing.glow?.slots.includes(slot) === true);
    const glowColour = placing.glow === undefined ? null : new THREE.Color(placing.glow.colour);
    const blink = placing.glow === undefined ? null : blinkOf(placing.glow.kind);

    const position = model.geometry.getAttribute('position');
    const normal = model.geometry.getAttribute('normal');
    const outline = model.geometry.getAttribute('outlineNormal');
    const index = model.geometry.index;
    const count = index === null ? position.count : index.count;
    for (let i = 0; i < count; i += 3) {
      const first = index === null ? i : index.getX(i);
      const lit = glowing[model.slot[first]!] === true;
      const into = lit ? glow : solid;
      for (let k = 0; k < 3; k++) {
        const v = index === null ? i + k : index.getX(i + k);
        scratch.v.fromBufferAttribute(position, v).applyMatrix4(scratch.matrix);
        into.position.push(scratch.v.x, scratch.v.y, scratch.v.z);
        if (lit) {
          into.color.push(glowColour!.r, glowColour!.g, glowColour!.b);
          into.blink.push(...blink!);
        } else {
          const c = colours[model.slot[v]!]!;
          into.color.push(c.r, c.g, c.b);
          scratch.n.fromBufferAttribute(normal, v).applyMatrix3(scratch.normalMatrix).normalize();
          into.normal.push(scratch.n.x, scratch.n.y, scratch.n.z);
          scratch.n.fromBufferAttribute(outline ?? normal, v).applyMatrix3(scratch.normalMatrix).normalize();
          into.outlineNormal.push(scratch.n.x, scratch.n.y, scratch.n.z);
        }
      }
    }
  }

  function plate(y: number, up: boolean, colour: THREE.Color): void {
    const shape = new THREE.Shape(PLAN.map(([x, z]) => new THREE.Vector2(x * H, -z * H)));
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).toNonIndexed();
    const position = geometry.getAttribute('position');
    const triangles = position.count / 3;
    for (let t = 0; t < triangles; t++) {
      // A ceiling's plate is the same triangles wound the other way.
      const order = up ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) {
        solid.position.push(position.getX(t * 3 + k), y, position.getZ(t * 3 + k));
        solid.normal.push(0, up ? 1 : -1, 0);
        solid.outlineNormal.push(0, up ? 1 : -1, 0);
        solid.color.push(colour.r, colour.g, colour.b);
      }
    }
    geometry.dispose();
  }

  return { solid, glow, roll, place, plate };
}
