import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Angel Falls, Salto Ángel, Canaima, Venezuela.
 *
 * The highest waterfall on Earth, 979 m, dropping off the rim of Auyán-tepui:
 * a table mountain of red sandstone with sheer walls and a flat, forested top
 * standing over the jungle. What names it, in order: the thread of white water
 * falling the whole height of a red wall and turning to mist before it lands;
 * the tepui itself, sheer-sided and flat-topped, a block of rock rather than a
 * peak; and the jungle and river at its foot.
 *
 * The tepui is a seven-sided frustum stretched along x by a parent, nearly
 * vertical, in two courses turned against each other so the wall breaks into
 * buttresses, on a talus slope under forest; a pale band of strata runs round
 * it near the rim. The water falls from a dark cleft in the rim as three
 * widening ribbons standing off the face, into a cloud of spray. Drawn 104
 * tall.
 */

const DEG = Math.PI / 180;

const TALUS = 16;
const MID = 56;
const RIM = 98;
const STRETCH = 1.5;
/** The wall's apothem at its foot, its waist and the rim. */
const R_FOOT = 21;
const R_MID = 20;
const R_RIM = 19;
const FALL_X = -6;

export const angelFalls: Monument = {
  id: 'angel-falls',
  name: 'Angel Falls',
  iso: 'VEN',
  lat: 5.9701,
  lon: -62.5362,
  realHeight: 979,
  tier: 'landmark',
  surface: 'none',
  footprint: 47,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, box, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const rock = tone(palette.clay, 0.92);
    const jungle = tone(palette.green, 0.68);
    const water = palette.white;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // 1. The tepui, oval in plan: talus, two courses of wall, the strata, the top.
    const oval = new THREE.Group();
    oval.scale.set(STRETCH, 1, 1);
    draft.add(oval);
    const talus = taper(28, R_FOOT, TALUS, jungle, 7);
    oval.add(talus);
    const low = taper(R_FOOT, R_MID, MID - TALUS, rock, 7);
    low.position.y = TALUS;
    oval.add(low);
    const high = taper(R_MID, R_RIM, RIM - MID, tone(palette.clay, 1.0), 7);
    high.position.y = MID;
    high.rotation.y = 9 * DEG;
    oval.add(high);
    const band = taper(R_RIM + 0.4, R_RIM + 0.3, 3, palette.tan, 7);
    band.position.y = RIM - 9;
    band.rotation.y = 9 * DEG;
    oval.add(band);
    const top = taper(R_RIM + 0.5, R_RIM - 1.5, 2.4, jungle, 7);
    top.position.y = RIM;
    top.rotation.y = 9 * DEG;
    oval.add(top);
    for (const [x, z, r] of [[-12, -6, 3.4], [-2, 6, 3.0], [9, -3, 3.6], [-6, 12, 2.6], [5, 13, 2.4]] as const) {
      const clump = taper(r, r * 0.5, r * 1.1, tone(palette.green, 0.8), 6);
      clump.position.set(x / STRETCH, RIM + 2.4, z);
      oval.add(clump);
    }

    // 2. The falls: the cleft in the rim, three ribbons standing off the wall,
    //    the spray where the water turns to mist before the ground.
    const faceAt = (y: number): number => {
      if (y < MID) return R_FOOT + ((R_MID - R_FOOT) * (y - TALUS)) / (MID - TALUS);
      return R_MID + ((R_RIM - R_MID) * (y - MID)) / (RIM - MID);
    };
    const cleft = box(4.2, 14, 0.4, tone(palette.clay, 0.55));
    cleft.position.set(FALL_X, RIM - 13, faceAt(RIM - 6) + 0.2);
    add(cleft);
    const ribbons: [top: number, foot: number, width: number, off: number][] = [
      [RIM + 0.6, 70, 1.8, 1.2],
      [70, 44, 2.6, 2.4],
      [44, 26, 3.6, 3.8],
    ];
    for (const [ya, yb, w, off] of ribbons) {
      add(strut(v(FALL_X, ya, faceAt(ya) + off - 0.8), v(FALL_X, yb, faceAt(yb) + off), w, water));
    }
    for (const [dx, y, r] of [[0, 18, 6.0], [-4, 21, 3.8], [4.5, 20, 4.2]] as const) {
      const spray = taper(r, r * 0.55, 6, tone(palette.white, 0.96), 7);
      spray.position.set(FALL_X + dx, y, faceAt(TALUS) + 5);
      add(spray);
    }

    // 3. The river leaving the foot of the falls, and jungle either side.
    const river = box(5, 0.5, 18, tone(palette.skyBlue, 0.75));
    river.position.set(FALL_X + 1, 0, 34);
    add(river);
    for (const [x, z, r] of [[-20, 32, 3.6], [-14, 38, 3.0], [8, 33, 3.8], [14, 39, 3.0], [-28, 26, 3.2], [22, 27, 3.4]] as const) {
      const trunk = taper(0.5, 0.4, 2.6, palette.bark, 5);
      trunk.position.set(x, 0, z);
      add(trunk);
      const crown = taper(r, r * 0.55, r * 1.2, jungle, 7);
      crown.position.set(x, 2.4, z);
      add(crown);
    }

    return ctx.merge(draft);
  },
};
