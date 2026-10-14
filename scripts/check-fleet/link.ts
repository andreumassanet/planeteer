import './rockets.ts';
import { Object3D, Vector3 } from 'three';
import { sites, units } from './sites.ts';
import { writePose, applyPose, createLocalLink } from '../../src/fleet.ts';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { check, places } from './setup.ts';
import { isShown, radiusOf } from '../../src/places.ts';
import { unitAt, latOf, lonOf } from '../../src/sphere.ts';

// --- poses ---------------------------------------------------------------------------

console.log('\nposes:');
const object = new Object3D();
const pose: number[] = [];
let mirrored = 0;
for (const site of sites.filter((_, i) => i % 50 === 0)) {
  writePose(site.at.clone().multiplyScalar(PLANET_RADIUS), site.forward, site.at, pose);
  applyPose(pose, object);
  object.updateMatrix();
  if (!(object.matrix.determinant() > 0)) mirrored++;
  // The model's +Z must come out as the site's forward, and +Y as up.
  const z = new Vector3(0, 0, 1).applyQuaternion(object.quaternion);
  const y = new Vector3(0, 1, 0).applyQuaternion(object.quaternion);
  if (z.dot(site.forward) < 0.9999 || y.dot(site.at) < 0.9999) mirrored++;
}
check(mirrored === 0, 'a site pose stands a model the right way up, facing forward, with a positive determinant');

// --- the local link ---------------------------------------------------------------------

console.log('\nthe local link:');
{
  const link = createLocalLink('me');
  const id = sites[0]!.id;
  const took = await link.claim(id, 0);
  check(took && link.moved.get(id)?.seats[0] === 'me', 'a free seat is claimed');
  const where = [1, 2, 3, 0, 0, 1, 0, 1, 0];
  link.drive(id, where, 10);
  link.release(id, where);
  const left = link.moved.get(id);
  check(left !== undefined && left.seats.every((s) => s === null) && left.pose.join() === where.join(), 'released where it was driven, with nobody in it');
  const second = await link.claim(id, 1);
  link.release(id, null);
  check(second && link.moved.get(id)?.pose.join() === where.join(), 'a passenger leaving does not move it');
  check(link.sample(id, pose) === false, 'nobody else drives on a local link');
  // Sunk: back at its site, with nobody in it.
  await link.claim(id, 0);
  link.drive(id, where, 0);
  link.sink(id);
  check(!link.moved.has(id), 'a vehicle that sank is back at its site');
}

// --- named places ------------------------------------------------------------------------

console.log('\nnamed places:');
for (const name of ['Palma', 'Barcelona', 'Paris', 'Tokyo', 'Sydney', 'Nairobi']) {
  const index = places.findIndex((place) => place.name === name && isShown(place));
  if (index < 0) {
    console.log(`  ${name}: not built`);
    continue;
  }
  const centre = unitAt(places[index]!.lat, places[index]!.lon, new Vector3());
  const nearby = sites.filter((site) => units(site.at, centre) < radiusOf(places[index]!) + 220);
  console.log(`  ${name} (radius ${radiusOf(places[index]!).toFixed(0)}):`);
  for (const site of nearby) {
    const lat = latOf(site.at.y);
    const lon = lonOf(site.at.x, site.at.z);
    const owner = site.place === index ? '' : ` (of ${places[site.place]!.name})`;
    console.log(`    ${site.id.padEnd(22)} ${lat.toFixed(4)}, ${lon.toFixed(4)}  ${units(site.at, centre).toFixed(0)} units out${owner}`);
  }
}
