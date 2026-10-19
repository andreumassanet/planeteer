/**
 * The year on the flora, in the shaders: one uniform, the sky clock's
 * `seasonTurn` (`groundWeather.atlasSeasonTurn`), and a seed a tree, so
 * nothing is rebuilt as the months go by.
 *
 * A point's phase is the year in its own hemisphere, 0 to 1: 0 the height of
 * summer, a quarter the height of autumn, a half the depth of winter, three
 * quarters the height of spring. The tropics keep their green: every term
 * fades in between `TROPIC_FROM` and `TROPIC_TO` degrees of latitude.
 *
 * - A deciduous crown turns yellow, orange or red through the autumn, thins to
 *   a few brown-grey leaves over the winter, comes back a fresh light green in
 *   the spring, some of it in blossom, and is full green by summer.
 *   Conifers and palms (the atlas's lower half) keep theirs.
 * - The ground's green, which the land and the grass both read through
 *   `atlasGroundSeason`, pales in winter and, where the climate is dry,
 *   browns towards straw at the end of the summer.
 *
 * Needs `uniform float atlasSeasonTurn`, which the ground weather's uniform
 * set carries (`bindGroundWeather`).
 */

/** Latitudes, degrees, over which the seasons fade in from the tropics. */
const TROPIC_FROM = 22;
const TROPIC_TO = 34;
/** How far either side of the mean a tree's own timing runs, as a share of the year. */
const TREE_SPREAD = 0.035;

export const SEASON_GLSL = /* glsl */ `
uniform float atlasSeasonTurn;
float atlasSeasonHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float atlasSeasonPhase(vec3 up, float shift) {
  return fract(atlasSeasonTurn / 6.2831853 + (up.y < 0.0 ? 0.5 : 0.0) + shift);
}
float atlasSeasonReach(vec3 up, float from, float to) {
  return smoothstep(from, to, degrees(asin(min(1.0, abs(up.y)))));
}
// A deciduous crown's year at a world position: x the autumn's colour, y how
// bare it is, z the spring's fresh green, w the blossom. \`seed\` 0 to 1 a tree.
vec4 atlasLeafSeason(vec3 pos, float seed) {
  vec3 up = normalize(pos);
  float p = atlasSeasonPhase(up, (seed - 0.5) * ${(2 * TREE_SPREAD).toFixed(3)});
  float turn = smoothstep(0.13, 0.25, p) * (1.0 - smoothstep(0.31, 0.39, p));
  float bare = smoothstep(0.30, 0.38, p) * (1.0 - smoothstep(0.69, 0.75, p));
  float fresh = smoothstep(0.69, 0.75, p) * (1.0 - smoothstep(0.80, 0.90, p));
  float bloom = smoothstep(0.68, 0.71, p) * (1.0 - smoothstep(0.75, 0.79, p));
  return vec4(turn, bare, fresh, bloom) * atlasSeasonReach(up, ${TROPIC_FROM.toFixed(1)}, ${TROPIC_TO.toFixed(1)});
}
// A green's autumn: yellow, orange or red by the tree, at about its own lightness.
vec3 atlasAutumnOf(vec3 colour, float seed) {
  float l = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  vec3 hue = seed < 0.42 ? vec3(0.95, 0.66, 0.06) : seed < 0.78 ? vec3(0.92, 0.36, 0.05) : vec3(0.70, 0.10, 0.05);
  float hl = dot(hue, vec3(0.2126, 0.7152, 0.0722));
  return min(vec3(1.0), hue * (l * 1.35 / hl));
}
// The crown's colour through the year: \`s\` from \`atlasLeafSeason\`.
vec3 atlasLeafSeasoned(vec3 colour, vec4 s, float seed) {
  float l = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = mix(colour, atlasAutumnOf(colour, fract(seed * 7.13)), s.x * 0.92);
  c = mix(c, vec3(l) * vec3(0.95, 0.82, 0.68), s.y * 0.85);
  c = mix(c, colour * vec3(1.12, 1.3, 0.62) + vec3(0.01, 0.02, 0.0), s.z * 0.75);
  return c;
}
// How green a colour is, 0 to 1: \`atlasLush\`'s own test.
float atlasGreenOf(vec3 colour) {
  return clamp((colour.g - max(colour.r, colour.b)) / max(colour.g, 1e-3) * 4.0, 0.0, 1.0);
}
// The ground's green through the year: \`ref\` is the ground's own colour,
// which says how green and how dry it is; \`pos\` a world position.
vec3 atlasGroundSeason(vec3 colour, vec3 ref, vec3 pos) {
  float green = atlasGreenOf(ref);
  if (green <= 0.0) return colour;
  vec3 up = normalize(pos);
  float p = atlasSeasonPhase(up, 0.0);
  float l = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  float winter = smoothstep(0.33, 0.43, p) * (1.0 - smoothstep(0.64, 0.74, p))
    * atlasSeasonReach(up, ${(TROPIC_FROM + 2).toFixed(1)}, ${(TROPIC_TO + 2).toFixed(1)});
  float late = (1.0 - smoothstep(0.04, 0.10, abs(p - 0.12))) * atlasSeasonReach(up, 12.0, 22.0);
  float arid = smoothstep(0.42, 0.8, ref.r / max(ref.g, 1e-3));
  colour = mix(colour, vec3(l) * vec3(1.14, 1.08, 0.80) * 1.1, winter * 0.45 * green);
  return mix(colour, vec3(l) * vec3(1.4, 1.1, 0.5), late * (0.12 + 0.4 * arid) * green);
}
`;

