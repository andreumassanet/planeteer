/** The HUD's elements: the bar, the place badge, the cards, the pause and welcome screens and the sheet. */
import { h, icon, kbd } from '../ui.ts';
import { createSpeedometer } from './speedometer.ts';
import type { HudOptions } from './types.ts';

/** The bar: the gear, the map and the passport, the clock and the place badge. */
function buildBar(options: HudOptions, signal: AbortSignal) {
  const settingsCap = kbd('');
  const mapCap = kbd('');
  const passportCap = kbd('');
  settingsCap.classList.add('atlas-hud-cap');
  mapCap.classList.add('atlas-hud-cap');
  passportCap.classList.add('atlas-hud-cap');
  // The three a finger reaches through the sheet instead (`atlas-hud-desk`).
  const settingsButton = h('button', { class: 'ui-btn icon atlas-hud-desk', type: 'button' }, icon('gear'), settingsCap);
  const mapButton = h('button', { class: 'ui-btn icon atlas-hud-desk', type: 'button' }, icon('map'), mapCap);
  const passportButton = h('button', { class: 'ui-btn icon atlas-hud-desk', type: 'button' }, icon('passport'), passportCap);
  const moreButton = h('button', { class: 'ui-btn icon atlas-hud-more', type: 'button', 'aria-label': 'Menu' }, icon('menu'));
  settingsButton.addEventListener('click', () => options.onSettings?.(), { signal });
  mapButton.addEventListener('click', () => options.onMap?.(), { signal });
  passportButton.addEventListener('click', () => options.onPassport?.(), { signal });
  // Off this world and out to the planets: the menu's solar system.
  const leaveButton =
    options.leave === undefined
      ? null
      : h('button', { class: 'ui-btn icon atlas-hud-desk', type: 'button', title: options.leave.label, 'aria-label': options.leave.label }, icon('orbit'));
  leaveButton?.addEventListener('click', () => options.leave?.run(), { signal });

  const placeFlag = h('span');
  // The smallest true thing about where you are, large; under it the country, how far the town is and which way.
  const placeName = h('span', { class: 'atlas-place-name' });
  const placeCountry = h('span');
  const placeSep = h('span', { text: '·' });
  // How far: its own clock, rewritten as you walk.
  const placeRangeText = h('span');
  const placeArrow = h('span', { class: 'atlas-place-arrow', text: '↑', 'aria-hidden': 'true' });
  placeArrow.hidden = true;
  const placeSub = h('span', { class: 'atlas-place-sub' }, placeCountry, placeSep, placeRangeText, placeArrow);
  placeSub.hidden = true;
  const place = h(
    'div',
    { class: 'atlas-place ui-card' },
    placeFlag,
    h('span', { class: 'atlas-place-text' }, placeName, placeSub),
  );
  // The clock is not debounced: it has no boundary to flap across.
  const clockIcon = h('span');
  const clockText = h('span');
  const clock = h('div', { class: 'atlas-clock ui-card' }, clockIcon, clockText);
  const bar = h(
    'div',
    { class: 'atlas-hud-bar' },
    moreButton,
    settingsButton,
    mapButton,
    options.onPassport === undefined ? null : passportButton,
    leaveButton,
    clock,
    place,
  );
  return { settingsCap, mapCap, passportCap, settingsButton, mapButton, passportButton, moreButton, leaveButton, placeFlag, placeName, placeCountry, placeSep, placeRangeText, placeArrow, placeSub, place, clockIcon, clockText, clock, bar };
}

/** The landmark card, the marker panel and the waypoint. */
function buildCards() {
  const foundName = h('div', { class: 'atlas-found-name' });
  const foundFact = h('div', { class: 'atlas-found-fact' });
  const foundFlag = h('span');
  const foundNote = h('div', { class: 'atlas-found-note' });
  const found = h(
    'div',
    { class: 'atlas-found ui-card' },
    h('div', { class: 'atlas-found-text' }, foundName, foundFact, foundNote),
    foundFlag,
  );

  const destinationFlag = h('span');
  const destinationName = h('div', { class: 'atlas-destination-name' });
  // Two spans and a fixed separator, because only the right-hand one changes.
  const destinationPlace = h('span');
  const destinationRange = h('span');
  const destinationSub = h('div', { class: 'atlas-destination-sub' }, destinationPlace, ', ', destinationRange);
  const destination = h(
    'div',
    { class: 'atlas-destination ui-card' },
    h('div', { class: 'atlas-destination-head' }, destinationFlag, h('div', {}, destinationName, destinationSub)),
  );

  const waypointPin = h('div', { class: 'atlas-waypoint-pin' });
  const waypointLabel = h('div', { class: 'atlas-waypoint-label ui-card' });
  const waypoint = h('div', { class: 'atlas-waypoint' }, waypointPin, waypointLabel);
  return { foundName, foundFact, foundFlag, foundNote, found, destinationFlag, destinationName, destinationPlace, destinationRange, destinationSub, destination, waypointPin, waypointLabel, waypoint };
}

