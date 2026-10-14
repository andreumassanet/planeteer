/**
 * The place badge. A border is where the answer is least stable, so the debounce
 * is on the data: a country holds for a second (the sea for three) before it
 * counts as where you are. A settled country is an arrival (`onArrival`); the
 * badge is written once, after the country and the place have both settled.
 */
import { createFlagCanvas } from '../flags.ts';
import type { Nearby } from '../places.ts';
import { h, icon } from '../ui.ts';
import { ARROW_STEP, BUMP, OFFSHORE_KM, R2D, SETTLE_FLIGHT, SETTLE_LAND, SETTLE_OCEAN, SETTLE_PLACE, sizeWord } from './constants.ts';
import type { HudCtx } from './ctx.ts';
import { oceanPlate } from './format.ts';

/**
 * Which place the badge names, as a string that changes exactly when the badge's
 * sentence would. From the plane, only the town you are over; at sea, the town
 * whose coast you are off (within `OFFSHORE_KM`); on land, the town whose name
 * reaches here.
 */
function keyOf(ctx: HudCtx, countryId: number, near: Nearby | null): string {
  const { dryBody } = ctx;
  if (near === null) return '';
  if (ctx.flying) return near.inside ? `${near.index}!` : '';
  // Country 0 is the water only where the body has any; on a world without a sea it is ground nobody claims.
  if (countryId === 0 && !dryBody) return near.km <= OFFSHORE_KM ? `${near.index}@` : '';
  return near.near ? `${near.index}${near.inside ? '!' : '~'}` : '';
}

/** The country's flag beside the marker's name, or a pin where it is at sea. */
export function markFlag(ctx: HudCtx, iso: string | null): void {
  ctx.destinationFlag.replaceChildren(iso === null ? h('span', { class: 'atlas-destination-pin' }, icon('pin')) : createFlagCanvas(iso, 30, 20));
}

const kmText = (value: number): string => `${value < 10 ? value.toFixed(1) : Math.round(value)} km`;

/** Writes the badge from whatever has settled: on a change, never per frame. */
function renderPlace(ctx: HudCtx): void {
  const { dryBody, emptyLabel, options, place, placeCountry, placeFlag, placeName, world } = ctx;
  // Nothing until the ground has said what it is.
  if (ctx.settled < 0) return;
  const country = ctx.settled > 0 ? world.countries[ctx.settled - 1]! : null;
  const relation = ctx.placeSettled.slice(-1);
  if (country !== null || dryBody) ctx.placeMode = relation === '!' ? 'in' : relation === '~' ? 'near' : null;
  // At sea the badge says the water ("water", not "sea": a lake is country 0 too) unless a town's quay is in sight.
  // Only a place settled at sea counts: walking ashore, the town can settle before the country.
  else ctx.placeMode = relation === '@' && ctx.settledPlace !== null && ctx.settledPlace.km <= OFFSHORE_KM && !ctx.flying ? 'off' : null;
  const near = ctx.placeMode === null ? null : ctx.settledPlace;
  placeName.textContent =
    near === null
      ? country ? country.name : emptyLabel
      : ctx.placeMode === 'in' ? near.place.name : ctx.placeMode === 'near' ? `Near ${near.place.name}` : `Off ${near.place.name}`;
  // The country you stand in, which is not always the town's.
  placeCountry.textContent = near !== null && country !== null ? country.name : '';
  // The town's size, for whoever asks.
  place.title = [placeName.textContent, near === null ? '' : sizeWord(near.radius), placeCountry.textContent].filter((part) => part !== '').join(' · ');
  // Ground that belongs to nobody on a body with no sea has no plate at all.
  placeFlag.replaceChildren(...(country ? [createFlagCanvas(country.iso, 26, 17)] : options.surface?.sea === false ? [] : [oceanPlate(26, 17)]));
  // Rewritten by the next `renderRange`, which is in the same frame.
  ctx.rangeStale = true;
  place.classList.add('on', 'bump');
  ctx.bumpFor = BUMP;
}

/** How far the town is, rewritten on its own clock; inside it, nothing. */
function renderRange(ctx: HudCtx, bearing: number | null): void {
  const { placeArrow, placeCountry, placeRangeText, placeSep, placeSub } = ctx;
  const near = ctx.placeMode === null ? null : ctx.settledPlace;
  const text = near !== null && ctx.placeMode !== 'in' ? kmText(near.km) : '';
  if (text !== ctx.shownRange || ctx.rangeStale) {
    ctx.rangeStale = false;
    ctx.shownRange = text;
    placeRangeText.textContent = text;
    placeRangeText.hidden = text === '';
    placeSep.hidden = text === '' || placeCountry.textContent === '';
    placeCountry.hidden = placeCountry.textContent === '';
    placeSub.hidden = text === '' && placeCountry.textContent === '';
  }
  const arrow = near !== null && ctx.placeMode !== 'in' && bearing !== null;
  placeArrow.hidden = !arrow;
  if (!arrow) return;
  const turn = Math.atan2(Math.sin(bearing - ctx.arrowAngle), Math.cos(bearing - ctx.arrowAngle));
  if (Math.abs(turn) < ARROW_STEP) return;
  ctx.arrowAngle += turn;
  placeArrow.style.transform = `rotate(${(ctx.arrowAngle * R2D).toFixed(0)}deg)`;
}

/** A country settled: told to whoever listens (the arrival); nothing is drawn. */
function announce(ctx: HudCtx, id: number): void {
  const { options, world } = ctx;
  ctx.settled = id;
  const country = id > 0 ? world.countries[id - 1]! : null;
  if (!country || id === ctx.announced) return;
  ctx.announced = id;
  options.onArrival?.(id);
}

export function updateBadge(ctx: HudCtx, countryId: number, nearby: Nearby | null, dt: number, bearing: number | null): void {
  if (countryId !== ctx.candidate) {
    ctx.candidate = countryId;
    ctx.heldFor = 0;
  } else {
    ctx.heldFor += dt;
  }
  // The badge is one sentence about both the country and the place, so it is written once, after both have settled.
  let redraw = false;
  if (ctx.candidate !== ctx.settled && (ctx.jumped || ctx.heldFor >= (ctx.candidate === 0 ? SETTLE_OCEAN : SETTLE_LAND))) {
    announce(ctx, ctx.candidate);
    redraw = true;
  }
  const key = keyOf(ctx, countryId, nearby);
  if (key !== ctx.placeCandidate) {
    ctx.placeCandidate = key;
    ctx.placeHeldFor = 0;
  } else {
    ctx.placeHeldFor += dt;
  }
  const settle = ctx.flying ? SETTLE_FLIGHT : SETTLE_PLACE;
  if (key !== ctx.placeSettled && (ctx.jumped || ctx.placeHeldFor >= settle)) {
    ctx.placeSettled = key;
    ctx.settledPlace = key === '' ? null : nearby;
    redraw = true;
  } else if (key === ctx.placeSettled && key !== '') {
    // Still the same place, a step nearer: see `settledPlace`.
    ctx.settledPlace = nearby;
  }
  ctx.jumped = false;
  if (redraw) renderPlace(ctx);
  // After the settle, always: the name waits for the debounce and the distance does not.
  renderRange(ctx, bearing);
}
