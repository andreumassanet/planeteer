/**
 * Headless assertions over `src/scenery/solids.ts` — the walls a body cannot
 * walk through.
 *
 * **A collision bug is a position, not a picture.** A body that snags on a
 * party wall, tunnels through a thin one at a run or is spat out of a terrace
 * on the wrong side all look like a man walking in a screenshot; each of them
 * is one number here. The body is the player's own — `BODY_RADIUS` and
 * `RUN_SPEED` are imported, not restated — and the sub-step loop is `slide`,
 * the same function `player.ts` walks with, so what passes here is what the
 * player does in the plane.
 *
 * `freeSpot` is checked against a third party: a brute-force grid search
 * written here from the rectangles alone, not from the file under test.
 *
 *   node scripts/check-solids.ts
 */
import * as THREE from 'three';
import { RUN_SPEED, WALK_SPEED } from '../src/avatar.ts';
import { BODY_RADIUS } from '../src/player.ts';
import {
  MAX_STEPS,
  STEP_FRACTION,
  enclosed,
  freeSpot,
  overlaps,
  pushOut,
  slide,
  solidAt,
  solidField,
  yawed,
} from '../src/scenery/solids.ts';
import type { Body, Solid, SolidField, Walls } from '../src/scenery/solids.ts';

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
const n = (value: number, places = 4): string => value.toFixed(places);
const near = (a: number, b: number, tolerance = 1e-9): boolean => Math.abs(a - b) <= tolerance;

const R = BODY_RADIUS;
const began = performance.now();
const box = (x: number, z: number, hx: number, hz: number, top = 16010): Solid => yawed(x, z, 0, hx, hz, top);
const push = { x: 0, z: 0 };
const out = { x: 0, z: 0 };

/** The walls of one field, the way the settlements will hand them to the player. */
const wallsOf = (field: SolidField): Walls => ({
  collide: (x, z, radius, p) => pushOut(field, x, z, radius, p),
  freeSpot: (x, z, radius, o) => freeSpot(field, x, z, radius, o),
});

/** Distance from a point to a solid's footprint; 0 inside. Written from the record, not the file. */
function distanceTo(s: Solid, x: number, z: number): number {
  const dx = x - s.x;
  const dz = z - s.z;
  const u = Math.abs(dx * s.cos + dz * s.sin) - s.hx;
  const v = Math.abs(-dx * s.sin + dz * s.cos) - s.hz;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0));
}
const nearestWall = (solids: readonly Solid[], x: number, z: number): number =>
  Math.min(...solids.map((s) => distanceTo(s, x, z)));

// --- one box, from every side ----------------------------------------------

console.log(`\none box  (body radius ${R}, from player.ts)`);
{
  const solids = [box(0, 0, 5, 3)];
  const field = solidField(solids);
  const sides: [string, number, number, number, number][] = [
    ['+x face', 5 + R - 0.4, 0.7, 0.4, 0],
    ['-x face', -(5 + R - 0.4), -0.7, -0.4, 0],
    ['+z face', 1.5, 3 + R - 0.25, 0, 0.25],
    ['-z face', -1.5, -(3 + R - 0.25), 0, -0.25],
  ];
  for (const [label, x, z, px, pz] of sides) {
    const hit = pushOut(field, x, z, R, push);
    check(hit && near(push.x, px) && near(push.z, pz), `pushed straight out of the ${label}`,
      `push (${n(push.x)}, ${n(push.z)})`);
  }
  const clear = pushOut(field, 5 + R + 0.01, 0, R, push);
  check(!clear && push.x === 0 && push.z === 0, 'a body a hundredth clear is not touched');
  const touching = pushOut(field, 5 + R, 0, R, push);
  check(!touching, 'a body resting exactly on the wall is contact, not a hit');

  pushOut(field, 4, 0, R, push);
  check(near(push.x, 5 - 4 + R) && near(push.z, 0), 'from inside, out of the nearest side (+x, 2.3)',
    `push (${n(push.x)}, ${n(push.z)})`);
  pushOut(field, 0.5, 2.5, R, push);
  check(near(push.x, 0) && near(push.z, 3 - 2.5 + R), 'from inside, out of the nearest side (+z, 1.8)',
    `push (${n(push.x)}, ${n(push.z)})`);

  // The corner: the push is along the diagonal and leaves the body exactly R
  // from the corner point, which is what rounds it.
  const cx = 5 + R * 0.35;
  const cz = 3 + R * 0.35;
  pushOut(field, cx, cz, R, push);
  const after = Math.hypot(cx + push.x - 5, cz + push.z - 3);
  check(near(after, R) && near(push.x, push.z), 'a corner pushes along the diagonal to exactly R',
    `${n(after)} from the corner`);

  check(solidAt(field, 4.9, 2.9) === solids[0] && solidAt(field, 5.2, 0) === null, 'solidAt: inside, and not');
  check(solidAt(field, 5.2, 0, 0.5) === solids[0], 'solidAt: grown by a margin');
  check(enclosed(field, 0, 0, 16000) && !enclosed(field, 0, 0, 16010) && !enclosed(field, 6, 0, 16000),
    'enclosed: under the roof, over it, and beside it');
  const empty = solidField([]);
  check(!pushOut(empty, 0, 0, R, push) && !freeSpot(empty, 0, 0, R, out) && solidAt(empty, 0, 0) === null,
    'an empty field hits nothing');
}

