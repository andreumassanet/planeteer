/**
 * A small country station, dressed in its city's region: a hall under a
 * hipped roof, a canopy along the platform, benches, a clock, name boards,
 * lamps and a buffer stop. Built in the station's own frame (+Z out along the
 * line, the platform toward +X times `sign`, y = 0 at the crown) and merged
 * into one inked buffer.
 */
import * as THREE from 'three';
import type { Place } from '../places.ts';
import { PALETTE } from '../theme.ts';
import { PROUD, assemble, craftContext, soupOf } from '../craft/build.ts';
import { DOOR_JAMB, TONES, createSceneryContext, doorPaint } from '../scenery/contract.ts';
import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';
import { regionFor } from '../scenery/regions.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';
import { BENCH_SEAT } from '../bench.ts';
import {
  GAUGE, HALL_DEPTH, HALL_FROM, HALL_LENGTH, PLATFORM_FROM, PLATFORM_INNER, PLATFORM_LENGTH, PLATFORM_RISE, PLATFORM_WIDTH,
} from '../rails/line.ts';
import { RAIL_TOP } from '../rails/trains.ts';
import { STATION_BENCH_BACK, STATION_BENCH_DEPTH, STATION_BENCH_X, STATION_BENCH_ZS } from './constants.ts';

type Context = ReturnType<typeof craftContext>;

/** Everything the station's parts share while one is being built. */
interface Parts {
  g: THREE.Group;
  /** Mirrors an x by the platform's side. */
  x: (v: number) => number;
  sign: number;
  /** How far the slabs reach down to the lowest ground under them. */
  drop: number;
  deck: number;
  base: Context;
  kit: SceneryContext;
  rng: Rng;
  style: RegionStyle;
  wall: number;
  tile: number;
  course: number;
  shade: number;
  surround: number;
  iron: number;
  timber: number;
  cream: number;
  lean: THREE.Vector3;
  foot: THREE.Vector3;
}

const HALL_X = PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH / 2 - 0.2;
const HALL_Z = HALL_FROM + HALL_LENGTH / 2;
const WALL_HEIGHT = 7.5;
const CANOPY_FROM = HALL_FROM - 6;
const CANOPY_TO = HALL_FROM + HALL_LENGTH + 6;
/** The hall's platform-side wall face. */
const WALL_FACE = PLATFORM_INNER + PLATFORM_WIDTH - 0.2;

/** The platform: a slab up to a step over the crown, a lighter coping and a yellow edge line. */
function platform(p: Parts): void {
  const { g, x, base: { box, tone }, deck, drop } = p;
  const slab = box(PLATFORM_WIDTH, deck + drop, PLATFORM_LENGTH, tone(PALETTE.bone, 1.05));
  slab.position.set(x(PLATFORM_INNER + PLATFORM_WIDTH / 2), -drop, PLATFORM_FROM + PLATFORM_LENGTH / 2);
  g.add(slab);
  const coping = box(0.7, 0.2, PLATFORM_LENGTH + 2 * PROUD, tone(PALETTE.bone, 1.15));
  coping.position.set(x(PLATFORM_INNER + 0.35 - PROUD), deck - 0.2 + PROUD, PLATFORM_FROM + PLATFORM_LENGTH / 2);
  g.add(coping);
  const edge = box(0.35, PROUD, PLATFORM_LENGTH - 0.4, PALETTE.gold);
  edge.position.set(x(PLATFORM_INNER + 1.0), deck, PLATFORM_FROM + PLATFORM_LENGTH / 2);
  g.add(edge);
}

