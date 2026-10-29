import * as THREE from 'three';
import { FONT } from '../ui.ts';
import { TAU, inkedText, type LabelSpace } from '../cartography.ts';
import { COURSE_GREEN, traceCourseBadge, traceRingMark } from '../course-marks.ts';
import { latLonOf } from '../sphere.ts';
import { uOf, vOf } from '../map-tiles.ts';
import { COURSE_BADGE, COURSE_RING, COURSE_SPREAD, PIN_SPACING } from './constants.ts';
import { ink, paper } from './palette.ts';
import type { MapSheet } from './sheet.ts';
import type { MapCourse, MapCourseSite } from './types.ts';
import { screenX, screenY } from './view.ts';

const latLon = { lat: 0, lon: 0 };
/** Courses whose first ring is laid out in one redraw: laying one runs the course's own layout. */
const STARTS_A_REDRAW = 6;
const unit = new THREE.Vector3();
const NO_SITES: readonly MapCourseSite[] = [];

export function courseSitesOf(s: MapSheet): readonly MapCourseSite[] {
  return s.options.courseSites?.() ?? NO_SITES;
}

/**
 * Each site projected onto the sheet once its list is known. A capital has
 * a sky course and a rally both: the sky's badge stands to its left and the
 * road's to its right.
 */
function spotsOf(s: MapSheet, sites: readonly MapCourseSite[]): { u: number; v: number; dx: number }[] {
  if (s.courseSpots !== null && s.courseSpotsFor === sites) return s.courseSpots;
  const paired = new Set<number>();
  const seen = new Set<number>();
  for (const site of sites) {
    if (site.place < 0) continue;
    if (seen.has(site.place)) paired.add(site.place);
    seen.add(site.place);
  }
  s.courseSpots = sites.map((site) => {
    latLonOf(site.at, latLon);
    const dx = site.place >= 0 && paired.has(site.place) ? (site.kind === 'air' ? -COURSE_SPREAD : COURSE_SPREAD) : 0;
    return { u: uOf(latLon.lon), v: vOf(latLon.lat), dx };
  });
  s.courseSpotsFor = sites;
  return s.courseSpots;
}

/** Chooses which course badges stand, kept clear of the pins and of each other, and claims their places. */
export function keepCourses(s: MapSheet, space: LabelSpace): void {
  const { keptCourses, keptPins } = s;
  keptCourses.length = 0;
  const sites = courseSitesOf(s);
  if (sites.length === 0) return;
  const spots = spotsOf(s, sites);
  const room = COURSE_BADGE * 2 + 1;
  const budget = { left: STARTS_A_REDRAW };
  for (let index = 0; index < spots.length; index++) {
    const spot = spots[index]!;
    // Near the screen by its town or port, the badge stands on the course's first ring, once that is known.
    const rough = screenX(s, spot.u);
    const roughY = screenY(s, spot.v);
    if (rough < -200 || rough > s.width + 200 || roughY < -200 || roughY > s.height + 200) continue;
    const start = startOf(s, sites[index]!.key, budget);
    // The rest are laid out on the next redraw.
    if (start === undefined) s.dirty = true;
    const x = start ? screenX(s, start.u) : rough + spot.dx;
    const y = start ? screenY(s, start.v) : roughY;
    if (x < -20 || x > s.width + 20 || y < -20 || y > s.height + 20) continue;
    let crowded = false;
    for (const kept of keptCourses) {
      if (Math.abs(kept.x - x) < room && Math.abs(kept.y - y) < room) {
        crowded = true;
        break;
      }
    }
    for (let p = 0; !crowded && p < keptPins.length; p++) {
      const pin = keptPins[p]!;
      if (Math.abs(pin.x - x) < PIN_SPACING && Math.abs(pin.y - 8 - y) < PIN_SPACING) crowded = true;
    }
    if (crowded) continue;
    keptCourses.push({ index, x, y });
    space.claim(x - COURSE_BADGE - 2, y - COURSE_BADGE - 2, COURSE_BADGE * 2 + 4, COURSE_BADGE * 2 + 4);
  }
}

