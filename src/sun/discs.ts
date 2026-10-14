/** The sun and moon discs: how far away they are drawn, and how big. */
import { PLANET_RADIUS } from '../globe.ts';
import { DEG } from './astronomy.ts';

/**
 * How far out the two discs hang. Up at the plane's ceiling the camera is 2.45
 * radii from the centre, so the far limb of the planet is 35,800 units away and
 * a moon placed nearer than that in its bearing would be drawn in front of the
 * Earth, pasted on its rim. The bound is the furthest point of the planet from
 * the furthest the camera goes (39,200 + 16,000), so anything past 55,200 is
 * always behind the world and the depth buffer sorts the rest. Five radii is
 * inside the camera's 160,000 far plane and the dome's own six.
 */
export const SKY_DISTANCE = PLANET_RADIUS * 5;

/**
 * Angular radius of both discs. The real sun and moon subtend almost exactly
 * the same half a degree, and that equality is worth keeping; the absolute size
 * is not (half a degree on a 55 degree lens is a 13-pixel speck), so both are
 * drawn at 1.1 degrees.
 */
const DISC_ANGLE = 1.1 * DEG;
export const DISC_RADIUS = SKY_DISTANCE * Math.tan(DISC_ANGLE);

/**
 * The maria, as flat circles floating a thousandth of a radius off the moon's
 * face. Without them a cream dot this size reads as a fat star. They float
 * rather than inlay because two coplanar meshes get no ink between them, while
 * a circle standing off a curved surface gets its own line all the way round.
 */
export const MARIA: readonly (readonly [number, number, number])[] = [
  [-0.30, 0.26, 0.27],
  [0.24, 0.34, 0.19],
  [0.14, -0.32, 0.24],
];
