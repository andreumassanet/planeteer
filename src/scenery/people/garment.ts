import type { Ring } from '../../soft.ts';
import type { Mesh, SceneryContext } from '../contract.ts';
import { BODY } from './figure.ts';
import type { Look } from './look.ts';
import { SEATED_POSES } from './poses.ts';
import { softOf } from './scaled.ts';
import type { Scaled } from './scaled.ts';

/** What every garment is cut from: the person's proportions and the shared rings. */
interface Cut {
  look: Look;
  f: Scaled;
  /** Absolute sizes that do not follow a proportion follow the height. */
  k: number;
  /** Converts a height above the sole to `upper`'s frame. */
  y: (world: number) => number;
  /** The trunk's front-to-back scale: a body is a slab, not a totem pole. */
  depth: number;
  chestTop: number;
  lathe: ReturnType<typeof softOf>['lathe'];
  /** Clamps a hem: seated, cloth over the edge of a seat stops at about half a thigh. */
  hem(world: number): number;
  /** From the waist to the neck: the part of every upper garment that is the same. */
  chestRings(scale?: number): Ring[];
  /**
   * Hips and seat, in the trousers. Kept inside every garment that covers it
   * by about 0.07, or the two surfaces z-fight in a merged buffer.
   */
  pelvis(): Mesh;
  /** A shirt worn out, its hem just over the hip line. */
  shirt(color: number): Mesh;
}

function cutFor(ctx: SceneryContext, look: Look, f: Scaled, y: (world: number) => number): Cut {
  const { lathe } = softOf(ctx);
  const k = f.height / BODY.height;
  const chestTop = f.chest + (f.shoulder - f.chest) * 0.45;
  const depth = f.depth / f.chestHalf;
  const seat = f.waist - f.hip;
  // Every hem is a height above the sole; seated, the origin moves to the seat.
  const floor = SEATED_POSES.has(look.pose) ? f.hip - f.thigh * 0.45 : -Infinity;
  const chestRings = (scale = 1): Ring[] => [
    [f.waistHalf * scale, y(f.waist)],
    [f.chestHalf * scale, y(f.chest)],
    [f.chestHalf * 0.95 * scale, y(chestTop)],
    [f.shoulderHalf * 0.6, y(f.shoulder) - 0.02 * k],
    [f.headHalf * 0.46, y(f.shoulder) + 0.1 * k],
  ];
  return {
    look,
    f,
    k,
    y,
    depth,
    chestTop,
    lathe,
    hem: (world) => Math.max(world, floor),
    chestRings,
    pelvis: () =>
      lathe(
        [
          [f.hipHalf * 0.6, -seat * 0.6],
          [f.hipHalf * 0.9, -seat * 0.2],
          [f.hipHalf * 0.86, seat * 0.3],
          [f.hipHalf * 0.66, seat * 0.62],
          [f.hipHalf * 0.4, seat * 0.72],
        ],
        look.bottom,
        { depth },
      ),
    shirt: (color) =>
      lathe(
        [
          [f.hipHalf * 0.9, y(f.hip) - 0.02 * k],
          [f.hipHalf * 0.98, y(f.hip) + 0.08 * k],
          ...chestRings(),
        ],
        color,
        { depth, sides: 12 },
      ),
  };
}

/** A shirt that reaches mid-thigh. */
function tunic(c: Cut): Mesh[] {
  const { f, k, y } = c;
  const foot = c.hem(f.hip - f.thigh * 0.45);
  return [
    c.lathe(
      [
        [f.hipHalf * 1.08, y(foot)],
        [f.hipHalf * 1.12, y(foot) + 0.12 * k],
        [f.hipHalf * 1.02, y(f.hip)],
        ...c.chestRings(),
      ],
      c.look.top,
      { depth: c.depth, sides: 12 },
    ),
  ];
}

/** Ankle to shoulder in one flare; it replaces the trousers. */
function robe(c: Cut): Mesh[] {
  const { f, k, y } = c;
  const foot = c.hem(f.ankle * 0.7);
  return [
    c.lathe(
      [
        [f.hipHalf * 1.5, y(foot)],
        [f.hipHalf * 1.56, y(foot) + 0.14 * k],
        [f.hipHalf * 1.2, y(Math.max(foot + 0.3 * k, f.hip - f.thigh * 0.4))],
        [f.hipHalf * 1.02, y(f.hip)],
        ...c.chestRings(1.02),
      ],
      c.look.top,
      { depth: c.depth * 1.04, sides: 12 },
    ),
  ];
}

