import * as THREE from 'three';
import type { LandRing, World } from './geo.ts';
import { PLANET_RADIUS, coastEdges, groundRadius, onSphere } from './globe.ts';
import { LAND_HEIGHT } from './geo.ts';
import { createToonRamp } from './theme.ts';

/**
 * Where one country ends and the next begins, drawn on the ground as a thick
 * dashed line.
 *
 * **There is no border geometry in the data and there did not need to be.** The
 * bake keeps only outer rings, so every country is one closed outline that runs
 * along its coast *and* along its land frontiers with no distinction between
 * them — and `buildLand` already builds a cliff quad for every edge of it, which
 * at a frontier is a wall buried inside the neighbour's land at the same height.
 * Invisible, correct, and no help at all.
 *
 * Which edges are which is `coastEdges` in `globe.ts` and is not re-derived
 * here: it steps off each edge along its own outward normal and asks `countryAt`
 * what is there, it costs **366 ms** of point-in-polygon, and three separate
 * things in this project were each paying it. Sea is a coastline and the cliff
 * already draws it. Land is a frontier.
 *
 * **What this file used to draw was a band, and the band was the bug.** Each
 * ring shaded 26 units *inward* from the line in its own ground colour at 62%,
 * fading back to the ground — so a frontier was a 52-unit trough of darkened
 * earth with a 2.4-unit dashed line down the middle of it. It was all there,
 * all built, 147,958 triangles of it, and nobody could see it, for the reason
 * `scenery/ground.ts` already had written down about roads: **a dark neutral on
 * the ground is not a line, it is a shadow.** In a world with one hard sun and
 * a four-band ramp, every dark patch the eye meets has been the shade of the
 * thing beside it, so a soft dark gradient in the ground's own hue is filed as
 * terrain and never as a mark. The line that was supposed to be the actual
 * border was 2.4 units wide — 1.9 pixels at the on-foot fog and 1.9 again from
 * 1,200 units up, which is where you would be looking for a border — and it was
 * drawn *twice*, once by each country, with the dash phase of each ring
 * starting from that ring's own point 0. The two patterns are unrelated, so
 * where one drew a gap the other drew a dash and the dashes filled each other
 * in.
 *
 * So what is left is one mark and it is the mark that was asked for: a **7-unit
 * dashed ink line, drawn once per frontier**, and no shading at all. The
 * country-coloured band is gone rather than tuned — the flag overlay in
 * `land-flags.ts` says whose ground it is far better than a tint of the ground
 * could, and two things saying the same thing is how the weaker one survives.
 *
 * **And it is drawn only from the air, which settled three things that had no
 * answer while it was drawn from everywhere.** A frontier is a fact about
 * people: on the ground it is a dashed line across a field that nothing in the
 * world agrees with, and it was also the one mark here that sank under a hill
 * or a town. It comes up with the flag now, on the same fade, and above 500
 * units it can afford what a ground-level mark could not:
 *
 * - **No depth test at all.** From the air the border is the map and nothing
 *   should hide it — not a hill between it and the eye, not the roofs of the
 *   town it runs through. What a missing depth test costs is the far side of
 *   the planet drawn over the near side, so the vertex stage answers the
 *   horizon itself and the fragment stage discards what is over it. See
 *   `NEAR_CUT` for the other end of that.
 * - **A width that grows with the range**, so a frontier reads the same from
 *   3,000 units as from 300. It is a uniform against an `across` attribute and
 *   not a rebuilt mesh: the buffer holds the line's own centre and the
 *   direction to step sideways in, and one float a frame does the rest.
 * - **A normal that is the ground's up** rather than a cross product of a quad
 *   that is now zero-width in the buffer. `computeVertexNormals` on a collapsed
 *   quad is a `NaN`, which is a black line, which nobody would have called a
 *   bug in an ink mark until it stopped fading with the rest.
 */

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Width of the line, in world units: the floor, the target and the ceiling.
 *
 * The avatar is 6.8, so `WIDTH` is about one person across — a painted line on
 * the ground rather than a pen stroke. It was a *world* width and nothing else,
 * which is the opposite of `OutlineEffect`'s pen, and that is what made it
 * useless from anywhere but one altitude: the apparent width is
 * `(h / 2) / tan(fov / 2) * w / range`, about `864 * w / range` at 900 px and
 * a 55-degree lens, so 7 units is 20 px standing on it, 5.8 px from 1,200 units
 * up and **1.0 px from 6,000**, which is where you are when the border is the
 * only thing telling you which country you are over.
 *
 * So the width is chosen against the range now, for `TARGET_PIXELS` of line
 * whatever the altitude, and both ends of it are a real constraint:
 *
 * - **Below, the world width wins.** Under about 1,200 units the pixel target
 *   asks for a line thinner than a painted one, and a border you are standing
 *   on is a mark on the ground with a width of its own.
 * - **Above, the dash is the ceiling.** `DASH` is 60 units, so a line as wide
 *   as 20 is a dash three times as long as it is wide and anything past that
 *   is a chain of blobs rather than a dashed line. 21 units is what holds the
 *   rhythm, and it is reached at 2,500 units up. Past there the line thins
 *   again — 3.6 px at 6,000, under a pixel from the plane's ceiling — and there
 *   is no width that fixes that, because at that range the whole of Belgium is
 *   80 px: what carries a border from the ceiling is the flag fill either side
 *   of it, which is why the two features arrived together.
 */
