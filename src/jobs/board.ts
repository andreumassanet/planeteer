/**
 * The jobs board: what every town offers on a given day, as a pure function
 * of the places, the roads, the airstrips and the ground, so every client is
 * offered the same and nothing goes on the wire.
 *
 * - an errand: a townsperson (one in `ERRAND_SHARE`, by their key and the
 *   day) asks for a parcel to be taken to a built town a short way off, a
 *   few roads away (`ERRAND_ROADS`), so it can be walked, ridden or driven;
 * - a fare: somebody waits on the verge outside a gate (one road end in
 *   `FARE_SHARE`) to be driven down that road, and sometimes one further;
 * - a load: a stack of crates beside an airstrip (one in `CARGO_SHARE`) for
 *   another strip a long way off;
 * - a rescue: somebody in the water off a coastal town, or stranded on the
 *   high ground over a hill town (one town in `RESCUE_SHARE`), to be brought
 *   back to its shore or its square.
 *
 * A day is the real one, UTC (`jobDay`), so the board turns over at the same
 * moment for everybody.
 */
import * as THREE from 'three';
import type { Place } from '../places.ts';
import { radiusOf } from '../places.ts';
import type { Road } from '../roads/types.ts';
import { courseOf, emptyCourse } from '../roads/course.ts';
import { coursePath, coursePoint, courseTangent, parameterAt } from '../roads.ts';
import type { CoursePath } from '../roads.ts';
import { CARRIAGEWAY_HALF } from '../scenery/grid/square.ts';
import { rngFrom } from '../scenery/random.ts';
import { unitAt } from '../sphere.ts';
import { keepsLeft } from '../traffic/regions.ts';
import { parFor } from './score.ts';
import type { Job, JobKind } from './types.ts';
import { KIND_LETTER } from './types.ts';

/** A day, ms. */
const DAY_MS = 86_400_000;

/** The share of townsfolk with an errand, of road ends with a fare waiting, of strips with a load, of towns with a rescue. */
export const ERRAND_SHARE = 0.14;
export const FARE_SHARE = 0.3;
export const CARGO_SHARE = 0.5;
export const RESCUE_SHARE = 0.18;

/** How far an errand goes, units along the ground, past the town's own edge, and over how many roads at most. */
export const ERRAND_RANGE: readonly [number, number] = [350, 3200];
export const ERRAND_ROADS = 4;
/** A fare goes one road, and with this chance a second from the town it reaches. */
export const FARE_SECOND_LEG = 0.35;
/** How far a load is flown, units: one to three minutes at cruise. */
export const CARGO_RANGE: readonly [number, number] = [6000, 20000];
/** How far off a coast the swimmer is, units, past the town's edge. */
export const SEA_RESCUE_RANGE: readonly [number, number] = [500, 2200];
/** How far up and out the walker is stranded: units out from the town's edge, and units over the town. */
export const HILL_RESCUE_RANGE: readonly [number, number] = [600, 2600];
export const HILL_RISE = 140;
/** The smallest town a rescue starts from. */
export const RESCUE_MIN_POPULATION = 8000;

/** How near the drop counts as there, units, by kind. */
export const DROP_RADIUS: Readonly<Record<JobKind, number>> = { errand: 26, taxi: 34, cargo: 70, rescue: 60 };
/**
 * How far out of its gate a fare waits, units along the road (past the
 * fleet's bus, `BUS_ALONG`, so nothing parked stands on them), and how far
 * off the carriageway's middle.
 */
export const FARE_OUT = 56;
export const FARE_VERGE = CARRIAGEWAY_HALF + 2.6;
/** How clear of anything parked a fare stands, units, and where else it tries: further out, then across the road. */
export const FARE_CLEAR = 7;
const FARE_SPOTS: readonly (readonly [number, number])[] = [[0, 1], [16, 1], [0, -1], [32, 1], [16, -1]];
/** The step a swimmer's shore is searched in, units, and how many dry steps make it the shore. */
const SHORE_STEP = 20;
const SHORE_DRY = 3;
/** How far beside a strip's site the crates stand, units. */
export const CRATE_ASIDE = 26;

