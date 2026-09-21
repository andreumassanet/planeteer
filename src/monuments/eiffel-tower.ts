import type { Group, Mesh, Monument, Vector3 } from './contract.ts';

/**
 * Eiffel Tower.
 *
 * The silhouette test is the only one that matters at a distance, and for this
 * tower it is four things: **the flared legs, the great arch under the first
 * platform, two decks, and a needle**. Up close it is a fifth, and it is the
 * one the old model had none of: **it is a lattice**. You can see through every
 * part of it, and nothing in it is a slab.
 *
 * ## What is here
 *
 * - **Four legs, each a lattice box of four chords** springing from four
 *   masonry piers of its own — sixteen feet in all, as there are. A leg is
 *   8.6 units square at the ground (24 m) and 4 at the second platform, and its
 *   centre follows the tower's curve while its section shrinks, so the outer
 *   chord sweeps in faster than the inner one: the concave flare, drawn by
 *   the chords rather than by a single fat strut.
 * - **One X a panel on each leg's two outer faces**, five panels a leg. Only the
 *   outer faces: the inner ones are seen through the outer ones and the arch,
 *   where a second layer of crosses would close the lattice into a fence.
 * - **The four arches**, one a face, springing from the legs' inner chords at
 *   4.5 and reaching the underside of the first platform — elliptical rather
 *   than the old flattened parabola, so the springing is steep and the crown is
 *   round, which is what the arch looks like from the Champ de Mars.
 * - **The first platform is a ring, not a slab.** A frieze girder, a deck with
 *   the square void in its middle, and the gallery round its rim. Standing
 *   under the tower you look straight up through that void into the shaft, and
 *   from the plane it is a square picture frame at a sixth of the height.
 * - **The second platform**, its girder, deck, gallery and the smaller upper
 *   level, where the four legs have nearly closed into one.
 * - **The upper shaft**: four chords, a cross a face in each of four panels,
 *   and a belt at each panel line, up to the glazed top cabin, its terrace, the
 *   lantern, and a white antenna mast.
 *
 * ## The three browns
 *
 * The real tower is painted in three shades of one brown, darkest at the foot,
 * so it reads as one colour against a sky that lightens toward the horizon.
 * That is `ctx.tone` exactly: `brown` at 0.74 for the legs, 0.84 between the
 * first and second platforms, 0.94 for the shaft and 1.02 for the top. The
 * bracing is a step lighter than the chords it sits between, so each panel has
 * two tones in it and the crosses read as lighter members laid over darker
 * ones. The piers are `tan` stone. `darkOlive`, which the old decks wore, is
 * gone: the platforms are the tower's own brown.
 *
 * ## Not the Tokyo Tower
 *
 * `tokyo-tower.ts` is an avowed copy of this tower and says how it stays
 * apart; this file keeps its side of that. One brown against orange-and-white
 * bands. A base 45.6 wide against 31, sweeping in by half before the first
 * platform. The great arch, and sky under it, where Tokyo has a building. Thin
 * decks at 20.7 and 41.8, not a two-storey block at 51. Lattice to 100 and a
 * short mast, not a bare antenna over the top fifth.
 *
 * ## Scale
 *
 * The real tower's heights against 330 m, mapped onto the 120-unit `landmark`
 * tier: first platform 57 m -> 20.7, second 115 m -> 41.8, top 276 m -> 100.4.
 * Widths on the same scale: the 125 m base is 45.6, the first platform 70 m,
 * the second 40 m. Nothing is stretched.
 *
 * ## Budget
 *
 * A strut is twelve triangles and this tower is 232 of them. Everything is
 * built as ordinary pieces and drawn by `ctx.merge` as one mesh per colour — the
 * "merging them by material later is a single call" that `contract.ts` made
 * every geometry non-indexed for — so the mesh cap stops binding and the
 * triangle cap is the one that decides how much lattice there is.
 */

interface Level {
  y: number;
  /** Outer half-width of the tower: the outside of the legs, and of the shaft above them. */
  w: number;
  /** Half the side of one leg's square section. Absent once the legs have closed into the shaft. */
  s?: number;
}

/**
 * The profile. The legs run to the second platform (index 5); the shaft runs
 * from there to the top platform. The first row starts on the piers, not at 0:
 * a diagonal strut's section dips below its endpoint, and the piers cover it.
 */
