import './sky.ts';
import { PLANET_RADIUS, EARTH_RADIUS_KM, KM_PER_UNIT, surfaceRadiusOf, AU_KM, apparentPixels, AU_UNITS, type Body, type Species, SUN_DRAWN, drawnRadiusOf, meshWithin, EARTH_DRAWN, eclipticToWorld } from '../../src/system/contract.ts';
import { near, fail, DEG } from './setup.ts';
import { AVATAR_HEIGHT } from '../../src/stature.ts';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ELEMENTS, heliocentric } from '../../src/system/orbits.ts';
import { RUN_SPEED, WALK_SPEED } from '../../src/avatar.ts';
import { lonOf, latOf } from '../../src/sphere.ts';

// ===========================================================================
// 2. The scale
// ===========================================================================

console.log('\n\n=== the scale ===\n');

console.log(`  Earth is PLANET_RADIUS ${PLANET_RADIUS} against a real ${EARTH_RADIUS_KM} km,`);
// Read a world unit as a metre and the planet is 1:398 — which is the sense
// the scale table means, and it is *not* the avatar's scale. The avatar is 3.77
// units for a 1.75 m person, so the body is at about 1:0.46 of the same
// reading. That conflict is real, it is written down rather than hidden, and it
// is the reason this file states which of the two any number belongs to.
console.log(`  so one world unit is ${KM_PER_UNIT.toFixed(5)} km, and read as a metre that is 1:${((EARTH_RADIUS_KM * 1000) / PLANET_RADIUS).toFixed(0)}.`);
near('Earth round-trips through surfaceRadiusOf', surfaceRadiusOf(EARTH_RADIUS_KM), PLANET_RADIUS, 1e-9);

{
  const auInUnits = AU_KM / KM_PER_UNIT;
  const neptune = 30.06992276 * auInUnits;
  // The spacing between representable float32 values at |x|.
  const ulp = 2 ** (Math.floor(Math.log2(neptune)) - 23);
  console.log(`\n  at true scale: 1 au is ${(auInUnits / 1e6).toFixed(1)} M units and Neptune's orbit ${(neptune / 1e9).toFixed(2)} G units.`);
  console.log(`    float32 spacing there: ${ulp.toFixed(0)} units — ${(ulp / AVATAR_HEIGHT).toFixed(0)} people. Positions do not exist at that range.`);
  console.log(`    Earth from Mars at closest approach: ${apparentPixels(PLANET_RADIUS, 0.52 * auInUnits).toFixed(3)} px.`);
  if (ulp < AVATAR_HEIGHT) fail('float32 can hold a true-scale Neptune after all — the compression argument needs re-deriving');
}

console.log(`\n  so the orrery is ${AU_UNITS} units to the au, linear, with the ellipses untouched.`);
console.log('\n    body       real km   surface u    lap at a run    drawn u   mesh within   ratio to Earth');

// ===========================================================================
// 3. The bodies
// ===========================================================================

const BODY_DIR = resolve(import.meta.dirname, '../../src/system/bodies');
export const PART_DIR = resolve(import.meta.dirname, '../../src/system/parts');

export const bodies: Body[] = [];
/**
 * The moons with a `Body` file, kept apart as `index.ts` keeps them out of
 * the orrery: a moon's orbit is its planet's, so the neighbour rule and the
 * table of where everything is would read it as a second Earth. Its parts
 * and its species are the walking engine's (`worlds/bodies/moon/`), so the
 * decoration and species checks below are not its either; its countries,
 * cities and ground are, and it is checked with the worlds.
 */
export const moons: Body[] = [];
export const speciesById = new Map<string, Species>();
for (const file of readdirSync(BODY_DIR).filter((n) => n.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(BODY_DIR, file)).href)) as Record<string, unknown>;
  let found = 0;
  for (const value of Object.values(module)) {
    if (typeof value === 'object' && value !== null && typeof (value as Body).radiusKm === 'number' && typeof (value as Body).blurb === 'string') {
      ((value as Body).kind === 'moon' ? moons : bodies).push(value as Body);
      found++;
    }
  }
  const list = (module as { SPECIES?: readonly Species[] }).SPECIES;
  if (Array.isArray(list)) for (const one of list) speciesById.set(one.id, one);
  if (found !== 1) fail(`${file} exports ${found} bodies — one file, one world`);
}
bodies.sort((a, b) => (a.orbit === null ? -1 : ELEMENTS[a.orbit]!.epoch.a) - (b.orbit === null ? -1 : ELEMENTS[b.orbit]!.epoch.a));

for (const body of bodies) {
  const surface = surfaceRadiusOf(body.radiusKm);
  const drawn = body.kind === 'star' ? SUN_DRAWN : drawnRadiusOf(body.radiusKm);
  const lap = (2 * Math.PI * surface) / RUN_SPEED;
  console.log(
    `    ${body.id.padEnd(9)} ${body.radiusKm.toFixed(0).padStart(8)} ${surface.toFixed(0).padStart(10)}` +
      `   ${body.kind === 'star' ? '        —' : `${(lap / 60).toFixed(1).padStart(6)} min`}   ${drawn.toFixed(1).padStart(7)}   ${meshWithin(drawn).toFixed(0).padStart(9)}` +
      `   ${(drawn / EARTH_DRAWN).toFixed(2).padStart(6)} (real ${(body.radiusKm / EARTH_RADIUS_KM).toFixed(2)})`,
  );
}
console.log(`\n    (a lap of Earth at ${RUN_SPEED} units/s is ${((2 * Math.PI * PLANET_RADIUS) / RUN_SPEED / 60).toFixed(1)} min; at a walk, ${WALK_SPEED}, it is ${((2 * Math.PI * PLANET_RADIUS) / WALK_SPEED / 3600).toFixed(1)} h)`);

