import * as THREE from 'three';
import { rngFrom } from './scenery/random.ts';
import {
  ARM_DEPTH, ARM_LENGTH, CHEVRON_APART, CHEVRON_SPAN, CHEVRON_TURN, LAMP_CLEAR, LAMP_ARM, LAMP_FROM, LAMP_HEIGHT, LAMP_SPACING,
  LIMITS, NAME_AT, POLE_BEND, POLE_HEIGHT, POLE_LATERAL, POLE_SPACING, POLE_WIDTH, POST_HEIGHT, POST_SPACING, POST_WIDTH,
  RAIL_DROP, RAIL_HEIGHT, RAIL_POST_SPACING, SIGN_REACH, SPEED_AT, WIRE_PIECES, WIRE_SAG, WIRE_WIDTH, colours,
} from './roadside/constants.ts';
import { ahead, at, bendAt, centre, clearAt, forward, right, scratch, scratchB, side, stand, turnAt, up } from './roadside/frame.ts';
import { bridgeParts, chevrons, lamp, nameBoard, speedSign } from './roadside/fixtures.ts';
import { bar, box, wire } from './roadside/primitives.ts';
import type { Roadside, RoadsideSite } from './roadside/types.ts';

/**
 * What stands beside a road between the towns: telegraph poles and wires,
 * white verge posts, a town's name board and a speed sign, chevron boards at
 * hard bends, rails along high banks, street lamps down a town's approach,
 * and a bridge's railings and piers.
 *
 * Sized in metres at `SCENERY_SCALE`. Every placement is a pure function of
 * the road, and everything stands inside `roadClearance` so the wood never
 * grows through it. Nothing stands on another road's top
 * (`RoadsideSite.clear`). This file knows nothing of courses or ramps: the
 * ribbon hands it a `RoadsideSite` and gets triangles back. Node-safe.
 */

export {
  ARM_DEPTH, GIRDER, LAMP_FROM, LAMP_HEAD_DROP, LAMP_SPACING, NAME_AT, OTHER_EDGE, POLE_COLOUR, POLE_HEIGHT, POLE_LATERAL,
  POLE_SPACING, POLE_WIDTH, POST_SPACING, RAIL_DROP, SPEED_AT, WIRE_COLOUR, WIRE_SAG, WIRE_WIDTH,
} from './roadside/constants.ts';
export type { Roadside, RoadsideSite } from './roadside/types.ts';

/** Everything beside one road, laid end to end; deterministic in the site. */
export function layRoadside(site: RoadsideSite, out: Roadside = { position: [], normal: [], color: [], lit: [], heads: [] }): Roadside {
  const { length, seed } = site;
  const rng = rngFrom('roadside', seed);
  const country0 = Math.min(length, site.countryA);
  const country1 = Math.max(0, length - site.countryB);
  const rural = country1 - country0 > POLE_SPACING;

  if (rural && rng.chance(0.75)) poleLine(out, site, country0, country1, rng.chance(0.5) ? 1 : -1);
  if (rural) verge(out, site, country0, country1);
  for (const sign of [1, -1]) bankRails(out, site, sign);
  for (const end of [0, 1] as const) townEnd(out, site, end);
  if (site.bridge !== undefined && site.bridge !== null) bridgeParts(out, site, site.bridge);
  if (rural) bendBoards(out, site, country0, country1);
  return out;
}

const wireA = new THREE.Vector3();
const wireB = new THREE.Vector3();
const lampProbe = new THREE.Vector3();

