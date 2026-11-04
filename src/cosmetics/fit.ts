/**
 * Where a cosmetic goes on a body, measured off the body itself.
 *
 * Everything is in the rig's own frame, the pack's metres with the soles at
 * y = 0 and the face towards +Z: the frame the cast's raw vertices are in
 * (its bind matrix is the identity) and the one a bone's inverse bind
 * matrix carries into that bone's own. So a hat built here and hung on the
 * `Head` bone through `Head`'s inverse bind matrix sits where it was built
 * while the head is at rest, and follows it through every clip and seat.
 *
 * A head is measured by its vertices, the ones skinned mostly to `Head`:
 * where its crown is, where the eyes are (the only surface with no finish,
 * `atlasRole` 0) and the cloud of hair and skull over them that a hat has
 * to cover. The back is measured by the torso's: how far behind the spine
 * its furthest point is, across the shoulder blades, with the rucksack if
 * one is worn.
 */
import type * as THREE from 'three';
import type { BodyKind, OutfitId, Person } from '../cast.ts';

/** The heads whose hair or headgear leaves no room for a hat: a crest, a hood, a hat of their own. */
export const HATLESS_HEADS: ReadonlySet<OutfitId> = new Set<OutfitId>(['man-punk', 'man-farmer', 'man-worker', 'woman-punk', 'woman-medieval', 'woman-worker']);

/** Whether a head takes a hat at all. */
export const takesHat = (head: OutfitId): boolean => !HATLESS_HEADS.has(head);

export interface HeadFit {
  body: BodyKind;
  head: OutfitId;
  /** The top of the hair. */
  crown: number;
  /** The top of the eyes, and how far forward they are. */
  eyeTop: number;
  eyeFront: number;
  /** The middle of the skull front to back, over the eyes. */
  centreZ: number;
  /** The head's points from the eyes up, x y z flat. */
  cloud: Float32Array;
  /** How wide the head is at the ears (half), and how high they are. */
  earHalf: number;
  earY: number;
}

export interface BackFit {
  /** The furthest back the torso (or a rucksack) reaches between the shoulder blades. */
  backZ: number;
  /** The furthest back the body reaches below them, down the hips: what a long piece clears. */
  lowZ: number;
  /** The top of the shoulders. */
  shoulderY: number;
}

/** Which bone each vertex is skinned to most, by index into the skeleton. */
function dominantBones(geometry: THREE.BufferGeometry): Uint8Array {
  const index = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  const out = new Uint8Array(index.count);
  for (let v = 0; v < index.count; v++) {
    let best = -1;
    let bone = 0;
    for (let k = 0; k < 4; k++) {
      const w = weight.getComponent(v, k);
      if (w > best) {
        best = w;
        bone = index.getComponent(v, k);
      }
    }
    out[v] = bone;
  }
  return out;
}

const heads = new Map<string, HeadFit>();
const backs = new Map<string, BackFit>();
/** How many fits are kept before the oldest go; a fit is a few kilobytes. */
const KEEP = 48;

function keep<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= KEEP) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