const WIDTH = 7;
const WIDTH_MAX = 21;
const TARGET_PIXELS = 6;

/**
 * How close to the eye a border fragment is thrown away, in world units.
 *
 * The depth test is off, so without this the frontier under the plane is drawn
 * **over** the plane. The camera orbits its craft at 62 units low and 340 at
 * the ceiling (`camera.ts`), and every border quad is on the ground, which the
 * fade guarantees is at least 500 units below — so a cut anywhere between 340
 * and 500 removes the craft and nothing else. It is the far side of the same
 * question `vAtlasHorizon` answers at the other end.
 */
const NEAR_CUT = 400;

/** Below this the mark is not worth a draw call: the mesh goes invisible. */
const MIN_FADE = 0.004;

/**
 * Lift off the ground.
 *
 * The line's own vertices sit on the ring's points, which are also the mesh's
 * own vertices, so along the line the two agree exactly — but the quad is 3.5
 * units either side of that and lands *inside* a mesh triangle, where the
 * surface is a plane and the relief is not. That is the same disagreement the
 * settlement paving is priced against and it is bounded by `RELIEF_SAG`, three
 * units, out in open country where `setDetailSites` makes no claim — which is
 * exactly where a frontier runs. `settlements.ts` measured what a given lift
 * loses to it (20.9% of ground at 0.10, 5.3% at 1.00, 2.2% at 1.50, 0.9% at
 * 2.00) and this is a quarter of an avatar, which is inside the 0.49-unit mean
 * disagreement the world already has between the mesh and where the feet go.
 */
const LIFT = 1.8;

/**
 * Dash and gap along the frontier, in world units.
 *
 * A frontier is a fact about people and not about the ground, so it is drawn as
 * a dashed line the way a map draws one. 60 and 34 against a 7-unit width is
 * 8.6 dashes to a width, which reads as a dash from the ground and resolves
 * into a line from the air — and it is the same pair the old line used, because
 * what was wrong with that line was never its rhythm.
 */
const DASH = 60;
const GAP = 34;

/**
 * Longest piece of frontier drawn as one quad, in world units.
 *
 * The line's height is sampled at its corners, so a quad is a flat chord across
 * whatever the ground does between them. Most frontiers are sampled densely
 * enough by the bake that this never fires — the median frontier edge is **20.9
 * units** — but the straight ones are drawn with almost no points at all and
 * the longest single edge on the planet is **1,578**, which is a quad five times
 * the length of a settlement laid flat across hills. Those are the borders ruled
 * with a straightedge across a desert, and they are exactly the ones a chord
 * fails on.
 */
