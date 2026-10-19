import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Sigiriya, the Lion Rock, Sri Lanka.
 *
 * A gneiss plug 180 m out of a flat plain, sheer on every side and flat on
 * top, with a palace on the summit and, halfway up its north face, the brick
 * paws of the lion that was once the gateway. What names it, in order: an oval
 * block with vertical walls and a rounded shoulder (never a cone); a green cap
 * with brick terraces; the two paws on their terrace with the stair rising
 * between them; and the water gardens on the axis in front.
 *
 * The rock is an oval: a parent scaled 1.25 along x with no rotation holds
 * nine-sided courses with none, so the plan stretches without shearing. Its
 * profile bulges out and then rolls over at the top, and each course is turned
 * a little against the last so the walls break into buttresses. Two dark
 * streaks run down the face where the monsoon water runs.
 *
 * Tier `building`. The rock is really wider than tall; it is stretched about
 * 1.9x in height, because the view everybody has is from its foot.
 */

const DEG = Math.PI / 180;

/** The rock, as [height, apothem] steps, foot to summit. */
const ROCK: [y: number, r: number][] = [
  [0, 14.6],
  [4, 13.0],
  [14, 13.7],
  [26, 13.6],
  [32, 12.6],
  [35, 10.8],
  [36.2, 8.6],
];
const TWIST = [0, 0, 6, -5, 4, -3, 2];
const STRETCH = 1.32;
const SIDES = 9;

/** The lion terrace: floor, top of its retaining wall, how far it stands out. */
const TERRACE_Y = 12;
const TERRACE_FRONT = 20;

const apothemAt = (y: number): number => {
  for (let i = 1; i < ROCK.length; i++) {
    const [ya, ra] = ROCK[i - 1]!;
    const [yb, rb] = ROCK[i]!;
    if (y <= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya);
  }
  return ROCK[ROCK.length - 1]![1];
};

