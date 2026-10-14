/** One frame of a world: the traveller, the craft, the streamers, the night, the draw. */

import * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import type { Craft } from '../craft.ts';
import type { WorldPlayer } from '../player.ts';
import type { WorldRig } from '../camera.ts';
import type { Shell } from '../shell.ts';
import { updateNight } from '../night.ts';
import type { NightSources } from '../night.ts';
import type { Input } from '../../input.ts';
import type { EffectsSubject } from '../../effects.ts';
import type { PassingSound } from '../../passing-sound.ts';
import { beginFrameBuild, detailScale, endFrameBuild, sampleFrame, skipFrame } from '../../view.ts';
import type { CraftStream } from './craft-stream.ts';
import type { Dust } from './effects-feed.ts';
import type { Parts } from './parts.ts';
import { stepRockets, updateFog, updateSward } from './frame-parts.ts';
import type { RocketPads } from './rocket-pads.ts';

/** The finest the ground splits whatever the render distance: past this a tile costs more than it shows. */
const GROUND_DETAIL_MAX = 4;
/** How long a frame may spend building ground tiles, ms, at the detail knob's 1. */
const GROUND_BUDGET = 5;

export interface FrameDeps {
  parts: Parts;
  host: WorldHost;
  input: Input;
  shell: Shell;
  player: WorldPlayer;
  rig: WorldRig;
  crafts: Craft[];
  craftStream: CraftStream;
  rocketPads: RocketPads;
  dust: Dust;
  effectsSubject: EffectsSubject;
  nightSources: NightSources;
  groundAt: (point: THREE.Vector3) => number;
  /** The cream that comes down over the end of a launch. */
  curtain: HTMLElement;
  passing: PassingSound;
  /** The effects bus the skyships' voices play on, once a gesture has opened the sound. */
  passingBus: { node: GainNode | null };
  /** Whether the loop runs; the world's teardown clears it. */
  state: { running: boolean };
  leave(to?: 'system'): void;
}

/** Returns the frame callback and a call that restarts its clock. */
export function createFrame(deps: FrameDeps): { frame(now: number): void; restart(): void } {
  const { parts, host, input, shell, player, rig, crafts, craftStream, rocketPads, dust, effectsSubject, nightSources, groundAt, curtain, passing, passingBus, state: loop, leave } = deps;
  const { R, scene, sky, ground, settlements, roads, traffic, crowd, ambient, effects, skyships, terrain } = parts;
  const renderer = host.renderer;
  const size = new THREE.Vector2();
  const blockers: THREE.Vector3[] = [];
  let last = performance.now();

  function frame(now: number): void {
    if (!loop.running) return;
    requestAnimationFrame(frame);
    const interval = now - last;
    const dt = Math.min(0.1, Math.max(0, interval / 1000));
    last = now;
    const began = performance.now();
    // The frame's one build allowance, as Earth's loop opens it (`view.ts`).
    beginFrameBuild();
    // Earth's render distance (`view.ts`), one knob for every world: how
    // finely the ground splits, how far the towns are built and the pads
    // stand, and how far the haze opens.
    const reachScale = detailScale();
    ground.detail = Math.min(GROUND_DETAIL_MAX, Math.max(0.5, reachScale));
    settlements.reach = reachScale;
    // Counted per frame by hand (`autoReset` off), for `atlasWorld.stats()`.
    renderer.info.reset();
    const state = input.state;

    // A craft just boarded: touched now, and a rover off the road is the traveller's.
    const boarded = player.craft;
    if (boarded !== null) {
      craftStream.still.delete(boarded);
      if (!crafts.includes(boarded)) {
        traffic.take(boarded);
        scene.add(boarded.object);
        crafts.push(boarded);
      }
    }
    if (rocketPads.riding === null) {
      rig.aim(dt, state, player);
      player.update(dt, state, rig.steer);
    }
    for (const craft of crafts) if (craft !== player.craft && !craftStream.still.has(craft)) craft.update(dt, null, groundAt, player.gravity, R);
    craftStream.stream();
    renderer.getSize(size);
    rig.resize(size.x, size.y);
    const ride = rocketPads.riding;
    if (ride === null) rig.follow(dt, player, groundAt, R, terrain.high);
    else {
      // In the rocket: the body rides in it and the lens is the launch's.
      player.position.copy(ride.seat);
      ride.frame(rig.camera, dt);
    }
    const eye = rig.camera.position;

    // The pads: streamed in round the traveller, lit by whoever holds
    // `Space` in one, and now and then by nobody.
    rocketPads.stream(player.position);
    if (stepRockets(host, rocketPads, player, effects, curtain, dt, state, eye, ride)) {
      leave('system');
      return;
    }
    ambient.eachDevil((base, upward, color, height, carry) => effects.whirl(carry, base, upward, height, color, dt));
    dust.raise(dt);
    effects.update(dt, effectsSubject, rig.camera);
    if (skyships !== null) {
      skyships.update(dt, player.position, groundAt, R);
      const bus = host.sound()?.node;
      passingBus.node = bus instanceof GainNode ? bus : null;
      passing.update(passingBus.node, skyships.nearest);
    }
    dust.tint();

    ground.time += dt;
    ground.update(eye, GROUND_BUDGET * ground.detail);
    settlements.update(eye);
    roads.update(eye, reachScale);
    blockers.length = 0;
    blockers.push(player.position);
    for (const craft of crafts) if (craft !== player.craft) blockers.push(craft.position);
    traffic.update(dt, player.position, blockers);
    updateSward(parts, player, rig, rocketPads);
    // The maps' tiles, last of the frame's building, as on Earth.
    shell.pumpTiles();
    // The streamers' building ends here; what it cost is what the next
    // frame's far work is charged with (`endFrameBuild`).
    endFrameBuild();
    crowd.update(dt, player.position, eye);
    ambient.update(dt, player.position, eye, groundAt, R);
    sky.update(shell.date(), player.position, eye, rig.camera.far);
    // Lamps glow by day and blaze by night.
    settlements.glow = 0.5 + 1.6 * (1 - Math.min(1, Math.max(0, sky.state.day)));
    // And light what is round them, as the headlights of what is driven do.
    rig.camera.updateMatrixWorld();
    updateNight(rig.camera, sky.state.sun, sky.state.elevation, player.position, nightSources, ground.time);
    updateFog(parts, rig, rocketPads, reachScale);

    shell.update(dt);
    const drawFrom = performance.now();
    // Earth's renderer redraws its shadow map only when asked (`autoUpdate`
    // off); a world's is small enough to redraw every frame.
    renderer.shadowMap.needsUpdate = true;
    host.draw(scene, rig.camera);
    const drawTo = performance.now();
    shell.drawn(drawFrom - began, drawTo - drawFrom);
    // The render distance turns itself by the frame rate as it does on Earth.
    if (interval < 250) sampleFrame(interval, drawTo - began);
    else skipFrame();
    input.endFrame();
  }

  return {
    frame,
    restart() {
      last = performance.now();
    },
  };
}
