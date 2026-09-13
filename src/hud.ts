/**
 * The "where you are" HUD: a quiet chip that always says where you are, and a
 * card that slides in when that changes.
 *
 * The point is that crossing a border should feel like arriving somewhere
 * rather than like a label being overwritten, and the whole difficulty is that
 * a border is exactly where the answer is least stable. Walk the Spain/Portugal
 * line and `countryAtPoint` flips back and forth every few metres; walk a beach
 * and it drops into the ocean and back a dozen times a minute. So the debounce
 * is on the *data*, not on the animation: a country has to hold for a full
 * second before it counts as where you are, and the sea has to hold for three,
 * because stepping into the water is not an arrival. Debouncing the animation
 * instead would only hide the strobe — the label underneath would still be
 * lying.
 *
 * It also carries the destination furniture — the panel under the minimap and
 * the waypoint marker that tracks the chosen landmark across the screen. That
 * is presentation only: `navigation.ts` decides what the destination is and
 * where its marker belongs, and this file knows nothing about the planet.
 *
 * Everything the HUD needs is inside `root`, stylesheet included, so the caller
 * mounts one element and adds no CSS.
 */
import type { World } from './geo.ts';
import type { Nearby } from './places.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { createFlagCanvas } from './flags.ts';

/** One line of the destination panel. `navigation.ts` fills these in. */
export interface DestinationEntry {
  name: string;
  iso: string;
  /** Great-circle distance in real Earth kilometres. */
  km: number;
  visited: boolean;
}

export interface Hud {
  /** All the elements, for the caller to mount. */
  root: HTMLElement;
  /**
   * Called every frame with the current country index (0 = ocean), the nearest
   * populated place or `null` if there is none worth naming, the local clock as
   * `HH:MM`, and which way that place lies.
   *
   * The clock arrives as a finished string and the bearing as a finished angle
   * because this file knows nothing about the planet and should not start now:
   * `timezone.ts` owns which zone a point is in, `cartography.ts`'s `bearingTo`
   * owns which way round a screen goes, and `main.ts` asks them both.
   *
   * `bearing` is clockwise from where you are facing, in radians — zero is dead
   * ahead — so the chip's arrow is that angle and nothing else. `null` when
   * there is no answer, which is at the planet's centre and looking straight up.
   */
  update(
    countryId: number,
    place: Nearby | null,
    clock: string,
    dt: number,
    bearing?: number | null,
  ): void;
  /**
   * You did not walk here: publish the next reading without waiting for it to
   * settle.
   *
   * **The debounce is a filter on flapping and a teleport is not flapping.**
   * `SETTLE_LAND` and `SETTLE_PLACE` exist because a coastline crossed on foot
   * drops into the ocean and back a dozen times a minute, and they cost a
   * second of a chip that says the country you left — `atlas.goTo(62, 26)` put
   * the player in Finland under a Spanish flag, and reading a stale flag as a
   * bug in `countryAt` is a morning nobody needs twice. One frame of a wrong
   * chip is a frame; a second of it is a claim.
   */
  jump(): void;
  /**
   * The chosen landmark, followed by the candidates after it in the cycle.
   * `browsing` opens the shortlist; it closes again on the next call. `null`
   * puts the panel and the marker away.
   */
  setDestination(entries: readonly DestinationEntry[] | null, browsing?: boolean): void;
  /**
   * Every frame while a destination is set: how far it is, and where its marker
   * belongs in CSS pixels, with `angle` the screen direction its tip points.
   * An `x` of `null` keeps the distance and hides the marker.
   */
  trackDestination(km: number, x: number | null, y: number, angle: number): void;
  /** The destination has been reached. The panel holds it, then clears itself. */
  arriveAt(name: string, iso: string): void;
  /**
   * You walked up to a landmark for the first time.
   *
   * The whole project is an explorer of Earth holding the world's notable
   * landmarks, and until this existed the payoff for finding one was the words
   * `Found Machu Picchu` in the same grey toast that reports the render-detail
   * knob. A country you cross gets a card with its flag, its continent and a
   * fact; the thing you actually came for got three words.
   *
   * `found` is which one this is out of how many, because a counter that only
   * lives in the corner never says *this is the fortieth*.
   */
  foundLandmark(landmark: LandmarkArrival): void;
}

