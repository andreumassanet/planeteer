/**
 * The account's panels, in the card language: a chip beside the title's
 * buttons, and the Account page of Settings. Both redraw from the account's
 * view whenever it changes. A name is only ever written with `textContent`.
 */
import { guestName } from '../peers/names.ts';
import { ensureStyle, h, icon, installUi } from '../ui.ts';
import type { Account, AccountView, RenameResult } from './account.ts';
import type { AccountPlace } from '../account.ts';

const STYLE = `
.ac-chip { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.ac-chip .ui-btn { gap: 7px; }
.ac-chip .ac-face { width: 20px; height: 20px; border-width: 2px; }
.ac-note { font-size: 12px; font-weight: 700; line-height: 1.3; color: var(--ui-paper-dim); text-shadow: var(--ui-space-shadow); max-width: 30ch; }
.ac-face {
  width: 20px; height: 20px; flex: none;
  border-radius: 50%;
  border: 2px solid var(--ui-ink);
  background: var(--ui-sky);
  object-fit: cover;
}
.ac-who { display: flex; align-items: center; gap: 12px; padding: 6px 0 10px; }
.ac-who .ac-face { width: 44px; height: 44px; border-width: 2.5px; box-shadow: 0 3px 0 var(--ui-ink); }
.ac-who b { display: block; font-size: 18px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; overflow-wrap: anywhere; }
.ac-who small { display: block; font-size: 12.5px; font-weight: 700; color: var(--ui-muted); }
.ac-text { margin: 4px 0 12px; font-size: 13.5px; font-weight: 700; line-height: 1.4; color: var(--ui-muted); max-width: 46ch; }
.ac-name { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 0; }
.ac-input {
  flex: 1 1 180px; min-width: 0;
  font: inherit; font-size: 15px; font-weight: 800; color: var(--ui-ink);
  padding: 8px 11px;
  border: 2.5px solid var(--ui-ink); border-radius: 10px;
  background: var(--ui-paper);
}
.ac-input:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.ac-say { min-height: 1.3em; margin-top: 6px; font-size: 12.5px; font-weight: 700; line-height: 1.3; color: var(--ui-muted); }
.ac-say.bad { color: var(--ui-crimson); }
.ac-foot { display: flex; justify-content: flex-start; gap: 10px; margin-top: 14px; }
.ac-danger { color: var(--ui-crimson); }
.ac-fine { margin-top: 10px; font-size: 12.5px; }
.ac-fine a { color: inherit; }
`;

const SYNC_WORDS: Record<AccountView['sync'], string> = {
  idle: 'Signed in with Discord',
  saving: 'Saving…',
  saved: 'Saved to your account',
  offline: 'Not saved yet: tried again shortly',
};

const RENAME_WORDS: Record<RenameResult, string> = {
  ok: 'Saved. The others see this name now.',
  taken: 'That name is taken. Try another.',
  invalid: '2 to 20 letters, digits, spaces, dots, dashes or underscores.',
  offline: 'Could not reach the server. Kept here and sent later.',
};

