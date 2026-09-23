// Exercise the real browser driver's exit codes and temporary-profile cleanup.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const driver = fileURLToPath(new URL('./shot.mjs', import.meta.url));
const execute = promisify(execFile);

async function withProfiles(run) {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-shot-check-'));
  const env = { ...process.env, SHOT_PROFILE_DIR: directory };
  try {
    await run(env);
    assert.deepEqual(readdirSync(directory), [], 'Chrome profiles must be removed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a successful evaluation exits cleanly', () => withProfiles(async env => {
  const { stdout } = await execute(process.execPath, [driver, '--eval', 'Promise.resolve(42)'], { env, timeout: 20000 });
  assert.equal(stdout.trim(), '42');
}));

test('an evaluation error fails the command', () => withProfiles(async env => {
  await assert.rejects(
    execute(process.execPath, [driver, '--eval', 'Promise.reject(new Error("intentional failure"))'], { env, timeout: 20000 }),
    error => error.code === 1 && /EVAL ERROR.*intentional failure/.test(error.stderr),
  );
}));

test('a missing browser reports the launch error and cleans its profile', () => withProfiles(async env => {
  await assert.rejects(
    execute(process.execPath, [driver], { env: { ...env, CHROME_BIN: join(env.SHOT_PROFILE_DIR, 'missing-browser') }, timeout: 5000 }),
    error => error.code === 1 && /ENOENT/.test(error.stderr),
  );
}));

test('a stalled evaluation times out and closes Chrome', () => withProfiles(async env => {
  await assert.rejects(
    execute(process.execPath, [driver, '--timeout', '3000', '--eval', 'new Promise(() => {})'], { env, timeout: 10000 }),
    error => error.code === 1 && /timed out after 3000 ms/.test(error.stderr),
  );
}));

// Windows has no POSIX signals: `kill('SIGTERM')` ends the driver outright,
// before it can close anything, so there is nothing of the driver's to test.
const posix = process.platform === 'win32' ? { skip: 'POSIX signals only' } : {};

test('SIGTERM stops the browser and removes its profile', posix, () => withProfiles(async env => {
  const child = spawn(process.execPath, [driver, '--eval', '"ready"', '--wait', '60000'], {
    env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let sent = false;
  child.stdout.on('data', data => {
    output += data;
    if (!sent && output.includes('"ready"')) {
      sent = true;
      child.kill('SIGTERM');
    }
  });
  const safety = setTimeout(() => child.kill('SIGTERM'), 15000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(sent, true, 'browser reached the evaluation');
    assert.equal(code, 143);
  } finally {
    clearTimeout(safety);
  }
}));
