/**
 * Where a town's buildings go: a pure function of the world and the town.
 *
 * A hamlet (under `HAMLET` radius) is its centrepiece in a small square with a
 * ring of houses on two or three lanes. A town has a square wide enough for
 * its landmark, `avenues` radial streets kept clear, and buildings by
 * rejection sampling; a colony instead stands its modules in rows down each
 * avenue, then in back lots, until its triangle budget is spent.
 */

import * as THREE from 'three';
import type { ArchitectureStyle, ColonyStyle, WorldSpec } from '../contract.ts';
import { DEFAULT_ARCHITECTURE } from '../contract.ts';
import { rngFrom } from '../../scenery/random.ts';
import type { Rng } from '../../scenery/random.ts';
import { PIECES, isKitBuilding } from '../kit.ts';
import type { Plot, Site } from './types.ts';

/** A building's footprint radius before it is built, units: what the layout leaves room for. */
export const GUESS = 8;
/** The room a colony leaves a form built in code, units at scale 1 (the forms run 3 to 7 across). */
const CODE_ROOM = 6;
/** Under this built radius a settlement is a hamlet. */
export const HAMLET = 40;
/** How far a colony's row stands back from its avenue's kerb, units. */
const SETBACK = 2.5;
/** How deep a yard behind a module is, units. */
export const YARD = 4.5;
/** A landing pad's radius, units: room for a ship and the crew round it. */
const PAD = 10;
export const PAD_RADIUS = PAD;

/** The frame of a site: `y` up, `z` toward the north pole, `x = y x z`. Right-handed, determinant +1. */
export function frameAt(dir: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const up = dir;
  const ref = Math.abs(up.y) > 0.995 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const north = ref.clone().addScaledVector(up, -ref.dot(up)).normalize();
  const x = new THREE.Vector3().crossVectors(up, north);
  const basis = new THREE.Matrix4().makeBasis(x, up, north);
  if (basis.determinant() <= 0) throw new Error('worlds: a town frame came out mirrored');
  return out.setFromRotationMatrix(basis);
}

/** The triangles a colony of this built radius may cost. */
export function colonyBudget(radius: number): number {
  return Math.round(Math.min(64000, 10000 + radius * 440));
}

/** The circle a kit building keeps to, units, at a colony's scale: half its wider side. */
export function pieceRadius(id: string, scale: number): number {
  const info = PIECES[id];
  if (info === undefined) return GUESS * scale;
  return (Math.max(info.size[0], info.size[2]) / 2) * info.scale * scale * 0.96;
}

/** About what a plot costs, triangles, for the budget. */
function plotTriangles(plot: Plot): number {
  const info = PIECES[plot.form];
  let t = info?.triangles ?? 900;
  if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') t += PIECES['house-single-support']!.triangles;
  if (plot.roof !== undefined) t += PIECES[plot.roof]?.triangles ?? 0;
  if (plot.yard === true) t += 800;
  if (plot.row !== undefined) t += PIECES.connector!.triangles * 0.6;
  if (plot.form === 'pad') t += 3400;
  return t;
}

