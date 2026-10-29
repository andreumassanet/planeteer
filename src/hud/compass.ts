/**
 * The compass along the top of the screen: a tape of bearings sliding under a
 * fixed caret as the camera turns, the heading read out under it, and the
 * minimap's marks (the marker, a course's next ring, the other players) riding
 * on it at their bearings, pinned to an end with an arrow when they are behind.
 */
import type { CompassMark, CompassReading } from '../minimap.ts';
import { h, icon } from '../ui.ts';

/** Pixels a degree of turn slides the tape. */
const PX_PER_DEGREE = 3.4;
/** The tape's letters and numbers, every 15 degrees; the cardinal points are larger. */
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Sixteen points for the readout under the caret. */
const READOUT = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** The most marks the strip carries. */
const MAX_MARKS = 8;
const R2D = 180 / Math.PI;

export interface Compass {
  element: HTMLElement;
  /** Every frame; it writes only what moved. */
  update(reading: CompassReading): void;
}

const kmText = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);

export function createCompass(signal: AbortSignal): Compass {
  const tape = h('div', { class: 'atlas-compass-tape' });
  // Three turns' worth, so a heading anywhere in [0, 360) has a full strip either side.
  for (let degree = -360; degree < 720; degree += 5) {
    const bearing = ((degree % 360) + 360) % 360;
    const at = `${((degree + 360) * PX_PER_DEGREE).toFixed(1)}px`;
    const major = bearing % 15 === 0;
    const tick = h('span', { class: `atlas-compass-tick${major ? ' major' : ''}` });
    tick.style.left = at;
    tape.appendChild(tick);
    if (!major) continue;
    const point = bearing % 45 === 0 ? POINTS[bearing / 45]! : null;
    const label = h('span', {
      class: `atlas-compass-label${point === null ? '' : ' point'}${bearing % 90 === 0 ? ' cardinal' : ''}${bearing === 0 ? ' north' : ''}`,
      text: point ?? String(bearing),
    });
    label.style.left = at;
    tape.appendChild(label);
  }
  const marksLayer = h('div', { class: 'atlas-compass-marks' });
  const strip = h('div', { class: 'atlas-compass-strip' }, tape, marksLayer, h('span', { class: 'atlas-compass-caret' }));
  const degrees = h('b');
  const point = h('span');
  const readout = h('div', { class: 'atlas-compass-readout' }, degrees, point);
  const element = h('div', { class: 'atlas-compass', 'aria-hidden': 'true' }, strip, readout);

  const pool: { element: HTMLElement; distance: HTMLElement; kind: string; text: string; edge: number }[] = [];
  for (let i = 0; i < MAX_MARKS; i++) {
    const distance = h('span', { class: 'atlas-compass-km' });
    const mark = h('span', { class: 'atlas-compass-mark' }, h('span', { class: 'atlas-compass-pip' }), distance);
    mark.hidden = true;
    marksLayer.appendChild(mark);
    pool.push({ element: mark, distance, kind: '', text: '', edge: 0 });
  }

  let shownHeading = Number.NaN;
  let shownDegrees = -1;
  let width = 0;
  const measure = (): void => {
    width = strip.clientWidth;
  };
  addEventListener('resize', measure, { signal });

  const placeMark = (slot: (typeof pool)[number], mark: CompassMark): void => {
    if (slot.kind !== mark.kind) {
      slot.kind = mark.kind;
      slot.element.className = `atlas-compass-mark ${mark.kind}`;
      const pip = slot.element.firstChild as HTMLElement;
      pip.replaceChildren(mark.kind === 'marker' ? icon('pin') : mark.kind === 'course' ? icon('flag') : '');
    }
    const half = width / 2;
    let x = mark.bearing * R2D * PX_PER_DEGREE;
    // Past the strip's end it waits at the end, pointing the way to turn.
    const edge = x > half - 12 ? 1 : x < -half + 12 ? -1 : 0;
    if (edge !== 0) x = edge * (half - 12);
    if (edge !== slot.edge) {
      slot.edge = edge;
      slot.element.classList.toggle('right', edge > 0);
      slot.element.classList.toggle('left', edge < 0);
    }
    const text = mark.kind === 'peer' ? '' : kmText(mark.km);
    if (text !== slot.text) {
      slot.text = text;
      slot.distance.textContent = text;
    }
    slot.element.style.transform = `translateX(${(half + x).toFixed(1)}px)`;
  };

  return {
    element,
    update(reading) {
      if (width === 0) measure();
      const heading = reading.heading * R2D;
      if (!(Math.abs(heading - shownHeading) <= 0.05)) {
        shownHeading = heading;
        tape.style.transform = `translateX(${(width / 2 - (heading + 360) * PX_PER_DEGREE).toFixed(1)}px)`;
        const whole = Math.round(heading) % 360;
        if (whole !== shownDegrees) {
          shownDegrees = whole;
          degrees.textContent = `${String(whole).padStart(3, '0')}°`;
          point.textContent = READOUT[Math.round(heading / 22.5) % 16]!;
        }
      }
      const count = Math.min(MAX_MARKS, reading.marks.length);
      for (let i = 0; i < MAX_MARKS; i++) {
        const slot = pool[i]!;
        if (i < count) {
          slot.element.hidden = false;
          placeMark(slot, reading.marks[i]!);
        } else if (!slot.element.hidden) {
          slot.element.hidden = true;
        }
      }
    },
  };
}
