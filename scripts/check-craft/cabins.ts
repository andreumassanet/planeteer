import './motion.ts';
import * as THREE from 'three';
import { craft, fail, f, H, kit } from './setup.ts';

// --- the cabins ------------------------------------------------------------------
//
// Every seat shows its body and the closed craft have glass you see through
// and a cabin to sit in (`craft/cabin.ts`). Held here: no
// seat hides its body; every closed craft has a cabin and glass that is
// see-through, both-sided, writes no depth (it would hide every ink line
// behind it from the outline pass), carries no ink and casts no shadow; the
// eye in every covered seat has the roof's lining further over it than the
// near plane first person draws with (`COCKPIT_NEAR`); and a driver's wheel
// is where the seat says, its rim clear of the knees, the chest and the eye,
// and both its hand-holds within the hero's reach at full lock either way.
// The body itself on each seat — hip on the pan, soles on the floor, nothing
// through it — is `review.ts`, above.

console.log('\nthe cabins:');
{
  const { COCKPIT_NEAR, SEAT_EYE } = await import('../../src/craft/body.ts');
  // The contract the other worlds' closed craft are held to as well (`check-worlds.ts`).
  const { glassFaults, wheelFaults } = await import('../cabin-contract.ts');
  /** The craft a body sits inside, which have glass and a cabin. */
  const CLOSED = ['hatchback', 'van', 'jeep', 'pickup', 'tractor', 'bus', 'helicopter', 'submarine'];
  const up = new THREE.Vector3(0, 1, 0);
  for (const model of craft.values()) {
    for (const [i, seat] of model.seats.entries()) if (!seat.shown) fail(`${model.id}: seat ${i} hides its body`);
    const group = model.build(0);
    group.updateMatrixWorld(true);
    const glass = group.getObjectByName('glass') as THREE.Mesh | undefined;
    const cabin = group.getObjectByName('cabin') as THREE.Mesh | undefined;
    const said: string[] = [];
    if (CLOSED.includes(model.id)) {
      if (glass === undefined) fail(`${model.id}: a closed craft with no glass you can see through`);
      else {
        for (const fault of glassFaults(glass)) fail(`${model.id}: ${fault}`);
        said.push(`glass ${glass.geometry.getAttribute('position').count / 3}`);
      }
      if (cabin === undefined) fail(`${model.id}: a closed craft with no cabin`);
      else said.push(`cabin ${cabin.geometry.getAttribute('position').count / 3}`);
    }
    // The eye under the roof: the first surface over it, not counting the
    // glass, which is not drawn near enough to be cut.
    const solid: THREE.Object3D[] = [];
    group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh && part.name !== 'glass') solid.push(part);
    });
    let nearest = Infinity;
    for (const seat of model.seats) {
      if (seat.pose !== 'sit') continue;
      const eye = new THREE.Vector3(seat.x, seat.y + SEAT_EYE.up, seat.z + SEAT_EYE.ahead);
      const hit = new THREE.Raycaster(eye, up).intersectObjects(solid, false)[0];
      if (hit === undefined) continue;
      nearest = Math.min(nearest, hit.distance);
      if (hit.distance < COCKPIT_NEAR * 1.5) fail(`${model.id}: the roof is ${f(hit.distance)} over a seated eye, inside the near plane's ${f(COCKPIT_NEAR)} and a half`);
    }
    if (Number.isFinite(nearest)) said.push(`the roof ${f(nearest)} over the eye`);
    // The driver's wheel.
    const driver = model.seats[0]!;
    const wheel = driver.wheel;
    const steer = group.getObjectByName('steer');
    if (wheel !== undefined) {
      if (steer === undefined) fail(`${model.id}: a wheel on the seat and no 'steer' in the model`);
      else {
        const at = steer.getWorldPosition(new THREE.Vector3());
        const want = new THREE.Vector3(driver.x + wheel.centre[0], driver.y + wheel.centre[1], driver.z + wheel.centre[2]);
        if (at.distanceTo(want) > 0.01 * H) fail(`${model.id}: the wheel is drawn ${f(at.distanceTo(want))} off where the seat holds it`);
      }
      const { faults, close, reach } = wheelFaults(wheel, driver.legs);
      for (const fault of faults) fail(`${model.id}: ${fault}`);
      said.push(`wheel: rim ${f(close)} from the eye, the furthest hold ${f(reach)} from its shoulder`);
    } else if (steer !== undefined) fail(`${model.id}: a 'steer' in the model and no wheel on the driver's seat`);
    if (said.length > 0) console.log(`  ${model.id.padEnd(12)} ${said.join(', ')}`);
  }
}

