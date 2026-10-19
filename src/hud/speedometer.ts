/**
 * The speedometer: a round dial in the corner while you are in a vehicle,
 * ticks and figures round 270 degrees, a needle eased towards the speed, the
 * speed in figures under it and, by kind, the gear or the altitude.
 *
 * World units become metres by `SCENERY_SCALE`, the scale every building and
 * road is built at, so a car's speed reads against the street it drives.
 */
import { SCENERY_SCALE } from '../stature.ts';

/** What the dial reads in: kilometres or miles an hour, or knots. */
export type SpeedUnit = 'kmh' | 'mph' | 'kn';

/** One frame's reading: the speed in units a second (negative astern), the dial's top, and what goes under the figures. */
export interface SpeedReading {
  speed: number;
  /** The fastest the dial should show, units a second; the scale is the next round figure over it. */
  top: number;
  /** Whether the vehicle flies, so the line under the figures is its altitude. */
  air: boolean;
  /** Whether it is a road vehicle, so the line is its gear. */
  road: boolean;
  /** Units above the ground or sea, for the altitude. */
  altitude: number;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Metres a second in one of each unit an hour. */
const PER_UNIT: Record<SpeedUnit, number> = { kmh: 1 / 3.6, mph: 0.44704, kn: 0.514444 };
const UNIT_WORD: Record<SpeedUnit, string> = { kmh: 'KM/H', mph: 'MPH', kn: 'KNOTS' };
/** Metres in a foot, for the altitude when the speed is not metric. */
const FOOT = 0.3048;

/** The dial's centre and radii in its 200-unit box, and its sweep, degrees clockwise from straight up. */
const C = 100;
const R_TRACK = 82;
const R_TICK = 86;
const R_NUM = 64;
const START = -135;
const SWEEP = 270;
/** Time constant of the needle, seconds. */
const NEEDLE_LAG = 0.12;
/** Time constant of the dial's scale when a plane's cruise moves it, seconds. */
const SCALE_LAG = 0.6;

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

function polar(radius: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  return [C + radius * Math.sin(a), C - radius * Math.cos(a)];
}

function arc(radius: number, from: number, to: number): string {
  const [x0, y0] = polar(radius, from);
  const [x1, y1] = polar(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** A step of 1, 2, 2.5 or 5 times a power of ten giving four to eight figures round the dial. */
export function dialStep(top: number): number {
  const rough = Math.max(1, top) / 6;
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= rough) return m * power;
  return 10 * power;
}

/** The default unit for this browser: miles in the United States and Britain, kilometres elsewhere. */
export function localeSpeedUnit(): SpeedUnit {
  const tag = (typeof navigator === 'undefined' ? '' : navigator.language || '').toLowerCase();
  return tag === 'en-us' || tag === 'en-gb' || tag === 'en-lr' || tag === 'my' || tag.startsWith('my-') ? 'mph' : 'kmh';
}

/** Units a second to the chosen unit. */
export function speedIn(unitsPerSecond: number, unit: SpeedUnit): number {
  return unitsPerSecond / SCENERY_SCALE / PER_UNIT[unit];
}

export interface Speedometer {
  element: HTMLElement;
  /** Each frame: a reading, or null to put the dial away. */
  update(reading: SpeedReading | null, unit: SpeedUnit, dt: number): void;
}

export function createSpeedometer(): Speedometer {
  const element = document.createElement('div');
  element.className = 'atlas-speedo ui-card';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'Speedometer');
  const svg = node('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' });
  const track = node('path', { d: arc(R_TRACK, START, START + SWEEP), fill: 'none', stroke: 'var(--ui-rule)', 'stroke-width': 9, 'stroke-linecap': 'round' });
  const fill = node('path', { d: '', fill: 'none', stroke: 'var(--ui-gold)', 'stroke-width': 9, 'stroke-linecap': 'round' });
  const ticks = node('g', {});
  const figures = node('g', {});
  const value = node('text', { class: 'sp-value', x: C, y: 143 });
  const unitText = node('text', { class: 'sp-unit', x: C, y: 158 });
  const sub = node('text', { class: 'sp-sub', x: C, y: 183 });
  const needle = node('g', { class: 'sp-needle' });
  needle.append(
    node('path', { d: `M ${C - 4} ${C + 12} L ${C} ${C - 74} L ${C + 4} ${C + 12} Z`, fill: 'var(--ui-crimson)', stroke: 'var(--ui-ink)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
  );
  const hub = node('circle', { cx: C, cy: C, r: 9, fill: 'var(--ui-ink)' });
  svg.append(track, fill, ticks, figures, value, unitText, needle, hub, sub);
  element.append(svg);

  let on = false;
  let shown = 0;
  let scale = 0;
  let drawnFor = '';
  let shownText = '';
  let shownSub = '';
  /** The needle's angle as last drawn, so a steady needle writes nothing. */
  let drawnAngle = '';
  let shownUnit = '';

  /** Ticks and figures for a dial whose top is `max` in `unit`, stepped by `step`. */
  function drawScale(max: number, step: number): void {
    ticks.replaceChildren();
    figures.replaceChildren();
    // A minor tick every fifth of a step, or a quarter of one that starts with a 2.
    const lead = Math.round(step / 10 ** Math.floor(Math.log10(step)));
    const minors = lead === 2 ? 4 : 5;
    const count = Math.round((max / step) * minors);
    for (let i = 0; i <= count; i++) {
      const major = i % minors === 0;
      const angle = START + (SWEEP * i) / count;
      const [x0, y0] = polar(R_TICK, angle);
      const [x1, y1] = polar(R_TICK - (major ? 15 : 8), angle);
      ticks.append(node('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'var(--ui-ink)', 'stroke-width': major ? 3.5 : 2, 'stroke-linecap': 'round' }));
      if (!major) continue;
      const [nx, ny] = polar(R_NUM, angle);
      const figure = node('text', { class: 'sp-num', x: nx.toFixed(1), y: ny.toFixed(1) });
      const v = (i / minors) * step;
      figure.textContent = v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(1));
      figures.append(figure);
    }
  }

  return {
    element,
    update(reading, unit, dt) {
      if (reading === null) {
        if (on) element.classList.remove('on');
        on = false;
        return;
      }
      const k = dt <= 0 ? 1 : 1 - Math.exp(-dt / NEEDLE_LAG);
      // A reading that is not a number leaves the dial as it was: one NaN in the
      // eased scale would hold it at NaN for good.
      if (!Number.isFinite(reading.speed) || !Number.isFinite(reading.top)) return;
      const speed = speedIn(Math.abs(reading.speed), unit);
      const top = speedIn(reading.top, unit);
      if (!on) {
        element.classList.add('on');
        on = true;
        shown = speed;
        scale = top;
      }
      // The scale follows a plane's cruise slowly, and never sits under the needle.
      scale += (Math.max(top, speed) - scale) * (dt <= 0 ? 1 : 1 - Math.exp(-dt / SCALE_LAG));
      const step = dialStep(scale);
      const max = Math.max(step * 4, Math.ceil(scale / step) * step);
      const key = `${max}|${step}`;
      if (key !== drawnFor) {
        drawnFor = key;
        drawScale(max, step);
      }
      shown += (speed - shown) * k;
      const share = Math.min(1, Math.max(0, shown / max));
      const angle = (START + SWEEP * share).toFixed(2);
      if (angle !== drawnAngle) {
        drawnAngle = angle;
        needle.setAttribute('transform', `rotate(${angle} ${C} ${C})`);
        fill.setAttribute('d', share < 0.004 ? '' : arc(R_TRACK, START, START + SWEEP * share));
      }
      const text = String(Math.round(shown));
      if (text !== shownText) value.textContent = shownText = text;
      if (unit !== shownUnit) unitText.textContent = UNIT_WORD[(shownUnit = unit)];
      let line = '';
      if (reading.air) {
        const metres = Math.max(0, reading.altitude) / SCENERY_SCALE;
        line = unit === 'kmh' ? `ALT ${Math.round(metres / 10) * 10} m` : `ALT ${(Math.round(metres / FOOT / 10) * 10).toLocaleString('en')} ft`;
      } else if (reading.road) {
        line = reading.speed < -0.3 ? 'R' : Math.abs(reading.speed) < 0.3 ? 'N' : 'D';
      }
      if (line !== shownSub) sub.textContent = shownSub = line;
    },
  };
}
