/** Flag specs: africa. */
import type { FlagSpec } from '../flags.ts';
import { TAU, WHITE, BLACK, fill, h, v, hw, rect, disc, star, stars, crescent, sun, poly, draw, hoist, shield } from './shorthands.ts';

export const AFRICA: Record<string, FlagSpec> = {
  AGO: [
    h('#ce1126', BLACK),
    draw((p) => {
      p.ring(0.42, 0.5, 0.16, 0.05, '#f9d616');
      p.band(0.36, 0.66, 0.66, 0.36, 0.035, '#f9d616');
      p.star(0.5, 0.32, 0.075, '#f9d616');
    }),
  ],
  BDI: [
    fill(WHITE),
    poly([[0.07, 0], [0.93, 0], [0.5, 0.42]], '#ce1126'),
    poly([[0.07, 1], [0.93, 1], [0.5, 0.58]], '#ce1126'),
    poly([[0, 0.07], [0.42, 0.5], [0, 0.93]], '#1eb53a'),
    poly([[1, 0.07], [0.58, 0.5], [1, 0.93]], '#1eb53a'),
    disc(0.5, 0.5, 0.26, WHITE),
    star(0.5, 0.35, 0.07, '#ce1126'),
    star(0.42, 0.60, 0.07, '#ce1126'),
    star(0.58, 0.60, 0.07, '#ce1126'),
  ],
  BEN: [h('#fcd116', '#e8112d'), rect(0, 0, 1 / 3, 1, '#008751')],
  BFA: [h('#ef2b2d', '#009e49'), star(0.5, 0.5, 0.16, '#fcd116')],
  BWA: [hw(['#75aadb', WHITE, BLACK, WHITE, '#75aadb'], [9, 1, 4, 1, 9])],
  CAF: [
    h('#003082', WHITE, '#289728', '#ffce00'),
    rect(0.44, 0, 0.12, 1, '#d21034'),
    star(0.10, 0.13, 0.09, '#ffce00'),
  ],
  CIV: [v('#f77f00', WHITE, '#009e60')],
  CMR: [v('#007a5e', '#ce1126', '#fcd116'), star(0.5, 0.5, 0.14, '#fcd116')],
  COD: [
    fill('#007fff'),
    { t: 'diag', c: '#f7d618', w: 0.30, up: true },
    { t: 'diag', c: '#ce1021', w: 0.18, up: true },
    star(0.11, 0.20, 0.13, '#f7d618'),
  ],
  COG: [
    fill('#fbde4a'),
    poly([[0, 0], [0.55, 0], [0, 1]], '#009543'),
    poly([[1, 0], [1, 1], [0.45, 1]], '#dc241f'),
  ],
  COM: [
    h('#ffc61e', WHITE, '#ce1126', '#3a75c4'),
    hoist(0.5, '#3d8e33'),
    crescent(0.20, 0.5, 0.20, 0.16, 0.055, WHITE),
    draw((p) => {
      for (let i = 0; i < 4; i++) p.star(0.26, 0.26 + i * 0.16, 0.045, WHITE);
    }),
  ],
  CPV: [
    hw(['#003893', WHITE, '#cf2027', WHITE, '#003893'], [6, 1, 1, 1, 3]),
    stars(0.375, 0.625, 0.30, 10, 0.045, '#f7d116'),
  ],
  DJI: [h('#6ab2e7', '#12ad2b'), hoist(0.42, WHITE), star(0.16, 0.5, 0.11, '#d7141a')],
  DZA: [
    v('#006233', WHITE),
    crescent(0.50, 0.5, 0.24, 0.19, 0.06, '#d21034'),
    star(0.62, 0.5, 0.11, '#d21034', 5, 0.35),
  ],
  EGY: [
    h('#ce1126', WHITE, BLACK),
    draw((p) => {
      // The eagle of Saladin, as a shielded bird.
      p.poly([[0.5, 0.36], [0.60, 0.40], [0.66, 0.48], [0.58, 0.47], [0.56, 0.56], [0.44, 0.56], [0.42, 0.47], [0.34, 0.48], [0.40, 0.40]], '#c09300');
      p.poly([[0.46, 0.56], [0.54, 0.56], [0.52, 0.66], [0.48, 0.66]], '#c09300');
      p.disc(0.5, 0.335, 0.035, '#c09300');
    }),
  ],
  ERI: [
    poly([[0, 0], [1, 0], [1, 0.5]], '#4189dd'),
    poly([[0, 1], [1, 1], [1, 0.5]], '#12ad2e'),
    poly([[0, 0], [1, 0.5], [0, 1]], '#ea0437'),
    // The olive branch inside its wreath.
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = '#ffc726';
      ctx.lineWidth = p.s(0.03);
      ctx.beginPath();
      ctx.arc(p.fx(0.20), p.fy(0.5), p.s(0.26), 0.5, TAU - 0.5);
      ctx.stroke();
      p.rect(0.196, 0.34, 0.010, 0.32, '#ffc726');
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(p.fx(0.20 + side * 0.035), p.fy(0.40 + i * 0.07), p.s(0.055), p.s(0.02), side * 0.7, 0, TAU);
          ctx.fillStyle = '#ffc726';
          ctx.fill();
          ctx.restore();
        }
      }
    }),
  ],
  ESH: [
    h(BLACK, WHITE, '#007a3b'),
    hoist(0.5, '#c4111b'),
    crescent(0.68, 0.5, 0.115, 0.09, -0.03, '#c4111b'),
    star(0.60, 0.5, 0.075, '#c4111b'),
  ],
  ETH: [
    h('#078930', '#fcdd09', '#da121a'),
    disc(0.5, 0.5, 0.30, '#0f47af'),
    star(0.5, 0.5, 0.22, '#fcdd09'),
    disc(0.5, 0.5, 0.06, '#0f47af'),
  ],
  GAB: [h('#009e60', '#fcd116', '#3a75c4')],
  GHA: [h('#ce1126', '#fcd116', '#006b3f'), star(0.5, 0.5, 0.13, BLACK)],
  GIN: [v('#ce1126', '#fcd116', '#009460')],
  GMB: [hw(['#ce1126', WHITE, '#0c1c8c', WHITE, '#3a7728'], [6, 1, 4, 1, 6])],
  GNB: [h('#fcd116', '#009e49'), rect(0, 0, 1 / 3, 1, '#ce1126'), star(1 / 6, 0.5, 0.14, BLACK)],
  GNQ: [
    h('#3e9a00', WHITE, '#e32118'),
    hoist(0.30, '#0073ce'),
    draw((p) => shield(p, 0.62, 0.5, 0.15, WHITE, '#7a5c2e')),
  ],
  KEN: [
    hw([BLACK, WHITE, '#bb0000', WHITE, '#006600'], [6, 1, 6, 1, 6]),
    draw((p) => {
      p.band(0.44, 0.14, 0.56, 0.86, 0.022, WHITE);
      p.band(0.56, 0.14, 0.44, 0.86, 0.022, WHITE);
      const { ctx } = p;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.fx(0.5), p.fy(0.5), p.s(0.13), p.s(0.34), 0, 0, TAU);
      ctx.fillStyle = '#bb0000';
      ctx.fill();
      ctx.clip();
      p.rect(0.42, 0.22, 0.16, 0.10, WHITE);
      p.rect(0.42, 0.68, 0.16, 0.10, WHITE);
      p.rect(0.42, 0.44, 0.16, 0.12, BLACK);
      ctx.restore();
    }),
  ],
  LBR: [
    hw(Array.from({ length: 11 }, (_, i) => (i % 2 === 0 ? '#bf0a30' : WHITE)), Array.from({ length: 11 }, () => 1)),
    rect(0, 0, 0.4, 6 / 11, '#002868'),
    star(0.2, 3 / 11, 0.16, WHITE),
  ],
  LBY: [
    hw(['#e70013', BLACK, '#239e46'], [1, 2, 1]),
    crescent(0.47, 0.5, 0.15, 0.12, 0.04, WHITE),
    star(0.575, 0.5, 0.075, WHITE, 5, 0.35),
  ],
  LSO: [
    hw(['#00209f', WHITE, '#009543'], [3, 4, 3]),
    draw((p) => {
      // The mokorotlo, the conical Basotho hat.
      p.poly([[0.5, 0.30], [0.58, 0.60], [0.42, 0.60]], BLACK);
      p.rect(0.39, 0.60, 0.22, 0.03, BLACK);
    }),
  ],
  MAR: [
    fill('#c1272d'),
    draw((p) => {
      p.starPath(0.5, 0.5, 0.30, 5, 0);
      p.ctx.lineWidth = p.s(0.035);
      p.ctx.strokeStyle = '#006233';
      p.ctx.stroke();
    }),
  ],
  MDG: [h('#fc3d32', '#007e3a'), rect(0, 0, 1 / 3, 1, WHITE)],
  MLI: [v('#14b53a', '#fcd116', '#ce1126')],
  MOZ: [
    hw(['#009a49', WHITE, BLACK, WHITE, '#fcd116'], [6, 1, 6, 1, 6]),
    hoist(0.42, '#e21c21'),
    star(0.14, 0.5, 0.13, WHITE),
    draw((p) => {
      p.rect(0.10, 0.46, 0.10, 0.02, BLACK);
      p.band(0.09, 0.58, 0.20, 0.42, 0.02, BLACK);
    }),
  ],
  MRT: [
    fill('#006233'),
    rect(0, 0, 1, 0.12, '#cd2a3e'),
    rect(0, 0.88, 1, 0.12, '#cd2a3e'),
    crescent(0.5, 0.46, 0.24, 0.20, 0.0, '#ffc400'),
    star(0.5, 0.42, 0.09, '#ffc400'),
  ],
  MUS: [h('#ea2839', '#1a206d', '#ffd500', '#00a551')],
  MWI: [
    h(BLACK, '#ce1126', '#339e35'),
    draw((p) => {
      const { ctx } = p;
      ctx.beginPath();
      ctx.arc(p.fx(0.5), p.fy(1 / 3), p.s(0.10), Math.PI, TAU);
      ctx.fillStyle = '#ce1126';
      ctx.fill();
      ctx.strokeStyle = '#ce1126';
      ctx.lineWidth = p.s(0.018);
      for (let i = 1; i < 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(p.fx(0.5) + Math.cos(a) * p.s(0.12), p.fy(1 / 3) + Math.sin(a) * p.s(0.12));
        ctx.lineTo(p.fx(0.5) + Math.cos(a) * p.s(0.20), p.fy(1 / 3) + Math.sin(a) * p.s(0.20));
        ctx.stroke();
      }
    }),
  ],
  NAM: [
    poly([[0, 0], [1, 0], [0, 1]], '#003580'),
    poly([[1, 0], [1, 1], [0, 1]], '#009543'),
    { t: 'diag', c: WHITE, w: 0.36, up: true },
    { t: 'diag', c: '#d21034', w: 0.24, up: true },
    sun(0.22, 0.26, 0.055, 12, 0.055, '#ffce00', 0.4),
  ],
  NER: [h('#e05206', WHITE, '#0db02b'), disc(0.5, 0.5, 0.15, '#e05206')],
  NGA: [v('#008751', WHITE, '#008751')],
  RWA: [hw(['#00a1de', '#fad201', '#20603d'], [2, 1, 1]), sun(0.78, 0.25, 0.055, 24, 0.045, '#e5be01', 0.35)],
  SDN: [h('#d21034', WHITE, BLACK), hoist(0.36, '#007229')],
  SEN: [v('#00853f', '#fdef42', '#e31b23'), star(0.5, 0.5, 0.16, '#00853f')],
  SLE: [h('#1eb53a', WHITE, '#0072c6')],
  SOM: [fill('#4189dd'), star(0.5, 0.5, 0.30, WHITE)],
  SSD: [
    hw([BLACK, WHITE, '#da121a', WHITE, '#0f47af'], [6, 1, 6, 1, 6]),
    hoist(0.44, '#078930'),
    star(0.14, 0.5, 0.11, '#fcdd09'),
  ],
  STP: [
    hw(['#12ad2b', '#ffce00', '#12ad2b'], [1, 2, 1]),
    hoist(0.30, '#d21034'),
    star(0.55, 0.5, 0.11, BLACK),
    star(0.75, 0.5, 0.11, BLACK),
  ],
  SWZ: [
    hw(['#3e5eb9', '#ffd900', '#b10c0c', '#ffd900', '#3e5eb9'], [3, 1, 8, 1, 3]),
    draw((p) => {
      p.band(0.30, 0.42, 0.70, 0.42, 0.03, BLACK);
      p.band(0.30, 0.58, 0.70, 0.58, 0.03, BLACK);
      const { ctx } = p;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.fx(0.5), p.fy(0.5), p.s(0.20), p.s(0.13), 0, 0, TAU);
      ctx.fillStyle = WHITE;
      ctx.fill();
      ctx.clip();
      p.rect(0.30, 0.44, 0.40, 0.06, BLACK);
      ctx.restore();
    }),
  ],
  SYC: [
    poly([[0, 1], [0, 0], [0.34, 0]], '#003f87'),
    poly([[0, 1], [0.34, 0], [0.67, 0]], '#fcd856'),
    poly([[0, 1], [0.67, 0], [1, 0], [1, 0.34]], '#d62828'),
    poly([[0, 1], [1, 0.34], [1, 0.67]], WHITE),
    poly([[0, 1], [1, 0.67], [1, 1]], '#007a3d'),
  ],
  TCD: [v('#002664', '#fecb00', '#c60c30')],
  TGO: [
    hw(Array.from({ length: 5 }, (_, i) => (i % 2 === 0 ? '#006a4e' : '#ffce00')), Array.from({ length: 5 }, () => 1)),
    rect(0, 0, 0.4, 0.6, '#d21034'),
    star(0.2, 0.3, 0.18, WHITE),
  ],
  TUN: [
    fill('#e70013'),
    disc(0.5, 0.5, 0.32, WHITE),
    crescent(0.5, 0.5, 0.22, 0.175, 0.06, '#e70013'),
    star(0.60, 0.5, 0.10, '#e70013', 5, 0.35),
  ],
  TZA: [
    poly([[0, 0], [1, 0], [0, 1]], '#1eb53a'),
    poly([[1, 0], [1, 1], [0, 1]], '#00a3dd'),
    { t: 'diag', c: '#fcd116', w: 0.34, up: true },
    { t: 'diag', c: BLACK, w: 0.22, up: true },
  ],
  UGA: [
    hw([BLACK, '#fcdc04', '#d90000', BLACK, '#fcdc04', '#d90000'], [1, 1, 1, 1, 1, 1]),
    disc(0.5, 0.5, 0.26, WHITE),
    draw((p) => {
      // The crested crane, standing.
      p.poly([[0.46, 0.66], [0.47, 0.48], [0.55, 0.44], [0.58, 0.50], [0.52, 0.56], [0.51, 0.66]], '#8d8c8d');
      p.rect(0.49, 0.62, 0.012, 0.10, '#8d8c8d');
      p.disc(0.565, 0.42, 0.035, '#d90000');
      p.poly([[0.58, 0.40], [0.64, 0.41], [0.58, 0.44]], BLACK);
    }),
  ],
  ZAF: [
    hw(['#de3831', '#002395'], [1, 1]),
    draw((p) => {
      p.band(0, 0, 0.42, 0.5, 0.40, WHITE);
      p.band(0, 1, 0.42, 0.5, 0.40, WHITE);
      p.band(0.40, 0.5, 1, 0.5, 0.40, WHITE);
      p.band(0, 0, 0.42, 0.5, 0.26, '#007a4d');
      p.band(0, 1, 0.42, 0.5, 0.26, '#007a4d');
      p.band(0.40, 0.5, 1, 0.5, 0.26, '#007a4d');
      p.poly([[0, 0.02], [0.38, 0.5], [0, 0.98]], '#ffb612');
      p.poly([[0, 0.13], [0.28, 0.5], [0, 0.87]], BLACK);
    }),
  ],
  ZMB: [
    fill('#198a00'),
    rect(0.62, 0.36, 0.125, 0.64, '#de2010'),
    rect(0.745, 0.36, 0.125, 0.64, BLACK),
    rect(0.87, 0.36, 0.125, 0.64, '#ef7d00'),
    draw((p) => {
      p.poly([[0.66, 0.28], [0.78, 0.16], [0.88, 0.10], [0.84, 0.22], [0.94, 0.20], [0.82, 0.30], [0.72, 0.30]], '#ef7d00');
    }),
  ],
  ZWE: [
    hw(['#319208', '#ffd200', '#de2010', BLACK, '#de2010', '#ffd200', '#319208'], [1, 1, 1, 1, 1, 1, 1]),
    poly([[0, 0], [0.40, 0.5], [0, 1]], BLACK),
    poly([[0, 0.045], [0.355, 0.5], [0, 0.955]], WHITE),
    star(0.115, 0.5, 0.20, '#de2010'),
    draw((p) => {
      p.poly([[0.10, 0.50], [0.15, 0.42], [0.17, 0.46], [0.14, 0.54], [0.155, 0.60], [0.10, 0.58]], '#ffd200');
    }),
  ],

  SOL: [
    h('#3d9e33', WHITE, '#ce1126'),
    star(0.5, 0.83, 0.11, BLACK),
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = p.s(0.028);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.fx(0.20), p.fy(0.42));
      ctx.lineTo(p.fx(0.80), p.fy(0.42));
      ctx.stroke();
      ctx.lineWidth = p.s(0.02);
      for (let i = 0; i < 6; i++) {
        const x = 0.24 + i * 0.095;
        ctx.beginPath();
        ctx.moveTo(p.fx(x), p.fy(0.40));
        ctx.quadraticCurveTo(p.fx(x + 0.03), p.fy(0.28), p.fx(x + 0.06), p.fy(0.39));
        ctx.stroke();
      }
    }),
  ],
};