// --- the traffic's drivers ---------------------------------------------------------
//
// A road vehicle near the eye is glazed and driven (`glazeTraffic`), its driver
// on the left, +X, where the road's country keeps right and on the right where
// it keeps left (`keepsLeft`, asked of the road's first town in `life.ts`).
// Held here on the traffic kit's own models: both builds fit a driver, on
// opposite sides, and the wheel each holds is on the driver's own side.

console.log('\nthe traffic\'s drivers:');
{
  const { trafficInside } = await import('../../src/craft/cars.ts');
  for (const name of ['hatchback-sports', 'van', 'suv', 'truck']) {
    const model = [...kit.values()].find((one) => one.name === name);
    if (model === undefined) {
      fail(`the traffic kit has no '${name}'`);
      continue;
    }
    // At the first of a few of the traffic's fits (how many of its part's
    // units a pack unit is drawn) at which a driver fits the cabin at all.
    const fit = [1, 1.2, 1.5, 0.8].find((one) => trafficInside(model, one, false) !== null);
    if (fit === undefined) {
      fail(`${name}: no driver fits its cabin for the traffic`);
      continue;
    }
    const left = trafficInside(model, fit, false)!;
    const right = trafficInside(model, fit, true);
    if (right === null) {
      fail(`${name}: a driver fits it keeping right and none keeping left`);
      continue;
    }
    if (!(left.driver.x > 0)) fail(`${name}: keeping right, the driver sits at ${f(left.driver.x)}, not on the left`);
    if (!(right.driver.x < 0)) fail(`${name}: keeping left, the driver sits at ${f(right.driver.x)}, not on the right`);
    if (Math.abs(left.driver.x + right.driver.x) > 1e-6) fail(`${name}: the two drivers are not either side of the axis alike`);
    console.log(`  ${name.padEnd(16)} driver at ${f(left.driver.x)} keeping right, ${f(right.driver.x)} keeping left`);
  }
}

// --- what stands still until it is taken ------------------------------------------
//
// A town's parked car, a rack's bicycle and a farm's tractor are merged into
// the buffer they stand in as the craft that takes their place
// (`craft/parked.ts`); the fleet builds the one taken off its own copy of the
// kit, from the id alone. The two must be one vehicle to the eye: for many ids,
// in every region's paints, the colours merged still and the colours of the
// vehicle driven off are the same numbers.
//
// A closed craft carries a cabin and see-through glass (`Inside` in
// `craft/build.ts`), which one buffer cannot draw: a town merges the cabin and
// draws the glass apart (`parkedArrays` glazed), so what it merges is the craft
// without its glass; a farm's tile leaves the cabin out and paints the glass
// opaque slate, so what it merges is the craft without its cabin, the same in
// every vertex but the glass's colour.

