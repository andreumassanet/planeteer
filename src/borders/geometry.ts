import * as THREE from 'three';
import type { LandRing, World } from '../geo.ts';
import { PLANET_RADIUS, coastEdges, groundRadius, onSphere } from '../globe.ts';
import { DASH, GAP, LIFT, MAX_SPAN, SHORE_FADE_END, SHORE_FADE_START, clamp01 } from './constants.ts';

/** The line's vertex data (zero-width quads placed on the GPU) and what was found. */
export interface BorderBuffers {
  positions: number[];
  normals: number[];
  offsets: number[];
  colors: number[];
  frontier: number;
  coast: number;
  shared: number;
  drawn: number;
}

/**
 * A key for an undirected edge, so a frontier shared by two countries is drawn
 * once. The two rings hold the same vertices (Natural Earth's polygons come out
 * of one topology), so an exact key on the pair is exact; an enclave whose
 * neighbour has no such edge is held by one ring and drawn by it.
 */
function edgeKey(a: number[], b: number[]): string {
  const [alon, alat] = [a[0]!, a[1]!];
  const [blon, blat] = [b[0]!, b[1]!];
  return alon < blon || (alon === blon && alat <= blat)
    ? `${alon},${alat},${blon},${blat}`
    : `${blon},${blat},${alon},${alat}`;
}

/**
 * Who draws each shared frontier: the lower ring index, so one ring owns a
 * whole frontier and its dash phase runs along it unbroken (two dash patterns
 * with unrelated phases would fill each other's gaps).
 */
function ownersOf(rings: readonly LandRing[], seaward: readonly Uint8Array[]): Map<string, number> {
  const owner = new Map<string, number>();
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    // A lake belongs to nobody, so no edge of one is a frontier. Its winding is
    // reversed, which makes `coastEdges` answer "sea" for almost all of them,
    // but not where the probe lands on an island in the lake.
    if (ring.water || ring.country <= 0) continue;
    const flags = seaward[r]!;
    for (let i = 0; i < ring.points.length; i++) {
      if (flags[i] === 1) continue;
      const key = edgeKey(ring.points[i]!, ring.points[(i + 1) % ring.points.length]!);
      const held = owner.get(key);
      if (held === undefined || r < held) owner.set(key, r);
    }
  }
  return owner;
}

/** Writes quads of the line into `out` along the great circle from `a` to `b`. */
function createPieceWriter(world: World, out: BorderBuffers, a: THREE.Vector3, b: THREE.Vector3) {
  const segment = new THREE.Vector3();
  const up = new THREE.Vector3();
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const head = new THREE.Vector3();
  const tail = new THREE.Vector3();
  const ink = new THREE.Color(0x2a1410);

  /**
   * One corner: the point on the line, the ground's up there, and which way to
   * step. The buffer holds a line of zero width (both corners of an end sit on
   * the same point) and `across` is the unit direction the vertex shader steps
   * along, so the width is a uniform. The radius is sampled on the line, not at
   * the corner: half a width off a frontier along a lakeshore is in the lake,
   * where `elevationAt` answers 0, and the corner would dive to sea level.
   */
  const corner = (unit: THREE.Vector3, radius: number, side: number): void => {
    out.positions.push(unit.x * radius, unit.y * radius, unit.z * radius);
    out.normals.push(unit.x, unit.y, unit.z);
    out.offsets.push(across.x * side, across.y * side, across.z * side);
    out.colors.push(ink.r, ink.g, ink.b);
  };

  return (from: number, to: number, span: number): void => {
    const steps = Math.max(1, Math.ceil(((to - from) * span) / MAX_SPAN));
    for (let step = 0; step < steps; step++) {
      head.copy(a).lerp(b, from + ((to - from) * step) / steps).normalize();
      tail.copy(a).lerp(b, from + ((to - from) * (step + 1)) / steps).normalize();
      segment.copy(head).add(tail).normalize();

      const groundHead = groundRadius(world, probe.copy(head).multiplyScalar(PLANET_RADIUS));
      const groundTail = groundRadius(world, probe.copy(tail).multiplyScalar(PLANET_RADIUS));

      // The lower of the two ends decides, not the mean: a piece can straddle a
      // lakeshore with one end on the shelf and the other on none.
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
      out.drawn++;
    }
  };
}

/** Builds the dashed frontier lines of every country, each frontier once. */
export function buildBorderBuffers(world: World): BorderBuffers {
  const out: BorderBuffers = { positions: [], normals: [], offsets: [], colors: [], frontier: 0, coast: 0, shared: 0, drawn: 0 };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const seaward = coastEdges(world);
  const rings = world.rings as LandRing[];
  const owner = ownersOf(rings, seaward);
  const piece = createPieceWriter(world, out, a, b);
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
        out.coast++;
        continue;
      }
      out.frontier++;
      if (owner.get(edgeKey(points[i]!, points[j]!)) !== r) {
        out.shared++;
        continue;
      }

      // Cut this edge at the dash boundaries rather than testing its midpoint:
      // one decision per edge would quantise the pattern into noise.
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
  return out;
}
