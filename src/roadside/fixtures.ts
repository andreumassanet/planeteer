import * as THREE from 'three';
import { rngFrom } from '../scenery/random.ts';
import {
  BRIDGE_POST_SPACING, BRIDGE_RAIL_HEIGHT, DARK, GIRDER, HEAD, LAMP_ARM, LAMP_HEAD_DROP, PIER_ALONG, PIER_FOOT, PIER_SPACING, colours,
} from './constants.ts';
import { at, centre, forward, right, scratch, scratchB, stand, up } from './frame.ts';
import { bar, box, disc, figures, flat, panel } from './primitives.ts';
import type { Roadside, RoadsideSite } from './types.ts';

/** The individual pieces of roadside furniture, each laid on the frame `stand` left. */

const faceOrigin = new THREE.Vector3();
const facing = new THREE.Vector3();
const across = new THREE.Vector3();
const armFrom = new THREE.Vector3();
const armTo = new THREE.Vector3();
const railEnd = new THREE.Vector3();

/**
 * A street lamp: a plinth, a column, an arm over the carriageway on a brace,
 * and a head whose glass is the one lit face. `sign` is the side of the road
 * it stands on, so the arm reaches towards `-sign`.
 */
export function lamp(out: Roadside, sign: number, height: number): void {
  const reach = -sign;
  centre.copy(at).addScaledVector(up, 0.25);
  box(out, centre, right, up, forward, 0.2, 0.25, 0.2, colours.cap);
  centre.copy(at).addScaledVector(up, height * 0.5);
  box(out, centre, right, up, forward, 0.1, height * 0.5, 0.1, colours.lamp);
  armFrom.copy(at).addScaledVector(up, height - 0.08);
  armTo.copy(armFrom).addScaledVector(right, reach * LAMP_ARM);
  bar(out, armFrom, armTo, up, 0.12, colours.lamp);
  armFrom.copy(at).addScaledVector(up, height - 0.85);
  armTo.copy(at).addScaledVector(up, height - 0.12).addScaledVector(right, reach * LAMP_ARM * 0.5);
  bar(out, armFrom, armTo, up, 0.08, colours.lamp);
  centre.copy(at).addScaledVector(up, height - 0.05).addScaledVector(right, reach * (LAMP_ARM - 0.05));
  box(out, centre, right, up, forward, 0.5, 0.12, 0.22, colours.housing, DARK, true);
  centre.addScaledVector(up, -0.15);
  facing.copy(up).negate();
  flat(out, centre, right, forward, facing, [[-0.42, -0.17], [0.42, -0.17], [0.42, 0.17], [-0.42, 0.17]], colours.head, HEAD);
  centre.addScaledVector(up, -LAMP_HEAD_DROP);
  out.heads.push(centre.x, centre.y, centre.z);
}

/**
 * A town's name board on two posts: a slate border, a cream board and one
 * block a letter (up to fourteen, a capital starting each word), wider for a
 * longer name, with a galvanised back.
 */
export function nameBoard(out: Roadside, name: string, seed: string): void {
  const words = name.trim().length > 0 ? name.trim().split(/[\s-]+/).slice(0, 2) : ['Town'];
  const letters = Math.min(14, words.reduce((sum, word) => sum + word.length, 0) + words.length - 1);
  const letter = 0.15;
  const halfWidth = Math.max(0.8, Math.min(1.15, letters * letter * 0.5 + 0.22));
  const halfHeight = 0.5;
  const rise = 2.2;
  for (const offset of [-halfWidth * 0.72, halfWidth * 0.72]) {
    centre.copy(at).addScaledVector(up, rise * 0.5 + 0.1).addScaledVector(right, offset);
    box(out, centre, right, up, forward, 0.05, rise * 0.5 + 0.1, 0.05, colours.lamp);
  }
  centre.copy(at).addScaledVector(up, rise).addScaledVector(forward, 0.08);
  box(out, centre, right, up, forward, halfWidth, halfHeight, 0.03, colours.back, DARK, true);
  faceOrigin.copy(centre).addScaledVector(forward, 0.04);
  panel(out, faceOrigin, right, up, forward, 0, 0, halfWidth, halfHeight, colours.border);
  faceOrigin.addScaledVector(forward, 0.012);
  panel(out, faceOrigin, right, up, forward, 0, 0, halfWidth - 0.08, halfHeight - 0.08, colours.board);
  faceOrigin.addScaledVector(forward, 0.012);
  const rng = rngFrom('roadside-name', seed);
  let u = -((letters - 1) * letter) / 2;
  let k = 0;
  for (const word of words) {
    for (let i = 0; i < word.length && k < letters; i++, k++) {
      const capital = i === 0;
      const tall = capital ? 0.2 : rng.chance(0.25) ? 0.17 : 0.12;
      const wide = capital ? 0.058 : rng.range(0.035, 0.055);
      panel(out, faceOrigin, right, up, forward, u, -0.05 + tall * 0.5 - 0.06, wide, tall * 0.5, colours.letter);
      u += letter;
    }
    // The space between two words.
    k++;
    u += letter;
  }
}

