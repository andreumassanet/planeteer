/**
 * The solar system the front door opens on, built around the real Earth.
 *
 * **Earth in this orrery is not a model of Earth: it is the planet.** The menu
 * draws the world's own scene, so the land mesh, the sea, the weather and the
 * city lights are already standing at the origin, lit by the real sun at the
 * real hour. Everything this file adds is laid out *around* that — the Sun
 * where the Sun actually is as seen from here, and the other planets where
 * they actually are as seen from the Sun — so the flight from the whole system
 * down to a country is one continuous camera move over one scene, with no cut
 * and no stand-in globe to swap for the real one at the last moment.
 *
 * # What is true and what is a diagram
 *
 * **The directions are the sky's.** Each planet's heliocentric longitude today
 * comes from `system/orbits.ts` (Standish's elements); the frame they are
 * measured in — the ecliptic of date — is turned into this Earth-fixed world by
 * Greenwich sidereal time and the obliquity, which are two textbook formulas
 * (`celestial.ts`) and nothing `sun.ts`'s sun is computed from: it turns the
 * stars by them and finds the sun by NOAA's route. So `verify()` has a real
 * witness: the Sun placed by this file and the sun `sun.ts` lights the land
 * with were computed by different routes, from NOAA's solar formulas on one
 * side and Kepler plus sidereal time on the other, and they have to point the
 * same way. A mirror or a swapped axis anywhere in this chain puts the Sun in
 * the wrong half of the sky, which is the class of bug this project has shipped
 * three times.
 *
 * **The distances and the sizes are not**, and say so on the screen. At the
 * world's own scale Earth is 16,000 units across and Neptune is eleven billion
 * units away — `system/contract.ts` has the arithmetic, and the short of it is
 * that a true system is one pixel in a black frame. So the planets stand on
 * evenly-spaced rings, each ring as far from the last as the two planets on it
 * need to clear each other (`ringsFor`), and every planet but Earth is drawn
 * on a gentle power of its real radius (`drawnRadius`). Earth is exactly its
 * own size because it *is* its own size. Inclinations are dropped — the rings
 * are one plane — because a 7-degree Mercury on a diagram reads as a mistake.
 *
 * # What it costs
 *
 * Eight meshes, a sprite and eight thin ribbons: the planets are
 * geodesic spheres of 5,780 faces each, painted once from their own
 * `GroundModel` where they have one (so Mars shows Syrtis Major where Syrtis
 * Major is) and from latitude bands where they do not. They are drawn by the
 * same `outline.render` as everything else, so they carry the same pen.
 *
 * # Down at Earth, the rest steps back
 *
 * The rings were already going as the globe filled the frame; the bodies on
 * them were not, and from the country stage Saturn and its rings stood behind
 * the menu's own card. So everything but Earth fades out on the same
 * approach — the Sun and its glow too, since the land has the world's own sun
 * by then — except the body the camera has been sent to (`focus`), which a
 * planet near Earth on the day it is chosen must not lose. The fade is a real
 * fade and not a shrink: the fill turns transparent and keeps writing depth,
 * which is what hides the inside of its ink hull (a see-through fill that
 * writes no depth shows its whole hull through itself), and the hull takes the
 * fill's opacity on its own.
 */

import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { fbm } from './terrain.ts';
import { PALETTE } from './theme.ts';
import { BODIES, EARTH_RADIUS_KM, MOONS, heliocentric, moonPosition } from './system/index.ts';
import type { Body, GroundSample } from './system/index.ts';
import { latOf, lonOf } from './sphere.ts';
import { PRECESSION, centuriesSince2000, eclipticBasis } from './celestial.ts';

const DEG = Math.PI / 180;
const R = PLANET_RADIUS;

/**
 * The Sun's drawn radius, in Earth radii.
 *
 * Off every law for the reason `SUN_DRAWN` in the contract is: the real ratio
 * is 109 and any law that keeps Earth a shape makes the Sun swallow Mercury's
 * ring. Three is the largest that leaves Mercury's ring clear of it by more
 * than Mercury itself, and it is still the biggest thing in the frame.
 */
const SUN_RADII = 3;

/**
 * How the other planets are sized against Earth: the real radius ratio to this
 * power.
 *
 * `system/contract.ts` uses a square root for the orrery it describes, which
 * leaves Jupiter 3.3 Earths; here the rings are packed for a screen rather
 * than spread over true au, and 0.35 is what keeps the giants reading as giants
 * (Jupiter 2.3 Earths, Mercury 0.7) while Saturn's rings still clear the rings
 * either side of them.
 */
const SIZE_POWER = 0.35;

/** Clear sky between one ring's planet and the next, in Earth radii. */
const RING_GAP = 2.4;

/** Saturn's rings, in Saturn radii: the B ring, the Cassini gap, the A ring. */
const RINGS_B: readonly [number, number] = [1.42, 1.95];
const RINGS_A: readonly [number, number] = [2.03, 2.3];

/**
 * The approach to Earth over which the rest of the system fades, as distances
 * from Earth's centre in Earth radii: all there beyond the second, all gone
 * inside the first. The rings have always gone over exactly this span, and the
 * bodies on them go with them; the country stage frames the globe from 2.47.
 */
