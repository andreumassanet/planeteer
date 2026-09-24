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
 * written here from the rectangles and discs alone, not from the file under
 * test.
 *
 * And what outside a town is solid (`scenery/occupancy.ts`): the walls a
 * monument's own triangles make, measured on synthetic shapes whose answer is
 * known and on the real Arc de Triomphe and Eiffel Tower, walked through; the
 * trunk and boulder discs of the kit's trees and rocks; a farm building's walls
 * placed by a matrix, against Three placing the same corners; and what a query
 * costs in a forest and in a monument's plaza.
 *
 *   node scripts/check-solids.ts
 */
import * as THREE from 'three';
import { RUN_SPEED, WALK_SPEED } from '../src/avatar.ts';
import { BODY_RADIUS } from '../src/player.ts';
import {
  MAX_STEPS,
  STEP_FRACTION,
  disc,
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
  if (s.round) return Math.max(0, Math.hypot(dx, dz) - s.hx);
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
  // What a craft in the air asks: only a roof still over it pushes.
  check(pushOut(field, 4, 0, R, push, 16000) && !pushOut(field, 4, 0, R, push, 16010) && push.x === 0 && push.z === 0,
    'pushOut over a height: a roof over it pushes, one at or under it does not');
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

// Nine times the run: a person runs 2 units in a 0.1 s frame, which
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
        if (s.round) return Math.hypot(dx, dz) < s.hx + grow;
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

// --- discs ------------------------------------------------------------------------------

console.log('\ndiscs  (a trunk, a boulder)');
{
  const trunk = disc(3, -2, 0.5, 0);
  const field = solidField([trunk]);
  let exact = 0;
  for (let k = 0; k < 16; k++) {
    const angle = (k / 16) * Math.PI * 2;
    const x = 3 + Math.cos(angle) * (0.5 + R - 0.2);
    const z = -2 + Math.sin(angle) * (0.5 + R - 0.2);
    pushOut(field, x, z, R, push);
    const after = Math.hypot(x + push.x - 3, z + push.z + 2);
    if (near(after, 0.5 + R, 1e-9) && near(Math.atan2(push.z, push.x), angle > Math.PI ? angle - 2 * Math.PI : angle, 1e-9)) exact++;
  }
  check(exact === 16, 'pushed radially out of a disc from sixteen sides, to exactly r + R', `${exact} of 16`);
  check(!pushOut(field, 3 + 0.5 + R + 0.01, -2, R, push) && !pushOut(field, 3 + 0.5 + R, -2, R, push),
    'a hundredth clear is untouched, and resting on the rim is contact');
  pushOut(field, 3, -2, R, push);
  check(near(push.x, 0.5 + R) && near(push.z, 0), 'dead centre leaves along +x, the same every time');
  check(solidAt(field, 3.3, -1.7) === trunk && solidAt(field, 3.4, -1.6) === null, 'solidAt: inside the disc, and outside its square corner');
  check(!enclosed(field, 3, -2, 16000), 'a disc with no roof never hides the camera');

  // Along a row of trunks, the stick pressing into them: the body passes, and
  // never ends a frame inside one.
  const row = solidField(Array.from({ length: 12 }, (_, i) => disc(i * 3, 0, 0.45, 0)));
  const body: Body = { x: -3, z: -(0.45 + R) + 0.05, vx: 0, vz: 0 };
  let deepest = 0;
  for (let frame = 0; frame < 120; frame++) {
    body.vx = RUN_SPEED;
    body.vz = 2;
    slide(body, 1 / 60, R, wallsOf(row));
    for (const s of row.solids) deepest = Math.max(deepest, R - distanceTo(s, body.x, body.z));
  }
  check(body.x > 30 && deepest < 1e-3, 'running along a row of trunks, pressed against them: through, and never inside one',
    `ended at x ${n(body.x, 1)}, deepest ${n(deepest, 5)}`);

  // freeSpot among discs and rectangles together, against the brute force.
  let seed = 17;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const grow = R + 0.01;
  let worstGap = 0;
  let unclear = 0;
  let trials = 0;
  for (let trial = 0; trial < 16; trial++) {
    const solids: Solid[] = [];
    for (let k = 0; k < 12; k++) {
      solids.push(random() < 0.5
        ? disc((random() - 0.5) * 20, (random() - 0.5) * 20, 0.3 + random() * 3, 0)
        : yawed((random() - 0.5) * 20, (random() - 0.5) * 20, random() * Math.PI, 1 + random() * 4, 1 + random() * 4, 16010));
    }
    const f = solidField(solids);
    const x = solids[trial % 12]!.x;
    const z = solids[trial % 12]!.z;
    if (!freeSpot(f, x, z, R, out)) continue;
    trials++;
    if (overlaps(f, out.x, out.z, R)) unclear++;
    const found = Math.hypot(out.x - x, out.z - z);
    worstGap = Math.max(worstGap, found - bruteNearest(solids, x, z, grow, found + 0.5, 0.05));
  }
  check(trials > 10 && unclear === 0 && worstGap <= 0.08, `mixed clusters of discs and boxes (${trials}): always clear, never beaten by the grid`,
    `worst lead of the brute force ${n(worstGap, 3)}`);
}

// --- what outside a town is solid: the measure ----------------------------------------

console.log('\nthe measure  (scenery/occupancy.ts)');
const { HEAD, KNEE, floorAt, occupancyOf, partShape, placeShape } = await import('../src/scenery/occupancy.ts');
/** A box's twelve triangles, as a merged buffer holds them: `(x0, y0, z0)` to `(x1, y1, z1)`. */
function boxSoup(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  // Wound to face out, as every merged model is: the ink needs it, and the
  // measure reads a floor off a face that looks up.
  const middle = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  return faces.flatMap(([a, b, d]) => {
    const [p, q, r] = [c[a!]!, c[b!]!, c[d!]!];
    const u = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
    const v = [r[0]! - p[0]!, r[1]! - p[1]!, r[2]! - p[2]!];
    const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const out = normal.reduce((sum, value, i) => sum + value * (p[i]! - middle[i]!), 0);
    return out >= 0 ? [...p, ...q, ...r] : [...p, ...r, ...q];
  });
}
/** The solids of a measure, in its own frame. */
const fieldOf = (rects: Float32Array): SolidField => {
  const solids: Solid[] = [];
  for (let i = 0; i < rects.length; i += 5) solids.push(yawed(rects[i]!, rects[i + 1]!, 0, rects[i + 2]!, rects[i + 3]!, 16000 + rects[i + 4]!));
  return solidField(solids);
};
{
  const tower = occupancyOf(boxSoup(-2, 0, -3, 2, 12, 3));
  const r = tower.rects;
  check(r.length === 5 && near(r[0]!, 0, 1e-6) && near(r[1]!, 0, 1e-6) && near(r[2]!, 2, 1e-6) && near(r[3]!, 3, 1e-6) && near(r[4]!, 12, 1e-6),
    'a 4 x 6 tower 12 high: one rectangle, exactly its own size, its roof at 12',
    `(${[...r].map((v) => n(v, 2)).join(', ')})`);

  // An arch: two piers and a lintel over a passage higher than a person.
  const arch = occupancyOf([...boxSoup(-8, 0, -3, -3, 14, 3), ...boxSoup(3, 0, -3, 8, 14, 3), ...boxSoup(-8, 9, -3, 8, 14, 3)], true);
  const archField = fieldOf(arch.rects);
  const walker: Body = { x: 0, z: -12, vx: 0, vz: WALK_SPEED };
  let blocked = 0;
  for (let frame = 0; frame < 300; frame++) if (slide(walker, 1 / 60, R, wallsOf(archField)) !== 'clear') blocked++;
  check(blocked === 0 && walker.z > 12, 'an arch: straight through the passage under the lintel', `${blocked} frames touched, ended at z ${n(walker.z, 1)}`);
  check(overlaps(archField, -5.5, 0, R) && overlaps(archField, 5.5, 0, R) && !overlaps(archField, 0, 0, R),
    'and its piers are walls');
  check(Number.isNaN(floorAt(arch.floor!, 0, 0)), 'the lintel over the passage is walked under, not stood on');

  // Low things: a plinth under the knee is a floor, and a flight of steps a
  // run of them with no wall anywhere.
  const plinth = occupancyOf(boxSoup(-6, 0, -6, 6, KNEE * 0.8, 6), true);
  check(plinth.rects.length === 0 && near(floorAt(plinth.floor!, 1, 1), KNEE * 0.8, 1e-6), 'a plinth under the knee: no wall, a floor at its top',
    `floor ${n(floorAt(plinth.floor!, 1, 1), 3)}`);
  const steps: number[] = [];
  for (let k = 0; k < 12; k++) steps.push(...boxSoup(-3, 0, k * 0.8, 3, (k + 1) * 0.3, 12));
  const flight = occupancyOf(steps, true);
  let climbs = true;
  for (let k = 0; k < 12; k++) climbs &&= near(floorAt(flight.floor!, 0, k * 0.8 + 0.4), (k + 1) * 0.3, 1e-6);
  check(flight.rects.length === 0 && climbs, `a flight of twelve 0.3 steps to ${n(12 * 0.3, 1)}: every tread a floor, no wall`,
    `${flight.rects.length / 5} rectangles`);

  // Hollows: a hollow tower is filled, a courtyard is not.
  const shell = (half: number): number[] => [
    ...boxSoup(-half, 0, -half, half, 8, -half + 0.5), ...boxSoup(-half, 0, half - 0.5, half, 8, half),
    ...boxSoup(-half, 0, -half, -half + 0.5, 8, half), ...boxSoup(half - 0.5, 0, -half, half, 8, half),
  ];
  const hollow = fieldOf(occupancyOf(shell(4)).rects);
  const court = fieldOf(occupancyOf(shell(14)).rects);
  check(overlaps(hollow, 0, 0, R) && !overlaps(court, 0, 0, R), 'a sealed hollow tower is solid through; a walled courtyard is open inside');
  const a = occupancyOf(steps.concat(shell(14)), true);
  const b = occupancyOf(steps.concat(shell(14)), true);
  check(a.rects.length === b.rects.length && a.rects.every((v, i) => v === b.rects[i]) && a.floor!.height.every((v, i) => Object.is(v, b.floor!.height[i])),
    'the measure is deterministic, bit for bit');
}

// --- monuments ---------------------------------------------------------------------------------

console.log('\nmonuments  (their own triangles, measured)');
const { createContext } = await import('../src/monuments/contract.ts');
const { mergeMeshes } = await import('../src/merge.ts');
const { readdirSync } = await import('node:fs');
const monumentCtx = createContext();
const monumentFiles = readdirSync(new URL('../src/monuments/', import.meta.url)).filter((f) => f.endsWith('.ts') && f !== 'contract.ts' && f !== 'index.ts').sort();
const measuredMonuments = new Map<string, ReturnType<typeof occupancyOf>>();
{
  let slowest = 0;
  let slowestId = '';
  let unstable = 0;
  let outside = 0;
  let rects = 0;
  for (const file of monumentFiles) {
    const mod = (await import(`../src/monuments/${file}`)) as Record<string, { id?: string; footprint?: number; build?: (c: unknown) => THREE.Group }>;
    const monument = Object.values(mod).find((value) => typeof value?.build === 'function' && typeof value.id === 'string');
    if (monument === undefined) continue;
    const position = mergeMeshes(monument.build!(monumentCtx)).position;
    const t0 = performance.now();
    const occupancy = occupancyOf(position, true);
    slowest = Math.max(slowest, performance.now() - t0);
    if (performance.now() - t0 >= slowest) slowestId = monument.id!;
    const again = occupancyOf(position, true);
    if (again.rects.length !== occupancy.rects.length || !again.rects.every((v, i) => v === occupancy.rects[i])) unstable++;
    // Every wall inside the footprint the contract holds the model to, and a cell.
    for (let i = 0; i < occupancy.rects.length; i += 5) {
      const reach = Math.hypot(Math.abs(occupancy.rects[i]!) + occupancy.rects[i + 2]!, Math.abs(occupancy.rects[i + 1]!) + occupancy.rects[i + 3]!);
      if (reach > monument.footprint! * Math.SQRT2 + occupancy.cell * 2) outside++;
    }
    rects += occupancy.rects.length / 5;
    measuredMonuments.set(monument.id!, occupancy);
  }
  check(measuredMonuments.size >= 80 && unstable === 0, `all ${measuredMonuments.size} monuments measured, each the same twice`, `${rects} rectangles in all`);
  check(outside === 0, 'no wall outside the footprint the contract allows', `${outside} outside`);
  check(slowest < 40, 'measuring the dearest takes a build, not a stall', `${slowestId}, ${n(slowest, 1)} ms (once per landmark, when it is near)`);

  const arc = measuredMonuments.get('arc-de-triomphe')!;
  const arcField = fieldOf(arc.rects);
  // Along both axes, through the middle: the great passage and the small one.
  let through = 0;
  for (const [vx, vz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const body: Body = { x: -vx * 40, z: -vz * 40, vx: 0, vz: 0 };
    let touched = 0;
    for (let frame = 0; frame < 60 * 8; frame++) {
      body.vx = vx * RUN_SPEED;
      body.vz = vz * RUN_SPEED;
      if (slide(body, 1 / 60, R, wallsOf(arcField)) !== 'clear') touched++;
    }
    if (touched === 0 && body.x * vx + body.z * vz > 39) through++;
  }
  check(through === 4, 'the Arc de Triomphe: through both passages, both ways, touching nothing', `${through} of 4`);
  const piers = arc.rects.length / 5;
  let pier = 0;
  for (let i = 0; i < arc.rects.length; i += 5) if (overlaps(arcField, arc.rects[i]!, arc.rects[i + 1]!, R)) pier++;
  check(piers >= 4 && pier === piers, `and its ${piers} piers are walls`);
  check(!Number.isNaN(floorAt(arc.floor!, 0, 0)) && floorAt(arc.floor!, 0, 0) <= HEAD, 'under the vault the plinth is a floor, and the vault is not',
    `floor ${n(floorAt(arc.floor!, 0, 0), 2)}`);

  const eiffel = measuredMonuments.get('eiffel-tower')!;
  const eiffelField = fieldOf(eiffel.rects);
  let reached = 0;
  for (let k = 0; k < 4; k++) {
    // From outside, square to a side and between the two legs on it, to the
    // middle under the tower.
    const angle = (k / 4) * Math.PI * 2;
    const body: Body = { x: Math.cos(angle) * 40, z: Math.sin(angle) * 40, vx: 0, vz: 0 };
    for (let frame = 0; frame < 60 * 12; frame++) {
      const d = Math.hypot(body.x, body.z);
      if (d < 0.5) break;
      body.vx = (-body.x / d) * WALK_SPEED;
      body.vz = (-body.z / d) * WALK_SPEED;
      slide(body, 1 / 60, R, wallsOf(eiffelField));
    }
    if (Math.hypot(body.x, body.z) < 1) reached++;
  }
  check(!overlaps(eiffelField, 0, 0, R) && reached === 4, 'the Eiffel Tower: walked in between its legs from all four sides, to the middle under it',
    `${reached} of 4`);
  check(eiffelField.solids.length > 4, 'and its legs are walls', `${eiffelField.solids.length} rectangles`);
}

// --- the wood and the farm ----------------------------------------------------------------------

console.log('\nthe wood and the farm  (trunks, boulders, farm buildings)');
const { registerModelsFromDisk } = await import('./kit-node.ts');
await registerModelsFromDisk();
const { createSceneryContext, variantRng } = await import('../src/scenery/contract.ts');
const { REGIONS } = await import('../src/scenery/regions.ts');
const { COUNTRY_PARTS, pieceRng } = await import('../src/countryside-kit.ts');
const sceneryCtx = createSceneryContext(monumentCtx);
const trunks: number[] = [];
const boulders: number[] = [];
{
  const problems: string[] = [];
  const style = REGIONS['atlantic-europe'];
  for (const id of ['conifer-tree', 'broadleaf-tree', 'acacia-tree', 'cypress-tree', 'palm-tree', 'cactus', 'boulder']) {
    const mod = (await import(`../src/scenery/parts/${id}.ts`)) as Record<string, { id?: string; footprint: number; build: (...a: unknown[]) => THREE.Group }>;
    const entry = Object.values(mod).find((value) => value?.id === id)!;
    for (let variant = 0; variant < 3; variant++) {
      const position = mergeMeshes(entry.build(sceneryCtx, variantRng(entry as never, style, variant), style)).position;
      const shape = partShape(position, id === 'boulder' ? 'boulder' : 'trunk');
      (id === 'boulder' ? boulders : trunks).push(shape.radius);
      if (!(shape.radius > 0.1 && shape.radius < entry.footprint)) problems.push(`${id}/${variant}: ${n(shape.radius, 2)} of ${entry.footprint}`);
    }
  }
  check(problems.length === 0, `every tree's trunk and every boulder a disc inside its footprint (${trunks.length} trunks ${n(Math.min(...trunks), 2)}-${n(Math.max(...trunks), 2)}, ${boulders.length} boulders to ${n(Math.max(...boulders), 2)})`,
    problems.slice(0, 4).join('; '));

  // A barn placed as a tile places it: yawed, scaled and leaning a hair, its
  // walls against Three moving the same corners.
  const barn = COUNTRY_PARTS['barn']!;
  const barnSoup = mergeMeshes(barn.build(sceneryCtx, pieceRng('barn', style.id, 0), style)).position;
  const shape = partShape(barnSoup, 'walls');
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(40, 3, -25),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, 0.9, -0.01, 'YXZ')),
    new THREE.Vector3(1.1, 1.1, 1.1),
  );
  const placed: Solid[] = [];
  placeShape(shape, matrix.elements, 16000, placed);
  let worst = 0;
  for (let i = 0; i < placed.length; i++) {
    const s = placed[i]!;
    const r = i * 5;
    for (const [u, v] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      const three = new THREE.Vector3(shape.rects[r]! + u * shape.rects[r + 2]!, 0, shape.rects[r + 1]! + v * shape.rects[r + 3]!).applyMatrix4(matrix);
      const mine = { x: s.x + s.cos * u * s.hx - s.sin * v * s.hz, z: s.z + s.sin * u * s.hx + s.cos * v * s.hz };
      worst = Math.max(worst, Math.hypot(three.x - mine.x, three.z - mine.z));
    }
  }
  check(placed.length > 0 && worst < 0.02, `a barn's ${placed.length} walls placed by a matrix land where Three puts their corners`, `worst ${n(worst, 4)}`);
  check(placed.every((s) => s.top > 16000 + 3 + HEAD), 'and carry their roofs over the base');
  const farm = solidField(placed);
  check(overlaps(farm, 40, -25, R), 'a body at the barn\'s middle is inside it');
}

