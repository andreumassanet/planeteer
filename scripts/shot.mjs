#!/usr/bin/env node
// Headless-Chrome screenshot driver over CDP (Node 24 has a WebSocket client).
//   node shot.mjs --url URL [--size 1600x900] [steps...]
// steps, in order:  --wait MS | --eval JS (awaits promises) | --shot FILE.png | --log
// Prints eval results as JSON. Keeps one Chrome per run.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const url = opt('--url', 'about:blank');
const [w, h] = opt('--size', '1600x900').split('x').map(Number);
// A Chrome profile is ~170 MB and /tmp is a tmpfs in RAM: 75 leaked ones once filled
// it and took every shell down with it. Made under the scratchpad when there is one,
// and removed on the way out whatever happens.
const profile = mkdtempSync(join(process.env.CLAUDE_SCRATCHPAD ?? tmpdir(), 'shot-'));
const cleanup = () => { try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); }); process.on('SIGTERM', () => { cleanup(); process.exit(143); });
const chrome = spawn('google-chrome-stable', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  `--window-size=${w},${h}`, '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]);
  });
  chrome.on('exit', () => reject(new Error('chrome exited\n' + buf)));
  setTimeout(() => reject(new Error('no devtools url\n' + buf)), 15000);
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const listeners = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else for (const l of listeners) l(msg);
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, (m) => m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result));
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
const reqs = new Map();
listeners.push((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed') logs.push('NETFAIL ' + (reqs.get(m.params.requestId) ?? '?').replace(url, '') + ' ' + m.params.errorText + (m.params.canceled ? ' (canceled)' : ''));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) logs.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url.replace(url, ''));
});
const logs = [];
listeners.push((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
});
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
const loaded = new Promise((r) => listeners.push((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired' && r()));
await send('Page.navigate', { url }, sessionId);
await loaded;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--wait') { await sleep(Number(args[++i])); }
  else if (a === '--eval') {
    const expression = args[++i];
    const r = await send('Runtime.evaluate', { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true }, sessionId);
    console.log(r.exceptionDetails ? 'EVAL ERROR ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) : JSON.stringify(r.result.value));
  }
  else if (a === '--shot') {
    const file = args[++i];
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(file, Buffer.from(data, 'base64')); console.log('wrote', file);
  }
  else if (a === '--log') { console.log(logs.join('\n')); logs.length = 0; }
}
ws.close(); chrome.kill(); await new Promise((r) => chrome.on('exit', r)); cleanup();
