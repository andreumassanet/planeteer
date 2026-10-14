/** The engine's vehicles built in code: used until the kit's models arrive, and for a planet's own. */

import * as THREE from 'three';
import type { VehicleKind, VehicleModel } from '../contract.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import { balloonModel } from '../../craft/balloon.ts';
import type { CraftModel } from '../../craft/contract.ts';
import { HERO } from '../../craft/body.ts';
import { PALETTE } from '../../theme.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { dome } from '../architecture.ts';
import { buildUfo } from '../ufo.ts';
import type { UfoLivery } from '../ufo.ts';
import { AT_THE_WHEEL, driverPlace, glassDome } from './driver.ts';
import { STAND_EYE_OVER_HIP, seatedEye } from './kit-model.ts';
import type { Model } from './types.ts';

/** A planet's model as the engine's: its seated eye from its hip unless it says otherwise, and how it is driven. */
export function modelOf(made: VehicleModel): Model {
  const seat = new THREE.Vector3(made.seat.x, made.seat.y, made.seat.z);
  const stand = made.stand === true;
  const eye = made.eye !== undefined ? new THREE.Vector3(made.eye.x, made.eye.y, made.eye.z) : stand ? seat.clone().setY(seat.y + STAND_EYE_OVER_HIP) : seatedEye(seat);
  return { group: made.group, seat, radius: made.radius, closed: false, gear: null, flames: [], stand, eye, ...(made.pose === undefined ? {} : { pose: made.pose }) };
}

/**
 * The rover in code, until the kit's arrives: an open cab on six wheels, the
 * driver at a wheel (`driverPlace`) under a roll bar that clears the crown.
 */
export function rover(ctx: SceneryContext): Model {
  const H = AVATAR_HEIGHT;
  const g = new THREE.Group();
  const body = ctx.box(3.4, 0.9, 5.2, PALETTE.white);
  body.position.y = 1.15;
  g.add(body);
  const deckY = 2.05;
  const deck = ctx.box(3.0, 0.25, 2.2, PALETTE.steel);
  deck.position.set(0, deckY, -1.2);
  g.add(deck);
  // The nose small and forward, clear of the driver's toes.
  const nose = ctx.taper(0.7, 0.5, 0.5, PALETTE.gold, 4);
  nose.position.set(0, deckY, 2.2);
  g.add(nose);
  for (const x of [-1.95, 1.95]) {
    for (const z of [-1.8, 0, 1.8]) {
      const wheel = ctx.column(0.8, 0.55, PALETTE.bark, 10);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x + (x > 0 ? -0.27 : 0.27), 0.8, z);
      g.add(wheel);
      const hub = ctx.column(0.32, 0.6, PALETTE.gold, 6);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x + (x > 0 ? -0.3 : 0.3), 0.8, z);
      g.add(hub);
    }
  }
  // The driver on the left (+X), the soles on the deck, the legs to the pedals.
  const hip = new THREE.Vector3(0.6, deckY + 0.02 * H + HERO.drive.sole, -0.8);
  g.add(driverPlace(hip, deckY, PALETTE.crimson));
  // The mast, the dish and a roll bar over the seat, a hand over the crown.
  const mast = ctx.column(0.12, 2.4, PALETTE.steel, 6);
  mast.position.set(-1.2, deckY, -2.4);
  g.add(mast);
  const dish = dome(ctx, 0.7, PALETTE.white, 0.35, 10);
  dish.rotation.x = Math.PI * 0.7;
  dish.position.set(-1.2, 4.6, -2.4);
  g.add(dish);
  const bar = hip.y + HERO.crown + 0.1 * H;
  for (const x of [-1.3, 1.3]) g.add(ctx.strut(new THREE.Vector3(x, deckY, -1.7), new THREE.Vector3(x * 0.8, bar, -2.0), 0.2, PALETTE.crimson));
  g.add(ctx.strut(new THREE.Vector3(-1.05, bar, -2.0), new THREE.Vector3(1.05, bar, -2.0), 0.2, PALETTE.crimson));
  return { group: g, seat: hip, radius: 3.2, closed: false, gear: null, flames: [], eye: seatedEye(hip), pose: AT_THE_WHEEL };
}

