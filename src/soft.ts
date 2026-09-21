import * as THREE from 'three';

/**
 * Soft shapes: the smooth primitives a body is built from.
 *
 * ## Why a person is not built from the kit's prisms
 *
 * Everything else in this world is faceted on purpose — a house is a box, a
 * roof is a wedge, and one normal per face gives each plane its own cel band. A
 * body built the same way is a **Roblox figure**: a hexagonal drum for a head,
 * five-sided tubes for arms and bricks for feet, which is what the avatar was
 * until 2026-09-15, and it looked worse than Roblox. The reference this
 * project's form is taken from, messenger.abeto.co, draws its people as smooth
 * masses — an egg of a head, locks of hair, a jacket that hangs, trainers with
 * a sole — under exactly this world's lighting: one sun, a stepped ramp, an ink
 * line.
 *
 * **Smooth normals do not undo the cel look, and the ramp is why.** `theme.ts`
 * builds every ramp with `NearestFilter`, so the light is quantised to four
 * bands whatever the normal does; a smooth normal field only decides the
 * *shape* of the boundary between two bands. On a facet the boundary is the
 * facet's edge, which is why a six-sided arm reads as six planks. On a smooth
 * surface it is a curve, which is the whole look of a cel-shaded character.
 * The old avatar file's claim that a smooth normal "sweeps continuously" was
 * true of its capsules only because they had no geometry worth stepping across.
 *
 * **And it is what makes the ink continuous.** `OutlineEffect` pushes each
 * vertex out along its normal. With one normal per face the hull comes apart at
 * every corner into slabs, and on a thin limb those slabs are most of what you
 * see; with shared normals the hull is one closed skin a pen-width outside the
 * body, which is a line.
 *
 * ## What every shape here promises
 *
 * - It comes out **non-indexed**, like every other geometry in the world, so
 *   every merge path (`mergeBones`, `mergeGroup`, the settlement `flatten`)
 *   reads it unchanged — but its normals were computed on the *welded* surface
 *   first, so they are smooth.
 * - It is wound **outward**, and that is checked rather than trusted: the signed
 *   volume must be positive or the builder throws. A shell wound inside out
 *   renders as a solid ink blob (`assertOutward` in `vehicles.ts` has the story).
 * - Its material comes from the caller's `toon`, so it carries the colour stamp
 *   the merges read and the ramp the moods repaint. There is no body material.
 */

/** A profile point for `lathe`: `[radius, y]`, bottom to top. */
export type Ring = readonly [number, number];

export interface SoftOptions {
  /** Radial segments. Few is fine: the normals are smooth. */
  sides?: number;
  /** Front-to-back scale of the section, applied before the normals. */
  depth?: number;
  /** Any last change to a vertex, in place, before the normals. */
  warp?: (v: THREE.Vector3) => void;
  /**
   * The profile is a closed loop — a collar, a cuff, a sole's rim — so the last
   * ring joins the first and there are no caps. List it inner-bottom,
   * outer-bottom, outer-top, inner-top: the outer wall still runs upward, which
   * is the winding every other lathe here has.
   */
  loop?: boolean;
}

export interface SoftKit {
  /**
   * A solid of revolution about +Y, from `[radius, y]` pairs listed bottom to
   * top. A radius of 0 at either end closes it to a point; otherwise the end is
   * capped flat, and the cap shares its rim with the wall so the edge shades
   * round rather than sharp. `sides` is 10 unless given.
   */
  lathe(profile: readonly Ring[], color: number, options?: SoftOptions): THREE.Mesh;
  /** An ellipsoid about the origin with these half-axes. `rings` is 7 unless given. */
  ellipsoid(rx: number, ry: number, rz: number, color: number, options?: SoftOptions & { rings?: number }): THREE.Mesh;
  /**
   * A box with every edge rounded to `radius`, standing on y = 0 and centred in
   * x and z — the same seat as `ctx.box`, so the two can be swapped.
   */
  rounded(width: number, height: number, depth: number, radius: number, color: number, segments?: number): THREE.Mesh;
  /** `rounded`, laid between two points like `ctx.strut`: `width` across, `thickness` deep. */
  band(from: THREE.Vector3, to: THREE.Vector3, width: number, thickness: number, color: number): THREE.Mesh;
}

/**
 * Welds a raw indexed surface's normals, drops the index and checks the
 * winding. Every shape below ends here.
 */
function finish(positions: number[], indices: number[], normals?: number[]): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  if (normals) indexed.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  else indexed.computeVertexNormals();
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  if (signedVolume(geometry) <= 0) {
    throw new Error('soft: a shape is wound inside out, which would render as a solid ink blob');
  }
  return geometry;
}

