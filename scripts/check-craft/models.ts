import * as THREE from 'three';
import { type CraftModel, HEADLIGHTS_OF } from '../../src/craft/contract.ts';
import { BUDGET, type CraftReview, reviewCraft, fail, H, f, SEATS_AT_LEAST, LAMP_ON, craft, kit } from './setup.ts';

// --- per craft -------------------------------------------------------------

const hashOf = (group: THREE.Group): string => {
  let h = 2166136261;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const name of ['position', 'color', 'outlineNormal']) {
      const array = mesh.geometry.getAttribute(name).array as Float32Array;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 16777619);
    }
    h = Math.imul(h ^ Math.round(mesh.matrixWorld.elements.reduce((a, b) => a + b * 1000, 0)), 16777619);
  });
  return (h >>> 0).toString(16);
};

function checkCraft(model: CraftModel): void {
  const budget = BUDGET[model.id] ?? 6000;
  let worstTriangles = 0;
  let first: CraftReview | null = null;
  for (let variant = 0; variant < model.variants; variant++) {
    const group = model.build(variant);
    const where = `${model.id} #${variant}`;
    // The box, the frame, the matrices, the attributes and the seats:
    // `reviewCraft`.
    const review = reviewCraft(model, variant, group);
    first ??= review;
    for (const problem of review.problems) fail(`${where}: ${problem}`);
    worstTriangles = Math.max(worstTriangles, review.triangles);
    if (review.triangles > budget) fail(`${where}: ${review.triangles} triangles against a budget of ${budget}`);

    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const normal = mesh.geometry.getAttribute('normal').array;
      for (let i = 0; i < normal.length; i++) {
        if (!Number.isFinite(normal[i]!)) {
          fail(`${where}: '${mesh.name}' has a non-finite normal`);
          break;
        }
      }
    });

    // The turning parts: each centred across the axis it turns about, and a
    // wheel with its bottom on the ground.
    for (const part of group.children.filter((child) => ['prop', 'rotor', 'wheel'].includes(child.name))) {
      const own = new THREE.Box3().setFromObject(part.children[0]!);
      const at = part.getWorldPosition(new THREE.Vector3());
      const m = own.getCenter(new THREE.Vector3()).sub(at);
      const across = part.name === 'wheel' ? Math.hypot(m.y, m.z) : part.name === 'prop' ? Math.hypot(m.x, m.y) : Math.hypot(m.x, m.z);
      if (across > 0.02 * H) fail(`${where}: a ${part.name} turns ${f(across)} off its own middle`);
      if (part.name === 'wheel' && model.medium !== 'water' && Math.abs(own.min.y) > 0.01 * H) {
        fail(`${where}: a wheel's bottom is at y ${f(own.min.y)}, not on the ground`);
      }
    }
    if (model.kind === 'plane' && !group.children.some((child) => child.name === 'prop')) fail(`${where}: a plane with no 'prop'`);

    // Determinism: the same variant twice is the same bytes.
    if (hashOf(group) !== hashOf(model.build(variant))) fail(`${where}: two builds differ`);
  }
  if (model.seats.length < (SEATS_AT_LEAST[model.id] ?? 1)) fail(`${model.id}: ${model.seats.length} seats, wants ${SEATS_AT_LEAST[model.id]}`);
  if (model.seats[0] === undefined) fail(`${model.id}: no driver's seat`);

  // The headlamps: as many as the kind lights, each on the model itself —
  // on the surface that is drawn, in the front of it, over the road — and
  // a pair either side of the middle.
  const lights = HEADLIGHTS_OF[model.kind];
  const lamps = model.lamps ?? [];
  if (lamps.length !== lights.count) fail(`${model.id}: ${lamps.length} headlamps, and a ${model.kind} lights ${lights.count}`);
  if (lamps.length > 0) {
    const drawn = model.build(0);
    drawn.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(drawn, true);
    const triangle = new THREE.Triangle();
    const closest = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (const [x, y, z] of lamps) {
      // How far the lamp is from the drawn surface: the nearest point of any triangle.
      let nearest = Infinity;
      point.set(x, y, z);
      drawn.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.index;
        const corners = index !== null ? index.count : position.count;
        const at = (c: number): number => (index !== null ? index.getX(c) : c);
        for (let c = 0; c + 2 < corners; c += 3) {
          triangle.a.fromBufferAttribute(position, at(c)).applyMatrix4(mesh.matrixWorld);
          triangle.b.fromBufferAttribute(position, at(c + 1)).applyMatrix4(mesh.matrixWorld);
          triangle.c.fromBufferAttribute(position, at(c + 2)).applyMatrix4(mesh.matrixWorld);
          nearest = Math.min(nearest, triangle.closestPointToPoint(point, closest).distanceTo(point));
        }
      });
      if (nearest > LAMP_ON * H) fail(`${model.id}: a headlamp at ${f(x)} ${f(y)} ${f(z)} is ${f(nearest)} off the model`);
      if (z < box.max.z - model.size[0] * 0.3) fail(`${model.id}: a headlamp at z ${f(z)} is not at the front (${f(box.max.z)})`);
      if (y <= 0 || y > box.max.y) fail(`${model.id}: a headlamp at y ${f(y)} is not over the road and under the roof`);
    }
    if (lamps.length === 2 && Math.sign(lamps[0]![0]) === Math.sign(lamps[1]![0])) fail(`${model.id}: both headlamps on one side`);
    if (lamps.length === 1 && Math.abs(lamps[0]![0]) > 0.05 * model.size[1]) fail(`${model.id}: its one headlamp is off the middle`);
  }

  // The variants are different looks.
  const looks = new Set<string>();
  for (let variant = 0; variant < model.variants; variant++) looks.add(hashOf(model.build(variant)));
  if (looks.size !== model.variants) fail(`${model.id}: ${model.variants} variants but ${looks.size} looks`);

  console.log(
    `  ${model.id.padEnd(12)} ${model.kind.padEnd(8)} ${model.medium.padEnd(6)} ` +
      `${f(model.size[0])} x ${f(model.size[1])} x ${f(model.size[2])}  (${f(model.size[0] / H)} x ${f(model.size[1] / H)} x ${f(model.size[2] / H)} bodies)` +
      `  draft ${f(model.draft)}  ${worstTriangles} triangles of ${budget}  ${model.variants} variants  ${model.seats.length} seats` +
      `  turning: ${first!.turning.join(', ') || 'none'}` +
      `  lamps: ${(model.lamps ?? []).map((lamp) => lamp.map(f).join(' ')).join(' | ') || 'none'}`,
  );
  for (const row of first!.seats) {
    const { seat } = row;
    console.log(
      `    seat ${row.index}  ${seat.pose.padEnd(5)} ${seat.shown ? 'shown ' : 'hidden'} at ${f(seat.x).padStart(6)} ${f(seat.y).padStart(6)} ${f(seat.z).padStart(6)}` +
        `   ${row.headroom === null ? 'open over the head' : `roof ${f(row.headroom)} over the crown`}` +
        `${row.under === null ? '' : `   under the ${seat.pose === 'stand' ? 'soles' : 'hip'} ${f(row.under)}`}` +
        `   inside the body: ${Object.entries(row.inside).map(([name, area]) => `${name} ${area.toFixed(3)}`).join(', ')}`,
    );
  }
}

