import { OCEAN_COLOR, PALETTE } from '../theme.ts';
import { hex } from '../ui.ts';

export const ink = hex(PALETTE.ink);
export const ocean = hex(OCEAN_COLOR);
export const cream = hex(PALETTE.white);
export const gold = hex(PALETTE.gold);
/** The one palette colour that collides with nothing already on the disc. */
export const violet = hex(PALETTE.violet);
/** The other players: round dots, where every landmark is a pin. */
export const pink = hex(PALETTE.pink);
export const red = hex(PALETTE.red);
export const faintInk = 'rgba(30, 6, 3, 0.42)';
