import { RIDDEN_SECTION } from '../contract.ts';
import type { Group, TrafficContext, Vehicle } from '../contract.ts';

/**
 * Scooter: a step-through, the most common vehicle in several regions.
 *
 * The silhouette is a flat floorboard between the wheels behind a legshield
 * that rises to the bars, and one rounded cowl over the back wheel with the
 * seat on it; the daylight over the floorboard tells it from a bicycle at
 * distance. Pieces of one colour are merged into one mesh by `merge`; the
 * tyres stay separate so a taken scooter turns them
 * (`craft/traffic-craft.ts`), and so does the lamp, which is lit.
 */

const WHEEL = 0.3;

export const scooter: Vehicle = {
  id: 'scooter',
  name: 'Scooter',
  kind: 'cycle',
  size: [2.5, 0.78, 1.54],
  // Ridden by the hero's own size: placed as the craft that takes it.
  section: RIDDEN_SECTION,
  note: 'A step-through with a floorboard, a legshield and a rounded cowl. Weighted above every car in three regions.',

  mounts: [
    {
      x: 0,
      y: 1.05,
      z: -0.36,
      yaw: 0,
      pose: 'astride',
      driver: true,
      headroom: Infinity,
      // Down to the floorboard, 0.4 up, not the ground.
      legroom: 0.65,
      beam: Infinity,
      footrest: [0.2, 0.42, 0.24],
      // A forearm over the seat on a raked column: ridden sitting up, hands at the chest.
      grip: [0, 1.45, 0.38],
      // The left rubber, out of the headset and swept a little back.
      bars: { at: [0.305, 1.45, 0.38], axis: [0.11, 0, -0.04] },
    },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel, strut, column, tone, merge } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();
    // Everything but the tyres and the lamp, merged by colour at the end.
    const draft = new THREE.Group();

    const paint = rng.pick(style.paint);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const rear = -0.78;
    const front = rng.range(0.9, 0.95);

    // What turns with the bars, merged on its own (`addFront`).
    const steer = new THREE.Group();
    for (const z of [rear, front]) {
      const tyre = wheel(WHEEL, 0.17, rubber);
      tyre.position.set(0, WHEEL, z);
      group.add(tyre);
      // The hub, a little wider than the tyre so both faces show it.
      const hub = column(WHEEL * 0.5, 0.22, metal, 8);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(0.11, WHEEL, z);
      (z === front ? steer : draft).add(hub);
    }

    // The floorboard between the wheels, with a dark mat where the feet go.
    const floor = solid({ color: paint, width: 0.5, topWidth: 0.46, depth: 0.8, height: 0.1 });
    floor.position.set(0, 0.3, 0.12);
    draft.add(floor);
    const mat = box(0.34, 0.03, 0.6, rubber);
    mat.position.set(0, 0.4, 0.14);
    draft.add(mat);

    // The cowl over the back wheel in two courses: a wide skirt, its tail
    // tucked up, and a narrower body stepping in from it to the seat.
    const skirt = solid({
      color: paint,
      width: 0.72,
      foreWidth: 0.5,
      topWidth: 0.68,
      topForeWidth: 0.5,
      depth: 0.92,
      height: 0.36,
      aftRise: 0.18,
      topAft: -0.38,
      topFore: 0.3,
    });
    skirt.position.set(0, 0.34, -0.66);
    draft.add(skirt);
    const body = solid({
      color: paint,
      width: 0.6,
      foreWidth: 0.46,
      topWidth: 0.38,
      topForeWidth: 0.34,
      depth: 0.94,
      height: 0.24,
      topAft: -0.36,
      topFore: 0.36,
    });
    body.position.set(0, 0.7, -0.7);
    draft.add(body);

    // The seat, one long dark pad, and a grab rail round its tail.
    const seat = solid({ color: rubber, width: 0.36, topWidth: 0.3, depth: 0.8, height: 0.13, topAft: -0.36, topFore: 0.36 });
    seat.position.set(0, 0.92, -0.46);
    draft.add(seat);
    for (const side of [-1, 1]) {
      draft.add(strut(new V(side * 0.17, 0.98, -0.78), new V(side * 0.15, 1.02, -1.02), 0.05, metal));
    }
    draft.add(strut(new V(-0.15, 1.02, -1.02), new V(0.15, 1.02, -1.02), 0.05, metal));

    // The legshield, a panel raked back with the steering and two wings
    // turned back round the knees; a grille strip down its face.
    const shield = solid({ color: paint, width: 0.4, topWidth: 0.26, depth: 0.16, height: 0.72, topAft: -0.08, topFore: 0.04 });
    shield.position.set(0, 0.36, 0.6);
    draft.add(shield);
    for (const side of [-1, 1]) {
      const wing = solid({ color: paint, width: 0.2, topWidth: 0.1, depth: 0.08, height: 0.6, topAft: -0.06, topFore: 0.02 });
      wing.position.set(side * 0.26, 0.38, 0.56);
      wing.rotation.y = side * 0.45;
      draft.add(wing);
    }
    const grille = box(0.1, 0.26, 0.05, tone(metal, 0.8));
    grille.position.set(0, 0.66, 0.67);
    draft.add(grille);

    addFront(ctx, steer, draft, paint, rubber, metal, front);

    // The exhaust low on the right, under the cowl.
    draft.add(strut(new V(-0.2, 0.3, -0.34), new V(-0.24, 0.34, -0.9), 0.12, metal));

    // A top box on half of them, on the rail over the tail.
    if (rng.chance(0.5)) {
      const cargo = rng.pick(style.cargo);
      const height = rng.range(0.28, 0.34);
      const boxTop = box(0.44, height, 0.38, cargo);
      boxTop.position.set(0, 1.03, -0.98);
      draft.add(boxTop);
      const lid = box(0.46, 0.06, 0.4, tone(cargo, 0.8));
      lid.position.set(0, 1.03 + height, -0.98);
      draft.add(lid);
    }

    for (const mesh of [...merge(draft).children]) group.add(mesh);
    // The bars, the headset, the fork and the fender, apart and named, so
    // the craft that takes it can turn them about the line from the front
    // hub up through the headset.
    // The lamp is lit and stays out of the merge.
    const lamps = steer.children.filter((child) => (child.userData.atlasLit ?? 0) > 0);
    for (const lamp of lamps) steer.remove(lamp);
    const fork = merge(steer);
    for (const lamp of lamps) fork.add(lamp);
    fork.name = 'fork';
    fork.userData.axis = { at: [0, WHEEL, front], tilt: Math.atan2(HEADSET_Z - front, HEADSET_Y - WHEEL) };
    group.add(fork);
    return group;
  },
};

