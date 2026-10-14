/** Flag specs: oceania. */
import type { FlagSpec } from '../flags.ts';
import { TAU, WHITE, BLACK, UK_BLUE, fill, h, hw, vw, rect, cross, disc, star, stars, poly, draw, shield, ensign, badge, waves } from './shorthands.ts';

export const OCEANIA: Record<string, FlagSpec> = {
  ASM: [
    fill('#0060af'),
    poly([[1, 0], [0.02, 0.5], [1, 1]], '#c8102e'),
    poly([[1, 0.10], [0.15, 0.5], [1, 0.90]], WHITE),
    draw((p) => {
      p.poly([[0.42, 0.42], [0.62, 0.38], [0.78, 0.46], [0.60, 0.50], [0.56, 0.62], [0.44, 0.58]], '#8d6a3f');
      p.disc(0.40, 0.40, 0.035, WHITE);
    }),
  ],
  AUS: [
    fill('#012169'),
    { t: 'flag', k: 'GBR', x: 0, y: 0, w: 0.5, h: 0.5 },
    star(0.25, 0.75, 0.13, WHITE, 7),
    star(0.72, 0.20, 0.065, WHITE, 7),
    star(0.62, 0.47, 0.065, WHITE, 7),
    star(0.72, 0.74, 0.065, WHITE, 7),
    star(0.84, 0.56, 0.065, WHITE, 7),
    star(0.76, 0.44, 0.035, WHITE, 5),
  ],
  COK: [
    fill('#012169'),
    { t: 'flag', k: 'GBR', x: 0, y: 0, w: 0.5, h: 0.5 },
    stars(0.75, 0.5, 0.32, 15, 0.045, WHITE),
  ],
  FJI: [
    fill('#68bfe5'),
    { t: 'flag', k: 'GBR', x: 0, y: 0, w: 0.5, h: 0.5 },
    draw((p) => shield(p, 0.74, 0.5, 0.26, WHITE, '#c8102e')),
  ],
  FSM: [
    fill('#75b2dd'),
    star(0.5, 0.25, 0.10, WHITE),
    star(0.5, 0.75, 0.10, WHITE),
    star(0.395, 0.5, 0.10, WHITE),
    star(0.605, 0.5, 0.10, WHITE),
  ],
  KIR: [
    fill('#002b7f'),
    rect(0, 0, 1, 0.5, '#ce1126'),
    draw((p) => {
      const { ctx } = p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x, p.y, p.w, p.h * 0.5);
      ctx.clip();
      p.sun(0.5, 0.5, 0.12, 17, 0.16, '#fcd116', 0.4);
      ctx.restore();
      // The frigatebird, wings out over the sun.
      p.poly([[0.5, 0.18], [0.30, 0.10], [0.16, 0.16], [0.36, 0.20], [0.5, 0.26], [0.64, 0.20], [0.84, 0.16], [0.70, 0.10]], '#fcd116');
      waves(p, 0.55, 3, 0.40, WHITE, 0.045);
    }),
  ],
  MHL: [
    fill('#003893'),
    poly([[0, 1], [1, 0.28], [1, 0.52], [0, 1]], '#dd7500'),
    poly([[0, 1], [1, 0.05], [1, 0.28], [0, 1]], WHITE),
    star(0.24, 0.28, 0.16, WHITE, 24),
  ],
  MNP: [
    fill('#0033a0'),
    star(0.5, 0.42, 0.14, WHITE),
    draw((p) => {
      p.poly([[0.44, 0.72], [0.44, 0.58], [0.56, 0.58], [0.56, 0.72]], '#9c9c9c');
      p.poly([[0.40, 0.58], [0.60, 0.58], [0.56, 0.50], [0.44, 0.50]], '#9c9c9c');
      p.ring(0.5, 0.56, 0.30, 0.045, '#c8a951');
    }),
  ],
  NCL: [
    h('#0035ad', '#ed1c24', '#009543'),
    disc(0.34, 0.5, 0.30, '#fae600'),
    draw((p) => {
      p.ctx.lineWidth = p.s(0.03);
      p.ctx.strokeStyle = BLACK;
      p.ctx.beginPath();
      p.ctx.arc(p.fx(0.34), p.fy(0.5), p.s(0.30), 0, TAU);
      p.ctx.stroke();
      // The fleche faitiere: a shaft with a crossbar and a finial.
      p.rect(0.334, 0.28, 0.012, 0.44, BLACK);
      p.rect(0.30, 0.42, 0.08, 0.02, BLACK);
      p.disc(0.34, 0.26, 0.045, BLACK);
    }),
  ],
  NFK: [
    vw(['#008000', WHITE, '#008000'], [1, 2, 1]),
    draw((p) => {
      p.rect(0.494, 0.62, 0.012, 0.14, '#006400');
      for (let i = 0; i < 4; i++) {
        const w = 0.11 - i * 0.024;
        p.poly([[0.5 - w, 0.70 - i * 0.13], [0.5 + w, 0.70 - i * 0.13], [0.5, 0.48 - i * 0.13]], '#006400');
      }
    }),
  ],
  NIU: [
    fill('#ffcc00'),
    { t: 'flag', k: 'GBR', x: 0, y: 0, w: 0.5, h: 0.5 },
    disc(0.25, 0.25, 0.09, '#012169'),
    star(0.25, 0.25, 0.075, '#ffcc00'),
  ],
  NZL: [
    fill('#012169'),
    { t: 'flag', k: 'GBR', x: 0, y: 0, w: 0.5, h: 0.5 },
    draw((p) => {
      const cross_: number[][] = [[0.80, 0.24], [0.68, 0.44], [0.86, 0.60], [0.74, 0.80]];
      for (const [sx, sy] of cross_) {
        p.star(sx!, sy!, 0.085, WHITE);
        p.star(sx!, sy!, 0.055, '#c8102e');
      }
    }),
  ],
  PCN: [...ensign(UK_BLUE, ...badge('#1e6b52'))],
  PLW: [fill('#4aadd6'), disc(0.42, 0.5, 0.32, '#ffde00')],
  PNG: [
    fill('#ce1126'),
    poly([[0, 0], [1, 1], [0, 1]], BLACK),
    draw((p) => {
      for (const [sx, sy] of [[0.14, 0.55], [0.30, 0.72], [0.16, 0.88], [0.36, 0.90]]) {
        p.star(sx!, sy!, 0.065, WHITE);
      }
      p.star(0.24, 0.80, 0.035, WHITE);
      // The bird of paradise, tail streaming to the fly.
      p.poly([[0.62, 0.40], [0.72, 0.30], [0.80, 0.34], [0.74, 0.42], [0.90, 0.36], [0.78, 0.50], [0.66, 0.50]], '#fcd116');
      p.poly([[0.60, 0.26], [0.70, 0.28], [0.62, 0.36]], '#fcd116');
    }),
  ],
  PYF: [
    hw(['#ce1126', WHITE, '#ce1126'], [1, 2, 1]),
    disc(0.5, 0.5, 0.22, WHITE),
    // A double canoe under a rayed sun, on the sea.
    draw((p) => {
      const { ctx } = p;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.fx(0.5), p.fy(0.5), p.s(0.22), 0, TAU);
      ctx.clip();
      ctx.strokeStyle = '#f5a623';
      ctx.lineWidth = p.s(0.016);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + ((i - 4) / 9) * Math.PI * 0.9;
        ctx.beginPath();
        ctx.moveTo(p.fx(0.5), p.fy(0.52));
        ctx.lineTo(p.fx(0.5) + Math.cos(a) * p.s(0.20), p.fy(0.52) + Math.sin(a) * p.s(0.20));
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) p.rect(0.44 + i * 0.03, 0.42, 0.012, 0.10, '#ce1126');
      p.poly([[0.36, 0.52], [0.64, 0.52], [0.60, 0.60], [0.40, 0.60]], '#ce1126');
      p.rect(0.30, 0.64, 0.40, 0.025, '#0038a8');
      p.rect(0.32, 0.70, 0.36, 0.025, '#0038a8');
      ctx.restore();
      p.ring(0.5, 0.5, 0.22, 0.025, '#ce1126');
    }),
  ],
  SLB: [
    poly([[0, 0], [1, 0], [0, 1]], '#0051ba'),
    poly([[1, 0], [1, 1], [0, 1]], '#215b33'),
    { t: 'diag', c: '#fcd116', w: 0.12, up: true },
    draw((p) => {
      for (const [sx, sy] of [[0.10, 0.12], [0.26, 0.12], [0.10, 0.34], [0.26, 0.34], [0.18, 0.23]]) {
        p.star(sx!, sy!, 0.055, WHITE);
      }
    }),
  ],
  TON: [
    fill('#c10000'),
    rect(0, 0, 0.42, 0.5, WHITE),
    cross('#c10000', 0.08, 0.21, 0.25, 0.30),
  ],
  VUT: [
    h('#d21034', '#009543'),
    draw((p) => {
      p.rect(0, 0.42, 1, 0.16, BLACK);
      p.poly([[0, 0], [0.46, 0.5], [0, 1]], BLACK);
      p.band(0, 0.06, 0.42, 0.5, 0.05, '#fdce12');
      p.band(0, 0.94, 0.42, 0.5, 0.05, '#fdce12');
      p.band(0.40, 0.5, 1, 0.5, 0.05, '#fdce12');
      p.crescent(0.20, 0.5, 0.16, 0.125, 0.045, '#fdce12');
    }),
  ],
  WSM: [
    fill('#ce1126'),
    rect(0, 0, 0.5, 0.5, '#002b7f'),
    draw((p) => {
      for (const [sx, sy] of [[0.16, 0.10], [0.30, 0.20], [0.16, 0.36], [0.36, 0.34]]) {
        p.star(sx!, sy!, 0.055, WHITE);
      }
      p.star(0.24, 0.25, 0.032, WHITE);
    }),
  ],

  // The open-ocean features. `IOT` is the British Indian Ocean Territory,
  // which the outlines do not draw — every Chagos ring is under the bake's
  // floor — and is kept for the day they do, like `SXM`.
  ATF: [
    fill('#003da5'),
    draw((p) => {
      p.rect(0.02, 0.04, 0.10, 0.42, '#002395');
      p.rect(0.12, 0.04, 0.10, 0.42, WHITE);
      p.rect(0.22, 0.04, 0.10, 0.42, '#ed2939');
      for (const [sx, sy] of [[0.62, 0.24], [0.74, 0.36], [0.86, 0.24], [0.68, 0.60], [0.80, 0.60]]) {
        p.star(sx!, sy!, 0.075, '#f5d130');
      }
    }),
  ],
  IOT: [
    draw((p) => {
      p.fill(WHITE);
      for (let i = 0; i < 3; i++) p.rect(0, 0.16 + i * 0.28, 1, 0.14, '#0072ce');
      waves(p, 0, 6, 1, '#0072ce', 0.02);
      p.flag('GBR', 0, 0, 0.5, 0.5);
      p.rect(0.76, 0.44, 0.02, 0.28, '#5a3a1a');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI - Math.PI * 0.1;
        p.band(0.77, 0.46, 0.77 + Math.cos(a) * 0.16, 0.46 - Math.abs(Math.sin(a)) * 0.22, 0.03, '#1e6b52');
      }
      p.disc(0.77, 0.24, 0.075, '#ffcc00');
    }),
  ],
  SGS: [...ensign(UK_BLUE, ...badge('#1e6b52'))],
  SHN: [...ensign(UK_BLUE, ...badge('#0072ce'))],
};

export const ANTARCTIC: Record<string, FlagSpec> = {
  // No official flag exists. This is Graham Bartram's design, the one that
  // actually gets flown at the stations: the continent, white on UN blue.
  ATA: [
    fill('#3a7ac8'),
    // The continent in polar projection, peninsula reaching for South America.
    poly([
      [0.50, 0.22], [0.58, 0.24], [0.65, 0.29], [0.69, 0.37], [0.70, 0.47],
      [0.67, 0.57], [0.61, 0.67], [0.54, 0.73], [0.46, 0.75], [0.40, 0.72],
      [0.36, 0.66], [0.33, 0.68], [0.30, 0.64], [0.33, 0.57], [0.34, 0.48],
      [0.29, 0.40], [0.23, 0.30], [0.26, 0.27], [0.34, 0.36], [0.38, 0.43],
      [0.41, 0.32], [0.45, 0.25],
    ], WHITE),
  ],
};
