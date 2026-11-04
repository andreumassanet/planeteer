/** The Hall of Fame's stylesheet, and the course records' that a dialogue embeds. */
import { hex } from '../ui.ts';
import { PALETTE } from '../theme.ts';
import { MEDAL_COLOURS } from '../rings/panel.ts';

export const STYLE = `
.atlas-fame {
  position: fixed;
  inset: 0;
  z-index: 11;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 6, 14, 0.45);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-fame.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.atlas-fame.on .atlas-fame-panel { animation: ui-pop 0.32s var(--ui-spring) both; }
.atlas-fame-panel {
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  width: min(720px, 100%);
  height: min(780px, calc(100vh - 48px));
  height: min(780px, calc(100dvh - 48px));
  padding: 0;
  overflow: hidden;
  outline: none;
}
.atlas-fame-head { display: flex; align-items: center; gap: 14px; padding: 18px 22px 14px; }
.atlas-fame-crest {
  display: grid;
  place-items: center;
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  color: ${hex(PALETTE.ink)};
  background: var(--ui-gold);
}
.atlas-fame-crest svg { width: 26px; height: 26px; }
.atlas-fame-title {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 1;
  text-transform: uppercase;
  -webkit-text-stroke: 6px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
}
.atlas-fame-sub { margin-top: 4px; font-size: 13px; font-weight: 600; color: var(--ui-muted); }
.atlas-fame-close { margin-left: auto; }

.atlas-fame-tabs {
  display: flex;
  gap: 6px;
  padding: 0 18px 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.atlas-fame-tabs::-webkit-scrollbar { display: none; }
.atlas-fame-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 8px 12px;
  border: 1.5px solid var(--ui-glass-edge, var(--ui-rule));
  border-radius: 999px;
  background: transparent;
  font: 800 13.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.atlas-fame-tab svg { width: 17px; height: 17px; flex: none; }
.atlas-fame-tab:hover { background: var(--ui-hover); }
.atlas-fame-tab[aria-selected='true'] { color: ${hex(PALETTE.ink)}; background: var(--ui-gold); border-color: var(--ui-gold); }
.atlas-fame-tab:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-fame-blurb {
  margin: 0;
  padding: 10px 22px 10px;
  border-top: 1.5px solid var(--ui-rule);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  color: var(--ui-muted);
}

.atlas-fame-body { position: relative; min-height: 0; overflow: auto; padding: 0 14px 10px; scrollbar-width: thin; }
.atlas-fame-list { list-style: none; margin: 0; padding: 0; }
.atlas-fame-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 5px 8px;
  border-radius: 12px;
}
.atlas-fame-list .atlas-fame-row + .atlas-fame-row { border-top: 1.5px dashed var(--ui-rule); border-radius: 0; }
.atlas-fame-row.me { background: rgba(228, 169, 12, 0.16); border-radius: 12px; }
.atlas-fame-rank {
  justify-self: center;
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: var(--ui-muted);
}
.atlas-fame-rank.m1, .atlas-fame-rank.m2, .atlas-fame-rank.m3 { color: ${hex(PALETTE.ink)}; box-shadow: inset 0 0 0 2px rgba(30, 6, 3, 0.35); }
.atlas-fame-rank.m1 { background: ${MEDAL_COLOURS[3]}; }
.atlas-fame-rank.m2 { background: ${MEDAL_COLOURS[2]}; }
.atlas-fame-rank.m3 { background: ${MEDAL_COLOURS[1]}; }
.atlas-fame-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.atlas-fame-name small { margin-left: 8px; font-size: 12px; font-weight: 750; color: var(--ui-muted); }
.atlas-fame-level { font-variant-numeric: tabular-nums; }
.atlas-fame-score { min-width: 78px; text-align: right; font-size: 15px; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap; }
.atlas-fame-score small { margin-left: 4px; font-size: 11.5px; font-weight: 750; color: var(--ui-muted); }
.atlas-fame-say {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 44px 24px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--ui-muted);
}
.atlas-fame-say[hidden] { display: none; }
.atlas-fame-ghost { height: 46px; margin: 0 8px; border-bottom: 1.5px dashed var(--ui-rule); opacity: 0.6; }

.atlas-fame-foot {
  display: grid;
  gap: 8px;
  padding: 12px 22px 16px;
  border-top: 1.5px solid var(--ui-rule);
  background: rgba(30, 6, 3, 0.55);
}
.atlas-fame-foot[hidden] { display: none; }
.atlas-fame-foot .atlas-fame-row { padding-left: 0; padding-right: 0; background: transparent; }
.atlas-fame-standing { font-size: 12px; font-weight: 800; color: var(--ui-gold); white-space: nowrap; }
.atlas-fame-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 13.5px; font-weight: 700; line-height: 1.4; }
.atlas-fame-note { margin: 0; font-size: 12px; font-weight: 650; line-height: 1.4; color: var(--ui-muted); }
.atlas-fame-note button {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 800;
  color: var(--ui-ink);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.atlas-fame-note button:focus-visible { outline: var(--ui-ring); outline-offset: 2px; border-radius: 3px; }

html.touch-ui .atlas-fame-tab { min-height: 44px; padding: 10px 14px; }
html.touch-ui .atlas-fame-row { min-height: 52px; }
html.touch-ui .atlas-fame-note button { min-height: 32px; }

@media (max-width: 620px) {
  .atlas-fame { padding: 10px; }
  .atlas-fame-panel { height: calc(100vh - 20px); height: calc(100dvh - 20px); }
  .atlas-fame-head { padding: 14px 16px 10px; }
  .atlas-fame-title { font-size: 22px; }
  .atlas-fame-tabs { padding: 0 12px 10px; }
  .atlas-fame-blurb { padding: 8px 16px; }
  .atlas-fame-body { padding: 0 6px 8px; }
  .atlas-fame-row { grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; }
  .atlas-fame-row .atlas-fame-level { display: none; }
  .atlas-fame-foot { padding: 10px 16px 14px; }
}
/* A phone on its side: the head a line, the list given the height. */
@media (max-height: 520px) {
  .atlas-fame { padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
  .atlas-fame-panel { height: 100%; }
  .atlas-fame-head { padding: 8px 14px; gap: 10px; }
  .atlas-fame-crest { width: 34px; height: 34px; }
  .atlas-fame-title { font-size: 19px; }
  .atlas-fame-sub, .atlas-fame-blurb { display: none; }
  .atlas-fame-row { min-height: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-fame, .atlas-fame-tab { transition: none; }
  .atlas-fame.on .atlas-fame-panel { animation: none; }
}
`;

