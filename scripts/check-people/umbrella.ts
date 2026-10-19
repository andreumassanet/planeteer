import * as THREE from 'three';
import { UMBRELLA_COLOURS, UMBRELLA_RAIN, UMBRELLA_SHARE, umbrellaGeometry, umbrellaOf } from '../../src/umbrella.ts';
import { fail } from './setup.ts';

// ---------------------------------------------------------------------------
// Umbrellas: who carries one is the key's, the shape is closed and over the head
// ---------------------------------------------------------------------------

console.log('\nUmbrellas');
{
  const keys = Array.from({ length: 4000 }, (_, i) => `t:${i % 97}:${i}`);
  let carriers = 0;
  for (const key of keys) {
    const a = umbrellaOf(key);
    const b = umbrellaOf(key);
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`umbrella of ${key} is not a function of the key`);
    if (a.carries) carriers++;
    if (a.threshold < UMBRELLA_RAIN[0] || a.threshold > UMBRELLA_RAIN[0] + UMBRELLA_RAIN[1]) fail(`umbrella of ${key} opens at ${a.threshold}`);
    if (!UMBRELLA_COLOURS.includes(a.colour)) fail(`umbrella of ${key} has a colour off the list`);
  }
  const share = carriers / keys.length;
  if (Math.abs(share - UMBRELLA_SHARE) > 0.03) fail(`umbrella share ${share.toFixed(3)}, wanted ${UMBRELLA_SHARE}`);
  for (const colour of UMBRELLA_COLOURS) {
    const brightest = Math.max((colour >> 16) & 255, (colour >> 8) & 255, colour & 255) / 255;
    if (brightest < 0.25) fail(`umbrella colour ${colour.toString(16)} reads as ink`);
  }
  const geometry = umbrellaGeometry();
  const position = geometry.getAttribute('position');
  let volume = 0;
  let top = -Infinity;
  let bottom = Infinity;
  let reach = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  for (let i = 0; i < position.count; i++) {
    a.fromBufferAttribute(position, i);
    if (!Number.isFinite(a.x + a.y + a.z)) fail('umbrella geometry has a non-finite vertex');
    top = Math.max(top, a.y);
    bottom = Math.min(bottom, a.y);
    reach = Math.max(reach, Math.hypot(a.x, a.z));
  }
  if (!(volume > 0)) fail(`umbrella signed volume ${volume.toFixed(4)}: its faces point in`);
  // The hand is held about 0.8 of the body up: the canopy must clear the crown (1.0) and cover the head.
  if (top < 0.35 || top > 0.65) fail(`umbrella top ${top.toFixed(2)} over the hand`);
  if (bottom > 0) fail('umbrella shaft does not reach the hand');
  if (reach < 0.35 || reach > 0.65) fail(`umbrella canopy radius ${reach.toFixed(2)}`);
  console.log(`  ${(share * 100).toFixed(1)}% carry one, ${position.count / 3} triangles, top ${top.toFixed(2)}, radius ${reach.toFixed(2)}`);
}
