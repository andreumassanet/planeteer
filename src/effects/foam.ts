/** Ageing the foam: discs and ribbons on the sea, written into one buffer. */
import { MAX_RIBBONS, RIBBON_POINTS, DISC_SIDES, DISC_VERTICES, SEGMENT_VERTICES, FOAM_VERTEX_CAP, FOAM_RADIUS } from './constants.ts';
import { F_POS, F_VEL, F_E1, F_E2, F_AGE, F_LIFE, F_R0, F_R1, F_RING, F_DRAG, F_STRIDE, R_POS, R_VEL, R_SIDE, R_AGE, R_LIFE, R_W0, R_W1, R_DRAG, R_LINK, R_HOLLOW, R_STRIDE } from './layout.ts';
import { smooth, clamp, COS, SIN, p3 } from './helpers.ts';
import type { Pools } from './pools.ts';


export function createFoam(fx: Pools) {
  const { foamPositions, foamNormals, f, r, ribbonHead, ribbonCount, stats, anchor } = fx;
  /** One foam vertex, relative to the anchor, with the water's normal. */
  function vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const v = fx.cursor * 3;
    foamPositions[v] = x - anchor.x;
    foamPositions[v + 1] = y - anchor.y;
    foamPositions[v + 2] = z - anchor.z;
    foamNormals[v] = nx;
    foamNormals[v + 1] = ny;
    foamNormals[v + 2] = nz;
    fx.cursor++;
  }

  function advanceDiscs(dt: number): void {
    for (let i = 0; i < fx.discCount; i++) {
      let o = i * F_STRIDE;
      f[o + F_AGE] = f[o + F_AGE]! + dt;
      if (f[o + F_AGE]! >= f[o + F_LIFE]!) {
        fx.discCount--;
        if (i !== fx.discCount) f.copyWithin(o, fx.discCount * F_STRIDE, (fx.discCount + 1) * F_STRIDE);
        i--;
        continue;
      }
      o = i * F_STRIDE;
      const damp = Math.exp(-f[o + F_DRAG]! * dt);
      let x = f[o + F_POS]!, y = f[o + F_POS + 1]!, z = f[o + F_POS + 2]!;
      const vx = f[o + F_VEL]! * damp, vy = f[o + F_VEL + 1]! * damp, vz = f[o + F_VEL + 2]! * damp;
      p3(f, o + F_VEL, vx, vy, vz);
      x += vx * dt; y += vy * dt; z += vz * dt;
      // Back onto the water's sphere: a disc drifting along a tangent would
      // otherwise rise off the sea at a rate of its speed squared.
      const onto = FOAM_RADIUS / Math.hypot(x, y, z);
      x *= onto; y *= onto; z *= onto;
      p3(f, o + F_POS, x, y, z);
      if (fx.cursor + DISC_VERTICES > FOAM_VERTEX_CAP) continue;
      const t = f[o + F_AGE]! / f[o + F_LIFE]!;
      const outer = f[o + F_R0]! + (f[o + F_R1]! - f[o + F_R0]!) * (1 - (1 - t) * (1 - t));
      const ring = f[o + F_RING]!;
      const inner = outer * Math.min(1, ring + (1 - ring) * smooth((t - 0.35) / 0.65));
      const nx = x / FOAM_RADIUS, ny = y / FOAM_RADIUS, nz = z / FOAM_RADIUS;
      for (let k = 0; k < DISC_SIDES; k++) {
        const k1 = (k + 1) % DISC_SIDES;
        const ax = f[o + F_E1]! * COS[k]! + f[o + F_E2]! * SIN[k]!;
        const ay = f[o + F_E1 + 1]! * COS[k]! + f[o + F_E2 + 1]! * SIN[k]!;
        const az = f[o + F_E1 + 2]! * COS[k]! + f[o + F_E2 + 2]! * SIN[k]!;
        const bx = f[o + F_E1]! * COS[k1]! + f[o + F_E2]! * SIN[k1]!;
        const by = f[o + F_E1 + 1]! * COS[k1]! + f[o + F_E2 + 1]! * SIN[k1]!;
        const bz = f[o + F_E1 + 2]! * COS[k1]! + f[o + F_E2 + 2]! * SIN[k1]!;
        // Counter-clockwise from above: `e1 x e2` is up (see `spawnDisc`).
        vertex(x + ax * inner, y + ay * inner, z + az * inner, nx, ny, nz);
        vertex(x + ax * outer, y + ay * outer, z + az * outer, nx, ny, nz);
        vertex(x + bx * outer, y + by * outer, z + bz * outer, nx, ny, nz);
        vertex(x + ax * inner, y + ay * inner, z + az * inner, nx, ny, nz);
        vertex(x + bx * outer, y + by * outer, z + bz * outer, nx, ny, nz);
        vertex(x + bx * inner, y + by * inner, z + bz * inner, nx, ny, nz);
      }
    }
  }
  function band(o: number): void {
    const t = clamp(r[o + R_AGE]! / r[o + R_LIFE]!, 0, 1);
    let outer = r[o + R_W0]! + (r[o + R_W1]! - r[o + R_W0]!) * (1 - (1 - t) * (1 - t));
    let inner = 0;
    if (r[o + R_HOLLOW]! > 0) inner = outer * smooth((t - 0.3) / 0.7);
    else outer *= 1 - smooth((t - 0.5) / 0.5);
    if (t >= 1) inner = outer;
    fx.bandInner = inner;
    fx.bandOuter = outer;
  }

  /**
   * One side of a segment, from point `a` to point `b`, as two triangles
   * wound to face up: the band `hand` of the path, between each end's inner
   * and outer half-width.
   */
  function halfBand(a: number, b: number, hand: number, ai: number, ao: number, bi: number, bo: number): void {
    const ax = r[a + R_POS]!, ay = r[a + R_POS + 1]!, az = r[a + R_POS + 2]!;
    const bx = r[b + R_POS]!, by = r[b + R_POS + 1]!, bz = r[b + R_POS + 2]!;
    const asx = r[a + R_SIDE]! * hand, asy = r[a + R_SIDE + 1]! * hand, asz = r[a + R_SIDE + 2]! * hand;
    const bsx = r[b + R_SIDE]! * hand, bsy = r[b + R_SIDE + 1]! * hand, bsz = r[b + R_SIDE + 2]! * hand;
    const nx = ax / FOAM_RADIUS, ny = ay / FOAM_RADIUS, nz = az / FOAM_RADIUS;
    // Which way round is up: the side crossed with the way along, against the water's normal.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const facing = (asy * uz - asz * uy) * nx + (asz * ux - asx * uz) * ny + (asx * uy - asy * ux) * nz;
    const aix = ax + asx * ai, aiy = ay + asy * ai, aiz = az + asz * ai;
    const aox = ax + asx * ao, aoy = ay + asy * ao, aoz = az + asz * ao;
    const bix = bx + bsx * bi, biy = by + bsy * bi, biz = bz + bsz * bi;
    const box = bx + bsx * bo, boy = by + bsy * bo, boz = bz + bsz * bo;
    if (facing > 0) {
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(aox, aoy, aoz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz);
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz); vertex(bix, biy, biz, nx, ny, nz);
    } else {
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz); vertex(aox, aoy, aoz, nx, ny, nz);
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(bix, biy, biz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz);
    }
  }

  function advanceRibbons(dt: number): void {
    let points = 0;
    let live = 0;
    for (let ribbon = 0; ribbon < MAX_RIBBONS; ribbon++) {
      let count = ribbonCount[ribbon]!;
      if (count === 0) continue;
      const base = ribbon * RIBBON_POINTS;
      let head = ribbonHead[ribbon]!;
      for (let i = 0; i < count; i++) {
        const o = (base + ((head + i) % RIBBON_POINTS)) * R_STRIDE;
        r[o + R_AGE] = r[o + R_AGE]! + dt;
        const damp = Math.exp(-r[o + R_DRAG]! * dt);
        const x = r[o + R_POS]!, y = r[o + R_POS + 1]!, z = r[o + R_POS + 2]!;
        const vx = r[o + R_VEL]! * damp, vy = r[o + R_VEL + 1]! * damp, vz = r[o + R_VEL + 2]! * damp;
        p3(r, o + R_VEL, vx, vy, vz);
        const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
        const onto = FOAM_RADIUS / Math.hypot(nx, ny, nz);
        p3(r, o + R_POS, nx * onto, ny * onto, nz * onto);
      }
      // The oldest go first; a point older than its life in the middle of a
      // ribbon is drawn at no width until its turn comes.
      while (count > 0) {
        const o = (base + head) * R_STRIDE;
        if (r[o + R_AGE]! < r[o + R_LIFE]!) break;
        head = (head + 1) % RIBBON_POINTS;
        count--;
      }
      ribbonHead[ribbon] = head;
      ribbonCount[ribbon] = count;
      if (count === 0) continue;
      points += count;
      live++;
      for (let i = 1; i < count; i++) {
        const b = (base + ((head + i) % RIBBON_POINTS)) * R_STRIDE;
        if (r[b + R_LINK] === 0) continue;
        if (fx.cursor + SEGMENT_VERTICES > FOAM_VERTEX_CAP) break;
        const a = (base + ((head + i - 1) % RIBBON_POINTS)) * R_STRIDE;
        band(a);
        const ai = fx.bandInner, ao = fx.bandOuter;
        band(b);
        const bi = fx.bandInner, bo = fx.bandOuter;
        if (ao <= ai && bo <= bi) continue;
        halfBand(a, b, 1, ai, ao, bi, bo);
        halfBand(a, b, -1, ai, ao, bi, bo);
      }
    }
    stats.ribbonPoints = points;
    stats.ribbons = live;
  }

  return { advanceDiscs, advanceRibbons };
}
