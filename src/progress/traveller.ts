/**
 * What a traveller does, read off their state each frame and told to the
 * progression as events: how far they moved and how, a jump, a vehicle taken,
 * a canopy opening, the map opened, a bench sat on, a new town, the deepest
 * dive, the highest flight, the fastest ride and a rocket away. Every world's
 * game hands it the same small reading (`TravellerReading`), so the stream is
 * one on Earth and off it; the things with a name (a conversation, a ring, a
 * stamp) are emitted where they happen.
 *
 * Distance is real metres, sent once a second in one event a mode, so the
 * stream stays small. Pure: no page, no Three.
 */
import { dayOf } from './daily.ts';
import type { MoveMode, ProgressEvent } from './events.ts';

/** How often the metres are sent, s. */
const SEND_EVERY = 1;
/** A step longer than this in one frame is a teleport, not travel, units. */
const TELEPORT = 600;
/** A dive, a climb or a speed is told when it beats the session's best by this much (metres, km/h). */
const DEPTH_STEP = 1;
const ALTITUDE_STEP = 25;
const SPEED_STEP = 5;
/** More towns than this arriving at once is an account's book being merged, not towns walked into. */
const TOWNS_AT_ONCE = 3;

/** The traveller this frame, as the progression reads them. Lengths are world units. */
export interface TravellerReading {
  /** Where they are, any frame of reference that does not jump. */
  position: { x: number; y: number; z: number };
  /** How they are moving, or null when it is not travel (a fall under a canopy, a seat with no vehicle). */
  mode: MoveMode | null;
  /** Off the ground, in any way. */
  airborne: boolean;
  /** On foot, going up, under no canopy: off the ground like that is a jump. */
  leaping: boolean;
  /** The seat taken, as `vehicle:seat`, and the vehicle's kind; null on foot. */
  ride: string | null;
  rideKind: string;
  canopy: boolean;
  mapOpen: boolean;
  sitting: boolean;
  /** The towns walked into, in the order the book took them. */
  towns: readonly (string | number)[];
  /** Under the surface, units. */
  depth: number;
  /** Over the ground in an aircraft, units; null out of one. */
  altitude: number | null;
  /** The vehicle's speed, units a second; null out of one. */
  speed: number | null;
  /** Whether a rocket the traveller is in is flying. */
  rocketFlying: boolean;
}

/** Returns `read(dt, reading)`, to be called every frame with the traveller as they stand; `unitsPerMetre` is `SCENERY_SCALE`. */
export function createTravellerReader(emit: (event: ProgressEvent) => void, unitsPerMetre: number): (dt: number, reading: TravellerReading) => void {
  const last = { x: 0, y: 0, z: 0 };
  let started = false;
  const metres = new Map<MoveMode, number>();
  let sendIn = SEND_EVERY;
  let wasAirborne = false;
  let rideKey: string | null = null;
  let canopy = false;
  let mapOpen = false;
  let sitting = false;
  let towns = -1;
  let rocketFlying = false;
  let deepest = 0;
  let highest = 0;
  let fastest = 0;
  let bestsDay = -1;

  return (dt, r) => {
    // How far, and how.
    const step = started ? Math.hypot(r.position.x - last.x, r.position.y - last.y, r.position.z - last.z) : 0;
    started = true;
    last.x = r.position.x;
    last.y = r.position.y;
    last.z = r.position.z;
    if (r.mode !== null && step > 0 && step < TELEPORT) metres.set(r.mode, (metres.get(r.mode) ?? 0) + step / unitsPerMetre);
    sendIn -= dt;
    if (sendIn <= 0) {
      sendIn = SEND_EVERY;
      for (const [moved, amount] of metres) if (amount > 0.5) emit({ t: 'move', mode: moved, metres: amount });
      metres.clear();
    }

    // A jump: off the ground on foot, going up.
    if (r.airborne && !wasAirborne && r.leaping) emit({ t: 'jump' });
    wasAirborne = r.airborne;

    // A vehicle taken, in any seat.
    if (r.ride !== null && r.ride !== rideKey) emit({ t: 'board', kind: r.rideKind });
    rideKey = r.ride;

    if (r.canopy && !canopy) emit({ t: 'parachute' });
    canopy = r.canopy;
    if (r.mapOpen && !mapOpen) emit({ t: 'map' });
    mapOpen = r.mapOpen;
    if (r.sitting && !sitting) emit({ t: 'sit' });
    sitting = r.sitting;

    // New towns walked into, counted off the book.
    const count = r.towns.length;
    if (towns >= 0 && count > towns && count - towns <= TOWNS_AT_ONCE) {
      for (const town of r.towns.slice(towns)) emit({ t: 'town', key: String(town) });
    }
    towns = count;

    // The deepest dive, the highest flight and the fastest ride of the day, as they are beaten: a new
    // UTC day starts them again, so its commissions hear of them.
    const day = dayOf(Date.now());
    if (day !== bestsDay) {
      bestsDay = day;
      deepest = 0;
      highest = 0;
      fastest = 0;
    }
    const depth = r.depth / unitsPerMetre;
    if (depth > deepest + DEPTH_STEP) {
      deepest = depth;
      emit({ t: 'depth', metres: depth });
    }
    if (r.altitude !== null) {
      const altitude = r.altitude / unitsPerMetre;
      if (altitude > highest + ALTITUDE_STEP) {
        highest = altitude;
        emit({ t: 'altitude', metres: altitude });
      }
    }
    if (r.speed !== null) {
      const kmh = (Math.abs(r.speed) / unitsPerMetre) * 3.6;
      if (kmh > fastest + SPEED_STEP) {
        fastest = kmh;
        emit({ t: 'speed', kmh });
      }
    }

    if (r.rocketFlying && !rocketFlying) emit({ t: 'rocket' });
    rocketFlying = r.rocketFlying;
  };
}