/** A speed limit sign: a post, a red-ringed round plate and the limit in figures. */
export function speedSign(out: Roadside, limit: number): void {
  const rise = 2.25;
  centre.copy(at).addScaledVector(up, rise * 0.5);
  box(out, centre, right, up, forward, 0.05, rise * 0.5, 0.05, colours.lamp);
  centre.copy(at).addScaledVector(up, rise).addScaledVector(forward, 0.08);
  disc(out, centre, right, up, forward, 0.5, 0.05, colours.ring, colours.back);
  faceOrigin.copy(centre).addScaledVector(forward, 0.037);
  disc(out, faceOrigin, right, up, forward, 0.37, 0, colours.post, null);
  faceOrigin.addScaledVector(forward, 0.012);
  figures(out, faceOrigin, right, up, forward, limit, 0, 0, 0.36, colours.letter);
}

const chevronFaces = [1, -1] as const;

/**
 * A board of two chevrons on the outside of a bend, pointing `into` it (the
 * side, as `right` counts it, the bend turns towards), painted on both faces.
 */
export function chevrons(out: Roadside, into: number): void {
  const rise = 1.4;
  centre.copy(at).addScaledVector(up, rise * 0.5);
  box(out, centre, right, up, forward, 0.05, rise * 0.5, 0.05, colours.lamp);
  centre.copy(at).addScaledVector(up, rise);
  box(out, centre, right, up, forward, 0.55, 0.32, 0.03, colours.ring, DARK, true);
  for (const face of chevronFaces) {
    facing.copy(forward).multiplyScalar(face);
    across.copy(right);
    faceOrigin.copy(centre).addScaledVector(facing, 0.042);
    panel(out, faceOrigin, across, up, facing, 0, 0, 0.47, 0.24, colours.post);
    faceOrigin.addScaledVector(facing, 0.012);
    // Two chevrons side by side, each two strokes meeting at its point towards `into`.
    for (const u of [-0.2 - into * 0.06, 0.2 - into * 0.06]) {
      const tip = u + into * 0.13;
      const tail = u - into * 0.13;
      flat(out, faceOrigin, across, up, facing, [[tail, 0.2], [tail + into * 0.12, 0.2], [tip + into * 0.12, 0], [tip, 0]], colours.ring);
      flat(out, faceOrigin, across, up, facing, [[tip, 0], [tip + into * 0.12, 0], [tail + into * 0.12, -0.2], [tail, -0.2]], colours.ring);
    }
  }
}

/**
 * A bridge's railings along both deck edges over the span and its ramps, and
 * piers from under the girder into the sea floor, at most `PIER_SPACING`
 * apart, each with a cap beam.
 */
export function bridgeParts(out: Roadside, site: RoadsideSite, bridge: readonly [number, number, number]): void {
  bridgeRailings(out, site, bridge);
  bridgePiers(out, site, bridge);
}

function bridgeRailings(out: Roadside, site: RoadsideSite, bridge: readonly [number, number, number]): void {
  const [from, to, land] = bridge;
  const s0 = Math.max(0, from - land);
  const s1 = Math.min(site.length, to + land);
  for (const sign of [1, -1]) {
    let last: THREE.Vector3 | null = null;
    for (let s = s0; s <= s1 + 1e-6; s += BRIDGE_POST_SPACING) {
      const top = site.top(s);
      stand(site, s, sign * (top - 0.18), 1, 0.05);
      // Another road's carriageway sharing the approach breaks the railing.
      if (site.clear !== undefined && !site.clear(at, 0.1)) {
        last = null;
        continue;
      }
      centre.copy(at).addScaledVector(up, BRIDGE_RAIL_HEIGHT * 0.5);
      box(out, centre, right, up, forward, 0.08, BRIDGE_RAIL_HEIGHT * 0.5, 0.08, colours.cap);
      const post = at.clone();
      if (last !== null) {
        for (const height of [BRIDGE_RAIL_HEIGHT * 0.95, BRIDGE_RAIL_HEIGHT * 0.5]) {
          scratch.copy(last).addScaledVector(scratchB.copy(last).normalize(), height);
          railEnd.copy(post).addScaledVector(up, height);
          bar(out, scratch, railEnd, up, height > BRIDGE_RAIL_HEIGHT * 0.7 ? 0.18 : 0.1, colours.rail);
        }
      }
      last = post;
    }
  }
}

function bridgePiers(out: Roadside, site: RoadsideSite, bridge: readonly [number, number, number]): void {
  const [from, to] = bridge;
  const count = Math.max(1, Math.ceil((to - from) / PIER_SPACING));
  for (let k = 1; k < count || (count === 1 && k === 1); k++) {
    const s = count === 1 ? (from + to) / 2 : from + ((to - from) * k) / count;
    const top = site.top(s);
    stand(site, s, 0, 1, 0);
    // Nor in another road's way, where one passes beside or under the span.
    if (site.clear !== undefined && !site.clear(at, Math.max(1.2, top * 0.45))) continue;
    const deck = at.length();
    const bottom = deck - GIRDER;
    // Into the sea floor, not just under the surface.
    const foot = Math.min(site.floorRadius?.(at) ?? site.groundRadius(at), deck) - PIER_FOOT;
    if (bottom - foot < 1) continue;
    const half = (bottom - foot) * 0.5;
    centre.copy(up).multiplyScalar(foot + half);
    box(out, centre, right, up, forward, Math.max(1.2, top * 0.45), half, PIER_ALONG * 0.5, colours.pier, DARK, true);
    centre.copy(up).multiplyScalar(bottom - 0.5);
    box(out, centre, right, up, forward, top, 0.5, PIER_ALONG * 0.65, colours.pier, DARK, true);
  }
}
