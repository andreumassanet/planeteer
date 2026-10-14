/** Flag specs: asia. */
import type { FlagSpec } from '../flags.ts';
import { TAU, WHITE, BLACK, CREAM, INK, RED, GREEN, fill, h, v, hw, rect, cross, disc, ring, star, stars, crescent, sun, poly, draw, hoist, serrated } from './shorthands.ts';

export const ASIA: Record<string, FlagSpec> = {
  // The black-red-green tricolour, which is what flies for Afghanistan at the
  // United Nations. The 2021 change is contested; this is the neutral answer.
  AFG: [v(BLACK, '#be0000', '#007a36'), ring(0.5, 0.48, 0.21, 0.05, WHITE), rect(0.44, 0.68, 0.12, 0.035, WHITE)],
  ARE: [h(GREEN, WHITE, BLACK), rect(0, 0, 0.25, 1, RED)],
  ARM: [h('#d90012', '#0033a0', '#f2a800')],
  AZE: [
    h('#00b5e2', '#ed2939', '#3f9c35'),
    crescent(0.44, 0.5, 0.15, 0.12, 0.045, WHITE),
    star(0.60, 0.5, 0.09, WHITE, 8),
  ],
  BGD: [fill('#006a4d'), disc(0.45, 0.5, 0.30, '#f42a41')],
  BHR: [fill(WHITE), draw((p) => serrated(p, 0.32, 5, 0.10, '#ce1126'))],
  BRN: [
    fill('#f7e017'),
    poly([[0, 0.22], [1, 0.55], [1, 0.75], [0, 0.42]], WHITE),
    poly([[0, 0.42], [1, 0.75], [1, 0.92], [0, 0.60]], BLACK),
    draw((p) => {
      p.disc(0.5, 0.52, 0.16, '#e8112d');
      p.poly([[0.42, 0.44], [0.58, 0.44], [0.55, 0.62], [0.45, 0.62]], '#f7e017');
    }),
  ],
  BTN: [
    poly([[0, 0], [1, 0], [0, 1]], '#ffd520'),
    poly([[1, 0], [1, 1], [0, 1]], '#ff4e12'),
    // The dragon, as a body arcing along the divide with a head at the fly.
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = p.s(0.13);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p.fx(0.16), p.fy(0.78));
      ctx.quadraticCurveTo(p.fx(0.42), p.fy(0.34), p.fx(0.66), p.fy(0.44));
      ctx.quadraticCurveTo(p.fx(0.82), p.fy(0.50), p.fx(0.86), p.fy(0.30));
      ctx.stroke();
      p.disc(0.86, 0.28, 0.09, WHITE);
      p.poly([[0.90, 0.22], [0.99, 0.16], [0.92, 0.30]], WHITE);
    }),
  ],
  CHN: [
    fill('#ee1c25'),
    star(0.17, 0.28, 0.16, '#ffde00'),
    draw((p) => {
      // The four small stars each point at the big one.
      const small: number[][] = [[0.33, 0.11], [0.38, 0.22], [0.38, 0.36], [0.33, 0.47]];
      for (const [sx, sy] of small) {
        const a = Math.atan2((0.17 - sx!) * p.w, -(0.28 - sy!) * p.h);
        p.star(sx!, sy!, 0.055, '#ffde00', 5, -a);
      }
    }),
  ],
  GEO: [
    fill(WHITE),
    cross('#ff0000', 0.20),
    draw((p) => {
      for (const [qx, qy] of [[0.24, 0.25], [0.76, 0.25], [0.24, 0.75], [0.76, 0.75]]) {
        p.layers([cross('#ff0000', 0.045, qx, qy, 0.17)]);
      }
    }),
  ],
  HKG: [
    fill('#de2910'),
    draw((p) => {
      // Five petals turning about the centre.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        const { ctx } = p;
        ctx.save();
        ctx.translate(p.fx(0.5), p.fy(0.5));
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(p.s(0.14), -p.s(0.22), 0, -p.s(0.30));
        ctx.quadraticCurveTo(-p.s(0.14), -p.s(0.22), 0, 0);
        ctx.fillStyle = WHITE;
        ctx.fill();
        ctx.restore();
      }
    }),
  ],
  IDN: [h('#ff0000', WHITE)],
  IND: [
    h('#ff9933', WHITE, '#138808'),
    draw((p) => {
      p.ring(0.5, 0.5, 0.13, 0.022, '#000080');
      const { ctx } = p;
      ctx.strokeStyle = '#000080';
      ctx.lineWidth = p.s(0.012);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        ctx.beginPath();
        ctx.moveTo(p.fx(0.5) + Math.sin(a) * p.s(0.02), p.fy(0.5) - Math.cos(a) * p.s(0.02));
        ctx.lineTo(p.fx(0.5) + Math.sin(a) * p.s(0.13), p.fy(0.5) - Math.cos(a) * p.s(0.13));
        ctx.stroke();
      }
      p.disc(0.5, 0.5, 0.028, '#000080');
    }),
  ],
  IRN: [
    h('#239f40', WHITE, '#da0000'),
    draw((p) => {
      // The emblem: four crescents around a central sword.
      p.rect(0.5 - 0.008, 0.38, 0.016, 0.24, '#da0000');
      for (const side of [-1, 1]) {
        p.crescent(0.5 + (side * 0.055 * p.h) / p.w, 0.5, 0.11, 0.085, side * 0.03, '#da0000');
      }
      // The band edges carry a repeated inscription; at this size it is a rhythm.
      const { ctx } = p;
      ctx.fillStyle = '#da0000';
      for (let i = 0; i < 22; i++) ctx.fillRect(p.fx(0.02 + i * 0.045), p.fy(0.345), p.s(0.016), p.s(0.028));
      ctx.fillStyle = '#239f40';
      for (let i = 0; i < 22; i++) ctx.fillRect(p.fx(0.02 + i * 0.045), p.fy(0.628), p.s(0.016), p.s(0.028));
    }),
  ],
  IRQ: [
    h('#ce1126', WHITE, BLACK),
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = '#007a3d';
      ctx.lineWidth = p.s(0.035);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(p.fx(0.34 + i * 0.11), p.fy(0.56));
        ctx.quadraticCurveTo(p.fx(0.39 + i * 0.11), p.fy(0.40), p.fx(0.44 + i * 0.11), p.fy(0.56));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(p.fx(0.30), p.fy(0.58));
      ctx.lineTo(p.fx(0.70), p.fy(0.58));
      ctx.stroke();
    }),
  ],
  ISR: [
    fill(WHITE),
    rect(0, 0.14, 1, 0.11, '#0038b8'),
    rect(0, 0.75, 1, 0.11, '#0038b8'),
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = '#0038b8';
      ctx.lineWidth = p.s(0.035);
      for (const flip of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU;
          const x = p.fx(0.5) + Math.sin(a) * p.s(0.20) * 1;
          const y = p.fy(0.5) - flip * Math.cos(a) * p.s(0.20);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }),
  ],
  JOR: [h(BLACK, WHITE, '#007a3b'), hoist(0.36, RED), star(0.14, 0.5, 0.09, WHITE, 7)],
  JPN: [fill(WHITE), disc(0.5, 0.5, 0.30, '#bc002d')],
  KAZ: [
    fill('#00afca'),
    sun(0.52, 0.44, 0.11, 32, 0.10, '#fec50c', 0.3),
    draw((p) => {
      // The steppe eagle below the sun: two long wings and a small body.
      for (const side of [-1, 1]) {
        p.poly([
          [0.52 + side * 0.01, 0.70], [0.52 + side * 0.10, 0.655], [0.52 + side * 0.20, 0.645],
          [0.52 + side * 0.16, 0.685], [0.52 + side * 0.07, 0.715],
        ], '#fec50c');
      }
      p.poly([[0.505, 0.66], [0.535, 0.66], [0.528, 0.78], [0.512, 0.78]], '#fec50c');
      p.disc(0.52, 0.645, 0.022, '#fec50c');
      for (let i = 0; i < 6; i++) {
        p.poly([[0.03, 0.06 + i * 0.155], [0.075, 0.115 + i * 0.155], [0.03, 0.17 + i * 0.155]], '#fec50c');
      }
    }),
  ],
  KGZ: [
    fill('#e8112d'),
    sun(0.5, 0.5, 0.17, 40, 0.10, '#ffef00', 0.3),
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = '#e8112d';
      ctx.lineWidth = p.s(0.022);
      ctx.beginPath();
      ctx.arc(p.fx(0.5), p.fy(0.5), p.s(0.115), 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(p.fx(0.5) - Math.sin(a) * p.s(0.13), p.fy(0.5) + Math.cos(a) * p.s(0.13));
        ctx.lineTo(p.fx(0.5) + Math.sin(a) * p.s(0.13), p.fy(0.5) - Math.cos(a) * p.s(0.13));
        ctx.stroke();
      }
    }),
  ],
  KHM: [
    hw(['#032ea1', '#e00025', '#032ea1'], [1, 2, 1]),
    // Angkor Wat: three towers on a plinth.
    draw((p) => {
      for (const [tx, ty] of [[0.5, 0.30], [0.415, 0.38], [0.585, 0.38]]) {
        p.poly([[tx! - 0.035, 0.62], [tx! - 0.028, ty! + 0.06], [tx!, ty!], [tx! + 0.028, ty! + 0.06], [tx! + 0.035, 0.62]], WHITE);
      }
      p.rect(0.36, 0.62, 0.28, 0.035, WHITE);
      p.rect(0.33, 0.665, 0.34, 0.03, WHITE);
    }),
  ],
  KOR: [
    fill(WHITE),
    draw((p) => {
      const { ctx } = p;
      const x = p.fx(0.5);
      const y = p.fy(0.5);
      const r = p.s(0.24);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 3);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fillStyle = '#cd2e3a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI);
      ctx.fillStyle = '#0047a0';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r / 2, 0, r / 2, 0, TAU);
      ctx.fillStyle = '#cd2e3a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r / 2, 0, r / 2, 0, TAU);
      ctx.fillStyle = '#0047a0';
      ctx.fill();
      ctx.restore();
      // The four trigrams, each a stack of three bars facing the centre.
      const trigrams: [number, number, number[]][] = [
        [-1, -1, [1, 1, 1]],
        [-1, 1, [1, 0, 1]],
        [1, -1, [0, 1, 0]],
        [1, 1, [0, 0, 0]],
      ];
      ctx.fillStyle = BLACK;
      for (const [sx, sy, bars] of trigrams) {
        ctx.save();
        ctx.translate(p.fx(0.5 + sx * 0.215), p.fy(0.5 + sy * 0.30));
        ctx.rotate(Math.atan2(-sx * 0.215 * p.w, sy * 0.30 * p.h));
        const bw = p.s(0.20);
        const bh = p.s(0.028);
        bars.forEach((solid, i) => {
          const by = (i - 1) * p.s(0.048) - bh / 2;
          if (solid === 1) ctx.fillRect(-bw / 2, by, bw, bh);
          else {
            ctx.fillRect(-bw / 2, by, bw * 0.42, bh);
            ctx.fillRect(bw * 0.08, by, bw * 0.42, bh);
          }
        });
        ctx.restore();
      }
    }),
  ],
  KWT: [
    h(GREEN, WHITE, RED),
    poly([[0, 0], [0.28, 1 / 3], [0.28, 2 / 3], [0, 1]], BLACK),
  ],
  LAO: [hw([RED, '#002868', RED], [1, 2, 1]), disc(0.5, 0.5, 0.22, WHITE)],
  LBN: [
    hw(['#ed1c24', WHITE, '#ed1c24'], [1, 2, 1]),
    draw((p) => {
      p.rect(0.49, 0.55, 0.02, 0.12, '#6b4423');
      for (let i = 0; i < 3; i++) {
        const w = 0.16 - i * 0.045;
        p.poly([[0.5 - w, 0.60 - i * 0.09], [0.5 + w, 0.60 - i * 0.09], [0.5, 0.44 - i * 0.09]], '#00a850');
      }
    }),
  ],
  LKA: [
    fill('#ffbe29'),
    rect(0.04, 0.08, 0.14, 0.84, '#00534e'),
    rect(0.18, 0.08, 0.14, 0.84, '#eb7400'),
    rect(0.36, 0.08, 0.60, 0.84, '#8d153a'),
    draw((p) => {
      // The lion: a body, a maned head, four legs, a tail and a raised sword.
      const gold = '#ffbe29';
      p.poly([[0.56, 0.42], [0.78, 0.42], [0.80, 0.56], [0.56, 0.58]], gold);
      p.disc(0.56, 0.40, 0.075, gold);
      for (const lx of [0.60, 0.68, 0.74]) p.rect(lx, 0.56, 0.022, 0.14, gold);
      p.poly([[0.79, 0.44], [0.86, 0.30], [0.89, 0.33], [0.82, 0.48]], gold);
      p.rect(0.518, 0.16, 0.014, 0.24, gold);
      p.poly([[0.505, 0.38], [0.545, 0.38], [0.525, 0.44]], gold);
      for (const [lx, ly] of [[0.40, 0.16], [0.40, 0.82], [0.90, 0.16], [0.90, 0.82]]) {
        p.poly([[lx!, ly! - 0.09], [lx! + 0.035, ly!], [lx!, ly! + 0.09], [lx! - 0.035, ly!]], '#ffbe29');
      }
    }),
  ],
  MMR: [h('#fecb00', '#34b233', '#ea2839'), star(0.5, 0.5, 0.34, WHITE)],
  MNG: [
    v('#c4272f', '#015197', '#c4272f'),
    draw((p) => {
      // The soyombo, as its stack: flame, sun, moon, then the bars.
      const x = 0.165;
      p.poly([[x - 0.03, 0.24], [x, 0.13], [x + 0.03, 0.24]], '#f9cf02');
      p.disc(x, 0.29, 0.035, '#f9cf02');
      p.crescent(x, 0.375, 0.05, 0.04, 0.018, '#f9cf02');
      p.rect(x - 0.05, 0.44, 0.10, 0.035, '#f9cf02');
      p.rect(x - 0.05, 0.70, 0.10, 0.035, '#f9cf02');
      p.rect(x - 0.05, 0.52, 0.026, 0.15, '#f9cf02');
      p.rect(x + 0.024, 0.52, 0.026, 0.15, '#f9cf02');
      p.poly([[x - 0.02, 0.52], [x + 0.02, 0.52], [x, 0.60]], '#f9cf02');
      p.poly([[x - 0.02, 0.67], [x + 0.02, 0.67], [x, 0.59]], '#f9cf02');
    }),
  ],
  MYS: [
    hw(Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? '#cc0001' : WHITE)), Array.from({ length: 14 }, () => 1)),
    rect(0, 0, 0.5, 8 / 14, '#010066'),
    crescent(0.18, 0.28, 0.14, 0.115, 0.045, '#ffcc00'),
    star(0.32, 0.30, 0.11, '#ffcc00', 14),
  ],
  NPL: [
    // Not a rectangle, and pretending otherwise would be the one flag everyone
    // notices. The box stays card-coloured and the pennant is drawn inside it.
    fill(CREAM),
    draw((p) => {
      const { ctx } = p;
      const outline: number[][] = [[0.14, 0.06], [0.68, 0.40], [0.38, 0.40], [0.80, 0.87], [0.14, 0.87]];
      ctx.lineJoin = 'round';
      // Widest stroke first, then narrower, then the fill: the ink ends up
      // outside the blue border and the blue outside the crimson, in one pass.
      p.polyPath(outline);
      ctx.lineWidth = p.s(0.13);
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = p.s(0.10);
      ctx.strokeStyle = '#003893';
      ctx.stroke();
      ctx.fillStyle = '#dc143c';
      ctx.fill();
      // Moon above, sun below.
      p.crescent(0.27, 0.22, 0.08, 0.062, 0.026, WHITE);
      p.sun(0.29, 0.64, 0.042, 12, 0.034, WHITE, 0.55);
    }),
  ],
  OMN: [
    h(WHITE, '#db161b', '#008000'),
    rect(0, 0, 0.28, 1, '#db161b'),
    draw((p) => {
      // Khanjar and two crossed sabres.
      p.rect(0.135, 0.10, 0.015, 0.14, WHITE);
      p.crescent(0.142, 0.24, 0.075, 0.06, 0.0, WHITE);
      p.band(0.06, 0.10, 0.22, 0.24, 0.018, WHITE);
      p.band(0.22, 0.10, 0.06, 0.24, 0.018, WHITE);
    }),
  ],
  PAK: [
    fill('#01411c'),
    rect(0, 0, 0.25, 1, WHITE),
    crescent(0.60, 0.52, 0.24, 0.19, 0.07, WHITE),
    star(0.76, 0.36, 0.11, WHITE, 5, 0.6),
  ],
  PHL: [
    h('#0038a8', '#ce1126'),
    hoist(0.5, WHITE),
    sun(0.17, 0.5, 0.075, 8, 0.075, '#fcd116', 0.35),
    star(0.055, 0.11, 0.055, '#fcd116'),
    star(0.055, 0.89, 0.055, '#fcd116'),
    star(0.44, 0.5, 0.055, '#fcd116'),
  ],
  PRK: [
    hw(['#024fa2', WHITE, '#ed1c27', WHITE, '#024fa2'], [6, 2, 20, 2, 6]),
    disc(0.33, 0.5, 0.20, WHITE),
    star(0.33, 0.5, 0.155, '#ed1c27'),
  ],
  PSE: [h(BLACK, WHITE, '#007a3b'), hoist(0.36, RED)],
  QAT: [fill(WHITE), draw((p) => serrated(p, 0.32, 9, 0.10, '#8a1538'))],
  SAU: [
    fill('#006c35'),
    draw((p) => {
      // The shahada above the sword: a script rhythm, not letters.
      const { ctx } = p;
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = p.s(0.045);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.fx(0.16), p.fy(0.42));
      ctx.lineTo(p.fx(0.84), p.fy(0.42));
      ctx.stroke();
      ctx.lineWidth = p.s(0.028);
      for (let i = 0; i < 7; i++) {
        const x = 0.20 + i * 0.095;
        ctx.beginPath();
        ctx.moveTo(p.fx(x), p.fy(0.40));
        ctx.quadraticCurveTo(p.fx(x + 0.03), p.fy(0.24), p.fx(x + 0.06), p.fy(0.38));
        ctx.stroke();
      }
      p.rect(0.22, 0.62, 0.62, 0.045, WHITE);
      p.poly([[0.22, 0.605], [0.10, 0.6425], [0.22, 0.68]], WHITE);
      p.rect(0.84, 0.585, 0.035, 0.10, WHITE);
    }),
  ],
  SGP: [
    h('#ed2939', WHITE),
    crescent(0.22, 0.25, 0.17, 0.135, 0.05, WHITE),
    stars(0.36, 0.25, 0.11, 5, 0.05, WHITE),
  ],
  // Adopted in 2025, replacing the 1980 flag. Green over white over black with
  // three red stars.
  SYR: [h('#007a3d', WHITE, BLACK), star(0.35, 0.5, 0.10, '#ce1126'), star(0.5, 0.5, 0.10, '#ce1126'), star(0.65, 0.5, 0.10, '#ce1126')],
  THA: [hw(['#a51931', WHITE, '#2d2a4a', WHITE, '#a51931'], [1, 1, 2, 1, 1])],
  TJK: [
    hw(['#cc0000', WHITE, '#006600'], [2, 3, 2]),
    draw((p) => {
      p.poly([[0.42, 0.55], [0.42, 0.46], [0.455, 0.50], [0.5, 0.44], [0.545, 0.50], [0.58, 0.46], [0.58, 0.55]], '#f8c300');
      p.stars(0.5, 0.66, 0.30, 7, 0.032, '#f8c300', -0.75, 0.75);
    }),
  ],
  TKM: [
    fill('#28ae66'),
    rect(0.10, 0, 0.11, 1, '#b5121b'),
    draw((p) => {
      for (let i = 0; i < 5; i++) {
        p.poly([[0.155, 0.10 + i * 0.19], [0.205, 0.16 + i * 0.19], [0.155, 0.22 + i * 0.19], [0.105, 0.16 + i * 0.19]], WHITE);
      }
    }),
    crescent(0.42, 0.30, 0.16, 0.13, 0.045, WHITE),
    stars(0.57, 0.30, 0.14, 5, 0.045, WHITE),
  ],
  TLS: [
    fill('#dc241f'),
    poly([[0, 0], [0.78, 0.5], [0, 1]], '#ffc726'),
    poly([[0, 0], [0.5, 0.5], [0, 1]], BLACK),
    star(0.16, 0.5, 0.13, WHITE, 5, 0.6),
  ],
  TUR: [
    fill('#e30a17'),
    crescent(0.40, 0.5, 0.28, 0.225, 0.055, WHITE),
    star(0.585, 0.5, 0.115, WHITE, 5, 0.35),
  ],
  TWN: [
    fill('#fe0000'),
    rect(0, 0, 0.5, 0.5, '#000095'),
    sun(0.25, 0.25, 0.075, 12, 0.06, WHITE, 0.55),
    disc(0.25, 0.25, 0.055, '#000095'),
    disc(0.25, 0.25, 0.045, WHITE),
  ],
  UZB: [
    hw(['#0099b5', '#ce1126', WHITE, '#ce1126', '#1eb53a'], [10, 1, 10, 1, 10]),
    crescent(0.20, 0.24, 0.14, 0.115, 0.04, WHITE),
    // Twelve stars in rows of three, four and five.
    draw((p) => {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 3 + row; i++) p.star(0.30 + i * 0.055, 0.13 + row * 0.11, 0.035, WHITE);
      }
    }),
  ],
  VNM: [fill('#da251d'), star(0.5, 0.5, 0.30, '#ffff00')],
  YEM: [h('#ce1126', WHITE, BLACK)],

  CYN: [
    fill(WHITE),
    rect(0, 0.10, 1, 0.10, '#e30a17'),
    rect(0, 0.80, 1, 0.10, '#e30a17'),
    crescent(0.42, 0.5, 0.19, 0.155, 0.04, '#e30a17'),
    star(0.60, 0.5, 0.09, '#e30a17', 5, 0.35),
  ],
};
