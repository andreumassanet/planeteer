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
  color: var(--ui-paper);
  background: transparent;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.m-dock-item:hover, .m-dock-item.hot { background: rgba(255, 242, 232, 0.1); }
.m-dock-item:active { background: var(--ui-gold); color: var(--ui-ink); }
/* Inside the shelf, which clips a ring drawn past its edge. */
.m-dock-item:focus-visible { outline: var(--ui-ring); outline-offset: -3px; }
.m-dock-name { font-size: 13.5px; font-weight: 800; letter-spacing: -0.01em; }
.m-dock-sub {
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  color: rgba(255, 242, 232, 0.55);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* --- labels on the bodies ------------------------------------------------- */
.m-marks { position: absolute; inset: 0; pointer-events: none; }
/* A body's name as the world names its towns: capitals on an ink stroke, gold under the pointer. */
.m-label {
  position: absolute;
  left: 0;
  top: 0;
  font: 900 13px/1 var(--ui-font);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${hex(PALETTE.white)};
  background: none;
  border: 0;
  padding: 4px 6px;
  -webkit-text-stroke: 4px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 2px 8px rgba(4, 6, 14, 0.7);
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition: color 0.12s ease, opacity 0.25s ease;
}
.m-label.hot { color: var(--ui-gold); }
.m-label.inert { color: rgba(255, 242, 232, 0.7); }
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

/* --- the glass every panel is made of, as the HUD's ------------------------ */
.m-glass {
  background: rgba(30, 6, 3, 0.64);
  color: var(--ui-paper);
  border: 1.5px solid rgba(255, 242, 232, 0.14);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(4, 6, 14, 0.45);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
.m-glass .ui-kbd { background: rgba(255, 242, 232, 0.12); color: var(--ui-paper); border-color: rgba(255, 242, 232, 0.3); box-shadow: none; }
/* A quiet button on the glass: the gold one is the only loud thing on a screen. */
.m-ghost, .m-glass .ui-btn:not(.primary) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  font: 800 13.5px/1 var(--ui-font);
  color: var(--ui-paper);
  background: rgba(255, 242, 232, 0.1);
  border: 1.5px solid rgba(255, 242, 232, 0.22);
  border-radius: 999px;
  box-shadow: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.m-ghost:hover, .m-glass .ui-btn:not(.primary):hover { background: rgba(255, 242, 232, 0.2); border-color: rgba(255, 242, 232, 0.4); transform: none; box-shadow: none; }
.m-ghost svg { width: 16px; height: 16px; }
.m-ghost:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }

/* --- where you are: the path, and the place as a title ---------------------- */
.m-crumbs {
  position: absolute;
  top: 28px;
  left: 32px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-width: min(560px, calc(100vw - 420px));
}
.m-crumbs.m-off { transform: translateY(-12px); }
.m-trail { display: flex; align-items: center; gap: 2px; min-height: 24px; margin-left: -6px; }
.m-trail svg { width: 12px; height: 12px; color: var(--ui-gold); opacity: 0.8; }
.m-crumb {
  font: 900 11.5px/1 var(--ui-font);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ui-gold);
  background: none;
  border: 0;
  border-radius: 6px;
  padding: 5px 6px;
  text-shadow: var(--ui-space-shadow);
  cursor: pointer;
}
.m-crumb:hover { color: var(--ui-paper); }
.m-crumb.here { cursor: default; }
.m-crumb:focus-visible { outline: var(--ui-ring); outline-offset: 1px; }
.m-title {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 100%;
  margin: 0;
  font-size: clamp(34px, calc(2.4vw + 16px), 56px);
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 1.05;
  text-transform: uppercase;
  color: var(--ui-paper);
  -webkit-text-stroke: 8px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 5px 0 rgba(30, 6, 3, 0.6);
}
.m-title > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px 4px; }
.m-title-flag { flex: none; display: flex; filter: drop-shadow(0 3px 0 var(--ui-ink)); }
.m-title-flag .ui-flag { border-width: 2.5px; border-radius: 5px; }

