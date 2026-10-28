/** The creator's stylesheet. */
import { PALETTE } from '../theme.ts';
import { hex } from '../ui.ts';

export const STYLE = `
.atlas-creator {
  position: fixed;
  inset: 0;
  z-index: 12;
  pointer-events: none;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  visibility: hidden;
  transition: visibility 0s 0.4s;
  --cr-centre: 62%;
}
.atlas-creator.on { visibility: visible; transition-delay: 0s; }
.cr-side {
  position: absolute;
  left: 24px;
  top: 24px;
  bottom: 24px;
  width: min(480px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  pointer-events: auto;
  opacity: 0;
  transform: translateX(-36px);
  transition: opacity 0.35s ease, transform 0.45s var(--ui-ease);
}
.atlas-creator.on .cr-side { opacity: 1; transform: none; }
.cr-head { display: flex; align-items: center; gap: 12px; color: var(--ui-paper); }
.cr-head h2 {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  -webkit-text-stroke: 6px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 4px 0 var(--ui-ink);
}
.cr-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: var(--ui-paper-dim); text-shadow: var(--ui-space-shadow); }
.cr-main { flex: 1; min-height: 0; display: flex; gap: 12px; }
.cr-rail { display: flex; flex-direction: column; gap: 8px; flex: none; width: 78px; overflow-y: auto; scrollbar-width: none; padding: 2px 2px 6px; }
.cr-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: none;
  height: 62px;
  padding: 0;
  font: 800 11.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: 14px;
  box-shadow: 0 4px 0 var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring), box-shadow 0.12s ease, background 0.15s ease;
}
.cr-tab svg { width: 24px; height: 24px; }
.cr-tab:hover { transform: translateX(3px); }
.cr-tab[aria-selected='true'] { background: var(--ui-gold); transform: translateX(6px); }
.cr-tab:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.cr-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.cr-page { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 18px 20px; scrollbar-width: thin; }
.cr-page[hidden] { display: none; }
.cr-page.fresh { animation: cr-in 0.3s var(--ui-ease) both; }
.cr-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.cr-section { margin-top: 16px; }
.cr-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
.cr-section-head output { font-size: 12.5px; font-weight: 800; }
.cr-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 9px; }
.cr-tiles.two { grid-template-columns: repeat(2, 1fr); }
.cr-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  padding: 5px 5px 7px;
  font: 800 12px/1.15 var(--ui-font);
  color: var(--ui-ink);
  text-align: center;
  background: var(--ui-paper);
  border: 2.5px solid var(--ui-ink);
  border-radius: 12px;
  box-shadow: 0 3px 0 var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring), box-shadow 0.12s ease, background 0.15s ease;
}
.cr-tile:hover { transform: translateY(-2px); box-shadow: 0 5px 0 var(--ui-ink); }
.cr-tile:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--ui-ink); }
.cr-tile:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.cr-tile[aria-pressed='true'] { background: var(--ui-gold); }
.cr-tile canvas {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background: radial-gradient(circle at 50% 40%, ${hex(PALETTE.white)}, ${hex(PALETTE.cream)} 70%);
}
.cr-tile canvas:not(.drawn) { animation: cr-wait 1.2s ease-in-out infinite alternate; }
.cr-tile .cr-tick {
  position: absolute;
  top: -7px;
  right: -7px;
  display: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-paper);
}
.cr-tile .cr-tick svg { width: 13px; height: 13px; }
.cr-tile[aria-pressed='true'] .cr-tick { display: grid; }
.cr-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.cr-swatch {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  box-shadow: 0 3px 0 var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring);
}
.cr-swatch:hover { transform: translateY(-2px) scale(1.06); }
.cr-swatch[aria-pressed='true'] { box-shadow: 0 0 0 3px var(--ui-paper), 0 0 0 6px var(--ui-ink); transform: scale(1.04); }
.cr-swatch:focus-visible { outline: var(--ui-ring); outline-offset: 6px; }
.cr-swatches.big .cr-swatch { width: 44px; height: 44px; }
.cr-foot { display: flex; align-items: center; gap: 8px; }
.cr-foot .cr-done { margin-left: auto; }
.cr-foot .ui-btn svg { width: 18px; height: 18px; }
.cr-views {
  position: absolute;
  left: var(--cr-centre);
  bottom: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.35s ease 0.1s;
}
.atlas-creator.on .cr-views { opacity: 1; }
.cr-hint { font-size: 12px; font-weight: 700; color: var(--ui-paper-dim); text-shadow: var(--ui-space-shadow); white-space: nowrap; }
@keyframes cr-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes cr-wait { from { opacity: 0.55; } to { opacity: 1; } }
@media (max-width: 760px) {
  .cr-side { left: 12px; right: 12px; top: auto; bottom: 12px; width: auto; height: 56vh; gap: 10px; }
  .cr-head { display: none; }
  .cr-main { flex-direction: column; gap: 10px; }
  .cr-rail { flex-direction: row; width: auto; overflow-x: auto; overflow-y: hidden; }
  .cr-tab { width: 66px; height: 56px; }
  .cr-tab[aria-selected='true'] { transform: translateY(-3px); }
  .cr-tab:hover { transform: none; }
  /* In the top corner, clear of the name plate over the traveller's head. */
  .cr-views { bottom: auto; top: max(12px, env(safe-area-inset-top)); left: 12px; transform: none; align-items: flex-start; }
  .cr-hint { display: none; }
  .cr-side { bottom: max(12px, env(safe-area-inset-bottom)); }
  .cr-foot { gap: 6px; }
  .cr-foot .ui-btn { padding-left: 10px; padding-right: 10px; gap: 6px; font-size: 13.5px; }
}
/* A phone on its side: the column in the height there is, the head a line. */
@media (max-height: 520px) and (orientation: landscape) {
  .cr-side { top: max(10px, env(safe-area-inset-top)); bottom: max(10px, env(safe-area-inset-bottom)); left: max(12px, env(safe-area-inset-left)); width: min(440px, 52vw); gap: 8px; }
  .cr-head h2 { font-size: 24px; -webkit-text-stroke-width: 4px; text-shadow: 0 3px 0 var(--ui-ink); }
  .cr-head p { display: none; }
  .cr-rail { width: 66px; gap: 6px; }
  .cr-tab { height: 58px; }
  .cr-page { padding: 12px 14px 14px; }
  .cr-title { font-size: 20px; }
  .cr-foot .ui-btn { height: 42px; padding-left: 10px; padding-right: 10px; font-size: 13.5px; }
  .cr-views { bottom: max(10px, env(safe-area-inset-bottom)); }
  .cr-hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-side, .cr-views, .cr-tab, .cr-tile, .cr-swatch { transition: none; }
  .cr-page.fresh, .cr-tile canvas:not(.drawn) { animation: none; }
}
`;