/**
 * A leaf card's year, on `diffuseColor` after `color_fragment`: deciduous
 * cards (the atlas's upper half, `vMapUv.y` over a half) take the tree's
 * colour and, in the spring, a fruit tree's cards their blossom; the cards
 * of a bare tree fall away by their own number (`card`). Declares nothing
 * outside its block. `pos`, `seed` and `card` are GLSL expressions.
 */
export function leafSeasonChunk(pos: string, seed: string, card: string): string {
  return /* glsl */ `
#ifdef USE_MAP
{
  float deciduous = step(0.5, vMapUv.y);
  vec4 leafYear = atlasLeafSeason(${pos}, ${seed}) * deciduous;
  if (${card} < leafYear.y * 0.82 + leafYear.x * 0.12) discard;
  diffuseColor.rgb = atlasLeafSeasoned(diffuseColor.rgb, leafYear, ${seed});
  // A fruit tree's broad leaves (the atlas's left half) in flower, in clusters.
  float fruit = step(fract(${seed} * 13.7), 0.32) * step(vMapUv.x, 0.5);
  if (leafYear.w * fruit > 0.0) {
    float petals = step(0.52, atlasSeasonHash(vec3(floor(vMapUv * 40.0), ${card} * 97.0)));
    vec3 bloom = fract(${seed} * 29.3) < 0.5 ? vec3(0.98, 0.52, 0.66) : vec3(0.96, 0.94, 0.9);
    float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, bloom * clamp(l * 3.2, 0.35, 1.0), leafYear.w * fruit * petals * 0.9);
  }
}
#endif
`;
}

/** The same thinning in the sun's pass, so a bare tree's shadow is bare too. */
export function leafSeasonDepthChunk(pos: string, seed: string, card: string): string {
  return /* glsl */ `
#ifdef USE_MAP
{
  vec4 leafYear = atlasLeafSeason(${pos}, ${seed}) * step(0.5, vMapUv.y);
  if (${card} < leafYear.y * 0.82 + leafYear.x * 0.12) discard;
}
#endif
`;
}

/**
 * A far crown's year, on `diffuseColor`: the tree's colour on its green
 * vertices only (trunks and buildings keep theirs), a little held back, for a
 * crown that cannot thin; its seed is a hash of where it stands.
 */
export function farSeasonChunk(pos: string): string {
  return /* glsl */ `
{
  float farGreen = atlasGreenOf(diffuseColor.rgb);
  if (farGreen > 0.0) {
    float farSeed = atlasSeasonHash(floor(${pos} * 0.06));
    vec4 farYear = atlasLeafSeason(${pos}, farSeed) * vec4(0.8, 0.6, 0.7, 0.0) * farGreen;
    diffuseColor.rgb = atlasLeafSeasoned(diffuseColor.rgb, farYear, farSeed);
  }
}
`;
}