function face(url: string): HTMLElement {
  if (url === '') return h('span', { class: 'ac-face', 'aria-hidden': 'true' });
  return h('img', { class: 'ac-face', src: url, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy', decoding: 'async' });
}

/** The title's chip: sign in, or who is signed in (which opens the account page). */
function titleChip(account: Account, into: HTMLElement, open?: () => void): void {
  const button = h('button', { class: 'ui-btn quiet', type: 'button' });
  const note = h('div', { class: 'ac-note' });
  const chip = h('div', { class: 'ac-chip' }, button, note);
  into.append(chip);
  button.addEventListener('click', () => {
    if (account.view.state === 'in') open?.();
    else if (account.view.state === 'out') void account.signIn();
  });
  const draw = (view: AccountView): void => {
    button.replaceChildren();
    button.disabled = view.state === 'opening';
    if (view.state === 'in') {
      button.append(face(view.user?.avatar ?? ''), h('span', { text: view.name || 'Your account' }));
      button.title = 'Your account';
    } else {
      button.append(icon('passport', 18), h('span', { text: view.state === 'opening' ? 'Opening Discord…' : 'Sign in with Discord' }));
      button.title = 'Keep your name, look and passport on every device';
    }
    note.textContent = view.state === 'out' ? view.message : '';
    note.hidden = note.textContent === '';
  };
  draw(account.view);
  account.onChange(draw);
}

/** The Settings page: what an account is for and the button, or the name, its field and sign-out. */
function settingsPage(account: Account, into: HTMLElement): void {
  const section = (label: string, ...rows: HTMLElement[]): HTMLElement =>
    h('section', { class: 'atlas-settings-section' }, h('div', { class: 'ui-label', text: label }), ...rows);

  // Signed out.
  const signIn = h('button', { class: 'ui-btn primary', type: 'button' }, 'Sign in with Discord');
  const outText = h('p', { class: 'ac-text' });
  const outSay = h('div', { class: 'ac-say bad', role: 'status' });
  const out = h('section', { class: 'atlas-settings-section' }, outText, signIn, outSay,
    h('p', { class: 'ac-text ac-fine' }, h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'Privacy' })));
  signIn.addEventListener('click', () => void account.signIn());

  // Signed in.
  const who = h('div', { class: 'ac-who' });
  const input = h('input', {
    class: 'ac-input', type: 'text', maxlength: '20', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Your name', placeholder: 'Your name',
  });
  const save = h('button', { class: 'ui-btn small', type: 'button' }, 'Save');
  const say = h('div', { class: 'ac-say', role: 'status' });
  const signOut = h('button', { class: 'ui-btn quiet small', type: 'button' }, 'Sign out');
  const remove = h('button', { class: 'ui-btn quiet small ac-danger', type: 'button' }, 'Delete account');
  const removeSay = h('div', { class: 'ac-say', role: 'status' });
  const inside = h(
    'div',
    {},
    section('Signed in as', who),
    section('Name', h('p', { class: 'ac-text', text: 'One traveller a name: the others see it over your head and in the chat.' }), h('div', { class: 'ac-name' }, input, save), say),
    h('div', { class: 'ac-foot' }, signOut, remove),
    removeSay,
    h('p', { class: 'ac-text ac-fine' }, h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'Privacy' })),
  );
  // Signed in or not: the passport and the rings back to empty, here and on the account.
  const reset = h('button', { class: 'ui-btn quiet small ac-danger', type: 'button' }, 'Reset progress');
  const resetSay = h('div', { class: 'ac-say', role: 'status' });
  const progress = section(
    'Progress',
    h('p', { class: 'ac-text', text: 'Start again: every stamp, town, ring and best time goes. Your name and your look stay.' }),
    reset,
    resetSay,
  );
  into.append(out, inside, progress);
  let resetting = false;
  reset.addEventListener('click', () => {
    if (!resetting) {
      resetting = true;
      reset.textContent = 'Yes, reset it';
      resetSay.textContent = account.view.state === 'in' ? 'This empties the progress on this device and on your account, for good.' : 'This empties the progress on this device, for good.';
      return;
    }
    reset.disabled = true;
    resetSay.textContent = 'Resetting…';
    void account.resetProgress().then((done) => {
      // The world holds the old progress in memory: it starts again from what is stored.
      if (done) location.reload();
      reset.disabled = false;
      resetting = false;
      reset.textContent = 'Reset progress';
      resetSay.textContent = account.view.message;
    });
  });
  reset.addEventListener('blur', () => {
    if (!resetting || reset.disabled) return;
    resetting = false;
    reset.textContent = 'Reset progress';
    resetSay.textContent = '';
  });

  let busy = false;
  async function rename(): Promise<void> {
    if (busy) return;
    busy = true;
    save.disabled = true;
    say.classList.remove('bad');
    say.textContent = 'Saving…';
    const result = await account.rename(input.value);
    busy = false;
    save.disabled = false;
    say.textContent = RENAME_WORDS[result];
    say.classList.toggle('bad', result !== 'ok');
    if (result === 'ok' || result === 'taken') input.value = account.view.name;
  }
  save.addEventListener('click', () => void rename());
  input.addEventListener('keydown', (event) => {
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
    event.preventDefault();
    event.stopPropagation();
    void rename();
  });
  signOut.addEventListener('click', () => void account.signOut());

  // Two presses: the first asks, the second deletes. Anything else in between puts the question away.
  let asking = false;
  const settle = (): void => {
    asking = false;
    remove.textContent = 'Delete account';
    removeSay.textContent = '';
  };
  remove.addEventListener('click', () => {
    if (!asking) {
      asking = true;
      remove.textContent = 'Yes, delete it';
      removeSay.textContent = 'This deletes your name and the progress kept on your account, for good. This device keeps its own copy.';
      return;
    }
    remove.disabled = true;
    removeSay.textContent = 'Deleting…';
    void account.deleteAccount().then((done) => {
      remove.disabled = false;
      settle();
      if (!done) removeSay.textContent = account.view.message;
    });
  });
  remove.addEventListener('blur', () => {
    if (asking && !remove.disabled) settle();
  });

  let shownName = '';
  const draw = (view: AccountView): void => {
    out.hidden = view.state === 'in';
    inside.hidden = view.state !== 'in';
    signIn.disabled = view.state === 'opening';
    signIn.textContent = view.state === 'opening' ? 'Opening Discord…' : 'Sign in with Discord';
    outText.textContent =
      `Optional. Sign in to keep your name, your look, your passport and your best times on every device. Without it you play as ${guestName()}.`;
    outSay.textContent = view.message;
    if (view.state !== 'in') return;
    who.replaceChildren(
      face(view.user?.avatar ?? ''),
      h('div', {}, h('b', { text: view.name || 'No name yet' }), h('small', { text: SYNC_WORDS[view.sync] })),
    );
    // The field follows the account unless it is being typed in.
    if (view.name !== shownName && document.activeElement !== input) input.value = view.name;
    shownName = view.name;
    if (view.message !== '' && !busy) {
      say.textContent = view.message;
      say.classList.add('bad');
    }
  };
  draw(account.view);
  account.onChange(draw);
}

export function mountPanel(account: Account, into: HTMLElement, place: AccountPlace, open?: () => void): void {
  installUi();
  ensureStyle('atlas-account', STYLE);
  if (place === 'title') titleChip(account, into, open);
  else settingsPage(account, into);
}
