import type { Ring } from '../../soft.ts';
import type { Group, SceneryContext } from '../contract.ts';
import { addHair } from './hair.ts';
import { addHeadwear } from './hats.ts';
import type { Look } from './look.ts';
import { COVERS_HAIR, softOf } from './scaled.ts';
import type { Scaled } from './scaled.ts';

/** What the hair and hat builders share: the head's size and the soft shapes to build it from. */
export interface HeadKit {
  look: Look;
  f: Scaled;
  head: Group;
  /** The head's half-width and height. */
  w: number;
  h: number;
  /** How far forward the skull's surface is at `(x, at)`, for placing features on the face. */
  faceZ(x: number, at: number): number;
  lathe: ReturnType<typeof softOf>['lathe'];
  ellipsoid: ReturnType<typeof softOf>['ellipsoid'];
}

/**
 * The head: skull, eyes, hair, beard and hat, all on the head pivot so they
 * turn with it.
 *
 * The hair is a mass set back and up from the skull so the face comes out
 * through it in front. A hat that covers the hair replaces the mass instead of
 * sitting just outside it: two nearly coplanar surfaces lose the depth test and
 * draw no ink.
 */
export function buildHead(ctx: SceneryContext, look: Look, f: Scaled, head: Group): void {
  const { lathe, ellipsoid } = softOf(ctx);
  const w = f.headHalf;
  const h = f.head;

  /** The skull, as fractions of the head's half-width and height. */
  const SKULL: readonly Ring[] = [
    [0, -0.01],
    [0.62, 0.08],
    [0.96, 0.32],
    [0.94, 0.62],
    [0.58, 0.85],
    [0, 0.9],
  ].map(([r, at]) => [r! * w, at! * h] as const);
  const skullAt = (at: number): number => {
    for (let i = 0; i + 1 < SKULL.length; i++) {
      const [r0, y0] = SKULL[i]!;
      const [r1, y1] = SKULL[i + 1]!;
      if (at >= y0 && at <= y1) return r0 + ((r1 - r0) * (at - y0)) / (y1 - y0);
    }
    return 0;
  };
  const faceZ = (x: number, at: number): number =>
    Math.sqrt(Math.max(0, skullAt(at) ** 2 - x * x)) * f.headDepth;

  head.add(
    lathe(SKULL, look.skin, {
      sides: 14,
      depth: f.headDepth,
      warp: (v) => {
        if (v.y < 0.3 * h && v.z > 0) v.z += (0.3 * h - v.y) * 0.12;
      },
    }),
  );

  // Two dark ovals, sunk half into the face: all the face there is at this size.
  for (const side of [1, -1]) {
    const eye = ellipsoid(w * 0.11, w * 0.17, w * 0.07, ctx.palette.ink, { sides: 6, rings: 3 });
    eye.position.set(side * w * 0.37, h * 0.42, faceZ(w * 0.37, h * 0.42) - w * 0.02);
    head.add(eye);
  }

  const kit: HeadKit = { look, f, head, w, h, faceZ, lathe, ellipsoid };
  if (!COVERS_HAIR.has(look.headwear) && look.hair !== 'bald') addHair(kit);

  if (look.beard) {
    const beard = ellipsoid(w * 0.8, h * 0.2, w * 0.55, look.hairColor, { sides: 10, rings: 5 });
    beard.position.set(0, h * 0.13, w * 0.46);
    head.add(beard);
  }

  addHeadwear(kit);
}
