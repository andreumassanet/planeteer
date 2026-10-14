import { resolve, dirname } from 'node:path';
import { ROOT, fail } from './setup.ts';
import { readFileSync, existsSync } from 'node:fs';
import { FACES, faceDir, facePoint } from '../../src/worlds/cube.ts';

// ===========================================================================
// 1. The first load
// ===========================================================================

console.log('=== Earth\'s first load ===\n');
{
  const seen = new Set<string>();
  const queue = [resolve(ROOT, 'src/main.ts')];
  // Static imports and re-exports, `import type` and `export type` left out:
  // they are erased. A dynamic `import()` is a separate chunk and is not followed.
  const IMPORT = /(?:^|\n)\s*import\s+(?!type\b)(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const EXPORT = /(?:^|\n)\s*export\s+(?!type\b)(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/g;
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const pattern of [IMPORT, EXPORT]) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
        const spec = match[1]!;
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), spec);
        if (existsSync(target)) queue.push(target);
      }
    }
  }
  const leaked = [...seen].filter((file) => file.includes('/src/worlds/') || file.includes('/src/system/'));
  console.log(`  ${seen.size} modules in main.ts's static graph`);
  for (const file of leaked) fail(`${file.slice(ROOT.length + 1)} is in Earth's first load`);
  const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8');
  if (!main.includes("import('./worlds/index.ts')") && !main.includes("'./worlds/index.ts'")) {
    fail('main.ts never reaches src/worlds/index.ts');
  }
}

// ===========================================================================
// 2. The cube
// ===========================================================================

console.log('\n=== the cube ===\n');
{
  FACES.forEach((face, k) => {
    const [ax, ay, az] = face.axis;
    const [ux, uy, uz] = face.u;
    const [vx, vy, vz] = face.v;
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if (cross[0]! * ax + cross[1]! * ay + cross[2]! * az <= 0.99) fail(`face ${k}: u x v is not its outward axis — its tiles are inside out`);
  });
  const dir = { x: 0, y: 0, z: 0 };
  const point = { face: 0, u: 0, v: 0 };
  let worst = 0;
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const u = -0.999 + (1.998 * i) / 10;
        const v = -0.999 + (1.998 * j) / 10;
        faceDir(face, u, v, dir);
        facePoint(dir.x, dir.y, dir.z, point);
        if (point.face === face) worst = Math.max(worst, Math.abs(point.u - u), Math.abs(point.v - v));
      }
    }
  }
  console.log(`  faceDir -> facePoint round trip: worst ${worst.toExponential(2)}`);
  if (worst > 1e-9) fail(`facePoint does not invert faceDir (worst ${worst})`);
}