/** The real day `ms` falls in, counted from the epoch, UTC. */
export const jobDay = (ms: number): number => Math.floor(ms / DAY_MS);

/** A key as a short token for an id. */
export function token(key: string): string {
  return Math.floor(rngFrom('job-token', key).unit() * 36 ** 6).toString(36).padStart(6, '0');
}

/** An airstrip's site, as the fleet holds it (`FleetSite`): what a load is stacked beside. */
export interface StripSite {
  id: string;
  place: number;
  at: THREE.Vector3;
  forward: THREE.Vector3;
}

export interface BoardSource {
  places: readonly Place[];
  roads: readonly Road[];
  /** Whether the place at an index is built (`isShown`). */
  shown(index: number): boolean;
  /** The ground under a unit direction, as a radius. */
  groundAt(direction: THREE.Vector3): number;
  /** Whether a ground radius is water (`isWater`). */
  isWater(ground: number): boolean;
  /** The planet's radius. */
  radius: number;
  /**
   * Whether something parked stands within `reach` units of a unit direction
   * (the fleet's sites, themselves a pure function of the world), so a fare
   * does not wait on it. Absent, nothing is.
   */
  taken?(direction: THREE.Vector3, reach: number): boolean;
}

export interface Board {
  /** The errand `giver` offers in town `from` today, or null for none. */
  errand(giver: string, from: number, day: number): Job | null;
  /** The fares waiting at the gates of town `from` today, pushed onto `out`. */
  fares(from: number, day: number, out: Job[]): Job[];
  /** The load stacked beside `strip` today, flown to one of `strips`, or null. */
  cargo(strip: StripSite, strips: readonly StripSite[], day: number): Job | null;
  /** The rescue off or over town `from` today, or null. */
  rescue(from: number, day: number): Job | null;
  /** Indices of the built towns within `reach` units of `direction`, pushed onto `out`. */
  townsNear(direction: THREE.Vector3, reach: number, out: number[]): number[];
  /** A place's centre, a unit direction; the board's own, not to be written to. */
  unitOf(index: number): THREE.Vector3;
}

