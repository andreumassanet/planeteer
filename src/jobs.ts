/**
 * Jobs: errands, fares, loads and rescues, offered by the world itself and
 * scored against a par. The board is a pure function of the places, the
 * roads, the airstrips and the real day (`jobs/board.ts`), so every client is
 * offered the same and nothing is sent; what a player has done is a record
 * (`jobs/store.ts`) kept with the passport and the rings in their profile.
 *
 * A job is collected where it waits, with `E`: from the townsperson with an
 * errand (on foot), from the fare on the verge or the person in trouble (in
 * a vehicle with a seat to spare, stopped beside them), from the crates by a
 * strip (in an aircraft, on the ground beside them). The clock starts then;
 * the guide leads to the drop, and the job is done by stopping inside it, in
 * the same vehicle for anything that rode in one. A wreck ends a job, and so
 * does giving it up (the jobs key twice). The jobs key otherwise heads for
 * the next one nearby, in turn.
 *
 * This file is the state; `app/jobs.ts` hands it the world each frame.
 */
import * as THREE from 'three';
import type { Place } from './places.ts';
import { CARGO_RANGE, createBoard, jobDay } from './jobs/board.ts';
import type { Board, BoardSource, StripSite } from './jobs/board.ts';
import { createFigures } from './jobs/figures.ts';
import type { Figures, Waiting } from './jobs/figures.ts';
import type { JobPanel, JobTag } from './jobs/panel.ts';
import { medalFor, standingOf } from './jobs/score.ts';
import { dayOfId, emptyJobs, mergeJobs, readJobs, reputationOf, writeJobs } from './jobs/store.ts';
import type { JobRecord, JobStorage } from './jobs/store.ts';
import type { Job } from './jobs/types.ts';
import type { Folk } from './folk.ts';
import type { CraftKind, Medium } from './craft/contract.ts';
import { lapText } from './rings/store.ts';
import { AVATAR_HEIGHT, SCENERY_SCALE } from './stature.ts';
import type { IconName } from './ui.ts';

export type { Job, JobKind, JobDone } from './jobs/types.ts';
export type { JobRecord } from './jobs/store.ts';
export { jobDay } from './jobs/board.ts';
export { JOBS_KEY, reputationOf } from './jobs/store.ts';
export { standingOf, STANDINGS } from './jobs/score.ts';

/** How near the player the board is read, units, and how far they move before it is read again. */
export const SCAN_REACH = 1800;
const RESCAN_AFTER = 300;
/** The most a frame spends reading the board, ms. */
const SCAN_SLICE_MS = 1.2;
/** How far the jobs key looks for one to head for, units: the scan's reach. */
const CYCLE_REACH = SCAN_REACH;
/** How near a giver must stand to be asked for their errand: talking distance (`TALK_REACH`). */
export const ASK_REACH = AVATAR_HEIGHT * 1.3;
/** How near a waiting person or a stack of crates the vehicle must stop, units along the ground. */
export const PICKUP_REACH: Readonly<Record<'taxi' | 'rescue' | 'cargo', number>> = { taxi: 9, rescue: 11, cargo: 34 };
/** How slow, units a second, counts as stopped: to collect, and to be done. */
export const STOPPED = 4;
/** Over a pickup or a drop, how low an aircraft must hover, units over the ground or the sea. */
export const HOVER_LOW = 14;
/** Seconds within which a second press of the jobs key gives the job up. */
const GIVE_UP_WINDOW = 2.5;
/** How far a tag is drawn over a pickup, units from the player: only what is near; the one headed for is always tagged, and the rest are the minimap's. */
const TAG_REACH = 130;
/** Camera distances over which a tag fades to its floor. */
const TAG_NEAR = 40;
const TAG_FAR = 130;
/** Seconds a passenger or a load waits in a vehicle the player has left before the job is off. */
export const LEFT_WAITING = 90;
/** How long what the one who asked said stays on the card, ms. */
const QUOTE_MS = 6000;
/** How near a townsperson with an errand is tagged, units. */
const ASKER_TAG_REACH = 40;
/** The most errand givers asked each frame. */
const MAX_GIVERS = 40;