const NEAR_EARTH: readonly [number, number] = [5, 10];

/**
 * How far from Earth's centre the Moon is drawn, in Earth radii, on a ring of
 * its own round Earth.
 *
 * The real figure is sixty, which would put it out past Venus's ring on this
 * diagram. Off every law, like the Sun's: far enough that its disc (0.64 of
 * Earth's) stands clear of Earth's with an Earth's width of sky between them
 * from anywhere in the system, and that the camera framing the Moon's globe
 * from 2.5 of its own radii is still two Earth radii off Earth's centre; near
 * enough that it reads as Earth's and is never mistaken for a planet on a
 * ring of its own. The direction is the real one: the Moon's geocentric
 * ecliptic longitude and latitude today (`moonPosition`).
 */
const MOON_RADII = 3.6;

/**
 * Faces of a globe held up for its regions to be chosen on it (`holdUpright`
 * with regions): 20 * (d + 1)^2 = 33,620, about six times the planet's own.
 * The regions are read per pixel (`TINT_WIDTH`), so this is for the ground
 * under them: a face of the everyday mesh is four degrees across, coarse for
 * a globe that fills the screen; at this detail a face is under two degrees,
 * painted once a body and kept for the session.
 */
const HELD_DETAIL = 40;

/** How long a body takes to turn upright once held, seconds: inside the shortest flight down to it. */
const HOLD_SECONDS = 0.9;

/** How much of a region's own colour a held globe takes over its ground. */
const REGION_TINT = 0.7;

/**
 * The held globe's region map, texels: one equirectangular canvas, longitude
 * across and latitude down. Painted per face, a frontier was a staircase of
 * two-degree triangles that disagreed with the ink line drawn along it; read
 * per pixel off this it is the outline, and at a twelfth of a degree a texel
 * it is crisper than the screen the closest framing puts the globe on.
 */
const TINT_WIDTH = 4096;
const TINT_HEIGHT = 2048;

/**
 * One region as a held globe is tinted by it: its colour, and its rings as
 * `[lon, lat]` loops that never cross the antimeridian, so each fills flat.
 */
export interface HeldRegion {
  color: number;
  rings: readonly (readonly (readonly number[])[])[];
}

/**
 * Faces of a planet: `IcosahedronGeometry` detail, 20 * (d + 1)^2 = 5,780.
 *
 * Painting is the cost and it is small: a face's colour is one `GroundModel`
 * query, and Mars — the dearest model — paints 5,780 faces in about 9 ms in
 * Node (2026-09-13; 3,380 faces took 10 and 8,820 took 12, so the count is not
 * what it costs). What the count buys is a planet up close whose provinces
 * have edges rather than a camouflage of single triangles.
 */
const PLANET_DETAIL = 16;

/*
 * Sidereal time, the obliquity, the precession and the ecliptic of date were
 * private to this file until the night sky needed the same four; they are
 * `celestial.ts`'s now, one copy for the orrery and the stars, and `verify()`
 * below is unchanged by the move.
 */

/** How big a body is drawn, in world units. Earth is exactly the planet. */
export function drawnRadius(body: Body): number {
  if (body.kind === 'star') return SUN_RADII * R;
  if (body.id === 'earth') return R;
  return R * (body.radiusKm / EARTH_RADIUS_KM) ** SIZE_POWER;
}

/** The planet and everything it carries, as a radius: Saturn's is its rings. */
const extentOf = (body: Body): number => drawnRadius(body) * (body.id === 'saturn' ? RINGS_A[1] : 1);

/**
 * The rings, innermost first, from the planets on them.
 *
 * A rule rather than a table, so a body file added to `system/bodies/` gets a
 * ring without anyone editing this file: each ring is as far out from the last
 * as the two planets on them need to clear each other by `RING_GAP`, whatever
 * longitude either happens to be at. That is also what gives the giants more
 * room than the rocky planets, which a diagram with equal spacing would not.
 */
function ringsFor(planets: readonly Body[]): Map<string, number> {
  const rings = new Map<string, number>();
  let previousRing = 0;
  let previousExtent = SUN_RADII * R;
  for (const planet of planets) {
    const extent = extentOf(planet);
    const ring = previousRing + previousExtent + extent + RING_GAP * R;
    rings.set(planet.id, ring);
    previousRing = ring;
    previousExtent = extent;
  }
  return rings;
}

/* ------------------------------------------------------------------------- *
 * Painting a planet
 * ------------------------------------------------------------------------- */

/** A stable hash of an integer to [0, 1), for the per-face mosaic. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Colour every face of a sphere from what the body says its ground is.
 *
 * **A body with a `GroundModel` is painted by it**, which is the one definition
 * of what that ground is made of — the same `at()` a player standing there
 * would be standing on. Without one (the giants and the Sun) it is bands of its
 * own look, warped by noise the way a gas giant's belts are. Every face then
 * takes the land's mosaic, a few per cent either way, so the facets read as
 * facets under the cel ramp rather than as one flat colour.
 */
