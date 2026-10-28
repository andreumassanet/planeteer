/** The menu's stylesheet. */
import { PALETTE } from '../theme.ts';
import { hex } from '../ui.ts';

export const STYLE = `
.atlas-menu {
  position: fixed;
  inset: 0;
  z-index: 9;
  overflow: hidden;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.atlas-menu:focus { outline: none; }
.atlas-menu.dragging { cursor: grabbing; }
.atlas-menu.flying, .atlas-menu.chosen { cursor: default; }
.atlas-menu .m-fade {
  transition: opacity 0.35s ease, transform 0.45s var(--ui-ease), visibility 0.35s;
}
.atlas-menu .m-off {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none !important;
}
.atlas-menu .m-marks { transition: opacity 0.35s ease, visibility 0.35s; }
.atlas-menu.held .m-marks { opacity: 0; visibility: hidden; }
.atlas-menu.held { cursor: default; }
.atlas-menu.departing .m-chrome { opacity: 0 !important; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s; }

/* --- the brand, over the system ------------------------------------------ */
.m-brand {
  position: absolute;
  top: 32px;
  left: 40px;
  max-width: 420px;
  pointer-events: none;
}
.m-brand.m-off { transform: translateX(-24px); }
.m-wordmark {
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 0.9;
  color: var(--ui-paper);
  -webkit-text-stroke: 5px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 4px 0 var(--ui-ink);
}
.m-tagline {
  margin-top: 12px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--ui-paper-dim);
  text-shadow: var(--ui-space-shadow);
}

/* --- the dock of bodies: one shelf, a body a button ------------------------ */
.m-dock {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  max-width: calc(100vw - 48px);
  overflow-x: auto;
  padding: 6px;
  scrollbar-width: none;
}
.m-dock.m-off { transform: translate(-50%, 24px); }
.m-dock-item {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 92px;
  padding: 10px 6px 8px;
  font: inherit;
  color: var(--ui-ink);
  background: transparent;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.m-dock-item:hover, .m-dock-item.hot { background: var(--ui-cream); }
.m-dock-item:active { background: var(--ui-gold); }
/* Inside the shelf, which clips a ring drawn past its edge. */
.m-dock-item:focus-visible { outline: var(--ui-ring); outline-offset: -3px; }
.m-dock-name { font-size: 13.5px; font-weight: 800; letter-spacing: -0.01em; }
.m-dock-sub {
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  color: var(--ui-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* --- labels on the bodies ------------------------------------------------- */
.m-marks { position: absolute; inset: 0; pointer-events: none; }
.m-label {
  position: absolute;
  left: 0;
  top: 0;
  font: 800 12.5px/1 var(--ui-font);
  letter-spacing: -0.005em;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 2px solid var(--ui-ink);
  border-radius: 999px;
  box-shadow: 0 2px 0 var(--ui-ink);
  padding: 5px 10px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.12s ease, opacity 0.25s ease;
}
.m-label.hot { background: var(--ui-gold); }
.m-marks.quiet .m-label { opacity: 0; pointer-events: none; }
/* The Sun: named, never a destination. */
.m-label.inert, .m-dock-item.inert { cursor: default; pointer-events: none; }
.m-halo {
  position: absolute;
  left: 0;
  top: 0;
  border: 3px solid var(--ui-gold);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--ui-ink), inset 0 0 0 3px var(--ui-ink);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.m-halo.on { opacity: 1; }

/* --- the trail of crumbs and the way back --------------------------------- */
.m-crumbs {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.m-crumbs.m-off { transform: translateY(-12px); }
.m-trail {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 44px;
  padding: 0 8px;
}
.m-trail svg { width: 14px; height: 14px; opacity: 0.35; }
.m-crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  font: 800 13.5px/1 var(--ui-font);
  color: var(--ui-ink);
  background: none;
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
}
.m-crumb:hover { background: var(--ui-hover); }
.m-crumb.here { cursor: default; background: none; }
.m-crumb:focus-visible { outline: var(--ui-ring); outline-offset: 1px; }
.m-crumb .ui-flag { border-width: 1.5px; border-radius: 3px; }

/* --- the stage card on the left ------------------------------------------- */
.m-panel {
  position: absolute;
  top: 86px;
  left: 24px;
  width: 320px;
  max-height: calc(100vh - 86px - 48px);
  display: flex;
  flex-direction: column;
  padding: 18px 16px 12px 18px;
}
.m-panel.m-off { transform: translateX(-24px); }
.m-panel h2 { font-size: 24px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.05; text-wrap: balance; }
.m-panel p { margin-top: 8px; font-size: 13.5px; font-weight: 600; line-height: 1.45; color: var(--ui-muted); text-wrap: pretty; }
.m-panel .ui-btn { margin-top: 16px; align-self: flex-start; }
.m-country { display: flex; align-items: center; gap: 12px; }
.m-country-sub { margin-top: 3px; font-size: 12.5px; font-weight: 700; color: var(--ui-muted); }
.m-list {
  flex: 1;
  min-height: 0;
  margin: 14px -8px 0 -6px;
  padding: 6px 6px 0;
  border-top: 2.5px solid var(--ui-rule);
  overflow-y: auto;
  scrollbar-width: thin;
}
.m-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font: 700 13.5px/1.1 var(--ui-font);
  color: var(--ui-ink);
  text-align: left;
  background: none;
  border: 0;
  border-radius: 9px;
  padding: 7px 8px;
  cursor: pointer;
}
.m-row:hover, .m-row.hot { background: var(--ui-cream); }
.m-row.picked { background: var(--ui-gold); }
/* Inside the ring rather than outside it: the list scrolls, and a ring drawn
   past a row's edge is clipped by it. */
.m-row:focus-visible { outline: var(--ui-ring); outline-offset: -3px; }
.m-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-row em { font-style: normal; font-size: 12px; font-weight: 700; color: var(--ui-muted); }
.m-row small { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--ui-muted); font-variant-numeric: tabular-nums; }
.m-more { padding: 8px 8px 10px; font-size: 12px; font-weight: 700; color: var(--ui-muted); }

/* --- top right: continue and search --------------------------------------- */
.m-top-right {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}
.m-continue .quiet { font-weight: 700; opacity: 0.66; }
.m-search { position: relative; z-index: 1; width: 300px; }
.m-search-box {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 46px;
  padding: 0 10px 0 13px;
  cursor: text;
}
.m-search-box svg { flex: none; opacity: 0.7; }
.m-search-box input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: 700 15px var(--ui-font);
  color: var(--ui-ink);
}
.m-search-box input::placeholder { color: var(--ui-muted); }
.m-search-box input::-webkit-search-cancel-button { display: none; }
.m-search:focus-within .m-search-box { outline: var(--ui-ring); outline-offset: 3px; }
.m-results {
  position: absolute;
  top: 56px;
  left: 0;
  right: 0;
  padding: 6px;
  display: none;
  animation: ui-pop 0.2s var(--ui-ease) both;
}
.m-results.on { display: block; }
.m-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 9px;
  cursor: pointer;
}
.m-result.on { background: var(--ui-cream); }
.m-result-world { display: grid; place-items: center; flex: none; width: 26px; height: 18px; }
.m-result > div { flex: 1; min-width: 0; }
.m-result b { display: block; font-size: 14px; font-weight: 800; line-height: 1.15; }
.m-result small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-result .ui-tag { margin-left: auto; }
.m-empty { padding: 10px; font-size: 12.5px; font-weight: 600; color: var(--ui-muted); text-wrap: pretty; }

/* --- a body up close ------------------------------------------------------ */
.m-info {
  position: absolute;
  right: 32px;
  top: 50%;
  width: 356px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  transform: translateY(-46%);
  padding: 22px 22px 18px;
}
.m-info.m-off { transform: translate(28px, -46%); }
.m-info h2 { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
.m-info-sub { margin-top: 6px; font-size: 13.5px; font-weight: 700; color: var(--ui-muted); }
.m-info p { margin-top: 12px; font-size: 14px; font-weight: 600; line-height: 1.5; text-wrap: pretty; }
.m-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 2.5px solid var(--ui-rule);
}
.m-fact small { display: block; font-size: 12px; font-weight: 700; color: var(--ui-muted); }
.m-fact b { display: block; margin-top: 1px; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.m-lines { display: grid; gap: 7px; margin-top: 14px; }
.m-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}
.m-line svg { width: 15px; height: 15px; flex: none; margin-top: 1px; opacity: 0.55; }
.m-actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }

/* --- the town you picked -------------------------------------------------- */
.m-select {
  position: absolute;
  left: 50%;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 440px;
  max-width: calc(100vw - 48px);
  padding: 12px 12px 12px 15px;
  transform: translateX(-50%);
}
.m-select.m-off { transform: translate(-50%, 24px); }
.m-select-name { font-size: 23px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; }
.m-select-sub { margin-top: 3px; font-size: 12.5px; font-weight: 600; color: var(--ui-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.m-select .ui-btn { margin-left: auto; }

/* --- hover card, reticle, pins --------------------------------------------- */
.m-tip {
  position: absolute;
  left: 0;
  top: 0;
  display: none;
  align-items: center;
  gap: 10px;
  padding: 8px 13px 8px 9px;
  pointer-events: none;
  max-width: 300px;
}
.m-tip.on { display: flex; }
.m-tip b { display: block; font-size: 14.5px; font-weight: 800; letter-spacing: -0.012em; line-height: 1.15; }
.m-tip small { display: block; margin-top: 1px; font-size: 12.5px; font-weight: 600; color: var(--ui-muted); }
.m-reticle {
  position: absolute;
  left: 50%;
  top: 50%;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  transform: translate(-50%, -14px);
  pointer-events: none;
}
.m-reticle.on { display: flex; }
.m-reticle i {
  width: 28px;
  height: 28px;
  border: 3px solid var(--ui-paper);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--ui-ink), inset 0 0 0 3px var(--ui-ink);
}

.m-pins { position: absolute; inset: 0; pointer-events: none; }
.m-pin {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font: 800 12.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 2px solid var(--ui-ink);
  border-radius: 9px;
  box-shadow: 0 2px 0 var(--ui-ink);
  padding: 5px 9px 5px 7px;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  /* Colour and lift only: a transform transition makes every pin lag the
     globe while you drag it, which reads as the towns sliding on the ground. */
  transition: box-shadow 0.08s, background 0.08s;
}
.m-pin i {
  width: 9px;
  height: 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
}
.m-pin.capital i { background: var(--ui-gold); }
.m-pin:hover, .m-pin.hot { background: var(--ui-cream); box-shadow: 0 3px 0 var(--ui-ink); z-index: 1; }
.m-pin.picked { background: var(--ui-gold); z-index: 2; }
.m-pin:focus-visible { outline: var(--ui-ring); outline-offset: 3px; z-index: 4; }
/* A pin whose name lost the collision is a dot on a map, not a card with the
   writing rubbed off: it keeps the ring and loses the card, and the border
   stays as a transparent 2px so the dot does not move off its town. */
.m-pin.away { padding: 5px 7px; background: transparent; border-color: transparent; box-shadow: none; }
.m-pin.away span { display: none; }
.m-pin.away:hover, .m-pin.away.hot, .m-pin.away.picked {
  background: var(--ui-cream);
  border-color: var(--ui-ink);
  box-shadow: 0 2px 0 var(--ui-ink);
  padding: 5px 9px 5px 7px;
  z-index: 3;
}
.m-pin.away.picked { background: var(--ui-gold); }
.m-pin.away:hover span, .m-pin.away.hot span, .m-pin.away.picked span { display: inline; }

/* --- the curtain over the cut into the game -------------------------------- */
.atlas-curtain {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  background: radial-gradient(circle at 50% 42%, ${hex(PALETTE.white)} 0 35%, ${hex(PALETTE.cream)} 100%);
  opacity: 0;
  transition: opacity 0.38s ease;
}
.atlas-curtain.on { opacity: 1; }
.atlas-curtain.lifting { transition: opacity 0.9s ease; }

@media (max-width: 900px) {
  .m-panel { width: 290px; }
  .m-search { width: 260px; }
  .m-wordmark { font-size: 38px; }
  .m-info { width: 320px; }
}

/* --- a phone, either way up ------------------------------------------------- */
/*
 * Small, not touch: a narrow desktop window is the same layout problem. A
 * finger only loses the key caps, which it has no keys for. Everything keeps
 * clear of the notch and the home bar (\`env(safe-area-inset-*)\`).
 */
html.touch-ui .atlas-menu .ui-kbd { display: none; }
@media (max-width: 700px), (max-height: 520px) {
  .m-brand { top: max(14px, env(safe-area-inset-top)); left: max(16px, env(safe-area-inset-left)); }
  .m-wordmark { font-size: 32px; -webkit-text-stroke-width: 4px; text-shadow: 0 3px 0 var(--ui-ink); }
  .m-tagline { margin-top: 6px; font-size: 13px; }
  .m-crumbs { top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left)); gap: 8px; }
  .m-trail { height: 42px; }
  .m-top-right { top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); gap: 8px; }
  .m-search-box { height: 44px; }
  .m-search-box input { font-size: 16px; }
  .m-dock { bottom: max(4px, env(safe-area-inset-bottom)); gap: 0; padding: 4px; max-width: 100vw; box-sizing: border-box; }
  .m-dock-item { width: 72px; gap: 4px; padding: 8px 4px 6px; }
  .m-dock-item .world-disc { --d: 30px !important; }
  .m-dock-name { font-size: 12px; }
  .m-dock-sub { font-size: 10.5px; line-height: 14px; }
  .m-panel { padding: 14px 14px 10px; }
  .m-panel h2 { font-size: 21px; }
  .m-panel p { font-size: 12.5px; margin-top: 6px; }
  .m-panel .ui-btn { margin-top: 10px; }
  .m-info { padding: 16px 16px 14px; }
  .m-info h2 { font-size: 26px; }
  .m-info p { font-size: 13px; }
  .m-select { min-width: 0; gap: 10px; padding: 9px 9px 9px 12px; bottom: max(12px, env(safe-area-inset-bottom)); }
  .m-select-name { font-size: 18px; }
  .m-label { font-size: 11.5px; padding: 4px 8px; }
}
/*
 * Upright: the search across the top, the two ways on side by side over the
 * dock, and a stage's card a sheet along the bottom, so the globe keeps the
 * middle of the screen. The column on the right is taken apart for it
 * (\`display: contents\`) and each of its three placed on its own.
 */
@media (max-width: 700px) and (orientation: portrait) {
  .m-tagline { display: none; }
  .m-top-right { display: contents; }
  .m-search { position: absolute; top: calc(max(12px, env(safe-area-inset-top)) + 54px); left: 12px; right: 12px; width: auto; }
  .m-continue, .m-leave { position: absolute; bottom: calc(max(4px, env(safe-area-inset-bottom)) + 108px); }
  .m-continue { right: 12px; }
  .m-leave { left: 12px; }
  .atlas-menu:not([data-stage='system']) .m-continue { bottom: max(12px, env(safe-area-inset-bottom)); }
  .m-info {
    top: auto;
    left: 12px;
    right: 12px;
    bottom: calc(max(12px, env(safe-area-inset-bottom)) + 62px);
    width: auto;
    max-height: 46vh;
    transform: none;
  }
  .m-info.m-off { transform: translateY(24px); }
  .m-facts { gap: 8px 12px; margin-top: 12px; padding-top: 10px; }
}
/* On its side: one row of chrome at the top, the dock low, the cards narrow. */
@media (max-height: 520px) and (orientation: landscape) {
  .m-tagline { display: none; }
  /* The way to play and the search along the top right; the way back to the title under the name, where it has room. */
  .m-top-right { flex-direction: row-reverse; align-items: flex-start; }
  .m-search { width: min(260px, 34vw); }
  .m-continue, .m-leave { height: 44px; padding-top: 0; padding-bottom: 0; }
  .m-leave { position: fixed; top: calc(max(14px, env(safe-area-inset-top)) + 54px); left: max(16px, env(safe-area-inset-left)); }
  .m-info { right: max(12px, env(safe-area-inset-right)); width: 300px; top: calc(max(12px, env(safe-area-inset-top)) + 56px); max-height: calc(100vh - 56px - 24px); transform: none; }
  .m-info.m-off { transform: translateX(28px); }
  .m-facts { gap: 8px 12px; margin-top: 10px; padding-top: 10px; }
  .m-dock-item { padding: 6px 4px 4px; }
}
/*
 * A country on a small screen is its map and nothing else. The pins are the
 * choice: no list of its towns, no search and no way back but the crumbs'
 * arrow. Along the bottom one card, which is the country and its count until
 * a town is picked, and that town and the button that starts there once one is.
 */
@media (max-width: 700px), (max-height: 520px) {
  .atlas-menu[data-stage='region'] .m-search, .atlas-menu[data-stage='site'] .m-search,
  .atlas-menu[data-stage='region'] .m-continue { display: none; }
  .m-panel p, .m-list, .m-more { display: none; }
  .m-panel {
    top: auto;
    left: max(12px, env(safe-area-inset-left));
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(420px, calc(100vw - 24px));
    max-height: none;
    padding: 10px 14px;
  }
  .m-panel.m-off { transform: translateY(16px); }
  .m-panel h2 { font-size: 19px; }
  .m-country .ui-flag { width: 36px; height: 24px; }
  .m-country-sub::after { content: '. Pick one on the map'; }
  .atlas-menu.picking .m-panel { opacity: 0 !important; visibility: hidden; pointer-events: none !important; }
  .m-select {
    left: max(12px, env(safe-area-inset-left));
    right: auto;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(420px, calc(100vw - 24px));
    box-sizing: border-box;
    flex-wrap: wrap;
    transform: none;
  }
  .m-select.m-off { transform: translateY(16px); }
  .m-select > div { flex: 1; min-width: 0; }
  .m-select-sub { white-space: normal; }
  .m-select .ui-btn { margin-left: 0; width: 100%; justify-content: center; }
}
@media (max-height: 520px) and (orientation: landscape) {
  .m-select { flex-wrap: nowrap; width: auto; max-width: calc(100vw - 24px); }
  .m-select .ui-btn { width: auto; margin-left: auto; }
}

/* --- the cut that stands in for a flight --------------------------------- */
/* With less motion asked for, a flight is a cut, and this is what the cut is
   made under: space, lifted off the new shot in a quarter of a second. */
.m-dip {
  position: absolute;
  inset: 0;
  background: var(--ui-space);
  opacity: 0;
  pointer-events: none;
}
.m-dip.on { opacity: 1; }
.m-dip.lift { transition: opacity 0.28s ease; }

/* The cards fade and do not slide; the pop of the results is a fade too. */
@media (prefers-reduced-motion: reduce) {
  .atlas-menu .m-fade { transition: opacity 0.2s ease, visibility 0.2s; }
  .m-brand.m-off, .m-crumbs.m-off, .m-panel.m-off { transform: none; }
  .m-dock.m-off, .m-select.m-off { transform: translateX(-50%); }
  .m-info.m-off { transform: translateY(-46%); }
  .m-dock-item, .m-label, .m-pin { transition: none; }
  .m-results { animation-name: ui-fade; }
}
`;
