import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Faisal Mosque, Islamabad.
 *
 * A mosque with no dome: the prayer hall is a tent of eight concrete shells
 * folded into a four-sided pyramid, and four pencil minarets stand far out at
 * the corners of its court, at the foot of the Margalla Hills. What names it,
 * in order: the white folded tent; the four needle minarets, each a slim shaft
 * with one balcony and a long pointed cap; and the gold crescent on the apex.
 *
 * The tent is a square pyramid turned 45 degrees, so a ridge rather than a
 * face meets the eye, with a fold laid down the middle of each face (a dark
 * strut) so the four faces read as eight shells. The hall under the tent is
 * a band of glazing in `slate` tone. Minarets 88 m drawn at 38; the tent is
 * stretched about 1.4x in height so it stands up between them.
 */

/** Where the minarets stand: corners of a square of this half-width. */
const COURT = 17.5;
const MINARET = 37.5;

export const faisalMosque: Monument = {
  id: 'faisal-mosque',
  name: 'Faisal Mosque',
  iso: 'PAK',
  lat: 33.7295,
  lon: 73.0372,
  realHeight: 90,
  tier: 'building',
  surface: 'concrete',
  footprint: 28,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const marble = palette.white;

    // The court: a white platform the whole complex stands on.
    const court = box(COURT * 2 + 4, 1.2, COURT * 2 + 4, tone(palette.cream, 0.95));
    add(court);

    // The hall: a glazed band under the tent.
    const hall = box(17, 3.2, 17, tone(palette.slate, 0.9));
    hall.position.y = 1.2;
    hall.rotation.y = Math.PI / 4;
    add(hall);

    // The tent: a four-sided pyramid turned so a ridge faces front, rising from
    // a little out past the hall so its eaves overhang.
    // Two courses: a flared skirt and a steep tent over it, so each face is
    // concave as the shells are.
    const tentFoot = 4.4;
    const skirtTop = 9.6;
    const tentTop = 32;
    const skirt = taper(15.5, 10.6, skirtTop - tentFoot, marble, 4);
    skirt.position.y = tentFoot;
    skirt.rotation.y = Math.PI / 4;
    add(skirt);
    const tent = taper(10.6, 0.4, tentTop - skirtTop, marble, 4);
    tent.position.y = skirtTop;
    tent.rotation.y = Math.PI / 4;
    add(tent);

    // The folds down the middle of each face: four valleys, eight shells.
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      // A face's middle runs from the eave's midpoint to the apex; the apothem
      // after the 45-degree turn is along the diagonal directions.
      const fold = tone(palette.slate, 1.1);
      const eave = v(Math.sin(a) * 15.65, tentFoot, Math.cos(a) * 15.65);
      const knee = v(Math.sin(a) * 10.75, skirtTop, Math.cos(a) * 10.75);
      const apex = v(Math.sin(a) * 0.6, tentTop - 0.4, Math.cos(a) * 0.6);
      add(strut(eave, knee, 1.0, fold));
      add(strut(knee, apex, 1.0, fold));
    }

    // The finial and the crescent.
    const finial = column(0.35, 3.0, palette.gold, 6);
    finial.position.y = tentTop - 0.4;
    add(finial);
    const crescent = box(1.6, 1.6, 0.3, palette.gold);
    crescent.position.y = tentTop + 2.6;
    crescent.rotation.z = Math.PI / 4;
    add(crescent);

    // The four minarets: a plinth, a slim shaft, a balcony, a long pointed cap.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * COURT;
        const z = sz * COURT;
        const plinth = taper(1.9, 1.5, 2.6, marble, 8);
        plinth.position.set(x, 1.2, z);
        add(plinth);
        const shaft = taper(1.15, 0.95, MINARET * 0.72, marble, 8);
        shaft.position.set(x, 3.8, z);
        add(shaft);
        const balcony = taper(1.0, 1.6, 1.2, marble, 8);
        balcony.position.set(x, 3.8 + MINARET * 0.72, z);
        add(balcony);
        const neck = column(0.9, 2.0, tone(palette.slate, 1.1), 8);
        neck.position.set(x, 5.0 + MINARET * 0.72, z);
        add(neck);
        const cap = taper(1.1, 0.06, MINARET - 7.0 - MINARET * 0.72, marble, 8);
        cap.position.set(x, 7.0 + MINARET * 0.72, z);
        add(cap);
      }
    }

    return ctx.merge(draft);
  },
};
