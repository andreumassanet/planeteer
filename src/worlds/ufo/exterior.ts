/** The saucer's outside: the lens of hull, the dome's glass, the legs, the lamps that chase round the band and the beam. */

import * as THREE from 'three';
import type { SceneryContext } from '../../scenery/contract.ts';
import { PALETTE } from '../../theme.ts';
import { merged } from '../craft/draw.ts';
import type { UfoLivery } from '../ufo.ts';
import { BAND_Y, BELLY, DECK_Y, DISC, DOME_HEIGHT, DOME_RADIUS, H, LAMPS, LEGS, LOWER, UFO_GLASS_OPACITY, UPPER } from './dimensions.ts';

/** The glow's colours, brightened past 1 as the afterburner's are, so they read as light in the toon's ramp. */
export const bright = (color: number, gain: number): THREE.Color => new THREE.Color(color).multiplyScalar(gain);

/** The lens, belly to collar: two slopes under the band and two over it, each a tone of the hull's colour, so the pen draws four rings and the sun steps down them. */
export function addHull(ctx: SceneryContext, hull: THREE.Group, livery: UfoLivery): void {
  const sides = 24;
  const wall = livery.wall;
  // The lens, belly to collar: two slopes under the band and two over it,
  // each a tone of the hull's colour, so the pen draws four rings and the
  // sun steps down them.
  const belly = ctx.taper(0.8 * H, 1.45 * H, BELLY, ctx.tone(wall, 0.72), sides);
  belly.position.y = LEGS;
  hull.add(belly);
  const lower = ctx.taper(1.45 * H, DISC, LOWER - BELLY, ctx.tone(wall, 0.88), sides);
  lower.position.y = LEGS + BELLY;
  hull.add(lower);
  const upper = ctx.taper(DISC, 1.6 * H, UPPER * 0.55, wall, sides);
  upper.position.y = BAND_Y;
  hull.add(upper);
  const crown = ctx.taper(1.6 * H, 1.08 * H, UPPER * 0.45, ctx.tone(wall, 1.12), sides);
  crown.position.y = BAND_Y + UPPER * 0.55;
  hull.add(crown);
  // The band round the rim, proud of both hulls, in the accent: what the
  // lamps ride on, and the line a saucer is drawn by.
  const band = ctx.ringWall(DISC * 0.96, DISC * 1.05, 0.12 * H, livery.accent, sides);
  band.position.y = BAND_Y - 0.06 * H;
  hull.add(band);
  // A ring of vents round the belly, in the collar's colour.
  const vents = ctx.ringWall(0.62 * H, 0.82 * H, 0.06 * H, ctx.tone(livery.roof, 0.9), 16);
  vents.position.y = LEGS - 0.06 * H;
  hull.add(vents);
  // The collar the dome sits in.
  const collar = ctx.ringWall(DOME_RADIUS * 0.97, DOME_RADIUS * 1.1, 0.1 * H, ctx.tone(livery.roof, 1.15), sides);
  collar.position.y = DECK_Y;
  hull.add(collar);
}

/** The dome: the far shell, then the near, tinted and writing depth, no ink. */
export function addDome(group: THREE.Group, gradientMap: THREE.Texture): void {
  const domeGeometry = new THREE.SphereGeometry(DOME_RADIUS, 24, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, DOME_HEIGHT / DOME_RADIUS, 1);
  const glass = (side: THREE.Side, order: number): THREE.Mesh => {
    const shell = side === THREE.BackSide ? domeGeometry : domeGeometry.clone();
    const material = new THREE.MeshToonMaterial({ color: PALETTE.skyBlue, gradientMap, transparent: true, opacity: UFO_GLASS_OPACITY, depthWrite: true, side });
    material.userData.outlineParameters = { visible: false };
    // Faint for the eye under it (`faintGlass`), as a car's windscreen is.
    material.userData.atlasFaint = true;
    const mesh = new THREE.Mesh(shell, material);
    mesh.position.y = DECK_Y + 0.02 * H;
    mesh.renderOrder = order;
    return mesh;
  };
  const far = glass(THREE.BackSide, 1);
  far.name = 'ufo glass';
  const near = glass(THREE.FrontSide, 2);
  near.name = 'ufo glass';
  group.add(far, near);
}

/** The legs, under a pivot at the belly so they fold up into it. */
export function addGear(ctx: SceneryContext, group: THREE.Group, gradientMap: THREE.Texture, livery: UfoLivery): THREE.Group {
  const gear = new THREE.Group();
  gear.position.y = LEGS;
  const legs = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k / 4) * Math.PI * 2;
    const hip = new THREE.Vector3(Math.sin(a) * 0.95 * H, 0.04 * H, Math.cos(a) * 0.95 * H);
    const toe = new THREE.Vector3(Math.sin(a) * 1.4 * H, -LEGS + 0.06 * H, Math.cos(a) * 1.4 * H);
    legs.add(ctx.strut(hip, toe, 0.08 * H, ctx.tone(livery.roof, 1.1)));
    const pad = ctx.column(0.17 * H, 0.06 * H, ctx.tone(livery.roof, 0.85), 6);
    pad.position.set(toe.x, -LEGS, toe.z);
    legs.add(pad);
  }
  const legMesh = merged(legs, gradientMap);
  legMesh.castShadow = true;
  gear.add(legMesh);
  gear.name = 'gear';
  group.add(gear);
  return gear;
}

/** The lamps round the band: one instanced mesh, a colour each. Returns what repaints them. */
export function addLamps(group: THREE.Group, livery: UfoLivery): (phase: number, chase: number) => void {
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  lampMaterial.userData.outlineParameters = { visible: false };
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075 * H, 8, 5), lampMaterial, LAMPS);
  lamps.name = 'ufo lamps';
  const place = new THREE.Matrix4();
  for (let k = 0; k < LAMPS; k++) {
    const a = (k / LAMPS) * Math.PI * 2;
    // A translation only: the determinant is 1 and no hull is mirrored.
    place.makeTranslation(Math.sin(a) * (DISC * 1.05 + 0.03 * H), BAND_Y, Math.cos(a) * (DISC * 1.05 + 0.03 * H));
    lamps.setMatrixAt(k, place);
  }
  group.add(lamps);
  const lit = bright(PALETTE.gold, 1.7);
  const resting = bright(livery.accent, 0.55);
  const lampColor = new THREE.Color();
  const paint = (phase: number, chase: number): void => {
    for (let k = 0; k < LAMPS; k++) {
      // Every fourth lamp lit, the lit ones running round the band.
      const wave = 0.5 + 0.5 * Math.cos((k / LAMPS) * Math.PI * 2 * 4 - phase);
      const on = chase * Math.pow(wave, 6);
      lampColor.copy(resting).lerp(lit, Math.min(1, on));
      lamps.setColorAt(k, lampColor);
    }
    if (lamps.instanceColor !== null) lamps.instanceColor.needsUpdate = true;
  };
  paint(0, 0.6);
  return paint;
}

/** The beam: an open cone of light from the belly to the ground, additive and writing no depth, a unit long, stretched to the ground each frame. */
export function addBeam(group: THREE.Group): { beam: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: bright(PALETTE.skyBlue, 1).lerp(new THREE.Color(PALETTE.white), 0.45),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  beamMaterial.userData.outlineParameters = { visible: false };
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0), beamMaterial);
  beam.name = 'ufo beam';
  beam.position.y = LEGS - 0.08 * H;
  beam.renderOrder = 10;
  beam.visible = false;
  group.add(beam);
  return { beam, material: beamMaterial };
}
