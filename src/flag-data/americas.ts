/** Flag specs: americas. */
import type { FlagSpec } from '../flags.ts';
import { TAU, WHITE, BLACK, UK_BLUE, fill, h, v, hw, vw, rect, cross, disc, ring, star, stars, poly, draw, hoist, shield, ensign, badge, sunOfMay } from './shorthands.ts';

export const AMERICAS: Record<string, FlagSpec> = {
  ABW: [
    fill('#418fde'),
    rect(0, 0.62, 1, 0.08, '#f9e814'),
    rect(0, 0.76, 1, 0.08, '#f9e814'),
    draw((p) => {
      // A four-pointed star, white-edged.
      p.starPath(0.18, 0.30, 0.20, 4, 0);
      p.ctx.fillStyle = '#ef3340';
      p.ctx.fill();
      p.ctx.lineWidth = p.s(0.035);
      p.ctx.strokeStyle = WHITE;
      p.ctx.stroke();
    }),
  ],
  AIA: [...ensign(UK_BLUE, ...badge('#f47b20'))],
  ATG: [
    fill('#ce1126'),
    draw((p) => {
      const { ctx } = p;
      ctx.save();
      p.polyPath([[0.13, 0], [0.87, 0], [0.5, 1]]);
      ctx.clip();
      p.rect(0, 0, 1, 0.42, BLACK);
      p.rect(0, 0.42, 1, 0.16, '#0072c6');
      p.rect(0, 0.58, 1, 0.42, WHITE);
      p.sun(0.5, 0.42, 0.09, 16, 0.11, '#ffcc00', 0.4);
      p.rect(0, 0.42, 1, 0.005, '#0072c6');
      ctx.restore();
    }),
  ],
  BHS: [hw(['#00abc9', '#ffc72c', '#00abc9'], [1, 1, 1]), hoist(0.42, BLACK)],
  BLZ: [
    fill('#003f87'),
    rect(0, 0, 1, 0.10, '#ce1126'),
    rect(0, 0.90, 1, 0.10, '#ce1126'),
    disc(0.5, 0.5, 0.36, WHITE),
    ring(0.5, 0.5, 0.30, 0.07, '#2e8b57'),
    draw((p) => shield(p, 0.5, 0.5, 0.18, WHITE, '#003f87')),
  ],
  BMU: [...ensign('#cf142b', ...badge('#007a3d'))],
  BRB: [
    v('#00267f', '#ffc726', '#00267f'),
    draw((p) => {
      p.rect(0.492, 0.42, 0.016, 0.34, BLACK);
      p.rect(0.44, 0.40, 0.12, 0.03, BLACK);
      for (const dx of [-0.052, 0, 0.052]) {
        p.poly([[0.5 + dx - 0.014, 0.40], [0.5 + dx + 0.014, 0.40], [0.5 + dx, 0.24]], BLACK);
      }
    }),
  ],
  CAN: [
    vw(['#d80621', WHITE, '#d80621'], [1, 2, 1]),
    // Eleven points, mirrored about the stem. Half-widths are relative so the
    // leaf cannot grow out of the white band whatever the box's aspect.
    draw((p) => {
      const half: number[][] = [
        [0.00, 0.00], [0.11, 0.19], [0.38, 0.15], [0.31, 0.31], [0.70, 0.44],
        [0.61, 0.50], [1.00, 0.63], [0.82, 0.68], [0.86, 0.76], [0.45, 0.71],
        [0.52, 0.92], [0.20, 0.84], [0.09, 1.00],
      ];
      const at = (q: number[], side: number): number[] => [0.5 + side * q[0]! * 0.20, 0.10 + q[1]! * 0.80];
      const points = half.map((q) => at(q, 1));
      for (let i = half.length - 1; i >= 0; i--) points.push(at(half[i]!, -1));
      p.poly(points, '#d80621');
    }),
  ],
  CRI: [hw(['#002b7f', WHITE, '#ce1126', WHITE, '#002b7f'], [1, 1, 2, 1, 1])],
  CUB: [
    hw(Array.from({ length: 5 }, (_, i) => (i % 2 === 0 ? '#002a8f' : WHITE)), Array.from({ length: 5 }, () => 1)),
    hoist(0.4, '#cf142b'),
    star(0.13, 0.5, 0.13, WHITE),
  ],
  CUW: [
    fill('#002b7f'),
    rect(0, 0.60, 1, 0.14, '#f9e814'),
    star(0.14, 0.22, 0.11, WHITE),
    star(0.27, 0.42, 0.075, WHITE),
  ],
  CYM: [...ensign(UK_BLUE, ...badge('#00778b'))],
  DMA: [
    fill('#006b3f'),
    draw((p) => {
      // Three stripes side by side make one cross, so the arms are drawn as
      // parallel bars rather than as concentric crosses.
      const bands = ['#fcd116', BLACK, WHITE];
      const { ctx } = p;
      const bar = p.s(0.055);
      bands.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(p.x, p.fy(0.5) - bar * 1.5 + i * bar, p.w, bar);
        ctx.fillRect(p.fx(0.5) - bar * 1.5 + i * bar, p.y, bar, p.h);
      });
      p.disc(0.5, 0.5, 0.22, '#d41c30');
      p.stars(0.5, 0.5, 0.19, 10, 0.032, '#006b3f');
      p.poly([[0.48, 0.56], [0.49, 0.46], [0.53, 0.44], [0.54, 0.50], [0.51, 0.56]], '#6f2da8');
    }),
  ],
  DOM: [
    fill('#002d62'),
    rect(0.5, 0, 0.5, 0.5, '#ce1126'),
    rect(0, 0.5, 0.5, 0.5, '#ce1126'),
    cross(WHITE, 0.22),
    draw((p) => shield(p, 0.5, 0.5, 0.15, WHITE, '#002d62')),
  ],
  ECU: [
    hw(['#ffdd00', '#034ea2', '#ed1c24'], [2, 1, 1]),
    draw((p) => {
      p.poly([[0.5, 0.30], [0.60, 0.44], [0.5, 0.58], [0.40, 0.44]], '#034ea2');
      p.poly([[0.44, 0.28], [0.56, 0.28], [0.5, 0.16]], '#c8a951');
      p.rect(0.494, 0.56, 0.012, 0.14, '#c8a951');
    }),
  ],
  GRD: [
    fill('#ce1126'),
    draw((p) => {
      const m = 0.16;
      p.poly([[m * (p.h / p.w), m], [1 - m * (p.h / p.w), m], [0.5, 0.5]], '#fcd116');
      p.poly([[m * (p.h / p.w), 1 - m], [1 - m * (p.h / p.w), 1 - m], [0.5, 0.5]], '#fcd116');
      p.poly([[m * (p.h / p.w), m], [0.5, 0.5], [m * (p.h / p.w), 1 - m]], '#007a5e');
      p.poly([[1 - m * (p.h / p.w), m], [0.5, 0.5], [1 - m * (p.h / p.w), 1 - m]], '#007a5e');
      for (let i = 0; i < 3; i++) {
        p.star(0.28 + i * 0.22, 0.08, 0.06, '#fcd116');
        p.star(0.28 + i * 0.22, 0.92, 0.06, '#fcd116');
      }
      p.disc(0.5, 0.5, 0.15, '#ce1126');
      p.star(0.5, 0.5, 0.12, '#fcd116');
      p.disc(0.235, 0.5, 0.075, '#ce1126');
      p.disc(0.235, 0.5, 0.055, '#fcd116');
    }),
  ],
  GTM: [
    v('#4997d0', WHITE, '#4997d0'),
    draw((p) => {
      p.ring(0.5, 0.55, 0.20, 0.05, '#3e7f3e');
      p.band(0.42, 0.66, 0.58, 0.36, 0.022, '#8d6a3f');
      p.band(0.58, 0.66, 0.42, 0.36, 0.022, '#8d6a3f');
      p.poly([[0.40, 0.44], [0.60, 0.44], [0.5, 0.34]], '#3e7f3e');
    }),
  ],
  GUM: [
    fill('#00307d'),
    draw((p) => {
      p.ctx.strokeStyle = '#c8102e';
      p.ctx.lineWidth = p.s(0.09);
      p.ctx.strokeRect(p.x + p.s(0.045), p.y + p.s(0.045), p.w - p.s(0.09), p.h - p.s(0.09));
      const { ctx } = p;
      ctx.beginPath();
      ctx.ellipse(p.fx(0.5), p.fy(0.5), p.s(0.17), p.s(0.30), 0, 0, TAU);
      ctx.fillStyle = '#9fd6e8';
      ctx.fill();
      ctx.lineWidth = p.s(0.02);
      ctx.strokeStyle = '#c8102e';
      ctx.stroke();
      p.poly([[0.44, 0.62], [0.56, 0.62], [0.5, 0.40]], WHITE);
    }),
  ],
  HND: [
    hw(['#0073cf', WHITE, '#0073cf'], [1, 1, 1]),
    draw((p) => {
      for (const [sx, sy] of [[0.5, 0.5], [0.42, 0.42], [0.58, 0.42], [0.42, 0.58], [0.58, 0.58]]) {
        p.star(sx!, sy!, 0.07, '#0073cf');
      }
    }),
  ],
  HTI: [
    h('#00209f', '#d21034'),
    rect(0.36, 0.30, 0.28, 0.40, WHITE),
    draw((p) => {
      p.rect(0.494, 0.36, 0.012, 0.20, '#0f5132');
      p.poly([[0.47, 0.38], [0.53, 0.38], [0.5, 0.32]], '#0f5132');
      p.rect(0.42, 0.60, 0.16, 0.02, '#8d6a3f');
    }),
  ],
  JAM: [
    poly([[0, 0], [1, 0], [0.5, 0.5]], BLACK),
    poly([[0, 1], [1, 1], [0.5, 0.5]], BLACK),
    poly([[0, 0], [0.5, 0.5], [0, 1]], '#009b3a'),
    poly([[1, 0], [0.5, 0.5], [1, 1]], '#009b3a'),
    { t: 'saltire', c: '#fed100', w: 0.20 },
  ],
  KNA: [
    poly([[0, 0], [1, 0], [0, 1]], '#009e49'),
    poly([[1, 0], [1, 1], [0, 1]], '#ce1126'),
    { t: 'diag', c: '#ffcd00', w: 0.42, up: true },
    { t: 'diag', c: BLACK, w: 0.30, up: true },
    star(0.30, 0.68, 0.10, WHITE),
    star(0.66, 0.30, 0.10, WHITE),
  ],
  LCA: [
    fill('#6cf'),
    poly([[0.5, 0.10], [0.30, 0.86], [0.70, 0.86]], WHITE),
    poly([[0.5, 0.18], [0.335, 0.86], [0.665, 0.86]], BLACK),
    poly([[0.5, 0.48], [0.30, 0.86], [0.70, 0.86]], '#fcd116'),
  ],
  MEX: [
    v('#006847', WHITE, '#ce1126'),
    draw((p) => {
      // The eagle on the cactus, as a bird over a wreath.
      p.poly([[0.48, 0.42], [0.56, 0.38], [0.62, 0.44], [0.55, 0.46], [0.53, 0.58], [0.46, 0.58], [0.44, 0.46], [0.38, 0.44], [0.44, 0.38]], '#6b4423');
      p.disc(0.475, 0.355, 0.03, '#6b4423');
      p.poly([[0.49, 0.335], [0.545, 0.345], [0.49, 0.375]], '#6b4423');
      p.ring(0.5, 0.63, 0.11, 0.035, '#2e6f40');
    }),
  ],
  MSR: [...ensign(UK_BLUE, ...badge('#1e6b52'))],
  NIC: [
    hw(['#0067c6', WHITE, '#0067c6'], [1, 1, 1]),
    draw((p) => {
      p.poly([[0.5, 0.34], [0.62, 0.62], [0.38, 0.62]], WHITE);
      p.ctx.lineWidth = p.s(0.02);
      p.ctx.strokeStyle = '#0067c6';
      p.polyPath([[0.5, 0.34], [0.62, 0.62], [0.38, 0.62]]);
      p.ctx.stroke();
      p.poly([[0.44, 0.58], [0.5, 0.46], [0.56, 0.58]], '#3d3d3d');
      p.band(0.42, 0.46, 0.58, 0.46, 0.02, '#ffcc00');
    }),
  ],
  PAN: [
    fill(WHITE),
    rect(0.5, 0, 0.5, 0.5, '#da121a'),
    rect(0, 0.5, 0.5, 0.5, '#072357'),
    star(0.25, 0.25, 0.16, '#072357'),
    star(0.75, 0.75, 0.16, '#da121a'),
  ],
  PRI: [
    hw(Array.from({ length: 5 }, (_, i) => (i % 2 === 0 ? '#ed0000' : WHITE)), Array.from({ length: 5 }, () => 1)),
    hoist(0.4, '#0050f0'),
    star(0.13, 0.5, 0.13, WHITE),
  ],
  SLV: [
    hw(['#0f47af', WHITE, '#0f47af'], [1, 1, 1]),
    draw((p) => {
      p.poly([[0.5, 0.32], [0.63, 0.62], [0.37, 0.62]], WHITE);
      p.ctx.lineWidth = p.s(0.02);
      p.ctx.strokeStyle = '#0f47af';
      p.polyPath([[0.5, 0.32], [0.63, 0.62], [0.37, 0.62]]);
      p.ctx.stroke();
      p.poly([[0.44, 0.58], [0.5, 0.44], [0.56, 0.58]], '#3d7a3d');
      p.ring(0.5, 0.5, 0.24, 0.03, '#3d7a3d');
    }),
  ],
  SXM: [
    h('#ce1126', '#003da5'),
    hoist(0.44, WHITE),
    draw((p) => shield(p, 0.16, 0.5, 0.19, '#ffcc00', '#003da5')),
  ],
  TCA: [...ensign(UK_BLUE, ...badge('#ffb612'))],
  TTO: [
    fill('#ce1126'),
    { t: 'diag', c: WHITE, w: 0.36 },
    { t: 'diag', c: BLACK, w: 0.22 },
  ],
  USA: [
    draw((p) => {
      p.layers([hw(Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? '#b31942' : WHITE)), Array.from({ length: 13 }, () => 1))]);
      const canton = 7 / 13;
      p.rect(0, 0, 0.4, canton, '#0a3161');
      // Nine rows: six stars, then five, alternating. Fifty in total.
      for (let row = 0; row < 9; row++) {
        const n = row % 2 === 0 ? 6 : 5;
        const y = ((row + 1) / 10) * canton;
        for (let i = 0; i < n; i++) {
          const x = (((row % 2 === 0 ? i + 1 : i + 1.5) / 7) * 0.4);
          p.star(x, y, 0.024, WHITE);
        }
      }
    }),
  ],
  VCT: [
    vw(['#0072c6', '#fcd116', '#009e60'], [1, 2, 1]),
    draw((p) => {
      for (const [dx, dy] of [[-0.075, 0.42], [0.075, 0.42], [0, 0.62]]) {
        const x = 0.5 + (dx! * p.h) / p.w;
        p.poly([[x, dy! - 0.09], [x + (0.055 * p.h) / p.w, dy!], [x, dy! + 0.09], [x - (0.055 * p.h) / p.w, dy!]], '#009e60');
      }
    }),
  ],
  VGB: [...ensign(UK_BLUE, ...badge('#1e6b52'))],
  VIR: [
    fill(WHITE),
    draw((p) => {
      p.poly([[0.5, 0.28], [0.66, 0.36], [0.74, 0.50], [0.60, 0.48], [0.56, 0.66], [0.44, 0.66], [0.40, 0.48], [0.26, 0.50], [0.34, 0.36]], '#f0b323');
      p.disc(0.5, 0.26, 0.045, WHITE);
      p.ctx.lineWidth = p.s(0.015);
      p.ctx.strokeStyle = '#4c6ea8';
      p.ctx.stroke();
      p.rect(0.455, 0.44, 0.09, 0.16, '#4c6ea8');
    }),
  ],

  // South America.
  ARG: [
    hw(['#75aadb', WHITE, '#75aadb'], [1, 1, 1]),
    draw((p) => sunOfMay(p, 0.5, 0.5, 0.085, '#f6b40e')),
  ],
  BOL: [
    h('#d52b1e', '#f9e300', '#007934'),
    draw((p) => {
      p.disc(0.5, 0.5, 0.17, '#d9c89e');
      p.ring(0.5, 0.5, 0.17, 0.03, '#a05a2c');
      p.poly([[0.44, 0.56], [0.5, 0.44], [0.56, 0.56]], '#5b7c3a');
    }),
  ],
  BRA: [
    fill('#009c3b'),
    poly([[0.5, 0.06], [0.955, 0.5], [0.5, 0.94], [0.045, 0.5]], '#ffdf00'),
    disc(0.5, 0.5, 0.245, '#002776'),
    draw((p) => {
      const { ctx } = p;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.fx(0.5), p.fy(0.5), p.s(0.245), 0, TAU);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(p.fx(0.5), p.fy(0.5) + p.s(0.60), p.s(0.66), Math.PI * 1.17, Math.PI * 1.83);
      ctx.lineWidth = p.s(0.075);
      ctx.strokeStyle = WHITE;
      ctx.stroke();
      // Stars, above and below the band. Not the real 27 constellations: at
      // this size they are pinpricks, and a plausible scatter is honest about
      // that where a wrong constellation would not be.
      const dots: number[][] = [
        [0.44, 0.40], [0.50, 0.37], [0.56, 0.41], [0.52, 0.44], [0.46, 0.46],
        [0.58, 0.47], [0.41, 0.48], [0.50, 0.62], [0.55, 0.64], [0.45, 0.64],
        [0.60, 0.58], [0.40, 0.58], [0.50, 0.68],
      ];
      for (const [sx, sy] of dots) p.star(sx!, sy!, 0.018, WHITE);
      ctx.restore();
    }),
  ],
  CHL: [
    fill('#d52b1e'),
    rect(0, 0, 1, 0.5, WHITE),
    rect(0, 0, 1 / 3, 0.5, '#0039a6'),
    star(1 / 6, 0.25, 0.16, WHITE),
  ],
  COL: [hw(['#fcd116', '#003893', '#ce1126'], [2, 1, 1])],
  FLK: [...ensign(UK_BLUE, ...badge('#3f6f3f'))],
  GUY: [
    fill('#009e49'),
    poly([[0, 0], [0.62, 0.5], [0, 1]], WHITE),
    poly([[0, 0], [0.54, 0.5], [0, 1]], '#fcd116'),
    poly([[0, 0], [0.36, 0.5], [0, 1]], BLACK),
    poly([[0, 0], [0.30, 0.5], [0, 1]], '#ce1126'),
  ],
  PER: [
    vw(['#d91023', WHITE, '#d91023'], [1, 1, 1]),
    draw((p) => shield(p, 0.5, 0.5, 0.24, WHITE, '#d91023')),
  ],
  PRY: [
    h('#d52b1e', WHITE, '#0038a8'),
    disc(0.5, 0.5, 0.15, WHITE),
    ring(0.5, 0.5, 0.15, 0.02, '#0038a8'),
    star(0.5, 0.5, 0.075, '#009b3a'),
  ],
  SUR: [
    hw(['#377e3f', WHITE, '#b40a2d', WHITE, '#377e3f'], [2, 1, 4, 1, 2]),
    star(0.5, 0.5, 0.20, '#ecc81d'),
  ],
  URY: [
    hw(Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? WHITE : '#0038a8')), Array.from({ length: 9 }, () => 1)),
    rect(0, 0, 0.44, 4 / 9, WHITE),
    draw((p) => sunOfMay(p, 0.22, 2 / 9, 0.05, '#fcd116')),
  ],
  VEN: [
    hw(['#ffcc00', '#00247d', '#cf142b'], [1, 1, 1]),
    stars(0.5, -0.10, 0.62, 8, 0.05, WHITE, Math.PI - 0.62, Math.PI + 0.62),
  ],
};