// --- two boxes sharing a party wall ----------------------------------------

console.log('\na party wall');
{
  const solids = [box(-5, 0, 5, 3), box(5, 0, 5, 3)];
  const field = solidField(solids);
  // Along the shared facade, right at the seam: a flat wall, so no push along x.
  for (const x of [-0.3, 0, 0.3]) {
    pushOut(field, x, -(3 + R - 0.3), R, push);
    check(near(push.x, 0) && near(push.z, -0.3), `no snag at the seam (x = ${x})`,
      `push (${n(push.x)}, ${n(push.z)})`);
  }
  // Walk along the facade and across the seam, the stick pressing into the
  // wall every frame as a player's does: not one frame may lose speed along it.
  const body: Body = { x: -8, z: -(3 + R), vx: 45, vz: 8 };
  let slowest = Infinity;
  for (let frame = 0; frame < 20; frame++) {
    body.vx = 45;
    body.vz = 8;
    slide(body, 1 / 60, R, wallsOf(field));
    slowest = Math.min(slowest, body.vx);
  }
  check(body.x > 5 && near(slowest, 45) && Math.abs(body.z + 3 + R) < 1e-3,
    'sliding along a terrace and across its party wall keeps its speed',
    `slowest ${n(slowest, 3)} of 45, ${n(-body.z - 3, 4)} off the wall, ended at x ${n(body.x, 2)}`);

  // From inside one house against the party wall the pushes bounce the body
  // between the two; the player's rule is that a frame which hit anything ends
  // on freeSpot, and that has to land outside both, on the nearest face.
  const x = -0.5;
  const z = 0;
  pushOut(field, x, z, R, push);
  const stillIn = overlaps(field, x + push.x, z + push.z, R);
  const freed = freeSpot(field, x, z, R, out);
  const d = Math.hypot(out.x - x, out.z - z);
  check(freed && !overlaps(field, out.x, out.z, R) && near(d, 3 + R + 0.01, 1e-6),
    'inside, against the party wall: freeSpot takes the nearest face',
    `${n(d)} out${stillIn ? ' (pushOut alone was still inside, as expected)' : ''}`);
}

// --- sliding ----------------------------------------------------------------

console.log('\nsliding');
{
  const wall = [box(0, 10, 200, 2.5)];
  const field = solidField(wall);
  const speed = 100;
  const body: Body = { x: 0, z: 0, vx: speed * Math.SQRT1_2, vz: speed * Math.SQRT1_2 };
  let slid = 0;
  for (let frame = 0; frame < 10; frame++) if (slide(body, 0.1, R, wallsOf(field)) === 'slid') slid++;
  const along = speed * Math.SQRT1_2;
  check(slid > 0 && near(body.vx, along, 1e-9) && near(body.vz, 0, 1e-9),
    'driven diagonally into a wall: the into-wall part goes, the rest stays',
    `v (${n(body.vx, 3)}, ${n(body.vz, 3)})`);
  check(near(body.x, along * 1.0, 1e-6) && near(body.z, 10 - 2.5 - R, 1e-6),
    'and the body travels the full along-wall distance, resting on the wall',
    `at (${n(body.x, 3)}, ${n(body.z, 4)})`);
  const still: Body = { x: 0, z: 9, vx: 0, vz: 0 };
  const outcome = slide(still, 1 / 60, R, wallsOf(field));
  check(outcome !== 'clear' && !overlaps(field, still.x, still.z, R),
    'standing still in a wall raised round you: pushed out on the same frame', outcome);
}

// --- tunnelling ---------------------------------------------------------------