/** The course records: in whatever card holds them, in its own ink. */
export const RECORDS_STYLE = `
.atlas-records { font-family: var(--ui-font); color: inherit; }
.atlas-records-head { font-size: 12px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.65; margin-bottom: 4px; }
.atlas-records-list { list-style: none; margin: 0; padding: 0; }
.atlas-records-row {
  display: grid;
  grid-template-columns: 26px 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  font-size: 13.5px;
  font-weight: 750;
}
.atlas-records-row + .atlas-records-row { border-top: 1.5px dashed var(--ui-rule); }
.atlas-records-row.me { color: var(--ui-gold); }
.atlas-records-rank { text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; opacity: 0.7; }
.atlas-records-medal { display: block; width: 22px; height: 22px; }
.atlas-records-medal svg { display: block; width: 100%; height: 100%; }
.atlas-records-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-records-time { font-weight: 900; font-variant-numeric: tabular-nums; }
.atlas-records-mine { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1.5px solid var(--ui-rule); font-size: 13.5px; font-weight: 800; }
.atlas-records-mine[hidden] { display: none; }
.atlas-records-mine .atlas-records-time { margin-left: auto; }
.atlas-records-say { font-size: 12.5px; font-weight: 700; line-height: 1.4; opacity: 0.7; }
.atlas-records-say:empty { display: none; }
`;