/** What the HUD needs to announce a landmark. `main.ts` assembles it. */
export interface LandmarkArrival {
  name: string;
  iso: string;
  /** Country name, resolved by the caller — this file knows nothing of the planet. */
  country: string;
  /** Metres, as the source file records it. Absent for a natural feature. */
  height?: number;
  /** Year completed. Absent, and meaningfully so, for anything older than a date. */
  year?: number;
  found: number;
  total: number;
}

/** How long a country has to hold before it counts as where you are. */
const SETTLE_LAND = 1.0;
/**
 * And how long the sea has to hold. Longer on purpose: the coast is where the
 * flapping is worst, and a step into the water is not somewhere you arrived.
 */
const SETTLE_OCEAN = 3.0;
/**
 * And how long a *place* has to hold, which is shorter than either.
 *
 * A country boundary is shared and you can stand on it; a place's is a circle
 * around a point, so the only line that flaps is the midline between two towns
 * and you cross it once, at speed. The wait is there for that midline and for
 * nothing else, so it does not need to be a full second.
 */
const SETTLE_PLACE = 0.8;
/** How long the arrival card stays before it retreats. */
const HOLD = 5.5;
/** And the landmark card, which is a rarer event and carries more to read. */
const FOUND_HOLD = 8;
/** The chip's little jolt when the place under it changes. */
const BUMP = 0.22;
/** And how long "Arrived" holds before the destination panel puts itself away. */
const ARRIVED_HOLD = 4.5;

const R2D = 180 / Math.PI;
const TROPIC = 23.4365;
const POLAR = 66.5635;

/**
 * How far the chip's arrow has to turn before it is rewritten, in radians.
 *
 * Four degrees is a twentieth of the glyph's own width at 15 px, so the step is
 * under a pixel of arrowhead; below that the transform is work with nothing on
 * the other end of it. Walking pace at 100 units out turns it about 5 deg/s.
 */
const ARROW_STEP = 4 / R2D;

/**
 * Village, town or city, off the one size law rather than a second set of
 * population bands.
 *
 * `radiusFor` runs [12, 150] and `Nearby` carries its answer, so this file does
 * not have to import it — the cuts are at 13 and 30 units, which under
 * `0.465 * pop^0.36` is about 10,000 and 100,000 people. It is a word for *how
 * big*, which is the third thing you do not know when the chip says you are
 * near somewhere; the minimap says the same thing again in the size of the dot.
 */
const sizeWord = (radius: number): string =>
  radius < 13 ? 'village' : radius < 30 ? 'town' : 'city';

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

