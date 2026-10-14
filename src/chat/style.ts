/** The chat's timing limits and stylesheet. */

/** How long a line stands on the screen with the field closed, and how long it takes to go. */
export const LINE_MS = 12_000;
export const FADE_MS = 900;
/** How many lines the panel keeps; the oldest go first. */
export const KEEP_LINES = 120;
/** How many lines typed, for the arrows to walk back through. */
export const KEEP_SENT = 30;
/** How many lines' keys are remembered against a reconnection's history showing them twice. */
export const SEEN_LINES = 500;
/** The most players `/who` lists by name. */
export const WHO_LIST = 12;

export const STYLE = `
.atlas-chat {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 6;
  width: min(380px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  pointer-events: none;
}
/* Over the prompt and a vehicle's keys, which are centred along the bottom,
   once the window is too narrow for the two to stand side by side. */
@media (max-width: 1180px) {
  .atlas-chat { bottom: 140px; }
}
/*
 * A finger's chat. Shut, a few short lines over the stick. Open, it goes to
 * the top of the screen, where the phone's keyboard never covers what is
 * being typed, with the suggestions under the field rather than over it; and
 * the field is 16 px, under which iOS zooms the page into it. It sends with
 * the keyboard's own key and closes when the world is touched.
 */
html.touch-ui .atlas-chat .ui-kbd { display: none; }
html.touch-ui .atlas-chat:not(.open) .atlas-chat-log { max-height: min(18vh, 120px); }
html.touch-ui .atlas-chat:not(.open) .atlas-chat-line { font-size: 12.5px; padding: 3px 8px 3px 6px; }
html.touch-ui .atlas-chat.open {
  top: max(10px, env(safe-area-inset-top));
  bottom: auto;
  left: max(10px, env(safe-area-inset-left));
  right: max(10px, env(safe-area-inset-right));
  width: auto;
  max-width: 560px;
  margin: 0 auto;
}
html.touch-ui .atlas-chat.open .atlas-chat-log { max-height: min(26vh, 220px); padding: 6px; }
html.touch-ui .atlas-chat-form input, html.touch-ui .atlas-chat-ghost { font-size: 16px; }
html.touch-ui .atlas-chat-form input { height: 36px; }
html.touch-ui .atlas-chat-suggest { top: calc(100% + 6px); bottom: auto; max-height: min(28vh, 240px); }
/* While it is open it has the top of the screen to itself: the HUD under it steps out. */
html.touch-ui .atlas-chat.open .atlas-chat-head { display: none; }
html.touch-ui body:has(.atlas-chat.open) .atlas-hud > :not(.atlas-toast),
html.touch-ui body:has(.atlas-chat.open) #minimap { opacity: 0; visibility: hidden; }
.atlas-chat-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(34vh, 260px);
  overflow: hidden;
  scrollbar-width: thin;
}
/* Room under the last line for its drop, which the log's clip would cut off. */
.atlas-chat:not(.open) .atlas-chat-log { padding-bottom: 4px; }
.atlas-chat-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  align-self: flex-start;
  max-width: 100%;
  box-sizing: border-box;
  padding: 5px 10px 5px 7px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  background: var(--ui-paper);
  border: 2px solid var(--ui-ink);
  border-radius: 10px;
  box-shadow: 0 3px 0 var(--ui-ink);
  transition: opacity ${FADE_MS}ms ease;
  animation: ui-pop 0.25s var(--ui-spring) both;
}
.atlas-chat-line .who { flex: none; font-weight: 800; white-space: nowrap; }
.atlas-chat-line .flag { flex: none; align-self: center; display: block; width: 18px; height: 12px; border: 1.5px solid var(--ui-ink); border-radius: 3px; }
.atlas-chat-line .flag.sea { background: var(--ui-sky); }
.atlas-chat-line .world-disc { align-self: center; margin: 0 3px; }
.atlas-chat-line .where { flex: none; align-self: center; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.6; }
.atlas-chat-line.self .who { color: var(--ui-violet); }
.atlas-chat-line.me .text { font-style: italic; }
.atlas-chat-line.system { background: var(--ui-cream); font-weight: 700; color: var(--ui-muted); }
.atlas-chat-line.system svg { flex: none; align-self: center; width: 14px; height: 14px; }
.atlas-chat-line.error { background: var(--ui-apricot); color: var(--ui-ink); }
.atlas-chat-line.fading { opacity: 0; }
.atlas-chat:not(.open) .atlas-chat-line.gone { display: none; }
.atlas-chat.open { pointer-events: auto; }
.atlas-chat.open .atlas-chat-log {
  max-height: min(46vh, 380px);
  overflow-y: auto;
  padding: 8px;
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: var(--ui-radius);
  box-shadow: var(--ui-drop);
}
.atlas-chat.open .atlas-chat-line { opacity: 1; border-color: transparent; box-shadow: none; padding: 2px 4px; background: transparent; animation: none; }
.atlas-chat.open .atlas-chat-line.system { color: var(--ui-muted); }
.atlas-chat.open .atlas-chat-line.error { background: var(--ui-apricot); border-radius: 8px; padding: 2px 6px; }
.atlas-chat-form {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 12px;
}
.atlas-chat.open .atlas-chat-form { display: flex; }
.atlas-chat-form input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 0;
  background: transparent;
  font: 700 14px var(--ui-font);
  color: var(--ui-ink);
  outline: none;
}
.atlas-chat-form input::placeholder { color: rgba(30, 6, 3, 0.45); }
.atlas-chat-form:focus-within { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-chat-head { display: none; align-items: center; justify-content: space-between; gap: 10px; padding: 0 4px; }
.atlas-chat.open .atlas-chat-head { display: flex; }
.atlas-chat-head .ui-eyebrow { opacity: 0.8; }
.atlas-chat-count { font-size: 11px; font-weight: 800; color: var(--ui-muted); }
.atlas-chat-entry { position: relative; }
.atlas-chat-field { position: relative; flex: 1; min-width: 0; display: flex; }
.atlas-chat-ghost {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: pre;
  font: 700 14px var(--ui-font);
  pointer-events: none;
}
.atlas-chat-ghost .typed { color: transparent; }
.atlas-chat-ghost .more { color: rgba(30, 6, 3, 0.38); }
.atlas-chat-suggest {
  display: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  max-height: min(40vh, 318px);
  overflow-y: auto;
  margin: 0;
  padding: 5px;
  list-style: none;
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: var(--ui-radius);
  box-shadow: var(--ui-drop);
  scrollbar-width: thin;
}
.atlas-chat.open .atlas-chat-suggest.shown { display: block; }
.atlas-chat-suggest li {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  align-items: baseline;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.3;
}
.atlas-chat-suggest li .name { font-weight: 800; white-space: nowrap; }
.atlas-chat-suggest li .usage { font-weight: 700; color: var(--ui-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-chat-suggest li .detail { grid-column: 1 / -1; font-size: 11.5px; font-weight: 600; color: var(--ui-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-chat-suggest li[aria-selected='true'] { background: var(--ui-cream); box-shadow: inset 0 0 0 2px var(--ui-ink); }
.atlas-chat-suggest-keys { padding: 4px 8px 1px; font-size: 10.5px; font-weight: 800; color: var(--ui-muted); letter-spacing: 0.02em; }
@media (prefers-reduced-motion: reduce) {
  .atlas-chat-line { animation: none; transition: none; }
}
`;