/** Telegraph poles on one side of the road, through the country, with two wires a span. */
function poleLine(out: Roadside, site: RoadsideSite, country0: number, country1: number, sign: number): void {
  const count = Math.floor((country1 - country0) / POLE_SPACING);
  const start = country0 + ((country1 - country0) - count * POLE_SPACING) * 0.5;
  /** The last pole standing, and the radius of its two wire ends. */
  let last = NaN;
  const ends = [0, 0];
  for (let k = 0; k <= count; k++) {
    const s = start + k * POLE_SPACING;
    // The line breaks where the road bends harder than a span can follow.
    if (bendAt(site, s) > POLE_BEND) {
      last = NaN;
      continue;
    }
    stand(site, s, sign * POLE_LATERAL, 1, 0.4);
    if (!clearAt(site, POLE_WIDTH)) {
      last = NaN;
      continue;
    }
    centre.copy(at).addScaledVector(up, POLE_HEIGHT * 0.5);
    box(out, centre, right, up, forward, POLE_WIDTH * 0.5, POLE_HEIGHT * 0.5, POLE_WIDTH * 0.5, colours.pole);
    centre.copy(at).addScaledVector(up, POLE_HEIGHT - ARM_DEPTH * 2);
    box(out, centre, right, up, forward, ARM_LENGTH * 0.5, ARM_DEPTH * 0.5, ARM_DEPTH * 0.5, colours.pole);
    const top = centre.length() + ARM_DEPTH * 0.5;
    if (!Number.isNaN(last)) {
      // `right` is the left of the way from A to B, as the site's lateral is.
      for (const [w, offset] of [[0, ARM_LENGTH * 0.4], [1, -ARM_LENGTH * 0.4]] as const) {
        for (let q = 0; q < WIRE_PIECES; q++) {
          for (const [point, share] of [[wireA, q / WIRE_PIECES], [wireB, (q + 1) / WIRE_PIECES]] as const) {
            site.surface(last + (s - last) * share, sign * POLE_LATERAL + offset, point, ahead, side);
            const radius = ends[w]! + (top - ends[w]!) * share - WIRE_SAG * 4 * share * (1 - share);
            point.normalize().multiplyScalar(radius);
          }
          wire(out, wireA, wireB, WIRE_WIDTH, colours.wire);
        }
      }
    }
    last = s;
    ends[0] = top;
    ends[1] = top;
  }
}

/** White posts along the verge, alternating sides. */
function verge(out: Roadside, site: RoadsideSite, country0: number, country1: number): void {
  let k = 0;
  for (let s = country0 + POST_SPACING * 0.5; s < country1 - POST_SPACING * 0.25; s += POST_SPACING, k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    const lateral = sign * (site.top(s) - 0.2);
    stand(site, s, lateral, sign > 0 ? -1 : 1, 0.1);
    if (!clearAt(site, POST_WIDTH)) continue;
    centre.copy(at).addScaledVector(up, POST_HEIGHT * 0.4);
    box(out, centre, right, up, forward, POST_WIDTH * 0.5, POST_HEIGHT * 0.4, POST_WIDTH * 0.5, colours.post);
    centre.copy(at).addScaledVector(up, POST_HEIGHT * 0.9);
    box(out, centre, right, up, forward, POST_WIDTH * 0.52, POST_HEIGHT * 0.1, POST_WIDTH * 0.52, colours.cap);
  }
}

/** A rail along one side of the top wherever the bank stands `RAIL_DROP` over the field. */
function bankRails(out: Roadside, site: RoadsideSite, sign: number): void {
  const { length } = site;
  let run: THREE.Vector3[] = [];
  const flush = (): void => {
    for (let k = 0; k < run.length; k++) {
      const post = run[k]!;
      const next = run[Math.min(run.length - 1, k + 1)]!;
      const back = run[Math.max(0, k - 1)]!;
      up.copy(post).normalize();
      forward.subVectors(next, back).projectOnPlane(up);
      if (forward.lengthSq() < 1e-9) continue;
      forward.normalize();
      right.crossVectors(up, forward).normalize();
      centre.copy(post).addScaledVector(up, RAIL_HEIGHT * 0.5);
      box(out, centre, right, up, forward, 0.1, RAIL_HEIGHT * 0.5, 0.1, colours.cap);
      if (k + 1 < run.length) {
        scratch.copy(post).addScaledVector(up, RAIL_HEIGHT * 0.85);
        scratchB.copy(next).addScaledVector(centre.copy(next).normalize(), RAIL_HEIGHT * 0.85);
        bar(out, scratch, scratchB, up, 0.3, colours.rail);
      }
    }
    run = [];
  };
  for (let s = 2; s < length - 2; s += RAIL_POST_SPACING) {
    const top = site.top(s);
    stand(site, s, sign * (top - 0.3), 1, 0);
    if (!clearAt(site, 0.3)) {
      flush();
      continue;
    }
    const post = at.clone();
    site.surface(s, sign * (top + 4.8), scratchB, ahead, side);
    if (post.length() - site.groundRadius(scratchB) < RAIL_DROP) {
      flush();
      continue;
    }
    run.push(post);
  }
  flush();
}

