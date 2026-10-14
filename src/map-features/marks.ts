import { PAD_RADIUS } from '../rocket.ts';
import { FIELD_SPREAD } from '../fleet.ts';
import { STRIP_DRAWN, stripCorners } from '../craft/airstrip.ts';
import { planShape } from '../landmark-ground.ts';
import type { TileView } from '../map-tiles.ts';
import type * as THREE from 'three';
import type { Raster } from '../raster.ts';
import { unitAt } from '../sphere.ts';
import { INK, LANDMARK_CORE, LANDMARK_FILL, PAD_FILL, PAD_MARK, STRIP_FILL, STRIP_SLICE_MS, inkWidth } from './constants.ts';
import { type FeatureCtx, frameAt, localBox, localCorners } from './context.ts';

/** Landmarks' plans, strips and rocket pads. */

export function paintLandmarks(f: FeatureCtx, view: TileView, raster: Raster): void {
  const { sources, p, affine, xs, ys, frameAcross, frameNorth, landmarkUp } = f;
  for (const landmark of sources.landmarks ?? []) {
    if (landmark.lat < view.south - 0.3 || landmark.lat > view.north + 0.3) continue;
    view.px(landmark.lat, landmark.lon, p);
    if (!view.inside(p.x, p.y, 120 / view.unitsPerPixel)) continue;
    const shape = planShape(landmark);
    unitAt(landmark.lat, landmark.lon, landmarkUp);
    frameAt(f, landmarkUp);
    view.frame(landmarkUp, frameAcross, frameNorth, affine);
    // The plan box, trimmed to the footprint's disc where the disc is tighter.
    const hx = Math.min(shape.hx, shape.radius);
    const hz = Math.min(shape.hz, shape.radius);
    const ink = Math.max(0.6, inkWidth(view.z));
    localCorners(f, affine, shape.cx, shape.cz, 1, 0, hx, hz);
    raster.outline(xs, ys, 4, ink);
    raster.fill(...INK);
    localBox(raster, affine, shape.cx, shape.cz, 1, 0, hx, hz);
    raster.fill(...LANDMARK_FILL);
    // And what stands on it, as the darker heart of the plan.
    localBox(raster, affine, shape.cx, shape.cz, 1, 0, hx * 0.62, hz * 0.62);
    raster.fill(...LANDMARK_CORE);
  }
}

export function tileReach(f: FeatureCtx, view: TileView): number {
  const { unit, centre } = f;
  const midLat = (view.south + view.north) / 2;
  unitAt(midLat, (view.west + view.east) / 2, centre);
  unitAt(view.north, view.west, unit);
  return centre.angleTo(unit) * view.radius * 1.05 + 60;
}

export function* paintStrips(f: FeatureCtx, view: TileView, raster: Raster): Generator<'wait' | undefined, void, void> {
  const { sources, p, xs, ys, corners, centre } = f;
  if (sources.planesNear === undefined) return;
  const reach = tileReach(f, view);
  if (sources.stripsReady !== undefined) {
    // A slice of the search a step; it keeps what it found between steps.
    for (;;) {
      const until = performance.now() + STRIP_SLICE_MS;
      if (sources.stripsReady(centre, reach + FIELD_SPREAD, () => performance.now() < until)) break;
      yield;
      tileReach(f, view);
    }
  }
  for (const site of sources.planesNear(centre, reach, [])) {
    stripCorners(site, STRIP_DRAWN / 2, corners);
    xs.length = 0;
    ys.length = 0;
    for (const corner of corners) {
      view.at(corner, p);
      xs.push(p.x);
      ys.push(p.y);
    }
    raster.outline(xs, ys, 4, Math.max(0.5, inkWidth(view.z)));
    raster.fill(...INK, 0.8);
    raster.moveTo(xs[0]!, ys[0]!);
    for (let k = 1; k < 4; k++) raster.lineTo(xs[k]!, ys[k]!);
    raster.fill(...STRIP_FILL);
  }
}

export function* paintPads(f: FeatureCtx, view: TileView, raster: Raster): Generator<'wait' | undefined, void, void> {
  const { sources, p, centre } = f;
  if (sources.pads === undefined) return;
  const reach = tileReach(f, view);
  const found: { at: THREE.Vector3 }[] = [];
  for (;;) {
    found.length = 0;
    if (sources.pads(centre, reach, found)) break;
    if (view.hurry) {
      view.incomplete = true;
      break;
    }
    yield 'wait';
    tileReach(f, view);
  }
  const r = Math.max(1.5, PAD_RADIUS / view.unitsPerPixel);
  for (const pad of found) {
    view.at(pad.at, p);
    if (!view.inside(p.x, p.y, r + 2)) continue;
    raster.circle(p.x, p.y, r + Math.max(0.6, inkWidth(view.z)));
    raster.fill(...INK);
    raster.circle(p.x, p.y, r);
    raster.fill(...PAD_FILL);
    raster.circle(p.x, p.y, r * 0.38);
    raster.fill(...PAD_MARK);
  }
}