export const sigiriya: Monument = {
  id: 'sigiriya',
  name: 'Sigiriya',
  iso: 'LKA',
  lat: 7.957,
  lon: 80.7603,
  tier: 'building',
  surface: 'none',
  footprint: 25,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, box, strut } = ctx;
    const draft = new THREE.Group();
    // The rock stands behind the centre so the terrace and the gardens in
    // front of it keep the model straddling the axis.
    const site = new THREE.Group();
    site.position.z = -4;
    draft.add(site);
    const add = (o: Object3D): void => void site.add(o);
    const gneiss = tone(palette.brown, 0.92);
    const streak = tone(palette.brown, 0.62);
    const brick = palette.clay;
    const jungle = tone(palette.green, 0.72);

    // 1. The rock, oval in plan.
    const oval = new THREE.Group();
    oval.scale.set(STRETCH, 1, 1);
    site.add(oval);
    for (let i = 1; i < ROCK.length; i++) {
      const [ya, ra] = ROCK[i - 1]!;
      const [yb, rb] = ROCK[i]!;
      const course = taper(ra, rb, yb - ya, i === 1 ? jungle : gneiss, SIDES);
      course.position.y = ya;
      course.rotation.y = TWIST[i]! * DEG;
      oval.add(course);
    }
    // The summit: a green cap and the palace's brick terraces stepping up it.
    const top = ROCK[ROCK.length - 1]!;
    const cap = taper(top[1], top[1] - 1.2, 1.2, palette.green, SIDES);
    cap.position.y = top[0];
    oval.add(cap);
    const terraces: [x: number, z: number, w: number, d: number, h: number][] = [
      [0, 3.5, 11, 4.5, 1.4],
      [-3, -1.5, 8, 5, 2.2],
      [3.5, -4, 5, 4, 2.6],
    ];
    for (const [x, z, w, d, h] of terraces) {
      const t = box(w / STRETCH, h, d, brick);
      t.position.set(x / STRETCH, top[0] + 1.2, z);
      oval.add(t);
    }

    // Two streaks of monsoon water down the front, proud of the wall.
    for (const [x, from, to, w] of [[-5.5, 5, 31, 2.2], [7, 9, 29, 1.6], [-10.5, 6, 25, 1.4]] as const) {
      const at = (y: number) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0, apothemAt(y) ** 2 - (x / STRETCH) ** 2)) + 0.9);
      add(strut(at(from), at(to), w, streak));
    }

    // 2. The lion terrace on the north face: a brick platform, the two paws
    //    either side of the stair, and the iron stair up the face above it.
    const face = apothemAt(TERRACE_Y);
    const depth = TERRACE_FRONT - face + 3;
    const platform = box(13.5, TERRACE_Y, depth, tone(palette.sand, 0.9));
    platform.position.set(0, 0, TERRACE_FRONT - depth / 2);
    add(platform);
    for (const side of [-1, 1]) {
      const paw = box(4.2, 4.6, 6.0, brick);
      paw.position.set(side * 3.9, TERRACE_Y, TERRACE_FRONT - 4.2);
      add(paw);
      const pad = box(4.6, 1.9, 2.2, tone(palette.clay, 0.85));
      pad.position.set(side * 3.9, TERRACE_Y - 0.3, TERRACE_FRONT - 0.8);
      add(pad);
      for (let k = -1; k <= 1; k++) {
        const claw = box(0.9, 1.1, 1.1, palette.white);
        claw.position.set(side * 3.9 + k * 1.35, TERRACE_Y, TERRACE_FRONT + 0.6);
        add(claw);
      }
    }
    // The stair between the paws, from the plain to the terrace.
    for (let k = 0; k < 6; k++) {
      const step = box(3.6, TERRACE_Y * ((k + 1) / 6), 1.0, palette.sand);
      step.position.set(0, 0, TERRACE_FRONT + 1.0 * (6 - k) - 0.5);
      add(step);
    }
    // The iron stair: zig-zag flights up the face to the summit.
    const flights: [x0: number, y0: number, x1: number, y1: number][] = [
      [0, TERRACE_Y, 5, 18],
      [5, 18, -4, 25],
      [-4, 25, 3, 31],
      [3, 31, -1, 35.5],
    ];
    for (const [x0, y0, x1, y1] of flights) {
      const at = (x: number, y: number) =>
        new THREE.Vector3(x, y, Math.sqrt(Math.max(0, apothemAt(y) ** 2 - (x / STRETCH) ** 2)) + 0.9);
      add(strut(at(x0, y0), at(x1, y1), 0.7, palette.steel));
    }

    // 3. The water gardens: two pools either side of the axis in front.
    for (const side of [-1, 1]) {
      const rim = box(6.5, 0.6, 5.5, palette.sand);
      rim.position.set(side * 11.5, 0, 17.5);
      rim.rotation.y = side * 18 * DEG;
      add(rim);
      const water = box(5.3, 0.15, 4.3, palette.skyBlue);
      water.position.set(side * 11.5, 0.6, 17.5);
      water.rotation.y = side * 18 * DEG;
      add(water);
    }

    // 4. Boulders and trees at the foot of the rock.
    const boulders: [x: number, z: number, r: number, h: number][] = [
      [-20, 4, 2.6, 3.4], [20.5, -1, 2.2, 2.8], [-14, -9, 2.8, 3.8], [15, -9, 2.0, 2.4],
    ];
    for (const [x, z, r, h] of boulders) {
      const b = taper(r, r * 0.6, h, tone(palette.brown, 0.8), 6);
      b.position.set(x, 0, z);
      add(b);
    }
    const trees: [x: number, z: number, r: number][] = [
      [-19, 10, 2.6], [19, 9, 2.4], [-8, -15.5, 2.8], [9, -15, 2.4], [-20, -4, 2.2], [0, -16.5, 2.4],
    ];
    for (const [x, z, r] of trees) {
      const trunk = taper(0.45, 0.35, 2.4, palette.bark, 5);
      trunk.position.set(x, 0, z);
      add(trunk);
      const crown = taper(r, r * 0.5, r * 1.3, jungle, 7);
      crown.position.set(x, 2.2, z);
      add(crown);
    }

    return ctx.merge(draft);
  },
};
