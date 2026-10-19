import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Zuma Rock, Niger State, Nigeria.
 *
 * A granite monolith rising 300 m sheer out of the savanna beside the road to
 * Abuja, the one on the hundred-naira note. What names it, in order: the
 * smooth grey dome with near-vertical flanks; the dark streaks running down
 * its face, which people read as a face; and the green scrub round its foot.
 *
 * The dome is a stack of eleven-sided frusta through a rounded profile, a
 * good deal longer than wide (a parent scaled 1.4 along x), turned a few degrees per
 * course so the flanks are not a lathe. The streaks are struts laid on the
 * face. Drawn 30 tall for 300 m.
 */

const DEG = Math.PI / 180;

const PROFILE: [y: number, r: number][] = [
  [0, 16.5],
  [3, 15.8],
  [10, 15.6],
  [17, 14.2],
  [22.5, 11.6],
  [26.5, 8.2],
  [29.2, 4.4],
  [30.4, 1.4],
];
const STRETCH = 1.4;

const apothemAt = (y: number): number => {
  for (let i = 1; i < PROFILE.length; i++) {
    const [ya, ra] = PROFILE[i - 1]!;
    const [yb, rb] = PROFILE[i]!;
    if (y <= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya);
  }
  return PROFILE[PROFILE.length - 1]![1];
};

/** Streaks down the south face: [x along the face, top, bottom, width]. */
const STREAKS: [x: number, top: number, foot: number, w: number][] = [
  [-6.5, 24, 9, 1.2],
  [-3, 26, 15, 0.9],
  [3, 26, 14, 0.9],
  [6.5, 23, 8, 1.2],
  [0, 15, 3, 1.6],
  [-12, 19, 3, 0.9],
  [12.5, 17, 3, 0.9],
];

export const zumaRock: Monument = {
  id: 'zuma-rock',
  name: 'Zuma Rock',
  iso: 'NGA',
  lat: 9.1257,
  lon: 7.2271,
  realHeight: 300,
  tier: 'building',
  surface: 'none',
  footprint: 26.2,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const granite = tone(palette.slate, 1.12);
    const stain = tone(palette.slate, 0.62);

    const oval = new THREE.Group();
    oval.scale.set(STRETCH, 1, 1);
    draft.add(oval);
    for (let i = 1; i < PROFILE.length; i++) {
      const [ya, ra] = PROFILE[i - 1]!;
      const [yb, rb] = PROFILE[i]!;
      const course = taper(ra, rb, yb - ya, granite, 11);
      course.position.y = ya;
      course.rotation.y = (i % 2 ? 4 : -3) * DEG;
      oval.add(course);
    }

    // The streaks on the south face (+Z), laid on the rock and a little proud.
    for (const [x, top, foot, w] of STREAKS) {
      const at = (y: number) => {
        const r = apothemAt(y);
        return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, (r + 0.35) ** 2 - (x / STRETCH) ** 2)));
      };
      add(strut(at(top), at(foot), w, stain));
    }

    // Scrub and trees round the foot.
    const scrub: [x: number, z: number, r: number][] = [
      [-19, 9, 2.6], [-9, 14.5, 2.2], [10, 14.2, 2.6], [20, 8, 2.2], [23, -4, 2.4], [-23, -4, 2.6], [2, 15.6, 1.8], [-5, -15.6, 2.2],
    ];
    for (const [x, z, r] of scrub) {
      const trunk = taper(0.35, 0.3, 1.8, palette.bark, 5);
      trunk.position.set(x, 0, z);
      add(trunk);
      const crown = taper(r, r * 0.6, r * 0.9, tone(palette.green, 0.82), 7);
      crown.position.set(x, 1.6, z);
      add(crown);
    }

    return ctx.merge(draft);
  },
};