/* --- under the title: a world's prompt, or a country's towns ------------------ */
.m-panel {
  position: absolute;
  top: calc(28px + 24px + 4px + clamp(34px, calc(2.4vw + 16px), 56px) * 1.05 + 22px);
  left: 32px;
  width: 300px;
  max-height: calc(100vh - 210px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.m-panel.m-off { transform: translateX(-24px); }
.m-panel.m-glass { padding: 14px 8px 8px 14px; align-items: stretch; gap: 10px; max-height: min(52vh, calc(100vh - 230px)); }
.m-prompt {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--ui-paper-dim);
  text-shadow: var(--ui-space-shadow);
}
.m-country-sub { padding-right: 6px; font-size: 11.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255, 242, 232, 0.55); }
.m-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 242, 232, 0.25) transparent;
}
.m-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  font: 700 14px/1.1 var(--ui-font);
  color: var(--ui-paper);
  text-align: left;
  background: none;
  border: 0;
  border-radius: 9px;
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.m-row:hover, .m-row.hot { background: rgba(255, 242, 232, 0.1); }
.m-row.picked { background: var(--ui-gold); color: var(--ui-ink); }
/* Inside the ring rather than outside it: the list scrolls, and a ring drawn
   past a row's edge is clipped by it. */
.m-row:focus-visible { outline: var(--ui-ring); outline-offset: -3px; }
.m-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-row em { font-style: normal; font-size: 10.5px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ui-gold); }
.m-row.picked em { color: var(--ui-ink); }
.m-row small { margin-left: auto; font-size: 12px; font-weight: 700; opacity: 0.55; font-variant-numeric: tabular-nums; }
.m-more { padding: 8px 10px 6px; font-size: 12px; font-weight: 700; color: rgba(255, 242, 232, 0.5); }

/* --- the search, top right; the way in and the way out, in the bottom corners - */
.m-top-right { position: absolute; top: 28px; right: 32px; }
.m-search { position: relative; z-index: 1; width: 320px; }
.m-search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 10px 0 14px;
  border-radius: 999px;
  cursor: text;
}
.m-search-box svg { flex: none; opacity: 0.7; }
.m-search-box input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: 700 14.5px var(--ui-font);
  color: var(--ui-paper);
}
.m-search-box input::placeholder { color: rgba(255, 242, 232, 0.5); }
.m-search-box input::-webkit-search-cancel-button { display: none; }
.m-search:focus-within .m-search-box { outline: var(--ui-ring); outline-offset: 3px; }
.m-results {
  position: absolute;
  top: 52px;
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
  border-radius: 10px;
  cursor: pointer;
}
.m-result.on { background: rgba(255, 242, 232, 0.12); }
.m-result-world { display: grid; place-items: center; flex: none; width: 26px; height: 18px; }
.m-result > div { flex: 1; min-width: 0; }
.m-result b { display: block; font-size: 14px; font-weight: 800; line-height: 1.15; }
.m-result small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 242, 232, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-result .ui-tag { margin-left: auto; background: rgba(255, 242, 232, 0.12); color: var(--ui-paper); border-color: rgba(255, 242, 232, 0.25); box-shadow: none; }
.m-empty { padding: 10px; font-size: 12.5px; font-weight: 600; color: rgba(255, 242, 232, 0.55); text-wrap: pretty; }
.m-continue {
  position: absolute;
  right: 32px;
  bottom: 28px;
}
.m-continue.m-off { transform: translateY(16px); }
.m-continue .quiet { font-weight: 700; opacity: 0.66; }
.m-leave {
  position: absolute;
  left: 32px;
  bottom: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  font: 800 13px/1 var(--ui-font);
  color: var(--ui-paper-dim);
  background: none;
  border: 0;
  text-shadow: var(--ui-space-shadow);
  cursor: pointer;
}
.m-leave:hover { color: var(--ui-paper); }
.m-leave .ui-kbd { background: rgba(255, 242, 232, 0.12); color: var(--ui-paper); border-color: rgba(255, 242, 232, 0.35); box-shadow: none; }
.m-leave:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
/* Where the shelf of worlds would reach the corners, the two step up over it. */
@media (max-width: 1500px) {
  .atlas-menu[data-stage='system'] .m-continue { bottom: 150px; }
  .atlas-menu[data-stage='system'] .m-leave { bottom: 156px; }
}

