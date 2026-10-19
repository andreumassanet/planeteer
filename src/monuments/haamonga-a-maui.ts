import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Ha'amonga 'a Maui, Tongatapu, Tonga.
 *
 * A trilithon of coral limestone raised about 1200 by the eleventh Tu'i
 * Tonga: two uprights some five metres tall and a lintel laid in notches cut
 * into their tops, standing alone in a clearing among coconut palms. What
 * names it, in order: the gate of three stones; the lintel seated into the
 * uprights rather than resting on them; and the palms round it.
 *
 * Stone is `bone` toned warm with `green` moss on the lintel; the palms are
 * struts. Tier `monument`, stretched about 1.6x so the gate stands over a
 * person.
 */

const DEG = Math.PI / 180;

export const haamongaAMaui: Monument = {
  id: 'haamonga-a-maui',
  name: "Ha'amonga 'a Maui",
  iso: 'TON',
  lat: -21.1336,
  lon: -175.0436,
  realHeight: 5,
  tier: 'monument',
  surface: 'stone',
  footprint: 13,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, box, column, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const coral = tone(palette.bone, 1.08);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // The clearing.
    const clearing = column(9.5, 0.2, tone(palette.green, 1.1), 12);
    add(clearing);

    // The uprights, a little battered, with the notch the lintel sits in.
    for (const side of [-1, 1]) {
      const upright = taper(1.45, 1.25, 8.6, coral, 4);
      upright.position.set(side * 3.4, 0.2, 0);
      add(upright);
      const lip = box(1.1, 1.1, 2.4, coral);
      lip.position.set(side * 4.15, 8.8, 0);
      add(lip);
    }
    // The lintel, seated into the tops of both.
    const lintel = box(10.2, 1.3, 1.9, tone(palette.bone, 1.02));
    lintel.position.y = 8.2;
    add(lintel);
    const moss = box(8.0, 0.25, 1.5, tone(palette.green, 0.85));
    moss.position.y = 9.5;
    add(moss);

    // Coconut palms round the clearing.
    const palms: [x: number, z: number, h: number, lean: number][] = [
      [-9, -4, 12.5, 1.5],
      [8.5, -6, 13.5, -1.2],
      [10, 4.5, 11, -1.8],
      [-7.5, 6.5, 10.5, 1.2],
    ];
    palms.forEach(([x, z, h, lean], index) => {
      const top = v(x + lean, h, z + 0.6);
      add(strut(v(x, 0.2, z), top, 0.5, palette.darkOlive));
      for (let k = 0; k < 6; k++) {
        const a = (k * 60 + index * 25) * DEG;
        add(strut(top, v(top.x + Math.cos(a) * 3.2, top.y - 1.3, top.z + Math.sin(a) * 3.2), 0.6, palette.green));
      }
    });

    return ctx.merge(draft);
  },
};
