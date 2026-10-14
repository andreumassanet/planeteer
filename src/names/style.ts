import { PALETTE } from '../theme.ts';
import { FONT, hex } from '../ui.ts';

/**
 * Cream on ink: the stroke is what makes the type read over the map layer's
 * flat colours. `paint-order: stroke fill` draws the ink behind the glyph.
 */
export const STYLE = `
.atlas-names {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  /* Behind every card the HUD has: a positive z-index would paint over the
     minimap and the chip, so the names join their group at 0 and DOM order
     decides (main.ts inserts this element first). */
  z-index: 0;
  font-family: ${FONT};
}
.atlas-name {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  font-weight: 800;
  letter-spacing: 0.055em;
  color: ${hex(PALETTE.cream)};
  -webkit-text-stroke: 3px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 2px 6px rgba(30, 6, 3, 0.35);
  will-change: transform, opacity;
}
.atlas-name[hidden] { display: none; }
`;
