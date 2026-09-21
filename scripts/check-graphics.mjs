// Real WebGL regression check, against a `vite preview` of a build rather than
// the dev server — the dev server's eager `import.meta.glob` loads abort in
// headless Chrome (see *Validation* in docs/graphics.md):
//   pnpm build && pnpm preview        # serves http://localhost:4173
//   node scripts/check-graphics.mjs http://localhost:4173
// Uses shot.mjs's Chrome driver; no extra project dependency.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const url = new URL(process.argv[2] ?? 'http://localhost:4173');
url.search = '?at=39.5696,2.6502&time=2026-09-10T10:00:00Z';
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('./shot.mjs', import.meta.url)), '--url', url.href,
  '--size', '960x640', '--eval', `(${check.toString()})()`, '--log',
], { encoding: 'utf8', timeout: 120000 });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
assert.equal(result.status, 0, result.error?.message ?? 'Chrome driver fails');
assert.match(result.stdout, /"result":"GRAPHICS_OK"/);
assert.doesNotMatch(result.stdout, /EVAL ERROR|EXC:|error:/i);
