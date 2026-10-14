import type { HeadKit } from './head.ts';

/**
 * The hair: a mass behind and above the skull plus whatever the style hangs
 * off it. Called only when no hat takes the hair's place.
 */
export function addHair(kit: HeadKit): void {
  const { look, f, head, w, h, faceZ, lathe, ellipsoid } = kit;
  const color = look.hairColor;
  const fringe = (): void => {
    const bang = ellipsoid(w * 0.78, h * 0.12, w * 0.3, color, { sides: 10, rings: 4 });
    bang.position.set(0, h * 0.72, faceZ(0, h * 0.72) - w * 0.16);
    bang.rotation.set(-0.3, 0, 0.14);
    head.add(bang);
  };
  const mass = (rx: number, ry: number, rz: number, at: number, back: number): void => {
    const piece = ellipsoid(w * rx, h * ry, w * rz, color, { sides: 14, rings: 5 });
    piece.position.set(0, h * at, -w * back);
    head.add(piece);
  };

  switch (look.hair) {
    case 'afro':
      // Changes the head's own outline: set well back so the face still comes out in front.
      mass(1.42, 0.52, 1.36, 0.62, 0.42);
      break;
    case 'bob':
      // Down to the jaw at the sides and back, framing the face.
      mass(1.2, 0.56, 1.22, 0.46, 0.28);
      fringe();
      break;
    default:
      mass(1.12, 0.41, 1.18, 0.59, 0.24);
      if (look.hair !== 'topknot') fringe();
      break;
  }

  switch (look.hair) {
    // Falls down the back, past the collar, behind the trunk.
    case 'long': {
      const fall = lathe(
        [
          [0, -h * 0.85],
          [w * 0.62, -h * 0.72],
          [w * 0.95, -h * 0.2],
          [w * 0.9, h * 0.25],
          [0, h * 0.45],
        ],
        color,
        { depth: 0.45, sides: 10 },
      );
      fall.position.set(0, h * 0.4, -Math.max(w * 1.08, f.depth * 1.12));
      head.add(fall);
      break;
    }
    case 'bun': {
      const knot = ellipsoid(w * 0.4, w * 0.38, w * 0.38, color, { sides: 10, rings: 5 });
      knot.position.set(0, h * 0.8, -w * 1.2);
      head.add(knot);
      break;
    }
    case 'topknot': {
      const knot = ellipsoid(w * 0.3, w * 0.38, w * 0.3, color, { sides: 10, rings: 5 });
      knot.position.set(0, h * 1.02, -w * 0.12);
      head.add(knot);
      break;
    }
    case 'braid': {
      const braid = lathe(
        [
          [0, -h * 0.95],
          [w * 0.2, -h * 0.8],
          [w * 0.22, -h * 0.1],
          [w * 0.28, h * 0.2],
          [0, h * 0.32],
        ],
        color,
        { sides: 8 },
      );
      braid.position.set(0, h * 0.34, -Math.max(w * 1.12, f.depth * 1.18));
      head.add(braid);
      break;
    }
    default:
      break;
  }
}
