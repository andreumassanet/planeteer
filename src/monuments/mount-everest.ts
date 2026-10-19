import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Mount Everest.
 *
 * The terrain already builds the mountain at this site and the pad flattens a
 * summit plateau, so the model is the summit pyramid only: the last stretch of
 * the mountain, cropped where the pad crops it.
 *
 * What names Everest, in order: a dark horn standing out of snow, with three
 * ridges and three faces (a hexagon whose corners are the ridges); the pale
 * Yellow Band across the rock two-thirds up; a white summit; and the plume of
 * snow streaming east off the top. The colour runs in five bands and nothing
 * else subdivides the faces: snow apron, rock, the band, rock, the summit snow.
 * Above the apron the hexagon becomes a three-sided horn, each step turned a
 * little against the last so the faces break into buttresses, and two lesser
 * horns (the West Shoulder and the South Summit) make it a massif rather than a
 * cone. Prayer flags on a cairn at the foot are the only saturated colour.
 *
 * `placement.ts` aims +Z at the north pole, so +Z is north and -X is east; the
 * summit leans a little north-east, as the real one does over the Kangshung
 * Face. Tier `landmark` for its 55-unit footprint. Aspect 1.15.
 */

const DEG = Math.PI / 180;

/** The profile, foot to summit: [height, apothem of the hexagon there]. */
const PROFILE: [y: number, r: number][] = [
  [0, 47],
  [7, 37],
  [16, 29],
  [30, 22],
  [44, 17.4],
  [58, 11.6],
  [68, 8.0],
  [78, 4.6],
  [88, 1.2],
];

/**
 * Above this the body is a three-sided horn rather than a hexagon, each step
 * turned a little against the last so the faces break into buttresses.
 */
const HORN = 30;
const TWIST = [0, 0, 0, 0, -6, 4, -3, 5, 0];

/** Which band each section is drawn in: snow, rock, band, rock, snow. */
const BANDS: [top: number, color: 'white' | 'slate' | 'sand'][] = [
  [16, 'white'],
  [58, 'slate'],
  [68, 'sand'],
  [78, 'slate'],
  [88, 'white'],
];

/** How far the summit leans east (-X) and north (+Z), reached at the top. */
const LEAN_EAST = 6;
const LEAN_NORTH = 3.5;

/**
 * The West Shoulder and the South Summit: two lesser horns against the main
 * one, as [x, z, height, apothem at the foot, yaw], so the silhouette is a
 * massif rather than a cone.
 */
const SHOULDERS: [x: number, z: number, h: number, r: number, yaw: number][] = [
  [21, -4, 52, 17, 20],
  [-14, -16, 66, 15, -15],
];

/** The plume: [run east, rise, length, thickness, depth]. */
const PLUME: [x: number, y: number, length: number, thick: number, depth: number][] = [
  [-5, 87.4, 9, 2.2, 4.0],
  [-13, 85.4, 10, 2.6, 5.6],
  [-22, 83.6, 9, 2.4, 6.4],
  [-30, 82.2, 7, 1.8, 5.2],
];

const lean = (y: number): [number, number] => {
  const f = Math.pow(y / 88, 1.5);
  return [-LEAN_EAST * f, LEAN_NORTH * f];
};

export const mountEverest: Monument = {
  id: 'mount-everest',
  name: 'Mount Everest',
  iso: 'NPL',
  lat: 27.988,
  lon: 86.925,
  realHeight: 8849,
  tier: 'landmark',
  surface: 'none',
  footprint: 55,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, strut, box, column } = ctx;
    const draft = new THREE.Group();
    const rock = tone(palette.slate, 0.74);
    const add = (o: Object3D): void => void draft.add(o);

    // 1. The body: one six-sided frustum a profile step, centred where the lean
    //    puts the middle of the step, coloured by its band.
    for (let i = 1; i < PROFILE.length; i++) {
      const [ya, ra] = PROFILE[i - 1]!;
      const [yb, rb] = PROFILE[i]!;
      const name = BANDS.find(([top]) => yb <= top)![1];
      const color = name === 'slate' ? rock : palette[name];
      const [cx, cz] = lean((ya + yb) / 2);
      const horn = ya >= HORN;
      // A triangle's apothem is half its circumradius: double it to keep the corners out.
      const section = horn ? taper(ra * 0.62, rb * 0.62, yb - ya, color, 3) : taper(ra, rb, yb - ya, color, 6);
      section.position.set(cx, ya, cz);
      section.rotation.y = TWIST[i]! * DEG;
      add(section);
    }

    // The lesser horns: rock with a cap of snow.
    for (const [x, z, h, r, yaw] of SHOULDERS) {
      const foot = taper(r, r * 0.42, h * 0.72, rock, 4);
      foot.position.set(x, 0, z);
      foot.rotation.y = yaw * DEG;
      add(foot);
      const cap = taper(r * 0.42, 0.6, h * 0.28, palette.white, 4);
      cap.position.set(x, h * 0.72, z);
      cap.rotation.y = yaw * DEG;
      add(cap);
    }

    // 4. The plume, streaming east off the summit and spreading as it goes.
    for (const [x, y, length, thick, depth] of PLUME) {
      const puff = box(length, thick, depth, tone(palette.white, 0.96));
      puff.position.set(x - LEAN_EAST * 0.6, y - thick / 2, LEAN_NORTH + 0.5);
      puff.rotation.y = 8 * DEG;
      add(puff);
    }

    // 5. A cairn at the foot of the North Face, with prayer flags in the
    //    lungta order strung from it to two poles.
    const flags = [palette.skyBlue, palette.white, palette.red, palette.green, palette.gold];
    const cairnAt = new THREE.Vector3(0, 0, 44.5);
    const cairn = taper(2.4, 0.8, 3.2, tone(palette.slate, 0.9), 5);
    cairn.position.copy(cairnAt);
    add(cairn);
    const mast = column(0.22, 9, palette.bark, 5);
    mast.position.set(cairnAt.x, 3, cairnAt.z);
    add(mast);
    for (const side of [-1, 1]) {
      const poleAt = new THREE.Vector3(side * 9, 0, 41.5);
      const pole = column(0.18, 4.5, palette.bark, 5);
      pole.position.copy(poleAt);
      add(pole);
      const from = new THREE.Vector3(cairnAt.x, 11.6, cairnAt.z);
      const to = new THREE.Vector3(poleAt.x, 4.4, poleAt.z);
      add(strut(from, to, 0.08, palette.bark));
      for (let k = 1; k <= 5; k++) {
        const at = from.clone().lerp(to, k / 7);
        const flag = box(0.9, 1.0, 0.12, flags[(k - 1) % flags.length]!);
        flag.position.set(at.x, at.y - 1.3, at.z);
        flag.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2;
        add(flag);
      }
    }

    return ctx.merge(draft);
  },
};