export function layoutOf(spec: WorldSpec, id: string, radius: number, landmark: boolean): { plots: Plot[]; plaza: number; avenues: number[]; paving: number } {
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const rng = rngFrom('worlds', spec.id, 'town', id);
  const paving = radius * 0.96;
  const half = avenueHalfOf(spec);
  const colony = landmark ? undefined : style.colony;
  // A hamlet is its centrepiece in a small square and a ring of houses round
  // it, on two or three lanes; a town has a ring of buildings outside a square
  // wide enough for its landmark and a walk round it.
  const small = radius < HAMLET;
  let plaza = landmark ? radius * 0.9 : small ? Math.min(13, Math.max(6, radius * 0.34)) : Math.max(18, radius * 0.2);
  const wanted = Math.max(3, Math.min(8, Math.round(style.avenues)));
  // Two lanes through the smallest, opposite each other; three through a
  // larger hamlet.
  const count = small ? Math.min(radius < 25 ? 2 : 3, wanted) : wanted;
  const turn = rng.range(0, Math.PI * 2);
  const avenues: number[] = [];
  for (let k = 0; k < count; k++) avenues.push(turn + (k / count) * Math.PI * 2);
  const centreYaw = rng.range(0, Math.PI * 2);
  if (colony !== undefined) {
    // A hub from the kit wants a square round it wide enough to walk round
    // and for its dishes: the centrepiece's own radius and ten.
    // In a hamlet everything is smaller, so a ring of modules still fits
    // between its square and its edge.
    const tight = Math.min(1, Math.max(radius < 16 ? 0.42 : 0.6, radius / 50));
    const centreScale = Math.min(1.25, Math.max(0.5, radius / 40)) * (colony.scale ?? 1);
    const form = colony.centre ?? style.landmark;
    if (colony.centre !== null) plaza = Math.min(paving * 0.62, Math.max(plaza, pieceRadius(colony.centre, centreScale) + (small ? 3 : 10)));
    const plots: Plot[] = [{ form, x: 0, z: 0, yaw: centreYaw, scale: colony.centre === null ? (small ? 0.8 : 1.5) : centreScale, seed: `${id}:landmark` }];
    colonyLayout(spec, style, colony, id, radius, paving, plaza, avenues, half, plots, rng, tight);
    return { plots, plaza, avenues, paving };
  }
  const plots: Plot[] = [{ form: style.landmark, x: 0, z: 0, yaw: centreYaw, scale: landmark ? 1 : small ? 0.8 : 1.5, seed: `${id}:landmark` }];
  if (landmark) return { plots, plaza, avenues, paving };

  // Which way a front faces: into the square, or into the wind.
  const upwind = style.yaw === 'wind' && spec.wind !== null ? upwindYaw(spec.wind.toward) : null;
  const facing = (x: number, z: number): number => (upwind ?? Math.atan2(-x, -z)) + rng.jitter() * (upwind === null ? 0.3 : 0.18);
  const offAvenues = (x: number, z: number, room: number): boolean => clearOfAvenues(avenues, half, x, z, room);

  if (small) {
    // The ring: houses a little smaller than a town's, evenly round, each
    // set back to the paving's edge, and none on a lane.
    const scale = Math.min(0.85, Math.max(0.55, radius / HAMLET));
    const guess = GUESS * scale;
    const ring = Math.max(plaza + guess + 1, paving - guess * 0.6);
    const slots = Math.min(8, Math.floor((Math.PI * 2 * ring) / (guess * 2 + 2.5)));
    const start = rng.range(0, Math.PI * 2);
    for (let k = 0; k < slots; k++) {
      const a = start + ((k + rng.range(-0.12, 0.12)) / slots) * Math.PI * 2;
      const x = Math.sin(a) * ring;
      const z = Math.cos(a) * ring;
      if (!offAvenues(x, z, guess * 0.8)) continue;
      const form = rng.weighted(style.forms);
      plots.push({ form, x, z, yaw: facing(x, z), scale: scale * rng.range(0.9, 1.05), seed: `${id}:${plots.length}` });
    }
    return { plots, plaza, avenues, paving };
  }

  // Buildings by rejection: a point in the ring between the square and the
  // edge, off every avenue, clear of every building already placed. The
  // radii are guessed before building and the true ones are kept after, when
  // `buildStandIn` lets go of any that turn out to reach into an avenue or a
  // neighbour — so the guess may be generous about the avenues, and is.
  const area = Math.PI * (paving * paving - plaza * plaza);
  const target = Math.round((area / 1000) * style.density);
  const placed: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: plaza * 0.5 }];
  // No room between the square and the edge: an outpost, its landmark alone.
  const inner = plaza + GUESS * 0.75;
  const outer = paving - GUESS * 0.6;
  const room = outer > inner;
  for (let attempt = 0; room && attempt < target * 8 && plots.length - 1 < target; attempt++) {
    const d = Math.sqrt(rng.range(inner ** 2, outer ** 2));
    const a = rng.range(0, Math.PI * 2);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    if (!offAvenues(x, z, GUESS * 0.75)) continue;
    let clear = true;
    for (const other of placed) {
      if (Math.hypot(other.x - x, other.z - z) < other.r + GUESS * 0.9) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    placed.push({ x, z, r: GUESS });
    const form = rng.weighted(style.forms);
    plots.push({ form, x, z, yaw: facing(x, z), scale: rng.range(0.8, 1.1), seed: `${id}:${plots.length}` });
  }
  return { plots, plaza, avenues, paving };
}

