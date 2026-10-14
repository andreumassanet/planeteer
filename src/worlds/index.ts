/**
 * Standing on another world: `enterWorld(bodyId, host)`.
 *
 * The planet menu's *Explore* calls it with the page's renderer and frame
 * (`world-host.ts`), having suspended itself, and gets the screen back through
 * `host.exit()` once the world has stopped its loop and taken its DOM away;
 * `?world=<id>` calls `standalone`, which makes a renderer and a host of its
 * own and leaves by reloading without the parameter. Either way the world is
 * its own scene, its own loop and its own lights: nothing of Earth's world is
 * touched, and nothing here is in Earth's first load (`main.ts` reaches this
 * file through one `import()`; `scripts/check-worlds.ts` holds it).
 *
 * The game around it is Earth's, the same modules built the same way
 * (`shell.ts`): the HUD, the minimap, the map, the chat, the players, the
 * settings, the passport. A world is a different place, never a different game.
 *
 * The pieces live beside this file and in `index/`: `parts.ts` builds the
 * ground, sky, towns, roads, traffic, crowd and effects; `spawn.ts`,
 * `arrival-craft.ts` and `pads.ts` place the traveller, the craft and the
 * rocket pads; `frame.ts` is the loop body and `teardown.ts` the exit.
 *
 * Debugging: `window.atlasWorld` (`index/debug.ts`).
 */

import * as THREE from 'three';
import type { WorldHost } from '../world-host.ts';
import type { WorldSpec } from './contract.ts';
import { loadWorldSpec } from './registry.ts';
import type { Craft } from './craft.ts';
import { createWorldPlayer } from './player.ts';
import { createWorldRig } from './camera.ts';
import { createShell } from './shell.ts';
import { createInput } from '../input.ts';
import { buildAvatar, prepareAvatar } from '../avatar.ts';
import { createPassingSound } from '../passing-sound.ts';
import type { Rocket } from '../rocket.ts';
import { parkArrivalCraft, createPadProbes } from './index/arrival-craft.ts';
import { createCollide } from './index/collision.ts';
import { createCraftStream } from './index/craft-stream.ts';
import { exposeWorld } from './index/debug.ts';
import { createDust, createEffectsSubject } from './index/effects-feed.ts';
import { createFrame } from './index/frame.ts';
import { createGroundAt } from './index/ground-at.ts';
import { createNightSources } from './index/night-sources.ts';
import { planPads } from './index/pads.ts';
import { createParts } from './index/parts.ts';
import { createRocketPads } from './index/rocket-pads.ts';
import { createSettle } from './index/settle.ts';
import { createSpawn } from './index/spawn.ts';
import { standalone as standaloneWorld } from './index/standalone.ts';
import { teardown } from './index/teardown.ts';

/** The skyships' passing voices, shared by every visit: made once, so a second world does not start a second set. */
let sharedPassing: ReturnType<typeof createPassingSound> | null = null;

export async function enterWorld(bodyId: string, host: WorldHost): Promise<void> {
  const spec = await loadWorldSpec(bodyId);
  await prepareAvatar();
  const world = buildWorld(spec, host);
  world.start();
}

/** `?world=<id>`: the world straight from the address bar; `ready` is called once it is drawing. */
export async function standalone(bodyId: string, ready: () => void): Promise<void> {
  await standaloneWorld(bodyId, ready, enterWorld);
}

interface World {
  start(): void;
}