function dress(c: Cut): Mesh[] {
  const { f, k, y } = c;
  const foot = c.hem(f.hip - f.thigh * 0.92);
  return [
    c.lathe(
      [
        [f.hipHalf * 1.46, y(foot)],
        [f.hipHalf * 1.5, y(foot) + 0.12 * k],
        [f.hipHalf * 1.14, y(Math.max(foot + 0.3 * k, f.hip - f.thigh * 0.3))],
        [f.waistHalf * 1.04, y(f.waist) - 0.1 * k],
        ...c.chestRings(),
      ],
      c.look.top,
      { depth: c.depth, sides: 12 },
    ),
  ];
}

/** A trunk whose hem stands out past the hips it hangs off. */
function coat(c: Cut): Mesh[] {
  const { f, k, y } = c;
  const foot = c.hem(f.hip - f.thigh * 0.62);
  return [
    c.pelvis(),
    c.lathe(
      [
        [f.hipHalf * 1.16, y(foot)],
        [f.hipHalf * 1.22, y(foot) + 0.12 * k],
        [f.hipHalf * 1.08, y(f.hip)],
        ...c.chestRings(1.06),
      ],
      c.look.top,
      { depth: c.depth, sides: 12 },
    ),
  ];
}

/** A plain shirt and a wrap of bright cloth round the hips, which reads as an apron from every side. */
function apron(c: Cut): Mesh[] {
  const { f, k, y } = c;
  const foot = c.hem(f.hip - f.thigh * 0.55);
  return [
    c.pelvis(),
    c.shirt(c.look.top),
    c.lathe(
      [
        [f.hipHalf * 1.1, y(foot)],
        [f.hipHalf * 1.06, y(f.hip)],
        [f.waistHalf * 1.07, y(f.waist)],
        [f.waistHalf * 1.02, y(f.waist) + 0.08 * k],
      ],
      c.look.accent,
      { depth: c.depth, sides: 12 },
    ),
  ];
}

/** A sheet over the shoulders, wider than they are; it reads from directly above. */
function poncho(c: Cut): Mesh[] {
  const { f, k, y } = c;
  const drop = (c.chestTop - f.waist) * 0.85;
  return [
    c.pelvis(),
    c.shirt(c.look.top),
    c.lathe(
      [
        [f.shoulderHalf * 1.3, y(f.chest) - drop],
        [f.shoulderHalf * 1.24, y(f.chest) - drop * 0.6],
        [f.shoulderHalf * 1.02, y(f.shoulder)],
        [f.headHalf * 0.55, y(f.shoulder) + 0.14 * k],
      ],
      c.look.accent,
      { depth: 0.8, sides: 12 },
    ),
  ];
}

/**
 * The garment, which is most of what a person is at any distance over 60 units.
 *
 * Each garment is one or two lathes of the whole trunk, so a hem is a flare in
 * the profile rather than a second box laid over the first. Everything is in
 * `upper` coordinates; `y` converts from heights above the sole.
 */
export function buildGarment(ctx: SceneryContext, look: Look, f: Scaled, y: (world: number) => number): Mesh[] {
  const c = cutFor(ctx, look, f, y);
  let pieces: Mesh[] = [];
  switch (look.garment) {
    case 'shirt':
      pieces = [c.pelvis(), c.shirt(look.top)];
      break;
    case 'tunic':
      pieces = tunic(c);
      break;
    case 'robe':
      pieces = robe(c);
      break;
    case 'dress':
      pieces = dress(c);
      break;
    case 'coat':
      pieces = coat(c);
      break;
    case 'apron':
      pieces = apron(c);
      break;
    case 'poncho':
      pieces = poncho(c);
      break;
  }
  // A carried pack wants its straps, and they are the garment's to draw.
  if (look.carry === 'pack') {
    const { rounded } = softOf(ctx);
    for (const side of [1, -1]) {
      const strap = rounded(0.22 * c.k, (f.shoulder - f.waist) * 0.9, 0.1 * c.k, 0.04 * c.k, look.trim, 2);
      strap.position.set(side * f.chestHalf * 0.46, y(f.waist) + 0.02 * c.k, f.depth * 1.0);
      strap.rotation.x = -0.1;
      pieces.push(strap);
    }
  }
  return pieces;
}
