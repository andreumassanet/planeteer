import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { fail, f, H, craft } from './setup.ts';

// --- every vehicle the world places ---------------------------------------------
//
// Nothing stands or drives anywhere that cannot be boarded or that hides who
// is in it. Every vehicle a region puts on a road or at a kerb is taken over
// by a craft (`PARKED_CRAFT`), and is placed at that craft's own size
// (`Vehicle.section`), so nothing grows or shrinks when it is boarded; a
// closed one is glazed near the eye with a driver of the hero's own height
// (`glazeTraffic`), and an open one carries its riders at the hero's height;
// every boat on the water is crewed; every craft that stands parked has
// seats, and a lined cabin wherever it has glass; and the countryside's only
// vehicles are its machines, each a craft.

console.log('\nevery vehicle the world places:');
{
  const { PARKED_CRAFT } = await import('../../src/craft/contract.ts');
  const { glazeTraffic } = await import('../../src/craft/cars.ts');
  const { parkedModel } = await import('../../src/craft/parked.ts');
  const { createTrafficContext, placedScale, variantRng, RIDER_HEIGHT } = await import('../../src/traffic/contract.ts');
  const { TRAFFIC_STYLES } = await import('../../src/traffic/regions.ts');
  const { findSceneryModel } = await import('../../src/scenery/contract.ts');
  const { MACHINES } = await import('../../src/countryside-tile/types.ts');
  const { COUNTRY_PARTS } = await import('../../src/countryside-kit.ts');
  type Vehicle = import('../../src/traffic/contract.ts').Vehicle;
  type TrafficStyle = import('../../src/traffic/contract.ts').TrafficStyle;

  const parts = new Map<string, Vehicle>();
  const dir = resolve(import.meta.dirname, '../../src/traffic/parts');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts'))) {
    const module = (await import(pathToFileURL(resolve(dir, file)).href)) as Record<string, unknown>;
    for (const value of Object.values(module)) {
      const part = value as Vehicle;
      if (typeof part === 'object' && part !== null && typeof part.build === 'function') parts.set(part.id, part);
    }
  }
  const ctx = createTrafficContext();
  /** Who names each road and water vehicle, for a style to build it in. */
  const roadBy = new Map<string, TrafficStyle>();
  const waterBy = new Map<string, TrafficStyle>();
  for (const style of Object.values(TRAFFIC_STYLES)) {
    for (const { item } of style.road) if (!roadBy.has(item)) roadBy.set(item, style);
    for (const { item } of style.water) if (!waterBy.has(item)) waterBy.set(item, style);
  }

  const sizeOf = (group: THREE.Object3D): THREE.Vector3 => new THREE.Box3().setFromObject(group, true).getSize(new THREE.Vector3());
  let rows = 0;
  for (const [id, style] of roadBy) {
    const part = parts.get(id);
    if (part === undefined) {
      fail(`${style.id} drives '${id}', which no part builds`);
      continue;
    }
    const taken = PARKED_CRAFT[id];
    const model = taken === undefined ? undefined : craft.get(taken);
    if (taken === undefined || model === undefined) {
      fail(`'${id}' is on the road in ${style.id} and no craft takes it: it cannot be boarded`);
      continue;
    }
    const section = placedScale(part);
    const built = part.build(ctx, variantRng(part, style, 0), style);
    const holder = new THREE.Group();
    holder.scale.set(section[0], section[1], section[2]);
    holder.add(built);
    // One size: the vehicle passing and parked, against the craft it is taken as.
    const placed = sizeOf(holder);
    const off = [Math.abs(placed.z / model.size[0] - 1), Math.abs(placed.x / model.size[1] - 1), Math.abs(placed.y / model.size[2] - 1)];
    // A bicycle is the kit's in the street and the craft's own when taken: its bars are wider.
    const width = id === 'bicycle' ? 0.3 : 0.03;
    if (off[0]! > 0.06 || off[1]! > width || off[2]! > 0.04) {
      fail(`'${id}' is placed ${f(placed.z)} x ${f(placed.x)} x ${f(placed.y)} and taken as '${taken}' at ${model.size.map((n) => f(n)).join(' x ')}: it changes size when boarded`);
    }
    // Who is in it, at the hero's height.
    let who = '';
    if (part.mounts.length > 0) {
      const tall = RIDER_HEIGHT * section[1];
      who = `${part.mounts.length} rider(s) ${f(tall)} tall`;
      if (Math.abs(tall / H - 1) > 0.01) fail(`'${id}' carries its riders ${f(tall)} tall, not the hero's ${f(H)}`);
    } else {
      const drivers = glazeTraffic(built, findSceneryModel, false, section[0]);
      const tall = drivers.length > 0 ? drivers[0]!.height * section[0] : 0;
      who = drivers.length > 0 ? `glazed, its driver ${f(tall)} tall` : 'no driver';
      if (drivers.length === 0) fail(`'${id}' is closed and nobody can be seen driving it: no driver fits its cabin`);
      else if (Math.abs(tall / H - 1) > 0.01) fail(`'${id}' is driven by a body ${f(tall)} tall, not the hero's ${f(H)}`);
    }
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    rows++;
    console.log(`  ${id.padEnd(16)} ${f(placed.x)} wide, taken as ${taken.padEnd(10)} ${who}`);
  }
  for (const [id, style] of waterBy) {
    const part = parts.get(id);
    if (part === undefined) fail(`${style.id} sails '${id}', which no part builds`);
    else if (!part.mounts.some((mount) => mount.driver === true)) fail(`'${id}' is on the water in ${style.id} with nobody aboard to sail it`);
    else rows++;
  }

  // What stands parked: seats, and a cabin under any glass.
  for (const id of new Set(Object.values(PARKED_CRAFT))) {
    const model = craft.get(id);
    const still = parkedModel(id);
    if (model === undefined || still === null) {
      fail(`'${id}' is parked in the world and is no craft to take`);
      continue;
    }
    if (model.seats.length === 0) fail(`'${id}' is parked with no seat in it`);
    const group = model.build(0);
    if (group.getObjectByName('glass') !== undefined && group.getObjectByName('cabin') === undefined) {
      fail(`'${id}' has windows and no cabin behind them: nothing to see through them`);
    }
  }

  // The countryside: its vehicles are its machines, and each is a craft.
  for (const part of MACHINES) {
    if (parkedModel(part) === null || !craft.has(part)) fail(`the countryside's '${part}' is no craft to take`);
  }
  const vehicular = /boat|cart|car\b|truck|tractor|wagon|bus|van\b|bike|cycle|plane|ship/;
  for (const id of Object.keys(COUNTRY_PARTS)) {
    if (vehicular.test(id) && !MACHINES.has(id)) fail(`the countryside stands '${id}', a vehicle nobody can take`);
  }
  console.log(`  ${rows} vehicles on the roads and the water; ${MACHINES.size} countryside machine(s)`);
}
