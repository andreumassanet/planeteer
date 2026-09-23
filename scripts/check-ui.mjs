// Browser regressions for controls and overlays, without building the 3D world.
// Starts its own Vite server; Chrome/Chromium is selected by CHROME_BIN.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

async function check() {
  const [{ createInput }, { createSettings }, { createWorldMap }, { inputBlocked }, { createHud }, { notice, noticeOpen }] = await Promise.all([
    import('/src/input.ts'), import('/src/settings.ts'), import('/src/map.ts'), import('/src/controls.ts'),
    import('/src/hud.ts'), import('/src/notice.ts'),
  ]);
  const ensure = (ok, message) => { if (!ok) throw new Error(message); };
  const checks = [];
  const failures = [];
  const test = (name, run) => {
    try { run(); checks.push(name); }
    catch (error) { failures.push(`${name}: ${error.message}`); }
  };
  // The notice is written into `index.html`'s own markup, so it is tested on it.
  const page = new DOMParser().parseFromString(await (await fetch('/index.html')).text(), 'text/html');
  const noticeCard = document.importNode(page.getElementById('notice'), true);
  document.body.append(noticeCard);
  const key = (target, type, code, extra = {}) => {
    const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event);
    return event;
  };
  const canvas = document.createElement('canvas');
  const opener = document.createElement('button');
  const field = document.createElement('textarea');
  const editor = document.createElement('div');
  editor.contentEditable = 'plaintext-only';
  document.body.append(canvas, opener, field, editor);
  const input = createInput(canvas);
  const knob = () => ({ get: () => 1, set: value => value, min: 0.25, max: 6 });
  const toggle = () => ({ get: () => true, set: value => value });
  const settings = createSettings({
    detail: knob(), sensitivity: knob(), flags: toggle(), performance: toggle(), hints: toggle(),
    resolution: { get: () => 'auto', set: value => value, options: [['auto', 'Auto']] },
    lockTarget: canvas,
  });
  const map = createWorldMap({ countries: [] }, {
    monuments: [], isVisited: () => false, target: () => null,
    onChoose() {}, onClear() {}, lockTarget: canvas,
  });
  document.body.append(settings.root, map.root);
  try {
    test('focusing a field releases held movement', () => {
      opener.focus();
      key(window, 'keydown', 'KeyW');
      ensure(input.state.move.y === 1, 'movement starts');
      field.focus();
      ensure(input.state.move.y === 0, 'movement stops in a text field');
      key(field, 'keyup', 'KeyW');
    });
    test('plaintext editors keep their keys', () => {
      editor.focus();
      ensure(inputBlocked(), 'plaintext-only contenteditable is blocked');
      ensure(!key(editor, 'keydown', 'Space').defaultPrevented, 'Space keeps its native behaviour');
      ensure(!key(editor, 'keyup', 'Space').defaultPrevented, 'Space release keeps its native behaviour');
    });
    test('map shortcut leaves text and IME composition alone', () => {
      field.focus();
      ensure(!key(field, 'keydown', 'KeyM').defaultPrevented, 'typing M is not cancelled');
      ensure(!map.open, 'typing M does not open the map');
      opener.focus();
      key(window, 'keydown', 'KeyM', { isComposing: true });
      ensure(!map.open, 'IME composition does not open the map');
    });
    test('settings stop held movement and keep Tab inside the dialog', () => {
      opener.focus();
      key(window, 'keydown', 'KeyW');
      settings.show();
      ensure(input.state.move.y === 0, 'held W stops on opening settings');
      const controls = [...settings.root.querySelectorAll('button, input, a[href]')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      ensure(document.activeElement === first, 'opening focuses the close button immediately');
      first.focus();
      ensure(key(first, 'keydown', 'Tab', { shiftKey: true }).defaultPrevented, 'Shift+Tab is wrapped');
      ensure(document.activeElement === last, 'Shift+Tab focuses last control');
      ensure(key(last, 'keydown', 'Tab').defaultPrevented, 'Tab is wrapped');
      ensure(document.activeElement === first, 'Tab focuses first control');
      ensure(!key(first, 'keyup', 'Space').defaultPrevented, 'buttons retain Space activation');
      settings.hide();
      ensure(document.activeElement === opener, 'closing restores the opening control');
      key(window, 'keyup', 'KeyW');
    });
    for (const [name, request] of [
      ['missing', undefined],
      ['throwing', () => { throw new Error('Pointer lock denied'); }],
      ['rejecting', () => Promise.reject(new Error('Pointer lock denied'))],
    ]) {
      test(`map closes with ${name} pointer lock`, () => {
        canvas.requestPointerLock = request;
        map.show();
        map.hide();
        ensure(!map.open, 'map is closed');
      });
      test(`settings close with ${name} pointer lock`, () => {
        const pointer = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
        const exit = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
        let locked = canvas;
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
        Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: () => { locked = null; } });
        try {
          settings.show();
          settings.hide();
          ensure(!settings.open, 'settings are closed');
        } finally {
          if (pointer) Object.defineProperty(document, 'pointerLockElement', pointer);
          else delete document.pointerLockElement;
          if (exit) Object.defineProperty(document, 'exitPointerLock', exit);
          else delete document.exitPointerLock;
        }
      });
    }
    test('the welcome card keeps Tab inside and gives the focus back to the world', () => {
      const hud = createHud({ countries: [] });
      document.body.append(hud.root);
      try {
        void hud.welcome(3);
        const go = hud.root.querySelector('.atlas-welcome-go');
        ensure(document.activeElement === go, 'opening focuses Start exploring');
        ensure(key(go, 'keydown', 'Tab').defaultPrevented && document.activeElement === go, 'Tab stays on the card');
        ensure(key(go, 'keydown', 'Tab', { shiftKey: true }).defaultPrevented && document.activeElement === go, 'Shift+Tab stays on the card');
        opener.focus();
        key(opener, 'keydown', 'Tab');
        ensure(document.activeElement === go, 'a focus that got behind the card is brought back onto it');
        key(go, 'keydown', 'Escape');
        ensure(!hud.welcoming, 'Escape closes it');
        ensure(document.activeElement === document.body, 'and the focus goes back to the world');
      } finally {
        // A card left up holds every key the tests after this one send.
        if (hud.welcoming) key(document.body, 'keydown', 'Escape');
        hud.root.remove();
      }
    });
    test('a notice keeps Tab inside, over a card that is open under it', () => {
      let ran = 0;
      settings.show();
      try {
        notice('Something went wrong', 'A check.', [{ label: 'Later', run() {} }, { label: 'Reload', primary: true, run() { ran++; } }]);
        const [later, reload] = [...noticeCard.querySelectorAll('button')];
        ensure(noticeOpen() && document.activeElement === reload, 'opening focuses the primary action');
        ensure(key(reload, 'keydown', 'Tab').defaultPrevented && document.activeElement === later, 'Tab wraps from the last action to the first');
        key(later, 'keydown', 'Tab');
        ensure(document.activeElement === reload, 'and walks on to the next, not into the settings under it');
        key(reload, 'keydown', 'Tab', { shiftKey: true });
        key(later, 'keydown', 'Tab', { shiftKey: true });
        ensure(document.activeElement === reload, 'Shift+Tab wraps the other way');
        reload.click();
        ensure(!noticeOpen() && ran === 1 && noticeCard.hidden, 'an action closes it and runs');
        ensure(!noticeCard.contains(document.activeElement), 'and the focus leaves the closed card');
      } finally {
        if (noticeOpen()) noticeCard.querySelector('button')?.click();
        settings.hide();
      }
    });
    // Give rejected pointer-lock promises a turn to reach the console if unhandled.
    await new Promise(resolve => setTimeout(resolve, 50));
    ensure(failures.length === 0, failures.join('\n'));
    return { result: 'UI_OK', checks };
  } finally {
    settings.hide();
    map.dispose();
    input.dispose();
    for (const element of [canvas, opener, field, editor, settings.root, noticeCard]) element.remove();
  }
}

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{
    name: 'ui-check-page',
    configureServer(server) {
      server.middlewares.use('/__checks/ui', (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html lang="en"><head><title>UI checks</title><link rel="icon" href="/favicon.svg"></head><body></body></html>');
      });
    },
  }],
});
try {
  await server.listen();
  const url = new URL('/__checks/ui', server.resolvedUrls.local[0]);
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL('./shot.mjs', import.meta.url)), '--url', url.href,
    '--timeout', '30000', '--eval', `(${check.toString()})()`, '--log',
  ], { timeout: 35000 });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  assert.match(stdout, /"result":"UI_OK"/);
  assert.doesNotMatch(stdout, /EVAL ERROR|EXC:|error:|NETFAIL|HTTP [45]\d\d/i);
} catch (error) {
  console.error(error.stderr ?? error.message);
  process.exitCode = 1;
} finally {
  await server.close();
}
