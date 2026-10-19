import type { Group, Monument, MonumentContext } from './contract.ts';

/**
 * Maqam Echahid, the Martyrs' Memorial, Algiers.
 *
 * Three concrete palm leaves, each 92 m tall, rising from a common base and
 * leaning in towards one another, sheltering an eternal flame under a turban
 * shaped dome held between them; at the foot of each leaf a bronze soldier.
 * What names it, in order: the three tall curved fins converging; the dome
 * held high between them; and the soldiers at the foot.
 *
 * Each leaf is a chain of flat blades, thick at the base and narrowing to a
 * point, bending inwards as it climbs; concrete is `bone` toned warm, the
 * dome `cream`, the soldiers `bark`. Drawn 70 tall for 92 m.
 */

const DEG = Math.PI / 180;

/** The leaf's centre line: [height, distance out from the axis, half-width]. */
const LEAF: [y: number, out: number, half: number][] = [
  [2.4, 9.0, 4.0],
  [16, 8.6, 4.4],
  [30, 7.4, 4.0],
  [44, 5.6, 3.2],
  [55, 3.8, 2.2],
  [63.5, 2.3, 1.2],
  [69.5, 1.3, 0.4],
];
const THICK = 1.5;

export const maqamEchahid: Monument = {
  id: 'maqam-echahid',
  name: 'Maqam Echahid',
  iso: 'DZA',
  lat: 36.7456,
  lon: 3.0697,
  realHeight: 92,
  tier: 'tower',
  surface: 'concrete',
  footprint: 16.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box } = ctx;
    const draft = new THREE.Group();
    const concrete = tone(palette.bone, 1.08);

    // The esplanade and the base.
    const deck = column(15.5, 0.8, palette.sand, 12);
    draft.add(deck);
    const base = taper(11.6, 10.4, 1.6, tone(palette.bone, 0.95), 6);
    base.position.y = 0.8;
    draft.add(base);

    // Three leaves, a third of a turn apart, each built facing +Z in its own frame.
    for (let k = 0; k < 3; k++) {
      const frame = new THREE.Group();
      frame.rotation.y = (k * 120 + 60) * DEG;
      for (let i = 1; i < LEAF.length; i++) {
        const [ya, oa, ha] = LEAF[i - 1]!;
        const [yb, ob, hb] = LEAF[i]!;
        // One blade a step: a flat frustum tilted to follow the bend.
        const lean = Math.atan2(ob - oa, yb - ya);
        const blade = new THREE.Group();
        blade.position.set(0, ya, oa);
        blade.rotation.x = lean;
        const flat = new THREE.Group();
        flat.scale.set(1, 1, THICK / Math.max(ha, hb));
        const length = Math.hypot(yb - ya, ob - oa);
        flat.add(taper(ha, hb, length + 0.3, concrete, 4));
        blade.add(flat);
        frame.add(blade);
      }
      // The soldier at the leaf's foot, facing out.
      const plinth = box(2.0, 1.4, 2.0, tone(palette.bone, 0.9));
      plinth.position.set(0, 0.8, 12.6);
      frame.add(plinth);
      const body = taper(0.75, 0.6, 3.0, palette.bark, 5);
      body.position.set(0, 2.2, 12.6);
      frame.add(body);
      const head = box(0.6, 0.7, 0.6, palette.bark);
      head.position.set(0, 5.2, 12.6);
      frame.add(head);
      draft.add(frame);
    }

    // The dome between the leaves, high up, and the drum it sits on.
    const under = taper(1.0, 4.2, 2.6, tone(palette.bone, 0.85), 10);
    under.position.y = 37;
    draft.add(under);
    const drum = column(4.2, 2.4, concrete, 10);
    drum.position.y = 39.6;
    draft.add(drum);
    const dome = taper(4.8, 1.4, 3.6, palette.cream, 10);
    dome.position.y = 42;
    draft.add(dome);
    const cap = taper(1.4, 0.1, 1.8, palette.cream, 10);
    cap.position.y = 45.6;
    draft.add(cap);
    // The flame under it, at the foot.
    const flame = taper(0.8, 0.1, 2.4, palette.orange, 5);
    flame.position.y = 2.4;
    draft.add(flame);

    return ctx.merge(draft);
  },
};
