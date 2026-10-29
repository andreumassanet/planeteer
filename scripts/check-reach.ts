/**
 * The render distance knob (`detail` in `view.ts`) against every streamer:
 * each reach and the haze must grow with the knob, never shrink, and stop at
 * the haze, at the altitudes the world is seen from (on foot, over a town, at
 * the cloud base, at cruise and at the ceiling). A clamp applied after the
 * knob, or a ceiling that binds everywhere, would make the setting do nothing.
 *
 * Also: the automatic knob (`sampleFrame`) moves only while it is on, and far
 * work is shared between streamers so none starves, and the grass's fields
 * keep up with a car on a frame the towns have already spent, and come back
 * after a flight.
 *
 * `pnpm reach`. Headless, under a second, nothing is built.
 */
import { readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DETAIL_DEFAULT, DETAIL_MAX, DETAIL_MIN, autoDetail, beginFrameBuild, clearHazeAt, detail, detailVersion, endFrameBuild, fogFar, horizonAt, mayBuild, sampleFrame, setAutoDetail, setDetail } from '../src/view.ts';
import { HAZE_RADIUS } from '../src/globe.ts';
import { ROAD_CLASSES, classReaches, reachFor as roadReach } from '../src/roads.ts';
import { reachFor as landmarkReach } from '../src/placement.ts';
import { moverReach } from '../src/life.ts';
import { createGrass, qualityFor } from '../src/grass.ts';
import type { GrassGround, GrassSite } from '../src/vegetation.ts';
import { PerspectiveCamera, Vector3 } from 'three';

// The towns and the wood import the part registries, each an eager
// `import.meta.glob` (a Vite transform). This hook rewrites it into the static
// imports Vite would produce, so the modules load under Node.
const here = dirname(fileURLToPath(import.meta.url));
{
  const registries = ['/src/scenery/index.ts', '/src/traffic/index.ts', '/src/fauna/index.ts'];
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      const registry = registries.find((end) => url.endsWith(end));
      if (registry === undefined) return result;
      const parts = resolve(here, `..${registry.replace('/index.ts', '')}/parts`);
      const files = readdirSync(parts).filter((file) => file.endsWith('.ts')).sort();
      const imports = files.map((file, i) => `import * as part${i} from './parts/${file}';`).join('\n');
      const table = `{ ${files.map((file, i) => `'./parts/${file}': part${i}`).join(', ')} }`;
      const text = String(result.source);
      const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\('\.\/parts\/\*\.ts', \{ eager: true \}\)/;
      if (!glob.test(text)) throw new Error(`check-reach: ${registry} no longer reads its parts the way this shim rewrites`);
      return { ...result, source: `${imports}\n${text.replace(glob, table)}` };
    },
  });
}
const { reachFor: townReach } = await import('../src/settlements.ts');
const { reachFor: woodReach, budgetCapped: woodCapped } = await import('../src/vegetation.ts');

let failures = 0;
const check = (ok: boolean, label: string, note = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  ${note}` : ''}`);
};

/** The knob's own steps, `[` and `]`: a quarter of itself each way, end to end. */
const steps: number[] = [];
for (let d = DETAIL_MIN; d < DETAIL_MAX * 1.0001; d *= 1.25) steps.push(Math.min(DETAIL_MAX, d));
if (steps[steps.length - 1]! < DETAIL_MAX) steps.push(DETAIL_MAX);

/** The altitudes the world is handed: on foot (`STREAM_FLOOR`), low, the cloud base, the cruise, the ceiling. */
const ALTITUDES = [20, 150, 1000, 1500, 3000];

const GRASS_RANK = { low: 0, medium: 1, high: 2 } as const;
const classes: number[] = [];

type Series = Record<string, number[]>;

function sweep(altitude: number): Series {
  const series: Series = {};
  const put = (name: string, value: number): void => {
    (series[name] ??= []).push(value);
  };
  for (const d of steps) {
    setDetail(d);
    put('haze', fogFar(altitude, HAZE_RADIUS));
    put('towns', townReach(altitude));
    put('wood', woodReach(altitude));
    put('roads', roadReach(altitude));
    classReaches(classes);
    ROAD_CLASSES.forEach((road, i) => put(`road class ${road.name}`, classes[i]!));
    put('landmarks', landmarkReach(altitude));
    for (const family of ['road', 'water', 'foot', 'air', 'herd'] as const) put(`movers ${family}`, moverReach(family, altitude));
    put('grass', GRASS_RANK[qualityFor(detail())]);
  }
  return series;
}