console.log('\nwhat stands still until it is taken:');
{
  const { fleetVariant, paintFor, parkedArrays, parkedModel, countryVehicleId } = await import('../../src/craft/parked.ts');
  const { PARKED_CRAFT, PARKED_SLOT } = await import('../../src/craft/contract.ts');
  const { TRAFFIC_STYLES } = await import('../../src/traffic/regions.ts');
  const { mergeMeshes } = await import('../../src/merge.ts');
  const { PALETTE } = await import('../../src/theme.ts');
  const palettes = Object.values(TRAFFIC_STYLES).map((style) => style.paint);
  const crafts = [...new Set(Object.values(PARKED_CRAFT))];
  /**
   * The vehicle as the fleet builds it from an id — its own model, its
   * variant and the paint the id decides — merged without the parts named in
   * `leave`, and how many of its vertices are its glass.
   */
  const takenWithout = (id: string, paint: number | undefined, leave: readonly string[]): { merged: ReturnType<typeof mergeMeshes>; glass: number } => {
    const model = craft.get(id.slice(0, id.indexOf(':')))!;
    const group = model.build(fleetVariant(id, model.variants), paint);
    const glass = (group.getObjectByName('glass') as THREE.Mesh | undefined)?.geometry.getAttribute('position').count ?? 0;
    for (const name of leave) for (let part = group.getObjectByName(name); part !== undefined; part = group.getObjectByName(name)) part.removeFromParent();
    return { merged: mergeMeshes(group), glass };
  };
  /** What a town merges of it: everything but the glass. */
  const taken = (id: string, paint: number | undefined): Float32Array => takenWithout(id, paint, ['glass']).merged.color;
  const same = (a: Float32Array, b: Float32Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);
  let compared = 0;
  let differ = 0;
  let unpainted = 0;
  for (const name of crafts) {
    const still = parkedModel(name);
    if (still === null || !craft.has(name)) {
      fail(`${name}: no parked model, or no craft, to stand still`);
      continue;
    }
    for (let place = 0; place < 40; place++) {
      const id = `${name}:${place * 733 + 11}:${PARKED_SLOT + (place % 20)}`;
      const palette = palettes[place % palettes.length]!;
      const paint = name === 'bicycle' ? undefined : paintFor(id, palette);
      const merged = parkedArrays(still, fleetVariant(id, still.variants), paint, 0.8, true).color;
      compared++;
      if (!same(merged, taken(id, paint))) {
        differ++;
        if (differ <= 5) fail(`${id}: the one parked and the one taken are not the same colours`);
      }
    }
    // Two paints of the same look must be two colourings, or the paint is lost on the way.
    if (name !== 'bicycle') {
      const model = craft.get(name)!;
      const a = mergeMeshes(model.build(0, PALETTE.crimson)).color;
      const b = mergeMeshes(model.build(0, PALETTE.skyBlue)).color;
      if (same(a, b)) {
        unpainted++;
        fail(`${name}: built in two paints, the same colours: the paint does not reach the model`);
      }
    }
  }
  // A farm's tractor, named after its cell.
  const tractor = parkedModel('tractor')!;
  for (let n = 0; n < 60; n++) {
    const id = countryVehicleId('tractor', 17 + n * 4, 3 + n * 9, n % 3)!;
    const arrays = parkedArrays(tractor, fleetVariant(id, tractor.variants), undefined);
    // Its cabin left out, and its glass painted opaque, at the tail of the buffer.
    const driven = takenWithout(id, undefined, ['cabin', 'steer', 'needle']);
    const unglazed = (colour: Float32Array): Float32Array => colour.subarray(0, colour.length - driven.glass * 3);
    // And the same size: it stood at 0.70 of the craft, and grew under whoever took it.
    if (n === 0 && !same(arrays.position, driven.merged.position)) fail(`${id}: the farm's tractor and the one driven off are not the same size`);
    compared++;
    if (!same(unglazed(arrays.color), unglazed(driven.merged.color))) {
      differ++;
      if (differ <= 5) fail(`${id}: the farm's tractor and the one driven off are not the same colours`);
    }
  }
  const ids = [countryVehicleId('tractor', 287, 575, 99), countryVehicleId('tractor', 0, 0, 0)];
  if (ids.some((id) => id === null || !/^[a-z-]{2,20}:\d{1,6}:\d{1,2}$/.test(id))) fail(`a farm's vehicle id the relay would refuse: ${ids.join(', ')}`);
  console.log(`  ${compared} ids of ${crafts.length + 1} kinds, parked and taken: ${differ} differ; ${unpainted} crafts deaf to their paint; ids ${ids.join(', ')}`);
}
