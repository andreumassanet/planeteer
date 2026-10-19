import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Pha That Luang, Vientiane.
 *
 * The great gilded stupa of Laos: a square cloister, three terraces each ringed
 * with a parapet of small gilded spires, and on top a curved bell rising into
 * a tall, slender four-sided spire. What names it, in order: the gold spire
 * standing out of the gold; the ranks of little spires round the terraces; and
 * the white cloister round it all.
 *
 * Everything above the cloister is `gold`, toned lighter on the terraces'
 * faces and darker on their parapets so the stack still reads in one colour.
 * Drawn 40 tall for 45 m; the cloister is pulled in to keep the footprint.
 */

const DEG = Math.PI / 180;

/** The terraces: [half-width, height]. */
const TERRACES: [half: number, h: number][] = [
  [13, 2.6],
  [9.5, 2.6],
  [7.0, 2.2],
];

export const phaThatLuang: Monument = {
  id: 'pha-that-luang',
  name: 'Pha That Luang',
  iso: 'LAO',
  lat: 17.9762,
  lon: 102.6336,
  realHeight: 45,
  tier: 'building',
  surfaces: { gold: 'metal', clay: 'roof' },
  footprint: 25.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const gold = palette.gold;
    const deep = tone(palette.gold, 0.82);
    const white = palette.white;

    // 1. The cloister: a low white wall round a square, roofed in red tile, a gate on the front.
    const half = 17;
    for (const [w, d, x, z] of [
      [half * 2, 2.4, 0, half],
      [half * 2, 2.4, 0, -half],
      [2.4, half * 2, half, 0],
      [2.4, half * 2, -half, 0],
    ] as const) {
      const wall = box(w, 2.6, d, white);
      wall.position.set(x, 0, z);
      add(wall);
      const roof = box(w + 0.4, 0.8, d + 0.4, palette.clay);
      roof.position.set(x, 2.6, z);
      add(roof);
    }
    const gate = box(5, 5.2, 3.2, white);
    gate.position.set(0, 0, half);
    add(gate);
    const gateRoof = taper(3.4, 0.6, 2.4, palette.clay, 4);
    gateRoof.position.set(0, 5.2, half);
    add(gateRoof);
    const door = box(2.2, 3.2, 0.2, palette.bark);
    door.position.set(0, 0, half + 1.65);
    add(door);
    const court = box(half * 2 - 2.4, 0.3, half * 2 - 2.4, palette.sand);
    add(court);

    // 2. The terraces, each with its ring of little spires.
    let y = 0.3;
    TERRACES.forEach(([h2, h], index) => {
      const terrace = box(h2 * 2, h, h2 * 2, index === 0 ? white : tone(palette.gold, 1.08));
      terrace.position.y = y;
      add(terrace);
      y += h;
      const per = index === 0 ? 7 : 5;
      for (let side = 0; side < 4; side++) {
        for (let k = 0; k < per; k++) {
          const t = -1 + (2 * (k + 0.5)) / per;
          const along = t * (h2 - 0.8);
          const out = h2 - 0.8;
          const pos = [
            [along, out],
            [out, -along],
            [-along, -out],
            [-out, along],
          ][side]!;
          const spire = taper(0.55, 0.05, index === 0 ? 2.8 : 2.2, deep, 4);
          spire.position.set(pos[0]!, y, pos[1]!);
          spire.rotation.y = 45 * DEG;
          add(spire);
        }
      }
    });

    // 3. The stupa: a square bell, the lotus jar, the spire with its rings.
    const bell = taper(5.6, 4.0, 4.0, gold, 4);
    bell.position.y = y;
    add(bell);
    y += 4.0;
    const jarLow = taper(4.0, 4.8, 1.6, deep, 4);
    jarLow.position.y = y;
    add(jarLow);
    y += 1.6;
    const jarHigh = taper(4.8, 2.2, 3.0, gold, 4);
    jarHigh.position.y = y;
    add(jarHigh);
    y += 3.0;
    const spire = taper(2.2, 0.25, 39.4 - y, gold, 4);
    spire.position.y = y;
    add(spire);
    for (const t of [0.12, 0.3, 0.5]) {
      const r = 2.2 + (0.25 - 2.2) * t;
      const ring = column(r + 0.25, 0.5, deep, 4);
      ring.position.y = y + (39.4 - y) * t;
      add(ring);
    }

    return ctx.merge(draft);
  },
};