const LEVELS: Level[] = [
  { y: 2.0, w: 22.8, s: 4.3 },
  { y: 7.2, w: 18.6, s: 3.9 },
  { y: 13.6, w: 15.0, s: 3.4 },
  { y: 20.7, w: 12.0, s: 2.9 }, // first platform, 57 m
  { y: 31.0, w: 8.9, s: 2.4 },
  { y: 41.8, w: 6.6, s: 2.0 }, // second platform, 115 m
  { y: 57.0, w: 5.0 },
  { y: 72.0, w: 4.1 },
  { y: 86.0, w: 3.5 },
  { y: 100.4, w: 3.0 }, // top platform, 276 m
];
const FIRST = 3;
const SECOND = 5;
const TOP_LEVEL = LEVELS.length - 1;

const PIER_HEIGHT = LEVELS[0]!.y;
const PIER_SIZE = 2.9;

/** Where the arch springs from the inner chords, and where its crown meets the frieze girder. */
const ARCH_SPRING = 4.5;
const ARCH_CROWN = 18.4;
/** Segments per arch. Six joints of ink read as a curve; twelve would read as a ladder. */
const ARCH_SEGMENTS = 6;

/** Half the thickness the shaft's chords are set in from its outer line. */
const SHAFT_INSET = 0.45;

const TOP = 120;

function interpolate(y: number, key: 'w' | 's'): number {
  const first = LEVELS[0]!;
  if (y <= first.y) return first[key] ?? 0;
  for (let i = 1; i < LEVELS.length; i++) {
    const a = LEVELS[i - 1]!;
    const b = LEVELS[i]!;
    if (y <= b.y) {
      const av = a[key] ?? 0;
      const bv = b[key] ?? av;
      return av + ((bv - av) * (y - a.y)) / (b.y - a.y);
    }
  }
  return LEVELS[LEVELS.length - 1]![key] ?? 0;
}

