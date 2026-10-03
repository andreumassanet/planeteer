// Browser regressions for controls and overlays, without building the 3D world.
// Starts its own Vite server; Chrome/Chromium is selected by CHROME_BIN.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

async function check() {
  const [{ createInput }, { createSettings }, { createWorldMap }, { inputBlocked, actionOf, resetBindings }, { createHud }, { notice, noticeOpen }] = await Promise.all([
    import('/src/input.ts'), import('/src/settings.ts'), import('/src/map.ts'), import('/src/controls.ts'),
    import('/src/hud.ts'), import('/src/notice.ts'),
  ]);
  const [{ createPassport }, { createPassportCard }, { createTraveller }, { DEFAULT_APPEARANCE }, { createTitle, PLAY_KEY }] = await Promise.all([
    import('/src/passport.ts'), import('/src/passport-card.ts'), import('/src/traveller.ts'), import('/src/appearance.ts'),
    import('/src/title.ts'),
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
    monuments: [], marker: () => null,
    onMark() {}, onUnmark() {}, lockTarget: canvas,
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
      // What `holdFocus` walks: the page that is showing, one tab of the two.
      const controls = [...settings.root.querySelectorAll('button, input, a[href]')].filter(
        (element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
      );
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
    test('the settings key opens and closes the card, and is a letter in a field', () => {
      resetBindings();
      opener.focus();
      key(window, 'keydown', 'KeyO');
      ensure(settings.open, 'O opens the settings');
      key(window, 'keyup', 'KeyO');
      key(document.activeElement ?? window, 'keydown', 'KeyO');
      ensure(!settings.open, 'O closes them again');
      field.focus();
      ensure(!key(field, 'keydown', 'KeyO').defaultPrevented && !settings.open, 'typing O into a field is a letter');
      opener.focus();
    });
    test('a key button listens, rebinds, swaps, and the defaults come back', () => {
      resetBindings();
      settings.show('controls');
      try {
        const buttons = [...settings.root.querySelectorAll('button.atlas-settings-cap')];
        const jump = buttons.find((button) => button.getAttribute('aria-label')?.startsWith('Jump'));
        ensure(jump !== undefined, 'the jump has a key button');
        jump.focus();
        jump.click();
        ensure(jump.classList.contains('listening'), 'pressed, it listens');
        ensure(key(jump, 'keydown', 'Escape').defaultPrevented && settings.open, 'Escape lets go without closing the card');
        ensure(actionOf('Space') === 'jump', 'and changes nothing');
        const again = [...settings.root.querySelectorAll('button.atlas-settings-cap')].find((button) => button.getAttribute('aria-label')?.startsWith('Jump'));
        again.click();
        key(again, 'keydown', 'KeyW');
        ensure(actionOf('KeyW') === 'jump' && actionOf('Space') === 'forward', 'W is the jump now, and the walk took Space');
        ensure(settings.root.querySelector('.atlas-settings-status').textContent.includes('Space'), 'the swap is said');
        const reset = [...settings.root.querySelectorAll('button')].find((button) => button.textContent === 'Reset to defaults');
        ensure(reset !== undefined && !reset.disabled, 'reset is offered once something moved');
        reset.click();
        ensure(actionOf('KeyW') === 'forward' && actionOf('Space') === 'jump', 'reset puts both back');
      } finally {
        resetBindings();
        settings.hide();
      }
    });
    test('H puts the whole overlay away and brings it back', () => {
      const hud = createHud({ countries: [] });
      document.body.append(hud.root);
      try {
        ensure(hud.toggleHidden() && hud.root.classList.contains('hidden') && document.body.classList.contains('atlas-hud-hidden'), 'hidden');
        ensure(!hud.toggleHidden() && !hud.root.classList.contains('hidden'), 'and back');
        ensure(hud.root.querySelector('.atlas-keys') === null, 'no key strip along the bottom');
      } finally {
        hud.setHidden(false);
        hud.root.remove();
      }
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
        void hud.welcome();
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
    test('the creator holds the keys, frames each category, keeps Tab inside, and Esc closes it', () => {
      // The stage is a stand-in: what is tested is the column, not the WebGL.
      const shots = [];
      const plate = document.createElement('div');
      const stage = {
        root: document.createElement('div'), plate, open: false, ready: false, shotName: 'title',
        show() { this.open = true; }, hide() { this.open = false; }, mode() {},
        shot(shot) { this.shotName = shot; shots.push(shot); }, insets() {},
        adoptPlate(container) { container.append(plate); }, wave() {}, editName() {}, refreshName() {},
        onName() { return () => {}; }, portrait() {},
      };
      let look = { ...DEFAULT_APPEARANCE };
      const creator = createTraveller({
        appearance: { get: () => look, set: (next) => { look = next; } },
        stage,
        lockTarget: canvas,
      });
      const root = creator.root;
      try {
        opener.focus();
        creator.show();
        ensure(creator.open && stage.open, 'it opens, and brings the stage up when nothing else had it');
        ensure(inputBlocked(), 'and holds the keyboard');
        ensure(root.contains(plate), 'with the name plate on its own layer, where its Tab reaches');
        ensure(root.querySelector('.cr-name') === null, 'the name is changed on the plate alone, not in a field of its own');
        ensure(root.querySelector('#cr-page-looks') === null, 'and there is no page of whole looks: Randomise is that');
        const you = root.querySelector('.cr-tab[aria-selected="true"]');
        ensure(document.activeElement === you, 'the open category has the focus');
        key(you, 'keydown', 'ArrowDown');
        ensure(document.activeElement.textContent === 'Skin' && shots.at(-1) === 'head', 'the arrows walk the rail, and skin frames the face');
        for (let i = 0; i < 40; i++) key(document.activeElement ?? window, 'keydown', 'Tab');
        ensure(root.contains(document.activeElement), 'Tab stays inside');
        root.querySelectorAll('.cr-tab')[3].click();
        ensure(shots.at(-1) === 'top', 'the top frames the shoulders');
        root.querySelectorAll('#cr-page-top .cr-swatch')[2].click();
        ensure(look.topColour === 2, 'a swatch dresses the hero at once');
        key(window, 'keydown', 'KeyZ', { ctrlKey: true });
        ensure(look.topColour === DEFAULT_APPEARANCE.topColour, 'and Ctrl+Z takes it back');
        key(document.activeElement ?? window, 'keydown', 'Escape');
        ensure(!creator.open && !stage.open, 'Escape closes it, and the stage it brought goes with it');
        ensure(document.activeElement === opener, 'and the focus goes back where it was');
      } finally {
        if (creator.open) creator.hide();
        root.remove();
        opener.focus();
      }
    });
    test('the title stands on the bridge, waits while the creator is up, and Enter leaves by the window', () => {
      // The stage is a stand-in again: what is tested is what the title asks of it.
      const calls = [];
      const plate = document.createElement('div');
      const stage = {
        root: document.createElement('div'), plate, open: false, ready: false, shotName: 'title',
        show(kind) { this.open = true; calls.push(`show:${kind}`); },
        hide() { this.open = false; calls.push('hide'); },
        leave() { this.open = false; calls.push('leave'); },
        mode() {}, shot() {}, insets() {}, wave() {}, editName() {}, refreshName() {}, portrait() {},
        adoptPlate(container) { container.append(plate); }, onName() { return () => {}; },
      };
      const chosen = [];
      try { localStorage.removeItem(PLAY_KEY); } catch { /* private mode */ }
      const title = createTitle({ stage, online: false, customise() {}, onChoose: (mode) => chosen.push(mode) });
      try {
        title.show();
        ensure(title.open && stage.open && calls[0] === 'show:bridge', 'it brings the stage up on the bridge');
        ensure(title.root.contains(plate), 'with the name plate on its own layer');
        ensure(title.root.querySelector('[data-mode="online"]').disabled, 'and online off without a relay');
        title.aside(true);
        document.activeElement?.blur?.();
        key(window, 'keydown', 'Enter');
        ensure(chosen.length === 0 && title.open, 'stepped aside for the creator, its keys wait');
        title.aside(false);
        document.activeElement?.blur?.();
        key(window, 'keydown', 'Enter');
        ensure(chosen[0] === 'offline' && calls.at(-1) === 'leave', 'Enter plays offline, and the stage leaves by the window');
        ensure(!title.open && !title.root.classList.contains('on') && title.mode === 'offline', 'and the title goes, remembering the way');
        title.show();
        title.hide();
        ensure(calls.at(-2) === 'show:bridge' && calls.at(-1) === 'hide', 'hidden any other way, the stage only hides');
      } finally {
        title.dispose();
        try { localStorage.removeItem(PLAY_KEY); } catch { /* private mode */ }
        opener.focus();
      }
    });
    test('the passport opens already open, turns only by its corners and bookmarks, and J or Esc closes it', () => {
      const items = {};
      const book = createPassport({ getItem: (name) => items[name] ?? null, setItem: (name, value) => { items[name] = value; } });
      const countries = [
        { iso: 'ESP', name: 'Spain', continent: 'Europe' },
        { iso: 'FRA', name: 'France', continent: 'Europe' },
        { iso: 'JPN', name: 'Japan', continent: 'Asia' },
        { iso: 'NGA', name: 'Nigeria', continent: 'Africa' },
      ];
      const card = createPassportCard({ passport: book, countries, here: () => 'NGA', lockTarget: canvas });
      document.body.append(card.root);
      const root = card.root;
      const current = () => [...root.querySelectorAll('.p-tab')].filter((tab) => tab.getAttribute('aria-current') === 'true').map((tab) => tab.textContent);
      try {
        resetBindings();
        opener.focus();
        key(window, 'keydown', 'KeyJ');
        ensure(card.open, 'J opens it');
        ensure(root.querySelector('.p-page.cover') === null, 'with no cover to open first');
        ensure(current().length === 1 && current()[0].startsWith('Africa'), 'at the visa of the country underfoot');
        ensure(root.querySelector('.p-nav, .p-close') === null, 'and no buttons under the book');
        root.querySelector('.p-side.right .p-page')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        root.querySelector('.p-side.left .p-page')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        ensure(current()[0].startsWith('Africa'), 'a click on the paper turns nothing');
        root.querySelector('.p-tab.holder').click();
        ensure(root.querySelector('.p-tab.holder').getAttribute('aria-current') === 'true', 'the holder\'s bookmark goes to the first spread');
        ensure(root.querySelector('.p-corner.prev').hidden && !root.querySelector('.p-corner.next').hidden, 'where only the next corner turns');
        root.querySelector('.p-corner.next').click();
        ensure(current()[0].startsWith('Europe'), 'the corner turns to the next spread');
        key(window, 'keydown', 'ArrowLeft');
        ensure(root.querySelector('.p-tab.holder').getAttribute('aria-current') === 'true', 'and the arrows turn it too');
        key(document.activeElement ?? window, 'keydown', 'KeyJ');
        ensure(!card.open, 'J closes it');
        key(window, 'keydown', 'KeyJ');
        key(document.activeElement ?? window, 'keydown', 'Escape');
        ensure(!card.open, 'and so does Escape');
      } finally {
        if (card.open) card.hide();
        card.root.remove();
        opener.focus();
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
