/** The crowns that shed: their falling and fallen leaves, and the litter under them. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { PALETTE } from '../theme.ts';
import { isWater } from '../vehicles.ts';
import { hash3 } from '../weather.ts';
import { WIND, windGustAt } from '../wind.ts';
import {
  CACHE_CAP, CROWN_ADMIT, DRIFT, FADE_IN, FALL_SPEED, GUST_PUSH, K_LEAF, LANDING_KEEP, LEAF_FADE_FROM, LEAF_RANGE,
  LEAF_SIZE, LEAF_SLOTS, LIE, LIE_LIFT, LIE_SPREAD, LITTER_MAX, LITTER_RANGE,
  MAX_CROWNS, MAX_LEAVES, SHRINK, SWING, SWING_RATE, WATER_LINE,
} from './constants.ts';
import { fract, frameAt, smooth } from './grid.ts';
import { DRIED, LEAVES, colourOf } from './materials.ts';
import { createLitter } from './litter.ts';
import type { AmbientContext, Crown, Landing } from './types.ts';

export interface Crowns {
  /** The crowns in range, nearest first. */
  readonly nearCrowns: Crown[];
  /** Takes in the crowns round the player from `options.crownsNear`. */
  scanCrowns(player: THREE.Vector3): void;
  /** A crown's falling and fallen leaves, into the bodies. */
  crownLeaves(crown: Crown, air: number, autumn: number, high: number, now: number): void;
  /** Asks the ground under the nearest crowns' litter, `LITTER_ASKS` a frame at most. */
  askLitter(want: (crown: Crown) => number): void;
  /** The litter rewritten: every asked leaf under every crown in range, nearest crowns first. */
  writeLitter(want: (crown: Crown) => number, autumn: number, high: number): void;
  /** Forgets the leaf landings not seen for `LANDING_KEEP` seconds. */
  forgetLandings(): void;
}

