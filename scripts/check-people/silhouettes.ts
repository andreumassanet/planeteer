import './contract.ts';
import { BODY_SCALE } from '../../src/stature.ts';
import { Vector3 } from 'three';
import { type Look, buildPerson } from '../../src/scenery/people.ts';
import { ctx } from './setup.ts';
import { lookFor, DRESS_IDS } from '../../src/scenery/dress.ts';
import { rngFrom } from '../../src/scenery/random.ts';

// ---------------------------------------------------------------------------
// Silhouette variety
// ---------------------------------------------------------------------------

/**
 * Rasterise the front view of a group into a bitmap, at the pixel size the
 * figure would actually occupy at `distance` units.
 *
 * The camera model is the one the whole project uses: `937 * size / distance`
 * pixels on a 900 px viewport with a 55 degree lens.
 */
function silhouette(group: import('three').Group, distance: number): Uint8Array {
  group.updateMatrixWorld(true);
  const pxPerUnit = 937 / distance;
  const halfWidth = 3.0 * BODY_SCALE;
  const top = 9.0 * BODY_SCALE;
  const w = Math.max(4, Math.round(halfWidth * 2 * pxPerUnit));
  const h = Math.max(4, Math.round(top * pxPerUnit));
  const bits = new Uint8Array(w * h);
  const v = new Vector3();

  group.traverse((object) => {
    const mesh = object as unknown as {
      isMesh?: boolean;
      geometry: import('three').BufferGeometry;
      matrixWorld: import('three').Matrix4;
    };
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const px: number[] = [];
      const py: number[] = [];
      for (let c = 0; c < 3; c++) {
        const i = index ? index.getX(t + c) : t + c;
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        px.push((v.x + halfWidth) * pxPerUnit);
        py.push((top - v.y) * pxPerUnit);
      }
      const minX = Math.max(0, Math.floor(Math.min(px[0]!, px[1]!, px[2]!)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(px[0]!, px[1]!, px[2]!)));
      const minY = Math.max(0, Math.floor(Math.min(py[0]!, py[1]!, py[2]!)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(py[0]!, py[1]!, py[2]!)));
      const d = (px[1]! - px[0]!) * (py[2]! - py[0]!) - (px[2]! - px[0]!) * (py[1]! - py[0]!);
      if (Math.abs(d) < 1e-9) continue;
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const sx = xx + 0.5;
          const sy = yy + 0.5;
          const a = ((px[1]! - sx) * (py[2]! - sy) - (px[2]! - sx) * (py[1]! - sy)) / d;
          const b = ((px[2]! - sx) * (py[0]! - sy) - (px[0]! - sx) * (py[2]! - sy)) / d;
          const c = 1 - a - b;
          if (a >= -0.002 && b >= -0.002 && c >= -0.002) bits[yy * w + xx] = 1;
        }
      }
    }
  });
  return bits;
}

const hashOf = (bits: Uint8Array): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 0) continue;
    h1 = Math.imul(h1 ^ i, 0x01000193);
    h2 = Math.imul(h2 ^ (i * 2654435761), 0x85ebca6b);
  }
  return `${h1 >>> 0}:${h2 >>> 0}`;
};

const differs = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

interface Variety {
  samples: number;
  exact: number;
  visible: number;
  ink: number;
}

function varietyAt(looks: Look[], distance: number, threshold: number): Variety {
  const seen = new Set<string>();
  const reps: Uint8Array[] = [];
  let ink = 0;
  for (const look of looks) {
    const group = buildPerson(ctx, look);
    const bits = silhouette(group, distance);
    seen.add(hashOf(bits));
    let filled = 0;
    for (let i = 0; i < bits.length; i++) filled += bits[i]!;
    ink += filled;
    let novel = true;
    for (const rep of reps) {
      if (differs(rep, bits) <= threshold) {
        novel = false;
        break;
      }
    }
    if (novel) reps.push(bits);
    group.traverse((o) => {
      const mesh = o as { isMesh?: boolean; geometry?: { dispose(): void } };
      if (mesh.isMesh) mesh.geometry!.dispose();
    });
  }
  return {
    samples: looks.length,
    exact: seen.size,
    visible: reps.length,
    ink: Math.round(ink / looks.length),
  };
}

console.log('\n=== silhouette variety ===');
console.log(
  'Front view, rasterised at the size the figure really is at that distance\n' +
    '(937 * height / distance px), then counted as distinct when two bitmaps\n' +
    'differ by more than a share of the average inked area. Exact is the count\n' +
    'of bitmaps that differ at all, and it is nearly useless: height is\n' +
    'continuous, so almost every pair differs by one pixel somewhere.',
);
export const looksFor = (region: string, n: number, age?: 'child'): Look[] => {
  const out: Look[] = [];
  for (let i = 0; i < n; i++) {
    out.push(lookFor(rngFrom('crowd', region, i), region, age ? { age } : {}));
  }
  return out;
};

const SHARES = [0.02, 0.05, 0.1];

function report(label: string, looks: Look[]): void {
  for (const [distance, tall] of [
    [Math.round(40 * BODY_SCALE), '159 px tall'],
    [Math.round(120 * BODY_SCALE), '53 px'],
    [Math.round(300 * BODY_SCALE), '21 px'],
  ] as const) {
    const ink = varietyAt(looks.slice(0, 40), distance, 0).ink;
    const counts = SHARES.map((share) => {
      const v = varietyAt(looks, distance, Math.max(1, Math.round(ink * share)));
      return `${String(v.visible).padStart(4)} at ${(share * 100).toFixed(0)}%`;
    });
    const exact = varietyAt(looks, distance, 0).exact;
    console.log(
      `  ${label.padEnd(16)} ${String(distance).padStart(3)} u (${tall.padEnd(11)}) ` +
        `${String(looks.length).padStart(4)} seeds -> ${String(exact).padStart(4)} exact | ${counts.join(' | ')}`,
    );
  }
}

for (const region of ['atlantic-europe', 'sub-saharan', 'east-asia'] as const) {
  report(region, looksFor(region, 400));
}

// Mixed across every region, which is what a continent looks like.
const worldwide: Look[] = [];
for (const region of DRESS_IDS) worldwide.push(...looksFor(region, 60));
report('all regions', worldwide);
report('children', looksFor('atlantic-europe', 200, 'child'));
