/** The Field Guide's stylesheet: the settings' glass and rail, its own pages. */

export const STYLE = `
.atlas-fg {
  position: fixed; inset: 0; z-index: 8;
  display: grid; place-items: center;
  padding: 24px;
  background: rgba(4, 6, 14, 0.45);
  backdrop-filter: blur(6px);
  opacity: 0; visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font); color: var(--ui-ink);
}
.atlas-fg.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.atlas-fg.on .atlas-fg-panel { animation: ui-pop 0.32s var(--ui-spring) both; }
.atlas-fg-panel {
  position: relative;
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  width: min(1040px, 100%);
  height: min(740px, calc(100vh - 48px));
  height: min(740px, calc(100dvh - 48px));
  padding: 0; overflow: hidden;
}
.atlas-fg-head { display: flex; align-items: center; gap: 16px; padding: 18px 24px 16px; border-bottom: 1.5px solid var(--ui-rule); }
.atlas-fg-badge { flex: none; display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--ui-gold); color: #1e0603; font-size: 21px; font-weight: 900; box-shadow: 0 0 0 4px rgba(255, 242, 232, 0.12); }
.atlas-fg-who { flex: 1; min-width: 0; }
.atlas-fg-title { font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
.atlas-fg-sub { font-size: 13px; font-weight: 800; color: var(--ui-muted); margin-top: 2px; }
.atlas-fg-xp { margin-top: 7px; max-width: 420px; }
.atlas-fg-body { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 0; }
.atlas-fg-rail { display: flex; flex-direction: column; gap: 6px; padding: 18px 14px; border-right: 1.5px solid var(--ui-rule); background: rgba(4, 6, 14, 0.2); }
.atlas-fg-rail button {
  display: flex; align-items: center; gap: 11px; width: 100%;
  padding: 10px 12px; border: 2.5px solid transparent; border-radius: 12px; background: transparent;
  font: 800 14.5px/1 var(--ui-font); color: var(--ui-ink); text-align: left; cursor: pointer;
}
.atlas-fg-rail button svg { flex: none; width: 20px; height: 20px; }
.atlas-fg-rail button:hover { background: var(--ui-hover); }
.atlas-fg-rail button[aria-selected='true'] { color: #1e0603; background: var(--ui-gold); }
.atlas-fg-rail button:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-fg-rail .atlas-fg-dot { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; display: grid; place-items: center; background: var(--ui-crimson); color: #fff; font-size: 11.5px; font-weight: 900; }
.atlas-fg-rail .atlas-fg-dot[hidden] { display: none; }
.atlas-fg-rail button[aria-selected='true'] .atlas-fg-dot { background: #1e0603; }
.atlas-fg-content { position: relative; min-height: 0; overflow: auto; padding: 20px 28px 28px; scrollbar-width: thin; }
.atlas-fg-section { margin-bottom: 22px; }
.atlas-fg-section > h3 { margin: 0 0 10px; font-size: 13px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ui-gold); display: flex; align-items: center; gap: 8px; }
.atlas-fg-section > h3 svg { width: 16px; height: 16px; }
.atlas-fg-section > p { margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--ui-muted); line-height: 1.45; }
.atlas-fg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.atlas-fg-tile { border-radius: 14px; padding: 12px 13px; background: rgba(255, 242, 232, 0.06); border: 1.5px solid var(--ui-glass-edge, rgba(255, 242, 232, 0.16)); }
.atlas-fg-tile.dim { opacity: 0.55; }
.atlas-fg-tile-head { display: flex; align-items: center; gap: 9px; }
.atlas-fg-tile-head svg { flex: none; width: 20px; height: 20px; }
.atlas-fg-tile-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 900; }
.atlas-fg-tile-text { margin-top: 5px; font-size: 13px; font-weight: 700; color: var(--ui-muted); line-height: 1.4; }
.atlas-fg-tile-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 12.5px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--ui-muted); }
.atlas-fg-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.atlas-fg-topic { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 12px; text-align: left; cursor: pointer;
  font: 800 14px/1.2 var(--ui-font); color: var(--ui-ink); background: rgba(255, 242, 232, 0.06); border: 1.5px solid var(--ui-glass-edge, rgba(255, 242, 232, 0.16)); }
.atlas-fg-topic:hover, .atlas-fg-topic:focus-visible { background: rgba(255, 242, 232, 0.14); outline: none; }
.atlas-fg-topic:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-fg-topic svg { flex: none; width: 18px; height: 18px; }
.atlas-fg-topic small { display: block; margin-top: 2px; font-size: 12px; font-weight: 700; color: var(--ui-muted); }
.atlas-fg-topic.read::after { content: '✓'; margin-left: auto; color: var(--ui-green); font-weight: 900; }
.atlas-fg-reader { max-width: 640px; }
.atlas-fg-reader h2 { margin: 0 0 4px; font-size: 24px; font-weight: 900; letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; }
.atlas-fg-reader h2 svg { width: 24px; height: 24px; }
.atlas-fg-reader .atlas-fg-summary { margin: 0 0 16px; font-size: 14.5px; font-weight: 800; color: var(--ui-muted); }
.atlas-fg-reader h4 { margin: 18px 0 6px; font-size: 16px; font-weight: 900; }
.atlas-fg-reader p { margin: 0 0 9px; font-size: 15px; font-weight: 700; line-height: 1.55; }
.atlas-fg-reader .ui-kbd { font-size: 12.5px; vertical-align: 1px; margin: 0 1px; }
.atlas-fg-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.atlas-fg-track { display: flex; flex-direction: column; gap: 6px; }
.atlas-fg-level { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; align-items: start; padding: 9px 12px; border-radius: 12px; background: rgba(255, 242, 232, 0.05); }
.atlas-fg-level.reached { background: rgba(255, 242, 232, 0.1); }
.atlas-fg-level.current { outline: 2px solid var(--ui-gold); }
.atlas-fg-level b { font-size: 15px; font-weight: 900; }
.atlas-fg-level .atlas-fg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.atlas-fg-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 900; background: rgba(255, 242, 232, 0.1); }
.atlas-fg-chip.gold { background: var(--ui-gold); color: #1e0603; }
.atlas-fg-chip svg { width: 13px; height: 13px; }
.atlas-fg-close { flex: none; }
@media (max-width: 720px) {
  .atlas-fg { padding: 0; }
  .atlas-fg-panel { width: 100%; height: 100%; border-radius: 0; }
  .atlas-fg-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .atlas-fg-rail { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1.5px solid var(--ui-rule); padding: 10px; }
  .atlas-fg-rail button { width: auto; flex: none; }
  .atlas-fg-content { padding: 16px; }
  .atlas-fg-xp { max-width: none; }
}
`;
