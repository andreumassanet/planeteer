import type { Vehicle } from '../contract.ts';

/**
 * Auto-rickshaw — the tuk-tuk.
 *
 * **The only three-wheeler in the kit and the only vehicle whose plan is not
 * symmetric front to back**: one wheel under a narrow nose, two under the
 * bench, so the front narrows to a point in plan and the tail is square.
 *
 * It carries **two mounts**, and they are the pair the kit exists to publish: a
 * driver astride at the front, facing forward, and a passenger bench aft,
 * facing forward as well. A rider is 1.85 tall once seated at `RIDER_SCALE`,
 * which is what set the canopy height — not the reference vehicle.
 *
 * **What makes it an auto-rickshaw and not a cart with a roof on posts**, which
 * is what the first version read as: the **hood**. It is one rounded shell —
 * an arch in section, run from the tail to the windscreen and closed at the
 * back — with its sides coming down to the shoulders and the doorways open
 * under them, a band of the body's paint along its eaves, and a small window
 * in its back. Under it: a raked **windscreen** on a dashboard; a narrow
 * **apron** over the front wheel carrying the one headlamp, a fender and a
 * visible fork under it; the **engine cowl** under the bench and the rear body
 * behind it, which the rear wheels tuck into; a backrest, and low sills along
 * the open sides. Every piece of one colour is merged into one mesh by the
 * context (`merge`); the tyres stay their own, so a taken one turns them
 * (`craft/traffic-craft.ts`), and so does the lamp, which is lit at night.
 */

