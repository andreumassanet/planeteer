/** Flag specs: europe. */
import type { FlagSpec } from '../flags.ts';
import { TAU, WHITE, BLACK, INK, fill, h, v, hw, vw, rect, cross, stars, poly, draw, hoist, nordic, shieldPath, shield, doubleEagle, unionJack } from './shorthands.ts';

export const EUROPE: Record<string, FlagSpec> = {
  ALA: [fill('#0053a5'), nordic('#ffce00', 0.24), nordic('#d21034', 0.10)],
  ALB: [fill('#e41e20'), draw((p) => doubleEagle(p, 0.5, 0.5, 0.32, BLACK))],
  AND: [
    vw(['#10069f', '#fedd00', '#d0103a'], [8, 9, 8]),
    draw((p) => shield(p, 0.5, 0.5, 0.26, '#fedd00', '#a00c1f')),
  ],
  AUT: [h('#ed2939', WHITE, '#ed2939')],
  BEL: [v(BLACK, '#fae042', '#ed2939')],
  BGR: [h(WHITE, '#00966e', '#d62612')],
  BIH: [
    fill('#002395'),
    // The right angle sits on the *upper fly* and the triangle spans the full
    // height, so the hypotenuse runs down to the right and the stars descend
    // with it. Drawn the other way round it is a different flag entirely.
    poly([[0.22, 0], [0.88, 0], [0.88, 1]], '#fecb00'),
    draw((p) => {
      // Seven whole stars and two halves, cut off by the top and bottom edges.
      for (let i = 0; i < 9; i++) {
        const t = -0.055 + (i * 1.11) / 8;
        p.star(0.11 + t * 0.66, t, 0.075, WHITE);
      }
    }),
  ],
  BLR: [
    hw(['#c8313e', '#4aa657'], [2, 1]),
    rect(0, 0, 0.11, 1, WHITE),
    // The hoist ornament, reduced to its motif: a stack of red diamonds.
    draw((p) => {
      for (let i = 0; i < 5; i++) {
        p.poly([[0.055, 0.06 + i * 0.2], [0.10, 0.16 + i * 0.2], [0.055, 0.26 + i * 0.2], [0.01, 0.16 + i * 0.2]], '#c8313e');
      }
    }),
  ],
  CHE: [fill('#d52b1e'), cross(WHITE, 0.20, 0.5, 0.5, 0.64)],
  CYP: [
    fill(WHITE),
    // Cyprus draws its own outline on its flag. Ours is hand-cut, not taken
    // from `countries.json`: this module has to work without the world loaded.
    poly([
      [0.22, 0.42], [0.27, 0.35], [0.34, 0.31], [0.42, 0.31], [0.49, 0.28],
      [0.56, 0.26], [0.63, 0.22], [0.72, 0.16], [0.80, 0.12], [0.81, 0.17],
      [0.72, 0.23], [0.64, 0.28], [0.57, 0.33], [0.53, 0.40], [0.46, 0.48],
      [0.36, 0.52], [0.27, 0.50],
    ], '#d57800'),
    // Two olive branches, rising from the foot of the flag.
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = '#4e5b31';
      ctx.lineWidth = p.s(0.04);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const tip = 0.5 + side * 0.22;
        ctx.beginPath();
        ctx.moveTo(p.fx(0.5), p.fy(0.92));
        ctx.quadraticCurveTo(p.fx(0.5 + side * 0.14), p.fy(0.86), p.fx(tip), p.fy(0.60));
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const t = 0.28 + i * 0.22;
          const u = 1 - t;
          const lx = u * u * 0.5 + 2 * u * t * (0.5 + side * 0.14) + t * t * tip;
          const ly = u * u * 0.92 + 2 * u * t * 0.86 + t * t * 0.60;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(p.fx(lx), p.fy(ly), p.s(0.065), p.s(0.024), side * 1.1, 0, TAU);
          ctx.fillStyle = '#4e5b31';
          ctx.fill();
          ctx.restore();
        }
      }
    }),
  ],
  CZE: [h(WHITE, '#d7141a'), hoist(0.5, '#11457e')],
  DEU: [h(BLACK, '#dd0000', '#ffce00')],
  DNK: [fill('#c8102e'), nordic(WHITE, 0.24)],
  ESP: [
    hw(['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]),
    // The arms, at the only level of detail that survives a 26-pixel chip: a
    // quartered shield between the two Pillars of Hercules, under a crown.
    draw((p) => {
      const { ctx } = p;
      const k = p.h / p.w;
      const cx = 0.33;
      for (const side of [-1, 1]) {
        const x = cx + side * 0.225 * k;
        p.rect(x - 0.009 * k, 0.36, 0.018 * k, 0.30, '#aa151b');
        p.rect(x - 0.016 * k, 0.335, 0.032 * k, 0.03, '#aa151b');
      }
      shield(p, cx, 0.5, 0.17, '#f1bf00', '#aa151b');
      ctx.save();
      shieldPath(p, cx, 0.5, 0.17);
      ctx.clip();
      p.rect(cx - 0.15 * k, 0.33, 0.15 * k, 0.17, '#aa151b');
      p.rect(cx, 0.50, 0.15 * k, 0.21, '#aa151b');
      p.rect(cx, 0.33, 0.15 * k, 0.17, '#f5f5f5');
      p.rect(cx - 0.15 * k, 0.50, 0.15 * k, 0.21, '#f5f5f5');
      ctx.restore();
      p.rect(cx - 0.055 * k, 0.285, 0.11 * k, 0.028, '#aa151b');
    }),
  ],
  EST: [h('#0072ce', BLACK, WHITE)],
  FIN: [fill(WHITE), nordic('#003580', 0.24)],
  FRA: [v('#002395', WHITE, '#ed2939')],
  FRO: [fill(WHITE), nordic('#0065bd', 0.28), nordic('#ed2939', 0.13)],
  GBR: [draw(unionJack)],
  GGY: [fill(WHITE), cross('#e8112d', 0.26), cross('#f9dd16', 0.09)],
  IMN: [
    fill('#cf142b'),
    // The triskelion: three armoured legs bent at the knee. Without the feet it
    // reads as an abstract pinwheel and, worse, as something else entirely.
    draw((p) => {
      const { ctx } = p;
      ctx.strokeStyle = '#f6d02f';
      ctx.lineWidth = p.s(0.10);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        const kx = p.fx(0.5) + Math.sin(a) * p.s(0.20);
        const ky = p.fy(0.5) - Math.cos(a) * p.s(0.20);
        const b = a + 2.1;
        const fx = kx + Math.sin(b) * p.s(0.20);
        const fy = ky - Math.cos(b) * p.s(0.20);
        ctx.beginPath();
        ctx.moveTo(p.fx(0.5), p.fy(0.5));
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        // The foot, turned out from the shin.
        const c = b + 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.sin(c) * p.s(0.11), fy - Math.cos(c) * p.s(0.11));
        ctx.stroke();
      }
      p.disc(0.5, 0.5, 0.075, '#f6d02f');
    }),
  ],
  IRL: [v('#169b62', WHITE, '#ff883e')],
  ISL: [fill('#02529c'), nordic(WHITE, 0.28), nordic('#dc1e35', 0.13)],
  ITA: [v('#008c45', '#f4f5f0', '#cd212a')],
  GRC: [
    hw([...Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? '#0d5eaf' : WHITE))], Array.from({ length: 9 }, () => 1)),
    draw((p) => {
      // The canton is five stripes tall and square, so its width is measured in
      // height units — not in width fractions like everything else here.
      const side = p.s(5 / 9);
      p.ctx.fillStyle = '#0d5eaf';
      p.ctx.fillRect(p.x, p.y, side, side);
      p.ctx.fillStyle = WHITE;
      p.ctx.fillRect(p.x, p.y + side / 2 - p.s(0.055), side, p.s(0.11));
      p.ctx.fillRect(p.x + side / 2 - p.s(0.055), p.y, p.s(0.11), side);
    }),
  ],
  GRL: [
    h(WHITE, '#d00c33'),
    // The disc is counterchanged: red where the flag is white, white where red.
    draw((p) => {
      const { ctx } = p;
      const x = p.fx(0.32);
      const y = p.fy(0.5);
      const r = p.s(0.34);
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, TAU);
      ctx.fillStyle = '#d00c33';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.fillStyle = WHITE;
      ctx.fill();
    }),
  ],
  HRV: [
    h('#ff0000', WHITE, '#171796'),
    draw((p) => {
      shield(p, 0.5, 0.47, 0.24, WHITE, INK);
      // The chequy, clipped to the shield. In pixels: the cells have to be
      // square, and the shield is measured in height units.
      const { ctx } = p;
      ctx.save();
      shieldPath(p, 0.5, 0.47, 0.24);
      ctx.clip();
      const cell = p.s(0.077);
      const left = p.fx(0.5) - cell * 2.5;
      const top = p.fy(0.47) - p.s(0.24);
      ctx.fillStyle = '#ff0000';
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 5; c++) {
          if ((r + c) % 2 === 0) ctx.fillRect(left + c * cell, top + r * cell, cell, cell);
        }
      }
      ctx.restore();
    }),
  ],
  HUN: [h('#cd2a3e', WHITE, '#436f4d')],
  JEY: [
    fill(WHITE),
    { t: 'saltire', c: '#e8112d', w: 0.20 },
    draw((p) => {
      p.disc(0.5, 0.22, 0.11, '#f9dd16');
      p.disc(0.5, 0.22, 0.06, '#e8112d');
    }),
  ],
  KOS: [
    fill('#244aa5'),
    // The gold outline of the country, cut by hand at this size.
    poly([
      [0.42, 0.30], [0.52, 0.32], [0.58, 0.42], [0.57, 0.55], [0.50, 0.68],
      [0.43, 0.70], [0.38, 0.62], [0.36, 0.46], [0.38, 0.34],
    ], '#d0a650'),
    stars(0.47, 0.86, 0.68, 6, 0.075, WHITE, -0.55, 0.55),
  ],
  LIE: [
    h('#002b7f', '#ce1126'),
    draw((p) => {
      p.disc(0.22, 0.25, 0.10, '#ffd83d');
      p.poly([[0.16, 0.30], [0.28, 0.30], [0.26, 0.20], [0.22, 0.25], [0.18, 0.20]], '#ffd83d');
    }),
  ],
  LTU: [h('#fdb913', '#006a44', '#c1272d')],
  LUX: [h('#ed2939', WHITE, '#00a1de')],
  LVA: [hw(['#9e3039', WHITE, '#9e3039'], [2, 1, 2])],
  MDA: [
    v('#0046ae', '#ffd200', '#cc092f'),
    draw((p) => shield(p, 0.5, 0.5, 0.22, '#cc092f', '#0046ae')),
  ],
  MKD: [
    fill('#d20000'),
    // Eight rays that broaden as they go, reaching the edges. Not a sun with a
    // rim: the rays *are* the design, so they are drawn as wedges to the corners.
    draw((p) => {
      const { ctx } = p;
      const x = p.fx(0.5);
      const y = p.fy(0.5);
      ctx.fillStyle = '#ffe600';
      const reach = Math.hypot(p.w, p.h);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        const half = 0.115;
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(a - half) * p.s(0.12), y - Math.cos(a - half) * p.s(0.12));
        ctx.lineTo(x + Math.sin(a - half * 1.4) * reach, y - Math.cos(a - half * 1.4) * reach);
        ctx.lineTo(x + Math.sin(a + half * 1.4) * reach, y - Math.cos(a + half * 1.4) * reach);
        ctx.lineTo(x + Math.sin(a + half) * p.s(0.12), y - Math.cos(a + half) * p.s(0.12));
        ctx.closePath();
        ctx.fill();
      }
      p.disc(0.5, 0.5, 0.20, '#ffe600');
      p.disc(0.5, 0.5, 0.155, '#d20000');
    }),
  ],
  MLT: [
    v(WHITE, '#cf142b'),
    // The George Cross in the canton, on its grey ground.
    draw((p) => {
      const { ctx } = p;
      const w = p.s(0.22);
      const x = p.fx(0.05);
      const y = p.fy(0.10);
      ctx.fillStyle = '#efefef';
      ctx.fillRect(x, y, w, w * 1.2);
      ctx.strokeStyle = '#9a9a9a';
      ctx.lineWidth = p.s(0.016);
      ctx.strokeRect(x, y, w, w * 1.2);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(x + w * 0.4, y + w * 0.2, w * 0.2, w * 0.8);
      ctx.fillRect(x + w * 0.15, y + w * 0.45, w * 0.7, w * 0.2);
    }),
  ],
  MNE: [
    fill('#c40308'),
    draw((p) => {
      p.ctx.strokeStyle = '#d4af37';
      p.ctx.lineWidth = p.s(0.075);
      p.ctx.strokeRect(p.fx(0.02) + p.s(0.037), p.fy(0.02) + p.s(0.037), 0.96 * p.w - p.s(0.075), 0.96 * p.h - p.s(0.075));
      doubleEagle(p, 0.5, 0.5, 0.30, '#d4af37');
    }),
  ],
  NLD: [h('#ae1c28', WHITE, '#21468b')],
  NOR: [fill('#ba0c2f'), nordic(WHITE, 0.30), nordic('#00205b', 0.16)],
  POL: [h(WHITE, '#dc143c')],
  PRT: [
    rect(0, 0, 0.4, 1, '#006600'),
    rect(0.4, 0, 0.6, 1, '#ff0000'),
    // The armillary sphere: concentric rings and a band, then the shield.
    draw((p) => {
      const { ctx } = p;
      const x = p.fx(0.4);
      const y = p.fy(0.5);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = p.s(0.030);
      ctx.beginPath();
      ctx.arc(x, y, p.s(0.31), 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, p.s(0.235), 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, p.s(0.11), p.s(0.31), 0, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, p.s(0.31), p.s(0.10), 0, 0, TAU);
      ctx.stroke();
      shield(p, 0.4, 0.5, 0.20, WHITE, '#ff0000');
      for (const [dx, dy] of [[0, -0.09], [0, 0.09], [-0.06, 0], [0.06, 0], [0, 0]]) {
        p.disc(0.4 + (dx! * p.h) / p.w, 0.5 + dy!, 0.028, '#003399');
      }
    }),
  ],
  ROU: [v('#002b7f', '#fcd116', '#ce1126')],
  RUS: [h(WHITE, '#0039a6', '#d52b1e')],
  SMR: [
    h(WHITE, '#5eb6e4'),
    draw((p) => {
      shield(p, 0.5, 0.5, 0.22, '#5eb6e4', '#c8b273');
      for (const dx of [-0.05, 0, 0.05]) {
        p.rect(0.5 + (dx * p.h) / p.w - 0.012, 0.42, 0.024, 0.12, WHITE);
      }
    }),
  ],
  SRB: [
    h('#c6363c', '#0c4076', WHITE),
    draw((p) => doubleEagle(p, 0.35, 0.5, 0.30, '#c6363c')),
  ],
  SVK: [
    h(WHITE, '#0b4ea2', '#ee1c25'),
    draw((p) => {
      shield(p, 0.36, 0.5, 0.26, '#ee1c25', WHITE);
      // The double cross on three hills.
      p.rect(0.36 - 0.012, 0.34, 0.024, 0.30, WHITE);
      p.rect(0.36 - 0.045, 0.40, 0.09, 0.045, WHITE);
      p.rect(0.36 - 0.062, 0.49, 0.124, 0.045, WHITE);
      p.poly([[0.30, 0.68], [0.36, 0.60], [0.42, 0.68]], '#0b4ea2');
    }),
  ],
  SVN: [
    h(WHITE, '#0000c4', '#e03c31'),
    draw((p) => {
      shield(p, 0.30, 0.42, 0.24, '#0000c4', WHITE);
      p.poly([[0.24, 0.52], [0.30, 0.34], [0.36, 0.52]], WHITE);
      p.stars(0.30, 0.26, 0.10, 2, 0.035, '#ffdf00', -1.2, 1.2);
    }),
  ],
  SWE: [fill('#006aa7'), nordic('#fecc00', 0.26)],
  UKR: [h('#0057b7', '#ffd700')],
};
