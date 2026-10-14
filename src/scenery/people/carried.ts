import type { SceneryContext } from '../contract.ts';
import { BODY } from './figure.ts';
import type { Look } from './look.ts';
import { SEATED_POSES } from './poses.ts';
import { softOf, type Bones, type Scaled } from './scaled.ts';

/**
 * What a person is carrying: the third silhouette lever, the one that says what
 * they are doing.
 *
 * Every load is parented to the trunk and none to a hand: a hand's frame turns
 * with the elbow, so a basket parented to it would lie down flat the moment the
 * forearm comes up, which is the pose a basket is carried in. `dress.ts`
 * chooses a pose whose arms arrive at the load: `headload` is paired with
 * `lift`, `basket` with `carry`. The hands do not grip anything; at the
 * distance a person is seen they do not have to.
 */
export function buildCarried(ctx: SceneryContext, look: Look, f: Scaled, bones: Bones): void {
  const { lathe, ellipsoid, rounded } = softOf(ctx);
  const k = f.height / BODY.height;
  const half = f.headHalf;
  const waistY = f.waist - f.hip;

  switch (look.carry) {
    case 'none':
      break;
    // The hero's own bag, kept narrower than the shoulders for the hero's own
    // reason: the camera lives behind a walking person and a pack as wide as
    // the back hides the arms that do the walking.
    case 'pack': {
      const bag = rounded(f.chestHalf * 1.3, f.chestHalf * 1.5, f.depth * 0.95, 0.2 * k, look.accent);
      bag.position.set(0, waistY + f.chestHalf * 0.12, -f.depth * 1.5);
      bones.upper.add(bag);
      break;
    }
    // At the hip on a strap that crosses the chest: the strap is what makes it a
    // bag somebody is wearing rather than a box stuck to their side.
    case 'satchel': {
      const bag = rounded(f.chestHalf * 0.95, f.chestHalf * 0.85, f.depth * 0.62, 0.12 * k, look.accent);
      bag.position.set(f.hipHalf * 1.02, waistY * 0.2, f.depth * 0.4);
      bones.upper.add(bag);
      const V = (x: number, yy: number, z: number) => new ctx.THREE.Vector3(x, yy, z);
      const { band } = softOf(ctx);
      const shoulder = V(-f.chestHalf * 0.5, f.shoulder - f.hip + 0.04 * k, 0);
      const across = V(f.chestHalf * 0.1, f.chest - f.hip - 0.2 * k, f.depth * 1.08);
      const down = V(f.hipHalf * 1.0, waistY * 0.2 + f.chestHalf * 0.8, f.depth * 0.62);
      bones.upper.add(band(shoulder, across, 0.14 * k, 0.07 * k, look.trim), band(across, down, 0.14 * k, 0.07 * k, look.trim));
      break;
    }
    // Held in front at waist height, which is where the `carry` pose puts both
    // forearms.
    case 'basket': {
      const pot = lathe(
        [
          [f.hipHalf * 0.6, 0],
          [f.hipHalf * 0.86, f.hipHalf * 0.6],
          [f.hipHalf * 0.94, f.hipHalf * 1.05],
        ],
        look.accent,
      );
      pot.position.set(0, waistY * 0.55, f.depth * 1.6);
      bones.upper.add(pot);
      break;
    }
    // On the head, which needs the arms up to steady it — paired with `lift`
    // and with nothing else.
    case 'headload': {
      const load = lathe(
        [
          [half * 0.78, 0],
          [half * 1.04, half * 0.5],
          [half * 1.0, half * 1.05],
        ],
        look.accent,
      );
      load.position.y = bones.crownY + 0.04 * k;
      bones.upper.add(load);
      break;
    }
    // 0.2 across, which is just over `LEGIBLE_AT(40)`'s 0.17 and reads much
    // further than that anyway — because the ink is *screen space*: a stick this
    // thin is two pixels of pen against the sky at any distance, and the pen is
    // what you see. Placed from the hip rather than from the hand for the reason
    // in the note above; a staff that swung with the arm would be a wand.
    case 'staff': {
      // How far it is to the ground, and it is not the hip height when the
      // person is sitting: the `sit` pose moves the origin to the seat surface,
      // so `-hip` would hang the staff 1.66 units under the bench.
      const drop = SEATED_POSES.has(look.pose) ? f.shin + f.ankle : f.hip;
      const pole = lathe(
        [
          [0.1, 0],
          [0.1, drop + f.chestHalf * 2.6 - 0.12],
          [0.14, drop + f.chestHalf * 2.6],
        ],
        look.trim,
        { sides: 6 },
      );
      pole.position.set(f.hipHalf * 1.5, -drop + 0.02, f.depth * 0.5);
      bones.upper.add(pole);
      break;
    }
    case 'jug': {
      const jug = lathe(
        [
          [half * 0.42, 0],
          [half * 0.72, half * 0.5],
          [half * 0.6, half * 0.98],
          [half * 0.3, half * 1.16],
          [half * 0.36, half * 1.3],
        ],
        look.accent,
      );
      jug.position.set(f.shoulderHalf * 0.92, waistY + half * 0.8, 0);
      bones.upper.add(jug);
      break;
    }
    // The one load that reads from directly overhead, which is the plane's view
    // of a street. The canopy is sized off the person's *height* rather than
    // their girth, because a stout person with a proportionally wider parasol is
    // the case that walks out of the declared footprint.
    case 'parasol': {
      const lift = bones.crownY + f.head * 0.28;
      const shaft = lathe([[0.09, 0], [0.09, lift + f.height * 0.05]], look.trim, { sides: 6 });
      shaft.position.set(f.hipHalf * 0.8, waistY * 0.1, f.depth * 0.35);
      bones.upper.add(shaft);
      const canopy = lathe(
        [
          [f.height * 0.125, 0],
          [f.height * 0.11, f.height * 0.025],
          [0, f.height * 0.06],
        ],
        look.accent,
        { sides: 14 },
      );
      canopy.position.set(f.hipHalf * 0.8, lift, f.depth * 0.35);
      bones.upper.add(canopy);
      break;
    }
    // Squashed front to back rather than round, and it is a *footprint* fix
    // before it is a shape one: a load on the back is the furthest thing from
    // the body's own axis, and an elder's 0.19 of stoop swings its top corner
    // another 0.4 units further out. A round bundle at the obvious offset
    // measured 2.92 against a declared 2.4.
    case 'bundle': {
      const load = ellipsoid(f.chestHalf * 0.98, f.chestHalf * 0.72, f.chestHalf * 0.5, look.accent, { rings: 6 });
      load.position.set(0, waistY + f.chestHalf * 0.95, -f.depth * 1.35);
      bones.upper.add(load);
      break;
    }
  }
}
