/** The sky's objects, made once: dome, stars, sun, planets, moons, the world's layers and the lights. */

import * as THREE from 'three';
import type { SkyLayer, SkyMoon, WorldSpec } from '../contract.ts';
import { linearOf } from '../terrain.ts';
import { poleOf, surfaceRadiusOf } from '../../system/contract.ts';
import { ELEMENTS, periodOf } from '../../system/orbits.ts';
import { rngFrom } from '../../scenery/random.ts';
import { lonOf } from '../../sphere.ts';
import { NIGHT_MOOD, PALETTE } from '../../theme.ts';
import { castSunShadow } from '../../sun.ts';
import { DOME_FRAGMENT, DOME_VERTEX, haloSprite, litDisc } from './shaders.ts';
import type { Disc } from './shaders.ts';
import type { MoonView, SkyState } from '../sky.ts';

export const DEG = Math.PI / 180;
const STARS = 1800;
/** Earth's mean radius, km, for its disc in the Moon's sky. */
const EARTH_RADIUS_KM = 6371;

/** A moon (or Earth, from the Moon) as a lit disc. */
export interface Satellite {
  name: string;
  radiusKm: number;
  disc: Disc;
  /** Its centre from the planet's, km, body-fixed: written each frame. */
  at: THREE.Vector3;
  moon: SkyMoon | null;
}

/** Everything a sky is made of, and the little state it carries between frames. */
export interface SkyParts {
  spec: WorldSpec;
  scene: THREE.Scene;
  overcast: boolean;
  locked: boolean;
  /** A solar day, hours: the turn against the Sun's. A locked world's clock moves the date a twenty-fourth of it for each hour of its local time. */
  solarDay: number;
  /** The walkable radius, units. */
  radius: number;
  group: THREE.Group;
  /** The inertial frame, rotated as the body turns. */
  celestial: THREE.Group;
  dome: THREE.Mesh;
  uniforms: {
    uUp: { value: THREE.Vector3 };
    uSun: { value: THREE.Vector3 };
    uDay: { value: number };
  };
  horizon: THREE.Color;
  haze: THREE.Color;
  starGeometry: THREE.BufferGeometry;
  starMaterial: THREE.PointsMaterial;
  sunDisc: THREE.Mesh;
  halo: THREE.Sprite;
  /** The other planets' ids, and the points that show them. */
  others: string[];
  planetPositions: Float32Array;
  planetGeometry: THREE.BufferGeometry;
  planetMaterial: THREE.PointsMaterial;
  satellites: Satellite[];
  views: MoonView[];
  layers: readonly SkyLayer[];
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  state: SkyState;
  /** The inertial frame onto the body's: its pole onto +y, by the shortest turn. */
  align: THREE.Quaternion;
  /** The planet's equinox longitude in the aligned frame, radians: where the moons' angles start. */
  equinox: number;
  spin: THREE.Quaternion;
  /** The clock's offset, hours: the spin's on a turning world, the date's on a locked one. */
  offset: number;
  /** The body's turn, radians, as of the last placement. */
  turn: number;
  /** When the sky's clock last advanced the layers, ms, and how long it has run, s. */
  lastMs: number;
  elapsed: number;
  /** When the planets were last moved, ms of the sky's clock. */
  planetsAt: number;
}