function buildWorld(spec: WorldSpec, host: WorldHost): World {
  const query = new URLSearchParams(location.search);
  const parts = createParts(spec);
  const { body, R, scene, ctx, gradientMap, terrain, settlements, roads, sky, ground, traffic, effects, outposts, keepClear } = parts;
  const passing = (sharedPassing ??= createPassingSound());
  const passingBus: { node: GainNode | null } = { node: null };
  const groundAt = createGroundAt({ settlements, roads, terrain, radius: R, skyways: spec.ground === 'cloud-deck' });

  const avatar = buildAvatar(host.appearance());
  scene.add(avatar.group);
  const crafts: Craft[] = [];
  const rockets = new Map<string, Rocket>();
  const collide = createCollide({ settlements, outposts, crafts, rockets, driven: () => player.craft });
  const player = createWorldPlayer(
    {
      radius: R,
      gravity: body.gravity,
      groundAt,
      collide,
      // Earth's feet: a footfall a heel strike, and a landing after a jump.
      onStep: (weight) => {
        host.step?.(weight);
        effects.step(weight);
      },
      onTouchdown: (speed) => {
        if (speed > 12) host.cue?.('land');
        effects.touchdown(speed);
      },
    },
    avatar,
  );
  const rig = createWorldRig(settlements.blocks);
  const spawn = createSpawn({ spec, host, query, settlements, player, rig, radius: R, keepClear });

  const probes = createPadProbes({ settlements, roads, terrain, radius: R });
  const arrivalUfo = parkArrivalCraft({ spec, spawnSite: spawn.spawnSite, settlements, probes, player, terrain, radius: R, groundAt, ctx, gradientMap, scene, crafts, keepClear });
  const plan = planPads({ spec, settlements, terrain, probes, keepClear, arrivalUfo });
  const rocketPads = createRocketPads({ pads: plan.pads, settlements, terrain, scene, gradientMap, player, rig, crafts, radius: R, groundAt, rockets });
  rocketPads.stream(player.position);
  const craftStream = createCraftStream({ spec, settlements, ctx, gradientMap, scene, player, crafts, radius: R, groundAt, spotsOf: plan.spotsOf });
  const input = createInput(host.renderer.domElement);

  // The first frame's ground and towns, before anything is drawn.
  const settle = createSettle({ renderer: host.renderer, settlements, roads, terrain, player, rig, radius: R, groundAt, collide });
  settle();
  ground.prime(rig.camera.position);

  const loop = { running: true };
  const stepOut = new THREE.Vector3();
  const shell = createShell({
    host,
    spec,
    geography: parts.geography,
    surface: parts.surface,
    terrain,
    scene,
    ctx,
    player,
    rig,
    sky,
    ground,
    frontiers: parts.frontiers,
    settlements,
    crowd: parts.crowd,
    crafts,
    input,
    roadLines: () => roads.lines(),
    roadRibbons: () => roads.lines().map((line, k) => ({ half: roads.halfOf(k), points: line.points })),
    pads: plan.mapPads,
    saucers: plan.mapSaucers,
    groundAt,
    craftInReach: craftStream.inReach,
    jumpTo(lat, lon) {
      if (player.craft !== null) player.leave();
      // Out of a rocket too: on its pad it is a step out; gone up, it is put back.
      if (rocketPads.riding !== null && !rocketPads.riding.leave(stepOut)) rocketPads.riding.reset();
      rocketPads.riding = null;
      spawn.standAt(lat, lon);
      rig.heading.copy(player.facing);
      settle();
    },
    home: spawn.home,
    leave: () => leave('system'),
    rocketInReach: rocketPads.inReach,
    riding: () => rocketPads.riding,
    boardRocket: rocketPads.board,
    leaveRocket: rocketPads.leave,
  });

  // The clock: the real one, local solar time where you stand; `?hour=` turns
  // it, and so do the settings and `/time` from there.
  const wantedHour = Number(query.get('hour'));
  if (query.get('hour') !== null && Number.isFinite(wantedHour)) sky.setHour(wantedHour, shell.date(), player.position);
  sky.update(shell.date(), player.position, rig.camera.position, rig.camera.far);

  // The cream that comes down over the end of a launch, and is lifted off the
  // solar system once the menu is back under it.
  const curtain = document.createElement('div');
  curtain.style.cssText = 'position:fixed;inset:0;z-index:20;pointer-events:none;opacity:0;display:none;background:radial-gradient(circle at 50% 42%,#fff2e8 0 35%,#fde6e1 100%)';
  document.body.appendChild(curtain);

  const running = createFrame({
    parts,
    host,
    input,
    shell,
    player,
    rig,
    crafts,
    craftStream,
    rocketPads,
    dust: createDust({ effects, player, traffic, terrain, radius: R, groundAt }),
    effectsSubject: createEffectsSubject(player, rocketPads),
    nightSources: createNightSources({ settlements, outposts, traffic, player }),
    groundAt,
    curtain,
    passing,
    passingBus,
    state: loop,
    leave: (to) => leave(to),
  });

  function leave(to?: 'system'): void {
    if (!loop.running) return;
    loop.running = false;
    teardown({ parts, player, avatar, crafts, rocketPads, shell, input, curtain, passing, passingBus });
    delete (globalThis as Record<string, unknown>)['atlasWorld'];
    host.exit(to);
  }

  exposeWorld({ parts, renderer: host.renderer, player, rig, shell, crafts, rocketPads, plan, spawn, settle, leave });

  return {
    start() {
      running.restart();
      requestAnimationFrame(running.frame);
    },
  };
}
