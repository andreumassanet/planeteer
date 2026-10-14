import { type WorldSpec } from '../../src/worlds/contract.ts';
import { scriptOf, writeLine, svgOf } from '../../src/worlds/glyphs.ts';
import { fail } from './setup.ts';
import { scriptsBySpecies, ctx, fingerprint, gradientMap, trianglesOf } from './ground.ts';
import { bodyOf } from '../../src/worlds/aliens.ts';
import { BUDGETS } from '../../src/system/contract.ts';
import { type Terrain } from '../../src/worlds/terrain.ts';
import * as THREE from 'three';
import { unitAt } from '../../src/sphere.ts';
import { createCraft } from '../../src/worlds/craft.ts';
import { EARTH_GRAVITY, BODY_RADIUS } from '../../src/worlds/player.ts';
import { AVATAR_HEIGHT } from '../../src/stature.ts';
import { UFO_COCKPIT, UFO_HEAD_ROOM, UFO_RADIUS } from '../../src/worlds/ufo.ts';
import { HERO } from '../../src/craft/body.ts';
import { FIGURE } from '../../src/avatar.ts';
import { createSettlements, type Site, PLATFORM_LIFT } from '../../src/worlds/settlements.ts';
import { createRoads } from '../../src/worlds/roads.ts';
import { type UfoProbe, siteAt, padOf, ufoParkingOf, parkingOf, UFO_GRADE, SQUARE_CORNERS } from '../../src/worlds/arrival.ts';
import { ROCKET_CLEAR } from '../../src/rocket.ts';

export function checkPeople(spec: WorldSpec): void {
  const civ = spec.civilisation;
  if (civ === null) return;
  const script = scriptOf(civ.script);
  const again = scriptOf(civ.script);
  if (JSON.stringify(script.glyphs) !== JSON.stringify(again.glyphs)) fail(`${spec.id}: the script differs between two builds`);
  const paths = new Set(script.glyphs.map((g) => g.d));
  if (paths.size !== script.glyphs.length) fail(`${spec.id}: two glyphs of the ${civ.species.name} script are the same`);
  if (script.glyphs.length < 12) fail(`${spec.id}: the script has only ${script.glyphs.length} glyphs`);
  const owner = civ.species.id;
  for (const [other, theirs] of scriptsBySpecies) {
    if (other === owner) continue;
    const shared = [...paths].filter((d) => theirs.has(d)).length;
    if (shared > 0) fail(`${spec.id}: the ${owner} script shares ${shared} glyphs with the ${other} script`);
  }
  scriptsBySpecies.set(owner, paths);
  let lines = 0;
  for (const part of ['greet', 'world', 'visitor', 'farewell'] as const) {
    for (const english of civ.phrases[part]) {
      const written = writeLine(script, english);
      lines++;
      if (written.words.length === 0) fail(`${spec.id}: "${english}" writes as nothing`);
      if (JSON.stringify(writeLine(script, english).words) !== JSON.stringify(written.words)) fail(`${spec.id}: "${english}" writes differently twice`);
      if (!svgOf(script, written).startsWith('<svg')) fail(`${spec.id}: "${english}" draws no svg`);
    }
  }
  // The bodies: deterministic and in budget.
  const body = bodyOf(ctx, spec, civ, 0);
  const twice = bodyOf(ctx, spec, civ, 0);
  if (fingerprint(body.geometry) !== fingerprint(twice.geometry)) fail(`${spec.id}: the same ${civ.species.name} builds differently twice`);
  const triangles = body.geometry.getAttribute('position').count / 3;
  if (triangles > BUDGETS.alien.triangles) fail(`${spec.id}: a ${civ.species.name} is ${triangles} triangles`);
  // Every vertex bound, and to a joint the skeleton has.
  const skin = body.geometry.getAttribute('skinIndex');
  const weight = body.geometry.getAttribute('skinWeight');
  let unbound = 0;
  for (let i = 0; i < skin.count; i++) {
    if (skin.getX(i) >= body.rig.bones.length || Math.abs(weight.getX(i) - 1) > 1e-6) unbound++;
  }
  if (unbound > 0) fail(`${spec.id}: ${unbound} vertices of a ${civ.species.name} are bound to no joint`);
  if (body.inverses.length !== body.rig.bones.length) fail(`${spec.id}: a ${civ.species.name}'s skeleton has ${body.inverses.length} inverses for ${body.rig.bones.length} joints`);
  console.log(
    `  people: the ${civ.species.name}, ${script.glyphs.length} glyphs, ${lines} lines, ${triangles} triangles a body on ${body.rig.bones.length} joints, ` +
      `${body.height.toFixed(1)} units tall${body.float ? ', floating' : ''}`,
  );
}

