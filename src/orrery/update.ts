/** The per-frame update and the handedness witness. */
import * as THREE from 'three';
import { DEG, HOLD_SECONDS, NEAR_EARTH } from './constants.ts';
import type { OrreryCtx } from './ctx.ts';
import { fade } from './materials.ts';
import { place } from './placement.ts';

export function updateOrrery(ctx: OrreryCtx, time: Date, camera: THREE.PerspectiveCamera, screenHeight: number, dt: number): void {
  const { basis, built, cream, earth, glow, glowMaterial, gold, heldTurn, holdFrom, star, sunEntry, sunMat, sunMesh, upright } = ctx;
  place(ctx, time);
  if (basis.determinant() <= 0) {
    // A reflection here is the mirror this project has shipped three times,
    // and it would render: the rings would go the other way round and the
    // Sun would sit in the wrong half of the sky. Say so rather than draw it.
    console.warn('orrery: the ecliptic basis is a reflection', basis.determinant());
  }
  upright.setFromRotationMatrix(basis).invert();
  for (const b of built) {
    if (b.covered === true) {
      b.pivot!.quaternion.copy(upright);
      b.mesh!.rotation.set(0, 0, 0);
    } else if (b.mesh !== null && b !== ctx.held) b.mesh.rotation.y += b.spin * dt;
  }
  if (ctx.held?.pivot != null && ctx.held.covered !== true) {
    // Upright in the world: the group's own turn undone under it, so the pivot's frame is
    // the world's axes and the mesh's is the body's. Turned there over `HOLD_SECONDS` rather
    // than snapped.
    heldTurn.setFromRotationMatrix(basis).invert();
    ctx.holdK = Math.min(1, ctx.holdK + dt / HOLD_SECONDS);
    const k = ctx.holdK * ctx.holdK * (3 - 2 * ctx.holdK);
    ctx.held.pivot.quaternion.slerpQuaternions(holdFrom, heldTurn, k);
    ctx.held.mesh!.rotation.set(0, ctx.holdSpin * (1 - k), 0);
  }
  // Pixels to world units per unit of range, for a ribbon two pixels wide
  // and three when it is the one being pointed at.
  const perRange = (2 * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, screenHeight);
  // Near Earth the rings are in the way, so they go as the globe fills the frame, and every
  // body but the one the camera was sent to goes with them. A body held up for its globe
  // stage is Earth for this: the same span, in its own radii.
  const anchor = ctx.held?.entry ?? earth;
  const nearEarth = THREE.MathUtils.smoothstep(
    camera.position.distanceTo(anchor.position),
    NEAR_EARTH[0] * anchor.radius,
    NEAR_EARTH[1] * anchor.radius,
  );
  for (const b of built) {
    const hot = b.entry.body.id === ctx.highlighted;
    b.ringMaterial.uniforms.uWidth.value = perRange * (hot ? 1.6 : 1);
    b.ringMaterial.uniforms.uColor.value.copy(hot ? gold : cream);
    b.ringMaterial.uniforms.uAlpha.value = (hot ? 0.95 : 0.26) * nearEarth;
    b.ring.visible = nearEarth > 0.01;
    if (b.material === null || b.pivot === null) continue;
    const opacity = b.entry.body.id === ctx.focused || b === ctx.held ? 1 : nearEarth;
    b.entry.opacity = opacity;
    fade(b.material, opacity);
    b.pivot.visible = opacity > 0.01;
  }
  const sunOpacity = star.id === ctx.focused ? 1 : nearEarth;
  sunEntry.opacity = sunOpacity;
  fade(sunMat, sunOpacity);
  glowMaterial.opacity = sunOpacity;
  sunMesh.visible = glow.visible = sunOpacity > 0.01;
}

export function verifyOrrery(ctx: OrreryCtx, sunDirection: THREE.Vector3): Record<string, number | boolean> {
  const { basis, ex, ey, ez, sunWorld } = ctx;
  const placed = sunWorld.clone().normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, placed.dot(sunDirection)))) / DEG;
  const handed = new THREE.Vector3().crossVectors(ex, ey).dot(ez);
  return {
    'sun here vs sun.ts, degrees': Number(angle.toFixed(3)),
    'ecliptic x . y': Number(ex.dot(ey).toFixed(6)),
    '(x cross y) . z': Number(handed.toFixed(6)),
    'basis determinant': Number(basis.determinant().toFixed(6)),
    // The Sun lies in the ecliptic by definition, so its distance from the
    // plane is the whole error of the frame in one number.
    'sun . ecliptic pole': Number(sunDirection.dot(ez).toFixed(5)),
    agrees: angle < 0.5 && handed > 0.999,
  };
}