/**
 * The lander in code, until the kit's ship arrives: a capsule on four legs,
 * the pilot on its deck at a yoke (`driverPlace`) under a glass dome tall
 * enough for a seated crown and a hand over it.
 */
function lander(ctx: SceneryContext): Model {
  const H = AVATAR_HEIGHT;
  const g = new THREE.Group();
  const lift = 2.6;
  const body = ctx.taper(2.9, 2.1, 2.4, PALETTE.white, 8);
  body.position.y = lift;
  g.add(body);
  const band = ctx.ringWall(2.6, 3.0, 0.5, PALETTE.orange, 16);
  band.position.y = lift + 0.4;
  g.add(band);
  const engine = ctx.taper(1.1, 1.6, 1.0, PALETTE.steel, 8);
  engine.rotation.x = Math.PI;
  engine.position.y = lift;
  g.add(engine);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const hip = new THREE.Vector3(Math.cos(a) * 2.2, lift + 0.4, Math.sin(a) * 2.2);
    const foot = new THREE.Vector3(Math.cos(a) * 3.6, 0.2, Math.sin(a) * 3.6);
    g.add(ctx.strut(hip, foot, 0.28, PALETTE.steel));
    const pad = ctx.column(0.6, 0.25, PALETTE.bark, 8);
    pad.position.copy(foot).setY(0);
    g.add(pad);
  }
  const deck = lift + 2.4;
  // The hip a little behind the middle, so the toes (`HERO.drive.toe`) stay inside the dome.
  const hip = new THREE.Vector3(0, deck + 0.02 * H + HERO.drive.sole, -0.6);
  g.add(driverPlace(hip, deck, PALETTE.crimson));
  const collar = ctx.ringWall(2.0, 2.25, 0.25, PALETTE.steel, 16);
  collar.position.y = deck;
  g.add(collar);
  g.add(glassDome(ctx, 2.1, hip.y + HERO.crown + 0.15 * H - deck, deck));
  return { group: g, seat: hip, radius: 3.8, closed: false, gear: null, flames: [], eye: seatedEye(hip), pose: AT_THE_WHEEL };
}

/**
 * The aerostat is Earth's balloon (`craft/balloon.ts`): the woven basket, the
 * gored envelope and the burner on its frame, in one of Earth's schemes
 * (`variant`); the pilot stands at the burner as on Earth.
 */
let earthBalloon: CraftModel | null = null;
export function aerostat(_ctx: SceneryContext, variant = 5): Model {
  earthBalloon ??= balloonModel();
  const seat = earthBalloon.seats[0]!;
  const radius = Math.max(earthBalloon.size[0], earthBalloon.size[1]) / 2;
  const hip = new THREE.Vector3(seat.x, seat.y, seat.z);
  return { group: earthBalloon.build(variant), seat: hip, radius, closed: false, gear: null, flames: [], stand: true, eye: hip.clone().setY(hip.y + STAND_EYE_OVER_HIP) };
}

/**
 * The saucer as the engine's model (`ufo.ts`), in `livery` or its own
 * colours. Its legs are its own to fold (`animate`), so it hands no `gear`.
 */
function ufo(ctx: SceneryContext, gradientMap: THREE.Texture, livery?: UfoLivery): Model {
  const made = buildUfo(ctx, gradientMap, livery);
  return { group: made.group, seat: made.seat, radius: made.radius, closed: false, gear: null, flames: [], eye: made.eye, pose: made.pose, animate: made.animate, drawn: true };
}

export const MODELS: Record<VehicleKind, (ctx: SceneryContext, gradientMap: THREE.Texture, livery?: UfoLivery) => Model> = {
  rover,
  lander,
  aerostat: (ctx) => aerostat(ctx),
  ufo,
};
export const NAMES: Record<VehicleKind, string> = { rover: 'the rover', lander: 'the lander', aerostat: 'the aerostat', ufo: 'the saucer' };
