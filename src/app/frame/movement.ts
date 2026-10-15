/**
 * The frame's first phase: the camera aims, `E` acts, the player moves
 * relative to that aim, and only then does the camera chase the result (or
 * a rocket's launch drives the camera instead).
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../../globe.ts';
import { seaHull } from '../../ocean.ts';
import { SUB_DRY } from '../../craft/submarine.ts';
import { clearSight } from '../../see-through.ts';
import type { App } from '../context.ts';
import type { Tick } from './tick.ts';

/** Height over the ground, units, below which the drawn land is kept gathered round the player (useless at cruise). */
const PROBE_CEILING = 1500;

export function createMovement(app: App): (tick: Tick) => void {
  const { rig, input, player, launchPads, talk, fleet, landProbe, groundAt, sea, conversation, gestures, rockets } = app;
  const { audio } = app.sound;
  /**
   * The ground the camera is kept over: the sea floor while under the surface,
   * and a town's floor where it stands over the land, which the see-through
   * town material would otherwise open onto the land under it.
   */
  const cameraGroundAt = (point: THREE.Vector3): number => {
    const ground = groundAt(point);
    if (player.depth <= 0.3 || ground > PLANET_RADIUS + 0.5) return Math.max(ground, app.settlements.madeHeightAt(point));
    return sea.floorAt(point);
  };

  /** `E`: go on talking, start talking, stand, sit, board a rocket, or take or leave a vehicle. */
  function use(inRocket: boolean): void {
    if (inRocket) rockets.leave();
    else if (talk.open) {
      talk.next();
      audio.cue(talk.open ? 'ui-click' : 'ui-close');
    } else if (conversation.offer !== null) conversation.start(conversation.offer);
    else if (player.sitting) player.stand();
    else if (gestures.benchOffer !== null) gestures.sitDown(gestures.benchOffer);
    else if (rockets.offer !== null) rockets.board(rockets.offer);
    else fleet.use();
  }

  /** Keeps the sea out of the submarine the player is in, along its cabin's lining. */
  function sealHull(): void {
    const ride = player.ride;
    const cabin = ride?.model.kind === 'submarine' ? player.object.getObjectByName('cabin') : undefined;
    if (ride !== null && cabin?.parent != null) {
      // In the frame the hull is built in, which the springs carry.
      const frame = cabin.parent;
      frame.updateWorldMatrix(true, false);
      const front = ride.model.seats[0]!.z;
      SUB_DRY.stations.forEach(([z, r], i) => {
        seaHull.uHull.value[i]!.set(0, SUB_DRY.y, front + z).applyMatrix4(frame.matrixWorld);
        seaHull.uHullR.value.setComponent(i, r);
      });
    } else seaHull.uHullR.value.set(0, 0, 0, 0);
  }

  return ({ dt }) => {
    // In a rocket the camera is the launch's: no aim, no walk.
    const inRocket = launchPads.riding;
    if (inRocket === null) rig.aim(dt, input.state, player);
    if (input.state.use) use(inRocket !== null);
    if (player.position.length() - groundAt(player.position) < PROBE_CEILING) landProbe.prepare(player.position);
    if (launchPads.riding === null) {
      player.update(dt, {
        move: input.state.move,
        run: input.state.run,
        jump: input.state.jump,
        heading: rig.steer,
      });
      sealHull();
      rig.follow(dt, player, cameraGroundAt);
    } else {
      launchPads.frame(rig.camera, dt);
      clearSight();
    }
    input.endFrame();
  };
}