const STYLE = `
.atlas-hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  color: ${css(PALETTE.ink)};
}
.atlas-hud .card {
  background: ${css(PALETTE.white)};
  border: 3px solid ${css(PALETTE.ink)};
  border-radius: 12px;
  box-shadow: 0 5px 0 ${css(PALETTE.ink)};
}
.atlas-hud canvas {
  display: block;
  border: 2px solid ${css(PALETTE.ink)};
  border-radius: 4px;
}
.atlas-chip {
  position: absolute;
  top: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px 7px 9px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
  white-space: nowrap;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 0.35s ease, transform 0.3s cubic-bezier(0.2, 1.5, 0.4, 1);
}
.atlas-chip-country {
  margin-left: -4px;
  font-weight: 700;
  opacity: 0.55;
}
.atlas-chip-country:empty { display: none; }
/* How far the town is and which way. Tabular figures because the number is
   rewritten every step and a proportional 1 makes the whole chip twitch. */
.atlas-chip-range {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: -4px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}
.atlas-chip-range[hidden] { display: none; }
/* The glyph points up the screen at rest, so the transform *is* the bearing:
   clockwise from where you are facing, which is what cartography's bearingTo
   reports. The transition covers the gap between the steps it is rewritten in. */
.atlas-chip-arrow {
  display: inline-block;
  font-size: 15px;
  line-height: 1;
  transition: transform 0.12s ease;
}
.atlas-chip-arrow[hidden] { display: none; }
.atlas-chip-clock {
  margin-left: 4px;
  padding-left: 11px;
  border-left: 2px solid rgba(30, 6, 3, 0.16);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  opacity: 0.75;
}
.atlas-chip-clock:empty { display: none; border-left: 0; padding-left: 0; }
.atlas-chip.on { opacity: 1; }
.atlas-chip.bump { transform: translateX(-50%) scale(1.07); }
.atlas-arrival {
  position: absolute;
  left: 26px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px 12px 12px;
  max-width: 360px;
  opacity: 0;
  /* Off to the left by more than its own width, so it is genuinely gone. */
  transform: translate(calc(-100% - 30px), -50%);
  transition: transform 0.5s cubic-bezier(0.2, 0.9, 0.25, 1), opacity 0.3s ease;
}
.atlas-arrival.in {
  opacity: 1;
  transform: translate(0, -50%);
}
.atlas-arrival-name {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.1;
}
.atlas-arrival-fact {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  opacity: 0.68;
}
/*
 * The landmark card is the country card's twin on the other side of the screen,
 * and the mirroring is the point: a border crossing arrives from the left and
 * says where you now are, and a landmark arrives from the right and says what
 * you have found. Two events that feel different should not slide in from the
 * same place.
 */
.atlas-found {
  position: absolute;
  right: 26px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 12px 12px 20px;
  max-width: 380px;
  opacity: 0;
  transform: translate(calc(100% + 30px), -50%);
  transition: transform 0.5s cubic-bezier(0.2, 0.9, 0.25, 1), opacity 0.3s ease;
}
.atlas-found.in { opacity: 1; transform: translate(0, -50%); }
.atlas-found-text { text-align: right; }
.atlas-found-eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  opacity: 0.5;
}
.atlas-found-name {
  margin-top: 1px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.1;
}
.atlas-found-fact {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  opacity: 0.68;
}

/* The destination sits under the minimap because it belongs to it: the disc
   says which way, this says what and how far. */
.atlas-destination {
  position: absolute;
  top: 222px;
  right: 24px;
  width: 236px;
  padding: 9px 12px 10px;
  opacity: 0;
  transform: translateX(16px);
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.2, 0.9, 0.25, 1), background 0.3s ease;
}
.atlas-destination.on { opacity: 1; transform: none; }
.atlas-destination.arrived { background: ${css(PALETTE.gold)}; }
.atlas-destination-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.atlas-destination-name {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.012em;
  line-height: 1.15;
}
.atlas-destination-sub {
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 600;
  opacity: 0.62;
}
/* The shortlist only exists while you are cycling: the rest of the time one
   line is the whole answer, and a list you cannot dismiss is furniture. */
.atlas-destination-list, .atlas-destination-hint { display: none; }
.atlas-destination.browsing .atlas-destination-list,
.atlas-destination.browsing .atlas-destination-hint { display: block; }
.atlas-destination-list {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 2px solid rgba(30, 6, 3, 0.14);
}
.atlas-destination-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.65;
  opacity: 0.55;
}
.atlas-destination-row span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.atlas-destination-row span:first-child::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  vertical-align: middle;
}
/* Gold means found, the same as the minimap's pins. */
.atlas-destination-row.visited span:first-child::before {
  background: ${css(PALETTE.gold)};
  border-color: ${css(PALETTE.gold)};
}
.atlas-destination-hint {
  margin-top: 7px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.42;
}

/* The waypoint. Zero-sized, so its origin is exactly the point being marked and
   the pin can rotate about its own tip without leaving it. */
.atlas-waypoint {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  opacity: 0;
  transition: opacity 0.25s ease;
}
.atlas-waypoint.on { opacity: 1; }
.atlas-waypoint-pin {
  position: absolute;
  left: 0;
  top: -26px;
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  background: ${css(PALETTE.violet)};
  border: 3px solid ${css(PALETTE.ink)};
  /* Three round corners and one square one: the square corner is the tip, and
     it sits on the container's origin. */
  border-radius: 50% 50% 50% 0;
  transform-origin: 0 100%;
}
.atlas-waypoint-label {
  position: absolute;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%);
  padding: 4px 10px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
`;

