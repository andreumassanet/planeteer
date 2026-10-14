/**
 * Flocks circling overhead. All birds share one mesh whose vertices are
 * rewritten every frame: a bird is too small to be worth a draw call, and the
 * wings flap as rigid pieces hinged on the body's own Z.
 */
import * as THREE from 'three';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { rngFrom } from '../scenery/random.ts';
import { latOf, lonOf } from '../sphere.ts';
import { gradeAt, reliefAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import type { ViewCone } from '../view.ts';
import { birdGeometry } from './bird-geometry.ts';
import { cellPoint, forEachCell, tangentsAt } from './cells.ts';
import { moverMaterial } from './material.ts';
import { BIRD_CELL, FLOCK_CHANCE, FLOCK_MAX, FLOCK_MIN, FLOCK_RADIUS, MAX_BIRDS, TAU } from './tuning.ts';

interface Flock {
  centre: THREE.Vector3;
  radius: number;
  altitude: number;
  rate: number;
  count: number;
  seed: number;
  /** Each bird's lead, radius, rise and wingbeat, four a bird (`birdsOf`). */
  birds: Float64Array;
}

/** A flock's birds' draws, four a bird, taken once when the flock is admitted. */
function birdsOf(seed: number, count: number, radius: number): Float64Array {
  const out = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) {
    const rng = rngFrom(seed, 'bird', i);
    out[i * 4] = rng.unit() * TAU;
    out[i * 4 + 1] = radius * rng.spread(1, 0.28);
    out[i * 4 + 2] = rng.range(-14, 14);
    out[i * 4 + 3] = rng.range(5.5, 8.5);
  }
  return out;
}

export interface Birds {
  mesh: THREE.Mesh;
  /** Vertices in one bird. */
  readonly vertices: number;
  /** Admits the flocks in range and on screen, and drops the rest. */
  scan(viewer: THREE.Vector3, birdRange: number, cone: ViewCone): void;
  /** Poses every bird at `clock`; returns how many were drawn. */
  draw(clock: number): number;
  trim(cap: number): void;
}

