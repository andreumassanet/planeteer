import { byKind, pathOf, insideSquare, ground, units } from './sites.ts';
import { distanceToPath } from '../../src/fleet.ts';
import { ROAD_CLASSES } from '../../src/roads.ts';
import { roads, places, check, world } from './setup.ts';
import { isWater } from '../../src/vehicles.ts';
import { unitAt, latOf, lonOf } from '../../src/sphere.ts';
import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { radiusOf } from '../../src/places.ts';

// --- cars ------------------------------------------------------------------------

console.log('\ncars:');
export const cars = [...(byKind.get('car') ?? []), ...(byKind.get('van') ?? [])];
let offRoad = 0;
let worstRoad = 0;
const inTown: string[] = [];
let wetCars = 0;
let facing = 0;
for (const car of cars) {
  const path = pathOf(car.road);
  const d = distanceToPath(path, car.at);
  worstRoad = Math.max(worstRoad, d);
  if (d > ROAD_CLASSES[roads[car.road]!.cls]!.width / 2) offRoad++;
  const town = insideSquare(car.at, 0);
  if (town !== null) inTown.push(`${car.id} in ${town}`);
  if (isWater(ground(car.at))) wetCars++;
  // Facing out of its town: away from the centre, give or take the curve.
  const centre = unitAt(places[car.place]!.lat, places[car.place]!.lon, new Vector3());
  const out = car.at.clone().sub(centre).projectOnPlane(car.at).normalize();
  if (out.dot(car.forward) < 0.2) facing++;
}
check(offRoad === 0, 'every car stands on its own carriageway', `worst ${worstRoad.toFixed(2)} units off the centre line against a half-width of ${ROAD_CLASSES[0]!.width / 2}`);
check(inTown.length === 0, 'no car stands inside a town square', inTown.slice(0, 5).join(', '));
check(wetCars === 0, 'no car stands in the water', `${wetCars}`);
check(facing <= cars.length * 0.02, 'cars face out of their town', `${facing} of ${cars.length} do not`);
const townsWithCars = new Set(cars.map((car) => car.place)).size;
const townsWithRoads = new Set(roads.flatMap((road) => [road.a, road.b])).size;
console.log(`       ${townsWithCars} of the ${townsWithRoads} towns with a road have a car at a gate`);

// --- launches ---------------------------------------------------------------------

console.log('\nlaunches:');
const boats = byKind.get('boat') ?? [];
let dry = 0;
let cramped = 0;
let boatsInTown = 0;
let farOut = 0;
export const across = new Vector3();
export const north = new Vector3();
export const corner = new Vector3();
for (const boat of boats) {
  const lat = latOf(boat.at.y);
  const lon = lonOf(boat.at.x, boat.at.z);
  if (!isWater(ground(boat.at)) || world.countryAt(lat, lon) !== 0) dry++;
  north.set(0, 1, 0).projectOnPlane(boat.at).normalize();
  across.crossVectors(boat.at, north).normalize();
  // Room all round at a hull's length, on sixteen bearings: twice the site's own eight.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    corner.copy(boat.at).addScaledVector(across, (Math.sin(a) * 10) / PLANET_RADIUS).addScaledVector(north, (Math.cos(a) * 10) / PLANET_RADIUS).normalize();
    if (!isWater(ground(corner))) {
      cramped++;
      break;
    }
  }
  if (insideSquare(boat.at, 0) !== null) boatsInTown++;
  const centre = unitAt(places[boat.place]!.lat, places[boat.place]!.lon, new Vector3());
  if (units(centre, boat.at) > radiusOf(places[boat.place]!) + 175) farOut++;
}
check(dry === 0, 'every launch is on water, by the ground and by `countryAt`', `${dry} of ${boats.length} are not`);
check(cramped <= boats.length * 0.01, 'launches have water round them at a hull length', `${cramped} of ${boats.length} touch land on one of sixteen bearings`);
check(boatsInTown === 0, 'no launch is inside a town square', `${boatsInTown}`);
check(farOut === 0, 'every launch is off its own town', `${farOut} further out than the search`);