const MAX_SPAN = 40;

/**
 * Where the line gives up, in units of ground height.
 *
 * **The shore ramps and a ribbon laid a fixed height above it does not.** Every
 * coast falls from the shelf's `LAND_HEIGHT` down to a 4-unit lip over 26 to 130
 * units, at gradients up to 0.65, so anything laid flat on that slope comes off
 * it as slivers standing out over the beach.
 *
 * The answer is not to follow the ramp more finely: **a frontier that has
 * reached the beach has already ended.** Two countries meet on land, and the
 * last few units before the water are the coast's business. So the line stops
 * across the top of the ramp, before the slope steepens — which also happens to
 * be what a border looks like on a map. Measured, it drops **2,955 of the
 * 39,440 frontier edges, 7.5%**, and they are the ends of the frontiers.
 */
const SHORE_FADE_START = LAND_HEIGHT - 2.5;
const SHORE_FADE_END = LAND_HEIGHT - 0.4;

export interface Borders {
  mesh: THREE.Mesh;
  /**
   * Frontier edges found, coastline edges skipped, and how many of the
   * frontiers this ring did not own because the country on the other side
   * carries the same edge. `width` and `fade` are what the last `update` set,
   * which is how the apparent width at a given altitude gets measured. On
   * `atlas.borders`.
   */
  stats: {
    frontier: number;
    coast: number;
    shared: number;
    drawn: number;
    triangles: number;
    width: number;
    fade: number;
  };
  /**
   * The altitude fade, and how many world units one pixel is at the range the
   * line is being read from. One float a frame; nothing is rebuilt.
   */
  update(fade: number, unitsPerPixel: number): void;
}

/**
 * A key for an undirected edge, so a frontier shared by two countries is drawn
 * once.
 *
 * The two rings hold the *same* vertices — Natural Earth's polygons come out of
 * one topology, and `globe.ts` relies on that already when it says two countries
 * sharing a border through a lake "hand `densify` the same pair of ends and get
 * the same subdivision, which is the only reason their surfaces still meet". So
 * an exact key on the pair is exact, and where it is not — an enclave like
 * Lesotho, whose neighbour's polygon simply covers it and has no such edge at
 * all — there is only one ring holding the edge and it draws it. Ownership goes
 * to the lower ring index so that one ring owns a whole shared frontier and the
 * dash phase runs along it unbroken.
 */
function edgeKey(a: number[], b: number[]): string {
  const [alon, alat] = [a[0]!, a[1]!];
  const [blon, blat] = [b[0]!, b[1]!];
  return alon < blon || (alon === blon && alat <= blat)
    ? `${alon},${alat},${blon},${blat}`
    : `${blon},${blat},${alon},${alat}`;
}