// --- cost and determinism outside a town --------------------------------------------------------

console.log('\ncost and determinism outside a town');
/** A wood: trunks on a jittered 15-unit lattice (the finest tile's pitch), a boulder in ten. */
function forest(side: number, seedStart: number): Solid[] {
  let seed = seedStart;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const solids: Solid[] = [];
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      if (random() < 0.15) continue;
      const x = (i - side / 2) * 15 + (random() - 0.5) * 12;
      const z = (j - side / 2) * 15 + (random() - 0.5) * 12;
      const radii = random() < 0.1 ? boulders : trunks;
      solids.push(disc(x, z, radii[Math.floor(random() * radii.length)]! * (0.84 + random() * 0.32), 0));
    }
  }
  return solids;
}
/** Median microseconds of `pushOut` over points in a square of `half`. */
function costOf(field: SolidField, half: number, seedStart: number): number {
  let seed = seedStart;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const points: number[] = [];
  for (let q = 0; q < 20000; q++) points.push((random() - 0.5) * 2 * half, (random() - 0.5) * 2 * half);
  const batches: number[] = [];
  for (let batch = 0; batch < 5; batch++) {
    const t0 = performance.now();
    for (let q = 0; q < points.length; q += 2) pushOut(field, points[q]!, points[q + 1]!, R, push);
    batches.push(((performance.now() - t0) * 1000) / (points.length / 2));
  }
  return batches.sort((p, q) => p - q)[2]!;
}
{
  // Two level-0 tiles' worth, 180 units a side, which is what a body can be near at once.
  const wood = forest(24, 13);
  const woodField = solidField(wood);
  const woodCost = costOf(woodField, 170, 21);
  check(woodCost < 3, `pushOut in a wood of ${wood.length} trunks and boulders`, `median ${n(woodCost, 3)} us a query`);

  // A run through it: never ends a frame inside a trunk.
  let seed = 31;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let inside = 0;
  let frames = 0;
  for (let walker = 0; walker < 30; walker++) {
    const body: Body = { x: (random() - 0.5) * 300, z: (random() - 0.5) * 300, vx: 0, vz: 0 };
    let heading = random() * Math.PI * 2;
    for (let frame = 0; frame < 300; frame++) {
      if (frame % 40 === 0) heading += (random() - 0.5) * 2;
      body.vx = Math.cos(heading) * RUN_SPEED;
      body.vz = Math.sin(heading) * RUN_SPEED;
      slide(body, frame % 17 === 0 ? 0.1 : 1 / 60, R, wallsOf(woodField));
      frames++;
      if (R - nearestWall(wood, body.x, body.z) > 1e-3) inside++;
    }
  }
  check(inside === 0, `${frames} frames running through the wood: never inside a trunk`);

  const replay = (field: SolidField): string => {
    const values: number[] = [];
    let s = 5;
    const next = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let q = 0; q < 2000; q++) {
      const x = (next() - 0.5) * 340;
      const z = (next() - 0.5) * 340;
      values.push(Number(pushOut(field, x, z, R, push)), push.x, push.z);
      if (q % 10 === 0 && freeSpot(field, x, z, R, out)) values.push(out.x, out.z);
    }
    return new Float64Array(values).join(',');
  };
  const a = replay(woodField);
  check(a === replay(solidField(wood.map((s) => ({ ...s })))) && a === replay(solidField(wood, 64)) && a === replay(solidField(wood, 3)),
    'the wood answers bit for bit alike, whatever the grid');

  // The dearest plaza: the monument with the most rectangles, queried over its whole footprint.
  let densest = '';
  let most = 0;
  for (const [id, occupancy] of measuredMonuments) {
    if (occupancy.rects.length > most) {
      most = occupancy.rects.length;
      densest = id;
    }
  }
  const plaza = fieldOf(measuredMonuments.get(densest)!.rects);
  const plazaCost = costOf(plaza, Math.max(plaza.maxX - plaza.minX, plaza.maxZ - plaza.minZ) / 2 + 5, 23);
  check(plazaCost < 5, `pushOut in the densest monument (${densest}, ${plaza.solids.length} rectangles)`, `median ${n(plazaCost, 3)} us a query`);
  const buried: number[] = [];
  for (let q = 0; q < 4000; q++) {
    const x = plaza.minX + ((q * 7919) % 4000) / 4000 * (plaza.maxX - plaza.minX);
    const z = plaza.minZ + ((q * 104729) % 4000) / 4000 * (plaza.maxZ - plaza.minZ);
    if (overlaps(plaza, x, z, R)) buried.push(x, z);
  }
  const t0 = performance.now();
  let unfreed = 0;
  for (let q = 0; q < buried.length; q += 2) {
    if (!freeSpot(plaza, buried[q]!, buried[q + 1]!, R, out) || overlaps(plaza, out.x, out.z, R)) unfreed++;
  }
  const each = buried.length > 0 ? ((performance.now() - t0) * 1000) / (buried.length / 2) : 0;
  check(unfreed === 0 && each < 2000, `freeSpot from inside ${densest}'s walls: always out, and clear`, `${buried.length / 2} searches, ${n(each, 1)} us each`);
}

console.log(`\n${failures === 0 ? 'all ok' : `${failures} FAILED`}  (${Math.round(performance.now() - began)} ms)`);
if (failures > 0) process.exit(1);