/**
 * The neighbour rule, which is what licenses the exaggeration.
 *
 * *Two neighbouring bodies' drawn radii must sum to less than half the minimum
 * distance between their orbits.* Half, so that whatever the phases do there is
 * always a gap of at least the same size again between the two discs. This is
 * the assertion that stops somebody raising `EARTH_DRAWN` until Venus and Earth
 * overlap in the middle of the frame.
 */
console.log('\n  the neighbour rule — drawn radii against the gap between the orbits:');
{
  const ordered = bodies.filter((b) => b.orbit !== null);
  const drawnOf = (b: Body): number => (b.kind === 'star' ? SUN_DRAWN : drawnRadiusOf(b.radiusKm));
  const star = bodies.find((b) => b.kind === 'star');
  const rows: [string, number, number][] = [];
  if (star !== undefined && ordered[0] !== undefined) {
    const inner = ELEMENTS[ordered[0]!.orbit!]!.epoch;
    rows.push([`sun / ${ordered[0]!.id}`, drawnOf(star) + drawnOf(ordered[0]!), inner.a * (1 - inner.e) * AU_UNITS]);
  }
  for (let i = 1; i < ordered.length; i++) {
    const a = ELEMENTS[ordered[i - 1]!.orbit!]!.epoch;
    const b = ELEMENTS[ordered[i]!.orbit!]!.epoch;
    const gap = (b.a * (1 - b.e) - a.a * (1 + a.e)) * AU_UNITS;
    rows.push([`${ordered[i - 1]!.id} / ${ordered[i]!.id}`, drawnOf(ordered[i - 1]!) + drawnOf(ordered[i]!), gap]);
  }
  for (const [label, sum, gap] of rows) {
    const share = sum / gap;
    console.log(`    ${label.padEnd(20)} radii sum ${sum.toFixed(1).padStart(7)}   gap ${gap.toFixed(0).padStart(6)}   ${(share * 100).toFixed(1)}% of it`);
    if (share > 0.5) fail(`${label}: the two discs take ${(share * 100).toFixed(1)}% of the gap between their orbits`);
  }
}

/**
 * The frame conversion, checked by a third party rather than by itself.
 *
 * The ecliptic frame goes to the world frame as `(x, y, z) -> (x, z, -y)`. Two
 * things have to be true and neither is obvious: its determinant must be +1,
 * because a reflection here would mirror the entire solar system exactly as
 * `z = +cos(lat) sin(lon)` mirrored the planet for months and passed every
 * check; and it must carry ecliptic longitude to *world* longitude unchanged,
 * where world longitude is `sphere.ts`'s `atan2(-z, x)`, the one `geo.ts` reads
 * it with, and not a fresh one.
 */
{
  const e1 = eclipticToWorld({ x: 1, y: 0, z: 0 });
  const e2 = eclipticToWorld({ x: 0, y: 1, z: 0 });
  const e3 = eclipticToWorld({ x: 0, y: 0, z: 1 });
  const det =
    e1.x * (e2.y * e3.z - e2.z * e3.y) -
    e2.x * (e1.y * e3.z - e1.z * e3.y) +
    e3.x * (e1.y * e2.z - e1.z * e2.y);
  console.log(`\n  ecliptic -> world: determinant ${det.toFixed(3)} (a reflection would be -1 and would mirror the system)`);
  if (Math.abs(det - 1) > 1e-9) fail(`the frame conversion has determinant ${det} — it is not a rotation`);
  for (const lon of [0, 45, 90, 135, 180, -90, -135]) {
    for (const lat of [0, 30, -60]) {
      const c = Math.cos(lat * DEG);
      const w = eclipticToWorld({ x: c * Math.cos(lon * DEG), y: c * Math.sin(lon * DEG), z: Math.sin(lat * DEG) });
      const gotLon = lonOf(w.x, w.z);
      const gotLat = latOf(w.y);
      if (Math.abs(((gotLon - lon + 540) % 360) - 180) > 1e-9) fail(`ecliptic lon ${lon} arrives as world lon ${gotLon.toFixed(4)}`);
      if (Math.abs(gotLat - lat) > 1e-9) fail(`ecliptic lat ${lat} arrives as world lat ${gotLat.toFixed(4)}`);
    }
  }
}

/** Where everything is right now, which is the whole point of the exercise. */
{
  const now = new Date();
  console.log(`\n  where they are at ${now.toISOString().slice(0, 16)}Z:`);
  console.log('    body        r (au)   ecl. lon   ecl. lat    orrery x, y, z');
  for (const body of bodies) {
    if (body.orbit === null) continue;
    const h = heliocentric(body.orbit, now);
    const w = eclipticToWorld(h);
    console.log(
      `    ${body.id.padEnd(9)} ${h.r.toFixed(4).padStart(8)} ${h.lon.toFixed(2).padStart(10)} ${h.lat.toFixed(2).padStart(9)}` +
        `    ${(w.x * AU_UNITS).toFixed(0).padStart(7)}, ${(w.y * AU_UNITS).toFixed(0).padStart(5)}, ${(w.z * AU_UNITS).toFixed(0).padStart(7)}`,
    );
  }
}
