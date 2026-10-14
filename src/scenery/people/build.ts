import type { Group, SceneryContext } from '../contract.ts';
import { buildArms, buildLegs, buildShoulders, resolveStance } from './body.ts';
import { buildCarried } from './carried.ts';
import { BODY, CHILD_BODY } from './figure.ts';
import { buildGarment } from './garment.ts';
import { buildHead } from './head.ts';
import type { Look } from './look.ts';
import { scaleFigure } from './scaled.ts';


/**
 * One person, from a `Look` and nothing else.
 *
 * The returned `Group` obeys the scenery contract for every pose but one:
 * `sit` puts the origin at the seat surface (the hip joint at y = 0, +Z the
 * way the person faces), the coordinate a bench, saddle or car seat already
 * has. A seated person is therefore not a valid `ScenicPart`.
 *
 * The joints are fixed: the root holds two hips and a trunk, the trunk holds
 * two shoulders and a head, and each hip and shoulder holds exactly one
 * `Group`, its second joint. `rigOf` in `life.ts` finds the walker's skeleton
 * by that shape. Every load, strap and hat is a `Mesh`, never a group.
 */
export function buildPerson(ctx: SceneryContext, look: Look): Group {
  const { THREE } = ctx;
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const base = look.age === 'child' ? CHILD_BODY : BODY;
  const f = scaleFigure(base, look.height, look.girth);
  const st = resolveStance(look, f);

  buildLegs(ctx, look, f, root, st);

  const upper = new THREE.Group();
  upper.position.y = f.hip;
  upper.rotation.x = st.lean;
  root.add(upper);

  // Local Y inside `upper` is measured from the hip.
  const y = (world: number): number => world - f.hip;

  for (const piece of buildGarment(ctx, look, f, y)) upper.add(piece);
  buildShoulders(ctx, look, f, upper, y);

  const headPivot = new THREE.Group();
  headPivot.position.y = y(f.chin);
  headPivot.rotation.y = st.pose.turn + look.sway * 0.22;
  upper.add(headPivot);
  buildHead(ctx, look, f, headPivot);

  buildArms(ctx, look, f, upper, y, st);
  buildCarried(ctx, look, f, { upper, crownY: y(f.chin) + f.head });

  // Standing, the body is dropped onto its own lowest point so a pose that
  // lifts a heel can never float. Seated, the origin is the seat surface. The
  // bounds are `precise`: a rotated ellipsoid's loose box has corners far
  // outside it.
  if (st.seated) {
    root.position.y = -f.hip;
  } else {
    const bounds = new THREE.Box3().setFromObject(root, true);
    root.position.y = -bounds.min.y;
  }
  return group;
}