export function createBoard(source: BoardSource): Board {
  const { places, roads, radius: R } = source;
  const units: THREE.Vector3[] = places.map((p) => unitAt(p.lat, p.lon, new THREE.Vector3()));
  /** Each place's road indices. */
  const roadsOf = new Map<number, number[]>();
  roads.forEach((road, i) => {
    for (const end of [road.a, road.b]) {
      const list = roadsOf.get(end) ?? [];
      list.push(i);
      roadsOf.set(end, list);
    }
  });
  const course = emptyCourse();
  const lengths = new Map<number, number>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const side = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const across = new THREE.Vector3();
  const ahead = new THREE.Vector3();

  const angle = (i: number, j: number): number => units[i]!.angleTo(units[j]!);

  function townsNear(direction: THREE.Vector3, reach: number, out: number[]): number[] {
    const limit = Math.cos(Math.min(Math.PI, reach / R));
    for (let i = 0; i < units.length; i++) if (source.shown(i) && units[i]!.dot(direction) >= limit) out.push(i);
    return out;
  }

  /** The built towns within `hops` roads of `from`, not `from` itself, in the order they are reached. */
  function byRoad(from: number, hops: number): number[] {
    const seen = new Set<number>([from]);
    let ring = [from];
    const out: number[] = [];
    for (let hop = 0; hop < hops && ring.length > 0; hop++) {
      const next: number[] = [];
      for (const town of ring) {
        for (const index of roadsOf.get(town) ?? []) {
          const road = roads[index]!;
          const other = road.a === town ? road.b : road.a;
          if (seen.has(other) || !source.shown(other)) continue;
          seen.add(other);
          next.push(other);
          out.push(other);
        }
      }
      ring = next;
    }
    return out;
  }

  function roadLength(index: number): number {
    let length = lengths.get(index);
    if (length === undefined) {
      length = courseOf(roads[index]!, places, course).length;
      lengths.set(index, length);
    }
    return length;
  }

  function job(kind: JobKind, from: number, n: string, day: number, fields: Omit<Job, 'id' | 'kind' | 'from' | 'parMs' | 'iso'>): Job {
    return {
      id: `${KIND_LETTER[kind]}:${from}:${n}:${day}`,
      kind,
      from,
      parMs: parFor(kind, fields.distance),
      iso: places[from]!.iso,
      ...fields,
    };
  }

  function errand(giver: string, from: number, day: number): Job | null {
    const rng = rngFrom('errand', giver, day);
    if (!rng.chance(ERRAND_SHARE)) return null;
    const edge = radiusOf(places[from]!);
    const fit = byRoad(from, ERRAND_ROADS).filter((i) => {
      const d = angle(from, i) * R - edge;
      return d >= ERRAND_RANGE[0] && d <= ERRAND_RANGE[1];
    });
    if (fit.length === 0) return null;
    const to = rng.pick(fit);
    const name = places[to]!.name;
    const thing = rng.pick(['parcel', 'letter', 'cake', 'toolbox', 'bunch of flowers', 'pair of shoes', 'basket of fruit', 'book']);
    return job('errand', from, token(giver), day, {
      title: `${capital(thing)} to ${name}`,
      line: rng.pick([
        `Could you take this ${thing} to ${name}? They're expecting it.`,
        `My cousin in ${name} needs this ${thing} today. Would you?`,
        `Are you heading towards ${name}? This ${thing} has to get there.`,
      ]),
      to,
      pickup: units[from]!.clone(),
      drop: units[to]!.clone(),
      dropRadius: DROP_RADIUS.errand,
      toName: name,
      distance: angle(from, to) * R,
      who: giver,
    });
  }

  const paths = new Map<number, CoursePath>();
  const pathOf = (index: number): CoursePath => {
    let path = paths.get(index);
    if (path === undefined) {
      path = coursePath(courseOf(roads[index]!, places, course));
      paths.set(index, path);
    }
    return path;
  };

  /**
   * Where a fare waits by road `index` at its end in `town`: `FARE_OUT` along
   * the drawn course out of the gate (a third of a short road), on the verge
   * the traffic keeps to.
   */
  function vergeOf(index: number, town: number, into: THREE.Vector3): THREE.Vector3 | null {
    const path = pathOf(index);
    const left = keepsLeft(places[town]!.iso);
    for (const [step, sign] of FARE_SPOTS) {
      const out = Math.min(FARE_OUT + step, path.length * 0.33 + step * 0.25);
      spotOn(index, town, out, (left ? -1 : 1) * sign, into);
      if (source.taken?.(into, FARE_CLEAR) !== true) return into;
    }
    return null;
  }

  /** The spot `out` units along road `index` from its gate in `town`, `FARE_VERGE` to the `sign` side of the way out. */
  function spotOn(index: number, town: number, out: number, sign: number, into: THREE.Vector3): THREE.Vector3 {
    const road = roads[index]!;
    const path = pathOf(index);
    const leaving = road.a === town;
    const t = parameterAt(path, leaving ? out : path.length - out);
    courseOf(road, places, course);
    coursePoint(course, t, into);
    courseTangent(course, t, tangent);
    if (!leaving) tangent.negate();
    tangent.projectOnPlane(into).normalize();
    // Screen right, leaving town: forward x up.
    side.crossVectors(tangent, into).normalize();
    return into.addScaledVector(side, (sign * FARE_VERGE) / R).normalize();
  }

  function fares(from: number, day: number, out: Job[]): Job[] {
    const list = roadsOf.get(from);
    if (list === undefined) return out;
    for (const index of list) {
      const road = roads[index]!;
      const rng = rngFrom('fare', index, from, day);
      if (!rng.chance(FARE_SHARE)) continue;
      const first = road.a === from ? road.b : road.a;
      if (!source.shown(first)) continue;
      let to = first;
      let distance = roadLength(index);
      if (rng.chance(FARE_SECOND_LEG)) {
        const onward = (roadsOf.get(first) ?? []).filter((i) => {
          const next = roads[i]!.a === first ? roads[i]!.b : roads[i]!.a;
          return i !== index && next !== from && source.shown(next);
        });
        if (onward.length > 0) {
          const leg = rng.pick(onward);
          to = roads[leg]!.a === first ? roads[leg]!.b : roads[leg]!.a;
          distance += roadLength(leg);
        }
      }
      const pickup = vergeOf(index, from, new THREE.Vector3());
      if (pickup === null) continue;
      const name = places[to]!.name;
      distance += radiusOf(places[to]!);
      const who = `fare:${index}:${from}:${day}`;
      out.push(
        job('taxi', from, `r${index}`, day, {
          title: `Fare to ${name}`,
          line: rng.pick([`Taxi! Can you take me to ${name}?`, `Are you going to ${name}? I'll ride along.`, `${name}, please. I'm late!`]),
          to,
          pickup,
          drop: units[to]!.clone(),
          dropRadius: DROP_RADIUS.taxi,
          toName: name,
          distance,
          who,
        }),
      );
    }
    return out;
  }

  function cargo(strip: StripSite, strips: readonly StripSite[], day: number): Job | null {
    const rng = rngFrom('cargo', strip.id, day);
    if (!rng.chance(CARGO_SHARE)) return null;
    const fit = strips.filter((s) => {
      if (s.place === strip.place) return false;
      const d = s.at.angleTo(strip.at) * R;
      return d >= CARGO_RANGE[0] && d <= CARGO_RANGE[1];
    });
    if (fit.length === 0) return null;
    fit.sort((x, y) => (x.id < y.id ? -1 : 1));
    const to = rng.pick(fit);
    const name = places[to.place]!.name;
    const what = rng.pick(['medicine', 'mail', 'spare parts', 'seedlings', 'newspapers', 'fresh fish', 'a wedding cake']);
    side.crossVectors(strip.forward, strip.at).normalize();
    const n = strip.id.slice(strip.id.lastIndexOf(':') + 1).replace(/[^a-z0-9]/g, '') || '0';
    return job('cargo', strip.place, `s${n}`, day, {
      title: `Cargo to ${name}`,
      line: `${capital(what)} for ${name}'s airstrip. They need it today.`,
      to: to.place,
      pickup: strip.at.clone().addScaledVector(side, CRATE_ASIDE / R).normalize(),
      drop: to.at.clone(),
      dropRadius: DROP_RADIUS.cargo,
      toName: name,
      distance: strip.at.angleTo(to.at) * R,
      who: `cargo:${strip.id}:${day}`,
    });
  }

  /**
   * The point `distance` units from `origin` at `heading` radians round it, into
   * `out`. The headings are drawn at random, so any pair of tangents will do
   * and neither is called north.
   */
  function along(origin: THREE.Vector3, heading: number, distance: number, out: THREE.Vector3): THREE.Vector3 {
    across.set(0, 1, 0).cross(origin);
    if (across.lengthSq() < 1e-12) across.set(1, 0, 0);
    across.normalize();
    ahead.crossVectors(origin, across).normalize();
    tangent.copy(ahead).multiplyScalar(Math.cos(heading)).addScaledVector(across, Math.sin(heading)).normalize();
    const t = distance / R;
    return out.copy(origin).multiplyScalar(Math.cos(t)).addScaledVector(tangent, Math.sin(t)).normalize();
  }

  const wet = (direction: THREE.Vector3): boolean => source.isWater(source.groundAt(direction));

  /** Whether every point a little way round `centre` is water too. */
  function openWater(centre: THREE.Vector3): boolean {
    if (!wet(centre)) return false;
    for (let k = 0; k < 6; k++) if (!wet(along(centre, (k * Math.PI) / 3, 90, probe))) return false;
    return true;
  }

  /** Whether `direction` is inside any built town's disc, with a margin. */
  function inTown(direction: THREE.Vector3, near: readonly number[]): boolean {
    for (const i of near) if (units[i]!.angleTo(direction) * R < radiusOf(places[i]!) + 60) return true;
    return false;
  }

  function rescue(from: number, day: number): Job | null {
    const place = places[from]!;
    if (place.pop < RESCUE_MIN_POPULATION) return null;
    const rng = rngFrom('rescue', from, day);
    if (!rng.chance(RESCUE_SHARE)) return null;
    const centre = units[from]!;
    const edge = radiusOf(place);
    const near: number[] = [];
    townsNear(centre, edge + HILL_RESCUE_RANGE[1] + 300, near);
    const home = source.groundAt(centre);
    const start = rng.range(0, Math.PI * 2);
    const pickup = new THREE.Vector3();
    // Off the coast first, where there is one; a hill town otherwise.
    for (let k = 0; k < 8; k++) {
      along(centre, start + (k * Math.PI) / 4, edge + rng.range(SEA_RESCUE_RANGE[0], SEA_RESCUE_RANGE[1]), pickup);
      if (!openWater(pickup)) continue;
      const drop = shoreOf(pickup, centre);
      if (drop === null) continue;
      return job('rescue', from, `s${k}`, day, {
        title: `Rescue off ${place.name}`,
        line: `Help! Somebody's in the water off ${place.name}!`,
        to: from,
        pickup: pickup.clone(),
        drop,
        dropRadius: DROP_RADIUS.rescue,
        toName: `${place.name}'s shore`,
        distance: 2 * pickup.angleTo(drop) * R,
        site: 'sea',
        who: `rescue:${from}:${day}`,
      });
    }
    let best: THREE.Vector3 | null = null;
    let bestRise = HILL_RISE;
    for (let k = 0; k < 12; k++) {
      along(centre, start + (k * Math.PI) / 6, edge + rng.range(HILL_RESCUE_RANGE[0], HILL_RESCUE_RANGE[1]), pickup);
      const ground = source.groundAt(pickup);
      if (source.isWater(ground) || inTown(pickup, near)) continue;
      const rise = ground - home;
      if (rise > bestRise) [best, bestRise] = [pickup.clone(), rise];
    }
    if (best === null) return null;
    return job('rescue', from, 'h', day, {
      title: `Rescue above ${place.name}`,
      line: `A walker's stranded on the hill above ${place.name}!`,
      to: from,
      pickup: best,
      drop: centre.clone(),
      dropRadius: DROP_RADIUS.rescue,
      toName: place.name,
      distance: 2 * best.angleTo(centre) * R,
      site: 'hill',
      who: `rescue:${from}:${day}`,
    });
  }

  /**
   * The last water on the way from `pickup` to the town at `centre` before land
   * that goes on for `SHORE_DRY` steps: where a swimmer is set down. A sandbar
   * or an islet on the way is crossed, not landed on.
   */
  function shoreOf(pickup: THREE.Vector3, centre: THREE.Vector3): THREE.Vector3 | null {
    const total = pickup.angleTo(centre) * R;
    const steps = Math.ceil(total / SHORE_STEP);
    let last: THREE.Vector3 | null = null;
    let dry = 0;
    for (let k = 0; k <= steps; k++) {
      a.copy(pickup).lerp(centre, k / steps).normalize();
      if (wet(a)) {
        dry = 0;
        last = b.copy(a).clone();
      } else if (++dry >= SHORE_DRY) return last;
    }
    return null;
  }

  return { errand, fares, cargo, rescue, townsNear, unitOf: (index) => units[index]! };
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
