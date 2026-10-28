/** The settings card's stylesheet. */

export const STYLE = `
.atlas-settings {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(30, 6, 3, 0.52);
  backdrop-filter: blur(4px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-settings.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.atlas-settings.on .atlas-settings-panel { animation: ui-pop 0.32s var(--ui-spring) both; }
.atlas-settings-panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1040px, 100%);
  height: min(720px, calc(100vh - 48px));
  height: min(720px, calc(100dvh - 48px));
  padding: 0;
  overflow: hidden;
}
.atlas-settings-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px 18px;
  border-bottom: 2.5px solid var(--ui-rule);
}
.atlas-settings-body {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
}
/* --- the rail: a page a button, its picture and its name ------------------- */
.atlas-settings-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 14px;
  border-right: 2.5px solid var(--ui-rule);
  background: var(--ui-cream);
}
.atlas-settings-rail button {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px 12px;
  border: 2.5px solid transparent;
  border-radius: 12px;
  background: transparent;
  font: 800 14.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}
.atlas-settings-rail button svg { flex: none; width: 20px; height: 20px; }
.atlas-settings-rail button:hover { background: var(--ui-hover); }
.atlas-settings-rail button[aria-selected='true'] {
  border-color: var(--ui-ink);
  background: var(--ui-gold);
  box-shadow: 0 3px 0 var(--ui-ink);
  transform: translateY(-1px);
}
.atlas-settings-rail button:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-settings-rail button[hidden] { display: none; }
.atlas-settings-content {
  position: relative;
  min-height: 0;
  overflow: auto;
  padding: 20px 28px 0;
  scrollbar-width: thin;
}
.atlas-settings-page-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
.atlas-settings-page-note { margin: 4px 0 0; font-size: 13px; font-weight: 600; line-height: 1.4; color: var(--ui-muted); text-wrap: pretty; }
.atlas-settings-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.atlas-settings-sub { margin-top: 4px; font-size: 13px; font-weight: 600; color: var(--ui-muted); }
.atlas-settings-close { margin-left: auto; }
.atlas-settings-page { padding-bottom: 24px; }
/* The controls page ends on its foot, which is held to the bottom of the card. */
#atlas-settings-controls { padding-bottom: 0; }
.atlas-settings-page[hidden] { display: none; }
.atlas-settings-section {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 2.5px solid var(--ui-rule);
}
.atlas-settings-page-note + .atlas-settings-section,
.atlas-settings-page-title + .atlas-settings-section { margin-top: 14px; }
.atlas-settings-section > .ui-label { margin-bottom: 4px; }

/* --- a setting: its name, its ?, its control, on one line ----------------- */
.atlas-settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 46px;
  padding: 4px 0;
}
.atlas-settings-row + .atlas-settings-row { border-top: 1.5px dashed var(--ui-rule); }
.atlas-settings-label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.atlas-settings-side { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.atlas-settings-side .ui-range { width: 240px; }
.atlas-settings-value {
  min-width: 92px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.atlas-settings-value small { display: block; font-size: 11px; font-weight: 700; opacity: 0.55; }

/* --- the ?, and what it says ------------------------------------------------ */
.atlas-settings-tip {
  display: grid;
  place-items: center;
  flex: none;
  width: 19px;
  height: 19px;
  padding: 0;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: transparent;
  font: 800 11px/1 var(--ui-font);
  color: var(--ui-muted);
  cursor: help;
  transition: color 0.15s ease, background 0.15s ease;
}
.atlas-settings-tip:hover, .atlas-settings-tip:focus-visible { color: var(--ui-ink); background: var(--ui-gold); border-color: var(--ui-ink); }
.atlas-settings-tip:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-settings-bubble {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 2;
  width: max-content;
  max-width: 290px;
  padding: 8px 11px;
  border-radius: 10px;
  background: var(--ui-ink);
  color: var(--ui-paper);
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-3px);
  transition: opacity 0.12s ease, transform 0.12s ease, visibility 0s 0.12s;
}
.atlas-settings-tip:hover + .atlas-settings-bubble,
.atlas-settings-tip:focus-visible + .atlas-settings-bubble {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition-delay: 0.15s, 0.15s, 0s;
}

/* --- the controls page: an action a line, its keys on the right ------------ */
.atlas-settings-binds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 36px;
}
/* The last line of each column ends on the section's rule, not a dash of its own. */
.atlas-settings-binds > .atlas-settings-bind:nth-last-child(-n + 2):nth-child(odd),
.atlas-settings-binds > .atlas-settings-bind:last-child { border-bottom-color: transparent; }
.atlas-settings-bind {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  border-bottom: 1.5px dashed var(--ui-rule);
  font-size: 14px;
  font-weight: 750;
}
.atlas-settings-bind .atlas-settings-label { font-size: 14px; font-weight: 750; }
.atlas-settings-bind .atlas-settings-label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-settings-keys { display: flex; align-items: center; gap: 6px; flex: none; }
/* The cap is the button: one box, raised, pressed while it listens. */
.atlas-settings-cap {
  display: inline-grid;
  place-items: center;
  min-width: 34px;
  height: 28px;
  padding: 0 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 7px;
  background: var(--ui-paper);
  box-shadow: 0 3px 0 var(--ui-ink);
  font: 800 12.5px/1 var(--ui-font);
  color: var(--ui-ink);
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.09s ease;
}
.atlas-settings-cap:hover { background: var(--ui-cream); }
.atlas-settings-cap:active { box-shadow: 0 1px 0 var(--ui-ink); }
.atlas-settings-cap:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-settings-cap.spare { box-shadow: 0 2px 0 var(--ui-ink); color: var(--ui-muted); border-color: rgba(30, 6, 3, 0.55); }
.atlas-settings-cap.listening {
  min-width: 96px;
  background: var(--ui-gold);
  animation: atlas-settings-listen 1.1s ease-in-out infinite;
}
.atlas-settings-cap.moved { animation: atlas-settings-moved 0.6s ease; }
.atlas-settings-cap.fixed { cursor: default; background: transparent; box-shadow: none; border-style: dashed; color: var(--ui-muted); }
@keyframes atlas-settings-listen { 50% { background: var(--ui-cream); } }
@keyframes atlas-settings-moved { from { background: var(--ui-gold); } }

/* Held to the bottom of the card, so what a key did is said where it is seen. */
.atlas-settings-foot {
  position: sticky;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 14px -28px 0;
  padding: 12px 28px 14px;
  border-top: 2.5px solid var(--ui-rule);
  background: var(--ui-paper);
}
.atlas-settings-status { min-height: 17px; font-size: 12.5px; font-weight: 700; line-height: 1.35; color: var(--ui-muted); }
.atlas-settings-status.warn { color: var(--ui-crimson); }

/* --- who made what --------------------------------------------------------- */
.atlas-settings-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.atlas-settings-links .ui-btn { text-decoration: none; }
.atlas-settings-credit {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 14px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}
.atlas-settings-credit dt { font-weight: 800; opacity: 0.55; }
.atlas-settings-credit dd { margin: 0; opacity: 0.75; }
.atlas-settings-credit a { color: inherit; text-underline-offset: 2px; }
.atlas-settings-credit a:focus-visible { outline: var(--ui-ring); outline-offset: 2px; border-radius: 3px; }

@media (max-width: 720px) {
  .atlas-settings { padding: 12px; }
  .atlas-settings-panel { height: calc(100vh - 24px); height: calc(100dvh - 24px); }
  .atlas-settings-head { padding: 14px 16px; }
  .atlas-settings-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .atlas-settings-rail { flex-direction: row; overflow-x: auto; padding: 10px 12px; border-right: 0; border-bottom: 2.5px solid var(--ui-rule); }
  .atlas-settings-rail button { width: auto; flex: none; }
  .atlas-settings-content { padding: 16px 16px 0; }
  .atlas-settings-foot { margin: 14px -16px 0; padding: 12px 16px 14px; }
  .atlas-settings-binds { grid-template-columns: 1fr; }
  .atlas-settings-row { grid-template-columns: 1fr; gap: 6px; padding: 8px 0; }
  .atlas-settings-side { justify-content: flex-start; flex-wrap: wrap; }
  .atlas-settings-side .ui-range { width: 160px; }
}
/* A phone on its side: the head a line, the rail narrower, the page given the height. */
@media (max-height: 520px) {
  .atlas-settings { padding: max(8px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
  .atlas-settings-panel { height: 100%; }
  .atlas-settings-head { padding: 8px 14px; gap: 10px; }
  .atlas-settings-title { font-size: 20px; }
  .atlas-settings-sub { display: none; }
  .atlas-settings-rail button { padding-top: 8px; padding-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-settings.on .atlas-settings-panel { animation: none; }
  .atlas-settings-rail button { transition: none; }
  .atlas-settings-cap, .atlas-settings-cap.listening, .atlas-settings-cap.moved { animation: none; transition: none; }
  .atlas-settings-bubble { transition: none; }
}
`;