/** The hall's walls, base course, eave band, quoins, and a door and windows in each long face. */
function hall(p: Parts): void {
  const { g, x, base: { box }, kit, drop, deck } = p;
  const walls = box(HALL_DEPTH, WALL_HEIGHT + drop - PROUD, HALL_LENGTH, p.wall);
  walls.position.set(x(HALL_X), -drop, HALL_Z);
  g.add(walls);
  const plinth = box(HALL_DEPTH + 2 * PROUD, 0.9 + drop, HALL_LENGTH + 2 * PROUD, p.course);
  plinth.position.set(x(HALL_X), -drop, HALL_Z);
  g.add(plinth);
  const band = box(HALL_DEPTH + 2 * PROUD, 0.4, HALL_LENGTH + 2 * PROUD, p.shade);
  band.position.set(x(HALL_X), WALL_HEIGHT - 0.4, HALL_Z);
  g.add(band);
  for (const along of [-1, 1]) {
    for (const across of [-1, 1]) {
      const quoin = box(0.7, WALL_HEIGHT - 1.3, 0.7, p.surround);
      quoin.position.set(x(HALL_X + across * (HALL_DEPTH / 2 - 0.35 + PROUD)), 0.9, HALL_Z + along * (HALL_LENGTH / 2 - 0.35 + PROUD));
      g.add(quoin);
    }
  }

  // Each long face: a door in the middle bay and a pair of windows either side.
  const bay = 4.2;
  const doorPaintHere = doorPaint(p.rng, p.style, p.wall);
  for (const face of [-1, 1]) {
    const platformSide = face < 0;
    const faceX = HALL_X + (face * HALL_DEPTH) / 2;
    const turn = (p.sign * face * Math.PI) / 2;
    const sill = platformSide ? deck : 0.9;
    for (const half of [-1, 1]) {
      const row = kit.windows({ count: 2, width: 1.8, height: 3, panes: 2, frame: p.surround, spread: bay });
      row.rotation.y = turn;
      row.position.set(x(faceX), sill + 1.3, HALL_Z + half * bay * 1.5);
      g.add(row);
    }
    const door = kit.door({ width: 2.6, height: 4.2, leaf: doorPaintHere, frame: p.surround });
    door.rotation.y = turn;
    door.position.set(x(faceX), sill, HALL_Z);
    g.add(door);
    if (!platformSide) {
      // The town-side door is up a step from the lowest ground under the hall.
      const step = box(1, 0.9 + drop, 2.6 + DOOR_JAMB * 2, p.course);
      step.position.set(x(faceX + 0.5), -drop, HALL_Z);
      g.add(step);
    }
  }
}

/** The hipped roof with eaves, a ridge cap and a chimney. */
function roof(p: Parts): void {
  const { g, x, base: { box, tone }, kit, rng, tile } = p;
  const eaves = 1.2;
  const rise = 3.2;
  const ridge = HALL_LENGTH * rng.range(0.35, 0.6);
  const hipped = kit.roof(HALL_LENGTH + eaves * 2, HALL_DEPTH + eaves * 2, rise, ridge, tile);
  hipped.rotation.y = Math.PI / 2;
  hipped.position.set(x(HALL_X), WALL_HEIGHT, HALL_Z);
  g.add(hipped);
  const ridgeCap = box(0.42, 0.3, ridge + 0.3, tone(tile, TONES.cap));
  ridgeCap.position.set(x(HALL_X), WALL_HEIGHT + rise - 0.1, HALL_Z);
  g.add(ridgeCap);
  const chimney = box(0.9, 2.4, 0.9, p.course);
  chimney.position.set(x(HALL_X + 1.6), WALL_HEIGHT + 0.6, HALL_Z + HALL_LENGTH * 0.22 * rng.sign());
  g.add(chimney);
  const pot = box(1.1, 0.3, 1.1, tone(tile, TONES.cap));
  pot.position.set(chimney.position.x, chimney.position.y + 2.4, chimney.position.z);
  g.add(pot);
}

