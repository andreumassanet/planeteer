/**
 * The small life round the camera: fireflies over the grass on a summer
 * night, butterflies over a meadow by day, pollen in the sun, gulls over a
 * coast, a fish jumping off the shore, falling leaves and the litter under
 * the trees.
 *
 * Nothing is stored, streamed or random. The ground is cut into cells on a
 * fixed grid of the sphere; a cell is a pure function of its row and column
 * and each creature's seed is `hash3` of the cell and its own number, so
 * every arrival shows the same creatures in the same places.
 *
 * Three draw calls, none of them inked (the pen is screen space and would
 * swallow a wing): the lights are one additive `THREE.Points` gated by the
 * same terminator as the windows; the bodies (wings, leaves, fish, gulls) are
 * one mesh of loose triangles rewritten every frame; the litter is a mesh
 * rewritten only when the crowns in range change. Rain, snow, wind, cold and
 * storms quiet the creatures.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { latOf } from './sphere.ts';
import { proxyOf } from './warm.ts';
import { createBuffers, createWriter } from './ambient/buffers.ts';
import { createCells } from './ambient/cells.ts';
import {
  AIR_AUTUMN, AIR_BASE, FADE_FROM, FADE_IN, GULL_HIGH, GULL_RANGE, HIGH, HIGH_FADE, LEAF_RANGE, LITTER_ASKS,
  LITTER_BASE, LITTER_EVERY, LITTER_MAX, RANGE, RESCAN_EVERY, RESCAN_MOVE, WEATHER_EVERY,
} from './ambient/constants.ts';
import { createCreatures } from './ambient/creatures.ts';
import { createCrowns } from './ambient/crowns.ts';
import { autumnAt, clamp01, smooth } from './ambient/grid.ts';
import type {
  Ambient, AmbientContext, AmbientFrame, AmbientOptions, AmbientStats, AmbientWeather, Crown,
} from './ambient/types.ts';

export { CELL, GULL_CELL } from './ambient/constants.ts';
export { cellKey, columnLon, columnOf, columnsIn, rowLat, rowOf, autumnAt } from './ambient/grid.ts';
export type { Ambient, AmbientFrame, AmbientOptions, AmbientStats, AmbientWeather } from './ambient/types.ts';

/** How much of each creature the weather, the hour and the camera's height allow, 0 to 1. */
interface Strengths {
  fireflies: number;
  butterflies: number;
  motes: number;
  gulls: number;
  /** Fish jump in calm; trees' leaves and litter fade with the camera's height. */
  calm: number;
  high: number;
}

function strengthsOf(w: AmbientWeather, frame: AmbientFrame, stats: AmbientStats): Strengths {
  const { cameraHeight } = frame;
  const wet = clamp01(w.precipitation * 2.5);
  const cold = clamp01((w.temperatureC - 8) / 6);
  const windy = clamp01((w.wind.speed - 9) / 6);
  const snowing = w.snow > 0.3 && w.precipitation > 0.05 ? 1 : 0;
  const insects = (1 - wet) * (1 - w.storm) * cold * (1 - windy) * (1 - snowing) * (1 - clamp01(w.lying * 2));
  stats.quiet = insects > 0.5 ? '' : snowing ? 'snow' : wet > 0.5 ? 'rain' : cold < 0.5 ? 'cold' : windy > 0.5 ? 'wind' : 'storm';
  const high = 1 - smooth((cameraHeight - HIGH_FADE) / (HIGH - HIGH_FADE));
  const day = smooth((frame.daylight - 0.35) / 0.4);
  return {
    fireflies: insects * high * clamp01((w.temperatureC - 12) / 4),
    butterflies: insects * high * day * clamp01((w.temperatureC - 13) / 4),
    motes: insects * high * smooth((frame.daylight - 0.6) / 0.3) * (1 - clamp01(w.fog * 2)),
    gulls: (1 - smooth((w.storm - 0.3) / 0.4)) * (1 - smooth((w.precipitation - 0.5) / 0.4)) *
      smooth((frame.daylight - 0.15) / 0.3) * (1 - smooth((cameraHeight - 400) / (GULL_HIGH - 400))),
    calm: high * (1 - w.storm) * (1 - smooth((w.wind.speed - 10) / 8)),
    high,
  };
}

/** Marks a buffer's written range for upload. */
function flush(attributes: THREE.BufferAttribute[], count: number, perVertex: (a: THREE.BufferAttribute) => number): void {
  for (const attribute of attributes) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * perVertex(attribute));
    attribute.needsUpdate = true;
  }
}

