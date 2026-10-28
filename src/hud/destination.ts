/** The marker's panel and waypoint, and a landmark's card. */
import { createFlagCanvas } from '../flags.ts';
import { markFlag } from './badge.ts';
import { ARRIVED_HOLD, FOUND_HOLD, LABEL_MARGIN, NOTE_HOLD, R2D } from './constants.ts';
import type { HudCtx } from './ctx.ts';
import { km, yearText } from './format.ts';
import type { DestinationEntry, LandmarkArrival } from './types.ts';

export function setDestination(ctx: HudCtx, entry: DestinationEntry | null): void {
  const { countryNames, destination, destinationName, destinationPlace, destinationRange, emptyLabel, waypoint, waypointLabel } = ctx;
  ctx.arrivedFor = 0;
  destination.classList.remove('arrived');
  if (entry === null) {
    destination.classList.remove('on');
    waypoint.classList.remove('on');
    ctx.shownKm = NaN;
    return;
  }
  destinationName.textContent = entry.name;
  destinationPlace.textContent = entry.iso === null ? emptyLabel : countryNames.get(entry.iso) ?? entry.iso;
  markFlag(ctx, entry.iso);
  if (waypointLabel.textContent !== entry.name) {
    waypointLabel.textContent = entry.name;
    ctx.labelWidth = -1;
  }
  destinationRange.textContent = Number.isFinite(entry.km) ? km(entry.km) : '…';
  ctx.shownKm = Number.isFinite(entry.km) ? Math.round(entry.km) : NaN;
  destination.classList.add('on');
}

export function trackDestination(ctx: HudCtx, distanceKm: number | null, x: number | null, y: number, angle: number): void {
  const { destinationRange, waypoint, waypointLabel, waypointPin } = ctx;
  // -1 is *Here*, which no rounded distance is.
  const rounded = distanceKm === null ? -1 : Math.round(distanceKm);
  if (rounded !== ctx.shownKm) {
    ctx.shownKm = rounded;
    destinationRange.textContent = distanceKm === null ? 'Here' : km(distanceKm);
  }
  if (x === null || ctx.arrivedFor > 0) {
    waypoint.classList.remove('on');
    return;
  }
  waypoint.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  // The tip of the unrotated teardrop points down-left, 135 degrees.
  waypointPin.style.transform = `rotate(${(angle * R2D - 135).toFixed(1)}deg)`;
  // The label is centred over the tip; slide it back on rather than cut the name when the marker is pinned to the screen's edge.
  if (ctx.labelWidth < 0) ctx.labelWidth = waypointLabel.offsetWidth;
  const half = ctx.labelWidth / 2;
  let shift = 0;
  if (x - half < LABEL_MARGIN) shift = LABEL_MARGIN - (x - half);
  else if (x + half > innerWidth - LABEL_MARGIN) shift = innerWidth - LABEL_MARGIN - (x + half);
  shift = Math.round(shift);
  if (shift !== ctx.labelShift) {
    ctx.labelShift = shift;
    waypointLabel.style.transform = shift === 0 ? '' : `translateX(calc(-50% + ${shift}px))`;
  }
  waypoint.classList.add('on');
}

export function showLandmark(ctx: HudCtx, landmark: LandmarkArrival): void {
  const { found, foundFact, foundFlag, foundName, foundNote } = ctx;
  foundName.textContent = landmark.name;
  // Country first: the one fact every landmark has.
  const lines = [landmark.country];
  if (landmark.height !== undefined && landmark.height > 0) lines.push(`${landmark.height.toLocaleString('en')} m`);
  if (landmark.year !== undefined) lines.push(yearText(landmark.year));
  foundFact.textContent = lines.join(', ');
  foundNote.textContent = landmark.note ?? '';
  foundFlag.replaceChildren(createFlagCanvas(landmark.iso, 36, 24));
  found.classList.add('in');
  ctx.foundFor = FOUND_HOLD + (landmark.note ? NOTE_HOLD : 0);
}

export function arriveAt(ctx: HudCtx, name: string, iso: string | null): void {
  const { countryNames, destination, destinationName, destinationPlace, destinationRange, emptyLabel, waypoint } = ctx;
  destinationName.textContent = name;
  destinationPlace.textContent = 'Arrived';
  destinationRange.textContent = iso === null ? emptyLabel : countryNames.get(iso) ?? iso;
  markFlag(ctx, iso);
  destination.classList.add('on', 'arrived');
  waypoint.classList.remove('on');
  ctx.shownKm = NaN;
  ctx.arrivedFor = ARRIVED_HOLD;
}
