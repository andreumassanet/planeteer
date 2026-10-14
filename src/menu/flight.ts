/**
 * The camera: poses for the system, a planet and a globe, and the flights
 * between them. A flight interpolates in the logarithm of the distance, so a
 * dive from the whole system into one town reads as one move.
 */
import * as THREE from 'three';
import { onSphere } from '../globe.ts';
import type { OrreryBody } from '../orrery.ts';
import { refreshChrome } from './chrome.ts';
import { DEG, FOV, GLOBE_FILL, R, SYSTEM_AZIMUTH, SYSTEM_LEAD, SYSTEM_SAFE } from './constants.ts';
import type { MenuCtx } from './context.ts';
import { copyPose, makePose, type Orbit, type Pose } from './poses.ts';

/** Distance at which a sphere of `radius` fills `GLOBE_FILL` of the vertical frame. */
export const orbitDistance = (radius: number): number => radius / Math.sin(GLOBE_FILL * FOV * DEG * 0.5);

export function pixelsPerUnit(ctx: MenuCtx, distance: number): number {
  return ctx.renderer.domElement.clientHeight / 2 / (distance * Math.tan(FOV * DEG * 0.5));
}

export function bodyById(ctx: MenuCtx, id: string): OrreryBody {
  return ctx.orrery.bodies.find((entry) => entry.body.id === id) ?? ctx.orrery.earth;
}

/** The angle of a vector within the ecliptic plane, from the equinox. */
export function inPlane(ctx: MenuCtx, v: THREE.Vector3): number {
  return Math.atan2(v.dot(ctx.orrery.axes.y), v.dot(ctx.orrery.axes.x));
}

const fromDir = new THREE.Vector3();
const toDir = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Cover the next frame in space and lift it: a flight's cut, made gently. */
function dip(ctx: MenuCtx): void {
  const { dipLayer } = ctx;
  dipLayer.classList.remove('lift');
  dipLayer.classList.add('on');
  // The opaque frame has to be committed before the fade starts from it.
  void dipLayer.offsetWidth;
  dipLayer.classList.add('lift');
  dipLayer.classList.remove('on');
}

/** A direction from an orbit's centre, in the ecliptic of date. */
function orbitDirection(ctx: MenuCtx, orbit: Orbit, out: THREE.Vector3): THREE.Vector3 {
  const { orrery } = ctx;
  const { x, y, z } = orrery.axes;
  const c = Math.cos(orbit.elevation);
  return out
    .set(0, 0, 0)
    .addScaledVector(x, c * Math.cos(orbit.azimuth))
    .addScaledVector(y, c * Math.sin(orbit.azimuth))
    .addScaledVector(z, Math.sin(orbit.elevation));
}

export function systemPose(ctx: MenuCtx, orbit: Orbit, out: Pose): Pose {
  const { orrery, scratch, scratchC } = ctx;
  const toward = orbitDirection(ctx, orbit, scratch);
  // The lead: the in-plane part of the way to the camera, so the target sits
  // between the Sun and the near side of the system.
  const lead = scratchC.copy(toward).addScaledVector(orrery.north, -toward.dot(orrery.north));
  if (lead.lengthSq() > 1e-9) lead.normalize().multiplyScalar(orrery.extent * SYSTEM_LEAD);
  out.target.copy(orrery.sun.position).add(lead);
  out.eye.copy(out.target).addScaledVector(toward, orbit.distance);
  out.up.copy(orrery.north);
  return out;
}

/**
 * How far back the system shot sits so every body is on it: the nearest distance
 * at which each body's centre lands inside `SYSTEM_SAFE`, found by bisection.
 * Searched because a ring's near side projects several times larger than its far
 * side, so a fixed multiple of the system's reach cuts bodies off or frames too
 * loosely depending on where the planets are.
 */
function frameSystem(ctx: MenuCtx, orbit: Orbit): number {
  const { camera, orrery, scratchB } = ctx;
  const probe: Orbit = { ...orbit };
  const test = makePose();
  const lens = new THREE.PerspectiveCamera(FOV, camera.aspect, 1, R * 1000);
  let near = orrery.extent * 0.5;
  let far = orrery.extent * 3.5;
  for (let step = 0; step < 20; step++) {
    probe.distance = (near + far) / 2;
    systemPose(ctx, probe, test);
    lens.position.copy(test.eye);
    lens.up.copy(test.up);
    lens.lookAt(test.target);
    lens.updateMatrixWorld();
    let fits = true;
    for (const entry of orrery.bodies) {
      const at = scratchB.copy(entry.position).project(lens);
      if (at.z > 1 || Math.abs(at.x) > SYSTEM_SAFE.x || at.y > SYSTEM_SAFE.top || at.y < SYSTEM_SAFE.bottom) {
        fits = false;
        break;
      }
    }
    if (fits) far = probe.distance;
    else near = probe.distance;
  }
  return far;
}