/** The divergence theorem over a closed non-indexed shell: positive is outward. */
function signedVolume(geometry: THREE.BufferGeometry): number {
  const p = geometry.getAttribute('position');
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

const scratch = new THREE.Vector3();

/**
 * The lathe, written out rather than taken from `LatheGeometry`, for one reason:
 * Three's duplicates the seam and the poles, so its welded normals crease down
 * the back of every shape. Here the ring wraps its own indices and a pole is one
 * vertex.
 *
 * Angle 0 is **+Z**, the way a body faces, so a vertex of the ring sits on the
 * centre line of the face and not a half-segment off it — which is what lets an
 * eye be placed on the surface by arithmetic.
 */
function latheGeometry(profile: readonly Ring[], options: SoftOptions = {}): THREE.BufferGeometry {
  const sides = options.sides ?? 10;
  const depth = options.depth ?? 1;
  const positions: number[] = [];
  const indices: number[] = [];
  /** First vertex of each ring, and whether the ring is a single pole. */
  const rings: { start: number; pole: boolean }[] = [];

  const push = (x: number, y: number, z: number) => {
    scratch.set(x, y, z * depth);
    options.warp?.(scratch);
    positions.push(scratch.x, scratch.y, scratch.z);
  };

  for (const [radius, y] of profile) {
    const start = positions.length / 3;
    if (radius <= 1e-6) {
      push(0, y, 0);
      rings.push({ start, pole: true });
      continue;
    }
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      push(radius * Math.sin(angle), y, radius * Math.cos(angle));
    }
    rings.push({ start, pole: false });
  }

  const at = (ring: { start: number; pole: boolean }, j: number) =>
    ring.pole ? ring.start : ring.start + (j % sides);

  const spans = options.loop === true ? rings.length : rings.length - 1;
  for (let i = 0; i < spans; i++) {
    const lower = rings[i]!;
    const upper = rings[(i + 1) % rings.length]!;
    for (let j = 0; j < sides; j++) {
      const a = at(lower, j);
      const b = at(lower, j + 1);
      const c = at(upper, j + 1);
      const d = at(upper, j);
      // Winding derived at angle 0: a -> b runs toward +X and a -> d up +Y, and
      // x cross y is +z, which is outward there. The volume check confirms it.
      if (!lower.pole) indices.push(a, b, c);
      if (!upper.pole) indices.push(a, c, d);
    }
  }
  if (options.loop === true) return finish(positions, indices);

  // Flat caps on an open end, sharing the rim so the edge shades round.
  const cap = (ring: { start: number; pole: boolean }, y: number, up: boolean) => {
    if (ring.pole) return;
    const centre = positions.length / 3;
    push(0, y, 0);
    for (let j = 0; j < sides; j++) {
      const a = at(ring, j);
      const b = at(ring, j + 1);
      if (up) indices.push(centre, a, b);
      else indices.push(centre, b, a);
    }
  };
  cap(rings[0]!, profile[0]![1], false);
  cap(rings[rings.length - 1]!, profile[profile.length - 1]![1], true);

  return finish(positions, indices);
}

/**
 * `detail` multiplies every radial segment count, so one set of shapes serves
 * both the hero, who is looked at from arm's length, and a crowd figure, who is
 * one of thirty and never nearer than a street. It does not touch the profile:
 * the rings a shape is written with are its form, not its resolution.
 */
export function createSoftKit(toon: (color: number) => THREE.Material, detail = 1): SoftKit {
  const meshOf = (geometry: THREE.BufferGeometry, color: number) => new THREE.Mesh(geometry, toon(color));

  function lathe(profile: readonly Ring[], color: number, options: SoftOptions = {}): THREE.Mesh {
    const sides = Math.max(4, Math.round((options.sides ?? 10) * detail));
    return meshOf(latheGeometry(profile, { ...options, sides }), color);
  }

  function ellipsoid(
    rx: number,
    ry: number,
    rz: number,
    color: number,
    options: SoftOptions & { rings?: number } = {},
  ): THREE.Mesh {
    const rings = options.rings ?? 7;
    const profile: Ring[] = [];
    for (let i = 0; i <= rings; i++) {
      const phi = -Math.PI / 2 + (i / rings) * Math.PI;
      profile.push([i === 0 || i === rings ? 0 : Math.cos(phi) * rx, Math.sin(phi) * ry]);
    }
    return lathe(profile, color, { ...options, depth: (options.depth ?? 1) * (rz / rx) });
  }

  /**
   * The classic rounded box: a subdivided box whose every vertex is pulled onto
   * the surface of an inner box grown by `radius`. The normal is exactly the
   * direction it was pulled in, so it is written rather than computed, and the
   * six faces agree along every edge without being welded.
   */
  function rounded(width: number, height: number, depth: number, radius: number, color: number, segments = 3): THREE.Mesh {
    const r = Math.min(radius, width / 2, height / 2, depth / 2);
    const box = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
    const p = box.getAttribute('position');
    const hx = width / 2 - r;
    const hy = height / 2 - r;
    const hz = depth / 2 - r;
    const positions: number[] = [];
    const normals: number[] = [];
    const inner = new THREE.Vector3();
    const out = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      inner.set(Math.max(-hx, Math.min(hx, x)), Math.max(-hy, Math.min(hy, y)), Math.max(-hz, Math.min(hz, z)));
      out.set(x, y, z).sub(inner);
      if (out.lengthSq() < 1e-12) out.set(0, 1, 0);
      out.normalize();
      positions.push(inner.x + out.x * r, inner.y + out.y * r + height / 2, inner.z + out.z * r);
      normals.push(out.x, out.y, out.z);
    }
    const indices = Array.from(box.index!.array);
    box.dispose();
    return meshOf(finish(positions, indices, normals), color);
  }

  function band(from: THREE.Vector3, to: THREE.Vector3, width: number, thickness: number, color: number): THREE.Mesh {
    const length = from.distanceTo(to);
    const mesh = rounded(width, thickness, length + thickness, thickness * 0.45, color, 2);
    // `rounded` stands on y = 0; centre it so `lookAt` aims through its middle.
    mesh.geometry.translate(0, -thickness / 2, 0);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    return mesh;
  }

  return { lathe, ellipsoid, rounded, band };
}
