// Real WebGL regression check, against a `vite preview` of a build rather than
// the dev server — the dev server's eager `import.meta.glob` loads abort in
// headless Chrome:
//   pnpm build && pnpm graphics
// An optional URL uses an existing preview instead of starting one.
// Uses shot.mjs's Chrome driver; no extra project dependency.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { preview } from 'vite';

async function check() {
  const deadline = Date.now() + 90000;
  while (!window.atlas) {
    if (Date.now() > deadline) throw new Error('World did not load');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const a = window.atlas;
  a.sky.setTime('2026-09-10T10:00:00Z');
  a.sky.setRate(0);
  a.sky.update(a.player.position, a.rig.camera.position, 15);
  const renderer = a.renderer;
  const gl = renderer.getContext();
  const ensure = (ok, message) => { if (!ok) throw new Error(message); };
  const frames = async count => {
    for (let i = 0; i < count; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  };
  await frames(3);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.querySelector('button[aria-label="Settings"]').click();
  const panel = document.querySelector('.atlas-settings');
  ensure(panel.classList.contains('on'), 'Settings did not open');
  ensure(a.input.state.move.y === 0, 'Opening settings left the player walking');
  await frames(2);
  ensure(panel.contains(document.activeElement), 'Settings did not take keyboard focus');
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  panel.querySelector('.atlas-settings-close').click();
  ensure(!panel.classList.contains('on'), 'Settings did not close');
  a.map.show();
  await frames(2);
  ensure(a.map.open, 'Map did not open');
  a.map.hide();
  ensure(!a.map.open, 'Map did not close');
  ensure(a.failures.size === 0, `World update failed: ${JSON.stringify([...a.failures])}`);
  const land = a.scene.getObjectByName('land');
  const scene = new a.scene.constructor();
  const camera = a.rig.camera.clone();
  camera.position.set(0, 0, 1);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 10;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  const geometry = new land.geometry.constructor();
  geometry.setAttribute('position', new land.geometry.attributes.position.constructor(
    new Float32Array([-2, -2, 0, 2, -2, 0, 0, 2, 0]), 3,
  ));
  geometry.computeVertexNormals();
  const material = new land.material.constructor({ color: 0xffffff, gradientMap: land.material.gradientMap });
  scene.add(new land.constructor(geometry, material));
  const light = new a.sky.sun.constructor(0xffffff, 1);
  scene.add(light, light.target);
  const pixel = new Uint8Array(4);
  const width = renderer.domElement.width / renderer.getPixelRatio();
  const height = renderer.domElement.height / renderer.getPixelRatio();
  try {
    renderer.setSize(64, 64, false);
    const sample = z => {
      light.position.set(0, 0, z);
      renderer.render(scene, camera);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel);
    };
    const shadow = sample(-1);
    const sun = sample(1);
    ensure(shadow[2] > shadow[0] + 5, `Shadow loses its blue: ${shadow}`);
    ensure(sun[0] > sun[2] + 2, `Sunlight loses its warmth: ${sun}`);
    ensure(sun[0] > shadow[0] * 1.4, 'Cel bands lose contrast');
    const sky = a.scene.getObjectByName('sky');
    ensure(!sky.material.depthWrite && sky.material.depthTest, 'Sky must preserve scene depth');
    a.outline.render(a.scene, a.rig.camera);
    ensure(renderer.info.programs.every(program => gl.getProgramParameter(program.program, gl.LINK_STATUS)),
      'A world shader does not link');
    ensure(gl.getError() === gl.NO_ERROR, 'WebGL reports an error');
    return { result: 'GRAPHICS_OK', shadow, sun };
  } finally {
    renderer.setSize(width, height, false);
    geometry.dispose();
    material.dispose();
  }
}

let server;
try {
  if (process.argv[2] === undefined) {
    server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false } });
  }
  const url = new URL(process.argv[2] ?? server.resolvedUrls.local[0]);
  url.searchParams.set('at', '39.5696,2.6502');
  url.searchParams.set('time', '2026-09-10T10:00:00Z');
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    fileURLToPath(new URL('./shot.mjs', import.meta.url)), '--url', url.href,
    '--size', '960x640', '--eval', `(${check.toString()})()`, '--log',
  ], { timeout: 125000 });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  assert.match(stdout, /"result":"GRAPHICS_OK"/);
  assert.doesNotMatch(stdout, /EVAL ERROR|EXC:|error:|NETFAIL|HTTP [45]\d\d/i);
} catch (error) {
  console.error(error.stderr ?? error.message);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