/** Whether a point stands clear of every avenue (a ray from the middle) by `room`. */
function clearOfAvenues(avenues: readonly number[], half: number, x: number, z: number, room: number): boolean {
  for (const avenue of avenues) {
    const along = x * Math.sin(avenue) + z * Math.cos(avenue);
    if (along < -room) continue;
    if (Math.abs(x * Math.cos(avenue) - z * Math.sin(avenue)) < half + room) return false;
  }
  return true;
}

/**
 * A colony's plots after its centrepiece: a landing pad if the town is big
 * enough, the rows down the avenues, then the back lots — in that order, so
 * the budget is spent on the street first. The gates over the avenues are
 * not plots: they stand on the street, which no plot may, and `buildGates` puts
 * them there.
 */
function colonyLayout(
  spec: WorldSpec,
  style: ArchitectureStyle,
  colony: ColonyStyle,
  id: string,
  radius: number,
  paving: number,
  plaza: number,
  avenues: readonly number[],
  half: number,
  plots: Plot[],
  rng: Rng,
  tight: number,
): void {
  const scale = (colony.scale ?? 1) * tight;
  const budget = colonyBudget(radius);
  let spent = plotTriangles(plots[0]!);
  const placed: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: plaza - 1 }];
  const population = spec.body.settlements.find((one) => one.id === id)?.population ?? 0;
  const upwind = style.yaw === 'wind' && spec.wind !== null ? upwindYaw(spec.wind.toward) : null;
  const fits = (x: number, z: number, r: number): boolean => {
    const d = Math.hypot(x, z);
    if (d + r > paving - 1 || d - r < plaza + 1) return false;
    if (!clearOfAvenues(avenues, half, x, z, r + 0.6)) return false;
    for (const other of placed) if (Math.hypot(other.x - x, other.z - z) < other.r + r + 1.5) return false;
    return true;
  };
  /** A plot's building: its form, scale, roof and yard, before it is placed. */
  const draw = (): { form: string; scale: number; r: number; roof?: string; yard: boolean } => {
    const form = rng.weighted(colony.modules);
    const kit = isKitBuilding(form);
    const s = scale * rng.range(0.9, 1.06);
    const info = PIECES[form];
    const yard = kit && (info?.role === 'module' || info?.role === 'hub') && rng.chance(colony.yards);
    const roof = info?.roofed === true && rng.chance(colony.roofs) ? rng.pick(['roof-antenna', 'roof-radar', 'roof-opening', 'roof-antenna']) : undefined;
    return { form, scale: s, r: kit ? pieceRadius(form, s) : CODE_ROOM * s, yard, ...(roof === undefined ? {} : { roof }) };
  };

  // The landing pad: in the widest gap between two avenues, out at the edge.
  if (population >= colony.spaceport && radius >= HAMLET) {
    let best = 0;
    let gap = -1;
    avenues.forEach((a, k) => {
      const next = avenues[(k + 1) % avenues.length]! + (k === avenues.length - 1 ? Math.PI * 2 : 0);
      if (next - a > gap) {
        gap = next - a;
        best = a + gap / 2;
      }
    });
    const room = PAD + 1;
    const d = paving - room - 1;
    const x = Math.sin(best) * d;
    const z = Math.cos(best) * d;
    if (fits(x, z, room)) {
      const pad: Plot = { form: 'pad', x, z, yaw: best + Math.PI / 2, scale: 1, seed: `${id}:pad`, room };
      plots.push(pad);
      placed.push({ x, z, r: room });
      spent += plotTriangles(pad);
    }
  }

  // The rows: down each side of each avenue, set back from its kerb, doors to it.
  avenues.forEach((a, k) => {
    for (const side of [-1, 1]) {
      let along = plaza + 1;
      let place = 0;
      for (let tries = 0; tries < 60 && along < paving - 4; tries++) {
        const pick = draw();
        const room = pick.r + (pick.yard ? YARD : 0);
        const off = half + SETBACK + room;
        const at = along + room;
        const x = Math.sin(a) * at + Math.cos(a) * off * side;
        const z = Math.cos(a) * at - Math.sin(a) * off * side;
        const plot: Plot = {
          form: pick.form,
          x,
          z,
          // The front (+Z) to the avenue: back along the offset.
          yaw: Math.atan2(-Math.cos(a) * side, Math.sin(a) * side) + rng.jitter() * 0.05,
          scale: pick.scale,
          seed: `${id}:${k}:${side}:${place}`,
          room,
          yard: pick.yard,
          row: k * 2 + (side > 0 ? 1 : 0),
          place,
          ...(pick.roof === undefined ? {} : { roof: pick.roof }),
        };
        const cost = plotTriangles(plot);
        if (fits(x, z, room) && spent + cost <= budget) {
          plots.push(plot);
          placed.push({ x, z, r: room });
          spent += cost;
          place++;
          along = at + room + rng.range(1.5, 4);
        } else along += 3;
      }
    }
  });

  // The back lots, facing the square (or the wind), while the budget lasts.
  const inner = plaza + 1;
  const outer = paving - 1;
  for (let attempt = 0; attempt < 240 && outer > inner && spent < budget; attempt++) {
    const pick = draw();
    const room = pick.r + (pick.yard ? YARD : 0);
    const d = Math.sqrt(rng.range(inner ** 2, outer ** 2));
    const a = rng.range(0, Math.PI * 2);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const plot: Plot = {
      form: pick.form,
      x,
      z,
      yaw: (upwind ?? Math.atan2(-x, -z)) + rng.jitter() * 0.25,
      scale: pick.scale,
      seed: `${id}:${plots.length}`,
      room,
      yard: pick.yard,
      ...(pick.roof === undefined ? {} : { roof: pick.roof }),
    };
    const cost = plotTriangles(plot);
    if (spent + cost > budget || !fits(x, z, room)) continue;
    plots.push(plot);
    placed.push({ x, z, r: room });
    spent += cost;
  }
}

