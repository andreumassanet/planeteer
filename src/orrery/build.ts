/** Building the bodies: the Sun, every planet with its globe and ring, and the Moon. */
import * as THREE from 'three';
import { type Body, MOONS } from '../system/index.ts';
import { PALETTE } from '../theme.ts';
import { DEG, MOON_RADII, PLANET_DETAIL, R, RINGS_A, RINGS_B, SUN_RADII } from './constants.ts';
import type { Built } from './ctx.ts';
import { drawnRadius } from './layout.ts';
import { glowTexture, planetMaterial, ringGeometry, ringMaterial, sunMaterial } from './materials.ts';
import { paint } from './paint.ts';
import type { OrreryBody } from './types.ts';

/** What the bodies are built from. */
export interface Scaffold {
  group: THREE.Group;
  star: Body;
  planets: readonly Body[];
  rings: Map<string, number>;
  sunUniform: { value: THREE.Vector3 };
  ramp: THREE.DataTexture;
  disposables: { dispose(): void }[];
}

/** The Sun: a banded sphere with a thicker pen than a planet's, and an additive glow. */
export function createSun({ group, star, disposables }: Scaffold) {
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
  const sunEntry: OrreryBody = { body: star, radius: SUN_RADII * R, ring: 0, order: 0, position: new THREE.Vector3(), opacity: 1 };
  return { sunMat, sunMesh, glow, glowMaterial, sunEntry };
}

/** A body's ring about the Sun (or the planet it circles): a camera-facing strip, added to the system. */
function addRing({ group, disposables }: Scaffold, id: string, radius: number, segments: number): { ring: THREE.Mesh; ringMat: ReturnType<typeof ringMaterial> } {
  const ringMat = ringMaterial();
  const ring = new THREE.Mesh(ringGeometry(radius, segments), ringMat);
  ring.name = `orrery-ring-${id}`;
  ring.frustumCulled = false;
  ring.renderOrder = 905;
  group.add(ring);
  disposables.push(ring.geometry, ringMat);
  return { ring, ringMat };
}

/** A turn every twenty seconds for a day as long as Earth's, slower for a longer one and never so slow it looks stopped. The sign is the real one. */
function spinOf(body: Body): number {
  const hours = Math.abs(body.rotationHours) || 24;
  return Math.sign(body.rotationHours || 1) * ((Math.PI * 2) / 20) * Math.min(2.5, Math.max(0.25, (24 / hours) ** 0.35));
}

/**
 * A body's painted globe on its pivot, added to the system: one geodesic
 * sphere, its own material so it can fade on its own, and Saturn's rings.
 */
function globeOf({ group, sunUniform, ramp, disposables }: Scaffold, body: Body, radius: number): { pivot: THREE.Object3D; mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
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

/** Every planet, with its globe (Earth has none here) and its ring. */
export function buildPlanets(sc: Scaffold): Built[] {
  const built: Built[] = [];
  sc.planets.forEach((body, i) => {
    const radius = drawnRadius(body);
    const ringRadius = sc.rings.get(body.id)!;
    const entry: OrreryBody = { body, radius, ring: ringRadius, order: i + 1, position: new THREE.Vector3(), opacity: 1 };

    let pivot: THREE.Object3D | null = null;
    let mesh: THREE.Mesh | null = null;
    let material: THREE.ShaderMaterial | null = null;
    if (body.id !== 'earth') ({ pivot, mesh, material } = globeOf(sc, body, radius));

    const { ring, ringMat } = addRing(sc, body.id, ringRadius, 360);
    built.push({ entry, local: new THREE.Vector3(), pivot, mesh, material, spin: spinOf(body), ring, ringMaterial: ringMat, around: null, coarse: mesh?.geometry ?? null });
  });
  return built;
}

/**
 * Earth's Moon, on a little ring of its own round Earth (`MOON_RADII`), in the
 * direction the real Moon is today. Listed right after Earth, so the dock shows
 * it beside the planet it belongs to.
 */
export function addMoon(sc: Scaffold, built: Built[], earthBuilt: Built): void {
  const moonBody = MOONS.find((one) => one.id === 'moon');
  if (moonBody === undefined) return;
  const radius = drawnRadius(moonBody);
  const { pivot, mesh, material } = globeOf(sc, moonBody, radius);
  const { ring, ringMat } = addRing(sc, moonBody.id, MOON_RADII * R, 180);
  const entry: OrreryBody = { body: moonBody, radius, ring: MOON_RADII * R, order: earthBuilt.entry.order, position: new THREE.Vector3(), opacity: 1 };
  built.push({
    entry, local: new THREE.Vector3(), pivot, mesh, material, spin: spinOf(moonBody), ring, ringMaterial: ringMat,
    around: earthBuilt, coarse: mesh.geometry,
  });
}
