/**
 * The people: one parametric body, and everything that makes two of them
 * different.
 *
 * A person is built against `AVATAR_HEIGHT`, not in `STOREY`s, so changing
 * that height moves every person on the planet. A crowd needs far more
 * variants than the kit's six per part, so `personPool` caches
 * `PEOPLE_VARIANTS` bodies per region. Everything is a soft shape (`soft.ts`):
 * lathes and ellipsoids with smooth normals at a crowd's resolution.
 *
 * The pieces are in `people/`; this file re-exports them.
 */
export { buildPerson } from './people/build.ts';
export { BODY, CHILD_BODY } from './people/figure.ts';
export type { Figure } from './people/figure.ts';
export type { Age, Carry, Garment, Hair, Headwear, Look, Pose, Sleeves } from './people/look.ts';
export { POSES, SEATED_POSES } from './people/poses.ts';
export { PEOPLE_VARIANTS, crowd, personPool } from './people/crowd.ts';
export type { Bystander } from './people/crowd.ts';
