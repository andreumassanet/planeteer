/** The HUD's stylesheet. */
import { PALETTE } from '../theme.ts';
import { hex } from '../ui.ts';

export const STYLE = `
/*
 * The HUD's frame: one margin from every edge, grown with the window and kept
 * clear of a notch, and the sizes the corners hold. The minimap (top right,
 * \`index.html\`) and the chat (bottom left) stand on the same lines. The
 * corners: the bar top left, the disc top right with the cards under it, the
 * chat bottom left, the speedometer bottom right; the centre line holds the
 * toast at the top and the prompt and a vehicle's keys at the bottom.
 */
:root {
  --hud-edge: clamp(14px, calc(0.9vw + 8px), 28px);
  --hud-top: max(var(--hud-edge), env(safe-area-inset-top));
  --hud-left: max(var(--hud-edge), env(safe-area-inset-left));
  --hud-right: max(var(--hud-edge), env(safe-area-inset-right));
  --hud-bottom: max(var(--hud-edge), env(safe-area-inset-bottom));
  --hud-gap: 12px;
  /* The minimap's edge, its default \`size\` in \`minimap/constants.ts\`. */
  --hud-map: 180px;
  --hud-speedo: clamp(138px, 10.5vw, 184px);
}
.atlas-hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-hud canvas {
  display: block;
  border: 2px solid var(--ui-ink);
  border-radius: 4px;
}
.atlas-hud .ui-btn { pointer-events: auto; }

/* --- the bar, top left: two buttons and where you are ----------------------- */
/*
 * Never wider than the gap it has: the minimap stands \`--hud-right\` in from
 * the right and is \`--hud-map\` across, so "Democratic Republic of the Congo" gives way with an
 * ellipsis before it runs under the disc. The flag and the clock never do.
 */
.atlas-hud-bar {
  position: absolute;
  top: var(--hud-top);
  left: var(--hud-left);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: calc(100vw - var(--hud-left) - var(--hud-right) - var(--hud-map) - 2 * var(--hud-gap));
}
.atlas-hud-bar > .ui-btn { position: relative; flex: none; }
/* The key a button answers to, on its corner, where a controller game puts it. */
.atlas-hud-bar .atlas-hud-cap {
  position: absolute;
  right: -8px;
  bottom: -9px;
  height: 18px;
  min-width: 18px;
  padding: 0 4px;
  font-size: 10px;
  box-shadow: 0 2px 0 var(--ui-ink);
}
.atlas-place {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 5px 14px 5px 9px;
  opacity: 0;
  transform-origin: 0 50%;
  transition: opacity 0.35s ease, transform 0.3s var(--ui-spring);
}
.atlas-place.on { opacity: 1; }
.atlas-place.bump { transform: scale(1.03); }
.atlas-place > * { flex: none; }
.atlas-place-text { flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.atlas-place-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Tabular figures: the distance is rewritten every step. */
.atlas-place-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 15px;
  color: var(--ui-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.atlas-place-sub[hidden], .atlas-place-sub > [hidden] { display: none; }
.atlas-place-sub > span:first-child { overflow: hidden; text-overflow: ellipsis; }
/* The glyph points up the screen at rest, so the transform *is* the bearing. */
.atlas-place-arrow { display: inline-block; font-size: 12px; line-height: 1; color: var(--ui-ink); transition: transform 0.12s ease; }

/* The clock: the hour where you stand and the sky over it, a chip of its own. */
.atlas-clock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 44px;
  box-sizing: border-box;
  padding: 0 13px 0 11px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.atlas-clock.on { opacity: 1; }
.atlas-clock svg { width: 17px; height: 17px; }

/* --- the column under the minimap: the marker, a landmark ------------------ */
/*
 * One width, one side, one way in. A card that is not up takes no room, so
 * the landmark's card sits right under the disc when there is no marker; a
 * browser without discrete transitions shows and hides them without the slide.
 */
.atlas-side {
  position: absolute;
  top: calc(var(--hud-top) + var(--hud-map) + 18px);
  right: var(--hud-right);
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.atlas-side > .ui-card {
  box-sizing: border-box;
  opacity: 0;
  transform: translateX(16px);
  /* The second only where it is understood; elsewhere the first stands. */
  transition: opacity 0.3s ease, transform 0.4s var(--ui-ease), background 0.3s ease;
  transition: opacity 0.3s ease, transform 0.4s var(--ui-ease), background 0.3s ease, display 0.4s allow-discrete;
}
.atlas-side > .ui-card:not(.on):not(.in) { display: none; }
.atlas-side > .ui-card.on, .atlas-side > .ui-card.in { opacity: 1; transform: none; }
@starting-style {
  .atlas-side > .ui-card.on, .atlas-side > .ui-card.in { opacity: 0; transform: translateX(16px); }
}
.atlas-found-name {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.12;
}
.atlas-found-fact {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  opacity: 0.68;
}
/* The landmark card: the flag, then what it is, in the column's width. */
.atlas-found {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px 11px;
}
.atlas-found > :last-child { order: -1; flex: none; margin-top: 2px; }
.atlas-found-text { min-width: 0; }
.atlas-found-note {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  opacity: 0.8;
  text-wrap: pretty;
}
.atlas-found-note:empty { display: none; }

/* --- the destination, under the minimap -------------------------------------- */
.atlas-destination { padding: 9px 12px 10px; }
.atlas-destination.arrived { background: var(--ui-gold); }
.atlas-destination-head { display: flex; align-items: center; gap: 10px; }
.atlas-destination-name { font-size: 15px; font-weight: 800; letter-spacing: -0.012em; line-height: 1.15; }
.atlas-destination-sub { margin-top: 2px; font-size: 12.5px; font-weight: 600; opacity: 0.62; }
.atlas-destination-pin {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border: 2px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-violet);
  color: var(--ui-paper);
}
.atlas-destination-pin svg { width: 17px; height: 17px; }

/* The waypoint. Zero-sized, so its origin is exactly the point being marked. */
.atlas-waypoint { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity 0.25s ease; }
.atlas-waypoint.on { opacity: 1; }
.atlas-waypoint-pin {
  position: absolute;
  left: 0;
  top: -26px;
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  background: ${hex(PALETTE.violet)};
  border: 3px solid var(--ui-ink);
  /* Three round corners and one square one: the square corner is the tip. */
  border-radius: 50% 50% 50% 0;
  transform-origin: 0 100%;
}
.atlas-waypoint-label {
  position: absolute;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%);
  padding: 4px 10px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  border-radius: 10px;
}

/* --- a vehicle's keys, for a moment, along the bottom ------------------------- */
/*
 * Centred by its margins and not by a translate, because it has to be able to
 * wrap: a box placed at left: 50% is offered only half the screen, so a strip
 * allowed to wrap there broke in two at 800 px on a 1,600-pixel window.
 */
.atlas-hints {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--hud-bottom);
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 14px;
  width: max-content;
  max-width: calc(100vw - var(--hud-left) - var(--hud-right));
  box-sizing: border-box;
  padding: 6px 14px 6px 7px;
  font-size: 12.5px;
  font-weight: 700;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.3s ease, transform 0.35s var(--ui-ease);
}
.atlas-hints.on { opacity: 1; transform: none; }
.atlas-hints > span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.atlas-hints > span > span { display: inline-flex; gap: 3px; }
.atlas-hints-badge {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
}
.atlas-hints-badge svg { width: 16px; height: 16px; }

/* --- a toast, under the bar ---------------------------------------------------- */
.atlas-toast {
  position: absolute;
  left: 50%;
  top: calc(var(--hud-top) + 62px);
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(520px, calc(100vw - 48px));
  padding: 9px 16px 9px 11px;
  font-size: 15px;
  font-weight: 800;
  opacity: 0;
  transform: translate(-50%, -10px);
  transition: opacity 0.2s ease, transform 0.3s var(--ui-spring);
}
.atlas-toast.on { opacity: 1; transform: translate(-50%, 0); }
.atlas-toast svg { width: 19px; height: 19px; flex: none; }

/* --- the prompt: what E does here ------------------------------------------------- */
/*
 * Over the keys' row, so the two never share a line when both are up; or,
 * \`float\`, a tag over the thing itself, placed each frame by \`placePrompt\`
 * and faded with its distance.
 */
.atlas-prompt {
  position: absolute;
  left: 50%;
  bottom: calc(var(--hud-bottom) + 64px);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 14px 7px 8px;
  font-size: 15px;
  font-weight: 800;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px);
  transition: opacity 0.15s ease, transform 0.25s var(--ui-spring);
}
.atlas-prompt.on { opacity: 1; transform: translate(-50%, 0); }
.atlas-prompt svg { width: 19px; height: 19px; }
.atlas-prompt.float { left: 0; top: 0; bottom: auto; transition: opacity 0.15s ease; will-change: transform; }
.atlas-prompt.float.on { opacity: var(--cue-fade, 1); }
.atlas-prompt.float::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -9px;
  width: 11px;
  height: 11px;
  background: var(--ui-paper);
  border-right: 3px solid var(--ui-ink);
  border-bottom: 3px solid var(--ui-ink);
  transform: translateX(-50%) rotate(45deg);
}

/* --- the speedometer, bottom right, in a vehicle ------------------------------ */
.atlas-speedo {
  position: absolute;
  right: var(--hud-right);
  bottom: var(--hud-bottom);
  width: var(--hud-speedo);
  height: var(--hud-speedo);
  border-radius: 50%;
  padding: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateY(14px) scale(0.94);
  transition: opacity 0.25s ease, transform 0.35s var(--ui-spring);
}
.atlas-speedo.on { opacity: 1; transform: none; }
.atlas-speedo svg { display: block; width: 100%; height: 100%; }
.atlas-speedo text { font-family: var(--ui-font); fill: var(--ui-ink); }
.atlas-speedo .sp-num { font-size: 13px; font-weight: 800; text-anchor: middle; dominant-baseline: central; }
.atlas-speedo .sp-value { font-size: 40px; font-weight: 900; text-anchor: middle; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.atlas-speedo .sp-unit { font-size: 12px; font-weight: 800; text-anchor: middle; opacity: 0.6; letter-spacing: 0.04em; }
.atlas-speedo .sp-sub { font-size: 12.5px; font-weight: 800; text-anchor: middle; font-variant-numeric: tabular-nums; }
.atlas-speedo .sp-needle { transition: none; }
/* Room for the dial: the keys' row wraps in the middle, the frame counter stands over it. */
.atlas-hud:has(.atlas-speedo.on) .atlas-hints { max-width: calc(100vw - 2 * var(--hud-right) - 2 * var(--hud-speedo) - 2 * var(--hud-gap)); }
.atlas-hud:has(.atlas-speedo.on) .atlas-perf { bottom: calc(var(--hud-bottom) + var(--hud-speedo) + var(--hud-gap)); }

/* --- everything away: H ------------------------------------------------------- */
/*
 * The overlay and the pieces other files own that are part of it — the
 * minimap, the chat's standing lines, a conversation's bubble, a stamp
 * coming down and the country names over the land — go; the pause card, the
 * welcome and a toast saying how to get it all back stay, since they are how
 * you do.
 */
.atlas-hud.hidden > :not(.atlas-pause):not(.atlas-welcome):not(.atlas-toast),
body.atlas-hud-hidden #minimap,
body.atlas-hud-hidden .atlas-bubble,
body.atlas-hud-hidden .atlas-stamp-drop,
body.atlas-hud-hidden .atlas-names,
body.atlas-hud-hidden .atlas-chat:not(.open) {
  opacity: 0 !important;
  visibility: hidden;
  transition: opacity 0.25s ease, visibility 0s 0.25s;
}

/* --- the pause card ------------------------------------------------------------ */
.atlas-pause {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, -50%) scale(0.96);
  transition: opacity 0.2s ease, transform 0.3s var(--ui-spring), visibility 0.2s;
}
.atlas-pause.on { opacity: 1; visibility: visible; transform: translate(-50%, -50%); }
.atlas-pause-main { display: flex; align-items: center; gap: 14px; padding: 13px 22px 13px 13px; }
.atlas-pause-mouse {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 3px solid var(--ui-ink);
  border-radius: 13px;
  background: var(--ui-gold);
}
.atlas-pause-mouse svg { width: 26px; height: 26px; }
.atlas-pause b { display: block; font-size: 18px; font-weight: 800; letter-spacing: -0.015em; }
.atlas-pause small { display: block; margin-top: 2px; font-size: 12.5px; font-weight: 600; opacity: 0.6; }

/* --- the welcome card, once --------------------------------------------------- */
.atlas-welcome {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(30, 6, 3, 0.36);
  opacity: 0;
  visibility: hidden;
  pointer-events: auto;
  transition: opacity 0.25s ease, visibility 0.25s;
}
.atlas-welcome.on { opacity: 1; visibility: visible; }
.atlas-welcome.on .atlas-welcome-card { animation: ui-pop 0.4s var(--ui-spring) both; }
.atlas-welcome-card { width: min(470px, 100%); padding: 22px 24px 20px; }
.atlas-welcome-title { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; text-wrap: balance; }
.atlas-welcome-sub { margin-top: 6px; font-size: 13.5px; font-weight: 600; line-height: 1.45; color: var(--ui-muted); text-wrap: pretty; }
.atlas-welcome-list {
  display: grid;
  gap: 10px;
  margin: 16px 0 18px;
  padding-top: 14px;
  border-top: 2.5px solid var(--ui-rule);
}
.atlas-welcome-row { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 700; line-height: 1.3; }
.atlas-welcome-row > span:first-child { display: flex; flex: none; gap: 4px; min-width: 60px; }
.atlas-welcome-go { width: 100%; }

/* --- frames ----------------------------------------------------------------------- */
.atlas-perf {
  position: absolute;
  right: var(--hud-right);
  bottom: var(--hud-bottom);
  display: none;
  gap: 12px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.atlas-perf.on { display: flex; }
.atlas-perf span { opacity: 0.55; font-weight: 700; margin-left: 3px; }

/* --- on a touch screen ------------------------------------------------------ */
/*
 * The bar is one button and where you are: the rest of it is in the sheet
 * that button opens, and the map is the minimap, which a finger can tap. The
 * keys' row and the prompt give way to the touch controls' own buttons and
 * pill (\`touch.ts\`), and nothing shows a key cap.
 */
.atlas-hud-more { display: none; }
html.touch-ui .atlas-hud-more { display: grid; }
html.touch-ui .atlas-hud-bar > .atlas-hud-desk,
html.touch-ui .atlas-hud-cap,
html.touch-ui .atlas-hints,
html.touch-ui .atlas-prompt { display: none; }
html.touch-ui .atlas-hud-bar {
  top: max(10px, env(safe-area-inset-top));
  left: max(10px, env(safe-area-inset-left));
  gap: 8px;
  max-width: calc(100vw - 150px - env(safe-area-inset-left));
}
html.touch-ui .atlas-place { min-height: 44px; padding: 4px 12px 4px 8px; }
html.touch-ui .atlas-place-name { font-size: 15px; }
html.touch-ui #minimap {
  top: max(10px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
  transform: scale(0.6);
  transform-origin: 100% 0;
  pointer-events: auto;
}
html.touch-ui .atlas-side {
  top: calc(max(10px, env(safe-area-inset-top)) + 136px);
  left: 12px;
  right: 12px;
  width: auto;
  max-width: 380px;
  margin: 0 auto;
}
html.touch-ui .atlas-found-note {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
html.touch-ui .atlas-toast { top: calc(max(10px, env(safe-area-inset-top)) + 136px); font-size: 14px; }
/* A finger's dial: small, under the bar, clear of both thumbs. */
html.touch-ui .atlas-speedo {
  --hud-speedo: 104px;
  right: auto;
  bottom: auto;
  left: max(10px, env(safe-area-inset-left));
  top: calc(max(10px, env(safe-area-inset-top)) + 56px);
}
html.touch-ui .atlas-speedo .sp-num { font-size: 15px; }
html.touch-ui .atlas-waypoint-label { max-width: 160px; }
html.touch-ui .atlas-chat:not(.open) {
  left: max(12px, env(safe-area-inset-left));
  bottom: calc(env(safe-area-inset-bottom) + 176px);
  width: min(300px, calc(100vw - 24px));
}
html.touch-ui .atlas-chat-log { max-height: min(24vh, 200px); }
html.touch-ui .atlas-welcome { padding: 14px; }
html.touch-ui .atlas-welcome-card { padding: 18px 18px 16px; max-height: calc(100% - 8px); overflow-y: auto; }
html.touch-ui .atlas-welcome-row > span:first-child { min-width: 0; }
/* Wide enough for the clock beside the badge only on its side. */
@media (orientation: portrait) {
  html.touch-ui .atlas-hud-bar > .atlas-clock { display: none; }
  html.touch-ui .atlas-hud:has(.atlas-speedo.on) .atlas-side { top: calc(max(10px, env(safe-area-inset-top)) + 172px); }
}
/* A phone on its side: the cards between the badge and the disc, at the top. */
@media (orientation: landscape) and (max-height: 520px) {
  html.touch-ui #minimap { transform: scale(0.5); }
  html.touch-ui .atlas-hud-bar { max-width: calc(100vw - 130px - 330px); }
  html.touch-ui .atlas-side {
    top: max(10px, env(safe-area-inset-top));
    left: auto;
    right: calc(max(10px, env(safe-area-inset-right)) + 116px);
    width: 300px;
    margin: 0;
  }
  html.touch-ui .atlas-found-note { -webkit-line-clamp: 2; }
  html.touch-ui .atlas-toast { top: calc(max(10px, env(safe-area-inset-top)) + 54px); }
  html.touch-ui .atlas-chat:not(.open) { bottom: calc(env(safe-area-inset-bottom) + 150px); }
  html.touch-ui .atlas-welcome-card { width: min(640px, 100%); padding: 14px 16px 12px; }
  html.touch-ui .atlas-welcome-title { font-size: 19px; }
  html.touch-ui .atlas-welcome-sub { display: none; }
  html.touch-ui .atlas-welcome-list { grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 10px 0 12px; padding-top: 10px; }
  html.touch-ui .atlas-welcome-row { font-size: 13px; gap: 9px; }
}

/* The sheet behind the bar's one button: everything else the bar had, and the keys nobody has. */
.atlas-sheet {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: rgba(30, 6, 3, 0.4);
  pointer-events: auto;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s;
}
.atlas-sheet.on { opacity: 1; visibility: visible; }
/* The chat's standing lines stand over the HUD, so the sheet puts them away while it is up. */
body:has(.atlas-sheet.on) .atlas-chat:not(.open) { opacity: 0; visibility: hidden; }
.atlas-sheet-card {
  width: min(460px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 14px 14px 16px;
  transform: translateY(24px);
  transition: transform 0.3s var(--ui-ease);
}
.atlas-sheet.on .atlas-sheet-card { transform: none; }
.atlas-sheet-head { display: flex; align-items: center; gap: 10px; margin: 0 2px 12px; }
.atlas-sheet-head b { flex: 1; font-size: 18px; font-weight: 800; letter-spacing: -0.015em; }
.atlas-sheet-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.atlas-sheet-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 74px;
  padding: 8px 4px;
  font: 800 12px/1.15 var(--ui-font);
  text-align: center;
  white-space: normal;
}
.atlas-sheet-tile svg { width: 24px; height: 24px; }
.atlas-sheet-tile.on { background: var(--ui-gold); }
@media (orientation: landscape) and (max-height: 520px) {
  .atlas-sheet { align-items: center; }
  .atlas-sheet-card { width: min(620px, 100%); }
  .atlas-sheet-grid { grid-template-columns: repeat(5, 1fr); }
  .atlas-sheet-tile { min-height: 64px; }
}

/*
 * Nothing slides for a player who has asked the system for less motion: every
 * card comes and goes where it stands, by its opacity alone. The badge's
 * arrow turns without easing, and the badge does not jolt.
 */
@media (prefers-reduced-motion: reduce) {
  .atlas-side > .ui-card, .atlas-side > .ui-card.on, .atlas-side > .ui-card.in { transform: none; transition: opacity 0.2s ease; }
  .atlas-toast, .atlas-toast.on { transform: translate(-50%, 0); transition: opacity 0.2s ease; }
  .atlas-hints, .atlas-hints.on { transform: none; transition: opacity 0.2s ease; }
  .atlas-prompt, .atlas-prompt.on { transform: translate(-50%, 0); }
  .atlas-speedo, .atlas-speedo.on { transform: none; transition: opacity 0.2s ease; }
  .atlas-pause, .atlas-pause.on { transform: translate(-50%, -50%); }
  .atlas-place, .atlas-place.bump { transform: none; transition: opacity 0.2s ease; }
  .atlas-welcome.on .atlas-welcome-card { animation: none; }
  .atlas-place-arrow { transition: none; }
}
`;
