import type { Group, Monument, MonumentContext } from './contract.ts';

/**
 * The Chocolate Hills, Carmen, Bohol.
 *
 * **Why the Philippines:** the archipelago had no landmark at all, and the
 * Chocolate Hills are the one thing in it that is on every map of the country
 * and on Bohol's provincial seal. At least 1,260 limestone mounds, most 30 to
 * 50 m high, stand on about 50 square kilometres of plain; they are grassed
 * and nearly treeless, and the grass dries brown in the dry season, which is
 * the name.
 *
 * ---------------------------------------------------------------------------
 * What has to survive: many, alike, on a flat
 * ---------------------------------------------------------------------------
 *
 * One cone is a hill and a dozen cones of every size is a mountain range. What
 * names this place is **repetition of one shape** — dozens of mounds so alike
 * they look made, packed close on a plain that is visibly flat between them.
 * So the model is a crop of the field: twenty-three ordinary mounds round one
 * larger one, the hill the viewing deck stands on, with its stair and its
 * pavilion — the deck at the Chocolate Hills Complex is where every
 * photograph of the field is taken from.
 *
 * The mounds vary a little in size (apothem 4.0 to 4.6, height 5.0 to 6.7) and
 * in tone, and each is turned a little about its own axis so no two
 * mounds' facets lie in one plane; in nothing else; a field of identical cones would read as a
 * pattern, a field of different ones as ordinary hills.
 *
 * ---------------------------------------------------------------------------
 * The profile, and the slope it is exaggerated to
 * ---------------------------------------------------------------------------
 *
 * Each mound is three seven-sided `taper` courses: a short flared foot, a
 * steeper middle, a rounded top — the Hershey's-kiss profile the hills are
 * always compared to. Seven sides for the Pitons' reason: few joints read as
 * ground, many as masonry.
 *
 * Real mounds stand at roughly 30 to 40 degrees. These are 50 to 60 on their
 * courses, about tan 1.5x against life, which is the Pitons' trade again: from
 * the deck or the road the mounds are seen from their own height, and at their
 * true slope a field of them is a field of bumps.
 *
 * ---------------------------------------------------------------------------
 * Scale and colour
 * ---------------------------------------------------------------------------
 *
 * Laid out on a sunflower spiral in a ring round the deck hill, from 10.5 to
 * 21.5 units out, so the gaps between them are even without being a grid. The
 * crop reaches 27 units, so it is about 54 across; the deck pavilion tops out
 * near 15.3. Half-diagonal over height is 1.8 against the 2.0 cap. In metres
 * the crop is roughly 1 km of a field 7 km across, and the mounds are packed
 * about twice as close as they stand.
 *
 * One colour a mound, never banded by height: the Pitons found that a dark
 * course at the foot reads as shadow. Two thirds are `brown` in three tones,
 * the dry-season hills; the rest a raised `darkOlive`, the greener ones. The
 * plain under them is rice paddy, six thin plates in greens at different
 * heights, so every edge between two of them is a step the ink draws and no
 * two tops share a plane; the trees are clumps on the flat between the
 * mounds, never on them, because the mounds are grassland.
 *
 * The source carries no height: the hills are a field of mounds, not one.
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
  // Two mounds whose feet overlap must not put a course top at one height: the
  // flat caps between courses would be two colours in one plane where the
  // feet cross. Each mound is raised in small steps until its course tops
  // stand `LEVEL_GAP` clear of every earlier neighbour's.
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
    // 1. The plain: six paddies round the centre, each turned to its own
    //    bearing, each top at its own height.
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

    // The stair up its front face. A seven-sided taper has a flat face on +Z
    // at its apothem, so a beam along that face's centre line lies on it; each
    // flight is one course, set 0.2 out so it stands on the slope. The first
    // starts 0.45 up, where the beam's own thickness keeps it above y = 0.
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