/** The head `person` wears (`head`, the outfit its head part is from), measured once per body and head. */
export function headFitOf(person: Person, body: BodyKind, head: OutfitId): HeadFit {
  const key = `${body}:${head}`;
  const known = heads.get(key);
  if (known !== undefined) return known;
  const geometry = person.mesh.geometry;
  const position = geometry.getAttribute('position');
  const role = geometry.getAttribute('atlasRole');
  const bones = dominantBones(geometry);
  const headIndex = person.mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
  let crown = -Infinity;
  let eyeTop = -Infinity;
  let eyeFront = -Infinity;
  for (let v = 0; v < position.count; v++) {
    if (bones[v] !== headIndex) continue;
    const y = position.getY(v);
    crown = Math.max(crown, y);
    if (role !== undefined && role.getX(v) === 0) {
      eyeTop = Math.max(eyeTop, y);
      eyeFront = Math.max(eyeFront, position.getZ(v));
    }
  }
  if (!Number.isFinite(eyeTop)) eyeTop = crown - 0.15;
  const cloud: number[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  let earHalf = 0;
  const earY = eyeTop - 0.02;
  for (let v = 0; v < position.count; v++) {
    if (bones[v] !== headIndex) continue;
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    if (Math.abs(y - earY) < 0.02) earHalf = Math.max(earHalf, Math.abs(x));
    if (y < eyeTop) continue;
    cloud.push(x, y, z);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  return keep(heads, key, {
    body,
    head,
    crown,
    eyeTop,
    eyeFront,
    centreZ: (zMin + zMax) / 2,
    cloud: Float32Array.from(cloud),
    earHalf,
    earY,
  });
}

/** The back of `person`, measured once per wardrobe (`Person.outfit` names it). */
export function backFitOf(person: Person): BackFit {
  const known = backs.get(person.outfit);
  if (known !== undefined) return known;
  const geometry = person.mesh.geometry;
  const position = geometry.getAttribute('position');
  const bones = dominantBones(geometry);
  const names = person.mesh.skeleton.bones.map((bone) => bone.name);
  const torso = new Set(['Chest', 'Torso', 'Abdomen', 'Neck'].map((name) => names.indexOf(name)));
  const hips = new Set(['Hips', 'Abdomen', 'Torso', 'UpperLegL', 'UpperLegR'].map((name) => names.indexOf(name)));
  let backZ = Infinity;
  let lowZ = Infinity;
  let shoulderY = 0;
  for (let v = 0; v < position.count; v++) {
    const bone = bones[v]!;
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    if (hips.has(bone) && Math.abs(x) < 0.17 && y > 0.7 && y <= 1.15) lowZ = Math.min(lowZ, z);
    if (!torso.has(bone)) continue;
    if (Math.abs(x) < 0.12 && y > 1.15 && y < 1.5) backZ = Math.min(backZ, z);
    if (Math.abs(Math.abs(x) - 0.13) < 0.02) shoulderY = Math.max(shoulderY, y);
  }
  if (!Number.isFinite(backZ)) backZ = -0.06;
  if (!Number.isFinite(lowZ)) lowZ = backZ;
  return keep(backs, person.outfit, { backZ, lowZ, shoulderY: shoulderY || 1.52 });
}

/** An ellipse about the head's middle, x half-width and z half-depth: what a hat's band is cut to. */
export interface Band {
  y: number;
  cz: number;
  rx: number;
  rz: number;
}

/**
 * The band at height `y` that holds every point of the head above it, `room`
 * clear (metres): the ellipse through the cloud's widest points, grown until
 * none is outside it.
 */
export function bandAt(fit: HeadFit, y: number, room: number): Band {
  const c = fit.cloud;
  let rx = 0.05;
  let rz = 0.05;
  for (let i = 0; i < c.length; i += 3) {
    if (c[i + 1]! < y) continue;
    rx = Math.max(rx, Math.abs(c[i]!));
    rz = Math.max(rz, Math.abs(c[i + 2]! - fit.centreZ));
  }
  let k = 1;
  for (let i = 0; i < c.length; i += 3) {
    if (c[i + 1]! < y) continue;
    k = Math.max(k, Math.hypot(c[i]! / rx, (c[i + 2]! - fit.centreZ) / rz));
  }
  return { y, cz: fit.centreZ, rx: rx * k + room, rz: rz * k + room };
}

/** A half-dome over a band: its radii there and its height, holding every point of the head above the band. */
export interface Dome extends Band {
  height: number;
}

/**
 * The half-ellipsoid on `band` that holds every point of the head over it,
 * `room` clear: as tall as the crown over the band, then grown, radii and
 * height together, until none is outside it.
 */
export function domeOver(fit: HeadFit, band: Band, room: number): Dome {
  const c = fit.cloud;
  const height = Math.max(0.03, fit.crown - band.y);
  let k = 1;
  for (let i = 0; i < c.length; i += 3) {
    const up = c[i + 1]! - band.y;
    if (up < 0) continue;
    k = Math.max(k, Math.hypot(c[i]! / band.rx, (c[i + 2]! - band.cz) / band.rz, up / height));
  }
  const grow = k + room / Math.min(band.rx, band.rz);
  return { ...band, rx: band.rx * grow, rz: band.rz * grow, height: height * grow };
}
