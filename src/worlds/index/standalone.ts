/** `?world=<id>`: a world straight from the address bar, with a renderer, a frame and a host of its own. */

import * as THREE from 'three';
import type { WorldHost } from '../../world-host.ts';
import { heroAppearance, wardrobeCast } from '../../avatar.ts';
import { createPost } from '../../post.ts';

/**
 * Makes the renderer and the host, enters the world, and calls `ready` once it
 * is drawing (when the loading card can go). `&site=<settlement>` lands in
 * that town, and without it in the capital; `&at=lat,lon` stands there.
 * Leaving reloads the page without the parameters.
 */
export async function standalone(bodyId: string, ready: () => void, enter: (bodyId: string, host: WorldHost) => Promise<void>): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // As Earth's: a shadow map redrawn when the frame asks for it.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const post = createPost(renderer);
  addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
  });
  let sound: { context: AudioContext; node: AudioNode } | null = null;
  const open = (): void => {
    if (sound === null) {
      const context = new AudioContext();
      const node = context.createGain();
      node.gain.value = 0.8;
      node.connect(context.destination);
      sound = { context, node };
    }
    if (sound.context.state === 'suspended') void sound.context.resume();
  };
  addEventListener('pointerdown', open, { capture: true });
  addEventListener('keydown', open, { capture: true });
  const host: WorldHost = {
    renderer,
    draw: (scene, camera) => post.render(scene, camera),
    pixelRatio: () => Math.min(devicePixelRatio, 2),
    sound: () => sound,
    appearance: heroAppearance,
    cast: wardrobeCast,
    name: () => '',
    mode: 'offline',
    time: () => new Date(),
    exit: () => {
      const url = new URL(location.href);
      for (const key of ['world', 'hour', 'site', 'at']) url.searchParams.delete(key);
      location.href = url.toString();
    },
  };
  await enter(bodyId, host);
  ready();
}