export function checkCraft(spec: WorldSpec, terrain: Terrain): void {
  const here = new THREE.Vector3();
  unitAt(5, 5, here);
  for (const vehicle of spec.vehicles) {
    const kind = typeof vehicle === 'string' ? vehicle : `${vehicle.kind} (${vehicle.name})`;
    const flies = fliesOf(vehicle);
    const craft = createCraft(vehicle, ctx, gradientMap, here.clone().multiplyScalar(terrain.radius), new THREE.Vector3(0, 1, 0).addScaledVector(here, -here.y).normalize(), spec.wind);
    const groundAt = (p: THREE.Vector3): number => {
      const n = p.clone().normalize();
      return terrain.groundAt(n.x, n.y, n.z);
    };
    for (let k = 0; k < 120; k++) craft.update(1 / 60, { throttle: 1, steer: 0.3, climb: flies && k < 60, descend: false }, groundAt, EARTH_GRAVITY, terrain.radius);
    const p = craft.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) fail(`${spec.id}: the ${kind} drove off to ${p.toArray()}`);
    const over = p.length() - terrain.radius - groundAt(p);
    if (over < -0.01) fail(`${spec.id}: the ${kind} is ${(-over).toFixed(2)} under the ground after two seconds`);
    const m = craft.object.matrixWorld.clone();
    craft.object.updateMatrixWorld(true);
    if (craft.object.matrixWorld.determinant() <= 0 && m !== null) fail(`${spec.id}: the ${kind}'s frame is mirrored`);
    const triangles = trianglesOf(craft.object);
    if (triangles > 3000) fail(`${spec.id}: the ${kind} is ${triangles} triangles`);
  }
}


/** Whether the craft of a spec flies, by kind. */
export function fliesOf(vehicle: WorldSpec['vehicles'][number]): boolean {
  const kind = typeof vehicle === 'string' ? vehicle : vehicle.kind;
  return kind === 'lander' || kind === 'aerostat' || kind === 'ufo';
}

/**
 * The saucer as the world builds it: its cockpit against the seated body,
 * its glass, its frames, and a flight — up, a hover with no key held, the
 * legs folded and the beam lit low, and down again to park.
 */