for (const model of craft.values()) checkCraft(model);

// --- the road wheels ---------------------------------------------------------
//
// Only a wheel on the road turns. The kit's `suv` (the jeep) carries a spare on
// its tailgate on the same slots as its road wheels, and sorted into the car's
// four corners it was split across the two rear wheels, which then spun about
// a point between the axle and the tailgate and swung the spare through the
// body. So every craft's turning wheels are counted, each is held on the
// ground, round, with its axle across the craft, and the kit's own wheels are found
// again from the pack: every one that is not on the road is the suv's spare.
{
  /** The wheels a craft turns: the model's real count, and none for the pack's wheel-less bus. */
  const WHEELS: Record<string, number> = {
    hatchback: 4, saloon: 4, van: 4, jeep: 4, pickup: 4, tractor: 4, bus: 4, minibus: 4,
    bicycle: 2, motorbike: 2, scooter: 2, 'tuk-tuk': 3, 'light-plane': 3,
  };
  const { wheelsOf } = await import('../../src/craft/cars.ts');
  for (const model of craft.values()) {
    const group = model.build(0);
    group.updateMatrixWorld(true);
    // Hung on a fork or not.
    const wheels: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child.name === 'wheel') wheels.push(child);
    });
    const wants = WHEELS[model.id] ?? 0;
    if (wheels.length !== wants) fail(`${model.id}: ${wheels.length} turning wheels, wants ${wants}`);
    for (const wheel of wheels) {
      const own = new THREE.Box3().setFromObject(wheel, true);
      const size = own.getSize(new THREE.Vector3());
      if (own.min.y > 0.01 * H) fail(`${model.id}: a turning wheel ${f(own.min.y)} off the ground, a spare`);
      // Round in its own plane: a spare's triangles taken into it make it tall or long.
      if (Math.abs(size.y - size.z) > 0.1 * Math.max(size.y, size.z)) fail(`${model.id}: a turning wheel is ${f(size.y)} tall and ${f(size.z)} long, not one wheel`);
      if (!(size.x < Math.min(size.y, size.z))) fail(`${model.id}: a turning wheel's axle is not across the craft (${f(size.x)} x ${f(size.y)} x ${f(size.z)})`);
    }
  }
  let spares = 0;
  for (const model of kit) {
    const wheelSlot = model.slots.map((slot) => /^(Tyre|Hub)$/.test(slot));
    if (!wheelSlot.some(Boolean)) continue;
    const index = model.geometry.index;
    const { road, other } = wheelsOf(model, (t) => wheelSlot[model.slot[index !== null ? index.getX(t * 3) : t * 3]!]!);
    if (road.length !== 4) fail(`kit '${model.name}': ${road.length} road wheels, wants 4`);
    const wantsSpare = model.name === 'suv' ? 1 : 0;
    if (other.length !== wantsSpare) fail(`kit '${model.name}': ${other.length} wheels off the road, wants ${wantsSpare}`);
    spares += other.length;
  }
  console.log(`road wheels: every craft's counted, grounded, round and across; ${spares} spare in the kit, left in the body\n`);
}
