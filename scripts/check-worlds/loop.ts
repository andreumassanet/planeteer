import { only, fail } from './setup.ts';
import { WORLD_IDS, loadWorldSpec } from '../../src/worlds/registry.ts';
import { WORLD_TOWN_MAX, WORLD_TOWN_MIN, WORLD_TOWN_SCALE, worldTownLaw, validateBody, townRadii, surfaceRadiusOf, angularDistance, WORLD_TOWN_GAP } from '../../src/system/contract.ts';
import { radiusFor } from '../../src/places.ts';
import { EARTH_GRAVITY, JUMP_SPEED } from '../../src/worlds/player.ts';
import { colours, PALETTE_COLORS, checkGround, checkTowns, checkBuilt, checkDrawn, checkSky } from './ground.ts';
import { createTerrain } from '../../src/worlds/terrain.ts';
import { checkPeople, checkCraft, checkSaucer, checkParkedSaucers } from './actors.ts';
import { checkArrivals, checkRoads, checkOutposts, checkPolitical } from './settled.ts';

console.log('\n=== the worlds ===');
export const ids = only === undefined ? WORLD_IDS : WORLD_IDS.filter((id) => id === only);
if (ids.length === 0) fail(`no world '${only}' (there are ${WORLD_IDS.join(', ')})`);

// The law a town's size follows is Earth's, scaled up and clamped (`worldTownLaw`).
for (const pop of [40000, 300000]) {
  const want = Math.min(WORLD_TOWN_MAX, Math.max(WORLD_TOWN_MIN, WORLD_TOWN_SCALE * radiusFor(pop)));
  if (Math.abs(worldTownLaw(pop) - want) > 1e-9) fail(`worldTownLaw(${pop}) is ${worldTownLaw(pop)} and Earth's law scaled says ${want}`);
}

for (const id of ids) {
  const spec = await loadWorldSpec(id);
  const g = spec.body.gravity;
  const gravity = EARTH_GRAVITY * (g / 9.807);
  console.log(
    `\n${spec.body.name} (${spec.ground}, ${g} m/s2): a jump goes ${((JUMP_SPEED * JUMP_SPEED) / (2 * gravity)).toFixed(1)} units up` +
      ` and lasts ${((2 * JUMP_SPEED) / gravity).toFixed(2)} s`,
  );
  for (const problem of validateBody(spec.body)) fail(`${id}: ${problem}`);
  {
    // The towns' built discs: none inside another, and the sizes they came out at.
    const built = townRadii(spec.body, spec.landmarks);
    const perDegree = (surfaceRadiusOf(spec.body.radiusKm) * Math.PI) / 180;
    const list = spec.body.settlements;
    let tightest = Infinity;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a]!;
        const B = list[b]!;
        const gap = angularDistance(A.lat, A.lon, B.lat, B.lon) * perDegree - built.get(A.id)! - built.get(B.id)!;
        tightest = Math.min(tightest, gap);
        if (gap < 0) fail(`${id}: ${A.id} and ${B.id} are built inside each other (${gap.toFixed(1)})`);
      }
    }
    const sizes = [...built.values()].sort((x, y) => x - y);
    console.log(`  town sizes: ${sizes[0]!.toFixed(0)} to ${sizes[sizes.length - 1]!.toFixed(0)} units, median ${sizes[Math.floor(sizes.length / 2)]!.toFixed(0)}; tightest gap ${tightest.toFixed(0)} (wants ${WORLD_TOWN_GAP})`);
  }
  for (const [where, colour] of colours(spec)) {
    if (!PALETTE_COLORS.has(colour)) fail(`${id}: ${where} is 0x${colour.toString(16)}, not a palette colour`);
  }
  for (const [k, c] of (spec.relief.craters?.classes ?? []).entries()) {
    if (c.radius[1] > c.cell * 0.45) fail(`${id}: crater class ${k} reaches ${c.radius[1]} on a ${c.cell} lattice (at most ${c.cell * 0.45})`);
    if (c.chance < 0 || c.chance > 1) fail(`${id}: crater class ${k} has a chance of ${c.chance}`);
  }
  const terrain = createTerrain(spec);
  const again = createTerrain(spec);
  checkGround(spec, terrain, again);
  checkTowns(spec, terrain);
  checkBuilt(spec, terrain);
  checkDrawn(spec, terrain);
  checkSky(spec, terrain);
  checkPeople(spec);
  checkCraft(spec, terrain);
  checkSaucer(spec, terrain);
  checkArrivals(spec, terrain);
  checkParkedSaucers(spec, terrain);
  checkRoads(spec, terrain);
  checkOutposts(spec, terrain);
  checkPolitical(spec, terrain);
}
