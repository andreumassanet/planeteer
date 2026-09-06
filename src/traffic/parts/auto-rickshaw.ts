import type { Vehicle } from '../contract.ts';

/**
 * Auto-rickshaw — the tuk-tuk.
 *
 * **The only three-wheeler in the kit and the only vehicle whose plan is not
 * symmetric front to back**: one wheel under the handlebars, two under the
 * bench, so the front narrows to a point in plan and the tail is square. From
 * above that reads as a wedge and from the side it reads as a hood on a stalk,
 * and neither is a shape any car in the kit can make.
 *
 * It carries **two mounts**, and they are the pair the kit exists to publish: a
 * driver astride at the front, facing forward, and a passenger bench aft,
 * facing forward as well. A rider is 1.85 tall once seated at `RIDER_SCALE`,
 * which is what set the canopy height — not the reference vehicle.
 *
 * The canopy is `roof()` from the scenery kit, eight triangles, and its ridge is
 * the ink line that stops the top of this thing being a blank curve.
 */

export const autoRickshaw: Vehicle = {
  id: 'auto-rickshaw',
  name: 'Auto-rickshaw',
  kind: 'utility',
  size: [3.32, 1.78, 2.78],
  note: 'One wheel forward, two aft, a canopy over a bench. The only three-wheeler here.',

  mounts: [
    {
      x: 0,
      y: 0.96,
      z: 0.42,
      yaw: 0,
      pose: 'astride',
      driver: true,
      headroom: 1.34,
      legroom: 0.6,
      // Open-sided: the sills are 0.44 high and the elbows are half a unit above
      // the seat, so they are outside the vehicle rather than in its doors.
      beam: Infinity,
      // **No hats, and it is the canopy that says so.** A conical hat or a
      // headload wants 1.63 of clearance and this has 1.34; raising the canopy
      // to admit one would put the roof at 2.60 and take the whole vehicle to
      // 3.1 — half a unit taller than a kei truck, for a vehicle that is 3.3
      // long. The rickshaw admits a bare head and says so rather than growing.
      footrest: [0.2, 0.36, 0.98],
      grip: [0, 1.24, 1.02],
    },
    { x: 0, y: 0.96, z: -0.6, yaw: 0, pose: 'sit', headroom: 1.34, legroom: 0.6, beam: Infinity },
  ],

  build(ctx, rng, style) {
    const { THREE, box, roof, solid, wheel, strut } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const radius = 0.36;
    const length = rng.range(3.2, 3.36);
    const half = length / 2;

    const front = wheel(radius, 0.2, rubber);
    front.position.set(0, radius, half - 0.34);
    group.add(front);
    for (const x of [-0.7, 0.7]) {
      const tyre = wheel(radius, 0.24, rubber);
      tyre.position.set(x, radius, -half + 0.62);
      group.add(tyre);
    }

    /**
     * The floor pan, and it is a **plate rather than a filled tub**, which is the
     * one thing in this file worth reading.
     *
     * The first version made the body one solid `solid` from 0.32 up to 1.34 and
     * then declared a seat at 0.92 — a mount inside a solid mass, which
     * `validateVehicle` cannot see because it checks the seat against the roof
     * and the floor and not against the geometry between them. The rider's legs
     * would have been inside the bodywork.
     *
     * The arithmetic that makes the honest version fit is worth writing down,
     * because it is the same one that refuses a mount to every car here: a
     * rider's shin at `RIDER_SCALE` is 0.563, and a real tuk-tuk's bench sits
     * 0.45 m over its floor, which is **0.570 at this scale**. It clears by
     * seven thousandths of a unit. The rickshaw is the only enclosed road
     * vehicle in the kit whose real proportions seat the crowd's own pose.
     */
    const pan = 0.36;
    const floorPan = solid({
      color: rubber,
      width: 1.6,
      foreWidth: 0.5,
      topWidth: 1.6,
      topForeWidth: 0.72,
      depth: length - 0.4,
      height: 0.14,
    });
    floorPan.position.set(0, pan - 0.14, -0.1);
    group.add(floorPan);

    // The enclosed tail behind the bench. This is what the bench leans on and
    // what makes the rickshaw read as a cab rather than as a bench on a trike.
    const tail = solid({
      color: paint,
      width: 1.6,
      topWidth: 1.5,
      depth: length * 0.34,
      height: 0.72,
    });
    tail.position.set(0, pan, -half + length * 0.17);
    group.add(tail);

    // Low sills either side, so the passenger compartment has a line under the
    // open side rather than being a hole in the middle of the vehicle.
    for (const side of [-1, 1]) {
      const sill = box(0.12, 0.44, length * 0.46, paint);
      sill.position.set(side * 0.76, pan, -0.24);
      group.add(sill);
    }

    const bench = box(1.4, 0.16, 0.62, rubber);
    bench.position.set(0, 0.8, -0.6);
    group.add(bench);
    const saddle = box(0.52, 0.16, 0.5, rubber);
    saddle.position.set(0, 0.8, 0.42);
    group.add(saddle);

    // The canopy. Four posts and a pitched roof — an unsupported roof floats,
    // and the posts are the only vertical ink lines the vehicle has. The eaves
    // height is set by the rider's head, not by the reference vehicle: 0.96 of
    // seat plus 1.29 of seated crown is 2.25, and this clears it.
    const eaves = rng.range(2.3, 2.42);
    for (const x of [-0.72, 0.72]) {
      for (const z of [-half + 0.5, half - 1.05]) {
        group.add(strut(new V(x, 0.9, z), new V(x, eaves, z), 0.1, metal));
      }
    }
    const canopy = roof(1.78, length - 0.5, rng.range(0.24, 0.34), 1.3, paint);
    canopy.position.set(0, eaves, -0.16);
    group.add(canopy);

    const screen = solid({
      color: glass,
      width: 0.9,
      topWidth: 1.0,
      depth: 0.16,
      height: 0.72,
    });
    screen.position.set(0, 1.1, half - 1.06);
    group.add(screen);

    const bars = box(0.72, 0.09, 0.09, metal);
    bars.position.set(0, 1.24, 1.02);
    group.add(bars);

    return group;
  },
};
