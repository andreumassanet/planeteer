import * as THREE from 'three';
import { biomeAt, biomeSample } from '../../biome.ts';
import type { FolkAnchor } from '../../folk.ts';
import { pavementOf } from '../../scenery/ground.ts';
import { rngFrom } from '../../scenery/index.ts';
import type { Ground } from '../ground/build.ts';
import { AXIS_Y } from './job.ts';
import type { RaiseJob, RaiseKit } from './job.ts';

/**
 * The near town's street life beyond its strollers: people sitting at the
 * café tables and on some benches, keepers on the doorsteps of some shops,
 * and in a city with traffic lights a few people walking its middle crossing
 * by the walk light. Published with the town's people (`folk.ts` dresses
 * them), in the town's frame until the mesh is placed; every choice is seeded
 * by the town, so every client seats the same people.
 */

/** The share of café tables with somebody at them, and of those with two talking across them. */
const CAFE_TAKEN = 0.6;
const CAFE_PAIR = 0.55;
/** The share of benches somebody sits on. */
const BENCH_TAKEN = 0.3;
/** The share of shops with their keeper out on the doorstep, and the most a town has. */
const KEEPER_SHARE = 0.5;
const KEEPER_CAP = 6;
/** How many people walk a city's middle crossing. */
const CROSSERS = 3;
/** How far behind the kerb a person waits at the crossing's corner, in world units. */
const KERB_WAIT = 0.25;

/** A shop's doorstep from the street dressing (`Anchor` kind `'shop'`), in the town's frame. */
export interface ShopDoor {
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
}

export function standStreetFolk(kit: RaiseKit, job: RaiseJob, ground: Ground, shops: readonly ShopDoor[]): void {
  const { slot } = job;
  const up = kit.frame.up;
  const warmth = biomeAt(
    up.x, up.y, up.z, slot.place.lat, slot.place.lon,
    Math.max(0, kit.world.elevationAt(up)), biomeSample(),
  ).warmth;
  const person = (key: string, x: number, y: number, z: number, yaw: number, chatting: boolean): FolkAnchor => {
    const at = new THREE.Vector3(x, y, z);
    return {
      key: `${slot.seed}|${key}`,
      position: at,
      quaternion: new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw),
      from: at.clone(),
      to: at.clone(),
      chatting,
      town: new THREE.Quaternion(),
      region: slot.style.id,
      warmth,
      distance: 0,
    };
  };

  // The café chairs come two to a table, facing across it; then the benches.
  const chairs = job.benches.filter((bench) => bench.key.startsWith('chair:'));
  for (let i = 0; i + 1 < chairs.length; i += 2) {
    const rng = rngFrom(slot.seed, 'cafe', i);
    if (!rng.chance(CAFE_TAKEN)) continue;
    const pair = rng.chance(CAFE_PAIR);
    const one = rng.int(2);
    for (let k = 0; k < 2; k++) {
      if (!pair && k !== one) continue;
      const chair = chairs[i + k]!;
      const sitter = person(`sit|${chair.key}`, chair.position.x, chair.position.y, chair.position.z, Math.atan2(chair.facing.x, chair.facing.z), pair);
      sitter.seated = true;
      job.folk.push(sitter);
    }
  }
  for (const bench of job.benches) {
    if (!bench.key.startsWith('bench:') || !rngFrom(slot.seed, 'sits', bench.key).chance(BENCH_TAKEN)) continue;
    const sitter = person(`sit|${bench.key}`, bench.position.x, bench.position.y, bench.position.z, Math.atan2(bench.facing.x, bench.facing.z), false);
    sitter.seated = true;
    job.folk.push(sitter);
  }

  let keepers = 0;
  for (let i = 0; i < shops.length && keepers < KEEPER_CAP; i++) {
    if (!rngFrom(slot.seed, 'keeper', i).chance(KEEPER_SHARE)) continue;
    const door = shops[i]!;
    job.folk.push(person(`keeper|${i}`, door.x, door.y, door.z, Math.atan2(door.fx, door.fz), false));
    keepers++;
  }

  standCrossers(job, ground, person);
}

/**
 * The people of a city's middle crossing, where its four traffic lights stand
 * (`placeSignals`, a pinwheel from the corner at +x +z): each waits at a
 * corner just behind the kerb, and walks a zebra, then the next, and back.
 * The leg from corner `k` to `k + 1` crosses an arm of the street along z
 * when `k` is even, along x when it is odd.
 */
function standCrossers(job: RaiseJob, ground: Ground, person: (key: string, x: number, y: number, z: number, yaw: number, chatting: boolean) => FolkAnchor): void {
  const { slot, grid } = job;
  const s = ground.signals;
  if (s.length !== 16) return;
  const inset = grid.pitch * 0.5 - pavementOf(grid.pitch * 0.5) * 0.5;
  const wait = grid.pitch * 0.5 - pavementOf(grid.pitch * 0.5) + KERB_WAIT;
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    corners.push(new THREE.Vector3((s[i * 4]! / inset) * wait, s[i * 4 + 1]!, (s[i * 4 + 2]! / inset) * wait));
  }
  for (let n = 0; n < CROSSERS; n++) {
    const first = rngFrom(slot.seed, 'crosser', n).int(4);
    const path = [0, 1, 2].map((k) => corners[(first + k) % 4]!.clone());
    const axes = [0, 1].map((k) => ((first + k) % 2 === 0 ? 1 : 0) as 0 | 1);
    const start = path[0]!;
    const ahead = path[1]!;
    const walker = person(`cross|${n}`, start.x, start.y, start.z, Math.atan2(ahead.x - start.x, ahead.z - start.z), false);
    walker.from.copy(start);
    walker.to.copy(path[2]!);
    walker.crossing = { corners: path, axes, signalTown: slot.index };
    job.folk.push(walker);
  }
}
