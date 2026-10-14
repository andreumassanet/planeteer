// The named ranges: crest lines that put the Himalaya and the Andes where an
// atlas says they are. The table places a range; the ridged noise draws it, and
// none of these numbers touches the terrain outside its own footprint.

import { toUnit } from '../sphere.ts';
import { DEG } from './constants.ts';
import { clamp, smoothstep } from './noise.ts';

/** A crest polyline (lat, lon), a half-width in degrees and the noise's ceiling inside the range (reached only on crests). */
const RANGES: { name: string; peak: number; width: number; path: [number, number][] }[] = [
  { name: 'Himalaya', peak: 620, width: 3.0,
    path: [[36, 74], [35, 77], [31, 79], [28, 84], [27.6, 90], [28, 95]] },
  { name: 'Tibet', peak: 300, width: 7.5, path: [[35, 80], [33, 89], [31, 97]] },
  { name: 'Tian Shan / Altai', peak: 330, width: 2.2,
    path: [[42, 75], [43, 82], [48, 89], [50, 96]] },
  { name: 'Andes', peak: 520, width: 2.1,
    path: [[10, -73], [4, -76], [-2, -78], [-10, -77], [-18, -69], [-27, -69], [-35, -70], [-45, -72], [-52, -73]] },
  { name: 'Rockies', peak: 380, width: 3.2,
    path: [[62, -138], [55, -125], [49, -116], [43, -110], [38, -107], [33, -108]] },
  { name: 'Sierra Nevada / Cascades', peak: 310, width: 1.4,
    path: [[48, -121], [43, -122], [38, -120], [36, -118]] },
  { name: 'Alaska Range', peak: 340, width: 1.8, path: [[68, -150], [63, -150], [61, -143]] },
  { name: 'Sierra Madre', peak: 260, width: 1.6, path: [[26, -107], [21, -103], [17, -96]] },
  { name: 'Appalachians', peak: 170, width: 1.6, path: [[47, -70], [41, -77], [35, -83]] },
  { name: 'Alps', peak: 340, width: 1.3,
    path: [[44.1, 7.0], [45.9, 7.4], [46.5, 10.3], [47, 13.2], [47, 15.5]] },
  { name: 'Pyrenees', peak: 240, width: 0.7, path: [[42.8, -1.5], [42.7, 1], [42.4, 2.4]] },
  { name: 'Scandes', peak: 220, width: 1.4, path: [[69, 21], [65, 14], [61, 8.5], [59, 7]] },
  { name: 'Caucasus', peak: 310, width: 1.0, path: [[43.5, 41], [42.6, 45], [41, 48]] },
  { name: 'Zagros', peak: 260, width: 1.8, path: [[37, 45], [33, 49], [29, 53], [27, 57]] },
  { name: 'Atlas', peak: 250, width: 1.2, path: [[31, -8], [32, -5], [34, 0], [36, 6]] },
  { name: 'Ethiopian highlands', peak: 280, width: 2.6, path: [[14, 38], [9, 38], [3, 37], [-3, 36]] },
  { name: 'Drakensberg', peak: 220, width: 1.4, path: [[-25, 30], [-29, 29], [-31, 28]] },
  { name: 'Great Dividing Range', peak: 200, width: 1.4,
    path: [[-17, 145], [-25, 148], [-33, 150], [-37, 147]] },
  { name: 'Southern Alps', peak: 270, width: 0.8, path: [[-42, 172], [-44, 169], [-45.5, 167]] },
  { name: 'Japanese Alps', peak: 240, width: 0.9, path: [[38, 140], [36, 138], [34.5, 136]] },
  // The two ice domes. Both are only recognisable from orbit, and both are
  // genuinely the shape of the land underneath a kilometre of ice.
  { name: 'Greenland dome', peak: 300, width: 5.0, path: [[77, -38], [72, -40], [66, -45]] },
  { name: 'East Antarctic dome', peak: 300, width: 12.0, path: [[-80, 90], [-82, 40], [-78, 130]] },
];

/** Path vertices as unit vectors, flattened, plus a bounding cone per range. */
const rangePoints: Float64Array[] = [];
const rangeCentre: Float64Array = new Float64Array(RANGES.length * 3);
/** Cosine of the cone half-angle, so the test below is one dot product. */
const rangeReach: Float64Array = new Float64Array(RANGES.length);

for (let r = 0; r < RANGES.length; r++) {
  const range = RANGES[r]!;
  const points = new Float64Array(range.path.length * 3);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  range.path.forEach(([lat, lon], i) => {
    toUnit(lat, lon, points, i * 3);
    cx += points[i * 3]!;
    cy += points[i * 3 + 1]!;
    cz += points[i * 3 + 2]!;
  });
  const length = Math.hypot(cx, cy, cz) || 1;
  cx /= length;
  cy /= length;
  cz /= length;
  let reach = 0;
  for (let i = 0; i < points.length; i += 3) {
    const dot = clamp(cx * points[i]! + cy * points[i + 1]! + cz * points[i + 2]!, -1, 1);
    reach = Math.max(reach, Math.acos(dot));
  }
  rangePoints.push(points);
  rangeCentre[r * 3] = cx;
  rangeCentre[r * 3 + 1] = cy;
  rangeCentre[r * 3 + 2] = cz;
  // Plus the width, so the cone covers the range's whole footprint.
  rangeReach[r] = Math.cos(reach + range.width * DEG);
}

/**
 * Height the named ranges allow at this point: the largest of their falloffs,
 * not the sum, so two crossing ranges cannot stack into a peak neither declares
 * (which keeps `MAX_RELIEF` provable).
 */
export function rangeHeight(x: number, y: number, z: number): number {
  let best = 0;
  for (let r = 0; r < RANGES.length; r++) {
    const centre = r * 3;
    // One dot product rejects every range the point is nowhere near.
    const dot = x * rangeCentre[centre]! + y * rangeCentre[centre + 1]! + z * rangeCentre[centre + 2]!;
    if (dot < rangeReach[r]!) continue;

    const range = RANGES[r]!;
    if (range.peak <= best) continue;
    const points = rangePoints[r]!;
    let nearest = Infinity;
    for (let i = 0; i + 5 < points.length; i += 3) {
      const ax = points[i]!, ay = points[i + 1]!, az = points[i + 2]!;
      const bx = points[i + 3]!, by = points[i + 4]!, bz = points[i + 5]!;
      const ex = bx - ax, ey = by - ay, ez = bz - az;
      const len = ex * ex + ey * ey + ez * ez;
      // Closest point on the chord rather than the arc: over a few degrees they
      // differ by under a thousandth of a degree, and this is a mask.
      const t = len > 0 ? clamp(((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / len, 0, 1) : 0;
      const dx = x - (ax + ex * t), dy = y - (ay + ey * t), dz = z - (az + ez * t);
      nearest = Math.min(nearest, dx * dx + dy * dy + dz * dz);
    }
    const distance = (2 * Math.asin(Math.min(1, Math.sqrt(nearest) / 2))) / DEG;
    const height = range.peak * smoothstep(range.width, range.width * 0.25, distance);
    if (height > best) best = height;
  }
  return best;
}
