import * as THREE from 'three';
import { isShown, prominenceVersion, radiusOf, rankOf, type Place } from '../places.ts';
import { toUnit } from '../sphere.ts';
import {
  EDGE_BOTTOM, EDGE_TOP, EDGE_X, LIMB_FADE, MAX_TOWNS, MIN_TOWN_PIXELS, TOWN_FONT_MAX, TOWN_FONT_MIN,
  REACH_FADE, SIGHT_EASE, SIGHT_EVERY_MS, SIGHT_REACH, SIGHT_SAMPLES, SIGHT_TESTS, TOWN_ALOFT_HIGH, TOWN_ALOFT_LOW, TOWN_HOVER, TOWN_HOVER_MIN, TOWN_NEAR_IN, TOWN_NEAR_OUT,
} from './constants.ts';

/** One town name placed this frame. */
export interface PlacedTown {
  place: Place;
  /** The town's row in the gazetteer, so a pool slot keeps its text while it stays. */
  row: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  /** How far, in world units, from the eye: under the name for the big ones. */
  range: number;
  capital: boolean;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Chooses which built towns are named this frame. A town is a candidate on the
 * near side of the horizon, in front of the lens and inside the viewport, when
 * its square is at least `MIN_TOWN_PIXELS` across on the screen, so a city is
 * named from further off than a village. The town the eye is inside is not
 * named (the badge says it) and fades in on the way out of it, or on the way
 * up over its rooftops. Biggest first,
 * nearest the middle among equals; a name that lands on a kept one is dropped,
 * and so is one the ground stands between the eye and (a hill in front of its
 * town), tested along the line of sight against the relief.
 */
export function createTownPlacer(
  all: readonly Place[],
  radius: number,
  heightAt: (unit: THREE.Vector3) => number,
): {
  kept: PlacedTown[];
  place(fade: number, camera: THREE.PerspectiveCamera, width: number, height: number, haze: number): void;
} {
  // The built rows, largest first, refreshed when the prominence knob moves.
  let rows: number[] = [];
  let unit = new Float64Array(0);
  let reach = new Float64Array(0);
  let rowsFor = -1;
  // How high each name floats over the sea, asked of the ground once, on first sight.
  const lift = new Float64Array(all.length).fill(Number.NaN);
  const refresh = (): void => {
    if (rowsFor === prominenceVersion()) return;
    rowsFor = prominenceVersion();
    rows = [];
    for (let i = 0; i < all.length; i++) if (isShown(all[i]!)) rows.push(i);
    rows.sort((a, b) => rankOf(all[b]!) - rankOf(all[a]!));
    unit = new Float64Array(rows.length * 3);
    reach = new Float64Array(rows.length);
    rows.forEach((row, k) => {
      toUnit(all[row]!.lat, all[row]!.lon, unit, k * 3);
      reach[k] = radiusOf(all[row]!);
    });
  };

  const viewProjection = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const ground = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const eye = new THREE.Vector3();
  // Whether the ground hides each name, asked of the relief a few names a frame
  // and eased, so a name behind a hill goes and comes back without a blink.
  const sight = new Map<number, { at: number; seen: boolean; alpha: number }>();
  let last = 0;
  const hidden = (unit: THREE.Vector3, target: THREE.Vector3): boolean => {
    for (let i = 1; i < SIGHT_SAMPLES; i++) {
      const t = (i / SIGHT_SAMPLES) * SIGHT_REACH;
      unit.copy(eye).lerp(target, t);
      const length = unit.length();
      unit.divideScalar(length);
      if (length < radius + heightAt(unit)) return true;
    }
    return false;
  };
  const probe = new THREE.Vector3();
  const pool: PlacedTown[] = [];
  const found: PlacedTown[] = [];
  const kept: PlacedTown[] = [];
  const blank = all[0];

  return {
    kept,
    place(fade, camera, width, height, haze) {
      kept.length = 0;
      if (fade <= 0 || blank === undefined) return;
      refresh();
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let tests = SIGHT_TESTS;
      const halfW = width / 2;
      const halfH = height / 2;
      camera.getWorldPosition(eye);
      camera.getWorldDirection(forward);
      const eyeLength = Math.max(eye.length(), 1);
      const perUnit = camera.projectionMatrix.elements[5]! * halfH;
      const cosHorizon = radius / eyeLength;
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      // Over the rooftops the town under you is a place on a map again, and named.
      const aloft = smooth(TOWN_ALOFT_LOW, TOWN_ALOFT_HIGH, eyeLength - radius);
      const ex = eye.x / eyeLength;
      const ey = eye.y / eyeLength;
      const ez = eye.z / eyeLength;

      found.length = 0;
      for (let k = 0; k < rows.length; k++) {
        const ux = unit[k * 3]!;
        const uy = unit[k * 3 + 1]!;
        const uz = unit[k * 3 + 2]!;
        const cos = ux * ex + uy * ey + uz * ez;
        const over = cos - cosHorizon;
        if (over <= 0) continue;
        const size = reach[k]!;
        // Along the ground from under the eye: inside the square the badge names it.
        const along = Math.acos(Math.min(1, cos)) * radius;
        const near = Math.max(aloft, smooth(size * TOWN_NEAR_IN, size * TOWN_NEAR_OUT, along));
        if (near <= 0.01) continue;
        const row = rows[k]!;
        if (Number.isNaN(lift[row]!)) {
          ground.set(ux, uy, uz);
          lift[row] = heightAt(ground) + Math.max(TOWN_HOVER_MIN, size * TOWN_HOVER);
        }
        point.set(ux, uy, uz).multiplyScalar(radius + lift[row]!);
        const ax = point.x - eye.x;
        const ay = point.y - eye.y;
        const az = point.z - eye.z;
        if (ax * forward.x + ay * forward.y + az * forward.z <= 0) continue;
        const range = Math.sqrt(ax * ax + ay * ay + az * az);
        // Nothing past the haze is named: a town nobody can see is not on the screen to name.
        if (range > haze) continue;
        const pixels = (2 * size * perUnit) / range;
        if (pixels < MIN_TOWN_PIXELS) continue;
        let seen = sight.get(row);
        if (seen === undefined) sight.set(row, (seen = { at: -Infinity, seen: false, alpha: 0 }));
        if (now - seen.at > SIGHT_EVERY_MS && tests > 0) {
          tests--;
          seen.at = now;
          ground.copy(point);
          seen.seen = !hidden(probe, ground);
        }
        seen.alpha = Math.max(0, Math.min(1, seen.alpha + (seen.seen ? dt : -dt) * SIGHT_EASE));
        if (seen.alpha <= 0.01) continue;
        point.applyMatrix4(viewProjection);
        const x = halfW + point.x * halfW;
        const y = halfH - point.y * halfH;
        if (x < EDGE_X || x > width - EDGE_X || y < EDGE_TOP || y > height - EDGE_BOTTOM) continue;
        const slot = pool[found.length] ?? (pool[found.length] = { place: blank, row: 0, x: 0, y: 0, size: 0, opacity: 0, range: 0, capital: false });
        const place = all[row]!;
        slot.place = place;
        slot.row = row;
        slot.x = x;
        slot.y = y;
        slot.range = range;
        slot.capital = place.capital === true;
        // The type grows with the square on the screen, between a village's and a capital's.
        slot.size = TOWN_FONT_MIN + (TOWN_FONT_MAX - TOWN_FONT_MIN) * smooth(MIN_TOWN_PIXELS, MIN_TOWN_PIXELS * 14, pixels);
        // Faint where it is barely worth a name, at the limb, and on the way out of a town.
        slot.opacity = fade * near * (1 - smooth(haze * REACH_FADE, haze, range)) * seen.alpha * Math.min(1, over / LIMB_FADE) * smooth(MIN_TOWN_PIXELS, MIN_TOWN_PIXELS * 1.3, pixels);
        found.push(slot);
      }

      // `rows` is largest first, so `found` is too: a capital keeps its name over the suburb beside it.
      for (const candidate of found) {
        if (kept.length >= MAX_TOWNS) break;
        const half = candidate.place.name.length * candidate.size * 0.34 + 4;
        let clear = true;
        for (const other of kept) {
          const otherHalf = other.place.name.length * other.size * 0.34 + 4;
          if (Math.abs(candidate.x - other.x) < half + otherHalf && Math.abs(candidate.y - other.y) < (candidate.size + other.size) * 1.1) {
            clear = false;
            break;
          }
        }
        if (clear) kept.push(candidate);
      }
    },
  };
}