/** The canopy: iron posts with brackets, a roof falling toward the track, a fretted valance. */
function canopy(p: Parts): void {
  const { g, x, base: { box, column, tone, strut }, deck, iron, lean, foot } = p;
  const canopyLength = CANOPY_TO - CANOPY_FROM;
  const canopyZ = (CANOPY_FROM + CANOPY_TO) / 2;
  const lip = PLATFORM_INNER + 0.3;
  const high = 6.6;
  const low = 5.9;
  const heightAt = (v: number): number => low + ((high - low) * (v - lip)) / (WALL_FACE - lip);
  const postX = PLATFORM_INNER + 1.5;
  const posts = 5;
  for (let k = 0; k < posts; k++) {
    const z = CANOPY_FROM + 1 + ((canopyLength - 2) * k) / (posts - 1);
    const post = column(0.16, heightAt(postX) - deck, iron, 8);
    post.position.set(x(postX), deck, z);
    g.add(post);
    const shoe = box(0.5, 0.4, 0.5, iron);
    shoe.position.set(x(postX), deck, z);
    g.add(shoe);
    g.add(strut(lean.set(x(postX), heightAt(postX) - 1.1, z), foot.set(x(postX + 1.6), heightAt(postX + 1.6) - 0.1, z), 0.14, iron));
  }
  const beam = box(0.3, 0.35, canopyLength, iron);
  beam.position.set(x(postX), heightAt(postX) - 0.35, canopyZ);
  g.add(beam);
  const slope = Math.atan2(high - low, WALL_FACE - lip);
  const span = Math.hypot(high - low, WALL_FACE - lip);
  const sheet = box(span + 0.3, 0.22, canopyLength, tone(p.tile, 0.92));
  sheet.rotation.z = p.sign * slope;
  sheet.position.set(x((lip + WALL_FACE) / 2), (low + high) / 2 - 0.11, canopyZ);
  g.add(sheet);
  g.add(valance(x(lip - 0.12), low - 0.05, CANOPY_FROM, CANOPY_TO, p.cream));
}

/** A clock on the hall's end wall, facing up the platform. */
function clock(p: Parts): void {
  const { g, x, base: { box, column }, iron, cream } = p;
  const clockX = x(WALL_FACE + 1.7);
  const clockY = 5.9;
  const rim = column(0.82, 0.2, iron, 16);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(clockX, clockY, HALL_FROM - 0.2);
  g.add(rim);
  const dial = column(0.68, 0.28, cream, 16);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(clockX, clockY, HALL_FROM - 0.28);
  g.add(dial);
  const hour = box(0.1, 0.4, PROUD, PALETTE.ink);
  hour.position.set(clockX, clockY, HALL_FROM - 0.28 - PROUD / 2);
  g.add(hour);
  const minute = box(0.52, 0.08, PROUD, PALETTE.ink);
  minute.position.set(clockX + 0.22, clockY + 0.02, HALL_FROM - 0.28 - PROUD / 2);
  g.add(minute);
}

/** Benches under the canopy, backs to the hall, the seat top at `BENCH_SEAT` over the deck. */
function benches(p: Parts): void {
  const { g, x, base: { box }, deck, iron, timber } = p;
  const benchX = STATION_BENCH_X;
  const legs = BENCH_SEAT - 0.14;
  for (const z of STATION_BENCH_ZS) {
    const seat = box(STATION_BENCH_DEPTH, 0.14, 3.6, timber);
    seat.position.set(x(benchX), deck + legs, z);
    g.add(seat);
    const back = box(0.14, 0.75, 3.6, timber);
    back.position.set(x(benchX + STATION_BENCH_BACK + 0.07), deck + legs + 0.26, z);
    g.add(back);
    for (const end of [-1, 1]) {
      const leg = box(1.05, legs, 0.14, iron);
      leg.position.set(x(benchX + 0.05), deck, z + end * 1.5);
      g.add(leg);
      const arm = box(0.14, 0.95, 0.14, iron);
      arm.position.set(x(benchX + STATION_BENCH_BACK + 0.07), deck + legs, z + end * 1.5);
      g.add(arm);
    }
  }
}

