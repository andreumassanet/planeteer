import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Stari Most, Mostar.
 *
 * One pale stone arch, 29 m across and 21 m over the Neretva, springing from
 * rock on both banks with a fortified tower at each end. What names it, in
 * order: the single high hump, thin as a ribbon, with its pointed crown; the
 * river deep under it; and the two towers, Halebija square and Tara
 * round, that hold its ends.
 *
 * The arch is fourteen voussoir blocks round a circle of radius 14 whose
 * centre sits just over the water, so it springs almost vertical and comes to
 * a crown 13 above its springing; the walkway is a hump over it, filled in
 * between. The stone is `tan` lifted towards white, the roofs `slate` stone
 * slabs. Drawn at about 0.45 units a metre, unstretched.
 */

const DEG = Math.PI / 180;

/** The arch: half-span, springing height, radius and centre of its circle. */
const HALF = 13.5;
const SPRING = 2.0;
const RISE = 13.2;
const R = (HALF * HALF + RISE * RISE) / (2 * RISE);
const CY = SPRING + RISE - R;
const RING = 1.6;
const WIDTH = 4.4;

/** The walkway's height along the span: a hump over the crown. */
const deckAt = (x: number): number => SPRING + RISE + RING + 0.6 - 0.011 * x * x;

export const stariMost: Monument = {
  id: 'stari-most',
  name: 'Stari Most',
  iso: 'BIH',
  lat: 43.3373,
  lon: 17.815,
  realHeight: 24,
  tier: 'building',
  surfaces: { slate: 'roof', skyBlue: 'none' },
  footprint: 27.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const stone = tone(palette.tan, 1.32);
    const rock = tone(palette.tan, 0.95);
    const roof = palette.slate;

    /** A block centred on a point, turned about z. */
    const block = (cx: number, cy: number, length: number, thick: number, depth: number, angle: number, color: number): void => {
      const turn = new THREE.Group();
      turn.position.set(cx, cy, 0);
      turn.rotation.z = angle;
      const piece = box(length, thick, depth, color);
      piece.position.y = -thick / 2;
      turn.add(piece);
      add(turn);
    };

    // 1. The river under the arch.
    const river = box(HALF * 2 + 2, 0.6, 26, tone(palette.skyBlue, 0.62));
    add(river);

    // 2. The banks: rock up to the street on both sides.
    for (const side of [-1, 1]) {
      // The bank is a stretched frustum, so its faces fall as cliffs.
      const stretch = new THREE.Group();
      stretch.position.set(side * (HALF + 5.4), 0, 0);
      stretch.scale.set(6.0, 1, 11.5);
      stretch.add(taper(1, 0.8, deckAt(HALF) - 1.2, rock, 4));
      add(stretch);
      for (const [dz, r] of [[7, 2.2], [-3, 1.8], [10.5, 1.6]] as const) {
        const bush = taper(r, r * 0.4, r * 1.3, tone(palette.green, 0.8), 6);
        bush.position.set(side * (HALF + 1.5), 3.0, dz);
        add(bush);
      }
      const ledge = box(6, 3.0, 20, tone(palette.tan, 0.85));
      ledge.position.set(side * (HALF + 0.8), 0, 1);
      add(ledge);
    }

    // 3. The arch: fourteen voussoirs round the circle.
    const reach = Math.asin(HALF / R);
    const count = 14;
    for (let k = 0; k < count; k++) {
      const a = -reach + ((k + 0.5) / count) * 2 * reach;
      const length = (2 * reach * (R + RING / 2)) / count + 0.15;
      const mid = R + RING / 2;
      block(mid * Math.sin(a), CY + mid * Math.cos(a) + RING / 2, length, RING, WIDTH, -a, stone);
    }

    // 4. The spandrels and the walkway: filled from the arch to the hump, with
    //    a parapet each side.
    const pieces = 10;
    for (let k = 0; k < pieces; k++) {
      const x0 = -HALF + (k / pieces) * 2 * HALF;
      const x1 = -HALF + ((k + 1) / pieces) * 2 * HALF;
      const xm = (x0 + x1) / 2;
      const archTop = CY + Math.sqrt(Math.max(0, (R + RING) ** 2 - xm * xm));
      const top = deckAt(xm);
      if (top - archTop > 0.3) {
        const fill = box(x1 - x0 + 0.1, top - archTop + 0.4, WIDTH - 0.3, tone(palette.tan, 1.2));
        fill.position.set(xm, archTop - 0.4, 0);
        add(fill);
      }
      const angle = Math.atan2(deckAt(x1) - deckAt(x0), x1 - x0);
      for (const side of [-1, 1]) {
        const turn = new THREE.Group();
        turn.position.set(xm, top, side * (WIDTH / 2 - 0.25));
        turn.rotation.z = angle;
        const wall = box(x1 - x0 + 0.12, 1.0, 0.5, stone);
        turn.add(wall);
        add(turn);
      }
    }

    // 5. The towers: Halebija square on the west bank, Tara round on the east.
    const bankTop = deckAt(HALF) - 1.2;
    const halebija = box(5, 9, 5, stone);
    halebija.position.set(-HALF - 4.5, bankTop, -4);
    add(halebija);
    const hipped = taper(3.4, 0.2, 3.4, roof, 4);
    hipped.position.set(-HALF - 4.5, bankTop + 9, -4);
    add(hipped);
    const tara = column(3.2, 8, stone, 12);
    tara.position.set(HALF + 4.8, bankTop, -4.5);
    add(tara);
    const cone = taper(3.5, 0.2, 3.4, roof, 12);
    cone.position.set(HALF + 4.8, bankTop + 8, -4.5);
    add(cone);

    // 6. Stone houses on the banks, roofed in stone slabs.
    const houses: [x: number, z: number, w: number, h: number][] = [
      [-HALF - 4, 5, 5, 4.2],
      [-HALF - 6.5, 9.5, 4, 3.6],
      [HALF + 4.5, 5.5, 5, 4.6],
      [HALF + 6.5, -10, 4.5, 3.8],
      [-HALF - 6, -10.5, 4.5, 4],
    ];
    for (const [x, z, w, h] of houses) {
      const house = box(w, h, w * 0.9, tone(palette.cream, 0.94));
      house.position.set(x, bankTop, z);
      add(house);
      const top = taper(w * 0.62, 0.2, 2.2, roof, 4);
      top.position.set(x, bankTop + h, z);
      add(top);
      const window = box(0.8, 1.0, 0.2, tone(palette.bark, 1.1));
      window.position.set(x, bankTop + h * 0.45, z + w * 0.45 + 0.05);
      add(window);
    }
    void DEG;

    return ctx.merge(draft);
  },
};
