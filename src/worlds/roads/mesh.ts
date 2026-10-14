/**
 * One chunk of road as a mesh: the carriageway, its shoulders, and either a
 * bank down to a toe in the ground's colour or, on a cloud deck, a bridge
 * (a steel fascia under each edge, a rail along it, pylons sinking into the
 * clouds). Marker posts and lit dashes on top. No ink, which would draw a hull
 * round a strip. The chunk is merged into one buffer.
 */

import * as THREE from 'three';
import { newSample } from '../terrain.ts';
import type { Chunk } from './chunks.ts';
import type { RoadLook } from './look.ts';
import { STEP, SHOULDER, edgeOf, sideAt } from './ribbon.ts';
import type { Ribbon, RibbonEnv } from './ribbon.ts';

/** The bank: its fall a unit outward, how far under the ground its toe is laid, and the widest it spreads. */
export const BANK_GRADE = 0.45;
export const TOE_DEPTH = 1;
export const BANK_RUN_MAX = 18;
/** The lit dashes down the middle: how long and how wide. */
const DASH = 2.6;
const DASH_HALF = 0.16;
/** How far over the carriageway a dash lies: enough not to flicker into it from far off. */
const DASH_OVER = 0.08;
/**
 * The marker posts along the shoulder, as Earth's roads keep theirs
 * (`roadside.ts`): one every this many points of the centre line (fifty
 * units), on alternate sides, none within `POST_CLEAR` points of a gate; how
 * tall and how thick, and how much of the top is the lit reflector.
 */
const POST_EVERY = 10;
const POST_CLEAR = 6;
const POST_HEIGHT = 1.5;
const POST_HALF = 0.11;
const POST_LAMP = 0.32;
/** On a deck: a pylon every this many points (forty units), how far it sinks into the clouds, the fascia's depth and the rail's height. */
const PYLON_EVERY = 8;
const PYLON_SINK = 14;
const PYLON_HALF = 0.55;
const FASCIA = 1.1;
const RAIL = 0.95;

const side = new THREE.Vector3();
const sample = newSample();

/** What laying one chunk shares between its parts. */
interface Laying {
  env: RibbonEnv;
  look: RoadLook;
  ribbon: Ribbon;
  /** Two triangles, `a -> b` along the road and `a -> d` to its right: `a`, `b` take `near`, `c`, `d` take `far`. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, near: THREE.Color, far: THREE.Color, glow: number): void;
  /** A square post standing on `foot` along `up`, `height` tall, its faces square to the road (`along`). */
  post(foot: THREE.Vector3, up: THREE.Vector3, along: THREE.Vector3, colour: THREE.Color, glow: number, height: number, thick?: number): void;
  /** The point `offset` across the top at `k`, `over` above it. */
  across(k: number, offset: number, over?: number): THREE.Vector3;
  /** The bank's toe at `k` on side `way`: out from the top's edge at `BANK_GRADE`, under the ground there, and the ground's colour. */
  toe(k: number, way: -1 | 1): { point: THREE.Vector3; colour: THREE.Color };
}