/**
 * Where a course's first ring stands on the sheet: from the cache, or laid out
 * now while the redraw's `budget` lasts; `undefined` when it is still to come,
 * null where there is no start to ask for.
 */
function startOf(s: MapSheet, key: string, budget: { left: number }): { u: number; v: number } | null | undefined {
  const known = s.courseStarts.get(key);
  if (known !== undefined) return known;
  if (s.options.courseStart === undefined) return null;
  if (budget.left <= 0) return undefined;
  budget.left--;
  const point = s.options.courseStart(key);
  const spot = point === null ? null : (latLonOf(unit.set(point.x, point.y, point.z).normalize(), latLon), { u: uOf(latLon.lon), v: vOf(latLon.lat) });
  s.courseStarts.set(key, spot);
  return spot;
}

/** Where a point in the world falls on the screen, on the copy of the sheet nearest the middle. */
function onSheet(s: MapSheet, point: { x: number; y: number; z: number }): [number, number] {
  latLonOf(unit.set(point.x, point.y, point.z).normalize(), latLon);
  return [screenX(s, uOf(latLon.lon)), screenY(s, vOf(latLon.lat))];
}

/** The kept badges, each with its medal once run, a hovered one larger. */
export function drawCourseBadges(s: MapSheet): void {
  const { mctx, keptCourses, options } = s;
  const sites = courseSitesOf(s);
  for (const kept of keptCourses) {
    const site = sites[kept.index];
    if (site === undefined) continue;
    const grow = s.hover?.kind === 'course' && s.hover.index === kept.index ? 1.3 : 1;
    traceCourseBadge(mctx, kept.x, kept.y, COURSE_BADGE * grow, site.kind, options.courseBest?.(site.key)?.medal ?? 0);
  }
}

/**
 * The course shown in the world: its line through every ring, faint and
 * dashed, a dot a ring, and the ring it waits for over them with what it is.
 */
export function drawShownCourse(s: MapSheet, course: MapCourse): void {
  const { mctx } = s;
  const rings = course.rings;
  if (rings.length > 1) {
    mctx.save();
    mctx.beginPath();
    let lastX = 0;
    for (let i = 0; i <= rings.length; i++) {
      if (i === rings.length && !course.site.loop) break;
      let [x, y] = onSheet(s, rings[i % rings.length]!.centre);
      // Across the seam, the line stays on the side it started on.
      if (i > 0) x -= Math.round((x - lastX) / s.S) * s.S;
      lastX = x;
      if (i === 0) mctx.moveTo(x, y);
      else mctx.lineTo(x, y);
    }
    mctx.lineJoin = 'round';
    mctx.lineCap = 'round';
    mctx.strokeStyle = ink;
    mctx.lineWidth = 5.5;
    mctx.stroke();
    mctx.setLineDash([7, 5]);
    mctx.strokeStyle = COURSE_GREEN;
    mctx.lineWidth = 3;
    mctx.stroke();
    mctx.restore();
    for (const ring of rings) {
      if (ring === course.next) continue;
      const [x, y] = onSheet(s, ring.centre);
      mctx.beginPath();
      mctx.arc(x, y, 3, 0, TAU);
      mctx.fillStyle = paper;
      mctx.fill();
      mctx.lineWidth = 1.5;
      mctx.strokeStyle = ink;
      mctx.stroke();
    }
  }
  const [x, y] = onSheet(s, course.next.centre);
  traceRingMark(mctx, x, y, COURSE_RING, course.finish);
  mctx.font = `800 12.5px ${FONT}`;
  mctx.textAlign = 'left';
  mctx.textBaseline = 'middle';
  const said = course.finish ? 'Finish' : course.running ? 'Next ring' : `Start · ${course.site.title}`;
  inkedText(mctx, said, x + COURSE_RING + 7, y, paper, ink, 4);
}
