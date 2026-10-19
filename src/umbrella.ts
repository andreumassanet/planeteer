/**
 * Umbrellas for the crowd: in the rain most people put one up, held in the
 * right hand over the head, and furl it when the rain stops.
 *
 * Each crowd (the townsfolk, the verge walkers) owns one `Umbrellas`: one
 * instanced mesh of a code-built umbrella, coloured per instance, so a whole
 * street of them is one draw call and one hull. Who carries one, its colour
 * and how wet it has to be before it goes up are seeded by the person's key.
 *
 * The arm is posed over the clips: `unpose` puts back what the clips left
 * before the mixer runs (the mixer writes a bone only when its blend changes),
 * `pose` raises the arm after it, by as much as the umbrella is open.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { aimArm } from './cast.ts';
import type { Limbs, Person } from './cast.ts';
import { moverMaterial } from './life/material.ts';
import { rngFrom } from './scenery/random.ts';

/** The share of people who carry one. */
export const UMBRELLA_SHARE = 0.7;
/** The rain (`WeatherView.sound.rain`, 0 to 1) at which the first goes up, and the spread over which the rest follow. */
export const UMBRELLA_RAIN: readonly [number, number] = [0.2, 0.25];
/** Seconds to open or to furl. */
export const UMBRELLA_OPEN_TIME = 0.8;
/** How furled a closing umbrella's canopy gets before it is put away, as a share of its open radius. */
const FURLED = 0.12;

/** Canopy colours: bright and dark, never black, which the ink would read as ink. */
export const UMBRELLA_COLOURS: readonly number[] = [
  0xc8423a, 0x2f4f8f, 0xe3b23c, 0x3f7f4f, 0x4a4a5a, 0x2a9d9f, 0x7b4f9d, 0xe07b39, 0xd9d4c7, 0xb5476e,
];

/** The arm's two directions in the person's own frame (+Y up, +Z ahead, -X their right): elbow by the side, hand up before the chest. */
const UPPER_ARM = new THREE.Vector3(-0.35, -0.8, 0.5).normalize();
const FOREARM = new THREE.Vector3(0.25, 0.75, 0.6).normalize();

let rainNow = 0;

/** The rain where the player stands, 0 to 1, once a frame; every crowd reads it. */
export function setUmbrellaRain(rain: number): void {
  rainNow = Number.isFinite(rain) ? Math.max(0, Math.min(1, rain)) : 0;
}

/** The rain the crowds are answering, 0 to 1. */
export function umbrellaRain(): number {
  return rainNow;
}

/** Whether a person with this key carries an umbrella, its colour, and the rain it goes up at: a pure function of the key. */
export function umbrellaOf(key: string): { carries: boolean; colour: number; threshold: number } {
  const rng = rngFrom(key, 'umbrella');
  const carries = rng.unit() < UMBRELLA_SHARE;
  const colour = UMBRELLA_COLOURS[Math.floor(rng.unit() * UMBRELLA_COLOURS.length) % UMBRELLA_COLOURS.length]!;
  const threshold = UMBRELLA_RAIN[0] + rng.unit() * UMBRELLA_RAIN[1];
  return { carries, colour, threshold };
}

/** One umbrella's geometry for a body one unit tall, the hand at the origin: a shaft, a closed eight-ribbed canopy and a tip. */
export function umbrellaGeometry(): THREE.BufferGeometry {
  const paint = (geometry: THREE.BufferGeometry, shade: number): THREE.BufferGeometry => {
    const flat = geometry.toNonIndexed();
    flat.deleteAttribute('uv');
    flat.computeVertexNormals();
    const count = flat.getAttribute('position').count;
    flat.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(shade), 3));
    return flat;
  };
  const canopy = new THREE.ConeGeometry(0.5, 0.15, 8, 1, false);
  canopy.translate(0, 0.405, 0);
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.56, 4, 1, false);
  shaft.translate(0, 0.2, 0);
  const tip = new THREE.CylinderGeometry(0.006, 0.014, 0.05, 4, 1, false);
  tip.translate(0, 0.505, 0);
  const merged = mergeGeometries([paint(canopy, 1), paint(shaft, 0.3), paint(tip, 0.3)])!;
  merged.computeBoundingSphere();
  return merged;
}

/** The right arm's bones, found by name without touching the pose (three drops the dot from a glTF name). */
function rightArm(person: Person): Limbs['arms'][number] | null {
  const bone = (name: string) => person.bones.get(name) ?? person.bones.get(name.replace('.', ''));
  const upper = bone('UpperArm.R');
  const lower = bone('LowerArm.R');
  const wrist = bone('Wrist.R');
  return upper === undefined || lower === undefined || wrist === undefined ? null : { upper, lower, wrist };
}

interface Grip {
  key: string;
  carries: boolean;
  colour: THREE.Color;
  threshold: number;
  /** 0 furled and put away, 1 open. */
  open: number;
  /** Whether the rain has it up: opened past `threshold`, furled under it. */
  up: boolean;
  arm: Limbs['arms'][number];
  saved: [THREE.Quaternion, THREE.Quaternion];
  posed: boolean;
}

