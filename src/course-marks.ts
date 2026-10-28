/**
 * How a ring course is marked on paper, the same on the sheet behind `M`, the
 * disc in the corner, the map's legend and the passport: a site is a badge, a
 * cream disc inside a green ring with the kind's glyph in ink (a plane, a
 * car, a boat); the ring a course waits for is a green ring, and its finish
 * the same ring in black and white squares. Canvas and SVG draw the glyphs
 * from one set of paths on the UI icons' 24-unit grid.
 */
import { TAU } from './cartography.ts';
import { PALETTE } from './theme.ts';
import { hex } from './ui.ts';

export type CourseMarkKind = 'air' | 'land' | 'sea';

/** The rings' own green, the colour of everything a course puts on a map. */
export const COURSE_GREEN = hex(PALETTE.green);
const INK = hex(PALETTE.ink);
const PAPER = hex(PALETTE.white);

/** What each kind is called on a map and in the book, one and many. */
export const COURSE_NAME: Readonly<Record<CourseMarkKind, string>> = { air: 'Sky course', land: 'Road rally', sea: 'Sea race' };
export const COURSE_NAMES: Readonly<Record<CourseMarkKind, string>> = { air: 'Sky courses', land: 'Road rallies', sea: 'Sea races' };

/** The medals' metals by rank (1 bronze, 2 silver, 3 gold), as plain colours a canvas can take. */
export const MEDAL_METAL = ['#b5aca4', '#c98a4b', '#cfd6de', hex(PALETTE.gold)] as const;

/** A circle as path data, for the wheels. */
const disc = (cx: number, cy: number, r: number): string => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** The glyphs, on a 24-unit grid: the UI's plane, car and boat. */
const GLYPH: Readonly<Record<CourseMarkKind, string>> = {
  air:
    'M21 4.2c-.7-.7-2-.5-3 .5l-3.3 3.3-8.2-2.4-2 2 6.6 3.6-3.1 3.2-2.6-.4-1.6 1.6 3.6 1.9 1.9 3.6 1.6-1.6-.4-2.6 3.2-3.1 3.6 6.6 2-2-2.4-8.2 3.3-3.3c1-1 1.2-2.3.5-3z',
  land: `M3.5 16.5v-4l2.2-5h12.6l2.2 5v4zM3.5 12.5h17${disc(7.5, 17, 1.8)}${disc(16.5, 17, 1.8)}`,
  sea: 'M3 15.5h18l-2.6 4.5H5.6zM12 3.5v12M12 4.5 18.5 13H12M12 7 7 13h5',
};
/** The plane is filled: at a badge's size its outline alone is a scribble. */
const FILLED: ReadonlySet<CourseMarkKind> = new Set(['air']);

let paths: Map<CourseMarkKind, Path2D> | null = null;

function glyphPath(kind: CourseMarkKind): Path2D {
  paths ??= new Map((Object.keys(GLYPH) as CourseMarkKind[]).map((k) => [k, new Path2D(GLYPH[k])]));
  return paths.get(kind)!;
}

/**
 * A course's badge centred on (x, y), `r` its outer radius in pixels; a dot
 * of its medal's metal on its shoulder once it has been run (`medal` 1 to 3).
 */
export function traceCourseBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: CourseMarkKind, medal = 0): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = COURSE_GREEN;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, TAU);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
  const scale = (r * 1.0) / 24;
  ctx.translate(x - 12 * scale, y - 12 * scale);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  const path = glyphPath(kind);
  if (FILLED.has(kind)) {
    ctx.fillStyle = INK;
    ctx.fill(path);
  } else ctx.stroke(path);
  ctx.restore();
  if (medal > 0) {
    ctx.beginPath();
    ctx.arc(x + r * 0.72, y - r * 0.72, Math.max(2.5, r * 0.38), 0, TAU);
    ctx.fillStyle = MEDAL_METAL[medal] ?? MEDAL_METAL[1];
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/**
 * The ring a course waits for, centred on (x, y): a green ring in ink, or the
 * finish's in two lanes of black and white squares.
 */
export function traceRingMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, finish: boolean): void {
  const width = Math.max(2.5, r * 0.5);
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (!finish) {
    ctx.lineWidth = width;
    ctx.strokeStyle = COURSE_GREEN;
    ctx.stroke();
  } else {
    const lane = width / 2;
    for (const [radius, shifted] of [[r - lane / 2, false], [r + lane / 2, true]] as const) {
      const square = (TAU * radius) / 14;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.lineWidth = lane;
      ctx.setLineDash([]);
      ctx.strokeStyle = PAPER;
      ctx.stroke();
      ctx.setLineDash([square, square]);
      ctx.lineDashOffset = shifted ? square : 0;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The badge as SVG markup, for the legend and the book: the same rings and glyph. */
export function courseBadgeSvg(kind: CourseMarkKind): string {
  const glyph = FILLED.has(kind)
    ? `<path d="${GLYPH[kind]}" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`
    : `<path d="${GLYPH[kind]}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return (
    '<svg viewBox="-2 -2 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    `<circle cx="12" cy="12" r="12" fill="${COURSE_GREEN}" stroke="${INK}" stroke-width="2.2"/>` +
    `<circle cx="12" cy="12" r="7.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>` +
    `<g transform="translate(6 6) scale(0.5)">${glyph}</g></svg>`
  );
}
