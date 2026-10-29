import { OCEAN_COLOR } from '../theme.ts';
import { hex } from '../ui.ts';

/** The map overlay's stylesheet, installed once. */
export const STYLE = `
.atlas-map {
  position: fixed;
  inset: 0;
  z-index: 7;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  background: rgba(4, 6, 14, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  transition: opacity 0.16s ease, visibility 0.16s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-map.on { opacity: 1; visibility: visible; pointer-events: auto; }
.atlas-map-sheet:focus { outline: none; }
.atlas-map-sheet {
  position: absolute;
  inset: 14px;
  border: 1.5px solid var(--ui-glass-edge);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: var(--ui-drop);
  background: ${hex(OCEAN_COLOR)};
  cursor: grab;
  touch-action: none;
}
.atlas-map-sheet.drag { cursor: grabbing; }
.atlas-map-sheet.point { cursor: pointer; }
.atlas-map canvas { display: block; width: 100%; height: 100%; }
.atlas-map canvas.atlas-map-marks { position: absolute; inset: 0; pointer-events: none; }
.atlas-map .ui-card { position: absolute; }
.atlas-map-head {
  top: 30px;
  left: 30px;
  padding: 10px 16px 12px;
  pointer-events: none;
}
.atlas-map-title {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.16em;
  line-height: 1.1;
  text-transform: uppercase;
  color: var(--ui-gold);
}
.atlas-map-legend {
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1.5px solid var(--ui-rule);
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 14px;
  font-size: 11.5px;
  font-weight: 700;
}
.atlas-map-legend > div { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.atlas-map-legend canvas { flex: none; width: 24px; height: 22px; }
.atlas-map-zoom {
  position: absolute;
  right: 30px;
  bottom: 30px;
  display: grid;
  gap: 10px;
}
.atlas-map-zoom .ui-btn { font-size: 22px; font-weight: 800; border-radius: 50%; }
.atlas-map-scale {
  left: 30px;
  bottom: 30px;
  padding: 7px 12px 8px;
  font-size: 11.5px;
  font-weight: 800;
  pointer-events: none;
}
.atlas-map-scale b {
  display: block;
  height: 6px;
  margin-top: 4px;
  border: 1.5px solid var(--ui-ink);
  border-top: 0;
}
.atlas-map-tip {
  display: none;
  align-items: center;
  gap: 11px;
  padding: 8px 13px 8px 9px;
  transform: translate(-50%, calc(-100% - 12px));
  max-width: 300px;
  pointer-events: none;
  z-index: 1;
}
.atlas-map-tip.on { display: flex; }
.atlas-map-tip-name {
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: -0.012em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.atlas-map-tip-sub {
  margin-top: 1px;
  font-size: 11.5px;
  font-weight: 600;
  opacity: 0.6;
  white-space: nowrap;
}
.atlas-map-tip-sub b { font-weight: 800; opacity: 0.85; }
/* A finger has no M to close the map with, and less room for the frame. */
.atlas-map-close { display: none; top: 30px; right: 30px; }
html.touch-ui .atlas-map-close { display: grid; position: absolute; }
html.touch-ui .atlas-map-sheet {
  inset: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
}
html.touch-ui .atlas-map-head { top: 14px; left: 14px; padding: 8px 12px 9px; }
html.touch-ui .atlas-map-close { top: 14px; right: 14px; }
html.touch-ui .atlas-map-zoom { right: 14px; bottom: 14px; gap: 8px; }
html.touch-ui .atlas-map-scale { left: 14px; bottom: 14px; }
@media (orientation: portrait) {
  html.touch-ui .atlas-map-legend { display: none; }
}
`;
