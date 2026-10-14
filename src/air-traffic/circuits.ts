import * as THREE from 'three';
import { stripPoint } from '../fleet.ts';
import type { FleetSite } from '../fleet.ts';
import type { AirSource, Flight } from './flight.ts';
import { S_CIRCUIT, codeOf, hashUnit, hullAt, orient, smooth } from './paths.ts';

/**
 * Light planes flying circuits off the airstrips: a rectangle with round
 * ends, flown by `CIRCUIT_SHARE` of the strips. The plane lands along the
 * strip the way the parked plane faces, touching down at `TOUCHDOWN` units,
 * lifts off at `LIFT_OFF`, climbs at `CLIMB_GRADE`, turns through a half
 * circle of `CIRCUIT_TURN` onto the downwind at `PATTERN_HEIGHT`, and comes
 * back down a final at `GLIDE_GRADE`. 1:6 clears the parked plane and the
 * first trees past the strip's keepout.
 */
const CIRCUIT_SHARE = 0.6;
export const CIRCUIT_SPEED = 38;
const TOUCHDOWN = 85;
const LIFT_OFF = 150;
const UPWIND_END = 700;
const FINAL_START = -520;
const CIRCUIT_TURN = 200;
const PATTERN_HEIGHT = 110;
const CLIMB_GRADE = 0.16;
const GLIDE_GRADE = 0.17;
/** Clearance kept over the ground off the strip: the circuit's own height, up to this. */
const CIRCUIT_CLEAR = 40;
/**
 * How far the land under a circuit may rise above the pattern before it is
 * flown on the other side, or not at all; sampled at `CIRCUIT_PROBES` points.
 */
const CIRCUIT_RISE = 25;
const CIRCUIT_PROBES = 48;
/** How far the wheels ride over the relief on the strip: the strip's own lift. */
const WHEEL_LIFT = 0.3;

const upwind = UPWIND_END - FINAL_START;
const turnLength = Math.PI * CIRCUIT_TURN;
const circuitLength = 2 * upwind + 2 * turnLength;

interface CircuitPoint {
  along: number;
  across: number;
  height: number;
}

/**
 * The point `u` units round a circuit, as (along, across, height) in the
 * strip's frame, starting where the final turn ends; `hand` +1 turns right,
 * -1 left.
 */
function circuitPoint(u: number, hand: number, out: CircuitPoint): void {
  u = ((u % circuitLength) + circuitLength) % circuitLength;
  if (u < upwind) {
    const along = FINAL_START + u;
    out.along = along;
    out.across = 0;
    out.height =
      along < TOUCHDOWN ? GLIDE_GRADE * (TOUCHDOWN - along) : along < LIFT_OFF ? 0 : CLIMB_GRADE * (along - LIFT_OFF);
    return;
  }
  u -= upwind;
  const top = CLIMB_GRADE * (UPWIND_END - LIFT_OFF);
  if (u < turnLength) {
    const beta = u / CIRCUIT_TURN;
    out.along = UPWIND_END + CIRCUIT_TURN * Math.sin(beta);
    out.across = hand * CIRCUIT_TURN * (1 - Math.cos(beta));
    out.height = top + (PATTERN_HEIGHT - top) * (beta / Math.PI);
    return;
  }
  u -= turnLength;
  if (u < upwind) {
    out.along = UPWIND_END - u;
    out.across = hand * 2 * CIRCUIT_TURN;
    out.height = PATTERN_HEIGHT;
    return;
  }
  u -= upwind;
  const beta = u / CIRCUIT_TURN;
  const final = GLIDE_GRADE * (TOUCHDOWN - FINAL_START);
  out.along = FINAL_START - CIRCUIT_TURN * Math.sin(beta);
  out.across = hand * CIRCUIT_TURN * (1 + Math.cos(beta));
  out.height = PATTERN_HEIGHT + (final - PATTERN_HEIGHT) * (beta / Math.PI);
}

const circuitScratch: CircuitPoint = { along: 0, across: 0, height: 0 };
const middle = new THREE.Vector3();
const under = new THREE.Vector3();

/** A strip's circuit, or null where it has none. */
export function circuitFlight(source: AirSource, site: FleetSite): Flight | null {
  const code = codeOf(site.id);
  if (hashUnit(code, S_CIRCUIT, 0) >= CIRCUIT_SHARE) return null;
  const stand = { at: site.at.clone(), forward: site.forward.clone() };
  // The strip's ground at touchdown: what the circuit's heights are measured from.
  const strip = source.ground(stripPoint(stand, TOUCHDOWN, 0, middle));
  // Fly the hashed side if the land under it allows a level pattern, else the
  // other; a strip with hills on both sides flies none.
  const rises = (hand: number): number => {
    let worst = 0;
    for (let k = 0; k < CIRCUIT_PROBES; k++) {
      circuitPoint((k / CIRCUIT_PROBES) * circuitLength, hand, circuitScratch);
      if (circuitScratch.height < 1) continue;
      stripPoint(stand, circuitScratch.along, circuitScratch.across, under);
      worst = Math.max(worst, hullAt(under) + Math.min(circuitScratch.height, CIRCUIT_CLEAR) - (strip + circuitScratch.height));
    }
    return worst;
  };
  const preferred = hashUnit(code, S_CIRCUIT, 1) < 0.5 ? -1 : 1;
  const hand = rises(preferred) <= CIRCUIT_RISE ? preferred : rises(-preferred) <= CIRCUIT_RISE ? -preferred : 0;
  if (hand === 0) return null;
  const phase = hashUnit(code, S_CIRCUIT, 2) * circuitLength;
  const at = (seconds: number, out: THREE.Vector3): THREE.Vector3 => {
    circuitPoint(seconds * CIRCUIT_SPEED + phase, hand, circuitScratch);
    const { along, across: side, height } = circuitScratch;
    stripPoint(stand, along, side, under);
    const land = source.ground(under) + WHEEL_LIFT;
    // Rolling on the strip; aloft, the higher of the strip's height and a
    // clearance over the hull, blended in over the first units of climb.
    const flying = Math.max(strip + height, hullAt(under) + Math.min(height, CIRCUIT_CLEAR));
    const r = land + (Math.max(land, flying) - land) * smooth(0, 8, height);
    return out.copy(under).multiplyScalar(r);
  };
  return {
    id: `circuit:${site.id}`,
    kind: 'plane',
    variant: Math.floor(hashUnit(code, S_CIRCUIT, 3) * 6),
    from: -Infinity,
    to: Infinity,
    pose(seconds, out) {
      orient(at, seconds, out);
      circuitPoint(seconds * CIRCUIT_SPEED + phase, hand, circuitScratch);
      out.grounded = circuitScratch.height < 0.5;
      out.shown = 1;
      return out;
    },
  };
}