// Nine times the run: a person runs 1.35 units in a 0.1 s frame, which
// no wall is thin enough to lose, so the subdivision is held to a speed that
// would cross one in a single step.
const FAST = RUN_SPEED * 9;
console.log(`\ntunnelling  (${FAST} units/s, dt 0.1, steps of ${STEP_FRACTION} R, at most ${MAX_STEPS})`);
{
  // A five-unit wall, across the path, approached from every phase of a frame.
  const wall = [box(0, 12.5, 100, 2.5)];
  const field = solidField(wall);
  const face = 10 - R;
  let worst = -Infinity;
  let naive = 0;
  let cases = 0;
  for (let start = -20; start <= face; start += 0.37) {
    for (const angle of [0, 0.3, 0.7, 1.2]) {
      const body: Body = { x: 0, z: start, vx: FAST * Math.sin(angle), vz: FAST * Math.cos(angle) };
      for (let frame = 0; frame < 6; frame++) {
        slide(body, 0.1, R, wallsOf(field));
        worst = Math.max(worst, body.z);
      }
      cases++;
      // The witness that the case is a real one: a single step of
      // `FAST * 0.1`, which is 9 units.
      const jumped = start + FAST * Math.cos(angle) * 0.1;
      if (jumped > 15 + R) naive++;
    }
  }
  check(worst <= face + 1e-6, `never past the near face in ${cases} runs`, `furthest z ${n(worst)} vs face ${n(face)}`);
  check(naive > 0, 'and one unsubdivided step would have crossed it', `${naive} of ${cases} would`);

  // The same through a rotated thin wall.
  const yaw = 0.6;
  const slanted = [yawed(0, 12.5, yaw, 2.5, 100, 16010)];
  const slantedField = solidField(slanted);
  let crossed = 0;
  let runs = 0;
  const s = slanted[0]!;
  // Which side of the wall's centreline a point is on, in the wall's own frame.
  const side = (x: number, z: number): number => Math.sign((x - s.x) * s.cos + (z - s.z) * s.sin);
  for (let start = -20; start < 0; start += 0.53) {
    const body: Body = { x: 0, z: start, vx: 0, vz: RUN_SPEED };
    const before = side(body.x, body.z);
    for (let frame = 0; frame < 6; frame++) slide(body, 0.1, R, wallsOf(slantedField));
    if (side(body.x, body.z) !== before) crossed++;
    runs++;
  }
  check(crossed === 0, 'nor through a rotated one', `${crossed} of ${runs} crossed`);
}

// --- rotated boxes ------------------------------------------------------------

console.log('\nrotated boxes');
{
  const yaw = 30 * (Math.PI / 180);
  const s = yawed(20, -10, yaw, 6, 2, 16010);
  // `yawed` against Three itself: a part placed with rotation.y = yaw.
  const part = new THREE.Object3D();
  part.position.set(20, 0, -10);
  part.rotation.y = yaw;
  part.updateMatrixWorld();
  const corner = new THREE.Vector3(6, 0, 2).applyMatrix4(part.matrixWorld);
  const mine = { x: s.x + s.cos * 6 - s.sin * 2, z: s.z + s.sin * 6 + s.cos * 2 };
  check(near(corner.x, mine.x) && near(corner.z, mine.z), "yawed matches Three's rotation.y",
    `three (${n(corner.x)}, ${n(corner.z)}) solid (${n(mine.x)}, ${n(mine.z)})`);

  const field = solidField([s]);
  // A point just off the second axis's face, in the box's own frame.
  const u = 1;
  const v = 2 + R - 0.3;
  const x = s.x + u * s.cos - v * s.sin;
  const z = s.z + u * s.sin + v * s.cos;
  pushOut(field, x, z, R, push);
  check(near(push.x, -s.sin * 0.3) && near(push.z, s.cos * 0.3), 'pushed along its own face normal',
    `push (${n(push.x)}, ${n(push.z)})`);
  const freed = freeSpot(field, s.x, s.z, R, out);
  check(freed && near(distanceTo(s, out.x, out.z), R + 0.01, 1e-6) && near(Math.hypot(out.x - s.x, out.z - s.z), 2 + R + 0.01, 1e-6),
    'freeSpot from its centre leaves by the narrow side', `${n(Math.hypot(out.x - s.x, out.z - s.z))} out`);
}

// --- freeSpot from inside a cluster -------------------------------------------

console.log('\nfreeSpot');
/**
 * The nearest point outside every footprint grown by `grow`, by brute force on
 * a grid: the witness. Returns its distance from (x, z), or Infinity.
 */