/** A built town's end of the road: lamps down its approach, its name board, a speed sign. */
function townEnd(out: Roadside, site: RoadsideSite, end: 0 | 1): void {
  const { length, seed } = site;
  const town = end === 0 ? site.townA : site.townB;
  if (!town) return;
  const toward = end === 0 ? -1 : 1;
  const along = (d: number): number => (end === 0 ? d : length - d);
  // A sign stands in the country between the two towns' approaches or not at all.
  const other = end === 0 ? site.countryB : site.countryA;
  if (length < NAME_AT * 2.2) return;
  // Lamps on the side arriving traffic keeps to; arriving at A is moving towards smaller `s`.
  if (end === 0 ? site.lampsA : site.lampsB) approachLamps(out, site, site.keep * -toward, along);
  if (NAME_AT <= length - other) {
    const s = along(NAME_AT);
    const sign = site.keep * -toward;
    const lateral = sign * Math.min(site.top(s) + 0.9, SIGN_REACH - 1.15);
    stand(site, s, lateral, -toward, 0.2);
    if (clearAt(site, 1.2)) nameBoard(out, (end === 0 ? site.nameA : site.nameB) ?? '', `${seed}|${end}`);
  }
  if (SPEED_AT <= length - other) {
    const s = along(SPEED_AT);
    const sign = site.keep * toward;
    const lateral = sign * Math.min(site.top(s) + 0.7, SIGN_REACH - 0.5);
    stand(site, s, lateral, toward, 0.2);
    if (clearAt(site, 0.55)) speedSign(out, rngFrom('roadside-limit', seed, end).pick(LIMITS));
  }
}

/** Street lamps on side `sign` of an approach, each tall enough to clear every surface under its arm. */
function approachLamps(out: Roadside, site: RoadsideSite, sign: number, along: (d: number) => number): void {
  const { length } = site;
  for (let d = LAMP_FROM; d <= NAME_AT - 8; d += LAMP_SPACING) {
    const s = along(d);
    const top = site.top(s);
    stand(site, s, sign * (top - 0.35), 1, 0.05);
    if (!clearAt(site, 0.25)) continue;
    // The highest surface under the arm and the head's depth: this road's and any other's.
    const foot = at.length();
    const footLateral = sign * (top - 0.35);
    let highest = foot;
    for (const ds of [-0.3, 0, 0.3]) {
      for (let k = 0; k <= 4; k++) {
        const lateral = footLateral - sign * (LAMP_ARM + 0.5) * (k / 4);
        site.surface(Math.min(length, Math.max(0, s + ds)), lateral, lampProbe, ahead, side);
        highest = Math.max(highest, lampProbe.length(), site.roofline?.(lampProbe) ?? 0);
      }
    }
    stand(site, s, footLateral, 1, 0.05);
    lamp(out, sign, Math.max(LAMP_HEIGHT, highest - foot + LAMP_CLEAR));
  }
}

/** A chevron board on the outside of every hard bend, at its sharpest point. */
function bendBoards(out: Roadside, site: RoadsideSite, country0: number, country1: number): void {
  let lastSign = -Infinity;
  for (let s = country0 + CHEVRON_SPAN; s < country1 - CHEVRON_SPAN; s += 8) {
    if (s - lastSign < CHEVRON_APART) continue;
    const turn = turnAt(site, s);
    if (Math.abs(turn) < CHEVRON_TURN) continue;
    if (Math.abs(turnAt(site, s + 8)) > Math.abs(turn)) continue;
    // The outside of a bend to the left of A to B is its right.
    const outside = turn > 0 ? -1 : 1;
    stand(site, s, outside * Math.min(site.top(s) + 0.8, SIGN_REACH - 0.6), 1, 0.2);
    if (!clearAt(site, 0.6)) continue;
    chevrons(out, -outside);
    lastSign = s;
  }
}
