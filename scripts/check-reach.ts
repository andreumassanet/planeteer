/**
 * The render distance knob (`detail` in `view.ts`) against every streamer:
 * each reach and the haze must grow with the knob, never shrink, and stop at
 * the haze, at the altitudes the world is seen from (on foot, over a town, at
 * the cloud base, at cruise and at the ceiling). A clamp applied after the
 * knob, or a ceiling that binds everywhere, would make the setting do nothing.
 *
 * Also: the automatic knob (`sampleFrame`) moves only while it is on, and far
 * work is shared between streamers so none starves.
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
import { qualityFor } from '../src/grass.ts';

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

if (failures > 0) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