/** Half an avenue's width for a world's architecture, units. */
export function avenueHalfOf(spec: WorldSpec): number {
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  return Math.max(1.5, (style.avenueWidth ?? DEFAULT_ARCHITECTURE.avenueWidth ?? 6) / 2);
}

/**
 * The yaw that turns a building's front (+Z) to face *into* a wind blowing
 * toward `toward` degrees, in a town's frame — whose +X is west and +Z
 * north (`frameAt`: x = up x north), so a bearing's east component is -X.
 */
export function upwindYaw(toward: number): number {
  const b = (toward * Math.PI) / 180;
  return Math.atan2(Math.sin(b), -Math.cos(b));
}

/** Where a traveller arriving at a town stands: on its first avenue, a little out from the square. */
export function arrivalOf(site: Site): { x: number; z: number } {
  if (site.town !== null) return site.town.arrival;
  const avenue = site.avenues[0]!;
  const out = Math.min(site.paving - 3, site.plaza + 6);
  return { x: Math.sin(avenue) * out, z: Math.cos(avenue) * out };
}

/** The circles a building of the kit keeps, in its plot's frame before the yaw: one, or a row along a long side. */
export function circlesOf(id: string, scale: number, forward: number): { x: number; z: number; r: number }[] {
  const info = PIECES[id];
  if (info === undefined) return [{ x: 0, z: forward, r: GUESS * scale }];
  const s = info.scale * scale;
  const w = info.size[0] * s;
  const d = info.size[2] * s;
  const long = Math.max(w, d);
  const short = Math.min(w, d);
  if (long < short * 1.4) return [{ x: 0, z: forward, r: (long / 2) * 0.96 }];
  const n = Math.ceil(long / short);
  const out: { x: number; z: number; r: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * (long - short);
    out.push(w > d ? { x: t, z: forward, r: (short / 2) * 1.02 } : { x: 0, z: forward + t, r: (short / 2) * 1.02 });
  }
  return out;
}

/** A point of a site's frame in the world. */
export function siteToWorld(site: Site, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, y, z).applyQuaternion(site.quaternion).add(site.origin);
}
