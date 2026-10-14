/**
 * The grass under your feet: a knee-high carpet of single blades round the
 * camera, in clumps, bent by the wind and parted by the player.
 *
 * No blade is stored anywhere. Each ring of blades is one draw of an
 * instanced strip with no per-instance buffer: the vertex stage takes a
 * blade's root from `gl_InstanceID` on a square grid laid round the camera,
 * snapped to the grid's own spacing so a blade stays where it grew as the
 * camera moves, and every property it has is a hash of its cell. So a ring
 * costs its vertex invocations and nothing else, and every client sees the
 * same grass. Blades past a ring's radius and off the screen are collapsed
 * before anything else is worked out. The rings overlap on purpose: the
 * finest is dense and short-lived, each coarser one sparser, wider and facing
 * the camera more, so the carpet thins with distance without a seam.
 *
 * Where the ground is and what grows on it is a field baked round the camera
 * (`Field`): the drawn land's height and whether, how thick, in what colour
 * and how dry the grass is there, from `vegetation.ts`'s `GrassGround`. Two
 * fields: a fine one round the player, so a verge stops at a kerb and a lawn
 * at its path, and a coarse one to the last ring. Each is a torus in texel
 * indices, so following the camera costs the row or column it enters; a line
 * is baked over as many frames as it takes, inside the frame's building
 * allowance (`mayBuild`), and put on the screen only whole.
 *
 * On a sphere, in a tangent frame. The blades are worked out in the tangent
 * plane of an anchor near the camera, in the frame every tile and town uses
 * (`across`, `up`, `north`: a proper rotation), and each root is dropped onto
 * the sphere analytically, so a vertex is a few hundred units from the mesh's
 * own origin and float32 holds it to a thousandth. The anchor moves only when
 * the camera has gone `FRAME_REACH` from it; a second layer is baked round the
 * new anchor and the two cross-fade (`APPEAR_SECONDS`).
 *
 * The vertex stage works in metres of a life-size figure (`METRE`) and
 * converts at the ground and at the end, which keeps the grass at the knee of
 * the person walking in it whatever the scale constants become.
 *
 * It has no ink (`outlineParameters.visible`): a pen round every blade is a
 * field of black hair. It takes the shadows, the fog, the ground's weather and
 * the near lamps like the land it grows on, and casts no shadow.
 *
 * The parts live in `grass/`.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { createToonRamp } from './theme.ts';
import { latOf, lonOf } from './sphere.ts';
import { detail, detailBuild } from './view.ts';
import type { Player } from './player.ts';
import type { GrassGround } from './vegetation.ts';
import { proxyOf } from './warm.ts';
import { setWind } from './wind.ts';
import { createBaker } from './grass/baker.ts';
import { createFloorWatcher } from './grass/floors.ts';
import type { Baker } from './grass/baker.ts';
import { frameAt, tangentOf } from './grass/layers.ts';
import type { Layer, Layers } from './grass/layers.ts';
import { grassMaterial, sharedUniforms } from './grass/material.ts';
import { createLayer, createRings } from './grass/rings.ts';
import {
  APPEAR_SECONDS,
  BUILD_MS,
  COARSE,
  FINE,
  FRAME_REACH,
  JUMP,
  RINGS,
  RING_REACH,
  qualityFor,
} from './grass/types.ts';
import type { Grass, GrassFrame, GrassOptions, GrassQuality, GrassStats } from './grass/types.ts';

export { GRASS_FIELDS, GRASS_SPREAD, METRE, qualityFor } from './grass/types.ts';
export type { Grass, GrassFrame, GrassOptions, GrassQuality, GrassStats } from './grass/types.ts';

/** A footprint's share of the vehicle's box: the wheels stand inside its bumpers and mirrors. */
const PRESS_SHARE = 0.85;

/**
 * What the player presses the grass apart with (`GrassFrame.press`), into
 * `out`: the feet on foot, the footprint of a vehicle on the ground with
 * whatever is under it (a car's, a horse's, a tractor's, and a plane's or a
 * helicopter's standing on its field, which the wash flattens), and nothing
 * swimming, afloat, or in a balloon's basket. Aloft is the shader's to lift:
 * it fades the press with the height over the blades.
 */
