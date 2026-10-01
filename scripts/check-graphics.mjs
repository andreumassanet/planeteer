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
  // The light shafts draw facing a low sun and not at night: one render of
  // the chain through a clone of the camera turned to the sun, whose stats
  // are read straight after it, since the loop draws through the rig's.
  a.weather.force('clear');
  a.sky.setTime('2026-09-10T17:40:00Z');
  await frames(3);
  const lens = a.rig.camera.clone();
  lens.up.copy(lens.position).normalize();
  lens.lookAt(lens.position.clone().add(a.sky.state.sun));
  lens.updateMatrixWorld();
  a.post.render(a.scene, lens);
  ensure(a.post.stats.shafts === 1, `No light shafts facing a low sun (strength ${a.post.shafts.strength})`);
  a.sky.setTime('2026-09-10T01:00:00Z');
  await frames(3);
  a.post.render(a.scene, lens);
  ensure(a.post.stats.shafts === 0, 'Light shafts at night');
  a.weather.force(null);
  a.sky.setTime('2026-09-10T10:00:00Z');
  await frames(2);
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
  // The deck's shade against its twin on the exact field (`cloudShadeAt`): the
  // land's own material, lit straight down on a patch of the planet deep in a
  // bank's shade and on one under open sky, drawn with the shade on and off.
  // In linear light the ratio of the two is what the shade leaves of the sun,
  // `1 - shade`, and the shader's bake, ray and turn are all in it.
  //
  // The bake is a share of each frame (`BAKE_MS`, at most two frames' worth
  // however late the frame), so its wait is counted in frames, not in ms: a
  // GPU has it in under three seconds, and SwiftShader, at a frame a second
  // or two, took 20 and 22 s after the world was up on 2026-10-01. A minute
  // keeps that inside the run's own 125 s with the world's typical 47 s load.
  const until = Date.now() + 60000;
  while (!(a.clouds.shade.ready && a.clouds.shade.share > 0.99)) {
    if (Date.now() > until) throw new Error('The cloud shade never baked');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const cloudShade = () => {
    const V = a.player.position.constructor;
    const radius = a.player.position.length();
    const up = a.player.position.clone().normalize();
    const east = new V(0, 1, 0).cross(up).normalize();
    const north = up.clone().cross(east);
    let deep = null;
    let open = null;
    for (let r = 0; r <= 6000 && (deep === null || open === null); r += 60) {
      for (let k = 0; k < 16; k++) {
        const p = up.clone().addScaledVector(east, (r * Math.cos(k * Math.PI / 8)) / radius)
          .addScaledVector(north, (r * Math.sin(k * Math.PI / 8)) / radius).normalize().multiplyScalar(radius);
        const twin = a.clouds.shadeAt(p);
        if (p.clone().normalize().dot(a.sky.state.sun) < 0.4) continue;
        if (deep === null && twin.cover > 0.999) deep = { p, twin };
        if (open === null && twin.cover === 0) open = { p, twin };
      }
    }
    ensure(deep !== null && open !== null, 'No bank near Palma to probe the cloud shade under');
    const probe = new land.geometry.constructor();
    const patch = new land.constructor(probe, land.material);
    // Moved between the two points: a bounding sphere would stay at the first.
    patch.frustumCulled = false;
    const world = new a.scene.constructor();
    const overhead = new a.sky.sun.constructor(0xffffff, 3);
    world.add(patch, overhead, overhead.target);
    const eye = a.rig.camera.clone();
    const linear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luma = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    const draw = (p, on) => {
      const n = p.clone().normalize();
      const e = new V(0, 1, 0).cross(n).normalize();
      const t = n.clone().cross(e);
      const corners = [[-2, -2], [2, -2], [0, 2]].map(([x, y]) => p.clone().addScaledVector(e, x).addScaledVector(t, y));
      const Attribute = land.geometry.attributes.position.constructor;
      probe.setAttribute('position', new Attribute(new Float32Array(corners.flatMap(c => [c.x, c.y, c.z])), 3));
      probe.setAttribute('normal', new Attribute(new Float32Array([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z]), 3));
      probe.setAttribute('color', new Attribute(new Float32Array(9).fill(1), 3));
      overhead.position.copy(p).add(n);
      overhead.target.position.copy(p);
      overhead.target.updateMatrixWorld();
      eye.position.copy(p).add(n);
      eye.up.copy(e);
      eye.lookAt(p);
      eye.near = 0.1;
      eye.far = 10;
      eye.aspect = 1;
      eye.updateProjectionMatrix();
      a.clouds.shadows = on ? 1 : 0;
      a.clouds.update(a.sky.state.time, a.rig.camera.position, a.scene.fog);
      renderer.render(world, eye);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel);
    };
    try {
      const deepOn = draw(deep.p, true);
      const deepOff = draw(deep.p, false);
      const openOn = draw(open.p, true);
      const openOff = draw(open.p, false);
      const under = luma(deepOn) / luma(deepOff);
      const beside = luma(openOn) / luma(openOff);
      const wanted = 1 - deep.twin.shade;
      ensure(Math.abs(under / wanted - 1) < 0.1, `The cloud shade is not its twin's: ${under.toFixed(3)} of the sun against ${wanted.toFixed(3)} (${deepOn} / ${deepOff})`);
      ensure(Math.abs(beside - 1) < 0.02, `The cloud shade falls under open sky: ${beside.toFixed(3)} (${openOn} / ${openOff})`);
      return { under: Number(under.toFixed(3)), wanted: Number(wanted.toFixed(3)), beside: Number(beside.toFixed(3)) };
    } finally {
      a.clouds.shadows = 1;
      a.clouds.update(a.sky.state.time, a.rig.camera.position, a.scene.fog);
      probe.dispose();
    }
  };
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
    const clouds = cloudShade();
    const sky = a.scene.getObjectByName('sky');
    ensure(!sky.material.depthWrite && sky.material.depthTest, 'Sky must preserve scene depth');
    a.outline.render(a.scene, a.rig.camera);
    ensure(renderer.info.programs.every(program => gl.getProgramParameter(program.program, gl.LINK_STATUS)),
      'A world shader does not link');
    ensure(gl.getError() === gl.NO_ERROR, 'WebGL reports an error');
    return { result: 'GRAPHICS_OK', shadow, sun, clouds };
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