/* --- a body up close ------------------------------------------------------ */
.m-info {
  position: absolute;
  right: 32px;
  top: 50%;
  width: 340px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  transform: translateY(-46%);
  padding: 20px 20px 18px;
}
.m-info.m-off { transform: translate(28px, -46%); }
.m-info-sub { font-size: 11.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ui-gold); }
.m-info p { margin-top: 10px; font-size: 14px; font-weight: 600; line-height: 1.5; color: var(--ui-paper-dim); text-wrap: pretty; }
.m-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1.5px solid rgba(255, 242, 232, 0.14);
}
.m-fact small { display: block; font-size: 11.5px; font-weight: 700; color: rgba(255, 242, 232, 0.55); }
.m-fact b { display: block; margin-top: 1px; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.m-lines { display: grid; gap: 7px; margin-top: 14px; }
.m-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--ui-paper-dim);
}
.m-line svg { width: 15px; height: 15px; flex: none; margin-top: 1px; opacity: 0.55; }
.m-actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }

/* --- the town you picked -------------------------------------------------- */
.m-select {
  position: absolute;
  left: 50%;
  bottom: 28px;
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 420px;
  max-width: calc(100vw - 48px);
  padding: 10px 10px 10px 16px;
  border-radius: 999px;
  transform: translateX(-50%);
}
.m-select.m-off { transform: translate(-50%, 24px); }
.m-select .ui-flag { border-width: 2px; border-radius: 4px; }
.m-select-name { font-size: 20px; font-weight: 900; letter-spacing: -0.01em; line-height: 1.05; }
.m-select-sub { margin-top: 3px; font-size: 12px; font-weight: 700; color: rgba(255, 242, 232, 0.6); white-space: nowrap; font-variant-numeric: tabular-nums; }
.m-select .ui-btn { margin-left: auto; border-radius: 999px; }

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
.m-tip small { display: block; margin-top: 1px; font-size: 12.5px; font-weight: 600; color: rgba(255, 242, 232, 0.6); }
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
/*
 * A town is a dot on its place and its name over it, as the world names its
 * towns: white on an ink stroke, larger for a larger town, gold for the
 * capital and for the one picked. The anchor is the dot.
 */
.m-pin {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  padding: 0;
  border: 0;
  background: none;
  font: 800 13px/1 var(--ui-font);
  color: ${hex(PALETTE.white)};
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
}
.m-pin i {
  position: absolute;
  left: -5px;
  top: -5px;
  width: 10px;
  height: 10px;
  box-sizing: border-box;
  border: 2px solid ${hex(PALETTE.ink)};
  border-radius: 50%;
  background: ${hex(PALETTE.white)};
  transition: transform 0.12s var(--ui-spring), background 0.12s ease;
}
.m-pin span {
  position: absolute;
  left: 0;
  bottom: 9px;
  transform: translateX(-50%);
  padding: 2px 4px;
  -webkit-text-stroke: 4px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 2px 6px rgba(4, 6, 14, 0.6);
  transition: color 0.12s ease;
}
.m-pin.mid { font-size: 14.5px; }
.m-pin.big { font-size: 17px; font-weight: 900; }
.m-pin.big i { left: -6px; top: -6px; width: 12px; height: 12px; }
.m-pin.capital i { background: var(--ui-gold); }
.m-pin:hover, .m-pin.hot { z-index: 3; }
.m-pin:hover i, .m-pin.hot i { transform: scale(1.35); }
.m-pin:hover span, .m-pin.hot span { color: var(--ui-gold); }
.m-pin.picked { z-index: 4; }
.m-pin.picked i { background: var(--ui-gold); transform: scale(1.6); box-shadow: 0 0 0 4px rgba(228, 169, 12, 0.35); }
.m-pin.picked span { color: var(--ui-gold); font-size: 17px; font-weight: 900; }
.m-pin:focus-visible { outline: none; }
.m-pin:focus-visible i { outline: var(--ui-ring); outline-offset: 3px; }
/* A town whose name lost the collision is a dot, named under the pointer or once picked. */
.m-pin.away span { display: none; }
.m-pin.away:hover span, .m-pin.away.hot span, .m-pin.away.picked span { display: block; }