/** What the player is in, as the jobs need it. */
export interface JobsRide {
  vehicle: string;
  kind: CraftKind;
  medium: Medium;
  /** How many seats it has; a job needs one beside the driver's. */
  seats: number;
  /** Whether the player holds the driver's seat. */
  driving: boolean;
}

export interface JobsFrame {
  /** The player was moved across the map this frame (`/goto`, a link): the job under way is called off. */
  teleported?: boolean;
  now: number;
  dt: number;
  /** The player's body, from the planet's centre. */
  position: THREE.Vector3;
  /** Null on foot or swimming. */
  ride: JobsRide | null;
  speed: number;
  airborne: boolean;
  /** Height over the ground or the sea under the player, units. */
  height: number;
  /** Whoever is standing near: a key and where their crown is. */
  givers: Iterable<{ key: string; crown: THREE.Vector3 }>;
  camera: THREE.Camera;
  width: number;
  height2d: number;
}

/** What `E` would do for a job this frame. */
export interface JobOffer {
  job: Job;
  label: string;
  /** Where its tag hangs, a world point. */
  at: THREE.Vector3;
  /** How far the player is from it, units along the ground. */
  gap: number;
}

export interface JobsOptions {
  source: BoardSource;
  folk: Folk;
  /** The ground a waiting figure stands on, as a radius. */
  standAt(direction: THREE.Vector3): number;
  /** The dress style for a place (`regionFor(...).id`). */
  regionOf(place: Place): string;
  /** The airstrips within `reach` units of `direction`, pushed onto `out` (`SiteIndex.planesNear`). */
  stripsNear(direction: THREE.Vector3, reach: number, out: StripSite[]): StripSite[];
  /** A seat's frame in a drawn vehicle (`FleetSeats.seatFrame`). */
  seatFrame(vehicle: string, seat: number): THREE.Object3D | null;
  panel: JobPanel | null;
  storage?: JobStorage | null;
  /** A short notice in the world. */
  announce(text: string, icon?: IconName): void;
  /** A sound cue, by name. */
  cue?(name: 'ui-open' | 'ui-close' | 'ui-click' | 'ui-confirm'): void;
  /** The day it is, from the clock: the real one unless a check says otherwise. */
  clock?(): number;
  /** A country's name by its code, for the result card. */
  countryName?(iso: string): string;
  /** Told of every job delivered: its kind, its country, the medal and the reputation it earned. */
  done?(job: Job, medal: number, points: number): void;
}

export interface ActiveJob {
  job: Job;
  /** `performance.now()`-style time it was collected. */
  started: number;
  /** The vehicle it rides in, or null for an errand on foot. */
  vehicle: string | null;
  seat: number;
}

export interface Jobs {
  readonly group: THREE.Group;
  /** The board itself, for the console: `.errand(key, town, day)`, `.fares(town, day, [])`, `.rescue(town, day)`. */
  readonly board: Board;
  readonly record: JobRecord;
  /** The job under way, or null. */
  readonly active: ActiveJob | null;
  /** The job being headed for before it is collected, or null. */
  readonly tracked: Job | null;
  /** What `E` would do now, or null. */
  readonly offer: JobOffer | null;
  /** Whether the HUD put the offer on `E` this frame, over a seat or a word (`app/frame/prompts.ts`). */
  prompted: boolean;
  /** Where the guide should lead, a point on the ground, or null: the drop under way, else the tracked job's pickup. */
  readonly target: THREE.Vector3 | null;
  /** Every job offered near the player now, nearest first. */
  readonly nearby: readonly Job[];
  frame(frame: JobsFrame): void;
  /** `E` on the offer. */
  use(): void;
  /** The jobs key: the next one to head for, or, twice, give the one under way up. */
  cycle(): void;
  /** Heads for one of `nearby` by its id (the guild's dispatcher); false when it is gone, done today, or a job is under way. */
  track(id: string): boolean;
  /** Whether a job was done today already. */
  doneToday(job: Job): boolean;
  /** How far a job's pickup is from the player, as the HUD writes it. */
  distanceTo(job: Job): string;
  /** Ends the job under way without a medal: a wreck, a sinking. */
  fail(reason: string): void;
  /** An account's record arriving: kept with this one. */
  absorb(other: JobRecord): void;
  readonly stats: { offered: number; drawn: number; scanMs: number; askers: number };
  dispose(): void;
}

