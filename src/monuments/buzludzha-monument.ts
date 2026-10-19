import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Buzludzha Monument, Bulgaria.
 *
 * A concrete saucer on the summit of a Balkan peak, with a tower of two slabs
 * beside it carrying a red star in glass. What names it, in order: the disc on
 * the mountain top, a flying saucer landed; the tall tower with its star; and
 * the band of windows round the saucer's waist.
 *
 * The saucer is a sixteen-sided drum, its windows a dark band standing proud,
 * under a low weathered roof. The peak is a gentle green cap. Concrete is
 * `bone` toned warm, the roof `slate`, the star `crimson`. Drawn 40 tall for a
 * 70 m tower, unstretched.
 */

const PEAK = 6;
const DRUM = 6.5;

export const buzludzhaMonument: Monument = {
  id: 'buzludzha-monument',
  name: 'Buzludzha Monument',
  iso: 'BGR',
  lat: 42.7356,
  lon: 25.3936,
  realHeight: 70,
  tier: 'building',
  surface: 'concrete',
  footprint: 26,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const concrete = tone(palette.bone, 1.05);

    // 1. The peak.
    const peak = taper(24, 14.5, PEAK, tone(palette.green, 0.9), 9);
    add(peak);

    // 2. The saucer: a plinth, the drum, the window band, the roof.
    const plinth = column(12, 1.2, tone(palette.bone, 0.9), 16);
    plinth.position.y = PEAK;
    add(plinth);
    const drum = taper(11, 13.2, DRUM, concrete, 16);
    drum.position.y = PEAK + 1.2;
    add(drum);
    const band = taper(12.15, 12.95, 1.8, tone(palette.slate, 0.8), 16);
    band.position.y = PEAK + 1.2 + DRUM * 0.5;
    add(band);
    const lip = column(13.6, 0.8, concrete, 16);
    lip.position.y = PEAK + 1.2 + DRUM;
    add(lip);
    const roof = taper(13.2, 6.5, 2.4, palette.slate, 16);
    roof.position.y = PEAK + 2.0 + DRUM;
    add(roof);
    const cap = taper(6.5, 2.0, 1.0, tone(palette.slate, 0.8), 16);
    cap.position.y = PEAK + 4.4 + DRUM;
    add(cap);

    // 3. The entrance: a block on the front with its stair.
    const porch = box(7, 5, 5, concrete);
    porch.position.set(0, PEAK, 12.5);
    add(porch);
    for (let k = 0; k < 3; k++) {
      const step = box(5, 1.4 * (k + 1), 1.2, tone(palette.bone, 0.9));
      step.position.set(0, PEAK - 1.2 - 0.4, 18.2 - k * 1.2);
      add(step);
    }

    // 4. The tower: two slabs bound together behind the saucer, the star near
    //    the top of both faces.
    const towerAt = -12.5;
    for (const side of [-1, 1]) {
      const slab = box(2.6, 40 - PEAK, 4.4, concrete);
      slab.position.set(side * 2.1, PEAK, towerAt);
      add(slab);
    }
    const web = box(1.8, 40 - PEAK - 3, 3.2, tone(palette.bone, 0.85));
    web.position.set(0, PEAK, towerAt);
    add(web);
    for (const face of [1, -1]) {
      for (const turn of [0, Math.PI / 5]) {
        const star = column(1.9, 0.3, palette.crimson, 5);
        const hold = new THREE.Group();
        hold.position.set(0, 34.5, towerAt + face * 2.35);
        hold.rotation.set(face * Math.PI / 2, 0, turn);
        star.position.y = -0.15;
        hold.add(star);
        add(hold);
      }
    }

    return ctx.merge(draft);
  },
};