/** The keys of the moment, the toast, the prompt, the pause card and the frame counter. */
function buildStatus() {
  const hintsCard = h('div', { class: 'atlas-hints ui-card', role: 'status' });

  const toastIcon = h('span');
  const toastText = h('span');
  const toast = h('div', { class: 'atlas-toast ui-card', role: 'status' }, toastIcon, toastText);
  const promptKey = h('span');
  const promptIcon = h('span');
  const promptText = h('span');
  const prompt = h('div', { class: 'atlas-prompt ui-card', role: 'status' }, promptKey, promptIcon, promptText);
  const pauseTitle = h('b');
  const pauseText = h('small');
  // A dialog to assistive technology and to `inputBlocked`, so Enter and Space on its buttons press them rather than jump.
  // Not modal: the world goes on behind it.
  const pause = h(
    'div',
    { class: 'atlas-pause', role: 'dialog', 'aria-label': 'Paused' },
    h(
      'div',
      { class: 'atlas-pause-main ui-card' },
      h('span', { class: 'atlas-pause-mouse' }, icon('mouse')),
      h('div', {}, pauseTitle, pauseText),
    ),
  );

  const perf = h('div', { class: 'atlas-perf ui-card' });
  return { hintsCard, toastIcon, toastText, toast, promptKey, promptIcon, promptText, prompt, pauseTitle, pauseText, pause, perf };
}

/** The welcome card. */
function buildWelcome() {
  const welcomeTitle = h('div', { class: 'atlas-welcome-title' });
  const welcomeSub = h('div', { class: 'atlas-welcome-sub' });
  const welcomeList = h('div', { class: 'atlas-welcome-list' });
  const welcomeGo = h('button', { class: 'ui-btn primary big atlas-welcome-go' }, 'Start exploring');
  const welcomeCard = h(
    'div',
    { class: 'atlas-welcome-card ui-card' },
    h('div', { class: 'atlas-welcome-head' }, welcomeTitle, welcomeSub),
    welcomeList,
    welcomeGo,
  );
  const welcomeRoot = h(
    'div',
    { class: 'atlas-welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome' },
    welcomeCard,
  );
  return { welcomeTitle, welcomeSub, welcomeList, welcomeGo, welcomeCard, welcomeRoot };
}

/** The sheet a touch screen reaches the bar's buttons through. */
function buildSheet() {
  const sheetClose = h('button', { class: 'ui-btn icon', type: 'button', 'aria-label': 'Close' }, icon('close'));
  const sheetGrid = h('div', { class: 'atlas-sheet-grid' });
  const sheetCard = h(
    'div',
    { class: 'atlas-sheet-card ui-card' },
    h('div', { class: 'atlas-sheet-head' }, h('b', { text: 'Menu' }), sheetClose),
    sheetGrid,
  );
  const sheet = h('div', { class: 'atlas-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu' }, sheetCard);
  return { sheetClose, sheetGrid, sheetCard, sheet };
}

export function buildDom(options: HudOptions, signal: AbortSignal) {
  const root = h('div', { class: 'atlas-hud' });
  const bar = buildBar(options, signal);
  const cards = buildCards();
  const status = buildStatus();
  const welcome = buildWelcome();
  const sheet = buildSheet();
  const speedometer = createSpeedometer();
  root.append(bar.bar, h('div', { class: 'atlas-side' }, cards.destination, cards.found), cards.waypoint, status.hintsCard, status.toast, status.prompt, status.pause, status.perf, speedometer.element, welcome.welcomeRoot, sheet.sheet);
  return {
    root,
    speedometer,
    ...bar,
    ...cards,
    ...status,
    ...welcome,
    ...sheet,
  };
}

export type HudDom = ReturnType<typeof buildDom>;
