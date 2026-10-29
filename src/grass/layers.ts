/** The tangent frame a layer is baked in, its two fields, and the jobs that fill them. */
import * as THREE from 'three';

/** A tangent frame: the anchor's up, and `across` and `north` along the ground. */
export interface Frame {
  /** The planet's radius, units: the sphere the tangent plane touches. */
  radius: number;
  up: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const basis = new THREE.Matrix4();

/**
 * The frame every tile and town builds: +Z toward the pole along the ground,
 * X = Y cross Z. `makeBasis(east, up, north)` is the reflection; this is the
 * rotation, and a reflection here would mirror every blade.
 */
export function frameAt(direction: THREE.Vector3, frame: Frame): boolean {
  frame.up.copy(direction).normalize();
  frame.north.set(0, 1, 0).projectOnPlane(frame.up);
  if (frame.north.lengthSq() < 1e-8) frame.north.set(1, 0, 0).projectOnPlane(frame.up);
  frame.north.normalize();
  frame.across.crossVectors(frame.up, frame.north).normalize();
  basis.makeBasis(frame.across, frame.up, frame.north);
  if (basis.determinant() <= 0) return false;
  frame.quaternion.setFromRotationMatrix(basis);
  return true;
}

/** A point of the frame's tangent plane, `(x, z)` in units, as a direction from the planet's centre. */
export function directionIn(frame: Frame, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(frame.up)
    .multiplyScalar(frame.radius)
    .addScaledVector(frame.across, x)
    .addScaledVector(frame.north, z)
    .normalize();
}

/** A world point in the frame: `x`, `z` on the tangent plane in units, `y` its height over the sphere. */
export function tangentOf(frame: Frame, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const length = point.length();
  const up = point.dot(frame.up) / length;
  if (up <= 1e-6) return out.set(Infinity, 0, Infinity);
  return out.set(
    (frame.radius * point.dot(frame.across)) / length / up,
    length - frame.radius,
    (frame.radius * point.dot(frame.north)) / length / up,
  );
}

/**
 * One field: a window of `size` texels a side on the frame's texel lattice,
 * held as a torus (texel `(I, J)` lives at `(I mod size, J mod size)`) so the
 * window moves by the line it takes on. The data are the ground's height over
 * the sphere in units, the density, the dryness and whether there is ground
 * there at all: 0 where there is none, else 1 and how far the ground goes on
 * past the texel (`GrassSite.edge`) (a float texture read texel by texel), and the colour (sRGB
 * bytes, filtered) with how tall the grass stands of what it would
 * (`GrassSite.height`) in its alpha.
 */
export interface Field {
  texel: number;
  size: number;
  data: Float32Array;
  paint: Uint8Array;
  dataTexture: THREE.DataTexture;
  paintTexture: THREE.DataTexture;
  /** The shader's view of the window: its first texel's indices, units a texel, and the size, or 0 while nothing is valid. */
  window: THREE.Vector4;
  i0: number;
  j0: number;
  valid: boolean;
  /** Patches to bake again in place, in texel indices: `[i0, i1, j0, j1]`, half-open. */
  dirty: number[][];
  /** Seconds the last fill took: how far ahead of a moving camera the next one is laid. */
  fillSeconds: number;
}

export function createField(texel: number, size: number): Field {
  const data = new Float32Array(size * size * 4);
  const paint = new Uint8Array(size * size * 4);
  const dataTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  dataTexture.minFilter = THREE.NearestFilter;
  dataTexture.magFilter = THREE.NearestFilter;
  dataTexture.generateMipmaps = false;
  const paintTexture = new THREE.DataTexture(paint, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  paintTexture.colorSpace = THREE.SRGBColorSpace;
  paintTexture.wrapS = THREE.RepeatWrapping;
  paintTexture.wrapT = THREE.RepeatWrapping;
  paintTexture.minFilter = THREE.LinearFilter;
  paintTexture.magFilter = THREE.LinearFilter;
  paintTexture.generateMipmaps = false;
  return { texel, size, data, paint, dataTexture, paintTexture, window: new THREE.Vector4(0, 0, texel, 0), i0: 0, j0: 0, valid: false, dirty: [], fillSeconds: 0 };
}

/** A layer: a frame and its two fields, and the ring meshes that draw from them. */
export interface Layer {
  frame: Frame;
  fine: Field;
  coarse: Field;
  group: THREE.Group;
  uniforms: Record<string, THREE.IUniform>;
  /** 0 to 1: how grown in it is. */
  appear: number;
  /** Growing in (the shown layer), going (the one replaced), or neither. */
  shown: boolean;
  /** When its fill began, for `lastFillMs`; negative once reported. */
  began: number;
  /** Whether it has been anchored at all. */
  anchored: boolean;
}

/** The shown layer and the one being laid round a new anchor; they swap. */
export interface Layers {
  front: Layer;
  back: Layer;
}

/**
 * A piece of baking: a rectangle of texel indices of one field, column by
 * column, and what to do with the window when it is whole.
 */
export interface Job {
  layer: Layer;
  field: Field;
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  /** Texels done, column-major. */
  done: number;
  /** A fill makes the field valid; a shift moves the window by one line; a patch changes nothing but the data. */
  kind: 'fill' | 'shift-i+' | 'shift-i-' | 'shift-j+' | 'shift-j-' | 'patch';
  /** Which gather this job's texels were asked under. */
  gathered: number;
  /** When it was made, ms (`performance.now`). */
  made: number;
}
