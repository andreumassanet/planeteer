/**
 * Every headless suite, run a few at a time, with what each cost.
 *
 *   node scripts/checks.ts                 every suite, `--jobs` at once
 *   node scripts/checks.ts --changed       only the suites whose imports reach a changed file
 *   node scripts/checks.ts --changed main  the same against a branch or commit
 *   node scripts/checks.ts sea effects     only these
 *   node scripts/checks.ts --types         the three typechecks first
 *   node scripts/checks.ts --jobs 2        how many at once (default: half the cores, at most 4)
 *   node scripts/checks.ts --list          which suites would run, and why
 *
 * The suites are the `node scripts/check-*.ts` entries of package.json, less
 * those that need a relay or a browser. Which ones a change reaches is read
 * off each suite's own import graph, so nothing here lists files by hand; a
 * change outside the code (a bake in `public/`, the lockfile) runs them all.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Suites that need a running relay or a browser; `pnpm relay` and `pnpm browser` run them. */
const APART = new Set(['relay', 'ui', 'shot', 'graphics']);
/** What each suite cost last time, so the slowest start first and the pool does not end on one long suite. */
const TIMES = resolve(ROOT, 'node_modules/.cache/atlas-checks.json');

function readTimes(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(TIMES, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Changes that cannot break a headless suite. */
const INERT = /\.(md|txt)$|^docs\/|^\.github\/|^sheets\/|^prototypes\/|^README|^CREDITS|^LICENSE/;

interface Suite {
  name: string;
  script: string;
}

function suites(): Suite[] {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const out: Suite[] = [];
  for (const [name, command] of Object.entries(pkg.scripts)) {
    const match = /^node (scripts\/check-[\w-]+\.(?:ts|mjs))$/.exec(command);
    if (match !== null && !APART.has(name)) out.push({ name, script: match[1]! });
  }
  return out;
}

const IMPORT = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

/** Every file of the repo a script reaches through its relative imports, itself included. */
function closure(entry: string, known: Map<string, Set<string>>): Set<string> {
  const cached = known.get(entry);
  if (cached !== undefined) return cached;
  const seen = new Set<string>();
  const stack = [resolve(ROOT, entry)];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec === undefined || !spec.startsWith('.')) continue;
      const target = resolve(dirname(file), spec);
      for (const candidate of [target, `${target}.ts`, `${target}/index.ts`]) {
        if (existsSync(candidate) && !candidate.endsWith('/')) {
          stack.push(candidate);
          break;
        }
      }
    }
  }
  const files = new Set([...seen].map((file) => relative(ROOT, file)));
  known.set(entry, files);
  return files;
}

function changedFiles(base: string | null): string[] {
  const git = (...args: string[]): string[] =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((line) => line.length > 0);
  const files = new Set([...git('diff', '--name-only', 'HEAD'), ...git('ls-files', '--others', '--exclude-standard')]);
  if (base !== null) for (const file of git('diff', '--name-only', `${base}...HEAD`)) files.add(file);
  return [...files];
}

function parse(argv: readonly string[]) {
  const options = { changed: false, base: null as string | null, types: false, list: false, jobs: 0, only: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--changed') {
      options.changed = true;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && !suites().some((suite) => suite.name === next)) options.base = argv[++i]!;
    } else if (arg === '--types') options.types = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--jobs') options.jobs = Number(argv[++i]);
    else options.only.push(arg);
  }
  if (!(options.jobs > 0)) options.jobs = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
  return options;
}

interface Result {
  name: string;
  ok: boolean;
  seconds: number;
  output: string;
}

function run(name: string, command: string, args: readonly string[]): Promise<Result> {
  const began = performance.now();
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('close', (code) => done({ name, ok: code === 0, seconds: (performance.now() - began) / 1000, output }));
  });
}

async function pool<T>(jobs: number, tasks: readonly (() => Promise<T>)[], each: (result: T) => void): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const result = await tasks[next++]!();
      results.push(result);
      each(result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker));
  return results;
}

const line = (result: Result): string =>
  `${result.ok ? '  ok  ' : '  FAIL'} ${result.name.padEnd(12)} ${result.seconds.toFixed(1).padStart(6)} s`;

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  const all = suites();
  let chosen = options.only.length > 0 ? all.filter((suite) => options.only.includes(suite.name)) : all;
  const reasons = new Map<string, string>();
  if (options.changed) {
    const changed = changedFiles(options.base).filter((file) => !INERT.test(file));
    const code = (file: string): boolean => /^(src|scripts|server)\/.*\.(ts|mjs|js)$/.test(file);
    const outside = changed.filter((file) => !code(file));
    if (outside.length === 0) {
      const known = new Map<string, Set<string>>();
      chosen = chosen.filter((suite) => {
        const reach = closure(suite.script, known);
        const hit = changed.find((file) => reach.has(file));
        if (hit !== undefined) reasons.set(suite.name, hit);
        return hit !== undefined;
      });
    } else for (const suite of chosen) reasons.set(suite.name, `${outside[0]} (not code: every suite)`);
    console.log(`${changed.length} changed file${changed.length === 1 ? '' : 's'}; ${chosen.length} of ${all.length} suites reach them`);
  }
  if (options.list) {
    for (const suite of chosen) console.log(`  ${suite.name.padEnd(12)} ${reasons.get(suite.name) ?? ''}`);
    return;
  }
  const began = performance.now();
  const failed: Result[] = [];
  if (options.types) {
    const tsc = resolve(ROOT, 'node_modules/.bin/tsc');
    const types = await pool(options.jobs, [
      () => run('tsc src', tsc, ['--noEmit']),
      () => run('tsc scripts', tsc, ['--noEmit', '-p', 'tsconfig.scripts.json']),
      () => run('tsc server', tsc, ['--noEmit', '-p', 'server/tsconfig.json']),
    ], (result) => console.log(line(result)));
    failed.push(...types.filter((result) => !result.ok));
  }
  console.log(`${chosen.length} suites, ${options.jobs} at a time`);
  const times = readTimes();
  chosen.sort((a, b) => (times[b.name] ?? 60) - (times[a.name] ?? 60));
  const results = await pool(
    options.jobs,
    chosen.map((suite) => () => run(suite.name, process.execPath, [suite.script])),
    (result) => console.log(line(result)),
  );
  // A few suites time themselves against a bound, which a busy machine can miss: a failure runs again alone before it counts.
  for (const [index, result] of results.entries()) {
    if (result.ok) continue;
    const suite = chosen.find((candidate) => candidate.name === result.name)!;
    const again = await run(suite.name, process.execPath, [suite.script]);
    console.log(`${line(again)}  (again, alone)`);
    results[index] = again;
  }
  failed.push(...results.filter((result) => !result.ok));
  for (const result of results) times[result.name] = Math.round(result.seconds * 10) / 10;
  try {
    mkdirSync(dirname(TIMES), { recursive: true });
    writeFileSync(TIMES, JSON.stringify(times, null, 2));
  } catch {
    // Only the order of the next run depends on it.
  }
  for (const result of failed) {
    console.log(`\n--- ${result.name}: the last of its output\n${result.output.trimEnd().split('\n').slice(-40).join('\n')}`);
  }
  const total = results.reduce((sum, result) => sum + result.seconds, 0);
  console.log(`\n${failed.length === 0 ? 'all passed' : `${failed.length} failed`} in ${((performance.now() - began) / 1000).toFixed(1)} s (${total.toFixed(1)} s of suites)`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

await main();
