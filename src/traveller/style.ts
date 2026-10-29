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
.cr-head { display: flex; align-items: center; gap: 12px; color: ${hex(PALETTE.white)}; }
.cr-tools { display: flex; gap: 8px; margin-left: auto; }
/* A small round glass button: the creator's tools and its two framings. */
.cr-tool {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  color: ${hex(PALETTE.white)};
  background: rgba(30, 6, 3, 0.62);
  border: 1.5px solid rgba(255, 242, 232, 0.2);
  border-radius: 50%;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.2s ease;
}
.cr-tool svg { width: 19px; height: 19px; }
.cr-tool:hover { background: rgba(30, 6, 3, 0.82); border-color: rgba(255, 242, 232, 0.4); }
.cr-tool:disabled { opacity: 0.35; cursor: default; }
.cr-tool[aria-pressed='true'] { color: ${hex(PALETTE.ink)}; background: var(--ui-gold); border-color: var(--ui-gold); }
.cr-tool:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.cr-done, .cr-done:hover, .cr-done:active { width: 100%; justify-content: center; border: 0; border-radius: 16px; background: var(--ui-gold); background-image: none; box-shadow: none; transform: none; }
.cr-done:hover { filter: brightness(1.06); }
.cr-done svg { width: 20px; height: 20px; }
.cr-head h2 {
  margin: 0;
  min-width: 0;
  font-size: 32px;
  white-space: nowrap;
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 1;
  text-transform: uppercase;
  -webkit-text-stroke: 7px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 5px 0 rgba(30, 6, 3, 0.6);
}
.cr-main { flex: 1; min-height: 0; display: flex; gap: 12px; }
.cr-rail { display: flex; flex-direction: column; gap: 8px; flex: none; width: 78px; overflow-y: auto; scrollbar-width: none; padding: 4px; }
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
  border: 1.5px solid var(--ui-glass-edge);
  border-radius: 14px;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring), background 0.15s ease;
}
.cr-tab svg { width: 24px; height: 24px; }
.cr-tab:hover { background: rgba(30, 6, 3, 0.85); border-color: rgba(255, 242, 232, 0.34); }
/* Gold where it stands, never moved: the rail scrolls and clips whatever leaves it. */
.cr-tab[aria-selected='true'] { color: ${hex(PALETTE.ink)}; background: var(--ui-gold); border-color: var(--ui-gold); }
/* Inside the tab: the rail scrolls, and a ring drawn past a tab's edge would be clipped by it. */
.cr-tab:focus-visible { outline: var(--ui-ring); outline-offset: -4px; }
.cr-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.cr-page { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 18px 20px; scrollbar-width: thin; }
.cr-page[hidden] { display: none; }
.cr-page.fresh { animation: cr-in 0.3s var(--ui-ease) both; }
.cr-title { font-size: 12px; font-weight: 900; letter-spacing: 0.16em; line-height: 1; text-transform: uppercase; color: var(--ui-gold); }
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
  background: rgba(255, 242, 232, 0.06);
  border: 1.5px solid var(--ui-glass-edge);
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring), box-shadow 0.12s ease, background 0.15s ease;
}
.cr-tile:hover { transform: translateY(-2px); background: rgba(255, 242, 232, 0.12); }
.cr-tile:active { transform: translateY(1px); }
.cr-tile:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.cr-tile[aria-pressed='true'] { color: ${hex(PALETTE.ink)}; background: var(--ui-gold); border-color: var(--ui-gold); }
.cr-tile canvas {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background: radial-gradient(circle at 50% 40%, rgba(255, 242, 232, 0.22), rgba(255, 242, 232, 0.06) 70%);
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
  border: 2px solid ${hex(PALETTE.ink)};
  border-radius: 50%;
  color: ${hex(PALETTE.ink)};
  background: ${hex(PALETTE.white)};
}
.cr-tile .cr-tick svg { width: 13px; height: 13px; }
.cr-tile[aria-pressed='true'] .cr-tick { display: grid; }
.cr-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.cr-swatch {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 2px solid rgba(255, 242, 232, 0.35);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring);
}
.cr-swatch:hover { transform: translateY(-2px) scale(1.06); }
.cr-swatch[aria-pressed='true'] { box-shadow: 0 0 0 3px ${hex(PALETTE.ink)}, 0 0 0 6px var(--ui-gold); transform: scale(1.04); }
.cr-swatch:focus-visible { outline: var(--ui-ring); outline-offset: 6px; }
.cr-swatches.big .cr-swatch { width: 44px; height: 44px; }
.cr-views {
  position: absolute;
  right: 28px;
  top: 50%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.35s ease 0.1s;
}
.atlas-creator.on .cr-views { opacity: 1; }
@keyframes cr-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes cr-wait { from { opacity: 0.55; } to { opacity: 1; } }
@media (max-width: 760px) {
  .cr-side { left: 12px; right: 12px; top: auto; bottom: 12px; width: auto; height: 56vh; gap: 10px; }
  .cr-head h2 { display: none; }
  .cr-main { flex-direction: column; gap: 10px; }
  .cr-rail { flex-direction: row; width: auto; overflow-x: auto; overflow-y: hidden; }
  .cr-tab { width: 66px; height: 56px; }
  /* In the top corner, clear of the name plate over the traveller's head. */
  .cr-views { top: max(12px, env(safe-area-inset-top)); right: 12px; transform: none; }
  .cr-side { bottom: max(12px, env(safe-area-inset-bottom)); }
}
/* A phone on its side: the column in the height there is, the head a line. */
@media (max-height: 520px) and (orientation: landscape) {
  .cr-side { top: max(10px, env(safe-area-inset-top)); bottom: max(10px, env(safe-area-inset-bottom)); left: max(12px, env(safe-area-inset-left)); width: min(440px, 52vw); gap: 8px; }
  .cr-head h2 { font-size: 26px; -webkit-text-stroke-width: 5px; }
  .cr-rail { width: 66px; gap: 6px; }
  .cr-tab { height: 58px; }
  .cr-page { padding: 12px 14px 14px; }
  .cr-done { height: 44px; padding-top: 0; padding-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-side, .cr-views, .cr-tab, .cr-tile, .cr-swatch, .cr-tool { transition: none; }
  .cr-page.fresh, .cr-tile canvas:not(.drawn) { animation: none; }
}
`;