function paint(body: Body, geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const sample: GroundSample = { id: '', warmth: 0, second: 0, elevation: 0 };
  const color = new THREE.Color();
  const look = body.look;
  const ground = body.ground;
  for (let v = 0; v < position.count; v += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += position.getX(v + k);
      cy += position.getY(v + k);
      cz += position.getZ(v + k);
    }
    const length = Math.hypot(cx, cy, cz) || 1;
    cx /= length;
    cy /= length;
    cz /= length;
    // The world's own convention, so a body's lat/lon mean what its file says.
    const lat = latOf(cy);
    const lon = lonOf(cx, cz);

    if (ground !== null) {
      const elevation = ground.relief(lat, lon);
      const found = ground.at(lat, lon, elevation, sample);
      color.setHex(ground.biomes[found.id]?.color ?? look.surface);
    } else {
      const warp = fbm(cx * 3.1 + 1.7, cy * 3.1 - 4.1, cz * 3.1 + 2.9, 3);
      const wave = Math.sin(lat * DEG * 9 + (warp - 0.5) * 2.6);
      color.setHex(wave > 0.45 ? look.highland : wave < -0.5 ? look.lowland : look.surface);
      // The Great Red Spot, where Jupiter's own file says it is not — it has no
      // ground model to say so — so at the latitude every photograph puts it.
      if (body.id === 'jupiter') {
        const dLon = (((lon + 40 + 540) % 360) - 180) / 13;
        const dLat = (lat + 22) / 6.5;
        if (dLon * dLon + dLat * dLat < 1) color.setHex(PALETTE.clay);
      }
    }
    color.multiplyScalar(0.95 + hash01(v) * 0.09);
    for (let k = 0; k < 3; k++) {
      colors[(v + k) * 3] = color.r;
      colors[(v + k) * 3 + 1] = color.g;
      colors[(v + k) * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * The cel ramp the planets are lit through, and it is **not** the world's.
 *
 * `createToonRamp` hands out ramps the sky's mood rewrites, and from orbit the
 * mood is `ORBIT_LOOK` — a floor of 0.03, which is right for the night side of
 * the planet you are about to land on and wrong for a menu of planets you are
 * choosing between, where a far side that goes black is a planet you cannot
 * see. Four fixed bands, the darkest at a fifth of full light, tinted cool at
 * the dark end the way `DAY_MOOD` tints its shadows.
 */
function planetRamp(): THREE.DataTexture {
  const bands = [0.2, 0.46, 0.76, 1];
  const shadowTint = [0.74, 0.84, 1];
  const lightTint = [1, 0.97, 0.91];
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((value, i) => {
    const t = i / (bands.length - 1);
    for (let c = 0; c < 3; c++) {
      const tint = shadowTint[c]! + (lightTint[c]! - shadowTint[c]!) * t;
      data[i * 4 + c] = Math.round(255 * value * tint);
    }
    data[i * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, bands.length, 1);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Lit by the Sun where the Sun is, which the world's own lights cannot do.
 *
 * The scene's sun is a *directional* light pointing the way the Sun is from
 * Earth; Mars on the far side of the Sun lit by it would show its lit face to
 * the dark. So the planets carry their own one-light toon shader with the
 * Sun's position as a uniform, and nothing else in the scene lights them.
 */
function planetMaterial(sun: { value: THREE.Vector3 }, ramp: THREE.DataTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: sun,
      uRamp: { value: ramp },
      uOpacity: { value: 1 },
      // A held globe's regions (`holdUpright`): off until one is handed in.
      uTint: { value: null },
      uTinted: { value: 0 },
      uTintRadius: { value: 0 },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        vColor = color;
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform sampler2D uRamp;
      uniform float uOpacity;
      uniform sampler2D uTint;
      uniform float uTinted;
      uniform float uTintRadius;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        float lit = dot(normalize(vNormal), normalize(uSun - vWorld)) * 0.5 + 0.5;
        vec3 band = texture2D(uRamp, vec2(lit, 0.5)).rgb;
        vec3 base = vColor;
        // The region under this pixel, read off the held globe's own frame:
        // sphere.ts's lat = asin(y) and lon = atan2(-z, x). Not on Saturn's
        // rings, which share the material and lie outside the globe.
        if (uTinted > 0.5 && length(vLocal) < uTintRadius) {
          vec3 unit = normalize(vLocal);
          float lon = atan(-unit.z, unit.x);
          float lat = asin(clamp(unit.y, -1.0, 1.0));
          vec4 region = texture2D(uTint, vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5));
          base = mix(base, region.rgb, region.a * ${REGION_TINT.toFixed(2)});
        }
        gl_FragColor = vec4(base * band, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The regions painted flat on an equirectangular canvas: each in its colour,
 * filled and stroked a texel wide in it, so two rings of one region meet with
 * no hairline of the ground between them; nobody's ground stays clear.
 */
function tintTexture(regions: readonly HeldRegion[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TINT_WIDTH;
  canvas.height = TINT_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5;
  for (const region of regions) {
    const fill = `#${region.color.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    for (const ring of region.rings) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      ring.forEach((point, k) => {
        const x = ((point[0]! + 180) / 360) * TINT_WIDTH;
        const y = ((90 - point[1]!) / 180) * TINT_HEIGHT;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // No mipmaps: the longitude wraps inside a pixel at the antimeridian, and a
  // mip chosen off that jump is a seam of the smallest level down the globe.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * The Sun: three cel bands of its own light, brightest where it faces you.
 *
 * Not lit by anything, because it is the light. The bands are a rim — the
 * limb darkening every picture of the Sun has — stepped the way the ramp steps
 * everything else, so it is a cartoon sun and not a white disc.
 */
function sunMaterial(): THREE.ShaderMaterial {
  const cream = new THREE.Color(PALETTE.cream);
  const gold = new THREE.Color(PALETTE.gold);
  const orange = new THREE.Color(PALETTE.orange);
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: cream }, uBody: { value: gold }, uLimb: { value: orange }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore;
      uniform vec3 uBody;
      uniform vec3 uLimb;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        float facing = dot(normalize(vNormal), normalize(cameraPosition - vWorld));
        vec3 c = facing > 0.72 ? uCore : facing > 0.36 ? uBody : uLimb;
        gl_FragColor = vec4(c, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * One of this file's own shader materials at an opacity.
 *
 * Transparent only while it is below one, so a body at full strength stays in
 * the opaque list it was always drawn in. `opacity` is set beside the uniform
 * because the ink reads it: `outline.ts` gives the hull the fill's opacity and
 * turns it transparent with it. Depth is still written, which is what keeps the
 * hull's inside hidden behind a fill you can half see through.
 */
function fade(material: THREE.ShaderMaterial, opacity: number): void {
  (material.uniforms['uOpacity'] as THREE.IUniform<number>).value = opacity;
  material.opacity = opacity;
  material.transparent = opacity < 1;
}

/** A soft round glow for the Sun, drawn on a canvas rather than shipped as an image. */
function glowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 236, 190, 0.95)');
  gradient.addColorStop(0.22, 'rgba(248, 166, 88, 0.55)');
  gradient.addColorStop(0.5, 'rgba(228, 120, 12, 0.16)');
  gradient.addColorStop(1, 'rgba(228, 98, 2, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------------- *
 * The rings, as ribbons of a constant width on the screen
 * ------------------------------------------------------------------------- */

/**
 * A circle of `radius` in the ecliptic plane, as a camera-facing ribbon.
 *
 * `THREE.Line` is one device pixel and cannot be anything else, which on a
 * high-density screen is a hairline you have to look for; a ribbon of fixed
 * *world* width is a hairline at one end of the system and a motorway at the
 * other. So the buffer holds the circle and its tangent, and the vertex shader
 * steps sideways — across both the tangent and the view — by a width that
 * grows with the distance to the eye, which is the same trick as the menu's
 * country ribbon and the frontiers, one level up. Camera-facing, so it has no
 * outward normal to get wrong, and no `normal` attribute, so the ink pass
 * leaves it alone once it is told to.
 */
function ringGeometry(radius: number, segments: number): THREE.BufferGeometry {
  const position = new Float32Array((segments + 1) * 2 * 3);
  const tangent = new Float32Array((segments + 1) * 2 * 3);
  const side = new Float32Array((segments + 1) * 2);
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let k = 0; k < 2; k++) {
      const at = i * 2 + k;
      position.set([c * radius, s * radius, 0], at * 3);
      tangent.set([-s, c, 0], at * 3);
      side[at] = k === 0 ? -1 : 1;
    }
    if (i < segments) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geometry.setIndex(index);
  return geometry;
}

interface RingUniforms {
  uColor: { value: THREE.Color };
  uAlpha: { value: number };
  uWidth: { value: number };
}

function ringMaterial(): THREE.ShaderMaterial & { uniforms: RingUniforms } {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.cream) },
      uAlpha: { value: 0.3 },
      uWidth: { value: 0.001 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTangent;
      attribute float aSide;
      uniform float uWidth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 tangent = normalize(mat3(modelMatrix) * aTangent);
        vec3 view = world.xyz - cameraPosition;
        float range = length(view);
        vec3 across = normalize(cross(tangent, view / range));
        world.xyz += across * aSide * uWidth * range;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      void main() {
        gl_FragColor = vec4(uColor, uAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // A camera-facing strip has no front, so both sides — and in one pass,
    // which since r163 a transparent double-sided material is not by default.
    forceSinglePass: true,
  });
  material.userData.outlineParameters = { visible: false };
  return material as THREE.ShaderMaterial & { uniforms: RingUniforms };
}

/* ------------------------------------------------------------------------- *
 * The orrery
 * ------------------------------------------------------------------------- */

export interface OrreryBody {
  body: Body;
  /** Drawn radius, world units. Earth's is `PLANET_RADIUS`. */
  radius: number;
  /** Its ring about the Sun, world units; 0 for the Sun. */
  ring: number;
  /** Counted out from the Sun: Mercury 1, Earth 3. 0 for the Sun; a moon has its planet's. */
  order: number;
  /** Where its centre is in world space, as of the last `update`. */
  position: THREE.Vector3;
  /**
   * How much of it is drawn after the last `update`, 0 to 1: everything but
   * the body the camera is near steps back as it nears one (see the header).
   * Earth's is always 1, since Earth is the world and not this file's mesh.
   */
  opacity: number;
}

export interface Orrery {
  /** Added to the world's scene by the caller, removed by `dispose`. */
  group: THREE.Group;
  /** The Sun first, then outward. Earth is one of them and has no mesh here. */
  bodies: readonly OrreryBody[];
  sun: OrreryBody;
  earth: OrreryBody;
  /** Ecliptic north in world space, which is the system's natural up. */
  north: THREE.Vector3;
  /**
   * The ecliptic of date in world space — the equinox, longitude 90 and the
   * pole — live, rewritten by every `update`. A camera orbiting the system
   * orbits in the plane of the first two.
   */
  axes: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };
  /**
   * The outermost ring plus its planet: how far from the Sun the system
   * reaches, which is what a far plane has to. The stars are further, and
   * need none: `night-sky.ts` draws them at infinity.
   */
  extent: number;
  /**
   * Place everything for this instant and this camera. `time` is the sky's own
   * clock, so the Sun here and the light on the land cannot drift apart.
   */
  update(time: Date, camera: THREE.PerspectiveCamera, screenHeight: number, dt: number): void;
  /** Gold on one ring, or none. */
  highlight(id: string | null): void;
  /**
   * The body the camera has been sent to, which never fades as the camera
   * nears Earth; `null` when it is Earth or nothing. See the header.
   */
  focus(id: string | null): void;
  /**
   * Hold one body still and upright for a globe stage to be played on it:
   * its pole on the world's +Y and its longitude 0 on +X, so a latitude and a
   * longitude round its centre (`onSphere`) are on its drawn surface where
   * its own file says — the same frame Earth's land is in. Its spin stops,
   * the rest of the system steps back as the camera nears it, as it does for
   * Earth, and with `regions` its globe is redrawn finer and tinted by them,
   * per pixel, off a flat map of their rings. `null` lets it go.
   */
  holdUpright(id: string | null, regions?: readonly HeldRegion[]): void;
  /**
   * A body drawn by somebody else from here on — a walked world's own ground
   * (`worlds/menu-globe.ts`): its painted ball goes (Saturn keeps its rings),
   * and it stands still and upright in the world's frame, as Earth's land
   * does, so holding it for its globe stage turns nothing.
   */
  cover(id: string): void;
  /**
   * The handedness witness: the angle between the Sun this file placed and the
   * sun `sun.ts` lights the world by. See the header.
   */
  verify(sunDirection: THREE.Vector3): Record<string, number | boolean>;
  dispose(): void;
}

export function createOrrery(): Orrery {
  const group = new THREE.Group();
  group.name = 'orrery';
  // The ecliptic frame, placed by hand each frame: a rotation built from three
  // basis vectors and the Sun's position. Nothing below it moves but the spins.
  group.matrixAutoUpdate = false;

  const planets = BODIES.filter((body) => body.orbit !== null);
  const star = BODIES.find((body) => body.kind === 'star');
  if (star === undefined) throw new Error('orrery: the registry has no star');
  const rings = ringsFor(planets);

  const sunUniform = { value: new THREE.Vector3() };
  const ramp = planetRamp();
  const disposables: { dispose(): void }[] = [ramp];

  /* --- the Sun ---------------------------------------------------------- */

  const sunGeometry = new THREE.IcosahedronGeometry(SUN_RADII * R, PLANET_DETAIL);
  sunGeometry.computeVertexNormals();
  const sunMat = sunMaterial();
  const sunMesh = new THREE.Mesh(sunGeometry, sunMat);
  sunMesh.name = 'orrery-sun';
  // A thicker pen than a planet's: it is the one object that has to read from
  // the far side of the system.
  sunMat.userData.outlineParameters = { thickness: 0.004 };
  group.add(sunMesh);
  const glowMap = glowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowMap,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  glowMaterial.userData.outlineParameters = { visible: false };
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.setScalar(SUN_RADII * R * 5.2);
  glow.renderOrder = 910;
  group.add(glow);
  disposables.push(sunGeometry, sunMat, glowMap, glowMaterial);

  /* --- the planets ------------------------------------------------------ */

  interface Built {
    entry: OrreryBody;
    /** The planet a moon circles, whose position its ring is centred on; `null` for a planet. */
    around: Built | null;
    /** The everyday painted geometry, put back when a held globe is let go. */
    coarse: THREE.BufferGeometry | null;
    /** The body's local position in the ecliptic frame, updated from the orbit. */
    local: THREE.Vector3;
    pivot: THREE.Object3D | null;
    mesh: THREE.Mesh | null;
    /**
     * Its own material, so it can fade on its own: the same shader for every
     * planet, so still one program. `null` for Earth, which has no mesh here.
     */
    material: THREE.ShaderMaterial | null;
    spin: number;
    ring: THREE.Mesh;
    ringMaterial: THREE.ShaderMaterial & { uniforms: RingUniforms };
    /** Drawn by somebody else, still and upright: see `cover`. */
    covered?: boolean;
  }

  /**
   * A turn every twenty seconds for a day as long as Earth's, slower for a
   * longer one and never so slow it looks stopped. Seen from the menu a real
   * rate is either invisible or a blur; the sign is the real one.
   */
  function spinOf(body: Body): number {
    const hours = Math.abs(body.rotationHours) || 24;
    return Math.sign(body.rotationHours || 1) * ((Math.PI * 2) / 20) * Math.min(2.5, Math.max(0.25, (24 / hours) ** 0.35));
  }

  /**
   * A body's painted globe on its pivot, added to the system: one geodesic
   * sphere, its own material so it can fade on its own, and Saturn's rings.
   */
  function globeOf(body: Body, radius: number): { pivot: THREE.Object3D; mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
    const material = planetMaterial(sunUniform, ramp);
    disposables.push(material);
    const geometry = new THREE.IcosahedronGeometry(radius, PLANET_DETAIL);
    paint(body, geometry);
    // Non-indexed, so this is one normal per face: facets for the ramp to
    // step across, the way the land is built.
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `orrery-${body.id}`;
    disposables.push(geometry);
    if (body.id === 'saturn') {
      for (const [inner, outer] of [RINGS_B, RINGS_A]) {
        const thick = radius * 0.035;
        const profile = [
          new THREE.Vector2(radius * inner, -thick),
          new THREE.Vector2(radius * outer, -thick),
          new THREE.Vector2(radius * outer, thick),
          new THREE.Vector2(radius * inner, thick),
          new THREE.Vector2(radius * inner, -thick),
        ];
        const lathe = new THREE.LatheGeometry(profile, 96).toNonIndexed();
        lathe.computeVertexNormals();
        const tone = new THREE.Color(inner === RINGS_B[0] ? PALETTE.sand : PALETTE.tan);
        const shades = new Float32Array(lathe.getAttribute('position').count * 3);
        for (let v = 0; v < shades.length; v += 3) shades.set([tone.r, tone.g, tone.b], v);
        lathe.setAttribute('color', new THREE.BufferAttribute(shades, 3));
        mesh.add(new THREE.Mesh(lathe, material));
        disposables.push(lathe);
      }
    }
    // The geometry's pole is +Y, which is how `onSphere` builds a globe; in
    // the ecliptic frame the pole is +Z. A quarter turn about X carries one
    // to the other, and the obliquity on top of it leans the pole over —
    // past a right angle for Uranus and nearly upside down for Venus, which
    // is what those two numbers mean.
    const pivot = new THREE.Object3D();
    pivot.rotation.x = (90 + body.tiltDeg) * DEG;
    pivot.add(mesh);
    group.add(pivot);
    return { pivot, mesh, material };
  }

  const sunEntry: OrreryBody = { body: star, radius: SUN_RADII * R, ring: 0, order: 0, position: new THREE.Vector3(), opacity: 1 };
  const built: Built[] = [];
  planets.forEach((body, i) => {
    const radius = drawnRadius(body);
    const ringRadius = rings.get(body.id)!;
    const entry: OrreryBody = { body, radius, ring: ringRadius, order: i + 1, position: new THREE.Vector3(), opacity: 1 };

    let pivot: THREE.Object3D | null = null;
    let mesh: THREE.Mesh | null = null;
    let material: THREE.ShaderMaterial | null = null;
    if (body.id !== 'earth') ({ pivot, mesh, material } = globeOf(body, radius));

    const ringMat = ringMaterial();
    const ring = new THREE.Mesh(ringGeometry(ringRadius, 360), ringMat);
    ring.name = `orrery-ring-${body.id}`;
    ring.frustumCulled = false;
    ring.renderOrder = 905;
    group.add(ring);
    disposables.push(ring.geometry, ringMat);

    built.push({ entry, local: new THREE.Vector3(), pivot, mesh, material, spin: spinOf(body), ring, ringMaterial: ringMat, around: null, coarse: mesh?.geometry ?? null });
  });

  const earthBuilt = built.find((b) => b.entry.body.id === 'earth');
  if (earthBuilt === undefined) throw new Error('orrery: the registry has no Earth');
  const earth = earthBuilt.entry;
  earth.opacity = 1;

  /* --- the Moon --------------------------------------------------------- */

  // Earth's, on a little ring of its own round Earth (`MOON_RADII`), in the
  // direction the real Moon is today. Listed right after Earth, so the dock
  // shows it beside the planet it belongs to.
  const moonBody = MOONS.find((one) => one.id === 'moon');
  if (moonBody !== undefined) {
    const radius = drawnRadius(moonBody);
    const { pivot, mesh, material } = globeOf(moonBody, radius);
    const ringMat = ringMaterial();
    const ring = new THREE.Mesh(ringGeometry(MOON_RADII * R, 180), ringMat);
    ring.name = `orrery-ring-${moonBody.id}`;
    ring.frustumCulled = false;
    ring.renderOrder = 905;
    group.add(ring);
    disposables.push(ring.geometry, ringMat);
    const entry: OrreryBody = { body: moonBody, radius, ring: MOON_RADII * R, order: earth.order, position: new THREE.Vector3(), opacity: 1 };
    built.push({
      entry, local: new THREE.Vector3(), pivot, mesh, material, spin: spinOf(moonBody), ring, ringMaterial: ringMat,
      around: earthBuilt, coarse: mesh.geometry,
    });
  }
  /** The planets alone, the Sun's rings, outermost last. */
  const planetsBuilt = built.filter((b) => b.around === null);

  /*
   * The stars were a field of 1,400 hashed points on a shell 220 radii round
   * the Sun until 2026-09-30, in the right frame and at invented places. The
   * sky behind the orrery is now the real one: `night-sky.ts`'s catalogue,
   * which the world's scene already holds and draws at infinity, so it is
   * right from any camera the menu flies and never passes in front of a planet.
   */

  /* --- placing it ------------------------------------------------------- */

  const ex = new THREE.Vector3();
  const ey = new THREE.Vector3();
  const ez = new THREE.Vector3();
  const north = new THREE.Vector3();
  const sunWorld = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  let highlighted: string | null = null;
  let focused: string | null = null;
  /** The body held upright for a globe stage, and its finer painted globes by id. */
  let held: Built | null = null;
  const heldTurn = new THREE.Quaternion();
  /** The world's axes in the ecliptic group's frame, this frame: where a covered body's pivot stands. */
  const upright = new THREE.Quaternion();
  /** What a covered body's ball is drawn with: nothing. */
  const nothing = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) nothing.setAttribute(name, new THREE.Float32BufferAttribute([], 3));
  disposables.push(nothing);
  /** Where the held body's pivot and spin were when it was taken, and how far it has turned upright, 0 to 1. */
  const holdFrom = new THREE.Quaternion();
  let holdSpin = 0;
  let holdK = 1;
  const heldGlobes = new Map<string, THREE.BufferGeometry>();
  /** The held globe's region map, painted on holding it and let go with it. */
  let heldTint: THREE.CanvasTexture | null = null;
  /** Switch a body's material's region tint on or off. */
  const setTint = (b: Built, texture: THREE.CanvasTexture | null): void => {
    if (b.material === null) return;
    const uniforms = b.material.uniforms;
    uniforms['uTint']!.value = texture;
    uniforms['uTinted']!.value = texture === null ? 0 : 1;
    uniforms['uTintRadius']!.value = b.entry.radius * 1.2;
  };
  const gold = new THREE.Color(PALETTE.gold);
  const cream = new THREE.Color(PALETTE.cream);

  /** Where every planet is on its ring now, in the ecliptic frame. */
  function layOut(time: Date): void {
    const t = centuriesSince2000(time);
    for (const b of planetsBuilt) {
      const h = heliocentric(b.entry.body.orbit!, time);
      const angle = (h.lon + PRECESSION * t) * DEG;
      b.local.set(Math.cos(angle) * b.entry.ring, Math.sin(angle) * b.entry.ring, 0);
      b.pivot?.position.copy(b.local);
    }
    // The Moon's ecliptic longitude and latitude (lambda, beta) are already of
    // date, so no precession; the frame is the ecliptic's, not `sphere.ts`'s.
    for (const b of built) {
      if (b.around === null) continue;
      const lunar = moonPosition(time);
      const lambda = lunar.lon * DEG;
      const beta = lunar.lat * DEG;
      b.local
        .set(Math.cos(beta) * Math.cos(lambda), Math.cos(beta) * Math.sin(lambda), Math.sin(beta))
        .multiplyScalar(b.entry.ring)
        .add(b.around.local);
      b.pivot?.position.copy(b.local);
      b.ring.position.copy(b.around.local);
    }
  }

  function place(time: Date): void {
    layOut(time);
    eclipticBasis(time, ex, ey, ez);
    // Earth sits on its ring at the origin of the world, so the Sun is the
    // origin minus Earth's own offset along the ring, turned into the world.
    const e = earthBuilt!.local;
    sunWorld.set(0, 0, 0).addScaledVector(ex, -e.x).addScaledVector(ey, -e.y);
    basis.makeBasis(ex, ey, ez).setPosition(sunWorld);
    group.matrix.copy(basis);
    group.matrixWorldNeedsUpdate = true;
    north.copy(ez);
    sunUniform.value.copy(sunWorld);
    sunEntry.position.copy(sunWorld);
    for (const b of built) b.entry.position.copy(b.local).applyMatrix4(basis);
    // Earth to the float, rather than to a rounding error of the sum above.
    earth.position.set(0, 0, 0);
  }

  const api: Orrery = {
    group,
    bodies: [sunEntry, ...planetsBuilt.flatMap((p) => [p, ...built.filter((b) => b.around === p)]).map((b) => b.entry)],
    sun: sunEntry,
    earth,
    north,
    axes: { x: ex, y: ey, z: ez },
    extent: (() => {
      const outer = planetsBuilt[planetsBuilt.length - 1]!;
      return outer.entry.ring + extentOf(outer.entry.body);
    })(),
    update(time, camera, screenHeight, dt) {
      place(time);
      if (basis.determinant() <= 0) {
        // A reflection here is the mirror this project has shipped three times,
        // and it would render: the rings would go the other way round and the
        // Sun would sit in the wrong half of the sky. Say so rather than draw it.
        console.warn('orrery: the ecliptic basis is a reflection', basis.determinant());
      }
      upright.setFromRotationMatrix(basis).invert();
      for (const b of built) {
        if (b.covered === true) {
          b.pivot!.quaternion.copy(upright);
          b.mesh!.rotation.set(0, 0, 0);
        } else if (b.mesh !== null && b !== held) b.mesh.rotation.y += b.spin * dt;
      }
      if (held?.pivot != null && held.covered !== true) {
        // Upright in the world: the group's own turn undone under it, so the
        // pivot's frame is the world's axes and the mesh's is the body's.
        // Turned there over `HOLD_SECONDS` rather than snapped, since it is
        // usually on the screen, and the flight down to it hides the rest.
        heldTurn.setFromRotationMatrix(basis).invert();
        holdK = Math.min(1, holdK + dt / HOLD_SECONDS);
        const k = holdK * holdK * (3 - 2 * holdK);
        held.pivot.quaternion.slerpQuaternions(holdFrom, heldTurn, k);
        held.mesh!.rotation.set(0, holdSpin * (1 - k), 0);
      }
      // Pixels to world units per unit of range, for a ribbon two pixels wide
      // and three when it is the one being pointed at.
      const perRange = (2 * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, screenHeight);
      // Near Earth the rings are in the way — Earth's own passes through the
      // middle of the planet — so they go as the globe fills the frame, and
      // every body but the one the camera was sent to goes with them. A body
      // held up for its globe stage is Earth for this: the same span, in its
      // own radii.
      const anchor = held?.entry ?? earth;
      const nearEarth = THREE.MathUtils.smoothstep(
        camera.position.distanceTo(anchor.position),
        NEAR_EARTH[0] * anchor.radius,
        NEAR_EARTH[1] * anchor.radius,
      );
      for (const b of built) {
        const hot = b.entry.body.id === highlighted;
        b.ringMaterial.uniforms.uWidth.value = perRange * (hot ? 1.6 : 1);
        b.ringMaterial.uniforms.uColor.value.copy(hot ? gold : cream);
        b.ringMaterial.uniforms.uAlpha.value = (hot ? 0.95 : 0.26) * nearEarth;
        b.ring.visible = nearEarth > 0.01;
        if (b.material === null || b.pivot === null) continue;
        const opacity = b.entry.body.id === focused || b === held ? 1 : nearEarth;
        b.entry.opacity = opacity;
        fade(b.material, opacity);
        b.pivot.visible = opacity > 0.01;
      }
      const sunOpacity = star.id === focused ? 1 : nearEarth;
      sunEntry.opacity = sunOpacity;
      fade(sunMat, sunOpacity);
      glowMaterial.opacity = sunOpacity;
      sunMesh.visible = glow.visible = sunOpacity > 0.01;
    },
    highlight(id) {
      highlighted = id;
    },
    focus(id) {
      focused = id;
    },
    holdUpright(id, regions) {
      const next = id === null ? null : built.find((b) => b.entry.body.id === id && b.mesh !== null) ?? null;
      if (held !== null && held !== next && held.covered !== true) {
        // Let go: the everyday globe back, leaning and turning again.
        held.mesh!.geometry = held.coarse!;
        held.pivot!.quaternion.identity();
        held.pivot!.rotation.x = (90 + held.entry.body.tiltDeg) * DEG;
        setTint(held, null);
      }
      if (heldTint !== null) {
        heldTint.dispose();
        heldTint = null;
      }
      if (next !== null && next !== held) {
        holdFrom.copy(next.pivot!.quaternion);
        // The spin to undo, the short way round.
        const turn = next.mesh!.rotation.y % (Math.PI * 2);
        holdSpin = turn > Math.PI ? turn - Math.PI * 2 : turn < -Math.PI ? turn + Math.PI * 2 : turn;
        holdK = 0;
      }
      held = next;
      if (held === null) return;
      if (held.covered === true) {
        // Already still and upright, and drawn by its own ground.
        holdK = 1;
        return;
      }
      if (regions === undefined) {
        held.mesh!.geometry = held.coarse!;
        setTint(held, null);
        return;
      }
      let fine = heldGlobes.get(held.entry.body.id);
      if (fine === undefined) {
        fine = new THREE.IcosahedronGeometry(held.entry.radius, HELD_DETAIL);
        paint(held.entry.body, fine);
        fine.computeVertexNormals();
        heldGlobes.set(held.entry.body.id, fine);
        disposables.push(fine);
      }
      held.mesh!.geometry = fine;
      if (regions.length === 0) {
        setTint(held, null);
        return;
      }
      heldTint = tintTexture(regions);
      setTint(held, heldTint);
    },
    cover(id) {
      const b = built.find((one) => one.entry.body.id === id && one.mesh !== null);
      if (b === undefined || b.covered === true) return;
      b.covered = true;
      b.mesh!.geometry = nothing;
      if (held === b) setTint(b, null);
    },
    verify(sunDirection) {
      const placed = sunWorld.clone().normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, placed.dot(sunDirection)))) / DEG;
      const handed = new THREE.Vector3().crossVectors(ex, ey).dot(ez);
      return {
        'sun here vs sun.ts, degrees': Number(angle.toFixed(3)),
        'ecliptic x . y': Number(ex.dot(ey).toFixed(6)),
        '(x cross y) . z': Number(handed.toFixed(6)),
        'basis determinant': Number(basis.determinant().toFixed(6)),
        // The Sun lies in the ecliptic by definition, so its distance from the
        // plane is the whole error of the frame in one number.
        'sun . ecliptic pole': Number(sunDirection.dot(ez).toFixed(5)),
        agrees: angle < 0.5 && handed > 0.999,
      };
    },
    dispose() {
      group.removeFromParent();
      heldTint?.dispose();
      for (const item of disposables) item.dispose();
    },
  };
  return api;
}