export function focusPose(ctx: MenuCtx, orbit: Orbit, out: Pose): Pose {
  const { orrery, scratch } = ctx;
  out.target.copy(bodyById(ctx, ctx.focusId).position);
  out.eye.copy(out.target).addScaledVector(orbitDirection(ctx, orbit, scratch), orbit.distance);
  out.up.copy(orrery.north);
  return out;
}

export function globePose(ctx: MenuCtx, lat: number, lon: number, dist: number, out: Pose): Pose {
  out.target.copy(ctx.body.centre);
  onSphere(lon, lat, out.eye).multiplyScalar(dist).add(ctx.body.centre);
  out.up.set(0, 1, 0);
  return out;
}

export function applyPose(ctx: MenuCtx, p: Pose): void {
  const { camera } = ctx;
  camera.position.copy(p.eye);
  camera.up.copy(p.up);
  camera.lookAt(p.target);
  camera.updateMatrixWorld();
}

/** Unit-vector slerp, with the antipodal case turned about any perpendicular. */
function slerp(ctx: MenuCtx, a: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const { scratchC } = ctx;
  const angle = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  if (angle < 1e-4) return out.copy(a).lerp(b, k).normalize();
  if (angle > Math.PI - 1e-3) {
    const axis = Math.abs(a.y) < 0.9 ? scratchC.set(0, 1, 0) : scratchC.set(1, 0, 0);
    axis.cross(a).normalize();
    return out.copy(a).applyAxisAngle(axis, angle * k);
  }
  const s = Math.sin(angle);
  return out.copy(a).multiplyScalar(Math.sin((1 - k) * angle) / s).addScaledVector(b, Math.sin(k * angle) / s);
}

/**
 * Interpolates two poses. The distance to the target is interpolated in its
 * logarithm, so each second covers the same ratio of zoom; the look target runs
 * ahead on a harder ease so the destination is centred before arrival; the
 * direction is a slerp.
 */
export function blend(ctx: MenuCtx, a: Pose, b: Pose, k: number, kt: number, out: Pose): void {
  out.target.lerpVectors(a.target, b.target, kt);
  fromDir.subVectors(a.eye, a.target);
  const la = Math.max(1, fromDir.length());
  fromDir.divideScalar(la);
  toDir.subVectors(b.eye, b.target);
  const lb = Math.max(1, toDir.length());
  toDir.divideScalar(lb);
  slerp(ctx, fromDir, toDir, k, dir);
  const length = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * k);
  out.eye.copy(out.target).addScaledVector(dir, length);
  out.up.lerpVectors(a.up, b.up, k).normalize();
}

export function flyTo(ctx: MenuCtx, to: Pose, done: () => void, seconds?: number): void {
  const { calm, deps, pose } = ctx;
  const from = copyPose(pose, makePose());
  const zoom = Math.abs(Math.log(to.eye.distanceTo(to.target) / Math.max(1, from.eye.distanceTo(from.target))));
  const travel = from.target.distanceTo(to.target) / R;
  let duration = seconds ?? Math.min(3.2, Math.max(1.05, 1 + 0.28 * zoom + 0.012 * travel));
  if (calm.matches) {
    // A flight of no length lands on the next frame, under the dip.
    duration = 0;
    dip(ctx);
  }
  ctx.flight = { from, to: copyPose(to, makePose()), began: performance.now(), duration: duration * 1000, done };
  // A flight that changes the height by more than about a third is a dive;
  // a pan across a continent at one height is not.
  const climb = Math.log(Math.max(1, to.eye.distanceTo(to.target)) / Math.max(1, from.eye.distanceTo(from.target)));
  if (duration > 0 && Math.abs(climb) > 0.3) deps.sound?.dive(climb < 0 ? 'in' : 'out', duration);
  refreshChrome(ctx);
}

export function openingShot(ctx: MenuCtx): void {
  const { camera, orrery, pose, renderer, scratch, sys, sysWant, time } = ctx;
  orrery.update(time(), camera, renderer.domElement.clientHeight, 0);

  const earthFromSun = scratch.subVectors(orrery.earth.position, orrery.sun.position);
  sys.azimuth = sysWant.azimuth = inPlane(ctx, earthFromSun) + SYSTEM_AZIMUTH;
  sys.distance = sysWant.distance = frameSystem(ctx, sys);
  // The shot arrives rather than appearing: the first frame is from half as far out again.
  const opening = systemPose(ctx, { ...sys, distance: sys.distance * 1.7, elevation: sys.elevation + 12 * DEG }, makePose());
  copyPose(opening, pose);
  applyPose(ctx, pose);
  flyTo(ctx, systemPose(ctx, sys, makePose()), () => refreshChrome(ctx), 2.4);
}
