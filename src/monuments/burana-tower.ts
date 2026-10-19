import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Burana Tower, Chuy Valley, Kyrgyzstan.
 *
 * The stump of an eleventh-century minaret of the Karakhanid city of
 * Balasagun, 24 m of patterned brick left of about 45 after an earthquake,
 * standing alone on a grassy mound with the Tian Shan behind and a field of
 * balbals, carved stone grave figures, in front of it. What names it, in
 * order: the tapering round brick shaft cut off flat; its bands of patterned
 * brick; the iron stair climbing to the door halfway up; and the stone figures
 * standing in rows.
 *
 * Brick is `clay` toned towards `tan`, the bands `sand`, the stair `steel`,
 * the balbals `slate`. Drawn about 1:1 with the tier's units.
 */

const BASE = 4.6;
const SHAFT = 21;

export const buranaTower: Monument = {
  id: 'burana-tower',
  name: 'Burana Tower',
  iso: 'KGZ',
  lat: 42.7466,
  lon: 75.2499,
  realHeight: 24,
  tier: 'building',
  surface: 'brick',
  footprint: 13.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, box, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const brick = tone(palette.clay, 1.08);
    const pattern = palette.sand;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // 1. The mound and the octagonal plinth.
    const mound = taper(12.8, 8.0, 1.8, tone(palette.green, 0.95), 10);
    add(mound);
    const plinth = taper(6.4, 5.8, BASE - 1.8, tone(palette.clay, 0.92), 8);
    plinth.position.y = 1.8;
    add(plinth);

    // 2. The shaft, tapering, with patterned bands, cut off flat.
    const r0 = 4.4;
    const r1 = 3.3;
    const shaft = taper(r0, r1, SHAFT, brick, 14);
    shaft.position.y = BASE;
    add(shaft);
    for (const t of [0.12, 0.34, 0.58, 0.8, 0.93]) {
      const r = r0 + (r1 - r0) * t;
      const band = column(r + 0.1, t === 0.93 ? 0.8 : 1.1, pattern, 14);
      band.position.y = BASE + SHAFT * t;
      add(band);
    }
    // The broken crown: a few teeth of brick on the rim.
    for (const [a, h] of [[0.3, 1.0], [1.5, 0.6], [2.6, 1.3], [4.0, 0.8], [5.2, 1.1]] as const) {
      const tooth = box(1.6, h, 0.9, brick);
      tooth.position.set(Math.sin(a) * (r1 - 0.5), BASE + SHAFT, Math.cos(a) * (r1 - 0.5));
      tooth.rotation.y = a;
      add(tooth);
    }

    // 3. The door halfway up and the iron stair to it.
    const doorY = BASE + 8.5;
    const door = box(1.4, 2.2, 0.3, palette.bark);
    door.position.set(0, doorY, r0 - (r0 - r1) * (8.5 / SHAFT) + 0.05);
    add(door);
    const landing = box(2.6, 0.3, 2.0, palette.steel);
    landing.position.set(0, doorY - 0.3, 4.9);
    add(landing);
    // A flight of treads on two stringers, so it reads as a stair and not a pole.
    const foot = v(5.8, BASE - 0.4, 10.5);
    const head = v(1.2, doorY - 0.4, 5.4);
    const across = v(head.z - foot.z, 0, foot.x - head.x).normalize().multiplyScalar(0.75);
    for (const side of [-1, 1]) {
      add(strut(foot.clone().addScaledVector(across, side), head.clone().addScaledVector(across, side), 0.25, palette.steel));
    }
    const treads = 14;
    for (let i = 1; i < treads; i++) {
      const at = foot.clone().lerp(head, i / treads);
      const tread = box(1.6, 0.18, 0.7, palette.steel);
      tread.position.set(at.x, at.y, at.z);
      tread.rotation.y = Math.atan2(head.x - foot.x, head.z - foot.z);
      add(tread);
    }
    for (const side of [-1, 1]) {
      const leg = column(0.2, doorY - 0.3, palette.steel, 4);
      leg.position.set(side * 1.1, 0, 5.6);
      add(leg);
    }

    // 4. The balbals: stone figures in two rows in front.
    for (let k = 0; k < 7; k++) {
      const x = -7.5 + k * 2.5;
      const z = 9.6 + (k % 2) * 1.4;
      const stone = taper(0.55, 0.45, 1.8, tone(palette.slate, 1.1), 4);
      stone.position.set(x, 0.6, z);
      add(stone);
      const head = box(0.7, 0.6, 0.6, tone(palette.slate, 1.0));
      head.position.set(x, 2.4, z);
      add(head);
    }

    return ctx.merge(draft);
  },
};
