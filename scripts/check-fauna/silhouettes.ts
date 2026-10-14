import './herd.ts';
import * as THREE from 'three';
import { type FaunaStyle, variantRng } from '../../src/fauna/contract.ts';
import { FAUNA_STYLES } from '../../src/fauna/regions.ts';
import { ANIMALS, ctx } from './setup.ts';
import { type Pose, buildAnimal } from '../../src/fauna/body.ts';

// ---------------------------------------------------------------------------
console.log('\nthe silhouettes — the one thing no table can check');
// ---------------------------------------------------------------------------

/**
 * A side elevation, rasterised in world units and drawn in characters.
 *
 * In world units and not normalised into its own box (scaled into its own box
 * a bicycle and a four-wheel-drive look alike): a sheep should print smaller
 * than a camel.
 */
function elevation(group: THREE.Group, axis: 'side' | 'front', cell: number, rows: number): string[] {
  group.updateMatrixWorld(true);
  const tris: [number, number][][] = [];
  const vertex = new THREE.Vector3();
  let maxY = 0;
  let minU = Infinity;
  let maxU = -Infinity;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 3) {
      const tri: [number, number][] = [];
      for (let k = 0; k < 3; k++) {
        vertex.fromBufferAttribute(position, i + k).applyMatrix4(mesh.matrixWorld);
        const u = axis === 'side' ? vertex.z : vertex.x;
        tri.push([u, vertex.y]);
        maxY = Math.max(maxY, vertex.y);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
      }
      tris.push(tri);
    }
  });
  const cols = Math.ceil((maxU - minU) / cell) + 1;
  const height = Math.min(rows, Math.ceil(maxY / cell) + 1);
  const grid: string[] = [];
  for (let r = 0; r < height; r++) {
    let line = '';
    const y = maxY - (r + 0.5) * (maxY / height);
    for (let c = 0; c < cols; c++) {
      const u = minU + (c + 0.5) * cell;
      line += inside(tris, u, y) ? '#' : ' ';
    }
    grid.push(line.replace(/\s+$/, ''));
  }
  return grid;
}

function inside(tris: [number, number][][], u: number, y: number): boolean {
  for (const tri of tris) {
    const [a, b, c] = tri as [[number, number], [number, number], [number, number]];
    const d1 = (u - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
    const d2 = (u - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
    const d3 = (u - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

const sheetStyle: FaunaStyle = FAUNA_STYLES['atlantic-europe'];
for (const animal of ANIMALS) {
  const shape = animal.shape(variantRng(animal, sheetStyle, 0), sheetStyle);
  for (const pose of [{ kind: 'stand' } as Pose, { kind: 'graze' } as Pose]) {
    const body = buildAnimal(ctx, shape, pose);
    const art = elevation(body.group, 'side', 0.30, 40);
    console.log(`\n  ${animal.name} — ${pose.kind}, side, one character is 0.30 units`);
    for (const line of art) console.log(`    ${line}`);
  }
}

// One front elevation, because the ears and the width only exist there.
{
  const animal = ANIMALS.find((a) => a.id === 'cattle') ?? ANIMALS[0]!;
  const shape = animal.shape(variantRng(animal, sheetStyle, 0), sheetStyle);
  const body = buildAnimal(ctx, shape, { kind: 'stand' });
  console.log(`\n  ${animal.name} — front, one character is 0.18 units`);
  for (const line of elevation(body.group, 'front', 0.18, 40)) console.log(`    ${line}`);
}