function bruteNearest(solids: readonly Solid[], x: number, z: number, grow: number, within: number, step: number): number {
  let best = Infinity;
  for (let gx = -within; gx <= within; gx += step) {
    for (let gz = -within; gz <= within; gz += step) {
      const d = Math.hypot(gx, gz);
      if (d >= best || d > within) continue;
      const px = x + gx;
      const pz = z + gz;
      const inside = solids.some((s) => {
        const dx = px - s.x;
        const dz = pz - s.z;
        return Math.abs(dx * s.cos + dz * s.sin) < s.hx + grow && Math.abs(-dx * s.sin + dz * s.cos) < s.hz + grow;
      });
      if (!inside) best = d;
    }
  }
  return best;
}
{
  // A 5 x 5 block of touching 10-unit houses, and a body in the middle one.
  const block: Solid[] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) block.push(box(i * 10, j * 10, 5, 5));
  const field = solidField(block);
  const grow = R + 0.01;
  const freed = freeSpot(field, 1, 2, R, out);
  const d = Math.hypot(out.x - 1, out.z - 2);
  check(freed && !overlaps(field, out.x, out.z, R) && near(d, 25 - 2 + grow, 1e-6) && near(out.x, 1, 1e-6),
    'from the middle of a 5 x 5 block: straight out of the nearest face', `${n(d)} out to (${n(out.x)}, ${n(out.z)})`);
  const brute = bruteNearest(block, 1, 2, grow, 30, 0.1);
  check(brute >= d - 0.15, 'and nothing clear is nearer (brute force, 0.1 grid)', `brute ${n(brute, 2)}`);

  // A ring of houses round a courtyard: from inside the north house the
  // courtyard is nearer than the street.
  const ring = block.filter((s) => Math.abs(s.x) <= 10 && Math.abs(s.z) <= 10 && !(s.x === 0 && s.z === 0));
  const courtyard = solidField(ring);
  freeSpot(courtyard, 0, 7, R, out);
  check(near(out.x, 0, 1e-6) && near(out.z, 5 - grow, 1e-6), 'from a house on a courtyard: into the courtyard',
    `to (${n(out.x)}, ${n(out.z)})`);

  // A random, rotated, overlapping cluster: whatever the answer, it is clear
  // and nothing clear is nearer than it by more than a grid step.
  let seed = 7;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let worstGap = 0;
  let unclear = 0;
  for (let trial = 0; trial < 12; trial++) {
    const solids: Solid[] = [];
    for (let k = 0; k < 14; k++) {
      solids.push(yawed((random() - 0.5) * 30, (random() - 0.5) * 30, random() * Math.PI, 2 + random() * 6, 2 + random() * 6, 16010));
    }
    const f = solidField(solids);
    const x = solids[0]!.x;
    const z = solids[0]!.z;
    if (!freeSpot(f, x, z, R, out)) continue;
    if (overlaps(f, out.x, out.z, R)) unclear++;
    const found = Math.hypot(out.x - x, out.z - z);
    const brute = bruteNearest(solids, x, z, grow, found + 0.5, 0.1);
    worstGap = Math.max(worstGap, found - brute);
  }
  check(unclear === 0 && worstGap <= 0.15, 'random rotated clusters: always clear, never beaten by the grid',
    `worst lead of the brute force ${n(worstGap, 3)}`);
}

// --- the walk through a town -----------------------------------------------------

