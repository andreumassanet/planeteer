/** Small pure helpers: key caps, years, distances and the sea's stand-in for a flag. */
import { capOf, type KeyHint } from '../controls.ts';
import { OCEAN_COLOR, PALETTE } from '../theme.ts';
import { hex, kbd } from '../ui.ts';

/** A row of caps for one line of a key list: `W A S D`, `Shift`. */
export function capsOf(hint: KeyHint): HTMLElement[] {
  return hint.keys.map((key) => {
    const cap = capOf(key);
    return kbd(cap, cap.length > 3);
  });
}

/** A year as a person reads it: 1889, AD 80 (a bare "80" beside a height reads as a second measurement), 2560 BC. */
export function yearText(year: number): string {
  if (year < 0) return `${-year} BC`;
  if (year < 1000) return `AD ${year}`;
  return String(year);
}

export const km = (value: number): string => `${Math.round(value).toLocaleString('en')} km`;

/** The badge's stand-in for a flag when you are at sea. */
export function oceanPlate(width: number, height: number): HTMLCanvasElement {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = hex(OCEAN_COLOR);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = hex(PALETTE.white);
    ctx.lineWidth = canvas.height * 0.075;
    ctx.lineCap = 'round';
    for (let row = 0; row < 2; row++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24) * canvas.width;
        const y = canvas.height * (0.36 + row * 0.3) + Math.sin(i * 0.6) * canvas.height * 0.09;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  return canvas;
}

/** 1.2M, 840k: the frame counter is read at a glance. */
export const shortCount = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