export function pressOf(player: Pick<Player, 'state' | 'ride' | 'forward'>, out: NonNullable<GrassFrame['press']>): GrassFrame['press'] {
  out.forward.copy(player.forward);
  if (player.state === 'swim') return null;
  const model = player.ride?.model;
  if (model === undefined) {
    out.length = 0;
    out.width = 0;
    return player.state === 'foot' ? out : null;
  }
  if (model.medium === 'water' || model.kind === 'balloon') return null;
  out.length = (model.size[0] / 2) * PRESS_SHARE;
  out.width = (model.size[1] / 2) * PRESS_SHARE;
  return out;
}

function emptyStats(): GrassStats {
  return {
    visible: false,
    quality: qualityFor(detail()),
    rings: 0,
    instances: 0,
    anchor: '',
    fromAnchor: 0,
    fine: `${FINE.size} x ${FINE.texel}`,
    coarse: `${COARSE.size} x ${COARSE.texel}`,
    fineReady: false,
    coarseReady: false,
    pending: 0,
    texels: 0,
    microsecondsATexel: 0,
    lastBakeMs: 0,
    lastFillMs: 0,
    anchors: 0,
  };
}

export function createGrass(ground: GrassGround | null, options: GrassOptions = {}): Grass {
  const R = options.radius ?? PLANET_RADIUS;
  const earth = options.earth ?? true;
  const group = new THREE.Group();
  group.name = 'grass';
  const shared = sharedUniforms();
  // One ramp for every ring: `theme.ts` keeps every ramp it makes, to repaint them with the mood.
  const ramp = createToonRamp(4);
  const stats = emptyStats();

  const layers: Layers = { front: createLayer('grass-a', group, R), back: createLayer('grass-b', group, R) };
  const rings = createRings(shared, ramp, R, earth, stats);
  const baker: Baker | null = ground === null ? null : createBaker(ground, R, layers, stats);
  let quality: GrassQuality | null = null;

  const eye = new THREE.Vector3();
  const eyeDirection = new THREE.Vector3();
  const lastEye = new THREE.Vector3(Infinity, Infinity, Infinity);
  const eyeFront = new THREE.Vector3();
  const eyeBack = new THREE.Vector3();
  const noteChanges = createFloorWatcher(ground, R, layers, baker);
  let lastTime = performance.now();

  function anchor(layer: Layer, direction: THREE.Vector3): void {
    if (!frameAt(direction, layer.frame)) throw new Error('grass: the tangent frame came out a reflection');
    layer.group.position.copy(layer.frame.up).multiplyScalar(R);
    layer.group.quaternion.copy(layer.frame.quaternion);
    layer.group.updateMatrixWorld(true);
    for (const field of [layer.fine, layer.coarse]) {
      field.valid = false;
      field.dirty.length = 0;
      field.window.w = 0;
    }
    baker?.dropJobOf(layer);
    layer.anchored = true;
    layer.shown = false;
    layer.appear = 0;
    layer.began = performance.now();
    stats.anchors++;
  }

  /**
   * A new anchor: where there is none, after a jump or a flight (the old one
   * goes at once), and a camera gone `FRAME_REACH` from the old on foot (it
   * stays until the new one stands, and the two cross-fade).
   */
  function reanchor(jumped: boolean): void {
    const { front, back } = layers;
    const direction = eyeDirection.copy(eye).normalize();
    tangentOf(front.frame, eye, eyeFront);
    const fromAnchor = Math.hypot(eyeFront.x, eyeFront.z);
    if (!front.anchored || jumped || !(fromAnchor < FRAME_REACH * 2)) {
      anchor(front, direction);
      front.group.visible = false;
      back.anchored = false;
      back.group.visible = false;
      back.shown = false;
      back.appear = 0;
      baker?.dropJobOf(back);
      tangentOf(front.frame, eye, eyeFront);
    }
    stats.fromAnchor = Math.round(Math.hypot(eyeFront.x, eyeFront.z));
    if (!back.anchored && stats.fromAnchor > FRAME_REACH) anchor(back, direction);
    if (back.anchored) tangentOf(back.frame, eye, eyeBack);
    else eyeBack.copy(eyeFront);
  }

  /** A layer is drawn once its fine field stands; one laid round a new anchor takes over once both of its do. */
  function showAndSwap(): void {
    if (!layers.front.shown && layers.front.fine.valid) {
      layers.front.shown = true;
      layers.front.group.visible = true;
    }
    if (layers.back.anchored && layers.back.fine.valid && layers.back.coarse.valid) {
      const old = layers.front;
      layers.front = layers.back;
      layers.back = old;
      layers.front.shown = true;
      layers.front.group.visible = true;
      // The old one keeps drawing while it goes, and is no longer anchored.
      layers.back.anchored = false;
      layers.back.shown = false;
      baker?.dropJobOf(layers.back);
      tangentOf(layers.front.frame, eye, eyeFront);
      stats.fromAnchor = Math.round(Math.hypot(eyeFront.x, eyeFront.z));
    }
  }

  const grass: Grass = {
    group,
    stats,
    enabled: true,
    height: 1,
    proxies: () => {
      const probe = grassMaterial({ ...shared, ...layers.front.uniforms, uGRect: { value: new THREE.Vector4() }, uGSpacing: { value: 1 }, uGRadius: { value: 1 }, uGWidth: { value: 1 }, uGFaceCam: { value: 0 }, uGRing: { value: 0 } }, ramp, R, earth);
      return [proxyOf(probe)];
    },

    rebake() {
      layers.front.anchored = false;
      layers.back.anchored = false;
      layers.front.group.visible = layers.back.group.visible = false;
      baker?.reset();
    },

    update(frame) {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastTime) / 1000);
      lastTime = now;
      stats.instances = 0;
      stats.lastBakeMs = 0;
      // The clock and the strength the whole of the flora moves by: see `wind.ts`.
      setWind(now, frame.wind, frame.player);
      shared.uGHeight!.value = grass.height;

      const wanted = qualityFor(detail());
      if (wanted !== quality) {
        quality = wanted;
        rings.build(layers.front, wanted);
        rings.build(layers.back, wanted);
        stats.quality = wanted;
        stats.rings = RINGS[wanted].length;
      }
      const reach = RING_REACH[wanted];

      frame.camera.getWorldPosition(eye);
      const jumped = eye.distanceTo(lastEye) > JUMP;
      lastEye.copy(eye);
      // Nothing to see from up there, and nothing to bake for it: the rings
      // are drawn round the camera's point of the ground and the last of them
      // ends at `reach`.
      const low = frame.height < reach * 0.9;
      const near = frame.height < reach * 1.5;
      const active = ground !== null && grass.enabled && !frame.hidden;
      group.visible = active && low;
      stats.visible = group.visible;
      if (!active || !near) {
        stats.pending = baker?.pending() ?? 0;
        return;
      }

      reanchor(jumped);
      noteChanges();

      // The bake: one job at a time, whole before the next, inside the frame.
      const began = performance.now();
      baker!.run(began, detailBuild(BUILD_MS), { front: eyeFront, back: eyeBack });
      stats.lastBakeMs = Number((performance.now() - began).toFixed(2));

      showAndSwap();
      for (const layer of [layers.front, layers.back]) {
        if (layer.began >= 0 && layer.fine.valid && layer.coarse.valid) {
          stats.lastFillMs = Math.round(performance.now() - layer.began);
          layer.began = -1;
        }
        const growing = layer === layers.front && layer.shown;
        layer.appear = Math.min(1, Math.max(0, layer.appear + (growing ? dt : -dt) / APPEAR_SECONDS));
        if (!growing && layer.appear <= 0) layer.group.visible = false;
      }
      rings.setUniforms(layers.front, frame, eyeFront);
      if (layers.back.group.visible) rings.setUniforms(layers.back, frame, tangentOf(layers.back.frame, eye, eyeBack));

      const up = layers.front.frame.up;
      stats.anchor = `${latOf(up.y).toFixed(3)}, ${lonOf(up.x, up.z).toFixed(3)}`;
      stats.fineReady = layers.front.fine.valid;
      stats.coarseReady = layers.front.coarse.valid;
      stats.pending = baker?.pending() ?? 0;
    },
  };
  return grass;
}
