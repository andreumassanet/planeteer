import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * The Registan, Samarkand.
 *
 * Three madrasas facing each other round a paved square, and the square is the
 * monument: Ulugh Beg on the west, Sher-Dor on the east, Tilya-Kori across the
 * north side between them, the open south side towards the viewer. What names
 * it, in order: three giant portal screens (pishtaq) with deep pointed iwans,
 * each framed in turquoise; the minarets at the side madrasas' corners; the
 * ribbed turquoise domes (two over Sher-Dor's wings, one big one over
 * Tilya-Kori's mosque); and the two-storey arcades of niches either side of
 * every portal.
 *
 * The real square is about 100 m across under 35 m portals; here it is 30
 * units under 21-unit portals and 26-unit minarets, a vertical stretch of about
 * 2.3x so each madrasa keeps the proportions of its own photograph rather
 * than of the plan. Turquoise is `skyBlue`; the brick is `sand`; the niches are
 * `brown`, warm enough to stay a recess in shade. Sher-Dor's tigers are two
 * `orange` suns in its spandrels.
 */

const DEG = Math.PI / 180;

/** The square: half-width of the paving, which is where the façades stand. */
const SQUARE = 15;
/** The wings: height and depth behind the façade. */
const WING = 9.5;
const DEPTH = 6;
/** The portal screen. */
const PORTAL = { width: 11, height: 21, depth: 3.4 };
const MINARET = { radius: 1.35, height: 26 };

interface Madrasa {
  /** Length of the façade. */
  length: number;
  /** Domes behind the wings, as [x along the façade, radius]. */
  domes: [x: number, r: number][];
  minarets: boolean;
  suns: boolean;
}

export const registan: Monument = {
  id: 'registan',
  name: 'The Registan',
  iso: 'UZB',
  lat: 39.6548,
  lon: 66.9758,
  tier: 'building',
  surface: 'brick',
  surfaces: { skyBlue: 'roof' },
  footprint: 30,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, column, taper } = ctx;
    const draft = new THREE.Group();
    const brick = palette.sand;
    const tile = palette.skyBlue;
    const deepTile = tone(palette.skyBlue, 0.78);
    const niche = palette.brown;
    const iwan = tone(palette.brown, 0.75);

    /** A pointed arch head: a triangle with its base on y = 0, squashed by its parent. */
    const pointed = (width: number, rise: number, depth: number, color: number): Object3D => {
      const squash = new THREE.Group();
      squash.scale.set(width / 1.1547, rise, depth);
      const prism = column(1 / 3, 1, color, 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, 1 / 3, -0.5);
      squash.add(prism);
      return squash;
    };

    /** A ribbed melon dome on its drum, standing on y = 0. */
    const dome = (r: number): Object3D => {
      const g = new THREE.Group();
      const drum = column(r * 0.82, r * 0.7, tone(palette.sand, 0.92), 10);
      g.add(drum);
      const band = column(r * 0.82 + PROUD, r * 0.18, tile, 10);
      band.position.y = r * 0.52;
      g.add(band);
      const profile: [y: number, r: number][] = [[0, 0.86], [0.45, 1.0], [0.95, 0.88], [1.35, 0.55], [1.6, 0.12]];
      for (let i = 1; i < profile.length; i++) {
        const [ya, ra] = profile[i - 1]!;
        const [yb, rb] = profile[i]!;
        const course = taper(ra * r, rb * r, (yb - ya) * r, tile, 10);
        course.position.y = r * 0.7 + ya * r;
        g.add(course);
      }
      const finial = column(0.14, r * 0.5, palette.gold, 4);
      finial.position.y = r * 0.7 + 1.6 * r;
      g.add(finial);
      return g;
    };

    /** A minaret with turquoise bands and a gallery, standing on y = 0. */
    const minaret = (): Object3D => {
      const g = new THREE.Group();
      const shaft = taper(MINARET.radius, MINARET.radius * 0.82, MINARET.height, brick, 8);
      g.add(shaft);
      for (let k = 1; k <= 3; k++) {
        const y = (MINARET.height * k) / 4;
        const r = MINARET.radius - (MINARET.radius * 0.18 * y) / MINARET.height;
        const band = column(r + PROUD, 1.0, k % 2 ? tile : deepTile, 8);
        band.position.y = y;
        g.add(band);
      }
      const gallery = taper(MINARET.radius * 0.95, MINARET.radius * 1.35, 1.2, tile, 8);
      gallery.position.y = MINARET.height;
      g.add(gallery);
      const cap = taper(MINARET.radius * 1.2, MINARET.radius * 1.1, 0.5, brick, 8);
      cap.position.y = MINARET.height + 1.2;
      g.add(cap);
      return g;
    };

    /** One madrasa in its own frame: façade on z = 0 facing +Z, centred on x = 0. */
    const madrasa = ({ length, domes, minarets, suns }: Madrasa): Object3D => {
      const g = new THREE.Group();
      const body = box(length, WING, DEPTH, brick);
      body.position.z = -DEPTH / 2;
      g.add(body);
      const parapet = box(length + 0.2, 0.9, 0.4, tile);
      parapet.position.set(0, WING - 1.4, PROUD + 0.2);
      g.add(parapet);
      // Two storeys of niches either side of the portal.
      const run = (length - PORTAL.width) / 2;
      const per = Math.max(2, Math.round(run / 3.4));
      for (const side of [-1, 1]) {
        for (let k = 0; k < per; k++) {
          const x = side * (PORTAL.width / 2 + (run * (k + 0.5)) / per);
          for (const [y, h] of [[1.2, 3.2], [5.0, 2.8]] as const) {
            const n = box((run / per) * 0.62, h, 0.3, niche);
            n.position.set(x, y, 0.15);
            g.add(n);
            const head = pointed((run / per) * 0.62, 0.9, 0.3, niche);
            head.position.set(x, y + h, 0.15);
            g.add(head);
          }
        }
      }
      // The portal screen: brick, a turquoise frame, the iwan cut into it.
      const screen = box(PORTAL.width, PORTAL.height, PORTAL.depth, brick);
      screen.position.z = -PORTAL.depth / 2 + 1.4;
      g.add(screen);
      const front = 1.4 + PROUD;
      const frame = box(PORTAL.width - 1.2, PORTAL.height - 2.2, 0.2, tile);
      frame.position.set(0, 1.0, front);
      g.add(frame);
      const field = box(PORTAL.width - 2.6, PORTAL.height - 4.4, 0.2, brick);
      field.position.set(0, 1.0, front + PROUD);
      g.add(field);
      const archW = PORTAL.width - 4.6;
      const springY = PORTAL.height * 0.52;
      const opening = box(archW, springY, 0.2, iwan);
      opening.position.set(0, 0, front + PROUD * 2);
      g.add(opening);
      const archHead = pointed(archW, PORTAL.height * 0.2, 0.2, iwan);
      archHead.position.set(0, springY, front + PROUD * 2 + 0.1);
      g.add(archHead);
      const door = box(archW * 0.45, springY * 0.45, 0.2, tone(palette.bark, 1.1));
      door.position.set(0, 0, front + PROUD * 3);
      g.add(door);
      const cornice = box(PORTAL.width + 0.3, 0.8, PORTAL.depth + 0.3, deepTile);
      cornice.position.set(0, PORTAL.height, -PORTAL.depth / 2 + 1.4);
      g.add(cornice);
      if (suns) {
        for (const side of [-1, 1]) {
          const sun = column(1.1, 0.2, palette.orange, 10);
          sun.rotation.x = Math.PI / 2;
          sun.position.set(side * (archW / 2 + 0.25), springY + PORTAL.height * 0.12, front + PROUD);
          g.add(sun);
        }
      }
      // Corner minarets, standing proud of the façade's ends.
      if (minarets) {
        for (const side of [-1, 1]) {
          const m = minaret();
          m.position.set(side * (length / 2 + 0.4), 0, 0);
          g.add(m);
        }
      }
      for (const [x, r] of domes) {
        const d = dome(r);
        d.position.set(x, WING, -DEPTH / 2 - 0.5);
        g.add(d);
      }
      return g;
    };

    // The paving.
    const paving = box(SQUARE * 2, 0.3, SQUARE * 2, tone(palette.sand, 0.86));
    draft.add(paving);

    // Ulugh Beg on the west (-X), facing east across the square.
    const ulughBeg = madrasa({ length: 27, domes: [], minarets: true, suns: false });
    ulughBeg.rotation.y = 90 * DEG;
    ulughBeg.position.set(-SQUARE, 0, -1.5);
    draft.add(ulughBeg);

    // Sher-Dor on the east (+X), its mirror, with its domes and its suns.
    const sherDor = madrasa({ length: 27, domes: [[-9.5, 3.2], [9.5, 3.2]], minarets: true, suns: true });
    sherDor.rotation.y = -90 * DEG;
    sherDor.position.set(SQUARE, 0, -1.5);
    draft.add(sherDor);

    // Tilya-Kori across the north side, with the mosque's big dome on its left.
    const tilyaKori = madrasa({ length: 23, domes: [[-7.5, 4.4]], minarets: false, suns: false });
    tilyaKori.position.set(0, 0, -SQUARE - 1);
    draft.add(tilyaKori);

    return ctx.merge(draft);
  },
};