export function checkSaucer(spec: WorldSpec, terrain: Terrain): void {
  const vehicle = spec.vehicles.find((one) => (typeof one === 'string' ? one : one.kind) === 'ufo');
  if (vehicle === undefined) return;
  const H = AVATAR_HEIGHT;
  const { hip, dome } = UFO_COCKPIT;
  // The dome's height over the collar at a distance `r` from its axis.
  const glassAt = (r: number): number => (r >= dome.radius ? 0 : dome.height * Math.sqrt(1 - (r / dome.radius) ** 2));
  const inside = (x: number, y: number, z: number): boolean => ((x * x + z * z) / dome.radius ** 2 + ((y - dome.y) / dome.height) ** 2) < 1;
  // The crown, and a head's width round it, under the glass with room.
  const crown = hip.y + HERO.crown;
  let headRoom = Infinity;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = Math.hypot(hip.x + Math.cos(a) * 0.06 * H, hip.z + Math.sin(a) * 0.06 * H);
    headRoom = Math.min(headRoom, dome.y + glassAt(r) - crown);
  }
  if (headRoom < UFO_HEAD_ROOM) fail(`${spec.id}: the saucer's pilot has ${headRoom.toFixed(2)} units over the crown, under ${UFO_HEAD_ROOM.toFixed(2)}`);
  // The shoulders at their height, the pack behind the hip, the knees and toes ahead.
  const points: [string, number, number, number][] = [
    ['left shoulder', hip.x - HERO.half, hip.y + HERO.shoulder, hip.z],
    ['right shoulder', hip.x + HERO.half, hip.y + HERO.shoulder, hip.z],
    ['pack', hip.x, hip.y + HERO.shoulder, hip.z - HERO.back],
    ['knees', hip.x, hip.y + HERO.kneeTop, hip.z + HERO.knee],
    ['toes', hip.x, hip.y - HERO.sole, hip.z + HERO.toe],
  ];
  for (const [what, x, y, z] of points) {
    if (y >= dome.y && !inside(x, y, z)) fail(`${spec.id}: the saucer's pilot's ${what} is through the dome`);
    if (Math.hypot(x, z) > dome.radius) fail(`${spec.id}: the saucer's pilot's ${what} is outside the cockpit's floor`);
  }
  if (hip.y - HERO.sole < UFO_COCKPIT.floor - 0.02 * H) fail(`${spec.id}: the saucer's pilot's soles are through its floor`);

  const here = new THREE.Vector3();
  unitAt(5, 5, here);
  const R = terrain.radius;
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(here, -here.y).normalize();
  const make = () => createCraft(vehicle, ctx, gradientMap, here.clone().multiplyScalar(R + terrain.groundAt(here.x, here.y, here.z)), north.clone(), spec.wind);
  const craft = make();
  // The seat and the eye the world reads: the hips over the seat, and the eye under the glass.
  if (Math.abs(craft.seat.y + FIGURE.hipY - hip.y) > 1e-6) fail(`${spec.id}: the saucer's seat is not its cockpit's hips`);
  if (craft.eye === null) fail(`${spec.id}: the saucer has no seated eye for V`);
  else if (!inside(craft.eye.x, craft.eye.y, craft.eye.z)) fail(`${spec.id}: the saucer's seated eye is outside its dome`);
  // Built twice, the same.
  const fingerprints = (object: THREE.Object3D): string[] => {
    const out: string[] = [];
    object.traverse((one) => {
      const mesh = one as THREE.Mesh;
      if (mesh.isMesh === true) out.push(`${mesh.name}:${fingerprint(mesh.geometry)}`);
    });
    return out;
  };
  if (JSON.stringify(fingerprints(craft.object)) !== JSON.stringify(fingerprints(make().object))) fail(`${spec.id}: the saucer differs between two builds`);
  // The glass: transparent, writing its depth, no hull; and nothing mirrored.
  let panes = 0;
  craft.object.updateMatrixWorld(true);
  const instance = new THREE.Matrix4();
  craft.object.traverse((one) => {
    const mesh = one as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const material = mesh.material as THREE.Material;
    if (mesh.name === 'ufo glass') {
      panes++;
      if (!material.transparent || !material.depthWrite) fail(`${spec.id}: the saucer's glass is not a see-through fill that writes its depth`);
      if (material.userData.outlineParameters?.visible !== false) fail(`${spec.id}: the saucer's glass has an ink hull, which shows through it`);
    }
    if (mesh.matrixWorld.determinant() <= 0) fail(`${spec.id}: the saucer's ${mesh.name || 'part'} is mirrored`);
    const many = mesh as THREE.InstancedMesh;
    if (many.isInstancedMesh === true) {
      for (let k = 0; k < many.count; k++) {
        many.getMatrixAt(k, instance);
        if (instance.determinant() <= 0) fail(`${spec.id}: the saucer's lamp ${k} is mirrored`);
      }
    }
  });
  if (panes !== 2) fail(`${spec.id}: the saucer's dome is ${panes} shells, not the far and the near`);
  const triangles = trianglesOf(craft.object);
  if (triangles > 3000) fail(`${spec.id}: the saucer is ${triangles} triangles`);

  // A flight over this world's own ground.
  const groundAt = (p: THREE.Vector3): number => {
    const n = p.clone().normalize();
    return terrain.groundAt(n.x, n.y, n.z);
  };
  const over = (): number => craft.position.length() - R - groundAt(craft.position);
  const gear = craft.object.getObjectByName('gear')!;
  const beam = craft.object.getObjectByName('ufo beam')!;
  const dt = 1 / 60;
  const fly = (frames: number, controls: { throttle?: number; climb?: boolean; descend?: boolean }): void => {
    for (let k = 0; k < frames; k++) craft.update(dt, { throttle: controls.throttle ?? 0, steer: 0, climb: controls.climb ?? false, descend: controls.descend ?? false }, groundAt, spec.body.gravity, R);
  };
  fly(30, { climb: true });
  if (!craft.airborne) fail(`${spec.id}: the saucer does not lift off on the climb key`);
  if (!beam.visible) fail(`${spec.id}: the saucer lights no beam low over the ground`);
  fly(120, { climb: true });
  // Let go: it stops within a second, and then it stays.
  fly(60, {});
  const held = over();
  fly(180, {});
  const drift = Math.abs(over() - held);
  if (drift > 1) fail(`${spec.id}: the saucer drifts ${drift.toFixed(1)} units in three seconds of hovering with no key held`);
  if (gear.visible && over() > 12) fail(`${spec.id}: the saucer keeps its legs down ${over().toFixed(0)} units up`);
  const climbed = held;
  fly(240, { throttle: 1 });
  if (craft.speed < 50) fail(`${spec.id}: the saucer is at ${craft.speed.toFixed(0)} units a second after four seconds of throttle`);
  let frames = 0;
  while (craft.airborne && frames < 60 * 60) {
    fly(1, { descend: true });
    frames++;
  }
  if (craft.airborne) fail(`${spec.id}: the saucer does not come down in a minute on the descend key`);
  fly(60, {});
  if (!gear.visible) fail(`${spec.id}: the saucer parks with its legs up`);
  if (over() < -0.01) fail(`${spec.id}: the saucer parks ${(-over()).toFixed(2)} under the ground`);
  craft.object.updateMatrixWorld(true);
  if (craft.object.matrixWorld.determinant() <= 0) fail(`${spec.id}: the saucer's frame is mirrored`);
  console.log(
    `  saucer: ${triangles} triangles, ${headRoom.toFixed(2)} units over the crown, up to ${climbed.toFixed(0)} and held within ${drift.toFixed(2)}, down in ${(frames / 60).toFixed(1)} s`,
  );
}