export function createCrowns(ctx: AmbientContext): Crowns {
  const { options, admitPerFrame, stats, state } = ctx;
  const { point, other, forward, right, lift, tipA, tipB, axisA, axisB, scanUp } = ctx.scratch;
  const { triangle } = ctx.writer;

  const crowns = new Map<number, Crown>();
  const nearCrowns: Crown[] = [];
  const landings = new Map<number, Landing>();
  const crownPoint = new THREE.Vector3();
  const leafColour = new THREE.Color();
  const driftTo = new THREE.Vector3();

  /** What a point stands on: a town's floor or a road's ribbon, else the drawn land; -1 on the water. */
  function surfaceAt(at: THREE.Vector3): number {
    stats.groundAsks++;
    const made = options.madeHeightAt(at);
    if (made > 0) return made;
    const ground = options.groundAt(at);
    return isWater(ground) ? -1 : ground;
  }

  function takeCrown(list: Float32Array, o: number): void {
    const x = list[o]!;
    const y = list[o + 1]!;
    const z = list[o + 2]!;
    // A quarter of a unit is finer than two trees stand and coarser than a
    // float's wobble between two builds of the same tile.
    const key = Math.floor(hash3(Math.round(x * 4), Math.round(y * 4), Math.round(z * 4)) * 4294967296);
    let crown = crowns.get(key);
    if (crown === undefined) {
      if (state.crownBudget <= 0) {
        state.pending = true;
        return;
      }
      state.crownBudget--;
      const up = new THREE.Vector3(x, y, z);
      const middle = up.length();
      up.divideScalar(middle);
      const east = new THREE.Vector3();
      const north = new THREE.Vector3();
      frameAt(up, east, north);
      const foot = surfaceAt(crownPoint.copy(up).multiplyScalar(PLANET_RADIUS));
      crown = {
        key, up, east, north, middle, foot: foot < 0 ? middle - list[o + 4]! * 2 : foot,
        radius: list[o + 3]!, half: list[o + 4]!,
        colour: new THREE.Color(list[o + 5]!, list[o + 6]!, list[o + 7]!),
        shed: list[o + 8]!, distance: 0, scan: -1, born: state.clock,
        litter: new Float32Array(LITTER_MAX).fill(NaN), asked: 0,
      };
      crowns.set(key, crown);
      state.litterDirty = true;
    }
    if (crown.scan === state.scanId) return;
    crown.scan = state.scanId;
    nearCrowns.push(crown);
  }

  function scanCrowns(player: THREE.Vector3): void {
    if (options.crownsNear === undefined) return;
    state.scanId++;
    state.crownBudget = CROWN_ADMIT * Math.max(1, admitPerFrame / 2);
    const before = nearCrowns.length;
    nearCrowns.length = 0;
    options.crownsNear(player, LITTER_RANGE, takeCrown);
    scanUp.copy(player).normalize();
    for (const crown of nearCrowns) crown.distance = crown.up.distanceTo(scanUp) * PLANET_RADIUS;
    nearCrowns.sort((a, b) => a.distance - b.distance || a.key - b.key);
    if (nearCrowns.length > MAX_CROWNS) nearCrowns.length = MAX_CROWNS;
    if (nearCrowns.length !== before) state.litterDirty = true;
    if (crowns.size > CACHE_CAP) {
      const keep = new Set(nearCrowns);
      for (const [key, crown] of crowns) if (!keep.has(crown)) crowns.delete(key);
    }
  }

  /** A crown's fade for the falling leaves: its distance, and its age. */
  function crownFade(crown: Crown, now: number): number {
    return smooth((LEAF_RANGE - crown.distance) / (LEAF_RANGE - LEAF_FADE_FROM)) * smooth((now - crown.born) / FADE_IN);
  }

  /**
   * A leaf's colour: in the autumn, mostly the autumn's own; out of it, the
   * crown's green going over (`dry` 0, in the air) or gone brown (`dry` 1,
   * lying a while).
   */
  function leafColourOf(crown: Crown, pick: number, pick2: number, autumn: number, dry: number, out: THREE.Color): THREE.Color {
    if (pick < 0.06 + 0.88 * autumn) {
      return out.copy(colourOf(LEAVES[Math.floor(pick2 * LEAVES.length) % LEAVES.length]!)).lerp(crown.colour, 0.12 + 0.1 * dry);
    }
    if (dry > 0) return out.copy(crown.colour).lerp(colourOf(DRIED[Math.floor(pick2 * DRIED.length) % DRIED.length]!), 0.5 + 0.35 * pick2);
    return out.copy(crown.colour).lerp(colourOf(PALETTE.gold), 0.1 + 0.3 * pick2);
  }

  /**
   * A quad lying or tumbling at `point`: `size` from its stalk to its tip
   * along `axisA` and a little over half that across along `axisB`, as two
   * triangles with a bend down the midrib.
   */
  function leafQuad(size: number, colour: THREE.Color): void {
    tipA.copy(point).addScaledVector(axisA, size);
    tipB.copy(point).addScaledVector(axisA, -size);
    lift.copy(point).addScaledVector(axisB, size * 0.55);
    other.copy(point).addScaledVector(axisB, -size * 0.55);
    triangle(tipA, lift, tipB, colour);
    triangle(tipA, tipB, other, colour);
  }

  /** Where the leaf in `slot` of a crown lets go and lands this cycle, worked out the first time it is asked. */
  function landingOf(crown: Crown, slot: number, cycle: number, fall: number, now: number): Landing {
    const id = crown.key * 8 + slot;
    let landing = landings.get(id);
    if (landing !== undefined && landing.cycle === cycle) {
      landing.seen = now;
      return landing;
    }
    const seed = (crown.key | 0) ^ Math.imul(cycle, 0x9e3779b1);
    const angle = hash3(seed, slot, K_LEAF + 1) * Math.PI * 2;
    const reach = Math.sqrt(hash3(seed, slot, K_LEAF + 2)) * crown.radius * 0.85;
    const e = Math.cos(angle) * reach;
    const n = Math.sin(angle) * reach;
    // Downwind by the wind of the moment it lets go, for as long as it falls,
    // and a scatter of its own.
    driftTo.copy(WIND.uWindWorld.value);
    const push = DRIFT * WIND.uWindStrength.value * fall;
    const scatter = 0.8 * crown.radius * (hash3(seed, slot, K_LEAF + 3) - 0.5);
    const de = driftTo.dot(crown.east) * push + scatter * Math.cos(angle + 1.3);
    const dn = driftTo.dot(crown.north) * push + scatter * Math.sin(angle + 1.3);
    crownPoint.copy(crown.up)
      .addScaledVector(crown.east, (e + de) / PLANET_RADIUS)
      .addScaledVector(crown.north, (n + dn) / PLANET_RADIUS)
      .normalize()
      .multiplyScalar(PLANET_RADIUS);
    const ground = surfaceAt(crownPoint);
    const radius = ground < 0 ? WATER_LINE : ground;
    if (landing === undefined) {
      landing = { cycle, e, n, de, dn, radius, seen: now };
      landings.set(id, landing);
    } else Object.assign(landing, { cycle, e, n, de, dn, radius, seen: now });
    return landing;
  }

  /** A crown's falling and fallen leaves, into the bodies. */
  function crownLeaves(crown: Crown, air: number, autumn: number, high: number, now: number): void {
    const fade = crownFade(crown, now) * high;
    if (fade <= 0.01) return;
    const share = (air * crown.shed) / LEAF_SLOTS;
    if (share < 0.002) return;
    const over = Math.max(1.5, crown.middle - crown.foot);
    for (let slot = 0; slot < LEAF_SLOTS; slot++) {
      if (stats.leaves + stats.lying >= MAX_LEAVES) return;
      const s = hash3(crown.key | 0, slot, K_LEAF);
      // From its own height in the crown, at its own speed.
      const start = Math.max(1.2, over + (fract(s * 5.1) - 0.55) * crown.half * 1.4);
      const fall = start / (FALL_SPEED * (0.8 + 0.4 * fract(s * 3.3)));
      const lie = LIE + LIE_SPREAD * fract(s * 9.7);
      const life = fall + lie + SHRINK;
      // The fewer in the air, the longer a slot waits between leaves.
      const period = Math.max(life, fall / Math.min(1, share));
      const phase = state.clock / period + fract(s * 7.3);
      const cycle = Math.floor(phase);
      const t = (phase - cycle) * period;
      if (t >= life) continue;
      const landing = landingOf(crown, slot, cycle, fall, now);
      const u = Math.min(1, t / fall);
      const flutter = s * 41.7;
      const swing = SWING_RATE * (0.8 + 0.4 * fract(s * 6.1));
      const tumbles = fract(s * 2.9) > 0.72;
      const yaw = fract(s * 13.7) * Math.PI * 2 + 0.6 * Math.min(t, fall) * (fract(s * 8.3) - 0.5);
      let e = landing.e + landing.de * u;
      let n = landing.n + landing.dn * u;
      let r: number;
      let tilt: number;
      let roll: number;
      const pick = hash3((crown.key | 0) ^ cycle, slot, K_LEAF + 4);
      const pick2 = hash3((crown.key | 0) ^ cycle, slot, K_LEAF + 5);
      let size = LEAF_SIZE * (0.8 + 0.4 * fract(s * 4.1)) * fade;
      if (u < 1) {
        // Swinging as it comes down, the swing and the push dying out as it
        // lands, so it lies where its landing was asked.
        const settle = smooth((1 - u) / 0.15);
        const beat = swing * t + flutter;
        const sideways = SWING * Math.sin(beat) * settle;
        const across = fract(s * 17.3) * Math.PI * 2;
        e += Math.cos(across) * sideways;
        n += Math.sin(across) * sideways;
        crownPoint.copy(crown.up).multiplyScalar(crown.middle)
          .addScaledVector(crown.east, landing.e)
          .addScaledVector(crown.north, landing.n);
        const gust = windGustAt(crownPoint) * GUST_PUSH * WIND.uWindStrength.value * Math.sin(Math.PI * u);
        e += WIND.uWindWorld.value.dot(crown.east) * gust;
        n += WIND.uWindWorld.value.dot(crown.north) * gust;
        const top = crown.middle + (start - over);
        r = top + (landing.radius + LIE_LIFT - top) * u + 0.2 * Math.cos(2 * beat) * settle;
        tilt = tumbles ? t * (2.5 + 2 * s) : 0.85 * Math.cos(beat);
        roll = 0.5 * Math.sin(beat * 0.5 + s);
        size *= smooth(t / 0.4);
        stats.leaves++;
      } else {
        r = landing.radius + LIE_LIFT;
        tilt = 0.1 * (pick - 0.5);
        roll = 0.1 * (pick2 - 0.5);
        size *= 1 - smooth((t - fall - lie) / SHRINK);
        stats.lying++;
      }
      if (size < 0.01) continue;
      point.copy(crown.up)
        .addScaledVector(crown.east, e / PLANET_RADIUS)
        .addScaledVector(crown.north, n / PLANET_RADIUS)
        .normalize();
      right.copy(point);
      point.multiplyScalar(r);
      // The leaf's frame: its length along `yaw` in the ground's plane, tipped
      // up by `tilt`; its width square to that, rolled by `roll`.
      forward.copy(crown.east).multiplyScalar(Math.cos(yaw)).addScaledVector(crown.north, Math.sin(yaw));
      axisA.copy(forward).multiplyScalar(Math.cos(tilt)).addScaledVector(right, Math.sin(tilt));
      axisB.crossVectors(right, forward).normalize().multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll));
      leafQuad(size, leafColourOf(crown, pick, pick2, autumn, u < 1 ? 0 : 0.3, leafColour));
    }
  }

  function forgetLandings(): void {
    for (const [id, landing] of landings) if (state.clock - landing.seen > LANDING_KEEP) landings.delete(id);
  }

  const { askLitter, writeLitter } = createLitter(ctx, nearCrowns, surfaceAt, leafColourOf);

  return { nearCrowns, scanCrowns, crownLeaves, askLitter, writeLitter, forgetLandings };
}