export const eiffelTower: Monument = {
  id: 'eiffel-tower',
  name: 'Eiffel Tower',
  iso: 'FRA',
  lat: 48.8584,
  lon: 2.2945,
  realHeight: 330,
  tier: 'landmark',
  footprint: 35,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, strut, ringWall, around } = ctx;
    const draft = new THREE.Group();

    // Three browns, darkest at the foot, and a lighter one for the bracing in
    // each band. `zone` is which band a level falls in.
    const CHORD = [tone(palette.brown, 0.74), tone(palette.brown, 0.84), tone(palette.brown, 0.94)];
    const BRACE = [tone(palette.brown, 0.82), tone(palette.brown, 0.92), tone(palette.brown, 1.02)];
    const zone = (level: number): number => (level < FIRST ? 0 : level < SECOND ? 1 : 2);
    const deck = tone(palette.brown, 0.88);
    const girder = tone(palette.brown, 0.78);
    const crown = tone(palette.brown, 1.02);
    const stone = palette.tan;
    const glass = tone(palette.slate, 0.85);
    const mast = palette.white;

    const at = (x: number, y: number, z: number): Vector3 => new THREE.Vector3(x, y, z);
    /** Chords thin from 1.8 at the foot to 0.6 at the top. */
    const chordThickness = (level: number): number => 1.8 - (1.2 * level) / (TOP_LEVEL - 1);
    const braceThickness = (level: number): number => 0.42 * chordThickness(level) + 0.12;

    /** A square band in plan, `inner` to `outer` measured to the flats. */
    const band = (inner: number, outer: number, base: number, height: number, color: number): Mesh => {
      const ring = ringWall(inner * Math.SQRT2, outer * Math.SQRT2, height, color, 4);
      // A four-sided lathe puts its corners on the axes; a quarter-turn's half
      // puts its flats there instead, square with the legs.
      ring.rotation.y = Math.PI / 4;
      ring.position.y = base;
      return ring;
    };
    const slab = (half: number, base: number, height: number, color: number): Mesh => {
      const mesh = box(half * 2, height, half * 2, color);
      mesh.position.y = base;
      return mesh;
    };

    // --- the legs ---------------------------------------------------------
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // The chord at (ex, ez) of this leg, at a level: the leg's centre rides
        // the curve at w - s, its section is s either side of it.
        const chord = (i: number, ex: number, ez: number): Vector3 => {
          const { y, w, s = 0 } = LEVELS[i]!;
          return at(sx * (w - s) + ex * s, y, sz * (w - s) + ez * s);
        };

        // Four feet: one masonry pier under each chord.
        for (const ex of [-1, 1]) {
          for (const ez of [-1, 1]) {
            const foot = chord(0, ex, ez);
            const pier = box(PIER_SIZE, PIER_HEIGHT, PIER_SIZE, stone);
            pier.position.set(foot.x, 0, foot.z);
            draft.add(pier);
          }
        }

        for (let i = 0; i < SECOND; i++) {
          const color = CHORD[zone(i)]!;
          for (const ex of [-1, 1]) {
            for (const ez of [-1, 1]) {
              draft.add(strut(chord(i, ex, ez), chord(i + 1, ex, ez), chordThickness(i), color));
            }
          }
          // A cross on each of the two outer faces: the X face at ex = sx and
          // the Z face at ez = sz.
          const brace = BRACE[zone(i)]!;
          const t = braceThickness(i);
          for (const e of [-1, 1]) {
            draft.add(strut(chord(i, sx, e), chord(i + 1, sx, -e), t, brace));
            draft.add(strut(chord(i, e, sz), chord(i + 1, -e, sz), t, brace));
          }
        }
      }
    }

    // --- the four arches, one a face -------------------------------------
    // Built on the +Z face and turned round. Each point sits on the face's own
    // plane, z = w(y), and between the legs' inner chords, x = w - 2s: the arch
    // leans back with the legs rather than standing in front of them.
    draft.add(
      around(4, () => {
        const face = new THREE.Group();
        const point = (k: number): Vector3 => {
          const phi = (k / ARCH_SEGMENTS) * Math.PI;
          const y = ARCH_SPRING + (ARCH_CROWN - ARCH_SPRING) * Math.sin(phi);
          const w = interpolate(y, 'w');
          return at(-Math.cos(phi) * (w - 2 * interpolate(y, 's')), y, w);
        };
        for (let k = 0; k < ARCH_SEGMENTS; k++) {
          face.add(strut(point(k), point(k + 1), 1.4, CHORD[0]!));
        }
        return face;
      }),
    );

    // --- the first platform: a girder, a deck round a void, a gallery -------
    const first = LEVELS[FIRST]!;
    draft.add(band(first.w - 1.3, first.w + 0.3, first.y - 1.8, 1.8, girder));
    draft.add(band(7.0, first.w + 0.8, first.y, 1.0, deck));
    draft.add(band(first.w + 0.35, first.w + 0.8, first.y + 1.0, 2.0, crown));

    // --- the second platform ---
    const second = LEVELS[SECOND]!;
    draft.add(band(second.w - 1.1, second.w + 0.3, second.y - 1.4, 1.4, girder));
    draft.add(slab(second.w + 0.7, second.y, 0.9, deck));
    draft.add(band(second.w + 0.3, second.w + 0.7, second.y + 0.9, 1.6, crown));
    draft.add(slab(second.w - 1.8, second.y + 0.9, 2.3, deck));

    // --- the shaft --------------------------------------------------------
    for (let i = SECOND; i < TOP_LEVEL; i++) {
      const a = LEVELS[i]!;
      const b = LEVELS[i + 1]!;
      const ra = a.w - SHAFT_INSET;
      const rb = b.w - SHAFT_INSET;
      const color = CHORD[2]!;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          draft.add(strut(at(sx * ra, a.y, sz * ra), at(sx * rb, b.y, sz * rb), chordThickness(i), color));
        }
      }
      // A cross on every face, built on +Z and turned round.
      const t = braceThickness(i);
      draft.add(
        around(4, () => {
          const face = new THREE.Group();
          face.add(strut(at(-ra, a.y, ra), at(rb, b.y, rb), t, BRACE[2]!));
          face.add(strut(at(ra, a.y, ra), at(-rb, b.y, rb), t, BRACE[2]!));
          return face;
        }),
      );
      // A belt at each panel line above the second platform.
      if (i > SECOND) draft.add(band(a.w - 0.9, a.w + 0.15, a.y - 0.8, 0.8, girder));
    }

    // --- the top: cabin, terrace, lantern, mast -----------------------------
    const top = LEVELS[TOP_LEVEL]!;
    draft.add(slab(top.w + 0.5, top.y, 0.9, girder));
    draft.add(slab(top.w, top.y + 0.9, 3.0, crown));
    // The glazed band, proud of the cabin wall so the ink has an edge to draw.
    draft.add(slab(top.w + 0.08, top.y + 1.6, 1.4, glass));
    draft.add(slab(top.w + 0.6, top.y + 3.9, 0.7, girder));
    draft.add(band(top.w + 0.2, top.w + 0.6, top.y + 4.6, 1.0, crown));

    const lantern = column(1.9, 3.4, crown, 8);
    lantern.position.y = top.y + 4.6;
    draft.add(lantern);
    const cap = taper(2.1, 0.6, 2.2, girder, 8);
    cap.position.y = top.y + 8.0;
    draft.add(cap);

    const lower = column(0.45, 5.2, mast, 6);
    lower.position.y = top.y + 10.2;
    draft.add(lower);
    const upper = column(0.28, TOP - (top.y + 15.4), mast, 6);
    upper.position.y = top.y + 15.4;
    draft.add(upper);

    return ctx.merge(draft);
  },
};
