import { FLOOR, ROOF } from './codes.ts';

/**
 * The patterns, in the surface's own frame (+y up, world units). Each returns
 * `vec2(tone, height)`: a factor on the colour, and a height in world units
 * the material bends the normal by. Each fades to flat where a pixel covers
 * more than its joints can show. `px` is the world size of a pixel, taken
 * outside any branch. Needs `GROUND_MARKS_GLSL` before it, for `atlasHash`
 * and `atlasNoise`.
 */
export const SURFACE_GLSL = /* glsl */ `
float surfFade(float px, float period) {
  return 1.0 - smoothstep(period * 0.1, period * 0.35, px);
}
// 0 in a joint, 1 on a face, with a bevel of 'bevel' world units.
float surfFace(vec2 f, vec2 size, float joint, float bevel) {
  vec2 e = min(f, 1.0 - f) * size;
  return smoothstep(joint, joint + bevel, min(e.x, e.y));
}
vec2 surfBrick(vec2 uv, float px, float seed) {
  const vec2 size = vec2(0.5, 0.2);
  vec2 b = uv / size;
  float row = floor(b.y);
  b.x += mod(row, 2.0) * 0.5 + atlasHash(vec2(row, seed)) * 0.2;
  vec2 cell = floor(b);
  vec2 f = fract(b);
  float pick = atlasHash(cell + seed);
  float tone = 1.0 + (pick - 0.5) * 0.3;
  tone *= pick > 0.93 ? 0.8 : 1.0;
  tone *= 1.0 + (atlasNoise(vec3(uv * 9.0, seed)) - 0.5) * 0.12;
  float face = surfFace(f, size, 0.012, max(px, 0.02));
  float fade = surfFade(px, size.y);
  return vec2(mix(1.0, mix(1.2, tone, face), fade), (face * 0.03 + atlasNoise(vec3(uv * 14.0, seed)) * 0.006) * fade);
}
vec2 surfStone(vec2 uv, float px, float seed) {
  float height = 0.48;
  float row = floor(uv.y / height);
  float width = 0.7 + atlasHash(vec2(row, seed)) * 0.6;
  vec2 b = vec2(uv.x / width + atlasHash(vec2(seed, row)), uv.y / height);
  vec2 cell = floor(b);
  vec2 f = fract(b);
  float rough = atlasNoise(vec3(uv * 5.0, seed)) * 0.6 + atlasNoise(vec3(uv * 13.0, seed + 4.0)) * 0.4;
  float tone = 1.0 + (atlasHash(cell + seed * 3.1) - 0.5) * 0.28 + (rough - 0.5) * 0.16;
  float face = surfFace(f, vec2(width, height), 0.02, max(px, 0.05));
  float fade = surfFade(px, height);
  return vec2(mix(1.0, mix(0.68, tone, face), fade), (face * 0.05 + rough * 0.02) * fade);
}
vec2 surfTimber(vec2 uv, float px, float seed) {
  float height = 0.3;
  float row = floor(uv.y / height);
  float f = fract(uv.y / height);
  float span = 3.0 + atlasHash(vec2(row, seed)) * 3.0;
  float along = uv.x / span + atlasHash(vec2(seed, row));
  float board = floor(along);
  float grain = atlasNoise(vec3(uv.x * 0.7, uv.y * 18.0, seed));
  float tone = 1.0 + (atlasHash(vec2(board, row) + seed) - 0.5) * 0.14 + (grain - 0.5) * 0.14;
  float lip = smoothstep(0.0, 0.08 + px / height, f);
  float butt = smoothstep(0.0, 0.015 + px, min(fract(along), 1.0 - fract(along)) * span);
  tone *= mix(0.62, 1.0, lip) * mix(0.75, 1.0, butt);
  float fade = surfFade(px, height);
  return vec2(mix(1.0, tone, fade), (f * 0.04 * lip * butt + grain * 0.004) * fade);
}
vec2 surfConcrete(vec2 uv, float px, float seed) {
  const vec2 size = vec2(2.4, 1.8);
  vec2 b = uv / size;
  vec2 cell = floor(b);
  float pores = atlasHash(floor(uv * 22.0));
  float tone = 1.0 + (atlasHash(cell + seed) - 0.5) * 0.1 + (atlasNoise(vec3(uv * 2.0, seed)) - 0.5) * 0.12;
  tone *= 1.0 - step(0.97, pores) * 0.25 * surfFade(px, 0.08);
  float streak = atlasNoise(vec3(uv.x * 2.4, uv.y * 0.1, seed + 5.0));
  tone *= 1.0 - smoothstep(0.5, 0.9, streak) * 0.18;
  float face = surfFace(fract(b), size, 0.015, max(px, 0.03));
  float fade = surfFade(px, 0.5);
  return vec2(mix(1.0, mix(0.75, tone, face), fade), face * 0.02 * fade);
}
vec2 surfPlaster(vec2 uv, float px, float seed) {
  float broad = atlasNoise(vec3(uv * 0.45, seed));
  float fine = atlasNoise(vec3(uv * 6.0, seed + 2.0));
  float tone = 1.0 + (broad - 0.5) * 0.18 + (fine - 0.5) * 0.08;
  float streak = atlasNoise(vec3(uv.x * 1.6, uv.y * 0.15, seed + 9.0));
  tone *= 1.0 - smoothstep(0.55, 0.95, streak) * 0.16;
  // Where the render has fallen away, the brick under it.
  float loss = atlasNoise(vec3(uv * 0.55, seed + 31.0)) * 0.75 + atlasNoise(vec3(uv * 2.6, seed + 13.0)) * 0.25;
  float bare = smoothstep(0.68, 0.69 + px * 0.5, loss);
  float edge = smoothstep(0.63, 0.68, loss) * (1.0 - bare);
  vec2 brick = surfBrick(uv, px, seed);
  float height = 0.03 + fine * 0.008 + broad * 0.01;
  tone = mix(tone * (1.0 - edge * 0.22), brick.x * 0.85, bare);
  height = mix(height, brick.y * 0.6, bare);
  float fade = surfFade(px, 0.4) * 0.6 + 0.4 * surfFade(px, 3.0);
  return vec2(mix(1.0, tone, fade), height * fade);
}
vec2 surfRoof(vec3 p, vec3 n, vec3 colour, float px) {
  float hi = max(colour.r, max(colour.g, colour.b));
  float sat = hi <= 0.0 ? 0.0 : (hi - min(colour.r, min(colour.g, colour.b))) / hi;
  if (n.y > 0.96) {
    if (sat > 0.35) {
      // A terrace of square terracotta tiles.
      vec2 size = vec2(0.45);
      vec2 b = p.xz / size;
      float tone = 1.0 + (atlasHash(floor(b) + 3.0) - 0.5) * 0.22 + (atlasNoise(p * 0.5) - 0.5) * 0.16;
      float face = surfFace(fract(b), size, 0.01, max(px, 0.02));
      float fade = surfFade(px, 0.45);
      return vec2(mix(1.0, mix(0.8, tone, face), fade), face * 0.015 * fade);
    }
    // Gravel over a membrane, its patches and puddle stains.
    float grit = atlasHash(floor(p.xz * 14.0));
    float stain = smoothstep(0.55, 0.8, atlasNoise(p * 0.35 + 11.0));
    float tone = 1.0 + (grit - 0.5) * 0.28 * surfFade(px, 0.07) + (atlasNoise(p * 1.1) - 0.5) * 0.18 - stain * 0.14;
    return vec2(tone, grit * 0.008 * surfFade(px, 0.07));
  }
  vec3 down = normalize(vec3(0.0, -1.0, 0.0) + n * n.y);
  vec3 across = normalize(cross(n, down));
  vec2 uv = vec2(dot(p, across), dot(p, down));
  float rowSize = 0.3;
  float row = floor(uv.y / rowSize);
  float f = fract(uv.y / rowSize);
  float lip = smoothstep(0.0, 0.1 + px / rowSize, 1.0 - f);
  float tone;
  float height;
  if (sat > 0.3) {
    // Clay: barrel tiles, a column a tile, each row overlapping the one below.
    float c = uv.x / 0.28 + mod(row, 2.0) * 0.5;
    float barrel = sin(3.14159 * fract(c));
    tone = (0.7 + 0.4 * barrel) * mix(0.6, 1.0, lip) * (1.0 + (atlasHash(vec2(floor(c), row)) - 0.5) * 0.26);
    height = barrel * 0.06 + f * 0.03 * lip;
  } else {
    // Slate: staggered rectangles with a dark gap between them.
    float c = uv.x / 0.42 + mod(row, 2.0) * 0.5 + atlasHash(vec2(row, 5.0)) * 0.3;
    float gap = smoothstep(0.0, 0.015 + px, min(fract(c), 1.0 - fract(c)) * 0.42);
    tone = mix(0.62, 1.0, lip) * mix(0.7, 1.0, gap) * (1.0 + (atlasHash(vec2(floor(c), row) + 7.0) - 0.5) * 0.22);
    height = f * 0.025 * lip * gap;
  }
  // Moss and soot in the shade of the tiles.
  tone *= 1.0 + (atlasNoise(p * 0.3) - 0.5) * 0.18;
  float fade = surfFade(px, rowSize);
  return vec2(mix(1.0, tone, fade), height * fade);
}
vec2 surfAsphalt(vec2 uv, float px) {
  // Aggregate: a fine noise and the odd pale stone in it.
  float grain = atlasNoise(vec3(uv * 22.0, 0.0)) * 0.6 + atlasNoise(vec3(uv * 47.0, 5.0)) * 0.4;
  float stones = smoothstep(0.78, 0.86, atlasNoise(vec3(uv * 31.0, 12.0)));
  float broad = atlasNoise(vec3(uv * 0.25, 1.0)) * 0.6 + atlasNoise(vec3(uv * 1.1, 2.0)) * 0.4;
  float fine = surfFade(px, 0.06);
  float tone = 1.0 + ((grain - 0.5) * 0.3 + stones * 0.18) * fine + (broad - 0.5) * 0.2;
  // Two worn tracks a lane, paler where the tyres polish it.
  tone *= 1.0 + smoothstep(0.35, 0.65, atlasNoise(vec3(uv * vec2(0.08, 0.6), 4.0))) * 0.05;
  // Patched trenches: long rectangles of newer, darker tar.
  vec2 repair = floor(uv / vec2(9.0, 2.6) + vec2(0.0, atlasHash(floor(uv.xx / 9.0))));
  tone *= atlasHash(repair + 40.0) > 0.86 ? 0.82 : 1.0;
  // Oil and wet stains.
  tone *= 1.0 - smoothstep(0.66, 0.82, atlasNoise(vec3(uv * 0.7, 7.0))) * 0.2;
  // Cracks: thin ridges of a noise, where they run.
  float ridge = 1.0 - abs(atlasNoise(vec3(uv * 0.9, 3.0)) * 2.0 - 1.0);
  float crack = smoothstep(0.975, 0.995, ridge) * smoothstep(0.62, 0.8, atlasNoise(vec3(uv * 0.15, 9.0))) * surfFade(px, 0.2);
  tone *= 1.0 - crack * 0.22;
  return vec2(tone, (grain * 0.008 + stones * 0.006) * fine - crack * 0.01);
}
vec2 surfSlabs(vec2 uv, float px) {
  vec2 size = vec2(0.85);
  vec2 b = uv / size;
  b.x += mod(floor(b.y), 2.0) * 0.5;
  vec2 cell = floor(b);
  float pick = atlasHash(cell + 21.0);
  float tone = 1.0 + (pick - 0.5) * 0.14 + (atlasNoise(vec3(uv * 3.0, 4.0)) - 0.5) * 0.1;
  tone *= 1.0 - smoothstep(0.62, 0.85, atlasNoise(vec3(uv * 0.5, 8.0))) * 0.14;
  float face = surfFace(fract(b), size, 0.012, max(px, 0.025));
  float fade = surfFade(px, 0.85);
  return vec2(mix(1.0, mix(0.7, tone, face), fade), (face * 0.02 + pick * 0.004) * fade);
}
vec2 surfCobbles(vec2 uv, float px) {
  vec2 size = vec2(0.3, 0.26);
  vec2 b = uv / size;
  b.x += mod(floor(b.y), 2.0) * 0.5 + atlasHash(vec2(floor(b.y), 2.0)) * 0.3;
  vec2 cell = floor(b);
  vec2 f = fract(b) - 0.5;
  vec2 q = abs(f) * size;
  float r = 0.05;
  float d = length(max(q - (size * 0.5 - r), 0.0));
  float dome = 1.0 - smoothstep(0.0, r, d);
  float crown = 1.0 - dot(f, f) * 2.0;
  float pick = atlasHash(cell + 9.0);
  float tone = (1.0 + (pick - 0.5) * 0.36) * mix(0.6, 1.0, dome) * (0.88 + 0.16 * crown);
  float fade = surfFade(px, 0.26);
  return vec2(mix(1.0, tone, fade), dome * crown * 0.05 * fade);
}
vec2 surfPaint(vec2 uv, float px) {
  // Road paint worn through in patches.
  float wear = smoothstep(0.5, 0.8, atlasNoise(vec3(uv * 1.3, 6.0)) * 0.65 + atlasNoise(vec3(uv * 9.0, 2.0)) * 0.35);
  float grain = atlasNoise(vec3(uv * 22.0, 0.0));
  return vec2((1.0 - wear * 0.3 * surfFade(px, 0.3)) * (1.0 + (grain - 0.5) * 0.12 * surfFade(px, 0.06)), wear * -0.004);
}
vec2 surfMetal(vec2 uv, float px, float seed) {
  // Plates with a seam between them and a row of rivets above each seam: the faintest of the patterns.
  const vec2 size = vec2(1.6, 1.1);
  vec2 b = uv / size;
  b.x += mod(floor(b.y), 2.0) * 0.5;
  vec2 cell = floor(b);
  vec2 f = fract(b);
  float face = surfFace(f, size, 0.008, max(px, 0.02));
  vec2 rivetAt = vec2((fract(uv.x / 0.22) - 0.5) * 0.22, f.y * size.y - 0.07);
  float rivet = (1.0 - smoothstep(0.018, 0.018 + px, length(rivetAt))) * surfFade(px, 0.06);
  float sheen = atlasNoise(vec3(uv.x * 0.4, uv.y * 3.0, seed));
  float tone = 1.0 + (atlasHash(cell + seed) - 0.5) * 0.06 + (sheen - 0.5) * 0.06;
  tone *= mix(0.88, 1.0, face) * (1.0 + rivet * 0.08);
  float fade = surfFade(px, 0.25);
  return vec2(mix(1.0, tone, fade), (face * 0.008 + rivet * 0.012) * fade);
}
vec2 surfPattern(float code, vec3 p, vec3 n, vec3 colour, float px) {
  // A floor face that stands upright (a quay, a terrace's face) is a stone wall whatever it was pushed as.
  if (code > ${FLOOR.riser - 0.5} || (code > ${FLOOR.asphalt - 0.5} && abs(n.y) < 0.5)) {
    vec3 along = normalize(vec3(-n.z, 0.0, n.x) + vec3(1e-4, 0.0, 0.0));
    return surfStone(vec2(dot(p, along), p.y), px, 51.0);
  }
  if (code > ${FLOOR.paint - 0.5}) return surfPaint(p.xz, px);
  if (code > ${FLOOR.cobbles - 0.5}) return surfCobbles(p.xz, px);
  if (code > ${FLOOR.slabs - 0.5}) return surfSlabs(p.xz, px);
  if (code > ${FLOOR.asphalt - 0.5}) return surfAsphalt(p.xz, px);
  if (code > ${ROOF - 0.5}) return surfRoof(p, n, colour, px);
  vec3 along = normalize(vec3(-n.z, 0.0, n.x) + vec3(1e-4, 0.0, 0.0));
  // A face turned to the sky (a terrace, a parapet's top) is laid in plan.
  vec2 uv = abs(n.y) > 0.7 ? p.xz : vec2(dot(p, along), p.y);
  float seed = floor(code + 0.5) * 17.0;
  if (code < 1.5) return surfPlaster(uv, px, seed);
  if (code < 2.5) return surfBrick(uv, px, seed);
  if (code < 3.5) return surfStone(uv, px, seed);
  if (code < 4.5) return surfTimber(uv, px, seed);
  if (code < 5.5) return surfConcrete(uv, px, seed);
  return surfMetal(uv, px, seed);
}
// Three's bump mapping (Mikkelsen's surface gradient), for a height known by finite differences.
// A face seen exactly on edge has no gradient to bend by, and normalizing its zero is a NaN that the
// bloom spreads over the whole frame: such a pixel keeps its normal.
vec3 surfBend(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surfPos);
  vec3 vSigmaY = dFdy(surfPos);
  float sx = dot(vSigmaX, vSigmaX);
  float sy = dot(vSigmaY, vSigmaY);
  if (!(sx > 1e-20 && sy > 1e-20)) return surfNorm;
  vSigmaX *= inversesqrt(sx);
  vSigmaY *= inversesqrt(sy);
  vec3 R1 = cross(vSigmaY, surfNorm);
  vec3 R2 = cross(surfNorm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  vec3 bent = abs(fDet) * surfNorm - vGrad;
  float size = dot(bent, bent);
  return size > 1e-20 ? bent * inversesqrt(size) : surfNorm;
}
`;
