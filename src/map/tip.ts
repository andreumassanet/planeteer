import * as THREE from 'three';
import { createFlagCanvas } from '../flags.ts';
import { h, km, people } from '../ui.ts';
import { COURSE_NAME } from '../course-marks.ts';
import { lapText } from '../rings/store.ts';
import { unitAt } from '../sphere.ts';
import { PICK_RANGE } from './constants.ts';
import { courseSitesOf } from './courses.ts';
import type { MapSheet } from './sheet.ts';
import type { Hit } from './types.ts';

const tipPoint = new THREE.Vector3();
const routeA = new THREE.Vector3();

/** The mark under a point in window pixels: the marker, then players, then pins, then towns. */
export function pickAt(s: MapSheet, clientX: number, clientY: number): Hit | null {
  const { hits, peerHits } = s;
  const x = clientX - s.canvasX;
  const y = clientY - s.canvasY;
  let best: Hit | null = null;
  let bestScore = Infinity;
  for (const hit of hits.length === 0 ? peerHits : peerHits.length === 0 ? hits : [...hits, ...peerHits]) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    // The marker, then players, then pins, then towns: a town under a pin is the pin.
    const bias = hit.kind === 'marker' ? 0 : hit.kind === 'peer' ? 2 : hit.kind === 'pin' || hit.kind === 'course' ? 4 : 8;
    if (d > PICK_RANGE) continue;
    if (d + bias < bestScore) {
      bestScore = d + bias;
      best = hit;
    }
  }
  return best;
}

export function sameHit(a: Hit | null, b: Hit | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'marker' && b.kind === 'marker') return true;
  if (a.kind === 'pin' && b.kind === 'pin') return a.index === b.index;
  if (a.kind === 'course' && b.kind === 'course') return a.index === b.index;
  if (a.kind === 'peer' && b.kind === 'peer') return a.id === b.id;
  if (a.kind === 'town' && b.kind === 'town') return a.town === b.town;
  return false;
}

export function tipFlagFor(s: MapSheet, iso: string): void {
  const { tipFlag } = s;
  if (iso === s.tipIso) return;
  s.tipIso = iso;
  const flag = createFlagCanvas(iso, 34, 23);
  flag.className = 'ui-flag';
  tipFlag.replaceChildren(flag);
}

export function renderTip(s: MapSheet): void {
  const { tip } = s;
  if (s.hover === null) {
    tip.classList.remove('on');
    s.tipFor = null;
    return;
  }
  if (!sameHit(s.hover, s.tipFor)) fillTip(s, s.hover);
  tip.style.left = `${s.canvasLeft + s.hover.x}px`;
  tip.style.top = `${s.canvasTop + s.hover.y - (s.hover.kind === 'pin' || s.hover.kind === 'marker' ? 4 : s.hover.kind === 'course' ? 12 : 8)}px`;
  tip.classList.add('on');
}

export function fillTip(s: MapSheet, hit: Hit): void {
  const { options, monuments, marker, RADIUS_KM, countryName, tipFlag, tipName, tipSub, me } = s;
  s.tipFor = hit;
  unitAt(me.lat, me.lon, routeA);
  if (hit.kind === 'marker') {
    const mark = marker();
    if (mark === null) return;
    unitAt(mark.lat, mark.lon, tipPoint);
    tipName.textContent = mark.name ?? 'Your marker';
    tipSub.replaceChildren(h('b', { text: km(routeA.angleTo(tipPoint) * RADIUS_KM) }), ' · click to remove');
    tipFlag.replaceChildren();
    s.tipIso = '';
  } else if (hit.kind === 'peer') {
    tipName.textContent = hit.name;
    tipSub.replaceChildren(h('b', { text: km(hit.distance) }), options.onJoin ? ' · click to join' : '');
    tipFlag.replaceChildren();
    s.tipIso = '';
  } else if (hit.kind === 'pin') {
    const monument = monuments[hit.index]!;
    unitAt(monument.lat, monument.lon, tipPoint);
    const distance = routeA.angleTo(tipPoint) * RADIUS_KM;
    tipName.textContent = monument.name;
    tipSub.replaceChildren(
      `${countryName.get(monument.iso) ?? monument.iso} · `,
      h('b', { text: km(distance) }),
    );
    tipFlagFor(s, monument.iso);
  } else if (hit.kind === 'course') {
    const site = courseSitesOf(s)[hit.index];
    if (site === undefined) return;
    const best = options.courseBest?.(site.key) ?? null;
    tipName.textContent = site.title;
    tipSub.replaceChildren(
      `${COURSE_NAME[site.kind]} · ${best === null ? 'not run yet' : `best ${lapText(best.ms)}`} · `,
      h('b', { text: km(routeA.angleTo(tipPoint.set(site.at.x, site.at.y, site.at.z).normalize()) * RADIUS_KM) }),
    );
    const iso = s.allPlaces[site.place]?.iso;
    if (iso === undefined) {
      tipFlag.replaceChildren();
      s.tipIso = '';
    } else tipFlagFor(s, iso);
  } else {
    const place = hit.town.place;
    unitAt(place.lat, place.lon, tipPoint);
    const distance = routeA.angleTo(tipPoint) * RADIUS_KM;
    tipName.textContent = place.name;
    tipSub.replaceChildren(
      `${countryName.get(place.iso) ?? place.iso} · ${people(place.pop)} · `,
      h('b', { text: km(distance) }),
    );
    tipFlagFor(s, place.iso);
  }
}