console.log(`the knob, ${steps.length} steps from ${DETAIL_MIN} to ${DETAIL_MAX}:`);
const wasAuto = autoDetail();
for (const altitude of ALTITUDES) {
  const series = sweep(altitude);
  const lines: string[] = [];
  for (const [name, values] of Object.entries(series)) {
    // Never smaller for a larger setting.
    let shrank = -1;
    for (let k = 1; k < values.length; k++) if (values[k]! < values[k - 1]! - 1e-6) shrank = k;
    check(shrank < 0, `${name} at ${altitude} grows with the knob`, shrank < 0 ? '' : `${values[shrank - 1]!.toFixed(1)} at ${steps[shrank - 1]!.toFixed(2)} -> ${values[shrank]!.toFixed(1)} at ${steps[shrank]!.toFixed(2)}`);
    // And a real change end to end, unless a family is switched off at this
    // height by its own ceiling (cars seen from 3,000 up).
    const first = values[0]!;
    const last = values[values.length - 1]!;
    if (last > 0 && name !== 'grass') check(last > first * 1.5, `${name} at ${altitude} moves across the range`, `${first.toFixed(0)} -> ${last.toFixed(0)}`);
    lines.push(`${name.padEnd(22)} ${values.map((v) => (name === 'grass' ? String(v) : v.toFixed(0))).join(' ')}`);
  }
  // Nothing reaches past the haze except a road class, which is measured from
  // the eye (`classReaches` in `roads.ts`).
  for (const [name, values] of Object.entries(series)) {
    if (name === 'haze' || name === 'grass' || name.startsWith('road class')) continue;
    const over = values.findIndex((v, k) => v > series.haze![k]! * 1.1 + 1e-6);
    check(over < 0, `${name} at ${altitude} stops at the haze`, over < 0 ? '' : `${values[over]!.toFixed(0)} against ${series.haze![over]!.toFixed(0)} at ${steps[over]!.toFixed(2)}`);
  }
  // The haze moves in proportion to the knob, and at the default equals the
  // haze the world is tuned for (`detailFog`).
  {
    const haze = series.haze!;
    const worst = Math.max(...haze.map((h, k) => Math.abs(h / haze[0]! - steps[k]! / steps[0]!) / (steps[k]! / steps[0]!)));
    check(worst < 1e-6, `the haze at ${altitude} follows the knob in proportion`, `worst ${(worst * 100).toFixed(4)}%`);
    setDetail(DETAIL_DEFAULT);
    const atDefault = fogFar(altitude, HAZE_RADIUS);
    const tuned = horizonAt(altitude, HAZE_RADIUS) * (1.35 + (altitude / HAZE_RADIUS) * 6) * Math.sqrt(DETAIL_DEFAULT);
    check(Math.abs(atDefault - tuned) < 1e-6 * tuned, `the haze at ${altitude} at the default is the one the world was tuned under`, `${atDefault.toFixed(0)} against ${tuned.toFixed(0)}`);
  }
  if (process.argv.includes('--table')) console.log(`    altitude ${altitude}\n      ${lines.join('\n      ')}`);
}

console.log('the top of the knob:');
{
  setDetail(DETAIL_MAX);
  check(!woodCapped(), 'the wood\'s memory ceiling does not bind under the top of the slider');
  setDetail(DETAIL_MAX * 1.2);
  check(detail() === DETAIL_MAX, 'and nothing past the top is taken');
  // The distance the settings card says, on foot in clear air.
  check(Math.abs(clearHazeAt(DETAIL_DEFAULT, HAZE_RADIUS) - (setDetail(DETAIL_DEFAULT), fogFar(20, HAZE_RADIUS))) < 1e-6, 'the card\'s distance is the haze on foot');
  console.log(`    on foot: ${steps.map((d) => `${d.toFixed(2)}x ${clearHazeAt(d, HAZE_RADIUS).toFixed(0)}`).join(', ')}`);
}

