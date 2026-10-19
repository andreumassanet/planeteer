import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Motherland Monument, Kyiv.
 *
 * A stainless-steel woman 62 m tall on the roof of a museum on the bluff over
 * the Dnieper, a sword raised straight up in her right hand and a shield held
 * out in her left. What names it, in order: the sword, the tallest thing for
 * kilometres and the top of the model; the shield out to the side, the one
 * broad shape in the silhouette; and the long straight dress she stands in, a
 * column rather than a figure from below.
 *
 * Steel is `bone` lit and `slate` in shade, as a material split; the museum
 * is `cream` with dark slits of window. Drawn 70 tall for 102 m, the statue
 * a little longer in the dress than life so the sword clears the tier.
 */

const MUSEUM_TOP = 15;
const HEM = MUSEUM_TOP + 0.6;
const WAIST = 33;
const SHOULDER = 40.5;

export const motherlandMonument: Monument = {
  id: 'motherland-monument',
  name: 'Motherland Monument',
  iso: 'UKR',
  lat: 50.4266,
  lon: 30.5631,
  realHeight: 102,
  tier: 'tower',
  surface: 'metal',
  surfaces: { cream: 'concrete', tan: 'stone' },
  footprint: 20,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const steel = palette.bone;
    const shade = tone(palette.slate, 1.15);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // 1. The bluff's terrace and the museum: a stepped drum with window slits.
    const terrace = taper(14, 12.6, 2.4, palette.tan, 4);
    add(terrace);
    const museum = taper(9.6, 7.6, MUSEUM_TOP - 2.4, palette.cream, 12);
    museum.position.y = 2.4;
    add(museum);
    for (let k = 0; k < 12; k++) {
      const a = ((k + 0.5) / 12) * Math.PI * 2;
      const slit = box(0.9, 7.5, 0.3, tone(palette.slate, 0.85));
      const pivot = new THREE.Group();
      pivot.rotation.y = a;
      slit.position.set(0, 4.6, 9.0);
      slit.rotation.x = -0.15;
      pivot.add(slit);
      add(pivot);
    }
    const roof = column(7.9, 0.6, palette.cream, 12);
    roof.position.y = MUSEUM_TOP;
    add(roof);

    // 2. The dress, flaring to the hem, and the bodice.
    const skirt = taper(4.9, 2.7, WAIST - HEM, steel, 10);
    skirt.position.y = HEM;
    add(skirt);
    const bodice = taper(2.7, 3.3, SHOULDER - WAIST, steel, 8);
    bodice.position.y = WAIST;
    add(bodice);
    const neck = column(0.75, 1.3, shade, 6);
    neck.position.y = SHOULDER;
    add(neck);
    const head = box(2.1, 2.7, 2.3, steel);
    head.position.y = SHOULDER + 1.2;
    add(head);
    const hair = box(2.3, 1.1, 1.5, shade);
    hair.position.set(0, SHOULDER + 2.2, -1.0);
    add(hair);

    // 3. The sword arm, straight up, and the sword.
    const hand = v(3.9, 51.5, 0.4);
    add(strut(v(2.8, SHOULDER - 0.3, 0), v(3.5, 46, 0.2), 1.8, steel));
    add(strut(v(3.5, 45.6, 0.2), hand, 1.5, steel));
    const guard = box(3.0, 0.6, 0.8, shade);
    guard.position.set(hand.x, hand.y + 0.6, hand.z);
    add(guard);
    add(strut(v(hand.x, hand.y + 1.0, hand.z), v(4.3, 69.6, 0.6), 1.0, steel));

    // 4. The shield arm, out to the side, and the shield.
    add(strut(v(-2.8, SHOULDER - 0.3, 0), v(-5.2, 38.0, 1.4), 1.7, steel));
    const shield = new THREE.Group();
    shield.position.set(-6.0, 38.0, 1.8);
    shield.rotation.set(0, -0.5, Math.PI / 2);
    const disc = column(5.0, 0.8, steel, 12);
    disc.position.y = -0.4;
    shield.add(disc);
    const boss = column(1.6, 0.3, shade, 10);
    boss.position.y = 0.4;
    shield.add(boss);
    add(shield);

    return ctx.merge(draft);
  },
};
