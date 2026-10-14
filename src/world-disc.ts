/**
 * A world's small painted ball, as the menu's dock shows it, also used by
 * the chat and the player list beside a player on another world. It reads
 * the walkable bodies, so only modules outside Earth's first load import it.
 */
import { walkableBody } from './system/geography.ts';
import { OCEAN_COLOR, PALETTE } from './theme.ts';
import { ensureStyle, h, hex } from './ui.ts';

const STYLE = `
.world-disc {
  --d: 40px;
  --b: 3px;
  position: relative;
  flex: none;
  display: inline-block;
  box-sizing: border-box;
  width: var(--d);
  height: var(--d);
  border-radius: 50%;
  border: var(--b) solid var(--ui-ink);
  background: radial-gradient(circle at 33% 30%, var(--hi) 0 20%, var(--base) 21% 60%, var(--lo) 61%);
}
.world-disc.ringed::after {
  content: '';
  position: absolute;
  left: calc(var(--d) * -0.33);
  right: calc(var(--d) * -0.33);
  top: calc(var(--d) * 0.3 - var(--b));
  height: calc(var(--d) * 0.28);
  box-sizing: border-box;
  border: var(--b) solid var(--ui-ink);
  border-radius: 50%;
  transform: rotate(-16deg);
}
`;

/** The ball for a body by id, `size` CSS pixels across; a plain grey one for a body nobody knows. */
export function worldDisc(id: string, size = 40): HTMLElement {
  ensureStyle('world-disc', STYLE);
  const disc = h('span', { class: id === 'saturn' ? 'world-disc ringed' : 'world-disc' });
  disc.style.setProperty('--d', `${size}px`);
  disc.style.setProperty('--b', `${size >= 30 ? 3 : size >= 18 ? 2 : 1.5}px`);
  const found = walkableBody(id);
  if (id === 'earth') {
    disc.style.background =
      `radial-gradient(circle at 62% 42%, ${hex(PALETTE.green)} 0 26%, transparent 27%),` +
      `radial-gradient(circle at 33% 30%, ${hex(PALETTE.skyBlue)} 0 20%, ${hex(OCEAN_COLOR)} 21% 62%, #1d5b7c 63%)`;
  } else if (id === 'sun') {
    disc.style.setProperty('--hi', hex(PALETTE.cream));
    disc.style.setProperty('--base', hex(PALETTE.gold));
    disc.style.setProperty('--lo', hex(PALETTE.orange));
  } else if (found !== undefined) {
    disc.style.setProperty('--hi', hex(found.look.highland));
    disc.style.setProperty('--base', hex(found.look.surface));
    disc.style.setProperty('--lo', hex(found.look.lowland));
  } else {
    disc.style.setProperty('--hi', hex(PALETTE.cream));
    disc.style.setProperty('--base', hex(PALETTE.slate));
    disc.style.setProperty('--lo', hex(PALETTE.ink));
  }
  return disc;
}
