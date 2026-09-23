#!/usr/bin/env node
// Headless Chrome over CDP, using Node's built-in WebSocket client.
// node shot.mjs --url URL [--size 1600x900] [--timeout MS] [steps...]
// Steps, in order: --wait MS | --eval JS (awaits promises) | --shot FILE.png | --log
// CHROME_BIN can point to a Chrome or Chromium executable.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const url = opt('--url', 'about:blank');
const [w, h] = opt('--size', '1600x900').split('x').map(Number);
const timeout = Number(opt('--timeout', '120000'));
if (![w, h, timeout].every(value => Number.isSafeInteger(value) && value > 0)) {
  throw new Error('Size and timeout must be positive integers');
}

// Remove the profile after the browser stops writing, including on failure.
const profile = mkdtempSync(join(process.env.SHOT_PROFILE_DIR ?? tmpdir(), 'shot-'));
// On POSIX this Chrome leads a process group of its own, so the browser and
// every helper it started can be asked about and signalled together, and no
// other browser is. Windows ties the helpers to the browser with a job object.
const GROUP = process.platform !== 'win32';
let chrome, ws, watchdog, startupTimer;
const logs = [];
const pending = new Map();
const listeners = [];
let nextId = 0;

function rejectPending(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  if (ws?.readyState !== WebSocket.OPEN) return reject(new Error('Chrome connection is closed'));
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

async function run() {
  chrome = spawn(process.env.CHROME_BIN ?? 'google-chrome-stable', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--window-size=${w},${h}`, '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: GROUP });
  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    chrome.stderr.on('data', data => {
      stderr = (stderr + data).slice(-65536);
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    chrome.on('error', reject);
    chrome.on('exit', () => reject(new Error('Chrome exited\n' + stderr)));
    startupTimer = setTimeout(() => reject(new Error('No DevTools URL\n' + stderr)), 15000);
  }).finally(() => clearTimeout(startupTimer));

  ws = new WebSocket(wsUrl);
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const reply = pending.get(message.id);
    if (reply) {
      pending.delete(message.id);
      if (message.error) reply.reject(new Error(JSON.stringify(message.error)));
      else reply.resolve(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });
  ws.addEventListener('close', () => rejectPending(new Error('Chrome connection closed')));
  ws.addEventListener('error', () => rejectPending(new Error('Chrome connection failed')));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('Cannot connect to Chrome')), { once: true });
    ws.addEventListener('close', () => reject(new Error('Chrome closed before connecting')), { once: true });
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  const requests = new Map();
  listeners.push(message => {
    if (message.sessionId !== sessionId) return;
    const { method, params } = message;
    if (method === 'Network.requestWillBeSent') requests.set(params.requestId, params.request.url);
    // A request the page cancelled on purpose (a streamer dropping a fetch it
    // no longer wants) is not a failure, and is logged apart so no check reads
    // it as one.
    if (method === 'Network.loadingFailed') logs.push((params.canceled ? 'NETCANCEL ' : 'NETFAIL ') + (requests.get(params.requestId) ?? '?') + ' ' + params.errorText);
    if (method === 'Network.responseReceived' && params.response.status >= 400) logs.push('HTTP ' + params.response.status + ' ' + params.response.url);
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') requests.delete(params.requestId);
    if (method === 'Runtime.consoleAPICalled') logs.push(params.type + ': ' + params.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
    if (method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (params.exceptionDetails.exception?.description ?? params.exceptionDetails.text));
  });
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
  const loaded = new Promise(resolve => listeners.push(message => {
    if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') resolve();
  }));
  const navigation = await send('Page.navigate', { url }, sessionId);
  if (navigation.errorText) throw new Error('Navigation failed: ' + navigation.errorText);
  await loaded;

  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (['--url', '--size', '--timeout'].includes(argument)) { i++; continue; }
    if (argument === '--wait') {
      const ms = Number(args[++i]);
      if (!Number.isFinite(ms) || ms < 0) throw new Error('--wait needs a non-negative number');
      await new Promise(resolve => setTimeout(resolve, ms).unref());
    } else if (argument === '--eval') {
      const expression = args[++i];
      if (expression === undefined) throw new Error('--eval needs an expression');
      const result = await send('Runtime.evaluate', {
        expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true,
      }, sessionId);
      if (result.exceptionDetails) {
        throw new Error('EVAL ERROR ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
      }
      console.log(JSON.stringify(result.result.value) ?? 'null');
    } else if (argument === '--shot') {
      const file = args[++i];
      if (file === undefined) throw new Error('--shot needs a filename');
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      writeFileSync(file, Buffer.from(data, 'base64'));
      console.log('wrote', file);
    } else if (argument === '--log') {
      console.log(logs.join('\n'));
      logs.length = 0;
    } else {
      throw new Error('Unknown option: ' + argument);
    }
  }
}

/** Whether anything of this Chrome still runs: the browser, or on POSIX any helper in its group. */
function running() {
  if (!chrome?.pid) return false;
  if (!GROUP) return chrome.exitCode === null && chrome.signalCode === null;
  try {
    process.kill(-chrome.pid, 0);
    return true;
  } catch (error) {
    // ESRCH is an empty group. EPERM is a member that cannot be signalled,
    // which is still a member.
    return error.code === 'EPERM';
  }
}

function signal(name) {
  try {
    if (GROUP) process.kill(-chrome.pid, name);
    else chrome.kill(name);
  } catch {
    // Already gone.
  }
}

async function stopped(ms) {
  const end = Date.now() + ms;
  while (running()) {
    if (Date.now() >= end) return false;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return true;
}

/**
 * Closes this Chrome and waits until nothing of it is left to write into the
 * profile. Waiting for the browser's own process was not that: its helpers
 * could still be writing into `Default/` while the profile was removed, and
 * `rmSync` failed with ENOTEMPTY on a run that had passed. So the browser is
 * asked to close first, which stops the helpers and lets them flush, then the
 * whole group is terminated and finally killed if it does not go.
 */
async function closeChrome() {
  if (!chrome?.pid) return;
  if (running() && ws?.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ id: ++nextId, method: 'Browser.close' }));
    } catch {
      // The connection went as it was asked; the signals below still apply.
    }
  }
  if (await stopped(5000)) return;
  signal('SIGTERM');
  if (await stopped(3000)) return;
  signal('SIGKILL');
  if (!(await stopped(3000))) console.error(`warning: Chrome ${chrome.pid} is still running`);
}

/**
 * Removes the profile, retrying what a closing browser can still hold briefly.
 * A profile that cannot be removed is reported and not thrown: it is not the
 * run's result, and a run that passed used to exit 1 because of it.
 */
function removeProfile() {
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.error(`warning: the Chrome profile ${profile} could not be removed: ${error.message}`);
  }
}

let interrupt;
const interrupted = new Promise((_, reject) => { interrupt = reject; });
const onSignal = signal => {
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
  interrupt(new Error('Interrupted by ' + signal));
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);
try {
  await Promise.race([
    run(),
    interrupted,
    new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error(`Chrome timed out after ${timeout} ms`)), timeout); }),
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (logs.length) console.error(logs.join('\n'));
  process.exitCode ||= 1;
} finally {
  clearTimeout(watchdog);
  clearTimeout(startupTimer);
  rejectPending(new Error('Chrome driver stopped'));
  await closeChrome();
  ws?.close();
  removeProfile();
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
}
