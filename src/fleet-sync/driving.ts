/**
 * Vehicles driven by somebody else, sampled in the past, and our own driving, throttled to the relay's limits.
 */
import * as THREE from 'three';
import type { WirePose } from '../craft/contract.ts';
import { DELAY_MS, DRIVE_MS, REST_MS, SHARP_TURN, URGENT_MS } from './constants.ts';
import { isPose, wire } from './wire.ts';
import type { SyncCore } from './core.ts';
import type { Room } from './room.ts';

export function createDriving(core: SyncCore, room: Room) {
  const { driven, moved, peers, pending } = core;
  const s = core.fields;
  const { emit, post, self } = room;
  const out = { position: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };

  function blend(a: WirePose, b: WirePose, t: number, into: WirePose, at: number): void {
    out.a.set(a[at]!, a[at + 1]!, a[at + 2]!);
    out.b.set(b[at]!, b[at + 1]!, b[at + 2]!);
    out.position.lerpVectors(out.a, out.b, t);
    // A direction is blended and put back on the unit sphere: at ten poses a
    // second the arc between two is a few degrees, where this is a slerp.
    if (at > 0) out.position.normalize();
    into[at] = out.position.x;
    into[at + 1] = out.position.y;
    into[at + 2] = out.position.z;
  }

  /** Where another player's vehicle is drawn: `DELAY_MS` in the past, between the two poses either side of that instant. */
  function sample(vehicle: string, into: WirePose): boolean {
    const drive = driven.get(vehicle);
    const list = drive?.poses;
    const newest = list?.[list.length - 1];
    if (list === undefined || newest === undefined || drive!.driver === self()) return false;
    const at = performance.now() - DELAY_MS;
    let i = list.length - 1;
    while (i > 0 && list[i - 1]!.at > at) i--;
    const b = list[i]!;
    const a = list[i - 1];
    if (a === undefined || at >= newest.at) {
      for (let k = 0; k < 9; k++) into[k] = newest.pose[k]!;
      return true;
    }
    const t = THREE.MathUtils.clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
    blend(a.pose, b.pose, t, into, 0);
    blend(a.pose, b.pose, t, into, 3);
    blend(a.pose, b.pose, t, into, 6);
    return true;
  }

  /** A driver's pose, sent at the rate the movement asks for. */
  function drive(vehicle: string, pose: WirePose, speed: number): void {
    const entry = moved.get(vehicle);
    if (entry === undefined || entry.seats[0] !== self() || !isPose(pose)) return;
    const fresh = entry.pose.length !== 9;
    if (fresh) entry.pose = [...pose];
    else for (let k = 0; k < 9; k++) entry.pose[k] = pose[k]!;
    if (fresh) emit(vehicle);
    if (!s.live || pending.has(vehicle)) return;

    const now = performance.now();
    const since = now - s.sentAt;
    let due = s.sentPose === null;
    if (!due && s.sentPose !== null) {
      const turned = pose[3]! * s.sentPose[3]! + pose[4]! * s.sentPose[4]! + pose[5]! * s.sentPose[5]! < SHARP_TURN;
      const lurched = Math.abs(speed - s.sentSpeed) > Math.max(2, Math.abs(s.sentSpeed) * 0.25);
      const still = speed === 0 && Math.hypot(pose[0]! - s.sentPose[0]!, pose[1]! - s.sentPose[1]!, pose[2]! - s.sentPose[2]!) < 0.05;
      due = since >= (still ? REST_MS : DRIVE_MS) || (since >= URGENT_MS && (turned || lurched));
    }
    if (!due) return;
    s.sentAt = now;
    s.sentPose = [...pose];
    s.sentSpeed = speed;
    post({ t: 'vp', v: vehicle, p: wire(pose), sp: +speed.toFixed(1) });
  }

  /** Whether the driver of a vehicle is in the air, which is how a horse's leap is seen. */
  function leaping(vehicle: string): boolean {
    const driver = moved.get(vehicle)?.seats[0] ?? null;
    return driver !== null && driver !== self() && peers.airborneOf(driver);
  }

  return { sample, drive, leaping };
}

export type Driving = ReturnType<typeof createDriving>;
