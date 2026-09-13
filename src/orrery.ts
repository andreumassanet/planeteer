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
 * and nothing that `sun.ts` uses. So `verify()` has a real witness: the Sun
 * placed by this file and the sun `sun.ts` lights the land with were computed
 * by different routes, from NOAA's solar formulas on one side and Kepler plus
 * sidereal time on the other, and they have to point the same way. A mirror or
 * a swapped axis anywhere in this chain puts the Sun in the wrong half of the
 * sky, which is the class of bug this project has shipped three times.
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
 * Eight meshes, a sprite, a point field and eight thin ribbons: the planets are
 * geodesic spheres of 5,780 faces each, painted once from their own
 * `GroundModel` where they have one (so Mars shows Syrtis Major where Syrtis
 * Major is) and from latitude bands where they do not. They are drawn by the
 * same `outline.render` as everything else, so they carry the same pen.
 */

import * as THREE from 'three';
import { PLANET_RADIUS, onSphere } from './globe.ts';
import { fbm } from './terrain.ts';
import { PALETTE } from './theme.ts';
import { BODIES, EARTH_RADIUS_KM, centuriesSince2000, heliocentric, julianDay } from './system/index.ts';
import type { Body, GroundSample } from './system/index.ts';

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
 * Where the stars are, in Earth radii from the Sun. Past everything the camera
 * can reach, so they parallax a little as it orbits and never pass in front
 * of a planet.
 */
const STAR_SHELL = 220;
const STAR_COUNT = 1400;

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

/**
 * The general precession in longitude, degrees per Julian century.
 *
 * Standish's elements are in the J2000 ecliptic and the frame built from
 * sidereal time is the ecliptic of *date*; between them the equinox has slid
 * 0.36 degrees since 2000. Adding it is one term, and leaving it out would be
 * a third of a degree of disagreement in `verify()` for no reason at all.
 */
const PRECESSION = 1.396971;

/**
 * Greenwich mean sidereal time, in degrees: how far the Earth-fixed frame has
 * turned under the stars. The IAU 1982 expression, good to a tenth of a
 * second of time, which is 0.0004 degrees.
 */
function siderealDegrees(date: Date): number {
  const d = julianDay(date) - 2451545;
  const t = d / 36525;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t;
  return g - 360 * Math.floor(g / 360);
}

/** The mean obliquity of the ecliptic, degrees. */
const obliquity = (t: number): number => 23.439291 - 0.0130042 * t;

/**
 * The ecliptic of date as three world-space unit vectors.
 *
 * A direction on the celestial sphere at right ascension `a` and declination
 * `d` is, in this Earth-fixed world, the point on the unit sphere at longitude
 * `a - GMST` and latitude `d` — that is what sidereal time *means* — and
 * `onSphere` is the one conversion from a longitude and a latitude to a
 * vector, so this goes through it rather than past it. The three are:
 * the equinox (RA 0, Dec 0), ecliptic longitude 90 (RA 90, Dec +e), and the
 * ecliptic pole (RA 270, Dec 90 - e). In the celestial frame those are
 * `(1,0,0)`, `(0, cos e, sin e)` and `(0, -sin e, cos e)`, a right-handed
 * triple; `onSphere` maps the celestial frame to this one by a rotation, so it
 * stays right-handed — and `update` asserts the determinant anyway.
 */