export interface Umbrellas {
  readonly mesh: THREE.InstancedMesh;
  /** Before the frame's people: forgets last frame's umbrellas. */
  begin(): void;
  /** Before `person`'s mixer runs: the arm back where the clips left it. */
  unpose(person: Person): void;
  /** After it: opens or furls by the rain, `dt` seconds, and raises the arm by as much. */
  pose(person: Person, key: string, dt: number): void;
  /** Draws `person`'s umbrella this frame, if it is out. */
  emit(person: Person): void;
  /** After the frame's people. */
  end(): void;
  /** A person gone back to the pool: the arm put back, the umbrella forgotten. */
  release(person: Person): void;
  readonly stats: { shown: number };
}

/** Every body's grip, whichever crowd holds it: a pooled body may be dressed by either. */
const grips = new WeakMap<Person, Grip>();

function unposeGrip(person: Person): void {
  const grip = grips.get(person);
  if (grip === undefined || !grip.posed) return;
  grip.arm.upper.quaternion.copy(grip.saved[0]);
  grip.arm.lower.quaternion.copy(grip.saved[1]);
  grip.posed = false;
}

/** A body going back to the cast's pool: its arm put back where the clips left it, its umbrella forgotten. */
export function releaseUmbrella(person: Person): void {
  unposeGrip(person);
  const grip = grips.get(person);
  if (grip === undefined) return;
  grip.key = '';
  grip.open = 0;
  grip.up = false;
}

const at = new THREE.Vector3();
const turn = new THREE.Quaternion();
const size = new THREE.Vector3();
const matrix = new THREE.Matrix4();

/**
 * One umbrella instanced once, for the warm-up (`warm.ts`): instancing and a
 * colour per instance make a program of their own, which the first rain
 * would otherwise link mid-game.
 */
export function umbrellaProxy(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(umbrellaGeometry(), moverMaterial(false), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export function createUmbrellas(cap: number): Umbrellas {
  const material = moverMaterial(false);
  const mesh = new THREE.InstancedMesh(umbrellaGeometry(), material, cap);
  mesh.name = 'umbrellas';
  mesh.count = 0;
  // The instances are spread over the whole crowd; the geometry's own sphere is one umbrella at the origin.
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  const stats = { shown: 0 };

  function gripOf(person: Person, key: string): Grip | null {
    let grip = grips.get(person);
    if (grip === undefined) {
      const arm = rightArm(person);
      if (arm === null) return null;
      grip = {
        key: '', carries: false, colour: new THREE.Color(), threshold: 1, open: 0, up: false,
        arm, saved: [new THREE.Quaternion(), new THREE.Quaternion()], posed: false,
      };
      grips.set(person, grip);
    }
    if (grip.key !== key) {
      const own = umbrellaOf(key);
      grip.key = key;
      grip.carries = own.carries;
      grip.colour.setHex(own.colour);
      grip.threshold = own.threshold;
      grip.open = 0;
      grip.up = false;
    }
    return grip;
  }

  const unpose = unposeGrip;

  function pose(person: Person, key: string, dt: number): void {
    // Nobody carrying one in a dry spell needs a grip at all.
    const known = grips.get(person);
    if (rainNow <= 0 && (known === undefined || known.open <= 0)) return;
    const grip = gripOf(person, key);
    if (grip === null || !grip.carries) return;
    if (rainNow > grip.threshold) grip.up = true;
    else if (rainNow < grip.threshold - 0.05) grip.up = false;
    const target = grip.up ? 1 : 0;
    const step = dt / UMBRELLA_OPEN_TIME;
    grip.open = target > grip.open ? Math.min(target, grip.open + step) : Math.max(target, grip.open - step);
    if (grip.open <= 0) return;
    const { upper, lower } = grip.arm;
    grip.saved[0].copy(upper.quaternion);
    grip.saved[1].copy(lower.quaternion);
    grip.posed = true;
    person.root.updateMatrixWorld(true);
    aimArm(grip.arm, person.root, UPPER_ARM, FOREARM);
    const w = THREE.MathUtils.smoothstep(grip.open, 0, 0.6);
    if (w < 1) {
      upper.quaternion.slerpQuaternions(grip.saved[0], upper.quaternion, w);
      lower.quaternion.slerpQuaternions(grip.saved[1], lower.quaternion, w);
    }
  }

  function emit(person: Person): void {
    const grip = grips.get(person);
    if (grip === undefined || !grip.carries || grip.open <= 0 || mesh.count >= cap) return;
    grip.arm.wrist.getWorldPosition(at);
    person.root.getWorldQuaternion(turn);
    // The canopy opens out from furled; the shaft is the body's own length either way.
    const spread = person.height * THREE.MathUtils.lerp(FURLED, 1, THREE.MathUtils.smoothstep(grip.open, 0.3, 1));
    size.set(spread, person.height, spread);
    matrix.compose(at, turn, size);
    if (!(matrix.determinant() > 0)) return;
    mesh.setMatrixAt(mesh.count, matrix);
    mesh.setColorAt(mesh.count, grip.colour);
    mesh.count++;
  }

  return {
    mesh,
    stats,
    begin() {
      mesh.count = 0;
    },
    unpose,
    pose,
    emit,
    end() {
      stats.shown = mesh.count;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    },
    release: releaseUmbrella,
  };
}
