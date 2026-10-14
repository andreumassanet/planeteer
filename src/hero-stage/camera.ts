/** The stage camera: the framing it eases towards, its place for a frame, and the head turned to the pointer. */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { HeroCtx } from './ctx.ts';
import type { Scene } from './scene.ts';
import { BOB, HEAD_DOWN, HEAD_UP, HEAD_YAW, LEAVE, ROLL, type Shot, SHOTS, TAN } from './shots.ts';

/** The framing the camera is easing towards: the shot, pulled by the wheel. */
export function target(ctx: HeroCtx): Shot {
  const base = SHOTS[ctx.current];
  if (ctx.zoom === 0) return base;
  const towards = ctx.zoom > 0 ? SHOTS.head : SHOTS.full;
  const t = Math.abs(ctx.zoom);
  return {
    aim: THREE.MathUtils.lerp(base.aim, towards.aim, t),
    fill: THREE.MathUtils.lerp(base.fill, towards.fill, t),
    width: THREE.MathUtils.lerp(base.width, towards.width, t),
    elev: THREE.MathUtils.lerp(base.elev, towards.elev, t),
    yaw: base.yaw,
  };
}

export function placeCamera(ctx: HeroCtx, s: Scene, width: number, height: number): void {
  const { calm, drawnInsets, drawnShot, root, scratch } = ctx;
  const inset = drawnInsets;
  const freeWidth = Math.max(120, width - inset.left - inset.right);
  const freeHeight = Math.max(120, height - inset.top - inset.bottom);
  const H = AVATAR_HEIGHT;
  const distance =
    Math.max((drawnShot.fill * H * height) / (freeHeight * TAN), (drawnShot.width * H * height) / (freeWidth * TAN)) * ctx.intro;
  const aim = drawnShot.aim * H;
  s.camera.position.set(0, aim + distance * drawnShot.elev, distance);
  scratch.aim.set(0, aim, 0);
  let roll = 0;
  if (ctx.leaving !== null) {
    // Over the shoulder and out through the bay: a curve bent towards `via`, eased in and out.
    const t = Math.min(1, (ctx.clock - ctx.leaving.at) / LEAVE);
    const e = t * t * (3 - 2 * t);
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    s.camera.position.set(
      ctx.leaving.from.x * a + ctx.leaving.via.x * b + ctx.leaving.out.x * c,
      ctx.leaving.from.y * a + ctx.leaving.via.y * b + ctx.leaving.out.y * c,
      ctx.leaving.from.z * a + ctx.leaving.via.z * b + ctx.leaving.out.z * c,
    );
    scratch.aim.lerpVectors(ctx.leaving.aim, ctx.leaving.look, Math.min(1, e * 1.4));
  } else if (ctx.backdropKind === 'bridge' && ctx.bridge !== null && !calm.matches) {
    // The ship idles: a slow bob and a slower roll, half as much while the creator frames a detail.
    const amount = ctx.behaviour === 'title' ? 1 : 0.5;
    s.camera.position.y += Math.sin(ctx.clock * 0.47) * BOB * amount;
    s.camera.position.x += Math.sin(ctx.clock * 0.29 + 1.3) * BOB * 0.6 * amount;
    roll = Math.sin(ctx.clock * 0.31) * ROLL * amount;
  }
  s.camera.lookAt(scratch.aim);
  if (roll !== 0) s.camera.rotateZ(roll);
  s.camera.aspect = width / height;
  // The lens shifted, not turned, to centre the figure in what the cards leave.
  const centreX = inset.left + freeWidth / 2;
  const centreY = inset.top + freeHeight / 2;
  s.camera.setViewOffset(width, height, width / 2 - centreX, height / 2 - centreY, width, height);
  s.camera.updateProjectionMatrix();
  s.camera.updateMatrixWorld();
  root.style.setProperty('--hs-x', `${((centreX / width) * 100).toFixed(1)}%`);
}

/** The head turned towards the pointer, after the clip has posed it. */
export function aimHead(ctx: HeroCtx, s: Scene, dt: number): void {
  const { calm, pointer, scratch } = ctx;
  const person = s.person;
  const head = person?.bones.get('Head');
  if (person === null || head === undefined || head.parent === null) return;
  person.root.updateMatrixWorld(true);
  head.getWorldPosition(scratch.head);
  let yawWanted = 0;
  let pitchWanted = 0;
  if (pointer.inside && ctx.dragging === null && !calm.matches) {
    scratch.ndc.set(pointer.x * 2 - 1, -(pointer.y * 2 - 1));
    scratch.ray.setFromCamera(scratch.ndc, s.camera);
    const reach = s.camera.position.distanceTo(scratch.head) * 0.6;
    scratch.ray.ray.at(reach, scratch.target).sub(scratch.head);
    const relative = Math.atan2(scratch.target.x, scratch.target.z) - s.turntable.rotation.y;
    const wrapped = Math.atan2(Math.sin(relative), Math.cos(relative));
    // Nobody looks over their own shoulder at a pointer behind them.
    const weight = 1 - THREE.MathUtils.smoothstep(Math.abs(wrapped), 1.3, 2);
    yawWanted = THREE.MathUtils.clamp(wrapped, -HEAD_YAW, HEAD_YAW) * weight;
    const up = Math.atan2(scratch.target.y, Math.hypot(scratch.target.x, scratch.target.z));
    pitchWanted = THREE.MathUtils.clamp(up, -HEAD_DOWN, HEAD_UP) * weight;
  }
  const k = 1 - Math.exp(-dt / 0.22);
  ctx.headYaw += (yawWanted - ctx.headYaw) * k;
  ctx.headPitch += (pitchWanted - ctx.headPitch) * k;
  if (Math.abs(ctx.headYaw) < 1e-4 && Math.abs(ctx.headPitch) < 1e-4) return;
  const turnY = s.turntable.rotation.y;
  scratch.yaw.setFromAxisAngle(scratch.up, ctx.headYaw);
  // Looking up is a turn back about the body's own right-hand axis.
  scratch.axis.set(Math.cos(turnY + ctx.headYaw), 0, -Math.sin(turnY + ctx.headYaw));
  scratch.pitch.setFromAxisAngle(scratch.axis, -ctx.headPitch);
  scratch.yaw.premultiply(scratch.pitch);
  head.parent.getWorldQuaternion(scratch.parent);
  scratch.parentInverse.copy(scratch.parent).invert();
  // local' = parent⁻¹ · turn · parent · local
  head.quaternion.premultiply(scratch.parent).premultiply(scratch.yaw).premultiply(scratch.parentInverse);
}
