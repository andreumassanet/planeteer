import * as THREE from 'three';
import { PALETTE } from '../../theme.ts';
import {
  ARM_DEPTH, POLE_COLOUR, POLE_HEIGHT, POLE_WIDTH, WIRE_COLOUR, WIRE_SAG, WIRE_WIDTH,
} from '../../roadside.ts';
import { rngFrom } from '../random.ts';
import type { Rng } from '../random.ts';
import { cellCentre } from '../grid.ts';
import { clearOfHosts, spanA, spanB, wallAnchor } from './anchors.ts';
import type { Street } from './anchors.ts';
import { ARM_REACH, M, POLE_GAP, POLE_INSET, TOWN_POLE, TRIANGLE_CAP } from './config.ts';
import { box, colourOf, line, shadeOf } from './geometry.ts';
import type { Hanger, PoleSpot } from './hanger.ts';

const P = PALETTE;

interface Strung {
  a: THREE.Vector3;
  b: THREE.Vector3;
  sag: number;
  pieces: number;
}

/** Service poles along the streets and the wires between them; a step a street. */
export function* raisePolesSteps(h: Hanger): Generator<void, void, void> {
  const { site, profile, out } = h;
  // The country's timber, weathered darker in a street; concrete a grey, not a white.
  const poleColour = profile.concrete === true ? shadeOf(P.steel, P.bone, 0.3) : POLE_COLOUR.clone().lerp(colourOf(P.ink), 0.3);
  for (const street of h.streets) {
    const rng = rngFrom(site.seed, 'overhead-wires', street.axis, street.index);
    if (!rng.chance(profile.wires * (street.main ? 1 : 0.35) * Math.min(1, h.urban))) continue;
    if (out.triangles > TRIANGLE_CAP) break;
    yield;
    wireStreet(h, street, rng, poleColour);
  }
}

function wireStreet(h: Hanger, street: Street, rng: Rng, poleColour: THREE.Color): void {
  const { site, grid, hosts, out } = h;
  const side = rng.sign();
  const across = side * (street.half - POLE_INSET);
  // The arm reaches out over the street, towards its line.
  const armX = street.axis === 0 ? -side : 0;
  const armZ = street.axis === 0 ? 0 : -side;
  const step = Math.max(3, Math.round(POLE_GAP / grid.pitch));
  const standing: PoleSpot[] = [];
  for (let k = rng.int(step); k < grid.cells; k += step) {
    let pole: PoleSpot | null = null;
    for (const nudge of [0, 0.3, -0.3, 0.15, -0.15]) {
      pole = h.standPole(street, across, cellCentre(grid, k) + nudge * grid.pitch, armX, armZ);
      if (pole !== null) break;
    }
    standing.push(pole ?? { x: NaN, y: NaN, z: NaN, at: NaN });
  }
  const lines = h.profile.lines;
  /** Where wire `i` is tied on a pole: at the arm's end, on the pole, and further down it. */
  const tie = (pole: { x: number; y: number; z: number }, i: number, into: THREE.Vector3): THREE.Vector3 => {
    const top = pole.y + POLE_HEIGHT - 0.3;
    if (i === 0) return into.set(pole.x + armX * ARM_REACH * 0.9, top + ARM_DEPTH, pole.z + armZ * ARM_REACH * 0.9);
    if (i === 1) return into.set(pole.x + armX * POLE_WIDTH * 0.6, top + ARM_DEPTH, pole.z + armZ * POLE_WIDTH * 0.6);
    return into.set(pole.x + armX * POLE_WIDTH * 0.6, top - 0.45 * (i - 1) * M, pole.z + armZ * POLE_WIDTH * 0.6);
  };
  // The wires first, so that only a pole something is strung from stands:
  // a pole with nothing on it is a post in the pavement.
  const strung: Strung[] = [];
  const wired = new Set<number>();
  // Pole to pole along the street, the neighbours only.
  for (let n = 0; n + 1 < standing.length; n++) {
    const p = standing[n]!;
    const q = standing[n + 1]!;
    if (Number.isNaN(p.x) || Number.isNaN(q.x)) continue;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const sag = WIRE_SAG * (length / 60);
    let ok = true;
    for (let i = 0; i < lines && ok; i++) {
      tie(p, i, spanA);
      tie(q, i, spanB);
      if (!clearOfHosts(hosts, spanA, spanB, sag * (1 + 0.15 * i), 0)) ok = false;
    }
    if (!ok) continue;
    for (let i = 0; i < lines; i++) {
      strung.push({ a: tie(p, i, new THREE.Vector3()), b: tie(q, i, new THREE.Vector3()), sag: sag * (1 + 0.15 * i), pieces: 6 });
    }
    wired.add(n).add(n + 1);
  }
  // And a drop from a pole across the street to the wall on the far side.
  for (let n = 0; n < standing.length; n++) {
    const pole = standing[n]!;
    if (Number.isNaN(pole.x)) continue;
    const drop = rngFrom(site.seed, 'overhead-drop', street.axis, street.index, n);
    if (!drop.chance(0.55)) continue;
    tie(pole, 1, spanA);
    const end = spanA.y - drop.range(0.4, 1.4);
    if (!wallAnchor(hosts, street, pole.at + drop.jitter() * 1.5, end, -side, spanB)) continue;
    const sag = 0.02 * spanA.distanceTo(spanB);
    const under = h.floorUnder(street, pole.at, pole.at);
    if (under === null || Math.min(spanA.y, spanB.y) - sag < under + h.clearUnder(street, spanA, spanB)) continue;
    if (!clearOfHosts(hosts, spanA, spanB, sag, 0, street)) continue;
    strung.push({ a: spanA.clone(), b: spanB.clone(), sag, pieces: 4 });
    wired.add(n);
  }
  for (const n of wired) {
    const pole = standing[n]!;
    const half = POLE_WIDTH * TOWN_POLE * 0.5;
    box(out, pole.x, pole.z, 1, 0, half, half, pole.y - 0.4, pole.y + POLE_HEIGHT, poleColour);
    const top = pole.y + POLE_HEIGHT - 0.3;
    box(
      out, pole.x + armX * ARM_REACH * 0.5, pole.z + armZ * ARM_REACH * 0.5, armX === 0 ? 0 : 1, armX === 0 ? 1 : 0,
      ARM_REACH * 0.5 + half, ARM_DEPTH * TOWN_POLE * 0.5, top - ARM_DEPTH * 0.5, top + ARM_DEPTH * 0.5, poleColour, true,
    );
    h.taken.push([pole.x, pole.z]);
    h.poles++;
  }
  for (const wire of strung) {
    const first = out.position.length / 3;
    line(out, wire.a, wire.b, wire.sag, WIRE_WIDTH * 0.5, WIRE_COLOUR, wire.pieces);
    h.record(first, wire.a, wire.b);
    h.wires++;
  }
}