console.log('the hand on the knob:');
{
  // The automatic knob reads `performance.now`; a fake clock runs minutes of frames instantly.
  let clock = 0;
  const realNow = performance.now.bind(performance);
  performance.now = (): number => clock;
  /** Frames at a fixed interval and work, for a span of simulated milliseconds. */
  const frames = (interval: number, work: number, span: number): void => {
    for (const end = clock + span; clock < end; ) {
      clock += interval;
      sampleFrame(interval, work);
    }
  };
  try {
    const before = detailVersion();
    setDetail(1.6);
    check(detailVersion() !== before, 'a setting changed by hand is announced to the streamers');
    check(!autoDetail(), 'a setting changed by hand turns the automatic knob off');
    // Half a minute of dropped frames, enough to step an automatic knob down several times.
    frames(16.7, 4, 1000);
    frames(45, 30, 30_000);
    check(detail() === 1.6, 'and the frames do not move it afterwards', `${detail()}`);
    // Half a minute of headroom, enough to step it up.
    frames(16.7, 2, 30_000);
    check(detail() === 1.6, 'nor does headroom', `${detail()}`);

    setAutoDetail(true);
    frames(16.7, 4, 6000);
    frames(45, 30, 30_000);
    check(detail() < 1.6, 'given back, the automatic knob steps down when frames drop', `${detail().toFixed(2)}`);
    const low = detail();
    frames(16.7, 2, 150_000);
    check(detail() > low, 'and up when there is room', `${low.toFixed(2)} -> ${detail().toFixed(2)}`);
    setDetail(0.7);
    frames(45, 30, 30_000);
    check(detail() === 0.7 && !autoDetail(), 'taken again, it stays where it was put', `${detail()}`);
  } finally {
    performance.now = realNow;
    setAutoDetail(wasAuto);
  }
}

console.log('the far work, from a plane:');
{
  // Three streamers with endless far work, in frame order, as seen from a
  // plane: expensive town builds (10 ms), cheap roads, wood in between, each
  // under its own slice. Turn-taking must let all three build.
  let clock = 0;
  const realNow = performance.now.bind(performance);
  performance.now = (): number => clock;
  const built = { towns: 0, roads: 0, wood: 0 };
  let spent = 0;
  const FRAMES = 600;
  try {
    const serve = (who: keyof typeof built, share: number, cost: number): void => {
      const began = clock;
      while (mayBuild(began, share, false, who)) {
        clock += cost;
        built[who]++;
      }
      clock += 0.5;
    };
    for (let frame = 0; frame < FRAMES; frame++) {
      clock += 16.7;
      const began = clock;
      beginFrameBuild();
      serve('towns', 3.5, 10);
      serve('roads', 3, 1.5);
      serve('wood', 2.5, 3);
      endFrameBuild();
      spent += clock - began;
    }
  } finally {
    performance.now = realNow;
  }
  const counts = Object.values(built);
  check(built.roads > 0 && built.wood > 0, 'every streamer with far work builds some', `towns ${built.towns}, roads ${built.roads}, wood ${built.wood}`);
  // Turns, not equal shares: a cheap build fits more of them into a turn.
  check(Math.min(...counts) * 20 >= Math.max(...counts), 'and none is starved by another', JSON.stringify(built));
  check(spent / FRAMES < 9, 'and the frame pays about its far share on average', `${(spent / FRAMES).toFixed(1)} ms a frame`);
}