/** How far from the last ask the nearest town is asked again, units. */
const TOWN_ASK_AGAIN = 60;

const tmp = new THREE.Vector3();
const projected = new THREE.Vector3();

export function createJobs(options: JobsOptions): Jobs {
  const { source, panel } = options;
  const { places, radius: R } = source;
  const board: Board = createBoard(source);
  const storage = options.storage ?? null;
  const figures: Figures = createFigures({ folk: options.folk, groundAt: options.standAt, radius: R });
  const clock = options.clock ?? (() => Date.now());
  let record = readJobs(storage);
  let active: ActiveJob | null = null;
  let tracked: Job | null = null;
  let offer: JobOffer | null = null;
  let target: THREE.Vector3 | null = null;
  let nearby: Job[] = [];
  let errands = new Map<string, Job | null>();
  let scannedAt: THREE.Vector3 | null = null;
  let scannedDay = -1;
  let giveUpUntil = -Infinity;
  let lastNow = 0;
  let lastFrame: JobsFrame | null = null;
  /** Seconds the player has been out of the vehicle the job rides in. */
  let away = 0;
  const stats = { offered: 0, drawn: 0, scanMs: 0, askers: 0 };
  const here = new THREE.Vector3();
  const offerAt = new THREE.Vector3();
  const giverCrown = new THREE.Vector3();
  /** Who near has an errand this frame, for their tags: a pool of crowns. */
  const askers: { job: Job; crown: THREE.Vector3 }[] = [];
  const askerCrowns = Array.from({ length: 8 }, () => new THREE.Vector3());
  const targetPoint = new THREE.Vector3();
  const waiting: Waiting[] = [];
  const tags: JobTag[] = [];
  const towns: number[] = [];

  const doneToday = (job: Job): boolean => record.done.has(job.id);
  const along = (a: THREE.Vector3, b: THREE.Vector3): number => a.angleTo(b) * R;
  const regions = new Map<number, string>();
  const regionAt = (index: number): string => {
    let region = regions.get(index);
    if (region === undefined) {
      region = options.regionOf(places[index]!);
      regions.set(index, region);
    }
    return region;
  };

  /** Each town's fares and rescue, and each strip's load, read once a day. */
  const townJobs = new Map<number, Job[]>();
  const stripJobs = new Map<string, Job | null>();
  /** The towns and strips in reach at the last scan, and the reads still owed. */
  let inReach: number[] = [];
  let stripsInReach: StripSite[] = [];
  let owed: (() => void)[] = [];
  let dirty = false;

  /**
   * The board near `direction` asked again: which towns and strips are in
   * reach, and a read owed for each not read today, nearest first. The reads
   * are paid for a slice a frame (`pump`).
   */
  function scan(direction: THREE.Vector3, day: number): void {
    if (day !== scannedDay) {
      townJobs.clear();
      stripJobs.clear();
    }
    inReach = board.townsNear(direction, SCAN_REACH, []);
    inReach.sort((a, b) => board.unitOf(a).angleTo(direction) - board.unitOf(b).angleTo(direction));
    owed = [];
    for (const town of inReach) {
      if (townJobs.has(town)) continue;
      owed.push(() => {
        const jobs = board.fares(town, day, []);
        const rescue = board.rescue(town, day);
        if (rescue !== null) jobs.push(rescue);
        townJobs.set(town, jobs);
      });
    }
    const from = direction.clone();
    owed.push(() => {
      stripsInReach = dedupe(options.stripsNear(from, SCAN_REACH, [])).filter((strip) => along(strip.at, from) <= SCAN_REACH);
      for (const strip of stripsInReach) {
        if (stripJobs.has(strip.id)) continue;
        owed.push(() => stripJobs.set(strip.id, board.cargo(strip, dedupe(options.stripsNear(strip.at, CARGO_RANGE[1], [])), day)));
      }
    });
    scannedAt = from;
    scannedDay = day;
    if (errands.size > 400) errands = new Map();
    dirty = true;
  }

  /** Pays the board's owed reads for up to `SCAN_SLICE_MS`, and gathers what is offered near when anything changed. */
  function pump(): void {
    const began = performance.now();
    while (owed.length > 0 && performance.now() - began < SCAN_SLICE_MS) {
      owed.shift()!();
      dirty = true;
    }
    stats.scanMs = performance.now() - began;
    if (!dirty || scannedAt === null) return;
    dirty = false;
    const jobs: Job[] = [];
    for (const town of inReach) for (const job of townJobs.get(town) ?? []) jobs.push(job);
    for (const strip of stripsInReach) {
      const job = stripJobs.get(strip.id);
      if (job !== undefined && job !== null) jobs.push(job);
    }
    const at = scannedAt;
    nearby = jobs
      .filter((job) => along(job.pickup, at) <= SCAN_REACH)
      .sort((a, b) => a.pickup.angleTo(here) - b.pickup.angleTo(here));
  }

  function dedupe(list: StripSite[]): StripSite[] {
    const seen = new Set<string>();
    return list.filter((s) => !seen.has(s.id) && (seen.add(s.id), true));
  }

  /** The errand a giver has today, asked once a day and remembered. */
  const lastTown = { at: new THREE.Vector3(), town: -2 };

  function errandOf(key: string, crown: THREE.Vector3, day: number): Job | null {
    const cached = errands.get(key);
    if (cached !== undefined && (cached === null || dayOfId(cached.id) === day)) return cached;
    tmp.copy(crown).normalize();
    const town = nearestTown(tmp);
    const job = town < 0 ? null : board.errand(key, town, day);
    errands.set(key, job);
    return job;
  }

  /** The built town whose square a point is in or nearest, or -1; asked again only past `TOWN_ASK_AGAIN` of the last ask. */
  function nearestTown(direction: THREE.Vector3): number {
    if (lastTown.town !== -2 && along(direction, lastTown.at) < TOWN_ASK_AGAIN) return lastTown.town;
    lastTown.at.copy(direction);
    lastTown.town = nearestTownOf(direction);
    return lastTown.town;
  }

  function nearestTownOf(direction: THREE.Vector3): number {
    towns.length = 0;
    board.townsNear(direction, 600, towns);
    let best = -1;
    let bestAngle = Infinity;
    for (const town of towns) {
      const angle = direction.angleTo(board.unitOf(town));
      if (angle < bestAngle) [best, bestAngle] = [town, angle];
    }
    return best;
  }


  /** Whether the ride can collect `job` here and now: a seat to spare, stopped, low enough, near enough. */
  function canCollect(job: Job, frame: JobsFrame, gap: number): boolean {
    const ride = frame.ride;
    if (job.kind === 'errand') return ride === null && gap <= ASK_REACH + 1.5;
    if (ride === null || !ride.driving || ride.seats < 2) return false;
    if (Math.abs(frame.speed) > STOPPED) return false;
    if (job.kind === 'cargo') return ride.medium === 'air' && !frame.airborne && gap <= PICKUP_REACH.cargo;
    if (gap > PICKUP_REACH[job.kind]) return false;
    if (ride.medium === 'air') return frame.height <= HOVER_LOW;
    if (job.kind === 'taxi') return ride.medium === 'road';
    // A swimmer from anything afloat; a walker from anything on land.
    return job.site === 'sea' ? ride.medium === 'water' : ride.medium === 'road';
  }

  function labelFor(job: Job): string {
    if (job.kind === 'errand') return `Errand: ${job.title}`;
    if (job.kind === 'taxi') return `Pick up: ${job.title}`;
    if (job.kind === 'cargo') return `Load: ${job.title}`;
    return job.site === 'sea' ? 'Pull them aboard' : 'Take them aboard';
  }

  function collect(job: Job, frame: JobsFrame): void {
    const ride = frame.ride;
    const vehicle = job.kind === 'errand' || ride === null ? null : ride.vehicle;
    active = { job, started: frame.now, vehicle, seat: ride === null ? -1 : ride.seats - 1 };
    away = 0;
    target = targetPoint.copy(job.drop);
    tracked = null;
    options.cue?.('ui-open');
  }

  function fail(reason: string): void {
    if (active === null) return;
    options.announce(`${active.job.title}: ${reason}`, 'close');
    options.cue?.('ui-close');
    active = null;
    away = 0;
    figures.ride(null, '', '', false);
  }

  function finish(frame: JobsFrame): void {
    const run = active!;
    const job = run.job;
    const ms = Math.max(1, Math.round(frame.now - run.started));
    const medal = medalFor(ms, job.parMs);
    const before = reputationOf(record).byCountry.get(job.iso) ?? 0;
    const fresh = emptyJobs();
    fresh.done.set(job.id, { kind: job.kind, iso: job.iso, title: job.title, ms, medal });
    record = mergeJobs(record, fresh);
    writeJobs(storage, record);
    const after = reputationOf(record).byCountry.get(job.iso) ?? 0;
    const was = standingOf(before);
    const now = standingOf(after);
    const country = countryName(job.iso);
    panel?.result({
      title: job.title,
      time: lapText(ms),
      medal,
      par: lapText(job.parMs),
      points: after - before,
      standing: `${now.name} in ${country}`,
      promoted: now.rank > was.rank ? `${now.name} in ${country}` : null,
    });
    options.cue?.('ui-confirm');
    options.done?.(job, medal, after - before);
    active = null;
    figures.ride(null, '', '', false);
    nearby = nearby.filter((j) => j.id !== job.id);
  }

  const countryName = (iso: string): string => options.countryName?.(iso) ?? iso;

  /** Inside the drop, stopped, in the same vehicle when it rode in one. */
  function arrived(frame: JobsFrame): boolean {
    const run = active!;
    if (along(here, run.job.drop) > run.job.dropRadius) return false;
    if (Math.abs(frame.speed) > STOPPED) return false;
    if (run.vehicle === null) return frame.ride === null || !frame.airborne;
    if (frame.ride?.vehicle !== run.vehicle) return false;
    if (frame.ride.medium === 'air') return run.job.kind === 'cargo' ? !frame.airborne : frame.height <= HOVER_LOW;
    return true;
  }

  /** The waiting figures near: every job offered but the one under way, and a giver's own body is the townsfolk's. */
  function waitingNear(): Waiting[] {
    waiting.length = 0;
    for (const job of nearby) {
      if (job.kind === 'errand' || doneToday(job) || active?.job.id === job.id) continue;
      if (along(job.pickup, here) > 600) continue;
      waiting.push({
        who: job.who,
        kind: job.kind === 'cargo' ? 'crates' : job.kind === 'taxi' ? 'hail' : job.site === 'sea' ? 'swimmer' : 'walker',
        at: job.pickup,
        facing: null,
        region: regionAt(job.from),
      });
    }
    waiting.sort((a, b) => a.at.angleTo(here) - b.at.angleTo(here));
    return waiting;
  }

  /** Each pickup on screen in reach, and the drop under way, as tags. */
  function tagsFor(frame: JobsFrame): JobTag[] {
    tags.length = 0;
    const camera = frame.camera;
    camera.updateMatrixWorld();
    const add = (job: Job, point: THREE.Vector3, lift: number, isTracked: boolean): void => {
      // Out of reach along the ground first: the ground's height is the dear part.
      if (!isTracked && along(point, here) > TAG_REACH + lift) return;
      tmp.copy(point).multiplyScalar(options.standAt(point) + lift);
      place(job, isTracked);
    };
    /** A tag over a world point already lifted. */
    const addAt = (job: Job, point: THREE.Vector3): void => {
      tmp.copy(point);
      place(job, false);
    };
    const place = (job: Job, isTracked: boolean): void => {
      const distance = tmp.distanceTo(frame.position);
      if (distance > TAG_REACH && !isTracked) return;
      projected.copy(tmp).project(camera);
      if (projected.z > 1 || projected.z < -1) return;
      const x = (projected.x * 0.5 + 0.5) * frame.width;
      const y = (0.5 - projected.y * 0.5) * frame.height2d;
      if (x < 20 || x > frame.width - 20 || y < 40 || y > frame.height2d - 20) return;
      const fade = 1 - 0.55 * Math.min(1, Math.max(0, (camera.position.distanceTo(tmp) - TAG_NEAR) / (TAG_FAR - TAG_NEAR)));
      tags.push({ kind: job.kind, x, y, distance: distanceText(distance), fade, tracked: isTracked });
    };
    if (active !== null) add(active.job, active.job.drop, AVATAR_HEIGHT * 2, true);
    else {
      for (const asker of askers) {
        // The one `E` is offered for wears the prompt instead.
        if (asker.job.id === offer?.job.id) continue;
        projected.copy(asker.crown).addScaledVector(tmp.copy(asker.crown).normalize(), AVATAR_HEIGHT * 0.35);
        addAt(asker.job, projected.clone());
      }
      for (const job of nearby) {
        if (tags.length >= 7) break;
        if (doneToday(job) || job.kind === 'errand') continue;
        add(job, job.pickup, AVATAR_HEIGHT * 1.6, tracked?.id === job.id);
      }
    }
    return tags;
  }

  function cardFor(frame: JobsFrame): void {
    if (panel === null) return;
    if (active !== null) {
      const left = along(here, active.job.drop);
      panel.card({
        kind: active.job.kind,
        title: active.job.title,
        detail: `To ${active.job.toName} · ${distanceText(left)}`,
        clock: lapText(frame.now - active.started),
        par: lapText(active.job.parMs),
        running: true,
        quote: frame.now - active.started < QUOTE_MS ? active.job.line : '',
      });
    } else if (tracked !== null) {
      panel.card({
        kind: tracked.kind,
        title: tracked.title,
        detail: `${howToStart(tracked)} · ${distanceText(along(here, tracked.pickup))}`,
        clock: '',
        par: lapText(tracked.parMs),
        running: false,
        quote: '',
      });
    } else panel.card(null);
  }

  function frameOf(frame: JobsFrame): void {
    lastNow = frame.now;
    lastFrame = frame;
    // A jump across the map (`/goto`, a link) is not a delivery.
    if (active !== null && frame.teleported === true) {
      options.announce(`${active.job.title}: called off, you left by other means`, 'close');
      options.cue?.('ui-close');
      active = null;
      figures.ride(null, '', '', false);
    }
    here.copy(frame.position).normalize();
    const day = jobDay(clock());
    if (scannedAt === null || day !== scannedDay || along(scannedAt, here) > RESCAN_AFTER) scan(here, day);
    pump();

    // The errands of whoever stands near, which join the board while they do.
    let asked = 0;
    let giver: { job: Job; crown: THREE.Vector3; gap: number } | null = null;
    askers.length = 0;
    for (const person of frame.givers) {
      if (asked++ >= MAX_GIVERS) break;
      const job = errandOf(person.key, person.crown, day);
      if (job === null || doneToday(job) || active?.job.id === job.id) continue;
      const gap = tmp.copy(person.crown).normalize().angleTo(here) * R;
      if (active === null && gap <= ASKER_TAG_REACH && askers.length < askerCrowns.length) {
        askers.push({ job, crown: askerCrowns[askers.length]!.copy(person.crown) });
      }
      if (giver === null || gap < giver.gap) giver = { job: { ...job, pickup: tmp.clone() }, crown: giverCrown.copy(person.crown), gap };
    }

    offer = null;
    if (active === null) {
      if (giver !== null && canCollect(giver.job, frame, giver.gap)) {
        offerAt.copy(giver.crown);
        offer = { job: giver.job, label: labelFor(giver.job), at: offerAt, gap: giver.gap };
      } else {
        let best: Job | null = null;
        let bestGap = Infinity;
        for (const job of nearby) {
          if (doneToday(job)) continue;
          const gap = along(job.pickup, here);
          if (gap < bestGap && canCollect(job, frame, gap)) [best, bestGap] = [job, gap];
        }
        if (best !== null) {
          offerAt.copy(best.pickup).multiplyScalar(options.standAt(best.pickup) + AVATAR_HEIGHT * 1.2);
          offer = { job: best, label: labelFor(best), at: offerAt, gap: bestGap };
        }
      }
    } else if (arrived(frame)) finish(frame);
    else if (active.vehicle !== null && frame.ride?.vehicle !== active.vehicle) {
      away += frame.dt;
      if (away > LEFT_WAITING) fail(active.job.kind === 'cargo' ? 'the load was left behind' : 'they gave up waiting');
      else if (away - frame.dt < LEFT_WAITING - 30 && away >= LEFT_WAITING - 30) options.announce('Your passenger is waiting. Get back in', 'seat');
    } else away = 0;

    // The one under way rides in its seat; an errand is carried.
    if (active !== null && active.vehicle !== null && active.seat > 0) {
      const seat = options.seatFrame(active.vehicle, active.seat);
      figures.ride(seat, active.job.who, regionAt(active.job.from), active.job.kind === 'cargo');
    } else figures.ride(null, '', '', false);

    if (tracked !== null && (doneToday(tracked) || dayOfId(tracked.id) !== day)) tracked = null;
    target = null;
    if (active !== null) target = targetPoint.copy(active.job.drop);
    else if (tracked !== null) target = targetPoint.copy(tracked.pickup);

    figures.update(frame.dt, waitingNear(), here);
    panel?.tags(tagsFor(frame));
    cardFor(frame);
    stats.offered = nearby.length;
    stats.drawn = figures.stats.drawn;
    stats.askers = askers.length;
  }

  return {
    group: figures.group,
    board,
    stats,
    get record() {
      return record;
    },
    get active() {
      return active;
    },
    get tracked() {
      return tracked;
    },
    get offer() {
      return offer;
    },
    get target() {
      return target;
    },
    get nearby() {
      return nearby;
    },
    prompted: false,
    frame: frameOf,
    use() {
      if (offer === null || active !== null || lastFrame === null) return;
      const job = offer.job;
      offer = null;
      collect(job, lastFrame);
    },
    track(id) {
      if (active !== null) return false;
      const job = nearby.find((candidate) => candidate.id === id);
      if (job === undefined || doneToday(job)) return false;
      tracked = job;
      options.cue?.('ui-click');
      return true;
    },
    doneToday: (job) => doneToday(job),
    distanceTo: (job) => distanceText(along(job.pickup, here)),
    cycle() {
      if (active !== null) {
        if (lastNow < giveUpUntil) {
          options.announce(`Gave up: ${active.job.title}`, 'close');
          options.cue?.('ui-close');
          active = null;
          giveUpUntil = -Infinity;
          return;
        }
        giveUpUntil = lastNow + GIVE_UP_WINDOW * 1000;
        options.announce(`${active.job.title} · press again to give it up`, 'close');
        return;
      }
      const open = nearby
        .filter((job) => !doneToday(job) && along(job.pickup, here) <= CYCLE_REACH)
        .sort((a, b) => along(a.pickup, here) - along(b.pickup, here))
        .slice(0, 6);
      if (open.length === 0) {
        tracked = null;
        options.announce('No jobs nearby. Townsfolk in towns sometimes have errands', 'hand');
        return;
      }
      const at = tracked === null ? -1 : open.findIndex((job) => job.id === tracked!.id);
      if (at === open.length - 1) {
        tracked = null;
        options.announce('Not heading for a job', 'close');
        options.cue?.('ui-close');
        return;
      }
      tracked = open[at + 1]!;
      options.announce(`${at + 2} of ${open.length}: ${tracked.title} · ${distanceText(along(tracked.pickup, here))}`, 'pin');
      options.cue?.('ui-click');
    },
    fail,
    absorb(other) {
      record = mergeJobs(record, other);
      writeJobs(storage, record);
    },
    dispose() {
      panel?.dispose();
      figures.dispose();
    },
  };
}

/** How a job is started, for the card. */
function howToStart(job: Job): string {
  if (job.kind === 'taxi') return 'Stop beside them in a car';
  if (job.kind === 'cargo') return 'Land beside the crates';
  return job.site === 'sea' ? 'By boat, or hover low' : 'By helicopter, or drive up';
}

/** Units as the HUD says them, at the scale of the streets (as the rings do): metres to a kilometre, then kilometres. */
export function distanceText(units: number): string {
  const metres = units / SCENERY_SCALE;
  return metres < 1000 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}
