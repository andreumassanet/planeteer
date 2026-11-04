/** The trails' pool: its cap, frame-rate independence, jumps, reach, lifetimes, determinism, and proper matrices. */
import * as THREE from 'three';
import { BY_SLOT, MAX_TRAIL_PARTICLES, TRAIL_REACH, createTrails, type TrailEmitter } from '../../src/cosmetics.ts';
import { MAX_RATE, TRAIL_KINDS } from '../../src/cosmetics/trails.ts';
import { fail } from './setup.ts';

const R = 32000;
const UP = new THREE.Vector3(0, 1, 0);

/** A traveller going round the planet at `speed` for `seconds`, stepped at `fps`: what the pool holds at the end, and the most it held. */
function run(trail: number, speed: number, seconds: number, fps: number, inVehicle: boolean, viewerFar = false) {
  const scene = new THREE.Group();
  const trails = createTrails(scene);
  const position = new THREE.Vector3();
  const up = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const emitter: TrailEmitter = { key: 'hero', position, up, velocity, trail, inVehicle };
  const dt = 1 / fps;
  let most = 0;
  let emitted = 0;
  let lastLive = 0;
  for (let t = 0; t <= seconds + 1e-9; t += dt) {
    const angle = (speed * t) / R;
    position.set(Math.sin(angle) * R, Math.cos(angle) * R, 0);
    up.copy(position).normalize();
    velocity.set(Math.cos(angle), -Math.sin(angle), 0).multiplyScalar(speed);
    const viewer = viewerFar ? position.clone().addScaledVector(UP, TRAIL_REACH * 2) : position;
    trails.update(dt, [emitter], viewer);
    most = Math.max(most, trails.stats.live);
    lastLive = trails.stats.live;
    emitted = trails.stats.live;
  }
  return { trails, most, live: lastLive, emitted, scene };
}

console.log('\nthe trails:');
{
  const index = (id: string): number => BY_SLOT.trail.find((item) => item.id === id)!.index;
  for (const item of BY_SLOT.trail) {
    const kind = TRAIL_KINDS[item.id]!;
    // The same walk at three frame rates lays the same trail.
    const counts = [30, 60, 144].map((fps) => run(item.index, 6.5, 3, fps, false).live);
    const spread = (Math.max(...counts) - Math.min(...counts)) / Math.max(1, Math.max(...counts));
    if (spread > 0.15) fail(`${item.name}: ${counts.join(', ')} particles walking at 30, 60 and 144 fps`);
    // Fast in a vehicle: never more than the rate allows, and never past the pool.
    const fast = run(item.index, 400, 4, 60, true);
    const most = MAX_RATE * kind.burst * kind.life * 1.4 * 1.3 + 2;
    if (fast.most > Math.min(most, MAX_TRAIL_PARTICLES)) fail(`${item.name}: ${fast.most} particles at 400 units a second`);
    if (fast.trails.stats.refused > 0) fail(`${item.name}: the pool refused ${fast.trails.stats.refused} from one fast traveller`);
    // Every particle is drawn through a proper matrix.
    const m = new THREE.Matrix4();
    for (let i = 0; i < fast.trails.mesh.count; i++) {
      fast.trails.mesh.getMatrixAt(i, m);
      if (!(m.determinant() > 0)) {
        fail(`${item.name}: particle ${i} has a reflected or collapsed matrix`);
        break;
      }
    }
    fast.trails.dispose();
  }
  // Nothing worn, nothing laid; out of reach, nothing laid.
  if (run(0, 6.5, 2, 60, false).most > 0) fail('no trail lays particles');
  if (run(index('trail-sparkles'), 6.5, 2, 60, false, true).most > 0) fail('a traveller out of reach lays particles');
  // A jump lays nothing, and the particles die out once the emitter stops.
  {
    const scene = new THREE.Group();
    const trails = createTrails(scene);
    const position = new THREE.Vector3(0, R, 0);
    const emitter: TrailEmitter = { key: 'hero', position, up: UP, velocity: new THREE.Vector3(), trail: index('trail-confetti'), inVehicle: true };
    trails.update(1 / 60, [emitter], position);
    position.set(R, 0, 0);
    emitter.up = position.clone().normalize();
    trails.update(1 / 60, [emitter], position);
    if (trails.stats.live > 0) fail(`a jump across the planet laid ${trails.stats.live} particles`);
    const walking = run(index('trail-confetti'), 30, 2, 60, true);
    const stopped: TrailEmitter = { key: 'hero', position: new THREE.Vector3(0, R, 0), up: UP, velocity: new THREE.Vector3(), trail: index('trail-confetti'), inVehicle: true };
    for (let i = 0; i < 4 * 60; i++) walking.trails.update(1 / 60, [stopped], stopped.position);
    if (walking.trails.stats.live > 0) fail(`${walking.trails.stats.live} particles outlive their life once the vehicle stops`);
  }
  // Two runs are one run.
  const a = run(index('trail-petals'), 9, 2, 60, false);
  const b = run(index('trail-petals'), 9, 2, 60, false);
  const ma = new THREE.Matrix4();
  const mb = new THREE.Matrix4();
  if (a.live !== b.live) fail(`the same walk laid ${a.live} and ${b.live} petals`);
  else if (a.live > 0) {
    a.trails.mesh.getMatrixAt(0, ma);
    b.trails.mesh.getMatrixAt(0, mb);
    if (!ma.equals(mb)) fail('the same walk laid its petals in two places');
  }
  // One draw call, many travellers, the pool's cap held.
  {
    const scene = new THREE.Group();
    const trails = createTrails(scene);
    const emitters: TrailEmitter[] = Array.from({ length: 30 }, (_, i) => ({ key: `peer:${i}`, position: new THREE.Vector3(i * 3, R, 0), up: UP.clone(), velocity: new THREE.Vector3(0, 0, 60), trail: index('trail-rainbow'), inVehicle: true }));
    for (let f = 0; f < 120; f++) {
      for (const e of emitters) e.position.z += 1;
      trails.update(1 / 60, emitters, new THREE.Vector3(0, R, 0));
    }
    if (trails.stats.live > MAX_TRAIL_PARTICLES) fail(`the pool holds ${trails.stats.live}, over its ${MAX_TRAIL_PARTICLES}`);
    let meshes = 0;
    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes++;
    });
    if (meshes !== 1) fail(`the trails are ${meshes} meshes`);
    console.log(`  thirty rainbows at once: ${trails.stats.live} particles in one mesh, ${trails.stats.refused} refused at the cap of ${MAX_TRAIL_PARTICLES}`);
  }
  const walks = BY_SLOT.trail.map((item) => `${item.name} ${run(item.index, 6.5, 3, 60, false).live}`);
  console.log(`  walking three seconds: ${walks.join(', ')}; the same at 30, 60 and 144 fps; a jump lays nothing; out of reach nothing`);
}