export function createBorders(world: World): Borders {
  const positions: number[] = [];
  const colors: number[] = [];
  /** The ground's up at each vertex; see the header on why it is not computed. */
  const normals: number[] = [];
  /** Which way to step sideways, and how far as a fraction of the width. */
  const offsets: number[] = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const segment = new THREE.Vector3();
  const up = new THREE.Vector3();
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const ink = new THREE.Color(0x2a1410);

  const seaward = coastEdges(world);
  const rings = world.rings as LandRing[];

  /**
   * Who draws each shared frontier. One pass, 39,440 edges, a string key each.
   *
   * It is the pairing step the old file was proud of not needing, and the
   * reason it now does is the dash: two coincident lines of the same ink are
   * invisible to each other because they are the same colour, but two *dash
   * patterns* are not, and unrelated phases fill each other's gaps in.
   */
  const owner = new Map<string, number>();
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    // A lake belongs to nobody, so no edge of one is a frontier. Its winding is
    // reversed, which makes `coastEdges` answer "sea" for almost all of them —
    // but not for the 287 where the probe lands on an island in the lake, and
    // those would have drawn a border round a shoreline.
    if (ring.water || ring.country <= 0) continue;
    const flags = seaward[r]!;
    for (let i = 0; i < ring.points.length; i++) {
      if (flags[i] === 1) continue;
      const key = edgeKey(ring.points[i]!, ring.points[(i + 1) % ring.points.length]!);
      const held = owner.get(key);
      if (held === undefined || r < held) owner.set(key, r);
    }
  }

  let frontier = 0;
  let coast = 0;
  let shared = 0;
  let drawn = 0;

  const head = new THREE.Vector3();
  const tail = new THREE.Vector3();

  /**
   * One corner: the point on the *line*, the up there, and which way to step.
   *
   * **The buffer holds a line of zero width** — both corners of an end sit on
   * the same point — and `across` is the unit direction the vertex shader steps
   * along, times a half and times the shore fade. That is what makes the width
   * a uniform: nothing here knows how wide the line will be drawn.
   *
   * The radius is sampled **on the line and not at the corner**, which is not
   * thrift although it does halve the `elevationAt` calls this file makes. A
   * corner is half a width off the line, and half a width off a frontier that
   * runs along a lakeshore is *in the lake*, where `elevationAt` answers 0
   * exactly as it does over the Atlantic — so a corner sampled at itself dives
   * 20 units to sea level and the line falls off the edge of the world at every
   * Great Lake. Measured before the fix, the lowest drawn vertex on the planet
   * was `LIFT` above sea level; sampled on the line it is `SHORE_LIP` plus the
   * lift, which is the floor the shore fade already promised. Now that the
   * corner is placed on the GPU there is no other choice anyway.
   */
  const corner = (unit: THREE.Vector3, radius: number, side: number): void => {
    positions.push(unit.x * radius, unit.y * radius, unit.z * radius);
    normals.push(unit.x, unit.y, unit.z);
    offsets.push(across.x * side, across.y * side, across.z * side);
    colors.push(ink.r, ink.g, ink.b);
  };

  /** One quad of the line, from `from` to `to` along the great circle a -> b. */
  const piece = (from: number, to: number, span: number): void => {
    const steps = Math.max(1, Math.ceil(((to - from) * span) / MAX_SPAN));
    for (let step = 0; step < steps; step++) {
      head.copy(a).lerp(b, from + ((to - from) * step) / steps).normalize();
      tail.copy(a).lerp(b, from + ((to - from) * (step + 1)) / steps).normalize();
      segment.copy(head).add(tail).normalize();

      const groundHead = groundRadius(world, probe.copy(head).multiplyScalar(PLANET_RADIUS));
      const groundTail = groundRadius(world, probe.copy(tail).multiplyScalar(PLANET_RADIUS));

      // A frontier that has reached the beach has already ended. The *lower*
      // of the two ends decides, not the mean: a 40-unit piece can straddle a
      // lakeshore with one end on 40 units of shelf and the other on none, and
      // a mean would draw it and let that end fall to sea level.
      const shelf = Math.min(groundHead, groundTail) - PLANET_RADIUS;
      const ashore = clamp01((shelf - SHORE_FADE_START) / (SHORE_FADE_END - SHORE_FADE_START));
      if (ashore <= 0.02) continue;

      up.copy(segment);
      along.subVectors(tail, head).normalize();
      across.crossVectors(up, along).normalize();
      // Half a width, and the shore fade with it: the uniform is the whole
      // width in world units, so what is stored is the fraction of it.
      const half = ashore / 2;
      const rHead = groundHead + LIFT;
      const rTail = groundTail + LIFT;

      // Wound so that `cross(edge1, edge2)` is the local up, which is the
      // normal being written: (head-, tail-, tail+) then (head-, tail+, head+).
      corner(head, rHead, -half);
      corner(tail, rTail, -half);
      corner(tail, rTail, half);
      corner(head, rHead, -half);
      corner(tail, rTail, half);
      corner(head, rHead, half);
      drawn++;
    }
  };

  const cycle = DASH + GAP;

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    if (ring.water || ring.country <= 0) continue;
    const flags = seaward[r]!;
    const points = ring.points;
    /** Distance walked along this ring, so the dashes are continuous. */
    let travelled = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      onSphere(points[i]![0]!, points[i]![1]!, a);
      onSphere(points[j]![0]!, points[j]![1]!, b);
      const span = a.angleTo(b) * PLANET_RADIUS;
      if (span < 0.001) continue;

      const start = travelled;
      travelled += span;
      if (flags[i] === 1) {
        coast++;
        continue;
      }
      frontier++;
      if (owner.get(edgeKey(points[i]!, points[j]!)) !== r) {
        shared++;
        continue;
      }

      // Cut this edge at the dash boundaries rather than testing its midpoint:
      // the median frontier edge is 20.9 units against a 94-unit cycle, so one
      // decision per edge would quantise the pattern into noise.
      let at = start;
      while (at < start + span) {
        const phase = ((at % cycle) + cycle) % cycle;
        const boundary = phase < DASH ? DASH - phase : cycle - phase;
        const next = Math.min(at + boundary, start + span);
        if (phase < DASH) piece((at - start) / span, (next - start) / span, span);
        at = next;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('across', new THREE.Float32BufferAttribute(offsets, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // The centreline's own bounding sphere, which is the planet: this mesh is one
  // draw call covering every frontier on Earth and there is nothing to cull.
  geometry.computeBoundingSphere();

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
    transparent: true,
    opacity: 0,
    // Nothing on the ground may hide a frontier from the air — see the header —
    // and nothing this transparent should be writing depth for what comes after
    // it either.
    depthTest: false,
    depthWrite: false,
  });
  // No ink hull of its own: the line *is* ink, and an outline around a mark
  // that is already the pen's own colour is a second stroke nobody asked for.
  // It also keeps the second pass off a mesh whose vertex stage moves its own
  // corners, which `OutlineEffect` builds its own program for and would not do.
  material.userData.outlineParameters = { visible: false };

  const width = { value: WIDTH };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['atlasBorder'] = width;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec3 across;
uniform float atlasBorder;
varying float vAtlasHorizon;
varying float vAtlasEye;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
  // The corner, placed. A straight step in the tangent plane and not an arc
  // along the sphere: at the widest this line ever gets, the difference is
  // 21^2 / 8R = 0.003 units, and the depth test is off anyway.
  transformed += across * atlasBorder;
  vec3 atlasWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float atlasEyeLength = max(length(cameraPosition), 1.0);
  // Positive on the near side of the horizon. The occluder is the sea sphere's
  // own radius, so a border on a shelf 20 units up is held a little past the
  // true limb, which is the right way to be wrong: it disappears behind the
  // planet's edge rather than in front of it.
  vAtlasHorizon = dot(normalize(atlasWorld), cameraPosition / atlasEyeLength)
    - ${PLANET_RADIUS.toFixed(1)} / atlasEyeLength;
  vAtlasEye = distance(atlasWorld, cameraPosition);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vAtlasHorizon;\nvarying float vAtlasEye;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  if (vAtlasHorizon < 0.0 || vAtlasEye < ${NEAR_CUT.toFixed(1)}) discard;`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-border';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'borders';
  // After the land, and after anything else opaque: with no depth test at all,
  // what is drawn last is what is seen, and the frontier is meant to be seen.
  mesh.renderOrder = 3;
  mesh.visible = false;

  const stats = {
    frontier,
    coast,
    shared,
    drawn,
    triangles: positions.length / 9,
    width: WIDTH,
    fade: 0,
  };

  return {
    mesh,
    stats,
    update(fade: number, unitsPerPixel: number): void {
      stats.fade = fade;
      mesh.visible = fade > MIN_FADE;
      if (!mesh.visible) return;
      material.opacity = clamp01(fade);
      width.value = Math.min(WIDTH_MAX, Math.max(WIDTH, TARGET_PIXELS * unitsPerPixel));
      stats.width = width.value;
    },
  };
}