export function createAmbient(options: AmbientOptions): Ambient {
  const admitPerFrame = options.admitPerFrame ?? 2;
  const stats: AmbientStats = {
    enabled: true, cells: 0, gullCells: 0, admitted: 0, fireflies: 0, motes: 0, butterflies: 0,
    leaves: 0, lying: 0, crowns: 0, litter: 0, groundAsks: 0, fish: 0, gulls: 0, calls: 0, quiet: '', autumn: 0, updateMs: 0,
  };
  const state = {
    lightCursor: 0, vertexCursor: 0, clock: 0, pending: false, scanId: 0, crownBudget: 0, litterAsks: 0,
    litterDirty: false, litterAge: Infinity, litterCount: 0, weatherAge: Infinity, sinceScan: Infinity,
  };
  const scratch = {
    point: new THREE.Vector3(), other: new THREE.Vector3(), forward: new THREE.Vector3(), right: new THREE.Vector3(),
    lift: new THREE.Vector3(), tipA: new THREE.Vector3(), tipB: new THREE.Vector3(), axisA: new THREE.Vector3(),
    axisB: new THREE.Vector3(), scanUp: new THREE.Vector3(),
  };
  const buffers = createBuffers();
  const ctx: AmbientContext = { options, admitPerFrame, stats, state, scratch, buffers, writer: createWriter(buffers, state) };
  const grid = createCells(ctx);
  const creatures = createCreatures(ctx, grid.anchorPoint);
  const crowns = createCrowns(ctx);
  const { group, lights, bodies, litter, lightGeometry, bodyGeometry, litterGeometry } = buffers;

  let enabled = true;
  const lastScan = new THREE.Vector3(Infinity, 0, 0);
  const weatherNow: AmbientWeather = { precipitation: 0, snow: 0, storm: 0, fog: 0, temperatureC: 15, lying: 0, wind: { speed: 0, from: 0 } };
  const playerUp = new THREE.Vector3();

  function hide(): void {
    lights.visible = false;
    bodies.visible = false;
    litter.visible = false;
    lightGeometry.setDrawRange(0, 0);
    bodyGeometry.setDrawRange(0, 0);
    litterGeometry.setDrawRange(0, 0);
    state.litterCount = 0;
    // Written again from the crowns when it shows.
    state.litterDirty = true;
    stats.fireflies = stats.motes = stats.butterflies = stats.leaves = stats.lying = stats.litter = stats.fish = stats.gulls = 0;
    stats.calls = 0;
  }

  function takeWeather(dt: number, weather: () => AmbientWeather): void {
    state.weatherAge += dt;
    if (state.weatherAge < WEATHER_EVERY) return;
    state.weatherAge = 0;
    const here = weather();
    weatherNow.precipitation = here.precipitation;
    weatherNow.snow = here.snow;
    weatherNow.storm = here.storm;
    weatherNow.fog = here.fog;
    weatherNow.temperatureC = here.temperatureC;
    weatherNow.lying = here.lying;
    weatherNow.wind.speed = here.wind.speed;
    weatherNow.wind.from = here.wind.from;
  }

  /** The scan: on a move or a clock, or while cells are still owed. */
  function rescan(dt: number, player: THREE.Vector3, cameraHeight: number): void {
    state.sinceScan += dt;
    if (!(state.pending || state.sinceScan > RESCAN_EVERY || lastScan.distanceToSquared(player) > RESCAN_MOVE * RESCAN_MOVE)) return;
    state.pending = false;
    state.sinceScan = 0;
    lastScan.copy(player);
    if (cameraHeight >= HIGH) {
      grid.active.length = 0;
      crowns.nearCrowns.length = 0;
    } else crowns.scanCrowns(player);
    state.litterDirty = true;
    grid.scan(player, cameraHeight < HIGH, admitPerFrame);
    grid.forget();
    crowns.forgetLandings();
  }

  /** Leaves and litter for this frame. */
  function writeLeaves(dt: number, season: number, high: number, litterWant: (crown: Crown) => number): void {
    const now = state.clock;
    const { nearCrowns } = crowns;
    if (nearCrowns.length > 0 && high > 0.01) {
      const air = AIR_BASE + AIR_AUTUMN * season;
      for (const crown of nearCrowns) {
        if (crown.distance > LEAF_RANGE) break;
        crowns.crownLeaves(crown, air, season, high, now);
      }
      state.litterAsks = LITTER_ASKS;
      crowns.askLitter(litterWant);
      // A crown still arriving is still fading in its litter.
      if (!state.litterDirty) for (const crown of nearCrowns) if (now - crown.born < FADE_IN) { state.litterDirty = true; break; }
    }
    state.litterAge += dt;
    if (state.litterDirty && state.litterAge >= LITTER_EVERY) {
      state.litterDirty = false;
      state.litterAge = 0;
      crowns.writeLitter(litterWant, season, high);
    }
    stats.litter = state.litterCount;
  }

  /** Uploads what this frame wrote and shows the meshes that hold anything. */
  function present(): void {
    const { lightCursor, vertexCursor } = state;
    lightGeometry.setDrawRange(0, lightCursor);
    bodyGeometry.setDrawRange(0, vertexCursor);
    lights.visible = lightCursor > 0;
    bodies.visible = vertexCursor > 0;
    if (lightCursor > 0) {
      flush(buffers.lightAttributes, lightCursor, (a) => a.itemSize);
      buffers.lightMat.uniforms.screenScale!.value = (typeof innerHeight === 'number' ? innerHeight : 900) * 0.5;
    }
    if (vertexCursor > 0) flush(buffers.bodyAttributes, vertexCursor, () => 3);
    stats.calls = (lights.visible ? 1 : 0) + (bodies.visible ? 1 : 0) + (litter.visible ? 1 : 0);
  }

  function update(dt: number, frame: AmbientFrame, weather: () => AmbientWeather): void {
    const began = performance.now();
    state.clock += dt;
    if (!enabled) return;
    const { player, cameraHeight } = frame;
    if (cameraHeight > GULL_HIGH) {
      hide();
      stats.updateMs = performance.now() - began;
      return;
    }

    takeWeather(dt, weather);
    rescan(dt, player, cameraHeight);
    stats.cells = grid.active.length;
    stats.crowns = crowns.nearCrowns.length;
    stats.gullCells = grid.activeGulls.length;

    const w = weatherNow;
    const strength = strengthsOf(w, frame, stats);
    const up = playerUp.copy(player).normalize();
    // The leaves' clocks run on the season alone, so a camera climbing moves none of them.
    const season = w.lying > 0.5 ? 0 : autumnAt(frame.time.getTime(), latOf(up.y));
    stats.autumn = Number(season.toFixed(2));
    // Litter by the season, and none under lying snow.
    const cover = 1 - clamp01(w.lying * 1.5);
    const litterWant = (crown: Crown): number =>
      Math.round(LITTER_MAX * crown.shed * (LITTER_BASE + (1 - LITTER_BASE) * season) * cover);

    stats.fireflies = stats.motes = stats.butterflies = stats.leaves = stats.lying = stats.fish = stats.gulls = 0;
    state.lightCursor = 0;
    state.vertexCursor = 0;
    const now = state.clock;
    for (const cell of grid.active) {
      const distance = cell.up.distanceTo(up) * PLANET_RADIUS;
      cell.fade = smooth((RANGE - distance) / (RANGE - FADE_FROM)) * smooth((now - cell.born) / FADE_IN);
      if (cell.fade <= 0) continue;
      if (cell.fireflies > 0 && strength.fireflies > 0.01) creatures.fireflies(cell, strength.fireflies);
      if (cell.motes > 0 && strength.motes > 0.01) creatures.motes(cell, strength.motes);
      if (cell.butterflies > 0 && strength.butterflies > 0.01) creatures.butterflies(cell, strength.butterflies);
      if (cell.fish) creatures.fish(cell, player, frame.afloat, strength.calm);
    }
    writeLeaves(dt, season, strength.high, litterWant);
    if (strength.gulls > 0.01) {
      for (const cell of grid.activeGulls) {
        const distance = cell.up.distanceTo(up) * PLANET_RADIUS;
        cell.fade = smooth((GULL_RANGE - distance) / (GULL_RANGE * 0.3)) * smooth((now - cell.born) / FADE_IN);
        creatures.gulls(cell, strength.gulls);
      }
    }
    present();
    stats.updateMs = performance.now() - began;
  }

  return {
    group,
    get enabled() {
      return enabled;
    },
    set enabled(on: boolean) {
      enabled = on;
      stats.enabled = on;
      if (!on) hide();
    },
    stats,
    update,
    snapshot() {
      const out: string[] = [];
      const fixed = (x: number): string => x.toFixed(3);
      const { lightPosition, lightKind, lightGlow, bodyPosition, litterPosition } = buffers;
      for (let i = 0; i < state.lightCursor; i++) {
        out.push(`${lightKind[i] === 0 ? 'firefly' : 'mote'} ${fixed(lightPosition[i * 3]!)} ${fixed(lightPosition[i * 3 + 1]!)} ${fixed(lightPosition[i * 3 + 2]!)} ${lightGlow[i]!.toFixed(3)}`);
      }
      for (let v = 0; v < state.vertexCursor; v++) {
        out.push(`body ${fixed(bodyPosition[v * 3]!)} ${fixed(bodyPosition[v * 3 + 1]!)} ${fixed(bodyPosition[v * 3 + 2]!)}`);
      }
      for (let v = 0; v < state.litterCount * 6; v++) {
        out.push(`litter ${fixed(litterPosition[v * 3]!)} ${fixed(litterPosition[v * 3 + 1]!)} ${fixed(litterPosition[v * 3 + 2]!)}`);
      }
      return out.sort();
    },
    proxies() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      geometry.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(1), 1));
      geometry.setAttribute('spot', new THREE.BufferAttribute(new Float32Array(1), 1));
      geometry.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(1), 1));
      return [new THREE.Points(geometry, buffers.lightMat), proxyOf(buffers.bodyMat), proxyOf(buffers.litterMat)];
    },
  };
}
