import { STOREY } from '../scenery/contract/scale.ts';

/** A room's height, world units: a storey of the kit. */
const ROOM_STOREY = STOREY;
/** How far a room reaches past each side of its window, world units. */
const ROOM_SIDE = 1.4;
/** How bright a room is by day against the street outside: it is lit only through its windows. */
const ROOM_DAYLIGHT = 0.68;
/** How deep a room is, world units, before each room's own draw. */
const ROOM_DEPTH = 4.5;

/**
 * The room behind a pane, by interior mapping: the eye's ray is carried
 * through the glass into a box a little wider than the window and a storey
 * tall, and the face it meets is painted as a wall, a floor or a ceiling, with
 * a piece of furniture against the back wall, a ceiling light, and curtains or
 * a blind in some windows. Everything is measured in world units in the
 * pane's own frame (x along the wall, y up, z into the building), so a shop
 * window opens on a deep room and a narrow sash on a small one.
 * Returns the room's colour; `glow` is how the lit window's light is
 * tinted by it, and `cover` how much of the pane a curtain or blind hides.
 */
export const ROOM_GLSL = /* glsl */ `
vec3 roomWall(float pick) {
  vec3 a = vec3(0.86, 0.8, 0.68);
  vec3 b = vec3(0.7, 0.78, 0.7);
  vec3 c = vec3(0.72, 0.76, 0.86);
  vec3 d = vec3(0.86, 0.66, 0.52);
  vec3 e = vec3(0.92, 0.9, 0.86);
  return pick < 0.3 ? a : pick < 0.45 ? b : pick < 0.6 ? c : pick < 0.72 ? d : e;
}
vec3 surfRoom(vec2 pane, float width, float height, vec3 dir, vec2 seed, out vec3 glow, out float cover) {
  float pick = atlasHash(seed);
  float pick2 = atlasHash(seed + 17.3);
  float storey = max(height + 0.6, ${ROOM_STOREY.toFixed(2)});
  float sill = max(0.15, (storey - height) * 0.7);
  vec3 lo = vec3(-${ROOM_SIDE.toFixed(2)}, -sill, 0.0);
  vec3 hi = vec3(width + ${ROOM_SIDE.toFixed(2)}, height + (storey - height - sill), ${ROOM_DEPTH.toFixed(2)} * (0.8 + pick2 * 0.6));
  vec3 at = vec3(pane.x * width, pane.y * height, 0.0);
  vec3 d = vec3(dir.xy, max(dir.z, 0.05));
  vec3 exit = (mix(lo, hi, step(0.0, d)) - at) / d;
  float t = min(exit.x, min(exit.y, exit.z));
  vec3 hit = at + d * t;
  vec3 wall = roomWall(pick);
  vec3 colour;
  float shade;
  if (t == exit.z) {
    // The back wall: a picture or a doorway, and a sofa, a shelf or a table against it.
    vec2 q = hit.xy;
    colour = wall;
    shade = 0.82;
    float mid = (lo.x + hi.x) * 0.5 + (pick2 - 0.5) * width;
    float furnitureTop = 0.55 + pick * 0.9;
    float furnitureHalf = 0.9 + pick2 * 1.2;
    if (q.y < furnitureTop && abs(q.x - mid) < furnitureHalf) {
      colour = pick2 < 0.5 ? vec3(0.45, 0.28, 0.18) : vec3(0.38, 0.42, 0.55);
      shade = 0.7 + 0.25 * smoothstep(furnitureTop - 0.1, furnitureTop, q.y);
    } else if (pick > 0.35 && abs(q.x - mid - 0.4) < 0.5 && abs(q.y - (furnitureTop + 0.9)) < 0.35) {
      colour = vec3(0.3 + pick2 * 0.5, 0.35, 0.5 - pick2 * 0.3);
      shade = 0.85;
    }
  } else if (t == exit.y) {
    if (d.y < 0.0) {
      // Floorboards, darker towards the back.
      float board = floor(hit.x / 0.35);
      colour = vec3(0.55, 0.36, 0.22) * (0.85 + atlasHash(vec2(board, seed.x)) * 0.3);
      colour *= mix(1.0, 0.8, smoothstep(0.0, 0.05, abs(fract(hit.x / 0.35) - 0.5) * 0.35 - 0.16));
      shade = 0.62;
    } else {
      // The ceiling and its light.
      colour = vec3(0.92, 0.9, 0.86);
      vec2 lamp = vec2((lo.x + hi.x) * 0.5, hi.z * 0.5);
      shade = 0.75 + 0.35 * (1.0 - smoothstep(0.0, 1.6, length(hit.xz - lamp)));
    }
  } else {
    colour = wall;
    shade = 0.68;
  }
  // The corners and the depth darken, the way a room is lit from its window.
  vec3 edge = min(hit - lo, hi - hit);
  float corner = min(min(edge.x, edge.y), edge.z);
  float inner = edge.x + edge.y + edge.z - corner - max(max(edge.x, edge.y), edge.z);
  shade *= mix(0.72, 1.0, smoothstep(0.0, 0.6, inner));
  shade *= mix(1.0, 0.55, smoothstep(0.0, hi.z * 1.3, hit.z));
  vec3 room = colour * shade * ${ROOM_DAYLIGHT.toFixed(2)};
  glow = colour * 1.3 + 0.15;
  // Curtains drawn to the sides, or a blind half down.
  cover = 0.0;
  if (pick2 > 0.45) {
    float side = 0.12 + pick * 0.2;
    float folds = 0.82 + 0.18 * sin(pane.x * width * 18.0);
    if (pane.x < side || pane.x > 1.0 - side) {
      vec3 cloth = pick < 0.5 ? vec3(0.85, 0.82, 0.74) : vec3(0.7, 0.32, 0.26);
      room = cloth * folds * 0.75;
      glow = cloth * 1.5;
      cover = 1.0;
    }
  } else if (pick2 < 0.2) {
    float drop = 0.25 + pick * 0.5;
    if (pane.y > 1.0 - drop) {
      float slat = 0.85 + 0.15 * step(0.5, fract(pane.y * height * 6.0));
      room = vec3(0.88, 0.86, 0.8) * slat * 0.7;
      glow = vec3(1.2, 1.1, 0.9);
      cover = 1.0;
    }
  }
  return room;
}
`;
