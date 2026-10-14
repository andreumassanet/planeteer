/** The scene objects the sky owns: the dome, the sun and moon lights, and the two discs. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { DAY_MOOD } from '../theme.ts';
import { castSunShadow } from './shadow.ts';
import { DISC_RADIUS, MARIA } from './discs.ts';
import { skyFragment, skyVertex } from './sky-shaders.ts';

export const WHITE = new THREE.Color(0xffffff);

/** The sky dome and the uniforms its shader reads. */
export function createDome(scene: THREE.Scene) {
  const uniforms = {
    top: { value: new THREE.Color(DAY_MOOD.skyTop) },
    horizon: { value: new THREE.Color(DAY_MOOD.skyHorizon) },
    glowColor: { value: new THREE.Color(DAY_MOOD.skyGlow) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    upDir: { value: new THREE.Vector3(0, 1, 0) },
    glow: { value: 0 },
    milky: { value: 0 },
    galactic: { value: new THREE.Matrix3() },
    space: { value: 0 },
    dip: { value: 0 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  });
  skyMaterial.userData.outlineParameters = { visible: false };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS * 6, 32, 16), skyMaterial);
  // Opaque geometry fills depth first: shade only the sky that remains visible.
  // The vertex shader pins depth to the far plane, including behind both discs.
  dome.renderOrder = 1000;
  dome.name = 'sky';
  scene.add(dome);
  return { uniforms };
}

/** The fill lights, the sun (which casts the shadow) and the moon. */
export function createLights(scene: THREE.Scene) {
  // Deliberately little ambient: with flat light the `gradientMap` has no range
  // to step across and the cel shading vanishes. The step needs shadow.
  const ambient = new THREE.AmbientLight(DAY_MOOD.ambient, DAY_MOOD.ambientIntensity);
  const hemisphere = new THREE.HemisphereLight(
    DAY_MOOD.hemisphereSky,
    DAY_MOOD.hemisphereGround,
    DAY_MOOD.hemisphereIntensity,
  );
  // A `HemisphereLight` takes its up axis from its own position, and the default
  // is world Y, the north pole. Pointing it at the local up makes sky light
  // arrive from above everywhere.
  hemisphere.position.set(0, 1, 0);

  // Colour and intensity come from the mood (see `Mood.sun` for why a fixed star
  // is allowed to dim). The direction is always the real one.
  const sun = new THREE.DirectionalLight(DAY_MOOD.sun, DAY_MOOD.sunIntensity);
  const moon = new THREE.DirectionalLight(DAY_MOOD.moon, 0);
  scene.add(ambient, hemisphere, sun, sun.target, moon, moon.target);

  // The sun casts and the moon does not: one shadow pass, one map. `castShadow`
  // stays true whatever the fade says, because toggling it changes the light
  // count every toon material was compiled against and recompiles the world; a
  // faded shadow is `intensity = 0`, which the shader mixes away.
  castSunShadow(sun);
  return { ambient, hemisphere, sun, moon };
}

/** The sun and moon discs, drawn at `SKY_DISTANCE` and carried with the camera. */
export function createDiscs(scene: THREE.Scene) {
  // No fade in or out on either disc: they set behind the planet like anything
  // else in the sky, because they are out there and the depth buffer knows it.
  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f0e4, fog: false });
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(DISC_RADIUS, 20, 14), moonMaterial);
  moonDisc.name = 'moon';
  const mareMaterial = new THREE.MeshBasicMaterial({ color: 0xc9c4bd, fog: false });
  for (const [x, y, radius] of MARIA) {
    const mare = new THREE.Mesh(new THREE.CircleGeometry(DISC_RADIUS * radius, 14), mareMaterial);
    mare.position.set(DISC_RADIUS * x, DISC_RADIUS * y, DISC_RADIUS * 1.002);
    moonDisc.add(mare);
  }
  scene.add(moonDisc);

  // The sun gets a disc too, so the object everything is lit by can be looked at.
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6e2, fog: false });
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(DISC_RADIUS, 20, 14), sunMaterial);
  sunDisc.name = 'sun';
  scene.add(sunDisc);
  return { moonDisc, moonMaterial, mareMaterial, sunDisc, sunMaterial };
}
