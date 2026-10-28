/**
 * The way to the marker, drawn in the world: a line of inked chevrons from
 * the player along the great circle towards it, laid by how the player is
 * travelling (`guide/layout.ts`), and a beacon of light standing on the place
 * itself (`guide/beacon.ts`). A ring course borrows the line for its next
 * ring, in green. One instanced mesh and one column; nothing when there is
 * nowhere to go.
 */
import * as THREE from 'three';
import { PALETTE, createToonRamp } from './theme.ts';
import { createBeacon } from './guide/beacon.ts';
import { MAX_CHEVRONS, layGuide } from './guide/layout.ts';
import type { GuideMedium } from './guide/layout.ts';

export type { GuideMedium } from './guide/layout.ts';

/** What the line is leading to: the marker (violet) or a course's next ring (green). */
export type GuideTone = 'marker' | 'ring';

export interface GuideFrame {
  from: THREE.Vector3;
  target: THREE.Vector3;
  medium: GuideMedium;
  tone: GuideTone;
  /** Where the beacon stands, on the ground; null for none. */
  beacon: THREE.Vector3 | null;
  eye: THREE.Vector3;
  radius: number;
  surfaceAt: (direction: THREE.Vector3) => number;
}

export interface Guide {
  readonly group: THREE.Group;
  /** Each frame after the camera has moved: a frame to draw, or null to put it all away. */
  update(dt: number, frame: GuideFrame | null): void;
  readonly stats: { chevrons: number; beacon: boolean };
  dispose(): void;
}

/** A chevron one unit long, pointing +Z, lying on y = 0 with its face +Y. */
function chevronGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outline: [number, number][] = [[0, 0.5], [0.5, -0.05], [0.5, -0.38], [0, 0.12], [-0.5, -0.38], [-0.5, -0.05]];
  shape.moveTo(outline[0]![0], outline[0]![1]);
  for (const [x, y] of outline.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const depth = 0.12;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  // The shape's +Y onto +Z and its depth onto -Y, then lifted onto y = 0.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, depth, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function chevronMaterial(color: number): THREE.MeshToonMaterial {
  const tint = new THREE.Color(color);
  return new THREE.MeshToonMaterial({
    color: tint,
    emissive: tint.clone().multiplyScalar(0.45),
    gradientMap: createToonRamp(4),
  });
}

export function createGuide(): Guide {
  const group = new THREE.Group();
  group.name = 'guide';
  const geometry = chevronGeometry();
  const tones: Record<GuideTone, THREE.MeshToonMaterial> = {
    marker: chevronMaterial(PALETTE.violet),
    ring: chevronMaterial(PALETTE.green),
  };
  const chevrons = new THREE.InstancedMesh(geometry, tones.marker, MAX_CHEVRONS);
  chevrons.name = 'guide:chevrons';
  chevrons.frustumCulled = false;
  chevrons.castShadow = false;
  chevrons.receiveShadow = false;
  chevrons.count = 0;
  chevrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(chevrons);
  const beacon = createBeacon(PALETTE.violet);
  group.add(beacon.mesh);
  const matrices = Array.from({ length: MAX_CHEVRONS }, () => new THREE.Matrix4());
  const stats = { chevrons: 0, beacon: false };
  let time = 0;

  return {
    group,
    stats,
    update(dt, frame) {
      time += dt;
      if (frame === null) {
        chevrons.count = 0;
        chevrons.visible = false;
        beacon.place(null, group.position, time);
        stats.chevrons = 0;
        stats.beacon = false;
        return;
      }
      const count = layGuide({ ...frame, time }, matrices);
      // `pnpm rings` holds every matrix `layGuide` writes to a positive determinant.
      for (let i = 0; i < count; i++) chevrons.setMatrixAt(i, matrices[i]!);
      chevrons.material = tones[frame.tone];
      chevrons.count = count;
      chevrons.visible = count > 0;
      chevrons.instanceMatrix.needsUpdate = true;
      beacon.place(frame.beacon, frame.eye, time);
      stats.chevrons = count;
      stats.beacon = frame.beacon !== null;
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      tones.marker.dispose();
      tones.ring.dispose();
      chevrons.dispose();
      beacon.dispose();
    },
  };
}
