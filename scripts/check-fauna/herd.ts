import './placing.ts';
import { resolve } from 'node:path';
import { here, ANIMALS, rigs, n, check } from './setup.ts';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
console.log('\nin the world — what a herd costs, against what a mover would');
// ---------------------------------------------------------------------------

/**
 * Drives `src/life.ts` over the real planet, the way `check-life.ts` does.
 *
 * The number this section exists for is the ratio, not the milliseconds: a
 * herd is one mesh however many head it has, so five animals cost one draw call
 * where five movers would cost five. That is the same trade `settlements.ts`
 * measured at one draw call against 218, arriving at the one thing in this world
 * that is honestly motionless.
 */
{
  const { loadLakes, loadWorld } = await import('../../src/geo.ts');
  const { PLANET_RADIUS, UNITS_PER_DEGREE } = await import('../../src/globe.ts');
  const { unitAt } = await import('../../src/sphere.ts');
  const { setDetailSites, setFlattenSites } = await import('../../src/terrain.ts');
  const { terrainSiteOf } = await import('../../src/places.ts');
  const { decodePlaces, inflate } = await import('../../src/pack.ts');
  const { createLife } = await import('../../src/life.ts');
  const { setDetail } = await import('../../src/view.ts');
  const { readFileSync, existsSync } = await import('node:fs');

  const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
  const lakesPath = resolve(here, '../public/data/lakes.bin');
  const lakes = existsSync(lakesPath) ? readFileSync(lakesPath) : outlines;
  globalThis.fetch = (async (url: string) => ({
    ok: true, status: 200,
    arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
  })) as unknown as typeof fetch;

  const monumentsPath = resolve(here, '../public/data/monuments.json');
  const monuments = existsSync(monumentsPath)
    ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: unknown[] }).monuments
    : [];
  setFlattenSites(monuments as never);
  const raw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
  setDetailSites(raw.map(terrainSiteOf));
  const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());

  const life = createLife(world, raw, { animals: ANIMALS, rigs });
  const at = (lat: number, lon: number, up: number): THREE.Vector3 => {
    const direction = unitAt(lat, lon, new THREE.Vector3());
    return direction.clone().multiplyScalar(PLANET_RADIUS + world.elevationAt(direction) + up);
  };

  const PLACES: [string, number, number][] = [
    ['Ulm, temperate', 48.40, 9.99],
    ['the Sahara', 23.0, 12.0],
    ['the Mongolian steppe', 46.5, 103.0],
    ['the Altiplano', -16.5, -68.2],
    ['Finnmark, tundra', 70.0, 25.0],
    ['the Serengeti', -2.3, 34.8],
    ['Cornwall', 50.3, -5.0],
    ['open ocean', 30.0, -40.0],
  ];

  console.log('\n  where                    detail  herds  animals   meshes  triangles   scan ms  cold   build ms');
  for (const detail of [0.5, 1, 3]) {
    setDetail(detail);
    for (const [name, lat, lon] of PLACES) {
      if (detail !== 1 && name !== 'Ulm, temperate' && name !== 'the Sahara') continue;
      const viewer = at(lat, lon, 8);
      // Forty frames: the scan admits, then `serve` builds one herd a frame
      // under `BUILD_BUDGET_MS`, exactly as it does in the browser.
      //
      // The median and not the worst, and that is not the softer test. On a
      // loaded machine a process descheduled mid-scan reads as a
      // ten-millisecond scan; `check-life.ts` says the same thing about the
      // same file. The first scan is separately worth having, because it is the
      // only cold one — every cache in the herd path is filled by it.
      const scans: number[] = [];
      const builds: number[] = [];
      for (let frame = 0; frame < 40; frame++) {
        life.update(viewer, 8, undefined, frame * 0.05);
        if (life.stats.lastScanMs > 0) scans.push(life.stats.lastScanMs);
        if (life.stats.lastBuildMs > 0) builds.push(life.stats.lastBuildMs);
      }
      const cold = scans[0] ?? 0;
      const mid = (list: number[]): number =>
        list.length === 0 ? 0 : [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!;
      const scanMs = mid(scans);
      const buildMs = mid(builds);
      const s = life.stats;
      console.log(
        `  ${name.padEnd(24)} ${String(detail).padStart(5)}  ${String(s.herd).padStart(5)}` +
        `  ${String(s.animals).padStart(7)}   ${String(s.meshes).padStart(6)}  ${String(s.triangles).padStart(9)}` +
        `   ${n(scanMs, 2).padStart(7)}  ${n(cold, 1).padStart(4)}   ${n(buildMs, 2).padStart(8)}`,
      );
    }
  }
  setDetail(1);

  // The claim, measured rather than asserted.
  const viewer = at(48.40, 9.99, 8);
  for (let frame = 0; frame < 40; frame++) life.update(viewer, 8, undefined, frame * 0.05);
  const s = life.stats;
  check(s.herd > 0, 'a herd stands in temperate farmland', `${s.herd} herds, ${s.animals} animals`);
  check(s.animals > s.herd, 'and a herd is more than one animal for one draw call',
    `${n(s.animals / Math.max(1, s.herd), 1)} animals a mesh — as movers they would be ${s.animals} meshes`);

  // The desert, which is the row the camel is for.
  const sahara = at(23.0, 12.0, 8);
  for (let frame = 0; frame < 40; frame++) life.update(sahara, 8, undefined, frame * 0.05);
  check(life.stats.herd > 0, 'and there are camels in the Sahara',
    `${life.stats.herd} herds, ${life.stats.animals} animals, cover 0.03`);

  // How many frames a cold arrival takes, which is the number that says
  // whether "no herd appeared" is a bug or a stale reading. Birds need no pool
  // at all — one mesh, vertices rewritten every frame — where a herd has to be
  // served out of `BUILD_BUDGET_MS`, so if the two ever diverged badly the herd
  // would be the one that looked broken.
  {
    const cold = createLife(world, raw, { animals: ANIMALS, rigs });
    // East of Nairobi, past its square: from the middle of a city no herd is within `HERD_REACH`.
    const spot = at(-1.29, 37.30, 8);
    let firstBird = 0;
    let firstHerd = 0;
    for (let f = 1; f <= 60; f++) {
      cold.update(spot, 8, undefined, f * 0.05);
      if (firstBird === 0 && cold.stats.birds > 0) firstBird = f;
      if (firstHerd === 0 && cold.stats.herd > 0) firstHerd = f;
    }
    console.log(`\n  cold arrival east of Nairobi: first bird on frame ${firstBird}, first herd on frame ${firstHerd}`);
    check(firstHerd > 0 && firstHerd <= 6, 'a herd is standing within a few frames of arriving',
      `frame ${firstHerd} against the birds' ${firstBird}`);
    check(cold.herds.frame === 60, 'the probe counts frames, so a stale reading is visible',
      `${cold.herds.frame} frames`);
  }

  // At altitude a mover is a near-field feature and a herd is more so.
  const high = at(48.40, 9.99, 1400);
  for (let frame = 0; frame < 20; frame++) life.update(high, 1400, undefined, frame * 0.05);
  check(life.stats.herd === 0, 'and nothing at 1,400 units up, where an animal is 8 pixels',
    `${life.stats.herd} herds`);

  // Nothing grazes the sea.
  const sea = at(30.0, -40.0, 8);
  for (let frame = 0; frame < 20; frame++) life.update(sea, 8, undefined, frame * 0.05);
  check(life.stats.herd === 0, 'and nothing grazes the open ocean', `${life.stats.herd} herds`);

  // -------------------------------------------------------------------------
  console.log('\n  and nothing grazes a mountain face');
  // -------------------------------------------------------------------------
  //
  // The gate has to bite where the ground is steep and nowhere else, and
  // both halves of that are the check: a slope rule that refuses everywhere is
  // the 40-unit town margin that emptied Europe, and one that refuses nowhere
  // is not installed. `life.herds` counts every gate in the order the scan
  // applies them, so the pair to read is `clearOfTown` — everything that
  // reached the slope — against `clearOfSlope`.

  const gateAt = (lat: number, lon: number): { reached: number; kept: number } => {
    const spot = at(lat, lon, 8);
    const fresh = createLife(world, raw, { animals: ANIMALS, rigs });
    for (let frame = 0; frame < 40; frame++) fresh.update(spot, 8, undefined, frame * 0.05);
    return { reached: fresh.herds.clearOfTown, kept: fresh.herds.clearOfSlope };
  };
  // The herd scan reaches `HERD_REACH`, six to thirteen cells, so a steep
  // place is one whose nearest cells are steep. The ranges are drawn in
  // radians and the planet is `WORLD_SCALE` times the nominal one, so most
  // of them are gentler than the gate: of 34 ranges sampled, these two are
  // where a cell in reach is still past `MAX_SLOPE`.
  const STEEP: [string, number, number][] = [
    ['the Southern Patagonian Andes', -49.3, -73.0],
    ['the Caucasus', 43.3, 42.5],
  ];
  const GENTLE: [string, number, number][] = [
    ['the Sahara', 23.0, 12.0],
    ['the Mongolian steppe', 46.5, 103.0],
    ['Cornwall', 50.3, -5.0],
  ];
  let bit = 0;
  let spared = 0;
  for (const [name, lat, lon] of STEEP) {
    const { reached, kept } = gateAt(lat, lon);
    const lost = reached === 0 ? 0 : (1 - kept / reached) * 100;
    console.log(`  ${name.padEnd(24)} ${kept} of ${reached} cells kept — the slope refused ${n(lost, 0)}%`);
    if (reached > 0 && kept < reached) bit++;
  }
  for (const [name, lat, lon] of GENTLE) {
    const { reached, kept } = gateAt(lat, lon);
    console.log(`  ${name.padEnd(24)} ${kept} of ${reached} cells kept`);
    if (kept === reached) spared++;
  }
  check(bit === STEEP.length, 'the slope gate empties the steep places', `${bit} of ${STEEP.length}`);
  check(spared === GENTLE.length, 'and takes nothing at all where the ground is flat',
    `${spared} of ${GENTLE.length}`);

  // -------------------------------------------------------------------------
  //
  // Each animal is seated on its own ground inside the herd it belongs to,
  // which is a property of the buffer rather than of the scan: seated at
  // `y = 0` in the herd's tangent plane the whole slab would float on one side
  // of a hill and sink on the other. The witness is that the seats differ, and
  // by an amount the site gate bounds, because a seat computed against the
  // wrong frame is a failure no still frame would show.
  //
  // `MAX_SLOPE` (0.577) over the widest spread a herd takes puts a ceiling on
  // it; 30 units is that with room, and the worst actually seen is printed.

  const seatsAt = (lat: number, lon: number): { herds: number; worst: number; tilted: number } => {
    const spot = at(lat, lon, 8);
    const fresh = createLife(world, raw, { animals: ANIMALS, rigs });
    for (let frame = 0; frame < 60; frame++) fresh.update(spot, 8, undefined, frame * 0.05);
    let herdCount = 0;
    let worst = 0;
    let tilted = 0;
    for (const child of fresh.group.children) {
      if (!child.visible || !child.name.startsWith('herd:')) continue;
      const mesh = child as THREE.Mesh;
      const box = new THREE.Box3().setFromBufferAttribute(
        mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
      );
      herdCount++;
      worst = Math.max(worst, Math.abs(box.min.y));
      // A herd whose lowest animal is a tenth of a unit under the origin is a
      // herd whose animals were not all put on one plane.
      if (box.min.y < -0.1) tilted++;
    }
    return { herds: herdCount, worst, tilted };
  };
  const hilly = seatsAt(-16.5, -68.2);
  const flat = seatsAt(46.5, 103.0);
  console.log(
    `\n  the Altiplano: ${hilly.tilted} of ${hilly.herds} herds are seated below their own origin, ` +
    `deepest ${n(hilly.worst, 2)} units`,
  );
  console.log(
    `  the Mongolian steppe: ${flat.tilted} of ${flat.herds}, deepest ${n(flat.worst, 2)} units`,
  );
  check(hilly.tilted > 0, 'an animal on a hillside is seated on its own ground, not on the herd\'s plane',
    `${hilly.tilted} of ${hilly.herds} herds`);
  check(hilly.worst < 30 && flat.worst < 30, 'and no seat runs away with itself',
    `worst ${n(Math.max(hilly.worst, flat.worst), 2)} units against the 30 the site gate allows`);

  // -------------------------------------------------------------------------
  //
  // Determinism, with the terrain in it. A herd's buffer is keyed on its
  // site now and seated on `reliefAt`, so it is a pure function of a
  // coordinate, a seed and nothing else — and `check-life.ts` cannot say so,
  // because it runs `createLife` without an animal registry. Two worlds at one
  // instant, compared on the vertices themselves rather than on a count.

  const hashHerds = (lat: number, lon: number): string => {
    const spot = at(lat, lon, 8);
    const fresh = createLife(world, raw, { animals: ANIMALS, rigs });
    for (let frame = 0; frame < 60; frame++) fresh.update(spot, 8, undefined, frame * 0.05);
    const rows: string[] = [];
    for (const child of fresh.group.children) {
      if (!child.visible || !child.name.startsWith('herd:')) continue;
      const array = (child as THREE.Mesh).geometry.getAttribute('position').array as Float32Array;
      let sum = 0;
      for (let i = 0; i < array.length; i++) sum = (sum * 31 + Math.round(array[i]! * 64)) % 1e12;
      rows.push(`${child.name}@${array.length}:${sum}:${child.position.toArray().map((v) => v.toFixed(3)).join(',')}`);
    }
    rows.sort();
    return rows.join('|');
  };
  let identical = 0;
  const WHERE: [number, number][] = [[48.40, 9.99], [-16.5, -68.2], [46.5, 103.0]];
  for (const [lat, lon] of WHERE) {
    const a = hashHerds(lat, lon);
    if (a.length > 0 && a === hashHerds(lat, lon)) identical++;
  }
  check(identical === WHERE.length, 'two worlds build the same herds, vertex for vertex',
    `${identical} of ${WHERE.length} places identical`);

  // -------------------------------------------------------------------------
  console.log('\n  a near herd, alive — it wanders, gets out of your way, and goes home');
  // -------------------------------------------------------------------------
  //
  // **Where an animal of a near herd goes is the herd's own admission asked
  // again**, and this is the assertion that it is: walked up to, run past,
  // stood beside and left, every animal of every near herd, every frame, is
  // inside its herd's room, on land, off a landmark's pad, on ground no
  // steeper than `MAX_SLOPE` under its own stance, clear of every road by the
  // road's own clearance and outside every built town's disc. Then that it
  // moved at all, that it moved off when approached, that the herd went back
  // to its merged buffer only with every animal at its own spot, and that
  // walking into one is a wall.
  {
    const { decodeRoads } = await import('../../src/pack.ts');
    const { indexPlaces, isShown, radiusOf } = await import('../../src/places.ts');
    const { roadClearance, roadGeometryFor, roadIndexFor } = await import('../../src/roads.ts');
    const { MAX_SLOPE, flattenWeightAt, gradeAt } = await import('../../src/terrain.ts');
    const { WALK_SPEED, RUN_SPEED } = await import('../../src/avatar.ts');
    const placed = indexPlaces(raw, 0).all;
    const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
    const network = roadsRaw.places === placed.length ? roadsRaw.roads : [];
    const geometry = roadGeometryFor(network, placed);
    const index = roadIndexFor(network, placed);
    const hits: number[] = [];
    const segment = new THREE.Vector3();
    const toward = new THREE.Vector3();
    const foot = new THREE.Vector3();
    const last = new THREE.Vector3();
    const here3 = new THREE.Vector3();
    /** How far inside a road's clearance a spot is, or 0 where it is clear of every road. */
    const intoRoad = (direction: THREE.Vector3): number => {
      let worst = 0;
      toward.copy(direction).multiplyScalar(PLANET_RADIUS);
      for (const hit of index.near(direction, 40, hits)) {
        const path = geometry.path(hit);
        const clear = roadClearance(network[hit]!.cls);
        for (let step = 0; step < path.count; step++) {
          here3.set(path.xyz[step * 3]!, path.xyz[step * 3 + 1]!, path.xyz[step * 3 + 2]!).multiplyScalar(PLANET_RADIUS);
          if (step > 0) {
            segment.subVectors(here3, last);
            const lengthSq = segment.lengthSq();
            const t = lengthSq > 1e-6 ? Math.max(0, Math.min(1, foot.subVectors(toward, last).dot(segment) / lengthSq)) : 0;
            foot.copy(last).addScaledVector(segment, t);
            worst = Math.max(worst, clear - foot.distanceTo(toward));
          }
          last.copy(here3);
        }
      }
      return worst;
    };
    const townDirs = placed.filter((place) => isShown(place)).map((place) => ({
      dir: unitAt(place.lat, place.lon, new THREE.Vector3()), radius: radiusOf(place),
    }));
    const intoTown = (direction: THREE.Vector3): number => {
      let worst = 0;
      for (const town of townDirs) {
        if (town.dir.dot(direction) < 0.999) continue;
        worst = Math.max(worst, town.radius - town.dir.angleTo(direction) * PLANET_RADIUS);
      }
      return worst;
    };

    const slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
    const dir = new THREE.Vector3();
    let frames = 0;
    let samples = 0;
    let outOfRoom = 0;
    let wet = 0;
    let onPad = 0;
    let worstGrade = 0;
    let worstRoad = 0;
    let worstTown = 0;
    let furthest = 0;
    let fled = 0;
    let herdsLived = 0;
    let homeAtRelease = true;
    let walls = 0;
    let wallTries = 0;

    const spots: [string, number, number][] = [
      ['Ulm', 48.40, 9.99],
      ['Cornwall', 50.3, -5.0],
      ['the Mongolian steppe', 46.5, 103.0],
      ['the Serengeti', -2.3, 34.8],
    ];
    for (const [name, lat, lon] of spots) {
      const lively = createLife(world, placed, { animals: ANIMALS, rigs, roads: network });
      const start = at(lat, lon, 2);
      for (let frame = 0; frame < 40; frame++) lively.update(start, 2, undefined, frame * 0.05, 0.05);
      // The nearest herd standing, and a walk up to it from 45 units off.
      let target: THREE.Vector3 | null = null;
      for (const child of lively.group.children) {
        if (!child.visible || !child.name.startsWith('herd:')) continue;
        if (target === null || child.position.distanceTo(start) < target.distanceTo(start)) target = child.position.clone();
      }
      if (target === null) {
        console.log(`  ${name.padEnd(24)} no herd near enough to walk to`);
        continue;
      }
      const up = target.clone().normalize();
      const side = new THREE.Vector3(0, 1, 0).projectOnPlane(up).normalize();
      const walkTo = (offset: number): THREE.Vector3 => {
        const d = up.clone().addScaledVector(side, offset / PLANET_RADIUS).normalize();
        return d.multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(d)) + 2);
      };
      // Out, in at a walk, through at a run, standing among them, and away.
      const legs: [number, number, number][] = [
        [45, 45, 2], [45, 4, WALK_SPEED], [4, 4, 6], [4, -30, RUN_SPEED], [-30, -30, 4], [-30, 160, WALK_SPEED * 2],
      ];
      let offset = 45;
      let clock = 10;
      let lived = false;
      let snappedBefore = lively.stats.snapped;
      const homes = new Map<string, number>();
      for (const [from, to, pace] of legs) {
        offset = from;
        const seconds = to === from ? pace : Math.abs(to - from) / pace;
        const step = 0.05;
        for (let t = 0; t < seconds; t += step) {
          if (to !== from) offset += Math.sign(to - from) * pace * step;
          const viewer = walkTo(offset);
          lively.update(viewer, 2, undefined, (clock += step), step);
          frames++;
          const standing = lively.grazers();
          if (standing.length > 0) lived = true;
          for (const herd of standing) {
            for (const head of herd.heads) {
              samples++;
              if (Math.hypot(head.x, head.z) > herd.room + 1e-3) outOfRoom++;
              dir.copy(herd.centre).addScaledVector(herd.right, head.x / PLANET_RADIUS)
                .addScaledVector(herd.forward, head.z / PLANET_RADIUS).normalize();
              if (world.elevationAt(dir) <= 0) wet++;
              if (flattenWeightAt(dir.x, dir.y, dir.z) > 0) onPad++;
              worstGrade = Math.max(worstGrade, gradeAt(dir, herd.right, herd.forward, head.stance, slope).grade);
              if (samples % 7 === 0) worstRoad = Math.max(worstRoad, intoRoad(dir));
              if (samples % 7 === 0) worstTown = Math.max(worstTown, intoTown(dir));
              furthest = Math.max(furthest, Math.hypot(head.x - head.homeX, head.z - head.homeZ));
              if (head.mode === 'flee') fled++;
              homes.set(herd.key, Math.max(homes.get(herd.key) ?? 0, Math.hypot(head.x - head.homeX, head.z - head.homeZ)));
            }
          }
          // Walk into the nearest animal: the body is pushed back out of it.
          if (to === from && pace === 6 && standing.length > 0 && t < step) {
            for (const herd of standing) {
              for (const head of herd.heads) {
                wallTries++;
                const push = new THREE.Vector3();
                const into = head.world.clone().addScaledVector(herd.right, 0.3);
                if (lively.collide(into, 0.7, 0.7, push) && push.length() > 0) walls++;
              }
            }
          }
        }
      }
      if (lived) herdsLived++;
      if (lively.stats.snapped !== snappedBefore) homeAtRelease = false;
      snappedBefore = lively.stats.snapped;
      console.log(
        `  ${name.padEnd(24)} ${lively.grazers().length === 0 ? 'handed back' : 'still standing'}` +
        `, furthest from its spot ${n(Math.max(0, ...homes.values()), 1)} units, snapped ${lively.stats.snapped}`,
      );
    }
    console.log(
      `  ${frames} frames, ${samples} animal-frames: worst grade ${n(worstGrade, 3)} against ${n(MAX_SLOPE, 3)}, ` +
      `deepest into a road's clearance ${n(worstRoad, 2)}, into a town ${n(worstTown, 2)}`,
    );
    check(herdsLived >= 3, 'a near herd stands up as its animals where you walk to one', `${herdsLived} of ${spots.length} places`);
    check(furthest > 2, 'and its animals move: nothing near is a statue', `furthest ${n(furthest, 1)} units from its spot`);
    check(fled > 0, 'they move off when you come close', `${fled} animal-frames running from you`);
    check(outOfRoom === 0, 'every animal stays inside its herd\'s room', `${outOfRoom} of ${samples}`);
    check(wet === 0 && onPad === 0, 'and on land, off every landmark\'s pad', `${wet} wet, ${onPad} on a pad`);
    check(worstGrade <= MAX_SLOPE, 'and never on ground steeper than MAX_SLOPE', `worst ${n(worstGrade, 3)}`);
    check(worstRoad <= 0, 'and never inside a road\'s clearance', `deepest ${n(worstRoad, 2)} units`);
    check(worstTown <= 0, 'and never inside a built town\'s disc', `deepest ${n(worstTown, 2)} units`);
    check(homeAtRelease, 'walked away from, a herd goes back to its merged frames only with every animal home');
    check(wallTries > 0 && walls === wallTries, 'and an animal is a wall to whoever walks into it', `${walls} of ${wallTries}`);
  }
}
