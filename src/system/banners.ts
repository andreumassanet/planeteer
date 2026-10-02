/**
 * The other worlds' flags: a banner a nation, generated from its key.
 *
 * Earth's flags are specs (`flag-data.ts`), one per real country. Nobody has
 * drawn a Martian flag, so a banner here is **seeded geometry**: the field in
 * the nation's own colour — the colour every map already paints it — and one
 * charge on it in a palette colour chosen to stand off that field. Which
 * charges a world uses is the world's (`TRADITIONS`, picked by the body's
 * key), so the Martian banners look like each other and not like Saturn's,
 * and which of them a nation flies is the nation's.
 *
 * Deterministic from the key and nothing else, so every client, the
 * passport's stamps, the HUD's border card and the map's pins draw the same
 * banner. Painted through `flags.ts`'s `registerFlagPainter` (`menu-body.ts`'s
 * `installBanners`), so anything that draws a flag by key draws these too.
 */

import { PALETTE } from '../theme.ts';
import { WALKABLE } from './geography.ts';

/** Every walked nation's field, by key. */
const FIELDS = new Map<string, number>();
for (const body of WALKABLE) for (const nation of body.nations) FIELDS.set(`${body.id}:${nation.id}`, nation.color);

/** FNV-1a: a key to 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Relative luminance of a 0xRRGGBB, 0 to 1, near enough for contrast. */
function luminance(color: number): number {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * A colour off the palette that reads on `field`: one far enough from it in
 * value that the charge is a shape and not a shade — the same reason glazing
 * is never black in a world whose ink is black, turned round.
 */
function chargeOn(field: number, seed: number, avoid = -1): number {
  const own = luminance(field);
  const colors = Object.values(PALETTE) as number[];
  const standing = colors.filter((c) => c !== avoid && Math.abs(luminance(c) - own) > 0.28);
  const list = standing.length > 0 ? standing : [own > 0.5 ? PALETTE.ink : PALETTE.white];
  return list[seed % list.length]!;
}

type Charge = 'band' | 'pale' | 'chevron' | 'disc' | 'star' | 'bend' | 'bars' | 'ring' | 'cross' | 'canton';

const CHARGES: readonly Charge[] = ['band', 'pale', 'chevron', 'disc', 'star', 'bend', 'bars', 'ring', 'cross', 'canton'];

/**
 * A world's heraldic habit: four charges of the ten, chosen by its own id,
 * so its banners share a family look.
 */
function traditionOf(bodyId: string): Charge[] {
  const order = [...CHARGES];
  let h = hash(`tradition:${bodyId}`);
  for (let i = order.length - 1; i > 0; i--) {
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return order.slice(0, 4);
}

const TRADITIONS = new Map(WALKABLE.map((body) => [body.id, traditionOf(body.id)]));

/** A star of `points` points, centred, its outer radius `r`. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points: number): void {
  ctx.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / points;
    const radius = k % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Paints the banner of `key` (`'mars:tharsis'`) into the box. The shape every
 * `flags.ts` painter has; the caller clips. An unknown key gets a field from
 * its own hash, so a stale stamp still draws something rather than nothing.
 */
export function paintBanner(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number): void {
  const seed = hash(key);
  const colon = key.indexOf(':');
  const bodyId = colon > 0 ? key.slice(0, colon) : key;
  const colors = Object.values(PALETTE) as number[];
  const field = FIELDS.get(key) ?? colors[seed % colors.length]!;
  const charge = chargeOn(field, seed >>> 3);
  const second = chargeOn(field, seed >>> 11, charge);
  const tradition = TRADITIONS.get(bodyId) ?? traditionOf(bodyId);
  const kind = tradition[(seed >>> 5) % tradition.length]!;
  const m = Math.min(w, h);

  ctx.save();
  ctx.fillStyle = css(field);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(charge);
  ctx.strokeStyle = css(charge);
  switch (kind) {
    case 'band':
      ctx.fillRect(x, y + h / 3, w, h / 3);
      break;
    case 'pale':
      ctx.fillRect(x, y, w / 3, h);
      ctx.fillStyle = css(second);
      star(ctx, x + w / 6, y + h / 2, m * 0.13, 4 + ((seed >>> 17) % 3));
      break;
    case 'chevron':
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.45, y + h / 2);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    case 'disc':
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, m * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star':
      star(ctx, x + w / 2, y + h / 2, m * 0.36, 5 + ((seed >>> 17) % 4));
      break;
    case 'bend':
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h * 0.7);
      ctx.lineTo(x + w * 0.8, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h * 0.3);
      ctx.lineTo(x + w * 0.2, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bars':
      ctx.fillRect(x, y + h * 0.18, w, h * 0.16);
      ctx.fillStyle = css(second);
      ctx.fillRect(x, y + h * 0.66, w, h * 0.16);
      break;
    case 'ring':
      ctx.lineWidth = m * 0.1;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, m * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = css(second);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, m * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cross':
      ctx.fillRect(x + w * 0.3, y, w * 0.14, h);
      ctx.fillRect(x, y + h * 0.43, w, h * 0.14);
      break;
    case 'canton':
      ctx.fillRect(x, y, w * 0.45, h * 0.5);
      ctx.fillStyle = css(second);
      ctx.beginPath();
      ctx.arc(x + w * 0.225, y + h * 0.25, m * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}
