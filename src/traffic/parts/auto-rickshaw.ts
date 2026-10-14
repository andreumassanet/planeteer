import type { Group, TrafficContext, Vehicle } from '../contract.ts';

/**
 * Auto-rickshaw: the tuk-tuk, the only three-wheeler in the kit. One wheel
 * under a narrow nose, two under the bench, a driver astride at the front and
 * a passenger bench aft.
 *
 * Its read is the hood: one rounded shell, an arch in section, run from the
 * tail to the windscreen with open doorways under it. Pieces of one colour
 * are merged into one mesh by `merge`; the tyres stay separate so a taken one
 * turns them (`craft/traffic-craft.ts`), and so does the lamp, which is lit.
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
      // Open-sided: the elbows ride above the 0.26 sills.
      beam: Infinity,
      // No hats: a hat needs 1.63 of clearance and the hood gives 1.34.
      footrest: [0.2, 0.36, 0.98],
      grip: [0, 1.24, 1.02],
    },
    { x: 0, y: 0.96, z: -0.6, yaw: 0, pose: 'sit', headroom: 1.34, legroom: 0.6, beam: Infinity },
  ],

  build(ctx, rng, style) {
    const { THREE } = ctx;
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
    const r: Rickshaw = {
      ctx,
      group,
      draft,
      paint,
      glass,
      rubber,
      metal,
      radius,
      half,
      front: half - 0.3,
      rear: -half + 0.62,
      crown: rng.range(2.44, 2.5),
      eaves: 1.62,
      pan: 0.36,
      panFore: 1.02,
    };

    addWheels(r);
    addBody(r);
    addFront(r);
    addHood(r);

    for (const mesh of [...ctx.merge(draft).children]) group.add(mesh);
    return group;
  },
};

/** One variant's shared numbers: colours, the wheel layout and the main heights. */
interface Rickshaw {
  ctx: TrafficContext;
  group: Group;
  draft: Group;
  paint: number;
  glass: number;
  rubber: number;
  metal: number;
  radius: number;
  half: number;
  /** Z of the front axle and of the rear one. */
  front: number;
  rear: number;
  /** The hood's crown, and its eaves: the line its sides come down to. */
  crown: number;
  eaves: number;
  /** Top of the floor pan, and its fore end. */
  pan: number;
  panFore: number;
}

function addWheels(r: Rickshaw): void {
  const { wheel, column } = r.ctx;
  const nose = wheel(r.radius, 0.2, r.rubber);
  nose.position.set(0, r.radius, r.front);
  r.group.add(nose);
  for (const x of [-0.66, 0.66]) {
    const tyre = wheel(r.radius, 0.24, r.rubber);
    tyre.position.set(x, r.radius, r.rear);
    r.group.add(tyre);
  }
  // A hub in each, standing proud of the tyre's outer face.
  for (const [x, z, width] of [[0, r.front, 0.24], [-0.66, r.rear, 0.28], [0.66, r.rear, 0.28]] as const) {
    const hub = column(r.radius * 0.48, width, r.metal, 8);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x + width / 2, r.radius, z);
    r.draft.add(hub);
  }
}

/** The floor pan, the cowl and rear body, the seats and the sills. */
function addBody(r: Rickshaw): void {
  const { THREE, box, solid, strut } = r.ctx;
  const V = THREE.Vector3;
  const { draft, paint, rubber, metal, half, eaves, pan, panFore } = r;

  // A plate rather than a filled tub, so the riders' legs are not inside the
  // bodywork. A rider's shin (0.563) just clears the bench height over it
  // (0.570). It stops short of the front wheel, which turns under the apron.
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
}

/** The apron and lamp, the dashboard, the fender and fork, the steering and bars. */
function addFront(r: Rickshaw): void {
  const { THREE, box, solid, strut, column, tone, lit } = r.ctx;
  const V = THREE.Vector3;
  const { draft, paint, rubber, metal, radius, front } = r;

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
  r.group.add(lamp);
  const rim = column(0.13, 0.06, metal, 8);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 0.94, 1.36);
  draft.add(rim);
}

/** The raked windscreen and the hood over everything, with its back and visor. */
function addHood(r: Rickshaw): void {
  const { THREE, box, solid, strut, toon } = r.ctx;
  const V = THREE.Vector3;
  const { draft, paint, glass, rubber, half, crown, eaves } = r;

  const screenFore = 1.2;
  const rake = 0.18;
  const screen = solid({ color: glass, width: 1.08, topWidth: 1.16, depth: 0.06, height: crown - 0.28 - 1.12, topAft: -0.03 - rake, topFore: 0.03 - rake });
  screen.position.set(0, 1.12, screenFore);
  draft.add(screen);
  for (const side of [-1, 1]) {
    draft.add(strut(new V(side * 0.62, 1.1, screenFore + 0.02), new V(side * 0.74, eaves + 0.3, screenFore - rake * 0.55), 0.08, rubber));
  }

  // The hood's section: the outer line from the right eave over the crown to
  // the left one, then the inner line a skin in, back again.
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
  // A visor across the hood's front edge, closing the arch over the windscreen.
  const visor = solid({ color: rubber, width: 1.1, depth: 0.08, height: 0.2 });
  visor.position.set(0, crown - 0.3, hoodFore - 0.05);
  draft.add(visor);
  // A band of the body's paint along the eaves, either side.
  for (const side of [-1, 1]) {
    const band = box(0.04, 0.12, hoodFore - hoodAft - 0.1, paint);
    band.position.set(side * 0.9, eaves + 0.04, (hoodFore + hoodAft) / 2);
    draft.add(band);
  }
}