const km = (value: number): string => `${Math.round(value).toLocaleString('en')} km`;

/**
 * Builds the one line of context under a country's name.
 *
 * Every line here is derived from the baked outlines and checked against them,
 * because a portfolio piece that states a confident falsehood about somebody's
 * country is worse than one that says nothing. "The equator runs through it" is
 * not taken from the bounding box — a box can straddle a line the land misses —
 * it is confirmed by walking the line with `countryAt`, which is the same exact
 * test the ground under the player uses. Where nothing more interesting is
 * true, the line falls back to the country's extent, which always is.
 */
function factFor(world: World, id: number): string {
  const country = world.countries[id - 1]!;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const ring of country.rings) {
    for (const point of ring) {
      const lon = point[0]!;
      const lat = point[1]!;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }

  /** Does this country's land actually touch the given parallel? */
  const onParallel = (lat: number): boolean => {
    if (lat <= minLat || lat >= maxLat) return false;
    for (let lon = minLon; lon <= maxLon; lon += 0.2) {
      if (world.countryAt(lat, lon) === id) return true;
    }
    return false;
  };
  const onMeridian = (lon: number): boolean => {
    if (lon <= minLon || lon >= maxLon) return false;
    for (let lat = minLat; lat <= maxLat; lat += 0.2) {
      if (world.countryAt(lat, lon) === id) return true;
    }
    return false;
  };

  // No country's land spans more than half the globe without crossing the
  // antimeridian, and this has to be the first test: past that line a
  // longitude box means nothing. Kiribati reaches from 169°E to 157°W, and
  // measuring it naively said the place was 37,000 km across.
  if (maxLon - minLon > 180) return 'its land falls on both sides of the antimeridian';
  if (onParallel(0)) return 'the equator runs through it';
  if (maxLat > POLAR) return `its land reaches ${maxLat.toFixed(1)}°N, inside the Arctic Circle`;
  if (minLat < -POLAR) return `its land reaches ${(-minLat).toFixed(1)}°S, inside the Antarctic Circle`;
  if (onParallel(TROPIC)) return 'the Tropic of Cancer crosses it';
  if (onParallel(-TROPIC)) return 'the Tropic of Capricorn crosses it';
  if (onMeridian(0)) return 'the prime meridian runs through it';
  if (country.rings.length >= 6) return `drawn here from ${country.rings.length} separate landmasses`;

  const wide = (maxLon - minLon) * 111.32 * Math.cos(country.lat / R2D);
  const tall = (maxLat - minLat) * 110.57;
  const across = Math.max(wide, tall);
  if (across < 150) return `about ${km(across)} across`;
  if (country.rings.length > 1) {
    return `${km(across)} across, and ${country.rings.length} separate landmasses`;
  }
  return `${km(wide)} from east to west, ${km(tall)} north to south`;
}

/** The chip's stand-in for a flag when you are at sea. */
function oceanPlate(width: number, height: number): HTMLCanvasElement {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = css(OCEAN_COLOR);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = css(PALETTE.white);
    ctx.lineWidth = canvas.height * 0.075;
    ctx.lineCap = 'round';
    for (let row = 0; row < 2; row++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24) * canvas.width;
        const y = canvas.height * (0.36 + row * 0.3) + Math.sin(i * 0.6) * canvas.height * 0.09;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  return canvas;
}