/**
 * The saucers parked off the towns' corners, as the world parks them
 * (`worlds/index.ts`): the same probes in the town's frame, then held
 * against what the world builds round each.
 */
export function checkParkedSaucers(spec: WorldSpec, terrain: Terrain): void {
  const R = terrain.radius;
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  const roads = createRoads(spec, terrain, settlements.sites, settlements.network, gradientMap);
  const at = new THREE.Vector3();
  const groundAt = (point: THREE.Vector3): number => {
    const n = point.clone().normalize();
    const floor = settlements.floorAt(n.x, n.y, n.z);
    const land = terrain.groundAt(n.x, n.y, n.z);
    return floor === null ? land : Math.max(land, floor);
  };
  const probeOf = (site: Site): UfoProbe => ({
    road: (x, z, within) => roads.near(settlements.toWorld(site, x, 0, z, at), within).length > 0,
    other: (x, z) => {
      const found = siteAt(settlements.sites, R, settlements.toWorld(site, x, 0, z, at));
      return found !== null && found !== site;
    },
    ground: (x, z) => groundAt(settlements.toWorld(site, x, 0, z, at)),
  });
  const placed = (site: Site, x: number, z: number): THREE.Vector3 => {
    settlements.toWorld(site, x, 0, z, at).normalize();
    return at.clone().multiplyScalar(R + groundAt(at));
  };
  let count = 0;
  let grids = 0;
  let nearestRoad = Infinity;
  for (const site of settlements.sites) {
    if (site.landmark) continue;
    if (site.town !== null) grids++;
    const pad = padOf(site, spec.vehicles.length, probeOf(site).road);
    const kept = ufoParkingOf(spec, site, pad.corner, probeOf(site));
    const two = ufoParkingOf(spec, site, pad.corner, probeOf(site));
    if (JSON.stringify(kept) !== JSON.stringify(two)) fail(`${spec.id}: ${site.id}'s saucer differs between two asks`);
    if (kept !== null) count++;
    // And the one waiting for a traveller come down in the town (`always`),
    // which is the town's own where it keeps one: every town's is held.
    const one = ufoParkingOf(spec, site, pad.corner, probeOf(site), true);
    if (kept !== null && JSON.stringify(kept) !== JSON.stringify(one)) fail(`${spec.id}: ${site.id}'s arrival saucer is not the one it keeps`);
    if (one === null) continue;
    const name = `${spec.id}: the saucer by ${site.id}${kept === null ? ' (at the arrival)' : ''}`;
    if (one.corner === pad.corner) fail(`${name} stands on the rocket's corner`);
    if (Math.hypot(one.x - pad.x, one.z - pad.z) < UFO_RADIUS + ROCKET_CLEAR) fail(`${name} is on the rocket's pad`);
    // Every wall of the towns round it, built.
    const where = placed(site, one.x, one.z);
    settlements.prime(where);
    if (site.mesh === null) settlements.prime(site.origin);
    if (settlements.collide(where.clone(), UFO_RADIUS)) fail(`${name} stands in a wall`);
    // Its own town's walls inside the square, which is what keeps it clear of them.
    const half = site.town!.grid.half;
    for (const f of site.footprints) {
      if (Math.abs(f.x) + f.radius > half + 6 - 1e-6 || Math.abs(f.z) + f.radius > half + 6 - 1e-6) {
        fail(`${name}: a wall of the town reaches ${Math.max(Math.abs(f.x), Math.abs(f.z)) + f.radius - half} past its square`);
        break;
      }
    }
    // Off every road, past its carriageway.
    for (const hit of roads.near(where, UFO_RADIUS + 40)) {
      const p = new THREE.Vector3();
      roads.place(hit.road, hit.s, 0, p, new THREE.Vector3());
      const gap = p.setLength(R).distanceTo(where.clone().setLength(R)) - roads.halfOf(hit.road);
      nearestRoad = Math.min(nearestRoad, gap - UFO_RADIUS);
      if (gap < UFO_RADIUS + 2) fail(`${name} is on a road (${gap.toFixed(1)} units from its kerb)`);
    }
    const other = siteAt(settlements.sites, R, where);
    if (other !== null && other !== site) fail(`${name} stands in ${other.id}`);
    // Clear of the craft waiting at the arrival and of the town's own.
    spec.vehicles.forEach((vehicle, k) => {
      const spot = parkingOf(site, k, fliesOf(vehicle));
      if (Math.hypot(spot.x - one.x, spot.z - one.z) < UFO_RADIUS + 9) fail(`${name} is on the arrival's craft ${k}`);
    });
    for (const spot of settlements.craftAt(site)) if (Math.hypot(spot.x - one.x, spot.z - one.z) < UFO_RADIUS + 6) fail(`${name} is on a craft parked in the town`);
    // Level enough under its legs.
    const g = probeOf(site).ground;
    const middle = g(one.x, one.z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const span = UFO_RADIUS * 0.65;
      if (Math.abs(g(one.x + Math.cos(a) * span, one.z + Math.sin(a) * span) - middle) / span > UFO_GRADE + 1e-9) fail(`${name} stands on ground over 12 degrees`);
    }
    // Walked to from the square's corner: no wall on the way, no cliff — but
    // a deck town's platform edge, `PLATFORM_LIFT`, which a foot steps up.
    const [sx, sz] = SQUARE_CORNERS[one.corner]!;
    let before = g(sx * half, sz * half);
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      const x = sx * half + (one.x - sx * half) * t;
      const z = sz * half + (one.z - sz * half) * t;
      const h = g(x, z);
      const step = Math.hypot(one.x - sx * half, one.z - sz * half) / 12;
      // On a deck, the platform's edge taken off the rise once.
      const rise = Math.abs(h - before);
      if ((spec.ground === 'cloud-deck' ? Math.max(0, rise - PLATFORM_LIFT) : rise) / step > 1) {
        fail(`${name} is up a slope over 45 degrees from the square (${before.toFixed(2)} to ${h.toFixed(2)} over ${step.toFixed(1)} units, ${k} of 12)`);
        break;
      }
      before = h;
      if (t < 1 - (UFO_RADIUS + BODY_RADIUS) / Math.hypot(one.x - sx * half, one.z - sz * half) && settlements.collide(placed(site, x, z), BODY_RADIUS)) {
        fail(`${name}: a wall stands between it and the square`);
        break;
      }
    }
  }
  if (count === 0) fail(`${spec.id}: no town keeps a saucer`);
  console.log(`  saucers: ${count} parked by ${grids} grid towns, nearest road ${Number.isFinite(nearestRoad) ? nearestRoad.toFixed(1) : '-'} units past the footprint`);
  roads.dispose();
  settlements.dispose();
}

/**
 * The roads: the network a function of the towns and the ground, and every
 * built piece's top over the drawn ground across its whole width, which is
 * what the crown's floor of a lift over both edges promises.
 */