console.log('\na walk through a town');
/** A town-sized field: `count` houses on a jittered lattice, some touching, some rotated. */
function town(count: number, seedStart: number): Solid[] {
  let seed = seedStart;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const solids: Solid[] = [];
  const side = Math.ceil(Math.sqrt(count));
  for (let k = 0; k < count; k++) {
    const i = k % side;
    const j = Math.floor(k / side);
    solids.push(yawed(
      (i - side / 2) * 16 + (random() - 0.5) * 4,
      (j - side / 2) * 16 + (random() - 0.5) * 4,
      random() < 0.5 ? 0 : (random() - 0.5) * 1.2,
      2.5 + random() * 5,
      2.5 + random() * 5,
      16000 + 6 + random() * 20,
    ));
  }
  return solids;
}
{
  const solids = town(220, 11);
  const field = solidField(solids);
  // How far `freeSpot` ever moves somebody who was walking rather than put
  // inside a house: that is a visible jump, and it should be a small one.
  let walking = false;
  let jump = 0;
  const walls: Walls = {
    collide: (x, z, radius, p) => pushOut(field, x, z, radius, p),
    freeSpot: (x, z, radius, o) => {
      const moved = freeSpot(field, x, z, radius, o);
      if (moved && walking) jump = Math.max(jump, Math.hypot(o.x - x, o.z - z));
      return moved;
    },
  };
  let seed = 3;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let frames = 0;
  let inside = 0;
  let freedCount = 0;
  let slidCount = 0;
  let deepest = 0;
  for (let walker = 0; walker < 60; walker++) {
    const body: Body = { x: (random() - 0.5) * 240, z: (random() - 0.5) * 240, vx: 0, vz: 0 };
    let heading = random() * Math.PI * 2;
    for (let frame = 0; frame < 300; frame++) {
      if (frame % 40 === 0) heading += (random() - 0.5) * 2;
      const speed = random() < 0.5 ? RUN_SPEED : WALK_SPEED;
      body.vx = Math.cos(heading) * speed;
      body.vz = Math.sin(heading) * speed;
      const dt = frame % 17 === 0 ? 0.1 : 1 / 60;
      walking = frame > 0;
      const result = slide(body, dt, R, walls);
      if (result === 'freed') freedCount++;
      if (result === 'slid') slidCount++;
      frames++;
      // Where the first frame starts inside a house the walker is put out; from
      // then on no frame may end overlapping anything.
      const depth = R - nearestWall(solids, body.x, body.z);
      if (depth > 1e-3) {
        inside++;
        deepest = Math.max(deepest, depth);
      }
    }
  }
  check(inside === 0, `${frames} frames of walking and running among 220 houses: never inside one`,
    `${slidCount} slid, ${freedCount} freed${inside ? `, deepest ${n(deepest)}` : ''}`);
  // Wedges between rotated houses converge rather than settle, so a walker
  // pressed into one is freed often; what matters is that it is a nudge.
  check(jump <= R, 'and freeSpot never moves a walker further than its own radius', `largest ${n(jump, 3)}`);
}

// --- determinism ------------------------------------------------------------------

console.log('\ndeterminism');
{
  const solids = town(200, 29);
  const replay = (field: SolidField): string => {
    const values: number[] = [];
    let seed = 5;
    const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let q = 0; q < 2000; q++) {
      const x = (random() - 0.5) * 240;
      const z = (random() - 0.5) * 240;
      values.push(Number(pushOut(field, x, z, R, push)), push.x, push.z);
      if (q % 10 === 0 && freeSpot(field, x, z, R, out)) values.push(out.x, out.z);
    }
    return new Float64Array(values).join(',');
  };
  const a = replay(solidField(solids));
  const b = replay(solidField(solids.map((s) => ({ ...s }))));
  check(a === b, 'two fields from the same solids answer bit for bit alike');
  const coarse = replay(solidField(solids, 64));
  const fine = replay(solidField(solids, 3));
  check(a === coarse && a === fine, 'and the cell size changes nothing: the grid is an index, not a rule');
}

// --- cost -----------------------------------------------------------------------------

console.log('\ncost');
{
  const field = solidField(town(220, 41));
  let seed = 9;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const points: number[] = [];
  for (let q = 0; q < 20000; q++) points.push((random() - 0.5) * 240, (random() - 0.5) * 240);
  const batches: number[] = [];
  for (let batch = 0; batch < 5; batch++) {
    const t0 = performance.now();
    for (let q = 0; q < points.length; q += 2) pushOut(field, points[q]!, points[q + 1]!, R, push);
    batches.push(((performance.now() - t0) * 1000) / (points.length / 2));
  }
  batches.sort((p, q) => p - q);
  const median = batches[2]!;
  check(median < 5, 'pushOut in a 220-house town costs microseconds', `median ${n(median, 3)} us a query`);
  // Only the points that start inside something, so the clear ones' early
  // return does not dilute the figure.
  const buried: number[] = [];
  for (let q = 0; q < points.length; q += 2) {
    if (overlaps(field, points[q]!, points[q + 1]!, R)) buried.push(points[q]!, points[q + 1]!);
  }
  const t0 = performance.now();
  for (let q = 0; q < buried.length; q += 2) freeSpot(field, buried[q]!, buried[q + 1]!, R, out);
  const each = buried.length > 0 ? ((performance.now() - t0) * 1000) / (buried.length / 2) : 0;
  check(each < 500, 'freeSpot, from wherever a body landed', `${buried.length / 2} searches, ${n(each, 1)} us each`);
}

console.log(`\n${failures === 0 ? 'all ok' : `${failures} FAILED`}  (${Math.round(performance.now() - began)} ms)`);
if (failures > 0) process.exit(1);