function createDome(spec: WorldSpec, group: THREE.Group): { dome: THREE.Mesh; uniforms: SkyParts['uniforms']; horizon: THREE.Color } {
  const sky = spec.sky;
  const overcast = sky.overcast;
  const horizon = new THREE.Color().fromArray(linearOf(sky.horizon));
  const zenith = new THREE.Color().fromArray(linearOf(sky.zenith));
  // The night: black in vacuum, a trace of blue under air, the deck's own
  // murk under an overcast.
  const space = overcast
    ? horizon.clone().multiplyScalar(0.04)
    : new THREE.Color(0.006, 0.008, 0.02).multiplyScalar(Math.min(1, sky.air * 2.5));
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uHorizon: { value: horizon.clone() },
    uZenith: { value: zenith.clone().multiplyScalar(0.8) },
    uSpace: { value: space },
    uGlow: { value: new THREE.Color().fromArray(linearOf(PALETTE.cream)) },
    uDay: { value: 1 },
    uAir: { value: sky.air },
    uOvercast: { value: overcast ? 1 : 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  dome.name = 'world-dome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);
  return { dome, uniforms, horizon };
}

/** The stars: fixed in the inertial frame, so they wheel with the sun. With no air between them and the eye they are sharper and brighter. */
function createStars(spec: WorldSpec, celestial: THREE.Group): { starGeometry: THREE.BufferGeometry; starMaterial: THREE.PointsMaterial } {
  const sky = spec.sky;
  const airless = sky.air < 0.05;
  const rng = rngFrom('worlds', 'stars');
  const starPositions = new Float32Array(STARS * 3);
  const starColors = new Float32Array(STARS * 3);
  for (let k = 0; k < STARS; k++) {
    const z = rng.range(-1, 1);
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    starPositions.set([r * Math.cos(a) * 0.98, z * 0.98, r * Math.sin(a) * 0.98], k * 3);
    const b = Math.min(1, (Math.pow(rng.unit(), 3) * 0.9 + 0.1) * (airless ? 1.35 : 1));
    const warm = rng.range(-0.15, 0.15);
    starColors.set([b * (1 + warm), b, b * (1 - warm)], k * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMaterial = new THREE.PointsMaterial({
    size: airless ? 2 : 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  stars.visible = !sky.overcast;
  celestial.add(stars);
  return { starGeometry, starMaterial };
}

/** The planets, as points. From the Moon, Earth is a disc of its own (the satellites). */
function createPlanets(spec: WorldSpec, celestial: THREE.Group): { others: string[]; planetPositions: Float32Array; planetGeometry: THREE.BufferGeometry; planetMaterial: THREE.PointsMaterial } {
  const others = Object.keys(ELEMENTS).filter((id) => id !== spec.body.orbit);
  const planetPositions = new Float32Array(others.length * 3);
  const planetColors = new Float32Array(others.length * 3);
  const planetGeometry = new THREE.BufferGeometry();
  planetGeometry.setAttribute('position', new THREE.BufferAttribute(planetPositions, 3));
  planetGeometry.setAttribute('color', new THREE.BufferAttribute(planetColors, 3));
  const planetMaterial = new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const planets = new THREE.Points(planetGeometry, planetMaterial);
  planets.frustumCulled = false;
  planets.renderOrder = -9;
  planets.visible = !spec.sky.overcast;
  celestial.add(planets);
  // The colours never change: laid once.
  others.forEach((id, k) => {
    const tint = id === 'earth' ? linearOf(PALETTE.skyBlue) : id === 'mars' ? linearOf(PALETTE.salmon) : linearOf(PALETTE.cream);
    planetColors[k * 3] = tint[0] * 1.6;
    planetColors[k * 3 + 1] = tint[1] * 1.6;
    planetColors[k * 3 + 2] = tint[2] * 1.6;
  });
  planetGeometry.getAttribute('color').needsUpdate = true;
  return { others, planetPositions, planetGeometry, planetMaterial };
}

/** The moons, and Earth over the Moon: lit discs in the body-fixed frame. */
function createSatellites(spec: WorldSpec, group: THREE.Group): { satellites: Satellite[]; views: MoonView[] } {
  const body = spec.body;
  const satellites: Satellite[] = spec.sky.moons.map((moon) => ({
    name: moon.name,
    radiusKm: moon.radiusKm,
    disc: litDisc(moon.color, 1.15),
    at: new THREE.Vector3(),
    moon,
  }));
  if (body.kind === 'moon' && body.orbit === 'earth') {
    satellites.push({ name: 'Earth', radiusKm: EARTH_RADIUS_KM, disc: litDisc(PALETTE.skyBlue, 1.6), at: new THREE.Vector3(), moon: null });
  }
  for (const one of satellites) {
    one.disc.mesh.name = `sky:${one.name}`;
    one.disc.mesh.visible = !spec.sky.overcast;
    group.add(one.disc.mesh);
  }
  const views: MoonView[] = satellites.map((one) => ({ name: one.name, direction: new THREE.Vector3(), radiusDeg: 0, lit: 0 }));
  return { satellites, views };
}

export function buildSkyParts(spec: WorldSpec, scene: THREE.Scene): SkyParts {
  const body = spec.body;
  const sky = spec.sky;
  const overcast = sky.overcast;
  const group = new THREE.Group();
  group.name = 'world-sky';
  const celestial = new THREE.Group();
  group.add(celestial);

  const { dome, uniforms, horizon } = createDome(spec, group);
  const { starGeometry, starMaterial } = createStars(spec, celestial);

  // The sun: a disc and a halo, on the dome.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.8), fog: false, depthWrite: false, transparent: true }),
  );
  sunDisc.renderOrder = -8;
  sunDisc.frustumCulled = false;
  const halo = haloSprite();
  sunDisc.visible = !overcast;
  halo.visible = !overcast;
  celestial.add(sunDisc, halo);

  const planets = createPlanets(spec, celestial);
  const { satellites, views } = createSatellites(spec, group);

  // The world's own layers.
  const radius = surfaceRadiusOf(body.radiusKm);
  const layers = sky.layers.map((make) => make(radius));
  for (const layer of layers) group.add(layer.object);

  // The light.
  const lightColor = new THREE.Color().fromArray(linearOf(sky.light));
  const sun = new THREE.DirectionalLight(lightColor, 2.6);
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  const hemisphere = new THREE.HemisphereLight(horizon.clone(), new THREE.Color().fromArray(linearOf(spec.palette.base)), 0.4);
  // Earth's moon (`sun.ts`): a lantern hung opposite the sun, offset west so
  // it cross-lights the ground, always full and always up at midnight; a
  // night with nothing to see by is not a night anybody can walk in.
  const moon = new THREE.DirectionalLight(NIGHT_MOOD.moon, 0);
  scene.add(sun, sun.target, moon, moon.target, ambient, hemisphere);
  // Earth's shadow, cast the same way (`castSunShadow`).
  castSunShadow(sun);

  const Y = new THREE.Vector3(0, 1, 0);
  const pole = poleOf(body);
  const P = new THREE.Vector3(pole.x, pole.y, pole.z).normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(P, Y);
  // The planet's equinox, where the Sun crosses its equator going north: the
  // line its equator and the ecliptic share, which the shortest turn leaves
  // where it is.
  const node = new THREE.Vector3().crossVectors(P, Y);
  if (node.lengthSq() < 1e-12) node.set(1, 0, 0);
  node.normalize();
  const locked = body.locked === true;

  return {
    spec,
    scene,
    overcast,
    locked,
    solarDay: Math.abs(1 / (1 / body.rotationHours - 1 / (periodOf(body.orbit ?? 'earth') * 24))),
    radius,
    group,
    celestial,
    dome,
    uniforms,
    horizon,
    haze: horizon.clone(),
    starGeometry,
    starMaterial,
    sunDisc,
    halo,
    ...planets,
    satellites,
    views,
    layers,
    sun,
    ambient,
    hemisphere,
    moon,
    state: { sun: new THREE.Vector3(0, 1, 0), day: 1, elevation: 1, hour: 12, au: 1, shade: 1 },
    align,
    equinox: lonOf(node.x, node.z) * DEG,
    spin: new THREE.Quaternion(),
    offset: 0,
    turn: 0,
    lastMs: Number.NaN,
    elapsed: 0,
    planetsAt: Number.NaN,
  };
}
