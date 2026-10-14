import type { Group, Monument, MonumentContext } from './contract.ts';

/**
 * The Chocolate Hills, Carmen, Bohol.
 *
 * A crop of the field: twenty-three ordinary mounds round one larger one, the
 * hill the viewing deck stands on, with its stair and pavilion. What names the
 * place is repetition of one shape on a visibly flat plain.
 *
 * Mounds vary a little in size (apothem 4.0 to 4.6, height 5.0 to 6.7) and tone,
 * and each is turned about its axis so no two facets lie in one plane. Each is
 * three seven-sided `taper` courses (a flared foot, a steeper middle, a rounded
 * top). Slopes are 50 to 60 degrees against the real 30 to 40, since a field of
 * true-slope mounds is a field of bumps. Laid out on a sunflower spiral from
 * 10.5 to 21.5 units out; the crop reaches 27 units (about 54 across) and the
 * pavilion tops out near 15.3. Half-diagonal over height is 1.8.
 *
 * One colour a mound, never banded: two thirds `brown` in three tones (dry
 * season), the rest a raised `darkOlive`. The plain is six thin rice-paddy
 * plates in greens at different heights (each edge is a step the ink draws);
 * trees are clumps on the flat, never on the mounds. No `realHeight`.
 */

/** How many ordinary mounds stand round the deck hill. */
const MOUNDS = 23;
/** The ring they stand in: from the deck hill's foot out to the crop's edge. */
const RING_INNER = 10.5;
const RING_OUTER = 21.5;
/** A seven-sided taper reaches past its apothem by this much at its corners. */
const CORNER = 1 / Math.cos(Math.PI / 7);
/** The deck hill. */
const DECK_RADIUS = 6.0;
const DECK_HEIGHT = 12;
/** The three courses of a mound: [radius at the top of the course, fraction of the height]. */
const PROFILE: readonly [number, number][] = [
  [0.66, 0.3],
  [0.36, 0.42],
  [0.08, 0.28],
];
/** How far apart two overlapping mounds' course tops must stand. */
const LEVEL_GAP = 0.1;
/** The golden angle, which is what spreads a spiral evenly. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** A deterministic hash in [0, 1). */
function hash(i: number, k: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Mound {
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Index into the hill colours. */
  shade: number;
  /** Turn about its own axis, so no two mounds' facets are parallel. */
  yaw: number;
}

/** The ordinary mounds, on a sunflower spiral across the ring. */
function mounds(): Mound[] {
  const out: Mound[] = [];
  for (let i = 0; i < MOUNDS; i++) {
    const t = (i + 0.5) / MOUNDS;
    const rho = Math.sqrt(RING_INNER ** 2 + (RING_OUTER ** 2 - RING_INNER ** 2) * t) + (hash(i, 1) - 0.5) * 1.0;
    const angle = i * GOLDEN + (hash(i, 2) - 0.5) * 0.25;
    out.push({
      x: Math.sin(angle) * rho,
      z: Math.cos(angle) * rho,
      radius: 4.0 + 0.6 * hash(i, 3),
      height: 5.0 + 1.6 * hash(i, 4),
      shade: Math.floor(hash(i, 5) * 5),
      yaw: hash(i, 6) * ((Math.PI * 2) / 7),
    });
  }
  // Two mounds whose feet overlap must not put a course top at one height (two
  // colours in one plane). Each mound is raised in small steps until its course
  // tops stand `LEVEL_GAP` clear of every earlier neighbour's.
  const levels = (m: Mound): number[] => {
    const out: number[] = [];
    let y = 0;
    for (const [, share] of PROFILE.slice(0, -1)) out.push((y += share * m.height));
    return out;
  };
  for (let i = 0; i < out.length; i++) {
    const m = out[i]!;
    for (let tries = 0; tries < 24; tries++) {
      const clash = out.slice(0, i).some((n) => {
        if (Math.hypot(m.x - n.x, m.z - n.z) > (m.radius + n.radius) * CORNER) return false;
        return levels(m).some((a) => levels(n).some((b) => Math.abs(a - b) < LEVEL_GAP));
      });
      if (!clash) break;
      m.height += 0.06;
    }
  }
  return out;
}

export const chocolateHills: Monument = {
  id: 'chocolate-hills',
  name: 'Chocolate Hills',
  iso: 'PHL',
  lat: 9.8297,
  lon: 124.1397,
  tier: 'building',
  footprint: 27.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, taper, strut } = ctx;

    // Three dry-season browns and two greener mounds, by a mound's `shade`.
    const hills = [
      tone(palette.brown, 0.9),
      palette.brown,
      tone(palette.brown, 1.1),
      tone(palette.darkOlive, 1.3),
      tone(palette.darkOlive, 1.45),
    ];
    const paddy = [palette.green, tone(palette.olive, 0.85), tone(palette.green, 0.9)];
    const forest = tone(palette.green, 0.62);
    const steps = palette.white; // the concrete stair up the deck hill
    const deck = palette.cream;
    const roof = palette.red;

    const draft = new THREE.Group();

    // -----------------------------------------------------------------------
    // 1. The plain: six paddies round the centre, each turned to its own bearing
    //    with its own top height.
    // -----------------------------------------------------------------------
    const PADDY_TOPS = [0.2, 0.45, 0.28, 0.53, 0.36, 0.61];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.26;
      const plate = box(16, PADDY_TOPS[i]!, 11, paddy[i % paddy.length]!);
      plate.rotation.y = angle;
      plate.position.set(Math.sin(angle) * 14, 0, Math.cos(angle) * 14);
      draft.add(plate);
    }

    // -----------------------------------------------------------------------
    // 2. The mounds.
    // -----------------------------------------------------------------------
    const mound = (x: number, z: number, radius: number, height: number, color: number, top: number, yaw: number): void => {
      let y = 0;
      let r = radius;
      PROFILE.forEach(([next, share], course) => {
        const end = (course === PROFILE.length - 1 ? top : next) * radius;
        const rise = share * height;
        const piece = taper(r, end, rise, color, 7);
        piece.position.set(x, y, z);
        piece.rotation.y = yaw;
        draft.add(piece);
        y += rise;
        r = end;
      });
    };

    const field = mounds();
    for (const m of field) mound(m.x, m.z, m.radius, m.height, hills[m.shade]!, PROFILE[2]![0], m.yaw);

    // The deck hill: larger, and cut flat on top for the pavilion.
    const deckTop = 0.24;
    mound(0, 0, DECK_RADIUS, DECK_HEIGHT, hills[1]!, deckTop, 0);

    // The stair up its front face. A seven-sided taper has a flat face on +Z at its
    // apothem; each flight is one course, set 0.2 out. The first starts 0.45 up so
    // the beam stays above y = 0.
    const knees: [number, number][] = [[0, DECK_RADIUS]];
    PROFILE.forEach(([next, share], course) => {
      const [lastY] = knees[knees.length - 1]!;
      const end = (course === PROFILE.length - 1 ? deckTop : next) * DECK_RADIUS;
      knees.push([lastY + share * DECK_HEIGHT, end]);
    });
    const [, footR] = knees[0]!;
    const [kneeY, kneeR] = knees[1]!;
    knees[0] = [0.45, footR + ((kneeR - footR) * 0.45) / kneeY];
    for (let i = 0; i + 1 < knees.length; i++) {
      const [y0, r0] = knees[i]!;
      const [y1, r1] = knees[i + 1]!;
      draft.add(strut(new THREE.Vector3(0, y0, r0 + 0.2), new THREE.Vector3(0, y1, r1 + 0.2), 0.6, steps));
    }

    // The pavilion: a deck, a small hall, a tiled hip roof.
    const platform = box(3.4, 0.4, 3.4, steps);
    platform.position.set(0, DECK_HEIGHT - 0.1, 0);
    draft.add(platform);
    const hall = box(2.2, 1.6, 2.2, deck);
    hall.position.set(0, DECK_HEIGHT + 0.3, 0);
    draft.add(hall);
    const cap = taper(1.9, 0.2, 1.4, roof, 4);
    cap.position.set(0, DECK_HEIGHT + 1.9, 0);
    draft.add(cap);

    // -----------------------------------------------------------------------
    // 3. Clumps of trees on the flat between the mounds, never on them.
    // -----------------------------------------------------------------------
    const CLUMP = 1.5;
    let planted = 0;
    for (let c = 0; c < 400 && planted < 10; c++) {
      const angle = c * GOLDEN + 1.3;
      const rho = 8 + 17 * hash(c, 9);
      const x = Math.sin(angle) * rho;
      const z = Math.cos(angle) * rho;
      if (rho + CLUMP * CORNER > 26.5) continue;
      if (Math.hypot(x, z) < DECK_RADIUS * CORNER + CLUMP + 0.6) continue;
      const clear = field.every((m) => Math.hypot(x - m.x, z - m.z) > m.radius * CORNER + CLUMP + 0.4);
      if (!clear) continue;
      const clump = taper(CLUMP, 0.35, 2.6 + hash(c, 11), forest, 7);
      clump.position.set(x, 0, z);
      draft.add(clump);
      planted++;
    }

    // 94 meshes, inside the tier's 110, so the pieces are handed back as they
    // are; `placement.ts` merges them by colour on the planet.
    return draft;
  },
};
