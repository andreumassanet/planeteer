/**
 * The traveller's frame, top left: how they are going, their name, their
 * level (`explorer-level.ts`) and the bar to the next one, asked of
 * `HudOptions.profile` once a second.
 */
import type { TravelMode } from '../controls.ts';
import { MODE_ICON } from './constants.ts';
import { levelOf } from '../explorer-level.ts';
import { icon, type IconName } from '../ui.ts';
import type { HudCtx } from './ctx.ts';

/** How often the profile is asked, seconds. */
const PROFILE_EVERY = 1;

export function showMode(ctx: HudCtx, mode: TravelMode): void {
  ctx.playerMode.replaceChildren(icon(MODE_ICON[mode] ?? 'walk'));
  ctx.playerMode.title = mode === 'foot' ? 'On foot' : mode;
}

export function updatePlayer(ctx: HudCtx, dt: number): void {
  const { options } = ctx;
  ctx.profileFor -= dt;
  if (ctx.profileFor > 0) return;
  ctx.profileFor = PROFILE_EVERY;
  const profile = options.profile?.() ?? null;
  ctx.player.classList.toggle('on', profile !== null);
  if (profile === null) return;
  const key = `${profile.name}|${profile.towns}|${profile.stamps}`;
  if (key === ctx.shownProfile) return;
  ctx.shownProfile = key;
  const { level, progress } = levelOf(profile.stamps, profile.towns);
  ctx.playerName.textContent = profile.name || 'Traveller';
  ctx.playerLevel.textContent = `Lv ${level}`;
  ctx.playerFill.style.transform = `scaleX(${Math.max(0.02, Math.min(1, progress)).toFixed(3)})`;
  ctx.playerStats.replaceChildren(
    statChip('passport', profile.stamps, profile.stamps === 1 ? 'country stamped' : 'countries stamped'),
    statChip('flag', profile.towns, profile.towns === 1 ? 'town visited' : 'towns visited'),
  );
}

function statChip(name: IconName, count: number, title: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'atlas-player-stat';
  chip.title = `${count} ${title}`;
  const figure = document.createElement('b');
  figure.textContent = String(count);
  chip.append(icon(name, 14), figure);
  return chip;
}