export function createHud(world: World): Hud {
  const root = document.createElement('div');
  root.className = 'atlas-hud';

  const style = document.createElement('style');
  style.textContent = STYLE;

  const chip = document.createElement('div');
  chip.className = 'atlas-chip card';
  const chipFlag = document.createElement('span');
  // Two spans, because they are two different claims. The first is the smallest
  // true thing that can be said about where you are — the city if there is one,
  // the country if there is not — and the second is the context under it, which
  // is only worth printing when the first is not already the country.
  const chipName = document.createElement('span');
  // How far the named town is and which way it lies. It is a third claim and
  // not part of the second: the country under the name never changes while you
  // walk and this changes every step, so they are written on different clocks.
  const chipRange = document.createElement('span');
  chipRange.className = 'atlas-chip-range';
  chipRange.hidden = true;
  const chipRangeText = document.createElement('span');
  const chipArrow = document.createElement('span');
  chipArrow.className = 'atlas-chip-arrow';
  chipArrow.textContent = '↑';
  chipRange.append(chipRangeText, chipArrow);
  const chipCountry = document.createElement('span');
  chipCountry.className = 'atlas-chip-country';
  // The clock is the one part of the chip that is not debounced — it has no
  // boundary to flap across, and a clock that waited a second to agree with
  // itself would just be a slow clock.
  const chipClock = document.createElement('span');
  chipClock.className = 'atlas-chip-clock';
  chip.append(chipFlag, chipName, chipRange, chipCountry, chipClock);

  const arrival = document.createElement('div');
  arrival.className = 'atlas-arrival card';
  const arrivalFlag = document.createElement('span');
  const arrivalText = document.createElement('div');
  const arrivalName = document.createElement('div');
  arrivalName.className = 'atlas-arrival-name';
  const arrivalFact = document.createElement('div');
  arrivalFact.className = 'atlas-arrival-fact';
  arrivalText.append(arrivalName, arrivalFact);
  arrival.append(arrivalFlag, arrivalText);

  const found = document.createElement('div');
  found.className = 'atlas-found card';
  const foundText = document.createElement('div');
  foundText.className = 'atlas-found-text';
  const foundEyebrow = document.createElement('div');
  foundEyebrow.className = 'atlas-found-eyebrow';
  const foundName = document.createElement('div');
  foundName.className = 'atlas-found-name';
  const foundFact = document.createElement('div');
  foundFact.className = 'atlas-found-fact';
  const foundFlag = document.createElement('span');
  foundText.append(foundEyebrow, foundName, foundFact);
  found.append(foundText, foundFlag);

  const destination = document.createElement('div');
  destination.className = 'atlas-destination card';
  const destinationHead = document.createElement('div');
  destinationHead.className = 'atlas-destination-head';
  const destinationFlag = document.createElement('span');
  const destinationText = document.createElement('div');
  const destinationName = document.createElement('div');
  destinationName.className = 'atlas-destination-name';
  const destinationSub = document.createElement('div');
  destinationSub.className = 'atlas-destination-sub';
  // Two spans and a fixed separator, because only the right-hand one changes:
  // the distance is rewritten as you fly and the country never is.
  const destinationPlace = document.createElement('span');
  const destinationRange = document.createElement('span');
  destinationSub.append(destinationPlace, document.createTextNode(' · '), destinationRange);
  destinationText.append(destinationName, destinationSub);
  destinationHead.append(destinationFlag, destinationText);
  const destinationList = document.createElement('div');
  destinationList.className = 'atlas-destination-list';
  const destinationHint = document.createElement('div');
  destinationHint.className = 'atlas-destination-hint';
  destinationHint.textContent = 'Tab · next';
  destination.append(destinationHead, destinationList, destinationHint);

  const waypoint = document.createElement('div');
  waypoint.className = 'atlas-waypoint';
  const waypointPin = document.createElement('div');
  waypointPin.className = 'atlas-waypoint-pin';
  const waypointLabel = document.createElement('div');
  waypointLabel.className = 'atlas-waypoint-label card';
  waypoint.append(waypointPin, waypointLabel);

  root.append(style, chip, arrival, found, destination, waypoint);

  // The placements carry an ISO code and the panel wants a country, which is a
  // lookup the outlines already answer.
  const countryNames = new Map(world.countries.map((country) => [country.iso, country.name]));

  // Facts walk the outlines, so they are worked out once per country and kept.
  const facts = new Map<number, string>();

  /** Where you are, once it has held long enough to count. */
  let settled = -1;
  /** And which place, once the same is true of it. `null` is "nowhere named". */
  let settledPlace: Nearby | null = null;
  /**
   * The place as one comparable value.
   *
   * It carries `inside` as well as the index because crossing from the approach
   * band into the buildings changes what the chip says — *near Palma* becomes
   * *Palma* — and that is a change the debounce has to see.
   */
  let placeCandidate = '';
  let placeSettled = '';
  let placeHeldFor = 0;
  let pending: Nearby | null = null;
  /** The last country the card actually announced. The ocean is never one. */
  let announced = -1;
  let candidate = -1;
  let heldFor = 0;
  let showing = false;
  let showFor = 0;
  let bumpFor = 0;
  /** Seconds of "Arrived" left on the destination panel. */
  let arrivedFor = 0;
  /**
   * Seconds the landmark card has left.
   *
   * Longer than the country card's `HOLD`, and deliberately: a border is
   * crossed by walking in a straight line and will be crossed again, while a
   * landmark is a thing you went looking for. It is also the only card carrying
   * numbers somebody might want to read twice.
   */
  let foundFor = 0;
  /** Set by `jump`, cleared by the next `update`: settle whatever arrives. */
  let jumped = false;
  /** The distance last written, so the same string is not rewritten every frame. */
  let shownKm = NaN;
  /** And the clock, for the same reason: it changes once a minute, not 3,600 times. */
  let shownClock = '';
  /** And the chip's own range and arrow, which change as fast as you walk. */
  let shownRange = '';
  let shownBearing = 99;

  const keyOf = (near: Nearby | null): string =>
    near && near.near ? `${near.index}${near.inside ? '!' : '~'}` : '';

  /**
   * Writes the chip from whatever has settled.
   *
   * On a change, never per frame: it rebuilds a flag canvas, and the whole
   * reason the debounce is on the data is so that this runs about as often as
   * you actually go somewhere.
   */
  function renderChip(): void {
    const country = settled > 0 ? world.countries[settled - 1]! : null;
    // At sea the chip says the sea. Naming the town you can see from the boat
    // would be true and would still be wrong: the ocean is the one place in
    // this world that is not somewhere you arrived.
    const place = country ? settledPlace : null;
    chipName.textContent = place
      ? place.inside
        ? place.place.name
        : `near ${place.place.name}`
      : country
        ? country.name
        : 'Open ocean';
    // The country you are *standing in*, which is not always the country the
    // town is in: at 49.75, 6.35 the nearest built place is Trier and the
    // ground is Luxembourg. Writing it as "a town in Luxembourg" put Trier in
    // the wrong country and matched the flag beside it, which is worse than
    // saying less. The size word belongs to the town and sits next to it.
    chipCountry.textContent = place && country ? ` · ${country.name}` : '';
    chipFlag.replaceChildren(
      country ? createFlagCanvas(country.iso, 26, 17) : oceanPlate(26, 17),
    );
    chip.classList.add('on', 'bump');
    bumpFor = BUMP;
  }

  /**
   * What the town is and how far, rewritten on its own clock.
   *
   * **This is the whole of the "near some city" complaint.** *near Palma* on
   * its own says the name and nothing else: not where it is, not how far, not
   * whether it is a hamlet or a capital. So the chip answers all three — the
   * word, the distance and an arrow — and `minimap.ts` draws the same town as a
   * dot at the same moment, which is the other half of the same answer.
   *
   * Not inside `renderChip`: that runs when you *arrive* somewhere and rebuilds
   * a flag canvas, and this changes every step. The two parts are guarded
   * separately because they cost different things — the text is a DOM write and
   * the arrow is a compositor transform — and neither is worth doing sixty
   * times a second for a change nobody can see.
   *
   * Inside the buildings there is no distance to give and no way to point: you
   * are there, and the chip already says so by dropping the *near*.
   */
  function renderRange(bearing: number | null): void {
    const place = settled > 0 ? settledPlace : null;
    if (place === null) {
      chipRange.hidden = true;
      shownRange = '';
      return;
    }
    chipRange.hidden = false;
    const size = `· a ${sizeWord(place.radius)}`;
    const text = place.inside
      ? size
      : `${size} ${place.km < 10 ? place.km.toFixed(1) : Math.round(place.km)} km`;
    if (text !== shownRange) {
      shownRange = text;
      chipRangeText.textContent = text;
    }
    chipArrow.hidden = place.inside;
    if (place.inside || bearing === null) return;
    if (Math.abs(bearing - shownBearing) < ARROW_STEP) return;
    shownBearing = bearing;
    chipArrow.style.transform = `rotate(${(bearing * R2D).toFixed(0)}deg)`;
  }

  /** The card, and only the card. The chip is `renderChip`, once, at the end. */
  function announce(id: number): void {
    settled = id;
    const country = id > 0 ? world.countries[id - 1]! : null;

    // The ocean updates the chip and nothing else. You do not arrive at the
    // sea, and firing the card every time you paddle off a beach would spend
    // the animation on the one event that is never interesting.
    //
    // Nor does a *town*, and that is a budget rather than a principle: places
    // sit a median 161 units apart, which at a run is one every 1.8 seconds
    // against a card that holds for 5.5. The chip is the right size of event
    // for a place; the card stays for the border.
    if (!country || id === announced) return;
    announced = id;

    let fact = facts.get(id);
    if (fact === undefined) {
      fact = factFor(world, id);
      facts.set(id, fact);
    }
    arrivalName.textContent = country.name;
    arrivalFact.textContent = `${country.continent} · ${fact}`;
    arrivalFlag.replaceChildren(createFlagCanvas(country.iso, 66, 44));
    arrival.classList.add('in');
    showing = true;
    showFor = 0;
  }

  return {
    root,
    jump() {
      jumped = true;
    },
    setDestination(entries, browsing = false) {
      arrivedFor = 0;
      destination.classList.remove('arrived');
      if (entries === null || entries.length === 0) {
        destination.classList.remove('on', 'browsing');
        waypoint.classList.remove('on');
        shownKm = NaN;
        return;
      }
      const chosen = entries[0]!;

      destinationName.textContent = chosen.name;
      destinationPlace.textContent = countryNames.get(chosen.iso) ?? chosen.iso;
      destinationFlag.replaceChildren(createFlagCanvas(chosen.iso, 30, 20));
      waypointLabel.textContent = chosen.name;
      destinationRange.textContent = km(chosen.km);
      shownKm = Math.round(chosen.km);

      destinationList.replaceChildren(
        ...entries.slice(1).map((entry) => {
          const row = document.createElement('div');
          row.className = entry.visited ? 'atlas-destination-row visited' : 'atlas-destination-row';
          const name = document.createElement('span');
          name.textContent = entry.name;
          const range = document.createElement('span');
          range.textContent = km(entry.km);
          row.append(name, range);
          return row;
        }),
      );

      destination.classList.add('on');
      destination.classList.toggle('browsing', browsing);
    },
    trackDestination(distanceKm, x, y, angle) {
      const rounded = Math.round(distanceKm);
      if (rounded !== shownKm) {
        shownKm = rounded;
        destinationRange.textContent = km(distanceKm);
      }
      if (x === null || arrivedFor > 0) {
        waypoint.classList.remove('on');
        return;
      }
      waypoint.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // The pin turns about its own tip, and the tip of the unrotated teardrop
      // already points down-left — 135 degrees — so that is what comes off.
      waypointPin.style.transform = `rotate(${(angle * R2D - 135).toFixed(1)}deg)`;
      waypoint.classList.add('on');
    },
    foundLandmark(landmark) {
      foundEyebrow.textContent = `${landmark.found} of ${landmark.total} found`;
      foundName.textContent = landmark.name;
      // Country first because it is the one fact every landmark has; then the
      // two that are often absent, in the order a label on a plinth would give
      // them. A natural feature has neither and the line is just the country,
      // which is correct rather than a gap.
      const facts = [landmark.country];
      if (landmark.height !== undefined && landmark.height > 0) {
        facts.push(`${landmark.height.toLocaleString('en')} m`);
      }
      if (landmark.year !== undefined) facts.push(String(landmark.year));
      foundFact.textContent = facts.join(' · ');
      foundFlag.replaceChildren(createFlagCanvas(landmark.iso, 66, 44));
      found.classList.add('in');
      foundFor = FOUND_HOLD;
    },
    arriveAt(name, iso) {
      destinationName.textContent = name;
      destinationPlace.textContent = 'Arrived';
      destinationRange.textContent = countryNames.get(iso) ?? iso;
      destinationFlag.replaceChildren(createFlagCanvas(iso, 30, 20));
      destination.classList.remove('browsing');
      destination.classList.add('on', 'arrived');
      waypoint.classList.remove('on');
      shownKm = NaN;
      arrivedFor = ARRIVED_HOLD;
    },
    update(countryId, place, clock, dt, bearing = null) {
      // Written straight through, not through `renderChip`: rewriting the flag
      // canvas once a minute to change two digits would be the most expensive
      // thing the HUD does.
      if (clock !== shownClock) {
        shownClock = clock;
        chipClock.textContent = clock;
      }

      if (arrivedFor > 0) {
        arrivedFor -= dt;
        if (arrivedFor <= 0) destination.classList.remove('on', 'arrived');
      }

      if (countryId !== candidate) {
        candidate = countryId;
        heldFor = 0;
      } else {
        heldFor += dt;
      }
      // The two settle on their own clocks, so walking out of a town does not
      // wait on the country and crossing a border does not wait on the town —
      // but the chip is one sentence about both, so it is written once, after
      // both have had their say. Drawing it inside either branch is how the
      // first version of this said "Paris · Japan": teleporting settles the
      // country and the place on the same frame, and whichever drew first
      // published the other one's previous answer.
      let redraw = false;

      if (candidate !== settled && (jumped || heldFor >= (candidate === 0 ? SETTLE_OCEAN : SETTLE_LAND))) {
        announce(candidate);
        redraw = true;
      }

      const key = keyOf(place);
      if (key !== placeCandidate) {
        placeCandidate = key;
        pending = place;
        placeHeldFor = 0;
      } else {
        placeHeldFor += dt;
        // The same place, so keep the freshest reading of it: `units` moves
        // every frame and a caller may want it.
        pending = place;
      }
      if (key !== placeSettled && (jumped || placeHeldFor >= SETTLE_PLACE)) {
        placeSettled = key;
        settledPlace = key === '' ? null : pending;
        redraw = true;
      }

      jumped = false;
      if (redraw) renderChip();
      // After the settle, always: the name waits for the debounce and the
      // distance to it does not — a range that only moved when the chip
      // redrew would be a number that froze while you walked at it.
      renderRange(bearing);

      if (bumpFor > 0) {
        bumpFor -= dt;
        if (bumpFor <= 0) chip.classList.remove('bump');
      }
      if (showing) {
        showFor += dt;
        if (showFor >= HOLD) {
          showing = false;
          arrival.classList.remove('in');
        }
      }
      if (foundFor > 0) {
        foundFor -= dt;
        if (foundFor <= 0) found.classList.remove('in');
      }
    },
  };
}