/** A name board on two legs at each end of the platform; the letters are blocks through the board. */
function nameBoards(p: Parts): void {
  const { g, x, base: { box, column, tone }, deck, iron, cream } = p;
  const letters = p.rng.between(5, 9);
  const boardBlue = tone(PALETTE.skyBlue, 0.5);
  for (const z of [PLATFORM_FROM + 4.5, PLATFORM_FROM + PLATFORM_LENGTH - 7]) {
    const boardX = PLATFORM_INNER + PLATFORM_WIDTH - 1.4;
    for (const end of [-1, 1]) {
      const leg = column(0.1, 4.2, iron, 6);
      leg.position.set(x(boardX), deck, z + end * 2.6);
      g.add(leg);
    }
    const frame = box(0.16, 1.3, 5.9, cream);
    frame.position.set(x(boardX), deck + 3.1, z);
    g.add(frame);
    const panel = box(0.32, 1.0, 5.5, boardBlue);
    panel.position.set(x(boardX), deck + 3.25, z);
    g.add(panel);
    const pitch = 4.4 / letters;
    for (let k = 0; k < letters; k++) {
      const letter = box(0.48, 0.5, pitch * 0.62, cream);
      letter.position.set(x(boardX), deck + 3.5, z - 2.2 + pitch * (k + 0.5));
      g.add(letter);
    }
  }
}

/** Lamps down the open ends of the platform. */
function platformLamps(p: Parts): void {
  const { g, x, base: { box, column }, kit, deck, iron, cream } = p;
  for (const z of [PLATFORM_FROM + 1.2, CANOPY_TO + 3, PLATFORM_FROM + PLATFORM_LENGTH - 1.2]) {
    const lampX = PLATFORM_INNER + PLATFORM_WIDTH - 0.8;
    const pole = column(0.1, 5, iron, 6);
    pole.position.set(x(lampX), deck, z);
    g.add(pole);
    const lantern = box(0.55, 0.7, 0.55, cream);
    lantern.position.set(x(lampX), deck + 5, z);
    g.add(lantern);
    const hat = kit.roof(0.95, 0.95, 0.45, 0, iron);
    hat.position.set(x(lampX), deck + 5.7, z);
    g.add(hat);
  }
}

/** The buffer stop at the terminus: a painted headstock on two posts, buffers, and stays to the rails. */
function bufferStop(p: Parts): void {
  const { g, base: { box, column, tone, strut }, iron, lean, foot } = p;
  const stopZ = 2.2;
  const headY = RAIL_TOP + 1.55;
  const red = tone(PALETTE.red, 0.9);
  for (const hand of [-1, 1]) {
    const rail = (hand * GAUGE) / 2;
    const sole = box(0.5, 0.3, 2.6, iron);
    sole.position.set(rail, RAIL_TOP - 0.05, stopZ - 0.9);
    g.add(sole);
    const post = box(0.36, headY - RAIL_TOP + 0.3, 0.36, iron);
    post.position.set(rail, RAIL_TOP + 0.2, stopZ);
    g.add(post);
    g.add(strut(lean.set(rail, headY + 0.1, stopZ - 0.1), foot.set(rail, RAIL_TOP + 0.25, stopZ - 2.1), 0.26, iron));
    const buffer = column(0.2, 0.55, PALETTE.steel, 10);
    buffer.rotation.x = Math.PI / 2;
    buffer.position.set(rail, headY + 0.35, stopZ + 0.2);
    g.add(buffer);
    const head = column(0.36, 0.12, PALETTE.steel, 12);
    head.rotation.x = Math.PI / 2;
    head.position.set(rail, headY + 0.35, stopZ + 0.75);
    g.add(head);
  }
  const headstock = box(GAUGE + 1.4, 0.7, 0.55, red);
  headstock.position.set(0, headY, stopZ);
  g.add(headstock);
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const chevron = box(0.38, 0.5, PROUD, PALETTE.white);
    chevron.position.set(k * 0.42, headY + 0.1, stopZ + 0.275 + PROUD / 2);
    chevron.rotation.z = (k < 0 ? 1 : -1) * 0.5;
    g.add(chevron);
  }
  const lamp = box(0.4, 0.4, 0.3, red);
  lamp.position.set(0, headY + 0.7, stopZ);
  g.add(lamp);
}