/* --- the curtain over the cut into the game -------------------------------- */
.atlas-curtain {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 40%, #1b2347 0%, #0b1024 55%, #04060e 100%);
  font-family: var(--ui-font);
  opacity: 0;
  transition: opacity 0.38s ease;
}
/* Where you are arriving, large, the bar under it, and a line worth knowing. */
.ac-centre { display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: min(720px, calc(100vw - 48px)); text-align: center; }
.ac-kicker { font-size: 13px; font-weight: 900; letter-spacing: 0.3em; text-transform: uppercase; color: var(--ui-gold); }
.ac-title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8px 6px;
  font-size: clamp(38px, calc(3vw + 18px), 72px);
  font-weight: 900;
  letter-spacing: 0.04em;
  line-height: 1.05;
  text-transform: uppercase;
  color: ${hex(PALETTE.white)};
  -webkit-text-stroke: 9px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 6px 0 rgba(30, 6, 3, 0.6);
}
.ac-sub { font-size: 15px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 242, 232, 0.6); }
.ac-bar {
  position: relative;
  width: min(360px, 70vw);
  height: 6px;
  margin-top: 22px;
  border-radius: 999px;
  background: rgba(255, 242, 232, 0.12);
  overflow: hidden;
}
.ac-bar > i {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--ui-gold);
  transform: scaleX(0.04);
  transform-origin: 0 50%;
  transition: transform 0.4s var(--ui-ease);
}
/* A shine that runs along the bar while the main thread is too busy to move it. */
.ac-bar::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30%;
  background: linear-gradient(90deg, transparent, rgba(255, 242, 232, 0.35), transparent);
  animation: ac-shine 1.4s linear infinite;
}
@keyframes ac-shine { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
.ac-tip { margin-top: 18px; max-width: 460px; font-size: 14px; font-weight: 700; line-height: 1.45; color: rgba(255, 242, 232, 0.7); text-wrap: balance; }
@media (prefers-reduced-motion: reduce) { .ac-bar::after { animation: none; } }
.atlas-curtain.on { opacity: 1; }
.atlas-curtain.lifting { transition: opacity 0.9s ease; }

@media (max-width: 900px) {
  .m-panel { width: 290px; }
  .m-search { width: 260px; }
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
  .m-crumbs { top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left)); max-width: calc(100vw - 24px); }
  .m-title { font-size: 28px; -webkit-text-stroke-width: 6px; }
  .m-top-right { top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); }
  .m-search-box { height: 44px; }
  .m-search-box input { font-size: 16px; }
  .m-dock { bottom: max(4px, env(safe-area-inset-bottom)); gap: 0; padding: 4px; max-width: 100vw; box-sizing: border-box; }
  .m-dock-item { width: 72px; gap: 4px; padding: 8px 4px 6px; }
  .m-dock-item .world-disc { --d: 30px !important; }
  .m-dock-name { font-size: 12px; }
  .m-dock-sub { font-size: 10.5px; line-height: 14px; }
  .m-info { padding: 16px 16px 14px; }
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
  .m-top-right { display: contents; }
  .m-search { position: absolute; top: calc(max(12px, env(safe-area-inset-top)) + 54px); left: 12px; right: 12px; width: auto; }
  .m-continue, .m-leave, .atlas-menu[data-stage='system'] .m-continue, .atlas-menu[data-stage='system'] .m-leave { bottom: calc(max(4px, env(safe-area-inset-bottom)) + 108px); }
  .m-continue { right: 12px; }
  .m-leave { left: 12px; }
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
  /* The way to play and the search along the top right; the way back to the title under the name, where it has room. */
  .m-search { width: min(260px, 34vw); }
  .atlas-menu[data-stage='system'] .m-continue { top: calc(max(12px, env(safe-area-inset-top)) + 54px); bottom: auto; right: max(12px, env(safe-area-inset-right)); }
  .atlas-menu[data-stage='system'] .m-leave { top: calc(max(14px, env(safe-area-inset-top)) + 64px); bottom: auto; left: max(16px, env(safe-area-inset-left)); }
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
  .atlas-menu[data-stage='region'] .m-search, .atlas-menu[data-stage='site'] .m-search { display: none; }
  .m-list, .m-more { display: none; }
  .m-panel {
    top: auto;
    left: max(12px, env(safe-area-inset-left));
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(420px, calc(100vw - 24px));
    max-height: none;
    padding: 10px 14px;
  }
  .m-panel.m-off { transform: translateY(16px); }
  .m-country-sub::after { content: ' · pick one on the map'; }
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
  .m-crumbs.m-off, .m-panel.m-off { transform: none; }
  .m-dock.m-off, .m-select.m-off { transform: translateX(-50%); }
  .m-info.m-off { transform: translateY(-46%); }
  .m-dock-item, .m-label, .m-pin { transition: none; }
  .m-results { animation-name: ui-fade; }
}
`;
