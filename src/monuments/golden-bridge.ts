import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Golden Bridge, Bà Nà Hills, Vietnam.
 *
 * A gilded footbridge looping along a mountainside 1,400 m up, held out over
 * the drop by two giant hands of mossy stone. What names it, in order: the two
 * hands rising out of the slope, fingers open under the deck; the gold ribbon
 * of the bridge curving across them; and the forest of the hillside behind.
 *
 * The deck is twelve gold segments round an arc; the hands are struts and
 * blocks in `slate` toned towards moss, with `green` on the knuckles. Drawn
 * with the hands about four times their 150 m bridge's proportion so they read
 * as hands.
 */

const DEG = Math.PI / 180;

/** The arc of the deck: centre, radius, sweep, height. */
const CENTRE_Z = -3;
const RADIUS = 18;
const SWEEP = 70;
const DECK = 17;

export const goldenBridge: Monument = {
  id: 'golden-bridge',
  name: 'Golden Bridge',
  iso: 'VNM',
  lat: 15.9952,
  lon: 107.9965,
  tier: 'building',
  surface: 'none',
  surfaces: { gold: 'metal' },
  footprint: 26,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, box, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const stone = tone(palette.slate, 1.05);
    const moss = tone(palette.green, 0.78);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const onArc = (deg: number, r: number, y: number) =>
      v(Math.sin(deg * DEG) * r, y, CENTRE_Z + Math.cos(deg * DEG) * r);

    // 1. The mountainside behind, and its forest.
    const slope = new THREE.Group();
    slope.position.set(0, 0, -10);
    slope.scale.set(19, 1, 7);
    slope.add(taper(1, 0.5, 24, tone(palette.green, 0.88), 4));
    add(slope);
    for (const [x, z, r] of [[-14, -2, 3], [-5, -5, 3.4], [6, -4, 3], [14, -1, 3.2], [-20, 4, 2.6], [20, 5, 2.8]] as const) {
      const crown = taper(r, r * 0.5, r * 1.6, tone(palette.green, 0.66), 7);
      crown.position.set(x, 3, z);
      add(crown);
      const trunk = taper(0.4, 0.3, 3, palette.bark, 5);
      trunk.position.set(x, 0, z);
      add(trunk);
    }

    // 2. The deck: gold segments round the arc, a rail along each edge.
    const segments = 12;
    for (let k = 0; k < segments; k++) {
      const a0 = -SWEEP + (2 * SWEEP * k) / segments;
      const a1 = -SWEEP + (2 * SWEEP * (k + 1)) / segments;
      const mid = (a0 + a1) / 2;
      const length = (2 * Math.PI * RADIUS * (a1 - a0)) / 360 + 0.2;
      const turn = new THREE.Group();
      turn.position.copy(onArc(mid, RADIUS, DECK));
      turn.rotation.y = mid * DEG;
      const plank = box(length, 0.8, 3.0, palette.gold);
      turn.add(plank);
      for (const side of [-1, 1]) {
        const rail = box(length, 1.1, 0.25, tone(palette.gold, 0.85));
        rail.position.set(0, 0.8, side * 1.4);
        turn.add(rail);
      }
      add(turn);
    }

    // 3. The two hands, rising out of the slope under the deck.
    for (const side of [-1, 1]) {
      const at = side * 26;
      const wrist = onArc(at, RADIUS, 9);
      const elbow = onArc(at, RADIUS - 3, 2.4);
      add(strut(elbow, wrist, 4.6, stone));
      // The palm, turned to face up under the deck.
      const palm = new THREE.Group();
      palm.position.copy(wrist);
      palm.rotation.y = at * DEG;
      const block = box(6.4, 3.6, 3.0, stone);
      palm.add(block);
      const knuckles = box(6.6, 0.9, 3.2, moss);
      knuckles.position.y = 3.6;
      palm.add(knuckles);
      // Four fingers curling up round the outside of the deck, and a thumb inside.
      for (let f = 0; f < 4; f++) {
        const x = -2.4 + f * 1.6;
        const base = v(x, 4.0, 0.9);
        const knuckle = v(x, 7.4, 2.9);
        const tip = v(x, 9.6, 2.2);
        palm.add(strut(base, knuckle, 1.3, stone));
        palm.add(strut(knuckle, tip, 1.1, stone));
      }
      palm.add(strut(v(3.0, 3.4, -1.0), v(3.6, 8.8, -2.8), 1.3, stone));
      add(palm);
    }

    return ctx.merge(draft);
  },
};