/**
 * A fretted valance board along Z at `atX`, its top at `top`: a band and a
 * row of points under it, as one mesh. Each piece is a closed prism, every
 * face wound away from its own middle.
 */
function valance(atX: number, top: number, from: number, to: number, color: number): THREE.Mesh {
  const BAND = 0.32;
  const POINT = 0.3;
  const THICK = 0.1;
  const PITCH = 0.62;
  const points: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();
  const face = (corners: THREE.Vector3[], centre: THREE.Vector3): void => {
    for (let k = 1; k + 1 < corners.length; k++) {
      const p0 = corners[0]!, p1 = corners[k]!, p2 = corners[k + 1]!;
      n.crossVectors(a.subVectors(p1, p0), b.subVectors(p2, p0));
      const flip = n.dot(a.subVectors(p0, centre)) < 0;
      for (const v of flip ? [p0, p2, p1] : [p0, p1, p2]) points.push(v.x, v.y, v.z);
    }
  };
  /** A polygon in (z, y) extruded across X by `THICK`. */
  const prism = (outline: readonly (readonly [number, number])[]): void => {
    const front = outline.map(([z, y]) => new THREE.Vector3(atX + THICK / 2, y, z));
    const back = outline.map(([z, y]) => new THREE.Vector3(atX - THICK / 2, y, z));
    const centre = new THREE.Vector3();
    for (const v of front) centre.add(v);
    for (const v of back) centre.add(v);
    centre.divideScalar(front.length * 2);
    face(front, centre);
    face(back, centre);
    for (let k = 0; k < outline.length; k++) {
      const k1 = (k + 1) % outline.length;
      face([front[k]!, front[k1]!, back[k1]!, back[k]!], centre);
    }
  };
  prism([[from, top - BAND], [to, top - BAND], [to, top], [from, top]]);
  const count = Math.max(1, Math.floor((to - from) / PITCH));
  const step = (to - from) / count;
  for (let k = 0; k < count; k++) {
    const z0 = from + k * step;
    prism([[z0, top - BAND], [z0 + step / 2, top - BAND - POINT], [z0 + step, top - BAND]]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, craftContext().toon(color));
}

/**
 * A station builder for one railway. The scenery kit is created once, from
 * the first station's craft context, and shared by every station after it.
 */
export function createStationBuilder(continentOf: ReadonlyMap<string, string>): (sign: number, drop: number, place: Place, key: string) => THREE.Group {
  let sceneryKit: SceneryContext | null = null;
  return function buildStation(sign, drop, place, key) {
    const base = craftContext();
    sceneryKit ??= createSceneryContext(base);
    const { tone } = base;
    const rng = rngFrom('station', key);
    const continent = continentOf.get(place.iso ?? '') ?? '';
    const style = regionFor(place.iso ?? '', continent, place.lat);
    const wall = rng.pick(style.walls);
    const tile = rng.pick(style.roofs);
    const parts: Parts = {
      g: new THREE.Group(),
      x: (v) => sign * v,
      sign,
      drop,
      deck: PLATFORM_RISE,
      base,
      kit: sceneryKit,
      rng,
      style,
      wall,
      tile,
      course: tone(wall, TONES.course),
      shade: tone(wall, TONES.eave),
      surround: tone(wall, TONES.light),
      iron: tone(PALETTE.green, 0.55),
      timber: tone(PALETTE.brown, 0.9),
      cream: PALETTE.cream,
      lean: new THREE.Vector3(),
      foot: new THREE.Vector3(),
    };
    platform(parts);
    hall(parts);
    roof(parts);
    canopy(parts);
    clock(parts);
    benches(parts);
    nameBoards(parts);
    platformLamps(parts);
    bufferStop(parts);

    const assembled = assemble('station', [soupOf(parts.g)]);
    assembled.traverse((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });
    return assembled;
  };
}
