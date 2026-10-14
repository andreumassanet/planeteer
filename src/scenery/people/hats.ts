import type { HeadKit } from './head.ts';

/**
 * The hat. The first five take the hair's place and cover the skull from the
 * brow up; the cap, brim and cone sit on the hair, clearing its mass (top at
 * the head's height, widest 1.12 of the half-width).
 */
export function addHeadwear(kit: HeadKit): void {
  const { look, f, head, w, h, lathe, ellipsoid } = kit;
  const accent = look.accent;
  switch (look.headwear) {
    case 'none':
      break;
    case 'beanie':
      head.add(
        lathe(
          [
            [w * 1.08, h * 0.52],
            [w * 1.12, h * 0.64],
            [w * 0.98, h * 0.86],
            [w * 0.55, h * 1.0],
            [0, h * 1.04],
          ],
          accent,
          { depth: f.headDepth * 1.02, sides: 12 },
        ),
      );
      break;
    case 'helmet':
      head.add(
        lathe(
          [
            [w * 1.18, h * 0.54],
            [w * 1.2, h * 0.64],
            [w * 1.06, h * 0.84],
            [w * 0.62, h * 1.02],
            [0, h * 1.06],
          ],
          accent,
          { depth: f.headDepth, sides: 12 },
        ),
      );
      break;
    case 'turban':
      head.add(
        lathe(
          [
            [w * 1.02, h * 0.55],
            [w * 1.2, h * 0.68],
            [w * 1.18, h * 0.9],
            [w * 0.82, h * 1.08],
            [0, h * 1.13],
          ],
          accent,
          { depth: f.headDepth, sides: 12 },
        ),
      );
      break;
    // A cowl round the whole head, open only at the face, standing out behind the skull.
    case 'hood': {
      const cowl = ellipsoid(w * 1.32, h * 0.6, w * 1.42, accent, { sides: 14, rings: 6 });
      cowl.position.set(0, h * 0.5, -w * 0.52);
      head.add(cowl);
      break;
    }
    // Over the head and falling past the jaw onto the shoulders.
    case 'scarf': {
      const cover = ellipsoid(w * 1.18, h * 0.54, w * 1.26, accent, { sides: 14, rings: 6 });
      cover.position.set(0, h * 0.52, -w * 0.32);
      head.add(cover);
      const shawl = lathe(
        [
          [w * 1.52, -h * 0.32],
          [w * 1.4, -h * 0.2],
          [w * 0.94, h * 0.12],
          [0, h * 0.3],
        ],
        accent,
        { depth: 0.9, sides: 12 },
      );
      shawl.position.z = -w * 0.14;
      head.add(shawl);
      break;
    }
    case 'cap': {
      head.add(
        lathe(
          [
            [w * 1.16, h * 0.7],
            [w * 1.1, h * 0.86],
            [w * 0.72, h * 1.03],
            [0, h * 1.08],
          ],
          look.trim,
          { depth: f.headDepth, sides: 12 },
        ),
      );
      const peak = ellipsoid(w * 0.74, h * 0.035, w * 0.55, look.trim, { sides: 10, rings: 3 });
      peak.position.set(0, h * 0.72, w * 1.02);
      head.add(peak);
      break;
    }
    case 'brim': {
      head.add(
        lathe(
          [
            [w * 1.04, h * 0.8],
            [w * 0.98, h * 1.06],
            [0, h * 1.12],
          ],
          accent,
          { sides: 12 },
        ),
      );
      const brim = ellipsoid(w * 1.8, h * 0.035, w * 1.8, accent, { sides: 14, rings: 3 });
      brim.position.y = h * 0.8;
      head.add(brim);
      break;
    }
    // One mesh and the widest silhouette in the kit: a cone wider than the shoulders.
    case 'conical':
      head.add(
        lathe(
          [
            [w * 2.02, h * 0.82],
            [w * 1.62, h * 0.9],
            [w * 0.12, h * 1.36],
            [0, h * 1.38],
          ],
          accent,
          { sides: 12 },
        ),
      );
      break;
  }
}
