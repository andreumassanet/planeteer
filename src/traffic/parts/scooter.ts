import type { Vehicle } from '../contract.ts';

/**
 * Scooter.
 *
 * **The most common vehicle on Earth and the one this kit would be wrong
 * without.** Three of the fourteen region tables weight it above every car put
 * together, and that one column does more for a Southeast Asian street than any
 * amount of modelling would: same geometry, same palette, a road that is
 * obviously not in Norway.
 *
 * A step-through, not a motorbike, and the difference is the whole silhouette:
 * the frame dives to a **flat floorboard between the wheels** behind a
 * **legshield** that rises to the bars, and the mass is one rounded cowl over
 * the back wheel with the seat on it — a tank in front of the rider is a
 * motorbike. That gap of daylight over the floorboard is what tells it from a
 * bicycle at 120 units, where neither has any resolvable detail left.
 *
 * What makes it a scooter up close rather than a wedge on two coins, each piece
 * chosen because it changes the outline or the ink: the cowl in two courses, a
 * wide skirt over the wheel and a narrower body stepping in from it, so the
 * back reads rounded; the legshield as a panel and two wings turned back round
 * the knees, with a grille strip down its face; a teardrop fender over the
 * front wheel on a single-sided fork; a painted headset carrying the lamp, the
 * bars coming out of it into dark grips, and two mirrors on stalks — the two
 * small marks that say *scooter* from any side. A hub in each wheel, because a
 * disc with nothing in it reads as a coin.
 *
 * **One mesh a colour.** Every piece of one colour is merged into one mesh by
 * the context (`merge`), which draws what the pieces would, so the detail costs
 * triangles and no draw calls; the tyres stay meshes of their own, because a
 * taken scooter turns them (`craft/traffic-craft.ts`), and so does the lamp,
 * which is lit at night and would lose the mark in a merge.
 */

const WHEEL = 0.3;

export const scooter: Vehicle = {
  id: 'scooter',
  name: 'Scooter',
  kind: 'cycle',
  size: [2.5, 0.78, 1.54],
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
      // The floorboard, not the ground: a scooter's rider has somewhere to put
      // his feet and it is 0.4 up.
      legroom: 0.65,
      beam: Infinity,
      footrest: [0.2, 0.42, 0.24],
      // The grips a forearm over the seat and well back from the legshield,
      // on a column raked back from it: a step-through is ridden sitting up,
      // the back near vertical and the hands at the chest. At the legshield's
      // top they were a hand over the seat and an arm and a half ahead of the
      // hip, and a body reaching for them lay along the cowl.
      grip: [0, 1.45, 0.38],
    },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel, strut, column, tone, lit, merge } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();
    // Everything but the tyres and the lamp, merged by colour at the end.
    const draft = new THREE.Group();

    const paint = rng.pick(style.paint);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const rear = -0.78;
    const front = rng.range(0.9, 0.95);

    for (const z of [rear, front]) {
      const tyre = wheel(WHEEL, 0.17, rubber);
      tyre.position.set(0, WHEEL, z);
      group.add(tyre);
      // The hub, across the axle and a little wider than the tyre, so both
      // faces show it. It does not turn with a taken scooter's tyre, and an
      // octagon about its own axle does not need to.
      const hub = column(WHEEL * 0.5, 0.22, metal, 8);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(0.11, WHEEL, z);
      draft.add(hub);
    }

    // The floorboard. Low, flat and the length of the gap between the wheels —
    // this is the mark that says step-through rather than motorbike — with a
    // dark mat on it where the feet go.
    const floor = solid({ color: paint, width: 0.5, topWidth: 0.46, depth: 0.8, height: 0.1 });
    floor.position.set(0, 0.3, 0.12);
    draft.add(floor);
    const mat = box(0.34, 0.03, 0.6, rubber);
    mat.position.set(0, 0.4, 0.14);
    draft.add(mat);

    // The cowl over the back wheel in two courses: a wide skirt, its tail
    // tucked up, and a narrower body stepping in from it to the seat. Solids
    // rather than boxes, so the back falls away and a scooter read from behind
    // is a rounded wedge.
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

    // The front: a fender hugging the wheel from over its top round to its
    // nose, the steering tube up from it to the headset, and a single-sided
    // fork down to the axle. The fender is a run of short plates on the arc,
    // each turned to its own tangent, because a wedge over a wheel reads as a
    // beak.
    const arc = WHEEL + 0.025;
    const plates = 4;
    for (let i = 0; i < plates; i++) {
      const from = -0.7 + (1.9 * i) / plates;
      const to = -0.7 + (1.9 * (i + 1)) / plates;
      const mid = (from + to) / 2;
      const plate = box(0.26, 0.07, arc * (to - from) + 0.04, paint);
      plate.rotation.x = mid;
      plate.position.set(0, WHEEL + arc * Math.cos(mid), front + arc * Math.sin(mid));
      draft.add(plate);
    }
    draft.add(strut(new V(0, WHEEL * 2 + 0.14, front - 0.1), new V(0, 1.1, 0.66), 0.13, paint));
    // The column on up from the legshield's top to the headset, raked back.
    draft.add(strut(new V(0, 1.06, 0.66), new V(0, 1.36, 0.45), 0.1, paint));
    draft.add(strut(new V(0.11, WHEEL * 2 + 0.06, front - 0.04), new V(0.11, WHEEL, front), 0.06, metal));

    // The headset: painted, the bars coming out of it into dark grips, the
    // lamp in its face and a mirror either side.
    const headset = solid({ color: paint, width: 0.3, foreWidth: 0.26, topWidth: 0.24, topForeWidth: 0.2, depth: 0.26, height: 0.14 });
    headset.position.set(0, 1.34, 0.42);
    draft.add(headset);
    draft.add(strut(new V(-0.27, 1.45, 0.4), new V(0.27, 1.45, 0.4), 0.06, metal));
    for (const side of [-1, 1]) {
      draft.add(strut(new V(side * 0.25, 1.45, 0.4), new V(side * 0.36, 1.45, 0.36), 0.08, rubber));
      draft.add(strut(new V(side * 0.2, 1.47, 0.41), new V(side * 0.27, 1.53, 0.39), 0.035, metal));
      const mirror = box(0.12, 0.06, 0.04, metal);
      mirror.position.set(side * 0.29, 1.5, 0.39);
      draft.add(mirror);
    }
    const lamp = lit(column(0.08, 0.05, tone(metal, 1.3), 8));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 1.4, 0.54);
    group.add(lamp);

    // The exhaust low on the right, under the cowl.
    draft.add(strut(new V(-0.2, 0.3, -0.34), new V(-0.24, 0.34, -0.9), 0.12, metal));

    // A top box on half of them, on the rail over the tail. It is the only
    // thing that changes the silhouette's tail, and half a region's scooters
    // carrying one is what a delivery street looks like.
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
    return group;
  },
};