export const autoRickshaw: Vehicle = {
  id: 'auto-rickshaw',
  name: 'Auto-rickshaw',
  kind: 'utility',
  size: [3.46, 1.82, 2.56],
  note: 'One wheel forward, two aft, a rounded hood over a bench. The only three-wheeler here.',

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
      // Open-sided: the sills are 0.26 high and the elbows are half a unit above
      // the seat, so they are outside the vehicle rather than in its doors.
      beam: Infinity,
      // **No hats, and it is the hood that says so.** A conical hat or a
      // headload wants 1.63 of clearance and this has 1.34; raising the hood to
      // admit one would take the whole vehicle past 3 — half a unit taller than
      // a kei truck, for a vehicle that is 3.4 long. The rickshaw admits a bare
      // head and says so rather than growing.
      footrest: [0.2, 0.36, 0.98],
      grip: [0, 1.24, 1.02],
    },
    { x: 0, y: 0.96, z: -0.6, yaw: 0, pose: 'sit', headroom: 1.34, legroom: 0.6, beam: Infinity },
  ],

  build(ctx, rng, style) {
    const { THREE, box, solid, wheel, strut, column, tone, lit, merge, toon } = ctx;
    const V = THREE.Vector3;
    const group = new THREE.Group();
    // Everything but the tyres and the lamp, merged by colour at the end.
    const draft = new THREE.Group();

    const paint = rng.pick(style.paint);
    const glass = rng.pick(style.glass);
    const rubber = rng.pick(style.trim);
    const metal = rng.pick(style.metal);

    const radius = 0.34;
    const length = rng.range(3.2, 3.36);
    const half = length / 2;
    const front = half - 0.3;
    const rear = -half + 0.62;
    /** The hood's crown, and its eaves: the line its sides come down to. */
    const crown = rng.range(2.44, 2.5);
    const eaves = 1.62;

    const nose = wheel(radius, 0.2, rubber);
    nose.position.set(0, radius, front);
    group.add(nose);
    for (const x of [-0.66, 0.66]) {
      const tyre = wheel(radius, 0.24, rubber);
      tyre.position.set(x, radius, rear);
      group.add(tyre);
    }
    // A hub in each, standing proud of the tyre's outer face.
    for (const [x, z, width] of [[0, front, 0.24], [-0.66, rear, 0.28], [0.66, rear, 0.28]] as const) {
      const hub = column(radius * 0.48, width, metal, 8);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x + width / 2, radius, z);
      draft.add(hub);
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
     *
     * It stops short of the front wheel, which turns under the apron ahead of
     * the driver's feet.
     */
    const pan = 0.36;
    const panFore = 1.02;
    const panAft = -half + 0.1;
    const floorPan = solid({
      color: rubber,
      width: 1.6,
      foreWidth: 0.9,
      topWidth: 1.6,
      topForeWidth: 0.9,
      depth: panFore - panAft,
      height: 0.14,
    });
    floorPan.position.set(0, pan - 0.14, (panFore + panAft) / 2);
    draft.add(floorPan);

    // The engine cowl under the bench, and the rear body behind the backrest,
    // up to the hood's eaves; the rear wheels tuck in under both.
    const cowlAft = -half + 0.08;
    const cowl = solid({ color: paint, width: 1.5, topWidth: 1.44, depth: -0.3 - cowlAft, height: 0.8 - pan });
    cowl.position.set(0, pan, (cowlAft - 0.3) / 2);
    draft.add(cowl);
    const tail = solid({
      color: paint,
      width: 1.62,
      topWidth: 1.72,
      depth: 0.64,
      height: eaves - pan,
      aftRise: 0.08,
      topAft: -0.3,
      topFore: 0.32,
    });
    tail.position.set(0, pan, -half + 0.32);
    draft.add(tail);
    // A bumper across the back.
    const bumper = box(1.5, 0.1, 0.1, metal);
    bumper.position.set(0, 0.4, -half - 0.02);
    draft.add(bumper);

    // The bench, its backrest and the driver's saddle.
    const bench = solid({ color: rubber, width: 1.4, topWidth: 1.36, depth: 0.62, height: 0.16 });
    bench.position.set(0, 0.8, -0.6);
    draft.add(bench);
    const backrest = solid({ color: rubber, width: 1.4, topWidth: 1.36, depth: 0.12, height: eaves - 0.96, topAft: -0.14, topFore: -0.02 });
    backrest.position.set(0, 0.96, -1.0);
    draft.add(backrest);
    const saddle = solid({ color: rubber, width: 0.52, topWidth: 0.44, depth: 0.5, height: 0.16, topAft: -0.22, topFore: 0.24 });
    saddle.position.set(0, 0.8, 0.42);
    draft.add(saddle);
    draft.add(strut(new V(0, pan, 0.42), new V(0, 0.8, 0.42), 0.14, metal));

    // Low sills along the open sides, so the doorway has a line under it.
    for (const side of [-1, 1]) {
      const sill = box(0.12, 0.26, panFore + 0.3, paint);
      sill.position.set(side * 0.76, pan, (panFore - 0.3) / 2);
      draft.add(sill);
    }

    // The apron over the front wheel, carrying the lamp, and the dashboard
    // behind it at the height the driver's knees clear. The fender and the
    // fork under it, and the steering column up through the dash to the bars.
    const apron = solid({ color: paint, width: 0.74, foreWidth: 0.5, topWidth: 0.9, topForeWidth: 0.56, depth: 0.3, height: 1.12 - 0.76, topAft: -0.15, topFore: 0.1 });
    apron.position.set(0, 0.76, 1.24);
    draft.add(apron);
    const dash = solid({ color: paint, width: 1.3, foreWidth: 1.0, depth: 0.3, height: 0.12 });
    dash.position.set(0, 1.0, 1.08);
    draft.add(dash);
    const fender = solid({
      color: paint,
      width: 0.28,
      topWidth: 0.22,
      depth: 0.6,
      height: 0.1,
      topAft: -0.2,
      topFore: 0.16,
      foreRise: 0.05,
    });
    fender.position.set(0, radius * 2 + 0.03, front + 0.04);
    draft.add(fender);
    for (const side of [-1, 1]) {
      draft.add(strut(new V(side * 0.14, 0.9, front - 0.1), new V(side * 0.14, radius, front), 0.07, metal));
    }
    draft.add(strut(new V(0, 0.9, front - 0.12), new V(0, 1.24, 1.02), 0.08, metal));
    const bars = box(0.72, 0.08, 0.08, metal);
    bars.position.set(0, 1.2, 1.02);
    draft.add(bars);
    for (const side of [-1, 1]) {
      const grip = box(0.14, 0.1, 0.1, rubber);
      grip.position.set(side * 0.37, 1.19, 1.02);
      draft.add(grip);
    }
    const lamp = lit(column(0.1, 0.06, tone(metal, 1.3), 8));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 0.94, 1.4);
    group.add(lamp);
    const rim = column(0.13, 0.06, metal, 8);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.94, 1.36);
    draft.add(rim);

    // The windscreen, raked back from the dash to the hood's front edge, with
    // a pillar either side.
    const screenFore = 1.2;
    const rake = 0.18;
    const screen = solid({ color: glass, width: 1.08, topWidth: 1.16, depth: 0.06, height: crown - 0.28 - 1.12, topAft: -0.03 - rake, topFore: 0.03 - rake });
    screen.position.set(0, 1.12, screenFore);
    draft.add(screen);
    for (const side of [-1, 1]) {
      draft.add(strut(new V(side * 0.62, 1.1, screenFore + 0.02), new V(side * 0.74, eaves + 0.3, screenFore - rake * 0.55), 0.08, rubber));
    }

    // The hood: an arch in section, run from the tail to the top of the
    // windscreen, its sides down to the eaves. Its outer line, from the right
    // eave over the crown to the left one; the inner is the same a skin in.
    const outer: [number, number][] = [
      [0.89, eaves],
      [0.89, crown - 0.5],
      [0.8, crown - 0.24],
      [0.6, crown - 0.08],
      [0.32, crown - 0.01],
    ];
    const skin = 0.06;
    const shape = new THREE.Shape();
    const arch: [number, number][] = [...outer, ...[...outer].reverse().map(([x, y]) => [-x, y] as [number, number])];
    arch.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    for (const [x, y] of [...arch].reverse()) {
      const inX = Math.sign(x) * Math.max(0, Math.abs(x) - skin);
      shape.lineTo(inX, y === eaves ? y : y - skin);
    }
    const hoodAft = -half + 0.02;
    const hoodFore = screenFore - rake + 0.12;
    const hoodGeometry = new THREE.ExtrudeGeometry(shape, { depth: hoodFore - hoodAft, bevelEnabled: false });
    hoodGeometry.deleteAttribute('uv');
    const flat = hoodGeometry.index === null ? hoodGeometry : hoodGeometry.toNonIndexed();
    flat.computeVertexNormals();
    const hood = new THREE.Mesh(flat, toon(rubber));
    hood.position.z = hoodAft;
    draft.add(hood);
    // Its back closed over the rear body, with a small window in it.
    const back = new THREE.Shape();
    arch.forEach(([x, y], i) => (i === 0 ? back.moveTo(x, y) : back.lineTo(x, y)));
    const backGeometry = new THREE.ExtrudeGeometry(back, { depth: 0.08, bevelEnabled: false });
    backGeometry.deleteAttribute('uv');
    const backFlat = backGeometry.index === null ? backGeometry : backGeometry.toNonIndexed();
    backFlat.computeVertexNormals();
    const backPanel = new THREE.Mesh(backFlat, toon(rubber));
    backPanel.position.z = hoodAft;
    draft.add(backPanel);
    const rearWindow = box(0.8, 0.3, 0.05, glass);
    rearWindow.position.set(0, eaves + 0.28, hoodAft - 0.03);
    draft.add(rearWindow);
    // A visor across the hood's front edge, closing the arch over the
    // windscreen's top.
    const visor = solid({ color: rubber, width: 1.1, depth: 0.08, height: 0.2 });
    visor.position.set(0, crown - 0.3, hoodFore - 0.05);
    draft.add(visor);
    // A band of the body's paint along the eaves, either side.
    for (const side of [-1, 1]) {
      const band = box(0.04, 0.12, hoodFore - hoodAft - 0.1, paint);
      band.position.set(side * 0.9, eaves + 0.04, (hoodFore + hoodAft) / 2);
      draft.add(band);
    }

    for (const mesh of [...merge(draft).children]) group.add(mesh);
    return group;
  },
};