export function createBirds(world: World): Birds {
  const flocks = new Map<string, Flock>();
  /** How full of birds a cell's ground is, and how high its flock must fly; cached per cell. */
  const birdLife = new Map<string, number>();
  const birdGround = new Map<string, number>();
  const birdAcross = new THREE.Vector3();
  const birdNorth = new THREE.Vector3();
  const birdSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const point = new THREE.Vector3();

  const bird = birdGeometry();
  const birdVertices = bird.position.length / 3;
  const flockGeometry = new THREE.BufferGeometry();
  const flockPosition = new Float32Array(MAX_BIRDS * birdVertices * 3);
  const flockNormal = new Float32Array(MAX_BIRDS * birdVertices * 3);
  const flockColor = new Float32Array(MAX_BIRDS * birdVertices * 3);
  for (let i = 0; i < MAX_BIRDS; i++) flockColor.set(bird.color, i * bird.color.length);
  flockGeometry.setAttribute('position', new THREE.BufferAttribute(flockPosition, 3));
  flockGeometry.setAttribute('normal', new THREE.BufferAttribute(flockNormal, 3));
  flockGeometry.setAttribute('color', new THREE.BufferAttribute(flockColor, 3));
  flockGeometry.setDrawRange(0, 0);
  const flockMesh = new THREE.Mesh(flockGeometry, moverMaterial(false));
  flockMesh.name = 'birds';
  // Every vertex moves every frame, so a bounding sphere would be stale at once.
  flockMesh.frustumCulled = false;

  /**
   * How many birds a cell has follows the biome's `cover`, with a flat share
   * at sea. The flock flies clear of the highest of `gradeAt`'s probes across
   * its outer radius, so no bird circles inside a hillside.
   */
  function groundOf(key: string, centre: THREE.Vector3): number {
    let living = birdLife.get(key);
    if (living === undefined) {
      const elevation = world.elevationAt(centre);
      living = elevation <= 0
        ? 0.55
        : 0.12 + 0.88 * BIOMES[biomeAt(
            centre.x, centre.y, centre.z,
            latOf(centre.y),
            lonOf(centre.x, centre.z),
            Math.max(0, elevation), biomeSample(),
          ).id].cover;
      tangentsAt(centre, birdAcross, birdNorth);
      gradeAt(centre, birdAcross, birdNorth, FLOCK_RADIUS[1], birdSlope);
      const rise = Math.max(0, birdSlope.highest - reliefAt(centre.x, centre.y, centre.z));
      birdGround.set(key, Math.max(0, elevation) + rise);
      birdLife.set(key, living);
    }
    return living;
  }

  function scan(viewer: THREE.Vector3, birdRange: number, cone: ViewCone): void {
    const seen = new Set<string>();
    if (birdRange > 0) {
      forEachCell(viewer, BIRD_CELL, birdRange, (row, col) => {
        const rng = rngFrom('flock', row, col);
        // The cheap draw before any ground query.
        if (!rng.chance(FLOCK_CHANCE)) return;
        const key = `b${row}.${col}`;
        const centre = cellPoint(row, col, BIRD_CELL, rng.range(0.2, 0.8), rng.range(0.2, 0.8));
        const living = groundOf(key, centre);
        if (!rng.chance(living)) return;
        const ground = birdGround.get(key) ?? 0;
        const altitudeOf = PLANET_RADIUS + ground + rng.range(45, 130);
        point.copy(centre).multiplyScalar(altitudeOf);
        if (point.distanceTo(viewer) > birdRange || !cone.admits(point, 140)) return;
        seen.add(key);
        if (flocks.has(key)) return;
        const radius = rng.range(FLOCK_RADIUS[0], FLOCK_RADIUS[1]);
        const rate = (rng.chance(0.5) ? 1 : -1) * rng.range(0.14, 0.3);
        const count = rng.int(FLOCK_MAX - FLOCK_MIN + 1) + FLOCK_MIN;
        const seed = rng.int(0x7fffffff);
        flocks.set(key, { centre, radius, altitude: altitudeOf, rate, count, seed, birds: birdsOf(seed, count, radius) });
      });
    }
    for (const key of [...flocks.keys()]) if (!seen.has(key)) flocks.delete(key);
  }

  const upAxis = new THREE.Vector3();
  const northward = new THREE.Vector3();
  const eastward = new THREE.Vector3();
  const here = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const birdMatrix = new THREE.Matrix4();
  const wingMatrix = new THREE.Matrix4();
  const bankMatrix = new THREE.Matrix4();
  const birdNormal = new THREE.Matrix3();
  const wingNormal = new THREE.Matrix3();

  /** Writes one bird's vertices at `cursor`, its body at `birdMatrix` and its wings flapped by `beat`. */
  function writeBird(cursor: number, beat: number): number {
    for (let v = 0; v < birdVertices; v++) {
      const boneId = bird.bone[v]!;
      let matrix = birdMatrix;
      let normals = birdNormal;
      if (boneId !== 0) {
        wingMatrix.makeRotationZ(boneId === 1 ? beat : -beat).premultiply(birdMatrix);
        wingNormal.getNormalMatrix(wingMatrix);
        matrix = wingMatrix;
        normals = wingNormal;
      }
      point.set(bird.position[v * 3]!, bird.position[v * 3 + 1]!, bird.position[v * 3 + 2]!).applyMatrix4(matrix);
      flockPosition[cursor] = point.x;
      flockPosition[cursor + 1] = point.y;
      flockPosition[cursor + 2] = point.z;
      point.set(bird.normal[v * 3]!, bird.normal[v * 3 + 1]!, bird.normal[v * 3 + 2]!)
        .applyMatrix3(normals).normalize();
      flockNormal[cursor] = point.x;
      flockNormal[cursor + 1] = point.y;
      flockNormal[cursor + 2] = point.z;
      cursor += 3;
    }
    return cursor;
  }

  function draw(clock: number): number {
    let cursor = 0;
    let drawn = 0;
    for (const flock of flocks.values()) {
      upAxis.copy(flock.centre);
      tangentsAt(upAxis, northward, eastward);
      // Banked into the turn, which is most of what reads as circling.
      bankMatrix.makeRotationZ(flock.rate > 0 ? 0.34 : -0.34);
      for (let i = 0; i < flock.count && drawn < MAX_BIRDS; i++) {
        const birds = flock.birds;
        const lead = birds[i * 4]!;
        const radius = birds[i * 4 + 1]!;
        const rise = birds[i * 4 + 2]!;
        const beatRate = birds[i * 4 + 3]!;
        const angle = lead + clock * flock.rate;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        here
          .copy(upAxis)
          .addScaledVector(eastward, (c * radius) / PLANET_RADIUS)
          .addScaledVector(northward, (s * radius) / PLANET_RADIUS)
          .normalize();
        forward
          .copy(eastward).multiplyScalar(-s)
          .addScaledVector(northward, c)
          .projectOnPlane(here)
          .normalize();
        right.crossVectors(here, forward).normalize();
        basis.makeBasis(right, here, forward);
        spin.setFromRotationMatrix(basis);
        point.copy(here).multiplyScalar(flock.altitude + rise + Math.sin(clock * 0.5 + lead) * 6);
        birdMatrix.compose(point, spin, unit).multiply(bankMatrix);
        birdNormal.getNormalMatrix(birdMatrix);
        cursor = writeBird(cursor, Math.sin(clock * beatRate + lead) * 0.62);
        drawn++;
      }
    }
    flockGeometry.setDrawRange(0, drawn * birdVertices);
    (flockGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (flockGeometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    flockMesh.visible = drawn > 0;
    return drawn;
  }

  return {
    mesh: flockMesh,
    vertices: birdVertices,
    scan,
    draw,
    trim(cap) {
      if (birdLife.size > cap) { birdLife.clear(); birdGround.clear(); }
    },
  };
}
