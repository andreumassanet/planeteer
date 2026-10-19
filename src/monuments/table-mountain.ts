import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Table Mountain, Cape Town.
 *
 * A long, dead-level wall of grey sandstone over the city, with Devil's Peak
 * pointed at its eastern end and the rounded dome of Lion's Head standing
 * apart to the west; on a south-easter the tablecloth of cloud pours over its
 * lip. What names it, in order: the level top, three times as long as it is
 * tall; the sheer fluted cliff under it; the two flanking peaks, one sharp and
 * one round; the white cloud along the top; and the cable car.
 *
 * The table is a four-sided frustum stretched along x by a parent with no
 * rotation, nearly vertical, on foothills of fynbos; buttresses stand proud of
 * its face and Platteklip Gorge is a dark cleft. +Z is north, the city side;
 * -X is east, so Devil's Peak is on the left of the front view and Lion's Head
 * on the right, as from the city. Drawn 43 tall for 1,085 m, a vertical stretch
 * of about 2.3x; the foothills carry the cliff's lower third, as in life.
 */

const FOOT = 15;
const TOP = 39;
/** Half-length and half-depth of the table's cliff at its foot. */
const HALF_X = 35;
const HALF_Z = 8.5;
const BATTER = 0.95;

export const tableMountain: Monument = {
  id: 'table-mountain',
  name: 'Table Mountain',
  iso: 'ZAF',
  lat: -33.957,
  lon: 18.403,
  realHeight: 1085,
  tier: 'landmark',
  surface: 'none',
  footprint: 55,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, box, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const stone = tone(palette.slate, 1.22);
    const fynbos = tone(palette.green, 0.82);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    /** A four-sided frustum stretched to a rectangle. */
    const slab = (x: number, y: number, z: number, hx: number, hz: number, h: number, ratio: number, color: number): void => {
      const stretch = new THREE.Group();
      stretch.position.set(x, y, z);
      stretch.scale.set(hx, 1, hz);
      stretch.add(taper(1, ratio, h, color, 4));
      add(stretch);
    };

    // 1. The foothills, and the table's cliff on them.
    slab(0, 0, 2, 48, 19, FOOT, 0.6, fynbos);
    slab(0, FOOT, 0, HALF_X, HALF_Z, TOP - FOOT, BATTER, stone);

    // The flat top, overhanging the cliff so the lip is one ink line.
    const cap = box(HALF_X * 2 * BATTER + 1.4, 1.4, HALF_Z * 2 * BATTER + 1.4, tone(palette.slate, 1.05));
    cap.position.y = TOP;
    add(cap);

    // 2. The face: buttresses proud of it, and the gorge.
    const faceAt = (y: number): number => HALF_Z * (1 - ((1 - BATTER) * (y - FOOT)) / (TOP - FOOT));
    const buttresses: [x: number, w: number, top: number][] = [
      [-27, 4.5, 34], [-17, 6, 37], [-6, 5, 35], [9, 6.5, 37], [20, 5, 33], [29, 4, 30],
    ];
    for (const [x, w, top] of buttresses) {
      const face = box(w, top - FOOT + 1, 1.0, tone(palette.slate, 1.32));
      face.position.set(x, FOOT - 1, faceAt((FOOT + top) / 2) + 0.2);
      add(face);
    }
    add(strut(v(-11.5, FOOT + 2, faceAt(FOOT + 2) + 0.5), v(-11.5, TOP - 1, faceAt(TOP - 1) + 0.5), 2.0, tone(palette.slate, 0.8)));

    // 3. The tablecloth: cloud lying along the top and spilling over the front lip.
    const cloud = palette.white;
    for (const [x, w] of [[-14, 22], [8, 18], [24, 10]] as const) {
      const bank = box(w, 2.0, HALF_Z * 1.6, cloud);
      bank.position.set(x, TOP + 1.4, -1);
      add(bank);
      const spill = box(w * 0.8, 4.5, 1.2, cloud);
      spill.position.set(x, TOP - 3.4, faceAt(TOP - 3) + 0.9);
      add(spill);
    }

    // 4. Devil's Peak to the east (-X): fynbos to the saddle, then rock to a point.
    slab(-39, 0, -2, 11, 10, 17, 0.68, fynbos);
    const devil = taper(7.4, 0.5, 18, stone, 4);
    devil.position.set(-39, 17, -2);
    devil.rotation.y = Math.PI / 4;
    add(devil);

    // Lion's Head to the west (+X): a green cone under a rounded rock dome.
    const lion = taper(10.5, 6.2, 15, fynbos, 8);
    lion.position.set(42, 0, 5);
    add(lion);
    const dome = taper(6.2, 3.0, 8, stone, 8);
    dome.position.set(42, 15, 5);
    add(dome);
    const crown = taper(3.0, 0.4, 2.4, stone, 8);
    crown.position.set(42, 23, 5);
    add(crown);

    // 5. The cable car: its cable from the lower station to the top, and a red car on it.
    const lower = v(13, FOOT - 0.2, 12.5);
    const upper = v(15, TOP + 0.6, faceAt(TOP) - 1);
    const station = box(3, 2, 2.4, palette.white);
    station.position.copy(lower);
    add(station);
    add(strut(v(lower.x, lower.y + 2, lower.z), upper, 0.18, palette.steel));
    const car = box(1.6, 1.6, 1.6, palette.red);
    car.position.copy(v(lower.x, lower.y + 2, lower.z).lerp(upper, 0.62));
    car.position.y -= 1.8;
    add(car);

    return ctx.merge(draft);
  },
};
