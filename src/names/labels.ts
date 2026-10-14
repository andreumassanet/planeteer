import * as THREE from 'three';
import type { LandRing, World } from '../geo.ts';
import { LAND_HEIGHT } from '../geo.ts';
import { onSphere } from '../globe.ts';
import { FONT_MAX, FONT_MIN, FONT_PER_ROOT } from './constants.ts';

export interface Label {
  text: string;
  /** The bake's label point, as a unit vector. */
  point: THREE.Vector3;
  /** Type size in pixels, from the country's area. */
  size: number;
  /** The country as a disc of the same area: its diameter, in world units. */
  span: number;
  /** 1-based country index, so the one under the player can be found. */
  id: number;
  /** How far from the centre it is drawn: sea level and the ground under it. */
  radius: number;
}

/** One label placed this frame, and what it is going to cost in pixels. */
export interface Placed {
  label: Label;
  x: number;
  y: number;
  size: number;
  opacity: number;
  width: number;
}

/** One label per country that has land, sized by the square root of its area. */
export function buildLabels(
  world: World,
  radius: number,
  unitsPerDegree: number,
  heightAt: ((unit: THREE.Vector3) => number) | undefined,
): Label[] {
  // Area per country, summed over its rings in square degrees: the same
  // shoelace `geo.ts` bakes onto every ring.
  const area = new Map<number, number>();
  for (const ring of world.rings as LandRing[]) {
    if (ring.water || ring.country <= 0) continue;
    area.set(ring.country, (area.get(ring.country) ?? 0) + ring.area);
  }

  const labels: Label[] = [];
  world.countries.forEach((country, index) => {
    const size = area.get(index + 1);
    if (size === undefined) return;
    const unit = onSphere(country.lon, country.lat, new THREE.Vector3());
    labels.push({
      text: country.name.toUpperCase(),
      point: unit,
      size: Math.min(FONT_MAX, FONT_MIN + FONT_PER_ROOT * Math.sqrt(size)),
      span: 2 * Math.sqrt(size / Math.PI) * unitsPerDegree,
      id: index + 1,
      // The shelf's own height, not the relief: a label point is a centroid
      // and 20 units on a 16,000-unit sphere moves it by a tenth of a pixel.
      radius: radius + (heightAt?.(unit) ?? LAND_HEIGHT),
    });
  });
  return labels;
}
