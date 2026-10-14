/** The passport's stylesheet. */
import { hex } from '../ui.ts';
import { PALETTE } from '../theme.ts';
import {
  BOOK_H, BOOK_W, COLUMNS, COVER_PAD, DISC, GRAIN, GUILLOCHE, HINT_ROOM, LEATHER, LEATHER_DEEP, SHEET_H, SHEET_W, TAB_ROOM, WEAVE, inked,
} from './constants.ts';

export const STYLE = `
.atlas-passport {
  position: fixed;
  inset: 0;
  z-index: 12;
  display: grid;
  place-items: center;
  background: rgba(30, 6, 3, 0.58);
  backdrop-filter: blur(4px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  user-select: none;
  -webkit-user-select: none;
}
.atlas-passport.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.p-panel { outline: none; }
.atlas-passport.on .p-panel { animation: ui-pop 0.36s var(--ui-spring) both; }
.p-fit { position: relative; }
.p-scaler { position: absolute; left: 0; top: 0; width: ${SHEET_W}px; height: ${SHEET_H}px; transform-origin: 0 0; }

/* --- the cover, and the bookmarks standing out of it ----------------------- */
.p-cover-back {
  position: absolute;
  left: 0;
  top: ${TAB_ROOM}px;
  width: ${SHEET_W}px;
  height: ${BOOK_H + 2 * COVER_PAD}px;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 18px;
  background-color: ${LEATHER};
  background-image: ${WEAVE}, linear-gradient(90deg, transparent 47%, ${LEATHER_DEEP} 50%, transparent 53%);
  box-shadow: 0 8px 0 rgba(30, 6, 3, 0.45);
  z-index: 0;
}
.p-ribbons {
  position: absolute;
  left: ${COVER_PAD + 18}px;
  right: ${COVER_PAD + 18}px;
  top: 0;
  height: ${TAB_ROOM + COVER_PAD + 18}px;
  display: flex;
  gap: 6px;
  z-index: 1;
}
.p-tab {
  position: relative;
  top: 9px;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 6px 6px 0;
  border: 2.5px solid var(--ui-ink);
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: var(--tab, ${LEATHER});
  background-image: ${GRAIN};
  color: ${hex(PALETTE.white)};
  font-family: var(--ui-font);
  text-align: center;
  cursor: pointer;
  filter: saturate(0.75) brightness(0.88);
  transition: top 0.2s var(--ui-spring), filter 0.15s ease;
}
.p-tab:hover { top: 3px; filter: none; }
.p-tab[aria-current='true'] { top: 0; filter: none; }
.p-tab:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.p-tab b {
  display: block;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.01em;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(30, 6, 3, 0.4);
}
.p-tab em { display: block; font-style: normal; font-size: 9.5px; font-weight: 800; opacity: 0.85; font-variant-numeric: tabular-nums; }
.p-tab.holder { color: var(--ui-gold); background-color: ${LEATHER}; }
/* A world's chapter has one or two bookmarks; they keep a bookmark's width. */
.p-tab { max-width: 150px; }

/* --- the planets down the right edge, a chapter each ------------------------- */
.p-worlds {
  position: absolute;
  left: ${SHEET_W - 18}px;
  top: ${TAB_ROOM + COVER_PAD + 22}px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  z-index: 1;
}
.p-worlds[hidden] { display: none; }
.p-world {
  position: relative;
  left: 0;
  width: ${DISC + 16}px;
  height: ${DISC + 10}px;
  box-sizing: border-box;
  padding: 3px 3px 3px 10px;
  border: 2.5px solid var(--ui-ink);
  border-left: 0;
  border-radius: 0 999px 999px 0;
  background-color: ${LEATHER};
  background-image: ${GRAIN};
  cursor: pointer;
  filter: saturate(0.75) brightness(0.88);
  transition: left 0.2s var(--ui-spring), filter 0.15s ease;
}
.p-world:hover { left: 4px; filter: none; }
.p-world[aria-current='true'] { left: 8px; filter: none; }
.p-world:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.p-world svg { display: block; width: ${DISC}px; height: ${DISC}px; overflow: visible; }

/* --- a world's frontispiece -------------------------------------------------- */
.p-front { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 30px; text-align: center; }
.p-globe { width: 150px; height: 150px; margin-bottom: 10px; }
.p-globe svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-front small { font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.55; }
.p-front b { font-size: 34px; font-weight: 800; letter-spacing: 0.01em; line-height: 1; }
.p-script { height: 26px; opacity: 0.8; }
.p-script svg { display: block; height: 100%; width: auto; max-width: 300px; }
.p-front p { margin: 6px 0 0; max-width: 290px; font-size: 12.5px; font-weight: 600; line-height: 1.5; opacity: 0.75; }
.p-front .p-bar { width: 240px; }
.p-tab.holder svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: 3px; }
/*
 * A phone held upright shows one page at a time (\`single\`): the scaler is
 * slid so the left or the right page fills the window, a swipe turns, and
 * each page has both corners. The hint along the book's foot would be cut at
 * the spine, so the panel says it under the page instead.
 */
.p-panel.single .p-fit { overflow: hidden; touch-action: none; }
.p-panel.single .p-scaler { transition: transform 0.32s var(--ui-ease); }
.p-panel.single .p-hint { display: none; }
.p-panel.single.half0 .p-corner.next { right: 50%; }
.p-panel.single.half1 .p-corner.prev { left: 50%; }
.p-swipe { display: none; margin-top: 12px; text-align: center; font-size: 12.5px; font-weight: 700; color: rgba(255, 242, 232, 0.82); }
.p-panel.single .p-swipe { display: block; }
.p-hint {
  position: absolute;
  left: 0;
  width: ${SHEET_W}px;
  bottom: 0;
  height: ${HINT_ROOM}px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ui-paper);
  opacity: 0.55;
}

/* --- the book ------------------------------------------------------------------ */
.p-book {
  position: absolute;
  left: ${COVER_PAD}px;
  top: ${TAB_ROOM + COVER_PAD}px;
  width: ${BOOK_W}px;
  height: ${BOOK_H}px;
  perspective: 2400px;
  z-index: 2;
}
.p-side, .p-leaf { position: absolute; top: 0; width: 50%; height: 100%; }
.p-side.left, .p-leaf.back { left: 0; }
.p-side.right, .p-leaf.forward { left: 50%; }
.p-leaf { transform-style: preserve-3d; z-index: 3; pointer-events: none; }
.p-leaf.forward { transform-origin: left center; }
.p-leaf.back { transform-origin: right center; }
.p-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.p-face.under { transform: rotateY(180deg); }
.p-shade { position: absolute; inset: 0; pointer-events: none; opacity: 0; border-radius: inherit; }
.p-leaf.forward .p-face:not(.under) .p-shade, .p-leaf.back .p-face.under .p-shade { background: linear-gradient(90deg, rgba(30, 6, 3, 0.5), rgba(30, 6, 3, 0.05)); }
.p-leaf.forward .p-face.under .p-shade, .p-leaf.back .p-face:not(.under) .p-shade { background: linear-gradient(270deg, rgba(30, 6, 3, 0.5), rgba(30, 6, 3, 0.05)); }

/* --- the corners that turn it -------------------------------------------------- */
.p-corner {
  position: absolute;
  bottom: 0;
  width: 84px;
  height: 84px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  z-index: 4;
  transform: scale(0.46);
  transition: transform 0.24s var(--ui-spring);
  -webkit-tap-highlight-color: transparent;
}
.p-corner.next { right: 0; transform-origin: 100% 100%; }
.p-corner.prev { left: 0; transform-origin: 0 100%; }
.p-corner[hidden] { display: none; }
.p-corner:hover, .p-corner:focus-visible { transform: scale(0.86); }
.p-corner:focus-visible { outline: none; }
.p-corner:focus-visible .p-flap { stroke: var(--ui-violet); }
.p-corner svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-corner.prev svg { transform: scaleX(-1); }
.p-flap { filter: drop-shadow(-2px -2px 2px rgba(30, 6, 3, 0.28)); }
.p-arrow { opacity: 0; transition: opacity 0.15s ease; }
.p-corner:hover .p-arrow, .p-corner:focus-visible .p-arrow { opacity: 0.75; }

/* --- paper ------------------------------------------------------------------- */
.p-page {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  padding: 30px 30px 40px;
  overflow: hidden;
  background-color: ${hex(PALETTE.white)};
  background-image: ${GRAIN}, radial-gradient(ellipse at 50% 35%, rgba(255, 250, 244, 0.9), rgba(247, 226, 210, 0.9));
  border: 3px solid var(--ui-ink);
}
.p-side.left .p-page, .p-face .p-page.verso { border-radius: 12px 3px 3px 12px; border-right-width: 1.5px; }
.p-side.right .p-page, .p-face .p-page.recto { border-radius: 3px 12px 12px 3px; border-left-width: 1.5px; }
/* The gutter: each page darkens into the spine. */
.p-page::after { content: ''; position: absolute; top: 0; bottom: 0; width: 46px; pointer-events: none; }
.p-page.verso::after { right: 0; background: linear-gradient(270deg, rgba(30, 6, 3, 0.16), transparent); }
.p-page.recto::after { left: 0; background: linear-gradient(90deg, rgba(30, 6, 3, 0.16), transparent); }
.p-page.guilloche { background-image: ${GRAIN}, ${GUILLOCHE}, radial-gradient(ellipse at 50% 35%, rgba(255, 250, 244, 0.9), rgba(247, 226, 210, 0.9)); }
.p-side.blank { visibility: hidden; }
.p-folio { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; opacity: 0.42; }
.p-running { position: absolute; top: 12px; left: 30px; right: 30px; display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.35; }

/* --- the inside of the cover ----------------------------------------------------- */
.p-page.endpaper {
  background-color: ${LEATHER};
  background-image: ${WEAVE}, repeating-linear-gradient(45deg, rgba(228, 169, 12, 0.1) 0 2px, transparent 2px 14px), repeating-linear-gradient(-45deg, rgba(228, 169, 12, 0.1) 0 2px, transparent 2px 14px);
  display: grid;
  place-items: center;
}
.p-page.endpaper::after { display: none; }
.p-label {
  width: 78%;
  padding: 18px 20px;
  background-color: ${hex(PALETTE.white)};
  background-image: ${GRAIN};
  border: 2.5px solid var(--ui-ink);
  border-radius: 10px;
  box-shadow: 0 4px 0 rgba(30, 6, 3, 0.4);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
}
.p-label b { display: block; margin-bottom: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: ${inked(PALETTE.crimson)}; }
.p-label p { margin: 0 0 8px; }
.p-label small { display: block; font-size: 11px; opacity: 0.6; }

/* --- the holder ---------------------------------------------------------------- */
.p-id-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.p-id-head b { font-size: 20px; font-weight: 800; letter-spacing: 0.12em; color: ${inked(PALETTE.crimson)}; }
.p-id-head span { font-size: 10.5px; font-weight: 800; letter-spacing: 0.18em; opacity: 0.55; }
.p-id { display: grid; grid-template-columns: 124px 1fr; gap: 16px; }
.p-photo { width: 124px; height: 156px; border: 2.5px solid var(--ui-ink); border-radius: 6px; overflow: hidden; background: ${hex(PALETTE.skyBlue)}; }
.p-photo svg { display: block; width: 100%; height: 100%; }
.p-fields { display: grid; gap: 7px; align-content: start; }
.p-field small { display: block; font-size: 9.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.5; }
.p-field span { display: block; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-field .code { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 13px; letter-spacing: 0.04em; }
.p-sign { margin-top: 16px; padding-top: 4px; border-top: 1.5px solid rgba(30, 6, 3, 0.35); display: flex; justify-content: space-between; align-items: baseline; }
.p-sign span { font-family: 'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive; font-size: 24px; color: ${inked(PALETTE.slate, 0.5)}; transform: rotate(-3deg); transform-origin: left; white-space: nowrap; overflow: hidden; max-width: 70%; }
.p-sign small { font-size: 9.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.5; }
.p-mrz {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 34px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 6px;
  font-family: ui-monospace, 'OCR B', 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.11em;
  line-height: 1.45;
  white-space: pre;
  overflow: hidden;
  opacity: 0.8;
}

/* --- a continent's pages ------------------------------------------------------- */
.p-cont-head { display: flex; align-items: center; gap: 12px; margin: 2px 0 6px; }
.p-cont-head svg { flex: none; width: 40px; height: 40px; }
.p-cont-head > div { flex: 1; min-width: 0; }
.p-cont-head small { display: block; font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.55; }
.p-cont-head b { display: block; font-size: 21px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.05; }
.p-cont-count { flex: none; font-size: 21px; font-weight: 800; font-variant-numeric: tabular-nums; }
.p-cont-count small { display: inline; font-size: 12px; letter-spacing: 0; text-transform: none; opacity: 0.5; }
.p-bar { height: 6px; margin-bottom: 10px; border-radius: 3px; background: var(--ui-rule); overflow: hidden; }
.p-bar i { display: block; height: 100%; }
.p-grid { display: grid; grid-template-columns: repeat(${COLUMNS}, 1fr); grid-auto-rows: 66px; gap: 4px 2px; }
.p-cell { display: flex; flex-direction: column; align-items: center; min-width: 0; padding-top: 2px; border-radius: 8px; cursor: help; }
.p-cell:hover { background: rgba(30, 6, 3, 0.06); }
.p-mini { width: 62px; height: 47px; }
.p-mini svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-cell.got .p-mini { transform: rotate(var(--tilt, 0deg)); mix-blend-mode: multiply; }
.p-cell span { max-width: 100%; padding: 0 2px; box-sizing: border-box; font-size: 9px; font-weight: 800; line-height: 1.25; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-cell.missing span { opacity: 0.4; }

/* --- a stamp, large ------------------------------------------------------------- */
.p-stamp { transform: rotate(var(--tilt, 0deg)); }
.p-stamp svg { display: block; width: 100%; height: 100%; overflow: visible; }

/* --- what a stamp says, under the pointer ---------------------------------------- */
.p-tip {
  position: fixed;
  z-index: 1;
  display: none;
  align-items: center;
  gap: 10px;
  max-width: 300px;
  padding: 8px 13px 8px 9px;
  transform: translate(-50%, calc(-100% - 8px));
  pointer-events: none;
}
.p-tip.on { display: flex; }
.p-tip b { display: block; font-size: 14.5px; font-weight: 800; line-height: 1.15; }
.p-tip small { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 600; opacity: 0.65; }
.p-tip small:empty { display: none; }

/* --- the stamp that drops --------------------------------------------------------- */
.atlas-stamp-drop {
  position: fixed;
  z-index: 11;
  left: 50%;
  top: 38%;
  width: 240px;
  height: 180px;
  margin: -90px 0 0 -120px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}
.atlas-stamp-drop.in { visibility: visible; animation: p-drop 0.62s cubic-bezier(0.3, 0, 0.3, 1) both; }
.atlas-stamp-drop.out { visibility: visible; animation: p-lift 0.5s ease both; }
.atlas-stamp-drop .p-stamp { width: 240px; height: 180px; filter: drop-shadow(0 3px 0 rgba(30, 6, 3, 0.25)); }
.atlas-stamp-drop .p-caption {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translate(-50%, 8px);
  white-space: nowrap;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 800;
}
@keyframes p-drop {
  0% { opacity: 0; transform: scale(2.3) rotate(-16deg); }
  53% { opacity: 1; transform: scale(0.94) rotate(0deg); }
  62% { transform: scale(1.05) translateY(-2px); }
  74% { transform: scale(0.99); }
  100% { opacity: 1; transform: none; }
}
@keyframes p-lift { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(26px) scale(0.9); } }
@media (prefers-reduced-motion: reduce) {
  .atlas-passport.on .p-panel { animation: none; }
  .p-tab, .p-corner, .p-world { transition: none; }
  .atlas-stamp-drop.in { animation: ui-fade 0.2s ease both; }
}
`;
