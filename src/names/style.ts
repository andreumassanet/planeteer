import { PALETTE } from '../theme.ts';
import { FONT, hex } from '../ui.ts';

/** The countries' names are yellow and the towns' white, both on ink. */
export const COUNTRY_YELLOW = '#ffd23f';
export const TOWN_WHITE = '#ffffff';

/**
 * Colour on ink: the stroke is what makes the type read over the map layer's
 * flat colours. `paint-order: stroke fill` draws the ink behind the glyph. A
 * town's name stands on a stem over a dot, the anchor being the dot, so the
 * name floats over the town rather than covering it.
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
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${COUNTRY_YELLOW};
  -webkit-text-stroke: 3px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 2px 6px rgba(30, 6, 3, 0.35);
  will-change: transform, opacity;
}
.atlas-name[hidden] { display: none; }
.atlas-town {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  will-change: transform, opacity;
}
.atlas-town[hidden] { display: none; }
.atlas-town-name {
  position: absolute;
  left: 0;
  bottom: 15px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.3em;
  white-space: nowrap;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  color: ${TOWN_WHITE};
  -webkit-text-stroke: 3px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 2px 5px rgba(30, 6, 3, 0.45);
}
.atlas-town-star {
  font-size: 0.8em;
  color: ${COUNTRY_YELLOW};
}
.atlas-town-star[hidden] { display: none; }
.atlas-town::before {
  content: '';
  position: absolute;
  left: -1px;
  bottom: 4px;
  width: 2px;
  height: 10px;
  background: ${TOWN_WHITE};
  box-shadow: 0 0 0 1.5px ${hex(PALETTE.ink)};
  border-radius: 1px;
}
.atlas-town::after {
  content: '';
  position: absolute;
  left: -4px;
  bottom: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${TOWN_WHITE};
  box-shadow: 0 0 0 2px ${hex(PALETTE.ink)};
}
.atlas-town.capital::after { background: ${COUNTRY_YELLOW}; }
`;