function createLaying(env: RibbonEnv, look: RoadLook, ribbon: Ribbon, origin: THREE.Vector3, out: { positions: number[]; colours: number[]; glows: number[] }): Laying {
  const { terrain, R } = env;
  const { positions, colours, glows } = out;
  const quad: Laying['quad'] = (a, b, c, d, near, far, glow) => {
    // Wound to face up: a, c, b is clockwise seen from above.
    for (const p of [a, c, b, a, d, c]) {
      positions.push(p.x - origin.x, p.y - origin.y, p.z - origin.z);
      const colour = p === a || p === b ? near : far;
      colours.push(colour.r, colour.g, colour.b);
      glows.push(glow);
    }
  };
  const post: Laying['post'] = (foot, up, along, colour, glow, height, thick = POST_HALF) => {
    const right = new THREE.Vector3().crossVectors(along, up).normalize();
    // Each face wound outward: seen from outside, `a` bottom left, `b` top left, `c` top right, `d` bottom right.
    for (const n of [along, right, along.clone().negate(), right.clone().negate()]) {
      const across = new THREE.Vector3().crossVectors(up, n);
      const a = foot.clone().addScaledVector(n, thick).addScaledVector(across, -thick);
      const d = foot.clone().addScaledVector(n, thick).addScaledVector(across, thick);
      quad(a, a.clone().addScaledVector(up, height), d.clone().addScaledVector(up, height), d, colour, colour, glow);
    }
    const top = foot.clone().addScaledVector(up, height);
    const a = top.clone().addScaledVector(along, -thick).addScaledVector(right, -thick);
    quad(a, a.clone().addScaledVector(along, thick * 2), a.clone().addScaledVector(along, thick * 2).addScaledVector(right, thick * 2), a.clone().addScaledVector(right, thick * 2), colour, colour, glow);
  };
  const across: Laying['across'] = (k, offset, over = 0) => {
    sideAt(ribbon, k, side);
    const height = ribbon.crown[k]! + ribbon.tilt[k]! * offset + over;
    return ribbon.dirs[k]!.clone().multiplyScalar(R + height).addScaledVector(side, offset);
  };
  const toes = new Map<number, { point: THREE.Vector3; colour: THREE.Color }>();
  const toe: Laying['toe'] = (k, way) => {
    const key = k * 2 + (way > 0 ? 1 : 0);
    const known = toes.get(key);
    if (known !== undefined) return known;
    const edge = edgeOf(ribbon, k);
    const top = ribbon.crown[k]! + ribbon.tilt[k]! * edge * way;
    const run = Math.min(BANK_RUN_MAX, Math.max(1, (top - (way > 0 ? ribbon.right[k]! : ribbon.left[k]!) + TOE_DEPTH) / BANK_GRADE));
    sideAt(ribbon, k, side);
    const at = ribbon.dirs[k]!.clone().multiplyScalar(R).addScaledVector(side, (edge + run) * way).normalize();
    terrain.sample(at.x, at.y, at.z, sample);
    const one = { point: at.multiplyScalar(R + sample.height - TOE_DEPTH), colour: new THREE.Color(sample.r, sample.g, sample.b) };
    toes.set(key, one);
    return one;
  };
  return { env, look, ribbon, quad, post, across, toe };
}

/** A bridge: the fascia under each edge and a rail along it, faced both ways, and a pylon under each side now and then. */
function layBridgeEdges(l: Laying, k: number, e0: number, e1: number): void {
  const { ribbon, look, quad, post, across, env } = l;
  const { R } = env;
  const { steel, white, accent, steelDark } = look;
  for (const way of [1, -1] as const) {
    const a0 = across(k, e0 * way);
    const a1 = across(k + 1, e1 * way);
    const d0 = across(k, e0 * way, -FASCIA);
    const d1 = across(k + 1, e1 * way, -FASCIA);
    const t0 = across(k, e0 * way, RAIL);
    const t1 = across(k + 1, e1 * way, RAIL);
    // Wound to face out, away from the carriageway (`quad`'s normal is `(d - a) x (b - a)`).
    if (way > 0) {
      quad(d1, d0, a0, a1, steel, steel, 0);
      quad(a0, a1, t1, t0, white, white, 0);
      quad(t0, t1, a1, a0, white, white, 0);
    } else {
      quad(d0, d1, a1, a0, steel, steel, 0);
      quad(a1, a0, t0, t1, white, white, 0);
      quad(t1, t0, a0, a1, white, white, 0);
    }
    // A lit strip along the rail's top, facing up: after dark the skyways are
    // lines of light between the floating towns.
    const s0 = across(k, (e0 - 0.18) * way, RAIL);
    const s1 = across(k + 1, (e1 - 0.18) * way, RAIL);
    const o0 = across(k, (e0 + 0.18) * way, RAIL);
    const o1 = across(k + 1, (e1 + 0.18) * way, RAIL);
    if (way > 0) quad(s0, s1, o1, o0, accent, accent, 0.9);
    else quad(o0, o1, s1, s0, accent, accent, 0.9);
    if (k % PYLON_EVERY === PYLON_EVERY / 2 && k > POST_CLEAR && k < ribbon.dirs.length - 1 - POST_CLEAR) {
      const top = across(k, (e0 - PYLON_HALF) * way, -FASCIA);
      const up = top.clone().normalize();
      const along = ribbon.dirs[k + 1]!.clone().sub(ribbon.dirs[k]!);
      along.addScaledVector(up, -along.dot(up)).normalize();
      const sink = top.length() - (R + ribbon.ground[k]!) + PYLON_SINK;
      post(top.clone().addScaledVector(up, -sink), up, along, steelDark, 0, sink, PYLON_HALF);
    }
  }
  // The underside, seen from the clouds under it.
  quad(across(k, e0, -FASCIA), across(k + 1, e1, -FASCIA), across(k + 1, -e1, -FASCIA), across(k, -e0, -FASCIA), steelDark, steelDark, 0);
}

