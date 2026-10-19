import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Kenyatta International Convention Centre, Nairobi.
 *
 * A cylindrical tower of terracotta-red fins, twenty-eight storeys with a
 * helipad crown, beside a conical amphitheatre roofed like a traditional hut.
 * What names it, in order: the round red tower with its vertical ribs; the
 * flared crown and the disc of the helipad on top; and the cone of the
 * amphitheatre at its foot.
 *
 * The fins are boxes `around` the shaft, `clay` against a darker `brown`
 * core, so the ribs draw the ink lines. Drawn 70 tall for 105 m.
 */

const TOWER = 54;

export const kenyattaCentre: Monument = {
  id: 'kenyatta-centre',
  name: 'Kenyatta International Convention Centre',
  iso: 'KEN',
  lat: -1.2889,
  lon: 36.8233,
  realHeight: 105,
  tier: 'tower',
  surface: 'concrete',
  footprint: 21,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box, around } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const terracotta = palette.clay;
    const core = tone(palette.brown, 0.7);

    // 1. The podium.
    const podium = box(26, 3, 18, tone(palette.sand, 0.95));
    podium.position.z = -1;
    add(podium);

    // 2. The tower: a dark core and twenty fins round it.
    const shaft = column(5.4, TOWER, core, 16);
    shaft.position.set(6, 3, 0);
    add(shaft);
    const fins = around(20, () => {
      const fin = box(0.9, TOWER - 1, 1.3, terracotta);
      fin.position.set(0, 0, 5.6);
      return fin;
    });
    fins.position.set(6, 3, 0);
    add(fins);
    // Bands at the base and under the crown.
    for (const y of [3, TOWER + 2]) {
      const band = column(6.4, 1.0, terracotta, 16);
      band.position.set(6, y, 0);
      add(band);
    }

    // 3. The crown: a flared drum, the rotating restaurant, the helipad.
    const flare = taper(5.6, 7.6, 3.6, terracotta, 16);
    flare.position.set(6, TOWER + 3, 0);
    add(flare);
    const glazing = column(7.0, 1.6, tone(palette.slate, 0.9), 16);
    glazing.position.set(6, TOWER + 6.6, 0);
    add(glazing);
    const pad = column(8.0, 0.8, tone(palette.bone, 1.05), 16);
    pad.position.set(6, TOWER + 8.2, 0);
    add(pad);
    const mark = box(3.2, 0.2, 0.6, palette.white);
    mark.position.set(6, TOWER + 9.0, 0);
    add(mark);

    // 4. The amphitheatre: a drum under a steep cone, like a hut's roof.
    const hall = column(7.0, 4.5, tone(palette.sand, 1.05), 12);
    hall.position.set(-7.5, 3, 0);
    add(hall);
    const roof = taper(8.2, 0.6, 9, terracotta, 12);
    roof.position.set(-7.5, 7.5, 0);
    add(roof);
    const tip = column(0.6, 1.6, core, 6);
    tip.position.set(-7.5, 16.5, 0);
    add(tip);

    return ctx.merge(draft);
  },
};
