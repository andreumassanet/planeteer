import * as THREE from 'three';
import { isShown, radiusOf, rankOf } from '../places.ts';
import { courseOf, coursePoint, emptyCourse } from '../roads.ts';
import { latLonOf } from '../sphere.ts';
import { uOf, vOf } from '../map-tiles.ts';
import type { SheetRing } from '../map-outline.ts';
import { ROAD_SAMPLES } from './constants.ts';
import type { MapSheet } from './sheet.ts';
import type { SheetRoad } from './types.ts';

export function prepareRings(s: MapSheet): SheetRing[] {
  const { world, dry, mapTiles, countryLabels } = s;
  if (s.rings !== null) return s.rings;
  const source = world.rings ?? [];
  s.rings = mapTiles.painter.rings();
  // A country's name sits on the label point the bake computed, sized by
  // its biggest ring; a country of many islands is named by its largest.
  for (const [c, country] of world.countries.entries()) {
    let span = 0;
    let uLo = Infinity;
    let uHi = -Infinity;
    let vLo = Infinity;
    let vHi = -Infinity;
    for (const [r, ring] of source.entries()) {
      if (ring.country !== c + 1) continue;
      const sheetRing = s.rings[r]!;
      span = Math.max(span, Math.min(sheetRing.u1 - sheetRing.u0, (sheetRing.v1 - sheetRing.v0) * 1.6));
      uLo = Math.min(uLo, sheetRing.u0);
      uHi = Math.max(uHi, sheetRing.u1);
      vLo = Math.min(vLo, sheetRing.v0);
      vHi = Math.max(vHi, sheetRing.v1);
    }
    // A walked world's nation is cut into rings at the quarter meridians
    // and the equator, so its biggest ring is a piece of it: sized whole,
    // unless the pieces lie either side of the antimeridian.
    if (dry && uHi - uLo < 0.5) span = Math.max(span, Math.min(uHi - uLo, (vHi - vLo) * 1.6));
    countryLabels.push({ text: country.name.toUpperCase(), u: uOf(country.lon), v: vOf(country.lat), span });
  }
  countryLabels.sort((a, b) => b.span - a.span);
  return s.rings;
}

/** The built towns, biggest first. Rebuilt on each open: `isShown` has a live knob. */
export function prepareTowns(s: MapSheet): void {
  const { allPlaces, towns } = s;
  towns.length = 0;
  for (const [index, place] of allPlaces.entries()) {
    if (!isShown(place)) continue;
    towns.push({ place, index, u: uOf(place.lon), v: vOf(place.lat), rank: rankOf(place), radius: radiusOf(place) });
  }
  towns.sort((a, b) => b.rank - a.rank);
}

export function prepareRoads(s: MapSheet): SheetRoad[] {
  const { options, allPlaces } = s;
  if (s.sheetRoads !== null) return s.sheetRoads;
  s.sheetRoads = (options.roads ?? []).flatMap((road) => {
    const a = allPlaces[road.a];
    const b = allPlaces[road.b];
    if (a === undefined || b === undefined) return [];
    const ua = uOf(a.lon);
    let ub = uOf(b.lon);
    if (ub - ua > 0.5) ub -= 1;
    else if (ua - ub > 0.5) ub += 1;
    const va = vOf(a.lat);
    const vb = vOf(b.lat);
    // The bow takes a road off the straight line by a fraction of its length;
    // a quarter of the length round both ends is more than any bake wrote.
    const pad = 0.25 * Math.hypot(ub - ua, vb - va);
    return [{
      cls: road.cls,
      road,
      points: null,
      u0: Math.min(ua, ub) - pad,
      u1: Math.max(ua, ub) + pad,
      v0: Math.min(va, vb) - pad,
      v1: Math.max(va, vb) + pad,
      u: null,
      v: null,
    }];
  });
  // Another world's, laid already: the box is the line's own.
  for (const line of options.courses?.() ?? []) {
    if (line.points.length < 2) continue;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    let last = uOf(line.points[0]![1]);
    for (const [lat, lon] of line.points) {
      let u = uOf(lon);
      u -= Math.round(u - last);
      last = u;
      const v = vOf(lat);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    s.sheetRoads.push({ cls: line.cls, road: null, points: line.points, u0, u1, v0, v1, u: null, v: null });
  }
  return s.sheetRoads;
}

const course = emptyCourse();
const onCourse = new THREE.Vector3();
const courseLatLon = { lat: 0, lon: 0 };

export function traceRoad(s: MapSheet, road: SheetRoad): void {
  const { allPlaces } = s;
  if (road.points !== null) {
    const n = road.points.length;
    const u = new Float32Array(n);
    const v = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const [lat, lon] = road.points[k]!;
      let uk = uOf(lon);
      if (k > 0) uk -= Math.round(uk - u[k - 1]!);
      u[k] = uk;
      v[k] = vOf(lat);
    }
    road.u = u;
    road.v = v;
    return;
  }
  courseOf(road.road!, allPlaces, course);
  const u = new Float32Array(ROAD_SAMPLES);
  const v = new Float32Array(ROAD_SAMPLES);
  for (let k = 0; k < ROAD_SAMPLES; k++) {
    coursePoint(course, k / (ROAD_SAMPLES - 1), onCourse);
    latLonOf(onCourse, courseLatLon);
    let uk = uOf(courseLatLon.lon);
    if (k > 0) {
      const du = uk - u[k - 1]!;
      uk -= Math.round(du);
    }
    u[k] = uk;
    v[k] = vOf(courseLatLon.lat);
  }
  road.u = u;
  road.v = v;
}