/** The headset's middle, which the steering turns about with the front hub. */
const HEADSET_Y = 1.36;
const HEADSET_Z = 0.45;

/**
 * The front: a fender hugging the wheel, the steering column up to the
 * headset, a single-sided fork, and the headset with bars, grips, mirrors and
 * the lamp. All but the column go on `steer`, which turns.
 */
function addFront(
  ctx: TrafficContext,
  steer: Group,
  draft: Group,
  paint: number,
  rubber: number,
  metal: number,
  front: number,
): void {
  const { THREE, box, solid, strut, column, tone, lit } = ctx;
  const V = THREE.Vector3;
  // The fender is a run of short plates on the wheel's arc, each turned to
  // its own tangent; a wedge over a wheel reads as a beak.
  const arc = WHEEL + 0.025;
  const plates = 4;
  for (let i = 0; i < plates; i++) {
    const from = -0.7 + (1.9 * i) / plates;
    const to = -0.7 + (1.9 * (i + 1)) / plates;
    const mid = (from + to) / 2;
    const plate = box(0.26, 0.07, arc * (to - from) + 0.04, paint);
    plate.rotation.x = mid;
    plate.position.set(0, WHEEL + arc * Math.cos(mid), front + arc * Math.sin(mid));
    steer.add(plate);
  }
  draft.add(strut(new V(0, WHEEL * 2 + 0.14, front - 0.1), new V(0, 1.1, 0.66), 0.13, paint));
  // The column on up from the legshield's top to the headset, raked back.
  draft.add(strut(new V(0, 1.06, 0.66), new V(0, 1.36, 0.45), 0.1, paint));
  steer.add(strut(new V(0.11, WHEEL * 2 + 0.06, front - 0.04), new V(0.11, WHEEL, front), 0.06, metal));

  // The headset: painted, the bars coming out of it into dark grips, the
  // lamp in its face and a mirror either side.
  const headset = solid({ color: paint, width: 0.3, foreWidth: 0.26, topWidth: 0.24, topForeWidth: 0.2, depth: 0.26, height: 0.14 });
  headset.position.set(0, 1.34, 0.42);
  steer.add(headset);
  steer.add(strut(new V(-0.27, 1.45, 0.4), new V(0.27, 1.45, 0.4), 0.06, metal));
  for (const side of [-1, 1]) {
    steer.add(strut(new V(side * 0.25, 1.45, 0.4), new V(side * 0.36, 1.45, 0.36), 0.08, rubber));
    steer.add(strut(new V(side * 0.2, 1.47, 0.41), new V(side * 0.27, 1.53, 0.39), 0.035, metal));
    const mirror = box(0.12, 0.06, 0.04, metal);
    mirror.position.set(side * 0.29, 1.5, 0.39);
    steer.add(mirror);
  }
  const lamp = lit(column(0.08, 0.05, tone(metal, 1.3), 8));
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 1.4, 0.54);
  steer.add(lamp);
}