function eclipticBasis(date: Date, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): void {
  const g = siderealDegrees(date);
  const e = obliquity(centuriesSince2000(date));
  onSphere(0 - g, 0, x);
  onSphere(90 - g, e, y);
  onSphere(270 - g, 90 - e, z);
}

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
    const lat = Math.asin(Math.max(-1, Math.min(1, cy))) / DEG;
    const lon = Math.atan2(-cz, cx) / DEG;

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
    uniforms: { uSun: sun, uRamp: { value: ramp } },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vColor = color;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform sampler2D uRamp;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        float lit = dot(normalize(vNormal), normalize(uSun - vWorld)) * 0.5 + 0.5;
        vec3 band = texture2D(uRamp, vec2(lit, 0.5)).rgb;
        gl_FragColor = vec4(vColor * band, 1.0);
        #include <colorspace_fragment>
      }`,
  });
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
    uniforms: { uCore: { value: cream }, uBody: { value: gold }, uLimb: { value: orange } },
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
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        float facing = dot(normalize(vNormal), normalize(cameraPosition - vWorld));
        vec3 c = facing > 0.72 ? uCore : facing > 0.36 ? uBody : uLimb;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** A soft round glow for the Sun, drawn on a canvas because there are no files. */
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
  /** Counted out from the Sun: Mercury 1, Earth 3. 0 for the Sun. */
  order: number;
  /** Where its centre is in world space, as of the last `update`. */
  position: THREE.Vector3;
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
  /** The outermost ring plus its planet: how far from the Sun the system reaches. */
  extent: number;
  /** The radius of the star field about the Sun: what a far plane has to reach. */
  starShell: number;
  /**
   * Place everything for this instant and this camera. `time` is the sky's own
   * clock, so the Sun here and the light on the land cannot drift apart.
   */
  update(time: Date, camera: THREE.PerspectiveCamera, screenHeight: number, dt: number): void;
  /** Gold on one ring, or none. */
  highlight(id: string | null): void;
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
  const material = planetMaterial(sunUniform, ramp);
  const disposables: { dispose(): void }[] = [ramp, material];

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
    /** The body's local position in the ecliptic frame, updated from the orbit. */
    local: THREE.Vector3;
    pivot: THREE.Object3D | null;
    mesh: THREE.Mesh | null;
    spin: number;
    ring: THREE.Mesh;
    ringMaterial: THREE.ShaderMaterial & { uniforms: RingUniforms };
  }

  const sunEntry: OrreryBody = { body: star, radius: SUN_RADII * R, ring: 0, order: 0, position: new THREE.Vector3() };
  const built: Built[] = [];
  planets.forEach((body, i) => {
    const radius = drawnRadius(body);
    const ringRadius = rings.get(body.id)!;
    const entry: OrreryBody = { body, radius, ring: ringRadius, order: i + 1, position: new THREE.Vector3() };

    let pivot: THREE.Object3D | null = null;
    let mesh: THREE.Mesh | null = null;
    if (body.id !== 'earth') {
      const geometry = new THREE.IcosahedronGeometry(radius, PLANET_DETAIL);
      paint(body, geometry);
      // Non-indexed, so this is one normal per face: facets for the ramp to
      // step across, the way the land is built.
      geometry.computeVertexNormals();
      mesh = new THREE.Mesh(geometry, material);
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
      pivot = new THREE.Object3D();
      pivot.rotation.x = (90 + body.tiltDeg) * DEG;
      pivot.add(mesh);
      group.add(pivot);
    }

    const ringMat = ringMaterial();
    const ring = new THREE.Mesh(ringGeometry(ringRadius, 360), ringMat);
    ring.name = `orrery-ring-${body.id}`;
    ring.frustumCulled = false;
    ring.renderOrder = 905;
    group.add(ring);
    disposables.push(ring.geometry, ringMat);

    // A turn every twenty seconds for a day as long as Earth's, slower for a
    // longer one and never so slow it looks stopped. Seen from the menu a real
    // rate is either invisible or a blur; the sign is the real one.
    const hours = Math.abs(body.rotationHours) || 24;
    const spin = Math.sign(body.rotationHours || 1) * ((Math.PI * 2) / 20) * Math.min(2.5, Math.max(0.25, (24 / hours) ** 0.35));

    built.push({ entry, local: new THREE.Vector3(), pivot, mesh, spin, ring, ringMaterial: ringMat });
  });

  const earthBuilt = built.find((b) => b.entry.body.id === 'earth');
  if (earthBuilt === undefined) throw new Error('orrery: the registry has no Earth');
  const earth = earthBuilt.entry;

  /* --- the stars -------------------------------------------------------- */

  const stars = new Float32Array(STAR_COUNT * 3);
  const starSizes = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform on the sphere, from a hash rather than Math.random, so the same
    // sky comes back on every visit.
    const u = hash01(i * 2 + 1) * 2 - 1;
    const phi = hash01(i * 2 + 2) * Math.PI * 2;
    const across = Math.sqrt(1 - u * u);
    stars.set([across * Math.cos(phi) * STAR_SHELL * R, across * Math.sin(phi) * STAR_SHELL * R, u * STAR_SHELL * R], i * 3);
    starSizes[i] = 1.2 + hash01(i * 7 + 3) ** 3 * 2.6;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  const starScale = { value: 1 };
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: { uScale: starScale },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uScale;
      varying float vBright;
      void main() {
        vBright = clamp(aSize / 3.8, 0.35, 1.0);
        gl_PointSize = aSize * uScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vBright;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.9) * vBright, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
  });
  starMaterial.userData.outlineParameters = { visible: false };
  const starField = new THREE.Points(starGeometry, starMaterial);
  starField.name = 'orrery-stars';
  starField.frustumCulled = false;
  group.add(starField);
  disposables.push(starGeometry, starMaterial);

  /* --- placing it ------------------------------------------------------- */

  const ex = new THREE.Vector3();
  const ey = new THREE.Vector3();
  const ez = new THREE.Vector3();
  const north = new THREE.Vector3();
  const sunWorld = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  let highlighted: string | null = null;
  const gold = new THREE.Color(PALETTE.gold);
  const cream = new THREE.Color(PALETTE.cream);

  /** Where every planet is on its ring now, in the ecliptic frame. */
  function layOut(time: Date): void {
    const t = centuriesSince2000(time);
    for (const b of built) {
      const h = heliocentric(b.entry.body.orbit!, time);
      const angle = (h.lon + PRECESSION * t) * DEG;
      b.local.set(Math.cos(angle) * b.entry.ring, Math.sin(angle) * b.entry.ring, 0);
      b.pivot?.position.copy(b.local);
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
    bodies: [sunEntry, ...built.map((b) => b.entry)],
    sun: sunEntry,
    earth,
    north,
    axes: { x: ex, y: ey, z: ez },
    starShell: STAR_SHELL * R,
    extent: (() => {
      const outer = built[built.length - 1]!;
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
      for (const b of built) {
        if (b.mesh !== null) b.mesh.rotation.y += b.spin * dt;
      }
      // Pixels to world units per unit of range, for a ribbon two pixels wide
      // and three when it is the one being pointed at.
      const perRange = (2 * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, screenHeight);
      // Near Earth the rings are in the way — Earth's own passes through the
      // middle of the planet — so they go as the globe fills the frame.
      const nearEarth = THREE.MathUtils.smoothstep(camera.position.length(), 5 * R, 10 * R);
      for (const b of built) {
        const hot = b.entry.body.id === highlighted;
        b.ringMaterial.uniforms.uWidth.value = perRange * (hot ? 1.6 : 1);
        b.ringMaterial.uniforms.uColor.value.copy(hot ? gold : cream);
        b.ringMaterial.uniforms.uAlpha.value = (hot ? 0.95 : 0.26) * nearEarth;
        b.ring.visible = nearEarth > 0.01;
      }
      starScale.value = Math.min(2, globalThis.devicePixelRatio || 1);
    },
    highlight(id) {
      highlighted = id;
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
      for (const item of disposables) item.dispose();
    },
  };
  return api;
}