console.log('the grass, from a car:');
{
  // The grass's bake on a fake clock against a ground that costs what the
  // real one does (`pnpm seated` measures it: about 4.5 microseconds a texel),
  // a land index that follows the player as `land-probe.ts`'s does (a centre
  // gathered a few frames after the player has gone `MOVE` from the old one,
  // answering within `REACH` of it), and a frame the towns have spent before
  // the grass is served.
  const R = HAZE_RADIUS;
  const TEXEL_MS = 0.0045;
  const GATHER_MS = 0.05;
  const PROBE_REACH = 1600;
  const PROBE_MOVE = 400;
  const PROBE_FRAMES = 6;
  let clock = 0;
  const realNow = performance.now.bind(performance);
  const wasAuto = autoDetail();
  const wasDetail = detail();
  performance.now = (): number => clock;
  try {
    setDetail(DETAIL_DEFAULT);
    let centre = new Vector3(1, 0, 0);
    let gathering: Vector3 | null = null;
    let wait = 0;
    const prepare = (at: Vector3): void => {
      const direction = at.clone().normalize();
      if (gathering === null && centre.distanceTo(direction) * R > PROBE_MOVE) {
        gathering = direction;
        wait = PROBE_FRAMES;
      }
      if (gathering !== null && --wait <= 0) {
        centre = gathering;
        gathering = null;
      }
    };
    const ground: GrassGround = {
      covers: (direction) => direction.dot(centre) >= Math.cos(PROBE_REACH / R),
      gather: () => {
        clock += GATHER_MS;
      },
      at: (_direction, out: GrassSite) => {
        clock += TEXEL_MS;
        Object.assign(out, { radius: R + 1, density: 1, r: 0.3, g: 0.6, b: 0.2, dry: 0, height: 1, edge: 1000 });
        return out;
      },
      floorChanges: (since) => since,
      version: () => 0,
    };
    const grass = createGrass(ground, { radius: R });
    const camera = new PerspectiveCamera();
    const player = new Vector3();
    const axis = new Vector3(0, 0.3, 1).normalize();
    let travelled = 0;
    /** Drives `seconds` at `speed` units a second, `fps` frames a second; the camera `height` over the ground. Frames over bare ground, and the longest run of them. */
    const drive = (seconds: number, speed: number, fps: number, height: number): { bare: number; frames: number; longest: number } => {
      let bare = 0;
      let run = 0;
      let longest = 0;
      const frames = Math.round(seconds * fps);
      for (let frame = 0; frame < frames; frame++) {
        const start = clock;
        travelled += speed / fps;
        player.set(1, 0, 0).applyAxisAngle(axis, travelled / R).multiplyScalar(R + 1);
        camera.position.copy(player).multiplyScalar((R + height) / (R + 1));
        camera.updateMatrixWorld(true);
        beginFrameBuild();
        // The towns and the wood ahead of the grass have spent the frame.
        clock += 9;
        // The index is gathered only while the camera is low (`vegetation/land.ts`).
        if (height < 900) prepare(player);
        grass.update({ camera, player, press: null, height, wind: { speed: 2, from: 0 }, hidden: false });
        endFrameBuild();
        clock = Math.max(clock, start + 1000 / fps);
        if (grass.stats.visible && grass.stats.underfoot === 'none') {
          bare++;
          longest = Math.max(longest, ++run);
        } else run = 0;
      }
      return { bare, frames, longest };
    };
    drive(8, 0, 30, 10);
    check(grass.stats.underfoot === 'fine', 'standing still, the fine field stands under the camera', `${grass.stats.underfoot}, ${grass.stats.pending} texels pending`);
    for (const [speed, fps] of [[45, 60], [75, 30], [110, 60]] as const) {
      const { bare, frames, longest } = drive(120, speed, fps, 10);
      check(
        bare <= frames * 0.02 && longest <= fps,
        `at ${speed} units a second and ${fps} fps, there is grass round the camera`,
        `${bare} of ${frames} frames bare, the longest ${(longest / fps).toFixed(1)} s, ${Math.round(travelled)} units driven`,
      );
    }
    // Up out of the grass's reach and across the country, then down again:
    // nothing baked up there may hold the bake once it is low.
    // Taken off while a layer round a new anchor is half laid (it is laid
    // `FRAME_REACH`, 1,500 units, from the last), and down short of the
    // distance that drops every layer.
    drive(6, 0, 60, 10);
    travelled = 0;
    drive(1510 / 20, 20, 60, 10);
    drive(1480 / 150, 150, 60, 1500);
    const back = drive(8, 20, 60, 10);
    check(back.longest <= 3 * 60 && grass.stats.underfoot !== 'none', 'after a flight the grass stands round the camera again', `bare for ${(back.longest / 60).toFixed(1)} s`);
    drive(6, 0, 30, 10);
    check(grass.stats.underfoot === 'fine', 'and stopped, the fine field again', grass.stats.underfoot);
  } finally {
    performance.now = realNow;
    setDetail(wasDetail);
    setAutoDetail(wasAuto);
  }
}

if (failures > 0) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