/** A marker post on the shoulder's outer edge every `POST_EVERY` points, white with a reflector that burns after dark, alternating sides. */
function layMarkerPost(l: Laying, k: number, e0: number): void {
  const { ribbon, look, post, across } = l;
  const way = (k / POST_EVERY) % 2 === 0 ? 1 : -1;
  const foot = across(k, (e0 - 0.25) * way, 0);
  const up = foot.clone().normalize();
  const along = ribbon.dirs[k + 1]!.clone().sub(ribbon.dirs[k]!);
  along.addScaledVector(up, -along.dot(up)).normalize();
  post(foot, up, along, look.white, 0, POST_HEIGHT - POST_LAMP);
  post(foot.clone().addScaledVector(up, POST_HEIGHT - POST_LAMP), up, along, look.accent, 0.9, POST_LAMP);
}

/** A dash on every other step, half a step long: lit dashes with gaps, as the town's main streets have. */
function layDash(l: Laying, k: number): void {
  const { look, quad, across } = l;
  const share = DASH / STEP;
  const a0 = across(k, -DASH_HALF, DASH_OVER);
  const b0 = across(k, DASH_HALF, DASH_OVER);
  const a1 = a0.clone().lerp(across(k + 1, -DASH_HALF, DASH_OVER), share);
  const b1 = b0.clone().lerp(across(k + 1, DASH_HALF, DASH_OVER), share);
  quad(a0, a1, b1, b0, look.accent, look.accent, 0.8);
}

/** The carriageway between two points, its shoulders, and the bank or the bridge. */
function layPiece(l: Laying, k: number): void {
  const { ribbon, look, quad, across, toe, env } = l;
  const { half } = ribbon;
  const e0 = edgeOf(ribbon, k);
  const e1 = edgeOf(ribbon, k + 1);
  quad(across(k, -half), across(k + 1, -half), across(k + 1, half), across(k, half), look.grey, look.grey, 0);
  // The shoulders, or out of a gate the pavement carried on; then the bank,
  // from the top's edge down to its toe in the ground's colour.
  const shoulder = e0 > half + SHOULDER ? look.pavement : look.gravel;
  const r0 = toe(k, 1);
  const r1 = toe(k + 1, 1);
  const l0 = toe(k, -1);
  const l1 = toe(k + 1, -1);
  quad(across(k, half), across(k + 1, half), across(k + 1, e1), across(k, e0), shoulder, shoulder, 0);
  quad(across(k, -e0), across(k + 1, -e1), across(k + 1, -half), across(k, -half), shoulder, shoulder, 0);
  if (env.deck) layBridgeEdges(l, k, e0, e1);
  else {
    quad(across(k, e0), across(k + 1, e1), r1.point, r0.point, r0.colour, r0.colour, 0);
    quad(l0.point, l1.point, across(k + 1, -e1), across(k, -e0), l0.colour, l0.colour, 0);
  }
  if (!env.deck && k % POST_EVERY === 0 && k > POST_CLEAR && k < ribbon.dirs.length - 1 - POST_CLEAR) layMarkerPost(l, k, e0);
  if (k % 2 === 0) layDash(l, k);
}

/** Builds a chunk's mesh in `material`; the crown over its points must already be worked out. Returns it and its triangle count. */
export function layChunk(env: RibbonEnv, look: RoadLook, ribbon: Ribbon, chunk: Chunk, material: THREE.Material): { mesh: THREE.Mesh; triangles: number } {
  const out = { positions: [] as number[], colours: [] as number[], glows: [] as number[] };
  const origin = ribbon.dirs[chunk.from]!.clone().multiplyScalar(env.R + ribbon.crown[chunk.from]!);
  const laying = createLaying(env, look, ribbon, origin, out);
  for (let k = chunk.from; k < chunk.to; k++) layPiece(laying, k);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(out.colours, 3));
  geometry.setAttribute('aGlow', new THREE.Float32BufferAttribute(out.glows, 1));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(origin);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, triangles: out.positions.length / 9 };
}
