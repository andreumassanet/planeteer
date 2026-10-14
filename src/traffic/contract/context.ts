import * as THREE from 'three';
import { bodyPaint, isGlass } from '../../models.ts';
import { createSceneryContext, sceneryModel } from '../../scenery/contract.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { SolidSpec, TrafficContext } from './types.ts';

/** Sides of a road wheel. */
export const WHEEL_SIDES = 8;

type V = [number, number, number];

/**
 * One context for the whole kit. Wraps a `SceneryContext` (which wraps a
 * `MonumentContext`); pass the world's own so vehicles share its material
 * cache and ramp.
 */
export function createTrafficContext(base: SceneryContext = createSceneryContext()): TrafficContext {
  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (faceted !== geometry) geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, base.toon(color));
  };

  return {
    ...base,
    wheel: (radius, width, color, sides = WHEEL_SIDES) => meshOf(wheelGeometry(radius, width, sides), color),
    lathe(profile, color, sides = 12) {
      const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
      return meshOf(new THREE.LatheGeometry(points, Math.max(3, Math.round(sides))), color);
    },
    solid: (spec) => meshOf(solidGeometry(spec), spec.color),
    vehiclePaint(id, body, bodySlots) {
      return bodyPaint(sceneryModel(id), body, isGlass, bodySlots);
    },
    vehicle(id, fit, paint) {
      return base.fitted(id, fit, paint);
    },
  };
}

function wheelGeometry(radius: number, width: number, sides: number): THREE.BufferGeometry {
  const n = Math.max(3, Math.round(sides));
  // Built about Y at radius 1, laid along X, then normalised so `radius` is the
  // half-height of the finished wheel whatever the polygon does to the box.
  const geometry = new THREE.CylinderGeometry(1, 1, width, n, 1, false, Math.PI / n);
  geometry.rotateZ(Math.PI / 2);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  // Read the numbers before scaling: `scale` recomputes the box in place.
  const sy = (radius * 2) / (max.y - min.y);
  const sz = (radius * 2) / (max.z - min.z);
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  geometry.scale(1, sy, sz);
  geometry.translate(0, -cy * sy, -cz * sz);
  return geometry;
}

function solidGeometry(spec: SolidSpec): THREE.BufferGeometry {
  const {
    width,
    depth,
    height,
    foreWidth = width,
    topWidth = width,
    topForeWidth = foreWidth,
    aftRise = 0,
    foreRise = 0,
  } = spec;
  const hd = depth / 2;
  const topAft = spec.topAft ?? -hd;
  const topFore = spec.topFore ?? hd;

  // Corners: b/t bottom or top, a/f aft or fore, l/r -X or +X. Each face winds
  // outward; a reversed triangle inverts the outline hull over the mesh.
  const bal: V = [-width / 2, aftRise, -hd];
  const bar: V = [width / 2, aftRise, -hd];
  const bfr: V = [foreWidth / 2, foreRise, hd];
  const bfl: V = [-foreWidth / 2, foreRise, hd];
  const tal: V = [-topWidth / 2, height, topAft];
  const tar: V = [topWidth / 2, height, topAft];
  const tfr: V = [topForeWidth / 2, height, topFore];
  const tfl: V = [-topForeWidth / 2, height, topFore];

  const points: V[] = [];
  const quad = (a: V, b: V, c: V, d: V) => points.push(a, b, c, a, c, d);
  quad(bfl, bfr, tfr, tfl); // +Z, the fore face
  quad(bar, bal, tal, tar); // -Z, the aft face
  quad(bfr, bar, tar, tfr); // +X
  quad(bal, bfl, tfl, tal); // -X
  quad(tal, tfl, tfr, tar); // +Y
  quad(bal, bar, bfr, bfl); // -Y

  const kept: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    // Drop the degenerate halves of faces collapsed to an edge (a stem, a knife bow).
    if (area(points[i]!, points[i + 1]!, points[i + 2]!) > 1e-7) {
      kept.push(...points[i]!, ...points[i + 1]!, ...points[i + 2]!);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  return geometry;
}

function area(a: V, b: V, c: V): number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.hypot(cx, cy, cz) * 0.5;
}
